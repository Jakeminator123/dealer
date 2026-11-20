# Steg D: gör manifestet och den platta tabellen ur etikettfilerna.
#   python -I export.py
# Skriver i D:/dealer-scratch/tmp/kort-dataset/:
#   manifest.jsonl  en rad per film: sha256, sökväg (och kopiornas sökvägar), format, antal rutor, grupp (samma tagning), delning
#   rutor.csv       en rad per kort och ruta: film (sha256), ruta, sida, hörn, yta, sidlängder, andel, oskärpa, utsmetad, täckt
#   siffror.json    sammanräkningen
# Utsmetad räknas om här: oskärpan mäts mot filmens egna stilla kort i samma färg (ett blått kort har bredare kantband än ett
# gult även när det ligger still), och en ruta är utsmetad när kantbandet är mer än SMEAR_OVER bredare än så. Kolumnen fast
# säger att kortet flyttat sig mer än SMEAR_SPEED bildpunkter sedan förra rutan (möjlig utsmetning där kantbandet inte går att mäta).
import os, sys, json, gzip, glob, csv, collections, statistics, hashlib
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
SMEAR_OVER = 1.5; SMEAR_SPEED = 22.0; VAL_SHARE = 0.2

inv = collections.defaultdict(list)
for l in open(os.path.join(BASE, 'inventory.jsonl'), encoding='utf-8'):
    r = json.loads(l); inv[r['key']].append(r['path'])
sel = {}
if os.path.exists(os.path.join(BASE, 'selected.jsonl')):
    for l in open(os.path.join(BASE, 'selected.jsonl'), encoding='utf-8'): r = json.loads(l); sel[r['key']] = r

files = sorted(glob.glob(os.path.join(BASE, 'labels', '*.json.gz')))
films = []; base_blur = collections.defaultdict(list)
broken = []
for fp in files:
    try: d = json.load(gzip.open(fp, 'rt', encoding='utf-8'))
    except Exception as e: broken.append(os.path.basename(fp)); continue  # en fil som skrevs när körningen stoppades
    films.append(d)
    for fr in d['frames']:
        for c in fr['cards']:
            if c.get('quad') and (c.get('speed') or 0) < 1.5 and c.get('free', 0) > 0.5: base_blur[c['colour']].append(c['blur'])
glob_base = {k: statistics.median(v) for k, v in base_blur.items() if v}
print('stilla korts kantband (median, bildpunkter vid 1080 rader):', {k: round(v, 2) for k, v in glob_base.items()})

# grupper: samma tagning i olika kodningar (samma signatur av första rutan och samma antal rutor) hålls ihop i delningen
group_of = {}
for d in films: group_of[d['film']['key']] = f"{d['film'].get('sig')}-{d['film']['frames']}"
def split_of(group): return 'val' if int(hashlib.sha1(group.encode()).hexdigest()[:8], 16) / 0xffffffff < VAL_SHARE else 'train'

tot = collections.Counter(); rows_out = 0
with open(os.path.join(BASE, 'manifest.jsonl'), 'w', encoding='utf-8') as man, open(os.path.join(BASE, 'rutor.csv'), 'w', newline='', encoding='utf-8') as fcsv:
    w = csv.writer(fcsv)
    w.writerow(['sha256', 'key', 'split', 'frame', 'id', 'role', 'side', 'colour', 'cx', 'cy', 'area', 'share', 'qarea', 'side0', 'side1', 'side2', 'side3', 'len', 'thick', 'blur', 'blur_over', 'speed', 'smeared',
                'cover', 'skin', 'nvis', 'vis', 'x0', 'y0', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'weak', 'completed', 'ex0', 'ey0', 'ex1', 'ey1', 'crop_x', 'crop_y', 'crop_k', 'fast'])
    for d in films:
        m = d['film']; key = m['key']; own = collections.defaultdict(list)
        for fr in d['frames']:
            for c in fr['cards']:
                if c.get('quad') and (c.get('speed') or 0) < 1.5 and c.get('free', 0) > 0.5: own[c['colour']].append(c['blur'])
        basef = {k: (statistics.median(own[k]) if len(own[k]) >= 5 else glob_base.get(k, 2.0)) for k in ('Y', 'B')}
        # ett spår är stilla om det knappt rör sig under sitt liv (skons kort, ett kort som redan ligger)
        path = collections.defaultdict(list)
        for fr in d['frames']:
            for c in fr['cards']: path[c['id']].append((c['cx'], c['cy']))
        s = (m['h'] if m['w'] >= m['h'] else m['w']) / 1080
        still = {i for i, p in path.items() if len(p) >= 0.5 * m['frames'] and max(x for x, _ in p) - min(x for x, _ in p) < 6 * s and max(y for _, y in p) - min(y for _, y in p) < 6 * s}
        n = collections.Counter(); sides_seq = []
        for fr in d['frames']:
            if not fr['cards']: n['empty_frames'] += 1
            for c in fr['cards']:
                role = 'static' if c['id'] in still else 'moving'
                over = c['blur'] - basef[c['colour']]
                # utsmetad = uppmätt: kantbandet är bredare än hos filmens stilla kort. Fart ensam räcker inte (urvalet 13:31: 11 av 24
                # rutor som flaggats på fart var skarpa, flera av dem ett spår som hoppat till ett annat kort); den får en egen kolumn.
                smeared = role == 'moving' and over > SMEAR_OVER; fast = role == 'moving' and (c.get('speed') or 0) > SMEAR_SPEED
                q = c.get('quad'); vis = c.get('vis') or []
                w.writerow([m['sha256'], key, split_of(group_of[key]), fr['f'], c['id'], role, c['side'], c['colour'], c['cx'], c['cy'], c['area'], c['share'], c.get('qarea', ''), *(c.get('sides') or ['', '', '', '']), c['len'], c['thick'],
                            c['blur'], round(over, 2), c.get('speed', ''), int(smeared), c.get('cover', ''), c.get('skin', ''), sum(vis) if q else '', ''.join('1' if v else '0' for v in vis) if q else '',
                            *([v for p in q for v in p] if q else [''] * 8), int(bool(c.get('weak'))), int(bool(c.get('completed'))),
                            *([v for p in c['edge'] for v in p] if c.get('edge') else [''] * 4), *(c.get('crop') or ['', '', '']), int(fast)])
                rows_out += 1; n['cards'] += 1; n[role] += 1; n['mv_fast_sharp'] += int(fast and not smeared)
                if role == 'moving':
                    n['mv_' + c['side']] += 1; n['mv_smeared'] += int(smeared); n['mv_quad'] += int(bool(q)); n['mv_quad4'] += int(bool(q) and sum(vis) == 4)
                    if (c.get('speed') or 0) > 1.5 and c['side'] in ('BACK', 'FRONT'):  # kortet rör sig i just den här rutan
                        n['fart'] += 1; n['fart_smeared'] += int(smeared); n['fart_quad3'] += int(bool(q) and sum(vis) >= 3); n['fart_' + c['side']] += 1; n['fart_smeared_' + c['side']] += int(smeared)
                    if not sides_seq or sides_seq[-1] != c['side']: sides_seq.append(c['side'])
        turn = any(a != b and {a, b} <= {'BACK', 'FRONT', 'EDGE'} and 'BACK' in sides_seq and 'FRONT' in sides_seq for a, b in zip(sides_seq, sides_seq[1:]))
        # en film där en dealer hanterar kort: minst 8 rutor med ett plant kort i rörelse som har fått en fyrhörning
        handled = n['mv_quad'] >= 8; tot['films_handled'] += int(handled); tot['frames_handled'] += m['frames'] if handled else 0
        if handled: tot['h_moving'] += n['moving']; tot['h_smeared'] += n['mv_smeared']; tot['h_edge'] += n['mv_EDGE']; tot['h_quad'] += n['mv_quad']; tot['h_quad4'] += n['mv_quad4']
        man.write(json.dumps({'sha256': m['sha256'], 'key': key, 'path': m['path'], 'copies': inv.get(key, [m['path']]), 'clip': sel.get(key, {}).get('clip'), 'w': m['w'], 'h': m['h'], 'fps': m['fps'], 'frames': m['frames'],
                              'matte': m['matte'], 'group': group_of[key], 'split': split_of(group_of[key]), 'labeller': m['version'], 'cards': n['cards'], 'moving': n['moving'], 'static': n['static'],
                              'smeared': n['mv_smeared'], 'edge': n['mv_EDGE'], 'turn': bool(turn), 'handled': bool(handled), 'still_blur': {k: round(v, 2) for k, v in basef.items()}}, ensure_ascii=False) + '\n')
        tot.update(n); tot['films'] += 1; tot['frames'] += m['frames']; tot['films_turn'] += int(turn); tot['films_' + split_of(group_of[key])] += 1
tot['groups'] = len(set(group_of.values())); tot['broken_label_files'] = len(broken)
if broken: print('trasiga etikettfiler (hoppas över):', broken)
out = dict(tot); mv = max(1, tot['moving'])
out['share_smeared_of_moving'] = round(tot['mv_smeared'] / mv, 4); out['share_edge_of_moving'] = round(tot['mv_EDGE'] / mv, 4)
ft = max(1, tot['fart']); out['share_smeared_of_in_motion'] = round(tot['fart_smeared'] / ft, 4); out['share_three_corners_of_in_motion'] = round(tot['fart_quad3'] / ft, 4)
out['share_smeared_front_in_motion'] = round(tot['fart_smeared_FRONT'] / max(1, tot['fart_FRONT']), 4); out['share_smeared_back_in_motion'] = round(tot['fart_smeared_BACK'] / max(1, tot['fart_BACK']), 4)
out['share_quad_of_moving'] = round(tot['mv_quad'] / mv, 4); out['share_quad4_of_moving'] = round(tot['mv_quad4'] / mv, 4); out['still_blur_median'] = glob_base
json.dump(out, open(os.path.join(BASE, 'siffror.json'), 'w', encoding='utf-8'), indent=1)
print(json.dumps(out, indent=1)); print('rader i rutor.csv:', rows_out)
