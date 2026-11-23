// Paow's left hand at the shoe in A2.3 as "Naturlig" has her (src/doll.ts PAOW.hand.natural, Jakob 2026-11-23: the hand
// over the shoe "fel i grunden … typ lillfingret"): SAM's hand (PAOW.hand.left at hand.at.left) fitted to MediaPipe's
// reading of her left hand in assets/anchors/paow-ankare-2-3-d/anchor.png. The palm and the bones are kept; the hand is
// moved and turned as a whole, each finger spread at its knuckle and bent only in its joints and within them, the thumb
// turned at its base and bent in its two outer joints; the tips of the fore-, middle and ring finger lie on the card in the
// shoe's window and the little finger's near it. Fitted by Levenberg-Marquardt on the picture's pixels through the film's
// camera. Run as it stands, it gives PAOW.hand.natural (shape and place) to the last digit.
//   node dealer3d/tools/docka-hand.ts [out.json]
import {writeFileSync} from 'node:fs';
import {filmEye, see, add, sub, mul, dot, cross, unit, length, type Vec3} from '../src/camera.ts';
import {filmLens, shoeCard, shoePose, SHOE} from '../src/world.ts';
import {PAOW} from '../src/doll.ts';
import {axesOf, local, placed} from '../src/hand-pose.ts';
import {turned} from '../src/body.ts';
import {FINGERS} from '../src/capture.ts';

// MediaPipe hand_landmarker (image mode) on her left hand in the anchor picture, read in three crops at twice the size
// (the whole picture gave only the right hand) and averaged: anchor pixels, MediaPipe's 21 points in its order.
const HERS: [number, number][] = [[1185.7, 692.5], [1173, 721], [1177, 745], [1187, 766.2], [1192.5, 787.9], [1219.2, 742], [1241.2, 775.2], [1255.3, 794.6], [1267.3, 810.3],
  [1237.3, 730.5], [1260.6, 763], [1275.3, 784.3], [1286.6, 801], [1247.7, 718.5], [1271.2, 743.2], [1284.1, 761.6], [1293.6, 777.5], [1251.9, 707.5], [1273.9, 713.8], [1287.3, 721.6], [1297.7, 730]];
const lens = filmLens(), eye = filmEye(lens), S0 = PAOW.hand!.left, AT = PAOW.hand!.at.left;
const card = shoeCard(shoePose(lens, SHOE), SHOE); let N = unit(cross(card.up, card.across)); if (dot(N, sub(eye.position, card.centre)) < 0) N = mul(N, -1);
const outOfCard = (q: Vec3) => dot(sub(q, card.centre), N);
const deg = (r: number) => r * 180 / Math.PI, rad = (d: number) => d * Math.PI / 180;
const Y: Vec3 = [0, 1, 0]; // the palm's way in the shape

/** A joint's bend: the turn from the bone into it to the bone out of it, + toward the palm. */
const flexAt = (into: Vec3, out: Vec3) => { const a = unit(cross(into, Y)); return Math.atan2(dot(cross(unit(into), unit(out)), a), dot(unit(into), unit(out))); };
const turnBeyond = (s: Vec3[], which: number[], pivot: Vec3, axis: Vec3, angle: number) => { for (const k of which) s[k] = add(pivot, turned(sub(s[k], pivot), axis, angle)); };
/** The shape with each finger turned at its joints by `p` (from the wrist outward), the palm as it is. */
function shapeOf(p: number[]): Vec3[] {
  const s = S0.map(q => [...q] as Vec3);
  FINGERS.slice(1).forEach((c, n) => { const [spread, mcp, pip, dip] = p.slice(6 + n * 4, 10 + n * 4);
    turnBeyond(s, c.slice(1), s[c[0]], Y, spread);
    [mcp, pip, dip].forEach((by, j) => { const bone = sub(s[c[j + 1]], s[c[j]]); turnBeyond(s, c.slice(j + 1), s[c[j]], unit(cross(bone, Y)), by); }); });
  const c = FINGERS[0], t = p.slice(22, 27); // the thumb: its base turned freely (3), its two outer joints bent (2)
  const w: Vec3 = [t[0], t[1], t[2]], a = length(w); if (a > 1e-12) turnBeyond(s, c.slice(1), s[c[0]], mul(w, 1 / a), a);
  [t[3], t[4]].forEach((by, j) => { const bone = sub(s[c[j + 2]], s[c[j + 1]]); turnBeyond(s, c.slice(j + 2), s[c[j + 1]], unit(cross(bone, Y)), by); });
  return s;
}
/** The hand's axes turned by p[3..5] (a turn vector, radians) from where SAM had them. */
function axesFrom(p: number[]) { const w = [p[3], p[4], p[5]] as Vec3, a = length(w), k = a > 1e-12 ? mul(w, 1 / a) : [1, 0, 0] as Vec3;
  const f = a > 1e-12 ? turned(AT.forward as Vec3, k, a) : AT.forward as Vec3, pa = a > 1e-12 ? turned(AT.palm as Vec3, k, a) : AT.palm as Vec3;
  return {forward: f, palm: pa, across: cross(pa, f)}; }
const roomOf = (p: number[]) => placed(shapeOf(p), axesFrom(p), [p[0], p[1], p[2]]);
const bendsOf = (s: Vec3[]) => FINGERS.slice(1).map(c => [flexAt(s[c[0]], sub(s[c[1]], s[c[0]])), flexAt(sub(s[c[1]], s[c[0]]), sub(s[c[2]], s[c[1]])), flexAt(sub(s[c[2]], s[c[1]]), sub(s[c[3]], s[c[2]]))]);

// p: the wrist (3), the hand's turn (3), per finger spread, knuckle, middle and end joint (16), the thumb (5).
const initial = [...AT.wrist, 0, 0, 0, ...Array(16).fill(0), 0, 0, 0, 0, 0];
// The weights: a point in the picture 3 px (the wrist 8 px, MediaPipe's least sure), a tip off the card 1 mm (the little
// finger 3 mm), a joint beyond its limit 2°, a finger spread 15°, the thumb turned 25°.
const W = {px: 1 / 3, wristPx: 1 / 8, contact: 1 / 0.001, little: 1 / 0.003, limit: 1 / rad(2), spread: 1 / rad(15), thumb: 1 / rad(25)};
/** How far a tip lies off the card's face, metres (the card's half thickness and the finger pad). */
const OFF = 0.007;
// How far a joint bends (degrees, + toward the palm): the knuckle (the little finger's further back, as a relaxed little finger lies on an edge), the middle and the end joint.
const LIMITS = {mcp: [[-10, 90], [-10, 90], [-10, 90], [-20, 90]], pip: [0, 110], dip: [-5, 80]};
const over = (x: number, [lo, hi]: number[]) => { const d = deg(x); return rad(d < lo ? d - lo : d > hi ? d - hi : 0); };
function residuals(p: number[]): number[] {
  const s = shapeOf(p), q = placed(s, axesFrom(p), [p[0], p[1], p[2]]), r: number[] = [];
  q.forEach((x, k) => { const v = see(eye, x)!, w = k === 0 ? W.wristPx : W.px; r.push((v.x - HERS[k][0]) * w, (v.y - HERS[k][1]) * w); });
  for (const f of [1, 2, 3]) r.push((outOfCard(q[FINGERS[f][3]]) - OFF) * W.contact);
  r.push((outOfCard(q[FINGERS[4][3]]) - OFF) * W.little);
  bendsOf(s).forEach((b, n) => r.push(over(b[0], LIMITS.mcp[n]) * W.limit, over(b[1], LIMITS.pip) * W.limit, over(b[2], LIMITS.dip) * W.limit, p[6 + n * 4] * W.spread));
  for (let j = 22; j < 27; j++) r.push(p[j] * W.thumb);
  return r;
}
const cost = (r: number[]) => r.reduce((s, x) => s + x * x, 0);
function solve(A: number[][], b: number[]): number[] { const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) { let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[m][i])) m = k; [M[i], M[m]] = [M[m], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } }
  const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x; }
function lm(p0: number[], iterations = 400): number[] {
  let p = [...p0], r = residuals(p), c = cost(r), lambda = 1e-2;
  for (let it = 0; it < iterations; it++) {
    const J = p.map((_, j) => { const h = 1e-6, q = [...p]; q[j] += h; const rq = residuals(q); return rq.map((x, i) => (x - r[i]) / h); });
    const n = p.length, A = Array.from({length: n}, (_, a) => Array.from({length: n}, (_, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0)));
    const g = Array.from({length: n}, (_, a) => J[a].reduce((s, x, i) => s + x * r[i], 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries++) { const Ad = A.map((row, a) => row.map((x, b) => a === b ? x * (1 + lambda) + 1e-12 : x)), d = solve(Ad, g.map(x => -x)), q = p.map((x, j) => x + d[j]), rq = residuals(q), cq = cost(rq);
      if (cq < c) { const drop = c - cq; p = q; r = rq; c = cq; lambda = Math.max(1e-7, lambda / 3); improved = true; if (drop < 1e-10) it = iterations; break; } lambda *= 4; }
    if (!improved) break;
  }
  return p;
}

const NAMES = ['pek', 'lång', 'ring', 'lill'];
function report(name: string, p: number[]) {
  const s = shapeOf(p), q = roomOf(p), v = q.map(x => see(eye, x)!), err = v.map((x, k) => Math.hypot(x.x - HERS[k][0], x.y - HERS[k][1]));
  console.log(`\n== ${name}: pixel error mean ${(err.reduce((a, b) => a + b) / 21).toFixed(1)}, max ${Math.max(...err).toFixed(1)} (point ${err.indexOf(Math.max(...err))})`);
  console.log('  tips off the card (mm):', FINGERS.map(c => (outOfCard(q[c[3]]) * 1000).toFixed(1)).join(' '));
  const a = axesFrom(p), toEye = unit(sub(eye.position, q[0]));
  console.log('  back of hand to the eye', deg(Math.acos(dot(mul(a.palm, -1), toEye))).toFixed(1), 'deg; wrist moved', (length(sub(q[0], AT.wrist as Vec3)) * 1000).toFixed(1), 'mm; hand turned', deg(length([p[3], p[4], p[5]])).toFixed(1), 'deg');
  bendsOf(s).forEach((b, n) => console.log(`  ${NAMES[n]}: knuckle ${deg(b[0]).toFixed(0)}, middle ${deg(b[1]).toFixed(0)}, end ${deg(b[2]).toFixed(0)}; spread turned ${deg(p[6 + n * 4]).toFixed(0)} deg`));
}
report('SAM\'s hand (PAOW.hand.left)', initial);
const fit = lm(initial);
report('fitted', fit);
const room = roomOf(fit), axes = axesOf(room, -1), shape = local(room, axes).map(q => q.map(x => Math.round(x * 1e4) / 1e4) as Vec3);
const at = {wrist: room[0].map(x => Math.round(x * 1e4) / 1e4), forward: axes.forward.map(x => Math.round(x * 1e4) / 1e4), palm: axes.palm.map(x => Math.round(x * 1e4) / 1e4)};
const natural = PAOW.hand!.natural!, same = JSON.stringify(shape) === JSON.stringify(natural.left) && JSON.stringify(at) === JSON.stringify(natural.at.left);
console.log(`\nPAOW.hand.natural ${same ? 'is this fit' : 'is NOT this fit'}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({shape, at}, null, 1));
