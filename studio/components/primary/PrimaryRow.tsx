"use client";

// One row of Primära: a film of the round; what plays there now (still, name, chip, why); an arrow; the best take Jakob
// accepted outright (still, name, chip) with what making it Primär does to the seam, in a few words; and the buttons.
// Each still plays: a click opens it over the whole window (onView, ‹ › to the row's other film), ▶ plays it in place.
// Nothing is chosen in advance: "Gör primär" writes only on his click.
import { ArrowRight, Columns2, Lock, Map as MapIcon, Play, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { WHY_LABEL, type Take } from "../../../src/clip-graph.ts";
import { TakeChip } from "@/components/takes";
import { Badge, Button, buttonClasses, cn, type BadgeTone } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";
import { edgeName, takeName } from "@/lib/names";
import { PRAISED_NOTE, ROLE_WORD, type Row, type RowStatus, type Seam } from "@/lib/primaries";
import { RowStill } from "./RowStill";
import type { RowLine } from "./useMakePrimary";

export const STATUS_WORD: Record<RowStatus, { word: string; many: string; tone: BadgeTone }> = {
  different: { word: "Annat spelas", many: "annat spelas", tone: "brass" },
  same: { word: "Spelas redan", many: "spelas redan", tone: "ok" },
  none: { word: "Inget godkänt av dig", many: "utan ditt godkännande", tone: "neutral" },
  primary: { word: "Primär vald", many: "primär vald", tone: "brass" },
  gap: { word: "Lucka", many: "luckor", tone: "bad" },
};

const SEAM_SIGN: Record<Seam["tone"], { sign: string; className: string }> = {
  ok: { sign: "✓", className: "text-[#6cc595]" },
  warn: { sign: "!", className: "text-[#f0b07a]" },
  bad: { sign: "✕", className: "text-[#ef8b8b]" },
};

export function SeamLine({ seam, className }: { seam: Seam; className?: string }) {
  const s = SEAM_SIGN[seam.tone];
  return (
    <p className={cn("flex gap-1.5 text-xs leading-[17px]", s.className, className)}>
      <span aria-hidden className="w-3 shrink-0 text-center font-semibold">
        {s.sign}
      </span>
      <span className={seam.tone === "ok" ? "text-dim" : undefined}>{seam.text}</span>
    </p>
  );
}

function TakeSide({ take, top, onOpen, children }: { take: Take; top?: ReactNode; onOpen: () => void; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <RowStill take={take} onOpen={onOpen} />
      <div className="flex min-w-0 flex-col gap-1">
        {top}
        <span className="truncate text-sm font-semibold text-ink" title={take.id}>
          {takeName(take)}
        </span>
        <TakeChip take={take} size="sm" className="self-start" />
        {children}
      </div>
    </div>
  );
}

/** Nothing plays: the film's place in the round is empty, said loudly. */
function Missing({ children }: { children: ReactNode }) {
  return <div className="flex h-[88px] items-center rounded-md border border-dashed border-underkand/50 px-4 text-sm text-[#ef8b8b]">{children}</div>;
}

const eyebrow = (text: string, praised = false) => (
  <span className={cn("text-2xs font-semibold uppercase tracking-[0.08em]", praised ? "text-brass" : "text-faint")}>
    {praised ? `♥ ${text}` : text}
  </span>
);

export function PrimaryRow({
  row,
  saving,
  busy,
  line,
  onMake,
  onView,
}: {
  row: Row;
  saving: boolean;
  busy: boolean;
  line: RowLine | null;
  onMake: (take: Take) => void;
  /** Open these films over the whole window, at this one (the row's films with a film, in the order shown). */
  onView: (takes: Take[], index: number) => void;
}) {
  const { edge, now, proposal, status } = row;
  const showsProposal = status === "different" || (status === "gap" && !!proposal);
  const films = [now, showsProposal ? proposal : null].filter((t, i, all): t is Take => !!t?.media.video && all.indexOf(t) === i);
  const open = (take: Take) => {
    const index = films.indexOf(take);
    if (index >= 0) onView(films, index);
  };
  const status_ = STATUS_WORD[status];
  const map = { pathname: "/karta/", query: { kant: edge.id } };
  const compare = proposal && now && proposal.id !== now.id ? { pathname: "/jamfor/", query: { kant: edge.id, a: proposal.id, b: now.id } } : null;
  const play = proposal ? { pathname: "/", query: { kant: edge.id, tagning: proposal.id } } : now ? { pathname: "/", query: { kant: edge.id, tagning: now.id } } : null;
  const canMake = (status === "different" || status === "same") && !!proposal;
  // Brass only where a better take of his waits and making it Primär gives no visible jump.
  const loud = status === "different" && row.seam?.tone !== "bad";

  return (
    <article
      aria-label={`${ROLE_WORD[row.role]}, ${edgeName(edge)}: ${status_.word}`}
      className={cn(
        "grid grid-cols-[124px_minmax(0,0.8fr)_20px_minmax(0,1.2fr)_140px] items-center gap-x-5 gap-y-2 rounded-lg border bg-surface px-4 py-3 shadow-inset",
        row.praised ? "border-brass/35" : "border-line",
      )}
    >
      {/* The film */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-md font-semibold leading-tight text-ink">{ROLE_WORD[row.role]}</span>
        <span className="text-xs text-dim tabular-nums">{edgeName(edge)}</span>
        <Badge tone={status_.tone} className="self-start">
          {status_.word}
        </Badge>
      </div>

      {/* Plays now */}
      {now ? (
        <TakeSide take={now} top={eyebrow("Spelas nu")} onOpen={() => open(now)}>
          <span className="truncate text-xs text-faint">{WHY_LABEL[row.why]}</span>
        </TakeSide>
      ) : (
        <Missing>Inget spelas här · saknas</Missing>
      )}

      <ArrowRight aria-hidden className={cn("size-4", status === "different" ? "text-brass" : "text-line-strong")} />

      {/* The proposal */}
      <div className="flex min-w-0 flex-col gap-2">
        {showsProposal ? (
          <TakeSide take={proposal!} top={row.praised ? eyebrow(PRAISED_NOTE, true) : eyebrow("Bäst av dina godkända")} onOpen={() => open(proposal!)}>
            {row.others.length ? <span className="text-xs text-faint">+{row.others.length} till godkända av dig</span> : null}
          </TakeSide>
        ) : status === "same" ? (
          <div className="flex flex-col gap-1">
            {row.praised ? eyebrow(PRAISED_NOTE, true) : eyebrow("Bäst av dina godkända")}
            <span className="text-sm text-ink">Det som spelas är redan den bästa du godkänt.</span>
            {row.others.length ? <span className="text-xs text-faint">+{row.others.length} till godkända av dig</span> : null}
          </div>
        ) : status === "primary" ? (
          <div className="flex flex-col gap-1">
            {eyebrow("Primär")}
            <span className="inline-flex items-center gap-1.5 text-sm text-ink">
              <Star aria-hidden className="size-3.5 fill-brass text-brass" />
              Du har redan valt primär här.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {eyebrow("Bäst av dina godkända")}
            <span className="text-sm text-faint">{status === "none" ? "Ingen tagning här är godkänd av dig ännu." : "Ingen film att föreslå."}</span>
          </div>
        )}
        {row.seam ? <SeamLine seam={row.seam} /> : null}
      </div>

      {/* What he can do */}
      <div className="flex flex-col items-stretch gap-1.5">
        {canMake && isSnapshot ? (
          <span className="inline-flex items-start gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-xs leading-4 text-dim">
            <Lock aria-hidden className="mt-px size-3.5 shrink-0 text-brass" />
            Här kan ingen döma. Jakob dömer i sitt eget labb.
          </span>
        ) : canMake ? (
          <Button
            variant={loud ? "primary" : "secondary"}
            size="sm"
            icon={<Star className={loud ? undefined : "text-brass"} />}
            loading={saving}
            disabled={busy && !saving}
            onClick={() => onMake(proposal!)}
            title={`Gör ${takeName(proposal!)} till primär i steget ${edgeName(edge)}`}
          >
            Gör primär
          </Button>
        ) : null}
        {status !== "same" && compare ? (
          <Link href={compare} className={buttonClasses({ variant: "quiet", size: "sm", className: "justify-start" })}>
            <Columns2 />
            Jämför
          </Link>
        ) : null}
        {status !== "same" && play && (proposal || now) ? (
          <Link href={play} className={buttonClasses({ variant: "quiet", size: "sm", className: "justify-start" })}>
            <Play />
            I scenen
          </Link>
        ) : null}
        {status === "none" || status === "gap" || status === "primary" ? (
          <Link href={map} className={buttonClasses({ variant: "quiet", size: "sm", className: "justify-start" })}>
            <MapIcon />
            Visa på kartan
          </Link>
        ) : null}
      </div>

      {line ? (
        <p role="alert" className={cn("col-span-5 text-xs", line.tone === "bad" ? "text-[#ef8b8b]" : "text-[#6cc595]")}>
          {line.text}
        </p>
      ) : null}
    </article>
  );
}
