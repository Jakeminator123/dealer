# Puts the bank's own shoe back into a fitted ready keystone. grundbild.py exchanges "the person", and in a ready pose the
# hand touches the shoe, so the image model's redrawn shoe came along (2-10 px off the bank's). Here every pixel of the
# shoe and its card comes from a plate of the bank's shoe without a hand; only the new dealer's own hand (and the arm behind
# the wrist) is kept on top.
#   python -I skolagning.py <keystone.png> <plate.png> <out.png> [--roots x0,y0,x1,y1]
#   plate    a bank frame of the SAME shoe with no hand on it (rest frame for the window shoe; a mid-deal frame for the
#            open-mouth shoe of position 2)
#   --roots  a box of hair where a mauve cast is taken out (blue brought down to green), as the review found at the parting
import sys, json
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

# The model files are not in Git (tools/python/README.md says where they come from); DEALER_MODELS points elsewhere.
import os
MODELS = os.environ.get('DEALER_MODELS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
HAND = os.path.join(MODELS, 'hand_landmarker.task')
args = sys.argv[1:]
key_p, plate_p, out_p = args[:3]
K, P = cv2.imread(key_p), cv2.imread(plate_p)
h, w = K.shape[:2]


def chroma(bgr):
    b, g, r = [bgr[..., i].astype(np.float32) for i in range(3)]
    return g - np.maximum(r, b)


def is_green(bgr):
    return (chroma(bgr) > 50) & (bgr[..., 1] > 110)


# The plate's shoe: the large non-green part at the right of the picture.
roi = np.zeros((h, w), bool); roi[540:980, 1150:] = True
n, labels, stats, cent = cv2.connectedComponentsWithStats((~is_green(P) & roi).astype(np.uint8), 8)
shoe = labels == (1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])))
zone = cv2.dilate(shoe.astype(np.uint8), np.ones((35, 35), np.uint8)).astype(bool)
zone[500:1010, 1480:] = True                                   # nothing of hers lies right of the shoe's middle: all of it is the plate's

# The new dealer's hand at the shoe: the hand farthest right. Kept: the hand's own outline grown a little, and everything
# behind the wrist (the arm).
image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(K, cv2.COLOR_BGR2RGB)))
opt = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=HAND), num_hands=2, min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3)
with vision.HandLandmarker.create_from_options(opt) as m:
    hands = [np.array([[p.x * w, p.y * h] for p in pts]) for pts in m.detect(image).hand_landmarks]
if not hands:
    sys.exit('no hand found in the keystone')
pts = max(hands, key=lambda a: a[:, 0].mean())
hull = np.zeros((h, w), np.uint8)
cv2.fillConvexPoly(hull, cv2.convexHull(pts.astype(np.int32)), 1)
keep = cv2.dilate(hull, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (33, 33))).astype(bool)
wrist, back = pts[0], pts[0] - pts[9]
back = back / np.linalg.norm(back)
gy, gx = np.mgrid[0:h, 0:w]
along = (gx - wrist[0]) * back[0] + (gy - wrist[1]) * back[1]
across = (gx - wrist[0]) * back[1] - (gy - wrist[1]) * back[0]
band = (along > -45) & (np.abs(across) < 85)                 # the forearm: behind the wrist, as wide as an arm
# Inside the kept region only what is hers stays: skin, nails, ink and their soft edge; shoe-black, card-yellow and green there
# come from the plate as well, so the card she touches is the bank's card.
b, g, r = [K[..., i].astype(np.int16) for i in range(3)]
skin = (r > g + 12) & (r > b + 20) & (g < r * 0.84) & (b > 70)          # the card's yellow and the frame's gold have no blue
skin = cv2.morphologyEx(skin.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
solid = cv2.morphologyEx(skin, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23))).astype(bool)   # ink between skin
hers = keep & cv2.dilate(skin, np.ones((3, 3), np.uint8)).astype(bool)
hers |= band & cv2.dilate(solid.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~is_green(K)
hers |= band & (along > 12) & ~is_green(K)
hers |= band & ~is_green(K) & is_green(P)                                                                    # cuff and sleeve where the plate has only green behind them                                                                   # the sleeve behind the wrist
far = zone & ~is_green(K) & ~cv2.dilate(shoe.astype(np.uint8), np.ones((27, 27), np.uint8)).astype(bool); far[:, 1480:] = False
hers |= far                                                                                                    # hers, clear of the shoe, on the arm's side only
card_px = 0
if '--keep-card' in args:
    # Variant for anchor 2.1 (bestall/paow-ankare-2-1): the card she has drawn a little out of the window is hers as well.
    # The yellow card that the pinching hand touches is kept from the keystone, with a 1 px edge; the rest of the shoe
    # (frame, body, the card behind) still comes from the plate.
    yellow = (r > 170) & (g > 150) & (b < 120) & (np.abs(r - g) < 80)
    nc, lab, st, _ = cv2.connectedComponentsWithStats(yellow.astype(np.uint8), 8)
    touch = cv2.dilate(hull, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))).astype(bool)
    card = np.zeros((h, w), bool)
    for i in range(1, nc):
        if st[i, cv2.CC_STAT_AREA] >= 200 and (touch & (lab == i)).any():
            card |= lab == i
    card = cv2.morphologyEx(card.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    card = cv2.dilate(card, np.ones((3, 3), np.uint8)).astype(bool)
    hers |= card
    card_px = int(card.sum())
alpha = cv2.GaussianBlur(hers.astype(np.float32), (0, 0), 0.8)[..., None]
# The plate's own green (level and soft shoe edge) is exchanged for the keystone's green, pixel by pixel.
ring = zone & ~shoe
gp = np.median(P[ring & is_green(P)].astype(np.float32), axis=0)
pure = cv2.erode(is_green(K).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
weight = cv2.GaussianBlur(pure, (0, 0), 25)[..., None]
gk = np.where(weight > 0.05, cv2.GaussianBlur(K.astype(np.float32) * pure[..., None], (0, 0), 25) / np.maximum(1e-3, weight), np.median(K[pure > 0].astype(np.float32), axis=0))   # far from any clean green: the picture's own median green
share = np.clip(chroma(P) / max(1.0, float(gp[1] - max(gp[0], gp[2]))), 0, 1)[..., None]
plate = P.astype(np.float32) + share * (gk - gp)
mixed = K.astype(np.float32) * alpha + plate * (1 - alpha)
out = np.where(zone[..., None], mixed, K.astype(np.float32))
out = np.clip(out, 0, 255).astype(np.uint8)
if '--roots' in args:
    x0, y0, x1, y1 = map(int, args[args.index('--roots') + 1].split(','))
    box = out[y0:y1, x0:x1].astype(np.int16)
    mauve = (box[..., 0] > box[..., 1]) & (box[..., 2] > box[..., 1]) & (box.max(-1) < 190)
    box[..., 0][mauve] = (box[..., 1][mauve] * 0.94).astype(np.int16)
    out[y0:y1, x0:x1] = np.clip(box, 0, 255).astype(np.uint8)
cv2.imwrite(out_p, out)
d = np.abs(out.astype(np.int16) - P.astype(np.int16)).max(-1)
clean = shoe & ~cv2.dilate(hers.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
print(json.dumps({'keptCardPixels': card_px, 'shoePixels': int(shoe.sum()), 'shoePixelsFromPlate': int(clean.sum()), 'largestDifferenceThere': int(d[clean].max()) if clean.any() else None,
                  'handPixelsKept': int((hers & zone).sum()), 'changedFromKeystone': int((np.abs(out.astype(np.int16) - K.astype(np.int16)).max(-1) > 12).sum())}))
