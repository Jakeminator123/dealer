import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BET, DEALER_LENS_ESTIMATE, FILM, aimCorrection, betSpots, cameraFromContract, cardSpots, filmToTable, sceneToSpot, solveCamera, spotToScene, tableToFilm, viewFovDeg, type FilmCamera} from '../src/scene3d-geometry.ts';

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
  // A made-up track in the shape of assets/tracking/<clip>/card-track.json (media is not in Git): the card rests in the
  // shoe, leaves it on frame 23, is edge-on on frame 53 and lies still from frame 96.
  const square = (x: number, y: number) => [[x - 30, y - 20], [x + 30, y - 20], [x + 30, y + 20], [x - 30, y + 20]];
  const track = {leavesShoe: 23, restFrom: 96, frames: Array.from({length: 120}, (_, frame) => frame === 53 ? {frame, quad: null, edge: [[850, 930], [890, 950]]}
    : {frame, quad: frame < 23 ? square(1290, 800) : frame < 96 ? square(1290 - (frame - 23) * 6, 800 + (frame - 23) * 4) : square(852, 1100), edge: null})};
  assert.equal(cardFocusPixel(track, 0), null, 'kortet vilar i skon'); assert.equal(cardFocusPixel(track, track.leavesShoe - 7), null);
  assert.deepEqual(cardFocusPixel(track, track.leavesShoe - 6), {x: 1290, y: 800}, 'sex rutor före skon följs kortet');
  assert.deepEqual(cardFocusPixel(track, 60), {x: 1290 - 37 * 6, y: 800 + 37 * 4}, 'kortets mitt under vändningen'); assert.deepEqual(cardFocusPixel(track, 53), {x: 870, y: 940}, 'kantläget ger linjens mitt');
  assert.deepEqual(cardFocusPixel(track, track.restFrom + 18), cardPixel(track, track.restFrom + 18)); assert.equal(cardFocusPixel(track, track.restFrom + 19), null, 'kortet ligger stilla');
  assert.equal(cardFocusPixel(null, 60), null); assert.equal(cardFocusPixel({frames: track.frames}, 60), null, 'utan uppgift om när kortet lämnar skon följs det inte');
  assert.equal(cardPixel({frames: [{frame: 3, quad: null, edge: [[10, 20], [30, 40]]}]}, 3)!.x, 20); assert.equal(cardPixel({frames: [{frame: 3, quad: null, edge: null}]}, 3), null);
});

test('clock hands and the flickering lamp follow the time alone', async () => {
  const {clockAngles, flickerLevel} = await import('../src/scene3d-geometry.ts'), turn = 2 * Math.PI;
  near(clockAngles(3, 0, 0).hour, turn / 4, 1e-12, 'klockan tre'); near(clockAngles(12, 30, 0).minute, turn / 2, 1e-12, 'halv'); near(clockAngles(15, 0, 0).hour, turn / 4, 1e-12, 'femton är tre');
  near(clockAngles(0, 0, 45).second, turn * 0.75, 1e-12, 'sekundvisaren'); assert.ok(clockAngles(3, 30, 0).hour > clockAngles(3, 0, 0).hour, 'timvisaren kryper');
  assert.equal(flickerLevel(12.3, 20, 0), 1); assert.equal(flickerLevel(12.3, 0, 0.6), 1); assert.equal(flickerLevel(NaN, 20, 0.6), 1);
  // in every period: one stretch of flicker, at most 1.2 s long, never below 1 - strength, and the same answer every time it is asked
  for (let slot = 0; slot < 40; slot++) { let first = -1, last = -1, lowest = 1;
    for (let i = 0; i < 2000; i++) { const t = slot * 20 + i * 0.01, level = flickerLevel(t, 20, 0.6); assert.equal(level, flickerLevel(t, 20, 0.6)); if (level < 1) { if (first < 0) first = i; last = i; lowest = Math.min(lowest, level); } }
    assert.ok(first >= 0, `period ${slot} har en blinkning`); assert.ok(last - first <= 121, `period ${slot}: ${last - first} hundradelar`); assert.ok(lowest >= 0.4 - 1e-9 && lowest < 0.95, `period ${slot}: lägst ${lowest}`); }
});

test('a passing cloud dims smoothly once per period', async () => {
  const {cloudLevel} = await import('../src/scene3d-geometry.ts');
  assert.equal(cloudLevel(5, 30, 0), 1); assert.equal(cloudLevel(5, 0, 0.5), 1);
  for (let slot = 0; slot < 30; slot++) { let first = -1, last = -1, lowest = 1, jump = 0, before = 1;
    for (let i = 0; i < 3000; i++) { const level = cloudLevel(slot * 30 + i * 0.01, 30, 0.5); if (level < 1) { if (first < 0) first = i; last = i; lowest = Math.min(lowest, level); } jump = Math.max(jump, Math.abs(level - before)); before = level; }
    assert.ok(last - first >= 290 && last - first <= 501, `period ${slot}: ${(last - first) / 100} s`); near(lowest, 0.5, 0.01, `period ${slot}: djupast`); assert.ok(jump < 0.02, `period ${slot}: mjuk, största steg ${jump}`); }
});

test('bet rings: one per player seat, in seat order, just past the first card', () => {
  for (const c of [cameraFromContract(contract), DEALER_LENS_ESTIMATE]) {
    const spots = cardSpots(plan, c), bets = betSpots(plan, c);
    assert.deepEqual(bets.map(b => b.id), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
    for (const bet of bets) { const first = spots.find(p => p.id === bet.id + '.C1')!; assert.equal(bet.x, first.x); near(bet.s - first.s, BET.offset, 1e-12, 'ringen ligger bortom kortet'); assert.equal(bet.radius, BET.radius); }
    assert.ok(bets[0].x < bets[3].x && bets[3].x < bets[6].x, 'P1 till vänster i bild, P7 till höger');
  }
  assert.deepEqual(betSpots(null, DEALER_LENS_ESTIMATE), []);
});

test('a rendered card is laid where the film camera sees the film card, on the film\'s own surfaces', async () => {
  const {squareToQuad, onSquare, cardPoint, filmPixel, filmToScene} = await import('../src/scene3d-geometry.ts'), c = cameraFromContract(contract), {edgeDistance} = solveCamera(c);
  // the P4 card lying still (pamela-p4-c1-plan-deal-02, restQuad): texture order, clockwise on screen
  const quad = [[817.5, 1069.5], [887.2, 1069.5], [891, 1133.5], [817.5, 1133.5]], H = squareToQuad(quad);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => { const [x, y] = onSquare(H, u, v); near(x, quad[i][0], 1e-9, `hörn ${i} x`); near(y, quad[i][1], 1e-9, `hörn ${i} y`); });
  // a projective map keeps straight lines: the middle of the card goes to where the quad's diagonals cross
  const [mx, my] = onSquare(H, 0.5, 0.5), cross = (a: number[], b: number[], p: number[]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  near(cross(quad[0], quad[2], [mx, my]), 0, 1e-6, 'mitten på diagonalen 0-2'); near(cross(quad[1], quad[3], [mx, my]), 0, 1e-6, 'mitten på diagonalen 1-3');
  // every point of the card projects back to its film pixel, lifted off the felt or not; on the felt it lies at the lift
  for (const [u, v] of [[0.5, 0.5], [0.1, 0.9], [1, 0]]) for (const lift of [0, 0.0004]) {
    const p = cardPoint(c, H, u, v, lift), back = filmPixel(c, p)!, [x, y] = onSquare(H, u, v);
    near(back.x, x, 1e-6, 'filmpixel x'); near(back.y, y, 1e-6, 'filmpixel y'); near(p[1], lift, 1e-12, 'höjd över filten');
  }
  // a card held up in front of the dealer, above the table edge row, lies on the dealer plane like her hand
  const high = squareToQuad([[1100, 640], [1150, 650], [1140, 760], [1090, 750]]), up = cardPoint(c, high, 0.5, 0.2, 0.0004);
  near(up[2], -edgeDistance, 1e-9, 'på dealerplanet'); const seen = filmPixel(c, up)!, [hx, hy] = onSquare(high, 0.5, 0.2); near(seen.x, hx, 1e-6, 'x'); near(seen.y, hy, 1e-6, 'y');
  // filmPixel is the inverse of the film's surfaces wherever they are
  for (const [px, py] of [[100, 900], [881.5, 831.5], [1600, 300]]) { const back = filmPixel(c, filmToScene(c, px, py))!; near(back.x, px, 1e-6, 'x'); near(back.y, py, 1e-6, 'y'); }
  assert.throws(() => squareToQuad([[0, 0], [10, 0], [20, 0], [30, 0]]), /Degenerate/);
});

test('an edge-on card is a thin quad along its line, clockwise on screen', async () => {
  const {edgeQuad} = await import('../src/scene3d-geometry.ts');
  for (const [a, b] of [[[950.9, 852.6], [842, 909.2]], [[842, 909.2], [950.9, 852.6]], [[0, 0], [0, 40]]]) {
    const q = edgeQuad(a, b, 1.5), area = q.reduce((s, p, i) => { const r = q[(i + 1) % 4]; return s + p[0] * r[1] - r[0] * p[1]; }, 0) / 2, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    assert.ok(area > 0, 'medurs på skärmen'); near(area, length * 3, 1e-6, 'linjens längd gånger bredden');
    const mid = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4]; near(mid[0], (a[0] + b[0]) / 2, 1e-9, 'mitt x'); near(mid[1], (a[1] + b[1]) / 2, 1e-9, 'mitt y');
  }
});

test('in the hand the card is the film card; it grows to the resting size while it settles', async () => {
  const {heldScale} = await import('../src/scene3d-geometry.ts'), held = 1 / 1.2;
  near(heldScale(0, held), held, 1e-12, 'i handen'); near(heldScale(1, held), 1, 1e-12, 'vilar'); near(heldScale(0.5, held), (held + 1) / 2, 1e-12, 'halvvägs');
  assert.equal(heldScale(-1, held), held); assert.equal(heldScale(2, held), 1); assert.equal(heldScale(0.3, 1), 1, 'utan egen storlek i handen följer den överlägget');
});

test('dealer metres and scene positions map both ways', () => {
  for (const c of [cameraFromContract(contract), DEALER_LENS_ESTIMATE]) {
    const {edgeDistance} = solveCamera(c), [x, y, z] = spotToScene(c, 0.3, 0.25, 0.01);
    near(x, 0.3 * c.scale, 1e-12, 'x'); near(y, 0.01 * c.scale, 1e-12, 'y'); near(z, 0.25 * c.scale - edgeDistance, 1e-12, 'z');
    const back = sceneToSpot(c, x, z); near(back.x, 0.3, 1e-12, 'x tillbaka'); near(back.s, 0.25, 1e-12, 's tillbaka');
    assert.deepEqual(spotToScene(c, 0, 0), [0, 0, -edgeDistance]); // the dealer-side edge
    // a card place laid on the felt by cardSpots is the same point the film shows there
    const spot = cardSpots(plan, c).find(p => p.id === 'P4.C1')!, [sx, , sz] = spotToScene(c, spot.x, spot.s), n = plan.plan?.targets?.['P4.C1']?.geometry?.native ?? plan.targets['P4.C1'].geometry.native, film = tableToFilm(c, sx, sz);
    near(film.x, n.u * (FILM.width - 1), 1e-6, 'filmpixel x'); near(film.y, (1 - n.v) * (FILM.height - 1), 1e-6, 'filmpixel y');
  }
});
