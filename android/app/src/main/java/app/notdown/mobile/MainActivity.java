package app.notdown.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotdownVaultPlugin.class);
        registerPlugin(NotdownSyncHttpPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().triggerWindowJSEvent("notdown:back", "{}");
            }
        });
    }
}
