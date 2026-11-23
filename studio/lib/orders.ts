// Beställ (/bordet/?lage=bestall, Bordet's queue; the old /bestall/ leads there): the view's calls to the lab server (tools/order-routes.ts) and the pure words and rows it shows.
// The order's shape, the exact call per take and the cost come from ../../src/order-model.ts (built in, never copied). The
// text and its marks come from ../../src/order-prompts.ts, the same function the store writes a draft's text with. A new
// order can be asked for by address (presetOf); whose each picture is is said in words
// (ownerWords); what an order makes in Jakob's notation, "A2.2 → A3P3C2 → A2.2", with one plain sentence (routeOf).
// In the online copy nothing is asked for or written. Tests: tools/order-routes.test.ts (the calls) and studio/tests/line-same.test.ts.
import { ApiError, asApiError } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot } from "./mode.ts";
import { nodeCode } from "./names.ts";
import {
  ANCHOR_NODE, ANCHOR_ROLE, FLIP_LABEL, HAND_LABEL, mandateWords, LANDS_LABEL, STYLE_LABEL, genitive, MODELS, SEAT_TARGETS, SHOWN_LABEL, credits, cutIntoOf, edgeOf, handChoiceOf, seatList, seatWords, stepOf, styleOf, summaryOf, waitWords,
  type Anchor, type FlipAxis, type HandChoice, type Order, type OrderAnswer, type OrdersAnswer, type Owner, type Picture, type PlanAnswer, type Shape, type Shown, type StepDef, type StepKey, type TextStyle,
} from "../../src/order-model.ts";
import { orderPrompt, wordCount, type Choice, type Part } from "../../src/order-prompts.ts";
import { dealPose } from "../../src/game-director.ts";

export type { Order, OrderAnswer, OrdersAnswer, Picture, Shown, FlipAxis, StepKey, HandChoice, Owner, Part, Choice, Shape, TextStyle };

// ── Calls ───────────────────────────────────────────────────────────────────
const kind = (status: number) => (status === 409 ? "conflict" : status === 404 ? "missing" : status === 428 ? "precondition" : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid");

async function call<T>(path: string, what: string, init?: RequestInit): Promise<T> {
  // The online copy neither reads nor writes orders: refused before anything leaves the page.
  if (isSnapshot) throw new ApiError("Beställ finns bara i labbet.", 403, "refused");
  let response: Response;
  try {
    response = await fetch(labUrl(path), { cache: "no-store", ...init });
  } catch {
    throw new ApiError("Labbet svarar inte. Starta det med START.cmd.", 0, "network");
  }
  if (!response.ok) {
    let said = "";
    try {
      said = String((await response.json())?.error ?? "");
    } catch {}
    if (response.status === 404 && !said) throw new ApiError("Labbet känner inte vyn Beställ än: labbservern behöver startas om.", 404, "missing");
    throw new ApiError(said || `${what} gick inte (${response.status}).`, response.status, kind(response.status));
  }
  return (await response.json()) as T;
}
const send = (method: string, body: unknown, revision?: string): RequestInit => ({
  method,
  headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(revision ? { "if-match": revision } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const getOrders = () => call<OrdersAnswer>("api/orders", "Beställningarna");
/** One seat of a new deal with its own choices ("Alla sju" sends seven). */
export type SeatInput = { target: string; hand?: "LH" | "RH"; pass?: boolean; side?: "FRONT" | "BACK" };
export type NewOrderInput = {
  dealer: string;
  step: StepKey;
  target?: string | null;
  hand?: "LH" | "RH";
  pass?: boolean;
  side?: "FRONT" | "BACK";
  seats?: SeatInput[];
  /** Sent only when it is not the recipe's model (an exception). */
  model?: string;
  duration?: number;
  takes?: number;
  extra?: string | null;
  base?: string;
  /**
   * Exceptions from the step's recipe (the store fills in whatever is not said): the text's style; tur och retur for a deal;
   * a reference film named outright, or null for none (absent: the one the recipe's rule finds).
   */
  style?: TextStyle;
  shape?: Shape;
  reference?: string | null;
  /** The card's size on a round trip's last picture as a factor of the plan's (a trial); sent only when not 1. */
  cardScale?: number;
  /** A deal bara dit: an A3 candidate of the seat as its last picture, a named exception, or null for none ("utan slutbild") (tools/order-store.ts NewOrder.end). */
  end?: string | null;
};
export type OrderPreviewInput = NewOrderInput | readonly NewOrderInput[];
export type OrderPreview = import("../../tools/order-store.ts").OrderPreview;
export type CreatedOrders = OrderAnswer & { made: string[] };
export const previewOrder = (input: OrderPreviewInput) => call<OrderPreview>("api/orders/preview", "Förhandsvisningen", send("POST", input));
/** The first draft and the ids of all drafts, in the same order as the preview. */
export const createOrder = (input: OrderPreviewInput, revision: string) => call<CreatedOrders>("api/orders", "Utkastet", send("POST", input, revision));
/** An uncertain save must reuse its frozen revision: the server may already have created the drafts. */
export function orderSaveFailure(cause: unknown): { message: string; retrySave: boolean } {
  const error = asApiError(cause, "Utkastet");
  const refusedBeforeSaving = [400, 403, 404, 409, 413, 415, 422, 428].includes(error.status);
  return {message: error.message, retrySave: !refusedBeforeSaving};
}
export type OrderChange = { title?: string; takes?: number; extra?: string | null; duration?: number; hand?: "LH" | "RH"; pass?: boolean; side?: "FRONT" | "BACK" };
export const changeOrder = (id: string, change: OrderChange, revision: string) => call<OrderAnswer>(`api/orders/${id}`, "Ändringen", send("PUT", change, revision));
export const approveOrder = (id: string, revision: string) => call<OrderAnswer>(`api/orders/${id}/approve`, "Godkännandet", send("POST", undefined, revision));
/** The draft made from the doll's saved movement to a card (POST /api/orders/docka, tools/doll-order.ts): about a minute. */
export type DollOrdered = { id: string; title: string; place: string; film: string; standard: string | null; cost: { total: number } };
export const orderDoll = (dealer: string, place: string) => call<DollOrdered>("api/orders/docka", "Dockans beställning", send("POST", { dealer, place }));
export const refreshOrder =(id: string, revision: string) => call<OrderAnswer>(`api/orders/${id}/refresh`, "Bilderna", send("POST", undefined, revision));

// ── The production list (tools/produce.ts, GET /api/production) ──
export type { Production, ProductionRow, RowState, Anchor as ProductionAnchor } from "../../tools/produce.ts";
type ProductionAnswer = { list: import("../../tools/produce.ts").Production; problems: string[] };
export const getProduction = (dealer: string) => call<ProductionAnswer>(`api/production?dealer=${encodeURIComponent(dealer)}`, "Produktionslistan");

/** A state of the production list as a chip: colour AND sign, and the short word the list's row shows. */
export const PRODUCTION_CHIP: Record<import("../../tools/produce.ts").RowState, { tone: Tone; sign: string; word: string }> = {
  KLAR: { tone: "ok", sign: "✓", word: "klar" },
  DOM: { tone: "wait", sign: "○", word: "väntar på din dom" },
  BESTÄLLD: { tone: "variant", sign: "↑", word: "beställd" },
  UTKAST: { tone: "neutral", sign: "✎", word: "utkast" },
  MED_GIVEN: { tone: "neutral", sign: "↳", word: "kommer med given" },
  KAN: { tone: "brass", sign: "●", word: "kan beställas nu" },
  PROV: { tone: "remark", sign: "◐", word: "kan provas" },
  VÄNTAR: { tone: "wait", sign: "…", word: "väntar på bild" },
  INGEN_METOD: { tone: "bad", sign: "?", word: "inget sätt prövat än" },
  INTE_BYGGD: { tone: "neutral", sign: "–", word: "inte byggd" },
};
/** "5 av 33 klara · 5 av 21 krävs för en runda": the list's count in one line. */
export function productionCount(counts: Pick<import("../../tools/produce.ts").Production["counts"], "done" | "total" | "neededDone" | "needed">): string {
  return `${counts.done} av ${counts.total} klara · ${counts.neededDone} av ${counts.needed} som en runda kräver`;
}

/**
 * Whether anything can be approved now, whatever it costs, in one line for Bordet's step 3 and the preview (the day's cap in
 * data/order-policy.json is set so high that "0 av 1 000 000" says nothing; the mandate is what limits). Closed: the
 * policy unread or turned off, the mandate missing, not begun or run out, its credits used, the day's cap reached, or the
 * balance at its floor. Open: what is left of the mandate (src/order-model.ts mandateWords).
 */
/** What the line says when the lab's answer has no figure for the mandate (an older lab server). */
export const MANDATE_UNKNOWN = "Mandatets uppgift saknas i labbets svar: vad som är kvar av det syns inte här, och godkännandet prövar det ändå.";
export function orderingState(a: Pick<OrdersAnswer, "policy" | "day" | "balance"> | null): { open: boolean; words: string } {
  const p = a?.policy;
  if (!a || !p) return { open: false, words: "Beställningsreglerna kunde inte läsas." };
  if (!p.enabled) return { open: false, words: "Beställningar är avstängda i beställningsreglerna." };
  const b = p.mandateBudget;
  if (b && b.status !== "active") return { open: false, words: mandateWords(b) };
  if (b && b.available <= 0) return { open: false, words: `Mandatet är förbrukat. ${mandateWords(b)}` };
  if (a.day.spent >= a.day.cap) return { open: false, words: `Dagens tak är nått: ${credits(a.day.spent)} av ${credits(a.day.cap)} krediter intecknade.` };
  const balance = a.balance?.credits ?? p.balance.credits;
  if (balance <= p.minBalance) return { open: false, words: `Saldot ${credits(balance)} krediter är nere vid golvet ${credits(p.minBalance)}.` };
  // Without the mandate's figure the row says so, rather than the day's cap, which is set too high to say anything.
  return { open: true, words: b ? mandateWords(b) : MANDATE_UNKNOWN };
}

// ── Words ───────────────────────────────────────────────────────────────────
export type Tone = "neutral" | "brass" | "ok" | "variant" | "wait" | "bad" | "remark";
/** A status chip: colour AND sign, never colour alone. */
export const SHOWN_CHIP: Record<Shown, { tone: Tone; sign: string }> = {
  UTKAST: { tone: "neutral", sign: "✎" },
  VÄNTAR: { tone: "wait", sign: "○" },
  KLAR_ATT_TRYCKA: { tone: "brass", sign: "●" },
  GODKÄND: { tone: "ok", sign: "✓" },
  LAGD: { tone: "variant", sign: "↑" },
  OSÄKER: { tone: "remark", sign: "?" },
  KLAR: { tone: "variant", sign: "◆" },
  HÄMTAD: { tone: "variant", sign: "↓" },
  EFTERARBETAD: { tone: "variant", sign: "◆" },
  MÄTT: { tone: "variant", sign: "◆" },
  GRANSKAD: { tone: "ok", sign: "✓" },
  INFÖRD: { tone: "ok", sign: "★" },
  MISSLYCKAD: { tone: "bad", sign: "✕" },
  AVBRUTEN: { tone: "neutral", sign: "–" },
};
/** "Väntar på ankare 2.1", "Klar att godkänna", "Godkänd, i kön". */
export function shownWords(answer: Pick<OrderAnswer, "shown" | "waiting">): string {
  if (answer.shown === "VÄNTAR" && answer.waiting.length) return `Väntar på ${waitWords(answer.waiting)}`;
  return SHOWN_LABEL[answer.shown];
}

/** "2 tagningar × 86 = 172 krediter". */
export function costWords(order: Pick<Order, "takes" | "cost">): string {
  const n = order.takes;
  return `${n} ${n === 1 ? "tagning" : "tagningar"} × ${credits(order.cost.perTake)} = ${credits(order.cost.total)} krediter`;
}

/** The pictures in the order they matter: first, in-between, last; or the dealer's picture first (an older still's pose after it). */
export function picturesInOrder(pictures: readonly Picture[]): Picture[] {
  const rank = (p: Picture) => (p.goesAs === "startFrame" ? 0 : p.goesAs === "endFrame" ? 2 : p.tag === "anchor" ? 0 : 1);
  return [...pictures].sort((a, b) => rank(a) - rank(b));
}

/** "1,1 px från planen". */
export const offsetWords = (px: number | null | undefined): string | null => (px === null || px === undefined ? null : `${String(px).replace(".", ",")} px från planen`);

/** The orders in the sections the list shows them in. */
export type Section = { key: string; title: string; orders: OrderAnswer[] };
export function sections(orders: readonly OrderAnswer[]): Section[] {
  const of = (test: (a: OrderAnswer) => boolean) => orders.filter(test);
  const before = (a: OrderAnswer) => !a.order.approval && a.order.status !== "AVBRUTEN";
  return [
    { key: "redo", title: "Klara att godkänna", orders: of((a) => before(a) && a.shown !== "VÄNTAR") },
    { key: "vantar", title: "Väntar på bilder", orders: of((a) => before(a) && a.shown === "VÄNTAR") },
    { key: "kon", title: "I kön", orders: of((a) => a.shown === "GODKÄND") },
    { key: "lagda", title: "Lagda och levererade", orders: of((a) => !!a.order.approval && a.shown !== "GODKÄND") },
    { key: "avbrutna", title: "Avbrutna", orders: of((a) => !a.order.approval && a.order.status === "AVBRUTEN") },
  ].filter((s) => s.orders.length);
}

/** A dealer's anchor for a new order: the picture that holds, else its candidates (the order then says it is one). */
export function anchorFor<E extends { role: string; state?: string; node?: string; card?: string; served: string | null }>(entries: readonly E[], at: Anchor): { holds: E | null; candidates: E[] } {
  const role = ANCHOR_ROLE[at], node = ANCHOR_NODE[at];
  const mine = entries.filter((e) => e.role === role && e.node === node && !e.card && e.served);
  return { holds: mine.find((e) => e.state === "gäller") ?? null, candidates: mine.filter((e) => e.state === "kandidat") };
}

/** The line under the queue: how the approved orders get placed. */
export const HANDOVER = "Säg 'lägg kön' till huvudagenten, så läggs godkända beställningar.";

// ── The card an order goes to ───────────────────────────────────────────────
/**
 * The cards one order can go to: every card of the plan, a seat's second card too (P3.C2; the store takes any card of
 * the plan). In a round a second card plays the first card's film (src/clip-graph.ts filmCard), so a film of its own is a
 * take of its own edge, played where a round names it. "Alla sju" stays the first cards (ALL_SEVEN).
 */
export const SECOND_CARD = /^P[1-7]\.C2$/;
export const orderableCard = (target: string | null | undefined): boolean => !!target && (SEAT_TARGETS.includes(target) || SECOND_CARD.test(target));
/** A player's card: 1 or 2; the dealer's cards count as 1 here (Dealer and Hålkort are chosen as seats). */
export const cardOf = (target: string): 1 | 2 => (SECOND_CARD.test(target) ? 2 : 1);

// ── What is ordered, in his notation ────────────────────────────────────────
/** Where the hand goes back to, in the model's words (the returns' labels "Tillbaka till nypet (2.1)", "… över skon (2.2)"). */
const BACK_TO: Record<Anchor, string> = { "1": "till vila", "2.1": "till nypet", "2.2": "över skon", "2.3": "till skon" };
/** A deal's grip as the studio names it: the plan's two (lib/placement.ts), and the two hands of anchor 2.3. */
const split = (edge: string): [string, string] => [edge.slice(0, edge.indexOf(">")), edge.slice(edge.indexOf(">") + 1)];
export type Route = { nodes: string[]; line: string; sentence: string };
/**
 * What an order makes, in Jakob's notation and one plain sentence: "A2.2 → A3P3C2 → A2.2" and "Släp: ett kort till plats 3,
 * kort 2, och tillbaka över skon." The nodes are the edges the film is filed under (the model's cutIntoOf and edgeOf), each
 * written as the studio writes a node (names.ts nodeCode), so parseJakob reads the line back; several seats ("Alla sju")
 * as the first and last card. A still: the anchor it is made from and the picture it makes. Any other film says the
 * order's own line (summaryOf) without "Gör en film av Paow:".
 */
export function routeOf(step: StepDef, targets: readonly string[], shape: Shape | null, dealerName: string): Route {
  if (step.kind === "STILL") {
    const from = ANCHOR_NODE[step.from], made = step.makes?.node ?? from;
    return { nodes: [from, made], line: `${nodeCode(from)} → bild ${nodeCode(made)}`, sentence: `Bild: ${step.makes?.label ?? "ankaret"} görs ur ankare ${step.from}.` };
  }
  const target = step.card ? (targets[0] ?? null) : null;
  const edges = step.card && target ? cutIntoOf(step, target, shape) : [edgeOf(step, null)].filter((e): e is string => !!e);
  const nodes = edges.length ? [split(edges[0])[0], ...edges.map((e) => split(e)[1])] : [];
  const many = targets.length > 1 ? `${nodeCode(targets[0])}–${nodeCode(targets[targets.length - 1])}` : null;
  const line = nodes.map((n) => (many && n === target ? many : nodeCode(n))).join(" → ");
  if (!step.card || !target) {
    const said = summaryOf(step, dealerName, null).replace(/^Gör [^:]*:\s*/, "");
    return { nodes, line, sentence: said.charAt(0).toUpperCase() + said.slice(1) };
  }
  const seat = many ? `var och en av ${seatList(targets)}` : seatWords(target);
  const back = BACK_TO[step.to ?? step.from];
  if (step.start === "LAND") return { nodes, line, sentence: `Tillbaka ${back}, från kortet på ${seat}.` };
  const grip = step.grip === "DRAG" ? "Släp" : step.grip === "TWO_HANDS" ? "Två händer" : "Nyp";
  return { nodes, line, sentence: shape === "ROUND_TRIP" ? `${grip}: ett kort till ${seat}, och tillbaka ${back}.` : `${grip}: ett kort till ${seat}, bara dit.` };
}

/**
 * A stored order in his notation, "A2.1 → A3P4C1" (a still: "A1 → bild A2.2"): what it goes between, shown on the order's card
 * and at the top of "Det här skickas" in place of its stored summary, which for an order made before 2026-11-18 describes the
 * movement in words that were never sent. Null for an order whose step is unknown.
 */
export function orderLine(order: Pick<Order, "step" | "motion">): string | null {
  const step = stepOf(order.step.key);
  return step ? routeOf(step, order.motion?.target ? [order.motion.target] : [], order.step.shape, "").line : null;
}

// ── A new order from the address ────────────────────────────────────────────
/**
 * The anchor a card's deal starts on: the one the game deals it from for this dealer (src/game-director.ts dealPose, SEAT_HUB:
 * Paow's seat 6 from anchor 2.2, Jakob 2026-11-13), as Karta and the game have it. Bordet's row, its default round and Ny
 * beställning ask it here. Until 2026-11-18 it was the plan's grip, so the lab played seat 6 from anchor 2.1, where she has no
 * film, while the game played it from 2.2 (the rescue lane Kedjan, finding 1).
 */
export const dealAnchor = (dealer: string, card: string): Exclude<Anchor, "1"> => (["2.1", "2.2", "2.3"] as const).find((a) => ANCHOR_NODE[a] === dealPose(dealer, card)) ?? "2.1";
/** The dealer Ny beställning opens on when the address names none. */
export const SHEET_DEALER = "paow";

/**
 * What /bordet/?lage=bestall&ko=1&ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1 asks for (plats=alla: the first card to every player;
 * plats=P3.C2: a seat's second card; modell=kling-3-4k: that model, when it can make the step). A seat without a step gets
 * the deal from the anchor the game deals that card from (dealAnchor; with plats=alla the first seat's). Null without ny=1.
 */
export type Preset = { dealer: string | null; step: StepKey | null; target: string | null; all: boolean; model: string | null; like?: string | null };
export function presetOf(params: { get(name: string): string | null }): Preset | null {
  if (params.get("ny") !== "1") return null;
  // som=<id>: every choice of that order (recipeOf); the sheet reads them from the order itself.
  const like = params.get("som")?.toLowerCase() ?? null;
  if (like && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(like)) return { dealer: null, step: null, target: null, all: false, model: null, like };
  const dealer = params.get("dealer")?.toLowerCase() || null;
  const asked = params.get("steg")?.toUpperCase() ?? null;
  const plats = params.get("plats")?.toUpperCase() ?? null;
  const modell = params.get("modell")?.toLowerCase() ?? null;
  const all = plats === "ALLA";
  const target = plats && orderableCard(plats) ? plats : null;
  let step = asked && stepOf(asked) && !stepOf(asked)!.off ? (asked as StepKey) : null;
  if (!step && (target || all)) step = `GIV-${dealAnchor(dealer ?? SHEET_DEALER, target ?? "P1.C1")}`;
  return { dealer, step, target, all, model: modell && Object.hasOwn(MODELS, modell) ? modell : null };
}
/**
 * Every choice of an order, so that "Ny beställning som den här" opens the sheet with them chosen and one change gives a
 * clean comparison: dealer, step, seat, hand and handbyte, closed or open, the text's style, model, seconds,
 * takes, Jakob's addition, the reference film, tur och retur or bara dit, the card's size. An order written in the long
 * text (Utförlig, every order before template 4) gives Kort, since no new order is written Utförlig (longText says so, for
 * the sheet's line). The text is always written with today's template. The pictures are never taken from it: a new draft
 * fetches what holds now.
 */
export type Recipe = {
  dealer: string; step: StepKey; target: string | null; hand: HandChoice | null; side: "FRONT" | "BACK" | null;
  style: TextStyle; longText: boolean; model: string; duration: number | null; takes: number; extra: string; reference: string | null; shape: Shape | null; cardScale: number;
};
export function recipeOf(order: Order): Recipe {
  const m = order.motion, d = order.generation.params.duration, style = styleOf(order.prompt);
  return {
    dealer: order.dealer, step: order.step.key, target: m?.target ?? null,
    hand: m ? handChoiceOf(m) : null, side: m?.side ?? null,
    style: style === "UTFÖRLIG" ? "KORT" : style, longText: style === "UTFÖRLIG", model: order.generation.model, duration: typeof d === "number" ? d : null, takes: order.takes,
    extra: order.prompt.extra ?? "", reference: order.reference.status === "FINNS" ? (order.reference.clips[0] ?? null) : null,
    shape: order.step.shape, cardScale: m?.cardScale ?? 1,
  };
}

// ── Whose a picture is ──────────────────────────────────────────────────────
/** "Paow", "Ada · bara armen" (another dealer's arm in an older still's pose), or a warning when a whole picture of another dealer would go out. */
export function ownerWords(owner: Owner | null | undefined, dealer: string): { text: string; tone: Tone } {
  if (!owner) return { text: "okänd källa", tone: "remark" };
  if (owner.dealer === dealer) return { text: owner.name, tone: "ok" };
  if (owner.part === "arm") return { text: `${owner.name} · bara armen`, tone: "wait" };
  return { text: `${genitive(owner.name)} bild!`, tone: "bad" };
}

// ── The choices of a deal, in words ─────────────────────────────────────────
/** "Handbyte", "Stängt → öppet", "Vänd vid platsen": the three choices of a stored deal. */
export function motionWords(order: Pick<Order, "motion"> & { step?: Pick<Order["step"], "key"> }): { hand: string; lands: string; turn: string | null } | null {
  const m = order.motion;
  if (!m) return null;
  // In a return the card lies where it was laid: nothing turns.
  const back = !!order.step && stepOf(order.step.key)?.start === "LAND";
  return { hand: HAND_LABEL[handChoiceOf(m)], lands: LANDS_LABEL[m.side], turn: m.side === "FRONT" && !back && m.flipAxis ? FLIP_LABEL[m.flipAxis] : null };
}

/** "Kort · 108 ord": a stored order's text style (Utförlig when it was written before template 4) and its length. */
export function styleWords(order: Pick<Order, "prompt">): string {
  return `${STYLE_LABEL[styleOf(order.prompt)]} · ${wordCount(order.prompt.text)} ord`;
}

/** The marks of the text: a quiet underline per choice, and its word in the legend. */
export const CHOICE_MARK: Record<Choice, { word: string; className: string; swatch: string }> = {
  hand: { word: "hand", className: "underline decoration-[#c9a2f2]/55 decoration-1 underline-offset-[5px]", swatch: "bg-[#c9a2f2]" },
  side: { word: "stängt / öppet", className: "underline decoration-[#e8cb85]/70 decoration-1 underline-offset-[5px]", swatch: "bg-[#e8cb85]" },
  turn: { word: "vändning", className: "underline decoration-[#e8cb85]/70 decoration-dotted decoration-2 underline-offset-[5px]", swatch: "bg-[#e8cb85]/60" },
  place: { word: "plats", className: "", swatch: "" },
  shape: { word: "bara dit", className: "underline decoration-[#7fd1b9]/60 decoration-1 underline-offset-[5px]", swatch: "bg-[#7fd1b9]" },
  reference: { word: "referensfilm", className: "underline decoration-[#9ec5ff]/70 decoration-wavy decoration-1 underline-offset-[5px]", swatch: "bg-[#9ec5ff]" },
  extra: { word: "ditt tillägg", className: "bg-variant/12 text-[#b6c6fa]", swatch: "bg-variant/50" },
  bans: { word: "det som inte får hända", className: "text-[#ef9a9a]", swatch: "bg-underkand/60" },
};
/** The mark a part gets: the first of its choices that has one (the place is said in the same sentence as the side). */
export const markOf = (part: Part): Choice | null => (part.from.find((c) => CHOICE_MARK[c].className) as Choice | undefined) ?? null;

/**
 * The parts of a stored order's text, from the same function the store wrote it with, when that gives exactly the stored
 * text (an order on an older template, or a plan changed since, gives null: the text is then shown unmarked).
 */
export function storedParts(order: Order, look: string | null | undefined, plan: PlanAnswer | null | undefined, dealerName: string): Part[] | null {
  if (!look) return null;
  const seat = order.motion?.target ? plan?.seats[order.motion.target] : null;
  const prompt = orderPrompt(order, { name: dealerName, look }, seat ? { x: seat.centre[0], y: seat.centre[1] } : null, { asStored: true });
  return prompt.text === order.prompt.text ? prompt.parts : null;
}
