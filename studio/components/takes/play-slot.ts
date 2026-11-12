"use client";

// One film plays at a time among the take cards and the film viewer (Jakob 2026-11-12): a card or the viewer that starts
// a film takes the slot, and every other holder hears that it lost it (and pauses, or goes back to its still).
import { useEffect, useRef } from "react";

let holder: symbol | null = null;
const listeners = new Set<() => void>();

/** A holder of the slot: claim() when it starts playing; onLost runs when another holder claims it. */
export function usePlaySlot(onLost: () => void) {
  const me = useRef(Symbol("film"));
  const lost = useRef(onLost);
  useEffect(() => {
    lost.current = onLost;
  });
  useEffect(() => {
    const own = me.current;
    const hear = () => {
      if (holder !== own) lost.current();
    };
    listeners.add(hear);
    return () => {
      listeners.delete(hear);
      if (holder === own) holder = null;
    };
  }, []);
  return {
    claim: () => {
      holder = me.current;
      for (const hear of listeners) hear();
    },
    release: () => {
      if (holder === me.current) holder = null;
    },
  };
}
