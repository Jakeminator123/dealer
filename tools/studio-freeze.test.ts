import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildGraph, resolveRound, type BankData} from '../src/clip-graph.ts';
import {readRelease, blockedName, blockedPath, redactText, scrub, findLeaks, findTextLeaks, pickTakes, pickProofs, freezeBank, graphShape, roundShape, safeRelative, prefetchAlias, objectName, type Proof, type Release} from './studio-freeze.ts';

const release: Release = readRelease(JSON.parse(readFileSync(new URL('../data/studio-release.json', import.meta.url), 'utf8')));
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

test('the register is read strictly', () => {
  assert.equal(release.paow, true);
  assert.equal(release.takes.waiting, false);
  assert.ok(release.blocked.folders.length && release.blocked.names.length);
  assert.throws(() => readRelease({...release, schemaVersion: 2}));
  assert.throws(() => readRelease({...release, paow: 'ja'}));
  assert.throws(() => readRelease({...release, round: {...release.round, seats: ['P8']}}));
  assert.throws(() => readRelease({...release, proofs: [{id: 'Ett prov', why: 'x'}]}));
  assert.throws(() => readRelease({...release, proofs: [{id: 'a', why: ''}]}));
  assert.throws(() => readRelease({...release, proofs: [{id: 'a', why: 'x'}, {id: 'a', why: 'y'}]}));
  assert.throws(() => readRelease({...release, proofs: [{id: 'a', why: 'x', files: ['../b.mp4']}]}));
});

// ── The block list ──────────────────────────────────────────────────────────
const rules = {blocked: {folders: ['trailer*'], names: ['Göran', 'Astrid', 'Kevin']}};

test('blocked folders and names are found in any spelling, and only as whole words', () => {
  assert.equal(blockedPath('assets/proofs/trailer-noir-2/noir-trailer-2.mp4', rules), 'mapp trailer*');
  assert.equal(blockedPath('assets/proofs/trailer-noir/x.png', rules), 'mapp trailer*');
  assert.equal(blockedPath('assets/proofs/hel-runda/kevin-p4.mp4', rules), 'namn Kevin');
  assert.equal(blockedPath('assets/proofs/paow-kavaj/3-keystone-vila.png', rules), null);
  for (const text of ['Det kan gå tillbaka till Astrid.', 'en gammal hederlig Astrid-film', 'GÖRAN sa', 'goran', 'Göran']) assert.ok(blockedName(text, rules), text);
  for (const text of ['Kevinsson', 'astridsk', 'Pamela', 'göranden']) assert.equal(blockedName(text, rules), null, text);
});

test('a take or proof the rule picks but the block list stops is refused, not quietly skipped', () => {
  const bank = fixture();
  bank.jobs!.push({...bank.jobs![0], id: 'kevin-p4-c1-deal-01'});
  bank.motions!['kevin-p4-c1-deal-01'] = bank.motions!['pamela-p4-c1-deal-01'];
  const graph = buildGraph(bank);
  const picked = pickTakes(graph, [], {...release, ...rules});
  assert.deepEqual(picked.refused.map(r => r.id), ['kevin-p4-c1-deal-01']);
  assert.ok(!picked.picked.some(p => p.id.startsWith('kevin')));
  const proof = (id: string, description = ''): Proof => ({id, title: id, description, labels: null, verdicts: null, updatedAt: null, chapters: null, fps: 30, files: [{name: 'a.mp4', path: `assets/proofs/${id}/a.mp4`, kind: 'video', bytes: 1}]});
  const all = [proof('pamela-film'), proof('trailer-noir'), proof('ren'), proof('paow-kavaj')];
  // the route's text is clean, the proof.json on disk names Göran: still refused
  const raw = new Map([['ren', '{"tool": "made with Göran"}']]);
  const wanted = {...release, ...rules, proofs: [{id: 'pamela-film', why: 'x'}, {id: 'trailer-noir', why: 'x'}, {id: 'ren', why: 'x'}, {id: 'saknas', why: 'x'}]};
  const out = pickProofs(all, raw, wanted);
  assert.deepEqual(out.proofs.map(p => p.id), ['pamela-film']);
  assert.deepEqual(out.refused.map(r => r.id).sort(), ['ren', 'saknas', 'trailer-noir']);
  // Paow off: her proof is left out, with the reason
  const off = pickProofs(all, new Map(), {...wanted, paow: false, proofs: [{id: 'paow-kavaj', why: 'x'}]});
  assert.deepEqual(off.left.find(l => l.id === 'paow-kavaj')?.why, 'Paow är avslagen');
  // a file list narrows a proof; a file it names that does not exist is refused
  assert.equal(pickProofs(all, new Map(), {...wanted, proofs: [{id: 'pamela-film', why: 'x', files: ['b.mp4']}]}).refused.length, 1);
});

// ── Texts ───────────────────────────────────────────────────────────────────
test('costs, blocked names and machine paths leave the texts; his stamp stays', () => {
  assert.equal(redactText('Jakob 2026-11-11: Bra. Det kan gå tillbaka till Astrid. Ta den.', rules), 'Jakob 2026-11-11: Bra. Ta den.');
  assert.equal(redactText('Jakob 2026-11-11: Det kan gå tillbaka till Astrid.', rules), 'Jakob 2026-11-11: …');
  assert.equal(redactText('Runway MCP server (app account credits)', rules), 'Runway MCP server');
  assert.equal(redactText('Low-resolution probe (784×522, 6 s, 30 credits). Seen by the agent.', rules), 'Low-resolution probe. Seen by the agent.');
  assert.equal(redactText('Kostnad: cirka 590 krediter (skattat). Film 1 duger.', rules), 'Film 1 duger.');
  assert.equal(redactText('Rapport: D:/dealer-scratch/tmp/x/RAPPORT.md. Klar.', rules), 'Rapport: …. Klar.');
  assert.equal(redactText('Se C:\\Users\\jakem\\x.png och /Users/someone/y.png', rules), 'Se … och …');
  assert.equal(redactText('', rules), '');
  assert.equal(redactText('pamela-p4-c1-deal-01', rules), 'pamela-p4-c1-deal-01');
  // URLs and a turbopack base like "x:/" are not paths of this machine
  assert.deepEqual(findTextLeaks('new URL(e,"x:/") https://example.com/a', rules), []);
  assert.deepEqual(findTextLeaks('const _RESERVED_CHARS_RE = "\\\\[\\\\]\\\\.:\\\\/";', rules), []);
  assert.deepEqual(findTextLeaks('see D:/dealer-scratch/x', rules), ['lokal sökväg']);
});

test('scrub drops forbidden keys anywhere and findLeaks finds what is left', () => {
  const dirty = {a: {estimatedCredits: 60, b: [{budget: {maximumCredits: 1}, ok: 'Pamela'}]}, requestedAt: 'x', note: 'It cost 60 credits.'};
  assert.deepEqual(scrub(dirty, rules), {a: {b: [{ok: 'Pamela'}]}, note: '…'});
  assert.deepEqual(findLeaks(scrub(dirty, rules), rules), []);
  const leaks = findLeaks({x: [{taskId: 'abc'}], y: 'D:/a/b', z: 'Kevin', w: '$5'}, rules);
  assert.equal(leaks.length, 4);
});

// ── The frozen clip bank ────────────────────────────────────────────────────
// A deal and a return that starts from the deal's landing picture, which lies at a path of this machine: the frozen bank
// must hide the path and still let the return follow the deal (returnFits compares the two paths).
function fixture(): BankData & Record<string, any> {
  const landing = 'D:/private/anchors/p4-landing.png', ready = {file: {path: 'assets/anchors/ready.png', sha256: 'b'.repeat(64)}};
  const job = (id: string, kind: string, from: string, to: string, first: object, last: object, purpose: string) =>
    ({id, kind, target: 'P4.C1', from, to, model: 'wan3', duration: 3, ratio: 'auto_1080p', audio: false, promptText: 'Locked camera.', first, last, purpose});
  return {
    schemaVersion: 1, readable: true, budget: {maximumCredits: 5000},
    jobs: [job('pamela-p4-c1-deal-01', 'DEAL', 'READY', 'P4.C1', ready, {file: {path: landing}}, 'The deal to seat 4. Ordered after two probes (35 + 40 app credits).'),
      job('pamela-p4-c1-return-ready-01', 'RETURN', 'P4.C1', 'READY', {file: {path: landing}}, ready, 'Back to the shoe.')],
    derived: [], edits: [],
    motions: {
      'pamela-p4-c1-deal-01': {source: {fps: 30, frames: 90, provider: 'Runway MCP server (app account credits)'}, review: {decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-11: Bra. Det kan gå tillbaka till Astrid.'}},
      'pamela-p4-c1-return-ready-01': {source: {fps: 30, frames: 60}, review: {decision: 'PENDING'}},
    },
    receipts: {'pamela-p4-c1-deal-01': {status: 'SUCCEEDED', estimatedCredits: 60, requestedAt: '2026-11-10T21:43:47Z', completedAt: '2026-11-10T21:45:32Z', output: {bytes: 1, fps: 30, frames: 90, width: 1764, height: 1174}}},
    media: {
      'pamela-p4-c1-deal-01': {video: 'assets/motions/pamela-p4-c1-deal-01/source.mp4', first: 'assets/motions/pamela-p4-c1-deal-01/first.png', last: null, track: null, overrides: null},
      'pamela-p4-c1-return-ready-01': {video: 'assets/motions/pamela-p4-c1-return-ready-01/source.mp4', first: null, last: null, track: null, overrides: null},
    },
    revisions: {'pamela-p4-c1-deal-01': '"abc"', 'pamela-p4-c1-return-ready-01': '"def"'},
  };
}

test('the frozen bank has no cost or private field and decides exactly as the lab', () => {
  const bank = fixture();
  const before = JSON.stringify(bank);
  const shown = new Map([
    ['assets/motions/pamela-p4-c1-deal-01/source.mp4', 'assets/motions/pamela-p4-c1-deal-01/source.mp4'],
    ['assets/motions/pamela-p4-c1-deal-01/first.png', 'assets/motions/pamela-p4-c1-deal-01/first.webp'],
    ['assets/motions/pamela-p4-c1-return-ready-01/source.mp4', 'assets/motions/pamela-p4-c1-return-ready-01/source.mp4'],
  ]);
  const frozen = freezeBank(bank, shown, new Set(['pamela-p4-c1-deal-01', 'pamela-p4-c1-return-ready-01']), {...release, ...rules}, digest);
  assert.equal(JSON.stringify(bank), before, 'the lab answer is not changed');
  assert.deepEqual(findLeaks(frozen, rules), []);
  const text = JSON.stringify(frozen);
  for (const word of ['estimatedCredits', 'budget', 'maximumCredits', 'requestedAt', 'completedAt', 'credits', 'D:/', 'Astrid', '"abc"']) assert.ok(!text.includes(word), word);
  assert.deepEqual(frozen.revisions, {}, 'no revision: nothing can be saved against the copy');
  assert.deepEqual(Object.keys(frozen.receipts!['pamela-p4-c1-deal-01']), ['status', 'output']);
  assert.equal(frozen.motions!['pamela-p4-c1-deal-01'].review!.userReview, 'Jakob 2026-11-11: Bra.');
  assert.equal(frozen.media!['pamela-p4-c1-deal-01'].first, 'assets/motions/pamela-p4-c1-deal-01/first.webp');
  // the landing path is a token, the same on both sides
  const token = (frozen.jobs![0].last as {file: {path: string}}).file.path;
  assert.match(token, /^lokal\/[a-f0-9]{16}\.png$/);
  assert.equal((frozen.jobs![1].first as {file: {path: string}}).file.path, token);
  const live = buildGraph(bank), copy = buildGraph(frozen);
  assert.deepEqual(graphShape(copy), graphShape(live));
  const steps = [{from: 'READY', to: 'P4.C1'}, {from: 'P4.C1', to: 'READY'}];
  assert.deepEqual(roundShape(resolveRound(copy, steps)), roundShape(resolveRound(live, steps)));
  assert.equal(resolveRound(copy, steps)[1].take?.id, 'pamela-p4-c1-return-ready-01');
});

test('a take that is not picked keeps its verdict but shows no film', () => {
  const bank = fixture();
  const shown = new Map([['assets/motions/pamela-p4-c1-return-ready-01/source.mp4', 'assets/motions/pamela-p4-c1-return-ready-01/source.mp4']]);
  const frozen = freezeBank(bank, shown, new Set(['pamela-p4-c1-deal-01']), {...release, ...rules}, digest);
  assert.equal(frozen.media!['pamela-p4-c1-return-ready-01'].video, null);
  assert.equal(frozen.motions!['pamela-p4-c1-return-ready-01'].review!.decision, 'PENDING');
});

test('the rule picks the round, the accepted takes and the variants, and names why the rest stay', () => {
  const bank = fixture();
  const graph = buildGraph(bank);
  const round = resolveRound(graph, [{from: 'READY', to: 'P4.C1'}]);
  const out = pickTakes(graph, round, {...release, ...rules});
  assert.deepEqual(out.picked, [{id: 'pamela-p4-c1-deal-01', group: 'runda'}]);
  assert.deepEqual(out.left, [{id: 'pamela-p4-c1-return-ready-01', why: 'väntar på Jakob'}]);
  assert.deepEqual(pickTakes(graph, round, {...release, ...rules, takes: {...release.takes, waiting: true}}).picked.map(p => p.group), ['runda', 'väntar']);
});

// ── Paths of the output ─────────────────────────────────────────────────────
test('the output writer takes only plain relative paths', () => {
  for (const good of ['studio/index.html', 'studio/_next/static/chunks/a_1.js', 'assets/motions/x/first.webp', 'studio/karta/__next.karta/__PAGE__.txt']) assert.equal(safeRelative(good), true, good);
  for (const bad of ['', '/etc/x', '../x', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'C:/x', 'a/b/', 'a\0b', 'a b', '.']) assert.equal(safeRelative(bad), false, JSON.stringify(bad));
  assert.equal(prefetchAlias('karta/__next.karta/__PAGE__.txt'), 'karta/__next.karta.__PAGE__.txt');
  assert.equal(prefetchAlias('_not-found/__next._not-found/__PAGE__.txt'), '_not-found/__next._not-found.__PAGE__.txt');
  assert.equal(prefetchAlias('karta/index.txt'), null);
  assert.equal(objectName('a'.repeat(64), 'assets/motions/x/source.mp4'), `studio/${'a'.repeat(64)}.mp4`);
  assert.throws(() => objectName('xyz', 'a.mp4'));
  assert.throws(() => objectName('a'.repeat(64), 'a.exe'));
});
