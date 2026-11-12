"use client";

// Jämför (/jamfor/?kant=<edge>&a=<take>&b=<take>): a take beside the primary. Without b, B is the edge's Primär, else the
// take that plays now; without a, A is the newest take waiting for Jakob. Both are then written into the address, so the
// pair stays the same after a decision (A made Primär is still compared with the B he came with). Without an edge: the
// edges where there is a choice. Must be inside <Suspense> (useSearchParams).
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { describeEdge } from "../../../src/clip-graph.ts";
import { useBank } from "../../lib/bank.ts";
import { edgeName } from "../../lib/names.ts";
import { comparePair } from "../../lib/review.ts";
import { awaitingJakob } from "../../lib/verdict.ts";
import { BankStatus, Page } from "../shell";
import { EmptyState, ErrorState, Skeleton, buttonClasses } from "../ui";
import { ChoiceList } from "./ChoiceList";
import { Comparison } from "./Comparison";

/** The address of this page with new parameters, without a new history entry (useSearchParams follows). */
function replaceParams(next: Record<string, string | null>) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value) p.set(key, value);
    else p.delete(key);
  }
  // null, never window.history.state: see components/proofs/ProofsView.tsx.
  window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
}

export function CompareView() {
  const params = useSearchParams();
  const kant = params.get("kant");
  const aId = params.get("a");
  const bId = params.get("b");
  const { graph, status, error, reload } = useBank();
  const edge = kant && graph ? (graph.edge[kant] ?? null) : null;
  const waiting = useMemo(() => new Set(graph ? awaitingJakob(graph).map((t) => t.id) : []), [graph]);
  const pair = useMemo(() => (edge ? comparePair(edge, aId, bId, waiting) : null), [edge, aId, bId, waiting]);

  // The pair in the address, once it is known.
  useEffect(() => {
    if (!pair?.a || !pair.b) return;
    if (pair.a.id !== aId || pair.b.id !== bId) replaceParams({ a: pair.a.id, b: pair.b.id });
  }, [pair, aId, bId]);

  const pick = useCallback(
    (side: "a" | "b", id: string) => {
      if (!pair) return;
      const other = side === "a" ? pair.b?.id : pair.a?.id;
      // Picking the other side's take swaps them.
      if (id === other) replaceParams({ a: side === "a" ? id : (pair.b?.id ?? null), b: side === "a" ? (pair.a?.id ?? null) : id });
      else replaceParams({ [side]: id });
    },
    [pair],
  );

  const back = (
    <Link href="/jamfor/" className={buttonClasses({ variant: "quiet", size: "sm" })}>
      <ArrowLeft /> Alla val
    </Link>
  );

  if (!kant)
    return (
      <Page title="Jämför" status={<BankStatus />}>
        {status === "loading" ? <ChoiceSkeleton /> : status === "error" || !graph ? <ErrorState error={error} onRetry={() => void reload()} /> : <ChoiceList graph={graph} />}
      </Page>
    );

  if (status === "loading")
    return (
      <Page title="Jämför" status={<BankStatus />} full>
        <div className="grid h-full grid-cols-2 gap-4 p-5">
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
        </div>
      </Page>
    );
  if (!graph) return <Page title="Jämför" status={<BankStatus />}><ErrorState error={error} onRetry={() => void reload()} /></Page>;
  if (!edge || !pair?.a || !pair.b)
    return (
      <Page title="Jämför" status={<BankStatus />} actions={back}>
        <EmptyState title={edge ? "Bara en film här" : "Filmen finns inte"} action={back}>
          {edge ? `${edgeName(edge)} har inte två tagningar med film att jämföra.` : `Ingen film heter ${kant} i klippbanken.`}
        </EmptyState>
      </Page>
    );

  return (
    <Page
      title="Jämför"
      full
      status={
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="font-semibold text-ink">{edgeName(edge)}</span>
          <span className="truncate text-faint">{edge.experiment ? "experiment" : describeEdge(edge)}</span>
        </span>
      }
      actions={back}
    >
      <Comparison edge={edge} a={pair.a} b={pair.b} role={pair.role} takes={pair.takes} onPick={pick} />
    </Page>
  );
}

function ChoiceSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 pt-10">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-56 rounded-lg" />
      ))}
    </div>
  );
}
