// Jakob's decision on one take, as it is written: the one place for the rule "Primär lowers an earlier Primär on the same
// edge". Pure: no DOM, no React; the writer comes in as an argument (putDecision in the studio, a fake in the tests).
// DecisionBar (components/takes) and "Gör primär" (components/primary, through makePrimary) both call it, and only from
// his own click. In the online copy putDecision refuses every write (lib/api.ts), so nothing can be written there either.
import type { Graph, Take } from "../../src/clip-graph.ts";
import type { Decision, DecisionResult } from "./api.ts";
import { takeName } from "./names.ts";
import { storedNote } from "./verdict.ts";

export type Put = (id: string, decision: Decision, note: string, revision: string) => Promise<DecisionResult>;
/** lowered: earlier Primär takes on the edge now plain accepted; failed: those that could not be lowered (still Primär). */
export type Decided = { lowered: string[]; failed: string[] };

/**
 * Writes one decision with its note. For Primär, every other Primär on the take's edge then becomes plain accepted with its
 * own note kept; a failed lowering is reported in `failed`, not thrown. Without a graph (no bank read yet) nothing is lowered.
 * Throws what the first write throws (a 409 among them): then nothing else has been written.
 */
export async function decide(take: Take, decision: Decision, note: string, graph: Graph | null, put: Put): Promise<Decided> {
  if (!take.revision) throw new Error("Tagningen har ingen post i motions/ ännu, så beslutet kan inte sparas.");
  await put(take.id, decision, decision === "PENDING" ? "" : note, take.revision);
  const lowered: string[] = [];
  const failed: string[] = [];
  if (decision !== "MAIN" || !graph) return { lowered, failed };
  const edge = graph.edge[take.edge];
  for (const other of Object.values(graph.takes)) {
    if (other.id === take.id || other.edge !== take.edge || !other.explicitMain || !other.revision) continue;
    const name = takeName(other, edge?.takes);
    try {
      await put(other.id, "ACCEPTED", storedNote(other.motion?.review), other.revision);
      lowered.push(name);
    } catch {
      failed.push(name);
    }
  }
  return { lowered, failed };
}

/** Primär with his stored note kept: "Gör primär" on the Primära page. */
export function makePrimary(take: Take, graph: Graph, put: Put): Promise<Decided> {
  return decide(take, "MAIN", storedNote(take.motion?.review), graph, put);
}
