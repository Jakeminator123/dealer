# Fits a generated candidate of a new dealer to the reference dealer's rest frame and measures the result.
#   python -I grundbild.py <reference.png> <candidate.png> <name> <outdir>
# Writes into <outdir>:
#   <name>-final.png  the reference frame with only the person exchanged (reference pixels everywhere else, same size)
#   <name>-ark.jpg    reference | final | half-and-half overlay with the landmarks drawn
#   <name>.json       measurements in reference pixels, and scores 0-100
# The person is moved by one similarity transform (scale, rotation, shift) fitted on hands, shoulders, elbows and eyes.
import sys, json
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

# The model files are not in Git (tools/python/README.md says where they come from); DEALER_MODELS points elsewhere.
import os
MODELS = os.environ.get('DEALER_MODELS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
HAND = os.path.join(MODELS, 'hand_landmarker.task')
FACE = os.path.join(MODELS, 'face_landmarker.task')
POSE = os.path.join(MODELS, 'pose_landmarker_heavy.task')


def chroma(bgr):
    b, g, r = [bgr[..., i].astype(np.float32) for i in range(3)]
    return g - np.maximum(r, b)


def is_green(bgr):
    return (chroma(bgr) > 50) & (bgr[..., 1] > 110)


def parts(bgr):
    """Person mask and shoe mask: the two large non-green components, told apart by where they lie."""
    h, w = bgr.shape[:2]
    n, labels, stats, cent = cv2.connectedComponentsWithStats((~is_green(bgr)).astype(np.uint8), 8)
    person, shoe, best_p, best_s = None, None, 0, 0
    for i in range(1, n):
        area, cx = stats[i, cv2.CC_STAT_AREA], cent[i][0]
        if 0.30 * w < cx < 0.70 * w and area > best_p:
            person, best_p = i, area
    for i in range(1, n):
        area, cx = stats[i, cv2.CC_STAT_AREA], cent[i][0]
        if i != person and cx > 0.62 * w and area > best_s:
            shoe, best_s = i, area
    others = [(int(stats[i, 0]), int(stats[i, 1]), int(stats[i, 2]), int(stats[i, 3]), int(stats[i, 4])) for i in range(1, n)
              if i not in (person, shoe) and stats[i, cv2.CC_STAT_AREA] >= 12]
    return labels == person, (labels == shoe) if shoe is not None else np.zeros((h, w), bool), others


def landmarks(bgr):
    h, w = bgr.shape[:2]
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    out = {'hands': [], 'face': None, 'pose': None}
    opt = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=HAND), num_hands=2,
                                       min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3)
    with vision.HandLandmarker.create_from_options(opt) as m:
        res = m.detect(image)
        hands = [np.array([[p.x * w, p.y * h] for p in pts]) for pts in res.hand_landmarks]
        hands.sort(key=lambda a: a[:, 0].mean())
        out['hands'] = hands
    with vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=POSE), num_poses=1)) as m:
        res = m.detect(image)
        if res.pose_landmarks:
            out['pose'] = np.array([[p.x * w, p.y * h] for p in res.pose_landmarks[0]])
    if out['pose'] is not None:
        # The face detector wants a large face: give it a square crop around the head, sized from the shoulders.
        p = out['pose']
        half = int(0.5 * np.linalg.norm(p[11] - p[12]))
        cx, cy = int(p[0][0]), int(p[0][1])
        x0, y0, x1, y1 = max(0, cx - half), max(0, cy - half), min(w, cx + half), min(h, cy + half)
        crop = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr[y0:y1, x0:x1], cv2.COLOR_BGR2RGB)))
        with vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=FACE), num_faces=1)) as m:
            res = m.detect(crop)
            if res.face_landmarks:
                out['face'] = np.array([[x0 + q.x * (x1 - x0), y0 + q.y * (y1 - y0)] for q in res.face_landmarks[0]])
    return out


def keypoints(lm):
    """Named points used both for the fit and for the measurement. None where a detector found nothing."""
    k = {}
    if len(lm['hands']) == 2:
        k['handA'], k['handB'] = lm['hands'][0], lm['hands'][1]          # A = left in the image, B = right in the image
    if lm['face'] is not None:
        f = lm['face']
        k['eyeA'], k['eyeB'] = (f[33] + f[133]) / 2, (f[362] + f[263]) / 2
        k['chin'], k['brow'], k['nose'] = f[152], f[10], f[1]
    if lm['pose'] is not None:
        p = lm['pose']
        k['shoulderA'], k['shoulderB'] = p[12], p[11]                      # 12 is the person's right shoulder = left in the image
        k['elbowA'], k['elbowB'] = p[14], p[13]
    return k


def similarity(src, dst, weight):
    w = weight / weight.sum()
    ms, md = (src * w[:, None]).sum(0), (dst * w[:, None]).sum(0)
    xs, xd = src - ms, dst - md
    cov = (xd * w[:, None]).T @ xs
    u, s, vt = np.linalg.svd(cov)
    d = np.sign(np.linalg.det(u) * np.linalg.det(vt))
    r = u @ np.diag([1, d]) @ vt
    scale = (s[0] + d * s[1]) / (w * (xs ** 2).sum(1)).sum()
    return float(scale), r, md - scale * r @ ms


def field(bgr, mask):
    """A quadratic surface fitted to the background colour, per channel. Returns the surface and the residual spread."""
    h, w = bgr.shape[:2]
    ys, xs = np.nonzero(cv2.erode(mask.astype(np.uint8), np.ones((9, 9), np.uint8)))
    ys, xs = ys[::7], xs[::7]
    def basis(x, y):
        x, y = x / w, y / h
        return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1)
    a = basis(xs.astype(np.float32), ys.astype(np.float32))
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    full = basis(gx, gy)
    out, spread = np.zeros((h, w, 3), np.float32), []
    for c in range(3):
        coef, *_ = np.linalg.lstsq(a, bgr[ys, xs, c].astype(np.float32), rcond=None)
        out[..., c] = full @ coef
        spread.append(float(np.std(bgr[ys, xs, c] - a @ coef)))
    return out, spread


def table_row(person, k):
    """Row where the body is cut by the table's back edge: lowest person pixel in the columns between the two hands."""
    if 'handA' not in k:
        return None
    x0, x1 = int(k['handA'][:, 0].max()) + 6, int(k['handB'][:, 0].min()) - 6
    if x1 - x0 < 8:
        return None
    rows = [np.nonzero(person[:, x])[0].max() for x in range(x0, x1) if person[:, x].any()]
    return float(np.median(rows)) if rows else None


def ramp(value, good, bad):
    return float(np.clip(100 * (1 - (value - good) / (bad - good)), 0, 100))


def dist(a, b):
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


def main():
    ref_path, cand_path, name, outdir = sys.argv[1:5]
    ref, cand = cv2.imread(ref_path), cv2.imread(cand_path)
    H, W = ref.shape[:2]
    report = {'name': name, 'candidate': cand_path, 'candidateSize': [cand.shape[1], cand.shape[0]], 'referenceSize': [W, H]}

    kr, kc = keypoints(landmarks(ref)), keypoints(landmarks(cand))
    report['found'] = {'reference': sorted(kr), 'candidate': sorted(kc)}
    src, dst, wt = [], [], []
    # Variant for anchor 2.x (bestall/paow-ankare-2-1): the landmarks the order moves are left out of the fit only.
    skip = sys.argv[sys.argv.index('--fit-skip') + 1].split(',') if '--fit-skip' in sys.argv else []
    report['fitSkipped'] = skip
    for key, weight in (('handA', 1), ('handB', 1), ('shoulderA', 6), ('shoulderB', 6), ('elbowA', 3), ('elbowB', 3), ('eyeA', 6), ('eyeB', 6)):
        if key in skip:
            continue
        if key in kr and key in kc:
            a, b = np.atleast_2d(kc[key]), np.atleast_2d(kr[key])
            src.append(a); dst.append(b); wt.append(np.full(len(a), float(weight)))
    if not src:
        report['error'] = 'no common landmarks'
        json.dump(report, open(f'{outdir}/{name}.json', 'w'), indent=1); print(json.dumps(report)); return
    scale, rot, shift = similarity(np.vstack(src), np.vstack(dst), np.concatenate(wt))
    angle = float(np.degrees(np.arctan2(rot[1, 0], rot[0, 0])))
    naive = W / cand.shape[1]
    report['fit'] = {'scale': round(scale, 4), 'scaleIfFrameWereKept': round(naive, 4), 'personSizeVsReference': round(naive / scale, 4),
                     'rotationDeg': round(angle, 2), 'shift': [round(float(v), 1) for v in shift]}

    small = cv2.resize(cand, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    warped = cv2.warpAffine(small, np.hstack([rot, shift[:, None]]).astype(np.float32), (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    person_r, shoe_r, _ = parts(ref)
    person_c, shoe_c, _ = parts(warped)
    field_r, spread_r = field(ref, is_green(ref))
    field_c, spread_c = field(warped, is_green(warped))
    report['green'] = {'referenceCornerRGB': [round(float(v), 1) for v in ref[:96, :96].reshape(-1, 3).mean(0)[::-1]],
                       'candidateCornerRGB': [round(float(v), 1) for v in warped[:96, :96].reshape(-1, 3).mean(0)[::-1]],
                       'referenceSpread': [round(v, 2) for v in spread_r[::-1]], 'candidateSpread': [round(v, 2) for v in spread_c[::-1]]}
    ys, xs = np.nonzero(shoe_r); yc, xc = np.nonzero(shoe_c)
    if len(xs) and len(xc):
        report['shoeInCandidate'] = {'offset': [round(float(xc.mean() - xs.mean()), 1), round(float(yc.mean() - ys.mean()), 1)],
                                     'areaRatio': round(len(xc) / len(xs), 3)}

    # Base layer: the reference with its own dealer replaced by the fitted background.
    kernel = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    away = cv2.dilate(person_r.astype(np.uint8), kernel(8)).astype(np.float32)
    away = cv2.GaussianBlur(away, (0, 0), 3)[..., None]
    base = ref.astype(np.float32) * (1 - away) + field_r * away

    # The candidate's person, with the candidate's background level moved to the reference's.
    alpha = np.clip((70 - chroma(warped)) / 50, 0, 1)[..., None]
    moved = warped.astype(np.float32) + (1 - alpha) * (field_r - field_c)
    # Soft knee on the person's brightest values, so that a white shirt does not sit at pure white (the reference has none).
    peak = moved.max(-1, keepdims=True)
    moved = moved * np.where(peak > 236, (236 + (peak - 236) * 0.5) / np.maximum(peak, 1), 1.0)
    report['whites'] = {'candidatePixelsAt250': int((warped.min(-1) >= 250).sum()), 'referencePixelsAt250': int((ref.min(-1) >= 250).sum())}
    region = cv2.dilate((person_r | person_c).astype(np.uint8), kernel(45))
    if '--keep-shoe-region' not in sys.argv:          # variant: her hand on the shoe comes along; skolagning.py puts the shoe back
        region[cv2.dilate((shoe_r | shoe_c).astype(np.uint8), kernel(8)) > 0] = 0
    report['keepShoeRegion'] = '--keep-shoe-region' in sys.argv
    m = cv2.GaussianBlur(region.astype(np.float32), (0, 0), 6)[..., None]
    final = np.clip(base * (1 - m) + moved * m, 0, 255).astype(np.uint8)
    cv2.imwrite(f'{outdir}/{name}-final.png', final)

    lf = landmarks(final)
    kf = keypoints(lf)
    person_f, shoe_f, debris = parts(final)
    out = {}
    for hand in ('handA', 'handB'):
        if hand in kr and hand in kf:
            d = np.linalg.norm(kr[hand] - kf[hand], axis=1)
            out[hand] = {'mean': round(float(d.mean()), 1), 'max': round(float(d.max()), 1), 'wrist': round(float(d[0]), 1),
                         'fingertips': round(float(d[[4, 8, 12, 16, 20]].mean()), 1)}
    if 'eyeA' in kr and 'eyeA' in kf:
        mid_r, mid_f = (kr['eyeA'] + kr['eyeB']) / 2, (kf['eyeA'] + kf['eyeB']) / 2
        out['head'] = {'eyeMid': round(dist(mid_r, mid_f), 1), 'eyeMidShift': [round(float(v), 1) for v in mid_f - mid_r],
                       'eyeDistanceRatio': round(dist(kf['eyeA'], kf['eyeB']) / dist(kr['eyeA'], kr['eyeB']), 3),
                       'faceHeightRatio': round(dist(kf['brow'], kf['chin']) / dist(kr['brow'], kr['chin']), 3),
                       'chin': round(dist(kr['chin'], kf['chin']), 1)}
    if 'shoulderA' in kr and 'shoulderA' in kf:
        out['shoulders'] = round((dist(kr['shoulderA'], kf['shoulderA']) + dist(kr['shoulderB'], kf['shoulderB'])) / 2, 1)
        out['shoulderWidthRatio'] = round(dist(kf['shoulderA'], kf['shoulderB']) / dist(kr['shoulderA'], kr['shoulderB']), 3)
        out['elbows'] = round((dist(kr['elbowA'], kf['elbowA']) + dist(kr['elbowB'], kf['elbowB'])) / 2, 1)
    row_r, row_f = table_row(person_r, kr), table_row(person_f, kf)
    out['tableRow'] = {'reference': row_r, 'final': row_f}
    out['silhouetteIoU'] = round(float((person_r & person_f).sum() / max(1, (person_r | person_f).sum())), 3)
    out['headTopRow'] = {'reference': int(np.nonzero(person_r.any(1))[0].min()), 'final': int(np.nonzero(person_f.any(1))[0].min())}
    out['debris'] = debris
    out['shoeDiff'] = round(float(np.abs(final.astype(np.int16) - ref.astype(np.int16))[shoe_r].mean()), 2) if shoe_r.any() else None
    out['cornerDiff'] = round(float(np.abs(final[:96, :96].astype(np.int16) - ref[:96, :96].astype(np.int16)).max()), 1)
    out['cornerDiffLow'] = round(float(np.abs(final[-96:, :96].astype(np.int16) - ref[-96:, :96].astype(np.int16)).max()), 1)
    band = (m[..., 0] > 0.05) & (m[..., 0] < 0.95) & is_green(final)
    out['seam95'] = round(float(np.percentile(np.abs(final.astype(np.float32) - field_r)[band].max(-1), 95)), 1) if band.any() else None
    report['measured'] = out

    s = {}
    if 'handA' in out and 'handB' in out:
        s['hands'] = round(ramp((out['handA']['mean'] + out['handB']['mean']) / 2, 4, 30))
    if 'head' in out:
        s['head'] = round(min(ramp(out['head']['eyeMid'], 5, 35), ramp(abs(out['head']['eyeDistanceRatio'] - 1), 0.03, 0.15)))
    if 'shoulders' in out:
        s['body'] = round(min(ramp(out['shoulders'], 8, 45), ramp(abs(out['shoulderWidthRatio'] - 1), 0.03, 0.15)))
    if row_r is not None and row_f is not None:
        s['table'] = round(ramp(abs(row_f - row_r), 2, 14))
    s['frame'] = round(min(ramp(out['shoeDiff'] or 0, 0.5, 4), ramp(max(out['cornerDiff'], out['cornerDiffLow']), 1, 6)))
    s['clean'] = round(max(0, 100 - 25 * len(debris) - (ramp(0, 0, 1) - ramp(out['seam95'] or 0, 8, 30))))
    weights = {'hands': 0.30, 'head': 0.20, 'body': 0.15, 'table': 0.15, 'frame': 0.10, 'clean': 0.10}
    s['total'] = round(sum(s.get(k, 0) * v for k, v in weights.items())) if all(k in s for k in weights) else None
    s['missing'] = [k for k in weights if k not in s]
    report['scores'] = s

    # Contact sheet: reference | final | overlay, with the landmarks of both.
    over = cv2.addWeighted(ref, 0.5, final, 0.5, 0)
    for k, colour in ((kr, (255, 255, 255)), (kf, (0, 0, 255))):
        for key, value in k.items():
            for p in np.atleast_2d(value):
                cv2.circle(over, (int(p[0]), int(p[1])), 3, colour, -1)
    sheet = np.hstack([cv2.resize(i, (W // 2, H // 2), interpolation=cv2.INTER_AREA) for i in (ref, final, over)])
    cv2.imwrite(f'{outdir}/{name}-ark.jpg', sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
    json.dump(report, open(f'{outdir}/{name}.json', 'w'), indent=1)
    print(json.dumps({'name': name, 'fit': report['fit'], 'shoeInCandidate': report.get('shoeInCandidate'), 'green': report['green'], 'scores': s, 'measured': out}))


main()
