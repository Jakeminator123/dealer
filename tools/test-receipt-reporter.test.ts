import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {closeSync, existsSync, ftruncateSync, mkdtempSync, mkdirSync, openSync, readFileSync,
  readdirSync, rmSync, writeFileSync, writeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test, {type TestContext} from 'node:test';
import {captureRunContext, committedPlan} from './evidence-context.ts';

const reporter = new URL('./test-receipt-reporter.ts', import.meta.url).href;
const ok = "import test from 'node:test'; test('yes',()=>{});";

function checkout(t: TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'dealer-test-receipt-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('dealer-test-receipt-'));
    rmSync(root, {recursive: true, force: true});
  });
  const env = {...process.env};
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'NODE_TEST_CONTEXT', 'DEALER_TEST_KIND', 'DEALER_TEST_REVISION']) delete env[key];
  const git = (...args: string[]) => execFileSync('git', args, {cwd: root, env, stdio: 'pipe'}).toString('utf8').trim();
  const write = (file: string, text: string, checkoutRoot = root) => {
    const target = path.join(checkoutRoot, file);
    mkdirSync(path.dirname(target), {recursive: true});
    writeFileSync(target, text);
  };
  write('.gitignore', '.runtime/\nlinked-checkout/\nstudio/out/\n');
  write('package.json', '{"type":"module"}\n');
  write('probe.test.mjs', ok);
  git('init', '-q');
  const commit = (message: string) => {
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  commit('fixture');

  const folder = path.join(root, '.runtime/evidence/runs');
  const run = (opts: {cwd?: string; kind?: string; expected?: string} = {}) => {
    const childEnv = {...env, ...(opts.kind ? {DEALER_TEST_KIND: opts.kind} : {}),
      ...(opts.expected ? {DEALER_TEST_REVISION: opts.expected} : {})};
    const previous = new Set(existsSync(folder) ? readdirSync(folder) : []);
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec',
      `--test-reporter=${reporter}`, '--test-reporter-destination=stdout', '--test-reporter-destination=stderr', 'probe.test.mjs'],
    {cwd: opts.cwd ?? root, env: childEnv, encoding: 'utf8', timeout: 20000});
    assert.ifError(result.error);
    assert.ok(existsSync(folder), result.stdout + result.stderr);
    const files = readdirSync(folder);
    const appended = files.filter(file => !previous.has(file));
    assert.equal(appended.length, 1, result.stdout + result.stderr);
    const receipt = JSON.parse(readFileSync(path.join(folder, appended[0]), 'utf8'));
    return {result, count: files.length, receipt};
  };
  return {root, folder, write, git, commit, run};
}

test('real Node summaries store failure, skip and TODO separately and put linked checkout receipts in the main journal', t => {
  const fixture = checkout(t);
  fixture.write('probe.test.mjs', "import test from 'node:test'; test('yes',()=>{}); test.skip('later',()=>{}); test.todo('design'); test('no',()=>{throw Error('expected')});");
  const first = fixture.run();
  assert.equal(first.result.status, 1, first.result.stdout + first.result.stderr);
  assert.equal(first.count, 1);
  assert.equal(first.receipt.status, 'fail');
  assert.equal(first.receipt.kind, 'tests');
  assert.deepEqual(first.receipt.counts, {pass: 1, fail: 1, skip: 1, todo: 1, cancelled: 0});

  fixture.write('probe.test.mjs', ok);
  const second = fixture.run();
  assert.equal(second.result.status, 0, second.result.stdout + second.result.stderr);
  assert.equal(second.count, 2);
  assert.equal(second.receipt.status, 'pass');
  assert.equal(second.receipt.counts.pass, 1);

  fixture.write('data/order-methods.json', '{}');
  fixture.write('probe.test.mjs', "import test from 'node:test'; import {writeFileSync} from 'node:fs'; test('changes input',()=>writeFileSync('data/order-methods.json','{\"changed\":true}'));");
  const third = fixture.run();
  assert.equal(third.result.status, 1, third.result.stdout + third.result.stderr);
  assert.equal(third.receipt.status, 'invalidated');
  assert.ok(third.receipt.notes.includes('inputs-changed-during-run'));

  const linked = path.join(fixture.root, 'linked-checkout');
  fixture.git('worktree', 'add', '--detach', linked, 'HEAD');
  const detached = fixture.run({cwd: linked});
  assert.equal(detached.result.status, 0, detached.result.stdout + detached.result.stderr);
  assert.equal(detached.count, 4);
  assert.ok(detached.receipt.notes.includes('linked-checkout'));
  assert.equal(existsSync(path.join(linked, '.runtime/evidence/runs')), false);
});

test('publication refuses the wrong commit or active dirty inputs before any tests execute', t => {
  const fixture = checkout(t);
  fixture.write(committedPlan, '{"version":"committed"}');
  fixture.write('active.json', '{"state":"committed"}');
  fixture.write('probe.test.mjs', "import test from 'node:test'; import {mkdirSync,writeFileSync} from 'node:fs'; test('yes',()=>{mkdirSync('.runtime',{recursive:true});writeFileSync('.runtime/executed','yes');});");
  const expected = fixture.commit('publication fixture');
  const marker = path.join(fixture.root, '.runtime/executed');
  const publication = (revision?: string) => fixture.run({kind: 'publication', expected: revision});

  for (const wrong of [undefined, 'a'.repeat(40), expected.slice(0, 7)]) {
    const refused = publication(wrong);
    assert.notEqual(refused.result.status, 0, refused.result.stdout + refused.result.stderr);
    assert.equal(refused.receipt.status, 'invalidated');
    assert.ok(refused.receipt.notes.includes('publication-revision-mismatch'));
    assert.equal(refused.receipt.counts.pass, 0);
    assert.equal(existsSync(marker), false);
  }
  fixture.write('active.json', '{"state":"stable dirty input"}');
  const dirty = publication(expected);
  assert.notEqual(dirty.result.status, 0, dirty.result.stdout + dirty.result.stderr);
  assert.equal(dirty.receipt.status, 'invalidated');
  assert.ok(dirty.receipt.notes.includes('publication-dirty-inputs'));
  assert.equal(existsSync(marker), false);

  fixture.git('restore', 'active.json');
  const plan = captureRunContext(fixture.root).inputs.find(input => input.path === committedPlan);
  assert.ok(plan);
  rmSync(path.join(fixture.root, committedPlan));
  const allowed = publication(expected);
  assert.equal(allowed.result.status, 0, allowed.result.stdout + allowed.result.stderr);
  assert.equal(allowed.receipt.status, 'pass');
  assert.deepEqual(allowed.receipt.dirtyInputs, [committedPlan]);
  assert.deepEqual(allowed.receipt.inputs.find((input: {path: string}) => input.path === committedPlan), plan);
  assert.ok(existsSync(marker));
});

test('an unreadable studio build stamp keeps the test outcome and records an unknown version', t => {
  const fixture = checkout(t);
  for (const stamp of ['{"commit":', '{"commit":"short-sha"}']) {
    fixture.write('studio/out/bygge.json', stamp);
    const checked = fixture.run();
    assert.equal(checked.result.status, 0, checked.result.stdout + checked.result.stderr);
    assert.equal(checked.receipt.status, 'pass');
    assert.equal(checked.receipt.studioRevision, null);
    assert.ok(checked.receipt.notes.includes('studio-stamp-unreadable'));
  }
});

test('changes beyond the first chunk of a dirty file change the working-tree fingerprint', t => {
  const fixture = checkout(t);
  const file = path.join(fixture.root, 'export.bin');
  const size = 640 * 1024;
  const fd = openSync(file, 'w+');
  let before: ReturnType<typeof captureRunContext>;
  let after: ReturnType<typeof captureRunContext>;
  try {
    ftruncateSync(fd, size);
    before = captureRunContext(fixture.root);
    writeSync(fd, Buffer.from([1]), 0, 1, size - 1);
    after = captureRunContext(fixture.root);
  } finally {
    closeSync(fd);
  }
  assert.deepEqual(before.dirtyInputs, ['export.bin']);
  assert.deepEqual(after.dirtyInputs, before.dirtyInputs);
  assert.notEqual(after.fingerprint, before.fingerprint);
});
