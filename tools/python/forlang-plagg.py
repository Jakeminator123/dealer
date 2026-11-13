# Lengthens a light garment downwards in a fitted keystone picture so that the body ends at the table's back edge,
# as the reference dealer's does. The image model cuts the new dealer's top some 40 rows too high, which would leave a
# strip of keyed-out green (the room showing through) between her waist and the table in the scene.
#   python -I forlang-plagg.py <fitted-final.png> <out.png> [--cut 832] [--from 640]
# The garment (the largest near-white part of the person, with its own shaded hem) is stretched evenly from row --from
# down to the cut row and laid as a layer behind the arms and hands. Arms and hands are not touched; where one of their
# pixels was a mix of skin and green, only its green share is exchanged for the garment, so no green fringe is left.
# The cut copies the reference's edge: full to row cut-1, 0.55 at cut, 0.2 on the row below.
import sys, json
import numpy as np, cv2


def chroma(bgr):
    b, g, r = [bgr[..., i].astype(np.float32) for i in range(3)]
    return g - np.maximum(r, b)


def is_green(bgr):
    return (chroma(bgr) > 50) & (bgr[..., 1] > 110)


def largest(mask, where=None):
    n, labels, stats, cent = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    best, area = None, 0
    for i in range(1, n):
        if where is not None and not where(cent[i], stats[i]):
            continue
        if stats[i, cv2.CC_STAT_AREA] > area:
            best, area = i, stats[i, cv2.CC_STAT_AREA]
    return labels == best


def field(bgr, mask):
    h, w = bgr.shape[:2]
    ys, xs = np.nonzero(cv2.erode(mask.astype(np.uint8), np.ones((9, 9), np.uint8)))
    ys, xs = ys[::7], xs[::7]
    def basis(x, y):
        x, y = x / w, y / h
        return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1)
    a = basis(xs.astype(np.float32), ys.astype(np.float32))
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    full = basis(gx, gy)
    out = np.zeros((h, w, 3), np.float32)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(a, bgr[ys, xs, c].astype(np.float32), rcond=None)
        out[..., c] = full @ coef
    return out


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


args = sys.argv[1:]
src_path, out_path = args[0], args[1]
cut = int(args[args.index('--cut') + 1]) if '--cut' in args else 832
y0 = int(args[args.index('--from') + 1]) if '--from' in args else 640

img = cv2.imread(src_path)
h, w = img.shape[:2]
colour = img.astype(np.float32)
green = is_green(img)
person = largest(~green, lambda c, s: 0.30 * w < c[0] < 0.70 * w)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
garment = largest(person & (hsv[..., 1] < 46) & (hsv[..., 2] > 140))
# Its shaded hem and corners are darker than the cloth: take the neutral pixels below the bust that hang together with it.
band = np.zeros((h, w), bool)
band[y0 + 40:] = True
neutral = person & band & (hsv[..., 1] < 70) & (hsv[..., 2] > 40)
n, labels = cv2.connectedComponents((neutral | (garment & band)).astype(np.uint8), connectivity=8)
keep = np.unique(labels[garment & band])
garment = garment | np.isin(labels, keep[keep > 0])
garment = cv2.morphologyEx(garment.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool) & person
garment = cv2.morphologyEx(garment.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)

# Where the cloth ends today, column by column, in its middle part.
cloth = person & (hsv[..., 1] < 46) & (hsv[..., 2] > 140) & garment
cols = np.nonzero(cloth[y0:].any(0))[0]
mid = cols[(cols > np.percentile(cols, 30)) & (cols < np.percentile(cols, 70))]
hem = np.array([np.nonzero(cloth[:, x])[0].max() for x in mid])
hem_src = float(np.percentile(hem, 5)) - 2.5

# The garment as its own layer: colour carried a little outside its edge, and a soft edge.
known = cv2.erode(garment.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2).astype(np.float32)
layer = colour * known[..., None]
for _ in range(18):
    s = cv2.blur(layer, (3, 3)) * 9
    c = cv2.blur(known, (3, 3)) * 9
    grow = (c > 0.5) & (known < 0.5)
    layer[grow] = s[grow] / c[grow][:, None]
    known[grow] = 1
alpha = cv2.GaussianBlur(garment.astype(np.float32), (0, 0), 0.7)

rows = np.arange(h, dtype=np.float32)
k = (hem_src - y0) / (cut + 0.5 - y0)
src_row = np.where(rows >= y0, y0 + (rows - y0) * k, rows).astype(np.float32)
map_x = np.tile(np.arange(w, dtype=np.float32), (h, 1))
map_y = np.tile(src_row[:, None], (1, w))
layer_new = cv2.remap(layer, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
alpha_new = cv2.remap(alpha, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
edge = np.ones(h, np.float32)
edge[cut], edge[cut + 1], edge[cut + 2:] = 0.55, 0.2, 0
a3 = (alpha_new * edge[:, None])[..., None]

g = field(img, green)
cg = np.maximum(1, g[..., 1] - np.maximum(g[..., 0], g[..., 2]))
share = np.clip(chroma(img) / cg, 0, 1)                         # the pixel's green share, if what it is mixed with is neutral
# Skin is far from neutral (red above green), so along the arms and hands the share is counted from the skin's own level,
# taken from the arm just inside the edge.
# Arm and hand: skin (red above green and blue) or tattoo ink and shadow (dark). A light, greenish pixel beside the garment is
# the garment's own old edge, not arm.
warm = (colour[..., 2] > colour[..., 1] + 12) & (colour[..., 2] > colour[..., 0] + 20)
arm = person & ~garment & (warm | (hsv[..., 2] < 150))
inside = cv2.erode(arm.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
level = cv2.GaussianBlur(chroma(img) * inside, (0, 0), 3) / np.maximum(1e-3, cv2.GaussianBlur(inside, (0, 0), 3))
rim = cv2.dilate(arm.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~garment & (cv2.GaussianBlur(inside, (0, 0), 3) > 0.05)   # both sides of the arm's edge
share = np.where(rim, np.clip((chroma(img) - level) / np.maximum(1, cg - level), 0, 1), share)
u = smooth(share, 0.70, 0.90)[..., None]
unmixed = colour + share[..., None] * a3 * (layer_new - g)      # a mix of skin and green: only the green share becomes garment
plain = colour * (1 - a3) + layer_new * a3                      # background: the garment laid over it
other = unmixed * (1 - u) + plain * u
relaid = g * (1 - a3) + layer_new * a3                          # where the old garment was: the green field, then the new garment
near = cv2.dilate(garment.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & ~arm
old = np.maximum(cv2.GaussianBlur(garment.astype(np.float32), (0, 0), 0.7), near.astype(np.float32))[..., None]   # the old garment and its whole edge are laid anew
new = relaid * old + other * (1 - old)

t = smooth(rows, y0, y0 + 24)[:, None, None]
out = np.clip(colour * (1 - t) + new * t, 0, 255).astype(np.uint8)
cv2.imwrite(out_path, out)

# Between the hands only the body can be the lowest thing: that is the row the reference's body ends on.
person_out = largest(~is_green(out), lambda c, s: 0.30 * w < c[0] < 0.70 * w)
free = [x for x in mid if not (person & ~garment)[cut - 60:cut + 60, x].any()]
low = [int(np.nonzero(person_out[:, x])[0].max()) for x in free]
print(json.dumps({'from': y0, 'cut': cut, 'hemBefore': [int(hem.min()), int(np.median(hem)), int(hem.max())], 'stretch': round(1 / k, 3),
                  'bodyEndsAtRow': {'median': float(np.median(low)), 'min': int(min(low)), 'max': int(max(low)), 'columns': len(low)} if low else None,
                  'changedPixelsAboveFrom': int((out[:y0] != img[:y0]).any(-1).sum())}))
