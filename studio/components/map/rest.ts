// The rest step (A1 → A1, IDLE>IDLE) as Jakob reads it (2026-11-12: he could not find the twenty rest films): the calm
// films are the base the rest loops on, the gestures are picked at random between them (or only when asked for), and each
// says what it shows in its own word (motion.idle.label, else its id). Pure; tests in studio/tests/rest.test.ts.
import type { Edge, Take } from "../../../src/clip-graph.ts";
import { bucketOf } from "../../lib/edge-stats.ts";

export const REST_EDGE = "IDLE>IDLE";

export type RestGroups = { lugna: Take[]; gester: Take[]; underkanda: Take[] };

/** The rest step's takes in Jakob's three groups, each by its share of the rest (weight), largest first. */
export function restGroups(edge: Pick<Edge, "takes">): RestGroups {
  const byWeight = (a: Take, b: Take) => Number(!!a.idle?.onRequest) - Number(!!b.idle?.onRequest) || (b.idle?.weight ?? 0) - (a.idle?.weight ?? 0) || a.order - b.order;
  const out: RestGroups = { lugna: [], gester: [], underkanda: [] };
  for (const take of edge.takes) {
    if (bucketOf(take) === "rejected") out.underkanda.push(take);
    else if (take.idle?.calm) out.lugna.push(take);
    else out.gester.push(take);
  }
  out.lugna.sort(byWeight);
  out.gester.sort(byWeight);
  out.underkanda.sort((a, b) => b.order - a.order);
  return out;
}

/** A rest film's word: "Andning", "Leende"; else its id without the dealer and the step ("smile 02"). */
export function restWord(take: Pick<Take, "id" | "idle">): string {
  const word = take.idle?.label?.trim() || take.id.replace(/^pamela-/, "").replace(/^idle-/, "").replace(/-/g, " ");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The A1 node's line for the rest: "Vilan · 20 filmer". */
export const restLine = (count: number): string => `Vilan · ${count} ${count === 1 ? "film" : "filmer"}`;
