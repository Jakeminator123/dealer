// Offline checks of the scene geometry on synthetic data: a known camera must come back out of
// the cards it projects, and a projected card must keep the 63 x 88 mm shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import {type Camera, type CardObservation, type CardPose, type Pt, CARD_MM, V6_PORTRAIT, applyH, cameraHomography, cameraProject, cardCorners, decomposeHomography, fitCardPose, fitPlane,
  homographyFromPoints, horizon, horizonRotation, inv3, mapPoint, mul3, principalXFromHomography, projectCard, quadOnPlane, quadShape, quadVisibility, reframe, reframePose, seededRandom} from '../src/scene-geometry.ts';

const image = {width: 1764, height: 1174};
const camera: Camera = {focalPx: 1500, cx: 881.5, cy: 586.5, pitchDeg: 38, rollDeg: 0.8, yawDeg: 2.5, heightMm: 650, x: 40, y: -820};
const poses: CardPose[] = [{x: 0, y: 0, heading: 0}, {x: -520, y: 90, heading: 6}, {x: 480, y: 140, heading: -9}, {x: 30, y: 260, heading: 2}, {x: -250, y: -40, heading: 15}];
const near = (actual: number, expected: number, tolerance: number, label: string) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} differs from ${expected} by more than ${tolerance}`);
const observe = (H: number[], noise = 0, seed = 7): CardObservation[] => { const random = seededRandom(seed); return poses.map((pose, i) => ({id: `card${i}`, corners: projectCard(H, pose).map(p => ({x: p.x + noise * random.gaussian(), y: p.y + noise * random.gaussian()}))})); };

test('matrix helpers invert and a four-point homography is exact', () => {
  const H = cameraHomography(camera), I = mul3(H, inv3(H));
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => near(I[i], v, 1e-9, `identity[${i}]`));
  const from = cardCorners({x: 0, y: 0, heading: 0}), to = from.map(p => applyH(H, p)), G = homographyFromPoints(from, to);
  for (const p of [{x: 300, y: -120}, {x: -640, y: 410}]) { const a = applyH(H, p), b = applyH(G, p); near(b.x, a.x, 1e-6, 'x'); near(b.y, a.y, 1e-6, 'y'); }
});

test('table homography agrees with the full camera projection on the plane', () => {
  const H = cameraHomography(camera);
  for (const p of [{x: 0, y: 0}, {x: -400, y: 250}, {x: 610, y: -90}]) { const a = applyH(H, p), b = cameraProject(camera, {...p, z: 0}); near(a.x, b.x, 1e-9, 'x'); near(a.y, b.y, 1e-9, 'y'); }
  const up = cameraProject(camera, {x: 0, y: 0, z: 50}), base = cameraProject(camera, {x: 0, y: 0, z: 0});
  assert.ok(up.y < base.y, 'a point above the table must appear higher in the image');
});

test('a known camera projecting known cards is recovered', () => {
  const H = cameraHomography(camera), fit = fitPlane(observe(H));
  assert.ok(fit.residualRms < 1e-6, `reprojection ${fit.residualRms}`);
  fit.cards.forEach((card, i) => { near(card.pose.x, poses[i].x, 1e-4, 'pose x'); near(card.pose.y, poses[i].y, 1e-4, 'pose y'); near(card.pose.heading, poses[i].heading, 1e-5, 'heading'); });
  const found = decomposeHomography(fit.H, image, {x: camera.cx, y: camera.cy}); assert.ok(found);
  near(found.focalPx, camera.focalPx, 0.01, 'focal'); near(found.camera.pitchDeg, camera.pitchDeg, 1e-4, 'pitch'); near(found.camera.rollDeg, camera.rollDeg, 1e-4, 'roll'); near(found.camera.yawDeg, camera.yawDeg, 1e-4, 'yaw');
  near(found.camera.heightMm, camera.heightMm, 0.01, 'height'); near(found.camera.x, camera.x, 0.01, 'camera x'); near(found.camera.y, camera.y, 0.01, 'camera y');
  near(found.focalFromEqualLength!, camera.focalPx, 0.01, 'focal from equal length'); near(found.focalFromOrthogonality!, camera.focalPx, 0.5, 'focal from orthogonality'); near(found.axisAngleDeg, 90, 1e-6, 'axis angle');
  near(found.horizontalFovDeg, 2 * Math.atan(image.width / 3000) * 180 / Math.PI, 1e-3, 'fov');
  // The rebuilt camera must reproduce the plane it came from.
  const again = cameraHomography(found.camera); again.forEach((v, i) => near(v, fit.H[i], 1e-6 * Math.max(1, Math.abs(fit.H[i])), `H[${i}]`));
});

test('half-pixel corner noise moves the plane by a bounded amount', () => {
  const H = cameraHomography(camera), fit = fitPlane(observe(H, 0.5));
  assert.ok(fit.residualRms < 1.2, `noisy reprojection ${fit.residualRms}`);
  // Compared in the image, where the choice of table origin and heading does not matter.
  fit.cards.forEach((card, i) => projectCard(H, poses[i]).forEach((p, k) => { const d = Math.hypot(card.projected[k].x - p.x, card.projected[k].y - p.y); assert.ok(d < 1.5, `card ${i} corner ${k} is ${d} px from the true corner`); }));
  const found = decomposeHomography(fit.H, image, {x: camera.cx, y: camera.cy}); assert.ok(found);
  near(found.camera.pitchDeg, camera.pitchDeg, 3, 'pitch under noise'); assert.ok(Math.abs(found.focalPx / camera.focalPx - 1) < 0.2, `focal under noise ${found.focalPx}`);
});

test('a projected card has the right size and aspect', () => {
  const H = cameraHomography(camera);
  for (const pose of poses) { const back = quadOnPlane(H, projectCard(H, pose)); near(back.widthMm, 63, 1e-7, 'width'); near(back.heightMm, 88, 1e-7, 'height'); back.cornerAnglesDeg.forEach(a => near(a, 90, 1e-6, 'corner angle')); near(back.centreMm.x, pose.x, 1e-7, 'centre x'); }
  const overhead = cameraHomography({focalPx: 1200, cx: 881.5, cy: 586.5, pitchDeg: 90, rollDeg: 0, yawDeg: 0, heightMm: 900, x: 0, y: 0}), shape = quadShape(projectCard(overhead, {x: 0, y: 0, heading: 0}));
  near(shape.farWidth / shape.leftSide, CARD_MM.width / CARD_MM.height, 1e-9, 'overhead aspect'); near(shape.taper, 1, 1e-9, 'overhead taper'); near(shape.farWidth, 63 * 1200 / 900, 1e-9, 'overhead scale');
  // Seen obliquely the far edge is the shorter one and the card looks lower than it is wide in millimetres.
  const oblique = quadShape(projectCard(H, {x: 0, y: 0, heading: 0})); assert.ok(oblique.taper < 1 && oblique.depth / oblique.nearWidth < 88 / 63);
});

test('a card with a hidden side still fixes its pose, and the plane still fits', () => {
  const H = cameraHomography(camera), full = observe(H), hidden: CardObservation[] = full.map((card, i) => ({...card, sides: [0, 1, 2, 3].map(k => i === 2 && k === 0 ? null : {a: card.corners[k], b: card.corners[(k + 1) % 4]})}));
  const fit = fitPlane(hidden); assert.ok(fit.residualRms < 1e-6, `reprojection ${fit.residualRms}`);
  near(fit.cards[2].pose.x, poses[2].x, 1e-3, 'hidden-side pose x'); assert.equal(fit.cards[2].cornerErrors[0], null); assert.equal(fit.cards[2].cornerErrors[1], null);
  const one = fitCardPose(H, hidden[2]); near(one.pose.y, poses[2].y, 1e-3, 'pose from three sides'); near(one.pose.heading, poses[2].heading, 1e-4, 'heading from three sides');
});

test('the level-rows model recovers a camera without roll and rejects one with roll', () => {
  const square = {...camera, rollDeg: 0, yawDeg: 0}, H = cameraHomography(square), level = fitPlane(observe(H), {levelRows: true});
  assert.equal(level.model, 'LEVEL_ROWS'); assert.ok(level.residualRms < 1e-6, `level reprojection ${level.residualRms}`); near(level.H[3], 0, 1e-12, 'rows stay level'); near(level.H[6], 0, 1e-15, 'X has no perspective term');
  const found = decomposeHomography(level.H, image, {x: square.cx, y: square.cy})!; near(found.focalPx, square.focalPx, 0.01, 'focal'); near(found.camera.pitchDeg, square.pitchDeg, 1e-4, 'pitch'); near(found.camera.heightMm, square.heightMm, 0.01, 'height');
  near(level.cards[0].pose.heading, 0, 1e-5, 'first card heading'); near(level.cards[2].pose.x, poses[2].x, 1e-3, 'pose x');
  const rolled = fitPlane(observe(cameraHomography({...camera, rollDeg: 3, yawDeg: 0})), {levelRows: true}); assert.ok(rolled.residualRms > 0.15, `a rolled camera must not fit level rows, rms ${rolled.residualRms}`);
  // A start given in another table frame (shifted origin) must lead to the same plane in the image.
  const shift = {x: 120, y: -60}, moved = {H: reframe(H, shift, 0), poses: poses.map(p => reframePose(p, shift, 0))}, seeded = fitPlane(observe(H, 0.4, 3), {levelRows: true, initial: moved}), plain = fitPlane(observe(H, 0.4, 3), {levelRows: true});
  near(seeded.residualRms, plain.residualRms, 1e-6, 'seeded and unseeded fits agree'); seeded.cards.forEach((c, i) => c.projected.forEach((p, k) => near(p.x, plain.cards[i].projected[k].x, 1e-3, 'seeded projection')));
});
test('the table frame can be turned so that X runs parallel to the horizon', () => {
  const H = cameraHomography(camera), turn = horizonRotation(H), R = reframe(H, {x: 0, y: 0}, turn);
  near(R[6], 0, 1e-12, 'X has no perspective term'); assert.ok(applyH(R, {x: 100, y: 0}).x > applyH(R, {x: 0, y: 0}).x, 'X points toward image right');
  assert.ok(applyH(R, {x: 0, y: 100}).y < applyH(R, {x: 0, y: 0}).y, 'Y points away from the camera');
  const pose = reframePose(poses[1], {x: 0, y: 0}, turn), a = projectCard(H, poses[1]), b = projectCard(R, pose); a.forEach((p, i) => { near(b[i].x, p.x, 1e-8, 'reframed x'); near(b[i].y, p.y, 1e-8, 'reframed y'); });
  const line = horizon(H, camera.cx), expected = camera.cy - camera.focalPx * Math.tan(camera.pitchDeg * Math.PI / 180) / Math.cos(camera.rollDeg * Math.PI / 180);
  near(line.y, expected, 1e-6, 'horizon height'); near(line.slopeDeg, -camera.rollDeg, 1e-9, 'horizon slope');
});

test('the principal point column is found when it is not the image centre', () => {
  const shifted = {...camera, cx: 852}, H = cameraHomography(shifted), cx = principalXFromHomography(H, image, shifted.cy);
  assert.ok(cx !== null); near(cx, 852, 1e-4, 'principal x');
  const wrong = decomposeHomography(H, image)!, right = decomposeHomography(H, image, {x: cx, y: shifted.cy})!;
  near(right.focalPx, shifted.focalPx, 0.01, 'focal with the found column'); assert.ok(Math.abs(wrong.axisAngleDeg - 90) > Math.abs(right.axisAngleDeg - 90), 'a wrong principal point shows as non-perpendicular axes');
});

test('an affine map has no finite focal length', () => {
  assert.equal(decomposeHomography([1.1, 0.1, 800, 0, -0.7, 1100, 0, 0, 1], image), null);
});

test('V6 portrait transform places and clips native points', () => {
  const left = mapPoint(V6_PORTRAIT, {x: 250 * 1762 / 1586, y: 0}); near(left.x, 0, 1e-9, 'crop left'); near(left.y, 80, 1e-9, 'top offset');
  const box = (x: number): Pt[] => [{x, y: 1000}, {x: x + 60, y: 1000}, {x: x + 60, y: 1050}, {x, y: 1050}];
  assert.equal(quadVisibility(V6_PORTRAIT, box(800)).state, 'INSIDE'); assert.equal(quadVisibility(V6_PORTRAIT, box(250)).state, 'PARTLY_CUT'); assert.equal(quadVisibility(V6_PORTRAIT, box(100)).state, 'OUTSIDE');
  near(quadVisibility(V6_PORTRAIT, box(250)).overflow.left, 250 - 250 * 1586 / 1762, 1e-9, 'pixels lost on the left');
});
