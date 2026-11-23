"use client";

// Docka, a part of Scen & bord (/bordet/?lage=docka&plats=p5c1, &del=filmer for the films; Jakob 2026-11-23: "fortsätta
// migreringen av dockans egna tabb till Scen och bord så man kan granska allt som görs med dock-video, men också kunna
// ställa in dockan"). Two parts under Bordet's menu, with the card Kortplan has chosen:
//   Ställ dockan    the doll lab itself in a frame (dealer3d/page/docka.html?inbaddad=1: its poses, the deal to each card,
//                   Naturlig and Som förut, the sliders and Spara som standard, all as on its own page), opened on the chosen
//                   card and the chosen dealer's doll. A card chosen in the lab becomes Bordet's card.
//   Dockans filmer  the doll's films for the chosen card, each beside the films ordered with it (DollFilms.tsx)
// The frame stays loaded while the films are looked at, so that sliders moved and not saved are still there on the way back;
// a card chosen among the films is then chosen in the lab too, unless sliders are moved and not saved there: the lab says
// which card it still shows, and that card is Bordet's. Only in the local lab (the copy has no doll lab).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrdersAnswer } from "../../../src/order-model.ts";
import { SHOE, type Place } from "../../../src/placement-model.ts";
import { dollFilms, takesOf } from "../../lib/doll-films.ts";
import type { Ledger } from "../../lib/ledger.ts";
import { dollFor, placeCode, placeFromCode } from "../../lib/placement.ts";
import { ErrorState, SegmentedControl, Skeleton, cn } from "../ui";
import { DollFilms } from "./DollFilms";

export type DollPart = "stall" | "filmer";
/** The address's word for the part ("del=filmer"); the lab itself needs none. */
export const dollPartOf = (word: string | null): DollPart => (word === "filmer" ? "filmer" : "stall");
/** The films without a card (the entry to an anchor) among the cards of the films' row. */
const ENTRY = "ingang";

/** Writes the part in the address beside Bordet's own words, and takes it out again. */
function writePart(part: DollPart | null) {
  const p = new URLSearchParams(window.location.search);
  if (part === "filmer") p.set("del", part);
  else p.delete("del");
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

export function DollPanel({
  menu, place, setPlace, dealer, orders, ordersRead, ledger, startPart,
}: {
  /** Bordet's menu, first in the toolbar as in its other parts. */
  menu: ReactNode;
  place: Place;
  setPlace: (place: Place) => void;
  dealer: string;
  orders: OrdersAnswer | null;
  ordersRead: boolean;
  ledger: Ledger | null;
  startPart: DollPart;
}) {
  const [part, setPart] = useState<DollPart>(startPart);
  // The lab is loaded when it is first shown, on the card and the doll chosen then, and never again while the part is open.
  const [lab, setLab] = useState<string | null>(() => (startPart === "stall" ? labAddress(place, dealer) : null));
  const [entry, setEntry] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => writePart(part), [part]);
  useEffect(() => () => writePart(null), []);

  // The card chosen in the lab is Bordet's card.
  useEffect(() => {
    const heard = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const said = (event.data as { docklabb?: { place?: unknown } } | null)?.docklabb?.place;
      const next = typeof said === "string" ? placeFromCode(said) : null;
      if (next) {
        setEntry(false);
        setPlace(next);
      }
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  }, [setPlace]);

  const choosePart = (next: DollPart) => {
    setPart(next);
    if (next !== "stall") return;
    if (!lab) setLab(labAddress(place, dealer));
    // back at the lab: the card chosen among the films is asked for there (the lab answers with the card it shows)
    else if (place !== SHOE) frame.current?.contentWindow?.postMessage({ docklabb: { place } }, window.location.origin);
  };

  const groups = useMemo(() => dollFilms(orders?.rendered ?? [], orders?.orders ?? [], ledger?.rows ?? []), [orders, ledger]);
  const chosen = entry ? ENTRY : place;
  const group = groups.find((g) => (g.place ?? ENTRY) === chosen) ?? null;
  const count = groups.reduce((n, g) => n + g.films.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5">
        {menu}
        <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
        <SegmentedControl
          size="sm"
          label="Dockans delar"
          value={part}
          onChange={choosePart}
          options={[
            { value: "stall", label: "Ställ dockan" },
            { value: "filmer", label: count ? `Dockans filmer · ${count}` : "Dockans filmer" },
          ]}
        />
        {part === "filmer" && groups.length ? (
          <div className="min-w-0 overflow-x-auto">
            <SegmentedControl
              size="sm"
              label="Kort"
              value={chosen}
              onChange={(value) => {
                const next = value === ENTRY ? null : placeFromCode(value);
                setEntry(!next);
                if (next) setPlace(next);
              }}
              options={groups.map((g) => {
                const takes = g.films.reduce((n, f) => n + takesOf(f), 0);
                return {
                  value: g.place ?? ENTRY,
                  label: (
                    <>
                      {g.place ? placeCode(g.place as Place) : "Ingång"}
                      <span className="tabular-nums text-faint">{g.films.length}</span>
                    </>
                  ),
                  title: `${g.films.length} ${g.films.length === 1 ? "film" : "filmer"} av dockan, ${takes} ${takes === 1 ? "beställd film" : "beställda filmer"}`,
                };
              })}
            />
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {lab ? <iframe ref={frame} src={lab} title="Docklabbet" data-doll-lab className={cn("absolute inset-0 size-full border-0", part !== "stall" && "hidden")} /> : null}
        {part === "filmer" ? (
          <div className="absolute inset-0 overflow-y-auto [scrollbar-gutter:stable]">
            {!ordersRead ? (
              <Skeleton className="m-4 h-[60vh] rounded-md" />
            ) : !orders ? (
              <ErrorState title="Dockans filmer kunde inte läsas" error="Beställningarna kunde inte läsas från labbservern." />
            ) : (
              <DollFilms group={group} dealer={dealer} word={entry ? "ingången" : placeCode(place)} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The doll lab's address inside the frame: embedded, on the chosen card and the chosen dealer's doll (the standard doll for a dealer without one). */
function labAddress(place: Place, dealer: string): string {
  const p = new URLSearchParams({ inbaddad: "1" });
  if (place !== SHOE) p.set("plats", placeCode(place).toLowerCase());
  p.set("docka", dollFor(dealer).id.replace(/^docka-/, ""));
  return `/dealer3d/docka?${p}`;
}
