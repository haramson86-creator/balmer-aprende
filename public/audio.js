let current=null;let revoke=null;let voiceRun=0;
export function stopVoice(){voiceRun++;if(current){current.pause();current.currentTime=0;current.hidden=true;current.removeAttribute('src');current.load?.();current=null}if(revoke){URL.revokeObjectURL(revoke);revoke=null}window.speechSynthesis?.cancel()}
export async function playVoice(source,player=null){stopVoice();const url=source instanceof Blob?(revoke=URL.createObjectURL(source)):source;current=player||new Audio();current.hidden=false;current.src=url;current.volume=.85;await current.play()}
export function hasBundledVoice(activity){return !!activity.audio||activity.audioBlob instanceof Blob}
const voiceCache=new Map();let cacheEpoch=0;
export function clearVoiceCache(){cacheEpoch++;stopVoice();voiceCache.clear()}
export function preloadLessonVoice(activity){
 if(!activity?.cloud)return Promise.resolve(null);
 const key=activity.id+':'+activity.revision+':'+activity.prompt;
 if(voiceCache.has(key))return voiceCache.get(key);
 const epoch=cacheEpoch;
 const pending=(async()=>{const request=async method=>{const r=await fetch('/api/lessons/'+activity.id+'/audio',{method,credentials:'same-origin',cache:'no-store',headers:{'X-Aprende-Request':'1'}});return r};let r=await request('GET');if(r.status===404){const made=await request('POST');if(!made.ok)throw new Error('No se pudo preparar la voz. Reintenta Escuchar.');r=await request('GET')}if(!r.ok)throw new Error('No se pudo cargar la voz.');const blob=await r.blob();await validateVoiceBlob(blob);if(epoch!==cacheEpoch)throw new Error('Sesión cerrada');return blob})().catch(e=>{voiceCache.delete(key);throw e});
 voiceCache.set(key,pending);return pending;
}
export async function playLessonVoice(activity,player=null){
 if(!activity.cloud)return playVoice(activity.audioBlob||activity.audio,player);
 stopVoice();const run=voiceRun,blob=await preloadLessonVoice(activity);if(run!==voiceRun)return;await playVoice(blob,player);activity.audioReady=true;
}

export async function validateVoiceBlob(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),audio=new Audio();let settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');URL.revokeObjectURL(url);error?reject(error):resolve(true)};const timer=setTimeout(()=>finish(new Error('Audio no verificable')),7000);audio.preload='metadata';audio.onloadedmetadata=()=>{const duration=audio.duration;const valid=Number.isFinite(duration)&&duration>0&&duration<=120;finish(valid?null:new Error('Audio fuera de duración'))};audio.onerror=()=>finish(new Error('Audio no reproducible'));audio.src=url})}
