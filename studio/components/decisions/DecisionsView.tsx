"use client";

// Beslut (/beslut/): what waits for Jakob, one card per thing, the most urgent first (the order of data/decisions.json),
// with how many wait at the top. A card is a question to answer (Beslut) or a thing only he can do (Att göra); a press on
// a chip saves his answer at once and the card moves under "Besvarade", folded, where it can be changed or taken back.
// Agents add and close the entries; only his press writes an answer (tools/decision-store.ts). Only in the lab
// (app/beslut/page.tsx).
import { CheckCheck, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { splitDecisions, waitingLine } from "../../lib/decisions.ts";
import { Page } from "../shell/Page";
import { cn } from "../ui/cn";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import { DecisionCard } from "./DecisionCard";
import { refreshDecisions, useDecisions } from "./useDecisions";

export function DecisionsView() {
  const { answer, error, status } = useDecisions();
  const [open, setOpen] = useState(false);
  const { waiting, answered } = useMemo(() => splitDecisions(answer?.decisions ?? []), [answer]);

  return (
    <Page title="Beslut" status={answer ? <span className={cn(waiting.length > 0 && "font-medium text-ink")}>{waitingLine(waiting.length)}</span> : null}>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
        {!answer && status === "error" ? <ErrorState title="Frågorna kunde inte läsas" error={error} onRetry={() => void refreshDecisions()} /> : null}
        {!answer && status !== "error" ? (
          <div aria-busy className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-lg" />
            ))}
          </div>
        ) : null}
        {answer ? (
          <>
            {waiting.length ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-dim">
                <span className="font-display text-2xl font-semibold leading-8 text-ink">{waiting.length}</span>
                <span>väntar på dig · det som brådskar mest står först</span>
              </p>
            ) : null}
            {error ? (
              <p role="status" className="text-xs text-[#ef8b8b]">
                {error.message} Det som syns är det som lästes senast.
              </p>
            ) : null}
            {waiting.length ? (
              waiting.map((d) => <DecisionCard key={d.id} decision={d} />)
            ) : (
              <EmptyState icon={<CheckCheck />} title="Inget väntar på dig">
                När en agent behöver ditt svar dyker det upp här.
              </EmptyState>
            )}
            {answered.length ? (
              <section aria-label="Besvarade" className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                  className="-ml-1 flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-md font-semibold text-dim transition-colors hover:text-ink"
                >
                  <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", !open && "-rotate-90")} />
                  Besvarade
                  <span className="font-normal tabular-nums text-faint">{answered.length}</span>
                </button>
                {open ? answered.map((d) => <DecisionCard key={d.id} decision={d} />) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Page>
  );
}
