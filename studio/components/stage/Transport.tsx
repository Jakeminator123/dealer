"use client";

// The stage's one transport, the same for 3D and "Inte 3D": the scrub bar with the cuts marked (a step without a film is
// hatched), play/pause, one frame back and on (also across a cut), speed, loop, and where it is ("steg 2/3 · ruta 88/104").
import { Pause, Play, Repeat, StepBack, StepForward } from "lucide-react";
import { useMemo, useRef } from "react";
import { readout, shareOf, timeline, type PlayPart } from "../../lib/parts.ts";
import { cn } from "../ui/cn";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl, type Segment } from "../ui/SegmentedControl";
import { useClock, type Clock } from "./clock.ts";

const SPEEDS: Segment<number>[] = [
  { value: 0.25, label: "0,25×", title: "En fjärdedels fart" },
  { value: 0.5, label: "0,5×", title: "Halv fart" },
  { value: 1, label: "1×", title: "Full fart" },
];

export function Transport({
  parts,
  clock,
  playing,
  speed,
  loop,
  onToggle,
  onStep,
  onSpeed,
  onLoop,
  onScrub,
  onScrubEnd,
  className,
}: {
  parts: PlayPart[];
  clock: Clock;
  playing: boolean;
  speed: number;
  loop: boolean;
  onToggle(): void;
  onStep(dir: 1 | -1): void;
  onSpeed(speed: number): void;
  onLoop(loop: boolean): void;
  /** The pointer is on the bar at this share (0 … 1); first: the press that starts a scrub. */
  onScrub(share: number, first: boolean): void;
  onScrubEnd(): void;
  className?: string;
}) {
  const text = useClock(clock, (s) => readout(parts, s.pos));
  const none = !parts.length;
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-1.5 border-t border-line bg-surface px-3", className)}>
      <IconButton
        label={playing ? "Pausa" : "Spela"}
        kbd="Mellanslag"
        icon={playing ? <Pause /> : <Play />}
        variant="secondary"
        disabled={none}
        onClick={onToggle}
        className={cn(!playing && "text-brass-hi")}
      />
      <IconButton label="En ruta bakåt" kbd="←" icon={<StepBack />} disabled={none} onClick={() => onStep(-1)} />
      <IconButton label="En ruta framåt" kbd="→" icon={<StepForward />} disabled={none} onClick={() => onStep(1)} />
      <ScrubBar parts={parts} clock={clock} onScrub={onScrub} onScrubEnd={onScrubEnd} />
      {/* a fixed width, so the bar does not move as the numbers change */}
      <span className="w-[11.5rem] shrink-0 truncate text-right text-sm text-dim tabular-nums" aria-live="off">
        {text}
      </span>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
      <SegmentedControl size="sm" label="Hastighet" value={speed} onChange={onSpeed} options={SPEEDS} />
      <IconButton
        label={loop ? "Slinga: på" : "Slinga: av"}
        icon={<Repeat />}
        aria-pressed={loop}
        onClick={() => onLoop(!loop)}
        className="aria-pressed:text-brass-hi"
      />
    </div>
  );
}

function ScrubBar({ parts, clock, onScrub, onScrubEnd }: { parts: PlayPart[]; clock: Clock; onScrub(share: number, first: boolean): void; onScrubEnd(): void }) {
  const spans = useMemo(() => timeline(parts), [parts]);
  const share = useClock(clock, (s) => shareOf(parts, s.pos));
  const current = useClock(clock, (s) => s.pos?.step ?? -1);
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (x: number) => {
    const box = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - box.left) / Math.max(1, box.width)));
  };
  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Plats i rundan"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      className={cn("group relative mx-2 h-8 min-w-24 flex-1 touch-none select-none", parts.length ? "cursor-pointer" : "pointer-events-none opacity-50")}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onScrub(at(e.clientX), true);
      }}
      onPointerMove={(e) => {
        if (dragging.current) onScrub(at(e.clientX), false);
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onScrubEnd();
      }}
      onPointerCancel={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onScrubEnd();
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 transition-[height] duration-150 group-hover:h-2">
        {spans.map((s) => {
          const fill = s.to <= share ? 1 : s.from >= share ? 0 : (share - s.from) / Math.max(1e-9, s.to - s.from);
          return (
            <div
              key={s.step}
              className={cn(
                "absolute inset-y-0 overflow-hidden rounded-[2px]",
                s.gap
                  ? "bg-[repeating-linear-gradient(135deg,rgb(224_108_108/0.55)_0_2px,transparent_2px_5px)] ring-1 ring-inset ring-underkand/35"
                  : s.step === current
                    ? "bg-[#3a4840]"
                    : "bg-line-strong",
              )}
              style={{ left: `calc(${s.from * 100}% + 1px)`, width: `max(1px, calc(${(s.to - s.from) * 100}% - 2px))` }}
            >
              {s.gap ? null : <div className="h-full bg-brass" style={{ width: `${fill * 100}%` }} />}
            </div>
          );
        })}
      </div>
      {parts.length ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_3px_var(--color-surface),0_1px_4px_rgb(0_0_0/0.5)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ left: `${share * 100}%` }}
        />
      ) : null}
    </div>
  );
}
