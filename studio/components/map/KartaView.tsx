"use client";

// Karta: the node map of the clip bank. Anchors and seats laid out like the table, films as lines with what plays on
// them, a side panel per film with every take. What is chosen lives in the address (?kant=…&tagning=…&plats=…&filmer=kort),
// so a link can open the map on a film or a take.
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TARGETS, buildGraph, type FilmMode } from "../../../src/clip-graph.ts";
import { toPixels, type PlacementPlan } from "../../../src/placement-model.ts";
import { BankStatus, Page } from "@/components/shell";
import { Button, ErrorState, IconButton, Skeleton, Switch } from "@/components/ui";
import { getPlacements } from "@/lib/api";
import { useBank } from "@/lib/bank";
import { bankSummary, edgeInfo, type EdgeInfo, type Summary } from "@/lib/edge-stats";
import { mapLayout, type PlanPoints } from "@/lib/map-layout";
import { EdgeSheet } from "./EdgeSheet";
import { ExperimentTray } from "./ExperimentTray";
import { Legend } from "./Legend";
import { MapCanvas, useFitMap } from "./MapCanvas";

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

/** Each card's centre in the plan, in film pixels (the plan's own view, as the old lab reads it). */
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

function SummaryLine({ s }: { s: Summary }) {
  return (
    <span className="flex items-center gap-3 text-sm text-dim">
      <span className="font-medium text-ink">{s.films} filmer</span>
      <Stat sign="✓" tone="text-[#6cc595]" title="Filmer där du själv har godkänt en tagning">
        {s.outright} med din godkända
      </Stat>
      <Stat sign="◆" tone="text-[#9db3f8]" title="Filmer där en variant spelas nu">
        {s.variant} spelar variant
      </Stat>
      <Stat tone="" title="Filmer där ingenting kan spelas">
        <span className={s.missing ? "rounded-full border border-dashed border-underkand/70 px-1.5 text-xs leading-[18px] text-[#ef8b8b]" : ""}>{s.missing} saknas</span>
      </Stat>
      <Stat sign="★" tone="text-brass" title="Filmer där du har valt en primär">
        {s.primary} primär
      </Stat>
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
  const infos = useMemo(() => {
    const out = new Map<string, EdgeInfo>();
    if (!graph) return out;
    for (const e of layout.edges) {
      const info = edgeInfo(graph, e.id);
      if (info) out.set(e.id, info);
    }
    return out;
  }, [graph, layout]);
  const summary = useMemo(() => (graph ? bankSummary(graph) : null), [graph]);

  const edge = graph && edgeId ? (graph.edge[edgeId] ?? null) : null;
  const sheetOpen = !!edge;
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
    <Page title="Karta" full status={summary ? <SummaryLine s={summary} /> : <BankStatus />} actions={status === "ready" ? actions : undefined}>
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
          <ExperimentTray graph={graph} open={trayOpen} onOpenChange={setTray} onPick={pick} active={edgeId} />
        </>
      )}
      <EdgeSheet
        graph={graph}
        edgeId={edgeId}
        takeId={takeId}
        onClose={() => set({ kant: null, tagning: null })}
        onPickTake={(id) => set({ tagning: id })}
        onPickEdge={pick}
      />
    </Page>
  );
}
