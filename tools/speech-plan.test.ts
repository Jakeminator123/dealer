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
  changedBox, unionBox, grownBox, featherMask, blendFrame, heardFrames, speechGate, mixFrame, GATE, LIPS, mouthWindow, cutPlanes, lipMap, lipsMiddle, lipsHalf, lipLine, mouthGap, mouthOpens, mouthDrop, mouthLift, mouthMoves, layMouth, type Bridge, type Lips} from '../src/speech-plan.ts';
import {bridgeFilm, rawFrames, attestationOf, sameValue, voiceIn, readRegister, levelled, LOUDNESS, type Voice} from './speech.ts';

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
  const heard = heardFrames(track, frames), run = (from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => from + i);
  const shape = (g: number[]) => ({drawn: g.flatMap((w, k) => w === 1 ? [k] : []), both: g.flatMap((w, k) => w === 0.5 ? [k] : []), other: g.filter(w => w !== 0 && w !== 0.5 && w !== 1).length});
  assert.deepEqual(heard.flatMap((h, k) => h ? [k] : []), [...run(8, 14), ...run(24, 29)]);
  // Without a measure of the two mouths each change lies one frame from the sound and is one frame of both; her own mouth has
  // both ends of the film and the middle of a pause of nine frames.
  assert.deepEqual(shape(speechGate(heard)), {drawn: [...run(8, 14), ...run(24, 29)], both: [7, 15, 23, 30], other: 0});
  // With one, a change lies where they are least apart, within the gate's reach of the sound (two frames before, three after) and no further.
  const apart = new Array<number>(frames).fill(5); apart[5] = 0; apart[6] = 1; apart[17] = 1; apart[18] = 0;
  assert.deepEqual(shape(speechGate(heard, GATE, apart)), {drawn: [...run(7, 16), ...run(24, 29)], both: [6, 17, 23, 30], other: 0});
  // A silence of five frames is spoken through; one of six is a pause, and her own mouth gets four whole frames of it.
  const six = heard.map((h, k) => h || (k >= 15 && k <= 17)), five = heard.map((h, k) => h || (k >= 15 && k <= 18));
  assert.deepEqual(shape(speechGate(six)), {drawn: [...run(8, 17), ...run(24, 29)], both: [7, 18, 23, 30], other: 0});
  assert.deepEqual(shape(speechGate(five)), {drawn: run(8, 29), both: [7, 30], other: 0});
  // A sound far under the line's own level is not heard; no sound at all: nothing is drawn; a line that fills the film is drawn throughout.
  tone(34, 38, 20); assert.deepEqual(heardFrames(track, frames), heard);
  assert.deepEqual(speechGate(heardFrames(Buffer.alloc(10 * 1000 * 2), 10)), new Array(10).fill(0));
  assert.deepEqual(speechGate([true, true, false, false, true]), [1, 1, 1, 1, 1]);
  // The hard change that was tried and fell: the frame at each change is her own mouth.
  assert.deepEqual(shape(speechGate(heard, {...GATE, both: 0})), {drawn: [...run(8, 14), ...run(24, 29)], both: [], other: 0});
  assert.throws(() => speechGate(heard, GATE, [1, 2, 3]), /invalid_gate/);
  // The frame of both is half the laid mouth and half the film's own, and nothing else in it is touched.
  const own = Uint8Array.from([10, 200, 77, 0]), laid = Uint8Array.from([10, 100, 78, 255]); mixFrame(laid, own, 0.5);
  assert.deepEqual([...laid], [10, 150, 78, 128]); assert.throws(() => mixFrame(laid, own.subarray(1), 0.5), /invalid_mix/);
});

test('only the mouth is laid in, around her own lips, larger and in her lips\' colour', () => {
  // A film frame of plain skin with lips painted redder in the middle of the window, and a drawn frame with smaller, paler lips.
  const b: Bridge = {film: {width: 400, height: 300}, cropX: 0, padY: 0, skipStart: 0, skipEnd: 0}, W = 400, H = 300, changed = {x: 148, y: 100, w: 104, h: 112}, win = mouthWindow(changed, b);
  assert.deepEqual(win, {x: 120, y: 76, w: 160, h: 132});
  const paint = (rx: number, ry: number, red: number) => { const f = new Uint8Array(W * H * 3 / 2).fill(150); f.fill(110, W * H, W * H + W * H / 4); f.fill(160, W * H + W * H / 4);
    for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) if (Math.hypot((2 * x - 200) / rx, (2 * y - 136) / ry) <= 1) f[W * H + W * H / 4 + y * W / 2 + x] = red; return f; };
  const film = paint(34, 10, 182), clip = paint(28, 6, 176), own = cutPlanes(film, W, H, win.x, win.y, win.w, win.h), lip = lipMap(own.V), middle = lipsMiddle(lip, win.w, win.h)!;
  assert.ok(Math.abs(middle.x - 80) <= 2 && Math.abs(middle.y - 60) <= 2, 'her lips are found in the middle of the window');
  assert.equal(lipsMiddle(lipMap(cutPlanes(new Uint8Array(W * H * 3 / 2).fill(150), W, H, win.x, win.y, win.w, win.h).V), win.w, win.h), null, 'no lips, no middle');
  // The same frame laid into itself, as drawn, without colour or sharpening, changes nothing.
  const plain: Lips = {wide: 1, tall: 1, colour: 0, sharpen: 0, reach: LIPS.reach, grow: LIPS.grow, under: null, corners: null, drop: 0, fall: 30, open: [2, 5], closed: 0}, wider: Lips = {...plain, wide: 1.14, tall: 1.3, colour: 1, sharpen: 0.5}, same = Uint8Array.from(film);
  layMouth(same, own, win, middle, {y: 0, u: 0, v: 0}, plain, b); assert.deepEqual(same, film);
  // The drawn mouth laid in: nothing outside the ellipse around her lips is touched, the drawn lips are wider than they were
  // drawn, and their colour is hers.
  const laid = Uint8Array.from(film), theirs = cutPlanes(clip, W, H, win.x, win.y, win.w, win.h);
  layMouth(laid, theirs, win, middle, {y: 0, u: 0, v: 6}, wider, b);
  const v0 = W * H + W * H / 4, at = (x: number, y: number) => v0 + (y >> 1) * W / 2 + (x >> 1);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (Math.hypot((x - 200) / (LIPS.reach[0] + 2), (y - 140) / (LIPS.reach[1] + 2)) > 1) assert.equal(laid[at(x, y)], film[at(x, y)], `untouched at ${x},${y}`);
  const widthOf = (f: Uint8Array) => { let n = 0; for (let x = 120; x < 280; x += 2) if (f[at(x, 136)] > 170) n += 2; return n; };
  assert.equal(widthOf(clip), 58); assert.ok(widthOf(laid) >= 62 && widthOf(laid) <= 66, `the drawn lips are made wider: ${widthOf(laid)}`);
  assert.ok(Math.abs(laid[at(200, 136)] - 182) <= 1, 'and have her lips\' colour');
  // Her own upper lip kept: with a dark line between her lips at row 136, nothing above the line is touched, and below it the
  // drawn mouth is laid in.
  const lined = Uint8Array.from(film); for (let x = 166; x <= 234; x++) { lined[136 * W + x] = 60; lined[137 * W + x] = 60; }
  const line = lipLine(lined, win, middle, b); assert.ok(Math.abs(line[80] - 60.5) <= 1, `the line between her lips is found: ${line[80]}`);
  const kept = Uint8Array.from(lined), drawnOpen = Uint8Array.from(clip); for (let y = 138; y < 150; y++) for (let x = 180; x <= 220; x++) drawnOpen[y * W + x] = 235;
  layMouth(kept, cutPlanes(drawnOpen, W, H, win.x, win.y, win.w, win.h), win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1}, b);
  for (let y = 100; y <= 132; y++) for (let x = 140; x <= 260; x++) assert.equal(kept[y * W + x], lined[y * W + x], `her upper lip untouched at ${x},${y}`);
  assert.equal(kept[144 * W + 200], 235, 'and the drawn mouth, here its teeth, is laid in below the line');
  // The model opens the mouth at her lip line and above it. Laid in as it is, most of the opening lies behind her kept upper lip;
  // moved down four pixels at the line, it opens under it.
  const high = Uint8Array.from(clip); for (let y = 132; y < 140; y++) for (let x = 180; x <= 220; x++) high[y * W + x] = 235;
  const behind = Uint8Array.from(lined), moved = Uint8Array.from(lined), opened = cutPlanes(high, W, H, win.x, win.y, win.w, win.h);
  layMouth(behind, opened, win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1}, b); layMouth(moved, opened, win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1, drop: 4}, b);
  assert.equal(behind[141 * W + 200], 150, 'as drawn, the teeth end three rows under her line'); assert.equal(moved[141 * W + 200], 235, 'moved down, they show four rows further');
  for (let y = 100; y <= 132; y++) for (let x = 140; x <= 260; x += 4) assert.equal(moved[y * W + x], lined[y * W + x], `her upper lip untouched at ${x},${y} when the mouth is moved down`);
  // Eased out toward her corners, the move is whole in the middle and nothing at the corner: her lips are 34 pixels to either
  // side, and a column 30 pixels out shows the teeth where they were drawn, not four rows further down.
  const across = Uint8Array.from(clip); for (let y = 132; y < 140; y++) for (let x = 166; x <= 234; x++) across[y * W + x] = 235;
  const eased = Uint8Array.from(lined); layMouth(eased, cutPlanes(across, W, H, win.x, win.y, win.w, win.h), win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1, drop: 4, taper: 0.5}, b);
  assert.equal(eased[141 * W + 200], 235, 'whole in the middle'); assert.equal(eased[141 * W + 230], 150, 'nothing 30 pixels out, near her corner');
  // Ended along an arc under her lip line, a drawn mouth that is bright far down shows deep in the middle and not at all low
  // beside her corner, where the upright end would have let it through.
  const deep = Uint8Array.from(clip); for (let y = 138; y < 170; y++) for (let x = 166; x <= 234; x++) deep[y * W + x] = 235;
  const arced = Uint8Array.from(lined), upright = Uint8Array.from(lined), low = cutPlanes(deep, W, H, win.x, win.y, win.w, win.h);
  layMouth(arced, low, win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1, corners: 0, arc: 30}, b); layMouth(upright, low, win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1, corners: 0}, b);
  assert.equal(arced[150 * W + 200], 235, 'deep in the middle'); assert.equal(arced[160 * W + 222], 150, 'not low beside her corner'); assert.ok(upright[160 * W + 222] > 200, 'where the upright end lets it through');
  // It is moved down only while it is open: the gap between the drawn lips is measured (here a band of four rows that is not
  // lip, across the lips' middle), evened over three frames, and the drop comes in between a gap of two pixels and one of five.
  const gapped = Uint8Array.from(clip), v = W * H + W * H / 4; for (let y = 134; y < 138; y += 2) for (let x = 170; x <= 230; x += 2) gapped[v + (y >> 1) * W / 2 + (x >> 1)] = 160;
  assert.equal(mouthGap(theirs, win.w, win.h, middle, line), 0, 'closed: no gap'); assert.equal(mouthGap(cutPlanes(gapped, W, H, win.x, win.y, win.w, win.h), win.w, win.h, middle, line), 4);
  assert.deepEqual(mouthDrop([0, 0, 8, 8, 8, 0, 8, 0, 0], {...plain, drop: 4}), [0, 0, 4, 4, 4, 4, 0, 0, 0]);
  assert.deepEqual(mouthDrop([2, 2, 2], {...plain, drop: 4}), [0, 0, 0]);
  // Her own upper lip follows the drawn mouth's opening. The drawn gap above begins at row 134, three rows above her line: that
  // is how far the lip is lifted, at most the recipe's lift, not in silence, evened over the frames.
  const opens = mouthOpens(cutPlanes(gapped, W, H, win.x, win.y, win.w, win.h), win.w, win.h, middle, line); assert.equal(opens.gap, 4); assert.ok(Math.abs(opens.rise - 2.5) <= 1, `opens ${opens.rise} above her line`);
  assert.deepEqual(mouthLift([0, 3, 3, 3, 9, 9, 9, 0], {...plain, lift: 6}), [0, 3, 3, 3, 6, 6, 6, 0]); assert.deepEqual(mouthLift([3, 3, 3], plain), [0, 0, 0], 'nothing without a lift');
  assert.deepEqual(mouthLift([4, 4, 4, 4, 4, 4], {...plain, lift: 6, heard: true, ease: 1}, [true, true, false, false, true, true]), [4, 3, 1, 1, 3, 4]);
  // As a share of the opening: a gap of ten pixels lifts her lip three and a half, a gap of twenty the whole lift; the drawn
  // mouth is moved so that its opening, which began one pixel above her line, begins at the lifted edge (up, here).
  const moves = mouthMoves([{gap: 0, rise: 0}, {gap: 10, rise: 1}, {gap: 10, rise: 1}, {gap: 10, rise: 1}, {gap: 20, rise: 1}, {gap: 20, rise: 1}, {gap: 20, rise: 1}], {...plain, lift: 6, share: 0.35});
  assert.deepEqual(moves.lifts, [0, 3.5, 3.5, 3.5, 6, 6, 6]); assert.deepEqual(moves.drops, [0, -2.5, -2.5, -2.5, -5, -5, -5]);
  // With a base, a small opening lifts her lip too; and a closed drawn mouth whose lips lie three pixels under hers is moved up three.
  const small = mouthMoves([{gap: 3, rise: 0, low: 1}, {gap: 3, rise: 0, low: 1}, {gap: 3, rise: 0, low: 1}, {gap: 0, rise: 0, low: 3}, {gap: 0, rise: 0, low: 3}, {gap: 0, rise: 0, low: 3}], {...plain, lift: 6, share: 0.3, base: 1.5});
  assert.deepEqual(small.lifts, [2.4, 2.4, 2.4, 0, 0, 0]); assert.deepEqual(small.drops, [-2.4, -2.4, -2.4, -3, -3, -3]);
  // A rounded mouth is red all the way between its lips but dark in the middle: no gap, and a dark run (here five rows, from two
  // and a half above her line). Where the recipe counts it (`round`), that run is the opening: her lip is lifted by it and the
  // dark is moved to begin at the lifted edge. Without it the frame is closed and moved up by how low its lips lie, and the
  // opening goes behind her lip. A closed lip line, a shorter run, is no opening.
  const hole = Uint8Array.from(clip); for (let y = 134; y < 139; y++) for (let x = 166; x <= 234; x++) hole[y * W + x] = 60;
  const rounded = mouthOpens(cutPlanes(hole, W, H, win.x, win.y, win.w, win.h), win.w, win.h, middle, line); assert.equal(rounded.gap, 0); assert.equal(rounded.dark, 5); assert.equal(rounded.deep, 5); assert.ok(Math.abs(rounded.darkRise - 2.5) <= 1, `the dark begins ${rounded.darkRise} above her line`);
  assert.equal(mouthOpens(theirs, win.w, win.h, middle, line).dark, 0, 'no dark in lips that are closed and evenly lit');
  // The line between closed lips is dark too, but not deeply: it is a dark run and no deep one.
  const shut = Uint8Array.from(clip); for (let y = 134; y < 139; y++) for (let x = 166; x <= 234; x++) shut[y * W + x] = 110;
  const closedLine = mouthOpens(cutPlanes(shut, W, H, win.x, win.y, win.w, win.h), win.w, win.h, middle, line); assert.equal(closedLine.dark, 5); assert.equal(closedLine.deep, 0);
  const o = Array.from({length: 3}, () => ({gap: 0, rise: 0, low: 4, dark: 6, darkRise: -2, deep: 3})), share = {...plain, lift: 6, share: 0.3, base: 1.5};
  assert.deepEqual(mouthMoves(o, share).drops, [-4, -4, -4]); assert.deepEqual(mouthMoves(o, share).lifts, [0, 0, 0]);
  const round = mouthMoves(o, {...share, round: 2.5}); assert.deepEqual(round.lifts, [3.3, 3.3, 3.3]); assert.deepEqual(round.drops, [-5.3, -5.3, -5.3]);
  assert.deepEqual(mouthMoves(o.map(f => ({...f, deep: 1.25})), {...share, round: 2.5}).lifts, [0, 0, 0], 'a broad line between closed lips is not an opening');
  // Moved only where the drawn mouth is laid whole (`whole`): not in the gate's frame of half each mouth; and with `heard` false
  // also where she is no longer heard but the drawn mouth is still shown open, at the end of a line's last word.
  const tail = Array.from({length: 4}, () => ({gap: 10, rise: 0})), heardThere = [true, true, false, false], wholeThere = [true, true, true, false];
  assert.deepEqual(mouthMoves(tail, {...share, heard: true}, heardThere, wholeThere).lifts, [4.5, 4.5, 0, 0]);
  assert.deepEqual(mouthMoves(tail, {...share, heard: false, whole: true}, heardThere, wholeThere).lifts, [4.5, 4.5, 4.5, 0]);
  // And a frame where the drawn lips meet between two open ones stays closed (a b said in one frame); without `whole` the
  // median of three frames fills it.
  const b1 = [{gap: 10, rise: 0}, {gap: 10, rise: 0}, {gap: 0, rise: 0, low: 2}, {gap: 10, rise: 0}, {gap: 10, rise: 0}];
  assert.deepEqual(mouthMoves(b1, {...share, whole: true}).lifts, [4.5, 4.5, 0, 4.5, 4.5]); assert.deepEqual(mouthMoves(b1, share).lifts, [4.5, 4.5, 4.5, 4.5, 4.5]);
  // Lifted, the dark line between her lips lies that much higher in the middle, by her own pixels above it drawn together;
  // nothing above the reach of the lift and nothing at her corner is touched, and the drawn mouth is laid in from the lifted edge.
  const lifted = Uint8Array.from(lined); layMouth(lifted, opened, win, middle, {y: 0, u: 0, v: 0}, {...plain, under: 1}, b, 0, 4);
  assert.ok(lifted[132 * W + 200] < 100 && lined[132 * W + 200] === 150, `her lip line has moved up in the middle: ${lifted[132 * W + 200]}`); assert.equal(lifted[110 * W + 200], lined[110 * W + 200], 'untouched above the lift');
  assert.ok(lifted[132 * W + 226] > 120, `less toward her corner, where the line has not come up to this row: ${lifted[132 * W + 226]}`); assert.equal(lifted[138 * W + 200], 235, 'the drawn mouth, here its teeth, shows from the lifted edge down');
  // Not moved down where she is not heard, and evened over the frames to either side: the mouth does not shut in one frame.
  assert.deepEqual(mouthDrop([8, 8, 8, 8, 8, 8], {...plain, drop: 4, heard: true}, [true, true, false, false, true, true]), [4, 4, 0, 0, 4, 4]);
  assert.deepEqual(mouthDrop([8, 8, 8, 8, 8, 8], {...plain, drop: 4, heard: true, ease: 1}, [true, true, false, false, true, true]), [4, 3, 1, 1, 3, 4]);
  assert.deepEqual(mouthDrop([8, 8, 8, 8, 8, 8], {...plain, drop: 4}, [true, true, false, false, true, true]), [4, 4, 4, 4, 4, 4], 'only where the recipe says so'); assert.deepEqual(mouthDrop([0, 8, 8, 8, 0], {...plain, drop: 4, closed: -2}), [-2, 4, 4, 4, -2], 'closed, it is lifted onto her own line'); assert.ok(mouthDrop([4, 4, 4], {...plain, drop: 4})[1] > 2.5 && mouthDrop([4, 4, 4], {...plain, drop: 4})[1] < 3.5);
  // The drawn mouth ends at her own lips' corners: her lips are 34 pixels to either side here, a drawn mouth 50 to either side
  // is laid in only between her corners, and nothing of it beside them.
  assert.ok(Math.abs(lipsHalf(lip, win.w, middle)! - 34) <= 2);
  const wide = Uint8Array.from(clip); for (let y = 138; y < 150; y++) for (let x = 150; x <= 250; x++) wide[y * W + x] = 235;
  const ended = Uint8Array.from(film); layMouth(ended, cutPlanes(wide, W, H, win.x, win.y, win.w, win.h), win, middle, {y: 0, u: 0, v: 0}, {...plain, corners: 0}, b);
  assert.equal(ended[144 * W + 200], 235); for (const x of [150, 160, 240, 250]) assert.equal(ended[144 * W + x], film[144 * W + x], `nothing drawn beside her corner at ${x}`);
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

test('a quiet reading and a loud one are heard at the same strength, as long as they were and without clipping', needsFfmpeg, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'speech-level-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const tone = (level: number) => { const b = Buffer.alloc(24000 * 2 * 2); for (let i = 0; i < 48000; i++) b.writeInt16LE(Math.round(32767 * level * Math.sin(i * 2 * Math.PI * 440 / 24000)), i * 2); return b; };
  const quiet = await levelled(tone(0.03), dir), loud = await levelled(tone(0.9), dir);
  for (const made of [quiet, loud]) { assert.equal(made.pcm.length, 96000); assert.ok(Math.abs(made.level.lufs! - LOUDNESS.lufs) <= 0.7, `${made.level.lufs} LUFS`); assert.ok(made.level.peakDb! <= LOUDNESS.peakDb + 0.3, `${made.level.peakDb} dBFS`); }
  assert.ok(quiet.level.gainDb > 10 && loud.level.gainDb < -5);
  // Silence cannot be measured and is handed back as it is.
  const none = await levelled(Buffer.alloc(48000), dir); assert.equal(none.level.gainDb, 0); assert.equal(none.pcm.length, 48000);
});
