'use strict';

/*
 * Uygulama içi güncelleme (GitHub Releases).
 *
 * Her sürümde GitHub'a iki küçük dosya konur:
 *   update.json  — { version, electron, asar: { name, size, sha256 } }
 *   app.asar     — uygulamanın kendisi (birkaç yüz KB)
 * Uygulama son sürüme bakar; Electron sürümü aynıysa yalnızca app.asar'ı indirir,
 * doğrular ve yeniden başlarken eski dosyanın yerine koyar. Electron değiştiyse
 * (nadiren) tam paketin indirileceği sayfayı açar.
 */

const { app, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const pkg = require('../package.json');
const SOURCE = pkg.updateSource || {};
const UA = { 'User-Agent': `RadyoApp/${pkg.version}`, Accept: 'application/vnd.github+json' };

let notify = () => {};
let latest = null;    // son denetimde bulunan sürüm bilgisi
let ready = null;     // indirilip doğrulanmış güncelleme
let downloading = false;

const configured = () => !!(SOURCE.owner && SOURCE.repo);
// .asar uzantılı dosyalara Electron'un özel davranışı karışmasın diye indirme .bin olarak tutulur.
const pendingFile = () => path.join(process.resourcesPath, 'app-update.bin');
const asarFile = () => path.join(process.resourcesPath, 'app.asar');

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
  if (!app.isPackaged) return { status: 'dev', current: app.getVersion() };
  if (!configured()) return { status: 'unconfigured', current: app.getVersion() };
  if (ready) return { status: 'ready', current: app.getVersion(), version: ready.version, notes: ready.notes };
  let rel;
  try {
    const api = process.env.RADYO_UPDATE_API || 'https://api.github.com'; // yalnızca test için değiştirilebilir
    rel = await getJSON(`${api}/repos/${encodeURIComponent(SOURCE.owner)}/${encodeURIComponent(SOURCE.repo)}/releases/latest`);
  } catch (err) {
    return { status: 'error', current: app.getVersion(), message: 'Güncelleme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.' };
  }
  if (!rel || !rel.tag_name) return { status: 'latest', current: app.getVersion() };
  const version = String(rel.tag_name).replace(/^v/i, '');
  if (cmpVersion(version, app.getVersion()) <= 0) return { status: 'latest', current: app.getVersion() };

  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const manifestAsset = assets.find((a) => a.name === 'update.json');
  const fullAsset = assets.find((a) => /\.zip$/i.test(a.name));
  const notes = String(rel.body || '').slice(0, 4000);
  const page = String(rel.html_url || '');
  const fullUrl = fullAsset ? fullAsset.browser_download_url : page;
  if (!manifestAsset) {
    latest = { version, notes, full: true, fullUrl, page };
    return { status: 'full', current: app.getVersion(), version, notes };
  }
  let manifest;
  try {
    manifest = await getJSON(manifestAsset.browser_download_url);
  } catch {
    return { status: 'error', current: app.getVersion(), message: 'Güncelleme bilgisi okunamadı.' };
  }
  const asarAsset = manifest && manifest.asar && assets.find((a) => a.name === manifest.asar.name);
  const sameRuntime = manifest && major(manifest.electron) === major(process.versions.electron);
  if (!asarAsset || !sameRuntime || !/^[0-9a-f]{64}$/i.test(String(manifest.asar.sha256 || ''))) {
    latest = { version, notes, full: true, fullUrl, page };
    return { status: 'full', current: app.getVersion(), version, notes };
  }
  latest = {
    version, notes, full: false, fullUrl, page,
    url: asarAsset.browser_download_url, sha256: manifest.asar.sha256.toLowerCase(), size: Number(manifest.asar.size) || asarAsset.size || 0,
  };
  return { status: 'available', current: app.getVersion(), version, notes, size: latest.size };
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
  const target = pendingFile();
  const tmp = `${target}.part`;
  try {
    // Klasöre yazılabiliyor mu? (Program Files'a kurulduysa yazılamaz.)
    try {
      await fsp.access(process.resourcesPath, fs.constants.W_OK);
    } catch {
      throw Object.assign(new Error('noperm'), { code: 'noperm' });
    }
    const res = await net.fetch(latest.url, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || latest.size || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(tmp);
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
    ready = { version: latest.version, notes: latest.notes };
    notify({ type: 'ready', version: ready.version, notes: ready.notes });
    return { status: 'ready', version: ready.version };
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    const message = err.code === 'noperm'
      ? 'Uygulama klasörüne yazılamıyor. Yeni sürümü tam paket olarak indirmen gerekiyor.'
      : err.code === 'checksum'
        ? 'İndirilen dosya doğrulanamadı; güncelleme uygulanmadı. Daha sonra tekrar dene.'
        : 'Güncelleme indirilemedi. İnternet bağlantını kontrol et.';
    notify({ type: 'error', message, full: err.code === 'noperm', fullUrl: latest.fullUrl });
    return { status: 'error', message };
  } finally {
    downloading = false;
  }
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Uygulama kapandıktan sonra yeni dosyayı yerine koyup uygulamayı yeniden açan
 * küçük bir PowerShell komutu başlatır. Komut, Türkçe karakterli klasör adları
 * sorun olmasın diye -EncodedCommand ile verilir.
 */
function runSwap(relaunch) {
  if (!ready || process.platform !== 'win32' || !fs.existsSync(pendingFile())) return false;
  const script = [
    `$p = ${process.pid}`,
    'for ($i = 0; $i -lt 100 -and (Get-Process -Id $p -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 300 }',
    'Start-Sleep -Milliseconds 700',
    `$src = ${psQuote(pendingFile())}`,
    `$dst = ${psQuote(asarFile())}`,
    `$bak = ${psQuote(`${asarFile()}.bak`)}`,
    'for ($i = 0; $i -lt 20; $i++) {',
    '  try { Copy-Item -LiteralPath $dst -Destination $bak -Force -ErrorAction Stop; Move-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; break }',
    '  catch { Start-Sleep -Milliseconds 500 }',
    '}',
    relaunch ? `Start-Process -FilePath ${psQuote(process.execPath)}` : '',
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  ready = null; // aynı güncelleme iki kez uygulanmasın
  return true;
}

function installAndRestart(beforeQuit) {
  if (!runSwap(true)) return false;
  beforeQuit();
  app.quit();
  return true;
}

/** Kullanıcı "Yeniden başlat"a basmadan kapatırsa güncelleme kapanırken uygulanır. */
function installOnQuit() {
  return runSwap(false);
}

/** Önceki çalıştırmadan kalan yarım indirmeleri temizle. */
function cleanup() {
  if (!app.isPackaged) return;
  for (const f of [`${pendingFile()}.part`, pendingFile()]) fsp.unlink(f).catch(() => {});
}

module.exports = {
  check, download, installAndRestart, installOnQuit, cleanup, configured,
  source: () => ({ ...SOURCE }),
  onEvent: (fn) => { notify = fn; },
};
