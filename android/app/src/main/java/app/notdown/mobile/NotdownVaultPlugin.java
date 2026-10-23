package app.notdown.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.file.*;

@CapacitorPlugin(name = "NotdownVault")
public class NotdownVaultPlugin extends Plugin {
    private VaultFileStore files;
    private interface Operation { JSObject run() throws Exception; }
    private void execute(PluginCall call, Operation operation) {
        try {
            if (files == null) files = new VaultFileStore(getContext().getFilesDir().toPath());
            call.resolve(operation.run());
        } catch (Exception error) {
            String code = error instanceof VaultFileStore.StorageException ? ((VaultFileStore.StorageException) error).code :
                error instanceof NoSuchFileException ? "ENOENT" : error instanceof FileAlreadyExistsException ? "EEXIST" :
                error instanceof NotDirectoryException ? "ENOTDIR" : error instanceof DirectoryNotEmptyException ? "ENOTEMPTY" :
                error instanceof AccessDeniedException ? "EACCES" : "EIO";
            call.reject(error.getMessage() == null ? "Native storage operation failed" : error.getMessage(), code, error);
        }
    }
    private byte[] bytes(String value) { return Base64.decode(value == null ? "" : value, Base64.NO_WRAP); }
    @PluginMethod public void stat(PluginCall call) { execute(call, () -> new JSObject().put("kind", files.kind(call.getString("path")))); }
    @PluginMethod public void read(PluginCall call) { execute(call, () -> new JSObject().put("data", Base64.encodeToString(files.read(call.getString("path")), Base64.NO_WRAP))); }
    @PluginMethod public void list(PluginCall call) {
        execute(call, () -> {
            String directory = call.getString("path"); JSArray entries = new JSArray();
            for (String name : files.list(directory)) entries.put(new JSObject().put("name", name).put("kind", files.kind(directory + "/" + name)));
            return new JSObject().put("entries", entries);
        });
    }
    @PluginMethod public void mkdir(PluginCall call) { execute(call, () -> { files.mkdir(call.getString("path"), call.getBoolean("recursive", false)); return new JSObject(); }); }
    @PluginMethod public void write(PluginCall call) { execute(call, () -> { files.write(call.getString("path"), bytes(call.getString("data")), call.getBoolean("exclusive", false)); return new JSObject(); }); }
    @PluginMethod public void remove(PluginCall call) { execute(call, () -> { files.remove(call.getString("path"), call.getBoolean("force", false)); return new JSObject(); }); }
    @PluginMethod public void move(PluginCall call) { execute(call, () -> { files.move(call.getString("from"), call.getString("to")); return new JSObject(); }); }
    @PluginMethod public void link(PluginCall call) { execute(call, () -> { files.link(call.getString("from"), call.getString("to")); return new JSObject(); }); }
    @PluginMethod public void replace(PluginCall call) {
        execute(call, () -> { String expected = call.getString("expected"); files.replace(call.getString("from"), call.getString("to"), expected == null ? null : bytes(expected)); return new JSObject(); });
    }
    @PluginMethod public void acquire(PluginCall call) { execute(call, () -> new JSObject().put("token", files.acquire(call.getString("path")))); }
    @PluginMethod public void release(PluginCall call) { execute(call, () -> { files.release(call.getString("token")); return new JSObject(); }); }
    @PluginMethod public void background(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().moveTaskToBack(true); call.resolve(); });
    }
    @PluginMethod public void exportDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/zip");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "Notdown-backup.zip"));
        startActivityForResult(call, intent, "exportSelected");
    }
    @ActivityCallback private void exportSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject().put("saved", false)); return; }
        try {
            Uri uri = result.getData().getData();
            if (uri == null) throw new IOException("No destination selected");
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException("Cannot open the selected destination");
                output.write(bytes(call.getString("data"))); output.flush();
            }
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception error) { call.reject("Backup could not be exported. The vault remains saved on this device.", "EIO", error); }
    }
    @Override protected void handleOnPause() { notifyListeners("pause", new JSObject()); }
    @Override protected void handleOnResume() { notifyListeners("resume", new JSObject()); }
    @Override protected void handleOnDestroy() { if (files != null) try { files.close(); } catch (IOException ignored) {} }
}
