// Tests for fixing a delivered film as data (src/film-fix.ts) and the tool that writes the fixed copy (tools/film-fix.ts).
// The pure part runs on made-up frames; the tool on a tiny film FFmpeg makes in a temporary folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {readFixes, checkFixes, applyFixes, memoryStore, cornerColour, LIMITS, SCREEN, type FixOp, type Picture, type RGB} from '../src/film-fix.ts';
import {fixFilm, stripFrames} from './film-fix.ts';

const W = 64, H = 48, PX = W * H, GREEN: RGB = [0, 240, 60];
// A frame: the green screen, her (a block with a gentle gradient, so that her tone has a spread) and, if asked, the block moved.
function frame({green = GREEN, at = 10, skin = 1, noise = 0, seed = 1}: {green?: RGB; at?: number; skin?: number; noise?: number; seed?: number} = {}): Uint8Array {
  const out = new Uint8Array(PX * 3); let s = seed;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, person = x >= at && x < at + 16 && y >= 12 && y < 40;
    s = (s * 16807) % 2147483647; const n = noise ? Math.round(((s / 2147483647) - 0.5) * 2 * noise) : 0;
    const c: number[] = person ? [Math.round((170 + 2 * (x - at) + y) * skin), Math.round((120 + (x - at) + y) * skin), Math.round((90 + y) * skin)] : [green[0], green[1] + n, green[2] + n];
    for (let k = 0; k < 3; k++) out[i + k] = Math.max(0, Math.min(255, c[k]));
  }
  return out;
}
const film = (n: number, make: (f: number) => Uint8Array = () => frame()) => memoryStore(W, H, Array.from({length: n}, (_, f) => make(f)));
const pixel = (data: Uint8Array, x: number, y: number) => Array.from(data.slice((y * W + x) * 3, (y * W + x) * 3 + 3));
const same = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const refused = (result: ReturnType<typeof applyFixes>, pattern: RegExp) => { assert.equal(result.ok, false); assert.match((result as {refusals: string[]}).refusals.join(' | '), pattern); };

test('a fix list is read strictly: unknown steps and fields, a change of tempo and loose frame numbers are refused with a reason', () => {
  assert.deepEqual(readFixes([{op: 'trim', end: 2, why: 'WAN 3 mörknar i sina två sista rutor'}]).refusals, []);
  for (const [list, words] of [[[], /minst ett steg/], [[{op: 'warp'}], /okänd åtgärd/], [[{op: 'speed', factor: 0.5}], /tempot ändras aldrig/],
    [[{op: 'hold', frame: 4}], /okänt fält frame/], [[{op: 'blend', frames: [6, 5]}], /frames ska vara/], [[{op: 'patch', frames: [1, 2], from: 0}], /antingen area/],
    [[{op: 'key', tolerance: 41}], /tolerance är 0–40/], [[{op: 'key', to: 'green'}], /to ska vara/], [[{op: 'level'}], /reference/], [[{op: 'trim'}], /minst en av dem/]] as [unknown, RegExp][])
    assert.match(readFixes(list).refusals.join(' | '), words, JSON.stringify(list));
  // Static limits, before any pixel is touched.
  const shape = {count: 20, width: W, height: H}, check = (ops: FixOp[]) => checkFixes(ops, shape).join(' | ');
  assert.match(check([{op: 'trim', end: 4}]), /högst 3 rutor i var ände/);
  assert.match(check([{op: 'trim', end: 2}, {op: 'hold', frames: [18, 18]}]), /klipps bort av trim/);
  assert.match(check([{op: 'trim', end: 1}, {op: 'trim', start: 1}]), /Bara ett trim-steg/);
  assert.match(check([{op: 'hold', frames: [4, 7]}]), /högst 3 rutor i rad hålls/);
  assert.match(check([{op: 'blend', frames: [4, 8]}]), /högst 4 rutor i rad blandas/);
  assert.match(check([{op: 'blend', frames: [0, 1]}]), /god ruta före och en efter/);
  assert.match(check([{op: 'patch', frames: [3, 5], from: 4, area: {x: 1, y: 1, w: 8, h: 8}}]), /utanför 3–5/);
  assert.match(check([{op: 'patch', frames: [3, 5], from: 2, area: {x: 1, y: 1, w: 8, h: 8}}]), /2,1 % av bilden; högst 2 %/);
  assert.match(check([{op: 'key', colour: [0, 0, 254], to: [0, 0, 200]}]), /omfärgning/);
  assert.match(check([{op: 'level', reference: 'x.png'}]), /referensbilden x.png saknas/);
  assert.match(check([{op: 'hold', frames: [25, 25]}]), /finns inte/);
  assert.match(check([{op: 'trim', start: 3}, {op: 'patch', frames: [3, 5], from: 2, area: {x: 1, y: 1, w: 7, h: 8}}]), /from 2 måste vara en kvarvarande ruta/);
  assert.deepEqual(check([{op: 'trim', start: 3, end: 3}, {op: 'blend', frames: [4, 7]}, {op: 'hold', frames: [10, 12]}, {op: 'patch', frames: [3, 5], from: 6, area: {x: 1, y: 1, w: 7, h: 8}}]), '');
});

test('trim drops frames at the ends only when the copy is written; frame numbers stay the film\'s', () => {
  const store = film(12), result = applyFixes(store, [{op: 'trim', start: 1, end: 2}]);
  assert.ok(result.ok); assert.deepEqual([result.keep, result.frameShift, result.changed], [[1, 9], 1, []]);
  assert.deepEqual(result.reports[0].measures, {dropStart: [0, 0], dropEnd: [10, 11]});
});

test('hold replaces a few frames by the nearest good one, and only where the picture stands still', () => {
  const store = film(12, f => frame({noise: f === 5 || f === 6 ? 60 : 0, seed: f + 1})), was = store.frames.map(f => f.slice());
  const result = applyFixes(store, [{op: 'hold', frames: [5, 6], why: 'två rutor med brus'}]);
  assert.ok(result.ok); assert.ok(same(store.frames[5], was[4]) && same(store.frames[6], was[7]), 'each frame takes its nearest good neighbour');
  assert.deepEqual([result.reports[0].changedFrames, result.reports[0].measures.sources, result.changed], [2, [4, 7], [5, 6]]);
  assert.ok(result.reports[0].maxPixelDiff > LIMITS.moved);
  // WAN 3's dark last frames, held instead of cut: one neighbour, and stillness measured against the frame before it.
  const tail = film(10, f => frame({skin: f >= 8 ? 0.8 : 1})), held = applyFixes(tail, [{op: 'hold', frames: [8, 9]}]);
  assert.ok(held.ok); assert.ok(same(tail.frames[9], tail.frames[7])); assert.deepEqual(held.reports[0].measures.measuredBetween, [7, 6]);
  // Inside a motion a held frame is a stall: refused.
  refused(applyFixes(film(12, f => frame({at: 4 + 3 * f})), [{op: 'hold', frames: [5, 5]}]), /fryser en rörelse/);
});

test('blend fills a short run with a blend of the good frames around it, never across motion', () => {
  const store = film(12, f => f === 5 || f === 6 ? frame({noise: 80, seed: f}) : frame({green: f >= 7 ? [0, 246, 63] : GREEN}));
  const result = applyFixes(store, [{op: 'blend', frames: [5, 6]}]);
  assert.ok(result.ok);
  assert.deepEqual(pixel(store.frames[5], 0, 0), [0, 242, 61]); assert.deepEqual(pixel(store.frames[6], 0, 0), [0, 244, 62]);
  refused(applyFixes(film(12, f => frame({at: 4 + 3 * f})), [{op: 'blend', frames: [5, 6]}]), /dubbelbild/);
});

test('patch copies a small area from another frame, and only where nothing moves around it', () => {
  const store = film(10, f => { const d = frame(); if (f >= 3 && f <= 5) for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) d.set([255, 0, 255], (y * W + x) * 3); return d; });
  const was = store.frames.map(f => f.slice()), result = applyFixes(store, [{op: 'patch', frames: [3, 5], from: 2, area: {x: 1, y: 1, w: 6, h: 6}, why: 'rosa fläck på det gröna'}]);
  assert.ok(result.ok); for (let f = 3; f <= 5; f++) assert.ok(same(store.frames[f], was[2]), `frame ${f}`);
  assert.deepEqual([result.reports[0].changedFrames, result.reports[0].pixelsChanged, result.reports[0].maxPixelDiff], [3, 12, 255]);
  // A mask works as an area; a hand that moves past the area is refused.
  const mask: Picture = {width: W, height: H, channels: 1, data: new Uint8Array(PX).map((_, p) => (p % W) >= 3 && (p % W) <= 4 && Math.floor(p / W) >= 3 && Math.floor(p / W) <= 4 ? 255 : 0)};
  const again = film(10, f => { const d = frame(); if (f === 4) d.set([255, 0, 255], (3 * W + 3) * 3); return d; });
  assert.ok(applyFixes(again, [{op: 'patch', frames: [4, 4], from: 3, mask: 'm.png'}], {'m.png': mask}).ok); assert.deepEqual(pixel(again.frames[4], 3, 3), GREEN);
  refused(applyFixes(film(10, f => frame({at: 2 + 4 * f})), [{op: 'patch', frames: [5, 5], from: 2, area: {x: 30, y: 2, w: 6, h: 6}}]), /något rör sig där/);
});

test('key sets every background pixel near the key colour to one exact colour, by the scene\'s own screen rule', () => {
  // The green with noise of ±6 levels: evened to the frame's own green, read in the empty corner. She is left alone.
  const store = film(4, f => frame({noise: 6, seed: f + 3})), was = store.frames.map(f => f.slice()), own = was.map(f => cornerColour(f, W, H));
  for (const c of own) assert.ok(Math.abs(c[1] - 240) <= 2 && c[1] - c[2] === 180, String(c));
  const result = applyFixes(store, [{op: 'key', to: 'key'}]);
  assert.ok(result.ok);
  for (const [i, f] of store.frames.entries()) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const person = x >= 10 && x < 26 && y >= 12 && y < 40; if (!person) assert.deepEqual(pixel(f, x, y), own[i], `${i}: ${x},${y}`); }
  for (let p = 0; p < PX; p++) { const x = p % W, y = Math.floor(p / W); if (x >= 10 && x < 26 && y >= 12 && y < 40) assert.deepEqual(pixel(store.frames[2], x, y), pixel(was[2], x, y)); }
  // The card's flat blue 0,0,254 becomes 0,0,255; a finger on the card and the green around it are not blue screen and stay.
  const card = film(3, () => { const d = frame(); for (let y = 2; y < 8; y++) for (let x = 40; x < 50; x++) d.set([0, 0, 254], (y * W + x) * 3); d.set([210, 160, 130], (4 * W + 44) * 3); d.set([20, 30, 230], (5 * W + 44) * 3); return d; });
  const blue = applyFixes(card, [{op: 'key', colour: [0, 0, 254], to: [0, 0, 255], tolerance: 4, area: {x: 36, y: 0, w: 20, h: 12}}]);
  assert.ok(blue.ok); assert.deepEqual(pixel(card.frames[1], 41, 3), [0, 0, 255]); assert.deepEqual(pixel(card.frames[1], 44, 4), [210, 160, 130]);
  assert.deepEqual(pixel(card.frames[1], 44, 5), [20, 30, 230], 'too far from the key colour'); assert.deepEqual(pixel(card.frames[1], 38, 3), GREEN);
  assert.deepEqual([blue.reports[0].changedFrames, blue.reports[0].pixelsChanged, blue.reports[0].maxPixelDiff], [3, 3 * 58, 1]);
  // A colour far from the frame's own green is a recolour, refused per frame.
  refused(applyFixes(film(2, () => frame({green: [0, 200, 40]})), [{op: 'key', to: [0, 240, 60]}]), /omfärgning/);
  assert.equal(SCREEN.hi, 0.9);
});

test('level brings every frame\'s green to the reference\'s and, asked, her tone too; a frame far from it is refused', () => {
  const reference: Picture = {width: W, height: H, data: frame()}, pictures = {'ref.png': reference};
  const store = film(3, () => frame({green: [0, 228, 52]})), was = store.frames.map(f => f.slice());
  const result = applyFixes(store, [{op: 'level', reference: 'ref.png'}], pictures);
  assert.ok(result.ok, JSON.stringify(result));
  for (const [x, y] of [[0, 0], [5, 30], [60, 45], [40, 5]]) assert.deepEqual(pixel(store.frames[1], x, y), GREEN, `${x},${y}`);
  assert.deepEqual(pixel(store.frames[1], 15, 20), pixel(was[1], 15, 20), 'her pixels are left as they were without tone');
  assert.equal(result.reports[0].measures.largestGreenShift, 12);
  // Her tone: 5 % darker in the film, brought back to the reference's.
  const dark = film(2, () => frame({green: [0, 236, 58], skin: 0.95})), toned = applyFixes(dark, [{op: 'level', reference: 'ref.png', tone: true}], pictures);
  assert.ok(toned.ok, JSON.stringify(toned));
  for (const [x, y] of [[14, 20], [20, 30]]) pixel(dark.frames[0], x, y).forEach((v, k) => assert.ok(Math.abs(v - pixel(reference.data, x, y)[k]) <= 1, `${x},${y}`));
  // A shadow in the reference (a hand hovering there) is never painted into a frame where it is not: only a drift moves.
  const shaded = frame(); for (let y = 30; y < 46; y++) for (let x = 40; x < 60; x++) shaded.set([0, 196, 44], (y * W + x) * 3);
  const plain = film(2, () => frame({green: [0, 236, 58]}));
  assert.ok(applyFixes(plain, [{op: 'level', reference: 'shade.png'}], {'shade.png': {width: W, height: H, data: shaded}}).ok);
  const inShadow = pixel(plain.frames[0], 50, 38)[1], outside = pixel(plain.frames[0], 5, 5)[1];
  assert.ok(Math.abs(inShadow - outside) <= 2, `green ${inShadow} where the reference has a shadow, ${outside} elsewhere`);
  refused(applyFixes(film(2, () => frame({green: [0, 196, 30]})), [{op: 'level', reference: 'ref.png'}], pictures), /annan bild, ingen nivå/);
  refused(applyFixes(film(2, () => frame({skin: 0.7})), [{op: 'level', reference: 'ref.png', tone: true}], pictures), /tonen skiljer för mycket/);
});

test('steps apply in order on what the steps before left, and one refused step refuses the list', () => {
  const store = film(12, f => frame({noise: f === 5 ? 60 : 4, seed: f + 9})), list: FixOp[] = [{op: 'key', to: 'key'}, {op: 'hold', frames: [5, 5]}, {op: 'trim', end: 2}];
  const result = applyFixes(store, list);
  assert.ok(result.ok); assert.ok(same(store.frames[5], store.frames[4]), 'the held frame is the keyed neighbour');
  assert.deepEqual(result.reports.map(r => r.op), ['key', 'hold', 'trim']); assert.deepEqual(result.keep, [0, 9]);
  assert.deepEqual(stripFrames(list, {count: 12, width: W, height: H}), [0, 1, 3, 4, 5, 6, 8, 9]);
  refused(applyFixes(film(12), [{op: 'key', to: 'key'}, {op: 'speed'} as FixOp]), /tempot ändras aldrig/);
});

// ── The tool ────────────────────────────────────────────────────────────────
const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
// Tests that make a film with ffmpeg; skipped where there is none.
const needsFfmpeg = {skip: spawnSync('ffmpeg', ['-version'], {stdio: 'ignore'}).status !== 0 && 'ffmpeg is not on this machine (the hosted check has none)'};
const sha = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
async function tinyFilm(t: {after(fn: () => Promise<void>): void}) {
  const root = await mkdtemp(path.join(base, 'film-fix-test-')); t.after(() => rm(root, {recursive: true, force: true}));
  const dir = path.join(root, 'take-1'); await mkdir(dir);
  const film = path.join(dir, 'source.mp4');
  // 12 frames at 30 fps of the green screen with a still block where she sits, the last two frames darker (as WAN 3 ends).
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x00F03C:s=64x48:r=30', '-frames:v', '12',
    '-vf', "drawbox=x=10:y=12:w=16:h=28:color=0xC89678:t=fill,eq=brightness=-0.15:enable='gte(n,10)'", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', film], {windowsHide: true});
  return {root, dir, film};
}

test('the tool writes the fixed copy beside the film with its receipt and strip, and never touches the original', needsFfmpeg, async t => {
  const {root, dir, film} = await tinyFilm(t), before = await sha(film), list = path.join(root, 'fixes.json');
  await writeFile(list, JSON.stringify([{op: 'trim', end: 2, why: 'mörka slutrutor'}, {op: 'key', to: 'key', why: 'jämna det gröna'}, {op: 'hold', frames: [5, 5]}, {op: 'blend', frames: [7, 8]}]));
  const outcome = await fixFilm(film, list);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.equal(await sha(film), before, 'the original is unchanged');
  assert.deepEqual((await readdir(dir)).sort(), ['fix-receipt-1.json', 'fix-strip-1.png', 'fixed-1.mp4', 'source.mp4']);
  const receipt = JSON.parse(await readFile(path.join(dir, 'fix-receipt-1.json'), 'utf8'));
  assert.equal(receipt.source.sha256, before); assert.equal(receipt.source.untouched, true); assert.equal(receipt.output.sha256, await sha(path.join(dir, 'fixed-1.mp4')));
  assert.deepEqual([receipt.source.frames, receipt.output.frames, receipt.output.width, receipt.output.height, receipt.output.fps, receipt.output.profile, receipt.output.pixelFormat], [12, 10, 64, 48, '30/1', 'High', 'yuv420p']);
  assert.deepEqual([receipt.output.keep, receipt.output.frameShift, receipt.output.dropped], [[0, 9], 0, {start: null, end: [10, 11]}]);
  assert.deepEqual(receipt.steps.map((s: {op: string}) => s.op), ['trim', 'key', 'hold', 'blend']);
  for (const step of receipt.steps) assert.ok(Number.isInteger(step.maxPixelDiff) && Number.isInteger(step.changedFrames), step.op);
  assert.ok(receipt.encodingCheck.meanAbsError < 2, JSON.stringify(receipt.encodingCheck));
  assert.deepEqual(receipt.fixes.list[0], {op: 'trim', end: 2, why: 'mörka slutrutor'});
  const strip = await sharp(path.join(dir, 'fix-strip-1.png')).metadata();
  assert.equal(strip.width, 64 * 3 + 8 * 4); assert.equal(receipt.strip.frames.length, strip.height === receipt.strip.frames.length * (48 + 22 + 8) + 8 ? receipt.strip.frames.length : -1);
  // A second run takes the next number; the first copy stays.
  const second = await fixFilm(film, list);
  assert.ok(second.ok); assert.equal(second.n, 2); assert.ok(existsSync(path.join(dir, 'fixed-1.mp4')));
});

test('a refused list writes nothing and the tool says why, with exit code 2', needsFfmpeg, async t => {
  const {root, dir, film} = await tinyFilm(t), list = path.join(root, 'fixes.json');
  await writeFile(list, JSON.stringify([{op: 'blend', frames: [3, 7]}]));
  const run = spawnSync(process.execPath, ['tools/film-fix.ts', film, list], {encoding: 'utf8', windowsHide: true});
  assert.equal(run.status, 2); assert.match(run.stderr, /högst 4 rutor i rad blandas/);
  assert.deepEqual(await readdir(dir), ['source.mp4']);
  await writeFile(list, JSON.stringify([{op: 'level', reference: path.join(root, 'none.png')}]));
  const missing = await fixFilm(film, list);
  assert.equal(missing.ok, false); assert.match((missing as {refusals: string[]}).refusals[0], /finns inte/); assert.deepEqual(await readdir(dir), ['source.mp4']);
});
