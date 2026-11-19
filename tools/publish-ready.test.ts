import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPublishedCommit} from './publish-ready.ts';

const SITE = 'https://dealer.example', SHA = 'a'.repeat(40), OLD = 'b'.repeat(40);
const meta = (sourceCommit = SHA, sourceDirty = false) => Response.json({sourceCommit, sourceDirty});

type Probe = {url: string; init: RequestInit; at: number; timeout: number; signal: AbortSignal};
function world(reply: (probe: Probe, advance: (ms: number) => void) => Response | Promise<Response>) {
  let now = 0;
  const alarms = new Map<AbortSignal, {controller: AbortController; until: number; timeout: number}>();
  const calls: Probe[] = [];
  function advance(ms: number) {
    now += ms;
    for (const [signal, {controller, until}] of alarms) {
      if (now >= until) {
        controller.abort(new DOMException('Tidsgräns', 'TimeoutError'));
        alarms.delete(signal);
      }
    }
  }
  const run = (cookie?: string, sha = SHA) => waitForPublishedCommit(SITE, sha, {
    cookie,
    now: () => now,
    sleep: async (ms) => advance(ms),
    timeoutSignal(timeout) {
      const controller = new AbortController();
      alarms.set(controller.signal, {controller, until: now + timeout, timeout});
      return controller.signal;
    },
    fetch: async (url, init = {}) => {
      const signal = init.signal!;
      const probe = {url: String(url), init, at: now, timeout: alarms.get(signal)!.timeout, signal};
      calls.push(probe);
      return reply(probe, advance);
    },
  });
  return {run, calls, time: () => now};
}

test('a delayed alias needs two clean matches of the full hash', async () => {
  const w = world(({at}) => meta(at < 4000 ? OLD : SHA));
  const result = await w.run();
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 4);
  assert.deepEqual(w.calls.map(({at}) => at), [0, 2000, 4000, 6000]);
  assert.ok(w.calls.every(({url}) => url === SITE + '/meta.json'));
});

test('old, dirty and unsuccessful responses reset the consecutive count', async () => {
  const replies = [meta(), meta(OLD), meta(), meta(SHA, true), meta(), Response.json({sourceCommit: SHA, sourceDirty: false}, {status: 503}), meta(), meta()];
  const w = world(() => replies.shift()!);
  const result = await w.run();
  assert.equal(result.ready, true);
  assert.equal(result.attempts, 8);
  assert.equal(w.time(), 14_000);
});

test('a wrong or incomplete hash, a dirty marker or an unreadable response never passes', async () => {
  const failures = [
    () => meta(OLD),
    () => meta(SHA.slice(0, 7)),
    () => meta(SHA, true),
    () => Response.json({sourceCommit: SHA}),
    () => new Response('<!doctype html>'),
    () => Response.json({sourceCommit: SHA, sourceDirty: false}, {status: 401}),
    () => { throw Error('network failed'); },
  ];
  for (const reply of failures) {
    const w = world(reply);
    assert.equal((await w.run()).ready, false);
    assert.equal(w.time(), 30_000);
  }
  const short = world(() => meta());
  await assert.rejects(short.run(undefined, SHA.slice(0, 7)), /full commit-hash/);
  assert.equal(short.calls.length, 0);
});

test('timeouts include reading JSON and the final fetch uses only the remaining deadline', async () => {
  const w = world(({at, signal, timeout}, advance) => {
    if (at === 0) { advance(1000); return meta(); }
    if (at === 3000) {
      return new Response(new ReadableStream({
        pull(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason), {once: true});
          advance(timeout);
        },
      }, {highWaterMark: 0}));
    }
    return new Promise<Response>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once: true});
      advance(timeout);
    });
  });
  const result = await w.run();
  assert.equal(result.ready, false);
  assert.equal(result.detail, 'tidsgräns för /meta.json');
  assert.equal(w.time(), 30_000);
  assert.deepEqual(w.calls.map(({timeout}) => timeout), [3000, 3000, 3000, 3000, 3000, 3000, 2000]);
});

test('the authenticated probes forward the cookie without redirects or cache reuse', async () => {
  const cookie = 'dealer_studio=prov';
  const w = world(({init}) => {
    if (new Headers(init.headers).get('cookie') !== cookie) return new Response(null, {status: 401});
    return meta();
  });
  assert.equal((await w.run(cookie)).ready, true);
  assert.equal(w.calls.length, 2);
  for (const {init, url} of w.calls) {
    assert.equal(url, SITE + '/meta.json');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
  }
});
