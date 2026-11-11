import test from 'node:test';
import assert from 'node:assert/strict';
import {bounds, simplifyTo, creasedNormals, placeOnOrigin, writeGlb, readGlb, meshOf, triangleCount, type Mesh} from './prop-glb.ts';

// A flat sheet in the x–y plane, n × n squares, two triangles each, with texture coordinates 0–1.
function sheet(n: number, size = 2): Mesh {
  const positions = new Float32Array((n + 1) * (n + 1) * 3), uvs = new Float32Array((n + 1) * (n + 1) * 2), indices = new Uint32Array(n * n * 6);
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { const i = y * (n + 1) + x; positions.set([x / n * size - size / 2, y / n * size - size / 2, 0], i * 3); uvs.set([x / n, y / n], i * 2); }
  let w = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = y * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1; indices.set([a, b, c, b, d, c], w); w += 6; }
  return {positions, uvs, indices};
}
const valid = (mesh: Mesh) => { const n = mesh.positions.length / 3; for (let t = 0; t < mesh.indices.length; t += 3) { const [a, b, c] = mesh.indices.subarray(t, t + 3); assert.ok(a < n && b < n && c < n && a !== b && b !== c && a !== c); } };

// Twice the area of each triangle as seen from +z: negative for a triangle that faces down.
const facing = (mesh: Mesh) => { const p = mesh.positions, out: number[] = [];
  for (let k = 0; k < mesh.indices.length; k += 3) { const [a, b, c] = mesh.indices.subarray(k, k + 3); out.push((p[b * 3] - p[a * 3]) * (p[c * 3 + 1] - p[a * 3 + 1]) - (p[b * 3 + 1] - p[a * 3 + 1]) * (p[c * 3] - p[a * 3])); } return out; };

test('a mesh is thinned to the triangles asked for, never more, and a flat panel keeps its place and outline', async () => {
  const full = sheet(80), {mesh, error} = await simplifyTo(full, 900);
  assert.equal(triangleCount(full), 12800);
  assert.ok(triangleCount(mesh) <= 900 && triangleCount(mesh) > 450, `${triangleCount(mesh)} triangles`);
  valid(mesh);
  assert.deepEqual(bounds(mesh.positions), bounds(full.positions), 'the outline does not move at all');
  assert.ok(error < 1e-4, `a flat sheet is thinned at next to no cost (${error})`);
  assert.ok(Math.abs(facing(mesh).reduce((s, v) => s + v, 0) / 2 - 4) < 1e-6, 'and still covers its 2 × 2 square');
  assert.equal(mesh.uvs!.length / 2, mesh.positions.length / 3);
  // A mesh that is already small enough is returned as it is.
  assert.equal((await simplifyTo(sheet(4), 900)).mesh.indices.length, 96);
});

test('every vertex of the thinned mesh is a vertex of the source, with its own texture coordinate and normal', async () => {
  // A wavy sheet with normals of its own: nothing is moved or averaged, so each kept vertex is found in the source as it was.
  const full = sheet(40); for (let i = 0; i < full.positions.length; i += 3) full.positions[i + 2] = 0.05 * Math.sin(full.positions[i] * 3) * Math.cos(full.positions[i + 1] * 2);
  const normals = new Float32Array(full.positions.length); for (let i = 0; i < normals.length; i += 3) normals.set([Math.sin(i), 0, Math.cos(i)], i);
  const source = new Map<string, string>(); for (let v = 0; v < full.positions.length / 3; v++) source.set([...full.positions.subarray(v * 3, v * 3 + 3)].join(), [...full.uvs!.subarray(v * 2, v * 2 + 2), ...normals.subarray(v * 3, v * 3 + 3)].join());
  const {mesh} = await simplifyTo({...full, normals}, 600);
  assert.ok(triangleCount(mesh) <= 600); valid(mesh);
  for (let v = 0; v < mesh.positions.length / 3; v++) assert.equal(source.get([...mesh.positions.subarray(v * 3, v * 3 + 3)].join()), [...mesh.uvs!.subarray(v * 2, v * 2 + 2), ...mesh.normals!.subarray(v * 3, v * 3 + 3)].join());
  assert.equal((await simplifyTo(full, 600)).mesh.normals ?? null, null, 'without normals in the source there are none in the result');
});

test('a thinned triangle keeps the side it faced', async () => {
  // A crumpled sheet (every vertex pushed about a little in its plane): every triangle of the result must still face up.
  const full = sheet(60); for (let i = 0; i < full.positions.length; i += 3) { full.positions[i] += 0.005 * Math.sin(i * 12.9898); full.positions[i + 1] += 0.005 * Math.cos(i * 78.233); }
  assert.ok(facing(full).every(v => v > 0), 'the source faces up throughout');
  for (const target of [3000, 1500, 700, 300]) assert.ok(facing((await simplifyTo(full, target)).mesh).every(v => v > 0), `thinned to ${target}`);
});

// A box of 12 triangles on 8 shared corners, wound outwards.
function box(): Mesh {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
  return {positions, uvs: null, indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3])};
}

test('normals are flat on a panel and sharp at an edge, and smooth where the surface turns slowly', () => {
  // A box: each corner is shared by three faces at right angles, so it becomes three vertices, each with its face's normal.
  const cube = creasedNormals(box());
  assert.equal(cube.positions.length / 3, 24); assert.equal(triangleCount(cube), 12); valid(cube);
  for (let k = 0; k < cube.indices.length; k += 3) { const [a, b, c] = [...cube.indices.subarray(k, k + 3)].map(i => [...cube.normals.subarray(i * 3, i * 3 + 3)].map(v => Math.round(v * 1e6) / 1e6 + 0).join());
    assert.ok(a === b && b === c, 'one normal over the whole triangle'); assert.equal(a.split(',').filter(v => v !== '0').length, 1, 'along one axis'); }
  // With the limit above 90° the same box is smoothed over its corners: 8 vertices, each normal pointing out between its three faces.
  const round = creasedNormals(box(), 100);
  assert.equal(round.positions.length / 3, 8);
  for (let i = 0; i < round.normals.length; i += 3) { const n = [...round.normals.subarray(i, i + 3)], p = [...round.positions.subarray(i, i + 3)];
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6); for (let k = 0; k < 3; k++) assert.ok(n[k] * (p[k] - 0.5) > 0.1, 'outwards along every axis'); }
  // A seam of the UV map (the same point twice, with two texture coordinates) is shaded as one point but stays two vertices.
  const seam: Mesh = {positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0.2]), uvs: new Float32Array([0.1, 0.1, 0.2, 0.1, 0.1, 0.2, 0.9, 0.9, 0.9, 0.8, 0.8, 0.9]), indices: new Uint32Array([0, 1, 2, 3, 4, 5])};
  const shaded = creasedNormals(seam);
  assert.equal(shaded.positions.length / 3, 6); assert.deepEqual([...shaded.uvs!], [...seam.uvs!]);
  assert.deepEqual([...shaded.normals.subarray(0, 3)], [...shaded.normals.subarray(9, 12)], 'the doubled vertex has one normal');
  assert.ok(shaded.normals[2] > 0.9 && shaded.normals[0] !== 0, 'the mean of the two faces that meet there');
  // A triangle with no area gets a normal all the same.
  const flat = creasedNormals({positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]), uvs: null, indices: new Uint32Array([0, 1, 2])});
  assert.deepEqual([...flat.normals.subarray(0, 3)], [0, 1, 0]);
});

test('size and origin are baked in: the asked length along the axis, centred, standing on y = 0', () => {
  const positions = new Float32Array([-1, -3, 2, 3, 1, 6, 1, -1, 4]), placed = placeOnOrigin(positions, 2, 0.45), b = bounds(positions);
  assert.ok(Math.abs(b.max[2] - b.min[2] - 0.45) < 1e-6); assert.ok(Math.abs(b.min[1]) < 1e-9); assert.ok(Math.abs(b.min[0] + b.max[0]) < 1e-6 && Math.abs(b.min[2] + b.max[2]) < 1e-6);
  assert.ok(Math.abs(placed.scale - 0.45 / 4) < 1e-9); assert.deepEqual(placed.size.map(v => Number(v.toFixed(4))), [0.45, 0.45, 0.45]);
});

test('normals of a flat sheet point out of it', () => {
  const {normals} = creasedNormals(sheet(3));
  assert.equal(normals.length / 3, 16, 'no vertex of a flat sheet is split');
  for (let i = 0; i < normals.length; i += 3) assert.deepEqual([...normals.subarray(i, i + 3)].map(v => Math.round(v)), [0, 0, 1]);
});

test('a prop is written as a plain GLB that reads back as the same mesh', () => {
  const mesh = creasedNormals(sheet(5)), material = {pbrMetallicRoughness: {baseColorTexture: {index: 0}, metallicFactor: 0, roughnessFactor: 0.7}};
  const file = writeGlb(mesh, mesh.normals, material, [{source: 0, sampler: 0}], [{mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1])}], 'test');
  assert.equal(file.toString('ascii', 0, 4), 'glTF'); assert.equal(file.readUInt32LE(8), file.length); assert.equal(file.length % 4, 0);
  const {json, bin} = readGlb(file), back = meshOf(json, bin);
  assert.deepEqual([...back.positions], [...mesh.positions]); assert.deepEqual([...back.uvs!], [...mesh.uvs!]); assert.deepEqual([...back.indices], [...mesh.indices]);
  assert.equal(json.extensionsRequired, undefined, 'no extension that needs a decoder');
  assert.equal(json.images.length, 1); assert.equal(json.bufferViews[json.images[0].bufferView].byteLength, 5);
  for (const view of json.bufferViews) assert.equal(view.byteOffset % 4, 0);
  assert.deepEqual(json.accessors[0].min.map((v: number) => Number(v.toFixed(3))), [-1, -1, 0]);
  assert.throws(() => readGlb(Buffer.from('not a glb at all, really')), /GLB/);
});
