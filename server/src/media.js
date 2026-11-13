/*
 * OA Radyo'nun web ve Android sürümü için podcast ve şarkı sözü vekili.
 * Tarayıcı bu adreslere doğrudan ulaşamaz (CORS), bu yüzden istek sunucudan geçer.
 * Hiçbir şey saklanmaz; yanıtlar yalnızca Cloudflare önbelleğinde kısa süre tutulur.
 *
 *   GET /v1/podcast/search?term=&country=TR&limit=25   iTunes'ta podcast arama
 *   GET /v1/podcast/feed?url=https://…                 RSS beslemesi (en fazla 8 MB)
 *   GET /v1/lyrics?artist=&title=&album=&duration=     LRCLIB'de şarkı sözü
 */

const UA = 'OA Radyo (https://oalabs.dev/radyo/)';
const MAX_FEED = 8 * 1024 * 1024;
const clean = (v, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function out(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

/** Aynı isteğin yanıtını Cloudflare önbelleğinden ver; yoksa üret ve sakla. */
async function cached(req, ctx, maxAge, make) {
  const key = new Request(new URL(req.url).toString(), { method: 'GET' });
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  if (res.status === 200 && maxAge) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function fetchTimeout(url, ms, headers = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

export async function podcastSearch(req, url, ctx) {
  const term = clean(url.searchParams.get('term'), 100);
  if (!term) return out({ ok: false, error: 'term' }, 400);
  const country = /^[a-z]{2}$/i.test(url.searchParams.get('country') || '') ? url.searchParams.get('country').toUpperCase() : 'TR';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 25));
  return cached(req, ctx, 6 * 3600, async () => {
    const q = new URL('https://itunes.apple.com/search');
    q.searchParams.set('media', 'podcast');
    q.searchParams.set('entity', 'podcast');
    q.searchParams.set('term', term);
    q.searchParams.set('country', country);
    q.searchParams.set('limit', String(limit));
    let res;
    try {
      res = await fetchTimeout(q.toString(), 12000);
    } catch {
      return out({ ok: false, error: 'ulasilamadi' }, 502);
    }
    if (!res.ok) return out({ ok: false, error: `itunes ${res.status}` }, 502);
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
    return out({ ok: true, results: list }, 200, 6 * 3600);
  });
}

/** Özel ağ adreslerine ve standart dışı bağlantı noktalarına gitme. */
function safeTarget(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (/^(\d+\.){3}\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null;
  }
  if (host.includes(':')) return null; // IPv6 adresi doğrudan yazılmışsa reddet
  return u;
}

export async function podcastFeed(req, url, ctx) {
  const target = safeTarget(String(url.searchParams.get('url') || '').trim());
  if (!target || target.toString().length > 2000) return out({ ok: false, error: 'Geçerli bir RSS adresi gir (https://… ile başlamalı).' }, 400);
  return cached(req, ctx, 30 * 60, async () => {
    let res;
    try {
      res = await fetchTimeout(target.toString(), 20000, { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5' });
    } catch {
      return out({ ok: false, error: 'Besleme açılamadı. Adresi ve internet bağlantını kontrol et.' }, 502);
    }
    if (!res.ok) return out({ ok: false, error: `Besleme açılamadı (HTTP ${res.status}).` }, 502);
    if ((Number(res.headers.get('content-length')) || 0) > MAX_FEED) return out({ ok: false, error: 'Besleme çok büyük.' }, 413);
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_FEED) {
        reader.cancel().catch(() => {});
        return out({ ok: false, error: 'Besleme çok büyük.' }, 413);
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { buf.set(c, at); at += c.length; }
    const text = new TextDecoder('utf-8').decode(buf);
    if (!/<(rss|feed|channel)[\s>]/i.test(text.slice(0, 5000))) return out({ ok: false, error: 'Bu adres bir podcast beslemesi değil.' }, 422);
    return out({ ok: true, text, url: res.url || target.toString() }, 200, 30 * 60);
  });
}

async function lrclib(params) {
  const q = new URL('https://lrclib.net/api/get');
  for (const [k, v] of Object.entries(params)) if (v) q.searchParams.set(k, String(v));
  const res = await fetchTimeout(q.toString(), 8000);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function lyrics(req, url, ctx) {
  const artist = clean(url.searchParams.get('artist'), 120);
  const title = clean(url.searchParams.get('title'), 160);
  const album = clean(url.searchParams.get('album'), 160);
  const duration = Math.round(Number(url.searchParams.get('duration')) || 0);
  if (!artist || !title) return out({ ok: false, error: 'eksik' }, 400);
  return cached(req, ctx, 24 * 3600, async () => {
    let j = null;
    try {
      j = await lrclib({ artist_name: artist, track_name: title, album_name: album, duration: duration || '' });
      if (!j && (album || duration)) j = await lrclib({ artist_name: artist, track_name: title });
    } catch {
      return out({ ok: false, error: 'ulasilamadi' }, 502);
    }
    if (!j) return out({ ok: true, found: false }, 200, 24 * 3600);
    return out({
      ok: true,
      found: true,
      instrumental: !!j.instrumental,
      synced: typeof j.syncedLyrics === 'string' ? j.syncedLyrics : '',
      plain: typeof j.plainLyrics === 'string' ? j.plainLyrics : '',
    }, 200, 24 * 3600);
  });
}
