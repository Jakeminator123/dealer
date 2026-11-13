// Tests for fetching a delivered take (tools/order-collect.ts) and bringing it into the clip bank under the order's dealer, in the
// inbox (tools/register-order.ts), its fixed copy as a corrected copy. Everything happens in a temporary folder with a tiny film
// FFmpeg makes and a local web server; nothing is ordered and the checkout is only read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {collectTake, OrderError} from './order-collect.ts';
import {planRegistration, register, clipIdOf, decided} from './register-order.ts';
import {fixFilm} from './film-fix.ts';
import {applyChange} from './review-store.ts';
import {buildGraph, returnFits, resolveRound, parseSequence, type BankData} from '../src/clip-graph.ts';

// Tests that make a film with ffmpeg; skipped where there is none.
const needsFfmpeg = {skip: spawnSync('ffmpeg', ['-version'], {stdio: 'ignore'}).status !== 0 && 'ffmpeg is not on this machine (the hosted check has none)'};
const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir(), sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const ORDER = 'paow-giv-p4', TEXT = 'Locked camera. Same Paow. She pinches the card in the shoe, deals it to seat 4, turns it naturally and goes back to the shoe.';
const pamelaJob = {id: 'pamela-p4-c1-plan-deal-02', kind: 'DEAL', target: 'P4.C1', from: 'READY', to: 'LAND(P4.C1)', model: 'wan3', duration: 4, ratio: 'auto_1080p', audio: false, promptText: 'x'.repeat(40), first: {file: {path: 'a.png', sha256: 'a'.repeat(64)}}, purpose: 'fixture'};
function order(id: string, extra: Record<string, unknown> = {}) {
  return {schemaVersion: 1, id, title: 'Paow · giv till plats 4', dealer: 'paow', kind: 'FILM', takes: 2,
    step: {key: 'GIV-2.1', label: 'Nyp, ett kort till platsen och tillbaka', edge: 'READY>P4.C1', shape: 'ROUND_TRIP', cutInto: ['READY>P4.C1', 'P4.C1>READY'], makes: null},
    motion: {grip: 'PINCH', hand: 'LH', turn: true, flipAxis: 'FREE', target: 'P4.C1', side: 'FRONT', fromPlan: true},
    pictures: [{name: 'first.png', label: 'Första bild', goesAs: 'startFrame', path: `assets/orders/${id}/first.png`, sha256: 'a'.repeat(64), from: null},
      {name: 'last.png', label: 'Sista bild', goesAs: 'endFrame', path: `assets/orders/${id}/last.png`, sha256: 'b'.repeat(64), from: null}],
    reference: {status: 'INGEN', why: 'prov'}, generation: {provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: {resolution: '1080p', duration: 4}},
    prompt: {template: 'film-giv@1', text: TEXT, sha256: sha(TEXT), extra: null, middle: false}, cost: {perTake: 86, total: 172, worstPerTake: 94, worstTotal: 188, basis: 'prov'},
    limits: {maxCredits: 400, stopBelowCredits: 2000}, notes: [], created: '2026-11-12T20:00:00Z', createdBy: 'test', approval: {by: 'jakob', at: '2026-11-12T20:05:00Z', orderSha256: 'c'.repeat(64)}, status: 'GODKÄND', ...extra};
}
const receipt = (id: string) => ({schemaVersion: 1, order: id, orderSha256: 'c'.repeat(64), takes: [{take: 1, status: 'KLAR', requestedAt: '2026-11-12T20:10:00Z', taskId: 'task-0001', history: []}, {take: 2, status: 'OSÄKER', requestedAt: '2026-11-12T20:11:00Z', taskId: null, history: []}]});

async function bank(t: {after(fn: () => Promise<void>): void}) {
  const root = await mkdtemp(path.join(base, 'register-order-')); t.after(() => rm(root, {recursive: true, force: true}));
  for (const dir of ['data/orders', 'motions', 'assets/motions', `assets/orders/${ORDER}`, 'films']) await mkdir(path.join(root, dir), {recursive: true});
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({schemaVersion: 1, budget: {maximumCredits: 0}, anchors: [], jobs: [pamelaJob], derived: [], edits: []}, null, 2) + '\n');
  await writeFile(path.join(root, `data/orders/${ORDER}.json`), JSON.stringify(order(ORDER), null, 2));
  await writeFile(path.join(root, `assets/orders/${ORDER}/receipt.json`), JSON.stringify(receipt(ORDER), null, 2));
  // 12 frames at 24 fps: the green screen with a block where she sits; the delivered film of take 1.
  const film = path.join(root, 'films/delivered.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x00F03C:s=64x48:r=24', '-frames:v', '12', '-vf', 'drawbox=x=10:y=12:w=16:h=28:color=0xC89678:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', film], {windowsHide: true});
  return {root, film};
}
async function serve(t: {after(fn: () => Promise<void>): void}, file: string) {
  const body = await readFile(file), server = http.createServer((req, res) => { if (req.url?.startsWith('/out/take.mp4')) { res.writeHead(200, {'content-type': 'video/mp4', 'content-length': body.length}); res.end(body); } else res.writeHead(404).end(); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise<void>(done => server.close(() => done())));
  return `http://127.0.0.1:${(server.address() as {port: number}).port}`;
}
const read = async (root: string, file: string) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const graphOf = async (root: string, dealer?: string) => { const file = await read(root, 'data/clip-jobs.json'), motions: Record<string, unknown> = {};
  for (const name of await readdir(path.join(root, 'motions'))) motions[name.slice(0, -5)] = await read(root, `motions/${name}`);
  const media: Record<string, unknown> = Object.fromEntries((file.derived ?? []).map((d: {id: string; clip: string}) => [d.id, {video: `assets/motions/${d.clip}/source.mp4`}]));
  // As tools/preview.ts serves it: a derived take's facts come from its clip's record.
  for (const d of file.derived ?? []) motions[d.id] = {source: (motions[d.clip] as {source?: unknown})?.source, motion: (motions[d.id] as {motion?: unknown})?.motion, review: (motions[d.id] as {review?: unknown})?.review};
  return buildGraph({jobs: file.jobs, derived: file.derived, edits: file.edits, motions, media} as BankData, dealer ? {dealer} : {}); };

test('a delivered take is fetched into its take folder, hashed and probed; the signed address is never written down', needsFfmpeg, async t => {
  // signature: made up for this test, standing in for the signature in a delivered file's address (no real value).
  const {root, film} = await bank(t), origin = await serve(t, film), signature = 'X-Amz-Signature=hemlig123';
  const done = await collectTake(root, ORDER, 1, {url: `${origin}/out/take.mp4?${signature}`});
  assert.equal(done.path, `assets/orders/${ORDER}/take-1/source.mp4`); assert.equal(done.sha256, sha(await readFile(film))); assert.equal(done.already, false);
  const fetched = await read(root, `assets/orders/${ORDER}/take-1/fetched.json`);
  assert.deepEqual([fetched.film.width, fetched.film.height, fetched.film.fps, fetched.film.frames, fetched.receipt.taskId], [64, 48, '24/1', 12, 'task-0001']);
  assert.deepEqual(fetched.from, {kind: 'url', host: new URL(origin).host, path: '/out/take.mp4'});
  for (const name of await readdir(path.join(root, `assets/orders/${ORDER}/take-1`))) assert.doesNotMatch(await readFile(path.join(root, `assets/orders/${ORDER}/take-1`, name), 'latin1'), /hemlig123/, name);
  assert.doesNotMatch(JSON.stringify(done), /hemlig123/);
  assert.match(done.next[0], /order-put\.ts status paow-giv-p4 1 HÄMTAD --file assets\/orders\/paow-giv-p4\/take-1\/source\.mp4/); assert.match(done.next[1], /--split/);
  // The same film again changes nothing; another film is refused, and the original stays.
  assert.equal((await collectTake(root, ORDER, 1, {from: film})).already, true);
  const other = path.join(root, 'films/other.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x00F03C:s=64x48:r=24', '-frames:v', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', other], {windowsHide: true});
  await assert.rejects(collectTake(root, ORDER, 1, {from: other}), /En annan film ligger redan/);
  assert.equal(sha(await readFile(path.join(root, done.path))), done.sha256);
  // A take that was never placed, an address that does not answer and plain http elsewhere are refused, and leave nothing behind.
  await assert.rejects(collectTake(root, ORDER, 2, {from: film}), /OSÄKER|task-id/);
  await assert.rejects(collectTake(root, ORDER, 1, {url: `${origin}/nothing.mp4`}), /svarade 404/);
  await assert.rejects(collectTake(root, ORDER, 1, {url: 'http://example.com/take.mp4'}), /Bara https/);
  assert.deepEqual((await readdir(path.join(root, `assets/orders/${ORDER}/take-1`))).sort(), ['fetched.json', 'source.mp4']);
});

test('a round trip enters the bank as two takes of its own clip under the order\'s dealer, in the inbox, and leaves Pamela\'s bank as it was', needsFfmpeg, async t => {
  const {root, film} = await bank(t);
  await collectTake(root, ORDER, 1, {from: film});
  const pamelaBefore = await graphOf(root);
  await assert.rejects(planRegistration(root, ORDER, 1), /--split/);
  const plan = await planRegistration(root, ORDER, 1, {split: 6}), clip = clipIdOf({id: ORDER, dealer: 'paow'}, 1);
  assert.equal(clip, 'paow-giv-p4-01'); assert.deepEqual(plan.takes.map(x => [x.id, x.kind, x.from, x.to, x.frames, x.dealer, x.model]), [[`${clip}-deal`, 'DEAL', 'READY', 'P4.C1', [0, 5], 'paow', 'kling-4'], [`${clip}-return-ready`, 'RETURN', 'P4.C1', 'READY', [6, 11], 'paow', 'kling-4']]);
  await register(root, plan);
  const file = await read(root, 'data/clip-jobs.json');
  assert.deepEqual(file.jobs, [pamelaJob], 'the job file\'s API jobs are untouched'); assert.deepEqual(file.edits, []);
  const [deal, back] = file.derived;
  assert.deepEqual([deal.clip, deal.promptText, deal.duration, deal.first.file.path, deal.last, deal.order], [clip, TEXT, 4, `assets/orders/${ORDER}/first.png`, undefined, {id: ORDER, take: 1}]);
  assert.deepEqual([back.first, back.last.file.path], [undefined, `assets/orders/${ORDER}/last.png`]);
  assert.equal(sha(await readFile(path.join(root, `assets/motions/${clip}/source.mp4`))), sha(await readFile(film)));
  const generation = await read(root, `assets/motions/${clip}/generation.json`);
  assert.deepEqual([generation.taskId, generation.model, generation.estimatedCredits, generation.appCredits, generation.output.frames, generation.order.delivered.path], ['task-0001', 'kling-4', 0, 86, 12, `assets/orders/${ORDER}/take-1/source.mp4`]);
  const dealRecord = await read(root, `motions/${clip}-deal.json`), backRecord = await read(root, `motions/${clip}-return-ready.json`), clipRecord = await read(root, `motions/${clip}.json`);
  for (const r of [dealRecord, backRecord]) { assert.equal(r.dealer, 'paow'); assert.equal(r.review.decision, 'PENDING'); assert.equal(r.review.inbox, true); assert.equal(r.source.frames, 12); }
  assert.deepEqual(backRecord.motion.startsOn, {clip: `${clip}-deal`, frame: 6}); assert.equal(clipRecord.review, undefined); assert.deepEqual(clipRecord.cutInto, [`${clip}-deal`, `${clip}-return-ready`]);
  // In Paow's graph: placed, unreviewed, the return continuing the deal on frame 6. Pamela's graph is as it was.
  const paow = await graphOf(root, 'paow'), d = paow.takes[`${clip}-deal`], r = paow.takes[`${clip}-return-ready`];
  assert.deepEqual(paow.unplaced, []); assert.ok(d.inbox && r.inbox); assert.ok(returnFits(r, d)); assert.equal(d.landingFrame, 6);
  assert.deepEqual(resolveRound(paow, parseSequence('READY>P4.C1 | P4.C1>READY').steps).map(s => [s.take?.id, s.video, s.start, s.end]), [[`${clip}-deal`, `assets/motions/${clip}/source.mp4`, 0, 6], [`${clip}-return-ready`, `assets/motions/${clip}/source.mp4`, 6, null]]);
  const pamela = await graphOf(root);
  assert.deepEqual(Object.keys(pamela.takes), Object.keys(pamelaBefore.takes)); assert.deepEqual(pamela.summary, pamelaBefore.summary);
  // Registering the same take again writes the same thing.
  const text = await readFile(path.join(root, 'data/clip-jobs.json'), 'utf8');
  await register(root, await planRegistration(root, ORDER, 1, {split: 6}));
  assert.equal(await readFile(path.join(root, 'data/clip-jobs.json'), 'utf8'), text);
});

test('a take Jakob has decided on is never written over, and an order that is not his to place is not registered', needsFfmpeg, async t => {
  const {root, film} = await bank(t);
  await collectTake(root, ORDER, 1, {from: film});
  await register(root, await planRegistration(root, ORDER, 1, {split: 6}));
  const id = 'paow-giv-p4-01-return-ready', file = path.join(root, `motions/${id}.json`), record = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(decided(record), false);
  const after = {...record, review: applyChange(record.review, {decision: 'ACCEPTED', note: 'fin'}, '2026-11-12')};
  assert.equal(after.review.inbox, undefined, 'his decision takes the take out of the inbox'); assert.equal(decided(after), true);
  await writeFile(file, JSON.stringify(after, null, 2) + '\n');
  const before = await Promise.all(['data/clip-jobs.json', `motions/${id}.json`, 'motions/paow-giv-p4-01-deal.json'].map(f => readFile(path.join(root, f), 'utf8')));
  await assert.rejects(planRegistration(root, ORDER, 1, {split: 7}), /har Jakobs beslut/);
  assert.deepEqual(await Promise.all(['data/clip-jobs.json', `motions/${id}.json`, 'motions/paow-giv-p4-01-deal.json'].map(f => readFile(path.join(root, f), 'utf8'))), before);
  // Not approved, never placed, or a still: refused before anything is read further.
  await writeFile(path.join(root, `data/orders/${ORDER}.json`), JSON.stringify(order(ORDER, {approval: null, status: 'UTKAST'})));
  await assert.rejects(planRegistration(root, ORDER, 1, {split: 6}), /inte godkänd/);
  // The main agent's approval counts only with the mandate it acts on (2026-11-13), as in tools/order-put.ts.
  const byAgent = (mandate?: string) => ({approval: {by: 'huvudagent', at: '2026-11-13T03:00:00Z', orderSha256: 'c'.repeat(64), ...(mandate ? {mandate} : {})}});
  await writeFile(path.join(root, `data/orders/${ORDER}.json`), JSON.stringify(order(ORDER, byAgent())));
  await assert.rejects(planRegistration(root, ORDER, 1, {split: 6}), /inte godkänd/);
  await writeFile(path.join(root, `data/orders/${ORDER}.json`), JSON.stringify(order(ORDER, byAgent('Jakob 2026-11-13: beställ lämpliga filmer automatiskt'))));
  // With the mandate the approval holds; what stops this run is the decision Jakob has made on the take above.
  await assert.rejects(planRegistration(root, ORDER, 1, {split: 6}), /har Jakobs beslut/, 'the mandate passes the approval check');
  await writeFile(path.join(root, `data/orders/${ORDER}.json`), JSON.stringify(order(ORDER)));
  await assert.rejects(planRegistration(root, ORDER, 2, {split: 6}), /task-id|OSÄKER/);
  await writeFile(path.join(root, `data/orders/${ORDER}.json`), JSON.stringify(order(ORDER, {kind: 'STILL'})));
  await assert.rejects(planRegistration(root, ORDER, 1), /stillbild/);
  assert.ok((await planRegistration(root, ORDER, 1, {split: 6}).catch(e => e)) instanceof OrderError);
});

test('a fixed copy becomes a corrected copy of each of its take\'s takes, in the inbox, with the original\'s frame numbers', needsFfmpeg, async t => {
  const {root, film} = await bank(t);
  const {path: delivered} = await collectTake(root, ORDER, 1, {from: film});
  await register(root, await planRegistration(root, ORDER, 1, {split: 6}));
  const fixes = path.join(root, 'fixes.json');
  await writeFile(fixes, JSON.stringify([{op: 'trim', end: 2, why: 'mörka slutrutor'}, {op: 'key', to: 'key', why: 'jämna det gröna'}]));
  const fixed = await fixFilm(path.join(root, delivered), fixes);
  assert.ok(fixed.ok, JSON.stringify(fixed));
  const plan = await planRegistration(root, ORDER, 1, {fixed: 1}), clip = 'paow-giv-p4-01', copy = `${clip}-fix-1`;
  assert.deepEqual(plan.takes.map(x => [x.id, x.clip, x.frames, x.editOf, x.model, x.order]), [[`${copy}-deal`, copy, [0, 5], `${clip}-deal`, 'kling-4 + film-fix', {id: ORDER, take: 1, fix: 1}], [`${copy}-return-ready`, copy, [6, 9], `${clip}-return-ready`, 'kling-4 + film-fix', {id: ORDER, take: 1, fix: 1}]]);
  await register(root, plan);
  const back = await read(root, `motions/${copy}-return-ready.json`);
  assert.deepEqual([back.review.inbox, back.motion.startsOn, back.fix.of, back.fix.steps.map((s: {op: string}) => s.op)], [true, {clip: `${clip}-deal`, frame: 6}, clip, ['trim', 'key']]);
  assert.equal(sha(await readFile(path.join(root, `assets/motions/${copy}/source.mp4`))), (fixed as unknown as {record: {output: {sha256: string}}}).record.output.sha256);
  const g = await graphOf(root, 'paow'), take = (id: string) => g.takes[id];
  assert.deepEqual(g.unplaced, []); assert.equal(take(`${copy}-deal`).editOf, `${clip}-deal`);
  for (const [r, d] of [[`${clip}-return-ready`, `${copy}-deal`], [`${copy}-return-ready`, `${clip}-deal`], [`${copy}-return-ready`, `${copy}-deal`]]) assert.ok(returnFits(take(r), take(d)), `${r} after ${d}`);
  // A copy cut at its start would shift a deal's frame numbers under its returns: refused.
  await writeFile(fixes, JSON.stringify([{op: 'trim', start: 1}]));
  assert.ok((await fixFilm(path.join(root, delivered), fixes)).ok);
  await assert.rejects(planRegistration(root, ORDER, 1, {fixed: 2}), /hold i stället för trim i början/);
  await assert.rejects(planRegistration(root, ORDER, 1, {fixed: 9}), /finns inte bredvid/);
});

test('a one-way film is one take with its first and last picture, named after the order and its dealer', needsFfmpeg, async t => {
  const {root, film} = await bank(t), id = 'vila-prov';
  await writeFile(path.join(root, `data/orders/${id}.json`), JSON.stringify(order(id, {step: {key: 'VILA', label: 'Vila', edge: 'IDLE>IDLE', shape: 'ONE_WAY', cutInto: ['IDLE>IDLE'], makes: null}, generation: {provider: 'runway-app', tool: 'generate_video', model: 'wan3', params: {resolution: '1080p', ratio: 'adaptive', duration: 4}}})));
  await mkdir(path.join(root, `assets/orders/${id}`), {recursive: true}); await writeFile(path.join(root, `assets/orders/${id}/receipt.json`), JSON.stringify(receipt(id)));
  await collectTake(root, id, 1, {from: film});
  const plan = await planRegistration(root, id, 1);
  assert.deepEqual(plan.takes.map(x => [x.id, x.kind, x.clip, x.frames, x.model, x.first?.file?.path, x.last?.file?.path]), [['paow-vila-prov-01', 'IDLE', 'paow-vila-prov-01', [0, 11], 'wan3', `assets/orders/${id}/first.png`, `assets/orders/${id}/last.png`]]);
  await register(root, plan);
  const record = await read(root, 'motions/paow-vila-prov-01.json');
  assert.deepEqual([record.review.inbox, record.source.model, record.source.fps, record.motion.segment], [true, 'wan3', 24, undefined]);
  const g = await graphOf(root, 'paow');
  assert.equal(g.edge['IDLE>IDLE'].main?.id, 'paow-vila-prov-01'); assert.equal(g.takes['paow-vila-prov-01'].job.model, 'wan3');
});
