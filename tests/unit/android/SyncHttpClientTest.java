package app.notdown.mobile;

import org.junit.Test;
import static org.junit.Assert.*;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.RecordedRequest;
import okio.Buffer;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public class SyncHttpClientTest {
    @Test public void webDavVerbsAndBinaryBodiesRoundTripWithoutWebViewCors() throws Exception {
        MockWebServer server = new MockWebServer(); server.start();
        byte[] data = new byte[]{ 0, (byte)255, (byte)128, 13, 10 };
        server.enqueue(new MockResponse().setResponseCode(207).setBody("<multistatus/>"));
        server.enqueue(new MockResponse().setResponseCode(201));
        server.enqueue(new MockResponse().setResponseCode(200).setHeader("ETag", "\"version-one\"").setBody(new Buffer().write(data)));
        server.enqueue(new MockResponse().setResponseCode(201));
        try (SyncHttpClient client = new SyncHttpClient()) {
            String url = "http://127.0.0.1:" + server.getPort() + "/dav/";
            Map<String, String> headers = new LinkedHashMap<>(); headers.put("Authorization", "Basic test"); headers.put("Depth", "0");
            assertEquals(207, client.request(UUID.randomUUID().toString(), url, "PROPFIND", headers, null).status);
            RecordedRequest propfind = server.takeRequest(); assertEquals("PROPFIND", propfind.getMethod()); assertEquals("Basic test", propfind.getHeader("Authorization"));
            client.request(UUID.randomUUID().toString(), url, "PUT", headers, data);
            RecordedRequest put = server.takeRequest(); assertEquals("PUT", put.getMethod()); assertArrayEquals(data, put.getBody().readByteArray());
            SyncHttpClient.Result result = client.request(UUID.randomUUID().toString(), url, "GET", headers, null);
            assertArrayEquals(data, result.data); assertEquals("\"version-one\"", result.headers.get("ETag")); server.takeRequest();
            client.request(UUID.randomUUID().toString(), url, "MKCOL", headers, null); assertEquals("MKCOL", server.takeRequest().getMethod());
        } finally { server.shutdown(); }
    }
    @Test public void redirectsNeverForwardCredentialsToAnotherEndpoint() throws Exception {
        MockWebServer server = new MockWebServer(); server.start();
        server.enqueue(new MockResponse().setResponseCode(302).setHeader("Location", "/target"));
        server.enqueue(new MockResponse().setResponseCode(200));
        try (SyncHttpClient client = new SyncHttpClient()) {
            String url = "http://127.0.0.1:" + server.getPort() + "/redirect";
            assertEquals(302, client.request("redirect-test", url, "GET", Collections.singletonMap("Authorization", "Basic test"), null).status);
            assertEquals(1, server.getRequestCount());
        } finally { server.shutdown(); }
    }
    @Test public void unsafeSchemesAndMethodsAreRejectedBeforeNetworkAccess() throws Exception {
        try (SyncHttpClient client = new SyncHttpClient()) {
            for (String url : new String[]{ "http://example.com/dav/", "file:///private.txt", "https://user:password@example.com/" }) {
                try { client.request("invalid", url, "GET", Collections.emptyMap(), null); fail("unsafe address accepted"); }
                catch (java.io.IOException expected) { }
            }
            try { client.request("invalid", "https://example.com/", "CONNECT", Collections.emptyMap(), null); fail("unsupported method accepted"); }
            catch (java.io.IOException expected) { }
        }
    }
}
