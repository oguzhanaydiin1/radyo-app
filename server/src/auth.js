/*
 * OA Labs üyeliği — şifresiz: e-postaya gelen 6 haneli kodla giriş.
 *
 *   POST /v1/auth/start     { mode: "register"|"login", email, name?, announce?, consent? }
 *   POST /v1/auth/verify    { email, code }  → oturum çerezi (oa_s, oalabs.dev geneli, HttpOnly)
 *   POST /v1/auth/logout
 *   GET  /v1/me             Giriş yapmış üyenin bilgileri
 *   POST /v1/me             { name?, announce? } bilgileri güncelle
 *   POST /v1/me/delete      Hesabı ve oturumları tamamen sil
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

function codeMail(code, mode) {
  const title = mode === 'register' ? 'OA Labs üyeliğini tamamla' : 'OA Labs giriş kodun';
  const lead = mode === 'register'
    ? 'OA Labs’e üye olmak için bu kodu sayfaya yaz:'
    : 'OA Labs hesabına girmek için bu kodu sayfaya yaz:';
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#0D0F16;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif;color:#EEEAE2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#151824;border:1px solid #262B3D;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<div style="font-weight:800;font-size:20px;margin-bottom:24px"><span style="display:inline-block;background:#EEEAE2;color:#0D0F16;border-radius:8px;padding:5px 6px;font-size:12px;margin-right:8px">OA</span>OA Labs</div>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<div style="font-size:36px;font-weight:800;letter-spacing:8px;background:#0D0F16;border:1px solid #262B3D;border-radius:12px;padding:16px 0;text-align:center;color:#F2A541">${code}</div>
<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#9EA2B3">Kod ${CODE_MIN} dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; kodu kimseyle paylaşma.</p>
</td></tr></table>
<p style="font-size:12px;color:#7E8296;margin:16px 0 0">OA Labs · oalabs.dev</p>
</td></tr></table></body></html>`;
  const text = `${lead}\n\n${code}\n\nKod ${CODE_MIN} dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.\n`;
  return { subject: `${title}: ${code}`, html, text };
}

async function sendMail(env, to, m) {
  if (env.MAIL_DEV === '1') { console.log(`[deneme e-postası] ${to}: ${m.subject}`); return true; } // yalnızca yerel deneme
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'OA Labs <hesap@oalabs.dev>', to: [to], reply_to: 'destek@oalabs.dev', subject: m.subject, html: m.html, text: m.text }),
  });
  if (!res.ok) console.error('Resend', res.status, (await res.text()).slice(0, 300));
  return res.ok;
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
  if (!(await sendMail(env, email, codeMail(code, mode)))) return fail('gonderilemedi', 502);
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
    user = { id: rand(10) };
    stmts.push(env.DB.prepare(
      'INSERT INTO users (id, email, name, created, last_login, announce, consent) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)',
    ).bind(user.id, email, p.name, now(), p.announce ? 1 : 0, p.consent));
  } else {
    stmts.push(env.DB.prepare('UPDATE users SET last_login = ?1 WHERE id = ?2').bind(now(), user.id));
  }
  const token = rand(32);
  stmts.push(env.DB.prepare('DELETE FROM sessions WHERE expires < ?1').bind(now()));
  stmts.push(env.DB.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
    .bind(await hash(env, `s:${token}`), user.id, now(), new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString()));
  await env.DB.batch(stmts);
  return { status: 200, data: { ok: true, created: !!row.pending }, cookie: cookie(token, SESSION_DAYS * 86400, secure) };
}

async function sessionUser(req, env) {
  const t = readCookie(req);
  if (!t) return null;
  return env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.created, u.announce, s.token AS sid FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1 AND s.expires > ?2',
  ).bind(await hash(env, `s:${t}`), now()).first();
}

export async function logout(req, env, secure) {
  const t = readCookie(req);
  if (t) await env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(await hash(env, `s:${t}`)).run();
  return { status: 200, data: { ok: true }, cookie: cookie('', 0, secure) };
}

export async function me(req, env, secure) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { b = {}; }
    const name = b.name === undefined ? u.name : cleanName(b.name);
    if (name.length < 2) return fail('ad');
    const announce = b.announce === undefined ? u.announce : (b.announce ? 1 : 0);
    await env.DB.prepare('UPDATE users SET name = ?1, announce = ?2 WHERE id = ?3').bind(name, announce, u.id).run();
    Object.assign(u, { name, announce });
  }
  return { status: 200, data: { ok: true, user: { email: u.email, name: u.name, created: u.created, announce: !!u.announce } } };
}

export async function deleteMe(req, env, secure) {
  const u = await sessionUser(req, env);
  if (!u) return fail('giris', 401);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(u.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(u.id),
  ]);
  return { status: 200, data: { ok: true }, cookie: cookie('', 0, secure) };
}

export async function adminUsers(req, url, env) {
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { b = {}; }
    if (b.action === 'remove' && b.id) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(String(b.id)),
        env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(String(b.id)),
      ]);
      return { ok: true };
    }
    return { ok: false, error: 'işlem' };
  }
  const days = Math.min(400, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const from = new Date(Date.now() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const [counts, daily, rows] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS total, SUM(announce) AS announce, SUM(last_login >= ?1) AS active FROM users').bind(ago(30 * 86400e3)),
    env.DB.prepare('SELECT substr(created, 1, 10) AS day, COUNT(*) AS n FROM users WHERE created >= ?1 GROUP BY day ORDER BY day').bind(from),
    env.DB.prepare('SELECT id, email, name, created, last_login, announce FROM users ORDER BY created DESC LIMIT 2000'),
  ]);
  const c = counts.results[0] || {};
  return {
    ok: true,
    mailEnabled: !!env.RESEND_API_KEY || env.MAIL_DEV === '1',
    counts: { total: c.total || 0, announce: c.announce || 0, active: c.active || 0 },
    daily: daily.results,
    rows: rows.results,
  };
}
