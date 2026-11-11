// Presentation tests for game/presentation.ts: settlement line, event order by shoeDraw, the hole
// card as a face-down deal with card null, reveal placement, slot families and filmed targets.
// Ported from scoutgaming test/blackjack/blackjack-presentation.mjs (commit 0fe56ace3), driving the
// ported core directly instead of Scout's table coordinator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, publicView, step } from '../game/core.ts';
import type { CoreCommand, GameState, PublicView } from '../game/core.ts';
import { catalogueEventId, filmedDealTarget, presentationEvents, settlementLine, withFamily } from '../game/presentation.ts';
import type { SignalEvent } from '../game/presentation.ts';
import { seededRandom, stackedRandom } from '../game/shoe-source.ts';
import type { RandomPort } from '../game/random-port.ts';

type Ev = SignalEvent;
const fam = (e: SignalEvent) => (withFamily(e) as { family?: string }).family;
const order = (events: Ev[]) => events.filter(e => e.type === 'deal' || e.type === 'reveal')
  .map(e => `${e.type === 'reveal' ? 'reveal' : e.to === 'dealer' ? (e.faceDown ? 'hole' : 'dealer') : `box${e.box}`}#${e.shoeDraw}`);
const SUIT = ['♠', '♦', '♥', '♣'];
// Ranks in draw order (deal: player, dealer up, player, hole, then hits/dealer draws), suits cycling as in Scout's test.
const stack = (ranks: string[]) => stackedRandom('presentation', ranks.map((r, i) => ({ r, s: SUIT[i % 4] })));
const funding = { available: 1e6, reserved: { stake: { 0: 1e3, 1: 1e3, 2: 1e3, 3: 1e3, 4: 1e3, 5: 1e3, 6: 1e3 }, insurance: { 0: 1e3, 1: 1e3, 2: 1e3, 3: 1e3, 4: 1e3, 5: 1e3, 6: 1e3 } } };
const betsOn = (boxes: number[], main = 10) => Array.from({ length: 7 }, (_, i) => ({ main: boxes.includes(i) ? main : 0, pp: 0, tp: 0 }));

function driver(random: RandomPort) {
  let state: GameState = newGame({ random }).state;
  return {
    get state() { return state; },
    send(command: CoreCommand) {
      const before = publicView(state), out = step(state, command, {}, { random, funding });
      state = out.state;
      return { before, after: out.view as PublicView, events: presentationEvents(before, out.view, command.op, { action: (command as { action?: string }).action }), out };
    },
    act(action: string) {
      const r = state.round!;
      return this.send({ op: 'act', action, roundId: state.roundId, turnSeq: state.turnSeq, box: r.hands[r.active].box, handIndex: r.active });
    },
  };
}

test('settlement line: one line for the table, never false for most of the hands it speaks to', () => {
  const c = (...ranks: string[]) => ranks.map((r, i) => ({ r, s: '♠', shoeDraw: i + 1 })) as any[];
  const hand = (cards: string[], result: number, extra = {}) => ({ box: 3, stake: 10, cards: c(...cards), result, splitFrom: null, ...extra });
  const bust = hand(['10', '6', '9'], 0, { busted: true }), bj = hand(['A', 'K'], 25), win = hand(['10', '9'], 20), push = hand(['10', '8'], 10), lose = hand(['10', '7'], 0);
  const rows: Array<[string, string[], any[], string | null]> = [
    ['dealer blackjack, a player pushes on her own blackjack', ['A', 'K'], [hand(['A', 'Q'], 10)], 'push'],
    ['dealer bust, but a player busted first', ['10', '6', '9'], [bust, win], 'win'],
    ['a push beside a busted hand', ['10', '8'], [bust, push], 'push'],
    ['one win, one loss: silence', ['10', '8'], [win, lose], null],
    ['dealer blackjack, every hand loses', ['A', 'K'], [lose, hand(['9', '9'], 0)], 'dealerblackjack'],
    ['dealer bust, nobody busted', ['10', '6', '9'], [win, win], 'dealerbust'],
    ['the table wins, one hand on a natural', ['10', '8'], [bj, win], 'blackjack'],
    ['a split 21 is a win, not a blackjack', ['10', '8'], [hand(['A', 'K'], 20, { splitFrom: 3 })], 'win'],
    ['every hand busted', ['10', '6'], [bust, bust], 'lose'],
    ['mixed, more than half lose', ['10', '8'], [win, lose, lose], 'lose'],
    ['mixed three ways, no majority', ['10', '8'], [win, push, lose], null],
    ['only the dealer: no staked hand', ['10', '8'], [hand(['10', '9'], 0, { stake: 0 })], null],
  ];
  for (const [name, dealer, hands, line] of rows) {
    const round = { phase: 'settled', dealer: c(...dealer), hands };
    assert.equal(settlementLine(round), line, name);
    const spoken = presentationEvents({ round: { ...round, phase: 'dealer' } }, { round }, 'act').filter(e => e.type === 'speak').map(e => (e as { line: string }).line);
    assert.deepEqual(spoken, line ? [line] : [], `${name}: the plan speaks the line`);
  }
});

test('an immediate dealer blackjack: hidden hole deal, then the reveal, then settle; goodluck first', () => {
  const t = driver(stack(['10', '10', '9', 'A']));
  const { events, after } = t.send({ op: 'start', bets: betsOn([3]) });
  assert.equal(after.round!.phase, 'settled');
  assert.deepEqual(events.map(e => e.type), ['speak', 'deal', 'deal', 'deal', 'deal', 'reveal', 'settle', 'speak']);
  assert.deepEqual(order(events), ['box3#2', 'dealer#3', 'box3#4', 'hole#5', 'reveal#5']);
  const hole = events.find(e => e.type === 'deal' && e.faceDown)!;
  assert.deepEqual(hole, { type: 'deal', to: 'dealer', box: null, handIndex: null, card: null, faceDown: true, shoeDraw: 5, clip: { action: 'deal-dealer', fallback: 'slide' } });
  assert.equal((events[0] as { line: string }).line, 'goodluck');
  assert.equal((events.at(-1) as { line: string }).line, 'dealerblackjack');
});

test('a hit that ends the turn: player card, then reveal, then extra dealer cards; a stand reveals first', () => {
  let t = driver(stack(['10', '6', '6', '10', '5', '8']));
  t.send({ op: 'start', bets: betsOn([3]) });
  let { events } = t.act('hit');
  assert.deepEqual(order(events), ['box3#6', 'reveal#5', 'dealer#7']);
  assert.deepEqual(events.slice(-2).map(e => e.type), ['settle', 'speak']);
  t = driver(stack(['10', '6', '9', '10', '5']));
  t.send({ op: 'start', bets: betsOn([3]) });
  ({ events } = t.act('stand'));
  assert.deepEqual(order(events), ['reveal#5', 'dealer#6']);
});

test('a two-card 21 after a split settles as win, never blackjack', () => {
  const t = driver(stack(['A', '6', 'A', '10', '10', 'K', '9']));
  t.send({ op: 'start', bets: betsOn([3]) });
  const { events, after } = t.act('split');
  assert.ok(after.round!.hands.every(h => h.cards.length === 2 && h.splitFrom === 3));
  assert.deepEqual(order(events), ['box3#6', 'box3#7', 'reveal#5', 'dealer#8']);
  assert.deepEqual(events.find(e => e.type === 'settle')!.hands.map(h => h.outcome), ['win', 'win']);
  assert.equal((events.at(-1) as { line: string }).line, 'dealerbust');
});

test('insurance, double, turn and collect cues', () => {
  let t = driver(stack(['10', 'A', '9', '6', '2']));
  let step1 = t.send({ op: 'start', bets: betsOn([3]) });
  assert.deepEqual(step1.events.slice(-1), [{ type: 'speak', line: 'insurance' }], 'insurance offered, no turn yet');
  const ins = t.send({ op: 'insurance', take: false, roundId: t.state.roundId });
  assert.deepEqual(ins.events, [{ type: 'turn', box: 3, handIndex: 0, legalActions: ['hit', 'stand', 'double'] }]);
  t = driver(stack(['6', '9', '5', '7', '10', 'K']));
  t.send({ op: 'start', bets: betsOn([3]) });
  const dbl = t.act('double');
  // Scout's raw generator queues the double line after the deals, so the reveal and dealer draw land
  // before it; Scout's filmed client reorders it first (orderFilmedPresentationEvents, not ported).
  assert.deepEqual(dbl.events.map(e => e.type), ['deal', 'reveal', 'deal', 'speak', 'settle', 'speak']);
  assert.equal((dbl.events[3] as { line: string }).line, 'double');
  const collect = t.send({ op: 'collect', roundId: t.state.roundId });
  assert.deepEqual(collect.events, [{ type: 'speak', line: 'placebets' }, { type: 'idle' }]);
});

test('families and filmed targets follow Scout: left 0-1, centre 2-4, right 5-6; dealer-up, dealer-hole, flip', () => {
  const deal = (box: number | null, faceDown = false) => ({ type: 'deal', to: box == null ? 'dealer' : 'box', box, handIndex: box == null ? null : 0, card: faceDown ? null : { r: 'A', s: '♠' }, faceDown, shoeDraw: 2, clip: { action: 'deal-centre', fallback: 'slide' } }) as SignalEvent;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(b => fam(deal(b))),
    ['deal.player.left/box0', 'deal.player.left/box1', 'deal.player.centre/box2', 'deal.player.centre/box3', 'deal.player.centre/box4', 'deal.player.right/box5', 'deal.player.right/box6']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(b => filmedDealTarget(deal(b))), ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(fam(deal(null)), 'deal.dealer/dealer-up');
  assert.equal(fam(deal(null, true)), 'deal.dealer/dealer-hole');
  assert.deepEqual([filmedDealTarget(deal(null)), filmedDealTarget(deal(null, true)), filmedDealTarget({ type: 'reveal', to: 'dealer' })], ['dealer', 'hole', 'flip']);
  assert.equal(fam({ type: 'reveal', to: 'dealer', card: { r: 'A', s: '♠' }, shoeDraw: 5 }), 'reveal.dealer/dealer-hole');
  assert.equal(fam({ type: 'speak', line: 'goodluck' }), 'speak.goodluck/goodluck');
  assert.equal(fam({ type: 'speak', line: 'placebets' }), 'speak.other/placebets');
  assert.equal(fam({ type: 'idle' }), 'idle.ready/ready');
  assert.equal(catalogueEventId({ type: 'turn', box: 3, handIndex: 0, legalActions: [] }), null, 'turn and settle are game facts, not slots');
});

test('the generator follows server draw order and reveals the hole exactly once over 300 core rounds', () => {
  let compared = 0, reveals = 0;
  for (let seed = 0; seed < 300; seed++) {
    const random = seededRandom(`parity-${seed}`);
    const boxes = [[3], [0, 6], [1, 2, 5]][seed % 3];
    let state = newGame({ random }).state, before = publicView(state);
    let command: CoreCommand | null = { op: 'start', bets: betsOn(boxes) };
    for (let guard = 0; guard < 40 && command; guard++) {
      const out = step(state, command, {}, { random, funding }), after = out.view;
      const events = presentationEvents(before, after, command.op, { action: (command as { action?: string }).action });
      const deals = events.filter(e => e.type === 'deal');
      const draws = out.events.filter(e => e.type.startsWith('engine.')).flatMap(e => e.payload.draws);
      assert.deepEqual(deals.map(e => e.shoeDraw), draws.map((d: { position: number }) => d.position), `seed ${seed}: every draw in server order`);
      for (const event of deals) {
        const draw = draws.find((d: { position: number }) => d.position === event.shoeDraw);
        if (event.faceDown) { assert.equal(event.shoeDraw, after.round!.holeDraw); assert.equal(event.card, null); }
        else assert.deepEqual(event.card, { r: draw.card.r, s: draw.card.s });
      }
      const reveal = events.findIndex(e => e.type === 'reveal');
      const shouldReveal: boolean = after.round!.dealer.length > 1 && (command.op === 'start' || before.round!.dealer.length === 1);
      assert.equal(events.filter(e => e.type === 'reveal').length, shouldReveal ? 1 : 0);
      if (shouldReveal) {
        assert.equal((events[reveal] as { shoeDraw: number }).shoeDraw, after.round!.holeDraw);
        assert.ok(events.every((e, i) => e.type !== 'deal' || (e.to === 'dealer' && e.shoeDraw > (after.round!.holeDraw as number) ? i > reveal : i < reveal)));
      }
      compared++; reveals += Number(shouldReveal);
      state = out.state; before = after;
      const r = after.round!;
      if (r.phase === 'insurance') command = { op: 'insurance', roundId: after.roundId, take: false };
      else if (r.phase === 'decisions') {
        const hand = r.hands[r.active], total = hand.cards.reduce((n, c) => n + (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r)), 0);
        const action = r.legalActions.includes('split') && seed % 2 ? 'split' : r.legalActions.includes('double') && total === 11 ? 'double' : total < 17 ? 'hit' : 'stand';
        command = { op: 'act', action, roundId: after.roundId, turnSeq: after.turnSeq, box: hand.box, handIndex: r.active };
      } else command = null;
    }
    assert.equal(state.round!.phase, 'settled', `seed ${seed}: the round completes`);
  }
  assert.ok(compared > 600 && reveals > 200, `${compared} steps, ${reveals} with a reveal`);
});
