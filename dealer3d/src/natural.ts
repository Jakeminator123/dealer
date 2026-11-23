// The natural pose (Jakob 2026-11-23, the doll lab: "vissa aningen konstiga ställningar görs lite naturligare som standard").
// A deal posed on a doll (dealer3d/page/pose-on-doll.ts) moved on as a person moves: the hands hand the card over without
// meeting (the recipe's change, `naturalPace`), and after the posing (`natural`):
// - the steering of her body (lean, twist, shoulders) is laid on the doll herself, as far as her arms still reach the
//   card, so that a slider never makes the deal fail; how much of it she could take stands in the receipt;
// - each shoulder goes a little toward its hand when the arm reaches far (the shoulder blade follows the arm);
// - each elbow turns about the line from shoulder to wrist to where the wrist is least bent, the arm stays out of her
//   trunk and over the felt, and the elbow is nearest her own pole (where hers hang);
// - the right thumb pinches the card opposite the forefinger (under the card in the air, at its edge on the felt), and
//   the free fingers (ring, little) change shape with the phase: open as the hand reaches, curled as it holds.
// The wrists and the card stay where they are: the card goes the same way to the same place. The first frame stays the
// anchor's and, when nothing is steered, the last frame stays the deal's (what the pose adds by itself fades out over the
// last `settle` frames). Pure: no I/O and no three.js.
import {CARD, add, cross, dot, length, mul, sub, unit, type Lens, type Vec3} from './camera.ts';
import {arm, turned} from './body.ts';
import {elbowPolesAt, type Doll} from './doll.ts';
import {FINGERS} from './capture.ts';
import {axesOf} from './hand-pose.ts';
import {dealerEdge} from './world.ts';
import type {Pace} from './two-hand.ts';

type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
type Card = {c: Vec3; l: Vec3; n: Vec3; id: number};
export type NaturalFrame = {card: Card; L: Limb; R: Limb; h: Vec3; g?: Vec3};
type Beats = {b: number; d: number; e: number; l: number; g: number; h: number; i: number | null};
export type NaturalMotion = {hip: Vec3; doll?: string; beats?: Beats[]; frames: NaturalFrame[]};
/**
 * What the lab steers on the doll: `body` degrees [sideways toward seat 7, the right shoulder forward, forward] on top
 * of what the deal gives her, in the sense of Pace.body and the lab's sliders, coming in as the deal's own body does (from
 * beat b to beat g); `shoulderR`/`shoulderL` centimetres [up, forward] of each shoulder and `elbowOut` degrees [right,
 * left] each elbow turns out from her side, both in by the hand change. `follow` (the shoulder follows the arm) and
 * `pinch` (thumb and free fingers) are on unless set false. `flatHand` (Jakob 2026-11-23 on the film to P5.C1: "prova
 * bara röra om filmen så hennes högerhand inte är så vriden vid nedsläpp"; off unless set true): the right hand that lays
 * the card turned on it about the card's normal through its forefinger's tip, to where her wrist is least bent (palm
 * down, pointing along her forearm), as far as her arm reaches; it comes in over the second half of the card's turn in
 * the air (from the frame the card stands on its edge) and is whole when the card is down, and goes out again as the
 * pose's own additions go. The card, its turn and her left hand are as they are. `steerOut` [from, to]: frames over
 * which what is steered (body, shoulders, elbows out) goes out again, as in a deal's return to its first frame
 * (dealer3d/tools/docka-cykel.ts); without it it stays to the last frame.
 */
export type NaturalSteer = {body?: [number, number, number] | null; shoulderR?: [number, number]; shoulderL?: [number, number]; elbowOut?: [number, number]; follow?: boolean; pinch?: boolean; flatHand?: boolean; steerOut?: [number, number]};

export const NATURAL = {
  /** The hand change: where the left fingertips lie on the card (metres from its middle toward the shoe's end, and across), and the left hand's way back. Measured on paow 2026-11-23: with this alone no frame of any place has the hands nearer than 16 mm, and with the deeper grip below 10 mm (before: through each other at 13 of 15 places). */
  change: {shared: {along: 0.035, across: -0.035, arc: [0.04, 0.12, -0.06] as Vec3}, leftFeed: {along: -0.026, across: 0}, leftArc: [0.04, 0.08, -0.04] as Vec3},
  /** The shoulder toward its hand: at most `forward`, `inward` and `outward` metres in her trunk's own directions and `up`, from `from` (and `upFrom`) of the arm's full length to all of it. */
  follow: {forward: 0.03, inward: 0.015, outward: 0.01, up: 0.012, from: 0.62, upFrom: 0.8},
  /** The wrist (radians): bent sideways or up and down this far costs as much as an elbow turned `pole` from her own pole; beyond `devMost` and `flexMost` it costs fast. */
  wrist: {dev: 0.35, flex: 0.8, devMost: 0.45, flexMost: 1.1}, pole: 0.7,
  /** The elbow turns at most `elbowMost` radians from where the deal has it, tried in `elbowSteps` steps each way. */
  elbowMost: 0.5, elbowSteps: 12,
  /** The pinch: the thumb's tip at least `inFromEdge` in from the card's edge; the hand goes up to `deeper` metres further over the card where the thumb would not reach it, until the tip is within `close`, and no nearer her other hand than `apart`. The thumb begins to close `lead` frames before the forefinger touches the card, so that both are on it from the first frame the forefinger is, and opens as many frames after it lets go. Before the right hand takes the card its fingers wait `wait` off it until the thumb reaches it too. */
  grip: {inFromEdge: 0.006, deeper: 0.025, close: 0.002, apart: 0.012, lead: 5, wait: 0.0035},
  /** Frames over which the body's share and the elbow's turn are evened out. */
  smooth: {body: 8, elbow: 3},
  /** Radians the ring and little fingers curl in each phase: as the hand reaches for the card, while it holds it, as it lays it, and after. */
  curl: {reach: -0.08, hold: 0.35, lay: 0.15, free: -0.05},
  settle: 6, tip: 0.0082, touch: 0.003,
  /** flatHand: the right hand turned on the card at most `most` radians each way, tried every `step`, and its wrist no nearer the end of her reach than `margin` (or where it already is); the turn evened out over `smooth` frames each side. */
  flat: {most: 1.6, step: 0.01, margin: 0.003, smooth: 2},
};

/** The recipe's flags with the natural hand change: the shared change's fingertips and way back, or the roll's. Without it the recipe lays the deal it always laid. */
export function naturalPace(pace: Pace): Pace {
  const c = NATURAL.change;
  if (pace.contactGrip === 'sweep' && pace.sharedChange) return {...pace, shared: {...pace.shared, ...c.shared}};
  return {...pace, leftFeed: c.leftFeed, leftArc: c.leftArc};
}

const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => Math.round(r * 1800 / Math.PI) / 10, mm = (m: number) => Math.round(m * 10000) / 10;
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x)), smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const round = (v: Vec3): Vec3 => v.map(x => Math.round(x * 10000) / 10000) as Vec3;
const mid = (a: Vec3, b: Vec3) => mul(add(a, b), 0.5), lerp = (a: Vec3, b: Vec3, t: number) => add(a, mul(sub(b, a), t));
const box = (xs: number[], r: number) => xs.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - r); j <= Math.min(xs.length - 1, i + r); j++) { s += xs[j]; n++; } return s / n; });
const least = (xs: number[], r: number) => xs.map((_, i) => Math.min(...xs.slice(Math.max(0, i - r), i + r + 1)));

// ---- the hands, the card and the trunk as measures --------------------------------------------------------------------
const BONES: [number, number][] = FINGERS.flatMap(c => [[0, c[0]] as [number, number], ...[0, 1, 2].map(k => [c[k], c[k + 1]] as [number, number])]);
const segments = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3) => {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r0 = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r0), c = dot(d1, r0), b = dot(d1, d2), den = a * e - b * b;
  let s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
  return length(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t)))); };
/** The least gap between the two hands, metres: between their bones as drawn (8 mm thick); under nought they are in each other. */
export const handsApart = (f: {L: {p: Vec3[]}; R: {p: Vec3[]}}): number => { let g = Infinity; for (const [a, b] of BONES) for (const [c, d] of BONES) g = Math.min(g, segments(f.R.p[a], f.R.p[b], f.L.p[c], f.L.p[d])); return g - 2 * NATURAL.tip; };
/** A point in the card's own measures: along its long side, across it, and off its face (positive on the side its normal points to). */
const onCard = (card: Card, q: Vec3): Vec3 => { const d = sub(q, card.c), across = cross(card.n, card.l); return [dot(d, card.l), dot(d, across), dot(d, card.n)]; };
/** How far a fingertip at `q` is from the card, metres: from the surface of its ball (radius `tip`) to the card's face or edge; nought where it touches or is in it. */
export const cardGap = (card: Card, q: Vec3): number => { const [u, v, o] = onCard(card, q); return Math.max(0, Math.hypot(Math.max(0, Math.abs(u) - CARD.height / 2), Math.max(0, Math.abs(v) - CARD.width / 2), Math.max(0, Math.abs(o) - CARD.thickness / 2)) - NATURAL.tip); };
const TIPS = FINGERS.map(c => c[3]), NAMES = ['tummen', 'pekfingret', 'långfingret', 'ringfingret', 'lillfingret'];
export type Touch = {hand: 'R' | 'L'; finger: number; name: string; at: Vec3; along: number; across: number};
/** The fingertips that touch the card: within their own radius and `touch` of its face, over it or at its edge; where on the card each lies (metres from its middle). */
export function touching(f: NaturalFrame): Touch[] {
  const out: Touch[] = [], H = CARD.height / 2, W = CARD.width / 2;
  for (const hand of ['R', 'L'] as const) TIPS.forEach((k, n) => { const q = f[hand].p[k], [u, v] = onCard(f.card, q);
    if (cardGap(f.card, q) <= NATURAL.touch) out.push({hand, finger: n, name: NAMES[n], at: add(add(f.card.c, mul(f.card.l, clamp(u, -H, H))), mul(cross(f.card.n, f.card.l), clamp(v, -W, W))), along: Math.round(u * 1000) / 1000, across: Math.round(v * 1000) / 1000}); });
  return out; }
/** How many bones of the hand `p` go through the card (one end on each side of it, through its face). */
export const throughCard = (card: Card, p: Vec3[]): number => BONES.filter(([a, b]) => { const A = onCard(card, p[a]), B = onCard(card, p[b]), t = CARD.thickness / 2;
  if (!((A[2] > t && B[2] < -t) || (A[2] < -t && B[2] > t))) return false; const k = A[2] / (A[2] - B[2]), u = A[0] + (B[0] - A[0]) * k, v = A[1] + (B[1] - A[1]) * k;
  return Math.abs(u) < CARD.height / 2 - 0.001 && Math.abs(v) < CARD.width / 2 - 0.001; }).length;
/** Her trunk at a frame: hip, axes (across to her left, up the spine, forward) and its size. */
const trunkAt = (hip: Vec3, sR: Vec3, sL: Vec3) => { const m = mid(sR, sL), y = unit(sub(m, hip)), xr = sub(sL, sR), x = unit(sub(xr, mul(y, dot(xr, y)))); return {hip, x, y, z: cross(x, y), tall: length(sub(m, hip)), span: length(xr)}; };
type Trunk = ReturnType<typeof trunkAt>;
/** How deep a ball of radius `r` at `q` is in the doll's trunk (metres; nought when outside it). */
const inTrunk = (doll: Doll, t: Trunk, q: Vec3, r: number): number => { const d = sub(q, t.hip), h = dot(d, t.y) / t.tall, x = dot(d, t.x), z = dot(d, t.z), k = doll.shape.trunk;
  let w: number, deep: number;
  if (k.kind === 'egg') { const s = 1 - ((h - k.at) / k.tall) ** 2; if (s <= 0) return 0; w = k.wide * t.span * Math.sqrt(s); deep = k.deep * Math.sqrt(s); }
  else { const p = k.profile; if (h <= p[0][0] || h >= p[p.length - 1][0]) return 0; const j = p.findIndex(e => e[0] >= h), [h0, w0] = p[j - 1], [h1, w1] = p[j]; w = (w0 + (w1 - w0) * (h - h0) / (h1 - h0)) * t.span; deep = w * k.deep; }
  if (w <= 1e-4) return 0; const rho = Math.hypot(x / w, z / deep); return Math.max(0, r - (rho - 1) * Math.min(w, deep)); };
/** The deepest the arm from `s` by `e` to `w` is in her trunk: the forearm along its length, the upper arm from half way down (it hangs at her side above). */
const armInTrunk = (doll: Doll, t: Trunk, s: Vec3, e: Vec3, w: Vec3) => Math.max(...[0, 0.25, 0.5, 0.75].map(u => inTrunk(doll, t, lerp(e, w, u), (doll.shape.forearmRadius[0] + doll.shape.forearmRadius[1]) / 2)), ...[0.5, 0.75, 1].map(u => inTrunk(doll, t, lerp(s, e, u), (doll.shape.upperArmRadius[0] + doll.shape.upperArmRadius[1]) / 2)));
/** How the wrist is bent (radians): sideways and up or down, the forearm from `e` against the hand's own length. */
const wristBent = (l: Limb, sign: number, e: Vec3) => { const a = axesOf(l.p, sign), d = unit(sub(l.w, e)); return {dev: Math.atan2(dot(d, a.across), dot(d, a.forward)), flex: Math.atan2(dot(d, a.palm), dot(d, a.forward))}; };

// ---- the fingers ----------------------------------------------------------------------------------------------------
/** The chain `c` of hand `h` curled at its three joints about `axis` by `by` (radians; the last joint the less). */
const curlChain = (h: Vec3[], c: number[], axis: Vec3, by: number): Vec3[] => { const p = h.map(q => [...q] as Vec3), share = [1, 1, 0.7]; c.slice(0, 3).forEach((j, n) => { const pivot = p[j]; for (const m of c.slice(n + 1)) p[m] = add(pivot, turned(sub(p[m], pivot), axis, by * share[n])); }); return p; };
/** The axis the fingers bend about toward the palm (the line across the knuckles, the way round they are bent already). */
const bendAxis = (h: Vec3[]): Vec3 => { const across = unit(sub(h[17], h[5])), bent = FINGERS.slice(1).reduce((sum, c) => sum + [0, 1, 2].reduce((t, k) => t + dot(cross(sub(h[c[k]], h[k ? c[k - 1] : 0]), sub(h[c[k + 1]], h[c[k]])), across), 0), 0); return mul(across, bent < 0 ? -1 : 1); };
/** The thumb of `h` with its tip as near `target` as it reaches: curled or opened (about the axis it is bent about) until its tip is as far from its base as the target, then turned at its base to point at it. */
const thumbTo = (h: Vec3[], target: Vec3): Vec3[] => { const c = FINGERS[0], axis = cross(sub(h[c[1]], h[c[0]]), sub(h[c[3]], h[c[1]])); return chainTo(h, c, target, length(axis) > 1e-6 ? unit(axis) : bendAxis(h)); };
/** The finger `c` of `h` (its knuckle first) the same way, bent about `axis`. */
const chainTo = (h: Vec3[], c: number[], target: Vec3, axis: Vec3): Vec3[] => { const base = h[c[0]];
  const want = length(sub(target, base)); let best = 0, gap = Infinity;
  for (let by = -0.3; by <= 1.2001; by += 0.01) { const g = Math.abs(length(sub(curlChain(h, c, axis, by)[c[3]], base)) - want); if (g < gap) { gap = g; best = by; } }
  const p = curlChain(h, c, axis, best), was = unit(sub(p[c[3]], base)), to = unit(sub(target, base)), turn = cross(was, to), s = length(turn);
  if (s > 1e-9) { const ax = mul(turn, 1 / s), angle = Math.atan2(s, dot(was, to)); for (const j of c.slice(1)) p[j] = add(base, turned(sub(p[j], base), ax, angle)); }
  return p; };

/**
 * flatHand: the frames with the right hand turned on the card by `share(i)` of the turn about the card's normal, through
 * the forefinger's tip, at which her wrist is least bent (the elbow solved again toward her own pole, as pose-on-doll.ts
 * solves it); and the turn per frame, radians.
 */
function flatOnCard(frames: NaturalFrame[], doll: Doll, long: number, share: (i: number) => number) {
  const F = NATURAL.flat, W = NATURAL.wrist;
  const turnedBy = (f: NaturalFrame, a: number) => { const pivot = f.R.p[8], n = f.card.n, p = f.R.p.map(q => add(pivot, turned(sub(q, pivot), n, a))), w = add(pivot, turned(sub(f.R.w, pivot), n, a));
    return {p, w, e: arm(f.R.s, w, elbowPolesAt(doll, [f.R.s, f.L.s], [w, f.L.w])[0], doll).elbow}; };
  const bentAt = (f: NaturalFrame, h: ReturnType<typeof turnedBy>) => { const b = wristBent({...f.R, p: h.p, w: h.w}, 1, h.e); return (b.dev / W.dev) ** 2 + (b.flex / W.flex) ** 2; };
  const room = (f: NaturalFrame) => Math.max(long - F.margin, length(sub(f.R.w, f.R.s)));
  const best = frames.map((f, i) => { if (share(i) <= 0) return 0; let at = 0, c0 = bentAt(f, turnedBy(f, 0));
    for (let a = -F.most; a <= F.most + 1e-9; a += F.step) { const h = turnedBy(f, a); if (length(sub(h.w, f.R.s)) > room(f)) continue; const c = bentAt(f, h); if (c < c0) { c0 = c; at = a; } } return at; });
  const by = box(best, F.smooth).map((a, i) => a * share(i));
  return {turn: by, frames: frames.map((f, i) => { if (!by[i]) return f; let a = by[i], h = turnedBy(f, a);
    // (no further than her arm reaches: the turn taken back until it does)
    for (let n = 0; n < 20 && length(sub(h.w, f.R.s)) > room(f); n++) { a *= 0.9; h = turnedBy(f, a); } by[i] = a;
    return {...f, R: {...f.R, p: h.p.map(round), w: round(h.w), e: round(h.e)}}; })};
}

/** The motion `motion` (posed on `doll`) moved as a person moves it; and per frame what was done and measured. */
export function natural<M extends NaturalMotion>(lens: Lens, motion: M, doll: Doll, steer: NaturalSteer = {}) {
  const laid = motion.frames, N = laid.length, beat = motion.beats?.[0], hip = motion.hip, long = doll.upperArm + doll.forearm - 1e-4;
  const take = beat ? Math.max(8, beat.d) : 8, rest = beat ? Math.min(N - 1 - NATURAL.settle, Math.ceil(beat.h)) : N - 1 - NATURAL.settle, edge = dealerEdge(lens)[2];
  // (flatHand: in from the frame the card stands on its edge in its turn to the frame it is down, out as what the pose adds by itself goes)
  const edgeAt = beat && steer.flatHand ? laid.findIndex((f, i) => i > beat.d && f.card.n[1] >= 0) : -1;
  const flat = beat && edgeAt > 0 ? flatOnCard(laid, doll, long, i => smooth((i - edgeAt + 1) / Math.max(1, beat.g - edgeAt + 1)) * smooth((N - 1 - i) / Math.max(NATURAL.settle, N - 1 - rest))) : null;
  const frames = flat?.frames ?? laid;
  // What is steered comes in by the hand change and stays; what the pose adds by itself comes in as well and goes again while the card lies still, so that the last frame is the deal's own.
  const userAt = (i: number) => smooth(i / take), selfAt = (i: number) => userAt(i) * smooth((N - 1 - i) / Math.max(NATURAL.settle, N - 1 - rest));
  // (the body's steering comes in as the deal's own body does in dealer3d/src/two-hand.ts: from beat b, or the recipe's leanFrom, to beat g, where the card is laid)
  const leanFrom = (motion as {pace?: {leanFrom?: number}}).pace?.leanFrom ?? beat?.b ?? 0, leanTo = beat ? Math.max(leanFrom + 1, beat.g) : take, bodyIn = (i: number) => smooth((i - leanFrom) / (leanTo - leanFrom));
  // (steerOut: what is steered goes out again over those frames)
  const goes = (i: number) => steer.steerOut ? 1 - smooth((i - steer.steerOut[0]) / Math.max(1, steer.steerOut[1] - steer.steerOut[0])) : 1;
  const D = (steer.body ?? [0, 0, 0]).map(rad), sR = steer.shoulderR ?? [0, 0], sL = steer.shoulderL ?? [0, 0], out = (steer.elbowOut ?? [0, 0]).map(rad), follows = steer.follow !== false, pinches = steer.pinch !== false;
  const steered = D.some(x => x) || [...sR, ...sL].some(x => x) || out.some(x => x), F = NATURAL.follow, G = NATURAL.grip, H = CARD.height / 2, Wd = CARD.width / 2, tip = NATURAL.tip;

  // ---- 1. the right hand on the card: the grip a little deeper where the thumb needs it, the thumb opposite the forefinger, the free fingers by phase
  // The pinch is whole in every frame the forefinger is on the card (touching it as `touching` has it, or over its face a hair off, where it is laid on) and closes
  // over the `lead` frames before, opens over as many after; it fades out only while the card lies still at the end, so that the last frame is the deal's own, and is
  // nought in the first.
  const contact = frames.map(f => { const [u, v, o] = onCard(f.card, f.R.p[8]); return cardGap(f.card, f.R.p[8]) <= NATURAL.touch || (Math.abs(u) <= H + 0.003 && Math.abs(v) <= Wd + 0.003 && Math.abs(o) <= tip + 0.005 + CARD.thickness / 2); });
  const nearest = contact.map((_, i) => { let d = Infinity; contact.forEach((c, j) => { if (c) d = Math.min(d, Math.abs(i - j)); }); return d; });
  const ends = (i: number) => smooth(i / 3) * smooth((N - 1 - i) / Math.max(NATURAL.settle, N - 1 - rest));
  const held = nearest.map((d, i) => pinches ? smooth(1 - d / (G.lead + 1)) * ends(i) : 0);
  /** The face of the card the hand `p` is on: the side its knuckles are (1: the side the card's normal points to). */
  const sideOf = (card: Card, p: Vec3[]) => Math.sign([5, 9, 13, 17].reduce((s, k) => s + onCard(card, p[k])[2], 0)) || 1;
  /** The forefinger laid on the hand's face of the card, and the middle finger where its tip is in the card or through it, by `w` of the way (while the forefinger's tip is over the card). */
  const onFace = (card: Card, p: Vec3[], w: number): Vec3[] => { const side = sideOf(card, p), lie = tip + CARD.thickness / 2;
    for (const c of [FINGERS[1], FINGERS[2]]) { const [u, v, o] = onCard(card, p[c[3]]); if (Math.abs(u) > H + 0.002 || Math.abs(v) > Wd + 0.002 || (c === FINGERS[2] && o * side >= lie)) continue;
      p = chainTo(p, c, add(p[c[3]], mul(card.n, (side * lie - o) * w)), bendAxis(p)); }
    return p; };
  /** Where the thumb's tip goes for the hand `p`: against the card's edge that its base is beyond (the forefinger on the face, the thumb at the edge: the corner held between them), as near the thumb as is at least `inFromEdge` from the corner. */
  const aimFor = (card: Card, p: Vec3[]): Vec3 => { const across = cross(card.n, card.l), [a, b] = onCard(card, p[4]), [a1, b1] = onCard(card, p[1]), out = tip * 0.9;
    const [ea, eb] = Math.abs(a1) - H > Math.abs(b1) - Wd ? [(Math.sign(a1) || 1) * (H + out), clamp(b, -Wd + G.inFromEdge, Wd - G.inFromEdge)] : [clamp(a, -H + G.inFromEdge, H - G.inFromEdge), (Math.sign(b1) || 1) * (Wd + out)];
    const q = add(add(card.c, mul(card.l, ea)), mul(across, eb)); return [q[0], Math.max(q[1], tip), q[2]] as Vec3; };
  /** The hand moved by `by` metres over the card toward its middle (the grip that much deeper), and lifted off the card as far as its forefinger and middle finger need to lie on it rather than in it. */
  const deeperBy = (f: NaturalFrame, by: number): Vec3 => { if (!by) return [0, 0, 0]; const [u, v] = onCard(f.card, f.R.p[8]), across = cross(f.card.n, f.card.l), step = mul(unit(add(mul(f.card.l, -u), mul(across, -v))), by), side = sideOf(f.card, f.R.p), lie = tip + CARD.thickness / 2 + 0.002;
    const short = Math.max(0, ...[5, 6, 7, 9, 10, 11].map(k => { const [x, y, o] = onCard(f.card, add(f.R.p[k], step)); return Math.abs(x) < H && Math.abs(y) < Wd ? lie - o * side : 0; }));
    return add(step, mul(f.card.n, side * short)); };
  // (no deeper than her arm reaches, nor nearer her other hand than `apart`)
  // (worked out where the forefinger touches the card; a frame before or after takes the nearest such frame's, so that the hand comes to the card as deep as it will hold it)
  const touched = frames.map((f, i) => { if (!held[i] || !contact[i]) return null; for (let by = 0; by <= G.deeper + 1e-9; by += 0.0025) { const step = deeperBy(f, by), p = onFace(f.card, f.R.p.map(q => add(q, step)), 1), w = add(f.R.w, step);
    if (length(sub(w, f.R.s)) > long - 0.002 || (by && handsApart({R: {p}, L: f.L}) < G.apart)) return Math.max(0, by - 0.0025); if (length(sub(thumbTo(p, aimFor(f.card, p))[4], aimFor(f.card, p))) <= G.close) return by; } return G.deeper; });
  const deepest = touched.map((x, i) => { if (x !== null) return x; for (let d = 1; d <= G.lead + 1; d++) { const y = touched[i - d] ?? touched[i + d]; if (y !== null && y !== undefined) return y; } return 0; });
  const deeper = box(deepest, 3).map((x, i) => x * held[i]);
  const curls = box(frames.map((_, i) => !beat ? 0 : i < beat.d ? NATURAL.curl.reach * smooth((i - beat.b) / Math.max(1, beat.d - beat.b)) : i < beat.g ? NATURAL.curl.hold : i < (beat.i ?? N) ? NATURAL.curl.lay : NATURAL.curl.free), 3).map((x, i) => pinches ? x * selfAt(i) : 0);
  const thumbs: {was: number | null; now: number | null}[] = [];
  const hands = frames.map((f, i) => { let p = f.R.p, w = f.R.w; thumbs.push({was: null, now: null});
    if (curls[i]) { const axis = bendAxis(p), low = Math.min(...[16, 20].map(k => p[k][1])); for (let c = curls[i], n = 0; n < 4; n++, c /= 2) { const q = curlChain(curlChain(p, FINGERS[3], axis, c), FINGERS[4], axis, c); if (c < 0 || Math.min(...[16, 20].map(k => q[k][1])) >= Math.min(low, tip)) { p = q; break; } } }
    if (held[i] > 0) { const aim0 = aimFor(f.card, p); thumbs[i].was = mm(length(sub(p[4], aim0)));
      const step = deeperBy(f, deeper[i]); p = onFace(f.card, p.map(q => add(q, step)), held[i]); w = add(w, step);
      // (the thumb no nearer her other hand than `apart`, where the forefinger alone is not)
      const aim = aimFor(f.card, p), from = p, to = (share: number) => thumbTo(from, lerp(from[4], aim, share)), clear = (q: Vec3[]) => handsApart({R: {p: q}, L: f.L}) >= G.apart;
      p = to(held[i]); if (!clear(p) && clear(from)) { let lo = 0, hi = held[i]; for (let n = 0; n < 10; n++) { const m = (lo + hi) / 2; if (clear(to(m))) lo = m; else hi = m; } p = to(lo); }
      thumbs[i].now = mm(length(sub(p[4], aim)));
      // (before the right hand takes the card, its fingers wait a hair off it until the thumb is at it too: thumb and forefinger come to the card together)
      if (beat && i < beat.d && cardGap(f.card, p[4]) > NATURAL.touch) for (let n = 0; n < 3; n++) {
        const k = [8, 12, 16, 20].reduce((a, b) => cardGap(f.card, p[b]) < cardGap(f.card, p[a]) ? b : a), g = cardGap(f.card, p[k]); if (g >= G.wait - 1e-5) break;
        const [u, v, o] = onCard(f.card, p[k]), across = cross(f.card.n, f.card.l), at = add(add(add(f.card.c, mul(f.card.l, clamp(u, -H, H))), mul(across, clamp(v, -Wd, Wd))), mul(f.card.n, clamp(o, -CARD.thickness / 2, CARD.thickness / 2)));
        const away = length(sub(p[k], at)) > 1e-6 ? unit(sub(p[k], at)) : mul(f.card.n, sideOf(f.card, p)), by = mul(away, G.wait - g); p = p.map(q => add(q, by)); w = add(w, by); } }
    return p === f.R.p ? null : {p: p.map(round), w: round(w)}; });
  const wristR = (i: number) => hands[i]?.w ?? frames[i].R.w;

  // ---- 2. her trunk: the steering laid on as far as both arms still reach, each shoulder a little toward its hand
  /** Her shoulders and head at frame i when the steering is laid on `share` of the way. */
  const trunkPose = (i: number, share: number) => { const f = frames[i], t0 = trunkAt(hip, f.R.s, f.L.s), u = share * userAt(i) * goes(i), ub = share * bodyIn(i) * goes(i);
    const body = (q: Vec3) => { let d = sub(q, hip); d = turned(d, t0.y, D[1] * ub); d = turned(d, t0.z, -D[0] * ub); d = turned(d, t0.x, D[2] * ub); return add(hip, d); };
    let s: [Vec3, Vec3] = [body(f.R.s), body(f.L.s)]; const head = body(f.h), t = trunkAt(hip, s[0], s[1]);
    s = s.map((q, k) => { const w = k ? f.L.w : wristR(i), own = k ? sL : sR, side = k ? 1 : -1;
      let m = add(mul(t.y, own[0] / 100 * u), mul(t.z, own[1] / 100 * u));
      if (follows) { const r = length(sub(w, q)) / long, toward = sub(w, q), flat = unit(sub(toward, mul(t.y, dot(toward, t.y)))), a = smooth((r - F.from) / (1 - F.from)) * selfAt(i);
        const x = dot(flat, t.x) * side, z = dot(flat, t.z); m = add(m, add(add(mul(t.z, clamp(z, 0, 1) * F.forward * a), mul(t.x, side * (x > 0 ? x * F.outward : x * F.inward) * a)), mul(t.y, F.up * smooth((r - F.upFrom) / (1 - F.upFrom)) * selfAt(i)))); }
      return add(q, m); }) as [Vec3, Vec3];
    return {s, head, t}; };
  const reaches = (i: number, share: number) => { const p = trunkPose(i, share); return length(sub(wristR(i), p.s[0])) <= long && length(sub(frames[i].L.w, p.s[1])) <= long; };
  // How much of the steering each frame takes: all of it where both arms still reach, else the most that does; evened out without ever going over.
  const most = frames.map((_, i) => { if (!steered || reaches(i, 1)) return 1; if (!reaches(i, 0)) return 0; let lo = 0, hi = 1; for (let n = 0; n < 16; n++) { const m = (lo + hi) / 2; if (reaches(i, m)) lo = m; else hi = m; } return lo; });
  const share = box(least(most, NATURAL.smooth.body), NATURAL.smooth.body);
  const poses = frames.map((_, i) => trunkPose(i, share[i]));

  // ---- 3. the elbows: each turned about shoulder-to-wrist to where it costs least, evened out over a few frames
  const W = NATURAL.wrist, TURNS = Array.from({length: 2 * NATURAL.elbowSteps + 1}, (_, n) => NATURAL.elbowMost * (n / NATURAL.elbowSteps - 1));
  const elbowAt = (s: Vec3, w: Vec3, pole: Vec3, turn: number) => arm(s, w, turn ? turned(pole, unit(sub(w, s)), turn) : pole, doll).elbow;
  const solved = frames.map((f, i) => { const {s, t} = poses[i], wR = wristR(i), poles = elbowPolesAt(doll, s, [wR, f.L.w]), was = elbowPolesAt(doll, [f.R.s, f.L.s], [f.R.w, f.L.w]);
    return ([0, 1] as const).map(k => { const l = k ? f.L : {...f.R, w: wR, p: hands[i]?.p ?? f.R.p}, sign = k ? -1 : 1, w = l.w, side = k ? t.x : mul(t.x, -1);
      const outward = Math.sign(dot(sub(elbowAt(s[k], w, poles[k], 0.1), elbowAt(s[k], w, poles[k], -0.1)), side)) || 1, bias = out[k] * outward;
      const cost = (turn: number) => { const e = elbowAt(s[k], w, poles[k], turn), b = wristBent(l, sign, e), deep = armInTrunk(doll, t, s[k], e, w);
        const low = [e, lerp(e, w, 0.5)].reduce((c, q) => c + (q[2] > edge - 0.05 && q[1] < 0.01 ? 1e4 * (0.01 - q[1]) ** 2 : 0), 0);
        return ((turn - bias) / NATURAL.pole) ** 2 + (b.dev / W.dev) ** 2 + (b.flex / W.flex) ** 2 + 20 * Math.max(0, Math.abs(b.dev) - W.devMost) ** 2 + 20 * Math.max(0, Math.abs(b.flex) - W.flexMost) ** 2 + 1e4 * Math.max(0, deep - 0.01) ** 2 + low; };
      let best = bias, c0 = Infinity; for (const turn of TURNS.map(x => x + bias)) { const c = cost(turn); if (c < c0) { c0 = c; best = turn; } }
      // (the elbow moves by what the new solution moves it from the deal's own, so that a frame nothing changes keeps its elbow to the last digit)
      return {pole: poles[k], bias, self: best - bias, base: elbowAt(k ? f.L.s : f.R.s, k ? f.L.w : f.R.w, was[k], 0), w}; }); });
  const selfTurn = ([0, 1] as const).map(k => box(solved.map(x => x[k].self), NATURAL.smooth.elbow));
  const turnOf = (i: number, k: 0 | 1) => solved[i][k].bias * userAt(i) * goes(i) + selfTurn[k][i] * selfAt(i);

  // ---- 4. the frames, and the receipt
  // (flatDeg, with flatHand: degrees the right hand is turned on the card; the `was` measures are the frames as they came)
  const receipt = {doll: doll.name, steered, follows, pinches, frames: [] as {i: number; bodyShare: number; shoulderMm: [number, number]; elbowDeg: [number, number]; deeperMm: number; trunkMm: [number, number]; trunkWasMm: [number, number]; wristDeg: [number, number]; wristWasDeg: [number, number]; thumbMm: number | null; thumbWasMm: number | null; thumbCardMm: [number, number]; throughCard: [number, number]; apartMm: number; touching: string[]; flatDeg?: number}[]};
  const bent = (l: Limb, sign: number, e: Vec3) => { const x = wristBent(l, sign, e); return deg(Math.hypot(x.dev, x.flex * W.dev / W.flex)); };
  const result = frames.map((f, i) => {
    const {s, head, t} = poses[i], was = trunkAt(hip, f.R.s, f.L.s);
    const limb = (k: 0 | 1): Limb => { const l = k ? f.L : f.R, x = solved[i][k], e = add(l.e, sub(elbowAt(s[k], x.w, x.pole, turnOf(i, k)), x.base));
      return {...l, s: round(s[k]), e: round(e), ...(k === 0 && hands[i] ? hands[i] : {})}; };
    const R = limb(0), L = limb(1), fr = {...f, R, L, h: round(head)};
    receipt.frames.push({i, bodyShare: Math.round(share[i] * 100) / 100, shoulderMm: [mm(length(sub(R.s, f.R.s))), mm(length(sub(L.s, f.L.s)))], elbowDeg: [deg(turnOf(i, 0)), deg(turnOf(i, 1))], deeperMm: mm(deeper[i]),
      trunkMm: [mm(armInTrunk(doll, t, R.s, R.e, R.w)), mm(armInTrunk(doll, t, L.s, L.e, L.w))], trunkWasMm: [mm(armInTrunk(doll, was, laid[i].R.s, laid[i].R.e, laid[i].R.w)), mm(armInTrunk(doll, was, f.L.s, f.L.e, f.L.w))],
      wristDeg: [bent(R, 1, R.e), bent(L, -1, L.e)], wristWasDeg: [bent(laid[i].R, 1, laid[i].R.e), bent(f.L, -1, f.L.e)], thumbMm: thumbs[i].now, thumbWasMm: thumbs[i].was, thumbCardMm: [mm(cardGap(f.card, laid[i].R.p[4])), mm(cardGap(f.card, R.p[4]))], throughCard: [throughCard(f.card, laid[i].R.p) + throughCard(f.card, f.L.p), throughCard(f.card, R.p) + throughCard(f.card, L.p)], apartMm: mm(handsApart(fr)), touching: touching(fr).map(x => `${x.hand}${x.finger}`), ...(flat ? {flatDeg: deg(flat.turn[i])} : {})});
    return fr; });
  return {motion: {...motion, about: `${(motion as {about?: string}).about ?? ''} Moved as a person moves by dealer3d/src/natural.ts.`, frames: result} as M, receipt};
}
