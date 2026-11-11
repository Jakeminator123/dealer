// The table of the 3D scene. Felt, lines, card places and logo are one flat image seen from straight above,
// so a new logo or felt colour is a texture change. Sizes are dealer metres; the group is scaled by the
// contract's k into the plan-scale world. The table's outline and the layout of the print are provisional:
// they were chosen to fit the film frame, not taken from a real table.
// The players' rail is a padded leather roll with a stitched seam on each shoulder, a brass bead against the felt and a
// lacquered walnut apron under its overhang. Its sheen comes from a small painted room that only the rail's own materials
// reflect (an environment map of their own), so the scene's lights, the film and everything in the home view stay as they were.
import * as T from 'three';
import type {Spot} from './scene3d-geometry.ts';

export const FELTS: Record<string, [string, string]> = {green: ['#134232', '#0a2a20'], blue: ['#16325e', '#0b1c38'], vin: ['#571a26', '#330d15'], svart: ['#23272a', '#101214']};
const TABLE = {a: 0.95, b: 0.6, rail: 0.1}; // half width, depth toward the players, rail width
const PRINT = {width: 2.8, depth: 1.4, back: 0.1, pxW: 4096, pxH: 2048}; // the felt image covers width x depth metres and starts `back` behind the dealer edge
const GOLD = '#d8b665';

// ---- the rail's cross-sections, dealer metres: [out from the felt edge, height above the felt] ------------------------------------
// `shade(v)` is how open a point of the section is (1) or how deep in a crease (toward 0), with v the fraction of the way round it.
// It goes into texture data, not vertex colours: textures stay in range where the GPU extrapolates at silhouettes, colours do not.
type Section = {points: number[][]; v: number[]; length: number; shade: (v: number) => number};
function section(points: number[][], shade: (o: number, y: number) => number): Section {
  const d = [0]; for (let i = 1; i < points.length; i++) d.push(d[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = d[d.length - 1], v = d.map(x => x / length);
  return {points, v, length, shade: (at: number) => { let i = 1; while (i < v.length - 1 && v[i] < at) i++; const f = Math.min(1, Math.max(0, (at - v[i - 1]) / (v[i] - v[i - 1] || 1)));
    return shade(points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f); }};
}
// The leather roll: a rounded box section (a superellipse round CORE), fuller on top, about 10 cm wide and 4.6 cm high, overhanging
// the apron by 9 mm, with a shallow groove on each shoulder where the top panel is sewn to the sides. Sampled densely at the seams and
// sparsely on the underside that nothing sees. The points run from the middle of the underside up the inner face, over the top and
// back round, so the faces point outward; the shade darkens the creases at the brass bead and under the overhang.
const CORE = [0.057, 0.012], SEAMS = [2.3, 0.84]; // seam angles round the core, radians from the outward side
const ROLL = (() => {
  const at = (q: number) => { const c = Math.cos(q), s = Math.sin(q), e = s > 0 ? 0.8 : 0.66, x = 0.05 * Math.sign(c) * Math.abs(c) ** e, y = (s > 0 ? 0.034 : 0.031) * Math.sign(s) * Math.abs(s) ** e;
    const dent = SEAMS.reduce((sum, m) => sum + Math.exp(-(((q - m) / 0.075) ** 2)), 0), f = 1 - 0.0016 * dent / Math.hypot(x, y); return [CORE[0] + x * f, CORE[1] + y * f]; };
  const F = 2880, fine: number[][] = [], length = [0], weight = [0];
  for (let i = 0; i <= F; i++) { const q = 1.5 * Math.PI - 2 * Math.PI * i / F; fine.push(at(q)); if (!i) continue;
    const step = Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]), seam = SEAMS.reduce((sum, m) => sum + Math.exp(-(((q - m) / 0.12) ** 2)), 0);
    length.push(length[i - 1] + step); weight.push(weight[i - 1] + step * (Math.sin(q) < -0.75 ? 0.2 : 1 + 3 * seam)); }
  const count = 46, points: number[][] = []; let i = 0;
  for (let n = 0; n < count; n++) { const goal = weight[F] * n / (count - 1); while (i < F - 1 && weight[i + 1] < goal) i++; const f = Math.min(1, Math.max(0, (goal - weight[i]) / (weight[i + 1] - weight[i])));
    points.push([fine[i][0] + (fine[i + 1][0] - fine[i][0]) * f, fine[i][1] + (fine[i + 1][1] - fine[i][1]) * f]); }
  const seamV = SEAMS.map(m => length[Math.round((1.5 * Math.PI - m) / (2 * Math.PI) * F)] / length[F]);
  const shade = (o: number, y: number) => (1 - 0.62 * Math.exp(-Math.hypot(o - 0.009, y) / 0.009)) * (1 - 0.55 * Math.exp(-Math.hypot(o - 0.099, y + 0.02) / 0.008)) * (y < CORE[1] - 0.022 ? 0.6 : 1);
  return {...section(points, shade), seams: seamV.map((v, s) => ({v, toward: s ? -1 : 1}))}; // `toward`: direction of v from the seam to the crown
})();
// A half-round brass bead along the felt edge, tucked under the roll and 2 mm over the felt so no gap shows.
const BEAD = section([[-0.0022, -0.003], [-0.0022, 0.0008], [-0.0012, 0.0032], [0.0008, 0.0047], [0.0035, 0.0053], [0.0062, 0.0046], [0.0082, 0.0028], [0.0092, 0], [0.0092, -0.004]], o => 1 - 0.5 * Math.max(0, Math.min(1, (o - 0.004) / 0.005)));
// The apron: a straight lacquered face with a rounded lower edge. Its top rises straight into the roll, so nothing under the overhang
// faces up into the light; it sits in the overhang's shade.
const APRON = section([[0.0985, -0.006], [0.0993, -0.018], [0.1, -0.03], [0.1, -0.075], [0.1, -0.118], [0.0993, -0.126], [0.096, -0.1305], [0.088, -0.133], [0.05, -0.15]],
  (o, y) => (0.28 + 0.72 * Math.min(1, Math.max(0, (-0.016 - y) / 0.034))) * (y < -0.128 ? 0.7 : 1));

// Sweeps a section along the players' arc. Each ring sits at the felt-edge point P(t) and the section's `out` runs along the edge's
// true outward normal, so the rail keeps its width round the tight ends. `cap` rounds the two ends off past the dealer's edge: the
// section shrinks toward `core` while it moves `length` on. u runs along the arc in tiles of `tile` metres (the length along that line
// of the section, so the grain does not stretch round the ends); v runs once round the section, 0 to 1, so textures can follow it.
type Cap = {length: number; core: number[]; steps: number};
function sweep(sec: Section, rings: number, tile: number, cap: Cap | null) {
  const {a, b} = TABLE, M = sec.points.length, K = cap ? cap.steps : 0, position: number[] = [], uv: number[] = [], index: number[] = [];
  const list: {t: number; push: number; shrink: number}[] = [];
  for (let k = K; k >= 1; k--) list.push({t: 0, push: cap!.length * Math.sin(k / K * Math.PI / 2), shrink: Math.cos(k / K * Math.PI / 2)});
  for (let i = 0; i <= rings; i++) list.push({t: Math.PI * i / rings, push: 0, shrink: 1});
  for (let k = 1; k <= K; k++) list.push({t: Math.PI, push: cap!.length * Math.sin(k / K * Math.PI / 2), shrink: Math.cos(k / K * Math.PI / 2)});
  let along = 0, last = 0;
  for (const ring of list) {
    for (let k = 0; k < 8 && ring.t > last; k++) { const t0 = last + (ring.t - last) * k / 8, t1 = last + (ring.t - last) * (k + 1) / 8; along += Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), b * (Math.sin(t1) - Math.sin(t0))); }
    last = ring.t;
    const t = ring.t, nl = Math.hypot(b * Math.cos(t), a * Math.sin(t)), nx = b * Math.cos(t) / nl, nz = a * Math.sin(t) / nl, phi = Math.atan2(nz, nx), past = t < 1 ? -ring.push : ring.push;
    for (let j = 0; j < M; j++) {
      let [o, y] = sec.points[j]; if (cap) { o = cap.core[0] + (o - cap.core[0]) * ring.shrink; y = cap.core[1] + (y - cap.core[1]) * ring.shrink; }
      position.push(a * Math.cos(t) + o * nx, y, b * Math.sin(t) + o * nz - ring.push); uv.push((along + o * phi + past) / tile, sec.v[j]);
    }
  }
  for (let r = 0; r < list.length - 1; r++) for (let j = 0; j < M - 1; j++) { const q = r * M + j; index.push(q, q + M, q + 1, q + 1, q + M, q + M + 1); }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal') as T.BufferAttribute, [first, end] = [sec.points[0], sec.points[M - 1]];
  if (Math.hypot(first[0] - end[0], first[1] - end[1]) < 1e-6) for (let r = 0; r < list.length; r++) { // a closed section: join the normals where it meets itself
    const p = r * M, q = p + M - 1, x = normal.getX(p) + normal.getX(q), y = normal.getY(p) + normal.getY(q), z = normal.getZ(p) + normal.getZ(q), l = Math.hypot(x, y, z) || 1;
    normal.setXYZ(p, x / l, y / l, z / l); normal.setXYZ(q, x / l, y / l, z / l); }
  if (cap) for (const r of [0, list.length - 1]) for (let j = 0; j < M; j++) normal.setXYZ(r * M + j, 0, 0, -1); // the tips of the rounded ends
  return geometry;
}

// ---- procedural textures, made once per table ------------------------------------------------------------------------------------------
const random = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// Value noise with p x p cells that tiles over the unit square.
function tiling(p: number, rand: () => number) {
  const v = Float32Array.from({length: p * p}, rand), at = (i: number, j: number) => v[(j % p) * p + i % p];
  return (x: number, y: number) => { const fx = x * p, fy = y * p, i = Math.floor(fx), j = Math.floor(fy), sx = fx - i, sy = fy - j, ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
    return (at(i, j) * (1 - ux) + at(i + 1, j) * ux) * (1 - uy) + (at(i, j + 1) * (1 - ux) + at(i + 1, j + 1) * ux) * uy; };
}
function canvasTexture(image: ImageData, srgb: boolean) {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; c.getContext('2d')!.putImageData(image, 0, 0);
  const t = new T.CanvasTexture(c); t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
}
// Leather for the roll, one tile as many metres square as the section is long, since v runs once round the section and u repeats along
// the arc: pebble grain about 1.3 mm across, a soft colour mottle, and the two seams with a row of slanted stitches beside each at the
// rows where the section puts them. The roughness texture carries the section's crease shade in its red channel for the aoMap.
function leatherTextures(sec: Section, seams: {v: number; toward: number}[]) {
  const S = 1024, P = 512, size = sec.length, mm = size * 1000 / S, rand = random(5), G = Math.round(size / 0.0026), cell = P / G, jitter = Float32Array.from({length: 2 * G * G}, rand);
  // pebbles (F2 - F1 of a jittered grid, 0 on the creases between them) on a half-size tile that repeats 2 x 2
  const pebbles = new Float32Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const gx = x / cell, gy = y / cell, ci = Math.floor(gx), cj = Math.floor(gy); let f1 = 9, f2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const c = 2 * (((cj + dj + G) % G) * G + (ci + di + G) % G), ex = gx - ci - di - jitter[c], ey = gy - cj - dj - jitter[c + 1], d = ex * ex + ey * ey; if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
    pebbles[y * P + x] = 1 - Math.exp(-(Math.sqrt(f2) - Math.sqrt(f1)) / 0.15);
  }
  // the seams and the crease shade depend on the row only: a groove with the panels puffed beside it, and a row of stitches toward the crown
  const pitch = S / Math.round(size / 0.0052), rowHeight = new Float32Array(S), rowGroove = new Float32Array(S), rowStitch = new Float32Array(S).fill(9), rowShade = new Float32Array(S);
  for (let y = 0; y < S; y++) { rowShade[y] = sec.shade(1 - (y + 0.5) / S); for (const s of seams) {
    const d = (y - (1 - s.v) * S) * mm, e = (y - (1 - s.v - s.toward * 0.0032 / size) * S) * mm, g = Math.exp(-((d / 0.5) ** 2));
    rowGroove[y] = Math.max(rowGroove[y], g); rowHeight[y] += -0.5 * g + 0.12 * Math.exp(-(((Math.abs(d) - 1.6) / 0.9) ** 2)) - 0.04 * Math.exp(-((e / 0.7) ** 2)); if (Math.abs(e) < Math.abs(rowStitch[y])) rowStitch[y] = e;
  } }
  // a soft mottle of the colour, on a quarter-size grid read back bilinearly
  const R = S / 4, tone = new Float32Array(R * R), mottle = tiling(6, rand);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) tone[j * R + i] = mottle(i / R, j / R);
  const height = new Float32Array(S * S), colour = new ImageData(S, S), rough = new ImageData(S, S), normal = new ImageData(S, S), cd = colour.data, rd = rough.data, nd = normal.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / 4, fy = y / 4, i = fx | 0, j = fy | 0, sx = fx - i, sy = fy - j, a = j * R + i, b = j * R + (i + 1) % R, c = ((j + 1) % R) * R + i, d = ((j + 1) % R) * R + (i + 1) % R;
    const wa = (1 - sx) * (1 - sy), wb = sx * (1 - sy), wc = (1 - sx) * sy, wd = sx * sy, pebble = pebbles[(y % P) * P + x % P];
    let h = 0.022 * pebble + rowHeight[y], thread = 0; // millimetres; the grain is kept shallow so it does not streak where the roll is seen edge-on
    const e = rowStitch[y];
    if (e > -0.4 && e < 0.4) { const phase = ((x + 0.7 * e / mm) % pitch + pitch) % pitch / pitch; if (phase < 0.72) { thread = Math.sqrt((1 - (e / 0.4) ** 2) * Math.sin(Math.PI * phase / 0.72)); h += 0.18 * thread; } }
    height[y * S + x] = h;
    const groove = rowGroove[y], p = 4 * (y * S + x), f = (0.86 + 0.14 * pebble) * (1 - 0.3 * groove) * (0.94 + 0.12 * (tone[a] * wa + tone[b] * wb + tone[c] * wc + tone[d] * wd)), w = 0.85 * thread;
    cd[p] = 52 * f * (1 - w) + 80 * w; cd[p + 1] = 21 * f * (1 - w) + 50 * w; cd[p + 2] = 15 * f * (1 - w) + 35 * w; cd[p + 3] = 255;
    rd[p] = 255 * rowShade[y]; rd[p + 1] = rd[p + 2] = 255 * ((0.4 + 0.08 * (1 - pebble) + 0.08 * groove) * (1 - thread) + 0.75 * thread); rd[p + 3] = 255;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (height[y * S + (x + 1) % S] - height[y * S + (x + S - 1) % S]) / (2 * mm), dy = (height[((y + 1) % S) * S + x] - height[((y + S - 1) % S) * S + x]) / (2 * mm), l = Math.sqrt(dx * dx + dy * dy + 1), p = 4 * (y * S + x);
    nd[p] = 255 * (0.5 - 0.5 * dx / l); nd[p + 1] = 255 * (0.5 + 0.5 * dy / l); nd[p + 2] = 255 * (0.5 + 0.5 / l); nd[p + 3] = 255; // rows run against v
  }
  const roughness = canvasTexture(rough, false), normalMap = canvasTexture(normal, false); normalMap.anisotropy = 1; // seen edge-on the grain fades instead of streaking
  return {map: canvasTexture(colour, true), normalMap, roughnessMap: roughness, aoMap: roughness};
}
// Dark walnut for the apron, 0.6 m along the arc per tile and once round the section: fine grain lines along the arc that waver
// slowly, long streaks and a soft figure.
function walnutTexture() {
  const W = 512, H = 128, rand = random(9), warp = tiling(5, rand), figure = tiling(9, rand), streak = tiling(64, rand), image = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, line = (1 - Math.sin(2 * Math.PI * (v * 38 + 0.7 * warp(u, v)))) / 2, dark = line * line * line * line;
    const f = (0.92 - 0.3 * dark) * (0.86 + 0.24 * figure(u, v)) * (0.93 + 0.12 * streak(u, v * 4 % 1)), p = 4 * (y * W + x);
    image.data[p] = 48 * f; image.data[p + 1] = 26 * f; image.data[p + 2] = 14 * f; image.data[p + 3] = 255;
  }
  return canvasTexture(image, true);
}
// The section's shade alone, as a linear map: the aoMap of the apron, and the map of the brass bead where it tucks under the roll.
function shadeTexture(sec: Section) {
  const H = 64, image = new ImageData(4, H);
  for (let y = 0; y < H; y++) { const s = 255 * sec.shade(1 - (y + 0.5) / H); for (let x = 0; x < 4; x++) image.data.set([s, s, s, 255], 4 * (y * 4 + x)); }
  return canvasTexture(image, false);
}
// What the rail reflects: a dark warm room painted from the salon's layout as seen from the table. The lamp over the table, light slots on
// the back wall and the pillars, downlights in a dark ceiling, a dark carpet. Equirectangular, as three.js reads it: column =
// atan2(z, x) / 2pi + 1/2 (the dealer's side, -z, at a quarter of the width), row 0 straight up.
function roomReflection() {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, h); for (const [at, color] of [[0, '#241910'], [0.3, '#1d140d'], [0.45, '#33231a'], [0.5, '#2a1c12'], [0.56, '#140d09'], [1, '#060403']] as [number, string][]) sky.addColorStop(at, color);
  g.fillStyle = sky; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
  // a soft light at azimuth `az` (degrees of atan2(z, x)) and elevation `el`, `rx` degrees of azimuth wide and `ry` degrees tall
  const glow = (az: number, el: number, rx: number, ry: number, [r, gr, b]: number[], alpha: number) => {
    for (const shift of [-w, 0, w]) { g.save(); g.translate((az / 360 + 0.5) * w + shift, (0.5 - el / 180) * h); g.scale(rx / 360 * w, ry / 180 * h);
      const fill = g.createRadialGradient(0, 0, 0, 0, 0, 1); fill.addColorStop(0, `rgba(${r},${gr},${b},${alpha})`); fill.addColorStop(0.45, `rgba(${r},${gr},${b},${alpha * 0.8})`); fill.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = fill; g.fillRect(-1, -1, 2, 2); g.restore(); }
  };
  const toward = (x: number, y: number, z: number) => [Math.atan2(z - 0.3, x) * 180 / Math.PI, Math.atan2(y, Math.hypot(x, z - 0.3)) * 180 / Math.PI]; // seen from the middle of the felt
  glow(-90, 50, 130, 44, [255, 170, 100], 0.2); glow(-90, 62, 36, 12, [255, 226, 184], 1); glow(-90, 63, 18, 6, [255, 240, 215], 1); // the lamp over the table
  for (const x of [-7.2, -4.4, -1.9, 1.9, 4.4, 7.2]) { const [az] = toward(x, 0, -5.5); glow(az, 8, 2.4, 14, [255, 180, 100], 0.85); }
  for (const [x, z] of [[-3.1, -3.5], [3.1, -3.5], [-6.3, -1.4], [6.3, -1.4], [-6.3, 2.2], [6.3, 2.2]]) { const [az] = toward(x, 0, z); glow(az, 4, 1.6, 12, [255, 170, 90], 0.7); }
  for (let x = -8; x <= 8; x += 2) for (let z = -5; z <= 3; z += 2) { const [az, el] = toward(x, 3.15, z); glow(az, el, 2.6 / Math.max(0.15, Math.cos(el * Math.PI / 180)), 2.6, [255, 236, 200], 0.9); }
  for (const [x, y, z] of [[-2.3, 1.9, -2.9], [2.3, 1.9, -2.9], [-4.9, 1.7, -2.2], [4.9, 1.7, -2.2], [0, 2.3, -4.4]]) { const [az, el] = toward(x, y, z); glow(az, el, 3.5, 3.5, [255, 200, 130], 1); }
  { const [az, el] = toward(-5.9, 0.6, -5.4); glow(az, el, 14, 7, [220, 120, 50], 0.35); } // the bar
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.mapping = T.EquirectangularReflectionMapping; return t;
}

export type FeltPrint = {spots: Spot[]; logo: string; felt: string; scale: number};
export function createTable(lit: <M extends T.Material>(material: M) => M = m => m) {
  const canvas = document.createElement('canvas'); canvas.width = PRINT.pxW; canvas.height = PRINT.pxH;
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 16;
  const group = new T.Group(), k = PRINT.pxW / PRINT.width, X = (x: number) => (x + PRINT.width / 2) * k, Y = (s: number) => (s + PRINT.back) * k;
  // Materials and textures live as long as the table; build() only replaces geometry.
  const room = roomReflection();
  const felt = lit(new T.MeshBasicMaterial({map: texture, side: T.DoubleSide}));
  const leather = lit(new T.MeshStandardMaterial({...leatherTextures(ROLL, ROLL.seams), normalScale: new T.Vector2(0.75, 0.75), roughness: 1, metalness: 0, envMap: room, envMapIntensity: 3}));
  const bead = lit(new T.MeshStandardMaterial({map: shadeTexture(BEAD), color: 0x9c7a45, roughness: 0.36, metalness: 1, envMap: room, envMapIntensity: 1.1}));
  const apron = lit(new T.MeshPhysicalMaterial({map: walnutTexture(), aoMap: shadeTexture(APRON), roughness: 0.5, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, envMap: room, envMapIntensity: 1.5}));
  // The dealer-side board, the leg and the foot keep their first materials: a strip of the board's top shows in the home view.
  const wood = lit(new T.MeshStandardMaterial({color: 0x2a170d, roughness: 0.4, metalness: 0.1, side: T.DoubleSide})), brass = lit(new T.MeshStandardMaterial({color: 0xb08a45, roughness: 0.3, metalness: 0.9}));

  function draw(print: FeltPrint) {
    const g = canvas.getContext('2d')!, [light, dark] = FELTS[print.felt] ?? FELTS.green;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = dark; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH);
    const pool = g.createRadialGradient(X(0), Y(0.3), 40, X(0), Y(0.3), 1.25 * k); pool.addColorStop(0, light); pool.addColorStop(1, dark); g.fillStyle = pool; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH);
    let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.globalAlpha = 0.05; for (let i = 0; i < 70000; i++) { g.fillStyle = random() > 0.5 ? '#fff' : '#000'; g.fillRect(random() * PRINT.pxW, random() * PRINT.pxH, 2, 2); } g.globalAlpha = 1;
    // dealer-side trim: the film's body ends exactly at s = 0
    g.fillStyle = '#17110c'; g.fillRect(0, 0, PRINT.pxW, Y(0.016)); g.fillStyle = GOLD; g.globalAlpha = 0.55; g.fillRect(0, Y(0.016), PRINT.pxW, 3); g.globalAlpha = 1;
    // the rail's soft shadow on the felt along the arc: a dark band just outside the felt edge, blurred inward and clipped to the felt
    g.save(); g.beginPath(); g.ellipse(X(0), Y(0), TABLE.a * k, TABLE.b * k, 0, 0, 2 * Math.PI); g.clip();
    for (const [width, blur, alpha] of [[0.04, 0.016, 0.55], [0.01, 0.0035, 0.65]]) { g.filter = `blur(${Math.round(blur * k)}px)`; g.strokeStyle = `rgba(3,2,1,${alpha})`; g.lineWidth = 2 * width * k;
      g.beginPath(); g.ellipse(X(0), Y(0), (TABLE.a + width) * k, (TABLE.b + width) * k, 0, 0, 2 * Math.PI); g.stroke(); }
    g.restore();
    const seats = print.spots.filter(p => /^P\d\.C1$/.test(p.id)), row = seats.length ? seats.reduce((t, p) => t + p.s, 0) / seats.length : 0.35, span = Math.max(0.3, ...seats.map(p => Math.abs(p.x))) * 1.5;
    g.strokeStyle = GOLD; g.lineWidth = 3; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(X(0), Y(0), span * k * 1.015, row * 0.83 * k, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); g.globalAlpha = 1;
    // text along an arc that opens toward the dealer, upright for the players
    const text = 'BLACKJACK PAYS 3 TO 2', size = Math.round(0.024 * k), rx = span * 0.95, ry = row * 0.7;
    g.save(); g.font = `600 ${size}px Georgia, 'Times New Roman', serif`; g.fillStyle = GOLD; g.globalAlpha = 0.8; g.textAlign = 'center'; g.textBaseline = 'middle';
    const widths = [...text].map(ch => g.measureText(ch).width + size * 0.12); let run = -widths.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < text.length; i++) { const phi = (run + widths[i] / 2) / ((rx + ry) / 2 * k); run += widths[i]; g.save(); g.translate(X(rx * Math.sin(phi)), Y(ry * Math.cos(phi))); g.rotate(-phi); g.fillText(text[i], 0, 0); g.restore(); }
    g.restore();
    const logo = print.logo.toUpperCase(), logoY = Y(row * 0.44);
    g.save(); g.fillStyle = GOLD; g.globalAlpha = 0.9; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(0.034 * k)}px Georgia, 'Times New Roman', serif`; g.fillText(logo, X(0), logoY);
    const half = g.measureText(logo).width / 2; g.lineWidth = 2; g.strokeStyle = GOLD; g.globalAlpha = 0.6; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(X(0) + d * (half + 24), logoY); g.lineTo(X(0) + d * (half + 110), logoY); g.stroke(); }
    g.restore();
    // card places from the placement plan, at the plan's own card width; a bet circle in front of each seat's first card
    const cardW = 0.063 / print.scale * k, cardH = 0.07 / print.scale * k, betOffset = 0.068 * k, betRadius = 0.027 * k;
    for (const p of print.spots) { const first = p.id.endsWith('C1'); g.save(); g.translate(X(p.x), Y(p.s)); g.strokeStyle = GOLD; g.globalAlpha = first ? 0.6 : 0.25; g.lineWidth = 3;
      g.beginPath(); g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8); g.stroke();
      if (first && p.id[0] === 'P') { g.globalAlpha = 0.5; g.beginPath(); g.arc(0, betOffset, betRadius, 0, 7); g.stroke(); g.font = `600 ${Math.round(0.02 * k)}px Georgia, serif`; g.fillStyle = GOLD; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.id[1], 0, betOffset); }
      g.restore(); }
    texture.needsUpdate = true;
  }

  // `notch`: a rectangle cut into the felt from the dealer-side edge, for something sunk into the table there (x across,
  // s1 = how far it reaches toward the players; dealer metres). A notch, not a hole: a hole this close to the edge is
  // triangulated shut by ShapeGeometry.
  function build(edgeZ: number, scale: number, notch?: {x0: number; x1: number; s1: number}) {
    for (const child of [...group.children]) { group.remove(child); (child as T.Mesh).geometry?.dispose(); }
    group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
    const N = 96, {a, b, rail} = TABLE, uvOf = (x: number, s: number) => [(x + PRINT.width / 2) / PRINT.width, 1 - (s + PRINT.back) / PRINT.depth];
    const position = [0, 0, b * 0.4], uv = [...uvOf(0, b * 0.4)], index: number[] = [];
    for (let i = 0; i <= N; i++) { const t = Math.PI * i / N, x = a * Math.cos(t), s = b * Math.sin(t); position.push(x, 0, s); uv.push(...uvOf(x, s)); if (i) index.push(0, i, i + 1); }
    index.push(0, N + 1, 1); // the dealer-side triangle between the two ends of the arc
    let feltGeometry = new T.BufferGeometry(); feltGeometry.setAttribute('position', new T.Float32BufferAttribute(position, 3)); feltGeometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); feltGeometry.setIndex(index);
    if (notch) { // the same outline with the notch, triangulated as one polygon
      const outline = [...Array.from({length: N + 1}, (_, i) => new T.Vector2(a * Math.cos(Math.PI * i / N), b * Math.sin(Math.PI * i / N))), new T.Vector2(notch.x0, 0), new T.Vector2(notch.x0, notch.s1), new T.Vector2(notch.x1, notch.s1), new T.Vector2(notch.x1, 0)];
      feltGeometry.dispose(); feltGeometry = new T.ShapeGeometry(new T.Shape(outline)).rotateX(Math.PI / 2); const p = feltGeometry.getAttribute('position'), cut: number[] = [];
      for (let i = 0; i < p.count; i++) cut.push(...uvOf(p.getX(i), p.getZ(i))); feltGeometry.setAttribute('uv', new T.Float32BufferAttribute(cut, 2)); }
    group.add(new T.Mesh(feltGeometry, felt));
    // padded rail round the players' arc with rounded ends past the dealer's edge, the brass bead along the felt, then the apron
    group.add(new T.Mesh(sweep(ROLL, 128, ROLL.length, {length: 0.036, core: CORE, steps: 9}), leather));
    group.add(new T.Mesh(sweep(BEAD, 128, 1, {length: 0.004, core: [0.0035, 0], steps: 3}), bead));
    group.add(new T.Mesh(sweep(APRON, 96, 0.6, null), apron));
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); group.add(m); };
    add(new T.BoxGeometry(2 * (a + rail), 0.16, 0.02), wood, 0, -0.082, -0.011);
    add(new T.CylinderGeometry(0.16, 0.24, 0.78, 32), wood, 0, -0.55, b * 0.45); add(new T.CylinderGeometry(0.42, 0.46, 0.05, 48), brass, 0, -0.93, b * 0.45);
  }
  return {group, draw, build};
}
