// Rule tests for game/round.ts (the ported Scout Round), on stacked shoes so every rule is
// asserted on known cards. Cases R1–R10 are ported from scoutgaming test/blackjack/split-rules.mjs
// (commit 0fe56ace3); the S17, 3:2, peek, insurance, bust and side-bet cases follow
// test/blackjack/blackjack-core.mjs and blackjack-sidebets.mjs. No media, network or Scout files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Round, handValue } from '../game/round.ts';
import type { BoxBet, Card } from '../game/round.ts';

const C = (text: string) => ({ r: text.slice(0, -1), s: text.slice(-1) }) as Card;
const cs = (c: Card) => c.r + c.s;
const cards = (h: { cards: Card[] }) => h.cards.map(cs);
const total = (h: { cards: Card[] }) => handValue(h.cards).total;
// Draws come off the END of the array: deal() takes the first card to each live box right to
// left, the dealer up-card, the second card to each box right to left, then the hole card.
function stacked(entries: BoxBet[], order: string[], filler = '5♣') {
  const r = new Round(entries, []);
  r.shoe = [...Array.from({ length: 80 }, () => C(filler)), ...order.map(C).reverse()];
  return r;
}
const handsOf = (r: Round, box: number) => r.live().filter(h => h.box === box);
const stakeSum = (r: Round, box: number) => handsOf(r, box).reduce((a, h) => a + h.stake, 0);
const illegal = { message: /^illegal action / };

test('R1 split only on the first two cards, same rank or any two ten-valued cards', () => {
  let r = stacked([10], ['8♠', '6♦', '8♥', '9♣', '3♦', '2♠']); r.deal();
  assert.deepEqual(r.legal(), ['hit', 'stand', 'double', 'split']);
  r = stacked([10], ['10♠', '6♦', 'K♦', '9♣']); r.deal();
  assert.ok(r.legal().includes('split'), '10 and K are both ten-valued');
  r = stacked([10], ['9♠', '6♦', '8♦', '9♣']); r.deal();
  assert.ok(!r.legal().includes('split'));
  assert.throws(() => r.act('split'), illegal);
  r = stacked([10], ['8♠', '6♦', '8♥', '9♣', '2♦']); r.deal(); r.act('hit');
  assert.deepEqual(cards(r.live()[0]), ['8♠', '8♥', '2♦']);
  assert.deepEqual(r.legal(), ['hit', 'stand'], 'no split or double after a hit');
  assert.throws(() => r.act('split'), illegal);
});

test('R2 a split hand costs the same bet, sits right of its parent and is played first', () => {
  const r = stacked([10], ['8♠', '6♦', '8♥', '9♣', '3♦', '2♠']); r.deal(); r.act('split');
  assert.deepEqual(r.live().map(cards), [['8♠', '3♦'], ['8♥', '2♠']]);
  assert.deepEqual(r.live().map(h => h.stake), [10, 10]);
  assert.equal(stakeSum(r, 0), 20);
  assert.deepEqual(r.live().map(h => [h.box, h.splitFrom]), [[0, 0], [0, 0]]);
  assert.equal(r.boxes[0], r.live()[0], 'boxes[0] is still the first hand of the box');
  assert.deepEqual([r.live()[1].pp, r.live()[1].tp, r.live()[1].sideReturn, r.live()[1].insured], [0, 0, 0, 0]);
  assert.equal(r.active, 1, 'the new (right) hand acts first');
});

test('R3 up to four hands per box, re-splitting until the cap, hands act right to left', () => {
  const r = stacked([10], ['8♠', '6♦', '8♥', '9♣', '8♦', '8♣', '8♠', '8♥', '8♦', '8♣']); r.deal();
  const counts = [];
  for (let i = 0; i < 3; i++) { r.act('split'); counts.push(handsOf(r, 0).length); }
  assert.deepEqual(counts, [2, 3, 4]);
  assert.deepEqual(r.live().map(cards), [['8♠', '8♦'], ['8♥', '8♠'], ['8♣', '8♦'], ['8♥', '8♣']]);
  assert.deepEqual(r.legal(), ['hit', 'stand', 'double'], 'a fourth pair cannot split');
  assert.throws(() => r.act('split'), illegal);
  assert.equal(stakeSum(r, 0), 40);
  const order = [];
  while (r.phase === 'decisions') { order.push(r.active); r.act('stand'); }
  assert.deepEqual(order, [3, 2, 1, 0]);
  assert.deepEqual(r.live().map(h => h.result), [0, 0, 0, 0], 'four 16s lose to the dealer 6 9 5 = 20');
});

test('R4 split aces get exactly one card each and cannot be re-split, hit or doubled', () => {
  const r = stacked([10], ['A♠', '6♦', 'A♥', '9♣', 'A♦', '7♣']); r.deal();
  assert.ok(r.legal().includes('split'));
  r.act('split');
  assert.deepEqual(r.live().map(cards), [['A♠', 'A♦'], ['A♥', '7♣']]);
  assert.deepEqual(r.live().map(h => h.done), [true, true]);
  assert.equal(r.phase, 'settled', 'the round moves straight past the player');
  assert.deepEqual(r.legal(), []);
  assert.throws(() => r.act('hit'), illegal);
  assert.equal(handsOf(r, 0).length, 2, 'the re-paired aces did not re-split');
});

test('R5 a two-card 21 after a split pays 1:1, an unsplit natural pays 3:2, dealer stands behind a natural', () => {
  let r = stacked([10], ['A♠', '6♦', 'A♥', '9♣', 'K♦', 'Q♣']); r.deal(); r.act('split');
  assert.deepEqual(r.live().map(h => [cards(h).join(' '), total(h)]), [['A♠ K♦', 21], ['A♥ Q♣', 21]]);
  assert.deepEqual(r.dealer.map(cs), ['6♦', '9♣', '5♣'], 'the dealer plays out post-split 21s');
  assert.deepEqual(r.live().map(h => h.result), [20, 20]);
  r = stacked([10], ['A♠', '6♦', 'K♦', '9♣']); r.deal();
  assert.equal(r.phase, 'settled');
  assert.equal(r.live()[0].result, 25, 'natural returns stake x 2.5');
  assert.deepEqual(r.dealer.map(cs), ['6♦', '9♣'], 'no dealer draw behind a natural');
  r = stacked([{ main: 10 }], ['8♠', 'A♦', '8♥', 'K♣']); r.deal();
  assert.equal(r.phase, 'insurance');
  r.resolveInsurance([true]);
  assert.equal(r.phase, 'settled', 'dealer blackjack ends the round at the peek');
  assert.equal(r.live().length, 1, 'the pair never got to split');
  assert.equal(r.live()[0].result, 15, 'box loses 10, insurance 5 returns 15');
});

test('R6 double after split doubles only that hand', () => {
  const r = stacked([10], ['8♠', '6♦', '8♥', '9♣', '3♦', '2♠', '9♥', 'K♦']); r.deal(); r.act('split');
  assert.deepEqual(r.legal(), ['hit', 'stand', 'double']);
  r.act('double');
  assert.deepEqual(cards(r.live()[1]), ['8♥', '2♠', '9♥']);
  assert.deepEqual(r.live().map(h => [h.doubled, h.stake]), [[false, 10], [true, 20]]);
  r.act('stand');
  assert.deepEqual([r.dealer.map(cs), handValue(r.dealer).total], [['6♦', '9♣', 'K♦'], 25]);
  assert.deepEqual(r.live().map(h => h.result), [20, 40]);
  assert.equal(stakeSum(r, 0), 30);
});

test('R7 every hand of a box plays before the box to its left', () => {
  const r = stacked([10, 20], ['8♠', '9♠', '6♦', '8♥', '9♥', '5♥', '3♦', '4♠']); r.deal();
  assert.deepEqual(cards(r.live()[0]), ['9♠', '9♥'], 'box 0 (camera-left) is dealt after box 1');
  assert.deepEqual(cards(r.live()[1]), ['8♠', '8♥']);
  const seen = [r.live()[r.active].box]; r.act('split');
  while (r.phase === 'decisions') { seen.push(r.live()[r.active].box); r.act('stand'); }
  assert.deepEqual(seen, [1, 1, 1, 0]);
  assert.deepEqual(r.live().map(cards), [['9♠', '9♥'], ['8♠', '3♦'], ['8♥', '4♠']]);
});

test('R8 side bets settle at the deal on the original two cards and are paid once', () => {
  const r = stacked([{ main: 10, pp: 5, tp: 5 }], ['8♥', '8♣', '8♦', '9♠', '3♦', '2♠']); r.deal();
  assert.deepEqual(r.live()[0].sideLabels, ['Colored Pair 12:1', 'Three of a Kind 30:1']);
  assert.equal(r.live()[0].sideReturn, 220);
  r.act('split');
  assert.deepEqual(r.live().map(h => h.sideReturn), [220, 0]);
  assert.deepEqual(r.live().map(h => [h.pp, h.tp]), [[5, 5], [0, 0]]);
  r.act('stand'); r.act('stand');
  assert.equal(r.live().reduce((a, h) => a + h.sideReturn, 0), 220);
});

test('R9 insurance is half the original box stake, stays on the box hand, and S17 stands on soft 17', () => {
  const r = stacked([{ main: 100 }], ['8♠', 'A♦', '8♥', '6♣', 'Q♦', 'K♠']); r.deal();
  assert.equal(r.phase, 'insurance');
  r.resolveInsurance([true]);
  assert.equal(r.live()[0].insured, 50);
  assert.equal(r.phase, 'decisions', 'no dealer blackjack behind the ace');
  r.act('split');
  assert.deepEqual(r.live().map(h => h.insured), [50, 0]);
  r.act('stand'); r.act('stand');
  assert.deepEqual([r.dealer.map(cs), handValue(r.dealer).total, handValue(r.dealer).soft], [['A♦', '6♣'], 17, true]);
  assert.deepEqual(r.live().map(h => h.result), [200, 200], 'both 18s win 1:1, insurance pays nothing');
});

test('R10 the dealer plays if any hand on any box can still be paid', () => {
  let r = stacked([10, 10], ['9♠', '8♠', '6♦', '9♥', '8♥', '4♣', 'K♦', 'K♣', '5♦']); r.deal();
  r.act('split'); r.act('hit'); r.act('hit');
  assert.deepEqual(handsOf(r, 1).map(total), [24, 24]);
  r.act('stand');
  assert.ok(r.dealer.length > 2 && handValue(r.dealer).total >= 17);
  assert.deepEqual(handsOf(r, 1).map(h => h.result), [0, 0]);
  r = stacked([10], ['A♠', '9♦', 'A♥', '6♣', 'K♦', 'Q♣']); r.deal(); r.act('split');
  assert.deepEqual([r.dealer.map(cs), handValue(r.dealer).total], [['9♦', '6♣', '5♣'], 20]);
  assert.deepEqual(r.live().map(h => h.result), [20, 20]);
});

test('S17: the dealer hits 16 and soft 16, stands on hard and soft 17', () => {
  const play = (order: string[]) => { const r = stacked([10], order, '2♣'); r.deal(); while (r.phase === 'decisions') r.act('stand'); return r; };
  assert.deepEqual(play(['10♠', '10♦', '8♥', '6♣', '9♠']).dealer.map(cs), ['10♦', '6♣', '9♠'], 'hard 16 draws');
  assert.deepEqual(play(['10♠', '5♦', '8♥', 'A♣', '5♠']).dealer.map(cs), ['5♦', 'A♣', '5♠'], 'soft 16 draws (to soft 21)');
  assert.deepEqual(play(['10♠', '5♦', '8♥', 'A♣', '9♠', '3♦']).dealer.map(cs), ['5♦', 'A♣', '9♠', '3♦'], 'soft 16 + 9 = hard 15 draws again');
  assert.deepEqual(play(['10♠', '10♦', '8♥', '7♣']).dealer.map(cs), ['10♦', '7♣'], 'hard 17 stands');
  const soft17 = play(['10♠', '6♦', '8♥', 'A♣']);
  assert.deepEqual([soft17.dealer.map(cs), handValue(soft17.dealer).soft], [['6♦', 'A♣'], true], 'soft 17 stands');
  assert.equal(soft17.live()[0].result, 20, 'player 18 beats soft 17');
});

test('payouts: win 1:1, push returns the stake, loss returns 0, natural 3:2, natural against dealer blackjack pushes', () => {
  const play = (order: string[]) => { const r = stacked([10], order); r.deal(); while (r.phase === 'decisions') r.act('stand'); return r.live()[0].result; };
  assert.equal(play(['10♠', '10♦', '9♥', '7♣']), 20);
  assert.equal(play(['10♠', '10♦', '8♥', '8♣']), 10);
  assert.equal(play(['10♠', '10♦', '7♥', '9♣']), 0);
  assert.equal(play(['A♠', '9♦', 'K♥', '8♣']), 25);
  assert.equal(play(['A♠', 'K♦', 'K♥', 'A♣']), 10, 'peek on a ten finds the dealer blackjack; natural pushes');
});

test('a busted hand loses even when the dealer busts too, and a bust ends the hand at once', () => {
  const r = stacked([10, 10], ['10♠', '10♥', '6♦', '6♠', '5♥', '10♣', 'K♠', 'Q♦']); r.deal();
  assert.equal(r.live()[r.active].box, 1);
  r.act('hit');                         // box 1: 10 6 K = 26
  assert.equal(r.live()[1].busted, true);
  assert.equal(r.live()[r.active].box, 0, 'the turn moves on by itself');
  r.act('stand');                       // box 0: 10 5 = 15
  assert.deepEqual([r.dealer.map(cs), handValue(r.dealer).total], [['6♦', '10♣', 'Q♦'], 26]);
  assert.deepEqual(r.live().map(h => h.result), [20, 0]);
});

test('peek and insurance: insurance only on an ace, peek on an ace or a ten, no peek on other up-cards', () => {
  let r = stacked([10], ['10♠', 'K♦', '9♥', '7♣']); r.deal();
  assert.equal(r.phase, 'decisions', 'ten up: peek finds no blackjack, no insurance');
  assert.ok(r.events.some(e => e.e === 'dealer.peek') && !r.events.some(e => e.e === 'insurance.offered'));
  r = stacked([10], ['10♠', '9♦', '9♥', 'A♣']); r.deal();
  assert.equal(r.phase, 'decisions');
  assert.ok(!r.events.some(e => e.e === 'dealer.peek'), 'no peek on a 9');
  r = stacked([10], ['10♠', 'A♦', '9♥', '6♣']); r.deal();
  assert.equal(r.phase, 'insurance');
  r.resolveInsurance([false]);
  assert.ok(r.events.some(e => e.e === 'dealer.peek'));
  assert.equal(r.phase, 'decisions');
});

test('side bets: Perfect Pairs and 21+3 pay the Scout table, the hole card never counts', () => {
  const deal = (first: string, second: string, up: string, bets: { pp?: number; tp?: number }, hole = '10♣') => {
    const r = new Round([{ main: 5, ...bets }], [C(hole), C(second), C(up), C(first)]); r.deal(); return r.hands[0];
  };
  const at5 = (a: string, b: string, up: string) => { const h = deal(a, b, up, { pp: 5, tp: 5 }); return [h.sideResults?.pp?.returned, h.sideResults?.tp?.returned]; };
  assert.deepEqual(at5('8♠', '8♠', '2♥'), [130, 0]);
  assert.deepEqual(at5('8♠', '8♣', '2♥'), [65, 0]);
  assert.deepEqual(at5('8♠', '8♥', '2♦'), [35, 0]);
  assert.deepEqual(at5('8♠', '8♠', '8♠'), [130, 505]);
  assert.deepEqual(at5('A♠', '2♠', '3♠'), [0, 205]);
  assert.deepEqual(at5('8♠', '8♥', '8♦'), [35, 155]);
  assert.deepEqual(at5('Q♠', 'K♥', 'A♦'), [0, 55]);
  assert.deepEqual(at5('2♠', '7♠', 'J♠'), [0, 30]);
  assert.deepEqual(at5('K♠', 'A♥', '2♦'), [0, 0], 'no K-A-2 wraparound');
  assert.equal(deal('7♠', '8♠', '2♦', { tp: 5 }, '9♠').sideReturn, 0, 'the hole card is not part of 21+3');
  assert.equal(deal('7♠', '8♠', '9♠', { tp: 5 }, '2♦').sideReturn, 205);
});

test('handValue counts aces as 11 until the hand would bust and reports soft totals', () => {
  const v = (...xs: string[]) => handValue(xs.map(C));
  assert.deepEqual(v('A♠', '6♦'), { total: 17, soft: true });
  assert.deepEqual(v('A♠', '6♦', '10♣'), { total: 17, soft: false });
  assert.deepEqual(v('A♠', 'A♦'), { total: 12, soft: true });
  assert.deepEqual(v('A♠', 'A♦', '9♣'), { total: 21, soft: true });
  assert.deepEqual(v('K♠', 'Q♦', 'J♣'), { total: 30, soft: false });
  assert.deepEqual(v(), { total: 0, soft: false });
});
