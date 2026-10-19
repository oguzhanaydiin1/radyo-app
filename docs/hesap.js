// OA Labs üyelik: ortak yardımcılar ve menüdeki "Giriş yap / Hesabım" bağlantısı.
window.OA = (function () {
  var API = 'https://api.oalabs.dev';
  try { var dev = localStorage.getItem('apiBase'); if (dev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(dev)) API = dev; } catch (e) {}
  var ERR = {
    eposta: 'Bu e-posta adresi geçerli görünmüyor.',
    ad: 'Adını ve soyadını yaz.',
    onay: 'Üye olmak için aydınlatma metnini onaylaman gerekiyor.',
    'uye-yok': 'Bu e-postayla bir üyelik bulamadık. Üye olmak ister misin?',
    'uye-var': 'Bu e-postayla zaten üyesin. Giriş yapabilirsin.',
    bekle: 'Az önce bir kod gönderdik. Bir dakika sonra yeniden isteyebilirsin.',
    cok: 'Çok fazla deneme oldu, biraz sonra tekrar dene.',
    kod: 'Kod yanlış. E-postadaki 6 haneli kodu kontrol et.',
    sure: 'Kodun süresi doldu. Yeni bir kod iste.',
    deneme: 'Çok fazla yanlış deneme oldu. Yeni bir kod iste.',
    kapali: 'Üyelik çok yakında açılıyor. Biraz sonra tekrar dene.',
    gonderilemedi: 'E-posta gönderilemedi, biraz sonra tekrar dene.',
    giris: 'Oturumun kapanmış. Yeniden giriş yap.',
  };
  function call(path, body) {
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
  var meP = null;
  function me() { return meP || (meP = call('/v1/me')); }
  // Menüdeki bağlantı: girişliyse adını gösterir.
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('[data-account]');
    if (!links.length) return;
    me().then(function (r) {
      if (!r || !r.ok) return;
      document.querySelectorAll('[data-guest]').forEach(function (el) { el.hidden = true; });
      var first = String(r.user.name || '').split(' ')[0];
      links.forEach(function (a) { a.href = '/hesabim/'; a.textContent = first ? 'Hesabım · ' + first : 'Hesabım'; });
    });
  });
  return { call: call, msg: msg, me: me };
})();
