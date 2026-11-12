"use client";

// What the view on screen shows, for the bot's panel (components/bot): the view's name, its address and what is chosen
// there in Jakob's words. Each view says it with ONE line:
//
//   useViewContext({vy: "scen", val: {rum: "Salong", grupp: "Ljus"}})          in a client component (a hook)
//   useViewContext({vy: "spela", val: {...}, live: () => ({steg: "2/3"})})      live: read when a question is asked
//   <ViewContext vy="karta" />                                                  in a page: reads the view's own address
//
// <ViewContext> knows the views that keep their choice in the address (karta, granska, jamfor, prov: inside the page's
// <Suspense>, since it reads useSearchParams) and primara (nothing chosen). The panel reads it all with useCurrentView()
// and readView(). In the local studio nothing reads it; it costs one small object per view.
import { useSearchParams } from "next/navigation";
import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cleanVal, describeGranska, describeJamfor, describeKarta, describeProv, viewName, type Val } from "../components/bot/describe.ts";
import { getProofs, type Proof } from "./api.ts";
import { useBank } from "./bank.ts";
import type { Vy } from "./bot-client.ts";

export { stepFacts } from "../components/bot/describe.ts";

export type ViewKey = "spela" | "karta" | "primara" | "jamfor" | "granska" | "prov" | "scen" | "onskemal";
type Loose = Record<string, string | null | undefined>;
export type ViewInput = { vy: ViewKey | (string & {}); val?: Loose; live?: () => Loose };

/** The view as the panel shows it: its key, name, the chosen things (val) and a reader for what changes every frame. */
export type CurrentView = { vy: string; namn: string; val: Val; key: string };

let current: (CurrentView & { live: (() => Loose) | null; token: number }) | null = null;
let serial = 0;
const calls = new Set<() => void>();
const tell = () => {
  for (const call of calls) call();
};

function subscribe(call: () => void) {
  calls.add(call);
  return () => calls.delete(call);
}
const snapshot = () => current;
const none = () => null;

/** Says what the view shows; the last view to say it is the one on screen. Call it on every render. */
export function useViewContext({ vy, val, live }: ViewInput): void {
  const clean = cleanVal(val);
  const key = JSON.stringify([vy, clean]);
  const latest = useRef(live);
  useEffect(() => {
    latest.current = live;
  });
  useEffect(() => {
    const token = ++serial;
    const [name, chosen] = JSON.parse(key) as [string, Val];
    current = { vy: name, namn: viewName(name), val: chosen, key, live: () => latest.current?.() ?? {}, token };
    tell();
    return () => {
      if (current?.token !== token) return;
      current = null;
      tell();
    };
  }, [key]);
}

/** The view on screen, for the panel's chip; null in a moment between views. */
export function useCurrentView(): CurrentView | null {
  return useSyncExternalStore(subscribe, snapshot, none);
}

/** The view as it goes with a question or a request: name, the address now, the chosen things and the live ones. */
export function readView(): Vy | null {
  if (!current || typeof window === "undefined") return null;
  let live: Val = {};
  try {
    live = cleanVal(current.live?.() ?? {});
  } catch {
    live = {};
  }
  return { namn: current.namn, adress: window.location.pathname + window.location.search, val: { ...current.val, ...live } };
}

// ── For pages that are server components ────────────────────────────────────
let proofs: Promise<Proof[]> | null = null;
const readProofs = () => (proofs ??= getProofs().then((list) => (Array.isArray(list.proofs) ? list.proofs : []), () => ((proofs = null), [])));

/**
 * The address's question as the view keeps it. useSearchParams follows Next's navigations and a replaceState(null, …),
 * but a view that writes its address with replaceState(history.state, …) (Granska, Prov, Jämför) passes Next's own state
 * along, and Next then leaves useSearchParams as it was; so the address itself is also looked at, twice a second.
 */
function useQuery(): string {
  const params = useSearchParams();
  const fromNext = params.toString();
  const [seen, setSeen] = useState(fromNext);
  useEffect(() => {
    const look = () => setSeen(window.location.search.replace(/^\?/, ""));
    look();
    const timer = window.setInterval(look, 500);
    window.addEventListener("popstate", look);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", look);
    };
  }, [fromNext]);
  return seen;
}

function FromAddress({ vy }: { vy: ViewKey }) {
  const query = useQuery();
  const { graph } = useBank();
  const [list, setList] = useState<Proof[] | null>(null);
  useEffect(() => {
    if (vy !== "prov") return;
    let gone = false;
    void readProofs().then((p) => !gone && setList(p));
    return () => {
      gone = true;
    };
  }, [vy]);
  const val = useMemo(() => {
    const p = new URLSearchParams(query);
    if (vy === "karta") return describeKarta(graph, p);
    if (vy === "granska") return describeGranska(graph, p);
    if (vy === "jamfor") return describeJamfor(graph, p);
    if (vy === "prov") return describeProv(list, p);
    return {};
  }, [vy, graph, list, query]);
  useViewContext({ vy, val });
  return null;
}

function Plain({ vy }: { vy: ViewKey }) {
  useViewContext({ vy });
  return null;
}

const FROM_ADDRESS: readonly ViewKey[] = ["karta", "granska", "jamfor", "prov"];

/** One line in a page: <ViewContext vy="karta" />. Views that read their address must sit inside the page's Suspense. */
export function ViewContext({ vy }: { vy: ViewKey }) {
  return FROM_ADDRESS.includes(vy) ? createElement(FromAddress, { vy }) : createElement(Plain, { vy });
}
