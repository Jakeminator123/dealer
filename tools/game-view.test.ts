import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, type Snapshot} from '../game/session.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createLayout} from '../src/game-table.ts';
import {planBeats, cardRecords, lyingAfter} from '../src/game-director.ts';
import {cardOptions, placedCards} from '../src/game-film.ts';
import {tableView, tableCards, cardFaces, shownBy, lineOf, handKey, DEALER_KEY, type PageState} from '../src/game-view.ts';
import {totalText, chipsFor} from '../src/game-overlay.ts';

// A stacked lab shoe: the cards in draw order from draw 2 (draw 1 is the burn card). One seat plays, seat 4:
// seat 4 gets K and 6, the dealer shows 7 and hides a 10, and the next card in the shoe is a 5.
const card = (text: string) => ({r: text.slice(0, -1), s: text.slice(-1)});
const session = (cards: string, balance = 1000) => createSession({balance, shoe: {mode: 'stacked', seed: 'view', cards: cards.split(' ').map(card)}});
let request = 0;
const run = (s: ReturnType<typeof createSession>, command: Record<string, unknown>): Snapshot => s.command({...command, requestId: `r${++request}`, expectedVersion: s.state().ver});
const page = (patch: Partial<PageState> = {}): PageState => ({stage: 'ROUND', busy: false, dealerPlays: false, bets: {}, last: null, chip: 25, balance: 1000, shown: {}, settled: null, line: null, error: null, ...patch});

test('betting: the overlay shows the chips laid, and dealing needs a bet the balance and the limits allow', () => {
  const s = session('K♠ 7♦ 6♥ 10♣ 5♦'), snapshot = s.state();
  const empty = tableView(snapshot, page({stage: 'BETTING'}));
  assert.equal(empty.phase, 'BETTING'); assert.equal(empty.canDeal, false); assert.equal(empty.seats.length, 7);
  assert.deepEqual(empty.seats.map(x => x.seat), [1, 2, 3, 4, 5, 6, 7]);
  const laid = tableView(snapshot, page({stage: 'BETTING', bets: {4: [25, 25, 100]}}));
  assert.equal(laid.canDeal, true); assert.equal(laid.staked, 150); assert.deepEqual(laid.seats[3].chips, [25, 25, 100]); assert.equal(laid.seats[3].amount, 150);
  assert.equal(tableView(snapshot, page({stage: 'BETTING', bets: {4: [1000, 1000, 100]}})).canDeal, false, 'over the table maximum');
  assert.equal(tableView(snapshot, page({stage: 'BETTING', bets: {4: [500], 5: [500], 6: [25]}})).canDeal, false, 'more than the balance');
  assert.equal(tableView(snapshot, page({stage: 'BETTING', last: {4: [25]}})).canRebet, true);
});

test('opening deal: beats in the engine\'s order, totals only as the cards land, the hole card never shown', () => {
  const s = session('K♠ 7♦ 6♥ 10♣ 5♦'), dealt = run(s, {op: 'start', bets: [{seat: 4, main: 10}]});
  const table = tableCards(dealt);
  assert.deepEqual(table, {hands: [{seat: 4, cards: [2, 4]}], dealer: [3, 5]});
  const beats = planBeats(table, [], dealt.events);
  assert.deepEqual(beats.map(b => `${b.step.from}>${b.step.to}`), ['IDLE>READY', 'READY>P4.C1', 'P4.C1>READY', 'READY>D.C1', 'D.C1>READY', 'READY>P4.C2', 'P4.C2>READY', 'READY>D.C2', 'D.C2>IDLE']);
  // What each landed card showed, straight from the engine's signals.
  const shown = dealt.events.filter(e => e.type === 'deal').map(e => shownBy(e)!);
  assert.deepEqual(shown.map(x => [x.key, x.total]), [[handKey(4, 0), 10], [DEALER_KEY, 7], [handKey(4, 0), 16], [DEALER_KEY, 7]]);
  // The hole card has no face anywhere the page reads.
  const faces = cardFaces(dealt), records = cardRecords(table, faces);
  assert.deepEqual(records.find(r => r.shoeDraw === 5), {shoeDraw: 5, target: 'D.C2', r: null, s: null, faceDown: true});
  assert.ok(!JSON.stringify(dealt).includes('"r":"10"'), 'the ten is not in the answer');
  assert.deepEqual(records.find(r => r.shoeDraw === 2), {shoeDraw: 2, target: 'P4.C1', r: 'K', s: 'spades', faceDown: false});
  // While the film plays, the overlay shows what has landed, not what the engine already knows.
  const first = tableView(dealt, page({busy: true, shown: {[handKey(4, 0)]: {total: 10, soft: false, natural: false}}}));
  assert.equal(first.phase, 'DEALING'); assert.equal(first.seats[3].hands[0].total, 10); assert.equal(first.dealer!.total, null); assert.deepEqual(first.actions, []);
  const after = tableView(dealt, page());
  assert.equal(after.phase, 'TURN'); assert.equal(after.seats[3].hands[0].total, 16); assert.equal(after.seats[3].hands[0].active, true); assert.equal(after.seats[3].turn, true);
  assert.equal(after.dealer!.total, 7); assert.ok(after.actions.includes('hit') && after.actions.includes('stand'));
  assert.match(after.message, /plats 4/);
});

test('a hit, the dealer\'s turn and the result', () => {
  const s = session('K♠ 7♦ 6♥ 10♣ 5♦'), dealt = run(s, {op: 'start', bets: [{seat: 4, main: 10}]});
  const lying = lyingAfter([], planBeats(tableCards(dealt), [], dealt.events));
  const r = dealt.view.round!, hit = run(s, {op: 'act', seat: 4, handIndex: r.active, action: 'hit', roundId: dealt.view.roundId, turnSeq: dealt.view.turnSeq});
  const beats = planBeats(tableCards(hit), lying, hit.events);
  assert.deepEqual(beats.slice(0, 3).map(b => `${b.step.from}>${b.step.to}`), ['IDLE>READY', 'READY>P4.C1', 'P4.C1>IDLE']);
  assert.equal(beats[1].own!.label, 'P4.C3');
  assert.equal(shownBy(hit.events.find(e => e.type === 'deal')!)!.total, 21);
  // 21 ends the hand: the dealer turns the hole card (17, stands) and the hand wins.
  const reveal = hit.events.find(e => e.type === 'reveal'), settle = hit.events.find(e => e.type === 'settle');
  assert.ok(reveal && settle, 'the step runs through the dealer\'s turn');
  assert.equal(beats[3].kind, 'REVEAL'); assert.equal(shownBy(reveal!)!.total, 17);
  // The win reaches the balance when the round is collected; the page shows the settled round with that balance.
  const paid = run(s, {op: 'collect', roundId: hit.view.roundId});
  assert.equal(hit.balance, 990); assert.equal(paid.balance, 1010); assert.equal(paid.view.round ?? null, null);
  const done = tableView(hit, page({stage: 'SETTLED', balance: paid.balance, settled: settle as never, line: lineOf(hit.events)}));
  assert.equal(done.phase, 'SETTLED'); assert.equal(done.seats[3].hands[0].outcome, 'win'); assert.equal(done.seats[3].hands[0].net, 10);
  assert.equal(done.dealer!.total, 17); assert.equal(done.balance, 1010); assert.match(done.message, /17/);
  // The turned card is open in the records after the step.
  assert.equal(cardRecords(tableCards(hit), cardFaces(hit)).find(x => x.shoeDraw === 5)!.r, '10');
});

test('a natural is marked by the engine, not by the overlay', () => {
  const s = session('A♠ 7♦ K♥ 9♣'), dealt = run(s, {op: 'start', bets: [{seat: 4, main: 10}]});
  const last = dealt.events.filter(e => e.type === 'deal' && e.to === 'seat').map(e => shownBy(e)!).pop()!;
  assert.equal(last.natural, true); assert.equal(last.total, 21);
  const view = tableView(dealt, page({busy: true, shown: {[last.key]: last}}));
  assert.equal(view.seats[3].hands[0].state, 'BLACKJACK');
});

test('card layer options: the lying cards on their own places, the film\'s card with its landing quad and draw number', () => {
  const s = session('K♠ 7♦ 6♥ 10♣ 5♦'), dealt = run(s, {op: 'start', bets: [{seat: 4, main: 10}]}), table = tableCards(dealt), records = cardRecords(table, cardFaces(dealt));
  const layout = createLayout(defaultPlan()), beats = planBeats(table, [], dealt.events), second = beats.find(b => b.kind === 'DEAL' && b.own!.shoeDraw === 4)!;
  const options = cardOptions(second, table, records, layout) as {placed: {shoeDraw: number; back: boolean; target: string; quad: unknown[]}[]; land: unknown[]; shoeDraw: number; target: string; cards: unknown[]};
  assert.deepEqual(options.placed.map(p => [p.shoeDraw, p.target, p.back]), [[2, 'P4.C1', false], [3, 'D.C1', false]]);
  assert.equal(options.shoeDraw, 4); assert.equal(options.target, 'P4.C2'); assert.equal(options.land.length, 4); assert.equal(options.cards.length, 4);
  assert.deepEqual(placedCards(table, records, [5], layout).map(p => p.back), [true], 'the lying hole card shows its back');
});

test('small things the overlay writes', () => {
  assert.equal(totalText({total: 17, soft: true}), '7/17'); assert.equal(totalText({total: 17, soft: false}), '17'); assert.equal(totalText({total: 21, soft: true}), '11/21'); assert.equal(totalText({total: null, soft: false}), '');
  assert.deepEqual(chipsFor(155, [5, 25, 100, 500, 1000]), [100, 25, 25, 5]);
});
