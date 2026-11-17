// The card plan drawn in the real perspective (src/card-plan.ts): on "Plant bord" each card is a real card through the table's
// lens at its own place, the plan's own rule elsewhere, and V6's cards measured against a real card. Needs no media; the plan
// is the model's start proposal, so the test holds after Jakob saves his.
// Run: node --test tools/card-plan.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, planQuad, setTableProjection, toPixels, validatePlan, type PlacementPlan } from '../src/placement-model.ts';
import { TABLE_LENS, quadMeasure, realCardQuad } from '../src/table-lens.ts';
import { V6_CARD, V6_CARD_SIZE, filmToPlan, planCardQuad, planToFilm, realCardAcross, screenMeasure, throughLens } from '../src/card-plan.ts';

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
