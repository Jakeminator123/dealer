"use client";

// <AllTakes graph={graph} onOpen={(id) => …} />: every take, for looking something up: filters by verdict (several at
// once), "Dömda åt dig" (the takes the main agent and a reviewer judged for him, which are not in his queue) and seat,
// then the takes in dealing order under the old lab's headings. A card opens the take large for a
// decision; its ⤢ button opens the film over the whole window (FilmViewer, ‹ › through the list as filtered).
import { useMemo, useState } from "react";
import type { Graph } from "../../../src/clip-graph.ts";
import { edgeName, takeNames } from "../../lib/names.ts";
import { filterTakes, inReviewOrder, reviewGroup, seatOptions, verdictCounts } from "../../lib/review.ts";
import { JUDGED_FOR_YOU, VERDICTS, judgedForJakob, type Verdict } from "../../lib/verdict.ts";
import { TakeCard, VerdictChip } from "../takes";
import { FilmViewer } from "../takes/FilmViewer";
import { Button, EmptyState, SegmentedControl, cn } from "../ui";

export function AllTakes({ graph, onOpen }: { graph: Graph; onOpen: (id: string) => void }) {
  const [verdicts, setVerdicts] = useState<ReadonlySet<Verdict>>(new Set());
  const [seat, setSeat] = useState<string>("alla");
  const [forYou, setForYou] = useState(false);
  const all = useMemo(() => inReviewOrder(Object.values(graph.takes), graph), [graph]);
  const seats = useMemo(() => seatOptions(graph), [graph]);
  const inSeat = useMemo(() => filterTakes(all, graph, { verdicts: new Set(), seat: seat === "alla" ? null : seat }), [all, graph, seat]);
  const counts = useMemo(() => verdictCounts(inSeat), [inSeat]);
  const forYouCount = useMemo(() => judgedForJakob(inSeat).length, [inSeat]);
  const shown = useMemo(() => filterTakes(inSeat, graph, { verdicts, seat: null, forYou }), [inSeat, graph, verdicts, forYou]);
  // The films over the whole window, in the order the list shows them (FilmViewer: ‹ › through them).
  const withFilm = useMemo(() => shown.filter((t) => t.media.video), [shown]);
  const [viewing, setViewing] = useState<number | null>(null);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of [...graph.edges, ...graph.experiments]) for (const [id, n] of takeNames(e.takes)) map.set(id, n);
    return map;
  }, [graph]);

  const toggle = (v: Verdict) =>
    setVerdicts((now) => {
      const next = new Set(now);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  let last = "";
  const groups: { title: string; ids: string[] }[] = [];
  for (const t of shown) {
    const g = reviewGroup(graph.edge[t.edge]);
    if (g !== last) groups.push({ title: g, ids: [] });
    last = g;
    groups[groups.length - 1].ids.push(t.id);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="group" aria-label="Omdöme" className="flex flex-wrap items-center gap-1.5">
          {VERDICTS.map((v) => {
            const on = verdicts.has(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(v)}
                disabled={!counts[v] && !on}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md border px-2 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
                  on ? "border-brass/60 bg-brass/10" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <VerdictChip verdict={v} size="sm" />
                <span className="text-xs text-dim tabular-nums">{counts[v]}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={forYou}
            onClick={() => setForYou((on) => !on)}
            disabled={!forYouCount && !forYou}
            title="Dömda av huvudagenten och en granskare när du lämnade över domen. De väntar inte på dig; ditt eget beslut ersätter dem."
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border px-2 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
              forYou ? "border-brass/60 bg-brass/10" : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span className="inline-flex h-5 items-center rounded-full border border-dashed border-line-strong px-1.5 text-2xs font-medium text-dim">{JUDGED_FOR_YOU}</span>
            <span className="text-xs text-dim tabular-nums">{forYouCount}</span>
          </button>
          {verdicts.size || forYou ? (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setVerdicts(new Set());
                setForYou(false);
              }}
            >
              Alla omdömen
            </Button>
          ) : null}
        </div>
        <SegmentedControl
          label="Plats"
          size="sm"
          value={seat}
          onChange={setSeat}
          options={[{ value: "alla", label: "Alla platser" }, ...seats.map((s) => ({ value: s, label: s === "D" ? "Dealern" : s === "övrigt" ? "Utan kort" : s }))]}
        />
        <span className="ml-auto text-sm text-faint tabular-nums">
          {shown.length} av {all.length} tagningar
        </span>
      </div>

      {shown.length ? (
        groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-3">
            <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{g.title}</h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
              {g.ids.map((id) => {
                const t = graph.takes[id];
                return (
                  <li key={id}>
                    <TakeCard
                      take={t}
                      name={names.get(id)}
                      still="film"
                      onSelect={() => onOpen(id)}
                      onExpand={t.media.video ? () => setViewing(withFilm.indexOf(t)) : undefined}
                      extra={edgeName(graph.edge[t.edge])}
                      className="h-full"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState compact title="Inga tagningar med det urvalet" action={<Button size="sm" onClick={() => { setVerdicts(new Set()); setForYou(false); setSeat("alla"); }}>Visa alla</Button>} />
      )}
      <FilmViewer takes={withFilm} index={viewing} onIndex={setViewing} />
    </div>
  );
}
