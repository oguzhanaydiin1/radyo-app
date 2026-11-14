package dev.oalabs.radyo;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * OA Radyo yerel eklentisi (JS adı: OANative).
 *  - audioStatus / requestAudio: "Müzik ve sesler" izni
 *  - scan: telefondaki müzikler (MediaStore); her parça için çalma ve kapak adresi
 *  - requestNotifications: Android 13+ bildirim izni (çalma kontrolleri için)
 *  - mediaUpdate / mediaStop: arka planda çalma hizmeti ve bildirim/kilit ekranı kontrolleri
 *  - "media" olayı: bildirimden ya da kulaklıktan gelen komut (play, pause, toggle, next, prev, stop)
 */
@CapacitorPlugin(
    name = "OANative",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class OANativePlugin extends Plugin {

    static OANativePlugin instance;
    private MediaServer server;

    @Override
    public void load() {
        instance = this;
        server = new MediaServer(getContext());
    }

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
    }

    private boolean audioGranted() {
        return getPermissionState(audioAlias()) == PermissionState.GRANTED;
    }

    @PluginMethod
    public void audioStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", audioGranted());
        r.put("state", String.valueOf(getPermissionState(audioAlias())).toLowerCase());
        call.resolve(r);
    }

    @PluginMethod
    public void requestAudio(PluginCall call) {
        if (audioGranted()) {
            audioStatus(call);
            return;
        }
        requestPermissionForAlias(audioAlias(), call, "audioDone");
    }

    @PermissionCallback
    private void audioDone(PluginCall call) {
        audioStatus(call);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsDone");
    }

    @PermissionCallback
    private void notificationsDone(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    private static String col(Cursor c, String name) {
        int i = c.getColumnIndex(name);
        if (i < 0 || c.isNull(i)) return "";
        String v = c.getString(i);
        return v == null || "<unknown>".equals(v) ? "" : v.trim();
    }

    private static long num(Cursor c, String name) {
        int i = c.getColumnIndex(name);
        if (i < 0 || c.isNull(i)) return 0;
        return c.getLong(i);
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!audioGranted()) {
            call.reject("Müzik izni verilmedi.", "NO_PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                String base = server.base();
                String k = server.token();
                Uri coll = Build.VERSION.SDK_INT >= 29
                    ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                    : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String pathCol = Build.VERSION.SDK_INT >= 29 ? MediaStore.Audio.Media.RELATIVE_PATH : MediaStore.Audio.Media.DATA;
                String[] proj = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.ALBUM_ID,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.TRACK,
                    MediaStore.Audio.Media.YEAR,
                    MediaStore.Audio.Media.MIME_TYPE,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.DATE_MODIFIED,
                    pathCol
                };
                String sel = MediaStore.Audio.Media.IS_MUSIC + " != 0";
                JSArray arr = new JSArray();
                try (Cursor c = getContext().getContentResolver().query(coll, proj, sel, null, MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC")) {
                    if (c != null) {
                        while (c.moveToNext() && arr.length() < 50000) {
                            long id = num(c, MediaStore.Audio.Media._ID);
                            long track = num(c, MediaStore.Audio.Media.TRACK);
                            String file = col(c, MediaStore.Audio.Media.DISPLAY_NAME);
                            String p = col(c, pathCol);
                            String dir = p;
                            if (Build.VERSION.SDK_INT < 29 && p.contains("/")) dir = p.substring(0, p.lastIndexOf('/'));
                            dir = dir.replaceAll("/+$", "");
                            if (dir.contains("/")) dir = dir.substring(dir.lastIndexOf('/') + 1);
                            JSObject t = new JSObject();
                            t.put("id", "n" + id);
                            t.put("nid", id);
                            t.put("url", base + "a/" + id + "?k=" + k);
                            t.put("cover", base + "c/" + id + "?k=" + k);
                            t.put("title", col(c, MediaStore.Audio.Media.TITLE));
                            t.put("artist", col(c, MediaStore.Audio.Media.ARTIST));
                            t.put("album", col(c, MediaStore.Audio.Media.ALBUM));
                            t.put("albumId", num(c, MediaStore.Audio.Media.ALBUM_ID));
                            t.put("duration", Math.round(num(c, MediaStore.Audio.Media.DURATION) / 1000.0));
                            t.put("no", track % 1000);
                            t.put("disc", track / 1000);
                            t.put("year", num(c, MediaStore.Audio.Media.YEAR));
                            t.put("mime", col(c, MediaStore.Audio.Media.MIME_TYPE));
                            t.put("file", file);
                            t.put("dir", dir);
                            t.put("mtime", num(c, MediaStore.Audio.Media.DATE_MODIFIED));
                            arr.put(t);
                        }
                    }
                }
                JSObject r = new JSObject();
                r.put("tracks", arr);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Müzikler okunamadı: " + e.getMessage());
            }
        }, "oa-media-scan").start();
    }

    @PluginMethod
    public void mediaUpdate(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        Context ctx = getContext();
        Intent i = new Intent(ctx, PlaybackService.class);
        i.setAction(PlaybackService.ACTION_UPDATE);
        i.putExtra("title", call.getString("title", ""));
        i.putExtra("artist", call.getString("artist", ""));
        i.putExtra("playing", playing);
        i.putExtra("canSkip", Boolean.TRUE.equals(call.getBoolean("canSkip", true)));
        try {
            if (playing) {
                ContextCompat.startForegroundService(ctx, i);
            } else if (PlaybackService.running) {
                ctx.startService(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Arka planda çalma başlatılamadı: " + e.getMessage());
        }
    }

    @PluginMethod
    public void mediaStop(PluginCall call) {
        Context ctx = getContext();
        if (PlaybackService.running) {
            Intent i = new Intent(ctx, PlaybackService.class);
            i.setAction(PlaybackService.ACTION_STOP_SERVICE);
            try {
                ctx.startService(i);
            } catch (Exception ignored) {
                // hizmet zaten kapanmış
            }
        }
        call.resolve();
    }

    void emitMedia(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("media", data, true);
    }
}
