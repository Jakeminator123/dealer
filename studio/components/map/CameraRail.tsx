"use client";

// The camera: one more dimension of a tree on Karta (Jakob 2026-11-23: it starts on "standard-plats 4-kameran", and "ett
// reglage", perhaps the mouse wheel, changes to camera 1–7). A strip of seven frames at the map's left edge, one per seat's
// camera, 1 at the top: the tree's first picture from that seat where something is made, an empty dashed frame where nothing
// is. A click chooses a camera, a drag along the strip slides between them, the wheel over the strip steps one camera per
// notch (LevelRail's useLevelWheel: everywhere else the wheel is the map's), and with the strip in focus the arrow keys do
// it. The choice is in the address (?kamera=2; none: camera 4, KartaView). What a camera has: src/dealer-trees.ts cameraMade.
// CameraNote is the one line that says it in words, beside the legend, for another camera than the straight one.
import { Video } from "lucide-react";
import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { STRAIGHT_CAMERA } from "../../../src/dealer-trees.ts";
import { cn } from "@/components/ui";
import type { EntryAnswer } from "@/lib/media";
import { coverOfEntry } from "../material/Tile";
import { ProofStill } from "../proofs";
import { useLevelWheel } from "./LevelRail";

/** One camera of the strip: the tree's first picture from it (none: nothing to show), and what it has. */
export type CameraStop = { camera: number; entry: EntryAnswer | undefined; pictures: number; films: number; waiting: number };

/** The room the strip takes at the map's left edge, beyond the map's own margin: the tree is fitted beside it. */
export const CAMERA_RAIL_SPACE = 60;

const isMade = (s: Pick<CameraStop, "pictures" | "films" | "waiting">): boolean => s.pictures + s.films + s.waiting > 0;
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** "3 bilder · 2/36", "1 bild · 0/36 · 1 prov"; "tomt" where nothing is made. */
const madeWord = (s: CameraStop, total: number): string =>
  isMade(s) ? [count(s.pictures, "bild", "bilder"), `${s.films}/${total}`, ...(s.waiting ? [`${s.waiting} prov`] : [])].join(" · ") : "tomt";

export function CameraRail({ stops, value, total, onChange, className }: { stops: readonly CameraStop[]; value: number; total: number; onChange: (camera: number) => void; className?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const step = useCallback(
    (by: 1 | -1) => {
      const next = stops[stops.findIndex((s) => s.camera === value) + by];
      if (!next) return false;
      onChange(next.camera);
      return true;
    },
    [stops, value, onChange],
  );
  useLevelWheel(rail, step);
  // The arrow keys move the choice; the focus follows it along the strip.
  useEffect(() => {
    const el = rail.current;
    if (el && el.contains(document.activeElement)) el.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [value]);
  const key = (e: KeyboardEvent) => {
    const by = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!by || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    step(by);
  };
  // A drag along the strip: the frame under the pointer is the camera. Only a drag begun on the strip: one that pans the map
  // and passes over it (the map's drag is not captured) leaves the camera alone.
  const dragging = useRef(false);
  const slide = (e: PointerEvent) => {
    if (e.buttons !== 1) dragging.current = false;
    if (!dragging.current) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-camera]");
    const camera = hit && rail.current?.contains(hit) ? Number(hit.dataset.camera) : 0;
    if (camera && camera !== value) onChange(camera);
  };
  return (
    <div
      ref={rail}
      role="radiogroup"
      aria-label="Kamera"
      onKeyDown={key}
      onPointerDown={(e) => {
        dragging.current = e.button === 0;
      }}
      onPointerMove={slide}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerLeave={() => {
        dragging.current = false;
      }}
      onDragStart={(e) => e.preventDefault()}
      title="Kamera 1–7: klicka, dra eller rulla här"
      className={cn("flex touch-none select-none flex-col items-center gap-1 rounded-lg border border-line bg-surface/92 p-1.5 shadow-pop backdrop-blur-sm", className)}
    >
      <Video aria-hidden className="size-3.5 text-faint" />
      {stops.map((s) => {
        const on = s.camera === value;
        const cover = s.entry ? coverOfEntry(s.entry) : null;
        const made = isMade(s);
        return (
          <button
            key={s.camera}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-camera={s.camera}
            onClick={() => onChange(s.camera)}
            title={`Kamera ${s.camera}${s.camera === STRAIGHT_CAMERA ? ", rakt framifrån" : ""}: ${madeWord(s, total)}`}
            className={cn(
              "relative block h-[30px] w-[44px] shrink-0 overflow-hidden rounded-[4px] border transition-colors duration-150",
              cover ? "bg-well" : made ? "bg-raised" : "border-dashed",
              on ? "border-brass shadow-[0_0_0_1px_var(--color-brass)]" : made ? "border-line-strong hover:border-[#4a5a51]" : "border-line-strong/80 hover:border-[#4a5a51]",
            )}
          >
            {cover ? <ProofStill cover={cover} fps={s.entry?.fps ?? 30} className={cn("pointer-events-none absolute inset-0", !on && "opacity-80")} /> : null}
            <span
              className={cn(
                "pointer-events-none absolute text-[11px] font-semibold leading-[14px] tabular-nums",
                cover ? "bottom-0.5 left-0.5 rounded-xs bg-black/65 px-1 text-ink" : "inset-0 grid place-items-center",
                !cover && (on ? "text-brass-hi" : made ? "text-ink" : "text-faint"),
              )}
            >
              {s.camera}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The chosen camera in words, for another than the straight one: "Kamera 2 · tomt", "Kamera 2 · 3 bilder · 2/36". */
export function CameraNote({ stop, total, className }: { stop: CameraStop; total: number; className?: string }) {
  return (
    <div className={cn("pointer-events-none flex items-center gap-1.5 whitespace-nowrap rounded-md border border-brass/50 bg-surface/92 px-3 py-1.5 text-[11.5px] text-ink shadow-pop backdrop-blur-sm", className)}>
      <Video aria-hidden className="size-3.5 text-brass-hi" />
      <span className="font-medium">Kamera {stop.camera}</span>
      <span className="text-dim">· {madeWord(stop, total)}</span>
    </div>
  );
}
