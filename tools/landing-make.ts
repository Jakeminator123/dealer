// Makes an A3 candidate (ankare 3: a seat's landing picture for one hand, src/order-model.ts landingOf) from a source picture of
// her with the hand at the seat (a film's frame or an image model's picture, 1764 × 1174, the bank's frame), the way the last
// picture of the deal from anchor 2.3 to seat 5 was made (giv-fran-2-3-p5, take 4, which held):
//   1. the green brought to the anchor's level (tools/order-images.ts matchGreen);
//   2. the bank's shoe and the yellow card in its window put back from the anchor (SHOE_AT_ANCHOR), so that the window is never
//      white or redrawn, and with it her whole hand at the shoe to the cuff, the shoe's shadow and what else still differs round
//      them (takeHandAtShoe): the seam lies where both pictures are black sleeve or green, never across her skin (round three,
//      2026-11-21: on A2.3 → P4C2's frame 68 the shoe's straight edge cut through her fingers, the film's hand lying 3–7 px off);
//      where her outline crosses that seam and the source's lies off the anchor's, it glides from the anchor's to the source's
//      (glideOutline: frame 68's upper arm lay 8 px out and stepped), and in the dark sleeve the anchor fades into the source
//      (blendSleeve: the anchor's lighter fold stood ragged against the film's black);
//   3. a card the source drew near the seat taken away: its blue, its white rim, its marks and its edge become felt shaded as the
//      source's felt round it (feltOver; the source's shadows stay, so no hard step is left in the green), the plan's card drawn on
//      the seat with the repo's own function (drawCard: the bank's card in the plan's quad, blue with its pink cross and red circle, no white rim), and her
//      fingers that lie over it put back on top;
//   4. checks, measured and written into the receipt: the bank's size; the frame held (her head and shoulders where the anchor
//      has them, the shoe where it stands); the laying hand's fingertips at the card's corner nearest her; the other hand at the
//      window as in the anchor; the green plain; the hand at the shoe the anchor's, no seam across skin and her outline not
//      stepping where it crosses the seam; no white of a card left round the drawn card. A check that fails stops the run unless
//      --anyway is given (then it is said).
//   5. the picture into Material as a candidate (tools/media-roles.ts add, role landning, node LAND(<seat>), card, hand), named
//      "A3P4C1": assets/anchors/<dealer>-<name>/anchor.png with its receipt. Never gäller: Jakob makes an anchor hold.
//
//   node tools/landing-make.ts <source.png> --target P4.C1 --hand RH --name a3-p4-nb [--anchor <png>] [--title "A3P4C1"] [--dealer paow] [--anyway] [--dry]
// Tests: tools/landing-make.test.ts (the pure parts on made-up pictures).
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {W, H, cardTexture, components, drawCard, growMask, inPolygon, matchGreen, pngOf, readPlan, readRgb, planQuad, greenOf, type Rgb, type Pt} from './order-images.ts';
import {SHOE_AT_ANCHOR} from './order-store.ts';
import {mediaRoles} from './media-roles.ts';
import {a3Name} from '../src/order-model.ts';

/** The limits of the checks (bank pixels and levels). */
export const LANDING_LIMITS = {
  screen: 40,          // a pixel is green screen when its green is this far above its red and blue
  headBand: 520,       // her head and shoulders: rows 0..520 of the bank's frame
  headIoU: 0.75,       // the silhouette there overlaps the anchor's at least this much: the frame is held (0.80 on the end frame of
                       // take 4 to seat 5, which held: her head bows and turns to the seat; a redrawn or moved frame falls far lower)
  shoeMean: 28,        // the source's shoe differs from the anchor's by at most this many levels on average
  tipsRadius: 34,      // px round the card's edge nearest her where the laying hand's fingertips are looked for
  tipsPixels: 120,     // at least this many of her pixels there
  windowMean: 30,      // the window and the hand at it differ from the anchor by at most this many levels on average
  greenShift: 4,       // the green in the result is at most this far from the anchor's
  handForeign: 0,      // pixels of skin at the hand by the shoe in the result that are not the anchor's: the hand is the anchor's, whole
  seamSkin: 0,         // pixels of skin (in either picture) on the seam round what is taken from the anchor at the shoe
  seamOutline: 0,      // pixels just outside that seam (1–6 px) where the result is her and the anchor solidly green, or the reverse:
                       // her outline steps where it crosses the seam (a notch, as on frame 68's upper arm in round two)
  whiteRim: 0,         // white pixels (R, G and B over 200, not skin) round the drawn card: a card's rim left on the felt
};
/** How the hand at the shoe and the source's card are taken (px and levels): settings, not limits. */
export const LANDING_MAKE = {
  handReach: 160,      // her hand at the shoe is the skin touching the shoe's polygon, within this many px of it
  handMin: 200,        // ... in a part of at least this many pixels
  handMargin: 6,       // what is taken from the anchor reaches this far past the hand in either picture (and a piece of skin
                       // this near the hand, cut off by a dark tattoo line or a shadow, is the hand's)
  seatGuard: 34,       // ... but skin that reaches this near the plan's card is the laying hand, never taken, nor is anything there
  shoeFlood: 12,       // round the shoe's polygon it grows on this far while they differ (the shoe's shadow)
  seamFlood: 140,      // round the hand it grows on while the two pictures differ (3 × 3 mean, any channel), at most this far: about her
                       // forearm, so that where the film's arm lies otherwise the anchor's forearm comes with its hand (at 40 px the
                       // sleeve of frame 68 kept a step at the cuff; the seam then lies at the elbow)
  seamDiff: 24,        // ... by more than this many levels
  feather: 3,          // outside it the anchor fades out over this many px (never over skin)
  glide: 48,           // where her outline crosses the seam and the source's lies off the anchor's, it glides from the anchor's to
                       // the source's over this many px along it (frame 68: 8 px apart on the upper arm, so under 0.2 px a row)
  glideBand: 14,       // ... where the two outlines lie at most this far apart; further apart it is not glided (seamOutline stops it)
  glideApron: 16,      // ... and the push fades out over this many px beyond that band round the source's outline (more than the largest push)
  sleeveBlend: 8,      // where both pictures are dark sleeve at the seam, the anchor fades into the source over this many px each way
  sleeveDark: 80,      // ... dark sleeve: no channel above this, not green, not skin
  seamOutlineBand: 6,  // seamOutline is counted this many px outside the seam
  cardEdge: 2,         // the source card's edge: this many px round its blue, white and marks that are not her
  rimBand: 40,         // the white of a card is counted this far round the plan's quad
};
const M = LANDING_MAKE;
const L = LANDING_LIMITS;
export const isScreen = (rgb: Rgb, i: number) => rgb[i * 3 + 1] - Math.max(rgb[i * 3], rgb[i * 3 + 2]) > L.screen;
export const isCardBlue = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return b > 110 && b > r + 40 && b > g + 15; };
/** Her, round the seat: a dark tattoo or sleeve, or skin (redder than blue). */
export const isHer = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return Math.max(r, g, b) < 110 || (r > b + 10 && r > 90 && g < r + 20); };
/**
 * The marks of an open card: the pink cross (red with its blue well above its green) and the red circle (red with hardly any
 * green). Skin is neither: its blue stays at or below its green, and its green above a third of its red, even in a rosy
 * fingertip's shade. Near the seat such a pixel is the source's card, not her, and gives way to the felt with the card's blue
 * (round two, 2026-11-21: on pilot 02's frame 72 the marks of the card the film laid were left on the felt as "skin").
 */
export const isCardMark = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return r > 140 && ((b > g + 30 && g < 0.75 * r) || g < 0.35 * r); };
/** A card or its rim as an image model draws it: bluish, or near white and grey; never her skin (redder than blue) or a dark tattoo or sleeve. */
export const isCardLike = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b); return (b > 110 && b >= r - 5) || (lo > 165 && hi - lo < 45); };
/**
 * Her skin, a tattoo's shading in it too: redder than blue, its blue above half its green (the yellow card in the shoe's window
 * and the window's gold rim have far less), never green screen and never a card's white or blue. A dark tattoo line or the
 * sleeve is not skin.
 */
export const isSkin = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return r > 90 && r > b + 10 && g < r + 20 && b > 0.5 * g && !isScreen(rgb, i) && !isCardLike(rgb, i); };
/** A white pixel that is not skin: R, G and B over 200 and nearly grey (a card's rim; skin's blue lies far below its red). */
export const isWhite = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 45; };
const polygonMask = (poly: readonly Pt[]) => { const m = new Uint8Array(W * H); const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) if (inPolygon(poly, x + 0.5, y + 0.5)) m[y * W + x] = 1; return m; };
const meanDiff = (a: Rgb, b: Rgb, mask: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < W * H; i++) if (mask[i]) { s += Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2]); n++; } return n ? s / (3 * n) : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The edge of the plan's quad nearest her (the two corners highest in the bank's picture): where the fingertips rest. */
export function nearEdge(quad: readonly Pt[]): [Pt, Pt] {
  const sorted = [...quad].sort((a, b) => a[1] - b[1]);
  return [sorted[0], sorted[1]];
}
const distToSegment = (x: number, y: number, [a, b]: [Pt, Pt]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const NEIGHBOURS = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
/** Whether any of the pixel's eight neighbours (in the picture) is such. */
const around = (i: number, is: (k: number) => boolean) => { const x = i % W; return NEIGHBOURS.some((d) => { const k = i + d; return k >= 0 && k < W * H && Math.abs((k % W) - x) <= 1 && is(k); }); };
const copyFrom = (to: Buffer, from: Rgb, i: number) => { to[i * 3] = from[i * 3]; to[i * 3 + 1] = from[i * 3 + 1]; to[i * 3 + 2] = from[i * 3 + 2]; };
const maxDiff = (a: Rgb, b: Rgb, i: number) => Math.max(Math.abs(a[i * 3] - b[i * 3]), Math.abs(a[i * 3 + 1] - b[i * 3 + 1]), Math.abs(a[i * 3 + 2] - b[i * 3 + 2]));
/** A mask with its holes filled: what of the rest cannot be reached from outside the mask's box. */
function fillHoles(mask: Uint8Array): Uint8Array {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) if (mask[i]) { const x = i % W, y = (i - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = Uint8Array.from(mask);
  if (x1 < 0) return out;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
  const outside = new Uint8Array(W * H), stack: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x === x0 || x === x1 || y === y0 || y === y1) && !mask[y * W + x]) { outside[y * W + x] = 1; stack.push(y * W + x); }
  while (stack.length) { const j = stack.pop()!, x = j % W, y = (j - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < x0 || xx > x1 || yy < y0 || yy > y1) continue; const k = yy * W + xx; if (!mask[k] && !outside[k]) { outside[k] = 1; stack.push(k); } } }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!outside[y * W + x]) out[y * W + x] = 1;
  return out;
}
/** Round the plan's card, where the laying hand is: nothing there is taken from the anchor at the shoe. */
export const seatGuard = (quad: readonly Pt[]) => growMask(polygonMask(quad), M.seatGuard);
/**
 * Her hand at the shoe in a picture: the parts of skin within reach of the shoe that touch its polygon (her fingers on the
 * window), with the pieces of skin right beside them; never a part that reaches the seat (the laying hand, at a seat near the shoe).
 */
export function handAtShoe(rgb: Rgb, seat: Uint8Array, shoe: Uint8Array = polygonMask(SHOE_AT_ANCHOR)): Uint8Array {
  const reach = growMask(shoe, M.handReach), skin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (reach[i] && isSkin(rgb, i)) skin[i] = 1;
  const {labels, parts} = components(skin), atSeat = new Set<number>(), chosen = new Set<number>(), hand = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (labels[i] && seat[i]) atSeat.add(labels[i]);
  for (let i = 0; i < W * H; i++) if (labels[i] && shoe[i] && parts[labels[i]].area >= M.handMin && !atSeat.has(labels[i])) chosen.add(labels[i]);
  for (let i = 0; i < W * H; i++) if (chosen.has(labels[i])) hand[i] = 1;
  const beside = growMask(hand, M.handMargin);
  for (let i = 0; i < W * H; i++) if (labels[i] && beside[i] && !atSeat.has(labels[i])) chosen.add(labels[i]);
  for (let i = 0; i < W * H; i++) if (chosen.has(labels[i])) hand[i] = 1;
  return hand;
}
const mean3 = (rgb: Rgb, i: number, c: number) => { const x = i % W, y = (i - x) / W; let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += rgb[(yy * W + xx) * 3 + c]; n++; } } return s / n; };
const differs = (a: Rgb, b: Rgb, i: number) => Math.max(...[0, 1, 2].map((c) => Math.abs(mean3(a, i, c) - mean3(b, i, c)))) > M.seamDiff;
/**
 * What is taken from the anchor at the shoe (the shoe's polygon with the yellow card in its window): the shoe, her whole hand
 * at it in the anchor and in the source (so no finger of the film's hand is left beside the anchor's), a margin round them,
 * and on from there as long as the two pictures still differ (the sleeve's edge, the shoe's and the hand's shadows), holes
 * filled. Its seam then lies where both are black sleeve or green; skin on it is counted (seamSkin), and where the growth
 * stopped at its limit with the pictures still apart (seamApart).
 */
export function takeHandAtShoe(out: Rgb, anchor: Rgb, quad: readonly Pt[]): {take: Uint8Array; hands: Uint8Array; handPixels: number; seamPixels: number; seamSkin: number; seamApart: number} {
  const shoe = polygonMask(SHOE_AT_ANCHOR), seat = seatGuard(quad), handA = handAtShoe(anchor, seat, shoe), handS = handAtShoe(out, seat, shoe), hands = new Uint8Array(W * H);
  let handPixels = 0;
  for (let i = 0; i < W * H; i++) if (handA[i] || handS[i]) { hands[i] = 1; handPixels++; }
  const take = fillHoles(growMask(hands, M.handMargin)), limit = growMask(take, M.seamFlood), round = growMask(shoe, M.shoeFlood);
  // The shoe's polygon is the anchor's as before, wherever the seat lies; what is added round it stays off the seat.
  for (let i = 0; i < W * H; i++) { if (round[i]) limit[i] = 1; if (seat[i]) { take[i] = 0; limit[i] = 0; } if (shoe[i]) take[i] = 1; }
  // On while they differ; never into skin that is not the hand at the shoe (her laying hand, the anchor's other hand).
  const stack: number[] = [];
  for (let i = 0; i < W * H; i++) if (take[i]) stack.push(i);
  while (stack.length) { const j = stack.pop()!, x = j % W;
    for (const d of NEIGHBOURS) { const k = j + d; if (k < 0 || k >= W * H || Math.abs((k % W) - x) > 1 || take[k] || !limit[k]) continue;
      if ((isSkin(out, k) && !handS[k]) || (isSkin(anchor, k) && !handA[k])) continue;
      if (differs(out, anchor, k)) { take[k] = 1; stack.push(k); } } }
  const filled = fillHoles(take);
  for (let i = 0; i < W * H; i++) if (seat[i] && !shoe[i]) filled[i] = 0;
  let seamPixels = 0, seamSkin = 0, seamApart = 0;
  // The seam: its inner side may be skin in neither picture, and its outer side not skin of the source (her skin left against it).
  for (let i = 0; i < W * H; i++) {
    if (filled[i] && around(i, (k) => !filled[k])) { seamPixels++; if (isSkin(out, i) || isSkin(anchor, i)) seamSkin++; if (differs(out, anchor, i)) seamApart++; }
    else if (!filled[i] && isSkin(out, i) && around(i, (k) => filled[k] === 1)) seamSkin++;
  }
  return {take: filled, hands, handPixels, seamPixels, seamSkin, seamApart};
}

/** The distance, px, from each pixel to the nearest pixel of the mask (exact, in two passes: Felzenszwalb and Huttenlocher). */
export function distanceTo(mask: Uint8Array): Float32Array {
  const INF = 1e10, n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), sq = new Float64Array(W * H);
  const pass = (len: number) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k]));
      while (s <= z[k]) { k--; s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k])); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = mask[y * W + x] ? 0 : INF; pass(H); for (let y = 0; y < H; y++) sq[y * W + x] = d[y]; }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = sq[y * W + x]; pass(W); for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]); }
  return out;
}
/** How green a pixel is: its green above its red and blue (the green screen's key). */
const keyOf = (rgb: Rgb, i: number) => rgb[i * 3 + 1] - Math.max(rgb[i * 3], rgb[i * 3 + 2]);
/** The signed distance, px, to her outline against the green: below 0 in her (key under `half`), above 0 in the green. */
function outlineOf(rgb: Rgb, half: number): Float32Array {
  const her = new Uint8Array(W * H), green = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (keyOf(rgb, i) < half) her[i] = 1; else green[i] = 1;
  const toHer = distanceTo(her), toGreen = distanceTo(green), s = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) s[i] = her[i] ? 0.5 - toGreen[i] : toHer[i] - 0.5;
  return s;
}
/**
 * Her outline across the seam (round three, 2026-11-21: on frame 68 the film's upper arm lay 6–8 px outside the anchor's, so
 * where the take ended the outline jumped 8 px in 4 rows). Where the source's outline crosses the take's edge (it passes
 * within 1.5 px of a pixel beside the take, running across that edge, not along it, and the anchor's lies within
 * M.glideBand px), the gap between the two outlines is measured there, and the source outside the take is pushed along its
 * outline's normal by that gap, fading over M.glide px along the source's outline: at the seam her outline is the anchor's,
 * further along the source's, and it glides a fraction of a px a row in between.
 * Where the two outlines meet at the seam nothing moves. The push carries the source's own edge (its soft rim, the green's
 * spill by it) and fades to nothing over M.glideApron px beyond M.glideBand from the source's outline (never folding: the
 * apron is more than the largest push), and a push that would reach past the middle of a narrow gap (the source's signed
 * distance where it lands not what the push meant) is halved or left out. Skin, the seat and `keep` are never touched.
 * Returns the pixels it changed.
 */
function glideOutline(out: Buffer, base: Rgb, anchor: Rgb, take: Uint8Array, keep: Uint8Array, half: number): Uint8Array {
  const sF = outlineOf(base, half), sA = outlineOf(anchor, half), G = M.glideBand, A = M.glideApron, L = M.glide;
  const band = (i: number) => !take[i] && !keep[i] && Math.abs(sF[i]) <= G + A, far = distanceTo(take);
  // A field's direction at a pixel (3 × 3 Sobel), and whether the source's outline runs across the take's edge there.
  const sobel = (f: Float32Array, i: number): [number, number] => { const g = (dx: number, dy: number) => f[i + dy * W + dx];
    return [g(1, -1) + 2 * g(1, 0) + g(1, 1) - g(-1, -1) - 2 * g(-1, 0) - g(-1, 1), g(-1, 1) + 2 * g(0, 1) + g(1, 1) - g(-1, -1) - 2 * g(0, -1) - g(1, -1)]; };
  const across = (i: number) => { const x = i % W, y = (i - x) / W; if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
    const [ax, ay] = sobel(sF, i), [bx, by] = sobel(far, i), la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    return la > 0 && lb > 0 && Math.abs(ax * bx + ay * by) / (la * lb) < 0.7; };
  // From where her outline crosses the seam, along the source's outline (2 a step across, 3 a step aslant, in a bucket
  // queue), each pixel carrying the gap measured at its crossing.
  const dist = new Uint16Array(W * H).fill(65535), gap = new Float32Array(W * H), buckets: number[][] = Array.from({length: 2 * L + 4}, () => []);
  for (let i = 0; i < W * H; i++) if (band(i) && Math.abs(sF[i]) <= 1.5 && Math.abs(sA[i]) <= G && around(i, (k) => take[k] === 1) && across(i)) { dist[i] = 2; gap[i] = sA[i] - sF[i]; buckets[2].push(i); }
  for (let b = 2; b <= 2 * L; b++) for (const j of buckets[b]) { if (dist[j] !== b) continue; const x = j % W;
    for (const d of NEIGHBOURS) { const k = j + d; if (k < 0 || k >= W * H || Math.abs((k % W) - x) > 1 || !band(k)) continue;
      const nd = b + (d === 1 || d === -1 || d === W || d === -W ? 2 : 3); if (nd < dist[k] && nd <= 2 * L) { dist[k] = nd; gap[k] = gap[j]; buckets[nd].push(k); } } }
  // The push per pixel, then its mean over the reached pixels round it (5 × 5), so that neighbours carrying gaps from
  // different pixels of one crossing push alike; and the source's signed distance smoothed the same way for the push's
  // direction and its landing (the film's 2 × 2 pixel steps on the outline would otherwise turn it from pixel to pixel).
  const reached: number[] = [], raw = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { if (dist[i] > 2 * L) continue; const x = i % W, y = (i - x) / W; if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) continue;
    reached.push(i); raw[i] = Math.max(0, Math.min(1, 1 - (dist[i] / 2 - 1) / L)) * Math.max(0, Math.min(1, (G + A - Math.abs(sF[i])) / A)) * gap[i]; }
  const mean5 = (f: Float32Array, i: number, only: boolean) => { let s = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = i + dy * W + dx; if (only && dist[k] > 2 * L) continue; s += f[k]; n++; } return n ? s / n : 0; };
  const soft = Float32Array.from(sF);
  for (const i of reached) soft[i] = mean5(sF, i, false);
  for (const i of reached) for (const d of NEIGHBOURS) { const k = i + d; if (dist[k] > 2 * L && k >= 2 * W + 2 && k < W * H - 2 * W - 2) soft[k] = mean5(sF, k, false); }
  const sampleF = (qx: number, qy: number) => { const x0 = Math.floor(qx), y0 = Math.floor(qy), fx = qx - x0, fy = qy - y0, i = y0 * W + x0;
    return (1 - fy) * ((1 - fx) * sF[i] + fx * sF[i + 1]) + fy * ((1 - fx) * sF[i + W] + fx * sF[i + W + 1]); };
  const changed = new Uint8Array(W * H), next = Buffer.from(out);
  for (const i of reached) {
    if (isSkin(base, i) || isSkin(anchor, i)) continue;
    const x = i % W, y = (i - x) / W;
    let push = mean5(raw, i, true);
    if (Math.abs(push) < 0.3) continue;
    // Along the outline's normal (towards the green); never past the middle of a gap.
    const [gx, gy] = sobel(soft, i), len = Math.hypot(gx, gy);
    if (len < 4) continue;
    const lands = (p: number) => { const qx = x + (p * gx) / len, qy = y + (p * gy) / len; return qx >= 0 && qy >= 0 && qx < W - 1 && qy < H - 1 && Math.abs(sampleF(qx, qy) - sF[i] - p) <= 1.5; };
    for (let tries = 0; tries < 3 && !lands(push); tries++) push /= 2;
    if (Math.abs(push) < 0.3 || !lands(push)) continue;
    const qx = x + (push * gx) / len, qy = y + (push * gy) / len, x0 = Math.floor(qx), y0 = Math.floor(qy), fx = qx - x0, fy = qy - y0;
    const k = [y0 * W + x0, y0 * W + x0 + 1, (y0 + 1) * W + x0, (y0 + 1) * W + x0 + 1];
    if (k.some((j) => isSkin(base, j))) continue;
    const wts = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    for (let c = 0; c < 3; c++) next[i * 3 + c] = Math.round(k.reduce((s, j, n) => s + wts[n] * base[j * 3 + c], 0));
    if (maxDiff(next, out, i) > 0) changed[i] = 1;
  }
  next.copy(out);
  return changed;
}
/**
 * The sleeve across the seam: where both pictures are dark sleeve within M.sleeveBlend px of the take's edge, the anchor fades
 * into the source (by the share of the take round the pixel), so a lighter fold of the anchor's sleeve does not stand with a
 * ragged edge against the film's darker sleeve (frame 68: a patchwork at x 1065–1128, y 676–716). Never `keep`.
 */
function blendSleeve(out: Buffer, base: Rgb, anchor: Rgb, take: Uint8Array, keep: Uint8Array): number {
  const S = M.sleeveBlend, sum = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += take[y * W + x]; sum[(y + 1) * (W + 1) + x + 1] = sum[y * (W + 1) + x + 1] + row; } }
  const sleeve = (rgb: Rgb, i: number) => Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) <= M.sleeveDark && keyOf(rgb, i) < 10 && !isSkin(rgb, i);
  let changed = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (keep[i] || !sleeve(base, i) || !sleeve(anchor, i)) continue;
    const x0 = Math.max(0, x - S), y0 = Math.max(0, y - S), x1 = Math.min(W, x + S + 1), y1 = Math.min(H, y + S + 1);
    const w = (sum[y1 * (W + 1) + x1] - sum[y0 * (W + 1) + x1] - sum[y1 * (W + 1) + x0] + sum[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    if (w <= 0 || w >= 1) continue;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(w * anchor[i * 3 + c] + (1 - w) * base[i * 3 + c]);
    changed++;
  }
  return changed;
}
/**
 * Her outline at the seam, measured: the pixels 1 to M.seamOutlineBand px outside the take where the result is plainly her
 * (key under a quarter of the green's) and the anchor plainly green (key over three quarters) with its eight neighbours, or
 * the reverse, off the seat. Inside the take she is the anchor's, so such pixels are her outline stepping as it crosses the
 * seam by more than a pixel (the glide lies within a pixel of the anchor's outline there).
 */
export function seamOutlineOf(result: Rgb, anchor: Rgb, take: Uint8Array, seat: Uint8Array, greenKey: number): number {
  const far = distanceTo(take), herP = (rgb: Rgb, i: number) => keyOf(rgb, i) < greenKey / 4, greenP = (rgb: Rgb, i: number) => keyOf(rgb, i) > (3 * greenKey) / 4;
  let n = 0;
  const solid = (is: (rgb: Rgb, i: number) => boolean, i: number) => is(anchor, i) && !around(i, (k) => !is(anchor, k));
  for (let i = 0; i < W * H; i++) if (!take[i] && !seat[i] && far[i] <= M.seamOutlineBand && ((herP(result, i) && solid(greenP, i)) || (greenP(result, i) && solid(herP, i)))) n++;
  return n;
}
/**
 * Felt where the source's card was: the anchor's felt shaded as the source's felt round the hole (the source's green minus the
 * anchor's, carried in from the hole's rim, weighted by 1 / distance²), so the source's shadows go on without a step.
 */
function feltOver(out: Buffer, anchor: Rgb, hole: Uint8Array, felt: (i: number) => boolean) {
  const rim = growMask(hole, 3), ring: number[] = [];
  for (let i = 0; i < W * H; i++) if (rim[i] && !hole[i] && felt(i)) ring.push(i);
  const step = Math.max(1, Math.ceil(ring.length / 1500)), pts = ring.filter((_, n) => n % step === 0);
  const off = pts.map((j) => [0, 1, 2].map((c) => out[j * 3 + c] - anchor[j * 3 + c]));
  for (let i = 0; i < W * H; i++) { if (!hole[i]) continue; const x = i % W, y = (i - x) / W;
    let sw = 0; const s = [0, 0, 0];
    pts.forEach((j, n) => { const jx = j % W, jy = (j - jx) / W, w = 1 / ((jx - x) ** 2 + (jy - y) ** 2); sw += w; for (let c = 0; c < 3; c++) s[c] += w * off[n][c]; });
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(anchor[i * 3 + c] + (sw ? s[c] / sw : 0)))); }
}
/**
 * Her edge against the source's card, made her edge against the felt: a pixel of hers within `band` px of the hole is part
 * skin, part card (the card's colour at the nearest pixel of the hole before it became felt). Its skin part is measured
 * against her skin a little further in (the mean of her skin within 5 px of it that lies more than `band` px from the hole), and its card
 * part becomes the felt that replaced the card there. A fingertip on the card's white rim then meets the felt, not a pink line.
 */
function unmixEdge(out: Buffer, before: Rgb, hole: Uint8Array, band: number, mayChange: (i: number) => boolean): number {
  const zone = growMask(hole, band);
  let changed = 0;
  for (let i = 0; i < W * H; i++) {
    if (!zone[i] || hole[i] || !mayChange(i) || isScreen(out, i)) continue;
    const x = i % W, y = (i - x) / W;
    let h = -1, hd = Infinity; const skin = [0, 0, 0]; let n = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx;
      if (hole[k]) { const d = dx * dx + dy * dy; if (d < hd && Math.max(Math.abs(dx), Math.abs(dy)) <= band + 1) { hd = d; h = k; } } else if (!zone[k] && isSkin(out, k)) { for (let c = 0; c < 3; c++) skin[c] += out[k * 3 + c]; n++; } }
    if (h < 0 || n < 3) continue;
    const S = skin.map((v) => v / n), C = [0, 1, 2].map((c) => before[h * 3 + c]), F = [0, 1, 2].map((c) => out[h * 3 + c]);
    const sc = S.map((v, c) => v - C[c]), len = sc.reduce((s, v) => s + v * v, 0);
    if (len < 900) continue;
    const alpha = Math.max(0, Math.min(1, [0, 1, 2].reduce((s, c) => s + (out[i * 3 + c] - C[c]) * sc[c], 0) / len));
    if (alpha >= 0.98) continue;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(out[i * 3 + c] + (1 - alpha) * (F[c] - C[c]))));
    changed++;
  }
  return changed;
}

export type Checks = {size: boolean; headIoU: number; shoeMean: number; tipsPixels: number; windowMean: number; greenShift: number; handForeign: number; seamSkin: number | null; seamOutline: number | null; whiteRim: number; fails: string[]};
/**
 * The checks on the source against the anchor and on the result, each with its measure; fails says which failed, in Swedish.
 * On the result: its green; her hand at the shoe (skin there that is not the anchor's, as a seam across her fingers leaves);
 * the white of a card round the drawn card; and, when the making's seam is given, skin on it and her outline stepping across it.
 */
export function checkLanding(source: Rgb, anchor: Rgb, result: Rgb, quad: readonly Pt[], windowBox: readonly [number, number, number, number], seam?: {seamSkin: number; seamOutline?: number}): Checks {
  let both = 0, either = 0;
  for (let y = 0; y < L.headBand; y++) for (let x = 0; x < W; x++) { const i = y * W + x, s = !isScreen(source, i), a = !isScreen(anchor, i); if (s && a) both++; if (s || a) either++; }
  const headIoU = either ? both / either : 0;
  const shoeMean = meanDiff(source, anchor, polygonMask(SHOE_AT_ANCHOR));
  const edge = nearEdge(quad), xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  let tipsPixels = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys) - L.tipsRadius)); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs) - L.tipsRadius)); x <= Math.min(W - 1, Math.ceil(Math.max(...xs) + L.tipsRadius)); x++) {
    const i = y * W + x;
    // The card the film laid is not her fingertips: its blue, its white rim and its marks are left out of the count.
    if (distToSegment(x, y, edge) <= L.tipsRadius && !isScreen(source, i) && !isCardBlue(source, i) && !isCardLike(source, i) && !isCardMark(source, i)) tipsPixels++;
  }
  const win = new Uint8Array(W * H), [wx, wy, ww, wh] = windowBox;
  for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) win[y * W + x] = 1;
  const windowMean = meanDiff(source, anchor, win);
  const gA = greenOf(anchor), gR = greenOf(result), greenShift = Math.max(...gA.map((v, c) => Math.abs(v - gR[c])));
  const shoe = polygonMask(SHOE_AT_ANCHOR), seat = seatGuard(quad), handA = handAtShoe(anchor, seat, shoe), handS = handAtShoe(source, seat, shoe), hands = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (handA[i] || handS[i]) hands[i] = 1;
  const handZone = growMask(hands, 8);
  let handForeign = 0;
  for (let i = 0; i < W * H; i++) if (handZone[i] && (isSkin(result, i) || isSkin(anchor, i)) && maxDiff(result, anchor, i) > 16) handForeign++;
  const card = growMask(polygonMask(quad), 1), band = growMask(card, M.rimBand);
  let whiteRim = 0;
  for (let i = 0; i < W * H; i++) if (band[i] && !card[i] && isWhite(result, i)) whiteRim++;
  const seamSkin = seam ? seam.seamSkin : null, seamOutline = seam?.seamOutline ?? null;
  const fails: string[] = [];
  if (headIoU < L.headIoU) fails.push(`bildrutan är inte hållen: huvud och axlar täcker ankarets till ${Math.round(headIoU * 100)} % (minst ${L.headIoU * 100} %)`);
  if (shoeMean > L.shoeMean) fails.push(`skon är omritad: i snitt ${r1(shoeMean)} nivåer från ankarets (högst ${L.shoeMean})`);
  if (tipsPixels < L.tipsPixels) fails.push(`inga fingertoppar vid kortets hörn närmast henne (${tipsPixels} bildpunkter av henne där, minst ${L.tipsPixels})`);
  if (windowMean > L.windowMean) fails.push(`handen vid fönstret ligger inte som i ankaret (i snitt ${r1(windowMean)} nivåer, högst ${L.windowMean})`);
  if (greenShift > L.greenShift) fails.push(`det gröna ligger ${greenShift} nivåer från ankarets (högst ${L.greenShift})`);
  if (handForeign > L.handForeign) fails.push(`handen vid skon är inte ankarets: ${handForeign} bildpunkter hud där skiljer sig från ankaret (högst ${L.handForeign}); en skarv går genom fingrarna`);
  if (seamSkin !== null && seamSkin > L.seamSkin) fails.push(`skarven runt det som tas från ankaret vid skon går genom hud på ${seamSkin} bildpunkter (högst ${L.seamSkin})`);
  if (seamOutline !== null && seamOutline > L.seamOutline) fails.push(`hennes kontur hoppar där skarven vid skon korsar den: ${seamOutline} bildpunkter strax utanför skarven är hon i bilden men grönt i ankaret, eller tvärtom (högst ${L.seamOutline})`);
  if (whiteRim > L.whiteRim) fails.push(`vita rester av ett kort runt det lagda kortet: ${whiteRim} bildpunkter (högst ${L.whiteRim})`);
  return {size: true, headIoU: Math.round(headIoU * 1000) / 1000, shoeMean: r1(shoeMean), tipsPixels, windowMean: r1(windowMean), greenShift, handForeign, seamSkin, seamOutline, whiteRim, fails};
}

export type Seam = {handPixels: number; takenPixels: number; seamPixels: number; seamSkin: number; seamApart: number; outlineGlided: number; sleeveBlended: number; seamOutline: number};
/**
 * Steps 1–3 on pixels: the green to the anchor's, the shoe and her hand at it back whole from the anchor, a card the source
 * drew near the seat away (felt shaded as round it), the plan's card drawn, her fingers on top.
 */
export function composeLanding(source: Rgb, anchor: Rgb, draw: (base: Rgb) => Rgb, quad: readonly Pt[]): {rgb: Rgb; fingers: number; strayBlue: number; edgeUnmixed: number; seam: Seam} {
  const out = Buffer.from(matchGreen(source, anchor).rgb), base = Buffer.from(out);
  // The shoe with her whole hand at it from the anchor, the seam in sleeve or green; outside, her outline glides from the
  // anchor's to the source's where it crosses the seam, the anchor fades out over a few px where the two pictures already
  // agree (never over skin), and over a wider band in the dark sleeve.
  const {take, hands, handPixels, seamPixels, seamSkin, seamApart} = takeHandAtShoe(out, anchor, quad);
  let takenPixels = 0;
  for (let i = 0; i < W * H; i++) if (take[i]) { copyFrom(out, anchor, i); takenPixels++; }
  const seat = seatGuard(quad), [gr, gg, gb] = greenOf(anchor), greenKey = Math.max(L.screen * 2, gg - Math.max(gr, gb));
  const glided = takenPixels ? glideOutline(out, base, anchor, take, seat, greenKey / 2) : new Uint8Array(W * H);
  let outlineGlided = 0;
  for (let i = 0; i < W * H; i++) if (glided[i]) outlineGlided++;
  let ring = take;
  for (let f = 1; f <= M.feather; f++) { const next = growMask(ring, 1), w = 1 - f / (M.feather + 1);
    for (let i = 0; i < W * H; i++) if (next[i] && !ring[i] && !isSkin(out, i)) for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(w * anchor[i * 3 + c] + (1 - w) * out[i * 3 + c]);
    ring = next; }
  let sleeveBlended = 0;
  if (takenPixels) {
    const keep = growMask(hands, M.sleeveBlend + M.handMargin), shoeZone = growMask(polygonMask(SHOE_AT_ANCHOR), M.sleeveBlend + 2);
    for (let i = 0; i < W * H; i++) if (seat[i] || shoeZone[i] || glided[i]) keep[i] = 1;
    sleeveBlended = blendSleeve(out, base, anchor, take, keep);
  }
  const seamOutline = seamOutlineOf(out, anchor, take, seat, greenKey);
  // A card the source drew round the seat, on the felt where the anchor has felt: its blue, its white rim and its pink and red
  // marks (the parts of them that touch the felt; a grey speck inside her tattoo does not), and its edge round them that is
  // not her, become felt shaded as the source's felt round it. Her skin, a tattoo, the sleeve and the felt's shadows stay.
  const near = growMask(polygonMask(quad), 170), cardish = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (near[i] && !take[i] && isScreen(anchor, i) && (isCardBlue(out, i) || isCardLike(out, i) || isCardMark(out, i))) cardish[i] = 1;
  const {labels} = components(cardish), onFelt = new Set<number>();
  for (let i = 0; i < W * H; i++) if (labels[i] && !onFelt.has(labels[i]) && around(i, (k) => isScreen(out, k))) onFelt.add(labels[i]);
  const hole = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (onFelt.has(labels[i])) hole[i] = 1;
  const edge = growMask(hole, M.cardEdge);
  for (let i = 0; i < W * H; i++) if (edge[i] && !hole[i] && near[i] && !take[i] && isScreen(anchor, i) && (!isHer(out, i) || isScreen(out, i))) hole[i] = 1;
  let strayBlue = 0;
  for (let i = 0; i < W * H; i++) if (hole[i]) strayBlue++;
  // Her edge against it outside the plan's card becomes her edge against the felt; on the plan's card her edge against the
  // source's card stays, since the drawn card goes under it.
  const inCard = growMask(polygonMask(quad), 2), before = Buffer.from(out);
  if (strayBlue) feltOver(out, anchor, hole, (i) => isScreen(out, i) && !take[i]);
  const edgeUnmixed = strayBlue ? unmixEdge(out, before, hole, M.cardEdge, (i) => near[i] && !take[i] && !inCard[i] && isScreen(anchor, i)) : 0;
  // Her fingers over the card: what of her (not green, not a card) lies in the card's quad, kept on top of the drawn card.
  const keep = new Uint8Array(W * H);
  let fingers = 0;
  for (let i = 0; i < W * H; i++) if (inCard[i] && !isScreen(out, i) && !isCardLike(out, i) && !isScreen(source, i)) { keep[i] = 1; fingers++; }
  const drawn = Buffer.from(draw(out));
  for (let i = 0; i < W * H; i++) if (keep[i]) copyFrom(drawn, out, i);
  return {rgb: drawn, fingers, strayBlue, edgeUnmixed, seam: {handPixels, takenPixels, seamPixels, seamSkin, seamApart, outlineGlided, sleeveBlended, seamOutline}};
}

/**
 * The cards an A3 is made for: a player's first and second card and the dealer's first, each laid open with a film of its own
 * (the second since 2026-11-21, when Jakob ordered the deal from anchor 2.3 to P4.C2). The picture shows only that card: the
 * game draws the cards that already lie. The second card (D.C2) is laid open by its own film, and a third card plays the seat's film.
 */
export const LANDING_TARGET = /^(?:P[1-7]\.C[12]|D\.C1)$/;

/** The whole run: read, make, check, and (unless dry) add the candidate to Material. */
export async function makeLanding(root: string, o: {source: string; target: string; hand: 'LH' | 'RH'; name: string; anchor?: string; title?: string; dealer?: string; anyway?: boolean; dry?: boolean; who?: string}) {
  const dealer = o.dealer ?? 'paow';
  if (!LANDING_TARGET.test(o.target)) throw new Error(`${o.target}: ett A3 görs för ett kort som läggs öppet med egen film: en spelares första eller andra kort (P1.C1 … P7.C2) eller dealerns första (D.C1).`);
  const register = JSON.parse(await readFile(path.join(root, 'data', 'media-roles.json'), 'utf8'));
  const holding = register.dealers?.[dealer]?.entries?.find((e: {role: string; state?: string; seat?: number}) => e.role === 'ankare-2.3' && e.state === 'gäller' && !e.seat);
  const anchorFile = o.anchor ? path.resolve(o.anchor) : holding?.path ? path.join(root, holding.path) : null;
  if (!anchorFile) throw new Error('Inget ankare 2.3 gäller; ange --anchor.');
  const sourceBytes = await readFile(o.source), source = await readRgb(sourceBytes), anchor = await readRgb(anchorFile);
  const {plan, file: planFile} = await readPlan(root), texture = await cardTexture(root), quad = planQuad(plan, o.target);
  let drawn: unknown = null;
  const made = composeLanding(source, anchor, (base) => { const d = drawCard(base, texture, plan, planFile, o.target, 'FRONT'); drawn = d.drawn; return d.rgb; }, quad);
  const window: [number, number, number, number] = [1150, 560, 330, 260];
  const checks = checkLanding(source, anchor, made.rgb, quad, window, made.seam);
  const png = await pngOf(made.rgb);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const record = {tool: 'tools/landing-make.ts', target: o.target, hand: o.hand, source: {path: o.source.split(path.sep).join('/'), sha256: sha(sourceBytes)}, anchor: {path: path.relative(root, anchorFile).split(path.sep).join('/'), sha256: sha(await readFile(anchorFile)), entry: o.anchor ? null : holding?.id ?? null},
    plan: planFile, card: drawn, fingersKept: made.fingers, strayBluePixels: made.strayBlue, edgeUnmixed: made.edgeUnmixed, handAtShoe: made.seam, checks, limits: LANDING_LIMITS, settings: LANDING_MAKE, anyway: !!o.anyway && checks.fails.length > 0};
  if (checks.fails.length && !o.anyway) return {written: false, refused: checks.fails, record, png};
  if (o.dry) return {written: false, refused: [], record, png};
  const title = o.title ?? a3Name(o.target);
  const added = await mediaRoles(root).add({dealer, role: 'landning', name: o.name, title, filename: path.basename(o.source), type: 'png', bytes: png, who: o.who ?? 'tools/landing-make.ts',
    landing: {card: o.target, hand: o.hand, made: record, builtOn: holding && !o.anchor ? [holding.id] : [], note: `A3 för ${o.target} med ${o.hand === 'RH' ? 'höger' : 'vänster'} hand vid kortet, gjord av tools/landing-make.ts${checks.fails.length ? ` trots: ${checks.fails.join('; ')}` : ''}.`.slice(0, 400)}});
  return {written: true, refused: [], record, png, entry: (added as {entry: {id: string; path: string}}).entry};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const source = args[0], target = flag('--target'), hand = flag('--hand'), name = flag('--name');
  try {
    if (!source || source.startsWith('--') || !target || (hand !== 'LH' && hand !== 'RH') || !name) throw new Error('Använd: node tools/landing-make.ts <källa.png> --target P4.C1 --hand RH --name a3-p4-<variant> [--anchor <png>] [--title "A3P4C1"] [--anyway] [--dry]');
    const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
    const out = await makeLanding(root, {source, target, hand, name, anchor: flag('--anchor'), title: flag('--title'), anyway: args.includes('--anyway'), dry: args.includes('--dry')});
    const preview = flag('--preview');
    if (preview) await (await import('node:fs/promises')).writeFile(preview, out.png);
    console.log(JSON.stringify({written: out.written, refused: out.refused, entry: (out as {entry?: unknown}).entry ?? null, checks: out.record.checks, fingersKept: out.record.fingersKept, strayBluePixels: out.record.strayBluePixels, edgeUnmixed: out.record.edgeUnmixed, handAtShoe: out.record.handAtShoe}, null, 2));
    if (out.refused.length) process.exitCode = 2;
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
