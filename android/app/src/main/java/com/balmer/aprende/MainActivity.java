package com.balmer.aprende;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    AppUpdater updater;
    @Override public void onCreate(Bundle state) {
        registerPlugin(AppUpdatesPlugin.class);
        super.onCreate(state);
        // Refresh network resources after an APK update while preserving sign-in cookies.
        getBridge().getWebView().clearCache(true);
        updater = new AppUpdater(this);
        acceptLogin(getIntent());
    }
    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent); setIntent(intent); acceptLogin(intent);
    }
    private void acceptLogin(android.content.Intent intent) {
        android.net.Uri uri=intent.getData();
        if(uri==null||!"balmeraprende".equals(uri.getScheme())||!"auth".equals(uri.getHost()))return;
        String ticket=uri.getQueryParameter("ticket");
        android.content.SharedPreferences prefs=getSharedPreferences("aprende-auth",0);
        if(ticket==null||!ticket.matches("[a-f0-9]{64}")||!prefs.contains("verifier")||System.currentTimeMillis()-prefs.getLong("started",0)>600000)return;
        prefs.edit().putString("ticket",ticket).apply();
        getBridge().getWebView().loadUrl("https://balmer-aprende-pwa.balmerbs.chatgpt.site/");
    }
    @Override public void onResume() {
        super.onResume();
        if (updater != null) updater.resume();
    }
}
