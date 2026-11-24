// Her one-hand deal from A2.1, built on the doll's own bones and not read off a film (Jakob 2026-11-24: "alla filmer med
// dockan är svindåliga för ställning A2.1": the deals read off her films lifted the card high, let it hang and laid it before
// the place). The six steps from A2.1 (docs/BESKED.md: Nyp, Dra, För fram, Vrid, Vänd upp, Lägg) with her left hand alone,
// and her return to A2.1 in the same motion. Pure: no I/O, no three.js.
// - Nyp: the pose A2.1: thumb on the card's back, forefinger on its face, at its upper corner in the shoe's window.
// - Dra: the card slides down the shoe's plate the way every card leaves the shoe (two-hand.ts, the card out of the shoe),
//   its lower end out along the felt, until it leans CLEAR.drawn over the felt with its held end up.
// - För fram, Vrid, Vänd upp: carried low over the felt to the place. Her forearm turns the hand palm down (pronation) and her
//   thumb goes in under the card as it turns, so that the card turns face up about its long side in her fingers; the card
//   may also pivot in the pinch, as a card held at its corner does. The turn is over before she lays it ("Handen vänds en
//   gång, i luften, aldrig i slutet"). The hand is moved by its joints: the forearm's turn and the wrist's two bends go
//   from where they are to where they end, each within what a wrist does (WRIST), and the arm reaches each frame.
// - Lägg: the card's far edge set on the felt ON the place, the card lowered about it; her thumb slides out from under its
//   near end and her forefinger holds it down until it lies flat.
// - Then a fifth of a second with the forefinger on the card, the hand lifted off it, and back to A2.1.
// Her trunk leans and turns toward the place as far as her arm needs (reachFrom), up to MOST; her right hand stays.
import {CARD, add, cross, dot, length, mul, sub, unit, type Lens, type Vec3} from './camera.ts';
import {arm, turned} from './body.ts';
import {ELBOW_POLES, type Doll} from './doll.ts';
import {axesOf, local, outOf, placed, shapeBetween, thumbToward, type Axes} from './hand-pose.ts';
import {humaneMotion} from './hand-rule.ts';
import {SHOE, shoeCard, shoePose, type Shoe} from './world.ts';

type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
type CardAt = {c: Vec3; l: Vec3; n: Vec3};
/** The pose A2.1 on one doll: its first frame (the card in the shoe's window, her left hand pinching it) and her hip. */
export type Anchor21 = {hip: Vec3; frame: {card: CardAt; L: Limb; R: Limb; h: Vec3}};
export type Side = 'FRONT' | 'BACK';
/** What steers the deal (the doll lab's sliders): `body` degrees on top of what her arm needs [lean, twist]; `cardTempo` how many times faster the hand with the card goes; `side` the side up the card lies with. */
export type PinchSteer = {body: [number, number] | null; cardTempo: number; side: Side};
export const PINCH_STEER: PinchSteer = {body: null, cardTempo: 1, side: 'FRONT'};
const deg = Math.PI / 180;
/** The most her trunk leans toward a place and turns her left shoulder forward to reach it (a seated dealer reaching over the table). */
export const MOST = {lean: 24 * deg, twist: 36 * deg};
/** What her wrist does comfortably, radians: bent toward the palm (flex) or back (−), toward the little finger (dev) or the thumb (−); the forearm's turn from thumb up (pronation +, palm down at 90°). */
export const WRIST = {flex: [-40 * deg, 40 * deg], dev: [-15 * deg, 25 * deg], turn: [-70 * deg, 88 * deg]};
/** How far the card leans over the felt when it is drawn (its held end up), how near the felt card and fingers come as she carries it, metres. */
const CLEAR = {drawn: 40 * deg, felt: 0.008, finger: 0.0085};
/** How far the far edge is tilted up as it is set on the felt. */
const TILT = 20 * deg;
/** The turn: over which share of the carry the hand and the card turn; by which share of the turn the card's face is up and by which its long side has levelled out to LEVEL (its held end up +); the keys between. */
const TURN = {from: 0, to: 0.9, faceBy: 0.8, levelBy: 0.7, keys: [0.25, 0.5, 0.75]}, LEVEL = [-10 * deg, 12 * deg];
const FPS = 30, UP: Vec3 = [0, 1, 0];
const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * x * (10 + x * (-15 + 6 * x)); };
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const into = (v: Vec3, a: Axes): Vec3 => [dot(v, a.forward), dot(v, a.palm), dot(v, a.across)];
const axesFrom = (forward: Vec3, palm: Vec3): Axes => { const f = unit(forward), p = unit(sub(palm, mul(f, dot(palm, f)))); return {forward: f, palm: p, across: cross(p, f)}; };
const turnAxes = (a: Axes, axis: Vec3, angle: number): Axes => axesFrom(turned(a.forward, axis, angle), turned(a.palm, axis, angle));
const r4 = (v: Vec3): Vec3 => v.map(x => Math.round(x * 10000) / 10000) as Vec3;
const flat = (v: Vec3): Vec3 => unit([v[0], 0, v[2]]);
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
const corners = (c: CardAt): Vec3[] => { const a = cross(c.n, c.l), H = CARD.height / 2, W = CARD.width / 2; return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => add(add(c.c, mul(c.l, i * H)), mul(a, j * W))); };
/** The card's axes as a hand's (forward its long side toward the held end, palm its face): in the hand's own axes. */
const inHand = (card: CardAt, H: Axes): Axes => axesFrom(into(card.l, H), into(card.n, H));
/** The hand's axes from the card's and the card's in the hand (a hand's axes are a mirrored set, across = palm × forward, so the card's third axis in them is cross(l, n)). */
const handFrom = (l: Vec3, n: Vec3, G: Axes): Axes => { const a = cross(l, n), col = (k: number) => add(add(mul(l, G.forward[k]), mul(n, G.palm[k])), mul(a, G.across[k])); return axesFrom(col(0), col(1)); };

/** The forearm's own axes: along it, and the way a palm looks with the thumb up (toward her middle for the left arm) and palm down. */
type Fore = {fore: Vec3; r0: Vec3; r1: Vec3};
/** (`side`: the way the elbow bends out from the line shoulder to wrist; without it, read off the elbow. From the side and not from the bones' cross product, so that it holds as the arm straightens.) */
function foreOf(s: Vec3, e: Vec3, w: Vec3, side?: Vec3): Fore { const fore = unit(sub(w, e)), line = unit(sub(w, s)), off = side ?? sub(sub(e, s), mul(line, dot(sub(e, s), line))), r = cross(unit(sub(off, mul(line, dot(off, line)))), line), r0 = unit(sub(r, mul(fore, dot(r, fore)))); return {fore, r0, r1: cross(fore, r0)}; }
/** The hand's joints against the forearm: turn (pronation), flex and dev. */
export type Joints = {turn: number; flex: number; dev: number};
export function jointsOf(H: Axes, F: Fore): Joints {
  const turn = Math.atan2(dot(H.palm, F.r1), dot(H.palm, F.r0)), pa = add(mul(F.r0, Math.cos(turn)), mul(F.r1, Math.sin(turn))), ac = cross(pa, F.fore);
  return {turn, flex: Math.atan2(dot(H.forward, pa), dot(H.forward, F.fore)), dev: -Math.asin(clamp1(dot(H.forward, ac)))};
}
function handOf(F: Fore, j: Joints): Axes {
  const pa = add(mul(F.r0, Math.cos(j.turn)), mul(F.r1, Math.sin(j.turn))), ac = cross(pa, F.fore);
  const f1 = add(mul(F.fore, Math.cos(j.flex)), mul(pa, Math.sin(j.flex))), p1 = sub(mul(pa, Math.cos(j.flex)), mul(F.fore, Math.sin(j.flex)));
  return axesFrom(sub(mul(f1, Math.cos(j.dev)), mul(ac, Math.sin(j.dev))), p1);
}
const beyond = (x: number, [lo, hi]: number[]) => Math.max(0, lo - x, x - hi);

/** Her trunk turned about her hip: leaning `lean` toward `toward` and her left shoulder turned forward by `twist` about the leaning spine. */
function trunkAt(hip: Vec3, toward: Vec3, lean: number, twist: number) {
  const axis = unit(cross(UP, flat(sub(toward, hip)))), spine = turned(UP, axis, lean);
  return (p: Vec3, k = 1) => add(hip, turned(turned(sub(p, hip), axis, lean * k), spine, twist * k));
}
/** The least lean (with the turn in step, the way that brings her left shoulder nearer) for her left hand to be at each of `wrists`, and how far her arm is short there with all of MOST (mm). */
export function reachFrom(start: Anchor21, doll: Doll, wrists: Vec3[], toward: Vec3) {
  const s0 = start.frame.L.s, reach = doll.upperArm + doll.forearm - 0.006, w = wrists[0];
  const way = length(sub(w, trunkAt(start.hip, toward, 0, 0.1)(s0))) < length(sub(w, trunkAt(start.hip, toward, 0, -0.1)(s0))) ? 1 : -1;
  const far = (lean: number) => Math.max(...wrists.map(x => length(sub(x, trunkAt(start.hip, toward, lean, way * MOST.twist * lean / MOST.lean)(s0)))));
  let lean = 0; if (far(0) > reach) { let lo = 0, hi = MOST.lean; if (far(hi) > reach) lean = hi; else { for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (far(m) > reach) lo = m; else hi = m; } lean = hi; } }
  return {lean, twist: way * MOST.twist * lean / MOST.lean, shortMm: Math.max(0, Math.round((far(lean) - reach) * 10000) / 10)};
}

/** The card leaving the shoe as two-hand.ts takes it out: at `a` metres along its way, sliding down the plate, then its lower end out along the felt. */
function leavingShoe(lens: Lens, kind: Shoe = SHOE) {
  const shoe = shoePose(lens, kind), inShoe = shoeCard(shoe, kind), outward = mul(shoe.back, -1), mouth = add(shoe.front, mul(shoe.far, kind.width / 2)), lean0 = Math.cos(kind.plateLean);
  const H = CARD.height, lying = CARD.thickness / 2, first = kind.windowLift / Math.sin(kind.plateLean);
  const faceIn = (long: Vec3): Vec3 => { const n = unit(cross(shoe.far, long)); return n[1] > 0 ? mul(n, -1) : n; };
  return (a: number): CardAt => {
    let low: Vec3, high: Vec3, lift = 0.001;
    if (a <= first) { low = add(mouth, mul(inShoe.up, first - a)); high = add(low, mul(inShoe.up, H)); }
    else { const x = Math.min(H, a - first), b = (-2 * lean0 * x + Math.sqrt(4 * lean0 * lean0 * x * x - 4 * (x * x - H * H))) / 2; low = add(mouth, mul(outward, x)); high = add(mouth, mul(inShoe.up, Math.max(0, b))); lift = 0.001 + (lying - 0.001) * x / H; }
    const long = unit(sub(low, high)), normal = faceIn(long); return {c: sub(mul(add(low, high), 0.5), mul(normal, lift)), l: mul(long, -1), n: normal}; };
}

export type PinchInput = {start: Anchor21; place: string; at: Vec3; doll: Doll; lens: Lens; steer?: Partial<PinchSteer>; shoe?: Shoe; spinMost?: number; spinCost?: number};
/** The deal from A2.1 to the place at `at` (a point on the felt) and back, on `doll`. */
export function pinchDeal(input: PinchInput) {
  const {start, doll, lens} = input, steer: PinchSteer = {...PINCH_STEER, ...input.steer}, f0 = start.frame, sign = -1, tempo = Math.max(1, steer.cardTempo || 1);
  if (steer.side === 'BACK') throw Error('A2.1: a card laid closed is not built yet.');
  // The pinch at A2.1: the hand, its shape, the card in it, where on the card the pinch is.
  const H0 = axesOf(f0.L.p, sign), S0 = local(f0.L.p, H0), W0 = f0.L.w, G0 = inHand(f0.card, H0);
  const gap = length(sub(f0.L.p[8], f0.L.p[4])), P0 = mul(add(f0.L.p[4], f0.L.p[8]), 0.5), d0 = sub(P0, f0.card.c), a0 = cross(f0.card.n, f0.card.l);
  const pinch = {u: dot(d0, f0.card.l), w: dot(d0, f0.card.n), v: dot(d0, a0)};
  const cardAt = (l: Vec3, n: Vec3, P: Vec3): CardAt => ({c: sub(sub(sub(P, mul(l, pinch.u)), mul(n, pinch.w)), mul(cross(n, l), pinch.v)), l, n});
  const pinchOf = (c: CardAt) => add(add(add(c.c, mul(c.l, pinch.u)), mul(c.n, pinch.w)), mul(cross(c.n, c.l), pinch.v));
  /** The shape with its thumb on the card's back across from the forefinger (`n` the card's face in the hand), and the pinch's middle in the hand. */
  const relaxed = doll.hand?.natural?.left ?? S0, carryShape = shapeBetween(S0, relaxed, 0.25);
  const pinched = (S: Vec3[], n: Vec3) => thumbToward(S, sub(S[8], mul(n, gap)), 70);
  const midOf = (S: Vec3[], n: Vec3): Vec3 => sub(S[8], mul(n, gap / 2));

  // Dra: down the plate until the card leans CLEAR.drawn over the felt.
  const leave = leavingShoe(lens, input.shoe), tilt0 = (c: CardAt) => Math.asin(clamp1(c.l[1]));
  let drawnA = 0; while (drawnA < 0.2 && tilt0(leave(drawnA)) > CLEAR.drawn) drawnA += 0.0005;
  const atStart = leave(0), off = length(sub(atStart.c, f0.card.c)); // (the card in the shoe of A2.1 is the shoe's own)
  const drawn = leave(drawnA), Pd = pinchOf(drawn);

  // The place: the card flat ON it, face up, long side toward her; set down far edge first, tilted TILT about it.
  const endCard: CardAt = {c: [input.at[0], 0, input.at[2]], l: [0, 0, -1], n: [0, 1, 0]}, farEdge = sub(endCard.c, mul(endCard.l, CARD.height / 2));
  const tiltAxis = cross(endCard.n, endCard.l), tiltWay = turned(endCard.l, tiltAxis, 0.1)[1] > 0 ? 1 : -1;
  const tilted = (k: number): CardAt => { const ang = tiltWay * TILT * k, r = (x: Vec3) => add(farEdge, turned(sub(x, farEdge), tiltAxis, ang)); return {c: r(endCard.c), l: turned(endCard.l, tiltAxis, ang), n: turned(endCard.n, tiltAxis, ang)}; };
  const touch = tilted(1), Pt = pinchOf(touch);

  // Timing (30 a second).
  const span = length(sub([Pt[0], 0, Pt[2]], [Pd[0], 0, Pd[2]]));
  const T = {held: 2, draw: 8, carry: Math.round((14 + 18 * span / 0.6) / tempo), lay: 8, hold: 6, lift: 5, back: Math.round((16 + 14 * span / 0.6) / tempo), still: 4};
  const t1 = T.held, t2 = t1 + T.draw, tT = t2 + T.carry, tR = tT + T.lay, tH = tR + T.hold, tL = tH + T.lift, tB = tL + T.back, count = tB + T.still;
  const turnStarts = TURN.from, turnEnds = TURN.to;

  // Her trunk and elbows at frame t, for a lean and turn found by reach.
  const pole0 = unit(sub(f0.L.e, f0.L.s)), out = (t: number) => t <= t1 ? 0 : t <= t2 ? 0.15 * ease((t - t1) / (t2 - t1)) : t <= tT ? 0.15 + 0.85 * ease((t - t2) / (tT - t2) / 0.85) : t <= tL ? 1 : 1 - ease((t - tL) / (tB - tL - 3));
  let need = {lean: 0, twist: 0, shortMm: 0}, swivelEnd = 0; // (the elbow turned out or in about the line from shoulder to wrist, where her wrist asks it)
  const more = steer.body ? steer.body.map(x => x * deg) : [0, 0];
  const shoulderAt = (t: number) => trunkAt(start.hip, input.at, (need.lean + more[0]) * out(t), (need.twist + more[1]) * out(t));
  const elbowAt = (t: number, W: Vec3) => { const sL = shoulderAt(t)(f0.L.s), sR = shoulderAt(t)(f0.R.s), k = 1 - (1 - Math.min(1, out(t) * 1.25)) ** 2, poles = doll.elbowPoles ?? ELBOW_POLES;
    const line = unit(sub(W, sL)), pole = turned(unit(add(mul(pole0, 1 - k), mul(poles[1], k))), line, swivelEnd * k), a = arm(sL, W, pole, doll); return {sL, sR, e: a.elbow, reached: a.reached, side: pole, F: foreOf(sL, a.elbow, W, pole)}; };

  // The card in the hand, from the pinch at A2.1: the thumb `tuck` in under it (about the hand's long axis, toward the palm's side) and its pivot `spin` in the pinch.
  const tuckAxis = unit(cross(G0.palm, [0, -1, 0]));
  const held = (tuck: number, spin: number): Axes => { const G = turnAxes(G0, tuckAxis, tuck); return turnAxes(G, G.palm, spin); };
  const handAtTouch = (tuck: number, spin: number) => { const G = held(tuck, spin), S = pinched(carryShape, G.palm), H = handFrom(touch.l, touch.n, G), W = sub(Pt, outOf(midOf(S, G.palm), H)); return {G, S, H, W}; };
  // The end the hand comes to: the least turned in the fingers, with the wrist and forearm where they go, no finger in the felt.
  const costAt = (tuck: number, spin: number, swivel: number) => {
    swivelEnd = swivel; const x = handAtTouch(tuck, spin), arm1 = elbowAt(tT, x.W), j = jointsOf(x.H, arm1.F), p = placed(x.S, x.H, x.W);
    const flatH = handFrom(endCard.l, endCard.n, x.G), flatW = sub(pinchOf(endCard), outOf(midOf(x.S, x.G.palm), flatH)), flatP = placed(x.S, flatH, flatW), jF = jointsOf(flatH, elbowAt(tR, flatW).F);
    const thumbMiss = length(sub(sub(x.S[8], x.S[4]), mul(x.G.palm, gap)));
    const low = Math.max(0, ...p.map((q, i) => (i >= 2 && i <= 4 ? 0.006 : CLEAR.finger) - q[1]), ...flatP.map((q, i) => (i === 1 || i === 4 ? -1 : i === 3 ? 0.004 : CLEAR.finger - 0.001) - q[1]));
    const wrist = beyond(j.flex, WRIST.flex) + beyond(j.dev, WRIST.dev) + beyond(j.turn, WRIST.turn) + beyond(jF.flex, WRIST.flex) + beyond(jF.dev, WRIST.dev) + beyond(jF.turn, WRIST.turn);
    return {cost: 400 * wrist * wrist + 0.4 * (j.flex ** 2 + j.dev ** 2) + (input.spinCost ?? 0.25) * spin * spin + 0.1 * tuck * tuck + 0.3 * swivel * swivel + 4e5 * low * low + 2e5 * thumbMiss * thumbMiss + (arm1.reached ? 0 : 50), j, x, thumbMiss, low, swivel};
  };
  let best = {tuck: 0, spin: 0, c: costAt(0, 0, 0)};
  const spinMost = input.spinMost ?? 180 * deg;
  for (let pass = 0; pass < 2; pass++) {
    const flatH = handFrom(endCard.l, endCard.n, best.c.x.G), flatW = sub(pinchOf(endCard), outOf(midOf(best.c.x.S, best.c.x.G.palm), flatH));
    need = reachFrom(start, doll, [best.c.x.W, flatW, add(flatW, [0, 0.022, 0])], input.at);
    for (let tuck = 0; tuck <= 110 * deg + 1e-9; tuck += 10 * deg) for (let spin = -180 * deg; spin < 180 * deg; spin += 10 * deg) for (let sw = -40 * deg; sw <= 40 * deg + 1e-9; sw += 10 * deg) { if (Math.abs(spin) > spinMost) continue; const c = costAt(tuck, spin, sw); if (c.cost < best.c.cost) best = {tuck, spin, c}; }
    for (let step = 5 * deg; step > 0.3 * deg; step /= 2) for (let again = 0; again < 3; again++) for (const [dt, ds, dw] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step], [0, 0, -step]]) { if (Math.abs(best.spin + ds) > spinMost) continue; const c = costAt(best.tuck + dt, best.spin + ds, best.c.swivel + dw); if (c.cost < best.c.cost) best = {tuck: best.tuck + dt, spin: best.spin + ds, c}; }
  }
  swivelEnd = best.c.swivel;
  { const flatH = handFrom(endCard.l, endCard.n, best.c.x.G), flatW = sub(pinchOf(endCard), outOf(midOf(best.c.x.S, best.c.x.G.palm), flatH));
    need = reachFrom(start, doll, [best.c.x.W, flatW, add(flatW, [0, 0.022, 0])], input.at); }
  const Ge = best.c.x.G, Se = best.c.x.S, jT = best.c.j;

  const build = () => {
  // The draw's end: the hand rigid on the card; its joints there.
  const rigid = (card: CardAt, G: Axes, S: Vec3[]) => { const H = handFrom(card.l, card.n, G); return {H, W: sub(pinchOf(card), outOf(midOf(S, G.palm), H))}; };
  const dEnd = rigid(drawn, G0, S0), jD = jointsOf(dEnd.H, elbowAt(t2, dEnd.W).F), jTb = jointsOf(best.c.x.H, elbowAt(tT, best.c.x.W).F);

  // The turn, key by key: the card's long side levels out from how it leaned when drawn (it is turned over about its long
  // side, never left hanging from the fingers) while its face turns up at an even pace; at each key the joints nearest the
  // straight way on that do it within what the wrist does.
  const cardAt_ = (k: number, j: Joints, g: number) => { const s = turnStarts + k * (turnEnds - turnStarts), t = t2 + s * (tT - t2), P = add(lerp(Pd, Pt, ease(s)), [0, 0.03, 0]);
    const G = held(best.tuck * g, best.spin * g), S = pinched(shapeBetween(S0, carryShape, g), G.palm), mid = midOf(S, G.palm);
    let W = lerp(dEnd.W, best.c.x.W, ease(s)), H = dEnd.H; for (let i = 0; i < 6; i++) { H = handOf(elbowAt(t, W).F, j); W = sub(P, outOf(mid, H)); } return {l: unit(outOf(G.forward, H)), n: unit(outOf(G.palm, H))}; };
  const faceUp = (n: Vec3) => Math.acos(clamp1(-n[1])), tiltOf = (l: Vec3) => Math.asin(clamp1(l[1]));
  const first = cardAt_(0, jD, 0), last = cardAt_(1, jTb, 1), tilt0 = tiltOf(first.l), face0 = faceUp(first.n), face1 = faceUp(last.n);
  const keys: {k: number; j: Joints; g: number}[] = [{k: 0, j: jD, g: 0}];
  for (const k of TURN.keys) {
    const prev = keys[keys.length - 1], u = (k - prev.k) / (1 - prev.k), lin: Joints = {turn: mix(prev.j.turn, jTb.turn, u), flex: mix(prev.j.flex, jTb.flex, u), dev: mix(prev.j.dev, jTb.dev, u)}, gLin = mix(prev.g, 1, u);
    const steep = Math.max(LEVEL[1], tilt0 - (tilt0 - LEVEL[1]) * k / TURN.levelBy), face = mix(face0, face1, Math.min(1, k / TURN.faceBy));
    const cost = (j: Joints, g: number) => { const x = cardAt_(k, j, g), wrist = beyond(j.flex, WRIST.flex) + beyond(j.dev, WRIST.dev) + beyond(j.turn, WRIST.turn);
      return 400 * wrist * wrist + 0.4 * (j.flex ** 2 + j.dev ** 2) + 30 * beyond(tiltOf(x.l), [LEVEL[0], steep]) ** 2 + 3 * (faceUp(x.n) - face) ** 2  + 0.3 * ((j.turn - lin.turn) ** 2 + (j.flex - lin.flex) ** 2 + (j.dev - lin.dev) ** 2) + (g - gLin) ** 2; };
    let bj = {...lin}, bg = gLin, bc = cost(bj, bg);
    for (let tu = lin.turn - 40 * deg; tu <= lin.turn + 40 * deg + 1e-9; tu += 10 * deg) for (let fl = WRIST.flex[0]; fl <= WRIST.flex[1] + 1e-9; fl += 10 * deg) for (let dv = WRIST.dev[0]; dv <= WRIST.dev[1] + 1e-9; dv += 10 * deg) for (let g = prev.g; g <= 1 + 1e-9; g += 0.25) {
      const c = cost({turn: tu, flex: fl, dev: dv}, g); if (c < bc) { bc = c; bj = {turn: tu, flex: fl, dev: dv}; bg = g; } }
    for (let step = 5 * deg; step > 0.3 * deg; step /= 2) for (let again = 0; again < 3; again++) for (const [a, b, c, e] of [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]]) {
      const j = {turn: bj.turn + a * step, flex: bj.flex + b * step, dev: bj.dev + c * step}, g = Math.max(prev.g, Math.min(1, bg + e * step)), x = cost(j, g); if (x < bc) { bc = x; bj = j; bg = g; } }
    keys.push({k, j: bj, g: bg});
  }
  keys.push({k: 1, j: jTb, g: 1});
  // (one smooth curve through the keys: still at both ends, no overshoot where a key is not between its neighbours)
  const curve = (vs: number[], k: number) => { const x = Math.max(0, Math.min(1, k)), ks = keys.map(q => q.k); let i = 0; while (i < ks.length - 2 && x > ks[i + 1]) i++;
    const slope = (m: number) => m === 0 || m === ks.length - 1 || (vs[m] - vs[m - 1]) * (vs[m + 1] - vs[m]) <= 0 ? 0 : (vs[m + 1] - vs[m - 1]) / (ks[m + 1] - ks[m - 1]);
    const h = ks[i + 1] - ks[i], u = (x - ks[i]) / h;
    return (2 * u ** 3 - 3 * u ** 2 + 1) * vs[i] + (u ** 3 - 2 * u ** 2 + u) * h * slope(i) + (-2 * u ** 3 + 3 * u ** 2) * vs[i + 1] + (u ** 3 - u ** 2) * h * slope(i + 1); };
  const along = (f: (q: (typeof keys)[number]) => number) => keys.map(f);
  const kt = along(q => q.j.turn), kf = along(q => q.j.flex), kd = along(q => q.j.dev), kg = along(q => q.g);
  const jointsAt = (k: number): Joints => ({turn: curve(kt, k), flex: curve(kf, k), dev: curve(kd, k)});
  const gripAt = (k: number) => Math.max(0, Math.min(1, curve(kg, k)));

  // The carry, frame by frame: the joints and the card in the hand along that curve from the draw's end to the touch, the pinch along a low line; the wrist where the hand puts it.
  const carryAt = (t: number, lift: number) => {
    const s = (t - t2) / (tT - t2), k = (s - turnStarts) / (turnEnds - turnStarts), q = gripAt(k), P = add(lerp(Pd, Pt, ease(s)), [0, lift, 0]);
    const j: Joints = jointsAt(k), G = held(best.tuck * q, best.spin * q);
    const S = pinched(shapeBetween(S0, carryShape, q), G.palm), mid = midOf(S, G.palm);
    let W = lerp(dEnd.W, best.c.x.W, ease(s)), H = dEnd.H;
    for (let i = 0; i < 6; i++) { H = handOf(elbowAt(t, W).F, j); W = sub(P, outOf(mid, H)); }
    const card = cardAt(unit(outOf(G.forward, H)), unit(outOf(G.palm, H)), P);
    return {H, S, W, G, card, P};
  };
  // (the card leaves the felt it slid out along over a sixth of a second)
  const lowestOver = (x: ReturnType<typeof carryAt>, t: number) => { const felt = 0.001 + (CLEAR.felt - 0.001) * ease((t - t2) / 5) * ease((tT - t) / 5);
    return Math.min(...corners(x.card).map(q => q[1] - felt), ...placed(x.S, x.H, x.W).map(q => q[1] - CLEAR.finger)); };
  // (the height: each frame as much as it needs and no more, under one smooth hill per frame's need, so that the card
  // rises from the felt and comes down to the place in one motion)
  const lifts = new Array(count).fill(0) as number[], liftAt = (t: number) => lifts[t] ?? 0, hill = (d: number) => { const w = d < 0 ? 3 : 7; return Math.abs(d) >= w ? 0 : Math.cos(Math.PI * d / (2 * w)) ** 2; };
  for (let pass = 0; pass < 30; pass++) { let worst = 0; const want = lifts.map((h, t) => t > t2 && t < tT ? h + Math.max(0, -lowestOver(carryAt(t, h), t)) : 0);
    for (let t = t2 + 1; t < tT; t++) worst = Math.max(worst, want[t] - lifts[t]);
    if (worst < 2e-4) break;
    for (let t = t2 + 1; t < tT; t++) { let h = 0; for (let u = t2 + 1; u < tT; u++) h = Math.max(h, want[u] * hill(t - u)); lifts[t] = Math.max(lifts[t], h + 0.0003); } }
  const lift = Math.max(...lifts);

  // Lägg: the card lowered about its far edge; the thumb out from under its near end by the time it is at 3/4 of the tilt; the forefinger on it.
  const nearBy = CARD.height / 2 - pinch.u + 0.011, thumbOut = (S: Vec3[], k: number) => { if (k <= 0) return S;
    const under = sub(S[8], mul(Ge.palm, gap)), past = add(under, mul(Ge.forward, nearBy)), beside = add(past, mul(Ge.palm, gap / 2 + 0.0095));
    return thumbToward(S, k < 0.6 ? lerp(under, past, ease(k / 0.6)) : lerp(past, beside, ease((k - 0.6) / 0.4)), 70); };
  // (as the card goes flat her hand rises about the forefinger's tip and rolls toward the thumb's side, the least that keeps
  // her thumb and knuckles out of the felt within what the wrist does; it comes in as the card goes flat)
  const raise = (H: Axes, W: Vec3, S: Vec3[], by: [number, number]) => { const pivot = placed(S, H, W)[8], across = unit(H.across), up = turned(sub(W, pivot), across, 0.01)[1] > sub(W, pivot)[1] ? across : mul(across, -1);
    const H1 = turnAxes(H, up, by[0]), W1 = add(pivot, turned(sub(W, pivot), up, by[0])), roll = unit(H1.forward);
    return {H: turnAxes(H1, roll, by[1]), W: add(pivot, turned(sub(W1, pivot), roll, by[1]))}; };
  const laidShape = thumbOut(Se, 1), flatOn = rigid(endCard, Ge, Se);
  const laidBy = ((): [number, number] => { let best: [number, number] = [0, 0], least = Infinity;
    for (let b1 = 0; b1 <= 30 * deg + 1e-9; b1 += 1.5 * deg) for (let b2 = -30 * deg; b2 <= 30 * deg + 1e-9; b2 += 1.5 * deg) { const x = raise(flatOn.H, flatOn.W, laidShape, [b1, b2]), q = placed(laidShape, x.H, x.W), j = jointsOf(x.H, elbowAt(tR, x.W).F);
      const miss = Math.max(0, ...q.map((v, i) => i >= 5 && i <= 8 ? 0 : (i === 4 ? 0.0085 : CLEAR.finger - 0.0005) - v[1])), wrist = beyond(j.flex, WRIST.flex) + beyond(j.dev, WRIST.dev) + beyond(j.turn, WRIST.turn);
      const c = 1e4 * miss * miss + 400 * wrist * wrist + b1 * b1 + b2 * b2; if (c < least) { least = c; best = [b1, b2]; } }
    return best; })();
  const layBy = (t: number): [number, number] => { const k = ease(Math.min(1, (t - tT) / (tR - tT))); return [laidBy[0] * k, laidBy[1] * k]; };
  const laid = raise(flatOn.H, flatOn.W, laidShape, laidBy), lifted = add(laid.W, [0, 0.022, 0]);
  const jL = jointsOf(laid.H, elbowAt(tL, lifted).F), j0 = jointsOf(H0, foreOf(f0.L.s, f0.L.e, W0));
  const approach = add(dEnd.W, [0, 0.015, 0]);

  const frames: {card: CardAt & {id: number}; L: Limb; R: Limb; h: Vec3; g: Vec3}[] = [], receipt: {i: number; shortMm: number; joints: Joints; lowestMm: number; handLowMm: number; handLowAt: number; cardTilt: number}[] = [];
  for (let t = 0; t < count; t++) {
    let H: Axes, S: Vec3[], W: Vec3, card: CardAt;
    if (t <= t1) { H = H0; S = S0; W = W0; card = f0.card; }
    else if (t <= t2) { card = leave(drawnA * ease((t - t1) / (t2 - t1))); ({H, W} = rigid(card, G0, S0)); S = S0; }
    else if (t <= tT) { ({H, S, W, card} = carryAt(t, liftAt(t))); }
    else if (t <= tR) { const k = (t - tT) / (tR - tT); card = t === tR ? endCard : tilted(1 - ease(k)); S = thumbOut(Se, Math.min(1, k / 0.35)); const r = rigid(card, Ge, Se); ({H, W} = raise(r.H, r.W, S, layBy(t))); }
    else if (t <= tH) { card = endCard; H = laid.H; W = laid.W; S = laidShape; }
    else if (t <= tL) { card = endCard; S = laidShape; W = lerp(laid.W, lifted, ease((t - tH) / (tL - tH))); H = handOf(elbowAt(t, W).F, jL); }
    else { card = endCard; const k = Math.min(1, (t - tL) / (tB - tL - 3)), turn = ease(k), near = ease(Math.min(1, k / 0.75)), home = ease(Math.max(0, (k - 0.75) / 0.25));
      W = k >= 1 ? W0 : lerp(lerp(lifted, approach, near), W0, home); S = shapeBetween(laidShape, S0, turn);
      H = k >= 1 ? H0 : handOf(elbowAt(t, W).F, {turn: mix(jL.turn, j0.turn, turn), flex: mix(jL.flex, j0.flex, turn), dev: mix(jL.dev, j0.dev, turn)}); }
    const a = elbowAt(t, W), p = t <= t1 || t >= tB ? f0.L.p : placed(S, H, W), j = jointsOf(axesOf(p, sign), a.F);
    receipt.push({i: t, shortMm: Math.max(0, Math.round((length(sub(W, a.sL)) - doll.upperArm - doll.forearm) * 10000) / 10), joints: j, lowestMm: Math.round(Math.min(...corners(card).map(q => q[1]), ...p.map(q => q[1])) * 10000) / 10, handLowMm: Math.round(Math.min(...p.map(q => q[1])) * 10000) / 10, handLowAt: p.reduce((b, q, i) => q[1] < p[b][1] ? i : b, 0), cardTilt: Math.asin(clamp1(card.n[1]))});
    const head = shoulderAt(t)(f0.h, 0.85), gaze = t <= tH ? card.c : lerp(endCard.c, f0.card.c, ease((t - tH) / (tB - tH)));
    frames.push({card: {c: r4(card.c), l: r4(card.l), n: r4(card.n), id: 0}, L: {s: r4(a.sL), e: r4(t <= t1 ? f0.L.e : a.e), w: r4(W), k: f0.L.k, p: p.map(r4)}, R: {s: r4(a.sR), e: r4(t <= t1 ? f0.R.e : arm(a.sR, f0.R.w, unit(sub(f0.R.e, f0.R.s)), doll).elbow), w: f0.R.w, k: f0.R.k, p: f0.R.p}, h: r4(head), g: r4(gaze)});
  }
  return {frames, receipt, lift, jD, jL, j0}; };
  // (the lean: as far as every frame with the hand out asks)
  let built = build();
  for (let again = 0; again < 3; again++) { const ws = built.frames.filter((_, t) => out(t) >= 0.999).map(f => f.L.w); const n2 = reachFrom(start, doll, ws, input.at); if (n2.lean <= need.lean + 1e-4) break; need = n2; built = build(); }
  const {frames, receipt, lift, jD, jL, j0} = built;
  for (let t = tB; t < count; t++) frames[t] = {...frames[t], L: f0.L, R: f0.R, h: f0.h, g: f0.card.c};
  const edge = frames.findIndex((f, i) => i > t2 && f.card.n[1] > 0);
  const motion = humaneMotion({fps: FPS, frameCount: count, leavesShoe: t2, edge: [edge, edge], folds: tT, rests: tR, hip: start.hip, doll: doll.name, to: [input.place], frames,
    cycle: {holdThrough: tH, liftStarts: tH + 1, liftEnds: tL, readyFrom: tB, durationSeconds: count / FPS, liftMeters: 0.022, liftHand: 'L' as const,
      method: 'Built from A2.1 by dealer3d/src/pinch-deal.ts: pinched, slid down the plate, carried low while the forearm turns it face up in the fingers, laid far edge first ON the place, lifted off, back into the shoe window.'}});
  return {motion, steer, receipt, times: {held: t1, drawn: t2, touches: tT, rests: tR, holdThrough: tH, lifted: tL, ready: tB, frames: count},
    reach: need, shortMm: Math.max(...receipt.map(r => r.shortMm)), liftMm: Math.round(lift * 1000), shoeOffMm: Math.round(off * 10000) / 10,
    grip: {tuckDeg: Math.round(best.tuck / deg), spinDeg: Math.round(best.spin / deg), swivelDeg: Math.round(best.c.swivel / deg), thumbMissMm: Math.round(best.c.thumbMiss * 10000) / 10, at: {draw: jD, touch: jT, laid: jL, start: j0}}};
}
export type PinchDeal = ReturnType<typeof pinchDeal>;
