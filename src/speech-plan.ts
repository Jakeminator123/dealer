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
// Three gates were tried and reviewed the same day (63 films more):
//   1. the drawn mouth eased in and out over two frames, at a fixed distance from the sound: two mouths at once in the eased frames,
//      and the drawn mouth could open again in the silence it was let through
//   2. one frame of both, put where the two mouths are most alike: the times held everywhere (open at most two frames before the
//      sound and two after), most films 3/5; still teeth through closed lips in that one frame where the drawn mouth was open, and
//      a pause in which her own mouth got only two frames read as a flicker, one where it got five as a person closing her mouth
//   3. no frame of both, a hard change: worse (1–2/5). The drawn mouth is seldom closed on its last frame, so the mouth slammed
//      shut from open with teeth in one frame, and every change showed as a jerk
// What stands is the second, with the third's rule for pauses: one frame of both at each change, and a pause is taken only when
// her own mouth gets `own` whole frames in it. With her own upper lip kept (the mouth made hers, below) the one frame of both
// shows much less: the two mouths then differ only under the line between her lips.
//   floorDb  a frame is heard when its sound is louder than this, counted from the line's loudest frame
//   before   how many frames before the first heard frame the change to the drawn mouth may lie (1 … before), after: how many
//            frames after the last heard frame the change back may lie (1 … after)
//   pause    a silence of fewer frames than this inside the line is spoken through (the drawn mouth stays)
//   own      how many whole frames her own mouth must get for a pause to be taken
//   both     how much of the drawn mouth the one frame at each change gets: 0.5 is both mouths alike, 0 the hard change that fell
export type Gate = {floorDb: number; before: number; after: number; pause: number; own: number; both: number};
export const GATE: Gate = {floorDb: -30, before: 2, after: 3, pause: 6, own: 4, both: 0.5};
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
 * film's own mouth) elsewhere, and one frame of both (the gate's both) at each change. apart says for every frame how far the drawn mouth is
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
  // not get its whole frames between the change back and the change to the drawn mouth again.
  const stretches: {first: number; last: number; come: number; go: number}[] = [];
  for (let k = 0; k < frames; k++) { if (!heard[k]) continue; const now = stretches[stretches.length - 1];
    if (now && k - now.last - 1 < gate.pause) { now.last = k; continue; }
    if (now) { const go = least(now.last + 1, Math.min(now.last + gate.after, k - gate.own - 2), now.last + 1), come = go < 0 ? -1 : least(Math.max(go + gate.own + 1, k - gate.before), k - 1, k - 1); if (come < 0) { now.last = k; continue; } now.go = go; stretches.push({first: k, last: k, come, go: -1}); }
    else stretches.push({first: k, last: k, come: least(k - gate.before, k - 1, k - 1), go: -1}); }
  const end = stretches[stretches.length - 1]; if (end) end.go = least(end.last + 1, end.last + gate.after, end.last + 1);
  for (const s of stretches) { for (let k = s.come < 0 ? s.first : s.come + 1; k <= (s.go < 0 ? s.last : s.go - 1); k++) weights[k] = 1; if (s.come >= 0) weights[s.come] = gate.both; if (s.go >= 0) weights[s.go] = gate.both; }
  return weights;
}
/** A frame of both mouths: the frame the mouth was laid into keeps this much (0 … 1) of what was laid, the rest is the film's own frame. */
export function mixFrame(laid: Uint8Array, own: Uint8Array, weight: number): void {
  if (laid.length !== own.length || !(weight >= 0 && weight <= 1)) throw Error('invalid_mix');
  for (let i = 0; i < laid.length; i++) if (laid[i] !== own[i]) laid[i] = Math.round(own[i] + (laid[i] - own[i]) * weight);
}

// ── the mouth made hers ───────────────────────────────────────────────────────
// The renderer does not copy her lips, it paints new ones, and it paints them smaller: measured 54–62 pixels wide against her
// own 66–69 in the same film, about half as tall, matter and a little softer, and with them the whole lower face a little softer
// (chin and cheeks at 62–71 % of the film's sharpness). Jakob saw it at once ("när lipsynken är aktiv så blir hennes läppar mycket
// mindre … det måste vara byggt på den befintliga munnen som hon har", 2026-11-13). So when the drawn mouth is laid back:
//   1. only the mouth is laid in, through a soft ellipse around her own lips in that frame; chin and cheeks stay the film's own,
//      and so do her own upper lip (under) and the corners of her mouth (corners)
//   2. the drawn mouth is made larger around the middle of her lips, in height (tall); it can also be moved down at her lip line
//      while it is open, so that it opens under her own upper lip and not behind it (drop, closed), which a fourth trial did and
//      the recipe does not
//   3. the drawn lips' colour is moved to her own lips' colour in the same film, and what is drawn is sharpened a little
// Everything is done on the film's own values (4:2:0), in a window around what the renderer changed.
//   wide, tall  how much larger the drawn mouth is made at the lips, in width and in height (1 = as drawn)
//   colour      how far the drawn lips' colour is moved to her own (0 … 1); sharpen: how much what is drawn is sharpened (0 = not)
//   reach       the ellipse the mouth is laid in through, half its width and half its height in pixels; it is whole inside 70 %
//               of that and eased out to its edge. grow: the ellipse inside which the enlargement is at full strength
//   under       her own upper lip is kept: the drawn mouth is laid in only below the line between her lips, beginning this many
//               pixels above it (null: the whole ellipse is laid in). The model's upper lip is thin where hers is full, and no
//               enlargement makes it hers; her own, left where it is, does (Jakob to the first trial, wide 1.14 and tall 1.3
//               without this: "Känns inte riktigt där").
//   corners     the drawn mouth ends at her own lips' corners: this many pixels outside the red of her lips in that frame, eased
//               out over the ten pixels before (null: no such end). The model's mouth is wider than hers, and its corners laid in
//               beside her own drew dark lines out from them (Jakob to the second trial: "lite 'clownläppar' i mungiporna").
//   drop, fall  the drawn mouth is moved down `drop` pixels at her lip line, eased out to nothing `fall` pixels below it. The
//               model opens the mouth at her lip line and a little above it (its upper lip is thinner), so with her own upper lip
//               kept part of the opening lies behind it (a reviewer of the films laid that way: "munnen öppnas knappt under Du
//               dubblar"). Moved down, it opens under her upper lip, at the size it was drawn. Tried 2026-11-13 as a fourth
//               trial (drop 4, closed -2, tall 1, 30 films laid and reviewed independently): no better in the reviewers' scores
//               (5 of 19 films 2/5 against 2 of 30 before), a strip of teeth under a still upper lip, and the lower lip 4-7
//               pixels thinner while she speaks, which is what Jakob first complained of. So the recipe leaves it at 0.
//   open        the drawn mouth is moved down only while it is open: not at all when the gap between its lips is under the first
//               number of pixels, wholly from the second (mouthDrop). Moved down while closed, its own lip line lay under hers,
//               a second contour in every frame where the lips meet (m, b, p).
//   closed      how far it is moved while its lips meet (negative: up). The model's closed lip line lies a couple of pixels
//               under hers (seen in three films); lifted onto hers it is covered by her own line, and one line shows.
export type Lips = {wide: number; tall: number; colour: number; sharpen: number; reach: [number, number]; grow: [number, number]; under: number | null; corners: number | null; drop: number; fall: number; open: [number, number]; closed: number};
export const LIPS: Lips = {wide: 1, tall: 1.25, colour: 1, sharpen: 0.5, reach: [60, 42], grow: [44, 30], under: 1, corners: 0, drop: 0, fall: 20, open: [2, 5], closed: 0};
/** How open the drawn mouth is in a window: the height in pixels of what is not lip between its upper and its lower lip (teeth,
 * the dark of the mouth), the median over the columns at the lips' middle; 0 when its lips meet. line is her own lip line. */
export function mouthGap(drawn: Planes, w: number, h: number, middle: {x: number; y: number}, line: Float32Array): number {
  const hw = w / 2, hh = h / 2, lip = lipMap(drawn.V), gaps: number[] = [], isLip = (x: number, y: number) => lip[Math.min(hh - 1, y >> 1) * hw + (x >> 1)] > 0.5;
  for (let x = Math.max(0, Math.round(middle.x) - 16); x <= Math.min(w - 1, Math.round(middle.x) + 16); x += 2) { const at = Math.round(line[x]), from = Math.max(0, at - 14), to = Math.min(h - 1, at + 24); let top = -1, bottom = -1, lipRows = 0;
    for (let y = from; y <= to; y++) if (isLip(x, y)) { if (top < 0) top = y; bottom = y; lipRows++; }
    gaps.push(top < 0 ? 0 : bottom - top + 1 - lipRows); }
  return gaps.sort((a, c) => a - c)[gaps.length >> 1] ?? 0;
}
/** How far the drawn mouth is moved down in each frame: the recipe's drop while it is open, its `closed` while its lips meet, eased
 * between the two gaps of `open`; the gaps are first evened over three frames (their median), so that one frame's mismeasure
 * does not move the mouth. */
export function mouthDrop(gaps: number[], lips: Lips = LIPS): number[] {
  const [from, to] = lips.open, even = gaps.map((_, k) => [gaps[Math.max(0, k - 1)], gaps[k], gaps[Math.min(gaps.length - 1, k + 1)]].sort((a, c) => a - c)[1]);
  return even.map(g => { const t = Math.min(1, Math.max(0, (g - from) / Math.max(1e-6, to - from))); return Number((lips.closed + (lips.drop - lips.closed) * t * t * (3 - 2 * t)).toFixed(2)); });
}
/** Half the width of the red of her lips in a window: how far the lip pixels reach to either side of the lips' middle, near it. */
export function lipsHalf(lip: Float32Array, w: number, middle: {x: number; y: number}): number | null {
  const hw = w / 2; let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < lip.length; i++) { if (lip[i] <= 0.5) continue; const x = 2 * (i % hw) + 1, y = 2 * ((i / hw) | 0) + 1; if (Math.abs(x - middle.x) > 52 || Math.abs(y - middle.y) > 22) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return x1 > x0 ? Math.max(middle.x - x0, x1 - middle.x) : null;
}
/** The line between her lips in her own frame, a row for every column of the window: the darkest row within nine pixels of the
 * lips' middle, column by column across the lips, smoothed; the middle's own row outside them. */
export function lipLine(film: Uint8Array, win: Box, middle: {x: number; y: number}, b: Bridge = BRIDGE): Float32Array {
  const W = b.film.width, {w, h} = win, raw = new Float32Array(w).fill(middle.y), line = new Float32Array(w), at = (x: number, y: number) => film[(win.y + y) * W + win.x + x];
  for (let x = Math.max(1, Math.round(middle.x - 46)); x <= Math.min(w - 2, Math.round(middle.x + 46)); x++) { let best = Math.round(middle.y), dark = Infinity;
    for (let y = Math.max(1, Math.round(middle.y - 9)); y <= Math.min(h - 2, Math.round(middle.y + 9)); y++) { const v = at(x - 1, y) + at(x, y) + at(x + 1, y); if (v < dark) { dark = v; best = y; } } raw[x] = best; }
  for (let x = 0; x < w; x++) { let sum = 0, n = 0; for (let j = Math.max(0, x - 6); j <= Math.min(w - 1, x + 6); j++) { sum += raw[j]; n++; } line[x] = sum / n; }
  return line;
}
/** The window the mouth is worked in: around what the renderer changed, even numbers, in the film's pixels. */
export function mouthWindow(changed: Box, b: Bridge = BRIDGE): Box {
  const x = Math.max(b.cropX, (changed.x - 28) & ~1), y = Math.max(0, (changed.y - 24) & ~1);
  return {x, y, w: Math.min(b.film.width, b.cropX + RENDER.width, changed.x + changed.w + 28) - x & ~1, h: Math.min(b.film.height, changed.y + changed.h - 4) - y & ~1};
}
export type Planes = {Y: Float32Array; U: Float32Array; V: Float32Array};
/** A window cut out of a planar 4:2:0 frame of width × height, as numbers: luma at full size, the two colour planes at half. */
export function cutPlanes(frame: Uint8Array, width: number, height: number, x0: number, y0: number, w: number, h: number): Planes {
  const Y = new Float32Array(w * h), U = new Float32Array(w * h / 4), V = new Float32Array(w * h / 4), half = width / 2, u0 = width * height, v0 = u0 + half * (height / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Y[y * w + x] = frame[(y0 + y) * width + x0 + x];
  for (let y = 0; y < h / 2; y++) for (let x = 0; x < w / 2; x++) { const i = (y0 / 2 + y) * half + x0 / 2 + x; U[y * w / 2 + x] = frame[u0 + i]; V[y * w / 2 + x] = frame[v0 + i]; }
  return {Y, U, V};
}
/** How much each pixel of the colour plane V is lip, 0 to 1: how much redder it is than the skin around (the window's median).
 * Measured in Paow's rest film: lips stand 9–20 over the median, a flushed cheek 5–9. */
export function lipMap(V: Float32Array): Float32Array {
  const sorted = Float32Array.from(V).sort(), skin = sorted[sorted.length >> 1];
  return V.map(v => Math.min(1, Math.max(0, (v - skin - 8) / 6)));
}
/** Where the lips are in a window of w × h: the middle of the lip pixels, found from a first guess and narrowed twice to what
 * lies near it (a flushed cheek at the window's edge is then left out). In the window's full-size pixels; null when none. */
export function lipsMiddle(lip: Float32Array, w: number, h: number, guess: {x: number; y: number} = {x: w / 2, y: h * 0.45}): {x: number; y: number} | null {
  const hw = w / 2; let c = guess, found = false;
  for (const [rx, ry] of [[w, h], [60, 34], [48, 26]]) { let sx = 0, sy = 0, s = 0;
    for (let i = 0; i < lip.length; i++) { if (lip[i] <= 0.5) continue; const x = 2 * (i % hw) + 1, y = 2 * ((i / hw) | 0) + 1; if (Math.abs(x - c.x) > rx || Math.abs(y - c.y) > ry) continue; sx += x; sy += y; s++; }
    if (s < 12) break; c = {x: sx / s, y: sy / s}; found = true; }
  return found ? c : null;
}
/** The mean colour of the lip pixels of a window (near the lips' middle): what the drawn lips are moved toward, or from. */
export function lipTone(p: Planes, lip: Float32Array, w: number, middle: {x: number; y: number}): {y: number; u: number; v: number; n: number} {
  const hw = w / 2; let y = 0, u = 0, v = 0, n = 0;
  for (let i = 0; i < lip.length; i++) { if (lip[i] <= 0.5) continue; const cx = i % hw, cy = (i / hw) | 0; if (Math.abs(2 * cx + 1 - middle.x) > 48 || Math.abs(2 * cy + 1 - middle.y) > 26) continue; y += p.Y[2 * cy * w + 2 * cx]; u += p.U[i]; v += p.V[i]; n++; }
  return {y, u, v, n};
}
const bilinear = (a: Float32Array, w: number, h: number, x: number, y: number) => { const xf = Math.min(w - 1.001, Math.max(0, x)), yf = Math.min(h - 1.001, Math.max(0, y)), xi = xf | 0, yi = yf | 0, tx = xf - xi, ty = yf - yi, i = yi * w + xi; return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + w] * (1 - tx) + a[i + w + 1] * tx) * ty; };
const eased = (r: number, whole: number) => r <= whole ? 1 : r >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (r - whole) / (1 - whole));
/**
 * Lays the drawn mouth into the film's frame, in place: the drawn window moved down `drop` pixels at her lip line (the recipe's
 * when nothing is said; mouthDrop gives it per frame) and made larger around the lips' middle when the recipe says so, its lips' colour moved by `shift`, sharpened, and laid in through the ellipse around the middle. win is the window in the film's pixels, middle
 * her lips' middle in the window, drawn the same window cut out of the renderer's frame. Outside the ellipse the frame is not touched.
 */
export function layMouth(film: Uint8Array, drawn: Planes, win: Box, middle: {x: number; y: number}, shift: {y: number; u: number; v: number}, lips: Lips = LIPS, b: Bridge = BRIDGE, drop: number = lips.drop): void {
  const W = b.film.width, H = b.film.height, {w, h} = win, hw = w / 2, hh = h / 2, [gx, gy] = lips.grow, [rx, ry] = lips.reach;
  const line = lips.under === null ? null : lipLine(film, win, middle, b), lineAt = (x: number) => line ? line[Math.min(w - 1, Math.max(0, Math.round(x)))] : middle.y;
  const fallen = (x: number, y: number) => { if (!drop) return 0; const u = (y - lineAt(x)) / lips.fall; return drop * (u <= 0 ? 1 : u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u)); };
  const from = (x: number, y: number): [number, number] => { const t = eased(Math.hypot((x - middle.x) / gx, (y - middle.y) / gy) / 1.8, 1 / 1.8); return [middle.x + (x - middle.x) / (1 + (lips.wide - 1) * t), middle.y + (y - middle.y) / (1 + (lips.tall - 1) * t) - fallen(x, y)]; };
  const Y = new Float32Array(w * h), U = new Float32Array(hw * hh), V = new Float32Array(hw * hh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [sx, sy] = from(x, y); Y[y * w + x] = bilinear(drawn.Y, w, h, sx, sy); }
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { const [sx, sy] = from(2 * x + 0.5, 2 * y + 0.5); U[y * hw + x] = bilinear(drawn.U, hw, hh, (sx - 0.5) / 2, (sy - 0.5) / 2); V[y * hw + x] = bilinear(drawn.V, hw, hh, (sx - 0.5) / 2, (sy - 0.5) / 2); }
  if (lips.colour > 0) { const lip = lipMap(V);
    for (let i = 0; i < lip.length; i++) { U[i] += lips.colour * shift.u * lip[i]; V[i] += lips.colour * shift.v * lip[i]; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Y[y * w + x] += lips.colour * shift.y * lip[(y >> 1) * hw + (x >> 1)]; }
  if (lips.sharpen > 0) { const src = Float32Array.from(Y); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, blur = (4 * src[i] + 2 * (src[i - 1] + src[i + 1] + src[i - w] + src[i + w]) + src[i - w - 1] + src[i - w + 1] + src[i + w - 1] + src[i + w + 1]) / 16; Y[i] = src[i] + lips.sharpen * (src[i] - blur); } }
  const below = (x: number, y: number) => { if (!line) return 1; const t = Math.min(1, Math.max(0, (y - (lineAt(x) - lips.under!)) / 4)); return t * t * (3 - 2 * t); };
  const half = lips.corners === null ? null : lipsHalf(lipMap(cutPlanes(film, W, H, win.x, win.y, w, h).V), w, middle), edge = half === null ? null : half + lips.corners!;
  const inside = (x: number) => { if (edge === null) return 1; const d = Math.abs(x - middle.x); return d <= edge - 10 ? 1 : d >= edge ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (d - (edge - 10)) / 10); };
  const mask = (x: number, y: number) => eased(Math.hypot((x - middle.x) / rx, (y - middle.y - 4) / ry), 0.7) * below(x, y) * inside(x), byte = (v: number) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v), cw = W / 2, u0 = W * H, v0 = u0 + cw * (H / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const m = mask(x, y); if (m > 0) { const i = (win.y + y) * W + win.x + x; film[i] = byte(film[i] + (Y[y * w + x] - film[i]) * m); } }
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { const m = mask(2 * x + 0.5, 2 * y + 0.5); if (m > 0) { const i = (win.y / 2 + y) * cw + win.x / 2 + x; film[u0 + i] = byte(film[u0 + i] + (U[y * hw + x] - film[u0 + i]) * m); film[v0 + i] = byte(film[v0 + i] + (V[y * hw + x] - film[v0 + i]) * m); } }
}
