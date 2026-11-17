// Bordet (/bordet/): the lab's one view of the table, where a card's place, its way there and the films to order are set in
// one frame (Jakob 2026-11-17: "Scen och placering bör ha samma typ av vy, och på högersidan ska man kunna ändra och laborera
// med detta. Detta ska också vara underlaget för beställning av nya filmer."). Pure helpers for it: the stage's camera (fit,
// zoom towards the pointer, pan, the close-up on a card), the one card shape every card on the stage is drawn with, and the
// list of films to order (step 3): which steps a card can have, each in his notation, with the method of record's recipe
// and price and the exact body of POST /api/orders that the production list would send for it (tools/produce.ts draftOf,
// without its notes and createdBy, which the page cannot set). Nothing here composes an order: the store does, as for every
// draft. No DOM, no network; tests in studio/tests/bordet.test.ts.
import {
  ANCHOR_NODE, MODELS, STEPS, costOf, credits, defaultFlip, genitive, landingOf, lengthFor, modelFor, paramsOf, referenceCandidates, scaleQuad, seatWords, stepOf,
  type BankFacts, type FlipAxis, type HandChoice, type PlanAnswer, type Policy, type RefCandidate, type Shape, type StepDef, type StepKey, type TextStyle,
} from "../../src/order-model.ts";
import { methodFor, recipeWords, type Method, type MethodRegister } from "../../src/order-methods.ts";
import { promptFor, type Prompt } from "../../src/order-prompts.ts";
import type { Intent, Place, Side } from "../../src/placement-model.ts";
import { SHOE } from "../../src/placement-model.ts";
import { anchorFor, type NewOrderInput } from "./orders.ts";
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
/** The smallest scale: half the fitted one (so that the picture can be seen whole with room round it). */
export const minScale = (area: Size, picture: Size) => fitScale(area, picture) / 2;
/** A camera kept sane: its scale within half the fit and ZOOM_MAX, its middle on the picture. */
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
/** The anchor a card's deal starts on: the plan's grip (A2.1 nyp, A2.2 släp). */
const dealFrom = (intent: Pick<Intent, "grip">) => (intent.grip === "DRAG" ? "2.2" : "2.1");

/**
 * The films a card can have, as one click each: its deal from the anchor the plan's grip says, the return to that anchor,
 * and the return to rest. The shoe has none. Steps that cannot be ordered here (`off`) are left out.
 */
export function cardWishes(place: Place, intent: Pick<Intent, "grip"> | null): FilmWish[] {
  if (place === SHOE || !intent) return [];
  const from = dealFrom(intent);
  const keys: StepKey[] = [from === "2.2" ? "GIV-2.2" : "GIV-2.1", from === "2.2" ? "RETUR-2.2" : "RETUR-2.1", "RETUR-1"];
  return keys.filter((k) => !stepOf(k)?.off).map((step) => ({ step, target: place }));
}
/** The films without a card, in the order a round meets them: the entries, the ways out, rest, the hole card's turn. */
export const OTHER_STEPS: readonly StepKey[] = ["INGANG-2.1", "INGANG-2.2", "UTGANG", "UTGANG-2.2", "VILA", "HALKORT"];
export const otherWishes = (): FilmWish[] => OTHER_STEPS.filter((k) => stepOf(k) && !stepOf(k)!.off).map((step) => ({ step, target: null }));

/** The bank's edges a film is filed under, as nodes: a deal tur och retur gives anchor → card → anchor. */
function nodesOf(step: StepDef, target: string | null, shape: Shape | null): string[] {
  const from = ANCHOR_NODE[step.from], to = ANCHOR_NODE[step.to ?? step.from];
  if (step.edge === "IDLE>REVEAL(D.C2)") return ["IDLE", "REVEAL(D.C2)", "IDLE"];
  if (step.card && target) {
    if (step.start === "LAND") return [target, to];
    return shape === "ONE_WAY" ? [from, target] : [from, target, from];
  }
  return [from, to];
}
/** "A2.1 → P4C1 → A2.1", "P4C1 → A2.1", "A1 → A2.1": a film in his notation. */
export const wishLine = (step: StepDef, target: string | null, shape: Shape | null): string => nodesOf(step, target, shape).map(nodeCode).join(" → ");

/**
 * What Jakob chose himself on an opened row, over the method's recipe and the plan (the choices Ny beställning has): the model,
 * its length, takes, the text's style, tur och retur or bara dit, the reference film, hand, side and turn, the trial card scale
 * and his own addition. Only what is chosen is sent; what is not is the method's, or the plan's as the store takes it.
 */
export type RowChoice = Partial<{ model: string; duration: number; takes: number; style: TextStyle; shape: Shape; reference: string | null; hand: HandChoice; side: Side; flipAxis: FlipAxis; cardScale: number; extra: string }>;

export type FilmRow = {
  key: string;
  wish: FilmWish;
  /** His notation, and the step's own name ("Nyp, ett kort till platsen och tillbaka"). */
  line: string;
  label: string;
  method: Pick<Method, "id" | "status" | "reference"> | null;
  /** The method's recipe in one line ("Kling 4 · kort text · 7 s · …"), or "ingen metod än". */
  recipe: string;
  /** What one draft of it costs (all its takes), or null where no price is known or nothing can be sent. */
  cost: number | null;
  /** The body of POST /api/orders for it: the production list's draft, with his own choices over it; null when it cannot be sent. */
  body: NewOrderInput | null;
  /** Why it cannot be made a draft from here (no method, no reference film where the method wants one), or null. */
  why: string | null;
  /** The reference film that goes with it (the bank's take), or null; `wanted`: the method asks for one. */
  reference: RefCandidate | null;
  wanted: boolean;
  /** He has changed something on the row. */
  chosen: boolean;
};

/**
 * The reference film the production list takes where the method wants one (tools/produce.ts straightReferences): a deal to
 * the same seat (the same step first, then the other grip), approved straight by Jakob, of a length the model takes.
 */
export function straightReference(bank: BankFacts | null, dealer: string, step: StepKey, target: string | null, model: string | null): RefCandidate | null {
  const def = stepOf(step), m = model ? MODELS[model] : null;
  if (!bank || !def || !m?.videos) return null;
  return referenceCandidates(bank, { dealer, step: def, target, model: m }).find((c) => c.match <= 1 && c.approvedStraight && c.verdict === "GODKÄND" && c.fits) ?? null;
}

/**
 * The draft the production list would make for a step and a card from the method of record (tools/produce.ts draftOf), as the
 * page sends it: dealer, step, card, the model when it is not the step's own, seconds, style, takes, Jakob's addition, tur och
 * retur or bara dit for a deal, the reference film the method's rule finds, and the turn when the method names one (else the
 * plan's, which the store takes). A method still being tried (prov) gives a trial, one take, as the list's --trial does (its
 * title is left to the store). Where the method wants a reference film and none is found: the model it names for that case
 * without one, else null (the step waits for such a film). null when the method holds no recipe.
 */
export function orderBody(dealer: string, wish: FilmWish, method: Method | null, reference: string | null = null): NewOrderInput | null {
  const def = stepOf(wish.step);
  if (!def || !method || method.status === "saknas" || !method.model) return null;
  const wants = method.reference !== "ingen";
  if (wants && !reference && !method.noReferenceModel) return null;
  const model = wants && !reference ? method.noReferenceModel! : method.model;
  const flip = method.turn && method.turn !== "plan" ? method.turn : undefined;
  return {
    dealer,
    step: wish.step,
    ...(def.card && wish.target ? { target: wish.target } : {}),
    ...(model !== def.model ? { model } : {}),
    ...(def.kind === "FILM" && method.seconds ? { duration: method.seconds } : {}),
    ...(method.style ? { style: method.style } : {}),
    takes: method.status === "prov" ? 1 : (method.takes ?? 2),
    extra: method.extra,
    ...(def.card && def.start !== "LAND" && method.shape ? { shape: method.shape } : {}),
    ...(wants && reference ? { reference } : {}),
    ...(flip ? { flipAxis: flip } : {}),
  };
}

/**
 * His choices laid over a body, with the keys Ny beställning sends them under (lib/orders.ts NewOrderInput): only what he has
 * chosen changes. Without a method's body, Ny beställning's own defaults for the step (its model, its length, two takes, Kort).
 */
export function withChoice(dealer: string, wish: FilmWish, body: NewOrderInput | null, c: RowChoice): NewOrderInput | null {
  const def = stepOf(wish.step);
  if (!def) return null;
  if (!body && !Object.keys(c).length) return null;
  const base: NewOrderInput = body ?? { dealer, step: wish.step, ...(def.card && wish.target ? { target: wish.target } : {}), ...(def.kind === "FILM" && def.duration ? { duration: def.duration } : {}), takes: 2, style: "KORT", extra: null };
  const out: NewOrderInput = { ...base };
  if (c.model !== undefined) {
    if (c.model === def.model) delete out.model;
    else out.model = c.model;
  }
  if (c.duration !== undefined) out.duration = c.duration;
  if (c.takes !== undefined) out.takes = c.takes;
  if (c.style !== undefined) out.style = c.style;
  if (c.shape !== undefined && def.card && def.start !== "LAND") out.shape = c.shape;
  if (c.reference !== undefined) {
    if (c.reference) out.reference = c.reference;
    else delete out.reference;
  }
  if (c.hand !== undefined) Object.assign(out, c.hand === "PASS" ? { hand: "LH", pass: true } : { hand: c.hand, pass: false });
  if (c.side !== undefined) out.side = c.side;
  if (c.flipAxis !== undefined) out.flipAxis = c.flipAxis;
  if (c.cardScale !== undefined) {
    if (c.cardScale === 1) delete out.cardScale;
    else out.cardScale = c.cardScale;
  }
  if (c.extra !== undefined) out.extra = c.extra.trim() || null;
  return out;
}

/** What one draft of a body costs at the policy's prices: its model, its length, its takes (as Ny beställning counts it). */
export function bodyCost(body: NewOrderInput | null, policy: Pick<Policy, "prices"> | null): number | null {
  const def = body ? stepOf(body.step) : null;
  const model = def ? modelFor(def, body!.model ?? null) : null;
  if (!body || !def || !model || !policy) return null;
  const params = paramsOf(def, model, def.kind === "FILM" ? { duration: lengthFor(model, body.duration ?? def.duration ?? 4) } : {});
  return costOf({ model: model.id, params }, body.takes ?? 2, policy.prices)?.total ?? null;
}

/** A film of the list with its method's recipe, its reference film, his choices, its price and the body to send. */
export function filmRow(dealer: string, wish: FilmWish, methods: Pick<MethodRegister, "methods"> | null, policy: Pick<Policy, "prices"> | null, more: { bank?: BankFacts | null; choice?: RowChoice } = {}): FilmRow {
  const def = stepOf(wish.step)!;
  const method = methodFor(methods, wish.step, wish.target);
  const wanted = !!method && method.status !== "saknas" && method.reference !== "ingen";
  const found = wanted ? straightReference(more.bank ?? null, dealer, wish.step, wish.target, method!.model) : null;
  const choice = more.choice ?? {};
  const body = withChoice(dealer, wish, orderBody(dealer, wish, method, found?.take ?? null), choice);
  const takeId = body?.reference ?? null;
  const reference = !takeId ? null : found?.take === takeId ? found : more.bank ? (referenceCandidates(more.bank, { dealer, step: def, target: wish.target, model: MODELS[body?.model ?? def.model] }).find((c) => c.take === takeId) ?? null) : null;
  const shape: Shape | null = def.card && def.start !== "LAND" ? (body?.shape ?? method?.shape ?? "ROUND_TRIP") : null;
  const why = body ? null : !method || method.status === "saknas" ? "ingen metod än" : wanted ? "väntar på en rakt godkänd referensfilm till platsen" : null;
  return {
    key: wishKey(wish), wish, line: wishLine(def, wish.target, shape), label: def.label, method: method ? { id: method.id, status: method.status, reference: method.reference } : null,
    recipe: recipeWords(method, wanted && !found), cost: bodyCost(body, policy), body, why, reference, wanted, chosen: Object.keys(choice).length > 0,
  };
}

/** "Pamelas giv till plats 4", "Paows retur från plats 2": a reference film by whose it is and what it shows. */
export function referenceName(c: Pick<RefCandidate, "dealer" | "edge" | "goesTo">, names: Readonly<Record<string, string>>): string {
  const who = genitive(names[c.dealer] ?? c.dealer);
  const back = !/^(READY|READY-B|IDLE)>/.test(c.edge);
  return `${who} ${back ? "retur från" : "giv till"} ${seatWords(c.goesTo)}`;
}

// ── What goes to Runway for a row ───────────────────────────────────────────
// The same pictures, text and values Ny beställning shows before a draft exists, from the same functions (anchorFor,
// landingOf, the plan's card where the last picture draws it, promptFor): the first picture, the last picture (the anchor
// with the card drawn where the plan lays it, or a landing picture or an anchor), the reference film or none, the text word
// for word, and model, length and takes. Nothing else is sent: no card path, no JSON.
type EntryLike = { id: string; role: string; state?: string; node?: string; card?: string; served: string | null; name?: string; frame?: number; fps?: number | null };
export type Shot = { entry: EntryLike | null; name: string; waiting: string | null; cards: { quad: [number, number][]; side: Side }[] };
export type Sends = { first: Shot; last: Shot; drawn: boolean; prompt: Prompt | null; model: string; seconds: number | null; takes: number; resolution: string };

export function sendsOf(input: { dealer: { id: string; name: string; look: string | null }; body: NewOrderInput; entries: readonly EntryLike[]; plan: Pick<PlanAnswer, "seats"> | null }): Sends | null {
  const { body, entries, plan, dealer } = input;
  const step = stepOf(body.step);
  if (!step || step.kind !== "FILM") return null;
  const model = modelFor(step, body.model ?? null) ?? MODELS[step.model];
  const seconds = lengthFor(model, body.duration ?? step.duration ?? 4);
  const target = step.card ? (body.target ?? null) : null;
  const seat = target ? (plan?.seats[target] ?? null) : null;
  const deal = step.card && step.start !== "LAND";
  const shape: Shape | null = deal ? (body.shape ?? "ROUND_TRIP") : null;
  const oneWay = deal && shape === "ONE_WAY";
  const side: Side = body.side ?? seat?.side ?? "FRONT";
  const hands = body.hand ? { hand: body.hand, pass: !!body.pass } : { hand: seat?.hand ?? ("LH" as const), pass: seat?.pass ?? false };
  const flipAxis: FlipAxis = body.flipAxis ?? defaultFlip(body.step, seat?.turnAt, seat?.flipAxis);
  const scale = body.cardScale ?? 1;
  const start = anchorFor(entries, step.from);
  const end = !step.card || step.start === "LAND" ? (step.to ? anchorFor(entries, step.to).holds : null) : null;
  const landing = target ? landingOf(entries, target) : null;
  const anchorName = (e: EntryLike | null, at: string) => `${genitive(dealer.name)} ankare ${at}${e && e.state && e.state !== "gäller" ? ` · ${e.state}` : ""}`;
  const shot = (e: EntryLike | null, name: string, waiting: string, cards: Shot["cards"] = []): Shot => ({ entry: e, name, waiting: e ? null : waiting, cards });
  let first: Shot, last: Shot, drawn = false;
  if (step.cards?.length) {
    const cards = (when: "before" | "after") => step.cards!.flatMap((c) => (plan?.seats[c.target] ? [{ quad: plan.seats[c.target].quad, side: c[when] }] : []));
    first = shot(start.holds, `Första bild · ${anchorName(start.holds, step.from)} + hålkortet stängt`, `ankare ${step.from}`, cards("before"));
    last = shot(start.holds, "Sista bild · samma + hålkortet öppet", `ankare ${step.from}`, cards("after"));
    drawn = true;
  } else if (step.start === "LAND") {
    first = shot(landing, `Första bild · ${genitive(dealer.name)} landning på ${seatWords(target)}`, "landningsbilden");
    last = shot(end, `Sista bild · ${anchorName(end, step.to ?? step.from)}`, `ankare ${step.to}`);
  } else if (step.card) {
    first = shot(start.holds, `Första bild · ${anchorName(start.holds, step.from)}`, `ankare ${step.from}`);
    if (oneWay) last = shot(landing, `Sista bild · ${genitive(dealer.name)} landning på ${seatWords(target)}`, "landningsbilden");
    else {
      last = shot(start.holds, `Sista bild · samma + kortet ${side === "BACK" ? "stängt" : "öppet"} på ${seatWords(target)}`, `ankare ${step.from}`, seat ? [{ quad: scaleQuad(seat.quad, scale).quad, side }] : []);
      drawn = true;
    }
  } else {
    first = shot(start.holds, `Första bild · ${anchorName(start.holds, step.from)}`, `ankare ${step.from}`);
    last = shot(end, `Sista bild · ${anchorName(end, step.to ?? step.from)}`, `ankare ${step.to}`);
  }
  const motion = target ? { grip: step.grip ?? ("PINCH" as const), ...hands, turn: side === "FRONT", flipAxis, side, target } : null;
  const place = seat ?? (step.target ? (plan?.seats[step.target] ?? null) : null);
  const prompt = dealer.look
    ? promptFor({ dealer: { name: dealer.name, look: dealer.look }, step: body.step, model: model.id, motion, place: place ? { x: place.centre[0], y: place.centre[1] } : null, extra: body.extra?.trim() || null, style: body.style ?? "KORT", oneWay, reference: !!body.reference, cardScale: deal && shape === "ROUND_TRIP" ? scale : 1 })
    : null;
  const params = paramsOf(step, model, { duration: seconds });
  return { first, last, drawn, prompt, model: model.label, seconds, takes: body.takes ?? 2, resolution: String(params.resolution ?? "") };
}

/** "3 filmer · 640 krediter" (and how many have no price), for the foot of the list. */
export function sumWords(rows: readonly Pick<FilmRow, "cost">[]): string {
  const priced = rows.filter((r) => r.cost !== null);
  const total = priced.reduce((s, r) => s + (r.cost ?? 0), 0);
  const films = `${rows.length} ${rows.length === 1 ? "film" : "filmer"}`;
  if (!rows.length) return "Inga filmer";
  return `${films} · ${credits(total)} krediter${priced.length < rows.length ? ` · ${rows.length - priced.length} utan pris` : ""}`;
}

/** The steps the list knows, so that an address or a stored list can be read back (only real steps). */
export const isWish = (value: unknown): value is FilmWish =>
  !!value && typeof value === "object" && STEPS.some((s) => s.key === (value as FilmWish).step) && ((value as FilmWish).target === null || typeof (value as FilmWish).target === "string");

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
export function kortplanHref(place: string, view: "native" | "portrait" = "native"): string {
  const p = new URLSearchParams();
  const code = /^(P[1-7]|D)\.C([12])$/.exec(place);
  if (code) p.set("plats", `${code[1]}c${code[2]}`.toLowerCase());
  else if (place === "shoe") p.set("plats", "sko");
  if (view === "portrait") p.set("vy", "mobil");
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
