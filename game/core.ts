// Pure blackjack rule core of the local engine: (state, command, config, inputs) ->
// { state, events, publicEvents, effects, view }. No SQL, file, network, timer, wallet,
// video or DOM work, and no clock or ambient randomness: every shuffle is one journaled
// game-rng draw from `inputs.random`, every nonce and id comes from the same port, and the
// caller (session.ts in the lab) owns balance, receipts and timing.
// Ported from scoutgaming services/game/games/blackjack/core.mjs at commit 0fe56ace3
// (git blob e93fcb1375ba5b1c121fc1be0731303f9ed9f6df). Logic unchanged; only types,
// local import paths and type-only casts added. The commit/reveal shoe proof is kept
// (shoe-proof.ts) because removing it would change shuffle(), restoreRound() and shoeView().
import { SHOE_RULES, SHOE_RESERVE_POLICY, roundCardReserve } from './shoe-rules.ts';
import { Round, RANKS, SUITS } from './round.ts';
import type { Action, Card, Hand, Phase } from './round.ts';
import { openProof, replayShuffle } from './shoe-proof.ts';
import type { PhysicalCard, ShoeProof, ShoeReserve } from './shoe-proof.ts';
import { RandomPortError, journaledDraw, rngReceipt } from './random-port.ts';
import type { RandomPort, RngReceipt } from './random-port.ts';
import type { RngJournalEntry } from './rng.ts';

export const CONTRACT_VERSION = 'blackjack-core/1';
export { SHOE_RULES };

export class BlackjackCoreError extends Error {
  declare code: string;
  constructor(code: string, message: string) { super(message); this.name = 'BlackjackCoreError'; this.code = code; }
}
const fail: (code: string, message: string) => never = (code, message) => { throw new BlackjackCoreError(code, message); };

// ---- types (documentation of the JavaScript shapes; not enforced at runtime) ----
export interface ShoeState { id: string; cards: PhysicalCard[]; dealt: number; cutReached: boolean; proof: ShoeProof }
export interface GameState {
  contract: 'blackjack-core/1'; version: number; shoe: ShoeState | null;
  /** Plain data after every step (methods are restored by restoreRound). Holds the private hole card. */
  round: Round | null; paid: boolean; roundId: string | null; turnSeq: number;
}
export type CoreCommand =
  | { op: 'start'; bets: Array<{ main: number; pp: number; tp: number }> }
  | { op: 'act'; roundId: string | null; turnSeq: number; handIndex: number; box: number; action: string }
  | { op: 'insurance'; roundId: string | null; take?: boolean; takeBoxes?: number[] }
  | { op: 'collect'; roundId: string | null };
export interface Limits { min: number; max: number; sideMax: number }
export interface CoreConfig { limits?: Partial<Limits> }
export interface Funding { available?: number; reserved?: { stake?: Record<string, number>; insurance?: Record<string, number> } }
export interface CoreInputs { random?: RandomPort; funding?: Funding | null }
export interface Effect {
  kind: 'stake' | 'insurance' | 'double' | 'split' | 'payout'; direction: 'debit' | 'credit';
  source?: 'reservation' | 'available'; box: number; hand?: number; amount: number;
}
export interface CoreEvent { type: string; roundId: string | null; payload: { [key: string]: any } }
export interface ShoeView {
  id: string; total: number; remaining: number; dealt: number; cutAfter: number; cutReached: boolean;
  commitment: string | null; shufflePending: boolean; decks: number; burn: number;
}
export interface PublicRound {
  boxes: Hand[]; hands: Hand[]; dealer: Card[]; phase: Phase; active: number;
  /** Shoe position of the hidden hole card; its rank and suit are never in the view before the reveal. */
  holeDraw?: number; legalActions: Action[];
}
export interface PublicView { version: number; roundId: string | null; turnSeq: number; shoe: ShoeView | null; round: PublicRound | null }
export interface StepResult {
  state: GameState; events: CoreEvent[]; publicEvents: CoreEvent[]; effects: Effect[];
  view: PublicView & { shuffled: boolean };
}
type Closure = { reason: 'cut-card' } | { reason: 'round-reserve'; reserve: ShoeReserve };
interface CorePort { shuffle(deck: PhysicalCard[]): { cards: PhysicalCard[]; samples: number[]; rng: RngReceipt }; nonce(): string; uuid(): string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SHUFFLE_SAMPLES = 10000; // replayShuffle rejects longer transcripts

// Validates the explicit random port { rng, nonce, uuid }. There is no default and no fallback source.
function randomPort(random: RandomPort | undefined): CorePort {
  if (!random || typeof random.rng !== 'function' || typeof random.nonce !== 'function' || typeof random.uuid !== 'function') {
    fail('INPUTS_REQUIRED', 'Explicit random, nonce and id inputs are required');
  }
  const port = random as RandomPort;
  return {
    // One game-rng shuffle with recorded words. Its journal entry must verify, and the
    // shoe proof's independent replay must rebuild the same order from the same words.
    shuffle(deck) {
      let drawn: { result: PhysicalCard[]; entry: RngJournalEntry } | undefined;
      try { drawn = journaledDraw(port, rng => rng.shuffle(deck)); }
      catch (error) { if (error instanceof RandomPortError) fail('INVALID_INPUT', error.message); throw error; }
      const { result: cards, entry } = drawn as { result: PhysicalCard[]; entry: RngJournalEntry };
      if ((entry.samples as readonly number[]).length > MAX_SHUFFLE_SAMPLES) fail('INVALID_INPUT', 'Random source exceeded the shuffle transcript limit');
      let replayed: PhysicalCard[] | null = null;
      try { replayed = replayShuffle(entry.samples as readonly number[]).reverse(); } catch { /* reported below */ }
      if (JSON.stringify(replayed) !== JSON.stringify(cards)) fail('INVALID_INPUT', 'The shuffle does not replay from its recorded samples');
      return { cards, samples: [...(entry.samples as readonly number[])], rng: rngReceipt(entry) };
    },
    nonce() {
      const value = port.nonce();
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_INPUT', 'Random source returned an invalid shoe nonce');
      return value;
    },
    uuid() {
      const value = port.uuid();
      if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_INPUT', 'Random source returned an invalid id');
      return value;
    },
  };
}

function readLimits(config: CoreConfig | undefined): Limits {
  const lim = config?.limits ?? {};
  // Kevin's defaults when a table has no explicit limits: 5 / 2000 / 2000.
  const limits = { min: lim.min ?? 5, max: lim.max ?? 2000, sideMax: lim.sideMax ?? 2000 };
  if (Object.values(limits).some(v => !Number.isFinite(v) || v <= 0) || limits.min > limits.max) fail('INVALID_CONFIG', 'Invalid table limits');
  return limits;
}

// game-rng Fisher-Yates with rejection sampling, identical to Kevin's freshShoe(decks, record, true):
// every sample, including rejected ones, is recorded so replayShuffle can rebuild the order.
// proof.rng is the draw's journal receipt; like the samples it is public only once the shoe closes.
function shuffle(g: GameState, rnd: CorePort, events: CoreEvent[], closure: Closure = { reason: 'cut-card' }) {
  if (g.shoe) {
    const old = g.shoe;
    const proof = old.proof
      ? { ...old.proof, closed: true, ...closure, remaining: [...old.cards].reverse() }
      : { shoeId: old.id, closed: true, ...closure, legacy: true, dealt: old.dealt, remainingCount: old.cards.length };
    events.push({ type: 'shoe.closed', roundId: null, payload: { shoeId: old.id, proof } });
  }
  const deck: PhysicalCard[] = [];
  for (let d = 0; d < SHOE_RULES.decks; d++) for (const s of SUITS) for (const r of RANKS) deck.push({ r, s, serial: deck.length + 1 });
  const { cards, samples, rng } = rnd.shuffle(deck);
  const id = rnd.uuid(), proof = openProof(id, SHOE_RULES, samples, rnd.nonce(), SHOE_RESERVE_POLICY);
  proof.rng = rng;
  // The commitment exists before the burn and before any dealt card.
  proof.draws.push({ position: 1, kind: 'burn', card: cards.pop() as PhysicalCard });
  g.shoe = { id, cards, dealt: 1, cutReached: false, proof };
  events.push({ type: 'shoe.opened', roundId: null,
    payload: { shoeId: id, commitment: proof.commitment, rules: SHOE_RULES, policy: SHOE_RESERVE_POLICY, coverage: 'complete from shuffle', rng } });
}

function restoreRound(g: GameState): Round {
  const r: Round = Object.assign(Object.create(Round.prototype), g.round);
  r.boxes = r.boxes.map(b => r.hands.find(h => h.box === b.box) ?? b);
  r.shoe = { draw() {
    const shoe = g.shoe as ShoeState; // read at draw time, as Scout's g.shoe.* is
    if (!shoe.cards.length) fail('SHOE_EXHAUSTED', 'Shoe exhausted; round paused. No mid-round shuffle.');
    const card = shoe.cards.pop() as PhysicalCard; shoe.dealt++;
    shoe.proof?.draws.push({ position: shoe.dealt, kind: 'deal', card: { ...card } });
    if (shoe.dealt >= SHOE_RULES.cutAfter) shoe.cutReached = true;
    return { ...card, shoeDraw: shoe.dealt };
  } };
  return r;
}

function shoeView(g: GameState): ShoeView | null {
  const s = g.shoe;
  return s && { id: s.id, total: SHOE_RULES.total, remaining: s.cards.length,
    dealt: s.dealt, cutAfter: SHOE_RULES.cutAfter, cutReached: s.cutReached,
    commitment: s.proof?.commitment ?? null, shufflePending: s.cutReached, decks: SHOE_RULES.decks, burn: SHOE_RULES.burn };
}

// The only player-facing projection: never shoe order, burn, samples, nonce, the
// private hole card or the round's internal event log.
export function publicView(state: GameState): PublicView {
  const g = state;
  let round: PublicRound | null = null;
  if (g.round && !g.paid) {
    const r = restoreRound(g);
    round = { boxes: r.boxes, hands: r.hands, dealer: r.dealer, phase: r.phase,
      active: r.active, holeDraw: r.holeCard?.shoeDraw, legalActions: r.phase === 'decisions' ? r.legal() : [] };
  }
  return JSON.parse(JSON.stringify({ version: g.version, roundId: g.roundId, turnSeq: g.turnSeq, shoe: shoeView(g), round }));
}

// Same redaction as Kevin's audit read: engine draws stay hidden until the round is settled.
// RNG receipts identify the private shoe order; players see them in the closed shoe's proof.
function publicEvent(event: CoreEvent): CoreEvent {
  const { rng, ...payload } = event.payload, phase = payload.phase;
  if (!event.type.startsWith('engine.') || phase === 'settled' || phase === 'collected') return { ...event, payload };
  return { ...event, payload: { ...payload,
    draws: payload.draws.map((d: { position: number; kind: string }) => ({ position: d.position, kind: d.kind, card: 'hidden until settlement' })) } };
}

function result(g: GameState, events: CoreEvent[], effects: Effect[], shuffled: boolean): StepResult {
  const out = JSON.parse(JSON.stringify({ state: g, events, effects }));
  return { ...out, publicEvents: out.events.map(publicEvent), view: { ...publicView(out.state), shuffled } };
}

function load(state: GameState): GameState {
  if (!state || state.contract !== CONTRACT_VERSION || !Number.isInteger(state.version)) fail('INVALID_STATE', 'Unsupported game state');
  return JSON.parse(JSON.stringify(state));
}

// Command funding (O01-svar 2.5). The caller reads it server-side from its wallet;
// client balances are never input and the core never stores or changes a balance.
//   inputs.funding = {
//     available,                         // balance - open reservations; funds NEW debits only
//     reserved: { stake: { [box]: n },   // open stake reservation per box, consumed at round start
//                 insurance: { [box]: n } } // open insurance reservation per box, consumed at insurance resolution
//   }
// Effects carry `source`: 'reservation' (the caller consumes that reservation) or 'available'
// (the caller debits against available). A pre-reserved amount is never checked against available.
function fund(inputs: CoreInputs | undefined, effects: Effect[]) {
  const funding = inputs?.funding;
  const needed: { [kind: string]: any } = {};
  for (const e of effects) if (e.direction === 'debit') {
    if (e.source === 'reservation') (needed[e.kind] ??= {})[e.box] = (needed[e.kind]?.[e.box] ?? 0) + e.amount;
    else needed.available = (needed.available ?? 0) + e.amount;
  }
  if (!Object.keys(needed).length) return;
  if (!funding || typeof funding !== 'object') fail('FUNDING_REQUIRED', 'Server-side command funding is required');
  const f = funding as Funding;
  for (const kind of ['stake', 'insurance'] as const) {
    if (!needed[kind]) continue;
    const reserved = f.reserved?.[kind];
    if (!reserved || typeof reserved !== 'object') fail('RESERVATION_REQUIRED', `Server-side ${kind} reservations are required`);
    for (const [box, amount] of Object.entries(needed[kind]) as Array<[string, number]>) {
      const have = (reserved as Record<string, number>)[box] ?? 0;
      if (typeof have !== 'number' || !Number.isFinite(have) || have < 0) fail('INVALID_INPUT', `Invalid ${kind} reservation for box ${box}`);
      if (have < amount) fail('RESERVATION_INSUFFICIENT', `The ${kind} reservation for box ${box} does not cover ${amount}`);
    }
  }
  if (needed.available) {
    const available = f.available;
    if (typeof available !== 'number' || !Number.isFinite(available)) fail('AVAILABLE_REQUIRED', 'Server-side available balance is required');
    if ((available as number) - needed.available < 0) fail('INSUFFICIENT_BALANCE', 'Insufficient balance');
  }
}

// Creates a game and opens (commits) its first shoe before any bet or draw.
export function newGame(inputs?: { random?: RandomPort }): StepResult {
  const rnd = randomPort(inputs?.random), events: CoreEvent[] = [];
  const g: GameState = { contract: CONTRACT_VERSION, version: 0, shoe: null, round: null, paid: false, roundId: null, turnSeq: 0 };
  shuffle(g, rnd, events);
  return result(g, events, [], false);
}

// (state, command, frozen config, explicit inputs) -> { state, events, publicEvents, effects, view }.
// The input state is never mutated; a rejected command throws BlackjackCoreError.
export function step(state: GameState, command: CoreCommand, config?: CoreConfig, inputs?: CoreInputs): StepResult {
  const g = load(state);
  if (!command || typeof command !== 'object') fail('UNKNOWN_COMMAND', 'Unknown table command');
  const events: CoreEvent[] = [], effects: Effect[] = [], prior = g.shoe?.id, drawn = g.shoe?.dealt ?? 1;
  let params: { [key: string]: any }, shuffled = false;
  if (command.op === 'start') {
    if (g.round && !g.paid) fail('ROUND_IN_PROGRESS', 'Finish the current round first');
    const limits = readLimits(config), b = command.bets;
    if (!Array.isArray(b) || b.length !== 7 || !b.some(x => x?.main > 0)) fail('INVALID_BETS', 'Place a main bet');
    const cap = (key: string) => key === 'main' ? limits.max : limits.sideMax;
    for (const x of b) {
      // New stakes use whole demo chips; insurance and payouts may still contain half chips.
      for (const key of ['main','pp','tp'] as const) if (!Number.isInteger(x?.[key]) || x[key] < 0 || x[key] > cap(key)) fail('INVALID_STAKE', 'Invalid stake');
      if ((x.main > 0 && x.main < limits.min) || (!x.main && (x.pp || x.tp))) fail('INVALID_STAKE', `Side bets require a main bet of at least ${limits.min}`);
    }
    const bets = b.map(x => ({ main: x.main, pp: x.pp, tp: x.tp }));
    bets.forEach((x, box) => { const amount = x.main + x.pp + x.tp; if (amount) effects.push({ kind: 'stake', direction: 'debit', source: 'reservation', box, amount }); });
    fund(inputs, effects);
    const rnd = randomPort(inputs?.random);
    const boxes = bets.filter(bet => bet.main > 0).length, minimum = roundCardReserve(boxes);
    if (!g.shoe) shuffle(g, rnd, events);
    else if (g.shoe.cutReached || g.shoe.cards.length < minimum) {
      const closure: Closure = g.shoe.cutReached ? { reason: 'cut-card' }
        : { reason: 'round-reserve', reserve: { policy: SHOE_RESERVE_POLICY, boxes, minimum } };
      shuffle(g, rnd, events, closure); shuffled = true;
    }
    g.roundId = rnd.uuid(); g.turnSeq = 0;
    g.round = new Round(bets, [] as Card[]); g.paid = false;
    const live = restoreRound(g); live.deal(); g.round = live;
    // The outcome receipt: this round (engine.start carries its roundId) draws from the
    // shoe with this game-rng journal receipt. Shoes opened before game-rng have none.
    const shoe = g.shoe as ShoeState;
    params = { bets, limits, ...(shoe.proof?.rng ? { rng: shoe.proof.rng } : {}) };
  } else {
    if (!['act', 'insurance', 'collect'].includes(command.op)) fail('UNKNOWN_COMMAND', 'Unknown table command');
    if (!g.round || g.paid) fail('NO_ACTIVE_ROUND', 'No active round');
    if (command.roundId !== g.roundId) fail('STALE_COMMAND', 'Command belongs to another round');
    const r = restoreRound(g);
    if (command.op === 'act') {
      if (r.phase !== 'decisions') fail('ILLEGAL_ACTION', 'Illegal action');
      const hand = r.live()[r.active];
      if (command.turnSeq !== g.turnSeq || command.handIndex !== r.active || command.box !== hand.box) fail('STALE_COMMAND', 'Turn changed; reload to resume');
      if (!(r.legal() as string[]).includes(command.action)) fail('ILLEGAL_ACTION', 'Illegal action');
      if (['double','split'].includes(command.action)) effects.push({ kind: command.action as 'double' | 'split', direction: 'debit', source: 'available', box: hand.box, hand: r.active, amount: hand.stake });
      fund(inputs, effects);
      r.act(command.action);
      params = { action: command.action };
    } else if (command.op === 'insurance') {
      const boxes = command.takeBoxes;
      if (r.phase !== 'insurance' || (boxes == null ? typeof command.take !== 'boolean' : !Array.isArray(boxes) || boxes.some(i => !Number.isInteger(i) || !r.live().some(h => h.box === i)))) fail('INSURANCE_UNAVAILABLE', 'Insurance is not available');
      const choices = r.live().map(h => boxes == null ? command.take as boolean : (boxes as number[]).includes(h.box));
      r.live().forEach((h, i) => { if (choices[i]) effects.push({ kind: 'insurance', direction: 'debit', source: 'reservation', box: h.box, hand: i, amount: h.stake / 2 }); });
      fund(inputs, effects);
      r.resolveInsurance(choices);
      params = boxes == null ? { take: command.take } : { takeBoxes: [...(boxes as number[])] };
    } else {
      if (r.phase !== 'settled') fail('ROUND_NOT_SETTLED', 'Round is not settled');
      // Exactly one settlement: after this the round is paid and further collects are rejected.
      r.live().forEach((h, i) => effects.push({ kind: 'payout', direction: 'credit', box: h.box, hand: i, amount: (h.result as number) + h.sideReturn }));
      g.paid = true;
      params = {};
    }
    g.round = r;
  }
  // The draw adapter is reconstructed on every command and never stored.
  if (g.round) delete (g.round as Partial<Round>).shoe;
  g.version++;
  if (command.op !== 'collect') g.turnSeq++;
  const phase = g.round && !g.paid ? g.round.phase : 'collected';
  const shoe = g.shoe as ShoeState;
  events.push({ type: `engine.${command.op}`, roundId: g.roundId, payload: { ...params, shoeId: shoe.id, version: g.version,
    draws: shoe.proof?.draws.filter(d => d.position > (prior === shoe.id ? drawn : 1)) ?? [], phase } });
  return result(g, events, effects, shuffled);
}
