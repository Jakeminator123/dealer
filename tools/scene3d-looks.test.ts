// The lab trials of 2026-11-12 in the 3D scene, their pure parts: the keyed shadow let go above the table edge, the felt's marks as
// switches, V6's cloth laid flat and made to repeat, the lamp above the dealer, and the chips' gloss. Each key's default must be
// the picture before it. No browser and no media: pictures here are made in the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {DEALER_LIGHT, FRAME_FIX, SHADOW_BAND, lightOnDealer, roomGlow, shadowAboveAt, type RoomGlow} from '../src/scene3d-film.ts';
import {FELT_MARKS, FELT_PX_PER_M, LAMP, NATURES, RUNWAY_CLOTH, RUNWAY_CLOTHS, feltMarks, flatten, foldDepth, isNature, isRunwayCloth, lampShade, marksText, rectify, reliefOf, seamless, type Picture} from '../src/scene3d-table.ts';
import {SCENE_KEYS} from '../studio/lib/scene-keys.ts';
import {KEYS as GAME_KEYS} from '../src/game-look.ts';
import {CHIP_GLOSS, chipRoughness} from '../src/game3d-chips.ts';
import {cameraFromContract, filmToTable, solveCamera, tableToFilm} from '../src/scene3d-geometry.ts';

// The plan's camera as data/scene-contract.json gives it, written out so the test reads no file.
const camera = cameraFromContract({keyFigures: {focalPx: {value: 886}, tiltDownDeg: {value: 2.5}, dealerEdgeImageRow: {value: 831.5}, heightAboveFeltMm: {value: 493}}, cardSizeAtTargets: {scale: {bodyScale: {k: 2}}}});
const meanOf = (p: Picture, k: number) => { let s = 0; for (let i = k; i < p.data.length; i += 3) s += p.data[i]; return s / (p.data.length / 3); };
const sdOf = (p: Picture, k: number) => { const m = meanOf(p, k); let s = 0; for (let i = k; i < p.data.length; i += 3) s += (p.data[i] - m) ** 2; return Math.sqrt(s / (p.data.length / 3)); };
const noise = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('every new key starts at the picture before it', () => {
  assert.equal(DEFAULTS.shadowAbove, 1); assert.equal(DEFAULTS.marks, 'all'); assert.equal(DEFAULTS.cloth, 'print'); assert.equal(DEFAULTS.lamp, 0); assert.equal(DEFAULTS.chipGloss, CHIP_GLOSS);
  assert.deepEqual([...feltMarks(DEFAULTS.marks)], [...FELT_MARKS]);
  for (let row = 700; row <= 900; row += 0.5) assert.equal(shadowAboveAt(row, DEFAULTS.shadowAbove), 1);
  for (const [x, s] of [[0, 0], [0.4, 0.3], [-0.9, 0.6]]) assert.equal(lampShade(x, s, DEFAULTS.lamp), 1);
  assert.deepEqual(chipRoughness(DEFAULTS.chipGloss), {face: 0.5, edge: 0.48}); // the literals the chips had
  // 2026-11-13: life in the room is off, and the room's light on the dealer leaves the film as it is
  assert.equal(DEFAULTS.roomLife, false); assert.equal(DEFAULTS.dealerRoom, 0);
  const warm: RoomGlow = {front: [0.4, 0.2, 0.1], left: [0.1, 0.1, 0.3], right: [0.9, 0.5, 0.2]}, same = {tint: [1, 1, 1], left: [1, 1, 1], right: [1, 1, 1]};
  for (const exposure of [0.42, 1, 2]) assert.deepEqual(lightOnDealer(warm, DEFAULTS.dealerRoom, exposure), same);
});

// ---- the lab trial of 2026-11-13: the room's light on the dealer (dealerRoom) ----
// A panorama of W × W/2 RGBA bytes made in the test, each pixel from its place in the picture (u, v from 0 to 1).
const picture = (W: number, at: (u: number, v: number) => number[]) => { const H = W / 2, d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set([...at((x + 0.5) / W, (y + 0.5) / H), 255], (y * W + x) * 4); return d; };
const lumaOf = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const TURN = (90 - 25) * Math.PI / 180; // the scene's common panoramaTurn and Venedig's own turn

test('the room light on the dealer: a grey room changes nothing, amount 0 and a built room leave the film as it is', () => {
  const same = {tint: [1, 1, 1], left: [1, 1, 1], right: [1, 1, 1]};
  for (const g of [40, 128, 230]) {
    const glow = roomGlow(picture(64, () => [g, g, g]), 64, 32, TURN, false), lin = glow.front[0];
    for (const side of [glow.front, glow.left, glow.right]) for (const c of side) assert.ok(Math.abs(c - lin) < 1e-12, 'a grey room gives the same light from every side');
    // as bright as the reference: exactly 1, 1, 1 everywhere, at any amount
    for (const amount of [0.3, 1]) assert.deepEqual(lightOnDealer(glow, amount, DEALER_LIGHT.ref / lin), same);
    // brighter or darker: a level only, no colour and no side
    const other = lightOnDealer(glow, 1, 0.5); assert.ok(other.tint[0] === other.tint[1] && other.tint[1] === other.tint[2]); assert.deepEqual([other.left, other.right], [[1, 1, 1], [1, 1, 1]]);
  }
  const coloured = roomGlow(picture(64, (u, v) => [200 * u, 120, 255 * v]), 64, 32, TURN, false);
  assert.deepEqual(lightOnDealer(coloured, 0, 0.42), same); assert.deepEqual(lightOnDealer(null, 1, 0.42), same); assert.deepEqual(lightOnDealer(coloured, Number.NaN), same);
  // the level follows the room only so far: a very dark or very bright room stays inside lo and hi
  const L = DEALER_LIGHT; for (const exposure of [0.001, 100]) { const t = lightOnDealer(coloured, 1, exposure).tint; assert.ok(lumaOf(t) > L.lo * 0.8 && lumaOf(t) < L.hi * 1.25, `${exposure}: ${t}`); }
});

test('the room light on the dealer: the side of her toward the bright part of the room is lighter, and its colour is the room\'s', () => {
  // As the scene turns Venedig (shown the right way round), the frame's right (+x) is seen at u 0.681 of its picture: there a
  // warm light, the rest of the room a dim blue sky
  const sun = picture(128, (u, v) => Math.abs(u - 0.681) < 0.06 && v > 0.3 && v < 0.55 ? [255, 190, 110] : [40, 55, 90]);
  const glow = roomGlow(sun, 128, 64, TURN, false), light = lightOnDealer(glow, 1, 1);
  assert.ok(lumaOf(glow.right) > 2 * lumaOf(glow.left), 'the light falls on the side toward the frame\'s right');
  for (let c = 0; c < 3; c++) assert.ok(light.right[c] > 1 && light.left[c] < 1, `channel ${c}`);
  assert.ok(light.right[0] - light.right[2] > 0.05, 'the lit side is warmer'); assert.ok(light.tint[2] > light.tint[0], 'over all of her the blue sky wins');
  // half the amount: half the way
  const half = lightOnDealer(glow, 0.5, 1); for (let c = 0; c < 3; c++) assert.ok(Math.abs((half.right[c] - 1) * 2 - (light.right[c] - 1)) < 1e-6);
  // mirrored: the same room read the other way across (a picture flipped and shown mirrored) gives the same light
  const W = 128, H = 64, flipped = new Uint8Array(sun.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) flipped.set(sun.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (y * W + W - 1 - x) * 4);
  const mirrored = roomGlow(flipped, W, H, TURN, true); for (const k of ['front', 'left', 'right'] as const) for (let c = 0; c < 3; c++) assert.ok(Math.abs(mirrored[k][c] - glow[k][c]) < 1e-9, `${k} ${c}`);
  // turned half round, the light comes from the frame's left instead
  const turned = roomGlow(sun, W, H, TURN + Math.PI, false); assert.ok(lumaOf(turned.left) > 2 * lumaOf(turned.right));
});

test('the shadow above the table edge goes, and fades in over the last rows so the felt shadow starts without a line', () => {
  assert.equal(FRAME_FIX.y, 831.5); assert.equal(camera.edgeRow, FRAME_FIX.y); // the fade ends where the film folds onto the felt
  assert.equal(shadowAboveAt(FRAME_FIX.y - SHADOW_BAND - 30, 0), 0); assert.equal(shadowAboveAt(FRAME_FIX.y - SHADOW_BAND, 0), 0);
  assert.equal(shadowAboveAt(FRAME_FIX.y, 0), 1); assert.equal(shadowAboveAt(FRAME_FIX.y + 40, 0), 1); // on the felt the shadow stays whole
  let last = -1; for (let row = 800; row <= 840; row += 0.25) { const v = shadowAboveAt(row, 0); assert.ok(v >= last - 1e-12 && v >= 0 && v <= 1); last = v; }
  // the arms' shadow in the base pictures reaches 38 to 44 rows above the edge: all but its last 8 rows are gone
  for (const top of [788, 792, 793]) assert.equal(shadowAboveAt(top, 0), 0);
  assert.ok(Math.abs(shadowAboveAt(FRAME_FIX.y - SHADOW_BAND / 2, 0.4) - 0.7) < 1e-9); // half way: half of what goes
});

test('the felt marks are one word in the state, each kind its own switch', () => {
  assert.equal(feltMarks(undefined).size, FELT_MARKS.length); assert.equal(feltMarks('ALL').size, FELT_MARKS.length);
  assert.equal(feltMarks('none').size, 0); assert.equal(feltMarks('').size, 0);
  assert.deepEqual([...feltMarks(' rings, numbers,logga+boxes')].sort(), ['boxes', 'numbers', 'rings']); // an unknown word is left out
  assert.equal(marksText(FELT_MARKS), 'all'); assert.equal(marksText([]), 'none'); assert.equal(marksText(['numbers', 'trim']), 'trim,numbers');
  for (const mark of FELT_MARKS) { const without = new Set(FELT_MARKS); without.delete(mark); assert.deepEqual(feltMarks(marksText(without)), without); }
});

test('the lamp above the dealer: as before at her hands, falling off toward the players and the ends', () => {
  assert.equal(lampShade(0, 0, 1), 1); assert.equal(lampShade(0, 0, 0.3), 1);
  let last = 2; for (let s = 0.05; s <= 0.6; s += 0.05) { const v = lampShade(0, s, 1); assert.ok(v < last && v > 0, `s ${s}`); last = v; }
  for (const x of [0.2, 0.5, 0.9]) { assert.equal(lampShade(x, 0.3, 0.7), lampShade(-x, 0.3, 0.7)); assert.ok(lampShade(x, 0.3, 1) < lampShade(0, 0.3, 1)); }
  for (const strength of [0, 0.25, 0.5, 1]) for (const [x, s] of [[0, 0.6], [0.9, 0.1], [0.5, 0.5]]) { const v = lampShade(x, s, strength); assert.ok(v >= 1 - strength - 1e-12 && v <= 1); }
  // in front of the players' seats (about 0.6 m out) half of the light is left at full strength, a fifth at the far ends
  assert.ok(Math.abs(lampShade(0, 0.6, 1) - 0.48) < 0.03); assert.ok(lampShade(0.9, 0.1, 1) < 0.3);
  assert.ok(LAMP.y > 0 && LAMP.s < 0.05); // it hangs above the dealer, not over the players
});

test('V6 cloth: a band of the film frame laid back flat through the film camera', () => {
  // a source whose red is its row and green its column, so each output pixel says where it was read
  const W = 1764, H = 1174, data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { data[(y * W + x) * 4] = y; data[(y * W + x) * 4 + 1] = x; }
  const box = {x: 0.2, s0: 0.28, s1: 0.42}, perM = 500, out = rectify({data, width: W, height: H}, camera, box, perM);
  assert.equal(out.width, 200); assert.equal(out.height, 70);
  const at = (i: number, j: number, k: number) => out.data[(j * out.width + i) * 3 + k];
  for (const [i, j] of [[0, 0], [100, 35], [199, 69], [37, 12]]) {
    const x = -box.x + (i + 0.5) / perM, s = box.s0 + (j + 0.5) / perM, f = tableToFilm(camera, x * camera.scale, s * camera.scale - solveCamera(camera).edgeDistance);
    assert.ok(Math.abs(at(i, j, 0) - f.y) < 1e-3 && Math.abs(at(i, j, 1) - f.x) < 1e-3, `${i},${j}`);
  }
  for (let j = 1; j < out.height; j++) assert.ok(at(100, j, 0) > at(100, j - 1, 0)); // nearer the players is lower in the frame
  // the band lies in the bottom of the frame, between the felt's row 960 and the frame's last row
  assert.ok(at(100, 0, 0) > 960 && at(100, out.height - 1, 0) < H);
  const near = filmToTable(camera, 881.5, at(100, 0, 0))!; assert.ok(Math.abs((near.z + solveCamera(camera).edgeDistance) / camera.scale - (box.s0 + 0.5 / perM)) < 1e-6);
});

test('V6 cloth: its own light is divided out and the tile repeats without a seam, its grain kept', () => {
  const W = 300, H = 120, rand = noise(11), data = new Float32Array(W * H * 3);
  // grain on a light that falls from left to right and from top to bottom (V6's vignette), in V6's dark green
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const light = (1.3 - 0.6 * x / W) * (1.15 - 0.3 * y / H), g = 0.85 + 0.3 * rand(); for (let k = 0; k < 3; k++) data[(y * W + x) * 3 + k] = [22, 33, 28][k] * light * g; }
  const flat = flatten({data, width: W, height: H}, 20, [22, 33, 28]);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(meanOf(flat, k) - [22, 33, 28][k]) < 0.6, `channel ${k}`);
  const column = (p: Picture, x0: number) => { let s = 0, n = 0; for (let y = 0; y < p.height; y++) for (let x = x0; x < x0 + 30; x++) { s += p.data[(y * p.width + x) * 3 + 1]; n++; } return s / n; };
  assert.ok(Math.abs(column(flat, 10) - column(flat, 260)) < 1, 'the light from left to right is gone'); assert.ok(column({data, width: W, height: H}, 10) - column({data, width: W, height: H}, 260) > 10);
  const tile = seamless(flat, 40); assert.equal(tile.width, 260); assert.equal(tile.height, 80);
  // across the wrap a pixel differs from its neighbour no more than inside the tile
  const g = (x: number, y: number) => tile.data[(y * tile.width + x) * 3 + 1];
  let inside = 0, wrapX = 0, wrapY = 0; for (let y = 0; y < tile.height; y++) { inside += Math.abs(g(100, y) - g(101, y)); wrapX += Math.abs(g(tile.width - 1, y) - g(0, y)); }
  for (let x = 0; x < tile.width; x++) wrapY += Math.abs(g(x, tile.height - 1) - g(x, 0));
  assert.ok(wrapX / tile.height < 1.6 * inside / tile.height && wrapY / tile.width < 1.6 * inside / tile.height);
  // the blend keeps the grain's contrast in the faded columns
  const strip = (x0: number): Picture => { const d = new Float32Array(tile.height * 10 * 3); for (let y = 0; y < tile.height; y++) for (let x = 0; x < 10; x++) for (let k = 0; k < 3; k++) d[(y * 10 + x) * 3 + k] = tile.data[(y * tile.width + x0 + x) * 3 + k]; return {data: d, width: 10, height: tile.height}; };
  assert.ok(Math.abs(sdOf(strip(15), 1) / sdOf(strip(150), 1) - 1) < 0.25);
});

// ---- the lab trial of 2026-11-13: the felt of a generated photograph (cloth "runway") and the surface "natur" ----
test('the generated felt and the natural surface start switched off', () => {
  assert.equal(DEFAULTS.cloth, 'print'); assert.equal(DEFAULTS.surface, 'painted');
  // the felt's band lies in front of the shoe and the hands (the shoe's box reaches row 905) and inside the frame at its near end
  const edge = solveCamera(camera).edgeDistance, at = (x: number, s: number) => tableToFilm(camera, x * camera.scale, s * camera.scale - edge);
  assert.ok(at(0, RUNWAY_CLOTH.s0).y > 905 + 15); assert.ok(at(0, RUNWAY_CLOTH.s1).y < 1174);
  for (const side of [-1, 1]) { const f = at(side * RUNWAY_CLOTH.x, RUNWAY_CLOTH.s1); assert.ok(f.x > 0 && f.x < 1764, `x ${f.x}`); }
  assert.equal(FELT_PX_PER_M, 4096 / 2.8); // a cloth tile is stored at the felt image's own pixels per metre
  assert.ok(!isRunwayCloth(DEFAULTS.cloth) && !isNature(DEFAULTS.surface) && !isRunwayCloth('print') && !isRunwayCloth('v6') && !isNature('photo') && !isNature('toString'));
});

test('the versions of the generated felt and of the natural surface: one table each, and every menu names the same words', () => {
  const cloths = Object.keys(RUNWAY_CLOTHS), natures = Object.keys(NATURES);
  assert.deepEqual(cloths, ['runway', 'runway-2', 'runway-3']); assert.deepEqual(natures, ['natur', 'natur-2', 'natur-3']);
  for (const id of cloths) { assert.ok(isRunwayCloth(id)); assert.match(RUNWAY_CLOTHS[id as keyof typeof RUNWAY_CLOTHS].url, /^assets\/scene\/materials\/runway_felt(_\d+)?-diffuse\.webp$/); }
  assert.equal(new Set(Object.values(RUNWAY_CLOTHS).map(c => c.url)).size, cloths.length, 'each cloth its own tile');
  for (const id of natures) { const f = NATURES[id as keyof typeof NATURES]; assert.ok(isNature(id)); assert.match(f.hide, /^assets\/scene\/materials\/runway_leather(_\d+)?-diffuse\.webp$/);
    assert.ok(1024 % f.repeat === 0, 'the hide fits the leather\'s tile a whole number of times'); assert.ok(f.depth > 0 && f.depth < 0.2 && f.folds >= 0 && f.folds < 1, 'grain and puckers are shallow, in millimetres');
    assert.ok(f.rough > 0.1 && f.rough + 0.3 <= 1 && f.coat >= 0 && f.coat <= 1 && f.light > 0); }
  // the first surface is the one of the first night, unchanged: no finish over it and no puckers
  assert.deepEqual([NATURES.natur.rough, NATURES.natur.coat, NATURES.natur.folds, NATURES.natur.depth, NATURES.natur.repeat], [0.34, 0, 0, 0.05, 2]);
  // the studio's menus and the game's key catalogue name the same words, after the ones that were there before
  const studio = (key: string) => { const spec = SCENE_KEYS.find(s => s.key === key)!; return spec.kind === 'choice' ? spec.options.map(o => o.value) : []; };
  const game = (key: 'cloth' | 'surface') => { const kind = GAME_KEYS[key]; return kind.kind === 'choice' ? [...kind.options] : []; };
  assert.deepEqual(studio('cloth'), ['print', 'v6', ...cloths]); assert.deepEqual(game('cloth'), ['print', 'v6', ...cloths]);
  assert.deepEqual(studio('surface'), ['painted', 'photo', ...natures]); assert.deepEqual(game('surface'), ['painted', 'photo', ...natures]);
  assert.deepEqual(SCENE_KEYS.find(s => s.key === 'roomLight')!.needs, {key: 'surface', is: ['photo', ...natures]}, 'the room lights every surface but the painted one');
});

test('the puckers across the rail: shallow valleys that repeat with the tile, deepest on the inner shoulder', () => {
  const shoulder = 0.3; let deepest = 0, sum = 0, n = 0;
  for (let u = 0; u < 1; u += 0.002) for (const v of [0.1, shoulder, 0.6, 0.9]) { const d = foldDepth(u, v, shoulder); assert.ok(d >= 0 && d <= 1); if (v === shoulder) { deepest = Math.max(deepest, d); sum += d; n++; } }
  assert.ok(deepest > 0.95, 'a pucker reaches its full depth on the shoulder'); assert.ok(sum / n < 0.2, 'most of the leather between them lies smooth');
  for (const [u, v] of [[0.07, 0.3], [0.5, 0.7], [0.99, 0.2]]) assert.ok(Math.abs(foldDepth(u, v, shoulder) - foldDepth(u + 1, v, shoulder)) < 1e-9 && Math.abs(foldDepth(u, v, shoulder) - foldDepth(u - 1, v, shoulder)) < 1e-9);
  // far round the roll from the shoulder a pucker is less than half as deep
  let far = 0; for (let u = 0; u < 1; u += 0.002) far = Math.max(far, foldDepth(u, shoulder + 0.5, shoulder)); assert.ok(far < 0.45 && far > 0.2);
});

test('a picture of the frame that is larger than the frame is laid flat as the frame itself would be', () => {
  const W = 1764, H = 1174, Z = 2, small = new Float32Array(W * H * 4), large = new Float32Array(W * Z * H * Z * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { small[(y * W + x) * 4] = y; small[(y * W + x) * 4 + 1] = x; }
  for (let y = 0; y < H * Z; y++) for (let x = 0; x < W * Z; x++) { large[(y * W * Z + x) * 4] = y / Z; large[(y * W * Z + x) * 4 + 1] = x / Z; }
  const box = {x: 0.2, s0: 0.25, s1: 0.4}, one = rectify({data: small, width: W, height: H}, camera, box, 300), two = rectify({data: large, width: W * Z, height: H * Z}, camera, box, 300, Z);
  assert.equal(two.width, one.width); assert.equal(two.height, one.height);
  for (let i = 0; i < one.data.length; i += 97) assert.ok(Math.abs(one.data[i] - two.data[i]) < 1e-2, `value ${i}`);
});

test('the relief of a photographed hide: a crease lies low, an even light and a slow change of tone are nothing', () => {
  const S = 64, flat = new Float32Array(S * S * 4).fill(120);
  assert.ok(reliefOf(flat, S, 4).every(v => v === 0));
  // a tone that changes slowly across the tile (and wraps), with one dark crease down column 20
  const data = new Float32Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 100 + 8 * Math.sin(2 * Math.PI * x / S) - (x === 20 ? 40 : 0); for (let k = 0; k < 3; k++) data[(y * S + x) * 4 + k] = v; }
  const relief = reliefOf(data, S, 4);
  for (let y = 0; y < S; y += 7) { assert.equal(relief[y * S + 20], -1, 'the crease is as low as the relief goes'); assert.ok(Math.abs(relief[y * S + 45]) < 0.15, 'the slow tone leaves almost nothing'); }
  assert.ok(relief.every(v => v >= -1 && v <= 1));
  // the tile repeats: the mean round a pixel wraps, so the first and the last column of an even picture are alike
  const stripes = new Float32Array(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let k = 0; k < 3; k++) stripes[(y * S + x) * 4 + k] = 100 + 20 * Math.cos(2 * Math.PI * x / 8);
  const wrapped = reliefOf(stripes, S, 4); assert.ok(Math.abs(wrapped[0] - wrapped[8]) < 1e-4 && Math.abs(wrapped[S - 8] - wrapped[0]) < 1e-4);
});

test('the chips gloss follows the chip study round their own look', () => {
  assert.equal(CHIP_GLOSS, 0.5); assert.deepEqual(chipRoughness(CHIP_GLOSS), {face: 0.5, edge: 0.48});
  assert.ok(Math.abs(chipRoughness(1).face - 0.36) < 1e-9 && Math.abs(chipRoughness(0).face - 0.64) < 1e-9); // the study's 0.64 - 0.28 x gloss
  let last = 2; for (let g = 0; g <= 1; g += 0.1) { const r = chipRoughness(g); assert.ok(r.face < last && Math.abs(r.face - r.edge - 0.02) < 1e-9); last = r.face; }
  assert.deepEqual(chipRoughness(3), chipRoughness(1)); assert.deepEqual(chipRoughness(-1), chipRoughness(0)); assert.deepEqual(chipRoughness(Number.NaN), chipRoughness(CHIP_GLOSS));
});
