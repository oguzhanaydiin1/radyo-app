/**
 * OA Labs Center: cihazlar, uzaktan kurulum ve duyurular.
 *
 *   POST /v1/me/devices/sync     { id, name, platform, apps:[{id,version}] }  Bu cihazı ve kurulu
 *                                OA uygulamalarını kaydeder; bu cihaza bekleyen kurulum isteklerini döndürür.
 *   GET  /v1/me/devices          Hesaba bağlı cihazlar, kurulu uygulamaları ve bekleyen istekleri
 *   POST /v1/me/devices/remove   { id }  Cihazı listeden kaldır
 *   POST /v1/me/commands         { device, app }  O cihaza "şu uygulamayı kur" isteği (örn. telefondan bilgisayara)
 *   POST /v1/me/commands/done    { id, ok }  Cihaz isteği yerine getirdi (ya da getiremedi)
 *   POST /v1/me/commands/cancel  { id }  Bekleyen isteği geri al
 *   GET  /v1/announcements       Yayındaki duyurular (herkese açık)
 *   GET/POST /v1/admin/announcements  Duyuru ekle, kapat (yönetici)
 *
 * Cihaz kimliği uygulamanın ürettiği rastgele bir değerdir; yalnız o hesabın altında anlamlıdır.
 * Bilinen uygulama kimlikleri dışında bir şey saklanmaz.
 */
import { sessionUserPublic as sessionUser } from './auth.js';

const ok = (data, status = 200) => ({ status, data: { ok: status < 400, ...data } });
const now = () => new Date().toISOString();
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const APPS = new Set(['center', 'pusula', 'kopru', 'radyo', 'harrier', 'terazi']);
const PLATFORMS = new Set(['windows', 'android']);
const ID_RE = /^[0-9a-f]{32}$/;
const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

async function body(req) {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}

function cleanApps(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list.slice(0, 40) : []) {
    if (a && APPS.has(a.id)) out.push({ id: a.id, version: txt(a.version, 32) });
  }
  return out;
}

async function pending(env, userId, deviceId) {
  const r = await env.DB.prepare(
    `SELECT id, app, created, from_device FROM center_commands WHERE user_id = ?1 AND device_id = ?2 AND state = 'pending' AND created > ?3 ORDER BY created`,
  ).bind(userId, deviceId, ago(7 * 86400e3)).all();
  return r.results;
}

export async function syncDevice(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  const b = await body(req);
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return ok({ error: 'cihaz' }, 400);
  const platform = PLATFORMS.has(b.platform) ? b.platform : null;
  if (!platform) return ok({ error: 'platform' }, 400);
  const name = txt(b.name, 60) || (platform === 'windows' ? 'Bilgisayar' : 'Telefon');
  const apps = JSON.stringify(cleanApps(b.apps));
  // Aynı kimlik başka bir hesaba aitse ona dokunma.
  const row = await env.DB.prepare('SELECT user_id FROM center_devices WHERE id = ?1').bind(id).first();
  if (row && row.user_id !== u.id) return ok({ error: 'cihaz' }, 409);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM center_devices WHERE user_id = ?1').bind(u.id).first();
  if (!row && n && n.n >= 20) return ok({ error: 'cok' }, 429);
  await env.DB.prepare(
    `INSERT INTO center_devices (id, user_id, name, platform, apps, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = ?3, platform = ?4, apps = ?5, updated = ?6`,
  ).bind(id, u.id, name, platform, apps, now()).run();
  return ok({ commands: await pending(env, u.id, id) });
}

export async function listDevices(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  const devs = await env.DB.prepare(
    'SELECT id, name, platform, apps, updated FROM center_devices WHERE user_id = ?1 AND updated > ?2 ORDER BY updated DESC',
  ).bind(u.id, ago(120 * 86400e3)).all();
  const cmds = await env.DB.prepare(
    `SELECT id, device_id, app, created, state FROM center_commands WHERE user_id = ?1 AND created > ?2 ORDER BY created DESC LIMIT 50`,
  ).bind(u.id, ago(7 * 86400e3)).all();
  const devices = devs.results.map((d) => {
    let apps = [];
    try { apps = JSON.parse(d.apps || '[]'); } catch {}
    return { id: d.id, name: d.name, platform: d.platform, apps, updated: d.updated, commands: cmds.results.filter((c) => c.device_id === d.id).map(({ device_id, ...c }) => c) };
  });
  return ok({ devices });
}

export async function removeDevice(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  const id = String((await body(req)).id || '');
  if (!ID_RE.test(id)) return ok({ error: 'cihaz' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM center_devices WHERE id = ?1 AND user_id = ?2').bind(id, u.id),
    env.DB.prepare('DELETE FROM center_commands WHERE device_id = ?1 AND user_id = ?2').bind(id, u.id),
  ]);
  return ok({});
}

export async function addCommand(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  const b = await body(req);
  const device = String(b.device || '');
  const app = String(b.app || '');
  if (!ID_RE.test(device) || !APPS.has(app) || app === 'center') return ok({ error: 'istek' }, 400);
  const d = await env.DB.prepare('SELECT id FROM center_devices WHERE id = ?1 AND user_id = ?2').bind(device, u.id).first();
  if (!d) return ok({ error: 'cihaz' }, 404);
  const from = ID_RE.test(String(b.from || '')) ? String(b.from) : null;
  const same = await env.DB.prepare(`SELECT id FROM center_commands WHERE user_id = ?1 AND device_id = ?2 AND app = ?3 AND state = 'pending'`).bind(u.id, device, app).first();
  if (same) return ok({ id: same.id });
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM center_commands WHERE user_id = ?1 AND created > ?2`).bind(u.id, ago(3600e3)).first();
  if (n && n.n >= 30) return ok({ error: 'cok' }, 429);
  const r = await env.DB.prepare(
    `INSERT INTO center_commands (user_id, device_id, from_device, app, created, state) VALUES (?1, ?2, ?3, ?4, ?5, 'pending') RETURNING id`,
  ).bind(u.id, device, from, app, now()).first();
  return ok({ id: r.id });
}

export async function finishCommand(req, env, cancel) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  const b = await body(req);
  const id = Number(b.id);
  if (!Number.isInteger(id) || id < 1) return ok({ error: 'istek' }, 400);
  const state = cancel ? 'cancelled' : b.ok === true ? 'done' : 'failed';
  await env.DB.prepare(`UPDATE center_commands SET state = ?1, finished = ?2 WHERE id = ?3 AND user_id = ?4 AND state = 'pending'`).bind(state, now(), id, u.id).run();
  return ok({});
}

// ---------------------------------------------------------------- Duyurular

export async function listAnnouncements(env) {
  const r = await env.DB.prepare(
    `SELECT id, created, app, title, body, title_en, body_en, url FROM announcements WHERE active = 1 AND created > ?1 ORDER BY created DESC LIMIT 10`,
  ).bind(ago(90 * 86400e3)).all();
  return { ok: true, announcements: r.results };
}

export async function adminAnnouncements(req, env) {
  if (req.method === 'POST') {
    const b = await body(req);
    if (b.action === 'create') {
      const title = txt(b.title, 120), text = txt(b.body, 600);
      if (title.length < 3) return { ok: false, error: 'kisa' };
      const app = APPS.has(b.app) ? b.app : null;
      const url = /^https:\/\/[^\s]{3,300}$/.test(String(b.url || '')) ? String(b.url) : null;
      await env.DB.prepare('INSERT INTO announcements (created, app, title, body, title_en, body_en, url, active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)')
        .bind(now(), app, title, text || null, txt(b.title_en, 120) || null, txt(b.body_en, 600) || null, url).run();
    } else if (b.action === 'toggle' && Number.isInteger(Number(b.id))) {
      await env.DB.prepare('UPDATE announcements SET active = ?1 WHERE id = ?2').bind(b.active ? 1 : 0, Number(b.id)).run();
    } else if (b.action === 'delete' && Number.isInteger(Number(b.id))) {
      await env.DB.prepare('DELETE FROM announcements WHERE id = ?1').bind(Number(b.id)).run();
    }
  }
  const r = await env.DB.prepare('SELECT id, created, app, title, body, title_en, body_en, url, active FROM announcements ORDER BY created DESC LIMIT 100').all();
  const devs = await env.DB.prepare(`SELECT platform, COUNT(*) AS n FROM center_devices WHERE updated > ?1 GROUP BY platform`).bind(ago(30 * 86400e3)).all();
  return { ok: true, items: r.results, devices: devs.results };
}
