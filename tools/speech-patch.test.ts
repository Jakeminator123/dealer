// The mouth patch's contract (src/speech-patch.ts) and its writer (tools/speech-patch.ts), without any film or page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cellAt, cellOf, cellRgb, fitsPart, maskAt, patchProblems, patchRange, placeLines, readWav, rgb709, stripLayout, wavBytes, type MouthPatch} from '../src/speech-patch.ts';
import {featherMask} from '../src/speech-plan.ts';
import {createStrip, writePatch} from './speech-patch.ts';

test('the strip is as square as it can be and no side is over 4096', () => {
  assert.deepEqual(stripLayout(65, 184, 176), {columns: 8, rows: 9, width: 1472, height: 1584});
  assert.deepEqual(stripLayout(1, 184, 176), {columns: 1, rows: 1, width: 184, height: 176});
  const big = stripLayout(400, 184, 176); assert.ok(big.width <= 4096 && big.height <= 4096 && big.columns * big.rows >= 400);
  assert.throws(() => stripLayout(2000, 184, 176), /strip_too_large/);
  assert.deepEqual(cellAt(9, 8, 184, 176), {x: 184, y: 176});
});

test('a patch keeps the frames from the first weight above 0 to the last', () => {
  assert.deepEqual(patchRange([0, 0, 0.26, 1, 0, 1, 0.26, 0]), {first: 2, count: 5});
  assert.equal(patchRange([0, 0, 0]), null);
  assert.equal(cellOf({first: 10, count: 65}, 9), -1); assert.equal(cellOf({first: 10, count: 65}, 10), 0); assert.equal(cellOf({first: 10, count: 65}, 75), -1);
});

test('the edge is the speech tool\'s featherMask at every pixel centre', () => {
  const w = 40, h = 30, feather = 8, mask = featherMask(w, h, feather);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.ok(Math.abs(maskAt(x + 0.5, y + 0.5, w, h, feather) - mask[y * w + x]) < 1e-6);
});

test('a sample of BT.709 limited range as RGB', () => {
  assert.deepEqual(rgb709(16, 128, 128), [0, 0, 0]); assert.deepEqual(rgb709(235, 128, 128), [255, 255, 255]); assert.deepEqual(rgb709(126, 128, 128), [128, 128, 128]);
  const [r, g, b] = rgb709(81, 90, 240); assert.ok(r > 200 && g < 40 && b < 40, 'a strong red: Cr high, Cb low');
});

test('a cell is its frame\'s box turned to RGB, the colour read between its samples', () => {
  const W = 8, H = 4, frame = new Uint8Array(W * H * 3 / 2); frame.fill(120, 0, W * H); frame.fill(128, W * H);
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) frame[W * H + W * H / 4 + y * W / 2 + x] = x < 2 ? 128 : 200; // Cr steps between colour columns 1 and 2
  const out = new Uint8Array(W * H * 3); cellRgb(frame, W, H, 0, 0, W, H, out, W);
  const red = (x: number) => out[x * 3];
  assert.equal(red(0), rgb709(120, 128, 128)[0]); assert.equal(red(7), rgb709(120, 128, 200)[0]);
  // centred colour: luma columns 3 and 4 lie a quarter and three quarters of the way from colour column 1 to 2
  assert.equal(red(3), rgb709(120, 128, 146)[0]); assert.equal(red(4), rgb709(120, 128, 182)[0]);
  const left = new Uint8Array(W * H * 3); cellRgb(frame, W, H, 0, 0, W, H, left, W, 0, 0, 'left');
  assert.equal(left[3 * 3], rgb709(120, 128, 164)[0]); assert.equal(left[4 * 3], rgb709(120, 128, 200)[0]);
  assert.throws(() => cellRgb(frame, W, H, 4, 0, 6, 2, out, W), /box_outside_frame/);
});

test('the sound file is 16-bit PCM WAV and reads back', () => {
  const pcm = new Uint8Array(new Int16Array([0, 16384, -16384, 32767]).buffer), wav = wavBytes(pcm, 24000);
  assert.equal(wav.length, 44 + 8); const back = readWav(wav);
  assert.equal(back.rate, 24000); assert.equal(back.channels, 1); assert.equal(back.samples, 4); assert.deepEqual([...back.data[0]].map(v => Math.round(v * 32768)), [0, 16384, -16384, 32767]);
  assert.throws(() => readWav(new Uint8Array(20)), /not_wav/);
});

const film = {id: 'paow-ingang-2-1-02-01', path: 'assets/motions/paow-ingang-2-1-02-01/source.mp4', sha256: 'e'.repeat(64), fps: 24, frames: 97, width: 1764, height: 1174};
const patchOf = (over: Partial<MouthPatch> = {}): MouthPatch => ({schemaVersion: 1, kind: 'mouth-patch', id: 'paow-mun-goodluck-sv-ingang-2-1-02-01', dealer: 'paow', film,
  line: {key: 'goodluck', language: 'sv', text: 'Lycka till vid mitt bord!', voice: 'Paow'}, box: {x: 768, y: 208, w: 184, h: 176}, feather: 24, first: 10, count: 65, weights: [0.259, ...new Array(63).fill(1), 0.259],
  strip: {path: 'mouth.webp', type: 'image/webp', lossless: true, columns: 8, rows: 9, width: 1472, height: 1584, colour: 'bt709-tv', sha256: 'a'.repeat(64)},
  sound: {path: 'line.wav', type: 'audio/wav', rate: 24000, channels: 1, samples: 65118, startsAtSeconds: 0.4, endsAtSeconds: 3.11325, sha256: 'b'.repeat(64)},
  made: {by: 'test', at: '2026-11-13T00:00:00Z', from: {path: 'worker.mp4', sha256: 'c'.repeat(64)}}, ...over});

test('a record that holds the contract has no problems, and one that does not says why', () => {
  assert.deepEqual(patchProblems(patchOf()), []);
  assert.equal(patchProblems(patchOf({box: {x: 767, y: 208, w: 184, h: 176}})).length, 1);
  assert.equal(patchProblems(patchOf({weights: [0, ...new Array(64).fill(1)]})).length, 1);
  assert.equal(patchProblems(patchOf({strip: {...patchOf().strip, columns: 9}})).length, 1);
  assert.equal(patchProblems(patchOf({first: 40})).length, 1); // 40 + 65 frames is past the film's 97
  assert.equal(patchProblems(patchOf({sound: {...patchOf().sound, endsAtSeconds: 3.5}})).length, 1);
});

test('a line goes over the first film of the chain that has a patch for it, in time, one line a part', () => {
  const entry = patchOf(), deal = patchOf({id: 'paow-mun-goodluck-sv-giv-2-1-p4-04-01', film: {...film, id: 'paow-giv-2-1-p4-04-01', path: 'assets/motions/paow-giv-2-1-p4-04-01/source.mp4', frames: 169}, first: 15, count: 64, weights: [0.259, ...new Array(62).fill(1), 0.259], strip: {...patchOf().strip, columns: 8, rows: 8, width: 1472, height: 1408}});
  const double = patchOf({id: 'paow-mun-double-sv-ingang-2-1-02-01', line: {key: 'double', language: 'sv', text: 'Du dubblar.', voice: 'Paow'}});
  const chain = [{path: film.path, start: 0, end: null, fps: 24, frames: 97}, {path: deal.film.path, start: 0, end: 120, fps: 24, frames: 169}, {path: 'assets/motions/x/source.mp4', start: 0, end: 60, fps: 30}];
  assert.equal(fitsPart(entry, chain[0]), true); assert.equal(fitsPart(entry, {...chain[0], start: 11}), false); assert.equal(fitsPart(deal, {...chain[1], end: 70}), false);
  assert.deepEqual(placeLines(['goodluck'], chain, [deal, entry]).map(p => p && [p.part, p.patch.id]), [[0, entry.id]]);
  assert.deepEqual(placeLines(['goodluck'], chain, [deal]).map(p => p && [p.part, p.patch.id]), [[1, deal.id]]); // 97 / 24 + 0.6 s in: in time
  assert.deepEqual(placeLines(['goodluck'], chain, [deal], 4), [null]); // too late after a 4 s limit
  assert.deepEqual(placeLines(['goodluck', 'double'], chain, [entry, double]).map(p => p && p.part), [0, null]); // never two on one part
  assert.deepEqual(placeLines(['double', 'goodluck'], chain, [entry, double, deal]).map(p => p && p.part), [0, 1]);
  assert.deepEqual(placeLines(['nothing'], chain, [entry]), [null]);
});

test('writePatch writes a whole folder: a lossless strip, the sound and the record last', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'patch-')), W = 64, H = 48, box = {x: 8, y: 8, w: 16, h: 12};
  try {
    const weights = [0, 1, 0.5, 1, 0], strip = createStrip(box, weights)!, frame = new Uint8Array(W * H * 3 / 2);
    for (let k = 0; k < weights.length; k++) { frame.fill(40 + 30 * k, 0, W * H); frame.fill(128, W * H); strip.put(k, frame, W, H, box.x, box.y); }
    const record = await writePatch(dir, {id: 'paow-mun-test-sv-ingang-2-1-02-01', dealer: 'paow', film: {...film, width: W, height: H, frames: 5}, line: {key: 'test', language: 'sv', text: 'Prov.', voice: 'Paow'}, box: {...box, w: 16, h: 12}, feather: 4, weights,
      sound: {pcm: new Uint8Array(480), startsAtSeconds: 0.05}, made: {by: 'test', at: '2026-11-13T00:00:00Z', from: {path: 'x', sha256: 'd'.repeat(64)}}}, strip);
    assert.equal(record.first, 1); assert.equal(record.count, 3); assert.deepEqual(record.weights, [1, 0.5, 1]); assert.equal(record.sound.samples, 240);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'patch.json'), 'utf8')), record);
    assert.equal(readWav(new Uint8Array(await readFile(path.join(dir, 'line.wav')))).samples, 240);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
