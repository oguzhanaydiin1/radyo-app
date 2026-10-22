'use strict';

/*
 * Arayüz dili. Uygulama Türkçe yazılmıştır; İngilizce seçildiğinde ekrandaki metinler
 * (yazılar, ipuçları, düğme adları) bu sözlükle anında çevrilir. Radyo ve şarkı adları
 * çevrilmez. Dil Ayarlar → Görünüm'den değiştirilir.
 */

const LANG = (() => {
  try { return localStorage.getItem('lang') === '"en"' ? 'en' : 'tr'; } catch { return 'tr'; }
})();

(function setupI18n() {
  document.documentElement.lang = LANG;
  if (LANG !== 'en') return;

  // Tarih, saat ve sayı biçimleri, dil/ülke adları İngilizce olsun.
  const swap = (loc) => (loc === 'tr-TR' || loc === 'tr' ? 'en-GB' : Array.isArray(loc) ? loc.map((l) => (l === 'tr' || l === 'tr-TR' ? 'en' : l)) : loc);
  for (const [proto, names] of [[Date.prototype, ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']], [Number.prototype, ['toLocaleString']]]) {
    for (const n of names) {
      const orig = proto[n];
      proto[n] = function patched(loc, opts) { return orig.call(this, swap(loc), opts); };
    }
  }
  const DN = Intl.DisplayNames;
  Intl.DisplayNames = function DisplayNames(locales, opts) { return new DN(swap(locales), opts); };
  Intl.DisplayNames.prototype = DN.prototype;

  const D = {
    // Menü ve genel
    'Türkiye': 'Türkiye', 'Dünya': 'World', 'Favoriler': 'Favourites', 'Son dinlenenler': 'Recently played',
    'İstatistikler': 'Statistics', 'Kayıtlar': 'Recordings', 'Alarmlar': 'Alarms', 'Güncellemeler': 'Updates',
    'Destek': 'Support', 'Ayarlar': 'Settings', 'FAVORİ İSTASYONLAR': 'FAVOURITE STATIONS', 'Ana menü': 'Main menu',
    'Bir istasyonun kalbine bastığında burada görünür.': 'Tap the heart on a station and it shows up here.',
    'İstasyon ara': 'Search stations', 'İstasyon ara   (Ctrl+F)': 'Search stations   (Ctrl+F)', 'Aramayı temizle': 'Clear search',
    'Keşfet': 'Discover', 'Kategoriler': 'Categories', 'Tümü': 'All', 'En çok dinlenen 20': 'Top 20', 'Pop': 'Pop', 'Haber': 'News', 'Türkü': 'Turkish folk',
    'Arabesk': 'Arabesque', 'Türk Sanat': 'Turkish classical', 'Rock': 'Rock', 'Caz': 'Jazz', 'Klasik': 'Classical', 'Dini': 'Religious',
    'Spor': 'Sports', 'Eklediklerim': 'Added by me', 'Yükleniyor': 'Loading', 'Aranıyor': 'Searching', 'Bağlanıyor': 'Connecting',
    'Tamam': 'OK', 'Vazgeç': 'Cancel', 'Kaydet': 'Save', 'Kapat': 'Close', 'Sil': 'Delete', 'Düzenle': 'Edit', 'Aç': 'Open',
    'Yenile': 'Refresh', 'Ayrıntılar': 'Details', 'Silindi.': 'Deleted.',
    // Splash
    'OA Radyo açılıyor': 'OA Radyo is starting', 'Türk radyosu': 'Turkish stations', 'dünya genelinde istasyon': 'stations worldwide',
    'İstasyonlar hazırlanıyor…': 'Preparing stations…', 'İstasyonlar indiriliyor…': 'Downloading stations…', 'Geliştirici:': 'Developer:',
    // Liste
    'ŞU AN ÇALIYOR': 'NOW PLAYING', 'EN ÇOK DİNLENEN': 'MOST POPULAR', 'Öne çıkan istasyon': 'Featured station',
    'Dinle': 'Listen', 'Duraklat': 'Pause', 'İstasyon bilgisi': 'Station info', 'Ülke': 'Country', 'Format': 'Format', 'Kalite': 'Quality',
    'Oylar': 'Votes', 'Beğendim': 'Like', 'Oy verildi': 'Voted', 'Bu istasyona bugün oy verdin': 'You voted for this station today',
    'Radio Browser’da bu istasyona oy ver': 'Vote for this station on Radio Browser', 'Etiketler': 'Tags',
    'Favorilere ekle': 'Add to favourites', 'Favorilerden çıkar': 'Remove from favourites', 'EKLEDİĞİN': 'ADDED BY YOU',
    'En çok dinlenen': 'Most popular', 'A’dan Z’ye': 'A to Z', 'Sıralama': 'Sort', 'Tüm şehirler': 'All cities', 'Şehir': 'City',
    'Listeyi Radio Browser’dan yeniden indir': 'Download the list again from Radio Browser', 'İstasyon ekle': 'Add station',
    'İnternete bağlanılamadı, son indirilen liste gösteriliyor': 'No internet connection, showing the last downloaded list',
    'Benzer istasyonlar': 'Similar stations', 'Canlı yayın': 'Live', 'Canlı': 'Live',
    'Türkiye’deki tüm istasyonlar indiriliyor, ilk açılışta biraz sürebilir…': 'Downloading all stations in Türkiye, this can take a moment the first time…',
    'İstasyonlar yüklenemedi': 'Stations could not be loaded', 'Tekrar dene': 'Try again',
    'Bu kategoride istasyon yok': 'No stations in this category', 'Başka bir kategori seç.': 'Pick another category.',
    'Türkiye listesinde bulunamadı': 'Not found in the Türkiye list',
    'Aşağıda tüm dünyadaki sonuçlar var. Orada da yoksa yayın adresiyle kendin ekleyebilirsin.': 'Results from around the world are below. If it is not there either, you can add it yourself with its stream address.',
    'Yayın adresiyle ekle': 'Add by stream address', 'Dünyadan sonuçlar': 'Results from around the world', 'Tüm dünyada ara': 'Search worldwide',
    'Arama yapılamadı': 'Search failed', 'Yurt dışında da bu isimde bir istasyon bulunamadı.': 'No station with this name was found abroad either.',
    'Aradığın radyo yok mu? Yayın adresini (örn. …/playlist.m3u8 ya da …:8000/stream) biliyorsan kendin ekleyebilirsin.': 'Can’t find your station? If you know its stream address (e.g. …/playlist.m3u8 or …:8000/stream) you can add it yourself.',
    'Bu listede bulunamadı': 'Not found in this list', 'Başka bir isimle dene ya da aramayı temizle.': 'Try another name or clear the search.',
    'Burada istasyon yok': 'No stations here', 'Soldan başka bir seçim yap.': 'Pick something else on the left.',
    // Dünya
    'Dile göre': 'By language', 'Ülkeye göre': 'By country', 'Dil ara': 'Search languages', 'Ülke ara': 'Search countries',
    'Listede ara': 'Search the list', 'Listeleme': 'Listing', 'Dünya radyoları': 'World radio', 'Ülkeler': 'Countries', 'Diller': 'Languages',
    'Ülkeye göre daraltabilirsin': 'You can narrow it down by country', 'Dile göre daraltabilirsin': 'You can narrow it down by language',
    'Soldan bir dil seç': 'Pick a language on the left', 'Soldan bir ülke seç': 'Pick a country on the left', 'Eşleşen yok.': 'No matches.',
    'Dünya listesi yüklenemedi': 'The world list could not be loaded', 'DİLE GÖRE': 'BY LANGUAGE', 'ÜLKEYE GÖRE': 'BY COUNTRY',
    // Favoriler, geçmiş
    'Henüz favorin yok': 'No favourites yet', 'Keşfet’te beğendiğin istasyonun kalbine bas, burada toplansın.': 'Tap the heart on stations you like in Discover and they’ll gather here.',
    'Henüz bir şey dinlemedin': 'You haven’t listened to anything yet', 'Dinlediğin istasyonlar burada sırayla görünür.': 'Stations you listen to show up here in order.',
    'Tüm favoriler': 'All favourites', '+ Yeni klasör': '+ New folder', 'Yeni klasör': 'New folder', 'Yeni klasör…': 'New folder…',
    'Klasör adı': 'Folder name', 'Örn. Spor, Gece, Araba': 'E.g. Sports, Night, Car', 'Yeniden adlandır': 'Rename', 'Klasörü sil': 'Delete folder',
    'Klasörü yeniden adlandır': 'Rename folder', 'KLASÖRLER': 'FOLDERS', 'Henüz klasör yok.': 'No folders yet.', 'Klasörlere ekle': 'Add to folders',
    'Bu klasör boş': 'This folder is empty', 'Sıralamak için kartları sürükle': 'Drag cards to reorder',
    'Sıralamak için kartları sürükle, klasöre eklemek için yukarıdaki klasörün üstüne bırak': 'Drag cards to reorder, drop one on a folder above to add it',
    'Tümü’ndeki bir kartı bu klasörün üstüne sürükle ya da kartın klasör düğmesini kullan.': 'Drag a card from All onto this folder, or use the card’s folder button.',
    'Klasör silindi. İçindeki istasyonlar favorilerinde duruyor.': 'Folder deleted. Its stations are still in your favourites.',
    // İstatistik
    'Son 7 gün': 'Last 7 days', 'Son 30 gün': 'Last 30 days', 'Son 1 yıl': 'Last year', 'Toplam dinleme': 'Total listening',
    'Farklı istasyon': 'Different stations', 'Dinlediğin gün': 'Days listened', 'En çok': 'Top station', 'Günlük dinleme': 'Daily listening',
    'En çok dinlediklerin': 'Your most played', 'Henüz istatistik yok': 'No statistics yet',
    'Radyo dinledikçe burada ne kadar ve en çok neyi dinlediğin görünecek.': 'As you listen, you’ll see here how much and what you listen to most.',
    // Oynatıcı
    'Bir istasyon seç': 'Pick a station', 'Bir istasyon seç.': 'Pick a station.', 'Listeden bir istasyona tıkla': 'Click a station in the list',
    'Bağlanıyor…': 'Connecting…', 'Duraklatıldı': 'Paused', 'Çal': 'Play', 'Çal (Boşluk)': 'Play (Space)', 'Duraklat (Boşluk)': 'Pause (Space)',
    'Önceki istasyon': 'Previous station', 'Sonraki istasyon': 'Next station', 'Sesi aç': 'Unmute', 'Sesi kapat': 'Mute', 'Ses düzeyi': 'Volume',
    'Uyku zamanlayıcı': 'Sleep timer', 'UYKU ZAMANLAYICI': 'SLEEP TIMER', 'Zamanlayıcıyı kapat': 'Turn off timer',
    'Mini oynatıcı': 'Mini player', 'Mini oynatıcı (hep üstte küçük pencere)': 'Mini player (small always-on-top window)',
    'Mini oynatıcıyı kapat': 'Close mini player', 'Büyük pencereyi aç': 'Open the main window', 'Kapat (radyo çalmaya devam eder)': 'Close (radio keeps playing)',
    'Çalan yayını kaydet': 'Record what’s playing', 'Kaydı başlat': 'Start recording', 'Bu yayın kaydedilemiyor': 'This stream can’t be recorded',
    'Kaydetmek için önce bir istasyon çal': 'Play a station first to record it',
    'Bu yayın şu an açılamadı. Başka bir istasyon dene.': 'This stream can’t be opened right now. Try another station.',
    'İnternet bağlantısı yok. Bağlantı gelince yayın kendiliğinden devam edecek.': 'No internet connection. Playback will resume by itself when you’re back online.',
    'Ekolayzır': 'Equaliser', 'Ekolayzır ve ses dengeleme': 'Equaliser and volume levelling', 'EKOLAYZIR': 'EQUALISER',
    'Düz': 'Flat', 'Bas': 'Bass', 'Konuşma': 'Speech', 'Araba': 'Car', 'Gece': 'Night',
    'Ses dengeleme': 'Volume levelling', 'Radyolar arasında ses yüksekliği farkını azaltır.': 'Evens out loudness differences between stations.',
    'Ses çıkışı': 'Audio output', 'Ses çıkışı (kulaklık, hoparlör)': 'Audio output (headphones, speakers)', 'SES ÇIKIŞI': 'AUDIO OUTPUT',
    'Windows varsayılanı': 'Windows default', 'Ses cihazı': 'Audio device', 'Ses cihazı bulunamadı.': 'No audio devices found.',
    'Bu ses çıkışına geçilemedi. Cihaz bağlı mı?': 'Couldn’t switch to this output. Is the device connected?',
    'Seçili ses cihazı çıkarıldı, ses Windows varsayılanından devam ediyor.': 'The selected audio device was removed; sound continues on the Windows default.',
    'Son çalan şarkılar': 'Recently played songs', 'SON ÇALAN ŞARKILAR': 'RECENTLY PLAYED SONGS',
    'Bu radyo şarkı adı göndermiyor ya da henüz şarkı çalmadı.': 'This station doesn’t send song titles, or hasn’t played a song yet.',
    'YouTube’da ara': 'Search on YouTube', 'Spotify’da ara': 'Search on Spotify', 'şimdi': 'now', 'Az önce': 'Just now', 'Dün': 'Yesterday',
    'Paylaş': 'Share', 'Bağlantıyı kopyala': 'Copy link', 'Bu istasyonun bağlantısını kopyala': 'Copy this station’s link',
    'Paylaşım bağlantısı kopyalandı. WhatsApp ya da e-postaya yapıştırabilirsin.': 'Share link copied. You can paste it into WhatsApp or an email.',
    'Panoya kopyalanamadı.': 'Couldn’t copy to the clipboard.', 'Paylaşılan radyo bulunamadı.': 'The shared station couldn’t be found.',
    'Paylaşılan radyo': 'Shared station', 'Sorun': 'Problem', 'Çalışmıyor, bildir': 'Report issue',
    'Bu radyo çalışmıyorsa geliştiriciye bildir': 'Report to the developer if this station doesn’t work',
    'E-posta programın açıldı; göndermen yeterli. Teşekkürler!': 'Your email app is open; just hit send. Thanks!',
    // Ekleme penceresi
    'İstasyon adı': 'Station name', 'Yayın adresi': 'Stream address', 'Logo adresi': 'Logo address', '(isteğe bağlı)': '(optional)',
    '(isteğe bağlı, virgülle)': '(optional, comma separated)', 'Örn. Kent FM': 'E.g. City FM', 'Ekle ve dinle': 'Add and listen',
    'Listede olmayan bir radyoyu yayın adresiyle ekleyebilirsin. Adresi genelde radyonun sitesindeki “canlı dinle” bağlantısında bulursun.': 'You can add a station that isn’t listed using its stream address. You’ll usually find it behind the “listen live” link on the station’s website.',
    'İstasyon adını yaz.': 'Enter the station name.', 'Yayın adresi http:// ya da https:// ile başlamalı.': 'The stream address must start with http:// or https://.',
    'Logo adresi http:// ya da https:// ile başlamalı.': 'The logo address must start with http:// or https://.', 'Bu yayın adresini zaten eklemişsin.': 'You’ve already added this stream address.',
    // Kayıtlar, zamanlama, alarm
    'Henüz kayıt yok': 'No recordings yet', 'Klasörü aç': 'Open folder', 'Klasörde göster': 'Show in folder',
    'Varsayılan müzik çalarında aç': 'Open in your default music player', 'Geri Dönüşüm Kutusu’na taşı': 'Move to Recycle Bin',
    'Bir istasyon çalarken alttaki kırmızı kayıt düğmesine bas. Kayıtlar Müzik klasöründeki “Radyo Kayıtları”na kaydedilir.': 'While a station is playing, press the red record button below. Recordings are saved to “Radyo Kayıtları” in your Music folder.',
    'Kayıtlar yalnızca kişisel kullanım içindir; yayınları paylaşmak ya da yeniden yayınlamak telif haklarını ihlal edebilir.': 'Recordings are for personal use only; sharing or rebroadcasting them may infringe copyright.',
    'Kayıt Geri Dönüşüm Kutusu’na taşındı.': 'Recording moved to the Recycle Bin.', 'Kayıt açılamadı.': 'Couldn’t open the recording.',
    'Kayıt silinemedi.': 'Couldn’t delete the recording.', 'Kayıt yapılamadı.': 'Recording failed.',
    'Zamanlanmış kayıtlar': 'Scheduled recordings', 'Zamanlanmış kayıt': 'Scheduled recording', 'Yeni zamanlama': 'New schedule',
    'Zamanlamayı düzenle': 'Edit schedule', 'Yeni alarm': 'New alarm', 'Alarmı düzenle': 'Edit alarm', 'Henüz alarm yok': 'No alarms yet',
    'Belirli bir saatte bir programı kaydetmek için zamanlama ekle; örneğin “Cumartesi 20:00, 60 dakika”.': 'Add a schedule to record a show at a set time, e.g. “Saturday 20:00, 60 minutes”.',
    'Seçtiğin saatte radyo açılır ve ses bir dakika içinde yavaşça yükselir.': 'The radio turns on at the time you pick and the volume rises gently over a minute.',
    'Seçtiğin saatte seçtiğin radyo açılsın; ses bir dakika içinde yavaşça yükselir.': 'Your chosen station turns on at the time you pick; the volume rises gently over a minute.',
    'Seçtiğin saatte kayıt kendiliğinden başlar ve süre dolunca durur. Kayıtlar Müzik\\Radyo Kayıtları klasörüne kaydedilir.': 'Recording starts by itself at the time you pick and stops when the time is up. Recordings go to Music\\Radyo Kayıtları.',
    'Zamanlamalar yalnızca OA Radyo açıkken (simge saatin yanındayken de olur) ve bilgisayar uykuda değilken çalışır. Ayarlar’dan “Windows açılınca başlat”ı açabilirsin.': 'Schedules only run while OA Radyo is open (in the tray is fine) and the computer isn’t asleep. You can turn on “Start with Windows” in Settings.',
    'İstasyon': 'Station', 'Saat': 'Time', 'Tarih': 'Date', 'Süre (dakika)': 'Duration (minutes)', 'Tekrar': 'Repeat', 'Bir kez': 'Once',
    'Her gün': 'Every day', 'Hafta içi': 'Weekdays', 'Hafta sonu': 'Weekends', 'Belirli günler': 'Specific days',
    'Pzt': 'Mon', 'Sal': 'Tue', 'Çar': 'Wed', 'Per': 'Thu', 'Cum': 'Fri', 'Cmt': 'Sat', 'Paz': 'Sun',
    'Saati gir.': 'Enter a time.', 'Tarihi seç.': 'Pick a date.', 'En az bir gün seç.': 'Pick at least one day.',
    'Seçtiğin zaman geçmişte kaldı.': 'That time is already in the past.', 'Süre 1 ile 360 dakika arasında olmalı.': 'Duration must be between 1 and 360 minutes.',
    'Önce bir istasyonu çal ya da favorilere ekle.': 'Play a station or add one to favourites first.',
    'Önce kaydedilebilecek bir istasyonu çal ya da favorilere ekle.': 'Play a recordable station or add one to favourites first.',
    'Kapalı': 'Off', 'Açık': 'Light',
    // Ayarlar
    'Görünüm': 'Appearance', 'Koyu': 'Dark', 'Windows’a uy': 'Match Windows', 'Dil': 'Language',
    'Pencere': 'Window', 'Kapatınca arka planda çalmaya devam et': 'Keep playing in the background when closed',
    'Pencere kapanınca radyo saatin yanındaki simgede çalmaya devam eder.': 'When you close the window, the radio keeps playing from the icon next to the clock.',
    'Windows açılınca başlat': 'Start with Windows', 'Arka planda başlar; zamanlanmış kayıtlar ve alarmlar için gerekli.': 'Starts in the background; needed for scheduled recordings and alarms.',
    'Bilgisayarlar arası eşitleme': 'Sync between computers',
    'Favoriler, eklediğin istasyonlar ve son dinlenenler seçtiğin klasördeki bir dosyada tutulur. OneDrive, Google Drive ya da Dropbox içinde bir klasör seçersen diğer bilgisayarında da aynı klasörü seçtiğinde listeler eşitlenir.': 'Favourites, stations you added and recent history are kept in a file in the folder you choose. Pick a folder inside OneDrive, Google Drive or Dropbox and choose the same folder on your other computer to keep them in sync.',
    'Eşitleme kapalı': 'Sync is off', 'Klasör seç': 'Choose folder', 'Eşitleme açık.': 'Sync is on.',
    'Eşitleme açıldı. Diğer bilgisayarda da aynı klasörü seç.': 'Sync is on. Choose the same folder on your other computer.',
    'Eşitleme açıldı; iki taraftaki listeler birleştirildi.': 'Sync is on; both lists were merged.', 'Favoriler diğer bilgisayardan eşitlendi.': 'Favourites synced from your other computer.',
    'Yedek': 'Backup', 'Yedeği dışa aktar': 'Export backup', 'Yedekten içe aktar': 'Import backup', 'Yedek kaydedildi.': 'Backup saved.',
    'Yedekteki her şey zaten listende.': 'Everything in the backup is already in your lists.', 'Bu dosya okunamadı; OA Radyo yedeği olduğundan emin ol.': 'This file couldn’t be read; make sure it’s a OA Radyo backup.',
    'Discord’da dinlediğimi göster': 'Show what I’m listening to on Discord', 'Discord açıksa profilinde “OA Radyo dinliyor” ve çalan şarkı görünür.': 'If Discord is open, your profile shows “Listening to OA Radyo” and the current song.',
    'Discord bağlantısı bu sürümde henüz etkin değil.': 'The Discord connection isn’t enabled in this version yet.',
    'Kısayollar': 'Shortcuts', 'Uygulama arka plandayken de kısayollar çalışsın': 'Shortcuts work even when the app is in the background',
    'Başka bir programdayken de radyoyu kontrol edebilirsin.': 'Control the radio while you’re in another program.',
    'Çal / duraklat': 'Play / pause', 'Sonraki / önceki istasyon': 'Next / previous station', 'Sesi aç / kıs': 'Volume up / down', 'Sesi kapat / aç': 'Mute / unmute',
    'Güncellemeleri denetle': 'Check for updates', 'Sürüm': 'Version',
    'Dil değişince uygulama yeniden yüklenir.': 'The app reloads when you change the language.',
    // Güncellemeler
    'En güncel sürümü kullanıyorsun': 'You’re on the latest version', 'Yeni sürüm var mı bakalım': 'Let’s see if there’s a new version',
    'Denetleniyor…': 'Checking…', 'Kullandığın sürüm': 'Your version', 'Bu sürümde neler var?': 'What’s new in this version?',
    'Yeniden başlat ve güncelle': 'Restart and update', 'İndirme sayfasını aç': 'Open the download page', 'Güncelleme yapılamadı': 'Update failed',
    'Uygulama birkaç saniyeliğine kapanıp yeni sürümle yeniden açılacak.': 'The app will close for a few seconds and reopen with the new version.',
    'Bu sürüm tam paket olarak indirilmeli; indirme sayfası tarayıcıda açılacak.': 'This version needs the full package; the download page will open in your browser.',
    'Güncellemeler yalnızca uygulamanın kendi dosyasını indirir (1 MB’tan küçük); favorilerin, kayıtların ve ayarların olduğu gibi kalır.': 'Updates only download the app itself (under 1 MB); your favourites, recordings and settings stay as they are.',
    'OA Radyo açıldıktan kısa süre sonra ve 6 saatte bir kendiliğinden denetler.': 'OA Radyo checks by itself shortly after starting and every 6 hours.',
    'Geliştirme modundasın': 'You’re in development mode', 'Güncelleme kaynağı henüz ayarlanmadı': 'The update source isn’t set up yet',
    '“npm start” ile çalışırken uygulama kendini güncellemez; güncellemeler hazır paket (Radyo.exe) için.': 'When running with “npm start” the app doesn’t update itself; updates are for the packaged app (Radyo.exe).',
    'Güncellemelerin yayınlanacağı GitHub deposu bağlandığında bu sayfa çalışacak.': 'This page will work once the GitHub repository for updates is connected.',
    'Güncelleme denetlenemedi.': 'Couldn’t check for updates.', 'Güncelleme indirilemedi.': 'Couldn’t download the update.', 'Hazır': 'Ready',
    'Güncelleme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.': 'Couldn’t reach the update server. Check your internet connection.',
    'Güncelleme indirilemedi. İnternet bağlantını kontrol et.': 'Couldn’t download the update. Check your internet connection.',
    'İndirilen dosya doğrulanamadı; güncelleme uygulanmadı. Daha sonra tekrar dene.': 'The downloaded file couldn’t be verified, so the update wasn’t applied. Try again later.',
    // Destek
    'Destek ve iletişim': 'Support and contact', 'Gizlilik politikası': 'Privacy policy', 'Yazılım Geliştirici': 'Software Developer', 'Radyo uygulamasının geliştiricisi': 'Developer of Radyo',
    'Sorun bildir ya da öneri gönder': 'Report a problem or send a suggestion', 'Mesajın': 'Your message', 'E-postayı hazırla': 'Prepare email',
    'Ne oldu, ya da ne eklenmesini istersin? (Örneğin: “X radyosu açılmıyor”)': 'What happened, or what would you like added? (E.g. “Station X won’t play”)',
    'E-posta programın açılır; mesaja sürüm ve sistem bilgisi eklenir, göndermeden önce görebilirsin.': 'Your email app opens; version and system info are added to the message and you can review it before sending.',
    'Uygulama hakkında': 'About the app', 'Altyapı': 'Built with', 'Web sitesi': 'Website', 'E-posta': 'Email', 'Telefon': 'Phone',
    'İletişim bilgisi eklenmemiş.': 'No contact details added.',
    'İstasyon bilgileri, gönüllülerin oluşturduğu ücretsiz': 'Station data comes from the free, volunteer-built',
    'veritabanından gelir.\n      Yayınların hakları ilgili radyo kuruluşlarına aittir.': 'database. Broadcast rights belong to the respective stations.',
    'veritabanından gelir. Yayınların hakları ilgili radyo kuruluşlarına aittir.': 'database. Broadcast rights belong to the respective stations.',
    // Ana süreçten gelen hata mesajları
    'Yayından veri alınamadı, kayıt yapılamadı.': 'No data came from the stream, so nothing was recorded.',
    'Yayın bağlantısı koptu; o ana kadarki kısım kaydedildi.': 'The stream dropped; what was recorded until then was saved.',
    'Zaten bir kayıt sürüyor.': 'A recording is already in progress.', 'Geçersiz yayın adresi.': 'Invalid stream address.',
    'Bu yayın (HLS) kaydedilemiyor.': 'This (HLS) stream can’t be recorded.', 'Yayına bağlanılamadı.': 'Couldn’t connect to the stream.',
    'Bu yayının biçimi kaydedilemiyor.': 'This stream’s format can’t be recorded.', 'Zamanlama bilgileri eksik ya da hatalı.': 'The schedule details are missing or invalid.',
    'Bu istasyona kısa süre önce oy verildi, biraz sonra tekrar dene.': 'This station was voted for recently; try again in a bit.',
    'Oy verilemedi.': 'Couldn’t vote.', 'Oy verilemedi, internet bağlantını kontrol et.': 'Couldn’t vote; check your internet connection.',
    'Geçersiz dil seçimi.': 'Invalid language.', 'Geçersiz ülke seçimi.': 'Invalid country.', 'Geçersiz seçim.': 'Invalid selection.',
    'Adsız istasyon': 'Untitled station', 'İnternete bağlanılamadı': 'No internet connection', 'Liste yüklenemedi.': 'The list couldn’t be loaded.',

    // Sohbet ve kullanım sayımı
    'Sohbet': 'Chat', 'Bu radyoyu dinleyenlerle sohbet et': 'Chat with people listening to this station', 'Canlı sohbet': 'Live chat',
    'Sohbeti kapat': 'Close chat', 'Takma adın': 'Your nickname', 'Örn. Gece Kuşu': 'e.g. Night Owl', 'Bir şey yaz…': 'Write something…',
    'Mesaj': 'Message', 'Gönder': 'Send', 'Bu mesajı bildir': 'Report this message', 'Şu an yalnızsın': 'You’re the only one here',
    'Bağlantı yok': 'Not connected', 'Bağlanıyor…': 'Connecting…', 'Sohbet etmek için bir radyo aç.': 'Play a station to chat.',
    'Henüz mesaj yok. İlk merhabayı sen de.': 'No messages yet. Say hello first.',
    'Saygılı ol. Bağlantı paylaşılamaz; kaba sözler yıldızlanır. Takma adın ve mesajların bu odadaki herkese görünür.': 'Be kind. Links aren’t allowed; rude words are masked. Your nickname and messages are visible to everyone in this room.',
    'Önce 2–20 harflik bir takma ad yaz.': 'First enter a nickname of 2–20 characters.', 'Bağlantı yok, birkaç saniye sonra tekrar dene.': 'Not connected, try again in a few seconds.',
    'Bu odada mesaj gönderemezsin.': 'You can’t post in this room.', 'Takma ad 2–20 harf ya da rakam olmalı.': 'Nickname must be 2–20 letters or digits.',
    'Sohbette bağlantı paylaşılamıyor.': 'Links can’t be shared in chat.', 'Biraz yavaş: birkaç saniye sonra tekrar yaz.': 'Slow down: try again in a few seconds.',
    'İsimsiz kullanım istatistiği': 'Anonymous usage statistics', 'OA Radyo’yu geliştirmemize yardım eder misin?': 'Will you help us improve OA Radyo?',
    'Kaç kişinin kullandığını ve toplam ne kadar dinlendiğini isimsiz olarak sayarız. Seni tanımlayan bir bilgi gönderilmez; istediğin zaman Ayarlar’dan kapatabilirsin.': 'We anonymously count how many people use it and how much is listened in total. Nothing that identifies you is sent; you can turn it off in Settings anytime.',
    'Hayır': 'No', 'Paylaş': 'Share', 'Gizlilik ve sohbet': 'Privacy and chat', 'İsimsiz kullanım istatistiği paylaş': 'Share anonymous usage statistics',
    'Kaç kişinin kullandığı ve toplam dinleme süresi sayılır; seni tanımlayan bilgi gönderilmez.': 'Counts how many people use the app and total listening time; nothing that identifies you is sent.',
    'Sohbet takma adı:': 'Chat nickname:', 'Değiştir': 'Change', 'Sohbette bir sonraki mesajında yeni takma adını yazabilirsin.': 'You can enter a new nickname with your next chat message.',
  };

  // Sayı ya da ad içeren metinler: [kalıp, çeviri].
  const P = [
    [/^(\d+) kişi burada$/, '$1 people here'],
    [/^([\d.,]+) istasyon$/, '$1 stations'],
    [/^“(.+)” için sonuçlar$/, 'Results for “$1”'],
    [/^Liste güncellendi: (.+)$/, (m, a) => `List updated: ${tx(a)}`],
    [/^bugün (\d\d:\d\d)$/, 'today $1'], [/^dün (\d\d:\d\d)$/, 'yesterday $1'], [/^yarın (\d\d:\d\d)$/, 'tomorrow $1'],
    [/^Sıradaki: (.+)$/, (m, a) => `Next: ${tx(a)}`],
    [/^Bağlantı koptu, yeniden bağlanıyor… \((\d+)\)$/, 'Connection lost, reconnecting… ($1)'],
    [/^Daha fazla göster · ([\d.,]+) istasyon daha$/, 'Show more · $1 more stations'],
    [/^(\d+) dk önce$/, '$1 min ago'], [/^(\d+) sa önce$/, '$1 h ago'], [/^(\d+) gün önce$/, '$1 days ago'],
    [/^(\d+) sa (\d+) dk$/, '$1 h $2 min'], [/^(\d+) sa$/, '$1 h'], [/^(\d+) dk$/, '$1 min'],
    [/^(\d+) dakika sonra durdur$/, 'Stop in $1 minutes'], [/^Uyku zamanlayıcı: (\d+) dakika kaldı$/, 'Sleep timer: $1 minutes left'],
    [/^Kaydı durdur \((.*)\)$/, 'Stop recording ($1)'], [/^(.+) yayınını kaydet$/, 'Record $1'],
    [/^Kayıt başladı: (.+)$/, 'Recording started: $1'], [/^Kaydedildi: (.+)$/, 'Saved: $1'], [/^Kaydediliyor: (.+)$/, 'Recording: $1'],
    [/^Kayıt zamanlandı: (.+)$/, 'Recording scheduled: $1'], [/^Alarm kuruldu: (.+)$/, 'Alarm set: $1'], [/^Alarm: (.+)$/, 'Alarm: $1'],
    [/^(.+) istasyonunu sil$/, 'Delete $1'], [/^(.+) kaydını sil$/, 'Delete recording $1'],
    [/^(.+) için oyun Radio Browser’a iletildi\.$/, 'Your vote for $1 was sent to Radio Browser.'],
    [/^([\d.,]+) istasyon içe aktarıldı\.$/, '$1 stations imported.'],
    [/^Sürüm (.+)$/, 'Version $1'], [/^Son eşitleme: (.+)$/, 'Last sync: $1'], [/^Son denetim: (.+)$/, 'Last checked: $1'],
    [/^OA Radyo (.+) hazır$/, 'OA Radyo $1 is ready'], [/^OA Radyo (.+) çıktı$/, 'OA Radyo $1 is out'], [/^OA Radyo (.+) indirildi\.$/, 'OA Radyo $1 downloaded.'], [/^OA Radyo (.+) indiriliyor…$/, 'Downloading OA Radyo $1…'],
    [/^OA Radyo’nun yeni sürümü \((.+)\) çıktı\.$/, 'A new version of OA Radyo ($1) is out.'],
    [/^(.+) yayın yapan radyolar$/, 'Stations broadcasting in $1'], [/^(.+) radyoları$/, 'Radio in $1'],
    [/^(.+) · ülkeye göre daraltabilirsin$/, '$1 · narrow it down by country'], [/^“(.+)” araması uygulanıyor$/, 'Search “$1” is applied'],
    [/^Türkiye listesinin dışında, tüm dünyadaki radyolarda da “(.+)” aranabilir\.$/, 'You can also search for “$1” in stations around the world.'],
    [/^(.+) klasörü$/, '$1 folder'], [/^(.+) “(.+)” klasörüne eklendi\.$/, '$1 added to the “$2” folder.'],
    [/^Ses artık şuradan çıkıyor: (.+)$/, (m, a) => `Sound now plays through: ${tx(a)}`],
    [/^Paylaşılan radyo açıldı: (.+)$/, 'Shared station opened: $1'], [/^(.+) şu an açılamadı\.$/, '$1 can’t be opened right now.'],
    [/^SON ÇALAN ŞARKILAR · (.+)$/, 'RECENTLY PLAYED · $1'],
    [/^Şu kısayolları başka bir program kullanıyor: (.+)$/, 'These shortcuts are used by another program: $1'],
    [/^(.+) (alarmı|zamanlaması) açık$/, '$1 is on'],
    [/^İstasyon listesine ulaşılamadı\. İnternet bağlantını kontrol et\. \((.*)\)$/, 'Couldn’t reach the station list. Check your internet connection. ($1)'],
    [/^Paylaşılan radyo açıldı: (.+)$/, 'Shared station opened: $1'],
  ];

  function tx(text) {
    if (!text) return text;
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    const core = text.trim();
    if (!core) return text;
    if (Object.prototype.hasOwnProperty.call(D, core)) return lead + D[core] + trail;
    for (const [re, rep] of P) {
      if (re.test(core)) return lead + core.replace(re, rep) + trail;
    }
    return text;
  }
  window.tx = tx;

  // Radyo ve şarkı adları gibi verilere dokunma.
  const SKIP = '.card-name, .hero-name, .side-name, .player-name, .song-t, .sim-name, .tag, .sim-sub, .hero-song, .wi-name, .wi-native, .rec-name, .upd-notes-text, .dev-name, .contact-val, .stat-v, .top-text, kbd, script, style, textarea, input, [data-noi18n]';
  const ATTRS = ['title', 'aria-label', 'placeholder'];

  function doText(node) {
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    const t = tx(node.data);
    if (t !== node.data) node.data = t;
  }
  function doEl(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const t = tx(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = w.nextNode();
    while (n) {
      if (n.nodeType === 3) doText(n);
      else doEl(n);
      n = w.nextNode();
    }
  }

  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doEl(m.target);
    }
  });
  const start = () => {
    walk(document.documentElement);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.title = tx(document.title);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
