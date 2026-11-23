# Steg 4: modellen. Ett litet U-nät som ur ett utsnitt (160 x 160) ger kortets hela yta (även under fingrar), en
# värmekarta över hörnen och sidan (rygg, framsida, på högkant). Tränas på skarpa rutor med pålitliga hörn; oskärpan läggs på
# syntetiskt (en rak utsmetning i slumpad riktning och längd), så att facit för en utsmetad ruta är kortet mitt i exponeringen.
# Version 2 (Jakob 2026-11-23: "vi provar en v2") ritar dessutom i träningsbilden det som kan avvika på filmens kort, med facit
# orört: märket på den blå sidan (rosa kryss och röd prick), tryck på kortet och fingrar över det (variants nedan).
# Delningen träning/validering är per film (kolumnen split i rutor.csv, satt per tagning i export.py).
#   python -I train.py [--version 2] [--epochs 16] [--max 45000]    (tar själv det delade låset för grafikkortet, LOCK nedan)
#   python -I train.py --titta <fil.jpg>                             (48 träningsbilder som version 2 ritar dem, för ögat; inget grafikkort)
import os, sys, csv, json, time, math, random
import numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import label
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
CROP = 160
arg = lambda name, default: type(default)(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default

# Det delade låset för grafikkortet och headless Chrome: samma fil, rad och regel som tools/lab-look.ts (ett lås äldre än 20
# minuter räknas som övergivet, så en lång körning rör vid det under tiden: keep_lock).
LOCK = r'D:\dealer-scratch\tmp\gpu-och-headless.lock'; STALE = 20 * 60
def lock_text():
    try: return open(LOCK, encoding='utf-8').read().strip()
    except OSError: return None
def take_lock(what, minutes, wait=STALE):
    line = f"kortmodell {time.strftime('%Y-%m-%d %H:%M', time.gmtime())}: {what}, {minutes} min (python pid {os.getpid()})"; until = time.time() + wait; said = False
    while True:
        try: age = time.time() - os.path.getmtime(LOCK)
        except OSError: age = None
        if age is None or age > STALE:
            try:
                with open(LOCK, 'x' if age is None else 'w', encoding='utf-8') as f: f.write(line + '\n')
            except FileExistsError: continue
            if lock_text() == line: print('lås taget', time.strftime('%H:%M:%S'), flush=True); return line
        elif time.time() >= until: raise SystemExit(f'LÅST: {lock_text()}')
        elif not said: print('väntar på låset:', lock_text(), flush=True); said = True
        time.sleep(5)
def keep_lock(line):
    if lock_text() == line: os.utime(LOCK)
def release_lock(line):
    mine = lock_text() == line
    if mine: os.remove(LOCK)
    print('lås släppt' if mine else 'låset är inte längre mitt; det lämnas', time.strftime('%H:%M:%S'), flush=True)

def rows_for(split, want):
    out = []
    with open(os.path.join(BASE, 'rutor.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['split'] != split or not r['crop_k']: continue
            if want(r): out.append(r)
    return out

def reliable(r):
    """Träningsfacit: skarp ruta med fyrhörning där minst tre hörn syns, eller en strimma (på högkant)."""
    if r['side'] == 'EDGE': return r['ex0'] != ''
    return r['x0'] != '' and int(r['nvis'] or 0) >= 3 and float(r['blur_over']) <= 1.5 and int(r['smeared']) == 0 and float(r['cover'] or 0) < 0.5

def load(r):
    d = os.path.join(BASE, 'crops', r['key']); name = f"{int(r['frame']):04d}_{r['id']}"
    img = cv2.imread(os.path.join(d, name + '.jpg')); a = cv2.imread(os.path.join(d, name + '_a.png'), cv2.IMREAD_GRAYSCALE)
    if img is None or a is None: return None
    ox, oy, k = float(r['crop_x']), float(r['crop_y']), float(r['crop_k'])
    mask = np.zeros((CROP, CROP), np.uint8); heat = np.zeros((CROP, CROP), np.float32); q = None
    if r['side'] == 'EDGE':
        mask = (a > 76).astype(np.uint8); cls = 2
    else:
        q = (np.array([[float(r[f'x{i}']), float(r[f'y{i}'])] for i in range(4)]) - [ox, oy]) * k
        cv2.fillConvexPoly(mask, np.round(q).astype(np.int32), 1); cls = 0 if r['side'] == 'BACK' else 1
        for x, y in q: stamp(heat, x, y)
    return img, mask, (heat * 255).astype(np.uint8), cls, q

def stamp(heat, x, y, reach=9):
    """Hörnets klocka (sigma 2,5) i värmekartan, räknad bara där den är mer än ett steg av 255 (inom nio bildpunkter)."""
    # Räknad över hela utsnittet går exponenten långt under vad ett flyttal rymmer, och det kostade 30 ms per utsnitt (2026-11-23).
    x0, x1, y0, y1 = max(0, int(x) - reach), min(CROP, int(x) + reach + 2), max(0, int(y) - reach), min(CROP, int(y) + reach + 2)
    if x1 <= x0 or y1 <= y0: return
    gx = np.exp(-(np.arange(x0, x1) - x) ** 2 / (2 * 2.5 ** 2)); gy = np.exp(-(np.arange(y0, y1) - y) ** 2 / (2 * 2.5 ** 2))
    np.maximum(heat[y0:y1, x0:x1], np.outer(gy, gx), out=heat[y0:y1, x0:x1])

# ---- version 2: det som kan avvika på filmens kort, ritat i träningsbilden (BGR, utsnittets bildpunkter) ----
# Märkets färger och mått är CARD_RGB och CARD_MARK i src/placement-model.ts (andelar av kortets bredd; kortet är 88/63 långt).
LONG = 88 / 63
MARK = {'cross': (200, 120, 255), 'dot': (35, 30, 225), 'face': 218, 'arm': 0.17, 'stroke': 0.07, 'radius': 0.075, 'inset': 0.2}

def card_map(q):
    """Kortets egna mått (bredd 1, längd 88/63) till utsnittets bildpunkter; fyrhörningens kortare första sida är kortsidan."""
    q = np.asarray(q, np.float32)
    if np.hypot(*(q[1] - q[0])) > np.hypot(*(q[2] - q[1])): q = np.roll(q, -1, axis=0)
    h = cv2.getPerspectiveTransform(np.array([[0, 0], [1, 0], [1, LONG], [0, LONG]], np.float32), q)
    return lambda pts: cv2.perspectiveTransform(np.asarray(pts, np.float32).reshape(-1, 1, 2), h).reshape(-1, 2)

def poly(layer, pts, colour):
    # en fyrhörning som nästan är en linje kastar sina punkter långt utanför bilden (perspektivet går genom oändligheten), och en
    # sådan yta tar minuter att fylla: den ritas inte
    pts = np.asarray(pts, np.float64)
    if np.isfinite(pts).all() and np.abs(pts - CROP / 2).max() < 2.5 * CROP: cv2.fillPoly(layer, [np.round(pts * 16).astype(np.int32)], colour, lineType=cv2.LINE_AA, shift=4)
def ring(x, y, r, n=20, turn=0.0): return [[x + r * math.cos(turn + i * 2 * math.pi / n), y + r * math.sin(turn + i * 2 * math.pi / n)] for i in range(n)]

def on_card(img, q, cls):
    """Där kortets egen färg syns inom fyrhörningen: fingrar över kortet ligger kvar ovanpå det som ritas."""
    yel, sha, blu, _, _ = label.cls_masks(img); inside = np.zeros(img.shape[:2], np.uint8); cv2.fillConvexPoly(inside, np.round(q).astype(np.int32), 1)
    return (blu if cls == 1 else (yel | sha)) & (inside > 0)

def lay(img, layer, where):
    a = cv2.GaussianBlur(where.astype(np.float32), (3, 3), 0.6)[..., None]
    return (img * (1 - a) + cv2.GaussianBlur(layer, (3, 3), 0.6) * a + 0.5).astype(np.uint8)

def draw_mark(img, q, rnd):
    """Krysset mitt på den blå sidan och pricken i ett hörn. Filmerna ritar krysset upp till flera gånger för stort (BRISTER, "Kortet")."""
    where = on_card(img, q, 1)
    if where.sum() < 40: return img
    at = card_map(q); shade = float(np.clip(img[..., 0][where].mean() / MARK['face'], 0.55, 1.15)); layer = img.copy()
    tone = lambda c: tuple(float(np.clip(v * shade * rnd.uniform(0.9, 1.1), 0, 255)) for v in c)
    if rnd.random() < 0.9:
        s = 1.0 if rnd.random() < 0.4 else rnd.uniform(1, 4); a = MARK['arm'] * s * math.sqrt(0.5); k = MARK['stroke'] * s ** 0.7 / 2 * math.sqrt(0.5); cx, cy = 0.5, LONG / 2; colour = tone(MARK['cross'])
        for d in (1, -1): poly(layer, at([[cx - a * d - k * d, cy - a + k], [cx - a * d + k * d, cy - a - k], [cx + a * d + k * d, cy + a - k], [cx + a * d - k * d, cy + a + k]]), colour)
    if rnd.random() < 0.85:
        x = MARK['inset'] if rnd.random() < 0.5 else 1 - MARK['inset']; y = MARK['inset'] if rnd.random() < 0.5 else LONG - MARK['inset']
        poly(layer, at(ring(x, y, MARK['radius'] * rnd.uniform(0.8, 2.5))), tone(MARK['dot']))
    return lay(img, layer, where)

def draw_print(img, q, cls, rnd):
    """Ett kort som filmen har gett tryck: papper med figurer innanför en kant i kortets färg, eller ränder i en annan ton av färgen."""
    where = on_card(img, q, cls)
    if where.sum() < 40: return img
    at = card_map(q); layer = img.copy(); mean = img[where].mean(0)
    if rnd.random() < 0.5:
        e = rnd.uniform(0.05, 0.14); paper = float(np.clip(mean.max() * rnd.uniform(0.95, 1.25), 120, 250))
        poly(layer, at([[e, e], [1 - e, e], [1 - e, LONG - e], [e, LONG - e]]), (paper * rnd.uniform(0.92, 1), paper * rnd.uniform(0.95, 1), paper))
        for _ in range(rnd.randint(1, 6)):
            poly(layer, at(ring(rnd.uniform(0.2, 0.8), rnd.uniform(0.2, LONG - 0.2), rnd.uniform(0.04, 0.13), rnd.choice((4, 8)), rnd.uniform(0, 1))), (30, 30, 200) if rnd.random() < 0.5 else (35, 35, 35))
    else:
        n = rnd.randint(3, 9); tone = tuple(float(np.clip(v * rnd.uniform(0.55, 1.35), 0, 255)) for v in mean); half = rnd.uniform(0.25, 0.6) * LONG / (2 * n)
        for i in range(n):
            y = LONG * (i + 0.5) / n; poly(layer, at([[0.08, y - half], [0.92, y - half], [0.92, y + half], [0.08, y + half]]), tone)
    return lay(img, layer, where)

def draw_fingers(img, q, rnd):
    """Ett till tre fingrar in över kortet från ett håll, i bildens egen hudfärg där den finns. Facit är kortet under dem."""
    skin = label.cls_masks(img)[4]; base = np.median(img[skin], axis=0) if skin.sum() > 60 else np.array([rnd.uniform(105, 150), rnd.uniform(130, 175), rnd.uniform(185, 230)])
    c = q.mean(0); w = max(6.0, min(float(np.hypot(*(q[(i + 1) % 4] - q[i]))) for i in range(4))); ang = rnd.uniform(0, 2 * math.pi); d = np.array([math.cos(ang), math.sin(ang)]); across = np.array([-d[1], d[0]])
    n = rnd.randint(1, 3); thick = w * rnd.uniform(0.2, 0.32); layer = img.copy(); cover = np.zeros(img.shape[:2], np.uint8); P = lambda p: (int(round(p[0] * 16)), int(round(p[1] * 16)))
    for i in range(n):
        tip = c + d * w * rnd.uniform(0.05, 0.55) + across * (i - (n - 1) / 2) * thick * rnd.uniform(1.05, 1.3); start = tip + d * CROP * 1.5 + across * rnd.uniform(-0.3, 0.3) * CROP
        colour = tuple(float(np.clip(v * rnd.uniform(0.82, 1.1), 0, 255)) for v in base); t = max(1, int(round(thick)))
        cv2.line(layer, P(start), P(tip), tuple(v * 0.8 for v in colour), t + 2, cv2.LINE_AA, 4); cv2.line(layer, P(start), P(tip), colour, t, cv2.LINE_AA, 4); cv2.line(cover, P(start), P(tip), 1, t + 2, cv2.LINE_8, 4)
    return lay(img, layer, cover > 0)

def variants(img, q, cls, rnd):
    """Version 2:s ritade avvikelser i en träningsbild; kortets yta, hörn och sida (facit) rörs inte. q None: ett kort på högkant, orört."""
    if q is None: return img
    if cls == 1 and rnd.random() < 0.5: img = draw_mark(img, q, rnd)
    elif rnd.random() < 0.12: img = draw_print(img, q, cls, rnd)
    if rnd.random() < 0.4: img = draw_fingers(img, q, rnd)
    return img

class Block(nn.Module):
    def __init__(s, i, o):
        super().__init__(); s.c = nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.SiLU(inplace=True), nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.SiLU(inplace=True))
    def forward(s, x): return s.c(x)

class Net(nn.Module):
    def __init__(s, w=(24, 48, 96, 160, 224)):
        super().__init__()
        s.e = nn.ModuleList([Block(3 if i == 0 else w[i - 1], w[i]) for i in range(5)])
        s.d = nn.ModuleList([Block(w[i] + w[i + 1], w[i]) for i in range(4)])
        s.out = nn.Conv2d(w[0], 2, 1); s.cls = nn.Linear(w[4], 3)
    def forward(s, x):
        f = []
        for i, e in enumerate(s.e):
            x = e(x if i == 0 else F.max_pool2d(x, 2)); f.append(x)
        c = s.cls(f[4].mean((2, 3))); y = f[4]
        for i in range(3, -1, -1): y = s.d[i](torch.cat([F.interpolate(y, size=f[i].shape[2:], mode='bilinear', align_corners=False), f[i]], 1))
        return s.out(y), c

def smear(x, max_len=34, p=0.65):
    """En rak utsmetning per bild: kärnan är en linje med slumpad längd (i utsnittets bildpunkter) och riktning."""
    # Medelvärdet av bilden förskjuten längs en linje (15 lägen), i stället för en faltning med en kärna per bild: en gruppvis
    # faltning med 35 x 35 tog 0,7 s per sats på grafikkortet.
    B, _, H, W = x.shape; dev = x.device; taps = 15
    L = torch.where(torch.rand(B, device=dev) < p, torch.empty(B, device=dev).uniform_(3, max_len), torch.zeros(B, device=dev)); ang = torch.rand(B, device=dev) * math.pi
    step = torch.stack([L * torch.cos(ang) * 2 / W, L * torch.sin(ang) * 2 / H], 1).view(B, 1, 1, 2)
    base = F.affine_grid(torch.eye(2, 3, device=dev).unsqueeze(0).expand(B, 2, 3), list(x.shape), align_corners=False); out = torch.zeros_like(x)
    for t in torch.linspace(-0.5, 0.5, taps).tolist(): out += F.grid_sample(x, base + step * t, mode='bilinear', padding_mode='border', align_corners=False)
    return out / taps

def augment(img, mask, heat):
    """Spegling och kvartsvarv (lika för bild och facit), ljus och färg (bara bilden), utsmetning (bara bilden)."""
    if random.random() < 0.5: img, mask, heat = img.flip(3), mask.flip(2), heat.flip(2)
    k = random.randint(0, 3)
    if k: img, mask, heat = img.rot90(k, (2, 3)), mask.rot90(k, (1, 2)), heat.rot90(k, (1, 2))
    B = img.shape[0]
    gain = torch.empty(B, 1, 1, 1, device=img.device).uniform_(0.75, 1.2); tint = torch.empty(B, 3, 1, 1, device=img.device).uniform_(0.93, 1.07)
    img = (img * gain * tint).clamp(0, 1)
    img = smear(img)
    img = (img + torch.randn_like(img) * 0.012).clamp(0, 1)
    return img, mask, heat

def pick_rows(cap):
    rows = rows_for('train', reliable); random.shuffle(rows)
    # jämnt över filmerna: högst 60 utsnitt per film i första hand
    by = {}
    for r in rows: by.setdefault(r['key'], []).append(r)
    # kort i rörelse först (ett stilla kort i skon ger samma utsnitt i varje ruta: högst 24 sådana per film; de har utsnitt var tolfte ruta)
    pick, rest = [], []
    for v in by.values():
        mv = [r for r in v if r['role'] == 'moving']; st = [r for r in v if r['role'] != 'moving'][:24]
        pick += mv[:60] + st; rest += mv[60:]
    random.shuffle(pick); random.shuffle(rest); pick = (pick + rest)[:cap]
    print('träningsfilmer', len(by), 'utsnitt', len(pick), 'varav strimmor', sum(r['side'] == 'EDGE' for r in pick), flush=True)
    return pick

def read(rows):
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as pool: loaded = list(pool.map(load, rows))  # läsningen från disken är det som tar tid
    return [s for s in loaded if s is not None]

def look(out):
    """Träningsbilderna som version 2 ritar dem, 48 i ett ark: för ögat, före en körning."""
    random.seed(1); rnd = random.Random(3); rows = [r for r in rows_for('train', reliable) if r['role'] == 'moving']; random.shuffle(rows)
    cells = [variants(s[0], s[4], s[3], rnd) for s in read(rows[:48])]
    cv2.imwrite(out, np.vstack([np.hstack(cells[i:i + 8]) for i in range(0, 48, 8)])); print('skrev', out)

def main():
    version = arg('--version', 2); epochs = arg('--epochs', 16 if version >= 2 else 8); cap = arg('--max', 45000); bs = 64
    random.seed(1); torch.manual_seed(1); np.random.seed(1); rnd = random.Random(2)
    t0 = time.time(); data = read(pick_rows(cap))
    X = np.stack([s[0] for s in data]); Q = [s[4] for s in data]; sides = [s[3] for s in data]
    print('inläst', X.shape, f'{time.time() - t0:.0f} s', flush=True)
    what = f'tränar kortmodell v{version}'; lock = take_lock(what, 45)
    try:
        dev = 'cuda'; torch.backends.cudnn.benchmark = True; net = Net().to(dev).to(memory_format=torch.channels_last)
        M = torch.from_numpy(np.stack([s[1] for s in data])).to(dev); H = torch.from_numpy(np.stack([s[2] for s in data])).to(dev); C = torch.tensor(sides).to(dev)
        del data  # listan med tusentals små fält gör varje bild som sedan ritas långsam (uppmätt på 6 000 utsnitt: 27 ms mot 1,5 ms)
        opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4); steps = epochs * (len(X) // bs)
        sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps, pct_start=0.15); scaler = torch.amp.GradScaler('cuda')
        for ep in range(epochs):
            net.train(); perm = np.random.permutation(len(X)); tl = 0; n = 0; te = time.time()
            for i in range(0, len(X) - bs + 1, bs):
                idx = perm[i:i + bs]; at = torch.from_numpy(idx).to(dev)
                batch = np.stack([variants(X[j], Q[j], sides[j], rnd) for j in idx]) if version >= 2 else X[idx]  # bilderna ligger i minnet, så att avvikelserna kan ritas per sats
                img = torch.from_numpy(batch).to(dev).permute(0, 3, 1, 2).float().div(255)[:, [2, 1, 0]]; mask = M[at].float(); heat = H[at].float().div(255); cls = C[at]
                img, mask, heat = augment(img, mask, heat)
                with torch.autocast('cuda', dtype=torch.float16):
                    out, c = net(img.contiguous(memory_format=torch.channels_last))
                out = out.float(); c = c.float()
                pm = torch.sigmoid(out[:, 0]); dice = 1 - (2 * (pm * mask).sum((1, 2)) + 1) / (pm.sum((1, 2)) + mask.sum((1, 2)) + 1)
                loss = F.binary_cross_entropy_with_logits(out[:, 0], mask) + dice.mean() + 8 * F.mse_loss(torch.sigmoid(out[:, 1]), heat) * 10 + 0.3 * F.cross_entropy(c, cls)
                opt.zero_grad(set_to_none=True); scaler.scale(loss).backward(); scaler.step(opt); scaler.update(); sched.step()
                tl += loss.detach(); n += 1
                if n % 40 == 0: keep_lock(lock)
            print(f'epok {ep + 1}/{epochs} förlust {float(tl) / max(1, n):.4f} {time.time() - t0:.0f} s ({(time.time() - te) / max(1, n):.2f} s per sats)', flush=True)
            torch.save({'net': net.state_dict(), 'crop': CROP, 'epoch': ep + 1, 'samples': len(X), 'version': version}, os.path.join(BASE, f'modell-v{version}.pt'))
            # mellan epokerna lämnas låset en stund, så att en kort körning som väntar (headless Chrome) kommer emellan
            if ep + 1 < epochs: release_lock(lock); time.sleep(12); lock = take_lock(what, 45, wait=3600)
    finally: release_lock(lock)
    print('klart', f'{time.time() - t0:.0f} s')

if __name__ == '__main__':
    look(arg('--titta', '')) if '--titta' in sys.argv else main()
