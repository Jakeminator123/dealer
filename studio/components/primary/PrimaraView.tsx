"use client";

// Primära: for every film of a whole round, what plays now against the best take Jakob has accepted outright, with the
// seam a Primär would give, and one click per row to make it Primär. First the three films of seat 4 he called very
// good on 12 Nov, then seat by seat (deal, return to A2.1, return to A1), then the dealer, then rest, entry and exit.
// Nothing is chosen in advance and there is no "all at once": every Primär is his own click.
import { Heart } from "lucide-react";
import { useMemo } from "react";
import { BankStatus, Page } from "@/components/shell";
import { ErrorState, Skeleton, cn } from "@/components/ui";
import { useBank } from "@/lib/bank";
import { isSnapshot } from "@/lib/mode";
import { PRAISED_NOTE, primaries, type Group, type RowStatus } from "@/lib/primaries";
import { PrimaryRow, STATUS_WORD, SeamLine } from "./PrimaryRow";
import { useMakePrimary } from "./useMakePrimary";

const ORDER: RowStatus[] = ["different", "same", "none", "gap", "primary"];

export function PrimaraView() {
  const { bank, graph, status, error, reload } = useBank();
  const page = useMemo(() => (bank && graph ? primaries(bank, graph) : null), [bank, graph]);
  const { make, saving, lines } = useMakePrimary();

  const counts = page ? (
    <span className="flex items-center gap-3 text-sm text-dim">
      <span className="font-medium text-ink">{page.rows.length} filmer</span>
      {ORDER.filter((s) => page.counts[s]).map((s) => (
        <span key={s} className={cn("whitespace-nowrap", s === "gap" && "text-[#ef8b8b]", s === "different" && "text-brass-hi")}>
          {page.counts[s]} {page.counts[s] === 1 ? STATUS_WORD[s].word.toLowerCase() : STATUS_WORD[s].many}
        </span>
      ))}
    </span>
  ) : (
    <BankStatus />
  );

  const row = (r: (typeof page & {})["rows"][number], key: string) => (
    <PrimaryRow key={key} row={r} saving={saving === r.proposal?.id} busy={!!saving} line={lines[r.edge.id] ?? null} onMake={(t) => void make(t)} />
  );

  return (
    <Page title="Primära" status={counts}>
      {status === "loading" || (!page && status !== "error") ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[112px]" />
          ))}
        </div>
      ) : !page ? (
        <ErrorState error={error ?? "Klippbanken kunde inte läsas."} onRetry={() => void reload()} />
      ) : (
        <div className="flex flex-col gap-9">
          <p className="max-w-[760px] text-sm text-dim">
            Till vänster det som spelas i en hel runda nu, till höger den bästa tagning du själv har godkänt.{" "}
            {isSnapshot ? (
              "Det här är en kopia: primär väljs bara i Jakobs labb."
            ) : (
              <>
                Ett klick på <b className="font-semibold text-ink">Gör primär</b> sparar ditt val för just den filmen.
              </>
            )}
          </p>

          {page.praised.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Heart aria-hidden className="size-4 fill-brass text-brass" />
                Du sade väldigt bra
                <span className="text-sm font-normal text-faint">{PRAISED_NOTE.replace("du sade väldigt bra ", "")}</span>
              </h2>
              <div className="flex flex-col gap-2.5">{page.praised.map((r) => row(r, `top-${r.edge.id}`))}</div>
            </section>
          ) : null}

          {page.groups.map((g) => (
            <GroupSection key={g.id} group={g}>
              {g.rows.map((r) => row(r, r.edge.id))}
            </GroupSection>
          ))}
        </div>
      )}
    </Page>
  );
}

function GroupSection({ group, children }: { group: Group; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={group.title}>
      <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line pb-2">
        <h2 className="font-display text-lg font-semibold text-ink">{group.title}</h2>
        {group.pairs.length ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Förslagen ihop</span>
            {group.pairs.map((p) => (
              <SeamLine key={p.text} seam={p} />
            ))}
          </div>
        ) : null}
      </header>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}
