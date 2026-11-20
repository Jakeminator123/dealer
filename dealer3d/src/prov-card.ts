// The test "one deal, two chairs" (Beslut 3d-prov-en-giv-tva-stolar, 2026-11-20): the card of a deal as a pose per frame.
// Two ways to it, one per motion source:
//   cardsFromTrack   the film's own card (its corners frame by frame, assets/tracking/<film>/card-track.json) laid into
//                    the room where the fingers that hold it are. The reading is capture.ts's (its trackedCard: the
//                    card's shape from its corners; the turn about one axis across the frames where it is a line; the
//                    fold down to the felt), which that file keeps to itself; it is repeated here because the fingers
//                    come from another reader (SAM 3D Body, either hand) and capture.ts was not this test's to change.
//                    One thing differs: capture.ts takes the fingers to hold the card's short end; SAM shows them over
//                    the card's middle, so here the card is put where its own plane passes through the fingers.
//                    If the test goes on: export the shared part there and delete it here.
//   cardInHand       a card held in a hand given by four of its joints (a rigged hand: the bought clip's mannequin).
// Pure: no three.js, no files.
import {CARD, FILM, add, cross, dot, filmEye, mul, onPlane, sub, unit, type Lens, type Vec3} from './camera.ts';
import {turned} from './body.ts';
import {HAND, type CardPose} from './deal.ts';

export type CardTrack = {leavesShoe: number | null; restFrom: number | null; restQuad: number[][] | null; edgeWindow: number[] | null; frames: {frame: number; side: string; quad: number[][] | null}[]};
const CX = (FILM.width - 1) / 2, CY = (FILM.height - 1) / 2;
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A pose from a centre, a long side and roughly where the face looks: the face is squared up against the long side. */
export const squared = (centre: Vec3, longRaw: Vec3, toward: Vec3): CardPose => { const long = unit(longRaw), normal = unit(sub(toward, mul(long, dot(toward, long)))); return {centre, long, normal, across: cross(normal, long)}; };
export const between = (a: CardPose, b: CardPose, t: number): CardPose => squared(lerp(a.centre, b.centre, t), lerp(a.long, b.long, t), lerp(a.normal, b.normal, t));
/** The same card with its long side pointing the way `like` points: a card is the same turned half round in its own plane, and two poses blend only if they agree. */
export const alongLike = (c: CardPose, like: Vec3): CardPose => dot(c.long, like) < 0 ? {centre: c.centre, long: mul(c.long, -1), normal: c.normal, across: mul(c.across, -1)} : c;
/** No part of the card under the felt: its centre at least as high as its lowest corner hangs below it. */
export function overFelt(c: CardPose): CardPose {
  const floor = CARD.thickness / 2 + CARD.height / 2 * Math.abs(c.long[1]) + CARD.width / 2 * Math.abs(c.across[1]);
  return c.centre[1] < floor ? {...c, centre: [c.centre[0], floor, c.centre[2]]} : c;
}
/** A card lying flat at a point of the felt, its long side along `long` (made level), face up or back up. */
export const lyingAt = (at: Vec3, long: Vec3, faceUp: boolean): CardPose => squared([at[0], CARD.thickness / 2, at[2]], [long[0], 0, long[2]], [0, faceUp ? 1 : -1, 0]);
/** The card standing in the shoe, its back out of the plate. */
export function inShoe(shoe: {centre: Vec3; up: Vec3; across: Vec3}): CardPose {
  const raw = unit(cross(shoe.across, shoe.up)), face = raw[1] > 0 ? mul(raw, -1) : raw; return {centre: shoe.centre, long: shoe.up, normal: face, across: cross(face, shoe.up)};
}
/** How far a point is from a card: 0 on the card itself. */
export function offCard(c: CardPose, p: Vec3): number {
  const d = sub(p, c.centre), outside = (along: number, half: number) => Math.max(0, Math.abs(along) - half);
  return Math.hypot(outside(dot(d, c.long), CARD.height / 2), outside(dot(d, c.across), CARD.width / 2), dot(d, c.normal));
}

function camera(lens: Lens) {
  const c = Math.cos(lens.pitch), s = Math.sin(lens.pitch), pos: Vec3 = [0, lens.height, 0], down: Vec3 = [0, -c, s], forward: Vec3 = [0, -s, -c];
  return {pos, forward, down, ray: (px: number, py: number): Vec3 => add(add(forward, mul([1, 0, 0], (px - CX) / lens.focalPx)), mul(down, (py - CY) / lens.focalPx)), depthOf: (p: Vec3) => dot(sub(p, pos), forward)};
}
/**
 * The film's card on one frame. Its four corners in the picture (the visible side's own: top left, top right, bottom
 * right, bottom left) give its shape: a card is 63 by 88 mm, so how much shorter a side is drawn than it is says how far
 * that side leans in depth, and what is higher in the picture is farther away. Its middle is on the line of sight through
 * the middle of the film's card, at the depth where the card's plane passes through the fingers (`grip`); a card nearly
 * edge-on to that line of sight is put at the fingers' own depth, and never more than 6 cm from it.
 */
function filmCard(lens: Lens, quad: number[][], side: string, grip: Vec3): CardPose {
  const cam = camera(lens), gripDepth = cam.depthOf(grip), k = gripDepth / lens.focalPx, v = (i: number, j: number): [number, number] => [(quad[j][0] - quad[i][0]) * k, (quad[j][1] - quad[i][1]) * k];
  const half = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], down = half(v(1, 2), v(0, 3)), across = half(v(0, 1), v(3, 2));
  const scale = Math.max(Math.hypot(...down) / CARD.height, Math.hypot(...across) / CARD.width) || 1, a = [down[0] / scale, down[1] / scale], b = [across[0] / scale, across[1] / scale];
  const lean = (p: number[], full: number) => -(Math.sign(p[1]) || 1) * Math.sqrt(Math.max(0, full * full - p[0] * p[0] - p[1] * p[1]));
  const world = (c: Vec3): Vec3 => add(add(mul([1, 0, 0], c[0]), mul(cam.down, c[1])), mul(cam.forward, c[2]));
  const long = unit(world([a[0], a[1], lean(a, CARD.height)])), shortRaw = world([b[0], b[1], lean(b, CARD.width)]), short = unit(sub(shortRaw, mul(long, dot(shortRaw, long))));
  let seen = cross(short, long); if (dot(seen, cam.forward) > 0) seen = mul(seen, -1); // the side that is seen looks toward the camera
  const normal = side === 'BACK' ? mul(seen, -1) : seen, ray = cam.ray((quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4, (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4), facing = dot(ray, normal);
  const depth = Math.abs(facing) > 0.25 ? Math.max(gripDepth - 0.06, Math.min(gripDepth + 0.06, dot(sub(grip, cam.pos), normal) / facing)) : gripDepth;
  return {centre: add(cam.pos, mul(ray, depth)), long, normal, across: cross(normal, long)};
}
/** The single turn that carries one card pose into another (capture.ts, turnBetween): of the two ways round half a turn, the way the card is already going. */
function turnBetween(a: CardPose, b: CardPose, going: Vec3): {axis: Vec3; angle: number} {
  const A = [a.long, a.normal, a.across], B = [b.long, b.normal, b.across], R = [0, 1, 2].map(r => [0, 1, 2].map(c => A.reduce((s, ak, k) => s + B[k][r] * ak[c], 0)));
  const angle = Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))), anti: Vec3 = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  let axis: Vec3; if (Math.hypot(...anti) > 1e-6) axis = unit(anti); else { const j = [0, 1, 2].reduce((m, k) => R[k][k] > R[m][m] ? k : m, 0); axis = unit([R[0][j] + (j === 0 ? 1 : 0), R[1][j] + (j === 1 ? 1 : 0), R[2][j] + (j === 2 ? 1 : 0)]); }
  return angle > 2.6 && dot(axis, going) < 0 ? {axis: mul(axis, -1), angle: 2 * Math.PI - angle} : {axis, angle};
}
function smoothed(series: Vec3[], sigma: number): Vec3[] {
  const reach = Math.ceil(sigma * 3), weight = (d: number) => Math.exp(-d * d / (2 * sigma * sigma));
  return series.map((_, i) => { let total = 0, sum: Vec3 = [0, 0, 0]; for (let j = Math.max(0, i - reach); j <= Math.min(series.length - 1, i + reach); j++) { const k = weight(j - i); total += k; sum = add(sum, mul(series[j], k)); } return mul(sum, 1 / total); });
}
const WELL_SEEN = 0.33; // capture.ts, TURN.wellSeen

/**
 * The film's card through the whole deal (capture.ts, perform, the card's part). `grips`: per frame, the point between the
 * thumb's and the forefinger's ends of the hand that holds the card then, in the room. In the shoe until it leaves, then
 * where the film has it, turned over about one axis across the frames where it is a line, folded down to lie where the
 * film's card lies from the frame it rests.
 */
export function cardsFromTrack(lens: Lens, track: CardTrack, grips: Vec3[], shoe: {centre: Vec3; up: Vec3; across: Vec3}): {cards: CardPose[]; place: Vec3; leaves: number; rests: number; folds: number; edge: [number, number]; turn: {from: number; to: number; degrees: number} | null; seen: number} {
  const n = grips.length, eye = filmEye(lens), leaves = track.leavesShoe ?? 0, rests = track.restFrom ?? n - 1, mid = Math.round((leaves + rests) / 2), edge: [number, number] = [track.edgeWindow?.[0] ?? mid, track.edgeWindow?.[1] ?? mid];
  const place = track.restQuad ? onPlane(eye, track.restQuad.reduce((s, p) => s + p[0], 0) / 4, track.restQuad.reduce((s, p) => s + p[1], 0) / 4) : null; if (!place) throw Error('The track has no resting card.');
  const standing = inShoe(shoe), seenAt: (CardPose | null)[] = Array.from({length: n}, (_, i) => { const f = track.frames[i]; return f?.quad?.length === 4 && (f.side === 'BACK' || f.side === 'FRONT') && i >= leaves ? filmCard(lens, f.quad, f.side, grips[i]) : null; });
  // Which of a card's two short ends is "up" is the same card: each frame's long side is taken the way the frame before had it, from the shoe on.
  let like = standing.long; for (let i = 0; i < n; i++) if (seenAt[i]) { seenAt[i] = alongLike(seenAt[i]!, like); like = seenAt[i]!.long; }
  const drawn = (i: number) => { const q = track.frames[i]?.quad; if (q?.length !== 4) return 0; const side = (a: number, b: number) => Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1]), long = (side(1, 2) + side(0, 3)) / 2 / CARD.height, short = (side(0, 1) + side(3, 2)) / 2 / CARD.width; return Math.min(long, short) / Math.max(long, short); };
  const wellSeen = (i: number, side: string) => !!seenAt[i] && track.frames[i].side === side && drawn(i) >= WELL_SEEN, seen = seenAt.filter(Boolean).length;
  let turnFrom = edge[0] - 1, turnTo = edge[1] + 1; while (turnFrom > leaves && !wellSeen(turnFrom, 'BACK')) turnFrom--; while (turnTo < rests && !wellSeen(turnTo, 'FRONT')) turnTo++;
  let turn: {from: number; to: number; degrees: number} | null = null;
  if (wellSeen(turnFrom, 'BACK') && wellSeen(turnTo, 'FRONT')) { const a = seenAt[turnFrom]!, b = seenAt[turnTo]!, offA = sub(a.centre, grips[turnFrom]), offB = sub(b.centre, grips[turnTo]);
    const earlier = seenAt[Math.max(leaves, turnFrom - 3)] ?? a, going = add(add(cross(earlier.long, a.long), cross(earlier.normal, a.normal)), cross(earlier.across, a.across)), {axis, angle} = turnBetween(a, b, going);
    turn = {from: turnFrom, to: turnTo, degrees: angle * 180 / Math.PI};
    for (let i = turnFrom + 1; i < turnTo; i++) { const t = (i - turnFrom) / (turnTo - turnFrom), long = turned(a.long, axis, angle * t), normal = turned(a.normal, axis, angle * t); seenAt[i] = {centre: add(grips[i], lerp(offA, offB, t)), long, normal, across: cross(normal, long)}; } }
  const known = seenAt.map((c, i) => c ? i : -1).filter(i => i >= 0), raw: CardPose[] = [];
  for (let i = 0; i < n; i++) { if (seenAt[i]) { raw.push(seenAt[i]!); continue; }
    const before = [...known].reverse().find(k => k < i), after = known.find(k => k > i); if (before === undefined && after === undefined) { raw.push(standing); continue; } if (before === undefined) { raw.push(seenAt[after!]!); continue; } if (after === undefined) { raw.push(seenAt[before]!); continue; }
    const a = seenAt[before]!, b = seenAt[after]!, t = (i - before) / (after - before), long = unit(lerp(a.long, b.long, t)), centre = lerp(a.centre, b.centre, t), side = unit(cross(long, [0, 1, 0])), by = dot(side, sub(eye.position, centre)) >= 0 ? side : mul(side, -1);
    raw.push(squared(centre, long, dot(a.normal, b.normal) < 0 ? (t < 0.5 ? lerp(a.normal, by, 2 * t) : lerp(by, b.normal, 2 * t - 1)) : lerp(a.normal, b.normal, t))); }
  const centres = smoothed(raw.map(c => c.centre), 0.8), longs = smoothed(raw.map(c => c.long), 1), normals = smoothed(raw.map(c => c.normal), 1), folds = Math.max(leaves + 1, rests - 6), cards: CardPose[] = [];
  const lying = lyingAt(place, [0, 0, longs[folds][2] > 0 ? 1 : -1], true);
  for (let i = 0; i < n; i++) { const film = squared(centres[i], longs[i], normals[i]);
    cards.push(overFelt(i < leaves - 1 ? standing : i < leaves + 5 ? between(standing, film, smooth((i - leaves + 2) / 6)) : i <= folds ? film : i < rests ? between(film, lying, smooth((i - folds) / (rests - folds))) : lying)); }
  return {cards, place, leaves, rests, folds, edge, turn, seen};
}

/**
 * A card held in a rigged hand, from four of its joints and the middles of its thumb's and forefinger's pads (on the
 * bones' own lines, `FINGER` under the skin): the card's plane is the palm's, its back against the forefinger's pad as it
 * comes out of a shoe (`palm` looks out of the palm, and the face looks the same way), its long side the way the fingers
 * point, its short end under the forefinger. Nothing turns the card within the fingers: only a hand that turns its palm
 * up turns the face up. `thumbGap`: how far the thumb's skin is from the card (0: the thumb presses on it).
 */
export const FINGER = 0.007;
export function cardInHand(hand: {wrist: Vec3; forefinger: Vec3; littleFinger: Vec3; middle: Vec3; thumbEnd: Vec3; forefingerEnd: Vec3}, left: boolean): CardPose & {palm: Vec3; grip: Vec3; pinch: number; thumbGap: number} {
  const raw = unit(cross(sub(hand.forefinger, hand.wrist), sub(hand.littleFinger, hand.wrist))), palm = left ? mul(raw, -1) : raw, pose = squared([0, 0, 0], sub(hand.middle, hand.wrist), palm), grip = add(hand.forefingerEnd, mul(pose.normal, FINGER));
  return {...pose, centre: add(grip, mul(pose.long, CARD.height / 2 - HAND.inFromEdge)), palm, grip, pinch: Math.hypot(...sub(hand.thumbEnd, hand.forefingerEnd)), thumbGap: Math.max(0, Math.abs(dot(sub(hand.thumbEnd, grip), pose.normal)) - FINGER)};
}
