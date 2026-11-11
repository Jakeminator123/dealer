// One aleph2 video-to-video edit per entry in "edits" of data/clip-jobs.json: an existing clip plus one correction.
//   node tools/clip-edit.ts check <id>                           freeze inputs, no network
//   node --env-file=.env.local tools/clip-edit.ts submit <id>    after check: upload if needed, exactly one POST, never retried
//   node --env-file=.env.local tools/clip-edit.ts collect <id>   read status / download
// A timed-out or failed submit keeps its lock: inspect it, never resubmit automatically.
// A failed upload is recorded and the run stops before any lock or order; only a new, deliberate submit starts a new upload.
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {validateJobFile} from '../src/clip-job.ts';
import {validateEdits, sourceFacts, assertSourceAccepted, assertEditFitsSource, withinPlain1080p, billedSeconds, estimateEditCredits, sourceTransport, dataUriLength,
  uploadRequestBody, validateUploadTicket, editRequestBody, editWindow, assertSubmittable, ledgerIds, assertSharedBudget,
  EDIT_ENDPOINT, EDIT_CREDITS_PER_SECOND, EDIT_MINIMUM_CREDITS, DATA_URI_LIMIT, type EditKeyframe, type SourceFacts} from '../src/clip-edit.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
sharp.concurrency(1);
const API = 'https://api.dev.runwayml.com', VERSION = '2024-11-06', UPLOAD_NAME = 'source.mp4';
const [command, id] = process.argv.slice(2);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const exists = (p: string) => stat(p).then(() => true, () => false);
const now = () => new Date().toISOString();
const message = (error: unknown) => String((error as Error)?.message ?? error).slice(0, 300);
const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8'));
const jobFile = validateJobFile(file), edits = validateEdits(file);
const job = edits.find(e => e.id === id);
if (!['check', 'submit', 'collect'].includes(command) || !job) throw Error('Usage: clip-edit.ts check|submit|collect <edit id from "edits" in data/clip-jobs.json>');
const dir = `assets/motions/${job.id}`, receiptPath = `${dir}/generation.json`, lockPath = `${dir}/request.lock`;
const sourcePath = `assets/motions/${job.source.clip}/source.mp4`, sourceReceiptPath = `assets/motions/${job.source.clip}/generation.json`;
const save = (r: unknown) => writeFile(receiptPath, JSON.stringify(r, null, 2) + '\n');
const probe = (video: string) => JSON.parse(execFileSync(process.env.FFPROBE ?? 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
  'stream=codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', video]).toString());

// The source clip is referenced, not copied: its bytes must still be the ones the job names.
async function readSource(): Promise<Buffer> {
  const bytes = await readFile(sourcePath);
  if (sha(bytes) !== job!.source.sha256) throw Error(`Source clip changed or wrong hash in the job: ${sourcePath}`);
  return bytes;
}

async function guidanceImage(k: EditKeyframe, facts: SourceFacts, label: string) {
  let bytes: Buffer, source: Record<string, unknown>;
  if ('frame' in k) {
    const f = k.frame;
    if (sha(await readFile(f.video)) !== f.videoSha256) throw Error(`${label}: source video changed: ${f.video}`);
    bytes = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f.video, '-vf', `select=eq(n\\,${f.index})`, '-fps_mode', 'vfr', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'image2pipe', '-c:v', 'png', '-'], {maxBuffer: 64 << 20});
    if (!bytes.length) throw Error(`${label}: frame ${f.index} does not exist in ${f.video}.`);
    source = {kind: 'decoded video frame', video: f.video, videoSha256: f.videoSha256, frame: f.index,
      ...(f.videoSha256 === job!.source.sha256 ? {ownTimeInSourceClipSeconds: Number((f.index / facts.fps).toFixed(6))} : {})};
  } else {
    bytes = await readFile(k.file.path);
    if (sha(bytes) !== k.file.sha256) throw Error(`${label}: input image changed: ${k.file.path}`);
    source = {kind: 'existing image, byte copy', path: k.file.path, bytes: bytes.length};
  }
  const meta = await sharp(bytes).metadata();
  if (meta.format !== 'png' || meta.width !== facts.width || meta.height !== facts.height) throw Error(`${label}: expected a ${facts.width}x${facts.height} PNG like the source clip, got ${meta.format} ${meta.width}x${meta.height}.`);
  if (dataUriLength('image/png', bytes.length) > DATA_URI_LIMIT) throw Error(`${label}: over the 5 MB data-URI limit.`);
  return {bytes, source};
}

if (!await exists(receiptPath)) {
  // Only check prepares: an order is never placed on inputs nobody has looked at.
  if (command !== 'check') throw Error(`Nothing is prepared for ${job.id}; run check first.`);
  if (await exists(dir)) throw Error('Partial preparation exists; inspect before proceeding.');
  const bytes = await readSource();
  if (await exists(sourceReceiptPath)) {
    const recorded = JSON.parse(await readFile(sourceReceiptPath, 'utf8')).output?.sha256;
    if (recorded && recorded !== job.source.sha256) throw Error(`The receipt of ${job.source.clip} records another output hash than the job names.`);
  }
  const facts = sourceFacts(probe(sourcePath), bytes.length);
  assertSourceAccepted(facts); assertEditFitsSource(job, facts);
  const transport = sourceTransport(facts.bytes), images = [];
  for (const [i, k] of (job.keyframes ?? []).entries()) images.push(await guidanceImage(k, facts, `${job.id} keyframe ${i + 1}`));
  await mkdir(dir, {recursive: true});
  const keyframes = [];
  for (const [i, k] of (job.keyframes ?? []).entries()) {
    const out = `${dir}/keyframe-${String(i + 1).padStart(2, '0')}.png`;
    await writeFile(out, images[i].bytes, {flag: 'wx'});
    keyframes.push({path: out, sha256: sha(images[i].bytes), bytes: images[i].bytes.length, source: images[i].source,
      ...('seconds' in k ? {seconds: k.seconds} : {at: k.at}), range: k.range ?? null, note: k.note ?? null});
  }
  await writeFile(`${dir}/prompt.txt`, job.promptText + '\n', {flag: 'wx'});
  const preview = editRequestBody(job, transport === 'UPLOAD' ? 'runway://assigned-at-submit' : 'data:video/mp4;base64,<source clip>', keyframes.map(k => `data:image/png;base64,<${k.path}>`));
  await save({schemaVersion: 1, id: job.id, kind: 'EDIT', purpose: job.purpose, createdAt: now(), status: 'PREPARED',
    provider: 'Runway developer API', endpoint: EDIT_ENDPOINT, apiVersion: VERSION, model: job.model, estimatedCredits: estimateEditCredits(facts),
    pricing: {creditsPerSecond: EDIT_CREDITS_PER_SECOND, minimumCredits: EDIT_MINIMUM_CREDITS, billedSeconds: billedSeconds(facts), basis: 'whole seconds of the source clip, rounded up; a narrower edit window is not assumed to cost less'},
    promptText: job.promptText, promptSha256: sha(job.promptText),
    source: {clip: job.source.clip, path: sourcePath, sha256: job.source.sha256, ...facts, transport,
      resolutionNote: withinPlain1080p(facts) ? null : 'Larger than plain 1080p on one side. The documentation says the input resolution is preserved "up to 1080p" without defining it for this shape: the output may come back scaled.'},
    keyframes, editWindow: editWindow(job), seed: job.seed ?? null, requestPreview: preview, job,
    sourceVideoSubmitted: false, seedSubmitted: false, postProcessing: 'none', reviewDecision: 'PENDING'});
}
const r = JSON.parse(await readFile(receiptPath, 'utf8'));

// A result that was paid for is always collectable; the inputs only have to be intact before something is ordered.
if (command !== 'collect') {
  if (JSON.stringify(r.job) !== JSON.stringify(job)) throw Error('The edit definition changed after preparation; use a new edit id instead of editing a frozen one.');
  await readSource();
  for (const k of r.keyframes) if (sha(await readFile(k.path)) !== k.sha256) throw Error(`Prepared input changed: ${k.path}`);
}

if (command === 'check') {
  console.log(JSON.stringify({id: r.id, status: r.status, model: r.model, source: r.source.path, seconds: r.source.seconds, fps: r.source.fps, frames: r.source.frames,
    size: `${r.source.width}x${r.source.height}`, megabytes: Number((r.source.bytes / 1e6).toFixed(2)), transport: r.source.transport, estimatedCredits: r.estimatedCredits,
    promptCharacters: r.promptText.length, keyframes: r.keyframes.map((k: {path: string; seconds?: number; at?: number}) => ({path: k.path, ...(k.seconds !== undefined ? {seconds: k.seconds} : {at: k.at})})),
    editWindow: r.editWindow, seed: r.seed, taskId: r.taskId ?? null}));
  process.exit(0);
}
const key = process.env.RUNWAY_API_KEY;
if (!key) throw Error('Load the credential: node --env-file=.env.local tools/clip-edit.ts ...');
const headers = {Authorization: `Bearer ${key}`, 'X-Runway-Version': VERSION, 'Content-Type': 'application/json'};

// Ephemeral upload: one slot from /v1/uploads, then the file as multipart form data to the storage URL it names.
// The credential goes to Runway only, never to the storage URL. A failure here is not retried: it is recorded and the run stops.
async function upload(bytes: Buffer): Promise<string> {
  const attempt: Record<string, unknown> = {startedAt: now(), status: 'STARTED', filename: UPLOAD_NAME, bytes: bytes.length, sha256: sha(bytes)};
  (r.uploads ??= []).push(attempt); await save(r);
  try {
    const slot = await fetch(`${API}/v1/uploads`, {method: 'POST', headers, body: JSON.stringify(uploadRequestBody(UPLOAD_NAME)), signal: AbortSignal.timeout(30000)});
    if (!slot.ok) throw Error(`POST /v1/uploads HTTP ${slot.status}`);
    const ticket = validateUploadTicket(await slot.json());
    const form = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
    form.append('file', new Blob([bytes], {type: 'video/mp4'}), UPLOAD_NAME);
    const stored = await fetch(ticket.uploadUrl, {method: 'POST', body: form, signal: AbortSignal.timeout(300000)});
    if (!stored.ok) throw Error(`storage HTTP ${stored.status}`);
    Object.assign(attempt, {status: 'UPLOADED', completedAt: now(), storageHttpStatus: stored.status, runwayUriSha256: sha(ticket.runwayUri),
      expiresBefore: new Date(Date.parse(attempt.startedAt as string) + 24 * 3600 * 1000).toISOString()});
    await save(r);
    return ticket.runwayUri;
  } catch (error) {
    Object.assign(attempt, {status: 'FAILED', failedAt: now(), error: message(error)});
    await save(r);
    throw Error(`Upload failed (${attempt.error}); recorded in the receipt. Nothing was ordered and no lock was written. Do not retry this upload: a later submit starts a new one.`);
  }
}

if (command === 'submit') {
  assertSubmittable(r, await exists(lockPath));
  const others = [];
  for (const other of ledgerIds(jobFile.jobs, edits)) if (other !== job.id && await exists(`assets/motions/${other}/generation.json`)) others.push(JSON.parse(await readFile(`assets/motions/${other}/generation.json`, 'utf8')));
  const committed = assertSharedBudget(jobFile.budget.maximumCredits, others, r.estimatedCredits);
  const org = await fetch(`${API}/v1/organization`, {headers, signal: AbortSignal.timeout(30000)});
  if (!org.ok) throw Error(`Account preflight HTTP ${org.status}`);
  const balance = (await org.json()).creditBalance;
  if (!Number.isFinite(balance) || balance < r.estimatedCredits) throw Error('Insufficient developer credits.');
  const bytes = await readSource();
  const videoUri = r.source.transport === 'UPLOAD' ? await upload(bytes) : `data:video/mp4;base64,${bytes.toString('base64')}`;
  const keyframeUris: string[] = [];
  for (const k of r.keyframes) keyframeUris.push(`data:image/png;base64,${(await readFile(k.path)).toString('base64')}`);
  const body = editRequestBody(job, videoUri, keyframeUris);
  const shown = (uri: string) => uri.startsWith('runway://') ? `runway://<sha256 ${sha(uri)}>` : `${uri.slice(0, uri.indexOf(',') + 1)}<${uri.length} characters>`;
  await writeFile(lockPath, now(), {flag: 'wx'});
  r.status = 'SUBMITTING'; r.requestedAt = now(); r.creditBalanceBefore = balance; r.committedCreditsBefore = committed;
  r.request = {...body, videoUri: shown(body.videoUri), ...(body.keyframes ? {keyframes: body.keyframes.map(k => ({...k, uri: shown(k.uri)}))} : {})};
  r.sourceVideoSubmitted = true; r.seedSubmitted = body.seed !== undefined; await save(r);
  let answer: string, status: number;
  try {
    const response = await fetch(`${API}${EDIT_ENDPOINT}`, {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000)});
    status = response.status; answer = await response.text();
  } catch (error) {
    r.submitError = `no readable answer: ${message(error)}`; await save(r);
    throw Error('No readable answer from Runway: the order may or may not exist. Lock kept, inspect before any new order.');
  }
  r.submitHttpStatus = status;
  if (status < 200 || status > 299) { r.submitError = answer.slice(0, 600); await save(r); throw Error(`Runway HTTP ${status}; lock kept, inspect before any new order.`); }
  let task: {id?: unknown; estimatedCost?: {credits?: number}} | null = null;
  try { task = JSON.parse(answer); } catch { /* recorded below */ }
  if (typeof task?.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(task.id)) { r.submitError = `no task identity in: ${answer.slice(0, 600)}`; await save(r); throw Error('No reliable task identity returned; lock kept, inspect before any new order.'); }
  r.status = 'PENDING'; r.taskId = task.id; r.providerEstimatedCredits = task.estimatedCost?.credits ?? null; await save(r);
  console.log(JSON.stringify({id: r.id, taskId: r.taskId, status: r.status, estimatedCredits: r.estimatedCredits, providerEstimatedCredits: r.providerEstimatedCredits}));
  process.exit(0);
}

if (!/^[a-f0-9-]{36}$/i.test(r.taskId ?? '')) throw Error('Missing task identity.');
const response = await fetch(`${API}/v1/tasks/${r.taskId}`, {headers, signal: AbortSignal.timeout(30000)});
if (!response.ok) throw Error(`Runway status HTTP ${response.status}`);
const task = await response.json();
r.status = task.status; r.lastCheckedAt = now(); r.progress = task.progress ?? null;
if (task.estimatedCost?.credits !== undefined) r.providerEstimatedCredits = task.estimatedCost.credits;
if (task.status === 'SUCCEEDED') {
  const out = `${dir}/source.mp4`;
  if (!await exists(out)) {
    if (typeof task.output?.[0] !== 'string' || !task.output[0].startsWith('https://')) throw Error('Missing HTTPS video output.');
    const download = await fetch(task.output[0], {signal: AbortSignal.timeout(300000)});
    if (!download.ok) throw Error(`Output HTTP ${download.status}`);
    await writeFile(out, Buffer.from(await download.arrayBuffer()), {flag: 'wx'});
  }
  const bytes = await readFile(out), digest = sha(bytes);
  if (r.output?.sha256 && r.output.sha256 !== digest) throw Error('Existing output does not match recorded hash.');
  r.completedAt ??= r.lastCheckedAt; r.actualCredits = task.cost ?? null;
  r.output = {path: out, sha256: digest, bytes: bytes.length};
  try { // The film and its cost are recorded even if it cannot be measured.
    const facts = sourceFacts(probe(out), bytes.length), s = r.source;
    Object.assign(r.output, {codec: facts.codec, width: facts.width, height: facts.height, fps: facts.fps, frames: facts.frames, seconds: facts.seconds,
      sameAsSource: {size: facts.width === s.width && facts.height === s.height, fps: facts.fps === s.fps, frames: facts.frames === s.frames}});
  } catch (error) { r.output.probeError = message(error); process.exitCode = 1; }
} else if (task.status === 'FAILED' || task.status === 'CANCELLED') { r.failure = task.failure ?? null; r.failureCode = task.failureCode ?? null; r.actualCredits = task.cost ?? null; process.exitCode = 1; }
await save(r);
console.log(JSON.stringify({id: r.id, taskId: r.taskId, status: r.status, progress: r.progress, estimatedCredits: r.estimatedCredits, actualCredits: r.actualCredits ?? null, output: r.output ?? null}));
