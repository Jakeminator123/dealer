"use client";

// The dealer's trees as the lab answers them (GET /api/trees?dealer=<id>, tools/dealer-tree.ts): each tree's pictures, its
// 36 steps against his measure with their state, and its number (src/dealer-trees.ts). Read again when the bank changes
// (readAt), one read shared by Karta and the rail. The online copy has no such answer: state "off", and Karta draws the bank's
// map instead; an older lab server answers 404 the same way until it is restarted.
import { useEffect, useState } from "react";
import { defaultTree, type TreeAnswer, type TreeView } from "../../../src/dealer-trees.ts";
import { labUrl } from "@/lib/lab";
import { isSnapshot } from "@/lib/mode";

export type Trees = { state: "loading" | "ready" | "off"; answer: TreeAnswer | null; error: string | null };

const shared = new Map<string, Promise<TreeAnswer | null>>();
async function fetchTrees(dealer: string): Promise<TreeAnswer | null> {
  const response = await fetch(labUrl(`api/trees?dealer=${encodeURIComponent(dealer)}`), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    let said = "";
    try {
      said = String((await response.json())?.error ?? "");
    } catch {}
    throw new Error(said || `Träden kunde inte läsas (${response.status}).`);
  }
  return (await response.json()) as TreeAnswer;
}
const readOnce = (dealer: string, readAt: number | null) => {
  const key = `${dealer}@${readAt ?? 0}`;
  let p = shared.get(key);
  if (!p) {
    // Keep the newest few reads only: the bank changes every few seconds while a film is judged.
    if (shared.size > 6) shared.delete(shared.keys().next().value!);
    p = fetchTrees(dealer);
    shared.set(key, p);
    p.catch(() => shared.delete(key));
  }
  return p;
};

export function useTrees(dealer: string | null, readAt: number | null): Trees {
  const [trees, setTrees] = useState<Trees>({ state: isSnapshot ? "off" : "loading", answer: null, error: null });
  useEffect(() => {
    if (isSnapshot || !dealer) return;
    let live = true;
    readOnce(dealer, readAt)
      .then((answer) => live && setTrees(answer ? { state: "ready", answer, error: null } : { state: "off", answer: null, error: null }))
      // A failed read keeps the last answer (stale, not gone); with none, Karta falls back to the bank's map.
      .catch((e: unknown) => live && setTrees((t) => ({ state: t.answer ? "ready" : "off", answer: t.answer, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      live = false;
    };
  }, [dealer, readAt]);
  // An answer for another dealer (the switch was just used) is not shown.
  return trees.answer && trees.answer.dealer !== dealer ? { state: "loading", answer: null, error: null } : trees;
}

/** The tree a view shows first: the one the game plays (not one that shares another), else the first. */
export const firstTree = (answer: TreeAnswer | null): TreeView | null => {
  const def = answer ? defaultTree(answer.trees.map((v) => v.tree)) : null;
  return answer?.trees.find((v) => v.tree.id === def?.id) ?? null;
};
