"use client";

// <FilmViewer takes={list} index={i} onIndex={setI} />: one take's film over the whole window (Jakob 2026-11-12: "enlarge
// all films … play at different speeds … get it up in full picture"). Dark, the film as large as the window allows with
// the shared player's transport under it (play/pause, ±1 frame, 0,25 / 0,5 / 1, the frame read-out; a cut-out take only
// its own frames), the take's step, name and chip on top, ‹ › to the take before and after in the list it was opened
// from, and a button for the browser's own full screen. Keys: Space plays, ← → one frame (Shift: ten), Page Up / Page
// Down the take before and after, Esc closes. Only one film plays at a time (play-slot.ts).
import * as RD from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { edgeName, factsLine, takeFacts, takeName } from "../../lib/names.ts";
import { FilmPlayer, type FilmPlayerHandle } from "../player";
import { IconButton, Kbd } from "../ui";
import { usePlaySlot } from "./play-slot.ts";
import { TakeChip } from "./VerdictChip";

export function FilmViewer({ takes, index, onIndex }: { takes: readonly Take[]; index: number | null; onIndex: (index: number | null) => void }) {
  const open = index !== null && !!takes[index];
  const take = open ? takes[index] : null;
  const bank = useOptionalBank();
  const player = useRef<FilmPlayerHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const slot = usePlaySlot(() => player.current?.pause());

  useEffect(() => {
    const read = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", read);
    return () => document.removeEventListener("fullscreenchange", read);
  }, []);
  // Leaving the viewer leaves the browser's full screen too.
  useEffect(() => {
    if (!open && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [open]);

  const go = (n: -1 | 1) => {
    if (index === null || !takes.length) return;
    onIndex((index + n + takes.length) % takes.length);
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void box.current?.requestFullscreen?.().catch(() => {});
  };
  const keys = (e: KeyboardEvent) => {
    const p = player.current;
    if (!p || (e.target as HTMLElement).closest("input, textarea, [role=radio], [role=slider]")) return;
    if (e.key === " ") {
      e.preventDefault();
      p.toggle();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      void p.step((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      go(e.key === "PageUp" ? -1 : 1);
    }
  };

  const siblings = take ? bank?.graph?.edge[take.edge]?.takes : undefined;
  const name = take ? takeName(take, siblings) : "";
  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/85 data-[state=open]:animate-fade-in" />
        <RD.Content
          ref={box}
          aria-describedby={undefined}
          onKeyDown={keys}
          className="fixed inset-0 z-50 flex flex-col bg-[#060908] focus:outline-none data-[state=open]:animate-fade-in"
        >
          {take ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
                <span className="font-display text-md font-medium text-dim">{edgeName(take.edge)}</span>
                <RD.Title className="min-w-0 truncate font-display text-lg font-semibold text-ink" title={take.id}>
                  {name}
                </RD.Title>
                <TakeChip take={take} />
                <span className="hidden truncate text-xs text-faint md:inline">{factsLine(takeFacts(take))}</span>
                <div className="ml-auto flex items-center gap-1">
                  {takes.length > 1 ? (
                    <>
                      <IconButton label="Tagningen före" kbd="PgUp" icon={<ChevronLeft />} onClick={() => go(-1)} />
                      <span className="min-w-14 text-center text-sm tabular-nums text-dim">
                        {index! + 1} av {takes.length}
                      </span>
                      <IconButton label="Tagningen efter" kbd="PgDn" icon={<ChevronRight />} onClick={() => go(1)} />
                    </>
                  ) : null}
                  <IconButton label={full ? "Lämna helskärm" : "Helskärm"} icon={full ? <Minimize /> : <Maximize />} onClick={toggleFull} />
                  <RD.Close asChild>
                    <IconButton label="Stäng" kbd="Esc" icon={<X />} />
                  </RD.Close>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3">
                <FilmPlayer
                  ref={player}
                  key={take.id}
                  src={take.media.video ?? null}
                  fps={take.fps}
                  frames={take.frames}
                  range={take.segment}
                  speed={take.speed}
                  marks={take.landingFrame !== null ? [{ frame: take.landingFrame, label: "Landning", kind: "landing" }] : []}
                  label={`Film: ${name}`}
                  onPlayingChange={(playing) => (playing ? slot.claim() : undefined)}
                  className="min-h-0 flex-1"
                />
                <p className="mt-2 hidden text-center text-2xs text-faint sm:block">
                  <Kbd>Mellanslag</Kbd> spelar · <Kbd>←</Kbd> <Kbd>→</Kbd> en ruta · <Kbd>PgUp</Kbd> <Kbd>PgDn</Kbd> tagningen före och efter · <Kbd>Esc</Kbd> stänger
                </p>
              </div>
            </>
          ) : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
