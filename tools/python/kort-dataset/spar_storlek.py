# Dagens spår mot etiketten, storlek per klipp: spårets fyrhörning delat med etikettens (yta), i rutor där etiketten har minst
# tre synliga hörn och rutan inte är utsmetad. Ett klipp där kvoten ligger långt från 1 har ett spår som är för litet eller för stort.
#   python -I spar_storlek.py     -> spar-storlek.json
import os, csv, json, math, collections
import numpy as np
BASE = r'D:\dealer-scratch\tmp\kort-dataset'; REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
man = {}
for l in open(os.path.join(BASE, 'manifest.jsonl'), encoding='utf-8'):
    m = json.loads(l)
    if m.get('clip'): man[m['key']] = m
rows = collections.defaultdict(list)
with open(os.path.join(BASE, 'rutor.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['key'] in man and r['x0'] != '' and int(r['nvis'] or 0) >= 3 and r['smeared'] == '0' and r['side'] in ('BACK', 'FRONT'): rows[r['key']].append(r)
def area(q): q = np.array(q, dtype=np.float64); x, y = q[:, 0], q[:, 1]; return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
per = {}; allr = collections.defaultdict(list)
for key, rs in rows.items():
    tr = json.load(open(os.path.join(REPO, 'assets', 'tracking', man[key]['clip'], 'card-track.json'), encoding='utf-8'))['frames']
    best = {}
    for r in rs:
        f = int(r['frame']); tf = tr[f] if f < len(tr) else None
        if not tf or not tf.get('quad') or tf.get('side') != r['side']: continue
        c = np.mean(np.array(tf['quad'], dtype=np.float64), axis=0); dd = math.hypot(c[0] - float(r['cx']), c[1] - float(r['cy']))
        if dd <= 1.2 * max(40.0, float(r['len'])) and (f not in best or dd < best[f][0]): best[f] = (dd, area(tf['quad']) / max(1.0, float(r['qarea'])), r['side'])
    by = collections.defaultdict(list)
    for _, q, side in best.values(): by[side].append(q); allr[side].append(q)
    per[man[key]['clip']] = {s: [len(v), round(float(np.median(v)), 2)] for s, v in by.items() if len(v) >= 5}
off = {c: v for c, v in per.items() if any(q < 0.75 or q > 1.3 for _, q in v.values())}
out = {'klipp': len(per), 'kvot_p10_median_p90': {s: [round(float(x), 2) for x in np.percentile(v, [10, 50, 90])] for s, v in allr.items()}, 'rutor': {s: len(v) for s, v in allr.items()},
       'klipp_med_kvot_under_0_75_eller_over_1_3': off}
json.dump(out, open(os.path.join(BASE, 'spar-storlek.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(out, ensure_ascii=False))
