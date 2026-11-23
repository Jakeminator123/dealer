// Takes the white rim off the dealt card in a film's frame. The video model draws a pale rim round the card that no order asked
// for (Jakob 2026-11-23: "Vad är det som gör att det blir en vit kantlinje på kortet? Det ska inte finnas."); it is not the thin
// white line round the card in the shoe's window (painting that out of the first picture left the rim and blacked the window).
// A pure step on pixels, a frame at a time, used by tools/film-after.ts --rim-off (opt-in until Jakob has seen it at game size).
//
// Per frame (cardRimOff):
//   1. the dealt card is its colour outside the shoe by the lab's own rules (src/card-track.ts is.blue and is.yellow, the rules
//      the landing measure reads the card with): pieces near each other and as light as the largest are one card (a finger
//      across it parts it), and its outline is the convex outline of those pieces and of the marks touching them. Nothing
//      inside that outline is touched (but its outermost pixel and a half, the steps of a slanting edge): the colour itself, the
//      pink cross and the red dot, and her fingers lying on the card with their edges against it;
//   2. outside the outline, within CARD_RIM.reach px, the rim is what hangs together with the outline and is paler than the felt
//      (red and blue both lifted above the felt's: white, its grey in the hand's shadow, and its blend into the felt and into
//      the card's colour), never warm (her skin and nails are redder than green and blue), never dark (a sleeve, a tattoo),
//      never a mark; a faint pixel right beside her skin is her finger's own edge against the felt and stays;
//   3. the rim, and the felt it has tinted within CARD_RIM.skirt px of it, becomes felt, carried in from the felt outside layer
//      by layer, so it is shaded as that felt is (the card's shadow goes on to the card, the hand's shadow stays under the hand)
//      and no step is left; the two pixels nearest the card take a share of the card's colour, a soft edge. landing-make's
//      feltOver is not used: it weighs the whole ring by 1 / distance², and in a band this thin the dark felt under her hand,
//      far off, then darkens the band all round (measured on frame 48 of paow-giv-2-3-p3-01: green 190 at the card against
//      236 beside it);
//   4. her finger's edge against the rim (the few pixels where her skin was blended with the white) becomes her edge against the
//      felt: the white's share of each such pixel, measured between her colour a little further in and the rim's beside it, is
//      replaced by the felt that is there now. Skin and nails themselves (no share of white) are not changed.
// The shoe is never touched: `keep` (shoeKeep) is the bank's shoe where the anchor shows it, and everything in its window.
// Over a film (rimOffFilm) the frames come in order, and where the film stands still the result does too: the paint stays and
// the card's colour stays the card's, so a card at rest does not flicker (see there).
// Tests: tools/card-rim.test.ts (made-up pictures).
import {W, H, components, greenOf, growMask, inPolygon, type Rgb} from './order-images.ts';
import {SHOE_AT_ANCHOR} from './order-store.ts';
import {isCardLike, isCardMark, isScreen} from './landing-make.ts';
import {SHOE_WINDOW} from '../src/film-after.ts';
import {hull, inside, is, type Pt} from '../src/card-track.ts';

/** The settings (bank pixels and levels). */
export const CARD_RIM = {
  minCard: 120,    // the dealt card: at least this many pixels of its colour outside the shoe (src/card-track.ts MIN_AREA)
  minPiece: 12,    // ... in pieces of at least this many
  apart: 40,       // pieces within this many px of each other are one card
  asLight: 0.75,   // ... when a piece's strongest channel is at least this share of the largest piece's
  reach: 28,       // the rim is looked for this far outside the card's outline (measured 2026-11-23: 4–10 px wide at rest, 13 with
                   // its blends, 20 at a corner and more in motion; at 20 the corner's tip was left on frame 48)
  mark: 16,        // a pink or red mark that lies within this many px of the card's colour and touches it is part of the face,
  markGap: 4,      // ... or begins this near it (the pale ring round the dot in a blurred frame, measured 2–3 px)
  markSize: 30,    // ... when it is at least this many pixels (the dot in motion 40–140; the pink specks in the rim beside it under 10)
  notch: 1.5,      // ... and this far inside it: the steps of a slanting edge lie under the convex outline
  lift: 8,         // paler than the felt: red and blue both this far above the felt's (plain felt lies within 4 of its level)
  dark: 110,       // no channel above this: a sleeve, a tattoo, the shoe; never rim
  warmRG: 12,      // warm (skin, a nail, the yellow back in a finger's shadow, a mark): red this far above green
  warmRB: 8,       // ... and this far above blue
  strong: 120,     // plainly rim (white, grey, bluish; landing-make's isCardLike) with every channel at least this
  light: 200,      // ... or the yellow back's rim, white tinted yellow: red and green both at least this (her finger's edge against
                   // the felt never has both: its green rises as its red falls)
  herThick: 2,     // her skin: warm pixels in a body at least 2 × this + 1 px thick, with their edge this far out (the rim's own
                   // edge in the hand's shadow is tinted warm too, a line 1–2 px thin that runs on from her finger)
  herMin: 60,      // ... hanging together, at least this many (the pink round the red dot is a speck, not her)
  speckPale: 60,   // warm that is not her may be rim when it is pale: its red less than this above its green or blue
  skinGuard: 2,    // a fainter pixel this near her skin is her finger's edge against the felt: it stays
  herEdge: 4,      // her edge against the rim: warm pixels this near it
  herInside: 6,    // ... measured against her colour within this many px that lies further than herEdge from the rim
  herWhole: 0.9,   // ... and left alone when this share or more of the pixel is her
  skirt: 4,        // the felt this near the rim goes with it where the rim has tinted it (its red lifted above the felt's)
  softMost: 0.5,   // the soft edge is at most this share of the card's colour
  smooth: 40,      // the felt carried in is evened out this many times (each pixel the mean of its neighbours of felt)
  still: 8,        // over a film: a painted pixel stays painted while the film's own pixel is within this of the frame before (per channel),
  drift: 24,       // and within this of what it was when the paint was last settled afresh,
  stillNear: 12,   // and only within this many px of what the step changes in that frame (reach + skirt + this stays under 48)
  slew: 6,         // while it stays, the paint moves at most this far per frame towards what the step makes of the frame
  shoeMargin: 3,   // the shoe is kept with this many px round it
  ring: 60,        // the felt's level is read within this many px of the card
};
const C = CARD_RIM;
const warm = (r: number, g: number, b: number) => r - g >= C.warmRG && r - b >= C.warmRB;

/** What is never touched at the shoe: the bank's shoe polygon where the anchor shows something on it (not plain felt), a margin round that, and the whole of its window. */
export function shoeKeep(anchor: Rgb): Uint8Array {
  const body = new Uint8Array(W * H), xs = SHOE_AT_ANCHOR.map((p) => p[0]), ys = SHOE_AT_ANCHOR.map((p) => p[1]);
  for (let y = Math.max(0, Math.min(...ys)); y <= Math.min(H - 1, Math.max(...ys)); y++) for (let x = Math.max(0, Math.min(...xs)); x <= Math.min(W - 1, Math.max(...xs)); x++) {
    const i = y * W + x; if (inPolygon(SHOE_AT_ANCHOR, x + 0.5, y + 0.5) && !isScreen(anchor, i)) body[i] = 1; }
  const keep = growMask(body, C.shoeMargin), [x0, y0, x1, y1] = SHOE_WINDOW;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) keep[y * W + x] = 1;
  return keep;
}

const toSegment = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** painted: pixels of rim that became felt; softEdge: those of them next to the card (part its colour); herEdge: pixels of her edge against the rim, now against the felt. */
export type RimOff = {cards: number; painted: number; softEdge: number; herEdge: number};
/**
 * One frame (RGB, the bank's size), changed in place: the pale rim round the dealt card outside the shoe becomes felt.
 * `keep` marks what is never touched (shoeKeep). A frame without a card outside the shoe, or without a rim, is left as it is.
 */
export function cardRimOff(rgb: Buffer, keep: Uint8Array): RimOff {
  if (rgb.length !== W * H * 3 || keep.length !== W * H) throw Error(`Rutan är inte bankens ${W} × ${H}.`);
  const core = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 3) if (!keep[i] && (is.blue(rgb[p], rgb[p + 1], rgb[p + 2]) || is.yellow(rgb[p], rgb[p + 1], rgb[p + 2]))) core[i] = 1;
  const {labels, parts} = components(core), light = new Float64Array(parts.length);
  for (let i = 0, p = 0; i < W * H; i++, p += 3) if (core[i]) light[labels[i]] += Math.max(rgb[p], rgb[p + 1], rgb[p + 2]);
  const pieces = parts.map((part, id) => ({...part, id, light: light[id] / part.area})).filter((part) => part.area >= C.minPiece).sort((a, b) => b.area - a.area);
  // Pieces near each other are one card, the largest first, when they are as light as it is: a tattoo's shading and the edge of
  // her hand against the felt read as dim yellow or blue too, and one of those taken for the card draws its outline out over
  // her hand (frame 20 of paow-giv-2-3-p3-01: 18 olive pixels on her hand, and the rim's far side was left).
  const near = (p: typeof pieces[number], q: typeof pieces[number]) => Math.max(p.x0 - q.x1, q.x0 - p.x1) <= C.apart && Math.max(p.y0 - q.y1, q.y0 - p.y1) <= C.apart;
  const taken = new Set<number>(), done: RimOff = {cards: 0, painted: 0, softEdge: 0, herEdge: 0};
  for (const main of pieces) {
    if (taken.has(main.id)) continue;
    const mine = [main]; taken.add(main.id);
    for (let grew = true; grew;) { grew = false;
      for (const q of pieces) if (!taken.has(q.id) && q.light >= C.asLight * main.light && mine.some((p) => near(p, q))) { mine.push(q); taken.add(q.id); grew = true; } }
    if (mine.reduce((s, part) => s + part.area, 0) < C.minCard) continue;
    const did = oneCard(rgb, keep, core, labels, new Set(mine.map((part) => part.id)), [Math.min(...mine.map((part) => part.x0)), Math.min(...mine.map((part) => part.y0)), Math.max(...mine.map((part) => part.x1)), Math.max(...mine.map((part) => part.y1))]);
    if (!did.painted) continue;
    done.cards++; done.painted += did.painted; done.softEdge += did.softEdge; done.herEdge += did.herEdge;
  }
  return done;
}

function oneCard(rgb: Buffer, keep: Uint8Array, core: Uint8Array, labels: Int32Array, ids: Set<number>, box: number[]): Omit<RimOff, 'cards'> {
  let [cx0, cy0, cx1, cy1] = box;
  const none = {painted: 0, softEdge: 0, herEdge: 0};
  // The card's outline: the convex outline of its pieces' edge pixels.
  const edge: Pt[] = [];
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const i = y * W + x; if (!ids.has(labels[i])) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !core[i - 1] || !core[i + 1] || !core[i - W] || !core[i + W]) edge.push({x, y}); }
  // The pink cross and the red dot are the face too: a mark at the card's colour lies inside the outline (the dot sits in a
  // corner, and a blurred frame leaves no blue outside it, and a pale ring between it and the blue; with the outline cutting the
  // corner the ring was painted and the dot left alone on the felt, frames 42–48 of paow-giv-2-3-p3-01).
  { const mx0 = Math.max(1, cx0 - C.mark), my0 = Math.max(1, cy0 - C.mark), mw = Math.min(W - 2, cx1 + C.mark) - mx0 + 1, mh = Math.min(H - 2, cy1 + C.mark) - my0 + 1, mark = new Uint8Array(mw * mh), card = new Uint8Array(mw * mh);
    for (let k = 0; k < mw * mh; k++) { const i = (my0 + Math.floor(k / mw)) * W + mx0 + (k % mw); if (core[i]) { if (ids.has(labels[i])) card[k] = 1; } else if (!keep[i] && isCardMark(rgb, i)) mark[k] = 1; }
    const {labels: part, parts: sizes} = components(mark, mw, mh), touching = new Set<number>(), at = growMask(card, 1, mw, mh), beside = growMask(card, C.markGap, mw, mh);
    for (let k = 0; k < mw * mh; k++) if (mark[k] && (at[k] || (beside[k] && sizes[part[k]].area >= C.markSize))) touching.add(part[k]);
    for (let k = 0; k < mw * mh; k++) if (mark[k] && touching.has(part[k])) { const x = mx0 + (k % mw), y = my0 + Math.floor(k / mw); edge.push({x, y});
      cx0 = Math.min(cx0, x); cy0 = Math.min(cy0, y); cx1 = Math.max(cx1, x); cy1 = Math.max(cy1, y); } }
  const outline = hull(edge);
  if (outline.length < 3) return none;
  const margin = C.reach + C.herEdge + C.herInside + 2;
  const x0 = Math.max(0, cx0 - margin), y0 = Math.max(0, cy0 - margin), x1 = Math.min(W - 1, cx1 + margin), y1 = Math.min(H - 1, cy1 + margin), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const gx = Math.max(0, x0 - C.ring), gy = Math.max(0, y0 - C.ring), [fr, fg, fb] = greenOf(rgb, [gx, gy, Math.min(W, x1 + C.ring + 1) - gx, Math.min(H, y1 + C.ring + 1) - gy]);
  if (!fg) return none; // no plain felt near the card: nothing to paint with
  const at = (k: number) => (y0 + Math.floor(k / bw)) * W + x0 + (k % bw);
  const lifted = (i: number) => rgb[i * 3] >= fr + C.lift && rgb[i * 3 + 2] >= fb + C.lift;
  // Where a rim may lie (1), and where it touches the outline (2); her skin; the picture as it came.
  const zone = new Uint8Array(bw * bh), skin = new Uint8Array(bw * bh), before = Buffer.alloc(bw * bh * 3);
  for (let k = 0; k < bw * bh; k++) {
    const i = at(k), x = i % W, y = (i - x) / W, p = i * 3;
    before[k * 3] = rgb[p]; before[k * 3 + 1] = rgb[p + 1]; before[k * 3 + 2] = rgb[p + 2];
    if (!core[i] && warm(rgb[p], rgb[p + 1], rgb[p + 2]) && !isCardMark(rgb, i)) skin[k] = 1;
    if (x < cx0 - C.reach || x > cx1 + C.reach || y < cy0 - C.reach || y > cy1 + C.reach) continue;
    let d = Infinity;
    for (let e = 0; e < outline.length; e++) d = Math.min(d, toSegment(x, y, outline[e], outline[(e + 1) % outline.length]));
    if (d <= (inside(outline, x, y) ? C.notch : C.reach)) zone[k] = d <= 1.5 ? 2 : 1;
  }
  { const thin = growMask(skin.map((v) => v ? 0 : 1), C.herThick, bw, bh), body = growMask(thin.map((v) => v ? 0 : 1), C.herThick, bw, bh);
    for (let k = 0; k < bw * bh; k++) if (!body[k]) skin[k] = 0;
    const {labels: part, parts: sizes} = components(skin, bw, bh); for (let k = 0; k < bw * bh; k++) if (skin[k] && sizes[part[k]].area < C.herMin) skin[k] = 0; }
  const nearSkin = growMask(skin, C.skinGuard, bw, bh);
  const strong = (i: number) => Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) >= C.strong && (isCardLike(rgb, i) || (rgb[i * 3] >= C.light && rgb[i * 3 + 1] >= C.light));
  const kind = new Uint8Array(bw * bh), queue: number[] = [];
  for (let k = 0; k < bw * bh; k++) {
    if (!zone[k]) continue;
    const i = at(k), p = i * 3, r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
    if (core[i] || keep[i] || skin[k] || !lifted(i) || Math.max(r, g, b) < C.dark || isCardMark(rgb, i) || (warm(r, g, b) && r - Math.min(g, b) >= C.speckPale) || (nearSkin[k] && !strong(i))) continue;
    kind[k] = zone[k];
    if (kind[k] === 2) queue.push(k);
  }
  // The rim is what of it hangs together with the outline.
  const rim = new Uint8Array(bw * bh), found: number[] = [];
  const round = (k: number, each: (j: number, straight: boolean) => void) => { const x = k % bw, y = (k - x) / bw;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && yy >= 0 && xx < bw && yy < bh) each(yy * bw + xx, !dx || !dy); } };
  for (const k of queue) rim[k] = 1;
  while (queue.length) { const k = queue.pop()!; found.push(k); round(k, (j) => { if (kind[j] && !rim[j]) { rim[j] = 1; queue.push(j); } }); }
  if (!found.length) return none;
  // The rim's skirt goes with it: the felt right outside the rim is tinted grey by it (and the model draws a dark line there
  // under a card in the air). Left in place it is what the felt carried in is taken from, and the whole band turns as dark and
  // grey as that line: a dark outline where the white one was (frames 41–48 of paow-giv-2-3-p3-01, green 140 against 170 a few
  // px further out). Her finger's own edge against the felt is not skirt.
  for (let turn = 0, layer = found.slice(); turn < C.skirt && layer.length; turn++) { const next: number[] = [];
    for (const k of layer) round(k, (j) => { const i = at(j); if (rim[j] || core[i] || keep[i] || skin[j] || nearSkin[j] || !isScreen(rgb, i) || rgb[i * 3] < fr + C.lift) return; rim[j] = 1; next.push(j); found.push(j); });
    layer = next; }
  // Felt carried in from the felt just outside, a layer at a time: each pixel the mean of its neighbours that are felt already.
  const felt = (j: number) => { const i = at(j); return !rim[j] && !keep[i] && isScreen(rgb, i) && !lifted(i); };
  const filled = new Uint8Array(bw * bh);
  let left = found, painted = 0;
  while (left.length) {
    const next: number[] = [], set: number[][] = [];
    for (const k of left) { let w = 0; const s = [0, 0, 0];
      round(k, (j, straight) => { if (!filled[j] && !felt(j)) return; const i = at(j), v = straight ? 1 : 0.7; w += v; for (let c = 0; c < 3; c++) s[c] += v * rgb[i * 3 + c]; });
      if (w) set.push([k, s[0] / w, s[1] / w, s[2] / w]); else next.push(k); }
    if (!set.length) break; // rim with no felt beside it anywhere (shut in by her hand and the card): left as it is
    for (const [k, r, g, b] of set) { const i = at(k); rgb[i * 3] = byte(r); rgb[i * 3 + 1] = byte(g); rgb[i * 3 + 2] = byte(b); filled[k] = 1; painted++; }
    left = next;
  }
  if (!painted) return none;
  const done = found.filter((k) => filled[k]);
  for (let turn = 0; turn < C.smooth; turn++) {
    const set = done.map((k) => { let w = 0; const s = [0, 0, 0];
      round(k, (j, straight) => { if (!filled[j] && !felt(j)) return; const i = at(j), v = straight ? 1 : 0.7; w += v; for (let c = 0; c < 3; c++) s[c] += v * rgb[i * 3 + c]; });
      return w ? [s[0] / w, s[1] / w, s[2] / w] : null; });
    done.forEach((k, n) => { const v = set[n]; if (!v) return; const i = at(k); for (let c = 0; c < 3; c++) rgb[i * 3 + c] = byte(v[c]); });
  }
  // Felt carried in from the dim edge of her hand can be olive, which is yellow by the lab's rule: its red is held under the rule's.
  for (const k of done) { const p = at(k) * 3; if (is.yellow(rgb[p], rgb[p + 1], rgb[p + 2])) rgb[p] = Math.floor(0.6 * rgb[p + 1]); }
  const feltNow = Buffer.alloc(bw * bh * 3);
  for (const k of done) { const i = at(k); for (let c = 0; c < 3; c++) feltNow[k * 3 + c] = rgb[i * 3 + c]; }
  // A soft edge: the two pixels nearest the card take the card's colour by the share of it in the 5 × 5 round them, at most
  // softMost and never so much that the pixel reads as the card's colour by the lab's rules: the card keeps its size.
  const soft = new Uint8Array(bw * bh);
  let softEdge = 0;
  for (const k of done) { const i = at(k), x = i % W, y = (i - x) / W, card = [0, 0, 0]; let n = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++) { const j = yy * W + xx; if (core[j]) { n++; for (let c = 0; c < 3; c++) card[c] += rgb[j * 3 + c]; } }
    if (!n) continue;
    const mix = (share: number) => [0, 1, 2].map((c) => byte(share * card[c] / n + (1 - share) * rgb[i * 3 + c]));
    let share = Math.min(C.softMost, n / 25), v = mix(share);
    while (share > 0.05 && (is.blue(v[0], v[1], v[2]) || is.yellow(v[0], v[1], v[2]))) v = mix(share /= 2); // yellow over felt in her hand's shadow reads as yellow at half and half
    if (share <= 0.05) continue;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = v[c];
    soft[k] = 1; softEdge++; }
  // Her edge against the rim becomes her edge against the felt.
  const nearRim = growMask(filled, C.herEdge, bw, bh);
  let herEdge = 0;
  for (let k = 0; k < bw * bh; k++) {
    if (!nearRim[k] || filled[k] || !zone[k] || !skin[k] || keep[at(k)]) continue;
    const x = k % bw, y = (k - x) / bw, her = [0, 0, 0], rimWas = [[0, 0, 0], [0, 0, 0]], rimNow = [[0, 0, 0], [0, 0, 0]], rims = [0, 0];
    let hers = 0;
    for (let dy = -C.herInside; dy <= C.herInside; dy++) for (let dx = -C.herInside; dx <= C.herInside; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue; const j = yy * bw + xx;
      if (skin[j] && !nearRim[j]) { hers++; for (let c = 0; c < 3; c++) her[c] += before[j * 3 + c]; }
      // The rim beside it as it was and the felt there now; where the rim is so thin that all of it is soft edge, that is used.
      else if (filled[j] && Math.max(Math.abs(dx), Math.abs(dy)) <= C.herEdge + 1 && Math.min(before[j * 3], before[j * 3 + 1], before[j * 3 + 2]) >= C.strong) { const s = soft[j]; rims[s]++; for (let c = 0; c < 3; c++) { rimWas[s][c] += before[j * 3 + c]; rimNow[s][c] += feltNow[j * 3 + c]; } } }
    const which = rims[0] ? 0 : 1, whites = rims[which], white = rimWas[which], now = rimNow[which];
    if (hers < 3 || !whites) continue;
    const span = [0, 1, 2].map((c) => her[c] / hers - white[c] / whites), length = span.reduce((s, v) => s + v * v, 0);
    if (length < 900) continue; // her colour and the rim's too alike to tell a share
    const share = Math.max(0, Math.min(1, [0, 1, 2].reduce((s, c) => s + (before[k * 3 + c] - white[c] / whites) * span[c], 0) / length));
    if (share >= C.herWhole) continue;
    const i = at(k), v = [0, 1, 2].map((c) => byte(before[k * 3 + c] + (1 - share) * (now[c] - white[c]) / whites));
    if (is.blue(v[0], v[1], v[2]) || is.yellow(v[0], v[1], v[2])) continue; // never a new pixel of the card's colour
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = v[c];
    herEdge++;
  }
  return {painted, softEdge, herEdge};
}

const swap = (from: Uint8Array, to: Uint8Array) => { for (let p = 0; p < from.length; p += 3) { to[p] = from[p + 2]; to[p + 1] = from[p + 1]; to[p + 2] = from[p]; } return to; };
const PAINTED = 1, CARDS = 2;
/**
 * The step over a film, for tools/film-after.ts: fed the frames in order as that tool has them (BGR, the bank's size), each is
 * changed in place; result() is the receipt's part (the frames changed and the pixels painted, per frame too).
 * Where the film stands still the result stands still too. Frame by frame alone the paint flickers on a card at rest, since
 * which pixels are rim is settled at thresholds and under her fingers the felt is carried in from few pixels
 * (paow-giv-2-3-p3-01, frames 58–72: up to 300 pixels round the card changing by more than 24 from one frame to the next, where
 * the film itself has none). So, for as long as the film's own pixel is within CARD_RIM.still of the frame before and within
 * CARD_RIM.drift of what it was when its state was last settled:
 *   - a painted pixel stays painted, and its paint moves at most CARD_RIM.slew per frame towards what the step makes of the frame;
 *   - a pixel that was the card's colour stays the film's own, also in a frame where it falls just short of the lab's rule.
 * (held: the pixels where either changed the outcome.) A pixel that is the card's colour in the frame is never changed, and
 * nothing is held further than CARD_RIM.stillNear from what the step changes in the frame at hand: where the card has moved on
 * the film's own pixels come back (without that, felt painted once beside the card stayed painted along its whole way).
 */
export function rimOffFilm(anchorBgr: Uint8Array) {
  const keep = shoeKeep(swap(anchorBgr, Buffer.alloc(anchorBgr.length)) as Buffer), perFrame: ({frame: number; held: number} & Omit<RimOff, 'cards'>)[] = [];
  const rgb = Buffer.alloc(W * H * 3), came = Buffer.alloc(W * H * 3), cameThen = Buffer.alloc(W * H * 3), cameLast = Buffer.alloc(W * H * 3), made = Buffer.alloc(W * H * 3), has = new Uint8Array(W * H);
  let frames = 0;
  return {
    add(bgr: Uint8Array) {
      swap(bgr, rgb); came.set(rgb);
      const {cards: _, ...did} = cardRimOff(rgb, keep);
      const nowAt = new Uint8Array(W * H);
      let changed = 0, held = 0, any = false;
      for (let i = 0, p = 0; i < W * H; i++, p += 3) if (rgb[p] !== came[p] || rgb[p + 1] !== came[p + 1] || rgb[p + 2] !== came[p + 2]) { nowAt[i] = 1; any = true; }
      const beside = any ? growMask(nowAt, C.stillNear) : nowAt;
      const within = (x: Buffer, y: Buffer, p: number, most: number) => Math.abs(x[p] - y[p]) <= most && Math.abs(x[p + 1] - y[p + 1]) <= most && Math.abs(x[p + 2] - y[p + 2]) <= most;
      for (let i = 0, p = 0; i < W * H; i++, p += 3) {
        const now = nowAt[i] === 1;
        if (is.blue(came[p], came[p + 1], came[p + 2]) || is.yellow(came[p], came[p + 1], came[p + 2])) {
          // The card's colour: the step leaves it as it is and so does this, and it is remembered as the card's.
          for (let c = 0; c < 3; c++) cameThen[p + c] = cameLast[p + c] = came[p + c];
          has[i] = CARDS; if (now) changed++;
          continue;
        }
        if (!now && !has[i]) continue;
        const stands = has[i] !== 0 && beside[i] === 1 && within(came, cameLast, p, C.still) && within(came, cameThen, p, C.drift);
        if (stands && has[i] === CARDS) {
          // The card's colour a moment ago and the film has stood still since: it is left as the film has it, as the card's is.
          if (now) { held++; for (let c = 0; c < 3; c++) rgb[p + c] = came[p + c]; }
          for (let c = 0; c < 3; c++) cameLast[p + c] = came[p + c];
        } else if (stands) {
          // Painted and the film has stood still since: the paint stays, and glides towards what the step makes of this frame.
          const to = [0, 1, 2].map((c) => now ? made[p + c] + Math.max(-C.slew, Math.min(C.slew, rgb[p + c] - made[p + c])) : made[p + c]);
          if (is.blue(to[0], to[1], to[2]) || is.yellow(to[0], to[1], to[2])) for (let c = 0; c < 3; c++) to[c] = made[p + c];
          if (rgb[p] !== to[0] || rgb[p + 1] !== to[1] || rgb[p + 2] !== to[2]) held++;
          for (let c = 0; c < 3; c++) { rgb[p + c] = made[p + c] = to[c]; cameLast[p + c] = came[p + c]; }
          changed++;
        } else if (now) { for (let c = 0; c < 3; c++) { cameThen[p + c] = cameLast[p + c] = came[p + c]; made[p + c] = rgb[p + c]; } has[i] = PAINTED; changed++; }
        else has[i] = 0;
      }
      if (changed) { swap(rgb, bgr); perFrame.push({frame: frames, ...did, held}); }
      frames++;
    },
    result() {
      const sum = (key: 'painted' | 'softEdge' | 'herEdge' | 'held') => perFrame.reduce((s, f) => s + f[key], 0);
      return {what: 'den bleka kanten runt det givna kortet utanför skon målad som filt, ruta för ruta; där filmen står still står resultatet still (tools/card-rim.ts)', frames, framesChanged: perFrame.length,
        firstFrame: perFrame[0]?.frame ?? null, lastFrame: perFrame.at(-1)?.frame ?? null, pixelsPainted: sum('painted'), softEdge: sum('softEdge'), herEdge: sum('herEdge'), held: sum('held'), settings: CARD_RIM, perFrame};
    },
  };
}
