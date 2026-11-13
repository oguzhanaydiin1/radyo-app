'use strict';

/*
 * Yerel müzik kütüphanesi.
 *
 * Kullanıcının seçtiği klasörler taranır, parçaların etiketleri (ad, sanatçı, albüm,
 * süre) okunur ve %APPDATA%\OA Radyo\kutuphane.json dosyasında saklanır. Dosyalar hiçbir
 * yere yüklenmez; arayüz onları "oa-media://track/<kimlik>" adresinden çalar. Bu adres
 * yalnızca kütüphanede kayıtlı dosyaları verir, başka bir dosyaya ulaşılamaz.
 *
 * Şarkı sözleri sırayla: parçanın yanındaki .lrc dosyası, dosyanın kendi etiketi,
 * ayarlarda açıksa LRCLIB (lrclib.net; yalnızca sanatçı, şarkı adı, albüm ve süre gönderilir).
 */

const { app, protocol, dialog, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const SCHEME = 'oa-media';
const PRIVILEGED = {
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
};

const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};
const MAX_TRACKS = 30000;
const MAX_DEPTH = 14;
const MAX_FOLDERS = 30;
const SKIP_DIRS = /^(\$recycle\.bin|system volume information|node_modules|\.git|\.cache)$/i;
const COVER_NAMES = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'albumart.jpg'];

const file = () => path.join(app.getPath('userData'), 'kutuphane.json');
let data = { folders: [], tracks: [], scannedAt: 0 };
let byId = new Map();
let scanning = null;
let notify = () => {};
let getSettings = () => ({});
let mm = null;

const idOf = (p) => crypto.createHash('sha1').update(path.resolve(p).toLowerCase()).digest('hex').slice(0, 24);
const clean = (v, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isAudio = (name) => Object.prototype.hasOwnProperty.call(MIME, path.extname(name).toLowerCase());

function metadata() {
  if (!mm) mm = require('music-metadata');
  return mm;
}

function rebuild() {
  byId = new Map(data.tracks.map((t) => [t.id, t]));
}

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    data = {
      folders: Array.isArray(j.folders) ? j.folders.filter((f) => typeof f === 'string').slice(0, MAX_FOLDERS) : [],
      tracks: Array.isArray(j.tracks) ? j.tracks.filter((t) => t && typeof t.path === 'string' && typeof t.id === 'string') : [],
      scannedAt: Number(j.scannedAt) || 0,
    };
  } catch {
    data = { folders: [], tracks: [], scannedAt: 0 };
  }
  rebuild();
}

async function persist() {
  const tmp = `${file()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fsp.rename(tmp, file());
}

/** Arayüze gönderilen biçim: dosya yolu yerine yalnızca klasörün adı ve çalma adresi. */
function publicTrack(t) {
  return {
    id: t.id,
    url: `${SCHEME}://track/${t.id}`,
    title: t.title,
    artist: t.artist,
    album: t.album,
    albumArtist: t.albumArtist,
    year: t.year,
    no: t.no,
    disc: t.disc,
    genre: t.genre,
    duration: t.duration,
    hasCover: t.hasCover,
    folder: t.folder,
    dir: path.basename(path.dirname(t.path)),
    file: path.basename(t.path),
    format: path.extname(t.path).slice(1).toUpperCase(),
  };
}

function get() {
  return {
    folders: data.folders.map((dir) => ({ dir, name: path.basename(dir) || dir, count: data.tracks.filter((t) => t.folder === dir).length })),
    tracks: data.tracks.map(publicTrack),
    scannedAt: data.scannedAt,
    scanning: !!scanning,
  };
}

/** "Sanatçı - Şarkı.mp3" gibi adlardan etiketi olmayan dosyalar için ad çıkarır. */
function fromName(p) {
  const base = path.basename(p, path.extname(p)).replace(/_/g, ' ');
  // "03 - Ad", "03. Ad" ya da "03 Ad" (başında sıfır varsa) → "Ad"
  const noNum = base.replace(/^\s*(?:\d{1,3}\s*[-.)]|0\d(?=\s))\s*/, '');
  const m = noNum.match(/^(.+?)\s+[-–]\s+(.+)$/);
  return m ? { artist: clean(m[1]), title: clean(m[2]) } : { artist: '', title: clean(noNum) || clean(base) };
}

async function walk(dir, depth, out) {
  if (depth > MAX_DEPTH || out.length >= MAX_TRACKS) return;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_TRACKS) return;
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.test(e.name)) await walk(p, depth + 1, out);
    } else if (e.isFile() && isAudio(e.name)) {
      out.push(p);
    }
  }
}

async function readTrack(p, folder, old) {
  let st;
  try {
    st = await fsp.stat(p);
  } catch {
    return null;
  }
  if (old && old.mtime === st.mtimeMs && old.size === st.size) return old;
  const guess = fromName(p);
  const t = {
    id: idOf(p),
    path: p,
    folder,
    title: guess.title,
    artist: guess.artist,
    album: '',
    albumArtist: '',
    year: 0,
    no: 0,
    disc: 0,
    genre: '',
    duration: 0,
    hasCover: false,
    hasLyrics: false,
    mtime: st.mtimeMs,
    size: st.size,
  };
  try {
    const meta = await metadata().parseFile(p, { duration: false, skipCovers: false });
    const c = meta.common || {};
    t.title = clean(c.title) || t.title;
    t.artist = clean(c.artist) || clean(Array.isArray(c.artists) ? c.artists.join(', ') : '') || t.artist;
    t.album = clean(c.album);
    t.albumArtist = clean(c.albumartist);
    t.year = Number(c.year) || 0;
    t.no = Number(c.track && c.track.no) || 0;
    t.disc = Number(c.disk && c.disk.no) || 0;
    t.genre = clean(Array.isArray(c.genre) ? c.genre[0] : '', 60);
    t.duration = Math.round(Number(meta.format && meta.format.duration) || 0);
    t.hasCover = Array.isArray(c.picture) && c.picture.length > 0;
    t.hasLyrics = Array.isArray(c.lyrics) && c.lyrics.some((x) => clean(String(x || '')).length > 0);
  } catch {
    // Etiketi okunamayan dosya da listede kalır; ad dosya adından gelir.
  }
  return t;
}

async function scan(folders) {
  if (scanning) return scanning;
  scanning = (async () => {
    const oldByPath = new Map(data.tracks.map((t) => [t.path, t]));
    const files = [];
    for (const dir of folders) {
      const list = [];
      await walk(dir, 0, list);
      for (const p of list) files.push({ p, dir });
      if (files.length >= MAX_TRACKS) break;
    }
    notify({ type: 'scan', done: 0, total: files.length });
    const keep = data.tracks.filter((t) => !folders.includes(t.folder) && data.folders.includes(t.folder));
    const found = [];
    let done = 0;
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const { p, dir } = files[next++];
        const t = await readTrack(p, dir, oldByPath.get(p));
        if (t) found.push(t);
        done += 1;
        if (done % 25 === 0) notify({ type: 'scan', done, total: files.length });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const seen = new Set();
    data.tracks = [...keep, ...found].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
    data.scannedAt = Date.now();
    rebuild();
    await persist().catch(() => {});
    notify({ type: 'scanned', total: data.tracks.length });
  })();
  try {
    await scanning;
  } finally {
    scanning = null;
  }
  return get();
}

async function addFolder(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Müzik klasörünü seç',
    properties: ['openDirectory', 'multiSelections'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  const added = [];
  for (const raw of r.filePaths) {
    const dir = path.resolve(raw);
    const inside = data.folders.some((f) => dir === f || dir.startsWith(f + path.sep));
    if (inside || data.folders.length >= MAX_FOLDERS) continue;
    // Seçilen klasör eskilerden birini kapsıyorsa eskisini çıkar.
    data.folders = data.folders.filter((f) => !f.startsWith(dir + path.sep));
    data.folders.push(dir);
    added.push(dir);
  }
  if (!added.length) return get();
  await persist().catch(() => {});
  return scan(added);
}

async function removeFolder(dir) {
  if (typeof dir !== 'string' || !data.folders.includes(dir)) return get();
  data.folders = data.folders.filter((f) => f !== dir);
  data.tracks = data.tracks.filter((t) => t.folder !== dir);
  rebuild();
  await persist().catch(() => {});
  return get();
}

const rescan = () => scan([...data.folders]);

// ---------- Kapak ----------

const coverCache = new Map();
async function cover(id) {
  const t = byId.get(String(id || ''));
  if (!t) return null;
  if (coverCache.has(t.id)) return coverCache.get(t.id);
  let out = null;
  if (t.hasCover) {
    try {
      const meta = await metadata().parseFile(t.path, { duration: false });
      const pics = (meta.common && meta.common.picture) || [];
      const pic = pics.find((x) => /front/i.test(String(x.type || ''))) || pics[0];
      if (pic && pic.data && pic.data.length < 6 * 1024 * 1024) {
        const fmt = /^image\/(png|jpe?g|webp|gif)$/i.test(pic.format || '') ? pic.format : 'image/jpeg';
        out = `data:${fmt};base64,${Buffer.from(pic.data).toString('base64')}`;
      }
    } catch { /* kapak okunamadı */ }
  }
  if (!out) {
    const dir = path.dirname(t.path);
    for (const name of COVER_NAMES) {
      try {
        const buf = await fsp.readFile(path.join(dir, name));
        if (buf.length < 6 * 1024 * 1024) {
          out = `data:image/${name.endsWith('.png') ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;
          break;
        }
      } catch { /* yok */ }
    }
  }
  coverCache.set(t.id, out);
  if (coverCache.size > 80) coverCache.delete(coverCache.keys().next().value);
  return out;
}

// ---------- Şarkı sözleri ----------

const isLrc = (text) => /^\s*\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/m.test(text);

async function lyrics(id) {
  const t = byId.get(String(id || ''));
  if (!t) return null;
  const base = t.path.slice(0, t.path.length - path.extname(t.path).length);
  for (const ext of ['.lrc', '.LRC', '.txt']) {
    try {
      const buf = await fsp.readFile(base + ext);
      if (buf.length > 512 * 1024) continue;
      const text = buf.toString('utf8').replace(/^﻿/, '');
      if (text.trim()) return { text, synced: isLrc(text), source: ext.toLowerCase() === '.txt' ? 'txt' : 'lrc' };
    } catch { /* yok */ }
  }
  if (t.hasLyrics) {
    try {
      const meta = await metadata().parseFile(t.path, { duration: false, skipCovers: true });
      const text = ((meta.common && meta.common.lyrics) || []).map((x) => String(x || '')).join('\n').trim();
      if (text) return { text, synced: isLrc(text), source: 'tag' };
    } catch { /* okunamadı */ }
  }
  return null;
}

const onlineCache = new Map();
async function lrclibGet(params, timeoutMs = 8000) {
  const url = new URL('https://lrclib.net/api/get');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, String(v));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await net.fetch(url.toString(), {
      headers: { 'User-Agent': `OA Radyo ${app.getVersion()} (https://oalabs.dev/radyo/)` },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** LRCLIB'den söz arar. Ayarlarda kapalıysa hiçbir şey göndermez. */
async function online(q = {}) {
  if (getSettings().lyricsOnline === false) return { off: true };
  const artist = clean(q.artist, 120);
  const title = clean(q.title, 160);
  if (!artist || !title) return null;
  const album = clean(q.album, 160);
  const duration = Math.round(Number(q.duration) || 0);
  const key = `${artist}|${title}|${album}|${duration}`.toLowerCase();
  if (onlineCache.has(key)) return onlineCache.get(key);
  let j = null;
  try {
    j = await lrclibGet({ artist_name: artist, track_name: title, album_name: album, duration: duration || '' });
    if (!j && (album || duration)) j = await lrclibGet({ artist_name: artist, track_name: title });
  } catch {
    return { error: true };
  }
  let out = null;
  if (j && !j.instrumental) {
    const synced = typeof j.syncedLyrics === 'string' && j.syncedLyrics.trim() ? j.syncedLyrics : '';
    const plain = typeof j.plainLyrics === 'string' ? j.plainLyrics : '';
    if (synced || plain.trim()) out = { text: synced || plain, synced: !!synced, source: 'lrclib' };
  } else if (j && j.instrumental) {
    out = { text: '', instrumental: true, source: 'lrclib' };
  }
  onlineCache.set(key, out);
  if (onlineCache.size > 300) onlineCache.delete(onlineCache.keys().next().value);
  return out;
}

function reveal(id) {
  const t = byId.get(String(id || ''));
  if (t) shell.showItemInFolder(t.path);
  return !!t;
}

// ---------- oa-media:// ----------

function handle() {
  protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);
    const id = u.pathname.replace(/^\/+/, '');
    const t = u.hostname === 'track' ? byId.get(id) : null;
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (!t) return new Response('Bulunamadı', { status: 404, headers: cors });
    let st;
    try {
      st = await fsp.stat(t.path);
    } catch {
      return new Response('Dosya yok', { status: 404, headers: cors });
    }
    const type = MIME[path.extname(t.path).toLowerCase()] || 'application/octet-stream';
    const size = st.size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
    let start = 0;
    let end = size - 1;
    if (range) {
      if (range[1] === '' && range[2] !== '') {
        start = Math.max(0, size - Number(range[2]));
      } else {
        start = Number(range[1]) || 0;
        if (range[2] !== '') end = Math.min(size - 1, Number(range[2]));
      }
      if (start > end || start >= size) {
        return new Response('', { status: 416, headers: { ...cors, 'Content-Range': `bytes */${size}` } });
      }
    }
    const body = Readable.toWeb(fs.createReadStream(t.path, { start, end }));
    const headers = {
      ...cors,
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}

function init(opts = {}) {
  if (typeof opts.notify === 'function') notify = opts.notify;
  if (typeof opts.settings === 'function') getSettings = opts.settings;
  load();
  handle();
}

module.exports = {
  PRIVILEGED,
  SCHEME,
  init,
  get,
  addFolder,
  removeFolder,
  rescan,
  cover,
  lyrics,
  online,
  reveal,
  // testler için
  _internal: { fromName, isLrc, readTrack, walk },
};
