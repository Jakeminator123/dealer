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
/** The figure standing still: both arms and hands and the head (the last frame of dealer3d/data/till-ankare-2-3.json). */
export type Still = {L: Limb; R: Limb; h: Vec3};
export type DealFrame = {card: CardAt; L: Limb; R: Limb; h: Vec3; g: Vec3};
/** The moments of one card in the film's own frames (not whole numbers), named as in src/real-deal.ts; `turned`: the turn in the air is done. `i` null: her hand stays on the card to the end. */
export type Beat = {to: string; a: number; b: number; c: number; d: number; e: number; l: number; turned: number; f: number; g: number; h: number; i: number | null};
export type Place = {id: string; at: Vec3; real: RealCard};
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
 */
export type Pace = {flowing?: boolean; leftBack?: number; elbows?: {L: Vec3; R: Vec3}; meeting?: boolean; push?: number; swing?: number};

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
};
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI, UP: Vec3 = [0, 1, 0];
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t), lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

const BASE = {lean: rad(10), twist: rad(8)}; // pose 2.3 (tools/pose-film.ts)
/** Her body: bent from the hip and turned as in pose 2.3, and `more` on top of that: [leaning sideways, the right shoulder forward, leaning forward], radians. */
function bodyOf(lens: Lens) { const frame = standing(lens), hip = frame.hip;
  return (more: Vec3) => { const lx = more[0], lz = BASE.lean + more[2], twist = BASE.twist + more[1], lean = Math.hypot(lx, lz), axis = unit(cross(UP, [lx, 0, lz]));
    const pose = (p: Vec3, k = 1): Vec3 => { const spine = turned(UP, axis, lean * k); return add(hip, turned(turned(sub(p, hip), axis, lean * k), spine, twist * k)); };
    return {shoulders: [pose(frame.shoulders[0]), pose(frame.shoulders[1])] as [Vec3, Vec3], head: pose(frame.head, 0.85), neck: pose(frame.neck)}; };
}
/** The arm whose elbow, of all the places it can be, asks least of the wrist, is nearest where it was and hangs lowest: not over the shoulder, not in the body, the table or the shoe. */
function reachOf(lens: Lens) { const hip = standing(lens).hip, edgeZ = dealerEdge(lens)[2];
  const inside = shoeHolds(lens), torso = (e: Vec3, neck: Vec3) => { const d = sub(neck, hip), t = clamp(dot(sub(e, hip), d) / dot(d, d)); return length(sub(e, add(hip, mul(d, t)))); };
  return (shoulder: Vec3, neck: Vec3, hand: {wrist: Vec3; points: Vec3[]}, sign: number, was: Vec3, i: number): ArmPose & {forced: boolean} => {
    const far = length(sub(hand.wrist, shoulder)); if (far > (BODY.upperArm + BODY.forearm) * 0.985) throw Error(`frame ${i}: the ${sign > 0 ? 'right' : 'left'} wrist is ${far.toFixed(3)} m from the shoulder, out of the arm's reach.`);
    const dir = unit(sub(hand.wrist, shoulder)), u = unit(cross(dir, Math.abs(dir[1]) < 0.9 ? UP : [1, 0, 0])), v = cross(dir, u); let best: ArmPose | null = null, least = Infinity, any: ArmPose | null = null, leastAny = Infinity;
    for (let k = 0; k < 120; k++) { const t = k * Math.PI / 60, e = arm(shoulder, hand.wrist, add(mul(u, Math.cos(t)), mul(v, Math.sin(t)))).elbow, pose: ArmPose = {shoulder, elbow: e, wrist: hand.wrist, stretch: 1, points: hand.points};
      const cost = joints(pose, sign).wrist + 150 * length(sub(e, was)) + 150 * Math.max(0, e[1] - shoulder[1] + 0.15), crossing = e[2] < edgeZ && hand.wrist[2] > edgeZ ? e[1] + (hand.wrist[1] - e[1]) * (edgeZ - e[2]) / (hand.wrist[2] - e[2]) : 1;
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
  const H = CARD.height, W = CARD.width, lying = CARD.thickness / 2, yawHand = rad(M.handOverYaw);
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
  const bodyAt = bodyOf(lens);

  // ---- each card: where the hands change, where it lies, how the hand lies on it, what the body adds ----------------
  const lyingAxes = cardAxes(0, 0, true), flatAxes = cardAxes(yawHand, 0, false);
  const cards = places.map((place, k) => { const b = beats[k], r = place.real, step = (s: [number, number]): Vec3 => [shoe.front[0] + s[0], lying, shoe.front[2] + s[1]];
    // The first card is taken where her right hand waits; every other where the real dealer's hands change, counted from the shoe's mouth.
    const take: Vec3 = k === 0 ? pick : step(r.take), go: Vec3 = k === 0 ? [pick[0] + r.go[0] - r.take[0], lying, pick[2] + r.go[1] - r.take[1]] : step(r.go);
    const centre: Vec3 = [place.at[0], lying, place.at[2]], grip = add(add(centre, mul(lyingAxes.long, H / 2 - M.grip.laid.up)), mul(lyingAxes.across, W / 2 - M.grip.laid.in)), yaw = yawTo(grip), axes = axesAt(yaw, rest.dip, rest.roll), wrist = sub(grip, outOf(padOf(flatR), axes));
    const toward = unit([place.at[0] - hip[0], 0, place.at[2] - hip[2]]), sway: Vec3 = [rad(M.sway) * Math.max(-1, Math.min(1, place.at[0] / 0.5)), rad(6) * clamp(-place.at[0] / 0.5), 0];
    let share = 0, more = sway; for (; share <= 1.0001; share += 0.05) { more = add(sway, [toward[0] * rad(M.lean) * share, rad(M.twist) * share * clamp((place.at[0] + 0.1) / 0.3), toward[2] * rad(M.lean) * share]); if (length(sub(wrist, bodyAt(more).shoulders[0])) <= M.reach) break; }
    if (share > 1.0001) throw Error(`${place.id}: the right arm does not reach (${length(sub(wrist, bodyAt(more).shoulders[0])).toFixed(3)} m from the shoulder with all the body gives).`);
    const seat = {centre, grip, yaw, axes, wrist, more, share}, meet = !!(pace.meeting && pace.flowing);
    if (meet) { const on = unit([grip[0] - take[0], 0, grip[2] - take[2]]); go[0] = take[0] + on[0] * 0.05; go[2] = take[2] + on[2] * 0.05; }

    // Out of the shoe and along the felt to the hand change: one movement, at rest at both ends.
    const handOver = centreOf(take, flatAxes, M.grip.taken), far = length(sub(handOver, clearCard.centre)), way = through([[b.b, 0], ...(b.d - b.c >= 1 ? [[b.c, out] as [number, number]] : []), [b.d, out + far], ...(meet ? [[b.d + 3, out + far + 0.018] as [number, number]] : [])]); // (a card that is taken as it comes out has no moment of its own for being out)
    const sliding = (i: number) => { const a = way(i); if (a <= out) return leaving(a); const s = (a - out) / (far || 1), yawNow = yawOut + (yawHand - yawOut) * smooth(s), axes = cardAxes(yawNow, 0, false);
      return {centre: lerp(clearCard.centre, handOver, smooth(s) * 0.5 + s * 0.5), long: axes.long, normal: axes.normal}; };
    // From the hand change on, the point her right fingertips hold (the corner of the card that ends nearest her): along the
    // felt from `take` to `go` while the card is stood up, then to where the card meets the felt, and pushed to the place.
    // (meeting: a key before the hand change, on the way the card came, so that the point is already moving as the hand takes the card; the tracks are only read from the hand change on)
    const before: Vec3 = sub(take, mul(unit(sub(handOver, clearCard.centre)), 0.02)), early = (j: number): [number, number][] => meet ? [[b.d - 3, before[j]]] : [];
    const meets: Vec3 = [grip[0], lying, grip[2] - (pace.push ?? M.push)], gx = through([...early(0), [b.d, take[0]], [b.l, go[0]], [b.g, meets[0]], [b.h, grip[0]]]), gz = through([...early(2), [b.d, take[2]], [b.l, go[2]], [b.g, meets[2]], [b.h, grip[2]]]);
    // Stood up about the short side nearest the players: that side stays on the felt, so the held corner is as high as the card's lean puts it, and a little more as her left hand lets go.
    // (flowing: a key beyond the moment her left hand lets go keeps the card turning as that moment is passed; the track is only read up to it)
    const raised = meet ? through([[b.d - 3, -rad(12)], [b.d, 0], [b.e, rad(60)], [b.l, rad(M.raise.lets)], [b.l + 2, rad(M.raise.lets + 26)]]) : through([[b.d, 0], ...(b.l - b.e > 0.4 ? [[b.e, rad(M.raise.stands)] as [number, number]] : []), [b.l, rad(M.raise.lets)], ...(pace.flowing && b.l - b.e > 0.4 ? [[2 * b.l - b.e, rad(2 * M.raise.lets - M.raise.stands)] as [number, number]] : [])]), standsAt = (i: number) => lying + M.grip.taken.up * Math.sin(raised(i)) + M.lift * smooth((i - b.d) / (b.l - b.d));
    const carried = through([[b.l, standsAt(b.l)], [(b.l + b.turned) / 2, M.heights.carry], [b.turned, M.heights.turned], [b.g, lying]]), held = (i: number): Vec3 => i <= b.d ? take : [gx(i), i <= b.l ? standsAt(i) : carried(i), gz(i)];
    const upAt = through([[b.l, M.grip.taken.up], [b.turned, M.grip.laid.up]]), inAt = through([[b.l + (b.turned - b.l) * 0.6, M.grip.taken.in], [b.g, M.grip.laid.in]]), has = (i: number) => ({up: upAt(i), in: inAt(i)}); // her hand slides down the long side to the corner while the card falls
    const slopeAt = through([[b.turned, -rad(M.slope)], [b.g, 0]]), turnFrom = pace.flowing ? b.l : b.l + (b.turned - b.l) * M.upright, even = pace.flowing ? 0.9 : 0.4, stood = cardAxes(yawHand, -rad(M.raise.lets), false), faceUp = cardAxes(0, -rad(M.slope), true), turn = turnOf(stood, faceUp);
    const swing = pace.swing ? through([[b.d + (b.e - b.d) * 0.5, 0], [b.l + (b.turned - b.l) * 0.45, -rad(pace.swing)], [b.turned, 0]]) : () => 0;
    /** The card at a moment: standing in the shoe, leaving it, slid along the felt, stood up, falling forward in the air, lowered, pushed, lying on its place. */
    const card = (i: number): {centre: Vec3; long: Vec3; normal: Vec3} => {
      if (i <= b.d) return sliding(i); if (i >= b.h) return {centre: seat.centre, long: lyingAxes.long, normal: lyingAxes.normal};
      let axes: CardAxes;
      if (i <= b.l) axes = cardAxes(yawHand, -raised(i), false);
      else if (i <= turnFrom) axes = stood;
      else if (i < b.turned) { const u = (i - turnFrom) / (b.turned - turnFrom), w = meet ? 1 - Math.pow(1 - u, 1.8) : (1 - even) * smooth(u) + even * u, long = turned(stood.long, turn.axis, turn.angle * w), normal = turned(stood.normal, turn.axis, turn.angle * w); axes = {long, normal, across: cross(normal, long)}; }
      else axes = cardAxes(0, i < b.g ? slopeAt(i) : 0, true);
      if (i < b.turned && swing(i) !== 0) { const long = turned(axes.long, UP, swing(i)), normal = turned(axes.normal, UP, swing(i)); axes = {long, normal, across: cross(normal, long)}; }
      const centre = centreOf(held(i), axes, has(i)), floor = lying + H / 2 * Math.abs(axes.long[1]) + CARD.width / 2 * Math.abs(axes.across[1]);
      return {centre: centre[1] < floor ? [centre[0], floor, centre[2]] : centre, long: axes.long, normal: axes.normal}; };
    // Her right hand on this card: how it comes to it (a little closed, the back of the hand up; the first card: as it lay), and its angles while it has it.
    // It takes the card's long side on her right: fingers on the back, the thumb coming under onto the face, and turns thumb-up with the card as the two
    // hands stand it up, so the hand is closed about that side when her left hand lets go. As the card falls it first swings to point along the card's
    // long side and then turns palm down, its fingers going round the long edge onto the face, and slides down to the corner nearest her.
    const came = k === 0 ? {yaw: rest.yaw, bend: 0} : {yaw: yawTo(take), bend: M.loose};
    const aimed = rad(M.inward) + (Math.max(rad(-20), Math.min(rad(M.inward), yaw)) - rad(M.inward)) * 0.5, inward = Math.max(aimed, Math.acos(clamp((take[2] - edgeZ + M.behindEdge) / 0.17))), fall = (share: number) => b.l + (b.turned - b.l) * share;
    const handYaw = through([[b.d, came.yaw], [meet ? b.e : b.l, inward], [fall(M.turnsFirst), inward + (yaw - inward) * 0.8], [b.g, yaw], [b.h, yaw]]), dip = through([[b.d, rest.dip], [b.l, rest.dip + rad(M.dip)], [b.g, rest.dip]]);
    const roll = through([...(meet ? [[b.d - 3, rest.roll - rad(10)] as [number, number]] : []), [b.d, rest.roll], ...(b.l - b.e > 0.4 ? [[b.e, rest.roll + rad(meet ? 62 : M.roll)] as [number, number]] : []), [b.l, rest.roll + rad(M.roll)], [fall(M.rollHeld), rest.roll + rad(M.roll)], [b.turned, rest.roll + rad(M.roll) * 0.12], [b.g, rest.roll]]), bend = through([...(meet ? [[b.d - 5, came.bend] as [number, number], [b.d, came.bend + (1 - came.bend) * 0.4] as [number, number], [b.d + (b.e - b.d) * 0.4, 1] as [number, number]] : [[b.d, came.bend] as [number, number]]), ...(b.l - b.e > 0.4 ? [[b.e, 1] as [number, number]] : []), [b.l, 1], [fall(M.rollHeld), 1], [b.turned, 0.5], [b.g, 0]]);
    const handAt = (yawNow: number, dipNow: number, rollNow: number, bendNow: number, grip: Vec3) => { const shape = shapeBetween(flatR, gripR, bendNow), axes = axesAt(yawNow, dipNow, rollNow), at = sub(grip, outOf(padOf(shape), axes)), low = Math.min(...placed(shape, axes, at).map(q => q[1]));
      const wrist: Vec3 = low < M.floor ? [at[0], at[1] + M.floor - low, at[2]] : at; return {wrist, points: placed(shape, axes, wrist), axes, shape}; }; // a hand turned on its side beside the card is lifted clear of the felt, its fingers then a little higher up the card's side
    const right = (i: number) => i <= b.d ? handAt(came.yaw, rest.dip, rest.roll, bend(i), take) : handAt(handYaw(i) + swing(i), dip(i), roll(i), bend(i), held(i)), comes = handAt(came.yaw, rest.dip, rest.roll, came.bend, take);
    return {b, seat, take, go, card, right, comes, turn, far, closes: meet ? b.d - 5 : b.d}; });

  // ---- her left hand ---------------------------------------------------------------------------------------------
  // Its fingertips ride on the card from the shoe to the hand change, falling a little behind its middle, the thumb coming
  // in under the forefinger's knuckle (beside the forefinger it met her right thumb), and go up the card's back to its upper edge while it is stood up. The farther from the shoe the hands change, the
  // more the hand is turned toward her right (its wrist would else be in her own body), and it is tipped about its own
  // length as much as keeps every point of it over the felt. When it lets go it lifts and goes back to the next card.
  const axL0 = axesOf(start.L.p, -1), shapeL = local(start.L.p, axL0), besideL = shapeBetween(shapeL, flatR.map(q => [q[0], q[1], -q[2]] as Vec3), 1), closedL = thumbToward(besideL, add(besideL[5], [-0.01, 0.018, 0])), tipsL0 = add(start.L.w, outOf(tips(shapeL), axL0));
  const onCard = (() => { const d = sub(tipsL0, standingCard.centre), across = cross(standingCard.normal, standingCard.long); return [dot(d, standingCard.long), dot(d, standingCard.normal), dot(d, across)]; })();
  const about = (a: Axes, axis: Vec3, angle: number): Axes => ({forward: turned(a.forward, axis, angle), palm: turned(a.palm, axis, angle), across: turned(a.across, axis, angle)});
  const lefts = cards.map(c => { const swing = -rad(M.leftYaw) * clamp(length(sub(c.take, mouth)) / 0.3), at = c.card(c.b.d);
    const on = (card: {centre: Vec3; long: Vec3; normal: Vec3}, u: number, tilt: number, v = 0) => { const across = cross(card.normal, card.long), along = onCard[0] + (-M.behind - onCard[0]) * u, target = add(card.centre, add(add(mul(card.long, along + (-(H / 2 - M.topIn) - along) * v), mul(card.normal, onCard[1])), mul(across, onCard[2] + (-M.leftIn - onCard[2]) * u)));
      const shape = shapeBetween(shapeL, closedL, u), far = about(axL0, UP, swing), axes = between(axL0, about(far, far.forward, tilt), u), wrist = sub(target, outOf(tips(shape), axes)); return {wrist, points: placed(shape, axes, wrist), axes, shape}; };
    let tilt = 0; for (const t of Array.from({length: 81}, (_, i) => rad((i % 2 ? 1 : -1) * Math.ceil(i / 2)))) if (Math.min(...on(at, 1, t).points.map(q => q[1])) >= 0.009) { tilt = t; break; }
    return {on, tilt, swing}; });
  const left = (i: number): {wrist: Vec3; points: Vec3[]} | null => { for (const [k, c] of cards.entries()) { const b = c.b, l = lefts[k], back = k < cards.length - 1 ? cards[k + 1].b.a : b.l + (pace.leftBack ?? M.leftBack) * fps;
    if (i > b.b && i <= b.l) return l.on(c.card(i), smooth((i - b.b) / (b.d - b.b)), l.tilt, smooth((i - b.d) / (b.l - b.d)));
    if (i > b.l && i < back) { const from = l.on(c.card(b.l), 1, l.tilt, 1), u = smooth((i - b.l) / (back - b.l)), shape = shapeBetween(closedL, shapeL, u), axes = between(from.axes, axL0, u), wrist = add(lerp(from.wrist, start.L.w, u), [0, M.arc.left * Math.sin(Math.PI * u), 0]); return {wrist, points: placed(shape, axes, wrist)}; } }
    return null; };

  // ---- frame by frame --------------------------------------------------------------------------------------------
  const active = (i: number) => { let k = 0; while (k < cards.length - 1 && i >= cards[k + 1].b.b) k++; return k; };
  /** Her right hand at frame i: null while it lies as it lay at the start. */
  const rightAt = (i: number): {wrist: Vec3; points: Vec3[]} | null => { for (const [k, c] of cards.entries()) { const b = c.b, until = b.i ?? N;
    if (i > c.closes && i <= until) return i >= b.h ? {wrist: c.seat.wrist, points: placed(flatR, c.seat.axes, c.seat.wrist)} : c.right(i);
    if (b.i !== null && i > b.i && i <= cards[k + 1].b.d) { const next = cards[k + 1].comes, u = smooth((i - b.i) / (cards[k + 1].b.d - b.i)), shape = shapeBetween(flatR, next.shape, u), axes = between(c.seat.axes, next.axes, u), wrist = add(lerp(c.seat.wrist, next.wrist, u), [0, M.arc.right * Math.sin(Math.PI * u), 0]); return {wrist, points: placed(shape, axes, wrist)}; } }
    return null; };
  // What the body adds: nothing until the first card moves, then what each place asks while the card is laid on it, going straight from one place's to the next's.
  const bodyKeys: [number, Vec3][] = [[cards[0].b.b, [0, 0, 0]]]; for (const c of cards) { bodyKeys.push([c.b.g, c.seat.more]); if (c.b.i !== null) bodyKeys.push([c.b.i, c.seat.more]); }
  const more = [0, 1, 2].map(j => through(bodyKeys.map(([t, v]) => [t, v[j]] as [number, number])));

  const reach = reachOf(lens);
  const frames: DealFrame[] = [], limb = (a: ArmPose): Limb => ({s: a.shoulder, e: a.elbow, w: a.wrist, k: 1, p: a.points}); let wasL = start.L.e, wasR = start.R.e; const forced: string[] = [];
  for (let i = 0; i < N; i++) { const k = active(i), c = cards[k].card(i), r = rightAt(i), l = left(i), add3: Vec3 = [more[0](i), more[1](i), more[2](i)], still = length(add3) < 1e-9, body = bodyAt(add3);
    const solved = (shoulder: Vec3, hand: {wrist: Vec3; points: Vec3[]}, sign: number, was: Vec3) => { const a = reach(shoulder, body.neck, hand, sign, was, i); if (a.forced) forced.push(`${sign > 0 ? 'R' : 'L'}${i}`); return limb(a); };
    const R = !r && still ? start.R : solved(body.shoulders[0], r ?? {wrist: start.R.w, points: start.R.p}, 1, wasR), L = !l && still ? start.L : solved(body.shoulders[1], l ?? {wrist: start.L.w, points: start.L.p}, -1, wasL);
    wasR = R.e; wasL = L.e; frames.push({card: {c: c.centre, l: c.long, n: c.normal, id: k}, L, R, h: still ? start.h : body.head, g: c.centre}); }
  // The elbow is chosen anew in every frame: smoothed over time so that it does not hop between two places as good. A frame that is the start itself stays as it is.
  for (const side of ['L', 'R'] as const) for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N - 1; i++) { const f = frames[i][side]; if (f === start[side]) continue; const e = [0, 1, 2].map(j => (frames[i - 1][side].e[j] + 2 * f.e[j] + frames[i + 1][side].e[j]) / 4) as Vec3; frames[i][side] = {...f, e: arm(f.s, f.w, sub(e, f.s)).elbow}; }
  // Her head follows the PLACE, not the shoe (the reading): on the card in the shoe at the start, from the moment the first card moves on its place, and from each hand change on that card's place; eased over time, as a head turns.
  const looks = frames.map((_, i) => { if (i < cards[0].b.b) return standingCard.centre; let k = 0; while (k < cards.length - 1 && i >= cards[k + 1].b.d) k++; return cards[k].seat.centre; }), span = 12;
  const late = pace.flowing ? span : 0; // (flowing: every look comes a window later, so nothing of the first one reaches back before the card moves)
  frames.forEach((f, i) => { let total = 0, sum: Vec3 = [0, 0, 0]; for (let j = i - span; j <= i + span; j++) { const w = Math.exp(-(j - i) * (j - i) / 32), q = looks[Math.max(0, Math.min(N - 1, j - late))]; total += w; sum = add(sum, mul(q, w)); } f.g = mul(sum, 1 / total); });
  // The elbows brought to where the film is to end, from the frame the last card meets the felt until a few frames after it lies.
  if (pace.elbows) { const b = cards[cards.length - 1].b; for (let i = Math.ceil(b.g); i < N; i++) for (const side of ['L', 'R'] as const) { const f = frames[i][side], w = smooth((i - b.g) / (b.h + 3 - b.g)); frames[i][side] = {...f, e: arm(f.s, f.w, sub(lerp(f.e, pace.elbows[side], w), f.s)).elbow}; } }
  const laid = cards.slice(0, -1).map((c, k) => ({from: Math.ceil(cards[k + 1].b.b), c: c.seat.centre, l: lyingAxes.long, n: lyingAxes.normal}));
  return {frames, laid, beats, frameCount: N, forced,
    cards: cards.map((c, k) => ({to: c.b.to, take: c.take, go: c.go, slid: c.far, grip: c.seat.grip, centre: c.seat.centre, handYaw: deg(c.seat.yaw), bodyShare: c.seat.share, wrist: c.seat.wrist, turn: {axis: c.turn.axis, angle: deg(c.turn.angle)}, left: {tilt: deg(lefts[k].tilt), swing: deg(lefts[k].swing)}})),
    made: {pad, pick, mouth, yawOut: deg(yawOut), rest: {yaw: deg(rest.yaw), dip: deg(rest.dip), roll: deg(rest.roll)}}};
}
