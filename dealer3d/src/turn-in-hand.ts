// The card turned in her right hand, "Vändning: I handen" (Jakob's word in docs/BESKED.md: "Kortet vänds av hennes
// händer", "Kortet sitter i fingrarna genom vändningen", "Handen vänds en gång, i luften", "Handleden vrider kortet"; and
// 2026-11-23 the hands free of each other, one hand on the card at a time, and no overdone twist of the wrist).
// Her left hand lets go of the card and it lies on the felt; her right hand comes to it, the tip of her thumb sliding
// along the felt in under one edge so that the edge rides up on it (the card leaves the felt only on her thumb, two
// fingertips side by side on its back), and turns it up with the forearm and wrist, the card fixed in that grip, while
// she carries it to its place; there it comes down onto an edge or corner on the felt and tips over it in her hand. Near
// the felt her two fingertips stay under it where they hold it and her hand turns about them, her wrist rising and her
// thumb on its face, lowering it as far as she reaches and her hand stays out of the felt; then her fingertips slide out
// from under it, it falls the last part flat, and her hand lifts off and turns back to her own. The card's place while it
// is held follows from the hand's (it is not a motion of its own beside the hand). A card laid face up from face down in
// one fixed grip needs the hand turned half a turn (palm down to palm up), which no wrist does at ease; held this way the
// hand turns it about two thirds of that and the felt the rest.
// The edge she takes it by, the edge or corner it stands on, the card's angle in her fingers and their pitch onto it are
// chosen for the least bent wrist where she takes it, halfway, where it stands and where she lets go, with no part of her
// hand through the card, the thumb on it, within her reach and over the felt, near where her hand was going, and the turn
// as nearly about her hand's own length as may be (the forearm turning it, not the wrist bending).
// It is laid on a deal that is done ("Naturlig", after dealer3d/src/natural.ts and before the landing, dealer3d/src/
// landing.ts: page/natural-lab.ts lays it), on her right hand and the card only, from her right hand's way in to the card
// lying where the deal has it lie; her left hand, the head and every other frame are as they are, so that a landing goes
// on as before. "forut", the default, changes nothing, to the last digit. Pure: no I/O and no three.js.
import {CARD, add, cross, dot, length, mul, sub, unit, type Vec3} from './camera.ts';
import {arm, turned} from './body.ts';
import {axesOf, between, local, placed, shapeBetween, type Axes} from './hand-pose.ts';
import {FINGERS} from './capture.ts';
import {BALL, bendFinger} from './landing.ts';
import {DRAWN} from './hand-rule.ts';
import {NATURAL, handsApart, type NaturalFrame} from './natural.ts';
import type {Doll} from './doll.ts';

export type TurnId = 'forut' | 'i-handen';
/** The turns, for the lab's choice: id, the Swedish label, and (for a film order's text) one plain English sentence. */
export const TURNS: readonly {id: TurnId; label: string; sentence?: string}[] = [
  {id: 'forut', label: 'Som förut'},
  {id: 'i-handen', label: 'I handen', sentence: 'Her right hand slides its thumb in under the edge of the card and lifts it, two fingertips on its back, and turns it over at the wrist as she carries it; at its place she sets it on a corner, tips it over and lowers it on her fingertips with her thumb on its face, then slides her fingers out from under it and it drops the last bit flat, face up.'},
];
export const TURN_DEFAULT: TurnId = 'forut';
/** The turn a stored value names; anything else (no field, as every standard saved before turns) is the default, the turn as before. */
export const turnOf = (value: unknown): TurnId => TURNS.some(t => t.id === value) ? value as TurnId : TURN_DEFAULT;

const TURN = {
  /** Frames: the card comes down to the felt over `drop` after her left hand lets go; her right hand comes in over `comeIn`, lifting its edge over the last `pick`; held, it turns over at least `minHeld`; it tips over its edge on the felt over `tip`. */
  drop: 2, comeIn: 8, pick: 3, minHeld: 8, tip: 7,
  /** Degrees the card turns held, with her hand (it stands on its edge this far from face down); the rest it tips over that edge. Tried: the card's angle in her fingers and their pitch onto it. */
  held: 105, yaws: [-45, -30, -15, 0, 15, 30, 45], pitches: [0, 8, 16, 24], slides: [-0.6, -0.3, 0, 0.3, 0.6],
  /** Metres: the fingertips this far in from the card's edge; her right forefinger this near the card where it lies when she comes to take it. */
  inset: 0.009, near: 0.02,
  /** Metres: the tip of her thumb (as she takes the card) or of her two fingers (as she lays it) slides along the felt with its ball this far over it, in under the card's edge from this far outside it, and out again past it. */
  skim: 0.0001, outside: 0.001,
  /** Degrees from flat: the grip is weighed (her wrist, the felt) held as far down as this; below it her fingertips under the card come to the felt and slide out from under its edge. */
  weighDown: 60,
  /** Frames her hand at least takes, once the card lies, to turn back to her own (lifted this far, metres, as it goes). */
  back: 6, rise: 0.02,
  /** As she lays it: degrees her hand turns about her fingertips from one frame to the next weighed as much as bending her wrist (natural.ts's measure), and the step it is searched in; metres a hand laying it may be in the felt or the card. */
  layTurn: 20, layStep: 6, clear: 0.0008,
  /** Metres her fingers are kept clear of the card as they slide out from under it. */
  spare: 0.005,
  /** Degrees her ring and little fingers are curled in at their three joints as she lays it. */
  curlIn: [80, 95, 60] as [number, number, number],
  /** Share of the angle her fingers last held it at that the card still stands at the frame after they slide out from under it (it falls the rest the next). */
  falls: 0.55,
  /** Metres: the forefinger's and middle finger's tips at most this much nearer or farther from the edge than each other. */
  sideBySide: 0.01,
  /** Degrees: the thumb's last bone under the card slants this far away from its face, back to its middle joint, and turns this far to either side of straight back to the edge; tried from the flattest. Its bone before goes past the edge, clear of the card. */
  thumbSlants: [15, 30, 45], thumbSides: [0, -25, 25, -50, 50],
  /** Metres: the thumb's tip under the card this far along the edge from straight under the fingertips, tried from nought. */
  thumbShifts: [0, -0.008, 0.008, -0.016, 0.016],
  /** Metres: where her arm does not reach the card standing where it will lie, it stands at most this much nearer her and is pushed there as it tips over. */
  shortOf: 0.035,
  /** Metres: every ball of the hand at least `felt` over the felt (on top of its radius), the wrist ball `wrist`. */
  felt: 0.0015, wrist: 0.003,
  /** Frames the lift is widened and smoothed over each way; radians the elbow may turn about the line from shoulder to wrist, and the step. */
  spread: 3, elbowMost: 0.6, elbowStep: 0.05,
};
/** The two holding fingers' joints (index, middle), degrees toward the palm, tried from the straightest until the thumb meets the card under them; the free fingers curled out of the way. */
const HOLD: [number, number, number][] = [[20, 16, 8], [32, 28, 12], [44, 40, 16], [56, 50, 20], [68, 60, 24], [80, 70, 28]];
const FREE: [number, number, number][] = [[58, 78, 42], [60, 80, 42]];
const TIP = NATURAL.tip, T = CARD.thickness, H = CARD.height / 2, W = CARD.width / 2;
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => Math.round(r * 1800 / Math.PI) / 10, mm = (m: number) => Math.round(m * 10000) / 10;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const round = (v: Vec3): Vec3 => v.map(x => Math.round(x * 10000) / 10000) as Vec3;
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));
const UP: Vec3 = [0, 1, 0];

// ---- turns as matrices (columns: where each axis goes) ---------------------------------------------------------------
type M3 = [Vec3, Vec3, Vec3];
const apply = (m: M3, v: Vec3): Vec3 => add(add(mul(m[0], v[0]), mul(m[1], v[1])), mul(m[2], v[2]));
const transposed = (m: M3): M3 => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
/** The turn that takes the three axes `f` to `g` (each orthonormal, alike in hand). */
const fromTo = (f: Vec3[], g: Vec3[]): M3 => { const ft = transposed(f as M3); return [apply(g as M3, ft[0]), apply(g as M3, ft[1]), apply(g as M3, ft[2])]; };
/** A turn (not a half turn) as its axis and angle, radians. */
const axisAngle = (m: M3) => ({axis: unit([m[1][2] - m[2][1], m[2][0] - m[0][2], m[0][1] - m[1][0]]), angle: Math.acos(Math.max(-1, Math.min(1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2)))});
const turnAxes = (a: Axes, by: (v: Vec3) => Vec3): Axes => { const forward = by(a.forward), palm = by(a.palm); return {forward, palm, across: cross(palm, forward)}; };
const cardAxes = (l: Vec3, n: Vec3): Vec3[] => [l, n, cross(n, l)];
const inPlane = (v: Vec3, n: Vec3) => unit(sub(v, mul(n, dot(v, n))));
/** How far a hand's wrist is bent from the forearm (natural.ts's measure): sideways and toward the palm, radians. */
const bentFrom = (a: Axes, w: Vec3, e: Vec3) => { const d = unit(sub(w, e)); return {dev: Math.atan2(dot(d, a.across), dot(d, a.forward)), flex: Math.atan2(dot(d, a.palm), dot(d, a.forward))}; };
const wristCost = (b: {dev: number; flex: number}) => (b.dev / NATURAL.wrist.dev) ** 2 + (b.flex / NATURAL.wrist.flex) ** 2;
/** Her elbow for the wrist `w` and hand axes `a`: turned about the line from shoulder to wrist (from where `pole` has it) to bend the wrist least; and that turn. */
function elbowFor(s: Vec3, w: Vec3, pole: Vec3, a: Axes, doll: Doll): {e: Vec3; turn: number} {
  const line = unit(sub(w, s)); let best = 0, cost = Infinity;
  for (let t = -TURN.elbowMost; t <= TURN.elbowMost + 1e-9; t += TURN.elbowStep) { const e = arm(s, w, turned(pole, line, t), doll).elbow, c = wristCost(bentFrom(a, w, e)) + (t / NATURAL.pole) ** 2; if (c < cost) { cost = c; best = t; } }
  return {e: arm(s, w, turned(pole, line, best), doll).elbow, turn: best};
}

type Limb = NaturalFrame['R'];
type Card = NaturalFrame['card'];
/** A point in the card's own measures: along its long side, across it, and off its face. */
const onCard = (k: Card, q: Vec3): Vec3 => { const d = sub(q, k.c); return [dot(d, k.l), dot(d, cross(k.n, k.l)), dot(d, k.n)]; };
/** How far a ball of radius `r` at `q` is into the card, metres (nought where it is clear of it). */
const into = (k: Card, q: Vec3, r: number) => { const [u, v, o] = onCard(k, q).map(Math.abs), out = [u - H, v - W, o - T / 2];
  return Math.max(0, r - (out.some(x => x > 0) ? Math.hypot(...out.map(x => Math.max(0, x))) : Math.max(...out))); };
/** How far a hand `p` goes through the card, metres: its deepest ball (a millimetre inside its radius, so that a fingertip resting on the card is not in it), and a bone that crosses the card's face counts its two ends' depth on either side. */
export const pierced = (k: Card, p: Vec3[]) => { let most = Math.max(0, ...p.map((q, j) => j > 0 ? into(k, q, BALL(j) - 0.001) : 0));
  for (const c of FINGERS) for (let j = 0; j < 3; j++) { const [u0, v0, o0] = onCard(k, p[c[j]]), [u1, v1, o1] = onCard(k, p[c[j + 1]]); if (o0 * o1 >= 0) continue;
    const t = o0 / (o0 - o1); if (Math.abs(u0 + t * (u1 - u0)) <= H && Math.abs(v0 + t * (v1 - v0)) <= W) most = Math.max(most, Math.min(Math.abs(o0), Math.abs(o1)) + 0.001); }
  return most; };
/** A card's four edges: the way out of it across each, in its plane, and how far that edge is from its middle. */
const edgesOf = (k: Card) => { const a = cross(k.n, k.l); return [{o: k.l, h: H}, {o: mul(k.l, -1), h: H}, {o: a, h: W}, {o: mul(a, -1), h: W}]; };
/** The card `k` turned `by` radians about the edge on the far side from `o` (its edge's way out), on the felt: the edge toward `o` rises. */
const liftedBy = (k: Card, o: Vec3, h: number, by: number): Card => { const e = cross(o, UP), at = sub(sub(k.c, mul(o, h)), mul(UP, T / 2));
  return {...k, c: add(at, turned(sub(k.c, at), e, by)), l: turned(k.l, e, by), n: turned(k.n, e, by)}; };
/** Where a lying card can stand to tip back onto where it lay: on its edge or its corner farthest toward `o` (`at`, on the felt), about the line there square to `o`; every 30 degrees round, `toward` from its long side. */
const hingesOf = (k: Card) => { const a = cross(k.n, k.l); return Array.from({length: 12}, (_, j) => { const f = rad(30 * j), c = Math.round(Math.cos(f) * 1e9) / 1e9, s = Math.round(Math.sin(f) * 1e9) / 1e9;
  return {toward: 30 * j, o: unit(add(mul(k.l, c), mul(a, s))), at: sub(add(add(k.c, mul(k.l, Math.sign(c) * H)), mul(a, Math.sign(s) * W)), mul(UP, T / 2)), corner: c !== 0 && s !== 0}; }); };
type Hinge = ReturnType<typeof hingesOf>[number];
/** The card `k`, lying, stood up `by` radians on its hinge. */
const stoodOn = (k: Card, g: Hinge, by: number): Card => { const e = cross(UP, g.o); return {...k, c: add(g.at, turned(sub(k.c, g.at), e, by)), l: turned(k.l, e, by), n: turned(k.n, e, by)}; };
/** How far the near edge must rise for the thumb's ball to go under it, the far edge on the felt: radians, for a card this long from the far edge to the thumb. */
const pickTilt = (span: number) => { let p = Math.asin(Math.min(0.7, (2 * TIP + TURN.felt) / span)); for (let k = 0; k < 3; k++) p = Math.asin(Math.min(0.7, (TIP * (1 + Math.cos(p)) + TURN.felt) / span)); return p; };

/**
 * What the turn in the hand did: the frames (her left hand lets go, her right takes the card, it stands on its edge on
 * the felt, her fingertips slide out from under it, it lies), how near lying her fingers held it last (`letGoDeg`,
 * degrees), the grip (`edge`: she takes the card by its long or its short
 * side; `standsOn`: its long or short edge or a corner; the card's angle in her fingers and their pitch onto it, degrees;
 * how far it turns in her hand up to where it stands and in all while she holds it, and how far she lifts its edge
 * to take it, degrees), how far the thumb is from the card under the fingertips (mm), how far hand and card were lifted
 * at most (mm), how far the wrist is bent where she takes it, halfway, where it stands, where she lets go and at most
 * while she holds it (degrees, as natural.ts weighs it; `wristBefore` the same frames as they were), how far her hand
 * turns about the forearm while it holds the card (degrees), how near the hands come about the take (mm) and how far her
 * arm was short (mm). `why`: not laid, and why.
 */
type Wrist = {take: number; half: number; stands: number; letGo: number; most: number};
export type TurnReceipt = {id: TurnId; laid: boolean; why?: string; leftOff?: number; take?: number; stands?: number; letGo?: number; letGoDeg?: number; lies?: number;
  edge?: 'long' | 'short'; standsOn?: 'long' | 'short' | 'corner'; toward?: number; yaw?: number; pitch?: number; slide?: number; held?: number; heldInAll?: number; picked?: number; thumbGapMm?: number; liftMm?: number;
  wrist?: Wrist; wristBefore?: Wrist; rolled?: number; apartMm?: number; nearerMm?: number; shortMm?: number};

/** The thumb of shape `S` (wrist at nought, the hand's own axes) round an edge: its middle joint brought to `mid`, its tip then turned about that joint toward `tip` (never bent there more than `most` degrees); bones at their lengths. */
function thumbRound(S: Vec3[], mid: Vec3, tip: Vec3, most = 95): Vec3[] {
  let p = S.map(q => [...q] as Vec3); const c = FINGERS[0], swing = (q: Vec3[], pivot: number, from: Vec3, to: Vec3, share: number, joints: number[]) => { const axis = cross(from, to), sn = length(axis); if (sn < 1e-9) return q;
    const by = Math.atan2(sn, dot(from, to)) * share, o = q[pivot]; return q.map((v, k) => joints.includes(k) ? add(o, turned(sub(v, o), unit(axis), by)) : v); };
  for (let pass = 0; pass < 60; pass++) for (const j of [1, 0]) p = swing(p, c[j], unit(sub(p[c[2]], p[c[j]])), unit(sub(mid, p[c[j]])), j === 0 ? 0.6 : 0.3, c.slice(j + 1));
  const bone = unit(sub(p[c[2]], p[c[1]])), want = unit(sub(tip, p[c[2]])), now = unit(sub(p[c[3]], p[c[2]])), bend = Math.acos(Math.max(-1, Math.min(1, dot(bone, want)))) * 180 / Math.PI;
  return swing(p, c[2], now, bend <= most ? want : unit(turned(bone, unit(cross(bone, want)), rad(most))), 1, [c[3]]);
}
/** The grip on her hand `R` as she has it where she takes the card, the card at `yaw` degrees in her fingers: the hand shape, and in the room its axes and wrist, the card's normal toward the fingertips (its back), the point under the fingertips on the card's middle plane, the way into the card from the edge she holds, and how far the thumb is from the card's other face. The thumb goes under the edge, its middle joint beyond it and under the card's face, its tip under the fingertips. */
function gripOf(R: Limb, pitch: number, yaw: number) {
  const a = axesOf(R.p, 1), n = turned(mul(a.palm, -1), a.across, rad(pitch)), sIn = turned(inPlane(a.forward, n), n, rad(yaw)), off = (S: Vec3[], k: number) => dot(placed(S, a, R.w)[k], n);
  const inHand = (q: Vec3): Vec3 => { const d = sub(q, R.w); return [dot(d, a.forward), dot(d, a.palm), dot(d, a.across)]; };
  let got: {shape: Vec3[]; a: Axes; w: Vec3; n: Vec3; sIn: Vec3; mid: Vec3; thumbGap: number} | null = null;
  for (const hold of HOLD) {
    const S = local(R.p, a); [hold, hold, ...FREE].forEach((b, f) => bendFinger(S, f + 1, b));
    // the middle finger's knuckle set so that its tip lies on the card as the forefinger's does
    let best = hold[0], cost = Infinity; for (let b0 = hold[0] - 30; b0 <= hold[0] + 30; b0 += 0.5) { const Q = S.map(q => [...q] as Vec3); bendFinger(Q, 2, [b0, hold[1], hold[2]]); const c = Math.abs(off(Q, 12) - off(Q, 8)); if (c < cost) { cost = c; best = b0; } }
    bendFinger(S, 2, [best, hold[1], hold[2]]);
    const p = placed(S, a, R.w), tips = mul(add(p[8], p[12]), 0.5), mid = sub(tips, mul(n, TIP + T / 2)), under = sub(tips, mul(n, 2 * TIP + T));
    // the two fingertips side by side on the card, both in from the edge she holds
    if (Math.abs(dot(sub(p[8], p[12]), sIn)) > TURN.sideBySide) continue;
    const L = length(sub(S[4], S[3]));
    for (const shift of TURN.thumbShifts) for (const slant of TURN.thumbSlants.map(rad)) for (const side of TURN.thumbSides.map(rad)) {
      const pad = add(under, mul(cross(n, sIn), shift)), back = turned(mul(sIn, -1), n, side), knuckle = sub(add(pad, mul(back, L * Math.cos(slant))), mul(n, L * Math.sin(slant)));
      const shape = thumbRound(S, inHand(knuckle), inHand(pad)), q = placed(shape, a, R.w), gap = length(sub(q[4], pad));
      // the bone from the thumb's knuckle to its middle joint crosses the card's plane past the edge she holds, clear of it
      const o2 = dot(sub(q[2], mid), n), o3 = dot(sub(q[3], mid), n), x = o2 * o3 < 0 ? lerp(q[2], q[3], o2 / (o2 - o3)) : null;
      if (x && dot(sub(x, mid), sIn) > -TURN.inset - BALL(2)) continue;
      if (!got || gap < got.thumbGap) got = {shape, a, w: R.w, n, sIn, mid, thumbGap: gap};
      if (gap < 0.0015) return got; }
  }
  return got;
}

/**
 * The motion (a deal done in "Naturlig", alone or with its return, on `doll`; beat `g` the frame the card goes into the
 * felt) with the card turned in her right hand as `turn` says; and what it did. The default gives the motion itself, untouched.
 */
export function turnedInHand<M extends {rests: number; beats?: {g: number}[]; frames: NaturalFrame[]}>(motion: M, doll: Doll, turn: TurnId): {motion: M; receipt: TurnReceipt | null} {
  if (turn === TURN_DEFAULT) return {motion, receipt: null};
  const F = motion.frames, last = F.length - 1, g = Math.min(last, Math.round(motion.beats?.[0]?.g ?? motion.rests));
  const not = (why: string) => ({motion, receipt: {id: turn, laid: false, why}});
  // ---- 1. when: her left hand lets go (the card then lies where it left it); her right comes to it; the card lies face up where the deal has it lie (`down`), standing on its edge `tip` frames before
  let leftOff = -1; for (let i = 0; i <= g; i++) if ([4, 8, 12, 16, 20].some(k => into(F[i].card, F[i].L.p[k], TIP + NATURAL.touch) > 0)) leftOff = i + 1;
  if (leftOff < 1) return not('her left hand never holds the card');
  const K0 = F[leftOff].card;
  if (K0.n[1] > -Math.cos(rad(5))) return not('the card is not face down when her left hand lets go');
  let down = -1; for (let i = leftOff; i <= last && down < 0; i++) if (F[i].card.n[1] >= Math.cos(rad(0.5)) && F[i].card.c[1] <= T / 2 + 0.0005) down = i;
  if (down < 0) return not('the card does not come to lie face up');
  const lying: Card = {...K0, c: [K0.c[0], T / 2, K0.c[2]], l: inPlane(K0.l, UP), n: mul(UP, -1)}, K1 = F[down].card;
  // (the deal slides it a few millimetres on once it lies, to where it lies still from `rests`: she lays it there, her hand carrying it the way as she lowers it)
  const still = Math.min(last, Math.max(down, Math.round(motion.rests))), Kend = F[still].card.n[1] >= Math.cos(rad(0.5)) && F[still].card.c[1] <= T / 2 + 0.0005 ? F[still].card : K1;
  const shift = (s: number) => mul(sub(Kend.c, K1.c), smooth(s));
  const nearIt = (q: Vec3) => { const [u, v] = onCard(lying, q); return Math.hypot(Math.max(0, Math.abs(u) - H), Math.max(0, Math.abs(v) - W)); };
  let comes = -1; for (let i = leftOff; i <= down && comes < 0; i++) if (nearIt(F[i].R.p[8]) <= TURN.near) comes = i;
  const take = Math.max(leftOff + TURN.drop + TURN.pick, comes), stands = down - TURN.tip, lies = down, long = doll.upperArm + doll.forearm - 0.002;
  if (comes < 0 || stands - take < TURN.minHeld) return not('her right hand has too little time between taking the card and laying it');
  const heldAt = (i: number) => smooth((i - take) / (stands - take)), tipAt = (i: number) => { const s = Math.max(0, Math.min(1, (i - stands) / (lies - stands))); return s * s * (2 - s); };
  const half = Math.round((take + stands) / 2), alpha = Math.PI - rad(TURN.held), tipAngle = (i: number) => alpha * (1 - tipAt(i));
  // (the grip is weighed held down to TURN.weighDown; the frames hold it rigidly until her fingertips come to the felt)
  let rel = stands + 1; while (rel < lies && tipAngle(rel) >= rad(TURN.weighDown)) rel++;

  // ---- 2. the grip, and the edge it stands on, for the least bent wrist
  const grips = new Map(TURN.pitches.flatMap(p => TURN.yaws.map(y => [`${p}/${y}`, gripOf(F[take].R, p, y)] as const)));
  const bendAt = (i: number, w: Vec3, a: Axes) => wristCost(bentFrom(a, w, elbowFor(F[i].R.s, w, sub(F[i].R.e, F[i].R.s), a, doll).e));
  const reach = (i: number, w: Vec3) => Math.max(0, length(sub(w, F[i].R.s)) - long);
  const under = (w: Vec3, p: Vec3[]) => Math.max(0, doll.shape.wristBall + TURN.wrist - w[1], ...p.map((q, k) => BALL(k) + TURN.felt - q[1]));
  const shape = (R: Limb) => local(R.p, axesOf(R.p, 1));
  /** Her hand holding the card as it tips over its edge on the felt (frame `i`), from where it stood: turned with the card about that edge. */
  const tipTurn = (gS: Hinge, i: number) => (v: Vec3) => turned(v, cross(UP, gS.o), tipAngle(i) - alpha);
  const heldTip = (i: number, gS: Hinge, aS: Axes, wS: Vec3, nearer: Vec3) => { const r = tipTurn(gS, i); return {a: turnAxes(aS, r), w: add(add(gS.at, r(sub(sub(wS, nearer), gS.at))), mul(nearer, 1 - smooth(tipAt(i))))}; };
  const tipCard = (s: number, g: Hinge, nearer: Vec3) => { const k = stoodOn(K1, g, alpha * (1 - s)); return {...k, c: add(k.c, mul(nearer, 1 - smooth(s)))}; };
  function tryGrip(takeBy: {o: Vec3; h: number}, standOn: Hinge, pitch: number, yaw: number, slide: number) {
    const gr = grips.get(`${pitch}/${yaw}`); if (!gr) return null; const picked = pickTilt(2 * takeBy.h - TURN.inset), Kt = liftedBy(lying, takeBy.o, takeBy.h, picked);
    const inward = turned(mul(takeBy.o, -1), cross(takeBy.o, UP), picked), back = mul(Kt.n, -1);
    const sIn = gr.sIn, cIn = add(add(gr.mid, mul(sIn, takeBy.h - TURN.inset)), mul(cross(gr.n, sIn), slide * ((takeBy.h === H ? W : H) - TURN.inset)));
    const q = (v: Vec3) => apply(fromTo([sIn, gr.n, cross(gr.n, sIn)], [inward, back, cross(back, inward)]), v);
    const aTake = turnAxes(gr.a, q), wTake = add(Kt.c, q(sub(gr.w, cIn))), pierce = pierced(Kt, placed(gr.shape, aTake, wTake));
    // held from where she takes it to where it stands: one turn (of the card's two ways round its face, the shorter)
    const Ks = stoodOn(K1, standOn, alpha), turns = [Kt.l, mul(Kt.l, -1)].map(l => axisAngle(fromTo(cardAxes(l, Kt.n), cardAxes(Ks.l, Ks.n))));
    const {axis: u, angle} = turns[0].angle <= turns[1].angle ? turns[0] : turns[1], by = (share: number) => (v: Vec3) => turned(v, u, share * angle);
    // her right hand turns the card with its forearm, thumb up (dot > 0: the right hand's supination about its own length)
    const own = dot(u, aTake.forward); if (own <= 0.2) return null;
    const aStand = turnAxes(aTake, by(1)), wThere = add(Ks.c, by(1)(sub(wTake, Kt.c)));
    // nearer her where her arm does not reach it there
    const toHer = sub(F[stands].R.s, wThere), past = length(toHer) - long + 0.003, flat = inPlane(toHer, UP), nearer = mul(flat, Math.min(TURN.shortOf, Math.max(0, past) / Math.max(0.3, dot(unit(toHer), flat))));
    const wStand = add(wThere, nearer);
    const base = (i: number) => add(F[i].R.w, lerp(sub(wTake, F[take].R.w), sub(wStand, F[stands].R.w), smooth((i - take) / (stands - take))));
    const aHalf = turnAxes(aTake, by(heldAt(half))), wHalf = base(half);
    // held as it tips over, to where she lets go
    const last = heldTip(rel - 1, standOn, aStand, wStand, nearer), lowest = Math.max(...Array.from({length: rel - stands}, (_, j) => { const h = heldTip(stands + j, standOn, aStand, wStand, nearer); return under(h.w, placed(gr.shape, h.a, h.w)); }));
    const parts = {own, bTake: bendAt(take, wTake, aTake), bHalf: bendAt(half, wHalf, aHalf), bStand: bendAt(stands, wStand, aStand), bLast: bendAt(rel - 1, last.w, last.a),
      pierce: 1e5 * pierce ** 2, thumb: (Math.max(0, gr.thumbGap - 0.0015) / 0.001) ** 2, felt: 1e4 * (under(wTake, placed(gr.shape, aTake, wTake)) ** 2 + 10 * under(wStand, placed(gr.shape, aStand, wStand)) ** 2 + 10 * lowest ** 2),
      reach: 1e5 * (reach(take, wTake) ** 2 + reach(half, wHalf) ** 2 + reach(stands, wStand) ** 2 + reach(rel - 1, last.w) ** 2), away: (length(sub(wTake, F[take].R.w)) / 0.1) ** 2 + (length(sub(wStand, F[stands].R.w)) / 0.1) ** 2, nearer: (length(nearer) / 0.02) ** 2};
    const cost = 10 * (1 - own) ** 2 + parts.pierce + parts.thumb + parts.bTake + parts.bHalf + parts.bStand + parts.bLast + parts.felt + parts.reach + parts.away + parts.nearer;
    return {parts, cost, pitch, yaw, slide, picked, takeBy, standOn, nearer, gr, Kt, by, angle, aTake, wTake, aStand, wStand, base};
  }
  let G: ReturnType<typeof tryGrip> | null = null;
  for (const takeBy of edgesOf(lying)) for (const standOn of hingesOf(K1)) for (const pitch of TURN.pitches) for (const yaw of TURN.yaws) for (const slide of TURN.slides) {
    const t = tryGrip(takeBy, standOn, pitch, yaw, slide); if (!t) continue; if (!G || t.cost < G.cost) G = t; }
  if (!G) return not('no grip turns the card with her forearm');
  const {gr, by, aTake, wTake, aStand, wStand, base, Kt} = G!, S = gr.shape, gS = G!.standOn, nearer = G!.nearer;
  // she holds it rigidly as it tips over its edge on the felt until her fingertips under it would go into the felt (and leaves herself two frames to slide them out)
  rel = lies; for (let i = stands + 1; i < lies; i++) { const h = heldTip(i, gS, aStand, wStand, nearer); if (under(h.w, placed(S, h.a, h.w)) > 0) { rel = i; break; } }
  rel = Math.max(stands + 1, Math.min(rel, lies - 2));
  /** A hand's balls along the fingers `fingers` (FINGERS: 0 the thumb … 4 the little finger): its joints past the knuckle and two points along each bone, each as thick as it is drawn. */
  const ballsOf = (p: Vec3[], fingers: number[]) => fingers.flatMap(f => { const c = FINGERS[f]; return [1, 2, 3].flatMap(m => [{q: p[c[m]], r: BALL(c[m])}, ...[1, 2].map(t => ({q: lerp(p[c[m - 1]], p[c[m]], t / 3), r: BALL(c[m])}))]); });
  /** Her thumb as the hand rule draws it (dealer3d/src/hand-rule.ts, DRAWN): balls close along its three bones. */
  const thumbOf = (p: Vec3[]) => [0, 1, 2].flatMap(m => Array.from({length: 9}, (_, t) => ({q: lerp(p[FINGERS[0][m]], p[FINGERS[0][m + 1]], t / 8), r: DRAWN.thumb[m]})));
  /** Where the card `at(x)` rests on the balls: the least angle x (radians, up to `most`) at which it is clear of every one and has each one inside its edges under it. */
  const restsOn = (at: (x: number) => Card, balls: {q: Vec3; r: number}[], most: number) => { const clear = (x: number) => { const k = at(x), down = k.n[1] < 0 ? 1 : -1;
    return balls.every(b => { const [u, v, w] = onCard(k, b.q); return into(k, b.q, b.r) <= 0 && (down * w > 0 || Math.abs(u) > H || Math.abs(v) > W); }); };
    if (clear(0)) return 0; if (!clear(most)) return most; let lo = 0, hi = most; for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (clear(m)) hi = m; else lo = m; } return hi; };

  // ---- 3. the frames
  const from = Math.max(0, take - TURN.comeIn), pickFrom = take - TURN.pick, hand: {w: Vec3; p: Vec3[]; a: Axes}[] = [], card: (Card | null)[] = [];
  // (a) she takes it: her thumb's tip slides along the felt and in under the card's edge, the edge riding up on it, her hand tipping with the card and her fingertips coming onto its back; the card leaves the felt only on her thumb
  const o = G!.takeBy.o, eT = cross(o, UP), pT = placed(S, aTake, wTake), padT = pT[4], xOut = (q: Vec3) => dot(sub(q, lying.c), o) - G!.takeBy.h;
  const xP = xOut(padT), x0 = BALL(4) + TURN.outside, yT = padT[1], yS = BALL(4) + TURN.skim;
  const padAt = (s: number) => { const x = x0 + (xP - x0) * smooth(s), y = x >= 0 || xP >= 0 ? yS : yS + (yT - yS) * Math.min(1, x / xP); return add(add(padT, mul(o, x - xP)), [0, y - yT, 0]); };
  const pickHand = (s: number, k: number) => { const r = (v: Vec3) => turned(v, eT, k * G!.picked * (smooth(s) - 1)), P = padAt(s), at = (q: Vec3) => add(P, r(sub(q, padT)));
    return {a: turnAxes(aTake, r), w: at(wTake), p: pT.map(at)}; };
  const pickTilted = (x: number) => liftedBy(lying, o, G!.takeBy.h, x), tiltOn = (p: Vec3[]) => restsOn(pickTilted, thumbOf(p), Math.PI / 3);
  // (on her thumb all the way: never lower than where it rests on it, and never lifted off it by more than the grip holds it off)
  const fix = G!.picked - tiltOn(pT), pickCard = (s: number, p: Vec3[]) => { const x = tiltOn(p); return pickTilted(Math.max(x, x + fix * smooth(s))); };
  const lowest = (h: {w: Vec3; p: Vec3[]}) => Math.min(h.w[1] - doll.shape.wristBall - TURN.wrist, ...h.p.map((q, k) => q[1] - BALL(k) - ([3, 4].includes(k) ? 0 : TURN.felt)));
  // (her hand tips with the card as far as nothing else of it goes into the felt or the card)
  const sOf = (i: number) => (i - pickFrom) / TURN.pick, pickS = Array.from({length: TURN.pick}, (_, j) => j / TURN.pick);
  const kappa = [1, 0.75, 0.5, 0.25, 0].find(k => pickS.every(s => { const h = pickHand(s, k); return lowest(h) >= Math.min(0, lowest({w: wTake, p: pT})) - 0.0005 && pierced(pickCard(s, h.p), h.p) <= 0.001; })) ?? 0;
  const holding = (i: number, w: Vec3) => { const r = by(heldAt(i)), a = turnAxes(aTake, r); return {a, w, p: placed(S, a, w), card: {...F[i].card, c: add(w, r(sub(Kt.c, wTake))), l: r(Kt.l), n: r(Kt.n)}}; };
  // lifted where the hand, the wrist or a corner of the card would go into the felt: widened, smoothed, coming in after she takes it and gone where it stands
  const corners = (c: Card) => [-1, 1].flatMap(u => [-1, 1].flatMap(v => [-1, 1].map(o => add(add(add(c.c, mul(c.l, u * H)), mul(cross(c.n, c.l), v * W)), mul(c.n, o * T / 2)))));
  const need: number[] = []; for (let i = take; i <= stands; i++) { const h = holding(i, base(i)); need.push(i === stands ? 0 : Math.max(under(h.w, h.p), ...corners(h.card).map(c => -c[1]))); }
  const wide = need.map((_, j) => Math.max(...need.slice(Math.max(0, j - TURN.spread), j + TURN.spread + 1)));
  const lift = wide.map((_, j) => { const s = wide.slice(Math.max(0, j - TURN.spread), j + TURN.spread + 1); return s.reduce((x, y) => x + y, 0) / s.length; })
    .map((x, j) => Math.max(need[j], x * Math.min(smooth((j + 1) / (TURN.spread + 1)), smooth((stands - take - j) / 3))));
  // her right hand comes in to beside the card's edge, her thumb's tip at the felt; the card falls straight onto the felt where her left hand let go of it
  const ready = pickHand(0, kappa), up = [0, lift[0], 0] as Vec3;
  for (let i = from; i <= pickFrom; i++) { const t = smooth((i - from + 1) / (pickFrom - from + 1)), R = F[i].R, aR = axesOf(R.p, 1), a = between(aR, ready.a, t), w = lerp(R.w, ready.w, t);
    hand.push({w, a, p: placed(shapeBetween(shape(R), S, t), a, w)}); card.push(i < leftOff ? null : {...lying, c: lerp(K0.c, lying.c, smooth((i - leftOff + 1) / TURN.drop))}); }
  // (the card lies on the felt until the tip of her thumb is in under it; from there it rests on her thumb, lifted with her hand)
  for (let i = pickFrom + 1; i < take; i++) { const s = sOf(i), h = pickHand(s, kappa), v = mul(up, smooth(s)), k = pickCard(s, h.p), [tu, tv, tw] = onCard(k, h.p[4]);
    hand.push({a: h.a, w: add(h.w, v), p: h.p.map(q => add(q, v))}); card.push(Math.abs(tu) <= H && Math.abs(tv) <= W && tw * -Math.sign(k.n[1]) > 0 ? {...k, c: add(k.c, v)} : lying); }
  for (let i = take; i <= stands; i++) { const h = holding(i, add(base(i), [0, lift[i - take], 0])); hand.push(h); card.push(h.card); }
  // (b) she lays it: held as it tips over its edge on the felt until her hand would come to the felt (`rel`). From there her two fingertips stay under
  // it where they hold it and her hand turns about them over the edge she holds (her wrist rising), her thumb brought onto its face where it reaches, the
  // card tipping down on them as far as her hand stays out of the felt and the card and within her reach; then they slide out from under that edge,
  // toward her, and it lies.
  for (let i = stands + 1; i < rel; i++) { const h = heldTip(i, gS, aStand, wStand, nearer); card.push(tipCard(tipAt(i), gS, nearer)); hand.push({...h, p: placed(S, h.a, h.w)}); }
  const eS = cross(UP, gS.o), tipsOf = (p: Vec3[]) => mul(add(p[8], p[12]), 0.5), standing = (x: number) => stoodOn(K1, gS, x);
  type Hand = {a: Axes; w: Vec3; p: Vec3[]};
  /** Her hand holding the card at `x` (radians from lying) as it held it where it stood, `near` nearer her with the card. */
  const rigid = (x: number, near: Vec3, Sh = S): Hand => { const r = (v: Vec3) => turned(v, eS, x - alpha), a = turnAxes(aStand, r), w = add(add(gS.at, r(sub(sub(wStand, nearer), gS.at))), near); return {a, w, p: placed(Sh, a, w)}; };
  /** Her ring and little fingers curled in as she lays it. */
  const curledIn = S.map(q => [...q] as Vec3); bendFinger(curledIn, 3, TURN.curlIn); bendFinger(curledIn, 4, TURN.curlIn);
  const cardAt = (x: number, near: Vec3): Card => { const k = standing(x); return {...k, c: add(k.c, near)}; };
  /** That hand turned `th` (radians: about the card's length, the normal of its face and across it, in turn) about the middle of her two fingertips. */
  const about = (h: Hand, k: Card, th: number[]): Hand => { const t = tipsOf(h.p), axes = [k.l, k.n, cross(k.n, k.l)], r = (v: Vec3) => axes.reduce((o, ax, j) => th[j] ? turned(o, ax, th[j]) : o, v);
    return {a: turnAxes(h.a, r), w: add(t, r(sub(h.w, t))), p: h.p.map(q => add(t, r(sub(q, t))))}; };
  /** Her thumb brought onto the card's face (k) over where its tip is, its tip turned at the middle joint and the joints before (thumbRound): the hand. */
  const thumbOn = (h: Hand, k: Card): Hand => { const [u, v] = onCard(k, h.p[4]), at = add(add(add(k.c, mul(k.l, Math.max(-H + TURN.inset, Math.min(H - TURN.inset, u)))), mul(cross(k.n, k.l), Math.max(-W + TURN.inset, Math.min(W - TURN.inset, v)))), mul(k.n, T / 2 + TIP));
    const inHand = (q: Vec3): Vec3 => { const d = sub(q, h.w); return [dot(d, h.a.forward), dot(d, h.a.palm), dot(d, h.a.across)]; }, by = sub(at, h.p[4]);
    return {...h, p: placed(thumbRound(local(h.p, h.a), inHand(add(h.p[3], by)), inHand(at)), h.a, h.w)}; };
  /** How far a hand is in the felt or the card or beyond her reach in frame `i`, metres, the worst: of its palm, thumb and the two fingers that hold (`free`: of the free two, which the hand rule lays after). */
  const faultOf = (i: number, h: Hand, k: Card, fingers = [0, 1, 2]) => { const B = [{q: h.p[1], r: BALL(1)}, ...[5, 9, 13, 17].map(j => ({q: h.p[j], r: BALL(j)})), ...ballsOf(h.p, fingers)].slice(fingers.includes(1) ? 0 : 5), tips = [h.p[8], h.p[12]];
    return Math.max(0, ...(fingers.includes(1) ? [doll.shape.wristBall + TURN.wrist - h.w[1], length(sub(h.w, F[i].R.s)) - long] : []), ...B.map(b => b.r + (tips.includes(b.q) ? TURN.skim : TURN.felt) - b.q[1]), ...B.map(b => into(k, b.q, b.r - 0.0005))); };
  /** The hand for frame `i` with the card at `x`: turned about her fingertips as little from `th0` as keeps it clear (searched, then refined), and how far it is not. */
  const layHand = (i: number, x: number, near: Vec3, th0: number[]) => { const k = cardAt(x, near), h0 = rigid(x, near, shapeBetween(S, curledIn, smooth((i - rel + 1) / (lies - rel))));
    const at = (th: number[]) => { const h1 = about(h0, k, th), h2 = thumbOn(h1, k), f1 = faultOf(i, h1, k), f2 = faultOf(i, h2, k), [h, f] = f2 <= f1 + 0.0002 ? [h2, f2] : [h1, f1];
      const b = wristCost(bentFrom(h.a, h.w, elbowFor(F[i].R.s, h.w, sub(F[i].R.e, F[i].R.s), h.a, doll).e)), free = faultOf(i, h, k, [3, 4]);
      return {h, th, f, cost: (Math.max(0, f - 0.0002) / 0.00005) ** 2 + (free / 0.0005) ** 2 + th.reduce((s, t, j) => s + ((t - th0[j]) / rad(TURN.layTurn)) ** 2, 0) + b}; };
    let best = at(th0); const D = rad(TURN.layStep);
    for (let a = -2; a <= 25; a++) for (let b = -4; b <= 4; b++) for (let c = -4; c <= 4; c++) { const t = at([th0[0] + a * D, th0[1] + b * D, th0[2] + c * D]); if (t.cost < best.cost) best = t; }
    for (let d = D / 2; d >= rad(0.5); d /= 2) for (let pass = 0; pass < 3; pass++) for (let j = 0; j < 3; j++) for (const s of [-1, 1]) { const th = [...best.th]; th[j] += s * d; const t = at(th); if (t.cost < best.cost) best = t; }
    return {...best, k}; };
  // lowered as far as its tip-over has it each frame, or as far as her hand can follow (halved back toward the frame before where it cannot)
  const angleR = tipAngle(rel - 1), xFloor = (() => { let lo = 0, hi = angleR; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (tipsOf(rigid(m, [0, 0, 0]).p)[1] > BALL(8) + TURN.skim) hi = m; else lo = m; } return hi; })();
  let th: number[] = [0, 0, 0], xWas = angleR, heldTo = angleR;
  for (let i = rel; i < lies - 1; i++) { const near = add(mul(nearer, 1 - smooth(tipAt(i))), shift(tipAt(i)));
    let x = Math.max(xFloor, tipAngle(i)), got = layHand(i, x, near, th);
    if (got.f > TURN.clear) { let ok = {x: xWas, got: layHand(i, xWas, near, th)}, lo = x, hi = xWas; for (let n = 0; n < 5; n++) { const m = (lo + hi) / 2, t = layHand(i, m, near, th); if (t.f <= TURN.clear) { ok = {x: m, got: t}; hi = m; } else lo = m; }
      if (ok.got.f <= TURN.clear || ok.got.f < got.f) ({x, got} = ok); }
    th = got.th; xWas = heldTo = x; hand.push(got.h); card.push(got.k); }
  // her fingertips slide out from under the edge nearest them where it will lie, toward her, low over the felt; the card falls from where they held it, and lies
  { const hL = hand[hand.length - 1], tips = (h: Hand) => [h.p[8], h.p[12]], across = cross(Kend.n, Kend.l), toHer = inPlane(sub(F[lies].R.s, Kend.c), UP);
    const ways = [{o: Kend.l, h: H}, {o: mul(Kend.l, -1), h: H}, {o: across, h: W}, {o: mul(across, -1), h: W}].map(e => ({...e, d: Math.max(...tips(hL).map(q => e.h - dot(sub(q, Kend.c), e.o)))}));
    const nearAt = (i: number) => add(mul(nearer, 1 - smooth(tipAt(i))), shift(tipAt(i)));
    const way = ways.reduce((x, y) => y.d - 0.01 * dot(y.o, toHer) < x.d - 0.01 * dot(x.o, toHer) ? y : x), near = sub(nearAt(lies - 1), nearAt(lies - 2));
    const falling = cardAt(TURN.falls * heldTo, nearAt(lies - 1));
    // (far enough that no bone of her hand crosses the card's face less than its thickness outside the card's edges, falling or lying, with TURN.spare to
    // spare: the landing, dealer3d/src/landing.ts, comes in from two frames before beat g and moves her hand a little toward its end pose then)
    const crosses = (h: Hand, k: Card) => FINGERS.some(c => [0, 1, 2].some(j => { const r = BALL(c[j + 1]) + TURN.spare, [u0, v0, o0] = onCard(k, h.p[c[j]]), [u1, v1, o1] = onCard(k, h.p[c[j + 1]]); if (o0 * o1 > 0) return Math.min(...[h.p[c[j]], h.p[c[j + 1]]].map(q => into(k, q, r - 0.0005))) > 0;
      const t = o0 / (o0 - o1); return Math.abs(u0 + t * (u1 - u0)) < H + r && Math.abs(v0 + t * (v1 - v0)) < W + r; }));
    /** Whether a bone of her hand goes through the card from one frame to the next: a point along it on one side of the card's face in the one and on the other in the next, within its edges (and a little more). */
    const passes = (h0: Hand, k0: Card, h1: Hand, k1: Card) => FINGERS.some(c => [0, 1, 2].some(j => [0, 1, 2, 3].some(t => { const a = onCard(k0, lerp(h0.p[c[j]], h0.p[c[j + 1]], t / 3)), b = onCard(k1, lerp(h1.p[c[j]], h1.p[c[j + 1]], t / 3)); if (a[2] * b[2] >= 0) return false;
      const m = a[2] / (a[2] - b[2]); return Math.abs(a[0] + m * (b[0] - a[0])) < H + TURN.outside && Math.abs(a[1] + m * (b[1] - a[1])) < W + TURN.outside; })));
    const kL = card[card.length - 1]!, lift: Vec3 = [0, TURN.outside, 0], lifted = (h: Hand): Hand => ({a: h.a, w: add(h.w, lift), p: h.p.map(q => add(q, lift))});
    const through = (h: Hand) => crosses(h, falling) || crosses(h, Kend) || passes(hL, kL, h, falling) || passes(h, falling, lifted(h), Kend);
    let d = way.d + TIP + TURN.outside; const moved = (y: number): Hand => { const v = add(add(mul(way.o, d), near), [0, y, 0]); return {a: hL.a, w: add(hL.w, v), p: hL.p.map(q => add(q, v))}; };
    while (d < way.d + 0.06 && through(moved(0))) d += 0.001;
    let y = 0; for (let n = 1; n <= 20; n++) { const yn = (BALL(8) + TURN.skim - Math.min(...tips(hL).map(q => q[1]))) * n / 20, h = moved(yn); if (Math.max(faultOf(lies, h, Kend), faultOf(lies, h, Kend, [3, 4])) > TURN.clear || through(h)) break; y = yn; }
    const out = moved(y);
    hand.push(out); card.push(falling);
    hand.push(lifted(out)); card.push(Kend); }
  // (c) once it lies, her hand lifts off it and turns back to the deal's, lifted as it goes; the card lies still
  const backTo = Math.min(last, Math.max(lies + TURN.back, still)), hE = hand[hand.length - 1], SE = local(hE.p, hE.a);
  for (let i = lies + 1; i < backTo; i++) { const R = F[i].R, t = smooth((i - lies) / (backTo - lies)), a = between(hE.a, axesOf(R.p, 1), t), w = add(lerp(hE.w, R.w, t), [0, TURN.rise * Math.sin(Math.PI * t), 0]);
    hand.push({a, w, p: placed(shapeBetween(SE, shape(R), t), a, w)}); card.push(Kend); }
  const held = (i: number) => i > pickFrom && i <= lies, carried = (j: number) => from + j > pickFrom && from + j < lies - 1 && card[j] !== lying;
  // ---- 4. her arm to the hand: no further than it reaches (the card with it where it is in her hand)
  let shortMm = 0; hand.forEach((h, j) => { const i = from + j, R = F[i].R, far = length(sub(h.w, R.s));
    if (far > long) { const step = sub(add(R.s, mul(unit(sub(h.w, R.s)), long)), h.w); shortMm = Math.max(shortMm, mm(far - long)); h.w = add(h.w, step); h.p = h.p.map(q => add(q, step)); const c = card[j]; if (c && carried(j)) card[j] = {...c, c: add(c.c, step)}; } });
  // where her hand would go into the card, coming to it or once it lies (a joint, or a bone between two), it is taken out on the side it is on; nor into the felt
  const along = (p: Vec3[]) => FINGERS.flatMap(c => c.slice(0, 3).flatMap((k, m) => [1, 2].map(t => ({q: lerp(p[k], p[c[m + 1]], t / 3), r: BALL(c[m + 1])}))));
  const outOf = (h: {w: Vec3; p: Vec3[]}, j: number): Vec3 => { const i = from + j, c = card[j] ?? F[i].card; if (held(i)) return [0, 0, 0];
    const clearAt = (v: Vec3) => { const p = h.p.map(q => add(q, v)), w = add(h.w, v); return under(w, p) <= 0 && Math.max(...[...p.slice(1).map((q, k) => into(c, q, BALL(k + 1))), ...along(p).map(b => into(c, b.q, b.r))]) <= 0.001; };
    if (clearAt([0, 0, 0])) return [0, 0, 0];
    // the shortest step that clears both: off either face of the card, out past its edge toward her wrist, or up
    const ways = [c.n, mul(c.n, -1), inPlane(sub(h.w, c.c), c.n), UP];
    for (let d = 0.0005; d <= 0.06; d += 0.0005) for (const way of ways) if (clearAt(mul(way, d))) return mul(way, d);
    return [0, under(h.w, h.p), 0]; };
  const move = (h: {w: Vec3; p: Vec3[]}, v: Vec3) => { h.w = add(h.w, v); h.p = h.p.map(q => add(q, v)); };
  // the steps smoothed over the frames next to each (the falling card would have her hand jump from one way out to another), then whatever is still in the card taken out again
  const steps = hand.map(outOf), smoothed = steps.map((v, j) => mul(add(add(steps[Math.max(0, j - 1)], mul(v, 2)), steps[Math.min(steps.length - 1, j + 1)]), 0.25));
  hand.forEach((h, j) => { const i = from + j; if (held(i)) return; move(h, smoothed[j]); move(h, outOf(h, j)); });
  // the elbow turned to bend the wrist least, smoothly
  const turnsOf = hand.map((h, j) => elbowFor(F[from + j].R.s, h.w, sub(F[from + j].R.e, F[from + j].R.s), h.a, doll).turn * Math.min(1, (j + 1) / 4, (hand.length - j) / 4));
  const eased = turnsOf.map((_, j) => { const s = turnsOf.slice(Math.max(0, j - 2), j + 3); return s.reduce((x, y) => x + y, 0) / s.length; });
  const frames = F.map((f, i) => {
    if (i < from || i >= from + hand.length) return f;
    const j = i - from, h = hand[j], R = f.R, e = arm(R.s, h.w, turned(sub(R.e, R.s), unit(sub(h.w, R.s)), eased[j]), doll).elbow, c = i === lies ? Kend : card[j];
    return {...f, R: {...R, e: round(e), w: round(h.w), p: h.p.map(round)}, ...(c ? {card: {...c, c: round(c.c), l: round(unit(c.l)), n: round(unit(c.n))}} : {})};
  });

  // ---- 5. what it did
  const bentIn = (fs: NaturalFrame[]) => (i: number) => { const f = fs[i]; return deg(Math.sqrt(wristCost(bentFrom(axesOf(f.R.p, 1), f.R.w, f.R.e))) * NATURAL.wrist.dev); };
  const heldLast = lies - 2, bent = bentIn(frames), was = bentIn(F), span = Array.from({length: heldLast + 1 - take}, (_, j) => take + j), Kl = frames[heldLast].card;
  const inAll = Math.min(...[Kt.l, mul(Kt.l, -1)].map(l => axisAngle(fromTo(cardAxes(l, Kt.n), cardAxes(Kl.l, Kl.n))).angle));
  const wristOf = (b: (i: number) => number): Wrist => ({take: b(take), half: b(half), stands: b(stands), letGo: b(heldLast), most: Math.max(...span.map(b))});
  const roll = (i: number) => { const f = frames[i], d = unit(sub(f.R.w, f.R.e)), a = axesOf(f.R.p, 1), r1 = unit(sub(UP, mul(d, dot(UP, d)))), pp = sub(a.palm, mul(d, dot(a.palm, d))); return Math.atan2(dot(pp, cross(d, r1)), dot(pp, r1)); };
  let rolled = 0; for (const i of span.slice(1)) rolled += ((roll(i) - roll(i - 1) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const apart = Math.min(...Array.from({length: take - leftOff + 3}, (_, j) => frames[Math.min(last, leftOff - 2 + j)]).map(f => handsApart(f)));
  return {motion: {...motion, frames}, receipt: {id: turn, laid: true, leftOff, take, stands, letGo: lies - 1, letGoDeg: deg(heldTo), lies, edge: G!.takeBy.h === W ? 'long' : 'short', standsOn: G!.standOn.corner ? 'corner' : G!.standOn.toward % 180 === 0 ? 'short' : 'long', toward: G!.standOn.toward,
    yaw: G!.yaw, pitch: G!.pitch, slide: G!.slide, held: deg(G!.angle), heldInAll: deg(inAll), picked: deg(G!.picked), thumbGapMm: mm(gr.thumbGap), liftMm: mm(Math.max(...lift)),
    wrist: wristOf(bent), wristBefore: wristOf(was),
    rolled: deg(Math.abs(rolled)), apartMm: mm(apart), nearerMm: mm(length(G!.nearer)), shortMm}};
}
