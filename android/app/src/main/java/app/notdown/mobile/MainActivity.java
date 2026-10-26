package app.notdown.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotdownVaultPlugin.class);
        registerPlugin(NotdownSyncHttpPlugin.class);
        super.onCreate(savedInstanceState);
        // Observe actual IME visibility: focus can remain in the editor after Android hides it.
        getBridge().getWebView().getViewTreeObserver().addOnGlobalLayoutListener(new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
            private Boolean lastVisible;
            @Override public void onGlobalLayout() {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
                if (insets == null) return;
                boolean visible = insets.isVisible(WindowInsetsCompat.Type.ime());
                if (lastVisible == null || lastVisible != visible) {
                    lastVisible = visible;
                    getBridge().triggerWindowJSEvent("notdown:keyboard-state", "{\"visible\":" + visible + "}");
                }
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
                if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
                    WindowCompat.getInsetsController(getWindow(), getBridge().getWebView()).hide(WindowInsetsCompat.Type.ime());
                    getBridge().triggerWindowJSEvent("notdown:keyboard-dismiss", "{}");
                    return;
                }
                getBridge().triggerWindowJSEvent("notdown:back", "{}");
            }
        });
    }
}
