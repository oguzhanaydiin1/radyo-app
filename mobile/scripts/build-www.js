'use strict';

/*
 * Android paketinin web dosyalarını hazırlar: Windows arayüzü (renderer/) + Android köprüsü.
 *   node mobile/scripts/build-www.js        → mobile/www/
 * GitHub Actions'ta GITHUB_RUN_NUMBER derleme numarası olarak yazılır (güncelleme denetimi için).
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const src = path.join(root, 'renderer');
const shim = path.join(root, 'mobile', 'shim');
const out = path.join(root, 'mobile', 'www');
const pkg = require(path.join(root, 'package.json'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Windows arayüzü (mini oynatıcı penceresi hariç)
const SKIP = new Set(['mini.html', 'mini.js']);
fs.cpSync(src, out, { recursive: true, filter: (p) => !SKIP.has(path.basename(p)) });
// Android köprüsü, düzeni ve etiket okuyucu
fs.cpSync(shim, out, { recursive: true });
// Uygulamayla gelen listeler (çevrimdışıyken ve ilk açılışta)
fs.copyFileSync(path.join(root, 'src', 'ek-istasyonlar.json'), path.join(out, 'ek-istasyonlar.json'));
fs.copyFileSync(path.join(root, 'src', 'podcastler.json'), path.join(out, 'podcastler.json'));
fs.writeFileSync(path.join(out, 'android-build.json'), JSON.stringify({
  version: pkg.version,
  build: Number(process.env.GITHUB_RUN_NUMBER) || 0,
  builtAt: new Date().toISOString(),
}));

const indexFile = path.join(out, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
const must = (needle) => { if (!html.includes(needle)) throw new Error(`index.html içinde bulunamadı: ${needle}`); };
must('<link rel="stylesheet" href="media.css">');
must('<script src="i18n.js"></script>');
must('<meta charset="utf-8">');
html = html
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n  <meta name="theme-color" content="#12131A">')
  .replace('<link rel="stylesheet" href="media.css">', '<link rel="stylesheet" href="media.css">\n  <link rel="stylesheet" href="android.css">')
  .replace('<script src="i18n.js"></script>', '<script src="vendor/jsmediatags.min.js"></script>\n  <script src="android-bridge.js"></script>\n  <script src="i18n.js"></script>');
fs.writeFileSync(indexFile, html);

const count = (dir) => fs.readdirSync(dir, { recursive: true }).length;
console.log(`mobile/www hazır: ${count(out)} dosya, sürüm ${pkg.version}, derleme ${Number(process.env.GITHUB_RUN_NUMBER) || 0}`);
