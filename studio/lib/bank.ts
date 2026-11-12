"use client";

// The clip bank for every view: one provider in the shell reads /api/clip-bank on start and again every 4 s while the tab
// is visible (as the old lab does), and builds the graph with the lab's own buildGraph only when the answer changed.
// When nothing changed, the same objects are kept, so a view that reads useBank() does not render again every 4 s.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildGraph, type Edge, type Graph, type Take } from "../../src/clip-graph.ts";
import { ApiError, asApiError, readBank, type ClipBankResponse } from "./api.ts";

export type BankStatus = "loading" | "ready" | "error";

/**
 * bank: the answer as it came; graph: buildGraph(bank). status: "loading" until the first answer, "error" when there has
 * never been one, else "ready". error: the last failed read (kept beside old data: the data is then stale, not gone).
 * readAt: when the data last changed (ms). reload(): read now, resolved when the new data is in (use it after a write).
 */
export type BankState = {
  bank: ClipBankResponse | null;
  graph: Graph | null;
  status: BankStatus;
  error: ApiError | null;
  readAt: number | null;
  reload: () => Promise<void>;
};

type Data = Omit<BankState, "reload">;
const BankContext = createContext<BankState | null>(null);

export function BankProvider({ children, every = 4000 }: { children: ReactNode; every?: number }) {
  const [data, setData] = useState<Data>({ bank: null, graph: null, status: "loading", error: null, readAt: null });
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
      const graph = buildGraph(bank);
      last.current = text;
      setData({ bank, graph, status: "ready", error: null, readAt: Date.now() });
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

  const value = useMemo<BankState>(() => ({ ...data, reload: read }), [data, read]);
  return createElement(BankContext.Provider, { value }, children);
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
