package com.balmer.aprende;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdates")
public class AppUpdatesPlugin extends Plugin {
    @PluginMethod public void check(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            if (activity.updater != null) activity.updater.check(true);
            call.resolve();
        });
    }
}
