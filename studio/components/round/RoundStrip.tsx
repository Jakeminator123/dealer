"use client";

// <RoundStrip segments={segments} parts={parts} clock={clock} onCue={(step) => …} />: the round under the stage, one box
// per step: a still of the take, the edge in Jakob's words ("A2.1 → P4C1"), the take's short name, its verdict chip and
// why it plays. The step on screen is marked and kept in view; a click cues that step. A step with a note from the bank
// (a seam, an unknown landing) says so; a step without a film is drawn as a gap.
import { memo, useEffect, useRef } from "react";
import { GAP_LABEL, WHY_LABEL, type Segment } from "../../../src/clip-graph.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { edgeName, takeName } from "../../lib/names.ts";
import { lastFrame, type PlayPart } from "../../lib/parts.ts";
import { TakeChip, TakeThumb } from "../takes";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/Tooltip";
import { useClock, type Clock } from "../stage/clock.ts";

export function RoundStrip({
  segments,
  parts,
  clock,
  onCue,
  className,
}: {
  segments: Segment[];
  parts: PlayPart[];
  clock?: Clock | null;
  onCue(step: number): void;
  className?: string;
}) {
  const current = useClock(clock, (s) => s.pos?.step ?? -1);
  const scroller = useRef<HTMLDivElement>(null);
  // The step on screen stays in view.
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-step="${current}"]`);
    if (!box || !el) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left >= box.scrollLeft + 12 && right <= box.scrollLeft + box.clientWidth - 12) return;
    box.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
  }, [current]);
  return (
    <div
      ref={scroller}
      aria-label="Rundans steg"
      className={cn("relative flex shrink-0 gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:thin]", className)}
    >
      {segments.map((seg, i) => (
        <StepBox key={i} index={i} seg={seg} part={parts[i]} active={i === current} clock={clock} onCue={onCue} />
      ))}
    </div>
  );
}

// The frame a box shows: where a deal lands (its last frame played), the middle of anything else.
const stillOf = (part: PlayPart, seg: Segment) => (seg.kind === "DEAL" ? lastFrame(part) : Math.round((part.start + lastFrame(part)) / 2));

const StepBox = memo(function StepBox({
  index,
  seg,
  part,
  active,
  clock,
  onCue,
}: {
  index: number;
  seg: Segment;
  part: PlayPart | undefined;
  active: boolean;
  clock?: Clock | null;
  onCue(step: number): void;
}) {
  const bank = useOptionalBank();
  const take = seg.take;
  const edge = edgeName({ from: seg.from, to: seg.to });
  const notes = seg.notes.filter(Boolean);
  const seam = notes.some((n) => n.startsWith("Skarv"));
  const frame = "rounded-lg border text-left transition-[border-color,background-color] duration-150";

  if (!take || !part?.path) {
    return (
      <button
        type="button"
        data-step={index}
        aria-current={active ? "step" : undefined}
        onClick={() => onCue(index)}
        className={cn(
          frame,
          "flex w-44 shrink-0 flex-col justify-center gap-0.5 border-dashed px-3 py-1.5",
          active ? "border-underkand/70 bg-underkand/8" : "border-underkand/35 bg-transparent hover:border-underkand/60",
        )}
      >
        <span className="text-2xs font-medium uppercase tracking-[0.08em] text-faint">Steg {index + 1} · lucka</span>
        <span className="text-sm font-semibold text-ink">{edge}</span>
        <span className="text-xs text-[#ef8b8b]">Ingen film: {GAP_LABEL[seg.gap ?? "MISSING"]}</span>
      </button>
    );
  }

  const siblings = bank?.graph?.edge[take.edge]?.takes;
  return (
    <button
      type="button"
      data-step={index}
      aria-current={active ? "step" : undefined}
      onClick={() => onCue(index)}
      className={cn(
        frame,
        "group relative flex w-[244px] shrink-0 items-stretch gap-2.5 p-1",
        active ? "border-brass/70 bg-brass/[0.07] shadow-[0_0_0_1px_rgb(217_185_106/0.25)]" : "border-line bg-surface hover:border-line-strong hover:bg-raised",
      )}
    >
      <TakeThumb take={take} still="film" frame={stillOf(part, seg)} className="w-[104px] shrink-0 rounded-[5px]">
        <span className="pointer-events-none absolute left-1 top-1 rounded-xs bg-black/65 px-1.5 py-px text-2xs font-semibold text-ink tabular-nums backdrop-blur-sm">
          {index + 1}
        </span>
        {active ? <Progress clock={clock} part={part} /> : null}
      </TakeThumb>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-px pr-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold text-ink">{edge}</span>
          {notes.length ? (
            <Tooltip content={<span className="whitespace-pre-line">{notes.join("\n")}</span>} side="top">
              <span
                className={cn(
                  "ml-auto shrink-0 rounded-full border px-1.5 text-2xs font-medium leading-4",
                  seam ? "border-anmarkning/45 bg-anmarkning/15 text-[#f0b07a]" : "border-line-strong bg-overlay text-dim",
                )}
              >
                {seam ? "Skarv" : "Obs"}
              </span>
            </Tooltip>
          ) : null}
        </span>
        <span className="truncate text-xs text-dim">{takeName(take, siblings)}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <TakeChip take={take} size="sm" />
        </span>
        <span className={cn("truncate text-2xs", seg.why === "LOCKED" ? "text-brass-hi/90" : "text-faint")}>{WHY_LABEL[seg.why]}</span>
      </span>
    </button>
  );
});

function Progress({ clock, part }: { clock?: Clock | null; part: PlayPart }) {
  const share = useClock(clock, (s) => (s.pos?.step === part.step ? (s.pos.frame - part.start) / Math.max(1, lastFrame(part) - part.start) : 0));
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
      <span className="block h-full bg-brass" style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
    </span>
  );
}
