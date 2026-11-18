"use client";

// The takes a proof names (lib/proofs.ts takesNamed), so that a proof is one press from them in Granska's part Filmer.
// useNamedTakes(): every take of every dealer's bank by id, with its edge, its dealer and whether it waits for Jakob's
// word (awaitingJakob, the rail's rule). <ProofTakes proof={proof} named={named} />: those takes as small cards with
// their own verdict chips (a verdict judged for him stays marked as such: TakeChip), the waiting ones first; a press
// opens the take in Filmer; <WaitingLink> beside the proof's title goes to the first waiting one. The proof itself gets no
// verdict here.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { buildGraph, type Edge, type Take } from "../../../src/clip-graph.ts";
import { useBank } from "../../lib/bank.ts";
import { bankDealers, dealerHref, nameOf } from "../../lib/dealer.ts";
import { takeEdgeName, takeNames } from "../../lib/names.ts";
import { takesNamed } from "../../lib/proofs.ts";
import type { Proof } from "../../lib/api.ts";
import { awaitingJakob } from "../../lib/verdict.ts";
import { TakeCard } from "../takes";
import { Button, buttonClasses } from "../ui";

export type NamedTake = { take: Take; edge: Edge; dealer: string; name: string; waiting: boolean };
export type NamedTakes = ReadonlyMap<string, NamedTake>;

/** Every take of the bank by id, each dealer's (the chosen dealer's graph as the bank built it, the others built here). */
export function useNamedTakes(): NamedTakes {
  const { bank, graph, dealer, owners } = useBank();
  return useMemo(() => {
    const map = new Map<string, NamedTake>();
    if (!bank || !graph) return map;
    for (const id of bankDealers(owners)) {
      const g = id === dealer ? graph : buildGraph(bank, { dealer: id });
      const waiting = new Set(awaitingJakob(g).map((t) => t.id));
      const names = new Map<string, Map<string, string>>();
      for (const take of Object.values(g.takes)) {
        const edge = g.edge[take.edge];
        if (!edge) continue;
        if (!names.has(edge.id)) names.set(edge.id, takeNames(edge.takes));
        map.set(take.id, { take, edge, dealer: id, name: names.get(edge.id)!.get(take.id) ?? take.id, waiting: waiting.has(take.id) });
      }
    }
    return map;
  }, [bank, graph, dealer, owners]);
}

/** The takes a proof names that wait for Jakob's word, in the order the proof names them. */
const waitingOf = (proof: Proof, named: NamedTakes): NamedTake[] =>
  takesNamed(proof, (id) => named.has(id))
    .map((id) => named.get(id)!)
    .filter((t) => t.waiting);

/** How many of the takes a proof names wait for Jakob's word (a card's count). */
export const waitingIn = (proof: Proof, named: NamedTakes): number => waitingOf(proof, named).length;

/** A take open in Granska's part Filmer, as its own dealer's. */
const takeHref = (t: NamedTake): string => dealerHref(`/granska/?tagning=${encodeURIComponent(t.take.id)}`, t.dealer);

/** Beside a proof's title when takes it names wait: one press to the first of them in Filmer. */
export function WaitingLink({ proof, named }: { proof: Proof; named: NamedTakes }) {
  const waiting = useMemo(() => waitingOf(proof, named), [proof, named]);
  if (!waiting.length) return null;
  return (
    <Link href={takeHref(waiting[0])} className={buttonClasses({ variant: "primary", size: "sm", className: "w-fit" })}>
      Döm i Filmer · {waiting.length === 1 ? "1 tagning väntar" : `${waiting.length} tagningar väntar`} <ArrowRight />
    </Link>
  );
}

const FIRST = 6;

export function ProofTakes({ proof, named }: { proof: Proof; named: NamedTakes }) {
  const router = useRouter();
  const { dealer, dealers } = useBank();
  const [all, setAll] = useState(false);
  const items = useMemo(() => {
    const found = takesNamed(proof, (id) => named.has(id)).map((id) => named.get(id)!);
    return [...found.filter((t) => t.waiting), ...found.filter((t) => !t.waiting)];
  }, [proof, named]);
  if (!items.length) return null;
  const waiting = items.filter((t) => t.waiting).length;
  const shown = all ? items : items.slice(0, FIRST);

  return (
    <section aria-label="Tagningar i provet" className="flex flex-col gap-3">
      <h3 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
        {items.length === 1 ? "1 tagning i provet" : `${items.length} tagningar i provet`}
        {waiting ? <span className="font-medium text-brass-hi">· {waiting} väntar på ditt beslut</span> : null}
        <span className="font-normal text-faint">· klicka för att öppna i Filmer</span>
      </h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {shown.map((t) => (
          <li key={t.take.id}>
            <TakeCard
              take={t.take}
              name={t.name}
              layout="row"
              still="first"
              onSelect={() => router.push(takeHref(t))}
              extra={
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{[t.dealer !== dealer ? (dealers.find((d) => d.id === t.dealer)?.name ?? nameOf(t.dealer)) : null, takeEdgeName(t)].filter(Boolean).join(" · ")}</span>
                  {t.waiting ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-brass-hi">
                      Döm i Filmer <ArrowRight className="size-3.5" />
                    </span>
                  ) : null}
                </span>
              }
              className="h-full"
            />
          </li>
        ))}
      </ul>
      {items.length > FIRST ? (
        <Button variant="quiet" size="sm" className="w-fit" onClick={() => setAll(!all)}>
          {all ? "Visa färre" : `Visa alla ${items.length}`}
        </Button>
      ) : null}
    </section>
  );
}
