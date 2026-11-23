// A composition: two or more of a dealer's node trees put together into one larger tree that the Casino plays (Jakob 2026-11-23:
// "kombinera två eller fler nodträd ... ska en sak där kunna heta kanske 'schema' eller 'komposition'"; "'A2.3'-klippet ska göras
// 20% och 80% A2.1"; "alla klipp [ska] kunna ha varianter som på liknande sätt ska kunna köras"; a return goes back "till sin egna
// t.ex. '2.1'"). Pure: no file system, no DOM, no network. The register is data/dealer-compositions.json; the lab server reads it
// and the trees (tools/dealer-composition.ts, GET /api/compositions), Karta draws the answer (studio/components/map/CompositionKarta.tsx) and
// the lab's game plays one with ?komposition=<id> (src/game-page.ts, src/game-film.ts). A tree alone is a composition of one tree.
// Tests: tools/composition.test.ts.
//
// One idea carries it: every film begins on a picture and ends on a picture, and a film may follow another only when it begins on
// the picture the other ended on. Two trees meet where their pictures are the same (free) or where the composition has a bridge
// between them (a short film from the one picture to the other, or a cut he has allowed). Everything else follows:
//   - the share (80/20) is used wherever more than one tree can play what comes next from where the hand is;
//   - a return always goes home to the anchor its own deal left from, since no other film begins on that deal's last picture;
//   - a tree that lacks a step borrows it from a tree that has it, over a bridge or a common picture, and without one the card is
//     laid without a hand, as in a tree played alone;
//   - a seat's second card plays the film of its first, the drawn card laid at its own place (återbruk, the game's own rule).
// Where the hand rests between steps is one tree's (the home): the one with rest films, the largest share first.
import {REVEAL_NODE} from './clip-graph.ts';
import {GOOD, MEASURE_SIZE, cutBank, measure, nodeCode, type StepKind, type TreeState, type TreeTake, type TreeView, type Verdict} from './dealer-trees.ts';

// ── The register ────────────────────────────────────────────────────────────
/** A tree of the composition and its share (any numbers: 80 and 20, or 4 and 1). Share 0: the tree only lends what the others lack (its rest films, the dealer's cards). */
export type CompositionTree = {tree: string; share: number};
/**
 * A bridge between two pictures of Material (entry ids): A1 of one tree and A1 of another, or their anchors at the shoe.
 * ab, ba: the film from a to b and from b to a (a path under assets/); without one that way is a plain cut, which the bridge allows.
 */
export type BridgeDef = {a: string; b: string; ab?: string | null; ba?: string | null; seconds?: number};
/** shares: a film's share among the films of its own step, by take id; a step none of whose films is named plays as the bank chooses. */
export type CompositionDef = {id: string; name: string; trees: CompositionTree[]; bridges?: BridgeDef[]; shares?: Record<string, number>; note?: string};
export type CompositionRegister = {schemaVersion: 1; about: string; dealers: Record<string, {compositions: CompositionDef[]}>};
export const COMPOSITION_ID = /^[a-z0-9-]{1,40}$/;
export const MAX_TREES = 4, MAX_SHARE = 1000;
/** A bridge film's frames a second, as it is handed to the scene's film queue: the bank's films are 24. */
export const BRIDGE_FPS = 24;
const BRIDGE_FILM = /^assets\/[A-Za-z0-9._\-/]{1,200}\.(mp4|webm)$/;

/** What does not hold in a composition, in plain words; empty: it holds. trees: the dealer's tree ids. */
export function checkComposition(def: unknown, trees: readonly string[]): string[] {
  const d = def as Partial<CompositionDef> | null, out: string[] = [];
  if (!d || typeof d !== 'object') return ['Kompositionen är inget objekt.'];
  if (typeof d.id !== 'string' || !COMPOSITION_ID.test(d.id)) out.push('Id: små bokstäver, siffror och bindestreck, högst 40 tecken.');
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60) out.push('Namnet saknas eller är längre än 60 tecken.');
  const list = Array.isArray(d.trees) ? d.trees : [];
  if (!list.length || list.length > MAX_TREES) out.push(`En komposition har ett till ${MAX_TREES} träd.`);
  const seen = new Set<string>();
  for (const t of list) {
    if (!t || typeof t.tree !== 'string' || !trees.includes(t.tree)) { out.push(`Trädet "${String(t?.tree).slice(0, 40)}" finns inte hos dealern.`); continue; }
    if (seen.has(t.tree)) out.push(`Trädet "${t.tree}" står två gånger.`);
    seen.add(t.tree);
    if (typeof t.share !== 'number' || !Number.isFinite(t.share) || t.share < 0 || t.share > MAX_SHARE) out.push(`Andelen för "${t.tree}" ska vara ett tal från 0 till ${MAX_SHARE}.`);
  }
  if (list.length && !list.some(t => typeof t?.share === 'number' && t.share > 0)) out.push('Minst ett träd behöver en andel över 0.');
  for (const b of Array.isArray(d.bridges) ? d.bridges : []) {
    if (!b || typeof b.a !== 'string' || typeof b.b !== 'string' || !b.a || !b.b || b.a === b.b) { out.push('En brygga går mellan två olika bilder.'); continue; }
    for (const f of [b.ab, b.ba]) if (f != null && (typeof f !== 'string' || !BRIDGE_FILM.test(f) || f.includes('..'))) out.push(`Bryggans film "${String(f).slice(0, 80)}" är ingen film under assets/.`);
    if (b.seconds !== undefined && (typeof b.seconds !== 'number' || !(b.seconds >= 0) || b.seconds > 3)) out.push('En brygga är högst 3 sekunder.');
  }
  for (const [id, share] of Object.entries(d.shares && typeof d.shares === 'object' ? d.shares : {})) {
    if (!/^[a-z0-9-]{1,120}$/.test(id) || typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > MAX_SHARE) out.push(`Andelen för filmen "${id.slice(0, 60)}" ska vara ett tal från 0 till ${MAX_SHARE}.`);
  }
  return out;
}

/** A tree alone, as the composition it is. */
export const soloComposition = (tree: {id: string; name: string}): CompositionDef => ({id: tree.id, name: tree.name, trees: [{tree: tree.id, share: 100}]});

// ── Pictures and bridges ────────────────────────────────────────────────────
/** How two pictures meet: 'same' (one picture, free), a bridge (its film that way, null: a cut), or null (they do not meet). */
export type Link = 'same' | {film: string | null; seconds: number} | null;
export function linkOf(bridges: readonly BridgeDef[] | undefined, from: string | null, to: string | null): Link {
  if (!from || !to) return null;
  if (from === to) return 'same';
  for (const b of bridges ?? []) {
    if (b.a === from && b.b === to) return {film: b.ab ?? null, seconds: b.ab ? b.seconds ?? 0 : 0};
    if (b.b === from && b.a === to) return {film: b.ba ?? null, seconds: b.ba ? b.seconds ?? 0 : 0};
  }
  return null;
}

// ── The composition as Karta draws it ───────────────────────────────────────
/** A step of the measure wherever the anchor at the shoe is: "giv:P4.C1", "retur:P4.C1", "vila:", "ingang:", "utgang:", "halkort:D.C2". */
export const stepKey = (s: {kind: StepKind; card: string | null}): string => `${s.kind}:${s.card ?? ''}`;
/** The card whose film a card plays when it has none of its own: a seat's second card its first, the dealer's second her first (the game's stand-in). */
export const reuseCard = (card: string | null): string | null => { const m = card ? /^(P[1-7]|D)\.C2$/.exec(card) : null; return m ? `${m[1]}.C1` : null; };

/** A film on a step and its share among that tree's films of the step (0: it is not played). */
export type FilmChoice = {id: string; verdict: Verdict; percent: number};
/**
 * One tree's part of a step. how: eget (the tree's own film of the step) or aterbruk (the film of the seat's first card, the
 * drawn card laid at its own place; of names that card). percent: the tree's share of the step among the trees that can play it.
 * via: the tree's other anchor at the shoe it is given from (Casino's seat 6 from A2.2).
 */
export type CoverPart = {tree: string; how: 'eget' | 'aterbruk'; percent: number; films: FilmChoice[]; of: string | null; via: string | null};
export type CoverState = 'eget' | 'aterbruk' | 'lanat' | 'saknas';
/**
 * A step of the composition. state: eget (every tree with a share plays its own film), aterbruk (played with the seat's film),
 * lanat (a tree with a share has nothing here and borrows it from another), saknas (no tree has it).
 * lacking: the trees that borrow. reach: how a borrowing tree's hand comes to the lender: 'skon' (a bridge or a common picture
 * at the shoe), 'vila' (through rest), 'ingen' (no way: from that tree the card is laid without a hand); null: nobody borrows.
 * variants: more than one film of a part has a share.
 */
export type Cover = {key: string; kind: StepKind; card: string | null; name: string; state: CoverState; parts: CoverPart[]; lacking: string[]; reach: 'skon' | 'vila' | 'ingen' | null; variants: boolean};
/** The composition's number: steps it can play of the measure's 36, and how many of those with a film of the step's own. */
export type CompositionCount = {have: number; own: number; total: number};
/** A tree in a composition: its share, the pictures the hand rests on and waits at the shoe on (Material entries), its own number. */
export type ViewTree = {tree: string; name: string; state: TreeState; share: number; percent: number; hub: string; rest: string | null; shoe: string | null; have: number; restFilms: boolean};
/** How two trees of a composition meet, at rest and at the shoe: samma (one picture), brygga (film: it has one), ingen. */
export type Join = {a: string; b: string; rest: {a: string | null; b: string | null; how: 'samma' | 'brygga' | 'ingen'; film: boolean}; shoe: {a: string | null; b: string | null; how: 'samma' | 'brygga' | 'ingen'; film: boolean}};
export type CompositionView = {
  def: CompositionDef; trees: ViewTree[]; steps: Cover[]; count: CompositionCount; joins: Join[];
  /** The tree the hand rests in between steps (null: no tree has a rest film; she stands still). */
  home: string | null;
  /** The pictures at rest that differ between the trees: more than one means two kinds of hands in the same round. */
  looks: string[];
  problems: string[];
};

const STEP_WORD: Record<StepKind, string> = {vila: 'Vila', ingang: 'Ingång', giv: 'Giv', retur: 'Retur', utgang: 'Utgång', halkort: 'Hålkortet upp'};
/** A step in a few words: "Giv P4 kort 1", "Retur dealern kort 2", "Vila". */
export const stepWords = (kind: StepKind, card: string | null): string => {
  if (!card || kind === 'halkort') return STEP_WORD[kind];
  const [seat, n] = card.split('.');
  return `${STEP_WORD[kind]} ${seat === 'D' ? 'dealern' : seat} kort ${n.slice(1)}`;
};

/** The trees a composition plays: each named tree's home (Ingången plays the Casino's films), once, in the order given. */
function homes(def: CompositionDef, views: readonly TreeView[]): {view: TreeView; share: number}[] {
  const out: {view: TreeView; share: number}[] = [];
  for (const t of def.trees) {
    const named = views.find(v => v.tree.id === t.tree), view = named ? views.find(v => v.tree.id === named.home) ?? named : null;
    if (!view) continue;
    const had = out.find(x => x.view.tree.id === view.tree.id), share = Number.isFinite(t.share) && t.share > 0 ? t.share : 0;
    if (had) had.share += share; else out.push({view, share});
  }
  return out;
}
const picture = (view: TreeView, node: string): string | null => view.nodes.find(n => n.node === node)?.entry ?? null;
/** The home: the tree with rest films and the largest share, the first on a tie. */
const homeOf = (trees: readonly {tree: string; share: number; restFilms: boolean}[]): string | null =>
  [...trees].filter(t => t.restFilms).sort((a, b) => b.share - a.share)[0]?.tree ?? null;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A film's share among the films of its step: the composition's numbers where it names one of them, else all on the best film. */
function filmShares(ids: readonly string[], verdicts: ReadonlyMap<string, Verdict>, shares: Readonly<Record<string, number>>, best: string | null): FilmChoice[] {
  const named = ids.filter(id => (shares[id] ?? 0) > 0), total = named.reduce((s, id) => s + shares[id], 0), main = best && ids.includes(best) ? best : ids[0] ?? null;
  return ids.map(id => ({id, verdict: verdicts.get(id) ?? 'godkand', percent: named.length ? round1(100 * (shares[id] ?? 0) / total) : id === main ? 100 : 0}));
}

/**
 * A composition drawn: what each of the 36 steps is covered by and its number. views: the dealer's trees (GET /api/trees);
 * takes: her films placed in the trees, for each film's verdict (a film that is not among them covers no step).
 */
export function compositionView(def: CompositionDef, views: readonly TreeView[], takes: readonly Pick<TreeTake, 'id' | 'verdict'>[]): CompositionView {
  const list = homes(def, views), total = list.reduce((s, t) => s + t.share, 0) || 1, shares = def.shares ?? {};
  const verdicts = new Map(takes.map(t => [t.id, t.verdict] as const));
  const good = (ids: readonly string[]) => ids.filter(id => GOOD.includes(verdicts.get(id) ?? 'underkand'));
  const stepsOf = new Map(list.map(t => [t.view.tree.id, new Map(t.view.steps.map(s => [stepKey(s), s] as const))] as const));
  const trees: ViewTree[] = list.map(({view, share}) => ({tree: view.tree.id, name: view.tree.name, state: view.tree.state, share, percent: round1(100 * share / total), hub: view.hub,
    rest: picture(view, 'IDLE'), shoe: picture(view, view.hub), have: view.count.have, restFilms: view.steps.some(s => s.kind === 'vila' && s.state === 'finns')}));
  const home = homeOf(trees), byId = new Map(trees.map(t => [t.tree, t] as const));
  const met = (a: string | null, b: string | null) => !!linkOf(def.bridges, a, b);

  const steps: Cover[] = measure('READY').map(m => {
    const key = stepKey(m), from = reuseCard(m.card), able: Omit<CoverPart, 'percent'>[] = [], lacking: string[] = [];
    for (const {view, share} of list) {
      const mine = stepsOf.get(view.tree.id)!, own = mine.get(key), ownIds = own?.state === 'finns' ? good(own.ids) : [];
      const first = (m.kind === 'giv' || m.kind === 'retur') && from ? mine.get(stepKey({kind: m.kind, card: from})) : undefined, firstIds = !ownIds.length && first?.state === 'finns' ? good(first.ids) : [];
      if (ownIds.length) able.push({tree: view.tree.id, how: 'eget', films: filmShares(ownIds, verdicts, shares, own!.take), of: null, via: own!.via ? nodeCode(own!.via) : null});
      else if (firstIds.length) able.push({tree: view.tree.id, how: 'aterbruk', films: filmShares(firstIds, verdicts, shares, first!.take), of: from, via: first!.via ? nodeCode(first!.via) : null});
      else if (share > 0) lacking.push(view.tree.id); // a tree without a share only lends: what it lacks, nobody misses
    }
    // The share among the trees that can play the step; a tree without a share plays it only when no tree with one can.
    const sum = able.reduce((s, p) => s + byId.get(p.tree)!.share, 0);
    const parts: CoverPart[] = able.map((p, i) => ({...p, percent: sum > 0 ? round1(100 * byId.get(p.tree)!.share / sum) : i === 0 ? 100 : 0}));
    // How a tree that lacks the step reaches one that has it: at the shoe for a deal or a return, else through rest.
    const reaches = (via: 'shoe' | 'rest') => lacking.every(l => parts.some(p => met(byId.get(l)![via], byId.get(p.tree)![via])));
    const reach = !lacking.length || !parts.length ? null : (m.kind === 'giv' || m.kind === 'retur') && reaches('shoe') ? 'skon' : reaches('rest') ? 'vila' : 'ingen';
    const playing = parts.filter(p => p.percent > 0);
    const state: CoverState = !parts.length ? 'saknas' : lacking.length ? 'lanat' : playing.every(p => p.how === 'aterbruk') ? 'aterbruk' : 'eget';
    return {key, kind: m.kind, card: m.card, name: stepWords(m.kind, m.card), state, parts, lacking: parts.length ? lacking : [], reach, variants: parts.some(p => p.films.filter(f => f.percent > 0).length > 1)};
  });

  const joins: Join[] = [];
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
    const a = trees[i], b = trees[j];
    const how = (x: string | null, y: string | null) => { const l = linkOf(def.bridges, x, y), back = linkOf(def.bridges, y, x); return {a: x, b: y, how: l === 'same' ? 'samma' as const : l ? 'brygga' as const : 'ingen' as const, film: !!l && l !== 'same' && !!l.film && !!back && back !== 'same' && !!back.film}; };
    joins.push({a: a.tree, b: b.tree, rest: how(a.rest, b.rest), shoe: how(a.shoe, b.shoe)});
  }
  const problems: string[] = [];
  for (const t of def.trees) if (!views.some(v => v.tree.id === t.tree)) problems.push(`Trädet "${t.tree}" finns inte längre.`);
  if (!home && trees.length) problems.push('Inget träd har en vilofilm: hon står still mellan stegen.');
  const count: CompositionCount = {have: steps.filter(s => s.parts.length).length, own: steps.filter(s => s.parts.some(p => p.how === 'eget')).length, total: MEASURE_SIZE};
  return {def, trees, steps, count, joins, home, looks: [...new Set(trees.map(t => t.rest ?? `${t.tree}:A1`))], problems};
}
/** "33/36". */
export const compositionWord = (c: CompositionCount): string => `${c.have}/${c.total}`;

/** GET /api/compositions?dealer=<id>: the dealer's compositions drawn, and her trees as a composition may choose them. */
export type CompositionAnswer = {
  schemaVersion: 1; dealer: string; made: string;
  compositions: CompositionView[];
  /** Every tree that plays films of its own (not one that shares another's), alone: what a new composition starts from. */
  trees: ViewTree[];
  /** Her films placed in a tree, each with its verdict: what compositionView needs to draw a composition that is being changed. */
  takes: {id: string; verdict: Verdict}[];
  /** Material's pictures the views show, by entry id: the lab's path to the picture and its name. */
  pictures: Record<string, {path: string | null; name: string | null}>;
  /** How far the drawn card is moved when a seat's film is played for another card, per card, in film pixels and game pixels. */
  reuse: ReuseRow[];
};
/** A card that plays another card's film: how far from the film's own card it lies (px in the film, game: at 640 wide, cards: card widths). */
export type ReuseRow = {card: string; film: string; px: number; game: number; cards: number};

// ── One composition in the game (?komposition=<id>) ─────────────────────────
/** A tree as the game plays it in a composition: its films (own), its anchor at the shoe, and the pictures it rests and waits on. */
export type CutTree = {tree: string; name: string; share: number; hub: string; rest: string | null; shoe: string | null; own: string[]};
/**
 * GET /api/compositions?dealer=<id>&komposition=<id>: what the game needs (tools/dealer-composition.ts compositionCut). drop: the
 * takes placed in the dealer's trees outside the composition. looks: as CompositionView. A take placed in no tree is in none of
 * the lists and follows every tree (Borta).
 */
export type CompositionCut = {schemaVersion: 1; dealer: string; id: string; name: string; trees: CutTree[]; drop: string[]; bridges: BridgeDef[]; shares: Record<string, number>; home: string | null; count: CompositionCount; looks: string[]};

type CutBank = Parameters<typeof cutBank>[0];
/** The bank as one tree of the composition plays it: the other trees' films left out, its anchor at the shoe played as the shoe (cutBank). */
export function treeBank<B extends CutBank>(bank: B, cut: Pick<CompositionCut, 'trees' | 'drop'>, tree: string): B {
  const mine = cut.trees.find(t => t.tree === tree);
  if (!mine) return bank;
  return cutBank(bank, {hub: mine.hub, own: mine.own, drop: [...cut.drop, ...cut.trees.filter(t => t !== mine).flatMap(t => t.own)]});
}

/** The lab's reply to GET /api/compositions?…&komposition=<id>: its status and its JSON. Null: no reply at all. */
export type CompositionReply = {status: number; answer: unknown} | null;
/**
 * The composition the game plays for ?komposition=<word>, and the page's line. Without the word: none, no line. A composition
 * with films: its cut and "Casino + Tatuerad 33/36: kort utan film läggs utan hand". Unknown, without films or unreadable:
 * none, and why in plain words; the game then plays as without the word.
 */
export function compositionPlay(word: string | null, reply: CompositionReply, dealerName: string): {cut: CompositionCut | null; line: string | null} {
  if (word === null) return {cut: null, line: null};
  const usual = ' Spelet spelar som vanligt, med alla hennes filmer.';
  const cut = (reply?.answer ?? null) as (Partial<CompositionCut> & {error?: unknown}) | null;
  if (!COMPOSITION_ID.test(word)) return {cut: null, line: `"${word.slice(0, 40)}" är ingen komposition.${usual}`};
  if (reply?.status === 404 && cut?.error) return {cut: null, line: `${dealerName} har ingen komposition "${word}".${usual}`};
  if (reply?.status !== 200 || !cut || !Array.isArray(cut.trees) || !Array.isArray(cut.drop) || !cut.count || !cut.trees.every(t => t && typeof t.tree === 'string' && typeof t.hub === 'string' && Array.isArray(t.own)))
    return {cut: null, line: `Kompositionen "${word}" kunde inte läsas.${usual}`};
  const name = cut.name ?? word;
  if (!(cut.count.have > 0) || !cut.trees.some(t => t.share > 0)) return {cut: null, line: `${name} har inga filmer än.${usual}`};
  const hands = (cut.looks?.length ?? 0) > 1 ? ' · händerna skiljer mellan träden' : '';
  return {cut: cut as CompositionCut, line: `${name} ${compositionWord(cut.count)}: kort utan film läggs utan hand${hands}`};
}

// ── The composer: which tree plays what, and how the trees are joined ───────
/** What the hand is asked to do next in a step of the game: deal with the films of a placement key (P4.C1), or turn the hole card. */
export type Move = {deal: string} | {reveal: true};
type ComposerSpec = Pick<CompositionCut, 'trees' | 'bridges' | 'shares' | 'home'>;

/** One of `items` by weight: `random` is a number in [0, 1). Null without a positive weight. */
export function pickBy<T>(items: readonly T[], weight: (item: T) => number, random: number): T | null {
  const pool = items.filter(i => weight(i) > 0), total = pool.reduce((s, i) => s + weight(i), 0);
  if (!pool.length) return null;
  let at = Math.min(0.999999, Math.max(0, random)) * total;
  for (const i of pool) { if (at < weight(i)) return i; at -= weight(i); }
  return pool[pool.length - 1];
}

/**
 * The tree that plays each move of one step of the game, null for a move no tree can play from where the hand is (the card is
 * laid without a hand). The hand starts at rest in the home tree and comes back to it. Per move:
 *   - from rest: any tree that can play the move and whose rest picture meets the one the hand rests on, by share;
 *   - at the shoe: the tree the hand is in and every tree whose anchor at the shoe meets its own, by share; when none of them can
 *     play the move, a tree reached through rest, by share;
 *   - a tree is only chosen when the way home from its rest picture exists.
 * can(tree, move): whether the tree has the films for the move. random(): numbers in [0, 1).
 */
export function assign(spec: ComposerSpec, moves: readonly Move[], can: (tree: string, move: Move) => boolean, random: () => number): (string | null)[] {
  const trees = spec.trees, home = trees.find(t => t.tree === spec.home) ?? trees[0] ?? null;
  if (!home) return moves.map(() => null);
  const meets = (a: CutTree, b: CutTree, at: 'rest' | 'shoe') => a === b || !!linkOf(spec.bridges, a[at], b[at]);
  const wayHome = (t: CutTree) => meets(t, home, 'rest') && meets(home, t, 'rest');
  const shared = (list: CutTree[]) => list.filter(t => t.share > 0);
  let tree = home, atShoe = false;
  return moves.map(move => {
    const able = trees.filter(t => wayHome(t) && can(t.tree, move));
    const near = atShoe && 'deal' in move ? able.filter(t => meets(tree, t, 'shoe')) : [], far = able.filter(t => meets(tree, t, 'rest'));
    // Trees with a share first, those at the shoe before those through rest; a tree without a share only lends what they lack.
    const pool = [shared(near), shared(far), near, far].find(list => list.length) ?? [];
    const chosen = pickBy(pool, t => t.share, random()) ?? pool[0] ?? null;
    if (!chosen) { atShoe = false; return null; }
    tree = chosen; atShoe = 'deal' in move;
    return chosen.tree;
  });
}

/** A film among a step's films by the composition's shares, or null when it names none of them: the bank then chooses as always. */
export function pickFilm(shares: Readonly<Record<string, number>> | undefined, ids: readonly string[], random: number): string | null {
  return pickBy(ids, id => shares?.[id] ?? 0, random);
}

/** What weave reads of a beat (src/game-director.ts Beat): its kind and the edge it plays, in the tree's own bank (READY: its anchor at the shoe). */
export type LegBeat = {kind: string; step: {from: string; to: string; take?: string} | null};
/** A bridge played before beat `before` (beats.length: after the last): from one picture to another, its film (null: a cut) and the film's frames a second. */
export type WovenBridge = {before: number; from: string; to: string; film: string | null; seconds: number; fps: number};
/** The legs of a step as one chain: the beats, the tree each is played by, the bridges between them, and seams no bridge covers. */
export type Woven<B> = {beats: B[]; tree: string[]; bridges: WovenBridge[]; breaks: string[]};

const restPic = (t: CutTree) => t.rest ?? `${t.tree}:A1`, shoePic = (t: CutTree) => t.shoe ?? `${t.tree}:${t.hub}`;
/** The picture a node of a tree's own bank stands for: its rest, its anchor at the shoe, or a picture only that tree has (a card, another anchor). */
export const pictureOf = (t: CutTree, node: string): string => node === 'IDLE' || node === REVEAL_NODE ? restPic(t) : node === 'READY' ? shoePic(t) : `${t.tree}@${node}`;

/**
 * Joins the legs of one step of the game, each planned as a round of its own tree (from rest and back to rest), into one chain.
 * Where two legs follow each other and their anchors at the shoe meet, the hand stays at the shoe: the first leg's last return
 * goes to the shoe, its exit and the next leg's entry are left out, and the bridge between the two anchors is played. Otherwise
 * the legs meet at rest, over the bridge between their rest pictures when those differ. The chain begins and ends on the home
 * tree's rest picture. stays(tree, card): whether the tree has a return from that card to the shoe (true when not said).
 */
export function weave<B extends LegBeat>(spec: ComposerSpec, legs: readonly {tree: string; beats: readonly B[]}[], stays: (tree: string, card: string) => boolean = () => true): Woven<B> {
  const byId = new Map(spec.trees.map(t => [t.tree, t] as const)), home = byId.get(spec.home ?? '') ?? spec.trees[0];
  const out: Woven<B> = {beats: [], tree: [], bridges: [], breaks: []};
  const join = (from: string, to: string, what: string) => {
    const link = linkOf(spec.bridges, from, to);
    if (link === 'same') return;
    if (link) out.bridges.push({before: out.beats.length, from, to, film: link.film, seconds: link.seconds, fps: BRIDGE_FPS});
    else out.breaks.push(`Skarv utan brygga ${what}.`);
  };
  const live = legs.filter(l => l.beats.length && byId.has(l.tree));
  let at = home ? restPic(home) : null; // the picture the hand is on; null: unknown (no home)
  let waits: CutTree | null = null; // the tree at whose anchor at the shoe the hand waits; null: at rest
  live.forEach((leg, i) => {
    const t = byId.get(leg.tree)!, next = live[i + 1], n = next ? byId.get(next.tree)! : null, beats = [...leg.beats];
    // Cards laid without a hand only: no film, so the hand stays where it is.
    if (beats.every(b => !b.step)) { for (const b of beats) { out.beats.push(b); out.tree.push(t.tree); } return; }
    // The leg opens at the shoe when the one before it stayed there.
    if (waits) { join(shoePic(waits), shoePic(t), `vid skon från ${waits.tree} till ${t.tree}`); beats.shift(); waits = null; }
    else if (at !== null) join(at, restPic(t), `i vilan till ${t.tree}`);
    // Does it stay at the shoe for the next leg? Its last hand beats are a deal from the shoe and its return (and the exit), the
    // next leg opens with the plain entry and a deal from the shoe, and the two anchors meet.
    const last = beats.length - 1, exit = beats[last]?.kind === 'EXIT' && beats[last].step?.from === 'READY' ? last : -1, back = exit >= 0 ? last - 1 : last;
    const ret = beats[back], deal = beats[back - 1], opens = next?.beats[0], first = next?.beats[1];
    const stay = !!n && t !== n && ret?.kind === 'RETURN' && deal?.kind === 'DEAL' && deal.step?.from === 'READY' && !!ret.step && stays(t.tree, ret.step.from)
      && opens?.kind === 'ENTRY' && opens.step?.to === 'READY' && first?.kind === 'DEAL' && first.step?.from === 'READY' && !!linkOf(spec.bridges, shoePic(t), shoePic(n));
    if (stay) { beats[back] = {...ret, step: {...ret.step!, to: 'READY'}}; if (exit >= 0) beats.splice(exit, 1); }
    for (const b of beats) { out.beats.push(b); out.tree.push(t.tree); }
    at = stay ? shoePic(t) : restPic(t); waits = stay ? t : null;
  });
  if (home && at !== null && at !== restPic(home)) join(at, restPic(home), `i vilan hem till ${home.tree}`);
  return out;
}

/** A film or a bridge of a woven chain with the pictures it begins and ends on. tree: whose film (null: a bridge). */
export type Hop = {kind: string; tree: string | null; from: string; to: string; beat: number};
/** The chain as films and bridges in the order they are played; a card laid without a hand (PLACE) moves nothing and is left out. */
export function trace(spec: ComposerSpec, woven: Woven<LegBeat>): Hop[] {
  const byId = new Map(spec.trees.map(t => [t.tree, t] as const)), hops: Hop[] = [];
  const bridgesAt = (i: number) => woven.bridges.filter(b => b.before === i).map(b => ({kind: 'BRIDGE', tree: null, from: b.from, to: b.to, beat: i}));
  woven.beats.forEach((b, i) => {
    hops.push(...bridgesAt(i));
    const t = byId.get(woven.tree[i]);
    if (b.step && t) hops.push({kind: b.kind, tree: t.tree, from: pictureOf(t, b.step.from), to: pictureOf(t, b.step.to), beat: i});
  });
  hops.push(...bridgesAt(woven.beats.length));
  return hops;
}
/** Every place in a chain where a film begins on another picture than the one before it ended on, from `start` (the home's rest picture). Empty: none. */
export function seams(hops: readonly Hop[], start: string | null): string[] {
  const out: string[] = []; let at = start;
  for (const h of hops) { if (at !== null && h.from !== at) out.push(`${h.kind}${h.tree ? ` (${h.tree})` : ''} börjar på ${h.from}, men bilden före är ${at}.`); at = h.to; }
  return out;
}

/**
 * The composer the game's film player asks (src/game-film.ts): the trees, which of them plays each move, the films' shares,
 * and the legs woven into one chain with its bridges and the seams that are left. random: numbers in [0, 1).
 */
export function createComposer(cut: ComposerSpec, random: () => number = Math.random) {
  const trees = cut.trees, home = trees.find(t => t.tree === cut.home) ?? trees[0] ?? null;
  const spec: ComposerSpec = {...cut, trees, home: home?.tree ?? null};
  return {
    /** The composition's trees, and the one the hand rests in. */
    trees: trees.map(t => t.tree), home: home?.tree ?? null,
    assign: (moves: readonly Move[], can: (tree: string, move: Move) => boolean) => assign(spec, moves, can, random),
    /** The film a step plays among `ids` (the step's films in the tree that plays it), or null: the bank's own choice. */
    film: (ids: readonly string[]) => pickFilm(spec.shares, ids, random()),
    weave<B extends LegBeat>(legs: readonly {tree: string; beats: readonly B[]}[], stays?: (tree: string, card: string) => boolean) {
      const woven = weave(spec, legs, stays);
      return {...woven, breaks: [...woven.breaks, ...seams(trace(spec, woven), home ? restPic(home) : null)]};
    },
  };
}
export type Composer = ReturnType<typeof createComposer>;
