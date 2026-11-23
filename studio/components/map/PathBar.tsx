"use client";

// The path being picked on Karta (Väg), at the foot of the map: its pictures in order, small, each join a short line that is
// green where a film plays and red and dashed where it does not; then Ångra (the last node off), Rensa (the whole path off),
// Spela (its films back to back, PathPlayer) and a cross that leaves Väg. Few words: the pictures say the path.
import { Play, Undo2, X } from "lucide-react";
import { Fragment } from "react";
import { Button, IconButton, cn } from "@/components/ui";
import type { EntryAnswer } from "@/lib/media";
import { PATH_GAP_WORD, type PathClip } from "@/lib/tree-path";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";
import { LINE } from "./EdgeChip";

export type PathPic = { entry: EntryAnswer | null; code: string };

function Thumb({ pic }: { pic: PathPic }) {
  const cover = pic.entry ? coverOfEntry(pic.entry) : null;
  return (
    <span className={cn("relative block h-10 w-[60px] shrink-0 overflow-hidden rounded-sm", cover ? "border border-line-strong bg-well" : "border border-dashed border-line-strong")} title={pic.code}>
      {cover ? <ProofStill cover={cover} fps={pic.entry?.fps ?? 30} className="absolute inset-0" /> : null}
      <span className={cn("absolute bottom-0.5 left-0.5 rounded-xs px-1 text-[10px] font-semibold leading-[14px]", cover ? "bg-black/65 text-ink" : "text-dim")}>{pic.code}</span>
    </span>
  );
}

function Join({ clip }: { clip: PathClip }) {
  const film = !clip.gap;
  const title = film ? clip.name : `${clip.name}: ${PATH_GAP_WORD[clip.gap!]}`;
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" className="shrink-0" role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M1,5 H15" stroke={film ? LINE.godkand : LINE.gap} strokeWidth={2} strokeDasharray={film ? undefined : "2 3"} />
      <path d="M21,5 L14,1.5 L14,8.5 Z" fill={film ? LINE.godkand : LINE.gap} />
    </svg>
  );
}

export function PathBar({
  path,
  clips,
  pic,
  onUndo,
  onClear,
  onPlay,
  onClose,
  className,
}: {
  path: readonly string[];
  clips: readonly PathClip[];
  pic: (node: string) => PathPic;
  onUndo: () => void;
  onClear: () => void;
  onPlay: () => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-line-strong bg-surface/95 p-2 shadow-pop backdrop-blur-sm", className)}>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {path.length ? (
          path.map((node, k) => (
            <Fragment key={k}>
              {k > 0 && clips[k - 1] ? <Join clip={clips[k - 1]} /> : null}
              <Thumb pic={pic(node)} />
            </Fragment>
          ))
        ) : (
          <span className="whitespace-nowrap px-2 text-sm text-dim">Klicka bilderna i ordning</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label="Ångra" icon={<Undo2 />} disabled={!path.length} onClick={onUndo} />
        <Button variant="quiet" size="sm" disabled={!path.length} onClick={onClear}>
          Rensa
        </Button>
        <Button variant="primary" size="sm" icon={<Play />} disabled={path.length < 2} onClick={onPlay}>
          Spela
        </Button>
        <IconButton label="Lämna Väg" icon={<X />} onClick={onClose} />
      </div>
    </div>
  );
}
