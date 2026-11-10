/*
 * OA Labs üyeliği — şifresiz: e-postaya gelen 6 haneli kodla giriş.
 *
 *   POST /v1/auth/start     { mode: "register"|"login", email, name?, announce?, consent? }
 *   POST /v1/auth/verify    { email, code }  → oturum çerezi (oa_s, oalabs.dev geneli, HttpOnly)
 *   POST /v1/auth/logout
 *   GET  /v1/me             Giriş yapmış üyenin bilgileri
 *   POST /v1/me             { name?, announce? } bilgileri güncelle
 *   POST /v1/me/delete      Hesabı ve oturumları tamamen sil
 *   GET  /v1/me/sessions    Açık oturumlar (cihaz, son görülme)
 *   POST /v1/me/sessions    { id } o oturumu kapat | { others: true } bu cihaz dışındakileri kapat
 *   POST /v1/me/email/start { email }        yeni adrese kod gönder
 *   POST /v1/me/email/verify { email, code } yeni adresi onayla
 *   GET  /v1/me/avatar      Profil fotoğrafı (yalnız sahibine; yoksa 404)
 *   POST /v1/me/avatar      Gövde: WebP ya da JPEG, en çok 150 KB → fotoğrafı kaydet / değiştir
 *   POST /v1/me/avatar/delete  Fotoğrafı sil
 *   GET  /v1/me/sync        Eşitlenen tarayıcı verisi (OA Tarayıcı: yer imleri, hızlı erişim)
 *   POST /v1/me/sync        { items: { <ad>: { updated, data } } } daha yeni olanlar kaydedilir
 *   POST /v1/auth/handoff   { app }  (oturum çereziyle) → { code }: öbür OA uygulaması için tek kullanımlık giriş kodu
 *   POST /v1/auth/redeem    { code } → o uygulamanın kendi oturum çerezi (tek giriş, OA Labs Center)
 *   GET  /v1/admin/users    Üye sayıları ve listesi (yönetici)
 *   POST /v1/admin/users    { action: "remove", id } (yönetici)
 *
 * E-posta gönderimi Resend ile (gizli değer RESEND_API_KEY). Anahtar yoksa üyelik kapalıdır.
 */

const CONSENT = 'uyelik-v1-2026-10-20';
const COOKIE = 'oa_s';
const SESSION_DAYS = 60;
const CODE_MIN = 10;
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const now = () => new Date().toISOString();
const ago = (ms) => new Date(Date.now() - ms).toISOString();

function rand(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function code6() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1000000).padStart(6, '0');
}
async function hash(env, text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.PEPPER || 'oa'}:auth:${text}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const NOTIFY_APPS = new Set(['score', 'barkod', 'radyo-android', 'harrier']);

// Tarayıcı bilgisinden kısa bir cihaz adı: "Chrome · Windows"
function deviceName(req) {
  const ua = req.headers.get('User-Agent') || '';
  const b = /OALabsCenter\//.test(ua) ? 'OA Labs Center' : /OATarayici\//.test(ua) ? 'Pusula Browser' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  const o = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Bilinmeyen cihaz';
  return `${b} · ${o}`;
}

const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '');

function cookie(value, maxAge, secure) {
  // api.oalabs.dev ve oalabs.dev aynı site; çerez ikisinde de geçerli.
  const dom = secure ? '; Domain=oalabs.dev; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${dom}`;
}
function readCookie(req) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`));
  return m ? m[1] : '';
}

function codeMail(code, mode, lang) {
  const en = lang === 'en';
  const T = en
    ? {
      title: mode === 'register' ? 'Finish creating your OA Labs account' : mode === 'change' ? 'OA Labs email change' : 'Your OA Labs sign-in code',
      lead: mode === 'register' ? 'Enter this code on the page to create your OA Labs account:'
        : mode === 'change' ? 'Enter this code on the page to change your OA Labs account email to this address:'
          : 'Enter this code on the page to sign in to your OA Labs account:',
      foot: `The code is valid for ${CODE_MIN} minutes. If you didn’t ask for this, you can ignore this email; never share the code.`,
    }
    : {
      title: mode === 'register' ? 'OA Labs üyeliğini tamamla' : mode === 'change' ? 'OA Labs e-posta değişikliği' : 'OA Labs giriş kodun',
      lead: mode === 'register' ? 'OA Labs’e üye olmak için bu kodu sayfaya yaz:'
        : mode === 'change' ? 'OA Labs hesabının e-posta adresini bu adresle değiştirmek için bu kodu sayfaya yaz:'
          : 'OA Labs hesabına girmek için bu kodu sayfaya yaz:',
      foot: `Kod ${CODE_MIN} dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; kodu kimseyle paylaşma.`,
    };
  const html = `<!doctype html><html lang="${en ? 'en' : 'tr'}"><body style="margin:0;background:#0D0F16;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif;color:#EEEAE2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#151824;border:1px solid #262B3D;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<div style="font-weight:800;font-size:20px;margin-bottom:24px"><span style="display:inline-block;background:#EEEAE2;color:#0D0F16;border-radius:8px;padding:5px 6px;font-size:12px;margin-right:8px">OA</span>OA Labs</div>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${T.lead}</p>
<div style="font-size:36px;font-weight:800;letter-spacing:8px;background:#0D0F16;border:1px solid #262B3D;border-radius:12px;padding:16px 0;text-align:center;color:#F2A541">${code}</div>
<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#9EA2B3">${T.foot}</p>
</td></tr></table>
<p style="font-size:12px;color:#7E8296;margin:16px 0 0">OA Labs · oalabs.dev</p>
</td></tr></table></body></html>`;
  const text = `${T.lead}\n\n${code}\n\n${T.foot}\n`;
  return { subject: `${T.title}: ${code}`, html, text };
}

async function sendMail(env, to, m) {
  if (env.MAIL_DEV === '1') { console.log(`[deneme e-postası] ${to}: ${m.subject}`); return { ok: true }; } // yalnızca yerel deneme
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(env.RESEND_API_KEY).replace(/\s+/g, "")}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'OA Labs <hesap@oalabs.dev>', to: [to], reply_to: 'destek@oalabs.dev', subject: m.subject, html: m.html, text: m.text }),
  });
  if (res.ok) return { ok: true };
  // Resend'in hata nedenini (anahtar içermez) teşhis için kısaca geri ver.
  let detail = '';
  try { const j = await res.json(); detail = String(j.message || j.name || '').slice(0, 160); } catch {}
  console.error('Resend', res.status, detail);
  return { ok: false, status: res.status, detail };
}

const fail = (error, status = 400) => ({ status, data: { ok: false, error } });

export async function start(req, env, ipHash) {
  let b;
  try { b = await req.json(); } catch { return fail('istek'); }
  if (b && b.website) return { status: 200, data: { ok: true } }; // bot tuzağı
  if (!env.RESEND_API_KEY && env.MAIL_DEV !== '1') return fail('kapali', 503);
  const mode = b.mode === 'register' ? 'register' : 'login';
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 200 || !EMAIL_RE.test(email)) return fail('eposta');
  const name = cleanName(b.name);
  if (mode === 'register') {
    if (name.length < 2) return fail('ad');
    if (!b.consent) return fail('onay');
  }

  const [user, perIp, last] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email),
    env.DB.prepare('SELECT COUNT(*) AS n FROM login_codes WHERE ip = ?1 AND created > ?2').bind(ipHash, ago(3600e3)),
    env.DB.prepare('SELECT created FROM login_codes WHERE email = ?1').bind(email),
  ]);
  const exists = !!user.results[0];
  if (mode === 'login' && !exists) return fail('uye-yok', 404);
  if (mode === 'register' && exists) return fail('uye-var', 409);
  if (perIp.results[0].n >= 10) return fail('cok', 429);
  if (last.results[0] && Date.now() - Date.parse(last.results[0].created) < 60e3) return fail('bekle', 429);

  const code = code6();
  const pending = mode === 'register' ? JSON.stringify({ name, announce: !!b.announce, consent: CONSENT }) : null;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_codes WHERE expires < ?1').bind(now()),
    env.DB.prepare(
      `INSERT INTO login_codes (email, code, expires, attempts, created, ip, pending) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)
       ON CONFLICT (email) DO UPDATE SET code = excluded.code, expires = excluded.expires, attempts = 0, created = excluded.created, ip = excluded.ip, pending = excluded.pending`,
    ).bind(email, await hash(env, `${email}:${code}`), new Date(Date.now() + CODE_MIN * 60e3).toISOString(), now(), ipHash, pending),
  ]);
  const sent = await sendMail(env, email, codeMail(code, mode, b.lang));
  if (!sent.ok) {
    await env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
    return { status: 502, data: { ok: false, error: 'gonderilemedi', resend: sent.status || 0, detail: sent.detail || '' } };
  }
  return { status: 200, data: { ok: true } };
}

export async function verify(req, env, secure) {
  let b;
  try { b = await req.json(); } catch { return fail('istek'); }
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) return fail('kod');
  const row = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ?1').bind(email).first();
  if (!row || row.expires < now()) return fail('sure');
  if (row.attempts >= 5) return fail('deneme', 429);
  if ((await hash(env, `${email}:${code}`)) !== row.code) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?1').bind(email).run();
    return fail('kod');
  }

  let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  const stmts = [env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email)];
  if (!user) {
    if (!row.pending) return fail('uye-yok', 404);
    const p = JSON.parse(row.pending);
    if (!p.name) return fail('sure'); // e-posta değiştirme kodu girişte kullanılamaz
    user = { id: rand(10) };
    stmts.push(env.DB.prepare(
      'INSERT INTO users (id, email, name, created, last_login, announce, consent) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)',
    ).bind(user.id, email, p.name, now(), p.announce ? 1 : 0, p.consent));
  } else {
    stmts.push(env.DB.prepare('UPDATE users SET last_login = ?1 WHERE id = ?2').bind(now(), user.id));
  }
  const token = rand(32);
  const th = await hash(env, `s:${token}`);
  stmts.push(env.DB.prepare('DELETE FROM session_info WHERE token IN (SELECT token FROM sessions WHERE expires < ?1)').bind(now()));
  stmts.push(env.DB.prepare('DELETE FROM sessions WHERE expires < ?1').bind(now()));
  stmts.push(env.DB.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
    .bind(th, user.id, now(), new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString()));
  stmts.push(env.DB.prepare('INSERT OR REPLACE INTO session_info (token, device, last_seen) VALUES (?1, ?2, ?3)').bind(th, deviceName(req), now()));
  await env.DB.batch(stmts);
  return { status: 200, data: { ok: true, created: !!(row.pending && JSON.parse(row.pending).name) }, cookie: cookie(token, SESSION_DAYS * 86400, secure) };
}

// ---------- Tek giriş ----------
// Bir OA uygulamasındaki açık oturum, öbür OA uygulamasının kendi oturumunu açmasını sağlar
// (OA Labs Center ile Pusula arasında). Kod tek kullanımlıktır, 2 dakika geçerlidir ve yalnız özeti tutulur.
// Yeni uygulama kendi oturumunu alır: cihaz listesinde ayrı görünür, ayrı çıkış yapılabilir.

const HANDOFF_APPS = new Set(['center', 'pusula', 'kopru', 'radyo', 'harrier', 'score', 'barkod']);

export async function handoff(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  let b;
  try { b = await req.json(); } catch { b = {}; }
  const app = String((b && b.app) || '');
  if (!HANDOFF_APPS.has(app)) return fail('uygulama');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_handoff WHERE user_id = ?1 AND created > ?2').bind(u.id, ago(3600e3)).first();
  if (recent && recent.n >= 30) return fail('cok', 429);
  const code = rand(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_handoff WHERE expires < ?1').bind(now()),
    env.DB.prepare('INSERT INTO auth_handoff (code, user_id, app, created, expires) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await hash(env, `h:${code}`), u.id, app, now(), new Date(Date.now() + 120e3).toISOString()),
  ]);
  return { status: 200, data: { ok: true, code } };
}

export async function redeem(req, env, secure) {
  let b;
  try { b = await req.json(); } catch { return fail('istek'); }
  const code = String((b && b.code) || '');
  if (!/^[0-9a-f]{48}$/.test(code)) return fail('kod');
  // Silerek okunur: aynı kod iki kez kullanılamaz.
  const row = await env.DB.prepare('DELETE FROM auth_handoff WHERE code = ?1 RETURNING user_id, expires').bind(await hash(env, `h:${code}`)).first();
  if (!row) return fail('kod');
  if (row.expires < now()) return fail('sure');
  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(row.user_id).first();
  if (!user) return fail('uye-yok', 404);
  const token = rand(32);
  const th = await hash(env, `s:${token}`);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
      .bind(th, user.id, now(), new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString()),
    env.DB.prepare('INSERT OR REPLACE INTO session_info (token, device, last_seen) VALUES (?1, ?2, ?3)').bind(th, deviceName(req), now()),
  ]);
  return { status: 200, data: { ok: true }, cookie: cookie(token, SESSION_DAYS * 86400, secure) };
}

async function sessionUser(req, env) {
  const t = readCookie(req);
  if (!t) return null;
  return env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.created, u.announce, s.token AS sid, i.last_seen FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN session_info i ON i.token = s.token WHERE s.token = ?1 AND s.expires > ?2',
  ).bind(await hash(env, `s:${t}`), now()).first();
}

/** Oturum açmış kullanıcı (öbür modüller için) ya da null. */
export async function sessionUserPublic(req, env) { return sessionUser(req, env); }

export async function logout(req, env, secure) {
  const t = readCookie(req);
  if (t) {
    const th = await hash(env, `s:${t}`);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(th),
      env.DB.prepare('DELETE FROM session_info WHERE token = ?1').bind(th),
    ]);
  }
  return { status: 200, data: { ok: true }, cookie: cookie('', 0, secure) };
}

export async function me(req, env, secure) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  const stmts = [];
  if (!u.last_seen || Date.now() - Date.parse(u.last_seen) > 10 * 60e3) {
    stmts.push(env.DB.prepare('INSERT INTO session_info (token, device, last_seen) VALUES (?1, ?2, ?3) ON CONFLICT (token) DO UPDATE SET last_seen = excluded.last_seen')
      .bind(u.sid, deviceName(req), now()));
  }
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { b = {}; }
    const name = b.name === undefined ? u.name : cleanName(b.name);
    if (name.length < 2) return fail('ad');
    const announce = b.announce === undefined ? u.announce : (b.announce ? 1 : 0);
    stmts.push(env.DB.prepare('UPDATE users SET name = ?1, announce = ?2 WHERE id = ?3').bind(name, announce, u.id));
    Object.assign(u, { name, announce });
    for (const [app, on] of Object.entries((b && b.notify) || {})) {
      if (!NOTIFY_APPS.has(app)) continue;
      stmts.push(on
        ? env.DB.prepare('INSERT OR IGNORE INTO app_notify (user_id, app, created) VALUES (?1, ?2, ?3)').bind(u.id, app, now())
        : env.DB.prepare('DELETE FROM app_notify WHERE user_id = ?1 AND app = ?2').bind(u.id, app));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  const [notify, count, ava] = await env.DB.batch([
    env.DB.prepare('SELECT app FROM app_notify WHERE user_id = ?1').bind(u.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?1 AND expires > ?2').bind(u.id, now()),
    env.DB.prepare('SELECT key FROM user_avatar WHERE user_id = ?1').bind(u.id),
  ]);
  return {
    status: 200,
    data: {
      ok: true,
      user: {
        email: u.email, name: u.name, created: u.created, announce: !!u.announce,
        notify: notify.results.map((r) => r.app), sessions: count.results[0].n,
        // Fotoğraf varsa sürümü (adresin sonuna ?v= olarak eklenir), yoksa null.
        avatar: ava.results.length ? ava.results[0].key.split('/').pop() : null,
      },
    },
  };
}

export async function mySessions(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { b = {}; }
    const { results } = await env.DB.prepare('SELECT token FROM sessions WHERE user_id = ?1').bind(u.id).all();
    const drop = results.map((r) => r.token).filter((t) => t !== u.sid && (b.others || (b.id && t.startsWith(String(b.id)) && String(b.id).length >= 12)));
    if (drop.length) {
      await env.DB.batch(drop.flatMap((t) => [
        env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(t),
        env.DB.prepare('DELETE FROM session_info WHERE token = ?1').bind(t),
      ]));
    }
  }
  const { results } = await env.DB.prepare(
    'SELECT s.token, s.created, i.device, i.last_seen FROM sessions s LEFT JOIN session_info i ON i.token = s.token WHERE s.user_id = ?1 AND s.expires > ?2 ORDER BY COALESCE(i.last_seen, s.created) DESC',
  ).bind(u.id, now()).all();
  return {
    status: 200,
    data: {
      ok: true,
      sessions: results.map((r) => ({ id: r.token.slice(0, 16), device: r.device || 'Bilinmeyen cihaz', created: r.created, lastSeen: r.last_seen || r.created, current: r.token === u.sid })),
    },
  };
}

export async function emailStart(req, env, ipHash) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  let b;
  try { b = await req.json(); } catch { return fail('istek'); }
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 200 || !EMAIL_RE.test(email)) return fail('eposta');
  if (email === u.email) return fail('ayni');
  const [taken, perIp, last] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email),
    env.DB.prepare('SELECT COUNT(*) AS n FROM login_codes WHERE ip = ?1 AND created > ?2').bind(ipHash, ago(3600e3)),
    env.DB.prepare('SELECT created FROM login_codes WHERE email = ?1').bind(email),
  ]);
  if (taken.results[0]) return fail('uye-var', 409);
  if (perIp.results[0].n >= 10) return fail('cok', 429);
  if (last.results[0] && Date.now() - Date.parse(last.results[0].created) < 60e3) return fail('bekle', 429);
  const code = code6();
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code, expires, attempts, created, ip, pending) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)
     ON CONFLICT (email) DO UPDATE SET code = excluded.code, expires = excluded.expires, attempts = 0, created = excluded.created, ip = excluded.ip, pending = excluded.pending`,
  ).bind(email, await hash(env, `${email}:${code}`), new Date(Date.now() + CODE_MIN * 60e3).toISOString(), now(), ipHash, JSON.stringify({ changeFor: u.id })).run();
  const sent = await sendMail(env, email, codeMail(code, 'change', b.lang));
  if (!sent.ok) {
    await env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run();
    return { status: 502, data: { ok: false, error: 'gonderilemedi', resend: sent.status || 0, detail: sent.detail || '' } };
  }
  return { status: 200, data: { ok: true } };
}

export async function emailVerify(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  let b;
  try { b = await req.json(); } catch { return fail('istek'); }
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) return fail('kod');
  const row = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ?1').bind(email).first();
  let p = {};
  try { p = JSON.parse((row && row.pending) || '{}'); } catch {}
  if (!row || row.expires < now() || p.changeFor !== u.id) return fail('sure');
  if (row.attempts >= 5) return fail('deneme', 429);
  if ((await hash(env, `${email}:${code}`)) !== row.code) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?1').bind(email).run();
    return fail('kod');
  }
  const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (taken) return fail('uye-var', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email),
    env.DB.prepare('UPDATE users SET email = ?1 WHERE id = ?2').bind(email, u.id),
  ]);
  return { status: 200, data: { ok: true, email } };
}

async function removeUser(env, id) {
  const ava = await env.DB.prepare('SELECT key FROM user_avatar WHERE user_id = ?1').bind(id).first();
  if (ava && env.AVATARS) await env.AVATARS.delete(ava.key);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_avatar WHERE user_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM session_info WHERE token IN (SELECT token FROM sessions WHERE user_id = ?1)').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM app_notify WHERE user_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM user_sync WHERE user_id = ?1').bind(id),
    // Fikir panosu: oyları silinir, yazdığı fikirler isimsiz kalır
    env.DB.prepare('DELETE FROM idea_votes WHERE user_id = ?1').bind(id),
    env.DB.prepare('UPDATE ideas SET votes = (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = ideas.id), user_id = CASE WHEN user_id = ?1 THEN NULL ELSE user_id END').bind(id),
    env.DB.prepare('UPDATE feedback SET user_id = NULL WHERE user_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id),
  ]);
}

export async function deleteMe(req, env, secure) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  await removeUser(env, u.id);
  return { status: 200, data: { ok: true }, cookie: cookie('', 0, secure) };
}

export async function adminUsers(req, url, env) {
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { b = {}; }
    if (b.action === 'remove' && b.id) {
      await removeUser(env, String(b.id));
      return { ok: true };
    }
    return { ok: false, error: 'işlem' };
  }
  const days = Math.min(400, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const from = new Date(Date.now() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const [counts, daily, rows, notify] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS total, SUM(announce) AS announce, SUM(last_login >= ?1) AS active FROM users').bind(ago(30 * 86400e3)),
    env.DB.prepare('SELECT substr(created, 1, 10) AS day, COUNT(*) AS n FROM users WHERE created >= ?1 GROUP BY day ORDER BY day').bind(from),
    env.DB.prepare('SELECT id, email, name, created, last_login, announce FROM users ORDER BY created DESC LIMIT 2000'),
    env.DB.prepare('SELECT app, COUNT(*) AS n FROM app_notify GROUP BY app'),
  ]);
  const c = counts.results[0] || {};
  return {
    ok: true,
    mailEnabled: !!env.RESEND_API_KEY || env.MAIL_DEV === '1',
    counts: { total: c.total || 0, announce: c.announce || 0, active: c.active || 0 },
    daily: daily.results,
    rows: rows.results,
    notify: Object.fromEntries(notify.results.map((r) => [r.app, r.n])),
  };
}

// OA Tarayıcı eşitlemesi. Her koleksiyon ("bookmarks", "quick") ayrı tutulur ve
// istemcinin gönderdiği "updated" zamanı sunucudakinden yeniyse yerine geçer (son yazan kazanır).
// OA Tarayıcı eşitlemesi:
//   bookmarks, quick   yer imleri ve hızlı erişim
//   history            geçmiş (cihazlar birleştirir)
//   vault              şifreler; cihazda kullanıcının parolasıyla şifrelenmiş (sunucu içini göremez)
//   tabs:<cihaz>       o cihazda açık sekmeler
//   inbox:<cihaz>      o cihaza gönderilen sekmeler
//   screentime:<cihaz> o cihazın ekran süresi özeti (isteğe bağlı, son 30 gün)
const SYNC_ITEMS = new Set(['bookmarks', 'quick', 'history', 'vault']);
const SYNC_DEVICE = /^(tabs|inbox|screentime):[a-z0-9-]{8,48}$/;
const SYNC_DEVICE_MAX = 20; // kullanıcı başına cihaz kaydı (her tür için)
const SYNC_MAX = 1024 * 1024; // bir istekte gönderilen toplam eşitleme verisi
const syncName = (n) => SYNC_ITEMS.has(n) || SYNC_DEVICE.test(n);

export async function mySync(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  const rows = await env.DB.prepare('SELECT item, updated, data FROM user_sync WHERE user_id = ?1').bind(u.id).all();
  const items = {};
  for (const r of rows.results) {
    try { items[r.item] = { updated: r.updated, data: JSON.parse(r.data) }; } catch { /* bozuk kayıt: yok say */ }
  }
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { return fail('istek'); }
    const stmts = [];
    let total = 0;
    for (const [name, v] of Object.entries((b && b.items) || {})) {
      if (!syncName(name) || !v || !Array.isArray(v.data)) continue;
      if (!items[name] && SYNC_DEVICE.test(name)) {
        const kind = name.split(':')[0] + ':';
        if (Object.keys(items).filter((k) => k.startsWith(kind)).length >= SYNC_DEVICE_MAX) continue;
      }
      const updated = typeof v.updated === 'string' && !Number.isNaN(Date.parse(v.updated)) ? new Date(v.updated).toISOString() : now();
      const text = JSON.stringify(v.data);
      total += text.length;
      if (total > SYNC_MAX) return fail('buyuk', 413);
      if (items[name] && items[name].updated >= updated) continue; // sunucudaki daha yeni
      items[name] = { updated, data: v.data };
      stmts.push(env.DB.prepare('INSERT INTO user_sync (user_id, item, updated, data) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id, item) DO UPDATE SET updated = excluded.updated, data = excluded.data')
        .bind(u.id, name, updated, text));
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return { status: 200, data: { ok: true, items } };
}

// ---------- Profil fotoğrafı ----------
// Fotoğraf tarayıcıda 256×256'ya küçültülüp (konum bilgisi dahil bütün ek bilgiler atılarak) gönderilir.
// Yalnız sahibine, oturum çereziyle verilir; herkese açık bir adresi yoktur.
const AVATAR_MAX = 150 * 1024;
function imageType(b) {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return '';
}

export async function myAvatar(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return { status: 401 };
  const row = await env.DB.prepare('SELECT key FROM user_avatar WHERE user_id = ?1').bind(u.id).first();
  if (!row || !env.AVATARS) return { status: 404 };
  const obj = await env.AVATARS.get(row.key);
  if (!obj) return { status: 404 };
  return { status: 200, body: obj.body, type: (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/webp' };
}

export async function setAvatar(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  if (!env.AVATARS) return fail('foto-kapali', 503);
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > AVATAR_MAX) return fail('buyuk', 413);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return fail('istek');
  if (buf.length > AVATAR_MAX) return fail('buyuk', 413);
  const type = imageType(buf);
  if (!type) return fail('tur', 415);
  const old = await env.DB.prepare('SELECT key FROM user_avatar WHERE user_id = ?1').bind(u.id).first();
  const key = `${u.id}/${rand(12)}`;
  await env.AVATARS.put(key, buf, { httpMetadata: { contentType: type } });
  await env.DB.prepare('INSERT INTO user_avatar (user_id, key, updated) VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO UPDATE SET key = excluded.key, updated = excluded.updated')
    .bind(u.id, key, now()).run();
  if (old) await env.AVATARS.delete(old.key);
  return { status: 200, data: { ok: true, avatar: key.split('/').pop() } };
}

export async function deleteAvatar(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  const old = await env.DB.prepare('SELECT key FROM user_avatar WHERE user_id = ?1').bind(u.id).first();
  if (old) {
    if (env.AVATARS) await env.AVATARS.delete(old.key);
    await env.DB.prepare('DELETE FROM user_avatar WHERE user_id = ?1').bind(u.id).run();
  }
  return { status: 200, data: { ok: true, avatar: null } };
}
