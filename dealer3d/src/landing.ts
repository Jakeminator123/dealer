// Her right hand's end pose at the laid card, "landningen" (Jakob 2026-11-23: "det är alltid hennes mellanfinger som pekar
// ned kortet, vilket blir ounikt för alla positioner … några förval … eller rentav semi-modellera sina egna landningar").
// A landing is one of LANDINGS (which finger meets the card and how the hand lies) and, as his own, a little shaping on top
// of it (Shaping: how far onto the card, the hand rolled about the forearm, the wrist bent, the fingers spread, the free
// fingers curled). It is laid on a deal that is done ("Naturlig", after dealer3d/src/natural.ts; page/natural-lab.ts lays
// it), on her right hand only: the fingers set at their joints, the hand turned about the wrist and moved as a whole so
// that the finger(s) of the landing meet the card, the elbow solved again with her bones as it bent before. The landing
// comes in while the card goes into the felt and settles (from two frames before beat g to the frame it lies), stays
// through the hold, and goes out over the lift (with the return) or stays to the last frame (the deal alone). The card,
// her left hand, the head and every frame outside those are as they are.
// "lang", the default, is the hand as it lay before landings were made (the long finger down on the card): nothing is
// changed, to the last digit, so a standard saved without a landing and every film made stay as they were.
// Pure: no I/O and no three.js.
import {CARD, add, cross, dot, length, mul, sub, unit, type Vec3} from './camera.ts';
import {arm, turned} from './body.ts';
import {FINGERS} from './capture.ts';
import {axesOf, between, local, placed, shapeBetween, thumbToward, type Axes} from './hand-pose.ts';
import {NATURAL, touching, type NaturalFrame} from './natural.ts';
import type {Doll} from './doll.ts';

export type LandingId = 'lang' | 'pek' | 'pek-lang' | 'toppar' | 'platt';
/**
 * The landings, for the lab's choice and for a film order's text (tools/doll-order.ts): id, the Swedish label, and one
 * plain English sentence that says what her hand does at the laid card.
 */
export const LANDINGS: readonly {id: LandingId; label: string; sentence: string}[] = [
  {id: 'lang', label: 'Långfingret på kortet', sentence: 'She presses the card down with the tip of her middle finger.'},
  {id: 'pek', label: 'Pekfingret på kortet', sentence: 'She presses the card down with the tip of her index finger.'},
  {id: 'pek-lang', label: 'Pek- och långfingret', sentence: 'She rests the tips of her index and middle fingers side by side on the card.'},
  {id: 'toppar', label: 'Alla fingertoppar', sentence: 'She rests the tips of all four fingers on the card, her hand arched over it.'},
  {id: 'platt', label: 'Platta fingrar', sentence: 'She lays her fingers flat across the card.'},
];
export const LANDING_DEFAULT: LandingId = 'lang';
/**
 * His own shaping on top of a landing, nought each for the landing as it is: `reach` centimetres further onto the card
 * (along the hand, away from her; below nought back toward her), `roll` degrees about the forearm (above nought the thumb
 * side up), `bend` degrees at the wrist (above nought the fingers down toward the palm), `spread` degrees the fingers fan
 * out from each other, `curl` degrees the free fingers (those not on the card) curl further.
 */
export type Shaping = {reach: number; roll: number; bend: number; spread: number; curl: number};
export const NO_SHAPING: Shaping = {reach: 0, roll: 0, bend: 0, spread: 0, curl: 0};
/** The lab's controls for the shaping, with their Swedish labels, ranges and units. */
export const SHAPING_KNOBS: readonly {key: keyof Shaping; label: string; min: number; max: number; step: number; unit: string; plus: string; minus: string}[] = [
  {key: 'reach', label: 'Hur långt in på kortet', min: -3, max: 3, step: 0.5, unit: 'cm', plus: 'längre in', minus: 'närmare henne'},
  {key: 'roll', label: 'Handen rullad', min: -30, max: 30, step: 1, unit: '°', plus: 'tummen upp', minus: 'lillfingret upp'},
  {key: 'bend', label: 'Handledens böjning', min: -30, max: 30, step: 1, unit: '°', plus: 'nedåt', minus: 'uppåt'},
  {key: 'spread', label: 'Fingrarna spretar', min: -6, max: 15, step: 1, unit: '°', plus: 'isär', minus: 'ihop'},
  {key: 'curl', label: 'Fria fingrar böjda', min: -30, max: 40, step: 1, unit: '°', plus: 'mer', minus: 'rakare'},
];
/** A landing as a standard saves it (`lab.landing`): a landing's id and, where he shaped it, his shaping. */
export type Landing = {id: LandingId} & Partial<Shaping>;

/** The landing a stored value names; anything else (no field, as every standard saved before landings) is the default, the hand as before. Values outside a control's range are brought within it. */
export function landingOf(value: unknown): Landing {
  const v = value as Partial<Record<string, unknown>> | null, id = typeof v?.id === 'string' && LANDINGS.some(l => l.id === v.id) ? v.id as LandingId : LANDING_DEFAULT, out: Landing = {id};
  for (const k of SHAPING_KNOBS) { const x = v?.[k.key]; if (typeof x === 'number' && Number.isFinite(x) && x !== 0) out[k.key] = Math.max(k.min, Math.min(k.max, x)); }
  return out;
}
/** The shaping of a landing, nought where he did not shape. */
export const shapingOf = (l: Landing): Shaping => ({reach: l.reach ?? 0, roll: l.roll ?? 0, bend: l.bend ?? 0, spread: l.spread ?? 0, curl: l.curl ?? 0});
/** Whether he shaped the landing himself. */
export const shaped = (l: Landing): boolean => SHAPING_KNOBS.some(k => (l[k.key] ?? 0) !== 0);
/** Whether a landing is the hand as before: the default, not shaped. Nothing is laid then. */
export const asBefore = (l: Landing): boolean => l.id === LANDING_DEFAULT && !shaped(l);
/** The Swedish label of a landing, and "egen" with what he shaped. */
export function landingWords(l: Landing): string {
  const base = LANDINGS.find(x => x.id === l.id)!.label, parts = SHAPING_KNOBS.filter(k => (l[k.key] ?? 0) !== 0).map(k => { const x = l[k.key]!; return `${k.label.toLowerCase()} ${String(Math.abs(x)).replace('.', ',')} ${k.unit} ${x > 0 ? k.plus : k.minus}`; });
  return parts.length ? `${base}, egen: ${parts.join(', ')}` : base;
}

// ---- how each landing lays the hand -----------------------------------------------------------------------------------
/**
 * `touch`: the fingers that meet the card (0 thumb … 4 little finger). `bends`: each finger's three joints from the knuckle
 * out (index … little), degrees toward the palm; null keeps the finger as she has it. `flat`: the hand turned palm down
 * with the knuckles level and the fingers lying along the card (the whole finger meets it), side by side as FLAT_FAN fans
 * them (degrees across, index … little). (A sixth, thumb and forefinger letting go at the card's edge, was tried and left
 * out: at the film's size it read as the forefinger alone, the thumb hidden under the hand.)
 */
type Lay = {touch: number[]; bends: ([number, number, number] | null)[]; flat?: boolean; middle?: boolean};
const LAYS: Record<LandingId, Lay> = {
  lang: {touch: [2], bends: [null, null, null, null]},
  pek: {touch: [1], bends: [[42, 12, 6], [62, 88, 48], [64, 92, 48], [58, 88, 46]]},
  'pek-lang': {touch: [1, 2], bends: [[40, 12, 6], [38, 12, 6], [64, 92, 48], [58, 88, 46]]},
  toppar: {touch: [1, 2, 3, 4], bends: [[40, 38, 16], [40, 38, 16], [40, 38, 16], [40, 38, 16]], middle: true},
  platt: {touch: [1, 2, 3, 4], bends: [[8, 8, 4], [6, 6, 3], [8, 8, 4], [10, 10, 5]], flat: true},
};
const FLAT_FAN = [-2, -0.7, 0.7, 2];
const LAND = {
  /** Metres: the touching tips at least this far in from the card's edge; the free tips at least `clear` above the touching ones; the wrist ball at least `wrist` over the felt (on top of the doll's ball); a joint that does not touch at least `lift` over the card (on top of its ball). */
  margin: 0.012, clear: 0.004, wrist: 0.003, lift: 0.0015,
  /** Degrees: how far the free fingers may be curled further to clear the card; how far the hand may be bent further down at the wrist to keep the wrist over the felt. */
  moreCurl: 40, morePitch: 30,
  /** Frames: the landing comes in from this many before beat g. Share of the time from the lift's end to ready over which it goes out with the return. */
  before: 2, outShare: 1 / 3,
};
const TIP = NATURAL.tip, TIPS = FINGERS.map(c => c[3]), KNUCKLES = [5, 9, 13, 17];
/** The radius each point of the hand is drawn with (dealer3d/src/stage.ts): the wrist, the knuckles, the other joints and tips. */
const BALL = (k: number) => k === 0 ? 0.0125 : k === 1 || KNUCKLES.includes(k) ? 0.0105 : k === 2 ? 0.0088 : 0.0082;
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => Math.round(r * 1800 / Math.PI) / 10, mm = (m: number) => Math.round(m * 10000) / 10;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const round = (v: Vec3): Vec3 => v.map(x => Math.round(x * 10000) / 10000) as Vec3;
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));

/** The bend of a joint (radians, toward the palm) in a shape's own plane of forward and palm: from bone a→b to bone b→c. */
const flexAt = (S: Vec3[], a: number, b: number, c: number) => { const u = [S[b][0] - S[a][0], S[b][1] - S[a][1]], v = [S[c][0] - S[b][0], S[c][1] - S[b][1]]; return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]); };
/** Points `which` of a shape turned about `pivot` in the plane of forward and palm (toward the palm above nought), or of forward and across (`spread`). */
const turnIn = (S: Vec3[], which: number[], pivot: number, by: number, spread = false) => { const o = S[pivot], c = Math.cos(by), s = Math.sin(by);
  for (const k of which) { const d = sub(S[k], o); S[k] = spread ? [o[0] + d[0] * c - d[2] * s, S[k][1], o[2] + d[0] * s + d[2] * c] : [o[0] + d[0] * c - d[1] * s, o[1] + d[0] * s + d[1] * c, S[k][2]]; } };
/** A shape (hand-pose.ts `local`) with finger f's joints set to `bends` degrees, the outer ones following. */
function bendFinger(S: Vec3[], f: number, bends: [number, number, number]) {
  const chain = [0, ...FINGERS[f]]; for (let j = 0; j < 3; j++) turnIn(S, chain.slice(j + 2), chain[j + 1], rad(bends[j]) - flexAt(S, chain[j], chain[j + 1], chain[j + 2]));
}
/** The hand `p` turned about `axis` through its wrist `w`. */
const turnHand = (p: Vec3[], w: Vec3, axis: Vec3, by: number) => by ? p.map(q => add(w, turned(sub(q, w), axis, by))) : p;
/** The axis the hand bends about at the wrist, toward its palm. */
const flexAxis = (p: Vec3[]) => { const a = axesOf(p, 1); return unit(cross(a.forward, a.palm)); };

type Limb = NaturalFrame['R'];
type Card = NaturalFrame['card'];
/** What a landing does to the hand, worked out once at the frame of the end pose and done the same to every frame it is in. */
type Recipe = {bends: ([number, number, number] | null)[]; spread: number; fan: number[] | null; level: number; pitch: number; roll: number; bend: number; thumb: Vec3 | null;
  /** Turns of the thumb at its joints (FINGERS[0][pivot]), about an axis in the hand's own axes, to lift it clear of the card. */
  thumbTurns: {pivot: number; axis: Vec3; by: number}[]; step: Vec3};

/** The hand of `R` laid as the recipe says, before it is moved (the wrist where it is). */
function shapedHand(R: Limb, r: Recipe): Vec3[] {
  const a0 = axesOf(R.p, 1), S = local(R.p, a0);
  r.bends.forEach((b, n) => { if (b) bendFinger(S, n + 1, b); });
  r.fan?.forEach((by, n) => { if (by) turnIn(S, FINGERS[n + 1], FINGERS[n + 1][0], rad(by), true); });
  if (r.spread) [-1.5, -0.5, 0.5, 1.5].forEach((k, n) => turnIn(S, FINGERS[n + 1], FINGERS[n + 1][0], rad(r.spread * k), true));
  let p = placed(S, a0, R.w); const forearm = unit(sub(R.w, R.e));
  p = turnHand(p, R.w, forearm, rad(r.level + r.roll));
  p = turnHand(p, R.w, flexAxis(p), rad(r.pitch + r.bend));
  if (r.thumb) { const a = axesOf(p, 1); p = placed(thumbToward(local(p, a), r.thumb, 70), a, R.w); }
  if (r.thumbTurns.length) { const a = axesOf(p, 1), c = FINGERS[0];
    for (const t of r.thumbTurns) { const o = p[c[t.pivot]], axis = placed([t.axis], a, [0, 0, 0])[0]; for (const k of c.slice(t.pivot + 1)) p[k] = add(o, turned(sub(p[k], o), axis, t.by)); } }
  return p;
}
/** A point of the card in its own measures: along its long side and across it (metres from its middle). */
const onCard = (card: Card, q: Vec3) => { const d = sub(q, card.c); return [dot(d, card.l), dot(d, cross(card.n, card.l))]; };
const fromCard = (card: Card, u: number, v: number, y: number): Vec3 => { const q = add(add(card.c, mul(card.l, u)), mul(cross(card.n, card.l), v)); return [q[0], y, q[2]]; };

/**
 * The recipe of a landing for the hand of frame `f`, whose card lies still on the felt; `long`: the most her arm reaches;
 * `hold`: the frames the landing is whole in (from `f` on), each of which her arm must reach (her body can move on in them).
 */
function recipeAt(f: NaturalFrame, lay: Lay, shaping: Shaping, doll: Doll, long: number, hold: NaturalFrame[]): {recipe: Recipe; shortMm: number; liftedMm: number} {
  const R = f.R, card = f.card, top = card.c[1] + CARD.thickness / 2, H = CARD.height / 2, W = CARD.width / 2, free = [1, 2, 3, 4].filter(k => !lay.touch.includes(k));
  const wristLow = doll.shape.wristBall + LAND.wrist, onTheCard = lay.touch.filter(k => k > 0);
  /** Finger k's three joints as she has them in this frame (degrees toward the palm). */
  const hers = (k: number) => { const S = local(R.p, axesOf(R.p, 1)), c = [0, ...FINGERS[k]]; return [0, 1, 2].map(j => deg(flexAt(S, c[j], c[j + 1], c[j + 2]))) as [number, number, number]; };
  const r: Recipe = {bends: lay.bends.map((b, n) => b && free.includes(n + 1) && shaping.curl ? [b[0] + shaping.curl * 0.4, b[1] + shaping.curl, b[2] + shaping.curl * 0.6] : b) as Recipe['bends'],
    spread: shaping.spread, fan: null, level: 0, pitch: 0, roll: shaping.roll, bend: shaping.bend, thumb: null, thumbTurns: [], step: [0, 0, 0]};
  // (with his curl on a finger the landing keeps as she has it: that much more than she has it)
  if (shaping.curl) free.forEach(k => { if (!r.bends[k - 1]) { const b = hers(k); r.bends[k - 1] = [0, 1, 2].map(j => b[j] + shaping.curl * [0.4, 1, 0.6][j]) as [number, number, number]; } });
  const lowestKnuckle = (p: Vec3[]) => Math.min(...KNUCKLES.map(k => p[k][1]));
  if (lay.flat) {
    // Palm down with the knuckles level (turned about the forearm), then bent at the wrist so that the palm falls from the
    // wrist ball over the felt to a knuckle resting on the card: the fingers then lie along the card from their knuckles.
    const forearm = unit(sub(R.w, R.e)), try1 = (by: number) => { const p = turnHand(shapedHand(R, {...r, roll: 0, bend: 0, level: 0, pitch: 0, thumb: null}), R.w, forearm, rad(by)), a = axesOf(p, 1); return {level: Math.abs(sub(p[17], p[5])[1]) / length(sub(p[17], p[5])), down: a.palm[1] < 0}; };
    let best = 0, cost = Infinity; for (let by = -90; by <= 90; by += 1) { const t = try1(by); if (t.down && t.level < cost) { cost = t.level; best = by; } } r.level = best;
    flatPitch();
  }
  function flatPitch() {
    const drop = wristLow - (top + BALL(9) + LAND.lift), dropOf = (by: number) => { const p = shapedHand(R, {...r, roll: 0, bend: 0, pitch: by}); return p[0][1] - lowestKnuckle(p); };
    let pb = 0, pc = Infinity; for (let by = -80; by <= 80; by += 1) { const c = Math.abs(dropOf(by) - drop); if (c < pc) { pc = c; pb = by; } } r.pitch = pb;
  }
  /** Finger k's first joint set so that its tip is as high as `goal` says for the hand (its other joints as the recipe has them). */
  const reachDown = (k: number, goal: (p: Vec3[]) => number) => {
    const base = r.bends[k - 1] ?? hers(k), miss = (b0: number) => { const t = {...r, bends: r.bends.map((b, n) => n === k - 1 ? [b0, base[1], base[2]] : b) as Recipe['bends']}, p = shapedHand(R, t); return Math.abs(p[TIPS[k]][1] - goal(p)); };
    let best = base[0], cost = Infinity; for (let b0 = -25; b0 <= 90; b0 += 2) { const c = miss(b0); if (c < cost) { cost = c; best = b0; } }
    for (let b0 = best - 2; b0 <= best + 2; b0 += 0.25) { const c = miss(b0); if (c < cost) { cost = c; best = b0; } }
    r.bends[k - 1] = [best, base[1], base[2]];
  };
  /** The flat hand's fingers turned across at their knuckles to lie side by side (her own fingers, as caught, close toward the palm's middle). */
  const fanned = () => { const S = local(R.p, axesOf(R.p, 1)); r.bends.forEach((b, n) => { if (b) bendFinger(S, n + 1, b); });
    r.fan = [1, 2, 3, 4].map((k, n) => { const c = FINGERS[k], d = sub(S[c[3]], S[c[0]]); return FLAT_FAN[n] - Math.atan2(d[2], d[0]) * 180 / Math.PI; }); };
  /** Every finger of the landing down to the card: the flat hand's from their knuckles, else as low as the lowest of them. */
  const fingersDown = () => {
    if (lay.flat) { fanned(); for (const k of onTheCard) reachDown(k, p => lowestKnuckle(p) - (BALL(9) + LAND.lift - TIP)); return; }
    if (onTheCard.length < 2) return;
    const p = shapedHand(R, r), anchor = onTheCard.reduce((a, k) => p[TIPS[k]][1] < p[TIPS[a]][1] ? k : a);
    for (const k of onTheCard) if (k !== anchor) reachDown(k, q => q[TIPS[anchor]][1]);
  };
  const fwd = (p: Vec3[]) => { const a = axesOf(p, 1); return unit([a.forward[0], 0, a.forward[2]]); };
  /** The step that brings the landing's fingers to the card, for the hand `p`. */
  const stepFor = (p: Vec3[]): Vec3 => {
    const tips = lay.touch.map(k => p[TIPS[k]]), low = Math.min(...tips.map(q => q[1])), at = mul(tips.reduce((s, q) => add(s, q), [0, 0, 0] as Vec3), 1 / tips.length), ahead = mul(fwd(p), shaping.reach / 100);
    let [u, v] = onCard(card, add(lay.middle ? fromCard(card, 0, 0, at[1]) : at, ahead));
    u = Math.max(-H + LAND.margin, Math.min(H - LAND.margin, u)); v = Math.max(-W + LAND.margin, Math.min(W - LAND.margin, v));
    const goal = fromCard(card, u, v, 0); return [goal[0] - at[0], top + TIP - low, goal[2] - at[2]]; };
  // The fingers set, the hand turned and its fingers of the landing down to the card; then the free fingers curled further
  // where their outer joints would be as low as the card's fingers, and the hand bent further down at the wrist (so that it
  // stands higher on those fingers) where the wrist would go into the felt or a knuckle into the card.
  const clear = (p: Vec3[], k: number, step: Vec3) => p[k][1] + step[1] - top - BALL(k);
  let curled = 0, pitched = 0, rolled = 0;
  for (let n = 0; n < 30; n++) {
    fingersDown();
    const p = shapedHand(R, r), step = stepFor(p), lowTouch = Math.min(...lay.touch.map(k => p[TIPS[k]][1] + step[1]));
    const under = free.filter(k => FINGERS[k].slice(2).some(j => p[j][1] + step[1] < lowTouch + LAND.clear));
    if (under.length && curled < LAND.moreCurl) { for (const k of under) { const b = r.bends[k - 1] ?? hers(k); r.bends[k - 1] = [b[0] + 4, b[1] + 6, b[2] + 4]; } curled += 6; continue; }
    // (the flat hand: rolled a little thumb side up where the thumb's root would go into the card, as a hand flat on a table lies)
    if (lay.flat && clear(p, 1, step) < LAND.lift && rolled < LAND.morePitch) { r.level += 2; rolled += 2; flatPitch(); continue; }
    const low = !lay.flat && (R.w[1] + step[1] < wristLow || [...KNUCKLES, ...free.map(k => FINGERS[k][1])].some(k => clear(p, k, step) < LAND.lift));
    if (low && pitched < LAND.morePitch) { r.pitch += 3; pitched += 3; continue; }
    break;
  }
  // The thumb: on the flat hand, lying beside the forefinger at the card; else as she has it, no joint of it lower than the card.
  if (lay.flat) { const p = shapedHand(R, r), step = stepFor(p), a = axesOf(p, 1), side = unit([a.across[0], 0, a.across[2]]), ahead = unit([a.forward[0], 0, a.forward[2]]);
    const at = add(add(p[6], mul(side, -0.022)), mul(ahead, -0.012)); r.thumb = local(p.map((q, k) => k === 4 ? [at[0], top + TIP + LAND.lift - step[1], at[2]] as Vec3 : q), a)[4]; }
  // Then each joint of the thumb from its root out lifted, the thumb beyond it with it, as little as keeps it clear of the card
  // (on the flat hand: to just over the card, up or down, so that the thumb lies along it as the fingers do).
  { const p = shapedHand(R, r), a = axesOf(p, 1), step = stepFor(p), c = FINGERS[0];
    for (let j = 1; j <= 3; j++) {
      const o = p[c[j - 1]], d = sub(p[c[j]], o), need = top + BALL(c[j]) + LAND.lift - step[1]; if (lay.flat ? Math.abs(p[c[j]][1] - need) < 0.0005 : p[c[j]][1] >= need) continue;
      const L = length(d), by = Math.asin(Math.min(1, (need - o[1]) / L)) - Math.asin(d[1] / L), axis = unit(cross(d, [0, 1, 0]));
      for (const k of c.slice(j)) p[k] = add(o, turned(sub(p[k], o), axis, by));
      r.thumbTurns.push({pivot: j - 1, axis: [dot(axis, a.forward), dot(axis, a.palm), dot(axis, a.across)], by});
    } }
  r.step = stepFor(shapedHand(R, r));
  // No further than her arm reaches, in every frame of the hold: the step across the felt taken back until it does (so that
  // the hand lies still where it landed while her body moves on, as in a deal alone).
  let shortMm = 0; const reach = (s: Vec3) => Math.max(...[f, ...hold].map(h => length(sub(add(h.R.w, s), h.R.s))));
  if (reach(r.step) > long) { const flat: Vec3 = [r.step[0], 0, r.step[2]]; let lo = 0, hi = 1; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (reach(add([0, r.step[1], 0], mul(flat, m))) <= long) lo = m; else hi = m; }
    const kept = add([0, r.step[1], 0], mul(flat, lo)); shortMm = mm(length(sub(r.step, kept))); r.step = kept; }
  // Last, nothing of the hand in the card or the felt (his shaping can turn a joint there): the hand lifted off as far as it would go in.
  let liftedMm = 0; { const p = shapedHand(R, r), tips = new Set(lay.touch.map(k => TIPS[k])), worst = Math.min(R.w[1] + r.step[1] - doll.shape.wristBall, ...p.map((_, k) => tips.has(k) ? Infinity : clear(p, k, r.step)));
    if (worst < -0.0005) { r.step = add(r.step, [0, -worst, 0]); liftedMm = mm(-worst); } }
  return {recipe: r, shortMm, liftedMm};
}

/** When the landing is in, as frames of the motion: beat `g` (the card goes into the felt), `rests` (it lies still), `at` (the end pose, where the recipe is worked out), `holdTo` (the last frame it is whole) and `outTo` (gone again; null: it stays to the last frame). */
export type LandingTimes = {g: number; rests: number; at: number; holdTo: number; outTo: number | null};
/** The times of a deal alone (it stays to the last frame) or with its return (dealer3d/src/return-cycle.ts `cycle`: it goes out over the lift and the first third of the way back). */
export function landingTimes(motion: {fps: number; frameCount: number; rests: number; beats?: {g: number}[]}, cycle?: {holdThrough: number; liftEnds: number; readyFrom: number}): LandingTimes {
  const g = Math.round(motion.beats?.[0]?.g ?? motion.rests), rests = motion.rests, last = motion.frameCount - 1;
  if (cycle) return {g, rests, at: cycle.holdThrough, holdTo: cycle.holdThrough, outTo: Math.min(cycle.readyFrom - 1, cycle.liftEnds + Math.round((cycle.readyFrom - cycle.liftEnds) * LAND.outShare))};
  return {g, rests, at: Math.min(last, rests + Math.max(1, Math.round(motion.fps / 5))), holdTo: last, outTo: null};
}
/** What a landing did: its id and his shaping, the frame of the end pose, the fingers then on the card (natural.ts `touching`), how far the hand was moved to it, how much the step was cut short where her arm did not reach and how far the hand was lifted to keep it out of the card (millimetres), and the wrist's height then. */
export type LandingReceipt = {id: LandingId; shaping: Shaping; at: number; touching: string[]; stepMm: number; shortMm: number; liftedMm: number; wristMm: number};

/**
 * The motion (a deal done, alone or with its return, on `doll`) with her right hand landing on the card as `landing`
 * says; and what it did. The hand as before (asBefore) gives the motion itself, untouched.
 */
export function landed<M extends {frames: NaturalFrame[]}>(motion: M, doll: Doll, landing: Landing, times: LandingTimes): {motion: M; receipt: LandingReceipt | null} {
  if (asBefore(landing)) return {motion, receipt: null};
  const lay = LAYS[landing.id], shaping = shapingOf(landing), frames = motion.frames, long = doll.upperArm + doll.forearm - 0.002;
  const {recipe, shortMm, liftedMm} = recipeAt(frames[times.at], lay, shaping, doll, long, frames.slice(times.at, times.holdTo + 1)), from = Math.max(0, times.g - LAND.before);
  const weight = (i: number) => i < from ? 0 : i < times.rests ? smooth((i - from + 1) / (times.rests - from + 1)) : i <= times.holdTo || times.outTo === null ? 1 : 1 - smooth((i - times.holdTo) / Math.max(1, times.outTo - times.holdTo));
  const out = frames.map((f, i) => {
    const t = weight(i); if (t <= 0) return f;
    const R = f.R, p1 = shapedHand(R, recipe).map(q => add(q, recipe.step)), w1 = add(R.w, recipe.step), a0 = axesOf(R.p, 1), a1 = axesOf(p1, 1) as Axes;
    // (no further than her arm reaches in any frame: the wrist taken in toward the shoulder, the hand with it)
    let w = t >= 1 ? w1 : lerp(R.w, w1, t), p = t >= 1 ? p1 : placed(shapeBetween(local(R.p, a0), local(p1, a1), t), between(a0, a1, t), w);
    if (length(sub(w, R.s)) > long) { const inTo = add(R.s, mul(unit(sub(w, R.s)), long)), by = sub(inTo, w); w = inTo; p = p.map(q => add(q, by)); }
    const e = arm(R.s, w, sub(R.e, R.s), doll).elbow;
    return {...f, R: {...R, e: round(e), w: round(w), p: p.map(round)}};
  });
  const end = out[times.at];
  return {motion: {...motion, frames: out}, receipt: {id: landing.id, shaping, at: times.at, touching: touching(end).filter(x => x.hand === 'R').map(x => x.name), stepMm: mm(length(recipe.step)), shortMm, liftedMm, wristMm: mm(end.R.w[1])}};
}
