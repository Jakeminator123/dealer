# Ljuset på det ritade kortet ruta för ruta ur en inspelning (spela_in.ts): det sidan läste och lade på (json), och det som
# faktiskt syns (medianen av bildens ljushet i kortets inre, 0-255). Största steg mellan två rutor i följd, före och efter.
#   python -I ljus_serie.py <inspelningsmapp> <klipp (spårets mapp)> [--fran 33] [--till 60]
import os, sys, json
import numpy as np, cv2
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
rec, clip = sys.argv[1], sys.argv[2]; opt = lambda n, d: int(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else d
A, B = opt('--fran', 0), opt('--till', 999)
REF = {'BACK': 0.781 / 0.835, 'FRONT': 0.404 / 0.44}   # kortets reservfärg mot samma kort liggande (cardBase under 6 prov)
tracks = {'fore': json.load(open(os.path.join(REPO, 'assets', 'tracking', clip, 'card-track.json'), encoding='utf-8'))['frames'],
          'efter': json.load(open(os.path.join(REPO, 'assets', 'proofs', 'kort-fram-bak-20261120', 'spar', clip + '.json'), encoding='utf-8'))['frames']}
out = {}
for name in ('fore', 'efter'):
    rows = [json.loads(l.rstrip(',')) for l in open(os.path.join(rec, name + '.json'), encoding='utf-8').read().strip('[]\n').split('\n') if l.strip().startswith('{')]
    serie = []
    for r in rows:
        f, last = r['ruta'], r['last']
        if f < A or f > B: continue
        laid = None; plane = None
        if last:
            rd = last['read']
            if name == 'efter' and last.get('lit'): laid = last['lit']['shade']; plane = last['lit']['slope'] is not None
            else: laid = rd['shade'] if rd['shade'] is not None else (REF[last['side']] if rd.get('seen', 0) < 6 and rd['shade'] is None else None); plane = rd['slope'] is not None
        seen = None; q = tracks[name][f]['quad']; im = cv2.imread(os.path.join(rec, name, f'{f:03d}.png'))
        if q and im is not None and tracks[name][f]['side'] in ('BACK', 'FRONT'):
            s = im.shape[1] / 1764.0; p = np.array(q, dtype=np.float64) * s; c = p.mean(axis=0); inner = (c + (p - c) * 0.55).astype(np.int32)
            mask = np.zeros(im.shape[:2], np.uint8); cv2.fillConvexPoly(mask, inner, 255)
            lum = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)[mask > 0]; b, g, rr = [im[..., k][mask > 0].astype(np.int32) for k in range(3)]
            paper = lum[(rr - b) < 40]  # inte hud (hud är varm)
            if paper.size >= 30: seen = float(np.percentile(paper, 75 if tracks[name][f]['side'] == 'FRONT' else 50))
        serie.append((f, tracks[name][f]['side'], laid, plane, seen))
    out[name] = serie
def steps(serie, k):
    best = [];
    for a, b in zip(serie, serie[1:]):
        if a[k] is not None and b[k] is not None and a[1] == b[1] and b[0] - a[0] == 1: best.append((abs(b[k] - a[k]), b[0]))
    best.sort(reverse=True); return best
for name in ('fore', 'efter'):
    s = out[name]; lagt = steps(s, 2); sett = steps(s, 4); flips = sum(1 for a, b in zip(s, s[1:]) if a[3] is not None and b[3] is not None and a[1] == b[1] and a[3] != b[3])
    print(name, 'rutor', len(s), '| pålagt ljus, största steg:', [(round(d, 3), f) for d, f in lagt[:4]], '| planet slår av/på', flips, 'ggr',
          '| synligt (0-255), största steg:', [(round(d, 1), f) for d, f in sett[:5]], '| summa steg över 8:', round(sum(d for d, _ in sett if d > 8), 1))
if '--lista' in sys.argv:
    for a, b in zip(out['fore'], out['efter']): print(a[0], a[1][0], 'före', None if a[2] is None else round(a[2], 3), 'p' if a[3] else '-', None if a[4] is None else round(a[4]), '| efter', b[1][0], None if b[2] is None else round(b[2], 3), 'p' if b[3] else '-', None if b[4] is None else round(b[4]))
