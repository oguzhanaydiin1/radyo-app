/*
 * OA Labs sitesi: dil (Türkçe / İngilizce).
 *
 * - Ana sayfa ve OA Radyo sayfasının İngilizce hâlleri /en/ altında ayrı sayfalardır
 *   (<html lang="en">). Bu dosya orada yalnızca menüdeki dinamik metinleri çevirir.
 * - Üyelik ve Hesabım sayfaları tek sayfadır (<body data-auto-lang>): seçilen dil
 *   İngilizceyse ekrandaki Türkçe metinler bu sözlükle anında çevrilir.
 * - Seçilen dil tarayıcıda "oaLang" olarak hatırlanır. Sağ üstteki TR/EN düğmesi
 *   ([data-lang-switch]) dili değiştirir.
 * Bu dosya hesap.js'den ÖNCE yüklenmelidir.
 */
(function () {
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var html = document.documentElement;
  var auto = function () { return document.body && document.body.hasAttribute('data-auto-lang'); };
  var qs = new URLSearchParams(location.search).get('lang');
  if (qs === 'en' || qs === 'tr') { set('oaLang', qs); set('oaLangChosen', '1'); }

  // Sabit sayfa kendi dilini söyler; tek sayfalar (üyelik, Hesabım) kayıtlı tercihi izler.
  var pageLang = html.getAttribute('lang') === 'en' ? 'en' : 'tr';
  var LANG = pageLang;
  if (document.currentScript && document.currentScript.hasAttribute('data-auto')) LANG = get('oaLang') === 'en' ? 'en' : 'tr';
  else set('oaLang', pageLang);
  window.OA_LANG = LANG;
  window.OA_LOCALE = LANG === 'en' ? 'en-GB' : 'tr-TR';
  html.lang = LANG;

  // ---------- Dil düğmesi ve öneri şeridi ----------
  function alt(lang) {
    var l = document.querySelector('link[rel="alternate"][hreflang="' + lang + '"]');
    if (!l) return null;
    try { return new URL(l.getAttribute('href'), location.href).pathname; } catch (e) { return null; }
  }
  function setupSwitch() {
    document.querySelectorAll('[data-lang-switch]').forEach(function (a) {
      var other = LANG === 'en' ? 'tr' : 'en';
      a.textContent = other.toUpperCase();
      a.setAttribute('lang', other);
      a.setAttribute('hreflang', other);
      a.setAttribute('aria-label', other === 'en' ? 'English' : 'Türkçe');
      a.title = other === 'en' ? 'English' : 'Türkçe';
      var target = alt(other);
      if (target) a.href = target;
      else { var u = new URL(location.href); u.searchParams.set('lang', other); a.href = u.pathname + u.search + u.hash; }
      a.addEventListener('click', function () { set('oaLang', other); set('oaLangChosen', '1'); });
    });
    // Tarayıcısı Türkçe olmayan ziyaretçiye, Türkçe sayfada İngilizce öneri (bir kez, zorlamadan).
    var en = alt('en');
    var langs = (navigator.languages || [navigator.language || '']).map(function (x) { return String(x).toLowerCase(); });
    if (LANG === 'tr' && en && !get('oaLangChosen') && !langs.some(function (x) { return x.indexOf('tr') === 0; })) {
      var bar = document.createElement('div');
      bar.className = 'lang-bar';
      bar.setAttribute('lang', 'en');
      bar.innerHTML = '<span>This page is also available in English.</span><a class="btn primary small" href="' + en + '">Switch to English</a><button type="button" class="lang-x" aria-label="Stay in Turkish">×</button>';
      bar.querySelector('a').addEventListener('click', function () { set('oaLang', 'en'); set('oaLangChosen', '1'); });
      bar.querySelector('button').addEventListener('click', function () { set('oaLangChosen', '1'); bar.remove(); });
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupSwitch); else setupSwitch();

  window.OA_T = function (s) { return s; };
  if (LANG !== 'en') return;

  // Tarih ve sayılar İngilizce biçimde.
  var swap = function (loc) { return loc === 'tr-TR' || loc === 'tr' ? 'en-GB' : loc; };
  [[Date.prototype, ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']], [Number.prototype, ['toLocaleString']]].forEach(function (pair) {
    pair[1].forEach(function (n) {
      var orig = pair[0][n];
      pair[0][n] = function (loc, opts) { return orig.call(this, swap(loc), opts); };
    });
  });

  var D = {
    // Sağ üstteki menü
    'Giriş yap': 'Sign in', 'veya üye ol': 'or sign up', 'Hoş geldin': 'Welcome',
    'Hesabına gir ya da ücretsiz üye ol. Şifre yok, e-postana kod gelir.': 'Sign in or create a free account. No password: we email you a code.',
    'Üye ol': 'Sign up', 'Yeni uygulamalardan ilk sen haberdar ol': 'Be the first to hear about new apps', 'Beta sürümlere erken erişim': 'Early access to beta versions',
    'Hesabım': 'My account', 'Profilim': 'My profile', 'Kullanıcı bilgilerim': 'Personal details', 'Uygulamalarım': 'My apps',
    'Bildirim tercihleri': 'Notifications', 'Güvenlik ve oturumlar': 'Security and sessions', 'Yardım ve destek': 'Help and support',
    'Çıkış yap': 'Sign out', 'Açık': 'On', 'Kapalı': 'Off', 'Giriş yap veya üye ol': 'Sign in or sign up',
    // Hata ve durum iletileri
    'Bu e-posta adresi geçerli görünmüyor.': 'This email address doesn’t look valid.',
    'Adını ve soyadını yaz.': 'Enter your first and last name.', 'Adını yaz.': 'Enter your first name.',
    'Üye olmak için aydınlatma metnini onaylaman gerekiyor.': 'To sign up, please accept the privacy notice.',
    'Bu e-postayla bir üyelik bulamadık. Üye olmak ister misin?': 'We couldn’t find an account with this email. Would you like to sign up?',
    'Bu e-postayla zaten bir üyelik var.': 'There’s already an account with this email.',
    'Bu zaten şu anki e-posta adresin.': 'That’s already your current email address.',
    'Az önce bir kod gönderdik. Bir dakika sonra yeniden isteyebilirsin.': 'We just sent you a code. You can ask for a new one in a minute.',
    'Çok fazla deneme oldu, biraz sonra tekrar dene.': 'Too many attempts. Please try again a little later.',
    'Kod yanlış. E-postadaki 6 haneli kodu kontrol et.': 'Wrong code. Check the 6-digit code in the email.',
    'Kodun süresi doldu. Yeni bir kod iste.': 'This code has expired. Ask for a new one.',
    'Çok fazla yanlış deneme oldu. Yeni bir kod iste.': 'Too many wrong attempts. Ask for a new code.',
    'Üyelik çok yakında açılıyor. Biraz sonra tekrar dene.': 'Sign-up opens very soon. Please try again later.',
    'E-posta gönderilemedi, biraz sonra tekrar dene.': 'The email couldn’t be sent. Please try again later.',
    'Oturumun kapanmış. Yeniden giriş yap.': 'Your session has ended. Please sign in again.',
    'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.': 'Couldn’t reach the server. Check your internet connection.',
    'Bir sorun çıktı, biraz sonra tekrar dene.': 'Something went wrong. Please try again later.',
    'Gönderiliyor…': 'Sending…', 'Kontrol ediliyor…': 'Checking…', 'Kaydediliyor…': 'Saving…', 'Yükleniyor…': 'Loading…',
    'Üyeliğin açıldı!': 'Your account is ready!', 'Giriş yapıldı!': 'You’re signed in!', 'Yeni kod gönderildi.': 'A new code is on its way.',
    // Üye ol / Giriş yap
    'Üye ol — OA Labs': 'Sign up — OA Labs', 'Giriş yap — OA Labs': 'Sign in — OA Labs', 'Üyelik': 'Account',
    'OA Labs’e üye ol': 'Create your OA Labs account',
    'Ücretsiz. Şifre yok: her girişte e-postana 6 haneli bir kod gelir.': 'Free. No password: each time you sign in, we email you a 6-digit code.',
    'E-posta adresini yaz, sana bir giriş kodu gönderelim.': 'Enter your email address and we’ll send you a sign-in code.',
    'Ad soyad': 'Full name', 'E-posta': 'Email', 'Web sitesi': 'Website',
    'Üyelik aydınlatma metnini': 'I’ve read the account privacy notice',
    'okudum; adımın ve e-posta adresimin üyelik için işlenmesini kabul ediyorum.': 'and agree to my name and email address being processed for my account.',
    'Yeni uygulamalar ve önemli güncellemeler için e-posta almak istiyorum. (İsteğe bağlı, istediğin zaman kapatabilirsin.)': 'Email me about new apps and important updates. (Optional, you can turn this off anytime.)',
    'Kod gönder': 'Send code', 'Kod': 'Code', 'Kod 10 dakika geçerli.': 'The code is valid for 10 minutes.', 'Onayla': 'Confirm',
    'Kodu yeniden gönder': 'Resend code', 'E-postayı değiştir': 'Change email',
    'adresine 6 haneli bir kod gönderdik. Gelmediyse gereksiz (spam) klasörüne bak.': '— we sent a 6-digit code to this address. If it doesn’t arrive, check your spam folder.',
    'adresine 6 haneli bir kod gönderdik.': '— we sent a 6-digit code to this address.',
    'ornek@eposta.com': 'you@example.com',
    // Hesabım
    'Hesabım — OA Labs': 'My account — OA Labs', 'Ana sayfa': 'Home', 'Konum': 'Breadcrumb', 'Hesabım menüsü': 'Account menu',
    'Uygulamalar': 'Apps', 'Web’de dinle': 'Listen on the web', 'İletişim': 'Contact', 'Merhaba': 'Hi',
    'Doğrulandı': 'Verified', 'Bilgilerimi düzenle': 'Edit my details', 'Duyuru e-postaları': 'Announcement emails',
    'Ayda en fazla birkaç e-posta': 'A few emails a month at most', 'Açık oturumlar': 'Active sessions', 'Giriş yaptığın cihazlar': 'Devices you’re signed in on',
    'Yalnızca bu cihaz': 'Only this device', 'Hesabını kapatmak mı istiyorsun?': 'Want to close your account?', 'Hesabımı sil': 'Delete my account',
    'Hesabın, bilgilerin ve bütün oturumların kalıcı olarak silinir. Bu işlem geri alınamaz.': 'Your account, your details and all your sessions will be permanently deleted. This can’t be undone.',
    'Hesabımı kalıcı olarak sil': 'Permanently delete my account', 'Emin misin? Silmek için tekrar bas': 'Are you sure? Press again to delete',
    'Bu bilgiler yalnızca hesabın için kullanılır, kimseyle paylaşılmaz.': 'These details are only used for your account and never shared.',
    'Ad': 'First name', 'Soyad': 'Last name', 'Değiştir': 'Change', 'Değiştirirsen yeni adresine bir doğrulama kodu göndeririz.': 'If you change it, we’ll send a verification code to the new address.',
    'Yeni e-posta adresi': 'New email address', 'Vazgeç': 'Cancel', 'Kaydet': 'Save',
    'Değişiklikler kaydedildi.': 'Changes saved.', 'E-posta adresin değiştirildi.': 'Your email address has been changed.',
    'OA Labs uygulamaları. Henüz çıkmamış olanlar için “Çıkınca haber ver” diyebilirsin.': 'OA Labs apps. For the ones not out yet, you can ask us to let you know.',
    'Beta’yı indir': 'Download beta', 'Windows · Beta · Android yakında': 'Windows · Beta · Android coming soon',
    'İndir': 'Download', 'Yakında': 'Coming soon', 'Yakında · Çıkınca sana haber vereceğiz': 'Coming soon · We’ll let you know when it’s out',
    'Çıkınca haber ver': 'Notify me', '✓ Haber verilecek': '✓ You’ll be notified', 'Hazırlanıyor.': 'In the works.',
    'Sana yalnızca istediğin konularda e-posta göndeririz.': 'We only email you about the things you choose.',
    'Duyurular': 'Announcements', 'Yeni uygulamalar ve önemli güncellemeler. Ayda en fazla birkaç e-posta.': 'New apps and important updates. A few emails a month at most.',
    'OA Score çıkınca haber ver': 'Tell me when OA Score is out', 'OA Barkod çıkınca haber ver': 'Tell me when OA Barkod is out', 'Harrier Cleaner çıkınca haber ver': 'Tell me when Harrier Cleaner is out',
    'Uygulama yayına girdiğinde tek bir e-posta.': 'A single email when the app launches.',
    'Güvenlik e-postaları': 'Security emails', 'Giriş kodları ve hesabınla ilgili önemli bildirimler. Kapatılamaz.': 'Sign-in codes and important account notices. Can’t be turned off.',
    'Güvenlik e-postaları her zaman açık': 'Security emails are always on',
    'Duyurular açıldı.': 'Announcements turned on.', 'Duyurular kapatıldı.': 'Announcements turned off.', 'Tercihin kaydedildi.': 'Preference saved.',
    'Hesabına giriş yapılmış cihazlar. Tanımadığın bir cihaz görürsen oturumu kapat. Şifre olmadığı için yeniden giriş ancak e-postana gelen kodla yapılabilir.': 'Devices signed in to your account. If you see one you don’t recognise, sign it out. As there’s no password, signing back in needs a code sent to your email.',
    'Bu cihaz dışındaki tüm oturumları kapat': 'Sign out all other devices', 'Bu cihaz': 'This device', 'Oturumu kapat': 'Sign out',
    'Oturum kapatıldı.': 'Session signed out.', 'Diğer bütün oturumlar kapatıldı.': 'All other sessions signed out.',
    'şu an etkin': 'active now', 'Bilinmeyen cihaz': 'Unknown device', 'Tarayıcı': 'Browser',
    'Bize yaz': 'Write to us', 'destek@oalabs.dev · Genelde bir gün içinde cevap veririz.': 'destek@oalabs.dev · We usually reply within a day.',
    'OA Radyo sık sorulan sorular': 'OA Radyo FAQ', 'Kurulum, güncelleme ve kayıtlarla ilgili cevaplar.': 'Answers about installing, updating and recording.',
    'Gizlilik ve üyelik aydınlatma metni': 'Privacy and account notice', 'Hangi bilgilerini neden tuttuğumuz.': 'What we keep about you, and why.',
    'Çıkınca haber vermemiz için üye ol ya da giriş yap. Şifre yok, e-postana kod gelir.': 'Sign up or sign in so we can tell you when it’s out. No password: we email you a code.',
    'OA Radyo Android çıkınca haber ver': 'Tell me when OA Radyo for Android is out', 'Android sürümü yayına girdiğinde tek bir e-posta.': 'A single email when the Android version launches.',
    'Android yakında': 'Android coming soon', 'Web': 'Web', 'Windows': 'Windows',
    'Gizlilik politikası': 'Privacy policy', '© 2026 · Oğuzhan Aydın': '© 2026 · Oğuzhan Aydın', 'Hesabıma git': 'Go to my account',
  };
  var P = [
    [/^Merhaba, (.+)$/, 'Hi, $1'], [/^Hoş geldin, (.+)!$/, 'Welcome, $1!'], [/^Hesabım: (.+)$/, 'My account: $1'],
    [/^(.+)’dan beri üye$/, 'Member since $1'], [/^(.+)’den beri üye$/, 'Member since $1'],
    [/^Bu cihaz ve (\d+) cihaz daha$/, 'This device and $1 more'],
    [/^(\d+) dakika önce$/, '$1 minutes ago'], [/^(\d+) saat önce$/, '$1 hours ago'],
    [/^Son etkinlik: (.+)$/, function (m, a) { return 'Last active: ' + tx(a); }],
    [/^Giriş: (.+)$/, 'Signed in: $1'], [/^Son sürüm (.+)$/, 'Latest version $1'], [/^Windows · Son sürüm (.+)$/, 'Windows · Latest version $1'],
    [/^(.+) — Hesabım — OA Labs$/, function (m, a) { return tx(a) + ' — My account — OA Labs'; }],
    [/^(.+?) \(Hata (.*)\)$/, function (m, a, b) { return tx(a) + ' (Error ' + b + ')'; }],
  ];
  function tx(s) {
    var t = String(s), k = t.trim();
    if (!k) return t;
    if (Object.prototype.hasOwnProperty.call(D, k)) return t.replace(k, D[k]);
    for (var i = 0; i < P.length; i++) if (P[i][0].test(k)) return t.replace(k, k.replace(P[i][0], P[i][1]));
    if (k.indexOf(' · ') > 0) return t.replace(k, k.split(' · ').map(tx).join(' · '));
    return t;
  }
  window.OA_T = tx;
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  // Bağlantıları İngilizce sayfalara yönlendir.
  function fixLink(a) {
    var h = a.getAttribute('href');
    if (!h || a.hasAttribute('data-lang-switch')) return;
    var n = h;
    if (h === '/' || /^\/#/.test(h)) n = '/en' + h;
    else if (/^\/radyo\//.test(h)) n = '/en' + h;
    else if (/^\/gizlilik\/(#.*)?$/.test(h)) n = '/gizlilik/#en';
    else if (/^\/dinle\/$/.test(h)) n = '/dinle/?lang=en';
    if (n !== h) a.setAttribute('href', n);
  }
  function doEl(el) {
    if (el.nodeType !== 1 || el.closest('[data-no-tx]')) return;
    ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v) { var t = tx(v); if (t !== v) el.setAttribute(a, t); } });
    if (el.tagName === 'A') fixLink(el);
  }
  function doText(n) {
    if (!n.parentElement || /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) || n.parentElement.closest('[data-no-tx]')) return;
    var t = tx(n.nodeValue);
    if (t !== n.nodeValue) n.nodeValue = t;
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n = w.nextNode();
    while (n) { if (n.nodeType === 3) doText(n); else doEl(n); n = w.nextNode(); }
  }
  var obs = new MutationObserver(function (list) {
    list.forEach(function (m) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doEl(m.target);
    });
  });
  function start() {
    walk(document.documentElement);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['href']) });
    document.title = tx(document.title);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
