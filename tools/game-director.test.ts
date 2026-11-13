import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEdge, formatEdge} from '../src/clip-graph.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {slotOf, slotFilm, slotLabel, slotImprovised, createLayout, FAN, FAN_AT, SPLIT, DEALER_THIRD, type TableCards} from '../src/game-table.ts';
import {planBeats, lyingAfter, cardRecords, judgedBank, unjudgedTakes, speakMoments, talkOn, REVEAL_NODE, STAND_IN_FILM} from '../src/game-director.ts';

// Seats 4 and 7 play. Opening deal as the engine draws it: seat 7, seat 4, dealer up, seat 7, seat 4, hole card.
// Draw 1 is the burn card.
const opening: TableCards = {hands: [{seat: 4, cards: [3, 6]}, {seat: 7, cards: [2, 5]}], dealer: [4, 7]};
const deal = (shoeDraw: number) => ({type: 'deal', shoeDraw});
const edges = (beats: {kind: string; step: {from: string; to: string} | null; own: {label: string} | null}[]) => beats.map(b => b.step ? formatEdge(b.step.from, b.step.to) : `${b.kind}(${b.own!.label})`);

test('slots: seat, hand and number in the hand, seats counted 1–7', () => {
  assert.deepEqual(slotOf(opening, 2), {owner: 'P', seat: 7, hand: 0, hands: 1, index: 0});
  assert.deepEqual(slotOf(opening, 6), {owner: 'P', seat: 4, hand: 0, hands: 1, index: 1});
  assert.deepEqual(slotOf(opening, 7), {owner: 'D', seat: 0, hand: 0, hands: 1, index: 1});
  assert.equal(slotOf(opening, 99), null);
  assert.equal(slotLabel(slotOf(opening, 2)!), 'P7.C1');
  assert.equal(slotLabel(slotOf(opening, 7)!), 'D.C2');
});

test('films: a seat has films for its first card, the second shares them, later cards play the first card\'s film', () => {
  const hits: TableCards = {hands: [{seat: 4, cards: [3, 6, 8, 9, 10]}], dealer: [4, 7, 11, 12]};
  assert.deepEqual([3, 6, 8, 9, 10].map(n => slotFilm(slotOf(hits, n)!)), ['P4.C1', 'P4.C2', 'P4.C1', 'P4.C1', 'P4.C1']);
  assert.deepEqual([3, 6, 8, 9, 10].map(n => slotLabel(slotOf(hits, n)!)), ['P4.C1', 'P4.C2', 'P4.C3', 'P4.C4', 'P4.C5']);
  assert.deepEqual([4, 7, 11, 12].map(n => slotFilm(slotOf(hits, n)!)), ['D.C1', 'D.C2', 'D.C3', 'D.C3']);
  assert.deepEqual([3, 6, 8].map(n => slotImprovised(slotOf(hits, n)!)), [false, false, true]);
});

test('split: two hands on one seat, each card named by its hand, all on the seat\'s own film', () => {
  const split: TableCards = {hands: [{seat: 4, cards: [3, 8]}, {seat: 4, cards: [6, 9]}], dealer: [4, 7]};
  assert.deepEqual(slotOf(split, 6), {owner: 'P', seat: 4, hand: 1, hands: 2, index: 0});
  assert.equal(slotLabel(slotOf(split, 9)!), 'P4.H2.C2');
  assert.deepEqual([3, 8, 6, 9].map(n => slotFilm(slotOf(split, n)!)), ['P4.C1', 'P4.C1', 'P4.C1', 'P4.C1']);
});

test('opening deal: rest to shoe once, a return to the shoe between cards, back to rest after the hole card', () => {
  const beats = planBeats(opening, [], [{type: 'speak', line: 'goodluck'}, deal(2), deal(3), deal(4), deal(5), deal(6), {type: 'deal', shoeDraw: 7, card: null, faceDown: true}, {type: 'turn', seat: 7}]);
  assert.deepEqual(edges(beats), ['IDLE>READY', 'READY>P7.C1', 'P7.C1>READY', 'READY>P4.C1', 'P4.C1>READY', 'READY>D.C1', 'D.C1>READY',
    'READY>P7.C2', 'P7.C2>READY', 'READY>P4.C2', 'P4.C2>READY', 'READY>D.C2', 'D.C2>IDLE']);
  for (const b of beats) assert.ok(parseEdge(formatEdge(b.step!.from, b.step!.to)), `${b.step!.from}>${b.step!.to} is an edge of the clip bank`);
  // Each beat knows which cards already lie there; the film's own card is never among them.
  assert.deepEqual(beats[0].lying, []);
  assert.deepEqual(beats.find(b => b.kind === 'DEAL' && b.own?.shoeDraw === 5)!.lying, [2, 3, 4]);
  assert.deepEqual(beats[beats.length - 1].lying, [2, 3, 4, 5, 6]);
  assert.deepEqual(lyingAfter([], beats), [2, 3, 4, 5, 6, 7]);
});

test('a hit starts from rest again and ends in rest', () => {
  const table: TableCards = {hands: [{seat: 4, cards: [3, 6, 8]}, {seat: 7, cards: [2, 5]}], dealer: [4, 7]};
  const beats = planBeats(table, [2, 3, 4, 5, 6, 7], [deal(8), {type: 'turn', seat: 4}]);
  assert.deepEqual(edges(beats), ['IDLE>READY', 'READY>P4.C1', 'P4.C1>IDLE']);
  assert.equal(beats[1].own!.label, 'P4.C3');
  assert.deepEqual(beats[1].lying, [2, 3, 4, 5, 6, 7]);
});

test('dealer\'s turn: the hole card is turned from rest, then further cards are dealt and the hand rests again', () => {
  const table: TableCards = {hands: [{seat: 4, cards: [3, 6]}], dealer: [4, 7, 8, 9]};
  const beats = planBeats(table, [3, 4, 6, 7], [{type: 'reveal', shoeDraw: 7}, deal(8), deal(9), {type: 'settle'}]);
  assert.deepEqual(edges(beats), [`IDLE>${REVEAL_NODE}`, 'IDLE>READY', 'READY>D.C3', 'D.C3>READY', 'READY>D.C3', 'D.C3>IDLE']);
  assert.deepEqual(beats[0].lying, [3, 4, 6], 'the turned card is the film\'s own');
  assert.equal(beats[0].own!.label, 'D.C2');
  assert.equal(beats[4].own!.label, 'D.C4');
  assert.deepEqual(lyingAfter([3, 4, 6, 7], beats), [3, 4, 6, 7, 8, 9]);
});

test('a card without a film is laid without a hand, and the hand rests before it instead of waiting at the shoe', () => {
  // The closed deal of the hole card has no playable film (Jakob rejected the only take on 2026-11-11).
  const beats = planBeats(opening, [], [deal(2), deal(3), deal(4), deal(5), deal(6), deal(7)], target => target === 'D.C2');
  assert.deepEqual(edges(beats), ['IDLE>READY', 'READY>P7.C1', 'P7.C1>READY', 'READY>P4.C1', 'P4.C1>READY', 'READY>D.C1', 'D.C1>READY', 'READY>P7.C2', 'P7.C2>READY', 'READY>P4.C2', 'P4.C2>IDLE', 'PLACE(D.C2)']);
  assert.deepEqual(beats[beats.length - 1].lying, [2, 3, 4, 5, 6]);
  assert.deepEqual(lyingAfter([], beats), [2, 3, 4, 5, 6, 7]);
  // In the middle of a run the hand goes to rest, the card is laid, and the hand comes back for the next one.
  const middle = planBeats(opening, [], [deal(2), deal(3), deal(4)], target => target === 'P4.C1');
  assert.deepEqual(edges(middle), ['IDLE>READY', 'READY>P7.C1', 'P7.C1>IDLE', 'PLACE(P4.C1)', 'IDLE>READY', 'READY>D.C1', 'D.C1>IDLE']);
});

test('a card the table does not know stops the plan', () => {
  assert.throws(() => planBeats(opening, [], [deal(42)]), /42/);
});

test('signals that move nothing give no beats', () => {
  assert.deepEqual(planBeats(opening, [2, 3, 4, 5, 6, 7], [{type: 'turn'}, {type: 'settle'}, {type: 'idle'}, {type: 'speak'}]), []);
});

test('card records: one per card, suits named for the printer, the hole card closed and without a value', () => {
  const records = cardRecords(opening, [{shoeDraw: 3, r: 'K', s: '♥'}, {shoeDraw: 7, r: null, s: null, faceDown: true}, {shoeDraw: 6, r: '10', s: '♠'}, {shoeDraw: 50, r: 'A', s: '♣'}]);
  assert.deepEqual(records, [{shoeDraw: 3, target: 'P4.C1', r: 'K', s: 'hearts', faceDown: false}, {shoeDraw: 7, target: 'D.C2', r: null, s: null, faceDown: true}, {shoeDraw: 6, target: 'P4.C2', r: '10', s: 'spades', faceDown: false}]);
});

test('layout: the plan\'s own places for card one and two, a short fan after them, split hands toward the dealer', () => {
  const plan = defaultPlan(), layout = createLayout(plan), slot = (index: number, hand = 0, hands = 1) => ({owner: 'P' as const, seat: 4, hand, hands, index});
  const c = [0, 1, 2, 3, 4].map(i => layout.centre(slot(i)));
  const step = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(b.x - a.x, b.y - a.y);
  // P4.C1 is the plane's reference: its quad is the plan's own corners.
  assert.equal(layout.quad(slot(0)).length, 4);
  assert.ok(step(c[0], c[1]) > 20 && step(c[0], c[1]) < 60, 'card two lies where the plan puts it');
  for (const i of [2, 3, 4]) assert.ok(Math.abs(step(c[i - 1], c[i]) - FAN) < 2, `card ${i + 1} is one fan step on`);
  const direction = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x), further = Math.atan2(c[4].y - c[1].y, c[4].x - c[1].x);
  assert.ok(Math.abs(direction - further) < 0.1, 'the fan continues the line from card one to card two');
  const near = layout.centre(slot(0, 0, 2)), far = layout.centre(slot(0, 1, 2));
  assert.ok(far.y < near.y, 'the second hand lies nearer the dealer (higher in the image)');
  assert.ok(Math.abs(step(near, far) - SPLIT) < 3);
  assert.ok(step(near, c[0]) < 1, 'the first hand keeps the seat\'s own place');
  // Every seat and the dealer have a place for five cards and for four hands.
  for (const seat of [1, 2, 3, 4, 5, 6, 7]) for (let i = 0; i < 5; i++) for (const p of layout.quad({owner: 'P', seat, hand: 0, hands: 1, index: i})) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  for (let i = 0; i < 6; i++) for (const p of layout.quad({owner: 'D', seat: 0, hand: 0, hands: 1, index: i})) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('layout: a shorter fan where the hand does not reach, and the third dealer card where its film lays it', () => {
  const plan = defaultPlan(), layout = createLayout(plan), at = (seat: number, index: number) => layout.centre({owner: 'P', seat, hand: 0, hands: 1, index});
  const step = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(b.x - a.x, b.y - a.y);
  for (const seat of [5, 7]) assert.ok(Math.abs(step(at(seat, 1), at(seat, 2)) - FAN_AT[seat]) < 2, `seat ${seat} fans in steps of ${FAN_AT[seat]} px`);
  assert.ok(Math.abs(step(at(1, 1), at(1, 2)) - FAN) < 2);
  const third = layout.centre({owner: 'D', seat: 0, hand: 0, hands: 1, index: 2}), fourth = layout.centre({owner: 'D', seat: 0, hand: 0, hands: 1, index: 3});
  assert.ok(step(third, DEALER_THIRD) < 3, 'the third dealer card lies under the hand of its film');
  assert.ok(Math.abs(fourth.x - third.x - FAN) < 2 && Math.abs(fourth.y - third.y) < 2, 'later dealer cards fan on from it');
  // One step for every seat, as the page takes it from its address.
  const tried = createLayout(plan, {fan: 10}), a = tried.centre({owner: 'P', seat: 7, hand: 0, hands: 1, index: 1}), b = tried.centre({owner: 'P', seat: 7, hand: 0, hands: 1, index: 2});
  assert.ok(Math.abs(step(a, b) - 10) < 2);
});

test('a return to rest without a film goes back to the shoe and from there to rest; a hole card without a film is dealt with the stopgap', () => {
  // Paow 2026-11-13: no return to rest from any card, and no closed deal to D.C2.
  const noRest = () => false, noHole = (target: string) => target === 'D.C2';
  const beats = planBeats(opening, [], [deal(2), deal(3), deal(4), deal(5), deal(6), deal(7)], noHole, noRest, STAND_IN_FILM.paow);
  assert.deepEqual(edges(beats), ['IDLE>READY', 'READY>P7.C1', 'P7.C1>READY', 'READY>P4.C1', 'P4.C1>READY', 'READY>D.C1', 'D.C1>READY', 'READY>P7.C2', 'P7.C2>READY', 'READY>P4.C2', 'P4.C2>READY',
    'READY>D.C1', 'D.C1>READY', 'READY>IDLE']);
  const hole = beats[11];
  assert.deepEqual([hole.kind, hole.own!.label, hole.own!.shoeDraw], ['DEAL', 'D.C2', 7], 'the stand-in film carries the hole card, laid at its own place');
  assert.deepEqual(beats[beats.length - 1].lying, [2, 3, 4, 5, 6, 7], 'the exit has every card lying, none in the hand');
  assert.deepEqual(STAND_IN_FILM, {paow: {'D.C2': 'D.C1'}}, 'Paow only: Pamela is paused and her game stays as it was');
  // The dealer's third card has no stand-in (its card would lie 219 px from her hand): without a film of its own it is laid without a hand.
  const drawn: TableCards = {hands: [{seat: 4, cards: [3, 6]}], dealer: [4, 7, 8]};
  assert.deepEqual(edges(planBeats(drawn, [3, 4, 6, 7], [deal(8)], target => target === 'D.C3', noRest, STAND_IN_FILM.paow)), ['PLACE(D.C3)']);
  assert.deepEqual(edges(planBeats(drawn, [3, 4, 6, 7], [deal(8)], () => false, noRest, STAND_IN_FILM.paow)), ['IDLE>READY', 'READY>D.C3', 'D.C3>READY', 'READY>IDLE']);
  // Without the stopgap the hole card is laid without a hand, and the hand rests through the shoe before it.
  assert.deepEqual(edges(planBeats(opening, [], [deal(2), deal(3), deal(4), deal(5), deal(6), deal(7)], noHole, noRest)).slice(-3), ['P4.C2>READY', 'READY>IDLE', 'PLACE(D.C2)']);
  // A hit: from rest to the shoe, the card, back to the shoe and out.
  const table: TableCards = {hands: [{seat: 4, cards: [3, 6, 8]}, {seat: 7, cards: [2, 5]}], dealer: [4, 7]};
  assert.deepEqual(edges(planBeats(table, [2, 3, 4, 5, 6, 7], [deal(8)], () => false, noRest)), ['IDLE>READY', 'READY>P4.C1', 'P4.C1>READY', 'READY>IDLE']);
});

test('the game\'s bank: takes without a verdict are left out, except a talk film on request; a provisional verdict counts', () => {
  const take = (id: string) => ({id, kind: 'DEAL', target: null, from: 'READY', to: 'P4.C1', model: 'x', duration: 4, ratio: '', audio: false, promptText: '', first: {file: {path: 'a.png', sha256: 'a'}}, purpose: ''});
  const bank = {jobs: [take('judged'), take('pending'), take('inbox'), take('rejected'), take('provisional')], derived: [{id: 'tal', from: 'IDLE', to: 'IDLE', clip: 'tal', frames: [0, 40] as [number, number]}, {id: 'vila', from: 'IDLE', to: 'IDLE', clip: 'vila', frames: [0, 40] as [number, number]}],
    motions: {judged: {review: {decision: 'ACCEPTED'}}, pending: {review: {decision: 'PENDING'}}, inbox: {review: {decision: 'PENDING', inbox: true}}, rejected: {review: {decision: 'REJECTED'}},
      provisional: {review: {decision: 'ACCEPTED', provisional: {by: 'huvudagenten'}}}, tal: {review: {decision: 'PENDING', inbox: true}, motion: {idle: {onRequest: true}}}, vila: {review: {decision: 'PENDING', inbox: true}, motion: {idle: {calm: true}}}}};
  const kept = judgedBank(bank);
  assert.deepEqual([...kept.jobs!, ...kept.derived!].map(t => t.id), ['judged', 'rejected', 'provisional', 'tal']);
  assert.deepEqual(unjudgedTakes(bank), ['pending', 'inbox', 'vila']);
  assert.equal(bank.jobs.length, 5, 'the bank itself is left as it was');
  // A stopgap (Paow's entry played backwards as her exit) plays until a judged take of her own stands on the edge; another dealer's does not count.
  const exit = (id: string, dealer = 'paow') => ({id, from: 'READY', to: 'IDLE', clip: id, frames: [0, 90] as [number, number], dealer});
  const gap = {derived: [exit('baklanges'), exit('pamela-exit', 'pamela')], motions: {baklanges: {review: {decision: 'ACCEPTED'}, motion: {stopgap: true}}, 'pamela-exit': {review: {decision: 'ACCEPTED'}}, 'paow-exit': {review: {decision: 'PENDING', inbox: true}}}};
  assert.deepEqual(judgedBank(gap).derived!.map(t => t.id), ['baklanges', 'pamela-exit']);
  const judgedExit = {...gap, derived: [...gap.derived, exit('paow-exit')]};
  assert.deepEqual(judgedBank(judgedExit).derived!.map(t => t.id), ['baklanges', 'pamela-exit'], 'an unjudged exit does not push the stopgap out');
  judgedExit.motions['paow-exit'] = {review: {decision: 'ACCEPTED'}} as never;
  assert.deepEqual(judgedBank(judgedExit).derived!.map(t => t.id), ['pamela-exit', 'paow-exit'], 'a judged exit of her own does');
});

test('what she says in a step: the lines before its first card and after its last', () => {
  assert.deepEqual(speakMoments([{type: 'speak', line: 'goodluck'} as never, deal(2), deal(3), {type: 'speak', line: 'insurance'} as never, {type: 'turn'}]), {before: ['goodluck'], after: ['insurance']});
  assert.deepEqual(speakMoments([{type: 'speak', line: 'double'} as never, deal(8), {type: 'reveal', shoeDraw: 7}, deal(9), {type: 'speak', line: 'win'} as never]), {before: ['double'], after: ['win']});
  assert.deepEqual(speakMoments([{type: 'speak', line: 'placebets'} as never, {type: 'idle'}]), {before: ['placebets'], after: []});
  assert.equal(talkOn('av'), false); assert.equal(talkOn('repliker'), true); assert.equal(talkOn(undefined), true);
});
