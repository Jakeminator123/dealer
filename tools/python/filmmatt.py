# Measures one film of the dealer: format, green level, frozen frames, evenness, hands and body per frame, coloured cards.
#   python -I filmmatt.py <film.mp4> <name> <outdir> [--ref <film.mp4>] [--start <png>] [--end <png>] [--seats 1,2,3]
# --ref    a film whose motion this one is meant to repeat (same length in seconds): hands, body and card are compared per moment
# --start / --end   the pictures the film was ordered from: first and last frame are compared with them
# --seats  seats whose first card should lie on the table in the last frame: distance from the placement plan in pixels
# All positions are given in bank pixels (the film scaled to 1764 wide). Card colours follow the lab's rules (src/card-track.ts).
# Writes <outdir>/<name>.film.json (summary and per-frame series) and prints the summary.
import sys, json
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

# The model files are not in Git (tools/python/README.md says where they come from); DEALER_MODELS points elsewhere.
import os
MODELS = os.environ.get('DEALER_MODELS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
HAND = os.path.join(MODELS, 'hand_landmarker.task')
POSE = os.path.join(MODELS, 'pose_landmarker_heavy.task')
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # tools/python/ lies two levels down
BANK_W, BANK_H = 1764, 1174
SHOE_WINDOW = (1215, 720, 1365, 880)          # the seated yellow card in the shoe, with margin (bank pixels)


def classes(bgr):
    b, g, r = [bgr[..., i].astype(np.float32) for i in range(3)]
    yellow = (r > 95) & (g > 95) & (g > 0.82 * r) & (r > 0.6 * g) & (b < 0.45 * np.minimum(r, g))
    blue = (b > 90) & (b > 1.5 * r) & (b > 1.15 * g) & ~yellow
    return yellow, blue


def blobs(mask, scale, colour, min_area=50):
    n, labels, stats, cent = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    out = []
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA] * scale * scale
        if area < min_area:
            continue
        cx, cy = cent[i][0] * scale, cent[i][1] * scale
        x0, y0, x1, y1 = SHOE_WINDOW
        out.append({'c': colour, 'x': round(float(cx), 1), 'y': round(float(cy), 1), 'area': int(area), 'inShoe': bool(x0 < cx < x1 and y0 < cy < y1)})
    return out


def read(path):
    """Per frame: corner greens, step from the previous frame, hands, body points, coloured blobs."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = BANK_W / w
    hands_opt = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=HAND), running_mode=vision.RunningMode.VIDEO, num_hands=2,
                                             min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3, min_tracking_confidence=0.3)
    pose_opt = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=POSE), running_mode=vision.RunningMode.VIDEO, num_poses=1)
    frames, prev, first, last = [], None, None, None
    c = max(8, int(96 / scale))
    with vision.HandLandmarker.create_from_options(hands_opt) as hm, vision.PoseLandmarker.create_from_options(pose_opt) as pm:
        index = 0
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            if first is None:
                first = bgr.copy()
            last = bgr
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
            stamp = int(index * 1000 / fps)
            hr, pr = hm.detect_for_video(image, stamp), pm.detect_for_video(image, stamp)
            body = None
            if pr.pose_landmarks:
                p = pr.pose_landmarks[0]
                body = {k: [round(p[i].x * w * scale, 1), round(p[i].y * h * scale, 1)] for k, i in
                        (('nose', 0), ('shoulderL', 11), ('shoulderR', 12), ('elbowL', 13), ('elbowR', 14), ('wristL', 15), ('wristR', 16))}
            hands = {}
            for pts in hr.hand_landmarks:
                arr = np.array([[q.x * w * scale, q.y * h * scale] for q in pts])
                if body:
                    side = 'L' if np.linalg.norm(arr[0] - body['wristL']) <= np.linalg.norm(arr[0] - body['wristR']) else 'R'
                else:
                    side = 'L' if arr[:, 0].mean() > BANK_W / 2 else 'R'      # her left hand is at the right of the picture
                if side in hands:
                    side = 'R' if side == 'L' else 'L'
                hands[side] = np.round(arr, 1).tolist()
            small = cv2.resize(bgr, (w // 4, h // 4), interpolation=cv2.INTER_AREA).astype(np.int16)
            step = float(np.abs(small - prev).mean()) if prev is not None else None
            prev = small
            yellow, blue = classes(bgr)
            frames.append({'i': index, 't': round(index / fps, 4),
                           'greenTop': [round(float(v), 1) for v in bgr[:c, :c].reshape(-1, 3).mean(0)[::-1]],
                           'greenLow': [round(float(v), 1) for v in bgr[-c:, :c].reshape(-1, 3).mean(0)[::-1]],
                           'step': None if step is None else round(step, 3), 'hands': hands, 'body': body,
                           'cards': blobs(yellow, scale, 'Y') + blobs(blue, scale, 'B')})
            index += 1
    cap.release()
    return {'path': path, 'width': w, 'height': h, 'fps': round(fps, 3), 'frames': frames, 'first': first, 'last': last, 'scale': scale}


def moving_card(frame):
    """The dealt card of a frame: the largest coloured blob outside the shoe window."""
    free = [b for b in frame['cards'] if not b['inShoe']]
    return max(free, key=lambda b: b['area']) if free else None


def still_compare(film_frame, png, frame_info):
    ref = cv2.imread(png)
    if ref is None:
        return None
    a = cv2.resize(film_frame, (BANK_W, BANK_H), interpolation=cv2.INTER_AREA).astype(np.int16)
    b = cv2.resize(ref, (BANK_W, BANK_H), interpolation=cv2.INTER_AREA).astype(np.int16)
    d = np.abs(a - b).max(-1)
    return {'meanDiff': round(float(d.mean()), 2), 'pixelsOver24': int((d > 24).sum()), 'shareOver24': round(float((d > 24).mean()), 4)}


def summarise(film, seats):
    fr = film['frames']
    steps = np.array([f['step'] for f in fr[1:]], dtype=np.float32)
    moving = steps > max(0.15, 0.25 * float(np.median(steps)))
    frozen = [fr[i + 1]['i'] for i in range(len(steps)) if steps[i] < 0.06]
    rel = []
    for i in range(2, len(steps) - 2):
        window = steps[i - 2:i + 3]
        if moving[i - 2:i + 3].all():
            rel.append(abs(steps[i] - window.mean()) / window.mean())
    top = np.array([f['greenTop'] for f in fr]); low = np.array([f['greenLow'] for f in fr])
    jump = np.abs(np.diff(top, axis=0)).max(1)
    s = {'size': [film['width'], film['height']], 'fps': film['fps'], 'frameCount': len(fr), 'seconds': round(len(fr) / film['fps'], 3),
         'bankFormat': film['width'] == BANK_W and film['height'] == BANK_H and abs(film['fps'] - 30) < 0.01,
         'green': {'topFirst': top[0].tolist(), 'topMedian': np.median(top, 0).round(1).tolist(), 'topLast': top[-1].tolist(),
                   'lowMedian': np.median(low, 0).round(1).tolist(), 'topVsLow': round(float(np.abs(np.median(top, 0) - np.median(low, 0)).max()), 1),
                   'drift': round(float(np.abs(top - top[0]).max()), 1), 'largestJump': round(float(jump.max()), 1) if len(jump) else 0,
                   'jumpAtFrame': int(jump.argmax()) + 1 if len(jump) else None},
         'frozenFrames': len(frozen), 'frozenAt': frozen[:40],
         'unevenness': round(float(np.median(rel)), 3) if rel else None,
         'handsFound': {'both': sum(1 for f in fr if len(f['hands']) == 2), 'one': sum(1 for f in fr if len(f['hands']) == 1), 'none': sum(1 for f in fr if not f['hands'])},
         'bodyFound': sum(1 for f in fr if f['body'])}
    # The card: which colours are seen outside the shoe, and when yellow turns to blue.
    seen = [(f['i'], moving_card(f)) for f in fr]
    yellow_frames = [i for i, b in seen if b and b['c'] == 'Y']; blue_frames = [i for i, b in seen if b and b['c'] == 'B']
    s['card'] = {'yellowFrames': len(yellow_frames), 'blueFrames': len(blue_frames), 'noCardFrames': sum(1 for _, b in seen if b is None),
                 'firstYellow': yellow_frames[0] if yellow_frames else None, 'firstBlue': blue_frames[0] if blue_frames else None,
                 'seatedCardFrames': sum(1 for f in fr if any(b['inShoe'] and b['c'] == 'Y' for b in f['cards'])),
                 'largestArea': max((b['area'] for _, b in seen if b), default=0)}
    end_blue = [b for b in fr[-1]['cards'] if b['c'] == 'B' and not b['inShoe']]
    s['card']['blueOnTableAtEnd'] = [{'x': b['x'], 'y': b['y'], 'area': b['area']} for b in end_blue]
    if seats:
        plan = json.load(open(f'{REPO}/placements/default.json', encoding='utf-8'))['targets']
        landing = {}
        for seat in seats:
            key = seat if isinstance(seat, str) else f'P{seat}.C1'      # a whole target name such as P3.C2, or a seat number for its first card
            g = plan[key]['geometry']['native']
            tx, ty = g['u'] * (BANK_W - 1), (1 - g['v']) * (BANK_H - 1)
            near = min(end_blue, key=lambda b: np.hypot(b['x'] - tx, b['y'] - ty), default=None)
            landing[key if isinstance(seat, str) else f'P{seat}'] = None if near is None else {'fromPlan': round(float(np.hypot(near['x'] - tx, near['y'] - ty)), 1), 'area': near['area'],
                                                              'planArea': int(g['width'] * BANK_W * g['height'] * BANK_H)}
        s['landing'] = landing
    return s


def compare(film, ref):
    """Per moment: the same instant in both films. Distances in bank pixels."""
    rf, out = ref['frames'], []
    for f in film['frames']:
        j = min(len(rf) - 1, int(round(f['t'] * ref['fps'])))
        g, row = rf[j], {'i': f['i'], 'ref': j}
        for side in ('L', 'R'):
            if side in f['hands'] and side in g['hands']:
                d = np.linalg.norm(np.array(f['hands'][side]) - np.array(g['hands'][side]), axis=1)
                row['hand' + side] = round(float(d.mean()), 1)
                row['tips' + side] = round(float(d[[4, 8, 12]].mean()), 1)
        if f['body'] and g['body']:
            row['body'] = round(float(np.mean([np.hypot(f['body'][k][0] - g['body'][k][0], f['body'][k][1] - g['body'][k][1]) for k in ('nose', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR')])), 1)
            row['wristL'] = round(float(np.hypot(f['body']['wristL'][0] - g['body']['wristL'][0], f['body']['wristL'][1] - g['body']['wristL'][1])), 1)
        a, b = moving_card(f), moving_card(g)
        if a and b:
            row['card'] = round(float(np.hypot(a['x'] - b['x'], a['y'] - b['y'])), 1)
            row['cardArea'] = round(a['area'] / b['area'], 2)
            row['cardSame'] = a['c'] == b['c']
        elif (a is None) != (b is None):
            row['cardOnlyIn'] = 'film' if a else 'ref'
        out.append(row)
    def stat(key):
        v = np.array([r[key] for r in out if key in r], dtype=np.float32)
        return None if not len(v) else {'n': int(len(v)), 'mean': round(float(v.mean()), 1), 'p95': round(float(np.percentile(v, 95)), 1), 'max': round(float(v.max()), 1)}
    both = [r for r in out if 'cardSame' in r]
    return {'series': out, 'summary': {'handL': stat('handL'), 'tipsL': stat('tipsL'), 'handR': stat('handR'), 'body': stat('body'), 'wristL': stat('wristL'),
                                       'card': stat('card'), 'cardArea': stat('cardArea'),
                                       'cardColourAgrees': round(sum(r['cardSame'] for r in both) / len(both), 3) if both else None,
                                       'cardMissingInFilm': sum(1 for r in out if r.get('cardOnlyIn') == 'ref'),
                                       'cardExtraInFilm': sum(1 for r in out if r.get('cardOnlyIn') == 'film')}}


def main():
    args = sys.argv[1:]
    path, name, outdir = args[:3]
    opt = {args[i]: args[i + 1] for i in range(3, len(args) - 1, 2)}
    seats = [int(v) if v.isdigit() else v for v in opt['--seats'].split(',')] if '--seats' in opt else []
    film = read(path)
    report = {'name': name, 'film': path, 'summary': summarise(film, seats)}
    if '--start' in opt:
        report['summary']['startSeam'] = still_compare(film['first'], opt['--start'], film['frames'][0])
    if '--end' in opt:
        report['summary']['endSeam'] = still_compare(film['last'], opt['--end'], film['frames'][-1])
    if '--ref' in opt:
        ref = read(opt['--ref'])
        c = compare(film, ref)
        report['summary']['againstRef'] = c['summary']
        report['againstRefSeries'] = c['series']
        report['ref'] = {'film': opt['--ref'], 'summary': summarise(ref, [])}
    report['frames'] = film['frames']
    json.dump(report, open(f'{outdir}/{name}.film.json', 'w'))
    print(json.dumps({'name': name, **report['summary']}))


main()
