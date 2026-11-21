"use client";

// The row of trees at the top of Karta: one chip per tree of the dealer with its name and its number against his measure
// ("Casino 22/36", "Tatuerad 0/36 · byggs"). The choice is in the address (?trad=<id>), so a link opens a given tree.
import { countWord, type TreeView } from "../../../src/dealer-trees.ts";
import { cn } from "@/components/ui";

const STATE_WORD: Record<string, string> = { byggs: "byggs", vilar: "vilar" };

/** A tree's chip text: its name, its number, and its state unless the game plays it. */
export const treeChip = (v: Pick<TreeView, "tree" | "count">): string => `${v.tree.name} ${countWord(v.count)}${STATE_WORD[v.tree.state] ? ` · ${STATE_WORD[v.tree.state]}` : ""}`;

export function TreeRow({ trees, chosen, onChoose }: { trees: readonly TreeView[]; chosen: string; onChoose: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Träd" className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {trees.map((v) => {
        const on = v.tree.id === chosen;
        const shares = v.tree.shares ? trees.find((t) => t.tree.id === v.tree.shares)?.tree.name : null;
        return (
          <button
            key={v.tree.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChoose(v.tree.id)}
            title={`${v.count.have} av ${v.count.total} steg har en film (Primär, Godkänd eller Variant)${shares ? `; spelar ${shares}s filmer, med filmen före spelet först` : ""}`}
            className={cn(
              "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-[12.5px] font-medium tabular-nums transition-colors duration-150",
              on ? "border-brass/70 bg-brass/10 text-ink" : "border-line-strong text-dim hover:border-[#4a5a51] hover:text-ink",
            )}
          >
            {treeChip(v)}
          </button>
        );
      })}
    </div>
  );
}
