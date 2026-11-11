import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEdge, formatEdge} from '../src/clip-graph.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {slotOf, slotFilm, slotLabel, slotImprovised, createLayout, FAN, SPLIT, type TableCards} from '../src/game-table.ts';
import {planBeats, lyingAfter, cardRecords, REVEAL_NODE} from '../src/game-director.ts';

// Seats 4 and 7 play. Opening deal as the engine draws it: seat 7, seat 4, dealer up, seat 7, seat 4, hole card.
// Draw 1 is the burn card.
const opening: TableCards = {hands: [{seat: 4, cards: [3, 6]}, {seat: 7, cards: [2, 5]}], dealer: [4, 7]};
const deal = (shoeDraw: number) => ({type: 'deal', shoeDraw});
const edges = (beats: {step: {from: string; to: string}}[]) => beats.map(b => formatEdge(b.step.from, b.step.to));

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
  for (const b of beats) assert.ok(parseEdge(formatEdge(b.step.from, b.step.to)), `${b.step.from}>${b.step.to} is an edge of the clip bank`);
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
