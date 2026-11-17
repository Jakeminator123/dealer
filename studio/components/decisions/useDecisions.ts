"use client";

// const { answer, error, status } = useDecisions(): the register of what waits for Jakob (lib/decisions.ts), one read for
// every part of the studio that shows it (the rail's count, the start page's entry and the view Beslut). It is read when the
// first of them is on screen, every 20 s while the tab is visible, at once when the tab is shown again, and after an answer.
// An answer the view saved (applySaved) is shown at once; a read that started before it is not let over it.
// In the online copy nothing is read: the state stays empty.
import { useSyncExternalStore } from "react";
import { asApiError, type ApiError } from "../../lib/api.ts";
import { getDecisions, replaceEntry, type DecisionsAnswer, type ShownDecision } from "../../lib/decisions.ts";
import { isSnapshot } from "../../lib/mode.ts";

export type DecisionsState = { answer: DecisionsAnswer | null; error: ApiError | null; status: "idle" | "loading" | "ready" | "error" };

const EMPTY: DecisionsState = { answer: null, error: null, status: "idle" };
const EVERY = 20000;
let state: DecisionsState = EMPTY;
let writes = 0;
let reading: { promise: Promise<void>; at: number } | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<DecisionsState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** Reads the register again; the state changes only when something did. */
export function refreshDecisions(): Promise<void> {
  if (isSnapshot) return Promise.resolve();
  if (reading && reading.at === writes) return reading.promise;
  const at = writes;
  if (state.status === "idle") set({ status: "loading" });
  const promise = getDecisions().then(
    (answer) => {
      if (at !== writes) return; // an answer was saved meanwhile: this read may not hold it yet
      if (JSON.stringify(answer) !== JSON.stringify(state.answer) || state.status !== "ready" || state.error) set({ answer, error: null, status: "ready" });
    },
    (error) => {
      if (at !== writes) return;
      set({ error: asApiError(error, "Frågorna"), status: state.answer ? "ready" : "error" });
    },
  );
  const mine = { promise, at };
  reading = mine;
  void promise.finally(() => {
    if (reading === mine) reading = null;
  });
  return promise;
}

/** An entry as the lab answered after his press: shown at once, then read again with the rest. */
export function applySaved(decision: ShownDecision) {
  writes++;
  if (state.answer) set({ answer: { ...state.answer, decisions: replaceEntry(state.answer.decisions, decision) } });
  void refreshDecisions();
}

const visible = () => document.visibilityState === "visible";
const onShow = () => {
  if (visible()) void refreshDecisions();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && !isSnapshot) {
    void Promise.resolve().then(refreshDecisions);
    timer = window.setInterval(onShow, EVERY);
    document.addEventListener("visibilitychange", onShow);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onShow);
    }
  };
}

export function useDecisions(): DecisionsState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}
