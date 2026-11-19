import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseArgs, studioFromCommit, swapInto, type Options} from './studio-from-commit.ts';
import type {Exec} from './clean-tree.ts';
import type {RunReceiptInput} from './evidence-store.ts';
import type {captureRunContext} from './evidence-context.ts';

const ROOT = 'C:/repo', TREE = 'D:/scratch/studio-trad', SHA = 'c'.repeat(40);
type Answer = {code?: number; out?: string};
const cleanContext = () => ({revision: SHA, dirtyInputs: [] as string[], inputs: [] as {path: string; sha256: string}[], studioRevision: null, studioNote: null, fingerprint: 'clean-inputs', storageRoot: ROOT});
function world(answers: Record<string, Answer> = {}, present = (_: string) => true, installed = (_: string): string | null => SHA, context: typeof captureRunContext = cleanContext) {
  const calls: string[] = [], said: string[] = [], swaps: Array<[string, string]> = [], receipts: {root: string; outcome: RunReceiptInput}[] = [];
  const run: Exec = (cmd, args, cwd) => {
    const key = `${cmd} ${args.join(' ')}`, where = `${cwd === ROOT ? 'repo' : 'tree'}: ${key}`;
    calls.push(where);
    const own = Object.entries(answers).find(([k]) => key.startsWith(k) || where.startsWith(k));
    if (own) return {code: own[1].code ?? 0, out: own[1].out ?? ''};
    if (key.startsWith('git rev-parse --verify')) return {code: 0, out: SHA};
    if (key.startsWith('git rev-parse --path-format')) return {code: 0, out: 'C:/repo/.git'};
    if (key === 'git rev-parse --show-toplevel') return {code: 0, out: cwd === ROOT ? ROOT : TREE};
    if (key === 'git rev-parse HEAD') return {code: 0, out: 'd'.repeat(40)};
    return {code: 0, out: ''};
  };
  const go = (options: Partial<Options> = {}) => studioFromCommit(ROOT, {commit: 'main', tree: TREE, ...options}, {
    run,
    say: l => said.push(l),
    log: () => {},
    exists: present,
    swap: (built, target) => { calls.push('swap'); swaps.push([built, target]); return 7; },
    installedRevision: target => { calls.push('verify-output'); return installed(target); },
    receipt: (root, outcome) => { calls.push('receipt'); receipts.push({root, outcome}); },
    context,
  });
  return {calls, said, swaps, receipts, go, text: () => said.join('\n')};
}
const posix = (p: string) => p.replaceAll('\\', '/');

test('the arguments require an explicitly selected worktree', () => {
  assert.throws(() => parseArgs([]), /välj ett rent IDE-arbetsträd/);
  assert.deepEqual(parseArgs(['--trad', 'C:/chosen']), {commit: 'main', tree: 'C:/chosen'});
  assert.deepEqual(parseArgs(['abc', '--trad', 'D:/t', '--ut', 'D:/o']), {commit: 'abc', tree: 'D:/t', out: 'D:/o'});
  assert.throws(() => parseArgs(['--ut']), /--ut kräver en mapp/);
  assert.throws(() => parseArgs(['--snabbt']), /okänd flagga/);
});

test('a build that succeeds is swapped into the main checkout\'s studio/out, built in the clean tree', () => {
  const w = world();
  assert.equal(w.go(), 0, w.text());
  assert.deepEqual(w.swaps.map(([b, t]) => [posix(b), posix(t)]), [[`${TREE}/studio/out`, 'C:/repo/studio/out']]);
  assert.ok(w.calls.includes('tree: npm --prefix studio run build'));
  assert.ok(w.calls.filter(c => c.startsWith('tree: npm') || c.includes('checkout')).length >= 2 && !w.calls.some(c => c.startsWith('repo: npm')), 'nothing is built in the repo');
  assert.match(w.text(), /studio[\\/]out bytt: 7 filer från ccccccc/);
  assert.deepEqual(w.calls.slice(-3), ['swap', 'verify-output', 'receipt']);
  const [{root, outcome}] = w.receipts;
  assert.equal(posix(root), ROOT);
  const {startedAt, finishedAt, ...payload} = outcome;
  assert.ok(Date.parse(startedAt) <= Date.parse(finishedAt));
  assert.deepEqual(payload, {
    kind: 'studio-build', status: 'pass', revision: SHA, studioRevision: SHA,
    inputs: [], dirtyInputs: [], counts: {pass: 0, fail: 0, skip: 0, todo: 0, cancelled: 0}, notes: ['verified-output'],
  });
});

test('a failed build, a dirty tree or a build without index.html never swaps the served folder', () => {
  const failed = world({'npm --prefix studio run build': {code: 1, out: 'Type error: x\n'}});
  assert.equal(failed.go(), 1);
  assert.match(failed.text(), /STOPP: bygget föll \(kod 1\); C:[\\/]repo[\\/]studio[\\/]out är orört\nType error: x/);
  const dirty = world({'git status --porcelain': {out: '?? studio/app/x.tsx\n'}, 'git status --short': {out: '?? studio/app/x.tsx\n'}});
  assert.equal(dirty.go(), 1);
  assert.ok(!dirty.calls.some(c => c.includes('run build')));
  const empty = world({}, p => !p.endsWith('index.html'));
  assert.equal(empty.go(), 1);
  assert.match(empty.text(), /bygget gav ingen/);
  for (const w of [failed, dirty, empty]) assert.deepEqual(w.swaps, []);
  assert.deepEqual(dirty.receipts, [], 'npm build was never started');
  for (const [attempt, note] of [[failed, 'npm-build'], [empty, 'missing-build-index']] as const) {
    const [{outcome}] = attempt.receipts;
    assert.deepEqual([outcome.status, outcome.revision, outcome.studioRevision, outcome.notes, outcome.log], ['fail', SHA, null, [note], undefined]);
  }
});

test('a wrong build tree stops before npm and an unverified swap records a failure', () => {
  const wrongTree = world({'tree: git rev-parse --verify --quiet HEAD': {out: 'e'.repeat(40)}});
  assert.equal(wrongTree.go(), 1);
  assert.ok(!wrongTree.calls.some(c => c.includes('run build')));
  assert.deepEqual(wrongTree.receipts, []);

  const wrongStamp = world({}, () => true, () => 'e'.repeat(40));
  assert.equal(wrongStamp.go(), 1);
  assert.match(wrongStamp.text(), /kunde inte verifieras/);
  assert.deepEqual(wrongStamp.calls.slice(-3), ['swap', 'verify-output', 'receipt']);
  const [{outcome}] = wrongStamp.receipts;
  assert.deepEqual([outcome.status, outcome.revision, outcome.studioRevision, outcome.notes], ['fail', SHA, null, ['verify-output']]);
});

test('a verified trial output is journaled in the main checkout without claiming it is served', () => {
  const w = world();
  assert.equal(w.go({out: 'D:/o'}), 0);
  const [{root, outcome}] = w.receipts;
  assert.equal(posix(root), ROOT);
  assert.deepEqual([outcome.status, outcome.revision, outcome.studioRevision, outcome.notes], ['pass', SHA, null, ['verified-output', 'trial-output']]);
});

test('source changes with an unchanged HEAD cannot be installed or receive a green build receipt', () => {
  let reads = 0;
  const w = world({}, undefined, undefined, () => ++reads === 1 ? cleanContext() : {
    ...cleanContext(), dirtyInputs: ['studio/app/page.tsx'], fingerprint: 'modified-inputs',
  });
  assert.equal(w.go(), 1);
  assert.match(w.text(), /filer ändrades under bygget/);
  assert.deepEqual(w.swaps, []);
  const [{outcome}] = w.receipts;
  assert.equal(outcome.revision, SHA);
  assert.equal(outcome.status, 'fail');
  assert.equal(outcome.studioRevision, null);
  assert.deepEqual(outcome.dirtyInputs, ['studio/app/page.tsx']);
  assert.deepEqual(outcome.notes, ['build-tree-inputs']);
});

test('changes caused by package installation stop before building', () => {
  const w = world({}, undefined, undefined, () => ({...cleanContext(), dirtyInputs: ['studio/package.json']}));
  assert.equal(w.go(), 1);
  assert.match(w.text(), /ändrades före bygget/);
  assert.ok(!w.calls.some(call => call.includes('run build')));
  assert.deepEqual(w.swaps, []);
});

test('npm ci runs per package where node_modules is missing or the list changed', () => {
  const bare = world({}, p => !posix(p).endsWith('studio/node_modules'));
  bare.go({out: 'D:/o'});
  assert.ok(bare.calls.includes('tree: npm --prefix studio ci') && !bare.calls.includes('tree: npm ci'), bare.calls.join('\n'));
  assert.match(bare.text(), /studio\/node_modules saknas: npm --prefix studio ci/);
  const failed = world({'git diff --quiet': {code: 1}, 'npm ci': {code: 1, out: 'ERR\n'}});
  assert.equal(failed.go(), 1);
  assert.match(failed.text(), /paketlistan har ändrats: npm ci\nSTOPP: npm ci\nERR/);
  assert.deepEqual(failed.swaps, []);
});

// The swap on real folders: what is served is either the old build or the whole new one, never half.
function folders() {
  const base = mkdtempSync(path.join(tmpdir(), 'dealer-studio-swap-'));
  const built = path.join(base, 'tree', 'studio', 'out'), target = path.join(base, 'repo', 'studio', 'out');
  for (const [dir, name] of [[built, 'ny'], [target, 'gammal']]) { mkdirSync(path.join(dir, 'sub'), {recursive: true}); writeFileSync(path.join(dir, 'index.html'), name); writeFileSync(path.join(dir, 'sub', `${name}.js`), name); }
  return {base, built, target, siblings: () => readdirSync(path.dirname(target)).sort(), done: () => rmSync(base, {recursive: true, force: true})};
}

test('the swap replaces the folder whole, stamps the commit and leaves nothing beside it', () => {
  const f = folders();
  try {
    assert.equal(swapInto(f.built, f.target, {commit: SHA}), 3);
    assert.equal(readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'ny');
    assert.ok(existsSync(path.join(f.target, 'sub', 'ny.js')) && !existsSync(path.join(f.target, 'sub', 'gammal.js')));
    assert.equal(JSON.parse(readFileSync(path.join(f.target, 'bygge.json'), 'utf8')).commit, SHA);
    assert.deepEqual(f.siblings(), ['out']);
    assert.ok(existsSync(path.join(f.built, 'index.html')), 'the built folder in the tree is copied, not moved');
  } finally { f.done(); }
});

test('a move that fails leaves the old build served', () => {
  const f = folders();
  try {
    let calls = 0;
    const first = () => { throw Object.assign(new Error('EBUSY'), {code: 'EBUSY'}); };
    assert.throws(() => swapInto(f.built, f.target, {}, first), /gick inte att flytta undan \(EBUSY\); det som visas är orört/);
    assert.equal(readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'gammal');
    assert.deepEqual(f.siblings(), ['out']);
    const second = (a: string, b: string) => { if (++calls === 2) throw new Error('EPERM'); renameSync(a, b); };
    assert.throws(() => swapInto(f.built, f.target, {}, second), /det gamla står kvar/);
    assert.equal(readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'gammal');
    assert.deepEqual(f.siblings(), ['out']);
  } finally { f.done(); }
});

test('a served folder left aside by a run that died is put back first', () => {
  const f = folders();
  try {
    renameSync(f.target, `${f.target}.gammal`);
    const fail = (a: string, b: string) => { if (a.endsWith('.ny')) throw new Error('EPERM'); renameSync(a, b); };
    assert.throws(() => swapInto(f.built, f.target, {}, fail));
    assert.equal(readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'gammal');
  } finally { f.done(); }
});
