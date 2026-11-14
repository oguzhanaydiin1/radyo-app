package dev.oalabs.radyo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Arka planda çalma hizmeti: ekran kapalıyken ya da başka uygulamaya geçildiğinde sesin
 * durmaması için ön plan hizmeti, bildirimde ve kilit ekranında oynat/duraklat/önceki/sonraki,
 * kulaklık ve araç tuşları (MediaSession). Ses WebView'da çalmaya devam eder; bu hizmet
 * uygulamanın kapatılmasını önler ve komutları uygulamaya iletir.
 */
public class PlaybackService extends Service {

    static final String ACTION_UPDATE = "dev.oalabs.radyo.UPDATE";
    static final String ACTION_STOP_SERVICE = "dev.oalabs.radyo.STOP";
    static final String ACTION_CMD = "dev.oalabs.radyo.CMD";
    private static final String CHANNEL = "oa_playback";
    private static final int NOTIF_ID = 7101;

    static volatile boolean running = false;

    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private String title = "";
    private String artist = "";
    private boolean playing = false;
    private boolean canSkip = true;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Çalan yayın", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Çalan radyo, podcast ya da şarkı ve oynatma düğmeleri");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
        session = new MediaSessionCompat(this, "OARadyo");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { send("play"); }
            @Override public void onPause() { send("pause"); }
            @Override public void onSkipToNext() { send("next"); }
            @Override public void onSkipToPrevious() { send("prev"); }
            @Override public void onStop() { send("stop"); }
        });
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        session.setActive(true);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OARadyo:playback");
            wakeLock.setReferenceCounted(false);
        }
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_HIGH_PERF : WifiManager.WIFI_MODE_FULL, "OARadyo:wifi");
            wifiLock.setReferenceCounted(false);
        }
    }

    private void send(String action) {
        OANativePlugin p = OANativePlugin.instance;
        if (p != null) p.emitMedia(action);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP_SERVICE.equals(action)) {
            shutdown();
            return START_NOT_STICKY;
        }
        if (ACTION_CMD.equals(action)) {
            String cmd = intent.getStringExtra("cmd");
            if (cmd != null) send(cmd);
            if ("stop".equals(cmd)) {
                playing = false;
                shutdown();
            }
            return START_NOT_STICKY;
        }
        if (ACTION_UPDATE.equals(action) && intent != null) {
            title = intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "";
            artist = intent.getStringExtra("artist") != null ? intent.getStringExtra("artist") : "";
            playing = intent.getBooleanExtra("playing", false);
            canSkip = intent.getBooleanExtra("canSkip", true);
        }
        update();
        return START_NOT_STICKY;
    }

    private PendingIntent cmd(String c, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(ACTION_CMD).putExtra("cmd", c);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void update() {
        session.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .build());
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_STOP;
        if (canSkip) actions |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build());

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_oa)
            .setContentTitle(title.isEmpty() ? "OA Radyo" : title)
            .setContentText(artist)
            .setContentIntent(content)
            .setDeleteIntent(cmd("stop", 9))
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT);
        int[] compact;
        if (canSkip) {
            b.addAction(android.R.drawable.ic_media_previous, "Önceki", cmd("prev", 2));
            b.addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Duraklat" : "Çal", cmd("toggle", 3));
            b.addAction(android.R.drawable.ic_media_next, "Sonraki", cmd("next", 4));
            compact = new int[] { 0, 1, 2 };
        } else {
            b.addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Duraklat" : "Çal", cmd("toggle", 3));
            compact = new int[] { 0 };
        }
        b.setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
            .setMediaSession(session.getSessionToken())
            .setShowActionsInCompactView(compact));
        Notification n = b.build();

        if (playing) {
            if (Build.VERSION.SDK_INT >= 29) {
                ServiceCompat.startForeground(this, NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, n);
            }
            if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
            if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
        } else {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(NOTIF_ID, n);
            releaseLocks();
        }
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    private void shutdown() {
        releaseLocks();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ID);
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Uygulama son kullanılanlardan kaydırılıp kapatılınca çalma da durur.
        send("stop");
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        releaseLocks();
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
