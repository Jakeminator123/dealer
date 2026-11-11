// The random port of the local blackjack engine: { rng(options), nonce(), uuid() }.
// Every game-deciding draw (the shoe shuffle) goes through game-rng; nonces and ids
// are not outcomes and come directly from node:crypto.
// Ported from scoutgaming services/game/games/secure-random.mjs at commit 0fe56ace3
// (git blob b5b17449d0b21c4f684e3ea2e79c8ab90d0e613d). Logic unchanged; only types added.
// The lab's seeded and stacked ports live in shoe-source.ts.
import { randomBytes, randomUUID } from 'node:crypto';
import { RNG_VERSION, createRng, receiptOf, verifyJournal } from './rng.ts';
import type { GameRng, RngJournalEntry } from './rng.ts';

export type RngSettings = { journal?: ((entry: RngJournalEntry) => void) | null; recordSamples?: boolean };
export interface RandomPort {
  rng(settings?: RngSettings): GameRng;
  nonce(): string;
  uuid(): string;
}
// The receipt stored beside a private outcome: version, source, sequence, counts, receipt and chain.
export type RngReceipt = Omit<RngJournalEntry, 'outcome' | 'samples'>;

const MODES = new Set(['secure', 'seeded', 'replay']);

// Production port: { rng(options), nonce(), uuid() }. It refuses every seed or option.
export function secureRandom(options?: undefined): RandomPort {
  if (options !== undefined) throw new TypeError('The production random port takes no seed or options');
  return Object.freeze({
    rng(settings: RngSettings = {}) {
      const { journal = null, recordSamples = false, ...other } = settings ?? {};
      if (Object.keys(other).length) throw new TypeError('The production generator takes only journal and recordSamples');
      return createRng({ mode: 'secure', journal, recordSamples });
    },
    nonce() { return randomBytes(32).toString('hex'); },
    uuid() { return randomUUID(); },
  });
}

// A port or generator that cannot prove its draw. A failing secure source is not this
// error: entropy failures propagate unchanged and the caller's transaction rolls back.
export class RandomPortError extends Error {
  constructor(message: string) { super(message); this.name = 'RandomPortError'; }
}

// Runs exactly one game-rng operation on a fresh generator and returns the outcome with
// its journal entry (receipt, chain and every drawn word). One generator per draw keeps
// each journal complete from genesis (sequence 1). The chain therefore covers one draw,
// not a table's sequence: a draw in a rolled-back transaction leaves no entry anywhere.
// With NODE_ENV=production a seeded or replay generator is refused even if one were wired in.
export function journaledDraw<T>(random: RandomPort, operation: (rng: GameRng) => T): { result: T; entry: RngJournalEntry } {
  if (typeof random?.rng !== 'function') throw new RandomPortError('A game-rng random port is required');
  const entries: RngJournalEntry[] = [];
  const rng = random.rng({ recordSamples: true, journal: entry => { entries.push(entry); } });
  if (!rng || !MODES.has(rng.mode)) throw new RandomPortError('The random port did not return a game-rng generator');
  if (rng.mode !== 'secure' && process.env.NODE_ENV === 'production') throw new RandomPortError('Deterministic game-rng modes are refused in production');
  let result: T;
  try { result = operation(rng); }
  catch (error) {
    // A deterministic test source that runs out of recorded words is invalid input.
    if (error instanceof RangeError && rng.mode !== 'secure') throw new RandomPortError(error.message);
    throw error;
  }
  const [entry] = entries;
  if (entries.length !== 1 || !verifyJournal(entries).verified || entry.rngVersion !== RNG_VERSION || entry.mode !== rng.mode
    || !Array.isArray(entry.samples) || entry.samples.length !== entry.words || receiptOf(entry.op, result) !== entry.receipt) {
    throw new RandomPortError('The draw has no verifiable game-rng journal entry');
  }
  return { result, entry };
}

// The receipt stored beside a private outcome: version, source, sequence, counts, receipt
// and chain. The outcome and the words stay private until the outcome is public.
export function rngReceipt(entry: RngJournalEntry): RngReceipt {
  const { outcome, samples, ...receipt } = entry;
  return receipt;
}
