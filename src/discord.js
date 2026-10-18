'use strict';

/*
 * Discord'da "Radyo dinliyor" durumu (Rich Presence). Bilgisayarda Discord açıksa
 * yerel IPC kanalına (\\?\pipe\discord-ipc-N) bağlanır; ek paket gerekmez.
 * Uygulama kimliği package.json → discordClientId.
 */

const net = require('node:net');
const path = require('node:path');
const os = require('node:os');

const CLIENT_ID = String(require('../package.json').discordClientId || '');

let sock = null;
let ready = false;
let connecting = false;
let pending = null;   // bağlanınca gönderilecek durum
let retryTimer = null;
let enabled = false;

function pipePath(i) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || os.tmpdir();
  return path.join(dir, `discord-ipc-${i}`);
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

function cleanup() {
  ready = false;
  connecting = false;
  if (sock) { sock.removeAllListeners(); sock.destroy(); }
  sock = null;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (!enabled) return;
  retryTimer = setTimeout(connect, 30000); // Discord sonradan açılırsa
}

function tryPipe(i) {
  if (i > 9) { connecting = false; scheduleRetry(); return; }
  const s = net.createConnection(pipePath(i));
  s.once('error', () => { s.destroy(); tryPipe(i + 1); });
  s.once('connect', () => {
    s.removeAllListeners('error');
    sock = s;
    s.on('error', () => { cleanup(); scheduleRetry(); });
    s.on('close', () => { cleanup(); scheduleRetry(); });
    let buf = Buffer.alloc(0);
    s.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = null;
        try { msg = JSON.parse(buf.slice(8, 8 + len).toString('utf8')); } catch { /* bozuk */ }
        buf = buf.slice(8 + len);
        if (msg && msg.evt === 'READY') {
          ready = true;
          connecting = false;
          if (pending !== undefined) send(pending);
        }
      }
    });
    s.write(encode(0, { v: 1, client_id: CLIENT_ID }));
  });
}

function connect() {
  if (!enabled || !CLIENT_ID || sock || connecting) return;
  connecting = true;
  tryPipe(0);
}

function send(activity) {
  if (!sock || !ready) return;
  sock.write(encode(1, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity: activity || null },
    nonce: `${Date.now()}${Math.random()}`,
  }));
}

/** station: { name, title, logo, startedAt } ya da null (temizle). */
function setStation(st) {
  if (!enabled) return;
  if (!st) {
    pending = null;
    send(null);
    return;
  }
  const activity = {
    type: 2, // "Dinliyor"
    details: String(st.title || st.name).slice(0, 120),
    state: st.title ? String(st.name).slice(0, 120) : 'Canlı radyo',
    timestamps: { start: Number(st.startedAt) || Date.now() },
    assets: {
      large_image: /^https:\/\//i.test(st.logo || '') ? st.logo : 'radyo',
      large_text: String(st.name).slice(0, 120),
    },
    instance: false,
  };
  pending = activity;
  if (ready) send(activity);
  else connect();
}

function setEnabled(on) {
  enabled = !!on && !!CLIENT_ID;
  if (!enabled) {
    clearTimeout(retryTimer);
    if (sock && ready) send(null);
    cleanup();
  } else {
    connect();
  }
}

module.exports = { setStation, setEnabled, available: () => !!CLIENT_ID };
