// Rounds for the Scen view (the studio's start): the ready-made ones as chips, the one his notation or the address asks for, a take played in
// its context, and the card places the bank needs to say how far a seat's second card is moved. Pure: no DOM, no network;
// tests in studio/tests/rounds.test.ts.
//
// A reference (film) is not a round of the bank: one finished, composited film (room, table, rendered cards) played as it
// is, in "Inte 3D" only (in the 3D scene it would be keyed and projected, which is wrong for a finished picture).
// The V6 film is one: Jakob's chosen visual reference (data/library.json v6-native-reference). It is listed apart, under
// "Referens", so that it is never mistaken for the bank's films played in the order of V6's deal ("Plats 4 · två kort").
// The old public page's whole deals to all seven are others (16 and 17 cards, the older 14), kept here before that page
// closes; where the registry has a timeline they are cut into chapters per card, so that one can jump to "P3C1".
import { SEATS, formatSequence, parseEdge, playable, returnFits, roundSequence, type Graph, type Segment, type Step, type Take } from "../../src/clip-graph.ts";
import { TARGETS, toPixels, type PlacementPlan } from "../../src/placement-model.ts";
import { labUrl } from "./lab.ts";
import { edgeName, formatJakob, formatSeconds, parseJakob, takeName } from "./names.ts";
import { partsOf, roundSeconds, type PlayPart } from "./parts.ts";

/**
 * A place to jump to in a reference film: from `frame` to the next chapter's frame (the last runs to the film's end).
 * label in his notation ("P3C1", "DC2 upp", "Början"), sub in words ("plats 3 · kort 1"), still: the frame its box shows
 * (where the deal lets go of the card).
 */
export type Chapter = { label: string; sub: string; frame: number; still: number };

/**
 * A finished film played as it is: its name in the strip, its path as the lab server hands it out (data/library.json),
 * its rate and length in frames. chapters: one part each, so that the strip has a box per chapter and a click jumps there.
 */
export type ReferenceFilm = { id: string; name: string; path: string; fps: number; frames: number; width: number; height: number; chapters?: Chapter[] };

/**
 * A round: name for its chip, text for the address (?runda=…) in his notation, or the lab's own with pinned takes
 * ("IDLE>READY@<take> | …") where a take is locked, the steps resolveRound gets, and what could not be read. sub: the
 * line under its name in the picker. film: a reference film instead of steps (no steps then).
 */
export type Round = { key: string; name: string; text: string; steps: Step[]; errors: string[]; sub?: string; film?: ReferenceFilm };

const fromText = (key: string, name: string, text: string): Round => ({ key, name, text, ...parseJakob(text) });
const fromSteps = (key: string, name: string, steps: Step[]): Round => ({
  key,
  name,
  text: steps.some((s) => s.take) ? formatSequence(steps) : formatJakob(steps),
  steps,
  errors: [],
});

// Jakob, 2026-11-12, of the film to seat 4 the scene's own page plays: "väldigt bra". The three takes are locked.
export const SEAT_FOUR =
  "IDLE>READY@pamela-idle-ready-entry-01 | READY>P4.C1@pamela-p4-c1-plan-deal-02 | P4.C1>IDLE@pamela-p4-c1-plan-return-idle-01";
// The order of V6's deal to one seat, both cards, written as he writes it: played with the bank's films, not the V6 film.
export const V6_DEAL = "A2.1 - P4C1 - A2.1 - P4C2 - A2.1";

/**
 * The V6 film (data/library.json "v6-native-reference", the manifest's visualReference, Jakob's choice of 10 Nov): the
 * finished picture with the room, the table and rendered cards; she changes hand and the card is larger than the plan's.
 * The computer's frame (1762 × 1174); the library's other V6 item, under output/v6/, is the phone's portrait reproduction.
 */
export const V6_FILM: ReferenceFilm = { id: "v6-native-reference", name: "V6-filmen", path: "assets/reference/v6.mp4", fps: 30, frames: 926, width: 1762, height: 1174 };
/** Its key, also its text in the address: /?runda=v6-filmen. */
export const V6_FILM_KEY = "v6-filmen";

// ── The old public page's whole deals (dealer-delta-eosin.vercel.app, 10 Nov; data/library.json) ──────────────────────
/** A segment of a sequence's timeline as motions/<id>.json keeps it (sequence.segments): its id and its frames [from, to). */
export type SequenceSegment = { id: string; outputRange: [number, number] };

/**
 * The chapters of a whole deal from its registered timeline: one where each deal or turn begins ("deal.P3.K1.release",
 * "reveal.D.K2"), running on through the return after it to the next; "Början" before the first when the film starts
 * at rest. Labels in his notation: P3C1, DC1, "DC2 upp".
 */
export function chaptersOf(segments: readonly SequenceSegment[]): Chapter[] {
  const out: Chapter[] = [];
  for (const s of segments) {
    const m = /^(deal|reveal)\.(P[1-7]|D)\.K(\d)\b/.exec(s.id);
    if (!m) continue;
    const [, kind, seat, card] = m;
    const [from, to] = s.outputRange;
    const dealer = seat === "D";
    const label = kind === "reveal" ? `${seat}C${card} upp` : `${seat}C${card}`;
    const sub = kind === "reveal" ? `dealern vänder kort ${card}` : dealer ? `dealern · kort ${card}` : `plats ${seat.slice(1)} · kort ${card}`;
    out.push({ label, sub, frame: from, still: Math.max(from, to - 1) });
  }
  if (out.length && out[0].frame > 0) out.unshift({ label: "Början", sub: "vila till redo", frame: 0, still: Math.round(out[0].frame / 2) });
  return out;
}

// The chapters of pamela-sequence-17-native-r2 as chaptersOf reads motions/pamela-sequence-17-native-r2.json (the test
// checks it against the registry): seven seats from P7 to P1, the dealer's first, again P7 to P1, the hole card, then the
// turn and the third. The 16-card film is the same film's first 3296 frames (a frame-exact prefix), so its chapters are
// these up to the hole card.
const R2_CHAPTERS: [string, number, number][] = [
  ["P7C1", 59, 151], ["P6C1", 219, 311], ["P5C1", 404, 493], ["P4C1", 612, 704], ["P3C1", 765, 895], ["P2C1", 1015, 1123], ["P1C1", 1254, 1356],
  ["DC1", 1417, 1546],
  ["P7C2", 1595, 1710], ["P6C2", 1830, 1926], ["P5C2", 2039, 2161], ["P4C2", 2278, 2393], ["P3C2", 2513, 2637], ["P2C2", 2752, 2894], ["P1C2", 2973, 3091],
  ["DC2", 3152, 3250], ["DC2 upp", 3296, 3415], ["DC3", 3475, 3567],
];
const r2Chapters = (frames: number): Chapter[] =>
  chaptersOf(
    R2_CHAPTERS.filter(([, from]) => from < frames).map(([label, from, last]) => {
      const m = /^(P[1-7]|D)C(\d)( upp)?$/.exec(label)!;
      return { id: `${m[3] ? "reveal" : "deal"}.${m[1]}.K${m[2]}${m[3] ? "" : ".release"}`, outputRange: [from, last + 1] as [number, number] };
    }),
  );

/**
 * pamela-sequence-16-native-r2: two cards to P1–P7 (P7 first), the dealer's two; the hole card stays down and the film
 * ends at rest. Blue/yellow show the card's sides; historical placements, not the plan. 1764 × 1174, 3296 frames.
 */
export const SEQ16_FILM: ReferenceFilm = {
  id: "pamela-sequence-16-native-r2",
  name: "Hel giv · alla sju och dealern",
  path: "assets/motions/pamela-sequence-16-native-r2/review.mp4",
  fps: 30,
  frames: 3296,
  width: 1764,
  height: 1174,
  chapters: r2Chapters(3296),
};
/** pamela-sequence-17-native-r2: the 16-card deal, then the hole card turned (DC2 upp) and a third card to the dealer. 3598 frames. */
export const SEQ17_FILM: ReferenceFilm = {
  id: "pamela-sequence-17-native-r2",
  name: "Hel giv · med vändning och tredje kort",
  path: "assets/motions/pamela-sequence-17-native-r2/source.mp4",
  fps: 30,
  frames: 3598,
  width: 1764,
  height: 1174,
  chapters: r2Chapters(3598),
};
/**
 * pamela-older-14-material-full: the older V6-era composition, two cards to all seven (P1 first), no dealer cards, white
 * cards with material in the room of V6. 3:03, 1762 × 1174. The library has no chapters per seat for it (only its start and
 * end), so it plays as one part.
 */
export const OLDER14_FILM: ReferenceFilm = {
  id: "pamela-older-14-material-full",
  name: "Hel giv · äldre, bara spelarna",
  path: "assets/motions/pamela-older-14-material-full/source.mp4",
  fps: 30,
  frames: 5486,
  width: 1762,
  height: 1174,
};
/** The references in the order the picker lists them, with their keys (the address: /?runda=17-kort). */
export const REFERENCE_FILMS: { key: string; sub: string; film: ReferenceFilm }[] = [
  { key: V6_FILM_KEY, sub: "den färdiga filmen från 10 nov · byter hand · större kort", film: V6_FILM },
  { key: "16-kort", sub: "färdig film 10 nov · 16 kort: två till varje plats, två till dealern (det andra dolt)", film: SEQ16_FILM },
  { key: "17-kort", sub: "färdig film 10 nov · 17 kort: som ovan, sedan vänds dealerns dolda kort och hon tar ett tredje", film: SEQ17_FILM },
  { key: "14-kort", sub: "äldre färdig film · 14 kort: två till varje plats, inga till dealern · vita kort", film: OLDER14_FILM },
];

const plain = (edges: { from: string; to: string }[]): Step[] => edges.map((e) => ({ from: e.from, to: e.to }));
const reference = (key: string, name: string, sub: string, film: ReferenceFilm): Round => ({ key, name, text: key, steps: [], errors: [], sub, film });

/**
 * The ready-made rounds, in the order of their chips: his favourite, seat 4 with two cards in V6's order (the bank's
 * films), every seat with the hole card, one per seat; then the references (isReference), listed apart.
 */
export function readyRounds(): Round[] {
  return [
    fromText("plats-4", "Plats 4", SEAT_FOUR),
    { ...fromText("plats-4-tva", "Plats 4 · två kort", V6_DEAL), sub: `${V6_DEAL} · bankens filmer` },
    fromSteps("alla", "Alla platser", plain(roundSequence({ seats: SEATS, reveal: true }))),
    ...SEATS.map((seat) => fromSteps(seat.toLowerCase(), seat, plain(roundSequence({ seats: [seat], dealer: false, cards: 1 })))),
    ...REFERENCE_FILMS.map((r) => reference(r.key, r.film.name, r.sub, r.film)),
  ];
}

/** A finished film rather than steps of the bank. */
export const isReference = (round: Round | null | undefined): round is Round & { film: ReferenceFilm } => !!round?.film;

const stepKey = (steps: readonly Step[]) => steps.map((s) => `${s.from}>${s.to}@${s.take ?? ""}`).join("|");
/** The ready-made round with exactly these steps, if any (to mark its chip). */
export const matchReady = (steps: readonly Step[], rounds: readonly Round[] = readyRounds()): Round | null =>
  steps.length ? (rounds.find((r) => stepKey(r.steps) === stepKey(steps)) ?? null) : null;

/** A round from what Jakob typed or the address carried: a reference by its key, a ready-made one when the steps are its steps. */
export function roundFromText(text: string, rounds: readonly Round[] = readyRounds()): Round {
  const named = rounds.find((r) => isReference(r) && r.key === text.trim().toLowerCase());
  if (named) return named;
  const own = fromText("egen", "Egen runda", text.trim());
  const ready = !own.errors.length ? matchReady(own.steps, rounds) : null;
  return ready ?? own;
}

// ── What the stage plays ────────────────────────────────────────────────────
/** A reference film as the stage's one part: the whole film, at its own speed, without a card track. */
export function referencePart(film: ReferenceFilm): PlayPart {
  return { step: 0, edge: film.id, from: "", to: "", take: null, path: labUrl(film.path), start: 0, end: film.frames, fps: film.fps, speed: 1, track: null, gap: null, known: true };
}

/**
 * A reference film as the stage plays it: one part per chapter, back to back on the same file (the stage plays them as
 * one run and steps frames across them), so that a box of the strip cues its chapter; without chapters the one part.
 */
export function referenceParts(film: ReferenceFilm): PlayPart[] {
  const chapters = film.chapters ?? [];
  if (chapters.length < 2) return [referencePart(film)];
  return chapters.map((c, step) => ({ ...referencePart(film), step, edge: `${film.id}#${c.label}`, start: c.frame, end: chapters[step + 1]?.frame ?? film.frames }));
}

/** The parts of a round: a reference film's (one per chapter), else one per step the bank resolved. */
export const roundParts = (round: Round | null, segments: readonly Segment[]): PlayPart[] => (isReference(round) ? referenceParts(round.film) : partsOf(segments));

/** The view a round can be shown in: a reference only as the film it is ("Inte 3D"); anything else as asked. */
export const viewFor = (round: Round | null, asked: View): View => (isReference(round) ? "platt" : asked);

/** Why 3D cannot be chosen for this round, in a few words for the control; null when it can. */
export const no3d = (round: Round | null): string | null => (isReference(round) ? "En färdig film spelas som den är: i 3D-scenen skulle den keyas och projiceras." : null);

// ── A take in its context ───────────────────────────────────────────────────
/**
 * The steps that play one take where it belongs, the old lab's rule (src/lab-ui.ts kbPlayPair): a deal with the return
 * that continues it (back to A2.1 when one fits there, else to A1; the bank's own rule picks which), a return after the deal
 * it continues (the main deal when that one fits, else the newest that does), anything else on its own. The take is locked.
 */
export function contextSteps(graph: Graph, edgeId: string, takeId: string | null): { steps: Step[]; error: string | null } {
  const take: Take | null = takeId ? (graph.takes[takeId] ?? null) : null;
  const edge = graph.edge[edgeId] ?? graph.edge[parseEdge(edgeId)?.base ?? ""] ?? (take ? graph.edge[take.edge] : undefined);
  if (!edge) return { steps: [], error: `Kanten ”${edgeId}” finns inte i klippbanken.` };
  if (takeId && !take) return { steps: [], error: `Tagningen ”${takeId}” finns inte i klippbanken.` };
  if (take && !playable(take)) return { steps: [], error: `${takeName(take)} på ${edgeName(edge)} kan inte spelas (underkänd eller inte klar).` };
  const pin = take ? { take: take.id } : {};
  if (edge.kind === "DEAL" && edge.target && !edge.experiment) {
    const card = edge.to;
    const hub = (["READY", "IDLE"] as const).find((h) => take && graph.edge[`${card}>${h}`]?.takes.some((t) => playable(t) && returnFits(t, take))) ?? "READY";
    return { steps: [{ from: take?.hub ?? edge.from, to: card, ...pin }, { from: card, to: hub }], error: null };
  }
  if (edge.kind === "RETURN" && edge.target && !edge.experiment) {
    const card = edge.from;
    const dealEdge = graph.edge[`READY>${card}`];
    const fits = take ? (dealEdge?.takes ?? []).filter((d) => playable(d) && !d.hub && returnFits(take, d)) : [];
    const deal = dealEdge?.main && fits.includes(dealEdge.main) ? dealEdge.main : ([...fits].sort((a, b) => b.order - a.order)[0] ?? null);
    return { steps: [{ from: "READY", to: card, ...(deal ? { take: deal.id } : {}) }, { from: card, to: edge.to, ...pin }], error: null };
  }
  return { steps: [{ from: edge.from, to: edge.to, ...pin }], error: null };
}

export function contextRound(graph: Graph, edgeId: string, takeId: string | null): Round {
  const { steps, error } = contextSteps(graph, edgeId, takeId);
  const take = takeId ? graph.takes[takeId] : null;
  const name = take ? takeName(take, graph.edge[take.edge]?.takes) : edgeName(edgeId);
  return { ...fromSteps("tagning", name, steps), errors: error ? [error] : [] };
}

// ── The address ─────────────────────────────────────────────────────────────
// /?runda=<his notation or the graph's sequence, or a reference's key: v6-filmen> · /?kant=<edge id>&tagning=<take id> ·
// &vy=platt starts in "Inte 3D".
export type View = "3d" | "platt";
export type Asked = { kind: "runda"; text: string } | { kind: "kant"; edge: string; take: string | null } | { kind: "none" };

export function readAddress(params: { get(name: string): string | null }): { asked: Asked; view: View } {
  const view: View = params.get("vy") === "platt" ? "platt" : "3d";
  const runda = params.get("runda")?.trim();
  const kant = params.get("kant")?.trim();
  const asked: Asked = runda ? { kind: "runda", text: runda } : kant ? { kind: "kant", edge: kant, take: params.get("tagning")?.trim() || null } : { kind: "none" };
  return { asked, view };
}

/** The address of a round and a view, as the page writes it back: "?runda=…" and "&vy=platt" when flat (a reference is always flat). */
export function addressOf(round: Round | null, view: View): string {
  const query = new URLSearchParams();
  if (round?.text) query.set("runda", round.text);
  if (view === "platt" && !isReference(round)) query.set("vy", "platt");
  const text = query.toString();
  return text ? `?${text}` : "";
}

// ── Places and words ────────────────────────────────────────────────────────
/**
 * Each card's centre in film pixels from Jakob's placement plan, as the old lab hands it to resolveRound (src/lab-ui.ts
 * kbPlaces): a seat's second card then gets its shift from the first card's film. null without a plan.
 */
export function placesOf(plan: Pick<PlacementPlan, "targets"> | null | undefined): Record<string, { x: number; y: number }> | null {
  if (!plan?.targets) return null;
  const out: Record<string, { x: number; y: number }> = {};
  for (const id of TARGETS) {
    const geometry = plan.targets[id]?.geometry?.native;
    if (!geometry) continue;
    const p = toPixels(geometry, "native");
    out[id] = { x: (p.x * 1763) / 1761, y: p.y };
  }
  return Object.keys(out).length ? out : null;
}

/** The round in a few words for the header: "3 steg · 8,5 s", with the gaps when there are any. */
export function roundFacts(parts: readonly PlayPart[]): string {
  const gaps = parts.filter((p) => !p.path).length;
  return [`${parts.length} steg`, gaps ? `${gaps} ${gaps === 1 ? "lucka" : "luckor"}` : null, formatSeconds(roundSeconds(parts))].filter(Boolean).join(" · ");
}
