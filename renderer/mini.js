'use strict';

const P = window.player;
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const $ = (id) => document.getElementById(id);
let lastLogo = '';

function render(st) {
  const s = st && st.station;
  $('name').textContent = s ? s.name : 'OA Radyo';
  $('song').textContent = !s ? 'Bir istasyon seç' : st.buffering ? 'Bağlanıyor…' : st.title ? `♪ ${st.title}` : st.playing ? 'Canlı yayın' : 'Duraklatıldı';
  $('song').title = st && st.title ? st.title : '';
  const playing = !!(st && (st.playing || st.buffering));
  $('play').innerHTML = playing ? PAUSE : PLAY;
  $('play').setAttribute('aria-label', playing ? 'Duraklat' : 'Çal');
  $('play').title = playing ? 'Duraklat' : 'Çal';
  for (const id of ['play', 'prev', 'next']) $(id).disabled = !s;

  const logoKey = s ? `${s.id}|${s.favicon}` : '';
  if (logoKey !== lastLogo) {
    lastLogo = logoKey;
    const box = $('logo');
    box.innerHTML = '';
    const ini = document.createElement('span');
    ini.textContent = s ? s.initials || '?' : 'R';
    ini.style.background = (s && s.tint) || '#F2A541';
    box.appendChild(ini);
    if (s && /^(https?:\/\/|radyo-logo:\/\/|data:image\/)/i.test(s.favicon || '')) {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      img.onload = () => { if (img.naturalWidth < 24) img.remove(); };
      if (!s.favicon.startsWith('data:')) img.style.objectFit = 'contain', img.style.background = '#fff';
      img.src = s.favicon;
      box.appendChild(img);
    }
  }
}

P.onState(render);
$('play').addEventListener('click', () => P.cmd('toggle'));
$('prev').addEventListener('click', () => P.cmd('prev'));
$('next').addEventListener('click', () => P.cmd('next'));
$('close').addEventListener('click', () => P.closeMini());
$('expand').addEventListener('click', () => P.expand());
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'BUTTON') {
    e.preventDefault();
    P.cmd('toggle');
  }
  if (e.key === 'Escape') P.closeMini();
});
render(null);
