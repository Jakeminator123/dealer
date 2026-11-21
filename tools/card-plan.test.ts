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
import { readFile } from 'node:fs/promises';
import { VIEWS, flatQuad, quad } from '../src/placement-model.ts';
import { CARD, FILM, SEAT_FOUR_CARD, cardCorners, feltToPixel, inFrame, lensForFocal, pixelToFelt, planPixel, type Lens, type Vec3 } from '../src/table-lens.ts';
import { PLAN_CARD_SIZE, TABLE_GEOMETRY, cardGrow, cardPlace, keystone, planCardAt, planCardFrom, planShape, tableGeometry } from '../src/card-plan.ts';
import { planScene, poseAt, restingQuad, sceneOf, type CardTrack } from '../src/card-overlay.ts';
import { cardOptions, placedCards } from '../src/game-film.ts';
import { createLayout, slotLabel, type Slot, type TableCards } from '../src/game-table.ts';
import { BET, betSpots, cameraFromContract, cardSpots, edgeRowOf, filmPixel, filmToTable, lensCamera, ringOffset, solveCamera, spotToScene, viewUnder, type FilmCamera } from '../src/scene3d-geometry.ts';
import { REAL_TABLE, TABLE, TABLE_SIZE, sized, tableUnder } from '../src/scene3d-table.ts';

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

// ---- one geometry for the table ----------------------------------------------------------------------------------------------
// The same plan and the same card give the same outline in the lab's card plan, in the game's lying cards, in the drawn card at
// rest and in the 3D scene's projection of its card place, also when the lens or the picture's size is changed; and the look
// of the game before that rule ('contract', the default) is the picture it was. Every plan here is built by the test: nothing
// reads placements/default.json, which is Jakob's and changes when he saves.
const contract = JSON.parse(await readFile('data/scene-contract.json', 'utf8')), EDGE_ROW = edgeRowOf(contract);
/** The tolerance the outlines are held to: a hundredth of a film pixel (1764 x 1174), for every corner. */
const TOLERANCE = 0.01;
const dist = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
const outlines = (a: readonly Pixel[], b: readonly Pixel[], what: string, within = TOLERANCE) => { assert.equal(a.length, b.length, what); a.forEach((p, i) => assert.ok(dist(p, b[i]) <= within, `${what}: corner ${i} is ${dist(p, b[i]).toFixed(5)} px off (allowed ${within})`)); };

// A plan as Jakob's is built (seats mirrored about the middle, the dealer's two cards centred, "Plant bord"), with places of the
// test's own and, where asked, a Perspektiv; and the same plan drawn card by card ("individual").
function testPlan(perspective: number | null = null, heading = 0): PlacementPlan {
  const plan = defaultPlan(), rows = [0.164, 0.131, 0.098, 0.061];
  for (let seat = 1; seat <= 7; seat++) for (const second of [false, true]) {
    const k = Math.abs(seat - 4), u = 0.5 + (seat - 4) * 0.1176 + (second ? 0.0282 : -0.0141), v = rows[3 - k] + (second ? 0.009 : 0);
    Object.assign(plan.targets[`P${seat}.C${second ? 2 : 1}`].geometry.native, {u, v, width: 0.0492, height: 0.0612, taper: 0.87});
  }
  for (const [id, u] of [['D.C1', 0.4824], ['D.C2', 0.5176]] as const) Object.assign(plan.targets[id].geometry.native, {u, v: 0.2097, width: 0.0492, height: 0.0612, taper: 0.87});
  const out = setTablePerspective({...plan, tableProjection: {mode: 'flat', heading}}, perspective);
  validatePlan(out); return out;
}
const slotOfTarget = (id: string): Slot => ({owner: id[0] === 'D' ? 'D' : 'P', seat: id[0] === 'D' ? 0 : Number(id[1]), hand: 0, hands: 1, index: Number(id.at(-1)) - 1});
const headingOf = (plan: PlacementPlan) => ((plan.tableProjection?.heading ?? 0) + plan.targets['P4.C1'].geometry.native.angle) * Math.PI / 180;

// The four ways one card of the plan is drawn, each in film pixels and in the card's own corner order.
function ways(plan: PlacementPlan, id: string, lens: Lens = TABLE_LENS) {
  const lab = planCardQuad(plan, id, 'native', lens).map(planToFilm);
  const game = createLayout(plan, {geometry: 'lens', lens}).quad(slotOfTarget(id));
  const rest = restingQuad(planScene(null, plan, lens), game, 1).quad;
  // the 3D scene: the card place laid on the felt by the scene's film camera (cardSpots, dealer metres), a real card there in the
  // scene's metres, its corners through the scene's own projection (filmPixel), in the plan's shape
  const camera = lensCamera(lens, EDGE_ROW), spot = cardSpots(plan, camera).find(s => s.id === id)!;
  const centre = spotToScene(camera, spot.x, spot.s) as Vec3, corners = cardCorners(centre, headingOf(plan)).map(p => filmPixel(camera, p)!);
  const scene = keystone(corners, filmPixel(camera, centre)!.x, planShape(plan, lens));
  return {lab, game, rest, scene};
}

test('the default follows the lens Jakob chose in comparison B; the old geometry stays explicit', () => {
  // Changing this line of src/card-plan.ts is his yes. docs/SYSTEM.md, "Ritade kort", names the code that is then left over.
  assert.equal(TABLE_GEOMETRY, 'lens');
  assert.equal(tableGeometry(null), TABLE_GEOMETRY); assert.equal(tableGeometry(''), TABLE_GEOMETRY); assert.equal(tableGeometry('?kort=liggande'), TABLE_GEOMETRY);
  assert.equal(tableGeometry('?geometri=lins'), 'lens'); assert.equal(tableGeometry('?dealer=paow&geometri=lins&kort=hand'), 'lens');
  assert.equal(tableGeometry('?geometri=kontrakt'), 'contract'); assert.equal(tableGeometry('?geometri=annat'), TABLE_GEOMETRY);
  for (const word of ['constructor', '__proto__', 'toString']) assert.equal(tableGeometry(`?geometri=${word}`), TABLE_GEOMETRY, word);
});

test('a saved look\'s geometry (Casino\'s Bred lins, Jakob 2026-11-21) counts only where the address has no word of its own', () => {
  // the game page: tableGeometry(location.search, the preset's geometri)
  assert.equal(tableGeometry('?forval=casino&table=casino', 'kontrakt'), 'contract', 'the plain Casino link plays the saved Bred lins');
  assert.equal(tableGeometry('?forval=casino&geometri=lins', 'kontrakt'), 'lens', 'Prova i Casino with Standard keeps Standard');
  assert.equal(tableGeometry('?forval=casino&geometri=kontrakt', null), 'contract', 'Prova i Casino with Bred lins');
  assert.equal(tableGeometry('?forval=casino&geometri=annat', 'kontrakt'), 'contract', 'a word the page does not know is no word');
  assert.equal(tableGeometry('?forval=casino', null), TABLE_GEOMETRY, 'a preset saved before 2026-11-21 is Standard');
  assert.equal(tableGeometry('?forval=casino', 'annat'), TABLE_GEOMETRY); assert.equal(tableGeometry('?forval=casino', 'constructor'), TABLE_GEOMETRY);
  // the film before the game (cloud/studio/gate.ts TRAILER_HOME) names neither a preset nor a geometry: as before, the default
  const trailer = '?intro=noir-3&room=monaco&roomLife=1&table=casino&dealer=paow';
  assert.equal(tableGeometry(trailer, null), tableGeometry(trailer)); assert.equal(tableGeometry(trailer, null), 'lens');
});

test('the game as it was: the older rule gives the same lying cards pixel for pixel, also where a place is made up', () => {
  // before this rule the game laid a card with flatQuad and its own factor for the film's width (1763 / 1761)
  const FILM_X = 1763 / 1761, plan = testPlan(), layout = createLayout(plan, {geometry: 'contract'}), reference = plan.targets['P4.C1'].geometry.native;
  for (const id of TARGETS) outlines(layout.quad(slotOfTarget(id)), flatQuad(plan.targets[id].geometry.native, reference, 'native', 0).map(p => ({x: p.x * FILM_X, y: p.y})), id, 1e-9);
  const own = setTableProjection(plan, {mode: 'individual', heading: 0}), card = createLayout(own, {geometry: 'contract'});
  for (const id of ['P1.C1', 'P4.C2', 'D.C2']) outlines(card.quad(slotOfTarget(id)), quad(own.targets[id].geometry.native, 'native').map(p => ({x: p.x * FILM_X, y: p.y})), id, 1e-9);
  // the dealer's third card lies where its film lays it, as before (its place written in film pixels)
  const third = layout.centre({owner: 'D', seat: 0, hand: 0, hands: 1, index: 2});
  assert.ok(Math.hypot(third.x - 1069, third.y - 926) < 3);
  // and with nothing said the layout follows TABLE_GEOMETRY
  for (const id of ['P1.C1', 'P7.C2', 'D.C1']) outlines(createLayout(plan).quad(slotOfTarget(id)), createLayout(plan, {geometry: TABLE_GEOMETRY}).quad(slotOfTarget(id)), id, 0);
});

test('pixel and metre, in one place: the scene\'s film camera from the lens is the lens', () => {
  const camera = lensCamera(TABLE_LENS, EDGE_ROW), solved = solveCamera(camera);
  assert.equal(camera.scale, 1); assert.equal(camera.source, 'lens');
  assert.ok(Math.abs(solved.pitch - TABLE_LENS.pitch) < 1e-12); assert.ok(Math.abs(solved.edgeDistance - 1.844) < 0.001, `the dealer's edge ${solved.edgeDistance.toFixed(4)} m from the camera`);
  for (const pixel of [{x: 236, y: 980.7}, {x: 856.6, y: 1102.2}, {x: 1489, y: 981}, {x: 850.4, y: 927.6}, {x: 881.5, y: 831.5}, {x: 40, y: 1160}]) {
    const felt = pixelToFelt(pixel)!, table = filmToTable(camera, pixel.x, pixel.y)!;
    assert.ok(Math.hypot(felt[0] - table.x, felt[2] - table.z) < 1e-9 && Math.abs(felt[1]) < 1e-12, 'the scene lays the pixel on the felt where the lens does');
    assert.ok(dist(feltToPixel(felt)!, pixel) < 1e-9, 'and back'); assert.ok(dist(filmPixel(camera, felt)!, pixel) < 1e-9, 'through the scene\'s own projection too');
    const lifted: Vec3 = [felt[0], 0.12, felt[2] - 0.3]; assert.ok(dist(filmPixel(camera, lifted)!, feltToPixel(lifted)!) < 1e-9, 'a point over the felt as well');
  }
  assert.equal(pixelToFelt({x: 800, y: -600}), null, 'above the horizon there is no felt');
  // a card place of the plan lies where the plan's pixel is, in metres, and a bet ring a fixed real distance in front of it
  const plan = testPlan(), spots = cardSpots(plan, camera), edge = -solved.edgeDistance;
  for (const id of ['P1.C1', 'P4.C1', 'P7.C2', 'D.C1']) { const spot = spots.find(s => s.id === id)!, felt = pixelToFelt(planPixel(plan.targets[id].geometry.native))!;
    assert.ok(Math.hypot(spot.x - felt[0], spot.s - (felt[2] - edge)) < 1e-9, id); }
  const bet = betSpots(plan, camera).find(b => b.id === 'P4')!, card = spots.find(s => s.id === 'P4.C1')!;
  // under the lens the ring's offset is the one for a real card (BET.real): the ring lies clear of the card's near edge
  assert.ok(Math.abs(bet.s - card.s - BET.real) < 1e-12 && bet.x === card.x);
  assert.ok(BET.real - BET.radius - 0.088 / 2 >= 0.01, 'at least a centimetre of felt between a real card and the ring');
});

test('under the lens the table is a real table\'s depth and the ring lies clear of a real card; the contract\'s are as they were', () => {
  const lens = lensCamera(TABLE_LENS, EDGE_ROW), contract: FilmCamera = {focalPx: 886, horizonRow: 547.8, edgeRow: EDGE_ROW, heightM: 0.493, scale: 2, source: 'contract'};
  assert.equal(tableUnder(contract, 1), 1); assert.deepEqual(sized(tableUnder(contract, 1.2)), sized(1.2));
  const real = sized(tableUnder(lens, 1)); assert.equal(real.a, TABLE.a); assert.ok(Math.abs(real.b - REAL_TABLE.depth) < 1e-12);
  assert.deepEqual(sized(1), {a: TABLE.a, b: TABLE.b}); assert.deepEqual(sized(9), sized(TABLE_SIZE.max), 'a number is held within the control as before');
  // the game's lying framing reaches about film row 1410 under the lens: the felt goes past it in the middle, which the 0.6 m table did not
  assert.ok(filmPixel(lens, spotToScene(lens, 0, real.b))!.y > 1700); assert.ok(filmPixel(lens, spotToScene(lens, 0, TABLE.b))!.y < 1300);
  const plan = testPlan(), at = (c: FilmCamera) => betSpots(plan, c).find(b => b.id === 'P4')!.s - cardSpots(plan, c).find(s => s.id === 'P4.C1')!.s;
  assert.ok(Math.abs(at(contract) - BET.offset) < 1e-12); assert.equal(ringOffset(contract), 0.068); assert.equal(ringOffset(lens), BET.real);
});

test('a turn given as the lens reads it comes back as the contract writes it', () => {
  const lens = lensCamera(TABLE_LENS, EDGE_ROW), contract: FilmCamera = {focalPx: 886, horizonRow: 547.8, edgeRow: EDGE_ROW, heightM: 0.493, scale: 2, source: 'contract'};
  const written = viewUnder(contract, lens, {yaw: 9, pitch: 0, dx: 0, dy: 0, dz: 0}), back = viewUnder(lens, contract, written);
  assert.ok(Math.abs(back.yaw - 9) < 1e-9); assert.ok(written.yaw > 22 && written.yaw < 23, `9 degrees under the lens is ${written.yaw.toFixed(2)} as written`);
});

test('the same plan and the same card: card plan, game, drawn card at rest and the scene\'s projection give one outline', () => {
  for (const plan of [testPlan(), testPlan(0.9), testPlan(0.96), testPlan(0.8), testPlan(null, 15)]) for (const id of TARGETS) {
    const w = ways(plan, id), what = `${id} at Perspektiv ${plan.tableProjection?.perspective ?? 'the plan\'s own'}, heading ${plan.tableProjection?.heading}`;
    outlines(w.game, w.lab, `game, ${what}`, 1e-9); outlines(w.rest, w.lab, `drawn card at rest, ${what}`); outlines(w.scene, w.lab, `scene, ${what}`);
  }
  // and it is the rule the lab had: a real card, 63 x 88 mm, at the card's own place (the outline's sides on the felt)
  const plan = testPlan(0.96), q = planCardQuad(plan, 'P2.C1', 'native').map(planToFilm).map(p => pixelToFelt(p)!), side = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  assert.ok(Math.abs(side(q[0], q[1]) - CARD.width) < 1e-4 && Math.abs(side(q[1], q[2]) - CARD.height) < 1e-4);
});

test('when the camera changes, all of them change together', () => {
  const plan = testPlan(0.9), lenses: Lens[] = [lensForFocal(SEAT_FOUR_CARD, 1270), lensForFocal(SEAT_FOUR_CARD, 3200), {...TABLE_LENS, height: 1.3}, {...TABLE_LENS, pitch: 0.5, focalPx: 2000}];
  for (const lens of lenses) {
    let moved = 0;
    for (const id of TARGETS) { const w = ways(plan, id, lens), what = `${id} under focal ${Math.round(lens.focalPx)}, height ${lens.height.toFixed(2)}`;
      outlines(w.game, w.lab, `game, ${what}`, 1e-9); outlines(w.rest, w.lab, `drawn card at rest, ${what}`); outlines(w.scene, w.lab, `scene, ${what}`);
      moved = Math.max(moved, ...w.lab.map((p, i) => dist(p, ways(plan, id).lab[i]))); }
    assert.ok(moved > 2, 'another lens draws another card somewhere on the table');
  }
});

test('when the picture\'s size changes, all of them change together', () => {
  const plan = testPlan();
  // the plan's own view is 1762 wide and the film 1764: one conversion, and the game uses it
  for (const p of [{x: 0, y: 0}, {x: 1761, y: 1173}, {x: 412.3, y: 977.1}]) { assert.ok(dist(planToFilm(p), inFrame(p, FILM, VIEWS.native)) < 1e-9); assert.ok(dist(filmToPlan(planToFilm(p)), p) < 1e-9); }
  for (const frame of [{width: 882, height: 587}, {width: 1762, height: 1174}, {width: 1280, height: 852}, {width: 3528, height: 2348}]) for (const id of ['P1.C1', 'P4.C1', 'P4.C2', 'P7.C1', 'D.C1', 'D.C2']) {
    const w = ways(plan, id), to = (q: Pixel[]) => q.map(p => inFrame(p, frame)), k = (frame.width - 1) / (FILM.width - 1);
    outlines(to(w.game), to(w.lab), `game, ${id} at ${frame.width}`, TOLERANCE * k); outlines(to(w.rest), to(w.lab), `rest, ${id} at ${frame.width}`, TOLERANCE * k); outlines(to(w.scene), to(w.lab), `scene, ${id} at ${frame.width}`, TOLERANCE * k);
    // the card keeps its proportions: its sides against the picture's width are the same in every size
    const wide = (q: Pixel[], width: number) => dist(q[2], q[3]) / (width - 1);
    assert.ok(Math.abs(wide(to(w.game), frame.width) - wide(w.lab, FILM.width)) < 1e-9, `${id}: the near edge is the same share of the picture at ${frame.width}`);
  }
});

test('extra cards, split hands and the dealer\'s third card go the same way: a real card at the place the game makes up', () => {
  const plan = testPlan(0.9), layout = createLayout(plan, {geometry: 'lens'}), shape = planShape(plan), scene = planScene(sceneOf(contract), plan);
  const slots: Slot[] = [{owner: 'P', seat: 4, hand: 0, hands: 1, index: 2}, {owner: 'P', seat: 4, hand: 0, hands: 1, index: 4}, {owner: 'P', seat: 4, hand: 1, hands: 2, index: 0}, {owner: 'P', seat: 1, hand: 2, hands: 3, index: 1},
    {owner: 'P', seat: 7, hand: 1, hands: 2, index: 3}, {owner: 'D', seat: 0, hand: 0, hands: 1, index: 2}, {owner: 'D', seat: 0, hand: 0, hands: 1, index: 4}];
  for (const slot of slots) {
    const q = layout.quad(slot), at = cardPlace(q, shape)!, what = slotLabel(slot);
    // the plan's shape undone, the outline is a card of 63 x 88 mm on the felt, lying as every other card of the table
    const real = q.map(p => ({x: at.place.x + (p.x - at.place.x) / (1 - shape * (Math.max(...q.map(c => c.y)) - p.y)), y: p.y})).map(p => pixelToFelt(p)!), side = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    assert.ok(Math.abs(side(real[0], real[1]) - CARD.width) < 1e-6 && Math.abs(side(real[1], real[2]) - CARD.height) < 1e-6, `${what} is a real card`);
    assert.ok(Math.abs(at.heading - headingOf(plan)) < 1e-6 && !at.turned && !at.mirrored, `${what} lies as the table's cards lie`);
    // and it is the rule at that place, as a card of the plan has it; the drawn card at rest is the same outline
    outlines(q, planCardFrom(q, shape)!.quad, `${what}, the rule at its place`); outlines(restingQuad(scene, q, 1).quad, q, `${what}, drawn at rest`);
  }
  // the first hand of a split keeps the seat's own place and outline
  outlines(layout.quad({owner: 'P', seat: 4, hand: 0, hands: 2, index: 0}), layout.quad(slotOfTarget('P4.C1')), 'P4.H1.C1', 1e-6);
});

test('card one lies unchanged when card two comes, and after a third card and a split', () => {
  const plan = testPlan(0.9), records = [1, 5, 9, 13].map(shoeDraw => ({shoeDraw, target: 'P4', r: '7', s: 'hearts'}));
  for (const geometry of ['contract', 'lens'] as const) {
    const layout = createLayout(plan, {geometry}), scene = geometry === 'lens' ? planScene(sceneOf(contract), plan) : sceneOf(contract)!;
    const lying = (table: TableCards, cards: number[]) => placedCards(table, records, cards, layout);
    const one = lying({hands: [{seat: 4, cards: [1]}], dealer: []}, [1]), two = lying({hands: [{seat: 4, cards: [1, 5]}], dealer: [3]}, [1, 5]), three = lying({hands: [{seat: 4, cards: [1, 5, 9]}], dealer: [3, 7]}, [1, 5, 9]);
    const split = lying({hands: [{seat: 4, cards: [1, 9]}, {seat: 4, cards: [5, 13]}], dealer: [3, 7]}, [1, 5, 9, 13]);
    assert.equal(one[0].target, 'P4.C1'); assert.deepEqual(two.map(p => p.target), ['P4.C1', 'P4.C2']); assert.deepEqual(split.map(p => p.target), ['P4.H1.C1', 'P4.H2.C1', 'P4.H1.C2', 'P4.H2.C2']);
    assert.deepEqual(two[0].quad, one[0].quad, `${geometry}: card one's place when card two lies there too`); assert.deepEqual(three[0].quad, one[0].quad); assert.deepEqual(three[1].quad, two[1].quad, 'and card two when card three comes');
    outlines(split[0].quad, one[0].quad, `${geometry}: card one after the split`, 1e-6);
    // what is drawn: the lying card of a later film is the card the dealt one came to rest as, at every card size
    for (const scale of [1, 1.2, 1.65]) {
      const drawn = (p: {quad: Pixel[]}) => restingQuad(scene, p.quad, scale).quad;
      outlines(drawn(two[0]), drawn(one[0]), `${geometry}, size ${scale}: card one as drawn`, 0); outlines(drawn(three[0]), drawn(one[0]), `${geometry}, size ${scale}`, 0);
      const land = one[0].quad, c = {x: land.reduce((s, p) => s + p.x, 0) / 4, y: land.reduce((s, p) => s + p.y, 0) / 4}, film = [[-41, -36], [41, -36], [41, 36], [-41, 36]].map(([x, y]) => [c.x + x + 6, c.y + y - 4]);
      const track: CardTrack = {width: 1764, height: 1174, edgeWindow: null, restFrom: 20, restQuad: film, frames: Array.from({length: 30}, (_, i) => ({frame: i, side: i < 8 ? 'BACK' as const : 'FRONT' as const, quad: i >= 20 ? film : film.map(([x, y]) => [x + (20 - i) * 9, y - (20 - i) * 6]), edge: null, confidence: 0.9}))};
      outlines(poseAt(track, scene, 25, scale, 12, null, land)!.quad!, drawn(one[0]), `${geometry}, size ${scale}: the dealt card at rest is the lying card of the next film`, 1e-6);
    }
  }
});

test('the game sends the layout gloss for a split hand and a third card', () => {
  const plan = testPlan(0.9);
  plan.targets['P4.C1'].material.gloss = 0;
  plan.targets['P4.C2'].material.gloss = 0.83;
  const layout = createLayout(plan, {geometry: 'lens'});
  const cards = [1, 5, 9].map(shoeDraw => ({shoeDraw, target: 'P4', r: '7', s: 'hearts'}));
  for (const {hands, shoeDraw, slot, target, gloss} of [
    {hands: [{seat: 4, cards: [1]}, {seat: 4, cards: [5, 9]}], shoeDraw: 1, slot: {owner: 'P', seat: 4, hand: 0, hands: 2, index: 0}, target: 'P4.H1.C1', gloss: 0},
    {hands: [{seat: 4, cards: [1, 5, 9]}], shoeDraw: 9, slot: {owner: 'P', seat: 4, hand: 0, hands: 1, index: 2}, target: 'P4.C3', gloss: 0.83},
  ] as const) {
    assert.equal(plan.targets[target], undefined, 'a lookup by the dynamic target cannot supply the gloss');
    const table = {hands: hands.map(hand => ({seat: hand.seat, cards: [...hand.cards]})), dealer: []};
    const [placed] = placedCards(table, cards, [shoeDraw], layout);
    const moving = cardOptions({own: {shoeDraw, slot, label: slotLabel(slot)}, lying: []}, table, cards, layout);
    assert.deepEqual([placed.target, placed.gloss], [target, gloss]);
    assert.deepEqual([moving.target, moving.gloss], [target, gloss]);
  }
});

test('the drawn card by the plan\'s rule: size 1 is the plan\'s own outline, another size is that many times a real card at the same place', () => {
  const plan = testPlan(0.9), shape = planShape(plan), scene = planScene(sceneOf(contract), plan), lab = planCardQuad(plan, 'P2.C1', 'native').map(planToFilm), place = cardPlace(lab, shape)!;
  assert.ok(dist(place.place, planToFilm({x: plan.targets['P2.C1'].geometry.native.u * 1761, y: (1 - plan.targets['P2.C1'].geometry.native.v) * 1173})) < 1e-6, 'the outline\'s place is the plan\'s place');
  // from whichever corner the outline is listed, and the other way round, the card is the same card (turned says which corner is its first)
  for (let turn = 0; turn < 4; turn++) for (const mirror of [false, true]) {
    const listed = (mirror ? [lab[1], lab[0], lab[3], lab[2]] : lab).map((_, i, q) => q[(i + turn) % 4]), back = restingQuad(scene, listed, 1);
    assert.equal(back.turned, turn % 2 === 1, `listed from corner ${turn}${mirror ? ', mirrored' : ''}`);
    for (const p of back.quad) assert.ok(lab.some(q => dist(p, q) < TOLERANCE), 'every corner is a corner of the plan\'s outline');
    assert.equal(cardPlace(back.quad, shape)!.turned, false, 'and its first side is one of the card\'s short ones (on the felt; in the picture the long sides are foreshortened)');
  }
  for (const scale of [0.8, 1.2, 1.38, 2]) {
    const q = restingQuad(scene, lab, scale).quad, at = cardPlace(q, shape)!, near = Math.max(...q.map(p => p.y));
    assert.ok(dist(at.place, place.place) < TOLERANCE, `size ${scale}: the card stays on its place`);
    const felt = q.map(p => ({x: at.place.x + (p.x - at.place.x) / (1 - shape * (near - p.y)), y: p.y})).map(p => pixelToFelt(p)!), side = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    assert.ok(Math.abs(side(felt[0], felt[1]) - CARD.width * scale) < 1e-5 && Math.abs(side(felt[1], felt[2]) - CARD.height * scale) < 1e-5, `size ${scale}: ${scale} times a real card`);
  }
  // a plan drawn card by card has no lens: the outline it is given is the card, enlarged about its middle
  const own = setTableProjection(plan, {mode: 'individual', heading: 0}), stored = planCardAt(own, own.targets['P3.C1'].geometry.native, 'native').map(planToFilm);
  outlines(stored, quad(own.targets['P3.C1'].geometry.native, 'native').map(planToFilm), 'the plan\'s own rule', 0);
  outlines(restingQuad(planScene(null, own), stored, 1).quad, stored, 'individual, size 1', 1e-9);
  const twice = restingQuad(planScene(null, own), stored, 2).quad; assert.ok(Math.abs(dist(twice[0], twice[1]) - 2 * dist(stored[0], stored[1])) < 1e-9);
});

test('the same settings give the same picture under the lens: a framing written for the contract\'s camera', () => {
  const written = cameraFromContract(contract), camera = lensCamera(TABLE_LENS, EDGE_ROW), rad = Math.PI / 180;
  assert.deepEqual(viewUnder(written, written, {yaw: 12, pitch: -8, dx: 0.1, dy: 0.2, dz: -0.3}), {yaw: 12, pitch: -8, dx: 0.1, dy: 0.2, dz: -0.3});
  const v = viewUnder(camera, written, {yaw: 12, pitch: -8, dx: 0.1, dy: 0.2, dz: -0.3});
  // a turn moves the film frame as far in the picture: the game's lying framing (pitch -8) is 3 degrees under the lens
  assert.ok(Math.abs(camera.focalPx * Math.tan(v.pitch * rad) - written.focalPx * Math.tan(-8 * rad)) < 1e-9); assert.ok(Math.abs(v.pitch + 3.05) < 0.01, `pitch ${v.pitch.toFixed(3)}`);
  assert.ok(Math.abs(camera.focalPx * Math.tan(v.yaw * rad) - written.focalPx * Math.tan(12 * rad)) < 1e-9);
  // a move keeps its length in dealer metres: the contract's world is twice the dealer's
  assert.ok(Math.abs(v.dx - 0.05) < 1e-12 && Math.abs(v.dy - 0.1) < 1e-12 && Math.abs(v.dz + 0.15) < 1e-12);
});

test('Kortens storlek is a share of the plan\'s card in both geometries: the scene\'s default is a real card under the lens', () => {
  assert.equal(cardGrow(PLAN_CARD_SIZE, 'lens'), 1); assert.equal(cardGrow(1.65, 'lens'), 1.65 / PLAN_CARD_SIZE); assert.equal(cardGrow(PLAN_CARD_SIZE, 'contract'), PLAN_CARD_SIZE); assert.equal(cardGrow(2, 'contract'), 2);
  // so the game's card at its default size is the outline the lab's Kortplan draws
  const plan = testPlan(0.9), layout = createLayout(plan, {geometry: 'lens'}), scene = planScene(sceneOf(contract), plan);
  for (const id of ['P1.C1', 'P4.C1', 'P6.C2', 'D.C2']) outlines(restingQuad(scene, layout.quad(slotOfTarget(id)), cardGrow(PLAN_CARD_SIZE, 'lens')).quad, planCardQuad(plan, id, 'native').map(planToFilm), id);
  // and by the contract the same setting is the older plan's outline at seat 4 within a twentieth (why 1.2 was the default)
  const older = createLayout(plan, {geometry: 'contract'}).quad(slotOfTarget('P4.C1')), drawn = restingQuad(sceneOf(contract)!, older, cardGrow(PLAN_CARD_SIZE, 'contract')).quad, wide = (q: Pixel[]) => Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
  near(wide(drawn) / wide(older), 1, 0.05, 'the contract\'s card at 1.2 against the older plan\'s card at seat 4');
});
