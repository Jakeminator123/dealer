"use client";

// Dockans filmer (Bordet's part Docka, DollPanel.tsx): for the chosen card, each film of the doll's with the films that were
// ordered with it as their reference beside it, so that the doll and what came of her are seen side by side (Jakob
// 2026-11-23: "så man kan granska allt som görs med dock-video"). The doll's film first in its row, then one film per take:
// the bank's film where the take is brought in, else the delivered file of the order's folder. Under a take: Jakob's verdict
// as the views' own chip (a reviewer's is dashed), the reviewer's score where there is one, and the ways to Granska and to
// "Det här skickas". Nothing is judged here. "Spela ihop" starts a row's films together from their first frame.
// What is shown is joined in lib/doll-films.ts from the orders' answer and the protocol; nothing is read from disk here.
import { ArrowUpRight, Play } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { DollFilm, DollGroup } from "../../lib/doll-films.ts";
import { labUrl } from "../../lib/lab.ts";
import { scoreWords, type LedgerRow } from "../../lib/ledger.ts";
import { VerdictChip } from "../takes";
import { Badge, Button, EmptyState, cn } from "../ui";

/** One film in a row: the picture in the film's own shape, and what is said under it. */
function Cell({ src, stand, doll = false, children }: { src: string; stand?: string | null; doll?: boolean; children: ReactNode }) {
  // A delivered file the lab does not hand out (an older server) leaves the order's first picture in its place, dimmed.
  const [failed, setFailed] = useState(false);
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className={cn("relative aspect-[1764/1174] overflow-hidden rounded-md border bg-well", doll ? "border-brass/45" : "border-line")}>
        {failed ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a lab file; a static export cannot optimise */}
            {stand ? <img src={labUrl(stand)} alt="" className="size-full object-contain opacity-35 grayscale" /> : null}
            <span className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-dim">Filmen lämnas inte ut av labbet</span>
          </>
        ) : (
          <video src={labUrl(src)} controls muted playsInline preload="metadata" onError={() => setFailed(true)} className="size-full object-contain" />
        )}
      </div>
      <figcaption className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-xs text-dim">{children}</figcaption>
    </figure>
  );
}

/** A take's line: which order, his verdict, the reviewer's score, the ways on. */
function TakeLine({ row, dealer, many }: { row: LedgerRow; dealer: string; many: boolean }) {
  const back = row.parts.find((p) => p.part === "return");
  const own = row.order.startsWith(`${row.dealer}-`) ? row.order.slice(row.dealer.length + 1) : row.order;
  return (
    <>
      <span className="font-mono text-ink" title={row.title}>
        {row.dealer === dealer ? own : row.order}
        {many ? ` · ${row.take}` : ""}
      </span>
      {row.see.film ? (
        <VerdictChip verdict={row.owner.verdict} byJakob={row.owner.byJakob} detail={row.owner.detail} size="sm" />
      ) : (
        <Badge tone="wait" title="Tagningen är inte införd i banken: den har ingen dom">
          inte i banken
        </Badge>
      )}
      {back ? (
        <span className="inline-flex items-center gap-1 text-2xs text-faint">
          retur <VerdictChip verdict={back.verdict} byJakob={back.byJakob} detail={back.detail} size="sm" />
        </span>
      ) : null}
      {row.reviewer?.score != null ? (
        <Badge tone="neutral" title={row.reviewer.note.replace(/^oberoende granskare:?\s*/i, "Granskaren: ")}>
          granskaren {row.reviewer.back !== null && row.reviewer.deal !== null ? `${scoreWords(row.reviewer.deal)} · ${scoreWords(row.reviewer.back)}` : scoreWords(row.reviewer.score)}/5
        </Badge>
      ) : null}
      <span className="ml-auto flex items-center gap-2.5">
        {row.see.review ? (
          <Link href={row.see.review} className="inline-flex items-center gap-0.5 text-brass-hi hover:underline">
            Granska <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
        <Link href={row.see.send} className="inline-flex items-center gap-0.5 text-brass-hi hover:underline">
          Skickat <ArrowUpRight className="size-3" />
        </Link>
      </span>
      {row.owner.words ? (
        <span className="basis-full truncate text-ink" title={row.owner.words}>
          ”{row.owner.words}”
        </span>
      ) : null}
    </>
  );
}

const DOLL_WORD: Record<string, string> = { paow: "Paows docka" };
const seconds = (n: number) => `${String(n).replace(".", ",")} s`;

/** One film of the doll's and the takes made with it, side by side. */
function FilmRow({ entry, dealer }: { entry: DollFilm; dealer: string }) {
  const films = useRef<HTMLDivElement>(null);
  const together = () => {
    for (const v of films.current?.querySelectorAll("video") ?? []) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  };
  const takes = entry.orders.flatMap((o) => o.takes.map((row) => ({ row, many: o.takes.length > 1 })));
  const without = entry.orders.flatMap((o) => o.without);
  return (
    <section data-doll-film={entry.film.id} className="flex flex-col gap-2.5 border-b border-line px-4 py-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm font-semibold text-ink" title={entry.film.id}>
          {entry.name}
        </h3>
        <Badge tone={entry.doll ? "brass" : "neutral"}>{entry.doll ? (DOLL_WORD[entry.doll] ?? entry.doll) : "Standarddockan"}</Badge>
        {entry.film.shape === "ROUND_TRIP" ? <Badge>giv och återgång</Badge> : null}
        <span className="text-xs tabular-nums text-faint">{seconds(entry.film.seconds)}</span>
        {takes.length ? (
          <Button size="sm" variant="quiet" icon={<Play />} onClick={together} className="ml-auto">
            Spela ihop
          </Button>
        ) : null}
      </header>
      <div ref={films} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-3">
        <Cell src={entry.film.path} doll>
          <span className="font-medium text-brass-hi">Dockan</span>
          {takes.length ? null : <span>ingen film beställd med den</span>}
        </Cell>
        {takes.map(({ row, many }) => (
          <Cell key={row.key} src={(row.see.film ?? row.see.file)!} stand={row.see.stand}>
            <TakeLine row={row} dealer={dealer} many={many} />
          </Cell>
        ))}
      </div>
      {without.length ? (
        <p className="text-xs text-faint">
          Utan film: {without.map((row) => `${row.order} (${row.status.label.toLowerCase()})`).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

export function DollFilms({ group, dealer, word }: { group: DollGroup | null; dealer: string; /** The chosen card in his words ("P4C2"), for the empty list. */ word: string }) {
  if (!group)
    return (
      <EmptyState title={`Dockan har ingen film till ${word}`}>Välj ett kort i raden ovan: där står korten dockan har filmer till.</EmptyState>
    );
  return (
    <div data-doll-films={group.place ?? "ingang"} className="flex flex-col">
      {group.films.map((entry) => (
        <FilmRow key={entry.film.id} entry={entry} dealer={dealer} />
      ))}
    </div>
  );
}
