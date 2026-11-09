// Geri bildirim formu ve fikir panosu.
//   POST /v1/feedback              Hata / öneri bildir (hesap gerekmez; e-posta isteğe bağlı)
//   GET  /v1/ideas                 Herkese açık fikirler (giriş yaptıysan hangilerine oy verdiğin de)
//   POST /v1/ideas                 Fikir ekle (giriş gerekir; yönetici onaylayınca görünür)
//   POST /v1/ideas/vote            { id } oyu ver / geri al (giriş gerekir)
//   GET/POST /v1/admin/feedback    Gelen bildirimler, "ele alındı" işareti
//   GET/POST /v1/admin/ideas       Bütün fikirler, durum ve yanıt
import { sessionUserPublic as sessionUser } from './auth.js';

const now = () => new Date().toISOString();
const APPS = new Set(['pusula', 'radyo', 'harrier', 'site', 'diger']);
const KINDS = new Set(['hata', 'oneri', 'diger', 'yorum']);
const PUBLIC = ['open', 'planned', 'progress', 'done'];
const STATUSES = new Set(['pending', 'open', 'planned', 'progress', 'done', 'rejected']);
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;
const txt = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n) : '');
const ok = (data, status = 200) => ({ status, data: { ok: status < 400, ...data } });

export async function sendFeedback(req, env, ipHash) {
  let b; try { b = await req.json(); } catch { return ok({ error: 'istek' }, 400); }
  const kind = KINDS.has(b.kind) ? b.kind : 'diger';
  const app = APPS.has(b.app) ? b.app : 'diger';
  const text = txt(b.text, 4000);
  if (text.length < 5) return ok({ error: 'kisa' }, 400);
  const email = txt(b.email, 200);
  if (email && !EMAIL_RE.test(email)) return ok({ error: 'eposta' }, 400);
  // Kötüye kullanım sınırı: aynı yerden saatte 6 bildirim
  const hour = new Date(Date.now() - 3600e3).toISOString();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ?1 AND created > ?2').bind(ipHash, hour).first();
  if (n && n.n >= 6) return ok({ error: 'cok' }, 429);
  const u = await sessionUser(req, env);
  const t = now();
  const fb = await env.DB.prepare('INSERT INTO feedback (created, kind, app, text, email, page, ip_hash, user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id')
    .bind(t, kind, app, text, email || (u && u.email) || null, txt(b.page, 200) || null, ipHash, u ? u.id : null).first();
  // Yorum ve yayımlama izni: yönetici onaylayana kadar görünmez
  if (kind === 'yorum' && b.consent === true && text.length <= 600) {
    await env.DB.prepare('INSERT INTO reviews (created, app, text, name, lang, feedback_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(t, app, text, txt(b.name, 40) || null, b.lang === 'en' ? 'en' : 'tr', fb ? fb.id : null).run();
  }
  return ok({});
}

export async function listIdeas(req, env) {
  const u = await sessionUser(req, env);
  const rows = await env.DB.prepare(
    `SELECT id, app, title, body, status, reply, votes, created FROM ideas WHERE status IN ('open','planned','progress','done') ORDER BY votes DESC, created DESC LIMIT 300`,
  ).all();
  let mine = [], voted = [];
  if (u) {
    voted = (await env.DB.prepare('SELECT idea_id FROM idea_votes WHERE user_id = ?1').bind(u.id).all()).results.map((r) => r.idea_id);
    mine = (await env.DB.prepare(`SELECT id, app, title, status, created FROM ideas WHERE user_id = ?1 AND status IN ('pending','rejected') ORDER BY created DESC LIMIT 20`).bind(u.id).all()).results;
  }
  return ok({ ideas: rows.results, voted, mine, signedIn: !!u });
}

export async function addIdea(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  let b; try { b = await req.json(); } catch { return ok({ error: 'istek' }, 400); }
  const title = txt(b.title, 120);
  const body = txt(b.body, 1500);
  const app = APPS.has(b.app) ? b.app : 'diger';
  if (title.length < 5) return ok({ error: 'kisa' }, 400);
  const day = new Date(Date.now() - 86400e3).toISOString();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM ideas WHERE user_id = ?1 AND created > ?2').bind(u.id, day).first();
  if (n && n.n >= 5) return ok({ error: 'cok' }, 429);
  const t = now();
  const r = await env.DB.prepare('INSERT INTO ideas (user_id, app, title, body, status, votes, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6) RETURNING id')
    .bind(u.id, app, title, body || null, 'pending', t).first();
  await env.DB.prepare('INSERT OR IGNORE INTO idea_votes (idea_id, user_id, created) VALUES (?1, ?2, ?3)').bind(r.id, u.id, t).run();
  return ok({ id: r.id });
}

export async function voteIdea(req, env) {
  const u = await sessionUser(req, env);
  if (!u) return ok({ error: 'giris' }, 401);
  let b; try { b = await req.json(); } catch { return ok({ error: 'istek' }, 400); }
  const id = parseInt(b.id, 10);
  const idea = id ? await env.DB.prepare(`SELECT id, status FROM ideas WHERE id = ?1`).bind(id).first() : null;
  if (!idea || !['open', 'planned', 'progress'].includes(idea.status)) return ok({ error: 'yok' }, 404);
  const had = await env.DB.prepare('SELECT 1 AS x FROM idea_votes WHERE idea_id = ?1 AND user_id = ?2').bind(id, u.id).first();
  if (had) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM idea_votes WHERE idea_id = ?1 AND user_id = ?2').bind(id, u.id),
      env.DB.prepare('UPDATE ideas SET votes = (SELECT COUNT(*) FROM idea_votes WHERE idea_id = ?1) WHERE id = ?1').bind(id),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO idea_votes (idea_id, user_id, created) VALUES (?1, ?2, ?3)').bind(id, u.id, now()),
      env.DB.prepare('UPDATE ideas SET votes = (SELECT COUNT(*) FROM idea_votes WHERE idea_id = ?1) WHERE id = ?1').bind(id),
    ]);
  }
  const v = await env.DB.prepare('SELECT votes FROM ideas WHERE id = ?1').bind(id).first();
  return ok({ voted: !had, votes: v ? v.votes : 0 });
}

export async function adminFeedback(req, env) {
  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch { b = {}; }
    const id = parseInt(b.id, 10);
    if (!id) return { ok: false, error: 'id' };
    if (b.action === 'delete') await env.DB.prepare('DELETE FROM feedback WHERE id = ?1').bind(id).run();
    else await env.DB.prepare('UPDATE feedback SET done = ?2 WHERE id = ?1').bind(id, b.done ? 1 : 0).run();
    return { ok: true };
  }
  const rows = await env.DB.prepare('SELECT id, created, kind, app, text, email, page, done FROM feedback ORDER BY done ASC, created DESC LIMIT 200').all();
  const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE done = 0').first();
  return { ok: true, items: rows.results, open: open ? open.n : 0 };
}

export async function adminIdeas(req, env) {
  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch { b = {}; }
    if (b.action === 'create') {
      // Yönetici yol haritasına doğrudan madde ekler
      const title = txt(b.title, 120);
      if (title.length < 5) return { ok: false, error: 'kisa' };
      const t = now();
      const r = await env.DB.prepare('INSERT INTO ideas (user_id, app, title, body, status, votes, created, updated) VALUES (NULL, ?1, ?2, ?3, ?4, 0, ?5, ?5) RETURNING id')
        .bind(APPS.has(b.app) ? b.app : 'diger', title, txt(b.body, 1500) || null, STATUSES.has(b.status) ? b.status : 'planned', t).first();
      return { ok: true, id: r.id };
    }
    const id = parseInt(b.id, 10);
    if (!id) return { ok: false, error: 'id' };
    if (b.action === 'delete') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM idea_votes WHERE idea_id = ?1').bind(id),
        env.DB.prepare('DELETE FROM ideas WHERE id = ?1').bind(id),
      ]);
      return { ok: true };
    }
    const status = STATUSES.has(b.status) ? b.status : null;
    const sets = [], args = [id];
    if (status) { args.push(status); sets.push(`status = ?${args.length}`); }
    if (typeof b.reply === 'string') { args.push(txt(b.reply, 600) || null); sets.push(`reply = ?${args.length}`); }
    if (typeof b.title === 'string' && txt(b.title, 120).length >= 5) { args.push(txt(b.title, 120)); sets.push(`title = ?${args.length}`); }
    if (!sets.length) return { ok: false, error: 'alan' };
    args.push(now()); sets.push(`updated = ?${args.length}`);
    await env.DB.prepare(`UPDATE ideas SET ${sets.join(', ')} WHERE id = ?1`).bind(...args).run();
    return { ok: true };
  }
  const rows = await env.DB.prepare(
    `SELECT i.id, i.app, i.title, i.body, i.status, i.reply, i.votes, i.created, u.email FROM ideas i LEFT JOIN users u ON u.id = i.user_id
     ORDER BY CASE i.status WHEN 'pending' THEN 0 ELSE 1 END, i.votes DESC, i.created DESC LIMIT 300`,
  ).all();
  return { ok: true, items: rows.results };
}

// ---------- Yorumlar ----------
export async function listReviews(url, env) {
  const app = url.searchParams.get('app');
  const rows = APPS.has(app)
    ? await env.DB.prepare('SELECT id, app, text, name, lang, created FROM reviews WHERE published = 1 AND app = ?1 ORDER BY created DESC LIMIT 30').bind(app).all()
    : await env.DB.prepare('SELECT id, app, text, name, lang, created FROM reviews WHERE published = 1 ORDER BY created DESC LIMIT 30').all();
  return { ok: true, reviews: rows.results };
}

export async function adminReviews(req, env) {
  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch { b = {}; }
    const id = parseInt(b.id, 10);
    if (!id) return { ok: false, error: 'id' };
    if (b.action === 'delete') await env.DB.prepare('DELETE FROM reviews WHERE id = ?1').bind(id).run();
    else await env.DB.prepare('UPDATE reviews SET published = ?2 WHERE id = ?1').bind(id, b.published ? 1 : 0).run();
    return { ok: true };
  }
  const rows = await env.DB.prepare('SELECT id, created, app, text, name, lang, published FROM reviews ORDER BY published ASC, created DESC LIMIT 200').all();
  return { ok: true, items: rows.results };
}
