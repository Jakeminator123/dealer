// Bringing a delivered take to where Jakob judges it (tools/order-bring.ts), in a temporary folder with an order approved
// through the store, a tiny film FFmpeg makes and a picture: a film into the bank's inbox and Material's row Filmer as a
// candidate, a still into Material as a candidate anchor through the register's own add, the proof copy only when asked,
// and INFÖRD only once the reviewer's verdict is on the take or when told. Run again, it leaves what is there alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ARM_AT_SHOE, POSE_WHAT, orderStore } from './order-store.ts';
import { receipts } from './order-put.ts';
import { bring, nameOf } from './order-bring.ts';

const needsFfmpeg = { skip: spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0 && 'ffmpeg is not on this machine (the hosted check has none)' };
const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
const now = () => new Date('2026-11-13T06:00:00Z');
const read = async (root: string, file: string) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

async function lab(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(base, 'order-bring-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'placements', 'motions', 'assets/anchors/a', 'assets/anchors/b', 'assets/proofs/natten']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['data/order-policy.json', 'data/dealers.json', 'placements/default.json']) await copyFile(file, path.join(root, file));
  const png = await sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r: 0, g: 237, b: 44 } } }).png().toBuffer();
  await writeFile(path.join(root, 'assets/anchors/a/anchor.png'), png);
  await writeFile(path.join(root, 'assets/anchors/b/anchor.png'), png);
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({ schemaVersion: 1, jobs: [], derived: [], edits: [] }, null, 2) + '\n');
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify({ schemaVersion: 1, measures: [], dealers: {
    pamela: { name: 'Pamela', entries: [{ id: 'pamela-nyp', role: 'ankare-2.1', name: 'Nyp', path: 'assets/anchors/b/anchor.png', node: 'READY', state: 'gäller' }] },
    paow: { name: 'Paow', entries: [{ id: 'paow-vila', role: 'ankare-1', name: 'Vila', path: 'assets/anchors/a/anchor.png', node: 'IDLE', state: 'gäller' }] },
  } }, null, 2) + '\n');
  await writeFile(path.join(root, 'assets/proofs/natten/proof.json'), JSON.stringify({ title: 'Natten', labels: { '1-forsta.mp4': 'Första' }, verdicts: { '1-forsta.mp4': 'unreviewed' } }, null, 2));
  const store = orderStore(root, { now });
  const r = receipts(root, { now });
  return { root, store, r, png };
}
/** An order approved and placed, its take fetched and after-worked: the film or picture lies in take-1/. */
async function delivered(root: string, store: ReturnType<typeof orderStore>, r: ReturnType<typeof receipts>, id: string, input: Parameters<ReturnType<typeof orderStore>['create']>[0], file: (dir: string) => Promise<string>) {
  const draft = await store.create({ ...input, id, takes: 1 });
  await store.approve(id, draft.revision);
  await r.begin(id, 1);
  await r.placed(id, 1, 'b90b9362-7a13-4b80-b498-c324f02c41f8');
  await r.advance(id, 1, 'KLAR');
  const dir = path.join(root, 'assets/orders', id, 'take-1');
  await mkdir(dir, { recursive: true });
  const after = await file(dir);
  await r.advance(id, 1, 'HÄMTAD', { file: path.relative(root, after) });
  await r.advance(id, 1, 'EFTERARBETAD', { file: path.relative(root, after) });
}

test('a film: into the bank\'s inbox and Material as a candidate; INFÖRD only after the review, or when told; run again it changes nothing', needsFfmpeg, async (t) => {
  const { root, store, r } = await lab(t);
  const make = async (dir: string) => {
    const film = path.join(dir, 'after.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x00ED2C:s=64x48:r=24', '-frames:v', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', film], { windowsHide: true });
    await copyFile(film, path.join(dir, 'source.mp4'));
    return film;
  };
  await delivered(root, store, r, 'paow-vila-09', { dealer: 'paow', step: 'VILA' }, make);
  assert.equal(nameOf({ id: 'paow-vila-09', dealer: 'paow' }, 1), 'vila-09-t1');
  // --dry writes nothing.
  const dry = await bring(root, 'paow-vila-09', 1, { dry: true, now });
  assert.deepEqual([dry.bank, dry.material], [['paow-vila-09-01'], { id: 'paow-film-vila-09-t1', done: 'skulle föras in' }]);
  assert.equal((await read(root, 'data/clip-jobs.json')).derived.length, 0);
  // Without the reviewer's verdict: in the bank and Material, the receipt left as it is.
  const first = await bring(root, 'paow-vila-09', 1, { proof: 'natten', now });
  assert.deepEqual(first.bank, ['paow-vila-09-01']);
  assert.deepEqual(first.material, { id: 'paow-film-vila-09-t1', done: 'införd' });
  assert.equal(first.receipt, 'EFTERARBETAD');
  assert.match(first.notes.at(-1)!, /granskarens dom saknas.*order-put\.ts review paow-vila-09 1/);
  const record = await read(root, 'motions/paow-vila-09-01.json');
  assert.deepEqual([record.review.decision, record.review.inbox, record.dealer], ['PENDING', true, 'paow'], 'in the inbox, waiting for Jakob');
  const entry = (await read(root, 'data/media-roles.json')).dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-film-vila-09-t1');
  assert.deepEqual([entry.role, entry.state, entry.path, entry.fps, entry.still], ['film', 'kandidat', 'assets/films/paow/vila-09-t1/source.mp4', 24, 7]);
  assert.equal((await read(root, 'assets/films/paow/vila-09-t1/receipt.json')).original.order, 'paow-vila-09');
  assert.equal(first.proof, 'assets/proofs/natten/2-vila-09-t1.mp4');
  assert.equal((await read(root, 'assets/proofs/natten/proof.json')).verdicts['2-vila-09-t1.mp4'], 'unreviewed');
  // The review recorded beside the take: brought in again, nothing is added twice, and the receipt says INFÖRD.
  await r.review('paow-vila-09', 1, 'Oberoende granskare: 3/5 användbar med anmärkningar.');
  const again = await bring(root, 'paow-vila-09', 1, { proof: 'natten', now });
  assert.deepEqual([again.material!.done, again.proof, again.receipt], ['fanns', 'assets/proofs/natten/2-vila-09-t1.mp4', 'INFÖRD']);
  assert.match(again.notes[0], /finns redan/);
  assert.equal((await read(root, 'data/clip-jobs.json')).derived.length, 1);
  assert.equal((await read(root, 'data/media-roles.json')).dealers.paow.entries.filter((e: { id: string }) => e.id === 'paow-film-vila-09-t1').length, 1);
  assert.equal((await r.read('paow-vila-09'))!.takes[0].status, 'INFÖRD');
  // When told: INFÖRD without the review.
  await delivered(root, store, r, 'paow-vila-10', { dealer: 'paow', step: 'VILA' }, make);
  assert.equal((await bring(root, 'paow-vila-10', 1, { inford: true, now })).receipt, 'INFÖRD');
  assert.match((await r.read('paow-vila-10'))!.takes[0].history.at(-1)!.note!, /före granskningen, på uppdrag/);
  await assert.rejects(bring(root, 'paow-vila-10', 1, { name: 'Fel Namn', now }), /bara ha a–z/);
});

test('a still: the after-worked picture into Material as a candidate of the role the order makes, never as gäller', async (t) => {
  const { root, store, r, png } = await lab(t);
  await delivered(root, store, r, 'paow-ankare-2-1-09', { dealer: 'paow', step: 'ANKARE-2.1', pose: { entry: 'pamela-nyp', keep: ARM_AT_SHOE, what: POSE_WHAT } }, async (dir) => { const f = path.join(dir, 'after.png'); await writeFile(f, png); return f; });
  const done = await bring(root, 'paow-ankare-2-1-09', 1, { now, title: 'Nyp, nionde' });
  assert.deepEqual([done.kind, done.bank, done.material], ['STILL', null, { id: 'paow-ankare-2-1-09-t1', done: 'införd' }]);
  const entry = (await read(root, 'data/media-roles.json')).dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-ankare-2-1-09-t1');
  assert.deepEqual([entry.role, entry.node, entry.state, entry.name, entry.path], ['ankare-2.1', 'READY', 'kandidat', 'Nyp, nionde', 'assets/anchors/paow-ankare-2-1-09-t1/anchor.png']);
  assert.match((await read(root, 'assets/anchors/paow-ankare-2-1-09-t1/receipt.json')).by, /beställningen paow-ankare-2-1-09, tagning 1/);
  assert.equal(done.receipt, 'EFTERARBETAD');
  assert.equal((await bring(root, 'paow-ankare-2-1-09', 1, { now })).material!.done, 'fanns');
  // A take that is not fetched is not brought.
  const draft = await store.create({ dealer: 'paow', step: 'ANKARE-2.1', id: 'paow-ankare-2-1-10', takes: 1, pose: { entry: 'pamela-nyp', keep: ARM_AT_SHOE, what: POSE_WHAT } });
  await store.approve('paow-ankare-2-1-10', draft.revision);
  await r.begin('paow-ankare-2-1-10', 1);
  await assert.rejects(bring(root, 'paow-ankare-2-1-10', 1, { now }), /inte lagd|OSÄKER/);
});
