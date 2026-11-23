// What a hand can do, for the doll's 21-point hands (Jakob 2026-11-23: "inget finger kan försvinna på ett konstigt
// sätt"): the joints' bends measured the same way for every hand, the limits a human finger keeps, what in a frame
// breaks them, and the one rule "Naturlig" lays on her free fingers so that none does (`humaneMotion`). Pure: no I/O, no three.js.
// Bends are measured in the hand's own axes (hand-pose.ts axesOf: along, the way the palm looks, across), each joint
// about the line across the knuckles made square to the bone before it: toward the palm is +, and "sideways" is how
// far the next bone leaves the plane square to that line (a finger's middle and end joints are hinges and bend in it).
import {CARD, add, cross, dot, length, mul, sub, unit, type Vec3} from './camera.ts';
import {FINGERS} from './capture.ts';
import {axesOf, local, placed} from './hand-pose.ts';

const deg = (r: number) => r * 180 / Math.PI, rad = (d: number) => d * Math.PI / 180;
/**
 * A human finger's limits (degrees), forefinger to little finger: the knuckle (MCP) bends from 30 back to 90 toward the
 * palm and turns up to 30 to the side; the middle (PIP) and end (DIP) joints are hinges, from a hair back to 105 and 80,
 * and leave their plane by at most 15 (the finger's own twist as it curls).
 */
export const LIMITS = {mcp: {flex: [-30, 90], side: 30}, pip: {flex: [-5, 105], side: 15}, dip: {flex: [-10, 80], side: 15}} as const;
const JOINT = ['mcp', 'pip', 'dip'] as const;
/** How thick the doll draws a hand (dealer3d/src/stage.ts pointHand), metres: a finger's bones from the knuckle out, the thumb's. */
export const DRAWN = {finger: [0.0078, 0.0071, 0.0064], thumb: [0.0088, 0.0082, 0.0076]};
/** Two fingers' bones closer than this (centre line to centre line, metres) are in each other as drawn; two neighbours' joints and tips less than this apart across the hand are not side by side. */
export const APART = 0.011;
/**
 * How a free finger follows the one beside it toward the holding fingers (the ring finger the middle finger, the little
 * finger the ring finger), as a relaxed hand's fingers do: `more` degrees more bent at each joint, turned `out` degrees
 * further to its own side; and bent at most `slack` degrees more in all than that before the rule takes it.
 */
export const FOLLOW = {more: [5, 10, 5], out: 3, slack: 15} as const;

export type Bends = {flex: [number, number, number]; side: [number, number, number]};
const Z: Vec3 = [0, 0, 1];
/** The bends of the fingers (forefinger to little finger: index 0 to 3) of a hand in its own axes (hand-pose.ts `local`). */
export const bendsOf = (q: Vec3[]): Bends[] => FINGERS.slice(1).map(c => { const chain = [q[0], ...c.map(k => q[k])], b = [1, 2, 3, 4].map(k => unit(sub(chain[k], chain[k - 1])));
  const flex = [0, 0, 0] as [number, number, number], side = [0, 0, 0] as [number, number, number];
  for (let j = 0; j < 3; j++) { const u = b[j], v = b[j + 1], h = unit(sub(Z, mul(u, dot(Z, u))));
    flex[j] = deg(Math.atan2(dot(cross(u, v), h), dot(u, v) || 1e-12)); side[j] = deg(Math.asin(Math.max(-1, Math.min(1, dot(v, h))))); }
  return {flex, side}; });
/** Finger `f`'s (1 forefinger … 4 little finger) middle joint, end joint and tip in the hand's own axes, from its knuckle and its bones' lengths bent as `b` says: bendsOf read back. */
export const fingerFrom = (q: Vec3[], f: number, b: Bends, lens: number[]): Vec3[] => {
  let u = unit(sub(q[FINGERS[f][0]], q[0])), at = q[FINGERS[f][0]]; const out: Vec3[] = [];
  for (let j = 0; j < 3; j++) { const h = unit(sub(Z, mul(u, dot(Z, u)))), w = cross(h, u), fl = rad(b.flex[j]), s = rad(b.side[j]);
    u = add(mul(add(mul(u, Math.cos(fl)), mul(w, Math.sin(fl))), Math.cos(s)), mul(h, Math.sin(s))); at = add(at, mul(u, lens[j])); out.push(at); }
  return out; };

/** A fault: its kind, what it is in words, by how much (degrees or millimetres), and the fingers it is in (FINGERS: 0 the thumb … 4 the little finger; none: a bone of the palm). */
export type Fault = {kind: 'led' | 'ben' | 'i varandra' | 'ordning' | 'grannen' | 'kortet' | 'filten'; what: string; by: number; fingers: number[]};
type Card = {c: Vec3; l: Vec3; n: Vec3};
const NAMES = ['tummen', 'pekfingret', 'långfingret', 'ringfingret', 'lillfingret'];
const BONES: {finger: number; a: number; b: number; r: number}[] = FINGERS.flatMap((c, f) => [0, 1, 2].map(k => ({finger: f, a: c[k], b: c[k + 1], r: (f ? DRAWN.finger : DRAWN.thumb)[k]})));
/** The least distance between two segments. */
const segmentGap = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3) => {
  const clamp = (x: number) => Math.max(0, Math.min(1, x)), d1 = sub(q1, p1), d2 = sub(q2, p2), r0 = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r0), c = dot(d1, r0), b = dot(d1, d2), den = a * e - b * b;
  let s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
  return length(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t)))); };
const onCard = (card: Card, q: Vec3): Vec3 => { const d = sub(q, card.c), across = cross(card.n, card.l); return [dot(d, card.l), dot(d, across), dot(d, card.n)]; };
/** Whether the segment from `a` to `b`, drawn `r` thick, goes through the card (one end on each side of its face, through it inside its edges or less than `r` less 2 mm outside them). */
const throughCard = (card: Card, a: Vec3, b: Vec3, r: number) => { const A = onCard(card, a), B = onCard(card, b); if (A[2] * B[2] >= 0) return false;
  const k = A[2] / (A[2] - B[2]), u = A[0] + (B[0] - A[0]) * k, v = A[1] + (B[1] - A[1]) * k, e = Math.max(0, r - 0.002);
  return Math.abs(u) < CARD.height / 2 + e && Math.abs(v) < CARD.width / 2 + e; };
/** How far the bone from `a` to `b`, drawn `r` thick, is deeper than 2 mm in the felt (y = 0), metres (0: not). */
const inFelt = (a: Vec3, b: Vec3, r: number) => Math.max(0, -0.002 - (Math.min(a[1], b[1]) - r));
/** How far the bone from `a` to `b`, drawn `r` thick, is deeper than 2 mm in the card from either face (as drawn: over it, or at its edges), metres (0: not; through it: a centimetre). */
const inCard = (card: Card, a: Vec3, b: Vec3, r: number) => { if (throughCard(card, a, b, r)) return 0.01; let most = 0; const e = Math.max(0, r - 0.002);
  for (let k = 0; k <= 4; k++) { const x = onCard(card, add(a, mul(sub(b, a), k / 4))); if (Math.abs(x[0]) < CARD.height / 2 + e && Math.abs(x[1]) < CARD.width / 2 + e) most = Math.max(most, r - 0.002 - Math.abs(x[2])); }
  return most; };
/** How near the card's edges a free finger is kept on her palm's side of it, metres: a finger curled past an edge, under the card's face, would go through the card as the hand or the card moves. */
const CARD_SIDE = 0.02;
/**
 * How far the bone from `a` to `b`, drawn `r` thick, of the hand `p` is on the far side of the card from her palm (the
 * side her knuckles are on), or nearer its face than 1.5 mm less than `r`, where it is over the card or less than
 * CARD_SIDE outside its edges, metres (0: not). Stricter than inCard by half a millimetre, so that the rounding of the
 * points does not make a finger kept clear of the card touch it.
 */
const offPalmSide = (card: Card, p: Vec3[], a: Vec3, b: Vec3, r: number) => { const side = Math.sign([5, 9, 13, 17].reduce((s, k) => s + onCard(card, p[k])[2], 0)) || 1; let most = 0;
  for (let k = 0; k <= 4; k++) { const x = onCard(card, add(a, mul(sub(b, a), k / 4))); if (Math.abs(x[0]) < CARD.height / 2 + CARD_SIDE && Math.abs(x[1]) < CARD.width / 2 + CARD_SIDE) most = Math.max(most, r - 0.0015 - side * x[2]); }
  return most; };
/** The way across the hand (hand-pose.ts `local`'s third axis) from the forefinger toward the little finger: +1 or -1. */
const outward = (q: Vec3[]) => Math.sign(q[17][2] - q[5][2]) || 1;
/** A free finger's whole bend that its neighbour's allows (FOLLOW). */
const mostBend = (n: Bends) => n.flex[0] + n.flex[1] + n.flex[2] + FOLLOW.more[0] + FOLLOW.more[1] + FOLLOW.more[2] + FOLLOW.slack;
const FREE = [3, 4]; // the ring and the little finger (FINGERS): in a deal the hand holds with the forefinger and the middle finger (pose-on-doll.ts HOLDING)

/**
 * What in one hand breaks what a hand can do: `p` the hand's 21 points in the room, `sign` +1 her right and -1 her left,
 * `bones` the lengths its 20 bones should have (FINGERS order, the wrist to each knuckle first; null: not checked),
 * `card` the card (null: none). The felt is y = 0. Each fault says what and by how much (degrees or millimetres):
 * a joint beyond its limit, a bone that changes length, two fingers in each other, two neighbours not side by side in
 * order, a free finger bent far more than its neighbour, a bone through the card or into the felt.
 */
export function handFaults(p: Vec3[], sign: number, bones: number[] | null, card: Card | null): Fault[] {
  const out: Fault[] = [], mm = (m: number) => Math.round(m * 10000) / 10, q = local(p, axesOf(p, sign)), bends = bendsOf(q), o = outward(q);
  bends.forEach((b, i) => JOINT.forEach((j, k) => { const L = LIMITS[j], f = b.flex[k], s = b.side[k];
    if (f < L.flex[0] || f > L.flex[1]) out.push({kind: 'led', what: `${NAMES[i + 1]} ${j} böjd ${Math.round(f)}°`, by: Math.round(f < L.flex[0] ? L.flex[0] - f : f - L.flex[1]), fingers: [i + 1]});
    if (Math.abs(s) > L.side) out.push({kind: 'led', what: `${NAMES[i + 1]} ${j} i sidled ${Math.round(s)}°`, by: Math.round(Math.abs(s) - L.side), fingers: [i + 1]}); }));
  if (bones) boneLengths(p).forEach((l, k) => { if (Math.abs(l - bones[k]) > 0.0005) out.push({kind: 'ben', what: `ben ${k} ${mm(l)} mm (ska vara ${mm(bones[k])})`, by: mm(Math.abs(l - bones[k])), fingers: k % 4 ? [Math.floor(k / 4)] : []}); });
  for (let x = 0; x < BONES.length; x++) for (let y = x + 1; y < BONES.length; y++) { const A = BONES[x], B = BONES[y]; if (A.finger === B.finger) continue;
    const g = segmentGap(p[A.a], p[A.b], p[B.a], p[B.b]); if (g < APART) out.push({kind: 'i varandra', what: `${NAMES[A.finger]} och ${NAMES[B.finger]} ${mm(g)} mm`, by: mm(APART - g), fingers: [A.finger, B.finger]}); }
  for (let f = 2; f <= 4; f++) { const least = Math.min(...[1, 2, 3].map(k => o * (q[FINGERS[f][k]][2] - q[FINGERS[f - 1][k]][2])));
    if (least < APART) out.push({kind: 'ordning', what: `${NAMES[f]} bara ${mm(least)} mm bredvid ${NAMES[f - 1]}`, by: mm(APART - least), fingers: [f - 1, f]}); }
  for (const f of FREE) { const more = bends[f - 1].flex.reduce((s, x) => s + x, 0) - mostBend(bends[f - 2]);
    if (more > 0) out.push({kind: 'grannen', what: `${NAMES[f]} böjd ${Math.round(more)}° mer än ${NAMES[f - 1]} tillåter`, by: Math.round(more), fingers: [f]}); }
  BONES.forEach(B => { const low = inFelt(p[B.a], p[B.b], B.r); if (low > 0) out.push({kind: 'filten', what: `${NAMES[B.finger]} ${mm(low + 0.002)} mm i filten`, by: mm(low), fingers: [B.finger]});
    const deep = card ? inCard(card, p[B.a], p[B.b], B.r) : 0;
    if (deep > 0) out.push({kind: 'kortet', what: deep >= 0.01 ? `${NAMES[B.finger]} genom kortet` : `${NAMES[B.finger]} ${mm(deep + 0.002)} mm i kortet`, by: mm(deep), fingers: [B.finger]}); });
  return out;
}
/** The 20 bones' lengths of a hand, FINGERS order, the wrist to each knuckle first. */
export const boneLengths = (p: Vec3[]): number[] => FINGERS.flatMap(c => [0, 1, 2, 3].map(n => length(sub(p[c[n]], p[n ? c[n - 1] : 0]))));

/** How far a free finger follows its neighbour (`t`, 0 to 1) and is lifted at its knuckle, away from the palm, off the felt and the card (`lift`, 0 to 1 of LIFT). */
export type Follow = {t: number; lift: number};
/** The most a free finger is lifted at its knuckle to keep it out of the felt and the card, degrees (never past LIMITS). */
const LIFT = 60;
/**
 * The one rule for her free fingers (the ring and the little finger; the forefinger and the middle finger hold the card
 * where the deal puts their tips, and the thumb is left as it is): each follows its neighbour toward the holding fingers
 * as a relaxed hand's do (FOLLOW: bent a little more, turned a little out, its middle and end joints hinges) as far as it
 * must to keep within LIMITS, side by side with that neighbour in order, out of every other finger, and bent no more
 * than its neighbour allows; and is lifted at its knuckle as little as keeps it out of the felt and on her palm's side
 * of the card (offPalmSide). `given` (per free finger): how far it follows and is lifted, where given; else as far as
 * it must. Only the first `upTo` + 1 free fingers are laid. The knuckles, the bones' lengths and every other point
 * stay. Answers the hand (`p` itself where nothing changed) and what each needed.
 */
function freeFingers(p: Vec3[], sign: number, card: Card | null, given: Partial<Follow>[], upTo = 1): {p: Vec3[]; need: Follow[]} {
  const a = axesOf(p, sign), q = local(p, a), o = outward(q), bends = bendsOf(q), need: Follow[] = [{t: 0, lift: 0}, {t: 0, lift: 0}], moved: number[] = [];
  const room = (pts: Vec3[]) => placed(pts, a, p[0]), keep = 0.0005; // half a millimetre to spare, that rounding keeps
  FREE.slice(0, upTo + 1).forEach((f, i) => {
    const c = FINGERS[f], n = FINGERS[f - 1], own = bends[f - 1], next = bends[f - 2], lens = [1, 2, 3].map(k => length(sub(q[c[k]], q[c[k - 1]])));
    const yaw = (k: number) => deg(Math.atan2(q[k][2], q[k][0]));
    const target: Bends = {flex: own.flex.map((_, j) => next.flex[j] + FOLLOW.more[j]) as Bends['flex'], side: [next.side[0] + yaw(n[0]) - yaw(c[0]) + o * FOLLOW.out, 0, 0]};
    const mix = (t: number): Bends => ({flex: own.flex.map((x, j) => x + (target.flex[j] - x) * t) as Bends['flex'], side: own.side.map((x, j) => x + (target.side[j] - x) * t) as Bends['side']});
    const lifted = (b: Bends, l: number): Bends => l > 0 ? {flex: [Math.max(LIMITS.mcp.flex[0] + 0.5, b.flex[0] - LIFT * l), b.flex[1], b.flex[2]], side: b.side} : b;
    // Out of every other finger but the free fingers after it, laid after it beside it.
    const others = BONES.filter(B => B.finger !== f && !(FREE.includes(B.finger) && B.finger > f)), mine = BONES.filter(B => B.finger === f);
    /** How deep the finger bent as `b` is in the felt and on the wrong side of the card (metres, offPalmSide). */
    const clash = (b: Bends) => { const inRoom = room([q[c[0]], ...fingerFrom(q, f, b, lens)]);
      return mine.reduce((sum, B, k) => sum + inFelt(inRoom[k], inRoom[k + 1], B.r) + (card ? offPalmSide(card, p, inRoom[k], inRoom[k + 1], B.r) : 0), 0); };
    /** The least lift that clears the felt and the card of the finger bent as `b`, or the one that clears them most. */
    const liftFor = (b: Bends) => { const c0 = clash(b); if (c0 === 0) return 0; let best = {l: 0, clash: c0}, lo = 0, hi = 0;
      for (let k = 1; k <= 20; k++) { const ck = clash(lifted(b, k / 20)); if (ck < best.clash) best = {l: k / 20, clash: ck}; if (ck === 0) { hi = k / 20; lo = (k - 1) / 20; break; } }
      if (!hi) return best.l;
      for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (clash(lifted(b, m)) === 0) hi = m; else lo = m; }
      return hi; };
    const at = (t: number) => { const b = mix(t); return lifted(b, liftFor(b)); };
    /** How far the finger bent as `b` breaks the rule: nought where it keeps it (degrees, and millimetres weighed a thousandfold). */
    const broken = (b: Bends) => { const s = fingerFrom(q, f, b, lens), pts = [q[c[0]], ...s], over = (x: number) => Math.max(0, x);
      let sum = JOINT.reduce((t, j, k) => t + over(LIMITS[j].flex[0] + 0.5 - b.flex[k]) + over(b.flex[k] - LIMITS[j].flex[1] + 0.5) + over(Math.abs(b.side[k]) - LIMITS[j].side + 0.5), 0);
      sum += over(b.flex[0] + b.flex[1] + b.flex[2] - mostBend(next) + 0.5);
      for (let k = 0; k < 3; k++) { sum += 1000 * over(APART + keep - o * (s[k][2] - q[n[k + 1]][2]));
        for (const B of others) sum += 1000 * over(APART + keep - segmentGap(pts[k], pts[k + 1], q[B.a], q[B.b])); }
      return sum; };
    if (given[i]?.t === undefined && broken(own) > 0) { let lo = 0, hi = 0, best = {t: 0, broken: broken(own)};
      for (let k = 1; k <= 20; k++) { const bk = broken(at(k / 20)); if (bk < best.broken - 1e-9) best = {t: k / 20, broken: bk}; if (bk === 0) { hi = k / 20; lo = (k - 1) / 20; break; } }
      if (hi) { for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (broken(at(m)) === 0) hi = m; else lo = m; } need[i].t = hi; } else need[i].t = best.t; }
    const t = given[i]?.t ?? need[i].t;
    need[i].lift = liftFor(mix(t));
    const lift = given[i]?.lift ?? need[i].lift;
    if (t <= 0 && lift <= 0) return;
    const s = fingerFrom(q, f, lifted(mix(t), lift), lens); [1, 2, 3].forEach((k, j) => { q[c[k]] = s[j]; }); bends[f - 1] = bendsOf(q)[f - 1]; moved.push(...c.slice(1));
  });
  if (!moved.length) return {p, need};
  const out = room(q);
  return {p: p.map((x, k) => moved.includes(k) ? out[k].map(v => Math.round(v * 10000) / 10000) as Vec3 : x), need};
}

type Limb = {w: Vec3; p: Vec3[]};
const FADE = 0.05; // metres the wrist is from where it was at the motion's first frame (the anchor) before the following is wholly laid on (pose-on-doll.ts FADE)
const awayFrom = (d: number) => { const x = Math.max(0, Math.min(1, d / FADE)); return x * x * (3 - 2 * x); };
/** How fast a finger's following and lift may change, per frame: as much as a later or earlier frame needs, less this per frame between. */
const EASE = 0.1;
const eased = (need: number[]) => need.map((_, i) => Math.max(...need.map((x, j) => x - EASE * Math.abs(i - j))));
/** The most each frame may be laid on: EASE for each frame it is from one where the wrist is exactly where it was in the first frame (the anchor; a return cycle's end). */
const fromAnchor = (wrists: Vec3[]) => { const first = JSON.stringify(wrists[0]), at = wrists.flatMap((w, k) => JSON.stringify(w) === first ? [k] : []);
  return wrists.map((_, k) => EASE * Math.min(...at.map(j => Math.abs(k - j)))); };
/**
 * A motion (its frames' card and two hands) with the rule for her free fingers laid on both hands of every frame: each
 * finger follows its neighbour as far as the frame needs times how far the wrist is from where it was in the first
 * frame, and is lifted as far as the frame needs, each eased over the frames about it (EASE, so that nothing jumps) and
 * nought where the wrist is exactly where it was in the first frame (the anchor: there her hand is as her picture has
 * it), growing from there by EASE a frame. The ring finger first, then the little finger beside it.
 */
export function humaneMotion<M extends {frames: unknown[]}>(motion: M): M {
  const frames = motion.frames as {card?: Card; R: Limb; L: Limb}[]; if (!frames.length) return motion;
  const hands = (['R', 'L'] as const).map(side => { const sign = side === 'R' ? 1 : -1, first = frames[0][side].p[0], away = frames.map(f => awayFrom(length(sub(f[side].p[0], first))));
    const most = fromAnchor(frames.map(f => f[side].p[0]));
    const given: Partial<Follow>[][] = frames.map(() => [{}, {}]), lay = (k: number, upTo: number) => freeFingers(frames[k][side].p, sign, frames[k].card ?? null, given[k], upTo);
    for (const i of [0, 1]) {
      eased(frames.map((_, k) => lay(k, i).need[i].t * away[k])).forEach((t, k) => { given[k][i] = {t: Math.min(t, most[k])}; });
      eased(frames.map((_, k) => lay(k, i).need[i].lift)).forEach((l, k) => { given[k][i].lift = Math.min(l, most[k]); }); }
    return {side, p: frames.map((_, k) => lay(k, 1).p)}; });
  return {...motion, frames: frames.map((f, i) => { let out = f;
    for (const h of hands) if (h.p[i] !== f[h.side].p) out = {...out, [h.side]: {...f[h.side], p: h.p[i]}};
    return out; })};
}
