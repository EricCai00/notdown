package app.notdown.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NotdownSyncHttp")
public class NotdownSyncHttpPlugin extends Plugin {
    private final SyncHttpClient client = new SyncHttpClient();
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    @PluginMethod public void request(PluginCall call) {
        executor.execute(() -> {
            try {
                JSObject supplied = call.getObject("headers", new JSObject());
                Map<String, String> headers = new LinkedHashMap<>();
                for (Iterator<String> keys = supplied.keys(); keys.hasNext();) { String key = keys.next(); headers.put(key, supplied.getString(key)); }
                String body = call.getString("data");
                if (body != null && body.length() > 45 * 1024 * 1024) throw new IllegalArgumentException();
                SyncHttpClient.Result result = client.request(call.getString("id"), call.getString("url"), call.getString("method", "GET"), headers, body == null ? null : Base64.getDecoder().decode(body));
                JSObject responseHeaders = new JSObject(); for (Map.Entry<String, String> item : result.headers.entrySet()) responseHeaders.put(item.getKey(), item.getValue());
                call.resolve(new JSObject().put("status", result.status).put("headers", responseHeaders).put("data", Base64.getEncoder().encodeToString(result.data)));
            } catch (Exception error) { call.reject("Native sync request failed. Check the HTTPS address, network, and server availability.", "SYNC_HTTP_ERROR"); }
        });
    }
    @PluginMethod public void cancel(PluginCall call) { client.cancel(call.getString("id", "")); call.resolve(); }
    @Override protected void handleOnDestroy() { client.close(); executor.shutdownNow(); }
}
