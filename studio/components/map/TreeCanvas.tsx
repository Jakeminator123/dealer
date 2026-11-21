"use client";

// One tree drawn (React Flow): its anchors and every card as pictures from Material (media first), a node without a picture
// as an empty box with its name; its 36 steps as lines, solid in the verdict's colour where a film is (finns), dashed grey
// where a film or a delivered order waits for a verdict (prov), red and dotted where nothing is (saknas). A step's chip opens
// it: a step with a film its films (EdgeSheet), another what an order of it has and lacks (StepOrder). Little text: the short
// names (A1, A2.3, A3P4C2) on the pictures, the rest in each chip's title. Geometry: lib/map-layout.ts treeLayout.
import "@xyflow/react/dist/style.css";
import { Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, ReactFlow, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { ImageOff } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { nodeCode, type TreeNode, type TreeView, type ViewStep } from "../../../src/dealer-trees.ts";
import { cn } from "@/components/ui";
import type { Dir, TreeBox, TreeLayout, TreeLine } from "@/lib/map-layout";
import type { EntryAnswer } from "@/lib/media";
import { VERDICT_LABEL } from "@/lib/verdict";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";
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
  const sent = s.deliveries.length ? `; levererad: ${s.deliveries.join(", ")}` : "";
  return `${s.name}: ${STATE_WORD[s.state]}${said}${sent}`;
}

const PAD = { side: 20 };
const ARROW: Record<Dir, number> = { down: 90, up: -90, right: 0, left: 180 };
const ARROW_PATH = "M0,0 L-8,-4.5 L-8,4.5 Z";

// ── Nodes ───────────────────────────────────────────────────────────────────
type Pic = { node: TreeNode | null; entry: EntryAnswer | null };
type PictureData = { box: TreeBox; pic: Pic; dim: boolean; note: string | null; label: string };
type CardsData = { box: TreeBox; pics: Pic[]; dim: boolean };
type PictureNodeType = Node<PictureData, "picture">;
type CardsNodeType = Node<CardsData, "cards">;

/** A picture of Material, or an empty box with the node's name when the tree has none for it. */
function Picture({ pic, code, small = false }: { pic: Pic; code: string; small?: boolean }) {
  const cover = pic.entry ? coverOfEntry(pic.entry) : null;
  const state = pic.node?.state && pic.node.state !== "gäller" ? pic.node.state : null;
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden rounded-md", cover ? "border border-line-strong bg-well" : "border border-dashed border-line-strong bg-transparent")}
      title={pic.node?.entry ? `${code}: ${pic.entry?.name ?? pic.node.entry}${state ? ` (${state} i Material)` : ""}` : `${code}: ingen bild i trädet`}
    >
      {cover ? (
        <ProofStill cover={cover} fps={pic.entry?.fps ?? 30} className={cn("absolute inset-0", (state === "ersatt" || state === "arkiverad") && "saturate-[0.7]")} />
      ) : pic.node?.entry ? (
        <span className="absolute inset-0 grid place-items-center text-faint">
          <ImageOff className="size-4" aria-hidden />
        </span>
      ) : null}
      <span
        className={cn(
          "pointer-events-none absolute left-1 top-1 rounded-xs px-1 font-semibold leading-[15px] tracking-[0.01em]",
          cover ? "bg-black/65 text-ink backdrop-blur-sm" : "text-dim",
          small ? "text-[10px]" : "text-[12px]",
        )}
      >
        {code}
      </span>
      {state ? (
        <span className="pointer-events-none absolute right-1 top-1 rounded-xs bg-black/65 px-1 text-[10px] leading-[15px] text-faint backdrop-blur-sm" aria-label={state}>
          {small ? (state === "kandidat" ? "◐" : "↺") : state}
        </span>
      ) : null}
    </div>
  );
}

function PictureNode({ data }: NodeProps<PictureNodeType>) {
  const { box, pic, dim, note, label } = data;
  return (
    <div style={{ width: box.box.w, height: box.box.h }} className={cn("relative transition-opacity duration-150", dim && "opacity-40")} aria-label={label}>
      <Hooks />
      <Picture pic={pic} code={box.node ? nodeCode(box.node) : ""} small={box.kind === "halkort"} />
      {note ? <span className="pointer-events-none absolute -bottom-4 left-0 whitespace-nowrap text-[10.5px] leading-4 text-faint">{note}</span> : null}
    </div>
  );
}

function CardsNode({ data }: NodeProps<CardsNodeType>) {
  const { box, pics, dim } = data;
  return (
    <div style={{ width: box.box.w, height: box.box.h }} className={cn("relative rounded-lg border border-line bg-surface/80 transition-opacity duration-150", dim && "opacity-40")}>
      <Hooks />
      {box.cards.map((c, k) => (
        <div key={c.card} className="absolute" style={{ left: c.box.x - box.box.x, top: c.box.y - box.box.y, width: c.box.w, height: c.box.h }}>
          <Picture pic={pics[k]} code={nodeCode(c.card)} small />
        </div>
      ))}
    </div>
  );
}

// ── Lines ───────────────────────────────────────────────────────────────────
type StepData = { line: TreeLine; step: ViewStep; active: boolean; hover: boolean; dim: boolean; onPick: (s: ViewStep) => void; onHover: (id: string | null) => void };
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
        <span aria-hidden className="size-4 rounded-full border border-dashed border-underkand" />
      ) : (
        <PlayDot tag={{ kind: "take", verdict: step.state === "finns" ? (step.verdict ?? "godkand") : "vantar", byJakob: step.state === "finns" ? step.byJakob : false }} />
      )}
    </button>
  );
}

function StepEdge({ id, data }: EdgeProps<StepEdgeType>) {
  if (!data) return null;
  const { line, step, active, hover, dim, onPick, onHover } = data;
  const color = lineColor(step);
  const lit = active || hover;
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
export type TreeCanvasProps = {
  view: TreeView;
  layout: TreeLayout;
  media: ReadonlyMap<string, EntryAnswer>;
  /** The step whose panel is open. */
  active: string | null;
  hover: string | null;
  sheetOpen: boolean;
  onPick: (step: ViewStep) => void;
  onHover: (id: string | null) => void;
};

export function TreeCanvas({ view, layout, media, active, hover, sheetOpen, onPick, onHover }: TreeCanvasProps) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const { getViewport, setViewport } = useReactFlow();
  const fit = useFitMap(layout, false);

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
    // The other anchors at the shoe say which steps they give (Casino: A2.2 gives A3P6C1).
    const gives = (node: string) => view.steps.filter((s) => s.via === node).map((s) => nodeCode(s.card ?? s.to));
    return layout.boxes.map((b): Node => {
      const base = { id: b.id, position: { x: b.box.x, y: b.box.y }, width: b.box.w, height: b.box.h, draggable: false, selectable: false, connectable: false, focusable: false, deletable: false };
      const dim = !!active && !litNodes.has(b.id);
      if (b.kind === "plats" || b.kind === "dealer") return { ...base, type: "cards", data: { box: b, pics: b.cards.map((c) => pic(c.card)), dim } } satisfies CardsNodeType;
      const given = b.kind === "annan" ? gives(b.node!) : [];
      const note = b.kind === "annan" ? (given.length ? `ger ${given.join(", ")}` : "ger inget steg") : b.kind === "vila" && view.tree.opening ? `början: ${media.get(view.tree.opening)?.name ?? view.tree.opening}` : null;
      return { ...base, type: "picture", data: { box: b, pic: pic(b.node!), dim, note, label: nodeCode(b.node!) } } satisfies PictureNodeType;
    });
  }, [layout, view, media, active, litNodes]);

  const edges = useMemo<Edge[]>(() => {
    const rails: RailEdgeType[] = layout.rails.map((rail) => ({ id: rail.id, source: view.hub, target: "P1", type: "rail", data: { rail }, selectable: false, focusable: false, deletable: false }));
    const lines = layout.lines.flatMap((line): StepEdgeType[] => {
      const step = steps.get(line.id);
      if (!step) return [];
      return [{
        id: line.id, source: line.nodes[0], target: line.nodes[line.nodes.length - 1], type: "step", selectable: false, focusable: false, deletable: false,
        data: { line, step, active: active === line.id, hover: hover === line.id, dim: !!active && active !== line.id, onPick, onHover },
      }];
    }).sort((a, b) => Number(a.id === lit) - Number(b.id === lit)); // the chosen step drawn last, over the others
    return [...rails, ...lines];
  }, [layout, view.hub, steps, active, hover, lit, onPick, onHover]);

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
      onEdgeClick={(_, e) => { const s = e.type === "step" ? steps.get(e.id) : null; if (s) onPick(s); }}
      onEdgeMouseEnter={(_, e) => e.type === "step" && onHover(e.id)}
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
      <span>Klicka ett steg</span>
    </div>
  );
}
