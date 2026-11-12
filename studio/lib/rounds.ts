// Rounds for the Spela view: the ready-made ones as chips, the one his notation or the address asks for, a take played in
// its context, and the card places the bank needs to say how far a seat's second card is moved. Pure: no DOM, no network;
// tests in studio/tests/rounds.test.ts.
import { SEATS, formatSequence, parseEdge, playable, returnFits, roundSequence, type Graph, type Step, type Take } from "../../src/clip-graph.ts";
import { TARGETS, toPixels, type PlacementPlan } from "../../src/placement-model.ts";
import { edgeName, formatJakob, formatSeconds, parseJakob, takeName } from "./names.ts";
import { roundSeconds, type PlayPart } from "./parts.ts";

/**
 * A round: name for its chip, text for the address (?runda=…) in his notation, or the lab's own with pinned takes
 * ("IDLE>READY@<take> | …") where a take is locked, the steps resolveRound gets, and what could not be read.
 */
export type Round = { key: string; name: string; text: string; steps: Step[]; errors: string[] };

const fromText = (key: string, name: string, text: string): Round => ({ key, name, text, ...parseJakob(text) });
const fromSteps = (key: string, name: string, steps: Step[]): Round => ({
  key,
  name,
  text: steps.some((s) => s.take) ? formatSequence(steps) : formatJakob(steps),
  steps,
  errors: [],
});

// Jakob, 2026-11-12, of the film to seat 4 the scene's own page plays: "väldigt bra". The three takes are locked.
export const SEAT_FOUR =
  "IDLE>READY@pamela-idle-ready-entry-01 | READY>P4.C1@pamela-p4-c1-plan-deal-02 | P4.C1>IDLE@pamela-p4-c1-plan-return-idle-01";
// The deal of V6 to one seat, both cards, written as he writes it.
export const V6_DEAL = "A2.1 - P4C1 - A2.1 - P4C2 - A2.1";

const plain = (edges: { from: string; to: string }[]): Step[] => edges.map((e) => ({ from: e.from, to: e.to }));

/** The ready-made rounds, in the order of their chips: his favourite, the V6 deal, every seat with the hole card, one per seat. */
export function readyRounds(): Round[] {
  return [
    fromText("plats-4", "Plats 4", SEAT_FOUR),
    fromText("v6", "V6-given", V6_DEAL),
    fromSteps("alla", "Alla platser", plain(roundSequence({ seats: SEATS, reveal: true }))),
    ...SEATS.map((seat) => fromSteps(seat.toLowerCase(), seat, plain(roundSequence({ seats: [seat], dealer: false, cards: 1 })))),
  ];
}

const stepKey = (steps: readonly Step[]) => steps.map((s) => `${s.from}>${s.to}@${s.take ?? ""}`).join("|");
/** The ready-made round with exactly these steps, if any (to mark its chip). */
export const matchReady = (steps: readonly Step[], rounds: readonly Round[] = readyRounds()): Round | null =>
  steps.length ? (rounds.find((r) => stepKey(r.steps) === stepKey(steps)) ?? null) : null;

/** A round from what Jakob typed or the address carried: a ready-made one when the steps are its steps. */
export function roundFromText(text: string, rounds: readonly Round[] = readyRounds()): Round {
  const own = fromText("egen", "Egen runda", text.trim());
  const ready = !own.errors.length ? matchReady(own.steps, rounds) : null;
  return ready ?? own;
}

// ── A take in its context ───────────────────────────────────────────────────
/**
 * The steps that play one take where it belongs, the old lab's rule (src/lab-ui.ts kbPlayPair): a deal with the return
 * that continues it (back to A2.1 when one fits there, else to A1; the bank's own rule picks which), a return after the deal
 * it continues (the main deal when that one fits, else the newest that does), anything else on its own. The take is locked.
 */
export function contextSteps(graph: Graph, edgeId: string, takeId: string | null): { steps: Step[]; error: string | null } {
  const take: Take | null = takeId ? (graph.takes[takeId] ?? null) : null;
  const edge = graph.edge[edgeId] ?? graph.edge[parseEdge(edgeId)?.base ?? ""] ?? (take ? graph.edge[take.edge] : undefined);
  if (!edge) return { steps: [], error: `Kanten ”${edgeId}” finns inte i klippbanken.` };
  if (takeId && !take) return { steps: [], error: `Tagningen ”${takeId}” finns inte i klippbanken.` };
  if (take && !playable(take)) return { steps: [], error: `${takeName(take)} på ${edgeName(edge)} kan inte spelas (underkänd eller inte klar).` };
  const pin = take ? { take: take.id } : {};
  if (edge.kind === "DEAL" && edge.target && !edge.experiment) {
    const card = edge.to;
    const hub = (["READY", "IDLE"] as const).find((h) => take && graph.edge[`${card}>${h}`]?.takes.some((t) => playable(t) && returnFits(t, take))) ?? "READY";
    return { steps: [{ from: take?.hub ?? edge.from, to: card, ...pin }, { from: card, to: hub }], error: null };
  }
  if (edge.kind === "RETURN" && edge.target && !edge.experiment) {
    const card = edge.from;
    const dealEdge = graph.edge[`READY>${card}`];
    const fits = take ? (dealEdge?.takes ?? []).filter((d) => playable(d) && !d.hub && returnFits(take, d)) : [];
    const deal = dealEdge?.main && fits.includes(dealEdge.main) ? dealEdge.main : ([...fits].sort((a, b) => b.order - a.order)[0] ?? null);
    return { steps: [{ from: "READY", to: card, ...(deal ? { take: deal.id } : {}) }, { from: card, to: edge.to, ...pin }], error: null };
  }
  return { steps: [{ from: edge.from, to: edge.to, ...pin }], error: null };
}

export function contextRound(graph: Graph, edgeId: string, takeId: string | null): Round {
  const { steps, error } = contextSteps(graph, edgeId, takeId);
  const take = takeId ? graph.takes[takeId] : null;
  const name = take ? takeName(take, graph.edge[take.edge]?.takes) : edgeName(edgeId);
  return { ...fromSteps("tagning", name, steps), errors: error ? [error] : [] };
}

// ── The address ─────────────────────────────────────────────────────────────
// /?runda=<his notation or the graph's sequence> · /?kant=<edge id>&tagning=<take id> · &vy=platt starts in "Inte 3D".
export type View = "3d" | "platt";
export type Asked = { kind: "runda"; text: string } | { kind: "kant"; edge: string; take: string | null } | { kind: "none" };

export function readAddress(params: { get(name: string): string | null }): { asked: Asked; view: View } {
  const view: View = params.get("vy") === "platt" ? "platt" : "3d";
  const runda = params.get("runda")?.trim();
  const kant = params.get("kant")?.trim();
  const asked: Asked = runda ? { kind: "runda", text: runda } : kant ? { kind: "kant", edge: kant, take: params.get("tagning")?.trim() || null } : { kind: "none" };
  return { asked, view };
}

/** The address of a round and a view, as the page writes it back: "?runda=…" and "&vy=platt" when flat. */
export function addressOf(round: Round | null, view: View): string {
  const query = new URLSearchParams();
  if (round?.text) query.set("runda", round.text);
  if (view === "platt") query.set("vy", "platt");
  const text = query.toString();
  return text ? `?${text}` : "";
}

// ── Places and words ────────────────────────────────────────────────────────
/**
 * Each card's centre in film pixels from Jakob's placement plan, as the old lab hands it to resolveRound (src/lab-ui.ts
 * kbPlaces): a seat's second card then gets its shift from the first card's film. null without a plan.
 */
export function placesOf(plan: Pick<PlacementPlan, "targets"> | null | undefined): Record<string, { x: number; y: number }> | null {
  if (!plan?.targets) return null;
  const out: Record<string, { x: number; y: number }> = {};
  for (const id of TARGETS) {
    const geometry = plan.targets[id]?.geometry?.native;
    if (!geometry) continue;
    const p = toPixels(geometry, "native");
    out[id] = { x: (p.x * 1763) / 1761, y: p.y };
  }
  return Object.keys(out).length ? out : null;
}

/** The round in a few words for the header: "3 steg · 8,5 s", with the gaps when there are any. */
export function roundFacts(parts: readonly PlayPart[]): string {
  const gaps = parts.filter((p) => !p.path).length;
  return [`${parts.length} steg`, gaps ? `${gaps} ${gaps === 1 ? "lucka" : "luckor"}` : null, formatSeconds(roundSeconds(parts))].filter(Boolean).join(" · ");
}
