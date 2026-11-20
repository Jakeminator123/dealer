# Ögonkoll på filmer provet inte är byggt på: dagens spår (rött, övre) och provets (grönt, nedre) ritade på filmens rutor,
# bara de rutor i vändningen som provet ändrar (högst tre per film).
#   python -I titta_val.py <ut-prefix> <klipp> [<klipp> ...]
import os, sys, json
import numpy as np, cv2
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')); R, K, PER = 50, 2, 7
tiles = []
def at(f):
    p = f['quad'] or f['edge']; return None if not p else np.mean(np.array(p, dtype=np.float64), axis=0)
def draw(img, f, colour, ox, oy):
    if f['quad']: cv2.polylines(img, [np.round((np.array(f['quad']) - [ox, oy]) * K).astype(np.int32)], True, colour, 1, cv2.LINE_AA)
    elif f['edge']: p = np.round((np.array(f['edge']) - [ox, oy]) * K).astype(np.int32); cv2.line(img, tuple(int(v) for v in p[0]), tuple(int(v) for v in p[1]), colour, 1, cv2.LINE_AA)
    cv2.putText(img, f['side'][0], (4, img.shape[0] - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)
for n, clip in enumerate(sys.argv[2:]):
    old = json.load(open(os.path.join(REPO, 'assets', 'tracking', clip, 'card-track.json'), encoding='utf-8'))['frames']
    t = json.load(open(os.path.join(REPO, 'assets', 'proofs', 'kort-fram-bak-20261120', 'spar', clip + '.json'), encoding='utf-8')); new = t['frames']
    frames = sorted(t['trial']['changed']['turn'])[:3]; cap = cv2.VideoCapture(os.path.join(REPO, 'assets', 'motions', clip, 'source.mp4'))
    for i in frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i); ok, fr = cap.read()
        c = at(new[i]); c = at(old[i]) if c is None else c; c = at(new[i - 1]) if c is None else c
        if not ok or c is None: continue
        x0 = int(max(0, min(fr.shape[1] - 2 * R, c[0] - R))); y0 = int(max(0, min(fr.shape[0] - 2 * R, c[1] - R)))
        crop = cv2.resize(fr[y0:y0 + 2 * R, x0:x0 + 2 * R], None, fx=K, fy=K, interpolation=cv2.INTER_CUBIC); a, b = crop.copy(), crop.copy()
        draw(a, old[i], (0, 0, 255), x0, y0); draw(b, new[i], (0, 255, 0), x0, y0)
        cv2.putText(a, f'{chr(65 + n)} {i}', (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA); tiles.append(np.vstack([a, b]))
    print(chr(65 + n), clip, frames)
for k in range(0, len(tiles), 2 * PER):
    rows = [np.hstack(tiles[j:j + PER] + [np.zeros_like(tiles[0])] * (PER - len(tiles[j:j + PER]))) for j in range(k, min(k + 2 * PER, len(tiles)), PER)]
    out = f'{sys.argv[1]}-{k // (2 * PER) + 1}.jpg'; cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out, np.vstack(rows).shape)
