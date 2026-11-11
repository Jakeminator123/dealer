// Pure contract for one Runway video-to-video edit: an existing clip plus one stated correction.
// No network or file access here. Every limit below was read from the Runway developer docs
// snapshot of 2026-11-10; the request shape is the `aleph2` member of POST /v1/video_to_video.
import {committedCredits, assertBudget, type FrameRef, type FileRef} from './clip-job.ts';

export type EditRange = {start_seconds: number; end_seconds: number};
// A timed guidance image: a decoded frame of a hashed video or a hashed PNG, placed at `seconds` or at fraction `at`.
export type EditKeyframe = ({frame: FrameRef} | {file: FileRef}) & ({seconds: number} | {at: number}) & {range?: EditRange; note?: string};
export type EditJob = {
  id: string; source: {clip: string; sha256: string}; model: 'aleph2';
  promptText: string; keyframes?: EditKeyframe[]; seed?: number; purpose: string;
};
export type SourceFacts = {bytes: number; codec: string; pixelFormat: string; width: number; height: number; fps: number; frames: number; seconds: number; containerSeconds: number};
export type UploadTicket = {uploadUrl: string; fields: Record<string, string>; runwayUri: string};
type CountedReceipt = {status: string; estimatedCredits: number};

export const EDIT_ENDPOINT = '/v1/video_to_video';
export const EDIT_PROMPT_LIMIT = 1000;                                // promptText.maxLength
export const EDIT_KEYFRAME_LIMIT = 5, EDIT_SEED_MAX = 4294967295;     // keyframes.maxItems, seed.maximum
export const EDIT_CREDITS_PER_SECOND = 28, EDIT_MINIMUM_CREDITS = 56; // pricing: "28 credits per second (56 credit minimum per generation)"
export const SOURCE_MIN_SECONDS = 2, SOURCE_MAX_SECONDS = 30, SOURCE_MAX_FPS = 30; // inputs: "2–30 seconds and 30 FPS or lower"
export const SOURCE_CODECS = ['h264', 'hevc', 'av1'];                 // inputs: MP4 with H.264, H.265/HEVC or AV1
// "5MB" for the whole encoded data URI. The schema allows 5 242 880 characters; the smaller reading is used.
export const DATA_URI_LIMIT = 5_000_000;
export const UPLOAD_MIN_BYTES = 512, UPLOAD_MAX_BYTES = 200_000_000;  // uploads: minimum 512 bytes, maximum 200MB
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function only(value: object, allowed: string[], label: string): void {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw Error(`${label}: unknown field ${extra.join(', ')}; it would not be sent.`);
}

function keyframe(value: unknown, label: string): void {
  const k = value as {frame?: FrameRef; file?: FileRef; seconds?: unknown; at?: unknown; range?: EditRange};
  if (!k || typeof k !== 'object') throw Error(`${label}: not a keyframe.`);
  only(k, ['frame', 'file', 'seconds', 'at', 'range', 'note'], label);
  if (k.frame && !k.file) {
    if (typeof k.frame.video !== 'string' || !SHA.test(k.frame.videoSha256) || !Number.isInteger(k.frame.index) || k.frame.index < 0) throw Error(`${label}: invalid frame reference.`);
  } else if (k.file && !k.frame) {
    if (typeof k.file.path !== 'string' || !SHA.test(k.file.sha256)) throw Error(`${label}: invalid file reference.`);
  } else throw Error(`${label}: give exactly one of frame or file.`);
  if ((k.seconds === undefined) === (k.at === undefined)) throw Error(`${label}: give exactly one of seconds or at.`);
  if (k.seconds !== undefined && !(typeof k.seconds === 'number' && k.seconds >= 0 && k.seconds <= SOURCE_MAX_SECONDS)) throw Error(`${label}: seconds must be 0–${SOURCE_MAX_SECONDS}.`);
  if (k.at !== undefined && !(typeof k.at === 'number' && k.at >= 0 && k.at <= 1)) throw Error(`${label}: at must be a fraction 0–1.`);
  if (k.range !== undefined) {
    const r = k.range;
    if (!r || typeof r !== 'object') throw Error(`${label}: invalid range.`);
    only(r, ['start_seconds', 'end_seconds'], `${label} range`);
    if (!Number.isInteger(r.start_seconds) || !Number.isInteger(r.end_seconds) || r.start_seconds < 0 || r.end_seconds <= r.start_seconds) throw Error(`${label}: range takes whole seconds with 0 <= start < end.`);
    // Not in the documentation: the API answered HTTP 400 "range must be at least 2 seconds long" on 2026-11-11.
    if (r.end_seconds - r.start_seconds < 2) throw Error(`${label}: the API rejects edit ranges shorter than two seconds.`);
    if (typeof k.seconds === 'number' && !(k.seconds >= r.start_seconds && k.seconds < r.end_seconds)) throw Error(`${label}: the keyframe time must fall inside its range (end exclusive).`);
  }
}

export function validateEdit(value: unknown): EditJob {
  const e = value as EditJob;
  if (!e || typeof e.id !== 'string' || !ID.test(e.id)) throw Error('Edit id must be lowercase kebab-case.');
  only(e, ['id', 'source', 'model', 'promptText', 'keyframes', 'seed', 'purpose'], e.id);
  if (e.model !== 'aleph2') throw Error(`${e.id}: only aleph2 edits are supported by this tool.`);
  if (typeof e.source?.clip !== 'string' || !ID.test(e.source.clip) || !SHA.test(e.source.sha256)) throw Error(`${e.id}: source needs an existing clip id and the sha256 of its source.mp4.`);
  if (e.source.clip === e.id) throw Error(`${e.id}: an edit cannot be its own source.`);
  if (typeof e.promptText !== 'string' || e.promptText.length < 40 || e.promptText.length > EDIT_PROMPT_LIMIT) throw Error(`${e.id}: prompt must be 40–${EDIT_PROMPT_LIMIT} characters.`);
  if (e.seed !== undefined && !(Number.isInteger(e.seed) && e.seed >= 0 && e.seed <= EDIT_SEED_MAX)) throw Error(`${e.id}: seed must be a whole number 0–${EDIT_SEED_MAX}.`);
  if (typeof e.purpose !== 'string' || !e.purpose) throw Error(`${e.id}: state the purpose.`);
  if (e.keyframes !== undefined) {
    if (!Array.isArray(e.keyframes) || e.keyframes.length < 1 || e.keyframes.length > EDIT_KEYFRAME_LIMIT) throw Error(`${e.id}: keyframes takes 1–${EDIT_KEYFRAME_LIMIT} entries; leave the field out for none.`);
    e.keyframes.forEach((k, i) => keyframe(k, `${e.id} keyframe ${i + 1}`));
    const ranges = e.keyframes.map(k => k.range);
    if (ranges.some(Boolean) && !ranges.every(Boolean)) throw Error(`${e.id}: all keyframes must set a range or none may.`);
    // Whether several keyframes may carry different windows is not documented: one window per request.
    if (ranges.some(r => r && (r.start_seconds !== ranges[0]!.start_seconds || r.end_seconds !== ranges[0]!.end_seconds))) throw Error(`${e.id}: every keyframe must carry the same range; several edit windows are not documented.`);
  }
  return e;
}

// The optional top-level "edits" array of data/clip-jobs.json. An edit writes to assets/motions/<id> like a job does.
export function validateEdits(file: unknown): EditJob[] {
  const f = file as {edits?: unknown; jobs?: {id?: string}[]; derived?: {id?: string}[]};
  if (f?.edits === undefined) return [];
  if (!Array.isArray(f.edits)) throw Error('edits must be an array.');
  const taken = new Set([...(Array.isArray(f.jobs) ? f.jobs : []), ...(Array.isArray(f.derived) ? f.derived : [])].map(item => item?.id));
  for (const edit of f.edits) {
    validateEdit(edit);
    if (taken.has(edit.id)) throw Error(`Duplicate id ${edit.id}: an edit needs an id no job, derived take or other edit has.`);
    taken.add(edit.id);
  }
  return f.edits;
}

export const editWindow = (job: EditJob): EditRange | null => job.keyframes?.[0]?.range ?? null;

const rate = (value: unknown): number => { const [n, d] = String(value).split('/').map(Number); return n / (d || 1); };

// Facts of the first video stream from `ffprobe -count_frames -show_entries stream=...:format=duration -of json`.
export function sourceFacts(probe: unknown, bytes: number): SourceFacts {
  const p = probe as {streams?: Record<string, unknown>[]; format?: {duration?: unknown}}, s = p?.streams?.[0];
  if (!s) throw Error('No video stream found in the source clip.');
  const average = rate(s.avg_frame_rate), frames = Number(s.nb_read_frames);
  const facts: SourceFacts = {bytes, codec: String(s.codec_name), pixelFormat: String(s.pix_fmt), width: Number(s.width), height: Number(s.height),
    fps: Math.max(average, rate(s.r_frame_rate)), frames, seconds: Number((frames / average).toFixed(6)), containerSeconds: Number(p.format?.duration)};
  const numbers = [facts.bytes, facts.width, facts.height, facts.fps, facts.frames, facts.seconds, facts.containerSeconds];
  if (!numbers.every(n => Number.isFinite(n) && n > 0) || !Number.isInteger(facts.frames)) throw Error('Unreadable facts for the source clip.');
  return facts;
}

export function assertSourceAccepted(f: SourceFacts): void {
  if (!SOURCE_CODECS.includes(f.codec)) throw Error(`Source codec ${f.codec} is not a documented MP4 input (H.264, H.265/HEVC, AV1).`);
  if (Math.min(f.seconds, f.containerSeconds) < SOURCE_MIN_SECONDS || Math.max(f.seconds, f.containerSeconds) > SOURCE_MAX_SECONDS) throw Error(`Source is ${f.seconds} s by its frames and ${f.containerSeconds} s by its container; aleph2 takes ${SOURCE_MIN_SECONDS}–${SOURCE_MAX_SECONDS} seconds.`);
  if (f.fps > SOURCE_MAX_FPS) throw Error(`Source is ${f.fps} fps; aleph2 takes ${SOURCE_MAX_FPS} fps or lower.`);
}

// "Aleph 2.0 preserves the input video's resolution (up to 1080p)." How 1080p is measured for other shapes is not documented.
export const withinPlain1080p = (f: {width: number; height: number}): boolean => Math.max(f.width, f.height) <= 1920 && Math.min(f.width, f.height) <= 1080;

// What can only be judged against the measured clip: guidance times and the edit window must lie inside it.
export function assertEditFitsSource(job: EditJob, f: SourceFacts): void {
  for (const [i, k] of (job.keyframes ?? []).entries()) {
    const label = `${job.id} keyframe ${i + 1}`, time = 'seconds' in k ? k.seconds : k.at * f.seconds;
    if (time > f.seconds) throw Error(`${label}: ${time} s lies after the end of the ${f.seconds} s clip.`);
    if (!k.range) continue;
    if (k.range.end_seconds > f.seconds + 1e-6) throw Error(`${label}: the edit window ends after the ${f.seconds} s clip does.`);
    if (!(time >= k.range.start_seconds && time < k.range.end_seconds)) throw Error(`${label}: the keyframe time must fall inside its range (end exclusive).`);
  }
}

// The price is per second with no stated rule for fractions: whole seconds rounded up, never under the minimum.
export const billedSeconds = (f: {seconds: number; containerSeconds: number}): number => Math.ceil(Number(Math.max(f.seconds, f.containerSeconds).toFixed(6)));
export const estimateEditCredits = (f: {seconds: number; containerSeconds: number}): number => Math.max(EDIT_MINIMUM_CREDITS, EDIT_CREDITS_PER_SECOND * billedSeconds(f));

export const dataUriLength = (mime: string, bytes: number): number => `data:${mime};base64,`.length + 4 * Math.ceil(bytes / 3);

// A clip that fits a data URI goes inline; anything larger needs an ephemeral upload first.
export function sourceTransport(bytes: number): 'DATA_URI' | 'UPLOAD' {
  if (dataUriLength('video/mp4', bytes) <= DATA_URI_LIMIT) return 'DATA_URI';
  if (bytes < UPLOAD_MIN_BYTES || bytes > UPLOAD_MAX_BYTES) throw Error(`Source is ${bytes} bytes; an ephemeral upload takes ${UPLOAD_MIN_BYTES}–${UPLOAD_MAX_BYTES} bytes.`);
  return 'UPLOAD';
}

// POST /v1/uploads: ask for one ephemeral upload slot. The file itself then goes to the returned storage URL.
export const uploadRequestBody = (filename: string) => ({filename, type: 'ephemeral' as const});

export function validateUploadTicket(value: unknown): UploadTicket {
  const t = value as UploadTicket;
  if (typeof t?.uploadUrl !== 'string' || !t.uploadUrl.startsWith('https://')) throw Error('Upload answer without an HTTPS upload URL.');
  if (!t.fields || typeof t.fields !== 'object' || Array.isArray(t.fields) || !Object.values(t.fields).every(v => typeof v === 'string')) throw Error('Upload answer without usable form fields.');
  if (typeof t.runwayUri !== 'string' || !/^runway:\/\/./.test(t.runwayUri) || t.runwayUri.length < 13 || t.runwayUri.length > 5000) throw Error('Upload answer without a runway:// URI.');
  return t;
}

function uri(value: string, media: 'video' | 'image', label: string): string {
  const inline = value.startsWith(`data:${media}/`), uploaded = value.startsWith('runway://');
  if (!inline && !uploaded) throw Error(`${label}: only a runway:// upload or a data:${media}/ URI is ever sent.`);
  if (value.length < 13 || value.length > (inline ? DATA_URI_LIMIT : 5000)) throw Error(`${label}: URI length outside the documented limits.`);
  return value;
}

// Exactly what is sent to POST /v1/video_to_video. Nothing else leaves the machine.
// Left out on purpose: ratio (deprecated), targetAspectRatio (letterboxes), contentModeration, outputFormat and proresProfile (defaults; other formats cost extra).
export function editRequestBody(job: EditJob, videoUri: string, keyframeUris: string[] = []) {
  const keyframes = job.keyframes ?? [];
  if (keyframeUris.length !== keyframes.length) throw Error(`${job.id}: one URI per keyframe is required.`);
  return {
    model: job.model, videoUri: uri(videoUri, 'video', `${job.id} video`), promptText: job.promptText,
    ...(keyframes.length ? {keyframes: keyframes.map((k, i) => ({
      uri: uri(keyframeUris[i], 'image', `${job.id} keyframe ${i + 1}`),
      ...('seconds' in k ? {seconds: k.seconds} : {at: k.at}),
      ...(k.range ? {range: {start_seconds: k.range.start_seconds, end_seconds: k.range.end_seconds}} : {}),
    }))} : {}),
    ...(job.seed !== undefined ? {seed: job.seed} : {}),
  };
}

// The paid POST is sent at most once per edit id: anything but an untouched PREPARED receipt means a request may exist.
export function assertSubmittable(receipt: {status?: unknown; taskId?: unknown}, lockExists: boolean): void {
  if (receipt.status !== 'PREPARED' || lockExists || receipt.taskId != null) throw Error('Existing or uncertain task: never resubmit automatically.');
}

// One ceiling for every paid request named in the job file, whichever tool sends it.
export const ledgerIds = (jobs: {id: string}[], edits: {id: string}[]): string[] => [...jobs, ...edits].map(item => item.id);

export function assertSharedBudget(maximumCredits: number, others: CountedReceipt[], next: number): number {
  for (const r of others) if (typeof r?.status !== 'string' || !Number.isFinite(r.estimatedCredits) || r.estimatedCredits < 0) throw Error('A receipt without a readable status and estimate cannot be counted; inspect it before ordering.');
  if (!Number.isFinite(next) || next <= 0) throw Error('The request has no readable estimate.');
  const committed = committedCredits(others);
  assertBudget(maximumCredits, committed, next);
  return committed;
}
