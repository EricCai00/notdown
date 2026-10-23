package app.notdown.mobile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** Byte-preserving HTTPS transport for sync, including WebDAV verbs that URLConnection rejects. */
public final class SyncHttpClient implements AutoCloseable {
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    private static final Set<String> METHODS = new HashSet<>(Arrays.asList("GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PROPFIND", "MKCOL"));
    private final OkHttpClient client = new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .retryOnConnectionFailure(false).connectTimeout(20, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS).callTimeout(45, TimeUnit.SECONDS).build();
    private final Map<String, Call> pending = new ConcurrentHashMap<>();
    public static final class Result {
        public final int status; public final Map<String, String> headers; public final byte[] data;
        Result(int status, Map<String, String> headers, byte[] data) { this.status = status; this.headers = headers; this.data = data; }
    }
    public Result request(String id, String address, String method, Map<String, String> headers, byte[] data) throws IOException {
        URI uri;
        try { uri = URI.create(address); } catch (RuntimeException error) { throw new IOException("Invalid sync address"); }
        boolean loopback = Arrays.asList("localhost", "127.0.0.1", "[::1]", "::1").contains(uri.getHost() == null ? "" : uri.getHost());
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null ||
            !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()) && loopback)) throw new IOException("Sync requires HTTPS");
        if (id == null || !id.matches("[a-zA-Z0-9-]{1,80}") || !METHODS.contains(method)) throw new IOException("Invalid sync request");
        if (data != null && data.length > MAX_BYTES || headers.size() > 64) throw new IOException("Sync request is too large");
        Request.Builder builder = new Request.Builder().url(address);
        for (Map.Entry<String, String> header : headers.entrySet()) {
            if (header.getValue() == null || header.getValue().length() > 16384 || header.getValue().contains("\r") || header.getValue().contains("\n")) throw new IOException("Invalid sync header");
            builder.header(header.getKey(), header.getValue());
        }
        boolean bodyRequired = method.equals("POST") || method.equals("PUT");
        builder.method(method, data != null || bodyRequired ? RequestBody.create(data == null ? new byte[0] : data, null) : null);
        Call call = client.newCall(builder.build());
        if (pending.putIfAbsent(id, call) != null) throw new IOException("Duplicate sync request");
        try (Response response = call.execute()) {
            Map<String, String> resultHeaders = new LinkedHashMap<>();
            for (String name : response.headers().names()) resultHeaders.put(name, response.header(name));
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!method.equals("HEAD") && response.body() != null) {
                if (response.body().contentLength() > MAX_BYTES) throw new IOException("Sync response is too large");
                try (InputStream stream = response.body().byteStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (output.size() + count > MAX_BYTES) throw new IOException("Sync response is too large");
                        output.write(buffer, 0, count);
                    }
                }
            }
            return new Result(response.code(), resultHeaders, output.toByteArray());
        } finally { pending.remove(id, call); }
    }
    public void cancel(String id) { Call call = pending.get(id); if (call != null) call.cancel(); }
    @Override public void close() { for (Call call : pending.values()) call.cancel(); client.connectionPool().evictAll(); client.dispatcher().executorService().shutdown(); }
}
