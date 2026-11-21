// Bordet (/bordet/): the lab's one view of the table, where a card's place, its way there and the films to order are set in
// one frame (Jakob 2026-11-17: "Scen och placering bör ha samma typ av vy, och på högersidan ska man kunna ändra och laborera
// med detta. Detta ska också vara underlaget för beställning av nya filmer."). Pure helpers for it: the stage's camera (fit,
// zoom towards the pointer, pan, the close-up on a card), the one card shape every card on the stage is drawn with, step 2's
// one line of what the recipe does with the motion (from the anchor the plan's handbyte chooses), and the list of films to
// order (step 3): a card's three films from that anchor, each in his notation, with its step's one recipe
// (data/order-methods.json), what the store will resolve for it (lineOf, from the same pure functions the store uses), its five
// marks (first picture, last picture, reference film, text, price), its text and price as the order freezes them, and the
// choices sent for a server preview: the dealer, the step and the card, and over them only his deliberate exceptions.
// Nothing here composes an order: the store does, as for every draft. No DOM, no network; tests in
// studio/tests/bordet-line.test.ts and studio/tests/line-same.test.ts.
import type { Graph } from "../../src/clip-graph.ts";
import {
  ANCHOR_NODE, ANCHOR_ROLE, LANDS_LABEL, a3Candidates, a3Name, costOf, credits, defaultFlip, genitive, handsOf, landingOf, modelFor, paramsOf, referenceCandidates, seatEndOf, seatWords, stepOf,
  type Anchor, type BankFacts, type DealerLook, type FlipAxis, type HandChoice, type ModelDef, type PlanAnswer, type Policy, type RefCandidate, type SeatEnd, type Shape, type StepDef, type StepKey, type TextStyle,
} from "../../src/order-model.ts";
import { NOT_YET, TWO_HAND_TURN, methodFor, recipeFor, recipeHands, recipeWords, referenceByRule, secondsOf, type Method, type MethodRegister, type Recipe, type ReferenceRule } from "../../src/order-methods.ts";
import { TEMPLATE_VERSION, orderPrompt } from "../../src/order-prompts.ts";
import type { Intent, Place, Side } from "../../src/placement-model.ts";
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

// ── The anchor a card's films go from ──────────────────────────────────────
/**
 * The anchor a card's films go from and back to (Jakob 2026-11-21, his saved plan: "då ska den där beställningen med släpande
 * hand göras från A2.3"): with handbyte in the plan A2.3, where the hand at the shoe strokes the card out and the other hand
 * turns it and lays it; without it the anchor the game deals the card from (dealAnchor: A2.1, or A2.2 where the game's own
 * map says so). The plan's grip chooses nothing (the review of the methods, 2026-11-21: the anchor decides the grip).
 */
export function wishAnchor(dealer: string, place: string, planned: object | null): Exclude<Anchor, "1"> {
  return (planned as { pass?: boolean } | null)?.pass ? "2.3" : dealAnchor(dealer, place);
}

/**
 * Whether the dealer's bank has a film each way between an anchor and a card, so that Scen can play the round from it. The
 * bank files a film from a pose at the shoe other than A2.1 (A2.2, A2.3) under A2.1's step as a take with that pose
 * (src/clip-graph.ts, HUB_VARIANT): such a take that is not rejected counts.
 */
export function hasRound(graph: Pick<Graph, "edge" | "experiments"> | null, card: string, anchor: Anchor): boolean {
  if (!graph) return false;
  const node = ANCHOR_NODE[anchor], variant = /^READY-/.test(node), base = variant ? "READY" : node;
  const way = (id: string) => {
    const e = graph.edge[id] ?? graph.experiments.find((x) => x.id === id);
    if (!e) return false;
    return variant ? e.takes.some((t) => t.hub === node && t.decision !== "REJECTED") : !!e.main;
  };
  return way(`${base}>${card}`) && way(`${card}>${base}`);
}

/**
 * The card's deal and back in his notation ("A2.2 - A3P6C1 - A2.2"): Bordet's default round, from the anchor the game deals
 * it from. `from`: another anchor (A2.3 for a card with handbyte), which the view passes only where the bank has that round
 * (hasRound); the game keeps its own until then.
 */
export function roundFor(card: string, dealer: string, from: Exclude<Anchor, "1"> | null = null): string {
  const at = nodeCode(ANCHOR_NODE[from ?? dealAnchor(dealer, card)]);
  return `${at} - ${nodeCode(card)} - ${at}`;
}

/**
 * One line under step 3 where the card's films go from another anchor than the one the game deals it from today: "Spelet ger
 * plats 4 från A2.1 i dag; filmen spelas när rundan namnger den." Null where they are the same.
 */
export function gameLine(dealer: string, place: Place, planned: object | null): string | null {
  if (place === SHOE || !planned) return null;
  const game = dealAnchor(dealer, place);
  return wishAnchor(dealer, place, planned) === game ? null : `Spelet ger ${seatWords(place)} från ${nodeCode(ANCHOR_NODE[game])} i dag; filmen spelas när rundan namnger den.`;
}

// ── Step 2: what steers the motion ──────────────────────────────────────────
/**
 * Step 2's line when folded, naming the anchor step 3 offers: "A2.3 · handbyte · Stängt → öppet" (never the plan's grip:
 * with handbyte the card goes from A2.3, Jakob 2026-11-21).
 */
export function stepTwoSummary(dealer: string, place: Place, intent: Pick<Intent, "pass" | "endSide"> | null): string {
  if (place === SHOE || !intent) return "Välj ett kort";
  return `${nodeCode(ANCHOR_NODE[wishAnchor(dealer, place, intent)])} · ${intent.pass ? "handbyte" : "utan handbyte"} · ${LANDS_LABEL[intent.endSide]}`;
}

const HAND_WORD = { LH: "vänster hand", RH: "höger hand" } as const;
const TURN_WORDS: Record<FlipAxis, string> = { AT_PLACE: "vänder det vid platsen", FREE: "vänder det på vägen", LONG_EDGE: "rullar det kring långsidan på vägen" };
const FOLLOWS: Record<ReferenceRule, string | null> = {
  ingen: null,
  renderad: "rörelsen följer dockfilmen",
  "renderad-eller-samma-plats": "rörelsen följer dockfilmen, annars en godkänd giv",
  "samma-plats-rakt-godkänd": "rörelsen följer en godkänd giv till platsen",
};
/**
 * What the recipe of the card's deal does with the motion, in one line (Bordet's step 2): the anchor, the hands and the turn the
 * text says, and the reference film the movement follows. "A2.3 · vänster hand drar ut, höger hand vänder kortet och lägger
 * det · rörelsen följer dockfilmen". The plan's grip, where and how it turns and the hand at the release are not choices: the
 * anchor and the recipe decide them, and the reference film the axis (the review of the methods, 2026-11-21; pilot 02 turned
 * the card as its reference did). Where the recipe's turn is the plan's (the dealer's own cards), the plan's turn is said.
 * Null for the shoe or a place without a card.
 */
export function motionLine(dealer: string, place: Place, intent: Pick<Intent, "pass" | "endSide" | "turnAt" | "flipAxis"> | null, methods: Pick<MethodRegister, "methods"> | null): string | null {
  if (place === SHOE || !intent) return null;
  const from = wishAnchor(dealer, place, intent), step = stepOf(`GIV-${from}`)!, code = nodeCode(ANCHOR_NODE[from]);
  const recipe = recipeFor(methods, step.key, place);
  if (!recipe) return `${code} · ${NOT_YET}`;
  const open = intent.endSide === "FRONT";
  let how: string;
  if (step.grip === "TWO_HANDS") how = `vänster hand drar ut, ${open ? TWO_HAND_TURN : "höger hand lägger det stängt"}`;
  else {
    const hand = recipeHands(step, recipe, null).hand, takes = step.grip === "DRAG" ? "släpar ut kortet" : "nyper kortet";
    const axis = recipe.turn ?? defaultFlip(step.key, intent.turnAt, intent.flipAxis);
    how = `${HAND_WORD[hand]} ${takes} och ${open ? TURN_WORDS[axis] : "lägger det stängt"}`;
  }
  return [code, how, FOLLOWS[recipe.reference]].filter(Boolean).join(" · ");
}

// ── Step 3: the films to order ──────────────────────────────────────────────
/** One film on the list: a step, and the card it is about (null for a step without one). */
export type FilmWish = { step: StepKey; target: string | null };
export const wishKey = (w: FilmWish) => `${w.step}@${w.target ?? ""}`;

/**
 * The films a card can have, three, all from one anchor (wishAnchor): the deal, the return to the same anchor and the return to
 * rest. With handbyte: A2.3 → A3P4C2, A3P4C2 → A2.3, A3P4C2 → A1; without it, from the anchor the game deals the card from. A
 * film that cannot be ordered yet (no recipe, or turned off as the return to 2.3 is) stays on the list, and its marks say why.
 * The shoe and a place without a card in the plan (`planned` null) have none.
 */
export function cardWishes(place: Place, planned: object | null, dealer: string): FilmWish[] {
  if (place === SHOE || !planned) return [];
  const from = wishAnchor(dealer, place, planned);
  return ([`GIV-${from}`, `RETUR-${from}`, "RETUR-1"] as StepKey[]).filter((k) => stepOf(k)).map((step) => ({ step, target: place }));
}
/** The films without a card, in the order a round meets them: the entries, the ways out, rest, the hole card's turn. */
export const OTHER_STEPS: readonly StepKey[] = ["INGANG-2.1", "INGANG-2.2", "INGANG-2.3", "UTGANG", "UTGANG-2.2", "UTGANG-2.3", "VILA", "HALKORT"];
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
/** "A2.1 → A3P4C1", "A3P4C1 → A2.1", "A1 → A2.1": a film in his notation (a deal is bara dit unless it is said to go tur och retur). */
export const wishLine = (step: StepDef, target: string | null, shape: Shape | null): string => nodesOf(step, target, shape).map(nodeCode).join(" → ");

/**
 * A deliberate exception on an opened row: what Jakob chose himself against the step's recipe (the model, its length, takes,
 * the text's style, tur och retur, another reference film or none, the hand, the side, the trial card scale) and his own
 * addition. Only what is chosen is sent; everything else is the recipe's, which the store fills in.
 */
export type RowChoice = Partial<{ model: string; duration: number; takes: number; style: TextStyle; shape: Shape; reference: string | null; hand: HandChoice; side: Side; cardScale: number; extra: string; /** A deal bara dit: an A3 candidate of the seat as its last picture (the exception "med kandidaten som sista bild"). */ end: string }>;

type EntryLike = { id: string; role: string; state?: string; node?: string; card?: string; hand?: string; served: string | null; name?: string; frame?: number; fps?: number | null };

/** The five things a film needs before it can be ordered, in the order a row shows them (Jakob 2026-11-21). */
export const MARK_NAMES = ["Första bild", "Slutbild", "Referensfilm", "Text", "Pris"] as const;
export type MarkName = (typeof MARK_NAMES)[number];
/** One of a row's five marks: ready or not, and its few words ("A2.3", "A3P4C2 saknas (höger hand)", "dockan", "128 ord", "64 krediter"). */
export type Mark = { name: MarkName; ready: boolean; words: string };

/**
 * What the store makes of a film on the list, resolved the same way before a draft exists (tools/order-store.ts prepare, from
 * the same pure functions): the step's one recipe, and over it only his deliberate exceptions. `marks`: the five things a
 * film needs, each ready or not; `why`: the first that is missing, in the order the store asks for them (the first picture,
 * the recipe, the last picture, the reference film, the price), else null. A row can be ordered only when all five are ready.
 */
export type Line = {
  recipe: Recipe | null;
  model: ModelDef | null;
  seconds: number | null;
  takes: number;
  style: TextStyle;
  /** A deal's shape; every other film is one way. */
  shape: Shape | null;
  /** The turn the draft gets: the recipe's; null where the recipe takes the plan's (the dealer's own cards). */
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
  marks: Mark[];
  /** The text the store writes for it, word for word; null where it is written only with the draft (a picture drawn or read off a film's frame, a still) or cannot be written yet. */
  text: string | null;
  /** What one draft costs at the policy's prices (all its takes), or null where no price is known. */
  cost: number | null;
  why: string | null;
};

const ready = (name: MarkName, words: string): Mark => ({ name, ready: true, words });
const missing = (name: MarkName, words: string): Mark => ({ name, ready: false, words });
const anchorCode = (at: Anchor) => nodeCode(ANCHOR_NODE[at]);
const wordCount = (text: string) => text.trim().split(/\s+/).length;

export function lineOf(input: {
  dealer: string; wish: FilmWish; methods: Pick<MethodRegister, "methods"> | null; bank: BankFacts | null; entries: readonly EntryLike[]; plan: Pick<PlanAnswer, "seats"> | null; choice?: RowChoice;
  /** The prices (data/order-policy.json); without them the row has no price. */
  policy?: Pick<Policy, "prices"> | null;
  /** The dealers' looks (GET /api/orders), which the text is written with; without them the row has no text. */
  dealers?: readonly Pick<DealerLook, "id" | "name" | "look">[];
  /** The landing pictures that show the blue side's marks (GET /api/orders, marks): what the text says of the card. */
  marks?: Readonly<Record<string, boolean>>;
}): Line {
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
    ? ((bank && model ? referenceCandidates(bank, { dealer, step: def, target: wish.target, model }).find((x) => (x.take === c.reference || x.film === c.reference) && x.fits) : null) ?? null)
    : byRule ? referenceByRule(bank, recipe!.reference, { dealer, step: def, target: wish.target, model, shape, lays }) : null;
  const seconds = def.kind !== "FILM" || !model ? null : (c.duration ?? secondsOf(model, recipe?.seconds ?? null, reference));
  // A step that is off (the return to 2.3 until its trial), or without a recipe or a model he chose, is not ordered from here.
  const writable = !!model && !def.off && (def.kind !== "FILM" || seconds !== null);

  // The anchor a picture is, where it holds (role, node, gäller, no card), as the store copies it (holding).
  const holds = (at: Anchor) => entries.find((e) => e.role === ANCHOR_ROLE[at] && e.state === "gäller" && !e.card && e.node === ANCHOR_NODE[at] && e.served !== null) ?? null;
  const anchorMark = (name: MarkName, at: Anchor, drawn = false) => (holds(at) ? ready(name, `${anchorCode(at)}${drawn ? " med kortet ritat" : ""}`) : missing(name, `${anchorCode(at)} saknas`));
  // A return starts on the seat's landing picture for the hand that laid the card (with handbyte the right hand's).
  const startLanding = def.start === "LAND" ? landingOf(entries, wish.target, lays) : null;
  const first = def.start === "LAND"
    ? (startLanding ? ready("Första bild", a3Name(wish.target!)) : missing("Första bild", `${a3Name(wish.target!)} saknas (${HAND_WORD[lays]})`))
    : anchorMark("Första bild", def.from);
  const last = def.kind !== "FILM" ? ready("Slutbild", "ingen, en bild")
    : oneWayDeal ? (end ? ready("Slutbild", end.kind === "LANDNING" ? `${a3Name(wish.target!)}${end.candidate ? " (kandidat)" : ""}` : `snittruta ${end.cut.frame} ur ${end.cut.clip}`) : missing("Slutbild", c.end ? `${c.end} är ingen kandidat` : `${a3Name(wish.target!)} saknas (${HAND_WORD[lays]})`))
    : deal || def.cards?.length ? anchorMark("Slutbild", def.from, true)
    : anchorMark("Slutbild", def.to ?? def.from);
  const referenceMark = !writable && !model ? missing("Referensfilm", NOT_YET)
    : reference ? ready("Referensfilm", reference.kind === "RENDERED" || reference.dealer === "docka" ? "dockan" : "godkänd giv")
    : c.reference || byRule ? missing("Referensfilm", def.card ? "ingen referensfilm till platsen" : "ingen referensfilm")
    : ready("Referensfilm", "ingen");

  // The text, as the store writes it (textOf): the motion it stores, the plan's point for the card where the last picture
  // draws none, and the marks where the picture that shows the open card shows them.
  const look = input.dealers?.find((d) => d.id === dealer) ?? null;
  const shows = def.start === "LAND" ? startLanding : end?.kind === "LANDNING" ? end.entry : null;
  const drawnOrCut = (deal && shape === "ROUND_TRIP") || !!def.cards?.length || end?.kind === "SNITTRUTA";
  let text: string | null = null;
  if (writable && look && model && def.kind === "FILM" && first.ready && last.ready && !drawnOrCut && (!def.card || seat)) {
    const turn = wish.step === "GIV-2.3" ? side === "FRONT" : def.start !== "LAND" && !!seat && side !== seat.startSide;
    const style = c.style ?? recipe?.style ?? "KORT";
    const axis: FlipAxis = wish.step === "GIV-2.3" && style === "KORT" && turn ? "FREE" : (recipe?.turn ?? defaultFlip(wish.step, seat?.turnAt, seat?.flipAxis));
    const held = twoHands ? { hand: "LH" as const, pass: true } : hands;
    const mall = recipe?.template ?? TEMPLATE_VERSION;
    const faceMark = !!shows && side === "FRONT" && !!input.marks?.[shows.id] && (def.start === "LAND" || wish.step.startsWith("GIV-"));
    text = orderPrompt({
      step: { key: wish.step, shape },
      motion: def.card && seat ? { grip: def.grip ?? "PINCH", hand: held.hand, pass: held.pass, turn, flipAxis: turn ? axis : null, side, target: wish.target } : null,
      generation: { model: model.id }, pictures: [],
      prompt: { extra: (c.extra === undefined ? recipe?.extra : c.extra)?.trim() || null, style, template: mall !== TEMPLATE_VERSION ? `@${mall}` : "", faceMark },
      reference: { status: reference ? "FINNS" : "INGEN" },
    }, look, seat ? { x: seat.centre[0], y: seat.centre[1] } : null).text;
  }
  const takes = c.takes ?? recipe?.takes ?? 1;
  const cost = writable ? lineCost(def, { model, seconds, takes, recipe }, input.policy ?? null) : null;
  const textMark = writable ? ready("Text", text ? `${wordCount(text)} ord` : "skrivs med utkastet") : missing("Text", NOT_YET);
  const priceMark = cost !== null ? ready("Pris", `${credits(cost)} krediter`) : missing("Pris", NOT_YET);
  const marks = [first, last, referenceMark, textMark, priceMark];
  const why = [first, textMark, last, referenceMark, priceMark].find((m) => !m.ready)?.words ?? null;
  return { recipe, model, seconds, takes, style: c.style ?? recipe?.style ?? "KORT", shape, flipAxis: recipe?.turn ?? null, hands, side, reference, wanted: byRule, end, endChoices, marks, text, cost, why };
}

export type FilmRow = {
  key: string;
  wish: FilmWish;
  /** His notation, and the step's own name ("Nyp, ett kort till platsen"). */
  line: string;
  label: string;
  method: Pick<Method, "id" | "status" | "reference"> | null;
  /** The recipe in one line with the model and length the order gets ("Kling 4 · 1080p · 3 s · bara given, slutar på A3P4C2 · …"), or "kan inte beställas än" (no recipe, or a step that is off). */
  recipe: string;
  /** The five marks in their order: Första bild, Slutbild, Referensfilm, Text, Pris. */
  marks: Mark[];
  /** All five marks are ready: the row can be sent. */
  orderable: boolean;
  /** The text the order gets, word for word, or null (Line.text). */
  text: string | null;
  /** What one draft of it costs (all its takes), or null where it cannot be ordered. */
  cost: number | null;
  /** The body of POST /api/orders for it: the dealer, the step and the card, and his exceptions; null when it cannot be sent. */
  body: NewOrderInput | null;
  /** The first of the five marks that is missing (in the order the store asks for them), or null. */
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

/**
 * A film of the list with its recipe, what the store will resolve for it, its five marks, its text and price as the order
 * freezes them, his exceptions and the body to send. `more.dealers` and `more.marks` (GET /api/orders) give the text.
 */
export function filmRow(dealer: string, wish: FilmWish, methods: Pick<MethodRegister, "methods"> | null, policy: Pick<Policy, "prices"> | null, more: { bank?: BankFacts | null; choice?: RowChoice; entries?: readonly EntryLike[]; plan?: Pick<PlanAnswer, "seats"> | null; dealers?: readonly Pick<DealerLook, "id" | "name" | "look">[]; marks?: Readonly<Record<string, boolean>> } = {}): FilmRow {
  const def = stepOf(wish.step)!;
  const method = methodFor(methods, wish.step, wish.target);
  const choice = more.choice ?? {};
  const resolved = lineOf({ dealer, wish, methods, bank: more.bank ?? null, entries: more.entries ?? [], plan: more.plan ?? null, choice, policy, dealers: more.dealers, marks: more.marks });
  const orderable = resolved.marks.every((m) => m.ready);
  return {
    key: wishKey(wish), wish, line: wishLine(def, wish.target, resolved.shape), label: def.label, method: method ? { id: method.id, status: method.status, reference: method.reference } : null,
    // A step that is off (the return to 2.3 until its trial) shows no recipe: nothing of it can be ordered from here.
    recipe: def.off ? NOT_YET : recipeWords(method, wish.target, { model: resolved.model?.id ?? null, seconds: resolved.seconds }), marks: resolved.marks, orderable, text: resolved.text,
    cost: orderable ? resolved.cost : null, body: orderable ? orderBody(dealer, wish, choice) : null, why: resolved.why,
    reference: resolved.reference, wanted: resolved.wanted, chosen: Object.keys(choice).length > 0, resolved,
  };
}

/** "Dockans giv till plats 4", "Pamelas giv till plats 4", "Paows retur från plats 2": a reference film by whose it is and what it shows. */
export function referenceName(c: Pick<RefCandidate, "dealer" | "edge" | "goesTo">, names: Readonly<Record<string, string>>): string {
  const who = c.dealer === "docka" ? "Dockans" : genitive(names[c.dealer] ?? c.dealer);
  const back = !/^(READY(?:-[A-Z])?|DRAWN|IDLE)>/.test(c.edge);
  return `${who} ${back ? "retur från" : "giv till"} ${seatWords(c.goesTo)}`;
}

/** "3 filmer · 1 kan beställas · 64 krediter" (the price of those that can), for the foot of the list and step 3's line. */
export function sumWords(rows: readonly Pick<FilmRow, "cost" | "orderable">[]): string {
  if (!rows.length) return "Inga filmer";
  const can = rows.filter((r) => r.orderable), total = can.reduce((s, r) => s + (r.cost ?? 0), 0);
  const films = `${rows.length} ${rows.length === 1 ? "film" : "filmer"}`;
  return can.length ? `${films} · ${can.length} kan beställas · ${credits(total)} krediter` : `${films} · ${rows.length === 1 ? "kan inte" : "ingen kan"} beställas än`;
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
