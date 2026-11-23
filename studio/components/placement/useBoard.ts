"use client";

// What Bordet's Kortplan needs beside <Board>: what lies under the cards (a still or a film, and the list to choose from),
// the card path's playing state ("Spela kortbanan"), and the keys (Ctrl+Z ångra, X the saved plan or the draft, the arrows
// nudge the chosen place, Esc stops the path).
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SHOE, type Place, type PlacementPlan } from "../../../src/placement-model.ts";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import { readLibrary } from "../../lib/placement-api.ts";
import type { PathPhase } from "../../lib/placement-path.ts";
import {
  GREEN_FILM, PLAN_VIEW, START_PLACE, STILLS, bankFilms, dollFor, filmGoesTo, libraryFilms, motionSteps, nudged, readPlacementAddress, shownBackdrop, stillsFor, underFilms, type Film,
} from "../../lib/placement.ts";
import type { Backdrop, PathRun } from "./Board";
import { useKeyRun } from "./Board";
import { draftActions } from "./useDraft.ts";

export const filmLabel = (film: Film) => (film.id === GREEN_FILM ? "Grön film · P4C2" : film.title);
/** The card whose path plays: the chosen card, or the start place's (P4C2, START_PLACE) with the shoe chosen. */
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
 * (her takes in the bank, and for Pamela the library's older ones: underFilms), what is shown, and the list to choose from
 * (her doll, the other dolls, then her films, the films to `place` first). With nothing chosen her doll lies there, and it
 * follows the dealer when another is chosen (Jakob 2026-11-23). No other dealer's picture or film is ever in it
 * (Jakob 2026-11-18). A choice is written to the address with its frame, so that it stays over a reload and in a link; a
 * film named without a frame starts on the take's own first frame (a return cut from its deal's film begins inside it).
 */
export function useUnder(place: Place, first: { backdrop: string | null; frame: number }) {
  const params = useSearchParams();
  const [backdrop, setBackdrop] = useState<string | null>(() => first.backdrop ?? readPlacementAddress(params).backdrop);
  const [frame, setFrame] = useState<number | null>(() => first.frame || readPlacementAddress(params).frame || null);
  const [library, setLibrary] = useState<Film[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { graph, dealer } = useBank();
  useEffect(() => {
    void readLibrary().then((items) => setLibrary(libraryFilms(items)));
  }, []);
  const films = useMemo(() => underFilms(dealer, graph ? bankFilms(graph) : [], library), [dealer, graph, library]);
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
      .sort((a, b) => Number(b.id === GREEN_FILM) - Number(a.id === GREEN_FILM) || Number(filmGoesTo(b, runCard)) - Number(filmGoesTo(a, runCard)))
      .map((f) => ({ value: f.id, label: filmLabel(f), hint: f.id === GREEN_FILM ? undefined : f.group === "bank" ? (filmGoesTo(f, runCard) ? "hit" : "klippbanken") : "äldre" })),
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
    label: film ? filmLabel(film) : (still ?? own).word,
    /** Paint the card in the shoe's window: on a doll's picture (every doll's has the same shoe), not under a film (it shows its own card). */
    shoeCard: !film,
    videoRef: videoRef as RefObject<HTMLVideoElement | null>,
  };
}

/**
 * "Spela kortbanan": which card plays (null: stopped), at full or half speed, and the step it shows now (lit in step 2).
 * `anchorOf`: the anchor a card's films go from ("A2.3"), named on the step over the picture as step 2 names it.
 */
export function usePathPlay(plan: PlacementPlan | null, anchorOf?: (id: string) => string) {
  const [playing, setPlaying] = useState<{ id: string; key: number } | null>(null);
  const [halfSpeed, setHalfSpeed] = useState(false);
  const [phase, setPhase] = useState<PathPhase | null>(null);
  const run = playing && plan?.targets[playing.id] ? playing : null;
  const lit = run ? phase : null;
  const step = run && lit && plan ? motionSteps(run.id, plan.targets[run.id].intent, anchorOf?.(run.id)).steps.find((s) => s.id === lit) : null;
  const path: PathRun | null = run ? { ...run, speed: halfSpeed ? 0.5 : 1, step: step ? `${step.label} · ${step.detail}` : null } : null;
  return {
    run,
    lit,
    path,
    halfSpeed,
    setHalfSpeed,
    setPhase,
    /** Another card chosen while the path plays: it plays that card's path from the start. */
    follow: useCallback((id: Place) => setPlaying((was) => (was && was.id !== pathCard(id) ? { id: pathCard(id), key: Date.now() } : was)), []),
    /** The button: plays the card's path, or stops it. */
    toggle: (id: Place) => {
      setPhase(null);
      setPlaying((was) => (was ? null : { id: pathCard(id), key: Date.now() }));
    },
    /** Plays the card's path from the start. */
    play: (id: Place) => {
      setPhase(null);
      setPlaying({ id: pathCard(id), key: Date.now() });
    },
    stop: () => setPlaying(null),
  };
}

/**
 * The keys of a view with the plan's draft: Ctrl+Z ångra, X between the draft and the saved plan while there are changes (the
 * view says so on the picture while the saved plan shows, and nothing can be changed then), Esc (onEscape),
 * the arrows nudge the chosen place (on the picture, on the places, or with nothing in focus).
 */
export function usePlanKeys({ place, editable, dirty, showing, area, onEscape }: { place: Place; editable: boolean; dirty: boolean; showing: "draft" | "saved"; area: RefObject<HTMLElement | null>; onEscape: () => void }) {
  const keyRun = useKeyRun();
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
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
      if (e.key === "Escape") escape.current();
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
