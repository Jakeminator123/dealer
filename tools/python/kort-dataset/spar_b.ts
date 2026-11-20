// Provets spår ("kortprov"): dagens kortspår med datasetets mätning lagd i, enligt regeln refineFrames i src/card-track.ts.
//   node tools/python/kort-dataset/spar_b.ts <klipp> [<klipp> ...]      skriver assets/proofs/kort-fram-bak-20261120/spar/<klipp>.json
//   node tools/python/kort-dataset/spar_b.ts --alla --torr              alla klipp med både spår och etikett, inget skrivs: bara måtten
// Måtten (före -> efter) är spårets egna, inte jämförda med etiketten (spåret efter är ju byggt ur den):
//   kvar: rutor med regeln "mostly hidden: last known shape kept"; vandning: rutor i vändningen (turnOf) där inget kort kan ritas;
//   utanKort: de av dem som varken har kort eller linje.   --delning=val|train: bara den delen av datasetet.   --lista: en rad per ändrat klipp.
// Mätningen kommer ur etiketterna (label.py) på slaskdisken: utan dem finns inget att lägga i, och skriptet säger det per klipp.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {refineFrames, type Frame, type Measured, type Pt, type Side} from '../../../src/card-track.ts';
import {turnOf, plausible, type CardTrack} from '../../../src/card-overlay.ts';

const BASE = 'D:/dealer-scratch/tmp/kort-dataset', OUT = 'assets/proofs/kort-fram-bak-20261120/spar';
const args = process.argv.slice(2), dry = args.includes('--torr'), all = args.includes('--alla');
const manifest = (await readFile(`${BASE}/manifest.jsonl`, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l)) as {key: string; clip?: string | null; h: number; w: number; split: string; still_blur: Record<string, number>}[];
const byClip = new Map(manifest.filter(m => m.clip).map(m => [m.clip!, m]));
const only = args.find(a => a.startsWith('--delning='))?.slice(10); // --delning=val: bara de filmer som datasetet håller undan
const clips = all ? [...byClip.keys()].filter(c => existsSync(`assets/tracking/${c}/card-track.json`) && (!only || byClip.get(c)!.split === only)).sort() : args.filter(a => !a.startsWith('--'));

type Label = {side: Side | 'PIECE'; colour: 'Y' | 'B'; cx: number; cy: number; len: number; thick: number; blur: number; quad?: number[][]; vis?: boolean[]; edge?: number[][]; poly?: number[][][]};
// kortets riktning: huvudaxeln hos konturens punkter (kanterna tätade till ungefär två bildpunkter mellan punkterna)
function axisOf(c: Label): Pt | null {
  if (c.edge?.length === 2) { const dx = c.edge[1][0] - c.edge[0][0], dy = c.edge[1][1] - c.edge[0][1], l = Math.hypot(dx, dy); return l > 1 ? {x: dx / l, y: dy / l} : null; }
  const ring = c.poly?.[0]; if (!ring || ring.length < 3) return null; const px: number[][] = [];
  ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length], n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2)); for (let k = 0; k < n; k++) px.push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]); });
  const mx = px.reduce((s, p) => s + p[0], 0) / px.length, my = px.reduce((s, p) => s + p[1], 0) / px.length; let xx = 0, xy = 0, yy = 0;
  for (const p of px) { xx += (p[0] - mx) ** 2; xy += (p[0] - mx) * (p[1] - my); yy += (p[1] - my) ** 2; }
  const a = Math.atan2(2 * xy, xx - yy) / 2; return {x: Math.cos(a), y: Math.sin(a)};
}
const drawn = (f: {side: string; quad: number[][] | null}) => (f.side === 'BACK' || f.side === 'FRONT') && f.quad?.length === 4 && plausible(f.quad.map(([x, y]) => ({x, y})));
function measures(t: CardTrack & {frames: {note?: string}[]}) {
  const turn = turnOf({...t, frames: t.frames} as CardTrack); let empty = 0;
  if (turn) for (let i = turn.from; i <= turn.to; i++) if (!drawn(t.frames[i]) && !(t.frames[i].side === 'EDGE' && t.frames[i].edge)) empty++;
  return {kvar: t.frames.filter(f => /mostly hidden/.test(f.note ?? '')).length, vandning: turn ? turn.to - turn.from + 1 : 0, utanKort: empty};
}
const sum = {klipp: 0, fore: {kvar: 0, vandning: 0, utanKort: 0}, efter: {kvar: 0, vandning: 0, utanKort: 0}, andrade: {turn: 0, size: 0, unhidden: 0}};
for (const clip of clips) {
  const m = byClip.get(clip), file = `assets/tracking/${clip}/card-track.json`, label = m && `${BASE}/labels/${m.key}.json.gz`;
  if (!m || !existsSync(file) || !label || !existsSync(label)) { console.log(`${clip}: saknar spår eller etikett`); continue; }
  const track = JSON.parse(await readFile(file, 'utf8')), lab = JSON.parse(gunzipSync(await readFile(label)).toString('utf8')) as {frames: {f: number; cards: Label[]}[]};
  const s = Math.min(m.w, m.h) / 1080, pt = (p: number[]): Pt => ({x: p[0], y: p[1]});
  const measured: (Measured[] | null)[] = track.frames.map(() => null);
  for (const fr of lab.frames) measured[fr.f] = fr.cards.filter(c => c.side !== 'PIECE').map(c => ({side: c.side as Side, centre: {x: c.cx, y: c.cy}, length: c.len, thickness: c.thick, axis: axisOf(c), quad: c.quad?.length === 4 ? c.quad.map(pt) : null,
    seen: c.quad && c.vis ? c.vis.filter(Boolean).length : 0, band: Math.max(0, (c.blur || 0) - (m.still_blur?.[c.colour] ?? 2)) * s}));
  const frames: Frame[] = track.frames.map((f: {frame: number; side: Side; quad: number[][] | null; edge: number[][] | null; area: number; confidence: number; shoeShare?: number; note?: string}) => ({...f, quad: f.quad && f.quad.map(pt), edge: f.edge && [pt(f.edge[0]), pt(f.edge[1])] as [Pt, Pt]}));
  const r = refineFrames(frames, measured, track.restFrom);
  const firstFront = r.frames.find(f => f.side === 'FRONT')?.frame ?? -1, lastBack = firstFront < 0 ? -1 : Math.max(-1, ...r.frames.filter(f => f.side === 'BACK' && f.frame < firstFront).map(f => f.frame));
  const out = {...track, edgeWindow: lastBack >= 0 && firstFront > lastBack + 1 ? [lastBack + 1, firstFront - 1] : null,
    trial: {name: 'kortprov', rule: 'src/card-track.ts refineFrames', measurement: 'tools/python/kort-dataset/label.py (kortlabel-4)', turn: r.turn, changed: r.changed},
    frames: r.frames.map(f => ({...f, quad: f.quad?.map(p => [p.x, p.y]) ?? null, edge: f.edge?.map(p => [p.x, p.y]) ?? null}))};
  const a = measures(track), b = measures(out as never);
  sum.klipp++; for (const [k, v] of [['fore', a], ['efter', b]] as const) { sum[k].kvar += v.kvar; sum[k].vandning += v.vandning; sum[k].utanKort += v.utanKort; }
  for (const k of ['turn', 'size', 'unhidden'] as const) sum.andrade[k] += r.changed[k].length;
  if (!all) console.log(clip, m.split, 'vändning', r.turn, 'ändrade', JSON.stringify(r.changed), 'före', JSON.stringify(a), 'efter', JSON.stringify(b));
  else if (args.includes('--lista') && Object.values(r.changed).some(v => v.length)) console.log(clip, m.split, 'v', JSON.stringify(r.turn), 't', r.changed.turn.join(','), 's', r.changed.size.join(','));
  if (!dry) { await mkdir(OUT, {recursive: true}); await writeFile(`${OUT}/${clip}.json`, JSON.stringify(out).replace(/\{"frame"/g, '\n{"frame"') + '\n'); }
}
console.log(JSON.stringify(sum));
