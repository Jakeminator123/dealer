// Bordet (/bordet/): the lab's one view of the table, where a card's place, its way there and the films to order are set in
// one frame (Jakob 2026-11-17: "Scen och placering bör ha samma typ av vy, och på högersidan ska man kunna ändra och laborera
// med detta. Detta ska också vara underlaget för beställning av nya filmer."). Pure helpers for it: the stage's camera (fit,
// zoom towards the pointer, pan, the close-up on a card), the one card shape every card on the stage is drawn with, and the
// list of films to order (step 3): which steps a card can have, each in his notation, with its step's one recipe
// (data/order-methods.json), what the store will resolve for it (lineOf, from the same pure functions the store uses), its
// estimated price and the choices sent for a server preview: the dealer, the step and the card, and over them only his deliberate exceptions.
// Nothing here composes an order: the store does, as for every draft. No DOM, no network; tests in studio/tests/bordet.test.ts.
import {
  ANCHOR_NODE, a3Candidates, a3Name, costOf, credits, defaultFlip, genitive, handsOf, landingOf, modelFor, paramsOf, referenceCandidates, seatEndOf, seatWords, stepOf,
  type Anchor, type BankFacts, type FlipAxis, type HandChoice, type ModelDef, type PlanAnswer, type Policy, type RefCandidate, type SeatEnd, type Shape, type StepDef, type StepKey, type TextStyle,
} from "../../src/order-model.ts";
import { methodFor, recipeFor, recipeHands, recipeWords, referenceByRule, referenceWaits, secondsOf, type Method, type MethodRegister, type Recipe } from "../../src/order-methods.ts";
import type { Place, Side } from "../../src/placement-model.ts";
import { SHOE } from "../../src/placement-model.ts";
import { dealAnchor, type NewOrderInput } from "./orders.ts";
import { SCENE_KEYS } from "./scene-keys.ts";
import { nodeCode } from "./names.ts";

// ── The camera ──────────────────────────────────────────────────────────────
// scale: screen pixels per picture pixel (1 = 100 %); x, y: the picture's point at the middle of the stage. "Anpassa" lays
// the whole picture in the stage; the wheel zooms towards the pointer, a drag pans, "Närbild" frames the chosen card.
export type Camera = { scale: number; x: number; y: number };
export type Size = { w: number; h: number };
export const ZOOM_MAX = 6;
/** The scale that lays the whole picture in the stage. */
export const fitScale = (area: Size, picture: Size): number => (area.w > 0 && area.h > 0 ? Math.min(area.w / picture.w, area.h / picture.h) : 1);
/** The whole picture, in the middle of the stage. */
export const fitCamera = (area: Size, picture: Size): Camera => ({ scale: fitScale(area, picture), x: picture.w / 2, y: picture.h / 2 });
/**
 * The smallest scale: the fitted one ("Anpassa"). The picture is a still with nothing round it, so zooming out past the whole
 * picture would only show the stage's black (Jakob 2026-11-17: "det är bara svart omkring, ska det vara så?").
 */
export const minScale = (area: Size, picture: Size) => fitScale(area, picture);
/** A camera kept sane: its scale within the fit and ZOOM_MAX, its middle on the picture. */
export function clampCamera(c: Camera, area: Size, picture: Size): Camera {
  const scale = Math.min(ZOOM_MAX, Math.max(minScale(area, picture), c.scale));
  // Smaller than the stage in a direction: the picture stays in the middle there; larger: its edge never leaves the stage's.
  const axis = (v: number, size: number, room: number) => {
    const half = room / 2 / scale;
    return size * scale <= room ? size / 2 : Math.min(size - half, Math.max(half, v));
  };
  return { scale, x: axis(c.x, picture.w, area.w), y: axis(c.y, picture.h, area.h) };
}
/** Where the picture's top left corner lies on the stage, in screen pixels from the stage's top left. */
export const pictureOrigin = (c: Camera, area: Size) => ({ left: area.w / 2 - c.x * c.scale, top: area.h / 2 - c.y * c.scale });
/** A zoom by `factor` that keeps the picture's point under `at` (screen pixels from the stage's top left) where it is. */
export function zoomAt(c: Camera, factor: number, at: { x: number; y: number }, area: Size, picture: Size): Camera {
  const o = pictureOrigin(c, area);
  const px = (at.x - o.left) / c.scale;
  const py = (at.y - o.top) / c.scale;
  const scale = Math.min(ZOOM_MAX, Math.max(minScale(area, picture), c.scale * factor));
  // the same picture point under the pointer: at.x = area.w/2 - x*scale + px*scale
  return clampCamera({ scale, x: px - (at.x - area.w / 2) / scale, y: py - (at.y - area.h / 2) / scale }, area, picture);
}
/** A drag of the stage by (dx, dy) screen pixels: the picture follows the hand. */
export const panBy = (c: Camera, dx: number, dy: number, area: Size, picture: Size): Camera => clampCamera({ ...c, x: c.x - dx / c.scale, y: c.y - dy / c.scale }, area, picture);
/** 100 %: one picture pixel per screen pixel, about the same middle. */
export const actualCamera = (c: Camera, area: Size, picture: Size): Camera => clampCamera({ ...c, scale: 1 }, area, picture);
/**
 * "Närbild": the card (its four corners in picture pixels) in the middle of the stage, as large as a fifth of the stage's
 * shorter side gives it, never past ZOOM_MAX.
 */
export function closeUp(quad: readonly { x: number; y: number }[], area: Size, picture: Size): Camera {
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs)), h = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const scale = Math.min(area.w / (w * 5), area.h / (h * 5));
  return clampCamera({ scale, x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 }, area, picture);
}
/** "58 %": the scale as the zoom control writes it. */
export const scaleWords = (c: Pick<Camera, "scale">) => `${Math.round(c.scale * 100)} %`;

// ── One card shape ──────────────────────────────────────────────────────────
/**
 * A card as the films show it: its four corners with rounded corners whose radius is a share of the card's own shorter side
 * (a playing card's corner is about 5.5 % of its width), so that the card keeps one look at every zoom and every size; an
 * SVG path in the picture's pixels.
 */
export const CORNER = 0.08;
export function cardPath(quad: readonly { x: number; y: number }[], corner = CORNER): string {
  const n = quad.length;
  const side = (i: number) => Math.hypot(quad[(i + 1) % n].x - quad[i].x, quad[(i + 1) % n].y - quad[i].y);
  const r = corner * Math.min(...quad.map((_, i) => side(i)));
  const toward = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const k = Math.min(r, d / 2) / d;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = "";
  quad.forEach((p, i) => {
    const before = toward(p, quad[(i + n - 1) % n]);
    const after = toward(p, quad[(i + 1) % n]);
    d += `${i ? "L" : "M"}${f(before.x)},${f(before.y)}Q${f(p.x)},${f(p.y)} ${f(after.x)},${f(after.y)}`;
  });
  return `${d}Z`;
}

// ── Step 3: the films to order ──────────────────────────────────────────────
/** One film on the list: a step, and the card it is about (null for a step without one). */
export type FilmWish = { step: StepKey; target: string | null };
export const wishKey = (w: FilmWish) => `${w.step}@${w.target ?? ""}`;

/**
 * The films a card can have, as one click each: its deal from the anchor the game deals it from (dealAnchor), the return to that
 * anchor, the return to rest, and the deal with two hands from anchor 2.3. The shoe and a place without a card in the plan
 * (`planned` null) have none. Steps that cannot be ordered here (`off`) are left out.
 */
export function cardWishes(place: Place, planned: object | null, dealer: string): FilmWish[] {
  if (place === SHOE || !planned) return [];
  const from = dealAnchor(dealer, place), back = `RETUR-${from}`;
  const keys = [...new Set<StepKey>([`GIV-${from}` as StepKey, ...(stepOf(back) ? [back as StepKey] : []), "RETUR-1", "GIV-2.3"])];
  return keys.filter((k) => !stepOf(k)?.off).map((step) => ({ step, target: place }));
}
/** The card's deal and back in his notation ("A2.2 - P6C1 - A2.2"), from the anchor the game deals it from: Bordet's default round. */
export function roundFor(card: string, dealer: string): string {
  const at = nodeCode(ANCHOR_NODE[dealAnchor(dealer, card)]);
  return `${at} - ${nodeCode(card)} - ${at}`;
}
/** The films without a card, in the order a round meets them: the entries, the ways out, rest, the hole card's turn. */
export const OTHER_STEPS: readonly StepKey[] = ["INGANG-2.1", "INGANG-2.2", "INGANG-2.3", "UTGANG", "UTGANG-2.2", "VILA", "HALKORT"];
export const otherWishes = (): FilmWish[] => OTHER_STEPS.filter((k) => stepOf(k) && !stepOf(k)!.off).map((step) => ({ step, target: null }));

/** The bank's edges a film is filed under, as nodes: a deal tur och retur gives anchor → card → anchor. */
function nodesOf(step: StepDef, target: string | null, shape: Shape | null): string[] {
  const from = ANCHOR_NODE[step.from], to = ANCHOR_NODE[step.to ?? step.from];
  if (step.edge === "IDLE>REVEAL(D.C2)") return ["IDLE", "REVEAL(D.C2)", "IDLE"];
  if (step.card && target) {
    if (step.start === "LAND") return [target, to];
    return shape === "ROUND_TRIP" ? [from, target, from] : [from, target];
  }
  return [from, to];
}
/** "A2.1 → P4C1", "P4C1 → A2.1", "A1 → A2.1": a film in his notation (a deal is bara dit unless it is said to go tur och retur). */
export const wishLine = (step: StepDef, target: string | null, shape: Shape | null): string => nodesOf(step, target, shape).map(nodeCode).join(" → ");

/**
 * A deliberate exception on an opened row: what Jakob chose himself against the step's recipe (the model, its length, takes,
 * the text's style, tur och retur, another reference film or none, the hand, the side, the turn, the trial card scale) and
 * his own addition. Only what is chosen is sent; everything else is the recipe's, which the store fills in.
 */
export type RowChoice = Partial<{ model: string; duration: number; takes: number; style: TextStyle; shape: Shape; reference: string | null; hand: HandChoice; side: Side; cardScale: number; extra: string; /** A deal bara dit: an A3 candidate of the seat as its last picture (the exception "med kandidaten som sista bild"). */ end: string }>;

type EntryLike = { id: string; role: string; state?: string; node?: string; card?: string; hand?: string; served: string | null; name?: string; frame?: number; fps?: number | null };

/**
 * What the store makes of a film on the list, resolved the same way before a draft exists (tools/order-store.ts create, from
 * the same pure functions): the step's one recipe, and over it only his deliberate exceptions. `why`: why no draft can be
 * made (no method yet, a seat without an end picture, a reference film the recipe waits for), else null.
 */
export type Line = {
  recipe: Recipe | null;
  model: ModelDef | null;
  seconds: number | null;
  takes: number;
  style: TextStyle;
  /** A deal's shape; every other film is one way. */
  shape: Shape | null;
  /** The turn the draft gets: the recipe's (no choice); null: what Placering says for the card (the store takes it). */
  flipAxis: FlipAxis | null;
  hands: { hand: "LH" | "RH"; pass: boolean };
  side: Side;
  reference: RefCandidate | null;
  /** The recipe wants a reference film (and he has not said otherwise). */
  wanted: boolean;
  /** Where a deal bara dit ends: the seat's own end picture (its A3 for the laying hand, else the cut frame), or the A3 candidate he named; null where the seat has none. */
  end: SeatEnd<EntryLike> | null;
  /** The seat's A3 candidates for the laying hand: what the exception "med kandidaten som sista bild" can name. */
  endChoices: EntryLike[];
  why: string | null;
};
export function lineOf(input: { dealer: string; wish: FilmWish; methods: Pick<MethodRegister, "methods"> | null; bank: BankFacts | null; entries: readonly EntryLike[]; plan: Pick<PlanAnswer, "seats"> | null; choice?: RowChoice }): Line {
  const { dealer, wish, bank, entries } = input, c = input.choice ?? {};
  const def = stepOf(wish.step)!;
  const recipe = recipeFor(input.methods, wish.step, wish.target);
  const model = modelFor(def, c.model ?? recipe?.model ?? null);
  const deal = def.card && def.start !== "LAND";
  const shape: Shape | null = def.kind !== "FILM" ? null : deal ? (c.shape ?? recipe?.shape ?? "ONE_WAY") : "ONE_WAY";
  const seat = wish.target ? (input.plan?.seats[wish.target] ?? null) : null;
  const twoHands = def.grip === "TWO_HANDS";
  // The hand: his exception, else the recipe's (the hand at the shoe all the way), else what Placering says for the card.
  const byLine = recipeHands(def, recipe, seat);
  const hands = twoHands ? { hand: "LH" as const, pass: false } : c.hand ? handsOf(c.hand) : { hand: byLine.hand, pass: byLine.pass };
  const lays: "LH" | "RH" = twoHands || hands.pass ? "RH" : hands.hand;
  const side: Side = c.side ?? seat?.side ?? "FRONT";
  const oneWayDeal = deal && shape === "ONE_WAY";
  const end = oneWayDeal ? seatEndOf(entries, bank, { dealer, step: def, target: wish.target, hand: lays, chosen: c.end ?? null }) : null;
  const endChoices = oneWayDeal ? a3Candidates(entries, wish.target, lays) : [];
  const byRule = c.reference === undefined && !!recipe && recipe.reference !== "ingen" && !!model?.videos;
  const reference = c.reference
    ? ((bank && model ? referenceCandidates(bank, { dealer, step: def, target: wish.target, model }).find((x) => x.take === c.reference && x.fits) : null) ?? null)
    : byRule ? referenceByRule(bank, recipe!.reference, { dealer, step: def, target: wish.target, model, shape, lays }) : null;
  const seconds = def.kind !== "FILM" || !model ? null : (c.duration ?? secondsOf(model, recipe?.seconds ?? null, reference));
  const why =
    !model ? "ingen metod än"
    : def.kind === "FILM" && seconds === null ? "ingen metod än: säg längden"
    : def.start === "LAND" && !landingOf(entries, wish.target) ? "ingen landningsbild gäller för platsen"
    : oneWayDeal && !end ? (c.end ? `${c.end} är ingen A3-kandidat för platsen` : `ingen slutbild för platsen${lays === "RH" ? ` med höger hand vid kortet (${a3Name(wish.target!)})${endChoices.length ? ": en kandidat finns, välj den som undantag" : ""}` : ""}`)
    : byRule && !reference ? `${referenceWaits(recipe!.reference, def)}${lays === "RH" && !twoHands ? ", lagd med höger hand" : ""}`
    : null;
  return { recipe, model, seconds, takes: c.takes ?? recipe?.takes ?? 1, style: c.style ?? recipe?.style ?? "KORT", shape, flipAxis: recipe?.turn ?? null, hands, side, reference, wanted: byRule, end, endChoices, why };
}

export type FilmRow = {
  key: string;
  wish: FilmWish;
  /** His notation, and the step's own name ("Nyp, ett kort till platsen"). */
  line: string;
  label: string;
  method: Pick<Method, "id" | "status" | "reference"> | null;
  /** The method's recipe in one line ("Kling 4 · 1080p · 3 s · bara dit · …"), or "ingen metod än". */
  recipe: string;
  /** What one draft of it costs (all its takes), or null where no price is known or nothing can be sent. */
  cost: number | null;
  /** The body of POST /api/orders for it: the dealer, the step and the card, and his exceptions; null when it cannot be sent. */
  body: NewOrderInput | null;
  /** Why it cannot be made a draft from here (no method, no end picture for the seat, no reference film where the recipe wants one), or null. */
  why: string | null;
  /** The reference film that goes with it, or null; `wanted`: the recipe asks for one. */
  reference: RefCandidate | null;
  wanted: boolean;
  /** He has chosen something against the recipe on the row. */
  chosen: boolean;
  /** Everything the store will resolve for it (what "Det här skickas" shows before the draft exists). */
  resolved: Line;
};

/**
 * The body of POST /api/orders for a film: the line and nothing else. The dealer, the step and the card; the store fills in
 * the recipe (model, length, shape, takes, text, the reference film its rule finds, the seat's end picture). Over that, only
 * his deliberate exceptions, with the keys the store reads them under.
 */
export function orderBody(dealer: string, wish: FilmWish, c: RowChoice = {}): NewOrderInput | null {
  const def = stepOf(wish.step);
  if (!def) return null;
  const out: NewOrderInput = { dealer, step: wish.step, ...(def.card && wish.target ? { target: wish.target } : {}) };
  if (c.model !== undefined) out.model = c.model;
  if (c.duration !== undefined) out.duration = c.duration;
  if (c.takes !== undefined) out.takes = c.takes;
  if (c.style !== undefined) out.style = c.style;
  if (c.shape !== undefined && def.card && def.start !== "LAND") out.shape = c.shape;
  if (c.reference !== undefined) out.reference = c.reference || null;
  if (c.hand !== undefined) Object.assign(out, c.hand === "PASS" ? { hand: "LH", pass: true } : { hand: c.hand, pass: false });
  if (c.side !== undefined) out.side = c.side;
  if (c.cardScale !== undefined && c.cardScale !== 1) out.cardScale = c.cardScale;
  if (c.extra !== undefined) out.extra = c.extra.trim() || null;
  if (c.end && def.card && def.start !== "LAND") out.end = c.end;
  return out;
}

/** What one draft costs at the policy's prices: the model, the length and the takes the store will give it. */
export function lineCost(step: StepDef, line: Pick<Line, "model" | "seconds" | "takes" | "recipe">, policy: Pick<Policy, "prices"> | null): number | null {
  if (!line.model || !policy) return null;
  const params = paramsOf(step, line.model, step.kind === "FILM" ? { duration: line.seconds ?? undefined, resolution: line.recipe?.resolution } : {});
  return costOf({ model: line.model.id, params }, line.takes, policy.prices)?.total ?? null;
}

/** A film of the list with its recipe, what the store will resolve for it, his exceptions, its price and the body to send. */
export function filmRow(dealer: string, wish: FilmWish, methods: Pick<MethodRegister, "methods"> | null, policy: Pick<Policy, "prices"> | null, more: { bank?: BankFacts | null; choice?: RowChoice; entries?: readonly EntryLike[]; plan?: Pick<PlanAnswer, "seats"> | null } = {}): FilmRow {
  const def = stepOf(wish.step)!;
  const method = methodFor(methods, wish.step, wish.target);
  const choice = more.choice ?? {};
  const resolved = lineOf({ dealer, wish, methods, bank: more.bank ?? null, entries: more.entries ?? [], plan: more.plan ?? null, choice });
  return {
    key: wishKey(wish), wish, line: wishLine(def, wish.target, resolved.shape), label: def.label, method: method ? { id: method.id, status: method.status, reference: method.reference } : null,
    recipe: recipeWords(method), cost: resolved.why ? null : lineCost(def, resolved, policy), body: resolved.why ? null : orderBody(dealer, wish, choice), why: resolved.why,
    reference: resolved.reference, wanted: resolved.wanted, chosen: Object.keys(choice).length > 0, resolved,
  };
}

/** "Dockans giv till plats 4", "Pamelas giv till plats 4", "Paows retur från plats 2": a reference film by whose it is and what it shows. */
export function referenceName(c: Pick<RefCandidate, "dealer" | "edge" | "goesTo">, names: Readonly<Record<string, string>>): string {
  const who = c.dealer === "docka" ? "Dockans" : genitive(names[c.dealer] ?? c.dealer);
  const back = !/^(READY(?:-[A-Z])?|DRAWN|IDLE)>/.test(c.edge);
  return `${who} ${back ? "retur från" : "giv till"} ${seatWords(c.goesTo)}`;
}

/** "3 filmer · 640 krediter" (and how many have no price), for the foot of the list. */
export function sumWords(rows: readonly Pick<FilmRow, "cost">[]): string {
  const priced = rows.filter((r) => r.cost !== null);
  const total = priced.reduce((s, r) => s + (r.cost ?? 0), 0);
  const films = `${rows.length} ${rows.length === 1 ? "film" : "filmer"}`;
  if (!rows.length) return "Inga filmer";
  return `${films} · ${credits(total)} krediter${priced.length < rows.length ? ` · ${rows.length - priced.length} utan pris` : ""}`;
}

/**
 * Bordet's Beställ with the queue shown and Beställ's own words kept, for Beställ's old address (app/bestall/page.tsx):
 * /bestall/?order=x leads to /bordet/?lage=bestall&ko=1&order=x.
 */
export function bordetOrderAddress(params: { forEach(fn: (value: string, key: string) => void): void }): string {
  const p = new URLSearchParams({ lage: "bestall", ko: "1" });
  params.forEach((value, key) => {
    if (key !== "lage" && key !== "ko") p.append(key, value);
  });
  return `/bordet/?${p.toString()}`;
}

/** Bordet's Kortplan at a card ("/bordet/?plats=p3c2"), for "Flytta kortets plats" in Ny beställning and Placering's old address. */
export function kortplanHref(place: string): string {
  const p = new URLSearchParams();
  const code = /^(P[1-7]|D)\.C([12])$/.exec(place);
  if (code) p.set("plats", `${code[1]}c${code[2]}`.toLowerCase());
  else if (place === "shoe") p.set("plats", "sko");
  const q = p.toString();
  return `/bordet/${q ? `?${q}` : ""}`;
}

/**
 * Granska filmen: a film's last order (of the same dealer, step and card, not set aside) whose takes are shown beside
 * everything that was sent for it: the newest that brought a film (`delivered`), else the newest; null when the film has
 * never been ordered.
 */
export function lastOrder<A extends { order: { id: string; dealer: string; status: string; created: string; step: { key: string }; motion?: { target: string | null } | null } }>(orders: readonly A[], dealer: string, wish: FilmWish, delivered: (id: string) => boolean = () => false): A | null {
  const mine = [...orders].filter((a) => a.order.dealer === dealer && a.order.step.key === wish.step && (a.order.motion?.target ?? null) === wish.target && a.order.status !== "AVBRUTEN").sort((a, b) => b.order.created.localeCompare(a.order.created));
  return mine.find((a) => delivered(a.order.id)) ?? mine[0] ?? null;
}

/**
 * The words of the scene's address (the view Scen's before 2026-11-17, now Bordet's Scen, Råfilm and Efterarbete): the round
 * (runda, kant, tagning, vy), the look (forval and every key of the scene, lib/scene-keys.ts) and the lab's own (robot).
 * None of them is one of Bordet's own words (lage, plats, ko, order, ny, …).
 */
export const sceneWords: ReadonlySet<string> = new Set(["runda", "kant", "tagning", "vy", "robot", "forval", ...SCENE_KEYS.map((s) => s.key as string)]);

/**
 * Bordet's scene with the same thing on screen, for an address of the view Scen (/, /scen/): the round and the look kept,
 * vy=platt as the mode Råfilm, anything else as the mode Scen; with no round and no look, Bordet as it opens (Kortplan).
 * /?runda=A2.1%20-%20P4C1&vy=platt leads to /bordet/?lage=rafilm&runda=A2.1+-+P4C1.
 */
export function bordetSceneAddress(params: { forEach(fn: (value: string, key: string) => void): void; get(name: string): string | null }): string {
  const rest: [string, string][] = [];
  let scene = false;
  params.forEach((value, key) => {
    if (key === "vy" || key === "lage") return;
    if (sceneWords.has(key) && key !== "robot") scene = true;
    rest.push([key, value]);
  });
  const platt = params.get("vy") === "platt";
  const p = new URLSearchParams(scene || platt ? [["lage", platt ? "rafilm" : "scen"], ...rest] : rest);
  const q = p.toString();
  return `/bordet/${q ? `?${q}` : ""}`;
}
