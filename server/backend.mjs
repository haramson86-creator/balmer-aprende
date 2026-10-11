import {ensureLessonAudio,prepareAudioBatch,serveLessonAudio} from './lesson-audio.mjs';
import {taskLifecycle} from './task-lifecycle.mjs';
import {authRoute,createChildCode,parentStatus,initialPin,rememberedParent} from './auth.mjs';
import {nativeAuth,nativeUser} from './native-auth.mjs';
import {familyContext,familyRoute} from './family.mjs';
import {HttpError,validateLesson,validateImage,generatePractices} from './practice.mjs';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value instanceof ArrayBuffer?value:new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
const row=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const audit=(db,owner,action,entity)=>db.prepare('INSERT INTO audit(id,owner,action,entity_id,created_at) VALUES(?,?,?,?,?)').bind(id(),owner,action,entity,now());
async function limitedBody(request,max=7*1024*1024){
  check(Number(request.headers.get('content-length')||0)<=max,413,'El archivo es demasiado grande.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new HttpError(413,'El archivo es demasiado grande.')}chunks.push(value)}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return bytes;
}
async function bodyJSON(request){try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,16000)))}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Solicitud no válida.');}}
function viewLesson(r){return {...JSON.parse(r.content),audio:`/api/lessons/${r.id}/audio`,audioReady:!!JSON.parse(r.content).audioHash,id:r.id,status:r.status,revision:r.revision,sourceId:r.material_id,archived:!!(r.archived_at||r.photo_archived_at),assignedTo:r.child_id?[r.child_id]:[],approvedAt:r.approved_at,cloud:true,color:'peach',art:'Aa',tag:r.status==='approved'?'Tarea revisada':'Borrador de IA'};}
async function actorFor(request,env,user){
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_child=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(token){const session=await row(env.DB,'SELECT * FROM child_sessions WHERE token_hash=? AND expires_at>?',await sha(token),now());check(session,401,'El acceso del niño caducó. Pide un enlace nuevo.');return {owner:session.owner,role:'child',childId:session.child_id};}
  return user?.userId?{...await familyContext(env.DB,user),email:user.email||null,role:'parent',...await parentStatus(request,env.DB,user.userId),initialPinReady:!!initialPin(env,user)}:null;
}
const cookie=(request,token,age)=>`aprende_child=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export async function handleAPI(request,env,user,{fetcher=fetch}={}){
  try{
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method;
    if(!['GET','HEAD'].includes(method)){check(request.headers.get('x-aprende-request')==='1',403,'Solicitud no autorizada.');check(request.headers.get('origin')===url.origin,403,'Origen no permitido.');}
    check(env.DB,503,'La base de datos aún no está configurada.');
    if(path==='/api/child/redeem'&&method==='POST'){
      const {token}=await bodyJSON(request);check(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),400,'Enlace no válido.');
      const session=await row(env.DB,'SELECT child_id FROM child_sessions WHERE token_hash=? AND expires_at>?',await sha(token),now());check(session,401,'Enlace caducado o retirado.');return json({ok:true},200,{'Set-Cookie':cookie(request,token,7*86400)});
    }
    if(path==='/api/child/exit'&&method==='POST')return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});
    const hostedUser=user;
    user=await nativeUser(request,env.DB)||user||await rememberedParent(request,env.DB);
    if(path.startsWith('/api/auth/')&&method==='POST'){const body=await bodyJSON(request);const native=await nativeAuth(request,env,hostedUser,path,body);if(native)return native;const response=await authRoute(request,env,user,path,body,{fetcher});if(response)return response;}
    const actor=await actorFor(request,env,user);
    if(path==='/api/session'&&method==='GET'){
      if(!actor)return json({authenticated:false,aiReady:!!env.OPENAI_API_KEY,signIn:'/signin-with-chatgpt?return_to=%2F'});
      if(actor.role==='parent'&&!actor.unlocked)return json({authenticated:false,role:'parent',needsParentPin:true,pinConfigured:actor.pinConfigured||actor.initialPinReady,parentEmail:actor.email,profiles:[],family:null,aiReady:!!env.OPENAI_API_KEY});
      const profiles=await rows(env.DB,actor.role==='child'?'SELECT id,name FROM profiles WHERE owner=? AND id=?':'SELECT id,name FROM profiles WHERE owner=? ORDER BY created_at',...actor.role==='child'?[actor.owner,actor.childId]:[actor.owner]);
      const family=actor.role==='parent'?await row(env.DB,'SELECT name FROM families WHERE owner=?',actor.owner):null;
      return json({authenticated:true,role:actor.role,profiles,family:family?{...family,id:actor.owner,isOwner:actor.isFamilyOwner}:null,families:actor.families||[],parentId:actor.userId||null,needsParentPin:false,parentEmail:actor.role==='parent'?actor.email:null,aiReady:!!env.OPENAI_API_KEY});
    }
    check(actor,401,'Inicia sesión para guardar prácticas en tu familia.');
    const {owner,role,childId}=actor;
    const log=(action,entity)=>audit(env.DB,owner,action+':'+(actor.userId||owner),entity);
    check(role!=='parent'||actor.unlocked,403,'Introduce tu código para entrar como padre.');
    if(path==='/api/state'&&method==='GET'){
      if(role==='parent')await cleanupPhotos(env,owner);
      if(role==='child'){const lessons=await rows(env.DB,"SELECT l.* FROM lessons l JOIN materials m ON m.id=l.material_id AND m.owner=l.owner WHERE l.owner=? AND l.child_id=? AND l.status='approved' AND l.archived_at IS NULL AND m.archived_at IS NULL ORDER BY l.created_at DESC",owner,childId);const attempts=await rows(env.DB,'SELECT payload FROM attempts WHERE owner=? AND child_id=? ORDER BY created_at DESC LIMIT 1000',owner,childId);return json({materials:[],drafts:[],lessons:lessons.map(viewLesson),attempts:attempts.map(a=>JSON.parse(a.payload))});}
      const [materials,lessons,attempts]=await Promise.all([rows(env.DB,"SELECT id,name,mime,bytes,created_at,archived_at,COALESCE((SELECT status FROM generations g WHERE g.material_id=materials.id AND g.owner=materials.owner ORDER BY g.created_at DESC LIMIT 1),'uploaded') AS analysisStatus FROM materials WHERE owner=? ORDER BY created_at DESC LIMIT 100",owner),rows(env.DB,'SELECT l.*,m.archived_at AS photo_archived_at FROM lessons l JOIN materials m ON m.id=l.material_id AND m.owner=l.owner WHERE l.owner=? ORDER BY l.created_at DESC LIMIT 500',owner),rows(env.DB,'SELECT payload FROM attempts WHERE owner=? ORDER BY created_at DESC LIMIT 1000',owner)]);
      const [members,invitations]=await Promise.all([rows(env.DB,'SELECT user_id AS id,email,created_at FROM family_members WHERE owner=? ORDER BY created_at',owner),actor.isFamilyOwner?rows(env.DB,'SELECT email,expires_at FROM family_invites WHERE owner=? AND expires_at>?',owner,now()):Promise.resolve([])]);
      const principal=await row(env.DB,'SELECT email FROM parent_access_sessions WHERE owner=? AND email IS NOT NULL ORDER BY created_at DESC LIMIT 1',owner);
      const read=await rows(env.DB,'SELECT attempt_id FROM notification_reads WHERE user_id=?',actor.userId);const seen=new Set(read.map(r=>r.attempt_id));
      return json({notifications:attempts.map(a=>({...JSON.parse(a.payload),read:seen.has(JSON.parse(a.payload).id)})),members:[{id:owner,email:principal?.email||'Administrador principal',isOwner:true},...members.map(m=>({...m,isOwner:false}))],invitations,materials:materials.map(m=>({...m,archived:!!m.archived_at,cloud:true,size:m.bytes,url:`/api/materials/${m.id}`,exerciseCount:lessons.filter(l=>l.material_id===m.id).length})),libraryLessons:lessons.map(viewLesson),drafts:lessons.filter(l=>l.status==='draft'&&!l.archived_at&&!l.photo_archived_at).map(viewLesson),lessons:lessons.filter(l=>l.status==='approved'&&!l.archived_at&&!l.photo_archived_at).map(viewLesson),attempts:attempts.map(a=>JSON.parse(a.payload))});
    }
    if(path==='/api/attempts'&&method==='POST'){
      const b=await bodyJSON(request);check(typeof b.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(b.id),400,'Identificador de intento no válido.');
      check(typeof b.childId==='string'&&(role==='parent'||b.childId===childId),403,'Perfil no autorizado.');
      const lesson=await row(env.DB,"SELECT l.* FROM lessons l JOIN materials m ON m.id=l.material_id AND m.owner=l.owner WHERE l.id=? AND l.owner=? AND l.child_id=? AND l.status='approved' AND l.archived_at IS NULL AND m.archived_at IS NULL",b.activityId,owner,b.childId);check(lesson,404,'Práctica no asignada a este perfil.');
      check(b.activityRevision===lesson.revision,409,'La práctica cambió. Actualiza antes de continuar.');
      const content=JSON.parse(lesson.content);check(content.options.includes(b.answer),400,'Respuesta no válida.');
      const previous=await row(env.DB,'SELECT owner,child_id,lesson_id,payload FROM attempts WHERE id=?',b.id);if(previous){check(previous.owner===owner&&previous.child_id===b.childId&&previous.lesson_id===lesson.id&&JSON.parse(previous.payload).answer===b.answer,409,'El identificador del intento ya se usó.');return json({attempt:JSON.parse(previous.payload),acknowledged:true});}
      const attempt={id:b.id,childId:b.childId,activityId:lesson.id,title:content.title,activityRevision:lesson.revision,answer:b.answer,score:b.answer===content.answer?10:0,mode:'recognition',experimental:false,evaluationStatus:'scored',visibleDurationMs:Math.max(0,Math.min(Number(b.visibleDurationMs)||0,86400000)),createdAt:now(),syncStatus:'synced',cloud:true};
      await run(env.DB,'INSERT INTO attempts(id,owner,child_id,lesson_id,payload,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',b.id,owner,b.childId,lesson.id,JSON.stringify(attempt),attempt.createdAt);
      const saved=await row(env.DB,'SELECT owner,child_id,lesson_id,payload FROM attempts WHERE id=?',b.id);check(saved?.owner===owner&&saved.child_id===b.childId&&saved.lesson_id===lesson.id&&JSON.parse(saved.payload).answer===b.answer,409,'Intento en conflicto.');return json({attempt:JSON.parse(saved.payload),acknowledged:true});
    }
    const audioMatch=path.match(/^\/api\/lessons\/([a-zA-Z0-9-]+)\/audio$/);
    if(audioMatch&&['GET','POST'].includes(method)){
      const lesson=await row(env.DB,'SELECT l.* FROM lessons l JOIN materials m ON m.id=l.material_id AND m.owner=l.owner WHERE l.id=? AND l.owner=?'+(role==='child'?" AND l.child_id=? AND l.status='approved' AND l.archived_at IS NULL AND m.archived_at IS NULL":''),audioMatch[1],owner,...(role==='child'?[childId]:[]));check(lesson,404,'Práctica no disponible para este perfil.');const content=JSON.parse(lesson.content);
      if(method==='GET')return await serveLessonAudio(request,env,owner,content);
      const hash=await ensureLessonAudio(env,owner,content,fetcher);content.audioHash=hash;await run(env.DB,'UPDATE lessons SET content=? WHERE id=? AND owner=? AND revision=? AND content=?',JSON.stringify(content),lesson.id,owner,lesson.revision,lesson.content);return json({audio:`/api/lessons/${lesson.id}/audio`,audioReady:true});
    }
    check(role==='parent',403,'Esta acción solo está disponible para los padres.');
    if(!['GET','HEAD'].includes(method)&&(/^\/api\/family\/(select|invitations|members)/.test(path)||/^\/api\/profiles\//.test(path)||/\/assignment$/.test(path))){const response=await familyRoute(request,env.DB,actor,path,await bodyJSON(request));if(response)return response;}
    if(path==='/api/family'&&method==='DELETE'){
      check(actor.isFamilyOwner,403,'Solo quien creó la familia puede eliminarla.');
      const {confirmName}=await bodyJSON(request),family=await row(env.DB,'SELECT name FROM families WHERE owner=?',owner);check(family,404,'Familia no encontrada.');check(confirmName===family.name,400,'Escribe exactamente el nombre de la familia para eliminarla.');
      const statements=[env.DB.prepare('DELETE FROM notification_reads WHERE attempt_id IN (SELECT id FROM attempts WHERE owner=?)').bind(owner),env.DB.prepare('INSERT OR IGNORE INTO deletion_queue(object_key,owner,created_at) SELECT object_key,owner,? FROM materials WHERE owner=?').bind(now(),owner)];
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO deletion_queue(object_key,owner,created_at) SELECT object_key,owner,? FROM lesson_audio WHERE owner=?').bind(now(),owner));
      for(const table of ['attempts','lessons','lesson_audio','generations','materials','child_sessions','child_codes','profiles','audit','family_members','family_invites','family_preferences','families'])statements.push(env.DB.prepare('DELETE FROM '+table+' WHERE owner=?').bind(owner));
      await env.DB.batch(statements);await cleanupPhotos(env,owner);const pending=await row(env.DB,'SELECT count(*) AS n FROM deletion_queue WHERE owner=?',owner);return json({ok:true,pendingPhotos:pending.n});
    }
    if(path==='/api/family'&&method==='PUT'){
      check(actor.isFamilyOwner,403,'Solo quien creó la familia puede cambiar su nombre.');
      const {name}=await bodyJSON(request);check(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=60,400,'Escribe el nombre de tu familia (hasta 60 caracteres).');
      await env.DB.batch([env.DB.prepare('INSERT INTO families(owner,name,created_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name').bind(owner,name.trim(),now()),log('family.saved',owner)]);return json({name:name.trim()});
    }
    if(path==='/api/profiles'&&method==='POST'){
      const {name}=await bodyJSON(request);check(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=40,400,'Escribe un apodo de hasta 40 caracteres.');
      const count=await row(env.DB,'SELECT count(*) AS n FROM profiles WHERE owner=?',owner);check(count.n<10,409,'Puedes crear hasta 10 perfiles.');const profile={id:id(),name:name.trim()};await env.DB.batch([env.DB.prepare('INSERT INTO profiles(id,owner,name,created_at) VALUES(?,?,?,?)').bind(profile.id,owner,profile.name,now()),log('profile.created',profile.id)]);return json({...profile,...await createChildCode(env.DB,owner,profile.id)},201);
    }
    if(path==='/api/child/codes'&&method==='POST'){
      const {childId}=await bodyJSON(request);check(await row(env.DB,'SELECT id FROM profiles WHERE id=? AND owner=?',childId,owner),404,'Perfil no encontrado.');return json(await createChildCode(env.DB,owner,childId),201);
    }
    if(path==='/api/child/links'&&method==='POST'){
      const {childId}=await bodyJSON(request);check(await row(env.DB,'SELECT id FROM profiles WHERE id=? AND owner=?',childId,owner),404,'Perfil no encontrado.');
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expires=new Date(Date.now()+7*86400000).toISOString();
      await env.DB.batch([env.DB.prepare('DELETE FROM child_sessions WHERE owner=? AND child_id=?').bind(owner,childId),env.DB.prepare('INSERT INTO child_sessions(token_hash,owner,child_id,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await sha(token),owner,childId,expires,now()),log('child.link.created',childId)]);return json({url:`${url.origin}/#child=${token}`,expiresAt:expires},201);
    }
    if(path==='/api/child/links'&&method==='DELETE'){const {childId}=await bodyJSON(request);await env.DB.batch([env.DB.prepare('DELETE FROM child_sessions WHERE owner=? AND child_id=?').bind(owner,childId),env.DB.prepare('DELETE FROM child_codes WHERE owner=? AND child_id=?').bind(owner,childId)]);return json({ok:true});}
    if(path.endsWith('/lifecycle')&&method==='PATCH'){const response=await taskLifecycle(env.DB,owner,path,method,await bodyJSON(request),actor.userId);if(response)return response;}
    if(path==='/api/notifications/read'&&method==='POST'){
      const b=await bodyJSON(request);check(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.length<=100&&b.ids.every(x=>typeof x==='string'),400,'Selecciona las notificaciones.');
      await env.DB.batch(b.ids.map(attemptId=>env.DB.prepare('INSERT INTO notification_reads(user_id,attempt_id,read_at) SELECT ?,id,? FROM attempts WHERE id=? AND owner=? ON CONFLICT(user_id,attempt_id) DO NOTHING').bind(actor.userId,now(),attemptId,owner)));return json({ok:true});
    }
    if(path==='/api/materials'&&method==='POST'){
      check(env.BUCKET,503,'El almacenamiento de fotos aún no está configurado.');
      const bytes=await limitedBody(request),form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(),photo=form.get('photo');
      check(photo&&typeof photo.arrayBuffer==='function',400,'Selecciona una foto.');check(form.get('consent')==='yes',400,'Confirma el envío de la página para generar prácticas.');
      const image=await photo.arrayBuffer();validateImage(image,photo.type);const contentHash=await sha(image);
      let duplicate=await row(env.DB,'SELECT id,name,archived_at FROM materials WHERE owner=? AND content_hash=?',owner,contentHash);
      if(!duplicate){const legacy=await rows(env.DB,'SELECT id,name,object_key,archived_at FROM materials WHERE owner=? AND content_hash IS NULL AND bytes=?',owner,image.byteLength);for(const m of legacy){const old=await env.BUCKET.get(m.object_key);if(old&&await sha(await old.arrayBuffer())===contentHash){await run(env.DB,'UPDATE materials SET content_hash=? WHERE id=? AND owner=?',contentHash,m.id,owner);duplicate=m;break;}}}
      if(duplicate)return json({...duplicate,reused:true,archived:!!duplicate.archived_at,url:'/api/materials/'+duplicate.id});
      const quota=await row(env.DB,'SELECT count(*) AS n FROM materials WHERE owner=?',owner);check(quota.n<100,429,'Tu biblioteca admite hasta 100 fotos. Reutiliza las que ya guardaste.');
      const materialId=id(),key=`${await sha(owner)}/${materialId}`;
      await env.BUCKET.put(key,image,{httpMetadata:{contentType:photo.type}});
      try{await env.DB.batch([env.DB.prepare('INSERT INTO materials(id,owner,name,object_key,mime,bytes,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(materialId,owner,'Página del cuaderno',key,photo.type,image.byteLength,contentHash,now()),log('material.uploaded',materialId)])}catch(error){await env.BUCKET.delete(key);const existing=await row(env.DB,'SELECT id,name,archived_at FROM materials WHERE owner=? AND content_hash=?',owner,contentHash);if(existing)return json({...existing,reused:true,archived:!!existing.archived_at,url:'/api/materials/'+existing.id});throw error;}
      return json({id:materialId,name:'Página del cuaderno',cloud:true,size:image.byteLength,url:`/api/materials/${materialId}`},201);
    }
    const materialMatch=path.match(/^\/api\/materials\/([a-zA-Z0-9-]+)$/);
    if(materialMatch){const m=await row(env.DB,'SELECT * FROM materials WHERE id=? AND owner=?',materialMatch[1],owner);check(m,404,'Foto no encontrada.');
      if(method==='GET'){const object=await env.BUCKET?.get(m.object_key);check(object,404,'La foto no está disponible.');return new Response(object.body,{headers:{'Content-Type':m.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
      if(method==='DELETE'){check(!(await row(env.DB,'SELECT id FROM lessons WHERE material_id=? AND owner=? LIMIT 1',m.id,owner)),409,'Esta foto es la referencia de ejercicios guardados y debe conservarse.');await env.BUCKET?.delete(m.object_key);await env.DB.batch([env.DB.prepare('DELETE FROM materials WHERE id=? AND owner=?').bind(m.id,owner),log('material.deleted',m.id)]);return json({ok:true});}
    }
    if(path==='/api/generations'&&method==='POST'){
      check(env.OPENAI_API_KEY,503,'OpenAI aún no está configurado en el servidor.');
      const b=await bodyJSON(request);check(b.consent===true,400,'Confirma el envío de la foto a OpenAI.');check(typeof b.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(b.id),400,'Identificador no válido.');
      const previous=await row(env.DB,'SELECT * FROM generations WHERE id=?',b.id);
      if(previous){check(previous.owner===owner&&previous.material_id===b.materialId,404,'Solicitud no encontrada.');if(previous.status==='completed')return json({drafts:(await rows(env.DB,'SELECT * FROM lessons WHERE generation_id=? AND owner=?',b.id,owner)).map(viewLesson)});throw new HttpError(409,previous.status==='running'?'La foto ya se está procesando.':'La generación falló. Inicia un nuevo intento.');}
      const material=await row(env.DB,'SELECT * FROM materials WHERE id=? AND owner=?',b.materialId,owner);check(material,404,'Foto no encontrada.');check(!material.archived_at,409,'Reactiva primero la foto de la biblioteca.');
      const existing=await rows(env.DB,'SELECT * FROM lessons WHERE material_id=? AND owner=?',material.id,owner);if(existing.length)return json({reused:true,drafts:existing.filter(l=>l.status==='draft'&&!l.archived_at).map(viewLesson)});
      await run(env.DB,"UPDATE generations SET status='failed' WHERE owner=? AND material_id=? AND status='running' AND created_at<?",owner,material.id,new Date(Date.now()-10*60000).toISOString());
      check(!(await row(env.DB,"SELECT id FROM generations WHERE material_id=? AND owner=? AND status='running'",material.id,owner)),409,'La foto ya se está procesando.');
      const quota=await row(env.DB,'SELECT count(*) AS n FROM generations WHERE owner=? AND created_at>?',owner,new Date(Date.now()-86400000).toISOString());check(quota.n<20,429,'Alcanzaste el límite de 20 generaciones al día.');
      const object=await env.BUCKET?.get(material.object_key);check(object,404,'La foto no está disponible.');
      const inserted=await run(env.DB,"INSERT INTO generations(id,owner,material_id,status,created_at) SELECT ?,?,?,'running',? WHERE NOT EXISTS(SELECT 1 FROM generations WHERE owner=? AND material_id=? AND status='running') AND NOT EXISTS(SELECT 1 FROM lessons WHERE owner=? AND material_id=?) ON CONFLICT(id) DO NOTHING",b.id,owner,material.id,now(),owner,material.id,owner,material.id);check(inserted.meta.changes===1,409,'La foto ya se está procesando.');
      try{
        const exercises=await generatePractices({key:env.OPENAI_API_KEY,model:env.OPENAI_MODEL,image:await object.arrayBuffer(),mime:material.mime,fetcher});
        const drafts=exercises.map(content=>({id:id(),content,createdAt:now()}));
        await env.DB.batch([...drafts.map(d=>env.DB.prepare("INSERT INTO lessons(id,owner,material_id,generation_id,status,content,revision,created_at) VALUES(?,?,?,?,'draft',?,1,?)").bind(d.id,owner,material.id,b.id,JSON.stringify(d.content),d.createdAt)),env.DB.prepare("UPDATE generations SET status='completed' WHERE id=? AND owner=?").bind(b.id,owner),log('practice.generated',b.id)]);
        return json({drafts:drafts.map(d=>viewLesson({id:d.id,content:JSON.stringify(d.content),status:'draft',revision:1,material_id:material.id,child_id:null,approved_at:null}))},201);
      }catch(error){await run(env.DB,"UPDATE generations SET status='failed' WHERE id=? AND owner=?",b.id,owner);throw error;}
    }
    if(path==='/api/lessons/confirm-photo'&&method==='POST'){
      const b=await bodyJSON(request);check(b.reviewed===true,400,'Revisa la foto y confirma el resumen de ejercicios.');
      check(Array.isArray(b.lessons)&&b.lessons.length>0&&b.lessons.length<=50,400,'Selecciona de 1 a 50 ejercicios para confirmar.');
      check(await row(env.DB,'SELECT id FROM materials WHERE id=? AND owner=? AND archived_at IS NULL',b.materialId,owner),404,'Foto no encontrada o archivada.');
      check(await row(env.DB,'SELECT id FROM profiles WHERE id=? AND owner=?',b.childId,owner),404,'Perfil no encontrado.');
      const drafts=await rows(env.DB,"SELECT id,revision,content FROM lessons WHERE material_id=? AND owner=? AND status='draft'",b.materialId,owner);
      check(new Set(b.lessons.map(l=>l.id)).size===b.lessons.length&&drafts.length===b.lessons.length&&drafts.every(d=>b.lessons.some(l=>l.id===d.id&&l.revision===d.revision)),409,'El resumen cambió. Actualiza y revisa los ejercicios antes de confirmar.');
      const hashes=await prepareAudioBatch(env,owner,drafts.map(d=>JSON.parse(d.content)),fetcher);
      await env.DB.batch(drafts.map((d,i)=>env.DB.prepare("UPDATE lessons SET content=? WHERE id=? AND owner=? AND revision=? AND status='draft' AND content=?").bind(JSON.stringify({...JSON.parse(d.content),audioHash:hashes[i]}),d.id,owner,d.revision,d.content)));
      const approvedAt=now();const result=await run(env.DB,"WITH reviewed AS MATERIALIZED (SELECT id,revision FROM lessons WHERE material_id=? AND owner=? AND status='draft'), valid AS MATERIALIZED (SELECT count(*) AS n FROM reviewed r WHERE EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.id')=r.id AND json_extract(j.value,'$.revision')=r.revision)) UPDATE lessons SET child_id=?,status='approved',approved_at=?,revision=revision+1 WHERE owner=? AND id IN (SELECT id FROM reviewed) AND (SELECT count(*) FROM reviewed)=? AND (SELECT n FROM valid)=?",b.materialId,owner,JSON.stringify(b.lessons),b.childId,approvedAt,owner,b.lessons.length,b.lessons.length);
      check(result.meta.changes===drafts.length,409,'El resumen cambió durante la confirmación. Actualiza la página.');await env.DB.batch([log('photo.summary.confirmed',b.materialId)]);return json({approved:drafts.length,materialId:b.materialId});
    }
    const lessonMatch=path.match(/^\/api\/lessons\/([a-zA-Z0-9-]+)$/);
    if(lessonMatch&&method==='PATCH'){
      const b=await bodyJSON(request);check(b.reviewed===true,400,'Revisa y confirma la consigna y su respuesta.');const content=validateLesson(b);
      const lesson=await row(env.DB,'SELECT l.* FROM lessons l JOIN materials m ON m.id=l.material_id AND m.owner=l.owner WHERE l.id=? AND l.owner=? AND l.archived_at IS NULL AND m.archived_at IS NULL',lessonMatch[1],owner);check(lesson,404,'Borrador no encontrado o archivado.');check(lesson.status==='draft'&&b.revision===lesson.revision,409,'El borrador ya cambió o fue aprobado. Actualiza la página.');
      check(await row(env.DB,'SELECT id FROM profiles WHERE id=? AND owner=?',b.childId,owner),404,'Perfil no encontrado.');
      content.audioHash=await ensureLessonAudio(env,owner,content,fetcher);
      const approvedAt=now();const result=await run(env.DB,"UPDATE lessons SET content=?,child_id=?,status='approved',approved_at=?,revision=revision+1 WHERE id=? AND owner=? AND revision=? AND status='draft'",JSON.stringify(content),b.childId,approvedAt,lesson.id,owner,lesson.revision);check(result.meta.changes===1,409,'El borrador cambió durante la revisión.');await env.DB.batch([log('practice.approved',lesson.id)]);return json({lesson:viewLesson({...lesson,content:JSON.stringify(content),child_id:b.childId,status:'approved',approved_at:approvedAt,revision:lesson.revision+1})});
    }
    throw new HttpError(404,'Ruta no encontrada.');
  }catch(error){return json({error:error instanceof HttpError?error.message:'No se pudo completar la operación. Inténtalo de nuevo.',code:error instanceof HttpError?error.status:500},error instanceof HttpError?error.status:500);}
}

async function cleanupPhotos(env,owner){if(!env.BUCKET)return;const pending=await rows(env.DB,'SELECT object_key FROM deletion_queue WHERE owner=? LIMIT 10',owner);for(const item of pending){try{await env.BUCKET.delete(item.object_key);await run(env.DB,'DELETE FROM deletion_queue WHERE owner=? AND object_key=?',owner,item.object_key)}catch{break}}}
