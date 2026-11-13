// Offline tests for review decisions written from the lab. Every write goes to a temporary copy;
// the checkout's own motions/ is only read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reviewStore, applyChange, validateChange, applyProvisional, validateProvisional, refusesProvisional, DECISIONS, NOTE_LIMIT} from './review-store.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
async function temp(t: {after(fn: () => Promise<void>): void}) {
  const root = await mkdtemp(path.join(base, 'review-store-')); t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'motions'));
  return root;
}
const record = () => ({schemaVersion: 1, id: 'pamela-test-01', source: {path: 'assets/motions/pamela-test-01/source.mp4', frames: 120},
  review: {decision: 'PENDING', basis: 'Samma vänsterhand. Plant f93.', limitations: 'En tagning.', colorDoesNotProvePhysicalSide: true, userAccepted: false, productionReady: false}, postProcessing: 'none', published: false});
const put = async (root: string, value = record()) => { const text = JSON.stringify(value, null, 2) + '\n'; await writeFile(path.join(root, 'motions/pamela-test-01.json'), text); return text; };
const fails = (status: number) => (error: unknown) => (error as {status?: number}).status === status;

test('a decision rewrites only the review block and leaves the rest of the record as it was', async t => {
  const root = await temp(t), before = await put(root), store = reviewStore(root, () => '2026-11-11');
  const read = await store.load('pamela-test-01');
  const saved = await store.save('pamela-test-01', {decision: 'VARIANT', note: '  bra rörelse,\n men bara ibland  '}, read.revision);
  const text = await readFile(path.join(root, 'motions/pamela-test-01.json'), 'utf8'), after = JSON.parse(text);
  assert.deepEqual(after.review, {decision: 'ACCEPTED', basis: 'Samma vänsterhand. Plant f93.', limitations: 'En tagning.', colorDoesNotProvePhysicalSide: true, userAccepted: true, productionReady: false,
    acceptedAs: 'VARIANT', userReview: 'Jakob 2026-11-11: bra rörelse, men bara ibland'});
  assert.deepEqual(saved.review, after.review);
  // Same keys in the same order, same formatting: the only difference is inside review.
  assert.deepEqual(Object.keys(after), Object.keys(JSON.parse(before)));
  assert.equal(text, JSON.stringify({...JSON.parse(before), review: after.review}, null, 2) + '\n');
  assert.equal(saved.revision, (await store.load('pamela-test-01')).revision); assert.notEqual(saved.revision, read.revision);
  // The replaced block is kept for one step back, and no temporary file is left behind.
  assert.deepEqual(JSON.parse(await readFile(path.join(root, '.runtime/review-previous.json'), 'utf8')), {id: 'pamela-test-01', review: JSON.parse(before).review});
  assert.deepEqual(await readdir(path.join(root, 'motions')), ['pamela-test-01.json']);
});

test('each decision sets decision, acceptedAs, userAccepted and a dated note', () => {
  const at = (decision: string, note = '', review: unknown = {decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true, basis: 'b'}) => applyChange(review, validateChange({decision, note}), '2026-11-11');
  assert.deepEqual(at('ACCEPTED'), {decision: 'ACCEPTED', userAccepted: true, basis: 'b', userReview: 'Jakob 2026-11-11: godkänd i labbet.'});
  assert.deepEqual(at('REJECTED', 'tryckt framsida'), {decision: 'REJECTED', userAccepted: false, basis: 'b', userReview: 'Jakob 2026-11-11: tryckt framsida'});
  assert.deepEqual(at('SECONDARY'), {decision: 'SECONDARY', userAccepted: false, basis: 'b', userReview: 'Jakob 2026-11-11: sekundärt alternativ, satt i labbet.'});
  assert.deepEqual(at('PENDING'), {decision: 'PENDING', userAccepted: false, basis: 'b'});
  // A reset after a decision removes his word, so the film is waiting again.
  assert.deepEqual(applyChange({decision: 'REJECTED', basis: 'b', userReview: 'Jakob 2026-11-10: nej', userAccepted: false}, {decision: 'PENDING', note: 'ångrar mig'}, '2026-11-11'), {decision: 'PENDING', basis: 'b', userAccepted: false});
  // The main marker is set by the choice Primär only, and goes with any other decision, a plain approval included.
  assert.deepEqual(at('MAIN'), {decision: 'ACCEPTED', acceptedAs: 'MAIN', userAccepted: true, basis: 'b', userReview: 'Jakob 2026-11-11: vald som primär tagning i labbet.'});
  assert.equal(at('ACCEPTED', '', {acceptedAs: 'MAIN'}).acceptedAs, undefined); assert.equal(at('REJECTED', '', {acceptedAs: 'MAIN'}).acceptedAs, undefined);
  assert.equal(at('VARIANT', '', {acceptedAs: 'MAIN'}).acceptedAs, 'VARIANT');
  assert.deepEqual(at('ACCEPTED', '', null), {decision: 'ACCEPTED', userReview: 'Jakob 2026-11-11: godkänd i labbet.', userAccepted: true});
  for (const bad of [{decision: 'MAYBE'}, {decision: 'ACCEPTED', note: 5}, {decision: 'ACCEPTED', note: 'x'.repeat(NOTE_LIMIT + 1)}, {decision: 'ACCEPTED', basis: 'rewritten'}, null, 'ACCEPTED'])
    assert.throws(() => validateChange(bad), fails(400));
});

test('nothing is written without the revision that was read, for an unknown clip or a bad request', async t => {
  const root = await temp(t), before = await put(root), store = reviewStore(root, () => '2026-11-11'), file = path.join(root, 'motions/pamela-test-01.json');
  const {revision} = await store.load('pamela-test-01');
  await assert.rejects(store.save('pamela-test-01', {decision: 'ACCEPTED'}, undefined), fails(428));
  await assert.rejects(store.save('pamela-test-01', {decision: 'ACCEPTED'}, '"stale"'), fails(409));
  await assert.rejects(store.save('pamela-none-01', {decision: 'ACCEPTED'}, revision), fails(404));
  await assert.rejects(async () => store.save('../placements/default', {decision: 'ACCEPTED'}, revision), fails(400));
  await assert.rejects(async () => store.save('pamela-test-01', {decision: 'DELETE'}, revision), fails(400));
  assert.equal(await readFile(file, 'utf8'), before); assert.equal(existsSync(path.join(root, '.runtime')), false);
  // Two writers holding the same revision: the first is saved, the second is told to read again.
  const [first, second] = await Promise.allSettled([store.save('pamela-test-01', {decision: 'ACCEPTED'}, revision), store.save('pamela-test-01', {decision: 'REJECTED'}, revision)]);
  assert.equal(first.status, 'fulfilled'); assert.equal(second.status, 'rejected'); assert.ok(fails(409)((second as PromiseRejectedResult).reason));
  assert.equal(JSON.parse(await readFile(file, 'utf8')).review.decision, 'ACCEPTED');
  // A record that is not an object is refused rather than repaired.
  await writeFile(file, '[]\n');
  await assert.rejects(store.save('pamela-test-01', {decision: 'ACCEPTED'}, store.revisionOf('[]\n')), fails(422));
  assert.equal(await readFile(file, 'utf8'), '[]\n');
});

test('a real tracked record survives a round of decisions with everything outside review untouched', async t => {
  const root = await temp(t), name = 'pamela-p7-c1-plan-deal-02', target = path.join(root, `motions/${name}.json`);
  await copyFile(`motions/${name}.json`, target);
  const original = JSON.parse(await readFile(target, 'utf8')), store = reviewStore(root, () => '2026-11-11');
  let revision = (await store.load(name)).revision;
  for (const decision of ['REJECTED', 'VARIANT', 'ACCEPTED', 'PENDING']) revision = (await store.save(name, {decision, note: decision === 'VARIANT' ? 'som förut' : ''}, revision)).revision;
  const text = await readFile(target, 'utf8'), after = JSON.parse(text);
  const {review: was, ...rest} = original, {review: now, ...kept} = after;
  assert.deepEqual(kept, rest); assert.deepEqual(Object.keys(after), Object.keys(original)); assert.ok(text.endsWith('}\n'));
  assert.equal(now.decision, 'PENDING'); assert.equal(now.userAccepted, false); assert.equal(now.acceptedAs, undefined); assert.equal(now.userReview, undefined);
  for (const key of ['basis', 'limitations', 'agentFirstVerdict', 'colorDoesNotProvePhysicalSide', 'productionReady']) assert.deepEqual(now[key], was[key], key);
});

test('a provisional verdict plays like a decision but is never his, and his next decision takes it away', async t => {
  const mandate = 'Jakob 2026-11-13: "Tillsammans med videogranskaren, som är duktig, bedöm de sista filmerna, för jag måste sova."';
  const change = (decision: string, note = 'Handen landar rent på f88.') => validateProvisional({decision, by: 'huvudagenten och en oberoende granskare', mandate, note});
  const inbox = {decision: 'PENDING', basis: 'b', userAccepted: false, inbox: true};
  const at = '2026-11-13T03:10:00.000Z';
  assert.deepEqual(applyProvisional(inbox, change('ACCEPTED'), at), {decision: 'ACCEPTED', basis: 'b', userAccepted: false,
    provisional: {by: 'huvudagenten och en oberoende granskare', at, mandate, note: 'Handen landar rent på f88.'}});
  assert.equal(applyProvisional(inbox, change('VARIANT'), at).acceptedAs, 'VARIANT');
  const rejected = applyProvisional(inbox, change('REJECTED', 'Kortet glider.'), at);
  assert.equal(rejected.decision, 'REJECTED'); assert.equal(rejected.inbox, undefined); assert.equal(rejected.userReview, undefined); assert.equal(rejected.userAccepted, false);
  // An earlier provisional verdict may be replaced; a plain approval takes the variant marker away.
  const again = applyProvisional(applyProvisional(inbox, change('VARIANT'), at), change('ACCEPTED', 'Ändå bäst.'), '2026-11-13T04:00:00.000Z');
  assert.equal(again.acceptedAs, undefined); assert.deepEqual(again.provisional, {by: 'huvudagenten och en oberoende granskare', at: '2026-11-13T04:00:00.000Z', mandate, note: 'Ändå bäst.'});
  // Refused where his verdict stands: his words, or a decision without a provisional block.
  assert.throws(() => applyProvisional({decision: 'PENDING', userReview: 'Jakob 2026-11-12: nej'}, change('ACCEPTED'), at), fails(409));
  assert.throws(() => applyProvisional({decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-12: ja'}, change('REJECTED'), at), fails(409));
  assert.throws(() => applyProvisional({decision: 'REJECTED'}, change('ACCEPTED'), at), fails(409));
  assert.equal(refusesProvisional(null), null); assert.equal(refusesProvisional({decision: 'PENDING', inbox: true}), null); assert.equal(refusesProvisional(rejected), null);
  // Never MAIN, every field required, the note as long as his may be.
  for (const bad of [{decision: 'MAIN', by: 'a', mandate: 'm', note: 'n'}, {decision: 'ACCEPTED', by: '', mandate: 'm', note: 'n'}, {decision: 'ACCEPTED', by: 'a', mandate: 'm'},
    {decision: 'ACCEPTED', by: 'a', mandate: 'm', note: 'x'.repeat(NOTE_LIMIT + 1)}, {decision: 'ACCEPTED', by: 'a', mandate: 'm', note: 'n', userReview: 'Jakob'}, null])
    assert.throws(() => validateProvisional(bad), fails(400));
  // His decision, whatever it is, a reset included, removes the provisional block.
  for (const decision of DECISIONS) {
    const after = applyChange(applyProvisional(inbox, change('ACCEPTED'), at), validateChange({decision, note: ''}), '2026-11-13');
    assert.equal(after.provisional, undefined, decision);
  }
  // Through the store: the revision guard and an untouched rest of the record, as for his decisions.
  const root = await temp(t), before = await put(root, {...record(), review: {...record().review, inbox: true}} as ReturnType<typeof record>), store = reviewStore(root, () => '2026-11-13', () => at);
  const read = await store.load('pamela-test-01');
  await assert.rejects(store.saveProvisional('pamela-test-01', change('ACCEPTED'), '"stale"'), fails(409));
  const saved = await store.saveProvisional('pamela-test-01', change('ACCEPTED'), read.revision);
  const text = await readFile(path.join(root, 'motions/pamela-test-01.json'), 'utf8');
  assert.equal(text, JSON.stringify({...JSON.parse(before), review: saved.review}, null, 2) + '\n');
  assert.equal(saved.review.inbox, undefined); assert.equal((saved.review.provisional as {at: string}).at, at);
  const his = await store.save('pamela-test-01', {decision: 'REJECTED', note: 'nej'}, saved.revision);
  assert.equal(his.review.provisional, undefined); assert.equal(his.review.userReview, 'Jakob 2026-11-13: nej');
  await assert.rejects(store.saveProvisional('pamela-test-01', change('ACCEPTED'), his.revision), fails(409));
});
