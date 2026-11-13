// Whose studio it is: the bank holds the takes of several dealers (src/clip-graph.ts dealersOf) and every view shows one
// dealer's, the one chosen in the rail (Jakob 2026-11-13: "but where can I review everything?"). The choice is in the address
// (?dealer=paow, the word the view Material uses) and remembered in this browser; the address wins when it names a dealer,
// then a take the address names (an old link to one of Pamela's takes opens her studio), then the remembered choice, then
// Pamela, the bank's first dealer, so that every link without the word behaves as before. Names and the pause are
// data/dealers.json's. Pure: no DOM, no network; tests in studio/tests/dealer.test.ts. The provider is lib/bank.ts.
import { DEALER, buildGraph, resolveRound, type BankData, type Graph, type Step } from "../../src/clip-graph.ts";
import { awaitingJakob } from "./verdict.ts";

export const DEFAULT_DEALER = DEALER;
/** The address's word for the dealer, shared with the view Material. */
export const DEALER_PARAM = "dealer";
/** The address's words that name a take: Granska's, Karta's and Scen's tagning, Jämför's a and b. */
export const TAKE_PARAMS = ["tagning", "a", "b"] as const;
/** Where the browser remembers the choice (localStorage). */
export const DEALER_MEMORY = "studio.dealer";

const ID = /^[a-z0-9]+$/;
/** A dealer's id as the bank writes it (a–z, 0–9), or null. */
export const dealerId = (value: unknown): string | null => (typeof value === "string" && ID.test(value) ? value : null);
/** A dealer's name when data/dealers.json does not give one: the id with a capital. */
export const nameOf = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

// ── Who there is ────────────────────────────────────────────────────────────
/** The dealers the bank holds takes of: Pamela first (the bank's first dealer, with or without takes), then the others in the order their first take comes. */
export function bankDealers(owners: Readonly<Record<string, string>>): string[] {
  const out = [DEFAULT_DEALER];
  for (const id of Object.values(owners)) if (dealerId(id) && !out.includes(id)) out.push(id);
  return out;
}

export type DealerNote = { name: string; paused: string | null };
export type DealerRegister = Record<string, DealerNote>;

/** data/dealers.json as the switch needs it: each dealer's name and, when paused, the words why. Anything else is left out. */
export function readDealerRegister(value: unknown): DealerRegister {
  const list = (value as { dealers?: unknown } | null)?.dealers;
  const out: DealerRegister = {};
  if (!Array.isArray(list)) return out;
  for (const item of list as { id?: unknown; name?: unknown; paused?: unknown }[]) {
    const id = dealerId(item?.id);
    if (!id) continue;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : nameOf(id);
    out[id] = { name, paused: typeof item.paused === "string" && item.paused.trim() ? item.paused.trim() : null };
  }
  return out;
}

/** Each dealer's graph, built once per answer of the bank (the provider keeps them, so a switch builds nothing). */
export function dealerGraphs(bank: BankData, ids: readonly string[], build: (bank: BankData, dealer: string) => Graph = (b, dealer) => buildGraph(b, { dealer })): Record<string, Graph> {
  return Object.fromEntries(ids.map((id) => [id, build(bank, id)]));
}

/** One dealer in the switch: name, pause, how many takes the bank holds and how many of them wait for Jakob's word. */
export type DealerEntry = { id: string; name: string; paused: string | null; takes: number; waiting: number };

export function dealerEntries(ids: readonly string[], graphs: Readonly<Record<string, Graph>>, register: DealerRegister | null): DealerEntry[] {
  return ids.map((id) => {
    const graph = graphs[id];
    const note = register?.[id];
    return { id, name: note?.name ?? nameOf(id), paused: note?.paused ?? null, takes: graph ? Object.keys(graph.takes).length : 0, waiting: graph ? awaitingJakob(graph).length : 0 };
  });
}

// ── Which one ───────────────────────────────────────────────────────────────
/** What the address says about the dealer: its own word (null without one) and the takes it names. */
export type DealerAddress = { dealer: string | null; takes: string[] };

export function readDealerAddress(params: { get(name: string): string | null }): DealerAddress {
  const takes = TAKE_PARAMS.map((key) => params.get(key)?.trim() ?? "").filter(Boolean);
  return { dealer: params.get(DEALER_PARAM)?.trim() || null, takes };
}

export type Chosen = { id: string; from: "address" | "take" | "memory" | "default" };

/**
 * The dealer every view shows: the address's own word, else the dealer of a take the address names, else the remembered
 * choice, else Pamela. A word counts only for a dealer there is (known: the bank's and the register's); while the bank is
 * read (known null) any well-formed word is taken as it stands. owners: whose each take is (dealersOf).
 */
export function chooseDealer(input: { address: DealerAddress | null; remembered: string | null; known: readonly string[] | null; owners: Readonly<Record<string, string>> }): Chosen {
  const ok = (id: string | null | undefined): id is string => !!dealerId(id) && (!input.known || input.known.includes(id!));
  const asked = input.address?.dealer;
  if (ok(asked)) return { id: asked, from: "address" };
  const owner = input.address?.takes.map((t) => input.owners[t]).find(ok);
  if (owner) return { id: owner, from: "take" };
  if (ok(input.remembered)) return { id: input.remembered, from: "memory" };
  return { id: DEFAULT_DEALER, from: "default" };
}

// ── The address ─────────────────────────────────────────────────────────────
/**
 * A query ("?a=1&b=2", "a=1" or "") with the dealer's word set to `dealer`, or taken out for null: "?…" or "". The other
 * words are kept exactly as written (no new encoding), so that a view that compares its address with what it wrote still can.
 */
export function withDealer(search: string, dealer: string | null): string {
  const pairs = search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => pair && pair.split("=")[0] !== DEALER_PARAM);
  if (dealer) pairs.push(`${DEALER_PARAM}=${encodeURIComponent(dealer)}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

/** The same query without the dealer's word: for a view that writes its whole address and compares it with what it wrote. */
export const withoutDealer = (search: string): string => withDealer(search, null);

/** An address of the studio ("/karta/", "/granska/?vy=alla") that keeps the dealer: Pamela's addresses stay as they were. */
export function dealerHref(href: string, dealer: string): string {
  if (dealer === DEFAULT_DEALER) return href;
  const at = href.indexOf("?");
  const path = at < 0 ? href : href.slice(0, at);
  return `${path}${withDealer(at < 0 ? "" : href.slice(at), dealer)}`;
}

/**
 * The word the address should carry for `dealer`, or null for none: Pamela needs none (every address without one is hers
 * when nothing else is remembered), except where the address names a take of another dealer's (it would then decide).
 */
export function addressWord(dealer: string, address: DealerAddress, owners: Readonly<Record<string, string>>): string | null {
  if (dealer !== DEFAULT_DEALER) return dealer;
  return address.takes.some((t) => owners[t] && owners[t] !== dealer) ? dealer : null;
}

// ── A dealer with few films ─────────────────────────────────────────────────
/** "Paow har 3 av 33 filmer": how far the dealer's round is, or null when every film the round needs is there. */
export function filmsLine(graph: Pick<Graph, "summary">, name: string): string | null {
  const { done, total } = graph.summary.films;
  return done < total ? `${name} har ${done} av ${total} filmer` : null;
}

/** A round's steps for this dealer: a step locked to another dealer's take (Pamela's favourite round) plays this dealer's film. */
export function ownSteps(steps: readonly Step[], dealer: string, owners: Readonly<Record<string, string>>): Step[] {
  return steps.map((s) => (s.take && owners[s.take] && owners[s.take] !== dealer ? { from: s.from, to: s.to } : s));
}

/**
 * The ready round a dealer other than Pamela opens Scen on: the first one that plays without a gap, else the one that plays
 * the most of its steps (fewer gaps first, then the earlier). Rounds without steps (the reference films) are passed over.
 */
export function openingRound<R extends { steps: Step[] }>(graph: Graph, rounds: readonly R[], owners: Readonly<Record<string, string>>): R | null {
  let best: { round: R; played: number; gaps: number } | null = null;
  for (const round of rounds) {
    if (!round.steps.length) continue;
    const segments = resolveRound(graph, ownSteps(round.steps, graph.dealer, owners), { holeCardDown: true });
    const played = segments.filter((s) => s.take && !s.gap).length;
    const gaps = segments.length - played;
    if (!gaps) return round;
    if (!best || played > best.played || (played === best.played && gaps < best.gaps)) best = { round, played, gaps };
  }
  return best?.round ?? null;
}
