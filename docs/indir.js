/*
 * "Android için indir" bağlantıları: telefon ya da tabletten tıklanırsa dosya doğrudan iner.
 * Bilgisayardan tıklanırsa APK bilgisayara inmek yerine bir pencere açılır; telefonun kamerasıyla
 * QR kodu okutup doğrudan telefona indirebilirsin (ya da yine de bilgisayara indir).
 */
(function () {
  // Uygulama başına: APK adresi, QR resmi, adı
  var APPS = {
    'https://api.oalabs.dev/indir/pusula/android': { qr: '/img/qr-pusula-android.svg', name: 'Pusula Browser' },
    'https://api.oalabs.dev/indir/kopru/android': { qr: '/img/qr-kopru-android.svg', name: 'Pusula Köprü' },
  };
  var ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return;
  var en = document.documentElement.lang === 'en';
  var T = en
    ? { h: 'Download to your phone', p: 'Point your Android phone’s camera at the code, then tap the link that appears. The download starts on your phone.', alt: 'Or download the file to this computer', close: 'Close', ios: ' is for Android and Windows; there’s no iPhone version yet.' }
    : { h: 'Telefonuna indir', p: 'Android telefonunun kamerasını koda tut, çıkan bağlantıya dokun. İndirme telefonunda başlar.', alt: 'Ya da dosyayı bu bilgisayara indir', close: 'Kapat', ios: ' Android ve Windows içindir; iPhone sürümü henüz yok.' };
  var dlg = null;
  function open(e, APK) {
    e.preventDefault();
    var app = APPS[APK];
    if (dlg && dlg.dataset.apk !== APK) { dlg.remove(); dlg = null; }
    if (!dlg) {
      var st = document.createElement('style');
      st.textContent =
        '.oa-qr{border:1px solid var(--border,#1E2232);border-radius:28px;padding:0;background:var(--surface,#11131C);color:var(--text,#EEEAE2);max-width:min(400px,calc(100vw - 32px));width:100%;box-shadow:0 30px 80px rgba(0,0,0,.5)}' +
        '.oa-qr::backdrop{background:rgba(5,6,10,.7);backdrop-filter:blur(4px)}' +
        '.oa-qr .in{padding:28px;text-align:center}' +
        '.oa-qr h2{margin:0 0 8px;font:800 24px/1.15 var(--display,system-ui)}' +
        '.oa-qr p{margin:0 0 18px;color:var(--text-2,#B7BACA);font-size:15.5px;line-height:1.55}' +
        '.oa-qr img{width:220px;height:220px;border-radius:16px;background:#fff;padding:10px;display:block;margin:0 auto 18px}' +
        '.oa-qr .alt{display:inline-block;color:var(--amber,#F2A541);font-weight:600;margin-bottom:6px}' +
        '.oa-qr .ios{font-size:13px;color:var(--faint,#7E8296);margin:14px 0 0}' +
        '.oa-qr .x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:18px;border:1px solid var(--border-2,#2A2F42);background:transparent;color:var(--text-2,#B7BACA);font-size:20px;line-height:1;cursor:pointer}';
      if (!document.getElementById('oa-qr-st')) { st.id = 'oa-qr-st'; document.head.appendChild(st); }
      dlg = document.createElement('dialog');
      dlg.dataset.apk = APK;
      dlg.className = 'oa-qr';
      dlg.setAttribute('aria-labelledby', 'oa-qr-h');
      dlg.innerHTML = '<div class="in"><button class="x" type="button" aria-label="' + T.close + '">×</button>' +
        '<h2 id="oa-qr-h">' + T.h + '</h2><p>' + T.p + '</p>' +
        '<img src="' + app.qr + '" alt="QR: ' + APK + '" width="220" height="220">' +
        '<a class="alt" href="' + APK + '">' + T.alt + '</a>' +
        (/iPhone|iPad|Macintosh/.test(ua) ? '<p class="ios">' + app.name + T.ios + '</p>' : '') + '</div>';
      document.body.appendChild(dlg);
      dlg.querySelector('.x').addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
      dlg.querySelector('.alt').addEventListener('click', function () { setTimeout(function () { dlg.close(); }, 300); });
    }
    if (dlg.showModal) dlg.showModal(); else location.href = APK;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !APPS[a.getAttribute('href')] || (dlg && dlg.contains(a))) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    open(e, a.getAttribute('href'));
  });
})();
