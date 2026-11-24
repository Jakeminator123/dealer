"use client";

// The doll in Scen & bord's Kortplan (Jakob 2026-11-23: Kortplan and Docka "känns som typ samma sak"; "EN väg och ETT ställe
// man använder dockan"). Step 2, Hur det kommer dit, shows the doll where the plan's picture is, on the card Kortplan has
// chosen; the toolbar chooses between the plan and the doll's two views:
//   Ställ dockan    the doll lab itself in a frame (dealer3d/page/docka.html?inbaddad=1: its poses, the deal to each card,
//                   Naturlig and Som förut, the sliders and Spara som standard, all as on its own page), opened on the chosen
//                   card and the chosen dealer's doll. A card chosen in the lab becomes Bordet's card, and one chosen in Bordet
//                   is chosen in the lab, unless sliders are moved and not saved there: the lab then says which card it still
//                   shows, and that card is Bordet's.
//   Dockans filmer  the doll's films for the chosen card, each beside the films ordered with it (DollFilms.tsx)
// Step 2 says in one line which saved standard the card's deal is (DollNote), and step 3 makes the draft from it for a deal from
// A2.3 to a player's card or one of the dealer's own (DOLL_CARD; NewFilm.tsx; lib/orders.ts orderDoll, tools/doll-order.ts):
// what is saved in the lab is what is ordered. The dealer's own cards lie closed or open as the lab saved them; where that
// side is not the plan's, both steps say so before anything is made (sideClash).
// The frame stays loaded while the plan or the films are looked at, so that sliders moved and not saved are still there on the
// way back. Only in the local lab (the copy has no doll lab).
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrdersAnswer } from "../../../src/order-model.ts";
import { SHOE, type Place, type Side } from "../../../src/placement-model.ts";
import { dollFilms, takesOf, type DollGroup } from "../../lib/doll-films.ts";
import type { Ledger } from "../../lib/ledger.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { dollFor, placeCode, placeFromCode } from "../../lib/placement.ts";
import { ErrorState, SegmentedControl, Skeleton, cn } from "../ui";
import { DollFilms } from "./DollFilms";

export type DollPart = "stall" | "filmer";
/** The address's word for the part ("del=filmer"); the lab itself needs none. */
export const dollPartOf = (word: string | null): DollPart => (word === "filmer" ? "filmer" : "stall");
/** The films without a card (the entry to an anchor) among the cards of the films' row. */
const ENTRY = "ingang";
/** The cards a deal from A2.3 is ordered to from the doll: a player's, or one of the dealer's own (tools/doll-order.ts). */
export const DOLL_CARD = /^(?:P[1-7]\.C[12]|D\.C[1-3])$/;
/** The dealer's own cards: the ones the doll lays closed or open (dealer3d/page/lay.ts Steer.side). */
const DEALER_CARD = /^D\.C[1-3]$/;
/** A card's side as it lies, in the words of the plan's "Vid landning" and of the doll lab's "Kortet ligger". */
const SIDE_WORD: Record<Side, string> = { BACK: "stängt", FRONT: "öppet" };

/** The doll lab's word for the chosen dealer's doll: hers, or the standard doll for a dealer without one. */
const dollWord = (dealer: string) => dollFor(dealer).id.replace(/^docka-/, "");
/** Whether the dealer has a doll of her own: only then is a deal ordered from the doll (tools/doll-order.ts takes her doll). */
export const ownDoll = (dealer: string) => dollWord(dealer) === dealer;

/** The doll's films grouped by card, and how many there are in all. */
export function useDollGroups(orders: OrdersAnswer | null, ledger: Ledger | null) {
  return useMemo(() => {
    const groups = dollFilms(orders?.rendered ?? [], orders?.orders ?? [], ledger?.rows ?? []);
    return { groups, count: groups.reduce((n, g) => n + g.films.length, 0) };
  }, [orders, ledger]);
}

/**
 * His saved standard for the doll's deal from A2.3 to a card, as the lab saved it (dealer3d/standard/<doll>-<card>.json).
 * `side`: the side it lays one of the dealer's own cards with: closed only where the lab saved that, since a standard saved
 * without a side lays the card open (lay.ts sideOf, which the order's tool reads the same way).
 */
export type DollStandard = { name: string; savedAt: string; cardTempo: number; side: Side };
/** What is known of the card's standard: being read, read (null: none saved), or not readable. */
export type StandardState = { state: "läser" } | { state: "läst"; standard: DollStandard | null } | { state: "fel" };

/**
 * The saved standard for the chosen dealer's doll and card, read from the doll lab (GET /dealer3d/standard, then the one
 * file for its card's tempo). `tick` is raised when the lab says it saved one, so that it is read again.
 */
export function useDollStandard(dealer: string, place: Place, tick: number, on: boolean): StandardState {
  const name = place === SHOE ? null : `${dollWord(dealer)}-${placeCode(place).replace(".", "").toLowerCase()}`;
  const [read, setRead] = useState<{ key: string; state: StandardState } | null>(null);
  const key = `${name}|${tick}`;
  useEffect(() => {
    if (!on || !name) return;
    let live = true;
    (async () => {
      const list = (await (await fetch("/dealer3d/standard", { cache: "no-store" })).json()) as { standards: { name: string; savedAt: string }[] };
      const found = list.standards.find((s) => s.name === name);
      if (!found) return null;
      const file = (await (await fetch(`/dealer3d/standard/${name}.json`, { cache: "no-store" })).json()) as { lab?: { steer?: { cardTempo?: number; side?: unknown } } };
      return { name, savedAt: found.savedAt, cardTempo: file.lab?.steer?.cardTempo ?? 1, side: file.lab?.steer?.side === "BACK" ? ("BACK" as const) : ("FRONT" as const) };
    })().then(
      (standard) => live && setRead({ key, state: { state: "läst", standard } }),
      () => live && setRead({ key, state: { state: "fel" } }),
    );
    return () => {
      live = false;
    };
  }, [on, name, key]);
  return read?.key === key ? read.state : { state: "läser" };
}

/** The doll's side of a card and the plan's, in words, where they are not the same. */
export type SideClash = { doll: string; plan: string };
/**
 * Where the doll lays one of the dealer's own cards with another side than the plan says. The order's text follows the plan,
 * so tools/doll-order.ts stops such an order before any film is made; step 2 and 3 say it beforehand. Only a saved standard
 * can differ: with none saved the doll takes the plan's side. Null where they agree, for a player's card, and while the
 * standard is not read.
 */
export function sideClash(place: string, standard: StandardState, planSide: Side | null): SideClash | null {
  if (!DEALER_CARD.test(place) || !planSide || standard.state !== "läst" || !standard.standard) return null;
  return standard.standard.side === planSide ? null : { doll: SIDE_WORD[standard.standard.side], plan: SIDE_WORD[planSide] };
}

/**
 * Step 2's one line on the doll: when the card's standard was saved, the card's tempo where it is not the ordinary, and for
 * one of the dealer's own cards the side it is laid with. Where that side is not the plan's (`planSide`), the line says so in
 * the warning's colour instead.
 */
export function DollNote({ dealer, place, standard, planSide }: { dealer: string; place: Place; standard: StandardState; planSide: Side | null }) {
  if (place === SHOE) return null;
  const clash = sideClash(place, standard, planSide);
  const saved = standard.state === "läst" ? standard.standard : null;
  const said = clash
    ? `${clash.doll}, planen säger ${clash.plan}`
    : standard.state === "läser"
      ? "läser …"
      : standard.state === "fel"
        ? "standarden kunde inte läsas"
        : saved
          ? [`sparad ${swedishMoment(saved.savedAt) ?? "utan datum"}`, saved.cardTempo !== 1 ? `kortet ${Math.round(saved.cardTempo * 100)} %` : null, DEALER_CARD.test(place) ? SIDE_WORD[saved.side] : null].filter(Boolean).join(" · ")
          : "ingen sparad standard · Naturlig";
  const title = clash
    ? `Dockan lägger ${placeCode(place)} ${clash.doll}, kortplanen säger ${clash.plan}. Välj samma sida i docklabbet (Kortet ligger) och spara, eller ändra Vid landning.`
    : saved
      ? `Din sparade standard ${saved.name}`
      : undefined;
  return (
    <p data-doll-note data-side-clash={clash ? "" : undefined} role={clash ? "alert" : undefined} title={title} className={cn("mx-4 mt-1 text-sm leading-5", clash ? "text-[#f0b07a]" : "text-dim")}>
      <span className="font-semibold text-ink">{dollFor(dealer).word}</span> · {said}
    </p>
  );
}

export function DollStage({
  part, place, from, play, setPlace, dealer, orders, ordersRead, groups, onSaved,
}: {
  /** The view shown, or null while the plan shows (the frame stays loaded). */
  part: DollPart | null;
  place: Place;
  /** The pose the doll deals the card from, as the plan's choice is followed (dealer3d/src/doll-choices.ts dollEntry). */
  from: "A2.1" | "A2.3";
  /** Raised by "Spela kortbanan": the lab plays the doll's deal to the card from the start. */
  play: number;
  setPlace: (place: Place) => void;
  dealer: string;
  orders: OrdersAnswer | null;
  ordersRead: boolean;
  groups: readonly DollGroup[];
  /** The lab saved a standard: what step 2 and 3 say of it is read again. */
  onSaved: () => void;
}) {
  // The lab is loaded when it is first shown, on the card and the doll chosen then; another dealer's doll loads it again.
  const doll = dollWord(dealer);
  const [lab, setLab] = useState<{ doll: string; src: string } | null>(null);
  if (part === "stall" && (!lab || lab.doll !== doll)) setLab({ doll, src: labAddress(place, doll, from, play > 0) });
  const [entry, setEntry] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  // The card chosen in the lab is Bordet's card; a standard saved there is read again.
  const heard = useRef({ setPlace, onSaved });
  useEffect(() => {
    heard.current = { setPlace, onSaved };
  }, [setPlace, onSaved]);
  useEffect(() => {
    const hear = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const said = (event.data as { docklabb?: { place?: unknown; saved?: unknown } } | null)?.docklabb;
      const next = typeof said?.place === "string" ? placeFromCode(said.place) : null;
      if (next) {
        setEntry(false);
        heard.current.setPlace(next);
      }
      if (typeof said?.saved === "string") heard.current.onSaved();
    };
    window.addEventListener("message", hear);
    return () => window.removeEventListener("message", hear);
  }, []);

  // A card chosen in Bordet (its card buttons, the films' row) is asked for in the lab while the lab shows, from the pose the
  // plan's choice deals it from; the lab answers with the card it shows, which is its own where sliders are moved and not
  // saved. "Spela kortbanan" asks the lab to play it from the start.
  const played = useRef(play);
  useEffect(() => {
    if (part !== "stall" || place === SHOE) return;
    const go = play !== played.current;
    played.current = play;
    frame.current?.contentWindow?.postMessage({ docklabb: { place, entry: from, ...(go ? { play: true } : {}) } }, window.location.origin);
  }, [part, place, from, play]);

  const chosen = entry ? ENTRY : place;
  const group = groups.find((g) => (g.place ?? ENTRY) === chosen) ?? null;

  return (
    <div className="relative size-full">
      {lab ? <iframe key={lab.doll} ref={frame} src={lab.src} title="Docklabbet" data-doll-lab className={cn("absolute inset-0 size-full border-0", part !== "stall" && "hidden")} /> : null}
      {part === "filmer" ? (
        <div className="absolute inset-0 flex flex-col overflow-y-auto [scrollbar-gutter:stable]">
          {groups.length ? (
            <div className="shrink-0 overflow-x-auto border-b border-line px-3 py-1.5">
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
  );
}

/** The doll lab's address inside the frame: embedded, on the chosen card, its entry and the doll; `play`: playing from the start. */
function labAddress(place: Place, doll: string, from: "A2.1" | "A2.3", play: boolean): string {
  const p = new URLSearchParams({ inbaddad: "1" });
  if (place !== SHOE) p.set("plats", placeCode(place).toLowerCase());
  if (from === "A2.1") p.set("fran", "a2-1");
  p.set("docka", doll);
  if (play) p.set("spela", "1");
  return `/dealer3d/docka?${p}`;
}
