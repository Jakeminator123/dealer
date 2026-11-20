// Table BORD-02 as a second table model of the 3D scene (src/scene3d-bord02.ts), its pure parts: the outline at its measured
// size, the cut for the chip tray, the cloth, the side and the roll as geometry, that the plan's cards and bets lie on its felt
// inside the roll, and that its surfaces are known wherever a key or a file of theirs must be named. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type * as T from 'three';
import {BORD02, BORD02_FINISHES, BORD02_SCANS, bord02ClothLit, bord02Felt, bord02Outline, bord02Rail, bord02Scale, bord02Wall} from '../src/scene3d-bord02.ts';
import {betSpots, cameraFromContract, cardSpots, edgeRowOf, lensCamera} from '../src/scene3d-geometry.ts';
import {PRINT, TABLE_SIZE, tableUnder} from '../src/scene3d-table.ts';
import {TABLE_LENS} from '../src/table-lens.ts';
import {KEYS} from '../src/game-look.ts';
import {SCENE_FILES, SCRIPTS} from './lab-routes.ts';

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const contract = json('data/scene-contract.json'), plan = json('placements/default.json');
const lens = lensCamera(TABLE_LENS, edgeRowOf(contract)), film = cameraFromContract(contract);
const close = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);
const area = (p: number[][]) => p.reduce((sum, [x, s], i) => { const [x1, s1] = p[(i + 1) % p.length]; return sum + (x * s1 - x1 * s) / 2; }, 0);
const inside = (p: number[][], x: number, s: number) => { let within = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > s) !== (p[j][1] > s) && x < p[i][0] + (p[j][0] - p[i][0]) * (s - p[i][1]) / (p[j][1] - p[i][1])) within = !within;
  return within; };
const toSegment = (x: number, s: number, [xa, sa]: number[], [xb, sb]: number[]) => { const dx = xb - xa, ds = sb - sa, t = Math.max(0, Math.min(1, ((x - xa) * dx + (s - sa) * ds) / (dx * dx + ds * ds || 1))); return Math.hypot(x - xa - t * dx, s - sa - t * ds); };
const triangles = (g: T.BufferGeometry) => { const at = g.getAttribute('position'), index = g.getIndex()!, corner = (i: number) => [at.getX(i), at.getY(i), at.getZ(i)];
  return Array.from({length: index.count / 3}, (_, i) => [0, 1, 2].map(k => corner(index.getX(3 * i + k)))); };
const facing = ([a, b, c]: number[][]) => { const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };

test('under the lens BORD-02 is as large as it was measured, and it follows the key tableSize', () => {
  assert.deepEqual(bord02Scale(tableUnder(lens, 1)), {x: 1, s: 1});
  const {points, arc} = bord02Outline(bord02Scale(tableUnder(lens, 1))), xs = points.map(p => p[0]), ss = points.map(p => p[1]);
  close(Math.max(...xs) - Math.min(...xs), 1.92, 1e-9, 'width'); close(Math.max(...ss) - Math.min(...ss), 1.296, 1e-9, 'depth');
  close(Math.max(...ss), BORD02.front, 1e-9, "the players' edge"); close(Math.min(...ss), BORD02.rear, 1e-9, 'the back of the wings');
  assert.deepEqual(points[0], [BORD02.radius, BORD02.shoulder]); assert.deepEqual(points[arc], [-BORD02.radius, BORD02.shoulder]);
  // the dealer's edge is where the film's body ends: the middle of the notch is s = 0
  const middle = points.filter(p => Math.abs(p[0]) < 1e-9 && p[1] < 0.5); assert.equal(middle.length, 1); close(middle[0][1], 0, 1e-12, "the dealer's edge");
  const wide = bord02Scale(tableUnder(lens, TABLE_SIZE.max)); close(wide.x, TABLE_SIZE.max, 1e-12, 'wider'); close(wide.s, TABLE_SIZE.max, 1e-12, 'deeper');
  // under the contract's camera the standard table is half a real table's depth, and so is this one
  const shallow = bord02Scale(tableUnder(film, 1)); close(shallow.x, 1, 1e-12, 'width under the contract'); assert.ok(shallow.s > 0.5 && shallow.s < 0.55, `depth under the contract: ${shallow.s}`);
});

test('the outline goes once round against the clock, mirrored left to right, and no two of its sides cross', () => {
  const {points} = bord02Outline(), n = points.length;
  assert.ok(area(points) > 1.8 && area(points) < 2.2, `the table's area: ${area(points)} square metres`);
  for (let i = 0; i < n; i++) { const [x, s] = points[i], [x1, s1] = points[(i + 1) % n]; assert.ok(Math.hypot(x1 - x, s1 - s) > 1e-4, `point ${i} is not the next one`);
    assert.ok(points.some(q => Math.abs(q[0] + x) < 1e-9 && Math.abs(q[1] - s) < 1e-9), `point ${i} has its mirror`); }
  const turn = (a: number[], b: number[], c: number[]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue;
    const a = points[i], b = points[i + 1], c = points[j], d = points[(j + 1) % n];
    assert.ok(!(turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0), `sides ${i} and ${j} cross`); }
});

test('the cut for the chip tray goes in from the dealer\'s side and takes nothing else', () => {
  const whole = bord02Outline().points, notch = {x0: -0.2, x1: 0.16, s1: 0.11}, cut = bord02Outline({x: 1, s: 1}, notch).points;
  assert.ok(inside(whole, 0, 0.05) && !inside(cut, 0, 0.05), 'the tray stands in a hole');
  assert.ok(inside(cut, 0, 0.12) && inside(cut, -0.21, 0.05) && inside(cut, 0.17, 0.05), 'the felt begins at the cut');
  for (const corner of [[notch.x0, notch.s1], [notch.x1, notch.s1]]) assert.ok(cut.some(p => p[0] === corner[0] && p[1] === corner[1]), 'the corners of the cut are points of the outline');
  // the dealer's edge bends back from the middle of her notch, so the cut takes a little more than its own rectangle from s = 0
  const taken = area(whole) - area(cut), wide = notch.x1 - notch.x0;
  assert.ok(taken >= wide * notch.s1 && taken < wide * (notch.s1 - BORD02.rear), `the cut takes ${taken} square metres`);
  assert.deepEqual(bord02Outline({x: 1, s: 1}, {x0: 0.1, x1: 0.1, s1: 0.2}).points, whole, 'a cut with no width is no cut');
});

test('every card place and bet ring of the plan lies on the felt, inside the roll', () => {
  // under the contract's camera (Scen: "Bred lins") from size 1: below it the outer rings reach the roll, as on the standard table
  for (const [camera, size] of [[lens, 1], [lens, TABLE_SIZE.min], [lens, TABLE_SIZE.max], [film, 1], [film, TABLE_SIZE.max]] as const) {
    const {points, arc} = bord02Outline(bord02Scale(tableUnder(camera, size))), fromRoll = (x: number, s: number) => Math.min(...Array.from({length: arc}, (_, i) => toSegment(x, s, points[i], points[i + 1])));
    const cards = cardSpots(plan, camera), bets = betSpots(plan, camera);
    assert.ok(cards.length >= 14 && bets.length === 7, `${cards.length} card places and ${bets.length} rings`);
    for (const p of cards) { assert.ok(inside(points, p.x, p.s), `${p.id} at size ${size} is on the table`); assert.ok(fromRoll(p.x, p.s) > BORD02.rail.width + 0.08, `${p.id} at size ${size} is clear of the roll: ${fromRoll(p.x, p.s)}`); }
    for (const b of bets) { assert.ok(inside(points, b.x, b.s), `ring ${b.id} at size ${size} is on the table`); assert.ok(fromRoll(b.x, b.s) - b.radius > BORD02.rail.width, `ring ${b.id} at size ${size} is clear of the roll: ${fromRoll(b.x, b.s) - b.radius}`); }
  }
});

test('the cloth is one sheet facing up over the whole outline, and the felt image lies on it where the scene draws it', () => {
  for (const notch of [undefined, {x0: -0.2, x1: 0.16, s1: 0.11}]) {
    const {points} = bord02Outline({x: 1, s: 1}, notch), g = bord02Felt(points), faces = triangles(g);
    let sum = 0; for (const face of faces) { const n = facing(face); assert.ok(n[1] > 0, 'a face of the cloth looks up'); sum += n[1] / 2; }
    close(sum, area(points), 1e-6, 'the area of the cloth');
    const at = g.getAttribute('position'), uv = g.getAttribute('uv'), print = g.getAttribute('printUv');
    for (let i = 0; i < at.count; i++) { assert.equal(at.getY(i), 0); close(uv.getX(i), at.getX(i), 1e-6, 'u in metres'); close(uv.getY(i), at.getZ(i), 1e-6, 'v in metres');
      close(print.getX(i), (at.getX(i) + PRINT.width / 2) / PRINT.width, 1e-6, 'the image across'); close(print.getY(i), 1 - (at.getZ(i) + PRINT.back) / PRINT.depth, 1e-6, 'the image in depth'); }
  }
  // the felt image reaches over the whole table from the dealer's edge to the players'; the wings behind her are outside it (plain cloth)
  const {points} = bord02Outline(); for (const [x, s] of points.filter(p => p[1] >= -PRINT.back)) assert.ok(Math.abs(x) <= PRINT.width / 2 && s <= PRINT.depth - PRINT.back, `the image covers ${x}, ${s}`);
});

test('the side faces out all the way round, also in the cut, and the roll lies inside the outline on the felt', () => {
  const {points} = bord02Outline({x: 1, s: 1}, {x0: -0.2, x1: 0.16, s1: 0.11}), wall = bord02Wall(points, BORD02.bands.bottom, 0), normal = wall.getAttribute('normal'), at = wall.getAttribute('position'), index = wall.getIndex()!;
  const faces = triangles(wall); assert.equal(faces.length, points.length * 2);
  faces.forEach((face, i) => { const n = facing(face), l = Math.hypot(...n), mid = [0, 1, 2].map(k => (face[0][k] + face[1][k] + face[2][k]) / 3);
    assert.ok(!inside(points, mid[0] + n[0] / l * 1e-4, mid[2] + n[2] / l * 1e-4), `face ${i} of the side looks out of the table`);
    for (let k = 0; k < 3; k++) { const v = index.getX(3 * i + k); assert.ok(normal.getX(v) * n[0] + normal.getZ(v) * n[2] > 0, 'its normals look the same way'); } });
  for (let i = 0; i < at.count; i++) assert.ok(at.getY(i) === 0 || Math.abs(at.getY(i) - BORD02.bands.bottom) < 1e-6);
  const {roll, seam} = bord02Rail(), whole = bord02Outline().points, p = roll.getAttribute('position'), n = roll.getAttribute('normal');
  let top = -1, low = 1, out = 0;
  for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); low = Math.min(low, p.getY(i)); close(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), 1, 1e-5, 'a normal of the roll');
    if (!inside(whole, p.getX(i), p.getZ(i))) out = Math.max(out, Math.min(...whole.map((q, j) => toSegment(p.getX(i), p.getZ(i), q, whole[(j + 1) % whole.length])))); }
  close(top, BORD02.rail.lift + BORD02.rail.round, 1e-6, 'the top of the roll'); assert.ok(low < 0, 'the roll is sunk into the felt, so no gap shows under it');
  assert.ok(out < 1e-4, `the roll stays inside the outline: ${out}`);
  for (const face of triangles(roll)) assert.ok(Math.hypot(...facing(face)) > 0, 'no face of the roll is a line');
  assert.equal(seam.length % 6, 0); for (let i = 0; i < seam.length; i += 3) { close(seam[i + 1], BORD02.rail.seamY, 1e-12, 'the height of a stitch'); assert.ok(inside(whole, seam[i], seam[i + 2]), 'a stitch lies on the table'); }
});

test('the surfaces: every choice is a key\'s value, every scan has its three maps with the lab server and its line in the register', () => {
  const kinds = KEYS as Record<string, {options?: readonly string[]} | undefined>, valuesOf = (key: string) => [...(kinds[key]?.options ?? [])];
  assert.deepEqual(valuesOf('modelCloth'), Object.keys(BORD02_FINISHES.cloth)); assert.deepEqual(valuesOf('modelWood'), Object.keys(BORD02_FINISHES.wood)); assert.deepEqual(valuesOf('modelRail'), Object.keys(BORD02_FINISHES.rail));
  assert.deepEqual(valuesOf('tableModel'), ['standard', 'bord-02']);
  assert.equal(SCRIPTS['/scene3d-bord02.js'], 'src/scene3d-bord02.ts');
  const register = readFileSync('data/scene-materials.json', 'utf8'), used = new Set(Object.values(BORD02_FINISHES).flatMap(group => Object.values(group).map(finish => finish.scan)));
  assert.deepEqual([...used].sort(), Object.keys(BORD02_SCANS).sort(), 'every scan is worn by a choice');
  for (const [id, scan] of Object.entries(BORD02_SCANS)) { assert.ok(scan.metres[0] > 0.05 && scan.metres[1] > 0.05 && scan.mean.every(v => v >= 0 && v <= 255));
    for (const kind of ['diffuse', 'nor_gl', 'rough']) { const file = `${id}-${kind}.webp`; assert.ok(SCENE_FILES.includes(`assets/scene/materials/${file}`), `${file} is handed out by the lab server`); assert.ok(register.includes(`"${file}"`), `${file} stands in data/scene-materials.json`); } }
  // the cloth keeps its own light where the standard table's does: on the painted table and on a surface "duk"
  assert.equal(bord02ClothLit('painted'), false); assert.equal(bord02ClothLit('natur-duk'), false); assert.equal(bord02ClothLit('photo'), true); assert.equal(bord02ClothLit('natur'), true);
});
