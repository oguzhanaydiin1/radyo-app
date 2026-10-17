'use strict';

/*
 * Yeni sürüm dosyalarını hazırlar (önce "npm run pack" çalıştırılmış olmalı):
 *   dist/release/app.asar
 *   dist/release/update.json
 *   dist/release/Radyo-<sürüm>-win.zip
 * Bu üç dosya GitHub'da "v<sürüm>" etiketli bir release'e yüklenir.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const dist = path.join(root, 'dist');
const asarSrc = path.join(dist, 'win-unpacked', 'resources', 'app.asar');
const zipSrc = path.join(dist, `Radyo-${pkg.version}-win.zip`);
const out = path.join(dist, 'release');

if (!fs.existsSync(asarSrc)) {
  console.error('Önce "npm run pack" çalıştır: dist/win-unpacked bulunamadı.');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const asar = fs.readFileSync(asarSrc);
fs.writeFileSync(path.join(out, 'app.asar'), asar);
const manifest = {
  version: pkg.version,
  electron: electronVersion,
  asar: { name: 'app.asar', size: asar.length, sha256: crypto.createHash('sha256').update(asar).digest('hex') },
};
fs.writeFileSync(path.join(out, 'update.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (fs.existsSync(zipSrc)) fs.copyFileSync(zipSrc, path.join(out, path.basename(zipSrc)));
console.log(`Hazır: dist/release (sürüm ${pkg.version}, Electron ${electronVersion})`);
console.log(JSON.stringify(manifest, null, 2));
