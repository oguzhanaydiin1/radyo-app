'use strict';

/*
 * Medya oynatıcı: podcast bölümleri ve yerel müzik, radyoyla aynı ses öğesini ve alt
 * çubuğu kullanır. Bir parça ya da bölüm çalarken "medya modu" açıktır: alt çubukta
 * ilerleme çubuğu, karıştır/tekrar (müzik) ya da hız ve 15/30 sn atlama (podcast)
 * görünür. Bir radyo seçilince medya modu kapanır.
 *
 * Bu dosya app.js, features.js ve extras.js'ten sonra yüklenir; onların genel
 * değişkenlerini (state, store, audio, hooks, chain, $, esc, toast…) kullanır.
 * Kütüphane window.library köprüsünden gelir: masaüstünde ana süreç (src/library.js),
 * web ve Android'de media-web.js aynı arayüzü sağlar.
 */

const LIB = window.library || null;

const MI = {
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/><path d="M11 10h1v4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="DM Sans, sans-serif">15</text></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="DM Sans, sans-serif">30</text></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  disc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round" opacity=".5"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8"/><path d="M19 14v6M16 17h6"/></svg>',
  listAdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M18 13v8M14 17h8"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
};

function mediaTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
const mediaInitials = (t) => initials(String(t || '?'));

// ---------- Medya durumu ----------

const M = {
  active: false,
  item: null,
  queue: [],
  index: -1,
  order: [],
  shuffle: !!store.get('mShuffle', false),
  repeat: ['off', 'all', 'one'].includes(store.get('mRepeat', 'off')) ? store.get('mRepeat', 'off') : 'off',
  rate: Number(store.get('podRate', 1)) || 1,
  errors: 0,
  seeking: false,
  lyrics: null,     // { id, loading, lines, synced, source, text, none, off, instrumental, error }
  npTab: 'lyrics',
  listeners: { time: [], ended: [], change: [] },
};
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];

function emit(name, ...args) {
  for (const fn of M.listeners[name] || []) {
    try { fn(...args); } catch { /* dinleyici hatası oynatıcıyı durdurmasın */ }
  }
}

function buildOrder() {
  const n = M.queue.length;
  const idx = [...Array(n).keys()];
  if (M.shuffle && n > 1) {
    const rest = idx.filter((i) => i !== M.index);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    M.order = M.index >= 0 ? [M.index, ...rest] : rest;
  } else {
    M.order = idx;
  }
}

function duration() {
  const d = audio.duration;
  return Number.isFinite(d) && d > 0 ? d : (M.item && M.item.duration) || 0;
}

/** Radyo çalıyorsa onu sustur (app.js'teki çalma durumunu sıfırla). */
function quietRadio() {
  if (!state.current) return;
  clearTimeout(retryTimer);
  state.reconnecting = false;
  state.waitOnline = false;
  state.wantPlay = false;
  state.playError = null;
  hook('paused');
  state.current = null;
}

async function playItem(item, opts = {}) {
  if (!item || !item.url) return;
  if (Array.isArray(opts.queue)) {
    M.queue = opts.queue;
    M.index = Number.isInteger(opts.index) ? opts.index : Math.max(0, opts.queue.indexOf(item));
    buildOrder();
  } else if (!M.queue.length || M.queue[M.index] !== item) {
    const at = M.queue.indexOf(item);
    if (at >= 0) M.index = at;
    else { M.queue = [item]; M.index = 0; buildOrder(); }
  }
  quietRadio();
  stopStream();
  const prev = M.item;
  if (prev && prev !== item) emit('time', prev, audio.currentTime || 0, duration(), true);
  M.active = true;
  M.item = item;
  M.lyrics = null;
  state.playing = false;
  state.buffering = true;
  state.playError = null;
  const rate = item.kind === 'episode' ? M.rate : 1;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.src = item.url;
  const resume = Number(opts.resumeAt ?? item.resume) || 0;
  if (resume > 5) {
    audio.addEventListener('loadedmetadata', function seekOnce() {
      audio.removeEventListener('loadedmetadata', seekOnce);
      const d = duration();
      if (!d || resume < d - 10) audio.currentTime = resume;
    });
  }
  setMediaMeta(item);
  emit('change', item);
  syncPlaying();
  if (state.section === 'nowplaying') renderContent();
  refreshTrackRows();
  try {
    await audio.play();
  } catch (err) {
    if (err && err.name !== 'AbortError' && M.item === item) onMediaError();
  }
  if (item.kind === 'track') loadLyrics(item);
}

function deactivate() {
  if (!M.active) return;
  if (M.item) emit('time', M.item, audio.currentTime || 0, duration(), true);
  M.active = false;
  audio.defaultPlaybackRate = 1;
  audio.playbackRate = 1;
  showMediaControls(false);
  refreshTrackRows();
  if (state.section === 'nowplaying') selectSection('discover');
}

function nextIndex(delta, auto) {
  const n = M.queue.length;
  if (!n) return -1;
  if (auto && M.repeat === 'one') return M.index;
  if (M.order.length !== n) buildOrder();
  let pos = M.order.indexOf(M.index) + delta;
  if (pos >= n) {
    if (auto && M.repeat === 'off') return -1;
    pos = 0;
  }
  if (pos < 0) pos = n - 1;
  return M.order[pos];
}

function go(delta, auto = false) {
  if (!M.item) return;
  if (M.item.kind === 'episode') {
    if (auto) return; // bölüm bitti: kendiliğinden başka bölüme geçme
    seekBy(delta > 0 ? 30 : -15);
    return;
  }
  if (delta < 0 && audio.currentTime > 4) {
    audio.currentTime = 0;
    return;
  }
  const i = nextIndex(delta, auto);
  if (i < 0) {
    audio.pause();
    audio.currentTime = 0;
    return;
  }
  M.index = i;
  playItem(M.queue[i]);
}

function seekBy(sec) {
  const d = duration();
  const t = clamp((audio.currentTime || 0) + sec, 0, d ? d - 0.5 : Infinity);
  audio.currentTime = t;
  renderSeek();
}

function onMediaError() {
  if (!M.active) return;
  state.buffering = false;
  state.playing = false;
  M.errors += 1;
  const it = M.item;
  toast(it && it.kind === 'episode' ? 'Bu bölüm açılamadı. Podcast sunucusu yanıt vermiyor olabilir.' : `Bu dosya çalınamadı: ${it ? it.title : ''}`, { error: true });
  syncPlaying();
  if (it && it.kind === 'track' && M.queue.length > 1 && M.errors < 3) setTimeout(() => { if (M.item === it) go(1, true); }, 1200);
}

function setMediaMeta(item) {
  if (!('mediaSession' in navigator)) return;
  const art = item.art && /^(https:|data:image)/.test(item.art) ? [{ src: item.art, sizes: '512x512' }] : [];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || '',
      artist: item.artist || '',
      album: item.album || (item.kind === 'episode' ? 'Podcast' : 'OA Radyo'),
      artwork: art,
    });
  } catch { /* desteklenmiyor */ }
}

if ('mediaSession' in navigator) {
  const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch { /* yok */ } };
  set('seekbackward', (d) => { if (M.active) seekBy(-((d && d.seekOffset) || 15)); });
  set('seekforward', (d) => { if (M.active) seekBy((d && d.seekOffset) || 30); });
  set('seekto', (d) => { if (M.active && d && Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
}

// ---------- app.js bağlantıları ----------

hooks.stationPlay = () => deactivate();
hooks.mediaToggle = () => {
  if (!M.active) return false;
  if (audio.paused) {
    state.buffering = true;
    renderPlayer();
    audio.play().catch((err) => { if (err && err.name !== 'AbortError') onMediaError(); });
  } else {
    audio.pause();
    if (M.item) emit('time', M.item, audio.currentTime || 0, duration(), true);
  }
  return true;
};
hooks.mediaStep = (delta) => {
  if (!M.active) return false;
  go(delta);
  return true;
};

let footKey = '';
hooks.playerNow = () => {
  showMediaControls(M.active);
  if (!M.active || !M.item) {
    footKey = '';
    return false;
  }
  const it = M.item;
  const key = `${it.id}|${it.art ? it.art.length : 0}`;
  if (footKey !== key) {
    footKey = key;
    $('#p-logo').innerHTML = it.art
      ? `<img class="m-art" src="${esc(it.art)}" alt="" width="48" height="48">`
      : `<span class="m-tile" style="background:${tintFor(it.id)}">${esc(mediaInitials(it.title))}</span>`;
  }
  $('#p-name').textContent = it.title || '';
  const sub = $('#p-sub');
  sub.classList.toggle('error', false);
  sub.textContent = state.buffering && !state.playing ? 'Yükleniyor…' : [it.artist, it.album].filter(Boolean).join(' · ');
  sub.title = sub.textContent;
  const play = $('#btn-play');
  const loading = state.buffering && !state.playing;
  play.classList.toggle('buffering', loading);
  play.innerHTML = loading ? '<span class="spinner"></span>' : state.playing ? ICON.pause : ICON.play;
  play.setAttribute('aria-label', state.playing ? 'Duraklat' : 'Çal');
  play.title = state.playing ? 'Duraklat (Boşluk)' : 'Çal (Boşluk)';
  renderSeek();
  syncDeck();
  return true;
};

function showMediaControls(on) {
  const ep = on && M.item && M.item.kind === 'episode';
  const tr = on && M.item && M.item.kind === 'track';
  $('#seek').hidden = !on;
  $('.player').classList.toggle('has-seek', !!on);
  $('.player-now').classList.toggle('openable', !!on);
  $('#btn-shuffle').hidden = !tr;
  $('#btn-repeat').hidden = !tr;
  $('#btn-back').hidden = !ep;
  $('#btn-fwd').hidden = !ep;
  $('#btn-speed').hidden = !ep;
  if (tr) {
    const sh = $('#btn-shuffle');
    sh.classList.toggle('active', M.shuffle);
    sh.setAttribute('aria-pressed', String(M.shuffle));
    const rp = $('#btn-repeat');
    rp.innerHTML = M.repeat === 'one' ? MI.repeatOne : MI.repeat;
    rp.classList.toggle('active', M.repeat !== 'off');
    const rl = M.repeat === 'one' ? 'Tekrar: bu parça' : M.repeat === 'all' ? 'Tekrar: tüm liste' : 'Tekrar kapalı';
    rp.setAttribute('aria-label', rl);
    rp.title = rl;
  }
  if (ep) $('#btn-speed').textContent = `${String(M.rate).replace('.', ',')}×`;
  const prev = $('#btn-prev');
  const next = $('#btn-next');
  const pl = ep ? 'Önceki' : tr ? 'Önceki parça' : 'Önceki istasyon';
  const nl = ep ? 'Sonraki' : tr ? 'Sonraki parça' : 'Sonraki istasyon';
  prev.hidden = !!ep;
  next.hidden = !!ep;
  prev.setAttribute('aria-label', pl); prev.title = pl;
  next.setAttribute('aria-label', nl); next.title = nl;
}

function renderSeek() {
  if (!M.active) return;
  const d = duration();
  const t = audio.currentTime || 0;
  $('#seek-cur').textContent = mediaTime(t);
  $('#seek-dur').textContent = d ? mediaTime(d) : '—';
  const r = $('#seek-range');
  if (!M.seeking) {
    const v = d ? Math.round((t / d) * 1000) : 0;
    r.value = String(v);
    r.style.setProperty('--fill', `${v / 10}%`);
  }
  r.disabled = !d;
  if ('mediaSession' in navigator && d && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(t, d), playbackRate: audio.playbackRate || 1 }); } catch { /* yok */ }
  }
}

$('#seek-range').addEventListener('input', (e) => {
  M.seeking = true;
  const d = duration();
  const v = Number(e.target.value);
  e.target.style.setProperty('--fill', `${v / 10}%`);
  $('#seek-cur').textContent = mediaTime((d * v) / 1000);
});
$('#seek-range').addEventListener('change', (e) => {
  const d = duration();
  if (d) audio.currentTime = (d * Number(e.target.value)) / 1000;
  M.seeking = false;
  renderSeek();
});
$('#btn-back').addEventListener('click', () => seekBy(-15));
$('#btn-fwd').addEventListener('click', () => seekBy(30));
$('#btn-speed').addEventListener('click', () => {
  const i = RATES.indexOf(M.rate);
  M.rate = RATES[(i + 1) % RATES.length];
  store.set('podRate', M.rate);
  if (M.active && M.item && M.item.kind === 'episode') { audio.playbackRate = M.rate; audio.defaultPlaybackRate = M.rate; }
  showMediaControls(M.active);
  toast(`Oynatma hızı: ${String(M.rate).replace('.', ',')}×`, { ms: 1500 });
});
$('#btn-shuffle').addEventListener('click', () => {
  M.shuffle = !M.shuffle;
  store.set('mShuffle', M.shuffle);
  buildOrder();
  showMediaControls(M.active);
  if (state.section === 'nowplaying' && M.npTab === 'queue') renderNpPanel();
});
$('#btn-repeat').addEventListener('click', () => {
  M.repeat = M.repeat === 'off' ? 'all' : M.repeat === 'all' ? 'one' : 'off';
  store.set('mRepeat', M.repeat);
  showMediaControls(M.active);
});
$('.player-now').addEventListener('click', () => {
  if (M.active) selectSection(state.section === 'nowplaying' ? (M.item && M.item.kind === 'episode' ? 'podcast' : 'music') : 'nowplaying');
});

let lastTimeEmit = 0;
audio.addEventListener('timeupdate', () => {
  if (!M.active) return;
  renderSeek();
  updateLyricLine();
  if (Date.now() - lastTimeEmit > 5000) {
    lastTimeEmit = Date.now();
    emit('time', M.item, audio.currentTime || 0, duration(), false);
  }
});
audio.addEventListener('playing', () => {
  if (!M.active) return;
  M.errors = 0;
  syncDeck();
});
audio.addEventListener('pause', () => { if (M.active) syncDeck(); });
audio.addEventListener('waiting', () => {
  if (!M.active) return;
  state.buffering = true;
  renderPlayer();
});
audio.addEventListener('loadedmetadata', () => { if (M.active) renderSeek(); });
audio.addEventListener('ended', () => {
  if (!M.active || !M.item) return;
  emit('ended', M.item);
  go(1, true);
});
audio.addEventListener('error', () => {
  if (M.active && audio.getAttribute('src')) onMediaError();
});
// Düzen dışı durumlarda (örneğin radyo kapanırken) medya modunu kapatma: radyo play() çağrısı
// hooks.stationPlay ile haber verir.

// ---------- Şarkı sözleri ----------

function parseLrc(text) {
  const out = [];
  let offset = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const off = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);
    if (off) { offset = Number(off[1]) / 1000; continue; }
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) {
      const frac = s[3] ? Number(s[3]) / (s[3].length === 3 ? 1000 : 100) : 0;
      out.push({ t: Math.max(0, Number(s[1]) * 60 + Number(s[2]) + frac - offset), text: words });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

async function loadLyrics(item) {
  if (!LIB || !item || item.kind !== 'track') return;
  M.lyrics = { id: item.id, loading: true };
  renderNpPanelIf('lyrics');
  let r = null;
  try {
    r = await LIB.lyrics(item.id);
    if (!r && typeof LIB.online === 'function') {
      const q = { artist: item.artist, title: item.title, album: item.album, duration: Math.round(item.duration || duration()) };
      r = await LIB.online(q);
    }
  } catch { r = { error: true }; }
  if (!M.item || M.item.id !== item.id) return;
  if (r && r.text) {
    const lines = r.synced ? parseLrc(r.text) : [];
    M.lyrics = { id: item.id, synced: r.synced && lines.length > 0, lines, text: r.text, source: r.source };
  } else {
    M.lyrics = { id: item.id, none: true, off: !!(r && r.off), error: !!(r && r.error), instrumental: !!(r && r.instrumental) };
  }
  renderNpPanelIf('lyrics');
}

const LYR_SOURCE = { lrc: '.lrc dosyası', txt: '.txt dosyası', tag: 'Dosyanın etiketi', lrclib: 'LRCLIB (lrclib.net)', web: 'Dosyanın etiketi' };

function lyricsHTML() {
  const L = M.lyrics;
  if (!M.item || M.item.kind !== 'track') return '';
  if (!L || L.loading) return '<div class="np-empty"><span class="spinner"></span><span>Sözler aranıyor…</span></div>';
  if (L.none) {
    const why = L.instrumental ? 'Bu parça enstrümantal.'
      : L.off ? 'İnternetten söz arama Ayarlar’da kapalı. Parçanın yanına aynı adlı bir .lrc dosyası koyarsan sözler burada görünür.'
        : L.error ? 'Sözler internetten alınamadı. Bağlantını kontrol et.'
          : 'Bu şarkının sözleri bulunamadı. Parçanın yanına aynı adlı bir .lrc dosyası koyarsan sözler burada görünür.';
    return `<div class="np-empty">${MI.note}<span>${esc(why)}</span></div>`;
  }
  const src = `<p class="np-src">Kaynak: ${esc(LYR_SOURCE[L.source] || L.source || '')}</p>`;
  if (L.synced) {
    return `<div class="np-lyrics synced" data-noi18n>${L.lines.map((l, i) => `<button type="button" class="ly" data-action="np-seek" data-t="${l.t.toFixed(2)}" data-i="${i}">${esc(l.text) || '♪'}</button>`).join('')}</div>${src}`;
  }
  return `<div class="np-lyrics plain" data-noi18n>${esc(L.text)}</div>${src}`;
}

let lyIndex = -1;
let userScrollAt = 0;
function updateLyricLine() {
  const L = M.lyrics;
  if (state.section !== 'nowplaying' || M.npTab !== 'lyrics' || !L || !L.synced) return;
  const t = (audio.currentTime || 0) + 0.25;
  let i = -1;
  for (let k = 0; k < L.lines.length; k++) { if (L.lines[k].t <= t) i = k; else break; }
  if (i === lyIndex) return;
  lyIndex = i;
  const panel = $('#np-panel');
  if (!panel) return;
  for (const el of panel.querySelectorAll('.ly.on')) el.classList.remove('on');
  const cur = i >= 0 ? panel.querySelector(`.ly[data-i="${i}"]`) : null;
  if (cur) {
    cur.classList.add('on');
    if (Date.now() - userScrollAt > 3000) {
      panel.scrollTo({ top: cur.offsetTop - panel.clientHeight / 2 + cur.clientHeight / 2, behavior: 'smooth' });
    }
  }
}

// ---------- Şimdi çalıyor (dönen plak) ----------

function deckHTML(it) {
  const label = it.art
    ? `<img class="np-cover" src="${esc(it.art)}" alt="">`
    : `<span class="np-initials" style="background:${tintFor(it.id)}">${esc(mediaInitials(it.title))}</span>`;
  return `<div class="np-deck${state.playing ? ' spin' : ''}" id="np-deck" aria-hidden="true">
      <div class="np-platter"></div>
      <div class="np-disc"><div class="np-label">${label}</div><span class="np-hole"></span></div>
      <div class="np-sheen"></div>
      <div class="np-arm"><span class="np-pivot"></span><span class="np-bar"><span class="np-head"></span></span></div>
    </div>`;
}

function syncDeck() {
  const deck = $('#np-deck');
  if (deck) deck.classList.toggle('spin', M.active && state.playing);
  const eq = $('#np-eq');
  if (eq) eq.classList.toggle('on', M.active && state.playing);
}

function npTabs(it) {
  const tabs = it.kind === 'episode'
    ? [['notes', 'Bölüm notları'], ['info', 'Bilgi']]
    : [['lyrics', 'Sözler'], ['queue', 'Sıradaki'], ['info', 'Bilgi']];
  if (!tabs.some(([k]) => k === M.npTab)) M.npTab = tabs[0][0];
  return `<div class="np-tabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" role="tab" class="np-tab${M.npTab === k ? ' active' : ''}" aria-selected="${M.npTab === k}" data-action="np-tab" data-tab="${k}">${label}</button>`).join('')}</div>`;
}

function queueHTML() {
  if (!M.queue.length) return '<div class="np-empty"><span>Sıra boş.</span></div>';
  if (M.order.length !== M.queue.length) buildOrder();
  const pos = M.order.indexOf(M.index);
  const rows = M.order.slice(pos, pos + 200).map((qi, k) => {
    const q = M.queue[qi];
    const cur = qi === M.index;
    return `<div class="q-row${cur ? ' current' : ''}">
      <button type="button" class="q-main" data-action="np-jump" data-qi="${qi}">
        <span class="q-n">${cur ? ICON.eq : k}</span>
        <span class="q-text" data-noi18n><span class="q-t">${esc(q.title)}</span><span class="q-s">${esc(q.artist || '')}</span></span>
        <span class="q-d">${q.duration ? mediaTime(q.duration) : ''}</span>
      </button>
      ${cur ? '' : `<button type="button" class="icon-btn tiny" data-action="np-unqueue" data-qi="${qi}" aria-label="Sıradan çıkar" title="Sıradan çıkar">${MI.x}</button>`}
    </div>`;
  }).join('');
  const more = M.queue.length - pos > 200 ? `<p class="np-src">ve ${fmtCount(M.queue.length - pos - 200)} parça daha</p>` : '';
  const head = `<div class="q-head"><span>${M.shuffle ? 'Karışık sıra' : 'Sıra'} · ${fmtCount(M.queue.length)} parça</span></div>`;
  return head + rows + more;
}

function infoHTML() {
  const it = M.item;
  const row = (k, v) => (v ? `<div class="info-row"><span>${k}</span><span data-noi18n>${esc(String(v))}</span></div>` : '');
  if (it.kind === 'episode') {
    const e = it.meta || {};
    return `<div class="np-info">${row('Podcast', it.artist)}${row('Yayın tarihi', e.date ? new Date(e.date).toLocaleDateString('tr-TR', { dateStyle: 'long' }) : '')}${row('Süre', duration() ? mediaTime(duration()) : '')}
      ${e.link && /^https:\/\//i.test(e.link) ? `<button class="btn-ghost" type="button" data-action="open-link" data-url="${esc(e.link)}">${ICON.globe}<span>Bölüm sayfasını aç</span></button>` : ''}</div>`;
  }
  const t = it.meta || {};
  return `<div class="np-info">${row('Albüm', it.album)}${row('Sanatçı', it.artist)}${row('Yıl', t.year || '')}${row('Tür', t.genre)}${row('Süre', duration() ? mediaTime(duration()) : '')}${row('Biçim', t.format)}${row('Klasör', t.dir)}${row('Dosya', t.file)}
    ${LIB && LIB.desktop ? `<button class="btn-ghost" type="button" data-action="mus-reveal" data-id="${esc(it.id)}">${MI.folder}<span>Klasörde göster</span></button>` : ''}</div>`;
}

function notesHTML() {
  const e = (M.item && M.item.meta) || {};
  return e.notes ? `<div class="np-notes" data-noi18n>${esc(e.notes)}</div>` : '<div class="np-empty"><span>Bu bölüm için açıklama yok.</span></div>';
}

function npPanelHTML() {
  if (M.npTab === 'queue') return queueHTML();
  if (M.npTab === 'info') return infoHTML();
  if (M.npTab === 'notes') return notesHTML();
  return lyricsHTML();
}

function renderNpPanel() {
  const panel = $('#np-panel');
  if (!panel) return;
  panel.innerHTML = npPanelHTML();
  lyIndex = -1;
  updateLyricLine();
}
function renderNpPanelIf(tab) {
  if (state.section === 'nowplaying' && M.npTab === tab) renderNpPanel();
}

function nowPlayingHTML() {
  const it = M.item;
  if (!M.active || !it) {
    return emptyHTML(MI.disc.replace('<svg', '<svg width="40" height="40"'), 'Şu an çalan bir parça yok', 'Müzik ya da Podcast bölümünden bir şey seç.');
  }
  const sub = [it.artist, it.album].filter(Boolean).join(' · ');
  const back = it.kind === 'episode' ? 'podcast' : 'music';
  setTimeout(() => { lyIndex = -1; updateLyricLine(); bindNpScroll(); }, 0);
  return `<div class="np${it.kind === 'episode' ? ' is-episode' : ''}">
    <div class="np-stage">
      <button class="btn-ghost np-back" type="button" data-action="section" data-section="${back}">${MI.chevron}<span>${it.kind === 'episode' ? 'Podcast' : 'Müzik'}</span></button>
      ${deckHTML(it)}
      <div class="np-meta">
        <div class="np-text" data-noi18n><div class="np-title">${esc(it.title)}</div><div class="np-sub">${esc(sub)}</div></div>
        <span class="np-eq${state.playing ? ' on' : ''}" id="np-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </div>
      ${it.kind === 'track' ? `<div class="np-mobile-ctl">
        <button type="button" class="icon-btn m-ctl${M.shuffle ? ' active' : ''}" data-action="np-shuffle" aria-label="Karıştır" aria-pressed="${M.shuffle}">${MI.shuffle}</button>
        <button type="button" class="icon-btn m-ctl${M.repeat !== 'off' ? ' active' : ''}" data-action="np-repeat" aria-label="${M.repeat === 'one' ? 'Tekrar: bu parça' : M.repeat === 'all' ? 'Tekrar: tüm liste' : 'Tekrar kapalı'}">${M.repeat === 'one' ? MI.repeatOne : MI.repeat}</button>
      </div>` : ''}
    </div>
    <div class="np-side">
      ${npTabs(it)}
      <div class="np-panel" id="np-panel">${npPanelHTML()}</div>
    </div>
  </div>`;
}

function bindNpScroll() {
  const panel = $('#np-panel');
  if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = '1';
  const mark = () => { userScrollAt = Date.now(); };
  panel.addEventListener('wheel', mark, { passive: true });
  panel.addEventListener('touchmove', mark, { passive: true });
}

chain('sectionHTML', (prev, section) => (section === 'nowplaying' ? nowPlayingHTML() : prev(section)));

// ---------- Müzik kütüphanesi ----------

const LS = {
  loaded: false,
  loading: false,
  error: null,
  folders: [],
  tracks: [],
  tab: ['tracks', 'albums', 'artists', 'folders', 'playlists'].includes(store.get('musTab', 'tracks')) ? store.get('musTab', 'tracks') : 'tracks',
  filter: '',
  open: null,       // { type: 'album'|'artist'|'playlist', key }
  shown: 300,
  scan: null,       // { done, total }
  playlists: asArray(store.get('playlists', [])).filter((p) => p && p.id && Array.isArray(p.ids)),
};
const trackById = new Map();
const coverCache = new Map();

const cmpTr = (a, b) => String(a || '').localeCompare(String(b || ''), 'tr', { sensitivity: 'base', numeric: true });
function sortTracks(list) {
  return list.slice().sort((a, b) => cmpTr(a.albumArtist || a.artist, b.albumArtist || b.artist)
    || cmpTr(a.album, b.album) || (a.disc - b.disc) || (a.no - b.no) || cmpTr(a.title, b.title));
}

function applyLibrary(r) {
  LS.folders = asArray(r && r.folders);
  LS.tracks = sortTracks(asArray(r && r.tracks));
  trackById.clear();
  for (const t of LS.tracks) trackById.set(t.id, t);
  LS.loaded = true;
  LS.loading = false;
  if (state.section === 'music') renderContent();
}

async function loadLibrary() {
  if (!LIB || LS.loading) return;
  LS.loading = true;
  LS.error = null;
  try {
    applyLibrary(await LIB.get());
  } catch (err) {
    LS.loading = false;
    LS.error = cleanError(err);
    if (state.section === 'music') renderContent();
  }
}

if (LIB && typeof LIB.onEvent === 'function') {
  LIB.onEvent((ev) => {
    if (!ev) return;
    if (ev.type === 'scan') {
      LS.scan = { done: ev.done || 0, total: ev.total || 0 };
      const el = $('#mus-scan');
      if (el) el.outerHTML = scanHTML();
      else if (state.section === 'music') renderContent();
    } else if (ev.type === 'scanned') {
      LS.scan = null;
      loadLibrary();
      toast(`Kütüphane güncellendi: ${fmtCount(ev.total || 0)} parça`, { ms: 3000 });
    } else if (ev.type === 'changed') {
      loadLibrary();
    }
  });
}

/** Kütüphanedeki parçayı oynatıcının anladığı biçime çevirir. */
function toItem(t) {
  return {
    kind: 'track',
    id: t.id,
    title: t.title || t.file || 'Adsız parça',
    artist: t.artist || t.albumArtist || '',
    album: t.album || '',
    url: t.url,
    art: coverCache.get(t.id) || null,
    duration: t.duration || 0,
    meta: { year: t.year, genre: t.genre, format: t.format, dir: t.dir, file: t.file },
  };
}

function playTracks(list, index = 0, opts = {}) {
  if (!list.length) return;
  const items = list.map(toItem);
  if (opts.shuffle) {
    M.shuffle = true;
    store.set('mShuffle', true);
    index = Math.floor(Math.random() * items.length);
  }
  playItem(items[index], { queue: items, index });
  ensureCover(items[index]);
}

/** Çalan parçanın kapağını yükle; gelince oynatıcıyı ve plağı güncelle. */
async function ensureCover(item) {
  if (!LIB || !item || item.kind !== 'track' || item.art) return;
  const url = await getCover(item.id);
  if (!url) return;
  item.art = url;
  for (const q of M.queue) if (q.id === item.id) q.art = url;
  if (M.item === item) {
    renderPlayer();
    setMediaMeta(item);
    const label = $('.np-label');
    if (label) label.innerHTML = `<img class="np-cover" src="${esc(url)}" alt="">`;
  }
}
M.listeners.change.push((it) => ensureCover(it));

const coverWaiting = new Map();
let coverActive = 0;
const coverQueue = [];
function getCover(id) {
  if (coverCache.has(id)) return Promise.resolve(coverCache.get(id));
  if (coverWaiting.has(id)) return coverWaiting.get(id);
  const p = new Promise((resolve) => {
    coverQueue.push({ id, resolve });
    pumpCovers();
  });
  coverWaiting.set(id, p);
  return p;
}
function pumpCovers() {
  while (coverActive < 3 && coverQueue.length) {
    const { id, resolve } = coverQueue.shift();
    coverActive += 1;
    Promise.resolve(LIB.cover(id)).catch(() => null).then((url) => {
      coverCache.set(id, url || null);
      if (coverCache.size > 400) coverCache.delete(coverCache.keys().next().value);
      coverWaiting.delete(id);
      coverActive -= 1;
      resolve(url || null);
      pumpCovers();
    });
  }
}

let coverObserver = null;
function observeCovers() {
  if (!LIB) return;
  if (!coverObserver) {
    coverObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target;
        coverObserver.unobserve(img);
        getCover(img.dataset.cover).then((url) => {
          if (url) { img.src = url; img.closest('.cv') && img.closest('.cv').classList.add('has'); }
        });
      }
    }, { root: $('#content'), rootMargin: '300px' });
  }
  for (const img of document.querySelectorAll('#content img[data-cover]:not([data-obs])')) {
    img.dataset.obs = '1';
    const id = img.dataset.cover;
    if (coverCache.has(id)) {
      const url = coverCache.get(id);
      if (url) { img.src = url; img.closest('.cv') && img.closest('.cv').classList.add('has'); }
    } else {
      coverObserver.observe(img);
    }
  }
}

function coverBox(t, size, cls = '') {
  const key = t.album || t.title;
  return `<span class="cv ${cls}" style="width:${size}px;height:${size}px;--tint:${tintFor(key)}"><span class="cv-i">${esc(mediaInitials(key))}</span><img data-cover="${esc(t.id)}" alt=""></span>`;
}

function libFiltered() {
  const q = norm(LS.filter).trim();
  if (!q) return LS.tracks;
  const words = q.split(/\s+/).filter(Boolean);
  return LS.tracks.filter((t) => {
    const h = norm(`${t.title} ${t.artist} ${t.album} ${t.albumArtist} ${t.genre}`);
    return words.every((w) => h.includes(w));
  });
}

function albumsOf(list) {
  const map = new Map();
  for (const t of list) {
    if (!t.album) continue;
    const artist = t.albumArtist || t.artist || '';
    const key = `${artist.toLocaleLowerCase('tr')}|${t.album.toLocaleLowerCase('tr')}`;
    let a = map.get(key);
    if (!a) { a = { key, name: t.album, artist, year: t.year, tracks: [] }; map.set(key, a); }
    a.tracks.push(t);
    if (!a.year && t.year) a.year = t.year;
  }
  return [...map.values()].sort((x, y) => cmpTr(x.artist, y.artist) || cmpTr(x.name, y.name));
}

function artistsOf(list) {
  const map = new Map();
  for (const t of list) {
    const name = t.artist || t.albumArtist || 'Bilinmeyen sanatçı';
    const key = name.toLocaleLowerCase('tr');
    let a = map.get(key);
    if (!a) { a = { key, name, tracks: [], albums: new Set() }; map.set(key, a); }
    a.tracks.push(t);
    if (t.album) a.albums.add(t.album);
  }
  return [...map.values()].sort((x, y) => cmpTr(x.name, y.name));
}

function isPlayingTrack(id) {
  return M.active && M.item && M.item.kind === 'track' && M.item.id === id;
}

function trackRows(list, opts = {}) {
  const shown = list.slice(0, LS.shown);
  const rows = shown.map((t, i) => {
    const cur = isPlayingTrack(t.id);
    return `<div class="trk-row${cur ? ' current' : ''}${cur && state.playing ? ' is-playing' : ''}" data-trk="${esc(t.id)}">
      <button type="button" class="trk-main" data-action="mus-play" data-i="${i}" data-list="${opts.list || 'view'}">
        <span class="trk-n">${cur ? ICON.eq : opts.numbers && t.no ? t.no : i + 1}</span>
        ${opts.covers === false ? '' : coverBox(t, 40)}
        <span class="trk-text" data-noi18n><span class="trk-t">${esc(t.title || t.file)}</span><span class="trk-s">${esc(t.artist || '—')}</span></span>
        <span class="trk-al" data-noi18n>${esc(t.album || '')}</span>
        <span class="trk-d">${t.duration ? mediaTime(t.duration) : ''}</span>
      </button>
      <span class="trk-acts">
        <button type="button" class="icon-btn tiny" data-action="mus-queue" data-id="${esc(t.id)}" aria-label="Sıraya ekle" title="Sıraya ekle">${MI.queue}</button>
        <button type="button" class="icon-btn tiny" data-action="mus-pl-add" data-id="${esc(t.id)}" aria-label="Çalma listesine ekle" title="Çalma listesine ekle">${MI.listAdd}</button>
        ${opts.playlist ? `<button type="button" class="icon-btn tiny" data-action="mus-pl-remove" data-id="${esc(t.id)}" data-pl="${esc(opts.playlist)}" aria-label="Listeden çıkar" title="Listeden çıkar">${MI.x}</button>` : ''}
      </span>
    </div>`;
  }).join('');
  const left = list.length - shown.length;
  const more = left > 0 ? `<div class="more"><button class="btn-ghost" type="button" data-action="mus-more">Daha fazla göster · ${fmtCount(left)} parça daha</button></div>` : '';
  return `<div class="trk-list">${rows}</div>${more}`;
}

/** Ekranda görünen listedeki "çal" tıklamaları için. */
let musView = [];

function scanHTML() {
  if (!LS.scan) return '';
  const pct = LS.scan.total ? Math.round((LS.scan.done / LS.scan.total) * 100) : 0;
  return `<div class="mus-scan" id="mus-scan"><span class="spinner"></span><span>Müzikler taranıyor… ${fmtCount(LS.scan.done)} / ${fmtCount(LS.scan.total)}</span><span class="mus-bar"><i style="width:${pct}%"></i></span></div>`;
}

function libEmptyHTML() {
  const desktop = !!(LIB && LIB.desktop);
  return `<div class="mus-empty">
    <div class="mus-empty-disc" aria-hidden="true"><span></span></div>
    <h2>Kendi müziğini dinle</h2>
    <p>${desktop
    ? 'Bilgisayarındaki bir müzik klasörünü ekle. MP3, M4A, FLAC, OGG, OPUS ve WAV dosyaları listelenir. Dosyaların bilgisayarından çıkmaz; OA Radyo yalnızca çalar.'
    : 'Cihazındaki müzik dosyalarını seç. Dosyalar hiçbir yere yüklenmez; yalnızca bu cihazda çalınır.'}</p>
    <div class="mus-empty-acts">
      <button class="pill" type="button" data-action="mus-add">${MI.folder}<span>${desktop ? 'Klasör ekle' : 'Müzik dosyası seç'}</span></button>
      ${!desktop && LIB && LIB.canFolder ? `<button class="btn-ghost" type="button" data-action="mus-add-folder">${MI.folder}<span>Klasör seç</span></button>` : ''}
    </div>
  </div>`;
}

function musTabsHTML() {
  const tabs = [['tracks', 'Parçalar'], ['albums', 'Albümler'], ['artists', 'Sanatçılar'], ['folders', LIB && LIB.desktop ? 'Klasörler' : 'Dosyalar'], ['playlists', 'Çalma listeleri']];
  return `<div class="chips mus-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="chip${LS.tab === k && !LS.open ? ' active' : ''}" aria-selected="${LS.tab === k}" data-action="mus-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
}

function openHeaderHTML(title, sub, list, cover, extra = '') {
  return `<div class="mus-open">
    <button class="btn-ghost" type="button" data-action="mus-close">${MI.chevron}<span>Geri</span></button>
    <div class="mus-open-head">
      ${cover ? coverBox(cover, 120, 'big') : `<span class="cv big" style="width:120px;height:120px;--tint:${tintFor(title)}"><span class="cv-i">${esc(mediaInitials(title))}</span></span>`}
      <div class="mus-open-text">
        <h2 data-noi18n>${esc(title)}</h2>
        <p data-noi18n>${esc(sub)}</p>
        <div class="mus-open-acts">
          <button class="pill" type="button" data-action="mus-play-all" ${list.length ? '' : 'disabled'}>${ICON.play}<span>Çal</span></button>
          <button class="btn-ghost" type="button" data-action="mus-shuffle-all" ${list.length ? '' : 'disabled'}>${MI.shuffle}<span>Karıştır</span></button>
          ${extra}
        </div>
      </div>
    </div>
  </div>`;
}

function musicBodyHTML() {
  const list = libFiltered();
  if (LS.open) {
    const o = LS.open;
    if (o.type === 'album') {
      const a = albumsOf(LS.tracks).find((x) => x.key === o.key);
      if (!a) { LS.open = null; return musicBodyHTML(); }
      const tr = a.tracks.slice().sort((x, y) => (x.disc - y.disc) || (x.no - y.no) || cmpTr(x.title, y.title));
      musView = tr;
      const total = tr.reduce((s, t) => s + (t.duration || 0), 0);
      return openHeaderHTML(a.name, [a.artist, a.year || '', `${tr.length} parça`, total ? mediaTime(total) : ''].filter(Boolean).join(' · '), tr, tr[0]) + trackRows(tr, { numbers: true, covers: false });
    }
    if (o.type === 'artist') {
      const a = artistsOf(LS.tracks).find((x) => x.key === o.key);
      if (!a) { LS.open = null; return musicBodyHTML(); }
      musView = a.tracks;
      return openHeaderHTML(a.name, `${a.tracks.length} parça · ${a.albums.size} albüm`, a.tracks, null) + trackRows(a.tracks);
    }
    if (o.type === 'playlist') {
      const p = LS.playlists.find((x) => x.id === o.key);
      if (!p) { LS.open = null; return musicBodyHTML(); }
      const tr = p.ids.map((id) => trackById.get(id)).filter(Boolean);
      musView = tr;
      const missing = p.ids.length - tr.length;
      const extra = `<button class="btn-ghost" type="button" data-action="mus-pl-rename" data-pl="${esc(p.id)}">Yeniden adlandır</button>
        <button class="btn-ghost danger" type="button" data-action="mus-pl-delete" data-pl="${esc(p.id)}">${ICON.trash}<span>Listeyi sil</span></button>`;
      return openHeaderHTML(p.name, `${tr.length} parça${missing > 0 ? ` · ${missing} parça kütüphanede bulunamadı` : ''}`, tr, tr[0], extra)
        + (tr.length ? trackRows(tr, { playlist: p.id }) : '<p class="side-empty">Bu liste boş. Parçaların yanındaki “Çalma listesine ekle” düğmesiyle parça ekle.</p>');
    }
  }
  if (LS.tab === 'albums') {
    const albums = albumsOf(list);
    if (!albums.length) return '<p class="side-empty">Albüm bilgisi olan parça yok.</p>';
    return `<div class="alb-grid">${albums.slice(0, LS.shown).map((a) => `<button type="button" class="alb-card" data-action="mus-open" data-type="album" data-key="${esc(a.key)}">
      ${coverBox(a.tracks[0], 160, 'alb')}
      <span class="alb-name" data-noi18n>${esc(a.name)}</span><span class="alb-sub" data-noi18n>${esc([a.artist, a.year || ''].filter(Boolean).join(' · '))}</span></button>`).join('')}</div>
      ${albums.length > LS.shown ? `<div class="more"><button class="btn-ghost" type="button" data-action="mus-more">Daha fazla göster</button></div>` : ''}`;
  }
  if (LS.tab === 'artists') {
    const artists = artistsOf(list);
    return `<div class="art-list">${artists.slice(0, LS.shown).map((a) => `<button type="button" class="art-row" data-action="mus-open" data-type="artist" data-key="${esc(a.key)}">
      <span class="art-ic" style="background:${tintFor(a.name)}">${esc(mediaInitials(a.name))}</span>
      <span class="art-text" data-noi18n><span class="art-n">${esc(a.name)}</span></span><span class="art-c">${a.tracks.length} parça · ${a.albums.size} albüm</span></button>`).join('')}</div>`;
  }
  if (LS.tab === 'folders') {
    return `<div class="fold-list">${LS.folders.map((f) => `<div class="fold-row">
      <span class="fold-ic">${MI.folder}</span>
      <span class="fold-text" data-noi18n><span class="fold-n">${esc(f.name)}</span><span class="fold-p">${esc(LIB && LIB.desktop ? f.dir : '')}</span></span>
      <span class="fold-c">${fmtCount(f.count)} parça</span>
      <button class="btn-ghost danger" type="button" data-action="mus-remove-folder" data-dir="${esc(f.dir)}">Kaldır</button></div>`).join('')}</div>
      <div class="mus-folder-acts"><button class="btn-ghost accent" type="button" data-action="mus-add">${ICON.plus}<span>${LIB && LIB.desktop ? 'Klasör ekle' : 'Dosya ekle'}</span></button>
      ${LIB && LIB.desktop ? `<button class="btn-ghost" type="button" data-action="mus-rescan">${ICON.refresh}<span>Yeniden tara</span></button>` : ''}</div>`;
  }
  if (LS.tab === 'playlists') {
    const rows = LS.playlists.map((p) => `<button type="button" class="art-row" data-action="mus-open" data-type="playlist" data-key="${esc(p.id)}">
      <span class="art-ic sq" style="background:${tintFor(p.id)}">${MI.listAdd}</span>
      <span class="art-text" data-noi18n><span class="art-n">${esc(p.name)}</span></span><span class="art-c">${p.ids.length} parça</span></button>`).join('');
    return `<div class="mus-folder-acts"><button class="btn-ghost accent" type="button" data-action="mus-pl-new">${ICON.plus}<span>Yeni çalma listesi</span></button></div>
      ${rows ? `<div class="art-list">${rows}</div>` : '<p class="side-empty">Henüz çalma listen yok.</p>'}`;
  }
  musView = list;
  if (!list.length) return `<p class="side-empty">“${esc(LS.filter)}” ile eşleşen parça yok.</p>`;
  return trackRows(list);
}

function musicHTML() {
  if (!LIB) {
    return emptyHTML(MI.note.replace('<svg', '<svg width="40" height="40"'), 'Müzik bu sürümde yok', 'Yerel müzik çalma bu ortamda desteklenmiyor.');
  }
  if (!LS.loaded) {
    if (!LS.loading) loadLibrary();
    if (LS.error) return emptyHTML(MI.note.replace('<svg', '<svg width="40" height="40"'), 'Kütüphane açılamadı', LS.error, '<button class="pill" type="button" data-action="mus-reload">Tekrar dene</button>');
    return '<div class="loading"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div>';
  }
  setTimeout(observeCovers, 0);
  const head = `<div class="list-bar mus-bar-top"><h1 class="page-title">Müzik</h1><span class="spacer"></span>
    ${LS.tracks.length ? `<label class="side-filter mus-filter"><span class="sr-only">Kütüphanede ara</span><input id="mus-filter" type="search" placeholder="Kütüphanede ara" autocomplete="off" spellcheck="false" value="${esc(LS.filter)}"></label>` : ''}
    ${LS.tracks.length ? `<button class="btn-ghost" type="button" data-action="mus-shuffle-lib">${MI.shuffle}<span>Karışık çal</span></button>` : ''}
    <button class="btn-ghost accent" type="button" data-action="mus-add">${ICON.plus}<span>${LIB.desktop ? 'Klasör ekle' : 'Dosya ekle'}</span></button></div>`;
  if (!LS.tracks.length && !LS.scan) return head + libEmptyHTML();
  return `${head}${scanHTML()}${musTabsHTML()}<div id="mus-body">${musicBodyHTML()}</div>`;
}

function renderMusicBody() {
  const el = $('#mus-body');
  if (!el) { renderContent(); return; }
  el.innerHTML = musicBodyHTML();
  observeCovers();
}

/** Çalan parça değişince listelerdeki "çalıyor" işaretini güncelle. */
function refreshTrackRows() {
  for (const row of document.querySelectorAll('.trk-row[data-trk]')) {
    const cur = isPlayingTrack(row.dataset.trk);
    row.classList.toggle('current', cur);
    row.classList.toggle('is-playing', cur && state.playing);
  }
}
M.listeners.change.push(() => refreshTrackRows());
audio.addEventListener('playing', refreshTrackRows);
audio.addEventListener('pause', refreshTrackRows);

chain('sectionHTML', (prev, section) => (section === 'music' ? musicHTML() : prev(section)));

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'mus-filter') {
    LS.filter = e.target.value;
    LS.shown = 300;
    LS.open = null;
    clearTimeout(LS.filterTimer);
    LS.filterTimer = setTimeout(renderMusicBody, 120);
  }
});

// ---------- Çalma listeleri ----------

function savePlaylists() {
  store.set('playlists', LS.playlists);
  if (typeof markLocalChange === 'function') { try { markLocalChange(); } catch { /* eşitleme yok */ } }
}

function plDialog() {
  let d = $('#pl-dialog');
  if (d) return d;
  d = document.createElement('dialog');
  d.className = 'dialog';
  d.id = 'pl-dialog';
  d.setAttribute('aria-labelledby', 'pl-title');
  d.innerHTML = `<form method="dialog" id="pl-form" novalidate>
    <h2 id="pl-title">Çalma listesine ekle</h2>
    <div class="pl-choices" id="pl-choices"></div>
    <label class="field"><span>Yeni liste</span><input name="name" type="text" maxlength="60" placeholder="Örn. Yol şarkıları" autocomplete="off"></label>
    <p class="dialog-error" id="pl-error" role="alert"></p>
    <div class="dialog-actions">
      <button class="btn-ghost" type="button" data-action="pl-cancel">Vazgeç</button>
      <button class="pill" type="submit"><span>Oluştur ve ekle</span></button>
    </div></form>`;
  document.body.appendChild(d);
  d.querySelector('#pl-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name) { $('#pl-error').textContent = 'Listeye bir ad ver.'; return; }
    const ids = d._ids || [];
    if (d._mode === 'rename') {
      const p = LS.playlists.find((x) => x.id === d._pl);
      if (p) p.name = name.slice(0, 60);
    } else {
      LS.playlists.push({ id: `pl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.slice(0, 60), ids: [...new Set(ids)] });
      if (ids.length) toast(`“${name}” listesine eklendi.`, { ms: 2500 });
    }
    savePlaylists();
    d.close();
    if (state.section === 'music') renderMusicBody();
  });
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="pl-cancel"]')) d.close();
    const b = e.target.closest('[data-pl-pick]');
    if (!b) return;
    const p = LS.playlists.find((x) => x.id === b.dataset.plPick);
    if (!p) return;
    const before = p.ids.length;
    p.ids = [...new Set([...p.ids, ...(d._ids || [])])];
    savePlaylists();
    d.close();
    toast(p.ids.length > before ? `“${p.name}” listesine eklendi.` : 'Bu parça zaten listede.', { ms: 2500 });
    if (state.section === 'music') renderMusicBody();
  });
  return d;
}

function openPlaylistDialog(ids, mode = 'add', pl = null) {
  const d = plDialog();
  d._ids = ids;
  d._mode = mode;
  d._pl = pl;
  const p = pl ? LS.playlists.find((x) => x.id === pl) : null;
  $('#pl-title').textContent = mode === 'rename' ? 'Listeyi yeniden adlandır' : mode === 'new' ? 'Yeni çalma listesi' : 'Çalma listesine ekle';
  $('#pl-choices').innerHTML = mode === 'add' && LS.playlists.length
    ? LS.playlists.map((x) => `<button type="button" class="btn-ghost pl-choice" data-pl-pick="${esc(x.id)}">${MI.listAdd}<span data-noi18n>${esc(x.name)}</span><em>${x.ids.length}</em></button>`).join('')
    : '';
  $('#pl-error').textContent = '';
  const input = d.querySelector('input[name="name"]');
  input.value = mode === 'rename' && p ? p.name : '';
  d.querySelector('button[type="submit"] span').textContent = mode === 'rename' ? 'Kaydet' : mode === 'new' ? 'Oluştur' : 'Oluştur ve ekle';
  d.showModal();
  if (mode !== 'add' || !LS.playlists.length) input.focus();
}

// ---------- Tıklamalar ----------

async function addMusic(folder = false) {
  if (!LIB) return;
  try {
    const r = folder && LIB.addFolderFiles ? await LIB.addFolderFiles() : await LIB.addFolder();
    if (r) applyLibrary(r);
  } catch (err) {
    LS.scan = null;
    toast(cleanError(err), { error: true });
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (!a.startsWith('mus-') && !a.startsWith('np-')) return;
  switch (a) {
    case 'np-tab':
      M.npTab = el.dataset.tab;
      for (const b of document.querySelectorAll('.np-tab')) {
        const on = b.dataset.tab === M.npTab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      }
      renderNpPanel();
      break;
    case 'np-shuffle':
    case 'np-repeat': {
      $(a === 'np-shuffle' ? '#btn-shuffle' : '#btn-repeat').click();
      const b1 = $('.np-mobile-ctl [data-action="np-shuffle"]');
      const b2 = $('.np-mobile-ctl [data-action="np-repeat"]');
      if (b1) { b1.classList.toggle('active', M.shuffle); b1.setAttribute('aria-pressed', String(M.shuffle)); }
      if (b2) { b2.classList.toggle('active', M.repeat !== 'off'); b2.innerHTML = M.repeat === 'one' ? MI.repeatOne : MI.repeat; b2.setAttribute('aria-label', $('#btn-repeat').getAttribute('aria-label')); }
      break;
    }
    case 'np-seek':
      if (M.active) { audio.currentTime = Number(el.dataset.t) || 0; userScrollAt = 0; if (audio.paused) hooks.mediaToggle(); }
      break;
    case 'np-jump': {
      const qi = Number(el.dataset.qi);
      if (M.queue[qi]) { M.index = qi; playItem(M.queue[qi]); }
      break;
    }
    case 'np-unqueue': {
      const qi = Number(el.dataset.qi);
      if (qi === M.index || !M.queue[qi]) break;
      M.queue.splice(qi, 1);
      if (qi < M.index) M.index -= 1;
      M.order = M.order.filter((x) => x !== qi).map((x) => (x > qi ? x - 1 : x));
      renderNpPanel();
      break;
    }
    case 'mus-add':
      addMusic(false);
      break;
    case 'mus-add-folder':
      addMusic(true);
      break;
    case 'mus-rescan':
      try { applyLibrary(await LIB.rescan()); } catch (err) { toast(cleanError(err), { error: true }); }
      break;
    case 'mus-reload':
      LS.loaded = false; LS.error = null; loadLibrary(); renderContent();
      break;
    case 'mus-remove-folder':
      if (el.dataset.dir) applyLibrary(await LIB.removeFolder(el.dataset.dir));
      break;
    case 'mus-tab':
      LS.tab = el.dataset.tab;
      LS.open = null;
      LS.shown = 300;
      store.set('musTab', LS.tab);
      for (const b of document.querySelectorAll('.mus-tabs .chip')) b.classList.toggle('active', b.dataset.tab === LS.tab);
      renderMusicBody();
      $('#content').scrollTop = 0;
      break;
    case 'mus-open':
      LS.open = { type: el.dataset.type, key: el.dataset.key };
      LS.shown = 300;
      for (const b of document.querySelectorAll('.mus-tabs .chip')) b.classList.remove('active');
      renderMusicBody();
      $('#content').scrollTop = 0;
      break;
    case 'mus-close':
      LS.open = null;
      for (const b of document.querySelectorAll('.mus-tabs .chip')) b.classList.toggle('active', b.dataset.tab === LS.tab);
      renderMusicBody();
      break;
    case 'mus-more':
      LS.shown += 300;
      renderMusicBody();
      break;
    case 'mus-play': {
      const i = Number(el.dataset.i);
      const t = musView[i];
      if (!t) break;
      if (isPlayingTrack(t.id)) { hooks.mediaToggle(); break; }
      playTracks(musView, i);
      break;
    }
    case 'mus-play-all':
      playTracks(musView, 0);
      break;
    case 'mus-shuffle-all':
      playTracks(musView, 0, { shuffle: true });
      break;
    case 'mus-shuffle-lib':
      playTracks(LS.tracks, 0, { shuffle: true });
      break;
    case 'mus-queue': {
      const t = trackById.get(el.dataset.id);
      if (!t) break;
      const it = toItem(t);
      if (!M.active || !M.item || M.item.kind !== 'track') { playTracks([t], 0); break; }
      M.queue.splice(M.index + 1, 0, it);
      M.order = M.order.map((x) => (x > M.index ? x + 1 : x));
      const pos = M.order.indexOf(M.index);
      M.order.splice(pos + 1, 0, M.index + 1);
      toast(`Sıradaki: ${it.title}`, { ms: 2000 });
      if (state.section === 'nowplaying' && M.npTab === 'queue') renderNpPanel();
      break;
    }
    case 'mus-pl-add':
      if (el.dataset.id) openPlaylistDialog([el.dataset.id], 'add');
      break;
    case 'mus-pl-new':
      openPlaylistDialog([], 'new');
      break;
    case 'mus-pl-rename':
      openPlaylistDialog([], 'rename', el.dataset.pl);
      break;
    case 'mus-pl-delete': {
      const p = LS.playlists.find((x) => x.id === el.dataset.pl);
      if (!p || !window.confirm(`“${p.name}” listesi silinsin mi? Parçalar kütüphanende kalır.`)) break;
      LS.playlists = LS.playlists.filter((x) => x !== p);
      savePlaylists();
      LS.open = null;
      renderMusicBody();
      break;
    }
    case 'mus-pl-remove': {
      const p = LS.playlists.find((x) => x.id === el.dataset.pl);
      if (!p) break;
      p.ids = p.ids.filter((id) => id !== el.dataset.id);
      savePlaylists();
      renderMusicBody();
      break;
    }
    case 'mus-reveal':
      if (LIB && LIB.reveal) LIB.reveal(el.dataset.id);
      break;
  }
});

// ---------- Ayarlar: internetten söz arama ----------

(function lyricsSetting() {
  const form = $('#settings-form');
  if (!form || !LIB || typeof LIB.online !== 'function') return;
  const sec = document.createElement('section');
  sec.className = 'set-group';
  sec.innerHTML = `<h3>Şarkı sözleri</h3>
    <label class="switch-row">
      <span><strong>Sözleri internetten bul</strong><em>Parçanın kendi dosyasında ya da yanındaki .lrc dosyasında söz yoksa LRCLIB’de (lrclib.net) aranır. Yalnızca sanatçı, şarkı adı, albüm ve süre gönderilir; dosyanın kendisi gönderilmez.</em></span>
      <input type="checkbox" class="switch" id="set-lyrics-online">
    </label>`;
  const actions = form.querySelector('.dialog-actions');
  form.insertBefore(sec, actions);
  const sw = sec.querySelector('#set-lyrics-online');
  const sync = () => AS.get().then((s) => { sw.checked = s.lyricsOnline !== false; }).catch(() => {});
  sync();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="settings-open"]')) setTimeout(sync, 0); });
  sw.addEventListener('change', async () => {
    await AS.set({ lyricsOnline: sw.checked }).catch(() => {});
    if (M.item && M.item.kind === 'track' && M.lyrics && M.lyrics.none) loadLyrics(M.item);
  });
}());

// ---------- Dışarıya açılan arayüz (podcast.js, features.js) ----------

window.OAMedia = {
  play: playItem,
  active: () => M.active,
  item: () => (M.active ? M.item : null),
  on: (name, fn) => { if (M.listeners[name]) M.listeners[name].push(fn); },
  open: () => selectSection('nowplaying'),
  time: () => (M.active ? audio.currentTime || 0 : 0),
  /** Tepsi ve mini oynatıcı için istasyon biçiminde özet. */
  station: () => {
    if (!M.active || !M.item) return null;
    const it = M.item;
    return { id: it.id, name: it.title, favicon: it.art && /^https:/.test(it.art) ? it.art : '', initials: mediaInitials(it.title), tint: tintFor(it.id) };
  },
  mediaTime,
};
