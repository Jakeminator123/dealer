"use client";

// <PathPlayer parts={…} clips={…} graph={graph} pic={…} onClose={…} />: the path picked on Karta played over the whole window,
// its films back to back on the stage that plays a round (components/stage Stage, as plain film: the next film waits decoded
// under the one playing, so a cut is a cut and not a load). On top: the step that plays ("A2.3 → A3P4C1"), its film's short
// name and verdict, ‹ › to the step before and after and the place ("2 / 3"). A step without a film holds its first node's
// picture for a moment with two words over it ("film saknas", "väntar på dom") and the path goes on. Under the picture the
// stage's own transport: play and pause, the whole path to scrub, speed and loop. Space plays, ← → one frame, Esc closes.
import * as RD from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Graph } from "../../../src/clip-graph.ts";
import { IconButton } from "@/components/ui";
import { takeName } from "@/lib/names";
import type { PlayPart } from "@/lib/parts";
import { PATH_GAP_WORD, type PathClip } from "@/lib/tree-path";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";
import { PictureBox, Stage, createClock, useClock, type StageHandle } from "../stage";
import { TakeChip } from "../takes";
import { usePlaySlot } from "../takes/play-slot.ts";
import type { PathPic } from "./PathBar";

/** A step without a film: its first node's picture, with why over it. Every gap's is drawn from the start, so it is ready.
 *  Shown, it lies at z 3: the flat stage lifts its two films to z 1 and 2 (engines.ts raise), above anything laid on the stage
 *  without a z, and the film last shown would otherwise stay on top of the held picture. */
function Held({ pic, word, shown }: { pic: PathPic; word: string; shown: boolean }) {
  const cover = pic.entry ? coverOfEntry(pic.entry) : null;
  return (
    <PictureBox className={shown ? "z-[3]" : "opacity-0"}>
      <div className="absolute inset-0 overflow-hidden bg-black">
        {cover ? (
          <ProofStill cover={cover} fps={pic.entry?.fps ?? 30} fit="contain" className="absolute inset-0" />
        ) : (
          <span className="absolute inset-0 grid place-items-center font-display text-3xl font-semibold text-faint">{pic.code}</span>
        )}
        <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full border border-dashed border-underkand/60 bg-black/70 px-3 py-1 text-sm font-medium text-[#ef8b8b] backdrop-blur-sm">
          {word}
        </span>
      </div>
    </PictureBox>
  );
}

export function PathPlayer({ parts, clips, graph, pic, onClose }: { parts: PlayPart[] | null; clips: readonly PathClip[]; graph: Graph | null; pic: (node: string) => PathPic; onClose: () => void }) {
  const open = !!parts?.length;
  const [clock] = useState(() => createClock());
  const stage = useRef<StageHandle>(null);
  const at = useClock(clock, (s) => s.pos?.step ?? 0);
  // One film plays at a time: opening the path pauses a film playing in the panel, and a film started there pauses the path.
  const slot = usePlaySlot(() => stage.current?.pause());
  useEffect(() => {
    if (open) slot.claim();
    else clock.set({ pos: null, playing: false }); // opened again, the path starts from its first step
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claim once per opening
  }, [open]);

  const count = parts?.length ?? 0;
  const part = parts?.[at] ?? null;
  const clip = clips[at] ?? null;
  const take = part?.take && graph ? (graph.takes[part.take] ?? null) : null;
  const cue = (step: number) => stage.current?.cue(Math.max(0, Math.min(count - 1, step)));

  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/85 data-[state=open]:animate-fade-in" />
        <RD.Content aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()} className="fixed inset-0 z-50 flex flex-col bg-[#060908] focus:outline-none data-[state=open]:animate-fade-in">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
            <RD.Title className="min-w-0 truncate font-display text-lg font-semibold text-ink">{clip?.name ?? "Vägen"}</RD.Title>
            {take ? (
              <>
                <span className="hidden truncate text-sm text-dim sm:inline">{takeName(take, graph?.edge[take.edge]?.takes)}</span>
                <TakeChip take={take} size="sm" />
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <IconButton label="Steget före" icon={<ChevronLeft />} disabled={at <= 0} onClick={() => cue(at - 1)} />
              <span className="min-w-12 text-center text-sm tabular-nums text-dim">
                {Math.min(at + 1, count)} / {count}
              </span>
              <IconButton label="Nästa steg" icon={<ChevronRight />} disabled={at >= count - 1} onClick={() => cue(at + 1)} />
              <RD.Close asChild>
                <IconButton label="Stäng" kbd="Esc" icon={<X />} />
              </RD.Close>
            </div>
          </div>
          {parts?.length ? (
            <Stage ref={stage} parts={parts} mode="platt" clock={clock} className="min-h-0 flex-1 px-4 pb-3 pt-3">
              {parts.map((p, k) => (p.path ? null : <Held key={k} pic={pic(p.from)} word={PATH_GAP_WORD[p.gap ?? "MISSING"]} shown={k === at} />))}
            </Stage>
          ) : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
