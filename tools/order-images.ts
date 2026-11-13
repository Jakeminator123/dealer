// The pictures that go out with an order (tools/order-store.ts writes them into assets/orders/<id>/). A picture of the
// register is copied byte for byte when it is a PNG file, or decoded from its film when it is a frame. The last picture
// of a deal is the first picture with ONE card drawn where the placement plan says, by the plan's own drawing rule
// (flatQuad from P4.C1 when the table is flat, as the lab draws it) and with real card pixels, not flat colour: the bank's
// seat-4 card from the last frame of pamela-p4-c1-plan-return-idle-01, whose outline is the quad its last picture was
// painted with (assets/anchors/pamela-idle-p4-c1-plan-01/receipt.json). The same recipe as
// D:/dealer-scratch/tmp/paow/skript/plan-till-order-2.py (lines 75–109), ported; the drawn card is then measured
// against the plan (the centre of the changed pixels against the plan's point, in pixels). The pose picture of a still is
// cut down to a figure (cutFigure): only the region the order keeps of the other dealer (her dealing forearm, hand, the
// shoe and the card), the rest of her filled with the picture's own green; then its green is brought to the green of the
// anchor it is sent with (matchGreen), so that the two pictures of a still have one green.
//
//   node tools/order-images.ts <order id>     fetch what a draft waits for or follows when it holds, and (re)draw its last picture
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { flatQuad, quad, validatePlan, type PlacementPlan } from '../src/placement-model.ts';
import type { Drawn } from '../src/order-model.ts';

export const W = 1764, H = 1174, N = W * H;
export type Pt = [number, number];
export type Rgb = Buffer; // W × H × 3, row by row
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// The card texture: a real frame of the bank and the outline the card in it was laid with.
export const TEXTURE = {
  video: 'assets/motions/pamela-p4-c1-plan-return-idle-01/source.mp4',
  frame: 89,
  quadFrom: 'assets/anchors/pamela-idle-p4-c1-plan-01/receipt.json',
} as const;

// ── Pixels ──────────────────────────────────────────────────────────────────
/** One frame of a film as RGB, decoded by ffmpeg (the same call as tools/build-anchor.ts). */
export function decodeFrame(file: string, index: number): Rgb {
  const out = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${index})`, '-fps_mode', 'vfr', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  if (out.length !== N * 3) throw Error(`${file} ruta ${index}: ${out.length} byte, inte bankens ruta ${W} × ${H}.`);
  return out;
}
export async function readRgb(file: string | Buffer): Promise<Rgb> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H || info.channels !== 3) throw Error(`${typeof file === 'string' ? file : 'Bilden'} är ${info.width} × ${info.height}, inte bankens ruta ${W} × ${H}.`);
  return data;
}
export const pngOf = (rgb: Rgb) => sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

/** Maps a point of `from` onto `to` (eight unknowns, Gauss–Jordan; the same solver as tools/build-anchor.ts). */
export function homography(from: readonly Pt[], to: readonly Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw Error('Kortets fyrhörning är urartad.');
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}
export const apply = (h: readonly number[], x: number, y: number): Pt => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };

/** Connected parts of a mask (8 neighbours): a label per pixel, and per part its area and centre. */
export function components(mask: Uint8Array, width = W, height = H) {
  const labels = new Int32Array(mask.length), parts: { area: number; cx: number; cy: number; x0: number; y0: number; x1: number; y1: number }[] = [{ area: 0, cx: 0, cy: 0, x0: 0, y0: 0, x1: 0, y1: 0 }];
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    const id = parts.length, part = { area: 0, cx: 0, cy: 0, x0: width, y0: height, x1: 0, y1: 0 };
    labels[i] = id; stack.push(i);
    while (stack.length) {
      const j = stack.pop()!, x = j % width, y = (j - x) / width;
      part.area++; part.cx += x; part.cy += y;
      if (x < part.x0) part.x0 = x; if (x > part.x1) part.x1 = x; if (y < part.y0) part.y0 = y; if (y > part.y1) part.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < width && yy < height) { const k = yy * width + xx; if (mask[k] && !labels[k]) { labels[k] = id; stack.push(k); } }
      }
    }
    part.cx /= part.area; part.cy /= part.area;
    parts.push(part);
  }
  return { labels, parts };
}

export type Texture = { rgb: Rgb; mask: Float32Array; quad: Pt[]; source: Drawn['texture'] };

/** The bank's seat-4 card: its pixels, a mask of the card (grown by one pixel, as the script's 3 × 3 dilation) and its outline. */
export async function cardTexture(root: string): Promise<Texture> {
  const video = path.join(root, TEXTURE.video);
  const rgb = decodeFrame(video, TEXTURE.frame);
  const receipt = JSON.parse(await readFile(path.join(root, TEXTURE.quadFrom), 'utf8'));
  const points = receipt?.painted?.[0]?.submittedPoints as { x: number; y: number }[] | undefined;
  if (!points || points.length !== 4) throw Error(`${TEXTURE.quadFrom} har ingen fyrhörning för kortet.`);
  const q: Pt[] = points.map((p) => [p.x, p.y]);
  const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
  // The script's blue: b > 120, b − r > 60, b − g > 25.
  const blue = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; if (b > 120 && b - r > 60 && b - g > 25) blue[i] = 1; }
  const { labels, parts } = components(blue);
  let best = 0;
  for (let k = 1; k < parts.length; k++) if (parts[k].area > 300 && (!best || Math.hypot(parts[k].cx - cx, parts[k].cy - cy) < Math.hypot(parts[best].cx - cx, parts[best].cy - cy))) best = k;
  if (!best) throw Error('Inget blått kort hittades i texturrutan.');
  const mask = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (labels[i] !== best) continue;
    const x = i % W, y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[yy * W + xx] = 1; }
  }
  return { rgb, mask, quad: q, source: { video: TEXTURE.video, frame: TEXTURE.frame, sha256: sha(await readFile(video)), quadFrom: TEXTURE.quadFrom } };
}

/** The card as the lab draws it, in film pixels (the lab's picture is 1762 wide, the film 1764). */
export function planQuad(plan: PlacementPlan, target: string): Pt[] {
  const g = plan.targets[target]?.geometry.native;
  if (!g) throw Error(`Planen har inget kort ${target}.`);
  const flat = plan.tableProjection?.mode === 'flat';
  const q = flat ? flatQuad(g, plan.targets['P4.C1'].geometry.native, 'native', plan.tableProjection?.heading ?? 0) : quad(g, 'native');
  return q.map((p) => [(p.x * (W - 1)) / 1761, p.y]);
}

const sample = (img: ArrayLike<number>, channels: number, c: number, x: number, y: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : img[(yy * W + xx) * channels + c]);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
};

/** Lays the real card onto `base` at `to` (bilinear; the script used cubic for the pixels). A closed card is made yellow from the card's own shading. */
export function layCard(base: Rgb, texture: Texture, to: readonly Pt[], side: 'FRONT' | 'BACK'): Rgb {
  const out = Buffer.from(base), h = homography(to, texture.quad);
  const xs = to.map((p) => p[0]), ys = to.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 3), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 3), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 3), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)) + 3);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const [u, v] = apply(h, x, y), a = sample(texture.mask, 1, 0, u, v);
    if (a <= 0) continue;
    let r = sample(texture.rgb, 3, 0, u, v), g = sample(texture.rgb, 3, 1, u, v), b = sample(texture.rgb, 3, 2, u, v);
    if (side === 'BACK') { r = Math.min(255, b * 1.15); g = Math.min(255, b); b = b * 0.04; }
    const i = (y * W + x) * 3;
    out[i] = Math.round(out[i] * (1 - a) + r * a); out[i + 1] = Math.round(out[i + 1] * (1 - a) + g * a); out[i + 2] = Math.round(out[i + 2] * (1 - a) + b * a);
  }
  return out;
}

/** What changed between two pictures (more than 40 levels in a channel): the largest part, its centre, area and box, and the rest. */
export function measureChange(a: Rgb, b: Rgb): NonNullable<Drawn['measured']> {
  const d = new Uint8Array(N);
  let all = 0;
  for (let i = 0; i < N; i++) if (Math.max(Math.abs(a[i * 3] - b[i * 3]), Math.abs(a[i * 3 + 1] - b[i * 3 + 1]), Math.abs(a[i * 3 + 2] - b[i * 3 + 2])) > 40) { d[i] = 1; all++; }
  const { parts } = components(d);
  let best = 0;
  for (let k = 1; k < parts.length; k++) if (!best || parts[k].area > parts[best].area) best = k;
  if (!best) return { centre: [0, 0], area: 0, box: [0, 0], changedElsewhere: all };
  const p = parts[best], r = (v: number) => Math.round(v * 10) / 10;
  return { centre: [r(p.cx), r(p.cy)], area: p.area, box: [p.x1 - p.x0 + 1, p.y1 - p.y0 + 1], changedElsewhere: all - p.area };
}

/**
 * Draws one card of the plan on `base` and measures it: the picture and what to keep in the order. The side is the order's
 * own choice (closed or open) where it has one, else what the plan says for the card.
 */
export function drawCard(base: Rgb, texture: Texture, plan: PlacementPlan, planFile: { path: string; sha256: string }, target: string, chosen?: 'FRONT' | 'BACK' | null): { rgb: Rgb; drawn: Drawn } {
  const side = chosen ?? plan.targets[target]?.intent.endSide ?? 'FRONT';
  const to = planQuad(plan, target);
  const rgb = layCard(base, texture, to, side);
  const measured = measureChange(base, rgb);
  const r = (v: number) => Math.round(v * 10) / 10;
  const centre: Pt = [to.reduce((s, p) => s + p[0], 0) / 4, to.reduce((s, p) => s + p[1], 0) / 4];
  const flat = plan.tableProjection?.mode === 'flat';
  return {
    rgb,
    drawn: {
      target,
      side,
      as: flat ? 'flatQuad från P4.C1 (planens plana bord, som labbet ritar)' : 'kortets egen fyrhörning (quad)',
      plan: { ...planFile, updatedAt: plan.updatedAt },
      texture: texture.source,
      quad: to.map(([x, y]) => [r(x), r(y)] as [number, number]),
      centre: [r(centre[0]), r(centre[1])],
      measured,
      measuredOffsetPx: measured.area ? r(Math.hypot(measured.centre[0] - centre[0], measured.centre[1] - centre[1])) : null,
    },
  };
}

// ── A pose figure: only part of the person kept ─────────────────────────────
/**
 * The settings a pose figure is cut with (the order keeps them in picture.cut): the person is every pixel more than
 * `tolerance` levels from the green model in a channel (her soft shadow on the green too), grown by `grow` px so that no
 * fringe of hair or cloth is left, and faded out over `feather` px on each side of that edge so that no line shows where
 * the fill meets the picture's green; the model is the median green per `block` × `block` pixels; the grain is the
 * picture's own, taken from the cleanest vertical `strip` of background and laid mirrored side by side. Where the keep
 * region's edge crosses an object (the sleeve at the elbow) it is sharp; where it crosses green or a soft shadow (less than
 * `solid` levels from the model) it fades over `edge` px, so that no straight line is left in the green.
 */
export const CUT = { grow: 10, feather: 5, tolerance: 10, block: 64, strip: 256, solid: 40, edge: 12 } as const;
export type CutOptions = { grow: number; feather: number; tolerance: number; block: number; strip: number; solid: number; edge: number };

/** Whether (x, y) lies inside a polygon (even–odd rule). */
export function inPolygon(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** The distance from (x, y) to the polygon's outline. */
function outlineDistance(poly: readonly Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
/** How much of the pixel at (x, y) lies inside the polygon, 0–1: a one-pixel soft edge, or a ramp `width` px wide. */
export const coverage = (poly: readonly Pt[], x: number, y: number, width = 1) => {
  const d = outlineDistance(poly, x, y) * (inPolygon(poly, x, y) ? 1 : -1);
  return Math.max(0, Math.min(1, 0.5 + d / width));
};

/** A mask grown by r pixels in every direction (a square, in two passes). */
export function growMask(mask: Uint8Array, r: number, width = W, height = H): Uint8Array {
  const across = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let last = -Infinity;
    for (let x = 0; x < width; x++) { if (mask[y * width + x]) last = x; if (x - last <= r) across[y * width + x] = 1; }
    last = Infinity;
    for (let x = width - 1; x >= 0; x--) { if (mask[y * width + x]) last = x; if (last - x <= r) across[y * width + x] = 1; }
  }
  for (let x = 0; x < width; x++) {
    let last = -Infinity;
    for (let y = 0; y < height; y++) { if (across[y * width + x]) last = y; if (y - last <= r) out[y * width + x] = 1; }
    last = Infinity;
    for (let y = height - 1; y >= 0; y--) { if (across[y * width + x]) last = y; if (last - y <= r) out[y * width + x] = 1; }
  }
  return out;
}

/**
 * The green behind the person per pixel: the median of the background per block (a soft shadow on part of a block does
 * not pull it down), blocks with too little background filled from their neighbours, bilinear between block centres.
 */
function greenModel(rgb: Rgb, background: Uint8Array, block: number): Float32Array {
  const bw = Math.ceil(W / block), bh = Math.ceil(H / block), hist = new Uint32Array(bw * bh * 3 * 256), count = new Uint32Array(bw * bh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!background[i]) continue;
    const b = Math.floor(y / block) * bw + Math.floor(x / block);
    count[b]++; for (let c = 0; c < 3; c++) hist[(b * 3 + c) * 256 + rgb[i * 3 + c]]++;
  }
  const grid = new Float32Array(bw * bh * 3), known = new Uint8Array(bw * bh);
  for (let b = 0; b < bw * bh; b++) {
    if (count[b] < (block * block) / 3) continue;
    known[b] = 1;
    for (let c = 0; c < 3; c++) { let seen = 0, v = 0; const at = (b * 3 + c) * 256; while (v < 255 && (seen += hist[at + v]) * 2 < count[b]) v++; grid[b * 3 + c] = v; }
  }
  if (!known.some(Boolean)) throw Error('Ingen grön bakgrund att ta färgen ur.');
  // Unknown blocks take the mean of their known neighbours, ring by ring, then settle (the known ones stay).
  const fixed = Uint8Array.from(known);
  for (let open = true; open; ) {
    open = false;
    const next = Uint8Array.from(known);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const b = by * bw + bx;
      if (known[b]) continue;
      let n = 0; const s = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = bx + dx, yy = by + dy, k = yy * bw + xx; if (xx >= 0 && yy >= 0 && xx < bw && yy < bh && known[k]) { n++; for (let c = 0; c < 3; c++) s[c] += grid[k * 3 + c]; } }
      if (n) { next[b] = 1; for (let c = 0; c < 3; c++) grid[b * 3 + c] = s[c] / n; } else open = true;
    }
    known.set(next);
  }
  for (let round = 0; round < 40; round++) for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const b = by * bw + bx;
    if (fixed[b]) continue;
    let n = 0; const s = [0, 0, 0];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = bx + dx, yy = by + dy, k = yy * bw + xx; if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) { n++; for (let c = 0; c < 3; c++) s[c] += grid[k * 3 + c]; } }
    for (let c = 0; c < 3; c++) grid[b * 3 + c] = s[c] / n;
  }
  const model = new Float32Array(N * 3);
  for (let y = 0; y < H; y++) {
    const gy = Math.max(0, Math.min(bh - 1, (y + 0.5) / block - 0.5)), y0 = Math.floor(gy), y1 = Math.min(bh - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < W; x++) {
      const gx = Math.max(0, Math.min(bw - 1, (x + 0.5) / block - 0.5)), x0 = Math.floor(gx), x1 = Math.min(bw - 1, x0 + 1), fx = gx - x0;
      for (let c = 0; c < 3; c++) {
        const v = (grid[(y0 * bw + x0) * 3 + c] * (1 - fx) + grid[(y0 * bw + x1) * 3 + c] * fx) * (1 - fy) + (grid[(y1 * bw + x0) * 3 + c] * (1 - fx) + grid[(y1 * bw + x1) * 3 + c] * fx) * fy;
        model[(y * W + x) * 3 + c] = v;
      }
    }
  }
  return model;
}

export type CutResult = { rgb: Rgb; filledPx: number; keptPx: number; green: [number, number, number]; grain: [number, number, number]; stripAt: number };
/**
 * A pose figure: of the person only what lies inside `keep` stays; the rest of her is replaced by the picture's own green
 * (its model per block plus the grain of a clean strip of the same picture). Pixels that are background stay as they
 * were, so the green around the figure is the picture's own. The same picture and settings always give the same bytes.
 */
export function cutFigure(rgb: Rgb, keep: readonly Pt[], options: CutOptions = CUT): CutResult {
  if (rgb.length !== N * 3) throw Error(`Posebilden är inte bankens ruta ${W} × ${H}.`);
  // Plainly green pixels first, for a first model; then the person against that model, grown; then the model again without her.
  const plain = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; if (g > 170 && g - r > 120 && g - b > 100) plain[i] = 1; }
  let model = greenModel(rgb, plain, options.block);
  const person = new Uint8Array(N);
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) if (Math.abs(rgb[i * 3 + c] - model[i * 3 + c]) > options.tolerance) { person[i] = 1; break; }
  const grown = growMask(person, options.grow), background = new Uint8Array(N);
  for (let i = 0; i < N; i++) background[i] = grown[i] ? 0 : 1;
  model = greenModel(rgb, background, options.block);
  // The grain: the picture's own around its model, from the vertical strip with the least of her in it (away from the
  // frame's edge), laid mirrored side by side so that no seam shows; where the strip is not background, no grain.
  const T = options.strip, column = new Uint32Array(W);
  for (let i = 0; i < N; i++) if (grown[i]) column[i % W]++;
  let stripAt = 16, least = Infinity;
  for (let x0 = 16; x0 + T <= W - 16; x0 += 16) { let s = 0; for (let x = x0; x < x0 + T; x++) s += column[x]; if (s < least) { least = s; stripAt = x0; } }
  const grainAt = (x: number, y: number, c: number) => {
    const k = x % (2 * T), sx = stripAt + (k < T ? k : 2 * T - 1 - k), j = y * W + sx;
    return background[j] ? rgb[j * 3 + c] - model[j * 3 + c] : 0;
  };
  const sq = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = stripAt; x < stripAt + T; x++) if (background[y * W + x]) { n++; for (let c = 0; c < 3; c++) sq[c] += grainAt(x - stripAt, y, c) ** 2; }
  const grain = sq.map((s) => Math.sqrt(s / Math.max(1, n))) as [number, number, number];
  // How much of the fill each pixel gets: the grown mask averaged over a (2 · feather + 1)² box (a summed-area table).
  const f = options.feather, table = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += grown[y * W + x]; table[(y + 1) * (W + 1) + x + 1] = table[y * (W + 1) + x + 1] + row; } }
  const weight = (x: number, y: number) => {
    const x0 = Math.max(0, x - f), x1 = Math.min(W, x + f + 1), y0 = Math.max(0, y - f), y1 = Math.min(H, y + f + 1);
    return (table[y1 * (W + 1) + x1] - table[y0 * (W + 1) + x1] - table[y1 * (W + 1) + x0] + table[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  const out = Buffer.from(rgb), mean = [0, 0, 0];
  let filledPx = 0, keptPx = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, w = weight(x, y);
    if (!w) continue;
    let deviation = 0;
    for (let c = 0; c < 3; c++) deviation = Math.max(deviation, Math.abs(rgb[i * 3 + c] - model[i * 3 + c]));
    const a = coverage(keep, x, y, deviation < options.solid ? options.edge : 1), share = w * (1 - a);
    if (a >= 1) { if (person[i]) keptPx++; continue; }
    if (share >= 0.5) filledPx++;
    for (let c = 0; c < 3; c++) {
      const fill = Math.max(0, Math.min(255, model[i * 3 + c] + grainAt(x, y, c)));
      out[i * 3 + c] = Math.round(rgb[i * 3 + c] * (1 - share) + fill * share);
      if (share >= 0.5) mean[c] += fill;
    }
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { rgb: out, filledPx, keptPx, green: mean.map((s) => r1(s / Math.max(1, filledPx))) as [number, number, number], grain: grain.map(r1) as [number, number, number], stripAt };
}

// ── The pose figure's green, brought to the anchor's ────────────────────────
/** A plainly green pixel: the same rule as the cut's first model of the background. */
const plainGreen = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return g > 170 && g - r > 120 && g - b > 100; };
/** The median of a picture's plainly green pixels, per channel (in a box when given: x0, y0, width, height). */
export function greenOf(rgb: Rgb, box: [number, number, number, number] = [0, 0, W, H]): [number, number, number] {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  const [x0, y0, w, h] = box;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = y * W + x; if (!plainGreen(rgb, i)) continue; n++; for (let c = 0; c < 3; c++) hist[c][rgb[i * 3 + c]]++; }
  return hist.map((hc) => { let seen = 0, v = 0; while (v < 255 && (seen += hc[v]) * 2 < n) v++; return n ? v : 0; }) as [number, number, number];
}
export type GreenMatch = { rgb: Rgb; anchor: [number, number, number]; before: [number, number, number]; after: [number, number, number] };
/**
 * Brings a pose figure's green to the level and tone of the anchor it is sent with (Jakob 2026-11-13: "why is the green
 * different?"; the cut fills with the source film's own green). Per pixel the shift is the anchor's green model minus the
 * figure's (both the median per block, as the cut models it), weighted by how green the pixel is: its green above its red
 * and blue, against the figure's own green there (a chroma key's alpha). The whole green moves, plain and shadowed alike;
 * the arm, the hand, the black shoe and the yellow card (no green above their red) do not; an edge pixel that is part
 * green moves by its green part, so no fringe of the old green is left around them. The same pictures give the same bytes.
 */
export function matchGreen(figure: Rgb, anchor: Rgb, block: number = CUT.block): GreenMatch {
  if (figure.length !== N * 3 || anchor.length !== N * 3) throw Error(`Bilderna är inte bankens ruta ${W} × ${H}.`);
  const mask = (rgb: Rgb) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (plainGreen(rgb, i)) m[i] = 1; return m; };
  const from = greenModel(figure, mask(figure), block), to = greenModel(anchor, mask(anchor), block);
  const out = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const r = figure[i * 3], g = figure[i * 3 + 1], b = figure[i * 3 + 2];
    const fr = from[i * 3], fg = from[i * 3 + 1], fb = from[i * 3 + 2];
    const key = Math.max(0, Math.min(1, (g - Math.max(r, b)) / Math.max(1, fg - Math.max(fr, fb))));
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(figure[i * 3 + c] + key * (to[i * 3 + c] - from[i * 3 + c]))));
  }
  return { rgb: out, anchor: greenOf(anchor), before: greenOf(figure), after: greenOf(out) };
}

/** The plan as saved, with its hash. */
export async function readPlan(root: string): Promise<{ plan: PlacementPlan; file: { path: string; sha256: string } }> {
  const text = await readFile(path.join(root, 'placements/default.json'), 'utf8');
  const plan = JSON.parse(text);
  validatePlan(plan);
  return { plan, file: { path: 'placements/default.json', sha256: sha(text) } };
}

/** A picture of the register as PNG bytes: the file itself when it is a PNG, else decoded (a frame of a film, a JPEG). */
export async function pictureBytes(root: string, source: { path: string; frame?: number }): Promise<Buffer> {
  const file = path.join(root, ...source.path.split('/'));
  if (source.frame !== undefined) return pngOf(decodeFrame(file, source.frame));
  const bytes = await readFile(file);
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return bytes;
  return sharp(bytes).png().toBuffer();
}

// ── On the command line ─────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) { console.error('[RÖD] Kör från dealer-katalogen.'); process.exit(1); }
  const id = process.argv[2];
  if (!id) { console.log('Använd: node tools/order-images.ts <beställningens id>'); process.exit(2); }
  const { orderStore } = await import('./order-store.ts');
  try {
    const store = orderStore(root);
    const { revision } = await store.load(id);
    const { order } = await store.refresh(id, revision);
    for (const p of order.pictures) {
      const d = p.drawn;
      console.log(`${p.label.padEnd(36)} ${p.path ?? `väntar på ${p.waits?.label}`}${d ? ` · kortet ${d.target} ${d.measuredOffsetPx} px från planen` : ''}${p.cut ? ` · bara ${p.cut.what}, ${p.cut.filledPx} px gröna` : ''}`);
    }
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
