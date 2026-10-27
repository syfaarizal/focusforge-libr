package com.libr.focusforge;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Focus Lock native helper:
 *  - start()/stop(): Android screen pinning (Home/Recents locked, Android asks the user once)
 *  - isPinned(): whether the app is currently pinned
 *  - keepAwake({on}): keep the screen on during a session
 */
@CapacitorPlugin(name = "ScreenPin")
public class ScreenPinPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                activity.startLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                activity.stopLockTask();
            } catch (Exception ignored) {
                // not pinned
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void isPinned(PluginCall call) {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        JSObject res = new JSObject();
        res.put("pinned", am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE);
        call.resolve(res);
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (on) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }
}
