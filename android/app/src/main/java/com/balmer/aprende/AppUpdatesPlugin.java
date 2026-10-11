package com.balmer.aprende;

import com.getcapacitor.Plugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdates")
public class AppUpdatesPlugin extends Plugin {
    @PluginMethod public void beginLogin(PluginCall call) {
        try {
            byte[] bytes = new byte[32]; new java.security.SecureRandom().nextBytes(bytes);
            StringBuilder verifier = new StringBuilder(); for(byte b:bytes) verifier.append(String.format("%02x", b & 255));
            byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(verifier.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder challenge=new StringBuilder();for(byte b:digest) challenge.append(String.format("%02x",b & 255));
            getContext().getSharedPreferences("aprende-auth",0).edit().putString("verifier",verifier.toString()).putLong("started",System.currentTimeMillis()).remove("ticket").apply();
            String returnTo="/?parent=1&native="+challenge;
            android.net.Uri uri=android.net.Uri.parse("https://balmer-aprende-pwa.balmerbs.chatgpt.site/signin-with-chatgpt?return_to="+android.net.Uri.encode(returnTo));
            getActivity().startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,uri));
            call.resolve();
        }catch(Exception error){call.reject("No se pudo abrir el navegador para entrar.");}
    }
    @PluginMethod public void pendingLogin(PluginCall call) {
        android.content.SharedPreferences prefs=getContext().getSharedPreferences("aprende-auth",0);
        String ticket=prefs.getString("ticket",null),verifier=prefs.getString("verifier",null);
        JSObject value=new JSObject();
        if(ticket!=null&&verifier!=null&&System.currentTimeMillis()-prefs.getLong("started",0)<600000){value.put("ticket",ticket);value.put("verifier",verifier);}
        if(ticket!=null)prefs.edit().clear().apply();
        call.resolve(value);
    }
    @PluginMethod public void getInfo(PluginCall call) {
        try {
            android.content.pm.PackageInfo info=getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0);
            JSObject value=new JSObject();
            value.put("version",info.versionName);
            value.put("versionCode",android.os.Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode);
            call.resolve(value);
        } catch (Exception error) { call.reject("No se pudo leer la versión instalada."); }
    }
    @PluginMethod public void check(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            if (activity.updater != null) activity.updater.check(true);
            call.resolve();
        });
    }
}
