// Lab shoe sources for the local session: which random port shuffles the shoe.
//   secure  production port (random-port.ts secureRandom): Node CSPRNG, no seed.
//   seeded  game-rng seeded mode, generator n seeded with "<seed>/<n>" (reproducible demos).
//   stacked LAB ONLY: the first dealt cards are fixed by an explicit list (draw order from
//           shoeDraw 2, right after the burn card); the burn card and the rest of the shoe are
//           shuffled from the seed. Later shoes (after a cut) are seeded from the same seed.
// New code, modelled on scoutgaming test/fixtures/game-random.mjs (git blob
// f4c2f7da5c9be7b7d76fed18915ba8fedfb26695, commit 0fe56ace3): seededRandom and the
// counter-based nonce/uuid are that fixture's; stackedRandom is new.
//
// A stacked shoe is NOT a forged shuffle: it is a game-rng replay draw whose recorded words
// produce the requested order through the ordinary Fisher–Yates, so the core's own replay
// check and the shoe proof still verify, and its journal receipt names mode 'replay'.
// sourceOfMode() turns that receipt mode into the public name, so a stacked shoe can never
// be shown as secure or seeded play.
import { createHash } from 'node:crypto';
import { createRng } from './rng.ts';
import type { RngMode } from './rng.ts';
import { secureRandom } from './random-port.ts';
import type { RandomPort, RngSettings } from './random-port.ts';
import { RANKS, SUITS } from './round.ts';
import { SHOE_RULES } from './shoe-rules.ts';
import type { PhysicalCard } from './shoe-proof.ts';

export type ShoeSource = 'secure' | 'seeded' | 'stacked';
export type ShoeOption =
  | { mode: 'secure' }
  | { mode: 'seeded'; seed: string }
  | { mode: 'stacked'; seed: string; cards: Array<{ r: string; s: string }> };

export class ShoeSourceError extends Error {
  declare code: string;
  constructor(message: string) { super(message); this.name = 'ShoeSourceError'; this.code = 'INVALID_SHOE'; }
}

/** The public name of a shoe, read from its game-rng receipt mode. */
export function sourceOfMode(mode: RngMode): ShoeSource {
  return mode === 'secure' ? 'secure' : mode === 'seeded' ? 'seeded' : 'stacked';
}

export const uuidOf = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) & 3]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
const counterIds = (label: string) => {
  let n = 0;
  const hex = (kind: string) => createHash('sha256').update(`${label}:${kind}:${++n}`).digest('hex');
  return { nonce: () => hex('nonce'), uuid: () => uuidOf(hex('uuid')) };
};

function checkSeed(seed: unknown): string {
  if (typeof seed !== 'string' || !seed.length || seed.length > 200) throw new ShoeSourceError('A shoe seed must be a string of 1-200 characters');
  return seed;
}

// Seeded mode: generator n uses the seed "<seed>/<n>", so the same seed and call order
// give the same shoes, and different generators never repeat each other.
export function seededRandom(seed: string): RandomPort {
  checkSeed(seed);
  let generators = 0;
  return {
    ...counterIds(`seeded:${seed}`),
    rng: ({ journal = null, recordSamples = false }: RngSettings = {}) => createRng({ mode: 'seeded', seed: `${seed}/${++generators}`,
      allowDeterministic: true, journal, recordSamples }),
  };
}

/** The unshuffled eight-deck shoe, in the same order and with the same serials as core.ts builds it. */
export function physicalDeck(): PhysicalCard[] {
  const deck: PhysicalCard[] = [];
  for (let d = 0; d < SHOE_RULES.decks; d++) for (const s of SUITS) for (const r of RANKS) deck.push({ r, s, serial: deck.length + 1 });
  return deck;
}

/**
 * The 32-bit words that make game-rng's Fisher–Yates (from the last index, j = word % (i + 1))
 * turn `deck` into exactly `order`. Every word is below i + 1, so none is rejected.
 */
export function wordsForOrder(deck: readonly PhysicalCard[], order: readonly PhysicalCard[]): number[] {
  if (deck.length !== order.length) throw new ShoeSourceError('The stacked order must hold every card of the shoe');
  const arr = [...deck], at = new Map(arr.map((card, index) => [card.serial, index]));
  const words: number[] = [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = at.get(order[i].serial);
    if (j === undefined || j > i) throw new ShoeSourceError('The stacked order is not a permutation of the shoe');
    words.push(j);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    at.set(arr[i].serial, i); at.set(arr[j].serial, j);
  }
  return words;
}

/**
 * The full draw order of a stacked first shoe: [burn, ...cards, ...rest], where burn and rest
 * are the remaining physical cards shuffled by game-rng seeded with "<seed>/1". Each requested
 * card takes the lowest unused serial of its rank and suit (at most eight of each).
 */
export function stackedDrawOrder(seed: string, cards: ReadonlyArray<{ r: string; s: string }>): PhysicalCard[] {
  checkSeed(seed);
  if (!Array.isArray(cards) || !cards.length || cards.length > SHOE_RULES.total - SHOE_RULES.burn) throw new ShoeSourceError('A stacked shoe needs 1-415 cards');
  const deck = physicalDeck(), used = new Set<number>(), picked: PhysicalCard[] = [];
  for (const card of cards) {
    if (!card || !(RANKS as string[]).includes(card.r) || !(SUITS as string[]).includes(card.s)) throw new ShoeSourceError(`Unknown card ${JSON.stringify(card)}`);
    const physical = deck.find(c => c.r === card.r && c.s === card.s && !used.has(c.serial));
    if (!physical) throw new ShoeSourceError(`More than ${SHOE_RULES.decks} of ${card.r}${card.s} requested`);
    used.add(physical.serial); picked.push(physical);
  }
  const rest = createRng({ mode: 'seeded', seed: `${seed}/1`, allowDeterministic: true }).shuffle(deck.filter(c => !used.has(c.serial)));
  return [rest[0], ...picked, ...rest.slice(1)];
}

/** LAB ONLY. First shoe: the stacked order as a replay draw; later shoes: seeded "<seed>/<n>". */
export function stackedRandom(seed: string, cards: ReadonlyArray<{ r: string; s: string }>): RandomPort {
  const drawOrder = stackedDrawOrder(seed, cards);
  // The engine pops from the end of its array, so the array is the draw order reversed.
  const words = wordsForOrder(physicalDeck(), [...drawOrder].reverse());
  let generators = 0;
  return {
    ...counterIds(`stacked:${seed}`),
    rng: ({ journal = null, recordSamples = false }: RngSettings = {}) => ++generators === 1
      ? createRng({ mode: 'replay', samples: words, allowDeterministic: true, journal, recordSamples })
      : createRng({ mode: 'seeded', seed: `${seed}/${generators}`, allowDeterministic: true, journal, recordSamples }),
  };
}

/** The random port for a session's shoe option (default secure). */
export function randomPortFor(option: ShoeOption | undefined): RandomPort {
  const mode = option?.mode ?? 'secure';
  if (mode === 'secure') return secureRandom();
  if (mode === 'seeded') return seededRandom((option as { seed: string }).seed);
  if (mode === 'stacked') { const o = option as { seed: string; cards: Array<{ r: string; s: string }> }; return stackedRandom(o.seed, o.cards); }
  throw new ShoeSourceError(`Unknown shoe mode ${JSON.stringify(mode)}`);
}

