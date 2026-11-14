# OA Radyo — Android

Android uygulaması Windows arayüzünün kendisini (`renderer/`) çalıştırır. Windows'ta ana
sürecin (`main.js`, `src/`) yaptığı işleri `shim/android-bridge.js` WebView içinde yapar:
istasyon listesi, alarmlar, ayarlar, güncelleme denetimi, podcast (api.oalabs.dev üzerinden),
cihazdaki müzik ve şarkı sözleri. Telefon düzeni `shim/android.css`'tedir.

- `node mobile/scripts/build-www.js` → `mobile/www/` (renderer + köprü + listeler)
- GitHub Actions'taki **Android test APK** iş akışı APK'yı derleyip `android-test` sürüm
  sayfasına `OA-Radyo-test.apk` olarak koyar. Android projesi her derlemede yeniden üretilir;
  burada yalnızca yapılandırma, simgeler ve köprü tutulur.

Yerel eklenti (`native/dev/oalabs/radyo`, `scripts/patch-android.js` ile projeye eklenir):
- `OANativePlugin`: "Müzik ve sesler" izni, telefondaki müzikler (MediaStore), bildirim izni
- `MediaServer`: müzik dosyalarını ve kapakları WebView'a veren 127.0.0.1 sunucusu
  (oturuma özel anahtar, Range destekli)
- `PlaybackService`: arka planda çalma, bildirim ve kilit ekranı kontrolleri (MediaSession)

Telefonda alt sekmeler (Radyo, Podcast, Müzik, Favoriler, Daha fazla) `android-bridge.js`
ve `android.css` ile kurulur. İş akışı: **Android** (test → deneme APK'sı; yayin → Google
Play için imzalı AAB + APK, `ANDROID_RELEASE_*` gizli değerleri gerekir).

Android'de olmayanlar: yayın kaydı, mini pencere, Discord, ses çıkışı seçimi, ekolayzır,
klasör eşitleme. Alarmlar uygulama açıkken çalar.

`shim/vendor/jsmediatags.min.js`: müzik etiketlerini okur (BSD-3-Clause, lisansı yanında).
