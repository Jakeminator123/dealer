"use client";

// The clip bank for every view, as one dealer's: one provider in the shell reads /api/clip-bank on start and again every 4 s
// while the tab is visible (as the old lab does), and builds each dealer's graph with the lab's own buildGraph only when the
// answer changed. When nothing changed, the same objects are kept, so a view that reads useBank() does not render again every 4 s.
// graph is the chosen dealer's (lib/dealer.ts: the address's ?dealer=, a take the address names, the remembered choice, else
// Pamela), so every view that reads it shows that dealer's takes; the rail's switch (setDealer) changes it for all of them.
// The online copy (lib/mode.ts) never changes: there the bank is read once, and the graph carries no cost.
import { Suspense, createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { buildGraph, dealersOf, type BankData, type Edge, type Graph, type Take } from "../../src/clip-graph.ts";
import { ApiError, asApiError, readBank, type ClipBankResponse } from "./api.ts";
import {
  DEALER_MEMORY,
  addressWord,
  bankDealers,
  chooseDealer,
  dealerEntries,
  dealerGraphs,
  dealerId,
  readDealerAddress,
  readDealerRegister,
  withDealer,
  withoutDealer,
  type DealerAddress,
  type DealerEntry,
  type DealerRegister,
} from "./dealer.ts";
import { readJson } from "./lab.ts";
import { isSnapshot } from "./mode.ts";

/**
 * The graph without what it reckons in credits. The copy's bank has no receipts' costs and no budget, but buildGraph still
 * estimates a take's cost from its length and resolution; costs are never shown in the copy, so the estimate is taken out.
 */
export function withoutCosts(graph: Graph): Graph {
  for (const take of Object.values(graph.takes)) take.credits = 0;
  graph.summary.credits = { committed: null, maximum: null };
  return graph;
}

const build = (bank: BankData, dealer: string): Graph => (isSnapshot ? withoutCosts(buildGraph(bank, { dealer })) : buildGraph(bank, { dealer }));

export type BankStatus = "loading" | "ready" | "error";

/**
 * bank: the answer as it came (every dealer's); graph: buildGraph(bank, {dealer}) for the chosen dealer, null until both the
 * bank and the dealer are read. status: "loading" until then, "error" when there has never been an answer, else "ready".
 * error: the last failed read (kept beside old data: the data is then stale, not gone). readAt: when the data last changed
 * (ms). reload(): read now, resolved when the new data is in (use it after a write).
 * dealer: whose studio it is; dealers: the bank's dealers for the switch, with names and how many takes wait for Jakob;
 * setDealer(id): choose one (the address and the memory follow); owners: whose each take is, by id.
 */
export type BankState = {
  bank: ClipBankResponse | null;
  graph: Graph | null;
  status: BankStatus;
  error: ApiError | null;
  readAt: number | null;
  reload: () => Promise<void>;
  dealer: string;
  dealers: DealerEntry[];
  setDealer: (id: string) => void;
  owners: Readonly<Record<string, string>>;
};

type Data = { bank: ClipBankResponse | null; graphs: Record<string, Graph>; owners: Record<string, string>; status: BankStatus; error: ApiError | null; readAt: number | null };
const BankContext = createContext<BankState | null>(null);

// ── The memory of the choice (a convenience of this browser: it may be missing, and then the address or Pamela decides) ──
function remembered(): string | null {
  try {
    return dealerId(window.localStorage.getItem(DEALER_MEMORY));
  } catch {
    return null;
  }
}
function remember(id: string) {
  try {
    window.localStorage.setItem(DEALER_MEMORY, id);
  } catch {
    /* private window: the choice lasts as long as the address says it */
  }
}

/** What the provider has read of the browser: the address's word and takes, and the remembered choice. */
type Seen = { address: DealerAddress; memory: string | null };

/**
 * Reads the address (and the memory with it) for the provider. useSearchParams follows Next's navigations and every
 * replaceState(null, …) a view makes; it sits in its own <Suspense>, so the shell's pages are still prerendered without it.
 */
function DealerFromAddress({ onRead }: { onRead: (seen: Seen) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => onRead({ address: readDealerAddress(new URLSearchParams(query)), memory: remembered() }), [query, onRead]);
  return null;
}

export function BankProvider({ children, every = 4000 }: { children: ReactNode; every?: number }) {
  const [data, setData] = useState<Data>({ bank: null, graphs: {}, owners: {}, status: "loading", error: null, readAt: null });
  const last = useRef<string | null>(null);
  const serial = useRef(0);
  const busy = useRef(false);

  const read = useCallback(async () => {
    const mine = ++serial.current;
    busy.current = true;
    try {
      const { text, data: bank } = await readBank();
      if (mine !== serial.current) return; // a newer read has started; its answer decides
      if (text === last.current) {
        setData((d) => (d.error ? { ...d, error: null, status: "ready" } : d));
        return;
      }
      const owners = dealersOf(bank);
      const graphs = dealerGraphs(bank, bankDealers(owners), build);
      last.current = text;
      setData({ bank, graphs, owners, status: "ready", error: null, readAt: Date.now() });
    } catch (error) {
      if (mine !== serial.current) return;
      const failure = asApiError(error, "Klippbanken");
      setData((d) => (d.error?.message === failure.message && d.status !== "loading" ? d : { ...d, error: failure, status: d.bank ? "ready" : "error" }));
    } finally {
      if (mine === serial.current) busy.current = false;
    }
  }, []);

  useEffect(() => {
    void read();
    // The online copy is frozen: one read is all there is (reload() still reads again when a view asks).
    if (isSnapshot) return;
    const tick = () => {
      if (document.visibilityState === "visible" && !busy.current) void read();
    };
    const timer = window.setInterval(tick, every);
    const seen = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", seen);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [read, every]);

  // ── Whose studio ──
  const [seen, setSeen] = useState<Seen | null>(null); // null until the address and the memory have been read
  const [register, setRegister] = useState<DealerRegister | null>(null);
  useEffect(() => {
    // The names and the pause (data/dealers.json). The copy does not carry the file: there a dealer is named by its id.
    if (isSnapshot) return;
    let gone = false;
    readJson("data/dealers.json", "Dealerna").then(
      (value) => !gone && setRegister(readDealerRegister(value)),
      () => {},
    );
    return () => {
      gone = true;
    };
  }, []);

  const loaded = !!data.bank;
  const settled = seen !== null;
  const address = seen?.address ?? null;
  const ids = useMemo(() => bankDealers(data.owners), [data.owners]);
  const known = useMemo(() => (loaded ? [...new Set([...ids, ...Object.keys(register ?? {})])] : null), [loaded, ids, register]);
  const dealer = chooseDealer({ address, remembered: seen?.memory ?? null, known, owners: data.owners }).id;
  // A dealer the register knows and the bank has no take of yet still has a graph: every film missing.
  const graph = useMemo(() => (settled && data.bank ? (data.graphs[dealer] ?? build(data.bank, dealer)) : null), [settled, data.bank, data.graphs, dealer]);
  const shown = useMemo(() => (ids.includes(dealer) ? ids : [...ids, dealer]), [ids, dealer]);
  const dealers = useMemo(() => dealerEntries(shown, graph && !data.graphs[dealer] ? { ...data.graphs, [dealer]: graph } : data.graphs, register), [shown, data.graphs, graph, dealer, register]);

  // The choice is remembered once it is known for certain (the bank read, so that an unknown word is not kept).
  useEffect(() => {
    if (settled && loaded) remember(dealer);
  }, [settled, loaded, dealer]);

  // The address says whose studio it is: a view reached without the word (a link inside a view, a typed address) gets it.
  // A view that keeps writing its whole address without it is left alone after twice (the memory still holds the choice).
  const fixed = useRef(new Map<string, number>());
  useEffect(() => {
    if (!settled || !loaded || !address) return;
    const word = addressWord(dealer, address, data.owners);
    if ((address.dealer ?? null) === word || (!word && address.dealer === dealer)) return;
    const key = window.location.pathname + withoutDealer(window.location.search);
    const times = fixed.current.get(key) ?? 0;
    if (times >= 2) return;
    fixed.current.set(key, times + 1);
    window.history.replaceState(null, "", `${window.location.pathname}${withDealer(window.location.search, word)}`);
  }, [settled, loaded, address, dealer, data.owners]);

  const owners = data.owners;
  const setDealer = useCallback(
    (id: string) => {
      if (!dealerId(id)) return;
      const here = readDealerAddress(new URLSearchParams(window.location.search));
      const word = addressWord(id, here, owners);
      // null, never history.state: Next then updates useSearchParams (studio/tests/address-write.test.ts).
      window.history.replaceState(null, "", `${window.location.pathname}${withDealer(window.location.search, word)}`);
      remember(id);
      setSeen({ address: { ...here, dealer: word }, memory: id });
    },
    [owners],
  );

  const status: BankStatus = data.status === "ready" && !settled ? "loading" : data.status;
  const value = useMemo<BankState>(
    () => ({ bank: data.bank, graph, status, error: data.error, readAt: data.readAt, reload: read, dealer, dealers, setDealer, owners }),
    [data.bank, graph, status, data.error, data.readAt, read, dealer, dealers, setDealer, owners],
  );
  return createElement(BankContext.Provider, { value }, createElement(Suspense, { fallback: null }, createElement(DealerFromAddress, { onRead: setSeen })), children);
}

/** The bank, its graph and how reading it goes. Must be used under the shell (BankProvider). */
export function useBank(): BankState {
  const bank = useContext(BankContext);
  if (!bank) throw new Error("useBank används utanför BankProvider (skalet).");
  return bank;
}

/** The bank when there is a provider, else null: for pieces that also work without one. */
export const useOptionalBank = (): BankState | null => useContext(BankContext);

/** One take by id, or null while the bank is read or when it does not exist. */
export function useTake(id: string | null | undefined): Take | null {
  const { graph } = useBank();
  return id && graph ? (graph.takes[id] ?? null) : null;
}

/** One edge by id ("READY>P4.C1"), or null. */
export function useEdge(id: string | null | undefined): Edge | null {
  const { graph } = useBank();
  return id && graph ? (graph.edge[id] ?? null) : null;
}
