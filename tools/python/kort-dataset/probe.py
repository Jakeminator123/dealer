# Steg B: snabbprov av varje unik film: format och hur mycket kortfärg (gult, blått) och grönt bord som syns i första rutan
# och i en ruta nära mitten. Mitten nås genom att läsa framåt (grab), inte genom att hoppa: ett hopp i de här filmerna
# avkodar från filmens början varje gång och tog en sekund per film och åtta kärnor.
# Läser inventory.jsonl, lägger till rader i probe.jsonl (en per unik film; redan provade hoppas över). Två arbetare.
#   python -I probe.py
import os, sys, json, time
os.environ.setdefault('OPENCV_FFMPEG_THREADS', '4')
import numpy as np, cv2
from multiprocessing import Pool

BASE = r'D:\dealer-scratch\tmp\kort-dataset'

def classes(bgr):
    b = bgr[..., 0].astype(np.int16); g = bgr[..., 1].astype(np.int16); r = bgr[..., 2].astype(np.int16)
    yellow = (r > 95) & (g > 95) & (g > 0.82 * r) & (r > 0.6 * g) & (b < 0.45 * np.minimum(r, g))
    blue = (b > 90) & (b > 1.5 * r) & (b > 1.15 * g)
    table = (g > r + 35) & (g > b + 35)
    return yellow, blue, table

def biggest(mask):
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n < 2: return 0, 0.0
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])); a = int(stats[i, cv2.CC_STAT_AREA])
    box = stats[i, cv2.CC_STAT_WIDTH] * stats[i, cv2.CC_STAT_HEIGHT]
    return a, a / max(1, box)

def probe(row):
    p = row['path']; out = {'key': row['key'], 'path': p, 'size': row['size'], 'copies': row.get('copies', 1)}
    try:
        cap = cv2.VideoCapture(p)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = cap.get(cv2.CAP_PROP_FPS)
        out.update(w=w, h=h, frames=n, fps=round(fps, 3))
        if n < 2 or w < 64: cap.release(); out['err'] = 'tom'; return out
        ys, bs, ts, yb, bb = [], [], [], [], []
        mid = min(n // 2, 150); f = -1
        while f < mid:
            if not cap.grab(): break
            f += 1
            if f not in (0, mid): continue
            ok, img = cap.retrieve()
            if not ok: continue
            s = 480 / w; img = cv2.resize(img, (480, max(2, int(h * s))), interpolation=cv2.INTER_AREA)
            y, b, t = classes(img); px = y.size
            ys.append(y.sum() / px); bs.append(b.sum() / px); ts.append(t.sum() / px)
            ya, yf = biggest(y); ba, bf = biggest(b); yb.append([ya / px, yf]); bb.append([ba / px, bf])
        cap.release()
        if not ys: out['err'] = 'ingen ruta'; return out
        r4 = lambda v: [round(float(x), 5) for x in v]
        out.update(yellow=r4(ys), blue=r4(bs), table=r4(ts), yblob=[[round(a, 5), round(f, 2)] for a, f in yb], bblob=[[round(a, 5), round(f, 2)] for a, f in bb])
    except Exception as e:
        out['err'] = str(e)[:200]
    return out

def main():
    rows = [json.loads(l) for l in open(os.path.join(BASE, 'inventory.jsonl'), encoding='utf-8')]
    seen = {}
    for r in rows:
        if r['key'] in seen: seen[r['key']]['copies'] += 1
        else: seen[r['key']] = dict(r, copies=1)
    dst = os.path.join(BASE, 'probe.jsonl'); done = set()
    if os.path.exists(dst): done = {json.loads(l)['key'] for l in open(dst, encoding='utf-8') if l.strip()}
    todo = [r for r in seen.values() if r['key'] not in done]; t0 = time.time()
    with Pool(2) as pool, open(dst, 'a', encoding='utf-8') as out:
        for i, res in enumerate(pool.imap_unordered(probe, todo, chunksize=8)):
            out.write(json.dumps(res, ensure_ascii=False) + '\n')
            if i % 400 == 0: print(i, len(todo), f'{time.time() - t0:.0f} s', flush=True)
    print('klart', len(todo), f'{time.time() - t0:.0f} s')

if __name__ == '__main__':
    main()
