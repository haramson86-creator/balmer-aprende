import {HttpError,validateLesson,validateImage,generatePractices} from './practice.mjs';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
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
function viewLesson(r){return {...JSON.parse(r.content),id:r.id,status:r.status,revision:r.revision,sourceId:r.material_id,assignedTo:r.child_id?[r.child_id]:[],approvedAt:r.approved_at,cloud:true,color:'peach',art:'Aa',tag:r.status==='approved'?'Tarea revisada':'Borrador de IA'};}
async function actorFor(request,env,user){
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_child=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(token){const session=await row(env.DB,'SELECT * FROM child_sessions WHERE token_hash=? AND expires_at>?',await sha(token),now());check(session,401,'El acceso del niño caducó. Pide un enlace nuevo.');return {owner:session.owner,role:'child',childId:session.child_id};}
  return user?.userId?{owner:user.userId,role:'parent'}:null;
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
    const actor=await actorFor(request,env,user);
    if(path==='/api/session'&&method==='GET'){
      if(!actor)return json({authenticated:false,aiReady:!!env.OPENAI_API_KEY,signIn:'/signin-with-chatgpt?return_to=%2F'});
      const profiles=await rows(env.DB,actor.role==='child'?'SELECT id,name FROM profiles WHERE owner=? AND id=?':'SELECT id,name FROM profiles WHERE owner=? ORDER BY created_at',...actor.role==='child'?[actor.owner,actor.childId]:[actor.owner]);
      return json({authenticated:true,role:actor.role,profiles,aiReady:!!env.OPENAI_API_KEY});
    }
    check(actor,401,'Inicia sesión para guardar prácticas en tu familia.');
    const {owner,role,childId}=actor;
    if(path==='/api/state'&&method==='GET'){
      if(role==='child'){const lessons=await rows(env.DB,"SELECT * FROM lessons WHERE owner=? AND child_id=? AND status='approved' ORDER BY created_at DESC",owner,childId);return json({materials:[],drafts:[],lessons:lessons.map(viewLesson),attempts:[]});}
      const [materials,lessons,attempts]=await Promise.all([rows(env.DB,'SELECT id,name,mime,bytes,created_at FROM materials WHERE owner=? ORDER BY created_at DESC LIMIT 100',owner),rows(env.DB,'SELECT * FROM lessons WHERE owner=? ORDER BY created_at DESC LIMIT 500',owner),rows(env.DB,'SELECT payload FROM attempts WHERE owner=? ORDER BY created_at DESC LIMIT 1000',owner)]);
      return json({materials:materials.map(m=>({...m,cloud:true,size:m.bytes,url:`/api/materials/${m.id}`})),drafts:lessons.filter(l=>l.status==='draft').map(viewLesson),lessons:lessons.filter(l=>l.status==='approved').map(viewLesson),attempts:attempts.map(a=>JSON.parse(a.payload))});
    }
    if(path==='/api/attempts'&&method==='POST'){
      const b=await bodyJSON(request);check(typeof b.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(b.id),400,'Identificador de intento no válido.');
      check(typeof b.childId==='string'&&(role==='parent'||b.childId===childId),403,'Perfil no autorizado.');
      const lesson=await row(env.DB,"SELECT * FROM lessons WHERE id=? AND owner=? AND child_id=? AND status='approved'",b.activityId,owner,b.childId);check(lesson,404,'Práctica no asignada a este perfil.');
      check(b.activityRevision===lesson.revision,409,'La práctica cambió. Actualiza antes de continuar.');
      const content=JSON.parse(lesson.content);check(content.options.includes(b.answer),400,'Respuesta no válida.');
      const previous=await row(env.DB,'SELECT owner,child_id,lesson_id,payload FROM attempts WHERE id=?',b.id);if(previous){check(previous.owner===owner&&previous.child_id===b.childId&&previous.lesson_id===lesson.id&&JSON.parse(previous.payload).answer===b.answer,409,'El identificador del intento ya se usó.');return json({attempt:JSON.parse(previous.payload),acknowledged:true});}
      const attempt={id:b.id,childId:b.childId,activityId:lesson.id,title:content.title,activityRevision:lesson.revision,answer:b.answer,score:b.answer===content.answer?10:0,mode:'recognition',experimental:false,evaluationStatus:'scored',visibleDurationMs:Math.max(0,Math.min(Number(b.visibleDurationMs)||0,86400000)),createdAt:now(),syncStatus:'synced',cloud:true};
      await run(env.DB,'INSERT INTO attempts(id,owner,child_id,lesson_id,payload,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',b.id,owner,b.childId,lesson.id,JSON.stringify(attempt),attempt.createdAt);
      const saved=await row(env.DB,'SELECT owner,child_id,lesson_id,payload FROM attempts WHERE id=?',b.id);check(saved?.owner===owner&&saved.child_id===b.childId&&saved.lesson_id===lesson.id&&JSON.parse(saved.payload).answer===b.answer,409,'Intento en conflicto.');return json({attempt:JSON.parse(saved.payload),acknowledged:true});
    }
    check(role==='parent',403,'Esta acción solo está disponible para los padres.');
    if(path==='/api/profiles'&&method==='POST'){
      const {name}=await bodyJSON(request);check(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=40,400,'Escribe un apodo de hasta 40 caracteres.');
      const count=await row(env.DB,'SELECT count(*) AS n FROM profiles WHERE owner=?',owner);check(count.n<10,409,'Puedes crear hasta 10 perfiles.');const profile={id:id(),name:name.trim()};await env.DB.batch([env.DB.prepare('INSERT INTO profiles(id,owner,name,created_at) VALUES(?,?,?,?)').bind(profile.id,owner,profile.name,now()),audit(env.DB,owner,'profile.created',profile.id)]);return json(profile,201);
    }
    if(path==='/api/child/links'&&method==='POST'){
      const {childId}=await bodyJSON(request);check(await row(env.DB,'SELECT id FROM profiles WHERE id=? AND owner=?',childId,owner),404,'Perfil no encontrado.');
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expires=new Date(Date.now()+7*86400000).toISOString();
      await env.DB.batch([env.DB.prepare('DELETE FROM child_sessions WHERE owner=? AND child_id=?').bind(owner,childId),env.DB.prepare('INSERT INTO child_sessions(token_hash,owner,child_id,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await sha(token),owner,childId,expires,now()),audit(env.DB,owner,'child.link.created',childId)]);return json({url:`${url.origin}/#child=${token}`,expiresAt:expires},201);
    }
    if(path==='/api/child/links'&&method==='DELETE'){const {childId}=await bodyJSON(request);await run(env.DB,'DELETE FROM child_sessions WHERE owner=? AND child_id=?',owner,childId);return json({ok:true});}
    if(path==='/api/materials'&&method==='POST'){
      check(env.BUCKET,503,'El almacenamiento de fotos aún no está configurado.');
      const quota=await row(env.DB,'SELECT count(*) AS n FROM materials WHERE owner=?',owner);check(quota.n<100,429,'Límite de 100 fotos alcanzado. Retira una foto antes de añadir otra.');
      const bytes=await limitedBody(request),form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(),photo=form.get('photo');
      check(photo&&typeof photo.arrayBuffer==='function',400,'Selecciona una foto.');check(form.get('consent')==='yes',400,'Confirma el envío de la página para generar prácticas.');
      const image=await photo.arrayBuffer();validateImage(image,photo.type);const materialId=id(),key=`${await sha(owner)}/${materialId}`;
      await env.BUCKET.put(key,image,{httpMetadata:{contentType:photo.type}});
      try{await env.DB.batch([env.DB.prepare('INSERT INTO materials(id,owner,name,object_key,mime,bytes,created_at) VALUES(?,?,?,?,?,?,?)').bind(materialId,owner,'Página del cuaderno',key,photo.type,image.byteLength,now()),audit(env.DB,owner,'material.uploaded',materialId)])}catch(error){await env.BUCKET.delete(key);throw error;}
      return json({id:materialId,name:'Página del cuaderno',cloud:true,size:image.byteLength,url:`/api/materials/${materialId}`},201);
    }
    const materialMatch=path.match(/^\/api\/materials\/([a-zA-Z0-9-]+)$/);
    if(materialMatch){const m=await row(env.DB,'SELECT * FROM materials WHERE id=? AND owner=?',materialMatch[1],owner);check(m,404,'Foto no encontrada.');
      if(method==='GET'){const object=await env.BUCKET?.get(m.object_key);check(object,404,'La foto no está disponible.');return new Response(object.body,{headers:{'Content-Type':m.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
      if(method==='DELETE'){await env.BUCKET?.delete(m.object_key);await env.DB.batch([env.DB.prepare('DELETE FROM materials WHERE id=? AND owner=?').bind(m.id,owner),audit(env.DB,owner,'material.deleted',m.id)]);return json({ok:true});}
    }
    if(path==='/api/generations'&&method==='POST'){
      check(env.OPENAI_API_KEY,503,'OpenAI aún no está configurado en el servidor.');
      const b=await bodyJSON(request);check(b.consent===true,400,'Confirma el envío de la foto a OpenAI.');check(typeof b.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(b.id),400,'Identificador no válido.');
      const previous=await row(env.DB,'SELECT * FROM generations WHERE id=?',b.id);
      if(previous){check(previous.owner===owner&&previous.material_id===b.materialId,404,'Solicitud no encontrada.');if(previous.status==='completed')return json({drafts:(await rows(env.DB,'SELECT * FROM lessons WHERE generation_id=? AND owner=?',b.id,owner)).map(viewLesson)});throw new HttpError(409,previous.status==='running'?'La foto ya se está procesando.':'La generación falló. Inicia un nuevo intento.');}
      const material=await row(env.DB,'SELECT * FROM materials WHERE id=? AND owner=?',b.materialId,owner);check(material,404,'Foto no encontrada.');
      const quota=await row(env.DB,'SELECT count(*) AS n FROM generations WHERE owner=? AND created_at>?',owner,new Date(Date.now()-86400000).toISOString());check(quota.n<20,429,'Alcanzaste el límite de 20 generaciones al día.');
      const object=await env.BUCKET?.get(material.object_key);check(object,404,'La foto no está disponible.');
      const inserted=await run(env.DB,"INSERT INTO generations(id,owner,material_id,status,created_at) VALUES(?,?,?,'running',?) ON CONFLICT(id) DO NOTHING",b.id,owner,material.id,now());check(inserted.meta.changes===1,409,'La foto ya se está procesando.');
      try{
        const exercises=await generatePractices({key:env.OPENAI_API_KEY,model:env.OPENAI_MODEL,image:await object.arrayBuffer(),mime:material.mime,fetcher});
        const drafts=exercises.map(content=>({id:id(),content,createdAt:now()}));
        await env.DB.batch([...drafts.map(d=>env.DB.prepare("INSERT INTO lessons(id,owner,material_id,generation_id,status,content,revision,created_at) VALUES(?,?,?,?,'draft',?,1,?)").bind(d.id,owner,material.id,b.id,JSON.stringify(d.content),d.createdAt)),env.DB.prepare("UPDATE generations SET status='completed' WHERE id=? AND owner=?").bind(b.id,owner),audit(env.DB,owner,'practice.generated',b.id)]);
        return json({drafts:drafts.map(d=>viewLesson({id:d.id,content:JSON.stringify(d.content),status:'draft',revision:1,material_id:material.id,child_id:null,approved_at:null}))},201);
      }catch(error){await run(env.DB,"UPDATE generations SET status='failed' WHERE id=? AND owner=?",b.id,owner);throw error;}
    }
    const lessonMatch=path.match(/^\/api\/lessons\/([a-zA-Z0-9-]+)$/);
    if(lessonMatch&&method==='PATCH'){
      const b=await bodyJSON(request);check(b.reviewed===true,400,'Revisa y confirma la consigna y su respuesta.');const content=validateLesson(b);
      const lesson=await row(env.DB,'SELECT * FROM lessons WHERE id=? AND owner=?',lessonMatch[1],owner);check(lesson,404,'Borrador no encontrado.');check(lesson.status==='draft'&&b.revision===lesson.revision,409,'El borrador ya cambió o fue aprobado. Actualiza la página.');
      check(await row(env.DB,'SELECT id FROM profiles WHERE id=? AND owner=?',b.childId,owner),404,'Perfil no encontrado.');
      const approvedAt=now();const result=await run(env.DB,"UPDATE lessons SET content=?,child_id=?,status='approved',approved_at=?,revision=revision+1 WHERE id=? AND owner=? AND revision=? AND status='draft'",JSON.stringify(content),b.childId,approvedAt,lesson.id,owner,lesson.revision);check(result.meta.changes===1,409,'El borrador cambió durante la revisión.');await env.DB.batch([audit(env.DB,owner,'practice.approved',lesson.id)]);return json({lesson:viewLesson({...lesson,content:JSON.stringify(content),child_id:b.childId,status:'approved',approved_at:approvedAt,revision:lesson.revision+1})});
    }
    throw new HttpError(404,'Ruta no encontrada.');
  }catch(error){return json({error:error instanceof HttpError?error.message:'No se pudo completar la operación. Inténtalo de nuevo.',code:error instanceof HttpError?error.status:500},error instanceof HttpError?error.status:500);}
}
