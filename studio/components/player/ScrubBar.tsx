"use client";

// <ScrubBar range={{start, end}} frame={88} onSeek={(f) => …} marks={[{frame: 105, label: "Landning", kind: "landing"}]} />
// The film's frames as a bar: the filled part up to the frame shown, a thumb, marks for chapters and the landing frame.
// Click or drag to move (one frame of the film per step of the bar); a focused bar takes ← → (Shift: 10), Home, End.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Range } from "../../lib/sync.ts";
import { cn } from "../ui/cn";

export type FilmMark = { frame: number; label: string; kind?: "chapter" | "landing" };

export function ScrubBar({
  range,
  frame,
  onSeek,
  marks = [],
  disabled = false,
  label = "Ruta",
  className,
}: {
  range: Range | null;
  frame: number;
  onSeek: (frame: number) => void;
  marks?: readonly FilmMark[];
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const usable = !!range && !disabled && range.end > range.start;
  const span = range ? Math.max(1, range.end - range.start) : 1;
  const share = (f: number) => (range ? Math.min(1, Math.max(0, (f - range.start) / span)) : 0);
  const frameAt = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width)));
    return Math.round(range!.start + x * span);
  };

  // A mark within about one percent of the bar catches the pointer: a click near a chapter lands on its frame.
  const near = (f: number) => marks.find((m) => Math.abs(m.frame - f) <= Math.max(1, span * 0.012));
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!usable || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    const f = frameAt(event.clientX);
    onSeek(near(f)?.frame ?? f);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!usable) return;
    const f = frameAt(event.clientX);
    setHover(f);
    if (dragging) onSeek(f);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!usable) return;
    const step = event.shiftKey ? 10 : 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp" ? frame + step
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? frame - step
      : event.key === "Home" ? range!.start
      : event.key === "End" ? range!.end
      : null;
    if (next === null) return;
    event.preventDefault();
    onSeek(Math.min(range!.end, Math.max(range!.start, next)));
  };

  const hoverMark = hover !== null ? near(hover) : undefined;

  return (
    <div
      role="slider"
      tabIndex={usable ? 0 : -1}
      aria-label={label}
      aria-valuemin={range?.start ?? 0}
      aria-valuemax={range?.end ?? 0}
      aria-valuenow={frame}
      aria-valuetext={`ruta ${frame}`}
      aria-disabled={!usable || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => setHover(null)}
      onKeyDown={key}
      className={cn("group relative flex h-8 min-w-24 flex-1 touch-none select-none items-center rounded-sm focus-visible:outline-offset-1", usable ? "cursor-pointer" : "opacity-50", className)}
    >
      <div ref={track} className="relative h-1 w-full rounded-full bg-line-strong transition-[height] duration-150 group-hover:h-1.5">
        <div className="absolute inset-y-0 left-0 rounded-full bg-brass" style={{ width: `${share(frame) * 100}%` }} />
        {marks.map((m) => (
          <span
            key={`${m.kind ?? "chapter"}-${m.frame}-${m.label}`}
            aria-hidden
            title={`${m.label} · ruta ${m.frame}`}
            className={cn(
              "absolute top-1/2 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full",
              m.kind === "landing" ? "h-3.5 bg-brass-hi shadow-[0_0_0_2px_var(--color-canvas)]" : "h-3 bg-ink/80 shadow-[0_0_0_2px_var(--color-canvas)]",
            )}
            style={{ left: `${share(m.frame) * 100}%` }}
          />
        ))}
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_3px_var(--color-canvas),0_1px_4px_rgb(0_0_0/0.5)] transition-transform duration-100",
          dragging ? "scale-110" : "group-hover:scale-105",
        )}
        style={{ left: `${share(frame) * 100}%` }}
      />
      {hover !== null && usable ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-xs border border-line-strong bg-overlay px-1.5 py-0.5 text-2xs text-ink tabular-nums shadow-pop"
          style={{ left: `${share(hover) * 100}%` }}
        >
          {hoverMark ? `${hoverMark.label} · ${hoverMark.frame}` : `ruta ${hover}`}
        </span>
      ) : null}
    </div>
  );
}
