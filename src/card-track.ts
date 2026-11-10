// Pure logic for following the coloured tracking card (yellow = back, blue = face) through a clip
// and for placing a rendered card on it. No file, media, sharp or ffmpeg access: frames come in
// as rgb24 buffers and everything goes out as plain data, so the same rules can be tested offline.
export type Pt = {x: number; y: number};
export type Side = 'BACK' | 'EDGE' | 'FRONT' | 'NONE';
export const OTHER = 0, YELLOW = 1, BLUE = 2, TABLE = 3, SKIN = 4, DARK = 5, TINT = 6, SHADE = 7;

// Blue, dark and table are the rules of tools/build-anchor.ts; skin is that rule plus a blue floor.
// Yellow was measured on pamela-p4-c1-plan-deal-02: lit back 224-240/192-224/0-16, tilted back
// down to 112/144/0-16. Table green has r < 40, hand skin has b > 0.4*r and the tan frame of the
// shoe window (128-192/96-144/32-80) has g < 0.8*r and b > 0.2*r, so it is neither card nor hand.
// Shade is the yellow back in the shadow of the fingers (160-208/80-160/0: orange, still no blue).
// It is kept apart from yellow: the same shadow is the only line between the dealt card and the
// seated one behind it, so the tracker must not see through it, while a renderer must cover it.
export const is = {
  blue: (r: number, g: number, b: number) => b > 90 && b > 1.5 * r && b > 1.15 * g,
  yellow: (r: number, g: number, b: number) => r > 95 && g > 95 && g > 0.82 * r && r > 0.6 * g && b < 0.45 * Math.min(r, g),
  shade: (r: number, g: number, b: number) => r > 95 && g > 0.45 * r && g <= 0.82 * r && b < 0.12 * r,
  table: (r: number, g: number, b: number) => g > r + 35 && g > b + 35,
  skin: (r: number, g: number, b: number) => r > 120 && r > g + 15 && g >= b - 25 && r > b + 25 && g > 0.55 * r && b > 0.36 * r,
  dark: (r: number, g: number, b: number) => r < 75 && g < 75 && b < 75,
};
/** One class per pixel. Yellow is tested first (a lit card also passes the skin rule). TINT is table whose red is lifted: yellow blur or the edge-on card over the table. SHADE is the yellow back in finger shadow. */
export function classify(rgb: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) { const r = rgb[j], g = rgb[j + 1], b = rgb[j + 2];
    out[i] = is.yellow(r, g, b) ? YELLOW : is.blue(r, g, b) ? BLUE : is.shade(r, g, b) ? SHADE : is.table(r, g, b) ? (r > 0.3 * g ? TINT : TABLE) : is.skin(r, g, b) ? SKIN : is.dark(r, g, b) ? DARK : OTHER; }
  return out;
}
export const maskOf = (cls: Uint8Array, kind: number): Uint8Array => { const m = new Uint8Array(cls.length); for (let i = 0; i < cls.length; i++) if (cls[i] === kind) m[i] = 1; return m; };

// ---- masks ----
function slide(src: Uint8Array, w: number, h: number, r: number, grow: boolean, vertical: boolean): Uint8Array {
  const out = new Uint8Array(src.length), len = vertical ? h : w, lines = vertical ? w : h, step = vertical ? w : 1, need = grow ? 1 : 2 * r + 1;
  for (let l = 0; l < lines; l++) { const base = vertical ? l : l * w; let sum = 0;
    for (let k = 0; k < Math.min(r, len); k++) sum += src[base + k * step];
    for (let p = 0; p < len; p++) { if (p + r < len) sum += src[base + (p + r) * step]; if (p - r - 1 >= 0) sum -= src[base + (p - r - 1) * step]; if (sum >= need) out[base + p * step] = 1; } }
  return out;
}
/** Square dilation (grow) or erosion of a 0/1 mask; pixels outside the image count as empty. */
export const morph = (mask: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array => r <= 0 ? Uint8Array.from(mask) : slide(slide(mask, w, h, r, grow, false), w, h, r, grow, true);

/** Round dilation or erosion for small masks. Unlike the square one it leaves no flat spots on slanted edges; corners get the radius. */
export function discMorph(mask: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(mask.length), offsets: number[][] = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) offsets.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let hit = !grow;
    for (const [dx, dy] of offsets) { const xx = x + dx, yy = y + dy, v = xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] === 1; if (grow ? v : !v) { hit = grow; break; } }
    if (hit) out[y * w + x] = 1; }
  return out;
}

export type Blob = {area: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; pixels: Int32Array};
/** 4-connected components of a 0/1 mask, largest first. */
export function blobs(mask: Uint8Array, w: number, h: number, minArea = 1): Blob[] {
  const seen = new Uint8Array(mask.length), out: Blob[] = [], stack: number[] = [];
  for (let s = 0; s < mask.length; s++) { if (!mask[s] || seen[s]) continue;
    const px: number[] = []; let x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0; stack.push(s); seen[s] = 1;
    while (stack.length) { const i = stack.pop()!, x = i % w, y = (i - x) / w; px.push(i); sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); } }
    if (px.length >= minArea) out.push({area: px.length, x0, y0, x1, y1, cx: sx / px.length, cy: sy / px.length, pixels: Int32Array.from(px)}); }
  return out.sort((a, b) => b.area - a.area);
}
/** Pixels that carry the colour in at least `share` of the frames: the seated card in the shoe window. */
export function persistent(counts: Uint16Array, frames: number, share = 0.6): Uint8Array {
  const m = new Uint8Array(counts.length), need = Math.max(1, Math.ceil(frames * share)); for (let i = 0; i < counts.length; i++) if (counts[i] >= need) m[i] = 1; return m;
}
/**
 * Splits a colour mask into rim-separated pieces. Seeds are what survives a strong erosion, then a
 * weaker one for shapes too thin for the strong one, and so on. All seeds grow back together inside
 * the mask, timed so each reaches its own outline at the same moment; a pixel belongs to the seed that
 * gets there first. Two cards that touch through a gap in the pale rim are thereby parted at the rim,
 * and every piece keeps its true outline and corners (no rounding from the erosion).
 */
export function pieces(mask: Uint8Array, w: number, h: number, radii = [7, 4, 2], minSeed = 30): Blob[] {
  const label = new Int32Array(mask.length), level: number[] = [0], waves: number[][] = radii.map(() => []), top = radii[0];
  radii.forEach((r, k) => { for (const seed of blobs(morph(mask, w, h, r, false), w, h, k === radii.length - 1 ? minSeed : 4 * minSeed)) {
    let fresh = true; for (let j = 0; j < seed.pixels.length && fresh; j++) if (label[seed.pixels[j]]) fresh = false; if (!fresh) continue;
    level.push(k); for (let j = 0; j < seed.pixels.length; j++) { label[seed.pixels[j]] = level.length - 1; waves[k].push(seed.pixels[j]); } } });
  // Growth is 8-connected like the square erosion: after `r` rounds a seed is back at its straight edges; corner tips need up to `r` more.
  let front: number[] = [];
  for (let round = 0; round <= 2 * top + 2; round++) { radii.forEach((r, k) => { if (top - r === round) front = front.concat(waves[k]); }); const next: number[] = [];
    for (const i of front) { const x = i % w, y = (i - x) / w, id = label[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (mask[j] && !label[j]) { label[j] = id; next.push(j); } } }
    front = next; }
  const lists: number[][] = level.map(() => []); for (let i = 0; i < label.length; i++) if (label[i]) lists[label[i]].push(i);
  return lists.slice(1).map(px => { let x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0; for (const i of px) { const x = i % w, y = (i - x) / w; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return {area: px.length, x0, y0, x1, y1, cx: sx / px.length, cy: sy / px.length, pixels: Int32Array.from(px)}; }).sort((a, b) => b.area - a.area);
}

// ---- geometry ----
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Pt, b: Pt): Pt => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
export const centre = (p: Pt[]): Pt => ({x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length});
/** Shoelace area; positive when the points run clockwise as seen on screen (y grows downward). */
export const signedArea = (p: Pt[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
export const clockwise = (p: Pt[]): Pt[] => signedArea(p) < 0 ? [...p].reverse() : p;
/** Point inside a convex polygon given clockwise on screen. */
export const inside = (poly: Pt[], x: number, y: number) => poly.every((a, i) => { const b = poly[(i + 1) % poly.length]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0; });
export const grown = (poly: Pt[], d: number): Pt[] => { const c = centre(poly); return poly.map(p => { const l = Math.hypot(p.x - c.x, p.y - c.y) || 1; return {x: p.x + (p.x - c.x) / l * d, y: p.y + (p.y - c.y) / l * d}; }); };
export const shifted = (poly: Pt[], by: Pt, t = 1): Pt[] => poly.map(p => ({x: p.x + by.x * t, y: p.y + by.y * t}));

export function hull(points: Pt[]): Pt[] { // clockwise on screen
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y); if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
/** Convex outline of a pixel list, using pixel edges so the outline's area equals the covered area. */
export function outline(pixels: ArrayLike<number>, w: number): Pt[] {
  const lo = new Map<number, number>(), hi = new Map<number, number>();
  for (let k = 0; k < pixels.length; k++) { const i = pixels[k], x = i % w, y = (i - x) / w; if (!lo.has(y) || x < lo.get(y)!) lo.set(y, x); if (!hi.has(y) || x > hi.get(y)!) hi.set(y, x); }
  const pts: Pt[] = []; for (const [y, x] of lo) { const X = hi.get(y)!; pts.push({x: x - 0.5, y: y - 0.5}, {x: x - 0.5, y: y + 0.5}, {x: X + 0.5, y: y - 0.5}, {x: X + 0.5, y: y + 0.5}); }
  return hull(pts);
}
/**
 * Smallest four-sided outline around a convex shape: the cheapest side is removed again and again by
 * extending its two neighbours until they meet. Rounded corners are short sides, so the card's real
 * corner comes back as the crossing of its two straight edges. `hidden` may tell how much of a side
 * spans a bite out of the shape (0..1): once only substantial sides are left, such a side is where a
 * finger lies over the card, not a card edge, and goes first as long as its neighbours meet close by.
 */
export function fitQuad(shape: Pt[], hidden?: (a: Pt, b: Pt) => number): Pt[] | null {
  const p = clockwise(shape).slice();
  const tri = (a: Pt, b: Pt, c: Pt) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  while (p.length > 8) { // drop vertices that carry almost no area (pixel stair steps)
    let best = -1, cost = 0.75; for (let i = 0; i < p.length; i++) { const c = tri(p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]); if (c < cost) { cost = c; best = i; } }
    if (best < 0) break; p.splice(best, 1); }
  const size = Math.abs(signedArea(p)); let coarse = false;
  while (p.length > 4) {
    let best = -1, cost = Infinity, at: Pt | null = null;
    for (let i = 0; i < p.length; i++) { const n = p.length, q = p[(i + n - 1) % n], a = p[i], b = p[(i + 1) % n], r = p[(i + 2) % n];
      const ux = a.x - q.x, uy = a.y - q.y, vx = b.x - r.x, vy = b.y - r.y, den = ux * vy - uy * vx; if (Math.abs(den) < 1e-9) continue;
      const t = ((b.x - a.x) * vy - (b.y - a.y) * vx) / den, s = ((b.x - a.x) * uy - (b.y - a.y) * ux) / den; if (t <= 0 || s <= 0) continue;
      const x = {x: a.x + ux * t, y: a.y + uy * t}; let c = tri(a, x, b);
      if (coarse && hidden && dist(x, a) + dist(x, b) <= 1.7 * dist(a, b) && hidden(a, b) >= 0.4) c *= 0.02;
      if (c < cost) { cost = c; best = i; at = x; } }
    if (best < 0 || !at) return null;
    if (!coarse && hidden && cost > 0.004 * size) { coarse = true; continue; } // corner rounding is gone: now look for sides cut by a finger
    p[best] = at; p.splice((best + 1) % p.length, 1); }
  return p.length === 4 ? p : null;
}
/**
 * Share of an outline side with no shape pixel just inside it: the side spans a bite, typically a
 * fingertip lying over the card's edge or corner. `has` tells whether a pixel belongs to the shape;
 * the outline must run clockwise on screen.
 */
export const unsupported = (has: (x: number, y: number) => boolean) => (a: Pt, b: Pt): number => {
  const l = dist(a, b); if (l < 6) return 0; const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l; let n = 0, bare = 0;
  for (let t = 0.1; t < 0.91; t += 0.08) { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; n++; if (!has(Math.round(x + nx * 1.5), Math.round(y + ny * 1.5)) && !has(Math.round(x + nx * 3.5), Math.round(y + ny * 3.5))) bare++; }
  return bare / n;
};
/** Thickness of a quad: its area divided by the mean length of the longer pair of opposite sides. */
export function thickness(q: Pt[]): number { const a = (dist(q[0], q[1]) + dist(q[2], q[3])) / 2, b = (dist(q[1], q[2]) + dist(q[3], q[0])) / 2; return Math.abs(signedArea(q)) / Math.max(a, b, 1e-6); }
/**
 * Texture order for a quad seen for the first time: clockwise on screen, corner 0 at the upper left,
 * side 0-1 the card's short side. A clearly oblong quad shows which sides are short; a card lying
 * foreshortened on the table does not, so there the more horizontal pair is taken as top and bottom.
 */
export function orderCorners(q: Pt[]): Pt[] {
  const p = clockwise(q), a = (dist(p[0], p[1]) + dist(p[2], p[3])) / 2, b = (dist(p[1], p[2]) + dist(p[3], p[0])) / 2;
  const slope = (i: number) => Math.abs(p[(i + 1) % 4].y - p[i].y) / (dist(p[i], p[(i + 1) % 4]) || 1);
  const even = Math.max(a, b) > 1.25 * Math.min(a, b) ? a < b : slope(0) + slope(2) < slope(1) + slope(3); // true: sides 0-1 and 2-3 are top and bottom
  const starts = even ? [0, 2] : [1, 3], score = (i: number) => p[i].x + p[i].y + p[(i + 1) % 4].x + p[(i + 1) % 4].y;
  const first = score(starts[0]) <= score(starts[1]) ? starts[0] : starts[1];
  return [0, 1, 2, 3].map(k => p[(first + k) % 4]);
}
/** Keeps corner identity between frames: the rotation of `q` that best matches `prev` once both are centred. */
export function alignCorners(prev: Pt[], q: Pt[]): Pt[] {
  const p = Math.sign(signedArea(q)) !== Math.sign(signedArea(prev)) ? [...q].reverse() : q, c0 = centre(prev), c1 = centre(p); let best = 0, cost = Infinity;
  for (let s = 0; s < 4; s++) { let c = 0; for (let k = 0; k < 4; k++) c += (p[(s + k) % 4].x - c1.x - prev[k].x + c0.x) ** 2 + (p[(s + k) % 4].y - c1.y - prev[k].y + c0.y) ** 2; if (c < cost) { cost = c; best = s; } }
  return [0, 1, 2, 3].map(k => p[(best + k) % 4]);
}
/** The two ends of a quad along its length: index pairs of its two shorter opposite sides. */
export const ends = (q: Pt[]): [[number, number], [number, number]] => dist(q[0], q[1]) + dist(q[2], q[3]) <= dist(q[1], q[2]) + dist(q[3], q[0]) ? [[0, 1], [3, 2]] : [[0, 3], [1, 2]];
/** Direction along a quad, from its first end to its second. */
export const lengthAxis = (q: Pt[]): Pt => { const [a, b] = ends(q), m0 = mid(q[a[0]], q[a[1]]), m1 = mid(q[b[0]], q[b[1]]); return {x: m1.x - m0.x, y: m1.y - m0.y}; };
/**
 * Carries corner identity across the edge-on moment. `before` is the last quad of the old side in
 * that side's texture order, `after` the first quad of the new side in any order. The card turned
 * over: each end keeps its two corners while the winding on screen reverses. The result is in the new
 * side's texture order - seen from the other side, left and right swap - so it is clockwise again.
 * `axis` is the latest known direction from the first end to the second (it turns during the flip).
 */
export function carryAcrossFlip(before: Pt[], after: Pt[], axis: Pt = lengthAxis(before)): Pt[] {
  const p = clockwise(after), [a0, b0] = ends(before), [a1, b1] = ends(p), dir = lengthAxis(p);
  const [near, far] = dir.x * axis.x + dir.y * axis.y >= 0 ? [a1, b1] : [b1, a1];
  for (const swap of [0, 1]) { const phys: Pt[] = []; // phys[i]: where the corner that was before[i] is now
    phys[a0[0]] = p[near[swap]]; phys[a0[1]] = p[near[1 - swap]]; phys[b0[0]] = p[far[swap]]; phys[b0[1]] = p[far[1 - swap]];
    if (signedArea(phys) < 0) return [phys[1], phys[0], phys[3], phys[2]]; }
  return p;
}
/** Main axis of a pixel list: end points, length along it and mean width across it. */
export function axisOf(pixels: ArrayLike<number>, w: number) {
  let sx = 0, sy = 0; const n = pixels.length; for (let k = 0; k < n; k++) { const x = pixels[k] % w; sx += x; sy += (pixels[k] - x) / w; }
  const cx = sx / n, cy = sy / n; let xx = 0, xy = 0, yy = 0;
  for (let k = 0; k < n; k++) { const x = pixels[k] % w - cx, y = (pixels[k] - pixels[k] % w) / w - cy; xx += x * x; xy += x * y; yy += y * y; }
  const angle = Math.atan2(2 * xy, xx - yy) / 2, dx = Math.cos(angle), dy = Math.sin(angle); let lo = 0, hi = 0;
  for (let k = 0; k < n; k++) { const t = (pixels[k] % w - cx) * dx + ((pixels[k] - pixels[k] % w) / w - cy) * dy; if (t < lo) lo = t; if (t > hi) hi = t; }
  return {a: {x: cx + dx * lo, y: cy + dy * lo}, b: {x: cx + dx * hi, y: cy + dy * hi}, length: hi - lo + 1, mean: n / (hi - lo + 1)};
}
export function homography(from: Pt[], to: Pt[]): number[] { // maps a point of `from` onto `to`
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) { const {x, y} = from[i], {x: u, y: v} = to[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) throw Error('Degenerate card quad.');
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; } }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}
export const project = (h: number[], x: number, y: number): Pt => { const w = h[6] * x + h[7] * y + 1; return {x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w}; };

// ---- one frame ----
export type Raw = {side: Side; corners: Pt[] | null; segment: [Pt, Pt] | null; area: number; fill: number; thickness: number; shoeShare: number; note: string};
/** What the earlier frames expect: where the card should be now. `null` instead of a hint means the very first frame. */
export type Hint = {region: Pt[] | null};
export const EDGE_THICKNESS = 9, MIN_AREA = 120;

/** Side from what one frame shows. A thin shape is edge-on whatever its colour. */
export function sideOf(yellow: number, blue: number, thick: number, minArea = MIN_AREA, thin = EDGE_THICKNESS): Side {
  if (Math.max(yellow, blue) < minArea) return 'NONE';
  if (thick < thin) return 'EDGE';
  return yellow >= blue ? 'BACK' : 'FRONT';
}
type Pick = {area: number; shoeShare: number; quad: Pt[] | null; fill: number; thick: number; note: string};
/**
 * Quad of one piece. A broad piece is first opened by a few pixels, which drops thin attachments
 * (a sliver of the seated card seen beside the dealt one, blur streaks) but no straight edge.
 */
export function measure(blob: Blob, w: number, shoe: Uint8Array | null = null, note = ''): Pick {
  const pad = 5, ww = blob.x1 - blob.x0 + 1 + 2 * pad, hh = blob.y1 - blob.y0 + 1 + 2 * pad, local = new Uint8Array(ww * hh); let inShoe = 0;
  for (let k = 0; k < blob.pixels.length; k++) { const i = blob.pixels[k], x = i % w; local[((i - x) / w - blob.y0 + pad) * ww + x - blob.x0 + pad] = 1; if (shoe) inShoe += shoe[i]; }
  const rough = blob.area >= 12 ? fitQuad(outline(blob.pixels, w)) : null, open = rough && thickness(rough) > 30 ? discMorph(discMorph(local, ww, hh, 4, false), ww, hh, 4, true) : local;
  const kept: number[] = []; for (let i = 0; i < open.length; i++) if (open[i]) kept.push(i);
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < ww && y < hh && open[y * ww + x] === 1;
  const fit = kept.length >= 12 ? fitQuad(outline(kept, ww), unsupported(has)) : null, quad = fit && fit.map(q => ({x: q.x + blob.x0 - pad, y: q.y + blob.y0 - pad}));
  return {area: blob.area, shoeShare: blob.area ? inShoe / blob.area : 0, quad, fill: quad ? kept.length / Math.abs(signedArea(quad)) : 0, thick: quad ? thickness(quad) : 0, note};
}
/**
 * The dealt card among the yellow shapes. The seated card in the shoe window is yellow too and the
 * dealt card comes out of that very window, so no box is excluded. The mask is split into
 * rim-separated pieces; a piece counts when it continues where the card was expected, or when it
 * lies outside the persistent shoe pixels.
 */
function pickYellow(cls: Uint8Array, w: number, h: number, shoe: Uint8Array | null, hint: Hint | null): Pick | null {
  const region = hint?.region ? grown(hint.region, 8) : null; let best: Blob | null = null, bestScore = 0;
  for (const blob of pieces(maskOf(cls, YELLOW), w, h)) {
    let inShoe = 0, cont = 0; for (let k = 0; k < blob.pixels.length; k++) { const i = blob.pixels[k]; if (shoe) inShoe += shoe[i]; if (region && inside(region, i % w, Math.floor(i / w))) cont++; }
    const free = inShoe < 0.5 * blob.area, score = hint === null ? blob.area : cont >= 0.25 * blob.area ? cont + (free ? blob.area : 0) : free ? blob.area * 0.5 : 0;
    if (score > bestScore) { bestScore = score; best = blob; } }
  return best ? measure(best, w, shoe, '') : null;
}
function pickBlue(cls: Uint8Array, w: number, h: number, hint: Hint | null): Pick | null {
  const region = hint?.region ? grown(hint.region, 30) : null; let best: Blob | null = null, bestScore = 0;
  for (const blob of pieces(maskOf(cls, BLUE), w, h, [2, 1], 12)) { const score = blob.area * (region && inside(region, blob.cx, blob.cy) ? 4 : 1); if (score > bestScore) { bestScore = score; best = blob; } }
  return best ? measure(best, w, null, '') : null;
}
/**
 * Edge-on card: for a frame or three the card is a line with hardly any colour. Around the expected
 * place everything that is not clean table is taken, and what an opening removes (anything thinner
 * than a finger) is the card. Returns the longest such sliver.
 */
export function thinSliver(cls: Uint8Array, w: number, h: number, around: Pt[], reach = 70, width = 4): {segment: [Pt, Pt]; area: number; mean: number} | null {
  const x0 = Math.max(0, Math.floor(Math.min(...around.map(p => p.x)) - reach)), x1 = Math.min(w - 1, Math.ceil(Math.max(...around.map(p => p.x)) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(...around.map(p => p.y)) - reach)), y1 = Math.min(h - 1, Math.ceil(Math.max(...around.map(p => p.y)) + reach)), ww = x1 - x0 + 1, hh = y1 - y0 + 1;
  if (ww < 8 || hh < 8) return null;
  const solid = new Uint8Array(ww * hh); for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) if (cls[(y + y0) * w + x + x0] !== TABLE) solid[y * ww + x] = 1;
  const opened = morph(morph(solid, ww, hh, width, false), ww, hh, width + 1, true), thin = new Uint8Array(ww * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) { const i = y * ww + x, c = cls[(y + y0) * w + x + x0]; if (solid[i] && (!opened[i] || c === YELLOW || c === BLUE || c === TINT)) thin[i] = 1; } // what is left of the card's colour counts too
  let best: {segment: [Pt, Pt]; area: number; mean: number} | null = null, bestLength = 28;
  for (const blob of blobs(thin, ww, hh, 24)) { const ax = axisOf(blob.pixels, ww); if (ax.length < bestLength || ax.length < 4 * ax.mean) continue;
    bestLength = ax.length; best = {segment: [{x: ax.a.x + x0, y: ax.a.y + y0}, {x: ax.b.x + x0, y: ax.b.y + y0}], area: blob.area, mean: ax.mean}; }
  return best;
}
/** Finds the card in one classified frame. On the very first frame (`hint === null`) a seated card is the one about to be dealt, unless a blue card already lies on the table. */
export function detect(cls: Uint8Array, w: number, h: number, shoe: Uint8Array | null, hint: Hint | null): Raw {
  const blue = pickBlue(cls, w, h, hint), yellow = hint === null && blue && blue.area >= MIN_AREA ? null : pickYellow(cls, w, h, shoe, hint);
  const pick = (yellow?.area ?? 0) >= (blue?.area ?? 0) ? yellow : blue, side = pick?.quad ? sideOf(yellow?.area ?? 0, blue?.area ?? 0, pick.thick) : 'NONE';
  if (pick?.quad && (side === 'BACK' || side === 'FRONT')) return {side, corners: pick.quad, segment: null, area: pick.area, fill: pick.fill, thickness: pick.thick, shoeShare: pick.shoeShare, note: pick.note};
  const sliver = hint?.region ? thinSliver(cls, w, h, hint.region) : null;
  if (pick?.quad && side === 'EDGE') { const [a, b] = ends(pick.quad), own: [Pt, Pt] = [mid(pick.quad[a[0]], pick.quad[a[1]]), mid(pick.quad[b[0]], pick.quad[b[1]])];
    return sliver && dist(...sliver.segment) > dist(...own) ? {side, corners: null, segment: sliver.segment, area: sliver.area, fill: 0, thickness: sliver.mean, shoeShare: 0, note: 'thin shape, colour fading'} : {side, corners: null, segment: own, area: pick.area, fill: pick.fill, thickness: pick.thick, shoeShare: pick.shoeShare, note: 'thin coloured shape'}; }
  if (sliver) return {side: 'EDGE', corners: null, segment: sliver.segment, area: sliver.area, fill: 0, thickness: sliver.mean, shoeShare: 0, note: 'thin shape without card colour'};
  return {side: 'NONE', corners: null, segment: null, area: pick?.area ?? 0, fill: 0, thickness: 0, shoeShare: 0, note: hint?.region ? 'nothing at the expected place' : 'no card'};
}

// ---- following through a clip ----
const ribbon = (s: [Pt, Pt], half: number): Pt[] => { const l = dist(s[0], s[1]) || 1, nx = -(s[1].y - s[0].y) / l * half, ny = (s[1].x - s[0].x) / l * half; return clockwise([{x: s[0].x + nx, y: s[0].y + ny}, {x: s[1].x + nx, y: s[1].y + ny}, {x: s[1].x - nx, y: s[1].y - ny}, {x: s[0].x - nx, y: s[0].y - ny}]); };
/**
 * Frame-by-frame follower. Each result becomes the expectation for the next frame: the shape moved
 * on by its last step. After a few empty frames the expectation is dropped, and from then on only
 * shapes outside the shoe window can start a new track.
 */
export function follower(w: number, h: number, shoe: Uint8Array | null) {
  let hint: Hint | null = null, first = true, last: Pt | null = null, step: Pt = {x: 0, y: 0}, missed = 0;
  return (cls: Uint8Array): Raw => {
    const raw = detect(cls, w, h, shoe, first ? null : hint ?? {region: null}); first = false;
    const shape = raw.corners ? clockwise(raw.corners) : raw.segment ? ribbon(raw.segment, 8) : null;
    if (shape) { const c = centre(shape); step = last && missed === 0 ? {x: c.x - last.x, y: c.y - last.y} : {x: 0, y: 0}; last = c; missed = 0; hint = {region: shifted(shape, step)}; }
    else { missed++; if (last) last = {x: last.x + step.x, y: last.y + step.y}; hint = {region: hint?.region && missed <= 4 ? shifted(hint.region, step) : null}; }
    return raw;
  };
}

// ---- whole track ----
export type Frame = {frame: number; side: Side; quad: Pt[] | null; edge: [Pt, Pt] | null; area: number; confidence: number; shoeShare?: number; note?: string};
export type Track = {frames: Frame[]; ranges: Record<Side, [number, number][]>; edgeWindow: [number, number] | null; leavesShoe: number | null; restFrom: number | null; restQuad: Pt[] | null;
  flips: {from: number; to: number; quarterTurns: number}[];
  restJitter: {frames: number; clearFrames: number; rawMean: number; rawMax: number; clearMean: number; clearMax: number} | null; lowConfidence: number[]};

const SG: Record<number, number[]> = {0: [1], 1: [0, 1, 0], 2: [-3, 12, 17, 12, -3].map(v => v / 35), 3: [-2, 3, 6, 7, 6, 3, -2].map(v => v / 21)};
/**
 * Removes jitter without lag: a centred quadratic (Savitzky-Golay) fit over up to seven frames. It
 * reproduces constant speed and constant acceleration exactly, so a moving card is not held back;
 * near the ends of a run the window shrinks instead of leaning to one side.
 */
export function smooth(values: (number | null)[], radius = 3): (number | null)[] {
  return values.map((v, i) => { if (v === null) return null; let r = 0; while (r < radius && i - r - 1 >= 0 && i + r + 1 < values.length && values[i - r - 1] !== null && values[i + r + 1] !== null) r++;
    return SG[r].reduce((s, k, j) => s + k * (values[i - r + j] as number), 0); });
}
/** Eased share of the displacement at a frame: 0 up to `start`, 1 from `end`, smooth in between. */
export function offsetRamp(frame: number, start: number, end: number): number {
  if (frame <= start) return 0; if (frame >= end) return 1; const t = (frame - start) / (end - start); return t * t * (3 - 2 * t);
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (p: Pt): Pt => ({x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10});

/**
 * Turns per-frame findings into a track: corner identity through the clip, the far end held to card
 * length while the card leaves the shoe, one locked quad once the card lies still, jitter removed,
 * short gaps at the flip bridged, and a confidence per frame. Quads are in texture order of the
 * visible side: top left, top right, bottom right, bottom left of that side's artwork, clockwise on
 * screen.
 *
 * Orientation is anchored where it is known: the first side from its first frame onward (the card as
 * it sits in the shoe), every later side from its last frame backward (the card as it comes to lie).
 * The two meet at the edge-on moment, where the film is free to cheat and a rendered card can re-seat
 * unseen. `flips` records by how many quarter turns the anchored orientation differs there from a
 * rigid card that simply turned over.
 */
export function buildTrack(raws: Raw[]): Track {
  const n = raws.length, quads: (Pt[] | null)[] = raws.map(() => null), segs: ([Pt, Pt] | null)[] = raws.map(() => null), sides: Side[] = raws.map(r => r.side), notes: string[] = raws.map(r => r.note);
  const found = raws.map((r, i) => i).filter(i => raws[i].corners && (raws[i].side === 'BACK' || raws[i].side === 'FRONT')), spans: number[][] = [];
  for (const i of found) { const open = spans[spans.length - 1]; if (open && raws[open[open.length - 1]].side === raws[i].side) open.push(i); else spans.push([i]); }
  spans.forEach((span, k) => { const order = k === 0 ? span : [...span].reverse(); order.forEach((i, j) => { quads[i] = j === 0 ? orderCorners(raws[i].corners!) : alignCorners(quads[order[j - 1]]!, raws[i].corners!); }); });
  let axis: Pt | null = null; const flips: Track['flips'] = [];
  for (let i = 0; i < n; i++) { const q = quads[i], s = raws[i].segment;
    if (q) { const prev = spans.findIndex(span => span[0] === i) - 1;
      if (prev >= 0) { const before = quads[spans[prev][spans[prev].length - 1]]!, rigid = carryAcrossFlip(before, raws[i].corners!, axis ?? undefined); let best = 0, cost = Infinity;
        for (let k = 0; k < 4; k++) { const c = q.reduce((sum, pt, j) => sum + dist(pt, rigid[(j + k) % 4]), 0); if (c < cost) { cost = c; best = k; } }
        flips.push({from: spans[prev][spans[prev].length - 1], to: i, quarterTurns: best}); }
      axis = lengthAxis(q); }
    else if (s && !raws[i].corners) { segs[i] = axis && (s[1].x - s[0].x) * axis.x + (s[1].y - s[0].y) * axis.y < 0 ? [s[1], s[0]] : s; axis = {x: segs[i]![1].x - segs[i]![0].x, y: segs[i]![1].y - segs[i]![0].y}; } }
  // Leaving the shoe: where the film shows no rim, the far end of the dealt card cannot be told from the seated card behind it,
  // and the fit runs long. A card does not stretch, so each long side keeps the length it had while seated, in proportion to
  // the short side that leads the way out.
  const firstSpan = spans[0] ?? [], seated = firstSpan.filter(i => raws[i].shoeShare >= 0.9), long = (q: Pt[]) => (dist(q[1], q[2]) + dist(q[0], q[3])) / 2;
  if (seated.length >= 3) { const ratio = median(seated.map(i => long(quads[i]!) / (dist(quads[i]![0], quads[i]![1]) || 1))), home = centre(quads[seated[0]]!);
    for (const i of firstSpan) { const q = quads[i]!; if (raws[i].shoeShare <= 0.02 || raws[i].shoeShare >= 0.9) continue;
      const lead = dist(mid(q[0], q[1]), home) >= dist(mid(q[3], q[2]), home) ? [0, 1, 2, 3] : [3, 2, 1, 0], cap = 1.03 * ratio * dist(q[lead[0]], q[lead[1]]), fixed = q.map(pt => ({...pt})); let changed = false;
      for (const [a, b] of [[lead[0], lead[3]], [lead[1], lead[2]]]) { const l = dist(q[a], q[b]); if (l > cap) { fixed[b] = {x: q[a].x + (q[b].x - q[a].x) * cap / l, y: q[a].y + (q[b].y - q[a].y) * cap / l}; changed = true; } }
      if (changed) { quads[i] = fixed; notes[i] = 'far end shortened to card length while over the shoe window'; } } }
  // Bridge short gaps at the flip with a straight line between what was seen before and after.
  const endsOf = (i: number): [Pt, Pt] | null => { const q = quads[i]; if (q) { const [a, b] = ends(q); return [mid(q[a[0]], q[a[1]]), mid(q[b[0]], q[b[1]])]; } return segs[i]; };
  for (let i = 1; i < n - 1; i++) { if (endsOf(i) || !endsOf(i - 1)) continue; let j = i; while (j < n && !endsOf(j)) j++; if (j >= n || j - i > 6) { i = j; continue; }
    const a = endsOf(i - 1)!; let b = endsOf(j)!; if ((b[1].x - b[0].x) * (a[1].x - a[0].x) + (b[1].y - b[0].y) * (a[1].y - a[0].y) < 0) b = [b[1], b[0]];
    for (let k = i; k < j; k++) { const t = (k - i + 1) / (j - i + 1); segs[k] = [{x: a[0].x + (b[0].x - a[0].x) * t, y: a[0].y + (b[0].y - a[0].y) * t}, {x: a[1].x + (b[1].x - a[1].x) * t, y: a[1].y + (b[1].y - a[1].y) * t}]; sides[k] = 'EDGE'; notes[k] = 'interpolated between neighbours'; }
    i = j; }
  // The card lies still: from the end backwards, every found quad stays within the final one (a covered card only shrinks).
  let restFrom: number | null = null, restQuad: Pt[] | null = null, restJitter: Track['restJitter'] = null; const covered = new Set<number>();
  const tail: number[] = []; for (let i = n - 1; i >= 0 && tail.length < 5; i--) if (quads[i]) tail.push(i);
  if (tail.length >= 3) { const final = [0, 1, 2, 3].map(k => ({x: median(tail.map(i => quads[i]![k].x)), y: median(tail.map(i => quads[i]![k].y))})), fence = grown(clockwise(final), 5), side = sides[tail[0]];
    const whole = median(tail.map(i => raws[i].area)); // a card half under the hand may fit badly; that is cover, not motion
    let from = n; for (let i = n - 1; i >= 0; i--) { const q = quads[i]; if (q) { if (sides[i] !== side) break; if (!q.every(p => inside(fence, p.x, p.y))) { if (raws[i].area < 0.9 * whole) continue; break; } from = i; } else if (segs[i]) break; }
    const run = []; for (let i = from; i < n; i++) if (quads[i]) run.push(i);
    if (run.length >= 8) { const top = Math.max(...run.map(i => raws[i].area)), clear = run.filter(i => raws[i].area >= 0.985 * top);
      restFrom = from; restQuad = [0, 1, 2, 3].map(k => ({x: median(clear.map(i => quads[i]![k].x)), y: median(clear.map(i => quads[i]![k].y))}));
      const off = (list: number[]) => list.flatMap(i => quads[i]!.map((p, k) => dist(p, restQuad![k]))), all = off(run), cl = off(clear), mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
      restJitter = {frames: run.length, clearFrames: clear.length, rawMean: mean(all), rawMax: Math.max(...all), clearMean: mean(cl), clearMax: Math.max(...cl)};
      for (let i = from; i < n; i++) { if (!quads[i] || raws[i].area < 0.9 * top) { covered.add(i); sides[i] = side; notes[i] = 'covered by the hand; resting quad kept'; } quads[i] = restQuad; segs[i] = null; } } }
  const raw = quads.map(q => q && q.map(p => ({...p})));
  // Jitter removal per corner over each unbroken run on one side. Jitter only shows on a slow card, and a fast hand does not
  // move like a parabola, so the smoothing fades out between 3 and 9 px per frame.
  for (let i = 0; i < n;) { if (!quads[i]) { i++; continue; } let j = i; while (j + 1 < n && quads[j + 1] && sides[j + 1] === sides[i]) j++;
    const before = quads.slice(i, j + 1).map(q => q!.map(p => ({...p})));
    for (let k = 0; k < 4; k++) { const xs = smooth(before.map(q => q[k].x)), ys = smooth(before.map(q => q[k].y));
      for (let m = i; m <= j; m++) { const speed = dist(before[Math.min(j, m + 1) - i][k], before[Math.max(i, m - 1) - i][k]) / (Math.min(j, m + 1) - Math.max(i, m - 1) || 1), keep = Math.min(1, Math.max(0, 1 - (speed - 3) / 6)), p = before[m - i][k];
        quads[m] = quads[m]!.map((q, c) => c === k ? {x: p.x + (xs[m - i]! - p.x) * keep, y: p.y + (ys[m - i]! - p.y) * keep} : q); } }
    i = j + 1; }
  const frames: Frame[] = raws.map((r, i) => { const q = quads[i], s = segs[i]; let c = 0;
    if (q) { const moved = Math.max(...q.map((p, k) => dist(p, raw[i]![k]))); c = Math.min(1, Math.max(0, (r.fill - 0.55) / 0.33)) * Math.min(1, Math.max(0.2, 1 - (moved - 2) / 8)) * (r.shoeShare > 0.05 && r.shoeShare < 0.9 ? 0.7 : 1); if (covered.has(i)) c = 0.5; else if (restFrom !== null && i >= restFrom) c = Math.max(c, 0.9); }
    else if (s) c = notes[i].startsWith('interpolated') ? 0.3 : r.note.includes('without') ? 0.5 : 0.6;
    return {frame: i, side: q ? sides[i] : s ? 'EDGE' : 'NONE', quad: q ? q.map(round) : null, edge: !q && s ? [round(s[0]), round(s[1])] : null, area: r.area, confidence: Math.round(c * 100) / 100,
      ...(r.shoeShare > 0 ? {shoeShare: Math.round(r.shoeShare * 100) / 100} : {}), ...(notes[i] ? {note: notes[i]} : {})}; });
  const ranges: Record<Side, [number, number][]> = {BACK: [], EDGE: [], FRONT: [], NONE: []};
  for (const f of frames) { const list = ranges[f.side], open = list[list.length - 1]; if (open && open[1] === f.frame - 1) open[1] = f.frame; else list.push([f.frame, f.frame]); }
  const firstFront = frames.find(f => f.side === 'FRONT')?.frame ?? -1, lastBack = firstFront < 0 ? -1 : Math.max(-1, ...frames.filter(f => f.side === 'BACK' && f.frame < firstFront).map(f => f.frame));
  const inShoe = frames.findIndex(f => (f.shoeShare ?? 0) >= 0.5), left = inShoe < 0 ? -1 : frames.findIndex(f => f.frame > inShoe && f.side === 'BACK' && (f.shoeShare ?? 0) < 0.5);
  return {frames, ranges, flips, edgeWindow: lastBack >= 0 && firstFront > lastBack + 1 ? [lastBack + 1, firstFront - 1] : null, leavesShoe: left < 0 ? null : left, restFrom, restQuad: restQuad && restQuad.map(round), restJitter,
    lowConfidence: frames.filter(f => f.side !== 'NONE' && f.confidence < 0.6).map(f => f.frame)};
}
