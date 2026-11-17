// The schematic card path of Kortplan's "Spela kortbanan": the card from the shoe's window to its place and the hand back,
// drawn after the films (Jakob 2026-11-17: what is used as the instruction for the turn must agree with how the films move).
// A diagram to read a card's motion choices by, not a film and not a proof that a film holds the motion. Pure: one frame for a
// time t in 0…1 of one run. Tests in studio/tests/placement-path.test.ts.
//
// What it follows, with the frames (f) of the takes it was measured in (the Placering report of 2026-11-17, D):
// - The card starts as the window card as the anchors and films show it (WINDOW_CARD): standing tilted in the shoe's window,
//   its back towards the camera, its face turned towards the dealer.
// - Nyp (PINCH): lifted out of the window by its upper short end along its own long side, then carried broad side to the
//   camera in the window card's angle, larger in the hand than lying. Paow 2.1 → P4 (paow-giv-2-1-p4-04-01, 24 fps, Jakob:
//   "Kanske den bästa!"): out of the window f13–31, 127–135 × 68–73 px in the hand (f27–34), 83 × 70 px lying from f97.
// - Släp (DRAG): the window card comes down out of the shoe's mouth and slides flat along the felt under the flat hand.
//   Pamela 2.2 → P4 (pamela-p4-c1-drawn-deal-01, 30 fps, "Svinbra"): slid flat f24–62.
// - The turn rolls the card about its own long side: the back narrows across the card's width to a line along its length and
//   the face opens. Paow 2.1: back last f44, edge f45–50, face first f53 (0.36 s); Pamela 2.1 → P4 (pamela-p4-c1-plan-deal-02,
//   30 fps, "Det ser bra ut."): f52–56, all three measures say the long side. On the way (AIR) it comes mid-way between the
//   shoe and the place; at the place (PLACE) the card is brought there back up and lying, and rolls over its long edge nearest
//   the shoe, which stays on the felt (the order's turn at the place, src/order-prompts.ts turnAtPlace; Pamela 2.2 turns at
//   the place f70–75 and lies still f84–92).
// - Then it settles into the plan's landing quad over the last part of the way, and the hand goes back to the window.
// The hand is a plain shape, a palm with a thumb side. It holds the card's short end for a pinch and lies flat over the card
// for a drag, and turns with the card: for FREE (the wrist) the palm comes from facing down to facing up, for LONG_EDGE (like
// a key) the hand is seen from its side with the thumb up and rolls with the card; either stays turned until the card lies.
import { otherHand, type Hand, type Intent, type Side } from "../../src/placement-model.ts";
import type { Pt } from "./placement.ts";

/** One run in seconds of film time at full speed: the clock of Paow 2.1 → P4 (24 fps; the frames below are that film's). */
export const PATH_SECONDS = 6.3;
/** The moments of a run, in film seconds. */
export const PATH_AT = {
  /** f13: the pinch starts to draw the card out of the window. */
  lift: 0.5,
  /** f31: the card is clear of the window, in the hand. */
  out: 1.3,
  /** f44: the last frame of the back before the turn on the way. */
  turn: 1.85,
  /** f53: the first frame of the face after it. */
  turned: 2.21,
  /** f77: the card lies flat over the felt. */
  flat: 3.2,
  /** f97: the card lies still on its place. */
  laid: 4.05,
  /** The hand has let go of it. */
  free: 4.6,
  /** The hand is back at the window. */
  home: 5.8,
} as const;
/** The turn lasts 0.36 s of film, in the air as at the place. */
const TURN = PATH_AT.turned - PATH_AT.turn;
/** At the place the turn ends 0.34 s before the card lies still (Pamela 2.2: the turn f70–75, still from f84, 30 fps). */
const PLACE_TURN = PATH_AT.laid - 0.34 - TURN;
/** The card in the hand: its long side 1.5 × the lying card's near edge (Paow 2.1: 127–135 against 83 px). */
const CARRY = 1.5;
/** Its short side against its long side in the hand (Paow 2.1 f31–34: 68 against 127 px). */
const CARRY_SHAPE = 0.54;

export type PathPhase = "ready" | "take" | "pass" | "turn" | "land" | "release" | "return";
/** The hand as drawn: its outline, the thumb, a stub of the wrist, the palm's crease when the palm shows, and where its letter (V, H) stands. */
export type HandDrawing = { outline: Pt[]; thumb: Pt[]; wrist: Pt[]; crease: Pt[] | null; palm: boolean; label: Pt; size: number };
export type PathFrame = {
  /** Film seconds into the run. */
  seconds: number;
  /** The card's corners now. */
  points: Pt[];
  /** The side that shows now. */
  side: Side;
  hand: HandDrawing;
  handName: Hand;
  /** The step of the motion shown now (the motion chain's id). */
  phase: PathPhase;
  /** The way the card's centre goes, from the window to its place, as an SVG path. */
  arc: string;
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
/**
 * Fast from the shoe, slow onto the place, as the films move it: Paow 2.1's card is 25 % of the way across at f37, 64 % at
 * f44 and 83 % at f53, over 9 %, 19 % and 33 % of the time from f31 to f97 (1 − (1 − x)³ gives 24, 48 and 70 % of its curve).
 */
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (p: Pt, q: Pt, k: number): Pt => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) });
const add = (p: Pt, d: Pt, k = 1): Pt => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y });
const len = (p: Pt) => Math.hypot(p.x, p.y);
const middle = (p: Pt, q: Pt) => mix(p, q, 0.5);
const centre = (q: readonly Pt[]) => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });
const turnBy = (from: number, to: number) => ((to - from + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * A card as drawn: its centre, the angle of its long side towards the end the hand holds, and its corners in its own frame
 * (u along that side, v across it, the picture's pixels). A roll about the long side scales v.
 */
type Pose = { c: Pt; ang: number; uv: [number, number][] };
const along = (ang: number): Pt => ({ x: Math.cos(ang), y: Math.sin(ang) });
const across = (ang: number): Pt => ({ x: Math.sin(ang), y: -Math.cos(ang) });
/** A quad's pose. Corners 0 and 1 are the end the hand holds: the window card's upper short end, a lying card's far edge. */
function poseOf(q: readonly Pt[]): Pose {
  const c = centre(q);
  const held = middle(q[0], q[1]);
  const other = middle(q[2], q[3]);
  const ang = Math.atan2(held.y - other.y, held.x - other.x);
  const a = along(ang);
  const b = across(ang);
  return { c, ang, uv: q.map((p) => [(p.x - c.x) * a.x + (p.y - c.y) * a.y, (p.x - c.x) * b.x + (p.y - c.y) * b.y] as [number, number]) };
}
function cornersOf(p: Pose, roll = 1): Pt[] {
  const a = along(p.ang);
  const b = across(p.ang);
  return p.uv.map(([u, v]) => ({ x: p.c.x + u * a.x + v * roll * b.x, y: p.c.y + u * a.y + v * roll * b.y }));
}
/** A card seen straight on, in the corner order of poseOf. */
const rect = (long: number, short: number): [number, number][] => [
  [long / 2, short / 2],
  [long / 2, -short / 2],
  [-long / 2, -short / 2],
  [-long / 2, short / 2],
];
function blend(p: Pose, q: Pose, k: number): Pose {
  return { c: mix(p.c, q.c, k), ang: p.ang + turnBy(p.ang, q.ang) * k, uv: p.uv.map(([u, v], i) => [lerp(u, q.uv[i][0], k), lerp(v, q.uv[i][1], k)]) };
}
const placed = (p: Pose, c: Pt): Pose => ({ ...p, c });
const size = (p: Pose) => {
  const us = p.uv.map((x) => x[0]);
  const vs = p.uv.map((x) => x[1]);
  return { long: Math.max(...us) - Math.min(...us), short: Math.max(...vs) - Math.min(...vs), end: Math.max(...us) };
};
/**
 * Where a card turned at its place lies before the turn: beside its quad on the shoe's side, sharing the quad's long side
 * nearest the shoe (corners 1–2 or 0–3), its far and near edges carried on across it, in the same corner order (0 and 1 the
 * far edge). pivot: its corners on that side, which stay on the felt; free: its corners on the other long side, which the
 * thumb lifts, and where each lands on the quad when the card has rolled over (onto: the quad's far and near corners away
 * from the shoe).
 */
type Beside = { quad: Pt[]; pivot: [number, number]; free: [number, number]; onto: [Pt, Pt] };
function besideOf(q: readonly Pt[], shoe: Pt): Beside {
  const onRight = len(sub(middle(q[1], q[2]), shoe)) <= len(sub(middle(q[0], q[3]), shoe));
  const on = (p: Pt, from: Pt) => add(p, sub(p, from));
  return onRight
    ? { quad: [q[1], on(q[1], q[0]), on(q[2], q[3]), q[2]], pivot: [0, 3], free: [1, 2], onto: [q[0], q[3]] }
    : { quad: [on(q[0], q[1]), q[0], q[3], on(q[3], q[2])], pivot: [1, 2], free: [0, 3], onto: [q[1], q[2]] };
}
/**
 * The card rolled k (0…1) over its long side on the felt: the lifted side goes up, stands over that side at the half (seen
 * upright, a little shorter than the card is wide: the felt's perspective) and comes down on the quad's far side at 1.
 */
function rollOver(b: Beside, k: number): Pt[] {
  const swing = (1 - Math.cos(Math.PI * k)) / 2;
  const up = Math.sin(Math.PI * k);
  return b.quad.map((p, i) => {
    const n = b.free.indexOf(i);
    if (n < 0) return { ...p };
    const to = b.onto[n];
    return { x: lerp(p.x, to.x, swing), y: lerp(p.y, to.y, swing) - (len(sub(to, p)) / 2) * 0.9 * up };
  });
}
function bezier(p: Pt, c1: Pt, c2: Pt, q: Pt, k: number): Pt {
  const m = 1 - k;
  const [a, b, c, d] = [m * m * m, 3 * m * m * k, 3 * m * k * k, k * k * k];
  return { x: a * p.x + b * c1.x + c * c2.x + d * q.x, y: a * p.y + b * c1.y + c * c2.y + d * q.y };
}

// ── The hand ──
// A plain diagram: a palm with a thumb side, no anatomy. In its own frame x runs from where it holds the card outwards (in
// units of the hand's size) and y across; a roll squashes y as the hand turns with the card, so the thumb goes over to the
// other side. "pinch" holds the card's short end between thumb and fingers; "key" is the same hand seen from its side, the
// thumb up along the card's edge as on a key; "flat" lies over the card, the fingers towards its far end.
type Style = "pinch" | "flat";
// Every shape has the same number of points as the others of its kind, so that the pinch can become the key hand smoothly.
const HANDS: Record<Style | "key", { palm: [number, number][]; thumb: [number, number][]; wrist: [number, number][]; label: [number, number] }> = {
  pinch: {
    palm: [[-0.3, -0.36], [-0.2, -0.46], [0.5, -0.5], [0.8, -0.38], [0.88, 0], [0.8, 0.38], [0.5, 0.5], [-0.2, 0.46], [-0.3, 0.36]],
    thumb: [[0.25, 0.42], [-0.2, 0.62], [-0.5, 0.6], [-0.56, 0.5], [-0.3, 0.42], [0.1, 0.28]],
    wrist: [[0.82, -0.3], [1.45, -0.32], [1.45, 0.32], [0.82, 0.3]],
    label: [0.5, 0],
  },
  key: {
    palm: [[-0.3, -0.22], [-0.2, -0.28], [0.5, -0.3], [0.8, -0.24], [0.88, 0], [0.8, 0.24], [0.5, 0.3], [-0.2, 0.28], [-0.3, 0.22]],
    thumb: [[0.3, 0.26], [-0.15, 0.72], [-0.5, 0.78], [-0.58, 0.66], [-0.3, 0.46], [0.08, 0.2]],
    wrist: [[0.82, -0.22], [1.45, -0.24], [1.45, 0.24], [0.82, 0.22]],
    label: [0.5, 0],
  },
  flat: {
    palm: [[-0.62, -0.42], [0.35, -0.48], [0.7, -0.3], [0.72, 0], [0.7, 0.3], [0.35, 0.48], [-0.62, 0.42], [-0.76, 0.2], [-0.76, -0.2]],
    thumb: [[0.25, 0.45], [-0.08, 0.7], [-0.3, 0.72], [-0.34, 0.62], [-0.1, 0.52], [0.05, 0.4]],
    wrist: [[0.66, -0.3], [1.3, -0.32], [1.3, 0.32], [0.66, 0.3]],
    label: [0.05, 0],
  },
};
const CREASE: [number, number][] = [[0.0, -0.32], [0.12, -0.05], [0.16, 0.3]];
/** The hand: where it holds, its angle (x outwards), its size in pixels, its roll, its shape (key: 0 a pinch, 1 like a key). */
type Grip = { at: Pt; ang: number; size: number; roll: number; style: Style; key: number; palm: boolean };
function handOf(g: Grip): HandDrawing {
  const a = along(g.ang);
  const b = across(g.ang);
  const shape = HANDS[g.style];
  const key = HANDS.key;
  const k = g.style === "pinch" ? g.key : 0;
  // edge-on in the middle of a turn the hand keeps a little breadth, so that it stays in sight; its thumb goes over there
  const roll = Math.sign(g.roll || 1) * (0.25 + 0.75 * Math.abs(g.roll));
  const put = ([x, y]: [number, number]): Pt => ({ x: g.at.x + (a.x * x + b.x * y * roll) * g.size, y: g.at.y + (a.y * x + b.y * y * roll) * g.size });
  const toward = (list: [number, number][], other: [number, number][]) => list.map(([x, y], i) => put([lerp(x, other[i][0], k), lerp(y, other[i][1], k)]));
  return {
    outline: toward(shape.palm, key.palm),
    thumb: toward(shape.thumb, key.thumb),
    wrist: toward(shape.wrist, key.wrist),
    crease: g.palm ? CREASE.map(put) : null,
    palm: g.palm,
    label: put(shape.label),
    size: g.size,
  };
}
/**
 * The hand on a card pose: at its held end (pinch), or flat over its far half (flat: smaller than a hand would be, so that
 * the card under it stays in sight); its size follows the card's.
 */
function gripOn(p: Pose, style: Style, roll: number, key: number, palm: boolean): Grip {
  const s = size(p);
  const at = add(p.c, along(p.ang), style === "flat" ? 0.3 * s.long : s.end);
  return { at, ang: p.ang, size: (style === "flat" ? 0.6 : 0.75) * Math.sqrt(s.long * s.short), roll, style, key, palm };
}
/** Between two holds of the hand (k 0…1): its place, angle, size and roll; its shape is the second's from the half on. */
function toward(g: Grip, h: Grip, k: number): Grip {
  return { ...(k < 0.5 ? g : h), at: mix(g.at, h.at, k), ang: g.ang + turnBy(g.ang, h.ang) * k, size: lerp(g.size, h.size, k), roll: lerp(g.roll, h.roll, k), key: lerp(g.key, h.key, k) };
}

/**
 * The frame at `t` (0…1 of a run) for a card that leaves the shoe's window `window` (four corners, the upper short end first,
 * clockwise: WINDOW_CARD) and lies on its place as `quad` (the plan's landing quad, far edge first), moved as `intent` says.
 */
export function pathFrame(t: number, window: readonly Pt[], quad: readonly Pt[], intent: Intent): PathFrame {
  const A = PATH_AT;
  const s = clamp(t) * PATH_SECONDS;
  const span = (from: number, to: number) => clamp((s - from) / (to - from));
  const drag = intent.grip === "DRAG";
  const place = intent.turn && intent.turnAt === "PLACE";
  const w = poseOf(window);
  const q = poseOf(quad);
  const width = len(sub(quad[2], quad[3]));
  const long = CARRY * width;
  const held: Pose = { ...w, uv: rect(long, CARRY_SHAPE * long) };
  const beside = place ? besideOf(quad, w.c) : null;
  const lying = beside ? poseOf(beside.quad) : q;
  // Where it is when clear of the window: pulled out along its own long side (a pinch), or down out of the shoe's mouth onto
  // the felt (a drag). From there it goes on a curve to the place: for a pinch turned on the way, up and over and then down
  // onto the place, as Paow 2.1 → P4 goes (out at f27 (1327, 700), over (1190, 565) at f37, the turn from (1017, 669) at f44
  // to (934, 852) at f53, down onto (857, 1110) by f97; the curve's handles as there, the heights capped for far places);
  // coming down early and low for a pinch turned at the place; straight along the felt for a drag.
  const out = drag ? add(middle(window[2], window[3]), along(w.ang), -(size(q).long / 2 + 8)) : add(w.c, along(w.ang), size(w).long / 2 + long / 2);
  const end = lying.c;
  const dist = len(sub(end, out));
  const [c1, c2] = drag
    ? [mix(out, end, 1 / 3), mix(out, end, 2 / 3)]
    : place
      ? [{ x: lerp(out.x, end.x, 0.25), y: lerp(out.y, end.y, 0.85) }, { x: lerp(out.x, end.x, 0.6), y: end.y }]
      : [{ x: lerp(out.x, end.x, 0.38), y: out.y - Math.min(0.36 * dist, 220) }, { x: end.x, y: end.y - Math.min(0.73 * dist, 450) }];
  const curve = (k: number) => bezier(out, c1, c2, end, k);
  const travel = place ? ease(span(A.out, PLACE_TURN)) : easeOut(span(A.out, A.laid));
  const turnFrom = place ? PLACE_TURN : A.turn;
  const turnTo = turnFrom + TURN;
  const turning = intent.turn ? ease(span(turnFrom, turnTo)) : 0;
  const rolling = turning > 0 && turning < 1;
  // the hand like a key for LONG_EDGE (once out of the window until it has let go), the wrist's palm for FREE
  const keyed = !drag && !place && intent.turn && intent.flipAxis === "LONG_EDGE";
  const wrist = intent.turn && !place && intent.flipAxis !== "LONG_EDGE";

  // ── the card ──
  let pose: Pose;
  if (s < A.lift) pose = w;
  else if (s < A.out) pose = blend(w, placed(drag ? lying : held, out), ease(span(A.lift, A.out)));
  else {
    const c = curve(travel);
    if (drag) pose = placed(lying, c);
    else if (place) pose = placed(blend(held, lying, ease(span(A.out, A.out + 1))), c);
    else pose = placed(blend(held, q, ease(span(A.turned + 0.3, A.flat))), c);
  }
  // a drag turned on the way is lifted off the felt for the turn
  if (drag && !place && rolling) pose = placed(pose, add(pose.c, { x: 0, y: -0.45 * size(pose).short * Math.sin(Math.PI * turning) }));
  const done = place ? s >= turnTo : s >= A.laid;
  const points = done ? quad.map((p) => ({ ...p })) : place && rolling ? rollOver(beside!, turning) : cornersOf(pose, rolling && !place ? Math.cos(Math.PI * turning) : 1);
  const side = intent.turn && turning >= 0.5 ? intent.endSide : intent.startSide;

  // ── the hand ──
  // It turns with the card in the turn and stays turned until the card lies; after letting go it turns back on the way home.
  const handRoll = !intent.turn ? 1 : s < A.free ? Math.cos(Math.PI * turning) : lerp(-1, 1, ease(span(A.free, A.free + 0.5)));
  const key = keyed ? (s < A.free ? ease(span(A.lift, A.out)) : 1 - ease(span(A.free, A.free + 0.6))) : 0;
  const style: Style = drag ? "flat" : "pinch";
  const palm = wrist && handRoll < 0;
  const home = gripOn(w, style, 1, 0, false);
  // At the place the thumb lifts the long side nearest it and the card rolls over the other one: the hand holds the lifted
  // side, pointing away from the side that stays on the felt, and turns thumb side up with it.
  const atPlace = (k: number): Grip => {
    const b = beside!;
    const rolled = rollOver(b, k);
    const at = middle(rolled[b.free[0]], rolled[b.free[1]]);
    const p = middle(b.quad[b.pivot[0]], b.quad[b.pivot[1]]);
    return { at, ang: Math.atan2(at.y - p.y, at.x - p.x), size: gripOn(q, "pinch", 1, 0, false).size, roll: Math.cos(Math.PI * k), style: "pinch", key: 0, palm: false };
  };
  const laid = place ? atPlace(1) : gripOn(q, style, -1, 1, wrist);
  let grip: Grip;
  if (s < A.lift || s >= A.home) grip = home;
  else if (s < A.laid) {
    const on = gripOn(pose, style, handRoll, key, palm);
    // turned at the place, the hand goes over to the long side it lifts in the last half second before the turn
    grip = place && s >= turnFrom ? atPlace(turning) : place && s >= turnFrom - 0.5 ? toward(on, atPlace(0), ease(span(turnFrom - 0.5, turnFrom))) : on;
  } else {
    // let go: the hand lifts off the card, then goes back to the window
    const off = { ...laid, roll: intent.turn ? laid.roll : 1, key, palm };
    const lifted = { ...off, at: add(laid.at, along(laid.ang), 0.35 * laid.size * ease(span(A.laid, A.free))) };
    grip = s < A.free ? lifted : { ...toward({ ...off, at: add(laid.at, along(laid.ang), 0.35 * laid.size) }, home, ease(span(A.free, A.home))), roll: handRoll, key, palm };
  }
  const hand = handOf(grip);

  // ── the step shown now, and whose hand ──
  const passAt = A.out + 0.25;
  const phase: PathPhase =
    s < A.lift || s >= A.home
      ? "ready"
      : s >= A.free
        ? "return"
        : s >= A.laid
          ? "release"
          : intent.turn && s >= turnFrom && s < turnTo
            ? "turn"
            : s >= (intent.turn ? turnTo : A.turned)
              ? "land"
              : intent.pass && s >= A.out && s < Math.min(turnFrom, A.turn)
                ? "pass"
                : "take";
  const handName = intent.pass && s >= passAt && s < A.home ? otherHand(intent.takeHand) : intent.takeHand;

  // the way the card's centre goes: out of the window, the curve, and (turned at the place) over onto the place
  const way = [w.c, ...Array.from({ length: 25 }, (_, i) => curve(i / 24)), ...(place ? [q.c] : [])];
  const arc = way.map((p, i) => `${i ? "L" : "M"}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(" ");
  return { seconds: s, points, side, hand, handName, phase, arc };
}
