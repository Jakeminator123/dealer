import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan } from '../src/placement-model.ts';
import { publicStore } from '../src/public-storage.ts';

test('public drafts are isolated from the seed and reject stale-tab saves', async () => {
  const seed = { plan: defaultPlan(), revision: 'seed' };
  seed.plan.updatedAt = '2026-11-10T12:00:00.000Z';
  const unchanged = JSON.stringify(seed);
  let value: string | null = null, next = 0, queue = Promise.resolve();
  const storage = { getItem: () => value, setItem: (_key: string, text: string) => { value = text; } };
  function exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action); queue = result.then(() => {}, () => {}); return result;
  }
  const store = publicStore(storage, async () => seed, exclusive, () => String(++next));
  const first = await store.load(), second = await store.load();
  assert.equal(first.plan.updatedAt, null);
  first.plan.targets['P1.C1'].geometry.native.angle = 12;
  const results = await Promise.all([store.save(first.plan, first.revision), store.save(second.plan, second.revision)]);
  assert.deepEqual(results.map(result => result.status), [200, 409]);
  assert.equal((await store.load()).plan.targets['P1.C1'].geometry.native.angle, 12);
  assert.ok((await store.load()).plan.updatedAt);
  assert.equal(JSON.stringify(seed), unchanged);
  assert.equal((await store.save(first.plan, null)).status, 428);
});

test('public storage refuses invalid plans and reports unavailable persistence', async () => {
  const seed = { plan: defaultPlan(), revision: 'seed' };
  const store = publicStore({ getItem: () => null, setItem: () => { throw Error('quota'); } }, async () => seed, async action => action(), () => 'next');
  await assert.rejects(store.save({ bad: true }, 'seed'));
  await assert.rejects(store.save(seed.plan, 'seed'), /quota/);
});
