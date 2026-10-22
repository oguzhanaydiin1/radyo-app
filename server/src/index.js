/*
 * OA Labs sunucusu (Cloudflare Workers) — api.oalabs.dev
 *
 *   POST /v1/ping              İsimsiz kullanım sayımı (uygulama, izin verildiyse)
 *   POST /v1/report            Uygulama hata raporu (isimsiz, kullanıcı kapatabilir)
 *   GET  /v1/admin/errors      Son hata raporları (yönetici)
 *   GET  /v1/stats             Toplu istatistikler (yalnızca yönetici anahtarıyla)
 *   GET  /v1/chat/:oda         Canlı sohbet (WebSocket), her radyo için bir oda
 *   GET  /v1/admin/chat/:oda   Odanın son mesajları, kimlik özetleriyle (yönetici)
 *   POST /v1/admin/chat/:oda   { action: "delete", id } | { action: "ban", uid } (yönetici)
 *
 *   /v1/auth/…, /v1/me, /v1/admin/users  Üyelik (ayrıntılar auth.js'te)
 *
 * Gizli değerler (Cloudflare'de "secret" olarak): ADMIN_KEY, PEPPER, RESEND_API_KEY (isteğe bağlı).
 */

import { start, verify, logout, me, deleteMe, adminUsers, mySessions, emailStart, emailVerify } from './auth.js';

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
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const adminPath = url.pathname === '/v1/stats' || url.pathname.startsWith('/v1/admin/');
    const accountPath = url.pathname.startsWith('/v1/auth/') || url.pathname.startsWith('/v1/me');
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

      if (url.pathname === '/v1/ping' && req.method === 'POST') {
        const r = await ping(req, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...h } });
      }

      if (url.pathname === '/v1/report' && req.method === 'POST') {
        const r = await report(req, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...h } });
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
