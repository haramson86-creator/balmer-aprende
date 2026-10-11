import {HttpError} from './practice.mjs';
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
const now=()=>new Date().toISOString();
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const cookie=(request,key,value,age)=>`${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
function result(request,value,{child,logout=false}={}){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 if(child){headers.append('Set-Cookie',cookie(request,'aprende_child',child,7*86400));}
 if(logout){headers.append('Set-Cookie',cookie(request,'aprende_child','',0));}

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
 if(path==='/api/auth/logout'){const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_child=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)await run(db,'DELETE FROM child_sessions WHERE token_hash=?',await hash(token));return result(request,{ok:true},{logout:true});}
 if(path==='/api/auth/child'){
  await limit(db,'child-ip:'+ip,10,600);await limit(db,'child-global',1000,600);
  const code=typeof body.code==='string'?body.code.replace(/[\s-]/g,'').toUpperCase():'';
  check(/^[A-Z2-9]{12}$/.test(code),400,'Escribe el código que te dio tu familia.');
  const access=await first(db,'SELECT owner,child_id FROM child_codes WHERE code_hash=? AND expires_at>?',await hash(code),now());check(access,401,'Código incorrecto, caducado o retirado. Pide uno nuevo a tu familia.');
  const token=random();await run(db,'INSERT INTO child_sessions(token_hash,owner,child_id,expires_at,created_at) VALUES(?,?,?,?,?)',await hash(token),access.owner,access.child_id,new Date(Date.now()+7*86400000).toISOString(),now());
  return result(request,{ok:true,role:'child'},{child:token});
 }
 return null;
}
export async function createChildCode(db,owner,childId){
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=crypto.getRandomValues(new Uint8Array(12));const code=Array.from(bytes,b=>alphabet[b%32]).join('');const expiresAt=new Date(Date.now()+30*86400000).toISOString();
 await db.batch([db.prepare('DELETE FROM child_codes WHERE owner=? AND child_id=?').bind(owner,childId),db.prepare('DELETE FROM child_sessions WHERE owner=? AND child_id=?').bind(owner,childId),db.prepare('INSERT INTO child_codes(code_hash,owner,child_id,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await hash(code),owner,childId,expiresAt,now())]);
 return {code:code.match(/.{4}/g).join('-'),expiresAt};
}
