"use client";

// The text that goes to Runway, as it goes (selectable, not one character changed), with the parts a choice made marked
// quietly: the hand, closed or open, the turn, Jakob's own addition and the bans; a legend under it names the marks that
// appear. The parts come from src/order-prompts.ts, the function the store writes the text with; without them (an order
// on an older template) the text is shown unmarked.
import type { ReactNode } from "react";
import { CHOICE_MARK, markOf, type Choice, type Part } from "../../lib/orders.ts";
import { cn } from "../ui";

export function PromptText({ text, parts, className }: { text: string; parts: Part[] | null; className?: string }) {
  const used = new Set<Choice>();
  const body: ReactNode[] = [];
  if (parts) {
    parts.filter((p) => p.text).forEach((p, i) => {
      const mark = markOf(p);
      if (mark) used.add(mark);
      if (i) body.push(" ");
      body.push(
        mark ? (
          <span key={i} className={cn("rounded-xs", CHOICE_MARK[mark].className)} title={`Kommer av: ${p.from.map((c) => CHOICE_MARK[c].word).join(", ")}`}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      );
    });
  } else body.push(text);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="select-text whitespace-pre-wrap rounded-lg border border-line bg-well px-4 py-3 text-[13px] leading-[23px] text-ink">{body}</p>
      {used.size ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
          <span className="text-faint">Understruket kommer av ditt val:</span>
          {[...used].map((c) => (
            <span key={c}>
              <span className={cn("mr-1 inline-block size-2 rounded-xs", CHOICE_MARK[c].swatch)} />
              {CHOICE_MARK[c].word}
            </span>
          ))}
        </div>
      ) : !parts ? (
        <p className="text-xs text-faint">Skriven med en äldre mall: texten visas som den är, utan markeringar.</p>
      ) : null}
    </div>
  );
}
