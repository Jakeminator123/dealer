// The test figure's skeleton, solved from where its hands must be. Pure: no I/O and no three.js.
// The figure is a stand-in with Paow's measures, not her: its shoulders and head are where the film has hers (read on her
// anchor through the lens), it bends from the hip toward a card place that the arm cannot reach, turning the dealing
// shoulder forward as it does, and each arm is two bones bent at the elbow. It exists to show that hand and card are one
// geometry from every seat.
import {add, cross, dot, filmEye, length, mul, onPlane, onUpright, sub, unit, type Lens, type Vec3} from './camera.ts';
import {ASSUMED, MEASURED, dealerEdge} from './world.ts';

export const BODY = {upperArm: 0.29, forearm: 0.26, reach: 0.535, hipBelowFelt: 0.2, mostLean: 0.6, mostTwist: 0.6, jointInFromShoulderPoint: 0.82};
export type Frame = {hip: Vec3; shoulders: [Vec3, Vec3]; neck: Vec3; head: Vec3; headRadius: number}; // shoulders: her right (image left), her left (image right)
export type Arm = {shoulder: Vec3; elbow: Vec3; wrist: Vec3; reached: boolean};
export type Body = {lean: number; twist: number; hip: Vec3; shoulders: [Vec3, Vec3]; neck: Vec3; head: Vec3; headRadius: number; arms: [Arm, Arm]};

/** The upright figure as the film has her: joints on the plane she sits in, a little behind the table edge. */
export function standing(lens: Lens): Frame {
  const eye = filmEye(lens), z = dealerEdge(lens)[2] - ASSUMED.shouldersBehindEdge, at = (x: number, y: number) => onUpright(eye, x, y, z)!;
  const a = at(MEASURED.shoulders.a.x, MEASURED.shoulders.a.y), b = at(MEASURED.shoulders.b.x, MEASURED.shoulders.b.y), mid = mul(add(a, b), 0.5), k = BODY.jointInFromShoulderPoint;
  const midX = (MEASURED.pupils.a.x + MEASURED.pupils.b.x) / 2, crown = at(midX, MEASURED.crownRow), chin = at(midX, MEASURED.chinRow);
  return {hip: [mid[0], -BODY.hipBelowFelt, z], shoulders: [add(mid, mul(sub(a, mid), k)), add(mid, mul(sub(b, mid), k))], neck: [mid[0], mid[1] + 0.03, z], head: mul(add(crown, chin), 0.5), headRadius: length(sub(crown, chin)) / 2};
}
/** The resting hand of the arm that does not deal (her right, image left): wrist and the direction of the fingers, on the felt. */
export function restingHand(lens: Lens): {wrist: Vec3; forward: Vec3} {
  const eye = filmEye(lens), wrist = onPlane(eye, 702.6, 781.2, 0.022)!, tip = onPlane(eye, 804.7, 872.4, 0.022)!; // data/dealer-standard.json, hands.leftInPicture
  return {wrist, forward: unit(sub(tip, wrist))};
}
/** A vector turned about a unit axis (Rodrigues). */
export const turned = (v: Vec3, axis: Vec3, angle: number): Vec3 => add(add(mul(v, Math.cos(angle)), mul(cross(axis, v), Math.sin(angle))), mul(axis, dot(axis, v) * (1 - Math.cos(angle))));
/** Two bones from shoulder to wrist, the elbow bent toward `pole`. A wrist out of reach is brought in along the line to it. */
export function arm(shoulder: Vec3, wrist: Vec3, pole: Vec3): Arm {
  const a = BODY.upperArm, b = BODY.forearm, far = length(sub(wrist, shoulder)), d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, far)), dir = unit(sub(wrist, shoulder));
  const along = (a * a - b * b + d * d) / (2 * d), out = Math.sqrt(Math.max(0, a * a - along * along)), side = unit(sub(pole, mul(dir, dot(pole, dir))));
  return {shoulder, elbow: add(add(shoulder, mul(dir, along)), mul(side, out)), wrist: add(shoulder, mul(dir, d)), reached: Math.abs(far - d) < 1e-6};
}
/**
 * The figure with its dealing hand (her left, image right) at `dealWrist` and the other at rest. When the arm is too short
 * she bends from the hip toward the hand, and turns her dealing shoulder forward in step with the bend, just as far as the
 * reach needs and no farther than `mostLean`.
 */
export function solveBody(frame: Frame, dealWrist: Vec3, restWrist: Vec3): Body {
  const toward = sub(dealWrist, frame.hip), flat = unit([toward[0], 0, toward[2]]), axis = cross([0, 1, 0], flat); // bending about `axis` carries her upper body toward the hand
  const posed = (p: Vec3, lean: number, twist: number): Vec3 => { const spine = turned([0, 1, 0], axis, lean); return add(frame.hip, turned(turned(sub(p, frame.hip), axis, lean), spine, twist)); };
  const twistFor = (lean: number) => { const t = BODY.mostTwist * lean / BODY.mostLean; return length(sub(dealWrist, posed(frame.shoulders[1], lean, t))) < length(sub(dealWrist, posed(frame.shoulders[1], lean, -t))) ? t : -t; };
  const short = (lean: number) => length(sub(dealWrist, posed(frame.shoulders[1], lean, twistFor(lean)))) > BODY.reach;
  let lean = 0; if (short(0)) { let lo = 0, hi = BODY.mostLean; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (short(m)) lo = m; else hi = m; } lean = hi; }
  const twist = twistFor(lean), shoulders: [Vec3, Vec3] = [posed(frame.shoulders[0], lean, twist), posed(frame.shoulders[1], lean, twist)];
  return {lean, twist, hip: frame.hip, shoulders, neck: posed(frame.neck, lean, twist), head: posed(frame.head, lean * 0.85, twist * 0.5), headRadius: frame.headRadius,
    arms: [arm(shoulders[0], restWrist, [-0.7, -0.6, -0.4]), arm(shoulders[1], dealWrist, [0.7, -0.6, -0.4])]};
}
