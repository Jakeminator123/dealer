"use client";

// Levels: one more dimension of a view on Karta (Jakob 2026-11-23: "om man scrollar upp eller ned så kan man kanske se nivåer i
// en till dimension"). A view that has them shows one at a time, and these three pieces move between them:
//   LevelRail   a narrow rail at the view's edge, one mark per level (its colour and name); a click chooses it, and the
//               wheel over the rail steps to the next or the one before.
//   LevelStack  the chosen level as a card, with the levels after it as cards lying behind, so it shows that there are more.
//   useLevels   the step itself, the wheel over a given element (the grid's heading), and the arrow keys up and down.
// The wheel changes level ONLY over the rail and the heading: everywhere else the page scrolls as always. The arrow keys are
// left alone in a field, a slider, a list or a dialog, and at the first and last level, where they scroll the page.
// Nothing here knows what a level is: the composition's levels are "Sammanlagt" and its trees (CompositionKarta), and the
// camera as a dimension of a tree (camera 1 to 7, docs/lage/karta.md) can use the same pieces with its own list.
import { ChevronsUpDown, Layers } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/components/ui";

/** color null: the level that is all of them (drawn with the layers mark). dim: a level that is off where it is shown. */
export type Level = { id: string; name: string; color: string | null; dim?: boolean; title?: string };

/** Steps between levels with the wheel over `area`: one level per notch, and never the page under it. */
export function useLevelWheel(area: RefObject<HTMLElement | null>, step: (by: 1 | -1) => boolean) {
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let sum = 0;
    let moved = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      sum = Math.sign(sum) === Math.sign(e.deltaY) ? sum + e.deltaY : e.deltaY;
      const now = performance.now();
      if (Math.abs(sum) < 30 || now - moved < 170) return;
      latest.current(sum > 0 ? 1 : -1);
      sum = 0;
      moved = now;
    };
    // Not passive: the page must not scroll under the pointer while the level changes.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [area]);
}

const NOT_HERE = 'input, select, textarea, [contenteditable="true"], [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"]';

/** The step between levels, and the arrow keys up and down doing it. heading: the element over which the wheel does it too. */
export function useLevels(levels: readonly Level[], value: string, onChange: (id: string) => void, heading: RefObject<HTMLElement | null>): (by: 1 | -1) => boolean {
  const step = useCallback(
    (by: 1 | -1) => {
      const next = levels[levels.findIndex((l) => l.id === value) + by];
      if (!next) return false;
      onChange(next.id);
      return true;
    },
    [levels, value, onChange],
  );
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      if (e.target instanceof Element && e.target.closest(NOT_HERE)) return;
      if (latest.current(e.key === "ArrowDown" ? 1 : -1)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useLevelWheel(heading, step);
  return step;
}

const Dot = ({ level, className }: { level: Level; className?: string }) =>
  level.color ? <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", className)} style={{ background: level.color }} /> : <Layers aria-hidden className={cn("size-3.5 shrink-0", className)} />;

export function LevelRail({ levels, value, onChange, step, label = "Nivå", className }: { levels: readonly Level[]; value: string; onChange: (id: string) => void; step: (by: 1 | -1) => boolean; label?: string; className?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  useLevelWheel(rail, step);
  return (
    <div ref={rail} role="radiogroup" aria-label={label} title="Rulla här, eller pil upp och ned, för att byta nivå" className={cn("relative flex w-[116px] shrink-0 flex-col gap-1 rounded-lg border border-line bg-surface p-1.5", className)}>
      <span className="flex items-center justify-between px-1 pb-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {label} <ChevronsUpDown className="size-3" />
      </span>
      {levels.map((l) => {
        const on = l.id === value;
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l.id)}
            title={l.title ?? l.name}
            className={cn("flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-[11.5px] font-medium leading-tight transition-colors duration-150", on ? "border-brass/70 bg-brass/10 text-ink" : "border-transparent text-dim hover:bg-raised hover:text-ink", l.dim && !on && "opacity-50")}
          >
            <Dot level={l} />
            <span className="min-w-0 truncate">{l.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const EDGE = 7;

/**
 * The chosen level as a card, the levels after it as cards behind it (each a strip at the top and the right, with its colour;
 * a click brings it forward). heading: the card's first row, the level's name and what the caller says about it; ref it with
 * the element given to useLevels so the wheel steps there.
 */
export function LevelStack({ levels, value, onChange, heading, children }: { levels: readonly Level[]; value: string; onChange: (id: string) => void; heading: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const index = Math.max(0, levels.findIndex((l) => l.id === value));
  const level = levels[index];
  const behind = levels.slice(index + 1);
  return (
    <div className="relative" style={{ paddingTop: behind.length * EDGE, paddingRight: behind.length * EDGE }}>
      {behind.map((l, k) => {
        const depth = k + 1;
        const out = (behind.length - depth) * EDGE;
        return (
          <button
            key={l.id}
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => onChange(l.id)}
            title={l.name}
            className="absolute rounded-lg border border-line bg-surface transition-colors duration-150 hover:bg-raised"
            style={{ top: out, right: out, left: depth * EDGE, bottom: depth * EDGE, zIndex: behind.length - depth, opacity: l.dim ? 0.4 : Math.max(0.45, 0.9 - 0.2 * k), borderTopColor: l.color ?? undefined, borderTopWidth: 2 }}
          />
        );
      })}
      <div className="relative rounded-lg border border-line-strong bg-surface p-4" style={{ zIndex: behind.length + 1, borderTopColor: level?.color ?? undefined, borderTopWidth: level?.color ? 2 : undefined }}>
        <div ref={heading} title="Rulla här, eller pil upp och ned, för att byta nivå" className="-mx-4 -mt-4 mb-3 flex cursor-ns-resize items-center gap-2 rounded-t-lg border-b border-line px-4 py-2.5 text-sm text-ink">
          {level ? <Dot level={level} /> : null}
          <span className="font-display font-semibold">{level?.name}</span>
          {level?.title ? <span className="min-w-0 truncate text-xs text-dim">{level.title}</span> : null}
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs tabular-nums text-faint">
            <ChevronsUpDown className="size-3.5" /> {index + 1}/{levels.length}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
