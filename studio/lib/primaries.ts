// Karta's films per step: for every step (an edge between two anchors) Jakob's Primär and beside it the takes approved
// (Godkänd, Variant) that are not Primär, the secondary films, each with how the game uses it. The use is read from the
// game's own rules, never guessed: the bank as the game reads it (judgedBank: judged takes only, a replaced stopgap left
// out), the chains a round plays the step in (resolveRound: a deal before its return to A2.1 or to A1, a return after its
// deal), the rest loop's pool and weights (pickIdle's rules), and the seats dealt from anchor 2.2 (SEAT_HUB, hubChain).
// Rejected, unjudged and replaced takes are not among them: they are in Granska. Pure: no DOM; the one write (makePrimary,
// from lib/decide.ts) takes its writer as an argument. Tests in studio/tests/primaries.test.ts.
//
// Nothing here decides anything: it reads and proposes. Primär is Jakob's decision, written only by his click (makePrimary).
import {
  SEATS,
  buildGraph,
  dealHub,
  filmCard,
  playable,
  resolveRound,
  returnFits,
  returnsOf,
  WHY_LABEL,
  type BankData,
  type Edge,
  type Graph,
  type Step,
  type Take,
} from "../../src/clip-graph.ts";
import { SEAT_HUB, hubChain, judgedBank } from "../../src/game-director.ts";
import { isOutright, isSecondary, playing, primaryOf, type Hubs, type Playing } from "./edge-stats.ts";
import { edgeName, nodeCode, takeName } from "./names.ts";
import { VERDICT_LABEL, verdictOf, verdictPhrase } from "./verdict.ts";

// The films of seat 4 Jakob called very good on 12 Nov (scene3d's own round): proposed first where they stand.
export const PRAISED = ["pamela-idle-ready-entry-01", "pamela-p4-c1-plan-deal-02", "pamela-p4-c1-plan-return-idle-01"] as const;
export const PRAISED_NOTE = "du sade väldigt bra 12 nov";

const REST = "IDLE>IDLE";

export type Role = "deal" | "ready" | "idle" | "entry" | "exit" | "rest" | "reveal" | "arrive" | "leave";
export const roleOf = (edge: Pick<Edge, "kind" | "target" | "to">): Role =>
  edge.kind === "DEAL" ? "deal"
  : edge.kind === "RETURN" ? (edge.target ? (edge.to === "READY" ? "ready" : "idle") : "exit")
  : edge.kind === "ENTRY" ? "entry"
  : edge.kind === "IDLE" ? "rest"
  : edge.kind === "REVEAL" ? "reveal"
  : edge.kind === "ARRIVE" ? "arrive"
  : "leave";

// ── The tree's order ────────────────────────────────────────────────────────
// Seats in table order, then the dealer, then the anchors' own films; within a seat: deal, return to A2.1, return to A1.
const ROLE_ORDER: Role[] = ["deal", "ready", "idle", "reveal", "entry", "exit", "rest", "arrive", "leave"];
/** The steps a round needs (graph.summary.films.required), in the order the node tree is followed. */
export function treeOrder(graph: Graph): string[] {
  const group = (e: Edge) => { const at = [...SEATS, "D"].indexOf(e.target ? e.target.split(".")[0] : ""); return at < 0 ? SEATS.length + 1 : at; };
  return graph.summary.films.required
    .map((id) => graph.edge[id])
    .filter((e): e is Edge => !!e)
    .sort((a, b) => group(a) - group(b) || (a.target ?? "").localeCompare(b.target ?? "") || ROLE_ORDER.indexOf(roleOf(a)) - ROLE_ORDER.indexOf(roleOf(b)))
    .map((e) => e.id);
}

// ── The game's graph ────────────────────────────────────────────────────────
/** The bank as the game reads it (judgedBank), one film per seat, for one dealer: what "used by the game" is read from. */
export const gameGraph = (bank: BankData, dealer: string): Graph => buildGraph(judgedBank(bank), { dealer });

/** The seats a dealer's game deals from another pose at the shoe (SEAT_HUB, when hubChain finds the four films), and the takes those chains play. */
function hubPlays(game: Graph): { cards: Map<string, string>; takes: Map<string, string> } {
  const map = SEAT_HUB[game.dealer] ?? {}, cards = new Map<string, string>(), takes = new Map<string, string>();
  for (const card of Object.keys(map)) {
    const hub = dealHub(card, map), chain = hub === "READY" ? null : hubChain(game, hub, card);
    if (!chain) continue;
    cards.set(card, hub);
    for (const s of chain) if (s.take) takes.set(s.take.id, hub);
  }
  return { cards, takes };
}

// ── How the game uses a film ────────────────────────────────────────────────
/**
 * always: the game plays it wherever it plays the step. some: in one of the step's chains (before the return to A1, not
 * before the one to A2.1). loop: a rest film chance picks by weight. request: only when chosen (a talk film, said with
 * its line). hub: the seat is dealt from anchor 2.2 with it. never: the game never plays it.
 */
export type UseKind = "always" | "some" | "loop" | "request" | "hub" | "never";
/** word: the chip, in his words; detail: the same in a sentence, for the tooltip. */
export type Use = { kind: UseKind; word: string; detail: string };

type Context = { steps: Step[]; at: number; word: string };
/** The chains a round of the game plays a step in (src/game-director.ts planBeats): none for an experiment or a seat dealt from 2.2. */
function contextsOf(edge: Edge, hubCards: ReadonlyMap<string, string>): Context[] {
  if (edge.experiment) return [];
  const card = edge.kind === "DEAL" ? edge.to : edge.kind === "RETURN" && edge.target ? edge.from : null;
  // From another pose the hand deals, goes back to that pose and from there to rest: the plain films of the seat are not played.
  if (card && hubCards.has(filmCard(card))) return [];
  if (edge.kind === "DEAL")
    return [
      { steps: [{ from: "READY", to: edge.to }, { from: edge.to, to: "READY" }], at: 0, word: "före retur till A2.1" },
      { steps: [{ from: "READY", to: edge.to }, { from: edge.to, to: "IDLE" }], at: 0, word: "före retur till A1" },
    ];
  if (edge.kind === "RETURN" && edge.target) return [{ steps: [{ from: "READY", to: edge.from }, { from: edge.from, to: edge.to }], at: 1, word: "efter given" }];
  return [{ steps: [{ from: edge.from, to: edge.to }], at: 0, word: "" }];
}

const percent = (part: number, whole: number) => `${Math.round((100 * part) / whole)} %`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How the game uses every take of one step, by take id. `game` is gameGraph's; the takes are looked up by id. */
export function usesOf(game: Graph, edgeId: string): Map<string, Use> {
  const out = new Map<string, Use>();
  const mine = game.edge[edgeId];
  if (!mine) return out;
  if (edgeId === REST) {
    // pickIdle's pool: playable rest films with a film and a weight, never one played on request; the inbox only when alone.
    const ready = mine.takes.filter((t) => t.idle && playable(t) && !t.idle.onRequest && t.idle.weight > 0 && !!t.media.video);
    const pool = ready.some((t) => !t.inbox) ? ready.filter((t) => !t.inbox) : ready;
    const sum = (calm: boolean) => pool.filter((t) => t.idle!.calm === calm).reduce((s, t) => s + t.idle!.weight, 0);
    const total = { calm: sum(true), gesture: sum(false) };
    for (const t of mine.takes) {
      if (pool.includes(t)) {
        const calm = t.idle!.calm, share = percent(t.idle!.weight, calm ? total.calm : total.gesture);
        out.set(t.id, calm
          ? { kind: "loop", word: `Vilan · lugn · ${share}`, detail: `Grunden i vilan: slumpen väljer den bland de lugna filmerna efter vikt (${share} av de lugna).` }
          : { kind: "loop", word: `Vilan · gest · ${share}`, detail: `Slumpas in mellan de lugna filmerna; vikten säger hur ofta (${share} av gesterna).` });
      } else if (t.idle?.onRequest && playable(t) && t.media.video)
        out.set(t.id, { kind: "request", word: "Bara när den väljs", detail: "Slumpen väljer den aldrig; spelet spelar den när den väljs, som en replik." });
      else out.set(t.id, { kind: "never", word: "Spelas inte", detail: t.idle?.weight === 0 ? "Vikt 0: slumpen väljer den aldrig." : "Vilan väljer den inte." });
    }
    return out;
  }
  const hubs = hubPlays(game);
  const contexts = contextsOf(mine, hubs.cards);
  const played = contexts.map((c) => resolveRound(game, c.steps, {})[c.at]);
  const primary = mine.takes.some((t) => t.explicitMain && playable(t));
  const nameOf = (t: Take) => `${takeName(t, game.edge[t.edge]?.takes)}${t.edge !== edgeId ? ` (${edgeName(t.edge)})` : ""}`;
  for (const t of mine.takes) {
    const hub = hubs.takes.get(t.id);
    if (hub) {
      out.set(t.id, { kind: "hub", word: `Från ${nodeCode(hub)}`, detail: `Spelet ger platsen från ${nodeCode(hub)} (ankare ${nodeCode(hub).slice(1)}) med den här.` });
      continue;
    }
    const where = contexts.filter((_, i) => played[i]?.take?.id === t.id && !!played[i]?.video);
    if (!contexts.length) {
      out.set(t.id, { kind: "never", word: "Spelas inte", detail: mine.experiment ? "Ett experiment: spelet spelar aldrig steget." : "Platsen ges från A2.2 i spelet; stegets egna filmer spelas inte." });
    } else if (where.length === contexts.length) {
      const why = played.find((s) => s?.take?.id === t.id)?.why;
      out.set(t.id, t.explicitMain || !primary
        ? { kind: "always", word: t.explicitMain ? "Spelas" : "Står in för Primär", detail: t.explicitMain ? "Spelet spelar den varje gång steget spelas." : "Ingen Primär är vald här: spelet spelar den här så länge." }
        : { kind: "always", word: "Spelas i stället för Primär", detail: `Spelet spelar den här, inte Primär (${why && why !== "MAIN" && why !== "GAP" ? WHY_LABEL[why] : "Primär kan inte spelas"}).` });
    } else if (where.length) {
      const words = where.map((c) => c.word).join(" och ");
      out.set(t.id, { kind: "some", word: cap(words), detail: `Spelet spelar den ${words}; annars spelas en annan.` });
    } else {
      const other = played.find((s) => s?.take);
      out.set(t.id, { kind: "never", word: "Spelas inte", detail: other?.take ? `Spelet spelar ${nameOf(other.take)} här (${WHY_LABEL[other.why]}).` : "Spelet har ingen film här." });
    }
  }
  return out;
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
export type SeamTone = "ok" | "warn" | "bad";
export type Seam = { tone: SeamTone; text: string };

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

// "Giv 01 (variant)", "Giv 03 (underkänd, sekundär)", "Giv 01 (godkänd, granskarens)", "Giv 02 (godkänd åt dig)".
const label = (take: Take, graph: Graph) => {
  const v = verdictOf(take);
  const words = v.provisional ? [verdictPhrase(v)] : [VERDICT_LABEL[v.verdict].toLowerCase(), v.detail, v.byJakob || v.verdict === "vantar" ? null : "granskarens"].filter(Boolean);
  return `${takeName(take, graph.edge[take.edge]?.takes)} (${words.join(", ")})`;
};
// A take that would come in beside his choice: his own ✓ is fine, a variant or a reviewer's word is worth a look, a
// rejected or secondary take is a fault.
const toneOf = (take: Take): SeamTone => (isOutright(take) ? "ok" : verdictOf(take).verdict === "underkand" ? "bad" : "warn");

/**
 * The seam a seat's step would get with `take` Primär, in his words. For a return: whether it continues the deal that would
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

/** How a return's seam stands now (no simulation: the bank as it is): does it continue the deal that plays before it? */
function seamNow(edge: Edge, now: Playing, take: Take): Seam | null {
  if (edge.kind !== "RETURN" || !edge.target || !now.before || now.take?.id !== take.id) return null;
  return returnFits(take, now.before) ? { tone: "ok", text: "Fortsätter given som spelas före." } : { tone: "bad", text: "Fortsätter inte given före: synligt hopp." };
}

// ── One step ────────────────────────────────────────────────────────────────
/** A film on the page: the take, how the game uses it, and, for the proposal, what making it Primär does to the seam. */
export type Film = { take: Take; use: Use; seam: Seam | null; proposal: boolean; praised: boolean };
/**
 * primary: his Primär. secondaries: the approved takes that are not Primär, the proposal first (the best take he accepted
 * outright, when no Primär is chosen), then those the game plays, his own before a reviewer's, the newest last; the page
 * shows three and folds the rest. elsewhere: how many of the step's takes are not on this page (rejected, waiting,
 * replaced): they are in Granska.
 */
export type StepFilms = { edge: Edge; role: Role; now: Playing; primary: Film | null; secondaries: Film[]; proposal: Take | null; elsewhere: number };
export const SHOWN = 3;

const USE_RANK: Record<UseKind, number> = { always: 5, some: 4, hub: 3, loop: 3, request: 1, never: 0 };

/**
 * The films of one step. bank and graph: the studio's (every take, for the names and the one write); game: gameGraph's,
 * what the uses and the seam are read from; hubs: hubDeals (what the game deals from A2.2), for what plays now.
 */
export function stepFilms(bank: BankData, graph: Graph, game: Graph, edgeId: string, hubs: Hubs = {}): StepFilms | null {
  const edge = graph.edge[edgeId];
  if (!edge) return null;
  const now = playing(game.edge[edgeId] ? game : graph, edgeId, hubs);
  const uses = usesOf(game, edgeId);
  const usage = (t: Take): Use => uses.get(t.id) ?? { kind: "never", word: "Spelas inte", detail: "Inte med i spelets bank." };
  const main = primaryOf(edge);
  const candidates = edge.takes.filter((t) => isSecondary(t, game));
  const ranked = main ? [] : rankOutright(graph, edge, now.before).filter((t) => candidates.includes(t));
  const star = ranked.find((t) => (PRAISED as readonly string[]).includes(t.id)) ?? null;
  const proposal = star ?? ranked[0] ?? null;
  const seamBank = game.edge[edgeId] ? judgedBank(bank) : bank, seamGraph = game.edge[edgeId] ? game : graph;
  const film = (t: Take, isProposal: boolean): Film => ({
    take: t,
    use: usage(t),
    seam: isProposal && seamGraph.takes[t.id] ? seamWith(seamBank, seamGraph, seamGraph.takes[t.id]) : null,
    proposal: isProposal,
    praised: (PRAISED as readonly string[]).includes(t.id),
  });
  const loop = (f: Film) => (f.use.kind === "loop" ? (f.take.idle?.calm ? 2 : 1) * 1000 + (f.take.idle?.weight ?? 0) : 0);
  const secondaries = candidates
    .map((t) => film(t, t === proposal))
    .sort(
      (a, b) =>
        Number(b.proposal) - Number(a.proposal) ||
        USE_RANK[b.use.kind] - USE_RANK[a.use.kind] ||
        loop(b) - loop(a) ||
        Number(isOutright(b.take)) - Number(isOutright(a.take)) ||
        Number(verdictOf(b.take).byJakob) - Number(verdictOf(a.take).byJakob) ||
        Number(verdictOf(b.take).verdict === "godkand") - Number(verdictOf(a.take).verdict === "godkand") ||
        b.take.order - a.take.order,
    );
  const primary = main ? { ...film(main, false), seam: seamNow(edge, now, main) } : null;
  return { edge, role: roleOf(edge), now, primary, secondaries, proposal, elsewhere: edge.takes.length - secondaries.length - (primary ? 1 : 0) };
}

// ── The one write ───────────────────────────────────────────────────────────
// Makes one take Primär with Jakob's own note kept and lowers an earlier Primär on the same edge: the rule lives once, in
// lib/decide.ts, which DecisionBar calls too. Called only from his click.
export { makePrimary, type Put } from "./decide.ts";
