package app.notdown.mobile;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ResultReceiver;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "NotdownSyncExecution", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class NotdownSyncExecutionPlugin extends Plugin {
    private final Set<String> tokens = new HashSet<>();
    private boolean destroyed;
    private boolean background;
    private int previousPriority;
    private boolean previousWaived;

    @PluginMethod public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "notificationResult");
        } else begin(call);
    }
    @PermissionCallback private void notificationResult(PluginCall call) { begin(call); }
    private void begin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (destroyed) { call.reject("The sync view has closed."); return; }
            String token = UUID.randomUUID().toString();
            if (tokens.isEmpty()) {
                WebView view = getBridge().getWebView();
                previousPriority = view.getRendererRequestedPriority();
                previousWaived = view.getRendererPriorityWaivedWhenNotVisible();
                view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
                view.onResume();
                view.resumeTimers();
            }
            tokens.add(token);
            ResultReceiver receiver = new ResultReceiver(new Handler(Looper.getMainLooper())) {
                @Override protected void onReceiveResult(int code, Bundle data) {
                    if (code == 0 && !destroyed && tokens.contains(token)) call.resolve(new JSObject().put("token", token));
                    else {
                        release(token);
                        if (code == 1 || destroyed) call.reject("Android could not keep this sync running. Open Notdown and retry.");
                        if (code == 2) {
                            PluginHandle http = getBridge().getPlugin("NotdownSyncHttp");
                            if (http != null) ((NotdownSyncHttpPlugin) http.getInstance()).cancelActive();
                            notifyListeners("expired", new JSObject().put("token", token));
                        }
                    }
                }
            };
            try {
                getContext().startForegroundService(new Intent(getContext(), SyncForegroundService.class)
                    .putExtra("token", token).putExtra("receiver", receiver));
            } catch (RuntimeException error) {
                release(token); call.reject("Android could not start the sync service. Keep Notdown open and retry.");
            }
        });
    }
    @PluginMethod public void update(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String token = call.getString("token", "");
            SyncForegroundService service = SyncForegroundService.instance;
            if (!tokens.contains(token) || service == null || !service.contains(token)) { call.reject("Sync session ended."); return; }
            service.update(token, call.getInt("completed", 0), call.getInt("total", 0)); call.resolve();
        });
    }
    @PluginMethod public void finish(PluginCall call) {
        getActivity().runOnUiThread(() -> { release(call.getString("token", "")); call.resolve(); });
    }
    private void release(String token) {
        boolean owned = tokens.remove(token);
        SyncForegroundService service = SyncForegroundService.instance;
        if (service != null && service.contains(token)) service.finish(token);
        if (owned && tokens.isEmpty()) {
            getBridge().getWebView().setRendererPriorityPolicy(previousPriority, previousWaived);
            if (background) getBridge().getWebView().onPause();
        }
    }
    private void continueExecution() {
        // Run after Bridge/Cordova's pause/stop callbacks. The document remains hidden;
        // no display wake lock or new background sync is introduced.
        new Handler(Looper.getMainLooper()).post(() -> {
            if (!destroyed && !tokens.isEmpty()) {
                getBridge().getWebView().onResume();
                getBridge().getWebView().resumeTimers();
            }
        });
    }
    @Override protected void handleOnPause() { background = true; continueExecution(); }
    @Override protected void handleOnStop() { continueExecution(); }
    @Override protected void handleOnResume() { background = false; }
    @Override protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> {
            destroyed = true;
            for (String token : new HashSet<>(tokens)) release(token);
        });
    }
}
