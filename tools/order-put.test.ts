// The receipt writer (tools/order-put.ts) keeps exactly-once: requestedAt before the call, the task id after, a begun
// take never begun again, nothing for an order that is not approved or has changed since, files checked against their hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ARM_AT_SHOE, POSE_WHAT, orderStore } from './order-store.ts';
import { committedText } from './committed.ts';
import { receipts } from './order-put.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();

async function approved(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(base, 'order-put-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'placements', 'assets/anchors/a', 'assets/anchors/b']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['data/order-policy.json', 'data/dealers.json', 'data/order-methods.json']) await copyFile(file, path.join(root, file));
  const policyFile = path.join(root, 'data/order-policy.json');
  const policy = JSON.parse(await readFile(policyFile, 'utf8'));
  const mandate = {id: 'fixture-mandate', startsAt: '2026-11-12T21:00:00Z', endsAt: '2026-11-13T03:00:00Z', rollingHourCredits: 800, totalCredits: 2500};
  const writeMandate = (override = {}) => writeFile(policyFile, JSON.stringify({...policy, mandate: {...mandate, ...override}}));
  await writeMandate();
  let instant = '2026-11-12T22:00:00Z';
  const setTime = (at: string) => { instant = at; };
  const now = () => new Date(instant);
  await writeFile(path.join(root, 'placements/default.json'), committedText('placements/default.json')); // his plan as committed, not as he last saved it (tools/committed.ts)
  const png = await sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r: 0, g: 237, b: 44 } } }).png().toBuffer();
  await writeFile(path.join(root, 'assets/anchors/a/anchor.png'), png);
  await writeFile(path.join(root, 'assets/anchors/b/anchor.png'), png);
  await writeFile(path.join(root, 'data/clip-jobs.json'), '{"jobs": []}');
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify({ schemaVersion: 1, measures: [], dealers: {
    pamela: { name: 'Pamela', entries: [{ id: 'pamela-nyp', role: 'ankare-2.1', name: 'Nyp', path: 'assets/anchors/b/anchor.png', node: 'READY', state: 'gäller' }] },
    paow: { name: 'Paow', entries: [{ id: 'paow-vila', role: 'ankare-1', name: 'Vila', path: 'assets/anchors/a/anchor.png', node: 'IDLE', state: 'gäller' }] },
  } }));
  const store = orderStore(root, { now });
  const draft = await store.create({ dealer: 'paow', step: 'ANKARE-2.1', takes: 2, id: 'prov-ett', pose: { entry: 'pamela-nyp', keep: ARM_AT_SHOE, what: POSE_WHAT } });
  const r = receipts(root, { now });
  await assert.rejects(r.begin('prov-ett', 1), /inte godkänd/);
  await store.approve('prov-ett', draft.revision);
  return { root, r, store, setTime, writeMandate };
}


type BeginResult =
  | {ok: true; status: string; credits: number}
  | {ok: false; status: number; message: string};

const beginProbe = `
  const [moduleUrl, id] = process.argv.slice(1);
  const root = process.cwd();
  if (!/(?:^|[\\\\/])order-put-[^\\\\/]+$/.test(root)) throw Error('A receipt probe needs its fixture.');
  const {receipts} = await import(moduleUrl);
  process.once('message', async () => {
    let result;
    try {
      const {take} = await receipts(root, {now: () => new Date('2026-11-12T22:00:00Z')}).begin(id, 1);
      result = {ok: true, status: take.status, credits: take.reservation?.credits};
    } catch (error) {
      result = {ok: false, status: error.status, message: error.message};
    }
    process.send({result}, () => process.disconnect());
  });
  process.send({ready: true});
`;

// The IPC barrier starts independent Node processes together, after both have loaded the real receipt writer.
async function beginProcesses(root: string, ids: string[]): Promise<BeginResult[]> {
  const moduleUrl = new URL('./order-put.ts', import.meta.url).href;
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const probes = ids.map(id => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', beginProbe, moduleUrl, id], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let result: BeginResult | undefined;
    let output = '';
    child.stderr?.on('data', data => { output = (output + String(data)).slice(-4000); });
    child.on('error', error => { output += error.message; });
    child.on('message', message => { const reply = (message as {result?: BeginResult}).result; if (reply) result = reply; });
    const ready = new Promise<void>(resolve => {
      child.once('message', message => { if ((message as {ready?: boolean}).ready) resolve(); });
    });
    const closed = new Promise<{code: number | null; result?: BeginResult; output: string}>(resolve => {
      child.once('close', code => resolve({code, result, output}));
    });
    return {child, ready, closed};
  });
  const stop = () => {
    for (const {child} of probes) if (child.exitCode === null && child.signalCode === null) child.kill();
  };
  const timeout = setTimeout(stop, 15000);
  try {
    await Promise.race([
      Promise.all(probes.map(probe => probe.ready)),
      ...probes.map(probe => probe.closed.then(({code, output}) => {
        throw new Error('Receipt probe exited before ready (' + code + '). ' + output);
      })),
    ]);
    for (const {child} of probes) child.send('begin');
    const completed = await Promise.all(probes.map(probe => probe.closed));
    return completed.map(({code, result, output}) => {
      assert.equal(code, 0, output);
      assert.ok(result, output);
      return result;
    });
  } finally {
    clearTimeout(timeout);
    stop();
    await Promise.all(probes.map(probe => probe.closed));
  }
}

test('requestedAt before, task id after, and a begun take is never begun again', async (t) => {
  const { root, r } = await approved(t);
  const check = await r.check('prov-ett');
  assert.deepEqual(check.files.map((f) => [f.name, f.mimeType, f.tag, f.goesAs]), [['anchor.png', 'image/png', 'anchor', 'referenceImage'], ['pose-figure.png', 'image/png', 'pose', 'referenceImage']]);
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

test('the reviewer\'s verdict is kept beside a take from HÄMTAD on without moving its state, and the protocol reads it', async (t) => {
  const { root, r } = await approved(t);
  await r.begin('prov-ett', 1);
  await assert.rejects(r.review('prov-ett', 1, 'Oberoende granskare: 3/5'), /OSÄKER: granskarens dom förs in först när filmen är hämtad/);
  await r.placed('prov-ett', 1, 'b90b9362-7a13-4b80-b498-c324f02c41f8');
  await assert.rejects(r.review('prov-ett', 1, 'Oberoende granskare: 3/5'), /LAGD/);
  await assert.rejects(r.review('prov-ett', 2, 'x'), /inte lagd/);
  await writeFile(path.join(root, 'assets/orders/prov-ett/tagning-1.png'), 'png');
  await r.advance('prov-ett', 1, 'HÄMTAD', { file: 'assets/orders/prov-ett/tagning-1.png' });
  await r.advance('prov-ett', 1, 'INFÖRD', { note: 'förd in före granskningen' });
  await assert.rejects(r.review('prov-ett', 1, '  '), /--note/);
  const kept = await r.review('prov-ett', 1, 'Oberoende granskare: given 2,5/5, returen 1/5 möjlig variant.');
  assert.equal(kept.take.status, 'INFÖRD', 'the state does not move');
  assert.deepEqual(kept.take.review, { at: '2026-11-12T22:00:00.000Z', note: 'Oberoende granskare: given 2,5/5, returen 1/5 möjlig variant.' });
  assert.deepEqual(kept.take.history.map((h) => h.status), ['OSÄKER', 'LAGD', 'HÄMTAD', 'INFÖRD'], 'no step is added');
  const { reviewerNote, scoresOf } = await import('../studio/lib/ledger.ts');
  const receipt = JSON.parse(await readFile(path.join(root, 'assets/orders/prov-ett/receipt.json'), 'utf8'));
  assert.deepEqual(scoresOf(reviewerNote(receipt.takes[0].history, receipt.takes[0].review)), { score: 2.5, deal: 2.5, back: 1 });
  // A later GRANSKAD note is newer than the one kept beside, and the other way round.
  assert.equal(reviewerNote([{ at: '2026-11-13T01:00:00Z', status: 'GRANSKAD', note: 'Oberoende granskare: 4/5' }], { at: '2026-11-12T22:00:00Z', note: 'Oberoende granskare: 1/5' }), 'Oberoende granskare: 4/5');
  assert.equal(reviewerNote([{ at: '2026-11-12T21:00:00Z', status: 'GRANSKAD', note: 'Oberoende granskare: 4/5' }], { at: '2026-11-12T22:00:00Z', note: 'Oberoende granskare: 1/5' }), 'Oberoende granskare: 1/5');
});

test('nothing is placed for an order that changed after approval or whose picture changed on disk', async (t) => {
  const { root, r } = await approved(t);
  const file = path.join(root, 'data/orders/prov-ett.json');
  const order = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify({ ...order, takes: 1 }, null, 2));
  await assert.rejects(r.begin('prov-ett', 1), /ändrats efter godkännandet/);
  await writeFile(file, JSON.stringify(order, null, 2));
  await writeFile(path.join(root, 'assets/orders/prov-ett/pose-figure.png'), 'other');
  await assert.rejects(r.begin('prov-ett', 1), /inte den godkända filen/);
});

test('the main agent approves on Jakob\'s mandate with the same checks; check takes it only with the mandate; a draft can be set aside', async (t) => {
  const { root, store } = await approved(t);
  const { approveCommand } = await import('./order-approve.ts');
  const draft = await store.create({ dealer: 'paow', step: 'ANKARE-2.1', takes: 2, id: 'prov-tva', pose: { entry: 'pamela-nyp', keep: ARM_AT_SHOE, what: POSE_WHAT } });
  await assert.rejects(approveCommand(root, ['prov-tva', '--mandate', ' ']), /Använd/);
  const out = await approveCommand(root, ['prov-tva', '--mandate', 'Jakob 2026-11-13: beställ lämpliga filmer automatiskt utan mitt godkännande'], { now: () => new Date('2026-11-12T22:00:00Z') });
  const approval = out.approval as { by: string; mandate: string; orderSha256: string };
  assert.deepEqual([approval.by, approval.mandate], ['huvudagent', 'Jakob 2026-11-13: beställ lämpliga filmer automatiskt utan mitt godkännande']);
  assert.match(String((out.day as { words: string }).words), /krediter intecknade i dag med den här/);
  const { order } = await store.load('prov-tva');
  assert.equal(order.approval!.orderSha256, (await import('./order-store.ts')).orderHash(order), 'the hash frozen as for his click');
  assert.equal(draft.order.id, 'prov-tva');
  const r = receipts(root);
  assert.equal((await r.check('prov-tva')).order.approval!.by, 'huvudagent');
  // Without its mandate the approval is refused: by the order check and by check.
  const file = path.join(root, 'data/orders/prov-tva.json');
  const value = JSON.parse(await readFile(file, 'utf8'));
  delete value.approval.mandate;
  await writeFile(file, JSON.stringify(value, null, 2));
  await assert.rejects(r.check('prov-tva'), /uppdrag/);
  await assert.rejects(r.begin('prov-tva', 1), /uppdrag/);
  // Set aside with why: AVBRUTEN, the reason kept; an approved order cannot be set aside.
  await store.create({ dealer: 'paow', step: 'ANKARE-2.1', takes: 2, id: 'prov-tre', pose: { entry: 'pamela-nyp', keep: ARM_AT_SHOE, what: POSE_WHAT } });
  const aside = await approveCommand(root, ['prov-tre', '--set-aside', 'Långa textens metodprov körs inte (huvudagenten 2026-11-13).']);
  assert.equal(aside.status, 'AVBRUTEN');
  assert.match(String((aside.setAside as { why: string }).why), /körs inte/);
  await assert.rejects(approveCommand(root, ['prov-ett', '--set-aside', 'x']), /godkänd/);
});

test('the rolling hour is shared across Node processes and uncertain calls keep their reservation', async t => {
  const {root, r, store, setTime, writeMandate} = await approved(t);
  const draft = await store.create({ dealer: 'paow', step: 'ANKARE-2.1', takes: 1, id: 'prov-andra',
    pose: { entry: 'pamela-nyp', keep: ARM_AT_SHOE, what: POSE_WHAT } });
  await store.approve(draft.order.id, draft.revision);
  const credits = (await store.load('prov-ett')).order.cost.worstPerTake;
  const hourlyLimit = Math.floor(credits * 1.5), totalLimit = credits * 2;
  await writeMandate({rollingHourCredits: hourlyLimit, totalCredits: totalLimit});

  const orders = ['prov-ett', 'prov-andra'];
  const attempts = await beginProcesses(root, orders);
  assert.equal(attempts.filter(result => result.ok).length, 1, JSON.stringify(attempts));
  const winner = orders[attempts.findIndex(result => result.ok)];
  const loser = orders[attempts.findIndex(result => !result.ok)];
  const refused = attempts.find(result => !result.ok);
  assert.ok(refused && (refused.status === 409 || refused.status === 403), JSON.stringify(attempts));
  assert.match(refused.message, /reserverar krediter|ryms inte/);
  assert.equal(existsSync(path.join(root, '.runtime/order-mandate.lock')), false);
  assert.equal((await r.read(winner))?.takes[0]?.reservation?.credits, credits);
  assert.equal(await r.read(loser), null);
  assert.deepEqual((await store.list()).policy?.mandateBudget?.available, hourlyLimit - credits);

  setTime('2026-11-12T23:00:00Z');
  await assert.rejects(r.begin(loser, 1), /ryms inte/);
  await r.placed(winner, 1, 'b90b9362-7a13-4b80-b498-c324f02c41f8');
  setTime('2026-11-12T23:59:59Z');
  await assert.rejects(r.begin(loser, 1), /ryms inte/);
  setTime('2026-11-13T00:00:00Z');
  assert.equal((await r.begin(loser, 1)).take.reservation?.credits, credits);
  const closed = (await store.list()).policy?.mandateBudget;
  assert.deepEqual([closed?.hourlyReserved, closed?.totalReserved, closed?.available], [credits, totalLimit, 0]);
});

test('a lock left by an interrupted process refuses a new start and remains in place', async t => {
  const {root, r} = await approved(t);
  const lock = path.join(root, '.runtime/order-mandate.lock');
  const abandoned = 'fixture: previous process exited before removing its lock';
  await writeFile(lock, abandoned, {flag: 'wx'});
  const [blocked] = await beginProcesses(root, ['prov-ett']);
  assert.ok(!blocked.ok, JSON.stringify(blocked));
  assert.equal(blocked.status, 409);
  assert.match(blocked.message, /reserverar krediter/);
  assert.equal(await r.read('prov-ett'), null);
  assert.equal(await readFile(lock, 'utf8'), abandoned);
});

test('a Dealer run imported from outside Beställ uses the order cost and blocks a new paid start', async t => {
  const {root, r, store, setTime} = await approved(t);
  const id = 'eget-importerat';
  const folder = path.join(root, 'assets/orders', id);
  const requestedAt = '2026-11-12T23:00:00+01:00';
  await mkdir(folder, {recursive: true});
  await writeFile(path.join(root, 'data/orders', id + '.json'), JSON.stringify({cost: {worstPerTake: 900}}));
  await writeFile(path.join(folder, 'receipt.json'), JSON.stringify({
    schemaVersion: 1, order: id, orderSha256: 'a'.repeat(64), takes: [{
      take: 1, status: 'HÄMTAD', requestedAt, taskId: 'imported-pilot-001', outside: true, creditsRemainingAfter: 10000,
      history: [{at: requestedAt, status: 'LAGD'}],
    }],
  }));
  const blocked = (await store.list()).policy?.mandateBudget;
  assert.deepEqual([blocked?.status, blocked?.hourlyReserved, blocked?.totalReserved, blocked?.available], ['active', 900, 900, 0]);
  await assert.rejects(r.begin('prov-ett', 1), /ryms inte/);
  assert.equal(await r.read('prov-ett'), null);

  setTime('2026-11-12T23:00:00Z');
  const later = (await store.list()).policy?.mandateBudget;
  assert.deepEqual([later?.hourlyReserved, later?.totalReserved, later?.available], [0, 900, 800]);
});

test('only the fixed mandate window opens new paid starts, and leaving it preserves existing orders and receipts', async t => {
  const {root, r, store, setTime} = await approved(t);
  setTime('2026-11-12T20:59:59.999Z');
  await assert.rejects(r.begin('prov-ett', 1), /Mandatet börjar/);
  setTime('2026-11-12T21:00:00Z');
  assert.equal((await r.begin('prov-ett', 1)).validUntil, '2026-11-13T03:00:00Z');
  setTime('2026-11-13T03:00:00Z');
  await assert.rejects(r.begin('prov-ett', 2), /Mandatet löpte ut/);
  const snapshot = await store.list();
  assert.equal(snapshot.policy?.mandateBudget?.status, 'expired');
  assert.equal(snapshot.orders.find(item => item.order.id === 'prov-ett')?.receipt?.takes[0]?.status, 'OSÄKER');
  await r.placed('prov-ett', 1, 'b90b9362-7a13-4b80-b498-c324f02c41f8');
  assert.equal((await r.read('prov-ett'))?.takes[0]?.status, 'LAGD');

  const file = path.join(root, 'data/order-policy.json');
  const policy = JSON.parse(await readFile(file, 'utf8'));
  delete policy.mandate;
  await writeFile(file, JSON.stringify(policy));
  await assert.rejects(r.begin('prov-ett', 2), /Inget giltigt beställningsmandat/);
  assert.equal((await r.read('prov-ett'))?.takes.length, 1);
});
