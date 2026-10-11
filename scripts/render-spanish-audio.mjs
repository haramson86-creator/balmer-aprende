// Build-time only. Install @echogarden/espeak-ng-emscripten@0.3.5 in a separate tools directory.
// Usage: node scripts/render-spanish-audio.mjs /absolute/path/to/espeak-ng.js
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import os from 'node:os';
if(!process.argv[2])throw new Error('Pass absolute build-time espeak module path');
const {default:init}=await import(pathToFileURL(path.resolve(process.argv[2])).href);const m=await init();const s=new m.eSpeakNGWorker();s.set_voice('es-419');s.set_rate(.84);s.set_pitch(1.08);s.set_range(.95);
const clips={
 'letter-m':'¿Cuál de estas letras es la eme? Toca la letra eme.',
 'complete-mano':'Completa la palabra mano. Ma... ¿qué falta? Elige la sílaba que falta.',
 'match-sol':'Une cada palabra con su dibujo. Primero toca una palabra, y después la imagen que corresponde.',
 'trace-o':'Repasa la letra o. Sigue los puntos con tu dedo o con un lápiz táctil. Cuando termines, toca terminé.',
 'read-sol':'Lee con un adulto. El sol sale. ¿Qué sale?',
 'free-m':'Intenta escribir la letra eme con tu dedo o con un lápiz táctil. Cuando termines, toca terminé. Esta práctica no tiene nota.',
 'word-sol':'Sol.', 'word-luna':'Luna.', 'word-flor':'Flor.', 'word-mano':'Mano.',
 'letter-o':'La letra o.', 'letter-eme':'La letra eme.',
 'feedback-done':'¡Buen intento! Tu práctica está guardada. Puedes practicar otra vez, o seguir explorando.'
};
const out=path.resolve('dist/assets/audio');fs.mkdirSync(out,{recursive:true});const records=[];
for(const [id,text]of Object.entries(clips)){const chunks=[];s.synthesize(text,samples=>{if(samples?.length)chunks.push(Buffer.from(new Uint8Array(samples.buffer,samples.byteOffset,samples.byteLength)))});const pcm=Buffer.concat(chunks);if(pcm.length<2000)throw new Error('Empty synthesis '+id);const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(22050,24);h.writeUInt32LE(44100,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);const wav=path.join(os.tmpdir(),'aprende-'+id+'.wav');fs.writeFileSync(wav,Buffer.concat([h,pcm]));const output=path.join(out,id+'.mp3');const result=spawnSync('ffmpeg',['-y','-v','error','-i',wav,'-codec:a','libmp3lame','-b:a','48k','-ar','22050','-ac','1',output],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);fs.unlinkSync(wav);records.push({id,path:'assets/audio/'+id+'.mp3',text,voice:'es-419',engine:'espeak-ng-emscripten@0.3.5',durationSeconds:+(pcm.length/44100).toFixed(2),bytes:fs.statSync(output).size,qualityStatus:'synthetic_prototype_human_review_pending'});}
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schemaVersion:1,language:'es-419',generation:'local_build_time_no_cloud',clips:records},null,2));console.log(JSON.stringify({clips:records.length,bytes:records.reduce((s,c)=>s+c.bytes,0),seconds:records.reduce((s,c)=>s+c.durationSeconds,0)}));
