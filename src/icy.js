'use strict';

/*
 * ICY (Shoutcast/Icecast) yayın bilgisi.
 * İstek "Icy-MetaData: 1" başlığıyla yapılırsa sunucu, her "icy-metaint" baytlık
 * sesin arkasına küçük bir bilgi bloğu ekler: StreamTitle='Sanatçı - Şarkı';
 */

function decodeMeta(buf) {
  let s;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Türk radyolarının çoğu eski sunucularda Windows-1254 kullanır.
    try {
      s = new TextDecoder('windows-1254').decode(buf);
    } catch {
      s = Buffer.from(buf).toString('latin1');
    }
  }
  const m = /StreamTitle='([\s\S]*?)';/.exec(s.replace(/\0+$/, ''));
  if (!m) return null;
  return cleanTitle(m[1]);
}

function cleanTitle(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  // Bazı radyolar boş ya da anlamsız bilgi gönderir.
  if (!s || /^(-|\s|unknown|null|undefined)+$/i.test(s)) return '';
  return s.slice(0, 200);
}

/** Ses ve bilgi bloklarını birbirinden ayırır. */
class IcyDemux {
  constructor(metaint, onAudio, onTitle) {
    this.metaint = metaint;
    this.onAudio = onAudio;
    this.onTitle = onTitle;
    this.state = 'audio';
    this.left = metaint;
    this.metaLeft = 0;
    this.meta = [];
  }

  push(buf) {
    let i = 0;
    while (i < buf.length) {
      if (this.state === 'audio') {
        const n = Math.min(this.left, buf.length - i);
        if (n > 0) this.onAudio(buf.subarray(i, i + n));
        i += n;
        this.left -= n;
        if (this.left === 0) this.state = 'len';
      } else if (this.state === 'len') {
        const len = buf[i++] * 16;
        if (len === 0) {
          this.state = 'audio';
          this.left = this.metaint;
        } else {
          this.state = 'meta';
          this.metaLeft = len;
          this.meta = [];
        }
      } else {
        const n = Math.min(this.metaLeft, buf.length - i);
        this.meta.push(buf.subarray(i, i + n));
        i += n;
        this.metaLeft -= n;
        if (this.metaLeft === 0) {
          const title = decodeMeta(Buffer.concat(this.meta));
          if (title !== null) this.onTitle(title);
          this.state = 'audio';
          this.left = this.metaint;
        }
      }
    }
  }
}

function metaintOf(res) {
  const v = parseInt(res.headers.get('icy-metaint') || '', 10);
  return Number.isFinite(v) && v > 0 && v < 1024 * 1024 ? v : 0;
}

module.exports = { IcyDemux, decodeMeta, cleanTitle, metaintOf };
