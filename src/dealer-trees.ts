// The dealer's named trees (data/dealer-trees.json) as Jakob reads them: a tree's nodes (A1, its anchors at the shoe, an
// A3 per player and card) and its 36 steps against his measure (Jakob 2026-11-21: "en giv per kort för respektive
// spelare"), each with its state, and the one number per tree ("Casino 22/36"). Pure: no file system, no DOM, no network.
// The lab server places the films in the trees (tools/dealer-tree.ts, GET /api/trees) and calls treeView; the studio draws
// the answer (Karta) and counts with treeCount (the rail); the game plays one tree with cutBank (?trad=<id>, src/game-page.ts),
// and without a tree word plays the trees that are spelas (gameBank: one such tree exactly as ?trad=, the others left out).
// Tests: studio/tests/dealer-trees.test.ts.
//
// The camera is one more dimension of a tree (Jakob 2026-11-23: Karta starts on "standard-plats 4-kameran" and "ett reglage"
// changes to camera 1–7). A camera is the seat a picture is seen from: an anchor's seat in the register, and seat 4's, the
// straight one, where it has none. The tree as the game plays it, its number and its cut are the straight camera's; what is
// made from another seat is kept in the tree as that camera's (TreeView cameras, cameraView) and never played as a straight film.
//
// The measure, per tree, with the tree's anchor at the shoe (its first A2.x anchor; A2.1 when it has none):
//   vila A1 → A1 · ingång A1 → A2.x · 16 givar A2.x → A3 (P1–P7 kort 1 och 2, dealerns DC1 och DC2) · 16 returer A3 → A2.x
//   · utgång A2.x → A1 · hålkortet A1 → DC2 upp.
// The return A3 → A1 is not counted: a round goes back to the shoe and leaves by the exit. DC3, Borta and the seats' side
// cameras are not counted. A tree's other A2.x anchors stand in for a step its own anchor lacks (Casino gives P6C1 from A2.2).
//
// A step's state: finns (a film Primär, Godkänd or Variant, his or given for him), prov (a film delivered and not yet judged,
// or an order delivered that is not in the bank yet), saknas (nothing, or only films judged Inte bra). Verdicts and Primär
// are read, never set. The film a step shows among several approved is the one the game plays there in the tree (gameFilm).
import { REVEAL_NODE, buildGraph, dealHub, parseEdge, resolveRound, type BankData, type Graph, type Segment } from './clip-graph.ts';
import { SEAT_HUB, hubChain, judgedBank } from './game-director.ts';

// ── The register ────────────────────────────────────────────────────────────
export type TreeState = 'spelas' | 'byggs' | 'vilar';
export type TreeAnchor = { entry: string; seat?: number };
export type TreeDef = { id: string; name: string; state: TreeState; root: string; anchors: TreeAnchor[]; shares?: string; opening?: string; note?: string };
export type TreeRegister = { schemaVersion: 1; about: string; dealers: Record<string, { trees: TreeDef[] }> };
/** A picture of Material (data/media-roles.json) as far as a tree needs it. */
export type TreeEntry = { id: string; role: string; node?: string; card?: string; state?: string; builtOn?: string[]; name?: string };

// ── The camera ──────────────────────────────────────────────────────────────
/** The camera the game is filmed from, seat 4's: an anchor without a seat is seen from it. */
export const STRAIGHT_CAMERA = 4;
export const CAMERAS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
/** The camera an anchor's picture is seen from. */
export const cameraOf = (a: Pick<TreeAnchor, 'seat'> | undefined): number => a?.seat ?? STRAIGHT_CAMERA;
/** The camera of an address (?kamera=2): 1–7, else the straight one. */
export const cameraFromWord = (word: string | null | undefined): number => (word && /^[1-7]$/.test(word) ? Number(word) : STRAIGHT_CAMERA);
/**
 * The camera a picture of a tree is seen from: its anchor's; a picture made from the tree's anchors (a landing, builtOn) the
 * seat of the first of them that has one; else the straight camera.
 */
export function pictureCamera(tree: Pick<TreeDef, 'anchors'>, picture: Pick<TreeEntry, 'id' | 'builtOn'>): number {
  const anchor = (id: string) => tree.anchors.find((a) => a.entry === id);
  const own = anchor(picture.id);
  if (own) return cameraOf(own);
  return (picture.builtOn ?? []).map((b) => cameraOf(anchor(b))).find((c) => c !== STRAIGHT_CAMERA) ?? STRAIGHT_CAMERA;
}
/** The camera a film of a tree is seen from, by the pictures it stands on: a seat's when one of them is, else the straight one. */
export const filmCamera = (tree: Pick<TreeDef, 'anchors'>, pictures: readonly Pick<TreeEntry, 'id' | 'builtOn'>[]): number =>
  pictures.map((p) => pictureCamera(tree, p)).find((c) => c !== STRAIGHT_CAMERA) ?? STRAIGHT_CAMERA;
/** Seen from another seat than the straight camera's: kept in its tree, not played by the game. */
const fromSeat = (x: { seat?: number }): boolean => x.seat !== undefined && x.seat !== STRAIGHT_CAMERA;

// ── His notation ────────────────────────────────────────────────────────────
const CARD = /^(P[1-7]|D)\.C[1-3]$/;
export const isCard = (node: string): boolean => CARD.test(node);
const HUBS = new Set(['IDLE', 'READY', 'READY-B', 'READY-C']);
export const isAnchorAtShoe = (node: string): boolean => node === 'READY' || node === 'READY-B' || node === 'READY-C';
// The same short codes as the studio's words (studio/lib/words.ts ANCHOR_WORDS, studio/lib/names.ts nodeCode).
const CODE: Record<string, string> = { IDLE: 'A1', READY: 'A2.1', 'READY-B': 'A2.2', 'READY-C': 'A2.3', AWAY: 'Borta', [REVEAL_NODE]: 'DC2 upp' };
/** A node as he writes it: A1, A2.1, A2.3, A3P4C1, A3DC1, Borta, DC2 upp; seen from a seat, S2-A2.2. */
export const nodeCode = (node: string, seat?: number): string => `${seat ? `S${seat}-` : ''}${CODE[node] ?? (isCard(node) ? `A3${node.replace('.', '')}` : node)}`;
/** A step in his words: "A2.3 → A3P4C2". */
export const stepName = (from: string, to: string): string => `${nodeCode(from)} → ${nodeCode(to)}`;
/** The take's two nodes, with the anchor variant the graph stores under READY put back (take.hub). */
export function nodesOf(edge: string, hub?: string | null): [string, string] {
  const cut = edge.indexOf('>'), [from, to] = cut < 0 ? [edge, edge] : [edge.slice(0, cut), edge.slice(cut + 1)];
  return [hub && from === 'READY' ? hub : from, hub && to === 'READY' ? hub : to];
}
/** The node a picture of Material stands for: a landing is its card's node, an anchor its pose's. */
export const levelOf = (e: Pick<TreeEntry, 'role' | 'node' | 'card'>): string | null => (e.role === 'landning' ? (e.card ?? null) : (e.node ?? null));
export const isTreeHub = (node: string): boolean => HUBS.has(node);

// ── The measure ─────────────────────────────────────────────────────────────
export const SEAT_CARDS: readonly string[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].flatMap((p) => [`${p}.C1`, `${p}.C2`]);
/** The cards a round deals: every player's two and the dealer's two (DC3 is not counted). */
export const MEASURE_CARDS: readonly string[] = [...SEAT_CARDS, 'D.C1', 'D.C2'];
export const MEASURE_SIZE = 36;
export type StepKind = 'vila' | 'ingang' | 'giv' | 'retur' | 'utgang' | 'halkort';
/**
 * One step of the measure. id: in the tree's own nodes ("READY-C>P4.C1"); edge: the graph's edge, where an anchor variant
 * at the shoe is a take of A2.1's edge ("READY>P4.C1", src/clip-graph.ts parseEdge base); card: the card it carries.
 */
export type MeasureStep = { id: string; from: string; to: string; kind: StepKind; card: string | null; edge: string };
const measureStep = (from: string, to: string, kind: StepKind, card: string | null = null): MeasureStep => {
  const id = `${from}>${to}`;
  return { id, from, to, kind, card, edge: parseEdge(id)?.base ?? id };
};
/** The 36 steps with `hub` as the anchor at the shoe, in the order a round meets them. */
export function measure(hub: string): MeasureStep[] {
  return [
    measureStep('IDLE', 'IDLE', 'vila'),
    measureStep('IDLE', hub, 'ingang'),
    ...MEASURE_CARDS.map((c) => measureStep(hub, c, 'giv', c)),
    ...MEASURE_CARDS.map((c) => measureStep(c, hub, 'retur', c)),
    measureStep(hub, 'IDLE', 'utgang'),
    measureStep('IDLE', REVEAL_NODE, 'halkort', 'D.C2'),
  ];
}

// ── The tree's nodes ────────────────────────────────────────────────────────
/** The tree whose anchors and films a tree plays: the one it shares (Ingången plays the Casino's), else itself. */
export const homeOf = (tree: TreeDef, trees: readonly TreeDef[]): TreeDef => (tree.shares ? (trees.find((t) => t.id === tree.shares) ?? tree) : tree);

/** The tree's levels from one camera: each node its anchors seen from there stand for, with the first anchor given for it. */
function levels(tree: TreeDef, entries: ReadonlyMap<string, TreeEntry>, camera = STRAIGHT_CAMERA): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of tree.anchors) {
    if (cameraOf(a) !== camera) continue;
    const e = entries.get(a.entry), n = e ? levelOf(e) : null;
    if (n && !out.has(n)) out.set(n, a.entry);
  }
  return out;
}

/**
 * The anchor at the shoe the tree is measured with (its first A2.x anchor, else A2.1), and its other A2.x anchors. From another
 * camera the tree is measured the same way, so that it is the same tree: an A2.x that only that seat has is one more of the others.
 */
export function treeHubs(tree: TreeDef, entries: ReadonlyMap<string, TreeEntry>, camera = STRAIGHT_CAMERA): { hub: string; others: string[] } {
  const shoe = [...levels(tree, entries).keys()].filter(isAnchorAtShoe), hub = shoe[0] ?? 'READY', others = shoe.slice(1);
  if (camera === STRAIGHT_CAMERA) return { hub, others };
  return { hub, others: [...others, ...[...levels(tree, entries, camera).keys()].filter((n) => isAnchorAtShoe(n) && n !== hub && !others.includes(n))] };
}

export type NodeRole = 'vila' | 'skon' | 'kort' | 'halkort';
/** A node of the drawn tree: its picture's entry in Material (null: no picture), and that picture's state there. */
export type TreeNode = { node: string; code: string; role: NodeRole; entry: string | null; state: string | null };

/**
 * A card's picture in the tree from one camera: the tree's own A3 for the card, else a landing in Material made from the tree's
 * anchors seen from there (builtOn names only them) that is neither replaced nor archived. Null: the card has no such picture.
 */
function cardPicture(tree: TreeDef, at: Map<string, string>, entries: ReadonlyMap<string, TreeEntry>, card: string, camera: number): string | null {
  const own = at.get(card);
  if (own) return own;
  const ids = new Set(tree.anchors.filter((a) => cameraOf(a) === camera).map((a) => a.entry));
  for (const e of entries.values()) {
    if (e.role !== 'landning' || e.card !== card || e.state === 'ersatt' || e.state === 'arkiverad') continue;
    if (e.builtOn?.length && e.builtOn.every((b) => ids.has(b))) return e.id;
  }
  return null;
}

/**
 * The tree's nodes: A1, its anchors at the shoe, the 16 cards of the measure and the hole card turned up. camera: the seat they
 * are seen from; the same nodes, each with the picture the tree has from there (null: none).
 */
export function treeNodes(tree: TreeDef, entries: ReadonlyMap<string, TreeEntry>, camera = STRAIGHT_CAMERA): TreeNode[] {
  const at = levels(tree, entries, camera), { hub, others } = treeHubs(tree, entries, camera);
  const node = (n: string, role: NodeRole, entry: string | null): TreeNode => ({ node: n, code: nodeCode(n), role, entry, state: entry ? (entries.get(entry)?.state ?? null) : null });
  const root = entries.has(tree.root) && cameraOf(tree.anchors.find((a) => a.entry === tree.root)) === camera ? tree.root : null;
  return [
    node('IDLE', 'vila', at.get('IDLE') ?? root),
    node(hub, 'skon', at.get(hub) ?? null),
    ...others.map((o) => node(o, 'skon', at.get(o) ?? null)),
    ...MEASURE_CARDS.map((c) => node(c, 'kort', cardPicture(tree, at, entries, c, camera))),
    node(REVEAL_NODE, 'halkort', null),
  ];
}

// ── The steps' state ────────────────────────────────────────────────────────
/** The five verdicts as studio/lib/verdict.ts verdictOf says them (a failed take counts as underkand here). */
export type Verdict = 'primar' | 'godkand' | 'variant' | 'vantar' | 'underkand';
export const GOOD: readonly Verdict[] = ['primar', 'godkand', 'variant'];
const RANK: Record<Verdict, number> = { primar: 4, godkand: 3, variant: 2, vantar: 1, underkand: 0 };
/**
 * A take of the bank: the tree it is placed in (null: none), its two nodes with the anchor variant put back, its verdict.
 * seat: the camera it is seen from when not the straight one (filmCamera).
 */
export type TreeTake = { id: string; tree: string | null; from: string; to: string; verdict: Verdict; byJakob: boolean; provisional: boolean; archived?: boolean; seat?: number };
/** An order delivered that is not in the bank yet: the tree its pictures place it in, its step, and its camera as a take's. */
export type Delivery = { order: string; tree: string | null; from: string; to: string; title?: string; seat?: number };
export type StepState = 'finns' | 'prov' | 'saknas';
export const STEP_STATES: readonly StepState[] = ['finns', 'prov', 'saknas'];
/**
 * A step of a tree: the film it shows (take, its verdict and whose word), via: the other anchor at the shoe it is
 * given from when not the tree's own, takes: the tree's films on the step (archived left out), ids: those films and its
 * stand-ins' (what Karta's films panel lists), the shown one first, deliveries: orders delivered for it that are not in the bank.
 * The shown film is the one the game plays on the step in the tree (gameFilm), so a return is the one that continues the
 * deal shown for its card; where the game plays none of the step's approved films, its best by verdict, the tree's own
 * before a stand-in's, and with none approved the tree's first film that waits for his verdict.
 */
export type TreeStep = MeasureStep & { name: string; state: StepState; take: string | null; verdict: Verdict | null; byJakob: boolean; provisional: boolean; via: string | null; takes: number; ids: string[]; deliveries: string[] };

// ── The film a step shows: the game's own choice ────────────────────────────
/**
 * The takes of a tree's cut (TreeCut own and drop): those placed in the tree whose films it plays, and those placed in another
 * tree of the dealer. A take seen from another seat is dropped also in its own tree: the game plays the straight camera.
 */
export function cutTakes(home: string, takes: readonly Pick<TreeTake, 'id' | 'tree' | 'seat'>[]): { own: string[]; drop: string[] } {
  return { own: takes.filter((t) => t.tree === home && !fromSeat(t)).map((t) => t.id), drop: takes.filter((t) => t.tree !== null && (t.tree !== home || fromSeat(t))).map((t) => t.id) };
}
/** The game's graph of one tree: the bank cut as ?trad=<id> cuts it (cutBank) and judged as the game reads it (judgedBank; src/game-page.ts). */
export function treeGame(bank: BankData, dealer: string, cut: { hub: string; own: string[]; drop: string[] }): Graph {
  return buildGraph(judgedBank(cutBank(bank, cut)), { dealer });
}
/** A node of the tree as the game's graph of the tree names it (cutBank): the tree's anchor at the shoe is the game's shoe. */
const inGame = (hub: string, node: string): string => (hub === 'READY' ? node : node === hub ? 'READY' : node === 'READY' ? hub : node);
/**
 * The film the game plays on a step of a tree's measure, by the game's own choice (resolveRound on treeGame's graph); null: none,
 * or the seat's film played for a second card. A card's deal and its return are resolved as one chain, as the game plays them, so
 * the return is the one that follows the deal; from the pose at the shoe the game deals the card from (its SEAT_HUB pose when
 * that pose's four films play, hubChain; else the shoe). dealt: the film the deal step shows and where it is given from; the
 * chain is then that deal's, named to the game, so the return follows the deal shown also where the game deals another.
 */
function gameFilm(game: Graph, hub: string, m: MeasureStep, dealt: { take: string; via: string | null } | null = null): string | null {
  const own = (s: Segment | undefined) => (s?.take && s.film === s.edge ? s.take.id : null);
  if (m.kind !== 'giv' && m.kind !== 'retur') return own(resolveRound(game, [{ from: inGame(hub, m.from), to: inGame(hub, m.to) }])[0]);
  const card = m.card!, seat = dealHub(card, SEAT_HUB[game.dealer]);
  const pose = dealt ? (dealt.via ? inGame(hub, dealt.via) : 'READY') : seat !== 'READY' && hubChain(game, seat, card) ? seat : 'READY';
  const chain = resolveRound(game, [{ from: pose, to: card, ...(dealt ? { take: dealt.take } : {}) }, { from: card, to: pose }]);
  return own(chain[m.kind === 'giv' ? 0 : 1]);
}

/**
 * The steps of the measure for a tree's films (its own, already placed in it), with `others` standing in for `hub`.
 * game: the game's graph of the tree (treeGame); with it each step shows the film the game plays there (TreeStep).
 */
export function treeSteps(hub: string, others: readonly string[], takes: readonly TreeTake[], deliveries: readonly Delivery[] = [], game: Graph | null = null): TreeStep[] {
  const live = takes.filter((t) => !t.archived);
  const dealt = new Map<string, { take: string; via: string | null }>(); // by card: the film its deal step shows (the deals come first in the measure)
  return measure(hub).map((m) => {
    const own = live.filter((t) => t.from === m.from && t.to === m.to);
    const stand = m.from === hub || m.to === hub
      ? others.flatMap((o) => live.filter((t) => t.from === (m.from === hub ? o : m.from) && t.to === (m.to === hub ? o : m.to)).map((t) => ({ t, via: o })))
      : [];
    const ranked = [...own.map((t) => ({ t, via: null as string | null })), ...stand].sort((a, b) => RANK[b.t.verdict] - RANK[a.t.verdict] || Number(!!a.via) - Number(!!b.via));
    const approved = ranked.filter((x) => GOOD.includes(x.t.verdict));
    const played = game && approved.length > 1 ? gameFilm(game, hub, m, m.kind === 'retur' ? dealt.get(m.card!) : null) : null;
    const good = approved.find((x) => x.t.id === played) ?? approved[0] ?? null;
    const sent = deliveries.filter((d) => d.from === m.from && d.to === m.to).map((d) => d.order);
    const waiting = own.find((t) => t.verdict === 'vantar') ?? null;
    const shown = good ?? (waiting ? { t: waiting, via: null } : null);
    const state: StepState = good ? 'finns' : waiting || sent.length ? 'prov' : 'saknas';
    if (m.kind === 'giv' && shown) dealt.set(m.card!, { take: shown.t.id, via: shown.via });
    const ids = [...(shown ? [shown.t.id] : []), ...ranked.filter((x) => x.t !== shown?.t).map((x) => x.t.id)];
    return { ...m, name: stepName(m.from, m.to), state, take: shown?.t.id ?? null, verdict: shown?.t.verdict ?? null, byJakob: !!shown?.t.byJakob, provisional: !!shown?.t.provisional, via: shown?.via ?? null, takes: own.length, ids, deliveries: sent };
  });
}

// ── The number ──────────────────────────────────────────────────────────────
/** A tree's number: the steps of the measure that have a film (finns) of all 36. The one count Karta, the rail and the queue should show. */
export type TreeCount = { have: number; total: number };
export function treeCount(steps: readonly Pick<TreeStep, 'state'>[]): TreeCount {
  return { have: steps.filter((s) => s.state === 'finns').length, total: steps.length };
}
/** "22/36". */
export const countWord = (c: TreeCount): string => `${c.have}/${c.total}`;

// ── One tree as the view draws it ───────────────────────────────────────────
/** What an order of a step has and lacks, as the lab server reads it (tools/dealer-tree.ts orderFacts). */
export type Need = { ok: boolean; what: string };
export type OrderFacts = {
  /** The step's key in Beställ (src/order-model.ts STEPS), null where none is written (A2.3 → A1). */
  step: string | null;
  first: Need;
  last: Need;
  reference: Need;
  recipe: Need & { status: string | null };
  /** Estimated credits for the recipe's takes at the price table's worst case, null where no recipe or price says it. */
  price: number | null;
  /** The command that makes a draft of the step (tools/order-new.ts); shown, never run by the view. */
  command: string;
};
/** The command for a draft of a step, in his names: node tools/order-new.ts paow "A2.3 - A3P4C2". */
export const orderCommand = (dealer: string, from: string, to: string): string => `node tools/order-new.ts ${dealer} "${nodeCode(from)} - ${nodeCode(to)}"`;
export type ViewStep = TreeStep & { order?: OrderFacts };
/** A tree from another seat than the straight camera's: what is made from there, in the tree's own shape (cameraView). */
export type CameraView = { seat: number; others: string[]; nodes: TreeNode[]; steps: ViewStep[]; count: TreeCount };
export type TreeView = {
  dealer: string;
  tree: TreeDef;
  /** The tree whose anchors and films it plays (itself, or the one it shares). */
  home: string;
  hub: string;
  others: string[];
  nodes: TreeNode[];
  steps: ViewStep[];
  count: TreeCount;
  /** The seats, other than the straight camera's, the tree has an anchor, a film or a delivery from. Left out where it has none. */
  cameras?: CameraView[];
};

/**
 * One tree with its nodes, steps and number, from the films placed in the trees and the orders delivered outside the bank.
 * bank: the bank the game reads (GET /api/clip-bank); with it each step shows the film the game plays in the tree (TreeStep).
 * Nodes, steps and number are the straight camera's; what is seen from another seat stands in cameras.
 */
export function treeView(dealer: string, tree: TreeDef, trees: readonly TreeDef[], entries: ReadonlyMap<string, TreeEntry>, takes: readonly TreeTake[], deliveries: readonly Delivery[] = [], bank: BankData | null = null): TreeView {
  const home = homeOf(tree, trees), { hub, others } = treeHubs(home, entries);
  const game = bank ? treeGame(bank, dealer, { hub, ...cutTakes(home.id, takes) }) : null;
  const mine = takes.filter((t) => t.tree === home.id), sent = deliveries.filter((d) => d.tree === home.id);
  const from = (camera: number) => (x: { seat?: number }) => (x.seat ?? STRAIGHT_CAMERA) === camera;
  const steps = treeSteps(hub, others, mine.filter(from(STRAIGHT_CAMERA)), sent.filter(from(STRAIGHT_CAMERA)), game);
  const seats = [...new Set([...home.anchors.map(cameraOf), ...[...mine, ...sent].map((x) => x.seat ?? STRAIGHT_CAMERA)])].filter((c) => c !== STRAIGHT_CAMERA).sort((a, b) => a - b);
  const cameras = seats.map((seat): CameraView => {
    const shoe = treeHubs(home, entries, seat), made = treeSteps(shoe.hub, shoe.others, mine.filter(from(seat)), sent.filter(from(seat)));
    return { seat, others: shoe.others, nodes: treeNodes(home, entries, seat), steps: made, count: treeCount(made) };
  });
  return { dealer, tree, home: home.id, hub, others, nodes: treeNodes(home, entries), steps, count: treeCount(steps), ...(cameras.length ? { cameras } : {}) };
}

/**
 * The tree as one camera sees it, in the shape Karta draws: the straight camera's is the view itself; another seat's is what is
 * made from that seat, and where nothing is made the same tree with no picture and no film.
 */
export function cameraView(view: TreeView, camera: number): TreeView {
  if (camera === STRAIGHT_CAMERA) return view;
  const made = view.cameras?.find((c) => c.seat === camera);
  if (made) return { ...view, others: made.others, nodes: made.nodes, steps: made.steps, count: made.count };
  const steps = treeSteps(view.hub, view.others, []);
  return { ...view, nodes: view.nodes.map((n) => ({ ...n, entry: null, state: null })), steps, count: treeCount(steps) };
}
/** What a camera has of a tree: its pictures, its steps with a film, those that wait, and its first picture (null: none). */
export function cameraMade(view: TreeView, camera: number): { pictures: number; films: number; waiting: number; first: string | null } {
  const v = cameraView(view, camera), pictures = [...new Set(v.nodes.flatMap((n) => (n.entry ? [n.entry] : [])))];
  return { pictures: pictures.length, films: v.count.have, waiting: v.steps.filter((s) => s.state === 'prov').length, first: pictures[0] ?? null };
}

/** The tree a view opens on when none is asked for: the first the game plays (not one that shares another), else the first. */
export function defaultTree<T extends Pick<TreeDef, 'id' | 'state' | 'shares'>>(trees: readonly T[]): T | null {
  return trees.find((t) => t.state === 'spelas' && !t.shares) ?? trees[0] ?? null;
}

/** GET /api/trees?dealer=<id>: every tree of the dealer, drawn. */
export type TreeAnswer = { schemaVersion: 1; dealer: string; made: string; trees: TreeView[] };

// ── One tree in the game (?trad=<id>) ───────────────────────────────────────
/**
 * GET /api/trees?dealer=<id>&trad=<tree>: what the game needs to play one tree (tools/dealer-tree.ts treeCut). home: the tree
 * whose films it plays; hub: that tree's anchor at the shoe; count: its number (as Karta shows it); own: the takes placed in
 * home; drop: the takes placed in another tree of the dealer. A take placed in no tree (Borta, an older attempt) is in neither.
 */
export type TreeCut = { schemaVersion: 1; dealer: string; tree: string; name: string; home: string; hub: string; count: TreeCount; own: string[]; drop: string[] };
/** A tree's id as the address and the lab server take it (?trad=<id>). */
export const TREE_ID = /^[a-z0-9-]{1,40}$/;

type CutTake = { id?: unknown; from?: unknown; to?: unknown };
type CutBank = { jobs?: CutTake[]; derived?: CutTake[]; edits?: CutTake[] };
/**
 * The bank with one tree in it: the takes of the dealer's other trees left out, and the tree's anchor at the shoe played as
 * the game's shoe (READY) in the tree's own takes, so that its entry, deals and returns are the ones the game plays. The tree's
 * own takes that really stand on READY (an A2.1 in a tree whose shoe anchor is A2.3: the tattooed A2.1, 2026-11-23) take the
 * hub's name in exchange, so that the two poses stay apart: the game plays them only where a step names that pose. A take of
 * no tree, and every other dealer's, stays as it was. With hub READY nothing is renamed.
 */
export function cutBank<B extends CutBank>(bank: B, cut: Pick<TreeCut, 'hub' | 'own' | 'drop'>): B {
  const drop = new Set(cut.drop), own = new Set(cut.own), hub = cut.hub;
  const swap = (node: unknown) => (node === hub ? 'READY' : node === 'READY' ? hub : null);
  const atShoe = <T extends CutTake>(t: T): T => {
    if (hub === 'READY' || !own.has(String(t.id))) return t;
    const from = swap(t.from), to = swap(t.to);
    return from === null && to === null ? t : { ...t, ...(from !== null ? { from } : {}), ...(to !== null ? { to } : {}) };
  };
  const keep = <T extends CutTake>(list: T[] | undefined): T[] | undefined => (Array.isArray(list) ? list.filter((t) => !drop.has(String(t?.id))).map(atShoe) : list);
  return { ...bank, jobs: keep(bank.jobs), derived: keep(bank.derived), edits: keep(bank.edits) };
}

/** The lab's reply to GET /api/trees?dealer=<id>&trad=<id>: its status and its JSON (answer null: none). Null: no reply at all. */
export type TreeReply = { status: number; answer: unknown } | null;
/**
 * The bank the game plays for ?trad=<word>, and the page's line (src/game-page.ts). Without the word: the bank as it is, no
 * line. A tree with films: its cut (cutBank) and "Tatuerad 15/36: kort utan film läggs utan hand", the number Karta shows. An
 * unknown tree, one without films, or no usable reply: the bank as it is, and why in plain words.
 */
export function treePlay<B extends CutBank>(bank: B, word: string | null, reply: TreeReply, dealerName: string): { bank: B; line: string | null } {
  if (word === null) return { bank, line: null };
  const usual = ' Spelet spelar som vanligt, med alla hennes filmer.';
  const cut = (reply?.answer ?? null) as (Partial<TreeCut> & { error?: unknown }) | null;
  if (!TREE_ID.test(word)) return { bank, line: `"${word.slice(0, 40)}" är inget träd.${usual}` };
  if (reply?.status === 404 && cut?.error) return { bank, line: `${dealerName} har inget träd "${word}".${usual}` };
  if (reply?.status !== 200 || !cut || !Array.isArray(cut.own) || !Array.isArray(cut.drop) || typeof cut.hub !== 'string' || !cut.count) return { bank, line: `Trädet "${word}" kunde inte läsas.${usual}` };
  const name = cut.name ?? word;
  if (!(cut.count.have > 0)) return { bank, line: `${name} har inga filmer än.${usual}` };
  return { bank: cutBank(bank, { hub: cut.hub, own: cut.own, drop: cut.drop }), line: `${name} ${countWord(cut.count)}: kort utan film läggs utan hand` };
}

// ── The game without a tree word ────────────────────────────────────────────
/**
 * GET /api/trees?dealer=<id>&spel=1: what the game without ?trad= plays (tools/dealer-tree.ts gameCut), as cutBank takes it.
 * played: the trees whose films it plays; drop: the takes placed in a tree it does not play, so that a tree being built does not
 * leak into it. When the films of one tree are played, hub and own are that tree's anchor at the shoe and its takes: the game
 * plays it exactly as ?trad=<id> does. With several, hub is READY and own empty: their films are only kept, nothing renamed.
 */
export type GameCut = { schemaVersion: 1; dealer: string; played: string[]; hub: string; own: string[]; drop: string[] };
/** The trees whose films the game plays without a tree word: each tree that is spelas, as the tree whose films it plays (homeOf). */
export const playedTrees = (trees: readonly TreeDef[]): Set<string> => new Set(trees.filter((t) => t.state === 'spelas').map((t) => homeOf(t, trees).id));
/**
 * The takes placed in a tree the game without a tree word does not play, and those of any tree seen from another seat than the
 * straight camera's. A take placed in no tree (Borta, an older attempt) stays.
 */
export function unplayedTakes(trees: readonly TreeDef[], takes: readonly Pick<TreeTake, 'id' | 'tree' | 'seat'>[]): string[] {
  const played = playedTrees(trees);
  return takes.filter((t) => t.tree !== null && (!played.has(t.tree) || fromSeat(t))).map((t) => t.id);
}
/**
 * The cut the game without a tree word plays (GameCut). Ingången shares the Casino's films, so the two are one played tree.
 * hubOf: a tree's anchor at the shoe (treeHubs, as treeCut gives it for ?trad=).
 */
export function playedCut(dealer: string, trees: readonly TreeDef[], takes: readonly Pick<TreeTake, 'id' | 'tree' | 'seat'>[], hubOf: (tree: TreeDef) => string): GameCut {
  const played = [...playedTrees(trees)], one = played.length === 1 ? (trees.find((t) => t.id === played[0]) ?? null) : null;
  return { schemaVersion: 1, dealer, played, hub: one ? hubOf(one) : 'READY', own: one ? cutTakes(one.id, takes).own : [], drop: unplayedTakes(trees, takes) };
}
/**
 * The bank the game plays without ?trad= (src/game-page.ts): the lab's cut (reply), else the one the bank carries for the dealer
 * (gameCuts: the online copy has no /api/trees, and its frozen bank holds the cut it was built with, tools/studio-freeze.ts
 * freezeBank); with neither, the bank as it is.
 */
export function gameBank<B extends CutBank>(bank: B, reply: TreeReply, dealer: string): B {
  const usable = (c: unknown) => (c && typeof c === 'object' && Array.isArray((c as Partial<GameCut>).drop) ? (c as Partial<GameCut>) : null);
  const cut = usable(reply?.status === 200 ? reply.answer : null) ?? usable((bank as { gameCuts?: Record<string, unknown> }).gameCuts?.[dealer]);
  return cut ? cutBank(bank, { hub: typeof cut.hub === 'string' ? cut.hub : 'READY', own: Array.isArray(cut.own) ? cut.own.map(String) : [], drop: cut.drop!.map(String) }) : bank;
}
