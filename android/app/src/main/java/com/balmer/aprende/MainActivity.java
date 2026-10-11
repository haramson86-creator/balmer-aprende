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
    }
    @Override public void onResume() {
        super.onResume();
        if (updater != null) updater.resume();
    }
}
