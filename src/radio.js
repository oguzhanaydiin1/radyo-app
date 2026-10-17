'use strict';

/* Radio Browser (https://www.radio-browser.info) bağlantısı. */

const { app, ipcMain, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];
let serverIndex = 0;

const cleanText = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
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
      const res = await net.fetch(url.toString(), { headers: { 'User-Agent': 'RadyoApp/0.3' }, signal: controller.signal });
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

function toStation(j) {
  const str = (k) => (j[k] == null ? '' : String(j[k])).trim();
  return {
    id: str('stationuuid'),
    name: str('name') || 'Adsız istasyon',
    url: str('url_resolved') || str('url'),
    favicon: str('favicon'),
    homepage: str('homepage'),
    country: str('countrycode'),
    language: str('language'),
    codec: str('codec'),
    bitrate: Number(j.bitrate) || 0,
    tags: str('tags').split(',').map((t) => t.trim()).filter(Boolean),
    hls: Number(j.hls) === 1,
    clicks: Number(j.clickcount) || 0,
    votes: Number(j.votes) || 0,
  };
}

/** Bozuk adresleri ve aynı yayının tekrar kayıtlarını ayıklar (ilk = en popüler kalır). */
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

// ---------- Türkiye'nin tüm istasyonları (günde bir yenilenir) ----------

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const cacheFile = () => path.join(app.getPath('userData'), 'istasyonlar-TR-v3.json');

async function readCache() {
  try {
    const j = JSON.parse(await fs.readFile(cacheFile(), 'utf8'));
    if (Array.isArray(j.stations) && Number.isFinite(j.updatedAt)) return j;
  } catch { /* önbellek yok ya da bozuk */ }
  return null;
}

const memCache = new Map();
async function cached(key, maxAge, fn) {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < maxAge) return hit.data;
  const data = await fn();
  memCache.set(key, { at: Date.now(), data });
  return data;
}

function register() {
  ipcMain.handle('radio:country', async (_event, opts = {}) => {
    const force = !!(opts && opts.force);
    const cache = await readCache();
    if (!force && cache && Date.now() - cache.updatedAt < CACHE_MAX_AGE) {
      return { stations: cache.stations, updatedAt: cache.updatedAt, stale: false };
    }
    try {
      const data = await apiGet('/json/stations/bycountrycodeexact/TR',
        { hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '100000' }, 45000);
      const stations = dedupe(Array.isArray(data) ? data.map(toStation) : []);
      if (!stations.length && cache) return { stations: cache.stations, updatedAt: cache.updatedAt, stale: true };
      const out = { updatedAt: Date.now(), stations };
      fs.writeFile(cacheFile(), JSON.stringify(out)).catch(() => {});
      return { ...out, stale: false };
    } catch (err) {
      if (cache) return { stations: cache.stations, updatedAt: cache.updatedAt, stale: true };
      throw err;
    }
  });

  ipcMain.handle('radio:languages', () => cached('languages', 6 * 3600e3, async () => {
    const data = await apiGet('/json/languages', { hidebroken: 'true', order: 'stationcount', reverse: 'true' }, 30000);
    return (Array.isArray(data) ? data : [])
      .map((l) => ({ name: String(l.name || '').trim().toLowerCase(), code: String(l.iso_639 || '').trim().toLowerCase(), count: Number(l.stationcount) || 0 }))
      .filter((l) => l.name && l.count >= 5);
  }));

  ipcMain.handle('radio:countries', () => cached('countries', 6 * 3600e3, async () => {
    const data = await apiGet('/json/countries', { hidebroken: 'true', order: 'stationcount', reverse: 'true' }, 30000);
    return (Array.isArray(data) ? data : [])
      .map((c) => ({ code: String(c.iso_3166_1 || '').trim().toUpperCase(), name: String(c.name || '').trim(), count: Number(c.stationcount) || 0 }))
      .filter((c) => /^[A-Z]{2}$/.test(c.code) && c.count > 0);
  }));

  ipcMain.handle('radio:stations', async (_event, opts = {}) => {
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
  });

  ipcMain.handle('radio:search', async (_event, opts = {}) => {
    const query = cleanText(opts && opts.query);
    if (!query) return [];
    const data = await apiGet('/json/stations/search',
      { name: query, order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: '60' });
    return dedupe(Array.isArray(data) ? data.map(toStation) : []);
  });

  ipcMain.handle('radio:click', async (_event, id) => {
    if (typeof id !== 'string' || !UUID.test(id)) return;
    try {
      await apiGet(`/json/url/${id}`);
    } catch { /* dinlenme sayımı başarısız olsa da sorun değil */ }
  });

  // Radio Browser'da istasyona oy verme (aynı istasyona 10 dakikada bir oy).
  ipcMain.handle('radio:vote', async (_event, id) => {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, message: 'Geçersiz istasyon.' };
    try {
      const r = await apiGet(`/json/vote/${id}`);
      if (r && r.ok) return { ok: true };
      const tooOften = /too often/i.test(String(r && r.message));
      return { ok: false, message: tooOften ? 'Bu istasyona kısa süre önce oy verildi, biraz sonra tekrar dene.' : 'Oy verilemedi.' };
    } catch {
      return { ok: false, message: 'Oy verilemedi, internet bağlantını kontrol et.' };
    }
  });
}

module.exports = { register };
