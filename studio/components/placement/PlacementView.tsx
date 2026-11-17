"use client";

// Placering (/placering/?vy=mobil&plats=p4c2&bakgrund=<film|v6>&ruta=40): where the sixteen cards and the shoe lie on the
// table, how each is turned and shaped, how the dealer takes and lays it, and its material. The old lab's Placering tab in the
// studio, nothing left out. The picture is the largest thing: the cards on it are the playback's own rendered cards, and the
// handles sit on the chosen one; the inspector beside it has the exact numbers. Under the cards lies, in Dator, the neutral
// backdrop (the studio's own table with a neutral figure; no dealer's picture), or the V6 picture or a film when chosen; in
// Mobil the V6 picture. A brass mark says what is not saved; Ångra goes a step back, "Till sparat" all the way, and Ändrat |
// Sparat (key X) flips the picture between the two. Nothing is written to placements/default.json until Jakob presses Spara.
// In the lab /placering/ leads to Bordet's Kortplan (app/placering/page.tsx); this view is the online copy's, where it only
// shows.
// "Spela kortbanan" over the picture plays the chosen card's way from the shoe's window to its place and the hand back, drawn
// after the films (lib/placement-path.ts; with the shoe chosen, P4C1's), again and again until it is stopped, at full or half
// speed; the step it shows is lit on the step chips in Rörelse and named by the picture. A real deal of the bank can lie under
// the cards (the films to the chosen place first), from the take's own first frame.
// Must be inside <Suspense> (useSearchParams).
import { Play, RotateCcw, Save, Square, Undo2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHOE, TARGETS, VIEWS, type Place, type View } from "../../../src/placement-model.ts";
import { useViewContext } from "../../lib/context.ts";
import { isSnapshot, swedishMoment } from "../../lib/mode.ts";
import { VIEW_WORD, changedPlaces, gameDealNotes, placeCode, placeName, placementQuery, readPlacementAddress } from "../../lib/placement.ts";
import { DRAFT_FILE, draftText } from "../../lib/placement-files.ts";
import { Page } from "../shell";
import { Badge, Button, Dialog, ErrorState, IconButton, Kbd, SegmentedControl, Select, Skeleton, Switch, Tabs, useToast } from "../ui";
import { cn } from "../ui/cn";
import { Board, type Look } from "./Board";
import type { Face } from "./cardLayer.ts";
import { FilmBar } from "./FilmBar";
import { MaterialPanel } from "./MaterialPanel";
import { MotionPanel, PlacePanel, TablePanel } from "./Panels";
import { SlotPicker } from "./SlotPicker";
import { pathCard, usePathPlay, usePlanKeys, useUnder } from "./useBoard.ts";
import { draftActions, useDraft } from "./useDraft.ts";

type Tab = "plats" | "rorelse" | "material" | "bordet";

export function PlacementView() {
  const params = useSearchParams();
  const [first] = useState(() => readPlacementAddress(params));
  const [view, setView] = useState<View>(first.view);
  const [place, setPlace] = useState<Place>(first.place);
  // A card as the films show it, plain yellow and blue (Jakob 2026-11-17); the game's printed card is a choice for afterwork.
  const [look, setLook] = useState<Look>("farg");
  const [cardsFailed, setCardsFailed] = useState(false);
  const [allCards, setAllCards] = useState(true);
  const [grid, setGrid] = useState(false);
  const [tab, setTab] = useState<Tab>("plats");
  const [face, setFace] = useState<Face>({ rank: "A", suit: "spades" });
  const [replacing, setReplacing] = useState(false);
  const draft = useDraft();
  const toast = useToast();
  // What lies under the cards: a still of the view (the neutral picture in Dator), or a film at a frame.
  const under = useUnder(view, place, first);
  const { backdrop, frame } = under;
  const film = under.film;

  // The address follows what is chosen, so that a link brings back the same view, place and film frame.
  useEffect(() => {
    const keep = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", `${window.location.pathname}${placementQuery({ view, place, backdrop, frame }, keep)}`);
  }, [view, place, backdrop, frame]);
  useViewContext({ vy: "placering", val: { plats: placeCode(place), vy: VIEW_WORD[view] } });

  const d = draft.draft;
  const showSaved = draft.showing === "saved" && draft.dirty;
  const plan = d ? (showSaved ? d.saved : d.plan) : null;
  const editable = !!d && !isSnapshot && !showSaved && !draft.saving;
  const changes = useMemo(() => (d ? changedPlaces(d.saved, d.plan) : { places: [], table: false }), [d]);
  const changed = useMemo(() => new Set<Place>(changes.places), [changes]);
  const shoeTab = place === SHOE && (tab === "rorelse" || tab === "material") ? "plats" : tab;
  // The card path: its card, the step it shows now (lit in Rörelse, named by the picture), its speed.
  const paths = usePathPlay(plan);
  const { run, lit, path, halfSpeed, setHalfSpeed, setPhase } = paths;
  const { follow } = paths;
  const choose = useCallback(
    (id: Place) => {
      setPlace(id);
      follow(id);
    },
    [follow],
  );
  const setViewTo = (v: View) => {
    setView(v);
    under.toView(v);
  };

  // Keys: Ctrl+Z ångra, X Ändrat | Sparat, arrows nudge the chosen place (on the picture, on the places, or with nothing in focus).
  const board = useRef<HTMLDivElement>(null);
  usePlanKeys({ place, view, editable, dirty: draft.dirty, showing: draft.showing, area: board, onEscape: paths.stop });

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
  const runCard = pathCard(place);
  const notes = gameDealNotes(plan, place);

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
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant={run ? "secondary" : "primary"}
                aria-pressed={!!run}
                icon={run ? <Square /> : <Play />}
                onClick={() => paths.toggle(place)}
                title={`En skiss av rörelsen, inte en film: kortets väg från skon till ${placeCode(runCard)} och handen tillbaka, om och om igen (Esc stoppar)`}
              >
                {run ? "Stoppa" : "Spela kortbanan"}
              </Button>
              <Switch size="sm" checked={halfSpeed} onChange={setHalfSpeed} label="Halv fart" />
            </div>
            <SegmentedControl size="sm" label="Vy" value={view} onChange={setViewTo} options={[{ value: "native", label: "Dator" }, { value: "portrait", label: "Mobil" }]} />
            <Select
              size="sm"
              aria-label="Under korten"
              value={under.value}
              // a take cut from a longer film starts at its own first frame
              onChange={under.choose}
              options={under.options}
              className="w-52"
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
                { value: "farg", label: "Färg", title: "Som i filmerna: gul baksida, blå framsida" },
                { value: "kontur", label: "Kontur", title: "Bara konturer" },
                { value: "kort", label: "Efterarbete: spelets kort", title: "Kortet med tryck, som spelet ritar det efteråt" },
              ]}
            />
            <Switch size="sm" checked={allCards} onChange={setAllCards} label="Alla kort" />
            <Switch size="sm" checked={grid} onChange={setGrid} label="Rutnät" />
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
          {under.neutralMissing ? (
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
            backdrop={under.under}
            shoeCard={under.shoeCard}
            onBackdropMissing={under.onMissing}
            face={face}
            path={path}
            onPhase={setPhase}
            onCardsFailed={() => setCardsFailed(true)}
            videoRef={under.videoRef}
            label={under.label}
            className="flex-1"
          />
          {film ? <FilmBar key={film.id} videoRef={under.videoRef} fps={film.fps} frames={film.frames} onFrame={under.setFrame} /> : null}
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
            {notes.map((n) => (
              <p key={n} data-game-note className="text-xs text-[#f0b07a]">
                {n}
              </p>
            ))}
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
              <MotionPanel plan={plan} id={place} editable={editable} lit={run?.id === place ? lit : null} />
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
