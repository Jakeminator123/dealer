"use client";

// The films of one step in its panel on Karta (lib/primaries.ts stepFilms): the Primär large, and each secondary film as a
// row (still, name, verdict, how the game uses it, and for the proposal the seam a Primär would give), with "Gör primär" on
// his click only, "Jämför" and "I scenen". UseChip says the use in a word or two; its tooltip says it in a sentence.
import { Ban, Columns2, Heart, MessageSquare, Play, Repeat, Shuffle, Star, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Edge, Take } from "../../../src/clip-graph.ts";
import { TakeCard, TakeChip } from "@/components/takes";
import { Button, buttonClasses, cn } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";
import { edgeName, takeName } from "@/lib/names";
import { PRAISED_NOTE, type Film, type Seam, type Use, type UseKind } from "@/lib/primaries";
import { RowStill } from "./RowStill";

const USE_LOOK: Record<UseKind, { icon: LucideIcon; className: string }> = {
  always: { icon: Play, className: "border-godkand/50 text-[#6cc595] [&_svg]:fill-current" },
  some: { icon: Play, className: "border-godkand/35 text-[#9ccfb2]" },
  loop: { icon: Repeat, className: "border-variant/45 text-[#9db3f8]" },
  hub: { icon: Shuffle, className: "border-variant/45 text-[#9db3f8]" },
  request: { icon: MessageSquare, className: "border-line-strong text-dim" },
  never: { icon: Ban, className: "border-dashed border-line-strong text-faint" },
};

/** How the game uses a film, as a chip: "Spelas", "Före retur till A1", "Vilan · gest · 12 %", "Spelas inte". */
export function UseChip({ use, className }: { use: Use; className?: string }) {
  const look = USE_LOOK[use.kind];
  const Icon = look.icon;
  return (
    <span title={use.detail} className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 text-2xs font-medium leading-none", look.className, className)}>
      <Icon aria-hidden className="size-2.5" />
      {use.word}
    </span>
  );
}

const SEAM_SIGN: Record<Seam["tone"], { sign: string; className: string }> = {
  ok: { sign: "✓", className: "text-[#6cc595]" },
  warn: { sign: "!", className: "text-[#f0b07a]" },
  bad: { sign: "✕", className: "text-[#ef8b8b]" },
};

export function SeamLine({ seam, className }: { seam: Seam; className?: string }) {
  const s = SEAM_SIGN[seam.tone];
  return (
    // A span, not a p: inside TakeCard it stands in the card's button.
    <span className={cn("flex gap-1.5 text-xs leading-[17px]", s.className, className)}>
      <span aria-hidden className="w-3 shrink-0 text-center font-semibold">
        {s.sign}
      </span>
      <span className={seam.tone === "ok" ? "text-dim" : undefined}>{seam.text}</span>
    </span>
  );
}

const QUIET = buttonClasses({ variant: "quiet", size: "sm" });
const scene = (edge: Edge, take: Take) => ({ pathname: "/bordet/", query: { lage: "scen", kant: edge.id, tagning: take.id } });
const compare = (edge: Edge, take: Take, other: Take | null) => (other && other.id !== take.id ? { pathname: "/jamfor/", query: { kant: edge.id, a: take.id, b: other.id } } : null);

/** The Primär, large: its film plays in place or over the whole window. */
export function PrimaryFilm({ film, edge, name, selected, onPick, onExpand }: { film: Film; edge: Edge; name?: string; selected: boolean; onPick: () => void; onExpand?: () => void }) {
  return (
    <div id={`tagning-${film.take.id}`} className="scroll-mt-4">
      <TakeCard
        take={film.take}
        name={name}
        still="film"
        play
        onExpand={onExpand}
        selected={selected}
        onSelect={onPick}
        extra={
          <span className="flex flex-col gap-1.5 pt-0.5">
            <UseChip use={film.use} className="self-start" />
            {film.seam ? <SeamLine seam={film.seam} /> : null}
          </span>
        }
        actions={
          <Link href={scene(edge, film.take)} className={QUIET}>
            <Play />
            I scenen
          </Link>
        }
      />
    </div>
  );
}

/** A secondary film as a row: what it is, how the game uses it, and what he can do with it. */
export function SecondaryFilm({
  film,
  edge,
  name,
  against,
  selected,
  saving,
  busy,
  onMake,
  onPick,
  onOpen,
}: {
  film: Film;
  edge: Edge;
  name?: string;
  /** What "Jämför" sets it beside: the Primär, else what plays now. */
  against: Take | null;
  selected: boolean;
  saving: boolean;
  busy: boolean;
  onMake: () => void;
  onPick: () => void;
  onOpen: () => void;
}) {
  const { take, use, seam, proposal, praised } = film;
  const title = name ?? takeName(take, edge.takes);
  const versus = compare(edge, take, against);
  // Brass only where his best take waits and making it Primär gives no visible jump.
  const loud = proposal && seam?.tone !== "bad";
  const eyebrow: ReactNode = praised ? (
    <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-[0.08em] text-brass">
      <Heart aria-hidden className="size-3 fill-current" />
      {PRAISED_NOTE}
    </span>
  ) : proposal ? (
    <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Bäst av dina godkända</span>
  ) : null;
  return (
    <article
      id={`tagning-${take.id}`}
      aria-label={`${title}: ${use.word}`}
      className={cn(
        "flex scroll-mt-4 gap-3 rounded-lg border bg-surface p-2 pr-3 shadow-inset transition-[border-color] duration-150",
        selected ? "border-brass/70 shadow-[0_0_0_1px_rgb(217_185_106/0.5)]" : proposal ? "border-brass/30" : "border-line",
      )}
    >
      <RowStill take={take} onOpen={onOpen} className="w-[168px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {eyebrow}
        <button type="button" onClick={onPick} aria-pressed={selected} className="flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-offset-2" title={take.id}>
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          <TakeChip take={take} size="sm" />
        </button>
        <UseChip use={use} className="self-start" />
        {seam ? <SeamLine seam={seam} /> : null}
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
          {isSnapshot ? null : (
            <Button
              variant={loud ? "primary" : "secondary"}
              size="sm"
              icon={<Star className={loud ? undefined : "text-brass"} />}
              loading={saving}
              disabled={busy && !saving}
              onClick={onMake}
              title={`Gör ${title} till Primär i steget ${edgeName(edge)}`}
            >
              Gör primär
            </Button>
          )}
          {versus ? (
            <Link href={versus} className={QUIET} title={`Jämför med ${takeName(against!, edge.takes)}`}>
              <Columns2 />
              Jämför
            </Link>
          ) : null}
          <Link href={scene(edge, take)} className={QUIET}>
            <Play />
            I scenen
          </Link>
        </div>
      </div>
    </article>
  );
}
