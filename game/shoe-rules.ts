// Shoe rules of the local blackjack engine: eight decks, one burn card, cut card after 312
// dealt cards, and the public between-round reserve that decides when a shoe is replaced.
// Ported from scoutgaming packages/shared/blackjack-shoe-rules.mjs at commit 0fe56ace3
// (git blob 0d0993db2218c49104134b54e74fc721a015e6f0). Logic unchanged; only types added.

export const SHOE_RULES = Object.freeze({ decks: 8, cutAfter: 312, total: 416, burn: 1 });
export type ShoeRules = typeof SHOE_RULES;

// Versioned between-round policy, independent of hidden card ranks/order. Keep
// SHOE_RULES byte-compatible: existing v1 commitments include its exact JSON.
export const SHOE_RESERVE_POLICY = 'blackjack-shoe-reserve/1';

export function roundCardReserve(boxes: number): number {
  if (!Number.isInteger(boxes) || boxes < 1 || boxes > 7) throw new RangeError('Expected 1-7 funded boxes');
  // At most four hands per box. Counting aces as one, each player hand has at
  // most 20 points before its final card (+10), the S17 dealer at most 16+10.
  // The cheapest cards in eight decks bound consumption without looking into
  // the actual remaining shoe. This is sufficient, not a tight maximum.
  let points = boxes * 4 * 30 + 26, cards = 0;
  for (let value = 1; value <= 10; value++) {
    const count = value === 10 ? 128 : 32;
    const take = Math.min(count, Math.floor(points / value));
    cards += take; points -= take * value;
    if (take < count) break;
  }
  return cards;
}
