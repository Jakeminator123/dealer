# A film of one set of a dealer made into a film of another set: the film's own movement, with the hands of the other set's
# anchor picture laid over the film's hands and carried by each hand's own small movement in the film (a translation per
# frame, measured on the film). For a rest whose hands lie still on the felt: Casino's rests became Tatuerad's this way
# (2026-11-23, tools/register-derived.ts brings the result into the bank). No model, no text, no cost.
#   python -I hands-from-anchor.py <anchor.png> <film.mp4> <out.mp4> [--sheet <sheet.png>]
# anchor   the anchor picture whose hands the film gets, in the film's own size; everything outside the hands must be the
#          film's first frame (the hands are found as the two large parts where the two differ)
# --sheet  eight frames of the result, whole and cropped to the hands, for the eye
# Writes <out.mp4> (H.264, CRF 12, the film's frame count and rate; needs ffmpeg on the path) and prints how far each hand
# moved in the film and how many pixels of the first and last frame differ from the anchor.
import cv2, numpy as np, subprocess, sys
anchor, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
a1 = cv2.imread(anchor)
assert a1 is not None, anchor
cap = cv2.VideoCapture(src); fps = cap.get(cv2.CAP_PROP_FPS); frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
cap.release()
f0 = frames[0]; H, W = f0.shape[:2]
assert a1.shape == f0.shape, (a1.shape, f0.shape)
# The hands: the two large connected parts where the film's first frame and the anchor differ, left to right in the picture.
d = (cv2.absdiff(f0, a1).max(axis=2) > 30).astype(np.uint8)
d = cv2.morphologyEx(d, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(d, 8)
hands = sorted([i for i in range(1, n) if st[i, 4] > 2000], key=lambda i: st[i, 0])
assert len(hands) == 2, [st[i].tolist() for i in range(1, n) if st[i, 4] > 200]
g0 = cv2.cvtColor(f0, cv2.COLOR_BGR2GRAY).astype(np.float32)
# Per hand: a soft mask around it, and the box its movement is measured in.
parts = []
for i in hands:
    x, y, w, h = st[i, :4]
    m = cv2.dilate((lab == i).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (37, 37)))
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 6)
    box = (max(0, x - 30), max(0, y - 30), min(W, x + w + 30), min(H, y + h + 30))
    parts.append((m, box))
moves = []
res = []
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5)
for t, f in enumerate(frames):
    o = f.astype(np.float32); g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32); mv = []
    for m, (x0, y0, x1, y1) in parts:
        warp = np.eye(2, 3, dtype=np.float32)
        try: _, warp = cv2.findTransformECC(g0[y0:y1, x0:x1], g[y0:y1, x0:x1], warp, cv2.MOTION_TRANSLATION, crit, None, 5)
        except cv2.error: pass
        dx, dy = float(warp[0, 2]), float(warp[1, 2])  # template (frame 0) point p lies at p + (dx, dy) in frame t
        if abs(dx) > 12 or abs(dy) > 12: dx = dy = 0.0  # a hand that left its place: the anchor's hand stays where it lay
        mv.append((dx, dy))
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        a = cv2.warpAffine(a1, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        mm = cv2.warpAffine(m, M, (W, H), flags=cv2.INTER_LINEAR)[..., None]
        o = o * (1 - mm) + a * mm
    moves.append(mv); res.append(np.clip(o + 0.5, 0, 255).astype(np.uint8))
mv = np.array(moves)
print('rutor', len(frames), 'fps', fps, '| handens rörelse i filmen (px): vänster i bild max', np.abs(mv[:, 0]).max(axis=0).round(2).tolist(), 'höger i bild max', np.abs(mv[:, 1]).max(axis=0).round(2).tolist())
print('första rutan mot ankaret, px över 24:', int((cv2.absdiff(res[0], a1).max(axis=2) > 24).sum()), '| sista:', int((cv2.absdiff(res[-1], a1).max(axis=2) > 24).sum()))
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
for r in res: p.stdin.write(r.tobytes())
p.stdin.close(); p.wait()
if sheet:
    idx = np.linspace(0, len(res) - 1, 8).round().astype(int)
    top = np.hstack([cv2.resize(res[i], (W // 4, H // 4)) for i in idx])
    crop = np.hstack([res[i][700:900, 600:1150][:, ::1] for i in idx[:4]])
    crop2 = np.hstack([res[i][700:900, 600:1150] for i in idx[4:]])
    wid = max(top.shape[1], crop.shape[1])
    pad = lambda im: cv2.copyMakeBorder(im, 0, 0, 0, wid - im.shape[1], cv2.BORDER_CONSTANT)
    cv2.imwrite(sheet, np.vstack([pad(top), pad(crop), pad(crop2)]))
