// A motion made with one doll, posed on another (dealer3d/src/doll.ts): the hands and the card stay where they are, the
// trunk turns about the new doll's own hip as the old one's turned, and the elbows are solved again with the new bones.
// Where a wrist is beyond the new arm's reach she bends a little more from the hip toward it, never past --most-lean
// degrees of trunk from upright; a wrist still beyond reach is named in the receipt (the hand then lies off the arm).
// --elbow forearm (the default) puts each elbow where the forearm keeps the old one's direction as near as the new bones
// allow, so the forearm the camera sees (and the room it leaves the shoe's window) stays as laid; --elbow upper bends the
// elbow toward the old upper arm's side instead.
//   node dealer3d/tools/doll-pose.ts --motion <dealer3d/data/x.json> --doll paow --out <file.json> [--most-lean 9] [--elbow forearm|upper]
// The output is a motion of the same format, its `doll` naming the new doll, for the page and the recorder
// (dealer3d/tools/shoot.ts --motion-file). It does not lay a new deal: a deal laid for the doll is dealer3d/tools/deal-film.ts.
import {readFileSync, writeFileSync} from 'node:fs';
import {add, cross, dot, length, mul, sub, unit, type Vec3} from '../src/camera.ts';
import {filmLens} from '../src/world.ts';
import {arm, standing, turned} from '../src/body.ts';
import {STANDARD, dollNamed, type Frame} from '../src/doll.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const motionPath = arg('--motion'), out = arg('--out'), doll = dollNamed(arg('--doll', 'paow')), mostLean = Number(arg('--most-lean', '9')) * Math.PI / 180, elbow = arg('--elbow', 'forearm');
if (elbow !== 'forearm' && elbow !== 'upper') throw Error('--elbow is forearm or upper');
if (!motionPath || !out) throw Error('usage: doll-pose.ts --motion <file.json> --doll <name> --out <file.json> [--most-lean 9] [--elbow forearm|upper]');
type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
const motion = JSON.parse(readFileSync(motionPath, 'utf8')) as {hip: Vec3; doll?: string; frames: {L: Limb; R: Limb; h: Vec3}[]; [k: string]: unknown};
const lens = filmLens(), from = dollNamed(motion.doll ?? STANDARD.name), was = standing(lens, from), now = standing(lens, doll);

/** The trunk's axes: across the shoulders, up from the hip (square to across) and forward. */
const axes = (hip: Vec3, s: [Vec3, Vec3]) => { const m = mul(add(s[0], s[1]), 0.5), x = unit(sub(s[1], s[0])), z = unit(cross(x, sub(m, hip))); return {m, x, y: cross(z, x), z}; };
type Axes = ReturnType<typeof axes>;
/** `p` of the trunk `a` laid on the trunk `b` (each point relative to its own axes' origin `o`). */
const carry = (p: Vec3, a: Axes, oa: Vec3, b: Axes, ob: Vec3): Vec3 => { const d = sub(p, oa); return add(ob, add(add(mul(b.x, dot(d, a.x)), mul(b.y, dot(d, a.y))), mul(b.z, dot(d, a.z)))); };
/** The rotation that takes unit `a` to unit `b`, applied to `v`. */
const swing = (v: Vec3, a: Vec3, b: Vec3): Vec3 => { const axis = cross(a, b), s = length(axis); return s < 1e-9 ? v : turned(v, mul(axis, 1 / s), Math.atan2(s, dot(a, b))); };
const tilt = (hip: Vec3, s: [Vec3, Vec3]) => Math.acos(Math.min(1, unit(sub(mul(add(s[0], s[1]), 0.5), hip))[1]));
const deg = (r: number) => Math.round(r * 1800 / Math.PI) / 10, mm = (m: number) => Math.round(m * 10000) / 10;

const restWas = axes(was.hip, was.shoulders), hip = now.hip, long = doll.upperArm + doll.forearm - 1e-4;
const receipt = {from: from.name, to: doll.name, motion: motionPath, mostLeanDeg: deg(mostLean), elbow, frames: [] as {i: number; leanDeg: number; extraDeg: number; shortMm: [number, number]}[]};
const frames = motion.frames.map((f, i) => {
  const trunk = axes(motion.hip, [f.R.s, f.L.s]);
  // Her trunk as the old doll's, then bent on toward the wrist farthest out of reach until both reach (or the limit).
  const posed = (extra: number, toward: Vec3) => { const flat = unit([toward[0] - hip[0], 0, toward[2] - hip[2]]), axis = cross([0, 1, 0], flat);
    // Her upright trunk turned about her own hip as the old doll's trunk has turned from its upright one, then bent on by `extra`.
    const at = (p: Vec3) => add(hip, turned(sub(carry(p, restWas, hip, trunk, hip), hip), axis, extra));
    return {s: [at(now.shoulders[0]), at(now.shoulders[1])] as [Vec3, Vec3], neck: at(now.neck)}; };
  const short = (s: [Vec3, Vec3]): [number, number] => [length(sub(f.R.w, s[0])) - long, length(sub(f.L.w, s[1])) - long];
  let extra = 0, p = posed(0, f.L.w), gap = short(p.s);
  if (Math.max(...gap) > 0) {
    const toward = gap[0] > gap[1] ? f.R.w : f.L.w, room = Math.max(0, mostLean - tilt(hip, p.s));
    let lo = 0, hi = room; if (Math.max(...short(posed(hi, toward).s)) > 0) lo = hi; else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (Math.max(...short(posed(m, toward).s)) > 0) lo = m; else hi = m; }
    extra = hi; p = posed(extra, toward); gap = short(p.s);
  }
  // The head turns from the neck as the old doll's head turned from its neck.
  const oldNeck = carry(was.neck, restWas, restWas.m, trunk, trunk.m), head = add(p.neck, swing(sub(now.head, now.neck), unit(sub(was.head, was.neck)), unit(sub(f.h, oldNeck))));
  // The elbow toward the point a forearm of the new length in the old one's direction would start from (the nearest elbow
  // the new bones allow to it), or toward the old upper arm's side; the old pole where the new one lies along the arm.
  const limb = (l: Limb, s: Vec3): Limb => { const old = sub(l.e, l.s), keep = sub(sub(l.w, mul(unit(sub(l.w, l.e)), doll.forearm)), s), along = unit(sub(l.w, s));
    const pole = elbow === 'forearm' && length(sub(keep, mul(along, dot(keep, along)))) > 1e-6 ? keep : old, a = arm(s, l.w, pole, doll);
    return {...l, s: round(s), e: round(a.elbow), w: l.w, p: l.p}; };
  receipt.frames.push({i, leanDeg: deg(tilt(hip, p.s)), extraDeg: deg(extra), shortMm: [mm(Math.max(0, gap[0])), mm(Math.max(0, gap[1]))]});
  return {...f, R: limb(f.R, p.s[0]), L: limb(f.L, p.s[1]), h: round(head)};
});
function round(v: Vec3): Vec3 { return v.map(x => Math.round(x * 10000) / 10000) as Vec3; }
const worst = receipt.frames.reduce((a, b) => Math.max(...b.shortMm) > Math.max(...a.shortMm) ? b : a), leanMost = receipt.frames.reduce((a, b) => b.leanDeg > a.leanDeg ? b : a);
writeFileSync(out, JSON.stringify({...motion, about: `${motion.about ?? ''} Posed on the doll ${doll.name} by dealer3d/tools/doll-pose.ts.`, doll: doll.name, hip: round(hip), frames}) + '\n');
console.log(JSON.stringify({from: from.name, to: doll.name, frames: frames.length, mostLeanDeg: leanMost.leanDeg, atFrame: leanMost.i, extraMostDeg: Math.max(...receipt.frames.map(f => f.extraDeg)),
  framesShort: receipt.frames.filter(f => Math.max(...f.shortMm) > 0).length, worstShortMm: worst.shortMm, worstAt: worst.i, first: receipt.frames[0], last: receipt.frames[receipt.frames.length - 1]}));
writeFileSync(out.replace(/\.json$/, '.receipt.json'), JSON.stringify(receipt, null, 1) + '\n');
