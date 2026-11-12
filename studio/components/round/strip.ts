// The round strip's arithmetic, pure for the tests (studio/tests/rounds.test.ts): which frame a box shows, and which
// boxes are near the strip's window, so that only those read their stills.
import type { Segment } from "../../../src/clip-graph.ts";
import { lastFrame, type PlayPart } from "../../lib/parts.ts";

/**
 * The frame a box shows: where a deal lands (its last frame played); for a return a third into its film, where the hand
 * is still by the seat it comes from (later, every return looks like the dealer at rest); the middle of anything else.
 */
export function stillOf(part: Pick<PlayPart, "start" | "end">, kind: Segment["kind"]): number {
  const last = lastFrame(part as PlayPart);
  if (kind === "DEAL") return last;
  if (kind === "RETURN") return Math.round(part.start + (last - part.start) / 3);
  return Math.round((part.start + last) / 2);
}

/** A box of the strip: its step and where it lies in the strip (px from the strip's start). */
export type BoxPlace = { step: number; left: number; width: number };

/** The steps whose box is in the window [scroll, scroll + width] or within `margin` px of it. */
export function nearSteps(scroll: number, width: number, boxes: readonly BoxPlace[], margin: number): Set<number> {
  const from = scroll - margin;
  const to = scroll + width + margin;
  return new Set(boxes.filter((b) => b.left + b.width > from && b.left < to).map((b) => b.step));
}

export const sameSet = (a: ReadonlySet<number>, b: ReadonlySet<number>) => a.size === b.size && [...a].every((x) => b.has(x));
