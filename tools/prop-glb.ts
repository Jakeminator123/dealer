// Makes a table prop fit for the 3D scene out of a heavy generated GLB (Jakob's shoe and chip tray from Meshy).
//
// The generated files have hundreds of thousands to millions of triangles, 4K textures, a size normalised to about two
// units and their origin in the middle. The scene wants (docs/SYSTEM.md, "Sko och markerbricka som GLB") a real size in
// metres, the origin under the object, a few tens of thousands of triangles and textures of at most 1024 px, with no
// compression that needs an extra decoder. This tool reads one source, thins the mesh by vertex clustering, makes the
// textures smaller, bakes scale and origin into the vertices and writes a plain GLB under assets/props/.
//
//   node tools/prop-glb.ts <id>        one prop of data/props.json
//   node tools/prop-glb.ts --all
//
// The mesh functions are pure and tested (tools/prop-glb.test.ts); only the command at the bottom touches files and images.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// normals: the source's own vertex normals, when it has them. They are kept through the thinning, so the thinned surface is
// still shaded like the smooth one it came from, and the lumps of the thinning show only in its outline.
export type Mesh = {positions: Float32Array; uvs: Float32Array | null; indices: Uint32Array; normals?: Float32Array | null};
export const triangleCount = (mesh: Mesh) => mesh.indices.length / 3;

export function bounds(positions: Float32Array): {min: number[]; max: number[]} {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return {min, max};
}

/**
 * Thins a mesh by vertex clustering: space is cut into cubes of side `cell`, every vertex in a cube moves to the cube's
 * mean point, and triangles that collapse are dropped. Vertices of one cube that lie in different parts of the texture
 * (a seam of the UV map) stay separate vertices at the same point, so the texture is not smeared across a seam.
 * count: only count the triangles that would be left (for the search in simplifyTo).
 */
export function clusterMesh(mesh: Mesh, cell: number, options: {uvCells?: number; count?: boolean} = {}): Mesh & {triangles: number} {
  const {positions, uvs, indices} = mesh, normals = mesh.normals ?? null, n = positions.length / 3, {min, max} = bounds(positions), uvCells = options.uvCells ?? 24;
  const nx = Math.max(1, Math.ceil((max[0] - min[0]) / cell) + 1), ny = Math.max(1, Math.ceil((max[1] - min[1]) / cell) + 1), nz = Math.max(1, Math.ceil((max[2] - min[2]) / cell) + 1), cubes = nx * ny * nz;
  if (!(cell > 0) || cubes * uvCells * uvCells > Number.MAX_SAFE_INTEGER) throw Error('The cell is too small for this mesh.');
  const cubeOf = new Float64Array(n), cluster = new Uint32Array(n), ids = new Map<number, number>(), cubeIds = new Map<number, number>(), clusterCube: number[] = [];
  for (let i = 0; i < n; i++) {
    const cube = Math.floor((positions[i * 3] - min[0]) / cell) + nx * (Math.floor((positions[i * 3 + 1] - min[1]) / cell) + ny * Math.floor((positions[i * 3 + 2] - min[2]) / cell));
    const part = uvs ? Math.min(uvCells - 1, Math.max(0, Math.floor(uvs[i * 2] * uvCells))) + uvCells * Math.min(uvCells - 1, Math.max(0, Math.floor(uvs[i * 2 + 1] * uvCells))) : 0, key = cube + cubes * part;
    let id = ids.get(key); if (id === undefined) { id = ids.size; ids.set(key, id); let c = cubeIds.get(cube); if (c === undefined) { c = cubeIds.size; cubeIds.set(cube, c); } clusterCube.push(c); }
    cubeOf[i] = cubeIds.get(cube)!; cluster[i] = id;
  }
  let triangles = 0;
  for (let t = 0; t < indices.length; t += 3) { const a = cluster[indices[t]], b = cluster[indices[t + 1]], c = cluster[indices[t + 2]]; if (a !== b && b !== c && a !== c) triangles++; }
  if (options.count) return {positions: new Float32Array(0), uvs: null, indices: new Uint32Array(0), triangles};
  // A cube's mean point, shared by all its clusters; a cluster's own mean texture coordinate.
  const sum = new Float64Array(cubeIds.size * 3), members = new Uint32Array(cubeIds.size), uvSum = new Float64Array(ids.size * 2), uvMembers = new Uint32Array(ids.size), normalSum = normals ? new Float64Array(ids.size * 3) : null, normalMembers = new Uint32Array(ids.size);
  for (let i = 0; i < n; i++) { const c = cubeOf[i]; sum[c * 3] += positions[i * 3]; sum[c * 3 + 1] += positions[i * 3 + 1]; sum[c * 3 + 2] += positions[i * 3 + 2]; members[c]++;
    if (uvs) { const id = cluster[i]; uvSum[id * 2] += uvs[i * 2]; uvSum[id * 2 + 1] += uvs[i * 2 + 1]; uvMembers[id]++; }
    if (normalSum) { const id = cluster[i]; normalSum[id * 3] += normals![i * 3]; normalSum[id * 3 + 1] += normals![i * 3 + 1]; normalSum[id * 3 + 2] += normals![i * 3 + 2]; normalMembers[id]++; } }
  const outPositions = new Float32Array(ids.size * 3), outUvs = uvs ? new Float32Array(ids.size * 2) : null;
  for (let id = 0; id < ids.size; id++) { const c = clusterCube[id]; for (let k = 0; k < 3; k++) outPositions[id * 3 + k] = sum[c * 3 + k] / members[c]; if (outUvs) { outUvs[id * 2] = uvSum[id * 2] / uvMembers[id]; outUvs[id * 2 + 1] = uvSum[id * 2 + 1] / uvMembers[id]; } }
  // Triangles: collapsed ones go, and so does a second triangle on the same three vertices. Moving its corners to the cubes'
  // mean points can turn a thin triangle over; it is then wound the other way, so that it still faces where it faced.
  const kept = new Uint32Array(triangles * 3), seen = new Set<string | number>(), small = ids.size < 100000; let w = 0;
  const facing = (p: Float32Array, a: number, b: number, c: number) => { const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  for (let t = 0; t < indices.length; t += 3) {
    const a = cluster[indices[t]], b = cluster[indices[t + 1]], c = cluster[indices[t + 2]]; if (a === b || b === c || a === c) continue;
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi, key = small ? (lo * ids.size + mid) * ids.size + hi : `${lo},${mid},${hi}`;
    if (seen.has(key)) continue; seen.add(key);
    const was = facing(positions, indices[t], indices[t + 1], indices[t + 2]), now = facing(outPositions, a, b, c), turned = was[0] * now[0] + was[1] * now[1] + was[2] * now[2] < 0;
    kept[w++] = a; kept[w++] = turned ? c : b; kept[w++] = turned ? b : c;
  }
  // Vertices no triangle uses any more are left out.
  const used = new Int32Array(ids.size).fill(-1); let count = 0; const finalIndices = kept.slice(0, w);
  for (let i = 0; i < w; i++) { if (used[finalIndices[i]] < 0) used[finalIndices[i]] = count++; finalIndices[i] = used[finalIndices[i]]; }
  const p = new Float32Array(count * 3), u = outUvs ? new Float32Array(count * 2) : null, kn = normalSum ? new Float32Array(count * 3) : null;
  for (let id = 0; id < ids.size; id++) { const to = used[id]; if (to < 0) continue; p.set(outPositions.subarray(id * 3, id * 3 + 3), to * 3); if (u) u.set(outUvs!.subarray(id * 2, id * 2 + 2), to * 2);
    if (kn) for (let k = 0; k < 3; k++) kn[to * 3 + k] = normalSum![id * 3 + k] / normalMembers[id]; }
  const out: Mesh = {positions: p, uvs: u, indices: finalIndices};
  if (kn) { // the mean of the source normals where they agree; where they cancel out (two sides of a thin wall in one cube), the faces' own
    const faces = vertexNormals(out);
    for (let i = 0; i < kn.length; i += 3) { const l = Math.hypot(kn[i], kn[i + 1], kn[i + 2]); // the mean of unit normals: 1 where they all agree, near 0 where they cancel
      if (l > 0.5 && kn[i] * faces[i] + kn[i + 1] * faces[i + 1] + kn[i + 2] * faces[i + 2] >= 0) { kn[i] /= l; kn[i + 1] /= l; kn[i + 2] /= l; } else { kn[i] = faces[i]; kn[i + 1] = faces[i + 1]; kn[i + 2] = faces[i + 2]; } }
    out.normals = kn; }
  return {...out, triangles: w / 3};
}

/** Thins a mesh to about `target` triangles (never more): the largest cell is searched whose result still has enough. */
export function simplifyTo(mesh: Mesh, target: number): {mesh: Mesh; cell: number} {
  if (triangleCount(mesh) <= target) return {mesh, cell: 0};
  const {min, max} = bounds(mesh.positions), span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  // The parts of the texture that are kept apart set a floor of their own: with too many of them even the largest cell
  // leaves more triangles than asked for, so the texture is cut into fewer parts until the target can be reached.
  let uvCells = 24; while (uvCells > 1 && clusterMesh(mesh, span / 4, {count: true, uvCells}).triangles > target) uvCells = Math.floor(uvCells / 2);
  let fine = span / 4096, coarse = span / 4; // fine gives too many triangles, coarse few enough
  for (let step = 0; step < 18; step++) { const cell = Math.sqrt(fine * coarse); if (clusterMesh(mesh, cell, {count: true, uvCells}).triangles > target) fine = cell; else coarse = cell; }
  return {mesh: clusterMesh(mesh, coarse, {uvCells}), cell: coarse};
}

/** Smooth vertex normals, each face weighted by its area. */
export function vertexNormals(mesh: Mesh): Float32Array {
  const {positions: p, indices} = mesh, normals = new Float32Array(p.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3, ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const i of [a, b, c]) { normals[i] += x; normals[i + 1] += y; normals[i + 2] += z; }
  }
  for (let i = 0; i < normals.length; i += 3) { const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l; }
  return normals;
}

/**
 * Bakes size and origin into the vertices: the object is scaled so that its extent along `axis` is `length` metres, centred
 * across and along, and set with its underside on y = 0.
 */
export function placeOnOrigin(positions: Float32Array, axis: 0 | 1 | 2, length: number): {scale: number; size: number[]} {
  const {min, max} = bounds(positions), scale = length / (max[axis] - min[axis]), cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  for (let i = 0; i < positions.length; i += 3) { positions[i] = (positions[i] - cx) * scale; positions[i + 1] = (positions[i + 1] - min[1]) * scale; positions[i + 2] = (positions[i + 2] - cz) * scale; }
  return {scale, size: [0, 1, 2].map(k => (max[k] - min[k]) * scale)};
}

// ── GLB in and out ──────────────────────────────────────────────────────────
type Json = Record<string, any>;
export function readGlb(file: Buffer): {json: Json; bin: Buffer} {
  if (file.toString('ascii', 0, 4) !== 'glTF' || file.readUInt32LE(4) !== 2) throw Error('Not a GLB of version 2.');
  const jsonLength = file.readUInt32LE(12), json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength)), at = 20 + jsonLength;
  if (at >= file.length) return {json, bin: Buffer.alloc(0)};
  return {json, bin: file.subarray(at + 8, at + 8 + file.readUInt32LE(at))};
}
const COMPONENTS: Record<number, {size: number; read: (b: Buffer, o: number) => number}> = {
  5126: {size: 4, read: (b, o) => b.readFloatLE(o)}, 5125: {size: 4, read: (b, o) => b.readUInt32LE(o)}, 5123: {size: 2, read: (b, o) => b.readUInt16LE(o)}, 5121: {size: 1, read: (b, o) => b.readUInt8(o)},
};
const WIDTH: Record<string, number> = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4};
function accessor(json: Json, bin: Buffer, index: number): {values: Float32Array | Uint32Array; width: number} {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView], component = COMPONENTS[a.componentType], width = WIDTH[a.type];
  if (!component || !width || a.sparse) throw Error(`Accessor ${index} has a layout this tool does not read.`);
  const stride = view.byteStride || component.size * width, start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), values = a.componentType === 5126 ? new Float32Array(a.count * width) : new Uint32Array(a.count * width);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < width; k++) values[i * width + k] = component.read(bin, start + i * stride + k * component.size);
  return {values, width};
}
/** The triangles of a GLB as one mesh: every primitive of every mesh, joined. Node transforms are not applied (the generated files have none). */
export function meshOf(json: Json, bin: Buffer): Mesh {
  const parts: Mesh[] = [];
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4) throw Error('Only triangle lists are read.');
    const positions = accessor(json, bin, primitive.attributes.POSITION).values as Float32Array, uv = primitive.attributes.TEXCOORD_0 !== undefined ? accessor(json, bin, primitive.attributes.TEXCOORD_0).values as Float32Array : null;
    const normals = primitive.attributes.NORMAL !== undefined ? accessor(json, bin, primitive.attributes.NORMAL).values as Float32Array : null;
    const indices = primitive.indices !== undefined ? Uint32Array.from(accessor(json, bin, primitive.indices).values) : Uint32Array.from({length: positions.length / 3}, (_, i) => i);
    parts.push({positions, uvs: uv, indices, normals});
  }
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((s, p) => s + p.positions.length / 3, 0), positions = new Float32Array(total * 3), uvs = parts.every(p => p.uvs) ? new Float32Array(total * 2) : null, indices = new Uint32Array(parts.reduce((s, p) => s + p.indices.length, 0));
  const normals = parts.every(p => p.normals) ? new Float32Array(total * 3) : null;
  let v = 0, i = 0; for (const p of parts) { positions.set(p.positions, v * 3); if (uvs) uvs.set(p.uvs!, v * 2); if (normals) normals.set(p.normals!, v * 3); for (const index of p.indices) indices[i++] = index + v; v += p.positions.length / 3; }
  return {positions, uvs, indices, normals};
}

export type PropImage = {mimeType: string; data: Buffer};
/** A plain GLB of one mesh with one material: positions, normals, texture coordinates, 32-bit indices, images embedded. */
export function writeGlb(mesh: Mesh, normals: Float32Array, material: Json, textures: Json[], images: PropImage[], generator: string): Buffer {
  const chunks: Buffer[] = [], views: Json[] = []; let offset = 0;
  const add = (data: Uint8Array, target?: number) => { const pad = (4 - data.byteLength % 4) % 4; views.push({buffer: 0, byteOffset: offset, byteLength: data.byteLength, ...(target ? {target} : {})}); chunks.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength), Buffer.alloc(pad)); offset += data.byteLength + pad; return views.length - 1; };
  const {min, max} = bounds(mesh.positions), count = mesh.positions.length / 3;
  const accessors: Json[] = [{bufferView: add(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength), 34962), componentType: 5126, count, type: 'VEC3', min, max},
    {bufferView: add(new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength), 34962), componentType: 5126, count, type: 'VEC3'}];
  const attributes: Json = {POSITION: 0, NORMAL: 1};
  if (mesh.uvs) { accessors.push({bufferView: add(new Uint8Array(mesh.uvs.buffer, mesh.uvs.byteOffset, mesh.uvs.byteLength), 34962), componentType: 5126, count, type: 'VEC2'}); attributes.TEXCOORD_0 = accessors.length - 1; }
  accessors.push({bufferView: add(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength), 34963), componentType: 5125, count: mesh.indices.length, type: 'SCALAR'});
  const json: Json = {asset: {version: '2.0', generator}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0}], meshes: [{primitives: [{attributes, indices: accessors.length - 1, material: 0}]}], materials: [material], accessors,
    ...(images.length ? {textures, samplers: [{magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497}], images: images.map(image => ({mimeType: image.mimeType, bufferView: add(image.data)}))} : {})};
  json.bufferViews = views; json.buffers = [{byteLength: offset}];
  let text = Buffer.from(JSON.stringify(json), 'utf8'); text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(chunks), head = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  jsonHead.writeUInt32LE(text.length, 0); jsonHead.write('JSON', 4, 'ascii'); binHead.writeUInt32LE(bin.length, 0); binHead.write('BIN\0', 4, 'ascii');
  return Buffer.concat([head, jsonHead, text, binHead, bin]);
}

// ── command ─────────────────────────────────────────────────────────────────
// data/props.json: {source: {directory}, props: [{id, file, sha256, lengthAxis: 'x'|'y'|'z', lengthMetres, triangles, textureSize}]}
type PropJob = {id: string; file: string; sha256: string; lengthAxis: 'x' | 'y' | 'z'; lengthMetres: number; triangles: number; textureSize: number; note?: string};
async function convert(job: PropJob, directory: string) {
  const source = await readFile(path.join(directory, job.file)), sha = createHash('sha256').update(source).digest('hex');
  if (sha !== job.sha256) throw Error(`${job.file} is not the file data/props.json names (sha256 ${sha}).`);
  const {json, bin} = readGlb(source), full = meshOf(json, bin), {mesh, cell} = simplifyTo(full, job.triangles);
  const placed = placeOnOrigin(mesh.positions, ({x: 0, y: 1, z: 2} as const)[job.lengthAxis], job.lengthMetres), normals = mesh.normals ?? vertexNormals(mesh); // scaling is uniform, so the source's normals stay true
  const sharp = (await import('sharp')).default, images: PropImage[] = [];
  for (const image of json.images ?? []) { const view = json.bufferViews[image.bufferView], data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    images.push({mimeType: 'image/jpeg', data: await sharp(data).resize({width: job.textureSize, height: job.textureSize, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 86}).toBuffer()}); }
  const material = json.materials?.[0] ?? {pbrMetallicRoughness: {baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0, roughnessFactor: 0.8}};
  const textures = (json.textures ?? []).map((t: Json) => ({source: t.source, sampler: 0}));
  const out = writeGlb(mesh, normals, material, textures, images, 'dealer tools/prop-glb.ts'), target = `assets/props/${job.id}.glb`;
  await mkdir('assets/props', {recursive: true}); await writeFile(target, out);
  const receipt = {id: job.id, source: {file: job.file, sha256: sha, bytes: source.length, triangles: triangleCount(full)}, output: {path: target, sha256: createHash('sha256').update(out).digest('hex'), bytes: out.length, triangles: triangleCount(mesh), vertices: mesh.positions.length / 3, cellMetres: cell * placed.scale, sizeMetres: placed.size.map(v => Number(v.toFixed(4))), textures: images.map(i => i.data.length)}, createdAt: new Date().toISOString()};
  await writeFile(`assets/props/${job.id}.receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(`${job.id}: ${receipt.source.triangles} → ${receipt.output.triangles} trianglar, ${(source.length / 1048576).toFixed(1)} → ${(out.length / 1048576).toFixed(2)} MB, mått ${receipt.output.sizeMetres.join(' × ')} m, cell ${(receipt.output.cellMetres * 1000).toFixed(1)} mm`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'prop-glb.ts')) {
  const config = JSON.parse(await readFile('data/props.json', 'utf8')), wanted = process.argv.slice(2), jobs: PropJob[] = wanted.includes('--all') ? config.props : config.props.filter((p: PropJob) => wanted.includes(p.id));
  if (!jobs.length) { console.log(`Ange ett id ur data/props.json (${config.props.map((p: PropJob) => p.id).join(', ')}) eller --all.`); process.exitCode = 1; }
  for (const job of jobs) await convert(job, config.source.directory);
}
