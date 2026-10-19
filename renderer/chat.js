'use strict';

/*
 * Canlı sohbet ve isimsiz kullanım sayımı (sunucu: api.oalabs.dev).
 *
 * Sohbet: her radyonun bir odası var. Panel yalnızca açıldığında sunucuya bağlanır;
 * kapalıyken hiçbir şey gönderilmez.
 * Sayım: yalnızca kullanıcı izin verdiyse; rastgele bir kurulum kimliği, sürüm, dil ve
 * istasyon başına dinleme dakikası gönderilir. Kişiyi tanımlayan bilgi yoktur.
 */

const API = (() => {
  try {
    const v = JSON.parse(localStorage.getItem('apiBase') || 'null');
    if (typeof v === 'string' && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v)) return v; // yalnızca geliştirme
  } catch { /* yok */ }
  return 'https://api.oalabs.dev';
})();
const WS_BASE = API.replace(/^http/, 'ws');

const CI = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
};

// =====================================================================
// Sohbet
// =====================================================================

const chat = {
  open: false,
  room: '',
  station: null,
  ws: null,
  online: 0,
  messages: [],
  status: 'idle', // idle | connecting | open | closed
  retry: 0,
  retryTimer: null,
  pingTimer: null,
  error: '',
};

async function roomFor(s) {
  if (!s) return '';
  if (/^[0-9a-f-]{8,64}$/i.test(s.id)) return s.id;
  // Kendi eklenen istasyonlar: aynı yayın adresini ekleyenler aynı odada buluşsun.
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s.url || s.id)));
  return `u-${[...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const chatBtn = document.createElement('button');
chatBtn.className = 'icon-btn';
chatBtn.id = 'btn-chat';
chatBtn.type = 'button';
chatBtn.title = 'Bu radyoyu dinleyenlerle sohbet et';
chatBtn.setAttribute('aria-label', 'Sohbet');
chatBtn.innerHTML = CI.chat;
$('#btn-eq').before(chatBtn);

const drawer = document.createElement('aside');
drawer.className = 'chat-drawer';
drawer.hidden = true;
drawer.setAttribute('aria-label', 'Canlı sohbet');
drawer.innerHTML = `
  <div class="chat-head">
    <div class="chat-title"><strong id="chat-station" data-noi18n></strong><span id="chat-online"></span></div>
    <button class="icon-btn" type="button" id="chat-close" aria-label="Sohbeti kapat" title="Kapat">${CI.close}</button>
  </div>
  <div class="chat-list" id="chat-list" role="log" aria-live="polite"></div>
  <p class="chat-error" id="chat-error" hidden></p>
  <form class="chat-form" id="chat-form" autocomplete="off">
    <div class="chat-nick" id="chat-nick-row">
      <label for="chat-nick">Takma adın</label>
      <input id="chat-nick" maxlength="20" placeholder="Örn. Gece Kuşu" spellcheck="false">
    </div>
    <div class="chat-input">
      <input id="chat-text" maxlength="300" placeholder="Bir şey yaz…" aria-label="Mesaj">
      <button class="chat-send" type="submit" aria-label="Gönder" title="Gönder">${CI.send}</button>
    </div>
    <p class="chat-rules">Saygılı ol. Bağlantı paylaşılamaz; kaba sözler yıldızlanır. Takma adın ve mesajların bu odadaki herkese görünür.</p>
  </form>`;
document.body.appendChild(drawer);

const nickInput = $('#chat-nick', drawer);
nickInput.value = store.get('chatNick', '') || '';
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

function renderChat() {
  chatBtn.classList.toggle('active', chat.open);
  drawer.hidden = !chat.open;
  document.body.classList.toggle('chat-open', chat.open);
  if (!chat.open) return;
  $('#chat-station', drawer).textContent = chat.station ? chat.station.name : '';
  const onlineText = chat.status === 'open'
    ? (chat.online > 1 ? `${chat.online} kişi burada` : 'Şu an yalnızsın')
    : chat.status === 'connecting' ? 'Bağlanıyor…' : chat.station ? 'Bağlantı yok' : '';
  $('#chat-online', drawer).textContent = onlineText;
  const list = $('#chat-list', drawer);
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  if (!chat.station) {
    list.innerHTML = '<p class="chat-empty">Sohbet etmek için bir radyo aç.</p>';
  } else if (!chat.messages.length) {
    list.innerHTML = '<p class="chat-empty">Henüz mesaj yok. İlk merhabayı sen de.</p>';
  } else {
    const mine = (nickInput.value || '').trim();
    list.innerHTML = chat.messages.map((m) => `<div class="chat-msg${mine && m.nick === mine ? ' mine' : ''}" data-id="${m.id}">
      <div class="chat-meta"><span class="chat-nickname" data-noi18n>${esc(m.nick)}</span><time>${esc(fmtTime(m.ts))}</time>
        <button class="chat-report" type="button" data-action="chat-report" data-id="${m.id}" title="Bu mesajı bildir" aria-label="Bu mesajı bildir">${CI.flag}</button></div>
      <div class="chat-text" data-noi18n>${esc(m.text)}</div></div>`).join('');
  }
  if (atBottom || chat.justLoaded) { list.scrollTop = list.scrollHeight; chat.justLoaded = false; }
  const err = $('#chat-error', drawer);
  err.hidden = !chat.error;
  err.textContent = chat.error;
  $('#chat-nick-row', drawer).hidden = !!store.get('chatNick', '');
  $('#chat-text', drawer).disabled = !chat.station;
}

function disconnect() {
  clearTimeout(chat.retryTimer);
  clearInterval(chat.pingTimer);
  if (chat.ws) {
    chat.ws.onclose = null;
    try { chat.ws.close(); } catch { /* yok */ }
  }
  chat.ws = null;
  chat.status = 'idle';
}

async function connect() {
  disconnect();
  chat.station = state.current;
  chat.messages = [];
  chat.online = 0;
  chat.error = '';
  if (!chat.open || !chat.station) { renderChat(); return; }
  const room = await roomFor(chat.station);
  if (!chat.open || state.current !== chat.station) return;
  chat.room = room;
  chat.status = 'connecting';
  renderChat();
  let ws;
  try {
    ws = new WebSocket(`${WS_BASE}/v1/chat/${encodeURIComponent(room)}`);
  } catch {
    chat.status = 'closed';
    renderChat();
    return;
  }
  chat.ws = ws;
  ws.onopen = () => {
    chat.status = 'open';
    chat.retry = 0;
    chat.pingTimer = setInterval(() => { try { ws.send('ping'); } catch { /* yok */ } }, 30000);
    renderChat();
  };
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'hello') {
      chat.messages = Array.isArray(m.history) ? m.history : [];
      chat.online = m.online || 1;
      chat.justLoaded = true;
    } else if (m.t === 'online') {
      chat.online = m.online;
    } else if (m.t === 'msg') {
      chat.messages = [...chat.messages, m].slice(-150);
      chat.error = '';
    } else if (m.t === 'del') {
      chat.messages = chat.messages.filter((x) => x.id !== m.id);
    } else if (m.t === 'error') {
      chat.error = String(m.text || '');
    }
    renderChat();
  };
  ws.onclose = () => {
    clearInterval(chat.pingTimer);
    chat.status = 'closed';
    renderChat();
    if (!chat.open) return;
    const delay = [1000, 3000, 6000, 15000, 30000][Math.min(chat.retry, 4)];
    chat.retry += 1;
    chat.retryTimer = setTimeout(() => { if (chat.open && state.current === chat.station) connect(); }, delay);
  };
}

function toggleChat(open = !chat.open) {
  chat.open = open;
  if (open) {
    if (typeof closePop === 'function') closePop();
    connect();
  } else {
    disconnect();
    renderChat();
  }
}

chatBtn.addEventListener('click', () => toggleChat());
$('#chat-close', drawer).addEventListener('click', () => toggleChat(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chat.open && !document.querySelector('dialog[open]')) toggleChat(false); });

$('#chat-form', drawer).addEventListener('submit', (e) => {
  e.preventDefault();
  const textEl = $('#chat-text', drawer);
  const text = textEl.value.trim();
  if (!text) return;
  let nick = (store.get('chatNick', '') || nickInput.value || '').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u.test(nick)) {
    chat.error = 'Önce 2–20 harflik bir takma ad yaz.';
    $('#chat-nick-row', drawer).hidden = false;
    renderChat();
    nickInput.focus();
    return;
  }
  if (!store.get('chatNick', '')) store.set('chatNick', nick);
  if (!chat.ws || chat.ws.readyState !== 1) {
    chat.error = 'Bağlantı yok, birkaç saniye sonra tekrar dene.';
    renderChat();
    return;
  }
  chat.ws.send(JSON.stringify({ t: 'msg', nick, text }));
  textEl.value = '';
});

// İstasyon değişince açık sohbet yeni radyonun odasına geçer.
chain('stationChanged', (prev, s) => {
  if (chat.open && (!chat.station || chat.station.id !== s.id)) connect();
  return prev(s);
});

// Takma adı değiştirmek: Ayarlar → Gizlilik ve sohbet.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action="chat-report"]');
  if (!el) return;
  const m = chat.messages.find((x) => String(x.id) === el.dataset.id);
  if (!m || !chat.station) return;
  const body = `Bildirilen mesaj\nRadyo: ${chat.station.name}\nOda: ${chat.room}\nMesaj no: ${m.id}\nTakma ad: ${m.nick}\nMesaj: ${m.text}\nZaman: ${new Date(m.ts).toISOString()}\n`;
  AS.openExternal(`mailto:${APP_INFO.email}?subject=${encodeURIComponent('Sohbet bildirimi')}&body=${encodeURIComponent(body)}`);
});

renderChat();

// =====================================================================
// İsimsiz kullanım sayımı (izinle)
// =====================================================================

let installId = store.get('installId', null);
if (!installId) {
  installId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-aaaa-bbbb-cccc`;
  store.set('installId', installId);
}
const consent = () => store.get('statsConsent', null); // true | false | null (sorulmadı)
let pending = store.get('statsPending', null) || {}; // istasyon -> { n, sec }
let chatAppVersion = '';
AS.get().then((s) => { chatAppVersion = s.version || ''; }).catch(() => {});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(60, Math.round((now - lastTick) / 1000));
  lastTick = now;
  if (consent() !== true || !state.current || !state.playing || dt <= 0) return;
  const s = state.current;
  const own = isCustom(s) || !/^[0-9a-f-]{8,64}$/i.test(s.id);
  const key = own ? 'kendi-eklenen' : s.id;
  const p = pending[key] || (pending[key] = { n: own ? '' : s.name, sec: 0 });
  p.sec += dt;
  store.set('statsPending', pending);
}, 15000);

async function sendPing(force) {
  if (consent() !== true) return;
  const day = new Date().toISOString().slice(0, 10);
  const listens = Object.entries(pending)
    .map(([s, v]) => ({ s, n: v.n, m: Math.floor(v.sec / 60) }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m)
    .slice(0, 10);
  if (!listens.length && !force && store.get('statsDay', '') === day) return;
  try {
    const r = await fetch(`${API}/v1/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'radyo', v: chatAppVersion, id: installId, lang: (typeof LANG === 'string' && LANG) || 'tr', listens }),
    });
    if (!r.ok) return;
    for (const l of listens) {
      const p = pending[l.s];
      if (p) { p.sec -= l.m * 60; if (p.sec < 60) delete pending[l.s]; }
    }
    store.set('statsPending', pending);
    store.set('statsDay', day);
  } catch { /* çevrimdışı: sonra tekrar */ }
}
setTimeout(() => sendPing(false), 20000);
setInterval(() => sendPing(false), 15 * 60 * 1000);

// İzin kartı: yalnızca bir kez, açılıştan biraz sonra.
function askConsent() {
  if (consent() !== null || document.getElementById('consent-card')) return;
  const card = document.createElement('div');
  card.className = 'consent-card';
  card.id = 'consent-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'İsimsiz kullanım istatistiği');
  card.innerHTML = `<p><strong>OA Radyo’yu geliştirmemize yardım eder misin?</strong>
    Kaç kişinin kullandığını ve toplam ne kadar dinlendiğini isimsiz olarak sayarız. Seni tanımlayan bir bilgi gönderilmez; istediğin zaman Ayarlar’dan kapatabilirsin.
    <a href="#" data-action="privacy-open">Gizlilik politikası</a></p>
    <div class="consent-actions"><button class="btn-ghost" type="button" data-consent="no">Hayır</button><button class="pill" type="button" data-consent="yes">Paylaş</button></div>`;
  document.body.appendChild(card);
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-consent]');
    if (!b) return;
    setConsent(b.dataset.consent === 'yes');
    card.remove();
  });
}
function setConsent(on) {
  store.set('statsConsent', !!on);
  const sw = document.getElementById('set-stats');
  if (sw) sw.checked = !!on;
  if (on) sendPing(true);
  else { pending = {}; store.set('statsPending', pending); }
}
setTimeout(askConsent, 8000);

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="privacy-open"]')) {
    e.preventDefault();
    AS.openExternal(APP_INFO.privacy || 'https://oalabs.dev/gizlilik/');
  }
});

// Ayarlar: "Gizlilik ve sohbet" bölümü.
(function settingsSection() {
  const form = $('#settings-form');
  const groups = form.querySelectorAll('.set-group');
  const sec = document.createElement('section');
  sec.className = 'set-group';
  sec.innerHTML = `<h3>Gizlilik ve sohbet</h3>
    <label class="switch-row">
      <span><strong>İsimsiz kullanım istatistiği paylaş</strong><em>Kaç kişinin kullandığı ve toplam dinleme süresi sayılır; seni tanımlayan bilgi gönderilmez. <a href="#" data-action="privacy-open">Gizlilik politikası</a></em></span>
      <input type="checkbox" class="switch" id="set-stats">
    </label>
    <div class="sync-row">
      <span class="sync-path">Sohbet takma adı: <strong id="set-nick-val" data-noi18n></strong></span>
      <button class="btn-ghost" type="button" id="set-nick-reset">Değiştir</button>
    </div>`;
  form.insertBefore(sec, groups[2] || null);
  const sw = $('#set-stats', sec);
  sw.checked = consent() === true;
  sw.addEventListener('change', () => setConsent(sw.checked));
  const showNick = () => { $('#set-nick-val', sec).textContent = store.get('chatNick', '') || '—'; };
  showNick();
  $('#set-nick-reset', sec).addEventListener('click', () => {
    store.set('chatNick', '');
    nickInput.value = '';
    showNick();
    toast('Sohbette bir sonraki mesajında yeni takma adını yazabilirsin.', { ms: 3500 });
    renderChat();
  });
  $('#settings-dialog').addEventListener('close', showNick);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="settings-open"]')) setTimeout(() => { showNick(); sw.checked = consent() === true; }, 0); });
}());
