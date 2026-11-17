// The card plan drawn in the real perspective (src/card-plan.ts): on "Plant bord" each card is a real card through the table's
// lens at its own place (size and place), in the plan's shape (the table's perspective, one keystone rule for every card), the
// plan's own rule elsewhere, and V6's cards measured against a real card. Needs no media; the plan is the model's start proposal
// (with seat 4's and the dealer's first cards where placements/default.json had them on 2026-11-17), so the test holds after
// Jakob saves his.
// Run: node --test tools/card-plan.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_PERSPECTIVE, TARGETS, defaultPlan, planQuad, setTablePerspective, setTableProjection, toPixels, validatePlan, type PlacementPlan } from '../src/placement-model.ts';
import { TABLE_LENS, quadMeasure, realCardQuad, type Pixel } from '../src/table-lens.ts';
import { V6_CARD, V6_CARD_SIZE, filmToPlan, planCardQuad, planTaper, planToFilm, realCardAcross, screenMeasure, throughLens } from '../src/card-plan.ts';

const near = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const plan = (): PlacementPlan => { const p = defaultPlan(); validatePlan(p); return p; };
/** A real card at the plan's place through the real camera, in plan pixels: the size and place every value must keep. */
const realOf = (p: PlacementPlan, id: string) => realCardQuad(planToFilm(toPixels(p.targets[id].geometry.native, 'native')), 0, 1, TABLE_LENS)!.map(filmToPlan);
const same = (a: Pixel, b: Pixel, what: string) => { near(a.x, b.x, 1e-6, `${what} x`); near(a.y, b.y, 1e-6, `${what} y`); };

test('on "Plant bord" every card is a real card (grow 1) through the table lens at its own place; a real card\'s own shape at 96 %', () => {
  const p = setTablePerspective(plan(), TABLE_PERSPECTIVE.max);
  assert.equal(throughLens(p, 'native'), true);
  for (const id of TARGETS) {
    assert.deepEqual(planCardQuad(p, id, 'native'), realOf(p, id), id);
    near(quadMeasure(realOf(p, id)).taper, 0.956, 0.01, `${id} taper`);
  }
  // a card's size follows from its place: the plan's own width draws nothing on the real perspective
  const wider = structuredClone(p); wider.targets['P4.C1'].geometry.native.width *= 1.5; wider.targets['P2.C1'].geometry.native.width *= 0.5;
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

// placements/default.json on 2026-11-17 (tools/table-lens.test.ts PLAN): seat 4's and the dealer's first card, with seat 4's
// stored taper (0.87 since 11 Nov, his plan's shape), and the near edge the real camera gives the dealer's card (75.1 px).
const HIS = { 'P4.C1': { u: 0.4858844998096943, v: 0.06106632779165577 }, 'D.C1': { u: 0.48239636570130606, v: 0.2097186700767263 } };
const his = (): PlacementPlan => {
  const p = plan();
  for (const [id, at] of Object.entries(HIS)) Object.assign(p.targets[id].geometry.native, at, { angle: 0 });
  p.targets['P4.C1'].geometry.native.taper = 0.87;
  return p;
};

test('the table\'s perspective is only the shape: at every value all sixteen cards keep the real camera\'s near edge, depth and place', () => {
  for (const v of [null, TABLE_PERSPECTIVE.max, 0.91, 0.87, TABLE_PERSPECTIVE.min]) {
    const p = setTablePerspective(his(), v);
    for (const id of TARGETS) {
      const q = planCardQuad(p, id, 'native'), real = realOf(p, id);
      same(q[2], real[2], `${id} at ${v}: near right corner`); same(q[3], real[3], `${id} at ${v}: near left corner`);
      near(q[0].y, real[0].y, 1e-6, `${id} at ${v}: far edge's height`); near(q[1].y, real[1].y, 1e-6, `${id} at ${v}: far edge's height`);
      const m = screenMeasure(q), r = screenMeasure(real);
      near(m.near, r.near, 1e-6, `${id} at ${v}: near edge`);
      assert.ok(m.far <= r.far * 1.005, `${id} at ${v}: the far edge is never wider than a real card's (${m.far} against ${r.far})`);
    }
    // the dealer's cards are as wide at every value: 75.1 px at the dealer's first card
    near(screenMeasure(planCardQuad(p, 'D.C1', 'native')).near, 75.1, 0.15, `the dealer's card at ${v}`);
  }
});

test('the table\'s perspective: seat 4\'s far edge is the chosen share of its near edge; without a value, seat 4\'s stored taper', () => {
  const taperAt = (p: PlacementPlan, id = 'P4.C1') => { const m = screenMeasure(planCardQuad(p, id, 'native')); return m.far / m.near; };
  for (const v of [0.91, 0.87, 0.84, TABLE_PERSPECTIVE.min]) near(taperAt(setTablePerspective(his(), v)), v, 0.002, `seat 4 at ${v}`);
  near(taperAt(setTablePerspective(his(), TABLE_PERSPECTIVE.max)), 0.956, 0.002, '96 %: a real card\'s own shape');
  // no value: the plan's seat-4 taper (his 0.87), clamped to the control's range; the shape narrows the cards further off too
  near(planTaper(his()), 0.87, 1e-9, 'his plan');
  near(taperAt(his()), 0.87, 0.002, 'seat 4 with no value saved');
  assert.ok(taperAt(his(), 'P1.C1') < 0.93 && taperAt(his(), 'D.C1') < 0.93, 'every card has depth in its shape');
  const straight = his(); straight.targets['P4.C1'].geometry.native.taper = 1.2;
  near(planTaper(straight), TABLE_PERSPECTIVE.max, 1e-9, 'a straight seat 4 (taper 1.2) draws a real card\'s shape');
  const tight = his(); tight.targets['P4.C1'].geometry.native.taper = 0.5;
  near(planTaper(tight), TABLE_PERSPECTIVE.min, 1e-9, 'and a very narrow one the control\'s end');
});

test('the perspective is stored with the table\'s projection: absent is seat 4\'s taper, a value within 0.80 to 0.96, kept by a change of mode', () => {
  const p = setTablePerspective(plan(), 0.87);
  assert.deepEqual(p.tableProjection, { mode: 'flat', heading: 0, perspective: 0.87 }); validatePlan(p);
  assert.deepEqual(setTablePerspective(p, null).tableProjection, { mode: 'flat', heading: 0 });
  const own = setTableProjection(p, { mode: 'individual', heading: 0 }); assert.equal(own.tableProjection?.perspective, 0.87); assert.equal(throughLens(own, 'native'), false);
  assert.equal(setTableProjection(own, { mode: 'flat', heading: 15 }).tableProjection?.perspective, 0.87);
  validatePlan(setTablePerspective(plan(), 0.8));
  for (const bad of [0.5, 0.74, 0.79, 0.97, 1.2, '0.87', null, Number.NaN]) assert.throws(() => validatePlan({ ...p, tableProjection: { mode: 'flat', heading: 0, perspective: bad as number } }), `${bad}`);
  assert.throws(() => validatePlan({ ...p, tableProjection: { mode: 'flat', heading: 0, perspective: 0.87, extra: true } as never }));
  for (const bad of [0.5, 0.79, 1]) assert.throws(() => setTablePerspective(p, bad));
  assert.equal(p.targets['P1.C1'].geometry.native.reviewed, plan().targets['P1.C1'].geometry.native.reviewed, 'the places stay as they were');
});
