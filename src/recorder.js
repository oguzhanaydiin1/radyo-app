'use strict';

/*
 * Yayın kaydı. Yayın, çalardan bağımsız ikinci bir bağlantıyla doğrudan dosyaya
 * yazılır. Yayın şarkı bilgisi gönderiyorsa bilgi blokları sesten ayıklanır ve
 * kaydın yanına "… - şarkı listesi.txt" dosyası yazılır.
 */

const { app, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { IcyDemux, metaintOf } = require('./icy');

const AUDIO_EXTS = new Set(['.mp3', '.aac', '.ogg', '.opus', '.flac', '.m4a']);
const MAX_MS = 6 * 60 * 60 * 1000;

let rec = null;
let notify = () => {};

const recDir = () => path.join(app.getPath('music'), 'Radyo Kayıtları');
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function safeFileName(s) {
  return String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Radyo';
}

function extFor(contentType, codec, url) {
  const ct = contentType.toLowerCase();
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
  if (ct.includes('aac')) return 'aac';
  if (ct.includes('ogg') || ct.includes('opus')) return 'ogg';
  if (ct.includes('flac')) return 'flac';
  const c = String(codec || '').toLowerCase();
  if (c.includes('mp3')) return 'mp3';
  if (c.includes('aac')) return 'aac';
  if (c.includes('ogg') || c.includes('opus')) return 'ogg';
  if (c.includes('flac')) return 'flac';
  const m = /\.(mp3|aac|ogg|opus|flac)(\?|$)/i.exec(url);
  return m ? m[1].toLowerCase() : 'mp3';
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

function fmtOffset(ms) {
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const playlistFile = (audioFile) => audioFile.replace(/\.[^.]+$/, ' - şarkı listesi.txt');

function insideRecDir(file) {
  if (typeof file !== 'string') return null;
  const full = path.resolve(file);
  return full.startsWith(recDir() + path.sep) ? full : null;
}

async function finish(reason) {
  if (!rec || rec.finishing) return;
  const r = rec;
  r.finishing = true;
  clearInterval(r.tick);
  clearTimeout(r.limit);
  await new Promise((resolve) => r.out.end(resolve));
  rec = null;
  const done = {
    type: 'stopped', reason, file: r.file, name: path.basename(r.file), bytes: r.bytes,
    ms: Date.now() - r.startedAt, station: r.station, scheduled: r.scheduled, songs: r.titles.length,
  };
  if (r.bytes < 4096) {
    await fs.unlink(r.file).catch(() => {});
    done.type = 'failed';
    done.message = 'Yayından veri alınamadı, kayıt yapılamadı.';
  } else {
    if (r.titles.length) {
      const lines = r.titles.map((t) => `${fmtOffset(t.at)}  ${t.title}`);
      await fs.writeFile(playlistFile(r.file), `${r.station.name} — ${path.basename(r.file)}\r\n\r\n${lines.join('\r\n')}\r\n`, 'utf8').catch(() => {});
    }
    if (reason === 'error') done.message = 'Yayın bağlantısı koptu; o ana kadarki kısım kaydedildi.';
  }
  notify(done);
}

/**
 * Kaydı başlatır. opts.maxMs: zamanlanmış kayıtlarda süre; opts.scheduled: bilgi amaçlı.
 */
async function start(station = {}, opts = {}) {
  if (rec) throw new Error('Zaten bir kayıt sürüyor.');
  const url = clean(station.url, 2000);
  const name = clean(station.name, 120) || 'Radyo';
  if (!/^https?:\/\//i.test(url)) throw new Error('Geçersiz yayın adresi.');
  if (/\.m3u8(\?|$)/i.test(url) || station.hls) throw new Error('Bu yayın (HLS) kaydedilemiyor.');

  await fs.mkdir(recDir(), { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await net.fetch(url, { headers: { 'User-Agent': 'RadyoApp/0.3', 'Icy-MetaData': '1' }, signal: controller.signal });
  } catch {
    throw new Error('Yayına bağlanılamadı.');
  } finally {
    clearTimeout(timer);
  }
  const ct = String(res.headers.get('content-type') || '');
  if (!res.ok || !res.body || /mpegurl|m3u|pls|text\/|json|xml/i.test(ct)) {
    controller.abort();
    throw new Error('Bu yayının biçimi kaydedilemiyor.');
  }
  if (rec) {
    controller.abort();
    throw new Error('Zaten bir kayıt sürüyor.');
  }

  // Aynı dakikada başlayan kayıtlar birbirinin üzerine yazmasın.
  const base = `${safeFileName(name)} ${stamp()}`;
  const ext = extFor(ct, station.codec, url);
  let file = path.join(recDir(), `${base}.${ext}`);
  for (let n = 2; fsSync.existsSync(file); n++) file = path.join(recDir(), `${base} (${n}).${ext}`);
  const out = fsSync.createWriteStream(file);
  const maxMs = Math.min(Number(opts.maxMs) || MAX_MS, MAX_MS);
  const r = {
    file, out, controller, bytes: 0, startedAt: Date.now(), titles: [], scheduled: !!opts.scheduled,
    station: { id: clean(station.id, 80), name }, endsAt: opts.maxMs ? Date.now() + maxMs : null,
  };
  rec = r;
  r.tick = setInterval(() => notify({ type: 'progress', bytes: r.bytes, ms: Date.now() - r.startedAt, endsAt: r.endsAt }), 1000);
  r.limit = setTimeout(() => { r.limitHit = true; controller.abort(); }, maxMs);

  const metaint = metaintOf(res);
  let pending = Promise.resolve();
  const writeAudio = (chunk) => {
    r.bytes += chunk.byteLength;
    if (!out.write(Buffer.from(chunk))) pending = new Promise((ok) => out.once('drain', ok));
  };
  const demux = metaint
    ? new IcyDemux(metaint, writeAudio, (title) => {
      const last = r.titles[r.titles.length - 1];
      if (title && (!last || last.title !== title)) r.titles.push({ at: Date.now() - r.startedAt, title });
    })
    : null;

  (async () => {
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (demux) demux.push(Buffer.from(value));
        else writeAudio(value);
        await pending;
      }
      await finish('ended');
    } catch {
      await finish(r.userStopped ? 'user' : r.limitHit ? (r.scheduled ? 'scheduled' : 'limit') : 'error');
    }
  })();

  return { file, name: path.basename(file), startedAt: r.startedAt, station: r.station, endsAt: r.endsAt, scheduled: r.scheduled };
}

function stop() {
  if (!rec) return false;
  rec.userStopped = true;
  rec.controller.abort();
  return true;
}

function status() {
  return rec
    ? { active: true, bytes: rec.bytes, ms: Date.now() - rec.startedAt, station: rec.station, name: path.basename(rec.file), endsAt: rec.endsAt, scheduled: rec.scheduled }
    : { active: false };
}

const isActive = () => !!rec;

/** Uygulama kapanırken: kaydı bitir ve bitene kadar bekle (en fazla 3 sn). */
async function stopAndWait() {
  if (!rec) return;
  stop();
  const t0 = Date.now();
  while (rec && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 50));
}

async function list() {
  let names = [];
  try {
    names = await fs.readdir(recDir());
  } catch {
    return [];
  }
  const current = rec ? rec.file : null;
  const set = new Set(names);
  const items = [];
  for (const n of names) {
    if (!AUDIO_EXTS.has(path.extname(n).toLowerCase())) continue;
    const file = path.join(recDir(), n);
    if (file === current) continue;
    try {
      const st = await fs.stat(file);
      if (!st.isFile()) continue;
      const pl = path.basename(playlistFile(file));
      items.push({ file, name: n, size: st.size, mtime: st.mtimeMs, playlist: set.has(pl) ? path.join(recDir(), pl) : null });
    } catch { /* silinmiş olabilir */ }
  }
  return items.sort((a, b) => b.mtime - a.mtime);
}

async function open(file) {
  const f = insideRecDir(file);
  return f ? (await shell.openPath(f)) === '' : false;
}

function reveal(file) {
  const f = insideRecDir(file);
  if (f) shell.showItemInFolder(f);
  return !!f;
}

async function openDir() {
  await fs.mkdir(recDir(), { recursive: true });
  return (await shell.openPath(recDir())) === '';
}

async function trash(file) {
  const f = insideRecDir(file);
  if (!f || (rec && rec.file === f)) return false;
  await shell.trashItem(f);
  const pl = playlistFile(f);
  if (fsSync.existsSync(pl)) await shell.trashItem(pl).catch(() => {});
  return true;
}

module.exports = {
  start, stop, status, isActive, stopAndWait, list, open, reveal, openDir, trash,
  onEvent: (fn) => { notify = fn; },
};
