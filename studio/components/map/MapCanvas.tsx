"use client";

// The node map itself (React Flow): anchors and seats as nodes, films as lines with chips, pan and zoom. Everything is
// placed by lib/map-layout.ts; this file turns the layout and what each film plays into nodes and edges, and keeps the
// view fitted (the whole map in the free part of the window; with the side panel open, the chosen film kept in sight).
import "@xyflow/react/dist/style.css";
import { Background, BackgroundVariant, ReactFlow, useReactFlow, useStore, type Edge, type Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Graph } from "../../../src/clip-graph.ts";
import { edgeInfo, type EdgeInfo } from "@/lib/edge-stats";
import { seatReach, type MapLayout, type PlanPoints } from "@/lib/map-layout";
import { nodeCode } from "@/lib/names";
import { SHEET_W } from "./EdgeSheet";
import { experimentLines } from "./experiment-lines.ts";
import { edgeTypes, type ExperimentEdgeType, type FilmEdgeType, type RailEdgeType } from "./MapEdges";
import { nodeTypes, type DealerNodeType, type HubNodeType, type SeatNodeType } from "./MapNodes";

const HUB_WORD: Record<string, string> = { IDLE: "vila", READY: "nyp vid skon", "READY-B": "hand över", AWAY: "tomt bord", "REVEAL(D.C2)": "" };
const PAD = { top: 16, side: 20, bottom: 56 }; // the legend sits under the map

export type MapView = {
  graph: Graph;
  layout: MapLayout;
  infos: Map<string, EdgeInfo>;
  mode: "SEAT" | "CARD";
  points: PlanPoints;
  /** The film whose panel is open (on the map: the film it plays, for a seat's second card). */
  active: string | null;
  /** A seat or anchor chosen: only its films are shown. */
  focus: string | null;
  hover: string | null;
  sheetOpen: boolean;
  onPick: (id: string) => void;
  onFocus: (node: string | null) => void;
  onHover: (id: string | null) => void;
};

/** Fits the whole map into the free part of the canvas. */
export function useFitMap(layout: MapLayout, sheetOpen: boolean) {
  const { setViewport } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  return useCallback(
    (duration = 0) => {
      if (!width || !height) return;
      const right = PAD.side + (sheetOpen && width > SHEET_W + 640 ? SHEET_W : 0);
      const w = width - PAD.side - right;
      const h = height - PAD.top - PAD.bottom;
      const zoom = Math.max(0.3, Math.min(1.15, w / layout.width, h / layout.height));
      void setViewport({ x: PAD.side + (w - layout.width * zoom) / 2, y: PAD.top + (h - layout.height * zoom) / 2, zoom }, { duration });
    },
    [width, height, layout.width, layout.height, sheetOpen, setViewport],
  );
}

export function MapCanvas(view: MapView) {
  const { graph, layout, infos, mode, points, active, focus, hover, sheetOpen, onPick, onFocus, onHover } = view;
  const zoom = useStore((s) => s.transform[2]);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const { getViewport, setViewport } = useReactFlow();
  const fit = useFitMap(layout, false);

  // Fit when the map is first sized, when the layout changes (mode, plan) and when the window is resized.
  const fitted = useRef("");
  useEffect(() => {
    const key = `${layout.width}x${layout.height}@${width}x${height}`;
    if (!width || !height || fitted.current === key) return;
    fitted.current = key;
    fit(0);
  }, [fit, layout.width, layout.height, width, height]);

  // When the whole map only fits far out (one film per card), a chosen seat is brought close enough to read; letting it
  // go fits the whole map again.
  const near = useRef(false);
  useEffect(() => {
    if (!width || !height) return;
    const whole = Math.min((width - 2 * PAD.side) / layout.width, (height - PAD.top - PAD.bottom) / layout.height);
    const n = focus ? layout.nodes.find((x) => x.id === focus) : null;
    if (n && whole < 0.85 && (n.type === "seat" || n.type === "dealer")) {
      near.current = true;
      const free = sheetOpen ? width - SHEET_W : width;
      const zoom = 1.05;
      // The whole height when it fits (both rails and the anchors stay in sight), else centred on the seat.
      const cy = layout.height * zoom <= height - PAD.top - PAD.bottom ? layout.height / 2 : n.box.y + n.box.h / 2;
      void setViewport({ x: free / 2 - (n.box.x + n.box.w / 2) * zoom, y: (height - PAD.bottom + PAD.top) / 2 - cy * zoom, zoom }, { duration: 300 });
    } else if (!n && near.current) {
      near.current = false;
      fit(300);
    }
  }, [focus, layout, width, height, sheetOpen, setViewport, fit]);

  // With the panel open, the chosen film is kept in sight: the view slides (same zoom) when its chip would be under it.
  useEffect(() => {
    if (!sheetOpen || !active || !width) return;
    const e = layout.edges.find((x) => x.id === active);
    if (!e?.label) return;
    const v = getViewport();
    const cx = (e.label.x + e.label.w / 2) * v.zoom + v.x;
    const free = width - SHEET_W;
    if (cx > 48 && cx < free - 48) return;
    void setViewport({ ...v, x: v.x + (free / 2 - cx) }, { duration: 280 });
  }, [sheetOpen, active, layout, width, getViewport, setViewport]);

  const lit = active ?? hover;
  const inFocus = useCallback(
    (id: string, nodes: string[]) => !focus || nodes.includes(focus) || (focus === "READY-B" && (graph.edge[id]?.hubVariants.length ?? 0) > 0),
    [focus, graph],
  );

  const nodes = useMemo<Node[]>(() => {
    const touched = new Set(layout.edges.filter((e) => inFocus(e.id, e.nodes)).flatMap((e) => e.nodes));
    const filled = (cards: string[]) => {
      const ids = layout.edges.filter((e) => cards.some((c) => e.id.includes(c)) && e.id !== "IDLE>REVEAL(D.C2)").map((e) => e.id);
      return { filled: ids.filter((id) => infos.get(id)?.now.take).length, of: ids.length };
    };
    return layout.nodes.map((n): Node => {
      const base = {
        id: n.id,
        position: { x: n.box.x, y: n.box.y },
        width: n.box.w,
        height: n.box.h,
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        deletable: false,
      };
      const common = {
        box: n.box,
        focus: focus === n.id,
        dim: !!focus && focus !== n.id && !touched.has(n.id),
        onFocus: () => onFocus(focus === n.id ? null : n.id),
      };
      if (n.type === "seat") {
        const counted = filled(n.fields.filter((f) => f.drawn).map((f) => f.card));
        const node: SeatNodeType = {
          ...base,
          type: "seat",
          data: { ...common, ...counted, seat: n.seat, fields: n.fields, mode, reach: seatReach(points, n.seat), label: `${n.seat}, spelare ${n.seat.slice(1)}: ${counted.filled} av ${counted.of} filmer spelar. Visa bara platsens filmer.` },
        };
        return node;
      }
      if (n.type === "dealer") {
        const counted = filled(["D.C1", "D.C2"]);
        const node: DealerNodeType = { ...base, type: "dealer", data: { ...common, ...counted, fields: n.fields, label: `Dealern: ${counted.filled} av ${counted.of} filmer spelar. Visa bara dealerns filmer.` } };
        return node;
      }
      const loopInfo = n.node === "IDLE" ? infos.get("IDLE>IDLE") : null;
      const starts = n.node === "READY-B" ? Object.values(graph.takes).filter((t) => t.hub).length : 0;
      const node: HubNodeType = {
        ...base,
        type: "hub",
        data: {
          ...common,
          node: n.node,
          code: nodeCode(n.node),
          word: HUB_WORD[n.node] ?? "",
          note: n.node === "READY-B" ? `${starts} ${starts === 1 ? "tagning startar" : "tagningar startar"} här` : n.node === "REVEAL(D.C2)" ? "hålkortet vänt upp" : null,
          loop: loopInfo ? { ...loopInfo, active: active === "IDLE>IDLE", dim: !!focus && focus !== "IDLE", onPick: () => onPick("IDLE>IDLE") } : null,
          label: `${nodeCode(n.node)} ${HUB_WORD[n.node] ?? ""}: visa bara filmerna hit och härifrån.`,
        },
      };
      return node;
    });
  }, [layout, infos, focus, inFocus, mode, points, graph, active, onFocus, onPick]);

  const edges = useMemo<Edge[]>(() => {
    const rails: RailEdgeType[] = layout.rails.map((rail) => ({ id: rail.id, source: rail.id === "rail-ready" ? "READY" : "IDLE", target: "P1", type: "rail", data: { rail }, selectable: false, focusable: false, deletable: false }));
    const films: FilmEdgeType[] = layout.edges
      .filter((e) => e.path && infos.get(e.id))
      .map((e): FilmEdgeType => {
        const shown = inFocus(e.id, e.nodes);
        return {
          id: e.id,
          source: e.nodes[0],
          target: e.nodes[e.nodes.length - 1],
          type: "film",
          selectable: false,
          focusable: false,
          deletable: false,
          data: {
            layout: e,
            info: infos.get(e.id)!,
            active: active === e.id,
            hover: hover === e.id,
            hidden: !shown,
            dim: shown && !!active && active !== e.id && !focus,
            // Far out, a chip shows only what plays; the counts come back when zoomed in.
            compact: zoom < 0.75,
            onPick,
            onHover,
          },
        };
      })
      // The chosen film is drawn last, over the others.
      .sort((a, b) => Number(a.id === lit) - Number(b.id === lit));
    // Experiment steps between anchors the map shows (A1 ↔ A2.2), dashed; the other experiments stay in the tray.
    const trials: ExperimentEdgeType[] = experimentLines(layout, graph.experiments).flatMap((line): ExperimentEdgeType[] => {
      const info = edgeInfo(graph, line.id);
      if (!info) return [];
      const shown = inFocus(line.id, line.nodes);
      return [{ id: line.id, source: line.nodes[0], target: line.nodes[1], type: "experiment", selectable: false, focusable: false, deletable: false,
        data: { line, info, active: active === line.id, hover: hover === line.id, hidden: !shown, dim: shown && !!active && active !== line.id && !focus, onPick, onHover } }];
    });
    return [...rails, ...trials, ...films];
  }, [layout, infos, inFocus, active, hover, focus, zoom, lit, onPick, onHover, graph]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode="dark"
      minZoom={0.3}
      maxZoom={2.2}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      onEdgeClick={(_, e) => (e.type === "film" || e.type === "experiment") && onPick(e.id)}
      onEdgeMouseEnter={(_, e) => (e.type === "film" || e.type === "experiment") && onHover(e.id)}
      onEdgeMouseLeave={() => onHover(null)}
      onPaneClick={() => onFocus(null)}
      style={{ background: "var(--color-canvas)" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="#1b2420" />
    </ReactFlow>
  );
}
