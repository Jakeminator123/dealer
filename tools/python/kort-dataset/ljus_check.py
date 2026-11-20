# Belägg för ljushoppen: gör om cardBase (src/scene3d-film.ts:32-37) på filmens rutor med dagens spår.
# 36 prov i spårets fyrhörning (0,2 till 0,8), de som har kortets färgton räknas (n); under 6 -> reservvärdet; annars den ljusare
# halvans medel (om minst 3) eller allas. Skriver n, m och ljusheten per ruta, och hoppet mot förra rutan.
#   python -I ljus_check.py <film.mp4> <card-track.json> <från> <till>
import sys, json, numpy as np, cv2
path, track, a, b = sys.argv[1], json.load(open(sys.argv[2], encoding='utf-8')), int(sys.argv[3]), int(sys.argv[4])
cap = cv2.VideoCapture(path); f = -1; W = np.array([.2126, .7152, .0722]); prev = None
# kortets färgton: medianen av klart blå bildpunkter i spårets fyrhörningar över rutorna (riktningen, inte ljusheten)
frames = {}
while f < b:
    ok, img = cap.read(); f += 1
    if not ok: break
    if f >= a: frames[f] = img[..., ::-1].astype(np.float64) / 255
cap.release()
def samples(img, q):
    out = []
    for j in range(6):
        for i in range(6):
            u, v = .2 + .12 * i, .2 + .12 * j
            p = (q[0] + (q[1] - q[0]) * u) * (1 - v) + (q[3] + (q[2] - q[3]) * u) * v
            x, y = int(round(p[0])), int(round(p[1]))
            if 0 <= x < img.shape[1] and 0 <= y < img.shape[0]: out.append(img[y, x])
    return np.array(out)
allb = []
for f, img in frames.items():
    t = track['frames'][f]
    if t['side'] == 'FRONT' and t.get('quad'):
        s = samples(img, np.array(t['quad'], dtype=np.float64)); blue = s[(s[:, 2] > 1.5 * s[:, 0]) & (s[:, 2] > 1.15 * s[:, 1])]
        if len(blue): allb.append(np.median(blue, axis=0))
ref = np.median(np.array(allb), axis=0); d = ref / np.linalg.norm(ref); print('kortets färgton (rgb 0-1):', ref.round(3))
for f, img in frames.items():
    t = track['frames'][f]
    if t['side'] != 'FRONT' or not t.get('quad'): print(f, t['side'], '-'); prev = None; continue
    s = samples(img, np.array(t['quad'], dtype=np.float64)); ln = np.linalg.norm(s, axis=1)
    ok = (ln > .12) & ((s @ d) / np.maximum(ln, 1e-6) > .96); n = int(ok.sum()); lum = s[ok] @ W
    if n >= 6:
        top = lum[lum >= lum.mean()]; val = float(top.mean() if len(top) >= 3 else lum.mean()); how = 'ljusa halvan' if len(top) >= 3 else 'alla'
    else: val = float(ref @ W); how = 'RESERV'
    step = '' if prev is None else f'  hopp {round((val - prev) * 255):+d}/255'
    print(f, 'n', n, how, 'ljushet', round(val * 255), step); prev = val
