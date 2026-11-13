// The arithmetic of a spoken line. A rest film of the bank (1764 × 1174 on green) is cut into the clip that Scoutgaming's lip-sync
// renderer reads (services/moving-gpu-worker in Jakeminator123/scoutgaming: 1080 × 1920, 24 frames a second), the renderer draws the
// mouth for a sound over that clip's frames, and the drawn face is laid back into the film's own frames. This file holds what can
// be worked out without a file or a page: the bridge between the two frames, which frames a line of a given length plays, the job
// the renderer is given, and the blend of its answer into the film. tools/speech.ts does the work with it.
import {IDLE_RULE} from './clip-graph.ts';

// The renderer's frame contract (frame_contract.py and contracts.py there), mirrored: sound is 24 kHz mono 16-bit, a clip is the
// sound plus 0,22 s before and 0,53 s after, and nothing is cut, looped or held to make the two fit.
export const RENDER = {width: 1080, height: 1920, fps: 24, pcmRate: 24000, leadSamples: 5280, trailSamples: 12720, maxFrames: 600, maxPcmBytes: 24000 * 2 * 25} as const;
const SAMPLES_PER_FRAME = RENDER.pcmRate / RENDER.fps;

/** How the bank's frame sits in the renderer's: 1080 columns are cut from cropX and the film's rows are set down by padY, without
 * scaling, so a pixel of the film is a pixel of the clip: clip (x, y) = film (x + cropX, y − padY). The numbers are even because the
 * films are 4:2:0: an odd offset moves the colour half a pixel, and FFmpeg's pad rounds an odd row down without saying so. The first
 * and last frames of a generated rest film are not played (IDLE_RULE), so they are not in the clip either. */
export type Bridge = {film: {width: number; height: number}; cropX: number; padY: number; skipStart: number; skipEnd: number};
export const BRIDGE: Bridge = {film: {width: 1764, height: 1174}, cropX: 328, padY: 372, skipStart: IDLE_RULE.skipStart, skipEnd: IDLE_RULE.skipEnd};

/** What is wrong with a bridge, in Swedish; empty when it holds. */
export function bridgeProblems(b: Bridge): string[] {
  const out: string[] = [], {width, height} = b.film;
  if ([width, height, b.cropX, b.padY].some(n => !Number.isInteger(n) || n < 0 || n % 2)) out.push('Bryggans mått ska vara jämna heltal (filmerna är 4:2:0).');
  if (b.cropX + RENDER.width > width) out.push(`Utsnittet ${b.cropX}–${b.cropX + RENDER.width} går utanför filmens ${width} kolumner.`);
  if (b.padY + height > RENDER.height) out.push(`Filmens ${height} rader ryms inte under rad ${b.padY} i en ruta på ${RENDER.height}.`);
  if (![b.skipStart, b.skipEnd].every(n => Number.isInteger(n) && n >= 0)) out.push('Antalet överhoppade rutor ska vara heltal.');
  return out;
}
/** The clip's length for a film of so many frames, and the film's frame behind one of the clip's. */
export const clipLength = (filmFrames: number, b: Bridge = BRIDGE) => filmFrames - b.skipStart - b.skipEnd;
export const filmFrameOf = (clipFrame: number, b: Bridge = BRIDGE) => clipFrame + b.skipStart;

/** FFmpeg's filter for the bridge, from input 0 to [out]. The samples stay Y, Cb and Cr all the way (no RGB in between), every
 * frame is kept and numbered anew at 24 a second, and the rows above and below the film are filled from its own edge rows. */
export function bridgeFilter(filmFrames: number, b: Bridge = BRIDGE): string {
  const below = RENDER.height - b.film.height - b.padY, tags = 'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';
  return `[0:v]${tags},trim=start_frame=${b.skipStart}:end_frame=${filmFrames - b.skipEnd},setpts=N/(${RENDER.fps}*TB),` +
    `crop=${RENDER.width}:${b.film.height}:${b.cropX}:0,pad=${RENDER.width}:${RENDER.height}:0:${b.padY},` +
    `fillborders=top=${b.padY}:bottom=${below}:mode=smear,setsar=1,format=yuv420p[out]`;
}

/** The frames of a clip for so many bytes of sound; the renderer makes exactly this many. */
export function lineFrames(pcmBytes: number): number {
  if (!Number.isInteger(pcmBytes) || pcmBytes <= 0 || pcmBytes % 2) throw Error('invalid_pcm');
  if (pcmBytes > RENDER.maxPcmBytes) throw Error('talbas_too_long');
  return Math.floor((pcmBytes / 2 + RENDER.leadSamples + RENDER.trailSamples) / SAMPLES_PER_FRAME);
}
/** The longest sound, in seconds, a rest clip of so many frames can carry from its rest frame (out and back, see restPath). */
export function longestSound(frames: number, rest = 0): number {
  const reach = Math.max(frames - 1 - rest, rest), total = Math.min(RENDER.maxFrames, 2 * reach + 2);
  return Math.max(0, (total * SAMPLES_PER_FRAME - RENDER.leadSamples - RENDER.trailSamples) / RENDER.pcmRate);
}
/** Which frame of the rest clip each frame of the line shows: out from the rest frame and the same way back, so that the line starts
 * and ends on the rest frame and nothing is looped or held (backwards first when the rest frame lies late in the clip). The same
 * plan as Dealer Factory's talbas "pingpong". */
export function restPath(rest: number, frames: number, total: number): number[] {
  if (!Number.isInteger(total) || total < 1 || total > RENDER.maxFrames) throw Error('talbas_too_long');
  const reach = Math.floor((total - 1) / 2), dir = rest + reach < frames ? 1 : rest - reach >= 0 ? -1 : 0;
  if (!dir) throw Error('talbas_too_short');
  return Array.from({length: total}, (_, k) => rest + dir * Math.min(k, total - 1 - k));
}
export type PlanRow = [take: string, first: number, count: number];
/** The plan as the renderer reads it: a row [take, first frame, count] per rising run. */
export function planRows(take: string, frames: number[]): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const frame of frames) { const last = rows[rows.length - 1]; if (last && last[1] + last[2] === frame) last[2]++; else rows.push([take, frame, 1]); }
  return rows;
}

/** The same text for the same value as the renderer's Python writes (json.dumps without spaces): hashes are taken over it. Holds
 * for strings, whole numbers, lists and objects in the order they are written, which is all a job has. */
export const canonical = (value: unknown): string => JSON.stringify(value);
/** A clip's id in the form the bank wants (a UUID): the first 32 hex digits of the clip's SHA-256, so the same bytes get the same id. */
export function videoIdOf(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error('invalid_sha256');
  return [sha256.slice(0, 8), sha256.slice(8, 12), sha256.slice(12, 16), sha256.slice(16, 20), sha256.slice(20, 32)].join('-');
}
export type Sources = {schemaVersion: 1; dealerId: string; workerAvatar: string; clips: {videoId: string; take: string; sha256: string; bytes: number; fps: 24; frameCount: number; width: 1080; height: 1920}[]; rest: {videoId: string; frame: number}};
/** The source set of a bank made from one rest clip; its SHA-256 over canonical() is the set's identity (sourceSetSha256). */
export function sourcesOf(dealerId: string, clip: {sha256: string; bytes: number; frameCount: number}, restFrame = 0): Sources {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(dealerId)) throw Error('invalid_identity');
  if (!Number.isInteger(clip.frameCount) || clip.frameCount < 1 || clip.frameCount > RENDER.maxFrames || restFrame < 0 || restFrame >= clip.frameCount) throw Error('invalid_source');
  const videoId = videoIdOf(clip.sha256);
  return {schemaVersion: 1, dealerId, workerAvatar: dealerId, clips: [{videoId, take: 'clip-' + videoId, sha256: clip.sha256, bytes: clip.bytes, fps: 24, frameCount: clip.frameCount, width: 1080, height: 1920}], rest: {videoId, frame: restFrame}};
}

export type BankId = {dealerId: string; workerAvatar: string; sourceSetSha256: string; avatarSha256: string; bankReceiptSha256: string};
export type BakeJob = {schemaVersion: 1; op: 'bake'; ttlSeconds: number; binding: BankId & {schemaVersion: 1; releaseSha256: string; requestId: string}; karta: PlanRow[]; audio: {encoding: 's16le'; rate: 24000; channels: 1; sha256: string; base64: string}};
/** The job for one line: the bank it is bound to, the plan and the sound. The renderer refuses a plan whose length is not exactly
 * the sound's (frame_plan_length_mismatch), so that is refused here first. */
export function bakeJob(bank: BankId, releaseSha256: string, rows: PlanRow[], audio: {bytes: number; sha256: string; base64: string}, requestId: string, ttlSeconds = 600): BakeJob {
  if (rows.reduce((n, row) => n + row[2], 0) !== lineFrames(audio.bytes)) throw Error('frame_plan_length_mismatch');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) throw Error('invalid_request_id');
  const {dealerId, workerAvatar, sourceSetSha256, avatarSha256, bankReceiptSha256} = bank;
  return {schemaVersion: 1, op: 'bake', ttlSeconds, binding: {schemaVersion: 1, releaseSha256, dealerId, workerAvatar, sourceSetSha256, avatarSha256, bankReceiptSha256, requestId},
    karta: rows, audio: {encoding: 's16le', rate: 24000, channels: 1, sha256: audio.sha256, base64: audio.base64}};
}
/** Whether what was heard in a sound is the line's words: letters and digits only, whatever the case, the punctuation and where
 * the words are parted ("ikväll" for "i kväll"). The one number a dealer says is twenty-one, which a listener writes in digits;
 * any other number heard as digits does not match and is left for a person to read. */
export function sameWords(heard: string, text: string): boolean {
  const letters = (s: string) => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\b(tjugo ?ett|twenty ?one)\b/g, '21').replaceAll(' ', '');
  return letters(heard) === letters(text);
}
/** What the answer's video must say for a clip of so many frames (bake.py's contract), apart from its bytes and their hash. */
export const answerVideo = (frames: number) => ({schemaVersion: 1, frameCount: frames, fps: RENDER.fps, width: RENDER.width, height: RENDER.height, videoTrackId: 1, audioTrackId: 2, audioSampleRate: 48000});

// ── laying the rendered face back ────────────────────────────────────────────
// Frames are planar 4:2:0 as FFmpeg writes them raw: the luma rows, then Cb and Cr at half the size.
export type Box = {x: number; y: number; w: number; h: number};
const lumaAt = (b: Bridge) => ({x0: b.cropX, x1: Math.min(b.film.width, b.cropX + RENDER.width), y0: Math.max(0, -b.padY), y1: Math.min(b.film.height, RENDER.height - b.padY)});

/** Where a rendered frame differs from the film's own, as a box in the film's pixels: around every block whose mean luma differs
 * by more than `level`. The renderer's answer is a new encoding of the whole frame, so small differences are everywhere; the mouth
 * and what the renderer blended around it stand out. Null when no block does. */
export function changedBox(film: Uint8Array, clip: Uint8Array, b: Bridge = BRIDGE, level = 6, block = 8): Box | null {
  const {x0, x1, y0, y1} = lumaAt(b), W = b.film.width;
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = y0; y + block <= y1; y += block) for (let x = x0; x + block <= x1; x += block) {
    let sum = 0;
    for (let j = 0; j < block; j++) { const f = (y + j) * W + x, c = (y + j + b.padY) * RENDER.width + (x - b.cropX); for (let i = 0; i < block; i++) sum += Math.abs(film[f + i] - clip[c + i]); }
    if (sum > level * block * block) { if (x < left) left = x; if (y < top) top = y; if (x + block > right) right = x + block; if (y + block > bottom) bottom = y + block; }
  }
  return right < 0 ? null : {x: left, y: top, w: right - left, h: bottom - top};
}
export const unionBox = (a: Box | null, c: Box | null): Box | null => !a ? c : !c ? a : (() => { const x = Math.min(a.x, c.x), y = Math.min(a.y, c.y); return {x, y, w: Math.max(a.x + a.w, c.x + c.w) - x, h: Math.max(a.y + a.h, c.y + c.h) - y}; })();
/** The box grown by a margin on every side, kept inside what the clip shows of the film and on even pixels. */
export function grownBox(box: Box, margin: number, b: Bridge = BRIDGE): Box {
  const {x0, x1, y0, y1} = lumaAt(b), even = (n: number, up: boolean) => (up ? Math.ceil(n / 2) : Math.floor(n / 2)) * 2;
  const x = Math.max(even(x0, true), even(box.x - margin, false)), y = Math.max(even(y0, true), even(box.y - margin, false));
  return {x, y, w: Math.min(even(x1, false), even(box.x + box.w + margin, true)) - x, h: Math.min(even(y1, false), even(box.y + box.h + margin, true)) - y};
}
/** How much of the rendered frame each pixel of a box takes: nothing at the box's edge, all of it `feather` pixels in, eased. */
export function featherMask(w: number, h: number, feather: number): Float32Array {
  const mask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = Math.min(1, (Math.min(x, w - 1 - x, y, h - 1 - y) + 0.5) / Math.max(1, feather)); mask[y * w + x] = t * t * (3 - 2 * t); }
  return mask;
}
/** Lays the rendered frame's box into the film's frame, in place: luma and both colour planes, weighted by the mask. Outside the box
 * the film's frame is not touched. */
export function blendFrame(film: Uint8Array, clip: Uint8Array, box: Box, mask: Float32Array, b: Bridge = BRIDGE): void {
  const W = b.film.width, H = b.film.height, RW = RENDER.width, RH = RENDER.height;
  if (box.x % 2 || box.y % 2 || box.w % 2 || box.h % 2 || mask.length !== box.w * box.h) throw Error('invalid_box');
  if (film.length !== W * H * 3 / 2 || clip.length !== RW * RH * 3 / 2) throw Error('invalid_frame');
  for (let j = 0; j < box.h; j++) { const f = (box.y + j) * W + box.x, c = (box.y + j + b.padY) * RW + (box.x - b.cropX), m = j * box.w;
    for (let i = 0; i < box.w; i++) { const k = mask[m + i]; if (k > 0) film[f + i] = Math.round(film[f + i] + (clip[c + i] - film[f + i]) * k); } }
  const cw = W / 2, rcw = RW / 2;
  for (const [fp, cp] of [[W * H, RW * RH], [W * H + cw * (H / 2), RW * RH + rcw * (RH / 2)]]) for (let j = 0; j < box.h / 2; j++) {
    const f = fp + (box.y / 2 + j) * cw + box.x / 2, c = cp + ((box.y + b.padY) / 2 + j) * rcw + (box.x - b.cropX) / 2, m = 2 * j * box.w;
    for (let i = 0; i < box.w / 2; i++) { const k = mask[m + 2 * i]; if (k > 0) film[f + i] = Math.round(film[f + i] + (clip[c + i] - film[f + i]) * k); }
  }
}

// ── the gate: the drawn mouth only while she is heard ─────────────────────────
// The renderer draws a mouth for every frame of a line, also where the sound is silent: before her first word, after her last, and
// in a pause. Reviewed frame by frame (2026-11-13, 58 films) that was the fault they shared: the mouth opened 2–6 frames before she
// was heard and closed 5–8 after, hung half open in pauses, and her lips were the drawn, thinner ones from the first frame. So the
// drawn mouth is laid in only around what is heard, and elsewhere the film keeps its own mouth, closed, as in the rest film.
// A first gate eased the drawn mouth in and out over two frames at a fixed distance from the sound. Reviewed the same day (28
// films), the eased frames showed two mouths at once (teeth through her closed lips), the drawn mouth could open again in the
// silence it was let through, and in a pause it was only half taken away. So a change is now one frame, it is put where the two
// mouths are most alike, and a pause is taken only when her own mouth gets at least two whole frames in it (a shorter closing
// reads as a twitch).
//   floorDb  a frame is heard when its sound is louder than this, counted from the line's loudest frame
//   before   how many frames before a heard frame the change to the drawn mouth may lie (1 … before), after: how many frames
//            after a heard frame the change back may lie (1 … after)
//   pause    a silence of fewer frames than this inside the line is spoken through (the drawn mouth stays)
export type Gate = {floorDb: number; before: number; after: number; pause: number};
export const GATE: Gate = {floorDb: -30, before: 2, after: 3, pause: 5};
/** Which frames of a film are heard: louder than the gate's floor under the film's loudest frame. track is the film's own sound
 * from its first frame, 24 kHz mono 16-bit, as it will be heard (the line's sound already set at its place in the film). */
export function heardFrames(track: Uint8Array, frames: number, gate: Gate = GATE): boolean[] {
  if (!Number.isInteger(frames) || frames < 1 || track.length % 2) throw Error('invalid_gate');
  const view = new DataView(track.buffer, track.byteOffset, track.byteLength), db: number[] = [];
  for (let k = 0; k < frames; k++) { let sum = 0, n = 0; for (let i = k * SAMPLES_PER_FRAME; i < (k + 1) * SAMPLES_PER_FRAME && i * 2 + 1 < track.length; i++) { const v = view.getInt16(i * 2, true) / 32768; sum += v * v; n++; } db.push(n ? 10 * Math.log10(sum / n + 1e-12) : -120); }
  const peak = Math.max(...db);
  return db.map(d => peak > -90 && d > peak + gate.floorDb);
}
/**
 * How much of the drawn mouth each frame of a film gets: 1 (the drawn mouth) from just before she is heard to just after, 0 (the
 * film's own mouth) elsewhere, and one frame of both, 0.5, at each change. apart says for every frame how far the drawn mouth is
 * from the film's own there (any measure, the same for all frames): each change is put on the silent frame, within the gate's
 * reach of the sound, where they are least apart, the nearest to the sound when several are alike. Without it the changes lie
 * one frame from the sound.
 */
export function speechGate(heard: boolean[], gate: Gate = GATE, apart?: number[]): number[] {
  const frames = heard.length, weights = new Array<number>(frames).fill(0);
  if (apart && apart.length !== frames) throw Error('invalid_gate');
  // The silent frame between from and to where the two mouths are least apart; −1 when there is none.
  const least = (from: number, to: number, near: number) => { let best = -1;
    for (let k = Math.max(0, from); k <= Math.min(to, frames - 1); k++) { if (heard[k]) continue; const d = apart ? apart[k] - (best < 0 ? Infinity : apart[best]) : 0; if (best < 0 || d < -1e-9 || (Math.abs(d) <= 1e-9 && Math.abs(k - near) < Math.abs(best - near))) best = k; }
    return best; };
  // The stretches she is heard in. A silence shorter than a pause is spoken through, and so is one in which her own mouth would
  // not get two whole frames between the change back and the change to the drawn mouth again.
  const stretches: {first: number; last: number; come: number; go: number}[] = [];
  for (let k = 0; k < frames; k++) { if (!heard[k]) continue; const now = stretches[stretches.length - 1];
    if (now && k - now.last - 1 < gate.pause) { now.last = k; continue; }
    if (now) { const go = least(now.last + 1, Math.min(now.last + gate.after, k - 4), now.last + 1), come = go < 0 ? -1 : least(Math.max(go + 3, k - gate.before), k - 1, k - 1); if (come < 0) { now.last = k; continue; } now.go = go; stretches.push({first: k, last: k, come, go: -1}); }
    else stretches.push({first: k, last: k, come: least(k - gate.before, k - 1, k - 1), go: -1}); }
  const end = stretches[stretches.length - 1]; if (end) end.go = least(end.last + 1, end.last + gate.after, end.last + 1);
  for (const s of stretches) { for (let k = s.come < 0 ? s.first : s.come + 1; k <= (s.go < 0 ? s.last : s.go - 1); k++) weights[k] = 1; if (s.come >= 0) weights[s.come] = 0.5; if (s.go >= 0) weights[s.go] = 0.5; }
  return weights;
}
