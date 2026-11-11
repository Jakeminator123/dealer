import test from 'node:test';
import assert from 'node:assert/strict';
import {bounds, clusterMesh, simplifyTo, vertexNormals, placeOnOrigin, writeGlb, readGlb, meshOf, triangleCount, type Mesh} from './prop-glb.ts';

// A flat sheet in the x–y plane, n × n squares, two triangles each, with texture coordinates 0–1.
function sheet(n: number, size = 2): Mesh {
  const positions = new Float32Array((n + 1) * (n + 1) * 3), uvs = new Float32Array((n + 1) * (n + 1) * 2), indices = new Uint32Array(n * n * 6);
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { const i = y * (n + 1) + x; positions.set([x / n * size - size / 2, y / n * size - size / 2, 0], i * 3); uvs.set([x / n, y / n], i * 2); }
  let w = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = y * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1; indices.set([a, b, c, b, d, c], w); w += 6; }
  return {positions, uvs, indices};
}
const valid = (mesh: Mesh) => { const n = mesh.positions.length / 3; for (let t = 0; t < mesh.indices.length; t += 3) { const [a, b, c] = mesh.indices.subarray(t, t + 3); assert.ok(a < n && b < n && c < n && a !== b && b !== c && a !== c); } };

test('a mesh is thinned to about the triangles asked for, never more, and keeps its outline', () => {
  const full = sheet(80), {mesh, cell} = simplifyTo(full, 900);
  assert.equal(triangleCount(full), 12800);
  assert.ok(triangleCount(mesh) <= 900 && triangleCount(mesh) > 450, `${triangleCount(mesh)} triangles`);
  valid(mesh);
  const before = bounds(full.positions), after = bounds(mesh.positions);
  for (let k = 0; k < 3; k++) { assert.ok(Math.abs(before.min[k] - after.min[k]) <= cell && Math.abs(before.max[k] - after.max[k]) <= cell, 'the outline moves less than one cell'); }
  assert.equal(mesh.uvs!.length / 2, mesh.positions.length / 3);
  for (const v of mesh.uvs!) assert.ok(v >= 0 && v <= 1);
  // A mesh that is already small enough is returned as it is.
  assert.equal(simplifyTo(sheet(4), 900).mesh.indices.length, 96);
});

test('vertices that share a place but lie apart in the texture stay two vertices at one point', () => {
  // Two triangles meeting along an edge whose vertices are doubled, as at a seam of the UV map.
  const mesh: Mesh = {positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0]), uvs: new Float32Array([0.1, 0.1, 0.2, 0.1, 0.1, 0.2, 0.9, 0.9, 0.9, 0.8, 0.8, 0.9]), indices: new Uint32Array([0, 1, 2, 3, 4, 5])};
  const out = clusterMesh(mesh, 0.05);
  assert.equal(out.triangles, 2); assert.equal(out.positions.length / 3, 6, 'the seam is not welded');
  const at = (i: number) => [...out.positions.subarray(i * 3, i * 3 + 3)].join();
  assert.equal(new Set([0, 1, 2, 3, 4, 5].map(at)).size, 4, 'but its doubled vertices lie on the same points');
  // Without texture coordinates the same vertices are one.
  assert.equal(clusterMesh({...mesh, uvs: null}, 0.05).positions.length / 3, 4);
});

test('a second triangle on the same three vertices and a collapsed triangle are dropped', () => {
  const mesh: Mesh = {positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.001, 0, 0, 1.001, 0, 0, 0, 1.001, 0, 0.002, 0.001, 0]), uvs: null, indices: new Uint32Array([0, 1, 2, 3, 4, 5, 0, 3, 6])};
  const out = clusterMesh(mesh, 0.1);
  assert.equal(out.triangles, 1); assert.equal(out.positions.length / 3, 3);
  assert.equal(clusterMesh(mesh, 0.1, {count: true}).triangles, 2, 'the count for the search does not look for doubles');
});

test('a thinned triangle keeps the side it faced', () => {
  // A crumpled sheet (every vertex pushed about a little): clustering moves corners to their cubes' mean points, and a thin
  // triangle can come out turned over. Every triangle of the result must still face up, like every triangle of the source.
  const full = sheet(60); for (let i = 0; i < full.positions.length; i += 3) { full.positions[i] += 0.005 * Math.sin(i * 12.9898); full.positions[i + 1] += 0.005 * Math.cos(i * 78.233); }
  const up = (mesh: Mesh) => { const p = mesh.positions; let down = 0;
    for (let k = 0; k < mesh.indices.length; k += 3) { const [a, b, c] = mesh.indices.subarray(k, k + 3); if ((p[b * 3] - p[a * 3]) * (p[c * 3 + 1] - p[a * 3 + 1]) - (p[b * 3 + 1] - p[a * 3 + 1]) * (p[c * 3] - p[a * 3]) < 0) down++; } return down; };
  assert.equal(up(full), 0, 'the source faces up throughout');
  for (const target of [3000, 1500, 700, 300]) assert.equal(up(simplifyTo(full, target).mesh), 0, `thinned to ${target}`);
});

test('the normals of the source are kept through the thinning', () => {
  // A crumpled sheet whose own normals all point straight up (a smooth surface): thinned, it is still shaded as smooth,
  // though the faces between the moved corners now tilt. Without source normals the faces' own are used.
  const full = sheet(60); for (let i = 0; i < full.positions.length; i += 3) full.positions[i + 2] = 0.01 * Math.sin(i * 12.9898);
  const smooth = new Float32Array(full.positions.length); for (let i = 2; i < smooth.length; i += 3) smooth[i] = 1;
  const kept = simplifyTo({...full, normals: smooth}, 700).mesh;
  assert.equal(kept.normals!.length, kept.positions.length);
  for (let i = 0; i < kept.normals!.length; i += 3) assert.deepEqual([...kept.normals!.subarray(i, i + 3)].map(v => Number(v.toFixed(6))), [0, 0, 1]);
  assert.equal(simplifyTo(full, 700).mesh.normals ?? null, null);
  // Normals that cancel out (the two sides of a thin wall welded into one corner) give way to the faces' own.
  const wall: Mesh = {positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.001, 0.001, 0, 1.001, 0, 0, 0, 1.001, 0]), uvs: null, indices: new Uint32Array([0, 1, 2, 3, 4, 5]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1])};
  const welded = clusterMesh(wall, 0.1);
  for (let i = 0; i < welded.normals!.length; i += 3) assert.ok(Math.abs(Math.hypot(...welded.normals!.subarray(i, i + 3)) - 1) < 1e-6, 'a unit normal, not a cancelled one');
});

test('size and origin are baked in: the asked length along the axis, centred, standing on y = 0', () => {
  const positions = new Float32Array([-1, -3, 2, 3, 1, 6, 1, -1, 4]), placed = placeOnOrigin(positions, 2, 0.45), b = bounds(positions);
  assert.ok(Math.abs(b.max[2] - b.min[2] - 0.45) < 1e-6); assert.ok(Math.abs(b.min[1]) < 1e-9); assert.ok(Math.abs(b.min[0] + b.max[0]) < 1e-6 && Math.abs(b.min[2] + b.max[2]) < 1e-6);
  assert.ok(Math.abs(placed.scale - 0.45 / 4) < 1e-9); assert.deepEqual(placed.size.map(v => Number(v.toFixed(4))), [0.45, 0.45, 0.45]);
});

test('normals of a flat sheet point out of it', () => {
  const normals = vertexNormals(sheet(3));
  for (let i = 0; i < normals.length; i += 3) assert.deepEqual([...normals.subarray(i, i + 3)].map(v => Math.round(v)), [0, 0, 1]);
});

test('a prop is written as a plain GLB that reads back as the same mesh', () => {
  const mesh = sheet(5), material = {pbrMetallicRoughness: {baseColorTexture: {index: 0}, metallicFactor: 0, roughnessFactor: 0.7}};
  const file = writeGlb(mesh, vertexNormals(mesh), material, [{source: 0, sampler: 0}], [{mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1])}], 'test');
  assert.equal(file.toString('ascii', 0, 4), 'glTF'); assert.equal(file.readUInt32LE(8), file.length); assert.equal(file.length % 4, 0);
  const {json, bin} = readGlb(file), back = meshOf(json, bin);
  assert.deepEqual([...back.positions], [...mesh.positions]); assert.deepEqual([...back.uvs!], [...mesh.uvs!]); assert.deepEqual([...back.indices], [...mesh.indices]);
  assert.equal(json.extensionsRequired, undefined, 'no extension that needs a decoder');
  assert.equal(json.images.length, 1); assert.equal(json.bufferViews[json.images[0].bufferView].byteLength, 5);
  for (const view of json.bufferViews) assert.equal(view.byteOffset % 4, 0);
  assert.deepEqual(json.accessors[0].min.map((v: number) => Number(v.toFixed(3))), [-1, -1, 0]);
  assert.throws(() => readGlb(Buffer.from('not a glb at all, really')), /GLB/);
});
