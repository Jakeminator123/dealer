// Offline tests for the rendered-card overlay model. No media, WebGL or network: tracks are made up
// here and the only file read is the tracked scene contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import fs from 'node:fs';
import {sceneOf, restingQuad, restOf, poseAt, cardToImage, projectionOf, regionOf, readMatte, filmZone, shiftShare, placedCard, landing, leakCount, strayBoxes, ranges, cardRecord, cardFace, CARD_RANKS, CARD_SUITS, MARGIN, STRAY, type CardRecord, overridesOf, cardInFront, describeTrack, RIM, plausible, keystone, skirtSound, turnOf, restFade, restShare, PLAUSIBLE, HOLD, REST_FADE, type CardTrack, type Scene} from '../src/card-overlay.ts';
import {signedArea, centre, dist, sound, type Pt} from '../src/card-track.ts';
import {cameraFromContract, solveCamera, squareToQuad, onSquare, filmToScene} from '../src/scene3d-geometry.ts';

const contract = JSON.parse(await readFile('data/scene-contract.json', 'utf8')), scene = sceneOf(contract)!;
const P4_FILM = [[817.5, 1069.5], [887.2, 1069.5], [891, 1133.5], [817.5, 1133.5]]; // resting quad of pamela-p4-c1-plan-deal-02
const pts = (q: number[][]): Pt[] => q.map(([x, y]) => ({x, y})), area = (q: Pt[]) => Math.abs(signedArea(q));
const shift = (q: number[][], dx: number, dy: number, s = 1) => { const c = centre(pts(q)); return q.map(([x, y]) => [c.x + (x - c.x) * s + dx, c.y + (y - c.y) * s + dy]); };
// A deal as the generator draws it: back up in the hand at twice the plan size, edge-on for two frames,
// face up and still large, shrunk to plan size in the last two frames before it lies still from frame 30.
function deal(): CardTrack {
  const frames: CardTrack['frames'] = [];
  for (let i = 0; i < 40; i++) {
    if (i === 14 || i === 15) frames.push({frame: i, side: 'EDGE', quad: null, edge: [[900, 900 + i], [840, 930 + i]], confidence: 0.5});
    else { const s = i >= 30 ? 1 : i === 29 ? 1.3 : i === 28 ? 1.7 : 2; frames.push({frame: i, side: i < 14 ? 'BACK' : 'FRONT', quad: i >= 30 ? P4_FILM : shift(P4_FILM, (30 - i) * 6, (i - 30) * 4, s), edge: null, confidence: 0.9}); }
  }
  return {width: 1764, height: 1174, frames, edgeWindow: [14, 15], flips: [{from: 13, to: 16, quarterTurns: 3}], restFrom: 30, restQuad: P4_FILM};
}

test('the scene contract gives one card size on the table: plan scale meets the plan, body scale is about twice as large', () => {
  assert.equal(scene.cardWidth, 63); assert.equal(scene.cardHeight, 88); assert.equal(scene.bodyScale, 2);
  const target = contract.cardSizeAtTargets.targets.find((t: {id: string}) => t.id === 'P4.C1'), film = pts(P4_FILM);
  // At scale 1 the constant-size card is the film's own resting card, which the plan put there.
  const plan = restingQuad(scene, film, 1);
  assert.equal(plan.turned, false);
  plan.quad.forEach((p, i) => assert.ok(dist(p, pts(target.atPlanScale.quadPx)[i]) < 6, `plan corner ${i} off by ${dist(p, pts(target.atPlanScale.quadPx)[i]).toFixed(1)} px`));
  plan.quad.forEach((p, i) => assert.ok(dist(p, film[i]) < 5, `film corner ${i}`));
  // At the contract's body scale it has the size the contract states for that target, on the same spot.
  const body = restingQuad(scene, film, scene.bodyScale), stated = pts(target.atBodyScale.quadPx);
  assert.ok(Math.abs(Math.sqrt(area(body.quad) / area(stated)) - 1) < 0.04); assert.ok(dist(centre(body.quad), centre(stated)) < 8);
  assert.ok(area(body.quad) > 3.4 * area(plan.quad)); assert.ok(signedArea(body.quad) > 0, 'clockwise on screen, so the face is towards the camera');
  // The far edge is shorter than the near edge: the card is in the table's perspective, not just enlarged.
  assert.ok(dist(body.quad[0], body.quad[1]) < dist(body.quad[3], body.quad[2]));
  // A card whose long way lies across the image arrives a quarter turn off from the tracker; it is turned back and still covers the footprint.
  const across = restingQuad(scene, [film[0], {x: film[1].x + 60, y: film[1].y}, {x: film[2].x + 60, y: film[2].y - 22}, {x: film[3].x, y: film[3].y - 22}], 1);
  assert.equal(across.turned, true); assert.ok(dist(across.quad[0], across.quad[1]) < dist(across.quad[1], across.quad[2]), 'side 0-1 is the short side again');
  assert.equal(sceneOf({}), null); assert.equal(sceneOf({...contract, keyFigures: {homographyTableMmToImagePx: {matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 0]]}}}), null);
});

test('in the hand the card follows the film, at rest it has its own size, and the film\'s last-frame shrink never shows', () => {
  const track = deal(), still = restingQuad(scene, pts(P4_FILM), 2).quad;
  // Far from landing: the film's quad and a margin more, about the same centre, with the side the track says. What must be covered is the film's quad with its rim.
  const early = poseAt(track, scene, 5, 2)!;
  assert.equal(early.side, 'BACK'); assert.equal(early.resting, 0);
  assert.ok(Math.abs(Math.sqrt(area(early.quad!) / area(pts(track.frames[5].quad!))) - MARGIN) < 1e-9); assert.ok(dist(centre(early.quad!), centre(pts(track.frames[5].quad!))) < 1e-9); assert.ok(Math.abs(Math.sqrt(area(early.film!) / area(pts(track.frames[5].quad!))) - 1) < 2 * RIM / 60);
  // A track that draws the card elsewhere than the film has it says where the film's card is: that is what must be covered, and the card is still drawn by quad.
  const apart = deal(), moved = apart.frames[5].quad!.map(([x, y]) => [x + 40, y - 25]); apart.frames[5] = {...apart.frames[5], film: moved};
  const split = poseAt(apart, scene, 5, 2)!; assert.deepEqual(split.quad, early.quad); assert.ok(dist(centre(split.film!), centre(pts(moved))) < 2, 'the rim grows it about its own middle, give or take a pixel'); assert.ok(dist(centre(split.film!), centre(early.film!)) > 40);
  // Lying still: the constant-size card, the same in every frame, and it covers the film's card.
  for (const frame of [30, 35, 39, 200]) assert.deepEqual(poseAt(track, scene, frame, 2)!.quad, still);
  assert.equal(poseAt(track, scene, 33, 2)!.resting, 1); assert.ok(area(still) > 3 * area(poseAt(track, scene, 33, 2)!.film!)); // the film's card with its rim
  // The film halves the card over frames 28-29. The rendered card does not follow: its size only moves towards the resting size.
  const sizes = Array.from({length: 14}, (_, i) => Math.sqrt(area(poseAt(track, scene, 17 + i, 2)!.quad!))), rest = Math.sqrt(area(still)), hand = sizes[0];
  for (let i = 1; i < sizes.length; i++) assert.ok(Math.abs(sizes[i] - rest) <= Math.abs(sizes[i - 1] - rest) + 0.5, `frame ${17 + i} moves away from the resting size`);
  assert.ok(Math.min(...sizes) >= Math.min(hand, rest) - 0.5, 'never smaller than both the card in the hand and the card at rest');
  assert.ok(Math.abs(sizes.at(-1)! - rest) < 0.05 * rest, 'arrives at the resting size, so nothing jumps when it lies still');
  // At plan scale the resting card is small: the size comes down smoothly over the ease instead of in two frames.
  const down = Array.from({length: 14}, (_, i) => Math.sqrt(area(poseAt(track, scene, 17 + i, 1)!.quad!)));
  for (let i = 1; i < down.length; i++) assert.ok(down[i] <= down[i - 1] + 0.5); assert.ok(down[6] < 0.9 * down[0], 'already on its way before the film shrinks');
  // Edge-on frames are a line, frames without a card are empty, and a clip without a resting card just follows the film.
  const edge = poseAt(track, scene, 14, 2)!; assert.equal(edge.side, 'EDGE'); assert.equal(edge.quad, null); assert.deepEqual(edge.edge, [{x: 900, y: 914}, {x: 840, y: 944}]);
  const gone = {...track, frames: track.frames.map(f => f.frame === 3 ? {...f, side: 'NONE' as const, quad: null} : f)};
  assert.deepEqual([poseAt(gone, scene, 3, 2)!.quad, poseAt(gone, scene, 3, 2)!.edge], [null, null]);
  const carried = {...track, restFrom: null, restQuad: null, frames: track.frames.slice(0, 14)}, held = poseAt(carried, scene, 9, 2)!; assert.ok(Math.abs(Math.sqrt(area(held.quad!) / area(pts(carried.frames[9].quad!))) - MARGIN) < 1e-9); assert.equal(held.resting, 0);
  // A deal that ends at the landing has no resting stretch in its track. Its last frame stands in, so the card has its own size when the clip is cut to the return.
  const landing = {...track, restFrom: null, restQuad: null, frames: track.frames.slice(0, 31)};
  assert.deepEqual(restOf(landing), {from: 30, quad: pts(P4_FILM), assumed: true}); assert.deepEqual(poseAt(landing, scene, 30, 2)!.quad, still);
  assert.ok(Math.abs(Math.sqrt(area(poseAt(landing, scene, 29, 2)!.quad!)) - rest) < 0.05 * rest); assert.equal(restOf(carried), null); assert.equal(restOf(track)!.assumed, false);
  // A return begins with the card lying where it will rest, a finger on it for a few frames: it has its resting size from the first frame.
  const back: CardTrack = {width: 1764, height: 1174, edgeWindow: null, restFrom: 4, restQuad: P4_FILM, frames: Array.from({length: 10}, (_, i) => ({frame: i, side: 'FRONT' as const, quad: i < 4 ? shift(P4_FILM, 3 - i, 2) : P4_FILM, edge: null}))};
  assert.equal(restOf(back)!.from, 0); assert.deepEqual(poseAt(back, scene, 0, 2)!.quad, still); assert.equal(restOf(track)!.from, 30);
  // Without the contract the resting card is the film's card enlarged about its centre: still constant, still covering.
  const bare = poseAt(track, null, 36, 2)!; assert.ok(Math.abs(Math.sqrt(area(bare.quad!) / area(bare.film!)) - 2) < 0.01); assert.ok(dist(centre(bare.quad!), centre(bare.film!)) < 1e-6);
  assert.equal(poseAt({...track, frames: []}, scene, 0, 2), null);
});

test('the projection puts the model card exactly on its quad', () => {
  const quad = restingQuad(scene, pts(P4_FILM), 2).quad, h = cardToImage(quad, 2.5, 3.5), m = projectionOf(h, 1764, 1174);
  const corners = [[-1.25, 1.75], [1.25, 1.75], [1.25, -1.75], [-1.25, -1.75]];
  corners.forEach(([x, y], i) => { const w = m[12] * x + m[13] * y + m[15], nx = (m[0] * x + m[1] * y + m[3]) / w, ny = (m[4] * x + m[5] * y + m[7]) / w;
    assert.ok(w > 0); assert.ok(Math.abs((nx + 1) / 2 * 1764 - quad[i].x) < 1e-6); assert.ok(Math.abs((1 - ny) / 2 * 1174 - quad[i].y) < 1e-6); });
  // A bent card's z moves nothing on screen: x, y and w do not depend on it, and depth stays within the clip range.
  assert.deepEqual([m[2], m[6], m[14]], [0, 0, 0]); assert.deepEqual(m.slice(8, 12), [0, 0, -0.001, 0]);
  assert.throws(() => cardToImage([quad[0], quad[0], quad[0], quad[0]], 2.5, 3.5), /Degenerate/);
});

test('the matte keeps hand and sleeve in front and finds every bit of film card that must be covered', () => {
  const w = 24, h = 16, rgba = new Uint8ClampedArray(w * h * 4), put = (x: number, y: number, c: number[]) => rgba.set([...c, 255], (y * w + x) * 4);
  const TABLE = [20, 150, 60], SKIN = [205, 150, 120], SLEEVE = [22, 22, 26], BLUE = [30, 60, 220], YELLOW = [230, 205, 8], SHADOWED = [18, 30, 72], TINT = [70, 150, 50];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, x >= 4 && x < 12 && y >= 4 && y < 12 ? BLUE : TABLE);
  for (let y = 6; y < 12; y++) for (let x = 10; x < 20; x++) put(x, y, x < 16 ? SKIN : SLEEVE); // a finger over the card's right side, the sleeve behind it
  put(13, 8, [250, 250, 250]); // a nail highlight inside the finger
  put(6, 6, SHADOWED); put(3, 8, TINT); put(1, 1, YELLOW); put(22, 2, SKIN); // shadow on the face, yellow blur, another card colour, one stray skin pixel
  const matte = readMatte(rgba, w, h), at = (mask: Uint8Array, x: number, y: number) => mask[y * w + x];
  assert.equal(at(matte.hand, 12, 8), 1); assert.equal(at(matte.hand, 18, 9), 1); assert.equal(at(matte.hand, 13, 8), 1, 'the highlight is closed');
  assert.equal(at(matte.hand, 22, 2), 0, 'a single pixel is not a hand'); assert.equal(at(matte.hand, 6, 6), 0, 'a shadowed blue face is card, not sleeve');
  assert.equal(at(matte.card, 6, 6), 1); assert.equal(at(matte.card, 5, 5), 1); assert.equal(at(matte.card, 3, 8), 1); assert.equal(at(matte.card, 1, 1), 1);
  assert.equal(at(matte.card, 3, 5), 1, 'wider than the colour, for its blur'); assert.equal(at(matte.card, 0, 14), 0); assert.equal(at(matte.hand, 0, 14), 0);
  assert.deepEqual(matte.ground, TABLE);
  assert.deepEqual(readMatte(new Uint8ClampedArray(16).fill(255), 2, 2).ground, [20, 150, 60]);
  // The yellow back's pale rim is card too; a white nail highlight is not.
  put(2, 13, [236, 221, 172]); put(8, 14, [250, 250, 250]);
  assert.equal(at(readMatte(rgba, w, h).card, 2, 13), 1); assert.equal(at(readMatte(rgba, w, h).card, 8, 14), 0);
  // The table in deep shadow beside the finger is dark, but green: it is not kept in front of the card.
  for (let y = 12; y < 16; y++) for (let x = 12; x < 16; x++) put(x, y, [20, 45, 22]);
  assert.equal(at(readMatte(rgba, w, h).hand, 13, 14), 0); assert.equal(at(readMatte(rgba, w, h).hand, 12, 9), 1);
  // A finger is firm, a skin-coloured band five pixels wide (the film card's pale rim in motion blur) is hand but not firm.
  const big = new Uint8ClampedArray(48 * 48 * 4); for (let i = 0; i < 48 * 48; i++) big.set([...(i % 48 >= 6 && i % 48 < 20 && i < 48 * 30 ? SKIN : i >= 48 * 38 && i < 48 * 43 ? SKIN : TABLE), 255], i * 4);
  const wide = readMatte(big, 48, 48); assert.deepEqual([wide.hand[10 * 48 + 12], wide.firm[10 * 48 + 12], wide.hand[40 * 48 + 30], wide.firm[40 * 48 + 30]], [1, 1, 1, 0]);
  // On the film's own card a dark pixel is the card's face in shadow; beside it the same colour is sleeve.
  const onCard = readMatte(rgba, w, h, (x, y) => x >= 4 && x < 12 && y >= 4 && y < 12), dark = (x: number, y: number) => put(x, y, SLEEVE);
  assert.equal(at(onCard.hand, 18, 9), 1);
  for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) dark(x, y);
  assert.equal(at(readMatte(rgba, w, h).hand, 6, 6), 1); assert.equal(at(readMatte(rgba, w, h, (x, y) => x >= 4 && x < 12 && y >= 4 && y < 12).hand, 6, 6), 0);
  // What lies behind the film's card: table under the card on the table, the sleeve where the sleeve is. Skin is never carried in.
  const f = matte.field, cellAt = (x: number, y: number) => [...f.rgb.slice((y * f.width + x) * 3, (y * f.width + x) * 3 + 3)];
  assert.deepEqual([f.width, f.height, f.cell], [6, 4, 4]);
  assert.deepEqual(cellAt(1, 1), TABLE, 'a cell wholly under the card is filled from the table beside it'); assert.deepEqual(cellAt(4, 2), SLEEVE);
  for (let k = 0; k < f.width * f.height; k++) assert.ok(f.rgb[k * 3] < 100, 'no skin colour in the field');
});

test('only the place of the film card is cleaned, with room for its blur', () => {
  const pose = {frame: 0, side: 'FRONT' as const, quad: null, edge: null, film: [{x: 100, y: 100}, {x: 200, y: 100}, {x: 200, y: 200}, {x: 100, y: 200}], resting: 0, turned: false};
  for (const film of [pose.film, [...pose.film].reverse()]) { const near = filmZone({...pose, film});
    assert.deepEqual([near(150, 150), near(212, 150), near(222, 150), near(150, 88), near(150, 78)], [true, true, false, true, false]); }
  assert.equal(filmZone(pose, 2)(204, 150), false);
  const edge = filmZone({...pose, film: null, edge: [{x: 0, y: 0}, {x: 100, y: 0}]});
  assert.deepEqual([edge(50, 10), edge(50, 20), edge(-10, 0), edge(-40, 0)], [true, false, true, false]);
  assert.equal(filmZone({...pose, film: null})(150, 150), false);
});

test('regions, occlusion overrides and the track summary', () => {
  const track = deal(), pose = poseAt(track, scene, 33, 2)!, box = regionOf(pose, 1764, 1174)!;
  for (const p of [...pose.quad!, ...pose.film!]) assert.ok(p.x >= box.x + 20 && p.x <= box.x + box.width - 20 && p.y >= box.y + 20);
  assert.equal(box.width % 2, 0); assert.equal(box.height % 2, 0); assert.ok(box.y + box.height <= 1174);
  assert.equal(regionOf({...pose, quad: null, film: null, edge: null}, 1764, 1174), null);
  const overrides = overridesOf({schemaVersion: 1, cardInFront: [{from: 72, to: 78, note: 'fingertopp'}, {from: 9, to: 3}, {from: 'x', to: 4}, null, {from: 90, to: 90}]});
  assert.deepEqual(overrides, [{from: 72, to: 78, note: 'fingertopp'}, {from: 90, to: 90, note: ''}]);
  assert.deepEqual([71, 72, 78, 79, 90].map(f => cardInFront(overrides, f)), [false, true, true, false, true]);
  assert.deepEqual(overridesOf(null), []); assert.deepEqual(overridesOf({cardInFront: 'all'}), []);
  assert.equal(describeTrack(track), 'BACK 0–13 · EDGE 14–15 · FRONT 16–39 · sätts om 3 kvartsvarv vid ruta 13–16 · vilar från ruta 30 · 2 osäkra rutor'); // the two edge-on frames
  assert.match(describeTrack({...track, restFrom: null, frames: track.frames.map(f => ({...f, confidence: 0.3}))}), /vilar inte i klippet, sista rutan 39 får gälla · 40 osäkra rutor$/);
  assert.equal(describeTrack({...track, restFrom: null, flips: [], frames: track.frames.slice(0, 14)}), 'BACK 0–13 · kortet kommer aldrig till vila i spåret');
});

test('a seat film deals the second card: the rendered card is moved, the film\'s own card stays to be covered, and a laid card keeps its place', () => {
  const track: CardTrack = {...deal(), leavesShoe: 4}, shift = {x: 40, y: -16}, still = restingQuad(scene, pts(P4_FILM), 2).quad, moved = (q: Pt[]) => q.map(p => ({x: p.x + 40, y: p.y - 16}));
  // Nothing of the shift while the card sits in the shoe, all of it once it lies, and never backwards in between.
  const shares = Array.from({length: 40}, (_, i) => shiftShare(track, i));
  assert.deepEqual([shares[0], shares[4], shares[30], shares[39]], [0, 0, 1, 1]); assert.ok(shares[17] > 0.3 && shares[17] < 0.7);
  for (let i = 1; i < 40; i++) assert.ok(shares[i] >= shares[i - 1]);
  // At rest: the constant-size card, exactly the shift away. The film's own card is reported where it is.
  const lying = poseAt(track, scene, 35, 2, 12, shift)!, plain = poseAt(track, scene, 35, 2)!;
  // The constant-size card at the moved place, in the perspective of the table there: same centre, a hair smaller further up the table.
  assert.ok(dist(centre(lying.quad!), centre(moved(still))) < 1.5); assert.ok(Math.abs(Math.sqrt(area(lying.quad!) / area(still)) - 1) < 0.08); assert.deepEqual(lying.film, plain.film); assert.equal(lying.resting, 1);
  // In the shoe the card is the film's; halfway it is partly moved; no shift means no change at all.
  assert.deepEqual(poseAt(track, scene, 2, 2, 12, shift)!.quad, poseAt(track, scene, 2, 2)!.quad);
  const carried = poseAt(track, scene, 20, 2, 12, shift)!, free = poseAt(track, scene, 20, 2)!, k = shiftShare(track, 20);
  assert.ok(dist(centre(carried.quad!), {x: centre(free.quad!).x + 40 * k, y: centre(free.quad!).y - 16 * k}) < 1e-6);
  assert.deepEqual(poseAt(track, scene, 20, 2, 12, null), free); assert.equal(free.at, undefined);
  // Edge-on: the thin edge is drawn moved, the film's edge is remembered, cleaned and inside the region.
  const edge = poseAt(track, scene, 14, 2, 12, shift)!, e = shiftShare(track, 14);
  assert.deepEqual(edge.at, [{x: 900, y: 914}, {x: 840, y: 944}]); assert.ok(dist(edge.edge![0], {x: 900 + 40 * e, y: 914 - 16 * e}) < 1e-9);
  assert.equal(filmZone(edge)(870, 929), true); const box = regionOf(edge, 1764, 1174)!; assert.ok(box.x <= 840 && box.x + box.width >= 900 + 40 * e);
  // What a film leaves on the table for the films after it: its resting card, shifted with the step; a card that never lands leaves nothing.
  assert.deepEqual(placedCard(track, scene, 2), {quad: still, side: 'FRONT'});
  assert.deepEqual(placedCard(track, scene, 2, shift)!.quad, lying.quad);
  assert.equal(placedCard({...track, restFrom: null, restQuad: null, frames: track.frames.slice(0, 14)}, scene, 2, shift), null);
});

test('the rendered card ends on the place and direction of the plan, the move growing from the shoe, and the size it needs is measured', () => {
  const track: CardTrack = {...deal(), leavesShoe: 4}, film = pts(P4_FILM), c = centre(film);
  // The plan puts this card 30 px to the left and 12 px up, turned a little, and lists its corners from another corner, the other way round.
  const turn = (p: Pt, deg: number): Pt => { const a = deg * Math.PI / 180, x = p.x - c.x, y = p.y - c.y; return {x: c.x - 30 + x * Math.cos(a) - y * Math.sin(a), y: c.y - 12 + x * Math.sin(a) + y * Math.cos(a)}; };
  const plan = film.map(p => turn(p, 8)), land = [plan[2], plan[1], plan[0], plan[3]];
  const rest = poseAt(track, scene, 35, 2, 12, null, land)!, wanted = restingQuad(scene, plan, 2).quad;
  // At rest: the constant-size card on the plan's quad, begun at the corner nearest the film's, so nothing spins.
  rest.quad!.forEach((p, i) => assert.ok(dist(p, wanted[i]) < 1e-6, `corner ${i}`)); assert.equal(rest.resting, 1);
  assert.ok(dist(centre(rest.quad!), {x: c.x - 30, y: c.y - 12}) < 6);
  // A shift given as well is ignored: the plan says where the card ends.
  assert.deepEqual(poseAt(track, scene, 35, 2, 12, {x: 500, y: 0}, land)!.quad, rest.quad);
  // In the shoe nothing has moved; on the way the card is partly there; the film's own card is always reported where it is.
  assert.deepEqual(poseAt(track, scene, 2, 2, 12, null, land)!.quad, poseAt(track, scene, 2, 2)!.quad);
  const way = poseAt(track, scene, 12, 2, 12, null, land)!, free = poseAt(track, scene, 12, 2)!, k = shiftShare(track, 12);
  assert.ok(k > 0 && k < 1); assert.ok(dist(centre(way.quad!), {x: centre(free.quad!).x - 30 * k, y: centre(free.quad!).y - 12 * k}) < 1e-6); assert.deepEqual(way.film, free.film);
  // No two neighbouring frames are further apart than the film moves the card plus a share of the correction: no jump at the landing.
  for (let i = 17; i < 31; i++) { const a = centre(poseAt(track, scene, i - 1, 2, 12, null, land)!.quad!), b = centre(poseAt(track, scene, i, 2, 12, null, land)!.quad!), raw = dist(centre(pts(track.frames[i - 1].quad!)), centre(pts(track.frames[i].quad!)));
    assert.ok(dist(a, b) < raw + 6, `frame ${i} jumps ${dist(a, b).toFixed(1)} px`); }
  assert.deepEqual(placedCard(track, scene, 2, null, land)!.quad, rest.quad);
  // How far beside the plan the film lands, and the Kortskala that makes the rendered card a margin larger than the film's resting card.
  const fact = landing(track, scene, land)!;
  assert.ok(Math.abs(fact.off! - Math.hypot(30, 12)) < 1e-6); assert.ok(Math.abs(fact.scaleNeeded! - MARGIN * fact.filmSize / fact.planSize!) < 1e-9); assert.ok(fact.scaleNeeded! > 1.1 && fact.scaleNeeded! < 1.4);
  assert.equal(landing({...track, restFrom: null, restQuad: null, frames: track.frames.slice(0, 14)}, scene, land), null); assert.equal(landing(track, scene, null)!.off, null);
});

test('what is still visible of the film card is counted with the colours of the tracker, outside the shoe window and the cleaned zone', () => {
  const w = 120, h = 80, rgb = new Uint8Array(w * h * 3), paint = (x0: number, y0: number, x1: number, y1: number, c: number[]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgb.set(c, (y * w + x) * 3); };
  const TABLE = [20, 150, 60], BLUE = [30, 60, 220], YELLOW = [230, 205, 8];
  paint(0, 0, w, h, TABLE); paint(40, 30, 60, 50, BLUE);    // the film's card
  paint(100, 5, 112, 20, YELLOW);                            // the next card seated in the shoe window
  const quad = [{x: 40, y: 30}, {x: 60, y: 30}, {x: 60, y: 50}, {x: 40, y: 50}], pose = {frame: 0, side: 'FRONT' as const, quad, edge: null, film: quad, resting: 1, turned: false}, shoe = [[100, 5, 111, 19]];
  // Covered by the rendered card, and the shoe window is not ours to cover.
  assert.equal(leakCount(rgb, w, h, pose, shoe), 0);
  // The shoe window is ignored only when it is named: without it the seated card would be painted over too, so it is not a leak either.
  assert.equal(leakCount(rgb, w, h, null, shoe), 0); assert.equal(leakCount(rgb, w, h, pose), 0);
  // A second card the track knows nothing about is a patch of card size: the overlay paints it over wherever it lies, so it does not leak.
  paint(5, 60, 25, 75, BLUE); assert.equal(leakCount(rgb, w, h, pose, shoe), 0);
  const rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  const strays = strayBoxes(rgba, w, h, shoe);
  assert.deepEqual(strays.map(b => [b.x, b.y, b.x + b.width, b.y + b.height]).sort((a, b) => a[0] - b[0]), [[0, 50, 34, 80], [30, 20, 70, 60]], 'the lying card and the film card itself, each with room for its rim; the shoe window is left alone');
  assert.equal(strayBoxes(rgba, w, h).length, 3);
  // What is smaller than a card is not painted over, and is what can still show: a patch of 6 x 7 pixels, less its one-pixel border.
  paint(90, 50, 96, 57, YELLOW); assert.ok(6 * 7 < STRAY); assert.equal(strayBoxes(rgba, w, h, shoe).length, 2); assert.equal(leakCount(rgb, w, h, pose, shoe), 4 * 5);
  // A one-pixel fringe is not a card.
  paint(70, 10, 71, 40, YELLOW); assert.equal(leakCount(rgb, w, h, pose, shoe), 4 * 5);
  // Found on a half-size picture, the boxes come back in full-size pixels.
  const small = new Uint8ClampedArray((w / 2) * (h / 2) * 4); for (let y = 0; y < h / 2; y++) for (let x = 0; x < w / 2; x++) small.set([rgb[(y * 2 * w + x * 2) * 3], rgb[(y * 2 * w + x * 2) * 3 + 1], rgb[(y * 2 * w + x * 2) * 3 + 2], 255], (y * w / 2 + x) * 4);
  assert.deepEqual(strayBoxes(small, w / 2, h / 2, shoe, 2).map(b => [b.x, b.y, b.x + b.width, b.y + b.height]).sort((a, b) => a[0] - b[0]), [[0, 50, 36, 80], [30, 20, 70, 60], [60, 0, 82, 50]]); // the long one-pixel fringe passes as a patch at half size: painting it over does no harm
  assert.deepEqual(ranges([61, 62, 63, 70, 72, 73]), [[61, 63], [70, 70], [72, 73]]); assert.deepEqual(ranges([]), []);
});

test('a value per card: each card has its own record by draw number or target, and face-down wins over the side the film shows', () => {
  const cards: CardRecord[] = [{shoeDraw: 1, target: 'P4.C1', r: 'K', s: 'hearts', faceDown: false}, {shoeDraw: 2, target: 'D.C1', r: '10', s: 'spades', faceDown: false},
    {shoeDraw: 3, target: 'P4.C2', r: 'a', s: ' Clubs ', faceDown: false}, {shoeDraw: 4, target: 'D.C2', faceDown: true}, {shoeDraw: 9, target: 'P4.C1', r: '7', s: 'diamonds'}];
  const chosen = {rank: 'A', suit: 'spades'} as const;
  // By draw number, the card's identity; without it, the latest card dealt to that place.
  assert.equal(cardRecord(cards, {shoeDraw: 1})!.r, 'K'); assert.equal(cardRecord(cards, {target: 'P4.C1'})!.shoeDraw, 9); assert.equal(cardRecord(cards, {shoeDraw: 1, target: 'D.C1'})!.target, 'P4.C1', 'the draw number goes first');
  assert.equal(cardRecord(cards, {target: 'P1.C1'}), null); assert.equal(cardRecord(cards, {shoeDraw: 77}), null); assert.equal(cardRecord(null, {target: 'P4.C1'}), null); assert.equal(cardRecord(cards, {}), null);
  // The face is the record's own, in the film's side; values are read whatever their case.
  assert.deepEqual(cardFace(cardRecord(cards, {shoeDraw: 1}), false, chosen), {art: {rank: 'K', suit: 'hearts'}, back: false, own: true});
  assert.deepEqual(cardFace(cardRecord(cards, {shoeDraw: 3}), false, chosen), {art: {rank: 'A', suit: 'clubs'}, back: false, own: true});
  assert.equal(cardFace(cardRecord(cards, {shoeDraw: 1}), true, chosen).back, true, 'while the film still shows the back, so does the card');
  // Face-down wins over the film: the hole card shows its back although the film has turned it, and needs no rank or suit.
  assert.deepEqual(cardFace(cardRecord(cards, {target: 'D.C2'}), false, chosen), {art: chosen, back: true, own: false});
  assert.equal(cardFace({shoeDraw: 5, target: 'D.C2', r: 'Q', s: 'hearts', faceDown: true}, false, chosen).back, true);
  // No record, or a value the study cannot print: the artwork chosen in the panel, and it says so.
  assert.deepEqual(cardFace(null, false, chosen), {art: chosen, back: false, own: false});
  for (const bad of [{r: '1', s: 'hearts'}, {r: 'T', s: 'hearts'}, {r: 'K', s: 'h'}, {r: 'K'}, {s: 'hearts'}]) assert.deepEqual(cardFace({shoeDraw: 1, target: 'P4.C1', ...bad}, false, chosen), {art: chosen, back: false, own: false});
  // Every value the study prints is accepted: 13 ranks and 4 suits.
  assert.deepEqual([...CARD_RANKS], ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']); assert.deepEqual([...CARD_SUITS], ['spades', 'hearts', 'diamonds', 'clubs']);
  for (const r of CARD_RANKS) for (const s of CARD_SUITS) assert.equal(cardFace({shoeDraw: 1, target: 'P4.C1', r, s}, false, chosen).own, true);
});

// ── No card that is not a card (Jakob 2026-11-13: "linjer flyger dit och dit") ──────────────────────────────────────────
// Quads from Paow's hole card as it slides in under her hand (paow-giv-2-1-d-c2-03-01): frame 49 is still a card, frames 52 and 55
// are wedges whose far side is a fraction of the near one. The night's guard (sound) let them through.
const HOLE_49 = [[997, 871], [1012, 900], [953, 896], [966, 875]], HOLE_52 = [[960, 878], [969, 908], [909, 896], [941, 878]], HOLE_55 = [[915, 878], [917, 913], [898, 904], [875, 891]];
const card = (x: number, y = 100) => [[x, y], [x + 60, y], [x + 60, y + 84], [x, y + 84]];
test('a drawn card is a plausible card: a wedge, a sliver and a crossed quad are not, and a frame with one keeps the card before it for a few frames', () => {
  for (const q of [card(0), P4_FILM, HOLE_49]) assert.equal(plausible(pts(q)), true);
  for (const q of [HOLE_52, HOLE_55]) { assert.equal(sound(pts(q)), true, 'sound, which is all the night\'s guard asked'); assert.equal(plausible(pts(q)), false); assert.ok(keystone(pts(q)) > PLAUSIBLE.keystone); }
  assert.equal(plausible(pts([[0, 0], [200, 0], [200, 12], [0, 12]])), false, 'a sliver'); assert.equal(plausible(pts([[0, 0], [60, 84], [60, 0], [0, 84]])), false, 'crossed');
  assert.equal(plausible(pts(card(0).map(([x, y]) => [x * 4, y * 4]))), false, 'larger than any card a film holds'); assert.ok(Math.abs(keystone(pts(card(0))) - 1) < 1e-9);
  // In the hand: two wedge frames keep the card of the frame before them; a longer run is drawn as nothing after HOLD frames.
  const frames = (bad: number[]): CardTrack['frames'] => Array.from({length: 20}, (_, i) => ({frame: i, side: 'BACK' as const, quad: bad.includes(i) ? HOLE_55.map(([x, y]) => [x + i * 4, y]) : card(800 + i * 4, 860), edge: null}));
  const short: CardTrack = {width: 1764, height: 1174, frames: frames([8, 9]), edgeWindow: null, restFrom: null, restQuad: null};
  const before = poseAt(short, scene, 7, 1.2)!;
  for (const i of [8, 9]) { const p = poseAt(short, scene, i, 1.2)!; assert.deepEqual(p.quad, before.quad); assert.equal(p.kept, i); assert.equal(p.frame, 7); }
  assert.equal(poseAt(short, scene, 10, 1.2)!.kept, undefined);
  const long: CardTrack = {...short, frames: frames([8, 9, 10, 11, 12])};
  assert.deepEqual([8, 9, 10, 11, 12].map(i => !!poseAt(long, scene, i, 1.2)!.quad), [true, true, true, false, false], `held for ${HOLD} frames, then nothing`);
  for (let i = 0; i < 20; i++) { const q = poseAt(long, scene, i, 1.2)!.quad; if (q) assert.ok(plausible(q), `frame ${i}`); }
});

test('a card that slides in under the hand settles on to its place from the last plausible shape, following the hand', () => {
  // the hole card's last frames before it lies (rest from 57), as the track has them; the frames before are cards
  const quads: Record<number, number[][]> = {49: HOLE_49, 50: [[987, 872], [1002, 903], [941, 896], [961, 876]], 51: [[974, 878], [987, 905], [925, 896], [950, 878]], 52: HOLE_52,
    53: [[944, 880], [950, 909], [896, 896], [928, 880]], 54: [[929, 877], [934, 913], [893, 897], [890, 890]], 55: HOLE_55, 56: [[900, 879], [897, 913], [884, 904], [869, 889]]};
  const rest = [[941.5, 911.5], [941.5, 943.5], [887, 943.5], [881.1, 911.5]], land = pts([[884, 911], [936, 911], [943, 943], [887, 943]]);
  const track: CardTrack = {width: 1764, height: 1174, edgeWindow: null, restFrom: 57, restQuad: rest,
    frames: Array.from({length: 70}, (_, i) => ({frame: i, side: 'BACK' as const, quad: i >= 57 ? rest : quads[i] ?? HOLE_49.map(([x, y]) => [x + (49 - i) * 6, y]), edge: null}))};
  let last: Pt | null = null;
  for (let i = 45; i <= 60; i++) { const p = poseAt(track, scene, i, 1.2, 12, null, land)!; assert.ok(p.quad && plausible(p.quad), `frame ${i} drawn as a card`); assert.equal(p.kept, undefined);
    const c = centre(p.quad!); if (last) assert.ok(dist(c, last) < 30, `frame ${i}: no jump (${dist(c, last).toFixed(0)} px)`); last = c; }
  // it follows the hand: the middle of the frame-53 wedge is where the card is drawn, give or take the settling toward its place
  assert.ok(dist(centre(poseAt(track, scene, 53, 1.2, 12, null, land)!.quad!), centre(pts(quads[53]))) < 25);
});

test('the contact shadow, a quarter of a card beyond the card, is only laid where that skirt keeps clear of the line at infinity', () => {
  assert.equal(skirtSound(pts(card(0)), 0.25), true); assert.equal(skirtSound(pts(P4_FILM), 0.25), true);
  // what the old settling drew for the hole card in frame 52: a wedge whose shadow ran 1300 px across the table
  assert.equal(skirtSound(pts([[977, 913], [897, 897], [940, 873], [964, 873]]), 0.25), false);
  assert.equal(skirtSound(pts(HOLE_55), 0.25), false);
});

// The scene lays each point of a card where the film's surfaces carry its pixel and bends a held card toward the eye
// (src/scene3d-deal.ts VERTEX). The same arithmetic in numbers, old measure and new, checked against the shader's text.
const camera = cameraFromContract(contract), solved = solveCamera(camera), eye = [0, camera.heightM, 0];
// the felt alone, as the old shader measured: the ray's meeting with y = 0 wherever it is, also behind the eye
function feltPoint(x: number, y: number): number[] {
  const n = [(x - (1764 - 1) / 2) / camera.focalPx, (y - (1174 - 1) / 2) / camera.focalPx], c = Math.cos(solved.pitch), s = Math.sin(solved.pitch), d = [n[0], -n[1] * c - s, n[1] * s - c], t = -eye[1] / d[1];
  return eye.map((e, i) => e + d[i] * t);
}
function bentPoint(quad: number[][], u: number, v: number, bend: number, felt: boolean): number[] {
  const H = squareToQuad(quad), on = (a: number, b: number) => { const [x, y] = onSquare(H, a, b); return felt ? feltPoint(x, y) : filmToScene(camera, x, y); };
  const p = filmToScene(camera, ...onSquare(H, u, v)), top = on(0.5, 0), l = Math.hypot(...on(0.5, 1).map((c, i) => c - top[i])), k = 2 * bend / Math.max(l, 1e-4), y = (v - 0.5) * l;
  if (k <= 1e-6) return p;
  const d = p.map((c, i) => c - eye[i]), n = Math.hypot(...d), m = felt ? (1 - Math.cos(k * y)) / k : Math.min((1 - Math.cos(k * y)) / k, 0.05 * n);
  return p.map((c, i) => c - d[i] / n * m);
}
const inFront = (p: number[]) => { const q = solved.pitch, y = p[1] - camera.heightM; return -y * Math.sin(q) - p[2] * Math.cos(q) > 0.05; };
test('the bend of a card held up near the horizon row stays a few millimetres: no corner is thrown behind the eye', async () => {
  // Paow P4 (paow-giv-2-1-p4-04-01) frame 34 as drawn: the card held up at the shoe, across the horizon row (548)
  const held = [[1268, 517], [1319, 564], [1241, 643], [1172, 602]], grid = Array.from({length: 9}, (_, j) => Array.from({length: 5}, (_, i) => [i / 4, j / 8])).flat();
  assert.ok(camera.horizonRow > 517 && camera.horizonRow < 643, 'the card spans the horizon row');
  assert.ok(grid.some(([u, v]) => !inFront(bentPoint(held, u, v, 0.14, true))), 'the old measure threw corners behind the eye');
  for (const [u, v] of grid) { const p = bentPoint(held, u, v, 0.14, false), flat = filmToScene(camera, ...onSquare(squareToQuad(held), u, v));
    assert.ok(inFront(p), `(${u}, ${v}) in front`); assert.ok(Math.hypot(...p.map((c, i) => c - flat[i])) <= 0.05 * Math.hypot(...flat.map((c, i) => c - eye[i])) + 1e-9); }
  // the shader says the same: the card's length on the surfaces it is laid on, and the shift held to a twentieth of the way to the eye
  const shader = await readFile('src/scene3d-deal.ts', 'utf8');
  assert.match(shader, /float len = length\(onFilm\(vec2\(\.5, 1\.\)\) - onFilm\(vec2\(\.5, 0\.\)\)\)/); assert.match(shader, /min\(\(1\. - cos\(k \* y\)\) \/ k, \.05 \* length\(p - eye\)\)/);
  assert.doesNotMatch(shader, /length\(onFelt\(vec2/);
});

test('Paow\'s tracked takes, every frame: what is drawn is a card, and a bent card stays in front of the eye (skipped without the tracks)', async t => {
  const dirs = await readdir('assets/tracking').catch(() => [] as string[]), paow = dirs.filter(d => d.startsWith('paow-'));
  if (!paow.length) { t.skip('no tracks on this machine'); return; }
  let frames = 0;
  for (const d of paow) { const track = JSON.parse(await readFile(`assets/tracking/${d}/card-track.json`, 'utf8').catch(() => 'null')) as CardTrack | null; if (!track?.frames) continue;
    for (let i = 0; i < track.frames.length; i++) for (const scale of [0.8, 1.2, 2]) { const p = poseAt(track, scene, i, scale); if (!p?.quad) continue; frames++;
      assert.ok(plausible(p.quad), `${d} frame ${i}`); const q = (signedArea(p.quad) < 0 ? [p.quad[1], p.quad[0], p.quad[3], p.quad[2]] : p.quad).map(c => [c.x, c.y]);
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0], [0.5, 1]]) assert.ok(inFront(bentPoint(q, u, v, 0.18, false)), `${d} frame ${i}: corner (${u}, ${v}) behind the eye`); } }
  assert.ok(frames > 1000);
});

test('the turn of a card carried face up: the frames between the last back that is a card and the first face; none when it is not turned', async () => {
  const q = (x: number) => [[x, 500], [x + 60, 500], [x + 60, 590], [x, 590]];
  const frame = (i: number, side: string, quad: number[][] | null, edge: number[][] | null = null) => ({frame: i, side, quad, edge, confidence: 1}) as never;
  const track = (frames: unknown[]) => ({width: 1764, height: 1174, edgeWindow: null, leavesShoe: 2, frames}) as unknown as CardTrack;
  // back, back, a wedge (no card), two edge lines, a face without a quad, then the face
  const turned = track([frame(0, 'BACK', q(100)), frame(1, 'BACK', q(110)), frame(2, 'BACK', q(120)), frame(3, 'BACK', q(130)), frame(4, 'BACK', [[140, 500], [300, 500], [141, 501], [140, 590]]),
    frame(5, 'EDGE', null, [[150, 520], [210, 540]]), frame(6, 'EDGE', null, [[160, 530], [220, 550]]), frame(7, 'FRONT', null), frame(8, 'FRONT', q(180)), frame(9, 'FRONT', q(190))]);
  assert.deepEqual(turnOf(turned), {from: 4, to: 7});
  assert.equal(turnOf(track([frame(0, 'BACK', q(100)), frame(1, 'BACK', q(110)), frame(2, 'BACK', q(120)), frame(3, 'BACK', q(130))])), null, 'dealt face down: no turn');
  assert.equal(turnOf(track([frame(0, 'BACK', q(100)), frame(1, 'BACK', q(110)), frame(2, 'BACK', q(120)), frame(3, 'FRONT', q(130))])), null, 'turned between two frames: nothing between');
  // seat 4's take, as the scene session filmed it at both speeds: the turn is frames 45-52 (short lines across the fingers, then no quad)
  const file = 'assets/tracking/paow-giv-2-1-p4-04-01/card-track.json';
  if (fs.existsSync(file)) assert.deepEqual(turnOf(JSON.parse(await readFile(file, 'utf8'))), {from: 45, to: 52});
  // the dealer's hole card is dealt face down and never turns in the hand
  const hole = 'assets/tracking/paow-giv-2-1-d-c2-03-01/card-track.json';
  if (fs.existsSync(hole)) assert.equal(turnOf(JSON.parse(await readFile(hole, 'utf8'))), null);
});

test('a card lying since an earlier film is laid in the size and place the dealt card came to rest in, at every card size', () => {
  // src/scene3d-deal.ts lays a lying card with restingQuad(plan quad, Kortens storlek); the dealt card rests by poseAt with the plan's quad as land
  const track = deal(), plan = pts(shift(P4_FILM, 30, -12));
  for (const scale of [0.8, 1.2, 1.65, 2]) {
    const rest = poseAt(track, scene, 35, scale, 12, null, plan)!.quad!, lying = restingQuad(scene, plan, scale).quad;
    rest.forEach((p, i) => assert.ok(dist(p, lying[i]) < 1e-6 || lying.some(q => dist(p, q) < 1e-6), `scale ${scale} corner ${i}`));
    assert.ok(Math.abs(area(rest) - area(lying)) < 1e-6);
  }
});

test('under the line the drawn card takes over at rest by a fade: from the still frames before the rest, or over six frames after it; a card resting back up in one frame', async () => {
  // the made-up deal shrinks its card in the two frames before it lies (28, 29): no still frame, so the fade runs over the six after the rest
  const track = deal();
  assert.deepEqual(restFade(track), {from: 30, to: 30 + REST_FADE.after});
  // a card that lies on its place, give or take a pixel, from frame 20: the fade starts at most eight frames before the rest and ends there
  const settle = (from: number, off = 1): CardTrack => ({...track, frames: track.frames.map(f => f.frame >= from && f.frame < 30 ? {...f, side: 'FRONT' as const, quad: shift(P4_FILM, off, -off / 2), edge: null} : f)});
  assert.deepEqual(restFade(settle(20)), {from: 30 - REST_FADE.before, to: 30});
  assert.deepEqual(restFade(settle(24)), {from: 24, to: 30});
  // a short still run goes on past the rest, so that no fade is quicker than six frames; a card 3 px off is still moving
  assert.deepEqual(restFade(settle(28)), {from: 28, to: 34});
  assert.deepEqual(restFade(settle(20, 3)), {from: 30, to: 36});
  // nothing fades where the card lies from the clip's first frame (a return: drawn in full since the deal before it), or never lies
  const back: CardTrack = {width: 1764, height: 1174, edgeWindow: null, restFrom: 4, restQuad: P4_FILM, frames: Array.from({length: 10}, (_, i) => ({frame: i, side: 'FRONT' as const, quad: i < 4 ? shift(P4_FILM, 3 - i, 2) : P4_FILM, edge: null}))};
  assert.equal(restFade(back), null); assert.equal(restFade({...track, restFrom: null, restQuad: null, frames: track.frames.slice(0, 14)}), null);
  // a card that comes to rest back up (the hole card's deal) is swapped in one frame, however still it lies before its rest
  const faceDown = settle(20); faceDown.frames = faceDown.frames.map(f => f.frame >= 20 ? {...f, side: 'BACK' as const} : f);
  assert.equal(restFade(faceDown), null); assert.deepEqual(restShare(restFade(faceDown), 30), {card: 1, key: 1});
  // the shares: nothing before the fade; the drawn card comes in first, under the film's card (its edge and shadow beside it), and the
  // film's card is keyed away only once the drawn card is there in full, so the felt never shows through; all of both from the fade's
  // last frame on, and without a fade
  const fade = {from: 24, to: 30}, shares = Array.from({length: 12}, (_, i) => restShare(fade, 21 + i)), cards = shares.map(s => s.card), keys = shares.map(s => s.key);
  assert.deepEqual(shares.slice(0, 3), [{card: 0, key: 0}, {card: 0, key: 0}, {card: 0, key: 0}]);
  assert.ok(cards[3] > 0 && cards[3] < 0.6 && keys[3] === 0, 'its first frame: some of the drawn card, none of the key');
  shares.forEach((s, i) => assert.ok(s.key === 0 || s.card === 1, `frame ${21 + i}: the key only under the whole drawn card`));
  for (let i = 4; i <= 9; i++) assert.ok(cards[i] >= cards[i - 1] && keys[i] >= keys[i - 1] && keys[i] - keys[i - 1] < 0.35, `frame ${21 + i}: no more than 35 % of the key between two frames`);
  assert.ok(keys[5] > 0 && keys[8] > 0.8 && keys[8] < 1, 'the key over most of the fade');
  assert.deepEqual(shares.slice(9), [{card: 1, key: 1}, {card: 1, key: 1}, {card: 1, key: 1}]); assert.deepEqual(restShare(null, 0), {card: 1, key: 1});
  // the proof's takes, measured on their tracks 2026-11-13 (skipped without them): seat 4 7 still frames, seat 7 9, the dealer's first
  // card 15, the hole card's turn 2, seat 3 none; the hole card's deal rests back up and is swapped in one frame
  const measured: [string, {from: number; to: number} | null][] = [['paow-giv-2-1-p4-04-01', {from: 111, to: 118}], ['paow-giv-2-1-p7-06-01', {from: 82, to: 90}], ['paow-giv-2-1-p3-02-01', {from: 121, to: 127}],
    ['paow-giv-2-1-d-01-01', {from: 173, to: 181}], ['paow-giv-2-1-d-c2-03-01', null], ['paow-halkort-02-01', {from: 121, to: 127}]];
  for (const [clip, want] of measured) { const file = `assets/tracking/${clip}/card-track.json`; if (fs.existsSync(file)) assert.deepEqual(restFade(JSON.parse(await readFile(file, 'utf8'))), want, clip); }
  // the scene: only under the line, the drawn card lying under the film's card from the fade's first frame, the key's strength the share;
  // in the film's shader the strength scales everything the key does to the dealt card, the seated card's in full
  const deal3 = await readFile('src/scene3d-deal.ts', 'utf8'), film = await readFile('src/scene3d-film.ts', 'utf8');
  assert.ok(deal3.includes("const fade = carry === 'film' && landed ? restFade(track!) : null, before = !!fade && at >= fade.from && at < landed!.from;") && deal3.includes('dealCard(drawn, at, choice, extra, restShare(fade, at), before ? landed!.from : at);'), 'the deal fades under the line only');
  assert.ok(deal3.includes('held: inHand, strength: share.key, over:') && deal3.includes('contact: share.card * (') && deal3.includes('shown: share.card});'), 'the key takes its share, the drawn card and its contact shadow theirs');
  assert.ok(deal3.includes('vec4(col * grade * fanShade(vWorld), shown)') && deal3.includes('u.shown.value = how.shown ?? 1;'), 'the opacity of the drawn card in its shader');
  assert.ok(film.includes('float zone = smoothstep(-2., 2., quadIn(px, zoneQ)) * strength; if (zone <= 0.) return o;') && film.includes('cardHeld, cardStrength);') && film.includes('seatCore, 0., 1.);'), 'the shader scales the key of the dealt card');
});

test('the hole card\'s deal, as mended 2026-11-14: the whole card slides on under her hand and rests where the film\'s card stops', async t => {
  // the tracker held only the part of the card left of her fingers from frame 44 (half the card, 36 px to the left in one frame) and had
  // it at rest from 57, while the film's card slid on under her hand until 79: the drawn card shrank, smeared and lay still beside her
  // moving hand, with the film's card dark and yellow beside it (granskning 6, 99.6-100.3 s). Skipped while the tracker's own file is in place.
  const file = 'assets/tracking/paow-giv-2-1-d-c2-03-01/card-track.json'; if (!fs.existsSync(file)) return t.skip('no track');
  const track: CardTrack = JSON.parse(await readFile(file, 'utf8'));
  if (!String((track.frames[41] as {note?: string}).note ?? '').startsWith('mended')) return t.skip('the tracker\'s own track: the mended one is not installed');
  assert.equal(restOf(track)!.from, 80); assert.equal(turnOf(track), null); assert.equal(restFade(track), null);
  const sizes = Array.from({length: 41}, (_, i) => poseAt(track, scene, 40 + i, 1.2)!.quad!).map(q => Math.sqrt(area(q)));
  sizes.forEach((s, i) => { assert.ok(plausible(poseAt(track, scene, 40 + i, 1.2)!.quad!, 2.5 * PLAUSIBLE.size), `frame ${40 + i}`); if (i) assert.ok(Math.abs(s - sizes[i - 1]) < 4, `frame ${40 + i}: no jump in size`); });
  for (let f = 41; f <= 80; f++) assert.ok(dist(centre(poseAt(track, scene, f, 1.2)!.quad!), centre(poseAt(track, scene, f - 1, 1.2)!.quad!)) < 20, `frame ${f}: no jump in place`);
});
