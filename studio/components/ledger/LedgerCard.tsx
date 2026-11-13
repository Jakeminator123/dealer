"use client";

// <LedgerCard row={row} hide={facts} />: one take of an order in the protocol. Its still first (a film of the bank scrubs under the
// pointer; a picture of Material; or, before there is anything of the take, the order's first picture dimmed), with the
// step and the reviewer's score laid over it; then the method as chips, Jakob's verdict as the views' own chip with his
// words, the reviewer's note on demand, and links to "Det här skickas" and to Granska or Material. hide: method facts every
// card on the page shares (said once above them).
import Link from "next/link";
import { ArrowUpRight, ImageOff } from "lucide-react";
import { labUrl } from "../../lib/lab.ts";
import { STEP_GROUP_LABEL, methodChips, scoreWords, type LedgerRow } from "../../lib/ledger.ts";
import { Fold } from "../review/Fold";
import { VerdictChip } from "../takes";
import { TakeThumb } from "../takes/TakeThumb";
import { Badge, Card, cn } from "../ui";

/** Status words worth a badge: a take on its way or one that failed. Införd and granskad say nothing more than the verdict. */
const QUIET = new Set(["INFÖRD", "GRANSKAD"]);
const TONE: Record<string, "wait" | "bad" | "remark" | "variant" | "neutral"> = { MISSLYCKAD: "bad", OSÄKER: "remark", AVBRUTEN: "neutral", UTKAST: "neutral", INTE_LAGD: "wait" };

function Still({ row }: { row: LedgerRow }) {
  const { see } = row;
  const label = [STEP_GROUP_LABEL[row.step.group], row.step.seat].filter(Boolean).join(" · ");
  const over = (
    <>
      <span className="absolute left-1.5 top-1.5 rounded-xs bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-ink">{label}</span>
      <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-black/70 px-1.5 py-0.5 text-2xs tabular-nums text-dim">#{row.take}</span>
      {row.reviewer?.score != null ? (
        <span
          title={row.reviewer.back !== null ? `Granskaren: given ${scoreWords(row.reviewer.deal)}, returen ${scoreWords(row.reviewer.back)} av 5` : "Granskarens poäng av 5"}
          className="absolute right-1.5 top-1.5 rounded-md bg-black/75 px-2 py-1 font-display text-lg font-semibold leading-none tabular-nums text-ink"
        >
          {scoreWords(row.reviewer.score)}
          <span className="text-xs font-normal text-dim">/5</span>
        </span>
      ) : null}
    </>
  );
  if (see.film) {
    const take = { id: row.key, media: { video: see.film, first: null }, fps: see.fps, frames: see.frames, segment: null, landingFrame: see.landing };
    return (
      <TakeThumb take={take} still="film" className="rounded-md border border-line">
        {over}
      </TakeThumb>
    );
  }
  const src = see.picture ?? see.stand;
  return (
    <div className="relative aspect-[3/2] overflow-hidden rounded-md border border-line bg-well">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file; a static export cannot optimise
        <img src={labUrl(src)} alt={row.title} loading="lazy" className={cn("size-full object-cover", !see.picture && "opacity-35 grayscale")} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-faint">
          <ImageOff className="size-5" />
        </div>
      )}
      {!see.picture ? (
        <span className="absolute inset-x-0 bottom-8 text-center text-xs font-medium text-dim">{!row.status.placed ? "Inte lagd" : row.kind === "STILL" ? "Inte i Material än" : "Inte i banken än"}</span>
      ) : null}
      {over}
    </div>
  );
}

export function LedgerCard({ row, hide }: { row: LedgerRow; hide?: ReadonlySet<string> }) {
  const back = row.parts.find((p) => p.part === "return");
  const fixes = row.parts.filter((p) => p.part === "fix");
  const status = QUIET.has(row.status.code) ? null : row.status;
  return (
    <Card className={cn("flex h-full flex-col gap-2.5 p-2.5", !row.status.placed && "opacity-80")}>
      <Still row={row} />
      <div className="min-w-0 px-0.5">
        <p className="truncate text-sm font-semibold text-ink" title={row.title}>
          {row.title}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {methodChips(row.method).map((c) =>
            hide?.has(c) ? null : (
              <Badge key={c} tone={c === row.method.modelLabel ? "brass" : "neutral"}>
                {c}
              </Badge>
            ),
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
        {row.status.placed ? <VerdictChip verdict={row.owner.verdict} byJakob={row.owner.byJakob} detail={row.owner.detail} size="md" /> : null}
        {back ? (
          <span className="inline-flex items-center gap-1 text-2xs text-faint">
            retur <VerdictChip verdict={back.verdict} byJakob={back.byJakob} detail={back.detail} size="sm" />
          </span>
        ) : null}
        {fixes.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1 text-2xs text-faint" title={f.label}>
            lagad <VerdictChip verdict={f.verdict} byJakob={f.byJakob} size="sm" />
          </span>
        ))}
        {status ? (
          <Badge tone={TONE[status.code] ?? "variant"} className="ml-auto">
            {status.label}
          </Badge>
        ) : null}
      </div>
      {row.owner.words ? <p className="px-0.5 text-sm leading-5 text-ink">”{row.owner.words}”</p> : null}
      {row.reviewer ? (
        <Fold lines={1} className="px-0.5 text-xs leading-4 text-dim">
          {row.reviewer.note.replace(/^oberoende granskare:\s*/i, "Granskaren: ")}
        </Fold>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-0.5 pt-2 text-xs">
        <Link href={row.see.send} className="inline-flex items-center gap-0.5 text-brass-hi hover:underline">
          Det här skickas <ArrowUpRight className="size-3" />
        </Link>
        {row.see.review ? (
          <Link href={row.see.review} className="inline-flex items-center gap-0.5 text-brass-hi hover:underline">
            Granska <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
        {row.see.material ? (
          <Link href={row.see.material} className="inline-flex items-center gap-0.5 text-brass-hi hover:underline">
            Material <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
        {row.cost.credits !== null ? <span className="ml-auto tabular-nums text-faint">{row.cost.spent ? `${row.cost.credits} krediter` : "ej lagd"}</span> : null}
      </div>
    </Card>
  );
}
