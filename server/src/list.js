/*
 * E-posta listesi (duyurular) — iki aşamalı onay.
 *
 *   POST /v1/list/subscribe     { email, consent: true, lang?, source? }
 *   GET  /v1/list/confirm?t=…   Onay bağlantısı → oalabs.dev/liste/?durum=onaylandi
 *   GET  /v1/list/leave?t=…     Ayrılma bağlantısı → kayıt silinir
 *   POST /v1/list/leave?t=…     Tek tıkla ayrılma (e-posta uygulamalarının "Abonelikten çık" düğmesi)
 *   GET  /v1/admin/list         Sayılar ve kayıtlar (yönetici)
 *   POST /v1/admin/list         { action: "send-pending" } | { action: "remove", email } (yönetici)
 *
 * E-posta gönderimi Resend ile yapılır (gizli değer RESEND_API_KEY). Anahtar yoksa
 * kayıtlar "onay bekliyor" olarak tutulur; anahtar eklenince panelden toplu gönderilebilir.
 */

const SITE = 'https://oalabs.dev';
const API = 'https://api.oalabs.dev';
const CONSENT = 'v1-2026-10-20';
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const now = () => new Date().toISOString();

function token() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function redirect(status) {
  return new Response(null, { status: 303, headers: { Location: `${SITE}/liste/?durum=${status}`, 'Cache-Control': 'no-store' } });
}

const TEXT = {
  tr: {
    subject: 'OA Labs listesine katılımını onayla',
    hello: 'Merhaba,',
    body: 'OA Labs e-posta listesine katılmak için bu adresi yazdın. Onaylamak için aşağıdaki düğmeye bas.',
    button: 'Katılımı onayla',
    ignore: 'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; adresin listeye eklenmez ve 7 gün sonra silinir.',
    what: 'Yalnızca yeni uygulamalar ve önemli güncellemeler hakkında, ayda en fazla birkaç kez yazarız.',
    leave: 'Listeden ayrıl',
  },
  en: {
    subject: 'Confirm your OA Labs sign-up',
    hello: 'Hi,',
    body: 'You asked to join the OA Labs mailing list with this address. Press the button below to confirm.',
    button: 'Confirm sign-up',
    ignore: 'If this wasn’t you, ignore this email; your address won’t be added and will be deleted after 7 days.',
    what: 'We only write about new apps and important updates, a few times a month at most.',
    leave: 'Unsubscribe',
  },
};

function confirmMail(lang, tok) {
  const t = TEXT[lang] || TEXT.tr;
  const confirmUrl = `${API}/v1/list/confirm?t=${tok}`;
  const leaveUrl = `${API}/v1/list/leave?t=${tok}`;
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#0D0F16;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif;color:#EEEAE2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#151824;border:1px solid #262B3D;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<div style="font-weight:800;font-size:20px;margin-bottom:24px"><span style="display:inline-block;background:#EEEAE2;color:#0D0F16;border-radius:8px;padding:5px 6px;font-size:12px;margin-right:8px">OA</span>OA Labs</div>
<p style="margin:0 0 12px;font-size:16px;line-height:1.6">${t.hello}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6">${t.body}</p>
<p style="margin:0 0 28px"><a href="${confirmUrl}" style="display:inline-block;background:#F2A541;color:#14110A;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:24px;font-size:16px">${t.button}</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#B7BACA">${t.what}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#9EA2B3">${t.ignore}</p>
</td></tr></table>
<p style="font-size:12px;color:#7E8296;margin:16px 0 0">OA Labs · oalabs.dev · <a href="${leaveUrl}" style="color:#7E8296">${t.leave}</a></p>
</td></tr></table></body></html>`;
  const text = `${t.hello}\n\n${t.body}\n\n${t.button}: ${confirmUrl}\n\n${t.what}\n${t.ignore}\n\n${t.leave}: ${leaveUrl}\n`;
  return { subject: t.subject, html, text, leaveUrl };
}

async function sendConfirm(env, row) {
  if (!env.RESEND_API_KEY) return false;
  const m = confirmMail(row.lang, row.token);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'OA Labs <haber@oalabs.dev>',
      to: [row.email],
      reply_to: 'destek@oalabs.dev',
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: { 'List-Unsubscribe': `<${m.leaveUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) {
    console.error('Resend', res.status, (await res.text()).slice(0, 300));
    return false;
  }
  await env.DB.prepare('UPDATE subscribers SET mailed = ?1 WHERE email = ?2').bind(now(), row.email).run();
  return true;
}

export async function subscribe(req, env, ipHash) {
  let b;
  try { b = await req.json(); } catch { return { status: 400, data: { ok: false, error: 'istek' } }; }
  if (b && b.website) return { status: 200, data: { ok: true } }; // bot tuzağı
  const email = String((b && b.email) || '').trim().toLowerCase();
  if (email.length > 200 || !EMAIL_RE.test(email)) return { status: 400, data: { ok: false, error: 'eposta' } };
  if (!b.consent) return { status: 400, data: { ok: false, error: 'onay' } };
  const lang = b.lang === 'en' ? 'en' : 'tr';
  const source = String(b.source || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30);

  // Onay e-postası 7 günden önce gitmiş ama onaylanmamış kayıtları temizle; aynı yerden saatte en fazla 5 kayıt.
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
  const [, recent, existing] = await env.DB.batch([
    env.DB.prepare("DELETE FROM subscribers WHERE status = 'pending' AND mailed IS NOT NULL AND mailed < ?1").bind(weekAgo),
    env.DB.prepare('SELECT COUNT(*) AS n FROM subscribers WHERE ip = ?1 AND created > ?2').bind(ipHash, hourAgo),
    env.DB.prepare('SELECT * FROM subscribers WHERE email = ?1').bind(email),
  ]);
  if (recent.results[0].n >= 5) return { status: 429, data: { ok: false, error: 'cok' } };

  let row = existing.results[0];
  // Zaten onaylıysa aynı cevabı ver (adresin listede olup olmadığı dışarıdan anlaşılmasın).
  if (row && row.status === 'active') return { status: 200, data: { ok: true, mail: !!env.RESEND_API_KEY } };
  // Aynı adrese 10 dakikada bir onay e-postası.
  if (row && row.mailed && Date.now() - Date.parse(row.mailed) < 600e3) return { status: 200, data: { ok: true, mail: true } };

  if (!row) {
    row = { email, status: 'pending', token: token(), created: now(), lang, source, consent: CONSENT, ip: ipHash };
    await env.DB.prepare(
      'INSERT INTO subscribers (email, status, token, created, lang, source, consent, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
    ).bind(row.email, row.status, row.token, row.created, row.lang, row.source, row.consent, row.ip).run();
  }
  const mailed = await sendConfirm(env, row);
  return { status: 200, data: { ok: true, mail: mailed } };
}

export async function confirm(url, env) {
  const t = url.searchParams.get('t') || '';
  if (!/^[0-9a-f]{48}$/.test(t)) return redirect('gecersiz');
  const r = await env.DB.prepare(
    "UPDATE subscribers SET status = 'active', confirmed = COALESCE(confirmed, ?1) WHERE token = ?2",
  ).bind(now(), t).run();
  return redirect(r.meta.changes ? 'onaylandi' : 'gecersiz');
}

export async function leave(req, url, env) {
  const t = url.searchParams.get('t') || '';
  if (/^[0-9a-f]{48}$/.test(t)) await env.DB.prepare('DELETE FROM subscribers WHERE token = ?1').bind(t).run();
  if (req.method === 'POST') return new Response('ok', { status: 200 });
  return redirect('ayrildi');
}

export async function adminList(req, url, env) {
  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { b = {}; }
    if (b.action === 'remove' && b.email) {
      await env.DB.prepare('DELETE FROM subscribers WHERE email = ?1').bind(String(b.email).toLowerCase()).run();
      return { ok: true };
    }
    if (b.action === 'send-pending') {
      if (!env.RESEND_API_KEY) return { ok: false, error: 'Resend anahtarı henüz eklenmemiş' };
      const { results } = await env.DB.prepare(
        "SELECT * FROM subscribers WHERE status = 'pending' AND mailed IS NULL ORDER BY created LIMIT 40",
      ).all();
      let sent = 0;
      for (const row of results) if (await sendConfirm(env, row)) sent++;
      return { ok: true, sent, total: results.length };
    }
    return { ok: false, error: 'işlem' };
  }
  const days = Math.min(400, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const from = new Date(Date.now() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const [counts, daily, rows] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) AS n, SUM(mailed IS NULL) AS unmailed FROM subscribers GROUP BY status'),
    env.DB.prepare("SELECT substr(confirmed, 1, 10) AS day, COUNT(*) AS n FROM subscribers WHERE status = 'active' AND confirmed >= ?1 GROUP BY day ORDER BY day").bind(from),
    env.DB.prepare('SELECT email, status, created, confirmed, lang, source FROM subscribers ORDER BY created DESC LIMIT 1000'),
  ]);
  const c = { active: 0, pending: 0, unmailed: 0 };
  for (const r of counts.results) {
    c[r.status] = r.n;
    if (r.status === 'pending') c.unmailed = r.unmailed || 0;
  }
  return { ok: true, mailEnabled: !!env.RESEND_API_KEY, counts: c, daily: daily.results, rows: rows.results };
}
