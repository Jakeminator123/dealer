"use client";

// <ChoiceList graph={graph} />: Jämför without an edge: the edges where there is a choice to make (more than one playable
// film), most useful first (lib/review.ts choiceEdges). Each card shows its films side by side and opens the comparison.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { describeEdge, type Graph } from "../../../src/clip-graph.ts";
import { edgeName, takeNames } from "../../lib/names.ts";
import { choiceEdges } from "../../lib/review.ts";
import { TakeThumb, VerdictChip } from "../takes";
import { EmptyState, cn } from "../ui";

export const compareHref = (edge: string, a?: string | null, b?: string | null): string => {
  const p = new URLSearchParams({ kant: edge });
  if (a) p.set("a", a);
  if (b) p.set("b", b);
  return `/jamfor/?${p.toString()}`;
};

export function ChoiceList({ graph }: { graph: Graph }) {
  const choices = choiceEdges(graph);
  if (!choices.length)
    return (
      <EmptyState title="Inget att jämföra">
        Ingen film har mer än en spelbar tagning just nu.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-dim">Välj en film. Du ser en kandidat bredvid den som spelas nu, och kan göra den bästa till Primär.</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
        {choices.map(({ edge, takes, primar, waiting, required }) => {
          const names = takeNames(edge.takes);
          const shown = takes.slice(0, 3);
          return (
            <li key={edge.id}>
              <Link
                href={compareHref(edge.id)}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-inset transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-[#151c18] focus-visible:outline-offset-2"
              >
                <div className={cn("grid aspect-[5/2] gap-px bg-line", shown.length === 1 ? "grid-cols-1" : shown.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                  {shown.map((t) => (
                    <TakeThumb key={t.id} take={t} still="film" scrub={false} className="aspect-auto h-full rounded-none" />
                  ))}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 px-4 pb-3.5 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-md font-semibold text-ink">{edgeName(edge)}</span>
                    {waiting ? <span className="text-xs text-vantar">○ {waiting} väntar</span> : null}
                    <ArrowRight className="ml-auto size-4 text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brass" />
                  </div>
                  <span className="truncate text-xs text-faint">{edge.experiment ? "Experiment utanför modellen" : describeEdge(edge)}</span>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1.5 text-xs text-dim">
                    <span>{takes.length} tagningar</span>
                    <span aria-hidden className="text-faint">·</span>
                    {primar ? (
                      <span className="inline-flex items-center gap-1.5">
                        <VerdictChip verdict="primar" size="sm" /> {names.get(primar.id)}
                      </span>
                    ) : (
                      <span className="text-faint">ingen Primär{required ? "" : " · spelas inte i rundan"}</span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
