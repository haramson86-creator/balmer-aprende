package com.balmer.aprende;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    AppUpdater updater;
    @Override public void onCreate(Bundle state) {
        registerPlugin(AppUpdatesPlugin.class);
        super.onCreate(state);
        updater = new AppUpdater(this);
    }
    @Override public void onResume() {
        super.onResume();
        if (updater != null) updater.resume();
    }
}
