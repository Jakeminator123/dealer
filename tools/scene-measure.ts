// Measures the table plane, the light and the portrait framing of the Pamela shot from real frames.
// Reads media only. Writes data/scene-contract.json, review images under D:/dealer-scratch/review/scen
// and shadow mattes under assets/scene-work (git-ignored). Every figure in the contract carries its basis.
//   node tools/scene-measure.ts
import {readFile, writeFile, mkdir, rm, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {type Camera, type CardObservation, type CardPose, type FrameTransform, type Mat3, type Pt, type Segment, CARD_MM, V6_PORTRAIT, applyH, cameraProject, decomposeHomography, fitCardPose, fitPlane,
  horizon, horizonRotation, inv3, mapPoint, principalXFromHomography, projectCard, quadOnPlane, quadShape, quadVisibility, reframe, reframePose, seededRandom} from '../src/scene-geometry.ts';
import {validatePlan, flatQuad, quad, TARGETS, type PlacementPlan} from '../src/placement-model.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
sharp.concurrency(1);
const SCRATCH = 'D:/dealer-scratch/tmp', REVIEW = 'D:/dealer-scratch/review/scen', WORK = 'assets/scene-work', FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
if (await stat(SCRATCH).catch(() => null)) process.env.TEMP = process.env.TMP = SCRATCH;
const W = 1764, H = 1174, N = W * H, NATIVE_W = 1762, IMAGE = {width: W, height: H}, TO_FILM = (W - 1) / (NATIVE_W - 1);
const PLAN = 'placements/default.json', SHADOW_CLIP = 'pamela-p4-c1-plan-deal-02', SHADOW_RANGE: [number, number] = [40, 104];
const clip = (id: string) => `assets/motions/${id}/source.mp4`;
const round = (v: number, digits = 2) => Number(v.toFixed(digits)), xy = (p: Pt, digits = 2) => [round(p.x, digits), round(p.y, digits)];
const median = (values: number[]) => { const v = [...values].sort((a, b) => a - b); return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : NaN; };
const quantile = (values: number[], q: number) => { const v = [...values].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))]; };
const rmsOf = (values: number[]) => values.length ? Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length) : 0;

// ---- sources -------------------------------------------------------------------------------
const sources = new Map<string, {sha256: string; bytes: number; frames: Set<number>; usedFor: Set<string>}>();
async function source(file: string, usedFor: string, frames: number[] = []) {
  let s = sources.get(file);
  if (!s) { const bytes = await readFile(file); s = {sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, frames: new Set(), usedFor: new Set()}; sources.set(file, s); }
  s.usedFor.add(usedFor); frames.forEach(f => s.frames.add(f));
}
async function readFrames(video: string, indices: number[], usedFor: string): Promise<Buffer[]> {
  await source(video, usedFor, indices);
  const sorted = [...new Set(indices)].sort((a, b) => a - b), out = new Map<number, Buffer>();
  for (let c = 0; c < sorted.length; c += 8) { const part = sorted.slice(c, c + 8);
    const raw = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `select=${part.map(n => `eq(n\\,${n})`).join('+')}`, '-fps_mode', 'vfr', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: part.length * N * 3 + (1 << 20)});
    if (raw.length !== part.length * N * 3) throw Error(`${video}: expected ${part.length} frames of ${W}x${H}, got ${raw.length} bytes.`);
    part.forEach((n, i) => out.set(n, raw.subarray(i * N * 3, (i + 1) * N * 3))); }
  return indices.map(n => out.get(n)!);
}

// ---- colour rules (blue, table and skin as in tools/build-anchor.ts) ---------------------------
const isBlue = (r: number, g: number, b: number) => b > 90 && b > 1.5 * r && b > 1.15 * g;
const isTable = (r: number, g: number, b: number) => g > r + 35 && g > b + 35;
const isCardish = (r: number, g: number, b: number) => b > 0.85 * g && b > 1.5 * r; // blue face, also inside a hand shadow
const isYellow = (r: number, g: number, b: number) => r > 170 && g > 150 && b < 120 && Math.abs(r - g) < 80;
const isCardYellow = (r: number, g: number, b: number) => r > 200 && g > 190 && b < 100; // the back itself, without the shoe's gold frame
const isSkin = (r: number, g: number, b: number) => r > 120 && r > g + 15 && g >= b - 25 && r > b + 25 && g > 0.55 * r;
const isDark = (r: number, g: number, b: number) => r < 110 && g < 110 && b < 110 && g - Math.max(r, b) < 28;
// Table green down to a deep contact shadow (rule from src/pamela-contact-shadow.ts).
const isShadedTable = (r: number, g: number, b: number) => g > 32 && g > r * 1.55 && g > b * 1.55 && g - Math.max(r, b) > 28;
const sample = (px: Buffer, x: number, y: number): [number, number, number] => {
  const x0 = Math.max(0, Math.min(W - 2, Math.floor(x))), y0 = Math.max(0, Math.min(H - 2, Math.floor(y))), fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0)), i = (y0 * W + x0) * 3, out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) out[c] = (px[i + c] * (1 - fx) + px[i + 3 + c] * fx) * (1 - fy) + (px[i + W * 3 + c] * (1 - fx) + px[i + W * 3 + 3 + c] * fx) * fy;
  return out;
};

// ---- card quads at sub-pixel precision ------------------------------------------------------
type Edge = 'outer' | 'core'; // outer = where the table ends (face plus pale rim); core = the blue face only
// The plan quad and tools/build-anchor.ts place the blue face, with the rim outside it, so the blue
// face is the card for the plane; the outer silhouette is kept as a variant.
const PRIMARY: Edge = 'core', VARIANT: Edge = 'outer';
type Side = (Segment & {samples: number; sigma: number; viaRim: number; proxy?: boolean}) | null;
type Quad = {corners: Pt[]; sides: Side[]; measured: boolean[]};
function components(px: Buffer, rule: (r: number, g: number, b: number) => boolean, minPixels: number, box: [number, number, number, number] = [0, 0, W - 1, H - 1]) {
  const seen = new Uint8Array(N), out: {pixels: number[]; box: [number, number, number, number]}[] = [], hit = (p: number) => rule(px[p * 3], px[p * 3 + 1], px[p * 3 + 2]);
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const s = y * W + x; if (seen[s] || !hit(s)) continue;
    const stack = [s], pixels: number[] = []; seen[s] = 1; let x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) { const p = stack.pop()!, px0 = p % W, py0 = (p - px0) / W; pixels.push(p); if (px0 < x0) x0 = px0; if (px0 > x1) x1 = px0; if (py0 < y0) y0 = py0; if (py0 > y1) y1 = py0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = px0 + dx, yy = py0 + dy; if (xx < box[0] || yy < box[1] || xx > box[2] || yy > box[3]) continue; const q = yy * W + xx; if (!seen[q] && hit(q)) { seen[q] = 1; stack.push(q); } } }
    if (pixels.length >= minPixels) out.push({pixels, box: [x0, y0, x1, y1]}); }
  return out.sort((a, b) => b.pixels.length - a.pixels.length);
}
const meet = (a: Pt, b: Pt, c: Pt, d: Pt): Pt | null => { const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x); if (Math.abs(den) < 1e-9) return null; const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den; return {x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)}; };
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y), cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
// Enclosing quad of a blob: drop the hull edge whose removal (neighbours extended until they meet) adds least area.
function enclosingQuad(points: Pt[]): Pt[] {
  const poly = hull(points), tri = (a: Pt, b: Pt, c: Pt) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  while (poly.length > 4) { let best = -1, bestArea = Infinity, bestPoint: Pt | null = null; const n = poly.length;
    for (let i = 0; i < n; i++) { const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n], d = poly[(i + 2) % n], m = meet(a, b, d, c);
      if (!m || (m.x - b.x) * (b.x - a.x) + (m.y - b.y) * (b.y - a.y) < 0) continue; const area = tri(b, m, c); if (area < bestArea) { bestArea = area; best = i; bestPoint = m; } }
    if (best < 0) throw Error('Blob has no enclosing quad.'); poly.splice(best, 2, bestPoint!); if (best === n - 1) poly.shift(); }
  return poly;
}
// far-left, far-right, near-right, near-left: clockwise on screen, starting with the upper edge.
function orderQuad(q: Pt[]): Pt[] {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4, ring = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let best = 0, bestY = Infinity; for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; if (b.x > a.x && (a.y + b.y) / 2 < bestY) { bestY = (a.y + b.y) / 2; best = i; } }
  return [0, 1, 2, 3].map(k => ring[(best + k) % 4]);
}
function blobQuad(px: Buffer, rule: (r: number, g: number, b: number) => boolean, box?: [number, number, number, number]): Pt[] {
  const blob = components(px, rule, 400, box)[0]; if (!blob) throw Error('No card-coloured blob found.');
  const member = new Uint8Array(N); for (const p of blob.pixels) member[p] = 1;
  return orderQuad(enclosingQuad(blob.pixels.filter(p => !member[p - 1] || !member[p + 1] || !member[p - W] || !member[p + W]).map(p => ({x: p % W, y: Math.floor(p / W)}))));
}
// Edge crossings along one side, sampled across the side every pixel in every given frame.
function sidePoints(frames: Buffer[], a: Pt, b: Pt, edge: Edge, reach: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y), d = {x: (b.x - a.x) / len, y: (b.y - a.y) / len}, n = {x: -d.y, y: d.x}, points: Pt[] = []; let viaRim = 0;
  for (const px of frames) for (let t = 0.12 * len; t <= 0.88 * len; t += 1) {
    const bx = a.x + d.x * t, by = a.y + d.y * t, at = (s: number) => sample(px, bx + n.x * s, by + n.y * s), inner = [reach, reach - 1].map(at), outer = [-reach, -reach + 1].map(at);
    if (!inner.every(c => edge === 'core' ? isBlue(...c) : isCardish(...c) && !isTable(...c))) continue;
    const pos: number[] = [], rgb: [number, number, number][] = []; for (let s = -reach; s <= reach + 1e-9; s += 0.25) { pos.push(s); rgb.push(at(s)); }
    let hit: number | null = null;
    if (outer.every(c => isTable(...c))) {
      const value = rgb.map(([r, g, bl]) => edge === 'outer' ? g - Math.max(r, bl) : 1.15 * g - bl), m = value.length, level = edge === 'outer' ? (value[0] + value[1] + value[2] + value[3]) / 4 * 0.65 + (value[m - 1] + value[m - 2] + value[m - 3] + value[m - 4]) / 4 * 0.35 : 0;
      if (edge === 'outer') { for (let i = 1; i < m; i++) if (value[i - 1] > level && value[i] <= level) { hit = pos[i - 1] + (value[i - 1] - level) / (value[i - 1] - value[i]) * 0.25; break; } }
      else for (let i = m - 1; i > 0; i--) if (value[i] <= level && value[i - 1] > level) { hit = pos[i - 1] + (value[i - 1] - level) / (value[i - 1] - value[i]) * 0.25; break; }
    } else if (outer.every(c => isCardish(...c))) { // another card outside: the pale rim between two blue faces shows as a red peak
      const red = rgb.map(c => c[0]), top = Math.max(...red), base = (red[0] + red[red.length - 1]) / 2; if (top - base < 30) continue;
      let sw = 0, sp = 0; for (let i = 0; i < red.length; i++) { const w = Math.max(0, red[i] - base - (top - base) * 0.3); sw += w; sp += w * pos[i]; }
      hit = sp / sw + (edge === 'outer' ? -1 : 1); viaRim++;
    }
    if (hit !== null) points.push({x: bx + n.x * hit, y: by + n.y * hit});
  }
  return {points, viaRim};
}
function fitSide(frames: Buffer[], a: Pt, b: Pt, edge: Edge): Side {
  // A hand close to the edge leaves only a few pixels of table: retry with a shorter reach and with
  // the search line moved a little inward or outward before giving the side up as hidden.
  const len0 = Math.hypot(b.x - a.x, b.y - a.y), inward = {x: -(b.y - a.y) / len0, y: (b.x - a.x) / len0};
  for (const [reach, shift] of [[7, 0], [4, 0], [4, 3], [4, -3], [3, 5]]) {
    const move = (p: Pt) => ({x: p.x + inward.x * shift, y: p.y + inward.y * shift});
    const {points, viaRim} = sidePoints(frames, move(a), move(b), edge, reach); let keep = points, mx = 0, my = 0, dir = {x: 1, y: 0}, sigma = 0;
    for (let pass = 0; pass < 5 && keep.length >= 8; pass++) {
      mx = keep.reduce((s, p) => s + p.x, 0) / keep.length; my = keep.reduce((s, p) => s + p.y, 0) / keep.length; let sxx = 0, sxy = 0, syy = 0;
      for (const p of keep) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy); dir = {x: Math.cos(ang), y: Math.sin(ang)};
      const dist = (p: Pt) => Math.abs((p.x - mx) * -dir.y + (p.y - my) * dir.x); sigma = Math.sqrt(keep.reduce((s, p) => s + dist(p) ** 2, 0) / keep.length);
      const limit = Math.max(0.5, 2.5 * sigma), next = keep.filter(p => dist(p) <= limit); if (next.length === keep.length) break; keep = next;
    }
    if (keep.length < 8) continue;
    const along = keep.map(p => (p.x - mx) * dir.x + (p.y - my) * dir.y), lo = Math.min(...along), hi = Math.max(...along); if (hi - lo < 5) continue;
    const ends = [lo, hi].map(t => ({x: mx + dir.x * t, y: my + dir.y * t})), forward = (ends[1].x - ends[0].x) * (b.x - a.x) + (ends[1].y - ends[0].y) * (b.y - a.y) >= 0;
    return {a: forward ? ends[0] : ends[1], b: forward ? ends[1] : ends[0], samples: keep.length, sigma, viaRim};
  }
  return null;
}
function measureQuad(frames: Buffer[], seed: Pt[], edge: Edge, rounds = 5): Quad {
  let corners = seed.map(p => ({...p})), sides: Side[] = [null, null, null, null];
  for (let round = 0; round < rounds; round++) {
    sides = [0, 1, 2, 3].map(k => fitSide(frames, corners[k], corners[(k + 1) % 4], edge));
    const line = (k: number): Segment => sides[k] ?? {a: corners[k], b: corners[(k + 1) % 4]};
    corners = [0, 1, 2, 3].map(k => meet(line((k + 3) % 4).a, line((k + 3) % 4).b, line(k).a, line(k).b) ?? corners[k]);
  }
  return {corners, sides, measured: [0, 1, 2, 3].map(k => !!sides[(k + 3) % 4] && !!sides[k])};
}
const observation = (id: string, q: Quad): CardObservation => ({id, corners: q.corners, sides: q.sides.map(s => s && {a: s.a, b: s.b})});
const cornersFromSides = (q: Quad): Quad => { const side = (k: number): Segment => q.sides[k] ?? {a: q.corners[k], b: q.corners[(k + 1) % 4]}; return {...q, corners: [0, 1, 2, 3].map(k => meet(side((k + 3) % 4).a, side((k + 3) % 4).b, side(k).a, side(k).b) ?? q.corners[k]), measured: [0, 1, 2, 3].map(k => !!q.sides[(k + 3) % 4] && !!q.sides[k])}; };

// ---- the plan ----------------------------------------------------------------------------
await source(PLAN, 'planned card quads (read only)');
const plan: PlacementPlan = JSON.parse(await readFile(PLAN, 'utf8')); validatePlan(plan);
const flat = plan.tableProjection?.mode !== 'individual';
// Plan quads in V6 native pixels (1762 wide) and in film pixels (1764 wide, as tools/build-anchor.ts scales them).
const planNative = Object.fromEntries(TARGETS.map(id => [id, flat ? flatQuad(plan.targets[id].geometry.native, plan.targets['P4.C1'].geometry.native, 'native', plan.tableProjection?.heading ?? 0) : quad(plan.targets[id].geometry.native, 'native')])) as Record<string, Pt[]>;
const planFilm = Object.fromEntries(TARGETS.map(id => [id, planNative[id].map(p => ({x: p.x * TO_FILM, y: p.y}))])) as Record<string, Pt[]>;

// ---- 1. landed cards ---------------------------------------------------------------------------
type CardJob = {id: string; family: 'PLAN' | 'GENERATOR'; target: string | null; clip: string; frames: number[]; seed: 'plan' | 'blob'; role: 'FIT' | 'CHECK' | 'COMPARE'; note: string};
const CARD_JOBS: CardJob[] = [
  {id: 'P4.C1', family: 'PLAN', target: 'P4.C1', clip: 'pamela-p4-c1-plan-return-idle-01', frames: [62, 68, 74, 80, 86, 89], seed: 'blob', role: 'FIT', note: 'card alone, hand withdrawn'},
  {id: 'P1.C1', family: 'PLAN', target: 'P1.C1', clip: 'pamela-p1-c1-plan-return-idle-02', frames: [60, 66, 72, 78, 84, 89], seed: 'blob', role: 'FIT', note: 'card alone, hand withdrawn'},
  {id: 'P4.C2', family: 'PLAN', target: 'P4.C2', clip: 'pamela-p4-c2-plan-deal-01', frames: [113, 115, 117, 119], seed: 'plan', role: 'FIT', note: 'second card on top of the first, fingers on it; left side and part of the near side read from the rim against the lower card'},
  {id: 'P7.C1', family: 'PLAN', target: 'P7.C1', clip: 'pamela-p7-c1-plan-deal-01', frames: [116, 117, 118, 119], seed: 'plan', role: 'FIT', note: 'hand resting on the card, far part in deep hand shadow'},
  {id: 'P7.C1 take 2', family: 'PLAN', target: 'P7.C1', clip: 'pamela-p7-c1-plan-deal-02', frames: [116, 117, 118, 119], seed: 'plan', role: 'CHECK', note: 'second generation of the same landing; hand covers the far edge'},
  {id: 'P4.C1 deal clip', family: 'PLAN', target: 'P4.C1', clip: 'pamela-p4-c1-plan-deal-02', frames: [117, 118, 119], seed: 'blob', role: 'CHECK', note: 'same landing in the deal clip, hand just released'},
  {id: 'GEN deal-calm', family: 'GENERATOR', target: null, clip: 'pamela-p4-c1-deal-calm-01', frames: [117, 118, 119], seed: 'blob', role: 'COMPARE', note: 'landed card without a planned end quad, but generated with a last image'},
  {id: 'GEN source-turn', family: 'GENERATOR', target: null, clip: 'pamela-p4-c1-source-turn', frames: [100, 105, 110, 115, 119], seed: 'blob', role: 'COMPARE', note: 'generator-rendered landed card, no planned end quad'},
];
type CardMeasure = CardJob & {outer: Quad; core: Quad; temporalStd: number; firstFrame: Buffer};
const cards: CardMeasure[] = [];
for (const job of CARD_JOBS) {
  const frames = await readFrames(clip(job.clip), job.frames, `landed card ${job.id}`), seed = job.seed === 'plan' ? planFilm[job.target!] : blobQuad(frames[frames.length - 1], isBlue, [0, 860, W - 1, H - 1]);
  const outer = measureQuad(frames, seed, 'outer'), core = measureQuad(frames, seed, 'core');
  // Frame-to-frame scatter of the corners, each frame measured on its own from the pooled result.
  const single = frames.map(f => measureQuad([f], outer.corners, 'outer', 2)), spread: number[] = [];
  for (let k = 0; k < 4; k++) { const seen = single.filter(q => q.measured[k]).map(q => q.corners[k]); if (seen.length < 2) continue; const mx = seen.reduce((s, p) => s + p.x, 0) / seen.length, my = seen.reduce((s, p) => s + p.y, 0) / seen.length; spread.push(Math.sqrt(seen.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / (seen.length - 1))); }
  cards.push({...job, outer, core, temporalStd: spread.length ? rmsOf(spread) : NaN, firstFrame: Buffer.from(frames[frames.length - 1])});
}
// Width of the pale rim per side (far, right, near, left), from cards where both edges were read.
const rimOf = (c: {outer: Quad; core: Quad}, k: number) => { const s = c.outer.sides[k], inner = c.core.sides[k]; if (!s || !inner || s.viaRim || inner.viaRim || inner.proxy) return null; const m = {x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2}, n = Math.hypot(inner.b.x - inner.a.x, inner.b.y - inner.a.y); return Math.abs((m.x - inner.a.x) * (inner.b.y - inner.a.y) - (m.y - inner.a.y) * (inner.b.x - inner.a.x)) / n; };
const rimBySide = [0, 1, 2, 3].map(k => median(cards.map(c => rimOf(c, k)).filter((v): v is number => v !== null))), rimWidths = cards.flatMap(c => [0, 1, 2, 3].map(k => rimOf(c, k)).filter((v): v is number => v !== null));
// A blue-face side lost in deep hand shadow is taken from the outer edge, moved in by that side's usual rim.
for (const c of cards) { let filled = false;
  c.core.sides = c.core.sides.map((s, k) => { const o = c.outer.sides[k]; if (s || !o) return s; const len = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y), n = {x: -(o.b.y - o.a.y) / len * rimBySide[k], y: (o.b.x - o.a.x) / len * rimBySide[k]}; filled = true; return {...o, a: {x: o.a.x + n.x, y: o.a.y + n.y}, b: {x: o.b.x + n.x, y: o.b.y + n.y}, proxy: true}; });
  if (filled) c.core = cornersFromSides(c.core); }
const card = (id: string) => cards.find(c => c.id === id)!;
const centreOf = (q: Pt[]): Pt => ({x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4});
const cornerGaps = (a: Pt[], b: Pt[]) => a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y));
const spreadOf = (values: number[]) => ({p2_5: quantile(values, 0.025), p16: quantile(values, 0.16), median: quantile(values, 0.5), p84: quantile(values, 0.84), p97_5: quantile(values, 0.975)});

// Table frame used everywhere below: origin at the centre of the P4.C1 card, X parallel to the
// table's vanishing line toward image right, Y away from the camera.
function tableFrame(H0: Mat3, originPose: CardPose) { const turn = horizonRotation(H0); return {H: reframe(H0, originPose, turn), turn, origin: {x: originPose.x, y: originPose.y}}; }
const shapeOf = (q: Pt[]) => { const s = quadShape(q); return {farWidthPx: s.farWidth, nearWidthPx: s.nearWidth, depthPx: s.depth, taper: s.taper, nearEdgeTiltDeg: s.nearEdgeDeg, leftSideSlantDeg: s.leftEdgeDeg, rightSideSlantDeg: s.rightEdgeDeg}; };

// ---- 1a. the plan's own sixteen quads as a plane ----------------------------------------------
const planFit = fitPlane(['P4.C1', ...TARGETS.filter(id => id !== 'P4.C1')].map(id => ({id, corners: planFilm[id]}))), planFrame = tableFrame(planFit.H, {x: 0, y: 0, heading: 0});
const planPoses = Object.fromEntries(planFit.cards.map(c => [c.id, reframePose(c.pose, planFrame.origin, planFrame.turn)])) as Record<string, CardPose>;

// ---- 1b. one plane through the planned-family film cards --------------------------------------
// Primary model: level rows. The only visible straight table line, where the dealer's body meets
// the table, is horizontal, and held-out cards are predicted better this way than by a free homography.
// Every fit is started twice, from the first card alone and from the plan's plane with each card on
// its planned place; the lower residual wins and the difference is kept as a convergence check.
type Listed = {id: string; outer: Quad; core: Quad; target?: string | null};
function solvePlane(list: Listed[], edge: Edge, levelRows = true, initial?: {H: Mat3; poses: CardPose[]}, originAt?: Pt) {
  const obs = list.map(c => observation(c.id, c[edge])), planned = list.every(c => c.target) ? {H: planFrame.H, poses: list.map(c => planPoses[c.target!])} : null;
  const tries = initial ? [fitPlane(obs, {levelRows, initial})] : [fitPlane(obs, {levelRows}), ...(planned ? [fitPlane(obs, {levelRows, initial: planned})] : [])], fit = tries.reduce((best, t) => t.residualRms < best.residualRms ? t : best);
  // Without the P4.C1 card the origin is put under the pixel where the full fit has it, so distances stay comparable.
  const anchor = fit.cards.find(c => c.id === 'P4.C1'), frame = tableFrame(fit.H, anchor ? anchor.pose : originAt ? {...applyH(inv3(fit.H), originAt), heading: 0} : fit.cards[0].pose);
  return {H: frame.H, fit, startSpread: Math.max(...tries.map(t => t.residualRms)) - fit.residualRms, raw: {H: fit.H, poses: fit.cards.map(c => c.pose)}, cards: fit.cards.map(c => ({...c, pose: reframePose(c.pose, frame.origin, frame.turn)}))};
}
// A 63 x 88 mm card lying square to the table axes whose image centre is a given pixel.
function cardAt(Hm: Mat3, centre: Pt, heading = 0) {
  const start = applyH(inv3(Hm), centre); let x = start.x, y = start.y;
  for (let i = 0; i < 12; i++) { const c = centreOf(projectCard(Hm, {x, y, heading})), ex = centre.x - c.x, ey = centre.y - c.y; if (Math.hypot(ex, ey) < 1e-9) break;
    const e = 0.01, px = centreOf(projectCard(Hm, {x: x + e, y, heading})), py = centreOf(projectCard(Hm, {x, y: y + e, heading})), a = (px.x - c.x) / e, b = (py.x - c.x) / e, c2 = (px.y - c.y) / e, d = (py.y - c.y) / e, det = a * d - b * c2;
    x += (ex * d - ey * b) / det; y += (ey * a - ex * c2) / det; }
  return {pose: {x, y, heading}, quad: projectCard(Hm, {x, y, heading})};
}
const predict = (Hm: Mat3) => Object.fromEntries(TARGETS.map(id => [id, cardAt(Hm, centreOf(planFilm[id])).quad])) as Record<string, Pt[]>;
const movedBetween = (a: Record<string, Pt[]>, b: Record<string, Pt[]>) => Object.fromEntries(TARGETS.map(id => [id, Math.max(...cornerGaps(a[id], b[id]))])) as Record<string, number>;
// Local image scale of the table under an image point, in pixels per millimetre: along X, along Y,
// and frame-free as the largest and smallest stretch (their ratio is the foreshortening).
function scaleAt(Hm: Mat3, at: Pt) { const P = applyH(inv3(Hm), at), o = applyH(Hm, P), ex = applyH(Hm, {x: P.x + 1, y: P.y}), ey = applyH(Hm, {x: P.x, y: P.y + 1}), a = ex.x - o.x, c = ex.y - o.y, b = ey.x - o.x, d = ey.y - o.y;
  const s = (a * a + b * b + c * c + d * d) / 2, t = Math.sqrt(Math.max(0, s * s - (a * d - b * c) ** 2)), widest = Math.sqrt(s + t), narrowest = Math.sqrt(Math.max(0, s - t));
  return {tableMm: P, alongX: Math.hypot(a, c), alongY: Math.hypot(b, d), widest, narrowest, foreshortening: narrowest / widest}; }
// Pinhole behind a plane. The principal column is taken where the plane itself puts it (the one
// column for which a square-pixel camera is exact); the image-centre variant is kept for comparison.
function cameraOf(Hm: Mat3) {
  const column = principalXFromHomography(Hm, IMAGE), d = decomposeHomography(Hm, IMAGE, column === null ? undefined : {x: column, y: (H - 1) / 2}), centred = decomposeHomography(Hm, IMAGE); if (!d) return null;
  return {focalPx: d.focalPx, horizontalFovDeg: d.horizontalFovDeg, verticalFovDeg: d.verticalFovDeg, pitchDownDeg: d.camera.pitchDeg, rollDeg: d.camera.rollDeg, heightAboveTableMm: d.camera.heightMm, groundDistanceToOriginMm: d.groundDistanceToOriginMm, distanceToOriginMm: d.distanceToOriginMm,
    viewAngleAtOriginDeg: d.viewAngleAtOriginDeg, horizonYAtImageCentre: horizon(Hm, (W - 1) / 2).y, principalX: d.camera.cx, focalWithCentredPrincipalPx: centred?.focalPx ?? null, axisAngleWithCentredPrincipalDeg: centred?.axisAngleDeg ?? null, positionMm: {x: d.camera.x, y: d.camera.y, z: d.camera.heightMm}, model: d.camera};
}
type CameraSummary = NonNullable<ReturnType<typeof cameraOf>>;
const fitCards = cards.filter(c => c.role === 'FIT'), plane = solvePlane(fitCards, PRIMARY), planeCamera = cameraOf(plane.H), base = predict(plane.H);
if (!planeCamera) throw Error('The fitted plane has no pinhole camera; inspect the card measurements.');
const originPx = applyH(plane.H, {x: 0, y: 0});
const general = solvePlane(fitCards, PRIMARY, false), generalCamera = cameraOf(general.H), generalMoved = movedBetween(predict(general.H), base);
const ssr = (f: {residualRms: number; residuals: number}) => f.residualRms ** 2 * f.residuals, extra = general.fit.parameters - plane.fit.parameters, fStatistic = ((ssr(plane.fit) - ssr(general.fit)) / extra) / (ssr(general.fit) / general.fit.redundancy);

// Leave one card out: how well the others predict it, and how far the predicted cards move.
const leaveOut = (levelRows: boolean, reference: Record<string, Pt[]>) => fitCards.map(left => {
  const p = solvePlane(fitCards.filter(c => c !== left), PRIMARY, levelRows, undefined, originPx), back = fitCardPose(p.H, observation(left.id, left[PRIMARY])), moved = movedBetween(predict(p.H), reference);
  return {leftOut: left.id, camera: cameraOf(p.H), leftOutCardEdgeRms: back.residualRms, leftOutCardEdgeMax: back.residualMax, leftOutCardCornerRms: back.cornerRms, moved, movedMax: Math.max(...Object.values(moved)), startSpread: p.startSpread};
});
const leaveOneOut = leaveOut(true, base), generalLeaveOneOut = leaveOut(false, predict(general.H));
// Uncertainty of the plane: every measured side is moved as a line, by the fit's own residual at
// each end of the full side, and the plane refitted. The residual is mostly the generator drawing
// each card a little differently, not pixel noise, so this is the honest size of the disturbance.
const noiseSigma = Math.max(0.5, plane.fit.residualRms), noiseRuns = 300, random = seededRandom(20261111);
const disturbed = (q: Quad): Quad => cornersFromSides({...q, sides: q.sides.map((s, k) => { if (!s) return s; const A = q.corners[k], B = q.corners[(k + 1) % 4], len = Math.hypot(B.x - A.x, B.y - A.y), d = {x: (B.x - A.x) / len, y: (B.y - A.y) / len}, e0 = noiseSigma * random.gaussian(), e1 = noiseSigma * random.gaussian();
  const move = (p: Pt): Pt => { const t = ((p.x - A.x) * d.x + (p.y - A.y) * d.y) / len, e = e0 + (e1 - e0) * t; return {x: p.x - d.y * e, y: p.y + d.x * e}; }; return {...s, a: move(s.a), b: move(s.b)}; })});
const noise = Array.from({length: noiseRuns}, () => { const p = solvePlane(fitCards.map(c => ({id: c.id, outer: c.outer, core: c.core, [PRIMARY]: disturbed(c[PRIMARY])})), PRIMARY, true, plane.raw); return {camera: cameraOf(p.H), pred: predict(p.H), rms: p.fit.residualRms}; });
const noiseCameras = noise.map(n => n.camera).filter((c): c is CameraSummary => !!c);
const noiseMoved = Object.fromEntries(TARGETS.map(id => [id, quantile(noise.map(n => Math.max(...cornerGaps(n.pred[id], base[id]))), 0.95)])) as Record<string, number>;
// The same fit on the outer silhouette (face plus rim), for whoever needs the card with its rim.
const planeRim = solvePlane(fitCards, VARIANT), rimCamera = cameraOf(planeRim.H), rimPredict = predict(planeRim.H);
const estimate =(pick: (c: CameraSummary) => number, digits: number, how: string) => { const loo = leaveOneOut.map(l => l.camera).filter((c): c is CameraSummary => !!c).map(pick), mc = spreadOf(noiseCameras.map(pick));
  return {value: round(pick(planeCamera), digits), leaveOneOutRange: [round(Math.min(...loo), digits), round(Math.max(...loo), digits)], noise95Range: [round(mc.p2_5, digits), round(mc.p97_5, digits)], noise68Range: [round(mc.p16, digits), round(mc.p84, digits)],
    outerSilhouetteEdge: rimCamera ? round(pick(rimCamera), digits) : null, unconstrainedModel: generalCamera ? round(pick(generalCamera), digits) : null, basis: 'DERIVED', how}; };

// ---- 1c. the plan against the calibrated plane, target by target -----------------------------
const planPlane = {H: planFrame.H, residualRms: planFit.residualRms, residualMax: Math.max(...planFit.cards.map(c => c.residualMax)), camera: cameraOf(planFrame.H)};
const targetRows = TARGETS.map(id => {
  const p = planFilm[id], cal = cardAt(plane.H, centreOf(p)), gaps = cornerGaps(cal.quad, p), rimGaps = cornerGaps(rimPredict[id], p), best = fitCardPose(plane.H, {id, corners: p}), on = quadOnPlane(plane.H, p), seen = cards.find(c => c.target === id && c.role === 'FIT'), face = seen?.[PRIMARY];
  const film = seen && face && {clip: seen.clip, blueFaceQuadPx: face.corners, outerQuadPx: seen.outer.corners, cornersMeasured: face.measured, sideFromOuterEdge: face.sides.map(s => !!s?.proxy), filmVsPlanCornerPx: cornerGaps(face.corners, p).map((g, k) => face.measured[k] ? g : null),
    centreOffsetPx: {x: centreOf(face.corners).x - centreOf(p).x, y: centreOf(face.corners).y - centreOf(p).y}, shape: shapeOf(face.corners), headingOnPlaneDeg: plane.cards.find(c => c.id === seen.id)!.pose.heading};
  return {id, planQuadPx: p, calibratedQuadPx: cal.quad, tablePositionMm: cal.pose, cornerGapPx: gaps, cornerGapMaxPx: Math.max(...gaps), cornerGapRmsPx: rmsOf(gaps), outerSilhouetteCornerGapMaxPx: Math.max(...rimGaps), bestPoseCornerRmsPx: best.cornerRms!,
    planQuadOnPlaneMm: {width: on.widthMm, height: on.heightMm}, planShape: shapeOf(p), calibratedShape: shapeOf(cal.quad), film};
});
const worst = [...targetRows].sort((a, b) => b.cornerGapMaxPx - a.cornerGapMaxPx);

// ---- 1d. cards the generator drew by itself, against the plane --------------------------------
// One small card fixes scale and foreshortening where it lies, but hardly any perspective: its own
// vanishing line is reported only to show how loose that is.
const generatorRows = cards.filter(c => c.family === 'GENERATOR').map(c => {
  const q = c[PRIMARY], obs = observation(c.id, q), on = quadOnPlane(plane.H, q.corners), best = fitCardPose(plane.H, obs), own = fitPlane([obs]).H, model = cardAt(plane.H, centreOf(q.corners)), s = scaleAt(own, centreOf(q.corners)), there = scaleAt(plane.H, centreOf(q.corners));
  return {id: c.id, clip: c.clip, frames: c.frames, quadPx: q.corners, shape: shapeOf(q.corners), planeCardAtSamePlace: {quadPx: model.quad, shape: shapeOf(model.quad)}, sizeOnPlaneMm: {width: on.widthMm, height: on.heightMm}, sizeRatio: {width: on.widthMm / CARD_MM.width, height: on.heightMm / CARD_MM.height},
    bestPoseEdgeRmsPx: best.residualRms, bestPoseEdgeMaxPx: best.residualMax, ownScalePxPerMm: s.widest, ownForeshortening: s.foreshortening, planeScalePxPerMm: there.widest, planeForeshortening: there.foreshortening, ownHorizonY: horizon(own, (W - 1) / 2).y, temporalStd: c.temporalStd};
});
const checkRows = cards.filter(c => c.role === 'CHECK').map(c => { const q = c[PRIMARY], best = fitCardPose(plane.H, observation(c.id, q)), twin = cards.find(o => o.role === 'FIT' && o.target === c.target)![PRIMARY], real = (x: Quad, k: number) => x.measured[k] && !x.sides[k]?.proxy && !x.sides[(k + 3) % 4]?.proxy;
  return {id: c.id, clip: c.clip, frames: c.frames, target: c.target, quadPx: q.corners, cornersMeasured: q.measured, edgeRmsOnPlanePx: best.residualRms, edgeMaxOnPlanePx: best.residualMax, cornerShiftAgainstFitClipPx: cornerGaps(q.corners, twin.corners).map((g, k) => real(q, k) && real(twin, k) ? g : null)}; });
// The older white-card take behind V6 put a much larger card on the same spot (constant `landed` in src/pamela-card-contact-v6.ts, native pixels).
const v6Landed = [[820, 1026], [943, 1026], [963, 1091], [802, 1093]].map(([x, y]) => ({x: x * TO_FILM, y})), v6OnPlane = quadOnPlane(plane.H, v6Landed);

// ---- 1e. things of roughly known size, as sanity checks, on a frame with both hands at rest ----
const idleFrame = card('P4.C1').firstFrame, idleRef = `${card('P4.C1').clip} f${card('P4.C1').frames.at(-1)}`;
function dealerEdgeRow(px: Buffer) { const rows: number[] = []; for (let x = 846; x <= 900; x++) { let last = -1; for (let y = 760; y <= 880; y++) { const i = (y * W + x) * 3; if (isDark(px[i], px[i + 1], px[i + 2])) last = y; } if (last > 0) rows.push(last); } return rows.length >= 10 ? median(rows) + 0.5 : NaN; }
const edgeRowMeasured = dealerEdgeRow(idleFrame), edgeRow = Number.isFinite(edgeRowMeasured) ? edgeRowMeasured : 829.5;
const mmBetween = (Hm: Mat3, a: Pt, b: Pt) => { const p = applyH(inv3(Hm), a), q = applyH(inv3(Hm), b); return Math.hypot(p.x - q.x, p.y - q.y); };
const shoeCardQuad = blobQuad(idleFrame, isCardYellow, [1150, 650, 1450, 900]), shoeCardSides = [0, 1, 2, 3].map(k => Math.hypot(shoeCardQuad[k].x - shoeCardQuad[(k + 1) % 4].x, shoeCardQuad[k].y - shoeCardQuad[(k + 1) % 4].y)).sort((a, b) => a - b);
// Lower outline of the shoe: its long base edge lies on the table.
const shoeBase = (() => { const bottom: Pt[] = []; for (let x = 1150; x < W; x++) { let last = -1, count = 0; for (let y = 600; y < 1000; y++) { const i = (y * W + x) * 3; if (isDark(idleFrame[i], idleFrame[i + 1], idleFrame[i + 2])) { last = y; count++; } } if (count >= 20) bottom.push({x, y: last}); }
  const lowest = Math.max(...bottom.map(p => p.y)), front = median(bottom.filter(p => p.y >= lowest - 0.5).map(p => p.x)), back = Math.max(...bottom.map(p => p.x)), run = bottom.filter(p => p.x > front + 20 && p.x < back - 20);
  const mx = run.reduce((s, p) => s + p.x, 0) / run.length, my = run.reduce((s, p) => s + p.y, 0) / run.length, slope = run.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / run.reduce((s, p) => s + (p.x - mx) ** 2, 0), at = (x: number) => ({x, y: my + slope * (x - mx)});
  return {front: at(front), back: at(back)}; })();
// A resting hand: its widest row of skin, read on the table where the fingers lie.
const hands = [{name: 'dealer right hand (image left)', box: [640, 770, 880, 905]}, {name: 'dealer left hand (image right)', box: [881, 770, 1110, 905]}].flatMap(h => { const blob = components(idleFrame, isSkin, 800, h.box as [number, number, number, number])[0]; if (!blob) return [];
  const rowsSeen = new Map<number, [number, number]>(); for (const p of blob.pixels) { const x = p % W, y = (p - x) / W, r = rowsSeen.get(y); if (!r) rowsSeen.set(y, [x, x]); else { if (x < r[0]) r[0] = x; if (x > r[1]) r[1] = x; } }
  const [row, [x0, x1]] = [...rowsSeen.entries()].sort((a, b) => (b[1][1] - b[1][0]) - (a[1][1] - a[1][0]))[0], a = {x: x0, y: row}, b = {x: x1, y: row};
  return [{name: h.name, row, from: a, to: b, widthPx: x1 - x0 + 1, widthOnPlaneMm: mmBetween(plane.H, a, b), planeScalePxPerMm: scaleAt(plane.H, {x: (x0 + x1) / 2, y: row}).alongX}]; });
const shoeFoot = scaleAt(plane.H, shoeBase.front), edgeMid = applyH(inv3(plane.H), {x: (W - 1) / 2, y: edgeRow});
const shoeBaseMm = mmBetween(plane.H, shoeBase.front, shoeBase.back), shoeCardScale = shoeCardSides[3] / CARD_MM.height;

// ---- 2. light and shadow -------------------------------------------------------------------
// The lit table is flat green, so darkness is read straight from the green channel against the
// frame's own lit level. Only table pixels count; dealer, shoe and cards are excluded.
const shadowVideo = clip(SHADOW_CLIP), tableTop = Math.ceil(edgeRow) + 1, LIT_PATCHES: [number, number, number, number][] = [[60, 1050, 500, 1160], [1250, 1050, 1700, 1160], [60, 860, 450, 960]], NOISE_GATE = 0.02;
const matteDir = `${WORK}/shadow-matte/${SHADOW_CLIP}`;
function litLevel(px: Buffer) { const levels = LIT_PATCHES.map(([x0, y0, x1, y1]) => { const v: number[] = []; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * W + x) * 3; if (isShadedTable(px[i], px[i + 1], px[i + 2])) v.push(px[i + 1]); } return median(v); });
  return {level: levels.reduce((s, v) => s + v, 0) / levels.length, patches: levels}; }
// Things that never move in this clip (body, resting hand, shoe): not table in nearly every sampled frame.
const staticIdx = Array.from({length: 20}, (_, i) => i * 6), staticCount = new Uint8Array(N);
for (const px of await readFrames(shadowVideo, staticIdx, 'static foreground for the shadow matte')) for (let p = 0; p < N; p++) if (!isShadedTable(px[p * 3], px[p * 3 + 1], px[p * 3 + 2])) staticCount[p]++;
const staticFg = new Uint8Array(N); for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { if (staticCount[y * W + x] < 18) continue; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) staticFg[(y + dy) * W + x + dx] = 1; }

function shadowMatte(px: Buffer, level: number) {
  const table = new Uint8Array(N), solid = new Uint8Array(N), row = new Uint8Array(N), dark = new Float32Array(N), grey = new Uint8Array(N), value = new Float32Array(N);
  for (let p = tableTop * W; p < N; p++) { const i = p * 3; if (isShadedTable(px[i], px[i + 1], px[i + 2])) { table[p] = 1; dark[p] = Math.max(0, Math.min(1, 1 - px[i + 1] / level)); } }
  // Keep only table pixels with table all around (2 px): edge pixels mix hand or card colour into the green.
  for (let y = tableTop; y < H; y++) for (let x = 0; x < W; x++) { let ok = 1; for (let dx = -2; dx <= 2 && ok; dx++) { const xx = x + dx; if (xx >= 0 && xx < W && !table[y * W + xx]) ok = 0; } row[y * W + x] = ok; }
  for (let y = tableTop; y < H; y++) for (let x = 0; x < W; x++) { let ok = 1; for (let dy = -2; dy <= 2 && ok; dy++) { const yy = y + dy; if (yy >= tableTop && yy < H && !row[yy * W + x]) ok = 0; } solid[y * W + x] = ok; }
  // 3x3 mean among solid pixels, then a soft gate that removes compression noise without biasing real shadow.
  for (let y = tableTop; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!solid[p]) continue; let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < tableTop || yy >= H) continue; const q = yy * W + xx; if (solid[q]) { s += dark[q]; n++; } }
    const d = s / n, t = Math.max(0, Math.min(1, (d - NOISE_GATE / 2) / NOISE_GATE)); value[p] = d * t * t * (3 - 2 * t); }
  // Carry the nearest measured value 3 px into the excluded rim so a consumer that ignores alpha gets no light halo.
  const known = Uint8Array.from(solid);
  for (let pass = 0; pass < 3; pass++) { const add: [number, number][] = [];
    for (let y = tableTop; y < H; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x; if (known[p]) continue; let s = 0, n = 0; for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= tableTop * W && q < N && known[q]) { s += value[q]; n++; } if (n) add.push([p, s / n]); }
    for (const [p, v] of add) { value[p] = v; known[p] = 1; } }
  for (let p = tableTop * W; p < N; p++) grey[p] = Math.round(value[p] * 255);
  return {grey, solid, value};
}
// Quarter-scale grids for the cast measurement.
const Q = 4, GW = Math.floor(W / Q), GH = Math.floor(H / Q), SIGMAS = [2, 3, 4.5, 6.5, 9, 12, 16, 21, 27, 34, 42, 52, 64, 80];
function blurGrid(src: Float32Array, w: number, h: number, sigma: number) {
  const radius = Math.max(1, Math.ceil(3 * sigma)), kernel = Array.from({length: 2 * radius + 1}, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma))), sum = kernel.reduce((s, v) => s + v, 0), tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx >= 0 && xx < w) s += src[y * w + xx] * kernel[k + radius]; } tmp[y * w + x] = s / sum; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy >= 0 && yy < h) s += tmp[yy * w + x] * kernel[k + radius]; } out[y * w + x] = s / sum; }
  return out;
}
// Where does the shadow lie relative to the hand and card that cast it, and how blurred is it?
// The silhouette of the moving hand and card is slid over the matte; the best overlap gives the
// offset, and the Gaussian blur of the slid silhouette that best explains the matte gives softness.
function measureCast(px: Buffer, matte: {solid: Uint8Array; value: Float32Array}) {
  const caster = new Float32Array(GW * GH), seen = new Float32Array(GW * GH), shade = new Float32Array(GW * GH); let cells = 0, sx = 0, sy = 0, x0 = GW, x1 = 0, y0 = GH, y1 = 0;
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) { let c = 0, v = 0, s = 0;
    for (let dy = 0; dy < Q; dy++) for (let dx = 0; dx < Q; dx++) { const p = (gy * Q + dy) * W + gx * Q + dx, i = p * 3, r = px[i], g = px[i + 1], b = px[i + 2];
      if (!staticFg[p] && !isShadedTable(r, g, b) && (isSkin(r, g, b) || isBlue(r, g, b) || isYellow(r, g, b))) c++; if (matte.solid[p]) { v++; s += matte.value[p]; } }
    const k = gy * GW + gx; caster[k] = c / (Q * Q); seen[k] = v / (Q * Q); shade[k] = v ? s / v : 0;
    if (caster[k] >= 0.5) { cells++; sx += gx; sy += gy; if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy; } }
  if (cells < 60) return null;
  const score = (dx: number, dy: number) => { let num = 0, den = 0; for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const c = caster[gy * GW + gx]; if (!c) continue; const xx = gx + dx, yy = gy + dy; if (xx < 0 || xx >= GW || yy < 0 || yy >= GH) continue; const k = yy * GW + xx; num += c * seen[k] * shade[k]; den += c * c * seen[k]; } return den > 0.15 * cells ? num / Math.sqrt(den) : 0; };
  let best = {dx: 0, dy: 0, s: 0}; const range = {x: [-25, 30], y: [-6, 50]};
  for (let dy = range.y[0]; dy <= range.y[1]; dy++) for (let dx = range.x[0]; dx <= range.x[1]; dx++) { const s = score(dx, dy); if (s > best.s) best = {dx, dy, s}; }
  if (best.s <= 0) return null;
  const peak = (a: number, b: number, c: number) => { const d = a - 2 * b + c; return Math.abs(d) < 1e-12 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / d)); };
  const fx = peak(score(best.dx - 1, best.dy), best.s, score(best.dx + 1, best.dy)), fy = peak(score(best.dx, best.dy - 1), best.s, score(best.dx, best.dy + 1));
  const atEdge = best.dx === range.x[0] || best.dx === range.x[1] || best.dy === range.y[0] || best.dy === range.y[1];
  // Softness: window around the slid silhouette, at quarter scale.
  const pad = 60, wx0 = Math.max(0, x0 + best.dx - pad), wx1 = Math.min(GW - 1, x1 + best.dx + pad), wy0 = Math.max(0, y0 + best.dy - pad), wy1 = Math.min(GH - 1, y1 + best.dy + pad), ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1, slid = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) { const gx = wx0 + x - best.dx, gy = wy0 + y - best.dy; if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) slid[y * ww + x] = caster[gy * GW + gx]; }
  const fits = SIGMAS.map(sigma => { const model = blurGrid(slid, ww, wh, sigma / Q); let a = 0, b = 0, c = 0;
    for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) { const k = (wy0 + y) * GW + wx0 + x, v = seen[k]; if (!v) continue; const m = model[y * ww + x]; a += v * m * shade[k]; b += v * m * m; c += v * shade[k] * shade[k]; }
    const depth = b > 0 ? a / b : 0; return {sigma, depth, residual: c - depth * a, total: c}; });
  const soft = fits.reduce((m, f) => f.residual < m.residual ? f : m), dark: number[] = [];
  for (let y = wy0 * Q; y <= Math.min(H - 1, wy1 * Q + Q - 1); y++) for (let x = wx0 * Q; x <= Math.min(W - 1, wx1 * Q + Q - 1); x++) { const p = y * W + x; if (matte.solid[p]) dark.push(matte.value[p]); }
  return {casterCentre: {x: (sx / cells + 0.5) * Q, y: (sy / cells + 0.5) * Q}, casterPixels: cells * Q * Q, offset: {x: (best.dx + fx) * Q, y: (best.dy + fy) * Q}, overlapScore: best.s, atSearchEdge: atEdge,
    sigmaPx: soft.sigma, sigmaAtLimit: soft.sigma === SIGMAS[0] || soft.sigma === SIGMAS[SIGMAS.length - 1], modelDepth: soft.depth, explained: 1 - soft.residual / Math.max(1e-9, soft.total), peakDarkness: dark.length ? quantile(dark, 0.995) : 0, shadedPixels: dark.filter(v => v > 0.05).length};
}

await rm(matteDir, {recursive: true, force: true}); await mkdir(matteDir, {recursive: true}); await mkdir(REVIEW, {recursive: true});
const shadowFrames = Array.from({length: SHADOW_RANGE[1] - SHADOW_RANGE[0] + 1}, (_, i) => SHADOW_RANGE[0] + i), SHEET = [40, 48, 56, 64, 72, 80, 88, 96, 104], SHEET_BOX = {left: 440, top: 700, width: 920, height: 474};
const video = (file: string, width: number, height: number, format: 'rgb24' | 'gray') => { const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', format, '-s', `${width}x${height}`, '-r', '30', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-movflags', '+faststart', file], {stdio: ['pipe', 'inherit', 'inherit']});
  return {write: async (frame: Buffer) => { if (!child.stdin.write(frame)) await once(child.stdin, 'drain'); }, close: async () => { child.stdin.end(); const [code] = await once(child, 'close'); if (code !== 0) throw Error(`ffmpeg failed writing ${file}`); }}; };
const matteVideoPath = `${REVIEW}/shadow-matte-${SHADOW_CLIP}-f${SHADOW_RANGE[0]}-${SHADOW_RANGE[1]}.mp4`, pairVideoPath = `${REVIEW}/shadow-side-by-side-${SHADOW_CLIP}.mp4`;
const matteVideo = video(matteVideoPath, W, H, 'gray'), pairVideo = video(pairVideoPath, W, 588, 'rgb24');
type CastRow = NonNullable<ReturnType<typeof measureCast>> & {frame: number};
const matteStats: {frame: number; litLevel: number; patchSpread: number; quietNoise: number; peak: number; shadedPixels: number; excludedPixels: number}[] = [], casts: CastRow[] = [], sheetTiles: {frame: number; film: Buffer; matte: Buffer}[] = [];
for (let c = 0; c < shadowFrames.length; c += 8) {
  const part = shadowFrames.slice(c, c + 8), frames = await readFrames(shadowVideo, part, 'shadow matte and light measurement');
  for (let k = 0; k < part.length; k++) {
    const px = frames[k], n = part[k], lit = litLevel(px), matte = shadowMatte(px, lit.level), packed = Buffer.alloc(N * 2); let shaded = 0, excluded = 0; const quiet: number[] = [], solidValues: number[] = [];
    for (let p = 0; p < N; p++) { packed[p * 2] = matte.grey[p]; packed[p * 2 + 1] = matte.solid[p] ? 255 : 0; if (p >= tableTop * W) { if (!matte.solid[p]) excluded++; else { if (matte.value[p] > 0.05) shaded++; if (p % 16 === 0) solidValues.push(matte.value[p]); } } }
    for (const [x0, y0, x1, y1] of LIT_PATCHES) for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { const i = (y * W + x) * 3; quiet.push(1 - px[i + 1] / lit.level); }
    await sharp(packed, {raw: {width: W, height: H, channels: 2}}).toColourspace('b-w').png({compressionLevel: 9}).toFile(`${matteDir}/matte-${String(n).padStart(4, '0')}.png`);
    matteStats.push({frame: n, litLevel: lit.level, patchSpread: (Math.max(...lit.patches) - Math.min(...lit.patches)) / lit.level, quietNoise: rmsOf(quiet), peak: quantile(solidValues, 0.9995), shadedPixels: shaded, excludedPixels: excluded});
    const greyBuffer = Buffer.from(matte.grey.buffer, matte.grey.byteOffset, N); await matteVideo.write(greyBuffer);
    const filmHalf = await sharp(px, {raw: {width: W, height: H, channels: 3}}).resize(882, 588, {fit: 'fill'}).raw().toBuffer(), matteHalf = await sharp(greyBuffer, {raw: {width: W, height: H, channels: 1}}).resize(882, 588, {fit: 'fill'}).toColourspace('srgb').raw().toBuffer(), pair = Buffer.alloc(W * 588 * 3);
    for (let y = 0; y < 588; y++) { filmHalf.copy(pair, y * W * 3, y * 882 * 3, (y + 1) * 882 * 3); matteHalf.copy(pair, (y * W + 882) * 3, y * 882 * 3, (y + 1) * 882 * 3); }
    await pairVideo.write(pair);
    const cast = (n - SHADOW_RANGE[0]) % 4 === 0 ? measureCast(px, matte) : null; if (cast) casts.push({...cast, frame: n});
    if (SHEET.includes(n)) sheetTiles.push({frame: n, film: await sharp(px, {raw: {width: W, height: H, channels: 3}}).extract(SHEET_BOX).png().toBuffer(), matte: await sharp(greyBuffer, {raw: {width: W, height: H, channels: 1}}).extract(SHEET_BOX).toColourspace('srgb').png().toBuffer()});
  }
}
await matteVideo.close(); await pairVideo.close();

// Light from the cast offsets, in the table frame, using the pinhole behind the fitted plane.
// Only the sideways lean is observable: the offset also grows with the hand's unknown height, so
// a lean toward or away from the camera cannot be told from a higher or lower hand.
const lightRows = casts.map(c => {
  const shadowAt = {x: c.casterCentre.x + c.offset.x, y: c.casterCentre.y + c.offset.y}, P = applyH(inv3(plane.H), shadowAt), o = applyH(plane.H, P), jx = applyH(plane.H, {x: P.x + 1, y: P.y}), foot = cameraProject(planeCamera.model, {x: P.x, y: P.y, z: 0}), up = cameraProject(planeCamera.model, {x: P.x, y: P.y, z: 1});
  const a = {x: jx.x - o.x, y: jx.y - o.y}, u = {x: up.x - foot.x, y: up.y - foot.y}, det = a.x * -u.y - -u.x * a.y, lean = (c.offset.x * -u.y - -u.x * c.offset.y) / det, height = (a.x * c.offset.y - a.y * c.offset.x) / det, length = Math.hypot(c.offset.x, c.offset.y);
  const usable = !c.atSearchEdge && length >= 35 && c.peakDarkness >= 0.06 && height > 0 && c.explained >= 0.5, across = Math.hypot(a.x, a.y), sigmaMm = c.sigmaPx / across;
  return {...c, offsetLengthPx: length, offsetAngleFromImageDownDeg: Math.atan2(c.offset.x, c.offset.y) * 180 / Math.PI, usable, heightMm: height, sidewaysLeanDeg: Math.atan(lean / height) * 180 / Math.PI, sigmaMm, sigmaPerOffset: c.sigmaPx / length, risePerAcross: Math.hypot(u.x, u.y) / across};
});
const usableLight = lightRows.filter(r => r.usable), softRows = usableLight.filter(r => !r.sigmaAtLimit), contactRows = matteStats.filter(m => m.frame >= 96);
if (usableLight.length < 3) throw Error('Too few usable cast measurements; inspect the shadow contact sheet.');
const leanDeg = median(usableLight.map(r => r.sidewaysLeanDeg)), leanRange = spreadOf(usableLight.map(r => r.sidewaysLeanDeg)), angleDeg = median(usableLight.map(r => r.offsetAngleFromImageDownDeg));
const towardLight = (() => { const v = [-Math.tan(leanDeg * Math.PI / 180), 0, 1], n = Math.hypot(...v); return v.map(c => c / n); })();
// Blur against offset: sigma = floor + slope * offset. The slope is the part that grows with height.
const softFit = (() => { const xs = softRows.map(r => r.offsetLengthPx), ys = softRows.map(r => r.sigmaPx), n = xs.length; if (n < 3) return null; const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n, slope = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  return {slope, floorPx: my - slope * mx, frames: n, angularSigmaDeg: Math.atan(Math.max(0, slope) * median(softRows.map(r => r.risePerAcross))) * 180 / Math.PI}; })();
const ratioSigmaDeg = softRows.length ? spreadOf(softRows.map(r => Math.atan(r.sigmaMm / r.heightMm) * 180 / Math.PI)) : null;

// ---- 3. portrait framing -------------------------------------------------------------------
// Native composition is 1762 x 1174; the portrait canvas is 1080 x 1920.
const PORTRAIT = {width: 1080, height: 1920}, allNative = TARGETS.flatMap(id => planNative[id]), seatBox = {x0: Math.min(...allNative.map(p => p.x)), x1: Math.max(...allNative.map(p => p.x)), y0: Math.min(...allNative.map(p => p.y)), y1: Math.max(...allNative.map(p => p.y))};
const widthInside = (t: FrameTransform, q: Pt[]) => { const v = quadVisibility(t, q), w = v.box.x1 - v.box.x0; return Math.max(0, Math.min(1, (w - v.overflow.left - v.overflow.right) / w)); };
const v6Rows = TARGETS.map(id => { const v = quadVisibility(V6_PORTRAIT, planNative[id]); return {id, state: v.state, centre: centreOf(v.quad), box: v.box, overflow: v.overflow, widthInside: widthInside(V6_PORTRAIT, planNative[id])}; });
// Dealer silhouette (body and arms, without the shoe) and head top in the resting frame, native pixels.
const dealerBox = (() => { let x0 = W, x1 = 0, top = H; for (let y = 60; y < 730; y++) for (let x = 300; x < 1250; x++) { const i = (y * W + x) * 3; if (isShadedTable(idleFrame[i], idleFrame[i + 1], idleFrame[i + 2])) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < top) top = y; } return {x0: x0 / TO_FILM, x1: x1 / TO_FILM, top}; })();
const v6EdgeY = mapPoint(V6_PORTRAIT, {x: 0, y: edgeRow}).y, shoeBackNative = shoeBase.back.x / TO_FILM;
// Uniform scale that shows a given native x-range with a margin, keeping the dealer's table edge on the row V6 uses.
function uniformFraming(id: string, x0: number, x1: number, margin: number, note: string): FrameTransform & {note: string; margin: number} {
  const s = (PORTRAIT.width - 2 * margin) / (x1 - x0); return {id, scaleX: s, scaleY: s, offsetX: margin - s * x0, offsetY: v6EdgeY - s * edgeRow, clip: {left: 0, top: 0, right: PORTRAIT.width, bottom: PORTRAIT.height}, note, margin};
}
const proposals = [
  uniformFraming('A-all-seats', seatBox.x0, seatBox.x1, 24, 'Uniform scale, every planned card inside with a 24 px side margin. The shoe stays cut at its rear, as in V6.'),
  uniformFraming('B-all-seats-and-shoe', seatBox.x0, shoeBackNative, 16, 'Uniform scale, every planned card and the whole shoe inside with a 16 px side margin.'),
];
const framingReport = (t: FrameTransform) => { const rows = TARGETS.map(id => quadVisibility(t, planNative[id])), top = mapPoint(t, {x: 0, y: 0}).y, bottom = mapPoint(t, {x: 0, y: H}).y;
  return {scale: t.scaleX, offsetX: t.offsetX, offsetY: t.offsetY, nativeColumnsVisible: [-t.offsetX / t.scaleX, (PORTRAIT.width - t.offsetX) / t.scaleX], dealerScaleVersusV6: t.scaleX / V6_PORTRAIT.scaleX, filmRowsOnCanvas: [top, bottom], dealerEdgeRow: mapPoint(t, {x: 0, y: edgeRow}).y, headTopRow: mapPoint(t, {x: 0, y: dealerBox.top}).y,
    canvasRowsWithoutFilm: {above: Math.max(0, top), below: Math.max(0, PORTRAIT.height - bottom)}, cardsInside: rows.filter(r => r.state === 'INSIDE').length, cardsCut: TARGETS.filter((_, i) => rows[i].state !== 'INSIDE'), dealerInside: mapPoint(t, {x: dealerBox.x0, y: 0}).x >= 0 && mapPoint(t, {x: dealerBox.x1, y: 0}).x <= PORTRAIT.width,
    shoeCutNativePx: Math.max(0, shoeBackNative - (PORTRAIT.width - t.offsetX) / t.scaleX), p4CardWidthPx: (planNative['P4.C1'][2].x - planNative['P4.C1'][3].x) * t.scaleX}; };
// The plan also carries hand-set portrait targets. Can any axis-aligned placement of the film reach them?
const portraitPlan = TARGETS.map(id => { const g = plan.targets[id].geometry.portrait; return {x: g.u * (PORTRAIT.width - 1), y: (1 - g.v) * (PORTRAIT.height - 1)}; }), nativeCentres = TARGETS.map(id => centreOf(planNative[id]));
const linear = (from: number[], to: number[]) => { const n = from.length, mx = from.reduce((s, v) => s + v, 0) / n, my = to.reduce((s, v) => s + v, 0) / n, k = from.reduce((s, v, i) => s + (v - mx) * (to[i] - my), 0) / from.reduce((s, v) => s + (v - mx) ** 2, 0); return {scale: k, offset: my - k * mx}; };
const fitX = linear(nativeCentres.map(p => p.x), portraitPlan.map(p => p.x)), fitY = linear(nativeCentres.map(p => p.y), portraitPlan.map(p => p.y));
const portraitPlanGap = TARGETS.map((_, i) => Math.hypot(nativeCentres[i].x * fitX.scale + fitX.offset - portraitPlan[i].x, nativeCentres[i].y * fitY.scale + fitY.offset - portraitPlan[i].y));
const underV6Gap = TARGETS.map((_, i) => { const p = mapPoint(V6_PORTRAIT, nativeCentres[i]); return Math.hypot(p.x - portraitPlan[i].x, p.y - portraitPlan[i].y); });

// ---- 4. review images ----------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const svg = (width: number, height: number, body: string[]) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Arial, Helvetica, sans-serif">${body.join('')}</svg>`);
const polygon = (q: Pt[], stroke: string, width = 1.5, extra = '') => `<polygon points="${q.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" ${extra}/>`;
const line = (a: Pt, b: Pt, stroke: string, width = 1, extra = '') => `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const label = (x: number, y: number, text: string, size = 16, fill = '#fff', extra = '') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" ${extra}>${esc(text)}</text>`;
const plate = (x: number, y: number, w: number, h: number, fill = 'rgba(0,0,0,0.72)') => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
const tag = (x: number, y: number, text: string, size = 15, fill = '#fff') => plate(x - 4, y - size - 2, text.length * size * 0.54 + 10, size + 9) + label(x, y, text, size, fill);
const png = (px: Buffer) => sharp(px, {raw: {width: W, height: H, channels: 3}});

// 4a. The fitted plane as a 100 mm grid on a real frame. The P1 and P7 cards are pasted in from their own clips.
{
  const baseFrame = Buffer.from(idleFrame), pasted: {id: string; box: [number, number, number, number]}[] = [];
  for (const id of ['P1.C1', 'P7.C1']) { const c = card(id), xs = c.outer.corners.map(p => p.x), ys = c.outer.corners.map(p => p.y), box: [number, number, number, number] = [Math.floor(Math.min(...xs)) - 46, Math.floor(Math.min(...ys)) - 70, Math.ceil(Math.max(...xs)) + 46, Math.ceil(Math.max(...ys)) + 30];
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const p = (y * W + x) * 3; c.firstFrame.copy(baseFrame, p, p, p + 3); } pasted.push({id, box}); }
  const body: string[] = [`<defs><clipPath id="table"><rect x="0" y="${edgeRow}" width="${W}" height="${H - edgeRow}"/></clipPath></defs>`], grid: string[] = [];
  const farY = edgeMid.y + 60, nearY = applyH(inv3(plane.H), {x: (W - 1) / 2, y: H + 40}).y, xs: number[] = [], ys: number[] = [];
  for (let x = -1500; x <= 1500; x += 100) xs.push(x); for (let y = Math.floor(nearY / 100) * 100; y <= farY; y += 100) ys.push(y);
  for (const x of xs) grid.push(line(applyH(plane.H, {x, y: nearY - 100}), applyH(plane.H, {x, y: farY}), x === 0 ? '#ffffff' : x % 500 === 0 ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)', x === 0 ? 1.6 : x % 500 === 0 ? 1.4 : 0.8));
  for (const y of ys) grid.push(line(applyH(plane.H, {x: -1600, y}), applyH(plane.H, {x: 1600, y}), y === 0 ? '#ffffff' : y % 500 === 0 ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)', y === 0 ? 1.6 : y % 500 === 0 ? 1.4 : 0.8));
  body.push(`<g clip-path="url(#table)">${grid.join('')}</g>`);
  for (const x of xs) { const p = applyH(plane.H, {x, y: 0}); if (p.x > 20 && p.x < W - 60 && x % 200 === 0) body.push(label(p.x + 3, p.y - 4, `X ${x}`, 13, '#000')); }
  for (const y of ys) { const p = applyH(plane.H, {x: 0, y}); if (p.y > edgeRow + 12 && p.y < H - 4 && y !== 0) body.push(label(p.x + 4, p.y - 3, `Y ${y}`, 13, '#000')); }
  body.push(line({x: 0, y: edgeRow}, {x: W, y: edgeRow}, '#ff4fd8', 1.2, 'stroke-dasharray="10 6"'), tag(14, edgeRow - 10, `dealer-side table edge: row ${edgeRow.toFixed(1)} = Y ${edgeMid.y.toFixed(0)} mm`, 15, '#ff8fe6'));
  const hy = planeCamera.horizonYAtImageCentre, hr = spreadOf(noiseCameras.map(c => c.horizonYAtImageCentre));
  if (hy > 70 && hy < H) body.push(line({x: 0, y: hy}, {x: W, y: hy}, '#ffd400', 1.4, 'stroke-dasharray="14 8"'), tag(14, hy - 10, `table vanishing line: row ${hy.toFixed(0)} (noise 95 % ${hr.p2_5.toFixed(0)}..${hr.p97_5.toFixed(0)}, leave-one-out ${Math.min(...leaveOneOut.map(l => l.camera!.horizonYAtImageCentre)).toFixed(0)}..${Math.max(...leaveOneOut.map(l => l.camera!.horizonYAtImageCentre)).toFixed(0)}, plan ${planPlane.camera ? planPlane.camera.horizonYAtImageCentre.toFixed(0) : 'n/a'})`, 15, '#ffd400'));
  for (const c of plane.cards) body.push(polygon(c.projected, '#ff00c8', 1.4), polygon(card(c.id)[PRIMARY].corners, '#ffffff', 0.8));
  for (const p of pasted) body.push(`<rect x="${p.box[0]}" y="${p.box[1]}" width="${p.box[2] - p.box[0]}" height="${p.box[3] - p.box[1]}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="4 4"/>`, tag(p.box[0], p.box[3] + 20, `${p.id} pasted from ${card(p.id).clip} f${card(p.id).frames.at(-1)}`, 13));
  body.push(line(shoeBase.front, shoeBase.back, '#00e5ff', 2), tag(shoeBase.front.x + 150, shoeBase.front.y - 150, `shoe base ${Math.hypot(shoeBase.back.x - shoeBase.front.x, shoeBase.back.y - shoeBase.front.y).toFixed(0)} px = ${shoeBaseMm.toFixed(0)} mm on this plane`, 15, '#00e5ff'));
  for (const h of hands) body.push(line(h.from, h.to, '#00e5ff', 2), tag(h.from.x - 10, h.row - 150, `hand ${h.widthPx} px = ${h.widthOnPlaneMm.toFixed(0)} mm`, 15, '#00e5ff'));
  body.push(plate(0, 0, W, 62), label(12, 24, `Fitted table plane, 100 mm grid (bold every 500 mm). Origin = centre of the measured P4.C1 card, X to image right, Y toward the dealer. Base frame ${idleRef}.`, 17),
    label(12, 50, `Magenta = 63 x 88 mm card on the plane, white = measured film card. Edge rms ${plane.fit.residualRms.toFixed(2)} px over ${fitCards.length} cards. Millimetres hold only if the film's blue card is a real 63 x 88 mm card; hand and shoe (cyan) do not agree.`, 17));
  await png(baseFrame).composite([{input: svg(W, H, body)}]).png().toFile(`${REVIEW}/plane-grid.png`);
}
// 4b. Film card, calibrated 63 x 88 mm card and plan quad, enlarged.
{
  const K = 5, CW = 150, CH = 96, PW = CW * K, PH = CH * K, TOP = 70, list = [...fitCards.map(c => ({c, plan: planFilm[c.target!]})), {c: card('GEN deal-calm'), plan: null as Pt[] | null}];
  const tiles: sharp.OverlayOptions[] = [], sheetW = PW * list.length, sheetH = (PH + TOP) * 2 + 46;
  for (const [i, {c, plan: planQuad}] of list.entries()) {
    const face = c[PRIMARY], centre = centreOf(face.corners), left = Math.max(0, Math.min(W - CW, Math.round(centre.x - CW / 2))), top = Math.max(0, Math.min(H - CH, Math.round(centre.y - CH / 2))), to = (q: Pt[]) => q.map(p => ({x: (p.x - left + 0.5) * K, y: (p.y - top + 0.5) * K}));
    const crop = await png(c.firstFrame).extract({left, top, width: CW, height: CH}).resize(PW, PH, {kernel: 'nearest'}).png().toBuffer(), fitted = plane.cards.find(p => p.id === c.id), onPlane = fitted ? fitted.projected : fitCardPose(plane.H, observation(c.id, face)).projected, square = cardAt(plane.H, planQuad ? centreOf(planQuad) : centre).quad;
    const row = targetRows.find(r => r.id === c.target), gen = generatorRows.find(g => g.id === c.id);
    tiles.push({input: crop, left: i * PW, top: TOP}, {input: svg(PW, PH + TOP, [plate(0, 0, PW, TOP, '#111'), label(10, 26, `${c.id}  film vs calibrated plane`, 22), label(10, 54, fitted ? `edge rms ${fitted.residualRms.toFixed(2)} px, max ${fitted.residualMax.toFixed(2)} px` : `on the plane this card is ${gen!.sizeOnPlaneMm.width.toFixed(0)} x ${gen!.sizeOnPlaneMm.height.toFixed(0)} mm`, 19, '#ddd'),
      `<g transform="translate(0 ${TOP})">${polygon(to(face.corners), '#ffffff', 1.6)}${polygon(to(onPlane), '#ff00c8', 1.6)}</g>`]), left: i * PW, top: 0});
    tiles.push({input: crop, left: i * PW, top: PH + TOP + TOP}, {input: svg(PW, PH + TOP, [plate(0, 0, PW, TOP, '#111'), label(10, 26, planQuad ? `${c.id}  plan quad vs plane card at the plan centre` : `${c.id}  plane card at the same centre`, 22),
      label(10, 54, planQuad ? `corner gap max ${row!.cornerGapMaxPx.toFixed(1)} px, rms ${row!.cornerGapRmsPx.toFixed(1)} px` : `film card is ${(gen!.sizeRatio.width * 100 - 100).toFixed(0)} % wider, ${(gen!.sizeRatio.height * 100 - 100).toFixed(0)} % longer`, 19, '#ddd'),
      `<g transform="translate(0 ${TOP})">${planQuad ? polygon(to(planQuad), '#ffe600', 1.6) : polygon(to(face.corners), '#ffffff', 1.6)}${polygon(to(square), '#00e5ff', 1.6, 'stroke-dasharray="7 4"')}</g>`]), left: i * PW, top: PH + TOP});
  }
  tiles.push({input: svg(sheetW, 46, [plate(0, 0, sheetW, 46, '#111'), label(10, 30, 'white = measured film card (blue face; the pale rim lies outside it)  |  magenta = 63 x 88 mm on the calibrated plane at the fitted pose  |  yellow = plan quad  |  cyan dashed = 63 x 88 mm on the plane, square to the table, at that centre  |  1 film px = 5 px', 20)]), left: 0, top: sheetH - 46});
  await sharp({create: {width: sheetW, height: sheetH, channels: 3, background: '#111'}}).composite(tiles).png().toFile(`${REVIEW}/cards-film-plane-plan.png`);
}
// 4c. Shadow contact sheet: film frame and matte side by side, with the measured cast offset.
{
  const TW = SHEET_BOX.width / 2, TH = SHEET_BOX.height / 2, CAP = 30, cols = 2, rowsOut = Math.ceil(sheetTiles.length / cols), tiles: sharp.OverlayOptions[] = [], sheetW = cols * (2 * TW + 12), sheetH = rowsOut * (TH + CAP) + 40;
  for (const [i, t] of sheetTiles.entries()) { const x = (i % cols) * (2 * TW + 12), y = Math.floor(i / cols) * (TH + CAP) + CAP, stat = matteStats.find(m => m.frame === t.frame)!, row = lightRows.find(r => r.frame === t.frame), marks: string[] = [];
    if (row?.usable) { const a = {x: (row.casterCentre.x - SHEET_BOX.left) / 2, y: (row.casterCentre.y - SHEET_BOX.top) / 2}, b = {x: a.x + row.offset.x / 2, y: a.y + row.offset.y / 2}; marks.push(line(a, b, '#ffe600', 2), `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="4" fill="#ffe600"/>`, `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="4" fill="none" stroke="#ffe600" stroke-width="2"/>`); }
    tiles.push({input: await sharp(t.film).resize(TW, TH).png().toBuffer(), left: x, top: y}, {input: await sharp(t.matte).resize(TW, TH).png().toBuffer(), left: x + TW, top: y},
      {input: svg(2 * TW, TH + CAP, [label(4, 21, `f${t.frame}  darkest ${stat.peak.toFixed(2)}  lit level G ${stat.litLevel.toFixed(0)}${row?.usable ? `  cast offset (${row.offset.x.toFixed(0)}, ${row.offset.y.toFixed(0)}) px, blur sigma ${row.sigmaPx} px` : '  (hand too low for a cast offset)'}`, 16), `<g transform="translate(0 ${CAP})">${marks.join('')}</g>`]), left: x, top: y - CAP}); }
  tiles.push({input: svg(sheetW, 40, [label(6, 26, `${SHADOW_CLIP}: left film, right shadow matte (white = darker; grey value = darkness x 255, shown unscaled). Yellow dot = hand and card centre, ring = where the best overlap puts its shadow.`, 17)]), left: 0, top: sheetH - 40});
  await sharp({create: {width: sheetW, height: sheetH, channels: 3, background: '#161616'}}).composite(tiles).png().toFile(`${REVIEW}/shadow-contact-sheet.png`);
}
// 4c2. The written mattes used as intended: a plain felt colour multiplied by the matte, the keyed dealer on top.
{
  const FELT = [47, 107, 82], list = [56, 72, 96], frames = await readFrames(shadowVideo, list, 'shadow matte proof on a new table'), TW = SHEET_BOX.width / 2, TH = SHEET_BOX.height / 2, CAP = 30, tiles: sharp.OverlayOptions[] = [], sheetW = 3 * TW + 16, sheetH = list.length * (TH + CAP) + 40;
  for (const [i, n] of list.entries()) {
    const px = frames[i], key = keyPamelaFrame(px, W, H), {data, info} = await sharp(`${matteDir}/matte-${String(n).padStart(4, '0')}.png`).raw().toBuffer({resolveWithObject: true}), plain = Buffer.alloc(N * 3), shaded = Buffer.alloc(N * 3);
    for (let p = 0; p < N; p++) { const a = key.alpha[p], d = data[p * info.channels] / 255; for (let c = 0; c < 3; c++) { const fg = key.rgb[p * 3 + c] * a; plain[p * 3 + c] = Math.round(fg + FELT[c] * (1 - a)); shaded[p * 3 + c] = Math.round(fg + FELT[c] * (1 - d) * (1 - a)); } }
    const y = i * (TH + CAP) + CAP;
    for (const [k, image] of [px, plain, shaded].entries()) tiles.push({input: await png(image).extract(SHEET_BOX).resize(TW, TH).png().toBuffer(), left: k * (TW + 8), top: y});
    tiles.push({input: svg(sheetW, CAP, [label(4, 21, `f${n}: film`, 16), label(TW + 12, 21, 'keyed dealer on plain felt, no matte', 16), label(2 * TW + 20, 21, 'felt x (1 - matte), keyed dealer on top', 16)]), left: 0, top: y - CAP});
  }
  tiles.push({input: svg(sheetW, 40, [label(6, 26, `Shadow matte proof, ${SHADOW_CLIP}. Felt is a flat test colour; key from src/pamela-key.ts. Mattes read back from ${matteDir}.`, 16)]), left: 0, top: sheetH - 40});
  await sharp({create: {width: sheetW, height: sheetH, channels: 3, background: '#161616'}}).composite(tiles).png().toFile(`${REVIEW}/shadow-on-new-table.png`);
}
// 4d. Portrait crops: where today's transform and the proposals cut the native frame, and the resulting canvases.
{
  const NS = 0.5, NW = Math.round(NATIVE_W * NS), NH = Math.round(H * NS), PS = 0.3, CW = Math.round(PORTRAIT.width * PS), CH = Math.round(PORTRAIT.height * PS), GAP = 18, TOP = 64, framings = [{t: V6_PORTRAIT, colour: '#ffffff', name: 'V6 today'}, ...proposals.map((t, i) => ({t, colour: ['#00e5ff', '#ff7ad9'][i], name: t.id}))];
  const sheetW = NW + GAP + framings.length * (CW + GAP), sheetH = TOP + Math.max(NH + 120, CH + 76), tiles: sharp.OverlayOptions[] = [], colourOf = (state: string) => state === 'INSIDE' ? '#39ff14' : state === 'PARTLY_CUT' ? '#ff9f1a' : '#ff2d2d';
  const still = await png(idleFrame).png().toBuffer(), body: string[] = [];
  tiles.push({input: await sharp(still).resize(NW, NH, {fit: 'fill'}).modulate({brightness: 0.75}).png().toBuffer(), left: 0, top: TOP});
  for (const id of TARGETS) body.push(polygon(planNative[id].map(p => ({x: p.x * NS, y: p.y * NS})), colourOf(v6Rows.find(r => r.id === id)!.state), 1.6));
  for (const [i, f] of framings.entries()) { const x0 = -f.t.offsetX / f.t.scaleX * NS, x1 = (PORTRAIT.width - f.t.offsetX) / f.t.scaleX * NS; body.push(`<rect x="${x0.toFixed(1)}" y="${3 + i * 5}" width="${(x1 - x0).toFixed(1)}" height="${NH - 6 - i * 10}" fill="none" stroke="${f.colour}" stroke-width="2" ${i ? 'stroke-dasharray="10 6"' : ''}/>`, tag(Math.max(8, x0 + 8), 28 + i * 26, `${f.name}: native x ${(x0 / NS).toFixed(0)}..${(x1 / NS).toFixed(0)}`, 15, f.colour)); }
  body.push(label(4, NH + 26, 'Planned cards under the V6 portrait crop: green inside, orange partly cut, red outside.', 17), label(4, NH + 52, `Cut today: ${v6Rows.filter(r => r.state !== 'INSIDE').map(r => `${r.id} (${r.state === 'OUTSIDE' ? 'gone' : `${(r.widthInside * 100).toFixed(0)} % of its width left`})`).join(', ')}`, 17, '#ff9f1a'),
    label(4, NH + 78, `Planned cards span native x ${seatBox.x0.toFixed(0)}..${seatBox.x1.toFixed(0)} = ${(seatBox.x1 - seatBox.x0).toFixed(0)} px; V6 shows ${(PORTRAIT.width / V6_PORTRAIT.scaleX).toFixed(0)} px.`, 17));
  tiles.push({input: svg(NW, NH + 120, body), left: 0, top: TOP});
  for (const [i, f] of framings.entries()) { const left = NW + GAP + i * (CW + GAP), rep = framingReport(f.t), w = Math.round(NATIVE_W * f.t.scaleX * PS), h = Math.round(H * f.t.scaleY * PS), ox = Math.round(f.t.offsetX * PS), oy = Math.round(f.t.offsetY * PS);
    const resized = await sharp(still).resize(w, h, {fit: 'fill'}).png().toBuffer(), cutL = Math.max(0, -ox), cutT = Math.max(0, -oy), visW = Math.min(w - cutL, CW - Math.max(0, ox)), visH = Math.min(h - cutT, CH - Math.max(0, oy));
    tiles.push({input: await sharp({create: {width: CW, height: CH, channels: 3, background: '#2a2a2a'}}).png().toBuffer(), left, top: TOP}, {input: await sharp(resized).extract({left: cutL, top: cutT, width: visW, height: visH}).png().toBuffer(), left: left + Math.max(0, ox), top: TOP + Math.max(0, oy)});
    const marks = TARGETS.map(id => { const v = quadVisibility(f.t, planNative[id]); return v.state === 'OUTSIDE' ? '' : polygon(v.quad.map(p => ({x: p.x * PS, y: p.y * PS})), colourOf(v.state), 1.4); });
    tiles.push({input: svg(CW, CH + 76, [`<svg x="0" y="0" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">${marks.join('')}</svg>`, `<rect x="1" y="1" width="${CW - 2}" height="${CH - 2}" fill="none" stroke="${f.colour}" stroke-width="2"/>`, tag(8, 24, f.name, 17, f.colour), tag(8, 50, `scale ${rep.scale.toFixed(3)} (${(rep.dealerScaleVersusV6 * 100).toFixed(0)} % of V6)`, 15),
      label(6, CH + 22, `${rep.cardsInside}/16 cards inside`, 16), label(6, CH + 44, `film rows ${rep.filmRowsOnCanvas[0].toFixed(0)}..${rep.filmRowsOnCanvas[1].toFixed(0)} of 1920`, 15), label(6, CH + 66, `P4 card ${rep.p4CardWidthPx.toFixed(0)} px wide`, 15)]), left, top: TOP});
  }
  tiles.push({input: svg(sheetW, TOP, [label(8, 26, 'Portrait 1080 x 1920: left the native frame with the columns each framing keeps; right the canvases (grey = no film, needs room and table plates).', 19), label(8, 52, `All framings keep the dealer-side table edge on the row V6 uses. Film here is ${idleRef}.`, 16, '#ccc')]), left: 0, top: 0});
  await sharp({create: {width: sheetW, height: sheetH, channels: 3, background: '#111'}}).composite(tiles).png().toFile(`${REVIEW}/portrait-crops.png`);
}


// ---- 5. the contract -----------------------------------------------------------------------
const matrix = (m: Mat3) => [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)].map(r => r.map(v => Number(v.toPrecision(10))));
const quadOut = (q: Pt[]) => q.map(p => xy(p)), SIDES = ['far', 'right', 'near', 'left'], rangeOf = (values: number[], digits = 2) => [round(Math.min(...values), digits), round(Math.max(...values), digits)];
const cameraOut = (c: CameraSummary | null) => c && {focalPx: round(c.focalPx, 0), horizontalFieldOfViewDeg: round(c.horizontalFovDeg, 1), pitchDownDeg: round(c.pitchDownDeg, 1), heightAboveTableMm: round(c.heightAboveTableMm, 0), groundDistanceToOriginMm: round(c.groundDistanceToOriginMm, 0), viewAngleAtOriginDeg: round(c.viewAngleAtOriginDeg, 1), vanishingLineRow: round(c.horizonYAtImageCentre, 0), principalColumn: round(c.principalX, 0)};
const scaleOrigin = scaleAt(plane.H, originPx), rimScale = scaleAt(planeRim.H, originPx), meanOf = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const gapMax = Math.max(...targetRows.map(r => r.cornerGapMaxPx)), gapRms = rmsOf(targetRows.flatMap(r => r.cornerGapPx)), noiseWorst = Math.max(...Object.values(noiseMoved)), looWorst = Math.max(...leaveOneOut.map(l => l.movedMax));
const handFactor = hands.length ? [Math.min(...hands.map(h => h.widthOnPlaneMm)) / 125, Math.max(...hands.map(h => h.widthOnPlaneMm)) / 95] : null, shoeFactor = [shoeBaseMm / 450, shoeBaseMm / 380], generatorFactor = rangeOf(generatorRows.flatMap(g => [g.sizeRatio.width, g.sizeRatio.height]));
const blurPx = softRows.map(r => r.sigmaPx), contactPeak = median(contactRows.map(m => m.peak)), darkByHeight = usableLight.map(r => ({frame: r.frame, heightMm: round(r.heightMm, 0), peakDarkness: round(r.peakDarkness, 2)}));
const v6Cut = v6Rows.filter(r => r.state !== 'INSIDE'), reports = proposals.map(p => ({p, r: framingReport(p)})), v6Report = framingReport(V6_PORTRAIT), needShrink = (PORTRAIT.width / V6_PORTRAIT.scaleX - 2 * 24 / V6_PORTRAIT.scaleX) / (seatBox.x1 - seatBox.x0);
// What a 63 x 88 mm card measures in the image at each target: on the calibrated plane as it is
// (the plan's own scale), and on the same plane read at `k` times that scale, H * diag(k, k, 1),
// which keeps vanishing line and foreshortening and only changes what a millimetre is.
const BODY_SCALE = {value: 2, range: [1.8, 2.5]}, scaled = (k: number): Mat3 => plane.H.map((v, i) => i % 3 === 2 ? v : v * k);
const sizeRow = (q: Pt[]) => { const s = shapeOf(q); return {farWidthPx: round(s.farWidthPx, 1), nearWidthPx: round(s.nearWidthPx, 1), depthPx: round(s.depthPx, 1), taper: round(s.taper, 3), sideSlantDeg: round(s.leftSideSlantDeg, 1)}; };
const cardSizes = TARGETS.map(id => { const centre = centreOf(planFilm[id]), body = cardAt(scaled(BODY_SCALE.value), centre).quad, lo = shapeOf(cardAt(scaled(BODY_SCALE.range[0]), centre).quad), hi = shapeOf(cardAt(scaled(BODY_SCALE.range[1]), centre).quad);
  return {id, centrePx: xy(centre, 1), planQuad: sizeRow(planFilm[id]), atPlanScale: {...sizeRow(base[id]), quadPx: quadOut(base[id])}, atBodyScale: {...sizeRow(body), quadPx: quadOut(body), nearWidthRangePx: [round(lo.nearWidthPx, 0), round(hi.nearWidthPx, 0)], depthRangePx: [round(lo.depthPx, 0), round(hi.depthPx, 0)]}}; });
// The dealer-side edge row in the last frame of every clip read; frames where the dealing arm crosses the columns are left out.
const edgeRowsByClip = cards.map(c => ({clip: c.clip, frame: c.frames.at(-1)!, row: dealerEdgeRow(c.firstFrame)})).filter(e => Number.isFinite(e.row) && Math.abs(e.row - edgeRow) <= 6);
const both = (e: {leaveOneOutRange: number[]; noise95Range: number[]}) => [Math.min(e.leaveOneOutRange[0], e.noise95Range[0]), Math.max(e.leaveOneOutRange[1], e.noise95Range[1])];
const figure = (pick: (c: CameraSummary) => number, digits: number, how: string) => { const e = estimate(pick, digits, how); return {value: e.value, range: both(e), basis: 'DERIVED', how}; };
const contract = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  generatedBy: 'node tools/scene-measure.ts (maths in src/scene-geometry.ts, checked by tools/scene-geometry.test.ts)',
  basisLegend: {MEASURED: 'read from film pixels by the tool', DERIVED: 'computed from measured values under the stated model', ESTIMATED: 'rests on an assumption this footage cannot check; a working value', GIVEN: 'input from the brief, the plan file or existing code, not a result', REPORTED: 'told to this tool\'s author by another reviewer, not checked here',
    rule: 'An object\'s `basis` covers every number inside it unless a nested object states its own.'},
  image: {basis: 'GIVEN', width: W, height: H, framesPerSecond: 30, pixelConvention: 'pixel centres, origin top left, x right, y down', v6NativeWidth: NATIVE_W, note: 'The plan and V6 use 1762-wide native pixels; film x = native x * 1763 / 1761, as tools/build-anchor.ts scales them.'},
  cardMillimetres: {basis: 'GIVEN', width: CARD_MM.width, height: CARD_MM.height, cardEdge: 'the blue tracking face, the surface the plan quad and tools/build-anchor.ts place; the pale rim lies outside it',
    rim: {basis: 'MEASURED', medianWidthPx: round(median(rimWidths)), bySidePx: Object.fromEntries(SIDES.map((s, k) => [s, round(rimBySide[k])])), sidesCompared: rimWidths.length, note: 'A rendered card that must also hide the film\'s rim has to reach this much further on each side; see tablePlane.outerSilhouetteVariant.'}},
  verdict: {
    onePlane: `The planned-family film cards (P1.C1, P4.C1, P4.C2, P7.C1) fit one plane with ${round(plane.fit.residualRms)} px rms edge error (max ${round(Math.max(...plane.cards.map(c => c.residualMax)))} px). Left out one at a time they are predicted within ${round(Math.max(...leaveOneOut.map(l => l.leftOutCardEdgeRms)))} px rms and the cards predicted at the 16 targets move by at most ${round(looWorst, 1)} px.`,
    whatThatProves: 'Those cards were put there by the plan through the end image, so the fit shows that the generator kept the plan\'s own flat projection to within a few pixels. It does not show that the shot was drawn with that camera.',
    plan: `The 16 plan quads are exactly one plane of 63 x 88 mm cards (${planPlane.residualRms.toExponential(1)} px). Against the film-calibrated plane they differ by at most ${round(gapMax, 1)} px (rms ${round(gapRms, 1)} px), which is inside the calibration's own uncertainty (${round(noiseWorst, 1)} px at 95 %, ${round(looWorst, 1)} px leave-one-out).`,
    scale: `Millimetres on this plane are a convention. The same plane makes a resting hand ${hands.length ? round(hands[0].widthOnPlaneMm, 0) : 'n/a'} mm wide and the shoe ${round(shoeBaseMm, 0)} mm long, and the cards the generator drew by itself measure ${round(meanOf(generatorRows.map(g => g.sizeOnPlaneMm.width)), 0)} x ${round(meanOf(generatorRows.map(g => g.sizeOnPlaneMm.height)), 0)} mm on it. Relative to the dealer the plan's cards are roughly half size.`,
    use: 'Treating the table as one calibrated plane is sound for card positions, rendered cards, shadows and flat table artwork. Body-scale props drawn in millimetres on it will look about twice too small next to the dealer until the scale convention is settled.',
  },
  keyFigures: {
    note: 'Short list for consumers. Ranges span leave-one-out and the 95 % uncertainty runs; all lengths are in plan-scale millimetres (see cardSizeAtTargets.scale).',
    homographyTableMmToImagePx: {basis: 'DERIVED', matrix: matrix(plane.H), reprojectionRmsPx: round(plane.fit.residualRms), reprojectionMaxPx: round(Math.max(...plane.cards.map(c => c.residualMax))), perCardRmsPx: Object.fromEntries(plane.cards.map(c => [c.id, round(c.residualRms)])),
      leftOutCardRmsPx: Object.fromEntries(leaveOneOut.map(l => [l.leftOut, round(l.leftOutCardEdgeRms)])), predictedCardsMoveUpToPx: {leaveOneOut: round(looWorst, 1), uncertainty95: round(noiseWorst, 1)}},
    focalPx: figure(c => c.focalPx, 0, 'pinhole behind the plane'),
    tiltDownDeg: figure(c => c.pitchDownDeg, 1, 'optical axis below the horizontal'),
    heightAboveFeltMm: figure(c => c.heightAboveTableMm, 0, 'camera centre above the felt'),
    distanceToP4C1AlongFeltMm: figure(c => c.groundDistanceToOriginMm, 0, 'from below the camera to the P4.C1 card centre'),
    distanceToP4C1Mm: figure(c => c.distanceToOriginMm, 0, 'camera centre to the P4.C1 card centre'),
    viewAngleAtP4C1Deg: figure(c => c.viewAngleAtOriginDeg, 1, 'line of sight to the P4.C1 card against the felt'),
    dealerEdgeImageRow: {basis: 'MEASURED', value: edgeRow, acrossClips: rangeOf(edgeRowsByClip.map(e => e.row), 1), clipsRead: edgeRowsByClip.length, what: 'image row where the dealer\'s body ends on the back edge of the table: last jacket row plus half a pixel, columns 846-900 between the hands', onPlaneYMm: {basis: 'DERIVED', value: round(edgeMid.y, 0)}},
    caution: 'Focal length, height and distances belong to the plan-scale reading of the table. They describe one consistent plane, not a verified physical camera; see verdict and sanityChecks.',
  },
  cardSizeAtTargets: {
    what: 'Image size of a 63 x 88 mm card lying square to the table, centred on each plan target. farWidthPx and nearWidthPx are the dealer-side and camera-side edges, depthPx the distance between their midpoints, sideSlantDeg the direction of the left side (-90 = upright).',
    scale: {
      planScale: {basis: 'DERIVED', k: 1, note: 'the calibrated plane as fitted to the film cards; equals the plan quads to within ' + round(gapMax, 1) + ' px because those cards were imposed by the plan'},
      bodyScale: {basis: 'ESTIMATED', k: BODY_SCALE.value, kRange: BODY_SCALE.range, note: 'the same plane with the card as large as the dealer\'s hands and the shoe imply; sizes grow almost in proportion to k, so interpolate for another k'},
      evidenceForK: {
        hands: {basis: 'ESTIMATED', k: handFactor && handFactor.map(v => round(v, 2)), from: 'resting hand width on the plane against 95-125 mm'},
        shoe: {basis: 'ESTIMATED', k: shoeFactor.map(v => round(v, 2)), from: 'shoe base length on the plane against 380-450 mm'},
        shoeMouthCard: {basis: 'DERIVED', kAtLeast: round(shoeCardScale / shoeFoot.alongX, 2), from: 'long side of the yellow card in the shoe mouth against the plane scale at the shoe foot'},
        legacyV6Card: {basis: 'DERIVED', kWidth: round(v6OnPlane.widthMm / CARD_MM.width, 2), kDepth: round(v6OnPlane.heightMm / CARD_MM.height, 2), from: 'landed white card of the older take (src/pamela-card-contact-v6.ts)'},
        earlierBlueCards: {basis: 'DERIVED', k: generatorFactor, from: 'pamela-p4-c1-source-turn and pamela-p4-c1-deal-calm-01; the second was generated with a last image and lands on the same quad as the first, so it is not independent'},
        freshDeals: {basis: 'REPORTED', k: [round(124 / 70, 2), round(182 / 94, 2)], from: 'coordinator\'s frame review of freshly generated deals: landed card 124-182 px wide, shrunk to the anchor\'s 70-94 px in the last two frames. Not measured by this tool.'},
      },
    },
    targets: cardSizes,
  },
  tablePlane: {
    model: 'LEVEL_ROWS',
    modelNote: 'Six-number plane: lines along table X stay horizontal in the image (no camera roll, camera square to the dealer-side edge). Cards are free to slide and turn on the table.',
    homographyTableMmToImagePx: {basis: 'DERIVED', matrix: matrix(plane.H), how: 'least squares on the measured blue-face edges of four landed cards, each a 63 x 88 mm rectangle with free position and heading'},
    homographyImagePxToTableMm: {basis: 'DERIVED', matrix: matrix(inv3(plane.H).map(v => v / inv3(plane.H)[8]))},
    origin: 'centre of the measured P4.C1 card', originImagePx: {basis: 'DERIVED', xy: xy(originPx)},
    axes: 'millimetres on the felt; +X toward image right (the dealer\'s left hand side), +Y away from the camera toward the dealer, +Z up; X runs parallel to the table\'s vanishing line and to the dealer-side edge',
    scaleAtOrigin: {basis: 'DERIVED', pxPerMmAlongX: round(scaleOrigin.alongX, 4), pxPerMmAlongY: round(scaleOrigin.alongY, 4), foreshortening: round(scaleOrigin.foreshortening, 3)},
    cards: fitCards.map(c => { const face = c[PRIMARY], fitted = plane.cards.find(p => p.id === c.id)!;
      return {id: c.id, target: c.target, clip: clip(c.clip), frames: c.frames, note: c.note,
        measured: {basis: 'MEASURED', quadPx: quadOut(face.corners), cornerOrder: 'far-left, far-right, near-right, near-left', sides: face.sides.map((s, k) => s ? {side: SIDES[k], edgeSamples: s.samples, lineScatterPx: round(s.sigma), readFromRimAgainstOtherCard: s.viaRim > 0, takenFromOuterEdgeMinusRim: !!s.proxy} : {side: SIDES[k], hidden: true}), frameToFrameCornerScatterPx: round(c.temporalStd)},
        onPlane: {basis: 'DERIVED', centreMm: {x: round(fitted.pose.x, 1), y: round(fitted.pose.y, 1)}, headingDeg: round(fitted.pose.heading), projectedQuadPx: quadOut(fitted.projected)},
        reprojection: {basis: 'DERIVED', edgeRmsPx: round(fitted.residualRms), edgeMaxPx: round(fitted.residualMax), cornerErrorPx: fitted.cornerErrors.map(v => v === null ? null : round(v))}}; }),
    reprojection: {basis: 'DERIVED', what: 'distance from each end of a measured edge segment to the projected card edge', rmsPx: round(plane.fit.residualRms), maxPx: round(Math.max(...plane.cards.map(c => c.residualMax))), residuals: plane.fit.residuals, freeNumbers: plane.fit.parameters, redundancy: plane.fit.redundancy,
      twoStartsAgreeWithinPx: round(plane.startSpread, 4), perCard: plane.cards.map(c => ({id: c.id, edgeRmsPx: round(c.residualRms), edgeMaxPx: round(c.residualMax)}))},
    leaveOneOut: {basis: 'DERIVED', what: 'plane refitted without one card; the left-out card is then laid on it as a free 63 x 88 mm card, and the 16 predicted target cards are compared with the full fit',
      meanLeftOutEdgeRmsPx: round(meanOf(leaveOneOut.map(l => l.leftOutCardEdgeRms))), rows: leaveOneOut.map(l => ({leftOut: l.leftOut, leftOutCardEdgeRmsPx: round(l.leftOutCardEdgeRms), leftOutCardEdgeMaxPx: round(l.leftOutCardEdgeMax), predictedCardsMoveUpToPx: round(l.movedMax, 1),
        movedPx: Object.fromEntries(['P1.C1', 'P4.C1', 'P7.C1', 'D.C1'].map(id => [id, round(l.moved[id], 1)])), camera: cameraOut(l.camera), twoStartsAgreeWithinPx: round(l.startSpread, 4)}))},
    uncertainty: {basis: 'DERIVED', how: `every measured side moved as a line by a normal disturbance of ${round(noiseSigma)} px at each end of the side (the fit's own rms, which is mostly the generator drawing each card a little differently), ${noiseRuns} refits`,
      disturbancePx: round(noiseSigma), runs: noiseRuns, predictedCardCornerShift95Px: Object.fromEntries(TARGETS.map(id => [id, round(noiseMoved[id], 1)])), worstPx: round(noiseWorst, 1)},
    unconstrainedModel: {basis: 'DERIVED', what: 'general homography, one more free number, not adopted', edgeRmsPx: round(general.fit.residualRms), rollDeg: generalCamera ? round(generalCamera.rollDeg) : null, vanishingLineRow: generalCamera ? round(generalCamera.horizonYAtImageCentre, 0) : null,
      predictedCardsDifferUpToPx: round(Math.max(...Object.values(generalMoved)), 1), meanLeftOutEdgeRmsPx: round(meanOf(generalLeaveOneOut.map(l => l.leftOutCardEdgeRms))), leftOutPredictedCardsMoveUpToPx: round(Math.max(...generalLeaveOneOut.map(l => l.movedMax)), 1),
      fStatistic: {value: round(fStatistic), degreesOfFreedom: [extra, general.fit.redundancy], note: `The 5 % point of F(1,15) is 4.54, so the in-sample gain is nominally significant. But the residuals are systematic per card rather than noise, held-out cards are predicted no better (${round(meanOf(generalLeaveOneOut.map(l => l.leftOutCardEdgeRms)))} against ${round(meanOf(leaveOneOut.map(l => l.leftOutCardEdgeRms)))} px), and the one visible table line is horizontal. That decides for level rows.`},
      homographyTableMmToImagePx: matrix(general.H)},
    outerSilhouetteVariant: {basis: 'DERIVED', what: 'the same fit with the card taken as face plus rim (where the table green ends)', homographyTableMmToImagePx: matrix(planeRim.H), edgeRmsPx: round(planeRim.fit.residualRms), pxPerMmAlongXAtOrigin: round(rimScale.alongX, 4), scaleRatioToPrimary: round(rimScale.alongX / scaleOrigin.alongX, 4),
      plannedCardsCornerGapUpToPx: round(Math.max(...targetRows.map(r => r.outerSilhouetteCornerGapMaxPx)), 1), camera: cameraOut(rimCamera)},
    dealerEdge: {row: {basis: 'MEASURED', imageRow: edgeRow, how: `last jacket row between the hands, columns 846-900, ${idleRef}; horizontal across the body`}, onPlane: {basis: 'DERIVED', yMm: round(edgeMid.y, 0), note: 'distance from the P4.C1 card centre to the dealer-side edge, on the plan-scale plane'}},
    plannedTargetsOnPlaneMm: {basis: 'DERIVED', what: 'table position of a 63 x 88 mm card, square to the table, whose image centre is the plan target\'s centre', targets: Object.fromEntries(targetRows.map(r => [r.id, {x: round(r.tablePositionMm.x, 1), y: round(r.tablePositionMm.y, 1)}]))},
    repeatability: {basis: 'MEASURED', what: 'the same landing measured in another clip, not used in the fit', rows: checkRows.map(c => ({id: c.id, clip: clip(c.clip), frames: c.frames, target: c.target, quadPx: quadOut(c.quadPx), cornersMeasured: c.cornersMeasured, edgeRmsOnPlanePx: round(c.edgeRmsOnPlanePx), cornerShiftAgainstFitClipPx: c.cornerShiftAgainstFitClipPx.map(v => v === null ? null : round(v, 1))}))},
  },
  camera: {
    basis: 'DERIVED',
    assumptions: ['pinhole, square pixels, no skew, no lens distortion', 'principal row at the image centre (586.5)', 'principal column where the plane itself puts it, the one column for which a pinhole reproduces the plane exactly', 'level rows: no roll, camera square to the dealer-side edge', 'the blue card face is 63 x 88 mm; every length scales with that'],
    estimates: {
      focalPx: estimate(c => c.focalPx, 0, 'from the equal-length condition on the two table axes'),
      horizontalFieldOfViewDeg: estimate(c => c.horizontalFovDeg, 1, '2 atan(1764 / 2f)'),
      verticalFieldOfViewDeg: estimate(c => c.verticalFovDeg, 1, '2 atan(1174 / 2f)'),
      pitchDownDeg: estimate(c => c.pitchDownDeg, 1, 'optical axis below the horizontal'),
      heightAboveTableMm: estimate(c => c.heightAboveTableMm, 0, 'camera centre above the felt'),
      groundDistanceToOriginMm: estimate(c => c.groundDistanceToOriginMm, 0, 'along the felt from below the camera to the P4.C1 card'),
      distanceToOriginMm: estimate(c => c.distanceToOriginMm, 0, 'camera centre to the P4.C1 card'),
      viewAngleAtOriginDeg: estimate(c => c.viewAngleAtOriginDeg, 1, 'angle between the line of sight to the P4.C1 card and the felt'),
      vanishingLineRow: estimate(c => c.horizonYAtImageCentre, 0, 'image row of the table\'s vanishing line'),
      principalColumn: estimate(c => c.principalX, 0, 'image column where the table\'s depth lines meet'),
    },
    positionMm: {x: round(planeCamera.positionMm.x, 0), y: round(planeCamera.positionMm.y, 0), z: round(planeCamera.positionMm.z, 0)},
    focalWithPrincipalPointAtImageCentrePx: planeCamera.focalWithCentredPrincipalPx === null ? null : round(planeCamera.focalWithCentredPrincipalPx, 0),
    howWellConstrained: {
      wellConstrained: 'image scale and foreshortening at P4 (px per mm along X and Y), and the view angle at the origin: fixed by the P4 cards alone, a few percent',
      moderately: 'vanishing-line row, focal length, camera height and distance: they hang on the size and shape of the P1 and P7 cards relative to P4; see the leave-one-out and uncertainty ranges',
      weakly: 'pitch (a few degrees either way moves the vanishing line by tens of rows) and the principal column',
      notConstrained: 'principal row, lens distortion, and anything about the real metric scale',
    },
    planCamera: {basis: 'DERIVED', what: 'the same decomposition of the plan\'s own flat projection', ...cameraOut(planPlane.camera)},
    reading: 'This is the camera that would draw the plan\'s cards, a wide lens about half a metre above the felt. The dealer, her hands and the shoe are drawn at roughly twice that scale, so no single pinhole explains both; see sanityChecks.',
  },
  planConsistency: {
    planAsPlane: {basis: 'DERIVED', what: 'one plane fitted to the 16 flat-mode plan quads, each a free 63 x 88 mm card', residualRmsPx: Number(planPlane.residualRms.toExponential(2)), residualMaxPx: Number(planPlane.residualMax.toExponential(2)), tableProjection: plan.tableProjection ?? null, homographyTableMmToImagePx: matrix(planPlane.H), camera: cameraOut(planPlane.camera)},
    againstCalibratedPlane: {basis: 'DERIVED', what: 'at each target a 63 x 88 mm card on the film-calibrated plane, square to the table and centred on the plan quad\'s image centre, compared corner by corner with the plan quad',
      cornerGapMaxPx: round(gapMax, 1), cornerGapRmsPx: round(gapRms, 1), largestAt: worst.slice(0, 3).map(r => ({id: r.id, cornerGapMaxPx: round(r.cornerGapMaxPx, 1)})), insideCalibrationUncertainty: gapMax <= Math.max(noiseWorst, looWorst),
      perTarget: targetRows.map(r => ({id: r.id, cornerGapPx: r.cornerGapPx.map(v => round(v, 1)), cornerGapMaxPx: round(r.cornerGapMaxPx, 1), shapeOnlyCornerRmsPx: round(r.bestPoseCornerRmsPx), planQuadOnPlaneMm: {width: round(r.planQuadOnPlaneMm.width, 1), height: round(r.planQuadOnPlaneMm.height, 1)},
        planQuadPx: quadOut(r.planQuadPx), calibratedQuadPx: quadOut(r.calibratedQuadPx), plan: {farWidthPx: round(r.planShape.farWidthPx, 1), nearWidthPx: round(r.planShape.nearWidthPx, 1), depthPx: round(r.planShape.depthPx, 1), taper: round(r.planShape.taper, 3), sideSlantDeg: round(r.planShape.leftSideSlantDeg, 1)},
        calibrated: {farWidthPx: round(r.calibratedShape.farWidthPx, 1), nearWidthPx: round(r.calibratedShape.nearWidthPx, 1), depthPx: round(r.calibratedShape.depthPx, 1), taper: round(r.calibratedShape.taper, 3), sideSlantDeg: round(r.calibratedShape.leftSideSlantDeg, 1)}}))},
    filmAgainstPlan: {basis: 'MEASURED', what: 'measured blue face of the landed film card against the plan quad it was imposed with; null where a corner is hidden or rests on a side taken from the outer edge',
      rows: targetRows.filter(r => r.film).map(r => ({id: r.id, clip: clip(r.film!.clip), cornerOffsetPx: r.film!.filmVsPlanCornerPx.map((v, k) => v === null || r.film!.sideFromOuterEdge[k] || r.film!.sideFromOuterEdge[(k + 3) % 4] ? null : round(v, 1)), centreOffsetPx: {x: round(r.film!.centreOffsetPx.x, 1), y: round(r.film!.centreOffsetPx.y, 1)},
        nearEdgeTiltDeg: round(r.film!.shape.nearEdgeTiltDeg, 1), planNearEdgeTiltDeg: round(r.planShape.nearEdgeTiltDeg, 1), taper: round(r.film!.shape.taper, 3), planTaper: round(r.planShape.taper, 3), headingOnPlaneDeg: round(r.film!.headingOnPlaneDeg, 1)}))},
    reportedFreshDeals: {basis: 'REPORTED', finding: 'In freshly generated deals the model draws the landed card 124-182 px wide and shrinks it to the anchor\'s 70-94 px only in the last two frames. Cards in clips with `plan` in the id therefore show the plan\'s hand-set quad, not the generator\'s own scale.',
      consistentWith: 'the hand, shoe and older-card factors in cardSizeAtTargets.scale.evidenceForK, all near 2', notMeasuredHere: true},
    generatorFamily: {what: 'landed cards drawn without a planned end quad from placements/default.json, both near P4; deal-calm was generated with a last image and lands on the same quad as source-turn',
      rows: generatorRows.map(g => ({id: g.id, clip: clip(g.clip), frames: g.frames, measured: {basis: 'MEASURED', quadPx: quadOut(g.quadPx), farWidthPx: round(g.shape.farWidthPx, 1), nearWidthPx: round(g.shape.nearWidthPx, 1), depthPx: round(g.shape.depthPx, 1), taper: round(g.shape.taper, 3), frameToFrameCornerScatterPx: round(g.temporalStd)},
        onCalibratedPlane: {basis: 'DERIVED', sizeMm: {width: round(g.sizeOnPlaneMm.width, 1), height: round(g.sizeOnPlaneMm.height, 1)}, sizeRatioTo63x88: {width: round(g.sizeRatio.width, 3), height: round(g.sizeRatio.height, 3)}, edgeRmsAsA63x88CardPx: round(g.bestPoseEdgeRmsPx, 1),
          planeCardThere: {farWidthPx: round(g.planeCardAtSamePlace.shape.farWidthPx, 1), nearWidthPx: round(g.planeCardAtSamePlace.shape.nearWidthPx, 1), depthPx: round(g.planeCardAtSamePlace.shape.depthPx, 1), taper: round(g.planeCardAtSamePlace.shape.taper, 3)}},
        own: {basis: 'DERIVED', pxPerMm: round(g.ownScalePxPerMm, 3), planePxPerMmThere: round(g.planeScalePxPerMm, 3), foreshortening: round(g.ownForeshortening, 3), planeForeshorteningThere: round(g.planeForeshortening, 3), vanishingLineRowFromThisCardAlone: round(g.ownHorizonY, 0)}})),
      legacyV6Card: {basis: 'DERIVED', what: 'landed card of the older white-card take, constant `landed` in src/pamela-card-contact-v6.ts (GIVEN), laid on the calibrated plane', quadFilmPx: quadOut(v6Landed), sizeOnPlaneMm: {width: round(v6OnPlane.widthMm, 0), height: round(v6OnPlane.heightMm, 0)}},
      finding: 'The generator\'s own cards are larger, less foreshortened and less tapered than a plan-plane card at the same place, and the two clips disagree with each other on perspective. The families share one thing: a foreshortening near 0.6 at P4.'},
  },
  sanityChecks: {
    frame: idleRef,
    hands: hands.map(h => ({name: h.name, measured: {basis: 'MEASURED', widestSkinRow: h.row, widthPx: h.widthPx}, onPlane: {basis: 'DERIVED', widthMm: round(h.widthOnPlaneMm, 0), planePxPerMmThere: round(h.planeScalePxPerMm, 3)}})),
    handReference: {basis: 'ESTIMATED', adultHandAcrossKnucklesWithThumbMm: [95, 125], note: 'anthropometric range, not measured in the footage'},
    shoeBase: {measured: {basis: 'MEASURED', fromPx: xy(shoeBase.front, 1), toPx: xy(shoeBase.back, 1), lengthPx: round(Math.hypot(shoeBase.back.x - shoeBase.front.x, shoeBase.back.y - shoeBase.front.y), 0)}, onPlane: {basis: 'DERIVED', lengthMm: round(shoeBaseMm, 0)}, reference: {basis: 'ESTIMATED', dealingShoeLengthMm: [380, 450]}},
    shoeMouthCard: {measured: {basis: 'MEASURED', sidesPx: shoeCardSides.map(v => round(v, 1))}, derived: {basis: 'DERIVED', pxPerMmAtLeast: round(shoeCardScale, 3), planePxPerMmAtShoeFoot: round(shoeFoot.alongX, 3), ratioAtLeast: round(shoeCardScale / shoeFoot.alongX, 2)},
      note: 'The yellow card in the shoe mouth is not on the table plane; its long side cannot be longer than 88 mm, so its image scale is a lower bound.'},
    scaleConflict: {basis: 'ESTIMATED', objectsAreLargerThanPlanScaleCardsBy: {hands: handFactor && handFactor.map(v => round(v, 2)), shoe: shoeFactor.map(v => round(v, 2)), shoeMouthCardAtLeast: round(shoeCardScale / shoeFoot.alongX, 2), generatorCards: generatorFactor},
      reading: 'Everything the generator drew by itself is 1.2 to 2.6 times larger than the plan-scale card implies. The plane is self-consistent; its millimetres are not the dealer\'s millimetres.'},
  },
  light: {
    clip: shadowVideo, framesMeasured: lightRows.map(r => r.frame), framesUsed: usableLight.map(r => r.frame),
    direction: {
      castOffsetInImage: {basis: 'MEASURED', what: 'shift that best lays the silhouette of the moving hand and card onto its shadow', medianAngleFromImageDownDeg: round(angleDeg, 1), sign: 'positive = shadow toward image right',
        perFrame: lightRows.map(r => ({frame: r.frame, offsetPx: [round(r.offset.x, 0), round(r.offset.y, 0)], lengthPx: round(r.offsetLengthPx, 0), used: r.usable}))},
      sidewaysLean: {basis: 'DERIVED', valueDeg: round(leanDeg, 1), range68Deg: [round(leanRange.p16, 1), round(leanRange.p84, 1)], sign: 'positive = light comes from image left (the dealer\'s right) and pushes shadows toward +X', how: 'cast offset split into the image of the table X axis and the image of the vertical, with the pinhole of the fitted plane'},
      leanTowardOrAwayFromCamera: {basis: 'ESTIMATED', valueDeg: 0, plausibleRangeDeg: [-30, 30], why: 'The offset grows with the hand\'s height, which the footage does not give. A light leaning toward or away from the camera looks the same as a higher or lower hand; the heights implied by a vertical light (see shadowDarkness.byHeight) are plausible, nothing more.'},
      towardLightUnitVector: {basis: 'ESTIMATED', tableFrameXYZ: towardLight.map(v => round(v, 3)), note: 'key light essentially overhead; Y component set to zero for lack of evidence'},
    },
    softness: {
      blurSigmaPx: {basis: 'MEASURED', what: 'Gaussian blur of the shifted silhouette that best explains the matte', median: median(blurPx), range: rangeOf(blurPx, 1), perFrame: lightRows.filter(r => r.usable).map(r => ({frame: r.frame, sigmaPx: r.sigmaPx, explainedShare: round(r.explained), atSearchLimit: r.sigmaAtLimit}))},
      blurSigmaMm: {basis: 'DERIVED', median: round(median(softRows.map(r => r.sigmaMm)), 0), range: rangeOf(softRows.map(r => r.sigmaMm), 0), note: 'plan-scale millimetres on the table'},
      growthWithHeight: {basis: 'DERIVED', sigmaPxPerOffsetPx: softFit ? round(softFit.slope, 3) : null, floorPx: softFit ? round(softFit.floorPx, 0) : null, frames: softFit?.frames ?? 0, note: 'A physical light would give blur proportional to height. Here the blur stays near its floor at every height measured, so the shadow is better reproduced as a fixed soft blur than as a penumbra model.'},
      lightAngularSize: {basis: 'ESTIMATED', sigmaDegIfBlurWereAllPenumbra: ratioSigmaDeg ? [round(ratioSigmaDeg.p16, 0), round(ratioSigmaDeg.p84, 0)] : null, sigmaDegFromGrowthOnly: softFit ? round(softFit.angularSigmaDeg, 1) : null, note: 'between a small source (from the growth) and a very broad overhead source (from the blur itself); the footage does not behave like one physical lamp'},
    },
    shadowDarkness: {basis: 'MEASURED', definition: '1 - G / lit G in display (gamma-encoded) values; 0 = lit table, 1 = black', atContact: {frames: contactRows.map(m => m.frame), peak: round(contactPeak), ratioToLitTable: round(1 - contactPeak)},
      byHeight: {heightBasis: 'DERIVED, plan-scale millimetres, assuming no lean toward or away from the camera', rows: darkByHeight}, peakPerFrame: matteStats.map(m => ({frame: m.frame, peak: round(m.peak)})),
      linearLight: {basis: 'DERIVED', note: 'for a renderer working in linear light use (1 - darkness)^2.2', contactRatio: round((1 - contactPeak) ** 2.2, 3)}},
    litTable: {basis: 'MEASURED', greenLevel: rangeOf(matteStats.map(m => m.litLevel), 1), note: 'the clip darkens from its start image over the first frames, so every frame is read against its own lit level', patchDisagreementUpTo: round(Math.max(...matteStats.map(m => m.patchSpread)), 4), noiseRms: round(median(matteStats.map(m => m.quietNoise)), 4)},
    cardGloss: {basis: 'ESTIMATED', note: 'not measured: the tracking cards are flat colour without a visible highlight. A broad overhead source this soft would give a wide, weak highlight; keep gloss low.'},
    method: 'Per frame the lit level is the median green of three table patches the hand never reaches. Darkness is 1 - G / lit level on table-green pixels below the dealer-side edge. Cast offset and blur come from sliding and blurring the moving hand-and-card silhouette at quarter resolution.',
  },
  shadowMatte: {
    basis: 'MEASURED', clip: SHADOW_CLIP, source: shadowVideo, frames: SHADOW_RANGE, count: shadowFrames.length, path: `${matteDir}/matte-%04d.png`,
    format: `${W} x ${H} 8-bit grey + alpha PNG, lossless. Grey = darkness x 255. Alpha 255 = measured table pixel, 0 = excluded: dealer, shoe, cards, a 2 px band around them, and everything above image row ${tableTop}.`,
    use: 'newTable * (1 - grey / 255) in display values, then the keyed dealer on top. Inside the excluded band the grey carries the nearest measured value for 3 px so that ignoring alpha leaves no light halo; further in it is 0.',
    previews: [matteVideoPath, pairVideoPath, `${REVIEW}/shadow-contact-sheet.png`, `${REVIEW}/shadow-on-new-table.png`],
    method: `Green channel against the frame's own lit level; 3 x 3 mean among table pixels; values below about ${NOISE_GATE} fade to 0 as compression noise. Static darkening by body, resting hand and shoe is kept, since it is darker than the lit table too.`,
    quality: {noiseRmsBeforeGate: round(median(matteStats.map(m => m.quietNoise)), 4), noiseGate: NOISE_GATE, peak: rangeOf(matteStats.map(m => m.peak)), shadedPixelsPerFrame: rangeOf(matteStats.map(m => m.shadedPixels), 0), excludedPixelsPerFrame: rangeOf(matteStats.map(m => m.excludedPixels), 0)},
    usable: 'Yes for the table: soft cast shadow and contact shadow follow the hand frame by frame. It holds no shadow on the card itself (card pixels are excluded) and none under the hand.',
  },
  portrait: {
    canvas: {basis: 'GIVEN', width: PORTRAIT.width, height: PORTRAIT.height},
    currentTransform: {basis: 'GIVEN', source: 'src/pamela-card-contact-v6.ts', nativeSize: [NATIVE_W, H], resizedTo: [1586, 1057], cropLeft: 250, cropWidth: 1080, placedAt: [0, 80], scale: round(V6_PORTRAIT.scaleX, 4), nativeColumnsVisible: v6Report.nativeColumnsVisible.map(v => round(v, 1)), formula: 'x\' = x * 1586/1762 - 250, y\' = y * 1057/1174 + 80'},
    targetsUnderCurrentTransform: {basis: 'DERIVED', rows: v6Rows.map(r => ({id: r.id, state: r.state, centrePx: xy(r.centre, 1), widthInsidePercent: round(r.widthInside * 100, 0), lostLeftPx: round(r.overflow.left, 1), lostRightPx: round(r.overflow.right, 1)}))},
    targetsCutOff: {basis: 'DERIVED', outside: v6Cut.filter(r => r.state === 'OUTSIDE').map(r => r.id), partlyCut: v6Cut.filter(r => r.state === 'PARTLY_CUT').map(r => ({id: r.id, widthInsidePercent: round(r.widthInside * 100, 0)})), inside: v6Rows.length - v6Cut.length,
      plannedCardsSpanNativePx: [round(seatBox.x0, 1), round(seatBox.x1, 1)], spanPx: round(seatBox.x1 - seatBox.x0, 0), v6ShowsNativePx: round(PORTRAIT.width / V6_PORTRAIT.scaleX, 0)},
    proposals: reports.map(({p, r}) => ({id: p.id, basis: 'DERIVED', note: p.note, transform: {scale: round(r.scale, 4), offsetX: round(r.offsetX, 1), offsetY: round(r.offsetY, 1), formula: 'x\' = x * scale + offsetX, y\' = y * scale + offsetY, native pixels in'}, sideMarginPx: p.margin, nativeColumnsVisible: r.nativeColumnsVisible.map(v => round(v, 1)),
      cardsInside: r.cardsInside, dealerInside: r.dealerInside, dealerEdgeRow: round(r.dealerEdgeRow, 0), headTopRow: round(r.headTopRow, 0), filmRowsOnCanvas: r.filmRowsOnCanvas.map(v => round(v, 0)),
      lost: [`dealer and cards at ${round(r.dealerScaleVersusV6 * 100, 0)} % of today's portrait size (P4 card ${round(r.p4CardWidthPx, 0)} px wide instead of ${round(v6Report.p4CardWidthPx, 0)} px)`, `${round(r.canvasRowsWithoutFilm.above, 0)} canvas rows above and ${round(r.canvasRowsWithoutFilm.below, 0)} below hold no film and need room and table plates (today ${round(v6Report.canvasRowsWithoutFilm.above, 0)} and ${round(v6Report.canvasRowsWithoutFilm.below, 0)})`,
        r.shoeCutNativePx > 0 ? `the shoe's rear ${round(r.shoeCutNativePx, 0)} native px stay outside (today ${round(v6Report.shoeCutNativePx, 0)})` : `whole shoe visible; ${round(mapPoint(p, {x: seatBox.x0, y: 0}).x, 0)} px of side margin left of P1 and the dealer ${round(mapPoint(p, {x: (dealerBox.x0 + dealerBox.x1) / 2, y: 0}).x - PORTRAIT.width / 2, 0)} px off centre`]})),
    keepingTodaysScale: {basis: 'DERIVED', note: 'Not a framing: at V6 scale with 24 px margins the planned cards would have to span this share of their present width about the centre, which means new clips for the outer seats.', seatSpanWouldHaveToShrinkTo: round(needShrink, 3)},
    planPortraitTargets: {basis: 'DERIVED', what: 'the plan\'s hand-set portrait targets against where an axis-aligned placement of the film would put the native targets', underCurrentTransformRmsGapPx: round(rmsOf(underV6Gap), 0), bestAxisAlignedFit: {scaleX: round(fitX.scale, 3), scaleY: round(fitY.scale, 3), rmsGapPx: round(rmsOf(portraitPlanGap), 0), maxGapPx: round(Math.max(...portraitPlanGap), 0)},
      finding: 'The portrait targets ask for a seat arc several times deeper than the film\'s. No scale-and-crop of the film puts the dealt hand on them; they describe a different table, not a framing.'},
  },
  sources: [...sources.entries()].map(([file, s]) => ({path: file, sha256: s.sha256, bytes: s.bytes, framesUsed: [...s.frames].sort((a, b) => a - b), usedFor: [...s.usedFor]})),
  limits: [
    'The landed cards of the plan clips were imposed through an end image built from the plan. They carry the plan\'s projection, so the plane fitted to them cannot test that projection against reality.',
    'Four cards in three places, two of them at P4, all in the lower third of the frame. Perspective (vanishing line, focal length, height) rests on the P1 and P7 cards; P7 is partly under a hand and its far edge was read in deep shadow from the outer edge.',
    'No real metric scale: hands, shoe and the generator\'s own cards disagree with the plan-scale card by factors of 1.2 to 2.6, and the older white-card take drew the P4 card about twice as wide again.',
    'The table and the backdrop are the same green; no table outline, felt line or far corner is visible. The only table line seen is the dealer-side edge behind the hands.',
    'Light: only the sideways lean is observable. Lean toward or away from the camera, the lamp\'s size and its distance cannot be separated from the unknown height of the hand.',
    'Shadow matte: table only; nothing on cards or under the hand; one clip and one frame range. The first frames of a clip are brighter than the rest, so mattes must be normalised per frame as done here.',
    'Principal row, lens distortion and rolling shutter are not observable; the footage is generated and need not obey one camera at all.',
  ],
  wouldSettleIt: [
    'A clip or still from the same READY framing with a printed grid or ruler mat lying on the table, covering P1 to P7 and the dealer-side edge, drawn by the generator without a warped end image: gives the plane and the scale the generator itself uses.',
    'Failing that, real-size cards left where the generator puts them at P1, P4, P7 and in front of the dealer (four or more unedited landings spread over the table).',
    'One object of known height standing on the table in the same light (a chip stack or a card box at P4 and near the shoe): fixes the light\'s lean toward the camera and its size.',
    'A decision on the scale convention: either the plan card is 63 mm and the dealer is a large figure, or the dealer is life size and the cards are scaled up by about 1.2 to 2.',
  ],
};
await writeFile('data/scene-contract.json', JSON.stringify(contract, null, 2) + '\n');

console.log(`plane: ${fitCards.length} cards, edge rms ${plane.fit.residualRms.toFixed(2)} px (general model ${general.fit.residualRms.toFixed(2)} px), leave-one-out card rms ${leaveOneOut.map(l => l.leftOutCardEdgeRms.toFixed(2)).join('/')} px, predicted cards move up to ${looWorst.toFixed(1)} px, 95 % uncertainty ${noiseWorst.toFixed(1)} px`);
console.log(`camera: f ${planeCamera.focalPx.toFixed(0)} px, pitch ${planeCamera.pitchDownDeg.toFixed(1)} deg, height ${planeCamera.heightAboveTableMm.toFixed(0)} mm, ground distance ${planeCamera.groundDistanceToOriginMm.toFixed(0)} mm, vanishing line row ${planeCamera.horizonYAtImageCentre.toFixed(0)}`);
console.log(`plan: one plane to ${planPlane.residualRms.toExponential(1)} px; against the calibrated plane max ${gapMax.toFixed(1)} px, rms ${gapRms.toFixed(1)} px, largest at ${worst[0].id}`);
console.log(`scale: hand ${hands.map(h => h.widthOnPlaneMm.toFixed(0)).join('/')} mm, shoe ${shoeBaseMm.toFixed(0)} mm, generator cards ${generatorRows.map(g => `${g.sizeOnPlaneMm.width.toFixed(0)}x${g.sizeOnPlaneMm.height.toFixed(0)}`).join(', ')} mm on the plane`);
console.log(`light: sideways lean ${leanDeg.toFixed(1)} deg (${leanRange.p16.toFixed(1)}..${leanRange.p84.toFixed(1)}), blur sigma ${median(blurPx)} px, contact darkness ${contactPeak.toFixed(2)}; ${shadowFrames.length} mattes in ${matteDir}`);
console.log(`portrait: V6 cuts ${v6Cut.map(r => `${r.id} (${(r.widthInside * 100).toFixed(0)} % left)`).join(', ')}; ${reports.map(({p, r}) => `${p.id} scale ${r.scale.toFixed(3)}`).join(', ')}`);
console.log(`wrote data/scene-contract.json and review images in ${REVIEW}`);
