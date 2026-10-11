import {hash,limit} from './auth.mjs';
import {HttpError} from './practice.mjs';
const now=()=>new Date().toISOString();
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function familyContext(db,user){
 const families=await all(db,'SELECT owner,name FROM families WHERE owner=? OR owner IN (SELECT owner FROM family_members WHERE user_id=?) ORDER BY created_at',user.userId,user.userId);
 const pref=await first(db,'SELECT owner FROM family_preferences WHERE user_id=?',user.userId);
 const owner=families.find(f=>f.owner===pref?.owner)?.owner||families.find(f=>f.owner===user.userId)?.owner||families[0]?.owner||user.userId;
 return {owner,userId:user.userId,isFamilyOwner:owner===user.userId,families:families.map(f=>({id:f.owner,name:f.name,isOwner:f.owner===user.userId}))};
}
export async function familyRoute(request,db,actor,path,body){
 const {owner,userId,isFamilyOwner,email}=actor;
 const log=(action,entity)=>db.prepare('INSERT INTO audit(id,owner,action,entity_id,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),owner,action+':'+userId,entity,now());
 const method=request.method;
 if(path==='/api/family/select'&&method==='POST'){
  check(actor.families.some(f=>f.id===body.familyId),403,'No tienes acceso a esta familia.');
  await db.prepare('INSERT INTO family_preferences(user_id,owner) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET owner=excluded.owner').bind(userId,body.familyId).run();return reply({ok:true});
 }
 if(path==='/api/family/invitations/accept'&&method==='POST'){
  await limit(db,'family-accept:'+userId,10,600);
  check(typeof body.code==='string'&&/^[a-f0-9]{32}$/.test(body.code.trim().toLowerCase()),400,'Introduce el código privado de invitación.');
  const tokenHash=await hash(body.code.trim().toLowerCase());
  const invite=await first(db,'SELECT i.owner,i.email,f.name FROM family_invites i JOIN families f ON f.owner=i.owner WHERE token_hash=? AND expires_at>?',tokenHash,now());
  check(invite&&invite.email===email?.toLowerCase(),403,'Invitación incorrecta, caducada o destinada a otra cuenta de ChatGPT.');check(invite.owner!==userId,409,'Ya administras esta familia.');
  await db.batch([db.prepare('INSERT INTO family_members(owner,user_id,email,created_at) SELECT owner,?,?,? FROM family_invites WHERE token_hash=? AND expires_at>? ON CONFLICT(owner,user_id) DO NOTHING').bind(userId,email.toLowerCase(),now(),tokenHash,now()),db.prepare('DELETE FROM family_invites WHERE token_hash=?').bind(tokenHash)]);
  check(await first(db,'SELECT owner FROM family_members WHERE owner=? AND user_id=?',invite.owner,userId),409,'La invitación ya se utilizó.');
  await db.prepare('INSERT INTO family_preferences(user_id,owner) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET owner=excluded.owner').bind(userId,invite.owner).run();
  await db.prepare('INSERT INTO audit(id,owner,action,entity_id,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),invite.owner,'parent.joined:'+userId,userId,now()).run();return reply({ok:true,name:invite.name});
 }
 if(path==='/api/family/invitations'&&method==='POST'){
  check(isFamilyOwner,403,'Solo quien creó la familia puede invitar a otros padres.');check(await first(db,'SELECT owner FROM families WHERE owner=?',owner),409,'Crea primero tu familia.');
  const target=typeof body.email==='string'?body.email.trim().toLowerCase():'';check(target.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target),400,'Escribe el correo de su cuenta de ChatGPT.');check(target!==email?.toLowerCase(),409,'No necesitas invitarte a ti mismo.');
  await limit(db,'family-invite:'+owner,20,86400);
  check(!(await first(db,'SELECT user_id FROM family_members WHERE owner=? AND email=?',owner,target)),409,'Este padre ya pertenece a tu familia.');
  const code=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),expiresAt=new Date(Date.now()+7*86400000).toISOString();
  await db.batch([db.prepare('DELETE FROM family_invites WHERE owner=? AND email=?').bind(owner,target),db.prepare('INSERT INTO family_invites(token_hash,owner,email,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await hash(code),owner,target,expiresAt,now()),log('parent.invited',target)]);
  return reply({code,email:target,expiresAt},201);
 }
 if(path==='/api/family/invitations'&&method==='DELETE'){
  check(isFamilyOwner,403,'Solo quien creó la familia puede retirar invitaciones.');await db.batch([db.prepare('DELETE FROM family_invites WHERE owner=? AND email=?').bind(owner,body.email),log('parent.invitation.revoked',String(body.email))]);return reply({ok:true});
 }
 if(path==='/api/family/members'&&method==='DELETE'){
  check(isFamilyOwner||body.userId===userId,403,'Solo quien creó la familia puede retirar a otros padres.');check(body.userId!==owner,403,'El administrador principal no puede retirarse de su familia.');
  await db.batch([db.prepare('DELETE FROM family_members WHERE owner=? AND user_id=?').bind(owner,body.userId),db.prepare('DELETE FROM family_preferences WHERE user_id=? AND owner=?').bind(body.userId,owner),log('parent.removed',String(body.userId))]);return reply({ok:true});
 }
 const profile=path.match(/^\/api\/profiles\/([a-zA-Z0-9-]+)$/);
 if(profile&&['PATCH','DELETE'].includes(method)){
  const child=await first(db,'SELECT id,name FROM profiles WHERE id=? AND owner=?',profile[1],owner);check(child,404,'Niño no encontrado.');
  if(method==='PATCH'){check(typeof body.name==='string'&&body.name.trim().length>0&&body.name.trim().length<=40,400,'Escribe un nombre de hasta 40 caracteres.');await db.batch([db.prepare('UPDATE profiles SET name=? WHERE id=? AND owner=?').bind(body.name.trim(),child.id,owner),log('profile.renamed',child.id)]);}
  else{check(body.confirmName===child.name,400,'Escribe el nombre exacto del niño para confirmar.');await db.batch([db.prepare("UPDATE lessons SET child_id=NULL,status='draft',approved_at=NULL,revision=revision+1 WHERE owner=? AND child_id=?").bind(owner,child.id),...['attempts','child_codes','child_sessions'].map(t=>db.prepare('DELETE FROM '+t+' WHERE owner=? AND child_id=?').bind(owner,child.id)),db.prepare('DELETE FROM profiles WHERE owner=? AND id=?').bind(owner,child.id),log('profile.deleted',child.id)]);}
  return reply({ok:true});
 }
 const task=path.match(/^\/api\/lessons\/([a-zA-Z0-9-]+)\/assignment$/);
 if(task&&method==='PATCH'){
  check(await first(db,'SELECT id FROM profiles WHERE owner=? AND id=?',owner,body.childId),404,'Niño no encontrado.');
  if(body.copy===true){
   check(typeof body.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(body.id),400,'Identificador de tarea no válido.');
   const source=await first(db,"SELECT child_id FROM lessons WHERE owner=? AND id=? AND revision=? AND status='approved'",owner,task[1],body.revision);check(source,409,'La tarea cambió. Actualiza y vuelve a asignarla.');check(source.child_id!==body.childId,409,'Este niño ya tiene esta tarea.');
   const inserted=await db.prepare("INSERT INTO lessons(id,owner,material_id,generation_id,status,child_id,content,revision,created_at,approved_at) SELECT ?,owner,material_id,generation_id,status,?,content,1,?,? FROM lessons WHERE owner=? AND id=? AND revision=? AND status='approved' ON CONFLICT(id) DO NOTHING").bind(body.id,body.childId,now(),now(),owner,task[1],body.revision).run();
   check(inserted.meta.changes===1,409,'La tarea cambió o esta asignación ya se guardó.');await log('practice.copied',body.id).run();return reply({ok:true});
  }
  const update=await db.prepare("UPDATE lessons SET child_id=?,revision=revision+1 WHERE owner=? AND id=? AND revision=? AND status='approved'").bind(body.childId,owner,task[1],body.revision).run();check(update.meta.changes===1,409,'La tarea cambió. Actualiza y vuelve a asignarla.');await log('practice.reassigned',task[1]).run();return reply({ok:true});
 }
 return null;
}
