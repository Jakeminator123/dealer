// The pictures that go out with an order (tools/order-store.ts writes them into assets/orders/<id>/). A picture of the
// register is copied byte for byte when it is a PNG file, or decoded from its film when it is a frame. The last picture
// of a deal is the first picture with ONE card drawn where the placement plan says, by the plan's own drawing rule
// (flatQuad from P4.C1 when the table is flat, as the lab draws it) and with real card pixels, not flat colour: the bank's
// seat-4 card from the last frame of pamela-p4-c1-plan-return-idle-01, whose outline is the quad its last picture was
// painted with (assets/anchors/pamela-idle-p4-c1-plan-01/receipt.json). The same recipe as
// D:/dealer-scratch/tmp/paow/skript/plan-till-order-2.py (lines 75–109), ported; the drawn card is then measured
// against the plan (the centre of the changed pixels against the plan's point, in pixels).
//
//   node tools/order-images.ts <order id>     fetch what a draft waits for when it holds, and (re)draw its last picture
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
export async function readRgb(file: string): Promise<Rgb> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H || info.channels !== 3) throw Error(`${file} är ${info.width} × ${info.height}, inte bankens ruta ${W} × ${H}.`);
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

/** Draws one card of the plan on `base` and measures it: the picture and what to keep in the order. */
export function drawCard(base: Rgb, texture: Texture, plan: PlacementPlan, planFile: { path: string; sha256: string }, target: string): { rgb: Rgb; drawn: Drawn } {
  const side = plan.targets[target]?.intent.endSide ?? 'FRONT';
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
      const d = p.drawn ?? p.preview?.drawn;
      console.log(`${p.label.padEnd(28)} ${p.path ?? `väntar på ${p.waits?.label}`}${d ? ` · kortet ${d.target} ${d.measuredOffsetPx} px från planen${p.drawn ? '' : ` (förhandsvisning på ${p.preview?.on})`}` : ''}`);
    }
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
