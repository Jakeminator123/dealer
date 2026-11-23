"use client";

// Tal on Karta (Jakob 2026-11-23: the talk films "ska väl rimligen in i nodträdet också"): the panel of a tree's talk, opened
// from the Tal chip on A1, where she speaks. Media first: the chosen line's film, with sound, and its text under it; under
// that every line as a short chip, the round's and the chat's, filled where the game has a film for it in the tree and dashed
// where it has none (the game then shows the text). A chip plays its line. The film is the one the game plays in the tree
// (lib/tree-talk.ts); the panel only shows, and judges and chooses nothing. The chosen line is in the address (?replik=<key>).
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { FilmPlayer, type FilmPlayerHandle } from "@/components/player";
import { Sheet, cn } from "@/components/ui";
import { talkWord, type TalkKind, type TalkLine, type TreeTalk } from "@/lib/tree-talk";

export const TALK_SHEET_W = 480;
const KIND_WORD: Record<TalkKind, string> = { runda: "Rundan", chatt: "Chatt" };
/** "tagning 16": the take's number, never its id. */
const takeWord = (clip: string) => `tagning ${Number(/-(\d+)$/.exec(clip)?.[1] ?? 0) || clip}`;

function LineChip({ line, on, onClick }: { line: TalkLine; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={`${line.text}${line.clip ? ` · spelas: ${takeWord(line.clip)}` : " · ingen talfilm: spelet visar texten"}${line.takes ? ` · ${line.takes} ${line.takes === 1 ? "film" : "filmer"}` : ""}`}
      className={cn(
        "h-7 rounded-full border px-2.5 text-[12px] leading-none transition-colors duration-150",
        on ? "border-brass/70 bg-brass/10 text-ink" : line.clip ? "border-line-strong text-dim hover:bg-raised hover:text-ink" : "border-dashed border-[#ef8b8b]/60 text-faint hover:text-dim",
      )}
    >
      {line.name}
    </button>
  );
}

export function TalkSheet({
  open,
  tree,
  talk,
  chosen,
  elsewhere = null,
  onChoose,
  onClose,
}: {
  open: boolean;
  /** The tree's name. */
  tree: string;
  talk: TreeTalk | null;
  /** The chosen line's key; none or an unknown one: the first line with a film. */
  chosen: string | null;
  /** Where the tree has no film at all: which tree has them ("Casino har 25/25"). */
  elsewhere?: string | null;
  onChoose: (key: string) => void;
  onClose: () => void;
}) {
  const player = useRef<FilmPlayerHandle>(null);
  // A chip clicked plays its film as soon as it is loaded (a link that opens the panel only shows it).
  const wanted = useRef(false);
  const line = talk ? (talk.lines.find((l) => l.key === chosen) ?? talk.lines.find((l) => l.clip) ?? talk.lines[0] ?? null) : null;
  const pick = (key: string) => {
    wanted.current = true;
    onChoose(key);
  };
  const kinds = (["runda", "chatt"] as const).map((kind) => ({ kind, lines: talk?.lines.filter((l) => l.kind === kind) ?? [] })).filter((k) => k.lines.length);
  return (
    <Sheet open={open && !!talk} onOpenChange={(o) => !o && onClose()} title="Tal" subtitle={talk ? `${tree} · ${talkWord(talk)} repliker` : ""} width={TALK_SHEET_W}>
      {talk ? (
        <div className="flex flex-col gap-4">
          {line?.clip && line.video ? (
            <figure className="flex flex-col gap-2">
              <FilmPlayer
                key={line.clip}
                ref={player}
                src={line.video}
                fps={line.fps}
                frames={line.frames}
                audio
                aspect={3 / 2}
                label={`Tal: ${line.name}`}
                className="h-[350px] w-full"
                onLoaded={() => {
                  if (!wanted.current) return;
                  wanted.current = false;
                  void player.current?.play();
                }}
              />
              <figcaption className="flex flex-col gap-1">
                <span className="text-sm text-ink">”{line.text}”</span>
                <span className="flex items-center gap-2 text-xs text-faint">
                  {line.name} · spelas: {takeWord(line.clip)}
                  <Link href={`/granska/?tagning=${encodeURIComponent(line.clip)}`} className="ml-auto inline-flex items-center gap-0.5 hover:text-ink">
                    Granska
                    <ArrowUpRight className="size-3" />
                  </Link>
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="grid aspect-[3/2] w-full place-items-center rounded-md border border-dashed border-line-strong px-6 text-center">
              <span className="flex flex-col gap-1.5">
                {line ? <span className="text-sm text-dim">”{line.text}”</span> : null}
                <span className="text-xs text-faint">
                  Ingen talfilm i {tree}
                  {talk.have === 0 && elsewhere ? `. ${elsewhere}.` : ": spelet visar texten."}
                </span>
              </span>
            </div>
          )}
          {kinds.map(({ kind, lines }) => (
            <div key={kind} className="flex flex-col gap-1.5">
              <span className="text-xs text-faint">{KIND_WORD[kind]}</span>
              <div className="flex flex-wrap gap-1.5">
                {lines.map((l) => (
                  <LineChip key={l.key} line={l} on={l.key === line?.key} onClick={() => pick(l.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
