// Offline tests for the register of what is what per dealer (data/media-roles.json, tools/media-roles.ts): the checkout's
// register holds and gives every first and last picture of the job file a role, the readers of picture and film headers,
// and the store that adds a picture, which only ever writes into a temporary copy. No media is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {imageSize, moovFacts, mediaRoles, sniffImage} from './media-roles.ts';
import {ROLES, UPLOAD_LIMIT, entryKey, pictureKey, unassigned, usesOf, validateRegister, type Register} from '../studio/lib/media.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
async function temp(t: {after(fn: () => Promise<void>): void}, register: unknown, jobs: unknown = {jobs: []}) {
 const root = await mkdtemp(path.join(base, 'media-roles-')); t.after(() => rm(root, {recursive: true, force: true}));
 await mkdir(path.join(root, 'data'), {recursive: true});
 await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2) + '\n');
 await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify(jobs));
 return root;
}
const fails = (status: number) => (error: unknown) => (error as {status?: number}).status === status;

// A PNG as far as its header goes: the signature and an IHDR with the size.
function png(width: number, height: number, extra = 64): Uint8Array {
 const b = Buffer.alloc(33 + extra);
 Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
 b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b[24] = 8; b[25] = 6;
 return b;
}
// A JPEG with an APP0 segment before its frame header.
function jpeg(width: number, height: number): Uint8Array {
 return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xdb, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}
const box = (type: string, ...parts: Uint8Array[]) => { const body = Buffer.concat(parts), head = Buffer.alloc(8); head.writeUInt32BE(8 + body.length, 0); head.write(type, 4, 'latin1'); return Buffer.concat([head, body]); };
const u32 = (...values: number[]) => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v, i * 4)); return b; };
// The moov of a film: a sound track first (no size), then the video track with its size, time scale and frames.
function moov(width: number, height: number, timescale: number, delta: number, frames: number) {
 const tkhd = (w: number, h: number) => box('tkhd', u32(0, 0, 0, 1, 0, 0), Buffer.alloc(8 + 8 + 36), u32(w * 65536, h * 65536));
 const track = (w: number, h: number) => box('trak', tkhd(w, h), box('mdia', box('mdhd', u32(0, 0, 0, timescale, frames * delta, 0)), box('minf', box('stbl', box('stts', u32(0, 1, frames, delta))))));
 return box('moov', box('mvhd', Buffer.alloc(100)), track(0, 0), track(width, height));
}

const entry = (extra: Record<string, unknown>) => ({role: 'ankare-1', name: 'Vila', ...extra});
const small = (entries: unknown[], more: Record<string, unknown> = {}) => ({schemaVersion: 1, dealers: {pamela: {name: 'Pamela', entries, ...more}, paow: {name: 'Paow', entries: []}}, measures: []});

test('the checkout: the register holds, and every first and last picture of the job file has a role', async () => {
 const register = JSON.parse(await readFile('data/media-roles.json', 'utf8')), jobs = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')).jobs;
 const {errors} = validateRegister(register);
 assert.deepEqual(errors, []);
 assert.deepEqual(unassigned(register as Register, jobs), [], 'a picture of data/clip-jobs.json has no role in data/media-roles.json');
 // Pamela and Paow come first; a dealer added later (Petra, a separate track with proofs only, 2026-11-13) follows them.
 assert.deepEqual(Object.keys(register.dealers).slice(0, 2), ['pamela', 'paow']);
 // Today's facts: Pamela has no ingångsbild and no keystone in high resolution, and says so; her three anchors hold, one each.
 const pamela = register.dealers.pamela;
 assert.ok(pamela.missing.ingangsbild && pamela.missing.keystone);
 assert.equal(pamela.entries.filter((e: {role: string}) => e.role === 'ingangsbild').length, 0);
 for (const role of ['ankare-1', 'ankare-2.1', 'ankare-2.2']) assert.equal(pamela.entries.filter((e: {role: string; state?: string}) => e.role === role && e.state === 'gäller').length, 1, role);
 assert.equal(pamela.entries.find((e: {id: string}) => e.id === 'pamela-vila').frame, 0);
 // Paow's two keystones are the copied ones, and her films lie outside the bank, counted per ledger.
 const paow = register.dealers.paow;
 assert.deepEqual(paow.entries.filter((e: {role: string; state?: string}) => e.role === 'keystone' && e.state === 'gäller').map((e: {path: string}) => e.path), ['assets/keystones/paow-staende/keystone.png', 'assets/keystones/paow-sittande/keystone.png']);
 assert.ok(paow.outside.ledgers.length >= 1 && paow.outside.ledgers.every((l: {file: string; films: number; usable: number}) => /^bestallningar-[a-z0-9]+\.json$/.test(l.file) && l.usable <= l.films));
 for (const d of Object.values(register.dealers) as {entries: {role: string}[]}[]) for (const e of d.entries) assert.ok(ROLES.includes(e.role as never));
});

test('a job picture is matched by its file or by its film and frame', () => {
 const jobs = [
  {id: 'a', from: 'READY', to: 'LAND(P4.C1)', first: {file: {path: 'assets/x/start.png', sha256: 'x'}}, last: {frame: {video: 'assets/motions/a/source.mp4', videoSha256: '', index: 105}}},
  {id: 'b', from: 'IDLE', to: 'AWAY', first: {frame: {video: 'assets/motions/a/source.mp4', index: 105}}, last: null},
 ];
 assert.equal(pictureKey(jobs[0].first), 'file:assets/x/start.png');
 assert.equal(pictureKey(jobs[0].last), 'frame:assets/motions/a/source.mp4#105');
 assert.equal(pictureKey(null), null);
 assert.equal(entryKey({path: 'assets/motions/a/source.mp4', frame: 105}), 'frame:assets/motions/a/source.mp4#105');
 assert.equal(entryKey({path: 'assets/x/start.png'}), 'file:assets/x/start.png');
 assert.equal(entryKey({path: 'assets/frames/a.png', pattern: 'assets/frames/*.png'}), null);
 const uses = usesOf(jobs);
 assert.deepEqual(uses.get('frame:assets/motions/a/source.mp4#105')?.map(u => `${u.job}:${u.side}`), ['a:last', 'b:first']);
 const register = small([entry({id: 'start', path: 'assets/x/start.png'})]) as Register;
 assert.deepEqual(unassigned(register, jobs), ['frame:assets/motions/a/source.mp4#105']);
});

test('the register is checked: roles, states, paths, frames and unique ids', () => {
 assert.deepEqual(validateRegister(small([entry({id: 'a', path: 'assets/a.png', state: 'gäller', card: 'P4.C1'})])).errors, []);
 const bad = validateRegister(small([
  entry({id: 'a', path: 'assets/a.png'}), entry({id: 'a', path: 'assets/b.png'}),
  entry({id: 'c', role: 'kant', path: 'assets/c.png'}), entry({id: 'd', path: '../secret.png'}), entry({id: 'e', path: 'assets/e.png', frame: 3}),
  entry({id: 'f', path: 'assets/f.png', state: 'kanske'}), entry({id: 'g', path: 'assets/g.png', card: 'P8.C1'}), entry({id: 'h'}),
 ]));
 assert.equal(bad.register, null);
 for (const word of ['id finns redan', 'okänd roll kant', 'sökvägen', 'en ruta ska', 'tillståndet', 'kortet skrivs', 'varken fil']) assert.ok(bad.errors.some(e => e.includes(word)), word);
 assert.ok(validateRegister({schemaVersion: 1}).errors.length);
});

test('picture headers: PNG and JPEG by their own bytes, never by the name', () => {
 assert.deepEqual(imageSize(png(1764, 1174)), {width: 1764, height: 1174, type: 'png'});
 assert.deepEqual(imageSize(jpeg(4800, 3584)), {width: 4800, height: 3584, type: 'jpeg'});
 assert.equal(sniffImage(Buffer.from('GIF89a')), null);
 assert.equal(imageSize(Buffer.from('not a picture at all')), null);
});

test('film headers: size, frames per second and length of the video track', () => {
 assert.deepEqual(moovFacts(moov(1764, 1174, 15360, 512, 120)), {width: 1764, height: 1174, fps: 30, frames: 120});
 assert.deepEqual(moovFacts(moov(1764, 1172, 12288, 512, 169)), {width: 1764, height: 1172, fps: 24, frames: 169});
 assert.equal(moovFacts(box('free', Buffer.alloc(4))), null);
});

test('answer: found on disk, its size, the films that start or end on it, and only named files are handed out', async t => {
 const jobs = {jobs: [{id: 'pamela-x-01', from: 'READY', to: 'LAND(P4.C1)', first: {file: {path: 'assets/anchors/pamela-a/anchor.png'}}, last: {file: {path: 'assets/anchors/pamela-b/anchor.png'}}}], derived: [{}, {}], edits: []};
 const root = await temp(t, small([
  entry({id: 'pamela-a', role: 'ankare-2.1', path: 'assets/anchors/pamela-a/anchor.png', state: 'gäller'}),
  entry({id: 'pamela-b', role: 'landning', path: 'assets/anchors/pamela-b/anchor.png', card: 'P4.C1'}),
  entry({id: 'pamela-gone', path: 'assets/anchors/pamela-gone/anchor.png'}),
  entry({id: 'pamela-ute', path: 'Q:/nowhere/at/all.png'}),
  entry({id: 'pamela-prov', role: 'prov', proof: 'some-proof'}),
 ], {films: {from: 'data/clip-jobs.json', prefix: 'pamela-', note: ''}}), jobs);
 await mkdir(path.join(root, 'assets/anchors/pamela-a'), {recursive: true});
 await writeFile(path.join(root, 'assets/anchors/pamela-a/anchor.png'), png(1764, 1174));
 await mkdir(path.join(root, 'assets/proofs/some-proof'), {recursive: true});
 await writeFile(path.join(root, 'assets/secret.png'), png(10, 10));
 const store = mediaRoles(root), answer = await store.answer();
 assert.equal(answer.readable, true);
 assert.deepEqual(answer.unassigned, []);
 const pamela = answer.dealers[0], by = (id: string) => pamela.entries.find(e => e.id === id)!;
 assert.deepEqual(pamela.bank, {jobs: 1, derived: 2, edits: 0});
 assert.deepEqual([by('pamela-a').exists, by('pamela-a').width, by('pamela-a').height, by('pamela-a').served], [true, 1764, 1174, 'assets/anchors/pamela-a/anchor.png']);
 assert.deepEqual(by('pamela-a').usedBy, [{job: 'pamela-x-01', side: 'first', from: 'READY', to: 'LAND(P4.C1)', edge: 'READY>P4.C1'}]);
 assert.equal(by('pamela-b').usedBy[0].side, 'last');
 assert.equal(by('pamela-gone').exists, false);
 assert.deepEqual([by('pamela-ute').exists, by('pamela-ute').inside, by('pamela-ute').served], [false, false, null]);
 assert.equal(by('pamela-prov').exists, true);
 assert.equal(await store.servable('assets/anchors/pamela-a/anchor.png'), true);
 assert.equal(await store.servable('assets/secret.png'), false, 'a file the register does not name');
 assert.equal(await store.servable('assets/anchors/pamela-a/../../secret.png'), false);
 assert.equal(await store.servable('Q:/nowhere/at/all.png'), false);
});

test('add: a new folder with the picture and its receipt, a candidate in the register; never over an existing one', async t => {
 const root = await temp(t, small([]));
 const store = mediaRoles(root), now = new Date('2026-11-12T20:00:00Z');
 const result = await store.add({dealer: 'paow', role: 'keystone', name: 'sittande-c', title: 'Sittande C', filename: 'C:\\Users\\x\\bild.png', type: 'png', bytes: png(4800, 3584), now});
 assert.equal(result.entry.path, 'assets/keystones/paow-sittande-c/keystone.png');
 assert.deepEqual(await readdir(path.join(root, 'assets/keystones/paow-sittande-c')), ['keystone.png', 'receipt.json']);
 const receipt = JSON.parse(await readFile(path.join(root, 'assets/keystones/paow-sittande-c/receipt.json'), 'utf8'));
 assert.deepEqual([receipt.original.fileName, receipt.original.width, receipt.original.height, receipt.createdAt, receipt.original.sha256.length], ['bild.png', 4800, 3584, now.toISOString(), 64]);
 const register = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8'));
 assert.deepEqual(register.dealers.paow.entries.map((e: {id: string; state: string; role: string}) => [e.id, e.role, e.state]), [['paow-sittande-c', 'keystone', 'kandidat']]);
 assert.deepEqual(validateRegister(register).errors, []);
 assert.ok(existsSync(path.join(root, '.runtime/media-roles-previous.json')));
 // An anchor goes under assets/anchors/; the same name again is refused and the first stays as it was.
 const anchor = await store.add({dealer: 'paow', role: 'ankare-2.1', name: 'nyp-ung', title: 'Nyp, yngre', filename: 'a.jpg', type: 'jpeg', bytes: jpeg(1764, 1174), now});
 assert.equal(anchor.entry.path, 'assets/anchors/paow-nyp-ung/anchor.jpg');
 // An added anchor says which node it stands for, or a draft that waits for "ankare 2.1 (READY)" never finds it; a keystone has none.
 assert.equal(anchor.entry.node, 'READY');
 assert.equal(result.entry.node, undefined);
 await assert.rejects(store.add({dealer: 'paow', role: 'keystone', name: 'sittande-c', title: 'Igen', filename: 'b.png', type: 'png', bytes: png(100, 200), now}), fails(409));
 const kept = await readFile(path.join(root, 'assets/keystones/paow-sittande-c/keystone.png'));
 assert.equal(imageSize(kept)?.width, 4800);
 // A folder already on disk, though not in the register, is not written into either.
 await mkdir(path.join(root, 'assets/anchors/paow-finns'), {recursive: true});
 await assert.rejects(store.add({dealer: 'paow', role: 'ankare-1', name: 'finns', title: 'Finns', filename: 'c.png', type: 'png', bytes: png(1764, 1174), now}), fails(409));
 assert.deepEqual(await readdir(path.join(root, 'assets/anchors/paow-finns')), []);
});

test('add refuses what it should not take, and leaves nothing behind when the register cannot be written', async t => {
 const root = await temp(t, small([]));
 const store = mediaRoles(root), good = {dealer: 'paow', role: 'ankare-1', name: 'vila', title: 'Vila', filename: 'v.png', type: 'png', bytes: png(1764, 1174)};
 await assert.rejects(store.add({...good, role: 'landning'}), fails(400));
 await assert.rejects(store.add({...good, name: 'Vila Ung'}), fails(400));
 await assert.rejects(store.add({...good, name: '../ut'}), fails(400));
 await assert.rejects(store.add({...good, title: ' '}), fails(400));
 await assert.rejects(store.add({...good, dealer: 'kevin'}), fails(404));
 await assert.rejects(store.add({...good, type: 'gif'}), fails(415));
 await assert.rejects(store.add({...good, type: 'jpeg'}), fails(415), 'a PNG said to be a JPEG');
 await assert.rejects(store.add({...good, bytes: Buffer.alloc(0)}), fails(400));
 await assert.rejects(store.add({...good, bytes: Buffer.alloc(UPLOAD_LIMIT + 1)}), fails(413));
 assert.equal(existsSync(path.join(root, 'assets')), false);
 // .runtime is a file here, so the register cannot be written: the new folder goes again.
 await writeFile(path.join(root, '.runtime'), 'x');
 await assert.rejects(store.add(good));
 assert.equal(existsSync(path.join(root, 'assets/anchors/paow-vila')), false);
 assert.deepEqual(JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8')).dealers.paow.entries, []);
});
