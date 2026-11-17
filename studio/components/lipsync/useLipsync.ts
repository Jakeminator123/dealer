"use client";

// const { answer, error, status } = useLipsync(): the lip-sync facts (lib/lipsync.ts) for the view Lipsync. Read when the view
// is on screen and again whenever the tab is shown, so that what the speech lane wrote meanwhile is there when Jakob comes
// back. A read that fails keeps what was read last, with the error beside it. In the online copy nothing is read.
import { useSyncExternalStore } from "react";
import { asApiError, type ApiError } from "../../lib/api.ts";
import { getLipsync, type LipsyncAnswer } from "../../lib/lipsync.ts";
import { isSnapshot } from "../../lib/mode.ts";

export type LipsyncState = { answer: LipsyncAnswer | null; error: ApiError | null; status: "idle" | "loading" | "ready" | "error" };

const EMPTY: LipsyncState = { answer: null, error: null, status: "idle" };
let state: LipsyncState = EMPTY;
let reading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<LipsyncState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** Reads the facts again; the state changes only when something did. */
export function refreshLipsync(): Promise<void> {
  if (isSnapshot) return Promise.resolve();
  if (reading) return reading;
  if (state.status === "idle" || state.status === "error") set({ status: "loading" });
  reading = getLipsync()
    .then(
      (answer) => {
        if (JSON.stringify(answer) !== JSON.stringify(state.answer) || state.status !== "ready" || state.error) set({ answer, error: null, status: "ready" });
      },
      (error) => set({ error: asApiError(error, "Fakta om läppsynken"), status: state.answer ? "ready" : "error" }),
    )
    .finally(() => {
      reading = null;
    });
  return reading;
}

const onShow = () => {
  if (document.visibilityState === "visible") void refreshLipsync();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && !isSnapshot) {
    void Promise.resolve().then(refreshLipsync);
    document.addEventListener("visibilitychange", onShow);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) document.removeEventListener("visibilitychange", onShow);
  };
}

export function useLipsync(): LipsyncState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}
