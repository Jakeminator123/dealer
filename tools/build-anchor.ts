// Builds one keyframe for a clip job from a REAL video frame. Only card pixels change:
// an old card is removed, a shoe card may be recoloured, and the planned card quad is painted
// on the table behind any hand that covers it. Pose, body, shoe and table stay untouched.
//   node tools/build-anchor.ts <anchor id from data/clip-jobs.json>
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {validatePlan, flatQuad, quad} from '../src/placement-model.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
sharp.concurrency(1);
const W = 1764, H = 1174, N = W * H;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
type Colour = 'blue' | 'magenta';
type Anchor = {id: string; purpose: string; base: {frame?: {video: string; videoSha256: string; index: number}; file?: {path: string; sha256: string}};
  cardTexture?: {frame: {video: string; videoSha256: string; index: number}}; erase?: Colour[]; restore?: {what: string; box: [number, number, number, number]; plate: {frame: {video: string; videoSha256: string; index: number}}}[];
  paint?: {target: string; side: 'FRONT' | 'BACK'}[]; plan: {path: string; sha256: string}};

const anchors: Anchor[] = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')).anchors ?? [];
const anchor = anchors.find(a => a.id === process.argv[2]);
if (!anchor) throw Error('Usage: build-anchor.ts <anchor id from data/clip-jobs.json>');
const dir = `assets/anchors/${anchor.id}`;
if (await stat(dir).catch(() => null)) throw Error('Anchor already built; anchors are immutable, use a new id.');

let baseBytes: Buffer, baseSource: Record<string, unknown>;
if (anchor.base.frame) {
  const f = anchor.base.frame;
  if (sha(await readFile(f.video)) !== f.videoSha256) throw Error(`Source video changed: ${f.video}`);
  baseBytes = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f.video, '-vf', `select=eq(n\\,${f.index})`, '-fps_mode', 'vfr', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'image2pipe', '-c:v', 'png', '-'], {maxBuffer: 64 << 20});
  baseSource = {kind: 'decoded video frame', video: f.video, videoSha256: f.videoSha256, frame: f.index};
} else if (anchor.base.file) {
  baseBytes = await readFile(anchor.base.file.path);
  if (sha(baseBytes) !== anchor.base.file.sha256) throw Error(`Base image changed: ${anchor.base.file.path}`);
  baseSource = {kind: 'existing image', path: anchor.base.file.path};
} else throw Error('Anchor needs a base frame or file.');
const meta = await sharp(baseBytes).metadata();
if (meta.width !== W || meta.height !== H) throw Error(`Base must be ${W}x${H}.`);
const px = await sharp(baseBytes).removeAlpha().raw().toBuffer();

const is: Record<Colour | 'green', (r: number, g: number, b: number) => boolean> = {
  blue: (r, g, b) => b > 90 && b > 1.5 * r && b > 1.15 * g,
  magenta: (r, g, b) => r > 110 && b > 110 && g < 0.6 * Math.min(r, b),
  green: (r, g, b) => g > r + 60 && g > b + 60,
};
const at = (i: number) => [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]] as const;
const report: Record<string, unknown> = {};

// 1. Remove old table cards of the named colours, including their pale rim, without touching skin or sleeve.
for (const colour of anchor.erase ?? []) {
  const core = new Uint8Array(N); let count = 0;
  const skip = (anchor.restore ?? []).map(r => r.box);
  for (let i = 0; i < N; i++) { const x = i % W, y = (i - x) / W; if (skip.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) continue; if (is[colour](...at(i))) { core[i] = 1; count++; } }
  if (!count) throw Error(`No ${colour} card found to remove.`);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let i = 0; i < N; i++) if (core[i]) { const x = i % W, y = (i - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // Everything within R pixels of the card is replaced unless it is hand skin or dark sleeve/shoe,
  // so the pale rim and its soft edge go too. Rows are refilled by interpolating the clean table
  // on either side, which keeps the table's own shading instead of leaving a flat patch.
  const R = 9, hole = new Uint8Array(N); let replaced = 0;
  const skin = (r: number, g: number, b: number) => r > 120 && r > g + 15 && g >= b - 25 && r > b + 25 && g > 0.55 * r;
  const dark = (r: number, g: number, b: number) => r < 75 && g < 75 && b < 75;
  for (let y = Math.max(0, y0 - R); y <= Math.min(H - 1, y1 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(W - 1, x1 + R); x++) {
    const i = y * W + x; let near = core[i] === 1;
    for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (dx * dx + dy * dy <= R * R && yy >= 0 && yy < H && xx >= 0 && xx < W && core[yy * W + xx]) { near = true; break; } }
    if (!near) continue;
    const [r, g, b] = at(i);
    if (core[i] || (!skin(r, g, b) && !dark(r, g, b))) { hole[i] = 1; replaced++; }
  }
  // Table samples may be shadowed; a hand next to the run is stepped over, not treated as table.
  const table = (r: number, g: number, b: number) => g > r + 35 && g > b + 35;
  const sample = (y: number, x: number, step: number) => { const acc = [0, 0, 0]; let n = 0;
    for (let k = 1; k <= 70 && n < 5; k++) { const xx = x + k * step; if (xx < 0 || xx >= W) break; const i = y * W + xx; if (hole[i]) continue; const c = at(i); if (!table(...c)) continue; for (let j = 0; j < 3; j++) acc[j] += c[j]; n++; }
    return n >= 2 ? acc.map(v => v / n) : null; };
  const pending: number[] = [];
  for (let y = Math.max(0, y0 - R); y <= Math.min(H - 1, y1 + R); y++) {
    let x = Math.max(0, x0 - R);
    while (x <= Math.min(W - 1, x1 + R)) {
      if (!hole[y * W + x]) { x++; continue; }
      let end = x; while (end + 1 < W && hole[y * W + end + 1]) end++;
      const left = sample(y, x, -1), right = sample(y, end, 1), a = left ?? right, b = right ?? left;
      for (let xx = x; xx <= end; xx++) {
        if (!a || !b) { pending.push(y * W + xx); continue; }
        const t = end === x ? 0.5 : (xx - x) / (end - x); for (let j = 0; j < 3; j++) px[(y * W + xx) * 3 + j] = Math.round(a[j] * (1 - t) + b[j] * t);
      }
      x = end + 1;
    }
  }
  // Rows boxed in by the hand on both sides take the nearest already clean table pixel above or below.
  for (const i of pending) { let done = false;
    for (let k = 1; k <= 80 && !done; k++) for (const j of [i - k * W, i + k * W]) { if (j < 0 || j >= N || pending.includes(j)) continue; const c = at(j); if (hole[j] || table(...c)) { for (let q = 0; q < 3; q++) px[i * 3 + q] = c[q]; done = true; break; } }
    if (!done) throw Error('No clean table near part of the old card; choose another base frame.'); }
  // One vertical smoothing pass inside the hole removes row-to-row streaks.
  const copy = Buffer.from(px);
  for (let i = 0; i < N; i++) if (hole[i]) { const up = i - W >= 0 && hole[i - W] ? i - W : i, down = i + W < N && hole[i + W] ? i + W : i; for (let j = 0; j < 3; j++) px[i * 3 + j] = Math.round((copy[up * 3 + j] + 2 * copy[i * 3 + j] + copy[down * 3 + j]) / 4); }
  report[`erased:${colour}`] = {corePixels: count, replacedPixels: replaced, box: [x0, y0, x1, y1], fill: 'row interpolation from adjacent clean table'};
}

// 2. Restore the shoe window from another REAL frame of the same locked shot: inside the box,
//    every pixel that is neither hand skin nor dark sleeve/shoe takes the plate's pixel.
for (const step of anchor.restore ?? []) {
  const f = step.plate.frame;
  if (sha(await readFile(f.video)) !== f.videoSha256) throw Error(`Plate video changed: ${f.video}`);
  const plate = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f.video, '-vf', `select=eq(n\\,${f.index})`, '-fps_mode', 'vfr', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 64 << 20});
  if (plate.length !== N * 3) throw Error('Plate frame has the wrong size.');
  let n = 0;
  for (let y = step.box[1]; y <= step.box[3]; y++) for (let x = step.box[0]; x <= step.box[2]; x++) {
    const i = y * W + x, [r, g, b] = at(i);
    const skin = r > 120 && r > g + 15 && g >= b - 25 && r > b + 25 && g > 0.55 * r, dark = r < 75 && g < 75 && b < 75;
    if (skin || dark || is.green(r, g, b)) continue;
    for (let j = 0; j < 3; j++) px[i * 3 + j] = plate[i * 3 + j]; n++;
  }
  report[`restored:${step.what}`] = {pixels: n, box: step.box, plate: {video: f.video, videoSha256: f.videoSha256, frame: f.index}};
}

// A flat painted quad makes the video model invent a printed card face. When a texture frame is
// named, the REAL rendered card (rim, shading, soft edge) is warped onto the planned quad instead.
type Pt = {x: number; y: number};
const corners = (pts: Pt[]): Pt[] => [pts.reduce((a, p) => p.x + p.y < a.x + a.y ? p : a), pts.reduce((a, p) => p.x - p.y > a.x - a.y ? p : a), pts.reduce((a, p) => p.x + p.y > a.x + a.y ? p : a), pts.reduce((a, p) => p.x - p.y < a.x - a.y ? p : a)];
function homography(from: Pt[], to: Pt[]): number[] { // maps a point of `from` onto `to`
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) { const {x, y} = from[i], {x: u, y: v} = to[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) throw Error('Degenerate card quad.');
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; } }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}
let texture: {rgb: Buffer; mask: Uint8Array; quad: Pt[]; source: unknown} | null = null;
if (anchor.cardTexture) {
  const f = anchor.cardTexture.frame;
  if (sha(await readFile(f.video)) !== f.videoSha256) throw Error(`Texture video changed: ${f.video}`);
  const rgb = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f.video, '-vf', `select=eq(n\\,${f.index})`, '-fps_mode', 'vfr', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 64 << 20});
  const mask = new Uint8Array(N), pts: Pt[] = [];
  for (let i = 0; i < N; i++) if (is.blue(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])) { mask[i] = 1; pts.push({x: i % W, y: Math.floor(i / W)}); }
  if (pts.length < 1500) throw Error('Texture frame has no clear blue card.');
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  // Push the corners outward so the pale rim and soft edge come along.
  texture = {rgb, mask, quad: corners(pts).map(p => { const d = Math.hypot(p.x - cx, p.y - cy); return {x: p.x + (p.x - cx) / d * 4, y: p.y + (p.y - cy) / d * 4}; }), source: {video: f.video, videoSha256: f.videoSha256, frame: f.index, cardPixels: pts.length}};
}

// 3. Put planned cards on the table, behind anything that is hand or sleeve.
const planBytes = await readFile(anchor.plan.path);
if (sha(planBytes) !== anchor.plan.sha256) throw Error('Placement plan differs from the frozen hash; update the anchor definition deliberately.');
const plan = JSON.parse(planBytes.toString()); validatePlan(plan);
const painted: unknown[] = [];
for (const card of anchor.paint ?? []) {
  const geometry = plan.targets[card.target]?.geometry.native; if (!geometry) throw Error(`Unknown target ${card.target}.`);
  const reference = plan.targets['P4.C1'].geometry.native;
  const native = plan.tableProjection?.mode === 'flat' ? flatQuad(geometry, reference, 'native', plan.tableProjection.heading) : quad(geometry, 'native');
  const points = native.map((p: {x: number; y: number}) => ({x: p.x * (W - 1) / 1761, y: p.y}));
  const fill = card.side === 'FRONT' ? '#075ad8' : '#ffdf00';
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${points.map((p: {x: number; y: number}) => `${p.x},${p.y}`).join(' ')}" fill="${fill}" stroke="#e0e4ed" stroke-width="1" stroke-linejoin="round"/></svg>`);
  const layer = await sharp(svg).ensureAlpha().raw().toBuffer();
  if (texture && card.side === 'FRONT') {
    // Replace the flat layer with real card pixels: every pixel of the (slightly grown) planned quad
    // looks up its place in the real card through the quad-to-quad mapping.
    // The planned quad can be strongly sheared, so its four given points are put in clockwise order
    // by angle around their centre (starting nearest the top left) rather than picked by extremes.
    const mx = points.reduce((s: number, p: Pt) => s + p.x, 0) / 4, my = points.reduce((s: number, p: Pt) => s + p.y, 0) / 4;
    const ring = [...points].sort((a: Pt, b: Pt) => Math.atan2(a.y - my, a.x - mx) - Math.atan2(b.y - my, b.x - mx));
    const first = ring.reduce((best, p, i) => p.x + p.y < ring[best].x + ring[best].y ? i : best, 0), dst: Pt[] = [0, 1, 2, 3].map(k => ring[(first + k) % 4]);
    const grown = dst.map(p => { const d = Math.hypot(p.x - mx, p.y - my); return {x: p.x + (p.x - mx) / d * 4, y: p.y + (p.y - my) / d * 4}; });
    const h = homography(grown, texture.quad), inside = (x: number, y: number) => grown.every((a, i) => { const b = grown[(i + 1) % 4]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0; });
    layer.fill(0);
    const x0 = Math.floor(Math.min(...grown.map(p => p.x))), x1 = Math.ceil(Math.max(...grown.map(p => p.x))), y0 = Math.floor(Math.min(...grown.map(p => p.y))), y1 = Math.ceil(Math.max(...grown.map(p => p.y)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || !inside(x, y)) continue;
      const w = h[6] * x + h[7] * y + 1, u = (h[0] * x + h[1] * y + h[2]) / w, v = (h[3] * x + h[4] * y + h[5]) / w;
      const ux = Math.round(u), vy = Math.round(v); if (ux < 2 || vy < 2 || ux >= W - 2 || vy >= H - 2) continue;
      let near = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near += texture.mask[(vy + dy) * W + ux + dx];
      if (!near) continue; // outside the real card and its rim: leave the table alone
      const s = (vy * W + ux) * 3, i = (y * W + x) * 4;
      layer[i] = texture.rgb[s]; layer[i + 1] = texture.rgb[s + 1]; layer[i + 2] = texture.rgb[s + 2]; layer[i + 3] = texture.mask[vy * W + ux] ? 255 : Math.min(255, near * 28);
    }
  }
  // Hand skin and dark sleeve stay in front. Table in the hand's shadow still gets the card,
  // darkened by the same amount as the table there, so the card does not vanish inside a shadow.
  const lit: number[] = [];
  for (let i = 0; i < N; i++) if (layer[i * 4 + 3]) { const [r, g, b] = at(i); if (is.green(r, g, b)) lit.push(g); }
  lit.sort((a, b) => a - b); const litLevel = lit.length ? lit[Math.floor(lit.length * 0.75)] : 220;
  let visible = 0, hidden = 0;
  for (let i = 0; i < N; i++) { const a = layer[i * 4 + 3]; if (!a) continue;
    const [r, g, b] = at(i), skin = r > 120 && r > g + 15 && g >= b - 25 && r > b + 25 && g > 0.55 * r, dark = r < 75 && g < 75 && b < 75;
    if (skin || dark) { hidden++; continue; }
    const shade = Math.min(1, Math.max(0.45, g / litLevel));
    for (let k = 0; k < 3; k++) px[i * 3 + k] = Math.round((layer[i * 4 + k] * shade * a + px[i * 3 + k] * (255 - a)) / 255); visible++; }
  if (visible < 300) throw Error(`${card.target}: the planned card would be almost fully hidden by the hand; choose another base frame.`);
  painted.push({target: card.target, side: card.side, submittedPoints: points, visiblePixels: visible, hiddenBehindForeground: hidden});
}

const out = await sharp(px, {raw: {width: W, height: H, channels: 3}}).png().toBuffer();
await mkdir(dir, {recursive: true});
await writeFile(`${dir}/anchor.png`, out, {flag: 'wx'});
await writeFile(`${dir}/placement-plan.json`, planBytes, {flag: 'wx'});
const receipt = {schemaVersion: 1, id: anchor.id, purpose: anchor.purpose, createdAt: new Date().toISOString(), base: {...baseSource, sha256: sha(baseBytes)},
  method: 'Real frame; only card pixels changed. No image generation, no pose or scene edit.', operations: report, painted, cardTexture: texture?.source ?? 'flat painted quad',
  plan: {path: `${dir}/placement-plan.json`, sha256: anchor.plan.sha256, source: anchor.plan.path, updatedAt: plan.updatedAt}, output: {path: `${dir}/anchor.png`, sha256: sha(out), bytes: out.length, width: W, height: H}};
await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({id: anchor.id, path: receipt.output.path, sha256: receipt.output.sha256, operations: report, painted: painted.map((p: any) => ({target: p.target, visible: p.visiblePixels, hidden: p.hiddenBehindForeground}))}));
