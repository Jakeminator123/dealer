// The thinning tool's hard parts (tools/media-thin.ts): the guard that nothing gets past, bytes counted honestly with hard
// links, and the execution against a temporary folder (moved to a trash with RADERAD.txt and a receipt, linked, refused when
// guarded, young or changed, the trash emptied after 14 days). Needs no media: the "films" are a few bytes of text.
// Run: node --test tools/media-thin.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DAY, MARKER, blocked, carryOut, emptyShield, emptyTrash, factOf, freedBytes, guardKeys, protect, type Action, type GroupPlan, type Plan} from './media-thin.ts';
import {unitOf} from './media-audit.ts';
import {motionRegister} from './register-store.ts';

const OLD = Date.now() - 10 * DAY;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), 'media-thin-')), repo = path.join(root, 'repo');
  const put = (rel: string, text: string, when = OLD) => { const abs = path.join(repo, rel); mkdirSync(path.dirname(abs), {recursive: true}); writeFileSync(abs, text); utimesSync(abs, when / 1000, when / 1000); return rel; };
  const row = (rel: string, action: Action['action'] = 'flytta', extra: Partial<Action> = {}): Action => ({...factOf(path.join(repo, rel), rel), action, ...extra});
  return {root, repo, put, row, done: () => rmSync(root, {recursive: true, force: true})};
}
const planOf = (groups: Partial<GroupPlan>[]): Plan => ({schemaVersion: 1, about: '', made: new Date().toISOString(), trash: '', skipped: [], notes: [],
  assets: {mb: 0, files: 0, byTop: {}}, blob: {listed: 0, local: 0, mb: 0, byGroup: {}, missing: 0, changed: 0, young: 0, source: null},
  groups: groups.map(g => ({name: 'g', level: 'säkert', title: '', rule: '', units: [], count: 0, mb: 0, mbFreed: 0, examples: [], ...g}) as GroupPlan)});

test('the guard: kept collections, V6, originals, references, outside assets/, young files and guarded names never pass', () => {
  const now = Date.now(), s = emptyShield(now), fact = (p: string, mtimeMs = OLD, key = `1:${p}`) => ({path: p, mtimeMs, key});
  for (const p of ['assets/noir/v4.mp4', 'assets/films/intro/intro.mp4', 'assets/v6/frame.png', 'assets/reference/v6.mp4', 'assets/originals/a.mp4',
    'private/recovery/x.mp4', 'output/v6/a.png', 'assets/../private/x.mp4', 'assets/motions/../../x.mp4', 'data/motions.jsonl']) assert.ok(blocked(fact(p), s), p);
  assert.match(blocked(fact('assets/motions/old-01/source.mp4', now - DAY), s) ?? '', /tre dygn/);
  assert.equal(blocked(fact('assets/motions/old-01/source.mp4'), s), null);
  protect(s, 'assets/motions/good-01', 'spelet har good-01', unitOf);
  protect(s, 'assets/anchors/a1/anchor.png', 'roll i Material', unitOf);
  protect(s, 'assets/motions', 'a register naming the whole top folder', unitOf);   // too wide: guards nothing
  protect(s, 'assets/speech/paow', 'a register naming a dealer', unitOf);          // too wide as well
  assert.match(blocked(fact('assets/motions/good-01/source.mp4'), s) ?? '', /spelet har/);
  assert.match(blocked(fact('assets/anchors/a1/anchor.png'), s) ?? '', /Material/);
  assert.equal(blocked(fact('assets/anchors/a1/other.png'), s), null);
  assert.equal(blocked(fact('assets/motions/bad-01/source.mp4'), s), null);
  assert.equal(blocked(fact('assets/speech/paow/paow-tal-x-sv-01/source.mp4'), s), null);
  // A name that shares its file with a guarded one is guarded: noir's films are hard links elsewhere.
  guardKeys(s, [{path: 'assets/noir/v4.mp4', key: '7:42'}, {path: 'assets/motions/bad-01/source.mp4', key: '7:43'}]);
  assert.match(blocked(fact('assets/proofs/trailer/v4.mp4', OLD, '7:42'), s) ?? '', /samma fil som assets\/noir\/v4\.mp4/);
  assert.equal(blocked(fact('assets/proofs/other/b.mp4', OLD, '7:43'), s), null);
});

test('bytes are freed only when the last name of a file goes', () => {
  assert.equal(freedBytes([{key: 'a', bytes: 100, links: 1}]), 100);
  assert.equal(freedBytes([{key: 'a', bytes: 100, links: 2}]), 0);
  assert.equal(freedBytes([{key: 'a', bytes: 100, links: 2}, {key: 'a', bytes: 100, links: 2}]), 100);
  assert.equal(freedBytes([{key: 'a', bytes: 100, links: 3}, {key: 'a', bytes: 100, links: 3}, {key: 'b', bytes: 5, links: 1}]), 5);
});

test('carrying out: moved to the trash after both SHA-256 agree, RADERAD.txt written, the film\'s posts out of the register, guarded, young and changed units left whole', async () => {
  const t = sandbox();
  try {
    const film = t.put('assets/motions/bad-01/source.mp4', 'a rejected take'), twin = 'assets/orders/o1/take-1/after.mp4';
    mkdirSync(path.join(t.repo, path.dirname(twin)), {recursive: true}); linkSync(path.join(t.repo, film), path.join(t.repo, twin));
    t.put('assets/motions/bad-01/generation.json', '{}');
    const noir = t.put('assets/noir/v4.mp4', 'the trailer'), shared = 'assets/proofs/trailer/v4.mp4';
    mkdirSync(path.join(t.repo, path.dirname(shared)), {recursive: true}); linkSync(path.join(t.repo, noir), path.join(t.repo, shared));
    const young = t.put('assets/motions/new-01/source.mp4', 'made today', Date.now());
    const kept = t.put('assets/motions/good-01/source.mp4', 'his yes');
    const changed = t.put('assets/proofs/p9/a.png', 'before'), secret = t.put('private/recovery/x.mp4', 'never');
    const units = [
      {id: 'bad-01', reason: 'Inte bra', marker: 'assets/motions/bad-01', files: [t.row(film), t.row(twin)]},
      {id: 'trailer', reason: 'test', marker: 'assets/proofs/trailer', files: [t.row(shared)]},
      {id: 'new-01', reason: 'test', marker: null, files: [t.row(young)]},
      {id: 'good-01', reason: 'test', marker: null, files: [t.row(kept)]},
      {id: 'p9', reason: 'test', marker: null, files: [t.row(changed)]},
      {id: 'private', reason: 'test', marker: null, files: [t.row(secret)]},
    ];
    writeFileSync(path.join(t.repo, changed), 'after, and longer');
    // The register: the film that goes has its own post and a take cut from it with his verdict; the kept film has a post too.
    const register = motionRegister(t.repo), post = (id: string, clip: string, review?: unknown) => ({id, dealer: 'paow', source: {path: `assets/motions/${clip}/source.mp4`}, ...(review ? {review} : {})});
    register.putAll([post('bad-01', 'bad-01'), post('bad-01-deal', 'bad-01', {decision: 'REJECTED', userAccepted: false, userReview: 'Jakob 2026-11-20: Inte bra.'}), post('good-01', 'good-01')]);
    const shield = emptyShield();
    protect(shield, 'assets/motions/good-01', 'spelet har good-01', unitOf);
    guardKeys(shield, [factOf(path.join(t.repo, noir), noir)]);
    const trash = path.join(t.root, 'scratch', 'papperskorg'); mkdirSync(path.dirname(trash), {recursive: true});
    const {receipt, result} = await carryOut(planOf([{name: 'g', units}]), ['g'], {repo: t.repo, trash, shield, receiptDir: path.join(t.repo, '.runtime/cleanup')});

    assert.deepEqual(result.done.map(d => d.path), [film, twin]);
    assert.ok(!existsSync(path.join(t.repo, film)) && !existsSync(path.join(t.repo, twin)));
    const day = new Date().toISOString().slice(0, 10), inBin = path.join(trash, day, film);
    assert.equal(readFileSync(inBin, 'utf8'), 'a rejected take');
    assert.equal(result.done[0].sha256, sha('a rejected take'));
    assert.equal(statSync(path.join(trash, day, twin)).ino, statSync(inBin).ino, 'one file with two names is copied once');
    assert.match(readFileSync(path.join(t.repo, 'assets/motions/bad-01', MARKER), 'utf8'), /Inte bra[\s\S]*source\.mp4/);
    assert.ok(existsSync(path.join(t.repo, 'assets/motions/bad-01/generation.json')), 'what the plan does not name stays');
    for (const p of [noir, shared, young, kept, changed, secret]) assert.ok(existsSync(path.join(t.repo, p)), `${p} stays`);
    assert.deepEqual(result.skipped.map(s => s.unit), ['trailer', 'new-01', 'good-01', 'p9', 'private']);
    assert.match(result.skipped[0].reason, /samma fil som assets\/noir/);
    assert.match(result.skipped[1].reason, /tre dygn/);
    assert.match(result.skipped[2].reason, /spelet har/);
    assert.match(result.skipped[3].reason, /ändrats/);
    assert.match(result.skipped[4].reason, /utanför assets/);
    const saved = JSON.parse(readFileSync(receipt, 'utf8'));
    assert.equal(saved.done.length, 2); assert.equal(saved.error, null);
    // The film is gone, so its posts left the register with it; his verdict is kept as one row, and the kept film's post stands.
    assert.deepEqual(saved.posts, ['bad-01', 'bad-01-deal']);
    assert.deepEqual(register.ids(), ['good-01']);
    assert.deepEqual(register.removed().map(r => [r.id, r.decision, r.note]), [['bad-01-deal', 'REJECTED', 'Inte bra.']]);
    assert.match(readFileSync(path.join(t.repo, 'assets/motions/bad-01', MARKER), 'utf8'), /borttagna ur registret: bad-01, bad-01-deal/);
  } finally { t.done(); }
});

test('linking: identical bytes become one file with both names, with no trash needed; a move without a trash is refused', async () => {
  const t = sandbox();
  try {
    const keep = t.put('assets/proofs/p1/a.png', 'same bytes'), copy = t.put('assets/proofs/p2/a.png', 'same bytes');
    const units = [{id: copy, reason: `samma bytes som ${keep}`, marker: null, files: [t.row(copy, 'länka', {to: keep, sha256: sha('same bytes')})]}];
    const nowhere = path.join(t.root, 'no-disk', 'papperskorg');
    const {result} = await carryOut(planOf([{name: 'dubbletter', units}]), ['dubbletter'], {repo: t.repo, trash: nowhere, shield: emptyShield(), receiptDir: path.join(t.repo, '.runtime/cleanup')});
    assert.equal(result.done.length, 1);
    const a = statSync(path.join(t.repo, keep), {bigint: true}), b = statSync(path.join(t.repo, copy), {bigint: true});
    assert.equal(a.ino, b.ino); assert.equal(a.nlink, 2n);
    assert.equal(readFileSync(path.join(t.repo, copy), 'utf8'), 'same bytes');
    assert.ok(!readdirSync(path.join(t.repo, 'assets/proofs/p2')).some(n => n.endsWith('.gallra-lank')));
    const other = t.put('assets/proofs/p3/b.png', 'moved');
    await assert.rejects(carryOut(planOf([{name: 'g', units: [{id: 'p3', reason: '', marker: null, files: [t.row(other)]}]}]), ['g'], {repo: t.repo, trash: nowhere, shield: emptyShield(), receiptDir: path.join(t.repo, '.runtime/cleanup')}), /Korgen saknas/);
    assert.ok(existsSync(path.join(t.repo, other)));
  } finally { t.done(); }
});

test('the trash keeps 14 days', () => {
  const t = sandbox();
  try {
    const trash = path.join(t.root, 'papperskorg');
    for (const d of ['2026-11-01', '2026-11-07', '2026-11-08', '2026-11-20']) { mkdirSync(path.join(trash, d, 'assets'), {recursive: true}); writeFileSync(path.join(trash, d, 'assets', 'x.mp4'), 'x'); }
    writeFileSync(path.join(trash, 'LASMIG.txt'), 'not a day');
    const r = emptyTrash(trash, Date.parse('2026-11-21T12:00:00Z'));
    assert.deepEqual(r.removed.sort(), ['2026-11-01', '2026-11-07']);
    assert.deepEqual(readdirSync(trash).sort(), ['2026-11-08', '2026-11-20', 'LASMIG.txt']);
  } finally { t.done(); }
});
