"use client";

// Beställ (/bestall/?order=<id>): the queue of orders for Runway, and for one order the screen "Det här skickas". The
// address holds the open order, so a link brings it back. /bestall/?ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1 (plats=alla
// for the first card to every player) opens "Ny beställning" with those values chosen, ?ny=1&som=<id> with every choice of
// that order ("Ny beställning som den här"); the sheet is mounted anew for each
// such address, and closing it takes the values out of the address. Reads GET /api/orders on load and when the tab is
// seen again; writes only on Jakob's clicks (a new draft, a change, an approval). Not in the online copy. Inside <Suspense>.
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { asApiError, type ApiError } from "../../lib/api.ts";
import { useViewContext } from "../../lib/context.ts";
import { PRESET_PARAMS, getOrders, presetOf, shownWords, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { Page } from "../shell";
import { ErrorState, Skeleton } from "../ui";
import { NewOrder } from "./NewOrder";
import { OrderList } from "./OrderList";
import { SendScreen } from "./SendScreen";

type State = { status: "loading" } | { status: "ready"; all: OrdersAnswer } | { status: "error"; error: ApiError };

/** Opens "Ny beställning" with every choice of an order (?ny=1&som=<id>); the open order stays in the address. */
function askLike(id: string) {
  const p = new URLSearchParams(window.location.search);
  for (const name of PRESET_PARAMS) p.delete(name);
  p.set("ny", "1");
  p.set("som", id);
  window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
}

/** Writes the address: the open order, and without the values a new order was asked with. Next's own state is not handed back. */
function setOrderParam(id: string | null, dropPreset = false) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set("order", id);
  else p.delete("order");
  if (dropPreset) for (const name of PRESET_PARAMS) p.delete(name);
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

export function OrderView() {
  const params = useSearchParams();
  const asked = params.get("order");
  const [state, setState] = useState<State>({ status: "loading" });
  const [opened, setOpened] = useState(false);
  // A new order asked for by address is open while the address asks for it; "Ny beställning" opens one without.
  const askedNew = params.get("ny") === "1";
  const presetKey = PRESET_PARAMS.map((n) => params.get(n) ?? "").join("|");
  const creating = opened || askedNew;
  const setCreating = (open: boolean) => {
    setOpened(open);
    if (!open && askedNew) setOrderParam(asked, true);
  };

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
  useViewContext({ vy: "Beställ", val: { beställning: open?.order.title, status: open ? shownWords(open) : undefined, antal: all ? String(all.orders.length) : undefined } });

  // A saved answer replaces its order in the list at once; the list is then read again for the day's sums.
  const saved = (answer: OrderAnswer) => {
    setState((s) => (s.status === "ready" ? { status: "ready", all: { ...s.all, orders: s.all.orders.some((a) => a.order.id === answer.order.id) ? s.all.orders.map((a) => (a.order.id === answer.order.id ? answer : a)) : [answer, ...s.all.orders] } } : s));
    void read();
  };

  if (state.status === "loading")
    return (
      <Page title="Beställ">
        <div className="grid grid-cols-3 gap-4 pt-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </Page>
    );
  if (state.status === "error" || !all)
    return (
      <Page title="Beställ">
        <ErrorState title="Beställningarna kunde inte läsas" error={state.status === "error" ? state.error : null} onRetry={() => void read()} />
      </Page>
    );

  return (
    <>
      {open ? <SendScreen answer={open} all={all} onBack={() => setOrderParam(null)} onOpen={(id) => setOrderParam(id)} onSaved={saved} onLike={askLike} /> : <OrderList all={all} onOpen={(id) => setOrderParam(id)} onNew={() => setCreating(true)} onChanged={() => void read()} />}
      <NewOrder
        key={presetKey}
        open={creating}
        onOpenChange={setCreating}
        all={all}
        preset={presetOf(params, all.plan)}
        onCreated={(answer) => {
          saved(answer);
          setOpened(false);
          setOrderParam(answer.order.id, true);
        }}
      />
    </>
  );
}
