import {SITE_VERSION} from './version.js';
export const APK_URL=`https://github.com/haramson86-creator/balmer-aprende/releases/download/v${SITE_VERSION}/Balmer-Aprende-${SITE_VERSION}.apk`;

let updatePlugin;
let installedInfo;
const canUpdate=()=>window.Capacitor?.isPluginAvailable?.('AppUpdates');
const nativeUpdater=()=>({getInfo:()=>window.Capacitor.nativePromise('AppUpdates','getInfo',{}),check:()=>window.Capacitor.nativePromise('AppUpdates','check',{})});
export function androidDownloadCard(){
  return `<section class="android-download" aria-labelledby="android-download-title"><div><span class="eyebrow">APRENDE EN ANDROID</span><h2 id="android-download-title">Lleva tus prácticas contigo</h2><p>Descarga la APK ${SITE_VERSION} desde GitHub y comparte el enlace con tu familia. Sin iniciar sesión para descargar.</p><small>Android 7 o posterior · ≈4 MB · Versión de prueba · Requiere Internet</small></div><div class="android-download-actions"><a class="btn" href="${APK_URL}" target="_blank" rel="noopener noreferrer">↓ Descargar APK</a><button class="btn secondary" data-share-apk>Compartir enlace</button>${canUpdate()?'<button class="btn secondary" data-check-update>Buscar actualizaciones</button>':''}</div></section>`;
}

export function bindAndroidShare(toast){
  if(canUpdate()){
    updatePlugin||=nativeUpdater();
    installedInfo||=updatePlugin.getInfo().catch(()=>null);
    installedInfo.then(info=>{if(info?.version)document.querySelectorAll('[data-app-version]').forEach(node=>{node.textContent=`App ${info.version} · Site ${SITE_VERSION}`;});});
  }
  document.querySelectorAll('[data-check-update]').forEach(button=>button.onclick=async()=>{try{updatePlugin||=nativeUpdater();await updatePlugin.check();}catch{toast('No se pudo comprobar la actualización. Inténtalo de nuevo.');}});
  document.querySelectorAll('[data-share-apk]').forEach(button=>button.onclick=async()=>{
    try{
      if(navigator.share){await navigator.share({title:'Balmer Aprende para Android',text:'Descarga Aprende para practicar lectura y escritura en familia.',url:APK_URL});return;}
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(APK_URL);toast('Enlace de la APK copiado. Ya puedes compartirlo.');return;}
      window.prompt('Copia este enlace para compartir la APK:',APK_URL);
    }catch(error){
      if(error.name==='AbortError')return;
      window.prompt('Copia este enlace para compartir la APK:',APK_URL);
    }
  });
}
