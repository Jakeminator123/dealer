// The after-work of a delivered anchor still, ported from the Python that tonight's ordering ran (D:/dealer-scratch/tmp/paow/skript/:
// fyll-morkt.py, ta-bort-skugga.py, gron-till-niva.py, ton-till.py; kantkoll.py is edgeCheck in src/film-after.ts), so that the
// same picture gives the same pixels. Pure: pictures are 8-bit BGR as OpenCV reads them (see src/film-after.ts for why BGR).
//
// The recipe as it held for anchor 2.1 (D:/dealer-scratch/tmp/bestall/paow-ankare-2-1/, the agents' notes in the receipts):
//   1. fit into the bank's frame against the dealer's anchor 1, leaving out the arm that moved to the shoe (grundbild-21
//      --fit-skip handB,elbowB --keep-shoe-region)                                         MediaPipe landmarks: not ported
//   2. fillDark      the dark garment carried down to the table's back edge when the body ends 9 rows or less too high
//   3. removeShadow  shadows off the green above the edge
//   4. edgeCheck     0 dark points above the edge, the body ending on rows 825–831
//   5. the bank's shoe back from a plate without a hand, keeping the card her hand touches (skolagning-21 --keep-card, plate =
//      anchor 1)                                                                            MediaPipe hand: not ported
//   6. greenTo       the green of anchor 1
//   7. toneTo        the tone of her skin and clothes in anchor 1
//   8. removeShadow  once more: the tone step uncovers a few dark points on the sleeve's edge
//   9. edgeCheck     as in 4
// Each step follows OpenCV's and NumPy's arithmetic where it decides a pixel (single precision, truncation to bytes).

import {components, dilate, erode, gaussianBlur, median, PERSON_RIGHT, type Triple} from './film-after.ts';

const f32 = Math.fround;
export const CUT = 832;          // the first row below the table's back edge (row 831.5 in the ground standard)
export const REACH = 9;          // rows the hem may be short; a sleeve's rounded underside is farther off and is left alone

const isGreen = (d: Uint8Array, i: number) => d[i + 1] - Math.max(d[i], d[i + 2]) > 50 && d[i + 1] > 110;
const toByte = (v: number) => v <= 0 ? 0 : v >= 255 ? 255 : Math.trunc(v);
/** Grey dilation (a max filter) of an 8-bit plane by a k × k square; nothing outside the picture. */
export function maxFilter(src: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const r = k >> 1, across = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let d = Math.max(0, x - r); d <= Math.min(w - 1, x + r); d++) m = Math.max(m, src[y * w + d]); across[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let d = Math.max(0, y - r); d <= Math.min(h - 1, y + r); d++) m = Math.max(m, across[d * w + x]); out[y * w + x] = m; }
  return out;
}
/** The background green of the upper-left corner (x 20..319, y 20..119): the median per channel, B, G, R. */
export function cornerGreen(im: Uint8Array, w: number): Triple {
  const ch: number[][] = [[], [], []];
  for (let y = 20; y < 120; y++) for (let x = 20; x < 320; x++) for (let c = 0; c < 3; c++) ch[c].push(im[(y * w + x) * 3 + c]);
  return ch.map(median) as Triple;
}

/**
 * ta-bort-skugga.py: a shadow is a green pixel 4 levels or more darker than the background with no red or blue of its own, above
 * the edge. Further than 2 px from anything solid it becomes the background green. Within 2 px it is left alone beside dark cloth
 * (there it is the cloth's soft edge) and lifted beside skin or light cloth (there it would stay as a dark rim).
 */
export function removeShadow(im: Uint8Array, w: number, h: number, edge = CUT): {data: Uint8Array; green: Triple; far: number; rim: number} {
  const n = w * h, solid = new Uint8Array(n), bright = new Uint8Array(n), darkSolid = new Uint8Array(n), ref = cornerGreen(im, w), out = im.slice();
  for (let p = 0; p < n; p++) {
    const i = p * 3, max = Math.max(im[i], im[i + 1], im[i + 2]);
    solid[p] = im[i + 1] - Math.max(im[i], im[i + 2]) < 15 ? 1 : 0;
    bright[p] = solid[p] ? max : 0; darkSolid[p] = solid[p] && max <= 90 ? 255 : 0;
  }
  const near = dilate(solid, w, h, 5), lightNear = maxFilter(bright, w, h, 5), darkNear = maxFilter(darkSolid, w, h, 5), fill = ref.map(Math.trunc);
  let far = 0, rim = 0;
  for (let p = 0; p < Math.min(n, edge * w); p++) {
    const i = p * 3;
    if (solid[p] || !(im[i + 1] <= ref[1] - 4 && im[i + 2] <= ref[2] + 25 && im[i] <= ref[0] + 25)) continue;
    const isFar = !near[p], isRim = !!near[p] && lightNear[p] > 90 && !darkNear[p];
    if (isFar) far++; if (isRim) rim++;
    if (isFar || isRim) { out[i] = fill[0]; out[i + 1] = fill[1]; out[i + 2] = fill[2]; }
  }
  return {data: out, green: [Math.trunc(ref[2]), Math.trunc(ref[1]), Math.trunc(ref[0])], far, rim};
}

/**
 * fyll-morkt.py: carries a dark garment the last few rows down to the table's back edge. The image model ends the body a few rows
 * above the row where the reference dealer's jacket ends; black cloth has no pattern to stretch, so each column's lowest cloth
 * colour is continued downwards. Only green pixels straight under dark cloth are filled; hands and arms are not touched. The cut
 * copies the reference's edge: full to row cut − 1, 0.55 on row cut, 0.2 on the row below.
 */
export function fillDark(img: Uint8Array, w: number, h: number, cut = CUT): {data: Uint8Array; cut: number; columnsFilled: number; rowsAddedMedian: number; rowsAddedMax: number; pixelsFilled: number} {
  const n = w * h, green = new Uint8Array(n), notGreen = new Uint8Array(n);
  for (let p = 0; p < n; p++) { green[p] = isGreen(img, p * 3) ? 1 : 0; notGreen[p] = 1 - green[p]; }
  const {labels, blobs} = components(notGreen, w, h);
  let personLabel = 0, best = -1;
  blobs.forEach((b, k) => { if (0.3 * w < b.cx && b.cx < 0.7 * w && b.area > best) { best = b.area; personLabel = k + 1; } });
  const person = new Uint8Array(n), dark = new Uint8Array(n), skin = new Uint8Array(n), cloth = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (labels[p] !== personLabel) continue;
    const i = p * 3, b = img[i], g = img[i + 1], r = img[i + 2];
    person[p] = 1; dark[p] = Math.max(b, g, r) < 90 ? 1 : 0;
    skin[p] = r > g + 12 && r > b + 20 && b > 70 ? 1 : 0; cloth[p] = skin[p] ? 0 : 1;
  }
  const out = Float32Array.from(img), filled = new Uint8Array(n), low = new Int32Array(w).fill(-1), at = (y: number, x: number) => y * w + x;
  const anySkin = (y0: number, y1: number, x: number) => { for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) if (skin[at(y, x)]) return true; return false; };
  for (let x = 0; x < w; x++) {
    let last = -1; for (let y = cut - 60; y < cut; y++) if (cloth[at(y, x)]) last = y;
    if (last < 0 || last < cut - 1 - REACH || anySkin(last, cut + 2, x) || !dark[at(last - 3, x)]) continue;
    let all = true; for (let y = Math.max(0, last - 150); y < last; y++) if (!person[at(y, x)]) { all = false; break; }
    if (all && last - 150 >= 0) low[x] = last;
  }
  const lowSkin = new Uint8Array(n); for (let y = cut - 60; y < h; y++) for (let x = 0; x < w; x++) lowSkin[at(y, x)] = skin[at(y, x)];
  for (const b of components(lowSkin, w, h).blobs) {
    if (b.area < 1500 || b.top > cut + 20) continue;
    const x0 = b.left, x1 = b.left + b.width;
    if (b.cx < w / 2) low.fill(-1, Math.max(0, x0 - 80), Math.max(0, Math.min(w, x0 + 6)));   // left hand in the picture: its cuff lies to the left of it
    else low.fill(-1, Math.max(0, x1 - 6), Math.min(w, x1 + 80));                              // right hand: its cuff lies to the right
  }
  let want = Uint8Array.from(low, v => v >= 0 ? 1 : 0);
  want = erode(dilate(want, w, 1, 9, 1), w, 1, 9, 1);       // no gaps of a few columns in the band (closing)
  want = dilate(erode(want, w, 1, 25, 1), w, 1, 25, 1);     // and no lone columns (opening)
  const before: number[] = [];
  for (let x = 0; x < w; x++) {
    if (!want[x]) continue;
    const top = low[x] >= 0 ? low[x] - 2 : cut - 1 - REACH;
    if (anySkin(top, cut + 2, x)) continue;
    for (let y = top; y < Math.min(h, cut + 2); y++) { for (let c = 0; c < 3; c++) out[at(y, x) * 3 + c] = out[at(top - 1, x) * 3 + c]; filled[at(y, x)] = 1; }
    before.push(low[x] >= 0 ? low[x] : cut - 1 - REACH);
  }
  let pixels = 0; for (let p = 0; p < n; p++) pixels += filled[p];
  if (pixels) {
    const soft = gaussianBlur(out, w, h, 3, 1.2);
    for (let p = 0; p < n; p++) if (filled[p]) for (let c = 0; c < 3; c++) out[p * 3 + c] = soft[p * 3 + c];
    const greens: number[][] = [[], [], []];
    for (let p = 0; p < n; p++) if (green[p]) for (let c = 0; c < 3; c++) greens[c].push(img[p * 3 + c]);
    const field = greens.map(v => { const s = Float32Array.from(v).sort(), k = s.length; return k & 1 ? s[k >> 1] : f32(f32(s[k / 2 - 1] + s[k / 2]) / 2); });
    for (const [y, a] of [[cut, 0.55], [cut + 1, 0.2]] as const) {
      const fa = f32(a), fb = f32(1 - a);
      for (let x = 0; x < w; x++) if (filled[at(y, x)]) for (let c = 0; c < 3; c++) { const i = at(y, x) * 3 + c; out[i] = f32(f32(out[i] * fa) + f32(field[c] * fb)); }
    }
  }
  const rowsAdded = before.map(v => cut - 1 - v);
  return {data: Uint8Array.from(out, toByte), cut, columnsFilled: before.length, rowsAddedMedian: rowsAdded.length ? median(rowsAdded) : 0, rowsAddedMax: rowsAdded.length ? Math.max(...rowsAdded) : 0, pixelsFilled: pixels};
}

/** The green as one smooth field, as gron-till-niva.py takes it: the pure screen (9 px in) blurred wide (σ 60) and divided by its own blurred coverage. */
function wideGreen(im: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h, pure0 = new Uint8Array(n);
  for (let p = 0; p < n; p++) pure0[p] = isGreen(im, p * 3) ? 1 : 0;
  const pure = erode(pure0, w, h, 9), weighted = new Float32Array(n * 3), cover = new Float32Array(n);
  for (let p = 0; p < n; p++) { cover[p] = pure[p]; for (let c = 0; c < 3; c++) weighted[p * 3 + c] = im[p * 3 + c] * pure[p]; }
  const num = gaussianBlur(weighted, w, h, 3, 60), den = gaussianBlur(cover, w, h, 1, 60), floor = f32(1e-3);
  for (let p = 0; p < n; p++) { const d = Math.max(floor, den[p]); for (let c = 0; c < 3; c++) num[p * 3 + c] = f32(num[p * 3 + c] / d); }
  return num;
}
const corner = (im: Uint8Array, w: number) => { const s = [0, 0, 0]; for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const i = (y * w + x) * 3; s[0] += im[i + 2]; s[1] += im[i + 1]; s[2] += im[i]; } return s.map(v => Number((v / 9216).toFixed(1))); };
/**
 * gron-till-niva.py: gives a still the green level of another (anchor 1): background, soft edges and the green share in hair alike,
 * each pixel moved by its share of screen. A film ordered between two pictures of different green has to drift between them.
 */
export function greenTo(K: Uint8Array, T: Uint8Array, w: number, h: number): {data: Uint8Array; before: number[]; wanted: number[]; after: number[]; changedWhereNotGreen: number} {
  const gk = wideGreen(K, w, h), gt = wideGreen(T, w, h), out = new Uint8Array(w * h * 3);
  let changed = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 3, screen = Math.max(1, f32(gk[i + 1] - Math.max(gk[i], gk[i + 2]))), share = Math.min(1, Math.max(0, f32((K[i + 1] - Math.max(K[i], K[i + 2])) / screen)));
    let most = 0;
    for (let c = 0; c < 3; c++) { out[i + c] = toByte(f32(K[i + c] + f32(share * f32(gt[i + c] - gk[i + c])))); most = Math.max(most, Math.abs(out[i + c] - K[i + c])); }
    if (share < f32(0.02) && most > 1) changed++;
  }
  return {data: out, before: corner(K, w), wanted: corner(T, w), after: corner(out, w), changedWhereNotGreen: changed};
}

/** ton-till.py's classes: her body (not green, left of the shoe), her skin and her light cloth. */
function classes(im: Uint8Array, w: number, h: number) {
  const n = w * h, body = new Uint8Array(n), skin: number[] = [], cloth: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 3; if (x >= PERSON_RIGHT || isGreen(im, i)) continue;
    body[p] = 1; const b = im[i], g = im[i + 1], r = im[i + 2], lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    if (r > g + 12 && r > b + 20 && g < r * 0.84 && b > 70 && r > 150) skin.push(i);
    if (lo > 170 && hi - lo < 30) cloth.push(i);
  }
  return {body, skin, cloth};
}
const channelMedian = (im: Uint8Array, idx: number[]) => [0, 1, 2].map(c => f32(median(idx.map(i => im[i + c]))));
/**
 * ton-till.py: gives the person the colour tone of the person in another still (anchor 1): one gain per channel for her skin and
 * one for her light cloth (medians of each, both pictures), mixed by how saturated a pixel is, applied to the person only: the
 * green, the shoe and the card are left as they are.
 */
export function toneTo(K: Uint8Array, T: Uint8Array, w: number, h: number, skinOnly = false) {
  const k = classes(K, w, h), t = classes(T, w, h), mk = [channelMedian(K, k.skin), channelMedian(K, k.cloth)], mt = [channelMedian(T, t.skin), channelMedian(T, t.cloth)];
  const gain = [0, 1].map(j => [0, 1, 2].map(c => f32(mt[j][c] / mk[j][c])));
  const soft = gaussianBlur(Float32Array.from(k.body), w, h, 1, 0.8), out = new Uint8Array(w * h * 3), k45 = f32(0.45);
  for (let p = 0; p < w * h; p++) {
    const i = p * 3, hi = Math.max(K[i], K[i + 1], K[i + 2]), lo = Math.min(K[i], K[i + 1], K[i + 2]);
    const sat = f32((hi - lo) / Math.max(1, hi)), mix = Math.min(1, Math.max(0, f32(sat / k45))), rest = f32(1 - mix);
    for (let c = 0; c < 3; c++) {
      const per = f32(f32((skinOnly ? 1 : gain[1][c]) * rest) + f32(gain[0][c] * mix));
      out[i + c] = toByte(f32(K[i + c] * f32(1 + f32(soft[p] * f32(per - 1)))));
    }
  }
  const after = classes(out, w, h), warm = (im: Uint8Array, idx: number[]) => idx.length ? Number(median(idx.map(i => im[i + 2] - im[i + 1])).toFixed(1)) : null;
  const r4 = (v: number[]) => v.map(x => Number(x.toFixed(4)));
  return {data: out, gainBGR: {skin: r4(gain[0]), cloth: r4(gain[1])}, skinMedianBGR: {before: mk[0], wanted: mt[0], after: channelMedian(out, after.skin)},
    clothMedianBGR: {before: mk[1], wanted: mt[1], after: channelMedian(out, after.cloth)}, skinWarmthRminusG: {before: warm(K, k.skin), wanted: warm(T, t.skin), after: warm(out, after.skin)}};
}
