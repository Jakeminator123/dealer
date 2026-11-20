// The routes of the view Beställ and of Jakob's verdict in Material (tools/order-routes.ts), run against a temporary
// copy of the data on a real local server: drafts from a few choices, changes only with the revision read, approval only
// from the lab's own origin and within the policy, nothing changed after approval, files only from the order's folder,
// and kandidat → gäller with the other candidates replaced. Pictures are flat PNGs in the bank's size; no film is decoded.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, rmdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { orderRoutes } from './order-routes.ts';
import { defaultPlan } from '../src/placement-model.ts';
import { ARM_ALONE, ARM_AT_SHOE, POSE_ARM_WHAT, POSE_WHAT, SHOE_AT_ANCHOR, SLEEVE_AT_SHOE, orderStore, orderHash } from './order-store.ts';
import { orderPrompt, promptFor } from '../src/order-prompts.ts';
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

/** A deal as it was ordered before the recipe: tur och retur, no reference film (a deliberate exception now, said outright). */
const TUR = { shape: 'ROUND_TRIP', reference: null, duration: 7 } as const;
const TUR_WAN = { shape: 'ROUND_TRIP', reference: null, model: 'wan3', duration: 6, takes: 2 } as const;

type SaveTransport = { dropNext: boolean; dropped: number; revisions: (string | undefined)[] };

async function lab(t: { after(fn: () => Promise<void> | void): void }, transport?: SaveTransport) {
  const root = await mkdtemp(path.join(base, 'order-routes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'placements']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['data/order-policy.json', 'data/dealers.json', 'data/order-methods.json']) await copyFile(file, path.join(root, file));
  // Route tests have a fixed historical clock; their mandate belongs to that fixture, not today's live session.
  const policyFile = path.join(root, 'data/order-policy.json');
  const policy = JSON.parse(await readFile(policyFile, 'utf8'));
  policy.mandate = {id: 'test-route-mandate', startsAt: '2026-11-12T00:00:00Z', endsAt: '2026-11-13T00:00:00Z', rollingHourCredits: 800, totalCredits: 2500};
  await writeFile(policyFile, JSON.stringify(policy));
  // A declared fixture, independent of Jakob's saved or newly committed hand choices.
  const fixturePlan = defaultPlan();
  Object.assign(fixturePlan.targets['P4.C2'].intent, {endSide: 'FRONT', turn: true}); // both player cards are open in these route tests
  await writeFile(path.join(root, 'placements/default.json'), JSON.stringify(fixturePlan));
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
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', origin);
    if (transport && req.method === 'POST' && url.pathname === '/api/orders') {
      transport.revisions.push(req.headers['if-match']);
      const end = res.end;
      res.end = (...args: unknown[]) => {
        if (transport.dropNext && res.statusCode === 201) {
          transport.dropNext = false;
          transport.dropped++;
          // The route has persisted the draft and prepared the response. Lose it before clients receive any bytes.
          res.destroy();
          return res;
        }
        return Reflect.apply(end, res, args);
      };
    }
    if (!(await handle.fn!(req, res, url))) res.writeHead(404).end('not mine');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // A frame out of a film, for a cut frame as last picture: the test's films are not films, so a test sets what a frame is.
  const frames = { of: null as null | ((source: { path: string; frame?: number }) => Promise<Buffer>) };
  handle.fn = orderRoutes({ root, origin, now: () => new Date('2026-11-12T21:00:00Z'), poses, frame: (source) => (frames.of ? frames.of(source) : Promise.reject(new Error('no film'))) });
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const request = async (method: string, address: string, options: { body?: unknown; match?: string; from?: string | null } = {}) => {
    const headers: Record<string, string> = {};
    if (options.from !== null) headers.origin = options.from ?? origin;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.match) headers['if-match'] = options.match;
    const response = await fetch(origin + address, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const type = response.headers.get('content-type') ?? '';
    return { status: response.status, cache: response.headers.get('cache-control'), json: type.includes('json') ? await response.json() : null, bytes: type.includes('json') ? null : Buffer.from(await response.arrayBuffer()) };
  };
  async function call(method: string, address: string, options: Parameters<typeof request>[2] = {}) {
    if (method === 'POST' && address === '/api/orders') {
      const preview = await request(method, '/api/orders/preview', options);
      if (preview.status !== 200) return preview;
      return request(method, address, { ...options, match: preview.json.revision });
    }
    return request(method, address, options);
  }
  return { root, origin, call, request, files, frames };
}

test('a stale studio or preview cannot write anything, and the current preview is stored byte for byte', async (t) => {
  const { root, request } = await lab(t);
  const input = [{ dealer: 'paow', step: 'INGANG-2.1' }, { dealer: 'paow', step: 'VILA' }];
  const reg = register();
  reg.dealers.paow.entries[0].state = 'gäller';
  reg.dealers.paow.entries[3].state = 'gäller';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(reg));
  const prepared = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(prepared.status, 200);
  assert.equal(prepared.json.orders[0].takes, 2);
  assert.match(prepared.json.revision, /^"[a-f0-9]{64}"$/);
  assert.equal(existsSync(path.join(root, 'assets/orders')), false);
  const stale = await request('POST', '/api/orders', { body: input[0] });
  assert.equal(stale.status, 428);
  assert.match(stale.json.error, /Ladda om studion/);

  const file = path.join(root, 'data/order-methods.json');
  const methods = JSON.parse(await readFile(file, 'utf8'));
  methods.methods.find((m: { step: string }) => m.step === 'INGANG-2.1').takes = 3;
  await writeFile(file, JSON.stringify(methods));
  const conflict = await request('POST', '/api/orders', { body: input, match: prepared.json.revision });
  assert.equal(conflict.status, 409);
  assert.match(conflict.json.error, /har ändrats/);
  assert.equal(existsSync(path.join(root, 'data/orders')), false);

  const current = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(current.status, 200);
  assert.equal(current.json.orders[0].takes, 3);
  assert.notEqual(current.json.revision, prepared.json.revision);
  const previousImage = await request('GET', '/' + current.json.orders[0].pictures[1].path);
  assert.equal(previousImage.status, 200);
  const changed = await picture(0, 232, 42);
  await writeFile(path.join(root, 'assets/anchors/paow-nyp-ny/anchor.png'), changed);
  const staleMedia = await request('POST', '/api/orders', { body: input, match: current.json.revision });
  assert.equal(staleMedia.status, 409);
  assert.equal(existsSync(path.join(root, 'assets/orders')), false);
  assert.deepEqual((await request('GET', '/' + current.json.orders[0].pictures[1].path)).bytes, previousImage.bytes);

  const latest = await request('POST', '/api/orders/preview', { body: input });
  const pictured: Buffer[][] = [];
  for (const order of latest.json.orders) {
    const images: Buffer[] = [];
    for (const pic of order.pictures) {
      const wire = await request('GET', '/' + pic.path);
      assert.equal(wire.status, 200);
      images.push(wire.bytes!);
    }
    pictured.push(images);
  }
  const saved = await request('POST', '/api/orders', { body: input, match: latest.json.revision });
  assert.equal(saved.status, 201);
  assert.equal(saved.json.made.length, 2);
  for (const [i, id] of saved.json.made.entries()) {
    const shown = latest.json.orders[i];
    const { order } = (await request('GET', '/api/orders/' + id)).json;
    assert.deepEqual([shown.generation, shown.prompt, shown.takes, shown.cost, shown.reference], [order.generation, order.prompt, order.takes, order.cost, order.reference]);
    for (const [index, pic] of shown.pictures.entries()) {
      const final = await readFile(path.join(root, order.pictures[index].path));
      assert.deepEqual(pictured[i][index], final);
      assert.equal(pic.sha256, sha(final));
    }
  }
});

test('retrying a successful save returns the same order IDs without writing more drafts', async (t) => {
  const { root, request } = await lab(t);
  const film = { dealer: 'pamela', step: 'VILA' };
  for (const input of [film, [film, { ...film, takes: 2 }]]) {
    const shown = await request('POST', '/api/orders/preview', { body: input });
    assert.equal(shown.status, 200);
    const image = '/' + shown.json.orders[0].pictures[0].path;
    assert.equal((await request('GET', image)).status, 200);

    const options = { body: input, match: shown.json.revision };
    const first = await request('POST', '/api/orders', options);
    assert.equal(first.status, 201);
    const files = (await readdir(path.join(root, 'data/orders'))).sort();
    const folders = (await readdir(path.join(root, 'assets/orders'))).sort();

    const retry = await request('POST', '/api/orders', options);
    assert.equal(retry.status, 201);
    assert.deepEqual(retry.json.made, first.json.made);
    assert.deepEqual((await readdir(path.join(root, 'data/orders'))).sort(), files);
    assert.deepEqual((await readdir(path.join(root, 'assets/orders'))).sort(), folders);
    assert.equal((await request('POST', '/api/orders', { ...options, body: { ...film, takes: 5 } })).status, 409);

    const released = await request('GET', image);
    assert.equal(released.status, 404);
    assert.equal(released.cache, 'no-store');
  }
});

test('after a saved draft loses its HTTP response the studio retries the same save', async (t) => {
  const transport: SaveTransport = {dropNext: true, dropped: 0, revisions: []};
  const { root, origin } = await lab(t, transport);
  const originalFetch = globalThis.fetch;
  const previousMode = process.env.NEXT_PUBLIC_DEALER_MODE;
  t.after(() => {
    t.mock.restoreAll();
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_DEALER_MODE;
    else process.env.NEXT_PUBLIC_DEALER_MODE = previousMode;
  });
  process.env.NEXT_PUBLIC_DEALER_MODE = 'lab';
  const { createOrder, orderSaveFailure, previewOrder } = await import('../studio/lib/orders.ts');
  t.mock.method(globalThis, 'fetch', (address: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('origin', origin);
    return originalFetch(new URL(address, origin), { ...init, headers });
  });

  const input = { dealer: 'pamela', step: 'VILA' } as const;
  const preview = await previewOrder(input);
  const save = () => createOrder(input, preview.revision);
  await assert.rejects(save, (error: unknown) => {
    assert.equal(orderSaveFailure(error).retrySave, true);
    return true;
  });
  assert.equal(transport.dropped, 1);
  const directory = path.join(root, 'data/orders');
  const files = await readdir(directory);
  assert.equal(files.length, 1, 'the first POST has already written a draft');
  const persisted = JSON.parse(await readFile(path.join(directory, files[0]), 'utf8'));
  const retry = await save();
  assert.deepEqual(transport.revisions, [preview.revision, preview.revision]);
  assert.deepEqual(retry.made, [persisted.id]);
  assert.equal(retry.order.id, persisted.id);
  assert.deepEqual(await readdir(directory), files);
  assert.deepEqual(await readdir(path.join(root, 'assets/orders')), [persisted.id]);
});

test('an evicted preview cannot be saved or served, and a new preview can be saved', async (t) => {
  const { root, request } = await lab(t);
  const input = { dealer: 'pamela', step: 'VILA' };
  const shown = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(shown.status, 200);
  const media = '/' + shown.json.orders[0].pictures[0].path;
  assert.equal((await request('GET', media)).status, 200);
  assert.equal((await request('POST', '/api/orders', { body: { ...input, takes: 3 }, match: shown.json.revision })).status, 409);
  for (let i = 0; i < 16; i++) {
    assert.equal((await request('POST', '/api/orders/preview', { body: input })).status, 200);
  }
  const gone = await request('GET', media);
  assert.equal(gone.status, 404);
  assert.equal(gone.cache, 'no-store');
  const refused = await request('POST', '/api/orders', { body: input, match: shown.json.revision });
  assert.equal(refused.status, 409);
  assert.match(refused.json.error, /Förhandsvisningen finns inte kvar/);
  assert.equal(existsSync(path.join(root, 'assets/orders')), false);
  assert.equal(existsSync(path.join(root, 'data/orders')), false);

  const current = await request('POST', '/api/orders/preview', { body: input });
  assert.notEqual(current.json.revision, shown.json.revision);
  const made = await request('POST', '/api/orders', { body: input, match: current.json.revision });
  assert.equal(made.status, 201);
});

test('drafts, changes and approval go through the routes with their guards', async (t) => {
  const { root, call, files } = await lab(t);
  assert.equal((await call('GET', '/api/orders')).json.orders.length, 0);
  assert.equal((await call('GET', '/api/other')).status, 404, 'other addresses are left to the server');

  const still = { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2', takes: 2 };
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
  assert.equal(a.order.summary, 'Gör Paows ankare 2.1 ur hennes ankare 1.', 'what it makes and from what, never how she moves');
  assert.equal(a.order.cost.total, 80);
  assert.deepEqual(a.order.notes, ['Recept ankare-2.1 (prov) ur data/order-methods.json.', 'Undantag från receptet: 2 tagningar i stället för 1.'], 'the recipe it follows, and where it departs from it');

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
  assert.equal(changed.json.order.prompt.template, 'bild-ankare-kort@12');

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
  const film = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', ...TUR, duration: 4 } })).json;
  assert.equal(film.shown, 'VÄNTAR');
  assert.deepEqual(film.waiting.map((w: { label: string; ready: boolean }) => [w.label, w.ready]), [['ankare 2.1', false], ['ankare 2.1', false]]);
  assert.equal(film.order.step.edge, 'READY>P4.C1');
  assert.equal(film.order.pictures[1].path, null, 'the last picture waits; no other dealer stands in');
  assert.deepEqual([film.order.prompt.style, film.order.prompt.template], ['KORT', 'film-giv-kort@12'], 'a new film is written in the short text');
  assert.match(film.order.prompt.text, /towards its place in the middle of the picture, where the last frame shows it/, 'the place from the plan before the last picture exists');
  // The long text (template 3) is never written for a new order: its words go against today's rules (Jakob 2026-11-17).
  const before = (await call('GET', '/api/orders')).json.orders.length;
  for (const step of ['GIV-2.1', 'VILA', 'INGANG-2.1', 'RETUR-2.1', 'ANKARE-2.1']) {
    const long = await call('POST', '/api/orders', { body: { dealer: 'paow', step, target: 'P4.C1', style: 'UTFÖRLIG' } });
    assert.equal(long.status, 400, `${step}: no new order in the long text`);
    assert.match(long.json.error, step === 'ANKARE-2.1' ? /^En bild skrivs KORT\.$/ : /KORT eller MINIMAL; den långa texten \(UTFÖRLIG\) skrivs inte längre/);
  }
  assert.equal((await call('GET', '/api/orders')).json.orders.length, before, 'nothing was written');
  const waiting = await call('POST', `/api/orders/${film.order.id}/approve`, { match: film.revision });
  assert.equal(waiting.status, 409);
  assert.match(waiting.json.error, /Väntar på ankare 2\.1/);
  const noLanding = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1' } });
  assert.equal(noLanding.status, 400, 'a return needs a landing picture that holds');
  assert.match(noLanding.json.error, /Ingen landningsbild gäller för Paows plats 4\. En retur som egen film börjar på den/);
  // A deal is bara dit by its recipe and ends on the seat's own end picture; here seat 4 has neither a landing picture nor a film of its own.
  for (const body of [{ dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' }, { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY' }]) {
    const none = await call('POST', '/api/orders', { body });
    assert.equal(none.status, 400);
    assert.match(none.json.error, /^Plats 4 har ingen slutbild för Paows giv från ankare 2\.1: ingen landningsbild gäller för platsen, och banken har ingen egen film dit vars retur du har godkänt rakt\./);
  }
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', style: 'MINIMAL' } })).json.error, /^En bild skrivs KORT\.$/);
  // The free addition: up to the limit it is kept whole; beyond it a new draft is refused as a change is, never cut.
  const words = (n: number) => 'She smiles. '.repeat(60).slice(0, n - 1).trimEnd().padEnd(n - 1, 'x') + '.';
  const full = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'VILA', extra: words(600) } });
  assert.equal(full.status, 201);
  assert.equal(full.json.order.prompt.extra, words(600), 'six hundred characters are kept whole');
  assert.ok(full.json.order.prompt.text.endsWith(words(600)));
  const over = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'VILA', extra: words(601) } });
  assert.equal(over.status, 400, 'one more is refused, not cut');
  assert.equal(over.json.error, 'Tillägget får vara högst 600 tecken (det här har 601).');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'VILA', extra: 7 } })).status, 400, 'an addition is text');
  assert.equal((await call('PUT', `/api/orders/${full.json.order.id}`, { body: { extra: words(601) }, match: full.json.revision })).status, 400, 'as a change is');
  // Only a dealer of data/dealers.json can be ordered for; the register may hold others (a separate track).
  const unknown = await call('POST', '/api/orders', { body: { dealer: 'petra', step: 'VILA' } });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.error, 'petra finns inte i data/dealers.json, så inget kan beställas för henne här.');
});

test('Material: a picture made to hold replaces the others of its place; any can be set aside, archived and taken back, against the revision', async (t) => {
  const { root, call } = await lab(t);
  const revision = async () => (await mediaRoles(root).answer()).revision!;
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' } })).status, 428);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' }, match: await revision(), from: 'http://evil.example' })).status, 403);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'okänd' }, match: await revision() })).status, 400);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'kandidat' }, match: await revision() })).status, 409, 'a candidate is one already');
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
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' }, match: ok.json.revision })).status, 409);
  assert.equal((await call('PUT', '/api/media/paow-vila-kort/state', { body: { state: 'ersatt' }, match: '"old"' })).status, 409);
  assert.equal((await call('PUT', '/api/media/paow-vila-kort/state', { body: { state: 'ersatt' }, match: ok.json.revision })).status, 200);
  assert.equal((await call('PUT', '/api/media/nobody/state', { body: { state: 'ersatt' }, match: await revision() })).status, 404);
  // By hand (2026-11-18): one set aside before can hold again; archived pictures leave the lists and come back as candidates.
  const back = await call('PUT', '/api/media/paow-vila-ung-1/state', { body: { state: 'gäller' }, match: await revision() });
  assert.equal(back.status, 200, 'ersatt can hold again');
  assert.deepEqual(back.json.replaced, [{ id: 'paow-vila-ung-2', name: 'Vila, kandidat 2' }]);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'arkiverad' }, match: back.json.revision })).status, 200);
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'gäller' }, match: await revision() })).status, 409, 'an archived picture comes back first');
  assert.equal((await call('PUT', '/api/media/paow-vila-ung-2/state', { body: { state: 'kandidat' }, match: await revision() })).status, 200);
  const end = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8')).dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-vila-ung-2');
  assert.equal(end.state, 'kandidat');
  assert.match(end.stateBy, /^Jakob \d{4}-\d\d-\d\d \d\d:\d\d: arkiverad → kandidat \(Material\)$/);
  assert.equal(allowed('gäller', 'ersatt') && allowed('ersatt', 'gäller') && allowed(undefined, 'gäller') && !allowed('arkiverad', 'gäller'), true);
  assert.equal(isDecidable({ role: 'ankare-1', path: 'assets/x/source.mp4', frame: 3 }), true);
  assert.equal(replacedBy([{ id: 'a', role: 'ankare-1', state: 'kandidat' }, { id: 'b', role: 'ankare-1', state: 'kandidat' }, { id: 'c', role: 'ankare-1', state: 'gäller' }], { id: 'a', role: 'ankare-1', state: 'kandidat' }).map((e) => e.id).join(), 'b,c', 'the one that held gives way too: one picture holds per role');
  const keystones = [{ id: 'paow-staende', role: 'keystone', name: 'Stående A', state: 'gäller' }, { id: 'paow-sittande', role: 'keystone', name: 'Sittande A', state: 'gäller' }, { id: 'paow-staende-tatuerad', role: 'keystone', name: 'Stående, tatuerade händer', state: 'kandidat' }, { id: 'paow-sittande-tatuerad', role: 'keystone', name: 'Sittande, tatuerade händer', state: 'kandidat' }] as const;
  assert.equal(replacedBy(keystones, keystones[3]).map((e) => e.id).join(), 'paow-sittande', 'a keystone gives way only to one of its own posture: the standing ones are left alone');
  assert.equal(replacedBy(keystones, keystones[2]).map((e) => e.id).join(), 'paow-staende');
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
  const one = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P1.C1', ...TUR_WAN } })).json;
  const m = one.order.motion;
  // The hand and the side from the plan; the turn from the recipe (a drag turns close to its place, handbook §5).
  assert.deepEqual([m.hand, m.pass, m.side, m.turn, m.fromPlan, m.flipAxis], ['LH', false, 'FRONT', true, true, 'AT_PLACE']);
  assert.match(one.order.notes.join(' '), /Undantag från receptet: modell WAN 3 i stället för Kling 4; tur och retur i stället för bara dit; ingen referensfilm fast receptet vill ha en; 6 s i stället för 3 s; 2 tagningar i stället för 1\./, 'every exception is named in the draft');
  assert.equal(one.order.title, 'Paow · Släp, ett kort till platsen · plats 1 · tur och retur · WAN 3', 'the title says the exception, and no deal is named "och tillbaka" any more');
  const sheet = promptFor({ dealer: list.dealers[1], step: 'GIV-2.2', model: 'wan3', motion: m, place: { x: seats['P1.C1'].centre[0], y: seats['P1.C1'].centre[1] }, style: 'KORT' });
  assert.equal(one.order.prompt.text, sheet.text, 'the sheet shows exactly what is stored');
  // From anchor 2.1 the recipe turns the card on the way.
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', ...TUR } })).json.order.motion.flipAxis, 'FREE', 'the turn is the recipe\'s');
  // What Placering said is kept with the deal: the plan pinches at P1, the step drags (Beställ says so in a line).
  assert.deepEqual(m.planned, { grip: 'PINCH', flipAxis: 'FREE' });
  assert.deepEqual([seats['P4.C1'].grip, seats['P4.C1'].turnAt, seats['P4.C1'].flipAxis], ['PINCH', 'AIR', 'FREE']);


  // Closed, with handbyte; then changed on the draft.
  const closed = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P2.C1', side: 'BACK', pass: true, ...TUR_WAN } })).json;
  const c = closed.order.motion;
  assert.deepEqual([c.hand, c.pass, c.side, c.turn, c.fromPlan, c.flipAxis], ['LH', true, 'BACK', false, false, null], 'a card that is not turned stores no turn');
  assert.equal(closed.order.pictures[1].label, 'Sista bild · samma + kortet stängt på plats 2');
  assert.match(closed.order.prompt.text, /where her other hand takes it by its edges/);
  assert.equal(closed.order.summary, 'Gör en film av Paow: ett kort från ankare 2.2 till plats 2, tur och retur.', 'the line says what the film goes between; the hands are said by the text that is sent');
  const changed = (await call('PUT', `/api/orders/${closed.order.id}`, { body: { hand: 'RH', side: 'FRONT' }, match: closed.revision })).json;
  const d = changed.order.motion;
  assert.deepEqual([d.hand, d.pass, d.side, d.turn, d.flipAxis], ['RH', false, 'FRONT', true, 'FREE'], 'opened again: the turn the plan suggests');
  assert.equal(changed.order.summary, 'Gör en film av Paow: ett kort från ankare 2.2 till plats 2, tur och retur.');
  assert.match(changed.order.prompt.text, /Her hand at the shoe lets go of the card and waits beside the shoe, and her other hand reaches across/);
  assert.equal(changed.order.pictures[1].label, 'Sista bild · samma + kortet öppet på plats 2');
  assert.equal((await call('PUT', `/api/orders/${closed.order.id}`, { body: { pass: true, hand: 'RH' }, match: changed.revision })).status, 400, 'handbyte goes from left to right');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P2.C1', hand: 'RH', pass: true, ...TUR_WAN } })).status, 400);

  // Alla sju: one draft per seat, a group, handbyte only where the left hand would cross her body.
  const all = ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1'].map((target) => ({ target, hand: 'LH', pass: seats[target].crosses }));
  const group = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: all, ...TUR_WAN, flipAxis: 'FREE' } });
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
    assert.equal(a.order.prompt.text, promptFor({ dealer: list.dealers[1], step: 'GIV-2.2', model: 'wan3', motion: a.order.motion as never, place: { x: s.centre[0], y: s.centre[1] }, style: 'KORT' }).text, `${a.order.motion.target}: its own text`);
  }
  assert.match(orders[0].order.prompt.text, /at the far left of the picture/);
  assert.match(orders[6].order.prompt.text, /at the far right of the picture/);
  assert.equal(orders.reduce((sum, a) => sum + a.order.cost.total, 0), 1680);
  // All or nothing.
  const before = (await call('GET', '/api/orders')).json.orders.length;
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: [{ target: 'P1.C1' }, { target: 'P2.C1', hand: 'RH', pass: true }] } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', seats: [{ target: 'P1.C1' }, { target: 'P1.C1' }] } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', seats: [{ target: 'P1.C1' }, { target: 'P2.C1' }] } })).status, 400);
  assert.equal((await call('GET', '/api/orders')).json.orders.length, before, 'nothing left of a group that could not be made');
});

test("the turn is the recipe's, the plan's where the recipe leaves it to Placering; what Placering said stays with the draft, and a choice of its own stays its own", async (t) => {
  const { root, call } = await lab(t);
  // the plan (the test's own copy) turns P5's card like a key, P6's at its place, and drags at P6; the dealer's first card like a key
  const file = path.join(root, 'placements/default.json');
  const plan = JSON.parse(await readFile(file, 'utf8'));
  Object.assign(plan.targets['P5.C1'].intent, { flipAxis: 'LONG_EDGE' });
  Object.assign(plan.targets['P6.C1'].intent, { grip: 'DRAG', turnAt: 'PLACE', flipAxis: 'LONG_EDGE' });
  Object.assign(plan.targets['D.C1'].intent, { flipAxis: 'LONG_EDGE' });
  await writeFile(file, JSON.stringify(plan, null, 2) + '\n');
  const seats = (await call('GET', '/api/orders')).json.plan.seats;
  assert.deepEqual([seats['P5.C1'].flipAxis, seats['P6.C1'].grip, seats['P6.C1'].turnAt], ['LONG_EDGE', 'DRAG', 'PLACE']);
  // A deal from 2.1 to a player's seat: the recipe turns it on the way (FREE), whatever the plan says; the plan's word is kept beside it.
  const made = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P5.C1', ...TUR } })).json;
  const key = made.order;
  assert.deepEqual([key.motion.flipAxis, key.motion.planned], ['FREE', { grip: 'PINCH', flipAxis: 'LONG_EDGE' }]);
  const place = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P6.C1', ...TUR } })).json.order;
  assert.deepEqual([place.motion.grip, place.motion.flipAxis, place.motion.planned], ['PINCH', 'FREE', { grip: 'DRAG', flipAxis: 'AT_PLACE' }], 'the step pinches; the plan said drag and a turn at the place, and that stays said');
  // The dealer's own cards: the recipe leaves the turn to Placering.
  const own = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'D.C1', ...TUR } })).json.order;
  assert.deepEqual([own.motion.flipAxis, own.motion.planned.flipAxis], ['LONG_EDGE', 'LONG_EDGE']);
  // a turn chosen for the draft is the draft's own, named as an exception; the plan's word stays with it
  const chosen = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P5.C1', ...TUR, flipAxis: 'AT_PLACE' } })).json.order;
  assert.deepEqual([chosen.motion.flipAxis, chosen.motion.planned.flipAxis], ['AT_PLACE', 'LONG_EDGE']);
  assert.match(chosen.notes.join(' '), /vändningen AT_PLACE i stället för FREE/);
  // a later change of the plan does not move a draft's turn
  Object.assign(plan.targets['P5.C1'].intent, { flipAxis: 'FREE' });
  await writeFile(file, JSON.stringify(plan, null, 2) + '\n');
  const again = (await call('PUT', `/api/orders/${key.id}`, { body: { hand: 'RH' }, match: made.revision })).json.order;
  assert.deepEqual([again.motion.hand, again.motion.flipAxis, again.motion.planned.flipAxis], ['RH', 'FREE', 'LONG_EDGE']);
});

test('the KORT two-hand deal keeps its short-end turn even if the plan starts face-up', async (t) => {
  const { root, call, request } = await lab(t);
  const planFile = path.join(root, 'placements/default.json');
  const plan = JSON.parse(await readFile(planFile, 'utf8'));
  Object.assign(plan.targets['P4.C1'].intent, { startSide: 'FRONT', endSide: 'FRONT', turn: false, turnAt: 'AIR', flipAxis: 'LONG_EDGE' });
  await writeFile(planFile, JSON.stringify(plan));

  const methodFile = path.join(root, 'data/order-methods.json');
  const methods = JSON.parse(await readFile(methodFile, 'utf8'));
  const method = methods.methods.find((entry: { step: string }) => entry.step === 'GIV-2.3');
  method.turn = null;
  await writeFile(methodFile, JSON.stringify(methods));

  const input = { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', ...TUR };
  for (const flipAxis of ['LONG_EDGE', 'AT_PLACE']) {
    const rejected = await request('POST', '/api/orders/preview', { body: { ...input, flipAxis } });
    assert.equal(rejected.status, 400);
    assert.match(rejected.json.error, /vänder över kortänden.*Välj MINIMAL/);
  }
  method.turn = 'AT_PLACE';
  await writeFile(methodFile, JSON.stringify(methods));
  const badRecipe = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(badRecipe.status, 400);
  assert.match(badRecipe.json.error, /Recept giv-2\.3 anger AT_PLACE/);
  assert.equal(existsSync(path.join(root, 'data/orders')), false);

  method.turn = null;
  await writeFile(methodFile, JSON.stringify(methods));
  const closedPreview = await request('POST', '/api/orders/preview', { body: { ...input, side: 'BACK' } });
  assert.equal(closedPreview.status, 200, closedPreview.json.error);
  assert.deepEqual([closedPreview.json.orders[0].motion.turn, closedPreview.json.orders[0].motion.flipAxis], [false, null]);
  assert.doesNotMatch(closedPreview.json.orders[0].prompt.text, /end over end/);
  const preview = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(preview.status, 200, preview.json.error);
  const shown = preview.json.orders[0];
  assert.deepEqual([shown.prompt.style, shown.motion.turn, shown.motion.flipAxis, shown.motion.planned.flipAxis], ['KORT', true, 'FREE', 'LONG_EDGE']);
  assert.match(shown.prompt.text, /short end/);
  const saved = await request('POST', '/api/orders', { body: input, match: preview.json.revision });
  assert.equal(saved.status, 201);
  const { order, revision } = saved.json;
  assert.deepEqual([order.motion, order.prompt], [shown.motion, shown.prompt]);
  const orderFile = path.join(root, 'data/orders', `${order.id}.json`);
  const draftBefore = await readFile(orderFile);
  for (const flipAxis of ['LONG_EDGE', 'AT_PLACE']) {
    const rejected = await call('PUT', `/api/orders/${order.id}`, { body: { flipAxis }, match: revision });
    assert.equal(rejected.status, 400);
    assert.match(rejected.json.error, /vänder över kortänden/);
  }
  assert.deepEqual(await readFile(orderFile), draftBefore);

  const closed = await call('PUT', `/api/orders/${order.id}`, { body: { side: 'BACK' }, match: revision });
  assert.equal(closed.status, 200);
  assert.equal(closed.json.order.motion.flipAxis, null);
  const closedBefore = await readFile(orderFile);
  const forbiddenOpening = await call('PUT', `/api/orders/${order.id}`, { body: { side: 'FRONT', flipAxis: 'LONG_EDGE' }, match: closed.json.revision });
  assert.equal(forbiddenOpening.status, 400);
  assert.match(forbiddenOpening.json.error, /vänder över kortänden/);
  assert.deepEqual(await readFile(orderFile), closedBefore);
  const reopened = await call('PUT', `/api/orders/${order.id}`, { body: { side: 'FRONT' }, match: closed.json.revision });
  assert.equal(reopened.status, 200);
  assert.deepEqual([reopened.json.order.motion.flipAxis, reopened.json.order.motion.planned.flipAxis], ['FREE', 'LONG_EDGE']);
});

test('a legacy incompatible KORT two-hand deal cannot be revised or frozen until corrected', async (t) => {
  const { root, call } = await lab(t);
  const media = register();
  const ready = { id: 'paow-2-3', role: 'ankare-2.3', name: 'Ankare 2.3', path: 'assets/anchors/paow-vila-ung-2/anchor.png', node: 'READY-C', state: 'gäller' };
  const a3 = { id: 'paow-a3-p4', role: 'landning', name: 'A3 · P4', path: 'assets/anchors/paow-nyp-ny/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'kandidat' };
  media.dealers.paow.entries.push(ready, a3);
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(media));
  const input = { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', end: a3.id, side: 'FRONT', reference: null };

  for (const motion of [{ turn: true, flipAxis: 'LONG_EDGE' }, { turn: true, flipAxis: 'AT_PLACE' }, { turn: false, flipAxis: null }] as const) {
    const made = await call('POST', '/api/orders', { body: input });
    assert.equal(made.status, 201, made.json.error);
    const { order } = made.json;
    const address = `/api/orders/${order.id}`, file = path.join(root, 'data/orders', `${order.id}.json`);
    const legacy = { ...order, motion: { ...order.motion, ...motion, pass: false } };
    const before = JSON.stringify(legacy);
    await writeFile(file, before);
    const opened = await call('GET', address);
    assert.equal(opened.status, 200);
    const { revision } = opened.json;
    const match = motion.turn ? new RegExp(`Vald vändning är ${motion.flipAxis}.*vänder över kortänden`) : /Vändningen stämmer inte med sidan i slutbilden/;
    const refused = await call('POST', `${address}/approve`, { match: revision });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, match);
    assert.match(opened.json.problems.join(' '), match);
    for (const body of [{ duration: 4 }, { title: 'Ändrad titel' }, { extra: 'She looks down.' }]) {
      const change = await call('PUT', address, { match: revision, body });
      assert.equal(change.status, 400, JSON.stringify(body));
      assert.match(change.json.error, match);
    }
    const refresh = await call('POST', `${address}/refresh`, { match: revision });
    assert.equal(refresh.status, 400);
    assert.match(refresh.json.error, match);
    assert.equal(await readFile(file, 'utf8'), before);

    // Old axes can be corrected in place. The inconsistent turn needs a replacement from the new preparation path.
    if (!motion.turn) await writeFile(file, JSON.stringify(order));
    const corrected = motion.turn ? await call('PUT', address, { match: revision, body: { flipAxis: 'FREE' } }) : await call('GET', address);
    assert.equal(corrected.status, 200, corrected.json.error);
    const accepted = await call('POST', `${address}/approve`, { match: corrected.json.revision });
    assert.equal(accepted.status, 200, accepted.json.error);

    // A file frozen before the guard keeps its exact text, motion, and approval hash.
    const frozen = { ...legacy, status: 'GODKÄND', approval: { ...accepted.json.order.approval, orderSha256: orderHash(legacy) } };
    const frozenText = JSON.stringify(frozen);
    await writeFile(file, frozenText);
    const history = await call('GET', address);
    assert.equal(history.status, 200, history.json.error);
    assert.deepEqual(history.json.order, frozen);
    assert.deepEqual(history.json.problems, []);
    assert.equal(orderHash(history.json.order), frozen.approval.orderSha256);
    assert.equal((await call('PUT', address, { match: history.json.revision, body: { pass: true } })).status, 409);
    assert.equal(await readFile(file, 'utf8'), frozenText);
  }

  for (const hand of ['LH', 'RH'] as const) {
    const made = await call('POST', '/api/orders', { body: input });
    assert.equal(made.status, 201, made.json.error);
    const { order } = made.json, address = `/api/orders/${order.id}`, file = path.join(root, 'data/orders', `${order.id}.json`);
    const oldDraft = JSON.stringify({ ...order, motion: { ...order.motion, hand, pass: false } });
    await writeFile(file, oldDraft);
    const opened = await call('GET', address);
    assert.equal(opened.status, 200, opened.json.error);
    const refused = await call('POST', `${address}/approve`, { match: opened.json.revision });
    const problem = /GIV-2\.3.*Hämta bilderna/;
    assert.equal(refused.status, 409, `legacy ${hand}/false cannot freeze`);
    assert.match(refused.json.error, problem);
    assert.match(opened.json.problems.join(' '), problem);
    assert.match(opened.json.refresh, problem);
    assert.equal(await readFile(file, 'utf8'), oldDraft);

    const refreshed = await call('POST', `${address}/refresh`, { match: opened.json.revision });
    assert.equal(refreshed.status, 200, refreshed.json.error);
    assert.deepEqual([refreshed.json.order.motion.hand, refreshed.json.order.motion.pass], ['LH', true]);
    assert.equal(refreshed.json.order.prompt.sha256, order.prompt.sha256);
    const current = await call('GET', address);
    assert.deepEqual(current.json.problems, []);
    assert.equal(current.json.refresh, null);
    const approved = await call('POST', `${address}/approve`, { match: current.json.revision });
    assert.equal(approved.status, 200, approved.json.error);
    assert.equal(approved.json.order.approval.orderSha256, orderHash(refreshed.json.order));
  }
});

test('the MINIMAL two-hand deal accepts the H24 long-edge reference', async (t) => {
  const { root, call, files } = await lab(t);
  const media = register();
  const a3 = { id: 'paow-a3-p4', role: 'landning', name: 'A3 · P4', path: 'assets/anchors/paow-a3-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'kandidat' };
  media.dealers.paow.entries.push(a3);
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(media));
  await mkdir(path.dirname(path.join(root, a3.path)), { recursive: true });
  await writeFile(path.join(root, a3.path), files['paow-nyp-ny']);
  const id = 'docka-2-3-p4c1-h24';
  const ref = `assets/references/docka/${id}/source.mp4`;
  const film = Buffer.from('a three-second long-edge reference');
  await mkdir(path.dirname(path.join(root, ref)), { recursive: true });
  await writeFile(path.join(root, ref), film);
  await writeFile(path.join(root, 'data/rendered-references.json'), JSON.stringify({
    schemaVersion: 1, films: [{ id, edge: 'READY-C>P4.C1', path: ref, sha256: sha(film), seconds: 3, lays: 'RH', check: null }],
  }));
  const result = await call('POST', '/api/orders', {
    body: { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', style: 'MINIMAL', flipAxis: 'LONG_EDGE', reference: id, end: a3.id },
  });
  assert.equal(result.status, 201, result.json.error);
  const { order } = result.json;
  assert.deepEqual([order.prompt.style, order.motion.flipAxis, order.reference.clips, order.reference.sha256], ['MINIMAL', 'LONG_EDGE', [id], sha(film)]);
  assert.doesNotMatch(order.prompt.text, /short end/);
  assert.deepEqual(await readFile(path.join(root, order.reference.path)), film);
});

test('C2 two-hand drafts store the actual handoff and retain the legacy prompt', async (t) => {
  const { root, call, request } = await lab(t);
  const planPath = path.join(root, 'placements/default.json'), plan = JSON.parse(await readFile(planPath, 'utf8'));
  Object.assign(plan.targets['P4.C2'].intent, { takeHand: 'LH', pass: false, endSide: 'FRONT', grip: 'PINCH', turnAt: 'AIR', flipAxis: 'FREE' });
  await writeFile(planPath, JSON.stringify(plan));
  const reference = 'docka-2-3-p4c2-h24-cykel';
  const ref = `assets/references/docka/${reference}/source.mp4`;
  const film = Buffer.from('four seconds of own C2 motion');
  await mkdir(path.dirname(path.join(root, ref)), { recursive: true });
  await writeFile(path.join(root, ref), film);
  await writeFile(path.join(root, 'data/rendered-references.json'), JSON.stringify({
    schemaVersion: 1, films: [{ id: reference, edge: 'READY-C>P4.C2', path: ref, sha256: sha(film), seconds: 4, lays: 'RH', check: null }],
  }));
  const input = { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C2', style: 'MINIMAL', flipAxis: 'LONG_EDGE',
    shape: 'ROUND_TRIP', model: 'kling-4', duration: 4, takes: 1, reference };
  const preview = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(preview.status, 200, preview.json.error);
  const shown = preview.json.orders[0];
  const hands = (order: typeof shown) => [order.motion.grip, order.motion.hand, order.motion.pass, order.motion.fromPlan];
  assert.deepEqual(hands(shown), ['TWO_HANDS', 'LH', true, false]);
  assert.deepEqual(shown.step.cutInto, ['READY-C>P4.C2', 'P4.C2>READY-C']);
  assert.deepEqual([shown.motion.flipAxis, shown.motion.planned], ['LONG_EDGE', { grip: 'PINCH', flipAxis: 'FREE' }]);
  assert.doesNotMatch(shown.notes.join(' '), /handbyte i stället för/);
  const dealer = (await call('GET', '/api/orders')).json.dealers.find((d: { id: string }) => d.id === 'paow');
  const legacyMotion = { ...shown.motion, pass: false, fromPlan: true };
  const legacyText = orderPrompt({ ...shown, motion: legacyMotion }, dealer, null, { asStored: true });
  assert.deepEqual([shown.prompt.template, shown.prompt.text, shown.prompt.sha256], [legacyText.template, legacyText.text, sha(Buffer.from(legacyText.text))]);

  const saved = await request('POST', '/api/orders', { body: input, match: preview.json.revision });
  assert.equal(saved.status, 201, saved.json.error);
  const { order, revision } = saved.json, address = `/api/orders/${order.id}`;
  const file = path.join(root, 'data/orders', `${order.id}.json`);
  assert.deepEqual([order.motion, order.prompt], [shown.motion, shown.prompt]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).motion, shown.motion);

  const changed = await call('PUT', address, { match: revision, body: { hand: 'RH', pass: false } });
  assert.equal(changed.status, 200, changed.json.error);
  assert.deepEqual(hands(changed.json.order), ['TWO_HANDS', 'LH', true, false]);
  assert.equal(changed.json.order.prompt.sha256, shown.prompt.sha256);
  const legacy = { ...order, motion: legacyMotion };
  await writeFile(file, JSON.stringify(legacy));
  const reopened = await call('GET', address);
  assert.deepEqual(hands(reopened.json.order), ['TWO_HANDS', 'LH', false, true]);
  const renamed = await call('PUT', address, { match: reopened.json.revision, body: { title: 'C2 · prov' } });
  assert.equal(renamed.status, 200, renamed.json.error);
  assert.deepEqual(hands(renamed.json.order), ['TWO_HANDS', 'LH', true, false]);
  await writeFile(file, JSON.stringify(legacy));
  const refreshed = await call('POST', `${address}/refresh`, { match: reopened.json.revision });
  assert.equal(refreshed.status, 200, refreshed.json.error);
  assert.deepEqual(hands(refreshed.json.order), ['TWO_HANDS', 'LH', true, false]);
  assert.equal(refreshed.json.order.prompt.sha256, shown.prompt.sha256);
});

test('the return to 2.3 copies the preceding deal’s RH ending and cannot be approved', async (t) => {
  const { root, call, request, files } = await lab(t);
  const media = register();
  const ready = { id: 'paow-ankare-2-3-a', role: 'ankare-2.3', name: 'Ankare 2.3', path: 'assets/anchors/paow-ankare-2-3-a/anchor.png', node: 'READY-C', state: 'gäller' };
  const a3 = { id: 'paow-a3-p4', role: 'landning', name: 'A3 · P4', path: 'assets/anchors/paow-a3-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'kandidat' };
  const left = { ...a3, id: 'paow-a3-p4-lh', hand: 'LH' };
  const different = { ...a3, id: 'paow-a3-p4-other' };
  media.dealers.paow.entries.push(ready, a3, left, different);
  const registerFile = path.join(root, 'data/media-roles.json');
  await writeFile(registerFile, JSON.stringify(media));
  const readyBytes = files['paow-vila-ung-2'], a3Bytes = files['paow-nyp-ny'];
  for (const [entry, bytes] of [[ready, readyBytes], [a3, a3Bytes]] as const) {
    const file = path.join(root, entry.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  const deal = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', end: a3.id, side: 'FRONT', reference: null } });
  assert.equal(deal.status, 201, deal.json.error);
  const dealId: string = deal.json.order.id;
  const input = { dealer: 'paow', step: 'RETUR-2.3', target: 'P4.C1', base: a3.id, continues: dealId };
  const preview = (body: object) => request('POST', '/api/orders/preview', { body });
  const draftDeal = await preview(input);
  assert.equal(draftDeal.status, 400);
  assert.match(draftDeal.json.error, /godkänd GIV-2\.3/);

  const approved = await call('POST', `/api/orders/${dealId}/approve`, { match: deal.json.revision });
  assert.equal(approved.status, 200, approved.json.error);
  const last = approved.json.order.pictures[1];
  assert.equal(last.sha256, sha(a3Bytes));
  const prepared = await preview(input);
  assert.equal(prepared.status, 200, prepared.json.error);
  const order = prepared.json.orders[0];
  assert.deepEqual([order.step.edge, order.step.shape, order.step.cutInto, order.reference.status], ['P4.C1>READY-C', 'ONE_WAY', ['P4.C1>READY-C'], 'INGEN']);
  assert.deepEqual([order.motion.hand, order.motion.pass, order.motion.turn, order.motion.side], ['RH', false, false, 'FRONT']);
  assert.deepEqual(order.pictures.map((p: { sha256: string; from: { entry: string } }) => [p.sha256, p.from.entry]), [[last.sha256, a3.id], [sha(readyBytes), ready.id]]);
  assert.equal(order.pictures[0].from.path, last.path);
  assert.match(order.prompt.text, /right fingertips lift off the blue card.*card stays where it lies.*glides back low.*beside her left hand, which stays at the shoe, as in the last frame\.$/i);
  assert.match(order.notes.join(' '), /Recept retur-2\.3 \(prov\).*utan det utdelade kortet/);

  for (const [changes, reason] of [
    [{ base: null }, /namngiven A3-kandidat/],
    [{ base: left.id }, /namngiven A3-kandidat/],
    [{ base: different.id }, /godkänd GIV-2\.3/],
    [{ target: 'P3.C1' }, /namngiven A3-kandidat/],
    [{ continues: undefined }, /id för given/],
    [{ hand: 'LH' }, /höger hand tillbaka/],
    [{ pass: true }, /utan handbyte/],
    [{ side: 'BACK' }, /samma sida/],
    [{ reference: dealId }, /utan referensfilm/],
  ] as const) {
    const refused = await preview({ ...input, ...changes });
    assert.equal(refused.status, 400, JSON.stringify(changes));
    assert.match(refused.json.error, reason);
  }

  const saved = await request('POST', '/api/orders', { body: input, match: prepared.json.revision });
  assert.equal(saved.status, 201, saved.json.error);
  const persisted = saved.json.order;
  assert.deepEqual(await readFile(path.join(root, persisted.pictures[0].path)), a3Bytes);
  assert.deepEqual(await readFile(path.join(root, persisted.pictures[1].path)), readyBytes);
  const blocked = await call('POST', `/api/orders/${persisted.id}/approve`, { match: saved.json.revision });
  assert.equal(blocked.status, 409);
  assert.match(blocked.json.error, /utan det utdelade kortet/);
  assert.equal(JSON.parse(await readFile(registerFile, 'utf8')).dealers.paow.entries.find((e: { id: string }) => e.id === a3.id).state, 'kandidat');

  await writeFile(path.join(root, last.path), readyBytes);
  const frozenMismatch = await preview(input);
  assert.equal(frozenMismatch.status, 409);
  assert.match(frozenMismatch.json.error, /frysta slutbild.*SHA256/);
  await writeFile(path.join(root, last.path), a3Bytes);
  await writeFile(path.join(root, a3.path), readyBytes);
  const candidateMismatch = await preview(input);
  assert.equal(candidateMismatch.status, 409);
  assert.match(candidateMismatch.json.error, /A3-kandidatens bild stämmer inte/);
  await writeFile(path.join(root, a3.path), a3Bytes);
  ready.state = 'kandidat';
  await writeFile(registerFile, JSON.stringify(media));
  const noReady = await preview(input);
  assert.equal(noReady.status, 400);
  assert.match(noReady.json.error, /gällande ankare 2\.3/);
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
  assert.equal(o.title, 'Paow · Ankare 1 → 2.1 · Kling 4', 'another model than the recipe\'s is said in the title');
  assert.match(o.notes.join(' '), /Recept ingang-2\.1 \(gäller\) ur data\/order-methods\.json\. Undantag från receptet: modell Kling 4 i stället för WAN 3; 1 tagningar i stället för 2\./);
  assert.deepEqual(o.pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame', 'endFrame']);
  assert.equal(o.reference.status, 'INGEN');
  // None asked for: the recipe's model, resolution and length.
  const own = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'INGANG-2.1', takes: 1 } })).json.order;
  assert.deepEqual([own.generation.model, own.generation.params], ['wan3', { resolution: '1080p', duration: 4, ratio: 'adaptive', generateAudio: false }]);
  assert.equal(own.title, 'Paow · Ankare 1 → 2.1');
  // A deal from 2.1 with WAN 3 gets WAN's ratio and no sound.
  const deal = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', ...TUR, model: 'wan3' } })).json.order;
  assert.deepEqual(deal.generation.params, { resolution: '1080p', duration: 7, ratio: 'adaptive', generateAudio: false });
  for (const [body, why] of [
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 'nano-banana-pro' }, /kan inte göra Ankare 1 → 2\.1: välj kling-4, wan3\.$/],
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

test('the line: a deal says its anchor, its seat and its card, and the recipe gives the rest; the seat ends on its own picture; every exception is said', async (t) => {
  const { root, call, request, files, frames } = await lab(t);
  // Paow's anchor 2.1 and a landing picture for seat 4 hold; the bank has Pamela's approved deal to seat 4, which is the deal alone.
  const register = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8'));
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-nyp-ny').state = 'gäller';
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-vila-ung-2').state = 'gäller';
  register.dealers.paow.entries.push({ id: 'paow-landning-p4', role: 'landning', name: 'Plats 4, landning', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const landing = await picture(3, 233, 48);
  await mkdir(path.join(root, 'assets/anchors/paow-landning-p4'), { recursive: true });
  await writeFile(path.join(root, 'assets/anchors/paow-landning-p4/anchor.png'), landing);
  const film = Buffer.from('a film of four seconds');
  await mkdir(path.join(root, 'assets/motions/pamela-p4-c1-plan-deal-02'), { recursive: true });
  await mkdir(path.join(root, 'motions'), { recursive: true });
  await writeFile(path.join(root, 'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4'), film);
  const straight = { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-11: Det ser bra ut.' };
  const jobs = [{ id: 'pamela-p4-c1-plan-deal-02', from: 'READY', to: 'RELEASE(P4.C1)', duration: 4 }, { id: 'pamela-kort-01', from: 'READY', to: 'LAND(P4.C1)', duration: 2 }];
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({ jobs }));
  await writeFile(path.join(root, 'motions/pamela-p4-c1-plan-deal-02.json'), JSON.stringify({ source: { frames: 120, fps: 30, sha256: sha(film) }, review: straight }));
  await writeFile(path.join(root, 'motions/pamela-kort-01.json'), JSON.stringify({ source: { frames: 60, fps: 30 } }));

  // A return has no method yet: nothing is defaulted, and the one who orders says the model and the length.
  const bare = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1' } });
  assert.equal(bare.status, 400);
  assert.match(bare.json.error, /^Tillbaka till nypet \(2\.1\) har ingen metod än \(data\/order-methods\.json\), så inget är förvalt: säg modell \(kling-4, wan3\) och längd själv\.$/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1', model: 'wan3' } })).json.error, /säg längden själv \(2–30 s för WAN 3\)/);
  const back = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1', model: 'wan3', duration: 3 } });
  assert.equal(back.status, 201);
  const r = back.json.order;
  assert.deepEqual([r.step.edge, r.step.shape, r.step.cutInto, r.generation.model, r.generation.params.duration, r.takes, r.cost.total], ['P4.C1>READY', 'ONE_WAY', ['P4.C1>READY'], 'wan3', 3, 1, 60]);
  assert.deepEqual(r.pictures.map((p: { name: string; label: string; from: { entry: string } }) => [p.name, p.label, p.from.entry]), [['first.png', 'Första bild · Paows landning på plats 4', 'paow-landning-p4'], ['last.png', 'Sista bild · Paows ankare 2.1', 'paow-nyp-ny']]);
  assert.equal(r.pictures[0].sha256, sha(landing));
  assert.deepEqual([r.motion.turn, r.motion.side], [false, 'FRONT']);
  assert.match(r.prompt.text, /^Locked camera, one continuous shot\. Her fingertips lift off the blue card, which stays where it lies\. Her open hand glides back low over the felt, palm down, to the shoe/);
  assert.deepEqual(r.notes, ['Inget recept finns för Tillbaka till nypet (2.1): varje värde är valt för den här beställningen.']);
  assert.equal(back.json.shown, 'KLAR_ATT_TRYCKA');
  assert.equal(back.json.refresh, null);

  // THE LINE: the dealer, the step and the card. Everything else is the recipe: Kling 4, 1080p, bara dit, one take (a
  // trial), the seat's own end picture, the reference film its rule finds, and the film as long as that reference.
  const line = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(line.status, 201);
  const f = line.json.order;
  assert.deepEqual([f.step.shape, f.step.cutInto, f.title, f.summary], ['ONE_WAY', ['READY>P4.C1'], 'Paow · Nyp, ett kort till platsen · plats 4', 'Gör en film av Paow: ett kort från ankare 2.1 till plats 4, bara dit.']);
  assert.deepEqual(f.generation, { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 4 } }, 'the reference film is 4 s, and so is the film');
  assert.deepEqual([f.takes, f.prompt.style, f.prompt.template, f.motion.flipAxis, f.motion.hand, f.motion.pass], [1, 'KORT', 'film-giv-kort@12', 'FREE', 'LH', false]);
  assert.deepEqual(f.pictures.map((p: { name: string; label: string; sha256: string }) => [p.name, p.label, p.sha256]), [['first.png', 'Första bild · Paows ankare 2.1', sha(files['paow-nyp-ny'])], ['last.png', 'Sista bild · Paows landning på plats 4', sha(landing)]], 'seat 4 ends on seat 4\'s own landing picture');
  assert.deepEqual([f.reference.status, f.reference.clips, f.reference.path, f.reference.sha256, f.reference.seconds, f.reference.dealer, f.reference.approvedStraight, f.reference.from.verdict, f.reference.from.words], ['FINNS', ['pamela-p4-c1-plan-deal-02'], `assets/orders/${f.id}/reference.mp4`, sha(film), 4, 'pamela', true, 'GODKÄND', 'Det ser bra ut.']);
  assert.equal((await call('GET', `/${f.reference.path}`)).bytes!.equals(film), true, 'the film is copied byte for byte');
  assert.match(f.prompt.text, /^Locked camera, one continuous shot\. Video 1 shows only the movement: she moves like the dealer in video 1, with the same timing\. Her hand at the shoe draws the yellow card up out of the window/);
  assert.match(f.prompt.text, /she lays the card flat at its place, blue side up, and her fingertips come to rest on it, as in the last frame\./);
  assert.deepEqual(f.notes, ['Recept giv-2.1-mitten (prov) ur data/order-methods.json.'], 'the recipe and nothing against it');
  assert.equal(f.cost.perTake, 86, '21,5 per s × 4 s');
  assert.deepEqual(line.json.problems, [], 'another dealer\'s film is allowed as a reference');

  // The plan may say handbyte for the card (Jakob's saved plan did for seat 4, 2026-11-18): the line still orders the hand at
  // the shoe, which is what the trials tried, and what Placering said is not lost: fromPlan is false. A handbyte is an exception.
  const planFile = path.join(root, 'placements/default.json'), plan = JSON.parse(await readFile(planFile, 'utf8'));
  Object.assign(plan.targets['P4.C1'].intent, { pass: true });
  await writeFile(planFile, JSON.stringify(plan, null, 2) + '\n');
  const planned = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.order;
  assert.deepEqual([planned.motion.hand, planned.motion.pass, planned.motion.fromPlan, planned.reference.clips, planned.notes], ['LH', false, false, ['pamela-p4-c1-plan-deal-02'], ['Recept giv-2.1-mitten (prov) ur data/order-methods.json.']]);
  assert.equal(planned.prompt.text, f.prompt.text, 'the same text as with a plan that says the hand at the shoe');
  Object.assign(plan.targets['P4.C1'].intent, { pass: false });
  await writeFile(planFile, JSON.stringify(plan, null, 2) + '\n');
  // The same seat a second time gives the same order: nothing in it depends on which page asked.
  const again = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.order;
  assert.deepEqual([again.generation, again.prompt.text, again.reference.clips, again.takes], [f.generation, f.prompt.text, f.reference.clips, f.takes]);

  // A seat whose rule finds no reference film waits: nothing is made without the film the recipe wants.
  register.dealers.paow.entries.push({ id: 'paow-landning-p1', role: 'landning', name: 'Plats 1, landning', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P1.C1)', card: 'P1.C1', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const waits = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P1.C1' } });
  assert.equal(waits.status, 400);
  assert.match(waits.json.error, /^Nyp, ett kort till platsen till plats 1 väntar på dockans film till platsen \(receptet giv-2\.1-ytter i data\/order-methods\.json\)\. Inget beställs utan den; välj en referensfilm själv eller ingen, som ett undantag\.$/);
  // A handbyte lays the card with the right hand, and a landing picture holds for one hand: seat 4's is for the left, so the
  // seat has no end picture for it, and the refusal says the hand.
  const pass = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', pass: true } });
  assert.equal(pass.status, 400);
  assert.equal(pass.json.error, 'Plats 4 har ingen slutbild för Paows giv från ankare 2.1 med höger hand vid kortet: ingen landningsbild för höger hand gäller för platsen, och banken har ingen egen film dit, lagd med höger hand, vars retur du har godkänt rakt. Gör en landningsbild för platsen med höger hand vid kortet gällande i Material, eller godkänn en sådan retur från platsen i Granska.');
  // With one for the right hand, a handbyte is still no exception of its own: the bank's one-hand deal is no reference for
  // it, so it waits too.
  register.dealers.paow.entries.push({ id: 'paow-landning-p4-rh', role: 'landning', name: 'Plats 4, landning, höger hand', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const passRef = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', pass: true } });
  assert.equal(passRef.status, 400);
  assert.match(passRef.json.error, /^Nyp, ett kort till platsen till plats 4 väntar på dockans film till platsen eller en rakt godkänd giv dit, lagd med höger hand \(receptet giv-2\.1-mitten i data\/order-methods\.json\)\. Inget beställs utan den; välj en referensfilm själv eller ingen, som ett undantag\.$/);
  register.dealers.paow.entries.pop();
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));

  // The exceptions, each said in the draft: no reference film (then the recipe's 3 s), another model, tur och retur.
  const none = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: null } })).json.order;
  assert.deepEqual([none.reference.status, none.generation.params.duration, none.cost.perTake], ['INGEN', 3, 64]);
  assert.deepEqual(none.notes, ['Recept giv-2.1-mitten (prov) ur data/order-methods.json.', 'Undantag från receptet: ingen referensfilm fast receptet vill ha en.']);
  assert.doesNotMatch(none.prompt.text, /Video 1/);
  const wanAnswer = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', model: 'wan3' } });
  assert.equal(wanAnswer.status, 201, wanAnswer.json.error);
  const wan = wanAnswer.json.order;
  assert.deepEqual([wan.title, wan.reference.status, wan.generation.params.duration], ['Paow · Nyp, ett kort till platsen · plats 4 · WAN 3', 'INGEN', 3]);
  assert.match(wan.notes[1], /^Undantag från receptet: modell WAN 3 i stället för Kling 4; ingen referensfilm fast receptet vill ha en\.$/);
  // (Tur och retur as an exception, with its title and its notes: the test of the hand and "Alla sju" above.)
  // The last picture of a deal bara dit shows a hand and a side: they are not changed on the draft.
  assert.match((await call('PUT', `/api/orders/${f.id}`, { body: { hand: 'RH' }, match: line.json.revision })).json.error, /Sista bilden är platsens slutbild, som visar handen och kortets sida/);

  // A reference film named outright: only for a model that takes one, of a length it takes, and from the bank.
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', model: 'wan3', reference: 'pamela-p4-c1-plan-deal-02' } })).json.error, /WAN 3 tar ingen referensfilm/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: 'pamela-kort-01' } })).json.error, /Referensfilmen är 2 s; Kling 4 tar 3–30 s/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: 'nobody' } })).json.error, /nobody finns inte bland bankens tagningar/);

  // No landing picture holds for the seat any more (set aside in Material): the seat ends on the cut frame of Paow's own
  // round trip to the seat, where the return Jakob approved straight begins. The frame is checked as a picture first.
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-landning-p4').state = 'ersatt';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const trip = (clip: string, cut: number) => [{ id: `${clip}-deal`, from: 'READY', to: 'P4.C1', clip, frames: [0, cut], dealer: 'paow' }, { id: `${clip}-return`, from: 'P4.C1', to: 'READY', clip, frames: [cut + 1, cut + 60], dealer: 'paow' }];
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({ jobs, derived: [...trip('paow-giv-2-1-p4-04-01', 108), ...trip('paow-giv-2-1-p4-08-01', 133)] }));
  for (const clip of ['paow-giv-2-1-p4-04-01', 'paow-giv-2-1-p4-08-01']) {
    await writeFile(path.join(root, `motions/${clip}.json`), JSON.stringify({ source: { frames: 169, fps: 24 } }));
    await writeFile(path.join(root, `motions/${clip}-return.json`), JSON.stringify({ review: { ...straight, userReview: 'Jakob 2026-11-13: Bra retur.' }, motion: { releaseHand: 'LH' } }));
  }
  const quad = (await call('GET', '/api/orders')).json.plan.seats['P4.C1'].quad as [number, number][];
  const box = [Math.round(Math.min(...quad.map((p) => p[0]))), Math.round(Math.min(...quad.map((p) => p[1]))), Math.round(Math.max(...quad.map((p) => p[0]))), Math.round(Math.max(...quad.map((p) => p[1])))];
  // A frame: green, with a blue card where the plan lays seat 4's (or 40 px off it), and for the second film a printed card in the shoe's window.
  const frame = async (dx: number, printed = false) => sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r: 0, g: 236, b: 45 } } }).composite([
    { input: { create: { width: box[2] - box[0] + 1, height: box[3] - box[1] + 1, channels: 3, background: { r: 20, g: 60, b: 200 } } }, left: box[0] + dx, top: box[1] },
    ...(printed ? [{ input: { create: { width: 60, height: 90, channels: 3 as const, background: { r: 230, g: 200, b: 30 } } }, left: 1260, top: 750 }, { input: { create: { width: 30, height: 40, channels: 3 as const, background: { r: 200, g: 30, b: 30 } } }, left: 1275, top: 775 }] : []),
  ]).png().toBuffer();
  const asked: string[] = [];
  frames.of = async (source) => { asked.push(`${source.path}@${source.frame}`); return source.path.includes('p4-04-01') ? frame(40) : frame(0, true); };
  const cut = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(cut.status, 201);
  const c = cut.json.order;
  const candidates = ['assets/motions/paow-giv-2-1-p4-04-01/source.mp4@108', 'assets/motions/paow-giv-2-1-p4-08-01/source.mp4@133'];
  assert.deepEqual(asked, candidates, 'the preview passes over the frame 40 px off the plan, and save reuses the selected frame');
  const last = c.pictures[1];
  assert.deepEqual([last.label, last.from.path, last.from.frame, last.from.cut], ['Sista bild · platsens slutbild: ruta 133 ur paow-giv-2-1-p4-08-01', 'assets/motions/paow-giv-2-1-p4-08-01/source.mp4', 133, { clip: 'paow-giv-2-1-p4-08-01', frame: 133, ret: 'paow-giv-2-1-p4-08-01-return', shoeFrom: 'paow-vila-ung-2' }]);
  assert.match(last.from.note, /^ruta 133 ur paow-giv-2-1-p4-08-01, där returen börjar \(Jakob: ”Bra retur\.”\); skon och kortet i fönstret ur ankare 1$/);
  assert.equal(cut.json.owners['last.png'].dealer, 'paow', 'the frame is the dealer\'s own');
  assert.deepEqual(cut.json.problems, []);
  assert.equal(cut.json.shown, 'KLAR_ATT_TRYCKA');

  const batch = [{ dealer: 'paow', step: 'VILA' }, { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' }];
  const orderFiles = (await readdir(path.join(root, 'data/orders'))).sort();
  const assetFolders = (await readdir(path.join(root, 'assets/orders'))).sort();
  const good = await request('POST', '/api/orders/preview', { body: batch });
  assert.equal(good.status, 200);
  const original = frames.of!;
  const idle = path.join(root, 'assets/anchors/paow-vila-ung-2/anchor.png');
  frames.of = async (source) => {
    // Row 1 has finished reading the idle image. Row 2 uses its own cut frame.
    await writeFile(idle, await picture(5, 231, 41));
    return original(source);
  };
  const mixed = await request('POST', '/api/orders/preview', { body: batch });
  assert.equal(mixed.status, 409, 'changing the first row while preparing the second rejects the mixed snapshot');
  assert.equal((await request('POST', '/api/orders', { body: batch, match: good.json.revision })).status, 409);

  const entered = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  frames.of = async (source) => {
    entered.resolve();
    await resume.promise;
    return original(source);
  };
  const concurrent = request('POST', '/api/orders/preview', { body: batch });
  await Promise.race([entered.promise, concurrent.then(() => assert.fail('preview ended before reaching row 2'))]);
  const registerBefore = await readFile(path.join(root, 'data/media-roles.json'));
  const change = request('PUT', '/api/media/paow-vila-ung-1/state', { body: { state: 'gäller' }, match: `"${sha(registerBefore)}"` });
  const materialFinishedEarly = await Promise.race([change.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 75))]);
  const whilePreparing = await readFile(path.join(root, 'data/media-roles.json'));
  resume.resolve();
  const [preview, changedMaterial] = await Promise.all([concurrent, change]);
  assert.equal(materialFinishedEarly, false, 'Material waits for the entire preview');
  assert.deepEqual(whilePreparing, registerBefore);
  assert.equal(preview.status, 200);
  assert.equal(changedMaterial.status, 200);
  assert.equal((await request('POST', '/api/orders', { body: batch, match: preview.json.revision })).status, 409, 'Material invalidates the previously displayed batch');
  assert.deepEqual((await readdir(path.join(root, 'data/orders'))).sort(), orderFiles);
  assert.deepEqual((await readdir(path.join(root, 'assets/orders'))).sort(), assetFolders);

  const frozenAddress = `/api/orders/${again.id}`;
  const earlier = await call('GET', frozenAddress);
  const frozen = await call('POST', `${frozenAddress}/approve`, { match: earlier.json.revision });
  assert.equal(frozen.status, 200, frozen.json.error);
  const frozenFile = path.join(root, `data/orders/${again.id}.json`);
  const frozenBytes = await readFile(frozenFile);
  const archive = { by: 'Jakob', at: '2026-11-18T00:00:00Z', where: 'Karta' };
  for (const id of [last.from.cut.ret, last.from.cut.clip, `${last.from.cut.clip}-deal`]) {
    const file = path.join(root, `motions/${id}.json`);
    const previous = await readFile(file).catch(() => null);
    await writeFile(file, JSON.stringify({ ...(previous ? JSON.parse(previous.toString()) : {}), review: { ...straight, archived: archive } }));
    const blocked = await call('POST', `/api/orders/${c.id}/approve`, { match: cut.json.revision });
    if (previous) await writeFile(file, previous); else await rm(file);
    assert.equal(blocked.status, 409, `cut-frame provenance ${id}`);
    assert.match(blocked.json.error, /snittrutan.*arkiverad/i);
  }
  const cutSource = path.join(root, `motions/${last.from.cut.ret}.json`), cutSourceBefore = await readFile(cutSource);
  await writeFile(cutSource, '{');
  const unreadableCut = await call('POST', `/api/orders/${c.id}/approve`, { match: cut.json.revision });
  assert.equal(unreadableCut.status, 409);
  assert.match(unreadableCut.json.error, /Arkivstatus.*snittrutan/i);
  await writeFile(cutSource, cutSourceBefore);
  const bankFile = path.join(root, 'data/clip-jobs.json'), bankBefore = await readFile(bankFile, 'utf8');
  const bank = JSON.parse(bankBefore), referencePart = 'pamela-archived-return';
  const correctedId = 'pamela-p4-c1-plan-deal-02-fixed';
  bank.edits = [...(bank.edits ?? []), {id: correctedId, source: {clip: f.reference.from.film}, dealer: 'pamela'}];
  const correctedPath = path.join(root, 'assets/motions', correctedId, 'source.mp4');
  const correctedFilm = Buffer.from('a corrected copy of the four-second film');
  await mkdir(path.dirname(correctedPath), {recursive: true});
  await writeFile(correctedPath, correctedFilm);
  await writeFile(path.join(root, `motions/${correctedId}.json`), JSON.stringify({source: {frames: 120, fps: 30, sha256: sha(correctedFilm)}}));
  await writeFile(bankFile, JSON.stringify(bank));
  const correctedInput = {dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: correctedId};
  const correctedBefore = await call('POST', '/api/orders', {body: correctedInput});
  assert.equal(correctedBefore.status, 201, correctedBefore.json.error);
  const alreadyFrozen = await call('POST', `/api/orders/${correctedBefore.json.order.id}/approve`, {match: correctedBefore.json.revision});
  assert.equal(alreadyFrozen.status, 200, alreadyFrozen.json.error);
  const correctedFrozenPath = path.join(root, `data/orders/${correctedBefore.json.order.id}.json`);
  const correctedFrozenBytes = await readFile(correctedFrozenPath);
  const pendingCorrection = await call('POST', '/api/orders', {body: correctedInput});
  assert.equal(pendingCorrection.status, 201, pendingCorrection.json.error);
  bank.derived.push({ id: referencePart, clip: f.reference.from.film, from: 'P4.C1', to: 'READY', frames: [80, 119], dealer: 'pamela' });
  await writeFile(bankFile, JSON.stringify(bank));
  await writeFile(path.join(root, `motions/${referencePart}.json`), JSON.stringify({ review: { archived: archive } }));
  const stalePart = await call('POST', `/api/orders/${f.id}/approve`, { match: line.json.revision });
  assert.equal(stalePart.status, 409);
  assert.match(stalePart.json.error, /referensfilmen.*arkiverad/i);
  const staleCorrection = await call('POST', `/api/orders/${pendingCorrection.json.order.id}/approve`, {match: pendingCorrection.json.revision});
  assert.equal(staleCorrection.status, 409);
  assert.match(staleCorrection.json.error, /referensfilmen.*arkiverad/i);
  const blockedCorrection = await request('POST', '/api/orders/preview', {body: correctedInput});
  assert.equal(blockedCorrection.status, 400);
  assert.match(blockedCorrection.json.error, /finns inte bland bankens tagningar/);
  assert.deepEqual(await readFile(correctedFrozenPath), correctedFrozenBytes, 'an already-approved copy stays frozen');
  await writeFile(bankFile, bankBefore);

  // Where no cut frame holds as a picture, the draft is refused with what each lacks; and an archived take gives none.
  frames.of = async () => frame(40);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.error, /^Plats 4 har ingen slutbild som håller: paow-giv-2-1-p4-04-01 ruta 108: kortet ligger 40 px från planens; paow-giv-2-1-p4-08-01 ruta 133: kortet ligger 40 px från planens\.$/);
  for (const clip of ['paow-giv-2-1-p4-04-01', 'paow-giv-2-1-p4-08-01']) await writeFile(path.join(root, `motions/${clip}-return.json`), JSON.stringify({ review: { ...straight, archived: { by: 'Jakob', at: '2026-11-18T00:00:00Z', where: 'Karta' } } }));
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.error, /^Plats 4 har ingen slutbild för Paows giv från ankare 2\.1/);
  // An archived take is no reference film either.
  await writeFile(path.join(root, 'motions/pamela-p4-c1-plan-deal-02.json'), JSON.stringify({ source: { frames: 120, fps: 30, sha256: sha(film) }, review: { ...straight, archived: { by: 'Jakob', where: 'Karta' } } }));
  const staleReference = await call('POST', `/api/orders/${f.id}/approve`, { match: line.json.revision });
  assert.equal(staleReference.status, 409, staleReference.json.error);
  assert.match(staleReference.json.error, /referensfilmen.*arkiverad/i);
  const draftFile = path.join(root, `data/orders/${f.id}.json`), { from, ...legacyReference } = f.reference;
  for (const reference of [{ ...legacyReference, from: { ...from, path: 'assets/references/docka/lookalike/source.mp4' } }, legacyReference]) {
    await writeFile(draftFile, JSON.stringify({ ...f, reference }));
    const draft = await call('GET', `/api/orders/${f.id}`);
    const denied = await call('POST', `/api/orders/${f.id}/approve`, { match: draft.json.revision });
    assert.equal(denied.status, 409, 'the source id is checked with a misleading path and with only the legacy clip ids');
    assert.match(denied.json.error, /referensfilmen.*arkiverad/i);
  }
  assert.deepEqual((await call('GET', frozenAddress)).json.order, frozen.json.order);
  assert.deepEqual(await readFile(frozenFile), frozenBytes, 'archiving a source preserves an already-approved order');
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-landning-p4').state = 'gäller';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.error, /väntar på dockans film till platsen eller en rakt godkänd giv dit/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: 'pamela-p4-c1-plan-deal-02' } })).json.error, /finns inte bland bankens tagningar/);
  // A changed film in the bank is not copied.
  await writeFile(path.join(root, 'motions/pamela-p4-c1-plan-deal-02.json'), JSON.stringify({ source: { frames: 120, fps: 30, sha256: sha(film) }, review: straight }));
  await writeFile(path.join(root, 'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4'), 'another film');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).status, 409);

  // The dummy's rendered film for the seat (data/rendered-references.json) comes before the bank's take, and is copied from its own folder.
  const docka = Buffer.from('the dummy dealing to seat four');
  await mkdir(path.join(root, 'assets/references/docka/docka-giv-p4-4'), { recursive: true });
  await writeFile(path.join(root, 'assets/references/docka/docka-giv-p4-4/source.mp4'), docka);
  await writeFile(path.join(root, 'data/rendered-references.json'), JSON.stringify({ schemaVersion: 1, about: 'test', films: [{ id: 'docka-giv-p4-4', edge: 'READY>P4.C1', path: 'assets/references/docka/docka-giv-p4-4/source.mp4', sha256: sha(docka), seconds: 3.967, fromDeal: 'pamela-p4-c1-plan-deal-02' }, { id: 'utanfor', edge: 'READY>P4.C1', path: 'assets/motions/x/source.mp4', sha256: sha(docka), seconds: 4 }] }));
  assert.deepEqual((await call('GET', '/api/orders')).json.rendered.map((x: { id: string }) => x.id), ['docka-giv-p4-4'], 'an entry outside the dummy\'s folder is left out');
  const withDocka = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(withDocka.status, 201);
  const d = withDocka.json.order;
  assert.deepEqual([d.reference.clips, d.reference.dealer, d.reference.sha256, d.reference.seconds, d.generation.params.duration, d.reference.from.path], [['docka-giv-p4-4'], 'docka', sha(docka), 3.967, 4, 'assets/references/docka/docka-giv-p4-4/source.mp4']);
  assert.equal((await call('GET', `/${d.reference.path}`)).bytes!.equals(docka), true);
  await writeFile(path.join(root, 'motions/pamela-p4-c1-plan-deal-02.json'), JSON.stringify({ review: { archived: archive } }));
  const approvedDocka = await call('POST', `/api/orders/${d.id}/approve`, { match: withDocka.json.revision });
  assert.equal(approvedDocka.status, 200, approvedDocka.json.error);
});

test('corrected full films inherit archived originals and unreadable provenance prevents approval', async (t) => {
  const { root, call, request } = await lab(t);
  const media = register(), landing = {id: 'paow-landning-p4', role: 'landning', name: 'Landning 4', path: 'assets/anchors/paow-nyp-ny/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', state: 'gäller'};
  media.dealers.paow.entries[3].state = 'gäller';
  media.dealers.paow.entries.push(landing);
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(media));
  const parent = 'paow-original', fixed = `${parent}-fix-1`;
  const film = Buffer.from('a four-second round trip');
  const derived = [parent, fixed].flatMap(clip => [
    {id: `${clip}-deal`, clip, from: 'READY', to: 'P4.C1', frames: [0, 79], ...(clip === fixed ? {editOf: `${parent}-deal`} : {})},
    {id: `${clip}-return`, clip, from: 'P4.C1', to: 'READY', frames: [80, 119], ...(clip === fixed ? {editOf: `${parent}-return`} : {})},
  ]);
  const registry = path.join(root, 'data/clip-jobs.json'), registryData = JSON.stringify({jobs: [], derived});
  const motion = (id: string) => path.join(root, `motions/${id}.json`);
  await mkdir(path.join(root, 'motions'));
  await writeFile(registry, registryData);
  for (const clip of [parent, fixed]) {
    const asset = path.join(root, `assets/motions/${clip}/source.mp4`);
    await mkdir(path.dirname(asset), {recursive: true});
    await writeFile(asset, film);
    await writeFile(motion(clip), JSON.stringify({source: {frames: 120, fps: 30, sha256: sha(film)}}));
  }
  const input = (reference: string) => ({dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference});
  const preview = (reference: string) => request('POST', '/api/orders/preview', {body: input(reference)});
  const archive = JSON.stringify({review: {archived: {by: 'Jakob', where: 'Karta'}}});
  const fixedReturn = motion(`${fixed}-return`), originalReturn = motion(`${parent}-return`);
  await writeFile(fixedReturn, archive);
  assert.equal((await preview(parent)).status, 200, 'archiving a corrected copy does not block the original');
  await rm(fixedReturn);
  const pending = await call('POST', '/api/orders', {body: input(`${fixed}-deal`)});
  assert.equal(pending.status, 201, pending.json.error);
  const address = `/api/orders/${pending.json.order.id}`;
  const approve = () => call('POST', `${address}/approve`, {match: pending.json.revision});

  await writeFile(originalReturn, archive);
  const blocked = await approve();
  assert.equal(blocked.status, 409, blocked.json.error);
  assert.match(blocked.json.error, /referensfilmen.*arkiverad/i);
  for (const reference of [fixed, `${fixed}-deal`]) assert.equal((await preview(reference)).status, 400, reference);
  await rm(originalReturn);

  for (const invalid of ['{', 'null', '{"jobs": [], "derived": "unreadable"}']) {
    await writeFile(registry, invalid);
    const denied = await approve();
    assert.equal(denied.status, 409);
    assert.match(denied.json.error, /Arkivstatus.*clip-jobs\.json/i);
  }
  await rm(registry);
  const missingRegistry = await approve();
  assert.equal(missingRegistry.status, 409);
  assert.match(missingRegistry.json.error, /Arkivstatus.*clip-jobs\.json/i);
  await writeFile(registry, registryData);
  await writeFile(originalReturn, '{');
  const invalidMotion = await approve();
  assert.equal(invalidMotion.status, 409);
  assert.match(invalidMotion.json.error, /Arkivstatus.*referensfilmen/i);
  await rm(originalReturn);
  await mkdir(originalReturn);
  const unreadableMotion = await approve();
  assert.equal(unreadableMotion.status, 409);
  assert.match(unreadableMotion.json.error, /Arkivstatus.*referensfilmen/i);
  await rmdir(originalReturn);
  // Missing records can mean there has never been a review. An unrelated unreadable record is not the draft's source.
  await writeFile(registry, JSON.stringify({jobs: [{id: 'unrelated', from: 'IDLE', to: 'READY'}], derived}));
  await writeFile(motion('unrelated'), '{');
  const accepted = await approve();
  assert.equal(accepted.status, 200, accepted.json.error);
});

test("whose each picture is: the dealer's own, the other dealer's arm only, never another dealer's whole picture", async (t) => {
  const { call } = await lab(t);
  const still = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  assert.deepEqual(still.owners['anchor.png'], { dealer: 'paow', name: 'Paow', part: 'whole' });
  assert.deepEqual(still.owners['pose-figure.png'], { dealer: 'pamela', name: 'Pamela', part: 'arm' });
  assert.equal(still.problems.length, 0);
  const film = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P4.C1', ...TUR_WAN } })).json;
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
  // Her anchors are candidates here: every picture waits, and the text says the place from the plan.
  const hole = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'D.C2', ...TUR } })).json;
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
  assert.deepEqual([o.prompt.style, o.prompt.template, o.generation.model, o.generation.params.duration, o.cost.total], ['KORT', 'film-halkort-kort@12', 'wan3', 5, 100]);
  assert.equal(o.takes, 1, 'the hole card\'s turn is still being tried: one take');
  assert.match(o.prompt.text, /to the yellow card lying close in front of her, in the middle of the picture, where the last frame shows it\. There her thumb slides under/);
  assert.equal(turn.json.shown, 'VÄNTAR');
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'HALKORT', style: 'UTFÖRLIG' } })).json.error, /skrivs KORT eller MINIMAL/);
  const out = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'UTGANG' } })).json.order;
  assert.deepEqual([out.id, out.step.edge, out.pictures.map((p: { waits: { label: string } | null }) => p.waits?.label)], ['paow-utgang-01', 'READY>IDLE', ['ankare 2.1', 'ankare 1']]);
  assert.match(out.prompt.text, /^Locked camera, one continuous shot\. Her thumb and forefinger let the yellow card settle back into the shoe's window/);
  // The way out from the drag: anchor 2.2 to rest, its own id, its anchor 2.2 waited for (none holds in this lab).
  const outDrag = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'UTGANG-2.2' } })).json.order;
  assert.deepEqual([outDrag.id, outDrag.step.edge, outDrag.step.cutInto, outDrag.pictures.map((p: { waits: { label: string } | null }) => p.waits?.label)], ['paow-utgang-2-2-01', 'READY-B>IDLE', [], ['ankare 2.2', 'ankare 1']]);
  assert.deepEqual([outDrag.prompt.template, outDrag.generation.model, outDrag.generation.params.duration, outDrag.cost.total], ['film-utgang-kort@12', 'wan3', 4, 80]);
  assert.match(outDrag.prompt.text, /^Locked camera, one continuous shot\. Her fingertips lift off the yellow card in the shoe's window/);
  assert.match(outDrag.summary, /ankare 2\.2/);

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
