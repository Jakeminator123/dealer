"use client";

// The experiments, folded away below the map: films whose start or end is outside the 54 (READY-B > DRAWN > P4.C1, …),
// read as chains from one rest pose to the next (experimentChains), and every experiment film on its own. A chip opens
// the film's panel like on the map.
import { ChevronDown, FlaskConical } from "lucide-react";
import { experimentChains, parseEdge, type Graph } from "../../../src/clip-graph.ts";
import { Button, IconButton, cn } from "@/components/ui";
import { edgeInfo } from "@/lib/edge-stats";
import { edgeName, nodeCode } from "@/lib/names";
import { EdgeChip } from "./EdgeChip";

/** The edge a chain step is a film of: an experiment edge as written, or the model edge a READY-B take belongs to. */
const edgeOfStep = (graph: Graph, from: string, to: string) => {
  const id = `${from}>${to}`;
  return graph.edge[id] ? id : (parseEdge(id)?.base ?? null);
};

export function ExperimentTray({ graph, open, onOpenChange, onPick, active }: { graph: Graph; open: boolean; onOpenChange: (open: boolean) => void; onPick: (id: string) => void; active: string | null }) {
  const chains = experimentChains(graph);
  const count = graph.experiments.length;
  if (!count && !chains.length) return null;
  const chip = (id: string | null, key: string) => {
    const info = id ? edgeInfo(graph, id) : null;
    if (!info || !id) return null;
    return <EdgeChip key={key} tag={info.tag} counts={info.counts} active={active === id} title={info.title} aria-label={info.title} onClick={() => onPick(id)} />;
  };
  if (!open)
    return (
      <Button variant="secondary" size="sm" icon={<FlaskConical />} iconAfter={<ChevronDown className="rotate-180" />} onClick={() => onOpenChange(true)} className="absolute bottom-3 right-3 z-10 shadow-pop">
        Experiment · {count}
      </Button>
    );
  return (
    <section aria-label="Experiment" className="absolute inset-x-3 bottom-3 z-10 flex max-h-[44%] flex-col rounded-lg border border-line-strong bg-surface/97 shadow-pop backdrop-blur-sm">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2">
        <FlaskConical className="size-4 text-dim" />
        <h2 className="text-sm font-semibold text-ink">Experiment</h2>
        <span className="text-xs text-faint">utanför de 54 · {count} filmer · {chains.length} kedjor</span>
        <IconButton label="Fäll ihop" icon={<ChevronDown />} size="sm" onClick={() => onOpenChange(false)} className="ml-auto" />
      </header>
      <div className="grid min-h-0 grid-cols-1 gap-x-8 gap-y-4 overflow-y-auto px-4 py-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Kedjor</h3>
          {chains.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="min-w-0 text-xs font-medium text-ink">{c.nodes.map(nodeCode).join(" → ")}</span>
              <span className="flex items-center gap-1">{c.steps.map((s, k) => chip(edgeOfStep(graph, s.from, s.to), `${i}-${k}`))}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Alla experimentfilmer</h3>
          <div className="flex flex-col gap-1.5">
            {graph.experiments.map((e) => (
              <div key={e.id} className={cn("flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5", active === e.id && "bg-raised")}>
                <span className="truncate text-xs text-dim">{edgeName(e)}</span>
                {chip(e.id, e.id)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
