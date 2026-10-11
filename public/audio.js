let current=null;let revoke=null;let voiceRun=0;
export function stopVoice(){voiceRun++;if(current){current.pause();current.currentTime=0;current=null}if(revoke){URL.revokeObjectURL(revoke);revoke=null}window.speechSynthesis?.cancel()}
export async function playVoice(source,player=null){stopVoice();const url=source instanceof Blob?(revoke=URL.createObjectURL(source)):source;current=player||new Audio();current.hidden=false;current.src=url;current.volume=.85;await current.play()}
export function hasBundledVoice(activity){return !!activity.audio||activity.audioBlob instanceof Blob}
export async function playLessonVoice(activity,player=null){
 if(!activity.cloud)return playVoice(activity.audioBlob||activity.audio);
 stopVoice();const run=voiceRun;
 const request=async(method)=>{const response=await fetch(`/api/lessons/${activity.id}/audio`,{method,credentials:'same-origin',cache:'no-store',headers:{'X-Aprende-Request':'1'}});if(!response.ok){let error;try{error=(await response.json()).error}catch{}throw new Error(error||'No se pudo cargar la voz. Vuelve a intentarlo.');}return response;};
 let response=await fetch(`/api/lessons/${activity.id}/audio`,{credentials:'same-origin',cache:'no-store'});
 if(response.status===404){await request('POST');if(run!==voiceRun)return;response=await request('GET');}
 else if(!response.ok){let error;try{error=(await response.json()).error}catch{}throw new Error(error||'No se pudo cargar el audio.');}
 const blob=await response.blob();await validateVoiceBlob(blob);if(run!==voiceRun)return;await playVoice(blob,player);activity.audioReady=true;
}

export async function validateVoiceBlob(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),audio=new Audio();let settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');URL.revokeObjectURL(url);error?reject(error):resolve(true)};const timer=setTimeout(()=>finish(new Error('Audio no verificable')),7000);audio.preload='metadata';audio.onloadedmetadata=()=>{const duration=audio.duration;const valid=Number.isFinite(duration)&&duration>0&&duration<=120;finish(valid?null:new Error('Audio fuera de duración'))};audio.onerror=()=>finish(new Error('Audio no reproducible'));audio.src=url})}
