import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {makePinHash,hash} from '../server/auth.mjs';
import {validateWav,normalizeWav} from '../server/lesson-audio.mjs';
import {handleAPI} from '../server/backend.mjs';
import {generatePractices,validateLesson,letterCount,lessonQualityIssue} from '../server/practice.mjs';

const exercise={type:'select',title:'Encuentra la M',prompt:'¿Cuál es la letra M?',options:['M','L','S'],answer:'M',category:'source',skill:'Reconocer letras'};

function wavFixture(){const b=Buffer.alloc(4844);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4800,40);return b;}
function fixture(exerciseCount=1){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_glorious_karen_page.sql',import.meta.url),'utf8'));
  for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')&&!n.startsWith('0000')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  const objects=new Map();const BUCKET={async put(key,bytes){objects.set(key,bytes)},async get(key){const bytes=objects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes}:null},async delete(key){objects.delete(key)}};
  const env={DB,BUCKET,OPENAI_API_KEY:'test-only-not-a-real-key'},calls=[];
  let aiFailure=false,voiceFailure=false;const voiceCalls=[];
  const fetcher=async(url,options)=>{if(aiFailure&&!url.endsWith('/audio/speech'))return new Response('failed',{status:500});if(JSON.parse(options.body).text?.format?.name==='reading_analysis')return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({readable:true,pageSummary:'Reconocimiento de letras del cuaderno.',warnings:[],tasks:[{instruction:exercise.prompt,sourceText:'M L S',expectedAnswers:['M'],explanation:'La M aparece entre las opciones.',ambiguities:[]}]})}]}]});if(url.endsWith('/audio/speech')){voiceCalls.push(JSON.parse(options.body));return voiceFailure?new Response('quota',{status:429}):new Response(wavFixture(),{headers:{'Content-Type':'audio/wav'}});}calls.push({url,body:JSON.parse(options.body)});return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({readable:true,message:'Página legible',exercises:Array.from({length:exerciseCount},(_,i)=>({...exercise,title:exercise.title+(i?' '+i:''),analysis:{objective:'Reconocer la letra M',sourceEvidence:'La página muestra M, L y S.',explanation:'La letra solicitada es M.',warnings:[],optionChecks:exercise.options.map(option=>({option,correct:option===exercise.answer,explanation:option===exercise.answer?'Es la letra solicitada.':'Es una letra diferente.'}))}}))})}]}]})};
  const parentCookies=new Map();
  const request=async(path,{method='GET',body,user='family-a',cookie,skipPin=false,headers={},origin='https://aprende.test'}={})=>{if(user&&!cookie&&!skipPin&&!path.startsWith('auth/')){if(!parentCookies.has(user)){const setup=await request('auth/parent/setup',{method:'POST',body:{pin:'3579'},user,skipPin:true});parentCookies.set(user,setup.response.headers.get('Set-Cookie').split(';')[0]);}cookie=parentCookies.get(user);}const response=await handleAPI(new Request('https://aprende.test/api/'+path,{method,headers:{...headers,Origin:origin,'X-Aprende-Request':'1',...(cookie?{Cookie:cookie}:{}),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}),env,user?{userId:user,email:user+'@example.test'}:null,{fetcher});return {response,status:response.status,data:response.headers.get('Content-Type')?.includes('json')?await response.json():null}};
  const profile=async(user='family-a')=>(await request('profiles',{method:'POST',user,body:{name:'Perfil de prueba'}})).data;
  let uploadIndex=0;const upload=async(user='family-a',marker=++uploadIndex)=>{const photo=new FormData();photo.append('consent','yes');photo.append('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKXYAAAAASUVORK5CYII=','base64'),Uint8Array.of(marker)],{type:'image/png'}),'example.png');return request('materials',{method:'POST',body:photo,user})};
  return {sqlite,env,request,profile,upload,calls,objects,voiceCalls,setAiFailure(value){aiFailure=value},setVoiceFailure(value){voiceFailure=value}};
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
  const f=fixture(2);try{
    const child=await f.profile(),otherChild=await f.profile('family-b');
    const photos=[(await f.upload()).data,(await f.upload()).data];
    for(const photo of photos)for(let i=0;i<2;i++)assert.equal((await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).status,i===0?201:200);
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


test('Android handoff requires hosted identity, verifier, single use and parent PIN',async()=>{
 const f=fixture();try{
  const verifier='a'.repeat(64),challenge=await hash(verifier);
  assert.equal((await f.request('auth/native/issue',{method:'POST',user:null,body:{challenge}})).status,401);
  const issued=await f.request('auth/native/issue',{method:'POST',body:{challenge}});assert.equal(issued.status,200);
  assert.notEqual(f.sqlite.prepare('SELECT ticket_hash FROM native_tickets').get().ticket_hash,issued.data.ticket);
  assert.equal((await f.request('auth/native/redeem',{method:'POST',user:null,body:{ticket:issued.data.ticket,verifier:'b'.repeat(64)}})).status,401);
  const redeemed=await f.request('auth/native/redeem',{method:'POST',user:null,body:{ticket:issued.data.ticket,verifier}});assert.equal(redeemed.status,200);
  const cookie=redeemed.response.headers.get('Set-Cookie').split(';')[0];assert.match(cookie,/aprende_native=/);
  const gate=await f.request('session',{user:null,cookie});assert.equal(gate.data.parentEmail,'family-a@example.test');assert.equal(gate.data.needsParentPin,true);
  assert.equal((await f.request('state',{user:null,cookie})).status,403);
  assert.equal((await f.request('auth/native/issue',{method:'POST',user:null,cookie,body:{challenge}})).status,401);
  assert.equal((await f.request('auth/native/redeem',{method:'POST',user:null,body:{ticket:issued.data.ticket,verifier}})).status,401);
  const setup=await f.request('auth/parent/setup',{method:'POST',user:null,cookie,body:{pin:'2468'}});assert.equal(setup.status,200);
  const unlocked=cookie+'; '+setup.response.headers.get('Set-Cookie').split(';')[0];assert.equal((await f.request('session',{user:null,cookie:unlocked})).data.authenticated,true);
  await f.request('auth/logout',{method:'POST',user:null,cookie:unlocked,body:{}});assert.equal((await f.request('session',{user:null,cookie:unlocked})).data.authenticated,false);
  const expired=await f.request('auth/native/issue',{method:'POST',body:{challenge}});f.sqlite.prepare("UPDATE native_tickets SET expires_at='2000-01-01T00:00:00Z'").run();
  assert.equal((await f.request('auth/native/redeem',{method:'POST',user:null,body:{ticket:expired.data.ticket,verifier}})).status,401);
 }finally{f.sqlite.close()}
});

test('remembered parent survives missing platform identity, expires and signs out',async()=>{
 const f=fixture();try{
  const login=await f.request('auth/parent/setup',{method:'POST',body:{pin:'2468',remember:true}});const cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  assert.match(login.response.headers.get('Set-Cookie'),/Max-Age=2592000/);
  const resumed=await f.request('session',{user:null,cookie});assert.equal(resumed.data.authenticated,true);assert.equal(resumed.data.parentEmail,'family-a@example.test');
  const short=await f.request('auth/parent/verify',{method:'POST',body:{pin:'2468',remember:false}});assert.match(short.response.headers.get('Set-Cookie'),/Max-Age=28800/);
  await f.request('auth/logout',{method:'POST',user:null,cookie,body:{}});assert.equal((await f.request('session',{user:null,cookie})).data.authenticated,false);
  const again=await f.request('auth/parent/verify',{method:'POST',body:{pin:'2468'}});const stale=again.response.headers.get('Set-Cookie').split(';')[0];f.sqlite.prepare("UPDATE parent_access_sessions SET expires_at='2000-01-01T00:00:00Z'").run();assert.equal((await f.request('session',{user:null,cookie:stale})).data.authenticated,false);
 }finally{f.sqlite.close()}
});

test('shared parents join by bound email, collaborate and lose access immediately on removal',async()=>{
 const f=fixture();try{
  await f.request('family',{method:'PUT',body:{name:'Familia compartida'}});await f.request('family',{method:'PUT',user:'family-b',body:{name:'Familia B'}});
  const child=await f.profile(),ownB=await f.profile('family-b');
  const invite=await f.request('family/invitations',{method:'POST',body:{email:'FAMILY-B@example.test'}});assert.equal(invite.status,201);
  assert.notEqual(f.sqlite.prepare('SELECT token_hash FROM family_invites').get().token_hash,invite.data.code);
  assert.equal((await f.request('family/invitations/accept',{method:'POST',user:'family-c',body:{code:invite.data.code}})).status,403);
  const accepted=await f.request('family/invitations/accept',{method:'POST',user:'family-b',body:{code:invite.data.code}});assert.equal(accepted.status,200);
  const shared=await f.request('session',{user:'family-b'});assert.equal(shared.data.family.name,'Familia compartida');assert.equal(shared.data.family.isOwner,false);assert.equal(shared.data.profiles[0].id,child.id);assert.equal(shared.data.families.length,2);
  assert.equal((await f.request('family/invitations/accept',{method:'POST',user:'family-b',body:{code:invite.data.code}})).status,403);
  assert.equal((await f.request('family',{method:'DELETE',user:'family-b',body:{confirmName:'Familia compartida'}})).status,403);
  assert.equal((await f.request('family',{method:'PUT',user:'family-b',body:{name:'Hack'}})).status,403);
  assert.equal((await f.request('family/invitations',{method:'POST',user:'family-b',body:{email:'family-c@example.test'}})).status,403);
  assert.equal((await f.request('profiles/'+child.id,{method:'PATCH',user:'family-b',body:{name:'Nuevo nombre'}})).status,200);
  const photo=await f.upload('family-b');assert.equal(photo.status,201);assert.equal((await f.request('state')).data.materials[0].id,photo.data.id);
  const generation=await f.request('generations',{method:'POST',user:'family-b',body:{id:crypto.randomUUID(),materialId:photo.data.id,consent:true}});const draft=generation.data.drafts[0];
  const approved=await f.request('lessons/'+draft.id,{method:'PATCH',user:'family-b',body:{...draft,childId:child.id,reviewed:true}});assert.equal(approved.status,200);
  const childLogin=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}});const cookie=childLogin.response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await f.request('family/invitations',{method:'POST',user:null,cookie,body:{email:'family-c@example.test'}})).status,403);
  const attempt={id:crypto.randomUUID(),childId:child.id,activityId:draft.id,activityRevision:approved.data.lesson.revision,answer:draft.answer};assert.equal((await f.request('attempts',{method:'POST',user:null,cookie,body:attempt})).status,200);
  assert.equal((await f.request('state',{user:'family-b'})).data.attempts.length,1);assert.equal((await f.request('state',{user:null,cookie})).data.attempts.length,1);
  assert.equal((await f.request('family/select',{method:'POST',user:'family-b',body:{familyId:'family-b'}})).status,200);assert.equal((await f.request('session',{user:'family-b'})).data.profiles[0].id,ownB.id);
  await f.request('family/select',{method:'POST',user:'family-b',body:{familyId:'family-a'}});
  assert.equal((await f.request('family/members',{method:'DELETE',body:{userId:'family-b'}})).status,200);
  assert.equal((await f.request('session',{user:'family-b'})).data.family.name,'Familia B');assert.equal((await f.request('materials/'+photo.data.id,{user:'family-b'})).status,404);assert.equal((await f.request('family/select',{method:'POST',user:'family-b',body:{familyId:'family-a'}})).status,403);
  assert.ok(f.sqlite.prepare("SELECT id FROM audit WHERE action='profile.renamed:family-b'").get());
 }finally{f.sqlite.close()}
});

test('expired and revoked invitations fail and child deletion preserves reference as draft',async()=>{
 const f=fixture();try{
  await f.request('family',{method:'PUT',body:{name:'Familia'}});const child=await f.profile(),sibling=await f.profile();
  let invite=await f.request('family/invitations',{method:'POST',body:{email:'family-b@example.test'}});f.sqlite.prepare("UPDATE family_invites SET expires_at='2000-01-01T00:00:00Z'").run();assert.equal((await f.request('family/invitations/accept',{method:'POST',user:'family-b',body:{code:invite.data.code}})).status,403);
  invite=await f.request('family/invitations',{method:'POST',body:{email:'family-b@example.test'}});await f.request('family/invitations',{method:'DELETE',body:{email:'family-b@example.test'}});assert.equal((await f.request('family/invitations/accept',{method:'POST',user:'family-b',body:{code:invite.data.code}})).status,403);
  const photo=await f.upload(),g=await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.data.id,consent:true}});const draft=g.data.drafts[0];const approved=await f.request('lessons/'+draft.id,{method:'PATCH',body:{...draft,childId:child.id,reviewed:true}});const task=approved.data.lesson;
  assert.equal((await f.request('lessons/'+task.id+'/assignment',{method:'PATCH',user:'family-b',body:{childId:sibling.id,revision:task.revision}})).status,404);
  assert.equal((await f.request('lessons/'+task.id+'/assignment',{method:'PATCH',body:{childId:sibling.id,revision:task.revision,copy:true,id:crypto.randomUUID()}})).status,200);assert.equal((await f.request('state')).data.lessons.length,2);
  assert.equal((await f.request('lessons/'+task.id+'/assignment',{method:'PATCH',body:{childId:sibling.id,revision:task.revision+1}})).status,409);
  assert.equal((await f.request('profiles/'+child.id,{method:'DELETE',body:{confirmName:'Incorrecto'}})).status,400);
  assert.equal((await f.request('profiles/'+child.id,{method:'DELETE',body:{confirmName:child.name}})).status,200);const state=await f.request('state');assert.equal(state.data.lessons.length,1);assert.equal(state.data.drafts.length,1);assert.equal(state.data.materials.length,1);
  assert.equal((await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}})).status,401);
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
test('library deduplicates photos and analysis, archives reversibly and repeats without erasing history',async()=>{
 const f=fixture();try{
  const child=await f.profile(),photo=await f.upload('family-a',7),duplicate=await f.upload('family-a',7);assert.equal(duplicate.status,200);assert.equal(duplicate.data.id,photo.data.id);assert.equal(f.objects.size,1);
  f.sqlite.prepare('UPDATE materials SET content_hash=NULL WHERE id=?').run(photo.data.id);assert.equal((await f.upload('family-a',7)).data.id,photo.data.id);
  const g=await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.data.id,consent:true}});const draft=g.data.drafts[0];
  assert.equal((await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.data.id,consent:true}})).data.reused,true);assert.equal(f.calls.length,1);
  const task=(await f.request('lessons/'+draft.id,{method:'PATCH',body:{...draft,childId:child.id,reviewed:true}})).data.lesson;
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}}),cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  const result=await f.request('attempts',{method:'POST',user:null,cookie,body:{id:crypto.randomUUID(),childId:child.id,activityId:task.id,activityRevision:task.revision,answer:'M'}});assert.equal(result.status,200);
  assert.equal((await f.request('materials/'+photo.data.id+'/lifecycle',{method:'PATCH',user:'family-b',body:{action:'archive'}})).status,404);
  assert.equal((await f.request('materials/'+photo.data.id+'/lifecycle',{method:'PATCH',user:null,cookie,body:{action:'archive'}})).status,403);
  await f.request('materials/'+photo.data.id+'/lifecycle',{method:'PATCH',body:{action:'rename',name:'Cuaderno de letras'}});
  await f.request('materials/'+photo.data.id+'/lifecycle',{method:'PATCH',body:{action:'archive'}});
  assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,0);const archived=(await f.request('state')).data;assert.equal(archived.libraryLessons[0].archived,true);assert.equal(archived.attempts.length,1);assert.equal(archived.materials[0].name,'Cuaderno de letras');
  assert.equal((await f.request('attempts',{method:'POST',user:null,cookie,body:{id:crypto.randomUUID(),childId:child.id,activityId:task.id,activityRevision:task.revision,answer:'M'}})).status,404);
  await f.request('materials/'+photo.data.id+'/lifecycle',{method:'PATCH',body:{action:'restore'}});assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,1);
  await f.request('lessons/'+task.id+'/lifecycle',{method:'PATCH',body:{action:'archive'}});assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,0);
  const repeat={action:'repeat',childId:child.id,id:crypto.randomUUID(),revision:task.revision};assert.equal((await f.request('lessons/'+task.id+'/lifecycle',{method:'PATCH',body:repeat})).status,200);assert.equal((await f.request('lessons/'+task.id+'/lifecycle',{method:'PATCH',body:repeat})).status,409);
  const after=(await f.request('state')).data;assert.equal(after.libraryLessons.length,2);assert.equal(after.lessons.length,1);assert.equal(after.attempts.length,1);assert.ok(after.libraryLessons.every(t=>t.sourceId===photo.data.id));
  await f.request('lessons/'+task.id+'/lifecycle',{method:'PATCH',body:{action:'restore'}});assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,2);
 }finally{f.sqlite.close()}
});
test('child completion notifies shared parents, each read state is independent and private',async()=>{
 const f=fixture();try{
  await f.request('family',{method:'PUT',body:{name:'Familia de avisos'}});const child=await f.profile(),photo=(await f.upload()).data,draft=(await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).data.drafts[0];const task=(await f.request('lessons/'+draft.id,{method:'PATCH',body:{...draft,reviewed:true,childId:child.id}})).data.lesson;
  const invite=(await f.request('family/invitations',{method:'POST',body:{email:'family-b@example.test'}})).data;await f.request('family/invitations/accept',{method:'POST',user:'family-b',body:{code:invite.code}});
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}}),cookie=login.response.headers.get('Set-Cookie').split(';')[0],attemptId=crypto.randomUUID();
  const body={id:attemptId,childId:child.id,activityId:task.id,activityRevision:task.revision,answer:'M'};await f.request('attempts',{method:'POST',user:null,cookie,body});await f.request('attempts',{method:'POST',user:null,cookie,body});
  const a=(await f.request('state')).data,b=(await f.request('state',{user:'family-b'})).data;assert.equal(a.notifications.length,1);assert.equal(a.notifications[0].read,false);assert.equal(b.notifications[0].read,false);assert.equal(a.notifications[0].score,10);assert.equal((await f.request('state',{user:'family-c'})).data.notifications.length,0);assert.equal((await f.request('state',{user:null,cookie})).data.notifications,undefined);
  await f.request('notifications/read',{method:'POST',user:'family-c',body:{ids:[attemptId]}});assert.equal((await f.request('state')).data.notifications[0].read,false);
  await f.request('notifications/read',{method:'POST',body:{ids:[attemptId]}});assert.equal((await f.request('state')).data.notifications[0].read,true);assert.equal((await f.request('state',{user:'family-b'})).data.notifications[0].read,false);
  assert.equal((await f.request('notifications/read',{method:'POST',user:null,cookie,body:{ids:[attemptId]}})).status,403);
 }finally{f.sqlite.close()}
});
test('concurrent analysis requests for one photo invoke OpenAI at most once',async()=>{const f=fixture();try{await f.profile();const photo=(await f.upload()).data;const requests=await Promise.all([1,2].map(()=>f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})));assert.equal(requests.filter(r=>r.status===201).length,1);assert.ok(requests.every(r=>[200,201,409].includes(r.status)));assert.equal(f.calls.length,1);assert.equal((await f.request('state')).data.drafts.length,1)}finally{f.sqlite.close()}});

test('approved audio is persisted, private, range-compatible and reused across repeated tasks',async()=>{
 const f=fixture();try{
  const child=await f.profile(),sibling=await f.profile(),photo=(await f.upload()).data,draft=(await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).data.drafts[0];
  const task=(await f.request('lessons/'+draft.id,{method:'PATCH',body:{...draft,reviewed:true,childId:child.id}})).data.lesson;assert.equal(task.audioReady,true);assert.equal(f.voiceCalls.length,1);assert.equal(f.voiceCalls[0].response_format,'wav');assert.ok(!f.voiceCalls[0].input.includes('correcta'));
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}}),cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  const voice=await f.request('lessons/'+task.id+'/audio',{user:null,cookie});assert.equal(voice.status,200);assert.equal(voice.response.headers.get('Content-Type'),'audio/wav');validateWav(await voice.response.arrayBuffer());
  const range=await f.request('lessons/'+task.id+'/audio',{user:null,cookie,headers:{Range:'bytes=0-43'}});assert.equal(range.status,206);assert.equal((await range.response.arrayBuffer()).byteLength,44);
  assert.equal((await f.request('lessons/'+task.id+'/audio',{headers:{Range:'bytes=999999-'}})).status,416);
  assert.equal((await f.request('lessons/'+task.id+'/audio',{user:'family-b'})).status,404);
  const siblingLogin=await f.request('auth/child',{method:'POST',user:null,body:{code:sibling.code}});assert.equal((await f.request('lessons/'+task.id+'/audio',{user:null,cookie:siblingLogin.response.headers.get('Set-Cookie').split(';')[0]})).status,404);
  const newId=crypto.randomUUID();await f.request('lessons/'+task.id+'/lifecycle',{method:'PATCH',body:{action:'repeat',revision:task.revision,id:newId,childId:child.id}});assert.equal((await f.request('lessons/'+newId+'/audio')).status,200);assert.equal(f.voiceCalls.length,1);
  delete f.env.OPENAI_API_KEY;assert.equal((await f.request('lessons/'+task.id+'/audio',{method:'POST'})).status,200);
 }finally{f.sqlite.close()}
});
test('audio failure blocks assignment without losing drafts and retry preserves reviewed content',async()=>{
 const f=fixture(2);try{
  const child=await f.profile(),photo=(await f.upload()).data,drafts=(await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).data.drafts;
  const body={materialId:photo.id,childId:child.id,reviewed:true,lessons:drafts.map(d=>({id:d.id,revision:d.revision}))};f.setVoiceFailure(true);
  assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body})).status,429);assert.equal((await f.request('state')).data.lessons.length,0);assert.equal((await f.request('state')).data.drafts.length,2);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM lesson_audio').get().n,0);
  f.setVoiceFailure(false);assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body})).status,200);assert.ok((await f.request('state')).data.lessons.every(l=>l.audioReady));assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM lesson_audio').get().n,1);
 }finally{f.sqlite.close()}
});
test('legacy assigned task prepares audio once and edited instruction gets different voice file',async()=>{
 const f=fixture();try{
  const child=await f.profile(),photo=(await f.upload()).data,draft=(await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).data.drafts[0];
  f.sqlite.prepare("UPDATE lessons SET status='approved',child_id=? WHERE id=?").run(child.id,draft.id);
  assert.equal((await f.request('lessons/'+draft.id+'/audio')).status,404);
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}}),cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await f.request('lessons/'+draft.id+'/audio',{method:'POST',user:null,cookie})).status,200);assert.equal((await f.request('lessons/'+draft.id+'/audio',{method:'POST',user:null,cookie})).status,200);assert.equal(f.voiceCalls.length,1);
  const updated={...exercise,prompt:'Busca la letra M entre estas opciones.'};f.sqlite.prepare("UPDATE lessons SET content=?,status='draft',revision=revision+1 WHERE id=?").run(JSON.stringify(updated),draft.id);
  assert.equal((await f.request('lessons/'+draft.id,{method:'PATCH',body:{...updated,revision:2,reviewed:true,childId:child.id}})).status,200);assert.equal(f.voiceCalls.length,2);
 }finally{f.sqlite.close()}
});
test('WAV streaming sizes are finalized; empty, truncated and non-audio replies are rejected',()=>{
 const b=wavFixture();b.writeUInt32LE(0xffffffff,4);b.writeUInt32LE(0xffffffff,40);const bytes=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);normalizeWav(bytes);assert.equal(new DataView(bytes).getUint32(40,true),4800);validateWav(bytes);
 assert.throws(()=>validateWav(new ArrayBuffer(10)));assert.throws(()=>validateWav(new ArrayBuffer(100)));assert.throws(()=>validateWav(bytes.slice(0,100)));
});

test('letter comparisons reject ties, missing answers, wrong counts and equivalent options',()=>{
 assert.equal(letterCount('Homero'),6);assert.equal(letterCount('Ismael'),6);assert.equal(letterCount('Omar'),4);assert.equal(letterCount('María'),5);
 const tied={...exercise,title:'Nombre más largo',prompt:'¿Cuál de estos nombres es el más largo?',options:['Homero','Omar','Ismael'],answer:'Homero'};
 assert.match(lessonQualityIssue(tied),/homero=6.*ismael=6/);assert.throws(()=>validateLesson(tied));
 const fixed={...tied,prompt:'¿Qué nombre o grupo de nombres tiene la mayor cantidad de letras?',options:['Homero','Omar','Homero e Ismael'],answer:'Homero e Ismael'};assert.equal(validateLesson(fixed).answer,'Homero e Ismael');
 assert.throws(()=>validateLesson({...exercise,prompt:"¿Cuántas letras tiene 'Omar'?",options:['3','5','6'],answer:'5'}));
 assert.equal(validateLesson({...exercise,prompt:"¿Cuántas letras tiene 'Omar'?",options:['3','4','6'],answer:'4'}).answer,'4');
 assert.throws(()=>validateLesson({...exercise,options:['M','m','L']}));
});
test('generation analyzes the source before a second review and preserves explanations',async()=>{
 const f=fixture();try{const photo=(await f.upload()).data;const generated=await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}});assert.equal(generated.status,201);assert.equal(generated.data.drafts[0].analysis.optionChecks.length,3);assert.match(f.calls[0].body.input[0].content[0].text,/expectedAnswers/);
 const child=await f.profile(),d=generated.data.drafts[0];const approved=await f.request('lessons/'+d.id,{method:'PATCH',body:{...d,reviewed:true,childId:child.id}});assert.equal(approved.data.lesson.analysis.verifiedBy,'analysis-and-independent-review-v1');
 }finally{f.sqlite.close()}
});
test('legacy ambiguous tasks are withheld, cannot score, and parent correction preserves history',async()=>{
 const f=fixture();try{const child=await f.profile(),photo=(await f.upload()).data,d=(await f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true}})).data.drafts[0];
 const bad={...exercise,prompt:'¿Cuál de estos nombres es el más largo?',options:['Homero','Omar','Ismael'],answer:'Homero'};
 f.sqlite.prepare("UPDATE lessons SET content=?,status='approved',child_id=? WHERE id=?").run(JSON.stringify(bad),child.id,d.id);
 const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}}),cookie=login.response.headers.get('Set-Cookie').split(';')[0];assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,0);assert.equal((await f.request('state')).data.libraryLessons[0].needsCorrection,true);
 assert.equal((await f.request('attempts',{method:'POST',user:null,cookie,body:{id:crypto.randomUUID(),childId:child.id,activityId:d.id,activityRevision:1,answer:'Homero'}})).status,409);
 const fixed={...bad,prompt:'¿Qué nombres tienen la mayor cantidad de letras?',options:['Homero','Omar','Homero e Ismael'],answer:'Homero e Ismael',revision:1,reviewed:true,childId:child.id};const saved=await f.request('lessons/'+d.id,{method:'PATCH',body:fixed});assert.equal(saved.status,200);assert.equal(saved.data.lesson.revision,2);assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,1);
 }finally{f.sqlite.close()}
});

test('saved photos can be reanalyzed without upload, preserving history and requiring new parent approval',async()=>{
 const f=fixture();try{
  const child=await f.profile(),photo=(await f.upload()).data;
  const generate=body=>f.request('generations',{method:'POST',body:{id:crypto.randomUUID(),materialId:photo.id,consent:true,...body}});
  const old=(await generate()).data.drafts[0];await f.request('lessons/'+old.id,{method:'PATCH',body:{...old,reviewed:true,childId:child.id}});
  const attempt={id:crypto.randomUUID(),childId:child.id,activityId:old.id,activityRevision:2,answer:'M'};assert.equal((await f.request('attempts',{method:'POST',body:attempt})).status,200);
  const login=await f.request('auth/child',{method:'POST',user:null,body:{code:child.code}}),cookie=login.response.headers.get('Set-Cookie').split(';')[0];
  const requestBody={id:crypto.randomUUID(),materialId:photo.id,consent:true,reanalyze:true};
  assert.equal((await f.request('generations',{method:'POST',user:null,cookie,body:requestBody})).status,403);
  assert.equal((await f.request('generations',{method:'POST',user:'family-b',body:requestBody})).status,404);
  assert.equal((await generate({reanalyze:true,consent:false})).status,400);
  f.setAiFailure(true);assert.equal((await generate({reanalyze:true})).status,502);assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,1);f.setAiFailure(false);
  const next=await f.request('generations',{method:'POST',body:requestBody});assert.equal(next.status,201);assert.notEqual(next.data.drafts[0].id,old.id);assert.equal(f.objects.size,2); // original photo plus existing audio
  const state=(await f.request('state')).data;assert.equal(state.drafts.length,1);assert.equal(state.libraryLessons.find(l=>l.id===old.id).supersededBy,requestBody.id);assert.equal(state.attempts.length,1);
  assert.equal((await f.request('state',{user:null,cookie})).data.lessons.length,0);
  assert.equal((await f.request('lessons/'+old.id+'/lifecycle',{method:'PATCH',body:{action:'restore'}})).status,409);
  assert.equal((await f.request('generations',{method:'POST',body:requestBody})).data.drafts[0].id,next.data.drafts[0].id);
  const draft=next.data.drafts[0],confirm={materialId:photo.id,childId:child.id,reviewed:true,lessons:[{id:draft.id,revision:1}]};
  assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body:{...confirm,reviewed:false}})).status,400);
  assert.equal((await f.request('lessons/confirm-photo',{method:'POST',body:confirm})).status,200);assert.equal((await f.request('state',{user:null,cookie})).data.lessons[0].id,draft.id);
  const again=await generate({reanalyze:true});assert.equal(again.status,201);assert.equal((await f.request('state')).data.drafts.length,1);
 }finally{f.sqlite.close()}
});
