'use strict';

/*
 * Zamanlanmış kayıtlar ve radyolu alarmlar. Ana süreçte çalışır; pencere
 * tepsiye küçültülmüş olsa da tetiklenir. Bilgisayar uykudaysa ya da uygulama
 * kapalıysa tetiklenmez.
 */

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const file = () => path.join(app.getPath('userData'), 'zamanlamalar.json');
let items = [];
let handlers = { record: () => {}, alarm: () => {}, changed: () => {} };
let timer = null;

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

async function load() {
  try {
    const j = JSON.parse(await fs.readFile(file(), 'utf8'));
    items = Array.isArray(j.items) ? j.items.map(sanitize).filter(Boolean) : [];
  } catch {
    items = [];
  }
}

async function save() {
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ v: 1, items }, null, 2), 'utf8');
  await fs.rename(tmp, file());
  handlers.changed(list());
}

function sanitize(x) {
  if (!x || typeof x !== 'object') return null;
  const type = x.type === 'alarm' ? 'alarm' : x.type === 'record' ? 'record' : null;
  const s = x.station || {};
  const url = clean(s.url, 2000);
  const time = clean(x.time, 5);
  if (!type || !/^https?:\/\//i.test(url) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const days = Array.isArray(x.days) ? [...new Set(x.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const date = clean(x.date, 10);
  if (!days.length && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: clean(x.id, 40) || crypto.randomUUID(),
    type,
    enabled: x.enabled !== false,
    station: {
      id: clean(s.id, 80), name: clean(s.name, 120) || 'Radyo', url,
      codec: clean(s.codec, 20), favicon: clean(s.favicon, 1000), homepage: clean(s.homepage, 1000),
      hls: !!s.hls, tags: Array.isArray(s.tags) ? s.tags.slice(0, 6).map((t) => clean(String(t), 40)) : [],
      country: clean(s.country, 2),
    },
    time,
    days,
    date: days.length ? '' : date,
    durationMin: type === 'record' ? Math.min(360, Math.max(1, Math.round(Number(x.durationMin) || 60))) : 0,
    lastFired: clean(x.lastFired, 20),
  };
}

function list() {
  return items.map((x) => ({ ...x, station: { ...x.station } }));
}

async function upsert(raw) {
  const item = sanitize(raw);
  if (!item) throw new Error('Zamanlama bilgileri eksik ya da hatalı.');
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    item.lastFired = items[i].lastFired;
    items[i] = item;
  } else {
    items.push(item);
  }
  await save();
  return item;
}

async function remove(id) {
  const before = items.length;
  items = items.filter((x) => x.id !== id);
  if (items.length !== before) await save();
  return items.length !== before;
}

async function setEnabled(id, enabled) {
  const it = items.find((x) => x.id === id);
  if (!it) return false;
  it.enabled = !!enabled;
  await save();
  return true;
}

async function tick() {
  const now = new Date();
  const day = now.getDay();
  const dk = dateKey(now);
  const tk = timeKey(now);
  const fireKey = `${dk}T${tk}`;
  let dirty = false;
  for (const it of items) {
    if (!it.enabled || it.time !== tk || it.lastFired === fireKey) continue;
    const matches = it.days.length ? it.days.includes(day) : it.date === dk;
    if (!matches) continue;
    it.lastFired = fireKey;
    if (!it.days.length) it.enabled = false; // bir kerelik olanlar tetiklenince kapanır
    dirty = true;
    try {
      if (it.type === 'record') await handlers.record(it);
      else await handlers.alarm(it);
    } catch { /* hata bildirimi işleyicide yapılır */ }
  }
  if (dirty) await save().catch(() => {});
}

/** Bir sonraki tetiklenme zamanı (arayüzde göstermek için). */
function nextRun(it, from = new Date()) {
  if (!it.enabled) return null;
  const [h, m] = it.time.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, m, 0, 0);
    if (d <= from) continue;
    if (it.days.length ? it.days.includes(d.getDay()) : dateKey(d) === it.date) return d.getTime();
  }
  return null;
}

async function init(h) {
  handlers = { ...handlers, ...h };
  await load();
  clearInterval(timer);
  timer = setInterval(() => { tick().catch(() => {}); }, 15000);
  tick().catch(() => {});
}

module.exports = { init, list, upsert, remove, setEnabled, nextRun };
