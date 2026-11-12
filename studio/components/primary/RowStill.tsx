"use client";

// <RowStill take={take} onOpen={() => …} />: a take's still in a Primära row (Jakob 2026-11-12: "shouldn't I get an overlay
// with these videos that I can play"). A click on the still opens the film over the whole window (the shared FilmViewer,
// with ‹ › to the row's other film); the small ▶ plays it here, in the still's place, round and round, until × or another
// film starts (one film at a time: components/takes/play-slot.ts). A take without a film is only its still.
import { Maximize2, Play, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { FilmPlayer, type FilmPlayerHandle } from "@/components/player";
import { TakeThumb } from "@/components/takes";
import { usePlaySlot } from "@/components/takes/play-slot";
import { cn } from "@/components/ui";
import { takeName } from "@/lib/names";

const OVER =
  "pointer-events-auto grid size-7 place-items-center rounded-full bg-black/60 text-ink shadow-[0_2px_10px_rgb(0_0_0/0.5)] backdrop-blur-sm transition-[background-color,transform] duration-150 hover:scale-105 hover:bg-black/80 [&_svg]:size-3.5";

export function RowStill({ take, onOpen, className }: { take: Take; onOpen: () => void; className?: string }) {
  const film = !!take.media.video;
  const name = takeName(take);
  const [playing, setPlaying] = useState(false);
  const player = useRef<FilmPlayerHandle>(null);
  const slot = usePlaySlot(() => setPlaying(false));
  const stop = () => {
    slot.release();
    setPlaying(false);
  };

  return (
    <div className={cn("group/still relative w-[132px] shrink-0", className)}>
      {playing ? (
        <div className="aspect-[3/2] w-full">
          <FilmPlayer
            ref={player}
            src={take.media.video ?? null}
            fps={take.fps}
            frames={take.frames}
            range={take.segment}
            speed={take.speed}
            controls={false}
            loop
            label={`Film: ${name}`}
            onLoaded={() => void player.current?.play()}
            onPlayingChange={(on) => (on ? slot.claim() : undefined)}
            className="h-full"
            stageClassName="[&>div]:rounded-md"
          />
        </div>
      ) : film ? (
        <button type="button" onClick={onOpen} aria-label={`Visa ${name} stort`} title="Visa stort" className="block w-full cursor-zoom-in rounded-md focus-visible:outline-offset-2">
          <TakeThumb take={take} still="film" className="rounded-md" />
        </button>
      ) : (
        <TakeThumb take={take} still="film" className="rounded-md" />
      )}
      {film ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          {playing ? (
            <div className="absolute right-1 top-1 flex gap-1">
              <button
                type="button"
                aria-label={`Visa ${name} stort`}
                title="Visa stort"
                onClick={() => {
                  player.current?.pause();
                  stop();
                  onOpen();
                }}
                className={OVER}
              >
                <Maximize2 />
              </button>
              <button type="button" aria-label="Stäng filmen" title="Tillbaka till stillbilden" onClick={stop} className={OVER}>
                <X />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-label={`Spela ${name} här`}
                title="Spela här"
                onClick={() => {
                  slot.claim();
                  setPlaying(true);
                }}
                className={cn(OVER, "absolute bottom-1 left-1 [&_svg]:translate-x-px [&_svg]:fill-current")}
              >
                <Play />
              </button>
              <Maximize2 aria-hidden className="absolute right-1.5 top-1.5 size-3.5 text-white/85 opacity-0 drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)] transition-opacity duration-150 group-hover/still:opacity-100" />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
