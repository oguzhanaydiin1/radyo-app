/*
 * OA Labs sitesi: ziyaretçi sayacı.
 * Çerez ve tarayıcı deposu kullanılmaz; kişiyi tanımlayan bir bilgi gönderilmez (yalnız sayfa yolu,
 * gelinen sitenin adresi ve dil). Sonuçlar yönetici panelinde görünür.
 * Açık sayfa 25 saniyede bir "buradayım" der; böylece şu an sitede kaç kişi olduğu bilinir.
 * Sitede en az SHOW_MIN kişi varsa köşede "Şu an N kişi sitede" yazısı çıkar.
 */
(function () {
  var API = 'https://api.oalabs.dev';
  var SHOW_MIN = 3;
  if (/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent) || navigator.webdriver) return;
  var path = location.pathname.replace(/index\.html$/, '') || '/';
  var en = document.documentElement.lang === 'en';
  var post = function (url, data, beacon) {
    var body = JSON.stringify(data);
    try {
      if (beacon && navigator.sendBeacon) return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
      return fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    } catch (e) { return null; }
  };

  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).origin + '/' : ''; } catch (e) {}
  post(API + '/v1/site/visit', { p: path, r: ref, l: en ? 'en' : 'tr' });

  var badge = null;
  function show(n) {
    if (n < SHOW_MIN) { if (badge) badge.hidden = true; return; }
    if (!badge) {
      var st = document.createElement('style');
      st.textContent =
        '.oa-live{position:fixed;left:16px;bottom:16px;z-index:20;display:flex;align-items:center;gap:8px;' +
        'padding:7px 12px;border-radius:999px;font:500 13px/1 var(--body,system-ui,sans-serif);color:var(--text-2,#B7BACA);' +
        'background:color-mix(in srgb,var(--bg-2,#11131C) 88%,transparent);border:1px solid var(--line,#1E2232);' +
        'backdrop-filter:blur(10px);box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none}' +
        '.oa-live i{width:8px;height:8px;border-radius:50%;background:#3DDC84;box-shadow:0 0 0 0 rgba(61,220,132,.6);animation:oaLive 2s infinite}' +
        '@keyframes oaLive{70%{box-shadow:0 0 0 7px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}' +
        '.oa-live b{font-weight:600;color:var(--text,#EEEAE2);display:none}.oa-live.mini span{display:none}.oa-live.mini b{display:inline}' +
        '.oa-live.mini{padding:7px 10px;gap:6px}' +
        '@media (prefers-reduced-motion:reduce){.oa-live i{animation:none}}' +
        '@media print{.oa-live{display:none}}';
      document.head.appendChild(st);
      badge = document.createElement('div');
      badge.className = 'oa-live';
      badge.setAttribute('role', 'status');
      badge.innerHTML = '<i aria-hidden="true"></i><span></span><b aria-hidden="true"></b>';
      document.body.appendChild(badge);
    }
    badge.hidden = false;
    var text = en ? n + ' people here right now' : 'Şu an ' + n + ' kişi sitede';
    badge.children[1].textContent = text;
    badge.children[2].textContent = n;
    badge.title = text;
    // Yazı birkaç saniye görünür, sonra sayfadaki düğmeleri kapatmasın diye yalnız sayıya küçülür.
    if (n !== shown) {
      shown = n;
      badge.classList.remove('mini');
      clearTimeout(miniTimer);
      miniTimer = setTimeout(function () { badge.classList.add('mini'); }, 8000);
    }
  }
  var shown = -1, miniTimer = null;

  var timer = null;
  function beat() {
    var r = post(API + '/v1/site/live', { p: path });
    if (r && r.then) r.then(function (j) { if (j && typeof j.live === 'number') show(j.live); });
  }
  function start() { if (!timer) { beat(); timer = setInterval(beat, 25000); } }
  function stop() { if (timer) { clearInterval(timer); timer = null; } post(API + '/v1/site/live?leave', { p: path }, true); }
  document.addEventListener('visibilitychange', function () { document.visibilityState === 'visible' ? start() : stop(); });
  window.addEventListener('pagehide', stop);
  if (document.visibilityState === 'visible') start();
})();
