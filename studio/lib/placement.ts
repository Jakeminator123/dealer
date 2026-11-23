// The thin helpers of Bordet's Kortplan (the plan on the picture): places in Jakob's words, the draft with its undo and what differs from the saved plan,
// the handles' arithmetic, numbers with a decimal comma, the view's address, what the cards can be laid over (the dealer's
// doll, the other dolls, her films). The plan's own rules (where a card is drawn, how an edit
// is made) are src/placement-model.ts. Pure: no DOM, no network; the motion's words are tested in studio/tests/bordet-line.test.ts.
import { isCurrent, playable, takeRole, ROLE_LABEL, type Graph } from "../../src/clip-graph.ts";
import { DOLL_BACKDROPS, SHOE, TARGETS, VIEWS, editPlace, motionNodes, sequence, toPixels, type Geometry, type Hand, type Intent, type Place, type PlacementPlan, type Side, type View } from "../../src/placement-model.ts";
import { cardCode, nodeCode } from "./names.ts";

// ── Places ──────────────────────────────────────────────────────────────────
export const PLACES: readonly Place[] = [...TARGETS, SHOE];
export const SEATS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "D"] as const;

/** "Plats 4 · kort 2", "Dealern · kort 1", "Skon". */
export function placeName(id: Place): string {
  if (id === SHOE) return "Skon";
  const m = /^(P([1-7])|D)\.C([123])$/.exec(id);
  if (!m) return id;
  return m[2] ? `Plats ${m[2]} · kort ${m[3]}` : `Dealern · kort ${m[3]}`;
}
/** "P4C2", "DC1", "Sko": the short form on the picture and in the address. */
export const placeCode = (id: Place): string => (id === SHOE ? "Sko" : (cardCode(id) ?? id));
/** A place from its short form ("p4c2", "DC1", "sko") or its plan key ("P4.C2"); null when it names none. */
export function placeFromCode(code: string | null | undefined): Place | null {
  const text = (code ?? "").trim().toUpperCase().replace(/\./g, "");
  if (text === "SKO" || text === "SHOE") return SHOE;
  const m = /^(P[1-7]|D)C([123])$/.exec(text);
  const id=m ? `${m[1]}.C${m[2]}` : null;
  return id && TARGETS.includes(id) ? id : null;
}

/**
 * The one view the card plan is edited in: the bank's picture, Dator (Jakob 2026-11-18: "Jag trodde att ingenting skulle göras
 * dubbelt för mobilen"). The plan file still holds a second view, portrait, that nothing in the lab, the game or an order
 * reads; validatePlan keeps accepting it and the lab leaves it as it stands.
 */
export const PLAN_VIEW: View = "native";
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
 * lab gave it: the draft then differs from the file until it is saved, and says so.
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
/** After a save: the server's plan (with its new updatedAt) is both the saved plan and the draft; the undo list is cleared. */
export const afterSave = (saved: PlacementPlan, revision: string): Draft => ({ saved, revision, plan: structuredClone(saved), past: [], gesture: null });

/** The places whose data differ between two plans (geometry in either view, motion, material), and whether the table's projection does. */
export function changedPlaces(a: PlacementPlan, b: PlacementPlan): { places: Place[]; table: boolean } {
  const places = PLACES.filter((id) => (id === SHOE ? JSON.stringify(a.shoe) !== JSON.stringify(b.shoe) : JSON.stringify(a.targets[id]) !== JSON.stringify(b.targets[id])));
  const table = JSON.stringify(a.tableProjection ?? null) !== JSON.stringify(b.tableProjection ?? null);
  return { places, table };
}

// ── The picture ─────────────────────────────────────────────────────────────
export type Pt = { x: number; y: number };
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
 * An arrow key on a place: one pixel (Shift: ten) in the arrow's direction, or with `turn` one degree
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
/**
 * The shoe anchor a card is taken from when nothing else is known: A2.3 with handbyte (Jakob 2026-11-21: with handbyte the
 * card goes from A2.3, never "A2.2 släp"), else the plan's grip. Bordet knows the dealer and passes the anchor its films go
 * from (lib/bordet.ts wishAnchor) to motionSteps instead.
 */
export const anchorOf = (intent: Pick<Intent, "grip" | "pass">) => (intent.pass ? "A2.3" : intent.grip === "DRAG" ? "A2.2" : "A2.1");
export type MotionStep = { id: string; label: string; detail: string };
/** How the hand at the shoe takes the card from each anchor. */
const TAKE_WORD: Record<string, string> = { "A2.1": "Nyp", "A2.2": "Släp", "A2.3": "Drar ut" };
/**
 * The card's way from the shoe and back (motionNodes), in Swedish; `code` is the model's own line for the exact reading.
 * `anchor`: the anchor the card's films go from ("A2.3"; lib/bordet.ts wishAnchor), else anchorOf. The turn says only what
 * the plan steers (the sides); where and how it turns is the recipe's and its reference film's (lib/bordet.ts motionLine).
 */
export function motionSteps(id: string, intent: Intent, anchor: string = anchorOf(intent)): { steps: MotionStep[]; code: string } {
  const words: Record<string, (detail: string) => MotionStep> = {
    ready: () => ({ id: "ready", label: anchor, detail: sideWord(intent.startSide) }),
    take: () => ({ id: "take", label: TAKE_WORD[anchor] ?? "Nyp", detail: handWord(intent.takeHand) }),
    pass: () => ({ id: "pass", label: "Handbyte", detail: `${handWord(intent.takeHand)} → ${handWord(intent.takeHand === "LH" ? "RH" : "LH")}` }),
    turn: () => ({ id: "turn", label: "Vänd", detail: `${sideWord(intent.startSide)} → ${sideWord(intent.endSide)}` }),
    land: () => ({ id: "land", label: "Landar", detail: `${nodeCode(id)} · ${sideWord(intent.endSide)}` }),
    release: (detail) => ({ id: "release", label: "Släpper", detail: handWord(detail as Hand) }),
    return: () => ({ id: "return", label: "Tillbaka", detail: anchor }),
  };
  return { steps: motionNodes(id, intent).map((n) => words[n.id](n.detail)), code: sequence(id, intent) };
}

// ── What lies under the cards ───────────────────────────────────────────────
// A doll, or a film of the chosen dealer's. A doll's picture is the 3D scene's table at its home view, the bank's shoe and a
// white doll at rest where the dealer sits, built by tools/placement-backdrop.ts (DOLL_BACKDROPS): never a picture of a dealer
// (Jakob 2026-11-13: "a neutral picture and not a picture of this woman"). The chosen dealer's own doll lies there until
// something else is chosen, the standard doll for a dealer who has none (Jakob 2026-11-23: "Sätt in dockan för dealern
// istället för siluetten. Dockan övertar altså siluetten, men ska vara utifrån vilken dealer som vi har valt"); the other
// dolls stay in the list (2026-11-21: "där man ska kunna ändra docka också"). Nothing else since 2026-11-18 (Jakob: "Om hon
// används som referens borde hon rimligtvis göras till silhuett", and "V6-läget är jag skeptisk mot i sin helhet"): the V6
// picture left the list, and so did every film of a dealer he has not chosen. Where a doll's file is missing the picture
// stays dark rather than show her.
export type Still = (typeof DOLL_BACKDROPS)[number]["id"];
/** The dolls by his words (Ordlista, Docka): "Docka: <doll>", named as the dealer is ("Docka: Paow"). */
export const STILLS: readonly { id: Still; word: string; path: string }[] = DOLL_BACKDROPS.map((d) => ({ id: d.id, word: `Docka: ${d.doll.charAt(0).toUpperCase()}${d.doll.slice(1)}`, path: d.native }));
/** A dealer's doll: her own where she has one, else the standard doll. What lies under the cards when nothing is chosen. */
export const dollFor = (dealer: string) => STILLS.find((s) => s.id === `docka-${dealer}`) ?? STILLS.find((s) => s.id === "docka-standard")!;
/** The list's dolls for a dealer: hers first, then the others. */
export function stillsFor(dealer: string) {
  const own = dollFor(dealer);
  return [own, ...STILLS.filter((s) => s !== own)];
}
export type Shown = { kind: "still"; still: Still; path: string } | { kind: "film"; film: Film };
/**
 * What lies under the cards: the doll or the film the address names (a film when it is one of `films`, the chosen dealer's),
 * else the dealer's doll. So does every other name: an old link's bakgrund=neutral (Siluett, which the dolls replaced) and a
 * film of another dealer's.
 */
export function shownBackdrop(backdrop: string | null, films: readonly Film[], dealer: string): Shown {
  const still = STILLS.find((s) => s.id === backdrop);
  const film = backdrop && !still ? films.find((f) => f.id === backdrop) : undefined;
  if (film) return { kind: "film", film };
  const s = still ?? dollFor(dealer);
  return { kind: "still", still: s.id, path: s.path };
}

// ── The address ─────────────────────────────────────────────────────────────
// /placering/?plats=p4c2&bakgrund=<film id | docka-standard>&ruta=40: the chosen place, and what to lay the cards over (a film
// with its frame, or a doll). Nothing chosen is the default: P4C2 (the first place), the chosen dealer's doll. An old link's
// bakgrund=neutral shows that doll too, and its vy=mobil is not read: the plan has one view. "robot" belongs to every lab
// page (src/preview-ui.ts) and is kept as it stands.
export type PlacementAddress = { place: Place; backdrop: string | null; frame: number };
type Params = { get(name: string): string | null };
export const START_PLACE: Place = "P4.C2";

export function readPlacementAddress(params: Params): PlacementAddress {
  const backdrop = params.get("bakgrund")?.trim() || null;
  const frame = Number(params.get("ruta"));
  return {
    place: placeFromCode(params.get("plats")) ?? START_PLACE,
    backdrop: backdrop && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(backdrop) ? backdrop : null,
    frame: Number.isSafeInteger(frame) && frame > 0 ? frame : 0,
  };
}

// ── Films to lay the cards over ─────────────────────────────────────────────
// The films that can lie under the cards: the chosen dealer's current takes in the clip bank (the graph is that dealer's),
// only lying ones (underFilms): the plan's view is the bank's picture. start: the frame the take begins on in its film (a
// take cut from a longer film, as all of Paow's deals and returns are, begins inside it); target: the card the take deals
// or comes back from.
export type Film = { id: string; title: string; path: string; width: number; height: number; frames: number; fps: number; start: number; target: string | null };

/**
 * The clip bank's current playable takes with a film, the main take of each step first (as kbFilms). A take cut from a longer
 * film (its segment: a deal and its return cut from one film) is its film from the take's first frame, so a real deal can lie
 * under the cards beside the drawn card path. Takes that would read the same ("A1 → A1 · variant") are numbered in that
 * order ("A1 → A1 · variant 1", "… variant 2"), so that the list tells them apart.
 */
export function bankFilms(graph: Graph): Film[] {
  const films = [...graph.edges, ...graph.experiments].flatMap((e) =>
    e.takes
      .filter((t) => playable(t) && isCurrent(e, t) && !!t.media.video)
      .sort((a, b) => Number(b === e.main) - Number(a === e.main))
      .map((t) => ({
        id: t.id,
        title: `${nodeCode(e.from)} → ${nodeCode(e.to)}${t === e.main ? "" : ` · ${ROLE_LABEL[takeRole(e, t)]}`}`,
        path: t.media.video!,
        width: t.motion?.source?.width ?? t.receipt?.output?.width ?? 1764,
        height: t.motion?.source?.height ?? t.receipt?.output?.height ?? 1174,
        frames: t.frames ?? Math.max(1, Math.round((t.job?.duration ?? 4) * (t.fps ?? 30))),
        fps: t.fps ?? 30,
        start: t.segment?.start ?? 0,
        target: e.target ?? null,
      })),
  );
  const count = new Map<string, number>();
  for (const f of films) count.set(f.title, (count.get(f.title) ?? 0) + 1);
  const seen = new Map<string, number>();
  return films.map((f) => {
    if ((count.get(f.title) ?? 0) < 2) return f;
    const n = (seen.get(f.title) ?? 0) + 1;
    seen.set(f.title, n);
    return { ...f, title: `${f.title}${f.title.includes(" · ") ? " " : " · "}${n}` };
  });
}
/** A film is a deal to the place, or a take of its seat's film (P4.C2 plays P4.C1's): those come first under the cards. */
export const filmGoesTo = (film: Pick<Film, "target">, place: Place): boolean => !!film.target && place !== SHOE && film.target.slice(0, 3) === place.slice(0, 3);
/** A film shaped as the bank's picture (not a standing phone film). */
export const lying = (film: Pick<Film, "width" | "height">): boolean => film.width >= film.height;
/** The films that may lie under the cards for the chosen dealer: that dealer's takes from the bank (bankFilms), standing films left out. */
export const underFilms = (bank: readonly Film[]): Film[] => bank.filter(lying);
