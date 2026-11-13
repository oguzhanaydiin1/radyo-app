'use strict';

/*
 * Podcast: iTunes'ta arama, RSS beslemesini getirme ve önerilen programlar listesi.
 * Besleme metni arayüze olduğu gibi verilir; ayrıştırma arayüzde (DOMParser) yapılır.
 * Bölümler podcast'in kendi sunucusundan çalar; uygulama hiçbir bölümü indirip saklamaz.
 */

const { app, net } = require('electron');
const path = require('node:path');
const fsp = require('node:fs/promises');

const pkg = require('../package.json');
const CURATED_URL = pkg.updateSource
  ? `https://raw.githubusercontent.com/${pkg.updateSource.owner}/${pkg.updateSource.repo}/main/stations/podcastler.json`
  : '';
const MAX_FEED = 8 * 1024 * 1024;

const ua = () => `OA Radyo ${app.getVersion()} (https://oalabs.dev/radyo/)`;
const clean = (v, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function fetchWithTimeout(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await net.fetch(url, { headers: { 'User-Agent': ua(), ...headers }, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

const searchCache = new Map();
async function search(opts = {}) {
  const term = clean(opts.term, 100);
  if (!term) return [];
  const country = /^[a-z]{2}$/i.test(String(opts.country || '')) ? String(opts.country).toUpperCase() : 'TR';
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 25));
  const key = `${country}|${limit}|${term.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.list;
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('media', 'podcast');
  url.searchParams.set('entity', 'podcast');
  url.searchParams.set('term', term);
  url.searchParams.set('country', country);
  url.searchParams.set('limit', String(limit));
  let res;
  try {
    res = await fetchWithTimeout(url.toString(), 12000);
  } catch {
    throw new Error('Podcast aramasına ulaşılamadı. İnternet bağlantını kontrol et.');
  }
  if (!res.ok) throw new Error(`Podcast araması yapılamadı (HTTP ${res.status}).`);
  const j = await res.json().catch(() => ({}));
  const list = (Array.isArray(j.results) ? j.results : [])
    .filter((r) => r && /^https?:\/\//i.test(String(r.feedUrl || '')))
    .map((r) => ({
      id: String(r.collectionId || ''),
      name: clean(r.collectionName || r.trackName, 160),
      author: clean(r.artistName, 160),
      feed: String(r.feedUrl).trim(),
      art: String(r.artworkUrl600 || r.artworkUrl100 || '').trim(),
      genre: clean(r.primaryGenreName, 60),
      count: Number(r.trackCount) || 0,
      country,
    }));
  searchCache.set(key, { at: Date.now(), list });
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value);
  return list;
}

const feedCache = new Map();
async function feed(url, opts = {}) {
  const u = String(url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(u) || u.length > 2000) throw new Error('Geçerli bir RSS adresi gir (https://… ile başlamalı).');
  const hit = feedCache.get(u);
  if (!opts.force && hit && Date.now() - hit.at < 30 * 60e3) return hit.data;
  let res;
  try {
    res = await fetchWithTimeout(u, 20000, { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5' });
  } catch {
    throw new Error('Besleme açılamadı. Adresi ve internet bağlantını kontrol et.');
  }
  if (!res.ok) throw new Error(`Besleme açılamadı (HTTP ${res.status}).`);
  const len = Number(res.headers.get('content-length')) || 0;
  if (len > MAX_FEED) throw new Error('Besleme çok büyük.');
  // Gövdeyi sınırı aşmadan oku.
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_FEED) {
      reader.cancel().catch(() => {});
      throw new Error('Besleme çok büyük.');
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  if (!/<(rss|feed|channel)[\s>]/i.test(text.slice(0, 5000))) throw new Error('Bu adres bir podcast beslemesi değil.');
  const data = { text, url: res.url || u };
  feedCache.set(u, { at: Date.now(), data });
  if (feedCache.size > 40) feedCache.delete(feedCache.keys().next().value);
  return data;
}

// ---------- Önerilen programlar ----------

function parseCurated(j) {
  const pick = (arr) => (Array.isArray(arr) ? arr : [])
    .filter((x) => x && typeof x.term === 'string' && x.term.trim())
    .slice(0, 40)
    .map((x) => ({ term: clean(x.term, 80), cat: clean(x.cat, 30) }));
  return { tr: pick(j && j.tr), en: pick(j && j.en) };
}

let curated = parseCurated(require('./podcastler.json'));
let curatedAt = 0;
const cacheFile = () => path.join(app.getPath('userData'), 'podcastler.json');

async function getCurated() {
  if (Date.now() - curatedAt < 6 * 3600e3) return curated;
  curatedAt = Date.now();
  try {
    const c = parseCurated(JSON.parse(await fsp.readFile(cacheFile(), 'utf8')));
    if (c.tr.length || c.en.length) curated = c;
  } catch { /* önbellek yok */ }
  if (CURATED_URL) {
    try {
      const res = await fetchWithTimeout(`${CURATED_URL}?t=${Date.now()}`, 5000);
      if (res.ok) {
        const text = await res.text();
        const c = parseCurated(JSON.parse(text));
        if (c.tr.length || c.en.length) {
          curated = c;
          fsp.writeFile(cacheFile(), text).catch(() => {});
        }
      }
    } catch { /* çevrimdışı: eldeki liste */ }
  }
  return curated;
}

module.exports = { search, feed, curated: getCurated };
