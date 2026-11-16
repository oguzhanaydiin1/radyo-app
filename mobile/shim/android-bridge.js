'use strict';

/*
 * OA Radyo — Android köprüsü.
 *
 * Windows sürümünde ana süreç (main.js, src/*) ve preload.js'in yaptığı işleri Android
 * WebView'da yapar; arayüzün beklediği window.radio, window.player, window.recorder,
 * window.schedules, window.appSettings, window.extras, window.podcasts ve
 * window.library nesnelerini aynı adlarla ve aynı biçimde sağlar. Böylece Android
 * uygulaması Windows arayüzünün (renderer/) kendisini çalıştırır.
 *
 * Android'de olmayanlar: yayın kaydı, mini oynatıcı, Discord, ses çıkışı seçimi,
 * ekolayzır (yayınlara CORS izni eklenemediği için), bilgisayarlar arası klasör eşitleme.
 */

(() => {
  const root = document.documentElement;
  root.classList.add('is-android');
  window.__noLogoProxy = true;

  // Yayınlar CORS izni vermediği için ses öğesi "anonymous" istemesin (web sürümüyle aynı).
  try {
    Object.defineProperty(HTMLMediaElement.prototype, 'crossOrigin', { configurable: true, get() { return null; }, set() {} });
  } catch { /* eski WebView */ }

  const API = 'https://api.oalabs.dev';
  const REPO = 'oguzhanaydiin1/radyo-app';
  const RAW = `https://raw.githubusercontent.com/${REPO}/main/stations`;
  const APK_URL = `https://github.com/${REPO}/releases/download/android-test/OA-Radyo-test.apk`;
  const PLAY_URL = 'https://play.google.com/store/apps/details?id=dev.oalabs.radyo';
  // Yayın sürümü Google Play'den güncellenir; test sürümü GitHub'daki APK'dan.
  const relTag = (b) => (b && b.channel === 'release' ? 'android-latest' : 'android-test');
  const updateUrl = (b) => (b && b.channel === 'release' ? PLAY_URL : APK_URL);
  const noop = () => {};
  const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* yer yok */ } },
  };
  const buildInfo = fetch('android-build.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ version: '', build: 0 }));
  const clean = (v, max = 80) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

  async function getJSON(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const j = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, j };
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- İstasyonlar (src/radio.js'in karşılığı) ----------

  const SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];
  let serverIndex = 0;
  const UUID = /^[0-9a-f-]{8,64}$/i;

  async function apiGet(pathname, params = {}, timeoutMs = 10000) {
    let lastError;
    for (let i = 0; i < SERVERS.length; i++) {
      const index = (serverIndex + i) % SERVERS.length;
      const url = new URL(`https://${SERVERS[index]}${pathname}`);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (res.ok) { serverIndex = index; return await res.json(); }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err && err.name === 'AbortError' ? 'zaman aşımı' : String(err && err.message);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`İstasyon listesine ulaşılamadı. İnternet bağlantını kontrol et. (${lastError})`);
  }

  function toStation(j) {
    const str = (k) => (j[k] == null ? '' : String(j[k])).trim();
    return {
      id: str('stationuuid'),
      name: str('name') || 'Adsız istasyon',
      url: str('url_resolved') || str('url'),
      favicon: str('favicon'),
      homepage: str('homepage'),
      country: str('countrycode'),
      state: str('state').slice(0, 60),
      language: str('language'),
      codec: str('codec'),
      bitrate: Number(j.bitrate) || 0,
      tags: str('tags').split(',').map((t) => t.trim()).filter(Boolean),
      hls: Number(j.hls) === 1,
      clicks: Number(j.clickcount) || 0,
      votes: Number(j.votes) || 0,
    };
  }

  function dedupe(list) {
    const ids = new Set();
    const byUrl = new Map();
    const byName = new Map();
    const out = [];
    for (const s of list) {
      if (!s.id || !/^https?:\/\//i.test(s.url) || ids.has(s.id)) continue;
      const u = s.url.toLowerCase().replace(/\/+$/, '');
      const n = s.name.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
      const dup = byUrl.get(u);
      if (dup) {
        if (!dup.favicon && s.favicon) dup.favicon = s.favicon;
        if (!dup.homepage && s.homepage) dup.homepage = s.homepage;
        dup.votes = Math.max(dup.votes, s.votes);
        continue;
      }
      ids.add(s.id);
      byUrl.set(u, s);
      out.push(s);
      const same = byName.get(n);
      if (same) {
        if (!same.favicon && s.favicon) same.favicon = s.favicon;
        if (!s.favicon && same.favicon) s.favicon = same.favicon;
        if (!s.homepage && same.homepage) s.homepage = same.homepage;
      } else {
        byName.set(n, s);
      }
    }
    return out;
  }

  function parseExtras(j) {
    const list = j && Array.isArray(j.stations) ? j.stations : [];
    return list
      .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && /^https?:\/\//i.test(String(x.url || '')))
      .slice(0, 200)
      .map((x) => ({
        id: clean(x.id, 64), name: clean(x.name), url: String(x.url).trim(),
        favicon: /^https?:\/\//i.test(String(x.favicon || '')) ? String(x.favicon).trim() : '',
        homepage: /^https?:\/\//i.test(String(x.homepage || '')) ? String(x.homepage).trim() : '',
        country: clean(x.country, 2).toUpperCase(), state: clean(x.state, 60), language: clean(x.language, 40),
        codec: clean(x.codec, 12), bitrate: Number(x.bitrate) || 0,
        tags: Array.isArray(x.tags) ? x.tags.map((t) => clean(String(t), 30)).filter(Boolean).slice(0, 8) : [],
        hls: !!x.hls || /\.m3u8(\?|$)/i.test(String(x.url)), clicks: Number(x.clicks) || 0, votes: 0, extra: true,
      }));
  }

  let extras = [];
  let extrasAt = 0;
  async function loadExtras() {
    if (Date.now() - extrasAt < 6 * 3600e3 && extras.length) return extras;
    extrasAt = Date.now();
    if (!extras.length) {
      extras = parseExtras(ls.get('ek-istasyonlar', null));
      if (!extras.length) extras = parseExtras(await fetch('ek-istasyonlar.json').then((r) => r.json()).catch(() => null));
    }
    const r = await getJSON(`${RAW}/ek-istasyonlar.json?t=${Date.now()}`, 4000).catch(() => null);
    if (r && r.ok) {
      const list = parseExtras(r.j);
      if (list.length) { extras = list; ls.set('ek-istasyonlar', r.j); }
    }
    return extras;
  }

  function withExtras(list, country) {
    const add = extras.filter((x) => !country || x.country === country);
    if (!add.length) return list;
    const ids = new Set(add.map((x) => x.id));
    const urls = new Set(add.map((x) => x.url.toLowerCase()));
    const out = list.filter((s) => !ids.has(s.id) && !urls.has(String(s.url).toLowerCase()));
    for (const x of add) {
      const at = out.findIndex((s) => (s.clicks || 0) < x.clicks);
      out.splice(at < 0 ? out.length : at, 0, x);
    }
    return out;
  }
  const fold = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const CACHE_KEY = 'istasyonlar-TR-android-v1';
  const mem = new Map();
  async function memo(key, maxAge, fn) {
    const hit = mem.get(key);
    if (hit && Date.now() - hit.at < maxAge) return hit.data;
    const data = await fn();
    mem.set(key, { at: Date.now(), data });
    return data;
  }

  window.radio = {
    async country(opts = {}) {
      const force = !!(opts && opts.force);
      const cache = ls.get(CACHE_KEY, null);
      const valid = cache && Array.isArray(cache.stations) && Number.isFinite(cache.updatedAt);
      await loadExtras().catch(() => {});
      if (!force && valid && Date.now() - cache.updatedAt < 24 * 3600e3) {
        return { stations: withExtras(cache.stations, 'TR'), updatedAt: cache.updatedAt, stale: false };
      }
      try {
        const data = await apiGet('/json/stations/bycountrycodeexact/TR', { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '100000' }, 45000);
        const stations = dedupe(Array.isArray(data) ? data.map(toStation) : []);
        if (!stations.length && valid) return { stations: withExtras(cache.stations, 'TR'), updatedAt: cache.updatedAt, stale: true };
        const out = { updatedAt: Date.now(), stations };
        ls.set(CACHE_KEY, out);
        return { ...out, stations: withExtras(stations, 'TR'), stale: false };
      } catch (err) {
        if (valid) return { stations: withExtras(cache.stations, 'TR'), updatedAt: cache.updatedAt, stale: true };
        throw err;
      }
    },
    languages: () => memo('languages', 6 * 3600e3, async () => {
      const data = await apiGet('/json/languages', { hidebroken: 'true', order: 'stationcount', reverse: 'true' }, 30000);
      return (Array.isArray(data) ? data : [])
        .map((l) => ({ name: String(l.name || '').trim().toLowerCase(), code: String(l.iso_639 || '').trim().toLowerCase(), count: Number(l.stationcount) || 0 }))
        .filter((l) => l.name && l.count >= 5);
    }),
    countries: () => memo('countries', 6 * 3600e3, async () => {
      const data = await apiGet('/json/countries', { hidebroken: 'true', order: 'stationcount', reverse: 'true' }, 30000);
      return (Array.isArray(data) ? data : [])
        .map((c) => ({ code: String(c.iso_3166_1 || '').trim().toUpperCase(), name: String(c.name || '').trim(), count: Number(c.stationcount) || 0 }))
        .filter((c) => /^[A-Z]{2}$/.test(c.code) && c.count > 0);
    }),
    async stations(opts = {}) {
      const by = opts && opts.by;
      if (by === 'language') {
        const name = clean(opts.value, 60).toLowerCase();
        if (!/^[\p{L}\p{M} .'()-]+$/u.test(name)) throw new Error('Geçersiz dil seçimi.');
        return memo(`lang:${name}`, 3600e3, async () => dedupe((await apiGet(`/json/stations/bylanguageexact/${encodeURIComponent(name)}`,
          { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '3000' }, 45000) || []).map(toStation)));
      }
      if (by === 'country') {
        const code = clean(opts.value, 2).toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) throw new Error('Geçersiz ülke seçimi.');
        return memo(`country:${code}`, 3600e3, async () => dedupe((await apiGet(`/json/stations/bycountrycodeexact/${code}`,
          { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '5000' }, 45000) || []).map(toStation)));
      }
      throw new Error('Geçersiz seçim.');
    },
    async search(opts = {}) {
      const query = clean(opts && opts.query);
      if (!query) return [];
      const variants = [...new Set([query, fold(query)])];
      const results = await Promise.allSettled(variants.map((name) => apiGet('/json/stations/search',
        { name, order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: '60' })));
      if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
      const found = results.flatMap((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [])).map(toStation).sort((a, b) => b.clicks - a.clicks);
      const words = fold(query).split(/\s+/).filter(Boolean);
      const ex = (await loadExtras().catch(() => extras)).filter((x) => { const h = fold(`${x.name} ${x.tags.join(' ')}`); return words.every((w) => h.includes(w)); });
      const exIds = new Set(ex.map((x) => x.id));
      const exUrls = new Set(ex.map((x) => x.url.toLowerCase()));
      return [...ex, ...dedupe(found).filter((s) => !exIds.has(s.id) && !exUrls.has(s.url.toLowerCase()))];
    },
    async click(id) {
      if (typeof id !== 'string' || !UUID.test(id)) return;
      try { await apiGet(`/json/url/${id}`); } catch { /* önemsiz */ }
    },
    async vote(id) {
      if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, message: 'Geçersiz istasyon.' };
      try {
        const r = await apiGet(`/json/vote/${id}`);
        if (r && r.ok) return { ok: true };
        return { ok: false, message: /too often/i.test(String(r && r.message)) ? 'Bu istasyona kısa süre önce oy verildi, biraz sonra tekrar dene.' : 'Oy verilemedi.' };
      } catch {
        return { ok: false, message: 'Oy verilemedi, internet bağlantını kontrol et.' };
      }
    },
  };
  async function byUuid(id) {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    const ex = (await loadExtras().catch(() => extras)).find((x) => x.id === id);
    if (ex) return ex;
    const data = await apiGet(`/json/stations/byuuid/${id}`);
    return (Array.isArray(data) ? data.map(toStation) : [])[0] || null;
  }

  // ---------- Oynatıcı olayları (tepsi/mini oynatıcı yok; alarm komutu buradan gelir) ----------

  const cmdListeners = [];
  window.player = {
    sendState: noop, cmd: noop, onState: noop,
    onCmd: (cb) => cmdListeners.push(cb),
    toggleMini: noop, closeMini: noop, expand: noop, onMini: noop,
    watchMeta: noop, unwatchMeta: noop, onMeta: noop,
  };
  const emitCmd = (cmd) => cmdListeners.forEach((cb) => { try { cb(cmd); } catch { /* yoksay */ } });

  // ---------- Yayın kaydı: Android'de yok ----------

  window.recorder = {
    start: async () => { throw new Error('Yayın kaydı Android sürümünde henüz yok.'); },
    stop: async () => {}, status: async () => ({ active: false }), list: async () => [],
    open: async () => false, reveal: noop, openDir: noop, trash: async () => false, onEvent: noop,
  };

  // ---------- Alarmlar (uygulama açıkken çalar) ----------

  const SCH_KEY = 'android-schedules-v1';
  const schedListeners = [];
  const readSched = () => { const a = ls.get(SCH_KEY, []); return Array.isArray(a) ? a : []; };
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function nextRun(it, from = new Date()) {
    if (!it.enabled || !/^\d{2}:\d{2}$/.test(it.time || '')) return null;
    const [h, m] = it.time.split(':').map(Number);
    const days = Array.isArray(it.days) ? it.days : [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, m, 0, 0);
      if (d <= from) continue;
      if (days.length ? days.includes(d.getDay()) : dateKey(d) === it.date) return d.getTime();
    }
    return null;
  }
  const withNext = (items) => items.map((x) => ({ ...x, next: nextRun(x) }));
  function writeSched(items) {
    ls.set(SCH_KEY, items);
    const out = withNext(items);
    schedListeners.forEach((cb) => { try { cb(out); } catch { /* yoksay */ } });
    return out;
  }
  const fired = new Set();
  setInterval(() => {
    const now = Date.now();
    const items = readSched();
    let changed = false;
    for (const it of items) {
      if (!it.enabled || it.type !== 'alarm') continue;
      const due = nextRun(it, new Date(now - 60000));
      if (!due || due > now || now - due > 60000) continue;
      const key = `${it.id}:${due}`;
      if (fired.has(key)) continue;
      fired.add(key);
      emitCmd({ type: 'alarm', station: it.station });
      if (!it.days || !it.days.length) { it.enabled = false; changed = true; }
    }
    if (changed) writeSched(items);
  }, 15000);
  window.schedules = {
    list: async () => withNext(readSched()),
    save: async (item) => {
      if (!item || item.type !== 'alarm') throw new Error('Android sürümünde yalnızca alarm kurulabilir.');
      const items = readSched();
      const id = item.id || `s${Date.now().toString(36)}`;
      const clean2 = { id, type: 'alarm', enabled: item.enabled !== false, station: item.station, time: item.time, days: Array.isArray(item.days) ? item.days : [], date: item.date || '', durationMin: item.durationMin || 0 };
      const at = items.findIndex((x) => x.id === id);
      if (at >= 0) items[at] = clean2; else items.push(clean2);
      return writeSched(items);
    },
    remove: async (id) => writeSched(readSched().filter((x) => x.id !== id)),
    enable: async (id, on) => writeSched(readSched().map((x) => (x.id === id ? { ...x, enabled: !!on } : x))),
    onChange: (cb) => schedListeners.push(cb),
  };

  // ---------- Ayarlar, yedek, güncelleme, bağlantılar ----------

  const SET_KEY = 'android-settings-v1';
  const readSettings = () => ({ lyricsOnline: true, ...ls.get(SET_KEY, {}) });

  async function openExternal(url) {
    if (typeof url !== 'string' || url.length > 4000 || !/^(https:\/\/|mailto:)/i.test(url)) return false;
    if (/^mailto:/i.test(url)) { window.location.href = url; return true; }
    if (Plugins.Browser && Plugins.Browser.open) {
      try { await Plugins.Browser.open({ url }); return true; } catch { /* aşağıdaki yolu dene */ }
    }
    window.open(url, '_blank');
    return true;
  }

  function pickFile(accept, multiple = false) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.style.display = 'none';
      let done = false;
      const finish = (files) => { if (done) return; done = true; resolve(files); input.remove(); };
      input.addEventListener('change', () => finish([...(input.files || [])]));
      // Bazı WebView'lar seçimden hemen önce "cancel" da gönderir; gerçekten vazgeçildi mi diye bekle.
      input.addEventListener('cancel', () => setTimeout(() => finish([]), 1500));
      document.body.appendChild(input);
      input.click();
    });
  }

  const updListeners = [];
  window.appSettings = {
    get: async () => {
      const b = await buildInfo;
      const s = readSettings();
      return { closeToTray: false, openAtLogin: false, syncDir: '', globalKeys: false, lang: ls.get('lang', 'tr') === 'en' ? 'en' : 'tr', lyricsOnline: s.lyricsOnline !== false, version: b.version || '', packaged: true, platform: 'android' };
    },
    set: async (patch = {}) => {
      const s = readSettings();
      if ('lyricsOnline' in patch) s.lyricsOnline = !!patch.lyricsOnline;
      ls.set(SET_KEY, s);
      if ('lang' in patch) {
        ls.set('lang', patch.lang === 'en' ? 'en' : 'tr');
        setTimeout(() => window.location.reload(), 150);
      }
      return window.appSettings.get();
    },
    chooseSync: async () => null, clearSync: async () => {}, readSync: async () => null, writeSync: async () => false, onSyncChanged: noop,
    exportData: async (payload) => {
      const text = JSON.stringify(payload);
      if (Plugins.Share && Plugins.Share.share) {
        try { await Plugins.Share.share({ title: 'OA Radyo yedeği', text }); return true; } catch { /* panoya kopyala */ }
      }
      try {
        await navigator.clipboard.writeText(text);
        window.alert('Yedek panoya kopyalandı. Bir not uygulamasına yapıştırıp saklayabilirsin.');
        return true;
      } catch {
        return false;
      }
    },
    importData: async () => {
      const [f] = await pickFile('application/json,.json,text/plain,.txt');
      if (!f) return null;
      const j = JSON.parse(await f.text());
      if (!j || typeof j !== 'object') throw new Error('Geçersiz yedek');
      return j;
    },
    checkUpdate: async () => {
      const b = await buildInfo;
      try {
        const r = await getJSON(`https://api.github.com/repos/${REPO}/releases/tags/${relTag(b)}`, 12000);
        if (r.status === 404) return { status: 'latest', current: b.version };
        if (!r.ok || !r.j) throw new Error(String(r.status));
        const body = String(r.j.body || '');
        const remote = Number((body.match(/build:\s*(\d+)/i) || [])[1]) || 0;
        const version = (body.match(/sürüm:\s*([\w.\-]+)/i) || [])[1] || '';
        if (remote > (Number(b.build) || 0)) {
          return { status: 'full', current: b.version, version: version || `${b.version} (${remote})`, notes: body.replace(/^.*(sürüm|build):.*$/gim, '').trim() };
        }
        return { status: 'latest', current: b.version };
      } catch {
        return { status: 'error', message: 'Güncelleme bilgisi alınamadı. İnternet bağlantını kontrol et.' };
      }
    },
    downloadUpdate: async () => { await openExternal(updateUrl(await buildInfo)); return { status: 'full' }; },
    installUpdate: async () => { await openExternal(updateUrl(await buildInfo)); },
    onUpdate: (cb) => updListeners.push(cb),
    openExternal,
    about: async () => {
      const b = await buildInfo;
      const m = navigator.userAgent.match(/Android\s([\d.]+)/);
      return { version: b.version || '', os: m ? `Android ${m[1]}` : 'Android', arch: '', electron: '', platform: 'android' };
    },
  };

  window.extras = {
    setTheme: (mode) => {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = mode === 'light' ? '#F6F4EF' : '#12131A';
      if (Plugins.StatusBar && Plugins.StatusBar.setStyle) Plugins.StatusBar.setStyle({ style: mode === 'light' ? 'LIGHT' : 'DARK' }).catch(noop);
    },
    discordAvailable: async () => false, discordEnable: noop, discordSet: noop,
    pendingLink: async () => null, onLink: noop,
    byUuid,
    keysStatus: async () => ({ on: false, failed: [] }),
  };

  // ---------- Podcast ----------
  // Apple'ın arama servisi Cloudflare sunucularından (api.oalabs.dev) gelen istekleri
  // "çok fazla istek" diye reddediyor. Bu yüzden arama ve RSS önce telefonun kendi
  // bağlantısıyla, Capacitor'ın yerel HTTP aracıyla yapılır (CORS kısıtı yok);
  // olmazsa sunucu vekili denenir.

  const NativeHttp = Plugins.CapacitorHttp;
  const UA = 'OA Radyo Android (https://oalabs.dev/radyo/)';
  async function nativeText(url, timeoutMs = 15000, accept = '*/*') {
    if (!NativeHttp || typeof NativeHttp.request !== 'function') throw new Error('yerel HTTP yok');
    const r = await NativeHttp.request({
      url, method: 'GET', responseType: 'text',
      headers: { 'User-Agent': UA, Accept: accept },
      connectTimeout: timeoutMs, readTimeout: timeoutMs,
    });
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    return { status: Number(r.status) || 0, text: body, url: r.url || url };
  }
  const itunesMap = (r, country) => ({
    id: String(r.collectionId || ''),
    name: clean(r.collectionName || r.trackName, 160),
    author: clean(r.artistName, 160),
    feed: String(r.feedUrl || '').trim(),
    art: String(r.artworkUrl600 || r.artworkUrl100 || '').trim(),
    genre: clean(r.primaryGenreName, 60),
    count: Number(r.trackCount) || 0,
    country,
  });
  const cc = (c) => (/^[a-z]{2}$/i.test(String(c || '')) ? String(c).toUpperCase() : 'TR');

  async function viaProxy(path, params, timeoutMs) {
    const u = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const r = await getJSON(u.toString(), timeoutMs);
    if (!r.j || !r.j.ok) {
      const e = new Error((r.j && r.j.error && !/^itunes \d+$/.test(r.j.error) && r.j.error) || 'Podcast servisine ulaşılamadı.');
      e.status = r.status;
      throw e;
    }
    return r.j;
  }

  window.podcasts = {
    async search(opts = {}) {
      const term = clean(opts.term, 100);
      const country = cc(opts.country);
      const limit = Math.min(50, Number(opts.limit) || 25);
      const u = `https://itunes.apple.com/search?media=podcast&entity=podcast&country=${country}&limit=${limit}&term=${encodeURIComponent(term)}`;
      let nativeErr = null;
      try {
        const r = await nativeText(u, 15000, 'application/json');
        if (r.status === 200) {
          const j = JSON.parse(r.text);
          return (Array.isArray(j.results) ? j.results : []).filter((x) => /^https?:\/\//i.test(String(x.feedUrl || ''))).map((x) => itunesMap(x, country));
        }
        nativeErr = new Error(r.status === 429 ? 'Podcast araması şu an yoğun. Biraz sonra tekrar dene.' : `Podcast araması yapılamadı (HTTP ${r.status}).`);
      } catch (err) {
        nativeErr = err;
      }
      try {
        const j = await viaProxy('/v1/podcast/search', { term, country, limit }, 15000);
        return Array.isArray(j.results) ? j.results : [];
      } catch {
        throw (nativeErr && /yoğun|HTTP/.test(nativeErr.message)) ? nativeErr : new Error('Podcast aramasına ulaşılamadı. İnternet bağlantını kontrol et.');
      }
    },
    async lookup(ids, country) {
      const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^\d{1,15}$/.test(x)).slice(0, 100);
      if (!list.length) return [];
      const u = `https://itunes.apple.com/lookup?entity=podcast&country=${cc(country)}&id=${list.join(',')}`;
      const r = await nativeText(u, 15000, 'application/json');
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const j = JSON.parse(r.text);
      return (Array.isArray(j.results) ? j.results : []).filter((x) => x && x.collectionId).map((x) => itunesMap(x, cc(country)));
    },
    async feed(url) {
      const target = String(url || '').trim();
      if (!/^https?:\/\/\S+$/i.test(target) || target.length > 2000) throw new Error('Geçerli bir RSS adresi gir (https://… ile başlamalı).');
      try {
        const r = await nativeText(target, 20000, 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5');
        if (r.status === 200 && r.text.length < 12 * 1024 * 1024 && /<(rss|feed|channel)[\s>]/i.test(r.text.slice(0, 5000))) return { text: r.text, url: r.url };
        if (r.status === 200) throw Object.assign(new Error('Bu adres bir podcast beslemesi değil.'), { final: true });
      } catch (err) {
        if (err && err.final) throw err;
      }
      try {
        const j = await viaProxy('/v1/podcast/feed', { url: target }, 25000);
        return { text: j.text, url: j.url };
      } catch (err) {
        throw new Error(err && err.message && err.message !== 'Podcast servisine ulaşılamadı.' ? err.message : 'Besleme açılamadı. Adresi ve internet bağlantını kontrol et.');
      }
    },
    async curated() {
      const remote = await getJSON(`${RAW}/podcastler.json?t=${Date.now()}`, 5000).catch(() => null);
      if (remote && remote.ok && remote.j && (Array.isArray(remote.j.tr) || Array.isArray(remote.j.en))) return remote.j;
      return fetch('podcastler.json').then((r) => r.json()).catch(() => ({ tr: [], en: [] }));
    },
  };

  // ---------- Cihazdaki müzik ----------
  // Android WebView seçilen dosyalara kalıcı erişim vermez: dosyalar uygulama açık kaldıkça
  // listede kalır, uygulama kapanınca yeniden seçilmeleri gerekir. Hiçbir dosya yüklenmez.

  const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|flac|ogg|oga|opus|wav|webm|mp4)$/i;
  const lib = { tracks: [], files: new Map(), covers: new Map(), lyrics: new Map(), lrc: new Map() };
  const libListeners = [];
  const libEmit = (ev) => libListeners.forEach((cb) => { try { cb(ev); } catch { /* yoksay */ } });
  const fileId = (f) => {
    let h = 2166136261;
    for (const ch of `${f.name}|${f.size}|${f.lastModified}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return `w${h.toString(36)}`;
  };
  function fromName(name) {
    const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const noNum = base.replace(/^\s*(?:\d{1,3}\s*[-.)]|0\d(?=\s))\s*/, '');
    const m = noNum.match(/^(.+?)\s+[-–]\s+(.+)$/);
    return m ? { artist: clean(m[1], 200), title: clean(m[2], 200) } : { artist: '', title: clean(noNum, 200) || clean(base, 200) };
  }
  function readTags(file) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) { resolve(null); return; }
      try {
        window.jsmediatags.read(file, { onSuccess: (t) => resolve((t && t.tags) || null), onError: () => resolve(null) });
      } catch {
        resolve(null);
      }
    });
  }
  function pictureURL(pic) {
    if (!pic || !pic.data || !pic.data.length || pic.data.length > 6 * 1024 * 1024) return null;
    const fmt = /^image\/(png|jpe?g|webp|gif)$/i.test(pic.format || '') ? pic.format : 'image/jpeg';
    return URL.createObjectURL(new Blob([new Uint8Array(pic.data)], { type: fmt }));
  }
  // Telefondaki müzikler (yerel eklenti: OANative, MediaStore). Her açılışta yeniden okunur;
  // çalma ve kapak adresleri yalnızca bu oturumda geçerli bir anahtar içerir.
  const Native = Plugins.OANative || null;
  const nat = { tracks: [], loaded: false, granted: false, scanning: null };
  const natTrack = (t) => ({
    id: String(t.id), nid: t.nid, url: t.url, coverUrl: t.cover,
    title: clean(t.title, 200) || fromName(String(t.file || '')).title,
    artist: clean(t.artist, 200), album: clean(t.album, 200), albumArtist: '',
    year: Number(t.year) || 0, no: Number(t.no) || 0, disc: Number(t.disc) || 0, genre: '',
    duration: Number(t.duration) || 0, hasCover: true, folder: 'device', dir: clean(t.dir, 120),
    file: String(t.file || ''), format: (String(t.file || '').split('.').pop() || '').toUpperCase(),
  });
  async function nativeScan(announce) {
    if (!Native) return;
    if (nat.scanning) return nat.scanning;
    nat.scanning = (async () => {
      const before = nat.tracks.length;
      const r = await Native.scan();
      nat.tracks = (Array.isArray(r && r.tracks) ? r.tracks : []).map(natTrack);
      nat.loaded = true;
      if (announce) libEmit({ type: 'scanned', total: nat.tracks.length + lib.tracks.length });
      else if (before !== nat.tracks.length) libEmit({ type: 'changed' });
    })();
    try { await nat.scanning; } finally { nat.scanning = null; }
  }
  async function nativeStatus() {
    if (!Native) return false;
    try { nat.granted = !!(await Native.audioStatus()).granted; } catch { nat.granted = false; }
    return nat.granted;
  }
  function libState() {
    const folders = [];
    if (Native && nat.granted) folders.push({ dir: 'device', name: 'Telefondaki müzikler', count: nat.tracks.length });
    if (lib.tracks.length) folders.push({ dir: 'session', name: 'Bu oturumda seçilen dosyalar', count: lib.tracks.length });
    return { folders, tracks: [...nat.tracks, ...lib.tracks], scannedAt: Date.now(), scanning: !!nat.scanning, needsPermission: !!Native && !nat.granted };
  }
  async function addFiles(files) {
    const audio = files.filter((f) => AUDIO_EXT.test(f.name) || /^audio\//.test(f.type));
    for (const f of files.filter((x) => /\.lrc$/i.test(x.name))) {
      lib.lrc.set(f.name.replace(/\.lrc$/i, '').toLowerCase(), f);
    }
    let done = 0;
    libEmit({ type: 'scan', done: 0, total: audio.length });
    for (const f of audio) {
      const id = fileId(f);
      if (!lib.files.has(id)) {
        const tags = await readTags(f);
        const guess = fromName(f.name);
        const lyr = tags && tags.lyrics ? (typeof tags.lyrics === 'string' ? tags.lyrics : tags.lyrics.lyrics || '') : '';
        if (lyr) lib.lyrics.set(id, lyr);
        const cover = pictureURL(tags && tags.picture);
        if (cover) lib.covers.set(id, cover);
        const t = {
          id,
          url: URL.createObjectURL(f),
          title: clean(tags && tags.title, 200) || guess.title,
          artist: clean(tags && tags.artist, 200) || guess.artist,
          album: clean(tags && tags.album, 200),
          albumArtist: '',
          year: Number(tags && tags.year) || 0,
          no: parseInt(String((tags && tags.track) || '0'), 10) || 0,
          disc: 0,
          genre: clean(tags && tags.genre, 60),
          duration: 0,
          hasCover: !!cover,
          folder: 'session',
          dir: '',
          file: f.name,
          format: (f.name.split('.').pop() || '').toUpperCase(),
          base: f.name.replace(/\.[^.]+$/, '').toLowerCase(),
        };
        lib.files.set(id, f);
        lib.tracks.push(t);
      }
      done += 1;
      if (done % 10 === 0) libEmit({ type: 'scan', done, total: audio.length });
    }
    libEmit({ type: 'scanned', total: lib.tracks.length });
    return libState();
  }
  const isLrc = (text) => /^\s*\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/m.test(text);

  function tagsFromUrl(url, ms = 6000) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) { resolve(null); return; }
      const t = setTimeout(() => resolve(null), ms);
      try {
        window.jsmediatags.read(url, {
          onSuccess: (x) => { clearTimeout(t); resolve((x && x.tags) || null); },
          onError: () => { clearTimeout(t); resolve(null); },
        });
      } catch { clearTimeout(t); resolve(null); }
    });
  }
  const coverOk = new Map();

  window.library = {
    desktop: false,
    auto: !!Native,
    canFolder: false,
    get: async () => {
      if (Native && !nat.loaded) {
        if (await nativeStatus()) {
          await nativeScan(false).catch(noop);
        } else if (!localStorage.getItem('oa-music-asked')) {
          // Müzik bölümü ilk açılışta: izni kendiliğinden iste, verilirse telefondaki bütün müzikleri tara.
          localStorage.setItem('oa-music-asked', '1');
          const r = await Native.requestAudio().catch(() => ({ granted: false }));
          nat.granted = !!(r && r.granted);
          if (nat.granted) await nativeScan(false).catch(noop);
        }
      }
      return libState();
    },
    // Boş ekrandaki ana düğme: izin yoksa izin ister ve tarar; izin varsa ek dosya seçtirir.
    addFolder: async () => {
      if (Native && !(await nativeStatus())) {
        const r = await Native.requestAudio().catch(() => ({ granted: false }));
        nat.granted = !!(r && r.granted);
        if (!nat.granted) {
          throw new Error('Müzik izni verilmedi. Telefonun Ayarlar > Uygulamalar > OA Radyo > İzinler bölümünden “Müzik ve sesler”i açabilirsin.');
        }
        await nativeScan(true);
        return libState();
      }
      const files = await pickFile('audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.lrc', true);
      if (!files.length) return null;
      await addFiles(files);
      return libState();
    },
    removeFolder: async (dir) => {
      if (dir === 'device') return libState();
      for (const t of lib.tracks) URL.revokeObjectURL(t.url);
      for (const u of lib.covers.values()) URL.revokeObjectURL(u);
      lib.tracks = [];
      lib.files.clear();
      lib.covers.clear();
      lib.lyrics.clear();
      lib.lrc.clear();
      return libState();
    },
    rescan: async () => {
      if (Native && (await nativeStatus())) await nativeScan(true);
      return libState();
    },
    cover: async (id) => {
      if (lib.covers.has(id)) return lib.covers.get(id);
      const t = nat.tracks.find((x) => x.id === id);
      if (!t || !t.coverUrl) return null;
      if (coverOk.has(id)) return coverOk.get(id);
      let url = null;
      try { url = (await fetch(t.coverUrl, { method: 'HEAD' })).ok ? t.coverUrl : null; } catch { url = null; }
      coverOk.set(id, url);
      return url;
    },
    lyrics: async (id) => {
      const nt = nat.tracks.find((x) => x.id === id);
      if (nt) {
        const tags = await tagsFromUrl(nt.url);
        const lyr = tags && tags.lyrics ? (typeof tags.lyrics === 'string' ? tags.lyrics : tags.lyrics.lyrics || '') : '';
        return lyr && lyr.trim() ? { text: lyr, synced: isLrc(lyr), source: 'tag' } : null;
      }
      const t = lib.tracks.find((x) => x.id === id);
      if (!t) return null;
      const lrcFile = lib.lrc.get(t.base);
      if (lrcFile) {
        const text = (await lrcFile.text()).replace(/^\uFEFF/, '');
        if (text.trim()) return { text, synced: isLrc(text), source: 'lrc' };
      }
      const tag = lib.lyrics.get(id);
      if (tag && tag.trim()) return { text: tag, synced: isLrc(tag), source: 'tag' };
      return null;
    },
    online: async (q = {}) => {
      if (readSettings().lyricsOnline === false) return { off: true };
      if (!q.artist || !q.title) return null;
      const u = new URL(`${API}/v1/lyrics`);
      u.searchParams.set('artist', clean(q.artist, 120));
      u.searchParams.set('title', clean(q.title, 160));
      if (q.album) u.searchParams.set('album', clean(q.album, 160));
      if (q.duration) u.searchParams.set('duration', String(Math.round(q.duration)));
      try {
        const r = await getJSON(u.toString(), 10000);
        if (!r.ok || !r.j || !r.j.ok) return { error: true };
        if (!r.j.found) return null;
        if (r.j.instrumental) return { text: '', instrumental: true, source: 'lrclib' };
        const text = r.j.synced || r.j.plain || '';
        return text.trim() ? { text, synced: !!r.j.synced, source: 'lrclib' } : null;
      } catch {
        return { error: true };
      }
    },
    reveal: async () => false,
    onEvent: (cb) => libListeners.push(cb),
  };

  // ---------- Telefon düzeni: alt sekmeler, "Daha fazla" paneli, geri tuşu ----------

  const SVG = (p, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${p}</svg>`;
  const TABS = [
    { s: 'discover', label: 'Radyo', icon: SVG('<path d="M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2"/><circle cx="12" cy="12" r="2"/>') },
    { s: 'podcast', label: 'Podcast', icon: SVG('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>') },
    { s: 'music', label: 'Müzik', icon: SVG('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>') },
    { s: 'favorites', label: 'Favoriler', icon: SVG('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>') },
  ];
  const MORE = [
    { s: 'world', label: 'Dünya', icon: SVG('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>') },
    { s: 'recent', label: 'Son dinlenenler', icon: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') },
    { s: 'stats', label: 'İstatistikler', icon: SVG('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>') },
    { s: 'alarms', label: 'Alarmlar', icon: SVG('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3L2 6M19 3l3 3"/>') },
    { s: 'updates', label: 'Güncellemeler', icon: SVG('<path d="M21 12a9 9 0 0 1-15.5 6.3M3 12A9 9 0 0 1 18.5 5.7"/><path d="M3 20v-4h4M21 4v4h-4"/>') },
    { a: 'sleep', label: 'Uyku zamanlayıcı', icon: SVG('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>') },
    { a: 'chat', label: 'Sohbet', icon: SVG('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') },
    { s: 'support', label: 'Destek ve Hakkında', icon: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>') },
    { a: 'settings', label: 'Ayarlar', icon: SVG('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>') },
  ];
  const MORE_SECTIONS = new Set(MORE.filter((m) => m.s).map((m) => m.s));

  function setupTabs() {
    if (document.getElementById('tabbar')) return;
    const bar = document.createElement('nav');
    bar.id = 'tabbar';
    bar.className = 'tabbar';
    bar.setAttribute('aria-label', 'Ana sekmeler');
    bar.innerHTML = TABS.map((t) => `<button type="button" class="tab" data-tab="${t.s}" data-action="section" data-section="${t.s}"><span class="tab-ic">${t.icon}</span><span class="tab-l">${t.label}</span></button>`).join('')
      + `<button type="button" class="tab" data-tab="more" id="tab-more" aria-expanded="false" aria-controls="more-sheet"><span class="tab-ic">${SVG('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>', true)}</span><span class="tab-l">Daha fazla</span></button>`;
    document.body.appendChild(bar);

    const sheet = document.createElement('div');
    sheet.id = 'more-sheet';
    sheet.className = 'more-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `<button type="button" class="more-scrim" aria-label="Kapat"></button>
      <div class="more-panel" role="dialog" aria-modal="true" aria-labelledby="more-title">
        <span class="more-grip" aria-hidden="true"></span>
        <h2 id="more-title">Daha fazla</h2>
        <div class="more-grid">${MORE.map((m) => `<button type="button" class="more-item" ${m.s ? `data-action="section" data-section="${m.s}"` : `data-more="${m.a}"`}>${m.icon}<span>${m.label}</span></button>`).join('')}</div>
      </div>`;
    document.body.appendChild(sheet);
    const moreBtn = document.getElementById('tab-more');
    const setSheet = (on) => {
      sheet.hidden = !on;
      moreBtn.setAttribute('aria-expanded', String(on));
      root.classList.toggle('more-open', on);
      syncTabs();
      if (on) { const first = sheet.querySelector('.more-item'); if (first) first.focus(); }
    };
    window.__closeSheet = () => { const was = !sheet.hidden; if (was) setSheet(false); return was; };
    moreBtn.addEventListener('click', () => setSheet(sheet.hidden));
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('.more-scrim')) { setSheet(false); return; }
      const item = e.target.closest('.more-item');
      if (!item) return;
      setSheet(false);
      const a = item.dataset.more;
      if (a === 'chat') { const b = document.getElementById('btn-chat'); if (b) b.click(); }
      if (a === 'sleep' && typeof toggleSleepMenu === 'function') setTimeout(() => toggleSleepMenu(true), 0);
      if (a === 'settings') { const b = document.querySelector('.sidebar [data-action="settings-open"]'); if (b) b.click(); }
    });

    // Seçili sekmeyi ve bölüm sınıfını güncel tut (selectSection'ı sar).
    if (typeof window.selectSection === 'function' && !window.selectSection.__tabs) {
      const orig = window.selectSection;
      const wrapped = function (section, ...rest) {
        const r = orig.call(this, section, ...rest);
        syncTabs();
        return r;
      };
      wrapped.__tabs = true;
      window.selectSection = wrapped;
    }
    syncTabs();
  }
  function syncTabs() {
    const sec = (typeof state === 'object' && state.section) || 'discover';
    for (const c of [...root.classList]) if (c.startsWith('sec-')) root.classList.remove(c);
    root.classList.add(`sec-${sec}`);
    const sheetOpen = root.classList.contains('more-open');
    const active = sec === 'nowplaying' ? ((window.OAMedia && OAMedia.item() && OAMedia.item().kind === 'episode') ? 'podcast' : 'music') : MORE_SECTIONS.has(sec) ? 'more' : sec;
    for (const b of document.querySelectorAll('#tabbar .tab')) {
      const on = sheetOpen ? b.dataset.tab === 'more' : b.dataset.tab === active;
      b.classList.toggle('active', on);
      if (b.dataset.tab !== 'more') { if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
    }
    const pick = document.getElementById('nav-toggle');
    if (pick) pick.setAttribute('aria-label', sec === 'world' ? 'Dil ya da ülke seç' : 'Menü');
  }

  // Dünya bölümünde dil/ülke seçimi kenar çubuğunda: telefonda üstteki düğme çekmece olarak açar.
  function setupWorldPicker() {
    const bar = document.querySelector('.titlebar');
    if (!bar || document.getElementById('nav-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'nav-toggle';
    btn.type = 'button';
    btn.className = 'icon-btn nav-toggle';
    btn.setAttribute('aria-label', 'Dil ya da ülke seç');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = SVG('<path d="M4 6h16M7 12h10M10 18h4"/>');
    bar.prepend(btn);
    const scrim = document.createElement('div');
    scrim.className = 'nav-scrim';
    document.body.appendChild(scrim);
    const setOpen = (on) => { root.classList.toggle('nav-open', on); btn.setAttribute('aria-expanded', String(on)); };
    btn.addEventListener('click', () => setOpen(!root.classList.contains('nav-open')));
    scrim.addEventListener('click', () => setOpen(false));
    document.querySelector('.sidebar').addEventListener('click', (e) => {
      if (e.target.closest('.nav-item, .side-fav, [data-action="pick-lang"], [data-action="pick-country"]')) setOpen(false);
    });
    window.__closeNav = () => { const was = root.classList.contains('nav-open'); setOpen(false); return was; };
  }

  // ---------- Arka planda çalma ve bildirim/kilit ekranı kontrolleri ----------

  function setupMediaService() {
    if (!Native || typeof audio === 'undefined') return;
    let last = '';
    let askedNotif = false;
    const info = () => {
      const m = window.OAMedia && OAMedia.item();
      if (m) return { title: m.title || '', artist: m.artist || (m.kind === 'episode' ? 'Podcast' : ''), canSkip: true };
      const s = typeof state === 'object' ? state.current : null;
      if (!s) return null;
      return { title: s.name || 'OA Radyo', artist: (state.playing && state.nowTitle) || 'Canlı yayın', canSkip: true };
    };
    const push = () => {
      const i = info();
      if (!i) return;
      const playing = !audio.paused;
      const key = JSON.stringify([i.title, i.artist, playing]);
      if (key === last) return;
      last = key;
      Native.mediaUpdate({ ...i, playing }).catch(noop);
    };
    audio.addEventListener('playing', () => {
      if (!askedNotif) { askedNotif = true; Native.requestNotifications().catch(noop); }
      push();
    });
    audio.addEventListener('pause', push);
    setInterval(push, 4000);
    Native.addListener('media', (ev) => {
      const a = ev && ev.action;
      if (a === 'play') { if (audio.paused) togglePlay(); }
      else if (a === 'pause') { if (!audio.paused) togglePlay(); }
      else if (a === 'toggle') togglePlay();
      else if (a === 'next') step(1);
      else if (a === 'prev') step(-1);
      else if (a === 'stop') { if (!audio.paused) togglePlay(); last = ''; }
    });
  }

  function setupShell() {
    const search = document.getElementById('search');
    if (search) search.placeholder = 'İstasyon ara';
    setupWorldPicker();
    setupTabs();
    setupMediaService();
    // İzin önceden verildiyse müzikleri arka planda hazırla.
    if (Native) nativeStatus().then((ok) => { if (ok) nativeScan(false).catch(noop); });
    if (Plugins.App && Plugins.App.addListener) {
      Plugins.App.addListener('backButton', () => {
        const dlg = document.querySelector('dialog[open]');
        if (dlg) { dlg.close(); return; }
        if (window.__closeSheet && window.__closeSheet()) return;
        if (window.__closeNav && window.__closeNav()) return;
        const menu = document.querySelector('.menu:not([hidden])');
        if (menu && menu.id === 'sleep-menu' && typeof toggleSleepMenu === 'function') { toggleSleepMenu(false); return; }
        if (menu) { menu.hidden = true; return; }
        if (typeof state === 'object' && state.section && state.section !== 'discover' && typeof selectSection === 'function') {
          selectSection(state.section === 'nowplaying' ? 'music' : 'discover');
          return;
        }
        if (Plugins.App.minimizeApp) Plugins.App.minimizeApp().catch(noop);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupShell);
  else setupShell();
})();
