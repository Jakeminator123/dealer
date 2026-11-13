// The generated materials of the 3D table (tools/scene-material.ts), their pure parts: pieces of an even material scattered
// into a tile that repeats, the felt tile laid flat out of a picture of the frame, and a flat material picture made to repeat.
// No browser and no media: pictures here are made in the test. The register is read, to see that it names what the scene asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FILM, cameraFromContract} from '../src/scene3d-geometry.ts';
import {FELT_PX_PER_M, NATURES, RUNWAY_CLOTH, RUNWAY_CLOTHS, type Picture} from '../src/scene3d-table.ts';
import {feltTile, hideTile, meanOf, scattered, seamRatio} from './scene-material.ts';

const camera = cameraFromContract({keyFigures: {focalPx: {value: 886}, tiltDownDeg: {value: 2.5}, dealerEdgeImageRow: {value: 831.5}, heightAboveFeltMm: {value: 493}}, cardSizeAtTargets: {scale: {bodyScale: {k: 2}}}});
const noise = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sdOf = (p: Picture, k: number) => { const m = meanOf(p)[k]; let s = 0; for (let i = k; i < p.data.length; i += 3) s += (p.data[i] - m) ** 2; return Math.sqrt(s / (p.data.length / 3)); };
const grainy = (width: number, height: number, colour: number[], seed: number, light = (_x: number, _y: number) => 1): Picture => { const rand = noise(seed), data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const g = 0.85 + 0.3 * rand(); for (let k = 0; k < 3; k++) data[(y * width + x) * 3 + k] = colour[k] * g * light(x, y); } return {data, width, height}; };

test('scattered pieces make a larger tile that repeats, with the colour and the grain of the picture', () => {
  const band = grainy(120, 41, [37, 108, 77], 5), tile = scattered(band, 8, 4, 7);
  assert.equal(tile.width, 8 * 20); assert.equal(tile.height, 4 * 20); // pieces of 40 (the shorter side, made even), laid half over each other
  const mean = meanOf(tile), from = meanOf(band); for (let k = 0; k < 3; k++) assert.ok(Math.abs(mean[k] - from[k]) < 0.01 * from[k], `channel ${k}`);
  assert.ok(Math.abs(sdOf(tile, 1) / sdOf(band, 1) - 1) < 0.15, 'the grain keeps its contrast where pieces overlap');
  assert.ok(seamRatio(tile) < 1.4, 'no join shows across the wrap');
  for (const v of tile.data) assert.ok(Number.isFinite(v));
  assert.deepEqual(scattered(band, 8, 4, 7).data, tile.data); assert.notDeepEqual(scattered(band, 8, 4, 8).data, tile.data); // same seed, same tile
  assert.throws(() => scattered(band, 1, 4), /scatter/);
});

test('the felt tile: a band of a larger picture of the frame, its lamp light gone, about 1.5 by 0.6 metres', () => {
  // a picture of the frame twice its size: grain on a light that falls off from the middle toward the sides, as under a lamp
  const Z = 2, W = FILM.width * Z, H = FILM.height * Z, rand = noise(3), data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const light = 1.25 - 0.5 * Math.abs(x / W - 0.5), g = 0.9 + 0.2 * rand(), i = (y * W + x) * 4; data[i] = 37 * light * g; data[i + 1] = 108 * light * g; data[i + 2] = 77 * light * g; data[i + 3] = 255; }
  const perM = 300, tile = feltTile({data, width: W, height: H}, camera, perM);
  const piece = Math.min(Math.round(2 * RUNWAY_CLOTH.x * perM), Math.round((RUNWAY_CLOTH.s1 - RUNWAY_CLOTH.s0) * perM)) >> 1;
  assert.equal(tile.width % piece, 0); assert.equal(tile.height % piece, 0);
  assert.ok(Math.abs(tile.width / perM - 1.5) < 0.2 && Math.abs(tile.height / perM - 0.6) < 0.15, `${tile.width} x ${tile.height}`);
  const column = (x0: number) => { let s = 0, n = 0; for (let y = 0; y < tile.height; y++) for (let x = x0; x < x0 + piece; x++) { s += tile.data[(y * tile.width + x) * 3 + 1]; n++; } return s / n; };
  const columns = Array.from({length: tile.width / piece}, (_, i) => column(i * piece)), mean = meanOf(tile)[1];
  for (const c of columns) assert.ok(Math.abs(c / mean - 1) < 0.03, 'no part of the tile is lighter than another');
  assert.ok(seamRatio(tile) < 1.4);
});

test('a flat material picture is made to repeat at the size asked for', () => {
  const size = 96, fade = 16, picture = grainy(size + fade, size + fade, [71, 46, 38], 9, (x, y) => (1.2 - 0.4 * x / (size + fade)) * (1.1 - 0.2 * y / (size + fade)));
  const tile = hideTile(picture, size, fade);
  assert.equal(tile.width, size); assert.equal(tile.height, size);
  const mean = meanOf(tile), from = meanOf(picture); for (let k = 0; k < 3; k++) assert.ok(Math.abs(mean[k] - from[k]) < 0.03 * from[k]);
  assert.ok(seamRatio(tile) < 1.6, 'the uneven light is gone, so the edges meet');
  assert.throws(() => hideTile(grainy(size, size, [71, 46, 38], 9), size, fade), /pixels square/);
});

test('the register names the maps the scene asks for, each with its source and its order', () => {
  const register = JSON.parse(readFileSync('data/scene-materials.json', 'utf8')).generated;
  const files = register.maps.map((m: {file: string}) => `assets/scene/materials/${m.file}`);
  const asked = [...new Set([...Object.values(RUNWAY_CLOTHS).map(c => c.url), ...Object.values(NATURES).map(n => n.hide)])];
  assert.deepEqual([...files].sort(), asked.sort(), 'every version of the scene has its map in the register, and the register no map the scene does not ask for');
  for (const m of register.maps) { assert.match(m.sourceSha256, /^[0-9a-f]{64}$/); assert.match(m.task, /^[0-9a-f-]{36}$/); assert.ok(['felt', 'hide'].includes(m.kind) && m.prompt.length > 40 && m.use.length > 10, m.id);
    assert.equal(m.file.startsWith('runway_felt') ? 'felt' : 'hide', m.kind, m.id); }
  assert.equal(new Set(register.maps.map((m: {id: string}) => m.id)).size, register.maps.length);
  assert.ok(Number.isFinite(FELT_PX_PER_M));
});
