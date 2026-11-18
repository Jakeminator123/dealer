"use client";

// Karta: the node tree of the clip bank, and for every step its Primär and its secondary films. Anchors and seats laid out
// like the table, steps as lines with what the game plays on them and how many secondary films they have; a side panel per
// step with the Primär, the secondary films and how the game uses each (lib/primaries.ts), "Gör primär" on his click, and
// ‹ › to follow the tree. What the game plays is read from the bank as the game reads it (judgedBank). What is chosen lives
// in the address (?kant=…&tagning=…&plats=…&filmer=kort), so a link can open the map on a step or a take; /primara/ leads here.
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { ChevronRight, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TARGETS, buildGraph, type FilmMode } from "../../../src/clip-graph.ts";
import { hubDeals, judgedBank } from "../../../src/game-director.ts";
import { toPixels, type PlacementPlan } from "../../../src/placement-model.ts";
import { BankStatus, Page } from "@/components/shell";
import { Button, ErrorState, IconButton, Skeleton, Switch } from "@/components/ui";
import { getPlacements } from "@/lib/api";
import { useBank } from "@/lib/bank";
import { bankSummary, edgeInfo, isSecondary, primaryOf, type EdgeInfo, type Summary } from "@/lib/edge-stats";
import { mapLayout, type PlanPoints } from "@/lib/map-layout";
import { stepFilms, treeOrder } from "@/lib/primaries";
import { primarCount } from "@/lib/verdict";
import { EdgeSheet } from "./EdgeSheet";
import { ExperimentTray } from "./ExperimentTray";
import { Legend } from "./Legend";
import { MapCanvas, useFitMap } from "./MapCanvas";
import { REST_EDGE } from "./rest.ts";

/** Changes the address's question without a new page: the map keeps its zoom, and a copied link opens the same view. */
function useParams() {
  const params = useSearchParams();
  const set = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    const q = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, []);
  return { params, set };
}

/** Each card's centre in the plan, in film pixels (the plan's own view). */
function usePlanPoints(): PlanPoints {
  const [points, setPoints] = useState<PlanPoints>(null);
  useEffect(() => {
    let gone = false;
    getPlacements()
      .then((answer) => {
        const plan = ((answer as { plan?: PlacementPlan }).plan ?? answer) as PlacementPlan;
        if (gone || !plan?.targets) return;
        const out = Object.fromEntries(TARGETS.flatMap((id) => (plan.targets[id]?.geometry?.native ? [[id, toPixels(plan.targets[id].geometry.native, "native")]] : [])));
        setPoints(Object.keys(out).length === TARGETS.length ? out : null);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  return points;
}

function Stat({ sign, tone, children, title }: { sign?: string; tone: string; children: React.ReactNode; title: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
      {sign ? <span aria-hidden className={tone}>{sign}</span> : null}
      {children}
    </span>
  );
}

/** The header: steps with a Primär of the steps a round needs (the menu's count), and the steps the game has no film for. */
function SummaryLine({ primar, s }: { primar: { set: number; total: number }; s: Summary }) {
  return (
    <span className="flex items-center gap-3 text-sm text-dim">
      <Stat sign="★" tone="text-brass" title="Steg där du har valt en Primär, av stegen en runda behöver">
        <span className="font-medium text-ink tabular-nums">
          Primär {primar.set}/{primar.total}
        </span>
      </Stat>
      {s.missing ? (
        <Stat tone="" title="Steg där spelet inte har någon film att spela">
          <span className="rounded-full border border-dashed border-underkand/70 px-1.5 text-xs leading-[18px] text-[#ef8b8b]">{s.missing} saknas</span>
        </Stat>
      ) : null}
    </span>
  );
}

export function KartaView() {
  return (
    <ReactFlowProvider>
      <Karta />
    </ReactFlowProvider>
  );
}

function Karta() {
  const { bank, graph: seatGraph, status, error, reload, dealer } = useBank();
  const { params, set } = useParams();
  const mode: FilmMode = params.get("filmer") === "kort" ? "CARD" : "SEAT";
  const edgeId = params.get("kant");
  const takeId = params.get("tagning");
  const focus = params.get("plats");
  const [hover, setHover] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  const points = usePlanPoints();

  // One film per card is the chosen dealer's too (seatGraph is null until the dealer is known).
  const graph = useMemo(() => (mode === "SEAT" ? seatGraph : bank && seatGraph ? buildGraph(bank, { mode: "CARD", dealer }) : null), [mode, seatGraph, bank, dealer]);
  const layout = useMemo(() => mapLayout({ mode, points }), [mode, points]);
  // The game's own graphs (the bank as the game reads it: judged takes only): one film per seat for how each film is used,
  // and in the map's mode for what plays on a line.
  const judged = useMemo(() => (bank ? judgedBank(bank) : null), [bank]);
  const game = useMemo(() => (judged ? buildGraph(judged, { dealer }) : null), [judged, dealer]);
  const played = useMemo(() => (mode === "SEAT" ? game : judged ? buildGraph(judged, { mode: "CARD", dealer }) : null), [mode, game, judged, dealer]);
  // A seat the round deals from another pose at the shoe (anchor 2.2) counts as played, by the game's own rule.
  const hubs = useMemo(() => (bank ? hubDeals(bank, dealer) : {}), [bank, dealer]);
  // What every line, the rest and each experiment says: what the game plays there, and its secondary films as the count.
  const infos = useMemo(() => {
    const out = new Map<string, EdgeInfo>();
    if (!graph || !played) return out;
    for (const id of [...layout.edges.map((e) => e.id), REST_EDGE, ...graph.experiments.map((e) => e.id)]) {
      const info = edgeInfo(played.edge[id] ? played : graph, id, hubs, true);
      if (info) out.set(id, info);
    }
    return out;
  }, [graph, played, layout, hubs]);
  const summary = useMemo(() => (played ? bankSummary(played, hubs) : null), [played, hubs]);
  const primar = useMemo(() => (seatGraph ? primarCount(seatGraph) : null), [seatGraph]);
  const order = useMemo(() => (graph ? treeOrder(graph) : []), [graph]);

  const edge = graph && edgeId ? (graph.edge[edgeId] ?? null) : null;
  const step = useMemo(() => (bank && graph && game && edgeId ? stepFilms(bank, graph, game, edgeId, hubs) : null), [bank, graph, game, edgeId, hubs]);
  const info = edgeId ? (infos.get(edgeId) ?? (graph && played ? edgeInfo(played.edge[edgeId] ? played : graph, edgeId, hubs, true) : null)) : null;
  const at = edgeId ? order.indexOf(edgeId) : -1;
  // The steps still without a Primär that have a film of his to choose from, in the tree's order: "Nästa utan Primär" walks them.
  // A step whose Primär he has archived is one of them (primaryOf).
  const open = useMemo(() => (graph && game ? order.filter((id) => !primaryOf(graph.edge[id]) && graph.edge[id].takes.some((t) => isSecondary(t, game))) : []), [order, graph, game]);
  const unchosen = open.find((id) => order.indexOf(id) > at) ?? open[0] ?? null;
  const around = { prev: at > 0 ? order[at - 1] : null, next: at >= 0 && at < order.length - 1 ? order[at + 1] : null, unchosen: unchosen !== edgeId ? unchosen : null };
  const sheetOpen = !!step;
  // On the map, a seat's second card is drawn as the film it plays.
  const active = edge ? (edge.shares ?? edge.id) : null;
  // An experiment's panel keeps the tray it was chosen from open.
  const trayOpen = tray || !!edge?.experiment;

  const pick = useCallback((id: string) => set({ kant: id, tagning: null }), [set]);
  const focusOn = useCallback(
    (node: string | null) => {
      set({ plats: node });
      if (node === "READY-B") setTray(true);
    },
    [set],
  );
  const fit = useFitMap(layout, false);
  const { zoomIn, zoomOut } = useReactFlow();

  const actions = (
    <>
      {around.unchosen ? (
        <Button variant="secondary" size="sm" iconAfter={<ChevronRight />} onClick={() => pick(around.unchosen!)} className="mr-2" title="Öppna nästa steg i trädet som inte har någon Primär">
          Nästa utan Primär
        </Button>
      ) : null}
      <Switch
        size="sm"
        checked={mode === "CARD"}
        onChange={(on) => set({ filmer: on ? "kort" : null, kant: null, tagning: null })}
        label="En film per kort"
        className="mr-2 items-center"
      />
      <IconButton label="Zooma ut" icon={<ZoomOut />} onClick={() => void zoomOut({ duration: 160 })} />
      <IconButton label="Zooma in" icon={<ZoomIn />} onClick={() => void zoomIn({ duration: 160 })} />
      <Button variant="secondary" icon={<Scan />} onClick={() => fit(260)}>
        Passa in
      </Button>
    </>
  );

  return (
    <Page title="Karta" full status={summary && primar ? <SummaryLine primar={primar} s={summary} /> : <BankStatus />} actions={status === "ready" ? actions : undefined}>
      {status === "loading" ? (
        <div className="grid h-full place-items-center p-10">
          <Skeleton className="h-[60%] w-[80%]" />
        </div>
      ) : status === "error" || !graph ? (
        <ErrorState error={error ?? "Klippbanken kunde inte läsas."} title="Kartan kan inte ritas" onRetry={() => void reload()} />
      ) : (
        <>
          <div className="absolute inset-0">
            <MapCanvas
              graph={graph}
              layout={layout}
              infos={infos}
              mode={mode}
              points={points}
              active={active}
              focus={focus}
              hover={hover}
              sheetOpen={sheetOpen}
              onPick={pick}
              onFocus={focusOn}
              onHover={setHover}
            />
          </div>
          {/* Room left for the experiments' button at the right: a narrow map (the bot's panel docked) cuts the legend's tail. */}
          <Legend className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-200px)] overflow-hidden" />
          <ExperimentTray graph={graph} infos={infos} open={trayOpen} onOpenChange={setTray} onPick={pick} active={edgeId} />
        </>
      )}
      <EdgeSheet
        graph={graph}
        step={step}
        info={info}
        takeId={takeId}
        around={around}
        onClose={() => set({ kant: null, tagning: null })}
        onPickTake={(id) => set({ tagning: id })}
        onPickEdge={pick}
      />
    </Page>
  );
}
