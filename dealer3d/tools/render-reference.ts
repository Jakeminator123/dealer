// Records a white-figure reference without the lab server. Run from the repo with Node, Chrome, FFmpeg and ffprobe.
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants as fsConstants, createReadStream} from 'node:fs';
import {copyFile, lstat, mkdir, readFile, readdir, stat, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {LOCK, lockLine, releaseLock, takeLock} from '../../tools/lab-look.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_FPS = 30, WIDTH = 1764, HEIGHT = 1174;
const FONT = path.join(process.env.SystemRoot ?? 'C:/Windows', 'Fonts', 'arial.ttf');
const INCOMPLETE = 'ofullstandig.txt';
const RECEIPT = 'renderkvitto.json';
const USAGE = 'node dealer3d/tools/render-reference.ts --motion <motion.json> --out <new folder> [--plan <plan.json>] [--eye film|1–7] [--seconds 3] [--fps 24|30] [--sheet 1,8,15,...] [--columns 4] [--closeup 17,20,22 --crop 560:440:760:560]';

const options = {
  motion: {type: 'string'}, out: {type: 'string'}, plan: {type: 'string'}, eye: {type: 'string'},
  seconds: {type: 'string'}, fps: {type: 'string'}, sheet: {type: 'string'}, columns: {type: 'string'},
  closeup: {type: 'string'}, crop: {type: 'string'}, help: {type: 'boolean'}, 'keep-frames': {type: 'boolean'},
} as const;
type Values = Partial<Record<Exclude<keyof typeof options, 'help'>, string>>;

function frameList(text: string, count: number, name: string): number[] {
  const frames = text.split(',').map(word => /^\d+$/.test(word) ? Number(word) : NaN);
  if (frames.length > 16 || new Set(frames).size !== frames.length || frames.some(frame => !Number.isInteger(frame) || frame < 1 || frame > count)) {
    throw Error(`${name}: ange högst 16 olika rutnummer mellan 1 och ${count}.`);
  }
  return frames;
}

export function renderSettings(values: Values, motion: {fps?: number; frameCount?: number; frames?: unknown[]}) {
  if (!Number.isFinite(motion.fps) || motion.fps! <= 0 || !Number.isInteger(motion.frameCount) || motion.frameCount !== motion.frames?.length || !motion.frameCount) {
    throw Error('Rörelsedata saknar giltig fps, frameCount eller frames.');
  }
  if (values.fps !== undefined && values.fps !== '24' && values.fps !== '30') throw Error('--fps ska vara 24 eller 30.');
  const fps = values.fps === '24' ? 24 : DEFAULT_FPS;
  const seconds = values.seconds === undefined ? motion.frameCount / motion.fps! : Number(values.seconds);
  const frameCount = Math.round(seconds * fps);
  if (!Number.isFinite(seconds) || frameCount < 1 || seconds > 30) throw Error('Filmlängden måste ge minst en ruta och vara högst 30 sekunder.');
  const eye = values.eye ?? 'film';
  if (!/^(film|[1-7])$/.test(eye)) throw Error('--eye ska vara film eller en stol 1–7.');
  const columns = Number(values.columns ?? 4);
  if (!Number.isInteger(columns) || columns < 1 || columns > 4) throw Error('--columns ska vara 1–4.');
  const samples = Math.min(frameCount, 16);
  const sheet = values.sheet === undefined
    ? Array.from({length: samples}, (_, index) => 1 + Math.round(index * (frameCount - 1) / Math.max(1, samples - 1)))
    : frameList(values.sheet, frameCount, '--sheet');
  if ((values.closeup === undefined) !== (values.crop === undefined)) throw Error('--closeup och --crop behövs tillsammans.');
  let closeup: {frames: number[]; crop: string} | undefined;
  if (values.closeup !== undefined) {
    const crop = values.crop!;
    if (!/^\d+:\d+:\d+:\d+$/.test(crop)) throw Error('--crop ska vara bredd:höjd:x:y i bildpunkter.');
    const [width, height, x, y] = crop.split(':').map(Number);
    if (width < 1 || height < 1 || x + width > WIDTH || y + height > HEIGHT) throw Error('--crop måste ligga inom filmrutan.');
    closeup = {frames: frameList(values.closeup, frameCount, '--closeup'), crop};
  }
  return {eye, fps, frameCount, lastTime: (frameCount - 1) / fps, sheet, columns, closeup};
}

type Capture = {chrome?: string; query?: {motion?: string}; film?: {fps?: number; from?: number; to?: number}; times?: unknown};
/** Verify that Chrome rendered the requested instants before turning the PNG sequence into a video. */
export function verifyCapture(shot: Capture, motion: string, {fps, frameCount, lastTime}: Pick<ReturnType<typeof renderSettings>, 'fps' | 'frameCount' | 'lastTime'>): void {
  if (typeof shot.chrome !== 'string' || shot.query?.motion !== motion) throw Error('Inspelningen saknar rätt rörelse eller Chrome-kvitto.');
  const {film, times} = shot;
  if (film?.fps !== fps || film.from !== 0 || film.to !== lastTime ||
      !Array.isArray(times) || times.length !== frameCount || !times.every((time, frame) => time === frame / fps)) {
    throw Error('Inspelningens tidsprover avviker från vald bildfrekvens.');
  }
}

/** Reserve the final directory exclusively. An interrupted attempt also keeps its name and its files. */
export async function reserveOutput(out: string): Promise<void> {
  await mkdir(path.dirname(out), {recursive: true});
  try { await mkdir(out); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw Error(`Utdatamappen finns redan: ${out}`);
    throw error;
  }
  await writeFile(path.join(out, INCOMPLETE), 'Renderingen påbörjades. Det färdiga kvittot skrivs sist.\n', {flag: 'wx'});
}

type ProbeStream = {codec_name?: string; width?: number; height?: number; pix_fmt?: string; r_frame_rate?: string; avg_frame_rate?: string; nb_frames?: string; duration?: string};
export function verifyVideo(stream: ProbeStream | undefined, frames: number, fps = DEFAULT_FPS): void {
  const rate = `${fps}/1`;
  if (!stream || stream.codec_name !== 'h264' || stream.width !== WIDTH || stream.height !== HEIGHT || stream.pix_fmt !== 'yuv420p' ||
      stream.r_frame_rate !== rate || stream.avg_frame_rate !== rate || Number(stream.nb_frames) !== frames || !Number.isFinite(Number(stream.duration)) ||
      Math.abs(Number(stream.duration) - frames / fps) > 0.001) throw Error('ffprobe bekräftade inte väntat format, rutantal och längd.');
}

const command = (program: string, args: string[]) =>
  execFileSync(program, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe']}).trim();

function run(program: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {cwd: ROOT, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']});
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(Error(`${program} avslutades med ${signal ?? code}.`)));
  });
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

const threePath = 'node_modules/three';
async function renderedSources(): Promise<Record<string, string>> {
  const roots = command('git', ['ls-files', '-z', '--', 'dealer3d/page', 'dealer3d/src']).split('\0').filter(Boolean);
  const files = [...roots, 'dealer3d/tools/render-reference.ts', 'dealer3d/tools/shoot.ts', 'src/table-lens.ts',
    'tools/lab-look.ts', `${threePath}/build/three.core.js`, `${threePath}/build/three.module.js`].sort();
  const hashes = [];
  for (const file of files) hashes.push([file, await sha256(path.join(ROOT, file))]);
  return Object.fromEntries(hashes);
}

const parseJson = (bytes: Buffer) => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const readJson = async (filename: string) => parseJson(await readFile(filename));
const frameName = (frame: number) => `ruta-${String(frame).padStart(4, '0')}.png`;

/** Called only after video verification and proof images succeed. Keep capture metadata, not another full movie as PNGs. */
export async function finishFrames(record: string, frameCount: number, keep = false) {
  if (keep) return {kept: true, removed: 0, bytes: 0};
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 900) throw Error('Ogiltigt rutantal för städning.');
  if (!(await lstat(record)).isDirectory() || (await lstat(record)).isSymbolicLink()) throw Error('Rutmappen måste vara en vanlig mapp.');
  const expected = Array.from({length: frameCount}, (_, i) => frameName(i + 1));
  const actual = (await readdir(record)).filter(name => /^ruta-.*\.png$/i.test(name)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Rutmappen stämmer inte med den verifierade filmen.');
  let bytes = 0;
  // Validate the complete set before deleting any frame. Never follow links or remove the capture receipt.
  for (const name of expected) {
    const entry = await lstat(path.join(record, name));
    if (!entry.isFile() || entry.isSymbolicLink()) throw Error('En renderad ruta är inte en vanlig fil.');
    bytes += entry.size;
  }
  for (const name of expected) await unlink(path.join(record, name));
  return {kept: false, removed: frameCount, bytes};
}

function makeSheet(ffmpeg: (args: string[]) => Promise<void>, filenames: string[], numbers: number[], columns: number, crop: string | undefined, out: string) {
  const args = filenames.flatMap(name => ['-threads', '1', '-i', name]);
  const font = FONT.replaceAll('\\', '/').replace(/^([a-z]):/i, '$1\\:');
  const processed = numbers.map((number, index) => `[${index}:v]${crop ? `crop=${crop}` : 'scale=588:391'},drawtext=fontfile='${font}':text='ruta ${number}':x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.5[v${index}]`);
  if (numbers.length > 1) {
    const [width, height] = crop ? crop.split(':').map(Number) : [588, 391];
    const layout = numbers.map((_, index) => `${index % columns * width}_${Math.floor(index / columns) * height}`);
    const labels = numbers.map((_, i) => `[v${i}]`).join('');
    processed.push(`${labels}xstack=inputs=${numbers.length}:layout=${layout.join('|')}:fill=black[s]`);
  }
  return ffmpeg([...args, '-filter_complex', processed.join(';'), '-map', numbers.length > 1 ? '[s]' : '[v0]', '-frames:v', '1', '-threads', '4', '-update', '1', out]);
}

async function main(argv: string[]): Promise<void> {
  const {values} = parseArgs({args: argv, options});
  if (values.help) { console.log(USAGE + '\nStandard är 30 fps. --sheet och --closeup använder den valda bildfrekvensens rutnummer. --keep-frames behåller mellanrutorna för felsökning.'); return; }
  if (!values.motion || !values.out) throw Error(USAGE);
  const motion = path.resolve(values.motion), out = path.resolve(values.out), plan = path.resolve(values.plan ?? path.join(ROOT, 'placements/default.json'));
  const name = path.basename(motion, '.json');
  if (!/^[\w-]+$/.test(name) || path.extname(motion) !== '.json') throw Error('--motion ska vara en namngiven .json-fil.');
  const [motionBytes, planBytes] = await Promise.all([readFile(motion), readFile(plan)]);
  const sourceMotion = parseJson(motionBytes);
  const settings = renderSettings(values, sourceMotion);
  parseJson(planBytes);
  await reserveOutput(out);

  const signal = new AbortController();
  const interrupt = () => signal.abort(Error('Renderingen avbröts.'));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const record = path.join(out, 'rutor');
  const ffmpegProgram = process.env.FFMPEG ?? 'ffmpeg', ffprobeProgram = process.env.FFPROBE ?? 'ffprobe';
  const ffmpeg = (args: string[]) => {
    signal.signal.throwIfAborted();
    return run(ffmpegProgram, ['-hide_banner', '-v', 'error', '-nostdin', '-n', '-filter_threads', '4', '-filter_complex_threads', '4', ...args]);
  };
  try {
    const snapshots = {motion: 'rorelse.json', plan: 'kortplan.json'};
    const motionCopy = path.join(out, snapshots.motion), planCopy = path.join(out, snapshots.plan);
    await writeFile(motionCopy, motionBytes, {flag: 'wx'});
    await writeFile(planCopy, planBytes, {flag: 'wx'});
    const input = {motion: {file: snapshots.motion, sha256: await sha256(motionCopy), fps: sourceMotion.fps, frameCount: sourceMotion.frameCount},
      plan: {file: snapshots.plan, sha256: await sha256(planCopy)}};
    const revision = command('git', ['rev-parse', 'HEAD']), sources = await renderedSources();
    const versions = {node: process.version, three: (await readJson(path.join(ROOT, threePath, 'package.json'))).version,
      sheetFont: {name: path.basename(FONT), sha256: await sha256(FONT)},
      ffmpeg: command(ffmpegProgram, ['-version']).split(/\r?\n/, 1)[0], ffprobe: command(ffprobeProgram, ['-version']).split(/\r?\n/, 1)[0]};

    const line = lockLine('3d-banan', `referens ${name}`, 20, new Date());
    signal.signal.throwIfAborted();
    if (!await takeLock(LOCK, line, {sleep: ms => delay(ms, undefined, {signal: signal.signal})})) throw Error('GPU-låset är upptaget.');
    try {
      signal.signal.throwIfAborted();
      // Request 1/fps intervals directly from the scene; the stage interpolates motion between source frames.
      await run(process.execPath, ['dealer3d/tools/shoot.ts', '--out', record, '--motion', name, '--motion-file', motionCopy, '--plan', planCopy,
        '--eyes', settings.eye, '--look', 'plain', '--tags', '0', '--film', String(settings.fps), '0', String(settings.lastTime), '--size', `${WIDTH}x${HEIGHT}`]);
    } finally { if (!releaseLock(LOCK, line)) console.error('GPU-låsets ägare ändrades under körningen.'); }
    signal.signal.throwIfAborted();

    const shot = await readJson(path.join(record, 'ruta.json'));
    verifyCapture(shot, name, settings);
    if (JSON.stringify(sources) !== JSON.stringify(await renderedSources()) || revision !== command('git', ['rev-parse', 'HEAD'])) {
      throw Error('Renderkoden ändrades under inspelningen.');
    }
    if (input.motion.sha256 !== await sha256(motionCopy) || input.plan.sha256 !== await sha256(planCopy)) throw Error('De frysta indatafilerna ändrades.');
    const video = path.join(out, 'referens.mp4');
    await ffmpeg(['-framerate', String(settings.fps), '-threads', '1', '-i', path.join(record, 'ruta-%04d.png'), '-c:v', 'libx264', '-crf', '14',
      '-threads', '4', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
    const media = JSON.parse(command(ffprobeProgram, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,duration', '-of', 'json', video])).streams?.[0];
    verifyVideo(media, settings.frameCount, settings.fps);
    const framesAt = (frames: number[]) => frames.map(frame => path.join(record, frameName(frame)));
    await makeSheet(ffmpeg, framesAt(settings.sheet), settings.sheet, settings.columns, undefined, path.join(out, 'ark.png'));
    await copyFile(path.join(record, frameName(settings.frameCount)), path.join(out, 'slutruta.png'), fsConstants.COPYFILE_EXCL);
    const files = ['referens.mp4', 'ark.png', 'slutruta.png', 'rutor/ruta.json'];
    if (settings.closeup) {
      const {frames, crop} = settings.closeup;
      await makeSheet(ffmpeg, framesAt(frames), frames, frames.length, crop, path.join(out, 'narbild.png'));
      files.push('narbild.png');
    }
    const output = [];
    for (const file of files) output.push({file, bytes: (await stat(path.join(out, file))).size, sha256: await sha256(path.join(out, file))});
    signal.signal.throwIfAborted();
    const intermediateFrames = await finishFrames(record, settings.frameCount, values['keep-frames']);
    const receipt = {revision, sources, versions: {...versions, chrome: shot.chrome, devtools: shot.protocol}, input, settings, camera: shot.page, media, output, intermediateFrames};
    await writeFile(path.join(out, RECEIPT), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    await unlink(path.join(out, INCOMPLETE));
    console.log(`${video} – ${media.nb_frames} rutor, ${settings.fps} fps, ${media.duration} s, SHA-256 ${output[0].sha256}`);
  } catch (error) {
    await writeFile(path.join(out, INCOMPLETE), `Ofullständig rendering. ${String(error)}\n`).catch(() => {});
    throw error;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (import.meta.main) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
