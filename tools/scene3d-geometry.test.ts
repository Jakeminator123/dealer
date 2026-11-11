import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEALER_LENS_ESTIMATE, FILM, aimCorrection, cameraFromContract, cardSpots, filmToTable, solveCamera, tableToFilm, viewFovDeg, type FilmCamera} from '../src/scene3d-geometry.ts';

const contract = JSON.parse(await readFile('data/scene-contract.json', 'utf8')), plan = JSON.parse(await readFile('placements/default.json', 'utf8'));
const near = (actual: number, expected: number, tolerance: number, what: string) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} mot ${expected} ± ${tolerance}`);

test('the contract gives the plan camera, in its own figures', () => {
  const c = cameraFromContract(contract), k = contract.keyFigures, s = solveCamera(c);
  assert.equal(c.source, 'contract'); assert.equal(c.focalPx, k.focalPx.value); assert.equal(c.edgeRow, k.dealerEdgeImageRow.value); assert.equal(c.heightM, k.heightAboveFeltMm.value / 1000);
  near(s.pitch * 180 / Math.PI, k.tiltDownDeg.value, 1e-9, 'lutning');
  near(s.fovYDeg, 2 * Math.atan(FILM.height / 2 / c.focalPx) * 180 / Math.PI, 1e-9, 'bildvinkel');
  assert.ok(c.scale >= 1 && c.scale <= 3, 'skalan k ligger i kontraktets intervall');
  // The centred pinhole reproduces the contract's own distance and view angle at P4.C1 (image row 1099.09 on the centre column) within its stated range.
  const [, row] = contract.keyFigures.homographyTableMmToImagePx.matrix, p4 = filmToTable(c, (FILM.width - 1) / 2, row[2])!;
  const [lo, hi] = k.distanceToP4C1AlongFeltMm.range; assert.ok(-p4.z * 1000 >= lo && -p4.z * 1000 <= hi, `avstånd till P4.C1 ${-p4.z * 1000} mm`);
  near(Math.atan2(c.heightM, -p4.z) * 180 / Math.PI, k.viewAngleAtP4C1Deg.value, 0.5, 'siktvinkel vid P4.C1');
});

test('a broken contract is refused instead of guessed', () => {
  assert.throws(() => cameraFromContract({}), /keyFigures\.focalPx/);
  assert.throws(() => cameraFromContract({keyFigures: {...contract.keyFigures, heightAboveFeltMm: {value: 'hög'}}}), /heightAboveFeltMm/);
  assert.equal(cameraFromContract({keyFigures: contract.keyFigures}).scale, 1);
});

test('film pixels and table points map both ways', () => {
  for (const c of [cameraFromContract(contract), DEALER_LENS_ESTIMATE]) {
    const {edgeDistance} = solveCamera(c);
    for (const [px, py] of [[0, 900], [881.5, 831.5], [1763, 1173], [218, 998], [852.5, 1099.1]]) {
      const p = filmToTable(c, px, py)!, back = tableToFilm(c, p.x, p.z); near(back.x, px, 1e-6, 'x'); near(back.y, py, 1e-6, 'y');
    }
    near(filmToTable(c, 400, c.edgeRow)!.z, -edgeDistance, 1e-9, 'bordskantsraden ligger på bordskanten');
    assert.equal(filmToTable(c, 800, c.horizonRow - 1), null); assert.equal(filmToTable(c, 800, c.horizonRow), null);
    assert.ok(filmToTable(c, 100, 1000)!.x < 0 && filmToTable(c, 1700, 1000)!.x > 0);
  }
});

test('the view shows the whole film frame at zoom 1', () => {
  const c = cameraFromContract(contract), film = FILM.width / FILM.height;
  near(viewFovDeg(c, film), solveCamera(c).fovYDeg, 1e-9, 'filmens eget format');
  near(viewFovDeg(c, 3), solveCamera(c).fovYDeg, 1e-9, 'bredare duk behåller höjden');
  near(Math.tan(viewFovDeg(c, 9 / 16) * Math.PI / 360) * (9 / 16), FILM.width / 2 / c.focalPx, 1e-9, 'porträtt behåller bredden');
  assert.ok(viewFovDeg(c, film, 2) < viewFovDeg(c, film));
});

test('aim correction keeps the pivot in place and is zero without a move', () => {
  const zero = aimCorrection([0, 0.5, 0], [0, 0.5, 0], [0, 0.3, -1.5]); assert.equal(zero.yaw, 0); assert.equal(zero.pitch, 0);
  const right = aimCorrection([0, 0.5, 0], [0.3, 0.5, 0], [0, 0.3, -1.5]); assert.ok(right.yaw > 0, 'kameran flyttad åt höger vrids åt vänster'); near(right.yaw, Math.atan2(0.3, 1.5), 1e-12, 'vridning');
  assert.ok(aimCorrection([0, 0.5, 0], [0, 0.8, 0], [0, 0.3, -1.5]).pitch < 0, 'högre kamera tittar mer nedåt');
});

test('the plan gives sixteen card places on the felt, in seat order', () => {
  const c = cameraFromContract(contract), spots = cardSpots(plan, c), seat = (n: number) => spots.find(p => p.id === `P${n}.C1`)!;
  assert.equal(spots.length, Object.keys(plan.targets).length);
  for (let n = 1; n < 7; n++) assert.ok(seat(n).x < seat(n + 1).x, `P${n} ligger till vänster om P${n + 1}`);
  near(seat(4).x, 0, 0.05, 'P4 ligger mitt framför dealern');
  for (const p of spots) { assert.ok(p.s > 0 && p.s < 0.6, `${p.id} ligger på filten framför dealern`); const back = tableToFilm(c, p.x * c.scale, p.s * c.scale - solveCamera(c).edgeDistance), n = plan.targets[p.id].geometry.native; near(back.x, n.u * (FILM.width - 1), 1e-6, p.id); near(back.y, (1 - n.v) * (FILM.height - 1), 1e-6, p.id); }
  assert.deepEqual(cardSpots(null, c), []);
  const twice: FilmCamera = {...c, scale: c.scale * 2}; near(cardSpots(plan, twice)[0].x, spots[0].x / 2, 1e-12, 'skalan delar bordets mått');
});

test('a film pixel lands on the felt below the dealer edge and on the dealer plane above it', async () => {
  const {filmToScene} = await import('../src/scene3d-geometry.ts'), c = cameraFromContract(contract), {edgeDistance} = solveCamera(c);
  const card = filmToScene(c, 852.5, 1099.1); assert.equal(card[1], 0); assert.ok(card[2] > -edgeDistance && card[2] < 0);
  const face = filmToScene(c, 881.5, 215); near(face[2], -edgeDistance, 1e-12, 'ansiktet ligger på dealerplanet'); assert.ok(face[1] > c.heightM, 'ansiktet ligger över kamerans höjd i planens kamera');
  const seamAbove = filmToScene(c, 500, c.edgeRow - 1e-6), seamBelow = filmToScene(c, 500, c.edgeRow); for (let i = 0; i < 3; i++) near(seamAbove[i], seamBelow[i], 1e-6, 'vikningen är sammanhängande');
});

test('lens blur is zero inside the tolerance band and grows with distance from the focus', async () => {
  const {lensBlur} = await import('../src/scene3d-geometry.ts');
  assert.equal(lensBlur(1.5, 1.5, 0.3), 0); assert.equal(lensBlur(1.9, 1.5, 0.3), 0);
  assert.ok(lensBlur(4, 1.5, 0.3) < lensBlur(12, 1.5, 0.3)); near(lensBlur(1e9, 1.5, 0.3), 1, 1e-6, 'långt bort');
  // focus on a card at 0.77 m: the dealer at 1.52 m is a little soft, the room behind is fully soft
  assert.ok(lensBlur(1.52, 0.77, 0.3) > 0.2 && lensBlur(1.52, 0.77, 0.3) < 0.35); assert.ok(lensBlur(12, 0.77, 0.3) > 0.9);
  assert.ok(lensBlur(0.5, 1.5, 0.3) > 0, 'även det som ligger för nära blir oskarpt');
});

test('focus follows a card only while it is being dealt', async () => {
  const {cardFocusPixel, cardPixel} = await import('../src/scene3d-geometry.ts');
  const track = JSON.parse(await readFile('assets/tracking/pamela-p4-c1-plan-deal-02/card-track.json', 'utf8'));
  assert.equal(cardFocusPixel(track, 0), null, 'kortet vilar i skon'); assert.equal(cardFocusPixel(track, track.leavesShoe - 7), null);
  const moving = cardFocusPixel(track, 60)!; assert.ok(moving.x > 800 && moving.x < 950 && moving.y > 900 && moving.y < 1010, 'kortets mitt under vändningen');
  assert.deepEqual(cardFocusPixel(track, track.restFrom + 18), cardPixel(track, track.restFrom + 18)); assert.equal(cardFocusPixel(track, track.restFrom + 19), null, 'kortet ligger stilla');
  assert.equal(cardFocusPixel(null, 60), null); assert.equal(cardFocusPixel({frames: track.frames}, 60), null, 'utan uppgift om när kortet lämnar skon följs det inte');
  assert.equal(cardPixel({frames: [{frame: 3, quad: null, edge: [[10, 20], [30, 40]]}]}, 3)!.x, 20); assert.equal(cardPixel({frames: [{frame: 3, quad: null, edge: null}]}, 3), null);
});
