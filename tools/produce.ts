// The production list: for one dealer, every step the clip bank's graph needs (src/clip-graph.ts, seat mode, the hole card
// closed: the 33 films the studio's Karta and Primära count), what exists (what plays now, by the same function as Karta:
// studio/lib/edge-stats.ts playing, with the verdict of studio/lib/verdict.ts), what is in flight (drafts and approved
// orders of Beställ for that step), whether a round needs it (the round src/clip-graph.ts roundSequence plays: every
// player two cards, the dealer two and the hole card turned, with the rest between), what it needs before it can be
// ordered (the anchors and landing pictures that must hold in Material, a straight-approved reference film where the
// method asks for one) and the method of record for it (data/order-methods.json, src/order-methods.ts). From that each
// step gets one state in Jakob's words: klar, levererad och väntar på hans dom, beställd, utkast, kommer med given, kan
// beställas nu, kan provas, väntar på en bild, ingen metod än, inte byggd.
//
//   node tools/produce.ts <dealer>                                the list, in Swedish, for a terminal
//   node tools/produce.ts <dealer> --json                         the same as data
//   node tools/produce.ts <dealer> --draft                        drafts through the store for every step that is missing,
//                                                                 can be ordered now and whose method holds (gäller)
//   node tools/produce.ts <dealer> --draft --trial <step|seat>    one trial draft (one take) for a step whose method is prov:
//                                                                 an edge (READY>P2.C1), a seat (P2, D.C2) or a step (VILA)
//   … --again                                                     also where a draft or an order is already in flight
//   … --root <folder>                                             another checkout (a temporary copy of the data)
// It never approves. Every draft says in createdBy that the production list made it. The lab server answers
// GET /api/production?dealer=<id> and POST /api/production/draft with the same functions (tools/order-routes.ts).
// productionList is pure; the reading is readProduction. Tests: tools/produce.test.ts.
import { readFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEATS, bankEdges, buildGraph, parseEdge, roundSequence, type BankData, type EdgeKind, type Graph } from '../src/clip-graph.ts';
import { ANCHOR_NODE, ANCHOR_ROLE, FLIP_AXES, LANDING_ROLE, MODELS, SHOWN_LABEL, landingNode, referenceCandidates, seatWords, stepOf, type BankFacts, type FlipAxis, type Order, type Shown, type StepKey } from '../src/order-model.ts';
import { methodFor, readMethods, recipeWords, type Method, type MethodRegister } from '../src/order-methods.ts';
import { bankSummary, hubAnchor, playing, type Hubs, type Summary } from '../studio/lib/edge-stats.ts';
import { hubDeals } from '../src/game-director.ts';
import { VERDICT_LABEL, verdictOf, verdictPhrase, type Verdict } from '../studio/lib/verdict.ts';
import type { Entry } from '../studio/lib/media.ts';
import { mediaRoles } from './media-roles.ts';
import { orderStore, type NewOrder } from './order-store.ts';
import { StoreError } from './placement-store.ts';

// ── Words ───────────────────────────────────────────────────────────────────
export type RowState = 'KLAR' | 'DOM' | 'BESTÄLLD' | 'UTKAST' | 'MED_GIVEN' | 'KAN' | 'PROV' | 'VÄNTAR' | 'INGEN_METOD' | 'INTE_BYGGD';
export const ROW_STATES: readonly RowState[] = ['KAN', 'PROV', 'VÄNTAR', 'INGEN_METOD', 'INTE_BYGGD', 'UTKAST', 'BESTÄLLD', 'DOM', 'MED_GIVEN', 'KLAR'];
export const ROW_STATE_LABEL: Record<RowState, string> = {
  KLAR: 'klar',
  DOM: 'levererad, väntar på din dom',
  BESTÄLLD: 'beställd, väntar på leverans',
  UTKAST: 'utkast, väntar på godkännande',
  MED_GIVEN: 'kommer med given',
  KAN: 'kan beställas nu',
  PROV: 'kan provas nu',
  VÄNTAR: 'väntar på en bild',
  INGEN_METOD: 'ingen metod än',
  INTE_BYGGD: 'inte byggd',
};
/** What a step has now: the verdict of the take that plays (as Karta's chip says it), or saknas when nothing plays. */
export type Have = Verdict | 'saknas';
/** The states of an order that is still on its way: a draft, or approved and not yet reviewed or brought in. */
const IN_FLIGHT: readonly Shown[] = ['UTKAST', 'VÄNTAR', 'KLAR_ATT_TRYCKA', 'GODKÄND', 'LAGD', 'OSÄKER', 'KLAR', 'HÄMTAD', 'EFTERARBETAD', 'MÄTT'];
const DELIVERED: readonly Shown[] = ['HÄMTAD', 'EFTERARBETAD', 'MÄTT'];

/** "plats 2", "dealerns kort", "hålkortet": a card of the round in Jakob's words. */
export function cardWords(target: string): string {
  if (target === 'D.C1') return 'dealerns kort';
  if (target === 'D.C2') return 'hålkortet';
  return seatWords(target);
}
/** A step of the graph in Jakob's words: "Giv · plats 2", "Retur · plats 2 → ankare 2.1", "Hålkortet vänds upp". */
export function stepLabel(edge: { id: string; kind: EdgeKind | null; target: string | null; to: string }): string {
  const t = edge.target;
  switch (edge.kind) {
    case 'ENTRY': return 'Ingång · ankare 1 → 2.1';
    case 'IDLE': return 'Vila';
    case 'REVEAL': return 'Hålkortet vänds upp';
    case 'ARRIVE': return 'Kommer in och sätter sig';
    case 'LEAVE': return 'Reser sig och går';
    case 'DEAL': return `Giv · ${cardWords(t!)}${t === 'D.C2' ? ' (stängt)' : ''}`;
    case 'RETURN': return t ? `Retur · ${cardWords(t)} → ${edge.to === 'READY' ? 'ankare 2.1' : 'vila'}` : 'Utgång · ankare 2.1 → 1';
    default: return edge.id;
  }
}

/** The step of Beställ that makes an edge of the graph, and the card it is about; null where Beställ cannot (yet). */
export function stepFor(edge: { kind: EdgeKind | null; target: string | null; to: string }): { step: StepKey; target: string | null } | null {
  switch (edge.kind) {
    case 'ENTRY': return { step: 'INGANG-2.1', target: null };
    case 'IDLE': return { step: 'VILA', target: null };
    case 'REVEAL': return { step: 'HALKORT', target: null };
    case 'DEAL': return { step: 'GIV-2.1', target: edge.target };
    case 'RETURN': return edge.target ? { step: edge.to === 'READY' ? 'RETUR-2.1' : 'RETUR-1', target: edge.target } : { step: 'UTGANG', target: null };
    default: return null;
  }
}

// ── The list ────────────────────────────────────────────────────────────────
/** An order as the list needs it: the order and the one status Beställ shows for it (tools/order-store.ts list). */
export type OrderLike = { order: Pick<Order, 'id' | 'title' | 'dealer' | 'kind' | 'status' | 'approval' | 'step' | 'created'>; shown: Shown };
export type ProductionInput = {
  dealer: { id: string; name: string };
  graph: Graph;
  /** The bank as a reference film needs it (referenceCandidates). */
  bank: BankFacts;
  methods: Pick<MethodRegister, 'methods'> | null;
  /** The dealer's entries in Material (data/media-roles.json). */
  entries: readonly Entry[];
  orders: readonly OrderLike[];
  /** Each card's side as the plan lays it (Placering): what the pictures draw. */
  sides?: Readonly<Record<string, 'FRONT' | 'BACK'>>;
  createdBy?: string;
  /** What the dealer's round deals from another pose at the shoe, by the game's rule (hubDeals in src/game-director.ts); none: every step as its edge plays. */
  hubs?: Hubs;
};
export type InFlight = { id: string; title: string; shown: Shown; approved: boolean; delivered: boolean };
export type RowPicture = { path: string | null; frame: number | null; waits: string | null; cards: { target: string; side: 'FRONT' | 'BACK' }[] };
export type ProductionRow = {
  edge: string;
  label: string;
  kind: EdgeKind | null;
  target: string | null;
  /** A round needs it (roundSequence with every seat, the dealer and the hole card turned, and the rest between). */
  needed: boolean;
  have: Have;
  /** The take that plays now, and whether the verdict is Jakob's own, or provisional (judged for him: "åt dig", not waiting). */
  take: string | null;
  /** The pose at the shoe the round plays this step from when it is not the edge's own (READY-B for a seat dealt via anchor 2.2). */
  hub: string | null;
  byJakob: boolean;
  provisional: boolean;
  orders: InFlight[];
  step: StepKey | null;
  /** The method of record, its recipe as it would be ordered for this seat, and the reference film chosen (a take of the bank). */
  method: { id: string; status: Method['status']; recipe: string; reference: string | null } | null;
  /** What must hold before it can be ordered, in words ("ankare 2.2", "landningsbild på plats 2"). */
  needs: string[];
  /** The return comes with this deal (tur och retur). */
  comesWith: string | null;
  state: RowState;
  words: string;
  /** What --draft (KAN: the method holds) or --trial (PROV) would send; null where nothing can be sent now. */
  orderable: 'KAN' | 'PROV' | null;
  draft: NewOrder | null;
  picture: RowPicture;
};
export type Anchor = { at: '1' | '2.1' | '2.2'; state: 'gäller' | 'kandidat' | 'saknas'; path: string | null; name: string | null; candidates: number; orders: InFlight[] };
export type Production = {
  dealer: { id: string; name: string };
  rows: ProductionRow[];
  anchors: Anchor[];
  landings: string[];
  /** provisional: of the klar steps, those whose verdict was given for him (tools/review-put.ts); his own decision replaces it. */
  counts: { total: number; done: number; needed: number; neededDone: number; missing: number; provisional: number; byState: Record<RowState, number> };
  /** Karta's own count over the same graph (bankSummary): its "saknas" is counts.missing. */
  karta: Summary;
  notes: string[];
};

const isPicture = (e: Entry) => !!e.path && (e.frame !== undefined || /\.(?:png|jpe?g)$/i.test(e.path)) && !/^[A-Za-z]:\//.test(e.path);
/** The dealer's anchor that holds (gäller, no card, its node), as the store takes it (tools/order-store.ts holding). */
export function anchorHolding(entries: readonly Entry[], at: '1' | '2.1' | '2.2'): Entry | null {
  return entries.find((e) => e.role === ANCHOR_ROLE[at] && e.state === 'gäller' && !e.card && e.node === ANCHOR_NODE[at] && isPicture(e)) ?? null;
}
/** A seat's landing picture that holds, as the store takes it (landingEntry). */
export function landingHolding(entries: readonly Entry[], target: string | null): Entry | null {
  return target ? (entries.find((e) => e.role === LANDING_ROLE && e.node === landingNode(target) && e.state === 'gäller' && e.card === target && isPicture(e)) ?? null) : null;
}

/** The films a round plays, by the film each step plays in seat mode, and the rest between (the game plays it between deals). */
export function roundFilms(graph: Graph): string[] {
  const films: string[] = [];
  const add = (id: string) => { if (!films.includes(id)) films.push(id); };
  const seq = roundSequence({ seats: SEATS, reveal: true });
  add(seq[0].id);
  add('IDLE>IDLE');
  for (const e of seq.slice(1)) add(graph.edge[e.base]?.shares ?? e.base);
  return films;
}

/**
 * The bank's takes a reference film may be: a deal to the same seat (the same step first, then the same seat from the other
 * grip, as referenceCandidates orders them), approved straight by Jakob, of a length the model takes; the dealer's own first.
 */
export function straightReferences(bank: BankFacts, dealer: string, step: StepKey, target: string | null, model: string | null) {
  const def = stepOf(step), m = model ? MODELS[model] : null;
  if (!def || !m?.videos) return [];
  return referenceCandidates(bank, { dealer, step: def, target, model: m }).filter((c) => c.match <= 1 && c.approvedStraight && c.verdict === 'GODKÄND' && c.fits);
}

/** The draft the list would make for a row: from the method, the seat and the reference chosen; one take and a trial's title for a trial. */
export function draftOf(input: Pick<ProductionInput, 'dealer' | 'createdBy'>, row: Pick<ProductionRow, 'label' | 'edge'>, at: { step: StepKey; target: string | null }, method: Method, reference: string | null, trial: boolean): NewOrder {
  const def = stepOf(at.step)!;
  const flip = method.turn && method.turn !== 'plan' && FLIP_AXES.includes(method.turn as FlipAxis) ? (method.turn as FlipAxis) : undefined;
  const short = [MODELS[method.model!]?.label ?? method.model, reference ? 'referensfilm' : null].filter(Boolean).join(' + ');
  return {
    dealer: input.dealer.id,
    step: at.step,
    ...(def.card && at.target ? { target: at.target } : {}),
    ...(method.model && method.model !== def.model ? { model: method.model } : {}),
    ...(def.kind === 'FILM' && method.seconds ? { duration: method.seconds } : {}),
    ...(method.style ? { style: method.style } : {}),
    takes: trial ? 1 : (method.takes ?? 2),
    extra: method.extra,
    ...(def.card && def.start !== 'LAND' && method.shape ? { shape: method.shape } : {}),
    ...(reference ? { reference } : {}),
    ...(flip ? { flipAxis: flip } : {}),
    ...(trial ? { title: `${input.dealer.name} · prov: ${row.label.replace(' · ', ' till ').toLowerCase()} · ${short}`.slice(0, 120) } : {}),
    notes: [`Metod ${method.id} (${method.status}) ur data/order-methods.json: ${recipeWords(method)}.`, ...(trial ? ['Ett prov: en tagning, en ändring mot jämförelsen i metodens belägg.'] : [])],
    createdBy: `${input.createdBy ?? 'Produktionslistan (node tools/produce.ts --draft)'}${trial ? ', prov' : ''}: steg ${row.edge}, metod ${method.id}`,
  };
}

/** Every step of the dealer's graph with what exists, what is in flight, what it needs, its method and its state. Pure. */
export function productionList(input: ProductionInput): Production {
  const { graph, entries, dealer } = input;
  const needed = new Set(roundFilms(graph));
  const sides = input.sides ?? {};
  const mine = input.orders.filter((o) => o.order.dealer === dealer.id && o.order.status !== 'AVBRUTEN');
  const flightOf = (o: OrderLike): InFlight => ({ id: o.order.id, title: o.order.title, shown: o.shown, approved: !!o.order.approval, delivered: DELIVERED.includes(o.shown) });
  const edgesOfOrder = (o: OrderLike) => (o.order.step.cutInto?.length ? o.order.step.cutInto : o.order.step.edge ? [o.order.step.edge] : []).map((e) => parseEdge(e)?.base ?? e);
  const inFlight = (edge: string) => mine.filter((o) => IN_FLIGHT.includes(o.shown) && edgesOfOrder(o).includes(edge)).map(flightOf);
  const anchorWords = (at: '1' | '2.1' | '2.2') => `ankare ${at}`;

  // Each step, in the order a round plays them, then the rest of the graph.
  const order = [...needed, ...bankEdges().map((e) => e.id).filter((id) => graph.summary.films.required.includes(id) && !needed.has(id))];
  const ids = order.filter((id) => graph.summary.films.required.includes(id));
  const rows: ProductionRow[] = [];
  for (const id of ids) {
    const edge = graph.edge[id];
    const now = playing(graph, id, input.hubs);
    const v = now.take ? verdictOf(now.take) : null;
    const have: Have = v ? v.verdict : 'saknas';
    const at = stepFor(edge);
    const method = at ? methodFor(input.methods, at.step, at.target) : null;
    const def = at ? stepOf(at.step) : null;
    // What must hold first: the anchors the step's pictures are made from, a landing picture for a return.
    const needs: string[] = [];
    if (def) {
      const anchors = new Set<'1' | '2.1' | '2.2'>(def.start === 'LAND' ? [def.to ?? def.from] : [def.from, ...(def.to ? [def.to] : [])]);
      for (const a of anchors) if (!anchorHolding(entries, a)) needs.push(anchorWords(a));
      if (def.start === 'LAND' && !landingHolding(entries, at!.target)) needs.push(`landningsbild på ${cardWords(at!.target!)}`);
    } else if (edge.kind === 'ARRIVE' || edge.kind === 'LEAVE') {
      needs.push('en bild av bordet utan henne (ingen roll i Material än)');
      const standing = entries.some((e) => e.role === 'keystone' && e.state === 'gäller' && /st[aå]ende/i.test(`${e.id} ${e.name}`));
      if (!standing) needs.push('en stående bild av henne');
    }
    // A reference film where the method asks for one: a straight-approved deal to the same seat; without one, the model the
    // method names for that case, or the step waits.
    let reference: string | null = null, withoutReference = false;
    const wantsRef = !!method && method.status !== 'saknas' && method.reference === 'samma-plats-rakt-godkänd';
    if (wantsRef && at) {
      reference = straightReferences(input.bank, dealer.id, at.step, at.target, method!.model)[0]?.take ?? null;
      if (!reference && method!.noReferenceModel) withoutReference = true;
      else if (!reference) needs.push(`rakt godkänd referensfilm till ${cardWords(at.target ?? '')}`);
    }
    // A return to 2.1 comes with its deal while the deal's method goes tur och retur and the deal is not there yet.
    const dealEdge = edge.kind === 'RETURN' && edge.target && edge.to === 'READY' ? `READY>${edge.target}` : null;
    const dealMethod = dealEdge ? methodFor(input.methods, 'GIV-2.1', edge.target) : null;
    const flying = inFlight(id);
    const orderable: ProductionRow['orderable'] = !def || !method || method.status === 'saknas' || needs.length ? null : method.status === 'gäller' ? 'KAN' : 'PROV';
    let state: RowState;
    if (have === 'primar' || have === 'godkand' || have === 'variant') state = 'KLAR';
    else if (have === 'vantar') state = 'DOM';
    else if (flying.some((f) => f.approved)) state = 'BESTÄLLD';
    else if (flying.length) state = 'UTKAST';
    else if (!def) state = 'INTE_BYGGD';
    else if (dealEdge && dealMethod?.shape === 'ROUND_TRIP' && rows.find((r) => r.edge === dealEdge)?.state !== 'KLAR') state = 'MED_GIVEN';
    else if (!method || method.status === 'saknas') state = 'INGEN_METOD';
    else if (needs.length) state = 'VÄNTAR';
    else state = method.status === 'gäller' ? 'KAN' : 'PROV';
    const words =
      state === 'KLAR' ? `klar · ${v?.provisional ? verdictPhrase(v) : `${VERDICT_LABEL[have as Verdict].toLowerCase()}${v && !v.byJakob ? ' (granskaren)' : ''}`}${now.hub ? ` · ges via ${hubAnchor(now.hub)}: ${now.take!.id}` : ''}`
      : state === 'BESTÄLLD' && flying.some((f) => f.approved && f.delivered) ? 'levererad, efterarbetas och granskas'
      : state === 'MED_GIVEN' ? `kommer med given till ${cardWords(edge.target!)} (tur och retur)`
      : state === 'VÄNTAR' ? `väntar på ${needs.join(' och ')}`
      : state === 'INTE_BYGGD' ? `inte byggd: kräver ${needs.join(' och ') || 'en bild utan henne'}`
      : state === 'PROV' ? 'kan provas nu (metoden prövas)'
      : ROW_STATE_LABEL[state];
    // The picture Jakob recognises the step by: the anchor it is made around (a deal's start, the anchor an entry, a way
    // out or a return comes to, rest's own), with its card where the plan lays it. A still, never a film's frame: the
    // view loads no film for it.
    const shownAnchor = def ? (def.start === 'LAND' ? (def.to ?? def.from) : edge.kind === 'ENTRY' ? '2.1' : def.kind === 'FILM' && def.to && !def.card && !def.cards ? def.to : def.from) : null;
    const anchor = shownAnchor ? anchorHolding(entries, shownAnchor) : null;
    const cards = def?.cards ? def.cards.map((c) => ({ target: c.target, side: c.after })) : edge.target && edge.kind !== 'REVEAL' ? [{ target: edge.target, side: sides[edge.target] ?? (edge.target === 'D.C2' ? 'BACK' : 'FRONT') }] : [];
    const picture: RowPicture = anchor && anchor.frame === undefined
      ? { path: anchor.path ?? null, frame: null, waits: null, cards }
      : { path: null, frame: null, waits: def ? anchorWords(shownAnchor!) : 'bild utan henne', cards };
    rows.push({
      edge: id, label: now.hub && edge.kind === 'RETURN' ? stepLabel(edge).replace('ankare 2.1', hubAnchor(now.hub)) : stepLabel(edge), kind: edge.kind, target: edge.target, needed: needed.has(id), have, take: now.take?.id ?? null, hub: now.hub, byJakob: !!v?.byJakob, provisional: !!v?.provisional,
      orders: flying, step: at?.step ?? null, method: method ? { id: method.id, status: method.status, recipe: recipeWords(method, withoutReference), reference } : null, needs,
      comesWith: state === 'MED_GIVEN' ? dealEdge : null, state, words, orderable,
      draft: orderable && method && at ? draftOf(input, { label: stepLabel(edge), edge: id }, at, withoutReference ? { ...method, model: method.noReferenceModel!, reference: 'ingen' } : method, reference, orderable === 'PROV') : null,
      picture,
    });
  }

  const anchors: Anchor[] = (['1', '2.1', '2.2'] as const).map((a) => {
    const own = entries.filter((e) => e.role === ANCHOR_ROLE[a] && e.node === ANCHOR_NODE[a] && !e.card);
    const holds = anchorHolding(entries, a), candidates = own.filter((e) => e.state === 'kandidat');
    return {
      at: a, state: holds ? 'gäller' : candidates.length ? 'kandidat' : 'saknas', path: (holds ?? candidates[0])?.path ?? null, name: (holds ?? candidates[0])?.name ?? null, candidates: candidates.length,
      orders: mine.filter((o) => o.order.kind === 'STILL' && o.order.step.makes?.role === ANCHOR_ROLE[a] && IN_FLIGHT.includes(o.shown)).map(flightOf),
    };
  });
  const landings = entries.filter((e) => e.role === LANDING_ROLE && e.state === 'gäller' && e.card).map((e) => e.card!).sort();
  const byState = Object.fromEntries(ROW_STATES.map((s) => [s, rows.filter((r) => r.state === s).length])) as Record<RowState, number>;
  const counts = {
    total: rows.length, done: byState.KLAR, needed: rows.filter((r) => r.needed).length, neededDone: rows.filter((r) => r.needed && r.state === 'KLAR').length,
    missing: rows.filter((r) => r.have === 'saknas').length, provisional: rows.filter((r) => r.state === 'KLAR' && r.provisional).length, byState,
  };
  const notes = [
    'Dealerns tredje kort (D.C3) är valfritt och räknas inte bland stegen: READY>D.C3 och D.C3>IDLE.',
    'En plats andra kort spelar första kortets filmer med det ritade kortet flyttat, så det behöver ingen egen film.',
  ];
  if (rows.some((r) => r.hub)) notes.push(`En plats som ges via ett annat ankare vid skon spelas i rundan med vila före och efter (src/game-director.ts SEAT_HUB): ${rows.filter((r) => r.hub && r.kind === 'DEAL').map((r) => `${cardWords(r.target!)} via ${hubAnchor(r.hub!)}`).join(', ')}.`);
  return { dealer, rows, anchors, landings, counts, karta: bankSummary(graph, input.hubs), notes };
}

// ── Reading ─────────────────────────────────────────────────────────────────
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
async function readJson<T>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return null; } }

/** The bank as the lab's GET /api/clip-bank reads it (tools/preview.ts clipBank), so the graph is the one Karta draws. */
export async function readBank(root: string): Promise<BankData> {
  const at = (...p: string[]) => path.join(root, ...p);
  const file = await readJson<{ jobs?: unknown[]; derived?: unknown[]; edits?: unknown[]; budget?: BankData['budget'] }>(at('data', 'clip-jobs.json'));
  const named = <T extends { id: string }>(list: unknown) => (Array.isArray(list) ? list : []).filter((x) => typeof (x as { id?: unknown })?.id === 'string' && ID.test((x as { id: string }).id)) as T[];
  const jobs = named<NonNullable<BankData['jobs']>[number]>(file?.jobs);
  const edits = named<NonNullable<BankData['edits']>[number]>(file?.edits).filter((e) => typeof e.source?.clip === 'string');
  const derived = named<NonNullable<BankData['derived']>[number]>(file?.derived).filter((d) => typeof d.clip === 'string' && ID.test(d.clip));
  const motions: NonNullable<BankData['motions']> = {}, receipts: NonNullable<BankData['receipts']> = {}, media: NonNullable<BankData['media']> = {};
  const film = (clip: string) => { const f = at('assets', 'motions', clip, 'source.mp4'); try { return existsSync(f) && realpathSync(f) === path.join(realpathSync(at('assets', 'motions')), clip, 'source.mp4') ? `assets/motions/${clip}/source.mp4` : null; } catch { return null; } };
  type Rec = { source?: unknown; motion?: unknown; review?: unknown };
  for (const take of derived) {
    const own = await readJson<Rec>(at('motions', `${take.id}.json`)), clip = await readJson<Rec>(at('motions', `${take.clip}.json`));
    motions[take.id] = { source: clip?.source, motion: own?.motion, review: own?.review } as never;
    media[take.id] = { video: film(take.clip), first: null, last: null };
  }
  for (const job of [...jobs, ...edits]) {
    const motion = await readJson<Rec>(at('motions', `${job.id}.json`)), receipt = await readJson<{ status?: string; estimatedCredits?: number; requestedAt?: string; completedAt?: string; output?: { bytes?: number; fps?: number; frames?: number; width?: number; height?: number } }>(at('assets', 'motions', job.id, 'generation.json'));
    if (motion) motions[job.id] = { source: motion.source, motion: motion.motion, review: motion.review } as never;
    if (receipt) receipts[job.id] = { status: receipt.status, estimatedCredits: receipt.estimatedCredits, requestedAt: receipt.requestedAt, completedAt: receipt.completedAt, output: receipt.output ? { bytes: receipt.output.bytes, fps: receipt.output.fps, frames: receipt.output.frames, width: receipt.output.width, height: receipt.output.height } : null };
    media[job.id] = { video: film(job.id) };
  }
  return { jobs, derived, edits, budget: file?.budget ?? null, motions, receipts, media };
}

/** Everything the list joins, read from a checkout: the bank and its graph, the methods, Material, the orders, the plan. */
export async function readProduction(root: string, dealerId: string, options: { store?: ReturnType<typeof orderStore>; createdBy?: string } = {}): Promise<{ input: ProductionInput; problems: string[] }> {
  const problems: string[] = [];
  const store = options.store ?? orderStore(root);
  const dealers = (await readJson<{ dealers?: { id: string; name: string }[] }>(path.join(root, 'data', 'dealers.json')))?.dealers ?? [];
  const known = dealers.find((d) => d.id === dealerId);
  if (!known) throw new StoreError(400, `${String(dealerId).slice(0, 40)} finns inte i data/dealers.json.`);
  const bank = await readBank(root);
  const graph = buildGraph(bank, { dealer: dealerId });
  const methodsRead = readMethods(await readJson(path.join(root, 'data', 'order-methods.json')));
  if (!methodsRead.register) problems.push(`data/order-methods.json håller inte: ${methodsRead.errors.join(' ')}`);
  const { register, errors } = await mediaRoles(root).readRegister();
  if (!register) problems.push(`Registret håller inte: ${errors.join('; ')}`);
  const all = await store.list();
  problems.push(...all.problems);
  const sides = Object.fromEntries(Object.entries(all.plan?.seats ?? {}).map(([t, s]) => [t, s.side]));
  return {
    input: {
      dealer: { id: known.id, name: known.name }, graph, bank: bank as BankFacts, methods: methodsRead.register, hubs: hubDeals(bank, dealerId),
      entries: register?.dealers[dealerId]?.entries ?? [], orders: all.orders.map((a) => ({ order: a.order, shown: a.shown })), sides, createdBy: options.createdBy,
    },
    problems,
  };
}

// ── Drafts ──────────────────────────────────────────────────────────────────
export type DraftResult = { made: { id: string; edge: string; title: string; trial: boolean }[]; skipped: { edge: string; why: string }[] };
/** Which rows a trial names: an edge, a seat ("P2", "P2.C1", "D.C2": the deal to that card) or a step key ("VILA"). */
export function trialRows(rows: readonly ProductionRow[], asked: string): ProductionRow[] {
  const a = asked.trim().toUpperCase().replace(/->|→/g, '>');
  const edge = parseEdge(a)?.base;
  if (edge) return rows.filter((r) => r.edge === edge);
  const seat = /^(P[1-7]|D)(?:\.?C([12]))?$/.exec(a);
  if (seat) { const target = `${seat[1]}.C${seat[2] ?? '1'}`; return rows.filter((r) => r.kind === 'DEAL' && r.target === target); }
  return rows.filter((r) => r.step === a);
}

/**
 * Makes the drafts: without a trial, one per step that is missing (nothing klar or waiting for Jakob), can be ordered now
 * and whose method holds (KAN); with a trial, one trial draft for the step named whose method is prov. A step with a draft
 * or an order in flight is passed over unless `again`. Never approves.
 */
export async function makeDrafts(list: Production, store: Pick<ReturnType<typeof orderStore>, 'create'>, options: { trial?: string | null; again?: boolean } = {}): Promise<DraftResult> {
  const out: DraftResult = { made: [], skipped: [] };
  const trial = options.trial?.trim() || null;
  const rows = trial ? trialRows(list.rows, trial) : list.rows.filter((r) => r.orderable === 'KAN' && r.state !== 'KLAR' && r.state !== 'DOM');
  if (trial && !rows.length) out.skipped.push({ edge: trial, why: 'inget steg heter så (en kant som READY>P2.C1, en plats som P2 eller D.C2, eller ett steg som VILA)' });
  for (const row of rows) {
    if (trial && row.method?.status !== 'prov') { out.skipped.push({ edge: row.edge, why: row.method ? `metoden ${row.method.status === 'gäller' ? 'gäller redan: beställ utan --trial' : 'saknas'}` : 'ingen metod' }); continue; }
    if (!row.draft) { out.skipped.push({ edge: row.edge, why: row.needs.length ? `väntar på ${row.needs.join(' och ')}` : row.words }); continue; }
    if (row.orders.length && !options.again) { out.skipped.push({ edge: row.edge, why: `${row.orders.map((o) => o.id).join(', ')} är redan på väg (--again beställer ändå)` }); continue; }
    try {
      const { order } = await store.create(row.draft);
      out.made.push({ id: order.id, edge: row.edge, title: order.title, trial: !!trial });
    } catch (error) { out.skipped.push({ edge: row.edge, why: (error as Error).message }); }
  }
  return out;
}

// ── Printing ────────────────────────────────────────────────────────────────
const SIGN: Record<RowState, string> = { KLAR: '✓', DOM: '○', BESTÄLLD: '↑', UTKAST: '✎', MED_GIVEN: '↳', KAN: '●', PROV: '◐', VÄNTAR: '…', INGEN_METOD: '?', INTE_BYGGD: '–' };
export function printList(list: Production): string {
  const lines: string[] = [];
  const c = list.counts;
  lines.push(`Produktionslistan för ${list.dealer.name}: ${c.done} av ${c.total} klara${c.provisional ? ` (${c.provisional} dömda åt dig)` : ''}, ${c.neededDone} av ${c.needed} som en runda kräver. Karta: ${list.karta.missing} saknas.`);
  const flight = (o: InFlight) => `${o.id} (${SHOWN_LABEL[o.shown].toLowerCase()})`;
  lines.push(`Ankare: ${list.anchors.map((a) => `${a.at} ${a.state}${a.orders.length ? ` (${a.orders.map(flight).join(', ')})` : ''}`).join(' · ')}. Landningsbilder: ${list.landings.length ? list.landings.join(', ') : 'inga'}.`);
  lines.push(`Läge: ${ROW_STATES.filter((s) => c.byState[s]).map((s) => `${c.byState[s]} ${ROW_STATE_LABEL[s]}`).join(', ')}.`);
  const row = (r: ProductionRow) => `  ${SIGN[r.state]} ${r.label.padEnd(34)} ${r.edge.padEnd(19)} ${r.words}${r.orders.length ? ` · ${r.orders.map(flight).join(', ')}` : ''}${r.method && !['KLAR', 'INGEN_METOD', 'DOM', 'MED_GIVEN'].includes(r.state) ? ` · metod: ${r.method.recipe}${r.method.reference ? ` (${r.method.reference})` : ''}` : ''}`;
  lines.push('', 'För en runda:');
  for (const r of list.rows.filter((x) => x.needed)) lines.push(row(r));
  lines.push('', 'Utöver en runda:');
  for (const r of list.rows.filter((x) => !x.needed)) lines.push(row(r));
  lines.push('', ...list.notes);
  return lines.join('\n');
}

// ── On the command line ─────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const dealer = args.find((a, i) => !a.startsWith('--') && !['--trial', '--root'].includes(args[i - 1] ?? ''));
  const root = path.resolve(flag('--root') ?? fileURLToPath(new URL('../', import.meta.url)));
  try {
    if (!dealer) throw new StoreError(400, 'Använd: node tools/produce.ts <dealer> [--json] [--draft [--trial <steg eller plats>] [--again]] [--root <mapp>]');
    if (!flag('--root') && path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new StoreError(400, 'Kör från dealer-katalogen.');
    const store = orderStore(root);
    const read = async () => { const { input, problems } = await readProduction(root, dealer, { store }); return { list: productionList(input), problems }; };
    let { list, problems } = await read();
    if (args.includes('--draft')) {
      const result = await makeDrafts(list, store, { trial: flag('--trial') ?? null, again: args.includes('--again') });
      ({ list, problems } = await read());
      if (args.includes('--json')) console.log(JSON.stringify({ ...result, list, problems }, null, 2));
      else {
        console.log(result.made.length ? `Utkast gjorda (godkänns i Beställ, inget är godkänt): ${result.made.map((m) => `${m.id} (${m.edge})`).join(', ')}.` : 'Inga utkast gjorda.');
        for (const s of result.skipped) console.log(`  inte ${s.edge}: ${s.why}`);
        console.log('');
        console.log(printList(list));
      }
    } else if (args.includes('--json')) console.log(JSON.stringify({ list, problems }, null, 2));
    else console.log(printList(list));
    if (problems.length && !args.includes('--json')) console.log(`\nAnmärkningar: ${problems.join(' ')}`);
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
