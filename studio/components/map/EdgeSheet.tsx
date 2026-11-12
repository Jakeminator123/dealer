"use client";

// The side panel of one step (an edge of the graph) on the node map: the step in Jakob's words ("A2.1 → P4C1"), what plays
// there now and why, one line on what each decision does, and every take grouped Primär · Godkända · Varianter · Väntar ·
// Underkända (folded); the rest step (A1 → A1) instead as Lugna (grunden) · Gester (slumpas in) with each film's own word
// (rest.ts). Each take: its still with a play button (the film plays in place) and a button that opens it over the whole
// window (FilmViewer, ‹ › through the step's films), its decision bar, "Ursprung", and two links: "Spela i scenen" and
// "Jämför mot primär". Only DecisionBar writes, and only on his click.
import { ChevronDown, Columns2, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WHY_LABEL, describeEdge, type Edge, type Graph, type Take } from "../../../src/clip-graph.ts";
import { DecisionBar, TakeCard, TakeChip } from "@/components/takes";
import { DecisionHelp } from "@/components/takes/DecisionBar";
import { FilmViewer } from "@/components/takes/FilmViewer";
import { Origin } from "@/components/takes/Origin";
import { REST_EDGE, restGroups, restWord } from "./rest.ts";
import { Button, EmptyState, Sheet, buttonClasses, cn } from "@/components/ui";
import { edgeInfo, groupTakes, primaryOf, type TakeGroups } from "@/lib/edge-stats";
import { edgeName, nodeCode, takeName } from "@/lib/names";

// Wide enough for DecisionBar's four buttons on one row.
export const SHEET_W = 540;

const GROUPS: { key: keyof TakeGroups; title: string }[] = [
  { key: "primar", title: "Primär" },
  { key: "godkanda", title: "Godkända" },
  { key: "varianter", title: "Varianter" },
  { key: "vantar", title: "Väntar" },
];

/** Where the round's words for a step come from: "huvudtagning", "passar given före", … */
const whyWords = (why: keyof typeof WHY_LABEL) => WHY_LABEL[why];

export function EdgeSheet({
  graph,
  edgeId,
  takeId,
  onClose,
  onPickTake,
  onPickEdge,
}: {
  graph: Graph | null;
  edgeId: string | null;
  takeId: string | null;
  onClose: () => void;
  onPickTake: (id: string | null) => void;
  onPickEdge: (id: string) => void;
}) {
  const info = graph && edgeId ? edgeInfo(graph, edgeId) : null;
  const edge = info?.edge ?? null;
  const subtitle = edge
    ? `${edge.experiment ? "Experiment utanför kartan" : describeEdge(edge)} · ${edge.takes.length} ${edge.takes.length === 1 ? "tagning" : "tagningar"}`
    : "";
  return (
    <Sheet open={!!info} onOpenChange={(open) => !open && onClose()} title={edge ? edgeName(edge) : ""} subtitle={subtitle} width={SHEET_W}>
      {info && graph ? <SheetBody graph={graph} edge={info.edge} info={info} takeId={takeId} onPickTake={onPickTake} onPickEdge={onPickEdge} /> : null}
    </Sheet>
  );
}

function SheetBody({
  graph,
  edge,
  info,
  takeId,
  onPickTake,
  onPickEdge,
}: {
  graph: Graph;
  edge: Edge;
  info: NonNullable<ReturnType<typeof edgeInfo>>;
  takeId: string | null;
  onPickTake: (id: string | null) => void;
  onPickEdge: (id: string) => void;
}) {
  const now = info.now;
  const playsHere = now.take && now.take.edge === edge.id ? now.take : null;
  const groups = useMemo(() => groupTakes(edge, playsHere), [edge, playsHere]);
  // The rest step (A1 → A1): the calm films are the base, the gestures are picked at random between them (rest.ts).
  const rest = edge.id === REST_EDGE ? restGroups(edge) : null;
  const sections: { key: string; title: string; takes: Take[] }[] = rest
    ? [
        { key: "lugna", title: "Lugna (grunden)", takes: rest.lugna },
        { key: "gester", title: "Gester (slumpas in)", takes: rest.gester },
      ]
    : GROUPS.map(({ key, title }) => ({ key, title, takes: groups[key] }));
  const rejected = rest ? rest.underkanda : groups.underkanda;
  const [showRejected, setShowRejected] = useState(false);
  const rejectedOpen = showRejected || rejected.some((t) => t.id === takeId);
  const base = primaryOf(edge) ?? edge.main;
  // The films over the whole window, in the order the panel shows them (FilmViewer).
  const shown = [...sections.flatMap((s) => s.takes), ...(rejectedOpen ? rejected : [])].filter((t) => t.media.video);
  const [viewing, setViewing] = useState<number | null>(null);

  // A take named in the address is brought into view.
  useEffect(() => {
    if (!takeId) return;
    const timer = window.setTimeout(() => document.getElementById(`tagning-${takeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 260);
    return () => window.clearTimeout(timer);
  }, [takeId, edge.id]);

  const card = (t: Take) => (
    <TakeBlock
      key={t.id}
      take={t}
      edge={edge}
      graph={graph}
      name={rest ? restWord(t) : undefined}
      plays={t === playsHere}
      why={t === playsHere ? whyWords(now.why) : null}
      base={base}
      selected={t.id === takeId}
      onPick={() => onPickTake(t.id === takeId ? null : t.id)}
      onExpand={t.media.video ? () => setViewing(shown.indexOf(t)) : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <NowBlock graph={graph} edge={edge} info={info} onPickEdge={onPickEdge} />
      {edge.takes.length ? <DecisionHelp edge={edge.id} className="-mt-2 px-0.5" /> : null}
      {edge.takes.length === 0 ? (
        <EmptyState compact title="Ingen tagning ännu">
          {edge.shares ? "Kortet delar platsens film och behöver ingen egen." : "Det finns ingen tagning av det här steget. Ett jobbutkast finns i gamla labbet."}
        </EmptyState>
      ) : null}
      {sections.map(({ key, title, takes }) =>
        takes.length ? (
          <section key={key} className="flex flex-col gap-2.5">
            <GroupTitle title={title} count={takes.length} />
            {takes.map(card)}
          </section>
        ) : null,
      )}
      {rejected.length ? (
        <section className="flex flex-col gap-2.5">
          <button
            type="button"
            aria-expanded={rejectedOpen}
            onClick={() => setShowRejected(!rejectedOpen)}
            className="flex items-center gap-2 rounded-md py-1 text-left text-xs font-semibold uppercase tracking-[0.08em] text-faint hover:text-ink"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", rejectedOpen ? "" : "-rotate-90")} />
            Underkända · {rejected.length}
          </button>
          {rejectedOpen ? rejected.map(card) : null}
        </section>
      ) : null}
      <FilmViewer takes={shown} index={viewing} onIndex={setViewing} />
    </div>
  );
}

function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-faint">
      {title} <span className="tabular-nums text-dim">· {count}</span>
    </h3>
  );
}

function NowBlock({ graph, edge, info, onPickEdge }: { graph: Graph; edge: Edge; info: NonNullable<ReturnType<typeof edgeInfo>>; onPickEdge: (id: string) => void }) {
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

function TakeBlock({
  take,
  edge,
  graph,
  name,
  plays,
  why,
  base,
  selected,
  onPick,
  onExpand,
}: {
  take: Take;
  edge: Edge;
  graph: Graph;
  /** The rest's own word for the film ("Andning"); else the take's short name. */
  name?: string;
  plays: boolean;
  why: string | null;
  base: Take | null;
  selected: boolean;
  onPick: () => void;
  onExpand?: () => void;
}) {
  const extra: ReactNode[] = [];
  if (plays) extra.push(<span key="p" className="font-medium text-ink">Spelas nu · {why}</span>);
  if (take.idle?.onRequest) extra.push(<span key="r">bara när den väljs</span>);
  if (take.hub) extra.push(<span key="h">startar från {nodeCode(take.hub)}</span>);
  if (take.editOf) extra.push(<span key="e">rättad kopia av {takeName(graph.takes[take.editOf] ?? { id: take.editOf, edge: edge.id, kind: edge.kind }, edge.takes)}</span>);
  if (take.segment) extra.push(<span key="s">utsnitt, rutor {take.segment.start}–{take.segment.end}</span>);
  if (take.speed !== 1) extra.push(<span key="v">spelas i {String(take.speed).replace(".", ",")}× fart</span>);
  const compare = base && base.id !== take.id ? base : null;
  const isPrimary = !!compare?.explicitMain;
  return (
    <div id={`tagning-${take.id}`} className="scroll-mt-4">
      <TakeCard
        take={take}
        name={name}
        still="film"
        selected={selected}
        onSelect={onPick}
        play
        onExpand={onExpand}
        extra={extra.length ? <span className="flex flex-wrap gap-x-1.5">{extra.map((x, i) => (i ? [<span key={`d${i}`} aria-hidden>·</span>, x] : x))}</span> : undefined}
        actions={
          <div className="flex w-full flex-col gap-2.5 py-1">
            <DecisionBar take={take} compact help={false} />
            <Origin take={take} graph={graph} />
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={{ pathname: "/", query: { kant: edge.id, tagning: take.id } }} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Play />
                Spela i scenen
              </Link>
              {compare ? (
                <Link href={{ pathname: "/jamfor/", query: { kant: edge.id, a: take.id, b: compare.id } }} className={buttonClasses({ variant: "quiet", size: "sm" })}>
                  <Columns2 />
                  {isPrimary ? "Jämför mot primär" : "Jämför mot huvudtagning"}
                </Link>
              ) : null}
            </div>
          </div>
        }
      />
    </div>
  );
}
