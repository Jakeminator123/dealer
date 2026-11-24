// The routes of the view Beställ and of Jakob's verdict in Material (tools/order-routes.ts), run against a temporary
// copy of the data on a real local server: drafts from a few choices, changes only with the revision read, approval only
// from the lab's own origin and within the policy, nothing changed after approval, files only from the order's folder,
// and kandidat → gäller with the other candidates replaced. Pictures are flat PNGs in the bank's size; no film is decoded.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, rmdir, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { orderRoutes } from './order-routes.ts';
import { defaultPlan } from '../src/placement-model.ts';
import { orderStore, orderHash } from './order-store.ts';
import { MOTIONS_TEXT, motionRegister } from './register-store.ts';
import { promptFor } from '../src/order-prompts.ts';
import { MODELS, requestOf, stepOf } from '../src/order-model.ts';
import { referenceByRule, triedWords } from '../src/order-methods.ts';
import { dollFilm, newOrderOf, treesOf } from './order-new.ts';
import { mediaRoles } from './media-roles.ts';
import { replacedBy, allowed, isDecidable } from '../studio/components/material/state.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** A post of the fixture's register of films and takes (tools/register-store.ts), written whole with its id; its text file is postsFile. */
const post = (root: string, id: string, value: Record<string, unknown>) => { motionRegister(root).put(id, { id, ...value }); };
const postsFile = (root: string) => path.join(root, MOTIONS_TEXT);
// The bank's frame: every picture of an order is in bank pixels.
const picture = (r: number, g: number, b: number) => sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r, g, b } } }).png().toBuffer();

const register = () => ({
  schemaVersion: 1,
  dealers: {
    ada: { name: 'Ada', entries: [
      { id: 'ada-vila', role: 'ankare-1', name: 'Vila', path: 'assets/anchors/ada-vila/anchor.png', node: 'IDLE', state: 'gäller' },
      { id: 'ada-nyp', role: 'ankare-2.1', name: 'Nyp', path: 'assets/anchors/ada-nyp/anchor.png', node: 'READY' },
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

/** The bank's real card, which a return's last picture is drawn with (TEXTURE in tools/order-images.ts), copied into the lab; false where this checkout has no media. */
async function texture(root: string) {
  const { TEXTURE } = await import('./order-images.ts');
  if (!existsSync(TEXTURE.image)) return false;
  await mkdir(path.join(root, path.dirname(TEXTURE.image)), { recursive: true });
  await copyFile(TEXTURE.image, path.join(root, TEXTURE.image));
  return true;
}
const NO_TEXTURE = 'kortets textur (assets/) finns inte i den här utcheckningen';
/**
 * A draft's note of the recipe it follows: its name and what has been tried with it, in plain words and never as a status
 * (triedWords), read from the register the lab copies, so that a new order in the register's evidence changes no test.
 */
const recipeNote = (id: string) => `Recept ${id}: ${triedWords(JSON.parse(readFileSync('data/order-methods.json', 'utf8')).methods.find((m: { id: string }) => m.id === id)).tried}.`;

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
  // Every dealer of the lab can be ordered for, and a second, made-up dealer (Ada, the register's first below) beside the
  // real ones, so that two dealers' orders and pictures can be told apart; the pause has a test of its own.
  const dealersFile = path.join(root, 'data/dealers.json');
  const dealerList = JSON.parse(await readFile(dealersFile, 'utf8'));
  dealerList.dealers.unshift({ id: 'ada', name: 'Ada', look: 'a made-up test dealer', films: { prefix: 'ada-' }, shoe: '2.1', paused: null });
  for (const d of dealerList.dealers) d.paused = null;
  await writeFile(dealersFile, JSON.stringify(dealerList));
  // A declared fixture, independent of Jakob's saved or newly committed hand choices.
  const fixturePlan = defaultPlan();
  Object.assign(fixturePlan.targets['P4.C2'].intent, {endSide: 'FRONT', turn: true}); // both player cards are open in these route tests
  await writeFile(path.join(root, 'placements/default.json'), JSON.stringify(fixturePlan));
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register(), null, 2) + '\n');
  await writeFile(path.join(root, 'data/clip-jobs.json'), '{"jobs": []}');
  const files: Record<string, Buffer> = {};
  for (const [name, colour] of [['ada-vila', [0, 237, 44]], ['ada-nyp', [10, 230, 40]], ['paow-vila-ung-2', [0, 236, 45]], ['paow-vila-ung-1', [1, 235, 46]], ['paow-nyp-ny', [2, 234, 47]]] as const) {
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
  handle.fn = orderRoutes({ root, origin, now: () => new Date('2026-11-12T21:00:00Z'), frame:(source) => (frames.of ? frames.of(source) : Promise.reject(new Error('no film'))) });
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
  const film = { dealer: 'ada', step: 'VILA' };
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

  const input = { dealer: 'ada', step: 'VILA' } as const;
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
  const input = { dealer: 'ada', step: 'VILA' };
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
  assert.equal((await call('POST', '/api/orders', { body: { ...still, pose: { path: 'C:/x.png' } } })).status, 400, 'nor hand in a picture of its own');
  const made = await call('POST', '/api/orders', { body: still });
  assert.equal(made.status, 201);
  const a = made.json;
  assert.equal(a.order.id, 'paow-ankare-2-1-01');
  assert.equal(a.shown, 'KLAR_ATT_TRYCKA');
  assert.match(a.warnings.join(' '), /Vila, kandidat 2 är kandidat, inte godkänd/);
  const anchor = a.order.pictures.find((p: { name: string }) => p.name === 'anchor.png');
  assert.equal(anchor.sha256, sha(files['paow-vila-ung-2']), 'the picture is copied byte for byte');
  assert.equal((await call('GET', `/${anchor.path}`)).bytes!.equals(files['paow-vila-ung-2']), true);
  // Since 2026-11-21 in Jakob's notation (A1, A2.1), not "Paows ankare 1".
  assert.equal(anchor.label, 'Paows A1 · kandidat 2', 'which of her pictures the draft uses');
  // The answer names each picture as Material does today, beside the frozen label; the stored order has no such field.
  assert.equal(anchor.named, 'Vila, kandidat 2');
  assert.equal('named' in JSON.parse(await readFile(path.join(root, 'data/orders/paow-ankare-2-1-01.json'), 'utf8')).pictures[0], false);
  assert.deepEqual(a.order.pictures.map((p: { name: string }) => p.name), ['anchor.png'], 'a still goes out with its anchor alone');
  assert.equal(a.order.summary, 'Gör Paows ankare 2.1 ur hennes ankare 1.', 'what it makes and from what, never how she moves');
  assert.equal(a.order.cost.total, 80);
  // Changed 2026-11-21 (review finding 16): the notes name the recipe, not the file it lies in.
  assert.deepEqual(a.order.notes, [recipeNote('ankare-2.1'), 'Undantag från receptet: 2 tagningar i stället för 1.'], 'the recipe it follows, and where it departs from it');

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
  // A deal is bara dit by its recipe and ends on the seat's own end picture; here seat 4 has neither a landing picture nor a
  // film of its own, so the deal is made without a last picture (changed 2026-11-23: a seat with no end picture yet stops
  // no deal). Read as a preview: nothing is written.
  for (const body of [{ dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' }, { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', shape: 'ONE_WAY' }]) {
    const none = await call('POST', '/api/orders/preview', { body });
    assert.equal(none.status, 200, none.json.error);
    const open = none.json.orders[0];
    assert.deepEqual(open.pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame'], 'the first picture and no last one');
    assert.doesNotMatch(open.prompt.text, /last frame|last picture/i);
    assert.ok(open.notes.some((n: string) => /utan sista bild: .*A3P4C1 görs efteråt ur filmens sista ruta/.test(n)), open.notes.join('\n'));
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

test('nothing new is drafted for a paused dealer: neither a preview nor a draft, one seat or several', async (t) => {
  const { root, call, request } = await lab(t);
  const made = await call('POST', '/api/orders', { body: { dealer: 'ada', step: 'VILA' } });
  assert.equal(made.status, 201, 'made before the pause');
  const file = path.join(root, 'data/dealers.json');
  const dealers = JSON.parse(await readFile(file, 'utf8'));
  dealers.dealers.find((d: { id: string }) => d.id === 'ada').paused = 'Jakob 2026-11-12: inget nytt beställs för Ada.';
  await writeFile(file, JSON.stringify(dealers));
  for (const body of [{ dealer: 'ada', step: 'VILA' }, [{ dealer: 'ada', step: 'VILA' }], { dealer: 'ada', step: 'GIV-2.1', seats: [{ target: 'P1.C1' }, { target: 'P2.C1' }] }]) {
    const refused = await request('POST', '/api/orders/preview', { body });
    assert.equal(refused.status, 409, JSON.stringify(body));
    assert.equal(refused.json.error, 'Ada är pausad: inget nytt beställs.');
  }
  assert.deepEqual(await readdir(path.join(root, 'data/orders')), [`${made.json.order.id}.json`], 'her draft stays as it was, and nothing new is written');
  assert.equal((await request('GET', `/api/orders/${made.json.order.id}`)).status, 200);
  assert.equal((await request('POST', '/api/orders/preview', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).status, 200, 'another dealer is not paused');
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
  const cameras = [{ id: 'rak', role: 'ankare-2.3', node: 'READY-C', state: 'gäller' }, { id: 'stol-1', role: 'ankare-2.3', node: 'READY-C', state: 'kandidat', seat: 1 }, { id: 'stol-1-b', role: 'ankare-2.3', node: 'READY-C', state: 'gäller', seat: 1 }] as const;
  assert.equal(replacedBy(cameras, cameras[1]).map((e) => e.id).join(), 'stol-1-b', 'an anchor seen from a seat gives way only to one from the same seat: the anchor of the straight camera stays');
});

test('a draft that waits fetches its picture once the anchor holds: with refresh, or at once on Godkänn in Material', async (t) => {
  const { root, call, files } = await lab(t);
  const store = orderStore(root, { now: () => new Date('2026-11-12T21:00:00Z') });
  const { order, revision } = await store.create({ dealer: 'paow', step: 'ANKARE-2.1' });
  assert.deepEqual(order.pictures.map((p) => [p.name, p.path === null, p.waits?.label ?? null]), [['anchor.png', true, 'ankare 1']]);
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
  assert.equal(anchor.label, 'Paows A1');
  assert.equal(refreshed.json.shown, 'KLAR_ATT_TRYCKA');
  assert.equal(refreshed.json.refresh, null);
});

test('a draft follows the anchor Jakob approves in Material, and shows what its picture was', async (t) => {
  const { root, call, files } = await lab(t);
  const made = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  assert.equal(made.order.pictures[0].label, 'Paows A1 · kandidat 2');
  assert.deepEqual(made.made, [made.order.id]);
  const media = await mediaRoles(root).answer();
  const decided = await call('PUT', '/api/media/paow-vila-ung-1/state', { body: { state: 'gäller' }, match: media.revision! });
  assert.equal(decided.status, 200);
  assert.deepEqual(decided.json.followed, [made.order.id], "the dealer's drafts followed at once");
  const after = (await call('GET', `/api/orders/${made.order.id}`)).json;
  const anchor = after.order.pictures[0];
  assert.equal(anchor.sha256, sha(files['paow-vila-ung-1']));
  assert.equal(anchor.label, 'Paows A1');
  assert.deepEqual(anchor.replaced, { at: '2026-11-12T21:00:00.000Z', was: 'Paows A1 · kandidat 2 (Vila, kandidat 2)', entry: 'paow-vila-ung-2', sha256: sha(files['paow-vila-ung-2']) });
  assert.equal(after.warnings.length, 0, 'the anchor holds now');
  assert.equal(after.refresh, null);
  // The same candidate approved: only the words change.
  const other = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.2', base: 'paow-vila-ung-1' } })).json;
  assert.equal(other.order.pictures[0].label, 'Paows A1', 'made after the approval');
  assert.equal((await call('POST', `/api/orders/${made.order.id}/approve`, { match: after.revision })).status, 200);
});

test('a deal: the hand, handbyte and how the card lands, defaulted from the plan; "Alla sju" makes one draft per seat', async (t) => {
  const { call } = await lab(t);
  const list = (await call('GET', '/api/orders')).json;
  assert.deepEqual(list.dealers.map((d: { id: string }) => d.id), ['ada', 'paow']);
  assert.match(list.dealers[1].look, /black tailored blazer/);
  const seats = list.plan.seats;
  const crossing = Object.values(seats as Record<string, { target: string; crosses: boolean }>).filter((s) => s.crosses).map((s) => s.target).sort();
  assert.deepEqual(crossing, ['P1.C1', 'P1.C2', 'P2.C1', 'P2.C2', 'P3.C1', 'P3.C2']);
  assert.deepEqual([seats['P4.C1'].side, seats['P4.C1'].hand, seats['P4.C1'].pass], ['FRONT', 'LH', false]);

  // One seat, from the plan: left all the way, open; the text is the sheet's text for the same choices.
  const one = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P1.C1', ...TUR_WAN } })).json;
  const m = one.order.motion;
  // The hand and the side from the plan; the turn from the recipe (a drag turns close to its place, handbook §5).
  assert.deepEqual([m.hand, m.pass, m.side, m.turn, m.fromPlan, m.flipAxis], ['LH', false, 'FRONT', true, true, 'AT_PLACE']);
  assert.match(one.order.notes.join(' '), /Undantag från receptet: modell WAN 3 i stället för Kling 4; tur och retur i stället för bara dit; ingen referensfilm fast receptet vill ha en; 6 s i stället för 3 s; 2 tagningar i stället för 1\./, 'every exception is named in the draft');
  assert.equal(one.order.title, 'Paow · Släp, ett kort till platsen · A3P1C1 · tur och retur · WAN 3', 'the title says the exception, and no deal is named "och tillbaka" any more; the card in his notation (2026-11-21)');
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
  assert.equal(closed.order.pictures[1].label, 'Slutbild · samma + kortet stängt på plats 2');
  assert.match(closed.order.prompt.text, /where her other hand takes it by its edges/);
  assert.equal(closed.order.summary, 'Gör en film av Paow: ett kort från ankare 2.2 till plats 2, tur och retur.', 'the line says what the film goes between; the hands are said by the text that is sent');
  const changed = (await call('PUT', `/api/orders/${closed.order.id}`, { body: { hand: 'RH', side: 'FRONT' }, match: closed.revision })).json;
  const d = changed.order.motion;
  assert.deepEqual([d.hand, d.pass, d.side, d.turn, d.flipAxis], ['RH', false, 'FRONT', true, 'FREE'], 'opened again: the turn the plan suggests');
  assert.equal(changed.order.summary, 'Gör en film av Paow: ett kort från ankare 2.2 till plats 2, tur och retur.');
  assert.match(changed.order.prompt.text, /Her hand at the shoe lets go of the card and waits beside the shoe, and her other hand reaches across/);
  assert.equal(changed.order.pictures[1].label, 'Slutbild · samma + kortet öppet på plats 2');
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
  // The step's group in Jakob's notation since 2026-11-21 ("Giv från A2.2"), its first letter small in the group's name.
  assert.equal(orders[0].order.group!.label, 'Paow · giv från A2.2 · alla sju');
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
  assert.match(chosen.notes.join(' '), /vändningen "Vänd vid platsen" i stället för "Handleden vänder kortet på vägen"/);
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

test('the MINIMAL two-hand deal accepts the H24 long-edge reference', async (t) => {
  const { root, call, files } = await lab(t);
  const media = register();
  const a3 = { id: 'paow-a3-p4', role: 'landning', name: 'A3P4C1', path: 'assets/anchors/paow-a3-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'kandidat' };
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
    body: { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', shape: 'ONE_WAY', style: 'MINIMAL', flipAxis: 'LONG_EDGE', reference: id, end: a3.id },
  });
  assert.equal(result.status, 201, result.json.error);
  const { order } = result.json;
  assert.deepEqual([order.prompt.style, order.motion.flipAxis, order.reference.clips, order.reference.sha256], ['MINIMAL', 'LONG_EDGE', [id], sha(film)]);
  assert.doesNotMatch(order.prompt.text, /short end/);
  assert.deepEqual(await readFile(path.join(root, order.reference.path)), film);
});

test('a deal with no last picture (end: null): the reference film shows the way, the text names no last frame, the seat needs no A3 yet', async (t) => {
  const { root, call, request } = await lab(t);
  // An anchor 2.3 that holds, so that the first picture does not wait and the draft can be approved.
  const media = register();
  media.dealers.paow.entries.push({ id: 'paow-2-3', role: 'ankare-2.3', name: 'Ankare 2.3', path: 'assets/anchors/paow-vila-ung-2/anchor.png', node: 'READY-C', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(media));
  const id = 'docka-2-3-p4c2-svep24d';
  const ref = `assets/references/docka/${id}/source.mp4`;
  const film = Buffer.from('three seconds of the dummy laying the second card');
  await mkdir(path.dirname(path.join(root, ref)), { recursive: true });
  await writeFile(path.join(root, ref), film);
  await writeFile(path.join(root, 'data/rendered-references.json'), JSON.stringify({
    schemaVersion: 1, films: [{ id, edge: 'READY-C>P4.C2', path: ref, sha256: sha(film), seconds: 3, lays: 'RH', check: null }],
  }));
  // Bara dit is said: the recipe of the deal from 2.3 is giv och återgång in one film since 2026-11-24.
  const input = { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C2', shape: 'ONE_WAY', side: 'FRONT' };
  // Nothing said about the last picture: the seat has none yet, so the draft is made without one (changed 2026-11-23: a
  // seat with no end picture yet stops no deal), the same draft as the one that asks for none.
  const plain = await request('POST', '/api/orders/preview', { body: input });
  assert.equal(plain.status, 200, plain.json.error);
  const asked = await request('POST', '/api/orders/preview', { body: { ...input, end: null } });
  assert.equal(asked.status, 200, asked.json.error);
  const said = (o: { pictures: { goesAs: string }[]; prompt: { text: string }; notes: string[]; reference: { clips?: string[] } }) => [o.pictures.map((p) => p.goesAs), o.prompt.text, o.notes, o.reference.clips];
  assert.deepEqual(said(plain.json.orders[0]), said(asked.json.orders[0]));
  assert.deepEqual([plain.json.orders[0].pictures.map((p: { goesAs: string }) => p.goesAs), plain.json.orders[0].reference.clips], [['startFrame'], [id]]);
  assert.doesNotMatch(plain.json.orders[0].prompt.text, /last frame|last picture/i);
  for (const template of [12, 13]) {
    const made = await call('POST', '/api/orders', { body: { ...input, end: null, reference: id, template } });
    assert.equal(made.status, 201, made.json.error);
    const { order } = made.json;
    assert.deepEqual(order.pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame']);
    assert.deepEqual(order.reference.clips, [id]);
    assert.equal(order.prompt.template, `film-giv-kort@${template}`);
    assert.doesNotMatch(order.prompt.text, /last frame|last picture/i);
    assert.match(order.prompt.text, /^Locked camera, one continuous shot. Video 1 shows only the movement/);
    assert.ok(order.notes.some((n: string) => /utan sista bild: .*A3P4C2 görs efteråt ur filmens sista ruta/.test(n)), order.notes.join('\n'));
    // Changed and written again, it stays without a last picture and its text with it.
    const changed = await call('PUT', `/api/orders/${order.id}`, { body: { takes: 2 }, match: made.json.revision });
    assert.equal(changed.status, 200, changed.json.error);
    assert.equal(changed.json.order.prompt.text, order.prompt.text);
    // It is approved like any draft, and its call sends a first picture and no last one.
    const approved = await call('POST', `/api/orders/${order.id}/approve`, { match: changed.json.revision });
    assert.equal(approved.status, 200, approved.json.error);
    assert.equal(approved.json.order.status, 'GODKÄND');
    const args = requestOf(approved.json.order, 1).args;
    assert.ok('startFrame' in args && !('endFrame' in args) && 'referenceVideos' in args, JSON.stringify(Object.keys(args)));
  }
  // Without a reference film too the draft is made (changed 2026-11-23: the reference film is a choice, never a condition):
  // only the first picture goes, the notes say that it and the text alone tell where the card goes, and the text points at
  // no last frame and no film. Only a deal bara dit goes without a last picture.
  const blind = await request('POST', '/api/orders/preview', { body: { ...input, end: null, reference: null } });
  assert.equal(blind.status, 200, blind.json.error);
  const lone = blind.json.orders[0];
  assert.deepEqual([lone.pictures.map((p: { goesAs: string }) => p.goesAs), lone.reference.status], [['startFrame'], 'INGEN']);
  assert.ok(lone.notes.includes('Varken sista bild eller referensfilm går med: bara första bilden och texten säger vart kortet ska (plats 4, kort 2).'), lone.notes.join('\n'));
  assert.doesNotMatch(lone.prompt.text, /last frame|last picture|video 1/i);
  const entry = await request('POST', '/api/orders/preview', { body: { dealer: 'paow', step: 'INGANG-2.3', end: null } });
  assert.equal(entry.status, 400);
  assert.match(entry.json.error, /bara för en giv bara dit/);
  assert.equal(newOrderOf(['paow', 'A2.3 - A3P4C2', '--no-end']).input.end, null);
  assert.throws(() => newOrderOf(['paow', 'A2.3 - A3P4C2', '--no-end', '--end', 'x']), /Välj --end eller --no-end/);
});

test('C2 two-hand drafts store the actual handoff, and a change that asks for another hand keeps it', async (t) => {
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
});

// Changed in round two (2026-11-21): the return ends on anchor 2.3 with the card drawn where the plan lays it, is written
// with template 13, finds the deal it continues when the order names none, and one take (a trial) can be approved; a series
// cannot until the trial has held.
test('the return to 2.3 copies the preceding deal’s RH ending, ends on the anchor with the card drawn, and only a trial is approved', async (t) => {
  const { root, call, request, files } = await lab(t);
  const media = register();
  const ready = { id: 'paow-ankare-2-3-a', role: 'ankare-2.3', name: 'Ankare 2.3', path: 'assets/anchors/paow-ankare-2-3-a/anchor.png', node: 'READY-C', state: 'gäller' };
  const a3 = { id: 'paow-a3-p4', role: 'landning', name: 'A3P4C1', path: 'assets/anchors/paow-a3-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'kandidat' };
  const left = { ...a3, id: 'paow-a3-p4-lh', hand: 'LH' };
  const different = { ...a3, id: 'paow-a3-p4-other' };
  // Another anchor 2.3, approved in Material after the draft is made.
  const readyNew = { ...ready, id: 'paow-ankare-2-3-b', name: 'Ankare 2.3 ny', path: 'assets/anchors/paow-ankare-2-3-b/anchor.png', state: 'kandidat' };
  media.dealers.paow.entries.push(ready, a3, left, different, readyNew);
  const registerFile = path.join(root, 'data/media-roles.json');
  await writeFile(registerFile, JSON.stringify(media));
  const readyBytes = files['paow-vila-ung-2'], a3Bytes = files['paow-nyp-ny'];
  for (const [entry, bytes] of [[ready, readyBytes], [a3, a3Bytes], [readyNew, files['paow-vila-ung-1']]] as const) {
    const file = path.join(root, entry.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  if (!(await texture(root))) return t.skip(NO_TEXTURE);

  const deal = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', shape: 'ONE_WAY', end: a3.id, side: 'FRONT', reference: null } });
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
  assert.deepEqual(order.pictures.map((p: { from: { entry: string } }) => p.from.entry), [a3.id, ready.id]);
  assert.equal(order.pictures[0].sha256, last.sha256);
  assert.equal(order.pictures[0].from.path, last.path);
  // The last picture: anchor 2.3 with the card drawn in the plan's quad for the seat, not the bare anchor.
  assert.notEqual(order.pictures[1].sha256, sha(readyBytes));
  assert.ok(order.pictures[1].drawn && order.pictures[1].from.built, JSON.stringify(order.pictures[1].from));
  assert.match(order.pictures[1].label, /Slutbild · Paows A2\.3 \+ kortet öppet på plats 4/);
  assert.equal(order.prompt.template, 'film-retur-kort@13');
  assert.match(order.prompt.text, /lifts off it, and the card stays where it lies.*glides back low over the felt.*as in the last frame\.$/i);
  assert.ok(order.notes.includes(recipeNote('retur-2.3')), order.notes.join('\n'));
  // Naming neither the candidate nor the deal: the last approved deal to the seat whose frozen last picture is one.
  const found = await preview({ dealer: 'paow', step: 'RETUR-2.3', target: 'P4.C1' });
  assert.equal(found.status, 200, found.json.error);
  assert.deepEqual(found.json.orders[0].pictures.map((p: { sha256: string }) => p.sha256), order.pictures.map((p: { sha256: string }) => p.sha256));

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
  assert.equal(sha(await readFile(path.join(root, persisted.pictures[1].path))), order.pictures[1].sha256);
  // The saved draft keeps the hand and the side of its first picture, as the preview does.
  for (const changes of [{ side: 'BACK' }, { hand: 'LH' }, { pass: true }]) {
    const refused = await call('PUT', `/api/orders/${persisted.id}`, { body: changes, match: saved.json.revision });
    assert.equal(refused.status, 400, JSON.stringify(changes));
    assert.match(refused.json.error, /En retur följer sin första bild/);
  }
  // Fetching the pictures again says the card once; the queue names the A3 by its name in Material, and the last picture,
  // the anchor with the card drawn, by its own words.
  const fetched = await call('POST', `/api/orders/${persisted.id}/refresh`, { match: saved.json.revision });
  assert.equal(fetched.status, 200, fetched.json.error);
  assert.equal(fetched.json.order.pictures[1].label, persisted.pictures[1].label);
  const queued = (await call('GET', '/api/orders')).json.orders.find((a: { order: { id: string } }) => a.order.id === persisted.id);
  assert.deepEqual(queued.order.pictures.map((p: { named: string | null }) => p.named), ['A3P4C1', null]);
  // Jakob approves another anchor 2.3 in Material: the return ends on it, with the card drawn anew.
  const decided = await call('PUT', `/api/media/${readyNew.id}/state`, { body: { state: 'gäller' }, match: (await mediaRoles(root).answer()).revision! });
  assert.equal(decided.status, 200, decided.json.error);
  assert.ok(decided.json.followed.includes(persisted.id), JSON.stringify(decided.json.followed));
  const moved = (await call('GET', `/api/orders/${persisted.id}`)).json;
  const end = moved.order.pictures[1];
  assert.equal(end.from.entry, readyNew.id);
  assert.ok(end.from.built && end.drawn, JSON.stringify(end.from));
  assert.equal(end.replaced.entry, ready.id);
  assert.notEqual(end.sha256, persisted.pictures[1].sha256);
  assert.equal(end.label, 'Slutbild · Paows A2.3 + kortet öppet på plats 4');
  assert.equal(moved.refresh, null);
  assert.ok(!moved.warnings.some((w: string) => w.startsWith('Slutbild')), moved.warnings.join('\n'));
  // The trial is approved as any order is: the recipe gives its one take, and the pilot rule (src/order-ways.ts) the next order.
  const approvedTrial = await call('POST', `/api/orders/${persisted.id}/approve`, { match: moved.revision });
  assert.equal(approvedTrial.status, 200, approvedTrial.json.error);
  assert.equal(approvedTrial.json.order.status, 'GODKÄND');
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
  assert.equal(o.title, 'Paow · Från vila till nypet · Kling 4', 'another model than the recipe\'s is said in the title');
  assert.ok(o.notes.join(' ').includes(`${recipeNote('ingang-2.1')} Undantag från receptet: modell Kling 4 i stället för WAN 3; 1 tagningar i stället för 2.`), o.notes.join('\n'));
  assert.deepEqual(o.pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame', 'endFrame']);
  assert.equal(o.reference.status, 'INGEN');
  // None asked for: the recipe's model, resolution and length.
  const own = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'INGANG-2.1', takes: 1 } })).json.order;
  assert.deepEqual([own.generation.model, own.generation.params], ['wan3', { resolution: '1080p', duration: 4, ratio: 'adaptive', generateAudio: false }]);
  assert.equal(own.title, 'Paow · Från vila till nypet');
  // A deal from 2.1 with WAN 3 gets WAN's ratio and no sound.
  const deal = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', ...TUR, model: 'wan3' } })).json.order;
  assert.deepEqual(deal.generation.params, { resolution: '1080p', duration: 7, ratio: 'adaptive', generateAudio: false });
  for (const [body, why] of [
    [{ dealer: 'paow', step: 'INGANG-2.1', model: 'nano-banana-pro' }, /kan inte göra Från vila till nypet: välj kling-4, wan3\.$/],
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
  // Paow's anchor 2.1 and a landing picture for seat 4 hold; the bank has another dealer's (Ada's) approved deal to seat 4, which is the deal alone.
  const register = JSON.parse(await readFile(path.join(root, 'data/media-roles.json'), 'utf8'));
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-nyp-ny').state = 'gäller';
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-vila-ung-2').state = 'gäller';
  register.dealers.paow.entries.push({ id: 'paow-landning-p4', role: 'landning', name: 'Plats 4, landning', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const landing = await picture(3, 233, 48);
  await mkdir(path.join(root, 'assets/anchors/paow-landning-p4'), { recursive: true });
  await writeFile(path.join(root, 'assets/anchors/paow-landning-p4/anchor.png'), landing);
  const film = Buffer.from('a film of four seconds');
  await mkdir(path.join(root, 'assets/motions/ada-p4-c1-plan-deal-02'), { recursive: true });
  await writeFile(path.join(root, 'assets/motions/ada-p4-c1-plan-deal-02/source.mp4'), film);
  const straight = { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-11: Det ser bra ut.' };
  const jobs = [{ id: 'ada-p4-c1-plan-deal-02', from: 'READY', to: 'RELEASE(P4.C1)', duration: 4, dealer: 'ada' }, { id: 'ada-kort-01', from: 'READY', to: 'LAND(P4.C1)', duration: 2 }];
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({ jobs }));
  post(root, 'ada-p4-c1-plan-deal-02', { source: { frames: 120, fps: 30, sha256: sha(film) }, review: straight });
  post(root, 'ada-kort-01', { source: { frames: 60, fps: 30 } });
  if (!(await texture(root))) return t.skip(NO_TEXTURE);

  // A return has no method yet: nothing is defaulted, and the one who orders says the model and the length.
  const bare = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1' } });
  assert.equal(bare.status, 400);
  assert.match(bare.json.error, /^Tillbaka till nypet har ingen metod än \(data\/order-methods\.json\), så inget är förvalt: säg modell \(kling-4, wan3\) och längd själv\.$/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1', model: 'wan3' } })).json.error, /säg längden själv \(2–30 s för WAN 3\)/);
  const back = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1', model: 'wan3', duration: 3 } });
  assert.equal(back.status, 201);
  const r = back.json.order;
  assert.deepEqual([r.step.edge, r.step.shape, r.step.cutInto, r.generation.model, r.generation.params.duration, r.takes, r.cost.total], ['P4.C1>READY', 'ONE_WAY', ['P4.C1>READY'], 'wan3', 3, 1, 60]);
  // Changed 2026-11-21 (round two): a return ends on its anchor with the card drawn where it stays, not on the bare anchor.
  assert.deepEqual(r.pictures.map((p: { name: string; label: string; from: { entry: string } }) => [p.name, p.label, p.from.entry]), [['first.png', 'Första bild · Paows landning på plats 4', 'paow-landning-p4'], ['last.png', 'Slutbild · Paows A2.1 + kortet öppet på plats 4', 'paow-nyp-ny']]);
  assert.ok(r.pictures[1].drawn, 'the card is drawn on the last picture');
  assert.equal(r.pictures[0].sha256, sha(landing));
  assert.deepEqual([r.motion.turn, r.motion.side], [false, 'FRONT']);
  for (const part of ['Locked camera', 'blue card', 'shoe']) assert.ok(r.prompt.text.includes(part), `the return's text names ${part}`);
  assert.deepEqual(r.notes, ['Inget recept finns för Tillbaka till nypet: varje värde är valt för den här beställningen.']);
  assert.equal(back.json.shown, 'KLAR_ATT_TRYCKA');
  assert.equal(back.json.refresh, null);
  // A return made while its anchor is only a candidate waits for it; approved in Material, the anchor comes with the card drawn.
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-nyp-ny').state = 'kandidat';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const waiting = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'RETUR-2.1', target: 'P4.C1', model: 'wan3', duration: 3 } });
  assert.equal(waiting.status, 201, waiting.json.error);
  assert.deepEqual([waiting.json.order.pictures[1].path, waiting.json.order.pictures[1].waits?.role], [null, 'ankare-2.1']);
  const anchored = await call('PUT', '/api/media/paow-nyp-ny/state', { body: { state: 'gäller' }, match: (await mediaRoles(root).answer()).revision! });
  assert.equal(anchored.status, 200, anchored.json.error);
  assert.ok(anchored.json.followed.includes(waiting.json.order.id), JSON.stringify(anchored.json.followed));
  const arrived = (await call('GET', `/api/orders/${waiting.json.order.id}`)).json.order.pictures[1];
  assert.deepEqual([arrived.from.entry, !!arrived.from.built, !!arrived.drawn, arrived.label], ['paow-nyp-ny', true, true, 'Slutbild · Paows A2.1 + kortet öppet på plats 4']);
  assert.equal(arrived.sha256, r.pictures[1].sha256, 'the same anchor with the same card as the return made while it held');
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-nyp-ny').state = 'gäller';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));

  // THE LINE: the dealer, the step and the card. Everything else is the recipe: Kling 4, 1080p, bara dit, one take (a
  // trial), the seat's own end picture, the reference film its rule finds, and the film as long as that reference.
  const line = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(line.status, 201);
  const f = line.json.order;
  assert.deepEqual([f.step.shape, f.step.cutInto, f.title, f.summary], ['ONE_WAY', ['READY>P4.C1'], 'Paow · Nyp, ett kort till platsen · A3P4C1', 'Gör en film av Paow: ett kort från ankare 2.1 till plats 4, bara dit.']);
  assert.deepEqual(f.generation, { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 4 } }, 'the reference film is 4 s, and so is the film');
  assert.deepEqual([f.takes, f.prompt.style, f.prompt.template, f.motion.flipAxis, f.motion.hand, f.motion.pass], [1, 'KORT', 'film-giv-kort@12', 'FREE', 'LH', false]);
  assert.deepEqual(f.pictures.map((p: { name: string; label: string; sha256: string }) => [p.name, p.label, p.sha256]), [['first.png', 'Första bild · Paows A2.1', sha(files['paow-nyp-ny'])], ['last.png', 'Slutbild · Paows landning på plats 4', sha(landing)]], 'seat 4 ends on seat 4\'s own landing picture');
  assert.deepEqual([f.reference.status, f.reference.clips, f.reference.path, f.reference.sha256, f.reference.seconds, f.reference.dealer, f.reference.approvedStraight, f.reference.from.verdict, f.reference.from.words], ['FINNS', ['ada-p4-c1-plan-deal-02'], `assets/orders/${f.id}/reference.mp4`, sha(film), 4, 'ada', true, 'GODKÄND', 'Det ser bra ut.']);
  assert.equal((await call('GET', `/${f.reference.path}`)).bytes!.equals(film), true, 'the film is copied byte for byte');
  for (const part of ['Locked camera', 'video 1', 'yellow card', 'blue side up', 'last frame']) assert.ok(f.prompt.text.includes(part), `the deal's text names ${part}`);
  assert.deepEqual(f.notes, [recipeNote('giv-2.1-mitten')], 'the recipe and nothing against it');
  assert.equal(f.cost.perTake, 86, '21,5 per s × 4 s');
  assert.deepEqual(line.json.problems, [], 'another dealer\'s film is allowed as a reference');

  // The plan may say handbyte for the card (Jakob's saved plan did for seat 4, 2026-11-18): the line still orders the hand at
  // the shoe, which is what the trials tried, and what Placering said is not lost: fromPlan is false. A handbyte is an exception.
  const planFile = path.join(root, 'placements/default.json'), plan = JSON.parse(await readFile(planFile, 'utf8'));
  Object.assign(plan.targets['P4.C1'].intent, { pass: true });
  await writeFile(planFile, JSON.stringify(plan, null, 2) + '\n');
  const planned = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.order;
  assert.deepEqual([planned.motion.hand, planned.motion.pass, planned.motion.fromPlan, planned.reference.clips, planned.notes], ['LH', false, false, ['ada-p4-c1-plan-deal-02'], [recipeNote('giv-2.1-mitten')]]);
  assert.equal(planned.prompt.text, f.prompt.text, 'the same text as with a plan that says the hand at the shoe');
  Object.assign(plan.targets['P4.C1'].intent, { pass: false });
  await writeFile(planFile, JSON.stringify(plan, null, 2) + '\n');
  // The same seat a second time gives the same order: nothing in it depends on which page asked.
  const again = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.order;
  assert.deepEqual([again.generation, again.prompt.text, again.reference.clips, again.takes], [f.generation, f.prompt.text, f.reference.clips, f.takes]);

  // A seat whose rule finds no reference film is ordered without one (changed 2026-11-23: the reference film is a choice,
  // never a condition), and the draft's notes say what was not there.
  register.dealers.paow.entries.push({ id: 'paow-landning-p1', role: 'landning', name: 'Plats 1, landning', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P1.C1)', card: 'P1.C1', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const far = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P1.C1' } });
  assert.equal(far.status, 201, far.json.error);
  assert.deepEqual([far.json.order.reference.status, far.json.order.notes], ['INGEN', [recipeNote('giv-2.1-ytter'), 'Undantag från receptet: ingen referensfilm: dockan har ingen film till platsen som passar.']]);
  assert.doesNotMatch(far.json.order.prompt.text, /Video 1/);
  // A handbyte lays the card with the right hand, and a landing picture holds for one hand: seat 4's is for the left, so the
  // seat has no end picture for it, and the deal is made without a last picture (changed 2026-11-23: a seat with no end
  // picture yet stops no deal); the left hand's picture never stands in. Read as a preview: nothing is written.
  const pass = await call('POST', '/api/orders/preview', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', pass: true } });
  assert.equal(pass.status, 200, pass.json.error);
  assert.deepEqual(pass.json.orders[0].pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame']);
  assert.ok(pass.json.orders[0].notes.some((n: string) => /utan sista bild: .*A3P4C1 görs efteråt ur filmens sista ruta/.test(n)), pass.json.orders[0].notes.join('\n'));
  // With one for the right hand the handbyte ends on it: the bank's one-hand deal is no reference film for it, so it goes
  // without one, and the notes say that and the hand.
  register.dealers.paow.entries.push({ id: 'paow-landning-p4-rh', role: 'landning', name: 'Plats 4, landning, höger hand', path: 'assets/anchors/paow-landning-p4/anchor.png', node: 'LAND(P4.C1)', card: 'P4.C1', hand: 'RH', state: 'gäller' });
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const passRef = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', pass: true } });
  assert.equal(passRef.status, 201, passRef.json.error);
  assert.equal(passRef.json.order.reference.status, 'INGEN');
  assert.match(passRef.json.order.notes[1], /^Undantag från receptet: ingen referensfilm: varken dockan eller en rakt godkänd giv har en film till platsen som passar \(lagd med höger hand\); handbyte i stället för /);
  register.dealers.paow.entries.pop();
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));

  // The exceptions, each said in the draft: no reference film (then the recipe's 3 s), another model, tur och retur.
  const none = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: null } })).json.order;
  assert.deepEqual([none.reference.status, none.generation.params.duration, none.cost.perTake], ['INGEN', 3, 64]);
  assert.deepEqual(none.notes, [recipeNote('giv-2.1-mitten'), 'Undantag från receptet: ingen referensfilm fast receptet vill ha en.']);
  assert.doesNotMatch(none.prompt.text, /Video 1/);
  const wanAnswer = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', model: 'wan3' } });
  assert.equal(wanAnswer.status, 201, wanAnswer.json.error);
  const wan = wanAnswer.json.order;
  assert.deepEqual([wan.title, wan.reference.status, wan.generation.params.duration], ['Paow · Nyp, ett kort till platsen · A3P4C1 · WAN 3', 'INGEN', 3]);
  assert.match(wan.notes[1], /^Undantag från receptet: modell WAN 3 i stället för Kling 4; ingen referensfilm fast receptet vill ha en\.$/);
  // (Tur och retur as an exception, with its title and its notes: the test of the hand and "Alla sju" above.)
  // The last picture of a deal bara dit shows a hand and a side: they are not changed on the draft.
  assert.match((await call('PUT', `/api/orders/${f.id}`, { body: { hand: 'RH' }, match: line.json.revision })).json.error, /Slutbilden är platsens egen, som visar handen och kortets sida/);

  // A reference film named outright: only for a model that takes one, of a length it takes, and from the bank.
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', model: 'wan3', reference: 'ada-p4-c1-plan-deal-02' } })).json.error, /WAN 3 tar ingen referensfilm/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: 'ada-kort-01' } })).json.error, /Referensfilmen är 2 s; Kling 4 tar 3–30 s/);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: 'nobody' } })).json.error, /nobody finns inte bland bankens tagningar/);

  // No landing picture holds for the seat any more (set aside in Material): the seat ends on the cut frame of Paow's own
  // round trip to the seat, where the return Jakob approved straight begins. The frame is checked as a picture first.
  register.dealers.paow.entries.find((e: { id: string }) => e.id === 'paow-landning-p4').state = 'ersatt';
  await writeFile(path.join(root, 'data/media-roles.json'), JSON.stringify(register, null, 2));
  const trip = (clip: string, cut: number) => [{ id: `${clip}-deal`, from: 'READY', to: 'P4.C1', clip, frames: [0, cut], dealer: 'paow' }, { id: `${clip}-return`, from: 'P4.C1', to: 'READY', clip, frames: [cut + 1, cut + 60], dealer: 'paow' }];
  await writeFile(path.join(root, 'data/clip-jobs.json'), JSON.stringify({ jobs, derived: [...trip('paow-giv-2-1-p4-04-01', 108), ...trip('paow-giv-2-1-p4-08-01', 133)] }));
  for (const clip of ['paow-giv-2-1-p4-04-01', 'paow-giv-2-1-p4-08-01']) {
    post(root, clip, { source: { frames: 169, fps: 24 } });
    post(root, `${clip}-return`, { review: { ...straight, userReview: 'Jakob 2026-11-13: Bra retur.' }, motion: { releaseHand: 'LH' } });
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
  assert.deepEqual([last.label, last.from.path, last.from.frame, last.from.cut], ['Slutbild · snittruta 133 ur paow-giv-2-1-p4-08-01', 'assets/motions/paow-giv-2-1-p4-08-01/source.mp4', 133, { clip: 'paow-giv-2-1-p4-08-01', frame: 133, ret: 'paow-giv-2-1-p4-08-01-return', shoeFrom: 'paow-vila-ung-2' }]);
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
  // The frozen order is the pilot of its way (src/order-ways.ts): Jakob approves its film himself, so the way holds and the
  // orders made the same way below are approved on their own merits.
  post(root, `${again.id}-01`, { order: { id: again.id, take: 1 }, review: straight });
  const frozenFile = path.join(root, `data/orders/${again.id}.json`);
  const frozenBytes = await readFile(frozenFile);
  const archive = { by: 'Jakob', at: '2026-11-18T00:00:00Z', where: 'Karta' };
  for (const id of [last.from.cut.ret, last.from.cut.clip, `${last.from.cut.clip}-deal`]) {
    const before = await readFile(postsFile(root));
    post(root, id, { ...(motionRegister(root).get(id) ?? {}), review: { ...straight, archived: archive } });
    const blocked = await call('POST', `/api/orders/${c.id}/approve`, { match: cut.json.revision });
    await writeFile(postsFile(root), before); // the register as it was: the layer follows its text
    assert.equal(blocked.status, 409, `cut-frame provenance ${id}`);
    assert.match(blocked.json.error, /snittrutan.*arkiverad/i);
  }
  const cutSource = postsFile(root), cutSourceBefore = await readFile(cutSource);
  await writeFile(cutSource, '{\n');
  const unreadableCut = await call('POST', `/api/orders/${c.id}/approve`, { match: cut.json.revision });
  assert.equal(unreadableCut.status, 409);
  assert.match(unreadableCut.json.error, /Arkivstatus.*snittrutan/i);
  await writeFile(cutSource, cutSourceBefore);
  const bankFile = path.join(root, 'data/clip-jobs.json'), bankBefore = await readFile(bankFile, 'utf8');
  const bank = JSON.parse(bankBefore), referencePart = 'ada-archived-return';
  const correctedId = 'ada-p4-c1-plan-deal-02-fixed';
  bank.edits = [...(bank.edits ?? []), {id: correctedId, source: {clip: f.reference.from.film}, dealer: 'ada'}];
  const correctedPath = path.join(root, 'assets/motions', correctedId, 'source.mp4');
  const correctedFilm = Buffer.from('a corrected copy of the four-second film');
  await mkdir(path.dirname(correctedPath), {recursive: true});
  await writeFile(correctedPath, correctedFilm);
  post(root, correctedId, {source: {frames: 120, fps: 30, sha256: sha(correctedFilm)}});
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
  bank.derived.push({ id: referencePart, clip: f.reference.from.film, from: 'P4.C1', to: 'READY', frames: [80, 119], dealer: 'ada' });
  await writeFile(bankFile, JSON.stringify(bank));
  post(root, referencePart, { review: { archived: archive } });
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

  // Where no cut frame holds as a picture, the draft is refused with what each lacks; and an archived take gives none, so
  // the seat has no end picture and the deal is made without a last picture (changed 2026-11-23). Read as a preview.
  frames.of = async () => frame(40);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).json.error, /^Plats 4 har ingen slutbild som håller: paow-giv-2-1-p4-04-01 ruta 108: kortet ligger 40 px från planens; paow-giv-2-1-p4-08-01 ruta 133: kortet ligger 40 px från planens\.$/);
  for (const clip of ['paow-giv-2-1-p4-04-01', 'paow-giv-2-1-p4-08-01']) post(root, `${clip}-return`, { review: { ...straight, archived: { by: 'Jakob', at: '2026-11-18T00:00:00Z', where: 'Karta' } } });
  const noCut = await call('POST', '/api/orders/preview', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(noCut.status, 200, noCut.json.error);
  assert.deepEqual(noCut.json.orders[0].pictures.map((p: { goesAs: string }) => p.goesAs), ['startFrame'], 'an archived take is no last frame');
  // An archived take is no reference film either.
  post(root, 'ada-p4-c1-plan-deal-02', { source: { frames: 120, fps: 30, sha256: sha(film) }, review: { ...straight, archived: { by: 'Jakob', where: 'Karta' } } });
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
  // The line is then ordered without a reference film, and says so; the archived take cannot be named.
  const unreferenced = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(unreferenced.status, 201, unreferenced.json.error);
  assert.deepEqual([unreferenced.json.order.reference.status, unreferenced.json.order.notes], ['INGEN', [recipeNote('giv-2.1-mitten'), 'Undantag från receptet: ingen referensfilm: varken dockan eller en rakt godkänd giv har en film till platsen som passar.']]);
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference: 'ada-p4-c1-plan-deal-02' } })).json.error, /finns inte bland bankens tagningar/);
  // A changed film in the bank is not copied.
  post(root, 'ada-p4-c1-plan-deal-02', { source: { frames: 120, fps: 30, sha256: sha(film) }, review: straight });
  await writeFile(path.join(root, 'assets/motions/ada-p4-c1-plan-deal-02/source.mp4'), 'another film');
  assert.equal((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } })).status, 409);

  // The dummy's rendered film for the seat (data/rendered-references.json) comes before the bank's take, and is copied from its own folder.
  const docka = Buffer.from('the dummy dealing to seat four');
  await mkdir(path.join(root, 'assets/references/docka/docka-giv-p4-4'), { recursive: true });
  await writeFile(path.join(root, 'assets/references/docka/docka-giv-p4-4/source.mp4'), docka);
  await writeFile(path.join(root, 'data/rendered-references.json'), JSON.stringify({ schemaVersion: 1, about: 'test', films: [{ id: 'docka-giv-p4-4', edge: 'READY>P4.C1', path: 'assets/references/docka/docka-giv-p4-4/source.mp4', sha256: sha(docka), seconds: 3.967, fromDeal: 'ada-p4-c1-plan-deal-02' }, { id: 'utanfor', edge: 'READY>P4.C1', path: 'assets/motions/x/source.mp4', sha256: sha(docka), seconds: 4 }] }));
  assert.deepEqual((await call('GET', '/api/orders')).json.rendered.map((x: { id: string }) => x.id), ['docka-giv-p4-4'], 'an entry outside the dummy\'s folder is left out');
  // The lab hands that film out, so that a row plays it where the reference film is chosen; and nothing else: no film the
  // register does not list, no other file of a listed film's folder, nothing of the bank.
  const played = await request('GET', '/assets/references/docka/docka-giv-p4-4/source.mp4');
  assert.deepEqual([played.status, played.bytes], [200, docka]);
  await mkdir(path.join(root, 'assets/references/docka/olistad'), { recursive: true });
  await writeFile(path.join(root, 'assets/references/docka/olistad/source.mp4'), docka);
  await writeFile(path.join(root, 'assets/references/docka/docka-giv-p4-4/other.mp4'), docka);
  for (const bad of ['/assets/references/docka/olistad/source.mp4', '/assets/references/docka/docka-giv-p4-4/other.mp4', '/assets/references/docka/docka-giv-p4-4/..%2Folistad%2Fsource.mp4', '/assets/motions/x/source.mp4']) assert.equal((await request('GET', bad)).status, 404, bad);
  const withDocka =await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1' } });
  assert.equal(withDocka.status, 201);
  const d = withDocka.json.order;
  assert.deepEqual([d.reference.clips, d.reference.dealer, d.reference.sha256, d.reference.seconds, d.generation.params.duration, d.reference.from.path], [['docka-giv-p4-4'], 'docka', sha(docka), 3.967, 4, 'assets/references/docka/docka-giv-p4-4/source.mp4']);
  assert.equal((await call('GET', `/${d.reference.path}`)).bytes!.equals(docka), true);
  post(root, 'ada-p4-c1-plan-deal-02', { review: { archived: archive } });
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
  await writeFile(registry, registryData);
  for (const clip of [parent, fixed]) {
    const asset = path.join(root, `assets/motions/${clip}/source.mp4`);
    await mkdir(path.dirname(asset), {recursive: true});
    await writeFile(asset, film);
    post(root, clip, {source: {frames: 120, fps: 30, sha256: sha(film)}});
  }
  const posts = postsFile(root), bare = await readFile(posts); // the register with the two films and no verdict
  const input = (reference: string) => ({dealer: 'paow', step: 'GIV-2.1', target: 'P4.C1', reference});
  const preview = (reference: string) => request('POST', '/api/orders/preview', {body: input(reference)});
  const archive = {review: {archived: {by: 'Jakob', where: 'Karta'}}};
  post(root, `${fixed}-return`, archive);
  assert.equal((await preview(parent)).status, 200, 'archiving a corrected copy does not block the original');
  await writeFile(posts, bare);
  const pending = await call('POST', '/api/orders', {body: input(`${fixed}-deal`)});
  assert.equal(pending.status, 201, pending.json.error);
  const address = `/api/orders/${pending.json.order.id}`;
  const approve = () => call('POST', `${address}/approve`, {match: pending.json.revision});

  post(root, `${parent}-return`, archive);
  const blocked = await approve();
  assert.equal(blocked.status, 409, blocked.json.error);
  assert.match(blocked.json.error, /referensfilmen.*arkiverad/i);
  for (const reference of [fixed, `${fixed}-deal`]) assert.equal((await preview(reference)).status, 400, reference);
  await writeFile(posts, bare);

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
  await writeFile(posts, '{\n');
  const invalidMotion = await approve();
  assert.equal(invalidMotion.status, 409);
  assert.match(invalidMotion.json.error, /Arkivstatus.*referensfilmen/i);
  await rm(posts);
  await mkdir(posts);
  const unreadableMotion = await approve();
  assert.equal(unreadableMotion.status, 409);
  assert.match(unreadableMotion.json.error, /Arkivstatus.*referensfilmen/i);
  await rmdir(posts);
  // A missing post can mean there has never been a review: with the register readable again, and no post for the takes, it is approved.
  await writeFile(posts, bare);
  await writeFile(registry, JSON.stringify({jobs: [{id: 'unrelated', from: 'IDLE', to: 'READY'}], derived}));
  const accepted = await approve();
  assert.equal(accepted.status, 200, accepted.json.error);
});

test("whose each picture is: the dealer's own, never another dealer's whole picture", async (t) => {
  const { call } = await lab(t);
  const still = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  assert.deepEqual(still.owners['anchor.png'], { dealer: 'paow', name: 'Paow', part: 'whole' });
  assert.equal(still.problems.length, 0);
  const film = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.2', target: 'P4.C1', ...TUR_WAN } })).json;
  assert.deepEqual([film.owners['first.png'].dealer, film.owners['last.png'].dealer], ['paow', 'paow'], 'what waits is still hers');
  const mixed = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'ada-vila' } })).json;
  assert.match(mixed.problems.join(' '), /Paows A1: bilden är Adas, inte Paows/);
  assert.equal((await call('POST', `/api/orders/${mixed.order.id}/approve`, { match: mixed.revision })).status, 409, 'a mix-up cannot be approved');
});

test('Jakob\'s click through the route is always his: a body saying otherwise is not read', async (t) => {
  const { call } = await lab(t);
  const made = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'ANKARE-2.1', base: 'paow-vila-ung-2' } })).json;
  const approved = await call('POST', `/api/orders/${made.order.id}/approve`, { match: made.revision, body: { by: 'huvudagent', mandate: 'x' } });
  assert.equal(approved.status, 200);
  assert.deepEqual([approved.json.order.approval.by, approved.json.order.approval.mandate], ['jakob', undefined]);
});

test('the steps a round needs: a deal to the hole card, its turn from rest and the way out; and the production list through the routes', async (t) => {
  const { call } = await lab(t);
  // Her anchors are candidates here: every picture waits, and the text says the place from the plan.
  const hole = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'GIV-2.1', target: 'D.C2', ...TUR } })).json;
  assert.equal(hole.order.id, 'paow-giv-2-1-d-c2-01');
  assert.deepEqual([hole.order.step.edge, hole.order.step.cutInto], ['READY>D.C2', ['READY>D.C2', 'D.C2>READY']]);
  assert.deepEqual([hole.order.motion.side, hole.order.motion.turn, hole.order.motion.flipAxis], ['BACK', false, null], 'it lands closed, as the plan says');
  assert.match(hole.order.title, / · A3DC2( · |$)/); // the title names the card in his notation since 2026-11-21
  // Laid on the felt in front of the shoe and slid to its place (template 7: carried, round 6's closed takes tilted).
  for (const part of ['in front of the shoe', 'slides', 'yellow side up', 'last frame']) assert.ok(hole.order.prompt.text.includes(part), `the hole card's text names ${part}`);
  const turn = await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'HALKORT' } });
  assert.equal(turn.status, 201);
  const o = turn.json.order;
  assert.equal(o.id, 'paow-halkort-01');
  assert.deepEqual([o.step.edge, o.step.shape, o.step.cutInto, o.motion], ['IDLE>REVEAL(D.C1)', 'ONE_WAY', [], null]);
  assert.deepEqual(o.pictures.map((p: { name: string; goesAs: string; path: string | null; waits: { label: string } | null }) => [p.name, p.goesAs, p.path, p.waits?.label]), [['first.png', 'startFrame', null, 'ankare 1'], ['last.png', 'endFrame', null, 'ankare 1']]);
  assert.match(o.pictures[0].label, /hålkortet stängt$/);
  assert.match(o.pictures[1].label, /hålkortet öppet$/);
  assert.deepEqual([o.prompt.style, o.prompt.template, o.generation.model, o.generation.params.duration, o.cost.total], ['KORT', 'film-halkort-kort@12', 'wan3', 5, 100]);
  assert.equal(o.takes, 1, 'the hole card\'s turn is still being tried: one take');
  for (const part of ['yellow card', 'last frame', 'thumb']) assert.ok(o.prompt.text.includes(part), `the turn's text names ${part}`);
  assert.equal(turn.json.shown, 'VÄNTAR');
  assert.match((await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'HALKORT', style: 'UTFÖRLIG' } })).json.error, /skrivs KORT eller MINIMAL/);
  const out = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'UTGANG' } })).json.order;
  assert.deepEqual([out.id, out.step.edge, out.pictures.map((p: { waits: { label: string } | null }) => p.waits?.label)], ['paow-utgang-01', 'READY>IDLE', ['ankare 2.1', 'ankare 1']]);
  for (const part of ['Locked camera', 'yellow card', 'shoe\'s window']) assert.ok(out.prompt.text.includes(part), `the way out's text names ${part}`);
  // The way out from the drag: anchor 2.2 to rest, its own id, its anchor 2.2 waited for (none holds in this lab).
  const outDrag = (await call('POST', '/api/orders', { body: { dealer: 'paow', step: 'UTGANG-2.2' } })).json.order;
  assert.deepEqual([outDrag.id, outDrag.step.edge, outDrag.step.cutInto, outDrag.pictures.map((p: { waits: { label: string } | null }) => p.waits?.label)], ['paow-utgang-2-2-01', 'READY-B>IDLE', [], ['ankare 2.2', 'ankare 1']]);
  assert.deepEqual([outDrag.prompt.template, outDrag.generation.model, outDrag.generation.params.duration, outDrag.cost.total], ['film-utgang-kort@12', 'wan3', 4, 80]);
  for (const part of ['Locked camera', 'yellow card', 'shoe\'s window']) assert.ok(outDrag.prompt.text.includes(part), `the way out from the drag names ${part}`);
  assert.match(outDrag.summary, /ankare 2\.2/);

  // The production list: read by anyone of the lab.
  const list = await call('GET', '/api/production?dealer=paow');
  assert.equal(list.status, 200);
  assert.equal(list.json.list.rows.length, 33);
  assert.deepEqual(list.json.list.rows.find((r: { edge: string }) => r.edge === 'IDLE>REVEAL(D.C1)').orders.map((x: { id: string }) => x.id), ['paow-halkort-01'], 'the draft is in flight for its step');
  assert.equal(list.json.list.rows.find((r: { edge: string }) => r.edge === 'IDLE>REVEAL(D.C1)').state, 'UTKAST');
  assert.equal((await call('GET', '/api/production?dealer=nobody')).status, 400);
});

test('the template is a choice per order (12, 13 or 14), kept when the draft is changed or written again; the command line chooses it too', async (t) => {
  const { call, request } = await lab(t);
  const input = { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C1', ...TUR };
  for (const [body, why] of [[{ ...input, template: 17 }, /Mallen är 12, 13, 14, 15 eller 16\./], [{ ...input, template: 13, style: 'MINIMAL' }, /bara för en film i den korta texten/], [{ dealer: 'paow', step: 'ANKARE-2.1', template: 13 }, /bara för en film/]] as const) {
    const refused = await request('POST', '/api/orders/preview', { body });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, why);
  }
  // The deal from 2.3 is written with template 15 where the order names none (the recipe's since 2026-11-24: giv och
  // återgång in one film, data/order-methods.json); 12 is then a choice, and the draft names it as the exception it is.
  const twelve = await call('POST', '/api/orders', { body: { ...input, template: 12 } });
  assert.equal(twelve.status, 201, twelve.json.error);
  assert.equal(twelve.json.order.prompt.template, 'film-giv-kort@12');
  assert.ok(twelve.json.order.notes.some((n: string) => /mall 12 i stället för 15/.test(n)), twelve.json.order.notes.join('\n'));
  const made = await call('POST', '/api/orders', { body: { ...input, template: 13 } });
  assert.equal(made.status, 201, made.json.error);
  const { order, revision } = made.json;
  // A round trip has no text of its own in 13: 12's words, named @13, and the draft says so and names the exception.
  assert.equal(order.prompt.template, 'film-giv-kort@13');
  assert.equal(order.prompt.text, twelve.json.order.prompt.text);
  assert.ok(order.notes.some((n: string) => /Mall 13 har ingen egen text för den här filmen/.test(n)), order.notes.join('\n'));
  assert.ok(order.notes.some((n: string) => /mall 13 i stället för 15/.test(n)), order.notes.join('\n'));
  const changed = await call('PUT', `/api/orders/${order.id}`, { body: { takes: 2 }, match: revision });
  assert.equal(changed.status, 200, changed.json.error);
  assert.equal(changed.json.order.prompt.template, 'film-giv-kort@13');
  const read = await call('GET', `/api/orders/${order.id}`);
  assert.equal(read.json.refresh, null, 'a chosen template is not an older one');
  const refreshed = await call('POST', `/api/orders/${order.id}/refresh`, { match: changed.json.revision });
  assert.equal(refreshed.status, 200, refreshed.json.error);
  assert.equal(refreshed.json.order.prompt.template, 'film-giv-kort@13');
  // 15 (giv och återgång in one film, the recipe's since 2026-11-24) is this step's own, so an order that names no template is
  // written with it, as one that names 15 is, and neither is an exception. It has its own words for the lay and the way back.
  for (const body of [input, { ...input, template: 15 }]) {
    const fifteen = await call('POST', '/api/orders', { body });
    assert.equal(fifteen.status, 201, fifteen.json.error);
    assert.equal(fifteen.json.order.prompt.template, 'film-giv-kort@15');
    assert.notEqual(fifteen.json.order.prompt.text, twelve.json.order.prompt.text);
    assert.ok(!fifteen.json.order.notes.some((n: string) => /mall 15 i stället för/.test(n)), fifteen.json.order.notes.join(' | '));
  }
  // Templates 13 and 14 are short texts only: a film in the minimal text that names no template is written with today's
  // and names the exception, instead of being refused (Bordet's row offers the minimal text beside the short one).
  const minimal = await call('POST', '/api/orders', { body: { ...input, style: 'MINIMAL' } });
  assert.equal(minimal.status, 201, minimal.json.error);
  assert.equal(minimal.json.order.prompt.template, 'film-giv-minimal@12');
  assert.ok(minimal.json.order.notes.some((n: string) => /mall 12 i stället för 15/.test(n)), minimal.json.order.notes.join('\n'));
  // tools/order-new.ts: the words of the command line are the order the routes take.
  // Changed in round two (2026-11-21): the command also says the tree it holds the pictures to (--trad), null when none, and
  // the doll whose film goes with it (--docka), null when none.
  assert.deepEqual(newOrderOf(['paow', 'GIV-2.3', 'P4.C2', '--mall', '13', '--takes', '1', '--dry']), { input: { dealer: 'paow', step: 'GIV-2.3', target: 'P4.C2', template: 13, takes: 1, createdBy: 'huvudagenten, tools/order-new.ts' }, dry: true, tree: null, doll: null });
  assert.equal(newOrderOf(['paow', 'A1 - A2.3', '--mall', '14']).input.template, 14);
  assert.equal(newOrderOf(['paow', 'RETUR-2.3', 'P4.C2', '--no-reference']).input.reference, null);
  // The step form takes the seat as he writes it too (review of PR 1, 2026-11-21): A3P4C2 and P4C2 are the plan's P4.C2.
  for (const said of ['A3P4C2', 'P4C2', 'p4.c2']) assert.equal(newOrderOf(['paow', 'GIV-2.3', said, '--dry']).input.target, 'P4.C2', said);
  assert.throws(() => newOrderOf(['paow', 'GIV-2.3', '--mall']), /--mall behöver ett värde/);
  assert.throws(() => newOrderOf(['paow', 'GIV-2.3', 'P4.C2', '--skicka']), /Okänd flagga --skicka/);
  // His notation: one film, its step chosen by the anchor it starts from (or, for a return, the anchor it goes to).
  const said = (...args: string[]) => { const { input } = newOrderOf(['paow', ...args]); return [input.step, input.target]; };
  assert.deepEqual(said('A2.3 - A3P4C2', '--mall', '12'), ['GIV-2.3', 'P4.C2']);
  assert.deepEqual(said('A2.3', '→', 'A1'), ['UTGANG-2.3', null]);
  assert.deepEqual(said('A2.1 - A3P4C1'), ['GIV-2.1', 'P4.C1']);
  assert.deepEqual(said('A3P4C1 - A2.3'), ['RETUR-2.3', 'P4.C1']);
  assert.deepEqual(said('A3P4C1 - A1'), ['RETUR-1', 'P4.C1']);
  assert.deepEqual(said('A1 - A2.3'), ['INGANG-2.3', null]);
  assert.throws(() => said('A2.3 - A3P4C2 - A2.3'), /2 filmer/);
  assert.throws(() => said('A2 - A1'), /A2\.1 \(nyp\)/);
  assert.throws(() => said('A3P4C1 - A3P4C2'), /ingen film/);
  assert.equal(newOrderOf(['paow', 'A2.3 - A1', '--trad', 'tatuerad']).tree, 'tatuerad');
  // --trad: an anchor picture outside the named tree stops the draft; the card's picture is only named, since a tree takes
  // its A3 from the films made for it.
  const treeRoot = await mkdtemp(path.join(os.tmpdir(), 'order-new-trad-'));
  t.after(() => rm(treeRoot, { recursive: true, force: true }));
  await mkdir(path.join(treeRoot, 'data'));
  await writeFile(path.join(treeRoot, 'data', 'dealer-trees.json'), JSON.stringify({ dealers: { paow: { trees: [{ id: 'casino', anchors: [{ entry: 'gammal-2-3' }] }, { id: 'tatuerad', anchors: [{ entry: 'ny-2-3' }] }] } } }));
  const deal = (first: string) => ({ dealer: 'paow', step: { key: 'GIV-2.3' }, pictures: [{ goesAs: 'startFrame', label: 'Första bild', from: { entry: first } }, { goesAs: 'endFrame', label: 'Sista bild', from: { entry: 'ny-a3' } }] }) as never;
  assert.deepEqual(treesOf(treeRoot, deal('ny-2-3'), 'tatuerad').map((p) => p.trees), [['tatuerad'], []]);
  assert.throws(() => treesOf(treeRoot, deal('gammal-2-3'), 'tatuerad'), /hör inte till trädet "tatuerad"/);
  assert.throws(() => treesOf(treeRoot, deal('ny-2-3'), 'bred'), /har inget träd "bred"/);
});

test('a film of a dealer’s own doll is never the default: the command names it with --docka, and says which doll’s film goes', async (t) => {
  const root = await mkdtemp(path.join(base, 'order-doll-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const film = (id: string, more: object = {}) => ({ id, edge: 'READY-C>P4.C2', path: `assets/references/docka/${id}/source.mp4`, sha256: 'a'.repeat(64), seconds: 3, lays: 'RH' as const, check: null, ...more });
  // The doll's film is listed last, where a film made again would come first: the rule still takes the dummy's.
  const rendered = [film('docka-2-3-p4c2'), film('docka-paow-2-3-p4c2', { doll: 'paow' })];
  const want = { dealer: 'paow', step: stepOf('GIV-2.3')!, target: 'P4.C2', model: MODELS['kling-4'], shape: 'ONE_WAY' as const, lays: 'RH' as const };
  assert.equal(referenceByRule({ rendered }, 'renderad-eller-samma-plats', want)?.take, 'docka-2-3-p4c2');
  assert.equal(referenceByRule({ rendered: [rendered[1]] }, 'renderad-eller-samma-plats', want), null, 'only a doll’s film: the rule finds none');
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/rendered-references.json'), JSON.stringify({ schemaVersion: 1, films: rendered }));
  const asked = newOrderOf(['paow', 'A2.3 - A3P4C2', '--docka', 'paow', '--no-end']);
  assert.deepEqual([asked.doll, asked.input.reference], ['paow', undefined]);
  assert.equal(dollFilm(root, 'paow', asked.input).id, 'docka-paow-2-3-p4c2');
  assert.throws(() => dollFilm(root, 'paow', { step: 'GIV-2.3', target: 'P4.C1' }), /Dockan paow har ingen film för READY-C>P4.C1.*den har READY-C>P4.C2/);
  assert.throws(() => newOrderOf(['paow', 'A2.3 - A3P4C2', '--docka', 'paow', '--no-reference']), /--docka väljer referensfilmen/);
});

// Jakob 2026-11-24 (docs/BESKED.md, "Bara sätt som håller, och en pilot först"): the approval lets ONE order of an untried
// way through, and no second before he himself has judged its film; a way he rejected is refused until the recipe has
// changed. The same answer for his click in Beställ and for the main agent on his mandate, and the draft's row carries
// the reason. The words and the counting: tools/order-ways.test.ts.
test('a pilot first: a second order of an untried way waits for Jakob\'s own verdict on the pilot\'s film, and a way that fell is refused', async (t) => {
  const { root, call } = await lab(t);
  const draft = async (more: Record<string, unknown> = {}) => { const made = await call('POST', '/api/orders', { body: { dealer: 'ada', step: 'VILA', ...more } }); assert.equal(made.status, 201, made.json?.error); return made.json; };
  const approve = (o: { order: { id: string }; revision: string }) => call('POST', `/api/orders/${o.order.id}/approve`, { match: o.revision });
  const shown = async (o: { order: { id: string } }) => (await call('GET', `/api/orders/${o.order.id}`)).json;
  const pilot = await draft(), second = await draft();
  // Nothing was made this way before: both drafts are untried, and either can be the pilot.
  assert.deepEqual([pilot.way.state, pilot.way.chip, pilot.way.stop, pilot.problems, second.shown], ['oprövat', 'Oprövat: en pilot först', null, [], 'KLAR_ATT_TRYCKA']);
  const piloted = await approve(pilot);
  assert.equal(piloted.status, 200, piloted.json.error);

  // The second is refused, by his click and by the main agent alike, and its row says why.
  const early = await approve(second);
  assert.equal(early.status, 409);
  assert.equal(early.json.error.startsWith(`En pilot först: sättet är oprövat (WAN 3 · mall 12 · utan referensfilm), och piloten ${pilot.order.id} är redan godkänd. Dess film finns inte i banken än (tagningen står som GODKÄND)`), true, early.json.error);
  await assert.rejects(orderStore(root, { now: () => new Date('2026-11-12T21:00:00Z') }).approve(second.order.id, second.revision, { by: 'huvudagent', mandate: 'Jakob 2026-11-13: beställ lämpliga filmer' }), (error: Error & { status?: number }) => error.status === 409 && error.message === early.json.error);
  const waiting = await shown(second);
  assert.deepEqual([waiting.shown, waiting.problems, waiting.way.stop, waiting.order.status], ['UTKAST', [early.json.error], early.json.error, 'UTKAST'], 'the draft says the reason and cannot be clicked');

  // The pilot's film comes into the bank and is approved for him: not his verdict. The answer names the film and where he sees it.
  const film = `${pilot.order.id}-01`, take = { order: { id: pilot.order.id, take: 1 }, motion: { kind: 'IDLE' } };
  post(root, film, { ...take, review: { decision: 'ACCEPTED', userAccepted: false, provisional: { by: 'en oberoende granskare', at: '2026-11-12T20:00:00Z', mandate: 'Jakob 2026-11-13: domar åt honom', note: 'ser bra ut' } } });
  const forHim = await approve(second);
  assert.equal(forHim.status, 409);
  assert.equal(forHim.json.error.includes(`Filmen ${film} väntar på Jakobs ögon (den är dömd åt honom, och det räknas inte): han ser och dömer den i Granska, /studio/granska/?tagning=${film}.`), true, forHim.json.error);

  // He rejects it: the way fell, with his words and the day. A changed recipe is another way, and its first order goes through.
  post(root, film, { ...take, review: { decision: 'REJECTED', userReview: 'Jakob 2026-11-12: Hon stirrar rakt fram.' } });
  const fell = await approve(second);
  assert.equal(fell.status, 409);
  assert.equal(fell.json.error.startsWith(`Sättet föll och beställs inte igen: WAN 3 · mall 12 · utan referensfilm. Jakob underkände ${film} 2026-11-12 (”Hon stirrar rakt fram.”). Ändra receptet`), true, fell.json.error);
  assert.deepEqual([(await shown(second)).way.state, (await shown(second)).way.chip], ['föll', 'Föll: Hon stirrar rakt fram.']);
  const changed = await draft({ model: 'kling-4', duration: 4, takes: 1 });
  assert.deepEqual([changed.way.words, changed.way.stop], ['Kling 4 · mall 12 · utan referensfilm', null]);
  assert.equal((await approve(changed)).status, 200, 'the changed recipe\'s pilot');

  // He approves the pilot's film himself: the way holds, and the second order is approved.
  post(root, film, { ...take, review: { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-12: Bra.' } });
  const held = await shown(second);
  assert.deepEqual([held.way.state, held.way.chip, held.problems, held.shown], ['håller', 'Håller', [], 'KLAR_ATT_TRYCKA']);
  const approved = await approve(second);
  assert.equal(approved.status, 200, approved.json.error);
});
