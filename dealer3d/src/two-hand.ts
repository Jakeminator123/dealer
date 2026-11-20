// The two-hand deal, laid by hand from pose 2.3 in a real dealer's own tempo. Pure: no I/O and no three.js. The tool is
// tools/deal-film.ts.
//
// What happens, as the session MODEL read it off a film of a real dealer (src/real-deal.ts, and its close-up of the
// turn): her left hand strokes the card out of the shoe and slides it flat along the felt toward her right hand, which
// meets the card's long side on her right, on the half nearest the players. The card then goes END OVER END about its
// short side, toward the players: the two hands stand it up about the short side nearest the players until its back
// faces them, her left hand lets go and goes back to the shoe, and her right hand carries the card low and lets it fall
// on forward and down, so that the face comes up; it lies with its long side toward the player, is pushed the last
// centimetres, and fore and middle finger stay straight on its face over the corner nearest her. The hands overlap: the
// next card is on its way before the last is let go.
// This is another turn than the key turn of the deals read from anchors 2.1 and 2.2 (there the card rolls about its long
// side as the wrist turns). Which of the two the bank is to have is Jakob's choice.
//
// Read (from that film): the moments of every card, where on the felt the hands change, the axis of the turn, which
// hand holds what. Read (from the bank): the two hands' shapes and where they are at the start (the last frame of the
// pose film to anchor 2.3), the table, the shoe and the places. A MODEL, this file's own: the hands' way in metres
// between those points, the body, the grip, and what follows from the bank's shoe holding its card upright where the
// real one holds it lying. The grip: the film never shows the thumb, nor how the card changes side in her hand between
// standing (fingers on its back) and lying (fingers on its face). Here her right hand closes about the card's long side
// before her left lets go, fingers on the back and the thumb on the face, thumb-up; as the card falls the hand swings to
// point along the card and then turns palm down, so that the fingers go round the long edge onto the face, and it slides
// down that side to the corner nearest her. The card is in the hand in every frame; the fingers are drawn, not solved.
// The shoe:
// the bank's card comes out with a short side first, so it is swung on the felt while it is slid (`handOverYaw`), and
// swings the rest of the way while it falls. In the air the card makes ONE turn about one axis: the turn that carries
// the standing card into the lying one.
// The card is one stiff real card all the way.
import {CARD, SHOE, add, cross, dot, filmEye, length, mul, onPlane, shoeCard, shoePose, sub, unit, type Lens, type Vec3} from './camera.ts';
import {BODY, arm, standing, turned} from './body.ts';
import {dealerEdge} from './world.ts';
import {joints, type ArmPose} from './capture.ts';
import {axesOf, between, curled, local, outOf, placed, shapeBetween, thumbToward, track, type Axes} from './hand-pose.ts';
import type {RealCard} from './real-deal.ts';

export type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
export type CardAt = {c: Vec3; l: Vec3; n: Vec3; id: number};
/** The figure standing still: both arms and hands and the head (the last frame of dealer3d/data/till-ankare-2-3.json). `g`: where she looks then; without it, at the card in the shoe. */
export type Still = {L: Limb; R: Limb; h: Vec3; g?: Vec3};
export type DealFrame = {card: CardAt; L: Limb; R: Limb; h: Vec3; g: Vec3};
/** The moments of one card in the film's own frames (not whole numbers), named as in src/real-deal.ts; `turned`: the turn in the air is done. `i` null: her hand stays on the card to the end. */
export type Beat = {to: string; a: number; b: number; c: number; d: number; e: number; l: number; turned: number; f: number; g: number; h: number; i: number | null};
export type Place = {id: string; at: Vec3; real: RealCard};

/** P4.C2 uses the landing grip only. The original closed-grip pilot stays at P4.C1. */
export const contactGripFits = (target: string, grip: NonNullable<Rolled['contactGrip']>): boolean =>
  target === 'P4.C1' || (target === 'P4.C2' && grip === 'landing');
/**
 * For a film in another tempo than the real dealer's (the moments it is given are then its own). `flowing`: the card does
 * not stand still between being stood up and falling: the raising goes straight over into the fall. In her own tempo the
 * card stands for a frame, as hers does; drawn out three times that is three frames of a standing card, and a film model
 * that follows the film then stops there and makes the turn in two frames (the takes of 2026-11-18). Her head then does
 * not begin to turn before the first card moves, so the film stands wholly still until then. `leftBack`: seconds her
 * left hand takes back to the shoe after the last card. `elbows`: where her elbows are to be when the film ends (those of
 * the film in the real tempo, so that the two films end on one and the same picture; where an elbow ends is otherwise a
 * matter of the way it came).
 * `meeting` (with flowing; the fourth take, 2026-11-18): her right hand meets the card. The card does not come to rest at the
 * hand change: it is taken while it still moves, the hand closing about its long side as it arrives, and is stood up from
 * that moment while the hand change goes on toward the place (not toward the real dealer's point, which lay back the way the
 * card came). The card is stood up ever faster and falls fastest first, so it is near upright for four frames and not eight.
 * `push`: metres the card is pushed once it lies flat, in place of the real dealer's four centimetres. `swing`: degrees the
 * card is turned about the plumb line through her grip on top of everything else, most a little way into the fall and none
 * when the turn is done: its outline then changes in every frame while it is near upright (the real dealer's card does turn
 * so, the reading says 45 to 60 degrees in all; the card here is already 40 off square when the hands change).
 * `base` (2026-11-20, the deal from the upright pose of dealer3d/data/till-ankare-2-3-c.json): degrees [leaning forward, turned
 * toward the shoe] her trunk has in the pose the film begins in, in place of pose 2.3's 10 and 8; what a place asks is added
 * to it. `takeAt`: where on the felt (x, z) her right hand takes the first card, in place of where it lies at the start: a
 * hand that waits far from the shoe goes to the card, the card is not slid all the way to it. `leanFrom`: the frame from
 * which her trunk begins to give what the place asks (else from the moment the card moves). `seenForearm`: weight against a
 * left forearm that points at the bank's camera, so that the picture shows her whole arm and not a hand alone; `clearTrunk`:
 * weight against a forearm that goes through her trunk as the stage draws it (both in reachOf).
 * `shared` (with sharedChange): this film's own values in place of those of TWO_HAND.shared, and two things more.
 * `soft`: her right hand goes to the card in one movement led by her forefinger, without stopping behind it before it slides
 * on (the card is at the height of the grip three frames before she closes on it, so that her forefinger has room under it),
 * and her left hand leaves the card at the card's own speed and is slowed, lifted and brought back to the shoe from there
 * (else it leaves at its fastest). `wait`: frames from her left hand letting go until
 * the card begins to turn (else 1), so that her left hand is clear of the edge that comes up.
 */
export type Pace = {flowing?: boolean; leftBack?: number; elbows?: {L: Vec3; R: Vec3}; meeting?: boolean; push?: number; swing?: number; base?: [number, number]; takeAt?: [number, number]; leanFrom?: number; seenForearm?: number; clearTrunk?: number; shared?: Partial<typeof TWO_HAND.shared> & {soft?: boolean; wait?: number}} & OneTurn;
/**
 * `single` (with flowing and meeting; version -e, on Jakob's word of 2026-11-18 that the other hand "tips the card over in
 * the middle"): her left hand only strokes the card out and slides it FLAT to her right hand, rides on it until `l` (a few
 * frames after her right hand has it) and lifts off without raising it. Her right hand alone then turns the card in ONE
 * turn about one axis, from lying face down where the hands change straight to face up over its place (end over end, the
 * free end up and over the held one), without a key in between, so it turns in every frame from `l` until it lies; it is
 * carried low (`carry`, `turnedAt`: the held corner's height over the felt half way through the turn and when it is done).
 * `realTake`: the first card too is taken where the real dealer's hands change for that seat (src/real-deal.ts), her right
 * hand going there from where it lay while the card is stroked out (else it is taken where her right hand lies at the start).
 * `reach`: the reach the body is content with (TWO_HAND.reach); longer leans her less.
 */
export type OneTurn = {single?: boolean; realTake?: boolean; reach?: number; carry?: number; turnedAt?: number} & Rolled;
/**
 * Version -f (with single): `roll`: the card is rolled half a turn about its long side instead of end over end (see
 * `rolling` in twoHandDeal), with her hand closed by `gripBend` (0 flat, 1 the ring of -e) on the middle of its short side
 * nearest her; `handOverYaw`: degrees, how the card lies when the hands change (180: square, its short side toward the
 * players). `body`: degrees [leaning sideways, the right shoulder forward, leaning forward] she has at the place, in place of
 * what the reach asks; reached calmly from the moment the card moves, kept to the end. `tuck`: weight against an elbow away
 * from her side or within 12 cm of shoulder height.
 * `contactGrip: 'sweep'` (2026-11-20, after the take made on 'landing' was failed for a card standing on its edge at the
 * place while the grip let go and the hand turned back): the landing grip, kept closed through the whole turn and until
 * the card's far edge is down. Over the turn's second half the hand goes from that grip (on its side, thumb beside the
 * index) to one with the palm down and the thumb's pad under the index's, the two points on the card unmoved, so nothing
 * is turned back afterwards. The card goes from the hand change to its place in ONE movement that ends as the card lies
 * (no key where it meets the felt, no push); it is lowered with its far edge first, no steeper than her thumb under the
 * near edge needs (found by the rig, 12 degrees), and closes onto the felt at once while the thumb swings out sideways
 * from under it; the hand stays there, its index on the face, to the film's end. The card goes faster through the hand
 * change, so that it is never still on the felt.
 * `sharedChange` (with contactGrip 'sweep'; 2026-11-20, after three takes in which the card lay alone on the felt between
 * the hands or the shoe's window went black): the two hands have the card together. Her right hand closes on it a frame
 * after `l` and her left fingers ride on it for TWO_HAND.shared.both frames more, so the card is never without a hand;
 * the turn begins the frame after her left hand lets go. And her left hand keeps out of the camera's line to the card in
 * the shoe's window, while it rides and on its way back (TWO_HAND.shared: where its fingertips lie, how it is turned).
 */
export type Rolled = {roll?: boolean; contactGrip?: boolean | 'landing' | 'sweep'; sharedChange?: boolean; gripBend?: number; handOverYaw?: number; body?: [number, number, number]; tuck?: number};

export const TWO_HAND = {
  // Where her right hand has the card, metres from the short side it turns about (`up`) and in from its long side on her right (`in`):
  // `taken` from the hand change until it falls (the hand closed about that long side), `laid` when it lies (fore and middle fingertip on the corner nearest her).
  grip: {taken: {up: 0.04, in: 0.006}, laid: {up: 0.015, in: 0.012}},
  handOverYaw: 140,             // degrees: how the card lies when the hands change. 180: a short side squarely toward the players (the real dealer's); 110: as it leaves the bank's shoe
  raise: {stands: 70, lets: 85}, // degrees the card has been stood up when it "stands on edge" (the reading: it leans 20 to 30 degrees back toward her) and when her left hand lets go
  lift: 0.005,                  // the standing card's lower edge over the felt as her left hand lets go (the reading: on the felt, at most 15 mm up)
  heights: {carry: 0.05, turned: 0.03}, // the held corner over the felt while the card is carried (the reading: its lower edge 3 to 4 cm up), and when the turn is done
  slope: 10,                    // degrees the far end is still higher than the held one when the turn is done
  upright: 0.1,                 // the card is carried standing this share of the way from her left hand letting go to the turn being done, before it falls
  turnedBefore: 0.3,            // the turn is done this share of the way from the face showing to the card meeting the felt
  push: 0.04, settle: 0.1,      // the card is pushed this far toward the player once it lies flat, for this many seconds (the close-up: about 4 cm, 0.12 s)
  roll: 85, dip: 8, loose: 0.25, // the right hand: thumb-up by this much while it stands the card up and holds it standing, its fingers pointing this much further down than at rest, and how far closed it comes to a card
  inward: 50,                   // degrees: the way the hand points while it holds the standing card (0 toward the players, 90 toward the picture's right): in over the card's lower half from her right.
                                // (half way from there to the way it will point at the place, to save the hand a swing). More toward the picture's right where the hands change
                                // near her own edge of the table: her wrist, 17 cm behind her fingertips, is never more than `behindEdge` behind that edge, or her elbow would be in her body
  behindEdge: 0.03,
  rollHeld: 0.35, turnsFirst: 0.5, // of the card's fall: the hand stays thumb-up this share of it, and has swung to point along the card's long side by this share, before it turns palm down (so the fingers go round the card's long edge and not through the card)
  behind: 0.026, topIn: 0.004, leftIn: 0.022, // her left fingertips fall this far behind the card's middle while they slide it, are this far in from its upper edge when it stands, and this far from its middle line toward her left (clear of her right hand)
  leftYaw: 45, leftBack: 0.3,   // her left hand turns this far toward her right at the farthest hand change (0.3 m from the mouth), and after the last card is back at the shoe in this many seconds
  arc: {right: 0.035, left: 0.025},
  sway: 8,                      // degrees her body leans sideways toward a place half a metre to the side
  lean: 24, twist: 22, reach: 0.46, // what the body adds, at most, for a place the arm cannot reach: degrees toward it, degrees of the right shoulder forward; the reach it is content with
  pivot: -0.05,                 // the hand points at a place as from her elbow at rest, moved this far along z
  floor: 0.006,                 // no point of a hand comes nearer the felt than this
  sweepIndex: [26, 26, 10],     // contactGrip 'sweep': the index's three bends in the hand that lays the card, palm down, the thumb's pad under the index's
  sweepThumb: 0.03,             // and how far to the side her thumb has swung once it is out from under the card (the card's long edge is 19 mm from the thumb's point under it)
  // sharedChange. Her right hand has the card `grasp` frames after `l` and her left fingers ride on it `both` frames more.
  // Her left hand hangs over the card from the shoe's side, clear of the camera's line to the card in the shoe's window: its
  // fingertips `along` from the card's middle toward the shoe's end of it and `across` from its middle line, the hand turned
  // `swing` degrees about the plumb line (the way the other grips turn it 15), its wrist raised by `pitch` degrees, closed the
  // share `close` of the way to flat; back to the shoe it goes by `arc` (metres, most half way: up, over the window), and
  // has gone the share `home` of that way before it begins to turn back to how it lay (0: it turns the whole way; a hand
  // that comes low, from the camera's side of the shoe, is else before the window with its fingers until it lies).
  // Her right hand waits `back` behind its hold along the card and `side` beside it, is there `ready` frames before it closes
  // (on its way it is lifted `rise` and bowed `aside`, round her left thumb), and slides onto the moving card in `slide` frames.
  shared: {grasp: 1, both: 5, along: 0.018, across: 0.006, swing: 60, pitch: -45, close: 0.9, arc: [0, 0.1, 0] as [number, number, number], home: 0, rise: 0.03, aside: [-0.06, 0, 0] as [number, number, number], back: 0.06, side: -0.05, slide: 4, ready: 4},
};
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI, UP: Vec3 = [0, 1, 0];
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t), lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** From 0 to 1 over t from 0 to 1, leaving at the slope `from` and arriving at the slope `to` (1: the mean speed; smooth is 0 and 0). */
const eased = (t: number, from: number, to: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t) + from * t * (1 - t) * (1 - t) - to * t * t * (1 - t);
const heading = (yaw: number): Vec3 => [Math.sin(yaw), 0, Math.cos(yaw)], clamp = (v: number) => Math.max(0, Math.min(1, v));
/** A track through keys of which two may fall on the same moment: the later of such a pair is moved a quarter of a frame on. */
const through = (keys: [number, number][]) => { const out: [number, number][] = []; for (const k of keys) out.push(out.length && k[0] - out[out.length - 1][0] < 0.25 ? [out[out.length - 1][0] + 0.25, k[1]] : k); return track(out); };

/** The film's frames of every card's moments: the real ones at `fps`, the first card's `a` at frame `lead`. */
export function beatsOf(places: {id: string; real: RealCard}[], lead: number, fps: number): Beat[] {
  const t0 = places[0].real.a, at = (s: number) => lead + (s - t0) * fps;
  return places.map(({id, real: r}, k) => ({to: id, a: at(r.a), b: at(r.b), c: at(r.c), d: at(r.d), e: at(r.e), l: at(r.l), turned: at(r.f + (r.g - r.f) * TWO_HAND.turnedBefore), f: at(r.f), g: at(r.g), h: at(Math.max(r.h, r.g + TWO_HAND.settle)), i: k === places.length - 1 ? null : at(r.i)}));
}

/** A card's three axes from the way its held end points along the felt (`yaw`: the other way), how much higher that end is than the other (negative: lower), and which side is up. */
function cardAxes(yaw: number, pitch: number, faceUp: boolean) {
  const flat = mul(heading(yaw), -1), long = add(mul(flat, Math.cos(pitch)), mul(UP, Math.sin(pitch))), n = sub(mul(UP, Math.cos(pitch)), mul(flat, Math.sin(pitch))), normal = faceUp ? n : mul(n, -1);
  return {long, normal, across: cross(normal, long)};
}
type CardAxes = ReturnType<typeof cardAxes>;
type CardPose = {centre: Vec3; long: Vec3; normal: Vec3};

// The joint spheres drawn by pointHand in stage.ts. Contact is measured at their surfaces.
const jointRadius = (i: number) => i === 0 ? 0.0125 : [1, 5, 9, 13, 17].includes(i) ? 0.0105 : 0.0082;
const pinchInset = 0.005;

function aboveFelt<T extends {wrist: Vec3; points: Vec3[]}>(hand: T): T {
  const lift = Math.max(0, ...hand.points.map((p, i) => jointRadius(i) - p[1]));
  if (!lift) return hand;
  const step: Vec3 = [0, lift, 0];
  return {...hand, wrist: add(hand.wrist, step), points: hand.points.map(p => add(p, step))};
}

/** Close the thumb against the index finger, and attach that shape to the card's short edge. */
function contactGripOf(flat: Vec3[], landing: boolean, pad: number[] | null = null) {
  // (pad, for the sweep: the same two points of the card held with the hand palm down over it, the thumb's pad under the index's; `pad` is the index's three bends)
  const fingers = curled(flat, pad ? {1: pad, 2: [pad[0] - 20, pad[1] - 18, pad[2] - 6], 3: [-6, 6, 0], 4: [-8, 6, 0]} : {1: [0, 6, 8], 2: landing ? [19, 20, 11] : [38, 38, 12], 3: [44, 38, 14], 4: [34, 28, 12]});
  const tip = fingers[8], separation = 2 * jointRadius(8) + CARD.thickness;
  // The thumb reaches across the index, rather than curling under the palm. The other fingers fold away from the edge.
  const towardThumb = unit(pad ? [-0.12, 1, 0.1] : landing ? [0.050, 0.233, 0.971] : [0.168, -0.122, -0.978]);
  const shape = thumbToward(fingers, add(tip, mul(towardThumb, separation + (landing ? 0.0008 : 0.00045))), 60);
  const pinch = mul(add(shape[4], tip), 0.5), normal = unit(landing ? sub(tip, shape[4]) : sub(shape[4], tip));
  const outward = mul(pinch, -1), along = unit(sub(outward, mul(normal, dot(outward, normal))));
  // Hand coordinates have across = palm × forward. The corresponding card basis in those coordinates reverses that cross product.
  const long = turned(along, normal, -rad(landing ? 15 : 30)), across = cross(long, normal);
  const surface = (card: CardPose, along: number, high: number) => add(add(
    add(card.centre, mul(card.long, along)), mul(card.normal, high)), mul(cross(card.normal, card.long), landing ? -0.012 : 0));
  const at = (card: CardPose) => {
    const side = cross(card.normal, card.long);
    const rotate = (p: Vec3) => add(add(mul(card.long, dot(p, long)), mul(card.normal, dot(p, normal))), mul(side, dot(p, across)));
    const axes: Axes = {forward: rotate([1, 0, 0]), palm: rotate(UP), across: rotate([0, 0, 1])};
    const edge = landing ? surface(card, CARD.height / 2 - pinchInset, 0) : add(card.centre, mul(card.long, CARD.height / 2 - pinchInset));
    const wrist = sub(edge, outOf(pinch, axes));
    return {wrist, points: placed(shape, axes, wrist), axes, shape};
  };
  const needsHeight = (axes: CardAxes) => Math.max(...at({centre: [0, 0, 0], ...axes}).points.map((p, i) => jointRadius(i) - p[1])) + 0.0005;
  return {at, needsHeight, surface};
}

/** The single turn that carries one card into another, the short way round. */
function turnOf(a: CardAxes, b: CardAxes): {axis: Vec3; angle: number} {
  const A = [a.long, a.normal, a.across], B = [b.long, b.normal, b.across], R = [0, 1, 2].map(r => [0, 1, 2].map(c => A.reduce((s, ak, k) => s + B[k][r] * ak[c], 0)));
  const angle = Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))), anti: Vec3 = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  if (length(anti) < 1e-6) throw Error('The two card poses are half a turn apart: the turn between them has no single short way.');
  return {axis: unit(anti), angle};
}
/** Whether a point is inside the shoe (the model wedge where the film has it), `margin` metres from its walls. */
export function shoeHolds(lens: Lens, margin = 0.005): (q: Vec3) => boolean {
  const pose = shoePose(lens), run = SHOE.frontHeight / Math.tan(SHOE.plateLean);
  return q => { const d = sub(q, pose.front), s = dot(d, pose.back), f = dot(d, pose.far);
    return s > margin && s < SHOE.length && f > margin && f < SHOE.width - margin && q[1] < (s < run ? s * Math.tan(SHOE.plateLean) : SHOE.frontHeight + (SHOE.backHeight - SHOE.frontHeight) * (s - run) / (SHOE.length - run)) - margin; };
}

const BASE = {lean: rad(10), twist: rad(8)}; // pose 2.3 (tools/pose-film.ts without --body)
/** Her body: bent from the hip and turned as in the pose the film begins in (`base`; pose 2.3 unless it is given), and `more` on top of that: [leaning sideways, the right shoulder forward, leaning forward], radians. */
function bodyOf(lens: Lens, base = BASE) { const frame = standing(lens), hip = frame.hip;
  return (more: Vec3) => { const lx = more[0], lz = base.lean + more[2], twist = base.twist + more[1], lean = Math.hypot(lx, lz), axis = unit(cross(UP, [lx, 0, lz]));
    const pose = (p: Vec3, k = 1): Vec3 => { const spine = turned(UP, axis, lean * k); return add(hip, turned(turned(sub(p, hip), axis, lean * k), spine, twist * k)); };
    return {shoulders: [pose(frame.shoulders[0]), pose(frame.shoulders[1])] as [Vec3, Vec3], head: pose(frame.head, 0.85), neck: pose(frame.neck)}; };
}
const SEEN_FOREARM = 40; // degrees from the camera's line of sight within which a forearm reads as a hand without an arm
/** The arm whose elbow, of all the places it can be, asks least of the wrist, is nearest where it was and hangs lowest: not over the shoulder, not in the body, the table or the shoe.
 * `seen`: weight against a LEFT forearm that points at the bank's camera (nearer its line of sight than SEEN_FOREARM degrees).
 * `clear`: weight against a forearm that goes through her trunk as it is drawn, where the picture shows an arm cut off by her body. */
function reachOf(lens: Lens, tuck = 0, contactGrip: Rolled['contactGrip'] = false, seen = 0, clear = 0) { const hip = standing(lens).hip, edgeZ = dealerEdge(lens)[2], eyeAt = filmEye(lens).position, endOn = Math.cos(rad(SEEN_FOREARM));
  const inside = shoeHolds(lens), torso = (e: Vec3, neck: Vec3) => { const d = sub(neck, hip), t = clamp(dot(sub(e, hip), d) / dot(d, d)); return length(sub(e, add(hip, mul(d, t)))); };
  // Her trunk as the stage draws it (dealer3d/src/stage.ts: an egg from the hip to the shoulders): how far out a point is, 1 at its surface.
  const egg = (shoulders: [Vec3, Vec3]) => { const mid = mul(add(shoulders[0], shoulders[1]), 0.5), across = sub(shoulders[1], shoulders[0]), wide = length(across), x = unit(across), up = sub(mid, hip), tall = length(up), z = unit(cross(x, unit(up))), y = cross(z, x), c = lerp(hip, mid, 0.52);
    return (p: Vec3) => { const d = sub(p, c); return Math.hypot(dot(d, x) / (wide * 0.47), dot(d, y) / (tall * 0.56), dot(d, z) / 0.095); }; };
  return (shoulder: Vec3, neck: Vec3, hand: {wrist: Vec3; points: Vec3[]}, sign: number, was: Vec3, i: number, shoulders?: [Vec3, Vec3]): ArmPose & {forced: boolean} => { const out = clear && shoulders ? egg(shoulders) : null;
    const far = length(sub(hand.wrist, shoulder)); if (far > (BODY.upperArm + BODY.forearm) * 0.985) throw Error(`frame ${i}: the ${sign > 0 ? 'right' : 'left'} wrist is ${far.toFixed(3)} m from the shoulder, out of the arm's reach.`);
    const dir = unit(sub(hand.wrist, shoulder)), u = unit(cross(dir, Math.abs(dir[1]) < 0.9 ? UP : [1, 0, 0])), v = cross(dir, u); let best: ArmPose | null = null, least = Infinity, any: ArmPose | null = null, leastAny = Infinity;
    for (let k = 0; k < 120; k++) { const t = k * Math.PI / 60, e = arm(shoulder, hand.wrist, add(mul(u, Math.cos(t)), mul(v, Math.sin(t)))).elbow, pose: ArmPose = {shoulder, elbow: e, wrist: hand.wrist, stretch: 1, points: hand.points};
      const joint = joints(pose, sign), keepRightElbow = contactGrip === true && sign === 1, lowRightElbow = (contactGrip === 'landing' || contactGrip === 'sweep') && sign === 1;
      // On the pilot the hand is driven by the card. Follow that roll with the elbow, without switching to the opposite hinge.
      const rollCost = keepRightElbow ? 3 * (Math.max(0, joint.wrist - 90) + (joint.twist === null ? 0 : Math.max(0, 90 - Math.abs(joint.twist)))) : 0;
      const lowCost = lowRightElbow ? 700 * Math.max(0, e[1] - 0.075) + 12 * Math.max(0, joint.wrist - 88) : 0;
      const cost = joint.wrist + rollCost + lowCost + (keepRightElbow ? 1200 : lowRightElbow ? 550 : 150) * length(sub(e, was)) + 150 * Math.max(0, e[1] - shoulder[1] + 0.15) + tuck * (Math.max(0, torso(e, neck) - 0.16) + Math.max(0, e[1] - shoulder[1] + 0.12)) + (seen && sign < 0 ? seen * Math.max(0, Math.abs(dot(unit(sub(hand.wrist, e)), unit(sub(hand.wrist, eyeAt)))) - endOn) : 0) + (out ? clear * Math.max(0, 1 - Math.min(...[0, 0.2, 0.4, 0.6, 0.8].map(s => out(lerp(e, hand.wrist, s))))) : 0), crossing = e[2] < edgeZ && hand.wrist[2] > edgeZ ? e[1] + (hand.wrist[1] - e[1]) * (edgeZ - e[2]) / (hand.wrist[2] - e[2]) : 1;
      if (cost < leastAny) { leastAny = cost; any = pose; }
      if (e[1] > shoulder[1] + 0.02 || torso(e, neck) < 0.12 || (e[2] > edgeZ - 0.03 && e[1] < 0.04) || crossing < 0.035 || [0.25, 0.5, 0.75].some(s => inside(lerp(e, hand.wrist, s))) || inside(e)) continue;
      if (cost < least) { least = cost; best = pose; } }
    return best ? {...best, forced: false} : {...any!, forced: true}; }; // forced: no place of the elbow passed the rules, and the least bad one was taken
}
/**
 * The start with her right hand laid where an anchor picture has it: the hand as it is, turned about a plumb line until it
 * points `yawDeg` (0 toward the players, 90 toward the picture's right) and moved along the felt until the tip of its middle
 * finger is drawn on the pixel `tip` of the bank's picture; the arm bent anew. A film made from a pose and the anchor
 * picture a film model made of that pose do not have the hand in the same place; the next film begins on the picture.
 */
export function startOnAnchor(lens: Lens, start: Still, tip: {x: number; y: number}, yawDeg: number): Still {
  const was = start.R.p, f = sub(was[9], was[0]), by = rad(yawDeg) - Math.atan2(f[0], f[2]), to = onPlane(filmEye(lens), tip.x, tip.y, was[12][1]); if (!to) throw Error('The pixel is not on the felt.');
  const points = was.map(q => add(to, turned(sub(q, was[12]), UP, by))), a = reachOf(lens)(start.R.s, bodyOf(lens)([0, 0, 0]).neck, {wrist: points[0], points}, 1, start.R.e, 0);
  return {...start, R: {s: a.shoulder, e: a.elbow, w: a.wrist, k: 1, p: a.points}};
}
/**
 * The whole film of `frameCount` frames at `fps`: `places` in the order they are dealt to, each a point on the felt and
 * the real card whose moments it takes; the first card's `a` falls on frame `lead`. Throws if a hand is out of the arm's
 * reach in any frame. `pace`: see Pace. `forced` names the frames (R or L and the frame) in which an elbow had no place free of her body,
 * the table and the shoe. Returns the frames, the cards that lie (each from the frame the next card begins to move), the
 * beats, and what was chosen for each card.
 */
export function twoHandDeal(lens: Lens, start: Still, places: Place[], lead: number, fps: number, frameCount: number, pace: Pace = {}) {
  const M = TWO_HAND, N = frameCount, beats = beatsOf(places, lead, fps), hip = standing(lens).hip, edgeZ = dealerEdge(lens)[2];
  const shoe = shoePose(lens), inShoe = shoeCard(shoe), outward = mul(shoe.back, -1), mouth = add(shoe.front, mul(shoe.far, SHOE.width / 2)), lean0 = Math.cos(SHOE.plateLean);
  const H = CARD.height, W = CARD.width, lying = CARD.thickness / 2, yawHand = rad(pace.handOverYaw ?? M.handOverYaw);
  /** A card's middle from the point of it her right hand has, `at.up` from the short side it turns about and `at.in` from the long side on her right. */
  const centreOf = (grip: Vec3, axes: CardAxes, at: {up: number; in: number}): Vec3 => sub(sub(grip, mul(axes.long, H / 2 - at.up)), mul(axes.across, W / 2 - at.in));

  // ---- her right hand: its shapes, and its axes as three angles -------------------------------------------------
  const axR0 = axesOf(start.R.p, 1), flatR = local(start.R.p, axR0), tips = (s: Vec3[]) => mul(add(s[8], s[12]), 0.5);
  // The pads of fore and middle finger: under the middle of their two tips, as far toward the palm as the felt is from them at the start.
  const pad = (lying - add(start.R.w, outOf(tips(flatR), axR0))[1]) / axR0.palm[1], padOf = (s: Vec3[]): Vec3 => add(tips(s), [0, pad, 0]);
  const bent = curled(flatR, {1: [20, 18, 8], 2: [20, 18, 8], 3: [28, 24, 10], 4: [30, 26, 12]}), gripR = thumbToward(bent, add(padOf(bent), [-0.022, 0.02, 0]));
  const angles = (a: Axes) => { const f = a.forward, yaw = Math.atan2(f[0], f[2]), dip = -Math.asin(f[1]), down = unit(sub([0, -1, 0], mul(f, -f[1]))); return {yaw, dip, roll: Math.atan2(dot(cross(down, a.palm), f), dot(down, a.palm))}; };
  const axesAt = (yaw: number, dip: number, roll: number): Axes => { const h = heading(yaw), forward: Vec3 = [h[0] * Math.cos(dip), -Math.sin(dip), h[2] * Math.cos(dip)], palm = turned(unit(sub([0, -1, 0], mul(forward, -forward[1]))), forward, roll); return {forward, palm, across: cross(palm, forward)}; };
  const rest = angles(axR0), pick = add(start.R.w, outOf(padOf(flatR), axR0)); // where her fingertips' pads are at the start: there she takes the first card
  const pivot: Vec3 = [start.R.e[0], 0, start.R.e[2] + M.pivot], yawTo = (p: Vec3) => Math.atan2(p[0] - pivot[0], p[2] - pivot[2]);

  // ---- the card out of the shoe ---------------------------------------------------------------------------------
  // It stands on the plate with its lower end a little up it. Stroked out, it slides down the plate to the foot, then its
  // lower end goes out along the felt while its upper end comes down the plate, then it lies flat before the mouth.
  const first = SHOE.windowLift / Math.sin(SHOE.plateLean), out = first + H;
  const faceIn = (long: Vec3): Vec3 => { const n = unit(cross(shoe.far, long)); return n[1] > 0 ? mul(n, -1) : n; };
  const leaving = (a: number): {centre: Vec3; long: Vec3; normal: Vec3} => {
    let low: Vec3, high: Vec3, lift = 0.001;
    if (a <= first) { low = add(mouth, mul(inShoe.up, first - a)); high = add(low, mul(inShoe.up, H)); }
    else if (a <= first + H) { const x = a - first, b = (-2 * lean0 * x + Math.sqrt(4 * lean0 * lean0 * x * x - 4 * (x * x - H * H))) / 2; low = add(mouth, mul(outward, x)); high = add(mouth, mul(inShoe.up, Math.max(0, b))); lift = 0.001 + (lying - 0.001) * x / H; }
    else { const x = a - first - H; low = add(mouth, mul(outward, H + x)); high = add(mouth, mul(outward, x)); lift = lying; }
    const long = unit(sub(low, high)), normal = faceIn(long); return {centre: sub(mul(add(low, high), 0.5), mul(normal, lift)), long, normal}; };
  const standingCard = leaving(0), clearCard = leaving(out), yawOut = Math.atan2(shoe.back[0], shoe.back[2]); // the card's held end points out of the mouth: its yaw is the way into it

  // ---- her body --------------------------------------------------------------------------------------------------
  const bodyAt = bodyOf(lens, pace.base ? {lean: rad(pace.base[0]), twist: rad(pace.base[1])} : undefined);

  // ---- each card: where the hands change, where it lies, how the hand lies on it, what the body adds ----------------
  const lyingAxes = cardAxes(0, 0, true), flatAxes = cardAxes(yawHand, 0, false);
  const single = !!(pace.single && pace.meeting && pace.flowing), reachOk = pace.reach ?? M.reach;
  // roll (version -f): the card is taken by the middle of its short side nearest her and rolled half a turn about the line
  // between the way it lies when the hands change and the way it lies on its place (with handOverYaw 180 that is its own
  // long side), the edge on her left going up: seen from the bank it is never drawn larger than lying.
  const rolling = single && !!pace.roll, rollFlat = cardAxes(yawHand + Math.PI, 0, false), rollTaken = {up: 0.012, in: W / 2};
  if (pace.contactGrip && (!rolling || places.length !== 1 || !contactGripFits(places[0].id, pace.contactGrip))) throw Error('Contact grip needs one P4.C1 roll, or a landing grip at P4.C2.');
  if (pace.sharedChange && pace.contactGrip !== 'sweep') throw Error('A shared hand change needs the sweep grip.');
  const sweeps = pace.contactGrip === 'sweep', shares = sweeps && !!pace.sharedChange, S = {...M.shared, ...pace.shared}, soft = shares && !!S.soft, supportsLanding = pace.contactGrip === 'landing' || sweeps, pinched = pace.contactGrip ? contactGripOf(flatR, supportsLanding) : null;
  // sweep: the hand on the card, a share `m` of the way from the grip that turns it (thumb beside the index, the hand on its
  // side) to the grip that lays it (the same two points of the card, the hand palm down over it), so that the card turns in
  // the pinch while the wrist goes on and no finger changes side. The index is on its point of the face, the thumb as near
  // its point under it as it comes; `thumbOut`: the thumb that share of the way out from under the short edge, not below the felt.
  const padGrip = sweeps ? contactGripOf(flatR, true, M.sweepIndex) : null, tipHigh = lying + jointRadius(8);
  const gripOf = (pose: CardPose, m: number, thumbOut = 0) => {
    const A = pinched!.at(pose), B = padGrip!.at(pose), blend = shapeBetween(A.shape, B.shape, m), axes = m <= 0 ? A.axes : m >= 1 ? B.axes : between(A.axes, B.axes, m);
    const wrist = sub(pinched!.surface(pose, H / 2 - pinchInset, tipHigh), outOf(blend[8], axes));
    // Leaving, the thumb swings out sideways from under the card, along its underside and past its long edge, and lies on the felt beside it.
    const under = add(pinched!.surface(pose, H / 2 - pinchInset, -tipHigh), mul(cross(pose.normal, pose.long), -M.sweepThumb * smooth(thumbOut)));
    // (aimed higher than it comes: the thumb is at its reach there, and ends lower than its aim)
    const target = sub(thumbOut > 0 ? [under[0], Math.max(under[1], jointRadius(4) + 0.0005) + 0.016 * smooth(thumbOut), under[2]] : under, wrist);
    const shape = thumbToward(blend, [dot(target, axes.forward), dot(target, axes.palm), dot(target, axes.across)], 60);
    return {wrist, points: placed(shape, axes, wrist), axes, shape};
  };
  const sweepNeeds = (axes: CardAxes, m: number) => Math.max(...gripOf({centre: [0, 0, 0], long: axes.long, normal: axes.normal}, m).points.map((p, i) => jointRadius(i) - p[1])) + 0.0005;
  // The least the lying card is tipped (its near edge up, its far edge on the felt) for the laying hand, thumb under that edge, to clear the felt.
  const sweepTilt = sweeps ? (() => { for (let t = 6; t <= 40; t += 0.5) { const a = cardAxes(0, 0, true), long = turned(a.long, a.across, -rad(t)), normal = turned(a.normal, a.across, -rad(t));
    if (lying + H / 2 * Math.abs(long[1]) - lying * (1 - Math.abs(normal[1])) >= sweepNeeds({long, normal, across: a.across}, 1)) return t; } throw Error('The sweep grip finds no tilt at which the laying hand clears the felt.'); })() : 0;
  const cards = places.map((place, k) => { const b = beats[k], r = place.real, step = (s: [number, number]): Vec3 => [shoe.front[0] + s[0], lying, shoe.front[2] + s[1]];
    // The first card is taken where her right hand waits (or, realTake, where the real dealer's hands change); every other where the real dealer's hands change, counted from the shoe's mouth.
    // (takeAt: the first card is taken at that point of the felt, her right hand going there from where it lay)
    const waits = k === 0 && !pace.realTake, set: Vec3 | null = k === 0 && pace.takeAt ? [pace.takeAt[0], lying, pace.takeAt[1]] : null, take: Vec3 = set ?? (waits ? pick : step(r.take)), go: Vec3 = waits ? [take[0] + r.go[0] - r.take[0], lying, take[2] + r.go[1] - r.take[1]] : step(r.go);
    const centre: Vec3 = [place.at[0], lying, place.at[2]], grip = add(add(centre, mul(lyingAxes.long, H / 2 - M.grip.laid.up)), mul(lyingAxes.across, W / 2 - M.grip.laid.in)), yaw = yawTo(grip);
    const padHeight = lying + jointRadius(8);
    const press = supportsLanding && pinched ? pinched.surface({centre, ...lyingAxes}, H / 2 - pinchInset, padHeight)
      : pinched ? add(centre, mul(lyingAxes.long, H / 2 - M.grip.laid.up)) : grip;
    const axes = axesAt(pinched ? -rad(15) : yaw, rest.dip, rest.roll), wrist = sub(press, outOf(supportsLanding ? flatR[8] : padOf(flatR), axes));
    const toward = unit([place.at[0] - hip[0], 0, place.at[2] - hip[2]]), sway: Vec3 = [rad(M.sway) * Math.max(-1, Math.min(1, place.at[0] / 0.5)), rad(6) * clamp(-place.at[0] / 0.5), 0];
    let share = 0, more = sway; if (pace.body) { more = [rad(pace.body[0]), rad(pace.body[1]), rad(pace.body[2])]; share = 1; } else for (; share <= 1.0001; share += 0.05) { more = add(sway, [toward[0] * rad(M.lean) * share, rad(M.twist) * share * clamp((place.at[0] + 0.1) / 0.3), toward[2] * rad(M.lean) * share]); if (length(sub(wrist, bodyAt(more).shoulders[0])) <= reachOk) break; }
    if (!pace.body && share > 1.0001) throw Error(`${place.id}: the right arm does not reach (${length(sub(wrist, bodyAt(more).shoulders[0])).toFixed(3)} m from the shoulder with all the body gives).`);
    const seat = {centre, grip, yaw, axes, wrist, more, share}, meet = !!(pace.meeting && pace.flowing);
    if (meet) { const on = unit([grip[0] - take[0], 0, grip[2] - take[2]]); go[0] = take[0] + on[0] * 0.05; go[2] = take[2] + on[2] * 0.05; }

    // Out of the shoe and along the felt to the hand change: one movement, at rest at both ends.
    const handOver = rolling ? centreOf(take, rollFlat, rollTaken) : centreOf(take, flatAxes, M.grip.taken), far = length(sub(handOver, clearCard.centre)), way = through([[b.b, 0], ...(b.d - b.c >= 1 ? [[b.c, out] as [number, number]] : []), [b.d, out + far], ...(meet ? [[b.d + 3, out + far + (sweeps ? 0.036 : 0.018)] as [number, number]] : [])]); // (a card that is taken as it comes out has no moment of its own for being out)
    const sliding = (i: number) => { const a = way(i); if (a <= out) return leaving(a); const s = (a - out) / (far || 1), yawNow = yawOut + (yawHand - yawOut) * smooth(s), axes = cardAxes(yawNow, 0, false);
      return {centre: lerp(clearCard.centre, handOver, sweeps ? s : smooth(s) * 0.5 + s * 0.5), long: axes.long, normal: axes.normal}; }; // (sweep: the card does not slow as it comes to the hand change)
    // From the hand change on, the point her right fingertips hold (the corner of the card that ends nearest her): along the
    // felt from `take` to `go` while the card is stood up, then to where the card meets the felt, and pushed to the place.
    // (meeting: a key before the hand change, on the way the card came, so that the point is already moving as the hand takes the card; the tracks are only read from the hand change on)
    // (sweep: that key lies between the way the card came and the way it goes on, and further back, so the card is moving both along and across the table as it is taken)
    const came2 = unit(sub(handOver, clearCard.centre)), before: Vec3 = sweeps ? sub(take, mul(unit(add(came2, unit([centre[0] - take[0], 0, centre[2] - take[2]]))), 0.045)) : sub(take, mul(came2, 0.02)), early = (j: number): [number, number][] => meet ? [[b.d - 3, before[j]]] : [];
    // (single: no key where her left hand lets go, so the card goes on from the hand change to its place in one movement)
    const meets: Vec3 = [grip[0], lying, grip[2] - (pace.push ?? M.push)], viaGo = (j: number): [number, number][] => single ? [] : [[b.l, go[j]]];
    // (sweep: the held point is the middle of the short side nearest her all the way, and goes to where that lies on the place in one movement)
    const ends: Vec3 = sweeps ? add(centre, mul(lyingAxes.long, H / 2 - rollTaken.up)) : grip, viaMeets = (j: number): [number, number][] => sweeps ? [] : [[b.g, meets[j]]];
    const gx = through([...early(0), [b.d, take[0]], ...viaGo(0), ...viaMeets(0), [b.h, ends[0]]]), gz = through([...early(2), [b.d, take[2]], ...viaGo(2), ...viaMeets(2), [b.h, ends[2]]]);
    // Stood up about the short side nearest the players: that side stays on the felt, so the held corner is as high as the card's lean puts it, and a little more as her left hand lets go.
    // (flowing: a key beyond the moment her left hand lets go keeps the card turning as that moment is passed; the track is only read up to it)
    const raised = meet ? through([[b.d - 3, -rad(12)], [b.d, 0], [b.e, rad(60)], [b.l, rad(M.raise.lets)], [b.l + 2, rad(M.raise.lets + 26)]]) : through([[b.d, 0], ...(b.l - b.e > 0.4 ? [[b.e, rad(M.raise.stands)] as [number, number]] : []), [b.l, rad(M.raise.lets)], ...(pace.flowing && b.l - b.e > 0.4 ? [[2 * b.l - b.e, rad(2 * M.raise.lets - M.raise.stands)] as [number, number]] : [])]), standsAt = (i: number) => lying + M.grip.taken.up * Math.sin(raised(i)) + M.lift * smooth((i - b.d) / (b.l - b.d));
    const carried = through([[b.l, standsAt(b.l)], [(b.l + b.turned) / 2, M.heights.carry], [b.turned, M.heights.turned], [b.g, lying]]);
    const low = through([[b.d, lying], [b.l, lying + 0.004], [(b.l + b.turned) / 2, pace.carry ?? M.heights.carry], [b.turned, pace.turnedAt ?? M.heights.turned], [b.g, lying]]); // single: the held corner off the felt only as the card turns
    const held = (i: number): Vec3 => i <= b.d ? take : single ? [gx(i), low(i), gz(i)] : [gx(i), i <= b.l ? standsAt(i) : carried(i), gz(i)];
    const upAt = rolling ? through([[b.turned, rollTaken.up], [b.g, M.grip.laid.up]]) : through([[b.l, M.grip.taken.up], [b.turned, M.grip.laid.up]]), inAt = rolling ? through([[b.turned, rollTaken.in], [b.g, M.grip.laid.in]]) : through([[b.l + (b.turned - b.l) * 0.6, M.grip.taken.in], [b.g, M.grip.laid.in]]), has = (i: number) => sweeps ? rollTaken : ({up: upAt(i), in: inAt(i)}); // her hand slides down the long side to the corner while the card falls
    const slopeAt = through([[b.turned, -rad(M.slope)], [b.g, 0]]), turnFrom = pace.flowing ? b.l : b.l + (b.turned - b.l) * M.upright, even = pace.flowing ? 0.9 : 0.4, stood = cardAxes(yawHand, -rad(M.raise.lets), false), faceUp = cardAxes(0, -rad(M.slope), true), turn = turnOf(stood, faceUp);
    const flatHere = rolling ? rollFlat : cardAxes(yawHand, 0, false), once = rolling ? (() => { const u0 = unit(add(rollFlat.long, lyingAxes.long)), u = u0[2] > 0 ? mul(u0, -1) : u0, herLeft = cross(u, UP); const axis = turned(herLeft, u, 0.1)[1] > 0 ? u : mul(u, -1); return {axis: pinched && !supportsLanding ? mul(axis, -1) : axis, angle: Math.PI}; })() : turnOf(flatHere, faceUp); // single: the one turn from lying face down where the hands change to face up over the place
    const swing = pace.swing ? through([[b.d + (b.e - b.d) * 0.5, 0], [b.l + (b.turned - b.l) * 0.45, -rad(pace.swing)], [b.turned, 0]]) : () => 0;
    // Put the far edge on the felt while the grip is still closed. Keep the near edge raised until the index has cleared it.
    // (sweep: nothing is held still after the far edge is down)
    // (sharedChange: her right hand has the card first, her left lets go of it `both` frames later, and only then is it turned)
    const graspAt = b.l + (shares ? S.grasp : 5), lets = shares ? graspAt + S.both : b.l, turnBegins = pinched ? Math.max(graspAt, lets) + (shares ? S.wait ?? 1 : 1) : b.l + 2, releaseAt = b.g + (sweeps ? 0 : supportsLanding ? 6 : 2);
    if (pinched && (b.turned - turnBegins < 9 || b.h - releaseAt < 6)) throw Error('The P4 grip needs nine frames to turn and six to settle after the edge clears.');
    const landing = sweeps ? through([[b.turned - 8, 0], [b.turned, rad(sweepTilt)], [b.g, rad(sweepTilt)], [b.h, 0]]) : through([[b.turned - 8, 0], [b.turned, rad(19)], [b.g, rad(29)], [releaseAt, rad(29)], [b.h, 0]]);
    // (soft: the card is up three frames before her right hand closes, for her index comes in under it sooner)
    const roomBy = soft ? graspAt - 3 : graspAt, liftFrom = shares ? roomBy - 9 : b.l - 4, gripHeight = pinched?.needsHeight(rollFlat) ?? 0;
    // (sweep: the hand goes from the turning grip to the laying one over the turn's second half, done a frame before the turn is)
    const laysFrom = turnBegins + (b.turned - turnBegins) * 0.45, laying = (i: number) => smooth((i - laysFrom) / (b.turned - 1 - laysFrom));
    const makeRoom = (i: number) => gripHeight * smooth((i - liftFrom) / (roomBy - liftFrom));
    /** The card at a moment: standing in the shoe, leaving it, slid along the felt, stood up, falling forward in the air, lowered, pushed, lying on its place. */
    const card = (i: number): CardPose => {
      if (i <= b.d) {
        const pose = sliding(i);
        // Keep the same short edge named through the handover and the turn.
        return pinched ? {...pose, long: mul(pose.long, -1), centre: [pose.centre[0], Math.max(pose.centre[1], makeRoom(i)), pose.centre[2]]} : pose;
      }
      if (i >= b.h) return {centre: seat.centre, long: lyingAxes.long, normal: lyingAxes.normal};
      let axes: CardAxes;
      if (single) { // flat while both hands are on it, then the one turn (never slower than 45 % of its mean speed), then lowered flat
        if (i <= turnBegins) axes = flatHere; // the left hand is clear before the turn
        else if (i < b.turned) { const u = (i - turnBegins) / (b.turned - turnBegins), w = 0.45 * u + 0.55 * smooth(u), long = turned(flatHere.long, once.axis, once.angle * w), normal = turned(flatHere.normal, once.axis, once.angle * w); axes = {long, normal, across: cross(normal, long)}; }
        else if (rolling) axes = lyingAxes; else axes = cardAxes(0, i < b.g ? -rad(M.slope) * Math.pow(1 - (i - b.turned) / (b.g - b.turned), 2.5) : 0, true); } // (lowered at the speed the turn ends with, not from rest)
      else if (i <= b.l) axes = cardAxes(yawHand, -raised(i), false);
      else if (i <= turnFrom) axes = stood;
      else if (i < b.turned) { const u = (i - turnFrom) / (b.turned - turnFrom), w = meet ? 1 - Math.pow(1 - u, 1.8) : (1 - even) * smooth(u) + even * u, long = turned(stood.long, turn.axis, turn.angle * w), normal = turned(stood.normal, turn.axis, turn.angle * w); axes = {long, normal, across: cross(normal, long)}; }
      else axes = cardAxes(0, i < b.g ? slopeAt(i) : 0, true);
      if (pinched && landing(i) !== 0) {
        const long = turned(axes.long, axes.across, -landing(i)), normal = turned(axes.normal, axes.across, -landing(i));
        axes = {long, normal, across: axes.across};
      }
      if (i < b.turned && swing(i) !== 0) { const long = turned(axes.long, UP, swing(i)), normal = turned(axes.normal, UP, swing(i)); axes = {long, normal, across: cross(normal, long)}; }
      const centre = centreOf(held(i), axes, has(i));
      let floor = lying + H / 2 * Math.abs(axes.long[1]) + W / 2 * Math.abs(axes.across[1]);
      if (pinched) {
        floor -= lying * (1 - Math.abs(axes.normal[1]));
        if (i <= b.g) floor = Math.max(floor, i < graspAt ? makeRoom(i) : sweeps ? sweepNeeds(axes, laying(i)) : pinched.needsHeight(axes));
      }
      return {centre: centre[1] < floor ? [centre[0], floor, centre[2]] : centre, long: axes.long, normal: axes.normal}; };
    // Her right hand on this card: how it comes to it (a little closed, the back of the hand up; the first card: as it lay), and its angles while it has it.
    // It takes the card's long side on her right: fingers on the back, the thumb coming under onto the face, and turns thumb-up with the card as the two
    // hands stand it up, so the hand is closed about that side when her left hand lets go. As the card falls it first swings to point along the card's
    // long side and then turns palm down, its fingers going round the long edge onto the face, and slides down to the corner nearest her.
    const came = waits ? {yaw: rest.yaw, bend: 0} : {yaw: yawTo(take), bend: M.loose};
    const aimed = rad(M.inward) + (Math.max(rad(-20), Math.min(rad(M.inward), yaw)) - rad(M.inward)) * 0.5, inward = Math.max(aimed, Math.acos(clamp((take[2] - edgeZ + M.behindEdge) / 0.17))), fall = (share: number) => b.l + (b.turned - b.l) * share;
    // single: the card stands near upright half way through its one turn (`up`); the hand is thumb-up there and swings and turns palm down after it, as it does after the standing card in the deal of -b to -d
    const up = (b.l + 2 + b.turned) / 2, after = (share: number) => up + (b.turned - up) * share;
    const gb = pace.gripBend ?? 0.6, tracks = rolling ? {handYaw: through([[b.d, came.yaw], [up, yaw], [b.h, yaw]]), dip: through([[b.d, rest.dip], [up, rest.dip + rad(M.dip)], [b.g, rest.dip]]),
      roll: through([[b.d - 3, rest.roll - rad(10)], [b.d, rest.roll], [b.l + 2, rest.roll], [up, rest.roll + rad(80)], [b.turned, rest.roll + rad(15)], [b.g, rest.roll]]),
      bend: through([[b.d - 5, came.bend], [b.d, came.bend + (gb - came.bend) * 0.6], [b.d + 3, gb], [b.turned, gb], [b.g, 0]])} : single ? {handYaw: through([[b.d, came.yaw], [up, inward], [after(M.turnsFirst), inward + (yaw - inward) * 0.8], [b.g, yaw], [b.h, yaw]]), dip: through([[b.d, rest.dip], [up, rest.dip + rad(M.dip)], [b.g, rest.dip]]),
      roll: through([[b.d - 3, rest.roll - rad(10)], [b.d, rest.roll], [up, rest.roll + rad(M.roll)], [after(M.rollHeld), rest.roll + rad(M.roll)], [b.turned, rest.roll + rad(M.roll) * 0.12], [b.g, rest.roll]]),
      bend: through([[b.d - 5, came.bend], [b.d, came.bend + (1 - came.bend) * 0.4], [b.d + (up - b.d) * 0.4, 1], [after(M.rollHeld), 1], [b.turned, 0.5], [b.g, 0]])} : null;
    const handYaw = tracks ? tracks.handYaw : through([[b.d, came.yaw], [meet ? b.e : b.l, inward], [fall(M.turnsFirst), inward + (yaw - inward) * 0.8], [b.g, yaw], [b.h, yaw]]), dip = tracks ? tracks.dip : through([[b.d, rest.dip], [b.l, rest.dip + rad(M.dip)], [b.g, rest.dip]]);
    const roll = tracks ? tracks.roll : through([...(meet ? [[b.d - 3, rest.roll - rad(10)] as [number, number]] : []), [b.d, rest.roll], ...(b.l - b.e > 0.4 ? [[b.e, rest.roll + rad(meet ? 62 : M.roll)] as [number, number]] : []), [b.l, rest.roll + rad(M.roll)], [fall(M.rollHeld), rest.roll + rad(M.roll)], [b.turned, rest.roll + rad(M.roll) * 0.12], [b.g, rest.roll]]), bend = tracks ? tracks.bend : through([...(meet ? [[b.d - 5, came.bend] as [number, number], [b.d, came.bend + (1 - came.bend) * 0.4] as [number, number], [b.d + (b.e - b.d) * 0.4, 1] as [number, number]] : [[b.d, came.bend] as [number, number]]), ...(b.l - b.e > 0.4 ? [[b.e, 1] as [number, number]] : []), [b.l, 1], [fall(M.rollHeld), 1], [b.turned, 0.5], [b.g, 0]]);
    const handAt = (yawNow: number, dipNow: number, rollNow: number, bendNow: number, grip: Vec3) => { const shape = shapeBetween(flatR, gripR, bendNow), axes = axesAt(yawNow, dipNow, rollNow), at = sub(grip, outOf(padOf(shape), axes)), low = Math.min(...placed(shape, axes, at).map(q => q[1]));
      const wrist: Vec3 = low < M.floor ? [at[0], at[1] + M.floor - low, at[2]] : at; return {wrist, points: placed(shape, axes, wrist), axes, shape}; }; // a hand turned on its side beside the card is lifted clear of the felt, its fingers then a little higher up the card's side
    const right = (i: number) => i <= b.d ? handAt(came.yaw, rest.dip, rest.roll, bend(i), take) : handAt(handYaw(i) + swing(i), dip(i), roll(i), bend(i), held(i)), comes = handAt(came.yaw, rest.dip, rest.roll, came.bend, take);
    const startGrip = pinched?.at(card(graspAt)), endGrip = pinched?.at(card(b.g));
    const loosen = endGrip && add(endGrip.wrist, mul(card(b.g).long, 0.025));
    const transition = (from: typeof comes, to: typeof comes, t: number, rise: number, aside: Vec3 = [0, 0, 0]) => {
      const shape = shapeBetween(from.shape, to.shape, t), axes = between(from.axes, to.axes, t);
      const wrist = add(lerp(from.wrist, to.wrist, t), add([0, rise * Math.sin(Math.PI * t), 0], mul(aside, Math.sin(Math.PI * t))));
      return aboveFelt({wrist, points: placed(shape, axes, wrist), axes, shape});
    };
    const keepIndex = (i: number, at: NonNullable<typeof pinched>) => {
      const pose = card(i), closed = at.at(pose), out = smooth((i - b.g) / 3), rise = smooth((i - b.g - 3) / 3);
      const settle = smooth((i - releaseAt) / (b.h - releaseAt));
      const orient = smooth((i - b.g - 2) / (b.h - b.g - 2));
      const relaxed = shapeBetween(closed.shape, flatR, settle);
      const freeMiddle = Math.sin(Math.PI * settle);
      const shape = curled(relaxed, {2: [-18 * freeMiddle, 12 * freeMiddle, 0]});
      const basis = between(closed.axes, seat.axes, orient), aside = -rad(25) * Math.sin(Math.PI * orient);
      const forward = turned(basis.forward, pose.normal, aside), palm = turned(basis.palm, pose.normal, aside);
      const axes = {forward, palm, across: cross(palm, forward)};
      const index = at.surface(pose, H / 2 - pinchInset, padHeight);
      const wrist = sub(index, outOf(shape[8], axes));
      // The thumb exits under the short edge, then lifts outside the card. The index fixes the wrist to the face throughout.
      const outside = H / 2 + jointRadius(4) + 0.006;
      const thumb = at.surface(pose, (H / 2 - pinchInset) * (1 - out) + outside * out, -padHeight + 0.034 * rise);
      const target = sub(lerp(thumb, add(wrist, outOf(shape[4], axes)), settle), wrist);
      const opened = thumbToward(shape, [dot(target, axes.forward), dot(target, axes.palm), dot(target, axes.across)], 60);
      return {wrist, points: placed(opened, axes, wrist), axes, shape: opened};
    };
    const rightGripping = (i: number) => {
      if (!pinched || !startGrip || !endGrip || !loosen) return right(i);
      // sharedChange: her left hand is over the card when she takes it. Her right hand first goes to the grip's own pose
      // `back` behind the card's edge on her side and `side` beside it, and from there slides onto that edge beside her left
      // fingers as the card comes (TWO_HAND.shared).
      // (soft: it does not stop there. From where it lay it goes, in one movement that begins at rest and ends at the card's own
      // speed, toward the grip as that would be on the card where the card is at each moment, bowed out toward that point behind
      // the edge by the most half way: so it comes in over the edge from her side and has no speed against the card as it closes)
      if (shares && i < graspAt) { const slidesFrom = graspAt - S.slide, taken = card(graspAt), waits = add(mul(taken.long, S.back), mul(cross(taken.normal, taken.long), S.side)), there = graspAt - S.ready, lay = {wrist: start.R.w, points: start.R.p, axes: axR0, shape: flatR};
        const behind = (j: number, s: number, out = 1 - s) => { const now = card(j).centre, by = add(mul(sub([now[0], Math.min(Math.max(now[1], gripHeight), soft ? gripHeight + S.rise : Infinity), now[2]], taken.centre), s), mul(waits, out)), wrist = add(startGrip.wrist, by); return {...startGrip, wrist, points: placed(startGrip.shape, startGrip.axes, wrist)}; };
        // (it is the tip of her index that goes that way, the hand turning about it: a wrist led that way lets the tip dip into the card as the hand comes round)
        if (soft) { const t = (i - b.b) / (graspAt - b.b), q = smooth(t), to = behind(i, 1, 16 * t * t * (1 - t) * (1 - t)), shape = shapeBetween(flatR, to.shape, q), axes = between(axR0, to.axes, q);
          const wrist = sub(add(lerp(start.R.p[8], to.points[8], q), add([0, S.rise * Math.sin(Math.PI * q), 0], mul(S.aside, Math.sin(Math.PI * q)))), outOf(shape[8], axes));
          return aboveFelt({wrist, points: placed(shape, axes, wrist), axes, shape}); }
        const slid = (j: number) => behind(j, smooth((j - slidesFrom) / (graspAt - slidesFrom)));
        return i >= there ? aboveFelt(slid(Math.max(i, slidesFrom))) : transition(lay, slid(slidesFrom), smooth((i - b.b) / (there - b.b)), S.rise, S.aside); }
      if (i < graspAt) return transition({wrist: start.R.w, points: start.R.p, axes: axR0, shape: flatR}, startGrip,
        smooth((i - b.b) / (graspAt - b.b)), supportsLanding ? 0.158 : 0.115);
      // sweep: the grip stays to the film's end. Only the thumb leaves, out from under the short edge while the card closes onto the felt.
      if (sweeps) return gripOf(card(i), laying(i), clamp((i - b.g) / 3.5));
      if (i <= b.g) return pinched.at(card(i));
      if (supportsLanding) return keepIndex(i, pinched);
      if (i <= releaseAt) {
        const wrist = lerp(endGrip.wrist, loosen, smooth((i - b.g) / (releaseAt - b.g)));
        return {...endGrip, wrist, points: placed(endGrip.shape, endGrip.axes, wrist)};
      }
      return transition({...endGrip, wrist: loosen}, {wrist: seat.wrist, points: placed(flatR, seat.axes, seat.wrist), axes: seat.axes, shape: flatR},
        smooth((i - releaseAt) / (b.h - releaseAt)), 0.02);
    };
    return {b, seat, take, go, card, lets, right: rightGripping, comes, turn: single ? once : turn, far, closes: pinched ? b.b : meet ? b.d - 5 : b.d, travels: !pinched && !waits && k === 0, stays: sweeps}; });

  // ---- her left hand ---------------------------------------------------------------------------------------------
  // Its fingertips ride on the card from the shoe to the hand change, falling a little behind its middle, the thumb coming
  // in under the forefinger's knuckle (beside the forefinger it met her right thumb), and go up the card's back to its upper edge while it is stood up. The farther from the shoe the hands change, the
  // more the hand is turned toward her right (its wrist would else be in her own body), and it is tipped about its own
  // length as much as keeps every point of it over the felt. When it lets go it lifts and goes back to the next card.
  const axL0 = axesOf(start.L.p, -1), shapeL = local(start.L.p, axL0), besideL = shapeBetween(shapeL, flatR.map(q => [q[0], q[1], -q[2]] as Vec3), 1), closedL = thumbToward(besideL, add(besideL[5], [-0.01, 0.018, 0])), tipsL0 = add(start.L.w, outOf(tips(shapeL), axL0));
  const onCard = (() => { const d = sub(tipsL0, standingCard.centre), across = cross(standingCard.normal, standingCard.long); return [dot(d, standingCard.long), dot(d, standingCard.normal), dot(d, across)]; })();
  // The feeding hand takes the shoe's end of the card, opposite the short edge named by the pilot's right grip.
  const feeding = (pose: CardPose): CardPose => pinched ? {...pose, long: mul(pose.long, -1)} : pose;
  const about = (a: Axes, axis: Vec3, angle: number): Axes => ({forward: turned(a.forward, axis, angle), palm: turned(a.palm, axis, angle), across: turned(a.across, axis, angle)});
  const lefts = cards.map(c => { const swing = shares ? -rad(S.swing) : pinched ? -rad(15) : -rad(M.leftYaw) * clamp(length(sub(c.take, mouth)) / 0.3), at = feeding(c.card(c.b.d));
    const feed = shares ? {along: S.along, across: S.across} : pinched ? {along: 0.018, across: -0.028} : {along: -M.behind, across: -M.leftIn};
    const on = (card: CardPose, u: number, tilt: number, v = 0) => { const across = cross(card.normal, card.long), along = onCard[0] + (feed.along - onCard[0]) * u, target = add(card.centre, add(add(mul(card.long, along + (-(H / 2 - M.topIn) - along) * v), mul(card.normal, onCard[1])), mul(across, onCard[2] + (feed.across - onCard[2]) * u)));
      const shape = shapeBetween(shapeL, closedL, shares ? u * S.close : u), swung = about(axL0, UP, swing), far = shares ? about(swung, swung.across, rad(S.pitch)) : swung, axes = between(axL0, about(far, far.forward, tilt), u), wrist = sub(target, outOf(tips(shape), axes)); return {wrist, points: placed(shape, axes, wrist), axes, shape}; };
    let tilt = 0; for (const t of Array.from({length: 81}, (_, i) => rad((i % 2 ? 1 : -1) * Math.ceil(i / 2)))) if (Math.min(...on(at, 1, t).points.map(q => q[1])) >= 0.009) { tilt = t; break; }
    return {on, tilt, swing}; });
  const left = (i: number): {wrist: Vec3; points: Vec3[]} | null => { for (const [k, c] of cards.entries()) { const b = c.b, l = lefts[k], lets = c.lets, back = k < cards.length - 1 ? cards[k + 1].b.a : lets + (pace.leftBack ?? M.leftBack) * fps;
    if (i > b.b && i <= lets) {
      const hand = l.on(feeding(c.card(i)), smooth((i - b.b) / (b.d - b.b)), l.tilt, single ? 0 : smooth((i - b.d) / (b.l - b.d)));
      return pinched && i >= b.c ? aboveFelt(hand) : hand;
    }
    if (i > lets && i < back) { const from = l.on(feeding(c.card(lets)), 1, l.tilt, single ? 0 : 1), t = (i - lets) / (back - lets), u = soft ? smooth(t) : single ? 1 - Math.pow(1 - t, 2) : smooth(t), shape = shapeBetween(shares ? from.shape : closedL, shapeL, u), axes = between(from.axes, axL0, shares && S.home ? smooth(clamp((t - S.home) / (1 - S.home))) : u);
      const arc: Vec3 = shares ? S.arc : pinched ? [0.04, 0.075, 0] : [0, single ? 0.035 : M.arc.left, 0];
      // (soft: it goes on with the card at the card's speed, ever less, while it is lifted: the lift is the arc's, begun at once)
      const goesOn: Vec3 = soft ? add(mul(sub(from.wrist, l.on(feeding(c.card(lets - 1)), 1, l.tilt, 0).wrist), (back - lets) * t * (1 - t) * (1 - t)), mul(arc, Math.sin(Math.PI * eased(t, 1.2, 0)) - Math.sin(Math.PI * u))) : [0, 0, 0];
      const wrist = add(add(lerp(from.wrist, start.L.w, u), mul(arc, Math.sin(Math.PI * u))), goesOn);
      return {wrist, points: placed(shape, axes, wrist)}; } }
    return null; };

  // ---- frame by frame --------------------------------------------------------------------------------------------
  const active = (i: number) => { let k = 0; while (k < cards.length - 1 && i >= cards[k + 1].b.b) k++; return k; };
  /** Her right hand at frame i: null while it lies as it lay at the start. */
  const rightAt = (i: number): {wrist: Vec3; points: Vec3[]} | null => { for (const [k, c] of cards.entries()) { const b = c.b, until = b.i ?? N;
    if (c.travels && i > b.b && i <= c.closes) { const u = smooth((i - b.b) / (c.closes - b.b)), shape = shapeBetween(flatR, c.comes.shape, u), axes = between(axR0, c.comes.axes, u), wrist = add(lerp(start.R.w, c.comes.wrist, u), [0, M.arc.right * Math.sin(Math.PI * u), 0]); return {wrist, points: placed(shape, axes, wrist)}; } // realTake: from where it lay to the hand change while the card is stroked out
    if (i > c.closes && i <= until) return i >= b.h && !c.stays ? {wrist: c.seat.wrist, points: placed(flatR, c.seat.axes, c.seat.wrist)} : c.right(i);
    if (b.i !== null && i > b.i && i <= cards[k + 1].b.d) { const next = cards[k + 1].comes, u = smooth((i - b.i) / (cards[k + 1].b.d - b.i)), shape = shapeBetween(flatR, next.shape, u), axes = between(c.seat.axes, next.axes, u), wrist = add(lerp(c.seat.wrist, next.wrist, u), [0, M.arc.right * Math.sin(Math.PI * u), 0]); return {wrist, points: placed(shape, axes, wrist)}; } }
    return null; };
  // What the body adds: nothing until the first card moves, then what each place asks while the card is laid on it, going straight from one place's to the next's.
  const bodyKeys: [number, Vec3][] = [[pace.leanFrom ?? cards[0].b.b, [0, 0, 0]]]; for (const c of cards) { bodyKeys.push([c.b.g, c.seat.more]); if (c.b.i !== null) bodyKeys.push([c.b.i, c.seat.more]); }
  const more = [0, 1, 2].map(j => through(bodyKeys.map(([t, v]) => [t, v[j]] as [number, number])));

  const reach = reachOf(lens, pace.tuck ?? 0, pace.contactGrip, pace.seenForearm ?? 0, pace.clearTrunk ?? 0); // (tuck: an elbow away from her side or high is the more costly)
  const frames: DealFrame[] = [], limb = (a: ArmPose): Limb => ({s: a.shoulder, e: a.elbow, w: a.wrist, k: 1, p: a.points}); let wasL = start.L.e, wasR = start.R.e; const forced: string[] = [];
  for (let i = 0; i < N; i++) { const k = active(i), c = cards[k].card(i), r = rightAt(i), l = left(i), add3: Vec3 = [more[0](i), more[1](i), more[2](i)], still = length(add3) < 1e-9, body = bodyAt(add3);
    const solved = (shoulder: Vec3, hand: {wrist: Vec3; points: Vec3[]}, sign: number, was: Vec3) => { const a = reach(shoulder, body.neck, hand, sign, was, i, body.shoulders); if (a.forced) forced.push(`${sign > 0 ? 'R' : 'L'}${i}`); return limb(a); };
    const R = !r && still ? start.R : solved(body.shoulders[0], r ?? {wrist: start.R.w, points: start.R.p}, 1, wasR), L = !l && still ? start.L : solved(body.shoulders[1], l ?? {wrist: start.L.w, points: start.L.p}, -1, wasL);
    wasR = R.e; wasL = L.e; frames.push({card: {c: c.centre, l: c.long, n: c.normal, id: k}, L, R, h: still ? start.h : body.head, g: c.centre}); }
  // The elbow is chosen anew in every frame: smoothed over time so that it does not hop between two places as good. A frame that is the start itself stays as it is.
  for (const side of ['L', 'R'] as const) for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N - 1; i++) { const f = frames[i][side]; if (f === start[side]) continue; const e = [0, 1, 2].map(j => (frames[i - 1][side].e[j] + 2 * f.e[j] + frames[i + 1][side].e[j]) / 4) as Vec3; frames[i][side] = {...f, e: arm(f.s, f.w, sub(e, f.s)).elbow}; }
  // Her head follows the PLACE, not the shoe (the reading): on the card in the shoe at the start, from the moment the first card moves on its place, and from each hand change on that card's place; eased over time, as a head turns.
  const looks = frames.map((_, i) => { if (i < cards[0].b.b) return start.g ?? standingCard.centre; let k = 0; while (k < cards.length - 1 && i >= cards[k + 1].b.d) k++; return cards[k].seat.centre; }), span = 12;
  const late = pace.flowing ? span : 0; // (flowing: every look comes a window later, so nothing of the first one reaches back before the card moves)
  frames.forEach((f, i) => { let total = 0, sum: Vec3 = [0, 0, 0]; for (let j = i - span; j <= i + span; j++) { const w = Math.exp(-(j - i) * (j - i) / 32), q = looks[Math.max(0, Math.min(N - 1, j - late))]; total += w; sum = add(sum, mul(q, w)); } f.g = mul(sum, 1 / total); });
  // The elbows brought to where the film is to end, from the frame the last card meets the felt until a few frames after it lies.
  if (pace.elbows) { const b = cards[cards.length - 1].b; for (let i = Math.ceil(b.g); i < N; i++) for (const side of ['L', 'R'] as const) { const f = frames[i][side], w = smooth((i - b.g) / (b.h + 3 - b.g)); frames[i][side] = {...f, e: arm(f.s, f.w, sub(lerp(f.e, pace.elbows[side], w), f.s)).elbow}; } }
  const laid = cards.slice(0, -1).map((c, k) => ({from: Math.ceil(cards[k + 1].b.b), c: c.seat.centre, l: lyingAxes.long, n: lyingAxes.normal}));
  return {frames, laid, beats, frameCount: N, forced,
    cards: cards.map((c, k) => ({to: c.b.to, take: c.take, go: c.go, slid: c.far, grip: c.seat.grip, centre: c.seat.centre, handYaw: deg(c.seat.yaw), bodyShare: c.seat.share, wrist: c.seat.wrist, turn: {axis: c.turn.axis, angle: deg(c.turn.angle)}, left: {tilt: deg(lefts[k].tilt), swing: deg(lefts[k].swing)}})),
    made: {pad, pick, mouth, yawOut: deg(yawOut), rest: {yaw: deg(rest.yaw), dip: deg(rest.dip), roll: deg(rest.roll)}}};
}
