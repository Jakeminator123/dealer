// Session tests for game/session.ts: defaults, money over win/lose/push/blackjack/double/split/
// insurance/bust, idempotency by requestId, stale expectedVersion, typed errors, shoe source naming,
// hand totals on deal/reveal events (checked against an independent model of the visible cards),
// and that the hole card never appears, nor can be derived, before its reveal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, SessionError } from '../game/session.ts';
import type { Session, SessionOptions, Snapshot } from '../game/session.ts';
import { handValue } from '../game/round.ts';
import type { Card } from '../game/round.ts';
import type { SeatDealEvent, SeatRevealEvent } from '../game/seats.ts';

const C = (text: string) => ({ r: text.slice(0, -1), s: text.slice(-1) });
const stacked = (cards: string, extra: SessionOptions = {}) => createSession({ shoe: { mode: 'stacked', seed: 'session', cards: cards.split(' ').map(C) }, ...extra });
const err = (code: string, status?: number) => (error: unknown) => error instanceof SessionError && error.code === code && (status === undefined || error.status === status);

function drive(s: Session) {
  let n = 0;
  const send = (cmd: Record<string, unknown>) => s.command({ ...cmd, requestId: `r${++n}`, expectedVersion: s.state().ver });
  return {
    send,
    start: (bets: Array<{ seat: number; main: number; pp?: number; tp?: number }>) => send({ op: 'start', bets }),
    act: (action: string) => { const v = s.state().view, r = v.round!; return send({ op: 'act', action, seat: r.activeSeat, handIndex: r.active, roundId: v.roundId, turnSeq: v.turnSeq }); },
    insurance: (x: Record<string, unknown>) => send({ op: 'insurance', roundId: s.state().view.roundId, ...x }),
    collect: () => send({ op: 'collect', roundId: s.state().view.roundId }),
  };
}
const settleOf = (r: Snapshot) => r.events.find(e => e.type === 'settle') as Extract<Snapshot['events'][number], { type: 'settle' }> | undefined;

// Every object in a result that carries the hole card's identity: its serial, or a rank at its shoe position.
function holeLeaks(value: unknown, hole: { serial: number; shoeDraw: number }): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.serial === hole.serial) found.push(`${path} has the hole serial`);
    if (o.shoeDraw === hole.shoeDraw && (o.r != null || (o.card != null && typeof o.card === 'object'))) found.push(`${path} shows a rank at the hole position`);
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
  };
  walk(value, '$');
  return found;
}

test('defaults: balance 1000, Scout limits 5/2000/2000, secure shoe, no round', () => {
  const s = createSession(), state = s.state();
  assert.equal(state.ver, 0);
  assert.equal(state.balance, 1000);
  assert.deepEqual(state.limits, { min: 5, max: 2000, sideMax: 2000 });
  assert.equal(state.view.shoe!.source, 'secure');
  assert.equal(state.view.round, null);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.legalActions, []);
});

test('money: win, lose, push, blackjack, bust and half chips, applied from the core effects', () => {
  const round = (cards: string, actions: string[], main = 10) => {
    const s = stacked(cards), d = drive(s);
    const started = d.start([{ seat: 4, main }]);
    assert.equal(started.balance, 1000 - main, 'the stake leaves the balance at start');
    let last = started;
    for (const a of actions) last = d.act(a);
    const outcome = settleOf(last)?.hands[0].outcome;
    return { outcome, balance: d.collect().balance, ledger: s.ledger() };
  };
  assert.deepEqual([round('10♠ 7♦ 9♥ 10♣', ['stand']).outcome, round('10♠ 7♦ 9♥ 10♣', ['stand']).balance], ['win', 1010]);
  assert.deepEqual([round('10♠ 10♦ 7♥ 9♣', ['stand']).outcome, round('10♠ 10♦ 7♥ 9♣', ['stand']).balance], ['lose', 990]);
  assert.deepEqual([round('10♠ 10♦ 8♥ 8♣', ['stand']).outcome, round('10♠ 10♦ 8♥ 8♣', ['stand']).balance], ['push', 1000]);
  const bj = round('A♠ 9♦ K♥ 8♣', []);
  assert.deepEqual([bj.outcome, bj.balance], ['blackjack', 1015]);
  assert.equal(round('A♠ 9♦ K♥ 8♣', [], 5).balance, 1007.5, 'a natural on 5 returns 12.5');
  const bust = round('10♠ 7♦ 6♥ 10♣ K♠', ['hit']);
  assert.deepEqual([bust.outcome, bust.balance], ['lose', 990]);
  assert.deepEqual(bust.ledger.map(e => [e.op, e.debit, e.credit, e.balance]), [['start', 10, 0, 990], ['act', 0, 0, 990], ['collect', 0, 0, 990]]);
});

test('money: double and split take one more stake from the balance and pay each hand', () => {
  let s = stacked('6♠ 9♦ 5♥ 7♣ 10♦ K♠'), d = drive(s);
  d.start([{ seat: 4, main: 10 }]);
  let r = d.act('double');
  assert.equal(r.balance, 980);
  assert.deepEqual(settleOf(r)!.hands, [{ seat: 4, handIndex: 0, stake: 20, returned: 40, outcome: 'win' }]);
  assert.equal(d.collect().balance, 1020);
  s = stacked('8♠ 6♦ 8♥ 10♣ 3♦ 2♣ 9♠'); d = drive(s);
  d.start([{ seat: 4, main: 10 }]);
  r = d.act('split');
  assert.equal(r.balance, 980);
  assert.deepEqual(r.view.round!.hands.map(h => [h.seat, h.hand, h.splitFrom, h.cards.map(c => c.r + c.s)]), [[4, 0, 4, ['8♠', '3♦']], [4, 1, 4, ['8♥', '2♣']]]);
  assert.equal(r.view.round!.active, 1, 'the split-off hand acts first');
  d.act('stand'); r = d.act('stand');
  assert.deepEqual(settleOf(r)!.hands.map(h => [h.handIndex, h.returned, h.outcome]), [[0, 20, 'win'], [1, 20, 'win']]);
  assert.equal(d.collect().balance, 1020);
});

test('money: insurance on an ace, taken or declined, against a dealer blackjack or not', () => {
  const run = (cards: string, take: boolean, then: string[] = []) => {
    const s = stacked(cards), d = drive(s);
    const started = d.start([{ seat: 4, main: 10 }]);
    assert.equal(started.view.round!.phase, 'insurance');
    assert.deepEqual(started.events.at(-1), { type: 'speak', line: 'insurance', family: 'speak.insurance/insurance' });
    let r = d.insurance({ take });
    if (take) assert.equal(r.balance, 985);
    for (const a of then) r = d.act(a);
    return { phase: r.view.round!.phase, balance: d.collect().balance };
  };
  assert.deepEqual(run('10♠ A♦ 9♥ K♣', true), { phase: 'settled', balance: 1000 }, 'insurance 5 returns 15, the main bet is lost');
  assert.deepEqual(run('10♠ A♦ 9♥ K♣', false), { phase: 'settled', balance: 990 });
  assert.deepEqual(run('10♠ A♦ 9♥ 6♣', true, ['stand']), { phase: 'settled', balance: 1005 }, 'insurance lost, 19 beats soft 17');
  // Per-seat insurance: only the listed seat pays.
  const s = stacked('10♠ 10♥ A♦ 9♠ 9♥ 6♣'), d = drive(s);
  d.start([{ seat: 2, main: 10 }, { seat: 6, main: 20 }]);
  const r = d.insurance({ seats: [6] });
  assert.equal(r.balance, 1000 - 30 - 10);
  assert.deepEqual(r.view.round!.hands.map(h => [h.seat, h.insured]), [[2, 0], [6, 10]]);
});

test('a ten up-card is peeked: a dealer blackjack settles at the deal without insurance', () => {
  const s = stacked('10♠ K♦ 9♥ A♣'), r = drive(s).start([{ seat: 1, main: 10 }]);
  assert.equal(r.view.round!.phase, 'settled');
  assert.deepEqual(r.events.filter(e => e.type === 'speak').map(e => (e as { line: string }).line), ['goodluck', 'dealerblackjack']);
});

test('natural and blackjack flags come from the core: a first-two-cards 21 is a natural, a split 21 is not', () => {
  const deals = (r: Snapshot) => r.events.filter(e => e.type === 'deal') as SeatDealEvent[];
  const reveal = (r: Snapshot) => r.events.find(e => e.type === 'reveal') as SeatRevealEvent;
  // Natural: A♠ then K♥ to seat 4; the dealer 9♦ 8♣ has no blackjack.
  let r = drive(stacked('A♠ 9♦ K♥ 8♣')).start([{ seat: 4, main: 10 }]);
  assert.deepEqual(deals(r).map(e => [e.target, e.total, e.natural]), [['4', 11, false], ['dealer', 9, false], ['4', 21, true], ['hole', 9, false]]);
  assert.deepEqual([r.view.round!.hands[0].natural, reveal(r).blackjack, reveal(r).total, settleOf(r)!.hands[0].outcome], [true, false, 17, 'blackjack']);
  // Split aces that each draw a ten: two-card 21s, never naturals, paid 1:1.
  const d = drive(stacked('A♠ 6♦ A♥ 10♣ K♦ Q♣ 9♠'));
  assert.equal(d.start([{ seat: 4, main: 10 }]).view.round!.hands[0].natural, false, 'A A is no natural');
  r = d.act('split');
  assert.deepEqual(deals(r).filter(e => e.to === 'seat').map(e => [e.hand, e.cardIndex, e.total, e.natural]), [[0, 1, 21, false], [1, 1, 21, false]]);
  assert.deepEqual(r.view.round!.hands.map(h => [h.total, h.natural]), [[21, false], [21, false]]);
  assert.deepEqual(settleOf(r)!.hands.map(h => h.outcome), ['win', 'win']);
  assert.equal(reveal(r).blackjack, false);
  // A three-card 21 is no natural either.
  const three = drive(stacked('5♠ 9♦ 6♥ 8♣ K♠'));
  three.start([{ seat: 2, main: 10 }]);
  const hit = deals(three.act('hit'))[0];
  assert.deepEqual([hit.total, hit.natural], [21, false]);
  // Dealer blackjack: flagged on the reveal only, never on the hidden deal; the player's natural pushes.
  r = drive(stacked('A♠ K♦ K♥ A♣')).start([{ seat: 4, main: 10 }]);
  assert.deepEqual(deals(r).filter(e => e.to === 'dealer').map(e => [e.faceDown, e.total, e.natural]), [[false, 10, false], [true, 10, false]]);
  assert.deepEqual([reveal(r).blackjack, reveal(r).total, r.view.round!.hands[0].natural, settleOf(r)!.hands[0].outcome], [true, 21, true, 'push']);
});

test('idempotency: the same requestId and input return the same result once; another input is refused', () => {
  const s = stacked('10♠ 7♦ 9♥ 10♣');
  const start = { op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 'start-1', expectedVersion: 0 };
  const first = s.command(start);
  assert.deepEqual(s.command(structuredClone(start)), first, 'a lost response is safe to resend');
  assert.deepEqual(s.command({ expectedVersion: 0, requestId: 'start-1', bets: [{ main: 10, seat: 4 }], op: 'start' }), first, 'key order does not matter');
  assert.equal(s.state().ver, 1);
  assert.equal(s.ledger().length, 1);
  assert.equal(s.state().balance, 990, 'charged once');
  assert.throws(() => s.command({ ...start, bets: [{ seat: 4, main: 20 }] }), err('REQUEST_REUSED', 409));
  const v = s.state().view;
  s.command({ op: 'act', seat: 4, handIndex: 0, action: 'stand', roundId: v.roundId, turnSeq: v.turnSeq, requestId: 'stand-1', expectedVersion: 1 });
  assert.deepEqual(s.command(start), first, 'an old command still replays its stored result after later commands');
  assert.equal(s.state().ver, 2);
});

test('stale expectedVersion and stale turn are typed 409 errors that change nothing', () => {
  const s = stacked('10♠ 7♦ 9♥ 10♣'), d = drive(s);
  d.start([{ seat: 4, main: 10 }]);
  const before = s.state(), v = before.view;
  assert.throws(() => s.command({ op: 'act', seat: 4, handIndex: 0, action: 'stand', roundId: v.roundId, turnSeq: v.turnSeq, requestId: 'x1', expectedVersion: 0 }), err('STALE_VERSION', 409));
  assert.throws(() => s.command({ op: 'act', seat: 4, handIndex: 0, action: 'stand', roundId: v.roundId, turnSeq: v.turnSeq - 1, requestId: 'x2', expectedVersion: 1 }), err('STALE_COMMAND', 409));
  assert.throws(() => s.command({ op: 'act', seat: 3, handIndex: 0, action: 'stand', roundId: v.roundId, turnSeq: v.turnSeq, requestId: 'x3', expectedVersion: 1 }), err('STALE_COMMAND', 409), 'wrong seat');
  assert.throws(() => s.command({ op: 'act', seat: 4, handIndex: 0, action: 'surrender', roundId: v.roundId, turnSeq: v.turnSeq, requestId: 'x4', expectedVersion: 1 }), err('ILLEGAL_ACTION', 422), 'no surrender, as in Scout');
  assert.deepEqual(s.state(), before);
});

test('typed errors for malformed commands, seats, stakes and balance, without using randomness', () => {
  const s = createSession({ balance: 20, shoe: { mode: 'seeded', seed: 'errors' } }), d = drive(s);
  assert.throws(() => s.command(null), err('INVALID_COMMAND', 400));
  assert.throws(() => s.command({ op: 'start', expectedVersion: 0 }), err('REQUEST_ID_REQUIRED', 400));
  assert.throws(() => d.send({ op: 'deal' }), err('UNKNOWN_COMMAND', 400));
  for (const seat of [0, 8, 1.5, '3']) assert.throws(() => d.start([{ seat: seat as number, main: 10 }]), err('INVALID_SEAT', 422));
  assert.throws(() => d.start([{ seat: 2, main: 5 }, { seat: 2, main: 5 }]), err('INVALID_SEAT'));
  assert.throws(() => d.start([{ seat: 2, main: 4 }]), err('INVALID_STAKE', 422), 'below Scout minimum 5');
  assert.throws(() => d.start([{ seat: 2, main: 5.5 }]), err('INVALID_STAKE'), 'whole chips');
  assert.throws(() => d.start([{ seat: 2, main: 25 }]), err('INSUFFICIENT_BALANCE', 422));
  assert.throws(() => d.collect(), err('NO_ACTIVE_ROUND', 409));
  assert.equal(s.state().ver, 0);
  // Refused commands drew nothing: the first accepted round deals what a fresh session with the same seed deals.
  const fresh = drive(createSession({ balance: 20, shoe: { mode: 'seeded', seed: 'errors' } })).start([{ seat: 2, main: 10 }]);
  assert.deepEqual(d.start([{ seat: 2, main: 10 }]).view.round!.hands, fresh.view.round!.hands);
  assert.throws(() => createSession({ limits: { min: 100, max: 10 } }), err('INVALID_CONFIG', 400));
  assert.throws(() => createSession({ shoe: { mode: 'stacked', seed: 'x', cards: [{ r: 'Z', s: '♠' }] } }), err('INVALID_SHOE', 400));
  assert.throws(() => createSession({ shoe: { mode: 'magic' } as unknown as SessionOptions['shoe'] }), err('INVALID_SHOE', 400));
});

test('double, split and insurance are refused when the balance cannot cover them', () => {
  let d = drive(stacked('6♠ 9♦ 5♥ 7♣ 10♦', { balance: 15 }));
  d.start([{ seat: 4, main: 10 }]);
  assert.throws(() => d.act('double'), err('INSUFFICIENT_BALANCE', 422));
  d = drive(stacked('10♠ A♦ 9♥ 6♣', { balance: 12 }));
  d.start([{ seat: 4, main: 10 }]);
  assert.throws(() => d.insurance({ take: true }), err('INSUFFICIENT_BALANCE'));
  assert.throws(() => d.insurance({ take: true, seats: [4] }), err('INVALID_COMMAND', 400));
  assert.equal(d.insurance({ take: false }).view.round!.phase, 'decisions');
});

test('side bets: accepted per seat, default 0, settled at the deal', () => {
  const s = stacked('8♥ 8♣ 8♦ 9♠'), d = drive(s);
  const r = d.start([{ seat: 3, main: 10, pp: 5, tp: 5 }]);
  assert.equal(r.balance, 980);
  const seat = r.view.round!.seats.find(x => x.seat === 3)!;
  assert.deepEqual([seat.sideLabels, seat.sideReturn], [['Colored Pair 12:1', 'Three of a Kind 30:1'], 220]);
  const plain = drive(stacked('10♠ 7♦ 9♥ 10♣')).start([{ seat: 3, main: 10 }]);
  assert.deepEqual([plain.view.round!.hands[0].pp, plain.view.round!.hands[0].tp, plain.balance], [0, 0, 990]);
});

test('shoe source is public: secure, seeded, or stacked (lab only), and later shoes of a stacked session are seeded', () => {
  assert.equal(createSession({ shoe: { mode: 'seeded', seed: 'a' } }).state().view.shoe!.source, 'seeded');
  const s = stacked('10♠ 7♦ 9♥ 10♣', { balance: 1e6 }), d = drive(s);
  assert.equal(s.state().view.shoe!.source, 'stacked');
  const first = s.state().view.shoe!.id;
  for (let i = 0; i < 200 && s.state().view.shoe!.id === first; i++) {
    const r = d.start([{ seat: 1, main: 5 }]);
    if (r.view.shuffled) { assert.equal(r.view.shoe!.source, 'seeded'); break; }
    while (s.state().view.round!.phase === 'insurance') d.insurance({ take: false });
    while (s.state().view.round!.phase === 'decisions') d.act('stand');
    d.collect();
  }
  assert.notEqual(s.state().view.shoe!.id, first);
  assert.equal(s.state().view.shoe!.source, 'seeded');
});

test('seeded sessions are reproducible command for command', () => {
  const run = () => {
    const s = createSession({ shoe: { mode: 'seeded', seed: 'repro' } }), d = drive(s), out = [];
    for (let i = 0; i < 5; i++) {
      out.push(d.start([{ seat: 2, main: 10 }, { seat: 5, main: 15 }]));
      while (s.state().view.round!.phase === 'insurance') out.push(d.insurance({ take: false }));
      while (s.state().view.round!.phase === 'decisions') out.push(d.act(s.state().view.round!.hands[s.state().view.round!.active].total < 15 ? 'hit' : 'stand'));
      out.push(d.collect());
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

// The scripted round of the totals tests: seat 4 is dealt 8♠ 8♥ and splits, seat 2 holds 10♦ 6♣,
// the dealer shows 6♦ over a hole card; seat 4's split-off hand hits to 19 and stands, the first
// hand doubles to 21, seat 2 hits to 20 and stands, the dealer turns 16 (or 15) and draws a 2.
const script = (hole: string) => `8♠ 10♦ 6♦ 8♥ 6♣ ${hole} 3♦ 2♣ 9♠ K♥ 4♥ 2♦`;
function playScript(hole: string) {
  const s = stacked(script(hole)), d = drive(s);
  const steps: Array<{ op: string; before: Snapshot; result: Snapshot }> = [];
  const run = (op: string, fn: () => Snapshot) => { const before = s.state(); steps.push({ op, before, result: fn() }); };
  run('start', () => d.start([{ seat: 2, main: 10 }, { seat: 4, main: 10 }]));
  run('split', () => d.act('split'));
  run('hit', () => d.act('hit'));
  run('stand', () => d.act('stand'));
  run('double', () => d.act('double'));
  run('hit', () => d.act('hit'));
  run('stand', () => d.act('stand'));
  return steps;
}

test('deal and reveal events carry the visible total of the receiving hand, checked against an independent card model', () => {
  const steps = playScript('10♣');
  assert.equal(steps.at(-1)!.result.view.round!.phase, 'settled');
  const model = new Map<number, Card[][]>(), dealer: Card[] = [];
  let revealed = false, up: Card | null = null;
  const value = (cards: Card[]) => { const { total, soft } = handValue(cards); return { total, soft }; };
  for (const { op, before, result } of steps) {
    if (op === 'split') {
      // The acting hand's second card moves to a new hand right after it; no event carries that move.
      const acting = before.view.round!.hands[before.view.round!.active], hands = model.get(acting.seat)!;
      hands.splice(acting.hand + 1, 0, [hands[acting.hand].pop()!]);
    }
    for (const e of result.events) {
      if (e.type === 'deal' && e.to === 'seat') {
        const hands = model.get(e.seat!) ?? []; model.set(e.seat!, hands);
        (hands[e.hand!] ??= []).push(e.card as Card);
        assert.deepEqual({ total: e.total, soft: e.soft }, value(hands[e.hand!]), `seat ${e.seat} hand ${e.hand} after draw ${e.shoeDraw}`);
        assert.equal(e.cardIndex, hands[e.hand!].length - 1);
        const viewHand = result.view.round!.hands[e.handIndex!];
        assert.deepEqual([viewHand.seat, viewHand.hand, viewHand.cards[e.cardIndex].shoeDraw], [e.seat, e.hand, e.shoeDraw], 'the view lists the card at that place');
      } else if (e.type === 'deal') {
        if (!e.faceDown) { dealer.push(e.card as Card); up ??= e.card as Card; }
        assert.ok(e.faceDown ? !revealed : true);
        assert.deepEqual({ total: e.total, soft: e.soft }, value(dealer), `dealer after draw ${e.shoeDraw}${e.faceDown ? ' (hole, face down)' : ''}`);
        assert.equal(e.cardIndex, e.faceDown ? 1 : dealer.length - 1 + (revealed || dealer.length === 1 ? 0 : 1));
        if (!revealed) assert.deepEqual({ total: e.total, soft: e.soft }, value([up as Card]), 'before the reveal the dealer total is the up-card alone');
      } else if (e.type === 'reveal') {
        dealer.push(e.card as Card); revealed = true;
        assert.deepEqual({ total: e.total, soft: e.soft, cardIndex: e.cardIndex }, { ...value(dealer), cardIndex: 1 });
        assert.equal(dealer.length, 2);
      }
    }
  }
  assert.ok(revealed);
  assert.deepEqual(dealer.map(c => c.r + c.s), ['6♦', '10♣', '2♦'], 'a dealer draw after the reveal');
  assert.deepEqual([...model.get(4)!.map(h => h.map(c => c.r + c.s)), ...model.get(2)!.map(h => h.map(c => c.r + c.s))],
    [['8♠', '3♦', 'K♥'], ['8♥', '2♣', '9♠'], ['10♦', '6♣', '4♥']]);
  const last = steps.at(-1)!.result;
  const deals = last.events.filter(e => e.type === 'deal' || e.type === 'reveal') as Array<SeatDealEvent | SeatRevealEvent>;
  assert.deepEqual(deals.map(e => [e.type, e.shoeDraw, e.total]), [['reveal', 7, 16], ['deal', 13, 18]], 'the last stand: reveal 6+10, then the dealer draws 2');
  // The view's totals are the core's handValue too.
  for (const h of last.view.round!.hands) assert.equal(h.total, handValue(h.cards as Card[]).total);
  assert.equal(last.view.round!.dealerTotal, 18);
});

test('before the reveal nothing returned depends on the hole card: two shoes that differ only there give identical results', () => {
  const a = playScript('10♣'), b = playScript('9♣');
  const strip = (r: Snapshot) => { const copy = structuredClone(r); if (copy.view.shoe) copy.view.shoe.commitment = null; return copy; };
  const revealAt = a.findIndex(x => x.result.events.some(e => e.type === 'reveal'));
  assert.equal(revealAt, a.length - 1);
  assert.equal(b.findIndex(x => x.result.events.some(e => e.type === 'reveal')), revealAt);
  for (let i = 0; i < revealAt; i++) assert.deepEqual(strip(b[i].result), strip(a[i].result), `step ${i} (${a[i].op}) is the same whatever the hole card`);
  assert.notDeepEqual(strip(b[revealAt].result), strip(a[revealAt].result), 'the reveal itself differs');
  assert.deepEqual(a.at(-1)!.result.view.round!.dealer.map(c => c.r + c.s), ['6♦', '10♣', '2♦']);
  assert.deepEqual(b.at(-1)!.result.view.round!.dealer.map(c => c.r + c.s), ['6♦', '9♣', '2♦']);
});

test('the hole card (serial, or a rank at its shoe position) is in no result before its reveal', () => {
  for (const [cards, actions] of [['10♠ 7♦ 2♥ 10♣ 5♠', ['hit', 'stand']], ['10♠ A♦ 9♥ 6♣', ['ins', 'stand']], ['10♠ K♦ 9♥ A♣', []]] as Array<[string, string[]]>) {
    const s = stacked(cards), d = drive(s), results = [s.state(), d.start([{ seat: 4, main: 10 }])];
    for (const a of actions) results.push(a === 'ins' ? d.insurance({ take: true }) : d.act(a));
    const settled = results.at(-1)!.view.round!, holeDraw = settled.holeDraw!;
    const hole = settled.dealer.find(c => c.shoeDraw === holeDraw)!;
    assert.ok(hole, 'the settled view shows the hole card');
    const revealAt = results.findIndex(r => r.events.some(e => e.type === 'reveal'));
    assert.ok(revealAt > 0);
    for (let i = 0; i < revealAt; i++) assert.deepEqual(holeLeaks(results[i], hole), [], `${cards}: result ${i}`);
    assert.ok(holeLeaks(results[revealAt], hole).length > 0, 'the scanner does find the card once it is revealed');
    const holeDeal = results[1].events.find(e => e.type === 'deal' && e.faceDown) as SeatDealEvent;
    assert.deepEqual([holeDeal.card, holeDeal.shoeDraw, holeDeal.target, holeDeal.family], [null, holeDraw, 'hole', 'deal.dealer/dealer-hole']);
  }
});
