# Steg C: väljer kortfilmerna ur probe.jsonl. Regeln: grönt bord i bild (minst 10 % av en provad ruta) och en sammanhängande
# gul eller blå fläck av ett korts storlek (minst 0,04 % av bilden och rimligt fylld) i någon provad ruta.
#   python -I select.py            -> selected.jsonl och en sammanställning
#   python -I select.py --pilot 50 -> pilot.jsonl (50 filmer spridda över mapparna, varav hälften med dagens spår)
import os, sys, json, collections, random, re
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')).replace(os.sep, '/')
rows = [json.loads(l) for l in open(os.path.join(BASE, 'probe.jsonl'), encoding='utf-8') if l.strip()]
inv = collections.defaultdict(list)
for l in open(os.path.join(BASE, 'inventory.jsonl'), encoding='utf-8'):
    r = json.loads(l); inv[r['key']].append(r['path'])

def verdict(r):
    if r.get('err') or 'table' not in r: return 'trasig'
    if '/yt-referens/' in r['path']: return 'yt-referens'
    # dockans renderingar (3D-banan) har gult och blått kort över ett grönt bord men är ingen filmad dealer (piloten: 3 av 48 utsnitt)
    if '/3d-dealer-kopia/' in r['path'] or '/dealer-3d/' in r['path'] or os.path.basename(r['path']).startswith('docka'): return 'dockrendering'
    table = max(r['table']); yb = max((a for a, f in r['yblob'] if f >= 0.3), default=0); bb = max((a for a, f in r['bblob'] if f >= 0.3), default=0)
    if table < 0.10: return 'inget grönt bord'
    if max(yb, bb) < 0.0004: return 'grönt bord utan kort'
    if max(r['yellow']) > 0.2 or max(r['blue']) > 0.2: return 'färgyta, inget kort'
    if r['frames'] < 12: return 'för kort'
    return 'kortfilm'

groups = collections.defaultdict(list)
for r in rows: groups[verdict(r)].append(r)
print('unika filmer', len(rows))
for k, v in sorted(groups.items(), key=lambda kv: -len(kv[1])): print(f'{len(v):6d}  {k}   ({sum(r["frames"] for r in v if "frames" in r)} rutor)')
sel = groups['kortfilm']
top = lambda p: '/'.join(p.split('/')[:5 if p.lower().startswith('c:') else 4])
c = collections.Counter(top(r['path']) for r in sel)
print('--- kortfilmer per mapp')
for k, n in c.most_common(30): print(f'{n:6d}  {k}')
res = collections.Counter(f"{r['w']}x{r['h']}" for r in sel); print('--- format', res.most_common(8))
tracked = {d for d in os.listdir(os.path.join(REPO, 'assets/tracking')) if os.path.exists(os.path.join(REPO, 'assets/tracking', d, 'card-track.json'))}
def clip_of(r):
    for p in inv[r['key']]:
        m = re.search(r'/assets/motions/([^/]+)/source\.mp4$', p)
        if m and m.group(1) in tracked and p.lower().startswith(REPO.lower()): return m.group(1)
    return None
with open(os.path.join(BASE, 'selected.jsonl'), 'w', encoding='utf-8') as out:
    for r in sel:
        out.write(json.dumps({'key': r['key'], 'path': r['path'], 'copies': len(inv[r['key']]), 'w': r['w'], 'h': r['h'], 'frames': r['frames'], 'fps': r['fps'], 'clip': clip_of(r)}, ensure_ascii=False) + '\n')
print('med dagens spår (assets/tracking):', sum(1 for r in sel if clip_of(r)))
if '--pilot' in sys.argv:
    n = int(sys.argv[sys.argv.index('--pilot') + 1]); random.seed(7)
    withtrack = [r for r in sel if clip_of(r)]; rest = [r for r in sel if not clip_of(r)]
    random.shuffle(withtrack); pick = withtrack[:n // 2]
    by = collections.defaultdict(list)
    for r in rest: by[top(r['path'])].append(r)
    keys = sorted(by); i = 0
    for k in keys: random.shuffle(by[k])
    while len(pick) < n and any(by.values()):
        k = keys[i % len(keys)]; i += 1
        if by[k]: pick.append(by[k].pop())
    with open(os.path.join(BASE, 'pilot.jsonl'), 'w', encoding='utf-8') as out:
        for r in pick: out.write(json.dumps({'key': r['key'], 'path': r['path'], 'copies': len(inv[r['key']]), 'clip': clip_of(r)}, ensure_ascii=False) + '\n')
    print('pilot', len(pick), 'filmer,', sum(r['frames'] for r in pick), 'rutor')
