/** Local-only export. Explicit start: node tools/render.ts --render --take=01
 * Four disjoint timeline ranges, immutable renderer code, one sharp/codec thread per worker.
 * No UI/report publication. A take directory is never reused or overwritten.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import type { PamelaCardContactV4Frame } from '../src/pamela-card-contact-v6.ts';
import { pinInputs, readPinnedInput } from './render-inputs.ts';

const W = 1762, H = 1174, FPS = 30, TOTAL = 926, WORKERS = 4;
const root = process.cwd();
const outputRoot = 'output/v6';
const planPath = 'assets/timeline.json';
const trackPath = 'assets/tracking/card-tracks.json';
const trackRoot = 'assets/tracking';
const scriptPath = 'tools/render.ts';
const rendererPath = 'src/pamela-card-contact-v6.ts';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const ffprobe = process.env.FFPROBE ?? 'ffprobe';
const execute = promisify(execFile);
sharp.concurrency(1);
type Clip = PamelaCardContactV4Frame['clip'];
type Entry = { clip: Clip; sourceFrame: number; dealOrdinal: number; priorCards: number; outputFrame: number; sourceSha256: string };
type Source = { path: string; dir: string; sha256: string; frames: number };
type Plan = { fps: number; frameCount: number; timeline: Entry[]; sources: Record<Clip, Source>; segments: Array<{ clip: Clip; startFrameInclusive: number; endFrameExclusive: number; dealOrdinal: number; priorCards: number }> };
type HashRecord = { path: string; sha256: string };
type Snapshot = HashRecord & { snapshot: string };
type Job = { run: string; part: number; start: number; end: number; plan: Plan; snapshot: Snapshot[]; frameInputs: HashRecord[]; checkFrames: number[] };
type Output = HashRecord & { width: number; height: number; fps: number; frameCount: number; duration: number };
type FrameRecord = { outputFrame: number; clip: Clip; sourceFrame: number; inputs: HashRecord[] };
type PartResult = { part: number; start: number; end: number; outputs: { native: Output; portrait: Output }; frames: FrameRecord[]; checks: HashRecord[] };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const read = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;
function local(file: string) {
  const absolute = path.resolve(root, file);
  if (path.isAbsolute(file) || !absolute.startsWith(root + path.sep)) throw Error(`Not a repository-relative path: ${file}`);
  return absolute;
}
function runFile(file: string) {
  if (!/^(assets|output)\//.test(file.replaceAll('\\', '/'))) throw Error(`Not a run artifact: ${file}`);
  return local(file);
}
async function hashFile(file: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(local(file))) digest.update(chunk);
  return digest.digest('hex');
}
async function verify(records: HashRecord[]) {
  for (const item of records) if (await hashFile(item.path) !== item.sha256) throw Error(`Input changed: ${item.path}`);
}
function validatePlan(plan: Plan) {
  if (plan.fps !== FPS || plan.frameCount !== TOTAL || plan.timeline.length !== TOTAL) throw Error('Expected the unchanged 926-frame, 30 fps plan');
  let index = 0;
  for (const segment of plan.segments) {
    for (let frame = segment.startFrameInclusive; frame < segment.endFrameExclusive; frame++, index++) {
      const entry = plan.timeline[index], source = plan.sources[segment.clip];
      if (!source || !entry || entry.outputFrame !== index || entry.clip !== segment.clip || entry.sourceFrame !== frame || entry.dealOrdinal !== segment.dealOrdinal || entry.priorCards !== segment.priorCards || entry.sourceSha256 !== source.sha256 || frame < 0 || frame >= source.frames) throw Error(`Timeline/segment/source disagreement at ${index}`);
      runFile(source.path); runFile(source.dir);
    }
  }
  if (index !== TOTAL || plan.timeline[TOTAL - 1].clip !== 'idle' || plan.timeline[TOTAL - 1].priorCards !== 2) throw Error('The sequence must end in idle with two cards retained');
}
async function makeSnapshot(run: string): Promise<Snapshot[]> {
  const pending = [rendererPath, scriptPath, 'package.json', planPath, trackPath,
    'assets/tracking/card-mesh.json',
    'assets/tracking/nail-guards.json',
    'assets/tracking/hand-occlusion.json',
    'assets/scene/room.png',
    'assets/scene/table.png',
    'assets/frames/deal/frame-127.png'];
  const records: Snapshot[] = [], seen = new Set<string>();
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index];
    if (seen.has(file)) continue;
    seen.add(file);
    const bytes = await readFile(local(file));
    const snapshot = `${run}/snapshot/${file}`;
    await mkdir(path.dirname(local(snapshot)), { recursive: true });
    await writeFile(local(snapshot), bytes, { flag: 'wx' });
    records.push({ path: file, snapshot, sha256: hash(bytes) });
    if (file.endsWith('.ts')) {
      for (const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.ts)['"]/g)) {
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
        local(dependency); pending.push(dependency);
      }
    }
  }
  await verify(records);
  return records;
}
function encoder(file: string, width: number, height: number) {
  const child = spawn(ffmpeg, ['-v', 'error', '-nostdin', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${width}x${height}`, '-framerate', String(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-crf', '15', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-threads', '1', '-video_track_timescale', '90000', '-movflags', '+faststart', '-n', local(file)], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '', failed: Error | null = null;
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
  child.stdin.on('error', error => { failed = error; });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', error => { failed = error; reject(error); });
    child.once('close', code => code === 0 ? resolve() : reject(failed ?? Error(`Encoder exited ${code}: ${stderr}`)));
  });
  void done.catch(() => {});
  return {
    pid: child.pid,
    async write(bytes: Buffer) {
      if (failed || child.exitCode !== null) throw failed ?? Error('Encoder stopped');
      // A callback per frame bounds queued RGB memory and rejects broken pipes.
      await new Promise<void>((resolve, reject) => child.stdin.write(bytes, error => error ? reject(error) : resolve()));
    },
    async finish() { child.stdin.end(); await done; },
    abort() { child.stdin.destroy(); if (child.exitCode === null) child.kill(); },
    settled: () => done.catch(() => {}),
  };
}
async function info(file: string, frames: number, width: number, height: number): Promise<Output> {
  const { stdout } = await execute(ffprobe, ['-v', 'error', '-threads', '1', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', local(file)], { windowsHide: true, maxBuffer: 16000 });
  const result = JSON.parse(stdout), stream = result.streams?.[0];
  if (!stream || stream.width !== width || stream.height !== height || stream.avg_frame_rate !== '30/1' || Number(stream.nb_read_frames) !== frames || Math.abs(Number(result.format.duration) - frames / FPS) > 0.002) throw Error(`Output format/timing mismatch: ${file}`);
  return { path: file, sha256: await hashFile(file), width, height, fps: FPS, frameCount: frames, duration: Number(result.format.duration) };
}
async function frameTimes(file: string) {
  const { stdout } = await execute(ffprobe, ['-v', 'error', '-threads', '1', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', local(file)], { windowsHide: true, maxBuffer: 1024 * 1024 });
  const frames = JSON.parse(stdout).frames as { best_effort_timestamp_time: string }[];
  if (frames.length !== TOTAL || frames.some((frame, i) => Math.abs(Number(frame.best_effort_timestamp_time) - i / FPS) > 0.0001)) throw Error(`Non-continuous presentation timestamps: ${file}`);
  return { frames: frames.length, zeroBasedPresentationTimesVerified: true, toleranceSeconds: 0.0001 };
}
async function worker(jobPath: string) {
  const job = await read<Job>(runFile(jobPath));
  validatePlan(job.plan);
  if (!Number.isInteger(job.part) || job.part < 0 || job.part >= WORKERS || job.start !== Math.floor(TOTAL * job.part / WORKERS) || job.end !== Math.floor(TOTAL * (job.part + 1) / WORKERS)) throw Error('Invalid worker range');
  await verify(job.snapshot.map(item => ({ path: item.snapshot, sha256: item.sha256 })));
  await verify(job.snapshot.filter(item => !item.path.endsWith('.ts')));
  const renderer = await import(pathToFileURL(local(`${job.run}/snapshot/${rendererPath}`)).href) as typeof import('../src/pamela-card-contact-v6.ts');
  const render = await renderer.createPamelaCardContactV6Renderer(undefined, local(`${job.run}/snapshot`));
  const expectedInputs = new Map(job.frameInputs.map(input => [input.path, input.sha256]));
  const tracks = await read<{ frames: { frameSha256: string; moving: { contourNative: NonNullable<PamelaCardContactV4Frame['contour']>; quadNative: PamelaCardContactV4Frame['quad'] } }[] }>(`${job.run}/snapshot/${trackPath}`);
  const prefix = `${job.run}/parts/part-${job.part}`;
  const files = { native: `${prefix}-native.mp4`, portrait: `${prefix}-portrait.mp4` };
  const encoders = [encoder(files.native, W, H), encoder(files.portrait, 1080, 1920)];
  let cancelled = false;
  const cancel = () => { cancelled = true; encoders.forEach(item => item.abort()); };
  const message = (value: unknown) => { if ((value as { stop?: boolean })?.stop) cancel(); };
  process.on('message', message); process.on('disconnect', cancel); process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  const records: FrameRecord[] = [], checks: HashRecord[] = [];
  try {
    await save(`${prefix}-processes.json`, { node: { pid: process.pid, parent: process.ppid, executable: process.execPath, script: fileURLToPath(import.meta.url), cwd: root, startedAt: new Date().toISOString() }, ffmpeg: encoders.map(item => ({ pid: item.pid, executable: ffmpeg, parent: process.pid, threads: 1 })) });
    for (let index = job.start; index < job.end; index++) {
      if (cancelled) throw Error('Worker cancelled');
      const entry = job.plan.timeline[index], source = job.plan.sources[entry.clip];
      const name = `frame-${String(entry.sourceFrame + 1).padStart(3, '0')}.png`;
      const inputs: HashRecord[] = [];
      const image = async (file: string, mask = false) => {
        const bytes = await readPinnedInput(runFile(file), expectedInputs.get(file)); inputs.push({ path: file, sha256: hash(bytes) });
        const decoded = await (mask ? sharp(bytes).greyscale() : sharp(bytes).removeAlpha()).raw().toBuffer({ resolveWithObject: true });
        if (decoded.info.width !== W || decoded.info.height !== H || decoded.info.channels !== (mask ? 1 : 3)) throw Error(`Unexpected source raster: ${file}`);
        return decoded.data;
      };
      const raw = await image(`${source.dir}/${name}`);
      const input: PamelaCardContactV4Frame = { raw, clip: entry.clip, sourceFrame: entry.sourceFrame, dealOrdinal: entry.dealOrdinal, priorCards: entry.priorCards };
      if (entry.clip === 'deal') {
        const track = tracks.frames[entry.sourceFrame];
        if (!track || inputs[0].sha256 !== track.frameSha256) throw Error(`Deal frame hash mismatch: ${entry.sourceFrame}`);
        input.mask = await image(`${trackRoot}/moving-mask/${name}`, true);
        input.shoeMask = await image(`${trackRoot}/shoe-mask/${name}`, true);
        input.contour = track.moving.contourNative; input.quad = track.moving.quadNative;
      }
      const result = await render(input);
      if (result.native.length !== W * H * 3 || result.portrait.length !== 1080 * 1920 * 3) throw Error('Renderer output dimensions changed');
      await Promise.all([encoders[0].write(result.native), encoders[1].write(result.portrait)]);
      records.push({ outputFrame: index, clip: entry.clip, sourceFrame: entry.sourceFrame, inputs });
      if (job.checkFrames.includes(index)) {
        const file = `${job.run}/qa/native-${String(index).padStart(4, '0')}.png`;
        await sharp(result.native, { raw: { width: W, height: H, channels: 3 } }).png().toFile(local(file));
        checks.push({ path: file, sha256: await hashFile(file) });
      }
      if ((index - job.start) % 30 === 0) console.log(`part ${job.part}: frame ${index} / ${job.end - 1}`);
    }
    await Promise.all(encoders.map(item => item.finish()));
    const outputs = { native: await info(files.native, job.end - job.start, W, H), portrait: await info(files.portrait, job.end - job.start, 1080, 1920) };
    await save(`${prefix}.json`, { part: job.part, start: job.start, end: job.end, outputs, frames: records, checks } satisfies PartResult);
  } finally {
    encoders.forEach(item => item.abort()); await Promise.all(encoders.map(item => item.settled()));
    process.off('message', message); process.off('disconnect', cancel); process.off('SIGTERM', cancel); process.off('SIGINT', cancel);
    if (process.connected) process.disconnect();
  }
}
async function main() {
  if (!process.argv.includes('--render')) { console.log('No export started. Use --render --take=01 (new two-digit take). Four workers; no public report is changed.'); return; }
  if (process.versions.node !== '24.21.0') throw Error('Use project-pinned Node 24.21.0');
  const take = process.argv.find(argument => argument.startsWith('--take='))?.slice(7);
  if (!take || !/^\d{2}$/.test(take)) throw Error('An explicit new --take=NN is required');
  const plan = await read<Plan>(planPath); validatePlan(plan);
  const sources = Object.values(plan.sources).map(source => ({ path: source.path, sha256: source.sha256 }));
  await verify(sources);
  const run = `${outputRoot}/take-${take}`;
  await mkdir(local(outputRoot), { recursive: true });
  await mkdir(local(run)); // EEXIST is intentional: never overwrite an earlier attempt.
  const startedAt = new Date().toISOString();
  try {
    for (const folder of ['parts', 'qa', 'render']) await mkdir(local(`${run}/${folder}`));
    const snapshot = await makeSnapshot(run);
    const frozenPlan = await read<Plan>(`${run}/snapshot/${planPath}`); validatePlan(frozenPlan);
    if (JSON.stringify(frozenPlan) !== JSON.stringify(plan)) throw Error('Plan changed during setup');
    const framePaths = frozenPlan.timeline.flatMap(entry => {
      const name = `frame-${String(entry.sourceFrame + 1).padStart(3, '0')}.png`;
      return [`${frozenPlan.sources[entry.clip].dir}/${name}`, ...(entry.clip === 'deal' ? [`${trackRoot}/moving-mask/${name}`, `${trackRoot}/shoe-mask/${name}`] : [])];
    });
    const frameInputs = await pinInputs(framePaths, runFile);
    let boundary = 0;
    const joins = plan.segments.slice(0, -1).map(segment => {
      boundary += segment.endFrameExclusive - segment.startFrameInclusive;
      return { outputFrame: boundary, seconds: boundary / FPS, from: plan.timeline[boundary - 1], to: plan.timeline[boundary] };
    });
    const checkFrames = [...new Set([0, TOTAL - 1, ...joins.flatMap(join => [join.outputFrame - 1, join.outputFrame]), ...Array.from({ length: WORKERS - 1 }, (_, i) => Math.floor(TOTAL * (i + 1) / WORKERS)).flatMap(frame => [frame - 1, frame])])].sort((a, b) => a - b);
    await save(`${run}/manifest.json`, { status: 'rendering', startedAt, node: process.version, sharp: sharp.versions, workers: WORKERS, sharpThreads: 1, ffmpegThreads: 1, snapshot, frameInputs, sources, checkFrames, joins });
    const children: ChildProcess[] = [];
    const cancel = () => { for (const child of children) if (child.connected && child.exitCode === null) child.send({ stop: true }, () => {}); };
    process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
    try {
      const jobs: Promise<void>[] = [];
      for (let part = 0; part < WORKERS; part++) {
        const job: Job = { run, part, start: Math.floor(TOTAL * part / WORKERS), end: Math.floor(TOTAL * (part + 1) / WORKERS), plan: frozenPlan, snapshot, frameInputs, checkFrames };
        const jobPath = `${run}/parts/job-${part}.json`; await save(jobPath, job);
        const child = spawn(process.execPath, [local(`${run}/snapshot/${scriptPath}`), '--worker', jobPath], { cwd: root, windowsHide: true, env: { ...process.env, UV_THREADPOOL_SIZE: '1', VIPS_CONCURRENCY: '1', OMP_NUM_THREADS: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        children.push(child);
        let stderr = '';
        child.stdout?.on('data', chunk => process.stdout.write(chunk));
        child.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
        const done = new Promise<void>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', code => code === 0 ? resolve() : reject(Error(`Part ${part} exited ${code}: ${stderr}`)));
        });
        jobs.push(done); void done.catch(cancel);
      }
      const results = await Promise.allSettled(jobs);
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } finally { cancel(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
    const parts = await Promise.all(Array.from({ length: WORKERS }, (_, part) => read<PartResult>(`${run}/parts/part-${part}.json`)));
    const frameRecords = parts.flatMap(part => part.frames);
    if (frameRecords.length !== TOTAL || frameRecords.some((frame, index) => frame.outputFrame !== index)) throw Error('Missing, duplicated or reordered output frames');
    const inputs = new Map<string, string>();
    for (const frame of frameRecords) for (const input of frame.inputs) {
      if (inputs.has(input.path) && inputs.get(input.path) !== input.sha256) throw Error(`Source changed between worker reads: ${input.path}`);
      inputs.set(input.path, input.sha256);
    }
    await verify([...sources, ...snapshot, ...frameInputs, ...Array.from(inputs, ([file, sha256]) => ({ path: file, sha256 }))]);
    const outputs: Partial<Record<'native' | 'portrait', Output>> = {};
    const timestamps: Record<string, unknown> = {};
    for (const format of ['native', 'portrait'] as const) {
      const list = `${run}/parts/concat-${format}.txt`;
      await writeFile(local(list), parts.map(part => `file 'part-${part.part}-${format}.mp4'`).join('\n') + '\n', { flag: 'wx' });
      const file = `${run}/render/idle-deal-idle-${format}.mp4`;
      await execute(ffmpeg, ['-v', 'error', '-nostdin', '-threads', '1', '-f', 'concat', '-safe', '1', '-i', local(list), '-map', '0:v:0', '-an', '-c', 'copy', '-video_track_timescale', '90000', '-movflags', '+faststart', '-n', local(file)], { windowsHide: true, maxBuffer: 16000 });
      outputs[format] = await info(file, TOTAL, format === 'native' ? W : 1080, format === 'native' ? H : 1920);
      timestamps[format] = await frameTimes(file);
    }
    const checks = parts.flatMap(part => part.checks);
    if (checks.length !== checkFrames.length) throw Error('A required native check frame is missing');
    // Decode once for all sparse check frames, rather than repeatedly decoding the whole film.
    const selection = checkFrames.map(frame => `eq(n\\,${frame})`).join('+');
    await execute(ffmpeg, ['-v', 'error', '-nostdin', '-threads', '1', '-filter_threads', '1', '-i', local(outputs.native!.path), '-vf', `select=${selection}`, '-fps_mode', 'vfr', '-start_number', '0', '-threads', '1', '-n', local(`${run}/qa/encoded-selected-%04d.png`)], { windowsHide: true, maxBuffer: 16000 });
    for (let index = 0; index < checkFrames.length; index++) {
      const frame = checkFrames[index];
      const file = `${run}/qa/encoded-native-${String(frame).padStart(4, '0')}.png`;
      await rename(local(`${run}/qa/encoded-selected-${String(index).padStart(4, '0')}.png`), local(file));
      checks.push({ path: file, sha256: await hashFile(file) });
    }
    await save(`${run}/sequence-evidence.json`, { status: 'local-candidate-awaiting-visual-review', productionAccepted: false, startedAt, completedAt: new Date().toISOString(), sources, snapshot, frameInputs, outputs, timestamps, frameRecords, checks, plan: frozenPlan, joins, processing: { workers: WORKERS, fps: FPS, frames: TOTAL, sharpThreads: 1, ffmpegThreads: 1, retime: false, crossfade: false, faceInterpolation: false, newPaidJobs: 0, retainsTwoCardsAtEnd: true } });
    console.log(`Verified ${TOTAL} frames in both formats: ${run}/sequence-evidence.json`);
  } catch (error) {
    await save(`${run}/failure.json`, { status: 'failed-kept-for-inspection', startedAt, failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
try {
  const workerIndex = process.argv.indexOf('--worker');
  if (workerIndex >= 0) await worker(process.argv[workerIndex + 1]);
  else await main();
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
