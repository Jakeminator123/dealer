"use client";

// The node map's lines. A film: its own short line between a card and an anchor's rail (lib/map-layout.ts), coloured by
// what plays on it, with its chip on it (EdgeChip); chosen or under the pointer, the whole way along the rail to the
// anchor is drawn too. A rail: an anchor's line that the films hang on (A2.1's, A1's), with its name.
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import type { EdgeInfo } from "@/lib/edge-stats";
import type { Dir, MapEdge, Rail } from "@/lib/map-layout";
import { EdgeChip, lineOf } from "./EdgeChip";

export type FilmData = {
  layout: MapEdge;
  info: EdgeInfo;
  /** Its panel is open. */
  active: boolean;
  /** Under the pointer. */
  hover: boolean;
  /** Set back (another seat or film is chosen); hidden: only a seat's own films are shown and this is not one. */
  dim: boolean;
  hidden: boolean;
  compact: boolean;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
};
export type FilmEdgeType = Edge<FilmData, "film">;
export type RailData = { rail: Rail };
export type RailEdgeType = Edge<RailData, "rail">;

const ARROW: Record<Dir, number> = { down: 90, up: -90, right: 0, left: 180 };
const ARROW_PATH = "M0,0 L-8,-4.5 L-8,4.5 Z"; // points right; turned to the line's direction

export function FilmEdge({ id, data }: EdgeProps<FilmEdgeType>) {
  if (!data || !data.layout.path) return null;
  const { layout, info, active, hover, dim, hidden, compact, onPick, onHover } = data;
  const color = lineOf(info.tag);
  const gap = info.tag.kind === "gap";
  const lit = active || hover;
  const opacity = hidden ? 0.06 : dim ? 0.18 : 1;
  const label = layout.label;
  return (
    <>
      {lit ? <path d={layout.route} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" /> : null}
      <BaseEdge
        id={id}
        path={layout.path}
        interactionWidth={16}
        style={{ stroke: color, strokeWidth: lit ? 3.25 : gap ? 1.75 : 2.25, strokeDasharray: gap ? "5 4" : undefined, opacity, transition: "opacity 150ms, stroke-width 150ms" }}
      />
      <path d={ARROW_PATH} transform={`translate(${layout.arrow.x} ${layout.arrow.y}) rotate(${ARROW[layout.arrow.dir]})`} fill={color} opacity={opacity} />
      {label && !hidden ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute"
            style={{ transform: `translate(-50%, -50%) translate(${label.x + label.w / 2}px, ${label.y + label.h / 2}px)`, zIndex: lit ? 2 : 1 }}
            onPointerEnter={() => onHover(id)}
            onPointerLeave={() => onHover(null)}
          >
            <EdgeChip tag={info.tag} counts={info.counts} active={active} dim={dim} compact={compact} title={info.title} aria-label={info.title} aria-pressed={active} onClick={() => onPick(id)} />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export function RailEdge({ data }: EdgeProps<RailEdgeType>) {
  if (!data) return null;
  const { rail } = data;
  return (
    <g className="pointer-events-none">
      <path d={rail.path} fill="none" stroke="#33413a" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {rail.text ? (
        <text x={rail.text.x} y={rail.text.y} textAnchor={rail.text.anchor} className="fill-faint text-[10.5px] font-semibold uppercase tracking-[0.08em]">
          {rail.text.value}
        </text>
      ) : null}
    </g>
  );
}

export const edgeTypes = { film: FilmEdge, rail: RailEdge };
