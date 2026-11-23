// Steg 6, modellens spår: dagens kortspår med kortmodellens hörn lagda i ruta för ruta (mätningen ur spar_modell.py), och
// måtten per film bredvid dagens.
//   node tools/python/kort-dataset/spar_modell.ts [--modell 2] [--torr] [<klipp> ...]      utan klipp: alla som har mätning
// Skriver assets/proofs/kortmodell-v<n>-20261123/spar/<klipp>.json (rutorna och edgeWindow, det trialTrack i
// src/card-overlay.ts läser) och index.json (en rad per film med måtten). Dagens spår i assets/tracking/ ändras inte.
// Regeln, per ruta före vilan:
//   1. Vilket kort som är vårt: det av mätningens kort som dagens spår ligger på; annars det som följs bakåt från vilan, ruta
//      för ruta, inom en kortlängds räckhåll. En stilla ruta lånar hörnen från närmaste mätta ruta av samma kort. Kortet som
//      sitter kvar i skon är aldrig vårt. Tappas kortet i flera rutor hittas det igen där dagens spår har det.
//   2. Har modellen en fyrhörning tas den; står kortet på högkant tas mätningens linje; annars står dagens ruta kvar.
//   3. Styvt kort ur skon: när kortet glider ut syns det och skons nästa kort som en gul form, längre än ett kort. Modellen är
//      inte gjord för två kort i ett; där tas dagens fyrhörning (tät mot det gula) och av den den främre delen, så lång som
//      kortet som sitter i skon.
//   4. Det styva kortet (styvt_kort.ts): i en giv där kortet kommer till vila blir rutornas kort till sist ETT kort med fasta
//      mått, flyttat och vridet i rummet och jämnat över filmen; rutan får `film` (filmens kort) och `quad` (det ritade).
//      --utan-styvt skriver spåret som det var före det steget. Har filmens liggande kort en vit kant kring färgen (läst i
//      filmens egen bild, whiteRim; kräver ffmpeg) får rutan också `whole`, kortet med kanten.
// Rutor där kortet sitter i skon och rutorna från vilan är dagens. Hörnens ordning följer spårets egen regel: första sidan
// från sin första ruta, senare sidor bakifrån från vilan.
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {alignCorners, centre, ends, signedArea, type Pt, type Side} from '../../../src/card-track.ts';
import {plausible, type CardTrack} from '../../../src/card-overlay.ts';
import {rigidFrames, STIFF, type Stiff} from './styvt_kort.ts';
import {decodeFrame, W, H} from '../../order-images.ts';

const BASE = 'D:/dealer-scratch/tmp/kort-dataset', args = process.argv.slice(2), dry = args.includes('--torr'), loose = args.includes('--utan-styvt');
const version = Number(args[args.indexOf('--modell') + 1]) || 2, OUT = `assets/proofs/kortmodell-v${version}-20261123`;
const asked = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--modell');
const clips = asked.length ? asked : (await readdir(`${BASE}/modell-v${version}`)).filter(f => f.endsWith('.json.gz')).map(f => f.slice(0, -8)).sort();

// sure: the least a model's mask may be to count. same: a measured card within this many card lengths of today's track is the
// track's card. reach: from frame to frame the card is looked for within this many card lengths.
// lost: after this many frames without it the card is found again where today's track has it. still: how many frames away a
// card standing still may take its corners from.
// shoePad: a corner within this share of the shoe window's size outside it touches the shoe. long: a card clear of the shoe is at
// most this many times the film's usual card length. longer: a shape this much longer than the card holds the shoe's card too.
// ahead: how many frames on the clear card is looked for.
// big, small: a card whose length is this many times the cards three to six frames from it is drawn too large or too small (a turn
// alone changes the length by at most the card's own proportions, 0,72). apart: two quads sharing less than this (intersection
// over union) show different cards to the eye.
export const RULE = {sure: 0.6, same: 0.5, reach: 1.2, lost: 3, still: 12, shoePad: 0.25, long: 1.25, longer: 1.08, ahead: 15, big: 1.5, small: 0.55, apart: 0.6};
type Measure = {side: 'BACK' | 'FRONT' | 'EDGE'; quad: number[][] | null; p: number};
type Card = {id: number; side: Side; cx: number; cy: number; area: number; len: number; thick: number; quad?: number[][]; vis?: boolean[]; edge?: number[][]; moving?: boolean; m?: Measure};
type TFrame = {frame: number; side: Side; quad: number[][] | null; edge: number[][] | null; area: number; confidence: number; shoeShare?: number; note?: string; film?: number[][] | null};
type From = 'modell' | 'linje' | 'styv' | null;
type Stored = CardTrack & {frames: TFrame[]; kind?: string};

const pt = (p: number[]): Pt => ({x: p[0], y: p[1]}), r1 = (v: number) => Math.round(v * 10) / 10, arr = (q: Pt[]) => q.map(p => [r1(p.x), r1(p.y)]);
// Whether the film's lying card has a white rim round its colour: the share of the ring 2 to 8 pixels outside the lying card that
// is light and neutral in the film's own picture, where the card lies and in the film's last frame (the larger of the two: a hand
// may lie over the card in one of them). A card without a rim has the screen's green there (0.00 in the four small-card films
// without one); the five rimmed films have 0.30 to 0.53 (the thinnest rim is 2-4 pixels wide). And how wide the rim is (`width`):
// out from each side of the lying card the white is followed at seven places, as far as it goes (RIM.reach at most; a gap of two
// pixels ends it); the middle one of the seven is that side's, and the widest side's is the rim's, as a share of the card's mean side.
const RIM = {from: 2, to: 8, light: 190, neutral: 40, share: 0.15, reach: 40};
function whiteRim(clip: string, track: Stored): {ring: number; width: number} {
  const q = track.restQuad?.length === 4 ? track.restQuad.map(pt) : null, none = {ring: 0, width: 0}; if (!q || track.restFrom == null) return none;
  const file = (track as {source?: {path?: string}}).source?.path ?? `assets/motions/${clip}/source.mp4`; if (!existsSync(file)) return none;
  const wind = Math.sign(signedArea(q)) || 1, out = (x: number, y: number) => Math.max(...q.map((a, i) => { const b = q[(i + 1) % 4], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return -wind * ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / l; }));
  const x0 = Math.max(0, Math.floor(Math.min(...q.map(p => p.x)) - RIM.to)), x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map(p => p.x)) + RIM.to)), y0 = Math.max(0, Math.floor(Math.min(...q.map(p => p.y)) - RIM.to)), y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map(p => p.y)) + RIM.to));
  const side = q.reduce((t, a, i) => t + dist(a, q[(i + 1) % 4]), 0) / 4;
  const read = (frame: number) => { const rgb = decodeFrame(file, frame); let ring = 0, light = 0, widest = 0;
    const white = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = (y * W + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]; return Math.min(r, g, b) > RIM.light && Math.max(r, g, b) - Math.min(r, g, b) < RIM.neutral; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = out(x + 0.5, y + 0.5); if (d < RIM.from || d > RIM.to) continue; ring++; if (white(x, y)) light++; }
    for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4], l = dist(a, b) || 1, nx = wind * (b.y - a.y) / l, ny = -wind * (b.x - a.x) / l, runs: number[] = []; // (nx, ny): out of the card
      for (let t = 0.2; t < 0.81; t += 0.1) { const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t; let last = 0, gap = 0, begun = false;
        for (let d = -3; d <= RIM.reach; d++) { if (white(Math.round(px + nx * d), Math.round(py + ny * d))) { begun = true; last = Math.max(0, d); gap = 0; } else if (begun ? ++gap > 2 : d > 6) break; }
        runs.push(last); }
      widest = Math.max(widest, median(runs)); }
    return {ring: ring ? light / ring : 0, width: widest / side}; };
  const a = read(Math.min(track.frames.length - 1, track.restFrom + 2)), b = read(track.frames.length - 1), two = (v: number) => Math.round(v * 100) / 100;
  return {ring: two(Math.max(a.ring, b.ring)), width: two(Math.max(a.width, b.width))};
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y), mid = (a: Pt, b: Pt): Pt => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const flat = (f: TFrame | undefined): f is TFrame & {quad: number[][]} => !!f && (f.side === 'BACK' || f.side === 'FRONT') && f.quad?.length === 4;
const longOf = (q: Pt[]) => Math.max(dist(q[0], q[1]) + dist(q[2], q[3]), dist(q[1], q[2]) + dist(q[3], q[0])) / 2;
// The way a card's length runs, from the end with its corners 0 and 1 (0 and 3 when its length lies the other way) to the opposite end.
const along = (q: Pt[]): Pt => { const a = mid(q[0], q[1]), b = mid(q[3], q[2]), c = mid(q[0], q[3]), d = mid(q[1], q[2]); return dist(a, b) >= dist(c, d) ? {x: b.x - a.x, y: b.y - a.y} : {x: d.x - c.x, y: d.y - c.y}; };
// The area two convex quads share, over the area they cover together.
function iou(a: Pt[], b: Pt[]): number {
  const cw = (q: Pt[]) => signedArea(q) < 0 ? [...q].reverse() : q; let poly = cw(a); const clip = cw(b);
  for (let i = 0; i < 4 && poly.length; i++) { const p = clip[i], q = clip[(i + 1) % 4], inside = (v: Pt) => (q.x - p.x) * (v.y - p.y) - (q.y - p.y) * (v.x - p.x) >= 0, next: Pt[] = [];
    poly.forEach((v, k) => { const w = poly[(k + 1) % poly.length], iv = inside(v), iw = inside(w);
      if (iv) next.push(v);
      if (iv !== iw) { const t = ((q.x - p.x) * (v.y - p.y) - (q.y - p.y) * (v.x - p.x)) / ((q.y - p.y) * (w.x - v.x) - (q.x - p.x) * (w.y - v.y)); next.push({x: v.x + (w.x - v.x) * t, y: v.y + (w.y - v.y) * t}); } });
    poly = next; }
  const area = (q: Pt[]) => Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0)) / 2, inter = poly.length >= 3 ? area(poly) : 0;
  return inter / Math.max(1e-6, area(a) + area(b) - inter);
}

/** Today's frames with the model's cards laid in, and where each frame's card came from. */
export function modelFrames(track: Stored, measured: Card[][]): {frames: TFrame[]; from: From[]} {
  const n = track.frames.length, end = Math.min(n, track.restFrom ?? n), out: TFrame[] = track.frames.map(f => ({...f})), from: From[] = out.map(() => null);
  const box = track.shoeWindow?.box ?? null, shoe: Pt | null = box ? {x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2} : null, pad = box ? RULE.shoePad * Math.max(box[2] - box[0], box[3] - box[1]) : 0;
  const within = (p: Pt, by: number) => !!box && p.x >= box[0] - by && p.x <= box[2] + by && p.y >= box[1] - by && p.y <= box[3] + by;
  const at = (c: Card): Pt => ({x: c.cx, y: c.cy}), every = measured.flat();
  // the film's usual card length, from the model's own cards away from the shoe; and the length of the card that sits in the shoe
  const long = median(every.filter(c => c.m?.quad && c.m.side !== 'EDGE' && c.m.p >= RULE.sure && !within(at(c), pad) && plausible(c.m.quad.map(pt))).map(c => longOf(c.m!.quad!.map(pt))))
    || median(track.frames.filter((f, i) => i < end && flat(f) && (f.shoeShare ?? 0) < 0.05).map(f => longOf(f.quad!.map(pt)))) || median(every.map(c => c.len));
  const shoeLength = median(every.filter(c => within(at(c), 0)).map(c => c.len)), sitting = (c: Card) => within(at(c), 0) && c.len <= RULE.longer * shoeLength;
  // where the track has the card, also in the frames between where it has none: where a lost card is found again
  const place: (Pt | null)[] = track.frames.map(f => f.quad?.length === 4 ? centre(f.quad.map(pt)) : f.edge?.length === 2 ? mid(pt(f.edge[0]), pt(f.edge[1])) : null);
  for (let i = 0; i < n; i++) { if (place[i]) continue; let j = i; while (j < n && !place[j]) j++; const a = place[i - 1], b = j < n ? place[j] : null;
    if (a && b && j - i <= 10) for (let k = i; k < j; k++) { const t = (k - i + 1) / (j - i + 1); place[k] = {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t}; } i = j; }
  const own = track.frames.map(f => f.quad?.length === 4 || f.edge?.length === 2);
  // 1. which measured card is ours: the one today's track lies on, else the one followed backward from where the card rests
  const chosen: (Card | null)[] = out.map(() => null); let pos: Pt | null = track.restQuad?.length === 4 && end < n ? centre(track.restQuad.map(pt)) : null, gap = 0;
  for (let i = end - 1; i >= 0; i--) { const free = (measured[i] ?? []).filter(c => !sitting(c));
    const near = (p: Pt | null, reach: number) => { let best: Card | null = null, least = reach; if (p) for (const c of free) { const d = dist(at(c), p); if (d <= least) { least = d; best = c; } } return best; };
    const card = (own[i] ? near(place[i], RULE.same * long) : null) ?? near(pos, RULE.reach * long * (1 + Math.min(gap, 4) / 4)) ?? (!pos || gap >= RULE.lost ? near(place[i], RULE.reach * long) : null);
    if (card) { chosen[i] = card; pos = at(card); gap = 0; } else gap++; }
  // 2. the model's quad, or the measured line
  const raw: (Pt[] | null)[] = out.map(() => null);
  // a card standing still is measured only every twelfth frame: between them its corners are those of the nearest measured frame
  const measureOf = (i: number, card: Card): Measure | null => { if (card.m || card.moving) return card.m ?? null;
    for (let k = 1; k <= RULE.still; k++) for (const j of [i - k, i + k]) { const c = measured[j]?.find(o => o.id === card.id && o.m); if (!c || dist(at(c), at(card)) > 2) continue;
      const dx = card.cx - c.cx, dy = card.cy - c.cy; return {...c.m!, quad: c.m!.quad?.map(p => [p[0] + dx, p[1] + dy]) ?? null}; }
    return null; };
  for (let i = 0; i < end; i++) { const f = track.frames[i], card = chosen[i], m = card ? measureOf(i, card) : null; if (!card || !m || (f.shoeShare ?? 0) >= 0.9) continue;
    if (m.quad && m.side !== 'EDGE' && m.p >= RULE.sure) { raw[i] = m.quad.map(pt);
      if (plausible(raw[i])) { out[i] = {...f, side: m.side, quad: m.quad, edge: null, area: Math.round(card.area), confidence: Math.round(m.p * 100) / 100, note: 'model'}; from[i] = 'modell'; } }
    else if (m.side === 'EDGE' && card.edge?.length === 2) { out[i] = {...f, side: 'EDGE', quad: null, edge: card.edge, area: Math.round(card.area), confidence: 0.6, note: 'model: edge-on, the measured line'}; from[i] = 'linje'; } }
  // 3. the stiff card out of the shoe. A shape that touches the shoe and is longer than the card sitting there holds that card too,
  // and the model was not made for two cards as one. Such a frame takes the track's own quad (tight on the yellow), and of it the
  // leading part at card length.
  if (shoe && shoeLength) { const clear = (i: number) => from[i] === 'modell' && flat(out[i]) && !within(centre(out[i].quad!.map(pt)), 0) && longOf(out[i].quad!.map(pt)) <= RULE.long * long;
    for (let i = 0; i < end; i++) { const card = chosen[i], f = track.frames[i]; if (!card || (f.shoeShare ?? 0) >= 0.9 || card.len <= RULE.longer * shoeLength) continue;
      const shape = card.m?.quad?.map(pt) ?? card.quad?.map(pt) ?? null; if (!within(at(card), 0) && !shape?.some(p => within(p, pad))) continue;
      out[i] = {...f}; from[i] = null; if (!flat(f)) continue; const q = f.quad.map(pt); if (longOf(q) <= RULE.longer * shoeLength) continue;
      let j = i + 1; while (j < end && j <= i + RULE.ahead && !clear(j)) j++; if (j >= end || j > i + RULE.ahead) continue;
      // the way the card travels, and the end of the quad that lies furthest that way
      const c = centre(out[j].quad!.map(pt)), way = {x: c.x - shoe.x, y: c.y - shoe.y}, [a, b] = ends(q), on = (e: [number, number]) => { const m = mid(q[e[0]], q[e[1]]); return m.x * way.x + m.y * way.y; };
      const [head, tail] = on(a) >= on(b) ? [a, b] : [b, a], cut = q.map(p => ({...p}));
      for (const k of [0, 1]) { const h = q[head[k]], t = q[tail[k]], share = Math.min(1, shoeLength / dist(h, t)); cut[tail[k]] = {x: h.x + (t.x - h.x) * share, y: h.y + (t.y - h.y) * share}; }
      if (!plausible(cut)) continue;
      out[i] = {...f, quad: arr(cut), note: 'the leading part at card length, the shoe\'s card behind it'}; from[i] = 'styv'; } }
  // corner identity, as the track keeps it: the first side from its first frame onward, later sides from their last frame backward
  const sides = out.map(f => flat(f) ? f.side : null), firstSide = sides.find(s => s) ?? null, firstOther = sides.findIndex(s => s && s !== firstSide);
  let prev: Pt[] | null = null;
  for (let i = 0; i < (firstOther < 0 ? n : firstOther); i++) { if (!sides[i] || sides[i] !== firstSide) continue; const q = out[i].quad!.map(pt);
    if (prev && from[i]) { const a = alignCorners(prev, q); out[i].quad = arr(a); prev = a; } else if (prev || !from[i]) prev = q; else { const t = track.frames[i]; prev = flat(t) && t.side === firstSide ? alignCorners(t.quad.map(pt), q) : q; out[i].quad = arr(prev); } }
  if (firstOther >= 0) { let next: Pt[] | null = null, side: Side | null = null;
    for (let i = n - 1; i >= firstOther; i--) { if (!sides[i]) continue; const q = out[i].quad!.map(pt); if (sides[i] !== side) { side = sides[i]; next = null; }
      if (next && from[i]) { const a = alignCorners(next, q); out[i].quad = arr(a); next = a; } else if (next || !from[i]) next = q; else { const t = track.frames[i]; next = flat(t) && t.side === side ? alignCorners(t.quad.map(pt), q) : q; out[i].quad = arr(next); } } }
  // a line runs the way the card's length ran in the frame before it
  for (let i = 1; i < end; i++) { const f = out[i], p = out[i - 1]; if (from[i] !== 'linje' || !f.edge) continue;
    const d = p.quad?.length === 4 ? along(p.quad.map(pt)) : p.edge?.length === 2 ? {x: p.edge[1][0] - p.edge[0][0], y: p.edge[1][1] - p.edge[0][1]} : null;
    if (d && (f.edge[1][0] - f.edge[0][0]) * d.x + (f.edge[1][1] - f.edge[0][1]) * d.y < 0) f.edge = [f.edge[1], f.edge[0]]; }
  return {frames: out, from};
}

/** What a track's frames show while the card is on its way: from where it leaves the shoe to where it rests. */
function measures(frames: TFrame[], from: number, to: number) {
  const length = (i: number) => flat(frames[i]) ? longOf(frames[i].quad!.map(pt)) : null, big: number[] = [], small: number[] = [], empty: number[] = [];
  for (let i = from; i < to; i++) { const a = length(i), f = frames[i];
    if (a === null) { if (!(f.side === 'EDGE' && f.edge)) empty.push(i); continue; }
    const around: number[] = []; for (let k = i - 6; k <= i + 6; k++) if (Math.abs(k - i) >= 3 && k >= 0 && k < frames.length) { const b = length(k); if (b !== null) around.push(b); }
    if (around.length < 3) continue; const ratio = a / median(around); if (ratio >= RULE.big) big.push(i); else if (ratio <= RULE.small) small.push(i); }
  return {stor: big, liten: small, utanKort: empty, behallna: frames.slice(from, to).filter(f => /last known shape kept/.test(f.note ?? '')).length};
}

const blank = () => ({stor: 0, liten: 0, utanKort: 0, behallna: 0});
const index: unknown[] = [], total = {filmer: 0, rutor: 0, franModellen: 0, styva: 0, idag: blank(), modell: blank(), skiljer: 0, annanSida: 0, styvt: {filmer: 0, ryckFore: 0, ryckEfter: 0, franModellen: 0, burna: 0}};
for (const clip of clips) {
  const file = `assets/tracking/${clip}/card-track.json`, meas = `${BASE}/modell-v${version}/${clip}.json.gz`;
  if (!existsSync(file) || !existsSync(meas)) { console.log(`${clip}: saknar spår eller mätning`); continue; }
  const track = JSON.parse(await readFile(file, 'utf8')) as Stored, m = JSON.parse(gunzipSync(await readFile(meas)).toString('utf8')) as {kalla: string; frames: {f: number; cards: Card[]}[]};
  const measured: Card[][] = track.frames.map(() => []); for (const fr of m.frames) if (fr.f < measured.length) measured[fr.f] = fr.cards;
  const laid = modelFrames(track, measured), from = laid.from, n = laid.frames.length, end = Math.min(n, track.restFrom ?? n);
  // 4. the stiff card, in a deal whose card comes to rest; the measures below are of the model's own frames
  let ring: number | null = null; // the white share round the lying card, where it was asked for (a film with a small card)
  const stiff = !loose && track.kind === 'DEAL' ? rigidFrames(track, laid.frames, from, () => { const white = whiteRim(clip, track); ring = white.ring; return white.ring >= RIM.share && white.width > 0 ? white.width : null; }) : null, frames = laid.frames, written = (stiff?.frames ?? frames) as TFrame[], styvt: Stiff | null = stiff?.stats ?? null;
  if (styvt) { total.styvt.filmer++; total.styvt.ryckFore += styvt.ryck[0]; total.styvt.ryckEfter += styvt.ryck[1]; total.styvt.franModellen += styvt.franModellen; total.styvt.burna += styvt.burna; }
  // the way: from the first frame where either track has the card out of the shoe to where it rests
  const has = (f: TFrame) => (f.shoeShare ?? 0) < 0.9 && (f.quad?.length === 4 || f.edge?.length === 2), first = track.frames.findIndex((f, i) => has(f) || has(frames[i]));
  const start = Math.min(end, Math.max(track.leavesShoe ?? 0, first < 0 ? end : first)), a = measures(track.frames, start, end), b = measures(frames, start, end);
  const apart: number[] = [], otherSide: number[] = [];
  for (let i = start; i < end; i++) { const t = track.frames[i], f = frames[i]; if (!from[i]) continue;
    if (flat(t) !== flat(f) || (flat(t) && flat(f) && iou(t.quad.map(pt), f.quad.map(pt)) < RULE.apart)) apart.push(i);
    if (flat(t) && flat(f) && t.side !== f.side) otherSide.push(i); }
  const firstFront = written.findIndex(f => f.side === 'FRONT' && flat(f)), lastBack = firstFront < 0 ? -1 : Math.max(-1, ...written.filter(f => flat(f) && f.side === 'BACK' && f.frame < firstFront).map(f => f.frame));
  const cut = from.slice(start, end).filter(v => v === 'styv').length, row = {clip, kind: track.kind ?? null, kalla: m.kalla, rutor: n, vila: track.restFrom, vag: [start, end], franModellen: from.slice(start, end).filter(Boolean).length, styva: cut, idag: a, modell: b, skiljer: apart, annanSida: otherSide, styvt, ...(ring == null ? {} : {vitRing: ring})};
  index.push(row); total.filmer++; total.rutor += end - start; total.franModellen += row.franModellen; total.styva += cut; total.skiljer += apart.length; total.annanSida += otherSide.length;
  for (const [k, v] of [['idag', a], ['modell', b]] as const) { total[k].stor += v.stor.length; total[k].liten += v.liten.length; total[k].utanKort += v.utanKort.length; total[k].behallna += v.behallna; }
  if (asked.length) console.log(clip, JSON.stringify({...row, kalla: undefined}));
  else if (dry && (a.stor.length || b.stor.length || b.liten.length)) console.log(clip, 'väg', start, end, '| stor idag', a.stor.join(','), '| modell', b.stor.join(','), '| liten idag', a.liten.join(','), '| modell', b.liten.join(','), '| styva', cut);
  if (!dry) { await mkdir(`${OUT}/spar`, {recursive: true});
    // stiff: whether the frames are the stiff card's (what Scen reads by default, src/card-overlay.ts trackFolder) or only the model's own
    await writeFile(`${OUT}/spar/${clip}.json`, JSON.stringify({clip, stiff: !!styvt, edgeWindow:lastBack >= 0 && firstFront > lastBack + 1 ? [lastBack + 1, firstFront - 1] : null,
      trial: {name: `kortmodell v${version}${styvt ? ', styvt kort' : ''}`, rule: `tools/python/kort-dataset/spar_modell.ts modelFrames${styvt ? ', styvt_kort.ts rigidFrames' : ''}`, measurement: `tools/python/kort-dataset/spar_modell.py (${m.kalla})`}, frames: written}).replace(/\{"frame"/g, '\n{"frame"') + '\n'); }
}
if (!dry && !asked.length) await writeFile(`${OUT}/index.json`, JSON.stringify({schemaVersion: 1, modell: version, regel: RULE, styvt: STIFF, summa: total, filmer: index}).replace(/\{"clip"/g, '\n{"clip"') + '\n');
console.log(JSON.stringify(total));
