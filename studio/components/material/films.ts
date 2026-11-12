// The bank's films in a few numbers per seat, for the row Filmer: not a second map, only how many takes each seat has and
// how they stand, with the map one click away. Pure: no DOM, no network; tests in studio/tests/media.test.ts.
import type { Edge, Graph } from "../../../src/clip-graph.ts";
import { BUCKETS, bucketOf, type Bucket } from "../../lib/edge-stats.ts";

export type SeatGroup = { key: string; label: string; sub: string; steps: number; takes: number; counts: Record<Bucket, number> };

const SEATS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"] as const;

/** Rest and entry, each seat, the dealer, and the experiments: takes counted in Jakob's four groups. */
export function seatGroups(graph: Pick<Graph, "edges" | "experiments">): SeatGroup[] {
  const group = (key: string, label: string, sub: string, edges: readonly Edge[]): SeatGroup => {
    const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
    let takes = 0;
    for (const edge of edges) for (const take of edge.takes) {
      counts[bucketOf(take)]++;
      takes++;
    }
    return { key, label, sub, steps: edges.filter((e) => e.takes.length).length, takes, counts };
  };
  const seatOf = (edge: Edge) => (edge.target ? edge.target.split(".")[0] : null);
  return [
    group("vila", "Vila och ingång", "vila, ingång, utgång, kommer, går", graph.edges.filter((e) => !e.target)),
    ...SEATS.map((seat) => group(seat, seat, `plats ${seat.slice(1)}`, graph.edges.filter((e) => seatOf(e) === seat))),
    group("D", "Dealern", "dealerns kort och vändningen", graph.edges.filter((e) => seatOf(e) === "D")),
    group("prov", "Experiment", "utanför de 54 stegen", graph.experiments),
  ];
}

/** Every take of the bank, once. */
export const takeCount = (graph: Pick<Graph, "takes">): number => Object.keys(graph.takes).length;
