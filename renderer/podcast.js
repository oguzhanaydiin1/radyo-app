'use strict';

/*
 * Podcast sekmesi: arama (iTunes), Türkçe ve İngilizce önerilen programlar, RSS adresiyle
 * ekleme, takip edilenler ve yeni bölüm işareti, bölüm listesi, kaldığın yerden devam.
 * Bölümler media.js'deki ortak oynatıcıyla (window.OAMedia) çalar.
 * Arama ve besleme window.podcasts köprüsünden gelir: masaüstünde ana süreç
 * (src/podcast.js), web ve Android'de media-web.js (api.oalabs.dev üzerinden).
 */

const PODAPI = window.podcasts || null;

const PI = {
  rss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
};

/** Besleme adresinden kısa ve sabit bir kimlik. */
function podId(feed) {
  let h = 2166136261;
  for (const ch of String(feed || '').trim().toLowerCase()) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return `p${h.toString(36)}`;
}

const PD = {
  view: 'home',
  lang: ['all', 'tr', 'en'].includes(store.get('podLang', 'all')) ? store.get('podLang', 'all') : 'all',
  query: '',
  results: null,
  searching: false,
  searchError: null,
  curated: { tr: [], en: [] },
  curatedLoading: false,
  curatedError: null,
  show: null,      // { pod, episodes, loading, error, shown, about }
  follows: asArray(store.get('podFollows', [])).filter((p) => p && p.feed && p.name),
  progress: (() => { const v = store.get('podProgress', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; })(),
  refreshing: false,
};
const podRegistry = new Map();
function remember(list) {
  for (const p of list) if (p && p.feed) { p.pid = p.pid || podId(p.feed); podRegistry.set(p.pid, p); }
  return list;
}
remember(PD.follows);

const isFollowed = (pid) => PD.follows.some((f) => f.pid === pid);
function saveFollows() { store.set('podFollows', PD.follows); }
function saveProgress() { store.set('podProgress', PD.progress); }

// ---------- Besleme ayrıştırma ----------

const ITUNES_NS = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
function child(el, names) {
  for (const n of names) {
    const [prefix, local] = n.includes(':') ? n.split(':') : [null, n];
    let found = null;
    if (prefix === 'itunes') found = [...el.children].find((c) => c.localName === local && c.namespaceURI === ITUNES_NS);
    else if (prefix) found = [...el.children].find((c) => c.nodeName === n || (c.localName === local && c.prefix === prefix));
    else found = [...el.children].find((c) => c.localName === local && (!c.namespaceURI || c.namespaceURI === el.namespaceURI || c.prefix === null));
    if (found) return found;
  }
  return null;
}
const textOf = (el) => (el ? (el.textContent || '').trim() : '');
function htmlToText(html) {
  const s = String(html || '');
  if (!/[<&]/.test(s)) return s.trim();
  const doc = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n'), 'text/html');
  for (const el of doc.querySelectorAll('script, style, noscript, template, iframe, object')) el.remove();
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
function parseDuration(v) {
  const s = String(v || '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
const httpUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

function parseFeed(text, feedUrl) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Besleme okunamadı (geçersiz XML).');
  const channel = doc.querySelector('rss > channel') || doc.getElementsByTagName('channel')[0];
  if (!channel) throw new Error('Bu adres bir podcast beslemesi değil.');
  const img = child(channel, ['itunes:image']);
  const imgUrl = (img && img.getAttribute('href')) || textOf(child(channel, ['image']) && child(child(channel, ['image']), ['url']));
  const pod = {
    feed: feedUrl,
    pid: podId(feedUrl),
    name: textOf(child(channel, ['title'])).slice(0, 200) || 'Adsız podcast',
    author: textOf(child(channel, ['itunes:author'])).slice(0, 200) || textOf(child(channel, ['managingEditor'])).slice(0, 120),
    about: htmlToText(textOf(child(channel, ['itunes:summary'])) || textOf(child(channel, ['description']))).slice(0, 4000),
    art: httpUrl(imgUrl),
    link: httpUrl(textOf(child(channel, ['link']))),
  };
  const episodes = [];
  for (const item of [...channel.getElementsByTagName('item')].slice(0, 600)) {
    const enc = child(item, ['enclosure']);
    const url = httpUrl(enc && enc.getAttribute('url'));
    if (!url) continue;
    const type = (enc.getAttribute('type') || '').toLowerCase();
    if (type && !/^(audio|video)\//.test(type) && !/\.(mp3|m4a|aac|ogg|opus|mp4)(\?|$)/i.test(url)) continue;
    const date = Date.parse(textOf(child(item, ['pubDate']))) || 0;
    const eimg = child(item, ['itunes:image']);
    const desc = textOf(child(item, ['content:encoded'])) || textOf(child(item, ['description'])) || textOf(child(item, ['itunes:summary']));
    const guid = textOf(child(item, ['guid'])) || url;
    episodes.push({
      guid,
      key: `${pod.pid}:${guid}`.slice(0, 300),
      title: textOf(child(item, ['title'])).slice(0, 300) || 'Adsız bölüm',
      date,
      url,
      duration: parseDuration(textOf(child(item, ['itunes:duration']))),
      notes: htmlToText(desc).slice(0, 6000),
      art: httpUrl(eimg && eimg.getAttribute('href')) || pod.art,
      link: httpUrl(textOf(child(item, ['link']))),
    });
  }
  episodes.sort((a, b) => b.date - a.date);
  return { pod, episodes };
}

// ---------- Veri ----------

async function runSearch(q) {
  if (!PODAPI) return;
  PD.query = q;
  PD.view = 'search';
  PD.searching = true;
  PD.searchError = null;
  PD.results = null;
  renderPod();
  try {
    const countries = PD.lang === 'tr' ? ['TR'] : PD.lang === 'en' ? ['US'] : ['TR', 'US'];
    const settled = await Promise.allSettled(countries.map((c) => PODAPI.search({ term: q, country: c, limit: 30 })));
    // Hepsi başarısızsa "sonuç yok" değil, hatayı göster.
    if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
    const lists = settled.map((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []));
    const seen = new Set();
    const merged = [];
    // Türkçe ve İngilizce sonuçları sırayla karıştır.
    for (let i = 0; i < 30; i++) {
      for (const l of lists) {
        const p = l[i];
        if (p && !seen.has(p.feed)) { seen.add(p.feed); merged.push(p); }
      }
    }
    if (PD.query !== q) return;
    PD.results = remember(merged);
  } catch (err) {
    if (PD.query !== q) return;
    PD.searchError = cleanError(err);
  }
  PD.searching = false;
  renderPod();
}

const foldName = (s) => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

async function loadCurated(force = false) {
  if (!PODAPI || PD.curatedLoading) return;
  const cache = store.get('podCuratedCache', null);
  if (!force && cache && Date.now() - cache.at < 3 * 24 * 3600e3 && (cache.tr || cache.en)) {
    PD.curated = { tr: remember(asArray(cache.tr)), en: remember(asArray(cache.en)) };
    return;
  }
  PD.curatedLoading = true;
  PD.curatedError = null;
  try {
    const list = await PODAPI.curated();
    const resolve = async (entries, country) => {
      const out = [];
      let next = 0;
      const worker = async () => {
        while (next < entries.length) {
          const i = next++;
          const e = entries[i];
          try {
            const res = await PODAPI.search({ term: e.term, country, limit: 5 });
            const want = foldName(e.term);
            const hit = res.find((r) => foldName(r.name).includes(want) || want.includes(foldName(r.name))) || null;
            if (hit) out[i] = { ...hit, cat: e.cat };
          } catch { /* bu kayıt atlanır */ }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      return out.filter(Boolean);
    };
    const [tr, en] = await Promise.all([resolve(asArray(list && list.tr), 'TR'), resolve(asArray(list && list.en), 'US')]);
    PD.curated = { tr: remember(tr), en: remember(en) };
    if (tr.length || en.length) store.set('podCuratedCache', { at: Date.now(), tr, en });
    else PD.curatedError = 'Önerilen podcastler yüklenemedi.';
  } catch (err) {
    PD.curatedError = cleanError(err);
  }
  PD.curatedLoading = false;
  if (state.section === 'podcast' && PD.view === 'home') renderPod();
}

async function openShow(pod, opts = {}) {
  if (!PODAPI || !pod) return;
  PD.view = 'show';
  PD.show = { pod, episodes: [], loading: true, error: null, shown: 50, about: false };
  renderPod();
  $('#content').scrollTop = 0;
  try {
    const r = await PODAPI.feed(pod.feed, { force: !!opts.force });
    const parsed = parseFeed(r.text, pod.feed);
    if (!PD.show || PD.show.pod !== pod) return;
    // Arama sonucundaki ad ve kapak daha güvenilir olabilir; boş olanları beslemeden doldur.
    const merged = { ...parsed.pod, ...Object.fromEntries(Object.entries(pod).filter(([, v]) => v)), about: parsed.pod.about, link: parsed.pod.link };
    PD.show.pod = merged;
    podRegistry.set(merged.pid, merged);
    PD.show.episodes = parsed.episodes;
    const f = PD.follows.find((x) => x.pid === merged.pid);
    if (f) {
      f.latest = parsed.episodes[0] ? parsed.episodes[0].date : 0;
      f.seenAt = Date.now();
      if (!f.art && merged.art) f.art = merged.art;
      saveFollows();
    }
  } catch (err) {
    if (!PD.show || PD.show.pod !== pod) return;
    PD.show.error = cleanError(err);
  }
  if (PD.show) PD.show.loading = false;
  renderPod();
}

function toggleFollow(pid) {
  const p = podRegistry.get(pid) || (PD.show && PD.show.pod.pid === pid ? PD.show.pod : null);
  if (!p) return;
  if (isFollowed(pid)) {
    PD.follows = PD.follows.filter((f) => f.pid !== pid);
    toast(`${p.name} takipten çıkarıldı.`, { ms: 2500 });
  } else {
    PD.follows.unshift({ pid, name: p.name, author: p.author || '', feed: p.feed, art: p.art || '', genre: p.genre || '', followedAt: Date.now(), seenAt: Date.now(), latest: 0 });
    toast(`${p.name} takip ediliyor.`, { ms: 2500 });
  }
  saveFollows();
  remember(PD.follows);
  renderPod();
}

/** Takip edilenlerin yeni bölümü var mı? (6 saatte bir, arka planda) */
async function refreshFollows() {
  if (!PODAPI || PD.refreshing || !PD.follows.length) return;
  const last = Number(store.get('podCheckedAt', 0)) || 0;
  if (Date.now() - last < 6 * 3600e3) return;
  PD.refreshing = true;
  store.set('podCheckedAt', Date.now());
  const list = PD.follows.slice(0, 40);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const f = list[next++];
      try {
        const r = await PODAPI.feed(f.feed);
        const { episodes } = parseFeed(r.text, f.feed);
        f.latest = episodes[0] ? episodes[0].date : f.latest;
        f.latestTitle = episodes[0] ? episodes[0].title : f.latestTitle;
      } catch { /* bu besleme şimdilik açılmadı */ }
    }
  };
  await Promise.all([worker(), worker()]);
  saveFollows();
  PD.refreshing = false;
  if (state.section === 'podcast' && PD.view === 'home') renderPod();
}
const hasNew = (f) => f.latest && f.seenAt && f.latest > f.seenAt;

// ---------- Çalma ve ilerleme ----------

function episodeItem(ep, pod) {
  const pr = PD.progress[ep.key];
  return {
    kind: 'episode',
    id: ep.key,
    title: ep.title,
    artist: pod.name,
    album: '',
    url: ep.url,
    art: ep.art || pod.art || null,
    duration: ep.duration || (pr && pr.dur) || 0,
    resume: pr && !pr.done ? pr.pos : 0,
    meta: { date: ep.date, notes: ep.notes, link: ep.link, guid: ep.guid, pod: { pid: pod.pid, name: pod.name, feed: pod.feed, art: pod.art || '', author: pod.author || '' } },
  };
}

function playEpisode(ep, pod) {
  const cur = window.OAMedia && window.OAMedia.item();
  if (cur && cur.id === ep.key) { togglePlay(); return; }
  const item = episodeItem(ep, pod);
  window.OAMedia.play(item, { queue: [item], index: 0 });
}

if (window.OAMedia) {
  window.OAMedia.on('time', (item, pos, dur, final) => {
    if (!item || item.kind !== 'episode') return;
    const prev = PD.progress[item.id] || {};
    const done = !!(dur && pos > dur - 30) || !!prev.done && pos < 5;
    PD.progress[item.id] = {
      pos: done ? 0 : Math.round(pos),
      dur: Math.round(dur || prev.dur || 0),
      done: done || (!!prev.done && pos < 5),
      at: Date.now(),
      ep: { title: item.title, url: item.url, art: item.art || '', date: item.meta && item.meta.date, duration: Math.round(dur || item.duration || 0), notes: '' },
      pod: item.meta && item.meta.pod,
    };
    const keys = Object.keys(PD.progress);
    if (keys.length > 400) {
      keys.sort((a, b) => (PD.progress[a].at || 0) - (PD.progress[b].at || 0));
      for (const k of keys.slice(0, keys.length - 400)) delete PD.progress[k];
    }
    saveProgress();
    if (final && state.section === 'podcast') renderPodKeepScroll();
    else if (state.section === 'podcast') updateEpisodeBars();
  });
  window.OAMedia.on('ended', (item) => {
    if (!item || item.kind !== 'episode') return;
    const p = PD.progress[item.id] || {};
    PD.progress[item.id] = { ...p, pos: 0, done: true, at: Date.now() };
    saveProgress();
    if (state.section === 'podcast') renderPodKeepScroll();
  });
  window.OAMedia.on('change', () => { if (state.section === 'podcast') syncEpisodeRows(); });
  audio.addEventListener('playing', () => { if (state.section === 'podcast') syncEpisodeRows(); });
  audio.addEventListener('pause', () => { if (state.section === 'podcast') syncEpisodeRows(); });
}

function continueList() {
  return Object.entries(PD.progress)
    .filter(([, v]) => v && !v.done && v.pos > 30 && v.ep && v.ep.url && v.pod)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, 12)
    .map(([key, v]) => ({ key, ...v }));
}

// ---------- Çizim ----------

function artHTML(p, size, cls = '') {
  const label = esc(initials(p.name || '?'));
  const img = p.art ? `<img src="${esc(p.art)}" alt="" loading="lazy" width="${size}" height="${size}">` : '';
  return `<span class="pod-art ${cls}" style="width:${size}px;height:${size}px;background:${tintFor(p.pid || p.feed || p.name)}"><span>${label}</span>${img}</span>`;
}

function podCardHTML(p, opts = {}) {
  const f = PD.follows.find((x) => x.pid === p.pid);
  const followed = !!f;
  return `<div class="pod-card">
    <button type="button" class="pod-open" data-action="pod-open" data-pid="${esc(p.pid)}">
      ${artHTML(p, 148)}
      ${f && hasNew(f) ? '<span class="pod-new">Yeni bölüm</span>' : ''}
      <span class="pod-name" data-noi18n>${esc(p.name)}</span>
      <span class="pod-author" data-noi18n>${esc(p.author || (opts.cat ? p.cat : '') || '')}</span>
    </button>
    <button type="button" class="pod-follow${followed ? ' on' : ''}" data-action="pod-follow" data-pid="${esc(p.pid)}" aria-pressed="${followed}" aria-label="${followed ? 'Takipten çık' : 'Takip et'}" title="${followed ? 'Takipten çık' : 'Takip et'}">${followed ? PI.check : ICON.plus}</button>
  </div>`;
}

function gridHTML(list, opts) {
  return `<div class="pod-grid">${list.map((p) => podCardHTML(p, opts)).join('')}</div>`;
}

function continueHTML() {
  const list = continueList();
  if (!list.length) return '';
  return `<section class="pod-sec"><h2 class="pod-h">Devam et</h2><div class="pod-cont">${list.map((c) => {
    const pct = c.dur ? Math.min(100, (c.pos / c.dur) * 100) : 0;
    const left = c.dur ? Math.max(0, c.dur - c.pos) : 0;
    return `<button type="button" class="pod-cont-card" data-action="pod-continue" data-key="${esc(c.key)}">
      ${artHTML({ name: c.pod.name, pid: c.pod.pid, art: c.ep.art || c.pod.art }, 56)}
      <span class="pod-cont-text" data-noi18n><span class="pod-cont-t">${esc(c.ep.title)}</span><span class="pod-cont-s">${esc(c.pod.name)}</span></span>
      <span class="pod-cont-meta">${left ? `${mediaTime(left)} kaldı` : ''}</span>
      <span class="ep-bar"><i style="width:${pct}%"></i></span>
    </button>`;
  }).join('')}</div></section>`;
}


function curatedHTML() {
  const parts = [];
  const sec = (title, list) => (list.length ? `<section class="pod-sec"><h2 class="pod-h">${title}</h2>${gridHTML(list.slice(0, 14), { cat: true })}</section>` : '');
  if (PD.lang !== 'en') parts.push(sec('Önerilen Türkçe podcastler', PD.curated.tr));
  if (PD.lang !== 'tr') parts.push(sec('Önerilen İngilizce podcastler', PD.curated.en));
  const html = parts.join('');
  if (html) return html;
  if (PD.curatedLoading) return '<section class="pod-sec"><h2 class="pod-h">Önerilenler</h2><div class="loading"><span class="spinner" role="status" aria-label="Yükleniyor"></span></div></section>';
  if (PD.curatedError) return `<section class="pod-sec"><p class="side-empty">${esc(PD.curatedError)} <button class="btn-ghost" type="button" data-action="pod-curated-retry">Tekrar dene</button></p></section>`;
  return '';
}

function searchFormHTML() {
  return `<form class="pod-search" id="pod-search" role="search">
    <label class="search pod-q"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <span class="sr-only">Podcast ara</span><input id="pod-q" type="search" placeholder="Podcast ara (ör. tarih, bilim, haber)" autocomplete="off" spellcheck="false" value="${esc(PD.query)}"></label>
    <button class="pill" type="submit"><span>Ara</span></button>
  </form>
  <div class="chips pod-langs" role="tablist" aria-label="Dil">
    ${[['all', 'Tümü'], ['tr', 'Türkçe'], ['en', 'İngilizce']].map(([k, l]) => `<button type="button" role="tab" class="chip${PD.lang === k ? ' active' : ''}" aria-selected="${PD.lang === k}" data-action="pod-lang" data-lang="${k}">${l}</button>`).join('')}
  </div>`;
}

function homeHTML() {
  const follows = PD.follows.length
    ? `<section class="pod-sec"><h2 class="pod-h">Takip ettiklerin</h2>${gridHTML(PD.follows)}</section>`
    : '';
  return `${continueHTML()}${follows}${curatedHTML()}
    <p class="legal-note">Podcast bilgileri Apple Podcasts dizininden ve programların kendi RSS beslemelerinden gelir. Bölümler yayıncının sunucusundan çalınır; OA Radyo bölümleri indirmez ya da saklamaz. Hakları yayıncılarına aittir.</p>`;
}

function resultsHTML() {
  const head = `<div class="pod-sub-head"><button class="btn-ghost" type="button" data-action="pod-home">${PI.back}<span>Podcast</span></button><h2 class="pod-h" style="margin:0">“${esc(PD.query)}” için sonuçlar</h2></div>`;
  if (PD.searching) return `${head}<div class="loading"><span class="spinner" role="status" aria-label="Aranıyor"></span></div>`;
  if (PD.searchError) return head + emptyHTML(ICON.offline, 'Arama yapılamadı', PD.searchError, '<button class="pill" type="button" data-action="pod-search-retry">Tekrar dene</button>');
  if (!PD.results || !PD.results.length) {
    return head + emptyHTML(PI.mic.replace('<svg', '<svg width="40" height="40"'), 'Sonuç yok', 'Başka bir kelime dene ya da podcast’in RSS adresini “RSS ile ekle” ile gir.', '<button class="btn-ghost accent" type="button" data-action="pod-rss">RSS ile ekle</button>');
  }
  return head + gridHTML(PD.results);
}

function episodeRowHTML(ep, pod, i) {
  const pr = PD.progress[ep.key];
  const cur = window.OAMedia && window.OAMedia.item();
  const isCur = !!cur && cur.id === ep.key;
  const dur = ep.duration || (pr && pr.dur) || 0;
  const pct = pr && !pr.done && pr.pos && dur ? Math.min(100, (pr.pos / dur) * 100) : 0;
  const date = ep.date ? new Date(ep.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const status = pr && pr.done ? `<span class="ep-done">${PI.check}<span>Dinlendi</span></span>` : pct ? `<span class="ep-left">${mediaTime(Math.max(0, dur - pr.pos))} kaldı</span>` : '';
  return `<div class="ep-row${isCur ? ' current' : ''}${isCur && state.playing ? ' is-playing' : ''}${pr && pr.done ? ' done' : ''}" data-ep="${esc(ep.key)}">
    <button type="button" class="ep-play" data-action="pod-play" data-i="${i}" aria-label="${isCur && state.playing ? 'Duraklat' : 'Çal'}: ${esc(ep.title)}">${isCur && state.playing ? ICON.pause : ICON.play}</button>
    <div class="ep-text">
      <button type="button" class="ep-title" data-action="pod-play" data-i="${i}" data-noi18n>${esc(ep.title)}</button>
      <div class="ep-meta"><span>${esc(date)}</span>${dur ? `<span>${mediaTime(dur)}</span>` : ''}${status}</div>
      ${ep.notes ? `<p class="ep-notes" data-noi18n>${esc(ep.notes.slice(0, 260))}</p>` : ''}
      ${pct ? `<span class="ep-bar"><i style="width:${pct}%"></i></span>` : ''}
    </div>
    ${pr && (pr.done || pr.pos) ? `<button type="button" class="icon-btn tiny" data-action="pod-reset" data-i="${i}" aria-label="Dinlenmedi olarak işaretle" title="Dinlenmedi olarak işaretle">${MI.x}</button>`
    : `<button type="button" class="icon-btn tiny" data-action="pod-mark" data-i="${i}" aria-label="Dinlendi olarak işaretle" title="Dinlendi olarak işaretle">${PI.check}</button>`}
  </div>`;
}

function showHTML() {
  const sh = PD.show;
  const pod = sh.pod;
  const followed = isFollowed(pod.pid);
  const about = pod.about ? `<p class="pod-about${sh.about ? ' open' : ''}" data-noi18n>${esc(pod.about)}</p>${pod.about.length > 220 ? `<button class="btn-ghost link-btn" type="button" data-action="pod-about">${sh.about ? 'Daha az' : 'Devamını göster'}</button>` : ''}` : '';
  const head = `<div class="pod-sub-head"><button class="btn-ghost" type="button" data-action="pod-home">${PI.back}<span>Podcast</span></button></div>
  <div class="pod-show-head">
    ${artHTML(pod, 180, 'big')}
    <div class="pod-show-text">
      <span class="pod-kicker">Podcast</span>
      <h1 class="pod-show-name" data-noi18n>${esc(pod.name)}</h1>
      <p class="pod-show-author" data-noi18n>${esc(pod.author || '')}${sh.episodes.length ? ` · ${fmtCount(sh.episodes.length)} bölüm` : ''}</p>
      ${about}
      <div class="pod-show-acts">
        <button class="pill${followed ? ' ghosted' : ''}" type="button" data-action="pod-follow" data-pid="${esc(pod.pid)}" aria-pressed="${followed}">${followed ? PI.check : ICON.plus}<span>${followed ? 'Takip ediliyor' : 'Takip et'}</span></button>
        ${sh.episodes.length ? '<button class="btn-ghost" type="button" data-action="pod-latest">' + ICON.play + '<span>Son bölümü çal</span></button>' : ''}
        <button class="btn-ghost" type="button" data-action="pod-refresh">${ICON.refresh}<span>Yenile</span></button>
        ${pod.link && /^https:\/\//i.test(pod.link) ? `<button class="btn-ghost" type="button" data-action="open-link" data-url="${esc(pod.link)}">${ICON.globe}<span>Web sitesi</span></button>` : ''}
      </div>
    </div>
  </div>`;
  if (sh.loading) return `${head}<div class="loading"><span class="spinner" role="status" aria-label="Bölümler yükleniyor"></span></div>`;
  if (sh.error) return head + emptyHTML(ICON.offline, 'Bölümler yüklenemedi', sh.error, '<button class="pill" type="button" data-action="pod-refresh">Tekrar dene</button>');
  if (!sh.episodes.length) return `${head}<p class="side-empty">Bu beslemede dinlenebilir bölüm yok.</p>`;
  const rows = sh.episodes.slice(0, sh.shown).map((ep, i) => episodeRowHTML(ep, pod, i)).join('');
  const left = sh.episodes.length - sh.shown;
  return `${head}<h2 class="pod-h">Bölümler</h2><div class="ep-list">${rows}</div>${left > 0 ? `<div class="more"><button class="btn-ghost" type="button" data-action="pod-more">Daha fazla göster · ${fmtCount(left)} bölüm daha</button></div>` : ''}`;
}

function podcastHTML() {
  if (!PODAPI) return emptyHTML(PI.mic.replace('<svg', '<svg width="40" height="40"'), 'Podcast bu sürümde yok', 'Podcast dinleme bu ortamda desteklenmiyor.');
  if (PD.view === 'show' && PD.show) return showHTML();
  const top = `<div class="list-bar" style="margin:0 0 16px"><h1 class="page-title" style="margin:0;color:var(--text)">Podcast</h1><span class="spacer"></span>
    <button class="btn-ghost" type="button" data-action="pod-rss">${PI.rss}<span>RSS ile ekle</span></button></div>${searchFormHTML()}`;
  if (PD.view === 'search') return top + resultsHTML();
  return top + homeHTML();
}

function renderPod() {
  if (state.section === 'podcast') renderContent();
}
function renderPodKeepScroll() {
  const el = $('#content');
  const y = el.scrollTop;
  renderPod();
  el.scrollTop = y;
}

function syncEpisodeRows() {
  if (!PD.show) return;
  const cur = window.OAMedia && window.OAMedia.item();
  for (const row of document.querySelectorAll('.ep-row[data-ep]')) {
    const isCur = !!cur && cur.id === row.dataset.ep;
    row.classList.toggle('current', isCur);
    row.classList.toggle('is-playing', isCur && state.playing);
    const btn = row.querySelector('.ep-play');
    if (btn) btn.innerHTML = isCur && state.playing ? ICON.pause : ICON.play;
  }
}
function updateEpisodeBars() {
  const cur = window.OAMedia && window.OAMedia.item();
  if (!cur || !PD.show) return;
  const row = document.querySelector(`.ep-row[data-ep="${CSS.escape(cur.id)}"] .ep-bar i`);
  const pr = PD.progress[cur.id];
  if (row && pr && pr.dur) row.style.width = `${Math.min(100, (pr.pos / pr.dur) * 100)}%`;
}

chain('sectionHTML', (prev, section) => (section === 'podcast' ? podcastHTML() : prev(section)));
chain('enterSection', (prev, section) => {
  prev(section);
  if (section === 'podcast') {
    if (!PD.curated.tr.length && !PD.curated.en.length) loadCurated().then(() => { if (PD.view === 'home') renderPod(); });
    refreshFollows();
  }
  if (section === 'music' && typeof loadLibrary === 'function' && !LS.loaded) loadLibrary();
});

// ---------- RSS ile ekleme ----------

function rssDialog() {
  let d = $('#rss-dialog');
  if (d) return d;
  d = document.createElement('dialog');
  d.className = 'dialog';
  d.id = 'rss-dialog';
  d.setAttribute('aria-labelledby', 'rss-title');
  d.innerHTML = `<form method="dialog" id="rss-form" novalidate>
    <h2 id="rss-title">RSS ile podcast ekle</h2>
    <p class="dialog-note">Aramada çıkmayan bir podcast’i besleme adresiyle ekleyebilirsin. Adres genelde podcast’in web sitesinde “RSS” bağlantısında bulunur.</p>
    <label class="field"><span>RSS adresi</span><input name="url" type="url" required maxlength="2000" placeholder="https://…/feed.xml" autocomplete="off" spellcheck="false"></label>
    <p class="dialog-error" id="rss-error" role="alert"></p>
    <div class="dialog-actions">
      <button class="btn-ghost" type="button" data-action="rss-cancel">Vazgeç</button>
      <button class="pill" type="submit"><span>Ekle ve aç</span></button>
    </div></form>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => { if (e.target.closest('[data-action="rss-cancel"]')) d.close(); });
  d.querySelector('#rss-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = e.target.elements.url.value.trim();
    const err = $('#rss-error');
    const btn = e.target.querySelector('button[type="submit"]');
    if (!/^https?:\/\/\S+$/i.test(url)) { err.textContent = 'Adres https:// ya da http:// ile başlamalı.'; return; }
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await PODAPI.feed(url, { force: true });
      const { pod } = parseFeed(r.text, url);
      remember([pod]);
      if (!isFollowed(pod.pid)) {
        PD.follows.unshift({ pid: pod.pid, name: pod.name, author: pod.author, feed: url, art: pod.art, followedAt: Date.now(), seenAt: Date.now(), latest: 0, custom: true });
        saveFollows();
      }
      d.close();
      e.target.reset();
      toast(`${pod.name} eklendi ve takip ediliyor.`, { ms: 3000 });
      openShow(podRegistry.get(pod.pid) || pod);
    } catch (ex) {
      err.textContent = cleanError(ex);
    } finally {
      btn.disabled = false;
    }
  });
  return d;
}

// ---------- Olaylar ----------

// Kapak resmi açılmazsa baş harfler görünsün (satır içi onerror güvenlik kuralına takılır).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && img.closest('.pod-art, .cv, .np-label, #p-logo')) img.remove();
}, true);

document.addEventListener('submit', (e) => {
  if (e.target && e.target.id === 'pod-search') {
    e.preventDefault();
    const q = ($('#pod-q').value || '').trim();
    if (q) runSearch(q);
  }
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action^="pod-"]');
  if (!el) return;
  const a = el.dataset.action;
  const sh = PD.show;
  switch (a) {
    case 'pod-lang':
      PD.lang = el.dataset.lang;
      store.set('podLang', PD.lang);
      if (PD.view === 'search' && PD.query) runSearch(PD.query);
      else renderPod();
      break;
    case 'pod-home':
      PD.view = 'home';
      PD.show = null;
      renderPod();
      $('#content').scrollTop = 0;
      break;
    case 'pod-search-retry':
      if (PD.query) runSearch(PD.query);
      break;
    case 'pod-curated-retry':
      loadCurated(true).then(renderPod);
      break;
    case 'pod-open': {
      const p = podRegistry.get(el.dataset.pid);
      if (p) openShow(p);
      break;
    }
    case 'pod-follow':
      toggleFollow(el.dataset.pid);
      break;
    case 'pod-rss': {
      const d = rssDialog();
      $('#rss-error').textContent = '';
      d.showModal();
      d.querySelector('input[name="url"]').focus();
      break;
    }
    case 'pod-refresh':
      if (sh) openShow(sh.pod, { force: true });
      break;
    case 'pod-about':
      if (sh) { sh.about = !sh.about; renderPodKeepScroll(); }
      break;
    case 'pod-more':
      if (sh) { sh.shown += 50; renderPodKeepScroll(); }
      break;
    case 'pod-play': {
      const ep = sh && sh.episodes[Number(el.dataset.i)];
      if (ep) playEpisode(ep, sh.pod);
      break;
    }
    case 'pod-latest':
      if (sh && sh.episodes[0]) playEpisode(sh.episodes[0], sh.pod);
      break;
    case 'pod-mark':
    case 'pod-reset': {
      const ep = sh && sh.episodes[Number(el.dataset.i)];
      if (!ep) break;
      const prev = PD.progress[ep.key] || {};
      PD.progress[ep.key] = { ...prev, pos: 0, done: a === 'pod-mark', at: Date.now(), dur: prev.dur || ep.duration || 0, ep: prev.ep || { title: ep.title, url: ep.url, art: ep.art, date: ep.date, duration: ep.duration }, pod: prev.pod || { pid: sh.pod.pid, name: sh.pod.name, feed: sh.pod.feed, art: sh.pod.art || '' } };
      if (a === 'pod-reset') delete PD.progress[ep.key];
      saveProgress();
      renderPodKeepScroll();
      break;
    }
    case 'pod-continue': {
      const c = PD.progress[el.dataset.key];
      if (!c || !c.ep || !c.pod) break;
      const ep = { key: el.dataset.key, title: c.ep.title, url: c.ep.url, art: c.ep.art, date: c.ep.date, duration: c.dur || c.ep.duration, notes: '' };
      playEpisode(ep, { pid: c.pod.pid, name: c.pod.name, feed: c.pod.feed, art: c.pod.art, author: c.pod.author });
      break;
    }
  }
});
