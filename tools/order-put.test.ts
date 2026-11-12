// The receipt writer (tools/order-put.ts) keeps exactly-once: requestedAt before the call, the task id after, a begun
// take never begun again, nothing for an order that is not approved or has changed since, files checked against their hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { orderStore } from './order-store.ts';
import { receipts } from './order-put.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();

async function approved(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(base, 'order-put-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'placements', 'assets/anchors/a', 'assets/anchors/b']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['data/order-policy.json', 'data/dealers.json', 'placements/default.json']) await copyFile(file, path.join(root, file));
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 237, b: 44 } } }).png().toBuffer();
  await writeFile(path.join(root, 'assets/anchors/a/anchor.png'), png);
  await writeFile(path.join(root, 'assets/anchors/b/anchor.png'), png);
  await writeFile(path.join(root, 'data/clip-jobs.json'), '{"jobs": []}');
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify({ schemaVersion: 1, measures: [], dealers: {
    pamela: { name: 'Pamela', entries: [{ id: 'pamela-nyp', role: 'ankare-2.1', name: 'Nyp', path: 'assets/anchors/b/anchor.png', node: 'READY', state: 'gäller' }] },
    paow: { name: 'Paow', entries: [{ id: 'paow-vila', role: 'ankare-1', name: 'Vila', path: 'assets/anchors/a/anchor.png', node: 'IDLE', state: 'gäller' }] },
  } }));
  const store = orderStore(root);
  const draft = await store.create({ dealer: 'paow', step: 'ANKARE-2.1', id: 'prov-ett' });
  const r = receipts(root, { now: () => new Date('2026-11-12T22:00:00Z') });
  await assert.rejects(r.begin('prov-ett', 1), /inte godkänd/);
  await store.approve('prov-ett', draft.revision);
  return { root, r, store };
}

test('requestedAt before, task id after, and a begun take is never begun again', async (t) => {
  const { root, r } = await approved(t);
  const check = await r.check('prov-ett');
  assert.deepEqual(check.files.map((f) => [f.name, f.mimeType, f.tag, f.goesAs]), [['anchor.png', 'image/png', 'anchor', 'referenceImage'], ['pose.png', 'image/png', 'pose', 'referenceImage']]);
  const begun = await r.begin('prov-ett', 1);
  assert.equal(begun.take.status, 'OSÄKER');
  assert.equal(begun.take.requestedAt, '2026-11-12T22:00:00.000Z');
  assert.equal(begun.request.tool, 'generate_image');
  assert.equal(begun.request.args.model, 'nano-banana-pro');
  assert.equal(begun.request.args.confirmRepeat, undefined);
  await assert.rejects(r.begin('prov-ett', 1), /aldrig igen/);
  await assert.rejects(r.begin('prov-ett', 3), /1–2/);
  await assert.rejects(r.placed('prov-ett', 2, 'task-0000-1111'), /kör begin först/);
  const placed = await r.placed('prov-ett', 1, 'b90b9362-7a13-4b80-b498-c324f02c41f8', 17804);
  assert.equal(placed.take.status, 'LAGD');
  assert.equal(placed.take.creditsRemainingAfter, 17804);
  await assert.rejects(r.placed('prov-ett', 1, 'b90b9362-7a13-4b80-b498-c324f02c41f9'), /redan task-id/);
  assert.equal((await r.begin('prov-ett', 2)).request.args.confirmRepeat, true);
  await r.failed('prov-ett', 2, 'model_unavailable');
  await assert.rejects(r.begin('prov-ett', 2), /MISSLYCKAD/);
  // Forward only; HÄMTAD keeps the file and its hash.
  await assert.rejects(r.advance('prov-ett', 1, 'HÄMTAD'), /--file/);
  await writeFile(path.join(root, 'assets/orders/prov-ett/tagning-1.png'), 'png');
  const fetched = await r.advance('prov-ett', 1, 'HÄMTAD', { file: 'assets/orders/prov-ett/tagning-1.png' });
  assert.equal(fetched.take.file, 'assets/orders/prov-ett/tagning-1.png');
  assert.equal(fetched.take.sha256?.length, 64);
  await assert.rejects(r.advance('prov-ett', 1, 'KLAR'), /bakåt/);
  const receipt = JSON.parse(await readFile(path.join(root, 'assets/orders/prov-ett/receipt.json'), 'utf8'));
  assert.deepEqual(receipt.takes.map((x: { take: number; status: string }) => [x.take, x.status]), [[1, 'HÄMTAD'], [2, 'MISSLYCKAD']]);
  assert.deepEqual(receipt.takes[0].history.map((h: { status: string }) => h.status), ['OSÄKER', 'LAGD', 'HÄMTAD']);
});

test('nothing is placed for an order that changed after approval or whose picture changed on disk', async (t) => {
  const { root, r } = await approved(t);
  const file = path.join(root, 'data/orders/prov-ett.json');
  const order = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify({ ...order, takes: 1 }, null, 2));
  await assert.rejects(r.begin('prov-ett', 1), /ändrats efter godkännandet/);
  await writeFile(file, JSON.stringify(order, null, 2));
  await writeFile(path.join(root, 'assets/orders/prov-ett/pose.png'), 'other');
  await assert.rejects(r.begin('prov-ett', 1), /inte den godkända filen/);
});
