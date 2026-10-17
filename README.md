# Radyo

Canlı radyo dinleme uygulaması (Windows, Electron ile).
İstasyonlar ücretsiz [Radio Browser](https://www.radio-browser.info) veritabanından gelir.

## Bir kerelik kurulum

**Node.js** kur (LTS sürümü yeterli): https://nodejs.org

## Çalıştırma

Bu klasörde bir terminal aç (klasörde boş bir yere Shift + sağ tık → "Terminalde aç") ve:

```
npm install
npm start
```

`npm install` yalnızca ilk seferde ve paketler değişince gerekir; sonra sadece `npm start` yeter.

## Paket üretme

- Kurulum gerektirmeyen paket (zip): `npm run pack` → `dist\Radyo-<sürüm>-win.zip`
- Kurulum dosyası: `npm run dist` → `dist\Radyo Setup <sürüm>.exe` ve taşınabilir tek dosya

## Neler var

- Türkiye'nin tüm istasyonları, kategoriler, arama (Ctrl+F)
- Dünya radyoları: dile ya da ülkeye göre
- Şu an çalan şarkının adı (yayın bu bilgiyi gönderiyorsa)
- Favoriler, son dinlenenler, kendi eklediğin istasyonlar
- Benzer istasyonlar ve Radio Browser'da oy verme
- Yayın kaydı (Müzik\Radyo Kayıtları), şarkı listesiyle birlikte
- Zamanlanmış kayıt ve radyolu alarm (Kayıtlar ve Alarmlar bölümleri)
- Sistem tepsisi: pencere kapanınca arka planda çalmaya devam eder
- Mini oynatıcı: hep üstte duran küçük pencere
- Uyku zamanlayıcı, medya tuşları, Windows ses penceresinde istasyon ve şarkı adı
- Açılış ekranı: radyo sayıları ve geliştirici bilgisi
- Destek sekmesi: iletişim bilgileri ve e-postayla sorun bildirme (bilgiler renderer/info.js içinde)
- Ayarlar: Windows açılınca başlatma, bulut klasörüyle bilgisayarlar arası eşitleme, yedek

## Uygulama içi güncelleme

Uygulama, `package.json` içindeki `updateSource` ile belirtilen GitHub deposunun son
"release"ine bakar (sol menüde **Güncellemeler**). Yeni sürüm aynı Electron sürümünü
kullanıyorsa yalnızca `app.asar` (1 MB'tan küçük) indirilir, SHA-256 ile doğrulanır ve
uygulama yeniden başlarken (ya da kapanırken) yerine konur.

Yeni sürüm yayınlamak için:

1. `package.json` içinde `version` değerini artır (örn. 0.5.0 → 0.5.1).
2. `npm run pack` → paket oluşur.
3. `npm run release` → `dist/release` içinde `app.asar`, `update.json` ve tam zip hazırlanır.
4. GitHub'da `v<sürüm>` etiketiyle yeni bir release aç ve bu üç dosyayı yükle.

Electron sürümü değiştiyse (`npm install electron@...`) kurulu uygulamalar kendini
güncelleyemez; Güncellemeler sayfası tam paketin indirileceği sayfayı açar.

## Dosyalar

```
main.js                Pencereler, sistem tepsisi, mini oynatıcı, bağlantılar
preload.js             Arayüzle ana süreç arasındaki güvenli köprü
src/radio.js           Radio Browser bağlantısı
src/recorder.js        Yayın kaydı
src/nowplaying.js      Şu an çalan şarkı
src/icy.js             Yayın içindeki şarkı bilgisini çözme
src/scheduler.js       Zamanlanmış kayıt ve alarmlar
src/settings.js        Ayarlar ve eşitleme klasörü
src/updater.js         Uygulama içi güncelleme
scripts/release.js     Yeni sürüm dosyalarını hazırlar
renderer/vendor/       Ses kütüphanesi (hls.js)
renderer/index.html    Ana ekranın iskeleti
renderer/info.js       Geliştirici ve destek bilgileri
renderer/app.js        Arayüz, oynatıcı, listeler
renderer/features.js   Tepsi/mini bağlantısı, alarm, zamanlama, ayarlar, öneriler
renderer/mini.*        Mini oynatıcı
renderer/styles.css    Görünüm
assets/, build/        İkonlar
```
