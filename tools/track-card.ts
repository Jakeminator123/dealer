// Follows the coloured tracking card (yellow back, blue face) through one clip and writes, per frame,
// the visible side, the card quad in texture order, the edge-on line and a confidence.
//   node tools/track-card.ts <clip-id> [--overlay <out.mp4>] [--kind DEAL|RETURN|OTHER]
// The kind of film (a deal, a return, or a film without a dealt card) is read from data/clip-jobs.json unless given.
// Reads assets/motions/<clip-id>/source.mp4, writes assets/tracking/<clip-id>/card-track.json and receipt.json.
// --overlay also writes the clip with the tracked outline drawn on it, for checking by eye.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {classify, paleMask, persistent, follower, buildTrack, settleRaws, blobs, morph, YELLOW, BLUE, TABLE, EDGE_THICKNESS, MIN_AREA, type Raw, type Pt, type FilmKind} from '../src/card-track.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
const id = process.argv[2], overlayAt = process.argv.indexOf('--overlay'), overlay = overlayAt > 0 ? process.argv[overlayAt + 1] : null;
if (!id || !/^[a-z0-9-]+$/.test(id) || (overlayAt > 0 && !overlay)) throw Error('Usage: track-card.ts <clip-id> [--overlay <out.mp4>]');
const video = `assets/motions/${id}/source.mp4`, dir = `assets/tracking/${id}`;
// What the film is decides what can be in it. A clip cut into several takes, or one the job file does not know, is followed as before.
function kindOf(clip: string): FilmKind | null {
  const file = existsSync('data/clip-jobs.json') ? JSON.parse(readFileSync('data/clip-jobs.json', 'utf8')) : {}, edit = (file.edits ?? []).find((e: {id: string}) => e.id === clip);
  if (edit?.source?.clip) return kindOf(edit.source.clip);
  const kinds = [...new Set([...(file.jobs ?? []), ...(file.derived ?? [])].filter((e: {id: string; clip?: string}) => (e.clip ?? e.id) === clip).map((e: {kind?: string; from?: string; to?: string}) =>
    e.kind === 'DEAL' || e.kind === 'REVEAL' ? 'DEAL' : e.kind === 'RETURN' && /(?:P[1-7]|D)\.C[1-3]/.test(String(e.from)) ? 'RETURN' : 'OTHER'))];
  // A film cut into a deal and the return after it is a deal as a whole: the card turns once and then lies. The turn of the
  // hole card is the same thing to follow, a card that turns once and then lies; it only starts on the table instead of in the shoe.
  return kinds.includes('DEAL') ? 'DEAL' : kinds.length === 1 ? kinds[0] as FilmKind : null;
}
const kindAt = process.argv.indexOf('--kind'), kind: FilmKind | null = kindAt > 0 ? process.argv[kindAt + 1] as FilmKind : kindOf(id);
const env = existsSync('D:/dealer-scratch/tmp') ? {...process.env, TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'} : process.env;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg', ffprobe = process.env.FFPROBE ?? 'ffprobe';
const info = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', video], {env}).toString()).streams[0];
const W: number = info.width, H: number = info.height, N = W * H, fps: string = info.r_frame_rate;

async function* frames(file: string): AsyncGenerator<Buffer> {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, env});
  let frame = Buffer.allocUnsafe(N * 3), filled = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
    while (at < chunk.length) { const take = Math.min(chunk.length - at, frame.length - filled); chunk.copy(frame, filled, at, at + take); filled += take; at += take;
      if (filled === frame.length) { yield frame; frame = Buffer.allocUnsafe(N * 3); filled = 0; } } }
}

// Pass 1: which pixels are yellow through most of the clip? That is the card seated in the shoe window.
// And which are pale through half of it? That is her blouse, a rim or a highlight, never a card on its way.
const counts = new Uint16Array(N), blues = new Uint16Array(N), pales = new Uint16Array(N); let total = 0;
for await (const frame of frames(video)) { const cls = classify(frame, N), pale = paleMask(frame, N); for (let i = 0; i < N; i++) { if (cls[i] === YELLOW) counts[i]++; else if (cls[i] === BLUE) blues[i]++; if (pale[i]) pales[i]++; } total++; }
if (!total) throw Error(`No frames decoded from ${video}.`);
const shoe = persistent(counts, total), shoeBlob = blobs(shoe, W, H, 400)[0] ?? null;

// Pass 2: the card in every frame, each finding steering where the next one is looked for.
// In a deal, blue that is there in nine frames of ten is a card that lay on the table before this one was dealt: it is not the
// moving card and is taken out of the picture (in eight frames of ten, since a hand passes over it). A film without a dealt card (entry, idle, exit) has nothing to follow.
const lying = kind === 'DEAL' ? morph(Uint8Array.from(blues, count => count >= 0.8 * total ? 1 : 0), W, H, 4, true) : null, // with its pale rim
  lyingPixels = lying ? lying.reduce((sum, v) => sum + v, 0) : 0;
// In a deal the film may print or wash out the face it turns up; such a card is followed as a pale shape where the card was expected.
const stillPale = kind === 'DEAL' ? morph(persistent(pales, total, 0.5), W, H, 4, true) : null;
const step = follower(W, H, shoe), found: Raw[] = [], nothing: Raw = {side: 'NONE', corners: null, segment: null, area: 0, fill: 0, thickness: 0, shoeShare: 0, note: 'no dealt card in this kind of film'};
for await (const frame of frames(video)) { if (kind === 'OTHER') { found.push(nothing); continue; }
  const cls = classify(frame, N); if (lyingPixels) for (let i = 0; i < N; i++) if (lying![i]) cls[i] = TABLE;
  const pale = stillPale ? paleMask(frame, N) : null; if (pale) for (let i = 0; i < N; i++) if (stillPale![i] || lying?.[i]) pale[i] = 0;
  found.push(step(cls, pale)); }
const raws = kind ? settleRaws(found, kind) : found, track = buildTrack(raws);

const sha256 = createHash('sha256').update(await readFile(video)).digest('hex');
const out = {schemaVersion: 1, clip: id, kind, source: {path: video, sha256}, width: W, height: H, fps, frameCount: total,
  quadOrder: 'Texture order of the visible side: top left, top right, bottom right, bottom left of that side\'s artwork; clockwise on screen. The first side is anchored on its first frame, later sides on their last frame (the card at rest).',
  flipsNote: 'quarterTurns: how far the anchored orientation after the edge-on moment differs from a rigid card that simply turned over. Non-zero means the film changes the proportions of the card there, and the rendered card re-seats while it is a line.',
  edgeOrder: 'Edge-on frames have a line instead of a quad. Its direction continues the length of the last quad before it: from the end with that quad\'s corners 0 and 1 (0 and 3 if the card turns about its short axis) to the opposite end.',
  shoeWindow: shoeBlob && {box: [shoeBlob.x0, shoeBlob.y0, shoeBlob.x1, shoeBlob.y1], pixels: shoeBlob.area, rule: 'yellow in at least 60 % of the frames'},
  edgeWindow: track.edgeWindow, flips: track.flips, leavesShoe: track.leavesShoe, restFrom: track.restFrom, restQuad: track.restQuad?.map(p => [p.x, p.y]) ?? null,
  frames: track.frames.map(f => ({frame: f.frame, side: f.side, quad: f.quad?.map(p => [p.x, p.y]) ?? null, edge: f.edge?.map(p => [p.x, p.y]) ?? null, area: f.area, confidence: f.confidence, ...(f.shoeShare ? {shoeShare: f.shoeShare} : {}), ...(f.note ? {note: f.note} : {})}))};
const body = JSON.stringify(out).replace(/\{"frame"/g, '\n{"frame"').replace(/\]\}$/, '\n]}') + '\n';
await mkdir(dir, {recursive: true});
await writeFile(`${dir}/card-track.json`, body);
const r2 = (v: number) => Math.round(v * 100) / 100, jitter = track.restJitter;
const receipt = {schemaVersion: 1, clip: id, createdAt: new Date().toISOString(), tool: 'tools/track-card.ts', source: {path: video, sha256, width: W, height: H, fps, frameCount: total},
  rules: {yellow: 'r>95 && g>95 && g>0.82r && r>0.6g && b<0.45*min(r,g)', blue: 'b>90 && b>1.5r && b>1.15g', pale: 'r,g,b>150 && max-min<60; only in a deal, only where the card was expected, never where pale in half the frames', paleFrames: found.filter(r => /pale/.test(r.note)).length, edgeOnBelowThicknessPx: EDGE_THICKNESS, minCardPixels: MIN_AREA, shoeCard: 'persistent yellow; ignored unless the track continues out of it', filmKind: kind, lyingCardPixelsIgnored: lyingPixels, settled: raws.filter((r, i) => r.note !== found[i].note).length},
  ranges: track.ranges, edgeWindow: track.edgeWindow, flips: track.flips, leavesShoe: track.leavesShoe, restFrom: track.restFrom,
  stability: jitter && {restFrames: jitter.frames, clearRestFrames: jitter.clearFrames, rawCornerOffsetMeanPx: r2(jitter.rawMean), rawCornerOffsetMaxPx: r2(jitter.rawMax), clearCornerOffsetMeanPx: r2(jitter.clearMean), clearCornerOffsetMaxPx: r2(jitter.clearMax), note: 'Distance of each found corner from the locked resting quad, before locking. Clear = frames where the card is not covered.'},
  lowConfidenceFrames: track.lowConfidence, output: {path: `${dir}/card-track.json`, sha256: createHash('sha256').update(body).digest('hex'), bytes: Buffer.byteLength(body)}};
await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');

if (overlay) { // the source frames with the tracked outline: corner 0 white, side 0-1 thick
  const colour: Record<string, number[]> = {BACK: [255, 0, 255], FRONT: [255, 60, 0], EDGE: [255, 255, 255]};
  const enc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', fps, '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', overlay], {stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true, env});
  const done = new Promise<void>((resolve, reject) => { enc.on('error', reject); enc.on('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg ${code}`))); });
  const line = (px: Buffer, a: Pt, b: Pt, c: number[], half: number) => { const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) || 1;
    for (let s = 0; s <= steps; s++) { const cx = Math.round(a.x + (b.x - a.x) * s / steps), cy = Math.round(a.y + (b.y - a.y) * s / steps);
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < W && y < H) { px[(y * W + x) * 3] = c[0]; px[(y * W + x) * 3 + 1] = c[1]; px[(y * W + x) * 3 + 2] = c[2]; } } } };
  let k = 0;
  for await (const frame of frames(video)) { const f = track.frames[k++];
    if (f?.quad) { for (let e = 0; e < 4; e++) line(frame, f.quad[e], f.quad[(e + 1) % 4], colour[f.side], e === 0 ? 1 : 0); line(frame, f.quad[0], f.quad[0], [255, 255, 255], 2); }
    else if (f?.edge) line(frame, f.edge[0], f.edge[1], colour.EDGE, 0);
    if (!enc.stdin.write(frame)) await new Promise(resolve => enc.stdin.once('drain', resolve)); }
  enc.stdin.end(); await done;
}
console.log(JSON.stringify({clip: id, frames: total, ranges: track.ranges, edgeWindow: track.edgeWindow, flips: track.flips, leavesShoe: track.leavesShoe, restFrom: track.restFrom, stability: receipt.stability, lowConfidenceFrames: track.lowConfidence, track: receipt.output.path, overlay}));
