# Prövar rådet "räkna ut vändningen" mot datasetet. För varje vändning (ett plant kort med ryggen upp som inom tio rutor är ett
# plant kort med framsidan upp på nästan samma plats, eller tvärtom) jämförs det som går att räkna ut ur rutorna före och efter
# (kortets mitt rakt emellan, eller med farten in och ut) med det som mättes i vändningens egna rutor (strimman på högkant).
# Räknar också var regeln i src/card-track.ts:363-366 ("under halva ytan på samma plats = dolt under handen") skulle slå.
#   python -I vandning.py     -> vandning.json
import os, csv, json, math, collections
import numpy as np
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
man = {}
for l in open(os.path.join(BASE, 'manifest.jsonl'), encoding='utf-8'): m = json.loads(l); man[m['key']] = m
films = collections.defaultdict(list)
with open(os.path.join(BASE, 'rutor.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['role'] == 'moving' and r['key'] in man: r['f'] = int(r['frame']); films[r['key']].append(r)

def quad(r): return np.array([[float(r[f'x{i}']), float(r[f'y{i}'])] for i in range(4)])
def flat(r): return r['side'] in ('BACK', 'FRONT') and r['x0'] != ''
def angdiff(a, b): d = abs(a - b) % math.pi; return min(d, math.pi - d)
def med(v): return round(float(np.median(v)), 2) if len(v) else None
def p90(v): return round(float(np.percentile(v, 90)), 2) if len(v) else None
def dist(a, b): return float(np.hypot(*(np.asarray(a) - np.asarray(b))))

lin, herm, hold, ang, lenratio, axis_long, gaps, n_edge, smeared_after = [], [], [], [], [], [], [], [], []
rule = collections.Counter(); films_turn = set(); split_turn = collections.Counter(); lens = []
for key, rs in films.items():
    m = man[key]; s = (m['h'] if m['w'] >= m['h'] else m['w']) / 1080
    byf = collections.defaultdict(list); byid = {}
    for r in rs: byf[r['f']].append(r); byid[(r['id'], r['f'])] = r
    turn_frames = set(); used = set()
    for b in sorted((r for r in rs if flat(r)), key=lambda r: r['f']):
        fb = b['f']; qb = quad(b); cb = qb.mean(0); Lb = float(b['len'])
        if any(flat(o) and o['side'] == b['side'] and dist(quad(o).mean(0), cb) < 1.5 * Lb for o in byf.get(fb - 1, [])): continue  # samma sida fanns redan här
        a = None
        for fa in range(fb - 1, fb - 12, -1):
            cand = [o for o in byf.get(fa, []) if flat(o) and o['side'] != b['side'] and (o['id'], fa) not in used and dist(quad(o).mean(0), cb) < (1.5 + 0.5 * (fb - fa)) * Lb]
            if cand: a = min(cand, key=lambda o: dist(quad(o).mean(0), cb)); break
        if a is None: continue
        fa = a['f']; used.add((a['id'], fa)); qa = quad(a); ca = qa.mean(0); lens.append(max(float(a[f'side{i}']) for i in range(4)) / s)
        films_turn.add(key); split_turn[m['split']] += 1; gaps.append(fb - fa - 1); turn_frames.update(range(fa - 2, fb + 3)); smeared_after.append(int(b['smeared']))
        pa, pb = byid.get((a['id'], fa - 1)), byid.get((b['id'], fb + 1))
        va = (ca - quad(pa).mean(0)) if pa is not None and flat(pa) else None; vb = (quad(pb).mean(0) - cb) if pb is not None and flat(pb) else None
        found = 0
        for f in range(fa + 1, fb):
            t = (f - fa) / (fb - fa); mid = ca + (cb - ca) * t
            cand = [o for o in byf.get(f, []) if o['side'] == 'EDGE' and o['ex0'] != '']
            cand = [(dist(((float(o['ex0']) + float(o['ex1'])) / 2, (float(o['ey0']) + float(o['ey1'])) / 2), mid), o) for o in cand]
            cand = [c for c in cand if c[0] < 1.2 * Lb]
            if not cand: continue
            r = min(cand, key=lambda c: c[0])[1]; found += 1
            e0 = np.array([float(r['ex0']), float(r['ey0'])]); e1 = np.array([float(r['ex1']), float(r['ey1'])]); c = (e0 + e1) / 2
            lin.append(dist(mid, c) / s); hold.append(dist(ca, c) / s)
            if va is not None and vb is not None:
                n = fb - fa; h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
                herm.append(dist(h00 * ca + h10 * n * va + h01 * cb + h11 * n * vb, c) / s)
            ea = math.atan2(e1[1] - e0[1], e1[0] - e0[0]); best = None
            for q in (qa, qb):
                for i in range(2):
                    d = q[(i + 1) % 4] - q[i]; L = (np.hypot(*d) + np.hypot(*(q[(i + 3) % 4] - q[(i + 2) % 4]))) / 2; other = (np.hypot(*(q[(i + 2) % 4] - q[(i + 1) % 4])) + np.hypot(*(q[i] - q[(i + 3) % 4]))) / 2
                    c2 = (angdiff(ea, math.atan2(d[1], d[0])), L, L >= other)
                    if best is None or c2[0] < best[0]: best = c2
            ang.append(math.degrees(best[0])); lenratio.append(dist(e0, e1) / max(1e-6, best[1])); axis_long.append(int(best[2]))
        n_edge.append(found)
    # regeln "under halva ytan på samma plats": var slår den?
    for r in rs:
        a = byid.get((r['id'], r['f'] - 1))
        if a is None or not (flat(a) and flat(r)) or a['side'] != r['side']: continue
        if float(r['area']) < 0.5 * float(a['area']) and dist(quad(r).mean(0), quad(a).mean(0)) < 0.6 * math.sqrt(max(1.0, float(a['qarea'] or a['area']))):
            rule['slår'] += 1
            if r['f'] in turn_frames: rule['i en vändning'] += 1
            elif float(r['cover'] or 0) >= 0.3 or float(r['skin'] or 0) >= 0.3: rule['under en hand'] += 1
            elif int(r['smeared']) or float(r['blur_over']) > 2.5: rule['utsmetad'] += 1
            else: rule['annat'] += 1
out = {'filmer_med_rorligt_kort': len(films), 'filmer_med_vandning': len(films_turn), 'vandningar': len(gaps), 'vandningar_per_delning': dict(split_turn),
       'rutor_mellan_rygg_och_framsida': dict(sorted(collections.Counter(gaps).items())), 'vandningar_med_matt_strimma': int(sum(1 for n in n_edge if n > 0)),
       'vandningar_med_rutor_emellan': int(sum(1 for g in gaps if g > 0)), 'forsta_plana_rutan_efter_ar_utsmetad': round(float(np.mean(smeared_after)), 3) if smeared_after else None,
       'matta_strimmor': len(lin), 'kortets_langsida_fore_vandningen_px_vid_1080_median': med(lens),
       'mittfel_px_vid_1080': {'rakt_emellan': {'median': med(lin), 'p90': p90(lin)}, 'med_farten_in_och_ut': {'median': med(herm), 'p90': p90(herm), 'antal': len(herm)}, 'stannar_pa_sista_rutan': {'median': med(hold), 'p90': p90(hold)}},
       'strimmans_vinkel_mot_narmaste_kortsida_grader': {'median': med(ang), 'p90': p90(ang)}, 'strimmans_langd_delat_med_den_sidan': {'median': med(lenratio), 'p90': p90(lenratio)},
       'andel_dar_axeln_ar_langsidan': round(float(np.mean(axis_long)), 3) if axis_long else None, 'regeln_under_halva_ytan': dict(rule)}
json.dump(out, open(os.path.join(BASE, 'vandning.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(out, ensure_ascii=False))
