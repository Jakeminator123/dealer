# Kontaktark: utsnitt ur filmrutor med etiketten inritad (kontur magenta, fyrhörning röd, synliga hörn vita, dolda svarta,
# dagens spår cyan om --track ges). För att se med ögat hur ofta konturen stämmer.
#   python -I sheet.py film <film.mp4> <rutor t.ex. 26-36> <ut.jpg> [--track card-track.json]
#   python -I sheet.py urval <antal> <ut-prefix> [--seed 1] [--bara moving|smeared|edge|static]   (ur labels/)
import os, sys, json, gzip, random, glob
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import label

CELL = 260

def draw(frame, c, s, track_quad=None, track_edge=None, tag=''):
    x0, y0, x1, y1 = c['bbox']; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; half = max(x1 - x0, y1 - y0) / 2 + 26 * s; half = max(half, 50 * s)
    H, W = frame.shape[:2]; ax0, ay0 = int(cx - half), int(cy - half); size = int(2 * half)
    crop = np.zeros((size, size, 3), np.uint8)
    sx0, sy0, sx1, sy1 = max(0, ax0), max(0, ay0), min(W, ax0 + size), min(H, ay0 + size)
    if sx1 > sx0 and sy1 > sy0: crop[sy0 - ay0:sy1 - ay0, sx0 - ax0:sx1 - ax0] = frame[sy0:sy1, sx0:sx1]
    k = CELL / size; img = cv2.resize(crop, (CELL, CELL), interpolation=cv2.INTER_LINEAR if k > 1 else cv2.INTER_AREA)
    P = lambda pts: np.round((np.array(pts, dtype=np.float64) - [ax0, ay0]) * k).astype(np.int32)
    for poly in c.get('poly', []):
        if len(poly) >= 2: cv2.polylines(img, [P(poly)], True, (255, 0, 255), 1, cv2.LINE_AA)
    if track_quad is not None: cv2.polylines(img, [P(track_quad)], True, (255, 255, 0), 1, cv2.LINE_AA)
    if track_edge is not None: cv2.polylines(img, [P(track_edge)], False, (255, 255, 0), 2, cv2.LINE_AA)
    if c.get('quad'):
        q = P(c['quad']); cv2.polylines(img, [q], True, (0, 0, 255), 1, cv2.LINE_AA)
        for p, v in zip(q, c.get('vis') or [True] * 4): cv2.circle(img, tuple(int(t) for t in p), 3, (255, 255, 255) if v else (0, 0, 0), -1); cv2.circle(img, tuple(int(t) for t in p), 3, (0, 0, 255), 1)
    if c.get('edge'): cv2.polylines(img, [P(c['edge'])], False, (0, 0, 255), 1, cv2.LINE_AA)
    txt = f"{tag} {c['side'][0]}{'*' if c.get('smeared') else ''} b{c['blur']:.1f} c{c.get('cover', 0):.2f}"
    cv2.rectangle(img, (0, 0), (CELL, 13), (0, 0, 0), -1); cv2.putText(img, txt, (2, 10), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (255, 255, 255), 1, cv2.LINE_AA)
    return img

def tile(cells, cols, out):
    rows = (len(cells) + cols - 1) // cols; sheet = np.zeros((rows * CELL, cols * CELL, 3), np.uint8)
    for i, c in enumerate(cells): sheet[(i // cols) * CELL:(i // cols + 1) * CELL, (i % cols) * CELL:(i % cols + 1) * CELL] = c
    cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 88]); print(out, len(cells))

def frames_of(path, wanted):
    cap = cv2.VideoCapture(path); got = {}; f = -1; last = max(wanted)
    while f < last:
        ok, img = cap.read()
        if not ok: break
        f += 1
        if f in wanted: got[f] = img
    cap.release(); return got

def spec(text):
    out = []
    for part in text.split(','):
        if '-' in part: a, b = part.split('-'); out.extend(range(int(a), int(b) + 1))
        else: out.append(int(part))
    return out

if sys.argv[1] == 'film':
    path, frames, out = sys.argv[2], spec(sys.argv[3]), sys.argv[4]
    track = json.load(open(sys.argv[sys.argv.index('--track') + 1], encoding='utf-8')) if '--track' in sys.argv else None
    meta, labels, kept = label.label_film(path, sha=False, frames=set(frames), keep_frames=set(frames))
    s = (meta['h'] if meta['w'] >= meta['h'] else meta['w']) / 1080; cells = []
    for fr in labels:
        tf = track['frames'][fr['f']] if track and fr['f'] < len(track['frames']) else None
        cards = [c for c in fr['cards'] if c.get('moving')] or fr['cards'][:1]
        for c in cards: cells.append(draw(kept[fr['f']], c, s, tf.get('quad') if tf else None, tf.get('edge') if tf else None, f"f{fr['f']}"))
        print(fr['f'], [(c['id'], c['side'], c['colour'], c['area'], c['blur'], c.get('cover'), c.get('speed'), c.get('smeared'), c.get('vis')) for c in cards], 'spår:', tf and (tf['side'], tf.get('confidence')))
    tile(cells, 6, out)
else:
    n, prefix = int(sys.argv[2]), sys.argv[3]
    random.seed(int(sys.argv[sys.argv.index('--seed') + 1]) if '--seed' in sys.argv else 1)
    only = sys.argv[sys.argv.index('--bara') + 1] if '--bara' in sys.argv else None
    files = sorted(glob.glob(os.path.join(label.BASE, 'labels', '*.json.gz'))); picks = []
    random.shuffle(files)
    per = max(1, -(-n // max(1, min(len(files), n))))
    for fp in files:
        d = json.load(gzip.open(fp, 'rt', encoding='utf-8')); cand = []
        for fr in d['frames']:
            for c in fr['cards']:
                ok = {'moving': c.get('moving'), 'smeared': c.get('smeared') and c.get('moving'), 'edge': c['side'] == 'EDGE', 'static': not c.get('moving'), None: True}[only]
                if ok: cand.append((fr['f'], c))
        random.shuffle(cand)
        for f, c in cand[:per]: picks.append((d['film'], f, c))
        if len(picks) >= n: break
    picks = picks[:n]; by = {}
    for film, f, c in picks: by.setdefault(film['path'], []).append((film, f, c))
    cells = []; index = []
    for path, items in by.items():
        got = frames_of(path, {f for _, f, _ in items})
        for film, f, c in items:
            if f not in got: continue
            s = (film['h'] if film['w'] >= film['h'] else film['w']) / 1080
            cells.append(draw(got[f], c, s, tag=str(len(cells)))); index.append({'nr': len(index), 'path': path, 'f': f, 'id': c['id'], 'side': c['side']})
    for i in range(0, len(cells), 24): tile(cells[i:i + 24], 6, f'{prefix}-{i // 24 + 1}.jpg')
    json.dump(index, open(prefix + '-index.json', 'w', encoding='utf-8'), indent=0)
