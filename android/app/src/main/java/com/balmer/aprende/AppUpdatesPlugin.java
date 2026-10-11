package com.balmer.aprende;

import com.getcapacitor.Plugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdates")
public class AppUpdatesPlugin extends Plugin {
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
