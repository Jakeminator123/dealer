// Primära: for every film of a whole round, what plays now against the best take Jakob has accepted outright, and what
// making that take Primär would do to the seam between deal and return. Pure: no DOM; the one write (makePrimary, from
// lib/decide.ts) takes its writer as an argument. Tests in studio/tests/primaries.test.ts and decide.test.ts.
//
// Nothing here decides anything: it proposes. Primär is Jakob's decision, written only by his click (makePrimary).
import {
  SEATS,
  buildGraph,
  resolveRound,
  returnFits,
  returnsOf,
  roundSequence,
  type BankData,
  type Edge,
  type Gap,
  type Graph,
  type Segment,
  type Step,
  type Take,
  type Why,
} from "../../src/clip-graph.ts";
import { isOutright, primaryOf } from "./edge-stats.ts";
import { nodeCode, takeName } from "./names.ts";
import { VERDICT_LABEL, verdictOf } from "./verdict.ts";

// The films of seat 4 Jakob called very good on 12 Nov (scene3d's own round): the first three proposals of the page.
export const PRAISED = ["pamela-idle-ready-entry-01", "pamela-p4-c1-plan-deal-02", "pamela-p4-c1-plan-return-idle-01"] as const;
export const PRAISED_NOTE = "du sade väldigt bra 12 nov";

export type Role = "deal" | "ready" | "idle" | "entry" | "exit" | "rest" | "reveal" | "arrive" | "leave";
export const ROLE_WORD: Record<Role, string> = {
  deal: "Giv",
  ready: "Retur till A2.1",
  idle: "Retur till A1",
  entry: "Ingång",
  exit: "Utgång",
  rest: "Vila",
  reveal: "Vänd hålkortet",
  arrive: "Kommer",
  leave: "Går",
};

/**
 * same: what plays is already the best take he accepted outright. different: another take plays. none: nothing on the
 * edge is accepted outright by him. primary: he has set a Primär here. gap: nothing plays.
 */
export type RowStatus = "same" | "different" | "none" | "primary" | "gap";
export const STATUSES: readonly RowStatus[] = ["different", "same", "none", "primary", "gap"];
export type SeamTone = "ok" | "warn" | "bad";
export type Seam = { tone: SeamTone; text: string };

export type Row = {
  edge: Edge;
  role: Role;
  /** "P1".."P7", "D" or "hub". */
  group: string;
  now: Take | null;
  why: Why;
  gap: Gap | null;
  notes: string[];
  proposal: Take | null;
  /** His other outright-accepted takes on the edge, best first. */
  others: Take[];
  status: RowStatus;
  /** What making the proposal Primär does to the seam, in plain words; for a Primär already set, how its seam stands. */
  seam: Seam | null;
  praised: boolean;
};
export type Group = { id: string; title: string; rows: Row[]; pairs: Seam[] };
export type Primaries = { praised: Row[]; groups: Group[]; counts: Record<RowStatus, number>; rows: Row[] };

const ROLE_OF = (edge: Edge): Role =>
  edge.kind === "DEAL" ? "deal"
  : edge.kind === "RETURN" ? (edge.target ? (edge.to === "READY" ? "ready" : "idle") : "exit")
  : edge.kind === "ENTRY" ? "entry"
  : edge.kind === "IDLE" ? "rest"
  : edge.kind === "REVEAL" ? "reveal"
  : edge.kind === "ARRIVE" ? "arrive"
  : "leave";

// ── What plays now ──────────────────────────────────────────────────────────
// A whole round, as the game plays it (src/game-film.ts): every seat, the dealer, the hole card turned. A film the round
// does not play (a seat's return to A1, the dealer's first card back to A1, the idle, her coming and going) is resolved
// in the shortest chain that plays it: its deal before a return, else alone.
type Now = { take: Take | null; why: Why; gap: Gap | null; notes: string[]; before: Take | null };

function chain(edge: Edge): { steps: Step[]; at: number } {
  if (edge.kind === "RETURN" && edge.target) return { steps: [{ from: "READY", to: edge.from }, { from: edge.from, to: edge.to }], at: 1 };
  if (edge.kind === "DEAL") return { steps: [{ from: edge.from, to: edge.to }, { from: edge.to, to: "READY" }], at: 0 };
  return { steps: [{ from: edge.from, to: edge.to }], at: 0 };
}

const clean = (notes: string[]) => notes.filter((n) => !n.startsWith("Kortets flytt"));
const asNow = (seg: Segment, before: Segment | undefined): Now => ({
  take: seg.take,
  why: seg.why,
  gap: seg.gap,
  notes: clean(seg.notes),
  before: before && before.to === seg.from ? before.take : null,
});

function nowOf(graph: Graph, round: Segment[], edge: Edge): Now {
  const at = round.findIndex((s) => (s.film ?? s.edge)?.id === edge.id);
  if (at >= 0) return asNow(round[at], round[at - 1]);
  const c = chain(edge);
  const segs = resolveRound(graph, c.steps, {});
  return asNow(segs[c.at], segs[c.at - 1]);
}

export function wholeRound(graph: Graph): Segment[] {
  return resolveRound(graph, roundSequence({ seats: SEATS, reveal: true }), { holeCardDown: true });
}

// ── The best take he accepted outright ──────────────────────────────────────
// Ordered: a return that continues the deal that plays before it; a deal that a return continues (one he accepted
// outright before any playable one); the calm idle before a gesture; then the newest.
export function rankOutright(graph: Graph, edge: Edge, before: Take | null): Take[] {
  const fitsBefore = (t: Take) => (edge.kind === "RETURN" && before && returnFits(t, before) ? 1 : 0);
  const followed = (t: Take) => {
    if (edge.kind !== "DEAL") return 0;
    const back = returnsOf(graph, t);
    const all = [...back.frame, ...back.anchor].filter((r) => r.stage === "DONE");
    return all.some(isOutright) ? 2 : all.length ? 1 : 0;
  };
  const calm = (t: Take) => (edge.kind === "IDLE" && t.idle?.calm ? 1 : 0);
  return edge.takes.filter(isOutright).sort((a, b) => fitsBefore(b) - fitsBefore(a) || followed(b) - followed(a) || calm(b) - calm(a) || b.order - a.order);
}

// ── What a Primär would do ──────────────────────────────────────────────────
/** The bank as it would read with this take Primär (and any earlier Primär on its edge lowered to plain accepted). */
export function withPrimary(bank: BankData, graph: Graph, take: Take): BankData {
  const motions = { ...(bank.motions ?? {}) };
  for (const other of graph.edge[take.edge]?.takes ?? []) {
    if (other.id === take.id || !other.explicitMain) continue;
    const record = motions[other.id] ?? {};
    motions[other.id] = { ...record, review: { ...record.review, decision: "ACCEPTED", acceptedAs: undefined } };
  }
  const record = motions[take.id] ?? {};
  motions[take.id] = { ...record, review: { ...record.review, decision: "ACCEPTED", acceptedAs: "MAIN", userAccepted: true } };
  return { ...bank, motions };
}

// "Giv 01 (variant)", "Giv 03 (underkänd, sekundär)", "Giv 01 (godkänd, granskarens)".
const label = (take: Take, graph: Graph) => {
  const v = verdictOf(take);
  const words = [VERDICT_LABEL[v.verdict].toLowerCase(), v.detail, v.byJakob || v.verdict === "vantar" ? null : "granskarens"].filter(Boolean);
  return `${takeName(take, graph.edge[take.edge]?.takes)} (${words.join(", ")})`;
};
// A take that would come in beside his choice: his own ✓ is fine, a variant or a reviewer's word is worth a look, a
// rejected or secondary take is a fault.
const toneOf = (take: Take): SeamTone => (isOutright(take) ? "ok" : verdictOf(take).verdict === "underkand" ? "bad" : "warn");

/**
 * The seam a seat's row would get with `take` Primär, in his words. For a return: whether it continues the deal that would
 * play before it, and whether that deal changes (a Primär return pulls in the deal it continues). For a deal: whether the
 * returns that would follow it continue it.
 */
export function seamWith(bank: BankData, graph: Graph, take: Take): Seam | null {
  const edge = graph.edge[take.edge];
  if (!edge?.target || (edge.kind !== "DEAL" && edge.kind !== "RETURN")) return null;
  const after = buildGraph(withPrimary(bank, graph, take), { mode: graph.mode, dealer: graph.dealer });
  const card = edge.kind === "DEAL" ? edge.to : edge.from;
  if (edge.kind === "RETURN") {
    const steps = [{ from: "READY", to: card }, { from: card, to: edge.to }];
    const then = resolveRound(after, steps, {})[0]?.take ?? null;
    const was = resolveRound(graph, steps, {})[0]?.take ?? null;
    const own = after.takes[take.id];
    if (!then) return { tone: "bad", text: `Ingen giv till ${nodeCode(card)} spelas före: returen kommer efter en lucka.` };
    if (then.id !== was?.id) return { tone: toneOf(then), text: `Då spelas ${label(then, graph)} före, eftersom returen fortsätter den.` };
    if (returnFits(own, then)) return { tone: "ok", text: "Fortsätter given som spelas nu." };
    return { tone: "bad", text: "Ingen spelbar giv slutar där returen börjar: synligt hopp." };
  }
  // A deal: the two returns after it, as a round would choose them with this deal Primär.
  const parts: Seam[] = [];
  for (const [to, word] of [["READY", "A2.1"], ["IDLE", "A1"]] as const) {
    const steps = [{ from: "READY", to: card }, { from: card, to }];
    const back = resolveRound(after, steps, {})[1]?.take ?? null;
    const was = resolveRound(graph, steps, {})[1]?.take ?? null;
    if (!back) continue;
    const own = after.takes[take.id];
    if (!returnFits(back, own)) parts.push({ tone: "bad", text: `Returen till ${word} fortsätter den inte: hopp.` });
    else if (back.id !== was?.id) parts.push({ tone: toneOf(back), text: `Returen till ${word} blir ${label(back, graph)}.` });
  }
  if (!parts.length) return { tone: "ok", text: "Returerna som spelas fortsätter den." };
  const tone: SeamTone = parts.some((p) => p.tone === "bad") ? "bad" : parts.some((p) => p.tone === "warn") ? "warn" : "ok";
  return { tone, text: parts.map((p) => p.text).join(" ") };
}

/** How the seam stands now, for a row whose Primär is already set (no simulation: the bank as it is). */
function seamNow(graph: Graph, edge: Edge, now: Now): Seam | null {
  if (!edge.target || !now.take) return null;
  if (edge.kind === "RETURN") {
    if (!now.before) return null;
    return returnFits(now.take, now.before) ? { tone: "ok", text: "Fortsätter given som spelas före." } : { tone: "bad", text: "Fortsätter inte given före: synligt hopp." };
  }
  return null;
}

// ── The page ────────────────────────────────────────────────────────────────
const GROUP_TITLE = (id: string) => (id === "D" ? "Dealer" : id === "hub" ? "Vila, ingång och utgång" : `${id} · Spelare ${id.slice(1)}`);

export function primaries(bank: BankData, graph: Graph): Primaries {
  const round = wholeRound(graph);
  const praised = new Set<string>(PRAISED);
  const rows: Row[] = [];
  for (const id of graph.summary.films.required) {
    const edge = graph.edge[id];
    if (!edge) continue;
    const role = ROLE_OF(edge);
    const group = edge.target ? edge.target.split(".")[0] : "hub";
    const now = nowOf(graph, round, edge);
    const ranked = rankOutright(graph, edge, now.before);
    const star = ranked.find((t) => praised.has(t.id)) ?? null;
    const proposal = star ?? ranked[0] ?? null;
    const primary = primaryOf(edge);
    const status: RowStatus = !now.take ? "gap" : primary ? "primary" : !proposal ? "none" : proposal.id === now.take.id ? "same" : "different";
    const shown = status === "primary" ? primary : proposal;
    const seam = status === "primary" ? seamNow(graph, edge, now) : shown && (status === "same" || status === "different" || status === "gap") ? seamWith(bank, graph, shown) : null;
    rows.push({
      edge,
      role,
      group,
      now: now.take,
      why: now.why,
      gap: now.gap,
      notes: now.notes,
      proposal: shown,
      others: ranked.filter((t) => t !== shown),
      status,
      seam,
      praised: !!star && shown === star,
    });
  }
  // Seats in table order, then the dealer, then the anchors' own films. Within a seat: deal, return to A2.1, return to A1.
  const order = [...SEATS, "D", "hub"];
  const roleOrder: Role[] = ["deal", "ready", "idle", "reveal", "entry", "exit", "rest", "arrive", "leave"];
  const groups: Group[] = order
    .map((gid) => {
      const mine = rows.filter((r) => r.group === gid).sort((a, b) => (a.edge.target ?? "").localeCompare(b.edge.target ?? "") || roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
      return { id: gid, title: GROUP_TITLE(gid), rows: mine, pairs: gid === "hub" ? [] : pairSeams(mine) };
    })
    .filter((g) => g.rows.length);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<RowStatus, number>;
  const top = PRAISED.map((tid) => rows.find((r) => r.praised && r.proposal?.id === tid)).filter((r): r is Row => !!r);
  return { praised: top, groups, counts, rows };
}

/** For a seat: does the proposed return continue the proposed deal (each, or what plays when there is no proposal)? */
export function pairSeams(rows: Row[]): Seam[] {
  const out: Seam[] = [];
  const deals = rows.filter((r) => r.role === "deal");
  for (const deal of deals) {
    const d = deal.proposal ?? deal.now;
    if (!d) continue;
    const card = deals.length > 1 ? `${nodeCode(deal.edge.to)}: ` : "";
    for (const back of rows.filter((r) => (r.role === "ready" || r.role === "idle") && r.edge.from === deal.edge.to)) {
      const b = back.proposal ?? back.now;
      if (!b) continue;
      const where = back.role === "ready" ? "A2.1" : "A1";
      out.push(returnFits(b, d) ? { tone: "ok", text: `${card}giv → retur ${where} skarvfritt` } : { tone: "bad", text: `${card}giv → retur ${where} hoppar` });
    }
  }
  return out;
}

// ── The one write ───────────────────────────────────────────────────────────
// Makes one take Primär with Jakob's own note kept and lowers an earlier Primär on the same edge: the rule lives once, in
// lib/decide.ts, which DecisionBar calls too. Called only from his click.
export { makePrimary, type Put } from "./decide.ts";
