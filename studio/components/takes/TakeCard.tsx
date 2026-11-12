"use client";

// <TakeCard take={take} selected onSelect={() => …} actions={<Button …/>} layout="stack|row" still="film" play onExpand />
// One take: thumbnail (scrubs on hover), short name, verdict chip, facts (model · length · frames · day), and a slot for
// actions below. onSelect makes the picture and text one button; the actions stay separate buttons beside it.
// play: a play button on the still plays the film in place with the shared player (speeds, ±1 frame, the frame read-out;
// a cut-out take only its own frames), one film at a time (play-slot.ts). onExpand: a button that opens it over the whole
// window (FilmViewer). Neither is shown for a take without a film.
import { Maximize2, Play, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { factsLine, formatSeconds, takeFacts, takeName } from "../../lib/names.ts";
import { FilmPlayer, type FilmPlayerHandle } from "../player";
import { cn } from "../ui/cn";
import { usePlaySlot } from "./play-slot.ts";
import { TakeChip } from "./VerdictChip";
import { TakeThumb } from "./TakeThumb";

const OVER = "grid size-8 place-items-center rounded-full bg-black/60 text-ink shadow-[0_2px_10px_rgb(0_0_0/0.5)] backdrop-blur-sm transition-[background-color,transform] duration-150 hover:scale-105 hover:bg-black/80 [&_svg]:size-4";

export function TakeCard({
  take,
  name,
  selected = false,
  onSelect,
  actions,
  layout = "stack",
  still = "auto",
  frame,
  extra,
  play = false,
  onExpand,
  className,
}: {
  take: Take;
  /** A play button on the still: the film plays in place (stack layout). */
  play?: boolean;
  /** A button that opens the film over the whole window. */
  onExpand?: () => void;
  /** The name to show; default the take's short name within its edge (lib/names.ts takeName). */
  name?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Buttons under the card (stack) or at its right (row). */
  actions?: ReactNode;
  layout?: "stack" | "row";
  still?: "auto" | "first" | "film";
  frame?: number;
  /** A line under the facts: why it plays, a note. */
  extra?: ReactNode;
  className?: string;
}) {
  const bank = useOptionalBank();
  const [focused, setFocused] = useState(false);
  const siblings = bank?.graph?.edge[take.edge]?.takes;
  const title = name ?? takeName(take, siblings);
  const facts = takeFacts(take);
  const row = layout === "row";
  const film = !!take.media.video;
  const [playing, setPlaying] = useState(false);
  const player = useRef<FilmPlayerHandle>(null);
  const slot = usePlaySlot(() => setPlaying(false));
  const inline = play && film && playing && !row;

  const body = (
    <>
      {inline ? null : (
        <TakeThumb take={take} still={still} frame={frame} active={focused} className={cn(row ? "w-36 shrink-0 rounded-md" : "rounded-b-none rounded-t-[11px]")}>
          {facts.seconds !== null ? (
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-xs bg-black/65 px-1.5 py-0.5 text-2xs font-medium text-ink tabular-nums backdrop-blur-sm">
              {formatSeconds(facts.seconds)}
            </span>
          ) : null}
        </TakeThumb>
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", row ? "py-0.5" : "px-3 pb-3 pt-2.5")}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={take.id}>
            {title}
          </span>
          <TakeChip take={take} size="sm" />
        </div>
        <span className="truncate text-xs text-faint">{factsLine(facts)}</span>
        {extra ? <div className="text-xs text-dim">{extra}</div> : null}
      </div>
    </>
  );

  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "group relative flex min-w-0 rounded-lg border bg-surface shadow-inset transition-[border-color,background-color,box-shadow] duration-150",
        row ? "items-center gap-3 p-2 pr-3" : "flex-col",
        selected ? "border-brass/70 shadow-[0_0_0_1px_rgb(217_185_106/0.5)]" : "border-line hover:border-line-strong",
        className,
      )}
    >
      {inline ? (
        <div className="relative flex h-[300px] flex-col p-2 pb-1">
          <FilmPlayer
            ref={player}
            src={take.media.video ?? null}
            fps={take.fps}
            frames={take.frames}
            range={take.segment}
            speed={take.speed}
            marks={take.landingFrame !== null ? [{ frame: take.landingFrame, label: "Landning", kind: "landing" }] : []}
            label={`Film: ${title}`}
            onLoaded={() => void player.current?.play()}
            onPlayingChange={(on) => (on ? slot.claim() : undefined)}
            className="min-h-0 flex-1"
          />
          <div className="absolute right-3.5 top-3.5 z-10 flex gap-1.5">
            {onExpand ? (
              <button type="button" aria-label="Visa stort" title="Visa stort" onClick={() => { player.current?.pause(); onExpand(); }} className={OVER}>
                <Maximize2 />
              </button>
            ) : null}
            <button type="button" aria-label="Stäng filmen" title="Tillbaka till stillbilden" onClick={() => { slot.release(); setPlaying(false); }} className={OVER}>
              <X />
            </button>
          </div>
        </div>
      ) : (play || onExpand) && film && !row ? (
        // Over the still, outside the card's own button: a button may not sit inside another.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex aspect-[3/2] items-center justify-center">
          {play ? (
            <button
              type="button"
              aria-label={`Spela ${title}`}
              title="Spela här"
              onClick={() => { slot.claim(); setPlaying(true); }}
              className="pointer-events-auto grid size-12 place-items-center rounded-full bg-black/55 text-ink opacity-90 shadow-[0_4px_18px_rgb(0_0_0/0.55)] backdrop-blur-sm transition-[opacity,transform,background-color] duration-150 hover:scale-105 hover:bg-black/75 hover:opacity-100 [&_svg]:size-5 [&_svg]:translate-x-px [&_svg]:fill-current"
            >
              <Play />
            </button>
          ) : null}
          {onExpand ? (
            <button type="button" aria-label={`Visa ${title} stort`} title="Visa stort" onClick={onExpand} className={cn(OVER, "pointer-events-auto absolute right-2 top-2")}>
              <Maximize2 />
            </button>
          ) : null}
        </div>
      ) : null}
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
          onBlur={() => setFocused(false)}
          className={cn("flex min-w-0 flex-1 rounded-[11px] text-left focus-visible:outline-offset-[3px]", row ? "items-center gap-3" : "flex-col")}
        >
          {body}
        </button>
      ) : (
        <div className={cn("flex min-w-0 flex-1", row ? "items-center gap-3" : "flex-col")}>{body}</div>
      )}
      {actions ? <div className={cn("flex shrink-0 flex-wrap items-center gap-1.5", row ? "" : "border-t border-line px-3 py-2")}>{actions}</div> : null}
    </div>
  );
}
