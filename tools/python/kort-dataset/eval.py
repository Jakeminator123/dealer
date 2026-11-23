# Steg 4, mätningen: modellen mot dagens spårning och mot färgregeln, på filmer som modellen inte har sett (split = val).
#   python -I eval.py [--modell 2] [--ut matning-v2.json]      (tar själv det delade låset för grafikkortet, train.LOCK)
# A. Skarpa rutor med pålitligt facit: modellens hörn mot etikettens (hörnfel i filmens bildpunkter, IoU).
# B. Samma rutor med syntetisk utsmetning 12, 24 och 36 bildpunkter (facit = kortet mitt i exponeringen): modellen mot
#    färgregeln (dagens klasser gul/blå -> största fläcken -> fyrhörning).
# D. Samma rutor med version 2:s ritade avvikelser (train.py): märket på den blå sidan, tryck på kortet och fingrar över det.
# C. Verkliga rutor ur filmer som har dagens spår (assets/tracking/<klipp>/card-track.json): hur väl fyrhörningen täcker
#    filmens kort (mjuk IoU mot kortets uppmätta mask) för dagens spår, etiketteraren och modellen; alla rutor i rörelse,
#    de utsmetade och vändningens rutor (på högkant och två rutor omkring) var för sig.
import os, sys, csv, json, math, random, collections
import numpy as np, cv2, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import label, train
BASE = train.BASE; CROP = train.CROP; REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))

def quad_from(pm, ph=None):
    m = (pm > 0.5).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2: return None
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    if stats[i, cv2.CC_STAT_AREA] < 12: return None
    pts = cv2.findNonZero((lab == i).astype(np.uint8)); hull = cv2.convexHull(pts)
    hp = cv2.approxPolyDP(hull, 0.8, True).reshape(-1, 2).astype(np.float64)
    if len(hp) < 4: return None
    q, _ = label.fit_quad(hp, lambda a, b: 0.0)
    if q is None: return None
    q = label.order_quad(q)
    if ph is not None:  # dra varje hörn till värmekartans topp intill
        for j in range(4):
            x, y = q[j]; x0, y0, x1, y1 = int(max(0, x - 7)), int(max(0, y - 7)), int(min(CROP, x + 8)), int(min(CROP, y + 8))
            if x1 <= x0 or y1 <= y0: continue
            w = ph[y0:y1, x0:x1]
            if w.max() > 0.3:
                yy, xx = np.mgrid[y0:y1, x0:x1]; ww = np.where(w > 0.5 * w.max(), w, 0); q[j] = [float((xx * ww).sum() / ww.sum()), float((yy * ww).sum() / ww.sum())]
    return q

def corner_err(a, b):
    best = 1e9
    for base in (b, b[::-1]):
        for s in range(4): best = min(best, float(np.mean(np.hypot(*(a - np.roll(base, s, axis=0)).T))))
    return best

def fill(q):
    m = np.zeros((CROP, CROP), np.uint8)
    if q is not None: cv2.fillConvexPoly(m, np.round(q).astype(np.int32), 1)
    return m

def iou(a, b): u = float((a | b).sum()); return float((a & b).sum()) / u if u else 0.0
def soft_iou(alpha, m): inter = float((alpha * m).sum()); return inter / max(1e-6, float(alpha.sum()) + float(m.sum()) - inter)

def colour_rule_quad(bgr, side):
    yel, sha, blu, tab, skn = label.cls_masks(bgr)
    return quad_from(((yel | sha) if side == 'BACK' else blu).astype(np.float32))

def smear_np(img, L, ang):
    K = int(L) | 1; K = max(K, 3); ker = np.zeros((K, K), np.float32); c = K // 2
    for t in np.linspace(-L / 2, L / 2, int(L * 2) + 1):
        xi, yi = int(round(c + t * math.cos(ang))), int(round(c + t * math.sin(ang)))
        if 0 <= xi < K and 0 <= yi < K: ker[yi, xi] += 1
    return cv2.filter2D(img, -1, ker / ker.sum(), borderType=cv2.BORDER_REPLICATE)

@torch.no_grad()
def predict(net, imgs):
    out_m, out_h, out_c = [], [], []
    for i in range(0, len(imgs), 128):
        x = torch.from_numpy(np.stack(imgs[i:i + 128])).cuda().permute(0, 3, 1, 2).float().div(255)[:, [2, 1, 0]]
        with torch.autocast('cuda', dtype=torch.float16): o, c = net(x.contiguous(memory_format=torch.channels_last))
        o = torch.sigmoid(o.float()); out_m.append(o[:, 0].cpu().numpy()); out_h.append(o[:, 1].cpu().numpy()); out_c.append(c.float().argmax(1).cpu().numpy())
    return np.concatenate(out_m), np.concatenate(out_h), np.concatenate(out_c)

def med(v): return round(float(np.median(v)), 2) if len(v) else None
def mean(v): return round(float(np.mean(v)), 3) if len(v) else None

def main():
    version = train.arg('--modell', 2); lock = train.take_lock(f'mäter kortmodell v{version}', 10)
    try: measure(version)
    finally: train.release_lock(lock)

def measure(version):
    random.seed(5); np.random.seed(5)
    ck = torch.load(os.path.join(BASE, f'modell-v{version}.pt'), map_location='cuda'); net = train.Net().cuda().to(memory_format=torch.channels_last); net.load_state_dict(ck['net']); net.eval()
    res = {'modell': {'version': version, 'epoker': ck['epoch'], 'traningsutsnitt': ck['samples']}}
    # ---- A och B
    rows = train.rows_for('val', lambda r: r['side'] != 'EDGE' and train.reliable(r)); random.shuffle(rows)
    by = collections.defaultdict(list)
    for r in rows: by[r['key']].append(r)
    rows = [r for v in by.values() for r in v[:40]][:6000]
    imgs, truth, ks, sides = [], [], [], []
    for r in rows:
        s = train.load(r)
        if s is None: continue
        imgs.append(s[0]); ks.append(float(r['crop_k'])); sides.append(r['side']); truth.append(s[4])
    print('A/B: valideringsfilmer', len(by), 'utsnitt', len(imgs), flush=True)
    res['A_B'] = {'filmer': len(by), 'utsnitt': len(imgs)}
    def score(test, of):
        """Modellen och färgregeln mot facit på bilderna test; of[j] är rutan som test[j] är gjord av."""
        pm, ph, pc = predict(net, test); e_m, e_c, i_m, i_c, miss_m, miss_c, side_ok = [], [], [], [], 0, 0, 0
        for j, o in enumerate(of):
            t = truth[o]; tm = fill(t); qm = quad_from(pm[j], ph[j]); qc = colour_rule_quad(test[j], sides[o])
            side_ok += int(pc[j] == (0 if sides[o] == 'BACK' else 1))
            if qm is None: miss_m += 1; i_m.append(0.0)
            else: e_m.append(corner_err(qm, t) / ks[o]); i_m.append(iou(fill(qm), tm))
            if qc is None: miss_c += 1; i_c.append(0.0)
            else: e_c.append(corner_err(qc, t) / ks[o]); i_c.append(iou(fill(qc), tm))
        return {'utsnitt': len(test), 'modell': {'hornfel_median_px': med(e_m), 'hornfel_p90_px': round(float(np.percentile(e_m, 90)), 2) if e_m else None, 'iou_medel': mean(i_m), 'utan_fyrhorning': miss_m, 'ratt_sida': round(side_ok / max(1, len(test)), 4)},
                'fargregel': {'hornfel_median_px': med(e_c), 'hornfel_p90_px': round(float(np.percentile(e_c, 90)), 2) if e_c else None, 'iou_medel': mean(i_c), 'utan_fyrhorning': miss_c}}
    every = list(range(len(imgs)))
    for L in (0, 12, 24, 36):
        res['A_B'][f'utsmetning_{L}px'] = score(imgs if L == 0 else [smear_np(im, L * k, random.uniform(0, math.pi)) for im, k in zip(imgs, ks)], every)
        print(L, json.dumps(res['A_B'][f'utsmetning_{L}px']), flush=True)
    # ---- D: det ritade (samma slump för varje modell som mäts)
    rnd = random.Random(7); front = [j for j in every if sides[j] == 'FRONT']; res['D'] = {}
    for name, of, draw in (('market', front, lambda j: train.draw_mark(imgs[j], truth[j], rnd)), ('tryck', every, lambda j: train.draw_print(imgs[j], truth[j], 0 if sides[j] == 'BACK' else 1, rnd)),
                           ('fingrar', every, lambda j: train.draw_fingers(imgs[j], truth[j], rnd)), ('market_fingrar_utsmetning_24px', front, lambda j: smear_np(train.draw_fingers(train.draw_mark(imgs[j], truth[j], rnd), truth[j], rnd), 24 * ks[j], rnd.uniform(0, math.pi)))):
        res['D'][name] = score([draw(j) for j in of], of); print(name, json.dumps(res['D'][name]), flush=True)
    # ---- C
    man = {}
    for l in open(os.path.join(BASE, 'manifest.jsonl'), encoding='utf-8'): m = json.loads(l); man[m['key']] = m
    tracks = {}
    def track_of(key):
        if key not in tracks:
            clip = man[key].get('clip'); p = os.path.join(REPO, 'assets', 'tracking', clip, 'card-track.json') if clip else None
            tracks[key] = json.load(open(p, encoding='utf-8')) if p and os.path.exists(p) else None
        return tracks[key]
    allrows = collections.defaultdict(list)
    with open(os.path.join(BASE, 'rutor.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['crop_k'] and r['role'] == 'moving' and r['side'] != 'PIECE' and man.get(r['key'], {}).get('clip'): allrows[r['key']].append(r)
    groups = collections.defaultdict(lambda: collections.defaultdict(list)); counted = collections.Counter(); why = collections.defaultdict(collections.Counter)
    for key, rs in allrows.items():
        tr = track_of(key)
        if not tr: continue
        split = man[key]['split']; counted['filmer_' + split] += 1
        # spårets plats per ruta (fyrhörningens eller linjens mitt); en ruta utan fynd lånar platsen av närmaste ruta inom tre
        place = {}
        for f, tf in enumerate(tr['frames']):
            if tf.get('quad'): place[f] = np.mean(np.array(tf['quad'], dtype=np.float64), axis=0)
            elif tf.get('edge'): place[f] = np.mean(np.array(tf['edge'], dtype=np.float64), axis=0)
        def near(f):
            for d in (0, 1, -1, 2, -2, 3, -3):
                if f + d in place: return place[f + d]
            return None
        # ett kort per ruta: etikettens kort närmast spårets plats (ett annat kort intill, som skons nästa, ska inte jämföras med spåret)
        best = {}
        for r in rs:
            f = int(r['frame']); p = near(f)
            if p is None: continue
            dd = math.hypot(p[0] - float(r['cx']), p[1] - float(r['cy']))
            if dd <= 2 * max(40.0, float(r['len'])) and (f not in best or dd < best[f][0]): best[f] = (dd, r)
        rs = [best[f][1] for f in sorted(best)]
        # vändningens rutor: rygg högst tre rutor före och framsida högst tre rutor efter (eller tvärtom), och rutor på högkant
        fb = {int(r['frame']) for r in rs if r['side'] == 'BACK'}; ff = {int(r['frame']) for r in rs if r['side'] == 'FRONT'}; fe = {int(r['frame']) for r in rs if r['side'] == 'EDGE'}
        def turning(f, reach=3):
            w0, w1 = range(f - reach, f + 1), range(f, f + reach + 1)
            return f in fe or (any(x in fb for x in w0) and any(x in ff for x in w1)) or (any(x in ff for x in w0) and any(x in fb for x in w1))
        imgs, meta = [], []
        for r in rs:
            d = os.path.join(BASE, 'crops', key); name = f"{int(r['frame']):04d}_{r['id']}"
            img = cv2.imread(os.path.join(d, name + '.jpg')); a = cv2.imread(os.path.join(d, name + '_a.png'), cv2.IMREAD_GRAYSCALE)
            if img is None or a is None or a.sum() < 255 * 8: continue
            imgs.append(img); meta.append((r, a.astype(np.float32) / 255))
        if not imgs: continue
        pm, ph, pc = predict(net, imgs)
        for j, (r, alpha) in enumerate(meta):
            f = int(r['frame']); ox, oy, k = float(r['crop_x']), float(r['crop_y']), float(r['crop_k']); tf = tr['frames'][f] if f < len(tr['frames']) else None
            to = lambda pts: (np.array(pts, dtype=np.float64) - [ox, oy]) * k
            tm = np.zeros((CROP, CROP), np.uint8)
            if tf and tf.get('quad'): cv2.fillConvexPoly(tm, np.round(to(tf['quad'])).astype(np.int32), 1)
            elif tf and tf.get('edge'): p = np.round(to(tf['edge'])).astype(np.int32); cv2.line(tm, tuple(int(v) for v in p[0]), tuple(int(v) for v in p[1]), 1, max(2, int(round(9 * k))))
            lm = np.zeros((CROP, CROP), np.uint8)
            if r['x0'] != '': cv2.fillConvexPoly(lm, np.round(to([[float(r[f'x{i}']), float(r[f'y{i}'])] for i in range(4)])).astype(np.int32), 1)
            elif r['ex0'] != '': p = np.round(to([[float(r['ex0']), float(r['ey0'])], [float(r['ex1']), float(r['ey1'])]])).astype(np.int32); cv2.line(lm, tuple(int(v) for v in p[0]), tuple(int(v) for v in p[1]), 1, max(2, int(round(9 * k))))
            qm = quad_from(pm[j], ph[j]) if pc[j] != 2 else None
            mm = fill(qm) if qm is not None else (pm[j] > 0.5).astype(np.uint8)
            kinds = ['alla i rörelse']
            if int(r['smeared']): kinds.append('utsmetade')
            if turning(f): kinds.append('vändningen')
            if turning(f, 1): kinds.append('vändningens kärna')
            if r['side'] == 'FRONT': kinds.append('framsidan')
            cov = lambda m_: float((alpha * m_).sum()) / max(1e-6, float(alpha.sum()))  # hur stor del av filmens kort som formen täcker
            # det synliga: bord och kort. Under en hand kan ingen form jämföras med filmens kort, så där räknas den inte.
            seen = (label.cls_masks(imgs[j])[3] | (alpha > 0.1)).astype(np.uint8)
            vis = lambda m_: soft_iou(alpha, m_ & seen)
            if vis(tm) < 0.5: why[split][('utan form' if tm.sum() == 0 else (tf.get('note') or 'ingen not').split(':')[0][:48]) + ' / ' + r['side']] += 1
            for kind in kinds:
                g = groups[split][kind]; g.append((soft_iou(alpha, tm), soft_iou(alpha, lm), soft_iou(alpha, mm), int(tm.sum() == 0), int(lm.sum() == 0), int(mm.sum() == 0), cov(tm), cov(lm), cov(mm), vis(tm), vis(lm), vis(mm)))
    res['dagens_spar_under_0_5'] = {s: dict(c.most_common(12)) for s, c in why.items()}
    res['C'] = {'filmer': dict(counted)}
    for split in ('val', 'train'):
        for kind, g in groups[split].items():
            a = np.array(g); res['C'][f'{split} / {kind}'] = {'rutor': len(g), 'mjuk_iou_medel': {'dagens_spar': mean(a[:, 0]), 'etiketteraren': mean(a[:, 1]), 'modellen': mean(a[:, 2])},
                                                             'mjuk_iou_median': {'dagens_spar': med(a[:, 0]), 'etiketteraren': med(a[:, 1]), 'modellen': med(a[:, 2])},
                                                             'tackning_medel': {'dagens_spar': mean(a[:, 6]), 'etiketteraren': mean(a[:, 7]), 'modellen': mean(a[:, 8])},
                                                             'iou_i_det_synliga_medel': {'dagens_spar': mean(a[:, 9]), 'etiketteraren': mean(a[:, 10]), 'modellen': mean(a[:, 11])},
                                                             'iou_i_det_synliga_under_0_5': {'dagens_spar': round(float((a[:, 9] < 0.5).mean()), 3), 'etiketteraren': round(float((a[:, 10] < 0.5).mean()), 3), 'modellen': round(float((a[:, 11] < 0.5).mean()), 3)},
                                                             'utan_form': {'dagens_spar': int(a[:, 3].sum()), 'etiketteraren': int(a[:, 4].sum()), 'modellen': int(a[:, 5].sum())}}
    json.dump(res, open(os.path.join(BASE, train.arg('--ut', f'matning-v{version}.json')), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(json.dumps(res['C'], indent=1, ensure_ascii=False))

if __name__ == '__main__':
    main()
