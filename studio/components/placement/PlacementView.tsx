"use client";

// Placering (/placering/?vy=mobil&plats=p4c2&bakgrund=<film|v6>&ruta=40): where the sixteen cards and the shoe lie on the
// table, how each is turned and shaped, how the dealer takes and lays it, and its material. The old lab's Placering tab in the
// studio, nothing left out. The picture is the largest thing: the cards on it are the playback's own rendered cards, and the
// handles sit on the chosen one; the inspector beside it has the exact numbers. Under the cards lies, in Dator, the neutral
// backdrop (the studio's own table with a neutral figure; no dealer's picture), or the V6 picture or a film when chosen; in
// Mobil the V6 picture. A brass mark says what is not saved; Ångra goes a step back, "Till sparat" all the way, and Ändrat |
// Sparat (key X) flips the picture between the two. Nothing is written to placements/default.json until Jakob presses Spara.
// "Beställ film hit" takes a place that has a film of its own on to Beställ. In the online copy the view only shows.
// Must be inside <Suspense> (useSearchParams).
import { Minus, Plus, RotateCcw, Save, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHOE, TARGETS, VIEWS, type Place, type View } from "../../../src/placement-model.ts";
import { useBank } from "../../lib/bank.ts";
import { useViewContext } from "../../lib/context.ts";
import { labUrl } from "../../lib/lab.ts";
import { isSnapshot, swedishMoment } from "../../lib/mode.ts";
import {
  GREEN_FILM, VIEW_WORD, backdropForView, bankFilms, changedPlaces, defaultStill, filmView, libraryFilms, nudged, orderHref, placeCode, placeName, placementQuery,
  readPlacementAddress, shownBackdrop, stillChoice, stillLabel, stillsOf, type Film,
} from "../../lib/placement.ts";
import { readLibrary } from "../../lib/placement-api.ts";
import { DRAFT_FILE, draftText } from "../../lib/placement-files.ts";
import { Page } from "../shell";
import { Badge, Button, Dialog, ErrorState, IconButton, Kbd, SegmentedControl, Select, Skeleton, Switch, Tabs, buttonClasses, useToast } from "../ui";
import { cn } from "../ui/cn";
import { Board, useKeyRun, type Look, type PathRun } from "./Board";
import type { Face } from "./cardLayer.ts";
import { FilmBar } from "./FilmBar";
import { MaterialPanel } from "./MaterialPanel";
import { MotionPanel, PlacePanel, TablePanel } from "./Panels";
import { SlotPicker } from "./SlotPicker";
import { draftActions, useDraft } from "./useDraft.ts";

type Tab = "plats" | "rorelse" | "material" | "bordet";
const filmLabel = (film: Film) => (film.id === GREEN_FILM ? "Grön film · P4C2" : film.title);

export function PlacementView() {
  const params = useSearchParams();
  const [first] = useState(() => readPlacementAddress(params));
  const [view, setView] = useState<View>(first.view);
  const [place, setPlace] = useState<Place>(first.place);
  // a film id, "v6" or "neutral"; null is the view's own default (Dator: neutral, Mobil: V6)
  const [backdrop, setBackdrop] = useState<string | null>(first.backdrop);
  const [neutralMissing, setNeutralMissing] = useState(false);
  const [frame, setFrame] = useState(first.frame);
  const [look, setLook] = useState<Look>("kort");
  const [cardsFailed, setCardsFailed] = useState(false);
  const [allCards, setAllCards] = useState(true);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [tab, setTab] = useState<Tab>("plats");
  const [face, setFace] = useState<Face>({ rank: "A", suit: "spades" });
  const [path, setPath] = useState<PathRun | null>(null);
  const [library, setLibrary] = useState<Film[]>([]);
  const [replacing, setReplacing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const draft = useDraft();
  const { graph } = useBank();
  const toast = useToast();
  const keyRun = useKeyRun();

  useEffect(() => {
    void readLibrary().then((items) => setLibrary(libraryFilms(items)));
  }, []);
  // The address follows what is chosen, so that a link brings back the same view, place and film frame.
  useEffect(() => {
    const keep = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", `${window.location.pathname}${placementQuery({ view, place, backdrop, frame }, keep)}`);
  }, [view, place, backdrop, frame]);
  useViewContext({ vy: "placering", val: { plats: placeCode(place), vy: VIEW_WORD[view] } });

  const films = useMemo(() => [...(graph ? bankFilms(graph) : []), ...library], [graph, library]);
  const shown = shownBackdrop(view, backdrop, films, neutralMissing);
  const film = shown.kind === "film" ? shown.film : null;
  const under = film ? { kind: "film" as const, src: labUrl(film.path), fps: film.fps, frame } : { kind: "still" as const, src: labUrl(shown.kind === "still" ? shown.path : VIEWS[view].background) };
  const order = isSnapshot ? null : orderHref(place);

  const d = draft.draft;
  const showSaved = draft.showing === "saved" && draft.dirty;
  const plan = d ? (showSaved ? d.saved : d.plan) : null;
  const editable = !!d && !isSnapshot && !showSaved && !draft.saving;
  const changes = useMemo(() => (d ? changedPlaces(d.saved, d.plan) : { places: [], table: false }), [d]);
  const changed = useMemo(() => new Set<Place>(changes.places), [changes]);
  const shoeTab = place === SHOE && (tab === "rorelse" || tab === "material") ? "plats" : tab;

  const choose = useCallback(
    (id: Place) => {
      if (id !== place) setPath(null);
      setPlace(id);
    },
    [place],
  );
  const setZoom = useCallback((z: number) => setZoomState(Math.round(Math.max(0.5, Math.min(3, z)) * 100) / 100), []);
  const setViewTo = (v: View) => {
    setView(v);
    setPath(null);
    setBackdrop((was) => backdropForView(v, was, films));
  };

  // Keys: Ctrl+Z ångra, X Ändrat | Sparat, arrows nudge the chosen place (on the picture, on the places, or with nothing in focus).
  const board = useRef<HTMLDivElement>(null);
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
      if ((e.key === "x" || e.key === "X") && draft.dirty) {
        draftActions.show(draft.showing === "saved" ? "draft" : "saved");
        return;
      }
      if (e.key === "Escape") setPath(null);
      if (!e.key.startsWith("Arrow") || !editable) return;
      const free = el === document.body || !!board.current?.contains(el) || !!el.closest?.("[data-nudge]");
      if (!free) return;
      e.preventDefault();
      keyRun((p) => nudged(p, place, view, e.key, e.shiftKey, false) ?? p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.dirty, draft.showing, editable, keyRun, place, view]);

  const save = async () => {
    const result = await draftActions.save();
    if (result.ok) toast({ tone: "ok", title: "Placeringarna är sparade" });
    else toast({ tone: "bad", title: result.conflict ? "Planen har ändrats på annat håll" : "Placeringarna sparades inte", detail: result.message });
  };

  if (draft.status === "loading" || (draft.status === "ready" && !d))
    return (
      <Page title="Placering" full>
        <div className="flex h-full gap-4 p-5">
          <Skeleton className="h-full flex-1 rounded-md" />
          <Skeleton className="h-full w-[340px] rounded-md" />
        </div>
      </Page>
    );
  if (draft.status === "error" || !d || !plan)
    return (
      <Page title="Placering">
        <ErrorState title="Placeringsplanen kunde inte läsas" error={draft.error ?? "Okänt fel"} onRetry={() => void draftActions.load()} />
      </Page>
    );

  const checked = TARGETS.filter((id) => plan.targets[id].geometry[view].reviewed).length;
  const count = changes.places.length + (changes.table ? 1 : 0);
  const when = d.saved.updatedAt ? swedishMoment(d.saved.updatedAt) : null;
  const target = place === SHOE ? null : plan.targets[place];
  const lookShown: Look = look === "kort" && cardsFailed ? "farg" : look;
  const backdropOptions = [
    ...stillsOf(view).map((s) => ({ value: s as string, label: stillChoice(s, view), hint: s === "neutral" ? "förval" : undefined })),
    ...films
      .filter((f) => filmView(f) === view)
      .sort((a, b) => Number(b.id === GREEN_FILM) - Number(a.id === GREEN_FILM))
      .map((f) => ({ value: f.id, label: filmLabel(f), hint: f.id === GREEN_FILM ? undefined : f.group === "bank" ? "klippbanken" : "äldre" })),
  ];

  return (
    <Page
      title="Placering"
      full
      status={
        <>
          <span className="truncate">
            {VIEW_WORD[view]} · {checked} av 16 kontrollerade
          </span>
          {draft.dirty ? (
            <Badge tone="brass" size="md" title={changes.places.map(placeCode).join(", ") + (changes.table ? (changes.places.length ? ", bordet" : "bordet") : "")}>
              ● Osparat · {count} {count === 1 ? "ändrad" : "ändrade"}
            </Badge>
          ) : (
            <span className="text-faint">{when ? `Sparad ${when}` : "Startförslag, inte sparat"}</span>
          )}
        </>
      }
      actions={
        isSnapshot ? null : (
          <>
            {draft.dirty ? (
              <SegmentedControl
                size="sm"
                label="Visa ändrat eller sparat"
                value={draft.showing}
                onChange={draftActions.show}
                options={[
                  { value: "draft", label: "Ändrat", title: "Visa dina ändringar (X)" },
                  { value: "saved", label: "Sparat", title: "Visa planen som den är sparad (X)" },
                ]}
              />
            ) : null}
            <IconButton label="Ångra" kbd="Ctrl+Z" icon={<Undo2 />} disabled={!d.past.length || draft.saving} onClick={draftActions.undo} />
            <Button variant="quiet" icon={<RotateCcw />} disabled={!draft.dirty || draft.saving} onClick={draftActions.toSaved} title="Alla ändringar tillbaka till det sparade (Ångra tar tillbaka)">
              Till sparat
            </Button>
            <Button variant="primary" icon={<Save />} disabled={!draft.dirty} loading={draft.saving} onClick={() => void save()}>
              Spara
            </Button>
          </>
        )
      }
    >
      <div className="flex h-full min-h-0">
        <section ref={board} className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-line px-3">
            <SegmentedControl size="sm" label="Vy" value={view} onChange={setViewTo} options={[{ value: "native", label: "Dator" }, { value: "portrait", label: "Mobil" }]} />
            <Select
              size="sm"
              aria-label="Under korten"
              value={film ? film.id : shown.kind === "still" ? shown.still : defaultStill(view)}
              onChange={(v) => {
                setBackdrop(v === defaultStill(view) ? null : v);
                if (v === "neutral") setNeutralMissing(false);
                setFrame(0);
              }}
              options={backdropOptions}
              className="w-56"
            />
            <SegmentedControl
              size="sm"
              label="Korten"
              value={lookShown}
              onChange={(v) => {
                setLook(v);
                if (v === "kort") setCardsFailed(false);
              }}
              options={[
                { value: "kort", label: "Kort", title: "Som de spelas: renderade kort" },
                { value: "farg", label: "Färg", title: "Gult stängt, blått öppet, fyllda" },
                { value: "kontur", label: "Kontur", title: "Bara konturer" },
              ]}
            />
            <Switch size="sm" checked={allCards} onChange={setAllCards} label="Alla kort" />
            <Switch size="sm" checked={grid} onChange={setGrid} label="Rutnät" />
            <div className="ml-auto flex items-center gap-0.5">
              <IconButton label="Zooma ut" size="sm" icon={<Minus />} onClick={() => setZoom(zoom - 0.25)} disabled={zoom <= 0.5} />
              <button type="button" onClick={() => setZoom(1)} title="Anpassa till ytan" className="h-7 min-w-14 rounded-sm px-1.5 text-xs tabular-nums text-dim hover:bg-raised hover:text-ink">
                {Math.round(zoom * 100)} %
              </button>
              <IconButton label="Zooma in" size="sm" icon={<Plus />} onClick={() => setZoom(zoom + 0.25)} disabled={zoom >= 3} />
            </div>
          </div>
          {isSnapshot ? <p className="shrink-0 border-b border-line bg-raised px-4 py-1.5 text-xs text-dim">Kopian visar planen. Ändringar görs i labbet.</p> : null}
          {draft.conflict ? (
            <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-underkand/30 bg-underkand/8 px-4 py-1.5 text-xs text-[#ef8b8b]">
              <span className="mr-auto">Planen har ändrats på annat håll sedan den lästes.</span>
              <Button size="sm" variant="quiet" onClick={() => downloadDraft(d.plan)}>
                Spara utkastet som fil
              </Button>
              <Button size="sm" onClick={() => (draft.dirty ? setReplacing(true) : void draftActions.load())}>
                Läs in sparade
              </Button>
            </div>
          ) : null}
          {showSaved ? <p className="shrink-0 border-b border-brass/30 bg-brass/10 px-4 py-1.5 text-xs text-brass-hi">Visar sparat. Streckat: dina ändringar. X växlar.</p> : null}
          {cardsFailed && look === "kort" ? <p className="shrink-0 border-b border-line px-4 py-1.5 text-xs text-[#f0b07a]">Korten kunde inte ritas här; visar färg.</p> : null}
          {neutralMissing && !film && (backdrop === null || backdrop === "neutral") && view === "native" ? (
            <p className="shrink-0 border-b border-line px-4 py-1.5 text-xs text-[#f0b07a]">Den neutrala bilden finns inte på den här datorn än; visar V6-bilden.</p>
          ) : null}
          <Board
            plan={plan}
            other={showSaved ? d.plan : d.saved}
            view={view}
            selected={place}
            onSelect={choose}
            editable={editable}
            look={lookShown}
            allCards={allCards}
            grid={grid}
            changed={changed}
            backdrop={under}
            shoeCard={shown.kind === "still" && shown.still === "v6"}
            onBackdropMissing={shown.kind === "still" && shown.still === "neutral" ? () => setNeutralMissing(true) : undefined}
            face={face}
            zoom={zoom}
            onZoom={setZoom}
            path={path}
            onPathEnd={() => setPath(null)}
            onCardsFailed={() => setCardsFailed(true)}
            videoRef={videoRef}
            label={film ? filmLabel(film) : shown.kind === "still" ? stillLabel(shown.still) : ""}
            className="flex-1"
          />
          {film ? <FilmBar key={film.id} videoRef={videoRef} fps={film.fps} frames={film.frames} onFrame={setFrame} /> : null}
          <div className="flex h-8 shrink-0 items-center gap-3 border-t border-line px-3 text-2xs text-faint">
            <span className="font-mono text-dim">{placeCode(place)}</span>
            <span className="tabular-nums">
              {VIEW_WORD[view]} {VIEWS[view].width} × {VIEWS[view].height}
            </span>
            {view === "portrait" ? <span className="text-[#f0b07a]">Mobilbilden är en äldre beskärning.</span> : null}
            {draft.dirty && !showSaved ? <span className="text-brass-hi">Streckat: sparat läge</span> : null}
            <span className="ml-auto hidden items-center gap-1.5 lg:flex">
              <Kbd>←→↑↓</Kbd> 1 px <Kbd>Shift</Kbd> 10 <Kbd>Ctrl+Z</Kbd> ångra {draft.dirty ? <><Kbd>X</Kbd> jämför</> : null}
            </span>
          </div>
        </section>
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex flex-col gap-3 border-b border-line px-4 pb-3 pt-4" data-nudge>
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-ink">{placeName(place)}</h2>
              {changed.has(place) ? <Badge tone="brass">ändrad</Badge> : null}
              {target ? (
                <Badge tone={target.geometry[view].reviewed ? "ok" : "neutral"} className="ml-auto">
                  {target.geometry[view].reviewed ? "✓ Kontrollerad" : "Utkast"}
                </Badge>
              ) : null}
            </div>
            <SlotPicker plan={plan} view={view} selected={place} changed={showSaved ? new Set() : changed} onSelect={choose} />
            {order ? (
              <Link href={order} className={buttonClasses({ variant: "quiet", size: "sm", className: "-ml-2.5 self-start" })} title={`En ny beställning i Beställ, med filmen till ${placeCode(place)}`}>
                <Send aria-hidden />
                Beställ film hit
              </Link>
            ) : null}
          </div>
          <Tabs
            label="Inställningar"
            size="sm"
            value={shoeTab}
            onChange={setTab}
            className="shrink-0 px-2"
            items={[
              { value: "plats", label: "Plats" },
              { value: "rorelse", label: "Rörelse", disabled: place === SHOE },
              { value: "material", label: "Material", disabled: place === SHOE },
              { value: "bordet", label: "Bordet" },
            ]}
          />
          <div className={cn("min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]")}>
            {shoeTab === "plats" ? <PlacePanel plan={plan} view={view} id={place} editable={editable} onTable={() => setTab("bordet")} /> : null}
            {shoeTab === "rorelse" ? (
              <MotionPanel
                plan={plan}
                id={place}
                editable={editable}
                playing={!!path}
                onPlay={() => setPath((was) => (was ? null : { id: place === SHOE ? "P7.C1" : place, key: Date.now() }))}
              />
            ) : null}
            {shoeTab === "material" ? <MaterialPanel plan={plan} id={place} editable={editable} face={face} onFace={setFace} /> : null}
            {shoeTab === "bordet" ? <TablePanel plan={plan} view={view} id={place} editable={editable} /> : null}
          </div>
        </aside>
      </div>
      <Dialog
        open={replacing}
        onOpenChange={setReplacing}
        title="Ersätta utkastet med det sparade?"
        description="Dina osparade ändringar försvinner. Spara dem som fil först om du vill ha dem kvar."
        footer={
          <>
            <Button variant="quiet" onClick={() => downloadDraft(d.plan)}>
              Spara som fil
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setReplacing(false);
                void draftActions.load();
              }}
            >
              Ersätt
            </Button>
          </>
        }
      />
    </Page>
  );
}

function downloadDraft(plan: Parameters<typeof draftText>[0]) {
  const url = URL.createObjectURL(new Blob([draftText(plan)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = DRAFT_FILE;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
