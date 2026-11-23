// A doll's motion beside the dealer herself, joint by joint in the bank's picture: SAM 3D Body's reading of her pictures
// (dealer3d/tools/docka-sam.py: an anchor, frames of a film) against the same moments of a motion (dealer3d/data/<x>.json,
// as dealer3d/tools/doll-pose.ts or deal-film.ts writes it). What it prints is what the doll's faults are measured by.
//   node dealer3d/tools/docka-jamfor.ts --sam <folder of docka-sam.py> --motion <motion.json> [--film-fps 24]
//        [--at <picture>=<seconds>,...] [--slack 0.3] [--out <file.json>]
// A picture is named as docka-sam.py names its files (<folder>-<stem>). Its moment in the motion is --at's, else the number
// its name ends in as a frame of the film (--film-fps), else the start. Each joint is seen through the bank's lens; the
// difference is the doll's pixel less hers (x right, y down, 1764 x 1174), and in centimetres at the doll's own depth (a
// length across the picture; how far the two differ toward the camera is not in it: SAM's depth is its own guess).
// A film does not keep the doll's time to the frame, so each picture is also laid against the moment within --slack
// seconds where the two wrists lie nearest hers (`nearest`): what differs there is shape, not timing.
// Fingers: for each hand the bend of every finger (knuckle, middle and outer joint, degrees) of hers and of the doll's,
// the hand's length (wrist to middle fingertip along the bones) and its breadth over the knuckles.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {add, dot, filmEye, length, mul, see, sub, unit, type Vec3} from '../src/camera.ts';
import {filmLens} from '../src/world.ts';
import {FINGERS} from '../src/capture.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const folder = arg('--sam'), motionPath = arg('--motion'); if (!folder || !motionPath) throw Error('usage: docka-jamfor.ts --sam <folder> --motion <motion.json> [--film-fps 24] [--at name=seconds,...] [--slack 0.3] [--out file.json]');
const filmFps = Number(arg('--film-fps', '24')), slack = Number(arg('--slack', '0.3'));
const given = new Map((arg('--at', '') || '').split(',').filter(Boolean).map(s => { const [k, v] = s.split('='); return [k, Number(v)] as const; }));
const sam = JSON.parse(readFileSync(path.join(folder, 'sam.json'), 'utf8'));
type Limb = {s: Vec3; e: Vec3; w: Vec3; p: Vec3[]};
const motion = JSON.parse(readFileSync(motionPath, 'utf8')) as {fps: number; doll?: string; frames: {L: Limb; R: Limb; h: Vec3}[]};
const lens = filmLens(), eye = filmEye(lens), f: Vec3 = unit(eye.forward), r: Vec3 = [1, 0, 0], u: Vec3 = [0, -f[2], f[1]];
const toWorld = (p: number[]): Vec3 => add(eye.position, add(add(mul(r, p[0]), mul(u, -p[1])), mul(f, p[2])));
const J = (name: string) => sam.jointNames.indexOf(name), K = (name: string) => sam.keypointNames.indexOf(name);
const round = (n: number, k = 10) => Math.round(n * k) / k;

/** The 21 points of a hand out of SAM's 70 key points (wrist, then thumb to little finger from the palm outward). */
const hand21 = (kp: Vec3[], side: 'right' | 'left'): Vec3[] => { const first = K(`${side}-thumb-tip`), p: Vec3[] = [kp[K(`${side}-wrist`)]];
  for (let finger = 0; finger < 5; finger++) for (let j = 3; j >= 0; j--) p.push(kp[first + finger * 4 + j]); return p; };
/** Her joints from one picture, in the scene (SAM's own size: the pixels are what is compared). */
function hers(i: number) {
  const pic = sam.pictures[i], jt = (pic.joints as number[][]).map(toWorld), kp = (pic.keypoints as number[][]).map(toWorld), name = `${path.basename(path.dirname(pic.picture))}-${path.basename(pic.picture, '.png')}`;
  // The skull's middle, as dealer3d/tools/docka-mat.ts finds it: half-way from the crown (the highest of the surface near the
  // head joint) to the chin (the lowest of what lies under the nose and no more than 3.5 cm behind its tip).
  const bytes = readFileSync(path.join(folder, `${name}.verts.f32`)), raw = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4), verts: Vec3[] = [];
  for (let k = 0; k < raw.length; k += 3) verts.push(toWorld([raw[k], raw[k + 1], raw[k + 2]]));
  const neck = jt[J('c_neck')], headJ = jt[J('c_head')], sR = jt[J('r_uparm')], sL = jt[J('l_uparm')], up = unit(sub(neck, jt[J('c_spine0')])), across = unit(sub(sL, sR));
  const fwd = unit([up[1] * across[2] - up[2] * across[1], up[2] * across[0] - up[0] * across[2], up[0] * across[1] - up[1] * across[0]]), nose = kp[K('nose')];
  const skull = verts.filter(p => length(sub(p, headJ)) < 0.25 && p[1] > neck[1]), crown = skull.reduce((a, b) => b[1] > a[1] ? b : a);
  const front = skull.filter(p => dot(sub(p, nose), fwd) > -0.035 && Math.abs(dot(sub(p, nose), across)) < 0.02 && p[1] < nose[1] && p[1] > nose[1] - 0.1), chin = front.reduce((a, b) => b[1] < a[1] ? b : a);
  return {name, picture: pic.picture as string, head: mul(add(crown, chin), 0.5), R: {s: sR, e: jt[J('r_lowarm')], w: jt[J('r_wrist')], p: hand21(kp, 'right')}, L: {s: sL, e: jt[J('l_lowarm')], w: jt[J('l_wrist')], p: hand21(kp, 'left')},
    acromion: [kp[K('right-acromion')], kp[K('left-acromion')]] as [Vec3, Vec3]};
}
/** The doll's joints at a moment of the motion (between two frames: straight between them). */
function dolls(seconds: number) {
  const at = Math.max(0, Math.min(motion.frames.length - 1, seconds * motion.fps)), a = motion.frames[Math.floor(at)], b = motion.frames[Math.min(motion.frames.length - 1, Math.floor(at) + 1)], t = at - Math.floor(at);
  const mix = (p: Vec3, q: Vec3): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t], limb = (p: Limb, q: Limb): Limb => ({s: mix(p.s, q.s), e: mix(p.e, q.e), w: mix(p.w, q.w), p: p.p.map((x, k) => mix(x, q.p[k]))});
  return {head: mix(a.h, b.h), R: limb(a.R, b.R), L: limb(a.L, b.L)};
}
type Side = {s: Vec3; e: Vec3; w: Vec3; p: Vec3[]};
/** The doll's pixel less hers, and that length in centimetres at the doll's depth. */
const apart = (doll: Vec3, her: Vec3) => { const a = see(eye, doll)!, b = see(eye, her)!, px = Math.hypot(a.x - b.x, a.y - b.y), depth = dot(sub(doll, eye.position), f);
  return {dx: round(a.x - b.x), dy: round(a.y - b.y), px: round(px), cm: round(px * depth / eye.focalPx * 100), her: [round(b.x), round(b.y)], doll: [round(a.x), round(a.y)]}; };
const mean = (rows: {dx: number; dy: number; px: number; cm: number}[]) => ({dx: round(rows.reduce((n, x) => n + x.dx, 0) / rows.length), dy: round(rows.reduce((n, x) => n + x.dy, 0) / rows.length), px: round(rows.reduce((n, x) => n + x.px, 0) / rows.length), cm: round(rows.reduce((n, x) => n + x.cm, 0) / rows.length)});
const KNUCKLES = [5, 9, 13, 17], TIPS = [4, 8, 12, 16, 20];
function compare(h: ReturnType<typeof hers>, d: ReturnType<typeof dolls>) {
  const side = (a: Side, b: Side) => ({shoulder: apart(b.s, a.s), elbow: apart(b.e, a.e), wrist: apart(b.w, a.w), knuckles: mean(KNUCKLES.map(k => apart(b.p[k], a.p[k]))), tips: mean(TIPS.map(k => apart(b.p[k], a.p[k]))), tip: Object.fromEntries(TIPS.map((k, i) => [['thumb', 'index', 'middle', 'ring', 'little'][i], apart(b.p[k], a.p[k])]))});
  return {head: apart(d.head, h.head), right: side(h.R, d.R), left: side(h.L, d.L)};
}
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180 / Math.PI;
/** A hand's own shape: every finger's bends from the knuckle outward, its length and its breadth, and the arm's bend at the elbow. */
function shape(a: Side) {
  const bends = FINGERS.map(c => [angle(sub(a.p[c[0]], a.p[0]), sub(a.p[c[1]], a.p[c[0]])), angle(sub(a.p[c[1]], a.p[c[0]]), sub(a.p[c[2]], a.p[c[1]])), angle(sub(a.p[c[2]], a.p[c[1]]), sub(a.p[c[3]], a.p[c[2]]))].map(n => Math.round(n)));
  const c = FINGERS[2], long = length(sub(a.p[c[0]], a.p[0])) + length(sub(a.p[c[1]], a.p[c[0]])) + length(sub(a.p[c[2]], a.p[c[1]])) + length(sub(a.p[c[3]], a.p[c[2]]));
  return {bends, lengthMm: Math.round(long * 1000), breadthMm: Math.round(length(sub(a.p[5], a.p[17])) * 1000), elbowDeg: Math.round(angle(sub(a.s, a.e), sub(a.w, a.e))), upperArmMm: Math.round(length(sub(a.e, a.s)) * 1000), forearmMm: Math.round(length(sub(a.w, a.e)) * 1000),
    wristBendDeg: Math.round(angle(sub(a.w, a.e), sub(a.p[9], a.p[0])))};
}

const rows = sam.pictures.map((_: unknown, i: number) => {
  const h = hers(i), tail = /(\d+)$/.exec(h.name), seconds = given.get(h.name) ?? (tail && /ruta|frame/.test(h.name) ? Number(tail[1]) / filmFps : 0), last = (motion.frames.length - 1) / motion.fps;
  const wristsOff = (t: number) => { const d = dolls(t), px = (a: Vec3, b: Vec3) => { const p = see(eye, a)!, q = see(eye, b)!; return Math.hypot(p.x - q.x, p.y - q.y); }; return px(d.R.w, h.R.w) + px(d.L.w, h.L.w); };
  let nearest = Math.min(seconds, last); for (let t = Math.max(0, seconds - slack); t <= Math.min(last, seconds + slack) + 1e-9; t += 1 / 120) if (wristsOff(t) < wristsOff(nearest) - 1e-9) nearest = t;
  const d = dolls(Math.min(seconds, last)), n = dolls(nearest);
  return {picture: h.name, seconds: round(seconds, 1000), sameTime: compare(h, d), nearest: {seconds: round(nearest, 1000), ...compare(h, n)},
    hers: {right: shape(h.R), left: shape(h.L), acromionOverJointPx: [round(see(eye, h.R.s)!.y - see(eye, h.acromion[0])!.y), round(see(eye, h.L.s)!.y - see(eye, h.acromion[1])!.y)]}, dolls: {right: shape(d.R), left: shape(d.L)}};
});
const result = {motion: motionPath, doll: motion.doll ?? 'standard', sam: folder, lens, note: 'difference = the doll less her, pixels of 1764 x 1174 (x right, y down); cm across the picture at the doll\'s depth', pictures: rows};
const out = arg('--out'); if (out) writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
type Row = typeof rows[number];
const cell = (a: {dx: number; dy: number; px: number; cm: number}) => `${String(a.px).padStart(5)} px ${String(a.cm).padStart(4)} cm (${a.dx >= 0 ? '+' : ''}${a.dx}, ${a.dy >= 0 ? '+' : ''}${a.dy})`;
const text = rows.map((row: Row) => [`${row.picture}  t=${row.seconds}s  (nearest ${row.nearest.seconds}s)`,
  ...(['sameTime', 'nearest'] as const).flatMap(which => { const c = row[which]; return [`  ${which}`, `    head            ${cell(c.head)}`,
    ...(['right', 'left'] as const).flatMap(s => [`    ${s} shoulder  ${cell(c[s].shoulder)}`, `    ${s} elbow     ${cell(c[s].elbow)}`, `    ${s} wrist     ${cell(c[s].wrist)}`, `    ${s} knuckles  ${cell(c[s].knuckles)}`, `    ${s} tips      ${cell(c[s].tips)}`])]; }),
  ...(['right', 'left'] as const).map(s => `  ${s} hand bends hers ${JSON.stringify(row.hers[s].bends)} doll ${JSON.stringify(row.dolls[s].bends)}; length ${row.hers[s].lengthMm}/${row.dolls[s].lengthMm} mm, breadth ${row.hers[s].breadthMm}/${row.dolls[s].breadthMm} mm, elbow ${row.hers[s].elbowDeg}/${row.dolls[s].elbowDeg} deg, wrist ${row.hers[s].wristBendDeg}/${row.dolls[s].wristBendDeg} deg, bones ${row.hers[s].upperArmMm}+${row.hers[s].forearmMm} mm`)].join('\n')).join('\n');
console.log(text);
if (out) writeFileSync(out.replace(/\.json$/, '.txt'), text + '\n');
