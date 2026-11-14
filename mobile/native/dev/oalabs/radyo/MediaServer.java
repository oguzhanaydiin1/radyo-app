package dev.oalabs.radyo;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.LruCache;
import android.util.Size;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Telefondaki müzik dosyalarını WebView'a veren küçük yerel sunucu (yalnızca 127.0.0.1).
 * Her açılışta rastgele bir anahtar üretilir; anahtarı bilmeyen başka bir uygulama dosyalara
 * ulaşamaz. Range istekleri desteklenir (ileri sarma ve kaldığın yerden devam için).
 *
 *   /a/{id}?k=…  parça (MediaStore.Audio kimliği)
 *   /c/{id}?k=…  kapak resmi (JPEG)
 */
class MediaServer {

    private final Context context;
    private final String token;
    private ServerSocket socket;
    private final ExecutorService pool = Executors.newFixedThreadPool(6);
    private final LruCache<Long, byte[]> covers = new LruCache<Long, byte[]>(12 * 1024 * 1024) {
        @Override
        protected int sizeOf(Long key, byte[] value) {
            return value.length;
        }
    };

    MediaServer(Context context) {
        this.context = context.getApplicationContext();
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        this.token = sb.toString();
    }

    synchronized String base() throws IOException {
        if (socket == null || socket.isClosed()) {
            socket = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
            Thread t = new Thread(this::loop, "oa-media-server");
            t.setDaemon(true);
            t.start();
        }
        return "http://127.0.0.1:" + socket.getLocalPort() + "/";
    }

    String token() {
        return token;
    }

    private void loop() {
        while (socket != null && !socket.isClosed()) {
            try {
                Socket s = socket.accept();
                pool.execute(() -> handle(s));
            } catch (IOException e) {
                if (socket == null || socket.isClosed()) return;
            }
        }
    }

    static Uri audioUri(long id) {
        Uri coll = Build.VERSION.SDK_INT >= 29
            ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        return ContentUris.withAppendedId(coll, id);
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') sb.append((char) c);
            if (sb.length() > 8192) throw new IOException("satır çok uzun");
        }
        return c == -1 && sb.length() == 0 ? null : sb.toString();
    }

    private static void head(OutputStream out, int code, String status, String type, long length, String extra) throws IOException {
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(code).append(' ').append(status).append("\r\n");
        if (type != null) h.append("Content-Type: ").append(type).append("\r\n");
        if (length >= 0) h.append("Content-Length: ").append(length).append("\r\n");
        h.append("Access-Control-Allow-Origin: *\r\n");
        h.append("Cache-Control: no-store\r\n");
        h.append("Connection: close\r\n");
        if (extra != null) h.append(extra);
        h.append("\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
    }

    private void handle(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(30000);
            InputStream in = new BufferedInputStream(sock.getInputStream());
            OutputStream out = sock.getOutputStream();
            String line = readLine(in);
            if (line == null) return;
            String[] parts = line.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String range = null;
            String h;
            while ((h = readLine(in)) != null && !h.isEmpty()) {
                int i = h.indexOf(':');
                if (i > 0 && h.substring(0, i).trim().equalsIgnoreCase("range")) range = h.substring(i + 1).trim();
            }
            Uri u = Uri.parse("http://x" + parts[1]);
            if (!token.equals(u.getQueryParameter("k"))) {
                head(out, 403, "Forbidden", "text/plain", 0, null);
                return;
            }
            java.util.List<String> seg = u.getPathSegments();
            if (seg.size() != 2 || !seg.get(1).matches("\\d{1,19}")) {
                head(out, 404, "Not Found", "text/plain", 0, null);
                return;
            }
            long id = Long.parseLong(seg.get(1));
            if ("a".equals(seg.get(0))) serveAudio(out, id, range, "HEAD".equals(method));
            else if ("c".equals(seg.get(0))) serveCover(out, id);
            else head(out, 404, "Not Found", "text/plain", 0, null);
        } catch (Exception ignored) {
            // bağlantı kapandı ya da dosya okunamadı
        }
    }

    private void serveAudio(OutputStream out, long id, String range, boolean headOnly) throws IOException {
        ContentResolver cr = context.getContentResolver();
        Uri uri = audioUri(id);
        String type = cr.getType(uri);
        if (type == null) type = "audio/mpeg";
        try (ParcelFileDescriptor pfd = cr.openFileDescriptor(uri, "r")) {
            if (pfd == null) {
                head(out, 404, "Not Found", "text/plain", 0, null);
                return;
            }
            long size = pfd.getStatSize();
            long start = 0;
            long end = size - 1;
            boolean partial = false;
            if (range != null && range.startsWith("bytes=") && size > 0) {
                String r = range.substring(6).split(",")[0].trim();
                int dash = r.indexOf('-');
                if (dash >= 0) {
                    String a = r.substring(0, dash).trim();
                    String b = r.substring(dash + 1).trim();
                    try {
                        if (a.isEmpty()) {
                            start = Math.max(0, size - Long.parseLong(b));
                        } else {
                            start = Long.parseLong(a);
                            if (!b.isEmpty()) end = Math.min(size - 1, Long.parseLong(b));
                        }
                        partial = true;
                    } catch (NumberFormatException e) {
                        partial = false;
                    }
                }
                if (partial && (start > end || start >= size)) {
                    head(out, 416, "Range Not Satisfiable", "text/plain", 0, "Content-Range: bytes */" + size + "\r\n");
                    return;
                }
            }
            long length = end - start + 1;
            String extra = "Accept-Ranges: bytes\r\n" + (partial ? "Content-Range: bytes " + start + "-" + end + "/" + size + "\r\n" : "");
            head(out, partial ? 206 : 200, partial ? "Partial Content" : "OK", type, length, extra);
            if (headOnly) return;
            try (FileInputStream fis = new FileInputStream(pfd.getFileDescriptor())) {
                fis.getChannel().position(start);
                byte[] buf = new byte[64 * 1024];
                long left = length;
                while (left > 0) {
                    int n = fis.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n < 0) break;
                    out.write(buf, 0, n);
                    left -= n;
                }
                out.flush();
            }
        }
    }

    private void serveCover(OutputStream out, long id) throws IOException {
        byte[] data = covers.get(id);
        if (data == null) {
            data = loadCover(id);
            if (data == null) data = new byte[0];
            covers.put(id, data);
        }
        if (data.length == 0) {
            head(out, 404, "Not Found", "text/plain", 0, null);
            return;
        }
        head(out, 200, "OK", "image/jpeg", data.length, null);
        out.write(data);
        out.flush();
    }

    private byte[] loadCover(long id) {
        ContentResolver cr = context.getContentResolver();
        Bitmap bmp = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                bmp = cr.loadThumbnail(audioUri(id), new Size(512, 512), null);
            } else {
                long albumId = -1;
                try (android.database.Cursor c = cr.query(audioUri(id), new String[] { MediaStore.Audio.Media.ALBUM_ID }, null, null, null)) {
                    if (c != null && c.moveToFirst()) albumId = c.getLong(0);
                }
                if (albumId >= 0) {
                    Uri art = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId);
                    try (AssetFileDescriptor afd = cr.openAssetFileDescriptor(art, "r")) {
                        if (afd != null) bmp = BitmapFactory.decodeFileDescriptor(afd.getFileDescriptor());
                    }
                }
            }
        } catch (Exception ignored) {
            bmp = null;
        }
        if (bmp == null) return null;
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, bos);
        return bos.toByteArray();
    }
}
