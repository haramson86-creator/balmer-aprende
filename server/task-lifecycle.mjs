import {HttpError,lessonQualityIssue} from './practice.mjs';
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
export async function taskLifecycle(db,owner,path,method,body,actorId){
 const match=path.match(/^\/api\/(materials|lessons)\/([a-zA-Z0-9-]+)\/lifecycle$/);if(!match||method!=='PATCH')return null;
 const [,table,id]=match;const record=await db.prepare(`SELECT * FROM ${table} WHERE id=? AND owner=?`).bind(id,owner).first();check(record,404,'Contenido no encontrado.');
 check(['archive','restore','repeat','rename'].includes(body.action),400,'Acción no válida.');
 if(table==='lessons'&&['restore','repeat'].includes(body.action))check(!JSON.parse(record.content).supersededBy,409,'Este ejercicio fue sustituido por un nuevo análisis. Revisa y confirma los nuevos borradores.');
 const stamp=new Date().toISOString();let entity=id;
 if(body.action==='rename'){check(table==='materials'&&typeof body.name==='string'&&body.name.trim().length>0&&body.name.trim().length<=70,400,'Escribe un título de hasta 70 caracteres.');await db.prepare('UPDATE materials SET name=? WHERE id=? AND owner=?').bind(body.name.trim(),id,owner).run();}
 else if(body.action==='repeat'){
  check(!lessonQualityIssue(JSON.parse(record.content||'{}')),409,'Corrige la respuesta antes de repetir esta práctica.');
  check(table==='lessons'&&record.status==='approved',409,'Revisa y aprueba primero el ejercicio.');
  check(await db.prepare('SELECT id FROM profiles WHERE owner=? AND id=?').bind(owner,body.childId).first(),404,'Niño no encontrado.');
  check(await db.prepare('SELECT id FROM materials WHERE id=? AND owner=? AND archived_at IS NULL').bind(record.material_id,owner).first(),409,'Reactiva primero la foto de la biblioteca.');
  check(Number.isInteger(body.revision)&&body.revision===record.revision,409,'El ejercicio cambió. Actualiza la biblioteca.');
  check(typeof body.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(body.id),400,'Identificador no válido.');entity=body.id;
  const r=await db.prepare("INSERT INTO lessons(id,owner,material_id,generation_id,status,child_id,content,revision,created_at,approved_at) SELECT ?,owner,material_id,generation_id,'approved',?,content,1,?,? FROM lessons WHERE id=? AND owner=? AND revision=? AND status='approved' ON CONFLICT(id) DO NOTHING").bind(entity,body.childId,stamp,stamp,id,owner,body.revision).run();check(r.meta.changes===1,409,'Esta práctica ya se creó o el ejercicio cambió.');
 }else await db.prepare(`UPDATE ${table} SET archived_at=? WHERE id=? AND owner=?`).bind(body.action==='archive'?stamp:null,id,owner).run();
 await db.prepare('INSERT INTO audit(id,owner,action,entity_id,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),owner,`${table}.${body.action}:${actorId}`,entity,stamp).run();return Response.json({ok:true,id:entity},{headers:{'Cache-Control':'no-store'}});
}
