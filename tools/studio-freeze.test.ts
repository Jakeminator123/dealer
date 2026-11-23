import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildGraph, resolveRound, type BankData, type Segment} from '../src/clip-graph.ts';
import {GAME_VOICE} from '../src/speech-lines.ts';
import {readRelease, releaseDealers, gameTakes, namedAssets, engineSource, forEngine, copyGamePage, ENGINE_ENTRY, ENGINE_CRYPTO, blockedName, blockedPath, redactText, scrub, findLeaks, findTextLeaks, pickTakes, pickProofs, freezeBank, graphShape, safeRelative, prefetchAlias, objectName, type Proof, type Release} from './studio-freeze.ts';
import {snapshotMaterial} from './studio-material.ts';

const release: Release = readRelease(JSON.parse(readFileSync(new URL('../data/studio-release.json', import.meta.url), 'utf8')));
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
/** Steps as played: per step the take, the frames and the film. */
const played = (round: Segment[]) => round.map(s => ({id: s.id, take: s.take?.id ?? null, start: s.start, end: s.end, video: s.video, gap: s.gap}));

test('the frozen Material view only names published stills and explicitly selected proof files', () => {
  const first = 'assets/motions/paow-a/first.webp', last = 'assets/motions/paow-a/last.webp';
  const video = 'assets/motions/paow-a/source.mp4', local = 'D:/private/unreleased.png';
  const proofVideo = 'assets/proofs/paow-prov/compare.mp4', omitted = 'assets/proofs/paow-prov/hidden.png';
  const privateProof = 'assets/proofs/private-other/available.png', shared = 'assets/proofs/common/table.png';
  const cut = (id: string, dealer = 'paow') => ({id, from: 'IDLE', to: 'READY', clip: id, frames: [0, 12] as [number, number], dealer});
  const bank: BankData = {
    derived: [cut('paow-a'), cut('paow-duplicate'), cut('ada-local', 'ada')],
    media: {'paow-a': {first, last, video, track: local}, 'paow-duplicate': {first}, 'ada-local': {first: local}},
  };
  const proof = (id: string, files: Proof['files']): Proof => ({id, files, title: local, description: local,
    labels: {}, verdicts: {}, updatedAt: null, chapters: null, fps: 24});
  const proofs = [proof('paow-prov', [
    {name: 'compare.mp4', path: proofVideo, kind: 'video', bytes: 2},
    {name: 'hidden.png', path: omitted, kind: 'image', bytes: 2},
    {name: 'available.png', path: privateProof, kind: 'image', bytes: 2},
  ]), proof('common', [{name: 'table.png', path: shared, kind: 'image', bytes: 2}])];
  const published = new Map([first, video, local, proofVideo, privateProof, shared].map(path => [path, 64]));
  const answer = snapshotMaterial(bank, proofs, ['paow', 'ada'], published);
  assert.deepEqual(answer.dealers.map(d => d.entries.map(e => [e.served, e.role, e.bytes])), [
    [[first, 'arbetsmaterial', 64], [proofVideo, 'referens', 64], [shared, 'arbetsmaterial', 64]],
    [[shared, 'arbetsmaterial', 64]],
  ]);
  assert.equal(answer.dealers[0].films?.from, 'api/clip-bank');
  assert.equal(answer.dealers[1].films, undefined, 'a machine path does not count as published bank media');
  assert.equal(answer.dealers[0].entries[1].fps, 24);
  assert.equal(answer.revision, null);
  assert.ok(answer.dealers.flatMap(d => d.entries).every(e => e.usedBy.length === 0 && e.fit === undefined && e.source === undefined));
  assert.ok([last, omitted, privateProof, local].every(path => !JSON.stringify(answer).includes(path)));
  assert.deepEqual(findLeaks(answer, release, 'api/media.json'), []);
});

test('the register is read strictly', () => {
  assert.equal(release.paow, true);
  assert.equal(release.variants, false, 'the variants the game never chooses stay on the computer until he says otherwise (Jakob 2026-11-21)');
  assert.deepEqual(release.proofs, [], 'no proof folder goes up (Jakob 2026-11-21)');
  assert.ok(release.blocked.folders.length && release.blocked.names.length);
  assert.throws(() => readRelease({...release, schemaVersion: 2}));
  assert.throws(() => readRelease({...release, paow: 'ja'}));
  assert.throws(() => readRelease({...release, variants: undefined}));
  // the register's old choice of takes is refused, not quietly read with another meaning
  assert.throws(() => readRelease({...release, takes: {round: true, accepted: true, variants: true, waiting: false}}), /finns inte längre/);
  assert.throws(() => readRelease({...release, round: {seats: ['P4'], reveal: true, holeCardDown: true}}), /finns inte längre/);
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
  bank.media!['kevin-p4-c1-deal-01'] = {video: 'assets/motions/kevin-p4-c1-deal-01/source.mp4'};
  const picked = pickTakes(bank, 'paow', {...release, ...rules});
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
  assert.match(off.left.find(l => l.id === 'paow-kavaj')?.why ?? '', /Paow/, 'left out, with a reason that names her');
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
  // Built code: a one-letter name before a pattern in the else-branch of a choice is not a drive (studio/lib/lipsync.ts
  // became this, and the copy could not be published 2026-11-18). A real path beside it, in any dress, still is.
  assert.deepEqual(findTextLeaks('/bredd/i.test(a)?s=i:/höjd/i.test(a)?t=i:0===l&&(s=t=i)', rules), []);
  assert.deepEqual(findTextLeaks('x?y:/a\\/b+/.exec(c)', rules), []);
  for (const real of ['root=D:/x/y', '"C:\\\\Users\\\\jakem"', 'e?s=i:/höjd/i.test(a):"D:/dealer-scratch/tmp"', 'D:/a/i.testfile', 'c:/i.test/x', 'file:///C:/Users/jakem/x'])
    assert.deepEqual(findTextLeaks(real, rules), ['lokal sökväg'], real);
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
  assert.deepEqual(played(resolveRound(copy, steps)), played(resolveRound(live, steps)));
  assert.equal(resolveRound(copy, steps)[1].take?.id, 'pamela-p4-c1-return-ready-01');
});

test('a take that is not picked keeps its verdict but shows no film', () => {
  const bank = fixture();
  const shown = new Map([['assets/motions/pamela-p4-c1-return-ready-01/source.mp4', 'assets/motions/pamela-p4-c1-return-ready-01/source.mp4']]);
  const frozen = freezeBank(bank, shown, new Set(['pamela-p4-c1-deal-01']), {...release, ...rules}, digest);
  assert.equal(frozen.media!['pamela-p4-c1-return-ready-01'].video, null);
  assert.equal(frozen.motions!['pamela-p4-c1-return-ready-01'].review!.decision, 'PENDING');
});

test('the game decides what goes up: what it plays goes up, a take that waits for Jakob stays with the reason, and a dealer outside the Casino has none', () => {
  const bank = fixture();
  const out = pickTakes(bank, 'paow', {...release, ...rules});
  assert.deepEqual(out.picked, [{id: 'pamela-p4-c1-deal-01', group: 'spel'}]);
  assert.deepEqual(out.left, [{id: 'pamela-p4-c1-return-ready-01', why: 'spelet spelar den inte'}]);
  const off = pickTakes(bank, 'paow', {...release, ...rules, casino: {on: false, dealers: []}});
  assert.deepEqual([off.picked, off.left.map(l => l.why)], [[], ['dealern spelas inte i Casino', 'dealern spelas inte i Casino']]);
});

test('a variant the game never chooses itself goes up only with variants on; one it plays (the only film of a step, a rest) always goes up', () => {
  const bank = fixture(), variant = {decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true};
  bank.motions!['pamela-p4-c1-return-ready-01'].review = {decision: 'ACCEPTED', by: 'huvudagent'} as never;
  const add = (id: string, job: object, motion: object) => { bank.jobs!.push({...bank.jobs![0], id, ...job} as never); bank.motions![id] = {source: {fps: 30, frames: 90}, ...motion, review: variant} as never; bank.media![id] = {video: `assets/motions/${id}/source.mp4`}; };
  add('pamela-p4-c1-deal-02', {}, {}); // beside the accepted deal: the game never plays it
  add('pamela-p5-c1-deal-01', {target: 'P5.C1', to: 'P5.C1'}, {}); // the only film of its step: the game plays it
  add('pamela-idle-smile-01', {kind: 'IDLE', target: undefined, from: 'IDLE', to: 'IDLE'}, {motion: {idle: {onRequest: false, calm: false, weight: 2}}}); // a gesture of her rest
  const off = pickTakes(bank, 'paow', {...release, ...rules});
  assert.deepEqual(Object.fromEntries(off.picked.map(p => [p.id, p.group])), {'pamela-p4-c1-deal-01': 'spel', 'pamela-p4-c1-return-ready-01': 'spel', 'pamela-p5-c1-deal-01': 'spel', 'pamela-idle-smile-01': 'spel'});
  assert.deepEqual(off.left, [{id: 'pamela-p4-c1-deal-02', why: 'variant som spelet inte väljer själv (variants är av)'}]);
  const on = pickTakes(bank, 'paow', {...release, ...rules, variants: true});
  assert.deepEqual(on.picked.find(p => p.id === 'pamela-p4-c1-deal-02'), {id: 'pamela-p4-c1-deal-02', group: 'variant'});
  assert.deepEqual(on.left, []);
});

test('a deal from another pose at the shoe goes up when the game can deal from there, also when its films are variants', () => {
  const bank = fixture(), variant = {decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true};
  bank.motions!['pamela-p4-c1-return-ready-01'].review = {decision: 'ACCEPTED', by: 'huvudagent'} as never;
  const add = (id: string, kind: string, from: string, to: string, target: string | undefined) => { bank.jobs!.push({...bank.jobs![0], id, kind, from, to, target} as never); bank.motions![id] = {source: {fps: 30, frames: 90}, review: variant} as never; bank.media![id] = {video: `assets/motions/${id}/source.mp4`}; };
  // The four films of READY-B (src/game-director.ts hubSteps), all variants beside the plain deal and return.
  add('pamela-in-b-01', 'ENTRY', 'IDLE', 'READY-B', undefined);
  add('pamela-p4-c1-b-deal-01', 'DEAL', 'READY-B', 'P4.C1', 'P4.C1');
  add('pamela-p4-c1-b-return-01', 'RETURN', 'P4.C1', 'READY-B', 'P4.C1');
  add('pamela-out-b-01', 'RETURN', 'READY-B', 'IDLE', undefined);
  const off = pickTakes(bank, 'paow', {...release, ...rules});
  assert.deepEqual(off.picked.map(p => p.id).filter(id => id.includes('-b-')).sort(), ['pamela-in-b-01', 'pamela-out-b-01', 'pamela-p4-c1-b-deal-01', 'pamela-p4-c1-b-return-01']);
});

test('a take Jakob has archived is never picked: its film does not go up, whatever its verdict, and the copy still decides as the lab', () => {
  const bank = fixture(), archived = {by: 'Jakob', at: '2026-11-18T01:00:00.000Z', where: 'Karta'}, rule = {...release, ...rules, variants: true};
  bank.motions!['pamela-p4-c1-return-ready-01'].review = {decision: 'ACCEPTED', by: 'huvudagent'} as never;
  // A second deal he accepted outright and a variant, both of which the game could play, and both archived; the step plays the first deal.
  for (const [id, review] of [['pamela-p4-c1-deal-02', {decision: 'ACCEPTED', userAccepted: true, archived}], ['pamela-p4-c1-deal-03', {decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true, archived}]] as [string, object][]) {
    bank.jobs!.push({...bank.jobs![0], id}); bank.motions![id] = {source: {fps: 30, frames: 90}, review}; bank.media![id] = {video: `assets/motions/${id}/source.mp4`};
  }
  const graph = buildGraph(bank), steps = [{from: 'READY', to: 'P4.C1'}], round = resolveRound(graph, steps);
  assert.equal(round[0].take?.id, 'pamela-p4-c1-deal-01');
  const out = pickTakes(bank, 'paow', rule);
  assert.deepEqual(out.picked.map(p => p.id), ['pamela-p4-c1-deal-01', 'pamela-p4-c1-return-ready-01']);
  assert.deepEqual(out.left, [{id: 'pamela-p4-c1-deal-02', why: 'arkiverad'}, {id: 'pamela-p4-c1-deal-03', why: 'arkiverad'}]);
  assert.deepEqual(out.refused, []);
  // The frozen bank lists them without a film, with the field, so the copy's graph leaves them out of play as the lab's does.
  const shown = new Map([['assets/motions/pamela-p4-c1-deal-01/source.mp4', 'assets/motions/pamela-p4-c1-deal-01/source.mp4']]);
  const frozen = freezeBank(bank, shown, new Set(out.picked.map(p => p.id)), rule, digest), copy = buildGraph(frozen);
  assert.deepEqual([frozen.media!['pamela-p4-c1-deal-02'].video, frozen.media!['pamela-p4-c1-deal-03'].video, copy.takes['pamela-p4-c1-deal-02'].archived], [null, null, true]);
  assert.deepEqual(graphShape(copy), graphShape(graph));
  assert.deepEqual(played(resolveRound(copy, steps)), played(round));
  assert.deepEqual(findLeaks(frozen, rule), [], 'who archived it and when is no cost, path or blocked name');
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

// ── The register's switches for the scene and the game ──────────────────────
test('the presets and the game are switches of their own, and the game names only dealers the copy carries', () => {
  // the register's own values, whatever they are today: the game names only dealers the copy carries
  assert.equal(typeof release.presets, 'boolean');
  for (const d of release.casino.dealers) assert.ok(releaseDealers(release).includes(d), `${d} is carried`);
  assert.ok(!releaseDealers({paow: false}).includes('paow'), 'a dealer switched off is not carried');
  assert.throws(() => readRelease({...release, presets: 'ja'}));
  assert.throws(() => readRelease({...release, casino: {on: true, dealers: []}}));
  assert.throws(() => readRelease({...release, casino: {on: true, dealers: ['paow', 'paow']}}));
  assert.throws(() => readRelease({...release, casino: {on: true, dealers: ['Paow']}}));
  assert.throws(() => readRelease({...release, paow: false, casino: {on: true, dealers: ['paow']}}), /paow är avslagen/);
  assert.throws(() => readRelease({...release, casino: undefined}));
  assert.deepEqual(readRelease({...release, casino: {on: false, dealers: []}}).casino, {on: false, dealers: []});
});

test("the game's takes are those it can play: a verdict, Jakob's or a provisional one, or a talk film; they go up as spel", () => {
  const bank = fixture();
  // the return gets a provisional verdict, given in Jakob's place: the game plays it, the rule for his accepted takes does not pick it
  bank.motions!['pamela-p4-c1-return-ready-01'].review = {decision: 'ACCEPTED', by: 'huvudagent'} as never;
  // a talk film: a rest take played on request, waiting for Jakob; and a rest take that only waits, which the game never plays
  const idle = (id: string, onRequest: boolean) => {
    bank.jobs!.push({...bank.jobs![0], id, kind: 'IDLE', target: undefined, from: 'IDLE', to: 'IDLE', first: {file: {path: 'assets/anchors/idle.png'}}, last: {file: {path: 'assets/anchors/idle.png'}}} as never);
    bank.motions![id] = {source: {fps: 30, frames: 90}, motion: {idle: {onRequest, calm: true}}, review: {decision: 'PENDING'}} as never;
    bank.media![id] = {video: `assets/motions/${id}/source.mp4`, first: null, last: null, track: null, overrides: null};
  };
  idle('pamela-tal-hej-01', true);
  idle('pamela-vila-vantar-01', false);
  const game = gameTakes(bank, 'paow');
  assert.deepEqual([...game].sort(), ['pamela-p4-c1-deal-01', 'pamela-p4-c1-return-ready-01', 'pamela-tal-hej-01']);
  assert.deepEqual([...gameTakes(bank, 'ada')], [], 'another dealer has none of these');
  const {picked, left} = pickTakes(bank, 'paow', {...release, ...rules});
  assert.deepEqual(Object.fromEntries(picked.map(p => [p.id, p.group])), {'pamela-p4-c1-deal-01': 'spel', 'pamela-p4-c1-return-ready-01': 'spel', 'pamela-tal-hej-01': 'spel'});
  assert.ok(left.some(l => l.id === 'pamela-vila-vantar-01' && l.why === 'spelet spelar den inte'));
});

test('of a spoken line the copy carries the film the game says: a newer take replaces an older, his own accepted take goes first', () => {
  const bank = fixture();
  const says = (id: string, line: string, voice: string, review: Record<string, unknown>) => {
    bank.jobs!.push({...bank.jobs![0], id, kind: 'IDLE', target: undefined, from: 'IDLE', to: 'IDLE', first: {file: {path: 'assets/anchors/idle.png'}}, last: {file: {path: 'assets/anchors/idle.png'}}} as never);
    bank.motions![id] = {source: {fps: 24, frames: 60}, motion: {idle: {onRequest: true, calm: true}}, speech: {line, language: 'sv', text: 'Hej!', voice}, review} as never;
    bank.media![id] = {video: `assets/motions/${id}/source.mp4`, first: null, last: null, track: null, overrides: null};
  };
  const forHim = {decision: 'ACCEPTED', provisional: {by: 'huvudagenten'}}, his = {decision: 'ACCEPTED', userAccepted: true};
  says('pamela-tal-hej-sv-09', 'hej', GAME_VOICE, forHim); says('pamela-tal-hej-sv-10', 'hej', GAME_VOICE, forHim); // re-laid: 10 replaces 09
  says('pamela-tal-win-sv-04', 'win', GAME_VOICE, his); says('pamela-tal-win-sv-13', 'win', GAME_VOICE, forHim); // his own goes first, whatever the numbers
  says('pamela-tal-lose-sv-02', 'lose', 'Jessica', forHim); // another voice: the game does not say it
  const game = gameTakes(bank, 'paow');
  assert.deepEqual([...game].filter(id => id.includes('-tal-')).sort(), ['pamela-tal-hej-sv-10', 'pamela-tal-win-sv-04']);
  const {picked, left} = pickTakes(bank, 'paow', {...release, ...rules});
  const groups = Object.fromEntries(picked.map(p => [p.id, p.group]));
  assert.equal(groups['pamela-tal-hej-sv-10'], 'spel'); assert.equal(groups['pamela-tal-win-sv-04'], 'spel', 'his own accepted take goes up because the game says it');
  for (const id of ['pamela-tal-hej-sv-09', 'pamela-tal-win-sv-13', 'pamela-tal-lose-sv-02']) { assert.equal(groups[id], undefined, id); assert.ok(left.some(l => l.id === id), `${id} is named among those left`); }
});

test('the files a module names by a plain path are found; a path built at run time or leaving the folder is not', () => {
  const text = "const a = 'assets/scene/table.png', b = \"assets/props/tray.glb\", c = `assets/scene/thumbs/room-${id}.jpg`;\n" +
    "load('assets/scene/rooms/venedig-liv.mp4'); load('assets/scene/table.png'); load('assets/../secret.png'); load('assets/x.exe'); load('data/x.json');";
  assert.deepEqual(namedAssets(text), ['assets/props/tray.glb', 'assets/scene/rooms/venedig-liv.mp4', 'assets/scene/table.png']);
});

// ── The game in the copy ────────────────────────────────────────────────────
test("the engine's modules are game/ and the two of cloud/studio, under /engine/, and node:crypto becomes the shim", () => {
  assert.equal(engineSource('/engine/game/rng.js'), 'game/rng.ts');
  assert.equal(engineSource(ENGINE_ENTRY), 'cloud/studio/game-local.ts');
  for (const other of ['/engine/cloud/studio/lock.js', '/engine/game/../tools/x.js', '/engine/game/sub/x.js', '/game-page.js', '/engine/game/rng.ts']) assert.equal(engineSource(other), null, other);
  assert.equal(forEngine("import { createHash, randomFillSync } from 'node:crypto';\nexport const x = 1;", '/engine/game/rng.js'), "import { createHash, randomFillSync } from '../cloud/studio/node-crypto.js';\nexport const x = 1;");
  assert.equal(forEngine('import {a} from "node:crypto";', ENGINE_ENTRY), 'import {a} from "./node-crypto.js";');
  assert.throws(() => forEngine("import {readFile} from 'node:fs';", '/engine/game/rng.js'), /node:fs/);
  assert.throws(() => forEngine('', '/scene3d-view.js'));
  // whole-line comments go (their lines stay, empty); code, and a comment after code, are left as they are
  assert.equal(forEngine("// ported from Kevin's croupier\nconst url = 'https://x//y'; // a note\n  // indented\nexport {url};", '/engine/game/round.js'), "\nconst url = 'https://x//y'; // a note\n\nexport {url};");
  assert.throws(() => forEngine('const t = `one\n// two\nthree`;', '/engine/game/round.js'), /malltext/);
  assert.doesNotThrow(() => forEngine('const t = `one ${1} two`; // `x` and `y`', '/engine/game/round.js'));
  // every engine module of the repo is made ready without a blocked name left in it
  for (const name of readdirSync(new URL('../game/', import.meta.url)).filter(n => n.endsWith('.ts'))) {
    const text = forEngine(readFileSync(new URL(`../game/${name}`, import.meta.url), 'utf8'), `/engine/game/${name.replace(/\.ts$/, '.js')}`);
    assert.deepEqual(findTextLeaks(text, release), [], name);
  }
});

test("the copy's game.html is the lab's without the tab stream and with the engine before the page", () => {
  const html = readFileSync(new URL('../game/page/game.html', import.meta.url), 'utf8');
  const copy = copyGamePage(html), engine = `<script type="module" src="${ENGINE_ENTRY}"></script>\n`, tab = '<script type="module" src="preview-ui.js"></script>\n';
  assert.ok(!copy.includes('preview-ui.js'));
  assert.ok(copy.indexOf(engine) > 0 && copy.indexOf(engine) < copy.indexOf('src="game-page.js"'));
  assert.equal(copy.replace(engine, ''), html.replace(tab, ''));
  assert.throws(() => copyGamePage(html.replace('game-page.js', 'spel.js')));
  assert.throws(() => copyGamePage(html.replace(tab, '')));
});

test("the shim of node:crypto hashes as Node does, copies a hash in progress, and its Buffer reads and writes as Node's", async () => {
  const shim = await import('../cloud/studio/node-crypto.ts');
  const node = await import('node:crypto');
  for (let n = 0; n < 300; n += 7) {
    const bytes = node.randomBytes(n);
    assert.equal(shim.createHash('sha256').update(bytes).digest('hex'), node.createHash('sha256').update(bytes).digest('hex'), `length ${n}`);
  }
  const text = 'game-rng/1\nsecure\nÅÄÖ \u{1F0A1}';
  assert.equal(shim.createHash('sha256').update(text, 'utf8').digest('hex'), node.createHash('sha256').update(text, 'utf8').digest('hex'));
  // in pieces, and a copy taken half-way goes on by itself
  const a = shim.createHash('sha256').update('abc'.repeat(40)), twin = a.copy();
  a.update('x'); twin.update('y');
  assert.equal(a.digest('hex'), node.createHash('sha256').update('abc'.repeat(40) + 'x').digest('hex'));
  assert.deepEqual([...(twin.digest() as Uint8Array)], [...node.createHash('sha256').update('abc'.repeat(40) + 'y').digest()]);
  assert.throws(() => a.update('z'));
  assert.throws(() => shim.createHash('md5'));
  const B = shim.ShimBuffer;
  assert.equal(B.from('hej då', 'utf8').toString('hex'), Buffer.from('hej då', 'utf8').toString('hex'));
  assert.equal(B.from('hej då', 'utf8').toString(), 'hej då');
  assert.equal(B.from('00ff10', 'hex').toString('hex'), '00ff10');
  assert.equal(B.from([1, 2, 300]).toString('hex'), Buffer.from([1, 2, 300]).toString('hex'));
  const big = B.alloc(16), nodeBig = Buffer.alloc(16);
  big.writeBigUInt64BE(0x0102030405060708n, 8); nodeBig.writeBigUInt64BE(0x0102030405060708n, 8);
  assert.deepEqual([...big], [...nodeBig]);
  assert.equal(big.readUInt32BE(12), nodeBig.readUInt32BE(12));
  const into = new Uint8Array(4);
  assert.equal(B.from('abcdef').copy(into, 1), 3);
  assert.deepEqual([...into], [0, 97, 98, 99]);
  assert.ok(big.map(x => x ^ 1) instanceof B, 'map keeps the shim');
  const many = shim.randomFillSync(new Uint8Array(70000));
  assert.ok(many.subarray(0, 65536).some(x => x !== 0) && many.subarray(65536).some(x => x !== 0), 'more than one call of getRandomValues');
  assert.match(shim.randomBytes(32).toString('hex'), /^[0-9a-f]{64}$/);
  assert.match(shim.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

/** The engine's folder as the copy ships it (every module from ENGINE_ENTRY on, made ready as the build does), in a temp folder. */
async function engineFolder(): Promise<{dir: string; url: (address: string) => string}> {
  const {mkdtemp, mkdir, writeFile} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join, dirname} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  const {forBrowser} = await import('./lab-routes.ts');
  const dir = await mkdtemp(join(tmpdir(), 'studio-engine-'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const queue = [ENGINE_ENTRY], seen = new Set<string>();
  while (queue.length) {
    const address = queue.shift()!;
    if (seen.has(address)) continue;
    seen.add(address);
    const source = engineSource(address);
    assert.ok(source, `outside the engine: ${address}`);
    const text = forEngine(forBrowser(readFileSync(new URL(`../${source}`, import.meta.url), 'utf8')), address);
    for (const m of text.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]+?from\s*)?(['"])([^'"\n]+)\1/g)) queue.push(new URL(m[2], 'http://copy' + address).pathname);
    const file = join(dir, ...address.slice(1).split('/'));
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file, text);
  }
  assert.ok(seen.has(ENGINE_CRYPTO) && seen.has('/engine/game/session.js'), [...seen].join(' '));
  return {dir, url: (address: string) => pathToFileURL(join(dir, ...address.slice(1).split('/'))).href};
}

test('the engine as the copy ships it plays a round in the page, answers as the lab server does, and shuffles as game/ does', async () => {
  const {rm} = await import('node:fs/promises');
  const folder = await engineFolder();
  try {
    const local = await import(folder.url(ENGINE_ENTRY));
    const answer = local.localEngine();
    const at = (p: string) => new URL(p, 'https://kopian.example/game.html');
    assert.equal(answer('GET', at('/data/scene-rooms.json'), null), null, 'not the engine: on to the network');
    const first = answer('GET', at('/api/game?table=bord-1'), null);
    assert.equal(first.status, 200);
    assert.equal(first.body.balance, 1000);
    assert.equal(first.body.view.shoe.source, 'secure');
    let ver = first.body.ver, n = 0, state = first.body;
    const send = (command: Record<string, unknown>) => {
      const out = answer('POST', at('/api/game/command?table=bord-1'), JSON.stringify({...command, requestId: `r${++n}`, expectedVersion: ver}));
      assert.equal(out.status, 200, JSON.stringify(out.body));
      ver = out.body.ver; state = out.body;
      return out.body;
    };
    send({op: 'start', bets: [{seat: 4, main: 25}]});
    for (let i = 0; i < 12 && state.view.round?.phase !== 'settled'; i++) {
      const r = state.view.round, v = state.view;
      if (r.phase === 'insurance') send({op: 'insurance', roundId: v.roundId, take: false});
      else if (state.legalActions.includes('stand')) send({op: 'act', action: 'stand', seat: r.activeSeat, handIndex: r.active, roundId: v.roundId, turnSeq: v.turnSeq});
      else break;
    }
    assert.equal(state.view.round.phase, 'settled');
    send({op: 'collect', roundId: state.view.roundId});
    // the table is kept: the next read is the same session
    assert.equal(answer('GET', at('/api/game?table=bord-1'), null).body.ver, ver);
    // the lab server's refusals, in the lab's words
    assert.equal(answer('POST', at('/api/game/command?table=bord-1'), JSON.stringify({op: 'start', bets: [{seat: 4, main: 25}], requestId: 'gammal', expectedVersion: 0})).status, 409);
    assert.equal(answer('POST', at('/api/game/command?table=bord-1'), '{inte json').body.error.code, 'INVALID_COMMAND');
    assert.equal(answer('GET', at('/api/game?table=Bord!'), null).status, 400);
    assert.equal(answer('PUT', at('/api/game/command'), '{}').status, 405);
    assert.equal(answer('POST', at('/api/game/new?table=bord-1'), JSON.stringify({shoe: {mode: 'stacked', seed: 'x', cards: []}})).status, 403, 'no lab shoe in the copy');
    const fresh = answer('POST', at('/api/game/new?table=bord-1'), JSON.stringify({balance: 500}));
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.balance, 500);
    assert.equal(fresh.body.ver, 0);
    // in front of a page's fetch: the engine's addresses on the page's own origin, and nothing else
    const asked: string[] = [];
    const page = {location: {href: 'https://kopian.example/game.html?table=x'}, fetch: async (input: RequestInfo | URL) => { asked.push(input instanceof Request ? input.url : String(input)); return new Response('{}'); }};
    local.install(page);
    assert.equal((await (await page.fetch('api/game?table=x')).json()).balance, 1000);
    assert.equal((await page.fetch(new Request('https://kopian.example/api/game/command?table=x', {method: 'POST', body: '{inte json'}))).status, 400);
    await page.fetch('data/scene-rooms.json');
    await page.fetch('https://annan.example/api/game');
    assert.deepEqual(asked, ['data/scene-rooms.json', 'https://annan.example/api/game']);
    // the seeded shoe of game/rng.ts draws the same cards through the shim (its HMAC copies a hash in progress), with the same proof
    const copyRng = await import(folder.url('/engine/game/rng.js')), labRng = await import('../game/rng.ts');
    const draw = (m: typeof labRng) => { const rng = m.createRng({mode: 'seeded', seed: 'kopian', allowDeterministic: true}); return {order: rng.shuffle([...Array(52).keys()]), proof: rng.proof()}; };
    assert.deepEqual(draw(copyRng), draw(labRng));
  } finally {
    await rm(folder.dir, {recursive: true, force: true});
  }
});
