// What the node map and its side panel say about one edge (a film between two anchors): what plays there now and why,
// the takes sorted into Jakob's five groups and counted, and the bank in numbers. Pure: no DOM, no network; tests in
// studio/tests/edge-stats.test.ts.
import { GAP_LABEL, playable, resolveRound, type Edge, type Gap, type Graph, type Step, type Take, type Why } from "../../src/clip-graph.ts";
import type { HubDeal } from "../../src/game-director.ts";
import { edgeName, nodeCode, takeName } from "./names.ts";
import { verdictOf, verdictPhrase, type Verdict } from "./verdict.ts";

// ── Takes in groups ─────────────────────────────────────────────────────────
// accepted: Primär or Godkänd (his or a reviewer's). variants: accepted as a variant, or written from another READY pose
// (A2.2, a variant start). waiting: not finished or not decided. rejected: Underkänd, a secondary alternative, or failed.
export type Bucket = "accepted" | "variants" | "waiting" | "rejected";
export const BUCKETS: readonly Bucket[] = ["accepted", "variants", "waiting", "rejected"];
export const BUCKET_SIGN: Record<Bucket, string> = { accepted: "✓", variants: "◆", waiting: "○", rejected: "✕" };
export const BUCKET_WORD: Record<Bucket, [string, string]> = {
  accepted: ["godkänd", "godkända"],
  variants: ["variant", "varianter"],
  waiting: ["väntar", "väntar"],
  rejected: ["underkänd", "underkända"],
};

export function bucketOf(take: Take): Bucket {
  if (take.stage === "FAILED") return "rejected";
  const verdict = verdictOf(take).verdict;
  if (verdict === "underkand") return "rejected";
  if (verdict === "vantar") return "waiting";
  if (verdict === "variant" || take.hub) return "variants";
  return "accepted";
}

export type Counts = Record<Bucket, number> & { total: number };
export function edgeCounts(edge: Pick<Edge, "takes">): Counts {
  const counts: Counts = { accepted: 0, variants: 0, waiting: 0, rejected: 0, total: edge.takes.length };
  for (const take of edge.takes) counts[bucketOf(take)]++;
  return counts;
}

/** "1 godkänd, 2 varianter, 1 underkänd": the counts in words, for a tooltip or a screen reader. */
export function countsText(counts: Counts): string {
  const parts = BUCKETS.filter((b) => counts[b]).map((b) => `${counts[b]} ${BUCKET_WORD[b][counts[b] === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(", ") : "inga tagningar";
}

/** The five groups of the side panel, newest first in each; the take that plays (first) leads its group. */
export type TakeGroups = { primar: Take[]; godkanda: Take[]; varianter: Take[]; vantar: Take[]; underkanda: Take[] };
export function groupTakes(edge: Pick<Edge, "takes">, first: Take | null = null): TakeGroups {
  const sorted = [...edge.takes].sort((a, b) => Number(b === first) - Number(a === first) || b.order - a.order);
  const groups: TakeGroups = { primar: [], godkanda: [], varianter: [], vantar: [], underkanda: [] };
  for (const take of sorted) {
    const bucket = bucketOf(take);
    if (bucket === "accepted") (take.explicitMain ? groups.primar : groups.godkanda).push(take);
    else if (bucket === "variants") groups.varianter.push(take);
    else if (bucket === "waiting") groups.vantar.push(take);
    else groups.underkanda.push(take);
  }
  return groups;
}

/** Accepted outright by Jakob himself: his ✓, not as a variant, not from another READY pose, finished, with a film. */
export const isOutright = (take: Take): boolean =>
  take.decision === "ACCEPTED" && !take.variant && !take.hub && take.motion?.review?.userAccepted === true && playable(take) && !!take.media.video;

/** The edge's Primär, if Jakob has set one. */
export const primaryOf = (edge: Pick<Edge, "takes">): Take | null => edge.takes.find((t) => t.explicitMain && playable(t)) ?? null;

// ── What plays now ──────────────────────────────────────────────────────────
// A take is chosen with what stands around it in a round: a return prefers one that continues the deal before it, and a
// deal before a Primär return is one that return continues. So an edge is resolved in the shortest chain a round plays
// it in: a deal with its return to A2.1 after it, a return with its deal before it, anything else alone.
export function chainFor(edge: Pick<Edge, "from" | "to" | "kind" | "target" | "experiment">): { steps: Step[]; at: number } {
  const own = { from: edge.from, to: edge.to };
  if (edge.experiment || !edge.target) return { steps: [own], at: 0 };
  if (edge.kind === "DEAL") return { steps: [own, { from: edge.to, to: "READY" }], at: 0 };
  if (edge.kind === "RETURN") return { steps: [{ from: "READY", to: edge.from }, own], at: 1 };
  return { steps: [own], at: 0 };
}

// hubs: what the round deals from another pose at the shoe (hubDeals in src/game-director.ts, the game's own rule): such an edge
// plays the take the game deals with, from that pose (hub), and is no gap. Without hubs every edge is resolved as above.
export type Hubs = Readonly<Record<string, HubDeal>>;
export type Playing = { take: Take | null; why: Why; gap: Gap | null; notes: string[]; film: Edge | null; before: Take | null; hub: string | null };
export function playing(graph: Graph, edgeId: string, hubs: Hubs = {}): Playing {
  const edge = graph.edge[edgeId];
  if (!edge) return { take: null, why: "GAP", gap: "INVALID", notes: [], film: null, before: null, hub: null };
  const via = hubs[edgeId], dealt = via ? graph.takes[via.take] : null;
  if (via && dealt) {
    const deal = edge.kind === "RETURN" ? Object.entries(hubs).find(([id, h]) => h.hub === via.hub && graph.edge[id]?.kind === "DEAL" && graph.edge[id]?.target === edge.target)?.[1] : null;
    return { take: dealt, why: via.why, gap: null, notes: [], film: graph.edge[dealt.edge] ?? edge, before: deal ? (graph.takes[deal.take] ?? null) : null, hub: via.hub };
  }
  const { steps, at } = chainFor(edge);
  const segments = resolveRound(graph, steps, {});
  const seg = segments[at];
  return {
    take: seg.take,
    why: seg.why,
    gap: seg.gap,
    // Where the rendered card is moved to is not this page's question (it needs the placement plan).
    notes: seg.notes.filter((note) => !note.startsWith("Kortets flytt")),
    film: seg.film,
    before: at > 0 ? (segments[at - 1].take ?? null) : null,
    hub: null,
  };
}

// ── The chip on an edge ─────────────────────────────────────────────────────
// What plays: the verdict of that take; or, when nothing does, why not, in a word ("saknas" for a gap).
export type Tag = { kind: "take"; verdict: Verdict; byJakob: boolean } | { kind: "gap"; gap: Gap; word: string };
const GAP_WORD: Record<Gap, string> = { MISSING: "saknas", REJECTED: "saknas", WAITING: "renderas", LOCAL_ONLY: "ingen film", INVALID: GAP_LABEL.INVALID };
export function edgeTag(now: Pick<Playing, "take" | "gap">): Tag {
  if (now.take && now.gap !== "LOCAL_ONLY") {
    const v = verdictOf(now.take);
    return { kind: "take", verdict: v.verdict, byJakob: v.byJakob };
  }
  const gap = now.gap ?? "MISSING";
  return { kind: "gap", gap, word: GAP_WORD[gap] };
}

/** Everything the map shows of one edge, and the same said in words (a tooltip and a screen reader's name). */
export type EdgeInfo = { edge: Edge; now: Playing; tag: Tag; counts: Counts; title: string };
/** "ankare 2.2": the anchor a READY pose is, in Jakob's words. */
export const hubAnchor = (hub: string): string => `ankare ${nodeCode(hub).replace(/^A/, "")}`;
/** "I rundan ges platsen från A2.2 (ankare 2.2), via vila": the line for an edge the round plays from another pose at the shoe. */
export const hubLine = (hub: string): string => `I rundan ges platsen från ${nodeCode(hub)} (${hubAnchor(hub)}), via vila`;
export function edgeInfo(graph: Graph, edgeId: string, hubs: Hubs = {}): EdgeInfo | null {
  const edge = graph.edge[edgeId];
  if (!edge) return null;
  const now = playing(graph, edgeId, hubs);
  const tag = edgeTag(now);
  const counts = edgeCounts(edge);
  const plays = now.take
    ? `spelar ${takeName(now.take, graph.edge[now.take.edge]?.takes)} (${verdictPhrase(verdictOf(now.take))})`
    : tag.kind === "gap" ? tag.word : "";
  return { edge, now, tag, counts, title: `${edgeName(edge)} · ${plays}${now.hub ? ` · via ${hubAnchor(now.hub)}` : ""} · ${countsText(counts)}` };
}

// ── The bank in numbers ─────────────────────────────────────────────────────
// Over the films the mode needs (graph.summary.films.required): how many have a film Jakob accepted outright, how many
// play a variant now, how many play nothing, how many have a Primär. The first two can overlap: an edge can have his
// accepted take and still play a variant (the variant continues the deal before it).
export type Summary = { films: number; outright: number; variant: number; missing: number; primary: number };
export function bankSummary(graph: Graph, hubs: Hubs = {}): Summary {
  const out: Summary = { films: 0, outright: 0, variant: 0, missing: 0, primary: 0 };
  for (const id of graph.summary.films.required) {
    const edge = graph.edge[id];
    if (!edge) continue;
    const now = playing(graph, id, hubs);
    out.films++;
    if (edge.takes.some(isOutright)) out.outright++;
    if (now.take && verdictOf(now.take).verdict === "variant") out.variant++;
    if (!now.take) out.missing++;
    if (primaryOf(edge)) out.primary++;
  }
  return out;
}
