'use strict';

/*
 * Uygulama içi güncelleme (GitHub deposundaki "updates" klasörü).
 *
 * Her sürümde depoya iki dosya konur:
 *   updates/latest.json        — { version, electron, notes, asar: { file, size, sha256 }, full }
 *   updates/app-<sürüm>.asar   — uygulamanın kendisi (1 MB'tan küçük)
 * Uygulama latest.json'a bakar; Electron sürümü aynıysa yalnızca .asar dosyasını
 * kullanıcı klasörüne (%APPDATA%\\Radyo\\guncelleme) indirir, SHA-256 ile doğrular ve
 * current.json'a yazar. Bir sonraki açılışta boot.js bu dosyayı yükler. Kurulu dosyalara
 * dokunulmaz; yeniden başlatma app.relaunch() ile yapılır. Electron değiştiyse (nadiren)
 * tam paketin indirileceği sayfayı açar.
 */

const { app, net, shell } = require('electron');
const path = require('node:path');
const ofs = require('original-fs'); // .asar dosyalarını düz dosya olarak yazmak için
const fsp = ofs.promises;
const crypto = require('node:crypto');

const pkg = require('../package.json');
const VERSION = pkg.version;
const SOURCE = pkg.updateSource || {};
const UA = { 'User-Agent': `RadyoApp/${VERSION}`, 'Cache-Control': 'no-cache' };
// Yalnızca test için değiştirilebilir.
const BASE = () => process.env.RADYO_UPDATE_BASE
  || `https://raw.githubusercontent.com/${SOURCE.owner}/${SOURCE.repo}/${SOURCE.branch || 'main'}/updates`;

let notify = () => {};
let latest = null;    // son denetimde bulunan sürüm bilgisi
let ready = null;     // indirilip doğrulanmış güncelleme
let downloading = false;

const configured = () => !!(SOURCE.owner && SOURCE.repo);
const updDir = () => path.join(app.getPath('userData'), 'guncelleme');

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
const major = (v) => parseInt(String(v).split('.')[0], 10) || 0;

async function getJSON(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await net.fetch(url, { headers: UA, signal: controller.signal, redirect: 'follow' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Yeni sürüm var mı? */
async function check() {
  if (!app.isPackaged) return { status: 'dev', current: VERSION };
  if (!configured()) return { status: 'unconfigured', current: VERSION };
  if (ready) return { status: 'ready', current: VERSION, version: ready.version, notes: ready.notes };
  let manifest;
  try {
    manifest = await getJSON(`${BASE()}/latest.json?t=${Date.now()}`);
  } catch {
    return { status: 'error', current: VERSION, message: 'Güncelleme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.' };
  }
  if (!manifest || !manifest.version) return { status: 'latest', current: VERSION };
  const version = String(manifest.version).replace(/^v/i, '');
  if (cmpVersion(version, VERSION) <= 0) return { status: 'latest', current: VERSION };

  const notes = String(manifest.notes || '').slice(0, 4000);
  const page = `https://github.com/${SOURCE.owner}/${SOURCE.repo}`;
  const fullUrl = /^https:\/\//i.test(String(manifest.full || '')) ? manifest.full : page;
  const asar = manifest.asar || {};
  const sameRuntime = major(manifest.electron) === major(process.versions.electron);
  const validFile = /^[\w.-]+\.asar$/i.test(String(asar.file || ''));
  if (!sameRuntime || !validFile || !/^[0-9a-f]{64}$/i.test(String(asar.sha256 || ''))) {
    latest = { version, notes, full: true, fullUrl, page };
    return { status: 'full', current: VERSION, version, notes };
  }
  latest = {
    version, notes, full: false, fullUrl, page,
    url: `${BASE()}/${encodeURIComponent(asar.file)}`, sha256: asar.sha256.toLowerCase(), size: Number(asar.size) || 0,
  };
  return { status: 'available', current: VERSION, version, notes, size: latest.size };
}

/** Güncellemeyi indir ve doğrula. */
async function download() {
  if (!latest || latest.full) {
    if (latest && latest.fullUrl) await shell.openExternal(latest.fullUrl);
    return { status: 'full' };
  }
  if (downloading) return { status: 'downloading' };
  if (ready && ready.version === latest.version) return { status: 'ready', version: ready.version };
  downloading = true;
  const dir = updDir();
  const file = `app-${latest.version.replace(/[^\w.-]/g, '')}.asar`;
  const target = path.join(dir, file);
  const tmp = path.join(dir, 'indiriliyor.part');
  try {
    await fsp.mkdir(dir, { recursive: true });
    const res = await net.fetch(latest.url, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || latest.size || 0;
    const hash = crypto.createHash('sha256');
    const out = ofs.createWriteStream(tmp);
    const reader = res.body.getReader();
    let received = 0;
    let lastSent = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      hash.update(buf);
      received += buf.length;
      if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
      if (Date.now() - lastSent > 200) {
        lastSent = Date.now();
        notify({ type: 'progress', received, total });
      }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    const digest = hash.digest('hex');
    if (digest !== latest.sha256) throw Object.assign(new Error('checksum'), { code: 'checksum' });
    await fsp.rename(tmp, target);
    await fsp.writeFile(path.join(dir, 'current.json'), JSON.stringify({ version: latest.version, file, sha256: digest }));
    // Eski indirmeleri sil (o an çalışan sürümün dosyası kalsın).
    for (const f of await fsp.readdir(dir).catch(() => [])) {
      if (f.endsWith('.asar') && f !== file && f !== `app-${VERSION}.asar`) await fsp.unlink(path.join(dir, f)).catch(() => {});
    }
    ready = { version: latest.version, notes: latest.notes };
    notify({ type: 'ready', version: ready.version, notes: ready.notes });
    return { status: 'ready', version: ready.version };
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    const message = err.code === 'checksum'
      ? 'İndirilen dosya doğrulanamadı; güncelleme uygulanmadı. Daha sonra tekrar dene.'
      : 'Güncelleme indirilemedi. İnternet bağlantını kontrol et.';
    notify({ type: 'error', message, full: false, fullUrl: latest.fullUrl });
    return { status: 'error', message };
  } finally {
    downloading = false;
  }
}

/** Yeni sürümle yeniden başlat. */
function installAndRestart(beforeQuit) {
  if (!ready) return false;
  ready = null;
  beforeQuit();
  app.relaunch();
  app.quit();
  return true;
}

/** İndirilen sürüm bir sonraki açılışta zaten kullanılır; kapanırken yapılacak bir şey yok. */
function installOnQuit() {
  return false;
}

/** Yarım kalan indirmeleri ve eski yöntemden kalan dosyaları temizle. */
function cleanup() {
  if (!app.isPackaged) return;
  fsp.unlink(path.join(updDir(), 'indiriliyor.part')).catch(() => {});
  for (const f of ['app-update.bin', 'app-update.bin.part']) fsp.unlink(path.join(process.resourcesPath, f)).catch(() => {});
}

module.exports = {
  check, download, installAndRestart, installOnQuit, cleanup, configured,
  source: () => ({ ...SOURCE }),
  onEvent: (fn) => { notify = fn; },
};
