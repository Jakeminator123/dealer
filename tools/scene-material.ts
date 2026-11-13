// Makes the 3D table's generated materials fit for the scene (the lab trial of 2026-11-13: cloth "runway", surface "natur").
//
// The sources are pictures made by an image model and kept as they came, outside Git, under assets/scene/source/runway/;
// data/scene-materials.json names each by its SHA-256 and says what it was made from. Two kinds:
//
//   felt   a picture of the scene's home view, turned into a photograph by the model. A band of its felt is laid flat through
//          the film camera of data/scene-contract.json, the lamp's light is divided out, and the band is mirrored into a tile
//          that repeats, at the pixels per metre of the scene's felt image (RUNWAY_CLOTHS, src/scene3d-table.ts).
//   hide   a flat picture of a material seen from straight above. Its uneven light is divided out and its edges are faded into
//          each other, so that it repeats, at the size of the rail's leather tile (NATURES).
//
//   node tools/scene-material.ts <id>        one entry of "generated" in data/scene-materials.json
//   node tools/scene-material.ts --all
//
// The picture functions are pure and tested (tools/scene-material.test.ts); only the command at the bottom touches files.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {FILM, cameraFromContract, type FilmCamera} from '../src/scene3d-geometry.ts';
import {FELT_PX_PER_M, RUNWAY_CLOTH, flatten, rectify, seamless, type Picture} from '../src/scene3d-table.ts';

export const meanOf = (p: Picture): number[] => [0, 1, 2].map(k => { let s = 0; for (let i = k; i < p.data.length; i += 3) s += p.data[i]; return s / (p.data.length / 3); });

/**
 * A tile of `across` by `down` half pieces that repeats without a seam, made of square pieces of a picture of an even material:
 * each piece is cut where chance puts it, turned one of eight ways, and laid half over its neighbours under a soft window
 * (cos² each way, so the windows add to one). Where pieces overlap, each pixel's departure from the mean colour is weighted by
 * w / sqrt(sum of w²): the grain keeps its contrast instead of going soft, as in `seamless`. No piece lies twice the same way,
 * so neither a repeat nor a mirror line shows inside the tile, which a short band laid end to end or mirrored would.
 * The piece is the picture's shorter side, made even; the tile is across x down halves of it. Same seed, same tile.
 */
export function scattered(p: Picture, across: number, down: number, seed = 1): Picture {
  const P = Math.min(p.width, p.height) & ~1, half = P / 2, W = across * half, H = down * half, mean = meanOf(p);
  if (P < 4 || across < 2 || down < 2) throw Error('Too small a picture or tile to scatter.');
  const sum = new Float32Array(W * H * 3), squares = new Float32Array(W * H), window = Float32Array.from({length: P}, (_, i) => Math.sin(Math.PI * (i + 0.5) / P) ** 2);
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let row = 0; row < down; row++) for (let column = 0; column < across; column++) {
    const x0 = Math.floor(random() * (p.width - P + 1)), y0 = Math.floor(random() * (p.height - P + 1)), turn = Math.floor(random() * 8);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
      let u = turn & 1 ? P - 1 - i : i, v = turn & 2 ? P - 1 - j : j; if (turn & 4) [u, v] = [v, u];
      const w = window[i] * window[j], at = ((row * half + j) % H) * W + (column * half + i) % W, from = ((y0 + v) * p.width + x0 + u) * 3;
      for (let k = 0; k < 3; k++) sum[at * 3 + k] += w * (p.data[from + k] - mean[k]);
      squares[at] += w * w;
    }
  }
  const data = new Float32Array(W * H * 3); for (let at = 0; at < W * H; at++) for (let k = 0; k < 3; k++) data[at * 3 + k] = mean[k] + sum[at * 3 + k] / Math.sqrt(squares[at]);
  return {data, width: W, height: H};
}

type Rgba = {data: ArrayLike<number>; width: number; height: number};
/**
 * The felt tile of a picture of the film's frame: the band `cloth` names, laid flat through `camera` at `pxPerM`, its light
 * larger than `cloth.flat` metres divided out round its own mean colour, and scattered into a tile about 1.5 by 0.6 metres.
 * The picture may be larger than the frame; its width says by how much.
 */
export function feltTile(source: Rgba, camera: FilmCamera, pxPerM = FELT_PX_PER_M, cloth: {x: number; s0: number; s1: number; flat: number} = RUNWAY_CLOTH): Picture {
  const band = rectify(source, camera, cloth, pxPerM, source.width / FILM.width), piece = Math.min(band.width, band.height) / 2;
  return scattered(flatten(band, Math.max(1, Math.round(cloth.flat * pxPerM / 2)), meanOf(band)), 2 * Math.round(0.75 * pxPerM / piece), 2 * Math.round(0.3 * pxPerM / piece), 7);
}

/**
 * A square material picture made to repeat at `size` pixels: its light larger than a quarter of the picture divided out round
 * its own mean colour, then its last `fade` columns and rows faded into its first. The picture comes `size + fade` square.
 */
export function hideTile(picture: Picture, size: number, fade: number): Picture {
  if (picture.width !== size + fade || picture.height !== size + fade) throw Error(`The picture must be ${size + fade} pixels square (the tile and its fade).`);
  return seamless(flatten(picture, Math.round(size / 4), meanOf(picture)), fade);
}

/** How unlike two opposite edges of a tile are, against how unlike two neighbouring columns inside it are: 1 is a join that does not show. */
export function seamRatio(p: Picture): number {
  const g = (x: number, y: number) => p.data[(y * p.width + x) * 3 + 1], mid = Math.floor(p.width / 2); let inside = 0, wrap = 0;
  for (let y = 0; y < p.height; y++) { inside += Math.abs(g(mid, y) - g(mid + 1, y)); wrap += Math.abs(g(p.width - 1, y) - g(0, y)); }
  return wrap / Math.max(1e-9, inside);
}

// ── command ─────────────────────────────────────────────────────────────────
// band: where a felt's band lies and how much light is divided out, where a picture needs other than RUNWAY_CLOTH's (a part of it is enough).
type Job = {id: string; kind: 'felt' | 'hide'; source: string; sourceSha256: string; file: string; size?: number; fade?: number; band?: Partial<typeof RUNWAY_CLOTH>};
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
async function make(job: Job, directory: string, camera: FilmCamera) {
  const source = await readFile(path.join(directory, job.source)), sha = sha256(source);
  if (sha !== job.sourceSha256) throw Error(`${job.source} is not the file data/scene-materials.json names (sha256 ${sha}).`);
  const sharp = (await import('sharp')).default;
  const rgb = (raw: {data: Buffer; info: {width: number; height: number}}): Picture => ({data: Float32Array.from(raw.data), width: raw.info.width, height: raw.info.height});
  let tile: Picture;
  if (job.kind === 'felt') { const raw = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject: true}); tile = feltTile({data: raw.data, width: raw.info.width, height: raw.info.height}, camera, FELT_PX_PER_M, {...RUNWAY_CLOTH, ...job.band}); }
  else { const size = job.size ?? 1024, fade = job.fade ?? 96; tile = hideTile(rgb(await sharp(source).removeAlpha().resize(size + fade, size + fade, {fit: 'cover', kernel: 'lanczos3'}).raw().toBuffer({resolveWithObject: true})), size, fade); }
  const bytes = Buffer.from(Uint8ClampedArray.from(tile.data).buffer), target = `assets/scene/materials/${job.file}`;
  const out = await sharp(bytes, {raw: {width: tile.width, height: tile.height, channels: 3}}).webp({quality: 92, effort: 5}).toBuffer();
  await mkdir('assets/scene/materials', {recursive: true}); await writeFile(target, out);
  const receipt = {id: job.id, kind: job.kind, source: {file: job.source, sha256: sha, bytes: source.length}, output: {path: target, sha256: sha256(out), bytes: out.length, width: tile.width, height: tile.height, meanRgb: meanOf(tile).map(v => Math.round(v)), seamRatio: Number(seamRatio(tile).toFixed(2))}, createdAt: new Date().toISOString()};
  await writeFile(`assets/scene/materials/${job.id}.receipt.json`, JSON.stringify(receipt, null, 2));
  console.log(`${job.id}: ${target}, ${tile.width} × ${tile.height} px, ${(out.length / 1024).toFixed(0)} kB, medelfärg ${receipt.output.meanRgb.join('/')}, skarv ${receipt.output.seamRatio}, sha256 ${receipt.output.sha256}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'scene-material.ts')) {
  const config = JSON.parse(await readFile('data/scene-materials.json', 'utf8')).generated, wanted = process.argv.slice(2), jobs: Job[] = wanted.includes('--all') ? config.maps : config.maps.filter((m: Job) => wanted.includes(m.id));
  if (!jobs.length) { console.log(`Ange ett id ur "generated" i data/scene-materials.json (${config.maps.map((m: Job) => m.id).join(', ')}) eller --all.`); process.exitCode = 1; }
  const camera = cameraFromContract(JSON.parse(await readFile('data/scene-contract.json', 'utf8')));
  for (const job of jobs) await make(job, config.source.directory, camera);
}
