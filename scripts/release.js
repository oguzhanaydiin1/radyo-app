'use strict';

/*
 * Yeni sürüm dosyalarını hazırlar (önce "npm run pack" çalıştırılmış olmalı):
 *   updates/latest.json         — kurulu uygulamaların baktığı sürüm bilgisi
 *   updates/app-<sürüm>.asar    — uygulamanın kendisi (bir önceki sürümünki de tutulur)
 * Sürüm notları "release-notes.md" dosyasından alınır.
 * Ardından bu klasör GitHub'a gönderilir (git add updates && git commit && git push);
 * kurulu uygulamalar birkaç dakika içinde yeni sürümü görür.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const asarSrc = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
const outDir = path.join(root, 'updates');

if (!fs.existsSync(asarSrc)) {
  console.error('Önce "npm run pack" çalıştır: dist/win-unpacked bulunamadı.');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
// Eski sürüm dosyalarını kaldır. Bir önceki sürüm de tutulur: GitHub latest.json'ı birkaç
// dakika önbellekte tutabildiği için o arada eski bilgiyle indiren biri dosyayı bulabilsin.
const prev = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf8')).asar.file; } catch { return ''; }
})();
for (const f of fs.readdirSync(outDir)) {
  if (/^app-.*\.asar$/i.test(f) && f !== prev) fs.unlinkSync(path.join(outDir, f));
}

const asar = fs.readFileSync(asarSrc);
const file = `app-${pkg.version}.asar`;
fs.writeFileSync(path.join(outDir, file), asar);
const notesFile = path.join(root, 'release-notes.md');
const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '';
const manifest = {
  version: pkg.version,
  electron: electronVersion,
  date: new Date().toISOString(),
  notes,
  asar: { file, size: asar.length, sha256: crypto.createHash('sha256').update(asar).digest('hex') },
  full: pkg.updateSource ? `https://github.com/${pkg.updateSource.owner}/${pkg.updateSource.repo}/releases/latest` : '',
};
fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Hazır: updates/ (sürüm ${pkg.version}, Electron ${electronVersion}, ${(asar.length / 1024).toFixed(0)} KB)`);
