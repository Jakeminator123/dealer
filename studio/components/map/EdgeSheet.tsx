"use client";

// The side panel of one film (edge) on the node map: the edge in Jakob's words ("A2.1 → P4C1"), what plays there now and
// why, and every take grouped Primär · Godkända · Varianter · Väntar · Underkända (folded), each with its still, its
// decision bar and two links: "Spela i scenen" and "Jämför mot primär". Only DecisionBar writes, and only on his click.
import { ChevronDown, Columns2, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WHY_LABEL, describeEdge, type Edge, type Graph, type Take } from "../../../src/clip-graph.ts";
import { DecisionBar, TakeCard, TakeChip } from "@/components/takes";
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
  const [showRejected, setShowRejected] = useState(false);
  const rejectedOpen = showRejected || groups.underkanda.some((t) => t.id === takeId);
  const base = primaryOf(edge) ?? edge.main;

  // A take named in the address is brought into view.
  useEffect(() => {
    if (!takeId) return;
    const timer = window.setTimeout(() => document.getElementById(`tagning-${takeId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 260);
    return () => window.clearTimeout(timer);
  }, [takeId, edge.id]);

  const card = (t: Take) => (
    <TakeBlock key={t.id} take={t} edge={edge} graph={graph} plays={t === playsHere} why={t === playsHere ? whyWords(now.why) : null} base={base} selected={t.id === takeId} onPick={() => onPickTake(t.id === takeId ? null : t.id)} />
  );

  return (
    <div className="flex flex-col gap-5">
      <NowBlock graph={graph} edge={edge} info={info} onPickEdge={onPickEdge} />
      {edge.takes.length === 0 ? (
        <EmptyState compact title="Ingen tagning ännu">
          {edge.shares ? "Kortet delar platsens film och behöver ingen egen." : "Det finns ingen film för den här kanten. Ett jobbutkast finns i gamla labbet."}
        </EmptyState>
      ) : null}
      {GROUPS.map(({ key, title }) =>
        groups[key].length ? (
          <section key={key} className="flex flex-col gap-2.5">
            <GroupTitle title={title} count={groups[key].length} />
            {groups[key].map(card)}
          </section>
        ) : null,
      )}
      {groups.underkanda.length ? (
        <section className="flex flex-col gap-2.5">
          <button
            type="button"
            aria-expanded={rejectedOpen}
            onClick={() => setShowRejected(!rejectedOpen)}
            className="flex items-center gap-2 rounded-md py-1 text-left text-xs font-semibold uppercase tracking-[0.08em] text-faint hover:text-ink"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", rejectedOpen ? "" : "-rotate-90")} />
            Underkända · {groups.underkanda.length}
          </button>
          {rejectedOpen ? groups.underkanda.map(card) : null}
        </section>
      ) : null}
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

function TakeBlock({ take, edge, graph, plays, why, base, selected, onPick }: { take: Take; edge: Edge; graph: Graph; plays: boolean; why: string | null; base: Take | null; selected: boolean; onPick: () => void }) {
  const extra: ReactNode[] = [];
  if (plays) extra.push(<span key="p" className="font-medium text-ink">Spelas nu · {why}</span>);
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
        still="film"
        selected={selected}
        onSelect={onPick}
        extra={extra.length ? <span className="flex flex-wrap gap-x-1.5">{extra.map((x, i) => (i ? [<span key={`d${i}`} aria-hidden>·</span>, x] : x))}</span> : undefined}
        actions={
          <div className="flex w-full flex-col gap-2.5 py-1">
            <DecisionBar take={take} compact />
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
