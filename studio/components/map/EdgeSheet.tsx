"use client";

// The side panel of one step (an edge of the graph) on Karta: the step in Jakob's words ("A2.1 → P4C1"), ‹ › to the step
// before and after it in the node tree, what plays there now and why (on a tree the game does not play: that it does not,
// KartaView's idle), the Primär large, and beside it the secondary films
// (lib/primaries.ts stepFilms): at most three, the rest behind "Visa fler", each with how the game uses it. Rejected,
// waiting and replaced takes are not here: one link says how many there are and leads to Granska. A take the address names
// that is not on this page says so and links there. Every still plays (in place, or over the whole window: FilmViewer, ‹ ›
// through the panel's films). The writes are "Gör primär" (useMakePrimary) and "Arkivera" with "Ta tillbaka" (ArchiveTake.tsx:
// a take he has archived is out of play and folded under "Arkiverade" at the panel's foot), on his click only.
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WHY_LABEL, describeEdge, type Edge, type Graph, type Take } from "../../../src/clip-graph.ts";
import { TakeChip } from "@/components/takes";
import { FilmViewer } from "@/components/takes/FilmViewer";
import { REST_EDGE, restWord } from "./rest.ts";
import { Button, EmptyState, Sheet, buttonClasses, cn } from "@/components/ui";
import { hubLine, type EdgeInfo } from "@/lib/edge-stats";
import { isSnapshot } from "@/lib/mode";
import { edgeName, nodeCode, takeName } from "@/lib/names";
import { SHOWN, type Film, type StepFilms } from "@/lib/primaries";
import { verdictPhrase, verdictOf } from "@/lib/verdict";
import { PrimaryFilm, SecondaryFilm } from "./StepFilm";
import { useMakePrimary } from "./useMakePrimary";
import { ArchivedTakes, useArchive } from "./ArchiveTake";
import { useOlder } from "./useOlder";

/**
 * The steps before and after this one in the node tree, and the next one without a Primär (KartaView). names: a tree's own
 * words for its steps by edge ("A2.3 → A3P4C2"), in place of the bank's edge name (the bank's map gives none).
 */
export type Around = { prev: string | null; next: string | null; unchosen: string | null; names?: Record<string, string> };

// Wide enough for a secondary film's still and three of its buttons on one row; the fourth (Arkivera was added) wraps under them.
export const SHEET_W = 540;

/** Where the round's words for a step come from: "huvudtagning", "passar given före", … */
const whyWords = (why: keyof typeof WHY_LABEL) => WHY_LABEL[why];

export function EdgeSheet({
  graph,
  step,
  info,
  takeId,
  around,
  onClose,
  onPickTake,
  onPickEdge,
  title,
  note,
  idle = null,
}: {
  graph: Graph | null;
  /** The chosen step's films (KartaView: stepFilms), null when none is chosen. */
  step: StepFilms | null;
  /** What plays on it now (KartaView: edgeInfo on the game's graph). */
  info: EdgeInfo | null;
  /** In place of "Spelas nu": why the game plays nothing of this tree (Karta's trees the game does not play). */
  idle?: string | null;
  takeId: string | null;
  /** The steps before and after it in the node tree (lib/primaries.ts treeOrder). */
  around: Around;
  onClose: () => void;
  onPickTake: (id: string | null) => void;
  onPickEdge: (id: string) => void;
  /** The step in a tree's own words ("A2.3 → A3P4C1"), in place of the bank's edge name. */
  title?: string;
  /** A line over the films (Karta's trees: the bank's Primär of the step is another tree's). */
  note?: string | null;
}) {
  const edge = step?.edge ?? null;
  const subtitle = edge ? (edge.experiment ? "Experiment utanför kartan" : describeEdge(edge)) : "";
  return (
    <Sheet open={!!step} onOpenChange={(open) => !open && onClose()} title={edge ? (title ?? edgeName(edge)) : ""} subtitle={subtitle} width={SHEET_W}>
      {step && note ? <p className="mb-3 rounded-md border border-line bg-raised px-3 py-2 text-sm text-dim">{note}</p> : null}
      {step && info && graph ? <SheetBody key={step.edge.id} graph={graph} step={step} info={info} idle={idle} takeId={takeId} around={around} onPickTake={onPickTake} onPickEdge={onPickEdge} /> : null}
    </Sheet>
  );
}

function SheetBody({
  graph,
  step,
  info,
  idle,
  takeId,
  around,
  onPickTake,
  onPickEdge,
}: {
  graph: Graph;
  step: StepFilms;
  info: EdgeInfo;
  idle: string | null;
  takeId: string | null;
  around: Around;
  onPickTake: (id: string | null) => void;
  onPickEdge: (id: string) => void;
}) {
  const { edge, primary, secondaries } = step;
  const { make, saving, lines } = useMakePrimary();
  // Arkivera beside Gör primär, and the step's archived takes folded at its foot with Ta tillbaka (ArchiveTake.tsx).
  const archive = useArchive();
  // Takes built on a picture that no longer holds (Material decides the pictures; here only marked, with the picture a click away).
  const older = useOlder();
  const rest = edge.id === REST_EDGE;
  const name = (t: Take) => (rest ? restWord(t) : undefined);
  const named = takeId ? secondaries.findIndex((f) => f.take.id === takeId) : -1;
  const [more, setMore] = useState(false);
  const open = more || named >= SHOWN;
  const shownSecondaries = open ? secondaries : secondaries.slice(0, SHOWN);
  // What "Jämför" sets a secondary film beside: the Primär, else what plays now.
  const against = primary?.take ?? info.now.take ?? null;
  // The films over the whole window, in the order the panel shows them (FilmViewer).
  const films = [...(primary ? [primary] : []), ...shownSecondaries].map((f) => f.take).filter((t) => t.media.video);
  const [viewing, setViewing] = useState<number | null>(null);
  const view = (t: Take) => {
    const at = films.indexOf(t);
    if (at >= 0) setViewing(at);
  };
  const pick = (t: Take) => onPickTake(t.id === takeId ? null : t.id);
  // A take the address names that is not on this page (rejected, waiting, replaced): said, with the way to Granska.
  const away = takeId && primary?.take.id !== takeId && named < 0 ? (graph.takes[takeId] ?? null) : null;

  // A take named in the address is brought into view.
  useEffect(() => {
    if (!takeId) return;
    const timer = window.setTimeout(() => document.getElementById(`tagning-${takeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 260);
    return () => window.clearTimeout(timer);
  }, [takeId, edge.id]);

  const line = lines[edge.id] ?? null;
  const secondary = (f: Film) => (
    <SecondaryFilm
      key={f.take.id}
      film={f}
      edge={edge}
      name={name(f.take)}
      against={against}
      selected={f.take.id === takeId}
      saving={saving === f.take.id}
      busy={!!saving}
      onMake={() => void make(f.take)}
      onPick={() => pick(f.take)}
      onOpen={() => view(f.take)}
      onArchive={() => archive.ask(f.take, true)}
      marks={older(f.take.id)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <AroundNav around={around} onPickEdge={onPickEdge} />
      {idle ? <p className="text-xs text-dim">{idle}</p> : <NowBlock graph={graph} edge={edge} info={info} onPickEdge={onPickEdge} />}
      {away?.archived ? (
        <p className="-mt-2 text-xs text-dim">
          {takeName(away, graph.edge[away.edge]?.takes)} är arkiverad och spelas inte.{isSnapshot ? "" : " Den ligger under Arkiverade längst ned, där den går att ta tillbaka."}
        </p>
      ) : away ? (
        <p className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
          <span>
            {takeName(away, graph.edge[away.edge]?.takes)} är {verdictPhrase(verdictOf(away))} och visas inte här.
          </span>
          <Link href={{ pathname: "/granska/", query: { tagning: away.id } }} className="inline-flex items-center gap-0.5 text-brass-hi hover:underline">
            Öppna i Granska
            <ArrowUpRight className="size-3" />
          </Link>
        </p>
      ) : null}

      {edge.takes.length ? (
        <section className="flex flex-col gap-2.5" aria-label="Primär">
          <GroupTitle title="Primär" />
          {primary ? (
            <PrimaryFilm film={primary} edge={edge} name={name(primary.take)} selected={primary.take.id === takeId} onPick={() => pick(primary.take)} onExpand={primary.take.media.video ? () => view(primary.take) : undefined} onArchive={() => archive.ask(primary.take, true)} marks={older(primary.take.id)} />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3.5 py-3 text-sm text-dim">
              Ingen Primär vald.
              {secondaries.length && !isSnapshot ? <span className="text-faint">Välj bland de sekundära.</span> : null}
            </div>
          )}
        </section>
      ) : null}

      {secondaries.length ? (
        <section className="flex flex-col gap-2.5" aria-label="Sekundära">
          <GroupTitle title="Sekundära" count={secondaries.length} />
          {isSnapshot ? (
            <span className="inline-flex items-start gap-1.5 text-xs text-dim">
              <Lock aria-hidden className="mt-px size-3.5 shrink-0 text-brass" />
              Primär väljs bara i Jakobs labb.
            </span>
          ) : null}
          {shownSecondaries.map(secondary)}
          {secondaries.length > SHOWN ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setMore(!open)}
              className="flex items-center gap-1.5 self-start rounded-md py-1 text-xs font-medium text-faint hover:text-ink"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "")} />
              {open ? "Visa färre" : `Visa fler · ${secondaries.length - SHOWN}`}
            </button>
          ) : null}
          {line ? (
            <p role="alert" className={cn("text-xs", line.tone === "bad" ? "text-[#ef8b8b]" : "text-[#6cc595]")}>
              {line.text}
            </p>
          ) : null}
        </section>
      ) : null}

      <ArchivedTakes key={away?.archived ? away.id : "arkiverade"} edge={edge} open={!!away?.archived} onRestore={(t) => archive.ask(t, false)} />
      {archive.dialog}
      {step.elsewhere ? (
        <Link
          href={{ pathname: "/granska/", query: { vy: "alla" } }}
          title="Underkända, ogranskade och ersatta tagningar av steget"
          className="inline-flex items-center gap-1 self-start text-xs text-faint hover:text-ink"
        >
          {step.elsewhere} {step.elsewhere === 1 ? "tagning till" : "tagningar till"} i Granska
          <ArrowUpRight className="size-3" />
        </Link>
      ) : null}
      {edge.takes.length === 0 ? (
        <EmptyState compact title="Ingen tagning ännu">
          {edge.shares ? "Kortet delar platsens film och behöver ingen egen." : "Det finns ingen tagning av det här steget. Den beställs i Beställ."}
        </EmptyState>
      ) : null}
      <FilmViewer takes={films} index={viewing} onIndex={setViewing} />
    </div>
  );
}

function GroupTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-faint">
      {title} {count !== undefined ? <span className="tabular-nums text-dim">· {count}</span> : null}
    </h3>
  );
}

/** ‹ the step before · the next without a Primär · the step after ›, in the order the node tree is followed. */
function AroundNav({ around, onPickEdge }: { around: Around; onPickEdge: (id: string) => void }) {
  if (!around.prev && !around.next && !around.unchosen) return null;
  const go = (id: string | null, dir: "prev" | "next") =>
    id ? (
      <button type="button" onClick={() => onPickEdge(id)} className={cn(buttonClasses({ variant: "quiet", size: "sm" }), "tabular-nums", dir === "next" && "ml-auto")} title={dir === "prev" ? "Steget före i trädet" : "Nästa steg i trädet"}>
        {dir === "prev" ? <ChevronLeft /> : null}
        {around.names?.[id] ?? edgeName(id)}
        {dir === "next" ? <ChevronRight /> : null}
      </button>
    ) : null;
  return (
    <nav aria-label="Steg i trädet" className="-mt-2 flex items-center gap-2">
      {go(around.prev, "prev")}
      {around.unchosen ? (
        <button type="button" onClick={() => onPickEdge(around.unchosen!)} className={cn(buttonClasses({ variant: "quiet", size: "sm" }), "mx-auto text-brass-hi")} title="Nästa steg i trädet utan Primär">
          Nästa utan Primär
        </button>
      ) : null}
      {go(around.next, "next")}
    </nav>
  );
}

function NowBlock({ graph, edge, info, onPickEdge }: { graph: Graph; edge: Edge; info: EdgeInfo; onPickEdge: (id: string) => void }) {
  const now = info.now;
  const shared = now.film && now.film.id !== edge.id ? now.film : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-raised/60 px-3.5 py-3">
      <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Spelas nu</span>
      {now.take ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <TakeChip take={now.take} size="sm" />
          <span className="truncate text-sm font-semibold text-ink" title={now.take.id}>
            {takeName(now.take, graph.edge[now.take.edge]?.takes)}
          </span>
          <span className="text-xs text-dim">· {whyWords(now.why)}</span>
        </div>
      ) : (
        <span className="text-sm font-medium text-[#ef8b8b]">Inget spelas här · {info.tag.kind === "gap" ? info.tag.word : "saknas"}</span>
      )}
      {now.hub ? <span className="text-xs text-dim">{hubLine(now.hub)}.</span> : null}
      {shared ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
          En film per plats: {nodeCode(edge.target ?? "")} spelar {edgeName(shared)}.
          <Button size="sm" variant="quiet" onClick={() => onPickEdge(shared.id)} className="h-6 px-2">
            Visa platsens film
          </Button>
        </div>
      ) : null}
      {now.notes.length ? (
        <ul className="flex flex-col gap-1 text-xs text-[#f0b07a]">
          {now.notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <span aria-hidden>!</span>
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
