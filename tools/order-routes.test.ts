// The routes of the view Beställ and of Jakob's verdict in Material (tools/order-routes.ts), run against a temporary
// copy of the data on a real local server: drafts from a few choices, changes only with the revision read, approval only
// from the lab's own origin and within the policy, nothing changed after approval, files only from the order's folder,
// and kandidat → gäller with the other candidates replaced. Pictures here are tiny PNGs; no film is decoded.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { orderRoutes } from './order-routes.ts';
import { ARM_AT_SHOE, POSE_WHAT, orderStore, orderHash } from './order-store.ts';
import { promptFor } from '../src/order-prompts.ts';
import { mediaRoles } from './media-roles.ts';
import { replacedBy, allowed, isDecidable } from '../studio/components/material/state.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
// The bank's frame: a pose figure is cut in bank pixels.
const picture = (r: number, g: number, b: number) => sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r, g, b } } }).png().toBuffer();
// The pose of a still from the test register (the real POSE points at a bank film that is not in the temporary lab).
const poses = { 'ANKARE-2.1': { entry: 'pamela-nyp', label: 'Pamelas nyp', keep: ARM_AT_SHOE, what: POSE_WHAT }, 'ANKARE-2.2': { entry: 'pamela-nyp', label: 'Pamelas nyp som släp', keep: ARM_AT_SHOE, what: POSE_WHAT } };

const register = () => ({
  schemaVersion: 1,
  dealers: {
    pamela: { name: 'Pamela', entries: [
      { id: 'pamela-vila', role: 'ankare-1', name: 'Vila', path: 'assets/anchors/pamela-vila/anchor.png', node: 'IDLE', state: 'gäller' },
      { id: 'pamela-nyp', role: 'ankare-2.1', name: 'Nyp', path: 'assets/anchors/pamela-nyp/anchor.png', node: 'READY' },
    ] },
    paow: { name: 'Paow', entries: [
      { id: 'paow-vila-ung-2', role: 'ankare-1', name: 'Vila, kandidat 2', path: 'assets/anchors/paow-vila-ung-2/anchor.png', node: 'IDLE', state: 'kandidat' },
      { id: 'paow-vila-ung-1', role: 'ankare-1', name: 'Vila, kandidat 1', path: 'assets/anchors/paow-vila-ung-1/anchor.png', node: 'IDLE', state: 'kandidat' },
      { id: 'paow-vila-kort', role: 'ankare-1', name: 'Vila med kort', path: 'assets/anchors/paow-vila-ung-1/anchor.png', node: 'IDLE', card: 'P4.C1', state: 'kandidat' },
      { id: 'paow-nyp-ny', role: 'ankare-2.1', name: 'Nyp, ny', path: 'assets/anchors/paow-nyp-ny/anchor.png', node: 'READY', state: 'kandidat' },
      { id: 'paow-film', role: 'film', name: 'En film', path: 'assets/films/paow/x/source.mp4', state: 'kandidat' },
    ] },
  },
  measures: [],
});

async function lab(t: { after(fn: () => Promise<void> | void): void }) {
  const root = await mkdtemp(path.join(base, 'order-routes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'placements']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['data/order-policy.json', 'data/dealers.json', 'placements/default.json']) await copyFile(file, path.join(root, file));
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register(), null, 2) + '\n');
  await writeFile(path.join(root, 'data/clip-jobs.json'), '{"jobs": []}');
  const files: Record<string, Buffer> = {};
  for (const [name, colour] of [['pamela-vila', [0, 237, 44]], ['pamela-nyp', [10, 230, 40]], ['paow-vila-ung-2', [0, 236, 45]], ['paow-vila-ung-1', [1, 235, 46]], ['paow-nyp-ny', [2, 234, 47]]] as const) {
    await mkdir(path.join(root, 'assets/anchors', name), { recursive: true });
    files[name] = await picture(...colour);
    await writeFile(path.join(root, 'assets/anchors', name, 'anchor.png'), files[name]);
  }
  let origin = '';
  const handle = { fn: null as null | ReturnType<typeof orderRoutes> };
  const server = http.createServer(async (req, res) => { const url = new URL(req.url ?? '/', origin); if (!(await handle.fn!(req, res, url))) res.writeHead(404).end('not mine'); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  handle.fn = orderRoutes({ root, origin, now: () => new Date('2026-11-12T21:00:00Z'), poses });
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const call = async (method: string, address: string, options: { body?: unknown; match?: string; from?: string | null } = {}) => {
    const headers: Record<string, string> = {};
    if (options.from !== null) headers.origin = options.from ?? origin;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.match) headers['if-match'] = options.match;
    const response = await fetch(origin + address, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const type = response.headers.get('content-type') ?? '';
    return { status: response.status, json: type.includes('json') ? await response.json() : null, bytes: type.includes('json') ? null : Buffer.from(await response.arrayBuffer()) };
  };
  return { root, origin, call, files };
}

test('drafts, changes and approval go through the routes with their guards', async (t) => {
  const { root, call, files } = await lab(t);
  assert.equal((await call('GET', '/api/orders')).json.orders.length, 0);
  assert.equal((await call('GET', '/api/other')).status, 404, 'other addresses are left to the server');

  const still = { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' };
  assert.equal((await call('POST', '/api/orders', { body: still, from: 'http://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/orders', { body: { ...still, id: 'mine' } })).status, 400, 'the page cannot name the id');
  assert.equal((await call('POST', '/api/orders', { body: { ...still, pose: { path: 'C:/x.png' } } })).status, 400, 'nor the pose');
  const made = await call('POST', '/api/orders', { body: still });
  assert.equal(made.status, 201);
  const a = made.json;
  assert.equal(a.order.id, 'paow-ankare-2-1-01');
  assert.equal(a.shown, 'KLAR_ATT_TRYCKA');
  assert.match(a.warnings.join(' '), /Vila, kandidat 2 är kandidat, inte godkänd/);
  const anchor = a.order.pictures.find((p: { name: string }) => p.name === 'anchor.png');
  assert.equal(anchor.sha256, sha(files['paow-vila-ung-2']), 'the picture is copied byte for byte');
  assert.equal((await call('GET', `/${anchor.path}`)).bytes!.equals(files['paow-vila-ung-2']), true);
  assert.equal(anchor.label, 'Paows ankare 1 · kandidat 2', 'which of her pictures the draft uses');
  const pose = a.order.pictures.find((p: { name: string }) => p.name === 'pose-figure.png');
  assert.equal(pose.from.entry, 'pamela-nyp');
  assert.equal(pose.label, 'Pose · bara armen, handen och skon');
  assert.deepEqual(pose.cut.keep, ARM_AT_SHOE);
  assert.equal(pose.cut.source.sha256, sha(files['pamela-nyp']));
  assert.equal(a.order.summary, 'Gör Paows ankare 2.1: hennes ankare 1 där bara vänsterarmen flyttas till nypet vid skon.');
  assert.equal(a.order.cost.total, 80);

  // Files: only pictures and films directly in the order's folder.
  for (const bad of [`/assets/orders/${a.order.id}/receipt.json`, `/assets/orders/${a.order.id}/..%2F..%2Fdata%2Forder-policy.json`, '/assets/orders/../data/order-policy.json', '/assets/orders/x/none.png']) assert.equal((await call('GET', bad)).status, 404, bad);

  // A change needs the revision read; only some fields change; the text and cost follow.
  const id = a.order.id;
  assert.equal((await call('PUT', `/api/orders/${id}`, { body: { takes: 1 } })).status, 428);
  assert.equal((await call('PUT', `/api/orders/${id}`, { body: { takes: 1 }, match: '"x"' })).status, 409);
  assert.equal((await call('PUT', `/api/orders/${id}`, { body: { prompt: 'mine' }, match: a.revision })).status, 400);
  const changed = await call('PUT', `/api/orders/${id}`, { body: { takes: 1, extra: 'She smiles.' }, match: a.revision });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.order.cost.total, 40);
  assert.match(changed.json.order.prompt.text, /She smiles\. Nothing of this happens/);

  // Approval: own origin, revision, then frozen with its hash.
  assert.equal((await call('POST', `/api/orders/${id}/approve`, { match: changed.json.revision, from: null })).status, 403);
  assert.equal((await call('POST', `/api/orders/${id}/approve`)).status, 428);
  const approved = await call('POST', `/api/orders/${id}/approve`, { match: changed.json.revision });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.order.status, 'GODKÄND');
  assert.deepEqual(approved.json.order.approval, { by: 'jakob', at: '2026-11-12T21:00:00.000Z', orderSha256: orderHash(approved.json.order) });
  assert.equal(approved.json.shown, 'GODKÄND');
  assert.equal((await call('PUT', `/api/orders/${id}`, { body: { takes: 2 }, match: approved.json.revision })).status, 409, 'nothing changes after approval');
  assert.equal((await call('POST', `/api/orders/${id}/approve`, { match: approved.json.revision })).status, 409);
  const list = (await call('GET', '/api/orders')).json;
  assert.equal(list.day.spent, 40);

  // The policy: beyond the cap per order the approval is refused.
  const policy = JSON.parse(await readFile(path.join(root, 'data/order-policy.json'), 'utf8'));
  await writeFile(path.join(root, 'data/order-policy.json'), JSON.stringify({ ...policy, maxPerOrder: 50 }));
  const second = (await call('POST', '/api/orders', { body: still })).json;
  const refused = await call('POST', `/api/orders/${second.order.id}/approve`, { match: second.revision });
  assert.equal(refused.status, 403);
  assert.match(refused.json.error, /taket per beställning är 50/);
  await writeFile(path.join(root, 'data/order-policy.json'), JSON.stringify({ ...policy, enabled: false }));
  assert.match((await call('POST', `/api/orders/${second.order.id}/approve`, { match: second.revision })).json.error, /avstängda/);

  // A film that waits for its anchor cannot be approved.
  await writeFile(path.join(root, 'data/order-policy.json'), JSON.stringify(policy));
  const film = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', duration: 4 } })).json;
  assert.equal(film.shown, 'VÄNTAR');
  assert.deepEqual(film.waiting.map((w: { label: string; ready: boolean }) => [w.label, w.ready]), [['ankare 2.1', false], ['ankare 2.1', false]]);
  assert.equal(film.order.step.edge, 'READY>P4.C1');
  assert.equal(film.order.pictures[1].path, null, 'the last picture waits; no other dealer stands in');
  assert.match(film.order.prompt.text, /exactly where the blue card lies in the last frame, in the middle of the picture/, 'the place from the plan before the last picture exists');
  const waiting = await call('POST', `/api/orders/${film.order.id}/approve`, { match: film.revision });
  assert.equal(waiting.status, 409);
  assert.match(waiting.json.error, /Väntar på ankare 2\.1/);
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1' } })).status, 400, 'a step that is off');
});

test('Material: Godkänn replaces the other candidates of the same role, Underkänn sets one aside, against the revision', async (t) => {
  const { root, call } = await lab(t);
  const revision = async () => (await mediaRoles(root).answer()).revision!;
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' } })).status, 428);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' }, match: await revision(), from: 'http://evil.example' })).status, 403);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'kandidat' }, match: await revision() })).status, 400);
  assert.equal((await call('PUT', '/api/media/paow-film/state', { body: { state: 'gäller' }, match: await revision() })).status, 400, 'a film is not decided here');
  const ok = await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' }, match: await revision() });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.replaced, [{ id: 'paow-vila-ung-1', name: 'Vila, kandidat 1' }], 'the candidate with a card on the table is another picture');
  const after = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8')).dealers.paow.entries;
  const by = (id: string) => after.find((e: { id: string }) => e.id === id);
  assert.equal(by('paow-vila-ung-2').state, 'gäller');
  assert.match(by('paow-vila-ung-2').stateBy, /^Jakob \d{4}-\d\d-\d\d \d\d:\d\d: kandidat → gäller \(Material\)$/);
  assert.equal(by('paow-vila-ung-1').state, 'ersatt');
  assert.match(by('paow-vila-ung-1').stateBy, /Vila, kandidat 2 godkändes/);
  assert.equal(by('paow-vila-kort').state, 'kandidat');
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-1/state', { body: { state: 'gäller' }, match: await revision() })).status, 409, 'ersatt never comes back here');
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' }, match: ok.json.revision })).status, 409);
  assert.equal((await call('PUT', '/api/media/paow-vila-kort/state', { body: { state: 'ersatt' }, match: '"old"' })).status, 409);
  assert.equal((await call('PUT', '/api/media/paow-vila-kort/state', { body: { state: 'ersatt' }, match: ok.json.revision })).status, 200);
  assert.equal((await call('PUT', '/api/media/nobody/state', { body: { state: 'ersatt' }, match: await revision() })).status, 404);
  assert.equal(allowed('gäller', 'ersatt') && !allowed('ersatt', 'gäller') && !allowed(undefined, 'gäller'), true);
  assert.equal(isDecidable({ role: 'ankare-1', path: 'assets/x/source.mp4', frame: 3 }), true);
  assert.equal(replacedBy([{ id: 'a', role: 'ankare-1', state: 'kandidat' }, { id: 'b', role: 'ankare-1', state: 'kandidat' }, { id: 'c', role: 'ankare-1', state: 'gäller' }], { id: 'a', role: 'ankare-1', state: 'kandidat' }).map((e) => e.id).join(), 'b');
});

test('a draft that waits fetches its picture once the anchor holds: with refresh, or at once on Godkänn in Material', async (t) => {
  const { root, call, files } = await lab(t);
  const store = orderStore(root, { now: () => new Date('2026-11-12T21:00:00Z'), poses });
  const { order, revision } = await store.create({ dealer: 'paow', step: 'ANKARE-2.1' });
  assert.deepEqual(order.pictures.map((p) => [p.name, p.path === null, p.waits?.label ?? null]), [['anchor.png', true, 'ankare 1'], ['pose-figure.png', false, null]]);
  assert.equal((await call('GET', `/api/orders/${order.id}`)).json.waiting[0].ready, false);
  // Changed outside Material's route: the draft says it can fetch, and refresh fetches.
  const register = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8'));
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-vila-ung-1').state = 'gäller';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const before = (await call('GET', `/api/orders/${order.id}`)).json;
  assert.equal(before.waiting[0].ready, true);
  assert.match(before.refresh, /väntar på finns nu/);
  const refreshed = await call('POST', `/api/orders/${order.id}/refresh`, { match: revision });
  assert.equal(refreshed.status, 200);
  const anchor = refreshed.json.order.pictures[0];
  assert.equal(anchor.sha256, sha(files['paow-vila-ung-1']));
  assert.equal(anchor.from.entry, 'paow-vila-ung-1');
  assert.equal(anchor.label, 'Paows ankare 1');
  assert.equal(refreshed.json.shown, 'KLAR_ATT_TRYCKA');
  assert.equal(refreshed.json.refresh, null);
});

test('a draft follows the anchor Jakob approves in Material, and shows what its picture was', async (t) => {
  const { root, call, files } = await lab(t);
  const made = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  assert.equal(made.order.pictures[0].label, 'Paows ankare 1 · kandidat 2');
  assert.deepEqual(made.made, [made.order.id]);
  const media = await mediaRoles(root).answer();
  const decided = await call('PUT', '/api/media/paow-vila-ung-1/state', { body: { state: 'gäller' }, match: media.revision! });
  assert.equal(decided.status, 200);
  assert.deepEqual(decided.json.followed, [made.order.id], "the dealer's drafts followed at once");
  const after = (await call('GET', `/api/orders/${made.order.id}`)).json;
  const anchor = after.order.pictures[0];
  assert.equal(anchor.sha256, sha(files['paow-vila-ung-1']));
  assert.equal(anchor.label, 'Paows ankare 1');
  assert.deepEqual(anchor.replaced, { at: '2026-11-12T21:00:00.000Z', was: 'Paows ankare 1 · kandidat 2 (Vila, kandidat 2)', entry: 'paow-vila-ung-2', sha256: sha(files['paow-vila-ung-2']) });
  assert.equal(after.warnings.length, 0, 'the anchor holds now');
  assert.equal(after.refresh, null);
  // The same candidate approved: only the words change.
  const other = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.2', base: 'paow-vila-ung-1' } })).json;
  assert.equal(other.order.pictures[0].label, 'Paows ankare 1', 'made after the approval');
  assert.equal((await call('POST', `/api/orders/${made.order.id}/approve`, { match: after.revision })).status, 200);
});

test('a deal: the hand, handbyte and how the card lands, defaulted from the plan; "Alla sju" makes one draft per seat', async (t) => {
  const { call } = await lab(t);
  const list = (await call('GET', '/api/orders')).json;
  assert.deepEqual(list.dealers.map((d: { id: string }) => d.id), ['pamela', 'paow']);
  assert.match(list.dealers[1].look, /black tailored blazer/);
  const seats = list.plan.seats;
  const crossing = Object.values(seats as Record<string, { target: string; crosses: boolean }>).filter((s) => s.crosses).map((s) => s.target).sort();
  assert.deepEqual(crossing, ['P1.C1', 'P1.C2', 'P2.C1', 'P2.C2', 'P3.C1', 'P3.C2']);
  assert.deepEqual([seats['P4.C1'].side, seats['P4.C1'].hand, seats['P4.C1'].pass], ['FRONT', 'LH', false]);
  assert.deepEqual(list.poses.map((p: { step: string; owner: { dealer: string; part: string } }) => [p.step, p.owner.dealer, p.owner.part]), [['ANKARE-2.1', 'pamela', 'arm'], ['ANKARE-2.2', 'pamela', 'arm']]);
  const pose = await call('GET', '/api/orders/pose/ANKARE-2.1');
  assert.equal(pose.status, 200);
  assert.equal((await sharp(pose.bytes!).metadata()).width, 1764);
  assert.equal((await call('GET', '/api/orders/pose/VILA')).status, 404);

  // One seat, from the plan: left all the way, open; the text is the sheet's text for the same choices.
  const one = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P1.C1' } })).json;
  const m = one.order.motion;
  assert.deepEqual([m.hand, m.pass, m.side, m.turn, m.fromPlan, m.flipAxis], ['LH', false, 'FRONT', true, true, 'FREE']);
  const sheet = promptFor({ dealer: list.dealers[1], step: 'GIV-2.2', model: 'wan3', motion: m, place: { x: seats['P1.C1'].centre[0], y: seats['P1.C1'].centre[1] } });
  assert.equal(one.order.prompt.text, sheet.text, 'the sheet shows exactly what is stored');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.order.motion.flipAxis, 'AT_PLACE', 'from 2.1 the card turns at the place');

  // Closed, with handbyte; then changed on the draft.
  const closed = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P2.C1', side: 'BACK', pass: true } })).json;
  const c = closed.order.motion;
  assert.deepEqual([c.hand, c.pass, c.side, c.turn, c.fromPlan], ['LH', true, 'BACK', false, false]);
  assert.equal(closed.order.pictures[1].label, 'Sista bild · samma + kortet stängt på plats 2');
  assert.match(closed.order.prompt.text, /takes the same card by its edges/);
  assert.match(closed.order.summary, /ger det till höger lågt framför kroppen; höger lägger det stängt/);
  const changed = (await call('PUT', `/api/orders/${closed.order.id}`, { body: { hand: 'RH', side: 'FRONT' }, match: closed.revision })).json;
  const d = changed.order.motion;
  assert.deepEqual([d.hand, d.pass, d.side, d.turn], ['RH', false, 'FRONT', true]);
  assert.match(changed.order.prompt.text, /Her left hand waits by the shoe/);
  assert.equal(changed.order.pictures[1].label, 'Sista bild · samma + kortet öppet på plats 2');
  assert.equal((await call('PUT', `/api/orders/${closed.order.id}`, { body: { pass: true, hand: 'RH' }, match: changed.revision })).status, 400, 'handbyte goes from left to right');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P2.C1', hand: 'RH', pass: true } })).status, 400);

  // Alla sju: one draft per seat, a group, handbyte only where the left hand would cross her body.
  const all = ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1'].map((target) => ({ target, hand: 'LH', pass: seats[target].crosses }));
  const group = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: all, takes: 2 } });
  assert.equal(group.status, 201);
  assert.equal(group.json.made.length, 7);
  type A = { order: { group: { id: string; label: string } | null; motion: { target: string; pass: boolean }; prompt: { text: string }; cost: { total: number } } };
  const orders = ((await call('GET', '/api/orders')).json.orders as A[]).filter((a) => a.order.group);
  assert.equal(orders.length, 7);
  assert.equal(new Set(orders.map((a) => a.order.group!.id)).size, 1);
  assert.equal(orders[0].order.group!.label, 'Paow · giv från ankare 2.2 · alla sju');
  assert.deepEqual(orders.map((a) => [a.order.motion.target, a.order.motion.pass]), all.map((s) => [s.target, s.pass]));
  for (const a of orders) {
    const s = seats[a.order.motion.target];
    assert.equal(a.order.prompt.text, promptFor({ dealer: list.dealers[1], step: 'GIV-2.2', model: 'wan3', motion: a.order.motion as never, place: { x: s.centre[0], y: s.centre[1] } }).text, `${a.order.motion.target}: its own text`);
  }
  assert.match(orders[0].order.prompt.text, /far to the left of the picture/);
  assert.match(orders[6].order.prompt.text, /far to the right of the picture/);
  assert.equal(orders.reduce((sum, a) => sum + a.order.cost.total, 0), 1680);
  // All or nothing.
  const before = (await call('GET', '/api/orders')).json.orders.length;
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: [{ target: 'P1.C1' }, { target: 'P2.C1', hand: 'RH', pass: true }] } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: [{ target: 'P1.C1' }, { target: 'P1.C1' }] } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', seats: [{ target: 'P1.C1' }, { target: 'P2.C1' }] } })).status, 400);
  assert.equal((await call('GET', '/api/orders')).json.orders.length, before, 'nothing left of a group that could not be made');
});

test("whose each picture is: the dealer's own, the other dealer's arm only, never another dealer's whole picture", async (t) => {
  const { call } = await lab(t);
  const still = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  assert.deepEqual(still.owners['anchor.png'], { dealer: 'paow', name: 'Paow', part: 'whole' });
  assert.deepEqual(still.owners['pose-figure.png'], { dealer: 'pamela', name: 'Pamela', part: 'arm' });
  assert.equal(still.problems.length, 0);
  const film = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P4.C1' } })).json;
  assert.deepEqual([film.owners['first.png'].dealer, film.owners['last.png'].dealer], ['paow', 'paow'], 'what waits is still hers');
  const mixed = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'pamela-vila' } })).json;
  assert.match(mixed.problems.join(' '), /Paows ankare 1: bilden är Pamelas, inte Paows/);
  assert.equal((await call('POST', `/api/orders/${mixed.order.id}/approve`, { match: mixed.revision })).status, 409, 'a mix-up cannot be approved');
});

test('a pose figure keeps only the region, fills the rest of the person with the picture\'s green, and cuts the same every time', async () => {
  const { cutFigure, W, H } = await import('./order-images.ts');
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = 0; rgb[i * 3 + 1] = 240 + (i % 3); rgb[i * 3 + 2] = 60; }
  // A dark "person": a block at her head (outside the region) and one at the shoe (inside).
  const block = (x0: number, y0: number) => { for (let y = y0; y < y0 + 80; y++) for (let x = x0; x < x0 + 80; x++) rgb.fill(20, (y * W + x) * 3, (y * W + x) * 3 + 3); };
  block(800, 150); block(1500, 700);
  const one = cutFigure(rgb, ARM_AT_SHOE), two = cutFigure(rgb, ARM_AT_SHOE);
  assert.ok(one.rgb.equals(two.rgb), 'the same picture and region give the same bytes');
  const at = (x: number, y: number) => [...one.rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
  assert.ok(at(840, 190)[1] >= 235 && at(840, 190)[0] < 10, `the head is green: ${at(840, 190)}`);
  assert.deepEqual(at(1540, 740), [20, 20, 20], 'what lies in the region is kept');
  assert.ok(one.filledPx > 6400 && one.keptPx === 6400, `${one.filledPx} filled, ${one.keptPx} kept`);
});
