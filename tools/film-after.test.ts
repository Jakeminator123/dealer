// Tests for the after-work of a delivered film (src/film-after.ts) and the command that writes after.mp4 beside it
// (tools/film-after.ts). The pure parts run on small made-up frames (BGR, as OpenCV holds them); the command on a tiny order that
// FFmpeg makes in a temporary folder, skipped where there is no FFmpeg (the hosted check has none). That the port gives tonight's
// frames was shown on the real deliveries (byte-identical after.mp4 for WAN 3 and the 4K film), not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {cvRound, areaEighth, areaResize, erode, dilate, gaussianKernel, gaussianBlur, resizeLinear, resizeCubic, smoothGreen, toneLock, levelFrame, cornerMean, components,
  edgeCheck, endCheck, filmMeasure, cardBlobs, seam, TREATMENTS, BANK, NO_TONE, round, npRound} from '../src/film-after.ts';
import {readFlags, rateText, sameShape, afterWork, Refused} from './film-after.ts';

const W = 64, H = 48, GREEN = [50, 255, 20], ANCHOR = [44, 237, 0], SKIN = [120, 150, 220];
/** A frame: the green screen with a person block (a gentle gradient, so that her tone has a spread). BGR. */
function frame({w = W, h = H, green = GREEN, at = 12, lift = 0}: {w?: number; h?: number; green?: number[]; at?: number; lift?: number} = {}): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, person = x >= at && x < at + 24 && y >= 10 && y < 44;
    const c = person ? [SKIN[0] + (y >> 2) + lift, SKIN[1] + (x - at) + lift, SKIN[2] - (y >> 3) + lift] : green;
    for (let k = 0; k < 3; k++) out[i + k] = Math.max(0, Math.min(255, c[k]));
  }
  return out;
}
const px = (d: Uint8Array, x: number, y: number, w = W) => Array.from(d.slice((y * w + x) * 3, (y * w + x) * 3 + 3));
const fill = (w: number, h: number, bgr: number[]) => { const d = new Uint8Array(w * h * 3); for (let i = 0; i < d.length; i += 3) d.set(bgr, i); return d; };

test('OpenCV rounding and the area mean at an eighth: halves to even, the part blocks at the far edges averaged over what lies inside', () => {
  assert.deepEqual([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(cvRound), [0, 2, 2, 4, 2, 3]);
  assert.deepEqual([round(42.45, 1), npRound(42.45, 1)], [42.5, 42.4]);   // Python's round and NumPy's .round(1) part on a half (paow-giv-2-1-p4-14's green)
  // 20 × 12, one channel: two blocks across (cvRound(2.5) = 2; columns 16–19 are left out as OpenCV does), two down (rows 8–11 a part block).
  const w = 20, h = 12, src = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = y >= 8 ? 7 : x < 8 ? (y < 4 ? 2 : 3) : (y < 4 ? 3 : 4);
  const small = areaEighth(src, w, h, 1);
  assert.deepEqual([small.width, small.height], [2, 2]);
  assert.deepEqual(Array.from(small.data), [2, 4, 7, 7]);   // 2.5 → 2 and 3.5 → 4; the part blocks average 32 pixels
  // The quarter frame of filmmatt.py (not a whole number down): a flat picture stays flat.
  assert.deepEqual(new Set(areaResize(fill(17, 11, [10, 20, 30]), 17, 11, 4, 2)), new Set([10, 20, 30]));
});

test('erosion leaves the picture\'s edge alone, dilation reaches nothing outside', () => {
  const m = new Uint8Array(25).fill(1); m[12] = 0;
  assert.deepEqual(Array.from(erode(m, 5, 5, 3)), [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  const d = new Uint8Array(25); d[0] = 1;
  assert.deepEqual(Array.from(dilate(d, 5, 5, 3)).map((v, i) => v ? i : -1).filter(i => i >= 0), [0, 1, 5, 6]);
});

test('the Gaussian blur: an 8σ+1 kernel that sums to one, a flat picture stays flat, a point spreads evenly', () => {
  const k = gaussianKernel(65, 8);
  assert.equal(k.length, 65); assert.ok(Math.abs(k.reduce((s, v) => s + v, 0) - 1) < 1e-6); assert.equal(k[0], k[64]); assert.ok(k[32] > k[31]);
  const flat = gaussianBlur(new Float32Array(30 * 20 * 3).fill(100), 30, 20, 3, 2);
  assert.ok(flat.every(v => Math.abs(v - 100) < 1e-3));
  const point = new Float32Array(21 * 21); point[10 * 21 + 10] = 1;
  const spread = gaussianBlur(point, 21, 21, 1, 1.2);
  assert.ok(Math.abs(spread[10 * 21 + 7] - spread[10 * 21 + 13]) < 1e-7 && Math.abs(spread[7 * 21 + 10] - spread[13 * 21 + 10]) < 1e-7);
});

test('scaling: bilinear with the edges held, bicubic that keeps a flat picture and is the identity at the same size', () => {
  assert.deepEqual(Array.from(resizeLinear(Float32Array.from([0, 10]), 2, 1, 1, 4, 1)), [0, 2.5, 7.5, 10]);
  const src = new Uint8Array(9 * 7 * 3).map((_, i) => (i * 37) % 256);
  assert.deepEqual(resizeCubic(src, 9, 7, 9, 7), src);
  assert.ok(resizeCubic(fill(16, 12, [44, 237, 0]), 16, 12, 8, 6).every((v, i) => v === [44, 237, 0][i % 3]));
  assert.equal(resizeCubic(fill(16, 10, [1, 2, 3]), 16, 10, 16, 11).length, 16 * 11 * 3);   // Kling 4: rows 1172 → 1174
});

test('the smooth green carries the screen\'s green around her, and the level brings the screen to the anchor without touching her', () => {
  const f = frame(), field = smoothGreen(f, W, H);
  for (const [x, y] of [[2, 2], [20, 25], [60, 40]]) for (let c = 0; c < 3; c++) assert.ok(Math.abs(field[(y * W + x) * 3 + c] - GREEN[c]) < 0.5, `field at ${x},${y}`);
  const out = levelFrame(f, smoothGreen(fill(W, H, ANCHOR), W, H), W, H);
  assert.deepEqual(px(out, 2, 2), ANCHOR); assert.deepEqual(px(out, 60, 40), ANCHOR);
  assert.deepEqual(px(out, 20, 25), px(f, 20, 25));          // her pixels are not repainted
  // With a tone, her pixels get gain and lift; the screen still gets the anchor's green.
  const toned = levelFrame(f, smoothGreen(fill(W, H, ANCHOR), W, H), W, H, {gain: [1, 1, 1], lift: [4, 4, 4]});
  assert.deepEqual(px(toned, 20, 25), px(f, 20, 25).map(v => v + 4)); assert.deepEqual(px(toned, 2, 2), ANCHOR);
});

test('the tone lock measures her in the start picture against the first frame: one gain and one lift per channel', () => {
  const t = toneLock(frame({lift: 4}), frame(), W, H);
  assert.ok(t.pixels > 300);
  t.gain.forEach(g => assert.ok(Math.abs(g - 1) < 1e-4)); t.lift.forEach(l => assert.ok(Math.abs(l - 4) < 1e-3));
  assert.deepEqual(NO_TONE, {gain: [1, 1, 1], lift: [0, 0, 0]});
});

test('the treatment follows the model, as tonight\'s orders ran it', () => {
  assert.deepEqual([TREATMENTS.wan3.cutTail, TREATMENTS.wan3.lock], [2, true]);
  assert.deepEqual([TREATMENTS['kling-4'].cutTail, TREATMENTS['kling-4'].lock], [0, false]);
  assert.deepEqual([TREATMENTS['kling-3-4k'].cutTail, TREATMENTS['kling-3-4k'].lock], [0, true]);
  assert.deepEqual(cornerMean(fill(100, 100, [44, 237, 0]), 100, 100), [0, 237, 44]);   // printed R, G, B
});

test('connected groups in the order of their first pixel, corners joining', () => {
  const w = 6, m = new Uint8Array([1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1]);
  const {blobs, labels} = components(m, w, 3);
  assert.equal(blobs.length, 2);
  assert.deepEqual(blobs.map(b => [b.area, b.left, b.top, b.width, b.height]), [[2, 0, 0, 2, 2], [5, 3, 0, 3, 3]]);
  assert.equal(labels[7], 1);
});

test('the edge check: dark green above the table edge is counted, and where the body ends', () => {
  const {width: w, height: h} = BANK, im = fill(w, h, [44, 237, 0]);
  for (let y = 300; y < 831; y++) for (let x = 600; x < 1150; x++) im.set([40, 40, 40], (y * w + x) * 3);           // her body, down to row 830
  for (let y = 700; y < 710; y++) for (let x = 200; x < 220; x++) im.set([40, 220, 0], (y * w + x) * 3);          // a shadow on the green, 17 levels dark
  const e = edgeCheck(im, w, h);
  assert.deepEqual(e.green, [0, 237, 44]); assert.equal(e.darkGreenPixelsAboveEdge, 200);
  assert.deepEqual(e.blobs[0], {box: [200, 700, 220, 710], pixels: 200, deepest: 17});
  assert.equal(e.bodyEnds!.median, 830); assert.deepEqual(e.betweenHands, {min: 830, median: 830, max: 830});
});

test('the end check: a film that ends in its end picture has no change and no difference at the end', () => {
  const end = frame(), check = endCheck(end, W, H);
  for (let i = 0; i < 12; i++) check.add(i < 3 ? frame({at: 10 + i}) : end);
  const r = check.result();
  assert.equal(r.frames, 12); assert.deepEqual(r.toEndPictureLast8, new Array(8).fill(0)); assert.deepEqual(r.changePerFrameLast8, new Array(8).fill(0));
  assert.equal(r.largestChangeAnywhere[1] <= 3, true);
});

test('filmmatt\'s pixel half: frozen frames, the green, a yellow card and the seams', () => {
  const m = filmMeasure(W, H, 30), card = (f: Uint8Array) => { const g = f.slice(); for (let y = 2; y < 8; y++) for (let x = 40; x < 50; x++) g.set([20, 200, 220], (y * W + x) * 3); return g; };
  m.add(frame()); m.add(frame()); m.add(card(frame({at: 14}))); m.add(card(frame({at: 16})));
  const r = m.result();
  assert.equal(r.frameCount, 4); assert.deepEqual(r.frozenAt, [1]); assert.equal(r.bankFormat, false);
  assert.deepEqual(r.green.topFirst, [20, 255, 50]);
  assert.equal(r.card.yellowFrames, 2); assert.equal(r.card.firstYellow, 2);
  assert.equal(cardBlobs(card(frame()), W, H)[0].c, 'Y');
  assert.deepEqual(seam(frame(), frame()), {meanDiff: 0, pixelsOver24: 0, shareOver24: 0});
});

test('the flags: the cases the scripts had, a typo refused; the rate as the script wrote it; the shape check', () => {
  assert.deepEqual(readFlags(['--keep-tail', '--fps', '24', '--lock']), {cut: 0, fps: '24', lock: true});
  assert.deepEqual(readFlags(['--cut', '2', '--no-lock', '--seats', 'P1.C1,P4.C1']), {cut: 2, lock: false, seats: ['P1.C1', 'P4.C1']});
  assert.throws(() => readFlags(['--keeptail']), Refused); assert.throws(() => readFlags(['--cut', '5']), /0–3/); assert.throws(() => readFlags(['--fps']), /värde/);
  assert.deepEqual(['30/1', '24/1', '30000/1001'].map(rateText), ['30', '24', '30000/1001']);
  assert.ok(sameShape(1764, 1172, 1764, 1174) && sameShape(3528, 2348, 1764, 1174) && !sameShape(3840, 2160, 1764, 1174));
});

// The command on a tiny order; skipped where there is no FFmpeg.
const needsFfmpeg = {skip: spawnSync('ffmpeg', ['-version'], {stdio: 'ignore'}).status !== 0 && 'ffmpeg is not on this machine (the hosted check has none)'};
async function tinyOrder(root: string, id: string, model: string, w: number, h: number, frames: number) {
  const dir = path.join(root, 'assets', 'orders', id), take = path.join(dir, 'take-1'), {width: BW, height: BH} = BANK;
  await mkdir(take, {recursive: true}); await mkdir(path.join(root, 'data', 'orders'), {recursive: true});
  const png2 = async (file: string) => { const d = Buffer.alloc(BW * BH * 3); for (let p = 0; p < BW * BH; p++) { const x = p % BW, y = Math.floor(p / BW), person = x > 600 && x < 1100 && y > 300 && y < 830; d.set(person ? [200, 112, 94] : [ANCHOR[2], ANCHOR[1], ANCHOR[0]], p * 3); } await sharp(d, {raw: {width: BW, height: BH, channels: 3}}).png().toFile(file); };
  await png2(path.join(dir, 'first.png')); await png2(path.join(dir, 'last.png'));
  const raw = Buffer.alloc(w * h * 3 * frames);
  for (let f = 0; f < frames; f++) for (let p = 0; p < w * h; p++) { const x = p % w, y = Math.floor(p / w), person = x > 600 && x < 1100 && y > 300 && y < 830; raw.set(person ? [90 - f, 110, 200] : [20, 255, 50], (f * w * h + p) * 3); }
  const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', `${w}x${h}`, '-r', '30', '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(take, 'source.mp4')], {input: raw});
  assert.equal(made.status, 0, String(made.stderr));
  await writeFile(path.join(root, 'data', 'orders', `${id}.json`), JSON.stringify({schemaVersion: 1, id, dealer: 'test', kind: 'FILM', takes: 1, generation: {model},
    pictures: [{name: 'first.png', goesAs: 'startFrame', path: `assets/orders/${id}/first.png`, sha256: null}, {name: 'last.png', goesAs: 'endFrame', path: `assets/orders/${id}/last.png`, sha256: null}], motion: {target: 'P1.C1'}}));
  return {take, source: path.join(take, 'source.mp4')};
}
const shaOf = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');

test('the command: WAN 3 loses its two last frames, the screen gets the anchor\'s green, the original is untouched and nothing is written twice', needsFfmpeg, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'film-after-'));
  try {
    const {take, source} = await tinyOrder(root, 'test-wan-01', 'wan3', BANK.width, BANK.height, 5), before = await shaOf(source);
    const {record} = await afterWork('test-wan-01', 1, {}, root) as {record: Record<string, any>};
    assert.ok(existsSync(path.join(take, 'after.mp4')) && existsSync(path.join(take, 'after.json')));
    assert.deepEqual([record.output.frames, record.output.width, record.output.height, record.output.audio, record.output.dropped], [3, BANK.width, BANK.height, false, [3, 4]]);
    assert.equal(record.treatment.lock, true); assert.equal(await shaOf(source), before); assert.equal(record.source.sha256After, before);
    record.efterarbete.greenAfter.last.forEach((v: number, k: number) => assert.ok(Math.abs(v - [0, 237, 44][k]) <= 1.5, `green ${record.efterarbete.greenAfter.last}`));
    assert.ok(record.slutkoll.after && record.kantkoll.lastFrame && record.filmmatt.landing);
    await assert.rejects(afterWork('test-wan-01', 1, {}, root), /finns redan/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('the command: Kling 4\'s 1172 rows are scaled to the bank\'s 1174 and every frame kept; a 16:9 delivery is refused', needsFfmpeg, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'film-after-'));
  try {
    await tinyOrder(root, 'test-kling-01', 'kling-4', BANK.width, 1172, 3);
    const {record} = await afterWork('test-kling-01', 1, {out: path.join(root, 'trial')}, root) as {record: Record<string, any>};
    assert.deepEqual([record.output.frames, record.output.height, record.treatment.cutTail, record.treatment.lock, record.treatment.scaledFrom], [3, BANK.height, 0, false, [BANK.width, 1172]]);
    assert.ok(!existsSync(path.join(root, 'assets', 'orders', 'test-kling-01', 'take-1', 'after.mp4')));   // --out: nothing beside the original
    await tinyOrder(root, 'test-wide-01', 'kling-4', 640, 360, 2);
    await assert.rejects(afterWork('test-wide-01', 1, {}, root), /inte första bildens form/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
