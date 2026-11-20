# Dagens spår (assets/tracking/<klipp>/card-track.json) mot datasetet: var slår regeln "mostly hidden: last known shape kept"?
# För varje sådan ruta: ligger den intill vändningen (spårets egen sida byter inom tre rutor), och hur mycket av kortet täcker
# handen enligt etiketten i samma ruta? Räknar också spårets alla noter.
#   python -I spar_noter.py     -> spar-noter.json
import os, csv, json, math, collections
import numpy as np
BASE = r'D:\dealer-scratch\tmp\kort-dataset'; REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
man = {}
for l in open(os.path.join(BASE, 'manifest.jsonl'), encoding='utf-8'):
    m = json.loads(l)
    if m.get('clip'): man[m['key']] = m
rows = collections.defaultdict(lambda: collections.defaultdict(list))
with open(os.path.join(BASE, 'rutor.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['key'] in man and r['role'] == 'moving': rows[r['key']][int(r['frame'])].append(r)
notes = collections.Counter(); kept = collections.Counter(); films = 0; kept_films = set(); frames = 0; ratio = []
for key, m in man.items():
    p = os.path.join(REPO, 'assets', 'tracking', m['clip'], 'card-track.json')
    if not os.path.exists(p): continue
    tr = json.load(open(p, encoding='utf-8'))['frames']; films += 1; frames += len(tr)
    sides = [t.get('side') for t in tr]
    for i, t in enumerate(tr):
        note = t.get('note')
        if note: notes[note.split(':')[0][:60]] += 1
        if not note or 'mostly hidden' not in note: continue
        kept['rutor'] += 1; kept_films.add(key)
        near_turn = any(0 <= j < len(sides) and sides[j] in ('EDGE', 'FRONT' if t['side'] == 'BACK' else 'BACK') for j in range(i - 3, i + 4))
        c = np.mean(np.array(t['quad'], dtype=np.float64), axis=0)
        mine = [r for r in rows[key].get(i, []) if math.hypot(float(r['cx']) - c[0], float(r['cy']) - c[1]) < 150]
        best = min(mine, key=lambda r: math.hypot(float(r['cx']) - c[0], float(r['cy']) - c[1])) if mine else None
        hand = best is not None and max(float(best['cover'] or 0), float(best['skin'] or 0)) >= 0.3
        if best is not None and best['qarea']: ratio.append(float(t['area']) / max(1.0, float(best['area'])))
        kept['intill vändningen' if near_turn else 'under en hand' if hand else 'ingen hand, ingen vändning' if best is not None else 'inget kort i etiketten'] += 1
        if near_turn and hand: kept['intill vändningen och under en hand'] += 1
out = {'filmer_med_spar': films, 'rutor': frames, 'regeln_behaller_formen': dict(kept), 'filmer_dar_regeln_slar': len(kept_films),
       'sparets_yta_delat_med_mattens_i_de_rutorna_median': round(float(np.median(ratio)), 2) if ratio else None, 'noter': dict(notes.most_common(12))}
json.dump(out, open(os.path.join(BASE, 'spar-noter.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(out, ensure_ascii=False, indent=1))
