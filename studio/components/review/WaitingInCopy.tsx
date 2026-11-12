"use client";

// <WaitingInCopy items={queue.items} onOpen={(id) => …} onAll={() => …} />: the queue in the online copy. The copy carries
// no films of the takes that wait for Jakob, so instead of a player without a film it says what waits: how many, their
// names and edges, and a still where the copy has one. A take whose film the copy does carry opens as in the lab.
import { Lock } from "lucide-react";
import { edgeName, takeNames } from "../../lib/names.ts";
import type { QueueItem } from "../../lib/review.ts";
import { TakeCard } from "../takes";
import { Button, EmptyState } from "../ui";
import { waitingInCopy } from "./copy";

export function WaitingInCopy({ items, onOpen, onAll }: { items: readonly QueueItem[]; onOpen: (id: string) => void; onAll: () => void }) {
  const { items: waiting, withFilm } = waitingInCopy(items);
  if (!waiting.length) return <EmptyState title="Inget väntar på Jakobs ord." className="h-full" />;

  const groups: { title: string; items: QueueItem[] }[] = [];
  for (const item of waiting) {
    if (groups[groups.length - 1]?.title !== item.group) groups.push({ title: item.group, items: [] });
    groups[groups.length - 1].items.push(item);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-6 pt-5 [scrollbar-gutter:stable]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">
          {waiting.length} {waiting.length === 1 ? "tagning väntar" : "tagningar väntar"} på Jakobs ord
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 py-1 text-sm text-dim">
          <Lock aria-hidden className="size-3.5 text-brass" />
          {withFilm ? "Bara några av filmerna finns i kopian" : "Filmerna finns inte i kopian"}
        </span>
        <Button variant="quiet" size="sm" onClick={onAll} className="ml-auto">
          Se alla tagningar
        </Button>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-3">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{g.title}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {g.items.map((item) => {
              const name = takeNames(item.edge.takes).get(item.take.id) ?? item.take.id;
              const film = !!item.take.media.video;
              return (
                <li key={item.take.id}>
                  <TakeCard
                    take={item.take}
                    name={name}
                    still="auto"
                    onSelect={film ? () => onOpen(item.take.id) : undefined}
                    extra={edgeName(item.edge)}
                    className="h-full"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
