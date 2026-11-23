# Steg 5, modellens mätning per film: kortets fyra hörn och sida ur kortmodellen, i varje ruta där etiketteraren har ett utsnitt.
#   python -I spar_modell.py [--modell 2] [--klipp a,b,c] [--om]      (tar själv det delade låset för grafikkortet, train.LOCK)
# Klippen är de som har dagens kortspår (assets/tracking/<klipp>/card-track.json). Finns filmen i datasetet med samma antal
# rutor (manifest.jsonl, labels/, crops/) läses etiketten och utsnitten därifrån; annars etiketteras filmen här
# (label.label_film på assets/motions/<klipp>/source.mp4, utsnitt i modell-v<n>/utsnitt/<klipp>/). --om gör om klipp som finns.
# Skriver BASE/modell-v<n>/<klipp>.json.gz: etikettens kort per ruta (utan kontur), och på varje kort med utsnitt 'm':
# modellens sida, fyrhörning i filmens bildpunkter (null på högkant eller utan form) och hur säker masken är (p).
# spar_modell.ts gör spåret av det. Modellen hittar inte kortet själv: etiketterarens färgregel säger var utsnittet tas.
import os, sys, json, gzip, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, cv2, torch
import label, train, eval as ev
REPO, BASE = ev.REPO, train.BASE; SIDE = {0: 'BACK', 1: 'FRONT', 2: 'EDGE'}; KEEP = ('id', 'side', 'colour', 'cx', 'cy', 'area', 'len', 'thick', 'blur', 'quad', 'vis', 'edge', 'cover', 'moving', 'smeared', 'crop')

def main():
    version = train.arg('--modell', 2); only = [c for c in train.arg('--klipp', '').split(',') if c]; out = os.path.join(BASE, f'modell-v{version}'); os.makedirs(out, exist_ok=True)
    man = {}
    for l in open(os.path.join(BASE, 'manifest.jsonl'), encoding='utf-8'):
        m = json.loads(l)
        if m.get('clip'): man.setdefault(m['clip'], []).append(m)
    tracking = os.path.join(REPO, 'assets', 'tracking'); jobs = []; skipped = []
    for clip in sorted(os.listdir(tracking)):
        tp = os.path.join(tracking, clip, 'card-track.json'); dst = os.path.join(out, clip + '.json.gz')
        if not os.path.exists(tp) or (only and clip not in only) or (os.path.exists(dst) and '--om' not in sys.argv): continue
        n = len(json.load(open(tp, encoding='utf-8'))['frames'])
        row = next((m for m in man.get(clip, []) if m['frames'] == n and os.path.exists(os.path.join(BASE, 'labels', m['key'] + '.json.gz')) and os.path.isdir(os.path.join(BASE, 'crops', m['key']))), None)
        if row:
            lab = json.load(gzip.open(os.path.join(BASE, 'labels', row['key'] + '.json.gz'), 'rt', encoding='utf-8'))
            jobs.append((clip, lab['film'], lab['frames'], os.path.join(BASE, 'crops', row['key']), 'datasetet', dst)); continue
        film = os.path.join(REPO, 'assets', 'motions', clip, 'source.mp4')
        if not os.path.exists(film): skipped.append(clip); continue
        crops = os.path.join(out, 'utsnitt', clip); t = time.time(); meta, frames = label.label_film(film, sha=False, crop_dir=crops)
        if meta['frames'] != n: print(clip, 'filmen har', meta['frames'], 'rutor men spåret', n, '- hoppas över', flush=True); skipped.append(clip); continue
        print(clip, 'etiketterad här:', meta['frames'], 'rutor på', round(time.time() - t), 's', flush=True)
        jobs.append((clip, meta, frames, crops, 'etiketterad här', dst))
    if skipped: print('utan film att läsa:', ' '.join(skipped), flush=True)
    if not jobs: print('inget att göra'); return
    lock = train.take_lock(f'kortmodell v{version} på {len(jobs)} filmer', 5)
    try:
        ck = torch.load(os.path.join(BASE, f'modell-v{version}.pt'), map_location='cuda'); net = train.Net().cuda().to(memory_format=torch.channels_last); net.load_state_dict(ck['net']); net.eval()
        for clip, meta, frames, crops, source, dst in jobs:
            cards = [(fr['f'], c) for fr in frames for c in fr['cards'] if c['side'] != 'PIECE' and c.get('crop')]
            imgs = [cv2.imread(os.path.join(crops, f"{f:04d}_{c['id']}.jpg")) for f, c in cards]; ok = [j for j, im in enumerate(imgs) if im is not None]
            got = {}
            if ok:
                pm, ph, pc = ev.predict(net, [imgs[j] for j in ok])
                for n_, j in enumerate(ok):
                    f, c = cards[j]; ox, oy, k = c['crop']; q = ev.quad_from(pm[n_], ph[n_]) if pc[n_] != 2 else None; on = pm[n_] > 0.5
                    got[(f, c['id'])] = {'side': SIDE[int(pc[n_])], 'quad': [[round(float(x) / k + ox, 2), round(float(y) / k + oy, 2)] for x, y in q] if q is not None else None, 'p': round(float(pm[n_][on].mean()), 3) if on.any() else 0.0}
            rows = []
            for fr in frames:
                row = []
                for c in fr['cards']:
                    if c['side'] == 'PIECE': continue
                    d = {k: c[k] for k in KEEP if k in c}; m = got.get((fr['f'], c['id']))
                    if m: d['m'] = m
                    row.append(d)
                rows.append({'f': fr['f'], 'cards': row})
            with gzip.open(dst, 'wt', encoding='utf-8') as g: json.dump({'clip': clip, 'modell': version, 'kalla': source, 'w': meta['w'], 'h': meta['h'], 'frames': rows}, g)
            print(clip, source, 'kort med utsnitt', len(cards), 'modellen gav fyrhörning', sum(1 for m in got.values() if m['quad']), 'högkant', sum(1 for m in got.values() if m['side'] == 'EDGE'), flush=True)
            train.keep_lock(lock)
    finally: train.release_lock(lock)

if __name__ == '__main__':
    main()
