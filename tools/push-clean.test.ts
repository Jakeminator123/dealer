import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs, pushClean, testSummary, testFailures, checkRed, DEFAULT_TREE, type Options} from './push-clean.ts';
import type {Exec} from './clean-tree.ts';

const ROOT = 'C:/repo', TREE = 'D:/scratch/push-trad', SHA = 'a'.repeat(40), OLD = 'b'.repeat(40);
const TEST_LOG = 'ℹ tests 3\nℹ suites 0\nℹ pass 3\nℹ fail 0\nℹ skipped 0\n';
type Answer = {code?: number; out?: string};
// A fake repo and tree: every command is recorded, and answers can be changed per command ("npm test", "git push" …).
function world(answers: Record<string, Answer> = {}, present = (p: string) => true) {
  const calls: string[] = [], said: string[] = [], logs: Record<string, string> = {};
  const run: Exec = (cmd, args, cwd) => {
    const key = `${cmd} ${args.join(' ')}`;
    const where = `${cwd === ROOT ? 'repo' : 'tree'}: ${key}`;
    calls.push(where);
    const own = Object.entries(answers).find(([k]) => key.startsWith(k) || where.startsWith(k));
    if (own) return {code: own[1].code ?? 0, out: own[1].out ?? ''};
    if (key.startsWith('git rev-parse --verify')) return {code: 0, out: SHA + '\n'};
    if (key.startsWith('git rev-parse --path-format')) return {code: 0, out: 'C:/repo/.git\n'};
    if (key === 'git rev-parse --show-toplevel') return {code: 0, out: cwd === ROOT ? ROOT : TREE};
    if (key === 'git rev-parse HEAD') return {code: 0, out: (calls.some(c => c.includes('checkout')) ? SHA : OLD) + '\n'};
    if (key.startsWith('git diff --quiet')) return {code: 0, out: ''};
    if (key === 'npm test') return {code: 0, out: TEST_LOG};
    if (key === 'npm run check') return {code: 0, out: 'a\nb\nc\nd\ne\nf\nKontrollen är grön.\n'};
    if (key.startsWith('git ls-remote')) return {code: 0, out: `${SHA}\trefs/heads/main\n`};
    return {code: 0, out: ''};
  };
  const go = (options: Partial<Options> = {}) => pushClean(ROOT, {commit: 'main', tree: TREE, dryRun: false, ...options}, {run, say: l => said.push(l), log: (n, t) => { logs[n] = t; }, exists: present});
  return {calls, said, logs, go, text: () => said.join('\n')};
}

test('the arguments: a commit, the tree and the dry run, with the documented default tree', () => {
  assert.deepEqual(parseArgs([]), {commit: 'main', tree: DEFAULT_TREE, dryRun: false});
  assert.deepEqual(parseArgs(['abc123', '--trad', 'D:/x', '--dry-run']), {commit: 'abc123', tree: 'D:/x', dryRun: true});
  assert.throws(() => parseArgs(['--force']), /okänd flagga --force/);
  assert.throws(() => parseArgs(['--trad']), /--trad kräver en mapp/);
  assert.throws(() => parseArgs(['a', 'b']), /högst en commit/);
});

test('a dry run does every step in order but never git push, and still reads both SHAs', () => {
  const w = world();
  assert.equal(w.go({dryRun: true}), 0, w.text());
  assert.ok(!w.calls.some(c => c.includes('git push')), w.calls.join('\n'));
  const order = ['checkout -q --detach ' + SHA, 'status --porcelain', 'npm test', 'npm run check', 'rev-parse HEAD', 'ls-remote origin refs/heads/main'];
  let at = -1;
  for (const part of order) { const next = w.calls.findIndex((c, i) => i > at && c.includes(part)); assert.ok(next > at, `${part} after the step before it:\n${w.calls.join('\n')}`); at = next; }
  assert.ok(w.calls.filter(c => /npm|checkout|status/.test(c)).every(c => c.startsWith('tree:')), 'everything runs in the clean tree');
  assert.match(w.text(), /^från b{40} till a{40} \(\d\d:\d\d:\d\d\)/);
  assert.match(w.text(), /ℹ tests 3 ℹ pass 3 ℹ fail 0 ℹ skipped 0/);
  assert.match(w.text(), /torrkörning: git push origin HEAD:main körs inte/);
  assert.match(w.text(), new RegExp(`lokalt: ${SHA}\nfjärr:  ${SHA}\nklart \\d\\d:\\d\\d:\\d\\d$`));
  assert.ok(!('push.log' in w.logs) && 'npm-test.log' in w.logs && 'npm-check.log' in w.logs);
});

test('a real run pushes HEAD to main, without force or --no-verify', () => {
  const w = world();
  assert.equal(w.go(), 0, w.text());
  const pushes = w.calls.filter(c => c.includes('git push'));
  assert.deepEqual(pushes, ['tree: git push origin HEAD:main']);
});

test('each stop stops before the next step, with the words the script printed', () => {
  const cases: Array<[string, Record<string, Answer>, RegExp, string]> = [
    ['checkout', {'git checkout': {code: 1}}, /^STOPP: checkout$/m, 'npm'],
    ['a dirty tree', {'git status --porcelain': {out: ' M tools/x.ts\n'}, 'git status --short': {out: ' M tools/x.ts\n'}}, /STOPP: arbetsträdet är inte rent\n M tools\/x.ts/, 'npm'],
    ['npm ci', {'git diff --quiet': {code: 1}, 'npm ci': {code: 1, out: 'npm error x\n'}}, /paketlistan har ändrats: npm ci\nSTOPP: npm ci\nnpm error x/, 'npm test'],
    ['npm test', {'npm test': {code: 1, out: '✖ a test fails\nℹ tests 3\nℹ pass 2\nℹ fail 1\n'}}, /ℹ tests 3 ℹ pass 2 ℹ fail 1\nSTOPP: npm test \(kod 1\)\n✖ a test fails/, 'npm run check'],
    ['the check', {'npm run check': {code: 1, out: '[RÖD] tools/x.ts: Ändrad testfil\n'}}, /STOPP: npm run check \(kod 1\)\n\[RÖD\] tools\/x\.ts/, 'git push'],
    ['the push', {'git push': {code: 1, out: 'rejected\n'}}, /rejected\nSTOPP: git push \(kod 1\)$/, 'ls-remote'],
  ];
  for (const [name, answers, words, never] of cases) {
    const w = world(answers);
    assert.equal(w.go(), 1, name);
    assert.match(w.text(), words, name);
    assert.ok(!w.calls.some(c => c.includes(never)), `${name}: ${never} never runs\n${w.calls.join('\n')}`);
    if (name !== 'the push') assert.ok(!w.calls.some(c => c.includes('git push')), `${name}: no push`);
  }
});

test('a missing tree, a tree of another repo and the tree the tool runs from all stop before checkout', () => {
  const missing = world({}, p => p !== TREE);
  assert.equal(missing.go(), 1);
  assert.match(missing.text(), /STOPP: arbetsträdet saknas \(D:\/scratch\/push-trad\); gör det med: git worktree add --detach D:\/scratch\/push-trad main/);
  const other = world({'tree: git rev-parse --path-format': {out: 'E:/other/.git'}});
  other.go();
  assert.match(other.text(), /STOPP: D:\/scratch\/push-trad är inget arbetsträd i det här repot/);
  const self = world({'git rev-parse --show-toplevel': {out: ROOT}});
  self.go();
  assert.match(self.text(), /STOPP: arbetsträdet är huvudträdet eller det här trädet/);
  for (const w of [missing, other, self]) assert.ok(!w.calls.some(c => c.includes('checkout') || c.startsWith('tree: npm')), w.calls.join('\n'));
});

test('npm ci runs when the package list changed or node_modules is missing, and not otherwise', () => {
  const plain = world(); plain.go({dryRun: true});
  assert.ok(!plain.calls.some(c => c.includes('npm ci')));
  const changed = world({'git diff --quiet': {code: 1}}); changed.go({dryRun: true});
  assert.ok(changed.calls.includes('tree: npm ci'));
  const bare = world({}, p => !p.endsWith('node_modules')); bare.go({dryRun: true});
  assert.match(bare.text(), /node_modules saknas: npm ci/);
});

test('the log readers pick the lines the script grepped', () => {
  const log = 'x\nℹ tests 10\nℹ suites 2\nℹ pass 8\nℹ fail 1\nℹ cancelled 0\nℹ skipped 1\n✖ one\nnot ok 3 - two\n';
  assert.equal(testSummary(log), 'ℹ tests 10 ℹ pass 8 ℹ fail 1 ℹ skipped 1');
  assert.deepEqual(testFailures(log), ['✖ one', 'not ok 3 - two']);
  assert.deepEqual(checkRed('ok\n[RÖD] a\nGUL b\n✖ c\n'), ['[RÖD] a', '✖ c']);
  assert.equal(testFailures(Array(30).fill('✖ x').join('\n')).length, 20);
});
