// A motion made with one doll, posed on another (dealer3d/src/doll.ts): the card stays where it is and the hands keep hold
// of it, the trunk turns about the new doll's own hip as the old one's turned, and the elbows are solved again with the
// new bones. Where a wrist is farther off than the new doll reaches (Doll.reach) she first turns that shoulder toward the
// hand, as far as her own proportion of turn to lean allows at the lean she has (Doll.mostTwist to Doll.mostLean), and
// then bends on from the hip toward it with the turn following, never past --most-lean degrees of trunk from upright. A
// wrist still beyond the arm's whole length is named in the receipt (the hand then lies off the arm).
// The hands: a doll with a hand of its own (Doll.hand) gets it, --hands doll (the default for such a doll): her hand as
// she holds it at the anchor where the motion stands at that anchor (frame --hands-at; without it the first frame of a
// motion that leaves an anchor, `pose: from-...`, else the last), and from there every bone turns as the motion's bone
// does. Where the motion stands at the anchor the hand lies where hers does (Doll.hand.at): moved and turned from where
// the motion has it. That difference fades over the first five centimetres the motion's hand moves from where it held at
// the anchor (and comes back when the hand does), so a hand that takes or carries a card holds what the motion's holds;
// the fingers slide that far over a card they already hold at the anchor. Away from the anchor the hand reaches
// the way the old one did (the line from the wrist to the middle of the forefinger's and the middle finger's tips keeps
// its direction, and the line across the knuckles its as far as it lies across the first) and that middle stays where it
// was, which is where the motion's hands hold the card; so the wrist moves, by as much as her hand differs from the old
// one. The two fingers that hold have their tips where the old hand's are (at the anchor as far from them as her own
// hand has them, fading with the rest): each curls or opens until it is long enough and turns at its knuckle toward its
// place. The other fingers and the thumb bend from her own shape as the motion's do from its while the hand is at the
// anchor; away from it, in a deal (a motion with beats), the hand has the shape she carries a card with (Doll.hand.grip),
// where the doll has one; in a pose film, where no card is carried, it keeps bending from her own shape. No part of the hand
// goes under the felt (a joint no nearer it than a finger's half thickness, unless the old hand's was): the thumb turns
// up about its base, the hand pivots about the point it holds, wrist up, until its palm is clear, and it rises by what
// is left. Where the motion stands at rest (frame --rest-at; without it the first frame of a pose film, none in a deal) the
// hand is hers at rest (Doll.hand.rest), in shape and place, fading over the same five centimetres. --hands motion leaves
// the hands as laid.
// The elbows: --elbow doll (the default for a doll with poles of its own, Doll.elbowPoles) bends each toward the doll's
// pole, where hers hang, and toward the poles of her rest as far as both hands lie in front of their shoulders
// (Doll.elbowAtRest, src/doll.ts elbowPolesAt); --elbow forearm (the default otherwise) puts each elbow where the forearm keeps the old one's
// direction as near as the new bones allow; --elbow upper bends the elbow toward the old upper arm's side instead.
//   node dealer3d/tools/doll-pose.ts --motion <dealer3d/data/x.json> --doll paow --out <file.json> [--most-lean 9]
//        [--elbow doll|forearm|upper] [--hands doll|motion] [--hands-at <frame>] [--rest-at <frame>]
// The output is a motion of the same format, its `doll` naming the new doll, for the page and the recorder
// (dealer3d/tools/shoot.ts --motion-file). It does not lay a new deal: a deal laid for the doll is dealer3d/tools/deal-film.ts.
import {readFileSync, writeFileSync} from 'node:fs';
import {add, cross, dot, length, mul, sub, unit, type Vec3} from '../src/camera.ts';
import {filmLens} from '../src/world.ts';
import {arm, standing, turned} from '../src/body.ts';
import {STANDARD, dollNamed, elbowPolesAt} from '../src/doll.ts';
import {FINGERS} from '../src/capture.ts';
import {axesOf, between, carried, local, placed, shapeBetween, swung, type Axes as HandAxes} from '../src/hand-pose.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const motionPath = arg('--motion'), out = arg('--out'), doll = dollNamed(arg('--doll', 'paow')), mostLean = Number(arg('--most-lean', '9')) * Math.PI / 180;
const elbow = arg('--elbow', doll.elbowPoles ? 'doll' : 'forearm'), hands = arg('--hands', doll.hand ? 'doll' : 'motion');
if (elbow !== 'forearm' && elbow !== 'upper' && elbow !== 'doll') throw Error('--elbow is doll, forearm or upper');
if (elbow === 'doll' && !doll.elbowPoles) throw Error(`Dockan ${doll.name} har inga egna armbågspoler.`);
if (hands !== 'doll' && hands !== 'motion') throw Error('--hands is doll or motion');
if (hands === 'doll' && !doll.hand) throw Error(`Dockan ${doll.name} har ingen egen hand.`);
if (!motionPath || !out) throw Error('usage: doll-pose.ts --motion <file.json> --doll <name> --out <file.json> [--most-lean 9] [--elbow doll|forearm|upper] [--hands doll|motion] [--hands-at <frame>]');
type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
const motion = JSON.parse(readFileSync(motionPath, 'utf8')) as {hip: Vec3; doll?: string; pose?: string; frames: {L: Limb; R: Limb; h: Vec3}[]; [k: string]: unknown};
const lens = filmLens(), from = dollNamed(motion.doll ?? STANDARD.name), was = standing(lens, from), now = standing(lens, doll);

/** The trunk's axes: across the shoulders, up from the hip (square to across) and forward. */
const axes = (hip: Vec3, s: [Vec3, Vec3]) => { const m = mul(add(s[0], s[1]), 0.5), x = unit(sub(s[1], s[0])), z = unit(cross(x, sub(m, hip))); return {m, x, y: cross(z, x), z}; };
type Axes = ReturnType<typeof axes>;
/** `p` of the trunk `a` laid on the trunk `b` (each point relative to its own axes' origin `o`). */
const carry = (p: Vec3, a: Axes, oa: Vec3, b: Axes, ob: Vec3): Vec3 => { const d = sub(p, oa); return add(ob, add(add(mul(b.x, dot(d, a.x)), mul(b.y, dot(d, a.y))), mul(b.z, dot(d, a.z)))); };
const tilt = (hip: Vec3, s: [Vec3, Vec3]) => Math.acos(Math.min(1, unit(sub(mul(add(s[0], s[1]), 0.5), hip))[1]));
const deg = (r: number) => Math.round(r * 1800 / Math.PI) / 10, mm = (m: number) => Math.round(m * 10000) / 10;

const restWas = axes(was.hip, was.shoulders), hip = now.hip, long = doll.upperArm + doll.forearm - 1e-4, turnPerLean = doll.mostTwist / doll.mostLean;
// Her own hands: the frame in which the motion stands at the anchor her hand was read at, and the motion's hands there in their own axes.
const handsAt = hands === 'doll' ? Number(arg('--hands-at', String(motion.pose?.startsWith('from-') ? 0 : motion.frames.length - 1))) : -1;
if (hands === 'doll' && !(Number.isInteger(handsAt) && handsAt >= 0 && handsAt < motion.frames.length)) throw Error('--hands-at is a frame of the motion');
const grip = (s: Vec3[]): Vec3 => mul(add(s[8], s[12]), 0.5), own = (l: Limb, sign: number) => local(l.p, axesOf(l.p, sign));
/** A hand's reach as three axes: from the wrist to the middle of the two fingertips that hold, the line across the knuckles square to it, and the third. */
const reachOf = (s: Vec3[]): [Vec3, Vec3, Vec3] => { const g = unit(sub(grip(s), s[0])), t = sub(s[17], s[5]), across = unit(sub(t, mul(g, dot(t, g)))); return [g, across, cross(g, across)]; };
const into = (q: Vec3, f: [Vec3, Vec3, Vec3]): Vec3 => [dot(q, f[0]), dot(q, f[1]), dot(q, f[2])], outFrom = (q: Vec3, f: [Vec3, Vec3, Vec3]): Vec3 => add(add(mul(f[0], q[0]), mul(f[1], q[1])), mul(f[2], q[2]));
/** A shape turned to reach as `now` does and moved so that it holds the point `now` holds (both in `now`'s own axes). */
const reaching = (shape: Vec3[], now: Vec3[]): Vec3[] => { const from = reachOf(shape), to = reachOf(now), turnedTo = shape.map(q => outFrom(into(sub(q, shape[0]), from), to)), step = sub(grip(now), grip(turnedTo)); return turnedTo.map(q => add(q, step)); };
const HOLDING = [FINGERS[1], FINGERS[2]]; // the forefinger and the middle finger: their tips are what the hand holds with
const FINGER = 0.007, lowest = (p: Vec3[], which?: number[]) => Math.min(...(which ? which.map(k => p[k]) : p).map(q => q[1]));
/**
 * One finger of the hand `h` curled at its three joints, least at the outer one, until its tip is as far from its knuckle
 * as `target` is (or opened a little, as far as that makes it longer), then turned at the knuckle to point at it. `bend`
 * is the axis the hand's fingers bend about (toward the palm); the finger bends about it as far as it lies across the finger.
 */
const fingerTo = (h: Vec3[], c: number[], bend: Vec3, target: Vec3): void => {
  const along = unit(sub(h[c[1]], h[c[0]])), axis = unit(sub(bend, mul(along, dot(bend, along)))), share = [1, 1, 0.7];
  const curledBy = (by: number) => { const p = h.map(q => [...q] as Vec3); c.slice(0, 3).forEach((j, n) => { const pivot = p[j]; for (const m of c.slice(n + 1)) p[m] = add(pivot, turned(sub(p[m], pivot), axis, by * share[n])); }); return p; };
  const want = length(sub(target, h[c[0]])), far = (by: number) => length(sub(curledBy(by)[c[3]], h[c[0]])), slack = 1e-5;
  let by = 0; // radians
  if (want < far(0) - slack) { let lo = 0, hi = 1.2; if (far(hi) < want) for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (far(m) > want) lo = m; else hi = m; } by = hi; }
  else if (want > far(0) + slack) for (let open = -0.01; open > -0.105; open -= 0.01) { if (far(open) <= far(by)) break; by = open; if (far(by) >= want) break; }
  const p = curledBy(by), knuckle = p[c[0]], was = unit(sub(p[c[3]], knuckle)), to = unit(sub(target, knuckle));
  for (const j of c.slice(1)) h[j] = add(knuckle, swung(sub(p[j], knuckle), was, to));
};
/**
 * The axis a hand's fingers bend about, turning toward the palm: the line across the knuckles, the way round that the
 * fingers are bent already (summed over every joint of the four fingers, so it holds in mirrored axes as well).
 */
const bendAxis = (h: Vec3[]): Vec3 => { const across = unit(sub(h[17], h[5]));
  const bent = FINGERS.slice(1).reduce((sum, c) => sum + [0, 1, 2].reduce((t, k) => t + dot(cross(sub(h[c[k]], h[k ? c[k - 1] : 0]), sub(h[c[k + 1]], h[c[k]])), across), 0), 0);
  return mul(across, bent < 0 ? -1 : 1); };
/** The least turn, none to `most`, at which `low` is at least `floor`; where it never is, the least turn that brings it as high as it gets (to half a millimetre). */
const leastTurn = (most: number, floor: number, low: (angle: number) => number): number => {
  if (low(0) >= floor) return 0;
  if (low(most) < floor) { const at = Array.from({length: 51}, (_, n) => low(most * n / 50)), high = Math.max(...at); return most * at.findIndex(l => l >= high - 0.0005) / 50; }
  let lo = 0, hi = most; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (low(m) < floor) lo = m; else hi = m; } return hi; };
/** The points `which` of a hand in the room turned upward about `pivot`: about the level axis square to the line from the pivot to `end`. */
const lifted = (p: Vec3[], which: number[], pivot: Vec3, end: Vec3, angle: number): Vec3[] => { const out = sub(end, pivot), flat: Vec3 = [out[0], 0, out[2]]; if (length(flat) < 1e-6) return p;
  const axis = unit(cross(unit(flat), [0, 1, 0])), q = p.map(v => [...v] as Vec3); for (const k of which) q[k] = add(pivot, turned(sub(p[k], pivot), axis, angle)); return q; };
const PALM = [0, 1, 2, 5, 9, 13, 17]; // the wrist, the thumb's base and first joint, and the knuckles: what a pivot about the fingertips lifts
/**
 * A hand in the room clear of the felt: its thumb turned up about its base, then the hand pivoted about the point it holds,
 * wrist up, until its palm is clear, each by the least angle that does it; fingers still under are lifted straight up with the hand.
 */
const clear = (p: Vec3[], floor: number): Vec3[] => { const thumb = FINGERS[0].slice(1), all = p.map((_, k) => k);
  const up = lifted(p, thumb, p[FINGERS[0][0]], p[FINGERS[0][3]], leastTurn(0.9, floor, t => lowest(lifted(p, thumb, p[FINGERS[0][0]], p[FINGERS[0][3]], t), thumb)));
  const pivoted = lifted(up, all, grip(up), up[0], leastTurn(0.5, floor, t => lowest(lifted(up, all, grip(up), up[0], t), PALM))), under = Math.max(0, floor - lowest(pivoted));
  return pivoted.map(q => [q[0], q[1] + under, q[2]] as Vec3); };
const refs = hands === 'doll' ? {R: own(motion.frames[handsAt].R, 1), L: own(motion.frames[handsAt].L, -1)} : null;
/** How far each holding fingertip of the doll's hand is from the old hand's at the anchor, in the old hand's reach axes. */
const apartAt = (hand: Vec3[], ref: Vec3[]): Vec3[] => { const h = reaching(hand, ref), f = reachOf(ref); return HOLDING.map(c => into(sub(h[c[3]], ref[c[3]]), f)); };
const apart = refs && doll.hand ? {R: apartAt(doll.hand.right, refs.R), L: apartAt(doll.hand.left, refs.L)} : null;
/** A motion with beats is a deal: a card is taken, carried and laid. A pose film has none, and no hand in it carries a card. */
const carries = Array.isArray(motion.beats) && motion.beats.length > 0;
/**
 * The doll's hand for one limb of the motion, in the room, before it is cleared of the felt: reaching the same way, holding
 * the same point. `asAnchor` is how much of the anchor is left in it (1 there, 0 away from it): at the anchor the two
 * fingertips that hold lie where her own hand has them, away from it where the motion's hand has its.
 */
const holding = (l: Limb, sign: number, asAnchor: number): Vec3[] => { const a = axesOf(l.p, sign), now = local(l.p, a), f = reachOf(now), off = sign > 0 ? apart!.R : apart!.L;
  const bent = carried(now, sign > 0 ? refs!.R : refs!.L, sign > 0 ? doll.hand!.right : doll.hand!.left), gripped = carries && doll.hand!.grip && (sign > 0 ? doll.hand!.grip.right : doll.hand!.grip.left);
  const h = reaching(gripped && asAnchor < 1 ? shapeBetween(gripped, bent, asAnchor) : bent, now);
  for (let pass = 0; pass < 3; pass++) { // each holding finger to its tip's place, and the hand moved back onto the point it holds
    const bend = bendAxis(h); HOLDING.forEach((c, n) => fingerTo(h, c, bend, add(now[c[3]], mul(outFrom(off[n], f), asAnchor))));
    const step = sub(grip(now), grip(h)); h.forEach((q, k) => { h[k] = add(q, step); }); }
  return placed(h, a, l.p[0]); };
const FADE = 0.05; // metres from where the motion's hand holds at the anchor: there the doll's hand lies as hers did, this far off and beyond as the motion's
/** At the anchor: the hand as `holding` gives it and as she holds hers (Doll.hand.at), their axes and the points they hold, and where the motion's hand holds. */
const anchored = (l: Limb, sign: number, shape: Vec3[], at: {wrist: Vec3; forward: Vec3; palm: Vec3}) => { const was = holding(l, sign, 1), hers = placed(shape, {forward: at.forward, palm: at.palm, across: cross(at.palm, at.forward)}, at.wrist);
  return {from: axesOf(was, sign), to: axesOf(hers, sign), step: sub(grip(hers), grip(was)), held: grip(l.p)}; };
const anchors = refs && doll.hand && apart ? {R: anchored(motion.frames[handsAt].R, 1, doll.hand.right, doll.hand.at.right), L: anchored(motion.frames[handsAt].L, -1, doll.hand.left, doll.hand.at.left)} : null;
const share = (away: number) => { const x = Math.max(0, Math.min(1, away / FADE)); return 1 - x * x * (3 - 2 * x); };
const into3 = (q: Vec3, a: HandAxes): Vec3 => [dot(q, a.forward), dot(q, a.palm), dot(q, a.across)], out3 = (q: Vec3, a: HandAxes): Vec3 => add(add(mul(a.forward, q[0]), mul(a.palm, q[1])), mul(a.across, q[2]));
// Where the motion stands at rest (frame --rest-at; without it the first frame of a pose film, which leaves rest for its
// anchor; a deal has none), a doll with a hand at rest of its own (Doll.hand.rest) has that: its shape, lying where hers does.
const restAt = hands === 'doll' && doll.hand?.rest ? Number(arg('--rest-at', String(carries || motion.pose?.startsWith('from-') ? -1 : 0))) : -1;
if (!(Number.isInteger(restAt) && restAt >= -1 && restAt < motion.frames.length)) throw Error('--rest-at is a frame of the motion, or -1 for none');
const rests = restAt >= 0 ? {R: {held: grip(motion.frames[restAt].R.p), shape: doll.hand!.rest!.right, at: doll.hand!.rest!.at.right}, L: {held: grip(motion.frames[restAt].L.p), shape: doll.hand!.rest!.left, at: doll.hand!.rest!.at.left}} : null;
/** The hand `p` turned into her hand at rest, by as much as the motion's hand `l` is near where it held at rest (the same five centimetres as at the anchor). */
const rested = (p: Vec3[], l: Limb, sign: number): Vec3[] => { const k = rests && (sign > 0 ? rests.R : rests.L), w = k ? share(length(sub(grip(l.p), k.held))) : 0; if (!k || w <= 0) return p;
  const a = axesOf(p, sign); return placed(shapeBetween(local(p, a), k.shape, w), between(a, {forward: k.at.forward, palm: k.at.palm, across: cross(k.at.palm, k.at.forward)}, w), add(p[0], mul(sub(k.at.wrist, p[0]), w))); };
/** A limb of the motion with the doll's own hand: as hers lies at the anchor while the motion's hand is near where it was there, holding what the motion's holds away from it. */
const handed = (l: Limb, sign: number): Limb => { if (!anchors) return l;
  const k = sign > 0 ? anchors.R : anchors.L, w = share(length(sub(grip(l.p), k.held))), h = holding(l, sign, w), g = grip(h), to = between(k.from, k.to, w), moved = add(g, mul(k.step, w));
  const p = clear(rested(h.map(q => add(moved, out3(into3(sub(q, g), k.from), to))), l, sign), Math.min(FINGER, lowest(l.p))).map(round);
  return {...l, w: p[0], p}; };
const receipt = {from: from.name, to: doll.name, motion: motionPath, mostLeanDeg: deg(mostLean), elbow, hands, handsAt: handsAt < 0 ? null : handsAt, restAt: restAt < 0 ? null : restAt, frames: [] as {i: number; leanDeg: number; extraDeg: number; turnDeg: number; shortMm: [number, number]; wristMovedMm: [number, number]; lowestMm: [number, number]; asAtAnchor: [number, number]}[]};
const frames = motion.frames.map((laid, i) => {
  const f = {...laid, R: handed(laid.R, 1), L: handed(laid.L, -1)};
  const trunk = axes(motion.hip, [laid.R.s, laid.L.s]), middle = mul(add(now.shoulders[0], now.shoulders[1]), 0.5);
  // Her upright trunk turned about her own hip as the old doll's trunk has turned from its upright one; then turned about
  // its own spine by `turn` and bent on toward `toward` by `extra`.
  const asOld = (p: Vec3) => sub(carry(p, restWas, hip, trunk, hip), hip);
  const posed = (extra: number, turn: number, toward: Vec3) => { const flat = unit([toward[0] - hip[0], 0, toward[2] - hip[2]]), axis = cross([0, 1, 0], flat), spine = unit(turned(asOld(middle), axis, extra));
    const at = (p: Vec3) => add(hip, turned(turned(asOld(p), axis, extra), spine, turn));
    return {s: [at(now.shoulders[0]), at(now.shoulders[1])] as [Vec3, Vec3], neck: at(now.neck)}; };
  const far = (s: [Vec3, Vec3]): [number, number] => [length(sub(f.R.w, s[0])), length(sub(f.L.w, s[1]))], beyond = (s: [Vec3, Vec3]) => Math.max(...far(s)) > doll.reach;
  let extra = 0, turn = 0, p = posed(0, 0, f.L.w);
  if (beyond(p.s)) {
    const d = far(p.s), k = d[0] > d[1] ? 0 : 1, toward = k ? f.L.w : f.R.w, lean = tilt(hip, p.s), room = Math.max(0, mostLean - lean);
    const way = length(sub(toward, posed(0, 0.05, toward).s[k])) < length(sub(toward, posed(0, -0.05, toward).s[k])) ? 1 : -1; // the way round that brings this shoulder nearer its hand
    // The least of a measure, between none and `most`, at which both hands are within reach; `most` where they never are.
    const least = (most: number, still: (x: number) => boolean) => { if (most <= 0 || still(most)) return Math.max(0, most); let lo = 0, hi = most; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (still(m)) lo = m; else hi = m; } return hi; };
    turn = least(turnPerLean * lean, t => beyond(posed(0, way * t, toward).s));
    if (beyond(posed(0, way * turn, toward).s)) { extra = least(room, e => beyond(posed(e, way * turnPerLean * (lean + e), toward).s)); turn = turnPerLean * (lean + extra); }
    turn *= way; p = posed(extra, turn, toward);
  }
  const gap: [number, number] = [far(p.s)[0] - long, far(p.s)[1] - long];
  // The head turns from the neck as the old doll's head turned from its neck.
  const oldNeck = carry(was.neck, restWas, restWas.m, trunk, trunk.m), head = add(p.neck, swung(sub(now.head, now.neck), unit(sub(was.head, was.neck)), unit(sub(f.h, oldNeck))));
  // The elbow toward the doll's own pole (where hers hangs); or toward the point a forearm of the new length in the old
  // one's direction would start from (the nearest elbow the new bones allow to it), or toward the old upper arm's side;
  // the old pole where the new one lies along the arm. `old` is the limb as laid: its forearm and upper arm.
  const poles = elbow === 'doll' ? elbowPolesAt(doll, p.s, [f.R.w, f.L.w]) : null;
  const limb = (l: Limb, old: Limb, s: Vec3, k: 0 | 1): Limb => { const upper = sub(old.e, old.s), keep = sub(sub(l.w, mul(unit(sub(old.w, old.e)), doll.forearm)), s), along = unit(sub(l.w, s));
    const pole = poles ? poles[k] : elbow === 'forearm' && length(sub(keep, mul(along, dot(keep, along)))) > 1e-6 ? keep : upper, a = arm(s, l.w, pole, doll);
    return {...l, s: round(s), e: round(a.elbow), w: l.w, p: l.p}; };
  receipt.frames.push({i, leanDeg: deg(tilt(hip, p.s)), extraDeg: deg(extra), turnDeg: deg(turn), shortMm: [mm(Math.max(0, gap[0])), mm(Math.max(0, gap[1]))],
    wristMovedMm: [mm(length(sub(f.R.w, laid.R.w))), mm(length(sub(f.L.w, laid.L.w)))], lowestMm: [mm(Math.min(...f.R.p.map(q => q[1]))), mm(Math.min(...f.L.p.map(q => q[1])))],
    asAtAnchor: anchors ? [Math.round(share(length(sub(grip(laid.R.p), anchors.R.held))) * 100) / 100, Math.round(share(length(sub(grip(laid.L.p), anchors.L.held))) * 100) / 100] : [0, 0]});
  return {...f, R: limb(f.R, laid.R, p.s[0], 0), L: limb(f.L, laid.L, p.s[1], 1), h: round(head)};
});
function round(v: Vec3): Vec3 { return v.map(x => Math.round(x * 10000) / 10000) as Vec3; }
const worst = receipt.frames.reduce((a, b) => Math.max(...b.shortMm) > Math.max(...a.shortMm) ? b : a), leanMost = receipt.frames.reduce((a, b) => b.leanDeg > a.leanDeg ? b : a);
writeFileSync(out, JSON.stringify({...motion, about: `${motion.about ?? ''} Posed on the doll ${doll.name} by dealer3d/tools/doll-pose.ts (elbows: ${elbow}; hands: ${hands}).`, doll: doll.name, hip: round(hip), frames}) + '\n');
console.log(JSON.stringify({from: from.name, to: doll.name, frames: frames.length, elbow, hands, handsAt: receipt.handsAt, mostLeanDeg: leanMost.leanDeg, atFrame: leanMost.i, extraMostDeg: Math.max(...receipt.frames.map(f => f.extraDeg)), turnMostDeg: receipt.frames.reduce((a, b) => Math.abs(b.turnDeg) > Math.abs(a) ? b.turnDeg : a, 0),
  wristMovedMostMm: [Math.max(...receipt.frames.map(f => f.wristMovedMm[0])), Math.max(...receipt.frames.map(f => f.wristMovedMm[1]))], lowestHandPointMm: [Math.min(...receipt.frames.map(f => f.lowestMm[0])), Math.min(...receipt.frames.map(f => f.lowestMm[1]))],
  framesShort: receipt.frames.filter(f => Math.max(...f.shortMm) > 0).length, worstShortMm: worst.shortMm, worstAt: worst.i, first: receipt.frames[0], last: receipt.frames[receipt.frames.length - 1]}));
writeFileSync(out.replace(/\.json$/, '.receipt.json'), JSON.stringify(receipt, null, 1) + '\n');
