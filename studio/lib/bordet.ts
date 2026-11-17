// Bordet (/bordet/): the lab's one view of the table, where a card's place, its way there and the films to order are set in
// one frame (Jakob 2026-11-17: "Scen och placering bör ha samma typ av vy, och på högersidan ska man kunna ändra och laborera
// med detta. Detta ska också vara underlaget för beställning av nya filmer."). Pure helpers for it: the stage's camera (fit,
// zoom towards the pointer, pan, the close-up on a card), the one card shape every card on the stage is drawn with, and the
// list of films to order (step 3): which steps a card can have, each in his notation, with the method of record's recipe
// and price and the exact body of POST /api/orders that the production list would send for it (tools/produce.ts draftOf,
// without its notes and createdBy, which the page cannot set). Nothing here composes an order: the store does, as for every
// draft. No DOM, no network; tests in studio/tests/bordet.test.ts.
import { ANCHOR_NODE, STEPS, costOf, credits, modelFor, paramsOf, stepOf, type Policy, type Shape, type StepDef, type StepKey } from "../../src/order-model.ts";
import { methodFor, recipeWords, type Method, type MethodRegister } from "../../src/order-methods.ts";
import type { Intent, Place } from "../../src/placement-model.ts";
import { SHOE } from "../../src/placement-model.ts";
import type { NewOrderInput } from "./orders.ts";
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

export type FilmRow = {
  key: string;
  wish: FilmWish;
  /** His notation, and the step's own name ("Nyp, ett kort till platsen och tillbaka"). */
  line: string;
  label: string;
  method: Pick<Method, "id" | "status"> | null;
  /** The method's recipe in one line ("Kling 4 · kort text · 7 s · …"), or "ingen metod än". */
  recipe: string;
  /** What one draft of it costs (all its takes), or null where no price or no method is known. */
  cost: number | null;
  /** The body of POST /api/orders for it, as the production list would send it; null where the method cannot make it here. */
  body: NewOrderInput | null;
  /** Why it cannot be made a draft from here (no method, a reference film that is chosen in Beställ). */
  why: string | null;
};

/**
 * The draft the production list would make for a step and a card from the method of record (tools/produce.ts draftOf), as the
 * page sends it: dealer, step, card, the model when it is not the step's own, seconds, style, takes, Jakob's addition, tur och
 * retur or bara dit for a deal, and the turn when the method names one (else the plan's, which the store takes). A method
 * still being tried (prov) gives a trial, one take, as the list's --trial does (its title is left to the store). null when
 * the method holds no recipe, or wants a reference film (that is chosen in Beställ).
 */
export function orderBody(dealer: string, wish: FilmWish, method: Method | null): NewOrderInput | null {
  const def = stepOf(wish.step);
  if (!def || !method || method.status === "saknas" || !method.model || method.reference !== "ingen") return null;
  const flip = method.turn && method.turn !== "plan" ? method.turn : undefined;
  return {
    dealer,
    step: wish.step,
    ...(def.card && wish.target ? { target: wish.target } : {}),
    ...(method.model !== def.model ? { model: method.model } : {}),
    ...(def.kind === "FILM" && method.seconds ? { duration: method.seconds } : {}),
    ...(method.style ? { style: method.style } : {}),
    takes: method.status === "prov" ? 1 : (method.takes ?? 2),
    extra: method.extra,
    ...(def.card && def.start !== "LAND" && method.shape ? { shape: method.shape } : {}),
    ...(flip ? { flipAxis: flip } : {}),
  };
}

/** A film of the list with its method's recipe, its price and the body to send. */
export function filmRow(dealer: string, wish: FilmWish, methods: Pick<MethodRegister, "methods"> | null, policy: Pick<Policy, "prices"> | null): FilmRow {
  const def = stepOf(wish.step)!;
  const method = methodFor(methods, wish.step, wish.target);
  const shape: Shape | null = def.card && def.start !== "LAND" ? (method?.shape ?? "ROUND_TRIP") : null;
  const body = orderBody(dealer, wish, method);
  const model = method?.model ? modelFor(def, method.model) : null;
  const takes = method?.status === "prov" ? 1 : (method?.takes ?? 2);
  const cost = method && model && policy && method.status !== "saknas" ? costOf({ model: model.id, params: paramsOf(def, model, def.kind === "FILM" && method.seconds ? { duration: method.seconds } : {}) }, takes, policy.prices) : null;
  const why = !method || method.status === "saknas" ? "ingen metod än" : method.reference !== "ingen" ? "referensfilmen väljs i Beställ" : null;
  return { key: wishKey(wish), wish, line: wishLine(def, wish.target, shape), label: def.label, method: method ? { id: method.id, status: method.status } : null, recipe: recipeWords(method), cost: cost?.total ?? null, body, why };
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
