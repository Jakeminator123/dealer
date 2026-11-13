# Is it the new dealer in every frame? Face likeness per frame against stills of the new and of the old dealer, and how
# much tattoo ink the backs of the hands carry. Needs the film's measurement from filmmatt.py (for nose and hand points).
#   python -I identitet.py <film.mp4> <name> <dir with <name>.film.json> --new <png,png,...> --old <png,png,...>
# Writes <dir>/<name>.identity.json and prints the summary.
# Face likeness is the cosine of OpenCV's SFace features (same person above about 0.36); the best of the given stills counts.
import sys, json
import numpy as np, cv2

# The model files are not in Git (tools/python/README.md says where they come from); DEALER_MODELS points elsewhere.
import os
MODELS = os.environ.get('DEALER_MODELS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
DET = os.path.join(MODELS, 'face_detection_yunet_2023mar.onnx')
REC = os.path.join(MODELS, 'face_recognition_sface_2021dec.onnx')
detector = cv2.FaceDetectorYN.create(DET, '', (640, 640), 0.5, 0.3, 20)
recogniser = cv2.FaceRecognizerSF.create(REC, '')


def face_feature(bgr, centre, half):
    """Feature of the face nearest `centre` (film pixels), found in a square crop enlarged to 640."""
    h, w = bgr.shape[:2]
    x0, y0, x1, y1 = int(max(0, centre[0] - half)), int(max(0, centre[1] - half)), int(min(w, centre[0] + half)), int(min(h, centre[1] + half))
    if x1 - x0 < 20 or y1 - y0 < 20:
        return None
    crop = cv2.resize(bgr[y0:y1, x0:x1], (640, 640), interpolation=cv2.INTER_CUBIC)
    _, faces = detector.detect(crop)
    if faces is None or not len(faces):
        return None
    face = max(faces, key=lambda f: f[-1])
    return recogniser.feature(recogniser.alignCrop(crop, face)).copy()


def still_features(paths):
    out = []
    for path in paths:
        bgr = cv2.imread(path)
        scale = bgr.shape[1] / 1764
        for centre in ((864, 230), (864, 300), (880, 330)):          # the head sits here at rest and lower when she looks down
            f = face_feature(bgr, (centre[0] * scale, centre[1] * scale), 190 * scale)
            if f is not None:
                out.append(f); break
    return out


def likeness(feature, refs):
    return max(float(recogniser.match(feature, r, cv2.FaceRecognizerSF_FR_COSINE)) for r in refs) if refs else None


def ink_share(bgr, points, scale):
    """Share of dark pixels on the back of a hand (the polygon wrist, thumb base and the four knuckles)."""
    poly = np.array([[points[i][0] / scale, points[i][1] / scale] for i in (0, 1, 5, 9, 13, 17)], np.int32)
    mask = np.zeros(bgr.shape[:2], np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(poly), 1)
    px = bgr[mask > 0].astype(np.int16)
    if len(px) < 40:
        return None
    b, g, r = px[:, 0], px[:, 1], px[:, 2]
    skin_or_ink = ~((g - np.maximum(r, b) > 40) & (g > 100))          # leave out green that shows inside the polygon
    if skin_or_ink.sum() < 40:
        return None
    return round(float(((px.max(1) < 150) & skin_or_ink).sum() / skin_or_ink.sum()), 3)


def main():
    film, name, folder = sys.argv[1:4]
    opt = {sys.argv[i]: sys.argv[i + 1] for i in range(4, len(sys.argv) - 1, 2)}
    new, old = still_features(opt['--new'].split(',')), still_features(opt['--old'].split(','))
    info = json.load(open(f'{folder}/{name}.film.json'))
    cap = cv2.VideoCapture(film)
    scale = 1764 / cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    series = []
    for frame in info['frames']:
        ok, bgr = cap.read()
        if not ok:
            break
        row = {'i': frame['i']}
        if frame['body']:
            nose = frame['body']['nose']
            f = face_feature(bgr, (nose[0] / scale, nose[1] / scale), 190 / scale)
            if f is not None:
                row['new'], row['old'] = round(likeness(f, new), 3), round(likeness(f, old), 3)
        for side in ('L', 'R'):
            if side in frame['hands']:
                share = ink_share(bgr, frame['hands'][side], scale)
                if share is not None:
                    row['ink' + side] = share
        series.append(row)
    cap.release()
    faces = [r for r in series if 'new' in r]
    def runs(flags):                     # longest run and first frame of a condition
        best, start, cur, first = 0, None, 0, None
        for r, flag in flags:
            if flag:
                cur += 1
                if first is None:
                    first = r['i']
                if cur > best:
                    best, start = cur, r['i'] - cur + 1
            else:
                cur = 0
        return {'frames': sum(1 for _, f in flags if f), 'longestRun': best, 'runStartsAt': start, 'firstAt': first}
    s = {'name': name, 'stills': {'new': len(new), 'old': len(old)}, 'faceFrames': len(faces), 'frameCount': len(series)}
    if faces:
        n, o = np.array([r['new'] for r in faces]), np.array([r['old'] for r in faces])
        s['face'] = {'newMean': round(float(n.mean()), 3), 'newP5': round(float(np.percentile(n, 5)), 3), 'newMin': round(float(n.min()), 3),
                     'oldMean': round(float(o.mean()), 3), 'oldMax': round(float(o.max()), 3),
                     'closerToOld': runs([(r, r['old'] > r['new']) for r in faces]),
                     'belowSamePerson': runs([(r, r['new'] < 0.36) for r in faces])}
    for side in ('L', 'R'):
        v = [r for r in series if 'ink' + side in r]
        if v:
            a = np.array([r['ink' + side] for r in v])
            s['ink' + side] = {'median': round(float(np.median(a)), 3), 'p10': round(float(np.percentile(a, 10)), 3), 'min': round(float(a.min()), 3),
                               'bare': runs([(r, r['ink' + side] < 0.12) for r in v])}
    json.dump({'summary': s, 'series': series}, open(f'{folder}/{name}.identity.json', 'w'))
    print(json.dumps(s))


main()
