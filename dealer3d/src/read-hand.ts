// Her own hand on a deal read off her film (Jakob 2026-11-23, Paow's A2.1 films through the doll: "då kommer nog rätt
// instruktioner med det rörelsemönster vi kan härma"). Pure: no I/O, no three.js; dealer3d/tools/lift.ts --hand lays it.
//
// What MediaPipe reads of a hand that holds a card is noise in its fingers (in her films a bone goes from 68 to 125 mm
// between frames) and too little of its turn (the hand turns a third of what the card turns), so the read card sits
// outside her fingers and turns in thin air. The card is well read (its four corners in every frame), and in her films
// she pinches it by its short end from the shoe until it lies. So, while she holds it, her hand is the doll's own hand
// (her bones) pinching the card's held end between thumb and forefinger, turned as the card turns (BESKED "Handleden
// vrider kortet", "Ett kort vänds av händer och fingrar", "Kortet sitter i fingrarna genom vändningen"): gripOf reads how
// her hand lies on the card in the frames before it leaves the shoe, where the reading is steady, and tips it the least
// for thumb and forefinger to go round the card, not through it; heldBy lets the card pivot in the pinch for her wrist to
// be on the film's line of sight, out of the felt. Where the pinch would put her hand in the felt, the card lies on it
// and she presses it from above with her read hand, its forefinger on the card (her films p4-04 and p4-08 slide it so).
// From the frame the card is laid toward the felt to the frame it lies, her hand eases into the read one; her right
// hand, which rests, is the read one. A read hand is made with her bones, its fingers bent as read within a finger's
// limits (hand-rule.ts LIMITS), its thumb turned out of the fingers where it is in them. A finger in the card or the felt
// is turned out of it at its root, and her free fingers keep the hand rule (hand-rule.ts humaneMotion). The card, the
// shoulders, the head and the tempo stay the film's; the left arm is laid to the wrist her hand gives (body.ts arm, the
// standard's bones, the elbow swung where her wrist would bend more than the read one: ELBOW), the right to its wrist.
import {CARD, add, cross, dot, length, mul, sub, unit, type Vec3} from './camera.ts';
import {FINGERS, type ArmPose, type Moment, type Performance} from './capture.ts';
import type {CardPose} from './deal.ts';
import {BODY, arm, turned} from './body.ts';
import {axesOf, between, local, placed, shapeBetween, thumbToward, type Axes} from './hand-pose.ts';
import {DRAWN, LIMITS, bendsOf, fingerFrom, handFaults, humaneMotion, type Bends} from './hand-rule.ts';
import type {DollHand} from './doll.ts';

/** How far apart thumb tip and forefinger tip pinch the card, centre to centre, metres: as thick as the doll draws them, the card between, half a millimetre to spare on each side. */
export const PINCH = DRAWN.thumb[2] + DRAWN.finger[2] + CARD.thickness + 0.001;
/** Where along the card's long side (from its middle toward the held end, metres) her pinch may lie: the read one, within these. */
const ALONG = [CARD.height / 2 - 0.02, CARD.height / 2 - 0.008] as const;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/**
 * How far inside LIMITS herShape keeps a joint, degrees: so far that the file's rounding of every point to a tenth of a
 * millimetre (lift.ts) does not put it past the limit. Half a degree (before 2026-11-24, the files read then) did not:
 * clip p4-04, frame 83, her right forefinger's end joint kept at -9.5° measured -10.01° once rounded.
 */
const INSIDE = 1.5;
/**
 * A read hand (`p`, in the room; `sign` +1 her right, -1 her left, as hand-rule.ts measures) made with her own hand
 * `own` (doll.ts DollHand, in its own axes): her palm and her bones' lengths, the thumb's bones pointing as read, each
 * finger bent as read within LIMITS (INSIDE degrees inside), turned and placed as the read hand is. Answers the shape
 * in the read hand's own axes (wrist at nought) and those axes.
 */
export function herShape(p: Vec3[], sign: number, own: Vec3[]): {shape: Vec3[]; axes: Axes} {
  const axes = axesOf(p, sign), q = local(p, axes), out = own.map(v => [...v] as Vec3), keep = (x: number, lo: number, hi: number) => Math.max(lo + INSIDE, Math.min(hi - INSIDE, x));
  const t = FINGERS[0]; for (let j = 1; j <= 3; j++) out[t[j]] = add(out[t[j - 1]], mul(unit(sub(q[t[j]], q[t[j - 1]])), length(sub(own[t[j]], own[t[j - 1]]))));
  const bends = bendsOf(q);
  for (let f = 1; f <= 4; f++) { const c = FINGERS[f], b = bends[f - 1], J = [LIMITS.mcp, LIMITS.pip, LIMITS.dip];
    const kept: Bends = {flex: b.flex.map((x, j) => keep(x, J[j].flex[0], J[j].flex[1])) as Bends['flex'], side: b.side.map((x, j) => keep(x, -J[j].side, J[j].side)) as Bends['side']};
    fingerFrom(out, f, kept, [1, 2, 3].map(k => length(sub(own[c[k]], own[c[k - 1]])))).forEach((v, j) => { out[c[j + 1]] = v; }); }
  return {shape: out, axes};
}

type Basis = {l: Vec3; x: Vec3; n: Vec3};
const basisOf = (c: CardPose): Basis => ({l: c.long, x: cross(c.normal, c.long), n: c.normal});
const toCard = (b: Basis, v: Vec3): Vec3 => [dot(v, b.l), dot(v, b.x), dot(v, b.n)];
const fromCard = (b: Basis, v: Vec3): Vec3 => add(add(mul(b.l, v[0]), mul(b.x, v[1])), mul(b.n, v[2]));
/** Two axes made square again: `a` kept, `b` its part square to `a`. */
const square = (a: Vec3, b: Vec3): [Vec3, Vec3] => { const u = unit(a); return [u, unit(sub(b, mul(u, dot(b, u))))]; };

/** Her grip on the card: her pinching hand (her own axes, wrist at nought), its axes and its wrist, and where its pinch lies (between thumb tip and forefinger tip), all in the card's own frame (along its long side toward the held end, across, out of its face). */
export type Grip = {shape: Vec3[]; axes: [Vec3, Vec3, Vec3]; wrist: Vec3; pinch: Vec3};
/**
 * Her grip, read in the frames `frames` (before the card leaves the shoe, where the reading is steady): her hand there
 * made with her bones (herShape), turned as the read hand lies on the card, its forefinger's tip on the card's face where
 * the read one is (along the long side within ALONG, a centimetre in from the long sides), on the face it was read on,
 * and its thumb brought round to the other face, straight across the card from the forefinger (PINCH), the hand tipped the least about the forefinger's tip
 * for thumb and forefinger to reach round the card and not through it.
 */
export function gripOf(moments: Moment[], frames: number[], sign: number, own: Vec3[]): Grip {
  const mean = (vs: Vec3[]): Vec3 => mul(vs.reduce((s, v) => add(s, v), [0, 0, 0] as Vec3), 1 / vs.length);
  const read = frames.map(i => { const m = moments[i], b = basisOf(m.card), a = axesOf(m.L.points, sign);
    return {forward: toCard(b, a.forward), palm: toCard(b, a.palm), thumb: toCard(b, sub(m.L.points[4], m.card.centre)), index: toCard(b, sub(m.L.points[8], m.card.centre))}; });
  const [forward, palm] = square(mean(read.map(r => r.forward)), mean(read.map(r => r.palm))), across = cross(palm, forward); // as hand-pose.ts axesOf
  const inCard = (v: Vec3): Vec3 => add(add(mul(forward, v[0]), mul(palm, v[1])), mul(across, v[2])), inHand = (v: Vec3): Vec3 => [dot(v, forward), dot(v, palm), dot(v, across)];
  const open = herShape(moments[frames[frames.length >> 1]].L.points, sign, own).shape, thumb = mean(read.map(r => r.thumb)), index = mean(read.map(r => r.index));
  const side = Math.sign(index[2] - thumb[2]) || 1, half = CARD.width / 2 - 0.01, face = DRAWN.finger[2] + CARD.thickness / 2 + 0.0005;
  const indexAt: Vec3 = [clamp(index[0], ALONG[0], ALONG[1]), clamp(index[1], -half, half), side * face];
  // Tipped the least about the forefinger's tip (about the card's across and long axes, TIP_TRIES) for thumb and forefinger to reach round the card, not through it.
  const card: Card = {c: [0, 0, 0], l: [1, 0, 0], n: [0, 0, 1]}, deg = Math.PI / 180;
  let best: {cost: number; grip: Grip} | null = null;
  for (const ax of TIP_TRIES) for (const al of TIP_TRIES) {
    const tip = (v: Vec3) => turned(turned(v, [0, 1, 0], ax * deg), [1, 0, 0], al * deg), [f, p, a] = [forward, palm, across].map(tip);
    const into = (v: Vec3): Vec3 => add(add(mul(f, v[0]), mul(p, v[1])), mul(a, v[2])), wrist = sub(indexAt, into(open[8]));
    const shape = thumbToward(open, [dot(sub(sub(indexAt, [0, 0, side * PINCH]), wrist), f), dot(sub(sub(indexAt, [0, 0, side * PINCH]), wrist), p), dot(sub(sub(indexAt, [0, 0, side * PINCH]), wrist), a)], 70);
    const pts = shape.map(v => add(wrist, into(v))), faults = handFaults(pts, sign, null, card).filter(x => x.kind === 'kortet');
    const cost = (roundsClear(pts, sign, card) ? 0 : 1e6) + 100 * faults.length + ax * ax + al * al;
    if (!best || cost < best.cost) best = {cost, grip: {shape, axes: [f, p, a], wrist, pinch: add(wrist, mul(add(into(shape[4]), into(shape[8])), 0.5))}}; }
  return best!.grip;
}
/** The tips tried for the grip, degrees each way about each axis. */
const TIP_TRIES = Array.from({length: 19}, (_, k) => (k - 9) * 5);
/** How far the card may pivot in her pinch (radians, each way from how it lay in the shoe), and how far from one frame to the next. */
const PIVOT = {most: 75 * Math.PI / 180, step: 25 * Math.PI / 180};
/**
 * Her hand holding the card `card` by `grip`, in the room. The card sits in her pinch as it sat in the shoe, but may
 * pivot there, about the line from thumb to forefinger (a pinch holds a card at a point): by the angle that brings her
 * wrist nearest to where the film shows it, on the line from the camera `eye` through the read wrist `seen`, within
 * PIVOT of the frame before (`was`, radians), where thumb and forefinger (`sign` as hand-rule.ts) go round the card, not
 * through it, and the hand is the least in the felt (FELT). Answers the points and the angle.
 */
export function heldBy(grip: Grip, card: CardPose, eye: Vec3, seen: Vec3, was: number, sign: number): {points: Vec3[]; pivot: number} {
  const b = basisOf(card), [f, p, a] = grip.axes, ray = unit(sub(seen, eye)), inCard = grip.shape.map(v => add(grip.wrist, add(add(mul(f, v[0]), mul(p, v[1])), mul(a, v[2]))));
  const at = (phi: number, v: Vec3): Vec3 => { const d = sub(v, grip.pinch), c = Math.cos(phi), s = Math.sin(phi); return add(card.centre, fromCard(b, add(grip.pinch, [d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]]))); };
  const room: Card = {c: card.centre, l: card.long, n: card.normal}, through = (phi: number) => !roundsClear(inCard.map(v => at(phi, v)), sign, room);
  const off = (phi: number) => { const pts = inCard.map(v => at(phi, v)), w = unit(sub(pts[0], eye)); return Math.atan2(length(cross(w, ray)), dot(w, ray)) + (through(phi) ? 10 : 0) + FELT * inFelt(pts); };
  let best = was, cost = off(was);
  const look = (phi: number) => { const q = Math.max(-PIVOT.most, Math.min(PIVOT.most, Math.max(was - PIVOT.step, Math.min(was + PIVOT.step, phi)))), c = off(q); if (c < cost) { best = q; cost = c; } };
  for (let k = -25; k <= 25; k++) look(was + k * PIVOT.step / 25);
  const coarse = best; for (let k = -20; k <= 20; k++) look(coarse + k * PIVOT.step / 500);
  return {points: inCard.map(v => at(best, v)), pivot: best};
}

/**
 * Whether thumb and forefinger of the hand `p` go round the card `card` and not into it (hand-rule.ts handFaults), with
 * CLEAR to spare: also with the card moved that far each way along each of its axes, so that a file's rounding keeps it.
 */
function roundsClear(p: Vec3[], sign: number, card: Card): boolean {
  const x = cross(card.n, card.l), moves: Vec3[] = [[0, 0, 0], ...[card.l, x, card.n].flatMap(u => [mul(u, CLEAR), mul(u, -CLEAR)])];
  return moves.every(d => !handFaults(p, sign, null, {...card, c: add(card.c, d)}).some(f => f.kind === 'kortet' && f.fingers.some(k => k <= 1)));
}
/** How deep the hand `p` is in the felt at most, metres (its joints as thick as the doll draws a finger's root, hand-rule.ts DRAWN, two millimetres let as the hand rule lets them). */
export const inFelt = (p: Vec3[]) => Math.max(0, ...p.map(v => DRAWN.thumb[0] - 0.002 - v[1]));
/** What a pivot costs per metre her hand is in the felt (heldBy; a radian of the wrist off the film's line of sight is one). */
const FELT = 100;
/** What a hold keeps to spare from the card, metres. */
const CLEAR = 0.0003;
/** The faults of finger `f` that are the card's or the felt's (hand-rule.ts handFaults). */
const intrudes = (p: Vec3[], sign: number, card: Card, f: number) => handFaults(p, sign, null, card).some(x => (x.kind === 'kortet' || x.kind === 'filten') && x.fingers.includes(f));
type Card = {c: Vec3; l: Vec3; n: Vec3};
/**
 * Each finger of `p` that is in the card or the felt turned out of them at its root (the thumb at its base, a finger at
 * its knuckle) the least way, both ways tried, a degree at a time up to MOST_OUT, not into another finger (hand-rule.ts
 * APART); a finger it cannot free stays.
 */
const MOST_OUT = 60;
export function outOfCard(p: Vec3[], sign: number, card: Card): Vec3[] {
  let out = p;
  const inFinger = (q: Vec3[], f: number) => handFaults(q, sign, null, null).some(x => x.kind === 'i varandra' && x.fingers.includes(f));
  for (let f = 0; f <= 4; f++) { if (!intrudes(out, sign, card, f)) continue; const c = FINGERS[f], root = c[0], moving = c.slice(1), wasIn = inFinger(out, f);
    const dir = unit(sub(out[c[3]], out[root])), axis = unit(cross(dir, card.n)); if (!Number.isFinite(axis[0])) continue;
    let done: Vec3[] | null = null;
    for (let deg = 1; deg <= MOST_OUT && !done; deg++) for (const s of [1, -1]) { const turnedBy = out.map((v, k) => moving.includes(k) ? add(out[root], turned(sub(v, out[root]), axis, s * deg * Math.PI / 180)) : v);
      if (!intrudes(turnedBy, sign, card, f) && (wasIn || !inFinger(turnedBy, f))) { done = turnedBy; break; } }
    if (done) out = done; }
  return out;
}

/**
 * How her elbow may swing about the line from shoulder to wrist to spare her wrist (degrees): her wrist may bend as far as
 * the read one or `free` without it, the swing costs `away` per square degree from where the film has the elbow and
 * `step` per square degree from the frame before, and goes no farther than `most`.
 */
const ELBOW = {free: 30, away: 0.05, step: 1, most: 80};
/** What herHands did, to print: the frames it held the card in and let it go over, the first and last frame it pressed the card on the felt (null: none), where the pinch lies on the card (metres), how far the card pivoted in it at most (radians), how far the wrist went from the read wrist (metres, most and in the middle), and how many times its length the arm is stretched at most to reach it. */
export type HerHandsReceipt = {held: [number, number]; lets: [number, number]; pressed: [number, number] | null; pinch: Vec3; pivot: number; wristMoved: {most: number; middle: number}; stretch: number};
/**
 * The read deal `p` with her own hands `hand` (doll.ts DollHand), the film seen from `eye` (the camera's place): the
 * left pinches the card from the first frame until the card is laid toward the felt (p.folds), pivoting in her pinch
 * for her wrist to be where the film shows it (heldBy), and eases into the read hand until the card lies (p.rests); the right is the read one with her
 * bones. See the head of this file.
 */
export function herHands(p: Performance, hand: DollHand, eye: Vec3): {performance: Performance; receipt: HerHandsReceipt} {
  const signL = p.palm, signR = -p.palm, n = p.moments.length;
  const grip = gripOf(p.moments, Array.from({length: Math.max(1, p.leavesShoe)}, (_, i) => i), signL, hand.left);
  const readL = (i: number): Laid => { const m = p.moments[i], h = herShape(m.L.points, signL, hand.left); return {shape: apart(h.shape, h.axes, m.L.points[0], signL), axes: h.axes, wrist: m.L.points[0]}; };
  const cardOf = (m: Moment): Card => ({c: m.card.centre, l: m.card.long, n: m.card.normal});
  let pivot = 0; const pivots: number[] = [];
  const helds = p.moments.map((m, i) => { const h = heldBy(grip, m.card, eye, m.L.points[0], pivot, signL); if (i <= p.folds) { pivot = h.pivot; pivots.push(pivot); } return h.points; });
  // Where her pinch would be in the felt, the card lies on it and she presses it from above (pressed), eased in and out over PRESS_EASE frames; it is let go as pressed.
  const inFeltAt = helds.map((h, i) => i >= p.leavesShoe && i <= p.folds && inFelt(h) > 0), pressFrames = inFeltAt.flatMap((x, i) => x ? [i] : []);
  const pressW = (i: number) => { const k = Math.min(i, p.folds), near = Math.min(Infinity, ...pressFrames.map(j => Math.abs(k - j))); return near === 0 ? 1 : smooth(1 - near / PRESS_EASE); };
  const pressed = (i: number): Laid => { const m = p.moments[i], r = readL(i), b = basisOf(m.card), half = CARD.width / 2 - 0.01, tip = toCard(b, sub(placed(r.shape, r.axes, r.wrist)[8], m.card.centre));
    const to: Vec3 = [clamp(tip[0], ALONG[0], ALONG[1]), clamp(tip[1], -half, half), (Math.sign(m.card.normal[1]) || 1) * (DRAWN.finger[2] + CARD.thickness / 2 + 0.0005)];
    return {...r, wrist: add(r.wrist, fromCard(b, sub(to, tip)))}; };
  const asLaid = (pts: Vec3[]): Laid => { const a = axesOf(pts, signL); return {shape: local(pts, a), axes: a, wrist: pts[0]}; };
  const lefts = p.moments.map((m, i) => {
    const held = helds[i], pw = pressW(i), w = smooth((i - p.folds) / Math.max(1, p.rests - p.folds));
    if (w <= 0 && pw <= 0) return held;
    const hold = pw <= 0 ? asLaid(held) : pw >= 1 ? pressed(i) : mix(asLaid(held), pressed(i), pw);
    const h = w <= 0 ? hold : w >= 1 ? readL(Math.min(i, p.rests)) : mix(hold, readL(Math.min(i, p.rests)), w);
    return placed(apart(h.shape, h.axes, h.wrist, signL), h.axes, h.wrist);
  }).map((pts, i) => outOfCard(pts, signL, cardOf(p.moments[i]))).map(pts => { const d = inFelt(pts); return d > 0 ? pts.map(v => [v[0], v[1] + d, v[2]] as Vec3) : pts; });
  // Her right hand as read with her bones.
  const rights = p.moments.map(m => { const h = herShape(m.R.points, signR, hand.right), shape = apart(h.shape, h.axes, m.R.points[0], signR);
    const pts = placed(shape, h.axes, m.R.points[0]);
    const low = Math.min(...pts.map((v, k) => v[1] - (k ? 0.0064 : 0))); return low < -0.002 ? pts.map(v => [v[0], v[1] - low - 0.002, v[2]] as Vec3) : pts; });
  // Her free fingers keep the hand rule.
  const humane = humaneMotion({frames: p.moments.map((m, i) => ({card: cardOf(m), L: {w: lefts[i][0], p: lefts[i]}, R: {w: rights[i][0], p: rights[i]}}))});
  // Her left arm to the wrist her hand gives, its bones stretched together only where the wrist is out of reach (as capture.ts lays a read arm),
  // the elbow swung about the line from shoulder to wrist where her wrist would bend more than the read one (ELBOW).
  let most = 1, swung = 0;
  const bent = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180 / Math.PI;
  const moments = p.moments.map((m, i): Moment => { const f = humane.frames[i], L = f.L.p, stretch = Math.max(1, length(sub(L[0], m.L.shoulder)) / ((BODY.upperArm + BODY.forearm) * 0.985));
    const bones = {upperArm: BODY.upperArm * stretch, forearm: BODY.forearm * stretch}, line = unit(sub(L[0], m.L.shoulder)), pole = sub(m.L.elbow, m.L.shoulder), hand = sub(L[9], L[0]);
    const free = Math.max(ELBOW.free, bent(sub(m.L.wrist, m.L.elbow), sub(m.L.points[9], m.L.points[0])));
    const tried = (by: number) => { const laid = arm(m.L.shoulder, L[0], turned(pole, line, by * Math.PI / 180), bones);
      return {by, laid, cost: Math.max(0, bent(sub(laid.wrist, laid.elbow), hand) - free) ** 2 + ELBOW.away * by * by + ELBOW.step * (by - swung) ** 2}; };
    let best = tried(swung); for (let by = -ELBOW.most; by <= ELBOW.most; by += 1) { const t = tried(by); if (t.cost < best.cost) best = t; }
    swung = best.by; const laid = best.laid; most = Math.max(most, stretch);
    const left: ArmPose = {shoulder: m.L.shoulder, elbow: laid.elbow, wrist: L[0], stretch, points: L};
    // Her right arm laid again to its wrist where her hand was lifted out of the felt, its bones as long as before.
    const R = f.R.p, rStretch = m.R.stretch ?? 1, rLaid = length(sub(R[0], m.R.wrist)) > 1e-9 ? arm(m.R.shoulder, R[0], sub(m.R.elbow, m.R.shoulder), {upperArm: BODY.upperArm * rStretch, forearm: BODY.forearm * rStretch}) : null;
    return {...m, L: left, R: {...m.R, points: R, wrist: R[0], elbow: rLaid?.elbow ?? m.R.elbow}}; });
  const moved = moments.map((m, i) => length(sub(m.L.wrist, p.moments[i].L.wrist))).sort((a, b) => a - b);
  return {performance: {...p, moments}, receipt: {held: [0, p.folds], lets: [p.folds, p.rests], pressed: pressFrames.length ? [pressFrames[0], pressFrames[pressFrames.length - 1]] : null, pinch: grip.pinch, pivot: Math.max(0, ...pivots.map(Math.abs)), wristMoved: {most: moved[n - 1], middle: moved[n >> 1]}, stretch: most}};
}
/** Over how many frames her hand goes from pinching the card to pressing it on the felt and back (herHands). */
const PRESS_EASE = 4;
/** A hand laid out: its shape in its own axes (wrist at nought), those axes and its wrist, in the room. */
type Laid = {shape: Vec3[]; axes: Axes; wrist: Vec3};
const pointsOf = (h: Laid) => placed(h.shape, h.axes, h.wrist);
/** The hand `w` (0 to 1) of the way from `x` to `y`: shape, axes and wrist each eased. */
const mix = (x: Laid, y: Laid, w: number): Laid => ({shape: shapeBetween(x.shape, y.shape, w), axes: between(x.axes, y.axes, w), wrist: add(mul(x.wrist, 1 - w), mul(y.wrist, w))});
/**
 * The shape `shape` (in `axes`, wrist at `wrist`; `sign` as hand-rule.ts) with its thumb, where it is in a finger as
 * drawn (hand-rule.ts APART), turned at its base toward or away from the forefinger and the middle finger, a degree at
 * a time up to APART_MOST, the least that frees it with CLEAR to spare (also with the thumb that much nearer the fingers), so that a file's rounding keeps it; a thumb it cannot free stays.
 */
const APART_MOST = 60;
function apart(shape: Vec3[], axes: Axes, wrist: Vec3, sign: number): Vec3[] {
  const t = FINGERS[0], root = shape[t[0]], fingers = mul(add(add(shape[6], shape[7]), add(shape[10], shape[11])), 0.25), axis = unit(cross(sub(shape[t[3]], root), sub(fingers, root)));
  const faulty = (q: Vec3[]) => handFaults(placed(q, axes, wrist), sign, null, null).some(x => x.kind === 'i varandra' && x.fingers.includes(0));
  const inFinger = (q: Vec3[]) => { const d = mul(unit(sub(fingers, q[t[2]])), CLEAR); return faulty(q) || faulty(q.map((v, k) => t.slice(1).includes(k) ? add(v, d) : v)); };
  if (!inFinger(shape)) return shape;
  if (!Number.isFinite(axis[0])) return shape;
  const turnedBy = (deg: number) => shape.map((v, k) => t.slice(1).includes(k) ? add(root, turned(sub(v, root), axis, deg * Math.PI / 180)) : v);
  for (let deg = 1; deg <= APART_MOST; deg++) for (const way of [-1, 1]) if (!inFinger(turnedBy(way * deg))) return turnedBy(way * deg);
  return shape;
}
