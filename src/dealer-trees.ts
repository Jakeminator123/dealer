// The dealer's named trees (data/dealer-trees.json) as Jakob reads them: a tree's nodes (A1, its anchors at the shoe, an
// A3 per player and card) and its 36 steps against his measure (Jakob 2026-11-21: "en giv per kort för respektive
// spelare"), each with its state, and the one number per tree ("Casino 22/36"). Pure: no file system, no DOM, no network.
// The lab server places the films in the trees (tools/dealer-tree.ts, GET /api/trees) and calls treeView; the studio draws
// the answer (Karta) and counts with treeCount (the rail); the game plays one tree with cutBank (?trad=<id>, src/game-page.ts).
// Tests: studio/tests/dealer-trees.test.ts.
//
// The measure, per tree, with the tree's anchor at the shoe (its first A2.x anchor; A2.1 when it has none):
//   vila A1 → A1 · ingång A1 → A2.x · 16 givar A2.x → A3 (P1–P7 kort 1 och 2, dealerns DC1 och DC2) · 16 returer A3 → A2.x
//   · utgång A2.x → A1 · hålkortet A1 → DC2 upp.
// The return A3 → A1 is not counted: a round goes back to the shoe and leaves by the exit. DC3, Borta and the seats' side
// cameras are not counted. A tree's other A2.x anchors stand in for a step its own anchor lacks (Casino gives P6C1 from A2.2).
//
// A step's state: finns (a film Primär, Godkänd or Variant, his or given for him), prov (a film delivered and not yet judged,
// or an order delivered that is not in the bank yet), saknas (nothing, or only films judged Inte bra). Verdicts and Primär
// are read, never set.
import { REVEAL_NODE, parseEdge } from './clip-graph.ts';

// ── The register ────────────────────────────────────────────────────────────
export type TreeState = 'spelas' | 'byggs' | 'vilar';
export type TreeAnchor = { entry: string; seat?: number };
export type TreeDef = { id: string; name: string; state: TreeState; root: string; anchors: TreeAnchor[]; shares?: string; opening?: string; note?: string };
export type TreeRegister = { schemaVersion: 1; about: string; dealers: Record<string, { trees: TreeDef[] }> };
/** A picture of Material (data/media-roles.json) as far as a tree needs it. */
export type TreeEntry = { id: string; role: string; node?: string; card?: string; state?: string; builtOn?: string[]; name?: string };

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

/** The tree's levels: each node its anchors stand for, with the first anchor given for it. */
function levels(tree: TreeDef, entries: ReadonlyMap<string, TreeEntry>): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of tree.anchors) {
    const e = entries.get(a.entry), n = e ? levelOf(e) : null;
    if (n && !out.has(n)) out.set(n, a.entry);
  }
  return out;
}

/** The anchor at the shoe the tree is measured with (its first A2.x anchor, else A2.1), and its other A2.x anchors. */
export function treeHubs(tree: TreeDef, entries: ReadonlyMap<string, TreeEntry>): { hub: string; others: string[] } {
  const shoe = [...levels(tree, entries).keys()].filter(isAnchorAtShoe);
  return { hub: shoe[0] ?? 'READY', others: shoe.slice(1) };
}

export type NodeRole = 'vila' | 'skon' | 'kort' | 'halkort';
/** A node of the drawn tree: its picture's entry in Material (null: no picture), and that picture's state there. */
export type TreeNode = { node: string; code: string; role: NodeRole; entry: string | null; state: string | null };

/**
 * A card's picture in the tree: the tree's own A3 for the card, else a landing in Material made from the tree's anchors
 * (builtOn names only them) that is neither replaced nor archived. Null: the card has no picture of this tree.
 */
function cardPicture(tree: TreeDef, at: Map<string, string>, entries: ReadonlyMap<string, TreeEntry>, card: string): string | null {
  const own = at.get(card);
  if (own) return own;
  const ids = new Set(tree.anchors.map((a) => a.entry));
  for (const e of entries.values()) {
    if (e.role !== 'landning' || e.card !== card || e.state === 'ersatt' || e.state === 'arkiverad') continue;
    if (e.builtOn?.length && e.builtOn.every((b) => ids.has(b))) return e.id;
  }
  return null;
}

/** The tree's nodes: A1, its anchors at the shoe, the 16 cards of the measure and the hole card turned up. */
export function treeNodes(tree: TreeDef, entries: ReadonlyMap<string, TreeEntry>): TreeNode[] {
  const at = levels(tree, entries), { hub, others } = treeHubs(tree, entries);
  const node = (n: string, role: NodeRole, entry: string | null): TreeNode => ({ node: n, code: nodeCode(n), role, entry, state: entry ? (entries.get(entry)?.state ?? null) : null });
  return [
    node('IDLE', 'vila', at.get('IDLE') ?? (entries.has(tree.root) ? tree.root : null)),
    node(hub, 'skon', at.get(hub) ?? null),
    ...others.map((o) => node(o, 'skon', at.get(o) ?? null)),
    ...MEASURE_CARDS.map((c) => node(c, 'kort', cardPicture(tree, at, entries, c))),
    node(REVEAL_NODE, 'halkort', null),
  ];
}

// ── The steps' state ────────────────────────────────────────────────────────
/** The five verdicts as studio/lib/verdict.ts verdictOf says them (a failed take counts as underkand here). */
export type Verdict = 'primar' | 'godkand' | 'variant' | 'vantar' | 'underkand';
export const GOOD: readonly Verdict[] = ['primar', 'godkand', 'variant'];
const RANK: Record<Verdict, number> = { primar: 4, godkand: 3, variant: 2, vantar: 1, underkand: 0 };
/** A take of the bank: the tree it is placed in (null: none), its two nodes with the anchor variant put back, its verdict. */
export type TreeTake = { id: string; tree: string | null; from: string; to: string; verdict: Verdict; byJakob: boolean; provisional: boolean; archived?: boolean };
/** An order delivered that is not in the bank yet: the tree its pictures place it in, and its step. */
export type Delivery = { order: string; tree: string | null; from: string; to: string; title?: string };
export type StepState = 'finns' | 'prov' | 'saknas';
export const STEP_STATES: readonly StepState[] = ['finns', 'prov', 'saknas'];
/**
 * A step of a tree: what stands best on it (take, its verdict and whose word), via: the other anchor at the shoe it is
 * given from when not the tree's own, takes: the tree's films on the step (archived left out), ids: those films and its
 * stand-ins' (what Karta's films panel lists), deliveries: orders delivered for it that are not in the bank.
 */
export type TreeStep = MeasureStep & { name: string; state: StepState; take: string | null; verdict: Verdict | null; byJakob: boolean; provisional: boolean; via: string | null; takes: number; ids: string[]; deliveries: string[] };

/** The steps of the measure for a tree's films (its own, already placed in it), with `others` standing in for `hub`. */
export function treeSteps(hub: string, others: readonly string[], takes: readonly TreeTake[], deliveries: readonly Delivery[] = []): TreeStep[] {
  const live = takes.filter((t) => !t.archived);
  return measure(hub).map((m) => {
    const own = live.filter((t) => t.from === m.from && t.to === m.to);
    const stand = m.from === hub || m.to === hub
      ? others.flatMap((o) => live.filter((t) => t.from === (m.from === hub ? o : m.from) && t.to === (m.to === hub ? o : m.to)).map((t) => ({ t, via: o })))
      : [];
    const ranked = [...own.map((t) => ({ t, via: null as string | null })), ...stand].sort((a, b) => RANK[b.t.verdict] - RANK[a.t.verdict] || Number(!!a.via) - Number(!!b.via));
    const good = ranked.find((x) => GOOD.includes(x.t.verdict)) ?? null;
    const sent = deliveries.filter((d) => d.from === m.from && d.to === m.to).map((d) => d.order);
    const waiting = own.find((t) => t.verdict === 'vantar') ?? null;
    const shown = good ?? (waiting ? { t: waiting, via: null } : null);
    const state: StepState = good ? 'finns' : waiting || sent.length ? 'prov' : 'saknas';
    return { ...m, name: stepName(m.from, m.to), state, take: shown?.t.id ?? null, verdict: shown?.t.verdict ?? null, byJakob: !!shown?.t.byJakob, provisional: !!shown?.t.provisional, via: shown?.via ?? null, takes: own.length, ids: ranked.map((x) => x.t.id), deliveries: sent };
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
};

/** One tree with its nodes, steps and number, from the films placed in the trees and the orders delivered outside the bank. */
export function treeView(dealer: string, tree: TreeDef, trees: readonly TreeDef[], entries: ReadonlyMap<string, TreeEntry>, takes: readonly TreeTake[], deliveries: readonly Delivery[] = []): TreeView {
  const home = homeOf(tree, trees), { hub, others } = treeHubs(home, entries);
  const steps = treeSteps(hub, others, takes.filter((t) => t.tree === home.id), deliveries.filter((d) => d.tree === home.id));
  return { dealer, tree, home: home.id, hub, others, nodes: treeNodes(home, entries), steps, count: treeCount(steps) };
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
 * the game's shoe (READY) in the tree's own takes, so that its entry, deals and returns are the ones the game plays. A take of
 * no tree, and every other dealer's, stays as it was. With hub READY nothing is renamed.
 */
export function cutBank<B extends CutBank>(bank: B, cut: Pick<TreeCut, 'hub' | 'own' | 'drop'>): B {
  const drop = new Set(cut.drop), own = new Set(cut.own), hub = cut.hub;
  const atShoe = <T extends CutTake>(t: T): T =>
    hub === 'READY' || !own.has(String(t.id)) || (t.from !== hub && t.to !== hub) ? t : { ...t, ...(t.from === hub ? { from: 'READY' } : {}), ...(t.to === hub ? { to: 'READY' } : {}) };
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
