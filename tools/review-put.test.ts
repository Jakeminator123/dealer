// Offline tests for tools/review-put.ts, the provisional verdict judged for Jakob ("åt dig"). Every write goes to a temporary
// register; the checkout's own is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reviewPut} from './review-put.ts';
import {motionRegister} from './register-store.ts';
import {applyChange, applyProvisional, reviewStore} from './review-store.ts';
import {buildGraph, type BankData, type BankJob} from '../src/clip-graph.ts';
import {verdictOf, referenceCandidates, stepOf} from '../src/order-model.ts';
import {printList, productionList} from './produce.ts';
import {awaitingJakob} from '../studio/lib/verdict.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
const id = 'paow-test-01-deal';
const by = 'huvudagenten och en oberoende granskare';
const mandate = 'Jakob 2026-11-13: "Tillsammans med videogranskaren, som är duktig, bedöm de sista filmerna, för jag måste sova."';
const at = '2026-11-13T03:10:00.000Z';
const record = (review: Record<string, unknown> = {decision: 'PENDING', basis: 'Handen lyfter f24.', userAccepted: false, inbox: true}) =>
  ({schemaVersion: 1, id, source: {path: `assets/motions/${id}/source.mp4`, frames: 120}, review, published: false});
async function temp(t: {after(fn: () => Promise<void>): void}, value: unknown = record()) {
  const root = await mkdtemp(path.join(base, 'review-put-')); t.after(() => rm(root, {recursive: true, force: true}));
  motionRegister(root).put(id, value);
  return {root, text: JSON.stringify(value, null, 2) + '\n'};
}
/** The post as the register gives it, written the way its file was: two spaces, a newline, the keys in the order they stand. */
const written = (root: string) => JSON.stringify(motionRegister(root).get(id), null, 2) + '\n';
const args = (decision: string, note = 'Ren landning på f88, kortet ligger still.') => [id, decision, '--by', by, '--mandate', mandate, '--note', note];
const fails = (status: number) => (error: unknown) => (error as {status?: number}).status === status;

test('the command writes a provisional verdict through the store and touches only the review block', async t => {
  const {root, text} = await temp(t);
  const out = await reviewPut(args('ACCEPTED'), {root, now: () => at});
  const after = JSON.parse(written(root));
  assert.deepEqual(after.review, {decision: 'ACCEPTED', basis: 'Handen lyfter f24.', userAccepted: false,
    provisional: {by, at, mandate, note: 'Ren landning på f88, kortet ligger still.'}});
  assert.equal(written(root), JSON.stringify({...JSON.parse(text), review: after.review}, null, 2) + '\n');
  assert.equal(out.text, `${id}: godkänd åt Jakob av ${by}. Väntar inte i hans kö; Granska visar den under Dömda åt dig, och hans eget beslut ersätter den.`);
  assert.deepEqual(await readdir(path.join(root, 'data')), ['motions.jsonl']);
  // It may replace an earlier provisional verdict: a variant, then a rejection.
  assert.equal((await reviewPut(args('variant'), {root, now: () => at})).review.acceptedAs, 'VARIANT');
  const rejected = (await reviewPut(args('REJECTED', 'Kortet glider f80.'), {root, now: () => at})).review;
  assert.equal(rejected.decision, 'REJECTED'); assert.equal(rejected.acceptedAs, undefined); assert.equal((rejected.provisional as {note: string}).note, 'Kortet glider f80.');
});

test('--dry prints the block and writes nothing; bad arguments and his own verdict are refused', async t => {
  const {root, text} = await temp(t);
  const dry = await reviewPut([...args('VARIANT'), '--dry'], {root, now: () => at});
  assert.equal(dry.dry, true); assert.equal(dry.review.acceptedAs, 'VARIANT'); assert.match(dry.text, /^Torrkörning, inget skrivet/);
  assert.equal(written(root), text); assert.equal(existsSync(path.join(root, '.runtime/review-previous.json')), false);
  for (const bad of [args('MAIN'), args('PENDING'), [id, 'ACCEPTED', '--by', by, '--mandate', mandate], [id, 'ACCEPTED', '--by', '--mandate', mandate, '--note', 'n'],
    [...args('ACCEPTED'), '--force'], ['ACCEPTED', '--by', by, '--mandate', mandate, '--note', 'n'], args('ACCEPTED', 'x'.repeat(1501)), ['../placements/default', ...args('ACCEPTED').slice(1)]])
    await assert.rejects(reviewPut(bad, {root, now: () => at}), fails(400), bad.join(' '));
  await assert.rejects(reviewPut(['paow-none-01', ...args('ACCEPTED').slice(1)], {root}), fails(404));
  assert.equal(written(root), text);
  // His verdict stands: his words, or a decision without a provisional block. Nothing is written.
  for (const review of [{decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-12: bra'}, {decision: 'PENDING', userReview: 'Jakob 2026-11-12: kanske'}, {decision: 'REJECTED'}]) {
    const own = await temp(t, record(review));
    await assert.rejects(reviewPut(args('ACCEPTED'), {root: own.root}), fails(409));
    await assert.rejects(reviewPut([...args('ACCEPTED'), '--dry'], {root: own.root}), fails(409));
    assert.equal(written(own.root), own.text);
  }
});

test('his decision in Granska replaces the provisional one, and the command then refuses', async t => {
  const {root} = await temp(t);
  await reviewPut(args('ACCEPTED'), {root, now: () => at});
  const store = reviewStore(root, () => '2026-11-13');
  const his = await store.save(id, {decision: 'VARIANT', note: 'bara ibland'}, (await store.load(id)).revision);
  assert.equal(his.review.provisional, undefined); assert.equal(his.review.userAccepted, true);
  await assert.rejects(reviewPut(args('REJECTED'), {root}), fails(409));
  // A reset by him also takes it away, and the take then waits with no verdict at all.
  const again = await temp(t);
  await reviewPut(args('REJECTED'), {root: again.root, now: () => at});
  const s2 = reviewStore(again.root, () => '2026-11-13');
  const reset = await s2.save(id, {decision: 'PENDING', note: ''}, (await s2.load(id)).revision);
  assert.deepEqual(reset.review, {decision: 'PENDING', basis: 'Handen lyfter f24.', userAccepted: false});
  assert.ok(JSON.parse(written(root)).review.userReview.startsWith('Jakob 2026-11-13:'));
});

// The bank of one seat: an older take that waits, and a take from an order in the inbox.
const job = (jid: string): BankJob => ({id: jid, kind: 'DEAL', target: 'P4.C1', from: 'READY', to: 'P4.C1', model: 'wan3', duration: 4, ratio: 'auto_1080p', audio: false, promptText: '', first: {}, purpose: ''});
const change = (decision: 'ACCEPTED' | 'VARIANT' | 'REJECTED') => ({decision, by, mandate, note: 'n'});
function bankWith(review: Record<string, unknown>): BankData {
  return {jobs: [job('p4-old-01'), job('p4-new-01')], motions: {'p4-old-01': {source: {frames: 120, fps: 30}, review: {decision: 'PENDING'}}, 'p4-new-01': {source: {frames: 120, fps: 30}, review}},
    media: {'p4-old-01': {video: 'assets/motions/p4-old-01/source.mp4'}, 'p4-new-01': {video: 'assets/motions/p4-new-01/source.mp4'}}};
}

test('a provisional approval plays as his approval would, a provisional rejection does not play', () => {
  const inbox = {decision: 'PENDING', userAccepted: false, inbox: true};
  assert.equal(buildGraph(bankWith(inbox)).edge['READY>P4.C1'].main?.id, 'p4-old-01', 'in the inbox it plays only when nothing else does');
  const approved = buildGraph(bankWith(applyProvisional(inbox, change('ACCEPTED'), at)));
  assert.equal(approved.edge['READY>P4.C1'].main?.id, 'p4-new-01');
  assert.equal(approved.edge['READY>P4.C1'].status, 'ACCEPTED');
  // The same as his own approval would give.
  assert.equal(buildGraph(bankWith(applyChange(inbox, {decision: 'ACCEPTED', note: ''}, '2026-11-13'))).edge['READY>P4.C1'].main?.id, 'p4-new-01');
  const variant = buildGraph(bankWith(applyProvisional(inbox, change('VARIANT'), at)));
  assert.equal(variant.edge['READY>P4.C1'].main?.id, 'p4-old-01'); assert.deepEqual(variant.edge['READY>P4.C1'].variants.map(t => t.id), ['p4-new-01']);
  const rejected = buildGraph(bankWith(applyProvisional(inbox, change('REJECTED'), at)));
  assert.equal(rejected.edge['READY>P4.C1'].main?.id, 'p4-old-01'); assert.equal(rejected.takes['p4-new-01'].decision, 'REJECTED');
});

test('a provisional approval is not his: never "rakt godkänd", so never a reference film; it does not wait, and the production list says it was judged for him', () => {
  const review = applyProvisional({decision: 'PENDING', inbox: true}, change('ACCEPTED'), at);
  assert.deepEqual(verdictOf(review as never), {verdict: 'GODKÄND', straight: false, words: null});
  assert.equal(verdictOf(applyChange(review, {decision: 'ACCEPTED', note: ''}, '2026-11-13') as never).straight, true);
  const bank = bankWith(review);
  const candidates = referenceCandidates(bank as never, {dealer: 'paow', step: stepOf('GIV-2.1')!, target: 'P4.C1'});
  assert.equal(candidates.find(c => c.take === 'p4-new-01')?.approvedStraight, false);
  // Not in his queue (Jakob 2026-11-13: "Med andra ord vill jag inte se en sån här lista när jag är tillbaka!").
  const graph = buildGraph(bank);
  assert.ok(!awaitingJakob(graph).some(t => t.id === 'p4-new-01'));
  // The production list: klar, in words that say it was judged for him, and counted as provisional.
  const list = productionList({graph, entries: [], dealer: {id: 'paow', name: 'Paow'}, orders: [], methods: {schemaVersion: 1, methods: []}, bank: bank as never} as never);
  const row = list.rows.find(r => r.edge === 'READY>P4.C1')!;
  assert.deepEqual([row.state, row.provisional, row.byJakob, row.words], ['KLAR', true, false, 'klar · godkänd åt dig']);
  assert.equal(list.counts.provisional, 1);
  assert.match(printList(list), /klara \(1 dömda åt dig\)/);
  assert.doesNotMatch(printList(list), /preliminär|väntar på din dom/);
});
