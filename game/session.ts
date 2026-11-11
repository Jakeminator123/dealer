// The local single-player blackjack session the lab server drives: an in-memory shell around
// the ported Scout core. It keeps the balance (Scout's whole demo chips; insurance and payouts
// may hold half chips), supplies the core's funding (available = balance, reservations = the
// stakes), makes commands idempotent by requestId, refuses stale expectedVersion with a typed
// error, and returns seat-numbered (1–7) presentation events and views from seats.ts.
// New code, shell pattern from local-studio blackjack-studio/game-session.ts; command names
// (start, act, insurance, collect) and their rules are Scout's core.ts.
// Nothing returned here ever holds the hole card before its reveal, the shoe order, the burn
// card, the random words or the core's private state.
import { BlackjackCoreError, newGame, publicView, step } from './core.ts';
import type { CoreCommand, CoreEvent, Effect, Funding, GameState, Limits, PublicView } from './core.ts';
import { presentationEvents, withFamily } from './presentation.ts';
import { betsForSeats, boxOf, SeatError, seatEvents, seatView } from './seats.ts';
import type { SeatBet, SeatSignalEvent, SeatView } from './seats.ts';
import { randomPortFor, ShoeSourceError, sourceOfMode } from './shoe-source.ts';
import type { ShoeOption, ShoeSource } from './shoe-source.ts';
import type { RandomPort } from './random-port.ts';
import { canonicalJson } from './rng.ts';
import type { RngMode } from './rng.ts';
import type { Action } from './round.ts';

export type { SeatBet, ShoeOption, ShoeSource, Limits };

export interface SessionOptions {
  /** Starting balance in whole chips (default 1000). */
  balance?: number;
  /** Table limits (default Scout's 5 / 2000 / side bets 2000). */
  limits?: Partial<Limits>;
  /** Shoe source (default secure). 'stacked' is lab-only and shows as such in view.shoe.source. */
  shoe?: ShoeOption;
}
interface CommandBase { requestId: string; expectedVersion: number }
export interface StartCommand extends CommandBase { op: 'start'; bets: SeatBet[] }
export interface ActCommand extends CommandBase { op: 'act'; seat: number; handIndex: number; action: Action; roundId: string; turnSeq: number }
/** Exactly one of `take` (every hand) or `seats` (the seats that insure). */
export interface InsuranceCommand extends CommandBase { op: 'insurance'; roundId: string; take?: boolean; seats?: number[] }
export interface CollectCommand extends CommandBase { op: 'collect'; roundId: string }
export type SessionCommand = StartCommand | ActCommand | InsuranceCommand | CollectCommand;

export interface Snapshot {
  /** Session version: +1 per accepted command. Send it back as expectedVersion. */
  ver: number;
  balance: number;
  limits: Limits;
  /** The step's presentation events in play order (empty from state()). */
  events: SeatSignalEvent[];
  view: SeatView;
  /** Legal actions of the active hand (view.round.legalActions), empty outside decisions. */
  legalActions: Action[];
}
export interface LedgerEntry { ver: number; requestId: string; op: SessionCommand['op']; roundId: string | null; debit: number; credit: number; balance: number }
export interface Session {
  state(): Snapshot;
  /** Validates and applies one command; throws SessionError. A repeated requestId with the same input returns the stored result. */
  command(input: unknown): Snapshot;
  ledger(): LedgerEntry[];
}

export class SessionError extends Error {
  declare code: string;
  declare status: number;
  constructor(code: string, message: string, status = 422) { super(message); this.name = 'SessionError'; this.code = code; this.status = status; }
}
// HTTP-ish status per core refusal; anything else from the core is a 422 rule refusal.
const CORE_STATUS: Record<string, number> = {
  STALE_COMMAND: 409, ROUND_IN_PROGRESS: 409, NO_ACTIVE_ROUND: 409,
  INPUTS_REQUIRED: 500, INVALID_INPUT: 500, INVALID_STATE: 500, INVALID_CONFIG: 500, SHOE_EXHAUSTED: 500,
};
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const plainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function sessionLimits(input: Partial<Limits> | undefined): Limits {
  // The same defaults and checks as core.ts readLimits, so a bad table fails at creation.
  const limits = { min: input?.min ?? 5, max: input?.max ?? 2000, sideMax: input?.sideMax ?? 2000 };
  if (Object.values(limits).some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0) || limits.min > limits.max)
    throw new SessionError('INVALID_CONFIG', 'Invalid table limits', 400);
  return limits;
}

export function createSession(options: SessionOptions = {}): Session {
  if (!plainObject(options as unknown)) throw new SessionError('INVALID_CONFIG', 'Session options must be an object', 400);
  const limits = sessionLimits(options.limits);
  let balance = options.balance ?? 1000;
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0) throw new SessionError('INVALID_CONFIG', 'Balance must be a finite number of chips >= 0', 400);
  let random: RandomPort;
  try { random = randomPortFor(options.shoe); }
  catch (error) { if (error instanceof ShoeSourceError) throw new SessionError(error.code, error.message, 400); throw error; }

  const sources = new Map<string, ShoeSource>();
  const noteShoes = (events: CoreEvent[]) => {
    for (const e of events) if (e.type === 'shoe.opened') sources.set(e.payload.shoeId, sourceOfMode(e.payload.rng?.mode as RngMode));
  };
  const opened = newGame({ random });
  noteShoes(opened.events);
  let state: GameState = opened.state, view: PublicView & { shuffled?: boolean } = opened.view, ver = 0;
  const receipts = new Map<string, { fingerprint: string; result: Snapshot }>();
  const journal: LedgerEntry[] = [];

  const snapshot = (events: SeatSignalEvent[]): Snapshot => {
    const seated = seatView(view, sources.get(view.shoe?.id as string) ?? 'secure');
    return { ver, balance, limits: { ...limits }, events, view: seated, legalActions: [...(seated.round?.legalActions ?? [])] };
  };

  // The core command and its funding for one validated session command.
  function translate(input: Record<string, unknown>): { core: CoreCommand; funding: Funding | null } {
    const op = input.op;
    if (op === 'start') {
      const bets = betsForSeats(input.bets);
      const reserved: Record<string, number> = {};
      let total = 0, numeric = true;
      bets.forEach((b, box) => {
        const amount = b.main + b.pp + b.tp;
        if (typeof amount !== 'number' || !Number.isFinite(amount)) numeric = false;
        else if (amount) { reserved[box] = amount; total += amount; }
      });
      // The core never checks a reservation against the balance: that is the caller's reservation step.
      // Malformed stakes are left to the core's own INVALID_STAKE check.
      if (numeric && total > balance) throw new SessionError('INSUFFICIENT_BALANCE', `Stakes of ${total} exceed the balance of ${balance}`);
      return { core: { op: 'start', bets }, funding: { available: balance, reserved: { stake: reserved } } };
    }
    if (op === 'act') {
      return { core: { op: 'act', action: input.action as string, roundId: input.roundId as string, turnSeq: input.turnSeq as number,
        handIndex: input.handIndex as number, box: boxOf(input.seat) }, funding: { available: balance } };
    }
    if (op === 'insurance') {
      const hasTake = input.take !== undefined, hasSeats = input.seats !== undefined;
      if (hasTake === hasSeats) throw new SessionError('INVALID_COMMAND', 'Insurance takes exactly one of take or seats', 400);
      let takeBoxes: number[] | null = null;
      if (hasSeats) {
        if (!Array.isArray(input.seats)) throw new SessionError('INVALID_COMMAND', 'seats must be a list of seats', 400);
        takeBoxes = input.seats.map(boxOf);
      }
      const hands = publicView(state).round?.hands ?? [];
      const insured = hands.filter(h => takeBoxes ? takeBoxes.includes(h.box) : input.take === true);
      const reserved: Record<string, number> = {};
      for (const h of insured) reserved[h.box] = (reserved[h.box] ?? 0) + h.stake / 2;
      const cost = Object.values(reserved).reduce((a, b) => a + b, 0);
      if (cost > balance) throw new SessionError('INSUFFICIENT_BALANCE', `Insurance of ${cost} exceeds the balance of ${balance}`);
      const core: CoreCommand = takeBoxes ? { op: 'insurance', roundId: input.roundId as string, takeBoxes }
        : { op: 'insurance', roundId: input.roundId as string, take: input.take as boolean };
      return { core, funding: { available: balance, reserved: { insurance: reserved } } };
    }
    if (op === 'collect') return { core: { op: 'collect', roundId: input.roundId as string }, funding: null };
    throw new SessionError('UNKNOWN_COMMAND', `Unknown command ${JSON.stringify(op)}`, 400);
  }

  function command(input: unknown): Snapshot {
    if (!plainObject(input)) throw new SessionError('INVALID_COMMAND', 'A command must be a JSON object', 400);
    const requestId = input.requestId;
    if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) throw new SessionError('REQUEST_ID_REQUIRED', 'requestId must be 1-100 characters of A-Z a-z 0-9 . _ : -', 400);
    let fingerprint: string;
    try { fingerprint = canonicalJson(input); } catch { throw new SessionError('INVALID_COMMAND', 'A command must be plain JSON', 400); }
    const receipt = receipts.get(requestId);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new SessionError('REQUEST_REUSED', 'requestId reused with different input', 409);
      return structuredClone(receipt.result);
    }
    if (input.expectedVersion !== ver) throw new SessionError('STALE_VERSION', `The session is at version ${ver}; reload and resend`, 409);

    let out;
    try {
      const { core, funding } = translate(input);
      out = step(state, core, { limits }, { random, funding });
    } catch (error) {
      if (error instanceof SessionError) throw error;
      if (error instanceof SeatError) throw new SessionError(error.code, error.message);
      if (error instanceof BlackjackCoreError) throw new SessionError(error.code, error.message, CORE_STATUS[error.code] ?? 422);
      throw error;
    }

    // Apply the money exactly as the core's effects say.
    let debit = 0, credit = 0;
    for (const e of out.effects as Effect[]) { if (e.direction === 'debit') debit += e.amount; else credit += e.amount; }
    const before = view;
    noteShoes(out.events);
    state = out.state; view = out.view; balance = balance - debit + credit; ver++;
    const op = input.op as SessionCommand['op'];
    const events = presentationEvents(before, out.view, op, { action: input.action as string | undefined }).map(withFamily);
    const result = snapshot(seatEvents(events, out.view));
    journal.push({ ver, requestId, op, roundId: out.view.roundId, debit, credit, balance });
    receipts.set(requestId, { fingerprint, result: structuredClone(result) });
    return result;
  }

  return {
    state: () => snapshot([]),
    command,
    ledger: () => structuredClone(journal),
  };
}
