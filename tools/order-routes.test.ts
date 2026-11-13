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
import { ARM_ALONE, ARM_AT_SHOE, POSE_ARM_WHAT, POSE_WHAT, SHOE_AT_ANCHOR, SLEEVE_AT_SHOE, orderStore, orderHash } from './order-store.ts';
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
  assert.match(changed.json.order.prompt.text, /She smiles\.$/, 'a new still is written short: the addition last, no list of bans');
  assert.equal(changed.json.order.prompt.template, 'bild-ankare-kort@7');

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
  assert.deepEqual([film.order.prompt.style, film.order.prompt.template], ['KORT', 'film-giv-kort@7'], 'a new film is written in the short text');
  const long = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', duration: 4, style: 'UTFÖRLIG' } })).json;
  assert.match(long.order.prompt.text, /exactly where the blue card lies in the last frame, in the middle of the picture/, 'the place from the plan before the last picture exists');
  assert.deepEqual([long.order.prompt.style, long.order.prompt.template], ['UTFÖRLIG', 'film-giv@3']);
  const waiting = await call('POST', `/api/orders/${film.order.id}/approve`, { match: film.revision });
  assert.equal(waiting.status, 409);
  assert.match(waiting.json.error, /Väntar på ankare 2\.1/);
  const noLanding = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1' } });
  assert.equal(noLanding.status, 400, 'a return needs a landing picture that holds');
  assert.match(noLanding.json.error, /Ingen landningsbild gäller för Paows plats 4\. Godkänn en i Material/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY' } })).json.error, /Ingen landningsbild gäller/, 'and so does a deal bara dit');
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', style: 'MINIMAL' } })).json.error, /En bild skrivs KORT eller UTFÖRLIG/);
  // Only a dealer of data/dealers.json can be ordered for; the register may hold others (a separate track).
  const unknown = await call('POST', '/api/orders', { body: { dealer: 'petra', step: 'VILA' } });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.error, 'petra finns inte i data/dealers.json, så inget kan beställas för henne här.');
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
  assert.equal(replacedBy([{ id: 'a', role: 'ankare-1', state: 'kandidat' }, { id: 'b', role: 'ankare-1', state: 'kandidat' }, { id: 'c', role: 'ankare-1', state: 'gäller' }], { id: 'a', role: 'ankare-1', state: 'kandidat' }).map((e) => e.id).join(), 'b,c', 'the one that held gives way too: one picture holds per role');
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
  const sheet = promptFor({ dealer: list.dealers[1], step: 'GIV-2.2', model: 'wan3', motion: m, place: { x: seats['P1.C1'].centre[0], y: seats['P1.C1'].centre[1] }, style: 'KORT' });
  assert.equal(one.order.prompt.text, sheet.text, 'the sheet shows exactly what is stored');
  // The plan of the checkout says turnAt AIR for every card, so a new deal from 2.1 turns as the hand can; PLACE there gives AT_PLACE.
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.order.motion.flipAxis, 'FREE', 'the turn follows Placering');

  // Closed, with handbyte; then changed on the draft.
  const closed = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P2.C1', side: 'BACK', pass: true, style: 'UTFÖRLIG' } })).json;
  const c = closed.order.motion;
  assert.deepEqual([c.hand, c.pass, c.side, c.turn, c.fromPlan, c.flipAxis], ['LH', true, 'BACK', false, false, null], 'a card that is not turned stores no turn');
  assert.equal(closed.order.pictures[1].label, 'Sista bild · samma + kortet stängt på plats 2');
  assert.match(closed.order.prompt.text, /takes the same card by its edges/);
  assert.match(closed.order.summary, /ger det till höger lågt framför kroppen; höger lägger det stängt/);
  const changed = (await call('PUT', `/api/orders/${closed.order.id}`, { body: { hand: 'RH', side: 'FRONT' }, match: closed.revision })).json;
  const d = changed.order.motion;
  assert.deepEqual([d.hand, d.pass, d.side, d.turn, d.flipAxis], ['RH', false, 'FRONT', true, 'FREE'], 'opened again: the turn the plan suggests');
  assert.match(changed.order.prompt.text, /Her left hand waits by the shoe/);
  assert.equal(changed.order.pictures[1].label, 'Sista bild · samma + kortet öppet på plats 2');
  assert.equal((await call('PUT', `/api/orders/${closed.order.id}`, { body: { pass: true, hand: 'RH' }, match: changed.revision })).status, 400, 'handbyte goes from left to right');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P2.C1', hand: 'RH', pass: true } })).status, 400);

  // Alla sju: one draft per seat, a group, handbyte only where the left hand would cross her body.
  const all = ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1'].map((target) => ({ target, hand: 'LH', pass: seats[target].crosses }));
  const group = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: all, takes: 2, style: 'UTFÖRLIG' } });
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
    assert.equal(a.order.prompt.text, promptFor({ dealer: list.dealers[1], step: 'GIV-2.2', model: 'wan3', motion: a.order.motion as never, place: { x: s.centre[0], y: s.centre[1] }, style: 'UTFÖRLIG' }).text, `${a.order.motion.target}: its own text`);
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

test('a film made with another model: the 4K model for the entry, its parameters, title and price; a model the step cannot use is refused', async (t) => {
  const { call } = await lab(t);
  // The 4K model was tried (paow-ingang-2-1-02) and is not offered for a new order; that order still reads.
  const off = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'INGANG-2.1', model: 'kling-3-4k', duration: 4, takes: 1 } });
  assert.equal(off.status, 400);
  assert.match(off.json.error, /^Kling 3\.0 4K beställs inte längre: Provad 2026-11-13 \(paow-ingang-2-1-02\)/);
  const made = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'INGANG-2.1', model: 'kling-4', duration: 4, takes: 1 } });
  assert.equal(made.status, 201);
  const o = made.json.order;
  assert.deepEqual(o.generation, { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 4 } });
  assert.deepEqual([o.cost.perTake, o.cost.total, o.cost.worstTotal, o.limits.maxCredits], [86, 86, 94, 94]);
  assert.equal(o.title, 'Paow · Ankare 1 → 2.1 · Kling 4', 'another model than the step\'s own is said in the title');
  assert.deepEqual(o.pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame', 'endFrame']);
  assert.equal(o.reference.status, 'INGEN');
  // None asked for: the step's own model, as before.
  const own = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'INGANG-2.1', takes: 1 } })).json.order;
  assert.deepEqual([own.generation.model, own.generation.params], ['wan3', { resolution: '1080p', duration: 4, ratio: 'adaptive', generateAudio: false }]);
  assert.equal(own.title, 'Paow · Ankare 1 → 2.1');
  // A deal from 2.1 with WAN 3 gets WAN's ratio and no sound.
  const deal = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', model: 'wan3' } })).json.order;
  assert.deepEqual(deal.generation.params, { resolution: '1080p', duration: 7, ratio: 'adaptive', generateAudio: false });
  for (const [body, why] of [
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 'nano-banana-pro' }, /kan inte göra Ankare 1 → 2\.1: välj wan3, kling-4\.$/],
    [{ dealer: 'paow', step: 'ANKARE-2.1', model: 'kling-3-4k' }, /kan inte göra/],
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 'gen-9' }, /kan inte göra/],
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 7 }, /kan inte göra/],
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 'kling-4', duration: 40 }, /3–30 s för Kling 4/],
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 'kling-4', resolution: '4k' }, /tar 720p, 1080p, inte 4k/],
  ] as const) {
    const refused = await call('POST', '/api/orders', { body });
    assert.equal(refused.status, 400, JSON.stringify(body));
    assert.match(refused.json.error, why);
  }
  assert.equal((await call('GET', '/api/orders')).json.orders.length, 3, 'nothing left of a refused draft');
});

test('one action per film: a return from the landing picture, a deal bara dit to it, and a reference film copied from the bank', async (t) => {
  const { root, call, files } = await lab(t);
  // Paow's anchor 2.1 and a landing picture for seat 4 hold; the bank has Pamela's approved deal to seat 4.
  const register = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8'));
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-nyp-ny').state = 'gäller';
  register.dealers.paow.entries.push({ id: 'paow-landning-p4', role: 'landning', name: 'Plats 4, landning', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const landing = await picture(3, 233, 48);
  await mkdir(path.join(root, 'assets/anchors/paow-landning-p4'), { recursive: true });
  await writeFile(path.join(root, 'assets/anchors/paow-landning-p4/anchor.png'), landing);
  const film = Buffer.from('a film of four seconds');
  await mkdir(path.join(root, 'assets/motions/pamela-p4-c1-plan-deal-02'), { recursive: true });
  await mkdir(path.join(root, 'motions'), { recursive: true });
  await writeFile(path.join(root, 'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4'), film);
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({ jobs: [{ id: 'pamela-p4-c1-plan-deal-02', from: 'READY', to: 'RELEASE(P4.C1)', duration: 4 }, { id: 'pamela-kort-01', from: 'READY', to: 'LAND(P4.C1)', duration: 2 }] }));
  await writeFile(path.join(root, 'motions/pamela-p4-c1-plan-deal-02.json'), JSON.stringify({ source: { frames: 120, fps: 30, sha256: sha(film) }, review: { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-11: Det ser bra ut.' } }));
  await writeFile(path.join(root, 'motions/pamela-kort-01.json'), JSON.stringify({ source: { frames: 60, fps: 30 } }));

  // The return: the landing picture first, anchor 2.1 last; WAN 3, 3 s, the short return text.
  const back = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1', takes: 1 } });
  assert.equal(back.status, 201);
  const r = back.json.order;
  assert.deepEqual([r.step.edge, r.step.shape, r.step.cutInto, r.generation.model, r.generation.params.duration, r.cost.total], ['P4.C1>READY', 'ONE_WAY', ['P4.C1>READY'], 'wan3', 3, 60]);
  assert.deepEqual(r.pictures.map((p: { name: string; label: string; from: { entry: string } }) => [p.name, p.label, p.from.entry]), [['first.png', 'Första bild · Paows landning på plats 4', 'paow-landning-p4'], ['last.png', 'Sista bild · Paows ankare 2.1', 'paow-nyp-ny']]);
  assert.equal(r.pictures[0].sha256, sha(landing));
  assert.deepEqual([r.motion.turn, r.motion.side], [false, 'FRONT']);
  assert.match(r.prompt.text, /^Locked camera, one continuous shot\. Her fingertips lift off the blue card, which stays where it lies\. Her open hand glides back low over the felt, palm down, to the shoe/);
  assert.equal(back.json.shown, 'KLAR_ATT_TRYCKA');
  assert.equal(back.json.refresh, null);

  // Bara dit: anchor 2.1 first, the landing picture last (not drawn); the deal alone.
  const dit = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY', model: 'wan3', takes: 1 } })).json.order;
  assert.deepEqual([dit.step.shape, dit.step.cutInto, dit.title], ['ONE_WAY', ['READY>P4.C1'], 'Paow · Nyp, ett kort till platsen och tillbaka · plats 4 · bara dit · WAN 3']);
  assert.deepEqual(dit.pictures.map((p: { name: string; sha256: string }) => [p.name, p.sha256]), [['first.png', sha(files['paow-nyp-ny'])], ['last.png', sha(landing)]]);
  assert.match(dit.prompt.text, /Her hand ends at the card, as in the last frame\./);
  assert.match(dit.summary, /filmen slutar med handen vid kortet \(bara dit\)/);

  // A reference film: only for a model that takes one; copied with its hash; another dealer's film is named.
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', model: 'wan3', reference: 'pamela-p4-c1-plan-deal-02' } })).json.error, /WAN 3 tar ingen referensfilm/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY', reference: 'pamela-kort-01' } })).json.error, /Referensfilmen är 2 s; Kling 4 tar 3–30 s/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY', reference: 'nobody' } })).json.error, /nobody finns inte bland bankens tagningar/);
  const withRef = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY', reference: 'pamela-p4-c1-plan-deal-02', takes: 1 } });
  assert.equal(withRef.status, 201);
  const f = withRef.json.order;
  assert.deepEqual([f.reference.status, f.reference.clips, f.reference.path, f.reference.sha256, f.reference.seconds, f.reference.dealer, f.reference.approvedStraight, f.reference.from.verdict, f.reference.from.words], ['FINNS', ['pamela-p4-c1-plan-deal-02'], `assets/orders/${f.id}/reference.mp4`, sha(film), 4, 'pamela', true, 'GODKÄND', 'Det ser bra ut.']);
  assert.equal((await call('GET', `/${f.reference.path}`)).bytes!.equals(film), true, 'the film is copied byte for byte');
  assert.match(f.prompt.text, /Video 1 shows only the movement: she moves like the dealer in video 1, with the same timing\./);
  assert.equal(f.cost.perTake, 150, 'the price table\'s Kling 4 price is the price with a reference');
  assert.deepEqual(withRef.json.problems, [], 'another dealer\'s film is allowed as a reference');
  // A changed film in the bank is not copied.
  await writeFile(path.join(root, 'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4'), 'another film');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY', reference: 'pamela-p4-c1-plan-deal-02' } })).status, 409);
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

test("anchor 2.2's pose: the other dealer's forearm and hand on the dealer's own shoe, moved by the cards; it follows her anchor", async (t) => {
  const { root } = await lab(t);
  const { W, H } = await import('./order-images.ts');
  const fill = (rgb: Buffer, x0: number, y0: number, x1: number, y1: number, c: number[]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rgb.set(c, (y * W + x) * 3); };
  const png = (rgb: Buffer) => sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  // Pamela's picture: a black shoe, a yellow card on it, her sleeve and a hand whose fingertips lie over the card's top.
  const source = Buffer.alloc(W * H * 3);
  fill(source, 0, 0, W - 1, H - 1, [10, 230, 60]); fill(source, 1180, 780, 1500, 900, [40, 40, 40]); fill(source, 1200, 820, 1270, 880, [248, 220, 0]);
  fill(source, 1220, 620, 1300, 744, [15, 15, 15]); fill(source, 1210, 745, 1260, 840, [230, 150, 120]);
  // Paow's two anchors 1: her shoe, her card at two places, her body.
  const anchor = (card: [number, number, number, number]) => { const rgb = Buffer.alloc(W * H * 3); fill(rgb, 0, 0, W - 1, H - 1, [0, 238, 45]); fill(rgb, 1180, 780, 1500, 900, [40, 40, 40]); fill(rgb, ...card, [248, 220, 0]); fill(rgb, 600, 300, 1000, 830, [30, 30, 30]); return rgb; };
  const [a, b] = [await png(anchor([1260, 760, 1320, 830])), await png(anchor([1250, 770, 1310, 840]))];
  await writeFile(path.join(root, 'assets/anchors/pamela-nyp/anchor.png'), await png(source));
  await writeFile(path.join(root, 'assets/anchors/paow-vila-ung-2/anchor.png'), a);
  await writeFile(path.join(root, 'assets/anchors/paow-vila-ung-1/anchor.png'), b);
  const lay = { sleeve: SLEEVE_AT_SHOE, shoe: SHOE_AT_ANCHOR };
  const store = orderStore(root, { now: () => new Date('2026-11-13T09:00:00Z'), poses: { 'ANKARE-2.2': { entry: 'pamela-nyp', label: 'armen och handen ur Pamelas nyp, lagda på dealerns egen sko ur ankaret', keep: ARM_ALONE, what: POSE_ARM_WHAT, lay } } });
  const states = async (s: Record<string, string>) => {
    const file = path.join(root, 'data/media-roles.json'), reg = JSON.parse(await readFile(file, 'utf8'));
    for (const e of reg.dealers.paow.entries) if (s[e.id]) e.state = s[e.id];
    await writeFile(file, JSON.stringify(reg, null, 2));
  };
  const poseOf = (o: { pictures: { name: string }[] }) => o.pictures.find((p) => p.name === 'pose-figure.png') as import('../src/order-model.ts').Picture;
  const pixel = async (rel: string, x: number, y: number) => { const raw = await sharp(path.join(root, rel)).removeAlpha().raw().toBuffer(); return [...raw.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)]; };

  // While her anchor 1 waits: the arm alone, not moved, nothing matched.
  const made = await store.create({ dealer: 'paow', step: 'ANKARE-2.2' });
  let pose = poseOf(made.order);
  assert.deepEqual([pose.cut!.laid!.by, pose.cut!.matched, pose.cut!.what], [null, null, POSE_ARM_WHAT]);
  assert.match(pose.from!.note!, /lagda på dealerns egen sko ur ankaret; allt annat av henne är bortklippt, hennes sko och kort också$/);
  assert.deepEqual(await pixel(pose.path!, 1235, 870), [10, 230, 60], 'her card is cut away');

  // Her anchor holds: the arm is laid on her own shoe, the fingertips on her card.
  await states({ 'paow-vila-ung-2': 'gäller' });
  let next = await store.refresh(made.order.id, made.revision);
  pose = poseOf(next.order);
  assert.deepEqual(pose.cut!.laid!.by, [55, -60]);
  assert.deepEqual(pose.cut!.laid!.cards!.anchor.top.map((p) => p[1]), [760, 760]);
  assert.deepEqual([pose.cut!.laid!.sleeve, pose.cut!.laid!.shoe, pose.cut!.keep], [SLEEVE_AT_SHOE, SHOE_AT_ANCHOR, ARM_ALONE]);
  assert.equal(pose.cut!.matched!.anchorSha256, sha(a));
  assert.equal(pose.cut!.settings.band, 2);
  assert.deepEqual(await pixel(pose.path!, 1290, 778), [230, 150, 120], 'a fingertip on her card');
  assert.deepEqual(await pixel(pose.path!, 1290, 790), [248, 220, 0], 'her card under it');
  assert.deepEqual(await pixel(pose.path!, 1235, 870), [40, 40, 40], 'her shoe where the other card lay');

  // Another anchor 1 approved in Material: the pose is laid again on it.
  await states({ 'paow-vila-ung-2': 'ersatt', 'paow-vila-ung-1': 'gäller' });
  next = await store.refresh(next.order.id, next.revision);
  pose = poseOf(next.order);
  assert.equal(next.order.pictures[0].from!.entry, 'paow-vila-ung-1');
  assert.deepEqual(pose.cut!.laid!.by, [45, -50]);
  assert.equal(pose.cut!.matched!.anchorSha256, sha(b));
  assert.deepEqual(await pixel(pose.path!, 1280, 788), [230, 150, 120]);
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

test('Jakob\'s click through the route is always his: a body saying otherwise is not read', async (t) => {
  const { call } = await lab(t);
  const made = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  const approved = await call('POST', `/api/orders/${made.order.id}/approve`, { match: made.revision, body: { by: 'huvudagent', mandate: 'x' } });
  assert.equal(approved.status, 200);
  assert.deepEqual([approved.json.order.approval.by, approved.json.order.approval.mandate], ['jakob', undefined]);
});

test('the steps a round needs: a deal to the hole card, its turn from rest and the way out; and the production list through the routes', async (t) => {
  const { root, call } = await lab(t);
  await copyFile('data/order-methods.json', path.join(root, 'data/order-methods.json'));
  // Her anchors are candidates here: every picture waits, and the text says the place from the plan.
  const hole = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'D.C2' } })).json;
  assert.equal(hole.order.id, 'paow-giv-2-1-d-c2-01');
  assert.deepEqual([hole.order.step.edge, hole.order.step.cutInto], ['READY>D.C2', ['READY>D.C2', 'D.C2>READY']]);
  assert.deepEqual([hole.order.motion.side, hole.order.motion.turn, hole.order.motion.flipAxis], ['BACK', false, null], 'it lands closed, as the plan says');
  assert.match(hole.order.title, /dealerns hålkort/);
  // Laid on the felt in front of the shoe and slid to its place (template 7: carried, round 6's closed takes tilted).
  assert.match(hole.order.prompt.text, /lays it flat on the felt in front of the shoe and slides it under her fingertips, flat and yellow side up, to its place close in front of her, in the middle of the picture, where the last frame shows it\. She stops it there and lifts her fingertips off it\./);
  const turn = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'HALKORT' } });
  assert.equal(turn.status, 201);
  const o = turn.json.order;
  assert.equal(o.id, 'paow-halkort-01');
  assert.deepEqual([o.step.edge, o.step.shape, o.step.cutInto, o.motion], ['IDLE>REVEAL(D.C2)', 'ONE_WAY', [], null]);
  assert.deepEqual(o.pictures.map((p: { name: string; goesAs: string; path: string | null; waits: { label: string } | null }) => [p.name, p.goesAs, p.path, p.waits?.label]), [['first.png', 'startFrame', null, 'ankare 1'], ['last.png', 'endFrame', null, 'ankare 1']]);
  assert.match(o.pictures[0].label, /hålkortet stängt$/);
  assert.match(o.pictures[1].label, /hålkortet öppet$/);
  assert.deepEqual([o.prompt.style, o.prompt.template, o.generation.model, o.generation.params.duration, o.cost.total], ['KORT', 'film-halkort-kort@7', 'wan3', 5, 200]);
  assert.match(o.prompt.text, /to the yellow card lying close in front of her, in the middle of the picture, where the last frame shows it\. There her thumb slides under/);
  assert.equal(turn.json.shown, 'VÄNTAR');
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'HALKORT', style: 'UTFÖRLIG' } })).json.error, /skrivs KORT eller MINIMAL/);
  const out = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'UTGANG' } })).json.order;
  assert.deepEqual([out.id, out.step.edge, out.pictures.map((p: { waits: { label: string } | null }) => p.waits?.label)], ['paow-utgang-01', 'READY>IDLE', ['ankare 2.1', 'ankare 1']]);
  assert.match(out.prompt.text, /^Locked camera, one continuous shot\. Her thumb and forefinger let the yellow card settle back into the shoe's window/);

  // The production list: read by anyone of the lab, drafts only from the lab's own origin, never an approval.
  const list = await call('GET', '/api/production?dealer=paow');
  assert.equal(list.status, 200);
  assert.equal(list.json.list.rows.length, 33);
  assert.deepEqual(list.json.list.rows.find((r: { edge: string }) => r.edge === 'IDLE>REVEAL(D.C2)').orders.map((x: { id: string }) => x.id), ['paow-halkort-01'], 'the draft is in flight for its step');
  assert.equal(list.json.list.rows.find((r: { edge: string }) => r.edge === 'IDLE>REVEAL(D.C2)').state, 'UTKAST');
  assert.equal((await call('GET', '/api/production?dealer=nobody')).status, 400);
  assert.equal((await call('POST', '/api/production/draft', { body: { dealer: 'paow' }, from: 'http://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/production/draft', { body: { dealer: 'paow', step: 'VILA' } })).status, 400, 'nothing but the dealer can be asked for');
  const drafted = await call('POST', '/api/production/draft', { body: { dealer: 'paow' } });
  assert.equal(drafted.status, 200);
  assert.deepEqual(drafted.json.made, [], 'her anchors are only candidates: nothing can be ordered with a method that holds');
  assert.equal((await call('GET', '/api/orders')).json.orders.filter((a: { order: { status: string } }) => a.order.status === 'GODKÄND').length, 0, 'nothing approved');
});
