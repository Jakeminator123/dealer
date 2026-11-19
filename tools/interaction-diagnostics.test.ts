import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {forBrowser} from './lab-routes.ts';
import {timingParts} from '../src/interaction-diagnostics.ts';
import {diagnosticsStore, receiveDiagnostics, validateSamples, SAMPLE_LIMIT, BODY_LIMIT} from './interaction-diagnostics.ts';

const sample = {at: '2026-11-19T12:00:00.000Z', page: '/studio/bordet/', target: 'a /studio/karta/', event: 'click',
  interactionId: 7, duration: 320, inputDelay: 200, processing: 20, presentation: 100, hidden: false, visibilityChanged: false};
test('slow interaction separates waiting, handlers and presentation; fast and non-interactions are omitted', () => {
  const e = {name: 'click', interactionId: 7, startTime: 100, duration: 320, processingStart: 300, processingEnd: 320};
  assert.deepEqual(timingParts(e), {duration: 320, inputDelay: 200, processing: 20, presentation: 100});
  assert.equal(timingParts({...e, duration: 100}), null);
  assert.equal(timingParts({...e, interactionId: 0}), null);
});
test('inbox strips extra fields and refuses queries, values, oversized batches and invalid timings', () => {
  assert.deepEqual(validateSamples([{...sample, value: 'do not store', text: 'do not store'}]), [sample]);
  for (const bad of [{page: '/?token=secret'}, {target: 'a /?token=secret'}, {duration: Infinity}, {processing: -1}, {interactionId: 0}]) {
    assert.throws(() => validateSamples([{...sample, ...bad}]));
  }
  assert.throws(() => validateSamples(Array(17).fill(sample)));
});
test('browser observer sends source route, timing parts and visibility without URL queries or field contents', async () => {
  const handlers = new Map(), timers: (() => void)[] = [], requests: any[] = [];
  let observe: (list: unknown) => void;
  class Element { tagName = 'A'; closest() { return this; } }
  class Anchor extends Element { origin = 'http://127.0.0.1:4319'; pathname = '/studio/karta/'; href = this.origin + this.pathname + '?private=value'; }
  const location = {hostname: '127.0.0.1', origin: 'http://127.0.0.1:4319', pathname: '/studio/bordet/'};
  const document = {hidden: false};
  const scope = vm.createContext({location, document, Element, HTMLAnchorElement: Anchor,
    performance: {now: () => 150, timeOrigin: Date.parse(sample.at)},
    addEventListener: (name: string, fn: unknown) => handlers.set(name, fn),
    setTimeout: (fn: () => void) => timers.push(fn), clearTimeout: () => {},
    fetch: async (url: string, options: unknown) => { requests.push({url, options}); },
    PerformanceObserver: class { static supportedEntryTypes = ['event']; constructor(callback: typeof observe) { observe = callback; } observe() {} },
  });
  const source = await readFile(new URL('../src/interaction-diagnostics.ts', import.meta.url), 'utf8');
  vm.runInContext(forBrowser(source).replace(/^export /gm, '') + '\nstartInteractionDiagnostics();', scope);
  handlers.get('click')({timeStamp: 100, target: new Anchor(), value: 'never log this'});
  location.pathname = '/studio/karta/'; document.hidden = true; handlers.get('visibilitychange')();
  observe!({getEntries: () => [{name: 'click', startTime: 100, duration: 320, processingStart: 300, processingEnd: 320, interactionId: 7}]});
  timers.at(-1)!();
  assert.equal(requests[0].url, '/api/interaction-diagnostics');
  const record = JSON.parse(requests[0].options.body)[0];
  assert.equal(record.page, '/studio/bordet/');
  assert.equal(record.target, 'a /studio/karta/');
  assert.equal(record.inputDelay, 200);
  assert.equal(record.processing, 20);
  assert.equal(record.presentation, 100);
  assert.equal(record.hidden, false);
  assert.equal(record.visibilityChanged, true);
  assert.doesNotMatch(requests[0].options.body, /private|never log/);
});
test('local HTTP inbox verifies origin and body limit, serializes concurrent writes and caps retained samples', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dealer-inp-'));
  const store = diagnosticsStore(root), origin = 'http://127.0.0.1:4319';
  const server = http.createServer((req, res) => { void receiveDiagnostics(req, res, origin, store); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, {recursive: true, force: true}); });
  const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  const post = (body: string, from = origin) => fetch(url, {method: 'POST', headers: {origin: from, 'content-type': 'application/json'}, body});
  assert.equal((await post(JSON.stringify([sample]), 'https://outside.example')).status, 403);
  assert.equal((await post('x'.repeat(BODY_LIMIT + 1))).status, 413);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post(JSON.stringify([sample]))).status, 204);
  await Promise.all(Array.from({length: 14}, (_, i) => store.append(Array.from({length: 16}, (_, j) => ({...sample, interactionId: 10 + i * 16 + j})))));
  const saved = JSON.parse(await readFile(store.file, 'utf8'));
  assert.equal(saved.length, SAMPLE_LIMIT);
  assert.equal(saved.at(-1).interactionId, 233);
  assert.equal(new Set(saved.map((s: {interactionId: number}) => s.interactionId)).size, SAMPLE_LIMIT);
  assert.ok((await readFile(store.file)).length < 200000);
});
