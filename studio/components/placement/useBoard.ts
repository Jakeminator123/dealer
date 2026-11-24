"use client";

// What Bordet's Kortplan needs beside <Board>: what lies under the cards (a still or a film, and the list to choose from),
// and the keys (Ctrl+Z ångra, X the saved plan or the draft, the arrows nudge the chosen place).
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SHOE, type Place } from "../../../src/placement-model.ts";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import {
  PLAN_VIEW, START_PLACE, STILLS, bankFilms, dollFor, filmGoesTo, nudged, readPlacementAddress, shownBackdrop, stillsFor, underFilms,
} from "../../lib/placement.ts";
import type { Backdrop } from "./Board";
import { useKeyRun } from "./Board";
import { draftActions } from "./useDraft.ts";

/** The card a film or a round is shown for: the chosen card, or the start place's (P4C2, START_PLACE) with the shoe chosen. */
export const pathCard = (place: Place) => (place === SHOE ? START_PLACE : place);

/**
 * The choice in the address (?bakgrund=docka-standard), beside the view's other words, with a film's first frame where the
 * take begins inside its film (&ruta=138); the dealer's own doll, the default, is no word there (null).
 */
function writeBackdrop(backdrop: string | null, start = 0) {
  const p = new URLSearchParams(window.location.search);
  if (backdrop) p.set("bakgrund", backdrop);
  else p.delete("bakgrund");
  if (backdrop && start > 0) p.set("ruta", String(start));
  else p.delete("ruta");
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

/**
 * What lies under the cards: the caller's choice to start with, else the address's (?bakgrund=), the chosen dealer's films
 * (that dealer's takes in the bank: underFilms), what is shown, and the list to choose from (the dealer's doll, the other
 * dolls, then the dealer's films, the films to `place` first). With nothing chosen the dealer's doll lies there, and it
 * follows the dealer when another is chosen (Jakob 2026-11-23). No other dealer's picture or film is ever in it
 * (Jakob 2026-11-18). A choice is written to the address with its frame, so that it stays over a reload and in a link; a
 * film named without a frame starts on the take's own first frame (a return cut from its deal's film begins inside it).
 */
export function useUnder(place: Place, first: { backdrop: string | null; frame: number }) {
  const params = useSearchParams();
  const [backdrop, setBackdrop] = useState<string | null>(() => first.backdrop ?? readPlacementAddress(params).backdrop);
  const [frame, setFrame] = useState<number | null>(() => first.frame || readPlacementAddress(params).frame || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { graph, dealer } = useBank();
  const films = useMemo(() => underFilms(graph ? bankFilms(graph) : []), [graph]);
  const shown = shownBackdrop(backdrop, films, dealer);
  const film = shown.kind === "film" ? shown.film : null;
  const at = frame ?? film?.start ?? 0;
  const under: Backdrop = shown.kind === "film" ? { kind: "film", src: labUrl(shown.film.path), fps: shown.film.fps, frame: at } : { kind: "still", src: labUrl(shown.path) };
  const runCard = pathCard(place);
  // The dolls first: the chosen dealer's own (the default), then the others.
  const own = dollFor(dealer);
  const stills: { value: string; label: string; hint?: string }[] = stillsFor(dealer).map((s) => ({ value: s.id, label: s.word, hint: s === own ? "förval" : undefined }));
  const still = shown.kind === "still" ? STILLS.find((s) => s.id === shown.still) : undefined;
  const options = [
    ...stills,
    ...films
      .sort((a, b) => Number(filmGoesTo(b, runCard)) - Number(filmGoesTo(a, runCard)))
      .map((f) => ({ value: f.id, label: f.title, hint: filmGoesTo(f, runCard) ? "hit" : "klippbanken" })),
  ];
  return {
    backdrop,
    frame: at,
    setFrame,
    films,
    shown,
    film,
    under,
    options,
    value: film ? film.id : (still ?? own).id,
    /** A choice in the list: a doll (the dealer's own is the default, and no word in the address), or a film from the take's own first frame. */
    choose: (v: string) => {
      const next = v === own.id ? null : v;
      const start = films.find((f) => f.id === v)?.start ?? 0;
      setBackdrop(next);
      setFrame(start || null);
      writeBackdrop(next, start);
    },
    label: film ? film.title : (still ?? own).word,
    /** Paint the card in the shoe's window: on a doll's picture (every doll's has the same shoe), not under a film (it shows its own card). */
    shoeCard: !film,
    videoRef: videoRef as RefObject<HTMLVideoElement | null>,
  };
}

export function usePlanKeys({ place, editable, dirty, showing, area,  }: { place: Place; editable: boolean; dirty: boolean; showing: "draft" | "saved"; area: RefObject<HTMLElement | null> }) {
  const keyRun = useKeyRun();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const writing = !!el.closest?.("input, textarea, select, [contenteditable='true']");
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && !writing) {
        e.preventDefault();
        draftActions.undo();
        return;
      }
      if (writing || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === "x" || e.key === "X") && dirty) {
        draftActions.show(showing === "saved" ? "draft" : "saved");
        return;
      }
      if (!e.key.startsWith("Arrow") || !editable) return;
      const free = el === document.body || !!area.current?.contains(el) || !!el.closest?.("[data-nudge]");
      if (!free) return;
      e.preventDefault();
      keyRun((p) => nudged(p, place, PLAN_VIEW, e.key, e.shiftKey, false) ?? p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, showing, editable, keyRun, place, area]);
}
