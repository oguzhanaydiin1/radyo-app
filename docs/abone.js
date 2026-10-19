// OA Labs e-posta listesi formu: <form data-join> içindeki alanları sunucuya gönderir.
(function () {
  var API = 'https://api.oalabs.dev/v1/list/subscribe';
  var MSG = {
    ok: 'Neredeyse tamam! E-posta kutuna bir onay bağlantısı gönderdik. Gelmezse gereksiz (spam) klasörüne bak.',
    okLater: 'Kaydın alındı. Onay e-postası kısa süre içinde gelecek; bağlantıya tıklayınca listeye katılmış olursun.',
    eposta: 'Bu e-posta adresi geçerli görünmüyor.',
    onay: 'Devam etmek için onay kutusunu işaretle.',
    cok: 'Çok fazla deneme oldu, biraz sonra tekrar dene.',
    hata: 'Bir sorun çıktı, biraz sonra tekrar dene.',
  };
  document.querySelectorAll('form[data-join]').forEach(function (form) {
    var msg = form.querySelector('.join-msg');
    var btn = form.querySelector('button[type=submit]');
    function show(text, cls) { msg.textContent = text; msg.className = 'join-msg ' + (cls || ''); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      if (!form.email.checkValidity() || !email) { show(MSG.eposta, 'err'); form.email.focus(); return; }
      if (!form.consent.checked) { show(MSG.onay, 'err'); return; }
      btn.disabled = true;
      show('Gönderiliyor…');
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, consent: true, lang: 'tr', source: form.getAttribute('data-join') || 'site', website: form.website ? form.website.value : '' }),
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (j) {
          if (j && j.ok) { show(j.mail ? MSG.ok : MSG.okLater, 'ok'); form.reset(); }
          else show(MSG[j && j.error] || MSG.hata, 'err');
        })
        .catch(function () { show(MSG.hata, 'err'); })
        .then(function () { btn.disabled = false; });
    });
  });
})();
