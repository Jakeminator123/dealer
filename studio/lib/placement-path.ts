// The schematic card path the old tab plays with "Spela kortbana" (src/lab-ui.ts animatePath): from the shoe to the card's
// place on an arc, turned on the way if the card is turned, laid, let go, and the hand back to the shoe. A drawing to read
// a card's motion choices by, not a film and not a proof that a film holds the motion. Pure: one frame for a time t in 0…1.
// Tests in studio/tests/placement-path.test.ts.
import { otherHand, type Hand, type Intent, type Side } from "../../src/placement-model.ts";
import type { Pt } from "./placement.ts";

/** How long one run takes, in milliseconds. */
export const PATH_MS = 6000;
export type PathPhase = "ready" | "take" | "pass" | "turn" | "land" | "release" | "return";
export type PathFrame = {
  /** The card's corners now. */
  points: Pt[];
  /** The side that shows now. */
  side: Side;
  /** Where the hand marker is, and whose hand it is. */
  hand: Pt;
  handName: Hand;
  /** The step of the motion shown now (the motion chain's id). */
  phase: PathPhase;
  /** The dashed arc from the shoe to the place, as an SVG path. */
  arc: string;
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);

/** The frame at `t` (0…1) for a card going from the shoe point `start` to its place `end`, drawn as `quad` when it lies. */
export function pathFrame(t: number, start: Pt, end: Pt, quad: readonly Pt[], intent: Intent): PathFrame {
  const time = clamp(t);
  const travel = ease(clamp((time - 0.08) / 0.5));
  const flip = intent.turn ? ease(clamp((time - 0.19) / 0.23)) : 0;
  const c = { x: start.x + (end.x - start.x) * travel, y: start.y + (end.y - start.y) * travel - Math.sin(Math.PI * travel) * 100 };
  const cosine = Math.cos(flip * Math.PI);
  const side = cosine >= 0 ? intent.startSide : intent.endSide;
  const points = time >= 0.58 ? quad.map((p) => ({ ...p })) : quad.map((p) => ({ x: c.x + (p.x - end.x) * cosine, y: c.y + p.y - end.y }));
  const back = ease(clamp((time - 0.68) / 0.26));
  const hand = { x: c.x + (start.x - c.x) * back, y: c.y + (start.y - c.y) * back };
  const phase: PathPhase =
    time < 0.08 ? "ready" : time < 0.19 ? "take" : time < 0.42 ? (intent.turn ? "turn" : intent.pass ? "pass" : "take") : time < 0.58 ? "land" : time < 0.68 ? "release" : time < 0.94 ? "return" : "ready";
  const handName = intent.pass && time >= 0.18 ? otherHand(intent.takeHand) : intent.takeHand;
  const arc = `M${start.x},${start.y} Q${(start.x + end.x) / 2},${Math.min(start.y, end.y) - 150} ${end.x},${end.y}`;
  return { points, side, hand, handName, phase, arc };
}
