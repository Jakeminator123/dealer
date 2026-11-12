"use client";

// Granska (/granska/?tagning=<id>, /granska/?vy=alla): the takes that wait for Jakob's word, one at a time and large, with
// the queue beside it. After a decision the next waiting take opens by itself, and "Ångra" goes back to the last one.
// The count is awaitingJakob, the same as the rail's. "Alla" lists every take with filters, for looking something up.
// Must be inside <Suspense> (useSearchParams).
import { PartyPopper } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Decision } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { takeNames } from "../../lib/names.ts";
import { nextWaiting, previousWaiting, reviewQueue } from "../../lib/review.ts";
import { Page } from "../shell";
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from "../ui";
import { AllTakes } from "./AllTakes";
import { QueueList } from "./QueueList";
import { TakeReview, type LastDecision } from "./TakeReview";

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
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function ReviewView() {
  const params = useSearchParams();
  const view = params.get("vy") === "alla" ? "alla" : "ko";
  const { graph, status, error, reload } = useBank();
  const [sitting, setSitting] = useState<Map<string, string>>(() => new Map());
  const [current, setCurrent] = useState<string | null>(() => params.get("tagning"));
  const [advanceFrom, setAdvanceFrom] = useState<string | null>(null);
  const [last, setLast] = useState<LastDecision | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const main = useRef<HTMLDivElement>(null);

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
    if (view === "ko") replaceParams({ tagning: current });
  }, [current, view]);

  const open = useCallback((id: string) => {
    setCurrent(id);
    setUndoing(null);
  }, []);

  const take = current && graph ? (graph.takes[current] ?? null) : null;
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
      onChange={(v) => replaceParams({ vy: v === "alla" ? "alla" : null, tagning: v === "alla" ? null : current })}
      options={[
        { value: "ko", label: queue ? `Kö · ${queue.waiting}` : "Kö" },
        { value: "alla", label: graph ? `Alla · ${Object.keys(graph.takes).length}` : "Alla" },
      ]}
    />
  );
  const decidedNow = queue?.items.filter((i) => i.decided).length ?? 0;
  const status_ = queue ? (
    <span>
      {queue.waiting ? `${queue.waiting} väntar på dig` : "Inget väntar på dig"}
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
            replaceParams({ vy: null, tagning: id });
          }}
        />
      </Page>
    );

  return (
    <Page title="Granska" status={status_} actions={tabs} full>
      <div className="grid h-full grid-cols-[minmax(0,1fr)_320px]">
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
                setUndoing(last.id);
              }}
              undoing={undoing === take.id}
            />
          ) : (
            <EmptyState
              icon={<PartyPopper />}
              title="Allt är granskat. Inget väntar på dig."
              action={
                <Button variant="quiet" onClick={() => replaceParams({ vy: "alla", tagning: null })}>
                  Se alla tagningar
                </Button>
              }
              className="h-full"
            />
          )}
        </div>
        <aside aria-label="Kön" className="flex min-h-0 flex-col border-l border-line bg-surface">
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
    </Page>
  );
}
