// Seat boundary tests for game/seats.ts: seat = box + 1 round trip, seat 7 → 1 opening deal and
// turn order, Scout targets and families per seat, and no `box` anywhere the session returns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { betsForSeats, boxOf, SeatError, seatEvents, seatOf, seatView } from '../game/seats.ts';
import type { SeatDealEvent, SeatTurnEvent } from '../game/seats.ts';
import { createSession } from '../game/session.ts';
import type { Snapshot } from '../game/session.ts';
import { newGame, step } from '../game/core.ts';
import { presentationEvents, withFamily } from '../game/presentation.ts';
import { seededRandom } from '../game/shoe-source.ts';

const keysNamed = (value: unknown, names: string[]): string[] => {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (names.includes(k)) found.push(`${path}.${k}`); walk(x, `${path}.${k}`); }
  };
  walk(value, '$');
  return found;
};

test('seatOf and boxOf: seat = box + 1, a full round trip, and nothing outside 1-7', () => {
  for (let seat = 1; seat <= 7; seat++) assert.equal(seatOf(boxOf(seat)), seat);
  for (let box = 0; box <= 6; box++) assert.equal(boxOf(seatOf(box)), box);
  for (const bad of [0, 8, -1, 1.5, '3', null, undefined]) assert.throws(() => boxOf(bad), SeatError);
  for (const bad of [-1, 7, 0.5]) assert.throws(() => seatOf(bad), SeatError);
  assert.deepEqual(betsForSeats([{ seat: 7, main: 10 }, { seat: 1, main: 5, pp: 5 }]).map(b => b.main), [5, 0, 0, 0, 0, 0, 10]);
  assert.throws(() => betsForSeats([{ seat: 3, main: 5 }, { seat: 3, main: 5 }]), /twice/);
  assert.throws(() => betsForSeats([]), SeatError);
});

test('opening deal with all seven seats: seat 7 → 1, the up-card, seat 7 → 1, the hole card; play starts at seat 7', () => {
  const s = createSession({ shoe: { mode: 'seeded', seed: 'seven' }, balance: 1e5 });
  let n = 0, last: Snapshot;
  const send = (cmd: Record<string, unknown>) => (last = s.command({ ...cmd, requestId: `q${++n}`, expectedVersion: s.state().ver }));
  // Find a seeded deal without an ace up-card so the first turn follows the deal at once.
  for (;;) {
    send({ op: 'start', bets: [1, 2, 3, 4, 5, 6, 7].map(seat => ({ seat, main: 10 })) });
    if (last!.view.round!.phase === 'decisions') break;
    while (s.state().view.round!.phase === 'insurance') send({ op: 'insurance', take: false, roundId: s.state().view.roundId });
    while (s.state().view.round!.phase === 'decisions') { const v = s.state().view; send({ op: 'act', action: 'stand', seat: v.round!.activeSeat, handIndex: v.round!.active, roundId: v.roundId, turnSeq: v.turnSeq }); }
    send({ op: 'collect', roundId: s.state().view.roundId });
  }
  const deals = last!.events.filter(e => e.type === 'deal') as SeatDealEvent[];
  assert.deepEqual(deals.map(e => e.target), ['7', '6', '5', '4', '3', '2', '1', 'dealer', '7', '6', '5', '4', '3', '2', '1', 'hole']);
  assert.deepEqual(deals.map(e => e.seat), [7, 6, 5, 4, 3, 2, 1, null, 7, 6, 5, 4, 3, 2, 1, null]);
  assert.deepEqual(deals.map(e => e.to), [...Array(7).fill('seat'), 'dealer', ...Array(7).fill('seat'), 'dealer']);
  const first = deals[0].shoeDraw;
  assert.deepEqual(deals.map(e => e.shoeDraw), Array.from({ length: 16 }, (_, i) => first + i), 'consecutive shoe draws');
  assert.deepEqual(deals.map(e => e.family), ['deal.player.right/box6', 'deal.player.right/box5', 'deal.player.centre/box4', 'deal.player.centre/box3', 'deal.player.centre/box2',
    'deal.player.left/box1', 'deal.player.left/box0', 'deal.dealer/dealer-up', 'deal.player.right/box6', 'deal.player.right/box5', 'deal.player.centre/box4', 'deal.player.centre/box3',
    'deal.player.centre/box2', 'deal.player.left/box1', 'deal.player.left/box0', 'deal.dealer/dealer-hole'], 'Scout clip slots, box<n> = seat n+1');
  assert.deepEqual(last!.view.round!.hands.map(h => h.seat), [1, 2, 3, 4, 5, 6, 7], 'hands listed seat 1 → 7');
  // Turn order: the highest seat still to act goes first (naturals are skipped by the core).
  const turns: number[] = [];
  while (s.state().view.round!.phase === 'decisions') {
    const v = s.state().view, turn = last!.events.find(e => e.type === 'turn') as SeatTurnEvent;
    assert.equal(turn.seat, v.round!.activeSeat);
    turns.push(v.round!.activeSeat!);
    send({ op: 'act', action: 'stand', seat: v.round!.activeSeat, handIndex: v.round!.active, roundId: v.roundId, turnSeq: v.turnSeq });
  }
  assert.ok(turns.length > 0);
  assert.deepEqual(turns, [...turns].sort((a, b) => b - a), 'seats act from 7 down to 1');
  assert.ok(turns.every(seat => seat >= 1 && seat <= 7));
  assert.deepEqual(keysNamed(last!, ['box', 'boxes']), []);
});

test('the seat boundary rewrites every box of a core step into a seat, and back', () => {
  const random = seededRandom('boundary');
  const opened = newGame({ random });
  const bets = Array.from({ length: 7 }, (_, box) => ({ main: box === 0 || box === 6 || box === 3 ? 10 : 0, pp: 0, tp: 0 }));
  const out = step(opened.state, { op: 'start', bets }, {}, { random, funding: { available: 1e5, reserved: { stake: { 0: 10, 3: 10, 6: 10 } } } });
  const events = presentationEvents(opened.view, out.view, 'start').map(withFamily);
  const seated = seatEvents(events, out.view), view = seatView(out.view, 'seeded');
  assert.deepEqual(keysNamed([seated, view], ['box', 'boxes']), []);
  assert.deepEqual(view.round!.hands.map(h => boxOf(h.seat)), out.view.round!.hands.map(h => h.box));
  assert.deepEqual(view.round!.seats.map(x => [x.seat, x.inPlay]), [[1, true], [2, false], [3, false], [4, true], [5, false], [6, false], [7, true]]);
  const rawDeals = events.filter(e => e.type === 'deal'), seatDeals = seated.filter(e => e.type === 'deal') as SeatDealEvent[];
  assert.deepEqual(seatDeals.map(e => e.seat === null ? null : boxOf(e.seat)), rawDeals.map(e => e.box));
  assert.deepEqual(seatDeals.map(e => e.shoeDraw), rawDeals.map(e => e.shoeDraw));
  assert.deepEqual(seatDeals.filter(e => e.seat !== null).map(e => e.target), seatDeals.filter(e => e.seat !== null).map(e => String(e.seat)));
});
