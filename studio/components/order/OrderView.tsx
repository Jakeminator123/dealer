"use client";

// Kön (/bordet/?lage=ko&order=<id>), Scen & bord's part for the orders to Runway: what a round lacks, the queue, and for one
// order the screen "Det här skickas" with its approval. The address holds the open order, so a link brings it back. New drafts
// are made in Kortplan's step 3 (its Förhandsvisa), never here. Reads GET /api/orders on load and when the tab is seen again;
// writes only on Jakob's clicks (a change, an approval). Not in the online copy. Inside <Suspense>.
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { asApiError, type ApiError } from "../../lib/api.ts";
import { useViewContext } from "../../lib/context.ts";
import { getOrders, shownWords, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { ErrorState, Skeleton } from "../ui";
import { OrderList } from "./OrderList";
import { QueueFrame } from "./QueueFrame";
import { SendScreen } from "./SendScreen";

type State = { status: "loading" } | { status: "ready"; all: OrdersAnswer } | { status: "error"; error: ApiError };

/** Writes the open order into the address. Next's own state is not handed back. */
function setOrderParam(id: string | null) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set("order", id);
  else p.delete("order");
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

export function OrderView({ menu }: { menu: ReactNode }) {
  const params = useSearchParams();
  const asked = params.get("order");
  const [state, setState] = useState<State>({ status: "loading" });

  const read = useCallback(async () => {
    try {
      setState({ status: "ready", all: await getOrders() });
    } catch (error) {
      setState((s) => (s.status === "ready" ? s : { status: "error", error: asApiError(error, "Beställningarna") }));
    }
  }, []);
  useEffect(() => {
    void read();
    const seen = () => document.visibilityState === "visible" && void read();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [read]);

  const all = state.status === "ready" ? state.all : null;
  const open = all && asked ? (all.orders.find((a) => a.order.id === asked) ?? null) : null;
  useViewContext({ vy: "Kön", val: { beställning: open?.order.title, status: open ? shownWords(open) : undefined, antal: all ? String(all.orders.length) : undefined } });

  // A saved answer replaces its order in the list at once; the list is then read again for the sums.
  const saved = (answer: OrderAnswer) => {
    setState((s) => (s.status === "ready" ? { status: "ready", all: { ...s.all, orders: s.all.orders.some((a) => a.order.id === answer.order.id) ? s.all.orders.map((a) => (a.order.id === answer.order.id ? answer : a)) : [answer, ...s.all.orders] } } : s));
    void read();
  };

  if (state.status === "loading")
    return (
      <QueueFrame menu={menu} status={<span className="text-dim">Läser beställningarna …</span>}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </QueueFrame>
    );
  if (state.status === "error" || !all)
    return (
      <QueueFrame menu={menu}>
        <ErrorState title="Beställningarna kunde inte läsas" error={state.status === "error" ? state.error : null} onRetry={() => void read()} />
      </QueueFrame>
    );
  return open ? (
    <SendScreen menu={menu} answer={open} all={all} onBack={() => setOrderParam(null)} onOpen={(id) => setOrderParam(id)} onSaved={saved} />
  ) : (
    <OrderList menu={menu} all={all} onOpen={(id) => setOrderParam(id)} />
  );
}
