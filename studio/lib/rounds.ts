// Rounds for Bordet's scene: a round built as a path through the nodes (what can follow a node, and
// whether the bank has a film for that step), the ready-made ones as examples, the one his notation or the address asks
// for, a take played in its context, and the card places the bank needs to say how far a seat's second card is moved.
// Pure: no DOM, no network; tests in studio/tests/rounds.test.ts.
//
// A reference (film) is not a round of the bank: one finished, composited film (room, table, rendered cards) played as it
// is, in Råfilm only (in the 3D scene it would be keyed and projected, which is wrong for a finished picture).
// The V6 film is one: Jakob's chosen visual reference (data/library.json v6-native-reference). It is listed apart, under
// "Referens", so that it is never mistaken for the bank's films played in the order of V6's deal ("Plats 4 · två kort").
// The old public page's whole deals to all seven are others (16 and 17 cards, the older 14), kept here before that page
// closes; where the registry has a timeline they are cut into chapters per card, so that one can jump to "P3C1".
import {
  AWAY,
  OPTIONAL_TARGETS,
  REVEAL_NODE,
  SEATS,
  TARGETS as CARDS,
  formatSequence,
  parseEdge,
  parseNode,
  playable,
  resolveRound,
  returnFits,
  roundSequence,
  type EdgeKind,
  type Gap,
  type Graph,
  type Segment,
  type Step,
  type Take,
  type Why,
} from "../../src/clip-graph.ts";
import { dealPose, hubChain } from "../../src/game-director.ts";
import { verdictOf } from "./verdict.ts";
import { TARGETS, toPixels, type PlacementPlan } from "../../src/placement-model.ts";
import { labUrl } from "./lab.ts";
import { edgeName, formatJakob, formatSeconds, nodeCode, nodeName, parseJakob, takeName } from "./names.ts";
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
export function readyRounds(graph?: Graph | null): Round[] {
  const rounds = [
    fromText("plats-4", "Plats 4", SEAT_FOUR),
    { ...fromText("plats-4-tva", "Plats 4 · två kort", V6_DEAL), sub: `${V6_DEAL} · bankens filmer` },
    fromSteps("alla", "Alla platser", plain(roundSequence({ seats: SEATS, reveal: true }))),
    ...SEATS.map((seat) => fromSteps(seat.toLowerCase(), seat, plain(roundSequence({ seats: [seat], dealer: false, cards: 1 })))),
    ...REFERENCE_FILMS.map((r) => reference(r.key, r.film.name, r.sub, r.film)),
  ];
  return graph ? rounds.map((r) => {
    if (isReference(r)) return r;
    const steps = r.steps.flatMap((s) => playableRoute(graph, s));
    // A one-seat example starting at rest goes straight to its alternate pose, without a redundant trip to READY.
    if (r.steps[1]?.to !== 'IDLE' && steps[0]?.from === 'IDLE' && steps[0].to === 'READY' && !steps[0].take
      && steps[1]?.from === 'READY' && steps[1].to === 'IDLE' && !steps[1].take) steps.splice(0, 2);
    return { ...r, ...fromSteps(r.key, r.name, steps) };
  }) : rounds;
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

// ── The builder: a round as a path through the nodes ────────────────────────
// Jakob 2026-11-17, of the three presets: "varför ska man inte få lägga in egna vägar utifrån vilka noder som finns". A
// round is built one node at a time. What can follow a node is every node the model has a step to (parseEdge); whether
// that step plays is what the round player does with it (resolveRound on the step alone): a take of its own, a seat's
// second card on the seat's first-card film (seat mode, "platsens film"), a step from A2.2 on the takes made from that pose.
// Nothing else stands in: the game's own stand-ins (src/game-director.ts: Paow's hole card dealt with DC1's film, a card
// laid without a hand) are the game's, not the round player's, and a step without a film plays as a gap card.

/** A path being built: the node it starts on (head, also before its first step) and its steps. */
export type Path = { head: string | null; steps: Step[] };
export const EMPTY_PATH: Path = { head: null, steps: [] };

/** The node a path ends on: its last step's end, else the node it starts on; null for an empty path. */
export const lastNode = (path: Path): string | null => path.steps.at(-1)?.to ?? path.head;

/** The path a round's steps make (empty for a reference film or a round without steps). */
export const pathOf = (round: Round | null): Path => (isReference(round) || !round?.steps.length ? EMPTY_PATH : { head: round.steps[0].from, steps: round.steps });

/** The path with one node more: a step from its last node to `node`, or `node` as the start of an empty path. */
export function addNode(path: Path, node: string): Path {
  const last = lastNode(path);
  return last ? { head: path.head ?? last, steps: [...path.steps, { from: last, to: node }] } : { head: node, steps: [] };
}

/** The path without its last step; a path of only its start becomes empty. */
export const undoStep = (path: Path): Path => (path.steps.length ? { head: path.head, steps: path.steps.slice(0, -1) } : EMPTY_PATH);

export const samePath = (a: Path, b: Path): boolean => a.head === b.head && stepKey(a.steps) === stepKey(b.steps);

/** A path's nodes for its chips: each with the step that ends on it (null where a chain starts) and whether a new chain starts there ("|"). */
export type PathNode = { node: string; step: number | null; broken: boolean };
export function pathNodes(path: Path): PathNode[] {
  if (!path.steps.length) return path.head ? [{ node: path.head, step: null, broken: false }] : [];
  const out: PathNode[] = [];
  path.steps.forEach((s, step) => {
    if (s.from !== out.at(-1)?.node) out.push({ node: s.from, step: null, broken: out.length > 0 });
    out.push({ node: s.to, step, broken: false });
  });
  return out;
}

/** A path in his notation, as the field shows it: "A1 - A2.1 - P4C1"; "A1" for a path that has only its start. */
export const pathText = (path: Path): string => (path.steps.length ? formatJakob(path.steps) : path.head ? nodeCode(path.head) : "");

/** Anchor 2.2 (READY-B, the hand flat over the card in the shoe): his anchor, offered whether or not the bank has a film from it yet. */
const ANCHOR_22 = "READY-B";

/** The poses at the shoe: A2.1, A2.2 and any other the bank has films from. */
const shoePoses = (graph: Pick<Graph, "edges"> | null): string[] => ["READY", ...new Set([ANCHOR_22, ...(graph?.edges ?? []).flatMap((e) => e.hubVariants)].sort())];

/** The anchors in the order "Nästa steg" shows them: the poses at the shoe first (where a step from rest goes), then A1, DC2 upp, Borta. */
const roundAnchors = (graph: Pick<Graph, "edges"> | null): string[] => [...shoePoses(graph), "IDLE", REVEAL_NODE, AWAY];

/** Every node a round can pass: the anchors, then the 16 card places and the dealer's third card. The experiments' own poses are not his notation. */
export const roundNodes = (graph: Pick<Graph, "edges"> | null): string[] => [...roundAnchors(graph), ...CARDS, ...OPTIONAL_TARGETS];

/** Where a round can start: at rest, at the shoe or away (DC2 upp is rest after the turn, reached from A1). */
export const startNodes = (graph: Pick<Graph, "edges"> | null): string[] => ["IDLE", ...shoePoses(graph), AWAY];

/** The nodes the model has a step to from `from`, films or not. The hole card is turned once: after DC2 upp comes what follows rest. */
export const followers = (graph: Pick<Graph, "edges"> | null, from: string): string[] =>
  roundNodes(graph).filter((to) => !(from === REVEAL_NODE && to === REVEAL_NODE) && !!parseEdge(`${from}>${to}`));

/**
 * A node that can follow: the step to it and whether it plays. plays: the round player has a film for it, and take and why
 * (WHY_LABEL) say which and why; otherwise gap says why not (NO_FILM).
 */
export type NextStep = { node: string; step: Step; route: Step[]; via: string | null; plays: boolean; gap: Gap | null; take: Take | null; why: Why };

/** The game's established alternate pose and return via rest, shown as real steps instead of a misleading missing film. */
export function playableRoute(graph: Graph, step: Step): Step[] {
  const direct = resolveRound(graph, [step], { holeCardDown: true })[0];
  const edge = parseEdge(`${step.from}>${step.to}`);
  if (step.take || !edge?.target) return [step];
  const hub = dealPose(graph.dealer, edge.target);
  const approved = (segments: Segment[]) => segments.every((s) => s.video && !s.gap && s.take && ['godkand', 'variant'].includes(verdictOf(s.take).verdict));
  const chain = hub !== 'READY' ? hubChain(graph, hub, edge.target) : null;
  // A return made after a different deal cannot replace the return from the established alternate pose.
  const alternateReturn = edge.kind === 'RETURN' && step.to !== hub && chain && approved(chain);
  if (!alternateReturn && direct?.video && !direct.gap) return [step];
  let route: Step[] | null = null;
  if (edge.kind === 'DEAL' && step.from === 'READY' && hub !== 'READY') {
    if (chain && approved(chain)) route = [{from: 'READY', to: 'IDLE'}, {from: 'IDLE', to: hub}, {from: hub, to: step.to}];
  } else if (edge.kind === 'RETURN' && step.to === 'IDLE') {
    route = [{from: step.from, to: hub}, {from: hub, to: 'IDLE'}];
  } else if (edge.kind === 'RETURN' && step.to === 'READY' && hub !== 'READY') {
    route = [{from: step.from, to: hub}, {from: hub, to: 'IDLE'}, {from: 'IDLE', to: 'READY'}];
  }
  return route && approved(resolveRound(graph, route, {holeCardDown: true})) ? route : [step];
}

export function nextSteps(graph: Graph, from: string): NextStep[] {
  return followers(graph, from).map((to) => {
    const step = { from, to };
    const route = playableRoute(graph, step), segments = resolveRound(graph, route, { holeCardDown: true });
    const seg = segments.at(-1)!, plays = segments.every((s) => !!s.take && !s.gap);
    const shown = segments.find((s) => s.kind === 'DEAL') ?? segments[0];
    const via = route.length > 1 ? (shown.kind === 'DEAL' ? shown.from : route[0].to) : null;
    return { node: to, step, route, via, plays, gap: plays ? null : (seg.gap ?? "MISSING"), take: plays ? shown.take : null, why: shown.why };
  });
}

/** Why a step has no film, in a few words. */
export const NO_FILM: Record<Gap, string> = {
  INVALID: "inget steg i banken",
  MISSING: "ingen film",
  WAITING: "ingen film än, den är inte klar",
  REJECTED: "ingen film, bara underkända",
  LOCAL_ONLY: "filmen finns bara lokalt",
};

/** Per step of a path, why the round player has no film for it (null where it has one), as the stage would play the path. */
export function stepGaps(graph: Graph, steps: readonly Step[]): (Gap | null)[] {
  return resolveRound(graph, [...steps], { holeCardDown: true }).map((s) => (s.take && !s.gap ? null : (s.gap ?? "MISSING")));
}

/** The steps without a film, one line each: "Steg 4, P4C1 → A1: ingen film". */
export const pathProblems = (steps: readonly Step[], gaps: readonly (Gap | null)[]): string[] =>
  steps.flatMap((s, i) => (gaps[i] ? [`Steg ${i + 1}, ${edgeName(s)}: ${NO_FILM[gaps[i]!]}`] : []));

/** A card place (P4.C1, D.C3) rather than an anchor. */
export const isCard = (node: string): boolean => /^(?:P[1-7]|D)\.C[1-3]$/.test(node);

const STEP_WORD: Record<EdgeKind, string> = { DEAL: "giv", RETURN: "retur", ENTRY: "ingång", IDLE: "vila", REVEAL: "vändning", ARRIVE: "hon kommer", LEAVE: "hon går" };
/** What a step's film does, in one word of the studio's glossary: ingång, giv, retur, utgång, vila, vändning, hon kommer, hon går. */
export function stepWord(step: Step): string {
  const ref = parseEdge(`${step.from}>${step.to}`);
  if (!ref) return "";
  return ref.kind === "RETURN" && !ref.target ? "utgång" : STEP_WORD[ref.kind];
}

const fold = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
/** The node a word names in his notation ("A1", "a2.1 nyp", "P4C1", "DC2 upp", "Borta") or the lab's ("IDLE", "P4.C1", "VILA"), or null. */
export function nodeOf(word: string, graph: Pick<Graph, "edges"> | null = null): string | null {
  const nodes = roundNodes(graph);
  const want = fold(word);
  const named = nodes.find((n) => fold(nodeCode(n)) === want || fold(nodeName(n)) === want);
  if (named) return named;
  const parsed = parseNode(word);
  return parsed && nodes.includes(parsed) ? parsed : null;
}

const orList = (words: readonly string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} eller ${words.at(-1)}`);

/** What can follow a node, in a few words: "A2.1, A2.2, A1, DC2 upp eller Borta"; the cards as one ("ett kort eller A1"). */
export function followWords(graph: Pick<Graph, "edges"> | null, from: string): string {
  const next = followers(graph, from);
  const cards = new Set<string>([...CARDS, ...OPTIONAL_TARGETS]);
  const anchors = next.filter((n) => !cards.has(n)).map(nodeCode);
  return orList(next.some((n) => cards.has(n)) ? ["ett kort", ...anchors] : anchors);
}

/**
 * What he typed, as a path: the steps of his notation, one node alone as the start, or the first thing that could not be
 * read, in one line. Two neighbours with no step between them also say what can follow the first:
 * "A1 → P4C1 går inte: efter A1 kommer A2.1, A2.2, A1, DC2 upp eller Borta."
 */
export function readPath(text: string, graph: Pick<Graph, "edges"> | null = null): { path: Path | null; error: string | null } {
  const source = text.trim();
  if (!source) return { path: EMPTY_PATH, error: null };
  const lone = nodeOf(source, graph);
  if (lone) return { path: { head: lone, steps: [] }, error: null };
  const { steps, errors } = parseJakob(source);
  if (!errors.length && steps.length) return { path: { head: steps[0].from, steps }, error: null };
  const first = errors[0] ?? "Kunde inte läsa rundan.";
  const pair = /^(.+) → (.+) är ingen film\.$/.exec(first);
  const from = pair ? nodeOf(pair[1], graph) : null;
  if (!pair || !from) return { path: null, error: first };
  return { path: null, error: `${pair[1]} → ${pair[2]} går inte: efter ${pair[1]} kommer ${followWords(graph, from)}.` };
}

/** The round a built path plays: a ready-made one when the steps are its steps, else his own ("Egen runda"). */
export const ownRound = (steps: readonly Step[], rounds: readonly Round[] = readyRounds()): Round => matchReady(steps, rounds) ?? fromSteps("egen", "Egen runda", [...steps]);

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

/** The view a round can be shown in: a reference only as the film it is (Råfilm); anything else as asked. */
export const viewFor = (round: Round | null, asked: View): View => (isReference(round) ? "platt" : asked);

/** Why 3D cannot be chosen for this round, in a few words for the control; null when it can. */
export const no3d = (round: Round | null): string | null => (isReference(round) ? "En färdig film spelas som den är: i 3D-scenen skulle den keyas och projiceras." : null);

// ── A take in its context ───────────────────────────────────────────────────
/**
 * The steps that play one take where it belongs: a deal with the return
 * that continues it (back to A2.1 when one fits there, else to A1; the bank's own rule picks which), a return after the deal
 * it continues (the main deal when that one fits, else the newest that does), anything else on its own. The take is locked.
 */
export function contextSteps(graph: Graph, edgeId: string, takeId: string | null): { steps: Step[]; error: string | null } {
  const take: Take | null = takeId ? (graph.takes[takeId] ?? null) : null;
  const edge = graph.edge[edgeId] ?? graph.edge[parseEdge(edgeId)?.base ?? ""] ?? (take ? graph.edge[take.edge] : undefined);
  if (!edge) return { steps: [], error: `Kanten ”${edgeId}” finns inte i klippbanken.` };
  if (takeId && !take) return { steps: [], error: `Tagningen ”${takeId}” finns inte i klippbanken.` };
  if (take && !playable(take)) return { steps: [], error: `${takeName(take)} på ${edgeName(edge)} kan inte spelas (${take.archived ? "arkiverad: ta tillbaka den i Karta" : "underkänd eller inte klar"}).` };
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
// &vy=platt starts in Råfilm.
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
 * Each card's centre in film pixels from Jakob's placement plan, as resolveRound takes it: a seat's second card then gets its shift from the first card's film. null without a plan.
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
