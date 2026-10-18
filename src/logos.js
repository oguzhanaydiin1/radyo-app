'use strict';

/*
 * İstasyon logoları için "radyo-logo://" adresi. Logolar ana süreçte indirilir,
 * diskte saklanır (%APPDATA%\Radyo\logolar) ve arayüze CORS izniyle verilir; böylece
 * arayüz logoyu tuvale çizip arka plan rengini bulabilir, boşlukları kırpabilir.
 *
 *   radyo-logo://img/?u=<logo adresi>
 */

const { app, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const SCHEME = 'radyo-logo';
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_AGE = 14 * 24 * 3600e3;
const FAIL_AGE = 24 * 3600e3;

const dir = () => path.join(app.getPath('userData'), 'logolar');
const keyOf = (url) => crypto.createHash('sha1').update(url).digest('hex');
const inflight = new Map();

/** app.whenReady'den önce çağrılmalı. */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  }]);
}

const TYPES = /^image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif|bmp)$/i;

function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  const head = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return '';
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await net.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 RadyoApp', Accept: 'image/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok || !res.body) return null;
    const chunks = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { controller.abort(); return null; }
      chunks.push(Buffer.from(value));
    }
    const buf = Buffer.concat(chunks);
    const type = sniff(buf) || String(res.headers.get('content-type') || '').split(';')[0].trim();
    if (!TYPES.test(type) || buf.length < 32) return null;
    return { buf, type };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getLogo(url) {
  const key = keyOf(url);
  const file = path.join(dir(), key);
  const meta = `${file}.json`;
  try {
    const m = JSON.parse(await fs.readFile(meta, 'utf8'));
    const age = Date.now() - m.at;
    if (m.fail && age < FAIL_AGE) return null;
    if (!m.fail && age < MAX_AGE) return { buf: await fs.readFile(file), type: m.type };
  } catch { /* önbellekte yok */ }

  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const got = await download(url);
    await fs.mkdir(dir(), { recursive: true }).catch(() => {});
    if (got) {
      await fs.writeFile(file, got.buf).catch(() => {});
      await fs.writeFile(meta, JSON.stringify({ at: Date.now(), type: got.type })).catch(() => {});
    } else {
      // Eski bir kopya varsa onu kullanmaya devam et.
      try {
        const m = JSON.parse(await fs.readFile(meta, 'utf8'));
        if (!m.fail) {
          const buf = await fs.readFile(file);
          return { buf, type: m.type };
        }
      } catch { /* yok */ }
      await fs.writeFile(meta, JSON.stringify({ at: Date.now(), fail: true })).catch(() => {});
    }
    return got;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

function handle() {
  protocol.handle(SCHEME, async (request) => {
    let target = '';
    try {
      target = new URL(request.url).searchParams.get('u') || '';
    } catch { /* geçersiz */ }
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (!/^https?:\/\//i.test(target) || target.length > 2000) return new Response(null, { status: 400, headers: cors });
    const logo = await getLogo(target);
    if (!logo) return new Response(null, { status: 404, headers: cors });
    return new Response(logo.buf, {
      status: 200,
      headers: { ...cors, 'Content-Type': logo.type, 'Cache-Control': 'max-age=86400', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
    });
  });
}

/** Bir haftadan uzun süredir kullanılmayan logoları temizler (en fazla ~2000 dosya tutulur). */
async function prune() {
  try {
    const names = await fs.readdir(dir());
    const metas = names.filter((n) => n.endsWith('.json'));
    if (metas.length < 2000) return;
    const items = await Promise.all(metas.map(async (n) => ({ n, t: (await fs.stat(path.join(dir(), n)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
    items.sort((a, b) => a.t - b.t);
    for (const { n } of items.slice(0, items.length - 1500)) {
      await fs.unlink(path.join(dir(), n)).catch(() => {});
      await fs.unlink(path.join(dir(), n.replace(/\.json$/, ''))).catch(() => {});
    }
  } catch { /* klasör yok */ }
}

module.exports = { registerScheme, handle, prune, SCHEME };
