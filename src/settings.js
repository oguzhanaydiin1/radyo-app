'use strict';

/* Uygulama ayarları ve eşitleme klasörü (OneDrive gibi bir bulut klasörü). */

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const DEFAULTS = {
  closeToTray: true,
  openAtLogin: false,
  syncDir: '',
  trayHintShown: false,
  miniBounds: null,
};
const SYNC_NAME = 'radyo-esitleme.json';

const file = () => path.join(app.getPath('userData'), 'ayarlar.json');
let data = { ...DEFAULTS };
let watched = '';
let onSyncChanged = () => {};

function loadSync() {
  try {
    data = { ...DEFAULTS, ...JSON.parse(fsSync.readFileSync(file(), 'utf8')) };
  } catch {
    data = { ...DEFAULTS };
  }
  watchSync();
  return data;
}

async function persist() {
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file());
}

const get = () => ({ ...data });

async function set(patch = {}) {
  const next = { ...data };
  if ('closeToTray' in patch) next.closeToTray = !!patch.closeToTray;
  if ('openAtLogin' in patch) {
    next.openAtLogin = !!patch.openAtLogin;
    try {
      app.setLoginItemSettings({ openAtLogin: next.openAtLogin, args: ['--hidden'] });
    } catch { /* geliştirme modunda desteklenmeyebilir */ }
  }
  if ('syncDir' in patch) next.syncDir = typeof patch.syncDir === 'string' ? patch.syncDir : '';
  if ('trayHintShown' in patch) next.trayHintShown = !!patch.trayHintShown;
  if ('miniBounds' in patch) next.miniBounds = patch.miniBounds;
  data = next;
  await persist();
  if ('syncDir' in patch) watchSync();
  return get();
}

// ---------- Eşitleme dosyası ----------

const syncFile = () => (data.syncDir ? path.join(data.syncDir, SYNC_NAME) : '');

async function readSync() {
  const f = syncFile();
  if (!f) return null;
  try {
    const j = JSON.parse(await fs.readFile(f, 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

async function writeSync(payload) {
  const f = syncFile();
  if (!f) return false;
  const tmp = `${f}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload), 'utf8');
  await fs.rename(tmp, f);
  return true;
}

function watchSync() {
  if (watched) fsSync.unwatchFile(watched);
  watched = syncFile();
  if (watched) fsSync.watchFile(watched, { interval: 5000 }, (cur, prev) => {
    if (cur.mtimeMs !== prev.mtimeMs) onSyncChanged();
  });
}

module.exports = {
  loadSync, get, set, readSync, writeSync,
  onSyncChange: (fn) => { onSyncChanged = fn; },
};
