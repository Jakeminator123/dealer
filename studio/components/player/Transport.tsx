"use client";

// <Transport playing onToggle onStep onSeek frame range frames rate onRate loop onLoop marks />: the row under a film:
// play/pause, one frame back and forward, the scrub bar, "ruta 88 / 120", speed 0,25 / 0,5 / 1 and loop. Only shows and
// asks: the film player (FilmPlayer) and Jämför's shared transport do the work.
import { ChevronLeft, ChevronRight, Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { frameLabel, type Range } from "../../lib/sync.ts";
import { cn } from "../ui/cn";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ScrubBar, type FilmMark } from "./ScrubBar";

export const SPEEDS = [0.25, 0.5, 1] as const;
const SPEED_OPTIONS = SPEEDS.map((s) => ({ value: s, label: s === 1 ? "1×" : String(s).replace(".", ","), title: `${String(s).replace(".", ",")} × fart` }));

export function Transport({
  playing,
  onToggle,
  onStep,
  onSeek,
  frame,
  range,
  frames,
  rate,
  onRate,
  loop,
  onLoop,
  marks,
  muted,
  onMuted,
  counter,
  extra,
  disabled = false,
  compact = false,
  className,
}: {
  playing: boolean;
  onToggle: () => void;
  onStep: (n: number) => void;
  onSeek: (frame: number) => void;
  frame: number;
  range: Range | null;
  /** The film's frame count, for "ruta 88 / 120". */
  frames: number | null;
  rate: number;
  onRate: (rate: number) => void;
  loop: boolean;
  onLoop: (loop: boolean) => void;
  marks?: readonly FilmMark[];
  /** Given: a sound button. */
  muted?: boolean;
  onMuted?: (muted: boolean) => void;
  /** Shown after the frame count: a chapter's name. */
  counter?: ReactNode;
  /** More controls at the right end. */
  extra?: ReactNode;
  disabled?: boolean;
  /** Narrow: the speed and loop are left out. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <IconButton
        label={playing ? "Pausa" : "Spela"}
        kbd="Mellanslag"
        icon={playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        variant="secondary"
        disabled={disabled}
        onClick={onToggle}
      />
      <IconButton label="En ruta bakåt" kbd="←" icon={<ChevronLeft />} disabled={disabled || !range} onClick={() => onStep(-1)} />
      <IconButton label="En ruta framåt" kbd="→" icon={<ChevronRight />} disabled={disabled || !range} onClick={() => onStep(1)} />
      <ScrubBar range={range} frame={frame} onSeek={onSeek} marks={marks} disabled={disabled} className="mx-2" />
      <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-sm text-dim tabular-nums" aria-live="off">
        <span className="text-ink">{frameLabel(frame, range, frames)}</span>
        {counter ? <span className="max-w-40 truncate text-xs text-faint">{counter}</span> : null}
      </span>
      {!compact ? (
        <>
          <SegmentedControl label="Fart" size="sm" value={rate} onChange={onRate} options={SPEED_OPTIONS} disabled={disabled} className="ml-2" />
          <IconButton label={loop ? "Slinga på" : "Slinga av"} icon={<Repeat />} aria-pressed={loop} disabled={disabled} onClick={() => onLoop(!loop)} className={cn(loop && "text-brass-hi")} />
        </>
      ) : null}
      {onMuted ? <IconButton label={muted ? "Ljud av" : "Ljud på"} icon={muted ? <VolumeX /> : <Volume2 />} onClick={() => onMuted(!muted)} /> : null}
      {extra}
    </div>
  );
}
