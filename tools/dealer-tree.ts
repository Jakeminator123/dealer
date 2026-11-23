// Each dealer's named trees (data/dealer-trees.json) and where every film stands against them. Read only: it writes nothing in
// the registers; its report goes to .runtime/dealer-trad/ (LASMIG.md in Jakob's words, trad.json with everything).
//   node tools/dealer-tree.ts [--dealer <id>]
// The same placing answers Karta's trees (GET /api/trees?dealer=<id>, serveTrees): each tree's nodes and its 36 steps against
// his measure with their state (src/dealer-trees.ts treeView), and for a step without a film what an order of it has and lacks.
//
// A tree is a set of anchors from Material (data/media-roles.json): A1, A2.x and, where one is chosen, an A3 per player and card.
// Names come from the graph's nodes (src/dealer-trees.ts nodeCode, the studio's words): IDLE = A1, READY = A2.1, READY-B = A2.2,
// READY-C = A2.3, P4.C1 = A3P4C1, D.C1 = A3DC1; an anchor seen from a seat is S2-A2.2.
//
// Every record in motions/ lands in one group, read from the registers and never from a file name:
//   kopplad      its edge's anchors are the tree's: the pictures its order started and ended on (data/orders/<id>.json
//                pictures[].from), the first and last pictures of its job (data/clip-jobs.json), the deal it starts on
//                (startsOn), the clip it is cut from, or the rest film a talk film is laid on (speech.restFilm). Where a
//                node has no picture at all and only one tree of the dealer has that level, the tree follows from the node
//                (marked "härledd ur noden").
//   halvkopplad  an anchor that is no tree's (an older attempt, a replaced or archived picture), an experiment's node, no
//                picture where two trees share the level, or a record without a take in the bank; with the likely step as a
//                proposal.
//   okopplad     no edge at all (a whole round, a sequence), or a film folder under assets/ that no register names.
// Whether the game plays a take is the game's own answer: gameTakes (tools/studio-freeze.ts) over the bank the lab serves
// (GET /api/clip-bank, with each record's speech), and usesOf (studio/lib/primaries.ts) for how often. Verdicts are
// verdictOf (studio/lib/verdict.ts). Sizes are stat sizes, each file once (a hard link is counted where it is first met);
// no media file is opened. A kept collection (assets/noir/, Jakob 2026-11-21) is named but never loose material.
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraph, type BankData, type Take} from '../src/clip-graph.ts';
import {countWord, isCard, isTreeHub, levelOf, nodeCode, nodesOf, orderCommand, stepName as stepWords, treeView, type Delivery, type MeasureStep, type Need, type OrderFacts, type TreeAnswer, type TreeDef, type TreeRegister, type TreeState, type TreeStep, type TreeTake, type TreeView, type Verdict as TreeVerdict} from '../src/dealer-trees.ts';
import {ANCHOR_NODE, costOf, modelFor, paramsOf, stepOf, type Policy, type StepKey} from '../src/order-model.ts';
import {NO_RECIPE, methodFor, readMethods, recipeFor, referenceAbsent, secondsOf, triedWords, type MethodRegister} from '../src/order-methods.ts';
import {GAME_VOICE, PHASE_LINE, spokenFilms, type SpeechTake} from '../src/speech-lines.ts';
import {reviewerNote} from '../studio/lib/ledger.ts';
import {gameGraph, usesOf, type Use} from '../studio/lib/primaries.ts';
import {verdictOf} from '../studio/lib/verdict.ts';
import {audit} from './media-audit.ts';
import {readBank} from './produce.ts';
import {gameTakes} from './studio-freeze.ts';

// ── The register ────────────────────────────────────────────────────────────
export type {TreeAnchor, TreeDef, TreeRegister, TreeState} from '../src/dealer-trees.ts';
type Entry = {id: string; dealer: string; role: string; node?: string; card?: string; state?: string; path?: string; frame?: number; builtOn?: string[]; name?: string; note?: string; source?: {from?: string}};

const STATES: TreeState[] = ['spelas', 'byggs', 'vilar'];
const MAX_TREES = 3;

/** The register, checked against Material: every anchor an entry of that dealer, the root among the anchors, at most three trees. */
export function checkTrees(register: TreeRegister, entries: Map<string, Entry>, dealers: string[]): string[] {
  const out: string[] = [];
  if (register?.schemaVersion !== 1) out.push('schemaVersion ska vara 1');
  for (const [dealer, d] of Object.entries(register?.dealers ?? {})) {
    if (!dealers.includes(dealer)) out.push(`${dealer} finns inte i data/dealers.json`);
    if ((d.trees ?? []).length > MAX_TREES) out.push(`${dealer} har fler än ${MAX_TREES} träd`);
    const ids = new Set((d.trees ?? []).map(t => t.id));
    for (const t of d.trees ?? []) {
      if (!STATES.includes(t.state)) out.push(`${dealer}/${t.id}: okänt läge ${t.state}`);
      if (!t.anchors.some(a => a.entry === t.root)) out.push(`${dealer}/${t.id}: roten ${t.root} står inte bland ankarna`);
      if (t.shares && !ids.has(t.shares)) out.push(`${dealer}/${t.id}: delar ${t.shares}, som inte finns`);
      if (t.opening && entries.get(t.opening)?.dealer !== dealer) out.push(`${dealer}/${t.id}: början ${t.opening} är ingen post för ${dealer} i Material`);
      for (const a of t.anchors) {
        const e = entries.get(a.entry);
        if (!e || e.dealer !== dealer) out.push(`${dealer}/${t.id}: ankaret ${a.entry} är ingen post för ${dealer} i Material`);
        if (a.seat !== undefined && !(Number.isInteger(a.seat) && a.seat >= 1 && a.seat <= 7)) out.push(`${dealer}/${t.id}: seat ${a.seat} ska vara 1–7`);
      }
    }
  }
  return out;
}

// ── His notation (src/dealer-trees.ts) ──────────────────────────────────────
const OUTER = new Set(['AWAY', 'REVEAL(D.C2)']);
export {isCard, nodesOf};
/** A node as he writes it: A1, A2.1, A2.3, A3P4C1, A3DC1, Borta, DC2 upp; seen from a seat, S2-A2.2. */
export const code = nodeCode;
/** A take's step in his words: the edge, with the anchor variant it was written from put back ("A2.3 → A3P4C1"). */
export const stepName = (edge: string, hub?: string | null) => { const [a, b] = nodesOf(edge, hub); return stepWords(a, b); };
/** An entry's name in the report: a landing without a card is "A3P4, kort ej angivet". */
const entryCode = (e: Entry, seat?: number): string => {
  if (e.role === 'landning' && !e.card) { const seatOf = /P[1-7]|D/.exec(e.node ?? '')?.[0]; return `A3${seatOf ?? ''}, kort ej angivet`; }
  const n = levelOf(e); return n ? code(n, seat) : e.role;
};

// ── Reading (stat and JSON only) ────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (rel: string) => path.join(ROOT, rel);
const json = <T>(rel: string): T | null => { try { return JSON.parse(readFileSync(at(rel), 'utf8')) as T; } catch { return null; } };
const VIDEO = /\.(mp4|webm|mov|mkv)$/i;
// A file reached by two hard links (assets/noir/ holds links to the trailer's files) is one file on the disk: each file is
// counted once in a run, at the first folder that claims it (by device and file id), so the sums are unique bytes.
type Scan = {files: {key: string; size: number}[]; videos: number; deleted: boolean; exists: boolean};
type Folder = {bytes: number; kept: number; videos: number; deleted: boolean; exists: boolean};
const scans = new Map<string, Scan>(), claimed = new Set<string>();
// Kept collections are no loose material (Jakob 2026-11-21: every noir film in assets/noir/, kept). A file there that is also
// linked from a proof or the intro is the same bytes: deleting the other link frees nothing, so it is counted as kept.
const KEPT = ['assets/noir'], keptKeys = new Set<string>();
const fileKey = (abs: string) => { const s = statSync(abs, {bigint: true}); return {key: `${s.dev}:${s.ino}`, size: Number(s.size)}; };
function scan(rel: string): Scan {
  const known = scans.get(rel); if (known) return known;
  const out: Scan = {files: [], videos: 0, deleted: false, exists: false};
  const walk = (r: string) => {
    let list; try { list = readdirSync(at(r), {withFileTypes: true}); } catch { try { if (statSync(at(r)).isFile()) { out.exists = true; out.files.push(fileKey(at(r))); if (VIDEO.test(r)) out.videos++; } } catch { /* absent */ } return; }
    out.exists = true;
    for (const e of list) {
      const p = `${r}/${e.name}`;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { out.files.push(fileKey(at(p))); if (VIDEO.test(e.name)) out.videos++; if (e.name === 'RADERAD.txt') out.deleted = true; }
    }
  };
  walk(rel);
  scans.set(rel, out);
  return out;
}
/** The folder's (or file's) bytes not yet counted elsewhere in this run, and what it holds. */
function folder(rel: string): Folder {
  const s = scan(rel);
  let bytes = 0, kept = 0;
  for (const f of s.files) if (!claimed.has(f.key)) { claimed.add(f.key); bytes += f.size; if (keptKeys.has(f.key)) kept += f.size; }
  return {bytes, kept, videos: s.videos, deleted: s.deleted, exists: s.exists};
}
const fileBytes = (rel: string) => folder(rel).bytes;
const mb = (bytes: number) => Math.round(bytes / 1e5) / 10;

// ── The report's rows ───────────────────────────────────────────────────────
export type Group = 'kopplad' | 'halvkopplad' | 'okopplad';
export type Row = {
  id: string; dealer: string; kind: string; group: Group; tree: string | null; step: string | null; edge: string | null;
  /** inGame: the take is in the bank the game holds (gameTakes); plays: it is there and the game also picks it (usesOf is not "never"). */
  verdict: string; good: boolean; variant: boolean; inGame?: boolean; plays: boolean; use: string | null; mb: number;
  via: string | null; reason: string | null; proposal: string | null; anchors: string[]; note?: string;
  /** The verdict as data (verdictOf for a take, the record's review otherwise); null for a clip cut into takes and a folder without a record. */
  judge?: Judge | null;
};
/** primar | godkand | variant | vantar | underkand; byJakob: his own word; provisional: given for him by the main agent and a reviewer;
 *  detail: verdictOf's word more ("sekundär" for an underkand that is a secondary alternative). */
export type Judge = {verdict: string; byJakob: boolean; provisional: boolean; detail: string | null};
type Tree = TreeDef & {dealer: string; at: Map<string, string>; ids: Set<string>};
type Verdict = {text: string; good: boolean; judge: Judge | null};

const VERDICT_WORD: Record<string, string> = {primar: 'Primär', godkand: 'Godkänd', variant: 'Variant', vantar: 'ej dömd', underkand: 'Inte bra'};
function takeVerdict(take: Take): Verdict {
  const v = verdictOf(take), word = VERDICT_WORD[v.verdict];
  const who = v.provisional ? 'dömd åt honom: ' : '', by = !v.provisional && !v.byJakob && v.verdict !== 'vantar' ? ' (granskare)' : '';
  return {text: `${who}${word}${by}${v.detail ? `, ${v.detail}` : ''}`, good: ['primar', 'godkand', 'variant'].includes(v.verdict), judge: {verdict: v.verdict, byJakob: v.byJakob, provisional: v.provisional, detail: v.detail}};
}
type Review = {decision?: string; userAccepted?: boolean; userReview?: string; provisional?: unknown};
function recordVerdict(review: Review | undefined): Verdict {
  if (!review?.decision) return {text: 'ej dömd', good: false, judge: null};
  const his = review.userAccepted === true || (typeof review.userReview === 'string' && review.userReview.trim() !== '');
  const word = review.decision === 'ACCEPTED' ? 'Godkänd' : review.decision === 'SECONDARY' ? 'Godkänd, sekundär' : review.decision === 'REJECTED' ? 'Inte bra' : 'ej dömd';
  return {text: `${review.provisional ? 'dömd åt honom: ' : ''}${word}${!his && !review.provisional && word !== 'ej dömd' ? ' (granskare)' : ''}`, good: review.decision === 'ACCEPTED' || review.decision === 'SECONDARY',
    // A record outside the bank that is SECONDARY counts as good here, as its text says: the safe side for anything that deletes.
    judge: {verdict: review.decision === 'REJECTED' ? 'underkand' : review.decision === 'ACCEPTED' || review.decision === 'SECONDARY' ? 'godkand' : 'vantar', byJakob: his, provisional: !!review.provisional, detail: review.decision === 'SECONDARY' ? 'sekundär' : null}};
}
const RANK: Record<Group, number> = {kopplad: 0, halvkopplad: 1, okopplad: 2};

type MotionRec = {id?: string; dealer?: string; order?: {id?: string; take?: number}; speech?: {restFilm?: string; line?: string}; review?: Review;
  motion?: {target?: string; edge?: string; reversedFrom?: string}; plannedTarget?: unknown; kind?: string; sequence?: unknown; cutInto?: string[]; takes?: string[]; source?: {path?: string};
  cutFrom?: {clip?: string}; localDerivation?: {sourceClip?: string}};
type Order = {id: string; dealer?: string; status?: string; step?: {edge?: string; key?: string}; reference?: {status?: string; clips?: string[]};
  pictures?: {goesAs?: string; from?: {entry?: string; path?: string}}[]; title?: string};
type Ref = {file?: {path?: string}; frame?: {video?: string; index?: number}} | null | undefined;
type Job = {id: string; clip?: string; source?: {clip?: string}; first?: Ref; last?: Ref};

type Placed = {group: Group; tree: Tree | null; via: string | null; reason: string | null; proposal: string | null; anchors: string[]};

/**
 * What the placing reads (the registers and the bank the lab serves, JSON only: no folder is walked, no size counted) and the
 * placing itself: the pictures a record stands on (evidence) and where a step with those pictures lands (place).
 */
async function readWorld(only: string | null) {
  const dealersFile = json<{dealers: {id: string; name?: string}[]}>('data/dealers.json');
  const dealers = (dealersFile?.dealers ?? []).map(d => d.id).filter(d => !only || d === only);
  const roles = json<{dealers: Record<string, {entries: Omit<Entry, 'dealer'>[]}>}>('data/media-roles.json');
  const entries = new Map<string, Entry>();
  for (const [dealer, d] of Object.entries(roles?.dealers ?? {})) for (const e of d.entries ?? []) entries.set(e.id, {...e, dealer});
  const register = json<TreeRegister>('data/dealer-trees.json');
  if (!register) throw new Error('data/dealer-trees.json saknas eller går inte att läsa');
  const problems = checkTrees(register, entries, (dealersFile?.dealers ?? []).map(d => d.id));
  if (problems.length) throw new Error(`data/dealer-trees.json håller inte:\n  ${problems.join('\n  ')}`);
  const trees: Tree[] = [];
  for (const [dealer, d] of Object.entries(register.dealers)) for (const t of d.trees) {
    const map = new Map<string, string>();
    for (const a of t.anchors) { const e = entries.get(a.entry)!, n = levelOf(e); if (n && !map.has(n)) map.set(n, a.entry); }
    trees.push({...t, dealer, at: map, ids: new Set(t.anchors.map(a => a.entry))});
  }
  const treeOf = (id: string | null) => trees.find(t => t.id === id) ?? null;
  const owners = (dealer: string) => trees.filter(t => t.dealer === dealer && !t.shares);

  // Where a picture lies: by file, by a frame of a film, and an order's two pictures.
  const byPath = new Map<string, string>(), byFrame = new Map<string, string>();
  for (const e of entries.values()) {
    if (!e.path || !['ankare-1', 'ankare-2.1', 'ankare-2.2', 'ankare-2.3', 'landning'].includes(e.role)) continue;
    if (typeof e.frame === 'number') byFrame.set(`${e.path}#${e.frame}`, e.id); else byPath.set(e.path, e.id);
  }
  const orders = new Map<string, Order>();
  for (const f of readdirSync(at('data/orders')).filter(f => f.endsWith('.json'))) { const o = json<Order>(`data/orders/${f}`); if (o?.id) orders.set(o.id, o); }
  const picture = (o: Order | undefined, as: 'startFrame' | 'endFrame') => { const p = o?.pictures?.find(p => p.goesAs === as)?.from; return p?.entry ?? (p?.path ? byPath.get(p.path) ?? null : null); };
  const refEntry = (r: Ref): string | null => {
    const file = r?.file?.path;
    if (file) { const m = /^assets\/orders\/([^/]+)\/(first|last)\.png$/.exec(file); return m ? picture(orders.get(m[1]), m[2] === 'first' ? 'startFrame' : 'endFrame') : byPath.get(file) ?? null; }
    const f = r?.frame; return f?.video && typeof f.index === 'number' ? byFrame.get(`${f.video}#${f.index}`) ?? null : null;
  };

  // The bank the lab serves: readBank, with each record's speech as GET /api/clip-bank gives it (tools/preview.ts clipBank).
  const bank = await readBank(ROOT) as BankData & {jobs: Job[]; derived: Job[]; edits: Job[]};
  const records = new Map<string, MotionRec>();
  for (const f of readdirSync(at('motions')).filter(f => f.endsWith('.json'))) { const r = json<MotionRec>(`motions/${f}`); if (r) records.set(f.slice(0, -5), r); }
  for (const [id, m] of Object.entries(bank.motions ?? {})) { const speech = records.get(id)?.speech; if (speech) (m as {speech?: unknown}).speech = speech; }
  const jobs = new Map<string, Job>([...bank.jobs, ...bank.derived, ...bank.edits].map(j => [j.id, j]));

  const takes = new Map<string, {take: Take; dealer: string}>();
  for (const dealer of dealers) for (const take of Object.values(buildGraph(bank, {dealer}).takes)) takes.set(take.id, {take, dealer});

  // The pictures a record stands on, found through its order, its job, the deal it starts on, its clip or its rest film.
  const memo = new Map<string, Map<string, string>>();
  function evidence(id: string): Map<string, string> {
    const known = memo.get(id); if (known) return known;
    const out = new Map<string, string>(); memo.set(id, out);
    const add = (entry: string | null | undefined, how: string) => { if (entry && !out.has(entry)) out.set(entry, how); };
    const take = (id: string, how: string) => { for (const [e, h] of evidence(id)) add(e, `${how}: ${h}`); };
    const rec = records.get(id), job = jobs.get(id), t = takes.get(id)?.take;
    const order = orders.get(rec?.order?.id ?? '');
    if (order) { add(picture(order, 'startFrame'), `beställningen ${order.id}`); add(picture(order, 'endFrame'), `beställningen ${order.id}`); }
    add(refEntry(job?.first), 'första bilden'); add(refEntry(job?.last), 'sista bilden');
    if (t?.anchorStart) add(byPath.get(t.anchorStart) ?? null, 'ankarstarten');
    if (t?.startsOn?.clip && t.startsOn.clip !== id) take(t.startsOn.clip, `börjar i ${t.startsOn.clip}`);
    for (const clip of [job?.clip, job?.source?.clip, t?.segment?.clip, rec?.cutFrom?.clip, t?.editOf]) if (clip && clip !== id) take(clip, `skuren ur ${clip}`);
    for (const clip of [rec?.localDerivation?.sourceClip, rec?.motion?.reversedFrom]) if (clip && clip !== id) take(clip, `gjord ur ${clip}`);
    if (rec?.speech?.restFilm && rec.speech.restFilm !== id) take(rec.speech.restFilm, `talet ligger på ${rec.speech.restFilm}`);
    return out;
  }

  /** Does Material's entry belong to the tree at that node? Its own anchor, or a card variant or landing of the same set. */
  const fits = (e: Entry, t: Tree, node: string): boolean => {
    if (t.ids.has(e.id)) return true;
    if (e.dealer !== t.dealer || e.state === 'ersatt' || e.state === 'arkiverad') return false;
    if (isCard(node)) return !t.at.has(node) && (e.builtOn ?? []).every(b => t.ids.has(b));
    return !!e.card && t.at.has(node); // an A1 or A2.x with a card lying, of a tree that has that anchor
  };
  const lineageOld = (e: Entry) => [e, ...(e.builtOn ?? []).map(b => entries.get(b)).filter((x): x is Entry => !!x)].find(x => x.state === 'arkiverad' || x.state === 'ersatt') ?? null;

  function place(dealer: string, edge: string, hub: string | null | undefined, ev: Map<string, string>): Placed {
    const nodes = [...new Set(nodesOf(edge, hub))], anchors = [...ev.keys()];
    let cands = owners(dealer), likely = owners(dealer);
    const foreign: string[] = [], derived: string[] = [], experiments: string[] = [];
    for (const n of nodes) {
      if (!isTreeHub(n) && !OUTER.has(n) && !isCard(n)) { experiments.push(n); continue; }
      if (OUTER.has(n)) continue;
      const here = anchors.map(a => entries.get(a)!).filter(e => levelOf(e) === n);
      if (isTreeHub(n)) likely = likely.filter(t => t.at.has(n));
      if (here.length) {
        const ok = cands.filter(t => here.some(e => fits(e, t, n)));
        if (ok.length) { cands = ok; continue; }
        cands = [];
        for (const e of here) {
          const old = lineageOld(e), other = likely.some(t => t.at.has(n) && t.at.get(n) !== e.id);
          foreign.push(old && other ? `äldre försök till ${code(n)}: ${e.id}${old.id === e.id ? ` (${old.state})` : `, gjord på ${old.id} (${old.state})`}`
            : `${isCard(n) ? 'landar på' : 'står på'} ${e.id}${e.state ? ` (${e.state})` : ''}, som inte är trädets ${code(n)}`);
        }
      } else if (isTreeHub(n)) { cands = cands.filter(t => t.at.has(n)); derived.push(n); }
    }
    const step = stepName(edge, hub), propose = (list: Tree[], why = '') => list.length === 1 ? `${list[0].name}: ${step}${why} (förslag)` : list.length ? `${list.map(t => t.name).join(' eller ')}: ${step} (förslag)` : null;
    if (experiments.length) return {group: 'halvkopplad', tree: null, via: null, reason: `experimentets nod ${experiments.join(', ')}: ingen nivå i ett träd`, proposal: propose(likely), anchors};
    if (foreign.length) return {group: 'halvkopplad', tree: null, via: null, reason: foreign.join('; '), proposal: propose(likely), anchors};
    if (cands.length === 1) return {group: 'kopplad', tree: cands[0], via: derived.length ? (derived.length === nodes.filter(n => isTreeHub(n)).length ? 'härledd ur noden' : `bild, ${derived.map(n => code(n)).join(' och ')} härledd ur noden`) : 'bild', reason: null, proposal: null, anchors};
    if (cands.length > 1) return {group: 'halvkopplad', tree: null, via: null, reason: `ingen bild för ${derived.map(n => code(n)).join(' och ')}, som flera träd har`, proposal: propose(cands), anchors};
    const missing = nodes.filter(n => isTreeHub(n) && !owners(dealer).some(t => t.at.has(n)));
    return {group: 'halvkopplad', tree: null, via: null, reason: missing.length ? `dealern har inget träd med ${missing.map(n => code(n)).join(', ')}` : 'ankarna hör till olika träd', proposal: null, anchors};
  }

  return {dealersFile, dealers, entries, register, trees, treeOf, owners, orders, picture, bank, records, jobs, takes, evidence, place};
}

export async function buildReport(only: string | null = null) {
  for (const k of KEPT) for (const f of scan(k).files) keptKeys.add(f.key);
  const world = await readWorld(only), {dealersFile, dealers, entries, trees, treeOf, owners, orders, picture, bank, records, jobs, takes, evidence, place} = world;
  // Each tree's number against his measure, the same Karta shows (src/dealer-trees.ts treeCount).
  const counts = Object.fromEntries(dealers.flatMap(d => viewsOf(world, d).map(v => [`${d}/${v.tree.id}`, countWord(v.count)])));
  const plays = new Map<string, Set<string>>(), games = new Map<string, ReturnType<typeof gameGraph>>();
  for (const dealer of dealers) { plays.set(dealer, gameTakes(bank, dealer)); games.set(dealer, gameGraph(bank, dealer)); }
  const useCache = new Map<string, Map<string, Use>>();
  const useOf = (dealer: string, take: Take): Use | null => {
    const key = `${dealer} ${take.edge}`;
    if (!useCache.has(key)) { const g = games.get(dealer)!; useCache.set(key, g.edge[take.edge] ? usesOf(g, take.edge) : new Map()); }
    return useCache.get(key)!.get(take.id) ?? null;
  };

  const rows: Row[] = [];
  const seen = new Set<string>();
  // 1. The bank's takes.
  for (const [id, {take, dealer}] of takes) {
    const p = place(dealer, take.edge, take.hub, evidence(id)), v = takeVerdict(take), use = useOf(dealer, take);
    const own = folder(`assets/motions/${id}`), inGame = plays.get(dealer)!.has(id), played = inGame && use?.kind !== 'never';
    // No picture where two trees share the level: a film the game plays points at the one tree the game plays (still a proposal).
    const hubs = nodesOf(take.edge, take.hub).filter(n => isTreeHub(n)), live = owners(dealer).filter(t => t.state === 'spelas' && hubs.every(n => t.at.has(n)));
    const proposal = p.group === 'halvkopplad' && p.reason?.startsWith('ingen bild för') && played && live.length === 1 ? `${live[0].name}: ${stepName(take.edge, take.hub)} (förslag: spelet spelar den)` : p.proposal;
    rows.push({id, dealer, kind: 'tagning', group: p.group, tree: p.tree?.id ?? null, step: stepName(take.edge, take.hub), edge: take.edge, verdict: v.text, good: v.good, judge: v.judge,
      variant: !!take.variant, inGame, plays: played, use: use ? use.word : null, mb: mb(own.bytes), via: p.via, reason: p.reason, proposal,
      anchors: p.anchors, note: [take.archived ? 'arkiverad' : '', own.deleted ? 'filmen raderad (RADERAD.txt)' : '', !own.exists ? `filmen ligger i ${take.segment?.clip ?? 'källfilmen'}` : ''].filter(Boolean).join('; ') || undefined});
    seen.add(id);
  }
  // 2. Records that are no take: a clip cut into takes takes its takes' best place; one without takes is half linked when it has a
  // step, and not linked when it is a whole round.
  const cutFrom = new Map<string, string[]>();
  for (const [id, {take}] of takes) for (const clip of new Set([jobs.get(id)?.clip, jobs.get(id)?.source?.clip, take.segment?.clip, take.startsOn?.clip])) if (clip && clip !== id) cutFrom.set(clip, [...(cutFrom.get(clip) ?? []), id]);
  for (const [id, rec] of records) {
    if (seen.has(id)) continue;
    const dealer = rec.dealer ?? id.split('-')[0];
    if (!dealers.includes(dealer)) continue;
    const own = folder(`assets/motions/${id}`), kids = (cutFrom.get(id) ?? []).map(k => rows.find(r => r.id === k)).filter((r): r is Row => !!r);
    const base = {id, dealer, kind: 'källfilm', mb: mb(own.bytes), variant: false, anchors: [...evidence(id).keys()], note: own.deleted ? 'filmen raderad (RADERAD.txt)' : undefined};
    if (kids.length) {
      const best = [...kids].sort((a, b) => RANK[a.group] - RANK[b.group])[0], good = kids.find(k => k.good);
      rows.push({...base, group: best.group, tree: best.tree, step: best.step, edge: best.edge, verdict: `genom tagningarna: ${(good ?? best).verdict}`, good: !!good,
        plays: kids.some(k => k.plays), use: kids.some(k => k.plays) ? 'en tagning ur den spelas' : null, via: `källa till ${kids.map(k => k.id).join(', ')}`,
        reason: best.reason, proposal: best.proposal});
      continue;
    }
    const order = orders.get(rec.order?.id ?? ''), edge = order?.step?.edge ?? (typeof rec.motion?.edge === 'string' ? rec.motion.edge : null);
    const v = recordVerdict(rec.review);
    if (edge) {
      const p = place(dealer, edge, null, evidence(id));
      rows.push({...base, group: 'halvkopplad', tree: null, step: stepName(edge), edge, verdict: v.text, good: v.good, judge: v.judge, plays: false, use: null, via: null,
        reason: `ingen tagning i banken${p.reason ? `; ${p.reason}` : ''}`, proposal: p.tree ? `${p.tree.name}: ${stepName(edge)} (förslag)` : p.proposal});
      continue;
    }
    const target = typeof rec.motion?.target === 'string' ? rec.motion.target : null;
    const whole = rec.kind ?? (rec.sequence ? 'sequence' : null);
    rows.push({...base, group: whole || !target ? 'okopplad' : 'halvkopplad', tree: null, step: null, edge: null, verdict: v.text, good: v.good, judge: v.judge, plays: false, use: null, via: null,
      reason: whole ? `hel runda i ett stycke (${whole}), ingen kant` : target ? `ingen tagning i banken, siktar på ${code(target)}` : 'ingen kant och ingen tagning i banken',
      proposal: target ? `${owners(dealer).filter(t => true).map(t => t.name).join(' eller ')}: mot ${code(target)} (förslag)` : null});
  }
  // 3. Film folders under assets/motions without a record in motions/. A folder without a film (only the generation's notes)
  // is no film and is only counted.
  const motionsNoFilm: string[] = [];
  for (const name of readdirSync(at('assets/motions'))) {
    if (records.has(name)) continue;
    const dealer = name.split('-')[0]; if (!dealers.includes(dealer)) continue;
    if (!scan(`assets/motions/${name}`).videos) { motionsNoFilm.push(name); continue; }
    const f = folder(`assets/motions/${name}`);
    rows.push({id: name, dealer, kind: 'filmmapp utan post', group: 'okopplad', tree: null, step: null, edge: null, verdict: 'ej dömd', good: false, variant: false, plays: false,
      use: null, mb: mb(f.bytes), via: null, reason: 'mapp i assets/motions utan post i motions/', proposal: null, anchors: []});
  }

  // ── Material outside the bank ──────────────────────────────────────────────
  type Loose = {id: string; dealer: string; kind: string; path: string; mb: number; tree: string | null; verdict: string; good: boolean; reason: string; plays: boolean; keptMb?: number};
  const outside: Loose[] = [];
  const bankOrders = new Set([...records.values()].map(r => r.order?.id).filter((x): x is string => !!x));
  const placedOrder = new Map<string, Placed>();
  for (const o of orders.values()) {
    const dealer = o.dealer ?? o.id.split('-')[0]; if (!dealers.includes(dealer)) continue;
    const f = folder(`assets/orders/${o.id}`), ev = new Map<string, string>();
    for (const as of ['startFrame', 'endFrame'] as const) { const e = picture(o, as); if (e) ev.set(e, `beställningen ${o.id}`); }
    const edge = o.step?.edge ?? null, p = edge ? place(dealer, edge, null, ev) : null;
    if (p) placedOrder.set(o.id, p);
    const inBank = bankOrders.has(o.id);
    outside.push({id: o.id, dealer, kind: edge ? 'beställning' : 'beställning av ankarbild', path: `assets/orders/${o.id}`, mb: mb(f.bytes), tree: p?.group === 'kopplad' ? p.tree!.id : null,
      verdict: `beställningen ${o.status ?? '?'}`, good: false, plays: false,
      reason: !edge ? 'ingen kant: bilden blev ett ankare' : `${stepName(edge)}; ${inBank ? 'tagningar ur den finns i banken' : 'ingen tagning i banken'}${p?.group === 'kopplad' ? '' : `; ${p?.reason ?? ''}`}`});
  }
  const intro = new Set(trees.map(t => t.opening).filter(Boolean));
  for (const e of entries.values()) {
    if (e.role !== 'film' || !e.path || e.path.startsWith('assets/motions/') || !dealers.includes(e.dealer)) continue;
    const unit = e.path.split('/').slice(0, e.path.startsWith('assets/films/') ? 4 : 3).join('/'), f = e.path.startsWith('assets/films/') ? folder(unit) : {bytes: fileBytes(e.path)} as Folder;
    // The order a film came from: named in older rows' source.from, and for a film brought in from Kön read from the receipt beside the copy (tools/order-bring.ts writes original.order there).
    const ord = /beställningen ([a-z0-9-]+)/.exec(e.source?.from ?? '')?.[1] ?? json<{original?: {order?: string}}>(`${path.posix.dirname(e.path)}/receipt.json`)?.original?.order, p = ord ? placedOrder.get(ord) : undefined;
    const opening = intro.has(e.id) ? trees.find(t => t.opening === e.id)! : null;
    const said = /\b(\d)\/5\b/.exec(e.note ?? '')?.[0];
    outside.push({id: e.id, dealer: e.dealer, kind: opening ? 'filmen före spelet' : 'film utanför banken', path: e.path, mb: mb(f.bytes), tree: opening ? opening.id : p?.group === 'kopplad' ? p.tree!.id : null,
      verdict: `${e.state ?? 'utan läge'}${said ? `, granskare ${said}` : ''}${/variant/i.test(e.note ?? '') ? ', variant' : ''}`, good: /variant/i.test(e.note ?? ''),
      plays: !!opening, reason: opening ? `början på trädet ${opening.name}` : ord ? `ur beställningen ${ord}${p?.group === 'kopplad' ? '' : `: ${p?.reason ?? 'beställningens ankare är inget träds'}`}` : (e.source?.from ?? 'okänd källa').slice(0, 120)});
  }
  // The folders the audit finds no register for, and the talk folders and proofs.
  const {items} = audit(ROOT);
  const notes = json<{notes: {proof: string; file?: string; choice?: string | null}[]}>('data/proof-notes.json')?.notes ?? [];
  for (const i of items) {
    const parts = i.path.split('/');
    if (!scan(i.path).videos) continue;
    if (parts[1] === 'films' && parts[2] !== 'intro' && i.use === 'okänd' && dealers.includes(parts[2])) outside.push({id: parts.at(-1)!, dealer: parts[2], kind: 'film utan post', path: i.path, mb: mb(folder(i.path).bytes), tree: null, verdict: 'ej dömd', good: false, plays: false, reason: 'inget register nämner den'});
    if (parts[1] === 'speech' && dealers.includes(parts[2])) {
      const name = parts.at(-1)!, patch = parts[3] === 'patches' && parts.length === 5, replaced = parts[3] === 'patches-ersatta', takeId = patch || replaced ? null : name.replace(/^bank-/, '');
      const row = takeId ? rows.find(r => r.id === takeId) : null;
      outside.push({id: name, dealer: parts[2], kind: replaced ? 'ersatta munlappar' : patch ? 'munlapp' : 'talets arbetsmapp', path: i.path, mb: mb(folder(i.path).bytes), tree: row?.group === 'kopplad' ? row.tree : null, verdict: row?.verdict ?? 'ej dömd', good: !!row?.good,
        plays: i.use === 'spelas' || !!row?.plays, reason: row ? `hör till ${row.id} (${row.group})` : `${i.what}; ${i.why[0] ?? 'inget register'}`});
    }
    if (parts[1] === 'proofs') {
      const p = json<{title?: string; dealer?: string}>(`${i.path}/proof.json`), id = parts[2], mine = notes.filter(n => n.proof === id && n.choice);
      const dealer = p?.dealer ?? (dealers.find(d => id.startsWith(`${d}-`)) ?? null) ?? ([...dealers].find(d => new RegExp(`\\b${d}\\b`, 'i').test(p?.title ?? '')) ?? 'gemensamt');
      if (only && dealer !== only) continue;
      const own = folder(i.path);
      outside.push({id, dealer, kind: 'prov', path: i.path, mb: mb(own.bytes), keptMb: own.kept ? mb(own.kept) : undefined, tree: null, verdict: mine.length ? `hans val: ${[...new Set(mine.map(n => n.choice))].join(', ')}` : 'inget val av honom', good: mine.some(n => /bra|primär|variant/i.test(n.choice ?? '')),
        plays: i.use === 'spelas', reason: `prov i Granska: ${(p?.title ?? '').slice(0, 90)}`});
    }
  }
  // The kept collections' own bytes are counted after everything else, so a file linked from a proof or the intro is not counted twice.
  const kept = KEPT.filter(k => scan(k).exists).map(k => { const s = scan(k), all = s.files.reduce((n, f) => n + f.size, 0); return {path: k, films: s.videos, mb: mb(all), mbOwn: mb(folder(k).bytes)}; });
  const unknownElsewhere = items.filter(i => i.use === 'okänd' && scan(i.path).videos && !KEPT.some(k => i.path === k || i.path.startsWith(`${k}/`)) && !['films', 'speech', 'proofs', 'motions'].includes(i.path.split('/')[1]))
    .map(i => ({path: i.path, mb: mb(folder(i.path).bytes), what: i.what}));
  const receiptsOnly = items.filter(i => i.path.startsWith('assets/films/') && !scan(i.path).videos && dealers.includes(i.path.split('/')[2])).map(i => i.path);

  // ── The doll's films: references, not the dealer's ─────────────────────────
  const dolls = (json<{films: {id: string; edge: string; path: string}[]}>('data/rendered-references.json')?.films ?? []).map(d => {
    const users = [...orders.values()].filter(o => o.reference?.clips?.includes(d.id)).map(o => ({order: o.id, start: picture(o, 'startFrame'), status: o.status, placed: placedOrder.get(o.id)}));
    return {...d, step: stepName(d.edge), mb: mb(fileBytes(d.path)), users, series: d.id.replace(/^docka-(?:vila-till-)?[0-9-]*?(?:p[1-7]c[1-3]|dc[1-3])?-?/, '')};
  });
  const seriesTree = new Map<string, {tree: string | null; why: string}>();
  for (const d of dolls) for (const u of d.users) {
    const p = u.placed, verdict = p?.group === 'kopplad' ? {tree: p.tree!.id, why: `beställningen ${u.order} ur trädet ${p.tree!.name}`} : {tree: null, why: `beställningen ${u.order}: ${p?.reason ?? 'utan ankare'}`};
    const prev = seriesTree.get(d.series); if (!prev || (!prev.tree && verdict.tree)) seriesTree.set(d.series, verdict);
  }
  const dollRows = dolls.filter(d => !only || only === 'paow').map(d => {
    const own = d.users.find(u => u.placed?.group === 'kopplad'), s = seriesTree.get(d.series);
    const where = own ? {tree: own.placed!.tree!.id, why: `beställningen ${own.order} använde den`} : d.users.length ? {tree: null, why: `använd av ${d.users.map(u => `${u.order} (${u.placed?.reason ?? 'utan ankare'})`).join('; ')}`}
      : s ? {tree: s.tree, why: `ingen beställning ännu; samma serie (${d.series}) som ${s.why}`} : {tree: null, why: 'ingen beställning har använt den eller serien'};
    return {id: d.id, step: d.step, mb: d.mb, tree: where.tree, why: where.why, orders: d.users.map(u => u.order)};
  });

  // ── The way in: the film before the game, and what the game plays after it ─
  const ways = trees.filter(t => t.opening).map(t => {
    const film = entries.get(t.opening!)!, home = treeOf(t.shares ?? null), g = games.get(t.dealer);
    const rests = (g?.edge['IDLE>IDLE']?.takes ?? []) as Take[], game = plays.get(t.dealer) ?? new Set<string>();
    const calm = rests.filter(r => r.idle?.calm === true && r.idle?.cut !== false && !!r.media.video && game.has(r.id));
    const spoken = spokenFilms(rests as unknown as SpeechTake[], t.dealer, {voice: GAME_VOICE}), first = spoken[PHASE_LINE.BETTING];
    const after = [...calm.filter(r => !(r.motion as {speech?: unknown} | null)?.speech).map(r => r.id), ...(first ? [first.clip] : [])];
    const placedAfter = after.map(id => ({id, tree: rows.find(r => r.id === id)?.tree ?? null, group: rows.find(r => r.id === id)?.group ?? null}));
    return {tree: t.id, name: t.name, film: film.id, path: film.path, ends: t.root, home: home?.id ?? null, after: placedAfter,
      same: placedAfter.length > 0 && placedAfter.every(a => a.tree === (home?.id ?? null)), line: first ? {key: first.key, clip: first.clip} : null};
  });

  // ── Seats: anything a register says is seen from another camera ───────────
  const seatWords = /från sidan|sedd från sidan|från stol \d|stol \d|grader åt|sidovinkel|annan vinkel|två stolar/i;
  const seats = {
    anchors: [...entries.values()].filter(e => dealers.includes(e.dealer) && ['seat', 'camera', 'angle', 'view'].some(k => k in (e as object))).map(e => e.id),
    records: [...records.entries()].filter(([, r]) => ['seat', 'camera', 'angle'].some(k => k in (r as object))).map(([id]) => id),
    treeSeats: trees.flatMap(t => t.anchors.filter(a => a.seat).map(a => `${t.dealer}/${t.id}: ${code(levelOf(entries.get(a.entry)!)!, a.seat)} (${a.entry})`)),
    proofs: items.filter(i => i.top === 'assets/proofs' && i.path.split('/').length === 3).map(i => ({id: i.path.split('/')[2], p: json<{title?: string; description?: string; createdAt?: string}>(`${i.path}/proof.json`), use: i.use}))
      .filter(x => seatWords.test(`${x.p?.title ?? ''} ${(x.p?.description ?? '').slice(0, 400)}`)).map(x => ({id: x.id, title: x.p?.title ?? '', made: x.p?.createdAt ?? '', plays: x.use === 'spelas'})),
  };

  return {made: new Date().toISOString(), only, dealers, trees: trees.map(({at: m, ids: _ids, ...t}) => ({...t, levels: Object.fromEntries([...m].map(([n, e]) => [code(n, t.anchors.find(a => a.entry === e)?.seat), e]))})),
    counts, entries, rows, outside, unknownElsewhere, receiptsOnly, motionsNoFilm, kept, dolls: dollRows, ways, seats};
}

// ── Karta's trees (GET /api/trees) ──────────────────────────────────────────
type World = Awaited<ReturnType<typeof readWorld>>;
type RefFilm = {id: string; edge: string; seconds?: number; check?: {pass?: boolean}};
type Receipt = {takes?: {take?: number; status?: string; file?: string | null; history?: unknown; review?: unknown}[]};

/** A take's verdict for the trees: verdictOf's, where a failed take counts as underkand (it never came). */
function treeVerdict(take: Take): Pick<TreeTake, 'verdict' | 'byJakob' | 'provisional'> {
  const v = verdictOf(take);
  return {verdict: take.stage === 'FAILED' ? 'underkand' : v.verdict as TreeVerdict, byJakob: v.byJakob, provisional: v.provisional};
}

/** The dealer's takes of the bank, each placed in the tree its pictures say (null: in none). */
function placedTakes(w: World, dealer: string): TreeTake[] {
  const out: TreeTake[] = [];
  for (const [id, {take, dealer: d}] of w.takes) {
    if (d !== dealer) continue;
    const p = w.place(dealer, take.edge, take.hub, w.evidence(id)), [from, to] = nodesOf(take.edge, take.hub);
    out.push({id, tree: p.group === 'kopplad' ? p.tree!.id : null, from, to, ...treeVerdict(take), archived: !!take.archived});
  }
  return out;
}

const FELL = /faller|föll|inte användbar|underkän|not usable/i;
/**
 * The dealer's orders delivered that are not in the bank yet, placed by their two pictures: a take that came (HÄMTAD on)
 * whose reviewer note (studio/lib/ledger.ts reviewerNote) does not say it fell. One that fell is no prov: it waits for nothing.
 */
function deliveries(w: World, dealer: string): Delivery[] {
  const inBank = new Set([...w.records.values()].map(r => r.order?.id).filter((x): x is string => !!x)), out: Delivery[] = [];
  for (const o of w.orders.values()) {
    const edge = o.step?.edge;
    if ((o.dealer ?? o.id.split('-')[0]) !== dealer || !edge || o.status === 'AVBRUTEN' || inBank.has(o.id)) continue;
    const receipt = json<Receipt>(`assets/orders/${o.id}/receipt.json`);
    const waiting = (receipt?.takes ?? []).some(t => !!t.file && ['HÄMTAD', 'EFTERARBETAD', 'MÄTT', 'GRANSKAD'].includes(t.status ?? '') && !FELL.test(reviewerNote(t.history, t.review) ?? ''));
    if (!waiting) continue;
    const ev = new Map<string, string>();
    for (const as of ['startFrame', 'endFrame'] as const) { const e = w.picture(o, as); if (e) ev.set(e, `beställningen ${o.id}`); }
    const p = w.place(dealer, edge, null, ev), [from, to] = nodesOf(edge);
    out.push({order: o.id, tree: p.group === 'kopplad' ? p.tree!.id : null, from, to, ...(o.title ? {title: o.title} : {})});
  }
  return out;
}

/** The anchor at the shoe as Beställ writes it: READY-C → "2.3". */
const SHOE: Record<string, string> = Object.fromEntries(Object.entries(ANCHOR_NODE).map(([a, n]) => [n, a]));
/** A step of the measure as Beställ's step (src/order-model.ts STEPS), null where Beställ has none (A2.3 → A1). */
export function stepKeyOf(step: Pick<MeasureStep, 'kind'>, hub: string): StepKey | null {
  const a = SHOE[hub];
  const key = {vila: 'VILA', halkort: 'HALKORT', ingang: `INGANG-${a}`, giv: `GIV-${a}`, retur: `RETUR-${a}`, utgang: a === '2.1' ? 'UTGANG' : `UTGANG-${a}`}[step.kind];
  return stepOf(key)?.key ?? null;
}

type Facts = {dealer: string; methods: MethodRegister | null; prices: Policy['prices']; refs: RefFilm[]; takes: TreeTake[]; entries: Map<string, Entry>};
/** What an order of a step has and lacks, its estimated price and the command for a draft: read, never ordered. */
function orderFacts(f: Facts, view: Pick<TreeView, 'hub' | 'nodes'>, step: TreeStep): OrderFacts {
  const key = stepKeyOf(step, view.hub), def = key ? stepOf(key) : null;
  const target = step.kind === 'halkort' ? 'D.C2' : step.card;
  const method = key ? methodFor(f.methods, key, target) : null, recipe = key ? recipeFor(f.methods, key, target) : null;
  const pic = (node: string) => view.nodes.find(n => n.node === node)?.entry ?? null;
  // The picture by its name in Material ("A2.3: vänster hand uppifrån på kortet, rak bål"), never its id.
  const has = (node: string): Need => {
    const e = pic(node), entry = e ? f.entries.get(e) : null, code = nodeCode(node), name = entry?.name ?? null, state = entry?.state ?? null;
    const shown = name?.startsWith(code) ? name : name ? `${code}: ${name}` : code;
    return e ? {ok: true, what: `${shown}${state && state !== 'gäller' ? ` (${state} i Material)` : ''}`} : {ok: false, what: `ingen bild för ${code} i trädet`};
  };
  const drawn = (node: string, card: string): Need => {
    const base = has(node);
    return base.ok ? {ok: true, what: `${nodeCode(node)} med ${nodeCode(card)} ritat (Beställ ritar det)`} : base;
  };
  const last = recipe?.lastPicture ?? (step.kind === 'giv' ? 'ritat-kort' : 'ankare');
  const [first, end]: [Need, Need] =
    step.kind === 'halkort' ? [drawn('IDLE', 'D.C2'), drawn('IDLE', 'D.C2')]
    : step.kind === 'giv' ? [has(step.from), last === 'platsens-slutbild' ? has(step.to) : drawn(step.from, step.to)]
    : [has(step.from), has(step.to)];

  // The reference film: the dummy's film of exactly this step (the last listed first, one that failed its check left out), or
  // where the rule takes one, a film of the step that Jakob approved himself. A choice of the order, never a need: where
  // none is found the film is ordered without one (the store does the same), and the row says what was not there.
  const rule = recipe?.reference ?? null;
  const dummy = f.refs.filter(r => r.edge === step.id && r.check?.pass !== false).at(-1) ?? null;
  const banked = rule === 'samma-plats-rakt-godkänd' || rule === 'renderad-eller-samma-plats'
    ? f.takes.find(t => t.from === step.from && t.to === step.to && t.byJakob && !t.provisional && (t.verdict === 'godkand' || t.verdict === 'primar')) ?? null : null;
  const useDummy = rule !== 'ingen' && rule !== 'samma-plats-rakt-godkänd' ? dummy : null;
  const reference: Need = rule === 'ingen' ? {ok: true, what: 'behövs inte: receptet tar ingen'}
    : useDummy ? {ok: true, what: `dockans film${useDummy.seconds ? ` (${useDummy.seconds} s)` : ''}`}
    : banked ? {ok: true, what: 'hans godkända film'}
    : rule && def ? {ok: true, what: `ingen, filmen beställs utan: ${referenceAbsent(rule, def)}`}
    : {ok: true, what: dummy ? 'ingen förvald: dockans film finns och kan väljas i beställningen' : 'ingen'};

  const status = method?.status ?? null;
  const model = recipe && def ? modelFor(def, recipe.model) : null;
  const seconds = model && recipe ? secondsOf(model, recipe.seconds, useDummy?.seconds ? {seconds: useDummy.seconds} : null) : null;
  const recipeNeed: Need & {status: string | null} = !key ? {ok: false, what: 'Beställ har inget sådant steg', status}
    // Beställ's sheet does not order the step (def.off): a return is ordered with the command below, from the approved deal to
    // this step's own card and its end picture. Said for the card, without a path (def.off names one card for every return).
    : def?.off ? {ok: false, what: step.kind === 'retur' ? `provet beställs med kommandot nedan, ur den godkända given till ${nodeCode(step.card ?? step.from)} och dess slutbild` : def.off, status}
    // What has been tried, in plain words (triedWords), in place of the status; the command takes no model, so a step
    // without a recipe is ordered from Bordet, where the model and the length are chosen.
    : recipe ? {ok: true, what: [recipe.model, recipe.resolution, seconds ? `${seconds} s` : null, `${recipe.takes} ${recipe.takes === 1 ? 'tagning' : 'tagningar'}`, triedWords(recipe.method).tried].filter(Boolean).join(' · '), status}
    : {ok: false, what: `${NO_RECIPE}: välj modell och längd i Bordets Beställ`, status};
  const cost = model && recipe && def ? costOf({model: recipe.model, params: paramsOf(def, model, {duration: seconds ?? undefined, resolution: recipe.resolution})}, recipe.takes, f.prices) : null;
  return {step: key, first, last: end, reference, recipe: recipeNeed, price: cost ? cost.worstTotal : null, command: orderCommand(f.dealer, step.from, step.to)};
}

/** Every tree of a dealer as Karta draws it, from what the placing already read. */
function viewsOf(w: World, dealer: string): TreeView[] {
  const defs = w.register.dealers[dealer]?.trees ?? [];
  if (!defs.length) return [];
  const takes = placedTakes(w, dealer), sent = deliveries(w, dealer);
  const facts: Facts = {dealer, takes, entries: w.entries,
    methods: readMethods(json('data/order-methods.json')).register,
    prices: json<Policy>('data/order-policy.json')?.prices ?? [],
    refs: json<{films?: RefFilm[]}>('data/rendered-references.json')?.films ?? []};
  return defs.map(def => {
    const view = treeView(dealer, def, defs, w.entries, takes, sent);
    return {...view, steps: view.steps.map(s => s.state === 'finns' ? s : {...s, order: orderFacts(facts, view, s)})};
  });
}

/** GET /api/trees?dealer=<id>: the dealer's trees with their nodes, 36 steps and number. */
export async function treeAnswer(dealer: string): Promise<TreeAnswer> {
  return {schemaVersion: 1, dealer, made: new Date().toISOString(), trees: viewsOf(await readWorld(dealer), dealer)};
}

export async function serveTrees(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const send = (status: number, body: unknown) => { res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return send(405, {error: 'Bara GET.'});
  const dealer = url.searchParams.get('dealer') ?? '';
  if (!/^[a-z0-9-]+$/.test(dealer)) return send(400, {error: 'Ange ?dealer=<id>.'});
  try { send(200, await treeAnswer(dealer)); } catch (e) { send(500, {error: e instanceof Error ? e.message : String(e)}); }
}

// ── The report in his words ─────────────────────────────────────────────────
type Report = Awaited<ReturnType<typeof buildReport>>;
const sum = (rows: {mb: number}[]) => Math.round(rows.reduce((s, r) => s + r.mb, 0) * 10) / 10;
const fmt = (n: number) => n.toLocaleString('sv-SE', {maximumFractionDigits: 1});
const cell = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
/** Whether the game plays the film, in the game's own words: picked (with how often), held but never picked, or not held. */
const playsCell = (x: Row) => x.plays ? `ja${x.use ? `, ${x.use}` : ''}` : x.inGame ? 'nej, i spelets bank men väljs aldrig' : 'nej';

export function lasmig(r: Report): string {
  const L: string[] = [], dealerName = (d: string) => d[0].toUpperCase() + d.slice(1);
  const treeName = (id: string | null) => r.trees.find(t => t.id === id)?.name ?? '–';
  L.push(`# Dealerträd`, '', `Byggd ${r.made.slice(0, 16).replace('T', ' ')} av \`node tools/dealer-tree.ts${r.only ? ` --dealer ${r.only}` : ''}\`. Läser bara; skriver inget i registren. Träden och deras namn står i \`data/dealer-trees.json\`; allt annat räknas ut ur registren. Alla poster med skäl: \`trad.json\` bredvid.`, '');
  L.push('Steg för steg mot hans mått (vilka av de 36 stegen som finns, är prov eller saknas, och vad en beställning av ett saknat steg har) visar Karta i studion, ur `GET /api/trees`.', '');
  L.push('Grupperna: **kopplad** = filmens ankare är trädets. **halvkopplad** = ett ankare som inget träd har (äldre försök, ersatt eller arkiverad bild), en experimentnod, ingen bild där två träd delar nivån, eller ingen tagning i banken; med troligt steg som förslag. **okopplad** = ingen kant alls, eller en filmmapp utan post. MB är storleken på disk, varje fil en gång: en fil med två hårda länkar räknas där den först möts.', '');

  for (const dealer of r.dealers) {
    const rows = r.rows.filter(x => x.dealer === dealer), trees = r.trees.filter(t => t.dealer === dealer);
    L.push(`## ${dealerName(dealer)}`, '');
    L.push('| Träd | Läge | Ankare | Måttet (steg med film av 36) | Tagningar (kopplade) | Spelas | MB (tagningar och källfilmer) |', '|---|---|---|---|---|---|---|');
    for (const t of trees) {
      const own = t.shares ? rows.filter(x => x.tree === t.shares && x.group === 'kopplad') : rows.filter(x => x.tree === t.id && x.group === 'kopplad');
      const takes = own.filter(x => x.kind === 'tagning');
      const levels = Object.entries(t.levels).map(([c, e]) => `${c} ${e}${r.entries.get(e)?.state && r.entries.get(e)!.state !== 'gäller' ? ` (${r.entries.get(e)!.state})` : ''}`).join(' · ');
      L.push(`| ${t.name}${t.shares ? ` (delar ${treeName(t.shares)})` : ''} | ${t.state} | ${levels} | ${r.counts[`${dealer}/${t.id}`] ?? '–'}${t.opening ? ' + början' : ''} | ${takes.length} | ${takes.filter(x => x.plays).length} | ${fmt(sum(own))} |`);
    }
    L.push('');
    for (const t of trees.filter(t => !t.shares)) {
      const derived = rows.filter(x => x.tree === t.id && x.group === 'kopplad' && x.kind === 'tagning' && x.via?.includes('härledd')).length;
      if (derived) L.push(`**${t.name}**: ${derived} av filmerna har ingen ankarbild i sin post för någon nod; trädet följer då av noden, eftersom bara ${t.name} har den nivån (står som "härledd ur noden" i trad.json).`, '');
    }
    for (const w of r.ways.filter(w => trees.some(t => t.id === w.tree))) {
      L.push(`**${w.name}** · filmen före spelet`, '', `- Början: \`${w.film}\` (${w.path}), slutar på trädets A1 (\`${w.ends}\`), samma A1 som ${treeName(w.home)}.`,
        `- Därefter spelar spelet: ${w.after.map(a => `\`${a.id}\` (${treeName(a.tree)})`).join(', ')}${w.line ? `; repliken för insatserna är \`${w.line.clip}\`` : ''}.`,
        `- ${w.same ? `Samma tagningar som ${treeName(w.home)}: det enda som skiljer är början (filmen före spelet), som går in i A1.` : 'Spelet spelar här tagningar som inte är det delade trädets.'}`, '');
    }
  }

  L.push('## Summor', '', '| Dealer | Träd | Kopplade poster | MB | Halvkopplade poster | MB | Okopplade poster | MB |', '|---|---|---|---|---|---|---|---|');
  for (const dealer of r.dealers) {
    const rows = r.rows.filter(x => x.dealer === dealer), g = (l: typeof rows, k: string) => l.filter(x => x.group === k);
    for (const t of r.trees.filter(t => t.dealer === dealer && !t.shares)) { const l = rows.filter(x => x.tree === t.id); L.push(`| ${dealerName(dealer)} | ${t.name} | ${g(l, 'kopplad').length} | ${fmt(sum(g(l, 'kopplad')))} | – | – | – | – |`); }
    const out = rows.filter(x => !x.tree);
    L.push(`| ${dealerName(dealer)} | utanför träden | – | – | ${g(out, 'halvkopplad').length} | ${fmt(sum(g(out, 'halvkopplad')))} | ${g(out, 'okopplad').length} | ${fmt(sum(g(out, 'okopplad')))} |`);
    L.push(`| ${dealerName(dealer)} | **alla poster** | ${g(rows, 'kopplad').length} | ${fmt(sum(g(rows, 'kopplad')))} | ${g(rows, 'halvkopplad').length} | ${fmt(sum(g(rows, 'halvkopplad')))} | ${g(rows, 'okopplad').length} | ${fmt(sum(g(rows, 'okopplad')))} |`);
  }
  L.push('', 'Raderna är posterna i `motions/` (tagningar och källfilmer) och filmmappar i `assets/motions/` utan post. En tagning som är skuren ur en källfilm har ingen egen mapp (0 MB); källfilmen bär storleken.', '');

  L.push('## Halvkopplat, per skäl', '', '| Dealer | Skäl | St | MB | Exempel | Troligt steg (förslag) |', '|---|---|---|---|---|---|');
  const reasonKey = (s: string) => s.replace(/(paow|pamela)-[a-z0-9-]+/g, '…').replace(/\s+\([^)]*\)/g, '').slice(0, 90);
  for (const dealer of r.dealers) {
    const half = r.rows.filter(x => x.dealer === dealer && x.group === 'halvkopplad'), by = new Map<string, typeof half>();
    for (const x of half) { const k = x.reason!.startsWith('äldre försök till') ? x.reason!.slice(0, x.reason!.indexOf(':')) : reasonKey(x.reason!); by.set(k, [...(by.get(k) ?? []), x]); }
    for (const [k, l] of [...by].sort((a, b) => b[1].length - a[1].length)) L.push(`| ${dealerName(dealer)} | ${cell(k)} | ${l.length} | ${fmt(sum(l))} | ${l.slice(0, 3).map(x => `\`${x.id}\``).join(', ')} | ${cell([...new Set(l.map(x => x.proposal).filter(Boolean))].slice(0, 2).join('; '))} |`);
  }
  L.push('', '## Okopplat', '', '| Dealer | Skäl | St | MB | Exempel |', '|---|---|---|---|---|');
  for (const dealer of r.dealers) {
    const none = r.rows.filter(x => x.dealer === dealer && x.group === 'okopplad'), by = new Map<string, typeof none>();
    for (const x of none) { const k = reasonKey(x.reason!); by.set(k, [...(by.get(k) ?? []), x]); }
    for (const [k, l] of by) L.push(`| ${dealerName(dealer)} | ${cell(k)} | ${l.length} | ${fmt(sum(l))} | ${l.slice(0, 3).map(x => `\`${x.id}\``).join(', ')} |`);
  }
  if (r.motionsNoFilm.length) L.push('', `${r.motionsNoFilm.length} mappar under assets/motions/ har ingen post och ingen film, bara genereringens anteckningar (till exempel ${r.motionsNoFilm.slice(0, 2).map(n => `\`${n}\``).join(', ')}); de räknas inte som filmer.`);
  if (r.unknownElsewhere.length) L.push('', `Filmer under assets/ som inget register nämner, utanför dealerns mappar: ${r.unknownElsewhere.map(u => `\`${u.path}\` (${fmt(u.mb)} MB)`).join(', ')}.`);
  for (const k of r.kept) L.push('', `\`${k.path}/\` är en bevarad samling (Jakob 2026-11-21: alla noir-filmer i en mapp), inte löst material: ${k.films} filmer, ${fmt(k.mb)} MB i mappen, varav ${fmt(k.mbOwn)} MB som inte redan räknats som hårda länkar till prov eller filmen före spelet.`);
  if (r.receiptsOnly.length) L.push('', `${r.receiptsOnly.length} mappar under assets/films/ har bara kvar ett kvitto (receipt.json); filmen är redan borta.`);

  L.push('', '## Varianter', '', 'Trädets läge är registrets ord (spelas, byggs, vilar); "Filmen spelas" är spelets eget svar när dealern är vald.', '');
  for (const t of r.trees.filter(t => t.state !== 'spelas' && r.rows.some(y => y.tree === t.id && y.plays))) L.push(`- ${t.name} ${t.state}, men spelet har kvar dealerns filmer och spelar dem när dealern väljs i spelets Dealer-meny.`);
  L.push('', '| Variant | Träd | Steg | Trädets läge | Filmen spelas |', '|---|---|---|---|---|');
  for (const x of r.rows.filter(x => x.variant)) {
    const t = r.trees.find(t => t.id === x.tree);
    L.push(`| \`${x.id}\` | ${t ? t.name : `inget (${x.group})`} | ${x.step} | ${t ? t.state : '–'} | ${playsCell(x)} |`);
  }

  L.push('', '## Löst material', '', 'Allt som inte hänger i ett träd: halvkopplade och okopplade poster, beställningar, filmer utanför banken, talets mappar och prov. Inget av det raderas av verktyget.', '');
  const loose = [...r.rows.filter(x => !x.tree).map(x => ({id: x.id, dealer: x.dealer, kind: x.kind, mb: x.mb, verdict: x.verdict, good: x.good || x.variant, reason: [x.note, x.reason].filter(Boolean).join('; '), plays: x.plays})),
    // A file that is also in a kept collection is not loose: only the rest of the bytes count.
    ...r.outside.filter(o => !o.tree).map(o => ({id: o.id, dealer: o.dealer, kind: o.kind, mb: Math.round((o.mb - (o.keptMb ?? 0)) * 10) / 10, verdict: o.verdict, good: o.good,
      reason: `${o.reason}${o.keptMb ? `; ${fmt(o.keptMb)} MB av den är samma filer som den bevarade samlingen och räknas inte här` : ''}`, plays: o.plays}))];
  const good = loose.filter(x => x.good);
  L.push(`### Löst men dömt bra (${good.length} st, ${fmt(sum(good))} MB)`, '', 'Variant, Godkänd eller Primär (av honom, åt honom eller av granskare), eller hans val "bra" på ett prov. Rörs inte utan hans blick.', '',
    '| Post | Dealer | Slag | Dom | Spelas | MB | Skäl |', '|---|---|---|---|---|---|---|');
  for (const x of good.sort((a, b) => b.mb - a.mb)) L.push(`| \`${x.id}\` | ${x.dealer} | ${x.kind} | ${cell(x.verdict)} | ${x.plays ? 'ja' : 'nej'} | ${fmt(x.mb)} | ${cell(x.reason).slice(0, 110)} |`);
  L.push('', '### Övrigt löst, per slag', '', '| Dealer | Slag | St | MB | Störst |', '|---|---|---|---|---|');
  const rest = loose.filter(x => !x.good), kinds = new Map<string, typeof rest>();
  for (const x of rest) { const k = `${x.dealer}|${x.kind}`; kinds.set(k, [...(kinds.get(k) ?? []), x]); }
  for (const [k, l] of [...kinds].sort((a, b) => sum(b[1]) - sum(a[1]))) { const [d, kind] = k.split('|'); L.push(`| ${d} | ${kind} | ${l.length} | ${fmt(sum(l))} | ${[...l].sort((a, b) => b.mb - a.mb).slice(0, 3).map(x => `\`${x.id}\``).join(', ')} |`); }
  const keptShare = sum(r.outside.filter(o => !o.tree && o.keptMb).map(o => ({mb: o.keptMb!})));
  const tick = (s: string) => `\`${s}\``, sharing = r.outside.filter(o => !o.tree && o.keptMb).map(o => tick(o.id)).join(', ');
  L.push('', `Summa löst: ${loose.length} poster, ${fmt(sum(loose))} MB, varav dömt bra ${fmt(sum(good))} MB.${keptShare ? ` Utöver det är ${fmt(keptShare)} MB i ${sharing} samma filer som den bevarade samlingen ${r.kept.map(k => tick(`${k.path}/`)).join(', ')}; de är inte lösa.` : ''}`, '');
  L.push('### Radera: så går det till', '', 'Verktyget raderar ingenting. En radering går genom `tools/local-work.md`, avsnittet "Radera oanvänt material": kör `npm run media:status` och se roller och hänvisningar; `tools/media-audit.ts` ensamt är inget raderingslov, utan spelets bank, scenen, Material, Prov och Beslut, hans domar, beställningar, referenser och pågående arbete kontrolleras först; V6 och original som används är skyddade. Unikt material som är verifierat oanvänt får raderas (Jakob 2026-11-19), och registren beskriver samtidigt det som togs bort: en raderad underkänd film får `RADERAD.txt` och dess post i `motions/` står kvar. Dubbla kopior går med `tools/media-dedupe.ts`; kvittona läggs under `.runtime/cleanup/`. Det "dömt bra" ovan raderas inte utan hans ord.', '');

  L.push('## Säten (S)', '', 'P är spelaren som får kortet (A3P2C1); S är stolen eller kameravinkeln ett ankare ses ifrån (S2-A2.2). Ett ankare utan `seat` i trädregistret är den raka kameran.', '');
  L.push(`- Ankare i Material med en vinkel: ${r.seats.anchors.length ? r.seats.anchors.join(', ') : 'inga'}. Poster i motions/ med en vinkel: ${r.seats.records.length ? r.seats.records.join(', ') : 'inga'}. Ankare med \`seat\` i trädregistret: ${r.seats.treeSeats.length ? r.seats.treeSeats.join(', ') : 'inga'}.`);
  L.push(`- Spelet har alltså inga ankare eller filmer från en annan vinkel än den raka. Det som finns är prov i Granska, utanför banken${r.seats.proofs.some(p => p.plays) ? '' : ', och spelet använder inget av dem'}:`, '');
  L.push('| Prov | Titel | Gjort | Spelas |', '|---|---|---|---|');
  for (const p of r.seats.proofs) L.push(`| \`${p.id}\` | ${cell(p.title)} | ${p.made} | ${p.plays ? 'ja' : 'nej'} |`);

  if (r.dolls.length) {
    L.push('', '## Dockans filmer', '', 'Referensfilmer ur 3D-dockan (`data/rendered-references.json`), inte dealerfilmer: en beställning tar dem som rörelseförlaga. De står på en egen rad och räknas inte i grupperna.', '',
      '| Docka | Steg | Träd | MB | Varför |', '|---|---|---|---|---|');
    for (const d of r.dolls) L.push(`| \`${d.id}\` | ${d.step} | ${d.tree ? treeName(d.tree) : 'äldre försök / inget'} | ${fmt(d.mb)} | ${cell(d.why).slice(0, 140)} |`);
  }
  L.push('', '## Hur verktyget avgör', '', '- Ett ankare hör till trädet när det står bland trädets ankare i registret. En landning (A3) eller ett A1/A2.x med ett kort liggande hör också dit när den är byggd på trädets ankare och inte ersatt eller arkiverad; ett träd som pekar ut sitt eget A3 (Tatuerad: A3P4C1) tar bara det.',
    '- Filmens bilder läses ur beställningens `pictures[].from`, jobbets första och sista bild, given den börjar i, källfilmen den är skuren ur och vilofilmen talet ligger på. Filnamn läses aldrig som bevis.',
    '- "Spelas" är spelets eget svar över labbets bank: filmen finns i spelets bank (`gameTakes`) och spelet väljer den också (`usesOf` säger inte "Spelas inte"). En film i banken som aldrig väljs står som "i spelets bank men väljs aldrig". Primär och domarna läses, rörs aldrig.',
    '- Namnen byggs ur grafens noder (`src/dealer-trees.ts` nodeCode), med "A3" framför kortets nod (P4.C1 → A3P4C1), som Karta skriver dem.',
    '- Måttet: 36 steg per träd (vila, ingång, 16 givar, 16 returer, utgång, hålkortet) från trädets första A2.x-ankare; ett steg finns när en film på det är Primär, Godkänd eller Variant, är prov när en film väntar på dom eller en levererad beställning väntar utanför banken, och saknas annars.');
  return L.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), d = args.indexOf('--dealer'), only = d >= 0 ? args[d + 1] ?? null : null;
  const report = await buildReport(only);
  if (only && !report.dealers.length) { console.error(`${only} finns inte i data/dealers.json`); process.exit(1); }
  const out = at('.runtime/dealer-trad');
  mkdirSync(out, {recursive: true});
  writeFileSync(path.join(out, 'LASMIG.md'), lasmig(report));
  const {entries: _entries, ...data} = report;
  writeFileSync(path.join(out, 'trad.json'), JSON.stringify({schemaVersion: 1, about: 'Every film against the dealer trees; written by node tools/dealer-tree.ts, rebuilt on each run.', ...data}, null, 1) + '\n');
  const g = (k: Group) => report.rows.filter(r => r.group === k);
  console.log(`${report.rows.length} poster: kopplad ${g('kopplad').length} (${fmt(sum(g('kopplad')))} MB), halvkopplad ${g('halvkopplad').length} (${fmt(sum(g('halvkopplad')))} MB), okopplad ${g('okopplad').length} (${fmt(sum(g('okopplad')))} MB)`);
  console.log(`Skrev ${path.relative(ROOT, out).replace(/\\/g, '/')}/LASMIG.md och trad.json`);
  if (!existsSync(path.join(out, 'LASMIG.md'))) process.exit(1);
}
