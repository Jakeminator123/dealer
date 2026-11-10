// One first/last Runway clip per job in data/clip-jobs.json.
//   node tools/clip-job.ts check <id>                           freeze inputs, no network
//   node --env-file=.env.local tools/clip-job.ts submit <id>    exactly one POST, never retried
//   node --env-file=.env.local tools/clip-job.ts collect <id>   read status / download
// A timed-out or failed submit keeps its lock: inspect it, never resubmit automatically.
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {validateJobFile, estimateCredits, requestBody, committedCredits, assertBudget, type ClipJob, type ImageRef} from '../src/clip-job.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
sharp.concurrency(1);
const W = 1764, H = 1174, API = 'https://api.dev.runwayml.com', VERSION = '2024-11-06';
const [command, id] = process.argv.slice(2);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const exists = (p: string) => stat(p).then(() => true, () => false);
const jobFile = validateJobFile(JSON.parse(await readFile('data/clip-jobs.json', 'utf8')));
const job = jobFile.jobs.find(j => j.id === id);
if (!['check', 'submit', 'collect'].includes(command) || !job) throw Error('Usage: clip-job.ts check|submit|collect <job id from data/clip-jobs.json>');
const dir = `assets/motions/${job.id}`, receiptPath = `${dir}/generation.json`;
const save = (r: unknown) => writeFile(receiptPath, JSON.stringify(r, null, 2) + '\n');

async function materialize(ref: ImageRef, out: string) {
  let bytes: Buffer, source: Record<string, unknown>;
  if ('frame' in ref) {
    const f = ref.frame;
    if (sha(await readFile(f.video)) !== f.videoSha256) throw Error(`Source video changed: ${f.video}`);
    bytes = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f.video, '-vf', `select=eq(n\\,${f.index})`, '-fps_mode', 'vfr', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'image2pipe', '-c:v', 'png', '-'], {maxBuffer: 64 << 20});
    source = {kind: 'decoded video frame', video: f.video, videoSha256: f.videoSha256, frame: f.index};
  } else {
    bytes = await readFile(ref.file.path);
    if (sha(bytes) !== ref.file.sha256) throw Error(`Input image changed: ${ref.file.path}`);
    source = {kind: 'existing image, byte copy', path: ref.file.path, bytes: bytes.length};
  }
  const meta = await sharp(bytes).metadata();
  if (meta.format !== 'png' || meta.width !== W || meta.height !== H) throw Error(`${out}: expected ${W}x${H} PNG, got ${meta.format} ${meta.width}x${meta.height}.`);
  if (bytes.length * 4 / 3 > 5_000_000) throw Error(`${out}: over the 5 MB data-URI limit.`);
  await writeFile(out, bytes, {flag: 'wx'});
  return {path: out, sha256: sha(bytes), bytes: bytes.length, source, note: ref.note ?? null};
}

if (!await exists(receiptPath)) {
  if (await exists(dir)) throw Error('Partial preparation exists; inspect before proceeding.');
  await mkdir(dir, {recursive: true});
  const first = await materialize(job.first, `${dir}/first.png`), last = await materialize(job.last, `${dir}/last.png`);
  await writeFile(`${dir}/prompt.txt`, job.promptText + '\n', {flag: 'wx'});
  await save({schemaVersion: 1, id: job.id, kind: job.kind, target: job.target, from: job.from, to: job.to, purpose: job.purpose,
    createdAt: new Date().toISOString(), status: 'PREPARED', provider: 'Runway developer API', endpoint: '/v1/image_to_video', apiVersion: VERSION,
    model: job.model, duration: job.duration, ratio: job.ratio, audio: job.audio, estimatedCredits: estimateCredits(job),
    promptText: job.promptText, promptSha256: sha(job.promptText), first: {...first, position: 'first'}, last: {...last, position: 'last'},
    job, intermediateImageSubmitted: false, referenceVideoSubmitted: false, seedSubmitted: false, postProcessing: 'none', reviewDecision: 'PENDING'});
}
const r = JSON.parse(await readFile(receiptPath, 'utf8'));
if (JSON.stringify(r.job) !== JSON.stringify(job)) throw Error('The job definition changed after preparation; use a new job id instead of editing a frozen one.');
for (const f of [r.first, r.last]) if (sha(await readFile(f.path)) !== f.sha256) throw Error(`Prepared input changed: ${f.path}`);

if (command === 'check') {
  console.log(JSON.stringify({id: r.id, status: r.status, model: r.model, duration: r.duration, ratio: r.ratio, estimatedCredits: r.estimatedCredits, first: r.first.path, last: r.last.path, promptCharacters: r.promptText.length, taskId: r.taskId ?? null}));
  process.exit(0);
}
const key = process.env.RUNWAY_API_KEY;
if (!key) throw Error('Load the credential: node --env-file=.env.local tools/clip-job.ts ...');
const headers = {Authorization: `Bearer ${key}`, 'X-Runway-Version': VERSION, 'Content-Type': 'application/json'};

if (command === 'submit') {
  if (r.status !== 'PREPARED' || await exists(`${dir}/request.lock`)) throw Error('Existing or uncertain task: never resubmit automatically.');
  const others: {status: string; estimatedCredits: number}[] = [];
  for (const other of jobFile.jobs) if (other.id !== job.id && await exists(`assets/motions/${other.id}/generation.json`)) others.push(JSON.parse(await readFile(`assets/motions/${other.id}/generation.json`, 'utf8')));
  assertBudget(jobFile.budget.maximumCredits, committedCredits(others), r.estimatedCredits);
  const org = await fetch(`${API}/v1/organization`, {headers, signal: AbortSignal.timeout(30000)});
  if (!org.ok) throw Error(`Account preflight HTTP ${org.status}`);
  const balance = (await org.json()).creditBalance;
  if (balance < r.estimatedCredits) throw Error('Insufficient developer credits.');
  const uri = async (file: string) => `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
  const body = requestBody(job as ClipJob, await uri(r.first.path), await uri(r.last.path));
  await writeFile(`${dir}/request.lock`, new Date().toISOString(), {flag: 'wx'});
  r.status = 'SUBMITTING'; r.requestedAt = new Date().toISOString(); r.creditBalanceBefore = balance; await save(r);
  const response = await fetch(`${API}/v1/image_to_video`, {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000)});
  if (!response.ok) { r.submitHttpStatus = response.status; r.submitError = (await response.text()).slice(0, 600); await save(r); throw Error(`Runway HTTP ${response.status}; lock kept, inspect before any new order.`); }
  const task = await response.json();
  if (typeof task.id !== 'string' || !/^[a-f0-9-]{36}$/.test(task.id)) throw Error('No reliable task identity returned.');
  r.status = 'PENDING'; r.taskId = task.id; await save(r);
  console.log(JSON.stringify({id: r.id, taskId: r.taskId, status: r.status, estimatedCredits: r.estimatedCredits}));
  process.exit(0);
}

if (!/^[a-f0-9-]{36}$/.test(r.taskId ?? '')) throw Error('Missing task identity.');
const response = await fetch(`${API}/v1/tasks/${r.taskId}`, {headers, signal: AbortSignal.timeout(30000)});
if (!response.ok) throw Error(`Runway status HTTP ${response.status}`);
const task = await response.json();
r.status = task.status; r.lastCheckedAt = new Date().toISOString(); r.progress = task.progress ?? null;
if (task.status === 'SUCCEEDED') {
  const file = `${dir}/source.mp4`;
  if (!await exists(file)) {
    if (typeof task.output?.[0] !== 'string' || !task.output[0].startsWith('https://')) throw Error('Missing HTTPS video output.');
    const download = await fetch(task.output[0]);
    if (!download.ok) throw Error(`Output HTTP ${download.status}`);
    await writeFile(file, Buffer.from(await download.arrayBuffer()), {flag: 'wx'});
  }
  const bytes = await readFile(file), digest = sha(bytes);
  if (r.output?.sha256 && r.output.sha256 !== digest) throw Error('Existing output does not match recorded hash.');
  const probe = JSON.parse(execFileSync(process.env.FFPROBE ?? 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', file]).toString()).streams[0];
  const [n, d] = String(probe.r_frame_rate).split('/').map(Number);
  r.completedAt ??= r.lastCheckedAt; r.actualCredits = task.cost ?? null;
  r.output = {path: file, sha256: digest, bytes: bytes.length, width: probe.width, height: probe.height, fps: n / (d || 1), frames: Number(probe.nb_read_frames)};
} else if (task.status === 'FAILED' || task.status === 'CANCELLED') { r.failure = task.failure ?? null; r.failureCode = task.failureCode ?? null; process.exitCode = 1; }
await save(r);
console.log(JSON.stringify({id: r.id, taskId: r.taskId, status: r.status, progress: r.progress, output: r.output ?? null}));
