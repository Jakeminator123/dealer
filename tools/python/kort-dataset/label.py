# Kortets kontur ruta för ruta ur en film med färgat spårkort (gul rygg, blå framsida) över grönt bord.
# Läser filmen där den ligger. Skriver en etikettfil per film: labels/<nyckel>.json.gz
#   python -I label.py <lista.jsonl> [--workers 2]      (lista: rader med key, path)
#   import label; label.label_film(path)                 (för prov)
# Per ruta och kort: kontur (polygon), fyra hörn (med synlighet), yta, sidlängder, andel av bilden, sida (BACK, FRONT, EDGE),
# oskärpa (kantbandets bredd i bildpunkter), fart, flagga för utsmetad ruta och hur mycket som täcks (fingrar).
import os, sys, json, gzip, hashlib, time, math
os.environ.setdefault('OPENCV_FFMPEG_THREADS', '4')  # två arbetare med fyra avkodningstrådar var: datorn delas
import numpy as np, cv2

VERSION = 'kortlabel-4'
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
RESID = 52.0          # största avstånd (RGB) från blandningslinjen bord -> kort för att en bildpunkt ska räknas som kortets oskärpa
SMEAR_PX = 4.0        # kantband bredare än så (vid 1080 rader) = utsmetad ruta
SMEAR_SPEED = 22.0    # eller fart över så många bildpunkter per ruta (vid 1080 rader)
EDGE_THICK = 9.0      # tunnare än så (vid 1080 rader) = kortet står på högkant (samma tal som src/card-track.ts EDGE_THICKNESS)

def cls_masks(bgr):
    b = bgr[..., 0].astype(np.int16); g = bgr[..., 1].astype(np.int16); r = bgr[..., 2].astype(np.int16)
    mn = np.minimum(r, g)
    yellow = (r > 95) & (g > 95) & (g * 100 > 82 * r) & (r * 100 > 60 * g) & (b * 100 < 45 * mn)
    blue = (b > 90) & (b * 2 > 3 * r) & (b * 100 > 115 * g) & ~yellow
    shade = (r > 95) & (g * 100 > 45 * r) & (g * 100 <= 82 * r) & (b * 100 < 12 * r) & ~yellow & ~blue
    table = (g > r + 35) & (g > b + 35) & ~yellow & ~blue & ~shade
    skin = (r > 120) & (r > g + 15) & (g >= b - 25) & (r > b + 25) & (g * 100 > 55 * r) & (b * 100 > 36 * r) & ~yellow & ~blue & ~shade & ~table
    return yellow, shade, blue, table, skin

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 22), b''): h.update(chunk)
    return h.hexdigest()

def poly_area(q):
    x = q[:, 0]; y = q[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))

def intersect(p1, p2, p3, p4):
    d1 = p2 - p1; d2 = p4 - p3; den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-9: return None, 0, 0
    t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den
    u = ((p3[0] - p1[0]) * d1[1] - (p3[1] - p1[1]) * d1[0]) / den
    return p1 + t * d1, t, u

def fit_quad(hull, occluded):
    """Omskriven fyrhörning: skalet (konvext) tappar en kant i taget, den som kostar minst yta; kanter mot fingrar går först."""
    V = [np.array(p, dtype=np.float64) for p in hull]
    if len(V) < 4: return None, 0.0
    base = abs(poly_area(np.array(V))); hidden = 0.0
    occ = [occluded(V[i], V[(i + 1) % len(V)]) for i in range(len(V))]  # kant i går från hörn i till i + 1; mäts en gång
    while len(V) > 4:
        n = len(V); best = None
        for i in range(n):
            a0, a1, b0, b1 = V[(i - 1) % n], V[i], V[(i + 1) % n], V[(i + 2) % n]
            X, t, u = intersect(a0, a1, b1, b0)
            if X is None or t < 1 - 1e-6 or u < 1 - 1e-6: continue
            add = 0.5 * abs((X[0] - a1[0]) * (b0[1] - a1[1]) - (X[1] - a1[1]) * (b0[0] - a1[0]))
            cost = add * (0.04 if occ[i] > 0.5 else 1.0)
            if best is None or cost < best[0]: best = (cost, i, X, add)
        if best is None: return None, 0.0
        _, i, X, add = best
        if occ[i] > 0.5: hidden += add
        if i == n - 1: V[i] = X; V.pop(0); occ = occ[1:n - 1] + [occ[0]]
        else: V[i] = X; V.pop(i + 1); occ.pop(i)
    q = np.array(V)
    if abs(poly_area(q)) > 2.6 * base: return None, 0.0
    return q, hidden

def order_quad(q):
    """Medurs på skärmen, börjar i hörnet längst upp till vänster (minst x + y)."""
    if poly_area(q) < 0: q = q[::-1]
    k = int(np.argmin(q[:, 0] + q[:, 1]))
    return np.roll(q, -k, axis=0)

class Film:
    def __init__(self, path):
        self.path = path
        cap = cv2.VideoCapture(path)
        self.w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); self.h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); self.fps = cap.get(cv2.CAP_PROP_FPS)
        self.s = self.h / 1080.0 if self.w >= self.h else self.w / 1080.0
        # bordets och kortens färg: median över tre rutor
        tb, yl, bl = [], [], []
        for f in (0, self.n // 2, max(0, self.n - 2)):
            cap.set(cv2.CAP_PROP_POS_FRAMES, f); ok, img = cap.read()
            if not ok: continue
            sm = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
            y, sh, b, t, sk = cls_masks(sm)
            if t.sum() > 50: tb.append(np.median(sm[t], axis=0))
            if y.sum() > 8: yl.append(np.median(sm[y], axis=0))
            if b.sum() > 8: bl.append(np.median(sm[b], axis=0))
            self.table_share = max(getattr(self, 'table_share', 0.0), float(t.mean()))
        cap.release()
        self.bg = np.median(np.array(tb), axis=0) if tb else None
        self.yref = np.median(np.array(yl), axis=0) if yl else np.array([15., 205., 232.])
        self.bref = np.median(np.array(bl), axis=0) if bl else np.array([215., 110., 40.])
        self.soft = self.bg is not None and getattr(self, 'table_share', 0.0) > 0.08

def soft_alpha(roi, bg, col):
    """Andelen kort i varje bildpunkt längs linjen bord -> kort, och avståndet från linjen."""
    p = roi.astype(np.float32) - bg.astype(np.float32); v = (col - bg).astype(np.float32); vv = float(v @ v) + 1e-6
    a = (p @ v) / vv
    res = np.linalg.norm(p - a[..., None] * v, axis=2)
    return a, res

def analyse_roi(frame, box, film, hints):
    x0, y0, x1, y1 = box; roi = frame[y0:y1, x0:x1]; s = film.s; H, W = roi.shape[:2]
    yel, sha, blu, tab, skn = cls_masks(roi)
    out = []
    # lokalt bord: medianen av bordets bildpunkter i rutan (skuggor följer med), annars filmens
    bg = film.bg
    if film.soft and tab.sum() > 60: bg = np.median(roi[tab], axis=0)
    occl_any = ~(tab) & ~(yel | sha | blu)
    min_core = max(12, int(30 * s * s))
    for colour, strict, core in (('Y', yel, yel | sha), ('B', blu, blu)):
        if strict.sum() < min_core: continue
        core8 = core.astype(np.uint8)
        if colour == 'B':  # märket (rosa kryss, röd cirkel) är hål i det blå: fyll inneslutna hål
            cs, hier = cv2.findContours(core8, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
            if hier is not None:
                for i, c in enumerate(cs):
                    if hier[0][i][3] >= 0 and cv2.contourArea(c) < 0.35 * cv2.contourArea(cs[hier[0][i][3]]): cv2.drawContours(core8, [c], -1, 1, -1)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(core8, 8)
        # en fläck som mest är skuggfärg (orange) och knappt gul är ett finger i skugga, inget kort
        keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_core and strict[lab == i].sum() >= (0.35 if colour == 'Y' else 0.2) * stats[i, cv2.CC_STAT_AREA]]
        if not keep: continue
        # delar av samma kort på var sin sida om ett finger hör ihop: de möts genom hud
        k = max(3, int(22 * s)) | 1
        allcore = np.isin(lab, keep).astype(np.uint8)
        union = allcore | (cv2.dilate(allcore, np.ones((k, k), np.uint8)) & skn.astype(np.uint8))
        _, ulab = cv2.connectedComponents(union, connectivity=8)
        groups = {}
        for i in keep:
            ys, xs = np.nonzero(lab == i); groups.setdefault(int(ulab[ys[0], xs[0]]), []).append(i)
        final = []
        for g in groups.values():
            if len(g) == 1: final.append(g); continue
            m = np.isin(lab, g); pts = cv2.findNonZero(m.astype(np.uint8)); hull = cv2.convexHull(pts)
            hm = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(hm, hull, 1)
            filled = m.sum() + (skn & (hm > 0)).sum()
            if cv2.contourArea(hull) <= 1.3 * filled: final.append(g)
            else: final.extend([[i] for i in g])
        for g in final:
            m = np.isin(lab, g)
            col = np.median(roi[m & strict], axis=0) if (m & strict).sum() > 5 else (film.yref if colour == 'Y' else film.bref)
            # Kortets färg är mättad och klar. Gyllenbrunt hår går igenom gulregeln men har mycket mer blått i sig (piloten: 2 av 48),
            # och en mörkblå kavaj går igenom blåregeln men är mörk (piloten: 2 av 48).
            if colour == 'Y' and col[0] > 0.25 * min(col[1], col[2]): continue
            if colour == 'B' and col[0] < 130: continue
            soft = m.astype(np.float32)
            if film.soft:
                r = max(5, int(16 * s)) | 1
                near = cv2.dilate(m.astype(np.uint8), np.ones((r, r), np.uint8)) > 0
                a, res = soft_alpha(roi, bg, col)
                ok = near & ~m & (res < RESID) & (a > 0.08) & ~skn & ~(yel | blu | sha)
                band = np.where(ok, np.clip(a, 0, 1), 0).astype(np.float32)
                # bara det som hänger ihop med kärnan
                nn, bl2 = cv2.connectedComponents(((band > 0.08) | m).astype(np.uint8), connectivity=8)
                ids = np.unique(bl2[m]); conn = np.isin(bl2, ids[ids > 0])
                soft = np.where(m, 1.0, np.where(conn, band, 0.0)).astype(np.float32)
            inst = describe(soft, m, colour, roi, tab, skn, occl_any, x0, y0, film, col)
            if inst: out.append(inst)
    if not out and hints and film.soft:
        # ingen kortfärg kvar: kortet kan stå på högkant som en tunn strimma nära där det nyss var
        # Strimman har ingen ren kortfärg: den är bordets gröna med förskjuten färgton (rött eller blått lyft mot grönt). En skugga
        # behåller tonen och räknas inte; handens oskärpa ligger intill hud och räknas inte heller.
        b_ = roi[..., 0].astype(np.float32); g_ = np.maximum(roi[..., 1].astype(np.float32), 1); r_ = roi[..., 2].astype(np.float32)
        dr = r_ / g_ - bg[2] / max(bg[1], 1); db = b_ / g_ - bg[0] / max(bg[1], 1)
        shift = np.clip(np.maximum(dr / 0.55, db / 0.75), 0, 1)
        ks = max(3, int(9 * s)) | 1
        far = cv2.dilate(skn.astype(np.uint8), np.ones((ks, ks), np.uint8)) == 0
        mask = np.zeros((H, W), bool); card_len = max(h[4] for h in hints)
        for hx0, hy0, hx1, hy1, _ in hints:
            p = int(60 * s); mask[max(0, hy0 - p - y0):max(0, hy1 + p - y0), max(0, hx0 - p - x0):max(0, hx1 + p - x0)] = True
        band = np.where(mask & far & (shift > 0.16) & (g_ > 40), shift, 0).astype(np.float32)
        # bara det smala: handens oskärpa är en tjock fläck som strimman hänger i, och den tas bort med en öppning
        bm = (band > 0.16).astype(np.uint8); ko = int(2.0 * EDGE_THICK * s) | 1
        thick_part = cv2.dilate(cv2.morphologyEx(bm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ko, ko))), np.ones((3, 3), np.uint8))
        band = np.where(thick_part > 0, 0, band).astype(np.float32)
        n, lab, stats, _ = cv2.connectedComponentsWithStats((band > 0.16).astype(np.uint8), 8); best = None
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < 14 * s * s: continue
            pts = cv2.findNonZero((lab == i).astype(np.uint8)); (_, _), (rw, rh), _ = cv2.minAreaRect(pts)
            long = max(rw, rh) + 1; thin = float(stats[i, cv2.CC_STAT_AREA]) / long  # medeltjocklek: strimman har en mjuk skugga intill sig
            if long >= 3 * thin and thin <= 2.2 * EDGE_THICK * s and 0.3 * card_len <= long <= 1.5 * card_len and (best is None or long > best[0]):
                m = lab == i
                # Strimman står fritt över bordet: på båda sidor om den ska det vara bord. En kavajkant eller en fingerkant har bord
                # på bara ena sidan (piloten: 11 av 48 utsnitt var sådana kanter).
                ys_, xs_ = np.nonzero(m); mx, my = xs_.mean(), ys_.mean(); ev, evec = np.linalg.eigh(np.cov(np.vstack([xs_ - mx, ys_ - my])))
                d = evec[:, int(np.argmax(ev))]; nrm = np.array([-d[1], d[0]]); tt = (xs_ - mx) * d[0] + (ys_ - my) * d[1]
                ts = np.linspace(np.percentile(tt, 8), np.percentile(tt, 92), 14); off = 0.5 * thin + 5 * s; flank = []
                for sgn in (-1, 1):
                    px = np.round(mx + ts * d[0] + sgn * off * nrm[0]).astype(np.int64); py = np.round(my + ts * d[1] + sgn * off * nrm[1]).astype(np.int64)
                    ok = (px >= 0) & (px < W) & (py >= 0) & (py < H); flank.append(float(tab[py[ok], px[ok]].mean()) if ok.any() else 0.0)
                if min(flank) < 0.6: continue
                best = (long, 'Y' if float(dr[m].mean()) / 0.55 >= float(db[m].mean()) / 0.75 else 'B', np.where(m, np.maximum(band, 0.55), 0).astype(np.float32))
        if best:
            inst = describe(best[2], best[2] > 0.5, best[1], roi, tab, skn, occl_any, x0, y0, film, None, weak=True)
            if inst:
                inst['side'] = 'EDGE'; inst['quad'] = None; inst['vis'] = None; inst['sides'] = None; inst['qarea'] = None
                out.append(inst)
    return out

def describe(soft, core, colour, roi, tab, skn, occl_any, x0, y0, film, col, weak=False):
    s = film.s; H, W = soft.shape
    area = float(soft.sum())
    if area < 12 * s * s: return None
    half = (soft > (0.3 if weak else 0.5)).astype(np.uint8)
    if half.sum() < 6: half = (soft > 0.15).astype(np.uint8)
    if half.sum() < 6: return None
    cs, _ = cv2.findContours(half, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cs = [c for c in cs if cv2.contourArea(c) >= 4] or cs
    pts = np.concatenate(cs); hull = cv2.convexHull(pts)
    (rcx, rcy), (rw, rh), rang = cv2.minAreaRect(pts)
    length = max(rw, rh) + 1.0; thick = area / length
    perim = sum(cv2.arcLength(c, True) for c in cs)
    # kantbandet: delvis kort mot bordet
    band = float(((soft > 0.1) & (soft < 0.9)).sum())
    edge_px = cv2.morphologyEx(half, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    tab_d = cv2.dilate(tab.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    free = float((edge_px & tab_d).sum()) / max(1.0, float(edge_px.sum()))
    blur = band / (0.8 * max(1.0, perim * max(free, 0.15)))
    side = 'EDGE' if thick < EDGE_THICK * s else ('BACK' if colour == 'Y' else 'FRONT')
    occ_u8 = (occl_any & ~(soft > 0.05)).astype(np.uint8)  # kortets eget oskärpeband är ingen fingerkant
    cen = np.array([rcx, rcy])
    def occluded(a, b):
        d = b - a; L = float(np.hypot(*d))
        if L < 2: return 0.0
        nrm = np.array([-d[1], d[0]]) / L; m = (a + b) / 2
        if np.dot(m - cen, nrm) < 0: nrm = -nrm
        t = np.linspace(0.1, 0.9, max(3, int(L / 2)))
        P = a[None, :] + t[:, None] * d[None, :] + nrm[None, :] * (3.0 * max(1.0, s))
        xi = np.round(P[:, 0]).astype(np.int64); yi = np.round(P[:, 1]).astype(np.int64); ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        return float(occ_u8[yi[ok], xi[ok]].mean()) if ok.any() else 1.0
    quad = None; vis = None; hidden = 0.0; cover = None; skin_in = None; sides = None; qarea = None; completed = False
    hp = cv2.approxPolyDP(hull, max(0.8, 1.0 * s), True).reshape(-1, 2).astype(np.float64)
    if side != 'EDGE' and len(hp) >= 4:
        q, hidden = fit_quad(hp, occluded)
        if q is not None:
            q = order_quad(q); qarea = abs(poly_area(q))
            dist = cv2.distanceTransform(1 - half, cv2.DIST_L2, 3)
            short = min(np.hypot(*(q[1] - q[0])), np.hypot(*(q[2] - q[1])), np.hypot(*(q[3] - q[2])), np.hypot(*(q[0] - q[3])))
            rad = max(4.0 * s, 0.14 * short); vis = []
            # ett hörn syns bara om kortets färg når fram till det och båda kanterna intill är kortets egna (inte en fingerkant)
            for i, c in enumerate(q):
                xi, yi = int(round(c[0])), int(round(c[1]))
                near = bool(0 <= xi < W and 0 <= yi < H and dist[yi, xi] <= rad)
                o1 = occluded(c, (c + q[(i + 1) % 4]) / 2); o2 = occluded(c, (c + q[(i - 1) % 4]) / 2)
                if os.environ.get('KORT_DEBUG'): print('  hörn', i, c.round(1) + [x0, y0], 'nära', near, 'avst', round(float(dist[yi, xi]), 1) if (0 <= xi < W and 0 <= yi < H) else None, 'rad', round(rad, 1), 'täckt', round(o1, 2), round(o2, 2))
                # en kant mot ett finger intill hörnet: hörnet räknas ändå om det stämmer med de tre andra som i en parallellogram
                alt = q[(i - 1) % 4] + q[(i + 1) % 4] - q[(i + 2) % 4]; fits = np.hypot(*(alt - c)) <= 0.18 * short
                vis.append(bool(near and ((o1 < 0.5 and o2 < 0.5) or (min(o1, o2) < 0.5 and fits))))
            # ett enda dolt hörn (under ett finger): de tre synliga ger det fjärde som i en parallellogram, stadigare än två korta kanters skärning
            if vis.count(False) == 1:
                i = vis.index(False); alt = q[(i - 1) % 4] + q[(i + 1) % 4] - q[(i + 2) % 4]
                if np.hypot(*(alt - q[i])) > 0.2 * short: q[i] = alt; completed = True
            qarea = abs(poly_area(q))
            qm = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(qm, np.round(q).astype(np.int32), 1)
            inq = qm > 0; qpx = max(1.0, float(inq.sum()))
            inside_share = qpx / max(1.0, qarea)  # hur mycket av fyrhörningen som ligger inom rutan
            cover = float(np.clip(1.0 - float(soft[inq].sum()) / qpx, 0, 1)); skin_in = float((skn & inq).sum()) / qpx
            sides = [float(np.hypot(*(q[(i + 1) % 4] - q[i]))) for i in range(4)]
            # en yta som inte är ett kort (flera kort som ligger om lott): skalet är mycket större än ytan, och det som fattas är inte hud
            hm = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(hm, hull, 1); hpx = max(1.0, float(hm.sum()))
            solid = (float(half.sum()) + float((skn & (hm > 0) & (half == 0)).sum())) / hpx
            if solid < 0.74 or inside_share < 0.9 or min(sides) < 2: quad = None
            else: quad = q
    if quad is None and side != 'EDGE': vis = None
    box = cv2.boxPoints(((rcx, rcy), (rw, rh), rang)) if side == 'EDGE' else None
    ax = None
    if side == 'EDGE' or weak:
        # strimmans mittlinje: huvudaxeln genom tyngdpunkten (vägd med hur mycket kort varje bildpunkt är), från ände till ände
        ys_, xs_ = np.nonzero(half); wts = soft[ys_, xs_] + 1e-3; mx = float((xs_ * wts).sum() / wts.sum()); my = float((ys_ * wts).sum() / wts.sum())
        cov = np.cov(np.vstack([xs_ - mx, ys_ - my]), aweights=wts) if len(xs_) > 2 else np.eye(2)
        ev, evec = np.linalg.eigh(cov); d = evec[:, int(np.argmax(ev))]; t = (xs_ - mx) * d[0] + (ys_ - my) * d[1]
        ax = [np.array([mx, my]) + d * float(np.percentile(t, 1)), np.array([mx, my]) + d * float(np.percentile(t, 99))]
        if side == 'EDGE' and not weak:
            # På högkant står kortet fritt över bordet. En smal bit kortfärg mellan två fingrar, i skons springa eller på ett tryck är
            # ingen kant: den får sidan PIECE (en bit av ett kort), med kontur men utan linje (piloten: 11 av 23 "kanter" var sådana).
            nrm = np.array([-d[1], d[0]]); ts = np.linspace(float(np.percentile(t, 8)), float(np.percentile(t, 92)), 14); off = 0.5 * thick + 5 * s; flank = []
            for sgn in (-1, 1):
                px = np.round(mx + ts * d[0] + sgn * off * nrm[0]).astype(np.int64); py = np.round(my + ts * d[1] + sgn * off * nrm[1]).astype(np.int64)
                ok = (px >= 0) & (px < W) & (py >= 0) & (py < H); flank.append(float(tab[py[ok], px[ok]].mean()) if ok.any() else 0.0)
            if min(flank) < 0.6 or length < 28 * s: side = 'PIECE'; ax = None
    off = np.array([x0, y0], dtype=np.float64)
    polys = [(cv2.approxPolyDP(c, max(0.7, 0.8 * s), True).reshape(-1, 2) + off).round(1).tolist() for c in cs]
    M = cv2.moments(soft); cx = M['m10'] / max(M['m00'], 1e-6) + x0; cy = M['m01'] / max(M['m00'], 1e-6) + y0
    r1 = lambda v: round(float(v), 2)
    return {
        'side': side, 'colour': colour, 'cx': r1(cx), 'cy': r1(cy), 'area': r1(area), 'share': round(area / (film.w * film.h), 6),
        'len': r1(length), 'thick': r1(thick), 'blur': r1(blur / max(s, 1e-6)), 'free': r1(free),
        'quad': (quad + off).round(2).tolist() if quad is not None else None, 'vis': vis, 'sides': [r1(v) for v in sides] if (sides and quad is not None) else None,
        'qarea': r1(qarea) if (qarea and quad is not None) else None, 'cover': r1(cover) if cover is not None else None, 'skin': r1(skin_in) if skin_in is not None else None,
        'hidden': r1(hidden), 'edge': [(p + off).round(2).tolist() for p in ax] if ax else None, 'poly': polys,
        'bbox': [int(x0 + pts[:, 0, 0].min()), int(y0 + pts[:, 0, 1].min()), int(x0 + pts[:, 0, 0].max()) + 1, int(y0 + pts[:, 0, 1].max()) + 1], 'weak': weak or None,
        'completed': (completed and quad is not None) or None, '_soft': soft, '_off': (x0, y0),
    }

def rois_of(frame, film, hints):
    H, W = frame.shape[:2]; f = 4 if min(H, W) >= 600 else 2
    sm = cv2.resize(frame, (W // f, H // f), interpolation=cv2.INTER_NEAREST)
    y, sh, b, t, sk = cls_masks(sm)
    cand = cv2.dilate((y | b).astype(np.uint8), np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
    pad = int(30 * film.s) + 6; boxes = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 4: continue
        x, yy, w, h = stats[i, 0] * f, stats[i, 1] * f, stats[i, 2] * f, stats[i, 3] * f
        boxes.append([max(0, x - pad), max(0, yy - pad), min(W, x + w + pad), min(H, yy + h + pad)])
    hb = []
    for hx0, hy0, hx1, hy1, hlen in hints:
        p = int(70 * film.s); bx = [max(0, hx0 - p), max(0, hy0 - p), min(W, hx1 + p), min(H, hy1 + p)]; boxes.append(list(bx)); hb.append(bx + [hlen])
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, c = boxes[i], boxes[j]
                if a[0] < c[2] and c[0] < a[2] and a[1] < c[3] and c[1] < a[3]:
                    boxes[i] = [min(a[0], c[0]), min(a[1], c[1]), max(a[2], c[2]), max(a[3], c[3])]; boxes.pop(j); merged = True; break
            if merged: break
    return boxes, hb

CROP = 160; CARD = 80  # träningsutsnitt: 160 x 160, kortets längsta mått omkring 80

def write_crop(frame, c, film, crop_dir, f):
    """Utsnittet kring ett kort och kortets mjuka mask i samma utsnitt. Etiketten får 'crop': [x, y, k]: bild = (film - [x, y]) * k."""
    x0, y0, x1, y1 = c['bbox']; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    k = float(np.clip(CARD / max(x1 - x0, y1 - y0, 20 * film.s), 0.35, 2.5)); ox, oy = cx - CROP / 2 / k, cy - CROP / 2 / k
    M = np.array([[k, 0, -ox * k], [0, k, -oy * k]], dtype=np.float32); interp = cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR
    img = cv2.warpAffine(frame, M, (CROP, CROP), flags=interp, borderMode=cv2.BORDER_REPLICATE)
    sx, sy = c['_off']; Ms = np.array([[k, 0, (sx - ox) * k], [0, k, (sy - oy) * k]], dtype=np.float32)
    a = cv2.warpAffine((c['_soft'] * 255).astype(np.uint8), Ms, (CROP, CROP), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    name = f"{f:04d}_{c['id']}"
    cv2.imwrite(os.path.join(crop_dir, name + '.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 93]); cv2.imwrite(os.path.join(crop_dir, name + '_a.png'), a)
    c['crop'] = [round(ox, 2), round(oy, 2), round(k, 4)]

def label_film(path, sha=True, frames=None, keep_frames=None, crop_dir=None):
    film = Film(path); cap = cv2.VideoCapture(path)
    if crop_dir: os.makedirs(crop_dir, exist_ok=True)
    tracks = []; next_id = 0; prev = []; out = []; f = -1; kept = {}; cache = {}; sig = None
    while True:
        ok, frame = cap.read()
        if not ok: break
        f += 1
        if frames is not None and f > max(frames) + 1: break
        # Strimman söks bara där ett plant kort i kortets färg nyss rörde sig: högst 5 rutor efter den sista plana rutan
        hints = [p['bbox'] + [p.get('flat_len', p['len'])] for p in prev if p.get('moving') and p.get('flat_age', 99) <= 5]
        boxes, hb = rois_of(frame, film, hints)
        cards = []; fresh = {}
        for bx in boxes:
            hs = [h for h in hb if h[0] >= bx[0] and h[1] >= bx[1] and h[2] <= bx[2] and h[3] <= bx[3]]
            # en ruta som är oförändrad sedan förra bilden (skons kort, ett kort som ligger still) mäts inte om
            kb = tuple(int(v) for v in bx); roi = frame[kb[1]:kb[3], kb[0]:kb[2]]; old = cache.get(kb)
            if old is not None and not hs and old[0].shape == roi.shape:
                diff = cv2.absdiff(roi, old[0])
                if float(diff.mean()) < 1.2 and int(cv2.blur(diff, (3, 3)).max()) < 26:
                    found = [dict(c) for c in old[1]]; fresh[kb] = old; cards.extend(found); continue
            found = analyse_roi(frame, bx, film, hs); fresh[kb] = (roi.copy(), [dict(c) for c in found]); cards.extend(found)
        cache = fresh
        # länka till förra rutans kort: närmast först
        pairs = sorted(((math.hypot(c['cx'] - p['cx'], c['cy'] - p['cy']) + (0 if c['colour'] == p['colour'] else 25 * film.s), ci, pi) for ci, c in enumerate(cards) for pi, p in enumerate(prev)))
        usedc, usedp = set(), set()
        for d, ci, pi in pairs:
            if ci in usedc or pi in usedp or d > 150 * film.s: continue
            usedc.add(ci); usedp.add(pi); c, p = cards[ci], prev[pi]
            c['id'] = p['id']; c['speed'] = round(math.hypot(c['cx'] - p['cx'], c['cy'] - p['cy']) / film.s, 2)
            if c['side'] == 'EDGE': c['flat_age'] = p.get('flat_age', 99) + 1; c['flat_len'] = p.get('flat_len', p['len'])
        for c in cards:
            if c['side'] != 'EDGE': c['flat_age'] = 0; c['flat_len'] = c['len']
        for ci, c in enumerate(cards):
            if 'id' not in c: c['id'] = next_id; next_id += 1; c['speed'] = None
            c['moving'] = bool((c['speed'] or 0) > 1.5 or c['side'] == 'EDGE' or (c['speed'] is None and f > 0))
            # ett kort som rörde sig nyss räknas som i rörelse några rutor till (så att strimman hittas i nästa ruta)
            for p in prev:
                if p['id'] == c['id'] and p.get('hot', 0) > 0 and not c['moving']: c['hot'] = p['hot'] - 1; c['moving'] = True
            if (c['speed'] or 0) > 1.5 or c['side'] == 'EDGE': c['hot'] = 4
            c['smeared'] = bool(c['blur'] > SMEAR_PX or (c['speed'] or 0) > SMEAR_SPEED)
            # utsnitt för träning och mätning: varje ruta av ett kort i rörelse, var tolfte av ett som ligger still
            if crop_dir and (c['moving'] or (f + c['id']) % 12 == 0): write_crop(frame, c, film, crop_dir, f)
        for c in cards: c.pop('_soft', None); c.pop('_off', None)
        prev = cards
        if f == 0:  # filmens signatur: första rutan som 16 x 16 gråvärden över sitt medel (samma tagning i en annan kodning får samma)
            g16 = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (16, 16), interpolation=cv2.INTER_AREA); sig = ''.join('1' if v else '0' for v in (g16 > g16.mean()).flatten())
            sig = '%064x' % int(sig, 2)
        if frames is None or f in frames:
            out.append({'f': f, 'cards': [{k: v for k, v in c.items() if k not in ('hot', 'flat_age', 'flat_len') and v is not None} for c in cards]})
            if keep_frames is not None and f in keep_frames: kept[f] = frame.copy()
    cap.release()
    meta = {'version': VERSION, 'path': path.replace('\\', '/'), 'w': film.w, 'h': film.h, 'fps': round(film.fps, 3), 'frames': f + 1, 'sig': sig if f >= 0 else None,
            'matte': 'soft' if film.soft else 'hard', 'bg_bgr': [round(float(v), 1) for v in film.bg] if film.bg is not None else None, 'table_share': round(getattr(film, 'table_share', 0.0), 3)}
    if sha: meta['sha256'] = sha256_of(path)
    return (meta, out, kept) if keep_frames is not None else (meta, out)

def run_one(row):
    key = row['key']; dst = os.path.join(BASE, 'labels', key + '.json.gz')
    if os.path.exists(dst): return key, 'fanns', 0, 0
    try:
        t0 = time.time(); meta, frames = label_film(row['path'], crop_dir=None if '/yt-referens/' in row['path'].replace('\\', '/') else os.path.join(BASE, 'crops', key))
        meta['key'] = key; meta['copies'] = row.get('copies', 1)
        tmp = dst + '.tmp'
        with gzip.open(tmp, 'wt', encoding='utf-8') as g: json.dump({'film': meta, 'frames': frames}, g, separators=(',', ':'))
        os.replace(tmp, dst)
        return key, 'ok', len(frames), round(time.time() - t0, 1)
    except Exception as e:
        return key, 'fel: ' + str(e)[:160], 0, 0

if __name__ == '__main__':
    from multiprocessing import Pool
    cv2.setNumThreads(2)
    rows = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8')]
    workers = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 2
    os.makedirs(os.path.join(BASE, 'labels'), exist_ok=True); t0 = time.time(); nf = 0
    with Pool(workers) as pool, open(os.path.join(BASE, 'label-log.jsonl'), 'a', encoding='utf-8') as log:
        for i, (key, status, n, sec) in enumerate(pool.imap_unordered(run_one, rows, chunksize=2)):
            nf += n; log.write(json.dumps({'key': key, 'status': status, 'frames': n, 'sec': sec}) + '\n'); log.flush()
            if i % 25 == 0: print(i, len(rows), status, nf, f'{time.time() - t0:.0f} s', flush=True)
    print('klart', len(rows), 'filmer', nf, 'rutor', f'{time.time() - t0:.0f} s')
