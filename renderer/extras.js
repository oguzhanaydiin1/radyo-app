'use strict';

/*
 * 0.6 eklentileri: ekolayzır ve ses dengeleme, şarkıyı bul ve şarkı geçmişi, şehre göre
 * radyolar, favori klasörleri ve sürükle-bırak, dinleme istatistikleri, açık tema,
 * Discord durumu, paylaşma ve radyo:// bağlantıları.
 * app.js ve features.js'teki genel değişkenleri ve yardımcıları kullanır.
 */

const EX = window.extras;

const IC = {
  eq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3"/><path d="M1 15h6M9 8h6M17 17h6"/></svg>',
  yt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"/></svg>',
  sp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.3-.5 10 1.1.3.2.4.6.2.9zm1.2-2.7a.8.8 0 0 1-1 .3c-2.8-1.7-7-2.2-10.2-1.2a.8.8 0 0 1-.5-1.5c3.7-1.1 8.4-.6 11.5 1.4.4.2.5.7.2 1zm.1-2.8C14.6 9 9.2 8.8 6.1 9.8a.9.9 0 1 1-.5-1.8c3.6-1.1 9.6-.9 13.3 1.3a.9.9 0 0 1-1 1.6z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
};

/** Bir hook'u öncekini bozmadan genişlet. */
function chain(name, fn) {
  const prev = hooks[name];
  hooks[name] = (...args) => fn(prev ? (...a) => prev(...a) : () => undefined, ...args);
}

// ---------- Kayan menü (klasör, ekolayzır) ----------

const pop = document.createElement('div');
pop.className = 'menu fx-pop';
pop.hidden = true;
pop.setAttribute('role', 'menu');
document.body.appendChild(pop);
let popOwner = null;

function openPop(anchor, html, owner, place = 'below') {
  pop.innerHTML = html;
  pop.hidden = false;
  popOwner = owner;
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
  let top = place === 'above' ? r.top - h - 8 : r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
function closePop() {
  pop.hidden = true;
  popOwner = null;
}
document.addEventListener('mousedown', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-pop-anchor]')) closePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePop(); });

// =====================================================================
// 1) Ekolayzır ve ses dengeleme
// =====================================================================

const EQ_BANDS = [60, 230, 910, 3600, 12000];
const EQ_LABELS = ['60', '230', '910', '3,6k', '12k'];
const EQ_PRESETS = [
  { id: 'off', label: 'Düz', gains: [0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Bas', gains: [6, 4, 0, 0, 0] },
  { id: 'speech', label: 'Konuşma', gains: [-5, -2, 3, 4, 0] },
  { id: 'pop', label: 'Pop', gains: [-1, 2, 4, 2, -1] },
  { id: 'rock', label: 'Rock', gains: [4, 2, -2, 2, 4] },
  { id: 'classic', label: 'Klasik', gains: [3, 1, 0, 1, 3] },
  { id: 'car', label: 'Araba', gains: [5, 2, 0, 2, 3] },
  { id: 'night', label: 'Gece', gains: [-3, 0, 1, 0, -4] },
];

const eqState = (() => {
  const v = store.get('eq', null) || {};
  const gains = Array.isArray(v.gains) && v.gains.length === 5 ? v.gains.map((g) => clamp(Number(g) || 0, -12, 12)) : [0, 0, 0, 0, 0];
  return { preset: typeof v.preset === 'string' ? v.preset : 'off', gains, normalize: !!v.normalize };
})();
const saveEq = () => store.set('eq', eqState);
const eqActive = () => eqState.normalize || eqState.gains.some((g) => g !== 0);

const G = { ctx: null, filters: [], auto: null, comp: null, vol: null, analyser: null, buf: null, timer: null };

/** Ses grafiği yalnızca ekolayzır ya da ses dengeleme ilk açıldığında kurulur. */
function ensureGraph() {
  if (G.ctx) return true;
  try {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const src = ctx.createMediaElementSource(audio);
    let node = src;
    G.filters = EQ_BANDS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.0;
      node.connect(b);
      node = b;
      return b;
    });
    G.analyser = ctx.createAnalyser();
    G.analyser.fftSize = 2048;
    G.buf = new Float32Array(G.analyser.fftSize);
    node.connect(G.analyser);
    G.auto = ctx.createGain();
    G.comp = ctx.createDynamicsCompressor();
    G.vol = ctx.createGain();
    node.connect(G.auto);
    G.auto.connect(G.comp);
    G.comp.connect(G.vol);
    G.vol.connect(ctx.destination);
    G.ctx = ctx;
    applyEq();
    applyVolume();
    return true;
  } catch (err) {
    console.warn('Ses grafiği kurulamadı', err);
    return false;
  }
}

function applyEq() {
  if (!G.ctx) return;
  const t = G.ctx.currentTime;
  G.filters.forEach((f, i) => f.gain.setTargetAtTime(eqState.gains[i], t, 0.05));
  const c = G.comp;
  if (eqState.normalize) {
    c.threshold.setValueAtTime(-16, t); c.knee.setValueAtTime(10, t); c.ratio.setValueAtTime(4, t);
    c.attack.setValueAtTime(0.005, t); c.release.setValueAtTime(0.3, t);
  } else {
    // Ekolayzır yükseltmelerinde patlamayı önleyen hafif sınırlayıcı.
    c.threshold.setValueAtTime(-2, t); c.knee.setValueAtTime(0, t); c.ratio.setValueAtTime(20, t);
    c.attack.setValueAtTime(0.002, t); c.release.setValueAtTime(0.1, t);
    G.auto.gain.setTargetAtTime(1, t, 0.3);
  }
  clearInterval(G.timer);
  if (eqState.normalize) G.timer = setInterval(levelStep, 250);
}

/** Ses dengeleme: yayının ortalama yüksekliğini ölçüp yavaşça hedef düzeye çeker. */
function levelStep() {
  if (!G.ctx || audio.paused) return;
  G.analyser.getFloatTimeDomainData(G.buf);
  let sum = 0;
  for (let i = 0; i < G.buf.length; i++) sum += G.buf[i] * G.buf[i];
  const rms = Math.sqrt(sum / G.buf.length);
  if (rms < 0.004) return; // sessizlik, konuşma arası
  const db = 20 * Math.log10(rms);
  const target = -21;
  const want = clamp(10 ** ((target - db) / 20), 0.35, 3.2);
  G.auto.gain.setTargetAtTime(want, G.ctx.currentTime, 2.5);
}

chain('applyVolume', (prev, v) => {
  if (!G.ctx) return prev(v);
  audio.volume = 1;
  G.vol.gain.setTargetAtTime(v * v * 0.6 + v * 0.4, G.ctx.currentTime, 0.03);
  return true;
});
chain('beforePlay', (prev, s) => {
  if (eqActive()) ensureGraph();
  if (G.ctx && G.ctx.state === 'suspended') G.ctx.resume().catch(() => {});
  return prev(s);
});

function eqHTML() {
  const sliders = EQ_BANDS.map((_, i) => `<label class="eq-band">
      <input type="range" min="-12" max="12" step="1" value="${eqState.gains[i]}" data-eq="${i}" orient="vertical" aria-label="${EQ_LABELS[i]} Hz">
      <span class="eq-val" id="eq-val-${i}">${eqState.gains[i] > 0 ? '+' : ''}${eqState.gains[i]}</span>
      <span class="eq-f">${EQ_LABELS[i]}</span></label>`).join('');
  return `<div class="menu-title">EKOLAYZIR</div>
    <div class="eq-presets">${EQ_PRESETS.map((p) => `<button type="button" class="chip${eqState.preset === p.id ? ' active' : ''}" data-eq-preset="${p.id}">${p.label}</button>`).join('')}</div>
    <div class="eq-bands">${sliders}</div>
    <label class="switch-row eq-norm"><span><strong>Ses dengeleme</strong><em>Radyolar arasında ses yüksekliği farkını azaltır.</em></span>
      <input type="checkbox" class="switch" id="eq-normalize"${eqState.normalize ? ' checked' : ''}></label>`;
}

const eqBtn = document.createElement('button');
eqBtn.className = 'icon-btn';
eqBtn.id = 'btn-eq';
eqBtn.type = 'button';
eqBtn.dataset.popAnchor = '1';
eqBtn.title = 'Ekolayzır ve ses dengeleme';
eqBtn.setAttribute('aria-label', 'Ekolayzır');
eqBtn.innerHTML = IC.eq;
$('#btn-mini').before(eqBtn);
const markEqBtn = () => eqBtn.classList.toggle('active', eqActive());
markEqBtn();
eqBtn.addEventListener('click', () => {
  if (popOwner === 'eq') { closePop(); return; }
  openPop(eqBtn, eqHTML(), 'eq', 'above');
  pop.classList.add('eq-pop');
});

function setEq(patch) {
  Object.assign(eqState, patch);
  saveEq();
  markEqBtn();
  if (eqActive() || G.ctx) {
    const had = !!G.ctx;
    ensureGraph();
    if (!had && G.ctx && state.current && (state.playing || state.buffering)) {
      // İlk kurulumda sesin yeni yoldan gelmesi için yayını yeniden başlat.
      G.ctx.resume().catch(() => {});
    }
    applyEq();
  }
}

pop.addEventListener('input', (e) => {
  const i = e.target.dataset && e.target.dataset.eq;
  if (i === undefined) return;
  const gains = [...eqState.gains];
  gains[Number(i)] = Number(e.target.value);
  $(`#eq-val-${i}`, pop).textContent = `${gains[i] > 0 ? '+' : ''}${gains[i]}`;
  for (const b of pop.querySelectorAll('[data-eq-preset]')) b.classList.remove('active');
  setEq({ gains, preset: 'custom' });
});
pop.addEventListener('change', (e) => {
  if (e.target.id === 'eq-normalize') setEq({ normalize: e.target.checked });
});
pop.addEventListener('click', (e) => {
  const b = e.target.closest('[data-eq-preset]');
  if (!b) return;
  const p = EQ_PRESETS.find((x) => x.id === b.dataset.eqPreset);
  if (!p) return;
  setEq({ preset: p.id, gains: [...p.gains] });
  openPop(eqBtn, eqHTML(), 'eq', 'above');
});

// =====================================================================
// 2) Şarkıyı bul ve şarkı geçmişi
// =====================================================================

const songs = (() => { const v = store.get('songs', {}); return v && typeof v === 'object' ? v : {}; })();
let songsSaveTimer = null;
const saveSongs = () => { clearTimeout(songsSaveTimer); songsSaveTimer = setTimeout(() => store.set('songs', songs), 1500); };

/** Yayının gönderdiği başlıklardan reklam/kimlik anonslarını ayıkla. */
function isSong(t) {
  if (!t || t.length < 3) return false;
  const n = norm(t);
  if (/^(reklam|advert|jingle|haber|news|spot|id|live|canli|radyo|radio)\b/.test(n)) return false;
  if (state.current && norm(state.current.name) === n) return false;
  return /[a-z0-9]/i.test(n);
}

P.onMeta((m) => {
  const s = state.current;
  if (!m || !s || m.url !== s.url || !isSong(m.title)) return;
  const list = Array.isArray(songs[s.id]) ? songs[s.id] : [];
  if (list[0] && list[0].t === m.title) return;
  songs[s.id] = [{ t: m.title, at: Date.now() }, ...list.filter((x) => x.t !== m.title)].slice(0, 25);
  // En fazla 300 istasyonun geçmişi tutulur.
  const keys = Object.keys(songs);
  if (keys.length > 300) {
    keys.sort((a, b) => (songs[a][0]?.at || 0) - (songs[b][0]?.at || 0));
    for (const k of keys.slice(0, keys.length - 300)) delete songs[k];
  }
  saveSongs();
  updatePlayerSong();
  updateDiscord();
  if (state.section === 'discover') {
    const box = $('#song-box');
    if (box) box.outerHTML = songBoxHTML(s);
  }
});

const ytUrl = (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}`;
const spUrl = (t) => `https://open.spotify.com/search/${encodeURIComponent(t)}`;
const songLinks = (t) => `<span class="song-links">
  <button class="song-link yt" type="button" data-action="song-open" data-href="${esc(ytUrl(t))}" title="YouTube’da ara">${IC.yt}</button>
  <button class="song-link sp" type="button" data-action="song-open" data-href="${esc(spUrl(t))}" title="Spotify’da ara">${IC.sp}</button></span>`;

function songAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function songBoxHTML(s) {
  const list = (Array.isArray(songs[s.id]) ? songs[s.id] : []).slice(0, 8);
  const nowT = isCurrent(s.id) && state.playing ? state.nowTitle : '';
  if (!list.length && !nowT) return '<div id="song-box" hidden></div>';
  return `<section class="song-box card" id="song-box" aria-label="Son çalan şarkılar">
    <h2 class="similar-title">${IC.music}<span>Son çalan şarkılar</span></h2>
    <div class="song-list">${list.map((x, i) => `<div class="song-row${i === 0 && nowT === x.t ? ' now' : ''}">
      <span class="song-t" title="${esc(x.t)}">${i === 0 && nowT === x.t ? '<span class="now-dot"></span>' : ''}${esc(x.t)}</span>
      <span class="song-at">${i === 0 && nowT === x.t ? 'şimdi çalıyor' : esc(songAgo(x.at))}</span>${songLinks(x.t)}</div>`).join('')}</div>
  </section>`;
}

chain('afterHero', (prev, s) => songBoxHTML(s) + (prev(s) || ''));

// Alt çubukta çalan şarkının yanında YouTube / Spotify düğmeleri.
const pSong = document.createElement('span');
pSong.className = 'p-song';
pSong.id = 'p-song';
$('.player-text').after(pSong);
let pSongKey = '';
function updatePlayerSong() {
  const t = state.playing && state.nowTitle && isSong(state.nowTitle) ? state.nowTitle : '';
  if (t === pSongKey) return;
  pSongKey = t;
  pSong.innerHTML = t ? songLinks(t) : '';
}
chain('playerRendered', (prev) => { updatePlayerSong(); updateDiscord(); return prev(); });

// =====================================================================
// 3) Şehre göre radyolar
// =====================================================================

const CITIES = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın',
  'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
  'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
  'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis',
  'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
  'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ',
  'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];
// İlçe ve eski adlar -> il.
const CITY_ALIAS = {
  istambul: 'İstanbul', bagcilar: 'İstanbul', uskudar: 'İstanbul', kadikoy: 'İstanbul', besiktas: 'İstanbul', fatih: 'İstanbul',
  pursaklar: 'Ankara', cankaya: 'Ankara', kecioren: 'Ankara', bandirma: 'Balıkesir', edremit: 'Balıkesir', ayvalik: 'Balıkesir',
  antakya: 'Hatay', iskenderun: 'Hatay', samandag: 'Hatay', defne: 'Hatay', konyaalti: 'Antalya', alanya: 'Antalya', manavgat: 'Antalya',
  cukurova: 'Adana', seyhan: 'Adana', tatvan: 'Bitlis', guroymak: 'Bitlis', gevas: 'Van', ercis: 'Van', dogubayazit: 'Ağrı',
  sarikamis: 'Kars', viransehir: 'Şanlıurfa', urfa: 'Şanlıurfa', terme: 'Samsun', bafra: 'Samsun', carsamba: 'Samsun', zile: 'Tokat',
  espiye: 'Giresun', ardesen: 'Rize', devrek: 'Zonguldak', eregli: 'Zonguldak', karakocan: 'Elazığ', antep: 'Gaziantep',
  maras: 'Kahramanmaraş', afyon: 'Afyonkarahisar', izmit: 'Kocaeli', gebze: 'Kocaeli', adapazari: 'Sakarya', icel: 'Mersin',
  tarsus: 'Mersin', bodrum: 'Muğla', fethiye: 'Muğla', marmaris: 'Muğla', karsiyaka: 'İzmir', bornova: 'İzmir', inegol: 'Bursa',
  corlu: 'Tekirdağ', cerkezkoy: 'Tekirdağ', luleburgaz: 'Kırklareli', akhisar: 'Manisa', nazilli: 'Aydın', kusadasi: 'Aydın',
  eregli2: 'Konya', aksehir: 'Konya', polatli: 'Ankara', siverek: 'Şanlıurfa', kizilcahamam: 'Ankara',
};
const CITY_KEYS = new Map(CITIES.map((c) => [norm(c), c]));
const cityCache = new Map();

function cityOf(s) {
  if (!s || !s.id) return '';
  let c = cityCache.get(s.id);
  if (c !== undefined) return c;
  c = '';
  const find = (text) => {
    for (const w of norm(text).split(/[^a-z0-9]+/).filter(Boolean)) {
      if (CITY_KEYS.has(w)) return CITY_KEYS.get(w);
      if (CITY_ALIAS[w]) return CITY_ALIAS[w];
    }
    return '';
  };
  if (s.state) c = find(s.state);
  if (!c) c = find(s.name);
  if (!c && Array.isArray(s.tags)) c = find(s.tags.join(' '));
  cityCache.set(s.id, c);
  return c;
}
hooks.cityOf = cityOf;

let cityCounts = null;
let cityCountsFor = null;
function countCities() {
  if (cityCountsFor === state.all && cityCounts) return cityCounts;
  const m = new Map();
  for (const s of state.all) {
    const c = cityOf(s);
    if (c) m.set(c, (m.get(c) || 0) + 1);
  }
  cityCounts = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  cityCountsFor = state.all;
  return cityCounts;
}

chain('listBarExtra', (prev) => {
  const before = prev() || '';
  if (state.section !== 'discover' || !state.all.length) return before;
  const list = countCities();
  if (!list.length) return before;
  return `${before}<label><span class="sr-only">Şehir</span>
    <select class="select" id="city"><option value="">Tüm şehirler</option>${list.map(([c, n]) => `<option value="${esc(c)}"${state.city === c ? ' selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select></label>`;
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'city') return;
  state.city = e.target.value;
  store.set('city', state.city);
  state.shown = PAGE;
  renderContent();
});

// =====================================================================
// 4) Favori klasörleri ve sürükle-bırak
// =====================================================================

state.favFolders = asArray(store.get('favFolders', [])).filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
  .map((f) => ({ id: f.id, name: String(f.name).slice(0, 40), ids: asArray(f.ids).filter((x) => typeof x === 'string') }));
state.favFolder = 'all';
const saveFolders = () => store.set('favFolders', state.favFolders);

hooks.remoteFolders = (list, merge) => {
  const clean = asArray(list).filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
    .map((f) => ({ id: f.id, name: String(f.name).slice(0, 40), ids: asArray(f.ids).filter((x) => typeof x === 'string') }));
  if (merge) {
    const map = new Map(state.favFolders.map((f) => [f.id, { ...f, ids: [...f.ids] }]));
    for (const f of clean) {
      const cur = map.get(f.id);
      if (cur) cur.ids = [...new Set([...cur.ids, ...f.ids])];
      else map.set(f.id, f);
    }
    state.favFolders = [...map.values()];
  } else {
    state.favFolders = clean;
  }
  store.set('favFolders', state.favFolders);
};

const folderById = (id) => state.favFolders.find((f) => f.id === id);

function favList() {
  if (state.favFolder === 'all') return state.favorites;
  const f = folderById(state.favFolder);
  if (!f) return state.favorites;
  const byId = new Map(state.favorites.map((s) => [s.id, s]));
  return f.ids.map((id) => byId.get(id)).filter(Boolean);
}

hooks.favoritesHTML = () => {
  if (state.favFolder !== 'all' && !folderById(state.favFolder)) state.favFolder = 'all';
  let html = '<h1 class="page-title">Favoriler</h1>';
  if (!state.favorites.length) {
    return html + emptyHTML(ICON.heart.replace('class="off-icon" ', ''), 'Henüz favorin yok',
      'Keşfet’te beğendiğin istasyonun kalbine bas, burada toplansın.');
  }
  const chip = (id, label, n) => `<button class="chip folder-chip${state.favFolder === id ? ' active' : ''}" type="button" data-action="fold-select" data-folder="${esc(id)}" data-drop-folder="${esc(id)}">${id === 'all' ? '' : IC.folder}<span>${esc(label)}</span><span class="chip-n">${n}</span></button>`;
  html += `<div class="chips fold-chips">${chip('all', 'Tümü', state.favorites.length)}${state.favFolders.map((f) => chip(f.id, f.name, f.ids.filter((x) => isFav(x)).length)).join('')}
    <button class="chip ghost" type="button" data-action="fold-new">+ Yeni klasör</button></div>`;
  const f = folderById(state.favFolder);
  html += `<div class="list-bar"><span class="count">${f ? `${esc(f.name)} klasörü` : 'Tüm favoriler'}</span>
    <span class="hint">${IC.grip}<span>Sıralamak için kartları sürükle${state.favFolders.length ? ', klasöre eklemek için yukarıdaki klasörün üstüne bırak' : ''}</span></span>
    <span class="spacer"></span>
    ${f ? `<button class="btn-ghost" type="button" data-action="fold-rename" data-folder="${esc(f.id)}">Yeniden adlandır</button>
      <button class="btn-ghost danger" type="button" data-action="fold-delete" data-folder="${esc(f.id)}">Klasörü sil</button>` : ''}</div>`;
  const list = favList();
  if (!list.length) {
    html += emptyHTML(IC.folder, 'Bu klasör boş', 'Tümü’ndeki bir kartı bu klasörün üstüne sürükle ya da kartın klasör düğmesini kullan.');
    return html;
  }
  html += `<div class="grid fav-grid" id="fav-grid">${list.map((s) => cardHTML(s)
    .replace('<article class="station-card', '<article draggable="true" class="station-card')
    .replace('<span class="card-actions">', `<span class="card-actions"><button class="icon-btn fold-btn" type="button" data-action="fold-menu" data-id="${esc(s.id)}" data-pop-anchor="1" title="Klasörlere ekle" aria-label="Klasörlere ekle">${IC.folder}</button>`)).join('')}</div>`;
  return html;
};

function folderMenuHTML(id) {
  const rows = state.favFolders.map((f) => {
    const on = f.ids.includes(id);
    return `<button type="button" class="fold-row${on ? ' on' : ''}" data-fold-toggle="${esc(f.id)}" data-id="${esc(id)}"><span class="fold-check">${on ? IC.check : ''}</span>${esc(f.name)}</button>`;
  }).join('');
  return `<div class="menu-title">KLASÖRLER</div>${rows || '<p class="menu-note">Henüz klasör yok.</p>'}
    <button type="button" class="fold-row" data-fold-new-for="${esc(id)}"><span class="fold-check">+</span>Yeni klasör…</button>`;
}

// Klasör adı penceresi (Electron'da prompt() yok).
const nameDlg = document.createElement('dialog');
nameDlg.className = 'dialog';
nameDlg.innerHTML = `<form method="dialog" id="fold-form"><h2 id="fold-title">Yeni klasör</h2>
  <label class="field"><span>Klasör adı</span><input name="name" maxlength="40" autocomplete="off" required placeholder="Örn. Spor, Gece, Araba"></label>
  <div class="dialog-actions"><button class="btn-ghost" type="button" value="cancel" id="fold-cancel">Vazgeç</button><button class="pill" type="submit">Kaydet</button></div></form>`;
document.body.appendChild(nameDlg);
let nameDlgDone = null;
function askName(title, value = '') {
  return new Promise((resolve) => {
    $('#fold-title', nameDlg).textContent = title;
    const input = nameDlg.querySelector('input');
    input.value = value;
    nameDlgDone = resolve;
    nameDlg.showModal();
    input.focus();
    input.select();
  });
}
$('#fold-form', nameDlg).addEventListener('submit', (e) => {
  e.preventDefault();
  const v = nameDlg.querySelector('input').value.trim();
  if (!v) return;
  nameDlg.close();
  if (nameDlgDone) nameDlgDone(v);
  nameDlgDone = null;
});
$('#fold-cancel', nameDlg).addEventListener('click', () => { nameDlg.close(); if (nameDlgDone) nameDlgDone(null); nameDlgDone = null; });
nameDlg.addEventListener('cancel', () => { if (nameDlgDone) nameDlgDone(null); nameDlgDone = null; });

async function newFolder(addId) {
  const name = await askName('Yeni klasör');
  if (!name) return;
  const f = { id: `f${Date.now().toString(36)}`, name: name.slice(0, 40), ids: addId ? [addId] : [] };
  state.favFolders = [...state.favFolders, f];
  saveFolders();
  if (!addId) state.favFolder = f.id;
  renderContent();
}

function toggleInFolder(folderId, id, force) {
  const f = folderById(folderId);
  if (!f) return;
  const on = f.ids.includes(id);
  const want = force === undefined ? !on : force;
  if (want === on) return;
  f.ids = want ? [...f.ids, id] : f.ids.filter((x) => x !== id);
  state.favFolders = [...state.favFolders];
  saveFolders();
}

pop.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-fold-toggle]');
  if (t) {
    toggleInFolder(t.dataset.foldToggle, t.dataset.id);
    pop.innerHTML = folderMenuHTML(t.dataset.id);
    if (state.section === 'favorites') renderKeepScroll();
    return;
  }
  const n = e.target.closest('[data-fold-new-for]');
  if (n) {
    closePop();
    await newFolder(n.dataset.foldNewFor);
  }
});

function renderKeepScroll() {
  const c = $('#content');
  const top = c.scrollTop;
  renderContent();
  c.scrollTop = top;
}

// Sürükle-bırak: favorileri sırala ya da klasöre at.
let dragId = null;
document.addEventListener('dragstart', (e) => {
  const card = e.target.closest && e.target.closest('#fav-grid [data-card]');
  if (!card) return;
  dragId = card.dataset.card;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const chipEl = e.target.closest('[data-drop-folder]');
  for (const c of document.querySelectorAll('.drop-on')) if (c !== chipEl) c.classList.remove('drop-on');
  if (chipEl && chipEl.dataset.dropFolder !== 'all') {
    e.preventDefault();
    chipEl.classList.add('drop-on');
    return;
  }
  const over = e.target.closest('#fav-grid [data-card]');
  const grid = $('#fav-grid');
  if (!over || !grid) return;
  e.preventDefault();
  const dragging = grid.querySelector('.dragging');
  if (!dragging || over === dragging) return;
  const r = over.getBoundingClientRect();
  const after = (e.clientX - r.left) / r.width > 0.5;
  over[after ? 'after' : 'before'](dragging);
});
document.addEventListener('drop', (e) => {
  if (!dragId) return;
  e.preventDefault();
  const chipEl = e.target.closest('[data-drop-folder]');
  if (chipEl && chipEl.dataset.dropFolder !== 'all') {
    const f = folderById(chipEl.dataset.dropFolder);
    toggleInFolder(chipEl.dataset.dropFolder, dragId, true);
    const s = registry.get(dragId);
    if (f && s) toast(`${s.name} “${f.name}” klasörüne eklendi.`, { ms: 2500 });
    dragId = null;
    renderKeepScroll();
  }
});
document.addEventListener('dragend', () => {
  if (!dragId) return;
  const grid = $('#fav-grid');
  dragId = null;
  for (const c of document.querySelectorAll('.drop-on, .dragging')) c.classList.remove('drop-on', 'dragging');
  if (!grid) return;
  const order = [...grid.querySelectorAll('[data-card]')].map((el) => el.dataset.card);
  if (state.favFolder === 'all') {
    const byId = new Map(state.favorites.map((s) => [s.id, s]));
    const next = order.map((id) => byId.get(id)).filter(Boolean);
    for (const s of state.favorites) if (!order.includes(s.id)) next.push(s);
    if (next.map((s) => s.id).join() !== state.favorites.map((s) => s.id).join()) {
      state.favorites = next;
      store.set('favorites', state.favorites);
      renderSidebar();
    }
  } else {
    const f = folderById(state.favFolder);
    if (f) {
      f.ids = [...order, ...f.ids.filter((x) => !order.includes(x))];
      saveFolders();
    }
  }
});

// =====================================================================
// 5) Dinleme istatistikleri
// =====================================================================

const stats = (() => {
  const v = store.get('stats', null);
  return v && typeof v === 'object' && v.days ? v : { days: {}, st: {} };
})();
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let statTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(60, Math.round((now - statTick) / 1000));
  statTick = now;
  const s = state.current;
  if (!s || !state.playing || dt <= 0) return;
  const k = dayKey();
  const day = stats.days[k] || (stats.days[k] = {});
  day[s.id] = (day[s.id] || 0) + dt;
  stats.st[s.id] = { id: s.id, name: s.name, url: s.url, favicon: s.favicon || '', homepage: s.homepage || '', tags: (s.tags || []).slice(0, 4), country: s.country || '', hls: !!s.hls };
  // 400 günden eskisini sil.
  const keys = Object.keys(stats.days).sort();
  while (keys.length > 400) delete stats.days[keys.shift()];
  store.set('stats', stats);
  if (state.section === 'stats' && !document.hidden) refreshStatsLive();
}, 15000);

let statRange = 'week';
const RANGES = [['week', 'Son 7 gün'], ['month', 'Son 30 gün'], ['year', 'Son 1 yıl'], ['all', 'Tümü']];

function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h} sa ${m} dk`;
  if (h) return `${h} sa`;
  return `${m} dk`;
}

function statsData() {
  const days = statRange === 'week' ? 7 : statRange === 'month' ? 30 : statRange === 'year' ? 365 : 100000;
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  const fromKey = statRange === 'all' ? '' : dayKey(from);
  const per = new Map();
  let total = 0;
  const daily = new Map();
  for (const [k, day] of Object.entries(stats.days)) {
    if (k < fromKey) continue;
    let sum = 0;
    for (const [id, sec] of Object.entries(day)) {
      per.set(id, (per.get(id) || 0) + sec);
      sum += sec;
    }
    daily.set(k, sum);
    total += sum;
  }
  const top = [...per.entries()].sort((a, b) => b[1] - a[1]);
  return { total, top, daily };
}

function statsHTML() {
  const { total, top, daily } = statsData();
  let html = '<h1 class="page-title">İstatistikler</h1>';
  html += `<div class="chips">${RANGES.map(([id, label]) => `<button class="chip${statRange === id ? ' active' : ''}" type="button" data-action="stat-range" data-range="${id}">${label}</button>`).join('')}</div>`;
  if (!total) {
    return html + emptyHTML(IC.music, 'Henüz istatistik yok', 'Radyo dinledikçe burada ne kadar ve en çok neyi dinlediğin görünecek.');
  }
  const days = new Set([...daily.entries()].filter(([, v]) => v > 0).map(([k]) => k)).size;
  const best = top[0] && (stats.st[top[0][0]] || registry.get(top[0][0]));
  html += `<div class="stat-cards">
    <div class="card stat-card"><span class="stat-k">Toplam dinleme</span><span class="stat-v" id="stat-total">${fmtDur(total)}</span></div>
    <div class="card stat-card"><span class="stat-k">Farklı istasyon</span><span class="stat-v">${top.length}</span></div>
    <div class="card stat-card"><span class="stat-k">Dinlediğin gün</span><span class="stat-v">${days}</span></div>
    <div class="card stat-card"><span class="stat-k">En çok</span><span class="stat-v small">${best ? esc(best.name) : '—'}</span></div>
  </div>`;
  // Son 14 / 30 günün çubuk grafiği.
  const n = statRange === 'week' ? 7 : 30;
  const bars = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const v = (stats.days[k] && Object.values(stats.days[k]).reduce((a, b) => a + b, 0)) || 0;
    bars.push({ k, v, label: n === 7 ? d.toLocaleDateString('tr-TR', { weekday: 'short' }) : String(d.getDate()) });
  }
  const max = Math.max(...bars.map((b) => b.v), 1);
  html += `<section class="card stat-chart"><h2 class="similar-title">Günlük dinleme</h2>
    <div class="bars-chart" style="--n:${n}">${bars.map((b) => `<div class="bc-col" title="${esc(b.k)}: ${fmtDur(b.v)}"><div class="bc-bar" style="height:${Math.max(2, Math.round((b.v / max) * 100))}%"></div><span class="bc-l">${esc(b.label)}</span></div>`).join('')}</div></section>`;
  const topMax = top[0][1];
  html += `<section class="card stat-top"><h2 class="similar-title">En çok dinlediklerin</h2>
    ${top.slice(0, 10).map(([id, sec], i) => {
    const s = registry.get(id) || stats.st[id];
    if (!s) return '';
    if (!registry.get(id) && s.url) register([s]);
    return `<div class="top-row"><span class="top-n">${i + 1}</span>${logoHTML(s, 36, 8)}
        <div class="top-text"><div class="card-name">${esc(s.name)}</div><div class="top-bar"><span style="width:${Math.max(3, Math.round((sec / topMax) * 100))}%"></span></div></div>
        <span class="top-d">${fmtDur(sec)}</span>
        <button class="btn-ghost" type="button" data-action="play" data-id="${esc(id)}">${ICON.play}<span>Dinle</span></button></div>`;
  }).join('')}</section>`;
  return html;
}
function refreshStatsLive() {
  const el = $('#stat-total');
  if (el) el.textContent = fmtDur(statsData().total);
}

chain('sectionHTML', (prev, section) => (section === 'stats' ? statsHTML() : prev(section)));

// =====================================================================
// 6) Açık / koyu tema
// =====================================================================

let themeMode = ['dark', 'light', 'system'].includes(store.get('theme', 'dark')) ? store.get('theme', 'dark') : 'dark';
const mq = window.matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const resolved = themeMode === 'system' ? (mq.matches ? 'light' : 'dark') : themeMode;
  document.documentElement.dataset.theme = resolved;
  EX.setTheme(resolved);
}
mq.addEventListener('change', () => { if (themeMode === 'system') applyTheme(); });
applyTheme();

// Ayarlar penceresine "Görünüm" ve "Discord" bölümleri.
const setForm = $('#settings-form');
const firstGroup = setForm.querySelector('.set-group');
const lookGroup = document.createElement('section');
lookGroup.className = 'set-group';
lookGroup.innerHTML = `<h3>Görünüm</h3>
  <div class="seg theme-seg" role="radiogroup" aria-label="Tema">
    <button type="button" data-theme-mode="dark">Koyu</button>
    <button type="button" data-theme-mode="light">Açık</button>
    <button type="button" data-theme-mode="system">Windows’a uy</button>
  </div>
  <label class="switch-row" id="discord-row">
    <span><strong>Discord’da dinlediğimi göster</strong><em id="discord-note">Discord açıksa profilinde “Radyo dinliyor” ve çalan şarkı görünür.</em></span>
    <input type="checkbox" class="switch" id="set-discord">
  </label>`;
setForm.insertBefore(lookGroup, firstGroup);
function markTheme() {
  for (const b of lookGroup.querySelectorAll('[data-theme-mode]')) {
    const on = b.dataset.themeMode === themeMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('role', 'radio');
  }
}
markTheme();
lookGroup.addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-mode]');
  if (!b) return;
  themeMode = b.dataset.themeMode;
  store.set('theme', themeMode);
  markTheme();
  applyTheme();
});

// =====================================================================
// 7) Discord durumu
// =====================================================================

let discordOn = !!store.get('discord', false);
let discordAvail = false;
let discordKey = '';
let discordStart = Date.now();
let discordStation = '';
EX.discordAvailable().then((ok) => {
  discordAvail = !!ok;
  const sw = $('#set-discord');
  sw.checked = discordOn && discordAvail;
  sw.disabled = !discordAvail;
  if (!discordAvail) $('#discord-note').textContent = 'Discord bağlantısı bu sürümde henüz etkin değil.';
  if (discordOn && discordAvail) { EX.discordEnable(true); updateDiscord(); }
});
$('#set-discord').addEventListener('change', (e) => {
  discordOn = e.target.checked;
  store.set('discord', discordOn);
  EX.discordEnable(discordOn);
  discordKey = '';
  updateDiscord();
});
function updateDiscord() {
  if (!discordOn || !discordAvail) return;
  const s = state.current;
  const on = s && (state.playing || state.buffering);
  if (s && s.id !== discordStation) { discordStation = s.id; discordStart = Date.now(); }
  const title = on && state.nowTitle && isSong(state.nowTitle) ? state.nowTitle : '';
  const key = on ? `${s.id}|${title}` : '';
  if (key === discordKey) return;
  discordKey = key;
  if (!on) { EX.discordSet(null); return; }
  const full = registry.get(s.id) || s;
  EX.discordSet({ name: s.name, title, logo: /^https:\/\//i.test(full.favicon || '') ? full.favicon : '', startedAt: discordStart });
}

// =====================================================================
// 8) Paylaşma ve radyo:// bağlantıları
// =====================================================================

function shareLink(s) {
  const q = new URLSearchParams({ ad: s.name });
  if (isCustom(s) || !/^[0-9a-f-]{8,64}$/i.test(s.id)) q.set('u', s.url);
  return `radyo://istasyon/${encodeURIComponent(s.id)}?${q.toString()}`;
}

async function share(s) {
  const lines = [`🎧 ${s.name}${state.nowTitle && isCurrent(s.id) && isSong(state.nowTitle) ? ` — şimdi: ${state.nowTitle}` : ''}`,
    `Radyo uygulamasında aç: ${shareLink(s)}`];
  if (s.homepage) lines.push(`Sitesi: ${s.homepage}`);
  lines.push(`Yayın adresi: ${s.url}`);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('Paylaşım bağlantısı kopyalandı. WhatsApp ya da e-postaya yapıştırabilirsin.', { ms: 3500 });
  } catch {
    toast('Panoya kopyalanamadı.', { ms: 3000, error: true });
  }
}

chain('infoExtra', (prev, s) => `${prev(s) || ''}<div class="info-row share-row"><span>Paylaş</span><span></span>
  <button class="btn-ghost" type="button" data-action="share" data-id="${esc(s.id)}" title="Bu istasyonun bağlantısını kopyala">${IC.share}<span>Bağlantıyı kopyala</span></button></div>`);

async function openLink(link) {
  if (!link || !link.id) return;
  let s = registry.get(link.id);
  if (!s) s = await EX.byUuid(link.id).catch(() => null);
  if (!s && link.url) s = { id: `link-${link.id}`, name: link.name || 'Paylaşılan radyo', url: link.url, favicon: '', country: '', codec: '', bitrate: 0, tags: [], hls: /\.m3u8(\?|$)/i.test(link.url), clicks: 0 };
  if (!s) { toast('Paylaşılan radyo bulunamadı.', { ms: 4000, error: true }); return; }
  register([s]);
  if (state.section !== 'discover') selectSection('discover');
  play(s);
  toast(`Paylaşılan radyo açıldı: ${s.name}`, { ms: 3500 });
}
EX.onLink(openLink);
EX.pendingLink().then(openLink).catch(() => {});

// =====================================================================
// Ortak tıklamalar
// =====================================================================

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'song-open':
      if (/^https:\/\//.test(el.dataset.href || '')) AS.openExternal(el.dataset.href);
      break;
    case 'share': {
      const s = registry.get(el.dataset.id);
      if (s) share(s);
      break;
    }
    case 'fold-select':
      state.favFolder = el.dataset.folder || 'all';
      renderContent();
      break;
    case 'fold-new':
      await newFolder(null);
      break;
    case 'fold-menu':
      if (popOwner === `fold:${el.dataset.id}`) { closePop(); break; }
      pop.classList.remove('eq-pop');
      openPop(el, folderMenuHTML(el.dataset.id), `fold:${el.dataset.id}`);
      break;
    case 'fold-rename': {
      const f = folderById(el.dataset.folder);
      if (!f) break;
      const name = await askName('Klasörü yeniden adlandır', f.name);
      if (name) { f.name = name.slice(0, 40); state.favFolders = [...state.favFolders]; saveFolders(); renderContent(); }
      break;
    }
    case 'fold-delete':
      state.favFolders = state.favFolders.filter((f) => f.id !== el.dataset.folder);
      saveFolders();
      state.favFolder = 'all';
      renderContent();
      toast('Klasör silindi. İçindeki istasyonlar favorilerinde duruyor.', { ms: 3500 });
      break;
    case 'stat-range':
      statRange = el.dataset.range;
      renderContent();
      break;
    default:
      break;
  }
});

// Ana dosyadaki listede olmayan istasyonlar için çalma: istatistiklerdeki eski istasyonlar.
register(Object.values(stats.st).filter((s) => s && s.id && /^https?:\/\//i.test(s.url || '')).filter((s) => !registry.get(s.id)));
