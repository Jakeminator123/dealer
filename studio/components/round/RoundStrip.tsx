"use client";

// <RoundStrip segments={segments} parts={parts} clock={clock} onCue={(step) => …} />: the round under the stage, one box
// per step: a still of the take, the edge in Jakob's words ("A2.1 → P4C1"), the take's short name, its verdict chip and
// why it plays. The step on screen is marked and kept in view; a click cues that step. A step with a note from the bank
// (a seam, an unknown landing) says so; a step without a film is drawn as a gap. With film (a reference such as the V6
// film, lib/rounds.ts) the strip is one box: that film, "referens, inte i banken"; a reference with chapters (the old
// public page's whole deals) has one box per chapter ("P3C1 · plats 3 · kort 1"), and a click jumps there.
// Stills: a long round (all seats, 34 steps) reads only the stills of the boxes near where the strip rests (a box's own
// on-screen check also fires for every box the strip scrolls past while it follows the round, and the stills are drawn
// a few at a time in the order asked, so those passed boxes held up the ones in view). The thumbnails do not play the
// film under the pointer here: moving across the strip started a whole film's download per box.
import { memo, useEffect, useRef, useState } from "react";
import { GAP_LABEL, WHY_LABEL, type Segment } from "../../../src/clip-graph.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { edgeName, takeName } from "../../lib/names.ts";
import { lastFrame, type PlayPart } from "../../lib/parts.ts";
import type { Chapter, ReferenceFilm } from "../../lib/rounds.ts";
import { TakeChip, TakeThumb } from "../takes";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/Tooltip";
import { useClock, type Clock } from "../stage/clock.ts";
import { nearSteps, sameSet, stillOf } from "./strip";

/** How far beyond the strip's window a box still reads its still: about one box. */
const NEAR_PX = 260;
/** The strip is taken to rest when it has not scrolled for this long. */
const REST_MS = 140;

export function RoundStrip({
  segments,
  parts,
  film,
  clock,
  onCue,
  className,
}: {
  segments: Segment[];
  parts: PlayPart[];
  /** A reference film instead of the bank's steps: one box. */
  film?: ReferenceFilm | null;
  clock?: Clock | null;
  onCue(step: number): void;
  className?: string;
}) {
  const current = useClock(clock, (s) => s.pos?.step ?? -1);
  const scroller = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());
  const count = film ? parts.length : segments.length;

  // Which boxes are near the window, measured where the strip comes to rest (and at once on a new round or size).
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let timer = 0;
    const measure = () => {
      const places = [...box.querySelectorAll<HTMLElement>("[data-step]")].map((el) => ({ step: Number(el.dataset.step), left: el.offsetLeft, width: el.offsetWidth }));
      const next = nearSteps(box.scrollLeft, box.clientWidth, places, NEAR_PX);
      setNear((now) => (sameSet(now, next) ? now : next));
    };
    const rest = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, REST_MS);
    };
    measure();
    box.addEventListener("scroll", rest, { passive: true });
    const sized = new ResizeObserver(rest);
    sized.observe(box);
    return () => {
      window.clearTimeout(timer);
      box.removeEventListener("scroll", rest);
      sized.disconnect();
    };
  }, [count]);
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
      {film ? (
        film.chapters && parts.length > 1 ? (
          parts.map((part, i) => (
            <ChapterBox key={i} index={i} film={film} chapter={film.chapters![i]} part={part} active={current === i} clock={clock} load={near.has(i)} onCue={onCue} />
          ))
        ) : (
          <FilmBox film={film} part={parts[0]} active={current === 0} clock={clock} load={near.has(0)} onCue={onCue} />
        )
      ) : (
        segments.map((seg, i) => <StepBox key={i} index={i} seg={seg} part={parts[i]} active={i === current} clock={clock} load={near.has(i)} onCue={onCue} />)
      )}
    </div>
  );
}

/** The one box of a reference film: a still a third in, its name, and that it is not one of the bank's films. */
function FilmBox({ film, part, active, clock, load, onCue }: { film: ReferenceFilm; part: PlayPart | undefined; active: boolean; clock?: Clock | null; load: boolean; onCue(step: number): void }) {
  const thumb = { id: film.id, media: { video: film.path }, fps: film.fps, frames: film.frames, segment: null, landingFrame: null };
  return (
    <button
      type="button"
      data-step={0}
      aria-current={active ? "step" : undefined}
      onClick={() => onCue(0)}
      className={cn(
        "group relative flex w-[300px] shrink-0 items-stretch gap-2.5 rounded-lg border p-1 text-left transition-[border-color,background-color] duration-150",
        active ? "border-brass/70 bg-brass/[0.07] shadow-[0_0_0_1px_rgb(217_185_106/0.25)]" : "border-line bg-surface hover:border-line-strong hover:bg-raised",
      )}
    >
      <TakeThumb take={thumb} still="film" frame={Math.round(film.frames / 3)} scrub={false} load={load} className="w-[104px] shrink-0 rounded-[5px]">
        {active && part ? <Progress clock={clock} part={part} /> : null}
      </TakeThumb>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-px pr-1">
        <span className="truncate text-sm font-semibold text-ink">{film.name}</span>
        <span className="truncate text-xs text-dim">referens, inte i banken</span>
        <span className="truncate text-2xs text-faint">färdig film · spelas som den är</span>
      </span>
    </button>
  );
}

/** A chapter of a reference film: a still where its card lets go, the card in his notation, the seat in words. */
function ChapterBox({
  index,
  film,
  chapter,
  part,
  active,
  clock,
  load,
  onCue,
}: {
  index: number;
  film: ReferenceFilm;
  chapter: Chapter | undefined;
  part: PlayPart;
  active: boolean;
  clock?: Clock | null;
  load: boolean;
  onCue(step: number): void;
}) {
  const thumb = { id: film.id, media: { video: film.path }, fps: film.fps, frames: film.frames, segment: null, landingFrame: null };
  return (
    <button
      type="button"
      data-step={index}
      aria-current={active ? "step" : undefined}
      onClick={() => onCue(index)}
      className={cn(
        "group relative flex w-[216px] shrink-0 items-stretch gap-2.5 rounded-lg border p-1 text-left transition-[border-color,background-color] duration-150",
        active ? "border-brass/70 bg-brass/[0.07] shadow-[0_0_0_1px_rgb(217_185_106/0.25)]" : "border-line bg-surface hover:border-line-strong hover:bg-raised",
      )}
    >
      <TakeThumb take={thumb} still="film" frame={chapter?.still ?? part.start} scrub={false} load={load} className="w-[104px] shrink-0 rounded-[5px]">
        <span className="pointer-events-none absolute left-1 top-1 rounded-xs bg-black/65 px-1.5 py-px text-2xs font-semibold text-ink tabular-nums backdrop-blur-sm">
          {index + 1}
        </span>
        {active ? <Progress clock={clock} part={part} /> : null}
      </TakeThumb>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-px pr-1">
        <span className="truncate text-sm font-semibold text-ink">{chapter?.label ?? `Del ${index + 1}`}</span>
        <span className="truncate text-xs text-dim">{chapter?.sub ?? ""}</span>
        <span className="truncate text-2xs text-faint tabular-nums">
          {film.name} · ruta {part.start}
        </span>
      </span>
    </button>
  );
}

const StepBox = memo(function StepBox({
  index,
  seg,
  part,
  active,
  clock,
  load,
  onCue,
}: {
  index: number;
  seg: Segment;
  part: PlayPart | undefined;
  active: boolean;
  clock?: Clock | null;
  /** Near the strip's window: read the still. */
  load: boolean;
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
      <TakeThumb take={take} still="film" frame={stillOf(part, seg.kind)} scrub={false} load={load} className="w-[104px] shrink-0 rounded-[5px]">
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
