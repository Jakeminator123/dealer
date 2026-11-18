// A hand as a rigid shape in its own axes, and the ways a modelled film moves it: placed somewhere, turned from one set
// of axes to another in a single turn, its fingers bent at their own joints. Pure: no I/O and no three.js.
// Used by the films that are laid by hand and not read off a film (tools/pose-film.ts, src/two-hand.ts). A shape is the
// hand's 21 points against its wrist as [along the hand, the way the palm looks, across]; bending a finger turns the
// points beyond a joint about that joint in the plane of the first two, so every bone keeps its length.
import {add, cross, dot, length, mul, sub, unit, type Vec3} from './camera.ts';
import {turned} from './body.ts';
import {FINGERS} from './capture.ts';

export type Axes = {forward: Vec3; palm: Vec3; across: Vec3};
/** A hand's own axes: along wrist to middle knuckle, the way its palm looks (`sign` as in the read deals: +1 her right, -1 her left), and across. */
export const axesOf = (p: Vec3[], sign: number): Axes => { const forward = unit(sub(p[9], p[0])), raw = mul(unit(cross(sub(p[5], p[0]), sub(p[17], p[0]))), sign), palm = unit(sub(raw, mul(forward, dot(raw, forward)))); return {forward, palm, across: cross(palm, forward)}; };
/** The hand's points against its wrist, in its own axes. */
export const local = (p: Vec3[], a: Axes): Vec3[] => p.map(q => { const d = sub(q, p[0]); return [dot(d, a.forward), dot(d, a.palm), dot(d, a.across)]; });
/** One point of a shape, in the room, as a step from the wrist. */
export const outOf = (q: Vec3, a: Axes): Vec3 => add(add(mul(a.forward, q[0]), mul(a.palm, q[1])), mul(a.across, q[2]));
/** A shape in the room: its wrist at `wrist`, its axes `a`. */
export const placed = (shape: Vec3[], a: Axes, wrist: Vec3): Vec3[] => shape.map(q => add(wrist, outOf(q, a)));
/** The single turn from one set of axes to another, and the axes a share of the way along it. */
export function between(a: Axes, b: Axes, t: number): Axes {
  const A = [a.forward, a.palm, a.across], B = [b.forward, b.palm, b.across], R = [0, 1, 2].map(r => [0, 1, 2].map(c => A.reduce((s, ak, k) => s + B[k][r] * ak[c], 0)));
  const angle = Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))), anti: Vec3 = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]; if (length(anti) < 1e-9) return a;
  const axis = unit(anti), forward = turned(a.forward, axis, angle * t), palm = turned(a.palm, axis, angle * t); return {forward, palm, across: cross(palm, forward)};
}

const rad = (d: number) => d * Math.PI / 180;
/**
 * A shape with fingers bent further. `bends[f]` is the three joints of finger f (1 forefinger to 4 little finger) from
 * the knuckle outward, degrees toward the palm, on top of how the shape already has them.
 */
export function curled(shape: Vec3[], bends: Record<number, number[]>): Vec3[] {
  const p = shape.map(q => [...q] as Vec3);
  for (const [finger, angles] of Object.entries(bends)) { const c = FINGERS[Number(finger)];
    angles.forEach((deg, j) => { const cos = Math.cos(rad(deg)), sin = Math.sin(rad(deg)), pivot = p[c[j]];
      for (let m = j + 1; m <= 3; m++) { const d = sub(p[c[m]], pivot); p[c[m]] = [pivot[0] + d[0] * cos - d[1] * sin, pivot[1] + d[0] * sin + d[1] * cos, pivot[2] + d[2]]; } }); }
  return p;
}
/**
 * A shape with its thumb brought toward `target` (the shape's own axes): each joint in turn, from the tip inward, turns
 * what lies beyond it the shortest way toward the target, the two outer joints by a share at a time and never bent more
 * than `mostBend` degrees. The thumb's bones keep their lengths; it ends as near the target as it can come.
 */
export function thumbToward(shape: Vec3[], target: Vec3, mostBend = 50): Vec3[] {
  let p = shape.map(q => [...q] as Vec3); const c = FINGERS[0], bend = (q: Vec3[], j: number) => Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(q[c[j]], q[c[j - 1]])), unit(sub(q[c[j + 1]], q[c[j]])))))) * 180 / Math.PI;
  for (let pass = 0; pass < 60; pass++) for (const j of [2, 1, 0]) { const pivot = p[c[j]], a = unit(sub(p[c[3]], pivot)), b = unit(sub(target, pivot)), axis = cross(a, b), s = length(axis); if (s < 1e-9) continue;
    const angle = Math.atan2(s, dot(a, b)) * (j === 0 ? 0.6 : 0.3), q = p.map(v => [...v] as Vec3); for (let m = j + 1; m <= 3; m++) q[c[m]] = add(pivot, turned(sub(p[c[m]], pivot), unit(axis), angle));
    if (j > 0 && bend(q, j) > mostBend) continue; p = q; }
  return p;
}
/** A shape a share of the way from one to another: every bone a share of the way round, at its own length (those of `a`). */
export function shapeBetween(a: Vec3[], b: Vec3[], t: number): Vec3[] {
  const mix = (k: number): Vec3 => [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t], p = a.map(q => [...q] as Vec3);
  for (const c of FINGERS) for (let j = 1; j <= 3; j++) p[c[j]] = add(p[c[j - 1]], mul(unit(sub(mix(c[j]), mix(c[j - 1]))), length(sub(a[c[j]], a[c[j - 1]]))));
  return p;
}
/**
 * A value that goes through the keys given ([time, value], times rising), at rest at the first and the last, never
 * beyond the keys on the way between two of them (a monotone cubic: no overshoot).
 */
export function track(keys: [number, number][]): (t: number) => number {
  const n = keys.length, h = keys.slice(1).map((k, i) => k[0] - keys[i][0]), d = keys.slice(1).map((k, i) => (k[1] - keys[i][1]) / h[i]);
  const m = keys.map((_, i) => i === 0 || i === n - 1 || d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]));
  return t => { if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1]; let i = 0; while (t > keys[i + 1][0]) i++;
    const u = (t - keys[i][0]) / h[i], u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * keys[i][1] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * keys[i + 1][1] + (u3 - u2) * h[i] * m[i + 1]; };
}
