"use client";

// Karta: the dealer's node trees. A row of trees at the top (TreeRow: a tab per tree with its A1), the chosen tree drawn with its
// pictures and its 36 steps against his measure (TreeCanvas, from GET /api/trees), a step with a film opening its films
// (EdgeSheet: its Primär and secondary films, "Gör primär" on his click) and a step without one opening what an order of it
// has and lacks (StepOrder). A click on a picture opens it large (StillViewer). Väg: he clicks pictures in order (A1, A2.3,
// A3P4C1, A2.3; PathBar) and Spela plays the films of those steps back to back (PathPlayer, lib/tree-path.ts). What is chosen
// lives in the address (?trad=…&steg=…&kant=…&tagning=…&vag=A1-A2.3-…), so a link opens a tree, a step, a take or a path;
// /primara/ leads here. Several trees put together are a composition (?komposition=<id>, CompositionKarta): the row's
// button "Kompositioner" lists them, and the open one is a tab beside the trees. Her talk is a group of its own on A1: the
// Tal chip opens the tree's lines and the talk film the game plays for each (TalkSheet, ?replik=<key>; lib/tree-talk.ts),
// and the rest's films panel leaves the talk films out.
// The camera is one more dimension of a tree (Jakob 2026-11-23): Karta opens on seat 4's camera, the straight one, and the
// strip at the map's left edge (CameraRail: a click, a drag or the wheel over it) changes to camera 1–7 (?kamera=2). The same
// tree is then drawn with the pictures and films made from that seat (src/dealer-trees.ts cameraView), empty where nothing is.
// Where the lab has no trees to give (the online copy; an older lab server until it is restarted) Karta draws the bank's own
// map instead (BankKarta): every step of the bank with what the game plays on it, one film per seat.
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { ChevronRight, Route, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TARGETS, buildGraph } from "../../../src/clip-graph.ts";
import { CAMERAS, STRAIGHT_CAMERA, cameraFromWord, cameraMade, cameraView, nodeCode, type TreeAnswer, type ViewStep } from "../../../src/dealer-trees.ts";
import { hubDeals, judgedBank } from "../../../src/game-director.ts";
import { toPixels, type PlacementPlan } from "../../../src/placement-model.ts";
import { spokenLine, type SpeechTake } from "../../../src/speech-lines.ts";
import { BankStatus, Page } from "@/components/shell";
import { Button, ErrorState, IconButton, Skeleton } from "@/components/ui";
import { getPlacements } from "@/lib/api";
import { useBank } from "@/lib/bank";
import { bankSummary, edgeInfo, isSecondary, primaryOf, type EdgeInfo, type Summary } from "@/lib/edge-stats";
import { mapLayout, treeLayout, type PlanPoints } from "@/lib/map-layout";
import type { EntryAnswer } from "@/lib/media";
import { stepFilms, treeOrder, type Film } from "@/lib/primaries";
import { takeName } from "@/lib/names";
import { talkOf, talkWord } from "@/lib/tree-talk";
import { nextNodes, parsePath, pathClips, pathParts, pathText } from "@/lib/tree-path";
import { primarCount } from "@/lib/verdict";
import { CAMERA_RAIL_SPACE, CameraNote, CameraRail, type CameraStop } from "./CameraRail";
import { EdgeSheet, type Around } from "./EdgeSheet";
import { ExperimentTray } from "./ExperimentTray";
import { Legend } from "./Legend";
import { MapCanvas, useFitMap } from "./MapCanvas";
import { PathBar, type PathPic } from "./PathBar";
import { PathPlayer } from "./PathPlayer";
import { REST_EDGE } from "./rest.ts";
import { StepOrder } from "./StepOrder";
import { StillViewer } from "./StillViewer";
import { TalkSheet } from "./TalkSheet";
import { TreeCanvas, TreeLegend, type PathMarks } from "./TreeCanvas";
import { CompositionKarta } from "./CompositionKarta";
import { TreeRow } from "./TreeRow";
import { useCompositions } from "./useCompositions";
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
  const { params, set } = useParams();
  const composition = params.get("komposition");
  if (trees.answer?.trees.length) return composition ? <CompositionKarta answer={trees.answer} id={composition} set={set} /> : <TreeKarta answer={trees.answer} />;
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
  const { bank, dealer, readAt } = useBank();
  const { params, set } = useParams();
  const media = useMedia();
  const compositions = useCompositions(dealer, readAt).answer?.compositions;
  const points = usePlanPoints();
  const [hover, setHover] = useState<string | null>(null);
  const tree = answer.trees.find((v) => v.tree.id === params.get("trad")) ?? firstTree(answer) ?? answer.trees[0];
  // The camera the tree is seen from: the straight one unless the address names another. view is the tree from that camera.
  const camera = cameraFromWord(params.get("kamera"));
  const straight = camera === STRAIGHT_CAMERA;
  const view = useMemo(() => cameraView(tree, camera), [tree, camera]);
  const stops = useMemo<CameraStop[]>(
    () =>
      CAMERAS.map((c) => {
        const { first, ...made } = cameraMade(tree, c);
        return { camera: c, entry: first ? media.get(first) : undefined, ...made };
      }),
    [tree, media],
  );
  const stepId = params.get("steg");
  const edgeId = params.get("kant");
  const takeId = params.get("tagning");
  // From another camera a step nothing is made for opens nothing (TreeCanvas draws it as the tree's shape only).
  const step = view.steps.find((s) => s.id === stepId && (straight || s.state !== "saknas")) ?? null;
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
    // The rest's panel lists the rest films; the talk films on it are Tal's (TalkSheet).
    const talking = (id: string) => filmStep.kind === "vila" && !!graph?.takes[id] && spokenLine(graph.takes[id] as unknown as SpeechTake) !== null;
    const mine = new Set(filmStep.ids.filter((id) => !talking(id)));
    const keep = (f: Film) => mine.has(f.take.id);
    const primary = all.primary && keep(all.primary) ? all.primary : null;
    const secondaries = all.secondaries.filter(keep);
    const live = all.edge.takes.filter((t) => !t.archived && mine.has(t.id)).length;
    return { ...all, primary, secondaries, proposal: all.proposal && mine.has(all.proposal.id) ? all.proposal : null, elsewhere: Math.max(0, live - secondaries.length - (primary ? 1 : 0)) };
  }, [bank, graph, game, edgeId, hubs, filmStep]);
  const bankPrimary = films && !films.primary ? primaryOf(films.edge) : null;
  const filmNote = bankPrimary ? `Stegets Primär i banken, ${takeName(bankPrimary, films!.edge.takes)}, hör till ett annat träd. Gör primär här ersätter den.` : null;
  const info = edgeId && graph && played && graph.edge[edgeId] ? edgeInfo(played.edge[edgeId] ? played : graph, edgeId, hubs, true) : null;
  // ‹ › in the films' panel walk the tree's steps that have a film, in the measure's order, named in the tree's own words
  // (Tatuerad's "A2.3 → A3P4C2", not the bank's edge "A2.1 → A3P4C2").
  const order = useMemo(() => [...new Set(view.steps.filter((s) => s.state === "finns" && graph?.edge[s.edge]).map((s) => s.edge))], [view.steps, graph]);
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of view.steps) if (s.state === "finns" && !(s.edge in out)) out[s.edge] = s.name;
    return out;
  }, [view.steps]);
  const at = edgeId ? order.indexOf(edgeId) : -1;
  const around: Around = { prev: at > 0 ? order[at - 1] : null, next: at >= 0 && at < order.length - 1 ? order[at + 1] : null, unchosen: null, names };
  // What plays now is the game's: a tree the game does not play has no "Spelas nu" of its own (the game's edge plays A2.1),
  // and neither has another camera than the straight one.
  const idle = !straight ? `Spelet spelar kamera ${STRAIGHT_CAMERA}, inte kamera ${camera}.` : view.tree.state === "spelas" ? null : `Spelet spelar inte ${view.tree.name} ${view.tree.state === "byggs" ? "än" : "nu"}.`;

  // Tal (?replik=<key>): the tree's lines and the talk film the game plays for each; open beside no step's panel. It stays open
  // when another tree is chosen, so that the trees' talk can be compared. Her talk is the straight camera's.
  const talk = straight ? talkOf(view) : null;
  const replik = params.get("replik");
  const talkOpen = replik !== null && !!talk;
  const openTalk = useCallback(() => set({ replik: talkOpen ? null : (talk?.lines.find((l) => l.clip) ?? talk?.lines[0])?.key ?? null, steg: null, kant: null, tagning: null }), [set, talk, talkOpen]);
  // Where the tree has no talk film: the trees that have.
  const talkElsewhere = talk && talk.have === 0 ? answer.trees.filter((v) => v.tree.id !== view.tree.id && !v.tree.shares && (talkOf(v)?.have ?? 0) > 0).map((v) => `${v.tree.name} har ${talkWord(talkOf(v)!)}`).join(", ") || null : null;

  const sheetOpen = !!films || (!!step && step.state !== "finns") || talkOpen;
  const fit = useFitMap(layout, false, CAMERA_RAIL_SPACE);
  const pick = useCallback(
    (s: ViewStep) => set({ steg: s.id, kant: s.state === "finns" && graph?.edge[s.edge] ? s.edge : null, tagning: null, replik: null }),
    [set, graph],
  );
  const choose = useCallback((id: string) => set({ trad: id, steg: null, kant: null, tagning: null, vag: null }), [set]);
  // Another camera: the same tree; the step, the take and the path chosen were the camera's that is left.
  const chooseCamera = useCallback((c: number) => set({ kamera: c === STRAIGHT_CAMERA ? null : String(c), steg: null, kant: null, tagning: null, vag: null, replik: null }), [set]);

  // The tree's pictures in its own order (A1, the anchors at the shoe, the cards), each once: what the large viewer walks.
  const stills = useMemo(() => {
    const seen = new Set<string>();
    return view.nodes.flatMap((n) => {
      const entry = n.entry ? media.get(n.entry) : undefined;
      if (!entry || seen.has(entry.id)) return [];
      seen.add(entry.id);
      return [entry];
    });
  }, [view.nodes, media]);
  const [still, setStill] = useState<number | null>(null);
  const openStill = useCallback((entry: EntryAnswer) => {
    const at = stills.findIndex((e) => e.id === entry.id);
    if (at >= 0) setStill(at);
  }, [stills]);
  const pathPic = useCallback((node: string): PathPic => {
    const n = view.nodes.find((x) => x.node === node);
    return { entry: n?.entry ? (media.get(n.entry) ?? null) : null, code: n?.code ?? nodeCode(node) };
  }, [view.nodes, media]);

  // Väg: a path he clicks through the tree, picture by picture (?vag=A1-A2.3-A3P4C1-A2.3); Spela plays its steps' films back
  // to back. Only a node the path can go to next is taken.
  const [picking, setPicking] = useState(() => params.has("vag"));
  const [playing, setPlaying] = useState(false);
  const vag = params.get("vag");
  const path = useMemo(() => parsePath(vag, view.nodes), [vag, view.nodes]);
  const clips = useMemo(() => pathClips(view.steps, path), [view.steps, path]);
  const next = useMemo(() => nextNodes(view.steps, path), [view.steps, path]);
  const marks = useMemo<PathMarks | null>(() => {
    if (!picking) return null;
    const at = new Map<string, number[]>();
    path.forEach((node, k) => at.set(node, [...(at.get(node) ?? []), k + 1]));
    return { at, next, steps: new Set(clips.flatMap((c) => (c.step ? [c.step.id] : []))), last: path.at(-1) ?? null };
  }, [picking, path, next, clips]);
  const parts = useMemo(() => (playing && graph ? pathParts(graph, clips) : null), [playing, graph, clips]);
  const setPath = useCallback((nodes: readonly string[]) => set({ vag: nodes.length ? pathText(nodes) : null }), [set]);
  const leave = () => {
    setPicking(false);
    set({ vag: null });
  };
  const open = useCallback(
    (node: string) => {
      if (picking) {
        if (next.has(node)) setPath([...path, node]);
        return;
      }
      const n = view.nodes.find((x) => x.node === node);
      const entry = n?.entry ? media.get(n.entry) : undefined;
      if (entry) openStill(entry);
    },
    [picking, next, path, setPath, view.nodes, media, openStill],
  );

  const actions = (
    <>
      <Button variant={picking ? "primary" : "secondary"} icon={<Route />} aria-pressed={picking} onClick={() => (picking ? leave() : setPicking(true))} className="mr-2" title="Klicka bilderna i ordning och spela stegens filmer efter varandra">
        Väg
      </Button>
      <ZoomActions fit={fit} />
    </>
  );

  return (
    <Page title="Karta" full status={<TreeRow trees={answer.trees} chosen={view.tree.id} onChoose={choose} compositions={compositions} onCompose={(id) => set({ komposition: id })} />} actions={actions}>
      <div className="absolute inset-0">
        <TreeCanvas view={view} layout={layout} media={media} active={step?.id ?? null} hover={hover} sheetOpen={sheetOpen} path={marks} onPick={pick} onHover={setHover} onOpen={open} talk={talk} talkOn={talkOpen} onTalk={openTalk} camera={straight ? null : camera} />
      </div>
      <CameraRail className="absolute left-3 top-1/2 z-10 -translate-y-1/2" stops={stops} value={camera} total={view.count.total} onChange={chooseCamera} />
      {picking ? (
        <PathBar
          className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)]"
          path={path}
          clips={clips}
          pic={pathPic}
          onUndo={() => setPath(path.slice(0, -1))}
          onClear={() => setPath([])}
          onPlay={() => setPlaying(true)}
          onClose={leave}
        />
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-24px)] items-center gap-2 overflow-hidden">
          <TreeLegend className="min-w-0 overflow-hidden" />
          {straight ? null : <CameraNote stop={stops[CAMERAS.indexOf(camera)]} total={view.count.total} className="shrink-0" />}
        </div>
      )}
      <StepOrder
        view={view}
        step={films ? null : step}
        media={media}
        camera={straight ? null : camera}
        onClose={() => set({ steg: null })}
        onOpen={openStill}
      />
      <EdgeSheet
        graph={graph}
        step={films}
        title={filmStep?.name}
        note={filmNote}
        info={info}
        idle={idle}
        takeId={takeId}
        around={around}
        onClose={() => set({ kant: null, tagning: null, steg: null })}
        onPickTake={(id) => set({ tagning: id })}
        onPickEdge={(id) => set({ kant: id, tagning: null, steg: view.steps.find((s) => s.edge === id && s.state === "finns")?.id ?? null })}
      />
      <TalkSheet open={talkOpen} tree={view.tree.name} talk={talk} chosen={replik} elsewhere={talkElsewhere} onChoose={(key) => set({ replik: key })} onClose={() => set({ replik: null })} />
      <StillViewer entries={stills} index={still} onIndex={setStill} />
      <PathPlayer parts={parts} clips={clips} graph={graph} pic={pathPic} onClose={() => setPlaying(false)} />
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
