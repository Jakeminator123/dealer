// Fuzz-style invariant test for game/session.ts: 300 seeded rounds with random seats, stakes,
// side bets, insurance choices and legal actions (choices from a seeded game-rng, so the run is
// reproducible). Every result is checked for: no hidden-card leak before the reveal, legal phases
// and actions, seats only (no box), consecutive shoe draws, one reveal per round, totals from
// handValue, no shoe change mid-round, card conservation, idempotent resends, and money
// conservation per round and over the whole run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../game/session.ts';
import type { Snapshot } from '../game/session.ts';
import { createRng } from '../game/rng.ts';
import { handValue } from '../game/round.ts';
import type { Card } from '../game/round.ts';
import type { SeatDealEvent, SeatRevealEvent } from '../game/seats.ts';

const ROUNDS = 300, START = 1_000_000;
const ACTIONS = new Set(['hit', 'stand', 'double', 'split']);
const NEXT_PHASE: Record<string, string[]> = { start: ['insurance', 'decisions', 'settled'], insurance: ['decisions', 'settled'], decisions: ['decisions', 'settled'] };

function badKeys(value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'box' || k === 'boxes') found.push(`${path}.${k}`); walk(x, `${path}.${k}`); }
  };
  walk(value, '$');
  return found;
}
function holeLeaks(value: unknown, hole: { serial: number; shoeDraw: number }): number {
  let found = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.serial === hole.serial || (o.shoeDraw === hole.shoeDraw && (o.r != null || (o.card != null && typeof o.card === 'object')))) found++;
    Object.values(o).forEach(walk);
  };
  walk(value);
  return found;
}

test(`fuzz: ${ROUNDS} seeded rounds with random legal play keep every invariant`, (t) => {
  const s = createSession({ shoe: { mode: 'seeded', seed: 'fuzz' }, balance: START });
  const choice = createRng({ mode: 'seeded', seed: 'fuzz-choices', allowDeterministic: true });
  const pick = <T>(items: readonly T[]): T => items[choice.int(0, items.length)];
  let n = 0, resends = 0;
  const counts = { splits: 0, doubles: 0, insured: 0, insurancePhases: 0, reshuffles: 0, dealerBlackjacks: 0, sideWins: 0 };
  const send = (cmd: Record<string, unknown>) => {
    const input = { ...cmd, requestId: `f${++n}`, expectedVersion: s.state().ver };
    const result = s.command(input);
    if (choice.int(0, 10) === 0) {             // a lost response: the same command again changes nothing
      const ver = s.state().ver, ledger = s.ledger().length;
      assert.deepEqual(s.command(structuredClone(input)), result);
      assert.equal(s.state().ver, ver); assert.equal(s.ledger().length, ledger);
      resends++;
    }
    return result;
  };

  for (let round = 0; round < ROUNDS; round++) {
    const before = s.state(), ledgerStart = s.ledger().length;
    const seats = choice.drawWithoutReplacement([1, 2, 3, 4, 5, 6, 7], 1 + choice.int(0, 4));
    const bets = seats.map(seat => ({ seat, main: pick([5, 10, 25, 100]), ...(choice.int(0, 4) === 0 ? { pp: pick([5, 10]) } : {}), ...(choice.int(0, 4) === 0 ? { tp: pick([5, 10]) } : {}) }));
    const results: Snapshot[] = [send({ op: 'start', bets })];
    const start = results[0];
    if (start.view.shuffled) counts.reshuffles++;
    const shoeId = start.view.shoe!.id;
    if (!start.view.shuffled) assert.equal(shoeId, before.view.shoe!.id);
    const firstDraw = start.view.shuffled ? 2 : before.view.shoe!.dealt + 1;
    let phase = 'start', ops = 0;
    while (s.state().view.round!.phase !== 'settled') {
      assert.ok(++ops < 60, `round ${round} does not finish`);
      const v = s.state().view, r = v.round!;
      if (r.phase === 'insurance') {
        counts.insurancePhases++;
        const mode = choice.int(0, 3), takers = r.hands.map(h => h.seat).filter(() => choice.int(0, 2) === 0);
        if (mode === 2 && takers.length) counts.insured++;
        results.push(send(mode === 0 ? { op: 'insurance', roundId: v.roundId, take: false } : mode === 1 ? { op: 'insurance', roundId: v.roundId, take: true }
          : { op: 'insurance', roundId: v.roundId, seats: takers }));
        if (mode === 1) counts.insured++;
      } else {
        const action = pick(s.state().legalActions);
        if (action === 'split') counts.splits++;
        if (action === 'double') counts.doubles++;
        results.push(send({ op: 'act', seat: r.activeSeat, handIndex: r.active, action, roundId: v.roundId, turnSeq: v.turnSeq }));
      }
    }
    const settled = s.state().view.round!;
    results.push(send({ op: 'collect', roundId: s.state().view.roundId }));

    // ---- per result
    for (const [i, res] of results.entries()) {
      assert.deepEqual(badKeys(res), [], `round ${round} result ${i}: seats only`);
      assert.equal(res.view.shoe!.remaining + res.view.shoe!.dealt, 416, 'card conservation');
      assert.equal(res.view.shoe!.source, 'seeded');
      assert.equal(res.view.shoe!.id, shoeId, 'never a new shoe mid-round');
      const r = res.view.round;
      if (i === results.length - 1) { assert.equal(r, null); assert.deepEqual(res.events.map(e => e.type), ['speak', 'idle']); continue; }
      assert.ok(r && NEXT_PHASE[phase].includes(r.phase), `round ${round}: ${phase} -> ${r?.phase}`);
      phase = r.phase;
      assert.equal(res.legalActions.length > 0, r.phase === 'decisions');
      assert.ok(res.legalActions.every(a => ACTIONS.has(a)));
      assert.equal(r.activeSeat !== null, r.phase === 'decisions');
      for (const h of r.hands) {
        assert.ok(h.seat >= 1 && h.seat <= 7);
        assert.deepEqual({ total: h.total, soft: h.soft }, handValue(h.cards as Card[]));
        assert.equal(h.natural, h.splitFrom === null && h.cards.length === 2 && h.total === 21, 'natural = two cards, 21, never split');
        assert.deepEqual(h.cards.map(c => c.shoeDraw), [...h.cards.map(c => c.shoeDraw)].sort((a, b) => a - b), 'cards listed in deal order');
      }
      const deals = res.events.filter(e => e.type === 'deal') as SeatDealEvent[];
      assert.deepEqual(deals.map(e => e.shoeDraw), [...deals.map(e => e.shoeDraw)].sort((a, b) => a - b), 'deal events in shoe order');
    }

    // ---- per round
    const allDeals = results.flatMap(res => res.events.filter(e => e.type === 'deal')) as SeatDealEvent[];
    assert.deepEqual(allDeals.map(e => e.shoeDraw), Array.from({ length: allDeals.length }, (_, k) => firstDraw + k), `round ${round}: consecutive draws after the previous round`);
    const reveals = results.flatMap(res => res.events.filter(e => e.type === 'reveal')) as SeatRevealEvent[];
    assert.equal(reveals.length, 1, `round ${round}: the hole card is revealed exactly once`);
    assert.equal(reveals[0].shoeDraw, settled.holeDraw);
    const hole = settled.dealer.find(c => c.shoeDraw === settled.holeDraw)!;
    assert.deepEqual(reveals[0].card, { r: hole.r, s: hole.s });
    assert.equal(reveals[0].total, handValue(settled.dealer.slice(0, 2) as Card[]).total);
    const revealAt = results.findIndex(res => res.events.some(e => e.type === 'reveal'));
    for (let i = 0; i < revealAt; i++) assert.equal(holeLeaks(results[i], hole), 0, `round ${round}: hole card in result ${i} before its reveal`);
    const up = settled.dealer[0];
    for (const res of results.slice(0, revealAt + 1)) for (const e of res.events) {
      if (e.type === 'reveal') break;
      if (e.type === 'deal' && e.to === 'dealer') assert.equal(e.total, handValue([up as Card]).total, 'a dealer total before the reveal is the up-card alone');
    }
    if (settled.dealer.length === 2 && settled.dealerTotal === 21) counts.dealerBlackjacks++;

    // ---- money
    const rows = s.ledger().slice(ledgerStart);
    const debits = rows.reduce((a, e) => a + e.debit, 0), credits = rows.reduce((a, e) => a + e.credit, 0);
    assert.equal(debits, settled.hands.reduce((a, h) => a + h.stake + h.pp + h.tp + h.insured, 0), `round ${round}: every stake, split, double and insurance debited once`);
    assert.equal(credits, settled.hands.reduce((a, h) => a + (h.result as number) + h.sideReturn, 0), `round ${round}: payouts credited once at collect`);
    assert.ok(rows.slice(0, -1).every(e => e.credit === 0), 'nothing is paid before collect');
    counts.sideWins += settled.hands.filter(h => h.sideReturn > 0).length;
    assert.equal(s.state().balance, before.balance - debits + credits);
  }

  const ledger = s.ledger();
  let balance = START;
  for (const e of ledger) { balance = balance - e.debit + e.credit; assert.equal(e.balance, balance); }
  assert.equal(s.state().balance, balance);
  assert.equal(ledger.length, s.state().ver, 'one ledger row per accepted command');
  for (const [name, count] of Object.entries(counts)) assert.ok(count > 0, `the run exercised ${name} (${count})`);
  assert.ok(resends > 50);
  t.diagnostic(`exercised ${JSON.stringify({ ...counts, resends, commands: ledger.length })}`);
});
