"use client";

// The node map's nodes: an anchor (A1, A2.1, A2.2, Borta, DC2 upp), a seat with its two cards C1 and C2, the dealer with
// DC1, DC2 and the optional DC3. Their size and their fields' places come from lib/map-layout.ts; the lines are edges.
// A click on a seat (or an anchor) shows only its films; a second click shows all again.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import type { EdgeInfo } from "@/lib/edge-stats";
import type { Box, Field } from "@/lib/map-layout";
import { REACH_LIMIT } from "@/lib/map-layout";
import { CountSigns } from "./EdgeChip";
import { restLine } from "./rest.ts";

type Common = {
  box: Box;
  /** Chosen: only its films are shown. */
  focus: boolean;
  /** Set back: something else is chosen. */
  dim: boolean;
  onFocus: () => void;
  label: string;
};
export type SeatData = Common & { seat: string; fields: Field[]; mode: "SEAT" | "CARD"; reach: number | null; filled: number; of: number };
export type DealerData = Common & { fields: Field[]; filled: number; of: number };
export type HubData = Common & {
  node: string;
  code: string;
  word: string;
  /** A second line: A2.2's count of takes that start there. */
  note?: string | null;
  /** A1 carries its own idle loop as a chip. */
  loop?: (EdgeInfo & { active: boolean; dim: boolean; onPick: () => void }) | null;
};
export type SeatNodeType = Node<SeatData, "seat">;
export type DealerNodeType = Node<DealerData, "dealer">;
export type HubNodeType = Node<HubData, "hub">;

// Every edge needs a handle to hang on; the lines themselves are drawn from the layout, so the handles stay invisible.
function Hooks() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} className="!pointer-events-none !size-px !min-h-0 !min-w-0 !border-0 !opacity-0" />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!pointer-events-none !size-px !min-h-0 !min-w-0 !border-0 !opacity-0" />
    </>
  );
}

function Frame({ data, className, children }: { data: Common; className?: string; children: ReactNode }) {
  return (
    <div
      style={{ width: data.box.w, height: data.box.h }}
      className={cn(
        "relative rounded-lg border bg-surface shadow-[0_6px_18px_-8px_rgb(0_0_0/0.7)] transition-[opacity,border-color,box-shadow] duration-150",
        data.focus ? "border-brass/80 shadow-[0_0_0_1px_rgb(217_185_106/0.45),0_6px_18px_-8px_rgb(0_0_0/0.7)]" : "border-line-strong",
        data.dim && "opacity-40",
        className,
      )}
    >
      <Hooks />
      {children}
    </div>
  );
}

// The node's own button (the whole node): keyboard and screen readers reach it like any button.
function Pick({ data }: { data: Common }) {
  return (
    <button
      type="button"
      aria-pressed={data.focus}
      aria-label={data.label}
      title={data.focus ? "Visa alla filmer igen" : "Visa bara de här filmerna"}
      onClick={data.onFocus}
      className="nodrag nopan absolute inset-0 rounded-lg focus-visible:outline-offset-2"
    />
  );
}

const fill = (filled: number, of: number) => (
  <span className={cn("text-[11px] tabular-nums", filled === of ? "text-faint" : "text-[#ef8b8b]")} title={`${filled} av ${of} filmer spelar något`}>
    {filled}/{of}
  </span>
);

function FieldBox({ field, node, children, className }: { field: Field; node: Box; children: ReactNode; className?: string }) {
  return (
    <div
      style={{ left: field.box.x - node.x, top: field.box.y - node.y, width: field.box.w, height: field.box.h }}
      className={cn("pointer-events-none absolute flex flex-col justify-center rounded-md px-1.5", className)}
    >
      {children}
    </div>
  );
}

export function SeatNode({ data }: NodeProps<SeatNodeType>) {
  const [c1, c2] = data.fields;
  const far = data.reach !== null && data.reach > REACH_LIMIT;
  return (
    <Frame data={data}>
      <Pick data={data} />
      <div className="pointer-events-none absolute inset-x-2 top-1 flex items-baseline justify-between">
        <span className="font-display text-[14px] font-semibold text-ink">{data.seat}</span>
        {fill(data.filled, data.of)}
      </div>
      <FieldBox field={c1} node={data.box} className="items-center border border-line bg-raised">
        <span className="text-[12px] font-semibold text-ink">C1</span>
      </FieldBox>
      {data.mode === "CARD" ? (
        <FieldBox field={c2} node={data.box} className="items-center border border-line bg-raised">
          <span className="text-[12px] font-semibold text-ink">C2</span>
        </FieldBox>
      ) : (
        <FieldBox field={c2} node={data.box} className="items-stretch gap-[5px] border border-dashed border-line-strong px-1.5">
          <span className="flex items-center justify-between gap-1 text-[11px] leading-none">
            <b className="font-semibold text-ink">C2</b>
            <span className={cn("inline-flex items-center gap-px whitespace-nowrap tabular-nums", far ? "font-medium text-[#f0b07a]" : "text-faint")}>
              {far ? <TriangleAlert className="size-2.5" aria-label="över 50 px" /> : null}
              {data.reach === null ? "flytt ?" : `+${data.reach} px`}
            </span>
          </span>
          <span className="whitespace-nowrap text-[10px] leading-none tracking-[-0.01em] text-dim">delar C1:s film</span>
        </FieldBox>
      )}
    </Frame>
  );
}

export function DealerNode({ data }: NodeProps<DealerNodeType>) {
  const word = (card: string) => (card === "D.C2" ? "stängt" : card === "D.C3" ? "valfri" : "öppet");
  return (
    <Frame data={data}>
      <Pick data={data} />
      <div className="pointer-events-none absolute inset-x-2 top-1 flex items-baseline justify-between">
        <span className="font-display text-[14px] font-semibold text-ink">Dealer</span>
        {fill(data.filled, data.of)}
      </div>
      {data.fields.map((f) => (
        <FieldBox key={f.card} field={f} node={data.box} className={cn("flex-row items-center justify-center gap-1.5 border bg-raised", f.optional ? "border-dashed border-line opacity-60" : "border-line")}>
          <span className="text-[12px] font-semibold text-ink">{f.card.replace(".", "")}</span>
          <span className="text-[10.5px] text-faint">{word(f.card)}</span>
        </FieldBox>
      ))}
    </Frame>
  );
}

export function HubNode({ data }: NodeProps<HubNodeType>) {
  const loop = data.loop;
  return (
    <Frame data={data} className={data.node === "READY" || data.node === "IDLE" ? "bg-[#151c18]" : undefined}>
      <Pick data={data} />
      <div className="pointer-events-none absolute inset-x-2.5 top-1.5 flex items-baseline gap-1.5">
        <span className="whitespace-nowrap font-display text-[15px] font-semibold text-ink">{data.code}</span>
        {data.word ? <span className="truncate text-[11.5px] text-dim">{data.word}</span> : null}
      </div>
      {data.note ? <span className="pointer-events-none absolute bottom-1.5 left-2.5 text-[10.5px] text-faint">{data.note}</span> : null}
      {loop ? (
        // The rest step lives inside A1: its twenty films (the calm loop and the gestures) behind one button that says so.
        <button
          type="button"
          onClick={loop.onPick}
          aria-pressed={loop.active}
          aria-label={`${restLine(loop.counts.total)}: ${loop.title}. Öppna vilans filmer.`}
          title={`${restLine(loop.counts.total)}: den lugna loopen och gesterna som slumpas in. Klicka för filmerna.`}
          className={cn(
            // Two short rows under A1's name: what it is, then the counts (one row is too narrow for both).
            "nodrag nopan absolute inset-x-1.5 bottom-1.5 top-[27px] flex flex-col justify-center gap-[3px] overflow-hidden whitespace-nowrap rounded-md border bg-raised px-2 text-left text-[10.5px] font-medium leading-none text-ink transition-[border-color,opacity] duration-150 hover:border-[#4a5a51]",
            loop.active ? "border-brass shadow-[0_0_0_2px_rgb(217_185_106/0.35)]" : "border-line-strong",
            loop.dim && "opacity-25",
          )}
        >
          <span className="flex items-center gap-1">
            <RefreshCw aria-hidden className="size-3 shrink-0 text-faint" />
            {restLine(loop.counts.total)}
          </span>
          <CountSigns counts={loop.counts} className="pl-4 text-[10px]" />
        </button>
      ) : null}
    </Frame>
  );
}

export const nodeTypes = { seat: SeatNode, dealer: DealerNode, hub: HubNode };
