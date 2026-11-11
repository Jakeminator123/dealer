// Offline tests for the rendered-card overlay model. No media, WebGL or network: tracks are made up
// here and the only file read is the tracked scene contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sceneOf, restingQuad, restOf, poseAt, cardToImage, projectionOf, regionOf, readMatte, filmZone, shiftShare, placedCard, landing, leakCount, strayBoxes, ranges, MARGIN, STRAY, overridesOf, cardInFront, describeTrack, RIM, type CardTrack, type Scene} from '../src/card-overlay.ts';
import {signedArea, centre, dist, type Pt} from '../src/card-track.ts';

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
