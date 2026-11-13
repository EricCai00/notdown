package app.notdown.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.ResultReceiver;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.util.LinkedHashMap;
import java.util.Map;

/** Keeps only an existing WebView sync alive. No restart, alarm, or periodic scheduling. */
public class SyncForegroundService extends Service {
    static final String CHANNEL = "active-sync";
    static final int NOTIFICATION = 4102;
    static SyncForegroundService instance; // Accessed only on the main looper.
    private final Map<String, ResultReceiver> sessions = new LinkedHashMap<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> stopSessions(true);
    private PowerManager.WakeLock wakeLock;

    @Override public void onCreate() {
        super.onCreate(); instance = this;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.sync_channel), NotificationManager.IMPORTANCE_LOW));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String token = intent == null ? null : intent.getStringExtra("token");
        ResultReceiver receiver = intent == null ? null : intent.getParcelableExtra("receiver");
        if (token == null || receiver == null) { if (sessions.isEmpty()) stopSelf(); return START_NOT_STICKY; }
        try {
            if (sessions.isEmpty()) {
                ServiceCompat.startForeground(this, NOTIFICATION, notification(0, 0), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":active-sync");
                wakeLock.setReferenceCounted(false);
                // Also bounded if the WebView or bridge fails to release its lease.
                wakeLock.acquire(90 * 60 * 1000L);
                handler.postDelayed(timeout, 90 * 60 * 1000L);
            }
            sessions.put(token, receiver);
            receiver.send(0, null);
        } catch (RuntimeException error) {
            receiver.send(1, null);
            if (sessions.isEmpty()) stopSessions(false);
        }
        return START_NOT_STICKY;
    }

    boolean contains(String token) { return sessions.containsKey(token); }
    void update(String token, int completed, int total) {
        if (contains(token)) getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(completed, total));
    }
    void finish(String token) {
        sessions.remove(token);
        if (sessions.isEmpty()) stopSessions(false);
    }
    private Notification notification(int completed, int total) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_sync_notification)
            .setContentTitle(getString(R.string.sync_running)).setContentText(getString(R.string.sync_continue))
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setProgress(Math.max(0, total), Math.max(0, Math.min(completed, total)), total <= 0).build();
    }
    private void stopSessions(boolean expired) {
        Map<String, ResultReceiver> previous = new LinkedHashMap<>(sessions); sessions.clear();
        handler.removeCallbacks(timeout);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (expired) for (ResultReceiver receiver : previous.values()) receiver.send(2, null);
        stopSelf();
    }
    @Override public void onTimeout(int startId, int foregroundServiceType) { stopSessions(true); }
    @Override public void onDestroy() {
        stopSessions(true);
        if (instance == this) instance = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
