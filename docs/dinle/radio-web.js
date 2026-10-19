'use strict';

/* Radyo — web sürümü köprüsü.
   Masaüstünde main.js + preload.js'in yaptığı işi tarayıcıda yapar:
   app.js'in kullandığı window.radio arayüzünü aynı adlarla sağlar.
   Radio Browser API'si tarayıcıdan doğrudan çağrılabildiği (CORS) için sunucu gerekmez. */

(() => {
  const SERVERS = [
    'de1.api.radio-browser.info',
    'de2.api.radio-browser.info',
    'fi1.api.radio-browser.info',
  ];
  let serverIndex = 0;

  // Site https ise tarayıcı http yayınları engeller (mixed content).
  // Bu yayınlar için önce aynı adresin https sürümü denenir.
  const SECURE_PAGE = location.protocol === 'https:';

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
        if (res.ok) {
          serverIndex = index;
          return await res.json();
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err && err.name === 'AbortError' ? 'zaman aşımı' : String(err && err.message);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`İstasyon listesine ulaşılamadı. İnternet bağlantını kontrol et. (${lastError})`);
  }

  const secure = (u) => (SECURE_PAGE && /^http:\/\//i.test(u) ? u.replace(/^http:/i, 'https:') : u);

  function toStation(j) {
    const str = (k) => (j[k] == null ? '' : String(j[k])).trim();
    return {
      id: str('stationuuid'),
      name: str('name') || 'Adsız istasyon',
      url: secure(str('url_resolved') || str('url')),
      favicon: secure(str('favicon')),
      homepage: str('homepage'),
      country: str('countrycode'),
      language: str('language'),
      codec: str('codec'),
      bitrate: Number(j.bitrate) || 0,
      tags: str('tags').split(',').map((t) => t.trim()).filter(Boolean),
      hls: Number(j.hls) === 1,
      clicks: Number(j.clickcount) || 0,
    };
  }

  /** Bozuk adresleri ve aynı yayının tekrar kayıtlarını ayıklar (main.js ile aynı). */
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

  const cleanText = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // ---------- Türkiye listesi: tarayıcıda günde bir yenilenir ----------

  const CACHE_KEY = 'istasyonlar-TR-web-v1';
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

  function readCache() {
    try {
      const j = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (j && Array.isArray(j.stations) && Number.isFinite(j.updatedAt)) return j;
    } catch { /* yok ya da bozuk */ }
    return null;
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* yer yoksa geç */ }
  }

  async function country(opts = {}) {
    const force = !!(opts && opts.force);
    const cache = readCache();
    if (!force && cache && Date.now() - cache.updatedAt < CACHE_MAX_AGE) {
      return { stations: cache.stations, updatedAt: cache.updatedAt, stale: false };
    }
    try {
      const data = await apiGet(
        '/json/stations/bycountrycodeexact/TR',
        { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '100000' },
        45000,
      );
      const stations = dedupe(Array.isArray(data) ? data.map(toStation) : []);
      if (!stations.length && cache) return { stations: cache.stations, updatedAt: cache.updatedAt, stale: true };
      const out = { updatedAt: Date.now(), stations };
      writeCache(out);
      return { ...out, stale: false };
    } catch (err) {
      if (cache) return { stations: cache.stations, updatedAt: cache.updatedAt, stale: true };
      throw err;
    }
  }

  // ---------- Dünya ----------

  const memCache = new Map();
  async function cached(key, maxAge, fn) {
    const hit = memCache.get(key);
    if (hit && Date.now() - hit.at < maxAge) return hit.data;
    const data = await fn();
    memCache.set(key, { at: Date.now(), data });
    return data;
  }

  const languages = () =>
    cached('languages', 6 * 3600e3, async () => {
      const data = await apiGet('/json/languages', { hidebroken: 'true', order: 'stationcount', reverse: 'true' }, 30000);
      return (Array.isArray(data) ? data : [])
        .map((l) => ({
          name: String(l.name || '').trim().toLowerCase(),
          code: String(l.iso_639 || '').trim().toLowerCase(),
          count: Number(l.stationcount) || 0,
        }))
        .filter((l) => l.name && l.count >= 5);
    });

  const countries = () =>
    cached('countries', 6 * 3600e3, async () => {
      const data = await apiGet('/json/countries', { hidebroken: 'true', order: 'stationcount', reverse: 'true' }, 30000);
      return (Array.isArray(data) ? data : [])
        .map((c) => ({ code: String(c.iso_3166_1 || '').trim().toUpperCase(), name: String(c.name || '').trim(), count: Number(c.stationcount) || 0 }))
        .filter((c) => /^[A-Z]{2}$/.test(c.code) && c.count > 0);
    });

  async function stations(opts = {}) {
    const by = opts && opts.by;
    if (by === 'language') {
      const name = cleanText(opts.value, 60).toLowerCase();
      if (!/^[\p{L}\p{M} .'()-]+$/u.test(name)) throw new Error('Geçersiz dil seçimi.');
      return cached(`lang:${name}`, 3600e3, async () => {
        const data = await apiGet(`/json/stations/bylanguageexact/${encodeURIComponent(name)}`,
          { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '3000' }, 45000);
        return dedupe(Array.isArray(data) ? data.map(toStation) : []);
      });
    }
    if (by === 'country') {
      const code = cleanText(opts.value, 2).toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) throw new Error('Geçersiz ülke seçimi.');
      return cached(`country:${code}`, 3600e3, async () => {
        const data = await apiGet(`/json/stations/bycountrycodeexact/${code}`,
          { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '5000' }, 45000);
        return dedupe(Array.isArray(data) ? data.map(toStation) : []);
      });
    }
    throw new Error('Geçersiz seçim.');
  }

  async function search(opts = {}) {
    const query = cleanText(opts && opts.query);
    if (!query) return [];
    const data = await apiGet('/json/stations/search', {
      name: query, order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: '60',
    });
    return dedupe(Array.isArray(data) ? data.map(toStation) : []);
  }

  async function click(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(id)) return;
    try { await apiGet(`/json/url/${id}`); } catch { /* önemsiz */ }
  }

  window.radio = { country, languages, countries, stations, search, click };
})();
