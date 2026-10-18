'use strict';

/* Radyo — arayüz ve oynatıcı.
   İstasyon verisi ana süreçten (main.js) window.radio köprüsüyle gelir. */

const api = window.radio;
/** features.js'nin doldurduğu bağlantı noktaları. */
const hooks = {};
const hook = (name, ...args) => (typeof hooks[name] === 'function' ? hooks[name](...args) : undefined);

/* Kategoriler istasyonun etiketlerinde ve adında aranan kelimelerle çalışır
   (Türkçe karakterler ve büyük/küçük harf fark etmez). */
const CATEGORIES = [
  { label: 'Tümü', keys: null },
  { label: 'Pop', keys: ['pop'] },
  { label: 'Haber', keys: ['news', 'haber', 'talk', 'gundem'] },
  { label: 'Türkü', keys: ['turku', 'halk', 'folk', 'thm', 'anadolu'] },
  { label: 'Arabesk', keys: ['arabesk', 'arabesque', 'fantezi'] },
  { label: 'Türk Sanat', keys: ['sanat', 'tsm', 'turkish classical', 'fasil'] },
  { label: 'Rock', keys: ['rock', 'metal', 'alternative'] },
  { label: 'Caz', keys: ['jazz', 'caz', 'blues'] },
  { label: 'Klasik', keys: ['classical', 'klasik muzik', 'senfoni', 'symphon'] },
  { label: 'Dini', keys: ['islam', 'dini', 'religio', 'ilahi', 'kuran', 'quran'] },
  { label: 'Spor', keys: ['sport', 'spor'] },
  { label: 'Eklediklerim', custom: true },
];
const PAGE = 60;
const TINTS = ['#F2A541', '#A897F0', '#E8735C', '#4FB3A9', '#D9C7A3'];
const PLAY_ERROR = 'Bu yayın şu an açılamadı. Başka bir istasyon dene.';

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  heart: '<svg class="off-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  heartOn: '<svg class="on-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l9-4"/><circle cx="15" cy="14" r="2.5"/><path d="M7 12h3M7 16h3"/></svg>',
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.5 5.1"/><path d="M5 12.5a10 10 0 0 1 3.4-2M19 12.5a10 10 0 0 0-3-1.8"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M3 3l18 18"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
  volHigh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M19 5.5a9 9 0 0 1 0 13"/></svg>',
  volLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/></svg>',
  volOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  eq: '<svg class="eq" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 10v4M10 6v12M14 9v6M18 7v10"/></svg>',
};

// ---------- Saklama (bu bilgisayarda kalır) ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* yer kalmadıysa sessizce geç */
    }
  },
};

// ---------- Durum ----------

const state = {
  section: 'discover',
  categoryIndex: 0,
  query: '',
  sort: store.get('sort', 'popular') === 'az' ? 'az' : 'popular',
  all: [],              // Türkiye'nin tüm istasyonları
  updatedAt: null,
  stale: false,         // internet yok, eski liste gösteriliyor
  loading: false,
  loadError: null,
  shown: PAGE,          // ızgarada şu an gösterilen kart sayısı
  world: { query: '', loading: false, error: null, results: null },
  dunya: {
    mode: store.get('dunyaMode', 'lang') === 'country' ? 'country' : 'lang',
    lang: store.get('dunyaLang', null),
    country: store.get('dunyaCountry', null),
    languages: [],
    countries: [],
    listsLoading: false,
    listsError: null,
    filter: '',
    key: '',
    stations: [],
    loading: false,
    error: null,
    sub: 'Tümü',   // dile göre: ülke kodu, ülkeye göre: dil adı
  },
  custom: asArray(store.get('custom', [])).filter((s) => s && s.id && s.url),
  favorites: asArray(store.get('favorites', [])),
  recent: asArray(store.get('recent', [])).filter((e) => e && e.station && e.station.id),
  current: null,
  playing: false,
  buffering: false,
  playError: null,
  volume: clamp(Number(store.get('volume', 70)), 0, 100),
  lastVolume: 70,
  sleepAt: null,
  nowTitle: '',
  city: store.get('city', ''),
  retry: 0,            // yeniden bağlanma denemesi
  everPlayed: false,    // bu istasyon bu oturumda en az bir kez çaldı mı
};

/** id -> istasyon; tıklamalarda istasyonu bulmak için. */
const registry = new Map();
/** id -> aramada kullanılan sadeleştirilmiş metin. */
const hayCache = new Map();
/** Keşfet'te o an süzülmüş liste (sayfa sayfa yükleme bunu kullanır). */
let view = [];
let requestId = 0;
let searchTimer = null;
let worldTimer = null;
let sleepTimer = null;
let sleepTick = null;
let hls = null;

const audio = new Audio();
// Ekolayzır ve ses dengeleme için (yayınlara uygulama CORS izni ekler).
audio.crossOrigin = 'anonymous';
audio.preload = 'none';
applyVolume();

register(state.custom);
register(state.favorites);
register(state.recent.map((e) => e.station));

// ---------- Yardımcılar ----------

const $ = (sel, root = document) => root.querySelector(sel);

function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function clamp(v, min, max) {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
/** "Türkü FM" -> "turku fm": aramada Türkçe harf ve büyük/küçük farkını kaldırır. */
function norm(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
function hay(s) {
  let h = hayCache.get(s.id);
  if (h === undefined) {
    h = norm(`${s.name} ${(s.tags || []).join(' ')}`);
    hayCache.set(s.id, h);
  }
  return h;
}
function register(list) {
  for (const s of list) if (s && s.id) registry.set(s.id, s);
}
function tintFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
function initials(name) {
  const words = String(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('tr');
  return (words[0][0] + words[1][0]).toLocaleUpperCase('tr');
}
function subtitle(s) {
  if (s.tags && s.tags.length) return s.tags.slice(0, 3).join(' · ');
  return s.country || 'Canlı yayın';
}
function quality(s) {
  const parts = [];
  if (s.codec) parts.push(s.codec.toUpperCase());
  if (s.bitrate > 0) parts.push(`${s.bitrate} kbps`);
  return parts.length ? parts.join(' · ') : 'Canlı';
}
function timeAgo(when) {
  const t = new Date(when);
  const min = Math.floor((Date.now() - t.getTime()) / 60000);
  if (!Number.isFinite(min) || min < 1) return 'Az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Dün';
  if (d < 7) return `${d} gün önce`;
  return t.toLocaleDateString('tr-TR');
}
const fmtCount = (n) => n.toLocaleString('tr-TR');
function cleanError(err) {
  return String((err && err.message) || err).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}
const isFav = (id) => state.favorites.some((f) => f.id === id);
const isCurrent = (id) => !!state.current && state.current.id === id;
const isCustom = (s) => String(s.id).startsWith('custom-');
const featured = () => state.current || view[0] || state.all[0] || null;

// ---------- Dil ve ülke adları (Türkçe) ----------

function displayNames(locale, type) {
  try {
    return new Intl.DisplayNames([locale], { type });
  } catch {
    return null;
  }
}
const DN_LANG = displayNames('tr', 'language');
const DN_REGION = displayNames('tr', 'region');
const capitalize = (s) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);

function langLabelOf(l) {
  let n = '';
  try { if (l.code && DN_LANG) n = DN_LANG.of(l.code); } catch { /* bilinmeyen kod */ }
  if (!n || n.toLowerCase() === l.code) n = l.name;
  return capitalize(n);
}
function langNativeOf(l) {
  if (!l.code) return '';
  try {
    const n = new Intl.DisplayNames([l.code], { type: 'language' }).of(l.code);
    return n && n.toLowerCase() !== l.code ? capitalize(n) : '';
  } catch {
    return '';
  }
}
function countryName(code) {
  try {
    return (DN_REGION && DN_REGION.of(code)) || code;
  } catch {
    return code;
  }
}
const langKeys = (s) => String(s.language || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
function langName(name) {
  const l = state.dunya.languages.find((x) => x.name === name);
  return l ? l.label : capitalize(name);
}

/** Seçili kategori, arama ve sıralamaya göre Türkiye listesi (Dünya'da seçili dil/ülke listesi). */
function filtered() {
  if (state.section === 'world') return filteredWorld();
  const cat = CATEGORIES[state.categoryIndex] || CATEGORIES[0];
  let list = cat.custom ? state.custom : state.custom.concat(state.all);
  if (cat.keys) list = list.filter((s) => cat.keys.some((k) => hay(s).includes(k)));
  if (state.city) list = list.filter((s) => hook('cityOf', s) === state.city);
  const words = norm(state.query).split(/\s+/).filter(Boolean);
  if (words.length) list = list.filter((s) => words.every((w) => hay(s).includes(w)));
  if (state.sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return list;
}

function filteredWorld() {
  const d = state.dunya;
  let list = d.stations;
  if (d.sub !== 'Tümü') {
    list = d.mode === 'lang' ? list.filter((s) => s.country === d.sub) : list.filter((s) => langKeys(s).includes(d.sub));
  }
  const words = norm(state.query).split(/\s+/).filter(Boolean);
  if (words.length) list = list.filter((s) => words.every((w) => hay(s).includes(w)));
  if (state.sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return list;
}

// ---------- HTML parçaları ----------

/** Sırayla denenecek logo adresleri: istasyonun logosu, sonra sitesinin (yüksek çözünürlüklü) simgesi. */
const proxied = (u) => `radyo-logo://img/?u=${encodeURIComponent(u)}`;
function logoSources(s) {
  const full = registry.get(s.id) || s; // eski kayıtlarda en güncel bilgiyi kullan
  const list = [];
  const fav = full.favicon || s.favicon || '';
  if (/^https?:\/\//i.test(fav)) list.push(proxied(fav));
  const home = full.homepage || s.homepage || '';
  try {
    const host = /^https?:\/\//i.test(home) ? new URL(home).hostname : '';
    if (host && host.includes('.')) {
      list.push(proxied(`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=${encodeURIComponent(`https://${host}`)}&size=256`));
    }
  } catch {
    /* geçersiz site adresi */
  }
  return list;
}

// ---------- Logo kutucukları ----------
// Logolar farklı boyut ve biçimlerde gelir (küçük simge, geniş yazı, şeffaf PNG...).
// Her biri tuvale çizilip tek tip kare bir kutucuğa dönüştürülür: logonun kendi arka plan
// rengi bulunur, boş kenarlar kırpılır ve logo ortalanır.

const tiles = new Map();       // kaynak adresi -> kutucuk (data: adresi) ya da false
const stationTile = new Map(); // istasyon -> kutucuk
const TILE = 168;

function tileFor(s) {
  if (!s) return '';
  const t = stationTile.get(s.id);
  if (t) return t;
  for (const src of logoSources(s)) {
    const v = tiles.get(src);
    if (v) return v;
    if (v !== false) break;
  }
  return '';
}

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function buildTile(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  // Çözümleme için küçük bir kopya.
  const k = Math.min(1, 128 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k));
  const ch = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, cw, ch);
  const px = x.getImageData(0, 0, cw, ch).data;
  const at = (i, j) => (j * cw + i) * 4;

  // Kenar pikselleri: şeffaf mı, tek renk mi?
  let n = 0; let clear = 0; let r = 0; let g = 0; let b = 0;
  const edge = [];
  const take = (i, j) => {
    const o = at(i, j);
    n++;
    if (px[o + 3] < 40) { clear++; return; }
    r += px[o]; g += px[o + 1]; b += px[o + 2];
    edge.push(o);
  };
  for (let i = 0; i < cw; i++) { take(i, 0); take(i, ch - 1); }
  for (let j = 1; j < ch - 1; j++) { take(0, j); take(cw - 1, j); }
  const transparent = clear / n > 0.35;
  const solid = edge.length || 1;
  r /= solid; g /= solid; b /= solid;
  let dev = 0;
  for (const o of edge) dev += Math.abs(px[o] - r) + Math.abs(px[o + 1] - g) + Math.abs(px[o + 2] - b);
  dev /= solid * 3;
  const uniform = !transparent && dev < 14;

  // Kenarları dolu ve karışık (fotoğraf ya da hazır kare logo): kareye kırpıp tam doldur.
  const out = document.createElement('canvas');
  out.width = TILE; out.height = TILE;
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  if (!transparent && !uniform && Math.abs(w / h - 1) < 0.3) {
    const side = Math.min(w, h);
    o.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, TILE, TILE);
    return out.toDataURL('image/webp', 0.92);
  }

  // Arka plan rengi.
  let bg;
  if (transparent) {
    let lr = 0; let cnt = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 120) { lr += lum(px[i], px[i + 1], px[i + 2]); cnt++; }
    const light = cnt && lr / cnt > 0.82; // beyaz logo: koyu zemin
    bg = light ? [32, 36, 48] : [255, 255, 255];
  } else {
    bg = [r, g, b].map(Math.round);
  }

  // Logonun kapladığı alan (arka plandan farklı pikseller).
  let x0 = cw; let y0 = ch; let x1 = -1; let y1 = -1;
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const q = at(i, j);
      const a = px[q + 3];
      const differs = transparent
        ? a > 30
        : a > 30 && (Math.abs(px[q] - bg[0]) + Math.abs(px[q + 1] - bg[1]) + Math.abs(px[q + 2] - bg[2])) > 42;
      if (differs) {
        if (i < x0) x0 = i; if (i > x1) x1 = i;
        if (j < y0) y0 = j; if (j > y1) y1 = j;
      }
    }
  }
  if (x1 < 0) return null; // boş görüntü
  const sx = x0 / k; const sy = y0 / k;
  const sw = (x1 - x0 + 1) / k; const sh = (y1 - y0 + 1) / k;

  o.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  o.fillRect(0, 0, TILE, TILE);
  // Geniş yazı logoları yana doğru daha çok yer kaplayabilir.
  const wide = sw / sh > 1.8;
  const bw = TILE * (wide ? 0.86 : 0.76);
  const bh = TILE * (wide ? 0.6 : 0.76);
  // Küçük simgeler fazla büyütülürse bulanıklaşır.
  const scale = Math.min(bw / sw, bh / sh, Math.max(3, 96 / Math.max(sw, sh)));
  const dw = sw * scale; const dh = sh * scale;
  o.drawImage(img, sx, sy, sw, sh, (TILE - dw) / 2, (TILE - dh) / 2, dw, dh);
  return out.toDataURL('image/webp', 0.92);
}

function logoHTML(s, size = 48, radius = 10) {
  const fallback = `<span class="logo-fallback" style="--tint:${tintFor(s.id)};font-size:${Math.round(size * 0.36)}px">${esc(initials(s.name))}</span>`;
  const ready = tileFor(s);
  let img = '';
  if (ready) {
    img = `<img class="tiled" src="${esc(ready)}" alt="" draggable="false">`;
  } else {
    const list = logoSources(s).filter((u) => tiles.get(u) !== false);
    const [first, ...rest] = list;
    if (first) img = `<img src="${esc(first)}" data-sid="${esc(s.id)}" data-next="${esc(rest.join(' '))}" alt="" loading="lazy" crossorigin="anonymous" draggable="false">`;
  }
  return `<span class="logo" style="width:${size}px;height:${size}px;border-radius:${radius}px">${fallback}${img}</span>`;
}

/** Logo açılmazsa ya da çok küçükse sıradakini dene; hiçbiri olmazsa baş harfler kalsın. */
function nextLogo(img) {
  const rest = (img.dataset.next || '').split(' ').filter(Boolean);
  if (!rest.length) {
    // Daha iyisi bulunamadı: elde küçük bir simge varsa onu kullan.
    if (img.dataset.backup) {
      const b = img.dataset.backup;
      delete img.dataset.backup;
      img.dataset.accept = '1';
      img.src = b;
      return;
    }
    img.remove();
    return;
  }
  img.dataset.next = rest.slice(1).join(' ');
  img.src = rest[0];
}

function onLogoLoad(img) {
  if (img.classList.contains('tiled')) return;
  const src = img.getAttribute('src');
  // Çok küçük simgeler: önce daha iyisini dene.
  if (img.naturalWidth < 40 && !img.dataset.accept) {
    if (img.naturalWidth >= 16 && !img.dataset.backup) img.dataset.backup = src;
    if (img.naturalWidth < 16) tiles.set(src, false);
    nextLogo(img);
    return;
  }
  let tile = tiles.get(src);
  if (!tile) {
    try {
      tile = buildTile(img);
    } catch {
      tile = null;
    }
    if (!tile) { tiles.set(src, false); nextLogo(img); return; }
    tiles.set(src, tile);
  }
  if (img.dataset.sid) stationTile.set(img.dataset.sid, tile);
  img.classList.add('tiled');
  img.src = tile;
}

function favHTML(s) {
  const on = isFav(s.id);
  return `<button class="icon-btn fav${on ? ' on' : ''}" type="button" data-action="fav" data-id="${esc(s.id)}"
    aria-pressed="${on}" aria-label="${on ? 'Favorilerden çıkar' : 'Favorilere ekle'}" title="${on ? 'Favorilerden çıkar' : 'Favorilere ekle'}">${ICON.heart}${ICON.heartOn}</button>`;
}

function emptyHTML(icon, title, message, action = '') {
  return `<div class="empty">${icon}<h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}${action}</div>`;
}

const BAR_HEIGHTS = Array.from({ length: 48 }, (_, i) => 20 + ((i * 37) % 11) * 7 + (i % 3) * 4);

function heroHTML(s) {
  const current = isCurrent(s.id);
  const playing = current && state.playing;
  const bars = BAR_HEIGHTS.map((h, i) => `<span style="--h:${Math.min(h, 100)}%;--d:${-((i * 0.137) % 1.1).toFixed(2)}s"></span>`).join('');
  let action;
  if (current && state.buffering) action = '<span class="spinner" role="status" aria-label="Bağlanıyor"></span>';
  else action = `<button class="pill" type="button" data-action="play" data-id="${esc(s.id)}">${playing ? ICON.pause : ICON.play}<span>${playing ? 'Duraklat' : 'Dinle'}</span></button>`;

  const info = [
    ['Ülke', s.country || '—'],
    ['Format', s.codec ? s.codec.toUpperCase() : '—'],
    ['Kalite', s.bitrate > 0 ? `${s.bitrate} kbps` : '—'],
  ].map(([k, v]) => `<div class="info-row"><span>${k}</span><span>${esc(v)}</span></div>`).join('');
  const tags = s.tags && s.tags.length
    ? `<div class="tags">${s.tags.slice(0, 6).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
    : '';

  return `<section class="hero-row" id="hero" aria-label="Öne çıkan istasyon">
    <div class="card hero">
      <div class="hero-top">
        <span class="live">${current ? 'ŞU AN ÇALIYOR' : 'EN ÇOK DİNLENEN'}</span>
        <span class="mono">${esc(quality(s))}</span>
      </div>
      <div class="bars${playing ? ' on' : ''}" aria-hidden="true">${bars}</div>
      <div class="hero-bottom">
        ${logoHTML(s, 64, 14)}
        <div class="hero-text">
          <div class="hero-name">${esc(s.name)}</div>
          <div class="hero-sub">${esc(subtitle(s))}</div>
          ${current && state.nowTitle ? `<div class="hero-song" title="${esc(state.nowTitle)}">♪ ${esc(state.nowTitle)}</div>` : ''}
        </div>
        ${favHTML(s)}
        ${action}
      </div>
    </div>
    <div class="card info">
      <h2>İstasyon bilgisi</h2>
      ${info}
      ${hook('infoExtra', s) || ''}
      ${tags}
    </div>
  </section>${hook('afterHero', s) || ''}`;
}

function cardHTML(s) {
  const cls = isCurrent(s.id) ? ` current${state.playing ? ' is-playing' : ''}` : '';
  const own = isCustom(s);
  const remove = own
    ? `<button class="icon-btn remove" type="button" data-action="remove-custom" data-id="${esc(s.id)}" aria-label="${esc(s.name)} istasyonunu sil" title="Sil">${ICON.trash}</button>`
    : '';
  return `<article class="station-card${cls}" data-card="${esc(s.id)}">
    <button class="card-hit" type="button" data-action="play" data-id="${esc(s.id)}" aria-label="${esc(s.name)} dinle"></button>
    <div class="card-top">
      <span class="logo-wrap">${logoHTML(s, 56, 12)}<span class="logo-overlay">${ICON.play.replace('<svg', '<svg class="i-play"')}${ICON.pause.replace('<svg', '<svg class="i-pause"')}</span></span>
      <span class="card-actions">${remove}${favHTML(s)}</span>
    </div>
    <div class="card-bottom">
      <div class="card-name">${esc(s.name)}</div>
      <div class="card-sub">${esc(subtitle(s))}</div>
      <div class="card-q">${s.country && s.country !== 'TR' ? `<span class="cc-badge" title="${esc(countryName(s.country))}">${esc(s.country)}</span>` : ''}${esc(quality(s))}${own ? '<span class="own-badge">EKLEDİĞİN</span>' : ''}</div>
    </div>
  </article>`;
}

function recentRowHTML(e) {
  const s = e.station;
  const cls = isCurrent(s.id) ? ' current' : '';
  return `<div class="recent-row${cls}" data-card="${esc(s.id)}">
    <button class="card-hit" type="button" data-action="play" data-id="${esc(s.id)}" aria-label="${esc(s.name)} dinle"></button>
    ${logoHTML(s, 44)}
    <div class="recent-text">
      <div class="card-name">${esc(s.name)}</div>
      <div class="card-sub">${esc(subtitle(s))}</div>
    </div>
    <span class="mono">${esc(timeAgo(e.at))}</span>
    ${favHTML(s)}
  </div>`;
}

function moreHTML() {
  const left = view.length - state.shown;
  if (left <= 0) return '';
  return `<div class="more" id="more"><button class="btn-ghost" type="button" data-action="more">Daha fazla göster · ${fmtCount(left)} istasyon daha</button></div>`;
}

// ---------- Ekranı çizme ----------

function renderContent() {
  const el = $('#content');
  const scroll = el.scrollTop;
  if (state.section === 'favorites') el.innerHTML = favoritesHTML();
  else if (state.section === 'recent') el.innerHTML = recentHTML();
  else if (state.section === 'world') el.innerHTML = dunyaHTML();
  else if (state.section === 'recordings') el.innerHTML = recordingsHTML() + (hook('recordingsExtra') || '');
  else if (hook('sectionHTML', state.section) !== undefined) el.innerHTML = hook('sectionHTML', state.section);
  else el.innerHTML = discoverHTML();
  el.scrollTop = scroll;
  fillScreen();
}

function updatedText() {
  if (!state.updatedAt) return '';
  const d = new Date(state.updatedAt);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return today ? `bugün ${time}` : `${d.toLocaleDateString('tr-TR')} ${time}`;
}

function listBarHTML() {
  const refreshing = state.loading && state.all.length;
  const status = state.stale
    ? '<span class="warn">İnternete bağlanılamadı, son indirilen liste gösteriliyor</span>'
    : state.updatedAt ? `<span>Liste güncellendi: ${esc(updatedText())}</span>` : '';
  return `<div class="list-bar">
    <span class="count">${fmtCount(view.length)} istasyon</span>
    ${status}
    <span class="spacer"></span>
    ${hook('listBarExtra') || ''}
    <label><span class="sr-only">Sıralama</span>
      <select class="select" id="sort">
        <option value="popular"${state.sort === 'popular' ? ' selected' : ''}>En çok dinlenen</option>
        <option value="az"${state.sort === 'az' ? ' selected' : ''}>A’dan Z’ye</option>
      </select>
    </label>
    <button class="btn-ghost" type="button" data-action="refresh" title="Listeyi Radio Browser’dan yeniden indir"${refreshing ? ' disabled' : ''}>
      ${refreshing ? '<span class="spinner"></span>' : ICON.refresh}<span>Yenile</span></button>
    <button class="btn-ghost accent" type="button" data-action="add-open">${ICON.plus}<span>İstasyon ekle</span></button>
  </div>`;
}

function worldHTML() {
  const w = state.world;
  let html = `<h2 class="section-title">${ICON.globe.replace('<svg', '<svg width="20" height="20"')}Dünyadan sonuçlar</h2>`;
  if (w.query !== state.query || (!w.loading && !w.results && !w.error)) {
    html += `<div class="world-box"><p>Türkiye listesinin dışında, tüm dünyadaki radyolarda da “${esc(state.query)}” aranabilir.</p>
      <button class="btn-ghost accent" type="button" data-action="world">${ICON.search}<span>Tüm dünyada ara</span></button></div>`;
  } else if (w.loading) {
    html += '<div class="loading"><span class="spinner" role="status" aria-label="Aranıyor"></span></div>';
  } else if (w.error) {
    html += emptyHTML(ICON.offline, 'Arama yapılamadı', w.error,
      `<button class="pill" type="button" data-action="world">${ICON.refresh}<span>Tekrar dene</span></button>`);
  } else if (!w.results.length) {
    html += '<p class="dialog-note">Yurt dışında da bu isimde bir istasyon bulunamadı.</p>';
  } else {
    html += `<div class="grid">${w.results.map(cardHTML).join('')}</div>`;
  }
  if (!w.loading) {
    html += `<div class="world-box add-hint"><p>Aradığın radyo yok mu? Yayın adresini (örn. …/playlist.m3u8 ya da …:8000/stream) biliyorsan kendin ekleyebilirsin.</p>
      <button class="btn-ghost accent" type="button" data-action="add-open">${ICON.plus}<span>Yayın adresiyle ekle</span></button></div>`;
  }
  return html;
}

function discoverHTML() {
  const searching = !!state.query;
  const haveList = state.all.length > 0 || state.custom.length > 0;
  view = filtered();
  state.shown = Math.min(Math.max(state.shown, PAGE), Math.max(view.length, PAGE));

  let html = `<h1 class="page-title">${searching ? `“${esc(state.query)}” için sonuçlar` : 'Keşfet'}</h1>`;
  const f = featured();
  if (!searching && f && haveList) html += heroHTML(f);

  html += `<div class="chips" role="group" aria-label="Kategoriler">${CATEGORIES.map((c, i) => {
    if (c.custom && !state.custom.length) return '';
    const active = i === state.categoryIndex;
    return `<button class="chip${active ? ' active' : ''}" type="button" data-action="category" data-index="${i}" aria-pressed="${active}">${esc(c.label)}</button>`;
  }).join('')}</div>`;

  if (state.loading && !haveList) {
    html += '<div class="loading"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div>'
      + '<p class="dialog-note" style="text-align:center">Türkiye’deki tüm istasyonlar indiriliyor, ilk açılışta biraz sürebilir…</p>';
    return html;
  }
  if (state.loadError && !haveList) {
    html += emptyHTML(ICON.offline, 'İstasyonlar yüklenemedi', state.loadError,
      `<button class="pill" type="button" data-action="retry">${ICON.refresh}<span>Tekrar dene</span></button>`);
    return html;
  }

  html += listBarHTML();
  if (!view.length) {
    html += searching
      ? emptyHTML(ICON.search, 'Türkiye listesinde bulunamadı', 'Aşağıda tüm dünyadaki sonuçlar var. Orada da yoksa yayın adresiyle kendin ekleyebilirsin.',
        `<button class="pill" type="button" data-action="add-open">${ICON.plus}<span>Yayın adresiyle ekle</span></button>`)
      : emptyHTML(ICON.radio, 'Bu kategoride istasyon yok', 'Başka bir kategori seç.');
  } else {
    html += `<div class="grid" id="main-grid">${view.slice(0, state.shown).map(cardHTML).join('')}</div>${moreHTML()}`;
  }
  if (searching) html += worldHTML();
  return html;
}

function dunyaHTML() {
  const d = state.dunya;
  const byLang = d.mode === 'lang';
  const selected = byLang ? d.lang : d.country;
  let kicker;
  let title;
  let subtitle;
  if (byLang) {
    const l = d.languages.find((x) => x.name === d.lang);
    kicker = 'DİLE GÖRE';
    title = d.lang ? `${l ? l.label : capitalize(d.lang)} yayın yapan radyolar` : 'Dünya radyoları';
    subtitle = l && l.native && l.native !== l.label ? `${l.native} · ülkeye göre daraltabilirsin` : 'Ülkeye göre daraltabilirsin';
  } else {
    kicker = 'ÜLKEYE GÖRE';
    title = d.country ? `${countryName(d.country)} radyoları` : 'Dünya radyoları';
    subtitle = 'Dile göre daraltabilirsin';
  }
  if (state.query) subtitle = `“${state.query}” araması uygulanıyor`;

  let html = `<div class="world-head"><span class="kicker">${kicker}</span>
    <h1 class="page-title">${esc(title)}</h1><p class="world-sub" dir="auto">${esc(subtitle)}</p></div>`;

  if (!selected) {
    if (d.listsLoading) return `${html}<div class="loading"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div>`;
    if (d.listsError) {
      return html + emptyHTML(ICON.offline, 'Dünya listesi yüklenemedi', d.listsError,
        `<button class="pill" type="button" data-action="dunya-lists-retry">${ICON.refresh}<span>Tekrar dene</span></button>`);
    }
    return html + emptyHTML(ICON.globe.replace('<svg', '<svg width="40" height="40"'), byLang ? 'Soldan bir dil seç' : 'Soldan bir ülke seç', '');
  }
  if (d.loading) {
    return `${html}<div class="loading"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div>
      <p class="dialog-note" style="text-align:center">İstasyonlar indiriliyor…</p>`;
  }
  if (d.error) {
    return html + emptyHTML(ICON.offline, 'İstasyonlar yüklenemedi', d.error,
      `<button class="pill" type="button" data-action="dunya-retry">${ICON.refresh}<span>Tekrar dene</span></button>`);
  }

  // Daraltma düğmeleri: dile göre → ülkeler, ülkeye göre → diller (gerçek sayılarla).
  const groups = new Map();
  for (const s of d.stations) {
    const keys = byLang ? [s.country] : langKeys(s);
    for (const k of keys) if (k) groups.set(k, (groups.get(k) || 0) + 1);
  }
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (d.sub !== 'Tümü' && !groups.has(d.sub)) d.sub = 'Tümü';
  if (top.length > 1) {
    const chip = (key, label, n) => {
      const on = d.sub === key;
      return `<button class="chip${on ? ' active' : ''}" type="button" data-action="dunya-sub" data-sub="${esc(key)}" aria-pressed="${on}">${esc(label)}${n != null ? `<span class="chip-n">${fmtCount(n)}</span>` : ''}</button>`;
    };
    html += `<div class="chips" role="group" aria-label="${byLang ? 'Ülkeler' : 'Diller'}">${chip('Tümü', 'Tümü', null)}${top.map(([k, n]) => chip(k, byLang ? countryName(k) : langName(k), n)).join('')}</div>`;
  }

  view = filtered();
  state.shown = Math.min(Math.max(state.shown, PAGE), Math.max(view.length, PAGE));
  html += `<div class="list-bar">
    <span class="count">${fmtCount(view.length)} istasyon</span>
    <span class="spacer"></span>
    <label><span class="sr-only">Sıralama</span>
      <select class="select" id="sort">
        <option value="popular"${state.sort === 'popular' ? ' selected' : ''}>En çok dinlenen</option>
        <option value="az"${state.sort === 'az' ? ' selected' : ''}>A’dan Z’ye</option>
      </select>
    </label>
  </div>`;
  if (!view.length) {
    html += state.query
      ? emptyHTML(ICON.search, 'Bu listede bulunamadı', 'Başka bir isimle dene ya da aramayı temizle.')
      : emptyHTML(ICON.radio, 'Burada istasyon yok', 'Soldan başka bir seçim yap.');
  } else {
    html += `<div class="grid" id="main-grid">${view.slice(0, state.shown).map(cardHTML).join('')}</div>${moreHTML()}`;
  }
  return html;
}

function favoritesHTML() {
  const custom = hook('favoritesHTML');
  if (custom !== undefined) return custom;
  let html = '<h1 class="page-title">Favoriler</h1>';
  if (!state.favorites.length) {
    html += emptyHTML(ICON.heart.replace('class="off-icon" ', ''), 'Henüz favorin yok',
      'Keşfet’te beğendiğin istasyonun kalbine bas, burada toplansın.');
  } else {
    html += `<div class="grid">${state.favorites.map(cardHTML).join('')}</div>`;
  }
  return html;
}

function recentHTML() {
  let html = '<h1 class="page-title">Son dinlenenler</h1>';
  if (!state.recent.length) {
    html += emptyHTML(ICON.history, 'Henüz bir şey dinlemedin', 'Dinlediğin istasyonlar burada sırayla görünür.');
  } else {
    html += `<div>${state.recent.map(recentRowHTML).join('')}</div>`;
  }
  return html;
}

/** Sonraki 60 kartı mevcut ızgaranın sonuna ekler (sayfa yeniden çizilmez). */
function showMore() {
  const grid = $('#main-grid');
  if (!grid || state.shown >= view.length) return;
  const from = state.shown;
  state.shown = Math.min(view.length, state.shown + PAGE);
  grid.insertAdjacentHTML('beforeend', view.slice(from, state.shown).map(cardHTML).join(''));
  const more = $('#more');
  if (more) more.outerHTML = moreHTML();
}

/** Aşağı yaklaşınca ya da ekran boş kalınca otomatik olarak devamını yükler. */
function fillScreen() {
  const el = $('#content');
  let guard = 0;
  while ((state.section === 'discover' || state.section === 'world') && $('#more') && el.scrollTop + el.clientHeight > el.scrollHeight - 600 && guard++ < 20) {
    showMore();
  }
}

function renderHero() {
  const hero = $('#hero');
  const f = featured();
  if (!hero || !f) return;
  const similar = $('#similar');
  if (similar) similar.remove();
  hero.outerHTML = heroHTML(f);
}

function renderSidebar() {
  for (const btn of document.querySelectorAll('.nav-item')) {
    const active = btn.dataset.section === state.section;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  $('#fav-count').textContent = state.favorites.length ? String(state.favorites.length) : '';

  const inWorld = state.section === 'world';
  $('#side-world').hidden = !inWorld;
  $('#side-default').hidden = inWorld;

  const list = $('#side-favs');
  if (!state.favorites.length) {
    list.innerHTML = '<p class="side-empty">Bir istasyonun kalbine bastığında burada görünür.</p>';
    return;
  }
  list.innerHTML = state.favorites.map((s) => {
    const cls = isCurrent(s.id) ? ` current${state.playing ? ' is-playing' : ''}` : '';
    return `<button class="side-fav${cls}" type="button" data-action="play" data-id="${esc(s.id)}" title="${esc(s.name)}">
      ${logoHTML(s, 24, 6)}<span class="side-name">${esc(s.name)}</span>${ICON.eq}</button>`;
  }).join('');
}

function renderPlayer() {
  const s = state.current;
  $('#p-logo').innerHTML = s ? logoHTML(s, 48) : `<span class="empty-logo">${ICON.radio}</span>`;
  $('#p-name').textContent = s ? s.name : 'Bir istasyon seç';

  const sub = $('#p-sub');
  sub.classList.toggle('error', !!state.playError);
  sub.textContent = state.playError
    || (!s ? 'Listeden bir istasyona tıkla' : state.reconnecting ? `Bağlantı koptu, yeniden bağlanıyor… (${state.retry})` : state.buffering ? 'Bağlanıyor…' : state.nowTitle && state.playing ? `♪ ${state.nowTitle}` : subtitle(s));
  sub.title = state.nowTitle && state.playing ? state.nowTitle : '';

  const play = $('#btn-play');
  const loading = !!s && state.buffering && !state.playError;
  play.classList.toggle('buffering', loading);
  play.innerHTML = loading ? '<span class="spinner"></span>' : state.playing ? ICON.pause : ICON.play;
  play.setAttribute('aria-label', state.playing ? 'Duraklat' : 'Çal');
  play.title = state.playing ? 'Duraklat (Boşluk)' : 'Çal (Boşluk)';

  const mute = $('#btn-mute');
  mute.innerHTML = state.volume === 0 ? ICON.volOff : state.volume < 50 ? ICON.volLow : ICON.volHigh;
  mute.setAttribute('aria-label', state.volume === 0 ? 'Sesi aç' : 'Sesi kapat');
  mute.title = mute.getAttribute('aria-label');

  const vol = $('#volume');
  vol.value = String(state.volume);
  vol.style.setProperty('--fill', `${state.volume}%`);

  renderRecButton();
  hook('playerRendered');

  const sleepBtn = $('#btn-sleep');
  const left = state.sleepAt ? Math.max(1, Math.ceil((state.sleepAt - Date.now()) / 60000)) : 0;
  sleepBtn.classList.toggle('active', !!state.sleepAt);
  $('#sleep-left').textContent = state.sleepAt ? `${left} dk` : '';
  sleepBtn.setAttribute('aria-label', state.sleepAt ? `Uyku zamanlayıcı: ${left} dakika kaldı` : 'Uyku zamanlayıcı');
}

/** Çalma durumu değişince yalnızca ilgili yerleri günceller (kaydırma yerinde kalır). */
function syncPlaying() {
  for (const el of document.querySelectorAll('[data-card]')) {
    const cur = isCurrent(el.dataset.card);
    el.classList.toggle('current', cur);
    el.classList.toggle('is-playing', cur && state.playing);
  }
  renderHero();
  renderSidebar();
  renderPlayer();
}

function syncFavorites() {
  for (const btn of document.querySelectorAll('.fav[data-id]')) {
    const on = isFav(btn.dataset.id);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Favorilerden çıkar' : 'Favorilere ekle');
    btn.title = btn.getAttribute('aria-label');
  }
  renderSidebar();
  if (state.section === 'favorites') renderContent();
}

// ---------- Liste ----------

async function load(force = false) {
  const id = ++requestId;
  state.loading = true;
  state.loadError = null;
  renderContent();
  try {
    const res = await api.country({ force });
    if (id !== requestId) return;
    state.all = asArray(res.stations);
    state.updatedAt = res.updatedAt || null;
    state.stale = !!res.stale;
    hayCache.clear();
    register(state.all);
  } catch (err) {
    if (id !== requestId) return;
    state.loadError = cleanError(err);
    if (state.all.length) state.stale = true;
  } finally {
    if (id === requestId) {
      state.loading = false;
      renderContent();
    }
  }
}

function selectSection(section) {
  if (!['discover', 'world', 'favorites', 'recent', 'stats', 'recordings', 'alarms', 'support', 'updates'].includes(section)) return;
  hook('enterSection', section);
  if (section === 'recordings') loadRecordings();
  const wasWorld = state.section === 'world';
  state.section = section;
  if ((section === 'world') !== wasWorld) state.shown = PAGE;
  renderSidebar();
  if (section === 'world') {
    renderWorldSide();
    if (!state.dunya.languages.length && !state.dunya.listsLoading) loadWorldLists();
    else ensureWorldSelection();
  }
  renderContent();
  $('#content').scrollTop = 0;
}

// ---------- Dünya ----------

function renderWorldSide() {
  const d = state.dunya;
  for (const b of document.querySelectorAll('[data-action="dunya-mode"]')) {
    const on = b.dataset.mode === d.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  $('#world-filter').placeholder = d.mode === 'lang' ? 'Dil ara' : 'Ülke ara';

  const list = $('#world-list');
  const items = d.mode === 'lang' ? d.languages : d.countries;
  if (!items.length) {
    if (d.listsLoading) list.innerHTML = '<div class="loading small"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div>';
    else if (d.listsError) list.innerHTML = '<p class="side-empty">Liste yüklenemedi.</p><button class="btn-ghost" type="button" data-action="dunya-lists-retry" style="margin:8px 12px">Tekrar dene</button>';
    else list.innerHTML = '';
    return;
  }
  const q = norm(d.filter);
  const shown = q ? items.filter((it) => norm(`${it.label} ${it.native || ''} ${it.name || ''} ${it.code || ''}`).includes(q)) : items;
  if (!shown.length) {
    list.innerHTML = '<p class="side-empty">Eşleşen yok.</p>';
    return;
  }
  const byLang = d.mode === 'lang';
  list.innerHTML = shown.map((it) => {
    const key = byLang ? it.name : it.code;
    const on = key === (byLang ? d.lang : d.country);
    const code = byLang ? (it.code || it.name.slice(0, 2)).toUpperCase() : it.code;
    const native = it.native && it.native !== it.label ? `<span class="wi-native" dir="auto">${esc(it.native)}</span>` : '';
    return `<button class="world-item${on ? ' on' : ''}" type="button" data-action="${byLang ? 'pick-lang' : 'pick-country'}" data-key="${esc(key)}" aria-pressed="${on}">
      <span class="wi-code">${esc(code)}</span>
      <span class="wi-text"><span class="wi-label">${esc(it.label)}</span>${native}</span>
      <span class="wi-count" title="${fmtCount(it.count)} istasyon">${fmtCount(it.count)}</span></button>`;
  }).join('');
}

async function loadWorldLists() {
  const d = state.dunya;
  d.listsLoading = true;
  d.listsError = null;
  renderWorldSide();
  if (state.section === 'world') renderContent();
  try {
    const [langs, countries] = await Promise.all([api.languages(), api.countries()]);
    // Aynı Türkçe ada düşen dilleri birleştir (en çok istasyonu olan kalsın).
    const seen = new Map();
    for (const l of asArray(langs)) {
      const item = { ...l, label: langLabelOf(l), native: langNativeOf(l) };
      const k = item.label.toLocaleLowerCase('tr');
      if (!seen.has(k) || seen.get(k).count < item.count) seen.set(k, item);
    }
    d.languages = [...seen.values()].sort((a, b) => b.count - a.count);
    d.countries = asArray(countries).map((c) => ({ ...c, label: countryName(c.code) }));
  } catch (err) {
    d.listsError = cleanError(err);
  } finally {
    d.listsLoading = false;
    renderWorldSide();
    ensureWorldSelection();
  }
}

function ensureWorldSelection() {
  const d = state.dunya;
  if (d.mode === 'lang') {
    if (d.languages.length && !d.languages.some((l) => l.name === d.lang)) {
      const en = d.languages.find((l) => l.name === 'english');
      d.lang = (en || d.languages[0]).name;
    }
  } else if (d.countries.length && !d.countries.some((c) => c.code === d.country)) {
    const first = d.countries.find((c) => c.code !== 'TR') || d.countries[0];
    d.country = first.code;
  }
  renderWorldSide();
  loadWorldStations();
}

async function loadWorldStations(force = false) {
  const d = state.dunya;
  const value = d.mode === 'lang' ? d.lang : d.country;
  if (!value) {
    if (state.section === 'world') renderContent();
    return;
  }
  const key = `${d.mode}:${value}`;
  if (!force && key === d.key && (d.stations.length || d.loading)) {
    if (state.section === 'world') renderContent();
    return;
  }
  d.key = key;
  d.loading = true;
  d.error = null;
  d.stations = [];
  d.sub = 'Tümü';
  state.shown = PAGE;
  if (state.section === 'world') renderContent();
  try {
    const list = await api.stations({ by: d.mode === 'lang' ? 'language' : 'country', value });
    if (d.key !== key) return;
    d.stations = asArray(list);
    register(d.stations);
  } catch (err) {
    if (d.key !== key) return;
    d.error = cleanError(err);
  } finally {
    if (d.key === key) {
      d.loading = false;
      if (state.section === 'world') renderContent();
    }
  }
}

function setWorldMode(mode) {
  const d = state.dunya;
  if (mode !== 'lang' && mode !== 'country') return;
  d.mode = mode;
  d.filter = '';
  $('#world-filter').value = '';
  store.set('dunyaMode', mode);
  $('#world-list').scrollTop = 0;
  ensureWorldSelection();
}

function pickWorld(key) {
  const d = state.dunya;
  if (d.mode === 'lang') {
    d.lang = key;
    store.set('dunyaLang', key);
  } else {
    d.country = key;
    store.set('dunyaCountry', key);
  }
  renderWorldSide();
  loadWorldStations();
  $('#content').scrollTop = 0;
}

function selectCategory(index) {
  if (!(index >= 0 && index < CATEGORIES.length)) return;
  state.categoryIndex = index;
  state.shown = PAGE;
  renderContent();
}

function setQuery(text) {
  const q = text.trim();
  if (q === state.query) return;
  state.query = q;
  state.shown = PAGE;
  if (state.section !== 'discover' && state.section !== 'world') {
    state.section = 'discover';
    renderSidebar();
  }
  renderContent();
  $('#content').scrollTop = 0;
  // Türkiye listesiyle birlikte tüm dünyada da kendiliğinden ara.
  clearTimeout(worldTimer);
  if (q.length >= 3 && !q.includes('://')) {
    worldTimer = setTimeout(() => {
      if (state.query === q && state.world.query !== q && (state.section === 'discover')) searchWorld();
    }, 650);
  }
}

function onSearchInput(e) {
  const text = e.target.value;
  $('#search-clear').hidden = !text;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery(text), 180);
}

async function searchWorld() {
  const q = state.query;
  if (!q) return;
  state.world = { query: q, loading: true, error: null, results: null };
  renderContent();
  try {
    const list = await api.search({ query: q });
    if (state.world.query !== q) return;
    register(list);
    const local = new Set(state.all.map((s) => s.id));
    state.world.results = list.filter((s) => !local.has(s.id));
  } catch (err) {
    if (state.world.query !== q) return;
    state.world.error = cleanError(err);
  } finally {
    if (state.world.query === q) {
      state.world.loading = false;
      renderContent();
    }
  }
}

// ---------- Favoriler, geçmiş, eklenen istasyonlar ----------

function toggleFavorite(s) {
  state.favorites = isFav(s.id)
    ? state.favorites.filter((f) => f.id !== s.id)
    : [...state.favorites, s];
  store.set('favorites', state.favorites);
  syncFavorites();
}

function addRecent(s) {
  state.recent = [{ station: s, at: new Date().toISOString() }, ...state.recent.filter((e) => e.station.id !== s.id)].slice(0, 30);
  store.set('recent', state.recent);
}

function openAddDialog() {
  const dialog = $('#add-dialog');
  $('#add-form').reset();
  $('#add-error').textContent = '';
  const q = state.query && !state.query.includes('://') ? state.query : '';
  $('#add-form').elements.name.value = q;
  dialog.showModal();
  (q ? $('#add-form').elements.url : $('#add-form').elements.name).focus();
}

function onAddSubmit(e) {
  e.preventDefault();
  const f = e.target.elements;
  const name = f.name.value.trim();
  const url = f.url.value.trim();
  const favicon = f.favicon.value.trim();
  const err = $('#add-error');
  if (!name) { err.textContent = 'İstasyon adını yaz.'; f.name.focus(); return; }
  if (!/^https?:\/\/\S+$/i.test(url)) { err.textContent = 'Yayın adresi http:// ya da https:// ile başlamalı.'; f.url.focus(); return; }
  if (favicon && !/^https?:\/\/\S+$/i.test(favicon)) { err.textContent = 'Logo adresi http:// ya da https:// ile başlamalı.'; f.favicon.focus(); return; }
  if (state.custom.some((s) => s.url === url)) { err.textContent = 'Bu yayın adresini zaten eklemişsin.'; f.url.focus(); return; }

  const station = {
    id: `custom-${Date.now().toString(36)}`,
    name: name.slice(0, 80),
    url,
    favicon,
    country: 'TR',
    codec: '',
    bitrate: 0,
    tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
    hls: /\.m3u8(\?|$)/i.test(url),
    clicks: 0,
  };
  state.custom = [station, ...state.custom];
  store.set('custom', state.custom);
  register([station]);
  $('#add-dialog').close();
  renderContent();
  play(station);
}

function removeCustom(id) {
  state.custom = state.custom.filter((s) => s.id !== id);
  store.set('custom', state.custom);
  hayCache.delete(id);
  const cat = CATEGORIES[state.categoryIndex];
  if (cat && cat.custom && !state.custom.length) state.categoryIndex = 0;
  renderContent();
}

// ---------- Oynatıcı ----------

function stopStream() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];
let retryTimer = null;

/** Yayın koptu: birkaç kez artan aralıklarla yeniden bağlanmayı dene. */
function failPlay() {
  if (!state.current) return;
  const s = state.current;
  // Daha önce çalmış bir yayın kopmuşsa 6 kez, hiç açılamamışsa 1 kez daha dene.
  const max = state.everPlayed ? RETRY_DELAYS.length : 1;
  if (state.retry < max && navigator.onLine !== false) {
    const delay = RETRY_DELAYS[state.retry];
    state.retry += 1;
    state.buffering = true;
    state.playing = false;
    state.reconnecting = true;
    stopStream();
    renderPlayer();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (state.current === s && state.reconnecting) play(s, { retry: true }); }, delay);
    return;
  }
  if (navigator.onLine === false && state.everPlayed) {
    // İnternet gelince kaldığı yerden devam etsin.
    state.waitOnline = true;
  }
  state.reconnecting = false;
  if (!state.waitOnline) state.wantPlay = false;
  state.playError = navigator.onLine === false ? 'İnternet bağlantısı yok. Bağlantı gelince yayın kendiliğinden devam edecek.' : PLAY_ERROR;
  state.buffering = false;
  state.playing = false;
  syncPlaying();
}

async function play(s, opts = {}) {
  clearTimeout(retryTimer);
  const same = state.current && state.current.id === s.id;
  if (!opts.retry) {
    state.retry = 0;
    state.reconnecting = false;
    state.waitOnline = false;
    if (!same) state.everPlayed = false;
  }
  state.current = s;
  state.wantPlay = true;
  if (!opts.retry) state.nowTitle = '';
  hook('stationChanged', s);
  state.playError = null;
  state.buffering = true;
  state.playing = false;
  if (!opts.retry) {
    addRecent(s);
    if (!isCustom(s)) api.click(s.id).catch(() => {});
  }
  stopStream();
  hook('beforePlay', s);

  const useHls = (s.hls || /\.m3u8(\?|$)/i.test(s.url)) && window.Hls && window.Hls.isSupported();
  if (useHls) {
    hls = new window.Hls({ enableWorker: true, manifestLoadingMaxRetry: 3, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6 });
    hls.on(window.Hls.Events.ERROR, (_e, data) => { if (data && data.fatal) failPlay(); });
    hls.loadSource(s.url);
    hls.attachMedia(audio);
  } else {
    audio.src = s.url;
  }

  setMediaSession(s);
  syncPlaying();
  if (state.section === 'recent') renderContent();

  try {
    await audio.play();
  } catch (err) {
    // AbortError: kullanıcı hemen başka istasyona geçti, sorun değil.
    if (err && err.name !== 'AbortError' && isCurrent(s.id)) failPlay();
  }
}

function togglePlay() {
  if (!state.current || state.playError) {
    const s = state.current || featured();
    if (s) play(s);
    return;
  }
  if (state.playing || state.buffering) {
    clearTimeout(retryTimer);
    state.reconnecting = false;
    state.waitOnline = false;
    state.wantPlay = false;
    audio.pause();
    if (hls) hls.stopLoad();
    state.buffering = false;
    state.playing = false;
    hook('paused');
    syncPlaying();
  } else {
    // Canlı yayında kaldığı yerden değil, şu andan devam etsin.
    play(state.current);
  }
}

function step(delta) {
  let list = view;
  if (state.section === 'favorites') list = state.favorites;
  if (state.section === 'recent') list = state.recent.map((e) => e.station);
  if (!list.length) list = state.all;
  if (!list.length) return;
  const i = state.current ? list.findIndex((s) => s.id === state.current.id) : -1;
  const next = i < 0 ? 0 : (i + delta + list.length) % list.length;
  play(list[next]);
}

function applyVolume() {
  // Ses grafiği etkinse ses düzeyi orada uygulanır (ses dengeleme ölçümü bozulmasın).
  if (hook('applyVolume', state.volume / 100) !== true) audio.volume = state.volume / 100;
}

function setVolume(v) {
  state.volume = clamp(Math.round(v), 0, 100);
  if (state.volume > 0) state.lastVolume = state.volume;
  applyVolume();
  store.set('volume', state.volume);
  renderPlayer();
}

function setMediaSession(s) {
  if (!('mediaSession' in navigator)) return;
  const artwork = /^https?:\/\//i.test(s.favicon || '') ? [{ src: s.favicon, sizes: '256x256' }] : [];
  const song = state.nowTitle && isCurrent(s.id) ? state.nowTitle : '';
  navigator.mediaSession.metadata = new MediaMetadata({ title: song || s.name, artist: song ? s.name : subtitle(s), album: 'Radyo', artwork });
}

audio.addEventListener('playing', () => {
  state.playing = true;
  state.buffering = false;
  state.playError = null;
  state.everPlayed = true;
  state.reconnecting = false;
  // Yayın bir süre sorunsuz çalarsa deneme sayacı sıfırlansın.
  const s = state.current;
  setTimeout(() => { if (state.current === s && state.playing) state.retry = 0; }, 20000);
  syncPlaying();
});
let stallTimer = null;
audio.addEventListener('waiting', () => {
  if (!state.current) return;
  state.buffering = true;
  renderPlayer();
  // 15 saniyedir veri gelmiyorsa yayın takılmıştır: yeniden bağlan.
  clearTimeout(stallTimer);
  const s = state.current;
  stallTimer = setTimeout(() => { if (state.current === s && state.buffering && !audio.paused) failPlay(); }, 15000);
});
audio.addEventListener('timeupdate', () => clearTimeout(stallTimer));
// Canlı yayın "bitti" diyorsa bağlantı kopmuştur.
audio.addEventListener('ended', () => { if (state.current && state.wantPlay) failPlay(); });
window.addEventListener('online', () => {
  if (state.current && (state.waitOnline || state.reconnecting)) {
    state.waitOnline = false;
    state.retry = 0;
    play(state.current, { retry: true });
  }
});
audio.addEventListener('pause', () => {
  if (!state.playing) return;
  state.playing = false;
  syncPlaying();
});
audio.addEventListener('error', () => {
  // src boşaltılırken gelen hataları yok say.
  if (!audio.getAttribute('src') && !hls) return;
  failPlay();
});

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => togglePlay());
  navigator.mediaSession.setActionHandler('pause', () => togglePlay());
  navigator.mediaSession.setActionHandler('stop', () => { if (state.playing) togglePlay(); });
  navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
}

// ---------- Uyku zamanlayıcı ----------

function renderSleepMenu() {
  const menu = $('#sleep-menu');
  menu.innerHTML = '<div class="menu-title">UYKU ZAMANLAYICI</div>'
    + [15, 30, 45, 60, 90].map((m) => `<button type="button" role="menuitem" data-action="sleep" data-min="${m}">${m} dakika sonra durdur</button>`).join('')
    + (state.sleepAt ? '<button type="button" role="menuitem" class="danger" data-action="sleep" data-min="0">Zamanlayıcıyı kapat</button>' : '');
}

function toggleSleepMenu(open) {
  const menu = $('#sleep-menu');
  const willOpen = open ?? menu.hidden;
  if (willOpen) renderSleepMenu();
  menu.hidden = !willOpen;
  $('#btn-sleep').setAttribute('aria-expanded', String(willOpen));
  if (willOpen) menu.querySelector('button')?.focus();
}

function setSleep(minutes) {
  clearTimeout(sleepTimer);
  clearInterval(sleepTick);
  state.sleepAt = null;
  if (minutes > 0) {
    state.sleepAt = Date.now() + minutes * 60000;
    sleepTimer = setTimeout(() => {
      if (state.playing || state.buffering) togglePlay();
      state.sleepAt = null;
      clearInterval(sleepTick);
      renderPlayer();
    }, minutes * 60000);
    sleepTick = setInterval(renderPlayer, 30000);
  }
  toggleSleepMenu(false);
  renderPlayer();
}

// ---------- Olaylar ----------

document.addEventListener('click', (e) => {
  const sleepMenu = $('#sleep-menu');
  if (!sleepMenu.hidden && !e.target.closest('.menu-anchor')) toggleSleepMenu(false);

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  const s = id ? registry.get(id) : null;

  switch (el.dataset.action) {
    case 'play':
      if (id && isCurrent(id) && !state.playError) togglePlay();
      else if (s) play(s);
      break;
    case 'fav':
      if (s) toggleFavorite(s);
      break;
    case 'section':
      selectSection(el.dataset.section);
      break;
    case 'category':
      selectCategory(Number(el.dataset.index));
      break;
    case 'retry':
      load();
      break;
    case 'refresh':
      load(true);
      break;
    case 'more':
      showMore();
      break;
    case 'world':
      searchWorld();
      break;
    case 'add-open':
      openAddDialog();
      break;
    case 'add-cancel':
      $('#add-dialog').close();
      break;
    case 'remove-custom':
      if (id) removeCustom(id);
      break;
    case 'sleep':
      setSleep(Number(el.dataset.min));
      break;
    case 'dunya-mode':
      setWorldMode(el.dataset.mode);
      break;
    case 'pick-lang':
    case 'pick-country':
      if (el.dataset.key) pickWorld(el.dataset.key);
      break;
    case 'dunya-sub':
      state.dunya.sub = el.dataset.sub || 'Tümü';
      state.shown = PAGE;
      renderContent();
      break;
    case 'dunya-retry':
      loadWorldStations(true);
      break;
    case 'dunya-lists-retry':
      loadWorldLists();
      break;
  }
});

$('#world-filter').addEventListener('input', (e) => {
  state.dunya.filter = e.target.value;
  renderWorldSide();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'sort') {
    state.sort = e.target.value === 'az' ? 'az' : 'popular';
    store.set('sort', state.sort);
    state.shown = PAGE;
    renderContent();
  }
});

$('#content').addEventListener('scroll', fillScreen, { passive: true });
window.addEventListener('resize', fillScreen);

// Logo yüklenemezse sıradaki kaynağı dene, o da yoksa baş harfler görünsün.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('.logo')) return;
  if (!img.classList.contains('tiled')) tiles.set(img.getAttribute('src'), false);
  nextLogo(img);
}, true);
// Yüklenen logoyu kare kutucuğa dönüştür.
document.addEventListener('load', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.closest('.logo')) onLogoLoad(img);
}, true);

$('#add-form').addEventListener('submit', onAddSubmit);
$('#add-dialog').addEventListener('click', (e) => {
  // Pencerenin dışına tıklanınca kapansın.
  if (e.target === e.currentTarget) e.currentTarget.close();
});

$('#search').addEventListener('input', onSearchInput);
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = '';
    $('#search-clear').hidden = true;
    setQuery('');
    e.target.blur();
  } else if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    setQuery(e.target.value);
  }
});
$('#search-clear').addEventListener('click', () => {
  const input = $('#search');
  input.value = '';
  $('#search-clear').hidden = true;
  setQuery('');
  input.focus();
});

$('#btn-play').addEventListener('click', togglePlay);
$('#btn-prev').addEventListener('click', () => step(-1));
$('#btn-next').addEventListener('click', () => step(1));
$('#btn-sleep').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSleepMenu();
});
$('#btn-mute').addEventListener('click', () => setVolume(state.volume === 0 ? state.lastVolume || 70 : 0));
$('#volume').addEventListener('input', (e) => setVolume(Number(e.target.value)));
$('#volume').addEventListener('wheel', (e) => {
  e.preventDefault();
  setVolume(state.volume + (e.deltaY < 0 ? 5 : -5));
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return; // pencereler açıkken kısayollar çalışmasın
  const active = document.activeElement;
  const tag = active && active.tagName;
  const typing = (tag === 'INPUT' && active.type !== 'range') || tag === 'SELECT';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    $('#search').focus();
    $('#search').select();
    return;
  }
  if (e.key === 'Escape' && !$('#sleep-menu').hidden) {
    toggleSleepMenu(false);
    $('#btn-sleep').focus();
    return;
  }
  if (typing) return;
  if (e.code === 'Space' && tag !== 'BUTTON') {
    e.preventDefault();
    togglePlay();
  }
});

// ---------- Yayın kaydı ----------

const recApi = window.recorder;
const recState = { active: false, busy: false, station: null, bytes: 0, ms: 0, list: [], loading: false, loaded: false };
const REC_ICON = {
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
};

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}
function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('tr-TR')} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

let toastTimer = null;
function toast(text, opts = {}) {
  const el = $('#toast');
  $('#toast-text').textContent = text;
  el.classList.toggle('error', !!opts.error);
  const action = $('#toast-action');
  action.hidden = !opts.actionLabel;
  action.textContent = opts.actionLabel || '';
  action.onclick = opts.onAction ? () => { opts.onAction(); el.hidden = true; } : null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, opts.ms || 7000);
}
$('#toast-close').addEventListener('click', () => { $('#toast').hidden = true; });

function renderRecButton() {
  const btn = $('#btn-rec');
  if (!btn) return;
  const canStart = !!state.current && !state.current.hls && !/\.m3u8(\?|$)/i.test(state.current.url || '');
  btn.classList.toggle('on', recState.active);
  btn.disabled = recState.busy || (!recState.active && !canStart);
  $('#rec-text').textContent = recState.active ? `${fmtDuration(recState.ms)} · ${fmtSize(recState.bytes)}` : '';
  const label = recState.active
    ? `Kaydı durdur (${recState.station ? recState.station.name : ''})`
    : canStart ? `${state.current.name} yayınını kaydet` : state.current ? 'Bu yayın kaydedilemiyor' : 'Kaydetmek için önce bir istasyon çal';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  $('#rec-nav-dot').textContent = recState.active ? '●' : '';
}

async function toggleRecord() {
  if (recState.busy) return;
  if (recState.active) {
    recState.busy = true;
    renderRecButton();
    await recApi.stop().catch(() => {});
    return; // sonuç 'stopped' olayıyla gelir
  }
  const s = state.current;
  if (!s) return;
  recState.busy = true;
  renderRecButton();
  try {
    const r = await recApi.start({ id: s.id, name: s.name, url: s.url, codec: s.codec, hls: !!s.hls });
    Object.assign(recState, { active: true, station: r.station, bytes: 0, ms: 0 });
    toast(`Kayıt başladı: ${s.name}`, { ms: 3000 });
  } catch (err) {
    toast(cleanError(err), { error: true });
  } finally {
    recState.busy = false;
    renderRecButton();
    if (state.section === 'recordings') renderContent();
  }
}

recApi.onEvent((ev) => {
  if (ev.type === 'progress') {
    recState.bytes = ev.bytes;
    recState.ms = ev.ms;
    renderRecButton();
    const sub = $('#rec-now-sub');
    if (sub) sub.textContent = `${fmtDuration(ev.ms)} · ${fmtSize(ev.bytes)}`;
    return;
  }
  Object.assign(recState, { active: false, busy: false, station: null, bytes: 0, ms: 0 });
  renderRecButton();
  if (ev.type === 'failed') {
    toast(ev.message || 'Kayıt yapılamadı.', { error: true });
  } else {
    const msg = ev.message || `Kaydedildi: ${ev.name} (${fmtDuration(ev.ms)}, ${fmtSize(ev.bytes)})`;
    toast(msg, { error: !!ev.message, actionLabel: 'Klasörde göster', onAction: () => recApi.reveal(ev.file) });
  }
  if (state.section === 'recordings') loadRecordings();
});

async function loadRecordings() {
  recState.loading = true;
  try {
    recState.list = await recApi.list();
  } catch {
    recState.list = [];
  }
  recState.loading = false;
  recState.loaded = true;
  if (state.section === 'recordings') renderContent();
}

function recordingsHTML() {
  let html = `<div class="list-bar" style="margin:0 0 20px"><h1 class="page-title" style="margin:0;color:var(--text)">Kayıtlar</h1><span class="spacer"></span>
    <button class="btn-ghost" type="button" data-action="rec-dir">${REC_ICON.folder}<span>Klasörü aç</span></button></div>`;
  if (recState.active) {
    html += `<div class="rec-now"><span class="rec-dot" aria-hidden="true"></span>
      <div class="rec-now-text"><div class="rec-now-title">Kaydediliyor: ${esc(recState.station ? recState.station.name : '')}</div>
      <div class="rec-now-sub" id="rec-now-sub">${fmtDuration(recState.ms)} · ${fmtSize(recState.bytes)}</div></div>
      <button class="btn-ghost btn-stop" type="button" data-action="rec-stop"><span>Durdur</span></button></div>`;
  }
  if (!recState.loaded && recState.loading) {
    return `${html}<div class="loading"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div>`;
  }
  if (!recState.list.length) {
    html += emptyHTML(REC_ICON.file.replace('<svg', '<svg width="40" height="40"'), 'Henüz kayıt yok',
      'Bir istasyon çalarken alttaki kırmızı kayıt düğmesine bas. Kayıtlar Müzik klasöründeki “Radyo Kayıtları”na kaydedilir.');
  } else {
    html += recState.list.map((r) => `<div class="rec-row">
      <span class="rec-icon">${REC_ICON.file}</span>
      <div class="recent-text">
        <div class="card-name" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="card-sub">${esc(new Date(r.mtime).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }))} · ${fmtSize(r.size)}</div>
      </div>
      <div class="rec-actions">
        <button class="btn-ghost" type="button" data-action="rec-open" data-file="${esc(r.file)}" title="Varsayılan müzik çalarında aç">${ICON.play}<span>Dinle</span></button>
        <button class="btn-ghost" type="button" data-action="rec-reveal" data-file="${esc(r.file)}" title="Klasörde göster">${REC_ICON.folder}</button>
        <button class="btn-ghost danger" type="button" data-action="rec-trash" data-file="${esc(r.file)}" title="Geri Dönüşüm Kutusu’na taşı" aria-label="${esc(r.name)} kaydını sil">${ICON.trash}</button>
      </div></div>`).join('');
  }
  html += '<p class="legal-note">Kayıtlar yalnızca kişisel kullanım içindir; yayınları paylaşmak ya da yeniden yayınlamak telif haklarını ihlal edebilir.</p>';
  return html;
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action^="rec-"]');
  if (!el) return;
  const file = el.dataset.file;
  switch (el.dataset.action) {
    case 'rec-stop':
      toggleRecord();
      break;
    case 'rec-dir':
      recApi.openDir();
      break;
    case 'rec-open':
      if (!(await recApi.open(file))) toast('Kayıt açılamadı.', { error: true });
      break;
    case 'rec-reveal':
      recApi.reveal(file);
      break;
    case 'rec-trash':
      if (await recApi.trash(file).catch(() => false)) {
        toast('Kayıt Geri Dönüşüm Kutusu’na taşındı.', { ms: 4000 });
        loadRecordings();
      } else {
        toast('Kayıt silinemedi.', { error: true });
      }
      break;
  }
});

$('#btn-rec').addEventListener('click', toggleRecord);

recApi.status().then((s) => {
  if (s && s.active) Object.assign(recState, { active: true, station: s.station, bytes: s.bytes, ms: s.ms });
  renderRecButton();
}).catch(() => {});

// ---------- Başlat ----------

renderSidebar();
renderPlayer();
load();
