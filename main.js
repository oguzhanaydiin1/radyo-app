'use strict';

const {
  app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, Notification, dialog, screen,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const radio = require('./src/radio');
const recorder = require('./src/recorder');
const nowPlaying = require('./src/nowplaying');
const scheduler = require('./src/scheduler');
const settings = require('./src/settings');
const updater = require('./src/updater');

// Logosu ya da yayını bozuk sertifikalı sitelerden gelen istasyonlar için
// Chromium'un terminale yazdığı "handshake failed" satırlarını gizle.
app.commandLine.appendSwitch('log-level', '3');

const ICON = path.join(__dirname, 'assets', 'icon.png');
const TRAY_ICON = path.join(__dirname, 'assets', 'tray.png');
const startHidden = process.argv.includes('--hidden');

let mainWindow = null;
let miniWindow = null;
let tray = null;
let quitting = false;
/** Arayüzden gelen son çalar durumu (tepsi ve mini oynatıcı için). */
let player = { station: null, playing: false, buffering: false, title: '', volume: 70 };

const sendMain = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};
const sendMini = (channel, payload) => {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send(channel, payload);
};

function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show();
  } catch { /* bildirim desteklenmiyorsa sessizce geç */ }
}

function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(true);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------- Ana pencere ----------

function createWindow(show = !startHidden) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Radyo',
    icon: ICON,
    backgroundColor: '#12131A',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0E0F14', symbolColor: '#B4B6C2', height: 48 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // tepsideyken de zamanlayıcılar doğru çalışsın
    },
  });

  if (show) mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  // Kapat düğmesi: ayara göre tepsiye küçült ve çalmaya devam et.
  mainWindow.on('close', (e) => {
    if (quitting || !settings.get().closeToTray) return;
    e.preventDefault();
    mainWindow.hide();
    if (!settings.get().trayHintShown) {
      notify('Radyo arka planda çalıyor', 'Kapatmak için saatin yanındaki Radyo simgesine sağ tıklayıp “Çıkış”ı seç.');
      settings.set({ trayHintShown: true }).catch(() => {});
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!quitting && !settings.get().closeToTray) app.quit();
  });
}

// ---------- Sistem tepsisi ----------

function trayLabel(s, max = 60) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function updateTray() {
  if (!tray) return;
  const s = player.station;
  const tip = s ? `Radyo — ${s.name}${player.title ? `\n♪ ${player.title}` : ''}` : 'Radyo';
  tray.setToolTip(trayLabel(tip, 120));
  const rs = recorder.status();
  const items = [
    { label: s ? trayLabel(s.name) : 'İstasyon seçilmedi', enabled: false },
    ...(player.title ? [{ label: trayLabel(`♪ ${player.title}`), enabled: false }] : []),
    ...(rs.active ? [{ label: trayLabel(`● Kaydediliyor: ${rs.station.name}`), enabled: false }] : []),
    { type: 'separator' },
    { label: player.playing || player.buffering ? 'Duraklat' : 'Çal', enabled: !!s, click: () => sendMain('player:cmd', { type: 'toggle' }) },
    { label: 'Sonraki istasyon', enabled: !!s, click: () => sendMain('player:cmd', { type: 'next' }) },
    { label: 'Önceki istasyon', enabled: !!s, click: () => sendMain('player:cmd', { type: 'prev' }) },
    ...(rs.active ? [{ label: 'Kaydı durdur', click: () => recorder.stop() }] : []),
    { type: 'separator' },
    { label: 'Mini oynatıcı', type: 'checkbox', checked: !!(miniWindow && !miniWindow.isDestroyed()), click: () => toggleMini() },
    { label: 'Radyo’yu göster', click: () => showMain() },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { quitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  const img = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(ICON) : img);
  tray.on('click', () => showMain());
  updateTray();
}

// ---------- Mini oynatıcı ----------

function openMini() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    return;
  }
  const saved = settings.get().miniBounds;
  const area = screen.getPrimaryDisplay().workArea;
  const w = 380;
  const h = 96;
  let x = area.x + area.width - w - 24;
  let y = area.y + area.height - h - 24;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const onScreen = screen.getAllDisplays().some((d) => saved.x >= d.workArea.x - 50 && saved.y >= d.workArea.y - 50
      && saved.x < d.workArea.x + d.workArea.width - 50 && saved.y < d.workArea.y + d.workArea.height - 50);
    if (onScreen) ({ x, y } = saved);
  }
  miniWindow = new BrowserWindow({
    width: w, height: h, x, y,
    frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, title: 'Radyo — mini', icon: ICON, backgroundColor: '#1A1C25', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  miniWindow.setAlwaysOnTop(true, 'floating');
  miniWindow.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
  miniWindow.once('ready-to-show', () => {
    miniWindow.showInactive();
    sendMini('player:state', player);
  });
  miniWindow.on('moved', () => {
    const b = miniWindow.getBounds();
    settings.set({ miniBounds: { x: b.x, y: b.y } }).catch(() => {});
  });
  miniWindow.on('closed', () => {
    miniWindow = null;
    updateTray();
    sendMain('mini:state', false);
  });
  updateTray();
  sendMain('mini:state', true);
}

function closeMini() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
}

function toggleMini() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    closeMini();
  } else {
    openMini();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  }
}

// ---------- Arayüzle iletişim ----------

function registerIpc() {
  radio.register();

  // Çalar durumu (ana pencereden) ve komutlar (tepsi / mini oynatıcıdan).
  ipcMain.on('player:state', (_e, st) => {
    if (!st || typeof st !== 'object') return;
    player = {
      station: st.station && typeof st.station.name === 'string'
        ? { id: String(st.station.id || ''), name: st.station.name.slice(0, 120), favicon: String(st.station.favicon || '').slice(0, 1000), initials: String(st.station.initials || '').slice(0, 3), tint: String(st.station.tint || '').slice(0, 9) }
        : null,
      playing: !!st.playing,
      buffering: !!st.buffering,
      title: typeof st.title === 'string' ? st.title.slice(0, 200) : '',
      volume: Number(st.volume) || 0,
    };
    updateTray();
    sendMini('player:state', player);
  });
  ipcMain.on('player:cmd', (_e, cmd) => {
    if (!cmd || !['toggle', 'next', 'prev'].includes(cmd.type)) return;
    sendMain('player:cmd', { type: cmd.type });
  });
  ipcMain.on('mini:toggle', () => toggleMini());
  ipcMain.on('mini:close', () => closeMini());
  ipcMain.on('mini:expand', () => {
    closeMini();
    showMain();
  });

  // Şu an çalan şarkı.
  ipcMain.on('meta:watch', (_e, url) => nowPlaying.watch(url, (m) => sendMain('meta:title', m)));
  ipcMain.on('meta:unwatch', () => nowPlaying.unwatch());

  // Kayıt.
  recorder.onEvent((ev) => {
    sendMain('rec:event', ev);
    if (ev.type !== 'progress') updateTray();
    if (ev.type !== 'progress' && ev.scheduled) {
      if (ev.type === 'failed') notify('Zamanlanmış kayıt yapılamadı', ev.message || '');
      else notify('Zamanlanmış kayıt tamamlandı', ev.name);
    }
  });
  ipcMain.handle('rec:start', async (_e, station) => {
    const r = await recorder.start(station);
    updateTray();
    return r;
  });
  ipcMain.handle('rec:stop', () => recorder.stop());
  ipcMain.handle('rec:status', () => recorder.status());
  ipcMain.handle('rec:list', () => recorder.list());
  ipcMain.handle('rec:open', (_e, f) => recorder.open(f));
  ipcMain.handle('rec:reveal', (_e, f) => recorder.reveal(f));
  ipcMain.handle('rec:openDir', () => recorder.openDir());
  ipcMain.handle('rec:trash', (_e, f) => recorder.trash(f));

  // Zamanlamalar (kayıt ve alarm).
  const withNext = (items) => items.map((x) => ({ ...x, next: scheduler.nextRun(x) }));
  ipcMain.handle('sched:list', () => withNext(scheduler.list()));
  ipcMain.handle('sched:save', async (_e, item) => {
    await scheduler.upsert(item);
    return withNext(scheduler.list());
  });
  ipcMain.handle('sched:delete', async (_e, id) => {
    await scheduler.remove(String(id || ''));
    return withNext(scheduler.list());
  });
  ipcMain.handle('sched:enable', async (_e, id, on) => {
    await scheduler.setEnabled(String(id || ''), !!on);
    return withNext(scheduler.list());
  });

  // Ayarlar, eşitleme, yedek.
  ipcMain.handle('settings:get', () => ({ ...settings.get(), version: app.getVersion(), packaged: app.isPackaged }));
  ipcMain.handle('settings:set', async (_e, patch) => {
    const allowed = {};
    for (const k of ['closeToTray', 'openAtLogin']) if (patch && k in patch) allowed[k] = patch[k];
    await settings.set(allowed);
    return { ...settings.get(), version: app.getVersion(), packaged: app.isPackaged };
  });
  ipcMain.handle('sync:choose', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Eşitleme klasörünü seç (örneğin OneDrive içinde bir klasör)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    await settings.set({ syncDir: r.filePaths[0] });
    return settings.get().syncDir;
  });
  ipcMain.handle('sync:clear', async () => {
    await settings.set({ syncDir: '' });
    return true;
  });
  ipcMain.handle('sync:read', () => settings.readSync());
  ipcMain.handle('sync:write', (_e, payload) => (payload && typeof payload === 'object' ? settings.writeSync(payload) : false));
  settings.onSyncChange(() => sendMain('sync:changed'));

  ipcMain.handle('data:export', async (_e, payload) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Yedeği kaydet',
      defaultPath: path.join(app.getPath('documents'), 'radyo-yedek.json'),
      filters: [{ name: 'Radyo yedeği', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return false;
    await fs.writeFile(r.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle('data:import', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Yedeği aç', properties: ['openFile'], filters: [{ name: 'Radyo yedeği', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const text = await fs.readFile(r.filePaths[0], 'utf8');
    if (text.length > 20 * 1024 * 1024) throw new Error('Dosya çok büyük.');
    return JSON.parse(text);
  });

  // Destek sayfası: bağlantıları varsayılan tarayıcıda / e-posta programında aç.
  ipcMain.handle('open:external', async (_e, url) => {
    if (typeof url !== 'string' || url.length > 4000 || !/^(https:\/\/|mailto:)/i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('app:about', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    os: `${require('node:os').type()} ${require('node:os').release()}`,
    arch: process.arch,
  }));

  // Uygulama içi güncelleme.
  updater.onEvent((ev) => sendMain('upd:event', ev));
  ipcMain.handle('upd:check', () => updater.check());
  ipcMain.handle('upd:download', () => updater.download());
  ipcMain.handle('upd:install', async () => {
    const go = () => { quitting = true; nowPlaying.unwatch(); };
    if (recorder.isActive()) await recorder.stopAndWait();
    return updater.installAndRestart(go);
  });
}

// ---------- Zamanlanmış işler ----------

async function onScheduledRecord(item) {
  if (recorder.isActive()) {
    notify('Zamanlanmış kayıt başlatılamadı', `${item.station.name}: başka bir kayıt sürüyor.`);
    return;
  }
  try {
    await recorder.start(item.station, { maxMs: item.durationMin * 60000, scheduled: true });
    notify('Zamanlanmış kayıt başladı', `${item.station.name} — ${item.durationMin} dakika`);
    sendMain('rec:event', { type: 'started', scheduled: true, station: { id: item.station.id, name: item.station.name } });
    updateTray();
  } catch (err) {
    notify('Zamanlanmış kayıt başlatılamadı', `${item.station.name}: ${err.message}`);
  }
}

function onAlarm(item) {
  showMain();
  sendMain('player:cmd', { type: 'alarm', station: item.station });
  notify('Günaydın! Alarm çalıyor', item.station.name);
}

// ---------- Uygulama ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.radyo.app');
    settings.loadSync();
    registerIpc();
    createWindow();
    createTray();
    await scheduler.init({
      record: onScheduledRecord,
      alarm: onAlarm,
      changed: (items) => sendMain('sched:changed', items.map((x) => ({ ...x, next: scheduler.nextRun(x) }))),
    });
    // Açılıştan biraz sonra ve 6 saatte bir güncellemeleri sessizce denetle; varsa arka planda indir.
    updater.cleanup();
    const autoCheck = async () => {
      const r = await updater.check().catch(() => null);
      if (r) sendMain('upd:event', { type: 'checked', ...r });
      if (r && r.status === 'available') updater.download().catch(() => {});
    };
    setTimeout(autoCheck, 12000);
    setInterval(autoCheck, 6 * 3600e3);
  });

  // Uygulama kapanırken süren kaydı düzgünce bitir.
  app.on('before-quit', (e) => {
    quitting = true;
    nowPlaying.unwatch();
    updater.installOnQuit();
    if (!recorder.isActive()) return;
    e.preventDefault();
    recorder.stopAndWait().finally(() => app.exit(0));
  });

  app.on('window-all-closed', () => {
    if (quitting || !settings.get().closeToTray) app.quit();
  });
}
