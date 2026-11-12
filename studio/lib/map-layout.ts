// The node map's geometry (Karta): where each anchor sits and where each film's line and label go. Pure: no DOM; tests
// in studio/tests/map-layout.test.ts.
//
// The table as a player sees it (tableLayout in src/clip-graph.ts): the seats in an arc, P1 left to P7 right, the
// dealer's cards above them, A1 (vila) at the upper left, A2.1 (nyp) and A2.2 (hand över) by the shoe at the upper right,
// Borta above A1 and "DC2 upp" beside the dealer. As in the old lab's tree, each anchor has a rail: A2.1's runs down the
// right and across between the dealer and the seats, A1's down the left, under the seats and over the dealer. A film is
// a short line of its own between a card and a rail, so no two films lie on top of each other, and its label sits on it.
// A card's deal and return to A2.1 stand side by side with their labels on two rows; its return to A1 leaves from the
// card's other side. With one film per seat only C1's three films are drawn; C2 says how far its card is moved.
import { SEATS, bankEdges, filmCard, parseEdge, tableLayout, type FilmMode } from "../../src/clip-graph.ts";

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Dir = "up" | "down" | "left" | "right";

/** One card's place inside a seat or the dealer: its centre, its box, and whether its own films are drawn. */
export type Field = { card: string; x: number; box: Box; drawn: boolean; optional: boolean };
export type MapNode =
  | { id: string; type: "hub"; node: string; box: Box }
  | { id: string; type: "seat"; seat: string; box: Box; fields: Field[] }
  | { id: string; type: "dealer"; box: Box; fields: Field[] };
/**
 * A film on the map. path: its own line (between rail and card, or between two anchors). route: the whole way from one
 * anchor to the other along the rails, drawn when it is chosen or under the pointer. label: the box its chip sits in, or
 * null when the chip lives inside a node (the idle loop in A1). nodes: the map nodes it touches.
 */
export type MapEdge = { id: string; path: string; route: string; arrow: Pt & { dir: Dir }; label: Box | null; nodes: string[] };
export type Rail = { id: string; path: string; text: (Pt & { value: string; anchor: "start" | "end" }) | null };
export type MapLayout = { width: number; height: number; nodes: MapNode[]; edges: MapEdge[]; rails: Rail[] };

export const MAP = {
  label: { w: 92, h: 22 },
  /** A card's deal and return lines stand this far left and right of its centre. */
  stub: 30,
  /** From one seat's C1 to the next. */
  pitch: { SEAT: 172, CARD: 288 },
  field: { w: 72, h: 34 },
  seatH: 72,
  dealerH: 66,
  hub: { w: 160, h: 64 },
  small: { w: 132, h: 46 },
  /** How much lower P4 sits than the seats at the ends of the arc. */
  depth: 70,
} as const;

const IDLE_TRUNK = 40;
const A1_X = 96;
const FIRST = 136; // P1's C1 centre

const box = (cx: number, cy: number, w: number, h: number): Box => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const labelAt = (x: number, y: number) => box(x, y, MAP.label.w, MAP.label.h);
const r = (n: number) => Math.round(n * 10) / 10;
const M = (x: number, y: number) => `M${r(x)},${r(y)}`;
const V = (y: number) => `V${r(y)}`;
const H = (x: number) => `H${r(x)}`;

/** Each card's centre from the placement plan, in the film's pixels. */
export type PlanPoints = Record<string, Pt> | null | undefined;

/** The edges the map draws in a mode: every model edge except, with one film per seat, a seat's second card. */
export function drawnEdges(mode: FilmMode): string[] {
  return bankEdges()
    .filter((e) => mode === "CARD" || !e.target || e.kind === "REVEAL" || filmCard(e.target, true) === e.target)
    .map((e) => e.id);
}

export function mapLayout({ mode, points }: { mode: FilmMode; points?: PlanPoints }): MapLayout {
  const card = mode === "CARD";
  const pitch = MAP.pitch[mode];
  const s = MAP.stub;
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const rails: Rail[] = [];

  // ── Rows, top down ──
  const awayTop = 14;
  const awayLabel = 84;
  const hubTop = 114;
  const idleRail = 206; // A1's rail over the dealer
  const dealerIdleLabel = 232;
  const dealerTop = 258;
  const dealerBottom = dealerTop + MAP.dealerH;
  const dealerReturnLabel = dealerBottom + 24;
  const dealerDealLabel = dealerBottom + 52;
  const bus = dealerDealLabel + 24; // A2.1's rail between the dealer and the seats
  const seatDealLabel = bus + 24;
  const seatReturnLabel = bus + 52;
  const seatTop = bus + 78;

  // ── Seats: even steps left to right (so the labels have room), the arc's depth from the plan as tableLayout reads it ──
  const table = tableLayout(points ?? null);
  const depthOf = SEATS.map((seat) => table[`${seat}.C1`].y);
  const d0 = Math.min(...depthOf);
  const d1 = Math.max(...depthOf);
  const seats = SEATS.map((seat, i) => {
    const c1 = FIRST + i * pitch;
    const top = seatTop + (d1 > d0 ? ((depthOf[i] - d0) / (d1 - d0)) * MAP.depth : 0);
    const c2 = card ? c1 + 120 : c1 + 74;
    return { seat, c1, c2, top, bottom: top + MAP.seatH, left: c1 - 44, right: card ? c2 + 48 : c1 + 116 };
  });
  const seatBottom = Math.max(...seats.map((x) => x.bottom));
  const idleLabel = seatBottom + 26;
  const idleBus = idleLabel + 24;

  // ── Dealer: its fields one seat pitch apart, slid sideways so that its lines never meet a seat's at A2.1's rail ──
  const seatStubs = seats.flatMap((x) => [x.c1 - s, x.c1 + s, ...(card ? [x.c2 - s, x.c2 + s] : [])]);
  const want = (seats[0].c1 + seats[6].c1) / 2 - pitch;
  const stubsAt = (d: number) => [0, 1, 2].flatMap((k) => [d + k * pitch - s, d + k * pitch + s]);
  let d1x = want;
  let best = -1;
  for (let d = Math.round(want - pitch / 2); d <= want + pitch / 2; d += 2) {
    const gap = Math.min(...stubsAt(d).flatMap((x) => seatStubs.map((y) => Math.abs(x - y))));
    if (gap > best + 0.5 || (Math.abs(gap - best) <= 0.5 && Math.abs(d - want) < Math.abs(d1x - want))) {
      best = gap;
      d1x = d;
    }
  }
  const dealerX = [0, 1, 2].map((k) => d1x + k * pitch);

  // ── Anchors ──
  const last = seats[6];
  const readyTrunk = last.right + 22;
  const a1 = box(A1_X, hubTop + MAP.hub.h / 2, MAP.hub.w, MAP.hub.h);
  const a21: Box = { x: readyTrunk + 20 - MAP.hub.w, y: hubTop, w: MAP.hub.w, h: MAP.hub.h };
  const away = box(A1_X, awayTop + 20, MAP.hub.w, 40);
  const a22: Box = { x: a21.x + MAP.hub.w - MAP.small.w - 30, y: idleRail, w: MAP.small.w, h: MAP.small.h };
  const reveal = box(dealerX[2] + 56 + 40 + MAP.small.w / 2, dealerTop + MAP.small.h / 2, MAP.small.w, MAP.small.h);
  nodes.push({ id: "AWAY", type: "hub", node: "AWAY", box: away });
  nodes.push({ id: "IDLE", type: "hub", node: "IDLE", box: a1 });
  nodes.push({ id: "READY", type: "hub", node: "READY", box: a21 });
  nodes.push({ id: "READY-B", type: "hub", node: "READY-B", box: a22 });
  nodes.push({ id: "REVEAL", type: "hub", node: "REVEAL(D.C2)", box: reveal });

  // ── Seat and dealer nodes ──
  // A field sits under the node's name row (24 high). With one film per seat C1 is a small box and C2 the words beside it.
  const fieldAt = (x: number, top: number, w: number = MAP.field.w, h: number = MAP.field.h) => box(x, top + 24 + h / 2, w, h);
  for (const x of seats) {
    const second: Box = card ? fieldAt(x.c2, x.top, MAP.field.w, 40) : { x: x.c1 + 32, y: x.top + 24, w: x.right - 6 - (x.c1 + 32), h: 40 };
    nodes.push({
      id: x.seat,
      type: "seat",
      seat: x.seat,
      box: { x: x.left, y: x.top, w: x.right - x.left, h: MAP.seatH },
      fields: [
        { card: `${x.seat}.C1`, x: x.c1, box: fieldAt(x.c1, x.top, card ? MAP.field.w : 56, 40), drawn: true, optional: false },
        { card: `${x.seat}.C2`, x: x.c2, box: second, drawn: card, optional: false },
      ],
    });
  }
  nodes.push({
    id: "D",
    type: "dealer",
    box: { x: dealerX[0] - 56, y: dealerTop, w: dealerX[2] - dealerX[0] + 112, h: MAP.dealerH },
    fields: dealerX.map((x, k) => ({ card: `D.C${k + 1}`, x, box: fieldAt(x, dealerTop, 96), drawn: true, optional: k === 2 })),
  });

  // ── Rails ──
  const lastIdleStub = card ? last.c2 : last.c1;
  const revealX = reveal.x + reveal.w / 2;
  const a1Bottom = a1.y + a1.h;
  const a21Bottom = a21.y + a21.h;
  rails.push({ id: "rail-ready", path: `${M(readyTrunk, a21Bottom)}${V(bus)}${H(seats[0].c1 - s)}`, text: { x: readyTrunk - 10, y: bus - 8, value: "A2.1 · nyp vid skon", anchor: "end" } });
  rails.push({ id: "rail-idle", path: `${M(IDLE_TRUNK, a1Bottom)}${V(idleBus)}${H(lastIdleStub)}`, text: { x: lastIdleStub + 14, y: idleBus + 4, value: "A1 · vila", anchor: "start" } });
  rails.push({ id: "rail-idle-top", path: `${M(IDLE_TRUNK, idleRail)}${H(revealX)}`, text: null });

  // ── Films ──
  const fromReady = (x: number) => `${M(readyTrunk, a21Bottom)}${V(bus)}${H(x)}`; // A2.1 along its rail to x
  const fromIdle = (y: number, x: number) => `${M(IDLE_TRUNK, a1Bottom)}${V(y)}${H(x)}`; // A1 along a rail to x
  const toReady = `${H(readyTrunk)}${V(a21Bottom)}`;
  const toIdle = `${H(IDLE_TRUNK)}${V(a1Bottom)}`;
  const ax = a1.x + a1.w; // A1's right edge
  const mid = (ax + a21.x) / 2;

  for (const id of drawnEdges(mode)) {
    const ref = parseEdge(id)!;
    const target = ref.target;
    let e: MapEdge | null = null;
    if (target && target[0] === "P") {
      const x = seats.find((q) => q.seat === target.split(".")[0])!;
      const cx = target.endsWith("C1") ? x.c1 : x.c2;
      if (ref.kind === "DEAL") e = { id, path: `${M(cx - s, bus)}${V(x.top)}`, route: `${fromReady(cx - s)}${V(x.top)}`, arrow: { x: cx - s, y: x.top, dir: "down" }, label: labelAt(cx - s, seatDealLabel), nodes: ["READY", x.seat] };
      else if (ref.to === "READY") e = { id, path: `${M(cx + s, x.top)}${V(bus)}`, route: `${M(cx + s, x.top)}${V(bus)}${toReady}`, arrow: { x: cx + s, y: bus, dir: "up" }, label: labelAt(cx + s, seatReturnLabel), nodes: [x.seat, "READY"] };
      else e = { id, path: `${M(cx, x.bottom)}${V(idleBus)}`, route: `${M(cx, x.bottom)}${V(idleBus)}${toIdle}`, arrow: { x: cx, y: idleBus, dir: "down" }, label: labelAt(cx, idleLabel), nodes: [x.seat, "IDLE"] };
    } else if (target && target[0] === "D" && ref.kind !== "REVEAL") {
      const cx = dealerX[Number(target.slice(-1)) - 1];
      if (ref.kind === "DEAL") e = { id, path: `${M(cx - s, bus)}${V(dealerBottom)}`, route: `${fromReady(cx - s)}${V(dealerBottom)}`, arrow: { x: cx - s, y: dealerBottom, dir: "up" }, label: labelAt(cx - s, dealerDealLabel), nodes: ["READY", "D"] };
      else if (ref.to === "READY") e = { id, path: `${M(cx + s, dealerBottom)}${V(bus)}`, route: `${M(cx + s, dealerBottom)}${V(bus)}${toReady}`, arrow: { x: cx + s, y: bus, dir: "down" }, label: labelAt(cx + s, dealerReturnLabel), nodes: ["D", "READY"] };
      else e = { id, path: `${M(cx, dealerTop)}${V(idleRail)}`, route: `${M(cx, dealerTop)}${V(idleRail)}${toIdle}`, arrow: { x: cx, y: idleRail, dir: "up" }, label: labelAt(cx, dealerIdleLabel), nodes: ["D", "IDLE"] };
    } else if (ref.kind === "REVEAL") {
      e = { id, path: `${M(revealX, idleRail)}${V(reveal.y)}`, route: `${fromIdle(idleRail, revealX)}${V(reveal.y)}`, arrow: { x: revealX, y: reveal.y, dir: "down" }, label: labelAt(revealX, dealerIdleLabel), nodes: ["IDLE", "REVEAL"] };
    } else if (ref.kind === "ENTRY") {
      const y = a1.y + 22;
      e = { id, path: `${M(ax, y)}${H(a21.x)}`, route: `${M(ax, y)}${H(a21.x)}`, arrow: { x: a21.x, y, dir: "right" }, label: labelAt(mid - 70, y), nodes: ["IDLE", "READY"] };
    } else if (ref.kind === "RETURN") {
      const y = a1.y + 44; // A2.1 to A1 without a card: the exit
      e = { id, path: `${M(a21.x, y)}${H(ax)}`, route: `${M(a21.x, y)}${H(ax)}`, arrow: { x: ax, y, dir: "left" }, label: labelAt(mid + 70, y), nodes: ["READY", "IDLE"] };
    } else if (ref.kind === "ARRIVE") {
      const x = A1_X - 50;
      e = { id, path: `${M(x, away.y + away.h)}${V(a1.y)}`, route: `${M(x, away.y + away.h)}${V(a1.y)}`, arrow: { x, y: a1.y, dir: "down" }, label: labelAt(x, awayLabel), nodes: ["AWAY", "IDLE"] };
    } else if (ref.kind === "LEAVE") {
      const x = A1_X + 50;
      e = { id, path: `${M(x, a1.y)}${V(away.y + away.h)}`, route: `${M(x, a1.y)}${V(away.y + away.h)}`, arrow: { x, y: away.y + away.h, dir: "up" }, label: labelAt(x, awayLabel), nodes: ["IDLE", "AWAY"] };
    } else if (ref.kind === "IDLE") {
      e = { id, path: "", route: "", arrow: { x: a1.x, y: a1.y, dir: "right" }, label: null, nodes: ["IDLE"] }; // its chip lives inside A1
    }
    if (e) edges.push(e);
  }

  const width = Math.max(a21.x + a21.w, lastIdleStub + 90, ...nodes.map((n) => n.box.x + n.box.w)) + 16;
  return { width, height: idleBus + 18, nodes, edges, rails };
}

/** Do two boxes overlap (touching is not overlapping)? gap widens the test. */
export const overlaps = (a: Box, b: Box, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** The straight pieces of a path made of M, V and H commands, as boxes of no width or no height. */
export function segments(path: string): Box[] {
  const out: Box[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, a, b] of path.matchAll(/([MVH])(-?[\d.]+)(?:,(-?[\d.]+))?/g)) {
    const n = Number(a);
    if (cmd === "M") {
      x = n;
      y = Number(b);
    } else if (cmd === "V") {
      out.push({ x, y: Math.min(y, n), w: 0, h: Math.abs(n - y) });
      y = n;
    } else {
      out.push({ x: Math.min(x, n), y, w: Math.abs(n - x), h: 0 });
      x = n;
    }
  }
  return out;
}

/** How far the second card of a seat lies from its first in the plan (film pixels), as the old lab's kbReach. */
export function seatReach(points: PlanPoints, seat: string): number | null {
  const a = points?.[`${seat}.C1`];
  const b = points?.[`${seat}.C2`];
  if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y));
}
/** The still-image trial on P4 held up to about 45–50 px; beyond that the moved card is a warning. */
export const REACH_LIMIT = 50;
