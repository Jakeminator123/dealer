"use client";

// The dealer's compositions as the lab answers them (GET /api/compositions?dealer=<id>, tools/dealer-composition.ts): each
// composition drawn (what its 36 steps are covered by, its number), her trees to choose from, the verdict of every film placed
// in a tree, and how far a reused film's card is moved (src/composition.ts). Saved and removed through the same address, in
// the lab only. The online copy has no compositions: state "off".
import { useCallback, useEffect, useState } from "react";
import type { CompositionAnswer, CompositionDef } from "../../../src/composition.ts";
import { labUrl } from "@/lib/lab";
import { isSnapshot } from "@/lib/mode";

export type Compositions = { state: "loading" | "ready" | "off"; answer: CompositionAnswer | null; error: string | null; reload: () => void };

const address = (dealer: string, id?: string) => labUrl(`api/compositions?dealer=${encodeURIComponent(dealer)}${id ? `&komposition=${encodeURIComponent(id)}` : ""}`);
const said = async (response: Response, what: string) => {
  let error = "";
  try {
    error = String((await response.json())?.error ?? "");
  } catch {}
  return error || `${what} (${response.status}).`;
};

export function useCompositions(dealer: string | null, readAt: number | null): Compositions {
  const [turn, setTurn] = useState(0);
  const [got, setGot] = useState<Omit<Compositions, "reload">>({ state: isSnapshot ? "off" : "loading", answer: null, error: null });
  useEffect(() => {
    if (isSnapshot || !dealer) return;
    let live = true;
    fetch(address(dealer), { cache: "no-store" })
      .then(async (response) => {
        if (!live) return;
        // An older lab server has no such address until it is restarted.
        if (response.status === 404) return setGot({ state: "off", answer: null, error: null });
        if (!response.ok) throw new Error(await said(response, "Kompositionerna kunde inte läsas"));
        const answer = (await response.json()) as CompositionAnswer;
        if (live) setGot({ state: "ready", answer, error: null });
      })
      .catch((e: unknown) => live && setGot((g) => ({ state: g.answer ? "ready" : "off", answer: g.answer, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      live = false;
    };
  }, [dealer, readAt, turn]);
  const reload = useCallback(() => setTurn((t) => t + 1), []);
  return got.answer && got.answer.dealer !== dealer ? { state: "loading", answer: null, error: null, reload } : { ...got, reload };
}

/** Saves one composition (a new id is added, a known one replaced). Throws what the lab said when it does not hold. */
export async function saveComposition(dealer: string, def: CompositionDef): Promise<void> {
  if (isSnapshot) throw new Error("Det här är en kopia: inget sparas här.");
  const response = await fetch(address(dealer), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(def) });
  if (!response.ok) throw new Error(await said(response, "Kompositionen kunde inte sparas"));
}

export async function removeComposition(dealer: string, id: string): Promise<void> {
  if (isSnapshot) throw new Error("Det här är en kopia: inget tas bort här.");
  const response = await fetch(address(dealer, id), { method: "DELETE" });
  if (!response.ok) throw new Error(await said(response, "Kompositionen kunde inte tas bort"));
}
