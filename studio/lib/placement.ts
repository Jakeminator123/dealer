// The Placering view's thin helpers: places in Jakob's words, the draft with its undo and what differs from the saved plan,
// the handles' arithmetic, numbers with a decimal comma, the view's address and the films the cards can be laid over.
// The plan's own rules (where a card is drawn, how an edit is made) are src/placement-model.ts. Pure: no DOM, no network;
// tests in studio/tests/placement.test.ts.
import { isCurrent, playable, takeRole, ROLE_LABEL, type Graph } from "../../src/clip-graph.ts";
import { SHOE, TARGETS, VIEWS, editPlace, motionNodes, sequence, toPixels, type Geometry, type Hand, type Intent, type Place, type PlacementPlan, type Side, type View } from "../../src/placement-model.ts";
import { nodeCode } from "./names.ts";

// ── Places ──────────────────────────────────────────────────────────────────
export const PLACES: readonly Place[] = [...TARGETS, SHOE];
export const SEATS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "D"] as const;
export const isPlace = (value: unknown): value is Place => typeof value === "string" && PLACES.includes(value);

/** "Plats 4 · kort 2", "Dealern · kort 1", "Skon". */
export function placeName(id: Place): string {
  if (id === SHOE) return "Skon";
  const m = /^(P([1-7])|D)\.C([12])$/.exec(id);
  if (!m) return id;
  return m[2] ? `Plats ${m[2]} · kort ${m[3]}` : `Dealern · kort ${m[3]}`;
}
/** "P4C2", "DC1", "Sko": the short form on the picture and in the address. */
export const placeCode = (id: Place): string => (id === SHOE ? "Sko" : nodeCode(id));
/** A place from its short form ("p4c2", "DC1", "sko") or its plan key ("P4.C2"); null when it names none. */
export function placeFromCode(code: string | null | undefined): Place | null {
  const text = (code ?? "").trim().toUpperCase().replace(/\./g, "");
  if (text === "SKO" || text === "SHOE") return SHOE;
  const m = /^(P[1-7]|D)C([12])$/.exec(text);
  return m ? `${m[1]}.C${m[2]}` : null;
}

export const VIEW_WORD: Record<View, string> = { native: "Dator", portrait: "Mobil" };
export const handWord = (h: Hand) => (h === "LH" ? "vänster" : "höger");
export const sideWord = (s: Side) => (s === "BACK" ? "stängt" : "öppet");

// ── Numbers ─────────────────────────────────────────────────────────────────
/** 12.5 → "12,5" with `digits` decimals (the minus sign as "−"). */
export const decimal = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",").replace("-", "−");
/** A number as Jakob may write it: "12,5", "12.5", "−3", " 4 ". NaN when it is none. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(/\s+/g, "").replace(/[−–]/g, "-").replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

// ── The draft ───────────────────────────────────────────────────────────────
// What Jakob changes is a draft beside the plan as it was read. Nothing is written until he presses Spara. Undo goes one
// step back; "Till sparat" goes to the saved plan as one step that can itself be undone. A gesture (a drag, a run of key
// presses) is one step: its first change puts the plan it started from on the undo list.
export type Draft = { saved: PlacementPlan; revision: string; plan: PlacementPlan; past: PlacementPlan[]; gesture: PlacementPlan | null };
export const HISTORY = 60;
export const signature = (plan: PlacementPlan) => JSON.stringify(plan);
const withProjection = (plan: PlacementPlan): PlacementPlan => (plan.tableProjection ? plan : { ...plan, tableProjection: { mode: "flat", heading: 0 } });

/**
 * A draft of the plan as read. A plan saved before the table projection existed gets the flat table in the draft, as the old
 * lab gives it (src/lab-ui.ts load): the draft then differs from the file until it is saved, and says so.
 */
export function openDraft(saved: PlacementPlan, revision: string): Draft {
  return { saved, revision, plan: withProjection(structuredClone(saved)), past: [], gesture: null };
}
export const isDirty = (d: Draft) => signature(d.plan) !== signature(d.saved);
const push = (past: PlacementPlan[], plan: PlacementPlan) => [...past, plan].slice(-HISTORY);

/** One step: the plan before it goes on the undo list (nothing happens when the plan is the same). */
export function commit(d: Draft, next: PlacementPlan): Draft {
  if (signature(next) === signature(d.plan)) return d;
  return { ...d, plan: next, past: push(d.past, d.plan), gesture: null };
}
/** A gesture begins: its first change will be one step. */
export const begin = (d: Draft): Draft => ({ ...d, gesture: d.plan });
/** A change within the gesture; without one, a step of its own. */
export function amend(d: Draft, next: PlacementPlan): Draft {
  if (!d.gesture) return commit(d, next);
  if (signature(next) === signature(d.plan)) return d;
  const first = d.plan === d.gesture;
  return { ...d, plan: next, past: first ? push(d.past, d.gesture) : d.past };
}
export const end = (d: Draft): Draft => (d.gesture ? { ...d, gesture: null } : d);
export const undo = (d: Draft): Draft => (d.past.length ? { ...d, plan: d.past[d.past.length - 1], past: d.past.slice(0, -1), gesture: null } : d);
/** Back to the saved plan, as one step that Ångra takes back. */
export const toSaved = (d: Draft): Draft => commit(d, withProjection(structuredClone(d.saved)));
/** After a save: the server's plan (with its new updatedAt) is both the saved plan and the draft; the undo list is cleared, as in the old lab. */
export const afterSave = (saved: PlacementPlan, revision: string): Draft => ({ saved, revision, plan: structuredClone(saved), past: [], gesture: null });

/** The places whose data differ between two plans (geometry in either view, motion, material), and whether the table's projection does. */
export function changedPlaces(a: PlacementPlan, b: PlacementPlan): { places: Place[]; table: boolean } {
  const places = PLACES.filter((id) => (id === SHOE ? JSON.stringify(a.shoe) !== JSON.stringify(b.shoe) : JSON.stringify(a.targets[id]) !== JSON.stringify(b.targets[id])));
  const table = JSON.stringify(a.tableProjection ?? null) !== JSON.stringify(b.tableProjection ?? null);
  return { places, table };
}

// ── The picture ─────────────────────────────────────────────────────────────
export type Pt = { x: number; y: number };
/** A card's drawn size in the view's pixels: the near edge's length × the distance between its two edges' middles ("41 × 57 px"). */
export function quadSize(q: readonly Pt[]): { width: number; depth: number; text: string } {
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const top = mid(q[0], q[1]);
  const bottom = mid(q[2], q[3]);
  const width = Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
  const depth = Math.hypot(bottom.x - top.x, bottom.y - top.y);
  return { width, depth, text: `${Math.round(width)} × ${Math.round(depth)} px` };
}
export const centreOf = (q: readonly Pt[]): Pt => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });

/** A point of the picture in the card's own frame: x along its near edge, y toward the near edge, both in pixels from its centre. */
export function toLocal(g: Geometry, view: View, p: Pt): Pt {
  const c = toPixels(g, view);
  const a = (g.angle * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) };
}
const half = (g: Geometry, view: View) => ({ w: (g.width * (VIEWS[view].width - 1)) / 2, h: (g.height * (VIEWS[view].height - 1)) / 2 });

/**
 * Width and height from a near corner dragged to `p`: the card keeps its centre and angle, and the corner goes where the
 * pointer is. With `keepShape` the card only grows or shrinks, along the corner's own diagonal.
 */
export function sizeFromCorner(g: Geometry, view: View, p: Pt, keepShape = false): Pick<Geometry, "width" | "height"> {
  const l = toLocal(g, view, p);
  const { w, h } = half(g, view);
  const W = VIEWS[view].width - 1;
  const H = VIEWS[view].height - 1;
  if (keepShape) {
    const cx = Math.sign(l.x || 1) * w;
    const f = Math.max(0.01, (l.x * cx + l.y * h) / (cx * cx + h * h));
    return { width: g.width * f, height: g.height * f };
  }
  return { width: (2 * Math.abs(l.x)) / W, height: (2 * Math.abs(l.y)) / H };
}
/** The perspective (taper: the far edge's width against the near edge's) from a far corner dragged to `p`. */
export function taperFromCorner(g: Geometry, view: View, p: Pt): number {
  const { w } = half(g, view);
  return w > 0 ? Math.abs(toLocal(g, view, p).x) / w : g.taper;
}
/** Where the turning handle sits: beyond the far edge's middle, `reach` pixels out from the card's centre. */
export function turnHandle(q: readonly Pt[], reach: number): { from: Pt; at: Pt } {
  const c = centreOf(q);
  const from = { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 };
  const d = Math.hypot(from.x - c.x, from.y - c.y) || 1;
  return { from, at: { x: from.x + ((from.x - c.x) / d) * reach, y: from.y + ((from.y - c.y) / d) * reach } };
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/**
 * An arrow key on a place, as the old tab took it: one pixel (Shift: ten) in the arrow's direction, or with `turn` one degree
 * (Shift: fifteen), → and ↑ clockwise. null when the key is no arrow. The shoe only moves.
 */
export function nudged(plan: PlacementPlan, id: Place, view: View, key: string, shift: boolean, turn: boolean): PlacementPlan | null {
  const d = ARROWS[key];
  if (!d) return null;
  if (turn && id !== SHOE) {
    const change = (shift ? 15 : 1) * (key === "ArrowLeft" || key === "ArrowDown" ? -1 : 1);
    return editPlace(plan, id, view, { angle: ((plan.targets[id].geometry[view].angle + change + 540) % 360) - 180 });
  }
  const v = VIEWS[view];
  const step = shift ? 10 : 1;
  const old = id === SHOE ? plan.shoe[view] : plan.targets[id].geometry[view];
  return editPlace(plan, id, view, { u: old.u + (d[0] * step) / (v.width - 1), v: old.v - (d[1] * step) / (v.height - 1) });
}

// ── The motion, in his words ────────────────────────────────────────────────
/** The shoe anchor a card is taken from: A2.1 nyp (pinched in the window) or A2.2 hand över (slid out of the mouth). */
export const anchorOf = (intent: Pick<Intent, "grip">) => (intent.grip === "DRAG" ? "A2.2" : "A2.1");
export type MotionStep = { id: string; label: string; detail: string };
/** The card's way from the shoe and back (motionNodes), in Swedish; `code` is the model's own line for the exact reading. */
export function motionSteps(id: string, intent: Intent): { steps: MotionStep[]; code: string } {
  const anchor = anchorOf(intent);
  const words: Record<string, (detail: string) => MotionStep> = {
    ready: () => ({ id: "ready", label: anchor, detail: sideWord(intent.startSide) }),
    take: () => ({ id: "take", label: intent.grip === "DRAG" ? "Släp" : "Nyp", detail: handWord(intent.takeHand) }),
    pass: () => ({ id: "pass", label: "Handbyte", detail: `${handWord(intent.takeHand)} → ${handWord(intent.takeHand === "LH" ? "RH" : "LH")}` }),
    turn: () => ({ id: "turn", label: "Vänd", detail: `${intent.turnAt === "PLACE" ? "vid platsen" : "i luften"}` }),
    land: () => ({ id: "land", label: "Landar", detail: `${nodeCode(id)} · ${sideWord(intent.endSide)}` }),
    release: (detail) => ({ id: "release", label: "Släpper", detail: handWord(detail as Hand) }),
    return: () => ({ id: "return", label: "Tillbaka", detail: anchor }),
  };
  return { steps: motionNodes(id, intent).map((n) => words[n.id](n.detail)), code: sequence(id, intent) };
}

// ── The address ─────────────────────────────────────────────────────────────
// /placering/?vy=mobil&plats=p4c2&bakgrund=<film id>&ruta=40: the view, the chosen place, and a film to lay the cards over
// with its frame. Nothing chosen is the default: Dator, P4C2 (the old lab's first place), the V6 picture. "robot" belongs to
// every lab page (src/preview-ui.ts) and is kept as it stands.
export type PlacementAddress = { view: View; place: Place; film: string | null; frame: number };
type Params = { get(name: string): string | null };
export const START_PLACE: Place = "P4.C2";

export function readPlacementAddress(params: Params): PlacementAddress {
  const film = params.get("bakgrund")?.trim() || null;
  const frame = Number(params.get("ruta"));
  return {
    view: params.get("vy") === "mobil" ? "portrait" : "native",
    place: placeFromCode(params.get("plats")) ?? START_PLACE,
    film: film && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(film) ? film : null,
    frame: Number.isSafeInteger(frame) && frame > 0 ? frame : 0,
  };
}
/** The address's question for a state, the lab's own words (robot) kept from `keep`. */
export function placementQuery(a: PlacementAddress, keep?: Params): string {
  const p = new URLSearchParams();
  if (a.view === "portrait") p.set("vy", "mobil");
  if (a.place !== START_PLACE) p.set("plats", placeCode(a.place).toLowerCase());
  if (a.film) {
    p.set("bakgrund", a.film);
    if (a.frame > 0) p.set("ruta", String(a.frame));
  }
  const robot = keep?.get("robot");
  if (robot !== null && robot !== undefined) p.set("robot", robot);
  const text = p.toString();
  return text ? `?${text}` : "";
}

// ── Films to lay the cards over ─────────────────────────────────────────────
// The old tab's "Visa grön film" opened the film library on the green P4C2 film; the library holds the clip bank's current
// takes first and the older proofs and references after (src/lab-ui.ts openLibrary, kbFilms). Here any of them can lie
// under the cards, in the view whose shape it has.
export type Film = { id: string; title: string; path: string; width: number; height: number; frames: number; fps: number; group: "bank" | "older" };
export const GREEN_FILM = "pamela-p4-c2-source-turn";
export type LibraryItem = { id?: unknown; title?: unknown; path?: unknown; kind?: unknown; width?: unknown; height?: unknown; frameCount?: unknown; fps?: unknown };

/** The clip bank's current playable takes with a film of their own, the main take of each step first (as kbFilms). */
export function bankFilms(graph: Graph): Film[] {
  return [...graph.edges, ...graph.experiments].flatMap((e) =>
    e.takes
      .filter((t) => playable(t) && isCurrent(e, t) && !!t.media.video && !t.segment)
      .sort((a, b) => Number(b === e.main) - Number(a === e.main))
      .map((t) => ({
        id: t.id,
        title: `${nodeCode(e.from)} → ${nodeCode(e.to)}${t === e.main ? "" : ` · ${ROLE_LABEL[takeRole(e, t)]}`}`,
        path: t.media.video!,
        width: t.motion?.source?.width ?? t.receipt?.output?.width ?? 1764,
        height: t.motion?.source?.height ?? t.receipt?.output?.height ?? 1174,
        frames: t.frames ?? Math.max(1, Math.round((t.job?.duration ?? 4) * (t.fps ?? 30))),
        fps: t.fps ?? 30,
        group: "bank" as const,
      })),
  );
}
/** The film library's own list (GET /api/library, data/library.json): older proofs and the V6 references. */
export function libraryFilms(items: readonly LibraryItem[]): Film[] {
  return items.flatMap((i) => {
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    if (typeof i.id !== "string" || typeof i.path !== "string" || !i.path.endsWith(".mp4")) return [];
    const width = n(i.width, 1764);
    const height = n(i.height, 1174);
    const title = i.kind === "reference" ? (width > height ? "V6 · dator" : "V6 · mobil") : typeof i.title === "string" ? i.title : i.id;
    return [{ id: i.id, title, path: i.path, width, height, frames: Math.round(n(i.frameCount, 1)), fps: n(i.fps, 30), group: "older" as const }];
  });
}
/** The view a film belongs in: a standing film in Mobil, every other in Dator. */
export const filmView = (film: Pick<Film, "width" | "height">): View => (film.height > film.width ? "portrait" : "native");
