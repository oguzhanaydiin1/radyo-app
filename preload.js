'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

// İstasyon listesi, arama, dinlenme sayımı ve oy.
contextBridge.exposeInMainWorld('radio', {
  country: (opts) => ipcRenderer.invoke('radio:country', opts),
  languages: () => ipcRenderer.invoke('radio:languages'),
  countries: () => ipcRenderer.invoke('radio:countries'),
  stations: (opts) => ipcRenderer.invoke('radio:stations', opts),
  search: (opts) => ipcRenderer.invoke('radio:search', opts),
  click: (id) => ipcRenderer.invoke('radio:click', id),
  vote: (id) => ipcRenderer.invoke('radio:vote', id),
});

// Yayın kaydı.
contextBridge.exposeInMainWorld('recorder', {
  start: (station) => ipcRenderer.invoke('rec:start', station),
  stop: () => ipcRenderer.invoke('rec:stop'),
  status: () => ipcRenderer.invoke('rec:status'),
  list: () => ipcRenderer.invoke('rec:list'),
  open: (file) => ipcRenderer.invoke('rec:open', file),
  reveal: (file) => ipcRenderer.invoke('rec:reveal', file),
  openDir: () => ipcRenderer.invoke('rec:openDir'),
  trash: (file) => ipcRenderer.invoke('rec:trash', file),
  onEvent: on('rec:event'),
});

// Çalar: tepsi, mini oynatıcı, şu an çalan şarkı.
contextBridge.exposeInMainWorld('player', {
  sendState: (st) => ipcRenderer.send('player:state', st),
  cmd: (type) => ipcRenderer.send('player:cmd', { type }),
  onCmd: on('player:cmd'),
  onState: on('player:state'),
  toggleMini: () => ipcRenderer.send('mini:toggle'),
  closeMini: () => ipcRenderer.send('mini:close'),
  expand: () => ipcRenderer.send('mini:expand'),
  onMini: on('mini:state'),
  watchMeta: (url) => ipcRenderer.send('meta:watch', url),
  unwatchMeta: () => ipcRenderer.send('meta:unwatch'),
  onMeta: on('meta:title'),
});

// Zamanlanmış kayıtlar ve alarmlar.
contextBridge.exposeInMainWorld('schedules', {
  list: () => ipcRenderer.invoke('sched:list'),
  save: (item) => ipcRenderer.invoke('sched:save', item),
  remove: (id) => ipcRenderer.invoke('sched:delete', id),
  enable: (id, on2) => ipcRenderer.invoke('sched:enable', id, on2),
  onChange: on('sched:changed'),
});

// Ayarlar, eşitleme, yedek, güncelleme.
contextBridge.exposeInMainWorld('appSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
  chooseSync: () => ipcRenderer.invoke('sync:choose'),
  clearSync: () => ipcRenderer.invoke('sync:clear'),
  readSync: () => ipcRenderer.invoke('sync:read'),
  writeSync: (payload) => ipcRenderer.invoke('sync:write', payload),
  onSyncChanged: on('sync:changed'),
  exportData: (payload) => ipcRenderer.invoke('data:export', payload),
  importData: () => ipcRenderer.invoke('data:import'),
  checkUpdate: () => ipcRenderer.invoke('upd:check'),
  downloadUpdate: () => ipcRenderer.invoke('upd:download'),
  installUpdate: () => ipcRenderer.invoke('upd:install'),
  onUpdate: on('upd:event'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  about: () => ipcRenderer.invoke('app:about'),
});

// Tema, Discord durumu, radyo:// bağlantıları.
contextBridge.exposeInMainWorld('extras', {
  setTheme: (mode) => ipcRenderer.send('win:theme', mode),
  discordAvailable: () => ipcRenderer.invoke('discord:available'),
  discordEnable: (on) => ipcRenderer.send('discord:enable', on),
  discordSet: (st) => ipcRenderer.send('discord:set', st),
  pendingLink: () => ipcRenderer.invoke('deeplink:pending'),
  onLink: on('deeplink'),
  byUuid: (id) => ipcRenderer.invoke('radio:byuuid', id),
  keysStatus: () => ipcRenderer.invoke('keys:status'),
});
