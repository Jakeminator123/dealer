"use client";

// The row of trees at the top of Karta: one chip per tree of the dealer with its name and its number against his measure
// ("Casino 22/36", "Tatuerad 0/36 · byggs"). The choice is in the address (?trad=<id>), so a link opens a given tree.
// Prova i Casino after the chips opens the Casino with the dealer and the chosen tree (lib/casino.ts casinoAddress, ?trad=):
// the game plays that tree's films only, and a card without a film is laid without a hand (src/game-page.ts).
import { Play } from "lucide-react";
import Link from "next/link";
import { countWord, type TreeView } from "../../../src/dealer-trees.ts";
import { casinoAddress } from "@/lib/casino";
import { withDealer } from "@/lib/dealer";
import { CASINO_PRESET } from "@/lib/scene-presets";
import { buttonClasses, cn } from "@/components/ui";

const STATE_WORD: Record<string, string> = { byggs: "byggs", vilar: "vilar" };

/** A tree's chip text: its name, its number, and its state unless the game plays it. */
export const treeChip = (v: Pick<TreeView, "tree" | "count">): string => `${v.tree.name} ${countWord(v.count)}${STATE_WORD[v.tree.state] ? ` · ${STATE_WORD[v.tree.state]}` : ""}`;

/** The Casino with Casino's look, the dealer named and only the tree's films: /game/?forval=…&trad=tatuerad&dealer=paow. */
export const trialHref = (dealer: string, tree: string): string => {
  const href = casinoAddress(CASINO_PRESET, {}, null, tree), at = href.indexOf("?");
  return `${href.slice(0, at)}${withDealer(href.slice(at), dealer)}`;
};

export function TreeRow({ trees, chosen, onChoose }: { trees: readonly TreeView[]; chosen: string; onChoose: (id: string) => void }) {
  const picked = trees.find((v) => v.tree.id === chosen) ?? null;
  return (
    <div className="flex min-w-0 items-center gap-2">
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
      {picked ? (
        <Link
          href={trialHref(picked.dealer, picked.tree.id)}
          className={buttonClasses({ variant: "quiet", size: "sm" })}
          title={`Spela ${picked.tree.name} i Casinot: bara trädets filmer (${countWord(picked.count)}), ett kort utan film läggs utan hand`}
        >
          <Play /> Prova i Casino
        </Link>
      ) : null}
    </div>
  );
}
