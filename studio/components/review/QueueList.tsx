"use client";

// <QueueList items={queue} current={id} onOpen={(id) => …} />: the narrow list beside the take under review: every take
// that waits for Jakob, grouped as the old lab groups them, each with a still and its chip; the ones he decided in this
// sitting stay, ticked. The open one is marked in brass.
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { edgeName, takeNames } from "../../lib/names.ts";
import type { QueueItem } from "../../lib/review.ts";
import { TakeChip, TakeThumb } from "../takes";
import { cn } from "../ui/cn";

export function QueueList({ items, current, onOpen }: { items: readonly QueueItem[]; current: string | null; onOpen: (id: string) => void }) {
  const open = useRef<HTMLButtonElement>(null);
  // The open take is kept in view as the queue moves on.
  useEffect(() => {
    open.current?.scrollIntoView({ block: "nearest" });
  }, [current]);

  let last = "";
  return (
    <ol className="flex flex-col pb-4">
      {items.map((item) => {
        const head = item.group !== last ? item.group : null;
        last = item.group;
        const on = item.take.id === current;
        const name = takeNames(item.edge.takes).get(item.take.id) ?? item.take.id;
        return (
          <li key={item.take.id}>
            {head ? <h3 className="sticky top-0 z-10 bg-surface/95 px-4 pb-1.5 pt-4 text-2xs font-semibold uppercase tracking-[0.08em] text-faint backdrop-blur-sm">{head}</h3> : null}
            <button
              ref={on ? open : undefined}
              type="button"
              aria-current={on || undefined}
              onClick={() => onOpen(item.take.id)}
              className={cn(
                "relative flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150",
                on ? "bg-raised" : "hover:bg-raised/60",
                item.decided && !on && "opacity-60",
              )}
            >
              {on ? <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-brass" /> : null}
              <div className="relative w-[72px] shrink-0">
                <TakeThumb take={item.take} still="film" scrub={false} className="rounded-sm" />
                {item.decided ? (
                  <span className="absolute inset-0 grid place-items-center rounded-sm bg-black/45">
                    <Check className="size-5 text-[#6cc595]" strokeWidth={3} />
                  </span>
                ) : null}
              </div>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={cn("truncate text-sm font-medium", on ? "text-ink" : "text-ink/90")}>{name}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <TakeChip take={item.take} size="sm" />
                  <span className="truncate text-2xs text-faint">{edgeName(item.edge)}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
