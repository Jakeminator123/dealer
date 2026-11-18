// tools/order-import.ts: a take ordered outside Beställ becomes an order and a receipt that say so, read like any saved order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {isoOf, namedFiles, planImport, writeImport} from './order-import.ts';
import {orderStore} from './order-store.ts';
import {receipts} from './order-put.ts';
import {hashInput, validateOrder} from '../src/order-model.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();

async function setUp() {
  const root = await mkdtemp(path.join(base, 'order-import-')), work = path.join(root, 'work');
  await mkdir(path.join(root, 'data', 'orders'), {recursive: true}); await mkdir(work);
  await writeFile(path.join(root, 'data', 'order-policy.json'), JSON.stringify({schemaVersion: 1, enabled: true, prices: []}));
  const files: Record<string, Buffer> = {first: Buffer.from('first picture'), last: Buffer.from('last picture'), film: Buffer.from('delivered film'), after: Buffer.from('after-worked film')};
  for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(work, `${name}.bin`), bytes);
  await writeFile(path.join(work, 'after.json'), '{"dealCheck": {"pass": true}}');
  await writeFile(path.join(work, 'text.txt'), 'Locked camera, one continuous shot. Her hand at the shoe strokes the card out.\n');
  const ledger = {about: 'test', mandate: 'Jakob 2026-11-18: en giv till plats fem', sent: {forsta: {file: 'first.bin', sha256: sha(files.first)}}, orders: [
    {name: 't1', tool: 'generate_video', model: 'kling-4', params: {resolution: '1080p', duration: 3, startFrame: 'forsta', endFrame: 'sista', referenceVideos: [], ratio: null}, textFile: 'text.txt',
      pictures: {sista: {file: 'last.bin', sha256: sha(files.last), what: 'egen slutruta'}}, approvedBy: "huvudagenten, meddelande kl. 03.46: 'Ja till en tagning'", requestedAt: '2026-11-18T03:48', taskId: '2a5d46d2-1cf5-4056-be61-8a0a39a75ffe',
      credits: 64, creditsHow: 'saldot före och efter', balanceBefore: 5456, balanceAfter: 5392, delivered: {file: 'film.bin', sha256: sha(files.film)}, after: {file: 'after.bin', sha256: sha(files.after), tool: 'film-after'}, outcome: 'höll'},
  ]};
  await writeFile(path.join(work, 'ledger.json'), JSON.stringify(ledger));
  const input = {ledgerPath: path.join(work, 'ledger.json'), entry: 't1', id: 'paow-giv-2-3-p5-01', step: 'GIV-2.3', target: 'P5.C1', by: 'sessionen MODEL', after: path.join(work, 'after.bin'), now: () => new Date('2026-11-18T10:00:00Z')};
  return {root, work, input};
}

test('a ledger time without a zone is Swedish time; the named files are found in every entry', () => {
  assert.equal(isoOf('2026-11-18T03:48'), '2026-11-18T02:48:00.000Z');
  assert.equal(isoOf('2026-07-01T12:00'), '2026-07-01T10:00:00.000Z');
  assert.equal(isoOf('2026-11-18T03:48:00Z'), '2026-11-18T03:48:00.000Z');
  assert.deepEqual(Object.keys(namedFiles({sent: {a: {file: 'a', sha256: 'x'}}, orders: [{pictures: {b: {file: 'b', sha256: 'y'}}, reference: {c: {file: 'c', sha256: 'z'}}} as never]})).sort(), ['a', 'b', 'c']);
});

test('an outside take becomes an approved order and a receipt that say so, and the store reads the order like any other', async () => {
  const {root, input} = await setUp();
  try {
    const plan = await planImport(root, input);
    assert.equal(existsSync(path.join(root, 'data', 'orders', 'paow-giv-2-3-p5-01.json')), false, 'planning writes nothing');
    await writeImport(root, plan, input.now);
    const order = JSON.parse(await readFile(path.join(root, 'data', 'orders', 'paow-giv-2-3-p5-01.json'), 'utf8'));
    assert.deepEqual(validateOrder(order).errors, []);
    assert.equal(order.status, 'GODKÄND');
    assert.equal(order.approval.by, 'huvudagent');
    assert.match(order.approval.mandate, /Ja till en tagning/);
    assert.equal(order.approval.orderSha256, sha(hashInput(order)), 'the approval holds the order as written');
    assert.equal(order.prompt.text, 'Locked camera, one continuous shot. Her hand at the shoe strokes the card out.', 'the text as sent');
    assert.equal(order.outside.placedBy, 'sessionen MODEL');
    assert.match(order.notes[0], /^Beställd utanför Beställ/);
    assert.deepEqual(order.pictures.map((p: {name: string}) => p.name), ['first.png', 'last.png']);
    assert.equal(order.motion.grip, 'TWO_HANDS');
    const {order: loaded} = await orderStore(root).load('paow-giv-2-3-p5-01');
    assert.equal(loaded.id, 'paow-giv-2-3-p5-01');
    const receipt = await receipts(root).read('paow-giv-2-3-p5-01');
    const take = receipt!.takes[0] as typeof receipt.takes[number] & {outside?: boolean};
    assert.deepEqual([take.status, take.requestedAt, take.taskId, take.outside, take.creditsRemainingAfter], ['EFTERARBETAD', '2026-11-18T02:48:00.000Z', '2a5d46d2-1cf5-4056-be61-8a0a39a75ffe', true, 5392]);
    assert.match(take.history[0].note ?? '', /lagd utanför Beställ av sessionen MODEL/);
    assert.ok(existsSync(path.join(root, 'assets', 'orders', 'paow-giv-2-3-p5-01', 'take-1', 'after.mp4')));
    await assert.rejects(planImport(root, input), /finns redan/, 'an order is never written over');
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('a file that is not the one the ledger describes is refused and nothing is written; an order made in Beställ gets no receipt in hindsight', async () => {
  const {root, work, input} = await setUp();
  try {
    await writeFile(path.join(work, 'last.bin'), 'another picture');
    await assert.rejects(planImport(root, input), /sha256 skiljer/);
    assert.equal(existsSync(path.join(root, 'assets', 'orders', 'paow-giv-2-3-p5-01')), false);
    await writeFile(path.join(work, 'last.bin'), 'last picture');
    const plan = await planImport(root, {...input, id: 'paow-giv-2-3-p5-02'});
    await writeImport(root, plan, input.now);
    // The same order as if it had been made in Beställ: no outside block, its approval over that, no receipt yet.
    const file = path.join(root, 'data', 'orders', 'paow-giv-2-3-p5-02.json'), inside = JSON.parse(await readFile(file, 'utf8'));
    delete inside.outside; inside.approval.orderSha256 = sha(hashInput(inside));
    await writeFile(file, JSON.stringify(inside)); await rm(path.join(root, 'assets', 'orders', 'paow-giv-2-3-p5-02', 'receipt.json'));
    await assert.rejects(receipts(root).imported('paow-giv-2-3-p5-02', 1, plan.receipt), /inte i efterhand/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
