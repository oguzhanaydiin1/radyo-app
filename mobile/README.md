# OA Radyo — Android

Android uygulaması Windows arayüzünün kendisini (`renderer/`) çalıştırır. Windows'ta ana
sürecin (`main.js`, `src/`) yaptığı işleri `shim/android-bridge.js` WebView içinde yapar:
istasyon listesi, alarmlar, ayarlar, güncelleme denetimi, podcast (api.oalabs.dev üzerinden),
cihazdaki müzik ve şarkı sözleri. Telefon düzeni `shim/android.css`'tedir.

- `node mobile/scripts/build-www.js` → `mobile/www/` (renderer + köprü + listeler)
- GitHub Actions'taki **Android test APK** iş akışı APK'yı derleyip `android-test` sürüm
  sayfasına `OA-Radyo-test.apk` olarak koyar. Android projesi her derlemede yeniden üretilir;
  burada yalnızca yapılandırma, simgeler ve köprü tutulur.

Android'de olmayanlar: yayın kaydı, mini oynatıcı, Discord, ses çıkışı seçimi, ekolayzır,
klasör eşitleme. Alarmlar uygulama açıkken çalar. Seçilen müzik dosyaları uygulama
kapanınca yeniden seçilmelidir (WebView kalıcı dosya erişimi vermez).

`shim/vendor/jsmediatags.min.js`: müzik etiketlerini okur (BSD-3-Clause, lisansı yanında).
