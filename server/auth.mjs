import {HttpError} from './practice.mjs';
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
const now=()=>new Date().toISOString();
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const cookie=(request,key,value,age)=>`${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
function result(request,value,{child,parent,parentAge=8*3600,logout=false}={}){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 if(child){headers.append('Set-Cookie',cookie(request,'aprende_child',child,7*86400));}
 if(parent)headers.append('Set-Cookie',cookie(request,'aprende_parent_access',parent,parentAge));
 if(logout){headers.append('Set-Cookie',cookie(request,'aprende_parent_access','',0));headers.append('Set-Cookie',cookie(request,'aprende_child','',0));headers.append('Set-Cookie',cookie(request,'aprende_native','',0));}

 return new Response(JSON.stringify(value),{headers});
}
export async function limit(db,key,max,seconds){
 const bucket=Math.floor(Date.now()/(seconds*1000)),stamp=await hash(`${key}:${bucket}`);
 const r=await first(db,'INSERT INTO auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',stamp,new Date((bucket+2)*seconds*1000).toISOString());
 check(r.count<=max,429,'Demasiados intentos. Espera unos minutos antes de volver a intentar.');
 await run(db,'DELETE FROM auth_limits WHERE expires_at<?',now());
}
export async function authRoute(request,env,user,path,body){
 const db=env.DB,ip=request.headers.get('cf-connecting-ip')||'unknown';
 if(path==='/api/auth/parent/setup'||path==='/api/auth/parent/verify'){
  check(user?.userId,401,'Entra primero con tu cuenta de ChatGPT.');check(!/(?:^|;\s*)aprende_child=[a-f0-9]{64}(?:;|$)/.test(request.headers.get('cookie')||''),403,'Sal del acceso de niño antes de entrar como padre.');
  await limit(db,'parent-pin:'+user.userId,5,900);await limit(db,'parent-pin-ip:'+ip,15,900);
  check(typeof body.pin==='string'&&/^\d{4,8}$/.test(body.pin),400,'Escribe un código de 4 a 8 dígitos.');
  const initial=initialPin(env,user);if(initial){await run(db,'INSERT INTO parent_pins(owner,pin_hash,created_at) VALUES(?,?,?) ON CONFLICT(owner) DO NOTHING',user.userId,initial,now());}
  if(path.endsWith('/setup')){const saved=await run(db,'INSERT INTO parent_pins(owner,pin_hash,created_at) VALUES(?,?,?) ON CONFLICT(owner) DO NOTHING',user.userId,await makePinHash(body.pin),now());check(saved.meta.changes===1,409,'Tu código ya está configurado. Utiliza la pantalla de entrada.');}
  else{const record=await first(db,'SELECT pin_hash FROM parent_pins WHERE owner=?',user.userId);check(record&&await validPin(body.pin,record.pin_hash),403,'Código de padre incorrecto.');}
  const age=body.remember===false?8*3600:30*86400,token=random();await run(db,'INSERT INTO parent_access_sessions(token_hash,owner,email,expires_at,created_at) VALUES(?,?,?,?,?)',await hash(token),user.userId,user.email||null,new Date(Date.now()+age*1000).toISOString(),now());
  return result(request,{ok:true,role:'parent'},{parent:token,parentAge:age});
 }
 if(path==='/api/auth/logout'){const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_child=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)await run(db,'DELETE FROM child_sessions WHERE token_hash=?',await hash(token));const parent=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_parent_access=([a-f0-9]{64})(?:;|$)/)?.[1];if(parent)await run(db,'DELETE FROM parent_access_sessions WHERE token_hash=?',await hash(parent));return result(request,{ok:true},{logout:true});}
 if(path==='/api/auth/child'){
  await limit(db,'child-ip:'+ip,10,600);await limit(db,'child-global',1000,600);
  const code=typeof body.code==='string'?body.code.replace(/[\s-]/g,'').toUpperCase():'';
  check(/^(?=[A-Z2-9]*[A-Z])(?=[A-Z2-9]*[2-9])[A-Z2-9]{5}$/.test(code)||/^[A-Z2-9]{12}$/.test(code),400,'Escribe el código que te dio tu familia.');
  const access=await first(db,'SELECT owner,child_id FROM child_codes WHERE code_hash=? AND expires_at>?',await hash(code),now());check(access,401,'Código incorrecto, caducado o retirado. Pide uno nuevo a tu familia.');
  const token=random();await run(db,'INSERT INTO child_sessions(token_hash,owner,child_id,expires_at,created_at) VALUES(?,?,?,?,?)',await hash(token),access.owner,access.child_id,new Date(Date.now()+7*86400000).toISOString(),now());
  return result(request,{ok:true,role:'child'},{child:token});
 }
 return null;
}
export async function createChildCode(db,owner,childId){
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const expiresAt=new Date(Date.now()+30*86400000).toISOString();
 for(let attempt=0;attempt<20;attempt++){
  const bytes=crypto.getRandomValues(new Uint8Array(5)),code=Array.from(bytes,b=>alphabet[b%32]).join('');
  if(!/[A-Z]/.test(code)||!/[2-9]/.test(code))continue;
  const codeHash=await hash(code);
  if(await first(db,'SELECT code_hash FROM child_codes WHERE code_hash=?',codeHash))continue;
  try{await db.batch([db.prepare('DELETE FROM child_codes WHERE owner=? AND child_id=?').bind(owner,childId),db.prepare('DELETE FROM child_sessions WHERE owner=? AND child_id=?').bind(owner,childId),db.prepare('INSERT INTO child_codes(code_hash,owner,child_id,expires_at,created_at) VALUES(?,?,?,?,?)').bind(codeHash,owner,childId,expiresAt,now())]);}
  catch(error){if(await first(db,'SELECT code_hash FROM child_codes WHERE code_hash=?',codeHash))continue;throw error;}
  return {code,expiresAt};
 }
 throw new HttpError(503,'No se pudo generar el código. Intenta otra vez.');
}
export async function makePinHash(pin){const salt=crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);return Array.from(salt,b=>b.toString(16).padStart(2,'0')).join('')+':'+Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');}
async function validPin(pin,stored){const [salt,digest]=stored.split(':');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g),b=>parseInt(b,16)),iterations:100000,hash:'SHA-256'},key,256);const actual=Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');let mismatch=0;for(let i=0;i<digest.length;i++)mismatch|=digest.charCodeAt(i)^actual.charCodeAt(i);return mismatch===0;}
export async function parentStatus(request,db,owner){const pin=await first(db,'SELECT owner FROM parent_pins WHERE owner=?',owner);const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_parent_access=([a-f0-9]{64})(?:;|$)/)?.[1];const session=token?await first(db,'SELECT owner FROM parent_access_sessions WHERE owner=? AND token_hash=? AND expires_at>?',owner,await hash(token),now()):null;return {pinConfigured:!!pin,unlocked:!!session};}
export async function rememberedParent(request,db){const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_parent_access=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;const session=await first(db,'SELECT owner,email FROM parent_access_sessions WHERE token_hash=? AND expires_at>?',await hash(token),now());return session?.email?{userId:session.owner,email:session.email}:null;}

export function initialPin(env,user){return user?.email?.toLowerCase()===env.INITIAL_PARENT_EMAIL?.toLowerCase()&&/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(env.INITIAL_PARENT_PIN_HASH||'')?env.INITIAL_PARENT_PIN_HASH:null;}
