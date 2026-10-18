'use strict';

/*
 * app.js'e eklenen özellikler: tepsi / mini oynatıcı bağlantısı, şu an çalan şarkı,
 * radyolu alarm, zamanlanmış kayıt, ayarlar ve eşitleme, benzer istasyonlar, oy verme.
 * app.js'teki genel değişkenleri ve yardımcıları (state, store, $, esc, …) kullanır.
 */

const P = window.player;
const SCH = window.schedules;
const AS = window.appSettings;

const FX = {
  thumb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7"/></svg>',
  alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M5 3L2 6M19 3l3 3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
};

// ---------- Tepsi ve mini oynatıcıya çalar durumunu bildir ----------

let publishTimer = null;
function publishState() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    const s = state.current;
    P.sendState({
      station: s ? { id: s.id, name: s.name, favicon: tileFor(s) || logoSources(s)[0] || '', initials: initials(s.name), tint: tintFor(s.id) } : null,
      playing: state.playing,
      buffering: state.buffering,
      title: state.playing ? state.nowTitle || '' : '',
      volume: state.volume,
    });
  }, 60);
}
hooks.playerRendered = publishState;

P.onCmd((cmd) => {
  if (!cmd) return;
  if (cmd.type === 'toggle') togglePlay();
  else if (cmd.type === 'next') step(1);
  else if (cmd.type === 'prev') step(-1);
  else if (cmd.type === 'alarm') startAlarm(cmd.station);
});

$('#btn-mini').addEventListener('click', () => P.toggleMini());
P.onMini((open) => $('#btn-mini').classList.toggle('active', !!open));

// ---------- Şu an çalan şarkı ----------

hooks.stationChanged = (s) => {
  if (s.hls || /\.m3u8(\?|$)/i.test(s.url || '')) P.unwatchMeta();
  else P.watchMeta(s.url);
};
hooks.paused = () => {
  P.unwatchMeta();
  state.nowTitle = '';
};
P.onMeta((m) => {
  if (!m || !state.current || m.url !== state.current.url) return;
  const t = m.title || '';
  if (t === state.nowTitle) return;
  state.nowTitle = t;
  setMediaSession(state.current);
  renderHero();
  renderPlayer();
});

// ---------- Radyolu alarm ----------

let fadeTimer = null;
function startAlarm(station) {
  if (!station || !/^https?:\/\//i.test(station.url || '')) return;
  const s = registry.get(station.id) || { ...station, id: station.id || `alarm-${station.url}` };
  register([s]);
  clearInterval(fadeTimer);
  const target = state.volume > 0 ? state.volume : state.lastVolume || 70;
  setVolume(5);
  play(s);
  // 60 saniyede yavaşça yüksel.
  const t0 = Date.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / 60000);
    setVolume(5 + (target - 5) * k);
    if (k >= 1) clearInterval(fadeTimer);
  }, 1000);
  toast(`Alarm: ${s.name}`, { actionLabel: 'Durdur', onAction: () => { clearInterval(fadeTimer); setVolume(target); if (state.playing || state.buffering) togglePlay(); }, ms: 60000 });
}

// ---------- Zamanlanmış kayıtlar ve alarmlar ----------

let schedList = [];
const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function repeatText(it) {
  if (!it.days.length) {
    const d = new Date(`${it.date}T${it.time}`);
    return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })} ${it.time}`;
  }
  const days = [...it.days].sort();
  const key = days.join(',');
  let label;
  if (days.length === 7) label = 'Her gün';
  else if (key === '1,2,3,4,5') label = 'Hafta içi';
  else if (key === '0,6') label = 'Hafta sonu';
  else label = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]).join(', ');
  return `${label} ${it.time}`;
}

function nextText(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `bugün ${hm}`;
  if (d.toDateString() === tomorrow.toDateString()) return `yarın ${hm}`;
  return `${d.toLocaleDateString('tr-TR', { weekday: 'long' })} ${hm}`;
}

function schedRowHTML(it) {
  const s = it.station;
  const meta = [repeatText(it)];
  if (it.type === 'record') meta.push(`${it.durationMin} dk`);
  const next = it.enabled ? nextText(it.next) : '';
  return `<div class="rec-row sched-row${it.enabled ? '' : ' off'}">
    ${logoHTML({ ...s, id: s.id || s.url }, 44)}
    <div class="recent-text">
      <div class="card-name">${esc(s.name)}</div>
      <div class="card-sub">${esc(meta.join(' · '))}${next ? ` · <span class="next-run">Sıradaki: ${esc(next)}</span>` : it.enabled ? '' : ' · Kapalı'}</div>
    </div>
    <div class="rec-actions">
      <label class="switch-mini" title="${it.enabled ? 'Kapat' : 'Aç'}">
        <span class="sr-only">${esc(s.name)} ${it.type === 'alarm' ? 'alarmı' : 'zamanlaması'} açık</span>
        <input type="checkbox" class="switch" data-action="sched-toggle" data-id="${esc(it.id)}"${it.enabled ? ' checked' : ''}>
      </label>
      <button class="btn-ghost" type="button" data-action="sched-edit" data-id="${esc(it.id)}" aria-label="Düzenle" title="Düzenle">${FX.edit}</button>
      <button class="btn-ghost danger" type="button" data-action="sched-del" data-id="${esc(it.id)}" aria-label="Sil" title="Sil">${ICON.trash}</button>
    </div>
  </div>`;
}

const reminder = '<p class="legal-note">Zamanlamalar yalnızca Radyo açıkken (simge saatin yanındayken de olur) ve bilgisayar uykuda değilken çalışır. Ayarlar’dan “Windows açılınca başlat”ı açabilirsin.</p>';

hooks.recordingsExtra = () => {
  const items = schedList.filter((x) => x.type === 'record');
  return `<div class="list-bar" style="margin:36px 0 12px"><h2 class="section-title" style="margin:0">${FX.clock.replace('<svg', '<svg width="20" height="20"')}Zamanlanmış kayıtlar</h2><span class="spacer"></span>
    <button class="btn-ghost accent" type="button" data-action="sched-new" data-type="record">${ICON.plus}<span>Yeni zamanlama</span></button></div>
    ${items.length ? items.map(schedRowHTML).join('') : '<p class="dialog-note">Belirli bir saatte bir programı kaydetmek için zamanlama ekle; örneğin “Cumartesi 20:00, 60 dakika”.</p>'}
    ${items.length ? reminder : ''}`;
};

hooks.sectionHTML = (section) => {
  if (section !== 'alarms') return undefined;
  const items = schedList.filter((x) => x.type === 'alarm');
  let html = `<div class="list-bar" style="margin:0 0 20px"><h1 class="page-title" style="margin:0;color:var(--text)">Alarmlar</h1><span class="spacer"></span>
    <button class="btn-ghost accent" type="button" data-action="sched-new" data-type="alarm">${ICON.plus}<span>Yeni alarm</span></button></div>`;
  if (!items.length) {
    html += emptyHTML(FX.alarm.replace('<svg', '<svg width="40" height="40"'), 'Henüz alarm yok',
      'Seçtiğin saatte seçtiğin radyo açılsın; ses bir dakika içinde yavaşça yükselir.',
      `<button class="pill" type="button" data-action="sched-new" data-type="alarm">${ICON.plus}<span>Alarm kur</span></button>`);
  } else {
    html += items.map(schedRowHTML).join('');
  }
  return html + reminder;
};

hooks.enterSection = (section) => {
  if (section === 'recordings' || section === 'alarms') refreshSchedules();
};

function applySchedules(items) {
  schedList = asArray(items);
  const alarms = schedList.filter((x) => x.type === 'alarm' && x.enabled).length;
  $('#alarm-count').textContent = alarms ? String(alarms) : '';
  if (state.section === 'recordings' || state.section === 'alarms') renderContent();
}
async function refreshSchedules() {
  try {
    applySchedules(await SCH.list());
  } catch { /* yoksay */ }
}
SCH.onChange(applySchedules);
refreshSchedules();

// Zamanlanmış kayıt başlayınca kayıt düğmesini güncelle.
recApi.onEvent((ev) => {
  if (ev && ev.type === 'started') {
    Object.assign(recState, { active: true, station: ev.station, bytes: 0, ms: 0 });
    renderRecButton();
    if (state.section === 'recordings') renderContent();
  }
});

// Zamanlama penceresi
let schedEditing = null;
let schedCandidates = [];

function stationCandidates(extra) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    if (!s || !/^https?:\/\//i.test(s.url || '')) return;
    const k = s.id || s.url;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  add(extra);
  add(state.current);
  state.favorites.forEach(add);
  state.custom.forEach(add);
  state.recent.forEach((e) => add(e.station));
  return out;
}

function openSchedDialog(type, item) {
  schedEditing = item || null;
  const f = $('#sched-form');
  f.reset();
  $('#sched-error').textContent = '';
  const isRec = type === 'record';
  $('#sched-title').textContent = item ? (isRec ? 'Zamanlamayı düzenle' : 'Alarmı düzenle') : isRec ? 'Zamanlanmış kayıt' : 'Yeni alarm';
  $('#sched-note').textContent = isRec
    ? 'Seçtiğin saatte kayıt kendiliğinden başlar ve süre dolunca durur. Kayıtlar Müzik\\Radyo Kayıtları klasörüne kaydedilir.'
    : 'Seçtiğin saatte radyo açılır ve ses bir dakika içinde yavaşça yükselir.';
  $('#sched-duration-field').hidden = !isRec;
  f.dataset.type = type;

  schedCandidates = stationCandidates(item && item.station).filter((s) => !isRec || !(s.hls || /\.m3u8(\?|$)/i.test(s.url)));
  if (!schedCandidates.length) {
    toast(isRec ? 'Önce kaydedilebilecek bir istasyonu çal ya da favorilere ekle.' : 'Önce bir istasyonu çal ya da favorilere ekle.', { error: true });
    return;
  }
  f.elements.station.innerHTML = schedCandidates.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (item) {
    f.elements.time.value = item.time;
    f.elements.duration.value = item.durationMin || 60;
    f.elements.repeat.value = item.days.length ? 'days' : 'once';
    f.elements.date.value = item.date || today;
    for (const cb of f.querySelectorAll('input[name="day"]')) cb.checked = item.days.includes(Number(cb.value));
  } else {
    f.elements.time.value = isRec ? `${pad((now.getHours() + 1) % 24)}:00` : '07:30';
    f.elements.duration.value = 60;
    f.elements.repeat.value = isRec ? 'once' : 'days';
    f.elements.date.value = today;
    if (!isRec) for (const cb of f.querySelectorAll('input[name="day"]')) cb.checked = ['1', '2', '3', '4', '5'].includes(cb.value);
  }
  syncRepeatUI();
  $('#sched-dialog').showModal();
  f.elements.station.focus();
}

function syncRepeatUI() {
  const f = $('#sched-form');
  const days = f.elements.repeat.value === 'days';
  $('#sched-days').hidden = !days;
  $('#sched-date-field').hidden = days;
}
$('#sched-form').addEventListener('change', (e) => { if (e.target.name === 'repeat') syncRepeatUI(); });

$('#sched-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#sched-error');
  const type = f.dataset.type;
  const station = schedCandidates[Number(f.elements.station.value)];
  const time = f.elements.time.value;
  const once = f.elements.repeat.value === 'once';
  const days = [...f.querySelectorAll('input[name="day"]:checked')].map((cb) => Number(cb.value));
  const date = f.elements.date.value;
  const duration = Math.round(Number(f.elements.duration.value));
  if (!station) { err.textContent = 'Bir istasyon seç.'; return; }
  if (!/^\d{2}:\d{2}$/.test(time)) { err.textContent = 'Saati gir.'; return; }
  if (once && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = 'Tarihi seç.'; return; }
  if (once && new Date(`${date}T${time}`) <= new Date()) { err.textContent = 'Seçtiğin zaman geçmişte kaldı.'; return; }
  if (!once && !days.length) { err.textContent = 'En az bir gün seç.'; return; }
  if (type === 'record' && !(duration >= 1 && duration <= 360)) { err.textContent = 'Süre 1 ile 360 dakika arasında olmalı.'; return; }
  try {
    applySchedules(await SCH.save({
      id: schedEditing ? schedEditing.id : undefined,
      type, enabled: true, station, time,
      days: once ? [] : days, date: once ? date : '',
      durationMin: duration,
    }));
    $('#sched-dialog').close();
    toast(type === 'alarm' ? `Alarm kuruldu: ${station.name}, ${time}` : `Kayıt zamanlandı: ${station.name}, ${time}`, { ms: 4000 });
  } catch (ex) {
    err.textContent = cleanError(ex);
  }
});

// ---------- Ayarlar ----------

let settingsCache = null;
function renderSettings(s) {
  settingsCache = s;
  $('#set-tray').checked = !!s.closeToTray;
  $('#set-login').checked = !!s.openAtLogin;
  $('#sync-path').textContent = s.syncDir || 'Eşitleme kapalı';
  $('#sync-path').title = s.syncDir || '';
  $('#sync-clear').hidden = !s.syncDir;
  $('#update-status').textContent = `Sürüm ${s.version}`;
}

async function openSettings() {
  try {
    renderSettings(await AS.get());
  } catch { /* yoksay */ }
  updateSyncStatus();
  $('#settings-dialog').showModal();
}

$('#set-tray').addEventListener('change', async (e) => renderSettings(await AS.set({ closeToTray: e.target.checked })));
$('#set-login').addEventListener('change', async (e) => renderSettings(await AS.set({ openAtLogin: e.target.checked })));

// ---------- Bilgisayarlar arası eşitleme ----------

const SYNC_KEYS = new Set(['favorites', 'custom', 'recent']);
const rawSet = store.set.bind(store);
let deviceId = store.get('deviceId', null);
if (!deviceId) {
  deviceId = (crypto.randomUUID && crypto.randomUUID()) || `d${Date.now()}${Math.random().toString(36).slice(2)}`;
  rawSet('deviceId', deviceId);
}
let localUpdatedAt = Number(store.get('syncUpdatedAt', 0)) || 0;
let syncOn = false;
let applyingRemote = false;
let syncWriteTimer = null;
let lastSyncAt = 0;

store.set = (key, value) => {
  rawSet(key, value);
  if (SYNC_KEYS.has(key) && !applyingRemote) markLocalChange();
};

function markLocalChange() {
  localUpdatedAt = Date.now();
  rawSet('syncUpdatedAt', localUpdatedAt);
  if (!syncOn) return;
  clearTimeout(syncWriteTimer);
  syncWriteTimer = setTimeout(pushSync, 800);
}

const validStation = (s) => s && typeof s === 'object' && typeof s.id === 'string' && /^https?:\/\//i.test(s.url || '') && typeof s.name === 'string';

function syncPayload() {
  return { v: 1, app: 'radyo', updatedAt: localUpdatedAt, device: deviceId, favorites: state.favorites, custom: state.custom, recent: state.recent };
}

function unionById(a, b) {
  const map = new Map();
  for (const s of [...asArray(a), ...asArray(b)]) if (validStation(s) && !map.has(s.id)) map.set(s.id, s);
  return [...map.values()];
}
function mergeRecent(a, b) {
  const map = new Map();
  for (const e of [...asArray(a), ...asArray(b)]) {
    if (!e || !validStation(e.station)) continue;
    const prev = map.get(e.station.id);
    if (!prev || new Date(e.at) > new Date(prev.at)) map.set(e.station.id, e);
  }
  return [...map.values()].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 30);
}

/** merge=true: iki tarafı birleştir (ilk bağlanma, içe aktarma); false: uzaktaki daha yeniyse onu al. */
function applyRemote(r, merge) {
  applyingRemote = true;
  try {
    state.favorites = merge ? unionById(state.favorites, r.favorites) : asArray(r.favorites).filter(validStation);
    state.custom = merge ? unionById(state.custom, r.custom) : asArray(r.custom).filter(validStation);
    state.recent = mergeRecent(state.recent, r.recent);
    store.set('favorites', state.favorites);
    store.set('custom', state.custom);
    store.set('recent', state.recent);
    register(state.favorites);
    register(state.custom);
    register(state.recent.map((e) => e.station));
    hayCache.clear();
    if (!merge) {
      localUpdatedAt = Number(r.updatedAt) || Date.now();
      rawSet('syncUpdatedAt', localUpdatedAt);
    }
  } finally {
    applyingRemote = false;
  }
  renderSidebar();
  renderContent();
}

async function pushSync() {
  try {
    await AS.writeSync(syncPayload());
    lastSyncAt = Date.now();
  } catch { /* klasöre yazılamadı */ }
  updateSyncStatus();
}

async function pullSync() {
  if (!syncOn) return;
  const r = await AS.readSync().catch(() => null);
  if (!r || r.app !== 'radyo') return;
  lastSyncAt = Date.now();
  if (r.device !== deviceId && Number(r.updatedAt) > localUpdatedAt) {
    applyRemote(r, false);
    toast('Favoriler diğer bilgisayardan eşitlendi.', { ms: 3000 });
  }
  updateSyncStatus();
}

function updateSyncStatus() {
  const el = $('#sync-status');
  if (!el) return;
  el.textContent = syncOn
    ? lastSyncAt ? `Son eşitleme: ${new Date(lastSyncAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Eşitleme açık.'
    : '';
}

async function linkSyncFolder() {
  const dir = await AS.chooseSync().catch(() => null);
  if (!dir) return;
  syncOn = true;
  const r = await AS.readSync().catch(() => null);
  if (r && r.app === 'radyo') {
    applyRemote(r, true);
    toast('Eşitleme açıldı; iki taraftaki listeler birleştirildi.', { ms: 4000 });
  } else {
    toast('Eşitleme açıldı. Diğer bilgisayarda da aynı klasörü seç.', { ms: 5000 });
  }
  markLocalChange();
  renderSettings(await AS.get());
}

AS.onSyncChanged(() => { pullSync(); });
window.addEventListener('focus', () => { pullSync(); });
AS.get().then((s) => {
  settingsCache = s;
  syncOn = !!s.syncDir;
  if (syncOn) pullSync().then(() => { if (!lastSyncAt) pushSync(); });
}).catch(() => {});

// ---------- Benzer istasyonlar ----------

const GENERIC_TAGS = new Set(['turkey', 'turkiye', 'turkish', 'turkce', 'tr', 'radio', 'radyo', 'fm', 'am', 'music', 'muzik', 'live', 'canli', 'online', 'internet']);

function similarTo(s) {
  const tags = new Set((s.tags || []).map(norm).map((t) => t.trim()).filter((t) => t && !GENERIC_TAGS.has(t)));
  if (!tags.size) return [];
  const pool = new Map();
  for (const x of [...state.custom, ...state.all, ...state.dunya.stations]) if (x && x.id) pool.set(x.id, x);
  const base = norm(s.name);
  return [...pool.values()]
    .filter((x) => x.id !== s.id && norm(x.name) !== base)
    .map((x) => {
      let score = 0;
      for (const t of x.tags || []) if (tags.has(norm(t).trim())) score++;
      return [x, score];
    })
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || (b[0].clicks || 0) - (a[0].clicks || 0))
    .slice(0, 8)
    .map(([x]) => x);
}

hooks.afterHero = (s) => {
  const list = similarTo(s);
  if (!list.length) return '';
  return `<section class="similar" id="similar" aria-label="Benzer istasyonlar">
    <h2 class="similar-title">${esc(s.name)} gibi</h2>
    <div class="similar-row">${list.map((x) => `<button class="sim-item${isCurrent(x.id) ? ' current' : ''}" type="button" data-action="play" data-id="${esc(x.id)}" title="${esc(x.name)} — ${esc(subtitle(x))}">
      ${logoHTML(x, 36, 8)}<span class="sim-text"><span class="sim-name">${esc(x.name)}</span><span class="sim-sub">${esc(subtitle(x))}</span></span></button>`).join('')}</div>
  </section>`;
};

// ---------- Oy verme ----------

const voted = store.get('voted', {}) || {};
const votedRecently = (id) => voted[id] && Date.now() - voted[id] < 24 * 3600 * 1000;

hooks.infoExtra = (s) => {
  if (isCustom(s) || !s.id || String(s.id).startsWith('alarm-')) return '';
  const done = votedRecently(s.id);
  return `<div class="info-row vote-row"><span>Oylar</span><span>${fmtCount(s.votes || 0)}</span>
    <button class="btn-ghost vote-btn${done ? ' voted' : ''}" type="button" data-action="vote" data-id="${esc(s.id)}"${done ? ' disabled' : ''}
      title="${done ? 'Bu istasyona bugün oy verdin' : 'Radio Browser’da bu istasyona oy ver'}">${FX.thumb}<span>${done ? 'Oy verildi' : 'Beğendim'}</span></button></div>`;
};

async function vote(id) {
  const s = registry.get(id);
  if (!s) return;
  const r = await api.vote(id).catch(() => ({ ok: false, message: 'Oy verilemedi.' }));
  if (r.ok) {
    s.votes = (s.votes || 0) + 1;
    voted[id] = Date.now();
    rawSet('voted', voted);
    toast(`${s.name} için oyun Radio Browser’a iletildi.`, { ms: 3500 });
  } else {
    toast(r.message || 'Oy verilemedi.', { error: true });
  }
  renderHero();
}

// ---------- Tıklamalar ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case 'settings-open':
      openSettings();
      break;
    case 'sched-new':
      openSchedDialog(el.dataset.type === 'alarm' ? 'alarm' : 'record');
      break;
    case 'sched-edit': {
      const it = schedList.find((x) => x.id === id);
      if (it) openSchedDialog(it.type, it);
      break;
    }
    case 'sched-del':
      applySchedules(await SCH.remove(id));
      toast('Silindi.', { ms: 2500 });
      break;
    case 'sched-cancel':
      $('#sched-dialog').close();
      break;
    case 'sync-choose':
      linkSyncFolder();
      break;
    case 'sync-clear':
      await AS.clearSync();
      syncOn = false;
      renderSettings(await AS.get());
      updateSyncStatus();
      break;
    case 'data-export':
      if (await AS.exportData(syncPayload()).catch(() => false)) toast('Yedek kaydedildi.', { ms: 3000 });
      break;
    case 'data-import':
      try {
        const r = await AS.importData();
        if (r) {
          const before = state.favorites.length + state.custom.length;
          applyRemote(r, true);
          markLocalChange();
          const added = state.favorites.length + state.custom.length - before;
          toast(added > 0 ? `${added} istasyon içe aktarıldı.` : 'Yedekteki her şey zaten listende.', { ms: 4000 });
        }
      } catch {
        toast('Bu dosya okunamadı; Radyo yedeği olduğundan emin ol.', { error: true });
      }
      break;
    case 'updates-open':
      $('#settings-dialog').close();
      selectSection('updates');
      break;
    case 'vote':
      if (id) vote(id);
      break;
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset && e.target.dataset.action === 'sched-toggle') {
    applySchedules(await SCH.enable(e.target.dataset.id, e.target.checked));
  }
});

publishState();

// ---------- Açılış ekranı ----------

(function splashScreen() {
  const el = $('#splash');
  if (!el) return;
  const t0 = Date.now();
  const MIN_MS = 2600;
  const MAX_MS = 7000;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#splash-dev').textContent = APP_INFO.developer;
  AS.get().then((s) => { $('#splash-ver').textContent = `Sürüm ${s.version}`; }).catch(() => {});

  // Sayıları yumuşakça say.
  const shown = { tr: 0, world: 0 };
  function countTo(key, id, target) {
    if (!(target > 0)) return;
    const from = shown[key];
    shown[key] = target;
    if (reduce) {
      $(id).textContent = fmtCount(target);
      return;
    }
    const start = performance.now();
    const dur = 1200;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - k) ** 3;
      $(id).textContent = fmtCount(Math.round(from + (target - from) * eased));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Son bilinen sayılarla hemen başla, güncelleri gelince düzelt.
  countTo('tr', '#splash-tr', Number(store.get('lastTrCount', 0)));
  countTo('world', '#splash-world', Number(store.get('lastWorldCount', 0)));
  api.countries().then((list) => {
    const total = asArray(list).reduce((n, c) => n + (Number(c.count) || 0), 0);
    if (total > 0) {
      rawSet('lastWorldCount', total);
      countTo('world', '#splash-world', total);
    }
  }).catch(() => {});

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    el.classList.add('done', 'hide');
    setTimeout(() => el.remove(), 500);
  }

  const poll = setInterval(() => {
    if (closed || !document.getElementById('splash')) {
      clearInterval(poll);
      return;
    }
    const ready = state.all.length > 0 || !!state.loadError;
    if (state.all.length) {
      if (state.all.length !== shown.tr) {
        rawSet('lastTrCount', state.all.length);
        countTo('tr', '#splash-tr', state.all.length);
      }
      $('#splash-status').textContent = 'Hazır';
    } else if (state.loadError) {
      $('#splash-status').textContent = 'İnternete bağlanılamadı';
    }
    const elapsed = Date.now() - t0;
    if ((ready && elapsed >= MIN_MS) || elapsed >= MAX_MS) {
      clearInterval(poll);
      setTimeout(close, ready ? 500 : 0);
    }
  }, 120);

  // Tıklayınca ya da bir tuşa basınca geç.
  el.addEventListener('click', () => { if (Date.now() - t0 > 600) close(); });
  const onKey = () => {
    if (Date.now() - t0 <= 600) return;
    window.removeEventListener('keydown', onKey);
    close();
  };
  window.addEventListener('keydown', onKey);
}());

// ---------- Destek ve iletişim ----------

const SUP = {
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.4-4A8 8 0 1 1 8 18.6z"/></svg>',
  web: ICON.globe,
  insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>',
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>',
};
let aboutInfo = null;
AS.about().then((a) => { aboutInfo = a; if (state.section === 'support') renderContent(); }).catch(() => {});

function contactRows() {
  const rows = [];
  const I = APP_INFO;
  if (I.email) rows.push({ icon: SUP.mail, label: 'E-posta', value: I.email, url: `mailto:${I.email}` });
  if (I.phone) {
    const digits = I.phone.replace(/[^\d]/g, '');
    if (I.whatsapp && digits) rows.push({ icon: SUP.chat, label: 'WhatsApp', value: I.phone, url: `https://wa.me/${digits}` });
    else rows.push({ icon: SUP.phone, label: 'Telefon', value: I.phone, url: '' });
  }
  if (I.website) rows.push({ icon: SUP.web, label: 'Web sitesi', value: I.website.replace(/^https?:\/\//, ''), url: I.website.startsWith('http') ? I.website.replace(/^http:/, 'https:') : `https://${I.website}` });
  if (I.instagram) rows.push({ icon: SUP.insta, label: 'Instagram', value: `@${I.instagram.replace(/^@/, '')}`, url: `https://instagram.com/${I.instagram.replace(/^@/, '')}` });
  return rows;
}

function supportHTML() {
  const I = APP_INFO;
  const ini = I.developer.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');
  const rows = contactRows();
  const a = aboutInfo;
  return `<h1 class="page-title">Destek ve iletişim</h1>
  <div class="support-grid">
    <div class="card dev-card">
      <span class="dev-avatar" aria-hidden="true">${esc(ini)}</span>
      <div>
        <div class="dev-name">${esc(I.developer)}</div>
        <div class="dev-title">${esc(I.title || 'Radyo uygulamasının geliştiricisi')}</div>
      </div>
    </div>
    <div class="card contact-card">
      ${rows.length ? rows.map((r) => `<button class="contact-row" type="button" ${r.url ? `data-action="open-link" data-url="${esc(r.url)}"` : 'disabled'}>
        <span class="contact-ico">${r.icon}</span>
        <span class="contact-text"><span class="contact-label">${esc(r.label)}</span><span class="contact-value">${esc(r.value)}</span></span>
        ${r.url ? `<span class="contact-go">${SUP.go}</span>` : ''}</button>`).join('') : '<p class="dialog-note" style="padding:12px">İletişim bilgisi eklenmemiş.</p>'}
    </div>
  </div>
  ${I.email ? `<div class="card report-card" style="margin-top:16px">
    <h2>Sorun bildir ya da öneri gönder</h2>
    <label><span class="sr-only">Mesajın</span><textarea id="report-text" maxlength="2000" placeholder="Ne oldu, ya da ne eklenmesini istersin? (Örneğin: “X radyosu açılmıyor”)"></textarea></label>
    <div class="report-actions">
      <p class="dialog-note">E-posta programın açılır; mesaja sürüm ve sistem bilgisi eklenir, göndermeden önce görebilirsin.</p>
      <button class="pill" type="button" data-action="report-send">${SUP.mail}<span>E-postayı hazırla</span></button>
    </div>
  </div>` : ''}
  <div class="card about-card" style="margin-top:16px">
    <h2>Uygulama hakkında</h2>
    <div class="info-row"><span>Sürüm</span><span>${esc(a ? a.version : '')}</span></div>
    <div class="info-row"><span>Sistem</span><span>${esc(a ? `${a.os} (${a.arch})` : '')}</span></div>
    <div class="info-row"><span>Altyapı</span><span>${esc(a ? `Electron ${a.electron}` : '')}</span></div>
    <p class="dialog-note" style="margin-top:12px">İstasyon bilgileri, gönüllülerin oluşturduğu ücretsiz
      <a href="#" data-action="open-link" data-url="https://www.radio-browser.info">Radio Browser</a> veritabanından gelir.
      Yayınların hakları ilgili radyo kuruluşlarına aittir.</p>
    <p class="dialog-note">© ${I.copyrightYear} ${esc(I.developer)}</p>
  </div>`;
}

const prevSectionHTML = hooks.sectionHTML;
hooks.sectionHTML = (section) => (section === 'support' ? supportHTML() : prevSectionHTML(section));

function sendReport() {
  const text = ($('#report-text') && $('#report-text').value.trim()) || '';
  const a = aboutInfo || {};
  const cur = state.current ? `${state.current.name} (${state.current.url})` : '—';
  const body = `${text || '(Mesajını buraya yaz)'}\n\n---\nSürüm: ${a.version || ''}\nSistem: ${a.os || ''} ${a.arch || ''}\nÇalan istasyon: ${cur}`;
  const url = `mailto:${APP_INFO.email}?subject=${encodeURIComponent(`Radyo destek — sürüm ${a.version || ''}`)}&body=${encodeURIComponent(body)}`;
  AS.openExternal(url.slice(0, 3900));
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action="open-link"], [data-action="report-send"]');
  if (!el) return;
  e.preventDefault();
  if (el.dataset.action === 'report-send') sendReport();
  else AS.openExternal(el.dataset.url);
});

// ---------- Güncellemeler ----------

const UPD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg>';
const upd = { status: 'idle', current: '', version: '', notes: '', size: 0, received: 0, total: 0, message: '', checkedAt: 0 };
AS.get().then((s) => { upd.current = s.version; if (state.section === 'updates') renderContent(); }).catch(() => {});

function setUpd(patch) {
  Object.assign(upd, patch);
  const attention = upd.status === 'available' || upd.status === 'ready' || upd.status === 'full' || upd.status === 'downloading';
  $('#update-dot').textContent = attention ? '●' : '';
  if (state.section === 'updates') renderContent();
}

function fmtBytes(n) {
  if (!n) return '';
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

async function checkUpdates() {
  setUpd({ status: 'checking', message: '' });
  const r = await AS.checkUpdate().catch(() => ({ status: 'error', message: 'Güncelleme denetlenemedi.' }));
  setUpd({ ...r, current: r.current || upd.current, checkedAt: Date.now() });
  if (r.status === 'available') downloadUpdate();
}

async function downloadUpdate() {
  setUpd({ status: 'downloading', received: 0, total: upd.size || 0 });
  const r = await AS.downloadUpdate().catch(() => ({ status: 'error', message: 'Güncelleme indirilemedi.' }));
  if (r.status === 'error') setUpd({ status: 'error', message: r.message });
  else if (r.status === 'full') setUpd({ status: 'full' });
}

AS.onUpdate((ev) => {
  if (!ev) return;
  if (ev.type === 'checked') {
    setUpd({ ...ev, type: undefined, current: ev.current || upd.current, checkedAt: Date.now() });
    if (ev.status === 'available') setUpd({ status: 'downloading', received: 0, total: ev.size || 0 });
    if (ev.status === 'full') toast(`Radyo’nun yeni sürümü (${ev.version}) çıktı.`, { actionLabel: 'Ayrıntılar', onAction: () => selectSection('updates'), ms: 10000 });
  } else if (ev.type === 'progress') {
    upd.received = ev.received;
    upd.total = ev.total;
    const bar = $('#upd-bar');
    if (bar && ev.total) bar.style.width = `${Math.min(100, (ev.received / ev.total) * 100)}%`;
    const txt = $('#upd-progress-text');
    if (txt) txt.textContent = ev.total ? `${fmtBytes(ev.received)} / ${fmtBytes(ev.total)}` : fmtBytes(ev.received);
  } else if (ev.type === 'ready') {
    setUpd({ status: 'ready', version: ev.version, notes: ev.notes || upd.notes });
    toast(`Radyo ${ev.version} indirildi.`, { actionLabel: 'Yeniden başlat ve güncelle', onAction: () => AS.installUpdate(), ms: 20000 });
  } else if (ev.type === 'error') {
    setUpd({ status: 'error', message: ev.message, fullUrl: ev.fullUrl });
  }
});

function updatesHTML() {
  const u = upd;
  const checked = u.checkedAt ? `Son denetim: ${new Date(u.checkedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Radyo açıldıktan kısa süre sonra ve 6 saatte bir kendiliğinden denetler.';
  let body;
  switch (u.status) {
    case 'checking':
      body = `<div class="upd-state"><span class="spinner"></span><div><div class="upd-title">Denetleniyor…</div></div></div>`;
      break;
    case 'latest':
      body = `<div class="upd-state ok"><span class="upd-ok">✓</span><div><div class="upd-title">En güncel sürümü kullanıyorsun</div><div class="upd-sub">${esc(checked)}</div></div></div>`;
      break;
    case 'available':
    case 'downloading': {
      const pct = u.total ? Math.min(100, (u.received / u.total) * 100) : 5;
      body = `<div class="upd-state"><span class="spinner"></span><div class="upd-grow"><div class="upd-title">Radyo ${esc(u.version)} indiriliyor…</div>
        <div class="upd-bar-wrap"><span id="upd-bar" style="width:${pct}%"></span></div><div class="upd-sub" id="upd-progress-text">${esc(fmtBytes(u.received))}${u.total ? ` / ${esc(fmtBytes(u.total))}` : ''}</div></div></div>`;
      break;
    }
    case 'ready':
      body = `<div class="upd-state ok"><span class="upd-ok">↻</span><div class="upd-grow"><div class="upd-title">Radyo ${esc(u.version)} hazır</div><div class="upd-sub">Uygulama birkaç saniyeliğine kapanıp yeni sürümle yeniden açılacak.</div></div>
        <button class="pill" type="button" data-action="upd-install">${UPD_ICON}<span>Yeniden başlat ve güncelle</span></button></div>`;
      break;
    case 'full':
      body = `<div class="upd-state"><span class="upd-ok">!</span><div class="upd-grow"><div class="upd-title">Radyo ${esc(u.version)} çıktı</div><div class="upd-sub">Bu sürüm tam paket olarak indirilmeli; indirme sayfası tarayıcıda açılacak.</div></div>
        <button class="pill" type="button" data-action="upd-full">${UPD_ICON}<span>İndirme sayfasını aç</span></button></div>`;
      break;
    case 'error':
      body = `<div class="upd-state err"><span class="upd-ok">!</span><div class="upd-grow"><div class="upd-title">Güncelleme yapılamadı</div><div class="upd-sub">${esc(u.message || '')}</div></div>
        <button class="btn-ghost" type="button" data-action="upd-check">Tekrar dene</button></div>`;
      break;
    case 'dev':
      body = `<div class="upd-state"><span class="upd-ok">i</span><div><div class="upd-title">Geliştirme modundasın</div><div class="upd-sub">“npm start” ile çalışırken uygulama kendini güncellemez; güncellemeler hazır paket (Radyo.exe) için.</div></div></div>`;
      break;
    case 'unconfigured':
      body = `<div class="upd-state"><span class="upd-ok">i</span><div><div class="upd-title">Güncelleme kaynağı henüz ayarlanmadı</div><div class="upd-sub">Güncellemelerin yayınlanacağı GitHub deposu bağlandığında bu sayfa çalışacak.</div></div></div>`;
      break;
    default:
      body = `<div class="upd-state"><span class="upd-ok">${UPD_ICON}</span><div><div class="upd-title">Yeni sürüm var mı bakalım</div><div class="upd-sub">${esc(checked)}</div></div></div>`;
  }
  const canCheck = !['checking', 'downloading', 'available'].includes(u.status);
  const notes = u.notes && ['available', 'downloading', 'ready', 'full'].includes(u.status)
    ? `<div class="card upd-notes"><h2>Bu sürümde neler var?</h2><div class="upd-notes-text">${esc(u.notes)}</div></div>` : '';
  return `<div class="list-bar" style="margin:0 0 20px"><h1 class="page-title" style="margin:0;color:var(--text)">Güncellemeler</h1><span class="spacer"></span>
      <button class="btn-ghost accent" type="button" data-action="upd-check"${canCheck ? '' : ' disabled'}>${UPD_ICON}<span>Güncellemeleri denetle</span></button></div>
    <div class="card upd-card">
      <div class="upd-version"><span class="upd-label">Kullandığın sürüm</span><span class="upd-num">${esc(u.current || '')}</span></div>
      ${body}
    </div>
    ${notes}
    <p class="legal-note">Güncellemeler yalnızca uygulamanın kendi dosyasını indirir (1 MB’tan küçük); favorilerin, kayıtların ve ayarların olduğu gibi kalır.</p>`;
}

const prevSectionHTML2 = hooks.sectionHTML;
hooks.sectionHTML = (section) => (section === 'updates' ? updatesHTML() : prevSectionHTML2(section));
const prevEnter = hooks.enterSection;
hooks.enterSection = (section) => {
  prevEnter(section);
  if (section === 'updates' && (upd.status === 'idle' || (upd.status === 'latest' && Date.now() - upd.checkedAt > 10 * 60000))) checkUpdates();
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action^="upd-"]');
  if (!el) return;
  if (el.dataset.action === 'upd-check') checkUpdates();
  else if (el.dataset.action === 'upd-install') AS.installUpdate();
  else if (el.dataset.action === 'upd-full') AS.downloadUpdate();
});
