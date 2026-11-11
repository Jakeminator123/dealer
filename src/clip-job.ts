// Pure contract for one Runway first/last clip job. No network or file access here.
// One clip is one action: a deal ends at the real release frame, a return starts from it.

export type FrameRef = {video: string; videoSha256: string; index: number};
export type FileRef = {path: string; sha256: string};
export type ImageRef = {frame: FrameRef; note?: string} | {file: FileRef; note?: string};
export type Ratio = 'auto_1080p' | 'auto_720p' | 'auto_480p';
export type ClipJob = {
  id: string; kind: 'DEAL' | 'RETURN' | 'ENTRY' | 'IDLE' | 'REVEAL'; target: string | null; from: string; to: string;
  model: 'wan3'; duration: number; ratio: Ratio; audio: false;
  promptText: string; first: ImageRef; last: ImageRef; purpose: string;
  // 2 = the action is generated in slow motion at half speed and is meant to be played back twice as fast.
  playbackSpeed?: 1 | 2;
};

// Length of the action as it will be watched. One action per clip means this stays short.
export const watchedSeconds = (job: ClipJob): number => job.duration / (job.playbackSpeed ?? 1);
export type JobFile = {schemaVersion: 1; budget: {maximumCredits: number}; jobs: ClipJob[]};

// Developer-API price read from docs.dev.runwayml.com/guides/pricing 2026-11-10.
export const CREDITS_PER_SECOND: Record<Ratio, number> = {auto_1080p: 20, auto_720p: 10, auto_480p: 5};
export const PROMPT_LIMIT = 2000;
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function image(value: unknown, label: string): ImageRef {
  const v = value as {frame?: FrameRef; file?: FileRef};
  if (v?.frame && !v.file) {
    const f = v.frame;
    if (typeof f.video !== 'string' || !SHA.test(f.videoSha256) || !Number.isInteger(f.index) || f.index < 0) throw Error(`${label}: invalid frame reference.`);
    return value as ImageRef;
  }
  if (v?.file && !v.frame) {
    if (typeof v.file.path !== 'string' || !SHA.test(v.file.sha256)) throw Error(`${label}: invalid file reference.`);
    return value as ImageRef;
  }
  throw Error(`${label}: give exactly one of frame or file.`);
}

export function validateJob(value: unknown): ClipJob {
  const j = value as ClipJob;
  if (!j || typeof j.id !== 'string' || !ID.test(j.id)) throw Error('Job id must be lowercase kebab-case.');
  if (!['DEAL', 'RETURN', 'ENTRY', 'IDLE', 'REVEAL'].includes(j.kind)) throw Error(`${j.id}: unknown kind.`);
  if (j.model !== 'wan3') throw Error(`${j.id}: only wan3 first/last jobs are supported by this tool.`);
  if (!Number.isInteger(j.duration) || j.duration < 2 || j.duration > 30) throw Error(`${j.id}: wan3 duration must be 2–30 whole seconds.`);
  if (!(j.ratio in CREDITS_PER_SECOND)) throw Error(`${j.id}: keyframes need an auto_ ratio.`);
  if (j.audio !== false) throw Error(`${j.id}: audio must be false.`);
  if (typeof j.promptText !== 'string' || j.promptText.length < 40 || j.promptText.length > PROMPT_LIMIT) throw Error(`${j.id}: prompt must be 40–${PROMPT_LIMIT} characters.`);
  if (typeof j.purpose !== 'string' || !j.purpose) throw Error(`${j.id}: state the purpose.`);
  if (typeof j.from !== 'string' || typeof j.to !== 'string') throw Error(`${j.id}: name the from/to nodes.`);
  if (j.playbackSpeed !== undefined && j.playbackSpeed !== 1 && j.playbackSpeed !== 2) throw Error(`${j.id}: playbackSpeed must be 1 or 2.`);
  image(j.first, `${j.id} first`); image(j.last, `${j.id} last`);
  return j;
}

export function validateJobFile(value: unknown): JobFile {
  const f = value as JobFile;
  if (f?.schemaVersion !== 1 || !Array.isArray(f.jobs)) throw Error('Unknown clip job file.');
  if (!Number.isInteger(f.budget?.maximumCredits) || f.budget.maximumCredits < 0) throw Error('Budget ceiling missing.');
  const seen = new Set<string>();
  for (const job of f.jobs) { validateJob(job); if (seen.has(job.id)) throw Error(`Duplicate job id ${job.id}.`); seen.add(job.id); }
  return f;
}

export const estimateCredits = (job: ClipJob): number => job.duration * CREDITS_PER_SECOND[job.ratio];

// Exactly what is sent to POST /v1/image_to_video. Nothing else leaves the machine.
export function requestBody(job: ClipJob, firstUri: string, lastUri: string) {
  return {model: job.model, duration: job.duration, ratio: job.ratio, audio: job.audio, promptText: job.promptText,
    promptImage: [{uri: firstUri, position: 'first'}, {uri: lastUri, position: 'last'}]};
}

// A job counts against the ceiling from the moment a request may have been sent.
export function committedCredits(receipts: {status: string; estimatedCredits: number}[]): number {
  return receipts.filter(r => r.status !== 'PREPARED').reduce((sum, r) => sum + r.estimatedCredits, 0);
}

export function assertBudget(maximumCredits: number, committed: number, next: number): void {
  if (committed + next > maximumCredits) throw Error(`Budget ceiling ${maximumCredits} would be exceeded: ${committed} committed + ${next} requested.`);
}
