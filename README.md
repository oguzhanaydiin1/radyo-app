# OA Radyo

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
- Kurulum dosyası: `npm run dist` → `dist\Radyo-Setup.exe` (GitHub da her sürüm etiketinde otomatik üretir)

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
- Ayarlar: Windows açılınca başlatma, bulut klasörüyle bilgisayarlar arası eşitleme, yedek, açık/koyu tema
- Yayın koparsa kendiliğinden yeniden bağlanma (internet gidip gelince de)
- Ekolayzır (hazır ayarlar + 5 bant) ve radyolar arası ses dengeleme
- Şarkıyı bul: çalan şarkıyı YouTube / Spotify'da arama, her radyonun son çalan şarkıları
- Şehre göre Türkiye radyoları
- Favori klasörleri, favorileri sürükleyerek sıralama
- Dinleme istatistikleri
- Görev çubuğu önizlemesinde çal/durdur, önceki/sonraki düğmeleri
- Discord'da "Radyo dinliyor" durumu (package.json → discordClientId gerekir)
- İngilizce arayüz (Ayarlar → Görünüm → Dil), renderer/i18n.js
- Ses çıkışı seçimi (kulaklık, hoparlör, Bluetooth)
- Her yerden kısayollar: Ctrl+Alt+P, Ctrl+Alt+→/←, Ctrl+Alt+↑/↓, Ctrl+Alt+M
- "Bu radyo çalışmıyor" bildirimi (e-postayla)
- İstasyon paylaşma: radyo://istasyon/<kimlik> bağlantıları uygulamada açılır
- Ek istasyon listesi: stations/ek-istasyonlar.json (Radio Browser'da olmayan ya da bozuk olan radyolar)

## Uygulama içi güncelleme

Kurulu uygulamalar GitHub deposundaki `updates/latest.json` dosyasına bakar
(`package.json` → `updateSource`; sol menüde **Güncellemeler**). Yeni sürüm aynı Electron
sürümünü kullanıyorsa yalnızca `updates/app-<sürüm>.asar` (1 MB'tan küçük) kullanıcı
klasörüne (`%APPDATA%\Radyo\guncelleme`) indirilir ve SHA-256 ile doğrulanır. Uygulama
`boot.js` ile başlar: orada kurulu sürümden yeni bir sürüm varsa onu yükler. Kurulu
dosyalara dokunulmaz; yeni bir tam paket kurulursa eski indirme kendiliğinden silinir.

Yeni sürüm yayınlamak için:

1. `package.json` içinde `version` değerini artır (örn. 0.5.0 → 0.5.1).
2. `release-notes.md` dosyasına bu sürümdeki yenilikleri yaz.
3. `npm run pack` ve ardından `npm run release` → `updates/` klasörü hazırlanır.
4. `git add -A && git commit -m "Sürüm 0.7.0" && git push` → birkaç dakika içinde
   kurulu uygulamalar yeni sürümü görür.
5. `git tag v0.7.0 && git push origin v0.7.0` → GitHub kendi Windows makinesinde
   kurulum dosyasını (Radyo-Setup.exe) ve zip paketini üretip Releases sayfasına koyar
   (.github/workflows/windows.yml). İndirme sayfasındaki düğme hep en son Setup.exe'yi verir.

## İndirme sayfası

`docs/ (oalabs.dev: index.html = OA Labs, radyo/ = indirme sayfası)` — GitHub Pages ile yayınlanır (Settings → Pages → Branch: main, klasör: /docs).
Adres: https://oguzhanaydiin1.github.io/radyo-app/

Electron sürümü değiştiyse kurulu uygulamalar kendini güncelleyemez; Güncellemeler sayfası
GitHub sayfasını açar (tam paket elle kurulmalı).

## Dosyalar

```
boot.js                Başlatıcı (indirilmiş güncellemeyi yükler)
main.js                Pencereler, sistem tepsisi, mini oynatıcı, bağlantılar
preload.js             Arayüzle ana süreç arasındaki güvenli köprü
src/radio.js           Radio Browser bağlantısı
src/recorder.js        Yayın kaydı
src/nowplaying.js      Şu an çalan şarkı
src/icy.js             Yayın içindeki şarkı bilgisini çözme
src/scheduler.js       Zamanlanmış kayıt ve alarmlar
src/settings.js        Ayarlar ve eşitleme klasörü
src/updater.js         Uygulama içi güncelleme
scripts/release.js     Yeni sürüm dosyalarını hazırlar (updates/)
updates/               Kurulu uygulamaların indirdiği güncelleme
release-notes.md       Son sürümün notları
renderer/vendor/       Ses kütüphanesi (hls.js)
renderer/index.html    Ana ekranın iskeleti
renderer/info.js       Geliştirici ve destek bilgileri
renderer/app.js        Arayüz, oynatıcı, listeler
renderer/features.js   Tepsi/mini bağlantısı, alarm, zamanlama, ayarlar, öneriler
renderer/extras.js     Ekolayzır, şarkılar, şehirler, klasörler, istatistik, tema, paylaşma
src/logos.js           Logo indirme ve önbellek (radyo-logo://)
src/discord.js         Discord durumu
renderer/mini.*        Mini oynatıcı
renderer/styles.css    Görünüm
assets/, build/        İkonlar
```
