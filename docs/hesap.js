// OA Labs üyelik: ortak yardımcılar ve sağ üstteki "Giriş yap / Hesabım" menüsü.
// Sayfada <div class="acct" data-account-slot> olan her yere menüyü yerleştirir.
window.OA = (function () {
  var API = 'https://api.oalabs.dev';
  try { var dev = localStorage.getItem('apiBase'); if (dev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(dev)) API = dev; } catch (e) {}
  var ERR = {
    eposta: 'Bu e-posta adresi geçerli görünmüyor.',
    ad: 'Adını ve soyadını yaz.',
    onay: 'Üye olmak için aydınlatma metnini onaylaman gerekiyor.',
    'uye-yok': 'Bu e-postayla bir üyelik bulamadık. Üye olmak ister misin?',
    'uye-var': 'Bu e-postayla zaten bir üyelik var.',
    ayni: 'Bu zaten şu anki e-posta adresin.',
    bekle: 'Az önce bir kod gönderdik. Bir dakika sonra yeniden isteyebilirsin.',
    cok: 'Çok fazla deneme oldu, biraz sonra tekrar dene.',
    kod: 'Kod yanlış. E-postadaki 6 haneli kodu kontrol et.',
    sure: 'Kodun süresi doldu. Yeni bir kod iste.',
    deneme: 'Çok fazla yanlış deneme oldu. Yeni bir kod iste.',
    kapali: 'Üyelik çok yakında açılıyor. Biraz sonra tekrar dene.',
    gonderilemedi: 'E-posta gönderilemedi, biraz sonra tekrar dene.',
    giris: 'Oturumun kapanmış. Yeniden giriş yap.',
    ag: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.',
  };
  function call(path, body) {
    if (body && typeof body === 'object' && !('lang' in body)) body.lang = window.OA_LANG || 'tr'; // e-postalar bu dilde gider
    return fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'sunucu' }; }); })
      .catch(function () { return { ok: false, error: 'ag' }; });
  }
  function msg(code) { return ERR[code] || 'Bir sorun çıktı, biraz sonra tekrar dene.'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    var s = p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '');
    return s.toLocaleUpperCase('tr-TR');
  }
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  var meP = null;
  function me(fresh) { if (fresh || !meP) meP = call('/v1/me'); return meP; }

  var I = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6"/></svg>',
    apps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>',
    chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  };
  // Hesabım menüsünün bölümleri (Hesabım sayfasının sol menüsü de bunu kullanır).
  var SECTIONS = [
    { id: 'profil', label: 'Profilim', icon: 'user' },
    { id: 'bilgiler', label: 'Kullanıcı bilgilerim', icon: 'card' },
    { id: 'uygulamalar', label: 'Uygulamalarım', icon: 'apps' },
    { id: 'bildirimler', label: 'Bildirim tercihleri', icon: 'bell' },
    { id: 'guvenlik', label: 'Güvenlik ve oturumlar', icon: 'shield' },
    { id: 'yardim', label: 'Yardım ve destek', icon: 'help' },
  ];
  function menuItems(u, current) {
    return SECTIONS.map(function (s) {
      var tag = s.id === 'bildirimler' && u ? '<span class="tag">' + (u.announce ? 'Açık' : '') + '</span>' : '';
      return '<a class="mi" role="menuitem" href="/hesabim/#' + s.id + '"' + (current === s.id ? ' aria-current="page"' : '') + ' data-sec="' + s.id + '">' + I[s.icon] + '<span>' + s.label + '</span>' + tag + '</a>';
    }).join('') + '<div class="mi-sep"><button class="mi out" type="button" data-logout>' + I.out + '<span>Çıkış yap</span></button></div>';
  }
  function logout() {
    return call('/v1/auth/logout', {}).then(function () { location.href = '/'; });
  }

  var uid = 0;
  function mount(slot, u) {
    var id = 'acct-pop-' + (++uid);
    if (u) {
      slot.innerHTML =
        '<button class="acct-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="' + id + '" aria-label="Hesabım: ' + esc(u.name) + '">' +
          '<span class="ava on" aria-hidden="true">' + esc(initials(u.name)) + '</span>' +
          '<span class="lbl"><small>Hesabım</small><b>' + esc(firstName(u.name)) + '</b></span>' + I.chev +
        '</button>' +
        '<div class="acct-pop" id="' + id + '" role="menu" aria-label="Hesabım" hidden>' +
          '<div class="acct-who"><span class="ava on lg" aria-hidden="true">' + esc(initials(u.name)) + '</span><div><b>' + esc(u.name) + '</b><span>' + esc(u.email) + '</span></div></div>' +
          menuItems(u, '') +
        '</div>';
    } else {
      slot.innerHTML =
        '<button class="acct-btn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="' + id + '">' +
          '<span class="ava" aria-hidden="true">' + I.user.replace('<svg ', '<svg width="18" height="18" ') + '</span>' +
          '<span class="lbl"><b>Giriş yap</b><small>veya üye ol</small></span>' +
        '</button>' +
        '<div class="acct-pop guest" id="' + id + '" role="dialog" aria-label="Giriş yap veya üye ol" hidden>' +
          '<p class="hi">Hoş geldin</p>' +
          '<p class="hi-sub">Hesabına gir ya da ücretsiz üye ol. Şifre yok, e-postana kod gelir.</p>' +
          '<div class="stack"><a class="btn primary" href="/uye/?giris">Giriş yap</a><a class="btn" href="/uye/">Üye ol</a></div>' +
          '<ul class="perk"><li>Yeni uygulamalardan ilk sen haberdar ol</li><li>Beta sürümlere erken erişim</li></ul>' +
        '</div>';
    }
    var btn = slot.querySelector('.acct-btn');
    var pop = slot.querySelector('.acct-pop');
    var timer = null;
    function open(on) {
      clearTimeout(timer);
      pop.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
    }
    btn.addEventListener('click', function () { open(pop.hidden); });
    // Fareyle üzerine gelince aç (Trendyol/Hepsiburada gibi); dokunmatik ekranda yalnızca dokunma.
    if (window.matchMedia && matchMedia('(hover: hover) and (min-width: 761px)').matches) {
      slot.addEventListener('mouseenter', function () { open(true); });
      slot.addEventListener('mouseleave', function () { timer = setTimeout(function () { open(false); }, 220); });
    }
    document.addEventListener('click', function (e) { if (!slot.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { open(false); btn.focus(); } });
    var lo = slot.querySelector('[data-logout]');
    if (lo) lo.addEventListener('click', logout);
    // Hesabım sayfasındayken menüden bir bölüme geçince menüyü kapat.
    pop.addEventListener('click', function (e) { if (e.target.closest('a')) open(false); });
  }

  // "Çıkınca haber ver" düğmeleri: üyeyse listeye ekler, değilse önce üyelik sayfasına götürür.
  function notifyButtons(u) {
    document.querySelectorAll('[data-notify-app]').forEach(function (b) {
      var app = b.getAttribute('data-notify-app');
      var on = !!(u && (u.notify || []).indexOf(app) >= 0);
      var paint = function () {
        b.setAttribute('aria-pressed', String(on));
        b.textContent = on ? '✓ Haber verilecek' : 'Çıkınca haber ver';
      };
      paint();
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (!u) { location.href = '/uye/?haber=' + encodeURIComponent(app); return; }
        var n = {}; n[app] = !on;
        b.disabled = true;
        call('/v1/me', { notify: n }).then(function (r) {
          b.disabled = false;
          if (r && r.ok) { u = r.user; on = !on; paint(); }
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var slots = document.querySelectorAll('[data-account-slot]');
    if (!slots.length && !document.querySelector('[data-notify-app]')) return;
    me().then(function (r) {
      var u = r && r.ok ? r.user : null;
      slots.forEach(function (s) { mount(s, u); });
      document.querySelectorAll('[data-guest]').forEach(function (el) { el.hidden = !!u; });
      document.querySelectorAll('[data-member]').forEach(function (el) { el.hidden = !u; });
      notifyButtons(u);
    });
  });
  return { call: call, msg: msg, me: me, esc: esc, initials: initials, firstName: firstName, icons: I, sections: SECTIONS, menuItems: menuItems, logout: logout };
})();
