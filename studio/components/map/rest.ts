// The rest step (A1 → A1, IDLE>IDLE) as Jakob reads it (2026-11-12: he could not find the twenty rest films): each film
// says what it shows in its own word (motion.idle.label, else its id). How the loop uses each (calm base, gestures by
// weight, on request) is lib/primaries.ts usesOf. Pure.
import type { Take } from "../../../src/clip-graph.ts";

export const REST_EDGE = "IDLE>IDLE";

/** A rest film's word: "Andning", "Leende"; else its id without the dealer and the step ("smile 02"). */
export function restWord(take: Pick<Take, "id" | "idle">): string {
  const word = take.idle?.label?.trim() || take.id.replace(/^pamela-/, "").replace(/^idle-/, "").replace(/-/g, " ");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The A1 node's line for the rest: "Vilan · 20 filmer". */
export const restLine = (count: number): string => `Vilan · ${count} ${count === 1 ? "film" : "filmer"}`;
