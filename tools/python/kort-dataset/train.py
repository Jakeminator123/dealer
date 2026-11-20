# Steg 4: en första modell. Ett litet U-nät som ur ett utsnitt (160 x 160) ger kortets hela yta (även under fingrar), en
# värmekarta över hörnen och sidan (rygg, framsida, på högkant). Tränas på skarpa rutor med pålitliga hörn; oskärpan läggs på
# syntetiskt (en rak utsmetning i slumpad riktning och längd), så att facit för en utsmetad ruta är kortet mitt i exponeringen.
# Delningen träning/validering är per film (kolumnen split i rutor.csv, satt per tagning i export.py).
#   python -I train.py [--epochs 8] [--max 45000]       (kör under låset D:/dealer-scratch/tmp/gpu-och-headless.lock)
import os, sys, csv, json, time, math, random
import numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as F
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
CROP = 160
arg = lambda name, default: type(default)(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default

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
    mask = np.zeros((CROP, CROP), np.uint8); heat = np.zeros((CROP, CROP), np.float32)
    if r['side'] == 'EDGE':
        mask = (a > 76).astype(np.uint8); cls = 2
    else:
        q = (np.array([[float(r[f'x{i}']), float(r[f'y{i}'])] for i in range(4)]) - [ox, oy]) * k
        cv2.fillConvexPoly(mask, np.round(q).astype(np.int32), 1); cls = 0 if r['side'] == 'BACK' else 1
        yy, xx = np.mgrid[0:CROP, 0:CROP]
        for x, y in q: heat = np.maximum(heat, np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 2.5 ** 2)))
    return img, mask, (heat * 255).astype(np.uint8), cls

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

def main():
    epochs = arg('--epochs', 8); cap = arg('--max', 45000); bs = 64
    random.seed(1); torch.manual_seed(1); np.random.seed(1)
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
    t0 = time.time(); X, M, H, C = [], [], [], []
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as pool: loaded = list(pool.map(load, pick))  # läsningen från disken är det som tar tid
    for s in loaded:
        if s is None: continue
        X.append(s[0]); M.append(s[1]); H.append(s[2]); C.append(s[3])
    X = torch.from_numpy(np.stack(X)); M = torch.from_numpy(np.stack(M)); H = torch.from_numpy(np.stack(H)); C = torch.tensor(C)
    print('inläst', X.shape, f'{time.time() - t0:.0f} s', flush=True)
    dev = 'cuda'; torch.backends.cudnn.benchmark = True; net = Net().to(dev).to(memory_format=torch.channels_last)
    X, M, H, C = X.to(dev), M.to(dev), H.to(dev), C.to(dev)  # hela mängden ryms på grafikkortet (under 1 GB)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4); steps = epochs * (len(X) // bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps, pct_start=0.15); scaler = torch.amp.GradScaler('cuda'); step = 0
    for ep in range(epochs):
        net.train(); perm = torch.randperm(len(X), device=dev); tl = 0; n = 0; te = time.time()
        for i in range(0, len(X) - bs + 1, bs):
            idx = perm[i:i + bs]
            img = X[idx].permute(0, 3, 1, 2).float().div(255)[:, [2, 1, 0]]; mask = M[idx].float(); heat = H[idx].float().div(255); cls = C[idx]
            img, mask, heat = augment(img, mask, heat)
            with torch.autocast('cuda', dtype=torch.float16):
                out, c = net(img.contiguous(memory_format=torch.channels_last))
            out = out.float(); c = c.float()
            pm = torch.sigmoid(out[:, 0]); dice = 1 - (2 * (pm * mask).sum((1, 2)) + 1) / (pm.sum((1, 2)) + mask.sum((1, 2)) + 1)
            loss = F.binary_cross_entropy_with_logits(out[:, 0], mask) + dice.mean() + 8 * F.mse_loss(torch.sigmoid(out[:, 1]), heat) * 10 + 0.3 * F.cross_entropy(c, cls)
            opt.zero_grad(set_to_none=True); scaler.scale(loss).backward(); scaler.step(opt); scaler.update(); sched.step(); step += 1
            tl += loss.detach(); n += 1
        print(f'epok {ep + 1}/{epochs} förlust {float(tl) / max(1, n):.4f} {time.time() - t0:.0f} s ({(time.time() - te) / max(1, n):.2f} s per sats)', flush=True)
        torch.save({'net': net.state_dict(), 'crop': CROP, 'epoch': ep + 1, 'samples': len(X)}, os.path.join(BASE, 'modell-v1.pt'))
    print('klart', f'{time.time() - t0:.0f} s')

if __name__ == '__main__':
    main()
