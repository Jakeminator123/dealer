"use client";

// Granska (/granska/?tagning=<id>, /granska/?vy=alla): the takes that wait for Jakob's word, one at a time and large, with
// the queue beside it. After a decision the next waiting take opens by itself, and "Ångra" goes back to the last one and
// takes that decision back (the decision bar's own Återställ write, on his click on "Ångra").
// The count is awaitingJakob, the same as the rail's. "Alla" lists every take with filters, for looking something up.
// In the online copy (isSnapshot) the view opens on "Alla" (?vy=ko for the queue), and the queue says what waits
// (WaitingInCopy) instead of a player without a film; a take opened from "Alla" opens large as in the lab.
// Must be inside <Suspense> (useSearchParams).
import { PartyPopper } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Decision } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { takeNames } from "../../lib/names.ts";
import { nextWaiting, previousWaiting, reviewQueue } from "../../lib/review.ts";
import { Page } from "../shell";
import type { DecisionBarHandle } from "../takes/DecisionBar";
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from "../ui";
import { AllTakes } from "./AllTakes";
import { tabOf, vyFor } from "./copy";
import { QueueList } from "./QueueList";
import { TakeReview, type LastDecision } from "./TakeReview";
import { WaitingInCopy } from "./WaitingInCopy";

const SITTING = "studio.granska.sitting";

/** What Jakob decided in this sitting (this tab), so the list keeps them ticked across views. */
function readSitting(): Map<string, string> {
  try {
    const raw = window.sessionStorage.getItem(SITTING);
    const list = raw ? (JSON.parse(raw) as [string, string][]) : [];
    return new Map(Array.isArray(list) ? list.filter((x) => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string") : []);
  } catch {
    return new Map();
  }
}
function writeSitting(map: ReadonlyMap<string, string>) {
  try {
    window.sessionStorage.setItem(SITTING, JSON.stringify([...map]));
  } catch {
    /* private window: the list forgets on reload */
  }
}

function replaceParams(next: Record<string, string | null>) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value) p.set(key, value);
    else p.delete(key);
  }
  const query = p.toString();
  // null, not history.state: Next's patched replaceState leaves useSearchParams as it was when it is handed its own state
  // (__NA), so the view would not follow its own address (a take opened from "Alla" stayed on "Alla"). With null Next
  // copies its state over and updates useSearchParams (next/dist/client/components/app-router.js).
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function ReviewView() {
  const params = useSearchParams();
  const view = tabOf(params.get("vy"), isSnapshot);
  const { graph, status, error, reload } = useBank();
  const [sitting, setSitting] = useState<Map<string, string>>(() => new Map());
  const [current, setCurrent] = useState<string | null>(() => params.get("tagning"));
  // The copy: a take opened by hand (from "Alla", or by its address) is shown large; otherwise the queue says what waits.
  const [chosen, setChosen] = useState(() => !!params.get("tagning"));
  const [advanceFrom, setAdvanceFrom] = useState<string | null>(null);
  const [last, setLast] = useState<LastDecision | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoAsked, setUndoAsked] = useState<string | null>(null); // "Ångra" was clicked for this take
  const main = useRef<HTMLDivElement>(null);
  const bar = useRef<DecisionBarHandle>(null);

  useEffect(() => setSitting(readSitting()), []);
  const queue = useMemo(() => (graph ? reviewQueue(graph, sitting) : null), [graph, sitting]);

  // Which take is open: the one asked for; after a decision the next waiting one; else the first waiting one.
  useEffect(() => {
    if (!queue || !graph) return;
    if (advanceFrom) {
      setCurrent(nextWaiting(queue.items, advanceFrom));
      setAdvanceFrom(null);
      main.current?.focus({ preventScroll: true }); // Space now plays the next film, not the button just pressed
      return;
    }
    if (current && graph.takes[current]) return;
    setCurrent(nextWaiting(queue.items, null));
  }, [queue, graph, advanceFrom, current]);

  useEffect(() => {
    if (view === "ko" && (!isSnapshot || chosen)) replaceParams({ tagning: current });
  }, [current, view, chosen]);

  const open = useCallback((id: string) => {
    setCurrent(id);
    setChosen(true);
    setUndoing(null);
    setUndoAsked(null);
  }, []);

  const take = current && graph ? (graph.takes[current] ?? null) : null;

  // "Ångra": the take is open again; now its decision bar makes its Återställ write. Only ever after his click on "Ångra".
  useEffect(() => {
    if (!undoAsked || take?.id !== undoAsked) return;
    setUndoAsked(null);
    const handle = bar.current;
    if (!handle) return setUndoing(undoAsked);
    const id = undoAsked;
    void handle.reset().then((ok) => {
      if (!ok) setUndoing(id);
    });
  }, [undoAsked, take]);
  const edge = take && graph ? graph.edge[take.edge] : null;
  const waitingItems = queue?.items.filter((i) => !i.decided) ?? [];
  const position = take ? waitingItems.findIndex((i) => i.take.id === take.id) + 1 || null : null;

  const saved = useCallback(
    (decision: Decision) => {
      if (!take || !edge) return;
      const name = takeNames(edge.takes).get(take.id) ?? take.id;
      setSitting((now) => {
        const next = new Map(now);
        if (decision === "PENDING") next.delete(take.id);
        else next.set(take.id, decision);
        writeSitting(next);
        return next;
      });
      setUndoing(null);
      if (decision === "PENDING") {
        setLast(null);
        return;
      }
      setLast({ id: take.id, name, decision });
      setAdvanceFrom(take.id);
    },
    [take, edge],
  );

  const tabs = (
    <SegmentedControl
      label="Visa"
      value={view}
      onChange={(v) => {
        const tab = v === "alla" ? "alla" : "ko";
        if (isSnapshot) setChosen(false); // the copy's queue tab shows what waits
        replaceParams({ vy: vyFor(tab, isSnapshot), tagning: tab === "alla" || isSnapshot ? null : current });
      }}
      options={[
        { value: "ko", label: queue ? `Kö · ${queue.waiting}` : "Kö" },
        { value: "alla", label: graph ? `Alla · ${Object.keys(graph.takes).length}` : "Alla" },
      ]}
    />
  );
  const decidedNow = queue?.items.filter((i) => i.decided).length ?? 0;
  const status_ = queue ? (
    <span>
      {/* In the copy the person looking is not the one who decides. */}
      {queue.waiting ? `${queue.waiting} väntar på ${isSnapshot ? "Jakob" : "dig"}` : `Inget väntar på ${isSnapshot ? "Jakob" : "dig"}`}
      {decidedNow ? <span className="text-faint"> · {decidedNow} avgjorda nu</span> : null}
    </span>
  ) : null;

  if (status === "loading")
    return (
      <Page title="Granska" full>
        <div className="grid h-full grid-cols-[minmax(0,1fr)_320px] gap-0">
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-10 w-80" />
            <Skeleton className="flex-1" />
            <Skeleton className="h-24" />
          </div>
          <div className="border-l border-line bg-surface p-4">
            <Skeleton className="h-full" />
          </div>
        </div>
      </Page>
    );
  if (!graph || !queue)
    return (
      <Page title="Granska">
        <ErrorState error={error} onRetry={() => void reload()} />
      </Page>
    );

  if (view === "alla")
    return (
      <Page title="Granska" status={status_} actions={tabs}>
        <AllTakes
          graph={graph}
          onOpen={(id) => {
            open(id);
            replaceParams({ vy: vyFor("ko", isSnapshot), tagning: id });
          }}
        />
      </Page>
    );

  if (isSnapshot && !chosen)
    return (
      <Page title="Granska" status={status_} actions={tabs} full>
        <WaitingInCopy items={queue.items} onOpen={(id) => open(id)} onAll={() => replaceParams({ vy: vyFor("alla", isSnapshot), tagning: null })} />
      </Page>
    );

  return (
    <Page title="Granska" status={status_} actions={tabs} full>
      {/* The queue narrows, then steps aside, when the view is narrow (the bot's panel docked at 1280 px leaves about 800):
          the take keeps its room, and ‹ › in its header still steps through what waits. */}
      <div className="@container/granska h-full">
      <div className="grid h-full grid-cols-[minmax(0,1fr)] @min-[1000px]/granska:grid-cols-[minmax(0,1fr)_240px] @min-[1200px]/granska:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={main} tabIndex={-1} className="min-h-0 min-w-0 outline-none">
          {take && edge ? (
            <TakeReview
              take={take}
              edge={edge}
              position={position}
              waiting={queue.waiting}
              onStep={
                waitingItems.length > (position ? 1 : 0)
                  ? (n) => {
                      const id = n > 0 ? nextWaiting(queue.items, take.id) : previousWaiting(queue.items, take.id);
                      if (id) open(id);
                    }
                  : null
              }
              onSaved={saved}
              last={last}
              onUndo={() => {
                if (!last) return;
                open(last.id);
                setUndoAsked(last.id);
              }}
              undoing={undoing === take.id}
              barRef={bar}
            />
          ) : (
            <EmptyState
              icon={<PartyPopper />}
              title={`Allt är granskat. Inget väntar på ${isSnapshot ? "Jakob" : "dig"}.`}
              action={
                <Button variant="quiet" onClick={() => replaceParams({ vy: "alla", tagning: null })}>
                  Se alla tagningar
                </Button>
              }
              className="h-full"
            />
          )}
        </div>
        <aside aria-label="Kön" className="hidden min-h-0 flex-col border-l border-line bg-surface @min-[1000px]/granska:flex">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
            <span className="text-sm font-semibold text-ink">Kön</span>
            <span className="text-xs text-faint tabular-nums">{queue.waiting ? `${queue.waiting} väntar` : "tom"}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            {queue.items.length ? (
              <QueueList items={queue.items} current={current} onOpen={open} />
            ) : (
              <p className="px-4 py-6 text-sm text-faint">Inget i kön.</p>
            )}
          </div>
        </aside>
      </div>
      </div>
    </Page>
  );
}
