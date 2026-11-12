"use client";

// Where the stage is, for whoever shows it: the transport's read-out and scrub bar, the round strip's marked step. The stage
// writes it once per drawn frame; a reader subscribes with a selector and renders only when what it selects changes.
import { useSyncExternalStore } from "react";
import type { Position } from "../../lib/parts.ts";

export type ClockState = { pos: Position | null; playing: boolean };
export type Clock = { get(): ClockState; set(next: Partial<ClockState>): void; subscribe(call: () => void): () => void };

export function createClock(): Clock {
  let state: ClockState = { pos: null, playing: false };
  const calls = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const pos = next.pos === undefined ? state.pos : next.pos;
      const playing = next.playing ?? state.playing;
      if (pos?.step === state.pos?.step && pos?.frame === state.pos?.frame && playing === state.playing) return;
      state = { pos, playing };
      for (const call of calls) call();
    },
    subscribe(call) {
      calls.add(call);
      return () => calls.delete(call);
    },
  };
}

const IDLE: ClockState = { pos: null, playing: false };

/** A value read from the clock; the component renders again only when it changes (return a string, number or boolean). */
export function useClock<T>(clock: Clock | null | undefined, select: (state: ClockState) => T): T {
  return useSyncExternalStore(
    clock ? clock.subscribe : noop,
    () => select(clock ? clock.get() : IDLE),
    () => select(IDLE),
  );
}
const noop = () => () => {};
