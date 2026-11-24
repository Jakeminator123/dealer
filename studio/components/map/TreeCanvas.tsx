"use client";

// One tree drawn (React Flow): its anchors and every card as pictures from Material (media first), a node without a picture
// as an empty box with its name; its 36 steps as lines, solid in the verdict's colour where a film is (finns), dashed grey
// where a film or a delivered order waits for a verdict (prov), red and dotted where nothing is (saknas). A step's chip opens
// it: a step with a film its films (EdgeSheet), another what an order of it has and lacks (StepOrder). A click on a picture
// opens it large; while a path is picked (Väg) it adds the node to the path instead: the path's pictures ringed and numbered
// in order, its lines lit, and the nodes it cannot go to next faded. Little text: the short names (A1, A2.3, A3P4C2) on the
// pictures, the rest in each chip's title. Geometry: lib/map-layout.ts treeLayout. Where she speaks, on A1, the Tal chip
// says how many of her lines the game has a talk film for in the tree ("25/25", lib/tree-talk.ts), a count of its own
// beside the 36 steps; a click opens the tree's talk (TalkSheet).
// From another camera than the straight one (camera, CameraRail.tsx) the same tree is drawn with what is made from that seat:
// a step nothing is made for is a faint line without a chip, not a red one (nothing is missing where nothing is begun).
import "@xyflow/react/dist/style.css";
import { Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, ReactFlow, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { ImageOff, Speech } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { nodeCode, type TreeNode, type TreeView, type ViewStep } from "../../../src/dealer-trees.ts";
import { cn } from "@/components/ui";
import type { Dir, TreeBox, TreeLayout, TreeLine } from "@/lib/map-layout";
import type { EntryAnswer } from "@/lib/media";
import { talkWord, type TreeTalk } from "@/lib/tree-talk";
import { VERDICT_LABEL } from "@/lib/verdict";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";
import { CAMERA_RAIL_SPACE } from "./CameraRail";
import { SHEET_W } from "./EdgeSheet";
import { LINE, PlayDot } from "./EdgeChip";
import { RailEdge, type RailEdgeType } from "./MapEdges";
import { Hooks } from "./MapNodes";
import { useFitMap } from "./MapCanvas";

/** A step's line: solid in the verdict's colour (finns), dashed grey (prov), red dotted (saknas). */
export const STEP_LINE = {
  prov: { color: LINE.vantar, dash: "6 4" },
  saknas: { color: LINE.gap, dash: "2 4" },
} as const;
const lineColor = (s: ViewStep) => (s.state === "finns" ? LINE[s.verdict ?? "godkand"] : STEP_LINE[s.state].color);
const STATE_WORD = { finns: "finns", prov: "prov, väntar på dom", saknas: "saknas" } as const;

/** What a step's chip says when pointed at: "A2.1 → A3P6C1: finns (Variant, från A2.2)". */
export function stepTitle(s: ViewStep): string {
  const whose = s.byJakob ? "" : s.provisional ? ", dömd åt honom" : s.verdict && s.verdict !== "vantar" ? ", granskarens" : "";
  const said = s.verdict ? ` (${VERDICT_LABEL[s.verdict]}${whose}${s.via ? `, från ${nodeCode(s.via)}` : ""})` : "";
  const sent = s.deliveries.length ? "; levererad, inte i banken än" : "";
  return `${s.name}: ${STATE_WORD[s.state]}${said}${sent}`;
}

const PAD = { side: 20 };
const ARROW: Record<Dir, number> = { down: 90, up: -90, right: 0, left: 180 };
const ARROW_PATH = "M0,0 L-8,-4.5 L-8,4.5 Z";

// ── Nodes ───────────────────────────────────────────────────────────────────
type Pic = { node: TreeNode | null; entry: EntryAnswer | null };
/** One picture on the map as a button: its node, whether a click does anything, its places in the path, faded or not. */
type Shot = { node: string; pic: Pic; can: boolean; mark: number[] | null; off: boolean };
/** none: what an empty box says when pointed at ("ingen bild i trädet", "ingen bild från kamera 2"). */
type Act = { picking: boolean; onOpen: (node: string) => void; none: string };
/** The Tal chip on A1: the tree's talk count, whether its panel is open, and what opens it. */
type TalkChipData = { have: number; total: number; on: boolean; onOpen: () => void };
type PictureData = { box: TreeBox; shot: Shot; act: Act; dim: boolean; note: string | null; label: string; talk: TalkChipData | null };
type CardsData = { box: TreeBox; shots: Shot[]; act: Act; dim: boolean };
type PictureNodeType = Node<PictureData, "picture">;
type CardsNodeType = Node<CardsData, "cards">;

/**
 * How much a picture's labels grow as the map is zoomed out (fitted to a narrow window, zoom ≈ 0.5 at 900), so that a name
 * stays about 10 px on the screen: 1 at zoom 1 and closer, at most 2. Rounded, so that a zoom only redraws the pictures when
 * the size changes.
 */
const labelScale = (zoom: number) => Math.round(Math.min(2, Math.max(1, 1 / zoom)) * 10) / 10;

/**
 * A picture of Material, or an empty box with the node's name when the tree has none for it; mark: its places in the path;
 * stateTop: the state's mark stays at the top (the foot holds the Tal chip).
 */
function Picture({ pic, code, none, small = false, mark = null, stateTop = false }: { pic: Pic; code: string; none: string; small?: boolean; mark?: number[] | null; stateTop?: boolean }) {
  const scale = useStore((s) => labelScale(s.transform[2]));
  const cover = pic.entry ? coverOfEntry(pic.entry) : null;
  const state = pic.node?.state && pic.node.state !== "gäller" ? pic.node.state : null;
  // A card (80 wide) holds "A3P1C1" up to 18 px; grown, the state's mark moves to the foot so the two never overlap.
  const grown = scale > 1;
  // Material's name mostly starts with the code ("A2.3: Vänster hand uppifrån …"): said once, never the picture's id.
  const name = pic.entry?.name ?? null;
  const named = name?.startsWith(code) ? name : name ? `${code}: ${name}` : code;
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden rounded-md", cover ? "border border-line-strong bg-well" : "border border-dashed border-line-strong bg-transparent")}
      title={pic.node?.entry ? `${named}${state ? ` (${state} i Material)` : ""}` : `${code}: ${none}`}
    >
      {cover ? (
        <ProofStill cover={cover} fps={pic.entry?.fps ?? 30} className={cn("absolute inset-0", (state === "ersatt" || state === "arkiverad") && "saturate-[0.7]")} />
      ) : pic.node?.entry ? (
        <span className="absolute inset-0 grid place-items-center text-faint">
          <ImageOff className="size-4" aria-hidden />
        </span>
      ) : null}
      <span
        className={cn("pointer-events-none absolute left-1 top-1 rounded-xs px-1 font-semibold tracking-[0.01em]", cover ? "bg-black/65 text-ink backdrop-blur-sm" : "text-dim")}
        style={{ fontSize: small ? 10 * Math.min(1.8, scale) : 12 * scale, lineHeight: grown ? 1.4 : "15px" }}
      >
        {code}
      </span>
      {state ? (
        <span
          className={cn("pointer-events-none absolute right-1 rounded-xs bg-black/65 px-1 text-faint backdrop-blur-sm", grown && !stateTop ? "bottom-1" : "top-1")}
          style={{ fontSize: Math.min(18, 10 * scale), lineHeight: grown ? 1.4 : "15px" }}
          aria-label={state}
        >
          {small ? (state === "kandidat" ? "◐" : "↺") : state}
        </span>
      ) : null}
      {mark ? (
        <span
          className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-brass px-1.5 font-semibold tabular-nums text-brass-ink shadow-[0_1px_4px_rgb(0_0_0/0.6)]"
          style={{ fontSize: Math.min(20, 11 * scale), lineHeight: grown ? 1.4 : "16px" }}
          aria-hidden
        >
          {mark.join("·")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A picture as a button: a click opens it large, or, while a path is picked, adds its node to the path (only a node the
 * path can go to next). No nopan: a drag over a picture still moves the map, and a drag never counts as a click.
 */
function ShotButton({ shot, act, code, small = false, stateTop = false }: { shot: Shot; act: Act; code: string; small?: boolean; stateTop?: boolean }) {
  return (
    <button
      type="button"
      aria-disabled={!shot.can}
      aria-label={act.picking ? `${code}: lägg i vägen` : `${code}: visa stort`}
      onClick={() => shot.can && act.onOpen(shot.node)}
      className={cn(
        "relative block h-full w-full rounded-md text-left transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass",
        shot.can ? (act.picking ? "cursor-copy" : "cursor-zoom-in") : "cursor-default",
        shot.mark && "ring-2 ring-brass ring-offset-2 ring-offset-canvas",
        shot.off && "opacity-35",
      )}
    >
      <Picture pic={shot.pic} code={code} none={act.none} small={small} mark={shot.mark} stateTop={stateTop} />
    </button>
  );
}

/** The Tal chip at A1's foot, right (the rest's own chip is at the left): her lines with a talk film in the tree, "25/25". */
function TalkChip({ talk }: { talk: TalkChipData }) {
  const scale = useStore((s) => labelScale(s.transform[2]));
  const none = talk.have === 0;
  const title = `Tal: ${talk.have} av ${talk.total} repliker har en talfilm i trädet`;
  return (
    <button
      type="button"
      onClick={talk.onOpen}
      title={title}
      aria-label={title}
      aria-pressed={talk.on}
      className={cn(
        "nodrag nopan pointer-events-auto absolute bottom-1.5 right-1.5 z-[1] inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 font-medium tabular-nums shadow-[0_1px_5px_rgb(0_0_0/0.55)] backdrop-blur-sm transition-shadow duration-150",
        none ? "border border-dashed border-[#ef8b8b]/80 text-[#ef8b8b]" : "text-ink",
        talk.on && "shadow-[0_0_0_2px_rgb(217_185_106/0.7)]",
      )}
      style={{ fontSize: Math.min(20, 11 * scale), lineHeight: "18px" }}
    >
      <Speech aria-hidden style={{ width: Math.min(22, 12 * scale), height: Math.min(22, 12 * scale) }} />
      {talkWord(talk)}
    </button>
  );
}

function PictureNode({ data }: NodeProps<PictureNodeType>) {
  const { box, shot, act, dim, note, label, talk } = data;
  return (
    <div style={{ width: box.box.w, height: box.box.h }} className={cn("relative transition-opacity duration-150", dim && "opacity-40")} aria-label={label}>
      <Hooks />
      <ShotButton shot={shot} act={act} code={box.node ? nodeCode(box.node) : ""} small={box.kind === "halkort"} stateTop={!!talk} />
      {talk ? <TalkChip talk={talk} /> : null}
      {note ? <span className="pointer-events-none absolute -bottom-4 left-0 whitespace-nowrap text-[10.5px] leading-4 text-faint">{note}</span> : null}
    </div>
  );
}

function CardsNode({ data }: NodeProps<CardsNodeType>) {
  const { box, shots, act, dim } = data;
  return (
    <div style={{ width: box.box.w, height: box.box.h }} className={cn("relative rounded-lg border border-line bg-surface/80 transition-opacity duration-150", dim && "opacity-40")}>
      <Hooks />
      {box.cards.map((c, k) => (
        <div key={c.card} className="absolute" style={{ left: c.box.x - box.box.x, top: c.box.y - box.box.y, width: c.box.w, height: c.box.h }}>
          <ShotButton shot={shots[k]} act={act} code={nodeCode(c.card)} small />
        </div>
      ))}
    </div>
  );
}

// ── Lines ───────────────────────────────────────────────────────────────────
/** marked: the step lies on the path being picked. ghost: a step of another camera that nothing is made for. */
type StepData = { line: TreeLine; step: ViewStep; active: boolean; hover: boolean; marked: boolean; dim: boolean; ghost: boolean; onPick: (s: ViewStep) => void; onHover: (id: string | null) => void };
type StepEdgeType = Edge<StepData, "step">;

/** A step's chip: the verdict's dot where a film is, a waiting dot for a prov, an empty red ring where nothing is. */
function StepChip({ step, active, dim, onClick, onHover }: { step: ViewStep; active: boolean; dim: boolean; onClick: () => void; onHover: (on: boolean) => void }) {
  const title = stepTitle(step);
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "nodrag nopan pointer-events-auto grid size-[18px] place-items-center rounded-full bg-canvas shadow-[0_1px_5px_rgb(0_0_0/0.55)] transition-[opacity,box-shadow] duration-150",
        active && "shadow-[0_0_0_2px_rgb(217_185_106/0.6)]",
        dim && "opacity-30",
      )}
    >
      {step.state === "saknas" ? (
        // The light red of the panel's "saknas", wide enough to show against the dark map and over a green picture (the rest's chip).
        <span aria-hidden className="size-4 rounded-full border-[1.5px] border-dashed border-[#ef8b8b]" />
      ) : (
        <PlayDot tag={{ kind: "take", verdict: step.state === "finns" ? (step.verdict ?? "godkand") : "vantar", byJakob: step.state === "finns" ? step.byJakob : false }} />
      )}
    </button>
  );
}

function StepEdge({ id, data }: EdgeProps<StepEdgeType>) {
  if (!data) return null;
  const { line, step, active, hover, marked, dim, ghost, onPick, onHover } = data;
  // Nothing made from this camera: the tree's shape only, nothing to point at or open.
  if (ghost) return line.path ? <BaseEdge id={id} path={line.path} interactionWidth={0} style={{ stroke: "var(--color-line-strong)", strokeWidth: 1.5, strokeDasharray: STEP_LINE.saknas.dash, pointerEvents: "none" }} /> : null;
  const color = lineColor(step);
  const lit = active || hover || marked;
  const opacity = dim ? 0.2 : 1;
  const dash = step.state === "finns" ? undefined : STEP_LINE[step.state].dash;
  return (
    <>
      {lit && line.route ? <path d={line.route} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {line.path ? (
        <>
          <BaseEdge id={id} path={line.path} interactionWidth={14} style={{ stroke: color, strokeWidth: lit ? 3 : step.state === "finns" ? 2.25 : 1.75, strokeDasharray: dash, opacity, transition: "opacity 150ms" }} />
          <path d={ARROW_PATH} transform={`translate(${line.arrow.x} ${line.arrow.y}) rotate(${ARROW[line.arrow.dir]})`} fill={color} opacity={opacity} />
        </>
      ) : null}
      <EdgeLabelRenderer>
        <div className="absolute" style={{ transform: `translate(-50%, -50%) translate(${line.chip.x}px, ${line.chip.y}px)`, zIndex: lit ? 3 : 2 }}>
          <StepChip step={step} active={active} dim={dim} onClick={() => onPick(step)} onHover={(on) => onHover(on ? id : null)} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { picture: PictureNode, cards: CardsNode };
const edgeTypes = { step: StepEdge, rail: RailEdge };

// ── The canvas ──────────────────────────────────────────────────────────────
/** The path being picked (Väg): each node's places in it (1, 2, …), the nodes it can go to next, its steps and last node. */
export type PathMarks = { at: ReadonlyMap<string, number[]>; next: ReadonlySet<string>; steps: ReadonlySet<string>; last: string | null };

export type TreeCanvasProps = {
  view: TreeView;
  layout: TreeLayout;
  media: ReadonlyMap<string, EntryAnswer>;
  /** The step whose panel is open. */
  active: string | null;
  hover: string | null;
  sheetOpen: boolean;
  /** The path being picked; null: a click on a picture opens it large. */
  path: PathMarks | null;
  onPick: (step: ViewStep) => void;
  onHover: (id: string | null) => void;
  /** A picture clicked: its node (open it large, or add it to the path). */
  onOpen: (node: string) => void;
  /** The tree's talk (lib/tree-talk.ts), drawn as the Tal chip on A1; none: no chip (an older lab server). */
  talk?: TreeTalk | null;
  /** The Tal panel is open. */
  talkOn?: boolean;
  onTalk?: () => void;
  /** The seat the tree is seen from when not the straight camera's (view is then that camera's, cameraView); null: the straight one. */
  camera?: number | null;
};

export function TreeCanvas({ view, layout, media, active, hover, sheetOpen, path, onPick, onHover, onOpen, talk = null, talkOn = false, onTalk, camera = null }: TreeCanvasProps) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const { getViewport, setViewport } = useReactFlow();
  const fit = useFitMap(layout, false, CAMERA_RAIL_SPACE);

  // Fit when the map is first sized, when the tree's shape changes and when the window is resized.
  const fitted = useRef("");
  useEffect(() => {
    const key = `${view.tree.id}:${layout.width}x${layout.height}@${width}x${height}`;
    if (!width || !height || fitted.current === key) return;
    fitted.current = key;
    fit(0);
  }, [fit, view.tree.id, layout.width, layout.height, width, height]);

  // With a panel open, the chosen step's chip is kept in sight: the view slides (same zoom) when it would lie under it.
  useEffect(() => {
    if (!sheetOpen || !active || !width) return;
    const line = layout.lines.find((x) => x.id === active);
    if (!line) return;
    const v = getViewport();
    const cx = line.chip.x * v.zoom + v.x;
    const free = width - SHEET_W;
    if (cx > 48 && cx < free - 48) return;
    void setViewport({ ...v, x: v.x + (free / 2 - PAD.side - cx) }, { duration: 280 });
  }, [sheetOpen, active, layout, width, getViewport, setViewport]);

  const steps = useMemo(() => new Map(view.steps.map((s) => [s.id, s])), [view.steps]);
  const lit = active ?? hover;
  const litNodes = useMemo(() => new Set(lit ? (layout.lines.find((l) => l.id === lit)?.nodes ?? []) : []), [lit, layout.lines]);

  const nodes = useMemo<Node[]>(() => {
    const pic = (node: string): Pic => {
      const n = view.nodes.find((x) => x.node === node) ?? null;
      return { node: n, entry: n?.entry ? (media.get(n.entry) ?? null) : null };
    };
    const act: Act = { picking: !!path, onOpen, none: camera ? `ingen bild från kamera ${camera}` : "ingen bild i trädet" };
    const shot = (node: string): Shot => {
      const p = pic(node), mark = path?.at.get(node) ?? null;
      return path ? { node, pic: p, can: path.next.has(node), mark, off: !mark && !path.next.has(node) } : { node, pic: p, can: !!p.entry, mark: null, off: false };
    };
    // The other anchors at the shoe say which steps they give (Casino: A2.2 gives A3P6C1).
    const gives = (node: string) => view.steps.filter((s) => s.via === node).map((s) => nodeCode(s.card ?? s.to));
    // The film the round opens with, by its name in Material (none while Material loads, never its id).
    const opening = view.tree.opening ? (media.get(view.tree.opening)?.name ?? null) : null;
    return layout.boxes.map((b): Node => {
      const base = { id: b.id, position: { x: b.box.x, y: b.box.y }, width: b.box.w, height: b.box.h, draggable: false, selectable: false, connectable: false, focusable: false, deletable: false };
      const dim = !!active && !litNodes.has(b.id);
      if (b.kind === "plats" || b.kind === "dealer") return { ...base, type: "cards", data: { box: b, shots: b.cards.map((c) => shot(c.card)), act, dim } } satisfies CardsNodeType;
      const given = b.kind === "annan" ? gives(b.node!) : [];
      const note = b.kind === "annan" ? (given.length ? `ger ${given.join(", ")}` : "ger inget steg") : b.kind === "vila" && opening ? `början: ${opening}` : null;
      const said = b.kind === "vila" && talk && onTalk ? { have: talk.have, total: talk.total, on: talkOn, onOpen: onTalk } : null;
      return { ...base, type: "picture", data: { box: b, shot: shot(b.node!), act, dim, note, label: nodeCode(b.node!), talk: said } } satisfies PictureNodeType;
    });
  }, [layout, view, media, active, litNodes, path, onOpen, talk, talkOn, onTalk, camera]);

  const edges = useMemo<Edge[]>(() => {
    const rails: RailEdgeType[] = layout.rails.map((rail) => ({ id: rail.id, source: view.hub, target: "P1", type: "rail", data: { rail }, selectable: false, focusable: false, deletable: false }));
    // While a path is picked, the lines that are not its steps, nor a way on from its last node, fade.
    const away = (step: ViewStep) => !!path?.last && !path.steps.has(step.id) && step.from !== path.last;
    const lines = layout.lines.flatMap((line): StepEdgeType[] => {
      const step = steps.get(line.id);
      if (!step) return [];
      const marked = !!path?.steps.has(line.id);
      return [{
        id: line.id, source: line.nodes[0], target: line.nodes[line.nodes.length - 1], type: "step", selectable: false, focusable: false, deletable: false,
        data: { line, step, active: active === line.id, hover: hover === line.id, marked, dim: active ? active !== line.id : away(step), ghost: !!camera && step.state === "saknas", onPick, onHover },
      }];
    }).sort((a, b) => Number(a.id === lit || !!a.data?.marked) - Number(b.id === lit || !!b.data?.marked)); // the chosen step and the path drawn last, over the others
    return [...rails, ...lines];
  }, [layout, view.hub, steps, active, hover, lit, path, onPick, onHover, camera]);

  // A step nothing is made for from another camera opens nothing.
  const open = (id: string) => {
    const s = steps.get(id);
    return s && !(camera && s.state === "saknas") ? s : null;
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode="dark"
      minZoom={0.25}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      onEdgeClick={(_, e) => { const s = e.type === "step" ? open(e.id) : null; if (s) onPick(s); }}
      onEdgeMouseEnter={(_, e) => e.type === "step" && open(e.id) && onHover(e.id)}
      onEdgeMouseLeave={() => onHover(null)}
      style={{ background: "var(--color-canvas)" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="#1b2420" />
    </ReactFlow>
  );
}

/** The tree map's legend in one line: what a line says. */
export function TreeLegend({ className }: { className?: string }) {
  const sample = (color: string, dash?: string) => (
    <svg width="26" height="6" aria-hidden className="shrink-0">
      <path d="M1,3 H25" stroke={color} strokeWidth={2.25} strokeDasharray={dash} />
    </svg>
  );
  return (
    <div className={cn("pointer-events-none flex items-center gap-3 whitespace-nowrap rounded-md border border-line bg-surface/92 px-3 py-1.5 text-[11.5px] text-dim shadow-pop backdrop-blur-sm", className)}>
      <span className="inline-flex items-center gap-1.5">{sample(LINE.godkand)} finns</span>
      <span className="inline-flex items-center gap-1.5">{sample(STEP_LINE.prov.color, STEP_LINE.prov.dash)} prov</span>
      <span className="inline-flex items-center gap-1.5">{sample(STEP_LINE.saknas.color, STEP_LINE.saknas.dash)} saknas</span>
      <span aria-hidden className="h-3 w-px bg-line-strong" />
      <span>Klicka ett steg eller en bild</span>
    </div>
  );
}
