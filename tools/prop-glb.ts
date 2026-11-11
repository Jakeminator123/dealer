// Makes a table prop fit for the 3D scene out of a heavy generated GLB (Jakob's shoe and chip tray from Meshy).
//
// The generated files have hundreds of thousands to millions of triangles, 4K textures, a size normalised to about two
// units and their origin in the middle. The scene wants (docs/SYSTEM.md, "Sko och markerbricka som GLB") a real size in
// metres, the origin under the object, a few tens of thousands of triangles and textures of at most 1024 px, with no
// compression that needs an extra decoder. This tool reads one source, thins the mesh by edge collapse, makes the
// textures smaller, bakes scale and origin into the vertices and writes a plain GLB under assets/props/.
//
//   node tools/prop-glb.ts <id>        one prop of data/props.json
//   node tools/prop-glb.ts --all
//
// The mesh functions are pure and tested (tools/prop-glb.test.ts); only the command at the bottom touches files and images.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {MeshoptSimplifier} from 'meshoptimizer';

// normals: the source's own vertex normals, when it has them. Every vertex keeps its own through the thinning.
export type Mesh = {positions: Float32Array; uvs: Float32Array | null; indices: Uint32Array; normals?: Float32Array | null};
export const triangleCount = (mesh: Mesh) => mesh.indices.length / 3;

export function bounds(positions: Float32Array): {min: number[]; max: number[]} {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return {min, max};
}

/**
 * Thins a mesh to at most `target` triangles by edge collapse (meshoptimizer's simplifier): edges are folded away one at
 * a time, the one that changes the surface least first. A flat panel becomes a few large triangles and a sharp edge stays
 * where it was. No vertex is moved or made: every vertex of the result is a vertex of the source, with its own normal and
 * texture coordinate, and a seam of the UV map stays a seam.
 *
 * (Until 2026-11-11 this was vertex clustering, which moves every vertex to the mean point of its cube. It crumpled flat
 * panels along their edges, which showed in every glossy look: the lumps were ours, not the source's.)
 *
 * error: the simplifier's own measure of how far the thinned surface lies from the source, in the units of the mesh.
 */
export async function simplifyTo(mesh: Mesh, target: number): Promise<{mesh: Mesh; error: number}> {
  if (triangleCount(mesh) <= target) return {mesh, error: 0};
  await MeshoptSimplifier.ready;
  // The error limit is left open (1 = the whole extent): the triangle budget decides where the thinning stops. Prune lets
  // loose crumbs go whole when they are smaller than the error reached.
  const [indices, relative] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target * 3, 1, ['Prune']);
  if (indices.length > target * 3 * 1.05) throw Error(`The mesh could not be thinned below ${indices.length / 3} triangles (${target} asked for).`);
  // Vertices no triangle uses any more are left out.
  const to = new Int32Array(mesh.positions.length / 3).fill(-1), from: number[] = [];
  const out = Uint32Array.from(indices, i => { if (to[i] < 0) { to[i] = from.length; from.push(i); } return to[i]; });
  const pick = (source: Float32Array, width: number) => { const kept = new Float32Array(from.length * width); from.forEach((i, at) => kept.set(source.subarray(i * width, i * width + width), at * width)); return kept; };
  return {mesh: {positions: pick(mesh.positions, 3), uvs: mesh.uvs ? pick(mesh.uvs, 2) : null, indices: out, ...(mesh.normals ? {normals: pick(mesh.normals, 3)} : {})}, error: relative * MeshoptSimplifier.getScale(mesh.positions, 3)};
}

/**
 * Normals for a thinned mesh, and its vertices split to carry them: at each corner of each triangle, the mean of the faces
 * around that point that lie within `angle` degrees of the triangle's own, each weighted by its area. A flat panel is
 * shaded flat right up to its edge and the edge stays sharp; a rounded part stays smooth. Points are matched by place, so a
 * seam of the UV map does not show in the shading.
 *
 * The source's own normals do not fit a thinned mesh: in the source a sharp edge is a band of tiny triangles across which
 * the normal turns; thinned, the same normals are spread over large triangles and the panel looks crumpled along its edges.
 */
export function creasedNormals(mesh: Mesh, angle = 40): Mesh & {normals: Float32Array} {
  const {positions: p, uvs, indices} = mesh, faces = indices.length / 3, limit = Math.cos(angle * Math.PI / 180);
  const place = new Uint32Array(p.length / 3), places = new Map<string, number>();
  for (let v = 0; v < place.length; v++) { const key = `${p[v * 3]},${p[v * 3 + 1]},${p[v * 3 + 2]}`; let id = places.get(key); if (id === undefined) { id = places.size; places.set(key, id); } place[v] = id; }
  const area = new Float64Array(faces * 3), unit = new Float64Array(faces * 3); // each face's normal: as long as twice its area, and of length one
  for (let f = 0; f < faces; f++) {
    const a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3, ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z);
    area.set([x, y, z], f * 3); if (l > 0) unit.set([x / l, y / l, z / l], f * 3);
  }
  const start = new Uint32Array(places.size + 1); for (const i of indices) start[place[i] + 1]++;
  for (let i = 0; i < places.size; i++) start[i + 1] += start[i];
  const around = new Uint32Array(indices.length), next = start.slice(0, places.size); // the faces around each place
  for (let f = 0; f < faces; f++) for (let k = 0; k < 3; k++) around[next[place[indices[f * 3 + k]]]++] = f;
  const out = new Uint32Array(indices.length), made = new Map<string, number>(), from: number[] = [], normals: number[] = [];
  for (let f = 0; f < faces; f++) for (let k = 0; k < 3; k++) {
    const v = indices[f * 3 + k], at = place[v]; let x = 0, y = 0, z = 0;
    for (let j = start[at]; j < start[at + 1]; j++) { const g = around[j]; if (g === f || unit[f * 3] * unit[g * 3] + unit[f * 3 + 1] * unit[g * 3 + 1] + unit[f * 3 + 2] * unit[g * 3 + 2] >= limit) { x += area[g * 3]; y += area[g * 3 + 1]; z += area[g * 3 + 2]; } }
    const l = Math.hypot(x, y, z); if (l > 0) { x /= l; y /= l; z /= l; } else { x = 0; y = 1; z = 0; } // a triangle with no area has no side to face
    const key = `${v}:${Math.round(x * 1024)},${Math.round(y * 1024)},${Math.round(z * 1024)}`; let id = made.get(key);
    if (id === undefined) { id = from.length; made.set(key, id); from.push(v); normals.push(x, y, z); }
    out[f * 3 + k] = id;
  }
  const pick = (source: Float32Array, width: number) => { const kept = new Float32Array(from.length * width); from.forEach((i, to) => kept.set(source.subarray(i * width, i * width + width), to * width)); return kept; };
  return {positions: pick(p, 3), uvs: uvs ? pick(uvs, 2) : null, indices: out, normals: Float32Array.from(normals)};
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
type PropJob = {id: string; file: string; sha256: string; lengthAxis: 'x' | 'y' | 'z'; lengthMetres: number; triangles: number; textureSize: number; creaseDegrees?: number; note?: string};
async function convert(job: PropJob, directory: string) {
  const source = await readFile(path.join(directory, job.file)), sha = createHash('sha256').update(source).digest('hex');
  if (sha !== job.sha256) throw Error(`${job.file} is not the file data/props.json names (sha256 ${sha}).`);
  const {json, bin} = readGlb(source), full = meshOf(json, bin), thinned = await simplifyTo(full, job.triangles), error = thinned.error, mesh = creasedNormals(thinned.mesh, job.creaseDegrees ?? 40);
  const placed = placeOnOrigin(mesh.positions, ({x: 0, y: 1, z: 2} as const)[job.lengthAxis], job.lengthMetres), normals = mesh.normals; // scaling is uniform, so the normals stay true
  const sharp = (await import('sharp')).default, images: PropImage[] = [];
  for (const image of json.images ?? []) { const view = json.bufferViews[image.bufferView], data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    images.push({mimeType: 'image/jpeg', data: await sharp(data).resize({width: job.textureSize, height: job.textureSize, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 86}).toBuffer()}); }
  const material = json.materials?.[0] ?? {pbrMetallicRoughness: {baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0, roughnessFactor: 0.8}};
  const textures = (json.textures ?? []).map((t: Json) => ({source: t.source, sampler: 0}));
  const out = writeGlb(mesh, normals, material, textures, images, 'dealer tools/prop-glb.ts'), target = `assets/props/${job.id}.glb`;
  await mkdir('assets/props', {recursive: true}); await writeFile(target, out);
  const receipt = {id: job.id, source: {file: job.file, sha256: sha, bytes: source.length, triangles: triangleCount(full)}, output: {path: target, sha256: createHash('sha256').update(out).digest('hex'), bytes: out.length, triangles: triangleCount(mesh), vertices: mesh.positions.length / 3, errorMetres: Number((error * placed.scale).toFixed(5)), sizeMetres: placed.size.map(v => Number(v.toFixed(4))), textures: images.map(i => i.data.length)}, createdAt: new Date().toISOString()};
  await writeFile(`assets/props/${job.id}.receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(`${job.id}: ${receipt.source.triangles} → ${receipt.output.triangles} trianglar, ${(source.length / 1048576).toFixed(1)} → ${(out.length / 1048576).toFixed(2)} MB, mått ${receipt.output.sizeMetres.join(' × ')} m, avvikelse omkring ${(receipt.output.errorMetres * 1000).toFixed(1)} mm`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'prop-glb.ts')) {
  const config = JSON.parse(await readFile('data/props.json', 'utf8')), wanted = process.argv.slice(2), jobs: PropJob[] = wanted.includes('--all') ? config.props : config.props.filter((p: PropJob) => wanted.includes(p.id));
  if (!jobs.length) { console.log(`Ange ett id ur data/props.json (${config.props.map((p: PropJob) => p.id).join(', ')}) eller --all.`); process.exitCode = 1; }
  for (const job of jobs) await convert(job, config.source.directory);
}
