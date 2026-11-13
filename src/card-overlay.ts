// Pure model for the live rendered card over a film: where the card is in a frame, how large it is
// drawn and what the film shows around it. Position, rotation and side come from the card track
// (tools/track-card.ts); size does not: a card has one physical size, taken from the scene contract.
// No DOM, WebGL or file access here. The drawing itself is src/card-overlay-view.ts.
import {classify, morph, blobs, grown, centre, signedArea, inside, clockwise, is, sound, YELLOW, BLUE, SHADE, TINT, TABLE, SKIN, DARK, type Pt, type Side} from './card-track.ts';

// film: where the film's own card is in the frame, when the track draws the card somewhere else than the film has it (a track that
// carries an even card in the grip): what is covered and keyed is then this quad, and quad is only where the card is drawn.
// held: 1 while the card hangs in the hand, 0 once it lies (measured contact); absent, the scene goes by the frames before restFrom.
export type TrackFrame = {frame: number; side: Side; quad: number[][] | null; edge: number[][] | null; confidence?: number; shoeShare?: number; film?: number[][] | null; held?: number};
// hand: false when the track does not hold the card in the hand well enough to draw it there (tools/track-card.ts --no-hand): no
// card object is drawn while it is carried; it comes in over the last EASE frames before it lies, settling from the film's own card
// onto its place (the 3D scene shows the film's card recoloured until then: src/scene3d-deal.ts, carry). drawnFrom: the first frame
// a card is drawn at all, set by a drawing that wants the card only once it lies (the game's "Bara liggande").
export type CardTrack = {clip?: string; width: number; height: number; hand?: boolean; drawnFrom?: number; frames: TrackFrame[]; edgeWindow: [number, number] | null; flips?: {from: number; to: number; quarterTurns: number}[];
  leavesShoe?: number | null; restFrom: number | null; restQuad: number[][] | null; shoeWindow?: {box: number[]} | null};
// toImage/toTable are homographies as eight numbers (the ninth is 1): table millimetres <-> image pixels.
export type Scene = {toImage: number[]; toTable: number[]; cardWidth: number; cardHeight: number; bodyScale: number};
export const RIM = 4; // the film's pale rim and its blur outside the tracked colour core, in pixels
export const SCALE = {min: 1, max: 2.5, fallback: 2};
export const MARGIN = 1.2; // the rendered card is this much larger than the film's card wherever it follows it
export const BESIDE = 12;  // film card colour this close beside the rendered card is cleaned too
export const STRAY = 50;   // a connected patch of the film card's colour of at least this many pixels is a film card, wherever it is
// The largest card a film holds, as the square root of its area in film pixels: 131 in the bank (2026-11-13; the card in the shoe
// window is 80). A tracked quad larger than this is no card and is not drawn (poseAt).
export const HELD_MAX = 180;
// What a drawn card may look like. A card seen by the film camera is a mild perspective of a rectangle: the far side of a card lying
// on the felt is about a tenth narrower than the near one, and the films' own cards keep within about 1.9 (keystone, nine frames in
// ten of the bank's 10 555 flat frames) and 3.2 (sliver, all but one in a thousand). keystone: how many times more the homography that
// lays the card on the quad magnifies at one corner than at another; at 3 the card's contact shadow, which reaches a quarter of a
// card beyond the card, still stays on this side of the homography's line at infinity, beyond which it would be thrown across the
// whole picture. sliver: the longest side against the square root of the area. size: square root of the area, film pixels. edge: the
// longest line an edge-on card is drawn along.
export const PLAUSIBLE = {keystone: 3, sliver: 3.6, size: HELD_MAX, edge: HELD_MAX};
// A frame whose card is not plausible keeps the last plausible pose for at most this many frames; after that no card is drawn.
export const HOLD = 3;
// Frames over which the card settles from the film's card in the hand to its own size and place on the table (poseAt's ease).
export const EASE = 12;
const pts = (q: number[][]): Pt[] => q.map(([x, y]) => ({x, y}));
/**
 * The weights of the homography that carries the unit square onto `q` (texture order), at the square's corners (0,0), (1,0),
 * (1,1), (0,1), scaled so the first is 1: where a weight is twice another, the card is drawn twice as large there. A sound quad
 * has all four positive. `at` gives the weight at any point of the square, for the shadow's skirt outside it.
 */
export function weights(q: readonly Pt[]): {corners: number[]; at(u: number, v: number): number} | null {
  if (q.length !== 4) return null;
  const [a, b, c, d] = q, sx = a.x - b.x + c.x - d.x, sy = a.y - b.y + c.y - d.y, dx1 = b.x - c.x, dx2 = d.x - c.x, dy1 = b.y - c.y, dy2 = d.y - c.y, den = dx1 * dy2 - dx2 * dy1;
  if (!Number.isFinite(den) || Math.abs(den) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den, at = (u: number, v: number) => 1 + g * u + h * v;
  return {corners: [at(0, 0), at(1, 0), at(1, 1), at(0, 1)], at};
}
/** How much more one corner of the card is magnified than another (1: no perspective); Infinity for a quad that is no card. */
export function keystone(q: readonly Pt[]): number { const w = weights(q)?.corners; return w && w.every(v => v > 0) ? Math.max(...w) / Math.min(...w) : Infinity; }
/**
 * Whether a quad can be drawn as a card: sound (one way round, some area), no larger than any card a film holds, not a sliver, and
 * a perspective a card can show (PLAUSIBLE). The night's guard was sound() alone, and a sound quad can still be a trapezoid whose
 * far side is a fifth of its near one (Paow's hole card under her hand, paow-giv-2-1-d-c2-03-01 frames 52-56): the card itself is
 * then drawn as a long wedge, and its shadow through infinity.
 */
export function plausible(q: readonly Pt[] | null | undefined, largest: number = PLAUSIBLE.size): boolean {
  if (!q || !sound(q)) return false;
  const root = Math.sqrt(Math.abs(signedArea(q as Pt[]))), longest = Math.max(...q.map((p, i) => Math.hypot(p.x - q[(i + 1) % 4].x, p.y - q[(i + 1) % 4].y)));
  return root <= largest && longest <= PLAUSIBLE.sliver * root && keystone(q) <= PLAUSIBLE.keystone;
}
/**
 * Whether a card's contact shadow, which reaches `reach` of the card beyond its edges (scene3d-deal.ts REACH), can be laid by the
 * card's homography: the skirt must stay well on this side of the line at infinity (no weight there below `least` of the largest
 * corner's), or the shadow is thrown across the picture.
 */
export function skirtSound(q: readonly Pt[], reach: number, least = 0.3): boolean {
  const w = weights(q); if (!w || !w.corners.every(v => v > 0)) return false;
  const top = Math.max(...w.corners), lo = -reach, hi = 1 + reach;
  return [w.at(lo, lo), w.at(hi, lo), w.at(hi, hi), w.at(lo, hi)].every(v => v >= least * top);
}
/** Whether an edge-on card's line can be drawn: finite, and no longer than a card. */
export const plausibleEdge = (line: readonly Pt[] | null | undefined): boolean => !!line && line.length === 2 && line.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) && Math.hypot(line[1].x - line[0].x, line[1].y - line[0].y) <= PLAUSIBLE.edge;
const apply = (h: number[], p: Pt): Pt => { const w = h[6] * p.x + h[7] * p.y + 1; return {x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w}; };
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const size = (q: Pt[]) => Math.sqrt(Math.abs(signedArea(q)));
const about = (q: Pt[], s: number): Pt[] => { const c = centre(q); return q.map(p => ({x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s})); };
const mix = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => ({x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t}));

/** What the overlay needs from data/scene-contract.json, or null if the contract is not what it expects. */
export function sceneOf(contract: unknown): Scene | null {
  const c = contract as {keyFigures?: {homographyTableMmToImagePx?: {matrix?: number[][]}}; cardMillimetres?: {width?: number; height?: number}; cardSizeAtTargets?: {scale?: {bodyScale?: {k?: number}}}};
  const m = c?.keyFigures?.homographyTableMmToImagePx?.matrix, width = c?.cardMillimetres?.width, height = c?.cardMillimetres?.height, k = c?.cardSizeAtTargets?.scale?.bodyScale?.k;
  if (!Array.isArray(m) || m.length !== 3 || m.some(row => !Array.isArray(row) || row.length !== 3 || row.some(v => !Number.isFinite(v))) || !Number.isFinite(width) || !Number.isFinite(height) || !(width! > 0) || !(height! > 0)) return null;
  const [[a, b, cc], [d, e, f], [g, h, i]] = m, det = a * (e * i - f * h) - b * (d * i - f * g) + cc * (d * h - e * g);
  if (!i || Math.abs(det) < 1e-12) return null;
  const inv = [e * i - f * h, cc * h - b * i, b * f - cc * e, f * g - d * i, a * i - cc * g, cc * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  return {toImage: [a, b, cc, d, e, f, g, h].map(v => v / i), toTable: inv.slice(0, 8).map(v => v / inv[8]), cardWidth: width!, cardHeight: height!,
    bodyScale: Number.isFinite(k) && k! >= SCALE.min && k! <= SCALE.max ? k! : SCALE.fallback};
}

/**
 * The card lying on the table at the film card's place and direction, but in its own constant size:
 * `scale` times the contract's card. `film` is the film's resting quad in texture order (top left,
 * top right, bottom right, bottom left). `turned` reports the quarter-turn correction: the tracker
 * takes the more horizontal sides of a foreshortened card as top and bottom, so a card that really
 * lies sideways arrives a quarter turn off, and is turned back here so the footprint is covered.
 */
export function restingQuad(scene: Scene, film: Pt[], scale: number): {quad: Pt[]; turned: boolean} {
  const t = film.map(p => apply(scene.toTable, p)), c = centre(t), mid = (a: Pt, b: Pt): Pt => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
  let up = {x: mid(t[0], t[1]).x - mid(t[3], t[2]).x, y: mid(t[0], t[1]).y - mid(t[3], t[2]).y}, right = {x: mid(t[1], t[2]).x - mid(t[0], t[3]).x, y: mid(t[1], t[2]).y - mid(t[0], t[3]).y};
  const turned = Math.hypot(right.x, right.y) > 1.15 * Math.hypot(up.x, up.y);
  if (turned) [up, right] = [right, {x: -up.x, y: -up.y}]; // the long way becomes the card's height
  const l = Math.hypot(up.x, up.y) || 1, u = {x: up.x / l, y: up.y / l}, side = right.x * -u.y + right.y * u.x >= 0 ? 1 : -1, r = {x: -u.y * side, y: u.x * side};
  const hw = scene.cardWidth * scale / 2, hh = scene.cardHeight * scale / 2;
  const corner = (a: number, b: number) => apply(scene.toImage, {x: c.x + u.x * hh * a + r.x * hw * b, y: c.y + u.y * hh * a + r.y * hw * b});
  return {quad: [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)], turned};
}

/**
 * Where the card lies still, and from which frame. The track says so when the hand lets go inside
 * the clip. A deal that ends at the landing, fingertip still on the card, has no such stretch: there
 * the card's place in the last frame stands in, so the size has settled when the clip is cut to its return.
 */
export function restOf(track: CardTrack): {from: number; quad: Pt[]; assumed: boolean} | null {
  if (track.restFrom !== null && track.restQuad?.length === 4) { const quad = pts(track.restQuad), c = centre(quad), reach = 0.35 * size(quad), side = track.frames[track.restFrom]?.side;
    // A return starts with the card already lying there, a finger still on it: it rests from the first frame, so nothing changes size at the cut from the deal.
    const lying = track.frames.slice(0, track.restFrom).every(f => f.side === side && f.quad?.length === 4 && Math.hypot(centre(pts(f.quad)).x - c.x, centre(pts(f.quad)).y - c.y) < reach);
    return {from: lying ? 0 : track.restFrom, quad, assumed: false}; }
  const last = track.frames[track.frames.length - 1];
  if (!last || last.quad?.length !== 4 || last.side !== 'FRONT' && last.side !== 'BACK' || track.frames.length < 2) return null;
  // A card that is face up at the end of a clip has been laid down; a card that never turned and never rested is still in the hand.
  if (!track.frames.some(f => f.side !== last.side && f.side !== 'NONE')) return null;
  return {from: last.frame, quad: pts(last.quad), assumed: true};
}

export type Pose = {
  frame: number; side: Side;
  quad: Pt[] | null;      // where the rendered card is drawn, in texture order
  edge: [Pt, Pt] | null;  // edge-on frames: the line the thin edge is drawn along
  film: Pt[] | null;      // the film's own card in this frame, rim included: what must be covered
  resting: number;        // 0 in the hand, 1 lying still; in between while the size settles
  turned: boolean;
  at?: [Pt, Pt] | null;   // edge-on frames of a shifted card: where the film's own edge is, which is what must be covered
  kept?: number;          // set when this is an earlier frame's pose kept for frame `kept`, whose own card was not plausible
};
/**
 * The rendered card in one frame. In the hand it follows the film's quad. From `restFrom` on it is
 * the constant-size card on the table. Over the last `ease` frames before that its size moves
 * smoothly to the resting size instead of following the film, which draws the card large in the
 * hand and shrinks it in the last two frames; the shape settles over the last three.
 * Whatever the data, what is drawn is a plausible card (plausible, plausibleEdge): a frame whose card is not keeps the last
 * plausible pose of the same side for at most HOLD frames (`kept` says so), and after that draws nothing.
 */
export function poseAt(track: CardTrack, scene: Scene | null, frame: number, scale: number, ease = EASE, shift: {x: number; y: number} | null = null, land: Pt[] | null = null): Pose | null {
  const at = Math.max(0, Math.min(track.frames.length - 1, Math.round(frame))), pose = rawPose(track, scene, at, scale, ease, shift, land);
  if (!pose || (pose !== BAD && drawable(pose))) return pose;
  const f = track.frames[at];
  for (let back = 1; back <= HOLD && at - back >= 0; back++) { const kept = rawPose(track, scene, at - back, scale, ease, shift, land);
    if (kept && kept !== BAD && kept.side === f.side && (kept.quad || kept.edge) && drawable(kept)) return {...kept, kept: at}; }
  return {frame: at, side: f.side, quad: null, edge: null, film: null, resting: 0, turned: false};
}
const drawable = (p: Pose) => (!p.quad || plausible(p.quad)) && (!p.edge || plausibleEdge(p.edge));
// rawPose's answer for a frame whose tracked card is no card at all: poseAt keeps an earlier pose for it, or draws nothing.
const BAD: Pose = {frame: -1, side: 'NONE', quad: null, edge: null, film: null, resting: 0, turned: false};
function rawPose(track: CardTrack, scene: Scene | null, at: number, scale: number, ease: number, shift: {x: number; y: number} | null, land: Pt[] | null): Pose | null {
  const f = track.frames[at];
  if (!f) return null;
  const none: Pose = {frame: at, side: f.side, quad: null, edge: null, film: null, resting: 0, turned: false};
  const landed = restOf(track);
  if (at < firstDrawn(track)) return none; // not drawn in the hand: see CardTrack.hand and drawnFrom
  const goal = land?.length === 4 && landed ? sameStart(land, landed.quad) : null;
  // The film's card is only a marker. Where the rendered card must end is the plan's place (land), or the place of the seat's
  // second card (shift). Either way the move grows from nothing at the shoe to all of it at the landing, so the card never jumps.
  const d = goal ? {x: centre(goal).x - centre(landed!.quad).x, y: centre(goal).y - centre(landed!.quad).y} : shift ?? {x: 0, y: 0};
  const k = d.x || d.y ? shiftShare(track, at) : 0, move = (p: Pt): Pt => ({x: p.x + d.x * k, y: p.y + d.y * k});
  if (f.side === 'EDGE' && f.edge?.length === 2) { const line: [Pt, Pt] = [{x: f.edge[0][0], y: f.edge[0][1]}, {x: f.edge[1][0], y: f.edge[1][1]}];
    return k ? {...none, edge: [move(line[0]), move(line[1])], at: line} : {...none, edge: line}; }
  if ((f.side !== 'BACK' && f.side !== 'FRONT') || f.quad?.length !== 4) return none;
  const film = grown(pts(f.film?.length === 4 ? f.film : f.quad), RIM);
  // At rest it is the constant-size card on the table: at the plan's place and direction, else where the film laid it (moved by the
  // shift). Its shape is the table's, whatever the film's card looks like under the hand.
  const from = landed?.from ?? Infinity, rest = landed ? goal ?? landed.quad.map(p => ({x: p.x + d.x, y: p.y + d.y})) : null;
  const still = rest ? scene ? restingQuad(scene, rest, scale) : {quad: about(grown(rest, RIM), scale), turned: false} : null;
  if (still && at >= from) return {...none, quad: still.quad, film, resting: 1, turned: still.turned};
  // A quad in the hand that is no card (crossed, folded, empty, larger than any card a film holds, a sliver or a wedge: plausible)
  // is not drawn: one bad quad must never smear the card across the picture.
  // The size only starts to settle once the card shows the side it will lie on.
  let start = Math.max(0, from - ease); if (still) for (let i = from - 1; i >= start; i--) if (track.frames[i].side !== track.frames[from].side || !track.frames[i].quad) { start = i + 1; break; }
  // While it settles, a frame whose card is no card (the card slid in under the hand, its tracked quad a wedge: Paow's hole card,
  // paow-giv-2-1-d-c2-03-01 frames 50-56) settles on from the shape of the last plausible card before it, at this frame's place (the
  // wedge's middle is still where the hand has the card), so the card goes on with the hand to its place.
  let source = pts(f.quad);
  if (!plausible(source)) { if (!still || at < start) return BAD;
    let j = at - 1; while (j >= Math.max(0, start - HOLD) && !(track.frames[j].side === f.side && track.frames[j].quad?.length === 4 && plausible(pts(track.frames[j].quad!)))) j--;
    if (j < Math.max(0, start - HOLD)) return BAD;
    const shape = pts(track.frames[j].quad!), c = centre(shape), here = centre(source); source = shape.map(p => ({x: p.x + here.x - c.x, y: p.y + here.y - c.y})); }
  // In the hand the rendered card is the film's card and a margin more, so the film's card and its rim never show beside it.
  const held = about(source, MARGIN);
  if (!still) return {...none, quad: held.map(move), film};
  const t = at < start ? 0 : smooth((at - start + 1) / (from - start + 1)), shape = smooth((at - (from - 4)) / 4);
  const order = still.turned ? [held[1], held[2], held[3], held[0]] : held, settled = about(order, 1 + (size(still.quad) / (size(order) || 1) - 1) * t).map(move);
  return {...none, quad: mix(settled, still.quad, shape), film, resting: t, turned: still.turned};
}
// The plan's quad, begun at the corner that lies nearest the film card's first corner and running the same way round: the
// rendered card ends in the plan's direction without spinning on its way there.
function sameStart(plan: Pt[], film: Pt[]): Pt[] {
  const way = signedArea(plan) * signedArea(film) < 0 ? [plan[0], plan[3], plan[2], plan[1]] : plan, a = centre(way), b = centre(film); let best = way, least = Infinity;
  for (let turn = 0; turn < 4; turn++) { const q = way.map((_, i) => way[(i + turn) % 4]), off = q.reduce((sum, p, i) => sum + Math.hypot(p.x - a.x - film[i].x + b.x, p.y - a.y - film[i].y + b.y), 0); if (off < least) { least = off; best = q; } }
  return best;
}
/** The first frame a card is drawn: drawnFrom when it is set; for a track not drawn in the hand, EASE frames before it lies (never, if it does not lie); else the first. */
export function firstDrawn(track: CardTrack): number {
  if (typeof track.drawnFrom === 'number') return track.drawnFrom;
  if (track.hand !== false) return -Infinity;
  const rest = restOf(track); return rest ? rest.from - EASE : Infinity;
}
/** How much of a move applies in a frame: none while the card sits in the shoe, all of it once it lies; in between it grows smoothly while the card is carried. */
export function shiftShare(track: CardTrack, frame: number): number {
  const rest = restOf(track), to = rest ? rest.from : track.frames.length - 1, from = Math.min(to, Math.max(0, track.leavesShoe ?? 0, firstDrawn(track)));
  return frame >= to ? 1 : frame <= from ? 0 : smooth((frame - from) / (to - from));
}
/** Where a film leaves its card lying, for the films that follow it in a round: the resting card, at the plan's place or moved with its step's shift. */
export function placedCard(track: CardTrack, scene: Scene | null, scale: number, shift: {x: number; y: number} | null = null, land: Pt[] | null = null): {quad: Pt[]; side: Side} | null {
  if (!restOf(track)) return null;
  const pose = poseAt(track, scene, track.frames.length - 1, scale, 12, shift, land);
  return pose?.quad ? {quad: pose.quad, side: pose.side} : null;
}
/** How far beside the plan a film lays its card, and the Kortskala at which the rendered card is a margin larger than the film's resting card. */
export function landing(track: CardTrack, scene: Scene | null, land: Pt[] | null): {off: number | null; filmSize: number; planSize: number | null; scaleNeeded: number | null} | null {
  const rest = restOf(track);
  if (!rest) return null;
  const filmSize = size(rest.quad), planSize = scene ? size(restingQuad(scene, rest.quad, 1).quad) : null;
  return {off: land?.length === 4 ? Math.hypot(centre(land).x - centre(rest.quad).x, centre(land).y - centre(rest.quad).y) : null, filmSize, planSize, scaleNeeded: planSize ? MARGIN * filmSize / planSize : null};
}
/**
 * Film card pixels that would still show with the rendered card drawn: the tracker's own yellow and blue, outside the boxes to
 * ignore (the shoe window), not under or right beside the rendered card, not in the cleaned zone around the film's own card and
 * not in a patch of card size, which the overlay paints over wherever it lies.
 * The mask is opened by one step first, so a one-pixel fringe along a finger is not counted as card.
 */
export function leakCount(rgb: Uint8Array, width: number, height: number, pose: Pose | null, ignore: number[][] = []): number {
  const n = width * height, mask = new Uint8Array(n); let any = false;
  const near = pose ? filmZone(pose) : null, wide = pose?.quad ? grown(clockwise(pose.quad), BESIDE) : null;
  for (let i = 0, j = 0; i < n; i++, j += 3) { const r = rgb[j], g = rgb[j + 1], b = rgb[j + 2];
    if (!is.yellow(r, g, b) && !is.blue(r, g, b)) continue;
    const x = i % width, y = (i - x) / width;
    if (ignore.some(box => x >= box[0] - 8 && x <= box[2] + 8 && y >= box[1] - 8 && y <= box[3] + 8)) continue;
    if (near?.(x + 0.5, y + 0.5) || (wide && inside(wide, x + 0.5, y + 0.5))) continue;
    mask[i] = 1; any = true; }
  if (!any) return 0;
  // Patches of card size are painted over by the overlay wherever they are (strayBoxes); what can still show is what is smaller.
  for (const blob of blobs(mask, width, height, STRAY)) for (let k = 0; k < blob.pixels.length; k++) mask[blob.pixels[k]] = 0;
  const solid = morph(mask, width, height, 1, false); let count = 0;
  for (let i = 0; i < n; i++) count += solid[i];
  return count;
}
/**
 * The film's card is only a marker, and so is every other card the film shows: a card lying since an earlier deal, or a card the
 * track lost for a few frames. Every connected patch of the card colours of at least `min` pixels, outside the boxes to ignore
 * (the shoe window), is found here as a box; the overlay paints each with the background around it. `step` is the scale of the
 * picture given (2 for a half-size frame); boxes come back in full-size pixels, with room for the card's rim.
 */
export function strayBoxes(rgba: ArrayLike<number>, width: number, height: number, ignore: number[][] = [], step = 1, min = STRAY, room = 10): Box[] {
  const mask = new Uint8Array(width * height); let any = false;
  for (let i = 0, j = 0; i < width * height; i++, j += 4) { const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
    if (!is.yellow(r, g, b) && !is.blue(r, g, b)) continue;
    const x = (i % width) * step, y = ((i - i % width) / width) * step;
    if (ignore.some(box => x >= box[0] - 8 && x <= box[2] + 8 && y >= box[1] - 8 && y <= box[3] + 8)) continue;
    mask[i] = 1; any = true; }
  if (!any) return [];
  return blobs(mask, width, height, Math.max(1, Math.round(min / (step * step)))).map(blob => { const x = Math.max(0, blob.x0 * step - room), y = Math.max(0, blob.y0 * step - room);
    return {x, y, width: (Math.min(width * step, (blob.x1 + 1) * step + room) - x) & ~1, height: (Math.min(height * step, (blob.y1 + 1) * step + room) - y) & ~1}; }).filter(box => box.width > 1 && box.height > 1);
}
/** Frame ranges out of a list of frame numbers: [61, 62, 63, 70] -> [[61, 63], [70, 70]]. */
export const ranges = (frames: number[]): [number, number][] => frames.reduce((out: [number, number][], f) => { const last = out[out.length - 1]; if (last && f === last[1] + 1) last[1] = f; else out.push([f, f]); return out; }, []);

/** Corners of the model card (width x height, y up, centred) and the eight numbers that carry them onto `quad`. */
export function cardToImage(quad: Pt[], width: number, height: number): number[] {
  const from = [{x: -width / 2, y: height / 2}, {x: width / 2, y: height / 2}, {x: width / 2, y: -height / 2}, {x: -width / 2, y: -height / 2}], A: number[][] = [];
  for (let i = 0; i < 4; i++) { const {x, y} = from[i], {x: u, y: v} = quad[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) throw Error('Degenerate card quad.');
    for (let r = 0; r < 8; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j < 9; j++) A[r][j] -= k * A[c][j]; } }
  return A.map((row, i) => row[8] / row[i]);
}
/**
 * A projection matrix (row major) that puts the model's x and y exactly where the homography `h`
 * puts them in a `width` x `height` image, whatever z they have. Depth is all but flattened (the
 * card is one surface a few units in front of the eye); the small z term only keeps the matrix invertible.
 */
export function projectionOf(h: number[], width: number, height: number): number[] {
  return [2 * h[0] / width - h[6], 2 * h[1] / width - h[7], 0, 2 * h[2] / width - 1,
    h[6] - 2 * h[3] / height, h[7] - 2 * h[4] / height, 0, 1 - 2 * h[5] / height,
    0, 0, -0.001, 0,
    h[6], h[7], 0, 1];
}

export type Box = {x: number; y: number; width: number; height: number};
/** The whole-pixel region of the film that a pose touches, with room for blur and fingers around it. */
export function regionOf(pose: Pose, width: number, height: number, margin = 26): Box | null {
  const points = [...(pose.quad ?? []), ...(pose.film ?? []), ...(pose.edge ?? []), ...(pose.at ?? [])];
  if (!points.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...points.map(p => p.x)) - margin)), y0 = Math.max(0, Math.floor(Math.min(...points.map(p => p.y)) - margin));
  const x1 = Math.min(width, Math.ceil(Math.max(...points.map(p => p.x)) + margin)), y1 = Math.min(height, Math.ceil(Math.max(...points.map(p => p.y)) + margin));
  return x1 - x0 < 2 || y1 - y0 < 2 ? null : {x: x0, y: y0, width: (x1 - x0) & ~1, height: (y1 - y0) & ~1};
}

export type Matte = {width: number; height: number; hand: Uint8Array; firm: Uint8Array; card: Uint8Array; ground: [number, number, number]; field: {width: number; height: number; cell: number; rgb: Uint8Array}};
/**
 * Reads one film region (RGBA at full size) with the tracker's own colour rules.
 * hand: skin and the dark sleeve, small holes closed and thin lines (a skin-toned card rim) dropped;
 * these stay in front of the card. firm: the hand without anything narrower than a finger; along the
 * border of the film's card a skin-coloured band that is not firm is the card's own pale rim. card: every pixel that carries the film card's colour, two steps
 * wider for its blur. field: what lies behind the film's card, in cells of `cell` pixels: the mean of
 * everything that is neither card nor skin, carried inwards from the nearest such cells. Whatever of
 * the film's card the rendered card does not cover is painted from it, so table stays table and a
 * card held in front of the jacket leaves jacket behind. ground is the mean table colour of the region.
 * `own` says which pixels lie on the film's own card: there only skin is hand, since a dark pixel on the
 * card is its face in finger shadow, not the sleeve. Dark green is table in a finger's shadow and is
 * never hand: kept in front it would lie as a green strip on a white card.
 */
export function readMatte(rgba: ArrayLike<number>, width: number, height: number, own?: (x: number, y: number) => boolean, cell = 4): Matte {
  const n = width * height, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2]; }
  const cls = classify(rgb, n), raw = new Uint8Array(n), film = new Uint8Array(n), sum = [0, 0, 0]; let table = 0;
  for (let i = 0; i < n; i++) { const c = cls[i], r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    // Blue mixed into its surroundings, or a blue face in finger shadow, is still card: it is tested before the dark rule.
    if (c === YELLOW || c === BLUE || c === SHADE || c === TINT || (b > r + 40 && b > 0.6 * g)) film[i] = 1;
    else if (c === SKIN) raw[i] = 1;
    else if (c === DARK) { if (g > r + 15 && g > b + 15) continue; // table in deep shadow beside a finger: background, not sleeve
      if (own?.(i % width, (i - i % width) / width)) film[i] = 1; else raw[i] = 1; }
    else if (c === TABLE) { sum[0] += r; sum[1] += g; sum[2] += b; table++; }
    else if (r > 170 && g > 150 && g > b + 25 && r >= g - 10) film[i] = 1; } // the pale cream rim of the yellow back, which no tracker class names
  const hand = morph(morph(morph(morph(raw, width, height, 2, true), width, height, 2, false), width, height, 1, false), width, height, 1, true), card = morph(film, width, height, 2, true);
  const ground: [number, number, number] = table ? [Math.round(sum[0] / table), Math.round(sum[1] / table), Math.round(sum[2] / table)] : [20, 150, 60];
  // The background field: per cell the mean of what is surely background, then filled inwards cell by cell.
  const fw = Math.ceil(width / cell), fh = Math.ceil(height / cell), acc = new Float64Array(fw * fh * 3), count = new Uint32Array(fw * fh);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * width + x; if (card[i] || cls[i] === SKIN) continue;
    const k = Math.floor(y / cell) * fw + Math.floor(x / cell); acc[k * 3] += rgb[i * 3]; acc[k * 3 + 1] += rgb[i * 3 + 1]; acc[k * 3 + 2] += rgb[i * 3 + 2]; count[k]++; }
  const out = new Uint8Array(fw * fh * 3), known = new Uint8Array(fw * fh); let open = 0;
  for (let k = 0; k < fw * fh; k++) { if (count[k] >= cell) { known[k] = 1; for (let c = 0; c < 3; c++) out[k * 3 + c] = Math.round(acc[k * 3 + c] / count[k]); } else open++; }
  for (let pass = 0; open && pass < fw + fh; pass++) { const next: number[] = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const k = y * fw + x; if (known[k]) continue; let r = 0, g = 0, b = 0, m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy, j = yy * fw + xx; if (xx < 0 || yy < 0 || xx >= fw || yy >= fh || !known[j]) continue; r += out[j * 3]; g += out[j * 3 + 1]; b += out[j * 3 + 2]; m++; }
      if (m) next.push(k, Math.round(r / m), Math.round(g / m), Math.round(b / m)); }
    if (!next.length) break;
    for (let i = 0; i < next.length; i += 4) { const k = next[i]; known[k] = 1; out[k * 3] = next[i + 1]; out[k * 3 + 1] = next[i + 2]; out[k * 3 + 2] = next[i + 3]; open--; } }
  if (open) for (let k = 0; k < fw * fh; k++) if (!known[k]) { out[k * 3] = ground[0]; out[k * 3 + 1] = ground[1]; out[k * 3 + 2] = ground[2]; }
  return {width, height, hand, firm: morph(morph(hand, width, height, 4, false), width, height, 4, true), card, ground, field: {width: fw, height: fh, cell, rgb: out}};
}
/** Whether an image point lies where the film's own card can show in this frame: its quad or its edge line, with room for motion blur. */
export function filmZone(pose: Pose, margin?: number): (x: number, y: number) => boolean {
  if (pose.film) { const q = clockwise(pose.film), reach = grown(q, margin ?? 10 + 0.12 * Math.sqrt(Math.abs(signedArea(q)))); return (x, y) => inside(reach, x, y); }
  if (pose.edge) { const [a, b] = pose.at ?? pose.edge, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, reach = margin ?? 16;
    return (x, y) => { const t = Math.max(-0.15, Math.min(1.15, ((x - a.x) * dx + (y - a.y) * dy) / l2)); return Math.hypot(x - a.x - dx * t, y - a.y - dy * t) <= reach; }; }
  return () => false;
}

// ── A value per card ────────────────────────────────────────────────────────
// One record per dealt card, the same fields all the way from the game engine's deal event. shoeDraw is the draw number in the
// shoe and the card's identity; target is where it lies; faceDown means the back is shown whatever the film's side says (the
// dealer's hole card), and such a card may come without rank and suit.
export type CardRecord = {shoeDraw: number; target: string; r?: string | null; s?: string | null; faceDown?: boolean};
// The values the card material study can print (materials/source/src/card-material-study.ts: RANKS and SUITS). Kept here as
// well because this module also runs where the study cannot be loaded; the view checks that the two lists agree.
export const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const CARD_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type CardArt = {rank: typeof CARD_RANKS[number]; suit: typeof CARD_SUITS[number]};
/** The record of one card: by its draw number when that is known, else the latest card dealt to the target (the highest draw number). */
export function cardRecord(cards: CardRecord[] | null | undefined, which: {shoeDraw?: number | null; target?: string | null}): CardRecord | null {
  const list = Array.isArray(cards) ? cards.filter(c => c && Number.isFinite(c.shoeDraw) && typeof c.target === 'string') : [];
  if (which.shoeDraw != null) return list.find(c => c.shoeDraw === which.shoeDraw) ?? null;
  return which.target ? list.filter(c => c.target === which.target).sort((a, b) => b.shoeDraw - a.shoeDraw)[0] ?? null : null;
}
/**
 * What one card shows. Face-down wins over the film: the back, whatever side the film has. Otherwise the side is the film's, and
 * the face is the record's rank and suit; a card without a record, or with values the study cannot print, keeps the artwork
 * given as fallback (`own` is then false).
 */
export function cardFace(record: CardRecord | null, back: boolean, fallback: CardArt): {art: CardArt; back: boolean; own: boolean} {
  const rank = String(record?.r ?? '').trim().toUpperCase(), suit = String(record?.s ?? '').trim().toLowerCase();
  const known = (CARD_RANKS as readonly string[]).includes(rank) && (CARD_SUITS as readonly string[]).includes(suit);
  return {art: known ? {rank, suit} as CardArt : fallback, back: record?.faceDown === true || back, own: known};
}

export type Override = {from: number; to: number; note: string};
/** Frame ranges where the card is drawn in front of the hand: {"cardInFront": [{"from": 72, "to": 78, "note": "..."}]}. Anything malformed is left out. */
export function overridesOf(value: unknown): Override[] {
  const list = (value as {cardInFront?: unknown})?.cardInFront;
  return (Array.isArray(list) ? list : []).flatMap((item): Override[] => { const from = Number(item?.from), to = Number(item?.to);
    return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from ? [{from, to, note: typeof item.note === 'string' ? item.note : ''}] : []; });
}
export const cardInFront = (overrides: Override[], frame: number) => overrides.some(o => frame >= o.from && frame <= o.to);

/** One line about a track for the take detail: sides, the edge-on moment, the quarter turns there and where the card comes to rest. */
export function describeTrack(track: CardTrack): string {
  const runs: string[] = []; let open: {side: Side; from: number; to: number} | null = null;
  for (const f of track.frames) { if (open && open.side === f.side) open.to = f.frame; else { if (open) runs.push(`${open.side} ${open.from}–${open.to}`); open = {side: f.side, from: f.frame, to: f.frame}; } }
  if (open) runs.push(`${open.side} ${open.from}–${open.to}`);
  const turns = (track.flips ?? []).filter(flip => flip.quarterTurns).map(flip => `sätts om ${flip.quarterTurns} kvartsvarv vid ruta ${flip.from}–${flip.to}`);
  const unsure = track.frames.filter(f => f.side !== 'NONE' && (f.confidence ?? 1) < 0.6).length;
  const rest = restOf(track);
  return [runs.join(' · '), ...turns, !rest ? 'kortet kommer aldrig till vila i spåret' : rest.assumed ? `vilar inte i klippet, sista rutan ${rest.from} får gälla` : `vilar från ruta ${rest.from}`, ...(unsure ? [`${unsure} osäkra rutor`] : [])].join(' · ');
}
