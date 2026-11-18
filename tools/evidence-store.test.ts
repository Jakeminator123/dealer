import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evidenceStatus, reindexEvidence, traceEvidence, writeRunReceipt, type RunReceiptInput } from './evidence-store.ts';

const digest = 'a'.repeat(64);
const plan = 'b'.repeat(64);
const orderVersion = 'c'.repeat(64);
const sample: RunReceiptInput = {
  kind: 'publication',
  startedAt: '2026-11-18T10:00:00.000Z',
  finishedAt: '2026-11-18T10:00:05.000Z',
  status: 'pass',
  revision: 'a'.repeat(40),
  studioRevision: 'b'.repeat(64),
  dirtyInputs: ['data\\clip-jobs.json'],
  counts: { pass: 4, fail: 0, skip: 2, todo: 1 },
  inputs: [{ path: 'assets/motions/example-film/source.mp4', sha256: digest }],
};

function fixture(t: { after: (callback: () => void) => void }) {
  const root = mkdtempSync(path.join(tmpdir(), 'dealer-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name: string, value: unknown) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  };
  write('data/media-roles.json', {
    dealers: { paow: { entries: [{ id: 'example-anchor', path: 'assets/anchors/example-anchor/image.png' }] } },
  });
  write('data/clip-jobs.json', {
    jobs: [{ id: 'example-film', first: { file: { path: 'assets/orders/example-order/first.png' } } }],
    derived: [{ id: 'example-cut', clip: 'example-film', frames: [0, 20] }],
  });
  write('data/orders/example-order.json', {
    id: 'example-order', dealer: 'paow', approval: { orderSha256: orderVersion },
    pictures: [
      { path: 'assets/orders/example-order/first.png', sha256: digest, from: { entry: 'example-anchor' } },
      { path: 'assets/orders/example-order/last.png', drawn: { plan: { path: 'placements/default.json', sha256: plan }, as: 'flatQuad detaljer' } },
    ],
  });
  write('assets/orders/example-order/receipt.json', {
    takes: [{ take: 1, file: sample.inputs[0].path, sha256: digest, taskId: 'provider-private', note: 'ignore this' }],
  });
  write('motions/example-film.json', {
    id: 'example-film', source: sample.inputs[0],
    order: { id: 'example-order', take: 1, orderSha256: orderVersion, path: 'data/orders/example-order.json' },
  });
  write('evidence/example-report.json', { id: 'example-film', source: sample.inputs[0].path, signedUrl: 'https://example.test/?secret=redacted' });
  return { root, write };
}

test('receipts are atomic, portable, and rebuild the same separate test counts', t => {
  const { root } = fixture(t);
  const file = writeRunReceipt(root, { ...sample, notes: ['missing-track'] });
  const data = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(data.dirtyInputs, ['data/clip-jobs.json']);
  assert.deepEqual(data.counts, { ...sample.counts, cancelled: 0 });
  assert.equal(readdirSync(path.join(root, '.runtime/evidence/runs')).length, 1);
  writeRunReceipt(root, { ...sample, finishedAt: '2026-11-18T10:00:06.000Z', counts: { ...sample.counts, cancelled: 3 } });
  const first = evidenceStatus(root);
  assert.equal(first.runs, 2);
  assert.equal(first.latest[0].skip, 2);
  assert.equal(first.latest[0].todo, 1);
  assert.equal(first.latest[0].cancelled, 3);
  assert.equal(first.latest[1].cancelled, 0);
  rmSync(path.join(root, '.runtime/evidence/index.sqlite'));
  assert.deepEqual(evidenceStatus(root), first);
});

test('the index follows cuts to orders, anchors and historical mentions without opening media', t => {
  const { root, write } = fixture(t);
  const found = traceEvidence(root, 'example-cut');
  assert.deepEqual(found.unreadable, []);
  assert.ok(found.links.some(row => row.relation === 'order-picture' && row.related_id === 'example-anchor'));
  assert.ok(found.links.some(row => row.relation === 'first-anchor' && row.related_id === 'example-anchor'));
  assert.ok(found.links.some(row => row.relation === 'order-plan' && row.drawing === 'flatQuad' && row.sha256 === plan));
  assert.ok(found.links.some(row => row.relation === 'order-take' && row.take === 1 && row.sha256 === digest));
  assert.ok(found.links.some(row => row.relation === 'evidence-mention' && row.source === 'evidence/example-report.json'));
  assert.doesNotMatch(JSON.stringify(found), /provider-private|https:\/\/|redacted/);

  write('data/orders/example-order.json', {
    id: 'example-order', approval: { orderSha256: digest }, pictures: [{ path: 'assets/orders/replacement/first.png' }],
  });
  const changed = traceEvidence(root, 'example-cut');
  assert.ok(changed.links.some(row => row.relation === 'motion-order-version-missing' && row.sha256 === orderVersion));
  assert.ok(!changed.links.some(row => row.relation === 'order-picture'));
});

const orderReceipt = 'assets/orders/example-order/receipt.json';
const reviewTake = 'assets/orders/example-order/take-1';
const reviewedFilm = { path: `${reviewTake}/after.mp4`, sha256: digest };
const reviewFiles = [
  { path: `${reviewTake}/review/review.md`, sha256: plan },
  { path: `${reviewTake}/review/turn.png`, sha256: orderVersion },
];
const review = { at: sample.finishedAt, note: 'private-review-note', evidence: { film: reviewedFilm, files: reviewFiles } };

test('order and cut traces find the reviewed film version and artifacts without reading media', t => {
  const { root, write } = fixture(t);
  const original = { take: 1, file: `${reviewTake}/source.mp4`, sha256: plan };
  const expected = [
    ...reviewFiles.map(file => ({ ...file, relation: 'review-artifact' })),
    { ...reviewedFilm, relation: 'reviewed-film' },
  ];
  const reviewLinks = ({ links }: ReturnType<typeof traceEvidence>) => links.filter(link => String(link.relation).startsWith('review'));
  write(orderReceipt, { order: 'example-order', takes: [{ ...original, review }] });
  const first = traceEvidence(root, 'example-order');
  assert.deepEqual(first.unreadable, []);
  assert.deepEqual(reviewLinks(first).map(link => ({ ...link })), expected.map(file => ({
    id: 'example-order', relation: file.relation, related_id: null, source: orderReceipt,
    path: file.path, sha256: file.sha256, take: 1, plan_sha256: null, drawing: null,
  })));
  assert.deepEqual(reviewLinks(traceEvidence(root, 'example-cut')), reviewLinks(first));
  assert.ok(first.links.some(link => link.relation === 'order-take' && link.path === original.file && link.sha256 === plan));
  assert.doesNotMatch(JSON.stringify(first), /private-review-note/);
  reindexEvidence(root);
  assert.deepEqual(traceEvidence(root, 'example-order'), first);

  write(orderReceipt, { takes: [{ ...original, review: { at: review.at, note: review.note } }] });
  const legacy = traceEvidence(root, 'example-order');
  assert.deepEqual(legacy.unreadable, []);
  assert.deepEqual(reviewLinks(legacy), []);
  assert.ok(legacy.links.some(link => link.relation === 'order-take'));
});

test('the evidence index follows the current reviewer note', t => {
  const { root, write } = fixture(t);
  const grade = { status: 'GRANSKAD', at: '2026-11-18T10:01:00.000Z', note: 'Version 2' };
  const brought = { status: 'INFÖRD', at: '2026-11-18T10:02:00.000Z', note: 'Införd i banken' };
  const cases = [
    { name: 'a later history review supersedes the package', beside: review, history: [grade], count: 0 },
    { name: 'repeating the same words still supersedes the package', beside: review, history: [{ ...grade, note: review.note }], count: 0 },
    { name: 'a later attached review wins', beside: { ...review, at: brought.at }, history: [grade], count: 3 },
    { name: 'bringing a take does not supersede its attached review', beside: review, history: [brought], count: 3 },
    { name: 'a tie prefers the attached review', beside: { ...review, at: grade.at }, history: [grade, brought], count: 3 },
    { name: 'a blank history note is skipped', beside: review, history: [{ ...grade, note: '  ' }], count: 3 },
    { name: 'the last written review is used even if history is out of time order', beside: review,
      history: [grade, { ...grade, at: sample.startedAt }], count: 3 },
    { name: 'attached milliseconds are later than a whole second', beside: { ...review, at: '2026-11-18T10:01:00.100Z' },
      history: [{ ...grade, at: '2026-11-18T10:01:00Z' }], count: 3 },
    { name: 'history milliseconds supersede a whole-second review', beside: { ...review, at: '2026-11-18T10:01:00Z' },
      history: [{ ...grade, at: '2026-11-18T10:01:00.100Z' }], count: 0 },
    { name: 'an attached review with an offset wins at the same instant', beside: { ...review, at: '2026-11-18T09:01:00-01:00' },
      history: [grade], count: 3 },
    { name: 'a history offset can make the clock time earlier', beside: review,
      history: [{ ...grade, at: '2026-11-18T10:30:00+01:00' }], count: 3 },
    { name: 'a history offset can make the clock time later', beside: review,
      history: [{ ...grade, at: '2026-11-18T09:30:00-01:00' }], count: 0 },
    { name: 'a dated review wins over invalid legacy history', beside: review, history: [{ ...grade, at: 'unknown' }], count: 3 },
    { name: 'an attached package with invalid time gains no evidence links', beside: { ...review, at: 'unknown' },
      history: [grade], count: 0, badTime: true },
  ];
  for (const { name, beside, history, count, badTime } of cases) {
    write(orderReceipt, { takes: [{ take: 1, file: reviewedFilm.path, sha256: digest, review: beside, history }] });
    const found = traceEvidence(root, 'example-order');
    assert.deepEqual(found.unreadable, badTime ? [orderReceipt] : [], name);
    assert.equal(found.links.filter(link => link.relation === 'reviewed-film' || link.relation === 'review-artifact').length, count, name);
    assert.ok(found.links.some(link => link.relation === 'order-take' && link.path === reviewedFilm.path), name);
  }
});

test('invalid review evidence is reported and produces no partial review links', t => {
  const { root, write } = fixture(t);
  const invalid = [
    { ...review.evidence, film: { ...reviewedFilm, sha256: 'abcd' } },
    { ...review.evidence, film: { ...reviewedFilm, sha256: digest.toUpperCase() } },
    { ...review.evidence, film: { ...reviewedFilm, path: reviewedFilm.path.replace('example-order', 'different-order') } },
    { ...review.evidence, film: { ...reviewedFilm, path: reviewedFilm.path.replace('take-1/', 'take-11/') } },
    { ...review.evidence, files: [reviewFiles[0], { ...reviewFiles[1], path: `${reviewTake}/../take-2/turn.png` }] },
    { ...review.evidence, files: [{ ...reviewFiles[0], path: reviewFiles[0].path.replaceAll('/', '\\') }] },
    { ...review.evidence, files: [reviewedFilm] },
    { ...review.evidence, files: [reviewFiles[0], reviewFiles[0]] },
    { ...review.evidence, files: [] },
    { ...review.evidence, files: Array.from({ length: 33 }, (_, i) => ({ path: `${reviewTake}/review/${i}.png`, sha256: digest })) },
    { ...review.evidence, files: null },
    null,
  ];
  for (const evidence of invalid) {
    write(orderReceipt, { takes: [{ take: 1, file: reviewedFilm.path, sha256: digest, review: { ...review, evidence } }] });
    const found = traceEvidence(root, 'example-order');
    assert.deepEqual(found.unreadable, [orderReceipt], JSON.stringify(evidence));
    assert.ok(found.links.some(link => link.relation === 'order-take'));
    assert.ok(!found.links.some(link => String(link.relation).startsWith('review')));
  }
});

test('sensitive, nonrelative and invalid metadata is rejected before writing', t => {
  const { root, write } = fixture(t);
  for (const log of ['https://example.test/x?key=topsecret', '../outside', 'C:\\outside.txt', '.env.local', 'private/key.txt']) {
    assert.throws(() => writeRunReceipt(root, { ...sample, log }), /ogiltigt fält: log/);
  }
  assert.throws(() => writeRunReceipt(root, { ...sample, notes: ['provider replied https://example.test'] }), /ogiltigt fält: notes/);
  assert.throws(() => writeRunReceipt(root, { ...sample, counts: { ...sample.counts, skip: -1 } }), /counts.skip/);
  assert.throws(() => writeRunReceipt(root, { ...sample, counts: { ...sample.counts, cancelled: -1 } }), /counts.cancelled/);
  assert.throws(() => writeRunReceipt(root, { ...sample, revision: 'e6c0712' }), /revision/);
  assert.throws(() => writeRunReceipt(root, { ...sample, studioRevision: 'e6c0712' }), /studioRevision/);
  write('.runtime/evidence/runs/invalid.json', { ...sample, id: 'other', schemaVersion: 1 });
  const status = reindexEvidence(root);
  assert.deepEqual(status.unreadable, ['.runtime/evidence/runs/invalid.json']);
  assert.equal(status.runs, 0);
});

test('a linked worktree writes and queries the primary checkout journal and registers', t => {
  const {root, write} = fixture(t);
  const env = {...process.env};
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
  const git = (...args: string[]) => execFileSync('git', args, {cwd: root, env, windowsHide: true, stdio: 'pipe'});
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
  const linked = path.join(root, 'linked');
  git('worktree', 'add', '--detach', linked, 'HEAD');
  write('linked/data/orders/example-order.json', {id: 'different-order'});
  const receipt = writeRunReceipt(root, sample);
  assert.deepEqual(evidenceStatus(linked), evidenceStatus(root));
  assert.equal(evidenceStatus(linked).latest[0]?.receipt, receipt);
  assert.ok(traceEvidence(linked, 'example-film').links.some(row => row.relation === 'order-plan' && row.sha256 === plan));
  const linkedReceipt = writeRunReceipt(linked, {...sample, finishedAt: '2026-11-18T10:00:07.000Z'});
  assert.ok(existsSync(path.join(root, linkedReceipt)));
  assert.equal(reindexEvidence(linked).runs, 2);
  assert.equal(evidenceStatus(root).latest[0]?.receipt, linkedReceipt);
  assert.equal(existsSync(path.join(linked, '.runtime')), false);
});
