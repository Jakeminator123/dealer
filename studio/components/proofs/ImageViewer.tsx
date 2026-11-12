"use client";

// <ImageViewer pictures={entries} index={i} onIndex={setI} />: a proof's pictures over the whole window, one at a time:
// ← → between them, Z (or a click on the picture) between the whole picture fitted to the window and a close look (its
// full size, or twice the fitted size when it is small), where it is dragged to look around (he judges details); Esc
// closes. Name and chip on top; the rest of the label and the file at the bottom.
import * as RD from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { labUrl } from "../../lib/lab.ts";
import { formatBytes, type ProofEntry } from "../../lib/proofs.ts";
import { ProofChip } from "../takes";
import { IconButton, Kbd, cn } from "../ui";

const PAD = 24;

export function ImageViewer({ pictures, index, onIndex }: { pictures: readonly ProofEntry[]; index: number | null; onIndex: (index: number | null) => void }) {
  const open = index !== null && !!pictures[index];
  const entry = open ? pictures[index] : null;
  const [zoom, setZoom] = useState<number | null>(null); // the scale of the close look; null: fitted
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const aim = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const src = entry ? labUrl(entry.file.path) : "";
  const size = natural?.src === src ? natural : null;

  useEffect(() => setZoom(null), [index]);

  /** The scale the whole picture is shown at in the window. */
  const fitScale = () => {
    const el = scroller.current;
    if (!el || !size) return 1;
    return Math.min((el.clientWidth - 2 * PAD) / size.w, (el.clientHeight - 2 * PAD) / size.h);
  };
  const closeScale = () => Math.max(1, 2 * fitScale());

  // The close look: the point clicked stays under the pointer (the middle when Z was pressed).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (zoom === null || !el || !size) return;
    const a = aim.current ?? { fx: 0.5, fy: 0.5, x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const w = Math.max(el.clientWidth, size.w * zoom);
    const h = Math.max(el.clientHeight, size.h * zoom);
    const left = (w - size.w * zoom) / 2;
    const top = (h - size.h * zoom) / 2;
    el.scrollLeft = Math.max(0, left + a.fx * size.w * zoom - a.x);
    el.scrollTop = Math.max(0, top + a.fy * size.h * zoom - a.y);
    aim.current = null;
  }, [zoom, size]);

  const go = (step: number) => {
    if (index === null || !pictures.length) return;
    onIndex((index + step + pictures.length) % pictures.length);
  };
  const toggle = () => setZoom((z) => (z === null && size ? closeScale() : null));

  const zoomAt = (event: MouseEvent<HTMLImageElement>) => {
    if (!size) return;
    const r = event.currentTarget.getBoundingClientRect();
    const s = Math.min(r.width / size.w, r.height / size.h);
    const cw = size.w * s;
    const ch = size.h * s;
    const box = scroller.current?.getBoundingClientRect();
    aim.current = {
      fx: Math.min(1, Math.max(0, (event.clientX - r.left - (r.width - cw) / 2) / cw)),
      fy: Math.min(1, Math.max(0, (event.clientY - r.top - (r.height - ch) / 2) / ch)),
      x: event.clientX - (box?.left ?? 0),
      y: event.clientY - (box?.top ?? 0),
    };
    setZoom(closeScale());
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (zoom === null || !el || event.button !== 0) return;
    el.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (scroller.current?.hasPointerCapture(event.pointerId)) scroller.current.releasePointerCapture(event.pointerId);
    if (d && !d.moved) setZoom(null); // a click without dragging goes back to the whole picture
  };

  const percent = zoom !== null ? zoom : size ? Math.min(fitScale(), 8) : null;

  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#060807] data-[state=open]:animate-fade-in" />
        <RD.Content
          ref={content}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // The window itself takes the keys; a button with focus would show its tooltip over the picture.
            event.preventDefault();
            content.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") go(event.key === "ArrowLeft" ? -1 : 1);
            else if (event.key === "z" || event.key === "Z" || event.key === " ") toggle();
            else return;
            event.preventDefault();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[#060807] focus:outline-none data-[state=open]:animate-fade-in"
        >
          {entry ? (
            <>
              <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/6 px-5">
                <span className="text-sm text-faint tabular-nums">
                  {index! + 1} / {pictures.length}
                </span>
                <RD.Title className="min-w-0 truncate font-display text-md font-semibold text-ink">{entry.name}</RD.Title>
                {entry.verdict ? <ProofChip verdict={entry.verdict} size="sm" /> : null}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="mr-3 hidden items-center gap-1.5 text-xs text-faint lg:flex">
                    <Kbd>Z</Kbd> {zoom !== null ? "hela bilden" : "titta närmare"}
                    <span className="mx-1" />
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd> bläddra
                  </span>
                  {percent !== null ? <span className="w-12 text-right text-xs text-dim tabular-nums">{Math.round(percent * 100)} %</span> : null}
                  <IconButton label={zoom !== null ? "Hela bilden" : "Titta närmare"} kbd="Z" icon={zoom !== null ? <Minimize2 /> : <Maximize2 />} aria-pressed={zoom !== null} onClick={toggle} />
                  <RD.Close asChild>
                    <IconButton label="Stäng" kbd="Esc" icon={<X />} />
                  </RD.Close>
                </div>
              </header>
              <div className="relative min-h-0 flex-1">
                <div
                  ref={scroller}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  className={cn("absolute inset-0", zoom !== null ? "cursor-grab overflow-auto active:cursor-grabbing" : "overflow-hidden")}
                  style={zoom === null ? { padding: PAD } : undefined}
                >
                  {zoom !== null && size ? (
                    <div className="grid min-h-full min-w-full place-items-center" style={{ width: size.w * zoom, height: size.h * zoom }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a proof's picture, looked at closely */}
                      <img src={src} alt={entry.name} draggable={false} className="max-w-none select-none [image-rendering:auto]" style={{ width: size.w * zoom, height: size.h * zoom }} />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- a proof's picture, fitted to the window
                    <img
                      src={src}
                      alt={entry.name}
                      draggable={false}
                      onLoad={(event) => setNatural({ src, w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
                      onClick={zoomAt}
                      className="size-full cursor-zoom-in select-none object-contain"
                    />
                  )}
                </div>
                {pictures.length > 1 ? (
                  <>
                    <button type="button" aria-label="Föregående bild" onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-ink ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-black/80">
                      <ChevronLeft className="size-5" />
                    </button>
                    <button type="button" aria-label="Nästa bild" onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-ink ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-black/80">
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                ) : null}
              </div>
              <footer className="flex min-h-11 shrink-0 items-center gap-4 border-t border-white/6 px-5 py-2 text-sm">
                <span className="min-w-0 flex-1 text-dim">{entry.rest || <span className="text-faint">Ingen mer text om bilden.</span>}</span>
                <span className="shrink-0 text-xs text-faint tabular-nums">
                  {entry.file.name} · {size ? `${size.w} × ${size.h} · ` : ""}
                  {formatBytes(entry.file.bytes)}
                </span>
              </footer>
            </>
          ) : (
            <RD.Title className="sr-only">Bild</RD.Title>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
