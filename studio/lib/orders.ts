// Beställ (/bestall/): the view's calls to the lab server (tools/order-routes.ts) and the pure words and rows it shows.
// The order's shape, the exact call per take and the cost come from ../../src/order-model.ts (built in, never copied):
// "Det här skickas" lists the arguments requestOf() gives, so the screen shows what the ordering agent will send. The
// text and its marks come from ../../src/order-prompts.ts, the same function the store writes a draft's text with. A new
// order can be asked for by address (presetOf); whose each picture is is said in words (ownerWords).
// In the online copy nothing is asked for or written. Tests: studio/tests/orders.test.ts.
import { ApiError } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot } from "./mode.ts";
import {
  ANCHOR_NODE, ANCHOR_ROLE, FLIP_LABEL, HAND_LABEL, LANDS_LABEL, REF_VERDICT_LABEL, STYLE_LABEL, genitive, MODELS, SEAT_TARGETS, SHOWN_LABEL, STEPS, credits, handChoiceOf, requestOf, secondsWords, stepOf, styleOf, waitWords,
  type FlipAxis, type HandChoice, type Order, type OrderAnswer, type OrdersAnswer, type Owner, type Picture, type PlanAnswer, type Shape, type Shown, type StepKey, type TextStyle,
} from "../../src/order-model.ts";
import { orderPrompt, wordCount, type Choice, type Part } from "../../src/order-prompts.ts";

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
export type SeatInput = { target: string; hand: "LH" | "RH"; pass: boolean; side: "FRONT" | "BACK" };
export type NewOrderInput = {
  dealer: string;
  step: StepKey;
  target?: string | null;
  hand?: "LH" | "RH";
  pass?: boolean;
  side?: "FRONT" | "BACK";
  seats?: SeatInput[];
  flipAxis?: FlipAxis;
  /** Sent only when it is not the step's own model, so that a server from before the choice still takes the rest. */
  model?: string;
  duration?: number;
  takes?: number;
  extra?: string | null;
  base?: string;
  /** The text's style; tur och retur or bara dit for a deal; a reference film (the bank's take) for a model that takes one. */
  style?: TextStyle;
  shape?: Shape;
  reference?: string | null;
  /** The card's size on a round trip's last picture as a factor of the plan's (a trial); sent only when not 1. */
  cardScale?: number;
};
/** The first draft made, and every draft made (seven for "Alla sju"). */
export const createOrder = (input: NewOrderInput) => call<OrderAnswer & { made?: string[] }>("api/orders", "Utkastet", send("POST", input));
export type OrderChange = { title?: string; takes?: number; flipAxis?: FlipAxis; extra?: string | null; duration?: number; hand?: "LH" | "RH"; pass?: boolean; side?: "FRONT" | "BACK" };
export const changeOrder = (id: string, change: OrderChange, revision: string) => call<OrderAnswer>(`api/orders/${id}`, "Ändringen", send("PUT", change, revision));
export const approveOrder = (id: string, revision: string) => call<OrderAnswer>(`api/orders/${id}/approve`, "Godkännandet", send("POST", undefined, revision));
export const refreshOrder = (id: string, revision: string) => call<OrderAnswer>(`api/orders/${id}/refresh`, "Bilderna", send("POST", undefined, revision));

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

/** The pictures in the order they matter: first, in-between, last; or the dealer's picture, then the pose. */
export function picturesInOrder(pictures: readonly Picture[]): Picture[] {
  const rank = (p: Picture) => (p.goesAs === "startFrame" ? 0 : p.goesAs === "endFrame" ? 2 : p.tag === "anchor" ? 0 : p.tag === "pose" ? 1 : 1);
  return [...pictures].sort((a, b) => rank(a) - rank(b));
}

/** What a picture is in the call, in words: "startFrame", "referenceImages · @pose". */
export function goesWords(p: Picture): string {
  if (p.goesAs === "referenceImage") return p.tag ? `referenceImages · @${p.tag}` : "referenceImages";
  return p.goesAs;
}

export type ParamRow = { name: string; value: string; note?: string; picture?: string };
/**
 * Every argument of the call by its name, as requestOf() makes it for take 1 (promptText is shown on its own), then what
 * changes from take 2 and what is deliberately not sent.
 */
export function paramRows(order: Order): ParamRow[] {
  const { tool, args } = requestOf(order, 1);
  const rows: ParamRow[] = [{ name: "verktyg", value: tool, note: "Runways MCP-verktyg" }];
  const file = (ref: unknown) => String((ref as { url?: string })?.url ?? "").replace(/^\$file:/, "");
  for (const [name, value] of Object.entries(args)) {
    if (name === "promptText") continue;
    if (name === "startFrame" || name === "endFrame") rows.push({ name, value: file(value), picture: file(value), note: "laddas upp, adressen sätts in" });
    else if (name === "referenceImages") (value as unknown[]).forEach((v, i) => rows.push({ name: `${name}[${i}]`, value: `${file(v)}${(v as { tag?: string }).tag ? ` · tag ${(v as { tag?: string }).tag}` : ""}`, picture: file(v), note: "laddas upp" }));
    else if (name === "referenceVideos") (value as { durationSeconds: number }[]).forEach((v, i) => rows.push({ name: `${name}[${i}]`, value: `${file(v)} · ${String(v.durationSeconds).replace(".", ",")} s`, note: "laddas upp" }));
    else rows.push({ name, value: typeof value === "string" ? value : JSON.stringify(value), note: name === "duration" ? "sekunder" : undefined });
  }
  if (order.takes > 1) rows.push({ name: "confirmRepeat", value: "true", note: `från tagning 2 av ${order.takes}` });
  const model = MODELS[order.generation.model];
  if (model?.audio === "always") rows.push({ name: "generateAudio", value: "skickas inte", note: "ljudet är alltid på; tas bort i efterarbetet" });
  if (model?.tool === "generate_video" && model.shape && !("ratio" in args)) rows.push({ name: "ratio", value: "skickas inte", note: model.shape });
  return rows;
}

/** "Naturlig vändning", or nothing for a step without a turn. */
export const turnWords = (order: Pick<Order, "motion">): string | null => (order.motion?.turn && order.motion.flipAxis ? FLIP_LABEL[order.motion.flipAxis] : null);

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
export function anchorFor<E extends { role: string; state?: string; node?: string; card?: string; served: string | null }>(entries: readonly E[], at: "1" | "2.1" | "2.2"): { holds: E | null; candidates: E[] } {
  const role = ANCHOR_ROLE[at], node = ANCHOR_NODE[at];
  const mine = entries.filter((e) => e.role === role && e.node === node && !e.card && e.served);
  return { holds: mine.find((e) => e.state === "gäller") ?? null, candidates: mine.filter((e) => e.state === "kandidat") };
}

/** The step a new order starts on: the first picture or film the dealer lacks. */
export function firstLacking(entries: Parameters<typeof anchorFor>[0]): StepKey {
  if (!anchorFor(entries, "2.1").holds) return "ANKARE-2.1";
  if (!anchorFor(entries, "2.2").holds) return "ANKARE-2.2";
  return "GIV-2.1";
}

/** The line under the queue: how the approved orders get placed. */
export const HANDOVER = "Säg 'lägg kön' till filmagenten eller huvudagenten, så läggs godkända beställningar.";

// ── A new order from the address ────────────────────────────────────────────
/**
 * What /bestall/?ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1 asks for (plats=alla: the first card to every player;
 * modell=kling-3-4k: that model, when it can make the step). A seat without a step gets the deal its card is planned with
 * in Placering (nyp → GIV-2.1, släp → GIV-2.2). Null without ny=1.
 */
export type Preset = { dealer: string | null; step: StepKey | null; target: string | null; all: boolean; model: string | null; like?: string | null };
export function presetOf(params: { get(name: string): string | null }, plan: Pick<PlanAnswer, "seats"> | null | undefined): Preset | null {
  if (params.get("ny") !== "1") return null;
  // som=<id>: every choice of that order (recipeOf); the sheet reads them from the order itself.
  const like = params.get("som")?.toLowerCase() ?? null;
  if (like && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(like)) return { dealer: null, step: null, target: null, all: false, model: null, like };
  const dealer = params.get("dealer")?.toLowerCase() || null;
  const asked = params.get("steg")?.toUpperCase() ?? null;
  const plats = params.get("plats")?.toUpperCase() ?? null;
  const modell = params.get("modell")?.toLowerCase() ?? null;
  const all = plats === "ALLA";
  const target = plats && SEAT_TARGETS.includes(plats) ? plats : null;
  let step = asked && stepOf(asked) && !stepOf(asked)!.off ? (asked as StepKey) : null;
  if (!step && (target || all)) step = plan?.seats[target ?? "P1.C1"]?.grip === "DRAG" ? "GIV-2.2" : "GIV-2.1";
  return { dealer, step, target, all, model: modell && Object.hasOwn(MODELS, modell) ? modell : null };
}
/** The address params a new order is asked with, removed when the sheet closes. */
export const PRESET_PARAMS = ["ny", "dealer", "steg", "plats", "modell", "som"] as const;

/**
 * Every choice of an order, so that "Ny beställning som den här" opens the sheet with them chosen and one change gives a
 * clean comparison: dealer, step, seat, hand and handbyte, closed or open, the turn, the text's style (Utförlig for an
 * order before template 4), model, seconds, takes, Jakob's addition, the reference film, tur och retur or bara dit, the
 * card's size. The pictures are never taken from it: a new draft fetches what holds now.
 */
export type Recipe = {
  dealer: string; step: StepKey; target: string | null; hand: HandChoice | null; side: "FRONT" | "BACK" | null; flipAxis: FlipAxis | null;
  style: TextStyle; model: string; duration: number | null; takes: number; extra: string; reference: string | null; shape: Shape | null; cardScale: number;
};
export function recipeOf(order: Order): Recipe {
  const m = order.motion, d = order.generation.params.duration;
  return {
    dealer: order.dealer, step: order.step.key, target: m?.target ?? null,
    hand: m ? handChoiceOf(m) : null, side: m?.side ?? null, flipAxis: m?.flipAxis ?? null,
    style: styleOf(order.prompt), model: order.generation.model, duration: typeof d === "number" ? d : null, takes: order.takes,
    extra: order.prompt.extra ?? "", reference: order.reference.status === "FINNS" ? (order.reference.clips[0] ?? null) : null,
    shape: order.step.shape, cardScale: m?.cardScale ?? 1,
  };
}

// ── Whose a picture is ──────────────────────────────────────────────────────
/** "Paow", "Pamela · bara armen", or a warning when a whole picture of another dealer would go out. */
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

/** "Pamelas film · godkänd · 4 s": a reference film as it is shown, with whose it is when it is another dealer's. */
export function referenceWords(reference: Order["reference"], dealer: string, names: Record<string, string> = {}): string | null {
  if (reference.status !== "FINNS") return null;
  const whose = reference.dealer && reference.dealer !== dealer ? `${genitive(names[reference.dealer] ?? reference.dealer)} film` : reference.dealer ? "egen film" : null;
  return [reference.clips.join(", "), whose, reference.from ? REF_VERDICT_LABEL[reference.from.verdict] : null, secondsWords(reference.seconds)].filter(Boolean).join(" · ");
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

/** The step groups in the order the sheet shows them: pictures first (a new dealer needs her anchors before any film). */
export const stepGroups = () => [...new Set(STEPS.map((s) => s.group))].sort((a, b) => (a === "Bild" ? -1 : b === "Bild" ? 1 : 0));
