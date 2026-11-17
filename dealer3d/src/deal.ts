// One deal as a timeline in the world: where the card is and how it is turned at every moment, and what the dealing hand
// does. Pure: no I/O and no three.js. The same function of time is what every seat sees, each through its own eye, and
// what two computers would share: an event, a target seat, this file's version and a start time.
//
// The path and the tempo are Paow's own deal to seat 4 (paow-giv-2-1-p4-11-01, 24 frames a second): the card's centre in
// the film on seven frames, laid into the room through the lens at an assumed height over the felt. From the film camera
// the 3D card is therefore where the film's card is on those frames whatever height is assumed. The heights are assumed,
// and the card's turning is read off the same frames by eye: it hangs from the fingers with its back to the camera and its
// long side across the picture, is tipped over about that long side (edge-on to the camera at frame 45, as the track
// has it), and swings its long side toward the dealer on the way down. The hand turns with the card and stays turned, as
// in the takes that hold (tools/film-prompting.md). A deal to another seat is the same path bent toward that seat's place.
import {CARD, add, cross, dot, filmEye, mul, onPlane, sub, unit, type Lens, type Vec3} from './camera.ts';

export const DEAL_VERSION = 1;
export const FPS = 24;
/** The film's card on seven frames: frame, centre pixel (the track's quad centre) and the height over the felt assumed there. */
export const FILM_KEYS = [
  {frame: 22, pixel: null, lift: 0},                      // leaves the shoe (the track's leavesShoe): the card's place in the shoe
  {frame: 30, pixel: {x: 1145.8, y: 698.1}, lift: 0.17},  // drawn out and lifted
  {frame: 40, pixel: {x: 932.2, y: 816.5}, lift: 0.13},   // carried toward the middle
  {frame: 50, pixel: {x: 867.0, y: 971.4}, lift: 0.07},   // turned over (the film's card is edge-on at frame 45)
  {frame: 60, pixel: {x: 850.2, y: 1065.5}, lift: 0.028}, // coming down over the place
  {frame: 70, pixel: {x: 852.1, y: 1091.6}, lift: 0.012},
  {frame: 80, pixel: null, lift: 0},                      // lies at the place
] as const;
// The card's turning on the same frames. LONG: the direction of its long side, from its middle toward the edge the fingers
// hold (the shoe's own direction on the first; x toward image right, y up, z toward the camera). TIP: how far it has been
// tipped over about that long side as the film camera sees it, in degrees: 0 its back squarely to the camera, 90 edge-on,
// and 90 plus the camera's height angle over the card (about 128) lying face up.
const LONG: (Vec3 | null)[] = [null, [0.62, 0.74, 0.25], [0.92, 0.34, 0.2], [0.72, 0.06, -0.69], [0.36, 0.03, -0.93], [0.1, 0.01, -1], [0, 0, -1]];
const TIP: (number | null)[] = [null, 10, 55, 122, null, null, null]; // null: in the shoe on the first, lying face up on the last three
// How much of the way from seat 4's place to another seat's place each key is moved: nothing at the shoe, all of it at the landing.
const BEND = [0, 0.1, 0.38, 0.68, 0.92, 0.99, 1];
// The moments of the deal, seconds. `lets`: the fingers let go, the card a few centimetres over its place and face up;
// `lands`: the card lies still (the film's card has its resting outline from frame 80); `back`: the hand holds the next card.
export const MOMENTS = {pinch: 0, leavesShoe: 22 / FPS, lifted: 30 / FPS, edgeOn: 45 / FPS, turned: 50 / FPS, lets: 56 / FPS, lands: 80 / FPS, back: 150 / FPS, end: 169 / FPS};
// The hand: from the wrist the fingers reach `reach` forward to where they hold the card, their pads `pad` to the palm's
// side; letting go, it draws `withdraw` back along the card's long side, which takes the fingertips clear of the card.
export const HAND = {reach: 0.115, pad: 0.015, inFromEdge: 0.012, restLift: 0.015, withdraw: 0.09};

/** A card in the world: its middle, its long side (toward the held edge), the way its face looks, and its short side. */
export type CardPose = {centre: Vec3; long: Vec3; normal: Vec3; across: Vec3};
export type HandPose = {wrist: Vec3; forward: Vec3; palm: Vec3; curl: number; holds: boolean};
export type Deal = {target: string; duration: number; card(t: number): CardPose; hand(t: number): HandPose};
export type DealInput = {
  lens: Lens; target: string; place: Vec3; placeOfSeat4: Vec3;
  shoe: {centre: Vec3; up: Vec3; across: Vec3}; // the next card in the shoe: its centre, its long side up the plate, its short side
};

const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
/** A smooth curve through keyed values (numbers or points) at keyed times: cubic Hermite, at rest at both ends. */
function through<T extends number | Vec3>(times: number[], values: T[], t: number): T {
  const n = times.length, lerp = (a: T, b: T, k: number): T => typeof a === 'number' ? (a + ((b as number) - a) * k) as T : (a as Vec3).map((v, i) => v + ((b as Vec3)[i] - v) * k) as T;
  if (t <= times[0]) return values[0]; if (t >= times[n - 1]) return values[n - 1];
  let i = 0; while (t > times[i + 1]) i++;
  const zero = (typeof values[0] === 'number' ? 0 : [0, 0, 0]) as T, scale = (a: T, k: number) => lerp(zero, a, k), plus = (a: T, b: T): T => typeof a === 'number' ? (a + (b as number)) as T : add(a as Vec3, b as Vec3) as T;
  const slope = (j: number): T => j === 0 || j === n - 1 ? zero : scale(plus(values[j + 1], scale(values[j - 1], -1)), 1 / (times[j + 1] - times[j - 1]));
  const h = times[i + 1] - times[i], s = (t - times[i]) / h, s2 = s * s, s3 = s2 * s;
  return plus(plus(scale(values[i], 2 * s3 - 3 * s2 + 1), scale(slope(i), (s3 - 2 * s2 + s) * h)), plus(scale(values[i + 1], -2 * s3 + 3 * s2), scale(slope(i + 1), (s3 - s2) * h)));
}

/** The card's axes from its heading (radians from "away from the film camera" toward image right), lean and roll (radians). */
export function cardAxes(heading: number, lean: number, roll: number): {long: Vec3; normal: Vec3; across: Vec3} {
  const flat: Vec3 = [Math.cos(heading), 0, Math.sin(heading)], long: Vec3 = [Math.sin(heading) * Math.cos(lean), Math.sin(lean), -Math.cos(heading) * Math.cos(lean)];
  const up = cross(flat, long); // the side that faces up while the card's back is up
  const normal = add(mul(up, -Math.cos(roll)), mul(flat, Math.sin(roll))); // out of the face: down at roll 0, toward image right at a quarter, up at a half turn
  return {long, normal, across: cross(normal, long)};
}

// A rotation as a unit quaternion [x, y, z, w], for turning the hand from one hold to another the short way.
type Quat = [number, number, number, number];
function quatOf(x: Vec3, y: Vec3, z: Vec3): Quat { // from the three axes of a right-handed frame
  const m = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], tr = m[0] + m[4] + m[8];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4]; }
  if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; return [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s]; }
  if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; return [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s]; }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; return [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
}
function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const to: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b; d = Math.abs(d);
  if (d > 0.9995) return a.map((v, i) => v + (to[i] - v) * t) as Quat;
  const angle = Math.acos(d), ka = Math.sin((1 - t) * angle) / Math.sin(angle), kb = Math.sin(t * angle) / Math.sin(angle);
  return a.map((v, i) => v * ka + to[i] * kb) as Quat;
}
const turn = (q: Quat, v: Vec3): Vec3 => { const u: Vec3 = [q[0], q[1], q[2]], c = cross(u, v); return add(v, add(mul(c, 2 * q[3]), mul(cross(u, c), 2))); };

/**
 * The deal of one card from the shoe to a place. Until the card leaves the shoe the hand holds it there (the pinch of
 * anchor 2.1); it is drawn out, carried and turned over, laid at the place and let go; then the hand goes back to the
 * shoe and takes hold of the next card, where a new deal can begin.
 */
export function planDeal(input: DealInput): Deal {
  const eye = filmEye(input.lens), times = FILM_KEYS.map(k => k.frame / FPS), half = CARD.thickness / 2;
  const shoeHeading = Math.atan2(input.shoe.up[0], -input.shoe.up[2]), shoeLean = Math.asin(Math.max(-1, Math.min(1, input.shoe.up[1]))), shift = sub(input.place, input.placeOfSeat4);
  const points: Vec3[] = FILM_KEYS.map((k, i) => {
    const film: Vec3 = i === 0 ? input.shoe.centre : k.pixel ? onPlane(eye, k.pixel.x, k.pixel.y, k.lift + half)! : [input.placeOfSeat4[0], half, input.placeOfSeat4[2]];
    return add(film, mul([shift[0], 0, shift[2]], BEND[i]));
  });
  // The keyed directions of the long side and of the face. Between the keys both are carried smoothly and squared up again.
  const inShoe = cardAxes(shoeHeading, shoeLean, 0), longs: Vec3[] = LONG.map(l => l ? unit(l) : inShoe.long);
  const faces: Vec3[] = TIP.map((tip, i) => {
    if (i === 0) return inShoe.normal; if (tip === null) return [0, 1, 0];
    const toEye = unit(sub(eye.position, points[i])), rise = unit(sub([0, 1, 0], mul(toEye, toEye[1]))), a = tip * Math.PI / 180; // `rise`: straight up, as far as that is square to the line of sight
    return add(mul(toEye, -Math.cos(a)), mul(rise, Math.sin(a)));
  });
  const card = (t: number): CardPose => {
    const long = unit(through(times, longs, t)), toward = through(times, faces, t), normal = unit(sub(toward, mul(long, dot(toward, long)))), across = cross(normal, long), c = through(times, points, t);
    // No part of the card goes under the felt: its centre is at least as high as its lowest corner hangs below it.
    const floor = half + CARD.height / 2 * Math.abs(long[1]) + CARD.width / 2 * Math.abs(across[1]);
    return {centre: [c[0], Math.max(c[1], floor), c[2]], long, normal, across};
  };
  // The hand while it holds: the fingers come down the card's long side from beyond its upper edge, the palm toward the card's back.
  const holding = (c: CardPose): HandPose => {
    const grip = add(c.centre, mul(c.long, CARD.height / 2 - HAND.inFromEdge)), wrist = add(add(grip, mul(c.long, HAND.reach)), mul(c.normal, -HAND.pad));
    return {wrist: [wrist[0], Math.max(wrist[1], HAND.restLift), wrist[2]], forward: mul(c.long, -1), palm: c.normal, curl: 1, holds: true};
  };
  const frameOf = (h: HandPose) => quatOf(cross(h.palm, h.forward), h.palm, h.forward); // side, palm, forward
  // Letting go: the hand, still turned palm up, draws back along the card's long side and a little up, and the card settles the last way by itself.
  const atShoe = holding(card(0)), letting = holding(card(MOMENTS.lets)), away: HandPose = {...letting, wrist: add(letting.wrist, add(mul(card(MOMENTS.lets).long, HAND.withdraw), [0, 0.012, 0])), curl: 0.5, holds: false};
  const hand = (t: number): HandPose => {
    if (t <= MOMENTS.lets) return holding(card(t));
    if (t <= MOMENTS.lands) { const k = smooth((t - MOMENTS.lets) / (MOMENTS.lands - MOMENTS.lets));
      return {...letting, wrist: add(letting.wrist, mul(sub(away.wrist, letting.wrist), k)), curl: 1 - 0.5 * k, holds: false}; }
    const k = smooth((t - MOMENTS.lands) / (MOMENTS.back - MOMENTS.lands)), q = slerp(frameOf(away), frameOf(atShoe), k);
    const mid = add(mul(add(away.wrist, atShoe.wrist), 0.5), [0, 0.09, 0]), a = add(away.wrist, mul(sub(mid, away.wrist), k)), b = add(mid, mul(sub(atShoe.wrist, mid), k));
    return {wrist: add(a, mul(sub(b, a), k)), forward: turn(q, [0, 0, 1]), palm: turn(q, [0, 1, 0]), curl: 0.5 + 0.5 * smooth((k - 0.6) / 0.4), holds: false}; // open on the way, closing on the next card
  };
  return {target: input.target, duration: MOMENTS.end, card, hand};
}

/** Which side of the card an eye at `from` sees: the face, the back, or the edge when it looks along the card (within `edgeDeg`). */
export function sideSeen(c: CardPose, from: Vec3, edgeDeg = 4): 'FRONT' | 'BACK' | 'EDGE' {
  const d = dot(c.normal, unit(sub(from, c.centre)));
  return Math.abs(d) < Math.sin(edgeDeg * Math.PI / 180) ? 'EDGE' : d > 0 ? 'FRONT' : 'BACK';
}
