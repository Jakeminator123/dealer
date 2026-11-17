// The card plan drawn in the real perspective (src/card-plan.ts): on "Plant bord" each card is a real card through the table's
// lens at its own place, the plan's own rule elsewhere, the table's perspective (one lens of the family for the whole plan),
// and V6's cards measured against a real card. Needs no media; the plan is the model's start proposal (with seat 4's and the
// dealer's first cards where placements/default.json had them on 2026-11-17), so the test holds after Jakob saves his.
// Run: node --test tools/card-plan.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_PERSPECTIVE, defaultPlan, planQuad, setTablePerspective, setTableProjection, toPixels, validatePlan, type PlacementPlan } from '../src/placement-model.ts';
import { TABLE_LENS, lensForTaper, quadMeasure, realCardQuad, seatFourTaper } from '../src/table-lens.ts';
import { V6_CARD, V6_CARD_SIZE, dealerCards, filmToPlan, planCardQuad, planLens, planToFilm, realCardAcross, screenMeasure, throughLens } from '../src/card-plan.ts';

const near = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const plan = (): PlacementPlan => { const p = defaultPlan(); validatePlan(p); return p; };

test('on "Plant bord" every card is a real card (grow 1) through the table lens at its own place, narrowing to about 0.956', () => {
  const p = plan();
  assert.equal(throughLens(p, 'native'), true);
  for (const id of Object.keys(p.targets)) {
    const real = realCardQuad(planToFilm(toPixels(p.targets[id].geometry.native, 'native')), 0, 1, TABLE_LENS)!.map(filmToPlan);
    assert.deepEqual(planCardQuad(p, id, 'native'), real, id);
    near(quadMeasure(real).taper, 0.956, 0.01, `${id} taper`);
  }
  // a card's size follows from its place: the plan's own width and taper draw nothing on the real perspective
  const wider = structuredClone(p); wider.targets['P4.C1'].geometry.native.width *= 1.5; wider.targets['P4.C1'].geometry.native.taper = 0.5;
  assert.deepEqual(planCardQuad(wider, 'P2.C1', 'native'), planCardQuad(p, 'P2.C1', 'native'));
  // nearer the dealer the cards grow against the plan's old plane, as the 3D lane measured (dealer3d, 2026-11-17)
  const grows = (id: string) => quadMeasure(planCardQuad(p, id, 'native')).near / quadMeasure(planQuad(p, id, 'native')).near;
  assert.ok(grows('D.C1') > grows('P4.C1') + 0.15, `the dealer's card grows more than seat 4's: ${grows('D.C1')}`);
});

test('the plan\'s own rule where the lens does not apply: a table taken off "Plant bord", and Mobil', () => {
  const own = setTableProjection(plan(), { mode: 'individual', heading: 0 });
  assert.equal(throughLens(own, 'native'), false);
  for (const id of ['P1.C1', 'P4.C1', 'D.C2']) assert.deepEqual(planCardQuad(own, id, 'native'), planQuad(own, id, 'native'));
  const p = plan();
  for (const id of ['P1.C1', 'P4.C1']) assert.deepEqual(planCardQuad(p, id, 'portrait'), planQuad(p, id, 'portrait'));
});

test('V6\'s cards (frame 694) against a real card lying the same way at the same place: 1.46 wide, 1.47 deep, 1.38 as a whole', () => {
  const c = { x: V6_CARD.reduce((s, q) => s + q.x, 0) / 4, y: V6_CARD.reduce((s, q) => s + q.y, 0) / 4 };
  const v6 = screenMeasure(V6_CARD), real = screenMeasure(realCardAcross(c)!);
  near(v6.near / real.near, 1.458, 0.005, 'near edge');
  near(v6.depth / real.depth, 1.472, 0.005, 'depth');
  near(Math.sqrt(v6.area / real.area), V6_CARD_SIZE, 0.005, 'as a whole');
  near(v6.far / v6.near, 0.736, 0.005, 'V6\'s own taper (its camera is wider)');
});

// placements/default.json on 2026-11-17 (tools/table-lens.test.ts PLAN): seat 4's and the dealer's first card, and the near
// edge the plan's old plane drew the dealer's card with (56.2 px), the look Jakob had before the real perspective.
const HIS = { 'P4.C1': { u: 0.4858844998096943, v: 0.06106632779165577 }, 'D.C1': { u: 0.48239636570130606, v: 0.2097186700767263 } };
const his = (): PlacementPlan => { const p = plan(); for (const [id, at] of Object.entries(HIS)) Object.assign(p.targets[id].geometry.native, at, { angle: 0 }); return p; };
const nearOf = (p: PlacementPlan, id: string) => screenMeasure(planCardQuad(p, id, 'native')).near;

test('the table\'s perspective at the real camera\'s 96 %: the lens of the family is TABLE_LENS, and a plan without the value draws as before', () => {
  near(seatFourTaper(), 0.956, 0.001, 'seat 4\'s card under TABLE_LENS');
  const real = lensForTaper(seatFourTaper());
  near(real.focalPx / TABLE_LENS.focalPx, 1, 0.001, 'focal length'); near(real.pitch, TABLE_LENS.pitch, 1e-4, 'pitch'); near(real.height, TABLE_LENS.height, 1e-3, 'height');
  const p = his(), same = structuredClone(p); same.tableProjection = { mode: 'flat', heading: 0, perspective: seatFourTaper() };
  assert.equal(planLens(p), TABLE_LENS, 'no value: the real camera itself');
  for (const id of Object.keys(p.targets)) planCardQuad(same, id, 'native').forEach((c, i) => { const was = planCardQuad(p, id, 'native')[i]; near(c.x, was.x, 0.1, `${id} x`); near(c.y, was.y, 0.1, `${id} y`); });
  near(nearOf(p, 'P4.C1'), 84.5, 0.15, 'seat 4\'s card, as the lens test measured'); near(nearOf(p, 'D.C1'), 75.1, 0.15, 'the dealer\'s card');
  assert.deepEqual(dealerCards(p).share, 1);
});

test('the table\'s perspective: more of it narrows every card more and draws the dealer\'s smaller, seat 4\'s card held; 87 % is the old plan\'s dealer', () => {
  const at = (v: number | null) => setTablePerspective(his(), v);
  let last = Infinity;
  for (const v of [null, 0.91, 0.87, TABLE_PERSPECTIVE.min]) {
    const p = at(v), d = dealerCards(p), seat4 = quadMeasure(planCardQuad(p, 'P4.C1', 'native'));
    near(seat4.near, 84.5, 0.6, `seat 4's near edge at ${v}`); near(seat4.taper, v ?? 0.956, 0.003, `seat 4's taper at ${v}`);
    assert.ok(d.px < last, `the dealer's cards shrink: ${d.px} px at ${v}`); last = d.px;
    near(screenMeasure(planCardQuad(p, 'P4.C1', 'native')).near, nearOf(his(), 'P4.C1'), 0.6, 'seat 4 keeps its place and size');
  }
  near(nearOf(at(0.87), 'D.C1'), 56.2, 2.5, 'at 87 % the dealer\'s card is near the old plane\'s 56.2 px');
  near(dealerCards(at(0.87)).share, 0.72, 0.02, 'dealerns kort 100 % -> 72 %');
  near(dealerCards(at(0.91)).share, 0.857, 0.01, 'dealerns kort 100 % -> 86 % at 91 %');
  near(dealerCards(at(TABLE_PERSPECTIVE.min)).share, 0.65, 0.02, 'dealerns kort at the range\'s end, 85 %');
  // why the range stops at 0.85: at V6's 0.74 the lens holding seat 4's card is a hand's breadth over the felt and the
  // dealer's cards a quarter as wide (V6's look is larger cards from another camera: Efterarbete's)
  const v6 = { ...his(), tableProjection: { mode: 'flat' as const, heading: 0, perspective: 0.74 } };
  assert.ok(planLens(v6).height < 0.15, `the lens at 0.74: ${planLens(v6).height} m over the felt`);
  near(dealerCards(v6).share, 0.25, 0.03, 'dealerns kort at V6\'s perspective');
});

test('the perspective is stored with the table\'s projection: absent is the real camera, a value within 0.85 to 0.96, kept by a change of mode', () => {
  const p = setTablePerspective(plan(), 0.87);
  assert.deepEqual(p.tableProjection, { mode: 'flat', heading: 0, perspective: 0.87 }); validatePlan(p);
  assert.deepEqual(setTablePerspective(p, null).tableProjection, { mode: 'flat', heading: 0 });
  const own = setTableProjection(p, { mode: 'individual', heading: 0 }); assert.equal(own.tableProjection?.perspective, 0.87); assert.equal(throughLens(own, 'native'), false);
  assert.equal(setTableProjection(own, { mode: 'flat', heading: 15 }).tableProjection?.perspective, 0.87);
  for (const bad of [0.5, 0.74, 0.84, 0.97, 1.2, '0.87', null, Number.NaN]) assert.throws(() => validatePlan({ ...p, tableProjection: { mode: 'flat', heading: 0, perspective: bad as number } }), `${bad}`);
  assert.throws(() => validatePlan({ ...p, tableProjection: { mode: 'flat', heading: 0, perspective: 0.87, extra: true } as never }));
  for (const bad of [0.5, 0.74, 0.84, 1]) assert.throws(() => setTablePerspective(p, bad));
  assert.equal(p.targets['P1.C1'].geometry.native.reviewed, plan().targets['P1.C1'].geometry.native.reviewed, 'the places stay as they were');
});
