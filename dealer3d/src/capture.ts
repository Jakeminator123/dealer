// A real deal laid into the room: the hands and the body MediaPipe read off a film (tools/python/landmarks.py), put
// under the table's lens point by point, and the film's own card with its held end at her fingers. Pure: no I/O and no
// three.js. Every joint is then a person's own, and the same deal can be looked at from any seat.
//
// Measured, in every frame: where each of a hand's 21 points falls in the picture (each point is kept on the line of
// sight through its own pixel, so from the bank's camera the hand lies on the film's hand), how the hand is turned and
// how its fingers are bent (MediaPipe's hand in metres, which gives each point's depth against the wrist), where
// shoulders, elbows and ears are in the picture, and the card's four corners and the side the camera sees (the film's
// card track).
// Modelled: how far away the dealing wrist is. It is fixed at both ends by what the hand touches (the card standing in
// the shoe at the start, the felt under the fingertips when the card is laid) and carried smoothly between; the resting
// hand lies on the felt throughout, and how large it is drawn there gives the size of both hands. Also: her shoulders
// move on a sphere about her hip, her arm's two bones have fixed lengths (stretched only if the wrist is out of reach),
// and which way the card leans in depth (what is higher in the picture is farther away). MediaPipe's depth for fingers
// that hide each other is its own guess; it was tried and found too unsteady to say which face of the card the thumb is
// on, which is why the card's turning is the track's and not the hand's.
import {CARD, FILM, add, cross, dot, filmEye, length, mul, onPlane, onUpright, see, sub, unit, type Lens, type Pixel, type Vec3} from './camera.ts';
import {ASSUMED, dealerEdge, shoeCard, shoePose} from './world.ts';
import {BODY, solveBody, standing, turned} from './body.ts';
import {HAND, type CardPose} from './deal.ts';

export type HandMarks = {image: number[][]; world: number[][]; score: number};
export type PoseMarks = {image: number[][]; world: number[][]};
export type Landmarks = {film: string; fps: number; frameCount: number; frames: {i: number; hands: {L?: HandMarks; R?: HandMarks}; pose: PoseMarks | null}[]};
export type Track = {leavesShoe: number | null; restFrom: number | null; restQuad: number[][] | null; edgeWindow: number[] | null; frames: {frame: number; side: string; quad: number[][] | null; edge: number[][] | null}[]};
export type ArmPose = {shoulder: Vec3; elbow: Vec3; wrist: Vec3; stretch: number; points: Vec3[]};
/** One frame of a performance: the card, her left arm and hand (the dealing one, at image right), her right, and her head. */
export type Moment = {card: CardPose; L: ArmPose; R: ArmPose; head: Vec3; hip: Vec3};
export type Performance = {film: string; fps: number; frameCount: number; leavesShoe: number; edge: [number, number]; folds: number; rests: number; handSize: {L: number; R: number}; palm: number; moments: Moment[]};

const CX = (FILM.width - 1) / 2, CY = (FILM.height - 1) / 2;
export const TIPS = [4, 8, 12, 16, 20], KNUCKLES = [5, 9, 13, 17];
export const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]; // thumb to little finger, from the palm outward
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

/** The film camera's own axes in the world, and the line of sight through a pixel as a direction with one metre of depth. */
function camera(lens: Lens) {
  const c = Math.cos(lens.pitch), s = Math.sin(lens.pitch), pos: Vec3 = [0, lens.height, 0], right: Vec3 = [1, 0, 0], down: Vec3 = [0, -c, s], forward: Vec3 = [0, -s, -c];
  return {pos, forward, down,
    /** The point on the line of sight through a pixel at `depth` metres in front of the camera. */
    at: (px: number, py: number, depth: number): Vec3 => add(pos, mul(add(add(forward, mul(right, (px - CX) / lens.focalPx)), mul(down, (py - CY) / lens.focalPx)), depth)),
    depthOf: (p: Vec3) => dot(sub(p, pos), forward)};
}
/**
 * A hand's points against its wrist, in the camera's own axes (x right, y down, z away), metres. MediaPipe's hand is
 * seen along the line of sight to it, so it is turned from "straight ahead" to that line; `away` is +1 if its depth
 * grows away from the camera as its points in the picture do, -1 if the other way.
 */
function shape(lens: Lens, hand: HandMarks, size: number, away: number): Vec3[] {
  const n = hand.image.length, mx = hand.image.reduce((s, p) => s + p[0], 0) / n, my = hand.image.reduce((s, p) => s + p[1], 0) / n;
  const sight = unit([(mx - CX) / lens.focalPx, (my - CY) / lens.focalPx, 1]), axis = cross([0, 0, 1], sight), sin = length(axis), angle = Math.asin(Math.min(1, sin)), w = hand.world[0];
  return hand.world.map(p => { const v: Vec3 = [(p[0] - w[0]) * size, (p[1] - w[1]) * size, (p[2] - w[2]) * size * away]; return sin > 1e-9 ? turned(v, unit(axis), angle) : v; });
}
/** The hand in the room with its wrist `wristDepth` metres in front of the camera: every point on the line of sight through its own pixel, at the depth its shape gives it. */
export function placeHand(lens: Lens, hand: HandMarks, wristDepth: number, size: number, away = 1): Vec3[] {
  const cam = camera(lens), rel = shape(lens, hand, size, away);
  return hand.image.map((p, i) => cam.at(p[0], p[1], wristDepth + rel[i][2]));
}
/** How many times MediaPipe's hand must be enlarged for its breadth to be what the picture shows at that depth (the middle one of three spans). */
function sizeAt(lens: Lens, hand: HandMarks, wristDepth: number): number {
  const rel = shape(lens, hand, 1, 1), spans = [[0, 5], [0, 17], [5, 17], [0, 9]].map(([a, b]) => Math.hypot(hand.image[a][0] - hand.image[b][0], hand.image[a][1] - hand.image[b][1]) * wristDepth / lens.focalPx / (Math.hypot(rel[a][0] - rel[b][0], rel[a][1] - rel[b][1]) || 1e-9));
  return median(spans);
}
/** The depth of a hand's wrist at which the lowest of the points named lies `lift` over the felt. */
function wristDepthOnFelt(lens: Lens, hand: HandMarks, size: number, away: number, which: number[], lift: number): number {
  const eye = filmEye(lens), cam = camera(lens), rel = shape(lens, hand, size, away);
  // Farther from the camera is lower along a line of sight, so the point that meets the felt first as the hand goes away is the lowest, and it sets the depth.
  return Math.min(...which.map(i => { const p = onPlane(eye, hand.image[i][0], hand.image[i][1], lift); return p ? cam.depthOf(p) - rel[i][2] : Infinity; }));
}
/** A series smoothed over time: each value the weighted mean of its neighbours (a bell of `sigma` frames). */
function smoothed<T extends number | Vec3>(series: T[], sigma: number): T[] {
  const reach = Math.ceil(sigma * 3), weight = (d: number) => Math.exp(-d * d / (2 * sigma * sigma));
  return series.map((_, i) => { let total = 0, sum: number | Vec3 = typeof series[0] === 'number' ? 0 : [0, 0, 0];
    for (let j = Math.max(0, i - reach); j <= Math.min(series.length - 1, i + reach); j++) { const k = weight(j - i); total += k; sum = typeof sum === 'number' ? sum + (series[j] as number) * k : add(sum, mul(series[j] as Vec3, k)); }
    return (typeof sum === 'number' ? sum / total : mul(sum, 1 / total)) as T; });
}
/** The points of the line of sight (a direction from `from`) at `radius` from a centre: the nearer and the farther one, or the nearest point of the line if it passes outside. */
function onSphere(from: Vec3, direction: Vec3, centre: Vec3, radius: number): {near: Vec3; far: Vec3} {
  const d = unit(direction), oc = sub(centre, from), along = dot(oc, d), h2 = radius * radius - (dot(oc, oc) - along * along), h = h2 > 0 ? Math.sqrt(h2) : 0;
  return {near: add(from, mul(d, along - h)), far: add(from, mul(d, along + h))};
}
/**
 * The arm from a shoulder to a wrist, the elbow turned about the line between them to where the picture has it. Two places
 * of the elbow often fall on the same pixel, one before the body and one beside it; a seated dealer's elbow hangs beside
 * her, so the elbow is looked for below her shoulder and no nearer the camera than her wrist, and anywhere only if there is
 * no such place. Bones of fixed length, stretched together only if the wrist is out of reach.
 */
function arm(lens: Lens, shoulder: Vec3, wrist: Vec3, elbowPixel: Pixel, points: Vec3[]): ArmPose {
  const eye = filmEye(lens), far = length(sub(wrist, shoulder)), stretch = Math.max(1, far / ((BODY.upperArm + BODY.forearm) * 0.985)), a = BODY.upperArm * stretch, b = BODY.forearm * stretch;
  const dir = unit(sub(wrist, shoulder)), along = (a * a - b * b + far * far) / (2 * far), out = Math.sqrt(Math.max(0, a * a - along * along)), mid = add(shoulder, mul(dir, along));
  const u = unit(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(dir, u); let best = mid, least = Infinity, hanging: Vec3 | null = null, leastHanging = Infinity;
  for (let k = 0; k < 120; k++) { const t = k * Math.PI / 60, e = add(mid, add(mul(u, Math.cos(t) * out), mul(v, Math.sin(t) * out))), p = see(eye, e), miss = p ? Math.hypot(p.x - elbowPixel.x, p.y - elbowPixel.y) : Infinity;
    if (miss < least) { least = miss; best = e; }
    if (e[1] < shoulder[1] - 0.04 && e[2] <= wrist[2] + 0.02 && miss < leastHanging) { leastHanging = miss; hanging = e; } }
  return {shoulder, elbow: hanging ?? best, wrist, stretch, points};
}

/**
 * The film's card on one frame, in the room. The track gives its four corners in the picture (the visible side's own
 * corners: top left, top right, bottom right, bottom left). A card is 63 by 88 mm, so how much shorter a side is drawn
 * than it is says how far that side leans in depth; which way it leans is taken as it is for anything that faces a camera
 * looking down on it: what is higher in the picture is farther away. The card is drawn as large as the film has it only
 * in shape: its size is a real card's. Its middle stays on the line of sight through the middle of the film's card, at the
 * depth that puts its held short end where the fingers are (`gripDepth`, `grip`).
 */
function trackedCard(lens: Lens, quad: number[][], side: string, gripDepth: number, grip: Pixel): CardPose {
  const cam = camera(lens), k = gripDepth / lens.focalPx, v = (i: number, j: number): [number, number] => [(quad[j][0] - quad[i][0]) * k, (quad[j][1] - quad[i][1]) * k];
  const half = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], down = half(v(1, 2), v(0, 3)), across = half(v(0, 1), v(3, 2)); // along the long side from the artwork's top to its bottom, and along the short side
  const scale = Math.max(Math.hypot(...down) / CARD.height, Math.hypot(...across) / CARD.width) || 1, a = [down[0] / scale, down[1] / scale], b = [across[0] / scale, across[1] / scale];
  const lean = (p: number[], full: number) => -(Math.sign(p[1]) || 1) * Math.sqrt(Math.max(0, full * full - p[0] * p[0] - p[1] * p[1]));
  const world = (c: Vec3): Vec3 => add(add(mul([1, 0, 0], c[0]), mul(cam.down, c[1])), mul(cam.forward, c[2]));
  const longDown = unit(world([a[0], a[1], lean(a, CARD.height)])), shortRaw = world([b[0], b[1], lean(b, CARD.width)]), short = unit(sub(shortRaw, mul(longDown, dot(shortRaw, longDown))));
  let seen = cross(short, longDown); if (dot(seen, cam.forward) > 0) seen = mul(seen, -1); // the side that is seen looks toward the camera
  const normal = side === 'BACK' ? mul(seen, -1) : seen, mid = (i: number, j: number): Pixel => ({x: (quad[i][0] + quad[j][0]) / 2, y: (quad[i][1] + quad[j][1]) / 2}), top = mid(0, 1), bottom = mid(3, 2);
  const topHeld = Math.hypot(top.x - grip.x, top.y - grip.y) <= Math.hypot(bottom.x - grip.x, bottom.y - grip.y), long = topHeld ? mul(longDown, -1) : longDown, reach = CARD.height / 2 - HAND.inFromEdge;
  const centre = cam.at((quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4, (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4, gripDepth - dot(long, cam.forward) * reach);
  return {centre, long, normal, across: cross(normal, long)};
}
const squared = (centre: Vec3, longRaw: Vec3, toward: Vec3): CardPose => { const long = unit(longRaw), normal = unit(sub(toward, mul(long, dot(toward, long)))); return {centre, long, normal, across: cross(normal, long)}; };
const between = (a: CardPose, b: CardPose, t: number): CardPose => squared(lerp(a.centre, b.centre, t), lerp(a.long, b.long, t), lerp(a.normal, b.normal, t));

/**
 * The whole deal in the room. `track` is the film's card track (the card's corners frame by frame, when it leaves the shoe,
 * when it is edge-on, when it lies and where). Throws if a hand or the body is missing in every frame.
 */
export function perform(lens: Lens, marks: Landmarks, track: Track, options: {away?: number} = {}): Performance {
  const n = marks.frameCount, eye = filmEye(lens), cam = camera(lens), leaves = track.leavesShoe ?? 0, rests = track.restFrom ?? n - 1, edge: [number, number] = [track.edgeWindow?.[0] ?? Math.round((leaves + rests) / 2), track.edgeWindow?.[1] ?? Math.round((leaves + rests) / 2)];
  const filled = <T,>(get: (i: number) => T | undefined | null): T[] => { // a frame without the thing takes it from the nearest frame that has it
    const got = Array.from({length: n}, (_, i) => get(i) ?? null), out: T[] = [];
    for (let i = 0; i < n; i++) { let d = 0; while (d < n && !(got[i - d] ?? got[i + d])) d++; const v = got[i - d] ?? got[i + d]; if (!v) throw Error(`Nothing to carry over at frame ${i}.`); out.push(v); }
    return out; };
  const left = filled(i => marks.frames[i].hands.L), right = filled(i => marks.frames[i].hands.R), pose = filled(i => marks.frames[i].pose);
  const away = options.away ?? 1, inShoe = shoeCard(shoePose(lens)), shoeTop = add(inShoe.centre, mul(inShoe.up, CARD.height / 2 - HAND.inFromEdge));

  // Her right hand rests on the felt the whole time, flat and in full view: its lowest point lies on the felt, and how large
  // it is drawn there says how large her hands are. Her left hand is the same size.
  const resting = [...TIPS, ...KNUCKLES, 0]; let size = 1; for (let pass = 0; pass < 4; pass++) size = median(right.map(h => sizeAt(lens, h, wristDepthOnFelt(lens, h, size, away, resting, 0.012))));
  const depthR = smoothed(right.map(h => wristDepthOnFelt(lens, h, size, away, resting, 0.012)), 3);
  // Her left hand. At the start its thumb and forefinger hold the top of the card standing in the shoe; when the card is laid
  // its fingertips lie on the felt. Between, the wrist's depth is carried smoothly from the one to the other.
  const laying = Math.max(leaves + 1, rests - 8), pinchDepth = (h: HandMarks) => { const rel = shape(lens, h, size, away); return cam.depthOf(shoeTop) - (rel[4][2] + rel[8][2]) / 2; };
  const startDepth = median(left.slice(0, leaves + 1).map(pinchDepth)), endDepths = smoothed(left.map(h => wristDepthOnFelt(lens, h, size, away, TIPS, 0.008)), 2);
  const carried = left.map((_, i) => i <= leaves ? startDepth : i >= laying ? endDepths[i] : startDepth + (endDepths[laying] - startDepth) * smooth((i - leaves) / (laying - leaves)));
  const depthL = smoothed(carried.map((d, i) => Math.min(d, endDepths[i])), 1); // never so far away that a fingertip would be under the felt
  const handsL = Array.from({length: 21}, (_, k) => smoothed(left.map((h, i) => placeHand(lens, h, depthL[i], size, away)[k]), 1.2)), handsR = Array.from({length: 21}, (_, k) => smoothed(right.map((h, i) => placeHand(lens, h, depthR[i], size, away)[k]), 2));
  const pointsOf = (hands: Vec3[][], i: number) => hands.map(series => series[i]);
  // Which way the palm looks out of the three points wrist, forefinger knuckle and little-finger knuckle: her right hand lies palm down, and her left is its mirror.
  const flatR = median(handsR[0].map((_, i) => unit(cross(sub(handsR[5][i], handsR[0][i]), sub(handsR[17][i], handsR[0][i])))[1])), palm = flatR < 0 ? -1 : 1; // +1: the left hand's palm looks along that cross product

  // Her body: the hip stays, the shoulders go round it at the distance they have when she sits upright, the head with them.
  const zBody = dealerEdge(lens)[2] - ASSUMED.shouldersBehindEdge, first = pose.slice(0, Math.max(3, leaves)), still = (k: number) => onUpright(eye, median(first.map(p => p.image[k][0])), median(first.map(p => p.image[k][1])), zBody)!;
  const s0 = [still(12), still(11)], hip: Vec3 = [(s0[0][0] + s0[1][0]) / 2, -BODY.hipBelowFelt, zBody];
  const round = (pixel: (p: PoseMarks) => Pixel, radius: number) => smoothed(pose.map(p => { const at = pixel(p), hit = onSphere(eye.position, sub(cam.at(at.x, at.y, 1), eye.position), hip, radius); return Math.abs(hit.near[2] - zBody) < Math.abs(hit.far[2] - zBody) ? hit.near : hit.far; }), 2);
  const joint = (k: number) => (p: PoseMarks): Pixel => ({x: p.image[k][0], y: p.image[k][1]}), ears = (p: PoseMarks): Pixel => ({x: (p.image[7][0] + p.image[8][0]) / 2, y: (p.image[7][1] + p.image[8][1]) / 2});
  const shoulderR = round(joint(12), length(sub(s0[0], hip))), shoulderL = round(joint(11), length(sub(s0[1], hip)));
  const head0 = onUpright(eye, median(first.map(p => ears(p).x)), median(first.map(p => ears(p).y)), zBody)!, heads = round(ears, length(sub(head0, hip)));
  const elbows = (k: number) => smoothed(pose.map(p => [p.image[k][0], p.image[k][1], 0] as Vec3), 1.5), elbowL = elbows(13), elbowR = elbows(14);

  // The card: standing in the shoe, then where the film has it with its held end at her fingers, then lying at its place.
  const place = track.restQuad ? onPlane(eye, track.restQuad.reduce((s, p) => s + p[0], 0) / 4, track.restQuad.reduce((s, p) => s + p[1], 0) / 4) : null; if (!place) throw Error('The track has no resting card.');
  const lying: CardPose = {centre: [place[0], CARD.thickness / 2, place[2]], long: [0, 0, -1], normal: [0, 1, 0], across: [-1, 0, 0]};
  const standing = (() => { const long = inShoe.up, raw = unit(cross(inShoe.across, long)), face = raw[1] > 0 ? mul(raw, -1) : raw; return {centre: inShoe.centre, long, normal: face, across: cross(face, long)}; })(); // its back out of the plate, toward the eye
  const grips = Array.from({length: n}, (_, i) => lerp(handsL[4][i], handsL[8][i], 0.5)), seenAt: (CardPose | null)[] = Array.from({length: n}, (_, i) => { const f = track.frames[i];
    return f?.quad?.length === 4 && (f.side === 'BACK' || f.side === 'FRONT') && i >= leaves ? trackedCard(lens, f.quad, f.side, cam.depthOf(grips[i]), see(eye, grips[i])!) : null; });
  // The frames where the card is a line: carried across from the last frame with its back to the camera to the first with its face, the face coming up and over.
  const known = seenAt.map((c, i) => c ? i : -1).filter(i => i >= 0), cards: CardPose[] = [];
  for (let i = 0; i < n; i++) { if (seenAt[i]) { cards.push(seenAt[i]!); continue; }
    const before = [...known].reverse().find(k => k < i), after = known.find(k => k > i); if (before === undefined && after === undefined) { cards.push(standing); continue; } if (before === undefined) { cards.push(seenAt[after!]!); continue; } if (after === undefined) { cards.push(seenAt[before]!); continue; }
    // Turned right over between the two: the face comes round by the camera's side (the card rolls on about its long side the way it was already tipping).
    const a = seenAt[before]!, b = seenAt[after]!, t = (i - before) / (after - before), long = unit(lerp(a.long, b.long, t)), centre = lerp(a.centre, b.centre, t), side = unit(cross(long, [0, 1, 0])), by = dot(side, sub(eye.position, centre)) >= 0 ? side : mul(side, -1);
    cards.push(squared(centre, long, dot(a.normal, b.normal) < 0 ? (t < 0.5 ? lerp(a.normal, by, 2 * t) : lerp(by, b.normal, 2 * t - 1)) : lerp(a.normal, b.normal, t))); }
  const centres = smoothed(cards.map(c => c.centre), 0.8), longs = smoothed(cards.map(c => c.long), 1), normals = smoothed(cards.map(c => c.normal), 1), folds = Math.max(leaves + 1, rests - 6);
  const moments: Moment[] = [];
  for (let i = 0; i < n; i++) {
    const L = pointsOf(handsL, i), R = pointsOf(handsR, i), film = squared(centres[i], longs[i], normals[i]);
    const card = i < leaves - 1 ? standing : i < leaves + 5 ? between(standing, film, smooth((i - leaves + 2) / 6)) : i <= folds ? film : i < rests ? between(film, lying, smooth((i - folds) / (rests - folds))) : lying;
    // No part of the card goes under the felt.
    const floor = CARD.thickness / 2 + CARD.height / 2 * Math.abs(card.long[1]) + CARD.width / 2 * Math.abs(card.across[1]); if (card.centre[1] < floor) card.centre = [card.centre[0], floor, card.centre[2]];
    moments.push({card, L: arm(lens, shoulderL[i], L[0], {x: elbowL[i][0], y: elbowL[i][1]}, L), R: arm(lens, shoulderR[i], R[0], {x: elbowR[i][0], y: elbowR[i][1]}, R), head: heads[i], hip});
  }
  return {film: marks.film, fps: marks.fps, frameCount: n, leavesShoe: leaves, edge, folds, rests, handSize: {L: size, R: size}, palm, moments};
}

/**
 * The same deal to another place. The dealing hand and the card are the read ones, carried sideways: nothing at the shoe,
 * the whole way from the film's place to `to` by the time the card is over its place. How the fingers are bent and how
 * the card is turned stay as they were read, so the bank's camera sees the card's back, edge and face at the same
 * moments, and the card lies straight on the plan's place. A hand that reaches another way comes in from another side,
 * though: carried straight across, the wrist would be bent and the forearm turned beyond what an arm can do. So the hand
 * is swung about a plumb line through its grip, the card staying as it is between thumb and fingers, by the angle that
 * asks least of wrist and forearm (`swing`, found by trying). Swinging the card with the hand was tried: toward seat 1
 * the camera then sees the card on edge for twenty frames, which no reference film may show. The body is no longer the
 * film's: she bends from the hip and turns her dealing shoulder forward as far as the arm needs (solveBody), and each
 * elbow hangs to its own side. So here the fingers and the card are read and moved, and the swing, the arm and the body
 * are a model.
 */
export function moved(lens: Lens, p: Performance, to: Vec3, swingDeg?: number): Performance & {swing: number} {
  const frame = standing(lens), last = p.moments[p.frameCount - 1].card.centre, shift: Vec3 = [to[0] - last[0], 0, to[2] - last[2]], arrive = Math.round(p.edge[1] + (p.rests - p.edge[1]) * 0.5);
  const byPole = (shoulder: Vec3, wrist: Vec3, pole: Vec3, points: Vec3[]): ArmPose => { // two bones bent toward `pole`, stretched together only if the wrist is out of reach
    const far = length(sub(wrist, shoulder)), stretch = Math.max(1, far / ((BODY.upperArm + BODY.forearm) * 0.985)), a = BODY.upperArm * stretch, b = BODY.forearm * stretch, dir = unit(sub(wrist, shoulder));
    const along = (a * a - b * b + far * far) / (2 * far), out = Math.sqrt(Math.max(0, a * a - along * along)), side = unit(sub(pole, mul(dir, dot(pole, dir))));
    return {shoulder, elbow: add(add(shoulder, mul(dir, along)), mul(side, out)), wrist, stretch, points}; };
  const round = (v: Vec3, angle: number): Vec3 => { const c = Math.cos(angle), s = Math.sin(angle); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
  const build = (swing: number): Moment[] => p.moments.map((m, i) => {
    const w = smooth((i - p.leavesShoe) / (arrive - p.leavesShoe)), by = mul(shift, w), grip = lerp(m.L.points[4], m.L.points[8], 0.5);
    const L = m.L.points.map(q => add(add(grip, by), round(sub(q, grip), swing * w))), body = solveBody(frame, L[0], m.R.wrist);
    return {card: {...m.card, centre: add(m.card.centre, by)}, L: byPole(body.shoulders[1], L[0], [0.7, -0.6, -0.4], L), R: byPole(body.shoulders[0], m.R.wrist, [-0.7, -0.6, -0.4], m.R.points), head: body.head, hip: body.hip}; });
  // What a swing asks of the dealing arm: how far the wrist is bent at its worst, and how far the forearm turns from end to end.
  const asks = (moments: Moment[]) => { const j = moments.map(m => joints(m.L, p.palm)), twist: number[] = []; for (const x of j) if (x.twist !== null) { let t = x.twist; if (twist.length) { while (t - twist[twist.length - 1] > 180) t -= 360; while (t - twist[twist.length - 1] < -180) t += 360; } twist.push(t); }
    return Math.max(...j.map(x => x.wrist)) + 0.5 * (Math.max(...twist) - Math.min(...twist)) + 200 * (Math.max(...j.map(x => x.stretch)) - 1); };
  let swing = (swingDeg ?? 0) * Math.PI / 180;
  if (swingDeg === undefined) { let least = Infinity; for (let d = -120; d <= 120; d += 5) { const cost = asks(build(d * Math.PI / 180)); if (cost < least) { least = cost; swing = d * Math.PI / 180; } } }
  return {...p, moments: build(swing), swing: swing * 180 / Math.PI};
}

// ---- what a body can do ---------------------------------------------------------------------------------------
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180 / Math.PI;
/**
 * The joints of one arm and hand, in degrees. elbow: how far it is bent (0 straight). wrist: how far the hand is bent
 * off the forearm's line. twist: how far the forearm is turned, palm against the elbow's own hinge (0 with the thumb up,
 * positive palm up, negative palm down); null when the arm is nearly straight and the hinge has no direction. fingers: the
 * bend of every finger joint beyond the knuckle (0 straight, negative bent backward). bones: the length of every finger bone.
 */
export function joints(a: ArmPose, palmSign: number) {
  const upper = sub(a.elbow, a.shoulder), fore = sub(a.wrist, a.elbow), handLine = sub(a.points[9], a.points[0]), elbow = angle(upper, fore), wrist = angle(fore, handLine);
  const hinge = cross(upper, fore), f = unit(fore), palm = mul(unit(cross(sub(a.points[5], a.points[0]), sub(a.points[17], a.points[0]))), palmSign);
  const across = (v: Vec3) => sub(v, mul(f, dot(v, f))), twist = elbow < 15 ? null : Math.atan2(dot(cross(across(hinge), across(palm)), f), dot(across(hinge), across(palm))) * 180 / Math.PI;
  // A finger's two joints are hinges about one line, across the finger and along the palm: bending round it toward the palm
  // is positive. The thumb (the first chain) lies across the palm, so its bend is given without a sign.
  const fingers = FINGERS.map((c, finger) => { const hingeLine = cross(sub(a.points[c[1]], a.points[c[0]]), palm);
    return [1, 2].map(k => { const back = sub(a.points[c[k]], a.points[c[k - 1]]), on = sub(a.points[c[k + 1]], a.points[c[k]]), bend = angle(back, on); return finger === 0 || dot(cross(back, on), hingeLine) >= 0 ? bend : -bend; }); });
  const bones = FINGERS.map(c => [0, 1, 2].map(k => length(sub(a.points[c[k + 1]], a.points[c[k]]))));
  return {elbow, wrist, twist, fingers, bones, stretch: a.stretch};
}
/**
 * What a person's arm and hand can do, degrees: the limits of a supple adult, with room for the reading's own unsteadiness.
 * elbow: bent at most this far. wrist: the hand at most this far off the forearm's line. twistSpan: the forearm turns at
 * most this far from one end of its turning to the other. fingerBend and fingerBack: a finger joint bends at most this far
 * toward the palm and this far backward. stretch: the arm's bones are lengthened at most this many times to reach.
 */
export const LIMITS = {elbow: 155, wrist: 95, twistSpan: 200, fingerBend: 125, fingerBack: 40, stretch: 1.15};
