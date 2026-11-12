// The lab trials of 2026-11-12 in the 3D scene, their pure parts: the keyed shadow let go above the table edge, the felt's marks as
// switches, V6's cloth laid flat and made to repeat, the lamp above the dealer, and the chips' gloss. Each key's default must be
// the picture before it. No browser and no media: pictures here are made in the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {FRAME_FIX, SHADOW_BAND, shadowAboveAt} from '../src/scene3d-film.ts';
import {FELT_MARKS, LAMP, feltMarks, flatten, lampShade, marksText, rectify, seamless, type Picture} from '../src/scene3d-table.ts';
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

test('the chips gloss follows the chip study round their own look', () => {
  assert.equal(CHIP_GLOSS, 0.5); assert.deepEqual(chipRoughness(CHIP_GLOSS), {face: 0.5, edge: 0.48});
  assert.ok(Math.abs(chipRoughness(1).face - 0.36) < 1e-9 && Math.abs(chipRoughness(0).face - 0.64) < 1e-9); // the study's 0.64 - 0.28 x gloss
  let last = 2; for (let g = 0; g <= 1; g += 0.1) { const r = chipRoughness(g); assert.ok(r.face < last && Math.abs(r.face - r.edge - 0.02) < 1e-9); last = r.face; }
  assert.deepEqual(chipRoughness(3), chipRoughness(1)); assert.deepEqual(chipRoughness(-1), chipRoughness(0)); assert.deepEqual(chipRoughness(Number.NaN), chipRoughness(CHIP_GLOSS));
});
