import {hash,limit} from './auth.mjs';
import {HttpError} from './practice.mjs';
const now=()=>new Date().toISOString();
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
const cookie=(request,value,age)=>`aprende_native=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export async function nativeUser(request,db){
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_native=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return null;
 const record=await db.prepare('SELECT owner,email FROM native_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),now()).first();
 return record?{userId:record.owner,email:record.email}:null;
}
export async function nativeAuth(request,env,user,path,body){
 const db=env.DB;
 if(path==='/api/auth/native/issue'){
  check(user?.userId&&user?.email,401,'Entra con ChatGPT para volver a Aprende.');
  check(typeof body.challenge==='string'&&/^[a-f0-9]{64}$/.test(body.challenge),400,'Abre el acceso desde Aprende.');
  await limit(db,'native-issue:'+user.userId,20,600);
  const ticket=random();
  await db.prepare('DELETE FROM native_tickets WHERE expires_at<?').bind(now()).run();
  await db.prepare('INSERT INTO native_tickets(ticket_hash,challenge,owner,email,expires_at) VALUES(?,?,?,?,?)').bind(await hash(ticket),body.challenge,user.userId,user.email,new Date(Date.now()+120000).toISOString()).run();
  return Response.json({ticket},{headers:{'Cache-Control':'no-store'}});
 }
 if(path==='/api/auth/native/redeem'){
  check(typeof body.ticket==='string'&&/^[a-f0-9]{64}$/.test(body.ticket)&&typeof body.verifier==='string'&&/^[a-f0-9]{64}$/.test(body.verifier),400,'Acceso de app no válido.');
  await limit(db,'native-redeem:'+ (request.headers.get('cf-connecting-ip')||'unknown'),30,600);
  // Atomic consume: a copied callback cannot be used twice or without the app's verifier.
  const record=await db.prepare('DELETE FROM native_tickets WHERE ticket_hash=? AND challenge=? AND expires_at>? RETURNING owner,email').bind(await hash(body.ticket),await hash(body.verifier),now()).first();
  check(record,401,'El acceso caducó. Vuelve a entrar desde la app.');
  const token=random();
  await db.prepare('DELETE FROM native_sessions WHERE expires_at<?').bind(now()).run();
  await db.prepare('INSERT INTO native_sessions(token_hash,owner,email,expires_at) VALUES(?,?,?,?)').bind(await hash(token),record.owner,record.email,new Date(Date.now()+7*86400000).toISOString()).run();
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
  headers.append('Set-Cookie',cookie(request,token,7*86400));
  headers.append('Set-Cookie','aprende_child=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
  headers.append('Set-Cookie','aprende_parent_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
  return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(path==='/api/auth/logout'){
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)aprende_native=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(token)await db.prepare('DELETE FROM native_sessions WHERE token_hash=?').bind(await hash(token)).run();
 }
 return null;
}
