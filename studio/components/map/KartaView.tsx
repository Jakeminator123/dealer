"use client";

// Karta: the dealer's node trees. A row of trees at the top (TreeRow: "Casino 22/36"), the chosen tree drawn with its
// pictures and its 36 steps against his measure (TreeCanvas, from GET /api/trees), a step with a film opening its films
// (EdgeSheet: its Primär and secondary films, "Gör primär" on his click) and a step without one opening what an order of it
// has and lacks (StepOrder). What is chosen lives in the address (?trad=…&steg=…&kant=…&tagning=…), so a link opens a tree,
// a step or a take; /primara/ leads here.
// Where the lab has no trees to give (the online copy; an older lab server until it is restarted) Karta draws the bank's own
// map instead (BankKarta): every step of the bank with what the game plays on it, one film per seat.
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { ChevronRight, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TARGETS, buildGraph } from "../../../src/clip-graph.ts";
import { nodeCode, type TreeAnswer, type ViewStep } from "../../../src/dealer-trees.ts";
import { hubDeals, judgedBank } from "../../../src/game-director.ts";
import { toPixels, type PlacementPlan } from "../../../src/placement-model.ts";
import { BankStatus, Page } from "@/components/shell";
import { Button, ErrorState, IconButton, Skeleton } from "@/components/ui";
import { getPlacements } from "@/lib/api";
import { useBank } from "@/lib/bank";
import { bankSummary, edgeInfo, isSecondary, primaryOf, type EdgeInfo, type Summary } from "@/lib/edge-stats";
import { mapLayout, treeLayout, type PlanPoints } from "@/lib/map-layout";
import { stepFilms, treeOrder, type Film } from "@/lib/primaries";
import { takeName } from "@/lib/names";
import { primarCount } from "@/lib/verdict";
import { EdgeSheet, type Around } from "./EdgeSheet";
import { ExperimentTray } from "./ExperimentTray";
import { Legend } from "./Legend";
import { MapCanvas, useFitMap } from "./MapCanvas";
import { REST_EDGE } from "./rest.ts";
import { StepOrder } from "./StepOrder";
import { TreeCanvas, TreeLegend } from "./TreeCanvas";
import { TreeRow } from "./TreeRow";
import { useMedia } from "./useOlder";
import { firstTree, useTrees } from "./useTrees";

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

/** Zoom and "Passa in", the same for both maps. */
function ZoomActions({ fit }: { fit: (duration?: number) => void }) {
  const { zoomIn, zoomOut } = useReactFlow();
  return (
    <>
      <IconButton label="Zooma ut" icon={<ZoomOut />} onClick={() => void zoomOut({ duration: 160 })} />
      <IconButton label="Zooma in" icon={<ZoomIn />} onClick={() => void zoomIn({ duration: 160 })} />
      <Button variant="secondary" icon={<Scan />} onClick={() => fit(260)}>
        Passa in
      </Button>
    </>
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
  const { dealer, readAt } = useBank();
  const trees = useTrees(dealer, readAt);
  if (trees.answer?.trees.length) return <TreeKarta answer={trees.answer} />;
  if (trees.state === "loading")
    return (
      <Page title="Karta" full status={<BankStatus />}>
        <div className="grid h-full place-items-center p-10">
          <Skeleton className="h-[60%] w-[80%]" />
        </div>
      </Page>
    );
  return <BankKarta />;
}

// ── The trees ───────────────────────────────────────────────────────────────
/** The words on the rail of a tree's anchor at the shoe. */
const SHOE_WORD: Record<string, string> = { READY: "nyp vid skon", "READY-B": "släp", "READY-C": "två händer" };

function TreeKarta({ answer }: { answer: TreeAnswer }) {
  const { bank, dealer } = useBank();
  const { params, set } = useParams();
  const media = useMedia();
  const points = usePlanPoints();
  const [hover, setHover] = useState<string | null>(null);
  const view = answer.trees.find((v) => v.tree.id === params.get("trad")) ?? firstTree(answer) ?? answer.trees[0];
  const stepId = params.get("steg");
  const edgeId = params.get("kant");
  const takeId = params.get("tagning");
  const step = view.steps.find((s) => s.id === stepId) ?? null;
  const layout = useMemo(() => treeLayout({ hub: view.hub, others: view.others, points, railText: `${nodeCode(view.hub)} · ${SHOE_WORD[view.hub] ?? "vid skon"}` }), [view.hub, view.others, points]);

  // A step with a film opens its films on the bank's graph, one film per card, as the game reads the bank (judged takes only).
  const graph = useMemo(() => (bank ? buildGraph(bank, { mode: "CARD", dealer }) : null), [bank, dealer]);
  const judged = useMemo(() => (bank ? judgedBank(bank) : null), [bank]);
  const game = useMemo(() => (judged ? buildGraph(judged, { dealer }) : null), [judged, dealer]);
  const played = useMemo(() => (judged ? buildGraph(judged, { mode: "CARD", dealer }) : null), [judged, dealer]);
  const hubs = useMemo(() => (bank ? hubDeals(bank, dealer) : {}), [bank, dealer]);
  // The films panel lists the tree's own films on the step (its stand-ins' too), not every anchor's films of the bank's edge
  // (an anchor variant at the shoe is a take of A2.1's edge). The Primär is the bank's, one per edge: when it is another
  // tree's, the panel says so, since "Gör primär" here replaces it.
  const filmStep = step && step.edge === edgeId ? step : (view.steps.find((s) => s.edge === edgeId && s.state === "finns") ?? null);
  const films = useMemo(() => {
    const all = bank && graph && game && edgeId && graph.edge[edgeId] ? stepFilms(bank, graph, game, edgeId, hubs) : null;
    if (!all || !filmStep) return all;
    const mine = new Set(filmStep.ids);
    const keep = (f: Film) => mine.has(f.take.id);
    const primary = all.primary && keep(all.primary) ? all.primary : null;
    const secondaries = all.secondaries.filter(keep);
    const live = all.edge.takes.filter((t) => !t.archived && mine.has(t.id)).length;
    return { ...all, primary, secondaries, proposal: all.proposal && mine.has(all.proposal.id) ? all.proposal : null, elsewhere: Math.max(0, live - secondaries.length - (primary ? 1 : 0)) };
  }, [bank, graph, game, edgeId, hubs, filmStep]);
  const bankPrimary = films && !films.primary ? primaryOf(films.edge) : null;
  const filmNote = bankPrimary ? `Stegets Primär i banken, ${takeName(bankPrimary, films!.edge.takes)}, hör till ett annat träd. Gör primär här ersätter den.` : null;
  const info = edgeId && graph && played && graph.edge[edgeId] ? edgeInfo(played.edge[edgeId] ? played : graph, edgeId, hubs, true) : null;
  // ‹ › in the films' panel walk the tree's steps that have a film, in the measure's order.
  const order = useMemo(() => [...new Set(view.steps.filter((s) => s.state === "finns" && graph?.edge[s.edge]).map((s) => s.edge))], [view.steps, graph]);
  const at = edgeId ? order.indexOf(edgeId) : -1;
  const around: Around = { prev: at > 0 ? order[at - 1] : null, next: at >= 0 && at < order.length - 1 ? order[at + 1] : null, unchosen: null };

  const sheetOpen = !!films || (!!step && step.state !== "finns");
  const fit = useFitMap(layout, false);
  const pick = useCallback(
    (s: ViewStep) => set({ steg: s.id, kant: s.state === "finns" && graph?.edge[s.edge] ? s.edge : null, tagning: null }),
    [set, graph],
  );
  const choose = useCallback((id: string) => set({ trad: id, steg: null, kant: null, tagning: null }), [set]);

  return (
    <Page title="Karta" full status={<TreeRow trees={answer.trees} chosen={view.tree.id} onChoose={choose} />} actions={<ZoomActions fit={fit} />}>
      <div className="absolute inset-0">
        <TreeCanvas view={view} layout={layout} media={media} active={step?.id ?? null} hover={hover} sheetOpen={sheetOpen} onPick={pick} onHover={setHover} />
      </div>
      <TreeLegend className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)] overflow-hidden" />
      <StepOrder
        view={view}
        step={films ? null : step}
        media={media}
        onClose={() => set({ steg: null })}
        onOpenFilms={step && step.takes > 0 && graph?.edge[step.edge] ? () => set({ kant: step.edge, tagning: null }) : null}
      />
      <EdgeSheet
        graph={graph}
        step={films}
        title={filmStep?.name}
        note={filmNote}
        info={info}
        takeId={takeId}
        around={around}
        onClose={() => set({ kant: null, tagning: null, steg: null })}
        onPickTake={(id) => set({ tagning: id })}
        onPickEdge={(id) => set({ kant: id, tagning: null, steg: view.steps.find((s) => s.edge === id && s.state === "finns")?.id ?? null })}
      />
    </Page>
  );
}

// ── The bank's map (no trees from the lab) ──────────────────────────────────
function Stat({ sign, tone, children, title }: { sign?: string; tone: string; children: React.ReactNode; title: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
      {sign ? <span aria-hidden className={tone}>{sign}</span> : null}
      {children}
    </span>
  );
}

/** The header: steps with a Primär of the steps a round needs, and the steps the game has no film for. */
function SummaryLine({ primar, s }: { primar: { set: number; total: number }; s: Summary }) {
  return (
    <span className="flex flex-wrap items-center gap-3 text-sm text-dim">
      <Stat tone="" title="Steg med spelbar film, inklusive återbruk och vägar via andra ankare; säger inget om enhetlig filmkvalitet">
        <span className="font-medium text-ink tabular-nums">Spelbara steg {s.films - s.missing}/{s.films}</span>
      </Stat>
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

function BankKarta() {
  const { bank, graph, status, error, reload, dealer } = useBank();
  const { params, set } = useParams();
  const edgeId = params.get("kant");
  const takeId = params.get("tagning");
  const focus = params.get("plats");
  const [hover, setHover] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  const points = usePlanPoints();

  const layout = useMemo(() => mapLayout({ points }), [points]);
  // The game's own graph (the bank as the game reads it: judged takes only): how each film is used and what plays on a line.
  const judged = useMemo(() => (bank ? judgedBank(bank) : null), [bank]);
  const game = useMemo(() => (judged ? buildGraph(judged, { dealer }) : null), [judged, dealer]);
  // A seat the round deals from another pose at the shoe (anchor 2.2) counts as played, by the game's own rule.
  const hubs = useMemo(() => (bank ? hubDeals(bank, dealer) : {}), [bank, dealer]);
  // What every line, the rest and each experiment says: what the game plays there, and its secondary films as the count.
  const infos = useMemo(() => {
    const out = new Map<string, EdgeInfo>();
    if (!graph || !game) return out;
    for (const id of [...layout.edges.map((e) => e.id), REST_EDGE, ...graph.experiments.map((e) => e.id)]) {
      const info = edgeInfo(game.edge[id] ? game : graph, id, hubs, true);
      if (info) out.set(id, info);
    }
    return out;
  }, [graph, game, layout, hubs]);
  const summary = useMemo(() => (game ? bankSummary(game, hubs) : null), [game, hubs]);
  const primar = useMemo(() => (graph ? primarCount(graph) : null), [graph]);
  const order = useMemo(() => (graph ? treeOrder(graph) : []), [graph]);

  const edge = graph && edgeId ? (graph.edge[edgeId] ?? null) : null;
  const step = useMemo(() => (bank && graph && game && edgeId ? stepFilms(bank, graph, game, edgeId, hubs) : null), [bank, graph, game, edgeId, hubs]);
  const info = edgeId ? (infos.get(edgeId) ?? (graph && game ? edgeInfo(game.edge[edgeId] ? game : graph, edgeId, hubs, true) : null)) : null;
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
  // A2.2's own takes are experiments outside the bank's map: choosing A2.2 opens the tray that lists them. The trees draw
  // A2.2 in the tree it belongs to; this map is what the online copy shows, where there are no trees.
  const focusOn = useCallback(
    (node: string | null) => {
      set({ plats: node });
      if (node === "READY-B") setTray(true);
    },
    [set],
  );
  const fit = useFitMap(layout, false);

  const actions = (
    <>
      {around.unchosen ? (
        <Button variant="secondary" size="sm" iconAfter={<ChevronRight />} onClick={() => pick(around.unchosen!)} className="mr-2" title="Öppna nästa steg i trädet som inte har någon Primär">
          Nästa utan Primär
        </Button>
      ) : null}
      <ZoomActions fit={fit} />
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
