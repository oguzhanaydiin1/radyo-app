/*
 * OA Labs sunucusu (Cloudflare Workers) — api.oalabs.dev
 *
 *   POST /v1/ping              İsimsiz kullanım sayımı (uygulama, izin verildiyse)
 *   POST /v1/report            Uygulama hata raporu (isimsiz, kullanıcı kapatabilir)
 *   GET  /v1/admin/errors      Son hata raporları (yönetici)
 *   GET  /v1/stats             Toplu istatistikler (yalnızca yönetici anahtarıyla)
 *   POST /v1/feedback, GET/POST /v1/ideas, POST /v1/ideas/vote  Geri bildirim ve fikir panosu (ideas.js)
 *   GET  /indir/pusula/{windows|android|zip}  Pusula'nın son sürüm dosyası (GitHub'dan, önbellekli)
 *   GET  /v1/pusula/latest     Son sürüm numarası ve dosya boyutları
 *   GET  /indir/kopru/{windows|android|zip}, /v1/kopru/latest  Aynısı, Pusula Köprü için
 *   GET  /v1/kopru/ws/:kutu    Pusula Köprü aktarımı (WebSocket): eşleşmiş iki cihaz farklı ağdayken
 *   PUT/GET/DELETE /v1/kopru/file/:kutu/:id   Aktarılan dosya (geçici, en fazla 100 MB, 24 saat)
 *   POST /v1/site/visit        Site sayfa görüntüleme (oalabs.dev, çerezsiz)
 *   POST /v1/site/live         "Şu an sitede" sinyali (25 sn'de bir); { live } döner
 *   GET  /v1/admin/site        Site ziyaret istatistikleri ve anlık ziyaretçiler (yönetici)
 *   GET  /v1/chat/:oda         Canlı sohbet (WebSocket), her radyo için bir oda
 *   GET  /v1/admin/chat/:oda   Odanın son mesajları, kimlik özetleriyle (yönetici)
 *   POST /v1/admin/chat/:oda   { action: "delete", id } | { action: "ban", uid } (yönetici)
 *
 *   /v1/auth/…, /v1/me, /v1/admin/users  Üyelik (ayrıntılar auth.js'te)
 *
 * Gizli değerler (Cloudflare'de "secret" olarak): ADMIN_KEY, PEPPER, RESEND_API_KEY (isteğe bağlı).
 */

import { sendFeedback, listIdeas, addIdea, voteIdea, adminFeedback, adminIdeas, listReviews, adminReviews } from './ideas.js';
import { start, verify, logout, me, deleteMe, adminUsers, mySessions, emailStart, emailVerify, mySync, myAvatar, setAvatar, deleteAvatar } from './auth.js';

const APPS = new Set(['radyo']);
const REPORT_APPS = new Set(['harrier']);
const ROOM_RE = /^[A-Za-z0-9_-]{3,80}$/;
const PANEL_ORIGINS = new Set(['https://oalabs.dev', 'https://www.oalabs.dev']);

function cors(origin, admin, account, env) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (account) {
    // Üyelik istekleri çerez taşır: yalnızca kendi sitemizden.
    if (PANEL_ORIGINS.has(origin) || (env.DEV_ORIGIN && origin === env.DEV_ORIGIN)) {
      h['Access-Control-Allow-Origin'] = origin;
      h['Access-Control-Allow-Credentials'] = 'true';
      h.Vary = 'Origin';
    }
  } else if (admin) {
    if (PANEL_ORIGINS.has(origin)) { h['Access-Control-Allow-Origin'] = origin; h.Vary = 'Origin'; }
  } else {
    h['Access-Control-Allow-Origin'] = '*';
  }
  return h;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

async function withCors(p, h) {
  const r = await p;
  return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...h } });
}

function isAdmin(req, env) {
  const key = env.ADMIN_KEY || '';
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (key.length < 16 || got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const today = () => new Date().toISOString().slice(0, 10);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ---------- Hata raporları ----------

async function report(req, env) {
  let b;
  try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  const app = clean(b && b.app, 20);
  const id = clean(b && b.id, 64);
  const message = clean(b && b.msg, 500);
  if (!REPORT_APPS.has(app) || !/^[0-9a-f]{16,64}$/i.test(id) || !message) return json({ ok: false }, 400);
  // Yığın izinde satır sonları korunur; yalnızca kontrol karakterleri ayıklanır.
  const stack = typeof b.stack === 'string' ? b.stack.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, 4000) : '';
  const install = await sha(`${env.PEPPER || 'oa'}:${app}:${id}`);
  const since = new Date(Date.now() - 86400e3).toISOString();
  const [mine, all] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM error_reports WHERE install = ?1 AND created > ?2').bind(install, since),
    env.DB.prepare('SELECT COUNT(*) AS n FROM error_reports WHERE created > ?1').bind(since),
  ]);
  // Bir kurulumdan günde en fazla 20, toplamda günde en fazla 5000 rapor.
  if (mine.results[0].n >= 20 || all.results[0].n >= 5000) return json({ ok: true, skipped: true });
  const stmts = [
    env.DB.prepare('INSERT INTO error_reports (created, app, version, os, lang, install, message, stack) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(new Date().toISOString(), app, clean(b.v, 20), clean(b.os, 120), clean(b.lang, 5), install, message, stack),
  ];
  // Ara sıra 90 günden eski raporları sil.
  if (Math.random() < 0.02) {
    stmts.push(env.DB.prepare('DELETE FROM error_reports WHERE created < ?1').bind(new Date(Date.now() - 90 * 86400e3).toISOString()));
  }
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function adminErrors(url, env) {
  const app = REPORT_APPS.has(url.searchParams.get('app')) ? url.searchParams.get('app') : 'harrier';
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 100));
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const [rows, top] = await env.DB.batch([
    env.DB.prepare('SELECT id, created, version, os, lang, install, message, stack FROM error_reports WHERE app = ?1 ORDER BY id DESC LIMIT ?2').bind(app, limit),
    env.DB.prepare(`SELECT message, COUNT(*) AS n, COUNT(DISTINCT install) AS installs, MAX(created) AS last
                    FROM error_reports WHERE app = ?1 AND created > ?2 GROUP BY message ORDER BY n DESC LIMIT 20`).bind(app, since),
  ]);
  return { ok: true, app, reports: rows.results, top: top.results };
}

// ---------- Pusula Browser indirmeleri ----------
// Site düğmeleri dosyayı GitHub yerine buradan indirir: GitHub'ın dosya sunucusu ara sıra 504 veriyor.
// Son sürümün bilgisi 10 dakika, dosyanın kendisi (sürüm adıyla) Cloudflare önbelleğinde tutulur;
// önbellekte yoksa GitHub'dan alınıp aynı anda hem kullanıcıya akar hem önbelleğe yazılır.

const DL_APPS = {
  pusula: {
    repo: 'oguzhanaydiin1/oa-tarayici',
    files: { windows: 'Pusula-Kurulum.exe', android: 'Pusula-Android.apk', zip: 'Pusula-Windows.zip' },
  },
  kopru: {
    repo: 'oguzhanaydiin1/pusula-kopru',
    files: { windows: 'Pusula-Kopru-Kurulum.exe', android: 'Pusula-Kopru-Android.apk', zip: 'Pusula-Kopru-Windows.zip' },
  },
};

async function appLatest(app, ctx) {
  const { repo: PUSULA_REPO, files: PUSULA_FILES } = DL_APPS[app];
  const cache = caches.default;
  const key = new Request(`https://api.oalabs.dev/_cache/${app}-latest`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const r = await fetch(`https://api.github.com/repos/${PUSULA_REPO}/releases/latest`, {
    headers: { 'User-Agent': 'oalabs-api', Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('github ' + r.status);
  const j = await r.json();
  const files = {};
  for (const [k, name] of Object.entries(PUSULA_FILES)) {
    const a = (j.assets || []).find((x) => x.name === name);
    if (a) files[k] = { name, size: a.size, url: a.browser_download_url };
  }
  const out = { version: String(j.tag_name || '').replace(/^v/, ''), date: j.published_at, files };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=600' } })));
  return out;
}

async function appDownload(app, kind, ctx) {
  const { repo: PUSULA_REPO, files: PUSULA_FILES } = DL_APPS[app];
  let info;
  try { info = await appLatest(app, ctx); } catch {
    return Response.redirect(`https://github.com/${PUSULA_REPO}/releases/latest/download/${PUSULA_FILES[kind]}`, 302);
  }
  const f = info.files[kind];
  if (!f) return new Response('Bulunamadı', { status: 404 });
  const headers = {
    'Content-Type': kind === 'android' ? 'application/vnd.android.package-archive' : 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${f.name}"`,
    'Content-Length': String(f.size),
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  };
  const cache = caches.default;
  const key = new Request(`https://api.oalabs.dev/_cache/${app}/${info.version}/${f.name}`);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers });
  const r = await fetch(f.url, { headers: { 'User-Agent': 'oalabs-api' } });
  if (!r.ok || !r.body) return Response.redirect(f.url, 302);
  const [a, b] = r.body.tee();
  ctx.waitUntil(cache.put(key, new Response(b, { headers: { 'Cache-Control': 'public, max-age=2592000', 'Content-Length': String(f.size) } })).catch(() => {}));
  return new Response(a, { headers });
}

// ---------- Site ziyaretçi sayacı (oalabs.dev) ----------
// Çerez kullanılmaz. Ziyaretçi, IP ve tarayıcı bilgisinin o güne özel tuzlanmış özetiyle sayılır
// (ham IP saklanmaz, ertesi gün aynı kişi tanınamaz). Botlar sayılmaz.

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|preview|headless|lighthouse|pagespeed|curl|wget|python|go-http|java\//i;
const SITE_PATH_RE = /^\/[a-z0-9/_-]{0,80}$/i;

async function siteVisitor(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const ua = req.headers.get('User-Agent') || '';
  return sha(`${env.PEPPER || 'oa'}:site:${today()}:${ip}:${ua}`);
}

function siteSource(ref) {
  let h = '';
  try { h = new URL(ref).hostname.replace(/^www\./, ''); } catch { return 'doğrudan'; }
  if (!h || h === 'oalabs.dev' || h.endsWith('.oalabs.dev')) return 'doğrudan';
  if (/(^|\.)google\./.test(h)) return 'google';
  if (/(^|\.)bing\.com$/.test(h)) return 'bing';
  if (/(^|\.)(yandex\.|duckduckgo\.com$|search\.yahoo\.com$|ecosia\.org$)/.test(h)) return 'arama (diğer)';
  if (/(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|instagram\.com|linkedin\.com|reddit\.com|youtube\.com|tiktok\.com|whatsapp\.com|t\.me)$/.test(h)) return 'sosyal';
  return h.slice(0, 60);
}

function siteDevice(ua) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'telefon';
  return 'bilgisayar';
}

async function siteVisit(req, env) {
  const ua = req.headers.get('User-Agent') || '';
  if (BOT_RE.test(ua)) return json({ ok: true, skipped: true });
  let b;
  try { b = JSON.parse(await req.text()); } catch { return json({ ok: false }, 400); }
  let path = clean(b && b.p, 80).toLowerCase();
  if (!SITE_PATH_RE.test(path)) return json({ ok: false }, 400);
  if (!path.endsWith('/')) path += '/';
  const day = today();
  const visitor = await siteVisitor(req, env);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO site_daily (day, path, views) VALUES (?1, ?2, 1)
                    ON CONFLICT (day, path) DO UPDATE SET views = views + 1`).bind(day, path),
    env.DB.prepare('INSERT OR IGNORE INTO site_visitors (day, visitor, source, lang, device) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(day, visitor, siteSource(clean(b.r, 300)), clean(b.l, 5), siteDevice(ua)),
  ]);
  return json({ ok: true });
}

async function siteLive(req, env, leave) {
  const ua = req.headers.get('User-Agent') || '';
  let path = '/';
  try { const b = JSON.parse(await req.text()); path = clean(b && b.p, 80).toLowerCase() || '/'; } catch {}
  if (!SITE_PATH_RE.test(path)) path = '/';
  const stub = env.SITELIVE.get(env.SITELIVE.idFromName('oalabs.dev'));
  const visitor = BOT_RE.test(ua) ? '' : await siteVisitor(req, env);
  const r = await stub.fetch(new Request('https://live/beat', { method: 'POST', body: JSON.stringify({ v: visitor, p: path, leave }) }));
  return json(await r.json());
}

async function adminSite(url, env) {
  const days = Math.min(400, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const from = new Date(Date.now() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const [daily, views, total, pages, sources, langs, devices] = await env.DB.batch([
    env.DB.prepare('SELECT day, COUNT(*) AS visitors FROM site_visitors WHERE day >= ?1 GROUP BY day ORDER BY day').bind(from),
    env.DB.prepare('SELECT day, SUM(views) AS views FROM site_daily WHERE day >= ?1 GROUP BY day ORDER BY day').bind(from),
    env.DB.prepare('SELECT COUNT(*) AS visitors FROM site_visitors WHERE day >= ?1').bind(from),
    env.DB.prepare('SELECT path, SUM(views) AS views FROM site_daily WHERE day >= ?1 GROUP BY path ORDER BY views DESC LIMIT 25').bind(from),
    env.DB.prepare('SELECT source, COUNT(*) AS visitors FROM site_visitors WHERE day >= ?1 GROUP BY source ORDER BY visitors DESC LIMIT 15').bind(from),
    env.DB.prepare('SELECT lang, COUNT(*) AS visitors FROM site_visitors WHERE day >= ?1 GROUP BY lang ORDER BY visitors DESC').bind(from),
    env.DB.prepare('SELECT device, COUNT(*) AS visitors FROM site_visitors WHERE day >= ?1 GROUP BY device ORDER BY visitors DESC').bind(from),
  ]);
  const stub = env.SITELIVE.get(env.SITELIVE.idFromName('oalabs.dev'));
  const live = await (await stub.fetch('https://live/admin')).json();
  return {
    ok: true, days, from,
    visitors: (total.results[0] && total.results[0].visitors) || 0,
    daily: daily.results, views: views.results, pages: pages.results,
    sources: sources.results, langs: langs.results, devices: devices.results,
    live,
  };
}

// Şu an sitede olanlar: her açık sayfa 25 saniyede bir haber verir; 70 saniyedir haber vermeyen sayılmaz.
// Yalnızca bellekte tutulur, hiçbir yere yazılmaz.
export class SiteLive {
  constructor() { this.seen = new Map(); }
  prune(now) { for (const [k, v] of this.seen) if (now - v.t > 70e3) this.seen.delete(k); }
  async fetch(req) {
    const url = new URL(req.url);
    const now = Date.now();
    this.prune(now);
    if (url.pathname === '/beat') {
      const b = await req.json();
      if (b.v) {
        if (b.leave) this.seen.delete(b.v);
        else this.seen.set(b.v, { t: now, p: b.p });
      }
      return Response.json({ ok: true, live: this.seen.size });
    }
    const pages = {};
    for (const v of this.seen.values()) pages[v.p] = (pages[v.p] || 0) + 1;
    return Response.json({ now: this.seen.size, pages: Object.entries(pages).map(([path, n]) => ({ path, n })).sort((a, b) => b.n - a.n) });
  }
}

// ---------- Kullanım sayımı ----------

async function ping(req, env) {
  let b;
  try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  const app = clean(b && b.app, 20);
  const id = clean(b && b.id, 64);
  if (!APPS.has(app) || !/^[0-9a-f-]{16,64}$/i.test(id)) return json({ ok: false }, 400);
  const install = await sha(`${env.PEPPER || 'oa'}:${app}:${id}`);
  const day = today();
  const version = clean(b.v, 20);
  const lang = clean(b.lang, 5);
  const stmts = [
    env.DB.prepare('INSERT OR IGNORE INTO active_daily (day, app, install, version, lang) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(day, app, install, version, lang),
  ];
  // Dinleme dakikaları: bir bildirimde en fazla 10 istasyon ve toplam 60 dakika.
  let total = 0;
  const listens = Array.isArray(b.listens) ? b.listens.slice(0, 10) : [];
  for (const l of listens) {
    const station = clean(l && l.s, 64);
    const minutes = Math.min(60, Math.max(0, Math.round(Number(l && l.m) || 0)));
    if (!station || !minutes || total + minutes > 60) continue;
    total += minutes;
    stmts.push(env.DB.prepare(
      `INSERT INTO listen_daily (day, app, station, name, minutes) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (day, app, station) DO UPDATE SET minutes = minutes + excluded.minutes, name = excluded.name`,
    ).bind(day, app, station, clean(l.n, 80), minutes));
  }
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function stats(url, env) {
  const days = Math.min(400, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const app = APPS.has(url.searchParams.get('app')) ? url.searchParams.get('app') : 'radyo';
  const from = new Date(Date.now() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const [daily, minutes, reach, top, versions, langs] = await env.DB.batch([
    env.DB.prepare('SELECT day, COUNT(*) AS users FROM active_daily WHERE app = ?1 AND day >= ?2 GROUP BY day ORDER BY day').bind(app, from),
    env.DB.prepare('SELECT day, SUM(minutes) AS minutes FROM listen_daily WHERE app = ?1 AND day >= ?2 GROUP BY day ORDER BY day').bind(app, from),
    env.DB.prepare('SELECT COUNT(DISTINCT install) AS users FROM active_daily WHERE app = ?1 AND day >= ?2').bind(app, from),
    env.DB.prepare('SELECT station, MAX(name) AS name, SUM(minutes) AS minutes FROM listen_daily WHERE app = ?1 AND day >= ?2 GROUP BY station ORDER BY minutes DESC LIMIT 25').bind(app, from),
    env.DB.prepare('SELECT version, COUNT(DISTINCT install) AS users FROM active_daily WHERE app = ?1 AND day >= ?2 GROUP BY version ORDER BY users DESC LIMIT 10').bind(app, from),
    env.DB.prepare('SELECT lang, COUNT(DISTINCT install) AS users FROM active_daily WHERE app = ?1 AND day >= ?2 GROUP BY lang ORDER BY users DESC').bind(app, from),
  ]);
  return {
    app, days, from,
    users: (reach.results[0] && reach.results[0].users) || 0,
    daily: daily.results,
    minutes: minutes.results,
    top: top.results,
    versions: versions.results,
    langs: langs.results,
  };
}

// ---------- Yönlendirme ----------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(kopruCleanup(env).catch(() => {}));
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const adminPath = url.pathname === '/v1/stats' || url.pathname.startsWith('/v1/admin/');
    const accountPath = url.pathname.startsWith('/v1/auth/') || url.pathname.startsWith('/v1/me') || url.pathname.startsWith('/v1/ideas') || url.pathname === '/v1/feedback';
    const h = cors(origin, adminPath, accountPath, env);
    const secure = url.protocol === 'https:' && url.hostname.endsWith('oalabs.dev');
    const send = (r) => {
      const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h });
      if (r.cookie) headers.append('Set-Cookie', r.cookie);
      return new Response(JSON.stringify(r.data), { status: r.status, headers });
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    try {
      if (url.pathname === '/' || url.pathname === '/v1/health') return json({ ok: true, service: 'OA Labs' }, 200, h);

      // Pusula Köprü aktarımı. İçerik cihazlarda uçtan uca şifrelidir; sunucu yalnız şifreli baytları taşır.
      const kw = url.pathname.match(/^\/v1\/kopru\/ws\/([A-Za-z0-9_-]{22,64})$/);
      if (kw) {
        if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket gerekli', { status: 426 });
        if (!env.KOPRU) return new Response('Kapalı', { status: 503 });
        return env.KOPRU.get(env.KOPRU.idFromName(kw[1])).fetch(req);
      }
      const kf = url.pathname.match(/^\/v1\/kopru\/file\/([A-Za-z0-9_-]{22,64})\/([A-Za-z0-9_-]{8,40})$/);
      if (kf) return await kopruFile(req, env, kf[1], kf[2]);

      if (url.pathname === '/v1/ping' && req.method === 'POST') {
        const r = await ping(req, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...h } });
      }

      if (url.pathname === '/v1/report' && req.method === 'POST') {
        const r = await report(req, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...h } });
      }

      const dl = url.pathname.match(/^\/indir\/(pusula|kopru)\/(windows|android|zip)$/);
      if (dl && (req.method === 'GET' || req.method === 'HEAD')) return await appDownload(dl[1], dl[2], ctx);
      const lt = url.pathname.match(/^\/v1\/(pusula|kopru)\/latest$/);
      if (lt && req.method === 'GET') {
        const i = await appLatest(lt[1], ctx);
        return new Response(JSON.stringify({ ok: true, version: i.version, date: i.date,
          files: Object.fromEntries(Object.entries(i.files).map(([k, v]) => [k, { name: v.name, size: v.size }])) }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...h } });
      }
      if (url.pathname === '/v1/site/visit' && req.method === 'POST') return await withCors(siteVisit(req, env), h);
      if (url.pathname === '/v1/site/live' && req.method === 'POST') return await withCors(siteLive(req, env, url.searchParams.has('leave')), h);
      if (url.pathname === '/v1/admin/site' && req.method === 'GET') {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
        return json(await adminSite(url, env), 200, h);
      }

      if (url.pathname === '/v1/admin/errors' && req.method === 'GET') {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
        return json(await adminErrors(url, env), 200, h);
      }

      if (url.pathname === '/v1/stats' && req.method === 'GET') {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
        return json(await stats(url, env), 200, h);
      }

      if (accountPath && req.method === 'POST' && origin && !PANEL_ORIGINS.has(origin) && origin !== env.DEV_ORIGIN) {
        return json({ ok: false, error: 'kaynak' }, 403, h); // başka sitelerden gelen istekleri reddet
      }
      if (url.pathname === '/v1/auth/start' && req.method === 'POST') {
        const ip = await sha(`${env.PEPPER || 'oa'}:ip:${req.headers.get('CF-Connecting-IP') || ''}`);
        return send(await start(req, env, ip));
      }
      if (url.pathname === '/v1/auth/verify' && req.method === 'POST') return send(await verify(req, env, secure));
      if (url.pathname === '/v1/auth/logout' && req.method === 'POST') return send(await logout(req, env, secure));
      if (url.pathname === '/v1/me' && (req.method === 'GET' || req.method === 'POST')) return send(await me(req, env, secure));
      if (url.pathname === '/v1/me/delete' && req.method === 'POST') return send(await deleteMe(req, env, secure));
      if (url.pathname === '/v1/me/sessions' && (req.method === 'GET' || req.method === 'POST')) return send(await mySessions(req, env));
      if (url.pathname === '/v1/me/email/start' && req.method === 'POST') {
        const ip = await sha(`${env.PEPPER || 'oa'}:ip:${req.headers.get('CF-Connecting-IP') || ''}`);
        return send(await emailStart(req, env, ip));
      }
      if (url.pathname === '/v1/me/email/verify' && req.method === 'POST') return send(await emailVerify(req, env));
      if (url.pathname === '/v1/me/sync' && (req.method === 'GET' || req.method === 'POST')) return send(await mySync(req, env));
      if (url.pathname === '/v1/me/avatar' && req.method === 'GET') {
        const r = await myAvatar(req, env);
        if (r.status !== 200) return new Response(null, { status: r.status, headers: { 'Cache-Control': 'no-store', ...h } });
        // Adres ?v=<sürüm> taşır: sürüm değişince yeni adres olur, eskisi önbellekte kalabilir.
        return new Response(r.body, { status: 200, headers: { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', ...h } });
      }
      if (url.pathname === '/v1/me/avatar' && req.method === 'POST') return send(await setAvatar(req, env));
      if (url.pathname === '/v1/me/avatar/delete' && req.method === 'POST') return send(await deleteAvatar(req, env));
      if (url.pathname === '/v1/feedback' && req.method === 'POST') {
        const ip = await sha(`${env.PEPPER || 'oa'}:ip:${req.headers.get('CF-Connecting-IP') || ''}`);
        return send(await sendFeedback(req, env, ip));
      }
      if (url.pathname === '/v1/ideas' && req.method === 'GET') return send(await listIdeas(req, env));
      if (url.pathname === '/v1/ideas' && req.method === 'POST') return send(await addIdea(req, env));
      if (url.pathname === '/v1/ideas/vote' && req.method === 'POST') return send(await voteIdea(req, env));
      if (url.pathname === '/v1/reviews' && req.method === 'GET') {
        return new Response(JSON.stringify(await listReviews(url, env)), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...h } });
      }
      if (url.pathname === '/v1/admin/reviews') {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
        return json(await adminReviews(req, env), 200, h);
      }
      if (url.pathname === '/v1/admin/feedback' || url.pathname === '/v1/admin/ideas') {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
        return json(await (url.pathname === '/v1/admin/feedback' ? adminFeedback : adminIdeas)(req, env), 200, h);
      }
      if (url.pathname === '/v1/admin/users') {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
        return json(await adminUsers(req, url, env), 200, h);
      }

      const chat = url.pathname.match(/^\/v1\/(admin\/)?chat\/([^/]+)$/);
      if (chat) {
        const room = decodeURIComponent(chat[2]);
        if (!ROOM_RE.test(room)) return json({ ok: false, error: 'oda' }, 400, h);
        const stub = env.CHAT.get(env.CHAT.idFromName(room));
        if (chat[1]) {
          if (!isAdmin(req, env)) return json({ ok: false, error: 'yetki' }, 401, h);
          const r = await stub.fetch(new Request(`https://room/admin`, { method: req.method, body: req.method === 'POST' ? await req.text() : undefined }));
          return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', ...h } });
        }
        if (req.headers.get('Upgrade') !== 'websocket') return json({ ok: false, error: 'websocket' }, 426, h);
        const ip = req.headers.get('CF-Connecting-IP') || '';
        const fwd = new Request(`https://room/ws?room=${encodeURIComponent(room)}&ip=${await sha(`${env.PEPPER || 'oa'}:ip:${ip}`)}`, req);
        return stub.fetch(fwd);
      }

      return json({ ok: false, error: 'yok' }, 404, h);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'sunucu' }, 500, h);
    }
  },
};

// ---------- Sohbet odası (her radyo için bir Durable Object) ----------

const KEEP = 100;          // odada saklanan son mesaj sayısı
const HISTORY = 50;        // bağlanana gönderilen geçmiş
const MIN_GAP = 1500;      // iki mesaj arası en az (ms)
const BURST = 8;           // 30 saniyede en fazla mesaj
const NICK_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u;

// Kaba sözlerin yıldızlanması (kelimenin tamamı ya da başı eşleşirse).
const BAD_EXACT = ['amk', 'aq', 'mk', 'oç', 'oc', 'piç', 'pic', 'göt', 'got', 'sik', 'sikik', 'ibne', 'gavat', 'kahpe', 'yavşak', 'yavsak'];
const BAD_PREFIX = ['siktir', 'sikeyim', 'sikerim', 'orospu', 'yarrak', 'yarak', 'pezevenk', 'amına', 'amina', 'amcık', 'amcik', 'ananı', 'anani', 'şerefsiz', 'serefsiz'];
function soften(text) {
  return text.replace(/[\p{L}\p{N}]+/gu, (w) => {
    const l = w.toLocaleLowerCase('tr');
    if (BAD_EXACT.includes(l) || BAD_PREFIX.some((p) => l.startsWith(p))) return '*'.repeat(Math.min(8, w.length));
    return w;
  });
}
const LINK_RE = /(https?:\/\/|www\.|\b[\w-]+\.(com|net|org|tr|io|me|ly|gg|xyz|link|app|dev)\b)/i;

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, nick TEXT NOT NULL, text TEXT NOT NULL, uid TEXT NOT NULL)`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS bans (uid TEXT PRIMARY KEY, ts INTEGER NOT NULL)');
    // Uygulamanın 30 saniyede bir gönderdiği "ping" odayı uyandırmadan yanıtlanır.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/admin') return this.admin(req);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const uid = url.searchParams.get('ip') || 'x';
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid, nick: '', last: 0, times: [] });
    const history = this.sql.exec('SELECT id, ts, nick, text FROM messages ORDER BY id DESC LIMIT ?', HISTORY).toArray().reverse();
    server.send(JSON.stringify({ t: 'hello', history, online: this.ctx.getWebSockets().length }));
    this.broadcastOnline();
    return new Response(null, { status: 101, webSocket: client });
  }

  online() { return this.ctx.getWebSockets().length; }

  broadcast(obj, except) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(msg); } catch { /* kopmuş */ }
    }
  }

  broadcastOnline() { this.broadcast({ t: 'online', online: this.online() }); }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() || {};
    const err = (text) => ws.send(JSON.stringify({ t: 'error', text }));

    if (m.t !== 'msg') return;
    if (this.sql.exec('SELECT 1 FROM bans WHERE uid = ?', att.uid).toArray().length) return err('Bu odada mesaj gönderemezsin.');
    const nick = clean(m.nick, 20);
    if (!NICK_RE.test(nick)) return err('Takma ad 2–20 harf ya da rakam olmalı.');
    let text = clean(m.text, 300);
    if (!text) return;
    if (LINK_RE.test(text)) return err('Sohbette bağlantı paylaşılamıyor.');

    const now = Date.now();
    const times = (att.times || []).filter((t) => now - t < 30000);
    if (now - (att.last || 0) < MIN_GAP || times.length >= BURST) return err('Biraz yavaş: birkaç saniye sonra tekrar yaz.');
    times.push(now);
    ws.serializeAttachment({ ...att, nick, last: now, times });

    text = soften(text);
    const row = this.sql.exec('INSERT INTO messages (ts, nick, text, uid) VALUES (?, ?, ?, ?) RETURNING id', now, soften(nick), text, att.uid).one();
    this.sql.exec('DELETE FROM messages WHERE id <= ?', row.id - KEEP);
    this.broadcast({ t: 'msg', id: row.id, ts: now, nick: soften(nick), text });
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* zaten kapalı */ }
    this.broadcast({ t: 'online', online: Math.max(0, this.online() - 1) }, ws);
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }

  async admin(req) {
    if (req.method === 'GET') {
      const rows = this.sql.exec('SELECT id, ts, nick, text, uid FROM messages ORDER BY id DESC LIMIT 100').toArray();
      return json({ online: this.online(), messages: rows });
    }
    let b;
    try { b = await req.json(); } catch { return json({ ok: false }, 400); }
    if (b.action === 'delete' && Number.isInteger(b.id)) {
      this.sql.exec('DELETE FROM messages WHERE id = ?', b.id);
      this.broadcast({ t: 'del', id: b.id });
      return json({ ok: true });
    }
    if (b.action === 'ban' && typeof b.uid === 'string' && b.uid.length <= 40) {
      this.sql.exec('INSERT OR REPLACE INTO bans (uid, ts) VALUES (?, ?)', b.uid, Date.now());
      const ids = this.sql.exec('SELECT id FROM messages WHERE uid = ?', b.uid).toArray().map((r) => r.id);
      this.sql.exec('DELETE FROM messages WHERE uid = ?', b.uid);
      for (const id of ids) this.broadcast({ t: 'del', id });
      return json({ ok: true, removed: ids.length });
    }
    return json({ ok: false }, 400);
  }
}


// ---------- Pusula Köprü aktarımı ----------
// Eşleşmiş iki cihaz aynı ağda değilken iletiler ve dosyalar buradan geçer. "Kutu" adı iki cihazın
// ortak anahtarından türetilir; yalnız o iki cihaz bilir. İçerik şifrelidir, sunucu açamaz.

const KOPRU_FILE_MAX = 100 * 1024 * 1024;
const KOPRU_MSG_MAX = 300 * 1024;
const KOPRU_KEEP_MS = 3 * 24 * 3600 * 1000;

async function kopruFile(req, env, box, id) {
  if (!env.KOPRU_FILES) return new Response('Kapalı', { status: 503 });
  const key = `${box}/${id}`;
  if (req.method === 'PUT') {
    // Uygulama şifreli dosyanın tam boyutunu önceden bilir; R2'ye bellekte tutmadan akıtılır.
    const len = Number(req.headers.get('Content-Length') || 0);
    if (!len) return new Response('Boyut gerekli', { status: 411 });
    if (len > KOPRU_FILE_MAX + 1024 * 1024) return new Response('Çok büyük', { status: 413 });
    if (!req.body) return new Response('Boş', { status: 400 });
    try {
      await env.KOPRU_FILES.put(key, req.body, { customMetadata: { ts: String(Date.now()) } });
    } catch {
      return new Response('Yüklenemedi', { status: 413 });
    }
    return json({ ok: true });
  }
  if (req.method === 'GET') {
    const o = await env.KOPRU_FILES.get(key);
    if (!o) return new Response('Yok', { status: 404 });
    return new Response(o.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(o.size), 'Cache-Control': 'no-store' } });
  }
  if (req.method === 'DELETE') {
    await env.KOPRU_FILES.delete(key);
    return json({ ok: true });
  }
  return new Response('Yöntem yok', { status: 405 });
}

/** Saatlik temizlik: alınmamış eski dosyalar (24 saatten eski). */
async function kopruCleanup(env) {
  if (!env.KOPRU_FILES) return;
  const old = Date.now() - 24 * 3600 * 1000;
  let cursor;
  for (let i = 0; i < 20; i++) {
    const l = await env.KOPRU_FILES.list({ cursor, limit: 500, include: ['customMetadata'] });
    const del = l.objects.filter((o) => (o.uploaded ? o.uploaded.getTime() : 0) < old).map((o) => o.key);
    if (del.length) await env.KOPRU_FILES.delete(del);
    if (!l.truncated) break;
    cursor = l.cursor;
  }
}

/**
 * Bir cihaz çiftinin posta kutusu. Her cihaz "?d=<cihaz kimliği>" ile bağlanır. Karşı cihaz bağlıysa
 * ileti hemen iletilir; değilse (en fazla 3 gün, 200 ileti) saklanır ve bağlanınca verilir.
 */
export class KopruBox {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS q (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, dst TEXT NOT NULL, src TEXT NOT NULL, data TEXT NOT NULL)`);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  devices() {
    const out = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.d) out.add(a.d);
    }
    return [...out];
  }

  broadcast(obj, except) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(msg); } catch { /* kopmuş */ }
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    const d = url.searchParams.get('d') || '';
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(d)) return new Response('Kimlik yok', { status: 400 });
    // Bir kutuda en fazla birkaç bağlantı (iki cihaz, yeniden bağlanma payıyla)
    const socks = this.ctx.getWebSockets();
    for (const ws of socks) {
      const a = ws.deserializeAttachment();
      if (a && a.d === d) { try { ws.close(4000, 'yeni bağlantı'); } catch { /* */ } }
    }
    if (this.ctx.getWebSockets().length > 8) return new Response('Dolu', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ d });
    server.send(JSON.stringify({ t: 'hello', online: this.devices() }));
    this.broadcast({ t: 'presence', d, on: true }, server);
    // Bekleyen iletiler
    this.sql.exec('DELETE FROM q WHERE ts < ?', Date.now() - KOPRU_KEEP_MS);
    const rows = this.sql.exec('SELECT id, src, data FROM q WHERE dst = ? ORDER BY id', d).toArray();
    for (const r of rows) server.send(JSON.stringify({ t: 'msg', from: r.src, data: r.data, queued: true }));
    if (rows.length) this.sql.exec('DELETE FROM q WHERE dst = ?', d);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > KOPRU_MSG_MAX * 1.4) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    if (m.t !== 'msg' || typeof m.to !== 'string' || typeof m.data !== 'string' || !a.d) return;
    const out = JSON.stringify({ t: 'msg', from: a.d, data: m.data });
    let sent = false;
    for (const s of this.ctx.getWebSockets()) {
      const b = s.deserializeAttachment();
      if (b && b.d === m.to) { try { s.send(out); sent = true; } catch { /* */ } }
    }
    if (!sent && m.keep !== false) {
      this.sql.exec('INSERT INTO q (ts, dst, src, data) VALUES (?, ?, ?, ?)', Date.now(), m.to, a.d, m.data);
      this.sql.exec('DELETE FROM q WHERE id NOT IN (SELECT id FROM q ORDER BY id DESC LIMIT 200)');
    }
    if (m.id) ws.send(JSON.stringify({ t: 'ack', id: m.id, live: sent }));
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment() || {};
    try { ws.close(); } catch { /* zaten kapalı */ }
    if (a.d && !this.ctx.getWebSockets().some((s) => s !== ws && (s.deserializeAttachment() || {}).d === a.d)) {
      this.broadcast({ t: 'presence', d: a.d, on: false }, ws);
    }
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }
}
