// The test figure's skeleton, solved from where its hands must be. Pure: no I/O and no three.js.
// The figure is a doll (dealer3d/src/doll.ts): a named set of measures, the standard's or a dealer's own. Its shoulders and
// head are where the film has hers (read on her anchor through the lens), it bends from the hip toward a card place that the
// arm cannot reach, turning the dealing shoulder forward as it does, and each arm is two bones bent at the elbow. It exists
// to show that hand and card are one geometry from every seat.
import {add, cross, dot, filmEye, length, mul, onPlane, sub, unit, type Lens, type Vec3} from './camera.ts';
import {STANDARD, dollFrame, elbowPolesAt, type Doll, type Frame} from './doll.ts';
export type {Frame} from './doll.ts';

/** The standard doll's measures, as they were named here before there were dolls. */
export const BODY = {upperArm: STANDARD.upperArm, forearm: STANDARD.forearm, reach: STANDARD.reach, hipBelowFelt: STANDARD.hipBelowFelt, mostLean: STANDARD.mostLean, mostTwist: STANDARD.mostTwist,
  jointInFromShoulderPoint: STANDARD.place.kind === 'film' ? STANDARD.place.jointIn : NaN};
export type Arm = {shoulder: Vec3; elbow: Vec3; wrist: Vec3; reached: boolean};
export type Body = {lean: number; twist: number; hip: Vec3; shoulders: [Vec3, Vec3]; neck: Vec3; head: Vec3; headRadius: number; arms: [Arm, Arm]};

/** The upright figure as the film has her: joints on the plane she sits in, a little behind the table edge. */
export const standing = (lens: Lens, doll: Doll = STANDARD): Frame => dollFrame(lens, doll);
/** The resting hand of the arm that does not deal (her right, image left): wrist and the direction of the fingers, on the felt. */
export function restingHand(lens: Lens): {wrist: Vec3; forward: Vec3} {
  const eye = filmEye(lens), wrist = onPlane(eye, 702.6, 781.2, 0.022)!, tip = onPlane(eye, 804.7, 872.4, 0.022)!; // data/dealer-standard.json, hands.leftInPicture
  return {wrist, forward: unit(sub(tip, wrist))};
}
/** A vector turned about a unit axis (Rodrigues). */
export const turned = (v: Vec3, axis: Vec3, angle: number): Vec3 => add(add(mul(v, Math.cos(angle)), mul(cross(axis, v), Math.sin(angle))), mul(axis, dot(axis, v) * (1 - Math.cos(angle))));
/** Two bones from shoulder to wrist, the elbow bent toward `pole`. A wrist out of reach is brought in along the line to it. */
export function arm(shoulder: Vec3, wrist: Vec3, pole: Vec3, bones: {upperArm: number; forearm: number} = STANDARD): Arm {
  const a = bones.upperArm, b = bones.forearm, far = length(sub(wrist, shoulder)), d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, far)), dir = unit(sub(wrist, shoulder));
  const along = (a * a - b * b + d * d) / (2 * d), out = Math.sqrt(Math.max(0, a * a - along * along)), side = unit(sub(pole, mul(dir, dot(pole, dir))));
  return {shoulder, elbow: add(add(shoulder, mul(dir, along)), mul(side, out)), wrist: add(shoulder, mul(dir, d)), reached: Math.abs(far - d) < 1e-6};
}
/**
 * The figure with its dealing hand (her left, image right) at `dealWrist` and the other at rest. When the arm is too short
 * she bends from the hip toward the hand, and turns her dealing shoulder forward in step with the bend, just as far as the
 * reach needs and no farther than `mostLean`. The elbows bend toward the doll's own poles (where hers hang), or the standard's.
 */
export function solveBody(frame: Frame, dealWrist: Vec3, restWrist: Vec3, doll: Doll = STANDARD): Body {
  const toward = sub(dealWrist, frame.hip), flat = unit([toward[0], 0, toward[2]]), axis = cross([0, 1, 0], flat); // bending about `axis` carries her upper body toward the hand
  const posed = (p: Vec3, lean: number, twist: number): Vec3 => { const spine = turned([0, 1, 0], axis, lean); return add(frame.hip, turned(turned(sub(p, frame.hip), axis, lean), spine, twist)); };
  const twistFor = (lean: number) => { const t = doll.mostTwist * lean / doll.mostLean; return length(sub(dealWrist, posed(frame.shoulders[1], lean, t))) < length(sub(dealWrist, posed(frame.shoulders[1], lean, -t))) ? t : -t; };
  const short = (lean: number) => length(sub(dealWrist, posed(frame.shoulders[1], lean, twistFor(lean)))) > doll.reach;
  let lean = 0; if (short(0)) { let lo = 0, hi = doll.mostLean; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (short(m)) lo = m; else hi = m; } lean = hi; }
  const twist = twistFor(lean), shoulders: [Vec3, Vec3] = [posed(frame.shoulders[0], lean, twist), posed(frame.shoulders[1], lean, twist)], poles = elbowPolesAt(doll, shoulders, [restWrist, dealWrist]);
  return {lean, twist, hip: frame.hip, shoulders, neck: posed(frame.neck, lean, twist), head: posed(frame.head, lean * 0.85, twist * 0.5), headRadius: frame.headRadius,
    arms: [arm(shoulders[0], restWrist, poles[0], doll), arm(shoulders[1], dealWrist, poles[1], doll)]};
}
