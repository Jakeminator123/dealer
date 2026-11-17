"use client";

// Bordet (/bordet/?lage=bestall&plats=p4c1): the lab's one view of the table (Jakob 2026-11-17: "Scen och placering bör ha
// samma typ av vy, och på högersidan ska man kunna ändra och laborera med detta. Detta ska också vara underlaget för
// beställning av nya filmer."). One frame for everything: the toolbar on top with the view's menu at its left, the stage as
// large as the window allows, one column on the right where things are changed. The menu's five parts:
//   Kortplan     the plan on the picture (the silhouette, a still or a film under the cards), with 1 Var kortet landar and
//                2 Hur det kommer dit (Placering's Plats, Bordet and Rörelse panels) and 3 Beställ for the chosen card
//   Beställ      the same picture, with step 3 in the column: the films to order for the chosen card and without a card
//   Scen, Råfilm, Efterarbete   the live picture (SceneBody: the 3D scene, the films on their green, what is laid over)
// The list of films lies under the picture in Kortplan and Beställ (FilmList.tsx), its cards ringed on the stage; a row
// chosen plays its card's path. The plan is the draft Placering keeps (useDraft): what is changed here is changed there,
// and nothing is written until "Spara i kortplanen". The card and the list stay when the menu changes. Lab only.
// Must be inside <Suspense> (useSearchParams).
import { Play, RotateCcw, Save, Square, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import methodsFile from "../../../data/order-methods.json";
import { FLIP_LABEL, LANDS_LABEL, type OrdersAnswer } from "../../../src/order-model.ts";
import type { MethodRegister } from "../../../src/order-methods.ts";
import { SHOE, type Place } from "../../../src/placement-model.ts";
import { asApiError } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { cardWishes, filmRow, otherWishes, sumWords, wishKey, type FilmRow, type FilmWish } from "../../lib/bordet.ts";
import { useViewContext } from "../../lib/context.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { createOrder, getOrders } from "../../lib/orders.ts";
import { GRIP_LABEL, changedPlaces, flipOf, placeCode, placeFromCode, placeName, type Still } from "../../lib/placement.ts";
import { Board } from "../placement/Board";
import { FilmBar } from "../placement/FilmBar";
import { MotionPanel, PlacePanel, TablePanel } from "../placement/Panels";
import { SlotPicker } from "../placement/SlotPicker";
import { pathCard, usePathPlay, usePlanKeys, useUnder } from "../placement/useBoard.ts";
import { draftActions, useDraft } from "../placement/useDraft.ts";
import { Page } from "../shell";
import { Badge, Button, ErrorState, IconButton, SegmentedControl, Select, Skeleton, Switch, cn, useToast } from "../ui";
import { AddFilms, FilmStrip, type Made } from "./FilmList";
import type { SceneKind } from "./SceneBody";

// The live picture is loaded only when it is chosen, so that Kortplan stays light.
const SceneBody = dynamic(() => import("./SceneBody").then((m) => m.SceneBody), { ssr: false, loading: () => <Skeleton className="m-4 h-[60vh] rounded-md" /> });

export type Mode = "kortplan" | "bestall" | SceneKind;
export const MODES: readonly { value: Mode; label: string }[] = [
  { value: "kortplan", label: "Kortplan" },
  { value: "bestall", label: "Beställ" },
  { value: "scen", label: "Scen" },
  { value: "rafilm", label: "Råfilm" },
  { value: "efterarbete", label: "Efterarbete" },
];
const isMode = (v: string | null): v is Mode => MODES.some((m) => m.value === v);
const START_PLACE: Place = "P4.C1";
/** The register of how each step is ordered, as the studio was built with it (data/order-methods.json). */
const METHODS = methodsFile as unknown as MethodRegister;
/** The stills by Jakob's words (Ordlista): Siluett, V6-bild. */
const STILL_WORDS = { choice: (s: Still) => (s === "neutral" ? "Siluett" : "V6-bild"), label: (s: Still) => (s === "neutral" ? "Siluett" : "V6-bild") };

/** The view's address: the menu's part and the card ("?lage=bestall&plats=p4c1"); the rail's dealer and robot are kept. */
function writeAddress(mode: Mode, place: Place) {
  const p = new URLSearchParams(window.location.search);
  if (mode === "kortplan") p.delete("lage");
  else p.set("lage", mode);
  if (place === START_PLACE) p.delete("plats");
  else p.set("plats", placeCode(place).toLowerCase());
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

export function BordetView() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => (isMode(params.get("lage")) ? (params.get("lage") as Mode) : "kortplan"));
  const [place, setPlace] = useState<Place>(() => placeFromCode(params.get("plats")) ?? START_PLACE);
  const [wishes, setWishes] = useState<FilmWish[]>([]);
  const [made, setMade] = useState<Made>({});
  const [chosenRow, setChosenRow] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrdersAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = useDraft();
  const toast = useToast();
  const { dealer, dealers } = useBank();
  useEffect(() => writeAddress(mode, place), [mode, place]);
  useEffect(() => {
    void getOrders().then(setOrders, () => setOrders(null));
  }, []);
  useViewContext({ vy: "bordet", val: { läge: MODES.find((m) => m.value === mode)?.label, plats: placeCode(place), filmer: String(wishes.length) } });

  const d = draft.draft;
  const plan = d?.plan ?? null;
  const rowOf = useCallback((w: FilmWish) => filmRow(dealer, w, METHODS, orders?.policy ?? null), [dealer, orders]);
  const rows = useMemo(() => wishes.map(rowOf), [wishes, rowOf]);
  const listed = useMemo(() => new Set(wishes.map(wishKey)), [wishes]);
  const marked = useMemo(() => new Set(wishes.flatMap((w) => (w.target ? [w.target] : []))), [wishes]);
  const intent = plan && place !== SHOE ? plan.targets[place]?.intent : null;
  // The chosen card's deal in his notation, over the view.
  const deal = intent ? cardWishes(place, intent)[0] : null;
  const dealLine = deal ? rowOf(deal).line : placeName(place);
  const add = (w: FilmWish) => setWishes((was) => (was.some((x) => wishKey(x) === wishKey(w)) ? was : [...was, w]));

  const orderable = !orders?.dealers || orders.dealers.some((x) => x.id === dealer);
  const blocked = !orders ? "Beställningarna kunde inte läsas (labbservern)." : !orderable ? `${dealers.find((x) => x.id === dealer)?.name ?? dealer} kan inte beställas för (data/dealers.json).` : draft.dirty ? "Spara kortplanen först: utkastet ritar kortet där den sparade planen lägger det." : null;
  const create = async () => {
    setBusy(true);
    const done: Made = {};
    try {
      for (const r of rows) {
        if (made[r.key] || !r.body) continue;
        const answer = await createOrder(r.body);
        done[r.key] = answer.order.id;
      }
      const n = Object.keys(done).length;
      toast({ tone: "ok", title: n === 1 ? "Ett utkast gjort" : `${n} utkast gjorda`, detail: "De godkänns i Beställ, Det här skickas. Inget är godkänt." });
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Utkastet").message });
    } finally {
      setMade((was) => ({ ...was, ...done }));
      setBusy(false);
    }
  };

  const save = async () => {
    const result = await draftActions.save();
    if (result.ok) toast({ tone: "ok", title: "Kortplanen är sparad" });
    else toast({ tone: "bad", title: result.conflict ? "Planen har ändrats på annat håll" : "Kortplanen sparades inte", detail: result.message });
  };

  const menu = <SegmentedControl size="sm" label="Bordets delar" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />;
  const table = mode === "kortplan" || mode === "bestall";
  const changes = d ? changedPlaces(d.saved, d.plan) : { places: [], table: false };
  const count = changes.places.length + (changes.table ? 1 : 0);
  const when = d?.saved.updatedAt ? swedishMoment(d.saved.updatedAt) : null;

  return (
    <Page
      title="Bordet"
      full
      status={
        <>
          <span data-notation className="truncate font-mono text-md font-semibold text-ink">
            {dealLine}
          </span>
          {!table ? null : draft.dirty ? (
            <Badge tone="brass" size="md">
              ● Osparat · {count} {count === 1 ? "ändrad" : "ändrade"}
            </Badge>
          ) : when ? (
            <span className="text-faint">Sparad {when}</span>
          ) : null}
        </>
      }
      actions={
        table && d ? (
          <>
            <IconButton label="Ångra" kbd="Ctrl+Z" icon={<Undo2 />} disabled={!d.past.length || draft.saving} onClick={draftActions.undo} />
            <Button variant="quiet" icon={<RotateCcw />} disabled={!draft.dirty || draft.saving} onClick={draftActions.toSaved}>
              Till sparat
            </Button>
            <Button variant="primary" icon={<Save />} disabled={!draft.dirty} loading={draft.saving} onClick={() => void save()} title="Skriver kortplanen (gäller alla dealers)">
              Spara i kortplanen
            </Button>
          </>
        ) : null
      }
    >
      {table ? (
        draft.status === "error" ? (
          <ErrorState title="Kortplanen kunde inte läsas" error={draft.error ?? "Okänt fel"} onRetry={() => void draftActions.load()} />
        ) : !d || !plan ? (
          <div className="flex h-full gap-4 p-5">
            <Skeleton className="h-full flex-1 rounded-md" />
            <Skeleton className="h-full w-[380px] rounded-md" />
          </div>
        ) : (
          <TableBody
            mode={mode as "kortplan" | "bestall"}
            menu={menu}
            place={place}
            setPlace={setPlace}
            rows={rows}
            rowOf={rowOf}
            listed={listed}
            marked={marked}
            chosenRow={chosenRow}
            setChosenRow={setChosenRow}
            made={made}
            busy={busy}
            blocked={blocked}
            dealer={dealer}
            onAdd={add}
            onRemove={(r) => setWishes((was) => was.filter((w) => wishKey(w) !== r.key))}
            onClear={() => {
              setWishes([]);
              setMade({});
            }}
            onCreate={() => void create()}
          />
        )
      ) : (
        <SceneBody kind={mode as SceneKind} toolbar={menu} roundText={roundFor(place, intent?.grip ?? "PINCH")} />
      )}
    </Page>
  );
}

/** The chosen card's deal and back in his round notation ("A2.1 - P4C1 - A2.1"), for the live picture to play. */
export function roundFor(place: Place, grip: "PINCH" | "DRAG"): string {
  const card = placeCode(pathCard(place));
  const at = grip === "DRAG" ? "A2.2" : "A2.1";
  return `${at} - ${card} - ${at}`;
}

function TableBody({
  mode, menu, place, setPlace, rows, rowOf, listed, marked, chosenRow, setChosenRow, made, busy, blocked, dealer, onAdd, onRemove, onClear, onCreate,
}: {
  mode: "kortplan" | "bestall";
  menu: ReactNode;
  place: Place;
  setPlace: (p: Place) => void;
  rows: FilmRow[];
  rowOf: (w: FilmWish) => FilmRow;
  listed: ReadonlySet<string>;
  marked: ReadonlySet<Place>;
  chosenRow: string | null;
  setChosenRow: (k: string | null) => void;
  made: Made;
  busy: boolean;
  blocked: string | null;
  dealer: string;
  onAdd: (w: FilmWish) => void;
  onRemove: (r: FilmRow) => void;
  onClear: () => void;
  onCreate: () => void;
}) {
  const draft = useDraft();
  const d = draft.draft!;
  const showSaved = draft.showing === "saved" && draft.dirty;
  const plan = showSaved ? d.saved : d.plan;
  const editable = !draft.saving && !showSaved;
  const view = "native" as const;
  const [allCards, setAllCards] = useState(true);
  const [grid, setGrid] = useState(false);
  const [open, setOpen] = useState<1 | 2 | 3 | 0>(mode === "bestall" ? 3 : 1);
  const [allTable, setAllTable] = useState(false);
  const under = useUnder(view, place, { backdrop: null, frame: 0 }, STILL_WORDS);
  const paths = usePathPlay(plan);
  const changes = useMemo(() => changedPlaces(d.saved, d.plan), [d]);
  const changed = useMemo(() => new Set<Place>(changes.places), [changes]);
  const { follow } = paths;
  const choose = useCallback(
    (id: Place) => {
      setPlace(id);
      follow(id);
    },
    [follow, setPlace],
  );
  const stageArea = useRef<HTMLDivElement>(null);
  usePlanKeys({ place, view, editable, dirty: draft.dirty, showing: draft.showing, area: stageArea, onEscape: paths.stop });

  // The stage takes the picture's own shape when the column is taller than that (no bands above and below); the list of
  // films takes the height that is left under it.
  const column = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = column.current!;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const film = under.film;
  const bars = 44 + (film ? 44 : 0);
  const stageHeight = size.w ? Math.max(240, Math.min(size.h - bars - 120, size.w / (1762 / 1174))) : 0;

  const intent = place !== SHOE ? plan.targets[place]?.intent : null;
  const target = place !== SHOE ? plan.targets[place] : null;
  const g = target?.geometry[view];
  const wishesHere = cardWishes(place, intent);
  const motion = intent ? `${GRIP_LABEL[intent.grip]} · ${intent.pass ? "Handbyte" : intent.takeHand === "LH" ? "Vänster" : "Höger"} · ${LANDS_LABEL[intent.endSide]}${intent.endSide === "FRONT" ? ` · ${FLIP_LABEL[flipOf(intent)]}` : ""}` : "Välj ett kort";
  const where = g ? `${placeCode(place)} · ${Math.round(g.angle)}° · perspektiv ${Math.round(g.taper * 100)} %` : placeName(place);
  const chooseRow = (r: FilmRow) => {
    setChosenRow(r.key);
    if (r.wish.target) {
      setPlace(r.wish.target);
      paths.play(r.wish.target);
    }
  };
  const addFilms = (
    <div className="flex flex-col gap-3">
      <AddFilms title={placeName(place)} wishes={wishesHere} rows={rowOf} listed={listed} onAdd={onAdd} />
      {mode === "bestall" ? <AddFilms title="Utan kort" wishes={otherWishes()} rows={rowOf} listed={listed} onAdd={onAdd} /> : null}
      <p className="text-sm tabular-nums text-dim">{sumWords(rows.filter((r) => !made[r.key]))}</p>
    </div>
  );

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_380px]">
      <section ref={column} className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-line px-3">
          {menu}
          <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
          <Button size="sm" variant={paths.run ? "secondary" : "primary"} aria-pressed={!!paths.run} icon={paths.run ? <Square /> : <Play />} onClick={() => paths.toggle(place)} className="shrink-0">
            {paths.run ? "Stoppa" : "Spela kortbanan"}
          </Button>
          <Switch size="sm" checked={paths.halfSpeed} onChange={paths.setHalfSpeed} label="Halv fart" />
          <Select size="sm" aria-label="Under korten" value={under.value} onChange={under.choose} options={under.options} className="w-48 shrink-0" />
          <Switch size="sm" checked={allCards} onChange={setAllCards} label="Alla kort" />
          <Switch size="sm" checked={grid} onChange={setGrid} label="Rutnät" />
        </div>
        {draft.conflict ? <p className="shrink-0 border-b border-underkand/30 bg-underkand/8 px-4 py-1.5 text-xs text-[#ef8b8b]">Planen har ändrats på annat håll sedan den lästes.</p> : null}
        <div ref={stageArea} className="relative shrink-0" style={{ height: stageHeight }}>
          {stageHeight ? (
            <Board
              plan={plan}
              other={showSaved ? d.plan : d.saved}
              view={view}
              selected={place}
              onSelect={choose}
              editable={editable}
              look="farg"
              allCards={allCards}
              grid={grid}
              changed={changed}
              backdrop={under.under}
              shoeCard={under.shoeCard}
              onBackdropMissing={under.onMissing}
              face={{ rank: "A", suit: "spades" }}
              path={paths.path}
              onPhase={paths.setPhase}
              onCardsFailed={() => {}}
              videoRef={under.videoRef}
              label={under.label}
              marked={marked}
              className="absolute inset-0"
            />
          ) : null}
        </div>
        {film ? <FilmBar key={film.id} videoRef={under.videoRef} fps={film.fps} frames={film.frames} onFrame={under.setFrame} /> : null}
        <FilmStrip rows={rows} dealer={dealer} chosen={chosenRow} made={made} busy={busy} blocked={blocked} onChoose={chooseRow} onRemove={onRemove} onCreate={onCreate} onClear={onClear} />
      </section>
      <aside className="flex min-h-0 flex-col border-l border-line bg-surface" data-nudge>
        <div className="flex flex-col gap-2.5 border-b border-line px-4 pb-3 pt-3.5">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-ink">{placeName(place)}</h2>
            {changed.has(place) ? <Badge tone="brass">ändrad</Badge> : null}
          </div>
          <SlotPicker plan={plan} view={view} selected={place} changed={showSaved ? new Set() : changed} onSelect={choose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {mode === "bestall" ? (
            <Step n={3} title="Beställ" summary={null} open onToggle={() => {}}>
              <div className="px-4 pb-4">{addFilms}</div>
            </Step>
          ) : (
            <>
              <Step n={1} title="Var kortet landar" summary={where} open={open === 1} onToggle={() => setOpen(open === 1 ? 0 : 1)}>
                <PlacePanel plan={plan} view={view} id={place} editable={editable} onTable={() => setAllTable(true)} />
                <button type="button" onClick={() => setAllTable(!allTable)} aria-expanded={allTable} className="w-full border-t border-line px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.08em] text-faint hover:text-ink">
                  {allTable ? "▾" : "▸"} Alla kort
                </button>
                {allTable ? <TablePanel plan={plan} view={view} id={place} editable={editable} /> : null}
              </Step>
              <Step n={2} title="Hur det kommer dit" summary={motion} open={open === 2} onToggle={() => setOpen(open === 2 ? 0 : 2)}>
                <MotionPanel plan={plan} id={place} editable={editable} lit={paths.run?.id === place ? paths.lit : null} />
              </Step>
              <Step n={3} title="Beställ" summary={sumWords(rows.filter((r) => !made[r.key]))} open={open === 3} onToggle={() => setOpen(open === 3 ? 0 : 3)}>
                <div className="px-4 pb-4">{addFilms}</div>
              </Step>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** One of the column's steps: its number, its name, one line of what it says now when folded, and its panel when open. */
function Step({ n, title, summary, open, onToggle, children }: { n: number; title: string; summary: string | null; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={cn("border-b border-line", open && "bg-raised/25")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-raised/40">
        <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold", open ? "border-brass bg-brass/15 text-brass-hi" : "border-line-strong text-dim")}>{n}</span>
        <span className="flex min-w-0 flex-col">
          <span className="text-md font-semibold text-ink">{title}</span>
          {summary && !open ? <span className="truncate text-xs tabular-nums text-dim">{summary}</span> : null}
        </span>
      </button>
      {open ? <div className="pb-1">{children}</div> : null}
    </section>
  );
}
