#!/usr/bin/env python3
"""Yenilikler sayfalarını (TR/EN) yeniden yazar.

Pusula Browser'ın notları oa-tarayici deposundaki release-notes.md'den, tarihleri GitHub
sürümlerinden gelir; böylece her yeni sürüm sayfaya kendiliğinden düşer. Öbür uygulamaların
(ve release-notes.md'den önceki eski Pusula sürümlerinin) notları docs/yenilikler/notlar.json'da.

Kullanım:  python3 scripts/yenilikler.py            (GitHub'dan çeker)
           python3 scripts/yenilikler.py --ilk      (notlar.json'u sayfalardan bir kez çıkarır)
"""
import html, json, os, re, sys, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), '..', 'docs')
REPO = 'oguzhanaydiin1/oa-tarayici'
PAGES = {'tr': os.path.join(ROOT, 'yenilikler', 'index.html'), 'en': os.path.join(ROOT, 'en', 'yenilikler', 'index.html')}
DATA = os.path.join(ROOT, 'yenilikler', 'notlar.json')
START, END = '<!-- YENILIKLER:BASLA -->', '<!-- YENILIKLER:BITIR -->'
AYLAR = {'tr': ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
         'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']}
APPS = {
    'pusula': {'name': 'Pusula Browser', 'icon': '/tarayici/img/icon.png', 'href': {'tr': '/tarayici/', 'en': '/en/tarayici/'}},
    'radyo': {'name': 'OA Radyo', 'icon': '/radyo/img/icon.png', 'href': {'tr': '/radyo/', 'en': '/en/radyo/'}},
    'harrier': {'name': 'Harrier Cleaner', 'icon': '/harrier/img/icon.png', 'href': {'tr': '/harrier/', 'en': '/en/harrier/'}},
}
MAX_ITEMS = 6

def vkey(v): return tuple(int(x) for x in re.findall(r'\d+', v))

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'oalabs-yenilikler', 'Accept': 'application/vnd.github+json'})
    tok = os.environ.get('GITHUB_TOKEN')
    if tok and 'api.github.com' in url: req.add_header('Authorization', 'Bearer ' + tok)
    with urllib.request.urlopen(req, timeout=30) as r: return r.read().decode('utf-8')

def short(t):
    """Uzun maddenin ilk cümlesi (sayfada özet görünsün; ayrıntı GitHub'da)."""
    t = t.strip()
    if len(t) <= 190: return t
    m = re.search(r'^(.{40,190}?[.!?])(\s|$)', t)
    if m: return m.group(1)
    return t[:180].rsplit(' ', 1)[0] + '…'

def parse_notes(md):
    notes = {}
    for sec in re.split(r'^## ', md, flags=re.M)[1:]:
        lines = sec.split('\n'); ver = lines[0].strip()
        if not re.fullmatch(r'\d+\.\d+\.\d+', ver): continue
        blocks = [b for b in re.split(r'\n\s*\n', '\n'.join(lines[1:]).strip()) if b.strip()]
        items = lambda b: [re.sub(r'^[•\-*]\s*', '', l).strip() for l in b.split('\n') if l.strip().startswith(('•', '-', '*'))]
        tr = items(blocks[0]) if blocks else []
        en = items(blocks[1]) if len(blocks) > 1 else []
        notes[ver] = {'tr': tr, 'en': en}
    return notes

def pusula_entries():
    md = get(f'https://raw.githubusercontent.com/{REPO}/main/release-notes.md')
    notes = parse_notes(md)
    rels = json.loads(get(f'https://api.github.com/repos/{REPO}/releases?per_page=100'))
    dates = {r['tag_name'].lstrip('v'): (r['published_at'] or '')[:10] for r in rels if not r.get('draft')}
    urls = {r['tag_name'].lstrip('v'): r['html_url'] for r in rels}
    by_day = defaultdict(list)
    for v, n in notes.items():
        if v in dates and (n['tr'] or n['en']): by_day[dates[v]].append(v)
    out = []
    for day, vs in by_day.items():
        vs.sort(key=vkey)
        e = {'date': day, 'app': 'pusula', 'version': vs[-1], 'url': urls.get(vs[-1]), 'auto': True}
        for lang in ('tr', 'en'):
            items = [short(x) for v in reversed(vs) for x in notes[v][lang]]
            e[lang] = [html.escape(x, quote=False) for x in items]
        out.append(e)
    return out

def first_auto_version(entries):
    vs = [e['version'] for e in entries if e.get('auto')]
    return min(vs, key=vkey) if vs else None

def render(lang, entries):
    by_day = defaultdict(list)
    for e in entries: by_day[e['date']].append(e)
    lab = 'Sürüm' if lang == 'tr' else 'Version'
    more = (lambda n: f'… ve {n} değişiklik daha') if lang == 'tr' else (lambda n: f'… and {n} more changes')
    parts = []
    for day in sorted(by_day, reverse=True):
        y, m, d = (int(x) for x in day.split('-'))
        label = f'{d} {AYLAR[lang][m - 1]} {y}'
        arts = []
        for e in sorted(by_day[day], key=lambda e: (e['app'] != 'pusula', [-x for x in vkey(e['version'])])):
            a = APPS[e['app']]
            items = e.get(lang) or e.get('tr') or []
            if not items: continue
            shown = items[:MAX_ITEMS]
            lis = ''.join(f'<li>{x}</li>' for x in shown)
            if len(items) > MAX_ITEMS:
                rest = more(len(items) - MAX_ITEMS)
                lis += f'<li><a href="{e["url"]}">{rest}</a></li>' if e.get('url') else f'<li>{rest}</li>'
            arts.append(f'        <article class="rel"><img src="{a["icon"]}" alt="" width="44" height="44"><div><h2><a href="{a["href"][lang]}">{a["name"]}</a><span>{lab} {e["version"]}</span></h2><ul>{lis}</ul></div></article>')
        if arts:
            parts.append(f'      <h2 class="news-day"><time datetime="{day}">{label}</time></h2>\n      <div class="news-list">\n' + '\n'.join(arts) + '\n      </div>')
    return '\n'.join(parts)

def extract_initial():
    """Bir kez: sayfalardaki elle yazılmış girdileri notlar.json'a çıkarır."""
    data = {}
    for lang, p in PAGES.items():
        s = open(p).read()
        for m in re.finditer(r'<h2 class="news-day"><time datetime="([\d-]+)">[\s\S]*?</div>\n', s):
            day = m.group(1)
            for a in re.finditer(r'<article class="rel"><img src="/(\w+)/img/icon\.png"[^>]*><div><h2><a[^>]*>[^<]*</a><span>[^<]*?([\d.]+)</span></h2><ul>([\s\S]*?)</ul></div></article>', m.group(0)):
                app = {'tarayici': 'pusula', 'radyo': 'radyo', 'harrier': 'harrier'}[a.group(1)]
                key = f'{app}-{a.group(2)}'
                e = data.setdefault(key, {'date': day, 'app': app, 'version': a.group(2)})
                e[lang] = re.findall(r'<li>([\s\S]*?)</li>', a.group(3))
    return list(data.values())

def main():
    if '--ilk' in sys.argv:
        manual = extract_initial()
        json.dump(manual, open(DATA, 'w'), ensure_ascii=False, indent=1)
        print(len(manual), 'girdi yazıldı:', DATA)
        return
    manual = json.load(open(DATA))
    auto = pusula_entries()
    first = first_auto_version(auto)
    # Elle yazılmış Pusula girdileri yalnız otomatik notların başladığı sürümden öncesi için kullanılır
    manual = [e for e in manual if e['app'] != 'pusula' or (first and vkey(e['version']) < vkey(first))]
    entries = manual + auto
    changed = False
    for lang, p in PAGES.items():
        s = open(p).read()
        a, b = s.index(START) + len(START), s.index(END)
        new = '\n' + render(lang, entries) + '\n      '
        if s[a:b] != new:
            open(p, 'w').write(s[:a] + new + s[b:]); changed = True
    print('değişti' if changed else 'aynı')

if __name__ == '__main__':
    main()
