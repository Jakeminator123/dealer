// The deal check of tools/film-after.ts on made-up numbers, no films: an order without a last picture (order-new.ts --no-end,
// a seat's first landing) lands on the card plan's card and is not failed for a missing last picture; an order that has one
// whose file is missing still is; and an order with its last picture is checked exactly as before, whatever the plan says.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDeal, type Blob, type FrameCard} from '../src/deal-check.ts';
import {cardBlobs} from '../src/film-after.ts';
import type {PlacementPlan} from '../src/placement-model.ts';
import {dealCheckOf, planCardOf, type PlanCard} from './film-after.ts';

// A plan drawn card by card (no "Plant bord"): seat 9's card is the plan's own rectangle, 0.05 × 0.06 of the 1762 × 1174 view
// about (0.5, 0.1), carried to the film's 1764 columns as an order's last picture is (x × 1763/1761).
const plan = {schemaVersion: 1, id: 'pamela-table', space: 'image-normalized-bottom-up', updatedAt: null, shoe: {native: {u: 0.75, v: 0.35}, portrait: {u: 0.75, v: 0.35}},
  targets: {'P9.C1': {geometry: {native: {u: 0.5, v: 0.1, width: 0.05, height: 0.06, angle: 0, taper: 1, reviewed: true}}}}} as unknown as PlacementPlan;

test('the plan\'s card: its box as cardBlobs gives one, the middle of its outline and its area', () => {
  const card = planCardOf(plan, 'P9.C1')!;
  assert.deepEqual(card.bbox, [837, 1021, 926, 1091]);
  assert.deepEqual(card.centre, [881.5, 1055.7]);
  assert.equal(card.n, 6204);
  assert.equal(planCardOf(plan, 'P1.C1'), null);
});

// A clean open deal laid on `box`: yellow carried from the shoe's side, three frames on edge, then blue lying there.
const blob = (n: number, [l, t, r, b]: number[]): Blob => ({n, centre: [(l + r) / 2, (t + b) / 2], bbox: [l, t, r, b], long: Math.max(r - l, b - t) + 1, short: Math.min(r - l, b - t) + 1, paleRingPct: 0, rgb: [40, 90, 220]});
function deal(box: number[], n: number): {frames: FrameCard[]; changePerFrame: number[]} {
  const frames: FrameCard[] = [];
  for (let f = 0; f < 40; f++) {
    const x = 1000 - 5 * f, y = 900 + 3 * f;
    frames.push({f, dealtYellow: f < 20 ? blob(n * 0.55, [x - 35, y - 25, x + 35, y + 25]) : f < 23 ? blob(n * 0.05, [x - 35, y - 3, x + 35, y + 3]) : null, blue: f >= 23 ? blob(n, box) : null});
  }
  return {frames, changePerFrame: frames.map((_, f) => (f ? 2 : 0))};
}
const noEnd = {motion: {target: 'P9.C1', side: 'FRONT'}, pictures: [{name: 'first.png', goesAs: 'startFrame'}]};
const withEnd = {motion: {target: 'P9.C1', side: 'FRONT'}, pictures: [{name: 'first.png', goesAs: 'startFrame'}, {name: 'last.png', goesAs: 'endFrame'}]};

test('a deal ordered without a last picture is measured against the plan\'s card, not failed for the missing picture', () => {
  const card = planCardOf(plan, 'P9.C1')!, d = deal(card.bbox, card.n);
  const r = dealCheckOf(noEnd, d, null, 24, card);
  assert.ok(!r.fails.some(f => f.code === 'ingen-sista-bild'));
  assert.equal(r.pass, true, JSON.stringify(r.fails));
  assert.equal(r.measures.laidArea, card.n);
  assert.equal(r.measures.edgeFrames && (r.measures.edgeFrames as number[]).length, 3);
  assert.match(r.cardFrom!, /^kortplanen, P9\.C1/);
  // The same check and thresholds as with a last picture: only where the card should lie comes from the plan.
  const {cardFrom, planCard, ...check} = r;
  assert.deepEqual(check, checkDeal(d.frames, {fps: 24, side: 'FRONT', lastCard: {bbox: card.bbox, centre: card.centre, n: card.n}, changePerFrame: d.changePerFrame}));
  assert.equal(planCard, card); assert.ok(cardFrom);
});

test('without a last picture the texts name the plan\'s card, and the thresholds are the same', () => {
  const card = planCardOf(plan, 'P9.C1')!;
  const off = (dy: number) => dealCheckOf(noEnd, deal(card.bbox.map((v, i) => (i % 2 ? v + dy : v)), card.n), null, 24, card);
  const near = off(10), far = off(20);
  assert.equal(near.pass, true);
  assert.deepEqual(near.remarks.find(f => f.code === 'plats')?.text, 'Kortet ligger 10 px från kortplanens kort.');
  assert.equal(far.pass, false);
  assert.deepEqual(far.fails.map(f => [f.code, f.text]), [['fel-plats', 'Kortet ligger 20 px från kortplanens kort: kortet ligger utanför sin plats.']]);
  assert.equal([...far.fails, ...far.remarks, ...near.remarks].some(f => /retur|sista bilden/.test(f.text)), false);
});

test('without a last picture and without the place in the plan there is nothing to land on', () => {
  const card = planCardOf(plan, 'P9.C1')!, r = dealCheckOf(noEnd, deal(card.bbox, card.n), null, 24, null);
  assert.equal(r.pass, false);
  assert.deepEqual(r.fails.map(f => f.code), ['ingen-plats-i-planen']);
});

test('an order with a last picture whose file is missing still fails on it, plan or no plan', () => {
  const card = planCardOf(plan, 'P9.C1')!;
  for (const given of [card, null]) {
    const r = dealCheckOf(withEnd, deal(card.bbox, card.n), null, 24, given);
    assert.deepEqual(r, {pass: false, fails: [{code: 'ingen-sista-bild', text: 'Sista bildens kort går inte att mäta: inget att jämföra landningen med.'}], remarks: [], measures: {}});
  }
});

test('an order with its last picture is checked against that picture\'s card exactly as before; the plan changes nothing', () => {
  // A last picture in the bank's frame with a blue card 6 px right of the plan's and 4 px lower; green elsewhere.
  const W = 1764, H = 1174, bgr = new Uint8Array(W * H * 3), [l, t, r, b] = [843, 1025, 932, 1095];
  for (let p = 0; p < W * H; p++) bgr.set([40, 190, 30], p * 3);
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) bgr.set([220, 90, 40], (y * W + x) * 3);
  const last = {width: W, height: H, data: bgr}, measured = cardBlobs(bgr, W, H).find(c => c.c === 'B')!;
  assert.deepEqual(measured.box, [l, t, r, b]);
  const card = planCardOf(plan, 'P9.C1')!, d = deal(card.bbox, card.n);
  const before = checkDeal(d.frames, {fps: 24, side: 'FRONT', lastCard: {bbox: measured.box!, centre: [measured.x, measured.y], n: measured.area}, changePerFrame: d.changePerFrame});
  for (const order of [withEnd, noEnd]) for (const given of [card, null] as (PlanCard | null)[]) assert.deepEqual(dealCheckOf(order, d, last, 24, given), before);
  assert.ok(before.remarks.some(f => f.code === 'plats' && f.text === 'Kortet ligger 6 px från sista bildens kort.'));
});
