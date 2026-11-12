"use client";

// <TakeCard take={take} selected onSelect={() => …} actions={<Button …/>} layout="stack|row" still="film" />
// One take: thumbnail (scrubs on hover), short name, verdict chip, facts (model · length · frames · day), and a slot for
// actions below. onSelect makes the picture and text one button; the actions stay separate buttons beside it.
import { useState, type ReactNode } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { factsLine, formatSeconds, takeFacts, takeName } from "../../lib/names.ts";
import { cn } from "../ui/cn";
import { TakeChip } from "./VerdictChip";
import { TakeThumb } from "./TakeThumb";

export function TakeCard({
  take,
  name,
  selected = false,
  onSelect,
  actions,
  layout = "stack",
  still = "auto",
  frame,
  extra,
  className,
}: {
  take: Take;
  /** The name to show; default the take's short name within its edge (lib/names.ts takeName). */
  name?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Buttons under the card (stack) or at its right (row). */
  actions?: ReactNode;
  layout?: "stack" | "row";
  still?: "auto" | "first" | "film";
  frame?: number;
  /** A line under the facts: why it plays, a note. */
  extra?: ReactNode;
  className?: string;
}) {
  const bank = useOptionalBank();
  const [focused, setFocused] = useState(false);
  const siblings = bank?.graph?.edge[take.edge]?.takes;
  const title = name ?? takeName(take, siblings);
  const facts = takeFacts(take);
  const row = layout === "row";

  const body = (
    <>
      <TakeThumb take={take} still={still} frame={frame} active={focused} className={cn(row ? "w-36 shrink-0 rounded-md" : "rounded-b-none rounded-t-[11px]")}>
        {facts.seconds !== null ? (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-xs bg-black/65 px-1.5 py-0.5 text-2xs font-medium text-ink tabular-nums backdrop-blur-sm">
            {formatSeconds(facts.seconds)}
          </span>
        ) : null}
      </TakeThumb>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", row ? "py-0.5" : "px-3 pb-3 pt-2.5")}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={take.id}>
            {title}
          </span>
          <TakeChip take={take} size="sm" />
        </div>
        <span className="truncate text-xs text-faint">{factsLine(facts)}</span>
        {extra ? <div className="text-xs text-dim">{extra}</div> : null}
      </div>
    </>
  );

  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "group relative flex min-w-0 rounded-lg border bg-surface shadow-inset transition-[border-color,background-color,box-shadow] duration-150",
        row ? "items-center gap-3 p-2 pr-3" : "flex-col",
        selected ? "border-brass/70 shadow-[0_0_0_1px_rgb(217_185_106/0.5)]" : "border-line hover:border-line-strong",
        className,
      )}
    >
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
          onBlur={() => setFocused(false)}
          className={cn("flex min-w-0 flex-1 rounded-[11px] text-left focus-visible:outline-offset-[3px]", row ? "items-center gap-3" : "flex-col")}
        >
          {body}
        </button>
      ) : (
        <div className={cn("flex min-w-0 flex-1", row ? "items-center gap-3" : "flex-col")}>{body}</div>
      )}
      {actions ? <div className={cn("flex shrink-0 flex-wrap items-center gap-1.5", row ? "" : "border-t border-line px-3 py-2")}>{actions}</div> : null}
    </div>
  );
}
