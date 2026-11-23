"use client";

// Scen & bord (/bordet/?plats=p4c2): the lab's one view of the table (Jakob 2026-11-17: "Scen och placering bör ha samma typ av
// vy, och på högersidan ska man kunna ändra och laborera med detta. Detta ska också vara underlaget för beställning av nya
// filmer."). One frame for everything, titled Scen & bord: the toolbar on top with the view's menu at its left (the row wraps
// rather than hides what does not fit), the picture as large as the window allows, one column on the right where things are
// changed (under the picture on a narrow or upright window). The menu's parts:
//   Kortplan     the plan on the picture (the chosen dealer's doll or a film of hers under the cards), with the steps for the
//                chosen card: 1 Var kortet landar, 2 Hur det kommer dit, 3 Ny film (the guide: the dealer, her tree and the
//                step, the step's recipe, what is sent and "Spara utkastet"; NewFilm.tsx). The guide is the one way to a draft.
//                The doll has its one place here (Jakob 2026-11-23: "EN väg och ETT ställe man använder dockan"): step 2 shows
//                the doll lab where the picture is, and the toolbar chooses Planen, Ställ dockan or Dockans filmer
//                (DollPanel.tsx); step 1 and 3 show the plan again. Step 3 makes a deal from A2.3 to a player's card from
//                the doll's saved standard where the dealer has a doll of her own.
//   Kön          the orders (OrderView): what a round lacks, the drafts to approve, an order open with "Det här skickas"
//   Scen, Råfilm, Efterarbete   the live picture (SceneBody: the 3D scene, the films on their green, what is laid over)
// The plan is the draft Placering kept (useDraft): nothing is written until Jakob's click on "Spara i kortplanen", which
// writes the whole plan. The card and the guide's step stay when the menu changes. Addresses: ?lage=docka opens Kortplan
// with step 2 and the doll lab (&del=filmer the doll's films; the old Docka's words, and /docka/), ?lage=bestall opens it
// with step 3 open, and with trad=, film= and komposition= on the tree and step they name (Karta's "Beställ",
// lib/new-film.ts guideHref; the view writes the same words while the guide is open); ?lage=bestall&ko=1, ?order=<id> and
// ?ny=1&som=<id> open Kön (that order); ?ny=1&steg=…&plats=… (Ny beställning's, which is gone) opens the guide on that film.
// In the online copy (lib/mode.ts isSnapshot) the same view reads only: Kortplan shows the plan without saving, Kön, the guide,
// the doll and everything that writes are not there, and Scen, Råfilm and Efterarbete are the scene as the copy has it. Inside <Suspense>.
import { Play, RotateCcw, Save, Square, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ANCHOR_NODE, stepOf, type BankFacts, type OrdersAnswer } from "../../../src/order-model.ts";
import { SHOE, VIEWS, type Place } from "../../../src/placement-model.ts";
import type { Ledger } from "../../lib/ledger.ts";
import type { MediaAnswer } from "../../lib/media.ts";
import { useBank } from "../../lib/bank.ts";
import { STAGE_MIN, cardWishes, columnStage, filmRow, hasRound, lastOrder, motionLine, roundFor, sceneWords, stepTwoSummary, wishAnchor, wishKey, type FilmRow, type FilmWish, type RowChoice } from "../../lib/bordet.ts";
import { useViewContext } from "../../lib/context.ts";
import { isSnapshot, swedishMoment } from "../../lib/mode.ts";
import { nodeCode } from "../../lib/names.ts";
import { GUIDE_WORDS, cardOf, filmCode, gapCards, guideOf, itemOf, pickFor, pickOfWish, pickTree, sameIn, treeBase, type GuideItem, type StepPick } from "../../lib/new-film.ts";
import { getOrders, orderingState, presetOf, type CreatedOrders, type DollOrdered } from "../../lib/orders.ts";
import { PLAN_VIEW, START_PLACE, changedPlaces, placeCode, placeFromCode, placeName } from "../../lib/placement.ts";
import { useTrees } from "../map/useTrees";
import { getMedia } from "../material/client.ts";
import { getLedger } from "../ledger/LedgerView";
import { OrderView } from "../order/OrderView";
import { Board } from "../placement/Board";
import { FilmBar } from "../placement/FilmBar";
import { MotionPanel, PlacePanel, TablePanel } from "../placement/Panels";
import { SlotPicker } from "../placement/SlotPicker";
import { pathCard, usePathPlay, usePlanKeys, useUnder } from "../placement/useBoard.ts";
import { draftActions, useDraft } from "../placement/useDraft.ts";
import { Page } from "../shell";
import { Badge, Button, ErrorState, IconButton, SegmentedControl, Select, Skeleton, Switch, cn, useToast } from "../ui";
import type { Made } from "./FilmList";
import { DollNote, DollStage, PLAYER_CARD, dollPartOf, ownDoll, useDollGroups, useDollStandard, type DollPart } from "./DollPanel";
import { NewFilm, type Phase } from "./NewFilm";
import type { SceneKind } from "./SceneBody";
import { RowSends } from "./Sends";

// The live picture is loaded only when it is chosen, so that Kortplan stays light.
const SceneBody = dynamic(() => import("./SceneBody").then((m) => m.SceneBody), { ssr: false, loading: () => <Skeleton className="m-4 h-[60vh] rounded-md" /> });

export type Mode = "kortplan" | "ko" | SceneKind;
export const MODES: readonly { value: Mode; label: string }[] = [
  { value: "kortplan", label: "Kortplan" },
  { value: "ko", label: "Kön" },
  { value: "scen", label: "Scen" },
  { value: "rafilm", label: "Råfilm" },
  { value: "efterarbete", label: "Efterarbete" },
];
/** The parts the menu shows: the copy orders nothing, so it has no Kön. */
const SHOWN_MODES = isSnapshot ? MODES.filter((m) => m.value !== "ko") : MODES;
const isMode = (v: string | null): v is Mode => SHOWN_MODES.some((m) => m.value === v);
const isScene = (m: Mode): m is SceneKind => m === "scen" || m === "rafilm" || m === "efterarbete";
/** A dealer with no drafts made: one object, so that the reference stays the same between renders. */
const NO_DRAFTS: Made = {};
/** No card ringed on the board. */
const NO_MARKS: ReadonlySet<Place> = new Set();
/**
 * Step 2's line on what the motion follows, with what step 3 knows: where the recipe's text would follow a reference film
 * and none goes with the deal (the rule finds none for the place, or he chose without), the line says so, so that the two
 * steps never say opposite things.
 */
function withReference(line: string | null, deal: FilmRow | null): string | null {
  const recipe = deal?.resolved.recipe;
  return line && recipe && recipe.reference !== "ingen" && !deal.reference ? `${line} · men filmen beställs utan referensfilm` : line;
}

type Params = { get(name: string): string | null };
/** The address asks for Kön: ?lage=ko, and Beställ's old words (?lage=bestall&ko=1, ?order=<id>, ?ny=1&som=<id>). */
const asksQueue = (p: Params) => !isSnapshot && (p.get("lage") === "ko" || p.get("ko") === "1" || !!p.get("order") || (p.get("ny") === "1" && !!p.get("som")));
/** The address asks for the doll: ?lage=docka, the old part Docka's word (and /docka/'s), opens Kortplan's step 2 with the doll. */
const asksDoll = (p: Params) => !isSnapshot && p.get("lage") === "docka";
/** What Kortplan's picture shows: the plan, or the doll's lab or films. */
export type Stage = "plan" | DollPart;
/** The menu's part the address asks for; ?lage=bestall (Beställ, which is now step 3) and ?lage=docka open Kortplan. */
const modeOf = (p: Params): Mode => (asksQueue(p) ? "ko" : isMode(p.get("lage")) ? (p.get("lage") as Mode) : "kortplan");
/** Beställ's old words, read once and then taken out of the address. */
const OLD_WORDS = ["ko", "ny", "som", "steg", "modell"] as const;

/**
 * Where an old address of Ny beställning (?ny=1&steg=GIV-2.2&plats=P4.C1&modell=…) leads now: the card, the film the guide
 * opens on (with the model as his exception where one was named) and step 3 open. Null for any other address.
 */
function oldOrder(p: Params): { place: Place | null; wish: FilmWish | null; model: string | null } | null {
  const preset = isSnapshot ? null : presetOf(p);
  if (!preset || preset.like) return null;
  const def = preset.step ? stepOf(preset.step) : null;
  const wish = def && (!def.card || preset.target) ? { step: def.key, target: def.card ? preset.target : null } : null;
  return { place: placeFromCode(preset.target), wish, model: wish ? preset.model : null };
}

/**
 * The view's address: the menu's part and the card ("?lage=ko&plats=p4c1"), with the guide open its tree, step and
 * composition (?lage=bestall&trad=…&film=…, so that a reload opens the same), and with the doll shown ?lage=docka (and
 * &del=filmer for its films); the rail's dealer and robot are kept.
 */
function writeAddress(mode: Mode, place: Place, guide: Partial<Record<(typeof GUIDE_WORDS)[number], string>> | null, doll: DollPart | null) {
  const p = new URLSearchParams(window.location.search);
  const like = p.get("ny") === "1" ? p.get("som") : null;
  for (const w of OLD_WORDS) p.delete(w);
  // Kön keeps the open order ("Ny beställning som den här" opens the order it was like); elsewhere there is none.
  if (mode === "ko") {
    if (like && !p.get("order")) p.set("order", like);
  } else p.delete("order");
  // Scen's words (the round, the look) belong to the live picture.
  if (!isScene(mode)) for (const key of [...p.keys()]) if (sceneWords.has(key) && key !== "robot") p.delete(key);
  for (const w of GUIDE_WORDS) {
    const value = mode === "kortplan" ? guide?.[w] : undefined;
    if (value) p.set(w, value);
    else p.delete(w);
  }
  if (mode === "kortplan" && guide) p.set("lage", "bestall");
  else if (mode === "kortplan" && doll) p.set("lage", "docka");
  else if (mode === "kortplan") p.delete("lage");
  else p.set("lage", mode);
  if (mode === "kortplan" && !guide && doll === "filmer") p.set("del", doll);
  else p.delete("del");
  if (place === START_PLACE) p.delete("plats");
  else p.set("plats", placeCode(place).toLowerCase());
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

type StepId = "place" | "motion" | "order";

/**
 * A film's exceptions with one more, and without those the form hides after it (Sends.tsx), so that nothing unseen goes
 * with the draft: tur och retur has no Slutbild, bara dit no card size, and another model its own lengths and reference
 * films (both back to the recipe's). A choice set back to the recipe's (undefined: "Platsens egen", "Med dockans film") is
 * taken out, so that a row with nothing chosen is not called changed.
 */
function withPatch(was: RowChoice, patch: RowChoice): RowChoice {
  const next: RowChoice = { ...was, ...patch };
  if (patch.shape === "ROUND_TRIP") delete next.end;
  if (patch.shape === "ONE_WAY") delete next.cardScale;
  if ("model" in patch && patch.model !== was.model) {
    if (!("duration" in patch)) delete next.duration;
    if (!("reference" in patch)) delete next.reference;
  }
  for (const key of Object.keys(next) as (keyof RowChoice)[]) if (next[key] === undefined) delete next[key];
  return next;
}

export function BordetView() {
  const params = useSearchParams();
  const [first] = useState(() => oldOrder(params));
  // An old Ny beställning link (?ny=1&steg=…&plats=…) opens Kortplan at its card even when /bestall/ added ko=1 to it.
  const [mode, setMode] = useState<Mode>(() => (first ? "kortplan" : modeOf(params)));
  // A link to Kön while the view is open (an order's "Utkast gjort", "Öppna i Kön") opens Kön.
  const askedQueue = asksQueue(params);
  const [seenAsk, setSeenAsk] = useState(askedQueue);
  if (askedQueue !== seenAsk) {
    setSeenAsk(askedQueue);
    if (askedQueue) setMode("ko");
  }
  // The picture of Kortplan: the plan, or the doll (step 2). A link to the doll while the view is open (/docka/, an old
  // ?lage=docka) shows it; a link to the view without the word while it shows (the rail's Scen & bord) shows the plan.
  const askedDoll = asksDoll(params);
  const [stage, setStage] = useState<Stage>(() => (!first && askedDoll ? dollPartOf(params.get("del")) : "plan"));
  const [step, setStep] = useState<StepId | null>(() => (first || params.get("lage") === "bestall" ? "order" : askedDoll ? "motion" : "place"));
  const [seenDoll, setSeenDoll] = useState(askedDoll);
  if (askedDoll !== seenDoll) {
    setSeenDoll(askedDoll);
    if (askedDoll) {
      setMode("kortplan");
      setStep("motion");
      setStage(dollPartOf(params.get("del")));
    } else if (!askedQueue && params.get("lage") !== "bestall") setStage("plan");
  }
  /** A step opened: step 2 shows the doll (Ställ dockan, or the films where they show), step 1 and 3 the plan. */
  const openStep = (next: StepId | null) => {
    setStep(next);
    if (isSnapshot || next === null) return;
    setStage((was) => (next === "motion" ? (was === "plan" ? "stall" : was) : "plan"));
  };
  // Raised when the doll lab saves a standard: what step 2 and 3 say of it is read again.
  const [savedTick, setSavedTick] = useState(0);
  const onDollSaved = useCallback(() => setSavedTick((n) => n + 1), []);
  const [media, setMedia] = useState<MediaAnswer | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [choices, setChoices] = useState<Record<string, RowChoice>>(() => (first?.wish && first.model ? { [wishKey(first.wish)]: { model: first.model } } : {}));
  // The guide Ny film: the tree and step the address names (Karta's "Beställ"), or the film of an old Ny beställning link.
  const [guide, setGuide] = useState<{ tree: string | null; pick: StepPick | null; composition: string | null; phase: Phase }>(() => {
    const asked = isSnapshot ? null : guideOf(params);
    const pick = asked?.pick ?? (first?.wish ? pickOfWish(first.wish) : null);
    return { tree: asked?.tree ?? null, pick, composition: asked?.composition ?? null, phase: pick ? "hur" : "vad" };
  });
  const [place, setPlace] = useState<Place>(() => first?.place ?? placeFromCode(guide.pick ? cardOf(guide.pick) : null) ?? placeFromCode(params.get("plats")) ?? START_PLACE);
  const [madeBy, setMadeBy] = useState<Record<string, Made>>({});
  const [orders, setOrders] = useState<OrdersAnswer | null>(null);
  const [ordersRead, setOrdersRead] = useState(false);
  const draft = useDraft();
  const toast = useToast();
  const { dealer, dealers, bank, graph, status, readAt, setDealer } = useBank();
  const trees = useTrees(isSnapshot ? null : dealer, readAt);
  // The drafts made follow their dealer: a switch away and back still shows them as made, so no second draft of the same film.
  const made = madeBy[dealer] ?? NO_DRAFTS;
  // The rail's switch to another dealer: the exceptions (their pictures and films are the other dealer's) go, and the guide
  // opens her own tree (the step stays: it names nodes only). The first settling of the dealer (the address read after the
  // default) is no switch and resets nothing, so an old link's model exception and Karta's tree stay.
  const [seenDealer, setSeenDealer] = useState<string | null>(null);
  if (status !== "loading" && dealer !== seenDealer) {
    if (seenDealer !== null) {
      setChoices({});
      setGuide((g) => ({ ...g, tree: null, composition: null }));
    }
    setSeenDealer(dealer);
  }
  const views = trees.answer?.trees;
  const view = useMemo(() => pickTree(views ?? [], guide.tree), [views, guide.tree]);
  const item = guide.pick ? itemOf(view, guide.pick) : null;
  // A card chosen on the board (or in the place buttons) moves the guide's step to that card; what is sent is then read again.
  const [seenPlace, setSeenPlace] = useState(place);
  if (place !== seenPlace) {
    setSeenPlace(place);
    const pick = item ? pickFor(view, item, place) : null;
    if (pick && item && (pick.from !== item.from || pick.to !== item.to)) setGuide({ ...guide, pick, phase: guide.phase === "skicka" ? "hur" : guide.phase });
  }
  const guideOpen = !isSnapshot && mode === "kortplan" && step === "order";
  const treeWord = guideOpen ? (view?.tree.id ?? guide.tree) : null;
  const filmWord = guideOpen && guide.pick ? filmCode(guide.pick) : null;
  const compositionWord = guideOpen ? guide.composition : null;
  const dollShown = !isSnapshot && mode === "kortplan" && stage !== "plan" ? stage : null;
  useEffect(() => writeAddress(mode, place, guideOpen ? { trad: treeWord ?? undefined, film: filmWord ?? undefined, komposition: compositionWord ?? undefined } : null, dollShown), [mode, place, guideOpen, treeWord, filmWord, compositionWord, dollShown]);
  const readOrders = useCallback(
    () =>
      getOrders().then(
        (o) => (setOrders(o), setOrdersRead(true)),
        () => (setOrders(null), setOrdersRead(true)),
      ),
    [],
  );
  useEffect(() => {
    // the copy orders nothing: no orders, no pictures to send, no protocol
    if (isSnapshot) return;
    void readOrders();
    void getMedia().then(setMedia, () => setMedia(null));
    void getLedger().then(setLedger, () => setLedger(null));
  }, [readOrders]);
  useViewContext({ vy: "bordet", val: { läge: MODES.find((m) => m.value === mode)?.label, plats: placeCode(place), film: guideOpen ? item?.name : undefined } });

  const d = draft.draft;
  const plan = d?.plan ?? null;
  // The dealer's pictures in Material and the bank with the dummy's rendered films: what a film's recipe is resolved against
  // (its reference film by rule, the seat's own end picture), the same as the store resolves it when the draft is made.
  const entries = useMemo(() => media?.dealers.find((x) => x.id === dealer)?.entries ?? [], [media, dealer]);
  const bankFacts = useMemo<BankFacts | null>(() => (bank ? { ...(bank as BankFacts), rendered: orders?.rendered ?? [], cutChecks: orders?.cutChecks } : null), [bank, orders]);
  const rowOf = useCallback(
    (w: FilmWish) => filmRow(dealer, w, orders?.methods ?? null, orders?.policy ?? null, { bank: bankFacts, choice: choices[wishKey(w)], entries, plan: orders?.plan ?? null, dealers: orders?.dealers, marks: orders?.marks }),
    [dealer, orders, bankFacts, choices, entries],
  );
  // The guide's film as Beställ makes it, and the draft's body: the row's, with the tree's own anchor picture where the
  // picture that holds in Material is another (the store's existing base; nothing new in the order's format).
  const guideRow = item?.wish ? rowOf(item.wish) : null;
  const base = view && item?.wish ? treeBase(view, item.wish, entries) : null;
  const body = guideRow?.body ? (base ? { ...guideRow.body, base } : guideRow.body) : null;

  // Whether anything can be approved now (the mandate, the caps, the balance), in one line where films are ordered.
  const ordering = orders ? orderingState(orders) : null;
  const orderable = !orders?.dealers || orders.dealers.some((x) => x.id === dealer);
  // A paused dealer (data/dealers.json, his word) gets nothing new: no draft is made for her.
  const paused = !!orders?.dealers?.find((x) => x.id === dealer)?.paused;
  const dealerName = dealers.find((x) => x.id === dealer)?.name ?? dealer;
  const madeAnswer = guideRow && made[guideRow.key] ? (orders?.orders.find((a) => a.order.id === made[guideRow.key]) ?? null) : null;
  const blocked = !ordersRead ? "Läser beställningarna …" : !orders ? "Beställningarna kunde inte läsas från labbservern." : paused ? `${dealerName} är pausad: inget nytt beställs.` : !orderable ? `Filmer till ${dealerName} kan inte beställas härifrån.` : draft.dirty ? "Spara kortplanen först: utkastet ritar kortet där den sparade planen lägger det." : guideRow && made[guideRow.key] && !madeAnswer ? "Utkastet är sparat: läser Kön …" : null;
  // The dealers the guide can order for: those not paused.
  const orderDealers = orders?.dealers ? orders.dealers.filter((x) => !x.paused) : dealers;

  /** A draft saved by the guide (the recipe's, or the doll's: made.id): the row is made, and the orders are read again. */
  const madeDraft = (id: string, detail: string) => {
    if (!guideRow) return;
    const key = guideRow.key;
    setMadeBy((was) => ({ ...was, [dealer]: { ...(was[dealer] ?? {}), [key]: id } }));
    toast({ tone: "ok", title: "Utkastet är sparat", detail });
    void readOrders();
  };
  const created = (answer: CreatedOrders) => madeDraft(answer.made[0], "Det godkänns i Kön.");
  const dollMade = (made: DollOrdered) => madeDraft(made.id, `Med dockans film ${made.film}. Det godkänns i Kön.`);
  // The doll's standard for the chosen card (step 2 says it, step 3 orders from it), and the doll's films by card.
  const standard = useDollStandard(dealer, place, savedTick, !isSnapshot && mode === "kortplan" && (step === "motion" || step === "order"));
  const doll = useDollGroups(orders, ledger);
  // Step 3 orders a deal from A2.3 to a player's card from the doll's saved standard (BESKED "Ett ställe för dockan"; "Givarna
  // från A2.3 beställs ändå med dockans film"), where the dealer has a doll of her own. tools/doll-order.ts sends the anchor
  // that holds in Material; where the tree's own picture is another, the panel says so (treePicture).
  const dollTarget = guideRow?.wish.step === "GIV-2.3" ? guideRow.wish.target : null;
  const dollWay = dollTarget && PLAYER_CARD.test(dollTarget) && ownDoll(dealer) ? { place: dollTarget, standard, treePicture: base } : null;
  /** A step chosen among the tiles: its card is chosen on the board (and its path played), and the guide goes on to Hur. */
  const pickItem = (i: GuideItem, go: (card: Place) => void) => {
    setGuide((g) => ({ ...g, pick: { from: i.from, to: i.to }, phase: "hur" }));
    const at = i.card ? placeFromCode(i.card) : null;
    if (at && at !== place) go(at);
  };
  /** Another tree: the same step in it (the giv to the card from its own anchor), and no composition to go back to. */
  const chooseTree = (id: string) => {
    const next = views?.find((v) => v.tree.id === id);
    setGuide((g) => ({ ...g, tree: id, composition: null, pick: next && item ? sameIn(next, item) : g.pick }));
  };

  const save = async () => {
    const result = await draftActions.save();
    if (result.ok) {
      toast({ tone: "ok", title: "Kortplanen är sparad" });
      // the rows read the plan from the orders' answer (its sides, hands, text and marks): read it again
      void readOrders();
    }
    else toast({ tone: "bad", title: result.conflict ? "Planen har ändrats på annat håll" : "Kortplanen sparades inte", detail: result.message });
  };

  const menu = <SegmentedControl size="sm" label="Bordets delar" value={mode} onChange={setMode} options={SHOWN_MODES.map((m) => ({ value: m.value, label: m.label }))} />;
  // What goes to Runway for the guide's film, before and after its draft is made.
  const names = Object.fromEntries((orders?.dealers ?? []).map((x) => [x.id, x.name]));
  const intent = plan && place !== SHOE ? (plan.targets[place]?.intent ?? null) : null;
  // The card's deal as Beställ makes it: what step 2's line says of the reference film.
  const dealRow = useMemo(() => {
    const deal = place !== SHOE ? cardWishes(place, intent, dealer)[0] : undefined;
    return deal ? rowOf(deal) : null;
  }, [place, intent, dealer, rowOf]);
  // Förra filmen: the film's last order (the same dealer, step and card, not set aside), with the takes that came of it.
  const lastAnswer = guideRow ? lastOrder(orders?.orders ?? [], dealer, guideRow.wish, (id) => !!ledger?.rows.some((r) => r.order === id && r.see.film)) : null;
  const last = lastAnswer ? { answer: lastAnswer, takes: (ledger?.rows ?? []).filter((r) => r.order === lastAnswer.order.id) } : null;
  const sendsPanel = guideRow ? (
    <RowSends
      row={guideRow}
      names={names}
      bank={bankFacts}
      dealer={dealer}
      choice={choices[guideRow.key] ?? {}}
      onChoice={(patch) => setChoices((was) => ({ ...was, [guideRow.key]: patch ? withPatch(was[guideRow.key] ?? {}, patch) : {} }))}
      made={madeAnswer}
      all={orders}
      last={last}
    />
  ) : null;
  // While the guide shows the tree's steps, the board rings the cards that lack a film in it.
  const marked = useMemo<ReadonlySet<Place>>(() => (guideOpen && guide.phase === "vad" && view ? gapCards(view) : NO_MARKS), [guideOpen, guide.phase, view]);
  const gaps = view ? view.steps.filter((s) => s.state === "saknas").length : 0;
  const guideSummary = item ? item.name : view ? `${view.tree.name} · ${gaps ? `${gaps} saknas` : "inget saknas"}` : null;
  const newFilm = (go: (card: Place) => void) => (
    <NewFilm
      dealer={dealer}
      dealers={orderDealers}
      onDealer={setDealer}
      trees={trees}
      view={view}
      onTree={chooseTree}
      item={item}
      phase={guide.phase}
      onPhase={(phase) => setGuide((g) => ({ ...g, phase }))}
      onPick={(i) => pickItem(i, go)}
      place={place}
      row={guideRow}
      body={body}
      sends={sendsPanel}
      entries={entries}
      names={names}
      ordering={ordering}
      blocked={blocked}
      made={madeAnswer}
      orders={orders}
      composition={guide.composition}
      onCreated={created}
      doll={dollWay}
      onDollMade={dollMade}
    />
  );
  const table = mode === "kortplan";
  const changes = d ? changedPlaces(d.saved, d.plan) : { places: [], table: false };
  const count = changes.places.length + (changes.table ? 1 : 0);
  const when = d?.saved.updatedAt ? swedishMoment(d.saved.updatedAt) : null;
  // Scen plays the card's round from the anchor its films go from where the bank has that round; the game's own until then.
  const card = pathCard(place);
  const from = plan?.targets[card] ? wishAnchor(dealer, card, plan.targets[card].intent) : null;
  const roundText = roundFor(card, dealer, from && hasRound(graph, card, from) ? from : null);

  // Kön: the same frame and menu over the orders (the queue, or an order open with "Det här skickas").
  if (mode === "ko") return <OrderView menu={menu} />;
  return (
    <Page
      title="Scen & bord"
      full
      status={
        !table ? null : draft.dirty ? (
          <Badge tone="brass" size="md">
            ● Osparat · {count} {count === 1 ? "ändrad" : "ändrade"}
          </Badge>
        ) : when ? (
          <span className="text-faint">Sparad {when}</span>
        ) : null
      }
      actions={
        d && table && !isSnapshot ? (
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
          <div className="flex h-full flex-col gap-4 p-5 lg:flex-row">
            <Skeleton className="aspect-[3/2] shrink-0 rounded-md lg:aspect-auto lg:h-full lg:flex-1" />
            <Skeleton className="h-36 shrink-0 rounded-md lg:h-full lg:w-[400px]" />
          </div>
        ) : (
          <TableBody
            menu={menu}
            step={step}
            setStep={openStep}
            stage={isSnapshot ? "plan" : stage}
            setStage={setStage}
            dollCount={doll.count}
            doll={isSnapshot ? null : <DollStage part={dollShown} place={place} setPlace={setPlace} dealer={dealer} orders={orders} ordersRead={ordersRead} groups={doll.groups} onSaved={onDollSaved} />}
            dollNote={isSnapshot ? null : <DollNote dealer={dealer} place={place} standard={standard} />}
            place={place}
            setPlace={setPlace}
            marked={marked}
            dealer={dealer}
            methods={orders?.methods ?? null}
            dealRow={dealRow}
            newFilm={newFilm}
            newFilmSummary={guideSummary}
          />
        )
      ) : (
        <SceneBody kind={mode as SceneKind} toolbar={menu} roundText={roundText} />
      )}
    </Page>
  );
}

function TableBody({
  menu, step, setStep, stage, setStage, dollCount, doll, dollNote, place, setPlace, marked, dealer, methods, dealRow, newFilm, newFilmSummary,
}: {
  menu: ReactNode;
  step: StepId | null;
  setStep: (s: StepId | null) => void;
  /** What the picture shows: the plan, or the doll's lab or films. */
  stage: Stage;
  setStage: (s: Stage) => void;
  /** How many films of the doll's there are, for the toolbar. */
  dollCount: number;
  /** The doll's lab and films (DollStage), kept loaded while the plan shows; null in the copy. */
  doll: ReactNode;
  /** Step 2's line on the doll's saved standard; null in the copy. */
  dollNote: ReactNode;
  place: Place;
  setPlace: (p: Place) => void;
  /** The cards the board rings: those that lack a film in the guide's tree. */
  marked: ReadonlySet<Place>;
  dealer: string;
  methods: OrdersAnswer["methods"] | null;
  /** The chosen card's deal as Beställ makes it (step 2's line on the reference film), or null. */
  dealRow: FilmRow | null;
  /** Step 3, the guide Ny film; go chooses a card on the board and plays its path. */
  newFilm: (go: (card: Place) => void) => ReactNode;
  /** One line of what the guide has chosen, for step 3 folded. */
  newFilmSummary: string | null;
}) {
  const draft = useDraft();
  const d = draft.draft!;
  const showSaved = draft.showing === "saved" && draft.dirty;
  const plan = showSaved ? d.saved : d.plan;
  const editable = !isSnapshot && !draft.saving && !showSaved;
  // One view: the card plan is edited once, in the bank's picture (PLAN_VIEW; Jakob 2026-11-18: "ingenting skulle göras dubbelt för mobilen").
  const view = PLAN_VIEW;
  const [allCards, setAllCards] = useState(true);
  const [grid, setGrid] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const under = useUnder(place, { backdrop: null, frame: 0 });
  // The anchor a card's films go from, named on the path's steps as step 2 names it.
  const anchorOf = useCallback((id: string) => nodeCode(ANCHOR_NODE[wishAnchor(dealer, id, plan.targets[id]?.intent ?? null)]), [dealer, plan]);
  const paths = usePathPlay(plan, anchorOf);
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
  usePlanKeys({ place, editable, dirty: draft.dirty, showing: draft.showing, area: stageArea, onEscape: paths.stop });

  // Side by side (a wide, lying window): the picture gets the height its width allows, less what the toolbar needs, so that
  // the toolbar is never cut off. Upright or narrow: one column that scrolls as one, every part at its own height: the
  // picture at its own shape, though at most a share of what is seen (lib/bordet.ts columnStage), then the place buttons and
  // the steps. The picture's column and the steps' may be squeezed (min-h-0) only side by side, where each scrolls within
  // itself: squeezed in one column they shared the window's height, and the picture ran on under the place buttons (Jakob
  // 2026-11-23).
  const column = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, bar: 0, seen: 0 });
  useEffect(() => {
    const el = column.current!;
    const frame = el.parentElement!; // the view's own box: its height is what is seen of a column that scrolls
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight, bar: bar.current?.offsetHeight ?? 0, seen: frame.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(frame);
    if (bar.current) ro.observe(bar.current);
    return () => ro.disconnect();
  }, []);
  const film = under.film;
  const extra = size.bar + (film ? 44 : 0) + (showSaved ? 30 : 0) + (draft.conflict ? 30 : 0);
  const free = size.h - extra;
  const stageAspect = VIEWS[view].width / VIEWS[view].height;
  const stageHeight = size.w ? Math.max(STAGE_MIN, Math.min(free, size.w / stageAspect)) : 0;
  // --stage-column is the one column's height; until the column is measured the picture's shape holds its place
  const stageSize = { "--stage-aspect": stageAspect, "--stage-height": `${stageHeight}px`, "--stage-column": size.w ? `${columnStage(size.w, size.seen, stageAspect)}px` : "auto" } as CSSProperties;

  const shoe = place === SHOE;
  const target = !shoe ? plan.targets[place] : null;
  const intent = target?.intent ?? null;
  // A step of the guide with a card chooses that card and plays its path, as a click on the card does.
  const go = (card: Place) => {
    setPlace(card);
    paths.play(card);
  };
  const toggle = (s: StepId) => setStep(step === s ? null : s);
  const steps: { id: StepId; title: string; summary: string | null; body: ReactNode }[] = [
    {
      id: "place",
      title: shoe ? "Skons läge" : "Var kortet landar",
      summary: shoe ? null : `${placeCode(place)}${target?.geometry[view].reviewed ? " · kontrollerad" : " · inte kontrollerad"}`,
      body: <PlacePanel plan={plan} id={place} editable={editable} />,
    },
    ...(shoe
      ? []
      : [
          {
            id: "motion" as const,
            title: "Hur det kommer dit",
            summary: stepTwoSummary(dealer, place, intent),
            body: (
              <>
                {dollNote}
                <MotionPanel
                  plan={plan}
                  id={place}
                  editable={editable}
                  lit={paths.run?.id === place ? paths.lit : null}
                  line={withReference(motionLine(dealer, place, intent, methods ?? null), dealRow)}
                  anchor={nodeCode(ANCHOR_NODE[wishAnchor(dealer, place, intent)])}
                />
              </>
            ),
          },
        ]),
    ...(isSnapshot
      ? []
      : [
          {
            id: "order" as const,
            title: "Ny film",
            summary: newFilmSummary,
            body: newFilm(go),
          },
        ]),
  ];

  const board = stage === "plan";
  // The scrollbar's room is kept in one column, so that the column's width, and with it the picture's height, never follows the scrollbar.
  return (
    <div className="grid h-full min-h-0 grid-cols-1 content-start overflow-y-auto [scrollbar-gutter:stable] lg:landscape:grid-cols-[minmax(0,1fr)_400px] lg:landscape:content-stretch lg:landscape:overflow-hidden lg:landscape:[scrollbar-gutter:auto]">
      {/* the doll covers the picture below the toolbar, and gets most of the window's height in one column */}
      <section ref={column} className={cn("relative flex min-w-0 flex-col lg:landscape:min-h-0", !board && "min-h-[85vh] lg:landscape:min-h-0")}>
        <div ref={bar} className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5">
          {menu}
          <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
          {doll ? (
            <>
              <SegmentedControl
                size="sm"
                label="Bilden"
                value={stage}
                onChange={setStage}
                options={[
                  { value: "plan", label: "Planen" },
                  { value: "stall", label: "Ställ dockan" },
                  { value: "filmer", label: dollCount ? `Dockans filmer · ${dollCount}` : "Dockans filmer" },
                ]}
              />
              {board ? <span aria-hidden className="h-5 w-px shrink-0 bg-line" /> : null}
            </>
          ) : null}
          {board ? (
            <>
              <Button size="sm" variant={paths.run ? "secondary" : "primary"} aria-pressed={!!paths.run} icon={paths.run ? <Square /> : <Play />} onClick={() => paths.toggle(place)} className="shrink-0">
                {paths.run ? "Stoppa" : "Spela kortbanan"}
              </Button>
              <Switch size="sm" checked={paths.halfSpeed} onChange={paths.setHalfSpeed} label="Halv fart" />
              <Select size="sm" aria-label="Under korten" value={under.value} onChange={under.choose} options={under.options} className="w-48 shrink-0" />
              <Switch size="sm" checked={allCards} onChange={setAllCards} label="Alla kort" />
              <Switch size="sm" checked={grid} onChange={setGrid} label="Rutnät" />
            </>
          ) : null}
        </div>
        {draft.conflict ? <p className="shrink-0 border-b border-underkand/30 bg-underkand/8 px-4 py-1.5 text-xs text-[#ef8b8b]">Planen har ändrats på annat håll sedan den lästes.</p> : null}
        {showSaved ? (
          <p data-showing-saved className="shrink-0 border-b border-brass/30 bg-brass/10 px-4 py-1.5 text-xs text-brass-hi">
            Visar den sparade planen · X tillbaka till utkastet. Inget kan ändras så länge.
          </p>
        ) : null}
        <div ref={stageArea} className="relative aspect-[var(--stage-aspect)] h-[var(--stage-column)] shrink-0 lg:landscape:aspect-auto lg:landscape:h-[var(--stage-height)]" style={stageSize}>
          {stageHeight ? (
            <Board
              plan={plan}
              other={showSaved ? d.plan : d.saved}
              selected={place}
              onSelect={choose}
              editable={editable}
              allCards={allCards}
              grid={grid}
              changed={changed}
              backdrop={under.under}
              shoeCard={under.shoeCard}
              path={paths.path}
              onPhase={paths.setPhase}
              videoRef={under.videoRef}
              label={under.label}
              marked={marked}
              className="absolute inset-0"
            />
          ) : null}
        </div>
        {film ? <FilmBar key={film.id} videoRef={under.videoRef} fps={film.fps} frames={film.frames} onFrame={under.setFrame} /> : null}
        {doll ? (
          <div data-doll-stage className={cn("absolute inset-x-0 bottom-0 bg-canvas", board && "hidden")} style={{ top: size.bar }}>
            {doll}
          </div>
        ) : null}
      </section>
      <aside className="flex min-w-0 flex-col border-t border-line bg-surface lg:landscape:min-h-0 lg:landscape:border-l lg:landscape:border-t-0" data-nudge>
        <div className="flex flex-col gap-2.5 border-b border-line px-4 pb-3 pt-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="font-mono text-base font-semibold text-ink">{placeCode(place)}</h2>
            <span className="truncate text-sm text-dim">{placeName(place)}</span>
            {changed.has(place) ? <Badge tone="brass">ändrad</Badge> : null}
          </div>
          <SlotPicker plan={plan} selected={place} changed={showSaved ? new Set() : changed} onSelect={choose} />
        </div>
        <div className="lg:landscape:min-h-0 lg:landscape:flex-1 lg:landscape:overflow-y-auto lg:landscape:[scrollbar-gutter:stable]">
          {steps.map((s, i) => (
            <Step key={s.id} n={i + 1} title={s.title} summary={s.summary} open={step === s.id} onToggle={() => toggle(s.id)}>
              {s.body}
            </Step>
          ))}
          {/* what holds for every card is not one card's step: the table, after the chosen card's steps */}
          <section className={cn("border-b border-line", tableOpen && "bg-raised/25")}>
            <button type="button" onClick={() => setTableOpen(!tableOpen)} aria-expanded={tableOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-raised/40">
              <span aria-hidden className="w-6 text-center text-dim">{tableOpen ? "▾" : "▸"}</span>
              <span className="text-md font-semibold text-ink">Hela bordet</span>
              <span className="text-xs text-dim">alla kort</span>
            </button>
            {tableOpen ? <TablePanel plan={plan} editable={editable} /> : null}
          </section>
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
