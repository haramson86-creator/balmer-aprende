package com.balmer.aprende;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

final class AppUpdater {
    private final MainActivity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean busy;
    private long lastCheck;
    private File pending;
    AppUpdater(MainActivity activity) { this.activity = activity; }
    void resume() {
        if (pending != null) { File file=pending; pending=null; install(file); return; }
        if (System.currentTimeMillis()-lastCheck>3600000) check(false);
    }
    static boolean isNewer(String candidate, String installed) {
        if (!candidate.matches("v?\\d+\\.\\d+\\.\\d+") || !installed.matches("\\d+\\.\\d+\\.\\d+")) return false;
        String[] a=candidate.replaceFirst("^v", "").split("\\."), b=installed.split("\\.");
        try { for(int i=0;i<3;i++){long x=Long.parseLong(a[i]),y=Long.parseLong(b[i]);if(x!=y)return x>y;} } catch(NumberFormatException ignored){}
        return false;
    }
    void check(boolean manual) {
        if (busy || activity.isFinishing()) return;
        busy=true;lastCheck=System.currentTimeMillis();
        if(manual) toast("Buscando actualizaciones…");
        worker.execute(() -> {
            try {
                JSONObject release;
                try(InputStream input=open(new URL("https://api.github.com/repos/haramson86-creator/balmer-aprende/releases/latest"))){release=new JSONObject(new String(readLimited(input,1024*1024),java.nio.charset.StandardCharsets.UTF_8));}
                String version=release.getString("tag_name");
                PackageInfo installed=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0);
                if(release.optBoolean("draft")||release.optBoolean("prerelease")||!isNewer(version,installed.versionName)){activity.runOnUiThread(()->{busy=false;if(manual)toast("Tienes la última versión: "+installed.versionName);});return;}
                JSONArray assets=release.getJSONArray("assets");JSONObject apk=null;
                for(int i=0;i<assets.length();i++){JSONObject a=assets.getJSONObject(i);if(a.optString("name").equals("Balmer-Aprende-"+version.replaceFirst("^v", "")+".apk")&&a.optString("state").equals("uploaded"))apk=a;}
                if(apk==null)throw new IOException("APK no disponible");
                final JSONObject selected=apk;
                activity.runOnUiThread(()->{busy=false;if(activity.isFinishing())return;new AlertDialog.Builder(activity).setTitle("Nueva versión "+version).setMessage("Tienes Aprende "+installed.versionName+". Puedes descargar e instalar la nueva versión conservando tus datos. Android te pedirá confirmar la instalación.").setNegativeButton("Más tarde",(d,w)->{}).setPositiveButton("Actualizar",(d,w)->download(selected)).show();});
            }catch(Exception error){activity.runOnUiThread(()->{busy=false;if(manual)toast("No se pudo comprobar la versión. Revisa tu conexión e inténtalo de nuevo.");});}
        });
    }
    private void download(JSONObject asset) {
        if(busy)return;busy=true;
        AlertDialog progress=new AlertDialog.Builder(activity).setTitle("Descargando actualización").setMessage("Descargando desde GitHub y verificando la APK…").setCancelable(false).show();
        worker.execute(()->{
            File file=new File(activity.getCacheDir(),"aprende-update.apk");
            try {
                String address=asset.getString("browser_download_url"),digest=asset.getString("digest");
                if(!address.startsWith("https://github.com/haramson86-creator/balmer-aprende/releases/download/")||!digest.matches("sha256:[a-f0-9]{64}"))throw new IOException("Referencia no válida");
                long expected=asset.getLong("size");if(expected<1||expected>100*1024*1024)throw new IOException("Tamaño no válido");
                MessageDigest hash=MessageDigest.getInstance("SHA-256");long count=0;
                try(InputStream input=open(new URL(address));OutputStream output=new FileOutputStream(file)){byte[] buffer=new byte[16384];int n;while((n=input.read(buffer))!=-1){count+=n;if(count>expected)throw new IOException("Tamaño incorrecto");hash.update(buffer,0,n);output.write(buffer,0,n);}}
                StringBuilder actual=new StringBuilder();for(byte b:hash.digest())actual.append(String.format(Locale.ROOT,"%02x",b&255));
                if(count!=expected||!digest.equals("sha256:"+actual))throw new IOException("Checksum incorrecto");
                verifyPackage(file);
                activity.runOnUiThread(()->{busy=false;progress.dismiss();install(file);});
            }catch(Exception error){file.delete();activity.runOnUiThread(()->{busy=false;progress.dismiss();new AlertDialog.Builder(activity).setTitle("Actualización no instalada").setMessage("No se pudo descargar o verificar la APK. Conservas tu versión actual. Comprueba tu conexión y vuelve a intentar desde Buscar actualizaciones.").setPositiveButton("Entendido",null).show();});}
        });
    }
    @SuppressWarnings("deprecation") private void verifyPackage(File file) throws Exception {
        PackageManager pm=activity.getPackageManager();int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
        PackageInfo current=pm.getPackageInfo(activity.getPackageName(),flags),next=pm.getPackageArchiveInfo(file.getAbsolutePath(),flags);
        if(next==null||!activity.getPackageName().equals(next.packageName)||next.versionCode<=current.versionCode)throw new IOException("Paquete o versión incorrectos");
        Signature[] a=Build.VERSION.SDK_INT>=28?current.signingInfo.getApkContentsSigners():current.signatures;
        Signature[] b=Build.VERSION.SDK_INT>=28?next.signingInfo.getApkContentsSigners():next.signatures;
        if(a==null||b==null||!new HashSet<>(Arrays.asList(a)).equals(new HashSet<>(Arrays.asList(b))))throw new IOException("Certificado incorrecto");
    }
    private void install(File file) {
        if(Build.VERSION.SDK_INT>=26&&!activity.getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(activity).setTitle("Permitir la actualización").setMessage("Android requiere permitir que Aprende instale su actualización. Activa el permiso en la siguiente pantalla y vuelve a la app. Después podrás confirmar la instalación.").setNegativeButton("Cancelar",(d,w)->{}).setPositiveButton("Abrir ajustes",(d,w)->{pending=file;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}).show();return;
        }
        try { Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",file);Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivity(intent); }
        catch(Exception error){toast("Android no pudo abrir el instalador. Inténtalo de nuevo.");}
    }
    private void toast(String message){Toast.makeText(activity,message,Toast.LENGTH_LONG).show();}
    private static InputStream open(URL url) throws IOException {
        for(int redirects=0;redirects<6;redirects++){
            String host=url.getHost();if(!url.getProtocol().equals("https")||!(host.equals("api.github.com")||host.equals("github.com")||host.equals("release-assets.githubusercontent.com")||host.equals("objects.githubusercontent.com")))throw new IOException("Servidor no permitido");
            HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(20000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);c.setRequestProperty("User-Agent","Balmer-Aprende-Android");
            int status=c.getResponseCode();if(status>=300&&status<400){String location=c.getHeaderField("Location");c.disconnect();url=new URL(url,location);continue;}if(status!=200){c.disconnect();throw new IOException("HTTP "+status);}return c.getInputStream();
        }throw new IOException("Demasiadas redirecciones");
    }
    private static byte[] readLimited(InputStream input,int limit)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(out.size()+n>limit)throw new IOException("Respuesta demasiado grande");out.write(buffer,0,n);}return out.toByteArray();}
}
