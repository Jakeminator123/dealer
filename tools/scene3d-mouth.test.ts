// The mouth layer (src/scene3d-mouth.ts) without a browser: the page's parts it uses (fetch, pictures, sound, video frames) are
// stood in for, so that what it lays on which frame, when it sets the sound and when it gives up can be checked exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMouthLayer, mouthUniforms, putMouth, type MouthPart, type MouthShown} from '../src/scene3d-mouth.ts';
import {wavBytes, type MouthPatch} from '../src/speech-patch.ts';

const hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const strip = new Uint8Array([1, 2, 3, 4]), wav = wavBytes(new Uint8Array(4800), 24000); // the bytes only have to match their hashes
const patchOf = (over: Partial<MouthPatch> = {}): MouthPatch => ({schemaVersion: 1, kind: 'mouth-patch', id: 'paow-mun-goodluck-sv-ingang-2-1-02-01', dealer: 'paow',
  film: {id: 'paow-ingang-2-1-02-01', path: 'assets/motions/paow-ingang-2-1-02-01/source.mp4', sha256: 'e'.repeat(64), fps: 24, frames: 97, width: 1764, height: 1174},
  line: {key: 'goodluck', language: 'sv', text: 'Lycka till!', voice: 'Paow'}, box: {x: 768, y: 208, w: 184, h: 176}, feather: 24, first: 10, count: 12, weights: [0.25, 0.75, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.25],
  strip: {path: 'mouth.webp', type: 'image/webp', lossless: true, columns: 4, rows: 3, width: 736, height: 528, colour: 'bt709-tv', sha256: hex(strip)},
  sound: {path: 'line.wav', type: 'audio/wav', rate: 24000, channels: 1, samples: 2400, startsAtSeconds: 0.4, endsAtSeconds: 0.5, sha256: hex(wav)},
  made: {by: 'test', at: '2026-11-13T00:00:00Z', from: {path: 'x', sha256: 'd'.repeat(64)}}, ...over});

// ── the browser, stood in for ──
type Call = (now: number, meta: {mediaTime: number; expectedDisplayTime: number}) => void;
const started: {at: number; offset?: number}[] = [], stopped: number[] = [];
let clock = 1000, files: Record<string, Uint8Array> = {};
const g = globalThis as Record<string, unknown>;
g.fetch = async (url: string) => { const name = url.split('/').pop()!, data = files[name]; return {ok: !!data, status: data ? 200 : 404, arrayBuffer: async () => data!.slice().buffer}; };
g.createImageBitmap = async () => ({width: 736, height: 528, close() {}});
g.Blob = class { parts: unknown[]; constructor(parts: unknown[]) { this.parts = parts; } };
g.AudioBuffer = class { o: unknown; constructor(o: unknown) { this.o = o; } copyToChannel() {} };
g.AudioContext = class { state = 'running'; currentTime = 5; outputLatency = 0; baseLatency = 0; destination = {}; resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
  getOutputTimestamp() { return {contextTime: this.currentTime, performanceTime: clock}; }
  createGain() { return {gain: {value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}}, connect(x: unknown) { return x; }}; }
  createBufferSource() { return {buffer: null, connect: (x: unknown) => x, start: (at: number, offset?: number) => started.push({at, offset}), stop: (at: number) => stopped.push(at)}; } };
g.VideoFrame = class { timestamp: number; constructor(v: {currentTime: number}) { this.timestamp = Math.round(v.currentTime * 1e6); } close() {} };
Object.defineProperty(globalThis, 'navigator', {value: {userActivation: {hasBeenActive: true}}, configurable: true});
const video = () => { const v = {readyState: 4, currentTime: 0, playbackRate: 1, calls: [] as Call[], requestVideoFrameCallback(f: Call) { v.calls.push(f); return v.calls.length; }, cancelVideoFrameCallback() {},
  /** shows film frame k at `at` ms on the page's clock */ show(k: number, at: number) { v.currentTime = (k + 0.5) / 24; const fs = v.calls.splice(0); for (const f of fs) f(at, {mediaTime: k / 24, expectedDisplayTime: at}); } }; return v; };
// The layer's clock and its put-off calls are the test's: nothing here waits on the wall clock.
const queue: {at: number; call: () => void}[] = [];
const later = (call: () => void, ms: number) => { queue.push({at: clock + ms, call}); };
const runUntil = (t: number) => { clock = t; for (const q of queue.splice(0).sort((a, b) => a.at - b.at)) { if (q.at <= t) q.call(); else queue.push(q); } };
const layerFor = (shown: (MouthShown | null)[]) => { queue.length = 0; return createMouthLayer(s => shown.push(s), {now: () => clock, later}); };

test('putMouth sets the shader\'s uniforms, and null switches it off', () => {
  const u = mouthUniforms(), p = patchOf(), texture = {} as never;
  putMouth(u, {texture, cell: {x: 368, y: 176}, weight: 0.75, patch: p});
  assert.equal(u.mouthOn.value, 1); assert.equal(u.mouthWeight.value, 0.75); assert.deepEqual(u.mouthBox.value.toArray(), [768, 208, 184, 176]); assert.deepEqual(u.mouthCell.value.toArray(), [368, 176]);
  assert.deepEqual(u.mouthStrip.value.toArray(), [736, 528]); assert.deepEqual(u.mouthFilm.value.toArray(), [1764, 1174]);
  putMouth(u, {texture, cell: {x: 0, y: 0}, weight: 0, patch: p}); assert.equal(u.mouthOn.value, 0); // a pause: nothing laid
  putMouth(u, null); assert.equal(u.mouthOn.value, 0); assert.equal(u.mouthMap.value, null);
});

test('the layer lays the cell of the frame on screen, and the sound is set for when its first sample is shown', async () => {
  files = {'mouth.webp': strip, 'line.wav': wav}; started.length = stopped.length = 0;
  const shown: (MouthShown | null)[] = [], layer = layerFor(shown), said: boolean[] = [];
  const part: MouthPart = {patch: patchOf(), base: 'assets/speech/paow/patches/x/', begin: s => said.push(s)}; await layer.preload([part]);
  assert.equal(layer.state(part), 'ready');
  const v = video(), onScreen = {mouth: part, fps: 24};
  v.currentTime = 0.5 / 24; layer.update(onScreen, v as never); assert.equal(shown.length, 0, 'frame 0: before the patch, nothing');
  v.show(3, clock = 1000); layer.update(onScreen, v as never); assert.equal(started.length, 0, 'frame 3: the sound is more than LEAD (0,25 s) away');
  v.show(5, clock = 1083); assert.equal(started.length, 1, 'frame 5: set within LEAD of its first sample');
  // frame 5 is shown at 1083 ms; the sound's 0.4 s (frame 9.6) is (0.4 - 5/24) s later, which the audio clock (5 s at 1083 ms) has at:
  assert.ok(Math.abs(started[0].at - (5 + (0.4 - 5 / 24))) < 1e-9, `${started[0].at}`);
  v.currentTime = 10.5 / 24; layer.update(onScreen, v as never); assert.deepEqual(shown.at(-1)?.cell, {x: 0, y: 0}); assert.equal(shown.at(-1)?.weight, 0.25);
  v.currentTime = 15.5 / 24; layer.update(onScreen, v as never); assert.deepEqual(shown.at(-1)?.cell, {x: 184, y: 176}, 'cell 5: second row, second column');
  layer.update(onScreen, v as never, 12); assert.deepEqual(shown.at(-1)?.cell, {x: 368, y: 0}, 'the frame the scene says is shown goes before the element\'s picture');
  v.currentTime = 22.5 / 24; layer.update(onScreen, v as never); assert.equal(shown.at(-1), null, 'past the patch: taken off');
  assert.deepEqual(said, [], 'not yet: the sound begins at 1274.7 ms'); runUntil(1300); assert.deepEqual(said, [true], 'begin(true) as the sound begins');
  layer.update(null, null); assert.equal(stopped.length, 1, 'the part gone: its sound stops'); assert.deepEqual(said, [true]);
  assert.equal(layer.log.at(-1)?.heard, true); assert.equal(layer.log.at(-1)?.soundFrame, 9);
  layer.dispose();
});

test('a patch not read in time is not laid: the part plays as before and the line is text', async () => {
  files = {'mouth.webp': strip}; // the sound is missing
  const shown: (MouthShown | null)[] = [], layer = layerFor(shown), said: boolean[] = [];
  const part: MouthPart = {patch: patchOf(), base: 'b/', begin: s => said.push(s)}; await layer.preload([part]);
  assert.equal(layer.state(part), 'failed');
  const v = video(); v.currentTime = 12.5 / 24; layer.update({mouth: part, fps: 24}, v as never); layer.update({mouth: part, fps: 24}, v as never);
  assert.deepEqual(said, [false]); assert.equal(shown.length, 0); assert.match(layer.log.at(-1)!.note[0], /inte inläst/);
  layer.dispose();
});

test('a film that falls behind its sound ends the line, sound and mouth', async () => {
  files = {'mouth.webp': strip, 'line.wav': wav}; started.length = stopped.length = 0;
  const shown: (MouthShown | null)[] = [], layer = layerFor(shown), said: boolean[] = [];
  const part: MouthPart = {patch: patchOf(), base: 'c/', begin: s => said.push(s)}; await layer.preload([part]);
  const v = video(), on = {mouth: part, fps: 24};
  v.currentTime = 5.5 / 24; layer.update(on, v as never); v.show(5, clock = 2000); assert.equal(started.length, 1);
  v.show(12, clock = 2000 + (12 / 24 - 5 / 24) * 1000); v.currentTime = 12.5 / 24; layer.update(on, v as never); assert.ok(shown.at(-1), 'in step: laid');
  v.show(13, clock = 2000 + (13 / 24 - 5 / 24) * 1000 + 300); // shown 300 ms late: the film stalled
  assert.equal(stopped.length, 1); v.currentTime = 13.5 / 24; layer.update(on, v as never); assert.equal(shown.at(-1), null);
  assert.match(layer.log.at(-1)!.note.join(' '), /avbröts/);
  layer.dispose();
});
