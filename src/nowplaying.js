'use strict';

/*
 * "Şu an çalan" bilgisi: çalan yayına ara ara kısa bir bağlantı açıp
 * ilk bilgi bloğunu okur ve kapatır (her seferinde yalnızca birkaç KB veri).
 */

const { net } = require('electron');
const { IcyDemux, metaintOf } = require('./icy');

const INTERVAL_MS = 15000;
let current = null;

function sleep(ms, w) {
  return new Promise((resolve) => {
    w.wake = resolve;
    setTimeout(resolve, ms);
  });
}

/** Tek seferlik okuma: undefined = yayın bu bilgiyi vermiyor, null = okunamadı. */
async function readOnce(w) {
  const controller = new AbortController();
  w.controller = controller;
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await net.fetch(w.url, {
      headers: { 'Icy-MetaData': '1', 'User-Agent': 'RadyoApp/0.3' },
      signal: controller.signal,
    });
    const metaint = metaintOf(res);
    if (!res.ok || !res.body || !metaint) {
      controller.abort();
      return undefined;
    }
    let title = null;
    let total = 0;
    const demux = new IcyDemux(metaint, () => {}, (t) => { title = t; });
    const reader = res.body.getReader();
    while (title === null && total < metaint * 3 + 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      demux.push(Buffer.from(value));
    }
    controller.abort();
    return title;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loop(w, send) {
  let failures = 0;
  while (!w.stopped) {
    const title = await readOnce(w);
    if (w.stopped) return;
    if (title === undefined) {
      send({ url: w.url, title: '', supported: false });
      return;
    }
    if (title === null) {
      if (++failures >= 3) {
        send({ url: w.url, title: '', supported: false });
        return;
      }
    } else {
      failures = 0;
      if (title !== w.last) {
        w.last = title;
        send({ url: w.url, title, supported: true });
      }
    }
    await sleep(INTERVAL_MS, w);
  }
}

function watch(url, send) {
  if (current && current.url === url && !current.stopped) return;
  unwatch();
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || /\.m3u8(\?|$)/i.test(url)) return;
  const w = { url, stopped: false, last: undefined };
  current = w;
  loop(w, send);
}

function unwatch() {
  if (!current) return;
  current.stopped = true;
  if (current.controller) current.controller.abort();
  if (current.wake) current.wake();
  current = null;
}

module.exports = { watch, unwatch };
