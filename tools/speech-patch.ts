// Mouth patches (src/speech-patch.ts): a spoken line laid on a film while it plays. This tool cuts them, checks them and writes
// the register the game reads; the speech tool writes new ones with writePatch when it lays a mouth back.
//   node tools/speech-patch.ts cut --from assets/speech/paow/paow-tal-goodluck-over-ingang-2-1-02-01-02 [--out <dir>] [--id <id>]
//   node tools/speech-patch.ts self --film paow-ingang-2-1-02-01 --box 768,208,184,176 --out <dir> [--first 10 --count 65]
//   node tools/speech-patch.ts check <dir> [--film ja]
//   node tools/speech-patch.ts register
//
//   cut       a patch out of a line said over a film (tools/speech.ts over): the renderer's own answer (worker.mp4, one encoding
//             fewer than the film it made), the box and the gate's weights from its receipt, and the line's sound exactly as the
//             renderer heard it (the take's tts.mp3 through the speech tool's toPcm). Written to assets/speech/<dealer>/patches/<id>/
//             unless --out says otherwise.
//   self      a patch cut out of the film itself, every weight 1 and a short silence for sound: laid on its film it must give the
//             film back. The colour test (the contract: mean difference under half a level per channel, no pixel over 4).
//   check     the record against the contract, the files against their hashes, the strip against the layout; with --film ja also
//             the cells against the film's own frames outside the box the renderer changed (made.changed), in numbers.
//   register  every patch folder under assets/speech/<dealer>/patches/ that checks, into data/speech-patches.json (the only writer).
import {readFile, writeFile, mkdir, readdir, rename, rm} from 'node:fs/promises';
import {existsSync, createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {PATCH, cellAt, cellRgb, patchProblems, patchRange, readWav, stripLayout, wavBytes, type MouthPatch, type PatchBox, type PatchRegister} from '../src/speech-patch.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg', SCRATCH = 'D:/dealer-scratch/tmp';
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const sha256File = (file: string) => new Promise<string>((resolve, reject) => { const h = createHash('sha256'); createReadStream(file).on('data', c => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex'))); });
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const rel = (file: string) => path.relative(repo, file).replaceAll('\\', '/');

/** A film's frames as planar 4:2:0, one buffer per frame, exactly as decoded (no colour conversion). */
export async function* yuvFrames(file: string, width: number, height: number): AsyncGenerator<Uint8Array> {
  const bytes = width * height * 3 / 2, child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], {stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true});
  let frame = Buffer.allocUnsafe(bytes), filled = 0;
  try {
    for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
      while (at < chunk.length) { const take = Math.min(chunk.length - at, bytes - filled); chunk.copy(frame, filled, at, at + take); filled += take; at += take;
        if (filled === bytes) { yield frame; frame = Buffer.allocUnsafe(bytes); filled = 0; } } }
  } finally { child.kill(); }
  if (filled) throw Error(`${file}: en ofullständig bildruta i slutet.`);
}

// ── writing a patch ──────────────────────────────────────────────────────────
/** The strip being filled: the cells of the frames the gate draws in, converted by cellRgb as the frames come. */
export type Strip = {first: number; count: number; columns: number; rows: number; width: number; height: number; rgb: Uint8Array; filled: Set<number>;
  /** Puts film frame `filmFrame` in its cell, read from a planar 4:2:0 frame of width × height whose (x0, y0) is the box's corner. */
  put(filmFrame: number, frame: Uint8Array, width: number, height: number, x0: number, y0: number): void};
/** The strip for a box and the gate's weights over the whole film (one per film frame). Null when the gate draws nothing. */
export function createStrip(box: PatchBox, weights: readonly number[]): Strip | null {
  const range = patchRange(weights); if (!range) return null;
  const layout = stripLayout(range.count, box.w, box.h), rgb = new Uint8Array(layout.width * layout.height * 3), filled = new Set<number>();
  return {...range, ...layout, rgb, filled, put(filmFrame, frame, width, height, x0, y0) {
    const i = filmFrame - range.first; if (i < 0 || i >= range.count) return;
    const at = cellAt(i, layout.columns, box.w, box.h); cellRgb(frame, width, height, x0, y0, box.w, box.h, rgb, layout.width, at.x, at.y); filled.add(i); }};
}
export type PatchInput = Omit<MouthPatch, 'schemaVersion' | 'kind' | 'first' | 'count' | 'weights' | 'strip' | 'sound'> & {
  /** The gate's weight for every frame of the film, from frame 0 (laidBack.weights). */
  weights: readonly number[];
  sound: {pcm: Uint8Array; rate?: number; startsAtSeconds: number};
  format?: 'webp' | 'png';
};
/**
 * Writes a patch folder: the strip (lossless, no metadata), the line as WAV and the record last, with every hash. The record is
 * checked against the contract before it is written, and the strip is read back and compared with what was meant, so a folder
 * with a patch.json in it is always whole. Returns the record.
 */
export async function writePatch(dir: string, input: PatchInput, strip: Strip): Promise<MouthPatch> {
  if (strip.filled.size !== strip.count) throw Error(`Rutnätet saknar ${strip.count - strip.filled.size} av ${strip.count} rutor.`);
  await mkdir(dir, {recursive: true});
  const format = input.format ?? 'webp', image = sharp(Buffer.from(strip.rgb), {raw: {width: strip.width, height: strip.height, channels: 3}});
  const bytes = format === 'webp' ? await image.webp({lossless: true, effort: 6}).toBuffer() : await image.png({compressionLevel: 9}).toBuffer();
  const back = await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
  if (back.info.width !== strip.width || back.info.height !== strip.height || !Buffer.from(strip.rgb).equals(back.data)) throw Error('Rutnätet blev inte förlustfritt.');
  const rate = input.sound.rate ?? PATCH.soundRate, wav = wavBytes(input.sound.pcm, rate), samples = input.sound.pcm.length / 2;
  const {weights, sound, format: _, ...rest} = input;
  const record: MouthPatch = {schemaVersion: 1, kind: 'mouth-patch', ...rest, first: strip.first, count: strip.count, weights: weights.slice(strip.first, strip.first + strip.count).map(w => Number(w.toFixed(3))),
    strip: {path: `mouth.${format}`, type: format === 'webp' ? 'image/webp' : 'image/png', lossless: true, columns: strip.columns, rows: strip.rows, width: strip.width, height: strip.height, colour: PATCH.colour, sha256: sha256(bytes)},
    sound: {path: 'line.wav', type: 'audio/wav', rate, channels: 1, samples, startsAtSeconds: sound.startsAtSeconds, endsAtSeconds: Number((sound.startsAtSeconds + samples / rate).toFixed(4)), sha256: sha256(wav)}};
  const problems = patchProblems(record); if (problems.length) throw Error(`Lappen håller inte kontraktet: ${problems.join(' ')}`);
  await writeFile(path.join(dir, record.strip.path), bytes); await writeFile(path.join(dir, 'line.wav'), wav);
  const tmp = path.join(dir, 'patch.json.tmp'); await writeFile(tmp, json(record)); await rename(tmp, path.join(dir, 'patch.json'));
  return record;
}

// ── cutting the first patches ────────────────────────────────────────────────
type OverReceipt = {id: string; dealer: string; kind: string; line: string; language: string; text: string; voice: {name: string; voiceId: string};
  film: {id: string; path: string; sha256: string}; sound: {from: string; startsAtSeconds: number; seconds: number};
  renderer?: {releaseSha256?: string; jobId?: string; requestId?: string}; worker: {path: string; sha256: string};
  laidBack: {bridge: {film: {width: number; height: number}; cropX: number; padY: number; skipStart: number; skipEnd: number}; changed: PatchBox; box: PatchBox; feather: number; gate?: Record<string, number>; weights: number[]};
  output: {fps: number; frames: number}};
const filmInfo = async (filmPath: string) => { const id = filmPath.split('/')[2], record = JSON.parse(await readFile(path.join(repo, 'motions', `${id}.json`), 'utf8')) as {source: {path: string; sha256: string; fps: number; frames: number; width: number; height: number}};
  return {id, path: record.source.path, sha256: record.source.sha256, fps: record.source.fps, frames: record.source.frames, width: record.source.width, height: record.source.height}; };
/** A patch cut out of a line said over a film (the speech tool's `over` folder). */
export async function cutPatch(from: string, out?: string, id?: string, log = console.log): Promise<{dir: string; record: MouthPatch}> {
  const folder = path.resolve(repo, from), receipt = JSON.parse(await readFile(path.join(folder, 'receipt.json'), 'utf8')) as OverReceipt;
  if (receipt.kind !== 'over') throw Error(`${from}: inte en replik över en film (kind ${receipt.kind}).`);
  const film = await filmInfo(receipt.film.path); if (film.sha256 !== receipt.film.sha256) throw Error(`${from}: filmen har ändrats sedan repliken lades (sha256).`);
  const worker = path.join(folder, receipt.worker.path); if (await sha256File(worker) !== receipt.worker.sha256) throw Error(`${from}: worker.mp4 är inte den kvittot nämner.`);
  const {bridge, box, weights} = receipt.laidBack; if (weights.length !== film.frames) throw Error(`${from}: ${weights.length} vikter för ${film.frames} rutor.`);
  const strip = createStrip(box, weights); if (!strip) throw Error(`${from}: grinden lägger munnen i ingen ruta.`);
  const RW = 1080, RH = 1920; let k = 0;
  for await (const frame of yuvFrames(worker, RW, RH)) { if (k < film.frames) strip.put(k, frame, RW, RH, box.x - bridge.cropX, box.y + bridge.padY); k++; }
  const {toPcm} = await import('./speech.ts'), base = path.dirname(folder), tts = path.join(base, receipt.sound.from), work = path.join(existsSync(SCRATCH) ? SCRATCH : os.tmpdir(), `speech-patch-${process.pid}.pcm`);
  const pcm = await toPcm(tts, work).finally(() => rm(work, {force: true}));
  const said = JSON.parse(await readFile(path.join(base, receipt.sound.from.split('/')[0], 'receipt.json'), 'utf8')) as {sound?: {pcmSha256?: string}};
  if (said.sound?.pcmSha256 && said.sound.pcmSha256 !== sha256(pcm)) throw Error(`${from}: ljudet blev inte det renderern fick (pcmSha256).`);
  const name = id ?? `${receipt.dealer}-mun-${receipt.line}-${receipt.language}-${film.id.replace(new RegExp(`^${receipt.dealer}-`), '')}`, dir = out ? path.resolve(out) : path.join(repo, 'assets/speech', receipt.dealer, 'patches', name);
  const record = await writePatch(dir, {id: name, dealer: receipt.dealer, film, line: {key: receipt.line, language: receipt.language, text: receipt.text, voice: receipt.voice.name, voiceId: receipt.voice.voiceId},
    box, feather: receipt.laidBack.feather, weights, sound: {pcm, startsAtSeconds: receipt.sound.startsAtSeconds},
    made: {by: 'tools/speech-patch.ts cut', at: new Date().toISOString(), from: {path: rel(worker), sha256: receipt.worker.sha256}, bridge: {cropX: bridge.cropX, padY: bridge.padY}, ...(receipt.laidBack.gate ? {gate: receipt.laidBack.gate} : {}),
      changed: receipt.laidBack.changed, renderer: {releaseSha256: receipt.renderer?.releaseSha256, jobId: receipt.renderer?.jobId, requestId: receipt.renderer?.requestId, receipt: rel(path.join(folder, 'receipt.json'))}}}, strip);
  log(`${name}: ${record.count} rutor (film ${record.first}–${record.first + record.count - 1}) i ${record.strip.columns} × ${record.strip.rows}, ${record.sound.samples} samplingar från ${record.sound.startsAtSeconds} s → ${rel(dir)}`);
  return {dir, record};
}
/** A patch of the film itself (every weight 1, a tenth of a second of silence): laid on its film it must give the film back. */
export async function selfPatch(filmId: string, box: PatchBox, out: string, first = 0, count?: number): Promise<{dir: string; record: MouthPatch}> {
  const film = await filmInfo(`assets/motions/${filmId}/source.mp4`), n = count ?? film.frames - first, weights = Array.from({length: film.frames}, (_, k) => k >= first && k < first + n ? 1 : 0);
  const strip = createStrip(box, weights)!; let k = 0;
  for await (const frame of yuvFrames(path.join(repo, film.path), film.width, film.height)) { strip.put(k++, frame, film.width, film.height, box.x, box.y); }
  const record = await writePatch(path.resolve(out), {id: `${filmId}-self`, dealer: filmId.split('-')[0], film, line: {key: 'self', language: 'sv', text: '(filmen själv)', voice: 'ingen'}, box, feather: 24, weights,
    sound: {pcm: new Uint8Array(PATCH.soundRate / 10 * 2), startsAtSeconds: first / film.fps}, made: {by: 'tools/speech-patch.ts self', at: new Date().toISOString(), from: {path: film.path, sha256: film.sha256}}}, strip);
  return {dir: path.resolve(out), record};
}

// ── checking ─────────────────────────────────────────────────────────────────
export type CheckResult = {problems: string[]; measured?: {frames: number; ring: {pixels: number; meanAbs: number[]; max: number}; changed: {meanAbs: number[]; max: number}}};
/** The record against the contract, the files against their hashes and the layout; with `film` the cells against the film's frames. */
export async function checkPatch(dir: string, film = false): Promise<CheckResult> {
  const problems: string[] = [], file = path.join(dir, 'patch.json');
  if (!existsSync(file)) return {problems: [`${dir}: ingen patch.json.`]};
  const p = JSON.parse(await readFile(file, 'utf8')) as MouthPatch; problems.push(...patchProblems(p));
  if (problems.length) return {problems};
  const stripFile = path.join(dir, p.strip.path), wavFile = path.join(dir, p.sound.path);
  if (!existsSync(stripFile) || await sha256File(stripFile) !== p.strip.sha256) problems.push(`${p.strip.path} saknas eller har inte postens sha256.`);
  if (!existsSync(wavFile) || await sha256File(wavFile) !== p.sound.sha256) problems.push(`${p.sound.path} saknas eller har inte postens sha256.`);
  const filmFile = path.join(repo, p.film.path);
  if (!existsSync(filmFile)) problems.push(`${p.film.path} finns inte på den här datorn.`); else if (await sha256File(filmFile) !== p.film.sha256) problems.push(`${p.film.path} är inte den fil lappen gjordes över (sha256).`);
  if (problems.length) return {problems};
  const decoded = await sharp(await readFile(stripFile)).removeAlpha().raw().toBuffer({resolveWithObject: true});
  if (decoded.info.width !== p.strip.width || decoded.info.height !== p.strip.height) problems.push(`Rutnätet är ${decoded.info.width} × ${decoded.info.height}, posten säger ${p.strip.width} × ${p.strip.height}.`);
  const wav = readWav(new Uint8Array(await readFile(wavFile))); if (wav.rate !== p.sound.rate || wav.channels !== 1 || wav.samples !== p.sound.samples) problems.push('Ljudfilen stämmer inte med posten (takt, kanaler eller samplingar).');
  if (!film || problems.length) return {problems};
  // The cells against the film's own frames, converted alike: outside the box the renderer changed (made.renderer.changed) the
  // renderer drew nothing, so what differs there is its encoding; inside it is the drawn mouth.
  const changed = p.made.changed ?? null, {x, y, w, h} = p.box, cell = new Uint8Array(w * h * 3);
  const ring = {n: 0, sum: [0, 0, 0], max: 0}, inner = {n: 0, sum: [0, 0, 0], max: 0}; let k = 0, frames = 0;
  for await (const frame of yuvFrames(filmFile, p.film.width, p.film.height)) {
    const i = k - p.first; k++; if (i < 0 || i >= p.count) continue; frames++;
    cellRgb(frame, p.film.width, p.film.height, x, y, w, h, cell, w); const at = cellAt(i, p.strip.columns, w, h);
    for (let j = 0; j < h; j++) for (let q = 0; q < w; q++) {
      const inside = changed && x + q >= changed.x && x + q < changed.x + changed.w && y + j >= changed.y && y + j < changed.y + changed.h, to = inside ? inner : ring; to.n++;
      for (let c = 0; c < 3; c++) { const d = Math.abs(decoded.data[((at.y + j) * p.strip.width + at.x + q) * 3 + c] - cell[(j * w + q) * 3 + c]); to.sum[c] += d; if (d > to.max) to.max = d; } }
  }
  const mean = (s: {n: number; sum: number[]}) => s.sum.map(v => Number((v / Math.max(1, s.n)).toFixed(3)));
  return {problems, measured: {frames, ring: {pixels: ring.n, meanAbs: mean(ring), max: ring.max}, changed: {meanAbs: mean(inner), max: inner.max}}};
}

// ── the register ─────────────────────────────────────────────────────────────
/** Every patch folder under assets/speech/<dealer>/patches/ that checks, into data/speech-patches.json. Returns what was left out. */
export async function writeRegister(log = console.log): Promise<string[]> {
  const base = path.join(repo, 'assets/speech'), patches: PatchRegister['patches'] = [], left: string[] = [];
  for (const dealer of existsSync(base) ? (await readdir(base)).sort() : []) {
    const dir = path.join(base, dealer, 'patches'); if (!existsSync(dir)) continue;
    for (const id of (await readdir(dir)).sort()) { const folder = path.join(dir, id), checked = await checkPatch(folder);
      if (checked.problems.length) { left.push(`${dealer}/${id}: ${checked.problems.join(' ')}`); continue; }
      const text = await readFile(path.join(folder, 'patch.json')), p = JSON.parse(text.toString('utf8')) as MouthPatch;
      if (p.id !== id || p.dealer !== dealer) { left.push(`${dealer}/${id}: postens id eller dealer stämmer inte med mappen.`); continue; }
      patches.push({id, dealer, film: p.film.path, line: p.line.key, language: p.line.language, voice: p.line.voice, path: rel(path.join(folder, 'patch.json')), sha256: sha256(text)}); } }
  const register: PatchRegister = {schemaVersion: 1, about: 'The mouth patches the game may lay on its films (src/speech-patch.ts, docs/TAL.md): one film and one line each, with the sha256 of its record. Written by node tools/speech-patch.ts register and by nothing else; a folder that does not check is left out.', patches};
  await writeFile(path.join(repo, 'data/speech-patches.json'), json(register));
  log(`data/speech-patches.json: ${patches.length} lappar${left.length ? `, ${left.length} utelämnade` : ''}.`);
  return left;
}

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args, flags: Record<string, string> = {}, plain: string[] = [];
  for (let i = 0; i < rest.length; i++) { if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1] ?? ''; i++; } else plain.push(rest[i]); }
  if (command === 'cut') { if (!flags.from) { console.error('Ange --from (mappen för en replik över en film).'); return 2; } await cutPatch(flags.from, flags.out, flags.id); return 0; }
  if (command === 'self') { const box = (flags.box ?? '').split(',').map(Number); if (!flags.film || box.length !== 4 || !flags.out) { console.error('Ange --film, --box x,y,w,h och --out.'); return 2; }
    const {dir} = await selfPatch(flags.film, {x: box[0], y: box[1], w: box[2], h: box[3]}, flags.out, flags.first ? Number(flags.first) : 0, flags.count ? Number(flags.count) : undefined); console.log(`Lappen av filmen själv → ${dir}`); return 0; }
  if (command === 'check') { if (!plain[0]) { console.error('Ange lappens mapp.'); return 2; } const result = await checkPatch(path.resolve(plain[0]), flags.film === 'ja');
    console.log(result.problems.length ? result.problems.join('\n') : 'Lappen håller kontraktet.'); if (result.measured) console.log(JSON.stringify(result.measured)); return result.problems.length ? 1 : 0; }
  if (command === 'register') { const left = await writeRegister(); for (const line of left) console.log(`utelämnad: ${line}`); return 0; }
  console.error('Kommandon: cut --from <mapp> | self --film <klipp> --box x,y,w,h --out <mapp> | check <mapp> [--film ja] | register'); return 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(String(error?.message ?? error)); process.exitCode = 1; });
