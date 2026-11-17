"use client";

// What Bordet's Kortplan and Beställ need beside <Board>: what lies under the
// cards (a still or a film, and the list to choose from), the card path's playing state ("Spela kortbanan"), and the keys
// (Ctrl+Z ångra, X Ändrat | Sparat, the arrows nudge the chosen place, Esc stops the path).
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SHOE, VIEWS, type Place, type PlacementPlan, type View } from "../../../src/placement-model.ts";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import { readLibrary } from "../../lib/placement-api.ts";
import type { PathPhase } from "../../lib/placement-path.ts";
import {
  GREEN_FILM, backdropForView, bankFilms, defaultStill, filmGoesTo, filmView, libraryFilms, motionSteps, nudged, shownBackdrop, stillWord, stillsOf, type Film,
} from "../../lib/placement.ts";
import type { Backdrop, PathRun } from "./Board";
import { useKeyRun } from "./Board";
import { draftActions } from "./useDraft.ts";

export const filmLabel = (film: Film) => (film.id === GREEN_FILM ? "Grön film · P4C2" : film.title);
/** The card whose path plays: the chosen card, or P4C1's with the shoe chosen. */
export const pathCard = (place: Place) => (place === SHOE ? "P4.C1" : place);

/**
 * What lies under the cards in a view: the address's choice to start with, the films (the bank's takes, then the library's),
 * what is shown, and the list to choose from (the stills by his words, then the films of the view's shape, the films to
 * `place` first).
 */
export function useUnder(view: View, place: Place, first: { backdrop: string | null; frame: number }) {
  const [backdrop, setBackdrop] = useState<string | null>(first.backdrop);
  const [neutralMissing, setNeutralMissing] = useState(false);
  const [frame, setFrame] = useState(first.frame);
  const [library, setLibrary] = useState<Film[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { graph } = useBank();
  useEffect(() => {
    void readLibrary().then((items) => setLibrary(libraryFilms(items)));
  }, []);
  const films = useMemo(() => [...(graph ? bankFilms(graph) : []), ...library], [graph, library]);
  const shown = shownBackdrop(view, backdrop, films, neutralMissing);
  const film = shown.kind === "film" ? shown.film : null;
  const under: Backdrop = film ? { kind: "film", src: labUrl(film.path), fps: film.fps, frame } : { kind: "still", src: labUrl(shown.kind === "still" ? shown.path : VIEWS[view].background) };
  const runCard = pathCard(place);
  const options = [
    ...stillsOf(view).map((s) => ({ value: s as string, label: stillWord(s), hint: s === "neutral" ? "förval" : undefined })),
    ...films
      .filter((f) => filmView(f) === view)
      .sort((a, b) => Number(b.id === GREEN_FILM) - Number(a.id === GREEN_FILM) || Number(filmGoesTo(b, runCard)) - Number(filmGoesTo(a, runCard)))
      .map((f) => ({ value: f.id, label: filmLabel(f), hint: f.id === GREEN_FILM ? undefined : f.group === "bank" ? (filmGoesTo(f, runCard) ? "hit" : "klippbanken") : "äldre" })),
  ];
  return {
    backdrop,
    frame,
    setFrame,
    films,
    shown,
    film,
    under,
    options,
    value: film ? film.id : shown.kind === "still" ? shown.still : defaultStill(view),
    /** A choice in the list: a still, or a film from the take's own first frame. */
    choose: (v: string) => {
      setBackdrop(v === defaultStill(view) ? null : v);
      if (v === "neutral") setNeutralMissing(false);
      setFrame(films.find((f) => f.id === v)?.start ?? 0);
    },
    /** Another view: a film of the other shape, or a still the view lacks, gives way to its default. */
    toView: (v: View) => setBackdrop((was) => backdropForView(v, was, films)),
    label: film ? filmLabel(film) : shown.kind === "still" ? stillWord(shown.still) : "",
    shoeCard: shown.kind === "still" ? shown.still : null,
    onMissing: shown.kind === "still" && shown.still === "neutral" ? () => setNeutralMissing(true) : undefined,
    /** The neutral picture was asked for (or is the default) and is not on this machine. */
    neutralMissing: neutralMissing && !film && (backdrop === null || backdrop === "neutral") && view === "native",
    videoRef: videoRef as RefObject<HTMLVideoElement | null>,
  };
}

/** "Spela kortbanan": which card plays (null: stopped), at full or half speed, and the step it shows now (lit in Rörelse). */
export function usePathPlay(plan: PlacementPlan | null) {
  const [playing, setPlaying] = useState<{ id: string; key: number } | null>(null);
  const [halfSpeed, setHalfSpeed] = useState(false);
  const [phase, setPhase] = useState<PathPhase | null>(null);
  const run = playing && plan?.targets[playing.id] ? playing : null;
  const lit = run ? phase : null;
  const step = run && lit && plan ? motionSteps(run.id, plan.targets[run.id].intent).steps.find((s) => s.id === lit) : null;
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
 * The keys of a view with the plan's draft: Ctrl+Z ångra, X between Ändrat and Sparat while there are changes, Esc (onEscape),
 * the arrows nudge the chosen place (on the picture, on the places, or with nothing in focus).
 */
export function usePlanKeys({ place, view, editable, dirty, showing, area, onEscape }: { place: Place; view: View; editable: boolean; dirty: boolean; showing: "draft" | "saved"; area: RefObject<HTMLElement | null>; onEscape: () => void }) {
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
      keyRun((p) => nudged(p, place, view, e.key, e.shiftKey, false) ?? p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, showing, editable, keyRun, place, view, area]);
}
