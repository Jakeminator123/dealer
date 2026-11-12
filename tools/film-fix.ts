// Applies a fix list (src/film-fix.ts) to a delivered film and writes the fixed copy beside it. The original is only read.
//   node tools/film-fix.ts <film.mp4> <fixes.json>
// Writes in the film's folder, n the next free number:
//   fixed-<n>.mp4         H.264 High 4:2:0 at the film's own size and frame rate, CRF 12, no sound
//   fix-receipt-<n>.json  the steps as written, per step the frames it changed and the largest pixel difference, SHA-256 of the
//                         original before and after (unchanged) and of the copy, which frames were dropped (trim) and how close the
//                         encoded copy is to the fixed frames
//   fix-strip-<n>.png     before, after and the difference ×4 for up to eight changed frames, for the review (not instead of it)
// A refused list writes nothing and exits with code 2; the reasons are printed in Swedish. Pictures the list names (level's
// reference, patch's mask) are read relative to the current folder, as every path in the bank is written. The fixed copy is a film of
// its own: it is reviewed again (tools/film-review.md) and enters the bank as a corrected copy (tools/register-order.ts --fixed <n>).
import {readFile, writeFile, readdir, rename, rm, stat, mkdtemp} from 'node:fs/promises';
import {existsSync, openSync, readSync, writeSync, closeSync, createReadStream} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {readFixes, checkFixes, applyFixes, picturesOf, targetsOf, type FrameStore, type Picture, type FixOp, type OpReport} from '../src/film-fix.ts';

const scratch = 'D:/dealer-scratch/tmp', env = existsSync(scratch) ? {...process.env, TEMP: scratch, TMP: scratch} : process.env;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg', ffprobe = process.env.FFPROBE ?? 'ffprobe';
export const ENCODING = 'H.264 High, yuv420p (4:2:0), CRF 12, preset slow, no sound';
const STRIP_FRAMES = 8, STRIP_WIDTH = 560;

export type Probe = {width: number; height: number; fps: string; rate: number; frames: number; codec: string; profile: string | null; pixelFormat: string; audio: boolean; colour: Record<string, string>};
/** Facts of a film's first video stream, frames counted by decoding. */
export function probe(file: string): Probe {
  const streams: Record<string, string>[] = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,r_frame_rate,nb_read_frames,pix_fmt,color_space,color_range,color_primaries,color_transfer', '-of', 'json', file], {env, windowsHide: true}).toString()).streams ?? [];
  const v = streams.find(s => s.codec_type === 'video');
  if (!v) throw Error(`${file}: ingen videoström.`);
  const [n, d] = String(v.r_frame_rate).split('/').map(Number), colour: Record<string, string> = {};
  for (const key of ['color_space', 'color_range', 'color_primaries', 'color_transfer']) if (v[key] && v[key] !== 'unknown') colour[key] = v[key];
  return {width: Number(v.width), height: Number(v.height), fps: String(v.r_frame_rate), rate: n / (d || 1), frames: Number(v.nb_read_frames), codec: String(v.codec_name), profile: v.profile ?? null, pixelFormat: String(v.pix_fmt), audio: streams.some(s => s.codec_type === 'audio'), colour};
}
export const sha256File = (file: string) => new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(file).on('data', c => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex'))); });
const run = (args: string[], input?: (stdin: NodeJS.WritableStream) => Promise<void>) => new Promise<void>((resolve, reject) => {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'], windowsHide: true, env});
  let err = ''; child.stderr!.on('data', c => { err += c; });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg ${code}: ${err.trim().slice(0, 400)}`)));
  if (input) input(child.stdin!).then(() => child.stdin!.end(), reject);
});
async function* frames(file: string, bytes: number): AsyncGenerator<Buffer> {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, env});
  let frame = Buffer.allocUnsafe(bytes), filled = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
    while (at < chunk.length) { const take = Math.min(chunk.length - at, bytes - filled); chunk.copy(frame, filled, at, at + take); filled += take; at += take;
      if (filled === bytes) { yield frame; frame = Buffer.allocUnsafe(bytes); filled = 0; } } }
}
// The colour tags of the source, kept on the copy with the matching conversion, so that the copy decodes to the same colours. An
// untagged film (the bank's) stays untagged and is converted the way FFmpeg decoded it.
const MATRIX: Record<string, string> = {bt709: 'bt709', smpte170m: 'smpte170m', bt470bg: 'bt470', bt2020nc: 'bt2020', fcc: 'fcc', smpte240m: 'smpte240m'};
function colourArgs(colour: Record<string, string>): string[] {
  const out: string[] = [], matrix = MATRIX[colour.color_space ?? ''];
  if (matrix) out.push('-vf', `scale=out_color_matrix=${matrix}:out_range=${colour.color_range === 'pc' ? 'pc' : 'tv'}`);
  if (colour.color_space) out.push('-colorspace', colour.color_space);
  if (colour.color_primaries) out.push('-color_primaries', colour.color_primaries);
  if (colour.color_transfer) out.push('-color_trc', colour.color_transfer);
  if (colour.color_range) out.push('-color_range', colour.color_range);
  return out;
}
const shown = (file: string) => { const rel = path.relative(process.cwd(), path.resolve(file)); return !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : path.resolve(file).split(path.sep).join('/'); };

/** Reads a picture the list names: RGB for a reference, the first channel for a mask (white = the area). */
async function picture(file: string): Promise<Picture & {sha256: string}> {
  const {data, info} = await sharp(file).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject: true});
  const rgb = info.channels === 3 ? data : Buffer.from(Array.from({length: info.width * info.height * 3}, (_, k) => data[Math.floor(k / 3) * info.channels + (info.channels >= 3 ? k % 3 : 0)]));
  return {width: info.width, height: info.height, channels: 3, data: new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.length), sha256: createHash('sha256').update(await readFile(file)).digest('hex')};
}

/** Up to eight frames for the strip: the first frame of every step, then evenly through the rest of the frames the list changes. */
export function stripFrames(ops: readonly FixOp[], film: {count: number; width: number; height: number}): number[] {
  const ranges = ops.map(op => targetsOf(op, film, ops)).filter((r): r is [number, number] => !!r), picked = new Set<number>(ranges.map(r => r[0]).slice(0, STRIP_FRAMES));
  const all = [...new Set(ranges.flatMap(([a, b]) => Array.from({length: b - a + 1}, (_, i) => a + i)))].sort((x, y) => x - y);
  for (let j = 0; j < STRIP_FRAMES && picked.size < STRIP_FRAMES && all.length; j++) picked.add(all[Math.round(j * (all.length - 1) / (STRIP_FRAMES - 1))]);
  for (const f of all) { if (picked.size >= STRIP_FRAMES) break; picked.add(f); }
  return [...picked].sort((x, y) => x - y);
}

async function strip(file: string, width: number, height: number, rows: {frame: number; before: Uint8Array; after: Uint8Array}[]) {
  const tw = Math.min(STRIP_WIDTH, width), th = Math.round(height * tw / width), gap = 8, head = 22, W = tw * 3 + gap * 4, H = rows.length * (th + head + gap) + gap;
  const tile = (data: Uint8Array) => sharp(Buffer.from(data.buffer, data.byteOffset, data.length), {raw: {width, height, channels: 3}}).resize(tw, th).png().toBuffer();
  const layers: {input: Buffer; left: number; top: number}[] = [], text: string[] = [];
  for (const [r, row] of rows.entries()) {
    const diff = new Uint8Array(width * height * 3);
    for (let p = 0; p < width * height; p++) { const i = p * 3, d = Math.min(255, 4 * Math.max(Math.abs(row.before[i] - row.after[i]), Math.abs(row.before[i + 1] - row.after[i + 1]), Math.abs(row.before[i + 2] - row.after[i + 2]))); diff[i] = diff[i + 1] = diff[i + 2] = d; }
    const top = gap + r * (th + head + gap);
    for (const [c, [data, word]] of ([[row.before, 'före'], [row.after, 'efter'], [diff, 'skillnad ×4']] as const).entries()) {
      layers.push({input: await tile(data), left: gap + c * (tw + gap), top: top + head});
      text.push(`<text x="${gap + c * (tw + gap)}" y="${top + 16}" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#e8e8e8">ruta ${row.frame} · ${word}</text>`);
    }
  }
  layers.push({input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${text.join('')}</svg>`), left: 0, top: 0});
  await sharp({create: {width: W, height: H, channels: 3, background: '#1b1b1b'}}).composite(layers).png().toFile(file);
}

export type FixOutcome = {ok: true; fixed: string; receipt: string; strip: string; n: number; record: Record<string, unknown>} | {ok: false; refusals: string[]};
/** The whole run for one film and one list. Nothing is written unless every step holds. */
export async function fixFilm(filmPath: string, fixesPath: string): Promise<FixOutcome> {
  const film = path.resolve(filmPath), dir = path.dirname(film), sourceSha = await sha256File(film), facts = probe(film);
  const listText = await readFile(fixesPath, 'utf8'), {ops, refusals} = readFixes(JSON.parse(listText));
  if (refusals.length) return {ok: false, refusals};
  const pictures: Record<string, Picture & {sha256: string}> = {}, missing: string[] = [];
  for (const name of picturesOf(ops)) { if (existsSync(name)) pictures[name] = await picture(name); else missing.push(`Bilden ${name} finns inte (sökvägar läses från den aktuella mappen).`); }
  if (missing.length) return {ok: false, refusals: missing};
  const {width: W, height: H} = facts, bytes = W * H * 3, shape = {count: facts.frames, width: W, height: H}, early = checkFixes(ops, shape, pictures);
  if (early.length) return {ok: false, refusals: early};
  const temp = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'film-fix-')), work = path.join(temp, 'work.rgb'), written: string[] = [];
  let fd = -1, whole = false;
  try {
    await run(['-i', film, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', work]);
    const count = (await stat(work)).size / bytes;
    if (count !== facts.frames) throw Error(`Avkodningen gav ${count} rutor, ffprobe räknade ${facts.frames}.`);
    fd = openSync(work, 'r+');
    const store: FrameStore = {count, width: W, height: H,
      get(i) { const b = Buffer.allocUnsafe(bytes); readSync(fd, b, 0, bytes, i * bytes); return new Uint8Array(b.buffer, b.byteOffset, bytes); },
      set(i, data) { writeSync(fd, data, 0, bytes, i * bytes); }};
    const chosen = stripFrames(ops, shape), before = new Map(chosen.map(f => [f, store.get(f).slice()]));
    const result = applyFixes(store, ops, pictures);
    if (!result.ok) return {ok: false, refusals: result.refusals};
    // The next free number beside the film; the copy is written under a temporary name and renamed when it is whole.
    const taken = (await readdir(dir)).map(name => /^(?:fixed|fix-receipt|fix-strip)-(\d+)\./.exec(name)?.[1]).filter(Boolean).map(Number), n = Math.max(0, ...taken) + 1;
    const fixed = path.join(dir, `fixed-${n}.mp4`), receiptFile = path.join(dir, `fix-receipt-${n}.json`), stripFile = path.join(dir, `fix-strip-${n}.png`), part = `${fixed}.part`;
    const [keepFrom, keepTo] = result.keep;
    written.push(part, fixed, stripFile, receiptFile);
    await run(['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', facts.fps, '-i', '-', ...colourArgs(facts.colour), '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '12', '-preset', 'slow', '-movflags', '+faststart', '-f', 'mp4', part],
      async stdin => { for (let f = keepFrom; f <= keepTo; f++) if (!stdin.write(Buffer.from(store.get(f)))) await new Promise(resolve => stdin.once('drain', resolve)); });
    await rename(part, fixed);
    // How close the encoded copy is to the frames it was made from.
    let k = 0, sum = 0, max = 0;
    for await (const frame of frames(fixed, bytes)) { const want = store.get(keepFrom + k++); for (let i = 0; i < bytes; i++) { const d = Math.abs(frame[i] - want[i]); sum += d; if (d > max) max = d; } }
    const out = probe(fixed), keptCount = keepTo - keepFrom + 1;
    if (k !== keptCount || out.frames !== keptCount || out.width !== W || out.height !== H || out.fps !== facts.fps) throw Error(`Kopian blev ${out.width} × ${out.height}, ${out.frames} rutor i ${out.fps}; väntat ${W} × ${H}, ${keptCount} rutor i ${facts.fps}.`);
    await strip(stripFile, W, H, chosen.map(f => ({frame: f, before: before.get(f)!, after: store.get(f)})));
    const sourceAfter = await sha256File(film);
    if (sourceAfter !== sourceSha) throw Error('Originalet ändrades under körningen.');
    const fixedSha = await sha256File(fixed);
    const record = {schemaVersion: 1, tool: 'tools/film-fix.ts', createdAt: new Date().toISOString(),
      source: {path: shown(film), sha256: sourceSha, sha256After: sourceAfter, untouched: true, bytes: (await stat(film)).size, width: W, height: H, fps: facts.fps, frames: facts.frames, codec: facts.codec, profile: facts.profile, pixelFormat: facts.pixelFormat, audio: facts.audio, colour: facts.colour},
      fixes: {path: shown(fixesPath), sha256: createHash('sha256').update(listText).digest('hex'), list: ops},
      pictures: Object.fromEntries(Object.entries(pictures).map(([name, p]) => [name, {sha256: p.sha256, width: p.width, height: p.height}])),
      output: {path: shown(fixed), sha256: fixedSha, bytes: (await stat(fixed)).size, width: out.width, height: out.height, fps: out.fps, frames: out.frames, codec: out.codec, profile: out.profile, pixelFormat: out.pixelFormat, audio: false, encoding: ENCODING, colour: out.colour,
        keep: result.keep, frameShift: result.frameShift, frameMap: result.frameShift ? `ruta f i originalet är ruta f − ${result.frameShift} i kopian` : 'samma rutnummer som originalet',
        dropped: {start: keepFrom ? [0, keepFrom - 1] : null, end: keepTo < facts.frames - 1 ? [keepTo + 1, facts.frames - 1] : null}, soundDropped: facts.audio},
      steps: result.reports, changedFrames: result.changed,
      encodingCheck: {frames: k, meanAbsError: Math.round(sum / (k * bytes) * 1000) / 1000, maxAbsError: max, note: 'Kopian avkodad igen och jämförd med de rättade rutorna, per kanal.'},
      strip: {path: shown(stripFile), frames: chosen, columns: ['före', 'efter', 'skillnad ×4']},
      review: 'Kopian är en egen film: den granskas på nytt i full upplösning (tools/film-review.md) innan den förs in som rättad kopia.'};
    await writeFile(receiptFile, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
    whole = true;
    return {ok: true, fixed, receipt: receiptFile, strip: stripFile, n, record};
  } finally {
    if (fd >= 0) closeSync(fd);
    await rm(temp, {recursive: true, force: true});
    // A run that broke off leaves nothing half-made beside the film.
    if (!whole) for (const file of written) await rm(file, {force: true});
  }
}

if (import.meta.main) {
  const [film, list] = process.argv.slice(2);
  if (!film || !list) { console.error('Användning: node tools/film-fix.ts <film.mp4> <fixes.json>'); process.exit(1); }
  const outcome = await fixFilm(film, list);
  if (!outcome.ok) { console.error(JSON.stringify({refused: outcome.refusals}, null, 2)); process.exit(2); }
  const r = outcome.record as {steps: OpReport[]; output: {frames: number; frameShift: number}; encodingCheck: unknown; changedFrames: number[]};
  console.log(JSON.stringify({fixed: shown(outcome.fixed), receipt: shown(outcome.receipt), strip: shown(outcome.strip), frames: r.output.frames, frameShift: r.output.frameShift, changedFrames: r.changedFrames.length,
    steps: r.steps.map(s => ({step: s.step, op: s.op, changedFrames: s.changedFrames, maxPixelDiff: s.maxPixelDiff})), encodingCheck: r.encodingCheck}, null, 2));
}
