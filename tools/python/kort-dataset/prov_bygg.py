# Bygger provets filmer och stillbilder ur inspelningarna (spela_in.ts): i dag till vänster, provet till höger.
#   python -I prov_bygg.py   (läser D:/dealer-scratch/tmp/kort-dataset/inspelning/{spel,nara}, skriver assets/proofs/kort-fram-bak-20261120/)
import os, json, subprocess, shutil, hashlib
import numpy as np, cv2
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')); REC = r'D:\dealer-scratch\tmp\kort-dataset\inspelning'
OUT = os.path.join(REPO, 'assets', 'proofs', 'kort-fram-bak-20261120'); TMP = os.path.join(REC, '_bygg'); CLIP = 'paow-giv-2-3-p4-h24-cykel-02-01'
track = json.load(open(os.path.join(OUT, 'spar', CLIP + '.json'), encoding='utf-8'))['frames']
def centre(i):
    p = track[i]['quad'] or track[i]['edge']; return None if not p else np.mean(np.array(p, dtype=np.float64), axis=0)
def mark(im, text):
    im = im.copy(); (w, h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    cv2.rectangle(im, (0, 0), (w + 14, h + 12), (0, 0, 0), -1); cv2.putText(im, text, (7, h + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 235, 235), 1, cv2.LINE_AA); return im
def pair(folder, f, crop=None, size=None):
    out = []
    for name, text in (('fore', 'I DAG'), ('efter', 'PROVET')):
        im = cv2.imread(os.path.join(REC, folder, name, f'{f:03d}.png'))
        if crop: x0, y0, w, h = crop; im = im[y0:y0 + h, x0:x0 + w]
        if size: im = cv2.resize(im, size, interpolation=cv2.INTER_AREA if size[0] < im.shape[1] else cv2.INTER_CUBIC)
        out.append(mark(im, text))
    gap = np.full((out[0].shape[0], 4, 3), 20, np.uint8); return np.hstack([out[0], gap, out[1]])
def film(name, frames, fps, show=24):
    d = os.path.join(TMP, name); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for k, im in enumerate(frames): cv2.imwrite(os.path.join(d, f'{k:04d}.png'), im)
    h, w = frames[0].shape[:2]; pad = f'pad={w + w % 2}:{h + h % 2}'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(d, '%04d.png'), '-vf', f'{pad},fps={show}', '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(OUT, name)], check=True)
    shutil.rmtree(d, ignore_errors=True)
# det fasta utsnittet nära: kortets väg genom vändningen och medan framsidan bärs (rutorna 24-60), 3:2
cs = np.array([c for c in (centre(i) for i in range(24, 61)) if c is not None]); lo, hi = cs.min(axis=0), cs.max(axis=0); mid = (lo + hi) / 2
W = int(max(hi[0] - lo[0] + 300, (hi[1] - lo[1] + 260) * 1.5)); W += W % 2; H = int(round(W / 1.5)); H += H % 2
x0 = int(max(0, min(1764 - W, mid[0] - W / 2))); y0 = int(max(0, min(1174 - H, mid[1] - H / 2))); near = (x0, y0, W, H); NS = (720, 480)
print('utsnitt nära', near)
# ... och ett utsnitt som följer kortet mjukt (medel över nio rutor), för att se kortets form och ljus på nära håll
known = {i: centre(i) for i in range(16, 69) if centre(i) is not None}
def follow(f, w, h):
    near_c = [known[i] for i in range(f - 4, f + 5) if i in known]; c = np.mean(near_c, axis=0)
    return (int(max(0, min(1764 - w, c[0] - w / 2))), int(max(0, min(1174 - h, c[1] - h / 2))), w, h)
# 1: hela given i spelets storlek, i spelets fart, två varv
whole = [pair('spel', f) for f in range(10, 81)]; film('1-given-spelets-storlek.mp4', whole + [whole[-1]] * 12 + whole + [whole[-1]] * 12, 24)
# 2: vändningen nära, stillbild (rutan där kortet i dag står kvar brett)
cv2.imwrite(os.path.join(OUT, '2-stillbild-vandningen.png'), pair('nara', 30, follow(30, 300, 200), NS))
# 3: vändningen och ljuset nära, en fjärdedels fart
film('3-vandningen-och-ljuset-nara-langsamt.mp4', [pair('nara', f, follow(f, 420, 280), NS) for f in range(24, 61)], 6)
# 4: ljuset nära, stillbild: två rutor i följd (45 över 46), där papperet i dag slår om till reservvärdet mellan dem
cv2.imwrite(os.path.join(OUT, '4-stillbild-ljuset.png'), np.vstack([pair('nara', 45, follow(46, 300, 200), NS), np.full((4, 2 * NS[0] + 4, 3), 20, np.uint8), pair('nara', 46, follow(46, 300, 200), NS)]))
shutil.rmtree(TMP, ignore_errors=True)
for n in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, n)
    if os.path.isfile(p) and n != 'proof.json': print(n, os.path.getsize(p), hashlib.sha256(open(p, 'rb').read()).hexdigest())
