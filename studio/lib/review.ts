// What Granska and Jämför need from the bank: the takes waiting for Jakob in dealing order and grouped as the old lab
// groups them (src/lab-ui.ts rvKey, rvGroup), the take after a decision, the edges where there is a choice to make, the
// pair a comparison starts from and the facts that differ, and the filters of the list of every take.
// Pure: no DOM, no network; tests in studio/tests/review.test.ts.
import { hubOf, playable, type Edge, type Graph, type Take } from "../../src/clip-graph.ts";
import { formatSeconds, takeFacts } from "./names.ts";
import { awaitingJakob, provisionalOf, verdictOf, VERDICTS, type Verdict } from "./verdict.ts";

type EdgeLike = Pick<Edge, "id" | "kind" | "target" | "to" | "experiment">;

// ── Dealing order and groups (as the old lab) ──────────────────────────────
/** The card an edge is about; an experiment is filed with the card it deals or leaves. */
export const cardOf = (edge: Pick<Edge, "id" | "target">): string | null => edge.target ?? /(?:P[1-7]|D)\.C[1-3]/.exec(edge.id)?.[0] ?? null;

/** The seat an edge is about: "P4", "D", or null for the films without a card. */
export const seatOf = (edge: Pick<Edge, "id" | "target">): string | null => cardOf(edge)?.split(".")[0] ?? null;

/** Dealing order: the entry, each seat (first card, then second; deal, return to READY, return to IDLE), the dealer, exit and idle, the rest. */
export function reviewKey(edge: EdgeLike): number {
  const card = cardOf(edge);
  if (edge.id === "IDLE>READY") return 0;
  if (!card) return edge.experiment ? 99000 : 90000 + (edge.kind === "IDLE" ? 100 : 0);
  const seat = card[0] === "D" ? 8 : Number(card[1]);
  const step = edge.kind === "DEAL" ? 0 : hubOf(edge.to) === "READY" ? 10 : 20;
  return seat * 1000 + Number(card.at(-1)) * 100 + step + (edge.experiment ? 5 : 0);
}

/** The heading a take is listed under: "Ingång", "P1"…"P7", "Dealern", "Utgång och vila", "Variant B och experiment utan kort". */
export function reviewGroup(edge: EdgeLike): string {
  const card = cardOf(edge);
  if (card) return card[0] === "D" ? "Dealern" : card.split(".")[0];
  if (edge.experiment) return "Variant B och experiment utan kort";
  return edge.id === "IDLE>READY" ? "Ingång" : "Utgång och vila";
}

/** Takes in dealing order; within one edge in the order of the bank. */
export function inReviewOrder(takes: readonly Take[], graph: Pick<Graph, "edge">): Take[] {
  return [...takes].sort((a, b) => reviewKey(graph.edge[a.edge]) - reviewKey(graph.edge[b.edge]) || a.order - b.order);
}

// ── The queue ───────────────────────────────────────────────────────────────
/** decided: what Jakob chose for it in this sitting (MAIN, ACCEPTED, VARIANT, REJECTED), null while it waits. */
export type QueueItem = { take: Take; edge: Edge; group: string; decided: string | null };

/** The heading of the takes the main agent and a reviewer judged in Jakob's place: first in the queue. */
export const PROVISIONAL_GROUP = "Preliminärt dömda · väntar på dig";

/**
 * The takes waiting for Jakob (awaitingJakob: the same rule as the rail's count) and those he decided in this sitting,
 * which stay in the list ticked. A take he reset in this sitting waits again. Takes with a provisional verdict come
 * first, under their own heading; the rest in dealing order.
 */
export function reviewQueue(graph: Graph, sitting: ReadonlyMap<string, string>): { items: QueueItem[]; waiting: number } {
  const waiting = awaitingJakob(graph);
  const open = new Set(waiting.map((t) => t.id));
  const decided = [...sitting.keys()].filter((id) => !open.has(id) && graph.takes[id]).map((id) => graph.takes[id]);
  const provisional = (t: Take) => open.has(t.id) && !!provisionalOf(t.motion?.review);
  const ordered = inReviewOrder([...waiting, ...decided], graph);
  const items = [...ordered.filter(provisional), ...ordered.filter((t) => !provisional(t))].map((take) => {
    const edge = graph.edge[take.edge];
    return { take, edge, group: provisional(take) ? PROVISIONAL_GROUP : reviewGroup(edge), decided: open.has(take.id) ? null : (sitting.get(take.id) ?? null) };
  });
  return { items, waiting: waiting.length };
}

/** The waiting take after `from` in the list, round to the first; the first waiting one when `from` is not in it. */
export function nextWaiting(items: readonly QueueItem[], from: string | null): string | null {
  const n = items.length;
  if (!n) return null;
  const at = items.findIndex((i) => i.take.id === from);
  for (let k = at < 0 ? 0 : 1; k <= n; k++) {
    const item = items[(Math.max(0, at) + k) % n];
    if (!item.decided && item.take.id !== from) return item.take.id;
  }
  return null;
}

/** The waiting take before `from`, round to the last. */
export function previousWaiting(items: readonly QueueItem[], from: string | null): string | null {
  return nextWaiting([...items].reverse(), from);
}

// ── Choices: edges with more than one film to choose from ───────────────────
/** A finished take with a film. */
export const hasFilm = (take: Take): boolean => take.stage === "DONE" && !!take.media.video;
/** A finished take with a film that is not rejected: one that may play on its edge. */
export const playableFilm = (take: Take): boolean => playable(take) && !!take.media.video;

export type ChoiceEdge = { edge: Edge; takes: Take[]; required: boolean; primar: Take | null; waiting: number };

/**
 * The edges with more than one playable film, most useful first: films the round needs that have no Primär yet, then the
 * other films the round needs, then those with most takes waiting for Jakob; the idle (many short clips that all play)
 * after the films that are one choice; dealing order last.
 */
export function choiceEdges(graph: Graph): ChoiceEdge[] {
  const required = new Set(graph.summary.films.required);
  const waiting = new Set(awaitingJakob(graph).map((t) => t.id));
  const score = (c: ChoiceEdge) => (c.required ? (c.primar ? 2 : 3) : 0) - (c.edge.kind === "IDLE" ? 3 : 0);
  return [...graph.edges, ...graph.experiments]
    .map((edge) => {
      const takes = edge.takes.filter(playableFilm);
      return { edge, takes, required: required.has(edge.id), primar: edge.takes.find((t) => t.explicitMain && playableFilm(t)) ?? null, waiting: takes.filter((t) => waiting.has(t.id)).length };
    })
    .filter((c) => c.takes.length > 1)
    .sort((a, b) => score(b) - score(a) || b.waiting - a.waiting || reviewKey(a.edge) - reviewKey(b.edge));
}

/** B's role: the edge's Primär, the take that plays now (no Primär yet), or a take Jakob picked. */
export type PartnerRole = "primar" | "spelas" | "vald";
export type Pair = { a: Take | null; b: Take | null; role: PartnerRole | null; takes: Take[] };

/**
 * The pair a comparison shows: A the candidate, B the primary. B: the one asked for, else the edge's Primär, else the
 * take that plays now. A: the one asked for, else the newest take waiting for Jakob, else the newest other playable take.
 * takes: every take of the edge with a film (rejected ones too: they can be picked).
 */
export function comparePair(edge: Edge, aId?: string | null, bId?: string | null, waiting: ReadonlySet<string> = new Set()): Pair {
  const takes = edge.takes.filter(hasFilm);
  const find = (id?: string | null) => (id ? (takes.find((t) => t.id === id) ?? null) : null);
  const primar = takes.find((t) => t.explicitMain && playableFilm(t)) ?? null;
  const main = edge.main && hasFilm(edge.main) ? edge.main : null;
  const others = (not: Take | null) => takes.filter((t) => playableFilm(t) && t !== not).sort((x, y) => Number(waiting.has(y.id)) - Number(waiting.has(x.id)) || y.order - x.order);
  let a = find(aId);
  let b = find(bId);
  if (!b) b = primar && primar !== a ? primar : main && main !== a ? main : (others(a)[0] ?? null);
  if (!a) a = others(b)[0] ?? null;
  const role: PartnerRole | null = !b ? null : b.explicitMain ? "primar" : b === edge.main ? "spelas" : "vald";
  return { a, b, role, takes };
}

export const ROLE_LABEL: Record<PartnerRole, string> = { primar: "Primär", spelas: "Spelas nu", vald: "Vald" };

// ── Facts side by side ──────────────────────────────────────────────────────
export type FactRow = { key: string; label: string; a: string; b: string; differs: boolean };

/** Model, length, frames and landing frame of A and B; fps and speed only where one of them is unusual. */
export function compareFacts(a: Take, b: Take): FactRow[] {
  const fa = takeFacts(a);
  const fb = takeFacts(b);
  const landing = (t: Take) => (t.landingFrame !== null ? `ruta ${t.landingFrame}` : "—");
  const rows: [string, string, string, string][] = [
    ["model", "Modell", fa.model, fb.model],
    ["length", "Längd", fa.seconds !== null ? formatSeconds(fa.seconds) : "—", fb.seconds !== null ? formatSeconds(fb.seconds) : "—"],
    ["frames", "Rutor", fa.frames !== null ? String(fa.frames) : "—", fb.frames !== null ? String(fb.frames) : "—"],
    ["landing", "Landning", landing(a), landing(b)],
  ];
  if ((a.fps ?? 30) !== 30 || (b.fps ?? 30) !== 30) rows.push(["fps", "Bilder/s", String(a.fps ?? 30), String(b.fps ?? 30)]);
  if (a.speed !== 1 || b.speed !== 1) rows.push(["speed", "Fart", `${String(a.speed).replace(".", ",")}×`, `${String(b.speed).replace(".", ",")}×`]);
  return rows.map(([key, label, x, y]) => ({ key, label, a: x, b: y, differs: x !== y }));
}

// ── Every take: filters ─────────────────────────────────────────────────────
/** The seats that have takes, in table order (P1…P7, D), and "övrigt" when films without a card exist. */
export function seatOptions(graph: Graph): string[] {
  const seats = new Set(Object.values(graph.takes).map((t) => seatOf(graph.edge[t.edge]) ?? "övrigt"));
  return ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "D", "övrigt"].filter((s) => seats.has(s));
}

export type TakeFilter = { verdicts: ReadonlySet<Verdict>; seat: string | null };

/** The takes that pass the filter: one of the chosen verdicts (none chosen: all) and the chosen seat (null: all). */
export function filterTakes(takes: readonly Take[], graph: Pick<Graph, "edge">, filter: TakeFilter): Take[] {
  return takes.filter((t) => {
    if (filter.verdicts.size && !filter.verdicts.has(verdictOf(t).verdict)) return false;
    if (filter.seat === null) return true;
    return (seatOf(graph.edge[t.edge]) ?? "övrigt") === filter.seat;
  });
}

/** How many takes have each verdict. */
export function verdictCounts(takes: readonly Take[]): Record<Verdict, number> {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const t of takes) counts[verdictOf(t).verdict]++;
  return counts;
}

/**
 * The two lines a reviewer wrote about a take (review.basis, review.limitations), when there are any. A take brought in
 * from an order carries two sentences from its intake, "Inte granskad av Jakob: …" and "I inkorgen: …"
 * (tools/register-order.ts). His verdict takes the take out of the inbox but leaves those words in the record, where they
 * are then untrue (81 takes on 2026-11-13). The record is his and is not rewritten: the words are left out here instead,
 * and what a reviewer wrote after them stays. A provisional verdict keeps them, since he has not judged the take.
 */
export function reviewerNotes(take: Pick<Take, "motion">): { label: string; text: string }[] {
  const review = take.motion?.review;
  const judged = !!review && review.inbox !== true && (review.decision ?? "PENDING") !== "PENDING";
  const basis = String(review?.basis ?? "").trim();
  const limitations = String(review?.limitations ?? "").trim();
  const said = judged ? basis.replace(/^Inte granskad av Jakob:\s*/u, "").replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : basis;
  return [
    { label: "Granskaren", text: said },
    { label: "Begränsning", text: judged && limitations.startsWith("I inkorgen:") ? "" : limitations },
  ].filter((n) => n.text);
}
