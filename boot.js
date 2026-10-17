'use strict';

/*
 * Başlatıcı. Uygulama içi güncellemeyle indirilen yeni sürüm (kullanıcı klasöründe,
 * %APPDATA%\Radyo\guncelleme\app-<sürüm>.asar) kurulu sürümden yeniyse onu yükler;
 * değilse kurulu sürümü. Böylece güncelleme için uygulama dosyalarının değiştirilmesi
 * gerekmez; yeniden başlatma Electron'un kendi app.relaunch() işleviyle yapılır.
 */

const { app } = require('electron');
const path = require('node:path');
const ofs = require('original-fs'); // .asar dosyalarını arşiv değil düz dosya olarak görür

const bundled = require('./package.json').version;

function cmp(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function pickUpdate() {
  if (!app.isPackaged || process.env.RADYO_NO_UPDATE) return null;
  try {
    const dir = path.join(app.getPath('userData'), 'guncelleme');
    const info = JSON.parse(ofs.readFileSync(path.join(dir, 'current.json'), 'utf8'));
    if (!info || !/^[\w.-]+\.asar$/i.test(String(info.file || ''))) return null;
    const file = path.join(dir, info.file);
    if (cmp(info.version, bundled) <= 0) {
      // Daha yeni bir tam paket kurulmuş: eski güncellemeyi temizle.
      try { ofs.rmSync(dir, { recursive: true, force: true }); } catch {}
      return null;
    }
    if (info.failed === info.version) return null; // önceki denemede açılamadı
    if (!ofs.existsSync(file)) return null;
    return { file, info, dir };
  } catch {
    return null;
  }
}

const upd = pickUpdate();
if (upd) {
  process.env.RADYO_BUNDLED_VERSION = bundled;
  try {
    require(path.join(upd.file, 'main.js'));
  } catch (err) {
    // Yeni sürüm açılamadıysa bir daha denenmesin; kurulu sürümle devam et.
    try {
      ofs.writeFileSync(path.join(upd.dir, 'current.json'), JSON.stringify({ ...upd.info, failed: upd.info.version }));
    } catch {}
    console.error('Güncelleme yüklenemedi:', err);
    app.relaunch();
    app.exit(0);
  }
} else {
  require('./main.js');
}
