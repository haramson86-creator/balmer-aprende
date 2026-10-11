import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {makePinHash} from '../server/auth.mjs';
import {handleAPI} from '../server/backend.mjs';
import {generatePractices,validateLesson} from '../server/practice.mjs';

const exercise={type:'select',title:'Encuentra la M',prompt:'¿Cuál es la letra M?',options:['M','L','S'],answer:'M',category:'source',skill:'Reconocer letras'};
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_glorious_karen_page.sql',import.meta.url),'utf8'));
  for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')&&!n.startsWith('0000')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  const objects=new Map();const BUCKET={async put(key,bytes){objects.set(key,bytes)},async get(key){const bytes=objects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes}:null},async delete(key){objects.delete(key)}};
  const env={DB,BUCKET,OPENAI_API_KEY:'test-only-not-a-real-key'},calls=[];
  const fetcher=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({readable:true,message:'Página legible',exercises:[exercise]})}]}]})};
  const parentCookies=new Map();
  const request=async(path,{method='GET',body,user='family-a',cookie,skipPin=false,origin='https://aprende.test'}={})=>{if(user&&!cookie&&!skipPin&&!path.startsWith('auth/')){if(!parentCookies.has(user)){const setup=await request('auth/parent/setup',{method:'POST',body:{pin:'3579'},user,skipPin:true});parentCookies.set(user,setup.response.headers.get('Set-Cookie').split(';')[0]);}cookie=parentCookies.get(user);}const response=await handleAPI(new Request('https://aprende.test/api/'+path,{method,headers:{Origin:origin,'X-Aprende-Request':'1',...(cookie?{Cookie:cookie}:{}),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}),env,user?{userId:user,email:user+'@example.test'}:null,{fetcher});return {response,status:response.status,data:response.headers.get('Content-Type')?.includes('json')?await response.json():null}};
  const profile=async(user='family-a')=>(await request('profiles',{method:'POST',user,body:{name:'Perfil de prueba'}})).data;
  const upload=async(user='family-a')=>{const photo=new FormData();photo.append('consent','yes');photo.append('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKXYAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'example.png');return request('materials',{method:'POST',body:photo,user})};
  return {sqlite,env,request,profile,upload,calls,objects};
}

test('photo → draft → adult approval → child execution uses persisted isolated records',async()=>{
  const f=fixture();try{
    const child=await f.profile(),otherChild=await f.profile('family-b');
    assert.equal((await f.request('profiles',{method:'POST',user:null,body:{name:'x'}})).status,401);
    assert.equal((await f.request('profiles',{method:'POST',body:{name:'x'},origin:'https://evil.test'})).status,403);
    const uploaded=await f.upload();assert.equal(uploaded.status,201);
    assert.equal((await f.request('materials/'+uploaded.data.id,{user:'family-b'})).status,404);
    const generation={id:crypto.randomUUID(),materialId:uploaded.data.id,consent:true};
    const created=await f.request('generations',{method:'POST',body:generation});assert.equal(created.status,201);assert.equal(created.data.drafts.length,1);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.store,false);assert.equal(f.calls[0].body.text.format.type,'json_schema');assert.equal(f.calls[0].body.input[0].content[1].type,'input_image');
    assert.equal((await f.request('generations',{method:'POST',body:generation})).data.drafts[0].id,created.data.drafts[0].id);assert.equal(f.calls.length,1);
    const draft=created.data.drafts[0];assert.equal((await f.request('state')).data.lessons.length,0);assert.equal((await f.request('state',{user:'family-b'})).data.drafts.length,0);
    const approve={...draft,childId:child.id,reviewed:true};
    assert.equal((await f.request('lessons/'+draft.id,{method:'PATCH',body:{...approve,reviewed:false}})).status,400);
    assert.equal((await f.request('lessons/'+draft.id,{method:'PATCH',body:{...approve,childId:otherChild.id}})).status,404);
    const approved=await f.request('lessons/'+draft.id,{method:'PATCH',body:approve});assert.equal(approved.status,200);assert.equal(approved.data.lesson.revision,2);
    assert.equal((await f.request('lessons/'+draft.id,{method:'PATCH',body:approve})).status,409);
    const link=(await f.request('child/links',{method:'POST',body:{childId:child.id}})).data.url;
    const token=new URLSearchParams(new URL(link).hash.slice(1)).get('child');
    const redeemed=await f.request('child/redeem',{method:'POST',user:null,body:{token}});assert.equal(redeemed.status,200);assert.match(redeemed.response.headers.get('Set-Cookie'),/HttpOnly; SameSite=Lax/);
    const cookie=redeemed.response.headers.get('Set-Cookie').split(';')[0];
    const state=await f.request('state',{user:null,cookie});assert.equal(state.data.lessons.length,1);assert.equal(state.data.drafts.length,0);assert.equal(state.data.materials.length,0);
    assert.equal((await f.request('profiles',{method:'POST',user:null,cookie,body:{name:'x'}})).status,403);
    assert.equal((await f.request('materials/'+uploaded.data.id,{user:null,cookie})).status,403);
    const attempt={id:crypto.randomUUID(),childId:child.id,activityId:draft.id,activityRevision:2,answer:'M',score:0,visibleDurationMs:1200};
    const saved=await f.request('attempts',{method:'POST',user:null,cookie,body:attempt});assert.equal(saved.status,200);assert.equal(saved.data.attempt.score,10);assert.equal(saved.data.acknowledged,true);
    assert.equal((await f.request('attempts',{method:'POST',user:null,cookie,body:attempt})).status,200);assert.equal((await f.request('state')).data.attempts.length,1);
    assert.equal((await f.request('attempts',{method:'POST',user:null,cookie,body:{...attempt,answer:'S'}})).status,409);
    assert.equal((await f.request('attempts',{method:'POST',user:null,cookie,body:{...attempt,id:crypto.randomUUID(),childId:otherChild.id}})).status,403);
    assert.equal((await f.request('state',{user:'family-b'})).data.attempts.length,0);
    await f.request('child/links',{method:'DELETE',body:{childId:child.id}});assert.equal((await f.request('state',{user:null,cookie})).status,401);
  }finally{f.sqlite.close()}
});
test('missing key and rejected images do not invoke OpenAI or generate drafts',async()=>{const f=fixture();try{delete f.env.OPENAI_API_KEY;const photo=await f.upload();assert.equal((await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.data.id,consent:true}})).status,503);assert.equal(f.calls.length,0);const form=new FormData();form.append('consent','yes');form.append('photo',new Blob(['not an image'],{type:'image/png'}),'fake.png');assert.equal((await f.request('materials',{method:'POST',body:form})).status,400);assert.equal((await f.request('state')).data.drafts.length,0)}finally{f.sqlite.close()}});

test('multiple photos keep separate references and require exact parent summary confirmation',async()=>{
  const f=fixture();try{
    const child=await f.profile(),otherChild=await f.profile('family-b');
    const photos=[(await f.upload()).data,(await f.upload()).data];
    for(const photo of photos)for(let i=0;i<2;i++)assert.equal((await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).status,201);
    const state=(await f.request('state')).data;
    assert.equal(state.materials.length,2);assert.ok(state.materials.every(m=>m.exerciseCount===2&&m.analysisStatus==='completed'));
    const first=state.drafts.filter(d=>d.sourceId===photos[0].id),second=state.drafts.filter(d=>d.sourceId===photos[1].id);
    assert.equal(first.length,2);assert.equal(second.length,2);
    const payload={materialId:photos[0].id,childId:child.id,reviewed:true,lessons:first.map(d=>({id:d.id,revision:d.revision}))};
    assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body:{...payload,reviewed:false}})).status,400);
    assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body:{...payload,childId:otherChild.id}})).status,404);
    assert.equal((await f.request('lessons/confirm-photo',{method:'POST',user:'family-b',body:payload})).status,404);
    for(const lessons of [[payload.lessons[0]],[...payload.lessons,{id:second[0].id,revision:1}],[{...payload.lessons[0],revision:9},payload.lessons[1]]])assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body:{...payload,lessons}})).status,409);
    assert.equal((await f.request('state')).data.lessons.length,0);
    const confirmed=await f.request('lessons/confirm-photo',{method:'POST',body:payload});assert.equal(confirmed.status,200);assert.equal(confirmed.data.approved,2);
    const after=(await f.request('state')).data;assert.equal(after.lessons.length,2);assert.equal(after.drafts.length,2);assert.ok(after.lessons.every(d=>d.sourceId===photos[0].id&&d.revision===2));
    assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body:payload})).status,409);
    assert.equal((await f.request('materials/'+photos[0].id,{method:'DELETE'})).status,409);
    assert.equal((await f.request('materials/'+photos[0].id)).status,200);
    assert.equal((await f.request('materials/'+photos[0].id,{user:'family-b'})).status,404);
  }finally{f.sqlite.close()}
});
test('OpenAI refusal, quota, incomplete and invalid outputs remain unassigned',async()=>{
  for(const [reply,status] of [[{status:'incomplete',output:[]},422],[{status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]},422],[{status:'completed',output:[{content:[{type:'output_text',text:'not json'}]}]},502]])await assert.rejects(()=>generatePractices({key:'test',image:new Uint8Array([1]),mime:'image/png',fetcher:async()=>Response.json(reply)}),e=>e.status===status);
  await assert.rejects(()=>generatePractices({key:'test',image:new Uint8Array([1]),mime:'image/png',fetcher:async()=>new Response('',{status:429})}),e=>e.status===429);
  assert.throws(()=>validateLesson({...exercise,options:['M','M','L']}));assert.throws(()=>validateLesson({...exercise,answer:'Z'}));
});

test('family setup persists per owner and requires a parent',async()=>{
 const f=fixture();try{
  assert.equal((await f.request('family',{method:'PUT',body:{name:'  Familia QA  '}})).status,200);
  assert.equal((await f.request('session')).data.family.name,'Familia QA');
  assert.equal((await f.request('session',{user:'family-b'})).data.family,null);
  assert.equal((await f.request('family',{method:'PUT',body:{name:' '}})).status,400);
  assert.equal((await f.request('family',{method:'PUT',user:null,body:{name:'Otra'}})).status,401);
 }finally{f.sqlite.close()}
});

test('child codes bind to one family and child, rotate and revoke all prior access',async()=>{
 const f=fixture();try{
  const child=await f.profile();assert.match(child.code,/^[A-Z2-9]{4}(-[A-Z2-9]{4}){2}$/);
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}});assert.equal(login.status,200);assert.equal(login.data.role,'child');
  const cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await f.request('session',{user:null,cookie})).data.profiles[0].id,child.id);
  assert.equal((await f.request('family',{method:'PUT',cookie,user:null,body:{name:'Prohibida'}})).status,403);
  assert.equal((await f.request('child/codes',{method:'POST',cookie,user:null,body:{childId:child.id}})).status,403);
  assert.equal((await f.request('child/codes',{method:'POST',user:'family-b',body:{childId:child.id}})).status,404);
  const rotated=await f.request('child/codes',{method:'POST',body:{childId:child.id}});assert.equal(rotated.status,201);
  assert.equal((await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}})).status,401);
  assert.equal((await f.request('session',{user:null,cookie})).status,401);
  await f.request('child/links',{method:'DELETE',body:{childId:child.id}});
  assert.equal((await f.request('auth/child',{method:'POST',user:null,body:{code:rotated.data.code}})).status,401);
  const third=await f.request('child/codes',{method:'POST',body:{childId:child.id}});
  f.sqlite.prepare('UPDATE child_codes SET expires_at=?').run('2000-01-01');
  assert.equal((await f.request('auth/child',{method:'POST',user:null,body:{code:third.data.code}})).status,401);
  for(let i=0;i<10;i++)await f.request('auth/child',{method:'POST',user:null,body:{code:'AAAA-BBBB-CCCC'}});
  assert.equal((await f.request('auth/child',{method:'POST',user:null,body:{code:'AAAA-BBBB-CCCC'}})).status,429);
 }finally{f.sqlite.close()}
});


test('parent PIN gates private records and is bound to the authenticated owner',async()=>{
 const f=fixture();try{
  const locked=await f.request('session',{skipPin:true});assert.equal(locked.data.needsParentPin,true);assert.equal(locked.data.authenticated,false);assert.equal(locked.data.pinConfigured,false);
  assert.equal((await f.request('state',{skipPin:true})).status,403);
  assert.equal((await f.request('auth/parent/setup',{method:'POST',user:null,body:{pin:'3579'}})).status,401);
  const setup=await f.request('auth/parent/setup',{method:'POST',body:{pin:'3579'}});assert.equal(setup.status,200);const cookie=setup.response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await f.request('session',{cookie})).data.authenticated,true);
  assert.equal((await f.request('state',{cookie,user:'family-b'})).status,403);
  assert.equal((await f.request('auth/parent/setup',{method:'POST',body:{pin:'9999'}})).status,409);
  assert.equal((await f.request('auth/parent/verify',{method:'POST',body:{pin:'9999'}})).status,403);
  assert.notEqual(f.sqlite.prepare('SELECT pin_hash FROM parent_pins').get().pin_hash,'3579');
  const valid=await f.request('auth/parent/verify',{method:'POST',body:{pin:'3579'}});assert.equal(valid.status,200);
  await f.request('auth/logout',{method:'POST',cookie,body:{}});assert.equal((await f.request('state',{cookie})).status,403);
  await f.request('auth/parent/verify',{method:'POST',body:{pin:'3579'}});assert.equal((await f.request('auth/parent/verify',{method:'POST',body:{pin:'3579'}})).status,429);
 }finally{f.sqlite.close()}
});

test('family deletion removes only owned records and retries photo cleanup durably',async()=>{
 const f=fixture();try{
  await f.request('family',{method:'PUT',body:{name:'Familia QA'}});await f.request('family',{method:'PUT',user:'family-b',body:{name:'Otra familia'}});
  const child=await f.profile(),other=await f.profile('family-b'),photo=await f.upload(),otherPhoto=await f.upload('family-b');
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}});const cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await f.request('family',{method:'DELETE',user:null,cookie,body:{confirmName:'Familia QA'}})).status,403);
  assert.equal((await f.request('family',{method:'DELETE',body:{confirmName:'Otra'}})).status,400);
  const deleteObject=f.env.BUCKET.delete;f.env.BUCKET.delete=async()=>{throw Error('temporary R2 failure')};
  const removed=await f.request('family',{method:'DELETE',body:{confirmName:'Familia QA'}});assert.equal(removed.status,200);assert.equal(removed.data.pendingPhotos,1);
  assert.equal((await f.request('session')).data.family,null);assert.equal((await f.request('session',{user:null,cookie})).status,401);
  assert.equal((await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}})).status,401);
  assert.equal((await f.request('session',{user:'family-b'})).data.profiles[0].id,other.id);assert.equal((await f.request('materials/'+otherPhoto.data.id,{user:'family-b'})).status,200);
  f.env.BUCKET.delete=deleteObject;await f.request('state');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM deletion_queue').get().n,0);assert.equal(f.objects.size,1);
  assert.equal((await f.request('materials/'+photo.data.id)).status,404);
 }finally{f.sqlite.close()}
});


test('configured parent code is bound to trusted email and requires leaving child access',async()=>{
 const f=fixture();try{
  f.env.INITIAL_PARENT_EMAIL='family-a@example.test';f.env.INITIAL_PARENT_PIN_HASH=await makePinHash('3579');
  assert.equal((await f.request('session',{skipPin:true})).data.pinConfigured,true);
  assert.equal((await f.request('session',{user:'family-b',skipPin:true})).data.pinConfigured,false);
  const login=await f.request('auth/parent/verify',{method:'POST',body:{pin:'3579'}});assert.equal(login.status,200);const parent=login.response.headers.get('Set-Cookie').split(';')[0];
  const child=(await f.request('profiles',{method:'POST',cookie:parent,body:{name:'Niño QA'}})).data;
  const access=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}});const cookie=access.response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await f.request('session',{cookie})).data.role,'child');
  assert.equal((await f.request('auth/parent/verify',{method:'POST',cookie,body:{pin:'3579'}})).status,403);
  const logout=await f.request('auth/logout',{method:'POST',cookie,body:{}});assert.equal(logout.status,200);assert.match(logout.response.headers.get('Set-Cookie'),/aprende_child=;.*Max-Age=0/);
  const gate=await f.request('session',{skipPin:true});assert.equal(gate.data.role,'parent');assert.equal(gate.data.needsParentPin,true);
  assert.equal((await f.request('auth/parent/verify',{method:'POST',body:{pin:'3579'}})).status,200);
  assert.equal((await f.request('auth/parent/verify',{method:'POST',user:'family-b',body:{pin:'3579'}})).status,403);
 }finally{f.sqlite.close()}
});
