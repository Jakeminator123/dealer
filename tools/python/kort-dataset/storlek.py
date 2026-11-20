# Kortens storlek i datasetet: sidlängder (vid 1080 rader), förhållandet långsida/kortsida och ytans andel av bilden,
# för kort där alla fyra hörn syns och rutan inte är utsmetad; i rörelse och stilla var för sig, rygg och framsida var för sig.
# Räknar också oskärpan (kantbandets bredd) per sida och hur stor del av kortet handen täcker.
#   python -I storlek.py     -> storlek.json
import os, csv, json, collections
import numpy as np
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
man = {}
for l in open(os.path.join(BASE, 'manifest.jsonl'), encoding='utf-8'): m = json.loads(l); man[m['key']] = m
g = collections.defaultdict(lambda: collections.defaultdict(list)); blur = collections.defaultdict(list); cover = []; nvis = collections.Counter()
with open(os.path.join(BASE, 'rutor.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        m = man.get(r['key'])
        if not m or r['side'] not in ('BACK', 'FRONT'): continue
        s = (m['h'] if m['w'] >= m['h'] else m['w']) / 1080
        if r['role'] == 'moving' and float(r['speed'] or 0) > 1.5:  # kortet rör sig i just den här rutan
            if float(r['blur']) > 0: blur[('rygg' if r['side'] == 'BACK' else 'framsida') + (', utsmetad' if r['smeared'] == '1' else ', inte utsmetad')].append(float(r['blur']))
            if r['cover'] != '': cover.append(max(float(r['cover']), float(r['skin'] or 0)))
            if r['x0'] != '': nvis[int(r['nvis'] or 0)] += 1
        if r['x0'] == '' or r['nvis'] != '4' or r['smeared'] == '1': continue
        sd = sorted(float(r[f'side{i}']) / s for i in range(4)); long_, short = (sd[2] + sd[3]) / 2, (sd[0] + sd[1]) / 2
        k = f"{'i rörelse' if r['role'] == 'moving' else 'stilla'} / {'rygg' if r['side'] == 'BACK' else 'framsida'}"
        g[k]['lang'].append(long_); g[k]['kort'].append(short); g[k]['kvot'].append(long_ / max(1e-6, short)); g[k]['andel'].append(float(r['qarea']) / (m['w'] * m['h']) * 100)
q = lambda v: [round(float(x), 2) for x in np.percentile(v, [10, 50, 90])] if len(v) else None
out = {'storlek_p10_median_p90': {k: {'rutor': len(v['lang']), 'langsida_px_vid_1080': q(v['lang']), 'kortsida_px_vid_1080': q(v['kort']), 'langsida_delat_med_kortsida': q(v['kvot']), 'ytans_andel_av_bilden_procent': q(v['andel'])} for k, v in sorted(g.items())},
       'kantband_px_vid_1080_p10_median_p90': {k: {'rutor': len(v), 'varde': q(v)} for k, v in sorted(blur.items())},
       'handen_tacker_andel_av_kortet_i_rorelse': {'rutor': len(cover), 'p10_median_p90': q(cover), 'andel_rutor_over_30_procent': round(float(np.mean(np.array(cover) > 0.3)), 3) if cover else None},
       'synliga_horn_i_rorelse': {str(k): v for k, v in sorted(nvis.items())}}
json.dump(out, open(os.path.join(BASE, 'storlek.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(out, ensure_ascii=False, indent=1))
