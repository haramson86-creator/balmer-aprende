import {HttpError} from './practice.mjs';
const check=(ok,status,message)=>{if(!ok)throw new HttpError(status,message)};
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export const narration=lesson=>`${lesson.prompt} Las opciones son: ${lesson.options.join('. ')}.`;
export const audioHash=lesson=>digest('coral-es-v1\n'+narration(lesson));
export function normalizeWav(bytes){
 // Streaming WAV uses unknown-size sentinels. Finalize lengths after receiving the entire body.
 const b=new Uint8Array(bytes),v=new DataView(bytes);if(b.length<44)return bytes;
 const tag=i=>String.fromCharCode(...b.slice(i,i+4));if(tag(0)!=='RIFF'||tag(8)!=='WAVE')return bytes;
 for(let i=12;i+8<=b.length;){const n=v.getUint32(i+4,true);if(tag(i)==='data'&&n===0xffffffff){v.setUint32(i+4,b.length-i-8,true);break;}if(n>b.length-i-8)break;i+=8+n+(n%2);}
 if(v.getUint32(4,true)===0xffffffff)v.setUint32(4,b.length-8,true);return bytes;
}
export function validateWav(bytes){
 const b=new Uint8Array(bytes),v=new DataView(bytes);check(b.length>=44&&b.length<=3*1024*1024,502,'El audio generado está vacío o es demasiado grande.');
 const tag=i=>String.fromCharCode(...b.slice(i,i+4));check(tag(0)==='RIFF'&&tag(8)==='WAVE',502,'El servidor de voz devolvió un archivo no reproducible.');
 let format=false,data=0,rate=0;
 for(let i=12;i+8<=b.length;){const size=v.getUint32(i+4,true),end=i+8+size;check(end<=b.length,502,'El archivo de voz está incompleto.');if(tag(i)==='fmt '){check(size>=16,502,'Formato de voz no válido.');const channels=v.getUint16(i+10,true),sampleRate=v.getUint32(i+12,true),bits=v.getUint16(i+22,true);format=v.getUint16(i+8,true)===1&&channels>=1&&channels<=2&&sampleRate>=8000&&sampleRate<=48000&&bits===16;rate=v.getUint32(i+16,true);check(rate===sampleRate*channels*2,502,'Formato de voz no válido.');}if(tag(i)==='data')data+=size;i=end+(size%2);}
 check(format&&rate>0&&data/rate>=.1&&data/rate<=120,502,'El audio generado no tiene una duración reproducible.');return true;
}
export async function ensureLessonAudio(env,owner,lesson,fetcher=fetch){
 check(env.BUCKET,503,'El almacenamiento de audio no está configurado.');const hash=await audioHash(lesson),db=env.DB;
 const existing=await db.prepare('SELECT * FROM lesson_audio WHERE owner=? AND hash=?').bind(owner,hash).first();
 if(existing?.ready_at&&await env.BUCKET.get(existing.object_key))return hash;
 check(env.OPENAI_API_KEY,503,'La voz de OpenAI aún no está configurada en el servidor.');
 const count=await db.prepare('SELECT count(*) AS n FROM lesson_audio WHERE owner=? AND created_at>?').bind(owner,new Date(Date.now()-86400000).toISOString()).first();check(count.n<300,429,'Alcanzaste el límite diario de audios. Los audios guardados siguen disponibles.');
 const token=crypto.randomUUID(),stamp=new Date().toISOString(),key=`audio/${await digest(owner)}/${hash}.wav`;
 const lock=await db.prepare('INSERT INTO lesson_audio(owner,hash,object_key,created_at,lock_until,token) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,hash) DO UPDATE SET lock_until=excluded.lock_until,token=excluded.token,ready_at=NULL WHERE lesson_audio.lock_until<?').bind(owner,hash,key,stamp,new Date(Date.now()+90000).toISOString(),token,stamp).run();
 check(lock.meta.changes===1,409,'El audio se está preparando. Espera unos segundos y vuelve a intentarlo.');
 try{
  let response;try{response=await fetcher('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'coral',input:narration(lesson),instructions:'Habla en español latinoamericano con voz cálida y natural. Lee la consigna y las opciones despacio, claramente, con pausas. Para las letras aisladas pronuncia su nombre en español. No añadas información ni reveles la respuesta correcta.',response_format:'wav',speed:.9})})}catch{throw new HttpError(502,'No se pudo preparar la voz. Tus ejercicios están guardados; vuelve a intentarlo.');}
  check(response.ok,response.status===429?429:502,'No se pudo generar el audio. Comprueba la conexión o la cuota de OpenAI y reintenta.');
  const reader=response.body.getReader(),chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>3*1024*1024){await reader.cancel();throw new HttpError(502,'El audio generado es demasiado grande.');}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}normalizeWav(bytes.buffer);validateWav(bytes.buffer);
  await env.BUCKET.put(key,bytes.buffer,{httpMetadata:{contentType:'audio/wav'}});
  await db.prepare('UPDATE lesson_audio SET ready_at=?,lock_until=? WHERE owner=? AND hash=? AND token=?').bind(new Date().toISOString(),stamp,owner,hash,token).run();return hash;
 }catch(error){await db.prepare('DELETE FROM lesson_audio WHERE owner=? AND hash=? AND token=? AND ready_at IS NULL').bind(owner,hash,token).run();throw error;}
}
export async function prepareAudioBatch(env,owner,lessons,fetcher){
 const unique=[...new Map(lessons.map(l=>[narration(l),l])).values()],hashes=new Map();let cursor=0;
 const results=await Promise.allSettled(Array.from({length:Math.min(3,unique.length)},async()=>{while(cursor<unique.length){const lesson=unique[cursor++];hashes.set(narration(lesson),await ensureLessonAudio(env,owner,lesson,fetcher));}}));
 const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;return lessons.map(l=>hashes.get(narration(l)));
}
export async function serveLessonAudio(request,env,owner,lesson){
 const hash=await audioHash(lesson),record=await env.DB.prepare('SELECT object_key FROM lesson_audio WHERE owner=? AND hash=? AND ready_at IS NOT NULL').bind(owner,hash).first();
 const object=record&&await env.BUCKET?.get(record.object_key);check(object,404,'El audio todavía no está preparado. Pulsa Escuchar para prepararlo.');
 const bytes=await object.arrayBuffer(),length=bytes.byteLength,headers={'Content-Type':'audio/wav','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
 const range=request.headers.get('range');if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${length}`}});const start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2])),end=match[1]?(match[2]?Math.min(Number(match[2]),length-1):length-1):length-1;if(start>=length||end<start)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${length}`}});return new Response(bytes.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${length}`,'Content-Length':String(end-start+1)}});}
 return new Response(bytes,{headers:{...headers,'Content-Length':String(length)}});
}
