// Tests for the arithmetic of a spoken line (src/speech-plan.ts) and for the bridge as FFmpeg cuts it (tools/speech.ts).
// The hashes are the ones Scoutgaming's Python makes for the same values (json.dumps without spaces), worked out there once.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {BRIDGE, RENDER, bridgeProblems, clipLength, filmFrameOf, bridgeFilter, lineFrames, longestSound, restPath, planRows, canonical, videoIdOf, sourcesOf, bakeJob, answerVideo, sameWords,
  changedBox, unionBox, grownBox, featherMask, blendFrame, heardFrames, speechGate, GATE, type Bridge} from '../src/speech-plan.ts';
import {bridgeFilm, rawFrames, attestationOf, sameValue, voiceIn, readRegister, type Voice} from './speech.ts';

const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const SHA = 'ab'.repeat(32), VID = 'abababab-abab-abab-abab-abababababab', TAKE = 'clip-' + VID;

test('a line is the sound plus 0,22 s before and 0,53 s after, in whole frames', () => {
  assert.equal(lineFrames(26000), 31);
  assert.equal(lineFrames(64000), 50);
  assert.throws(() => lineFrames(0), /invalid_pcm/);
  assert.throws(() => lineFrames(25001), /invalid_pcm/);
  assert.throws(() => lineFrames(RENDER.maxPcmBytes + 2), /talbas_too_long/);
});

test('the line goes out from the rest frame and the same way back, never looped or held', () => {
  assert.deepEqual(restPath(0, 112, 5), [0, 1, 2, 1, 0]);
  assert.deepEqual(restPath(0, 112, 6), [0, 1, 2, 2, 1, 0]);
  assert.deepEqual(restPath(111, 112, 5), [111, 110, 109, 110, 111], 'backwards when the rest frame lies late');
  assert.deepEqual(restPath(0, 112, 1), [0]);
  assert.equal(restPath(0, 112, 224).length, 224);
  assert.equal(Math.max(...restPath(0, 112, 224)), 111);
  assert.throws(() => restPath(0, 112, 225), /talbas_too_short/);
  assert.throws(() => restPath(0, 112, 601), /talbas_too_long/);
  // The longest sound the clip carries is the one whose line is the longest path.
  const seconds = longestSound(112);
  assert.equal(lineFrames(Math.floor(seconds * RENDER.pcmRate) * 2), 224);
});

test('the plan and the source set are written and hashed as the renderer reads them', () => {
  const rows = planRows(TAKE, restPath(0, 112, 5));
  assert.deepEqual(rows, [[TAKE, 0, 3], [TAKE, 1, 1], [TAKE, 0, 1]]);
  assert.equal(sha(canonical(rows)), '0602d3c4bc1b3401c0b4fdd08b7dd55b3765d3152b2e098f81b5e1e2db7cbf24');
  assert.equal(videoIdOf(SHA), VID);
  const sources = sourcesOf('paow-v2', {sha256: SHA, bytes: 1234, frameCount: 112});
  assert.equal(sha(canonical(sources)), 'e76814db6fad1dc5a389f152130b8458af562615096452e3aa3d385cf2209f18');
  assert.throws(() => sourcesOf('Paow', {sha256: SHA, bytes: 1, frameCount: 10}), /invalid_identity/);
  assert.throws(() => sourcesOf('paow-v2', {sha256: SHA, bytes: 1, frameCount: 601}), /invalid_source/);
});

test('a job is bound to its bank, and its answer is checked against exactly what was sent', () => {
  const bank = {dealerId: 'paow-v2', workerAvatar: 'paow-v2', sourceSetSha256: SHA, avatarSha256: 'cd'.repeat(32), bankReceiptSha256: 'ef'.repeat(32)};
  const pcm = new Uint8Array(26000).fill(7), audio = {bytes: pcm.length, sha256: sha(pcm), base64: Buffer.from(pcm).toString('base64')};
  const rows = planRows(TAKE, restPath(0, 112, 31)), job = bakeJob(bank, '12'.repeat(32), rows, audio, 'paow-v2-placebets-sv-1');
  assert.deepEqual(Object.keys(job), ['schemaVersion', 'op', 'ttlSeconds', 'binding', 'karta', 'audio']);
  assert.deepEqual(Object.keys(job.binding).sort(), ['avatarSha256', 'bankReceiptSha256', 'dealerId', 'releaseSha256', 'requestId', 'schemaVersion', 'sourceSetSha256', 'workerAvatar']);
  assert.throws(() => bakeJob(bank, '12'.repeat(32), planRows(TAKE, restPath(0, 112, 30)), audio, 'x'), /frame_plan_length_mismatch/);
  assert.throws(() => bakeJob(bank, '12'.repeat(32), rows, audio, 'two words'), /invalid_request_id/);
  const said = attestationOf(job, 'local-1');
  assert.equal(said.frameCount, 31); assert.equal(said.pcmSha256, audio.sha256); assert.equal(said.planSha256, sha(canonical(rows))); assert.equal(said.jobId, 'local-1');
  assert.ok(sameValue(said, Object.fromEntries(Object.entries(said).reverse())), 'the order of the fields does not matter');
  assert.ok(!sameValue(said, {...said, frameCount: 30}));
  assert.deepEqual(answerVideo(31), {schemaVersion: 1, frameCount: 31, fps: 24, width: 1080, height: 1920, videoTrackId: 1, audioTrackId: 2, audioSampleRate: 48000});
});

test('what was heard is compared with the line by its words, not its commas', () => {
  assert.ok(sameWords('Lägg era insatser. Tack', 'Lägg era insatser, tack.'));
  assert.ok(sameWords('  BLACKJACK – vackert spelat, grattis ', 'Blackjack! Vackert spelat. Grattis!'));
  assert.ok(!sameWords('Lägg era insatser', 'Lägg era insatser, tack.'));
  assert.ok(sameWords('Dealern är över 21. Grattis, bordet vinner.', 'Dealern är över tjugoett! Grattis, bordet vinner.'), 'twenty-one is heard in digits');
  assert.ok(!sameWords('Dealern är över 20. Grattis, bordet vinner', 'Dealern är över tjugoett! Grattis, bordet vinner.'));
  assert.ok(!sameWords('Lägger en satser, tack!', 'Lägg era insatser, tack.'));
  assert.ok(sameWords('Jag mår fint, tack. Korten är på gott humör ikväll.', 'Jag mår fint, tack. Korten är på gott humör i kväll.'), 'where the words are parted is not heard');
  assert.ok(!sameWords('Jag heter Paul och jag är din dealer i kväll', 'Jag heter Paow, och jag är din dealer i kväll.'));
});

test('a voice reads each language with one model, and names its account by the name of its key only', async () => {
  const own = {modelId: 'eleven_v3', settings: {stability: 0.5}}, english = {modelId: 'eleven_multilingual_v2', settings: {stability: 0.38, style: 0.3}};
  const voice: Voice = {provider: 'elevenlabs', voiceId: 'v', name: 'Paow', key: 'ELEVENLABS_API_KEY_KEVIN', ...own, languages: {en: english}};
  assert.deepEqual(voiceIn(voice, 'sv'), {provider: 'elevenlabs', voiceId: 'v', name: 'Paow', key: 'ELEVENLABS_API_KEY_KEVIN', ...own});
  assert.deepEqual(voiceIn(voice, 'en'), {provider: 'elevenlabs', voiceId: 'v', name: 'Paow', key: 'ELEVENLABS_API_KEY_KEVIN', ...english});
  // A voice of the first films, written before a voice could name a key or a language, is the same value as before: its takes are still found.
  const plain: Voice = {provider: 'elevenlabs', voiceId: 'j', name: 'Jessica', modelId: 'eleven_multilingual_v2', settings: {stability: 0.6}};
  assert.ok(sameValue(voiceIn(plain, 'sv'), plain));
  // The register as it stands: every dealer's voice exists, and no voice carries a key itself.
  const register = await readRegister();
  for (const d of Object.values(register.dealers)) assert.ok(register.voices[d.voice], d.voice);
  for (const v of Object.values(register.voices)) assert.match(v.key ?? 'ELEVENLABS_API_KEY', /^[A-Z][A-Z0-9_]*$/);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'speech-register-')), file = path.join(dir, 'speech.json');
  try { await writeFile(file, JSON.stringify({...register, voices: {...register.voices, leaked: {...plain, key: 'sk_0123456789abcdef'}}}));
    await assert.rejects(readRegister(file), /aldrig nyckeln själv/); }
  finally { await rm(dir, {recursive: true, force: true}); }
});

test('the drawn mouth is laid in only around what is heard, and changes where the two mouths are most alike', () => {
  const frames = 40, track = Buffer.alloc(frames * 1000 * 2), tone = (from: number, to: number, level = 8000) => { for (let i = from * 1000; i < to * 1000; i++) track.writeInt16LE(Math.round(level * Math.sin(i / 8)), i * 2); };
  tone(8, 15); tone(24, 30);
  const heard = heardFrames(track, frames);
  assert.deepEqual(heard.flatMap((h, k) => h ? [k] : []), [8, 9, 10, 11, 12, 13, 14, 24, 25, 26, 27, 28, 29]);
  // Without a measure of the two mouths each change lies one frame from the sound, and is one frame of both.
  const g = speechGate(heard);
  assert.deepEqual(g.slice(5, 18), [0, 0, 0.5, 1, 1, 1, 1, 1, 1, 1, 0.5, 0, 0]);
  // Her own mouth at both ends of the film, so that it starts and ends as the rest film does, and in the middle of a pause of nine frames.
  assert.deepEqual(g.slice(0, 7), new Array(7).fill(0)); assert.deepEqual(g.slice(31), new Array(9).fill(0)); assert.deepEqual(g.slice(16, 23), new Array(7).fill(0));
  // With one, a change lies where they are least apart, within the gate's reach of the sound (two frames before, three after) and no further.
  const apart = new Array<number>(frames).fill(5); apart[5] = 0; apart[6] = 1; apart[17] = 1; apart[18] = 0;
  assert.deepEqual(speechGate(heard, GATE, apart).slice(5, 19), [0, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0]);
  // A silence of three frames is spoken through, and a sound far under the line's own level is not heard.
  tone(15, 21); tone(34, 38, 20);
  const h = speechGate(heardFrames(track, frames));
  assert.deepEqual(h.slice(7, 31), [0.5, ...new Array(22).fill(1), 0.5]); assert.equal(h[35], 0);
  // No sound at all: nothing is drawn. A line that fills the film to its edges has no frame to change on and is drawn throughout.
  assert.deepEqual(speechGate(heardFrames(Buffer.alloc(10 * 1000 * 2), 10)), new Array(10).fill(0));
  assert.deepEqual(speechGate([true, true, false, false, true]), [1, 1, 1, 1, 1]);
  assert.throws(() => speechGate(heard, GATE, [1, 2, 3]), /invalid_gate/);
});

test('the bridge keeps a pixel a pixel, on even offsets', () => {
  assert.deepEqual(bridgeProblems(BRIDGE), []);
  assert.match(bridgeProblems({...BRIDGE, padY: 373}).join(' '), /jämna/);
  assert.match(bridgeProblems({...BRIDGE, cropX: 700}).join(' '), /utanför/);
  assert.equal(clipLength(118), 112);
  assert.equal(filmFrameOf(0), 3);
  const filter = bridgeFilter(118);
  assert.match(filter, /trim=start_frame=3:end_frame=115,/);
  assert.match(filter, /crop=1080:1174:328:0,pad=1080:1920:0:372,fillborders=top=372:bottom=374:mode=smear/);
});

// A film frame and the clip frame the bridge makes of it, as planar 4:2:0, with a luma that tells where a pixel came from.
const {width: W, height: H} = BRIDGE.film, FILM_BYTES = W * H * 3 / 2, CLIP_BYTES = RENDER.width * RENDER.height * 3 / 2;
function filmFrame(): Uint8Array { const f = new Uint8Array(FILM_BYTES).fill(100); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = (x + 2 * y) % 200; return f; }
function clipOf(film: Uint8Array, b: Bridge = BRIDGE): Uint8Array {
  const c = new Uint8Array(CLIP_BYTES).fill(100);
  for (let y = 0; y < H; y++) c.set(film.subarray(y * W + b.cropX, y * W + b.cropX + RENDER.width), (y + b.padY) * RENDER.width);
  return c;
}
const paint = (clip: Uint8Array, x: number, y: number, w: number, h: number, luma: number, chroma: number) => {
  for (let j = 0; j < h; j++) clip.fill(luma, (y + j) * RENDER.width + x, (y + j) * RENDER.width + x + w);
  const cw = RENDER.width / 2, u = RENDER.width * RENDER.height, v = u + cw * RENDER.height / 2;
  for (let j = 0; j < h / 2; j++) for (const p of [u, v]) clip.fill(chroma, p + (y / 2 + j) * cw + x / 2, p + (y / 2 + j) * cw + (x + w) / 2);
};

test('the rendered face is found, and laid back into the film without touching anything else', () => {
  const film = filmFrame(), clip = clipOf(film);
  assert.equal(changedBox(film, clip), null, 'an untouched clip differs nowhere');
  // The renderer changed 96 × 64 pixels at clip (480, 604), which is film (808, 232).
  paint(clip, 480, 604, 96, 64, 250, 30);
  const found = changedBox(film, clip)!;
  assert.deepEqual(found, {x: 808, y: 232, w: 96, h: 64});
  assert.deepEqual(unionBox(found, {x: 800, y: 300, w: 10, h: 10}), {x: 800, y: 232, w: 104, h: 78});
  assert.deepEqual(unionBox(null, found), found);
  const box = grownBox(found, 24);
  assert.deepEqual(box, {x: 784, y: 208, w: 144, h: 112});
  assert.deepEqual(grownBox({x: 330, y: 2, w: 20, h: 20}, 40), {x: 328, y: 0, w: 62, h: 62}, 'kept inside what the clip shows');
  const mask = featherMask(box.w, box.h, 16), before = Uint8Array.from(film);
  assert.ok(mask[0] < 0.01 && mask[(box.h / 2) * box.w + box.w / 2] === 1);
  blendFrame(film, clip, box, mask);
  assert.equal(film[(232 + 32) * W + 808 + 48], 250, 'the middle of the face is the renderer\'s');
  const cw = W / 2, u = W * H, at = u + ((232 + 32) / 2) * cw + (808 + 48) / 2;
  assert.equal(film[at], 30, 'and so is its colour');
  assert.equal(film[at + cw * (H / 2)], 30);
  let outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x < box.x || x >= box.x + box.w || y < box.y || y >= box.y + box.h) && film[y * W + x] !== before[y * W + x]) outside++;
  assert.equal(outside, 0, 'no luma outside the box changed');
  // Where the renderer left the picture alone, the blend changes nothing, also inside the box.
  assert.equal(film[(box.y + 4) * W + box.x + 4], before[(box.y + 4) * W + box.x + 4]);
  assert.throws(() => blendFrame(film, clip, {...box, x: box.x + 1}, mask), /invalid_box/);
});

const needsFfmpeg = {skip: spawnSync('ffmpeg', ['-version']).status !== 0 && 'ffmpeg finns inte här'};
test('FFmpeg cuts the bridge where the arithmetic says: frame 0 of the clip is frame 3 of the film, pixel for pixel', needsFfmpeg, async t => {
  const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir(), dir = await mkdtemp(path.join(base, 'speech-test-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const film = path.join(dir, 'film.mp4'), clip = path.join(dir, 'clip.mp4');
  // Twelve frames of a moving test picture in the bank's size, untagged 4:2:0 like the bank's films.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=30:d=0.4`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-qp', '0', '-y', film], {windowsHide: true});
  const made = await bridgeFilm(film, clip, 0);
  assert.deepEqual({frames: made.frames, width: made.width, height: made.height, fps: made.fps}, {frames: 6, width: 1080, height: 1920, fps: '24/1'});
  const filmFrames: Buffer[] = [], clipFrames: Buffer[] = [];
  for await (const f of rawFrames(film, FILM_BYTES)) filmFrames.push(f);
  for await (const f of rawFrames(clip, CLIP_BYTES)) clipFrames.push(f);
  assert.equal(filmFrames.length, 12); assert.equal(clipFrames.length, 6);
  for (const k of [0, 5]) {
    assert.equal(changedBox(filmFrames[filmFrameOf(k)], clipFrames[k], BRIDGE, 0, 8), null, `clip frame ${k} is film frame ${filmFrameOf(k)}`);
    assert.notEqual(changedBox(filmFrames[filmFrameOf(k) + 1], clipFrames[k], BRIDGE, 0, 8), null, 'and not its neighbour');
  }
  // The rows above and below the film are filled from its own edge rows, not left black.
  const c = clipFrames[0], row = (y: number) => c.subarray(y * 1080, y * 1080 + 1080);
  assert.deepEqual(row(0), row(BRIDGE.padY)); assert.deepEqual(row(1919), row(BRIDGE.padY + H - 1));
});
