"use client";

// Protokoll (/protokoll/): every take of every order, computed from what is stored and never written by hand
// (lib/ledger.ts, GET /api/orders/ledger, the same join as node tools/order-ledger.ts). Above, what works per method; below,
// one card per take, pictures first. Filters by step and dealer; the dealer follows the studio's switch (?dealer=), and
// "Alla" shows every dealer's. Takes not placed yet are left out until asked for. Read again when the tab comes back.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, asApiError } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import { STEP_GROUPS, STEP_GROUP_LABEL, filterRows, methodChips, sharedFacts, type Ledger, type StepGroup } from "../../lib/ledger.ts";
import { Page } from "../shell";
import { EmptyState, ErrorState, SegmentedControl, Skeleton, Switch } from "../ui";
import { LedgerCard } from "./LedgerCard";
import { LedgerSummary } from "./LedgerSummary";

async function getLedger(): Promise<Ledger> {
  let response: Response;
  try {
    response = await fetch(labUrl("api/orders/ledger"), { cache: "no-store" });
  } catch {
    throw new ApiError("Labbet svarar inte. Starta det med START.cmd.", 0, "network");
  }
  if (response.status === 404) throw new ApiError("Labbet känner inte protokollet än: labbservern behöver startas om.", 404, "missing");
  if (!response.ok) throw new ApiError(`Protokollet gick inte att läsa (${response.status}).`, response.status, "server");
  return (await response.json()) as Ledger;
}

export function LedgerView() {
  const { dealer, setDealer, dealers } = useBank();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [group, setGroup] = useState<StepGroup | "alla">("alla");
  const [everyDealer, setEveryDealer] = useState(false);
  const [unplaced, setUnplaced] = useState(false);

  const read = useCallback(() => {
    getLedger().then(
      (l) => {
        setLedger(l);
        setError(null);
      },
      (e) => setError(asApiError(e, "Protokollet")),
    );
  }, []);
  useEffect(() => {
    read();
    const again = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [read]);

  const all = useMemo(() => ledger?.rows ?? [], [ledger]);
  const own = useMemo(() => filterRows(all, { dealer: everyDealer ? null : dealer }), [all, dealer, everyDealer]);
  const inGroup = useMemo(() => filterRows(own, { group: group === "alla" ? null : group }), [own, group]);
  const cards = useMemo(() => (unplaced ? inGroup : inGroup.filter((r) => r.status.placed)), [inGroup, unplaced]);
  // What every card shown shares is said once above them, not on each card.
  const shared = useMemo(() => new Set(sharedFacts(cards.map((r) => methodChips(r.method, { words: false })))), [cards]);
  const groups = STEP_GROUPS.filter((g) => g !== "ovrigt" || own.some((r) => r.step.group === g));
  const ids = useMemo(() => [...new Set([...dealers.map((d) => d.id), ...all.map((r) => r.dealer)])].filter((id) => all.some((r) => r.dealer === id)), [dealers, all]);
  const nameOf = (id: string) => dealers.find((d) => d.id === id)?.name ?? all.find((r) => r.dealer === id)?.dealerName ?? id;
  const placed = own.filter((r) => r.status.placed).length;
  const notPlaced = inGroup.length - inGroup.filter((r) => r.status.placed).length;

  return (
    <Page
      title="Protokoll"
      status={
        ledger ? (
          <span className="truncate tabular-nums">
            {placed} lagda tagningar · {new Set(own.map((r) => r.order)).size} beställningar · {everyDealer ? "alla dealers" : nameOf(dealer)}
          </span>
        ) : null
      }
    >
      {error && !ledger ? (
        <ErrorState error={error} onRetry={read} />
      ) : !ledger ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <SegmentedControl
              label="Steg"
              size="sm"
              value={group}
              onChange={setGroup}
              options={[{ value: "alla" as const, label: `Alla ${own.length}` }, ...groups.map((g) => ({ value: g, label: `${STEP_GROUP_LABEL[g]} ${own.filter((r) => r.step.group === g).length}`, disabled: !own.some((r) => r.step.group === g) }))]}
            />
            {ids.length ? (
              <SegmentedControl
                label="Dealer"
                size="sm"
                value={everyDealer ? "*" : dealer}
                onChange={(v) => {
                  if (v === "*") setEveryDealer(true);
                  else {
                    setEveryDealer(false);
                    setDealer(v);
                  }
                }}
                options={[...ids.map((id) => ({ value: id, label: nameOf(id) })), ...(ids.length > 1 || !ids.includes(dealer) ? [{ value: "*", label: "Alla" }] : [])]}
              />
            ) : null}
            <Switch size="sm" checked={unplaced} onChange={setUnplaced} label={`Visa ej lagda (${notPlaced})`} />
            {error ? <span className="text-xs text-[#ef8b8b]">{error.message}</span> : null}
          </div>

          {inGroup.length ? <LedgerSummary rows={inGroup} unplaced={unplaced} /> : null}

          {cards.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-faint">
                Tagningarna <span className="tabular-nums text-dim">{cards.length}</span> <span className="normal-case tracking-normal">· nyast först{shared.size ? ` · alla har ${[...shared].join(", ")}` : ""}</span>
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                {cards.map((r) => (
                  <li key={r.key}>
                    <LedgerCard row={r} hide={shared} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState compact title={inGroup.length ? "Inget lagt i det urvalet än" : "Inga beställningar i det urvalet"}>
              {inGroup.length ? "Slå på Visa ej lagda för att se utkasten." : "Välj ett annat steg eller en annan dealer."}
            </EmptyState>
          )}
          {ledger.problems.length ? <p className="text-xs text-faint">Kunde inte läsas: {ledger.problems.join(" ")}</p> : null}
        </div>
      )}
    </Page>
  );
}
