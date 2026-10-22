#!/usr/bin/env python3
"""
oalabs.dev'in İngilizce sayfalarını Türkçe sayfalardan üretir:
  docs/index.html        -> docs/en/index.html
  docs/radyo/index.html  -> docs/en/radyo/index.html

Türkçe sayfa değişince bu betiği çalıştır: python3 scripts/site_en.py
Bir Türkçe metin bulunamazsa (sayfada değişmişse) betik hata verir; aşağıdaki
listede o satırı güncelle.
"""
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'docs')

COMMON = [
    ('<html lang="tr">', '<html lang="en">'),
    ('<a class="lang-sw" data-lang-switch href="/en/">EN</a>', '<a class="lang-sw" data-lang-switch href="/">TR</a>'),
    ('<a class="lang-sw" data-lang-switch href="/en/radyo/">EN</a>', '<a class="lang-sw" data-lang-switch href="/radyo/">TR</a>'),
    ('<span class="lbl"><b>Giriş yap</b><small>veya üye ol</small></span>', '<span class="lbl"><b>Sign in</b><small>or sign up</small></span>'),
    ('© 2026 · Oğuzhan Aydın', '© 2026 · Oğuzhan Aydın'),
]

HOME = [
    ('<title>OA Labs — küçük uygulamalar, özenle yapılmış</title>', '<title>OA Labs — small apps, carefully made</title>'),
    ("content=\"OA Labs: Oğuzhan Aydın'ın geliştirdiği ücretsiz, reklamsız ve sade uygulamalar. OA Radyo ve yakında daha fazlası.\"",
     'content="OA Labs: free, ad-free and simple apps made by Oğuzhan Aydın. OA Radyo, with more on the way."'),
    ('content="Küçük uygulamalar, özenle yapılmış. Ücretsiz, reklamsız, verin sende kalır."', 'content="Small apps, carefully made. Free, ad-free, and your data stays yours."'),
    ('<link rel="canonical" href="https://oalabs.dev/">', '<link rel="canonical" href="https://oalabs.dev/en/">'),
    ('href="radyo/img/favicon.png"', 'href="/radyo/img/favicon.png"'),
    ('href="site.css"', 'href="/site.css"'),
    ('<a class="logo" href="/">', '<a class="logo" href="/en/">'),
    ('<a href="#uygulamalar">Uygulamalar</a>', '<a href="#uygulamalar">Apps</a>'),
    ('<a href="#ilkeler">Nasıl çalışırız</a>', '<a href="#ilkeler">How we work</a>'),
    ('<a href="#iletisim">İletişim</a>', '<a href="#iletisim">Contact</a>'),
    ('<a class="btn primary small nav-cta" href="radyo/">OA Radyo’yu indir</a>', '<a class="btn primary small nav-cta" href="/en/radyo/">Get OA Radyo</a>'),
    ('<p class="kicker">Oğuzhan Aydın’ın yazılım atölyesi</p>', '<p class="kicker">Oğuzhan Aydın’s software workshop</p>'),
    ('<h1>Küçük uygulamalar, özenle yapılmış.</h1>', '<h1>Small apps, carefully made.</h1>'),
    ('<p class="lead">Her gün işine yarayan, sade ve ücretsiz araçlar. Reklam yok, hesap zorunlu değil, verin bilgisayarında kalır.</p>',
     '<p class="lead">Simple, free tools you’ll use every day. No ads, no account required, and your data stays on your computer.</p>'),
    ('<a class="btn primary" href="radyo/">', '<a class="btn primary" href="/en/radyo/">'),
    ('            OA Radyo’yu indir\n', '            Get OA Radyo\n'),
    ('<a class="btn" href="dinle/">', '<a class="btn" href="/dinle/?lang=en">'),
    ('            Web’de dinle\n', '            Listen on the web\n'),
    ('<a class="btn" href="#uygulamalar">Bütün uygulamalar</a>', '<a class="btn" href="#uygulamalar">All apps</a>'),
    ('src="radyo/img/app-kesfet.webp"', 'src="/radyo/img/app-kesfet.webp"'),
    ('alt="OA Radyo uygulamasının ana ekranı: çalan radyo, istasyon bilgisi ve radyo kartları"', 'alt="OA Radyo’s main screen: the station playing, station details and station cards"'),
    ('<img src="radyo/img/icon.png" alt="" width="40" height="40">', '<img src="/radyo/img/icon.png" alt="" width="40" height="40">'),
    ('<span>Windows 10 ve 11 · Ücretsiz</span>', '<span>Windows 10 and 11 · Free</span>'),
    ('<h2 class="h2" id="apps-h">Uygulamalar</h2>', '<h2 class="h2" id="apps-h">Apps</h2>'),
    ('<p class="lead-2">Her biri tek bir işi iyi yapmak için. Hepsi aynı imzayla: OA.</p>', '<p class="lead-2">Each one does one thing well. All with the same signature: OA.</p>'),
    ('<img class="app-icon img" src="radyo/img/icon.png"', '<img class="app-icon img" src="/radyo/img/icon.png"'),
    ('<span class="state live">Yayında</span>', '<span class="state live">Available</span>'),
    ('<p>Türkiye’nin ve dünyanın radyoları tek uygulamada. Kayıt, alarm, ekolayzır, şarkı adı.</p>', '<p>Turkey’s and the world’s radio stations in one app. Recording, alarms, equaliser, song titles.</p>'),
    ('aria-label="Platformlar"', 'aria-label="Platforms"'),
    ('Android <small>Yakında</small>', 'Android <small>Soon</small>'),
    ('<a class="btn primary small" href="radyo/">İncele ve indir</a>', '<a class="btn primary small" href="/en/radyo/">Learn more</a>'),
    ('<a class="btn small" href="dinle/">', '<a class="btn small" href="/dinle/?lang=en">'),
    ('</svg> Web’de dinle</a>', '</svg> Listen on the web</a>'),
    ('<span class="state">Yakında</span>', '<span class="state">Coming soon</span>'),
    ('<p>Canlı skorlar, istatistikler ve maç haberleri.</p>', '<p>Live scores, stats and match news.</p>'),
    ('<p>Hazırlanıyor.</p>', '<p>In the works.</p>'),
    ('<p>Bilgisayarını derli toplu ve hızlı tutar. Gereksiz ve kopya dosyalar, başlangıç programları, sistem bilgisi.</p>', '<p>Keeps your computer tidy and fast. Junk and duplicate files, startup apps, system info.</p>'),
    ('src="harrier/img/icon.png"', 'src="/harrier/img/icon.png"'),
    ('</svg> Beta’yı indir</a>', '</svg> Download beta</a>'),
    ('<p class="beta-note">Windows 10 ve 11 · İlk açılışta Windows uyarı verirse “Ek bilgi” → “Yine de çalıştır”.</p>',
     '<p class="beta-note">Windows 10 and 11 · If Windows shows a warning the first time, choose “More info” → “Run anyway”.</p>'),
    ("fetch('/harrier/latest.json'", "fetch('/harrier/latest.json'"),
    ('<h2 class="h2" id="uye-h">OA Labs’e üye ol</h2>', '<h2 class="h2" id="uye-h">Create an OA Labs account</h2>'),
    ('<p>Ücretsiz ve şifresiz: e-postana gelen kodla giriş yaparsın. Uygulamaları kullanmak için üyelik gerekmez.</p>',
     '<p>Free and password-free: you sign in with a code sent to your email. You don’t need an account to use the apps.</p>'),
    ('<li>Yeni uygulamalardan ilk sen haberdar ol</li>', '<li>Be the first to hear about new apps</li>'),
    ('<li>Beta sürümlere erken erişim</li>', '<li>Early access to beta versions</li>'),
    ('<li>Hesabını istediğin an sil</li>', '<li>Delete your account anytime</li>'),
    ('<a class="btn primary" href="uye/" data-guest>Üye ol</a>', '<a class="btn primary" href="/uye/?lang=en" data-guest>Sign up</a>'),
    ('<a class="btn" href="uye/?giris" data-guest>Giriş yap</a>', '<a class="btn" href="/uye/?giris&amp;lang=en" data-guest>Sign in</a>'),
    ('<a class="btn primary" href="hesabim/" data-member hidden>Hesabıma git</a>', '<a class="btn primary" href="/hesabim/?lang=en" data-member hidden>Go to my account</a>'),
    ('<h2 class="h2" id="ilke-h">Nasıl çalışırız</h2>', '<h2 class="h2" id="ilke-h">How we work</h2>'),
    ('<div><h3>Ücretsiz ve reklamsız</h3><p>Uygulamaların hepsi ücretsiz. Araya reklam sokmayız.</p></div>',
     '<div><h3>Free and ad-free</h3><p>All our apps are free. We don’t put ads in them.</p></div>'),
    ('<div><h3>Verin sende kalır</h3><p>Uygulamalar hesap istemez; üyelik isteğe bağlı. Bilgilerini satmayız, reklam için kullanmayız. <a href="gizlilik/">Gizlilik politikası</a></p></div>',
     '<div><h3>Your data stays yours</h3><p>The apps don’t need an account; signing up is optional. We never sell your data or use it for ads. <a href="/gizlilik/#en">Privacy policy</a></p></div>'),
    ('<div><h3>Kendini günceller</h3><p>Yeni sürümler uygulamanın içinden tek tıkla gelir.</p></div>',
     '<div><h3>Updates itself</h3><p>New versions arrive inside the app with one click.</p></div>'),
    ('<a class="quiet" href="gizlilik/">Gizlilik politikası</a>', '<a class="quiet" href="/gizlilik/#en">Privacy policy</a>'),
    ('<a class="quiet" href="radyo/">OA Radyo</a>', '<a class="quiet" href="/en/radyo/">OA Radyo</a>'),
    ('<script src="i18n-site.js"></script>', '<script src="/i18n-site.js"></script>'),
    ('<script src="hesap.js"></script>', '<script src="/hesap.js"></script>'),
]

RADYO = [
    ('<title>OA Radyo — Windows için ücretsiz radyo uygulaması</title>', '<title>OA Radyo — free radio app for Windows</title>'),
    ("content=\"Türkiye'deki ve dünyadaki binlerce radyo tek uygulamada. Şarkı adı, kayıt, alarm, ekolayzır, mini oynatıcı. Ücretsiz ve reklamsız.\"",
     'content="Thousands of Turkish and international radio stations in one app. Song titles, recording, alarms, equaliser, mini player. Free and ad-free."'),
    ('<meta property="og:title" content="OA Radyo — Windows için ücretsiz radyo uygulaması">', '<meta property="og:title" content="OA Radyo — free radio app for Windows">'),
    ("content=\"Türkiye'deki ve dünyadaki binlerce radyo tek uygulamada. Ücretsiz ve reklamsız.\"",
     'content="Thousands of Turkish and international radio stations in one app. Free and ad-free."'),
    ('<link rel="canonical" href="https://oalabs.dev/radyo/">', '<link rel="canonical" href="https://oalabs.dev/en/radyo/">'),
    ('<link rel="icon" href="img/favicon.png">', '<link rel="icon" href="/radyo/img/favicon.png">'),
    ('href="../site.css"', 'href="/site.css"'),
    ('"description": "Türkiye\'deki ve dünyadaki binlerce radyo tek uygulamada. Şarkı adı, kayıt, alarm, ekolayzır. Ücretsiz ve reklamsız."',
     '"description": "Thousands of Turkish and international radio stations in one app. Song titles, recording, alarms, equaliser. Free and ad-free."'),
    ('"url": "https://oalabs.dev/radyo/"', '"url": "https://oalabs.dev/en/radyo/"'),
    ('"inLanguage": "tr"', '"inLanguage": "en"'),
    ('<a class="crumb-home" href="/">', '<a class="crumb-home" href="/en/">'),
    ('<img src="img/icon.png" alt="" width="30" height="30">', '<img src="/radyo/img/icon.png" alt="" width="30" height="30">'),
    ('<a href="#ozellikler">Özellikler</a>', '<a href="#ozellikler">Features</a>'),
    ('<a href="#top20">En çok dinlenenler</a>', '<a href="#top20">Top 20</a>'),
    ('<a href="#kurulum">Kurulum</a>', '<a href="#kurulum">Install</a>'),
    ('<a href="#sss">Sorular</a>', '<a href="#sss">FAQ</a>'),
    ('<a href="/dinle/">Web’de dinle</a>', '<a href="/dinle/?lang=en">Listen on the web</a>'),
    ('<p class="kick">Windows için ücretsiz</p>', '<p class="kick">Free for Windows</p>'),
    ('<p class="tag dsp">Bütün radyolar. Tek pencere.</p>', '<p class="tag dsp">Every station. One window.</p>'),
    ('Windows için indir</a>', 'Download for Windows</a>'),
    ('<a class="btn big" href="/dinle/">', '<a class="btn big" href="/dinle/?lang=en">'),
    ('Web’de dinle</a>', 'Listen on the web</a>'),
    ('<p class="meta" data-meta>Windows 10 ve 11 · 64 bit</p>', '<p class="meta" data-meta>Windows 10 and 11 · 64-bit</p>'),
    ('<span class="tx"><b>Android sürümü yakında.</b> Telefonunda da dinle.</span>', '<span class="tx"><b>Android version coming soon.</b> Listen on your phone too.</span>'),
    ('>Çıkınca haber ver</button>', '>Notify me</button>'),
    ('<div class="cue" aria-hidden="true">Kaydır<', '<div class="cue" aria-hidden="true">Scroll<'),
    ('alt="OA Radyo’nun Keşfet ekranı: çalan radyo, kategoriler ve radyo kartları"', 'alt="OA Radyo’s Discover screen: the station playing, categories and station cards"'),
    ('src="img/', 'src="/radyo/img/'),
    ('aria-label="OA Radyo kısaca"', 'aria-label="OA Radyo in short"'),
    ('<p>Türkiye’nin bütün radyoları.</p>', '<p>Every radio station in Turkey.</p>'),
    ('<p style="color: var(--text-2)">Dünyadan binlercesi.</p>', '<p style="color: var(--text-2)">Thousands more from around the world.</p>'),
    ('<p>Çalan şarkının adı ekranda.</p>', '<p>The song title, right on screen.</p>'),
    ('<p style="color: var(--amber)">Hepsi ücretsiz.</p>', '<p style="color: var(--amber)">All free.</p>'),
    ('<h2 id="oz-h" class="dsp">Radyoyu aç.<br>Gerisini o halletsin.</h2>', '<h2 id="oz-h" class="dsp">Turn on the radio.<br>It handles the rest.</h2>'),
    ('<article class="step t1"><h3 class="dsp">Keşfet</h3><p>Türe, şehre ve en çok dinlenenlere göre. Bir karta dokun, çalsın.</p></article>',
     '<article class="step t1"><h3 class="dsp">Discover</h3><p>By genre, by city, or the most listened. Tap a card and it plays.</p></article>'),
    ('<article class="step t2"><h3 class="dsp">Ekolayzır</h3><p>Bas, Konuşma, Araba gibi hazır ayarlar. Radyo değişince ses birden yükselmez.</p></article>',
     '<article class="step t2"><h3 class="dsp">Equaliser</h3><p>Presets like Bass, Speech and Car. Volume doesn’t jump when you switch stations.</p></article>'),
    ('<article class="step t3"><h3 class="dsp">Favori klasörleri</h3><p>Radyolarını klasörlere ayır, sürükleyerek sırala, bilgisayarlar arasında eşitle.</p></article>',
     '<article class="step t3"><h3 class="dsp">Favourite folders</h3><p>Sort stations into folders, reorder by dragging, sync between computers.</p></article>'),
    ('<article class="step t4"><h3 class="dsp">İstatistikler</h3><p>Ne kadar, neyi dinlediğin. Hepsi bilgisayarında hesaplanır, bir yere gönderilmez.</p></article>',
     '<article class="step t4"><h3 class="dsp">Statistics</h3><p>What you listen to, and how much. All calculated on your computer, never sent anywhere.</p></article>'),
    ('alt="Keşfet ekranı"', 'alt="Discover screen"'), ('alt="Ekolayzır ayarları"', 'alt="Equaliser settings"'),
    ('alt="Favori klasörleri"', 'alt="Favourite folders"'), ('alt="İstatistikler ekranı"', 'alt="Statistics screen"'),
    ('aria-label="Diğer özellikler"', 'aria-label="More features"'),
    ('<div><h3>Çalan şarkı</h3><p>Şarkının adı ekranda; tek tıkla YouTube ya da Spotify’da aç. Son çalanlar da saklanır.</p></div>',
     '<div><h3>Now playing</h3><p>The song title on screen; open it on YouTube or Spotify in one click. Recent songs are kept too.</p></div>'),
    ('<div><h3>Kayıt ve alarm</h3><p>Yayını kaydet, belli saatte otomatik kayıt kur ya da sabahları radyoyla uyan.</p></div>',
     '<div><h3>Recording and alarms</h3><p>Record a broadcast, schedule recordings, or wake up to the radio.</p></div>'),
    ('<div><h3>Arka planda</h3><p>Pencereyi kapatınca saatin yanında çalmaya devam eder. Mini oynatıcı ve kısayollar.</p></div>',
     '<div><h3>In the background</h3><p>Close the window and it keeps playing next to the clock. Mini player and shortcuts.</p></div>'),
    ('<h2 id="wipe-h" class="dsp">Gece de, gündüz de.</h2>', '<h2 id="wipe-h" class="dsp">Day and night.</h2>'),
    ('<p style="margin: 12px auto 0; max-width: 30em; color: var(--muted)">Koyu ve açık tema. Windows’un ayarını kendiliğinden izler.</p>',
     '<p style="margin: 12px auto 0; max-width: 30em; color: var(--muted)">Dark and light themes. Follows your Windows setting automatically.</p>'),
    ('alt="Koyu tema"', 'alt="Dark theme"'), ('alt="Açık tema"', 'alt="Light theme"'),
    ('<h2 id="top-h" class="dsp">Türkiye’nin en çok dinlenen 20 radyosu.</h2>', '<h2 id="top-h" class="dsp">Turkey’s 20 most listened stations.</h2>'),
    ('<p style="margin: 14px 0 0; color: var(--muted)">Keşfet’te tek dokunuşla.</p>', '<p style="margin: 14px 0 0; color: var(--muted)">One tap away in Discover.</p>'),
    ('aria-label="1 ile 10 arası"', 'aria-label="1 to 10"'), ('aria-label="11 ile 20 arası"', 'aria-label="11 to 20"'),
    ('<p class="pill">Yakında</p>', '<p class="pill">Coming soon</p>'),
    ('<h2 id="droid-h" class="dsp">Cebinde de radyo.</h2>', '<h2 id="droid-h" class="dsp">Radio in your pocket.</h2>'),
    ('OA Radyo Android’e geliyor. Çıktığında sana haber verelim.', 'OA Radyo is coming to Android. We’ll let you know when it’s out.'),
    ('<div class="now"><small>ŞU AN ÇALIYOR</small>', '<div class="now"><small>NOW PLAYING</small>'),
    ('<span class="soon-tag">Android · Yakında</span>', '<span class="soon-tag">Android · Coming soon</span>'),
    ('aria-label="OA Radyo’nun sözleri"', 'aria-label="OA Radyo’s promises"'),
    ('<h3 class="dsp">Tamamen ücretsiz.</h3><p>Abonelik yok, gizli ücret yok.</p>', '<h3 class="dsp">Completely free.</h3><p>No subscription, no hidden costs.</p>'),
    ('<h3 class="dsp">Reklam.</h3><p>Araya biz reklam sokmayız.</p>', '<h3 class="dsp">Ads.</h3><p>We never add ads of our own.</p>'),
    ('<h3 class="dsp">Kurulum.</h3><p>Hesap gerekmez. İndir, aç, dinle.</p>', '<h3 class="dsp">To install.</h3><p>No account needed. Download, open, listen.</p>'),
    ('<span class="dsp big">1 dk</span>', '<span class="dsp big">1 min</span>'),
    ('<h2 id="end-h" class="dsp">Dinlemeye başla.</h2>', '<h2 id="end-h" class="dsp">Start listening.</h2>'),
    ('id="zip" href="https://github.com/oguzhanaydiin1/radyo-app/releases/latest">Kurulumsuz zip</a>', 'id="zip" href="https://github.com/oguzhanaydiin1/radyo-app/releases/latest">Portable zip</a>'),
    ('<h2 class="h2" id="kur-h">Kurulum bir dakika</h2>', '<h2 class="h2" id="kur-h">Installs in a minute</h2>'),
    ('<li><h3>İndir</h3><p>Radyo-Setup.exe dosyasını yukarıdaki düğmeyle indir.</p></li>', '<li><h3>Download</h3><p>Get Radyo-Setup.exe with the button above.</p></li>'),
    ('<li><h3>Kur</h3><p>Dosyayı aç. Windows uyarı verirse “Ek bilgi”, sonra “Yine de çalıştır”.</p></li>', '<li><h3>Install</h3><p>Open the file. If Windows shows a warning, choose “More info”, then “Run anyway”.</p></li>'),
    ('<li><h3>Dinle</h3><p>OA Radyo açılır, istasyonlar kendiliğinden iner. Bir karta tıkla.</p></li>', '<li><h3>Listen</h3><p>OA Radyo opens and downloads the station list by itself. Click a card.</p></li>'),
    ('<h2 class="h2" id="sss-h">Sorular</h2>', '<h2 class="h2" id="sss-h">Questions</h2>'),
    ('<details open><summary>Ücretli mi, reklam var mı?</summary><p>Hayır. OA Radyo tamamen ücretsiz ve reklamsız. Radyoların kendi yayınlarındaki reklamlar yayının parçası.</p></details>',
     '<details open><summary>Does it cost anything? Are there ads?</summary><p>No. OA Radyo is completely free and ad-free. Ads in the stations’ own broadcasts are part of the broadcast.</p></details>'),
    ('<details><summary>Windows neden uyarı veriyor?</summary><p>Uygulama henüz dijital olarak imzalı olmadığı için Windows ilk açılışta “bilgisayarınız korundu” diyebilir. “Ek bilgi”ye, sonra “Yine de çalıştır”a basman yeterli.</p></details>',
     '<details><summary>Why does Windows show a warning?</summary><p>The app isn’t digitally signed yet, so Windows may say “Windows protected your PC” the first time. Choose “More info”, then “Run anyway”.</p></details>'),
    ('<details><summary>Radyo listesi nereden geliyor?</summary><p>Gönüllülerin oluşturduğu ücretsiz <a href="https://www.radio-browser.info">Radio Browser</a> veritabanından.</p></details>',
     '<details><summary>Where does the station list come from?</summary><p>From the free, volunteer-run <a href="https://www.radio-browser.info">Radio Browser</a> database.</p></details>'),
    ('<details><summary>Aradığım radyo yok, ne yapayım?</summary><p>Uygulamada “Yayın adresiyle ekle”yi kullan ya da <a href="mailto:destek@oalabs.dev">destek@oalabs.dev</a>’e yaz, listeye ekleyelim.</p></details>',
     '<details><summary>My station isn’t listed. What can I do?</summary><p>Use “Add by stream URL” in the app, or write to <a href="mailto:destek@oalabs.dev">destek@oalabs.dev</a> and we’ll add it.</p></details>'),
    ('<details><summary>Nasıl güncellenir?</summary><p>Yeni sürüm çıkınca uygulama kendisi haber verir; “Yeniden başlat ve güncelle”ye basman yeterli.</p></details>',
     '<details><summary>How do updates work?</summary><p>When a new version is out, the app tells you; just press “Restart and update”.</p></details>'),
    ('<span>© 2026 <a href="/">OA Labs</a> · Oğuzhan Aydın</span>', '<span>© 2026 <a href="/en/">OA Labs</a> · Oğuzhan Aydın</span>'),
    ('<a class="quiet" href="/gizlilik/">Gizlilik politikası</a>', '<a class="quiet" href="/gizlilik/#en">Privacy policy</a>'),
    ('<span>Radyo yayınlarının hakları ilgili radyo kuruluşlarına aittir.</span>', '<span>Radio broadcasts belong to their respective stations.</span>'),
    ('<script src="../i18n-site.js"></script>', '<script src="/i18n-site.js"></script>'),
    ('<script src="../hesap.js"></script>', '<script src="/hesap.js"></script>'),
    ("parts.push('Sürüm ' + v);", "parts.push('Version ' + v);"),
    ("parts.push('Windows 10 ve 11 · 64 bit');", "parts.push('Windows 10 and 11 · 64-bit');"),
]


def build(src, dst, pairs):
    with open(os.path.join(ROOT, src), encoding='utf-8') as f:
        s = f.read()
    missing = []
    for old, new in COMMON + pairs:
        if old in s:
            s = s.replace(old, new)
        elif (old, new) not in COMMON:
            missing.append(old[:90])
    if missing:
        print(f'{src}: bulunamayan metinler (Türkçe sayfa değişmiş olabilir):', *missing, sep='\n  ')
        sys.exit(1)
    os.makedirs(os.path.dirname(os.path.join(ROOT, dst)), exist_ok=True)
    with open(os.path.join(ROOT, dst), 'w', encoding='utf-8') as f:
        f.write(s)
    print('yazıldı:', dst)


build('index.html', 'en/index.html', HOME)
build('radyo/index.html', 'en/radyo/index.html', RADYO)
