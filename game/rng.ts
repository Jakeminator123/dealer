// Game RNG (game-rng/1): the one random source of the local blackjack engine.
// Ported from scoutgaming packages/game-rng/index.mjs at commit 0fe56ace3
// (git blob d11705148b2a4f6cc3a3dd25a44676d2b71b5b82); the exported types follow
// packages/game-rng/index.d.mts (git blob 71eff2b655bada782fb2f0e2fa4808ade9b958ea).
// Logic unchanged; only types and a few type-only casts added.
//
// secure  draws from Node's CSPRNG (crypto.randomFillSync); errors propagate and
//         there is no fallback to the JavaScript engine's own generator.
// seeded  HMAC-SHA256 in counter mode, for tests, replay and lab verification only.
// replay  feeds recorded 32-bit samples back through the same scaling and shuffle code.
// seeded and replay require allowDeterministic: true and are named in every entry.
import { createHash, randomFillSync } from 'node:crypto';

export const RNG_VERSION = 'game-rng/1';
// Largest range int() accepts. The acceptance limit below uses (2^32 - 1), the same
// threshold as the recorded shoe transcripts, so a range of 2^32 has no valid limit.
export const MAX_RANGE = 0xFFFFFFFF;

export type RngMode = 'secure' | 'seeded' | 'replay';
export type RngOperation = 'int' | 'float' | 'shuffle' | 'draw' | 'rouletteSpin';
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type RngIdentity = {
  readonly rngVersion: 'game-rng/1';
  readonly mode: RngMode;
  /** sha256 of the seed bytes; present only in seeded mode. */
  readonly seedHash?: string;
};

export type RngJournalEntry = RngIdentity & {
  readonly sequence: number;
  readonly op: RngOperation;
  readonly min?: number;
  readonly max?: number;
  readonly size?: number;
  readonly count?: number;
  /** 32-bit source words consumed, including rejected ones. */
  readonly words: number;
  readonly rejections: number;
  readonly outcome: JsonValue;
  /** sha256("game-rng/1\n<op>\n<canonical JSON outcome>") as hex. */
  readonly receipt: string;
  /** sha256("<previous chain>\n<receipt>"), starting from genesisOf(mode, seedHash). */
  readonly chain: string;
  /** Raw source words for replay; present only with recordSamples: true. */
  readonly samples?: readonly number[];
};

export type RngProof = RngIdentity & {
  readonly operations: number;
  readonly words: number;
  readonly rejections: number;
  /** The current chain value: a receipt over every journaled outcome in order. */
  readonly receipt: string;
};

export type CreateRngOptions = {
  mode: RngMode;
  seed?: string | Uint8Array;
  samples?: readonly number[];
  /** Required for seeded and replay; refused in secure mode. */
  allowDeterministic?: boolean;
  journal?: ((entry: RngJournalEntry) => void) | null;
  recordSamples?: boolean;
};

export type RouletteSpin<T> = { readonly index: number; readonly pocket: T };

export type GameRng = {
  readonly mode: RngMode;
  int(minInclusive: number, maxExclusive: number): number;
  float(): number;
  shuffle<T>(items: readonly T[]): T[];
  drawWithoutReplacement<T>(items: readonly T[], count: number): T[];
  rouletteSpin<T>(wheel: readonly T[]): RouletteSpin<T>;
  fillUint32(target: Uint32Array): Uint32Array;
  proof(): RngProof;
};

export type JournalVerification = {
  readonly verified: boolean;
  readonly entries: number;
  readonly receipt: string | null;
  readonly problems: readonly string[];
};

type WordSource = { next(): number; fill?(target: Uint32Array): void };

const SEEDED_LABEL = Buffer.from(`${RNG_VERSION}/seeded`, 'utf8');
const MODES = new Set(['secure', 'seeded', 'replay']);
const OPTION_KEYS = new Set(['mode', 'seed', 'samples', 'allowDeterministic', 'journal', 'recordSamples']);

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const isWord = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xFFFFFFFF;

// JSON with object keys in code-point order, so a receipt depends only on values.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Receipt values must be finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const prototype = typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (prototype === Object.prototype || prototype === null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new TypeError('Receipt values must be JSON data: null, booleans, finite numbers, strings, arrays or plain objects');
}

// Receipt of one outcome: sha256("game-rng/1\n<op>\n<canonical JSON outcome>").
export function receiptOf(op: string, outcome: unknown): string {
  return sha256(`${RNG_VERSION}\n${op}\n${canonicalJson(outcome)}`);
}

// The chain starts from the source identity and folds in every receipt in order.
export function genesisOf(mode: RngMode, seedHash: string | null = null): string {
  return sha256(`${RNG_VERSION}\n${mode}\n${seedHash ?? ''}`);
}
export const chainOf = (previous: string, receipt: string): string => sha256(`${previous}\n${receipt}`);

function seedBytes(seed: unknown): Buffer {
  if (typeof seed === 'string' && seed.length) return Buffer.from(seed, 'utf8');
  if (seed instanceof Uint8Array && seed.length) return Buffer.from(seed);
  throw new TypeError('Seeded mode requires a non-empty string or Uint8Array seed');
}

function secureSource(): WordSource {
  const word = new Uint32Array(1);
  // One call per word: no future outcomes wait in a process buffer.
  return { next() { randomFillSync(word); return word[0]; }, fill(target) { randomFillSync(target); } };
}

// HMAC-SHA256 (RFC 2104) with the key pads hashed once; createHmac per block costs
// about six times more. The tests compare every block with createHmac.
function hmacSha256(key: Buffer) {
  const padded = Buffer.alloc(64);
  (key.length > 64 ? createHash('sha256').update(key).digest() : key).copy(padded);
  const inner = createHash('sha256').update(padded.map(byte => byte ^ 0x36));
  const outer = createHash('sha256').update(padded.map(byte => byte ^ 0x5c));
  return (message: Buffer) => outer.copy().update(inner.copy().update(message).digest()).digest();
}

// Block i = HMAC-SHA256(key = seed, "game-rng/1/seeded" || uint64be(i)), i = 0, 1, …;
// each 32-byte block yields eight big-endian 32-bit words in order.
function seededSource(key: Buffer): WordSource {
  const hmac = hmacSha256(key);
  const message = Buffer.alloc(SEEDED_LABEL.length + 8);
  SEEDED_LABEL.copy(message);
  let counter = 0n, block: Buffer | null = null, index = 8;
  return {
    next() {
      if (index === 8) {
        message.writeBigUInt64BE(counter++, SEEDED_LABEL.length);
        block = hmac(message);
        index = 0;
      }
      return (block as Buffer).readUInt32BE(4 * index++);
    },
  };
}

function replaySource(samples: number[]): WordSource {
  let cursor = 0;
  return {
    next() {
      if (cursor >= samples.length) throw new RangeError('Replay samples exhausted');
      return samples[cursor++];
    },
  };
}

function checkItems(items: unknown, name: string) {
  if (!Array.isArray(items)) throw new TypeError(`${name} requires an array`);
  if (items.length > MAX_RANGE) throw new RangeError(`${name} supports at most ${MAX_RANGE} items`);
}

export function createRng(options: CreateRngOptions): GameRng {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('createRng requires options');
  for (const key of Object.keys(options)) if (!OPTION_KEYS.has(key)) throw new TypeError(`Unknown RNG option ${key}`);
  const { mode, seed, samples, allowDeterministic = false, journal = null, recordSamples = false } = options;
  if (!MODES.has(mode)) throw new TypeError('RNG mode must be secure, seeded or replay');
  if (journal !== null && typeof journal !== 'function') throw new TypeError('journal must be a function');
  if (typeof recordSamples !== 'boolean' || typeof allowDeterministic !== 'boolean') throw new TypeError('RNG flags must be booleans');
  if (mode === 'secure' && (seed !== undefined || samples !== undefined || allowDeterministic)) {
    throw new TypeError('Secure mode takes no seed, samples or deterministic flag');
  }
  if (mode !== 'secure' && allowDeterministic !== true) {
    throw new Error(`${mode} mode is deterministic; pass allowDeterministic: true (tests, replay and lab only)`);
  }
  if (mode === 'seeded' && samples !== undefined) throw new TypeError('Seeded mode takes no samples');
  if (mode === 'replay' && (seed !== undefined || !Array.isArray(samples) || !samples.every(isWord))) {
    throw new TypeError('Replay mode requires samples: an array of 32-bit unsigned integers');
  }

  let source: WordSource, seedHash: string | null = null;
  if (mode === 'secure') source = secureSource();
  else if (mode === 'seeded') {
    const key = seedBytes(seed);
    seedHash = createHash('sha256').update(key).digest('hex');
    source = seededSource(key);
  } else source = replaySource([...(samples as readonly number[])]);

  let sequence = 0, words = 0, rejections = 0, chain = genesisOf(mode, seedHash), capture: number[] | null = null;
  const identity: RngIdentity = seedHash ? { rngVersion: RNG_VERSION, mode, seedHash } : { rngVersion: RNG_VERSION, mode };

  function next() {
    const word = source.next();
    words += 1;
    if (capture) capture.push(word);
    return word;
  }

  // Rejection sampling: accept a word below range * floor((2^32 - 1) / range), a multiple
  // of range, so every residue has exactly the same number of accepted words.
  function uniform(range: number) {
    const limit = range * Math.floor(MAX_RANGE / range);
    for (;;) {
      const word = next();
      if (word < limit) return word % range;
      rejections += 1;
    }
  }

  function record<T>(op: RngOperation, details: Record<string, number>, run: () => T): T {
    const start = { words, rejections };
    const drawn: number[] | null = recordSamples ? [] : null;
    capture = drawn;
    let result: T;
    try { result = run(); } finally { capture = null; }
    const outcome = Array.isArray(result) ? Object.freeze([...result]) : result;
    const receipt = receiptOf(op, outcome);
    chain = chainOf(chain, receipt);
    sequence += 1;
    const entry = Object.freeze({
      ...identity, sequence, op, ...details,
      words: words - start.words, rejections: rejections - start.rejections,
      outcome, receipt, chain,
      ...(drawn ? { samples: Object.freeze(drawn) } : {}),
    }) as RngJournalEntry;
    // A throwing journal fails the operation closed; the sequence gap stays visible.
    if (journal) journal(entry);
    return result;
  }

  return Object.freeze({
    mode,
    int(minInclusive: number, maxExclusive: number) {
      if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxExclusive)) throw new TypeError('int bounds must be safe integers');
      const range = maxExclusive - minInclusive;
      if (!(range >= 1 && range <= MAX_RANGE)) throw new RangeError(`int range must be 1..${MAX_RANGE}`);
      return record('int', { min: minInclusive, max: maxExclusive }, () => minInclusive + uniform(range));
    },
    // 53 random bits: 27 from the first word, 26 from the second, divided by 2^53.
    float() {
      return record('float', {}, () => ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992);
    },
    // Fisher–Yates from the last position on a copy; the input array is not changed.
    shuffle<T>(items: readonly T[]): T[] {
      checkItems(items, 'shuffle');
      return record('shuffle', { size: items.length }, () => {
        const order = [...items];
        for (let i = order.length - 1; i > 0; i--) {
          const j = uniform(i + 1);
          [order[i], order[j]] = [order[j], order[i]];
        }
        return order;
      });
    },
    // Partial Fisher–Yates from the front: count distinct items in draw order.
    drawWithoutReplacement<T>(items: readonly T[], count: number): T[] {
      checkItems(items, 'drawWithoutReplacement');
      if (!Number.isInteger(count) || count < 0 || count > items.length) throw new RangeError('count must be 0..items.length');
      return record('draw', { size: items.length, count }, () => {
        const pool = [...items];
        for (let i = 0; i < count; i++) {
          const j = i + uniform(pool.length - i);
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
      });
    },
    // One pocket of the wheel, every pocket with the same probability.
    rouletteSpin<T>(wheel: readonly T[]): RouletteSpin<T> {
      checkItems(wheel, 'rouletteSpin');
      if (wheel.length < 2) throw new RangeError('rouletteSpin requires at least two pockets');
      return record('rouletteSpin', { size: wheel.length }, () => {
        const index = uniform(wheel.length);
        return Object.freeze({ index, pocket: wheel[index] });
      });
    },
    // Raw source words for statistical export and self-tests; never a game outcome and
    // not journaled, only counted in proof().words.
    fillUint32(target: Uint32Array) {
      if (!(target instanceof Uint32Array)) throw new TypeError('fillUint32 requires a Uint32Array');
      if (source.fill) source.fill(target);
      else for (let i = 0; i < target.length; i++) target[i] = source.next();
      words += target.length;
      return target;
    },
    proof(): RngProof {
      return Object.freeze({ ...identity, operations: sequence, words, rejections, receipt: chain });
    },
  });
}

// Recomputes every receipt and the chain of a complete journal (sequence 1..n).
export function verifyJournal(entries: readonly RngJournalEntry[]): JournalVerification {
  const problems: string[] = [];
  if (!Array.isArray(entries) || !entries.length) return Object.freeze({ verified: false, entries: 0, receipt: null, problems: ['Empty journal'] });
  const { mode, seedHash = null } = entries[0];
  let chain = genesisOf(mode, seedHash);
  entries.forEach((entry, index) => {
    const at = `entry ${index + 1}`;
    if (entry.rngVersion !== RNG_VERSION) problems.push(`${at}: rngVersion ${entry.rngVersion}`);
    if (entry.mode !== mode || (entry.seedHash ?? null) !== seedHash) problems.push(`${at}: source changed`);
    if (entry.sequence !== index + 1) problems.push(`${at}: sequence ${entry.sequence}, expected ${index + 1}`);
    let receipt;
    try { receipt = receiptOf(entry.op, entry.outcome); } catch (error) { problems.push(`${at}: ${(error as Error).message}`); return; }
    if (receipt !== entry.receipt) problems.push(`${at}: receipt does not match outcome`);
    chain = chainOf(chain, receipt);
    if (chain !== entry.chain) problems.push(`${at}: chain does not match`);
  });
  return Object.freeze({ verified: problems.length === 0, entries: entries.length, receipt: chain, problems: Object.freeze(problems) });
}
