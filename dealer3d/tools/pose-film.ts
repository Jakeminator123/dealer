// A film of the figure going from rest to a pose and standing still in it, as numbers the page plays (the format of
// dealer3d/data/giv-*.json). Made for an anchor that no film shows yet: the reference film an anchor picture is taken from.
//   node dealer3d/tools/pose-film.ts --pose 2.3 --out dealer3d/data/till-ankare-2-3.json
//   node dealer3d/tools/pose-film.ts --pose 2.3 --frames 90 --goes 3,48 --looks 8,48 --ease 5 --passes 8 --out dealer3d/data/till-ankare-2-3-b.json
// (version b, on Jakob's word of 2026-11-18 that the film to 2.3 was too slow, jerky and leaned too much: 3.0 s, the move done
// at 1.6 s, a gentler ease (--ease 5: the fifth-degree one, whose speed and acceleration both start and end at nought) and the
// elbow smoothed over more frames. The pose it ends in is the same to the last digit, and the body leans only toward it.)
// Reads dealer3d/data/giv-pamela-p4.json (the resting hand as read off the film, the card standing in the shoe, the hip)
// and writes one file. Prints what the pose asks of the body.
//
// Read: the shape of a flat hand (her right hand resting in Pamela's film; her left is its mirror, so the two are the
// same size) and where it rests. A MODEL, all of it: where the hands end, the way there, how the body leans and turns,
// and where she looks. Pose 2.3 is the real dealer's stance just before the draw, as the session MODEL read it off a
// film of one (2026-11-18): her left hand on the card standing in the shoe's window, come in from her own side across
// the shoe's mouth, the tips of fore and middle finger on the middle of the card, the thumb spread up and away from it,
// the back of the hand up, the wrist at the height of the shoe's front edge; her right hand flat on the felt in front
// of the shoe's mouth, fingers together and pointing into it, a card's length and a little more before the shoe's foot;
// her head bowed toward the shoe, her eyes on the card.
import {readFile, writeFile} from 'node:fs/promises';
import {TABLE_LENS, SHOE, add, cross, dot, length, mul, shoeCard, shoePose, sub, unit, type Vec3} from '../../src/table-lens.ts';
import {arm, standing, turned} from '../src/body.ts';
import {LIMITS, joints, type ArmPose} from '../src/capture.ts';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg('--out'); if (!out || arg('--pose') !== '2.3') throw Error('usage: pose-film.ts --pose 2.3 --out <json>');
const pair = (name: string, d: number[]) => arg(name)?.split(',').map(Number) ?? d;
const FPS = 30, N = Number(arg('--frames') ?? 120), GOES = pair('--goes', [15, 84]), LOOKS = pair('--looks', [30, 84]), PASSES = Number(arg('--passes') ?? 3), EASE5 = arg('--ease') === '5'; // frames: at rest to 0.5 s, on the way to 2.8 s, still from there; her eyes go down from 1.0 s
const POSE = {lean: 10, twist: 8, wristAtShoe: SHOE.frontHeight, beforeShoe: 0.11, thumb: 35, arcL: 0.05, arcR: 0.035}; // degrees and metres

const read = JSON.parse(await readFile(new URL('../data/giv-pamela-p4.json', import.meta.url), 'utf8')), first = read.frames[0], lens = TABLE_LENS, frame = standing(lens);
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t), lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
type Axes = {forward: Vec3; palm: Vec3; across: Vec3};
/** A hand's own axes: along wrist to middle knuckle, the way its palm looks (`sign` as in the read deals: +1 her right, -1 her left), and across. */
const axesOf = (p: Vec3[], sign: number): Axes => { const forward = unit(sub(p[9], p[0])), raw = mul(unit(cross(sub(p[5], p[0]), sub(p[17], p[0]))), sign), palm = unit(sub(raw, mul(forward, dot(raw, forward)))); return {forward, palm, across: cross(palm, forward)}; };
const local = (p: Vec3[], a: Axes): Vec3[] => p.map(q => { const d = sub(q, p[0]); return [dot(d, a.forward), dot(d, a.palm), dot(d, a.across)]; });
const placed = (shape: Vec3[], a: Axes, wrist: Vec3): Vec3[] => shape.map(q => add(wrist, add(add(mul(a.forward, q[0]), mul(a.palm, q[1])), mul(a.across, q[2]))));
/** The single turn from one set of axes to another, and the axes a share of the way along it. */
function between(a: Axes, b: Axes, t: number): Axes {
  const A = [a.forward, a.palm, a.across], B = [b.forward, b.palm, b.across], R = [0, 1, 2].map(r => [0, 1, 2].map(c => A.reduce((s, ak, k) => s + B[k][r] * ak[c], 0)));
  const angle = Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))), anti: Vec3 = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]; if (length(anti) < 1e-9) return a;
  const axis = unit(anti), forward = turned(a.forward, axis, angle * t), palm = turned(a.palm, axis, angle * t); return {forward, palm, across: cross(palm, forward)};
}

// The two hands at rest: her right as read, her left its mirror in the plane through her middle.
const middle = read.hip[0] as number, mirror = (p: Vec3): Vec3 => [2 * middle - p[0], p[1], p[2]];
const restR = first.R.p as Vec3[], restL = restR.map(mirror), axR0 = axesOf(restR, 1), axL0 = axesOf(restL, -1), flatR = local(restR, axR0), flatL = local(restL, axL0);
// Her left hand's shape at the shoe: the flat hand with its thumb spread away from the forefinger, about the palm's own line through the thumb's root.
const spreadL = flatL.map((q, k) => { if (k < 2 || k > 4) return q; const root = flatL[1], d = sub(q, root), way = Math.sign(dot(cross([0, 1, 0], sub(flatL[4], root)), sub(flatL[5], root))) || 1; return add(root, turned(d, [0, 1, 0], -way * rad(POSE.thumb))); });

// Where the hands end.
const shoe = shoePose(lens), inShoe = shoeCard(shoe), outOfWindow = (() => { const n = unit(cross(inShoe.across, inShoe.up)); return n[1] < 0 ? mul(n, -1) : n; })();
// Her left: fingers across the card toward the players and a little down, the palm half way between straight down and flat against the card; the tips of fore and middle finger on the card's middle.
const leftAt = (dip: number): {axes: Axes; wrist: Vec3; points: Vec3[]} => { const flatWay = unit([-inShoe.across[0], 0, -inShoe.across[2]]), forward = unit([flatWay[0] * Math.cos(dip), -Math.sin(dip), flatWay[2] * Math.cos(dip)]);
  const want = unit(lerp([0, -1, 0], mul(outOfWindow, -1), 0.25)), palm = unit(sub(want, mul(forward, dot(want, forward)))), axes = {forward, palm, across: cross(palm, forward)};
  const tips = mul(add(spreadL[8], spreadL[12]), 0.5), onCard = add(inShoe.centre, mul(outOfWindow, 0.01)), wrist = sub(onCard, add(add(mul(forward, tips[0]), mul(palm, tips[1])), mul(axes.across, tips[2])));
  return {axes, wrist, points: placed(spreadL, axes, wrist)}; };
let dip = rad(19); for (let pass = 0; pass < 40; pass++) { const w = leftAt(dip).wrist[1]; dip -= (w - POSE.wristAtShoe) * 2; dip = Math.max(-0.4, Math.min(1.2, dip)); } // a hand that dips more toward its fingertips has its wrist higher // the dip that puts her wrist at the height of the shoe's front edge
const endL = leftAt(dip);
// Her right: turned about a plumb line until its fingers point into the shoe's mouth, slid along the felt until its middle fingertip is `beforeShoe` before the mouth's middle.
const mouth = add(shoe.front, mul(shoe.far, SHOE.width / 2)), into = unit([shoe.back[0], 0, shoe.back[2]]), yaw = Math.atan2(cross([axR0.forward[0], 0, axR0.forward[2]], into)[1], dot([axR0.forward[0], 0, axR0.forward[2]], into));
const turnedR = restR.map(q => add(restR[12], turned(sub(q, restR[12]), [0, 1, 0], yaw))), tipR: Vec3 = [mouth[0] - into[0] * POSE.beforeShoe, restR[12][1], mouth[2] - into[2] * POSE.beforeShoe], endRp = turnedR.map(q => add(q, sub(tipR, restR[12])));
const axR1 = axesOf(endRp, 1), endR = {axes: axR1, wrist: endRp[0], points: endRp};

// Her body: bent forward from the hip and turned toward the shoe, a share of the way at each moment.
const posed = (p: Vec3, s: number, k = 1): Vec3 => { const lean = rad(POSE.lean) * s * k, twist = rad(POSE.twist) * s * k, spine = turned([0, 1, 0], [1, 0, 0], lean); return add(frame.hip, turned(turned(sub(p, frame.hip), [1, 0, 0], lean), spine, twist)); };
/** The arm whose elbow, of all the places it can be, asks least of the wrist, hanging no higher than the shoulder and not through the body. */
const reach = (shoulder: Vec3, points: Vec3[], sign: number, side: number): ArmPose & {wristBend: number} => { let best: (ArmPose & {wristBend: number}) | null = null;
  const dir = unit(sub(points[0], shoulder)), u = unit(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(dir, u); // every place the elbow can be lies on one circle about the line from shoulder to wrist
  for (let k = 0; k < 72; k++) { const t = k * Math.PI / 36, pole = add(mul(u, Math.cos(t)), mul(v, Math.sin(t))), a = arm(shoulder, points[0], pole), pose: ArmPose = {shoulder, elbow: a.elbow, wrist: points[0], stretch: 1, points};
    if (a.elbow[1] > shoulder[1] + 0.02 || side * (a.elbow[0] - shoulder[0]) < -0.03 || a.elbow[1] < 0.03 || Math.hypot(a.elbow[0] - frame.hip[0], a.elbow[2] - frame.hip[2]) < 0.14) continue; // not over the shoulder, not across or inside the body, not under the felt
    const bend = joints(pose, sign).wrist; if (!best || bend < best.wristBend) best = {...pose, wristBend: bend}; }
  if (!best) { const a = arm(shoulder, points[0], [side * 0.7, -0.6, -0.4]); best = {shoulder, elbow: a.elbow, wrist: points[0], stretch: 1, points, wristBend: NaN}; }
  return best; };

const standingCard = first.card, lookUp = (head: Vec3): Vec3 => [head[0], head[1] - 0.25, head[2] + 1.2], frames = [];
let asked = {L: 0, R: 0, elbowL: [180, 0], elbowR: [180, 0], far: {L: 0, R: 0}};
const ease = (t: number) => EASE5 ? (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t)) : smooth(t);
for (let i = 0; i < N; i++) { const s = ease((i - GOES[0]) / (GOES[1] - GOES[0])), look = ease((i - LOOKS[0]) / (LOOKS[1] - LOOKS[0]));
  const handAt = (shape0: Vec3[], shape1: Vec3[], a0: Axes, a1: Axes, w0: Vec3, w1: Vec3, arc: number): Vec3[] => placed(shape0.map((q, k) => lerp(q, shape1[k], s)), between(a0, a1, s), add(lerp(w0, w1, s), [0, arc * Math.sin(Math.PI * s), 0]));
  const L = handAt(flatL, spreadL, axL0, endL.axes, restL[0], endL.wrist, POSE.arcL), R = handAt(flatR, flatR, axR0, endR.axes, restR[0], endR.wrist, POSE.arcR);
  const sR = posed(frame.shoulders[0], s), sL = posed(frame.shoulders[1], s), aL = reach(sL, L, -1, 1), aR = reach(sR, R, 1, -1), head = posed(frame.head, s, 0.85);
  for (const [key, a, sign] of [['L', aL, -1], ['R', aR, 1]] as const) { const j = joints(a, sign); asked[key] = Math.max(asked[key], j.wrist); const e = key === 'L' ? asked.elbowL : asked.elbowR; e[0] = Math.min(e[0], j.elbow); e[1] = Math.max(e[1], j.elbow); asked.far[key] = Math.max(asked.far[key], length(sub(a.wrist, a.shoulder))); }
  const r = (v: number[]) => v.map(x => Math.round(x * 10000) / 10000), limb = (a: ArmPose) => ({s: r(a.shoulder), e: r(a.elbow), w: r(a.wrist), k: 1, p: a.points.map(r)});
  frames.push({card: standingCard, L: limb(aL), R: limb(aR), h: r(head), g: r(lerp(lookUp(head), inShoe.centre, look))}); }
// The elbow is chosen anew in every frame; smooth it over time so that it does not hop between two equally good places.
for (const side of ['L', 'R'] as const) for (let pass = 0; pass < PASSES; pass++) for (let i = 1; i < N - 1; i++) { const e = [0, 1, 2].map(k => (frames[i - 1][side].e[k] + 2 * frames[i][side].e[k] + frames[i + 1][side].e[k]) / 4) as Vec3, sh = frames[i][side].s as Vec3, w = frames[i][side].w as Vec3; frames[i][side].e = arm(sh, w, sub(e, sh)).elbow.map(x => Math.round(x * 10000) / 10000); }

const tipsR = endR.points[12], beforeFoot = length(sub([tipsR[0], 0, tipsR[2]], [mouth[0], 0, mouth[2]]));
console.log([`Pose 2.3, ${N} rutor, ${FPS} per sekund: vila till ruta ${GOES[0]}, på väg till ruta ${GOES[1]}, stilla därefter.`,
  `Kroppen: lutar ${POSE.lean}° framåt från höften och vrider bålen ${POSE.twist}° mot skon (modell). Utan det når båda händerna ändå: vänster arm som längst ${(asked.far.L * 100).toFixed(0)} cm och höger ${(asked.far.R * 100).toFixed(0)} cm av armens 55.`,
  `Vänster hand vid skon: handled ${f(endL.wrist)}, ${(endL.wrist[1] * 1000).toFixed(0)} mm över filten (skons framkant ${(SHOE.frontHeight * 1000).toFixed(0)}), handen lutar ${deg(dip).toFixed(0)}° nedåt mot kortet, pek- och långfingrets toppar ${f(mul(add(endL.points[8], endL.points[12]), 0.5))} mot kortets mitt ${f(inShoe.centre)}, tummens topp ${f(endL.points[4])}.`,
  `Höger hand: långfingrets topp ${f(tipsR)}, ${(beforeFoot * 100).toFixed(1)} cm före mynningens mitt ${f(mouth)}, handled ${f(endR.wrist)}.`,
  `Leder (grader): vänster handled högst ${asked.L.toFixed(0)}, höger ${asked.R.toFixed(0)} (gräns ${LIMITS.wrist}); vänster armbåge ${asked.elbowL.map(n => n.toFixed(0)).join('–')}, höger ${asked.elbowR.map(n => n.toFixed(0)).join('–')} (gräns ${LIMITS.elbow}).`].join('\n'));
function f(v: number[]) { return '(' + v.map(n => n.toFixed(3)).join(', ') + ')'; }

await writeFile(out, JSON.stringify({about: 'The figure going from rest to pose 2.3 and standing still in it, laid by dealer3d/tools/pose-film.ts. The shape of the hands is read (her right hand resting in the film named; her left is its mirror); where they end, the way there, the body and where she looks (g) are a model. Same frame and fields as the read deals; the card stands in the shoe throughout.',
  film: read.film, pose: '2.3', to: null, loose: 0, fps: FPS, frameCount: N, leavesShoe: N - 1, edge: [N - 1, N - 1], folds: N - 1, rests: N - 1, handSize: read.handSize, palm: read.palm, throughShoe: 0, hip: read.hip, frames}) + '\n');
