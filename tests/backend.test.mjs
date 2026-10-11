import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleAPI} from '../server/backend.mjs';
import {generatePractices,validateLesson} from '../server/practice.mjs';

const exercise={type:'select',title:'Encuentra la M',prompt:'¿Cuál es la letra M?',options:['M','L','S'],answer:'M',category:'source',skill:'Reconocer letras'};
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_glorious_karen_page.sql',import.meta.url),'utf8'));
  sqlite.exec('CREATE TABLE families(owner TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)');
  const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  const objects=new Map();const BUCKET={async put(key,bytes){objects.set(key,bytes)},async get(key){const bytes=objects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes}:null},async delete(key){objects.delete(key)}};
  const env={DB,BUCKET,OPENAI_API_KEY:'test-only-not-a-real-key'},calls=[];
  const fetcher=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({readable:true,message:'Página legible',exercises:[exercise]})}]}]})};
  const request=async(path,{method='GET',body,user='family-a',cookie,origin='https://aprende.test'}={})=>{const response=await handleAPI(new Request('https://aprende.test/api/'+path,{method,headers:{Origin:origin,'X-Aprende-Request':'1',...(cookie?{Cookie:cookie}:{}),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}),env,user?{userId:user}:null,{fetcher});return {response,status:response.status,data:response.headers.get('Content-Type')?.includes('json')?await response.json():null}};
  const profile=async(user='family-a')=>(await request('profiles',{method:'POST',user,body:{name:'Perfil de prueba'}})).data;
  const upload=async(user='family-a')=>{const photo=new FormData();photo.append('consent','yes');photo.append('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKXYAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'example.png');return request('materials',{method:'POST',body:photo,user})};
  return {sqlite,env,request,profile,upload,calls};
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
