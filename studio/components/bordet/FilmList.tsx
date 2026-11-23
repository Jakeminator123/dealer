"use client";

// A film's five marks (lib/bordet.ts Mark: Första bild, Slutbild, Referensfilm, Text, Pris; ready, missing or waiting, the words
// written on the mark, so the price stands on Pris), as the guide Ny film shows them in Hur (NewFilm.tsx), and the way to a
// draft in Kön. A mark that only waits for another film (a return for its deal) says so in a quiet tone, not as a fault
// (Jakob 2026-11-23, docs/BESKED.md "Rensa bort regler och låsningar som blockerar").
import type { Mark } from "../../lib/bordet.ts";
import { cn } from "../ui";

/** The drafts made in the guide, per film: the film's key (lib/bordet.ts wishKey) → the order's id. */
export type Made = Record<string, string>;
/** Kön with a draft open ("Det här skickas"), where it is approved. */
export const queueHref = (order: string) => `/bordet/?lage=ko&order=${encodeURIComponent(order)}`;

/**
 * A row's five marks as small chips: ready (✓), missing (✗) or waiting for another film (…, in a quiet tone: nothing is
 * wrong), the name and its few words written out on the chip ("Slutbild A3P4C2", "Pris 64 krediter"), since a phone has
 * no hover.
 */
export function Marks({ marks }: { marks: readonly Mark[] }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Det filmen behöver">
      {marks.map((m) => (
        <li
          key={m.name}
          data-mark={m.name}
          data-ready={m.ready ? "1" : "0"}
          data-waits={m.waits ? "1" : undefined}
          className={cn("inline-flex min-h-5 items-center gap-1 rounded-sm border px-1.5 py-px text-2xs", m.ready ? "border-godkand/30 bg-godkand/10 text-[#6cc595]" : m.waits ? "border-line bg-raised/50 text-dim" : "border-anmarkning/35 bg-anmarkning/10 text-[#f0b07a]")}
        >
          <span aria-hidden>{m.ready ? "✓" : m.waits ? "…" : "✗"}</span>
          <span className="sr-only">{m.ready ? "klar: " : m.waits ? "väntar: " : "saknas: "}</span>
          <span>{m.name}</span>
          {m.words ? <span data-mark-words className="text-ink/80">{m.words}</span> : null}
        </li>
      ))}
    </ul>
  );
}
