// What must hold of the register of films and takes (tools/register-store.ts): a post comes out as it went in, a write is
// made only against the revision that was read, a removed film takes the posts of its takes with it and leaves the row
// about Jakob's verdict, the database follows the text file in Git, and a tree without media never empties the register.
// Every write goes to a temporary folder; the checkout's own register is only read.
// Run: node --test tools/register-store.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MOTIONS_TEXT, REGISTER_DB, REMOVED_TEXT, motionRegister, parseRegisterText, revisionOf, sweepMotions} from './register-store.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
function temp(t: {after(fn: () => void): void}) {
  const root = mkdtempSync(path.join(base, 'register-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}
const fails = (status: number) => (error: unknown) => (error as {status?: number}).status === status;
const text = (root: string, file = MOTIONS_TEXT) => readFileSync(path.join(root, file), 'utf8');
const his = {decision: 'ACCEPTED', acceptedAs: 'MAIN', userAccepted: true, userReview: 'Jakob 2026-11-20: Den här är bäst.'};
/** A film cut into a deal and a return, as register-order writes them: every post names the film's file. */
const film = (id: string, review: Record<string, unknown> = {decision: 'PENDING', userAccepted: false}) => [
  {schemaVersion: 1, id, dealer: 'paow', source: {path: `assets/motions/${id}/source.mp4`, frames: 210, fps: 30, model: 'wan3'}, order: {id: id.slice(0, -3), take: 1}, cutInto: [`${id}-deal`, `${id}-return-ready`], review: {decision: 'PENDING'}},
  {schemaVersion: 1, id: `${id}-deal`, dealer: 'paow', source: {path: `assets/motions/${id}/source.mp4`, frames: 210, fps: 30, model: 'wan3'}, order: {id: id.slice(0, -3), take: 1}, motion: {kind: 'DEAL', from: 'READY', to: 'P4.C1'}, review},
  {schemaVersion: 1, id: `${id}-return-ready`, dealer: 'paow', source: {path: `assets/motions/${id}/source.mp4`, frames: 210, fps: 30, model: 'wan3'}, motion: {kind: 'RETURN', from: 'P4.C1', to: 'READY'}, review: {decision: 'PENDING', userAccepted: false}},
];
const jobsOf = (ids: string[]) => ({jobs: ids.map(id => ({id, from: 'READY', to: 'READY'})), derived: ids.flatMap(id => [{id: `${id}-deal`, clip: id, frames: [0, 99]}, {id: `${id}-return-ready`, clip: id, frames: [100, 209]}]), edits: []});

test('a post comes out as it went in: same values, same key order, same revision as its file had; the text is one line per post, sorted on id', t => {
  const root = temp(t), register = motionRegister(root);
  const odd = {zeta: 1, id: 'paow-b-01', alpha: {nested: [3, 1, 2], 'å ä ö': 'Jakob 2026-11-20: "citat" och\nny rad', empty: null, deep: {b: 1, a: [true, false, 0.1, -0, 1e21]}}, review: his, text: 'a\ttab \u2028 line'};
  const second = {id: 'paow-a-01', source: {path: 'assets/motions/paow-a-01/source.mp4'}, review: {decision: 'PENDING'}};
  const saved = register.put('paow-b-01', odd, {revision: null});
  register.put('paow-a-01', second);
  const back = register.get('paow-b-01')!;
  assert.deepEqual(back, JSON.parse(JSON.stringify(odd)));
  assert.equal(JSON.stringify(back), JSON.stringify(odd), 'the keys stand in the order they were written');
  // The revision is the hash of the post written as its JSON file was: the lab's revision of a verdict is unchanged by the move.
  assert.equal(saved.revision, revisionOf(odd)); assert.equal(register.entry('paow-b-01')!.revision, saved.revision);
  assert.equal(text(root), JSON.stringify(second) + '\n' + JSON.stringify(odd) + '\n');
  assert.deepEqual(register.ids(), ['paow-a-01', 'paow-b-01']); assert.equal(register.has('paow-a-01'), true); assert.equal(register.get('paow-none-01'), null);
  // The same post written again changes nothing: the text file is not touched.
  const before = text(root);
  assert.equal(register.put('paow-b-01', odd).revision, saved.revision); assert.equal(text(root), before);
  // A post carries its own id and is a JSON object; an id that could leave the register is refused.
  assert.throws(() => register.put('paow-c-01', {id: 'paow-b-01'}), fails(422));
  assert.throws(() => register.put('paow-c-01', [] as never), fails(422));
  assert.throws(() => register.put('../data/x', {id: '../data/x'}), fails(400));
  assert.equal(text(root), before);
});

test('the checkout\'s own register: every line of the text comes out of the database as it stands in the text', () => {
  if (!existsSync(MOTIONS_TEXT)) return; // before the move (node tools/register.ts migrate) there is no text here
  const lines = readFileSync(MOTIONS_TEXT, 'utf8').split('\n').filter(Boolean), posts = parseRegisterText(lines.join('\n'), MOTIONS_TEXT), entries = motionRegister(process.cwd()).list();
  assert.equal(entries.length, lines.length);
  assert.deepEqual(entries.map(e => e.id), posts.map(p => String(p.id)).sort(), 'sorted on id, no id twice');
  entries.forEach((entry, i) => {
    assert.equal(JSON.stringify(entry.post), lines[i], entry.id);
    assert.deepEqual(entry.post, posts[i], entry.id);
    assert.equal(entry.revision, revisionOf(posts[i]), entry.id);
  });
});

test('a write is made only against the revision that was read', t => {
  const root = temp(t), register = motionRegister(root), [post] = film('paow-giv-01');
  const first = register.put(post.id, post, {revision: null});
  assert.throws(() => register.put(post.id, post, {revision: null}), fails(409), 'a post that must be new is already there');
  assert.throws(() => register.put(post.id, {...post, review: his}, {revision: '"stale"'}), fails(409));
  assert.throws(() => register.put('paow-none-01', {id: 'paow-none-01'}, {revision: first.revision}), fails(404));
  assert.throws(() => register.patch(post.id, {review: his}, {revision: '"stale"'}), fails(409));
  assert.throws(() => register.patch('paow-none-01', {review: his}), fails(404));
  assert.deepEqual(register.get(post.id), post, 'nothing was written by a refused write');
  // Two writers holding the same revision: the first is saved, the second is told to read again.
  const second = register.patch(post.id, p => ({...p, review: his}), {revision: first.revision});
  assert.notEqual(second.revision, first.revision); assert.deepEqual(second.before, post);
  assert.throws(() => register.patch(post.id, p => ({...p, review: {decision: 'REJECTED'}}), {revision: first.revision}), fails(409));
  assert.deepEqual(register.get(post.id)!.review, his);
  assert.deepEqual(Object.keys(register.get(post.id)!), Object.keys(post), 'a changed block stays where it stood');
});

test('a removed film takes the posts of its takes and their job entries with it; his verdict is kept as one row', t => {
  const root = temp(t), register = motionRegister(root);
  register.putAll([...film('paow-giv-01', his), ...film('paow-giv-02', {decision: 'ACCEPTED', userAccepted: false, provisional: {by: 'huvudagenten', at: 'x', mandate: 'm', note: 'n'}}), ...film('paow-giv-03')]);
  mkdirSync(path.join(root, 'data'), {recursive: true});
  writeFileSync(path.join(root, 'data/clip-jobs.json'), JSON.stringify(jobsOf(['paow-giv-01', 'paow-giv-02', 'paow-giv-03']), null, 2) + '\n');
  assert.deepEqual(register.ofFilm('paow-giv-01').map(e => e.id), ['paow-giv-01', 'paow-giv-01-deal', 'paow-giv-01-return-ready']);

  const gone = register.remove('paow-giv-01', {why: 'filmen gallrad', at: '2026-11-23T20:00:00.000Z'});
  assert.deepEqual(gone.removed, ['paow-giv-01', 'paow-giv-01-deal', 'paow-giv-01-return-ready']);
  assert.deepEqual(register.ids().filter(id => id.startsWith('paow-giv-01')), [], 'the film and every take cut from it');
  assert.equal(register.ids().length, 6, 'the other films stand');
  // One row about his verdict, in a table and a text of its own that no removal cascades to.
  const row = {id: 'paow-giv-01-deal', film: 'paow-giv-01', dealer: 'paow', step: 'DEAL READY>P4.C1', model: 'wan3', order: 'paow-giv', decision: 'ACCEPTED', acceptedAs: 'MAIN', by: 'Jakob', at: '2026-11-20',
    note: 'Den här är bäst.', removedAt: '2026-11-23T20:00:00.000Z', why: 'filmen gallrad'};
  assert.deepEqual(gone.verdicts, [row]); assert.deepEqual(register.removed(), [row]);
  assert.equal(text(root, REMOVED_TEXT), JSON.stringify(row) + '\n');
  // The job file loses the film's entries and keeps the rest as it was.
  assert.equal(gone.jobs, 3);
  assert.deepEqual(JSON.parse(text(root, 'data/clip-jobs.json')), jobsOf(['paow-giv-02', 'paow-giv-03']));

  // A verdict given for him is not his: the film goes without a row. A take alone leaves its film and its name in cutInto.
  assert.deepEqual(register.remove('paow-giv-02', {why: 'filmen gallrad'}).verdicts, []);
  const take = register.remove('paow-giv-03-deal', {why: 'tagningen togs bort'});
  assert.deepEqual(take.removed, ['paow-giv-03-deal']); assert.deepEqual(take.films, []);
  assert.deepEqual(register.ids(), ['paow-giv-03', 'paow-giv-03-return-ready']);
  assert.deepEqual(register.get('paow-giv-03')!.cutInto, ['paow-giv-03-return-ready']);
  assert.deepEqual(JSON.parse(text(root, 'data/clip-jobs.json')).derived.map((d: {id: string}) => d.id), ['paow-giv-03-return-ready']);
  // The rows stay when everything else has gone, and a removal says why.
  register.remove('paow-giv-03', {why: 'filmen gallrad'});
  assert.deepEqual(register.ids(), []); assert.deepEqual(register.removed(), [row]);
  assert.throws(() => register.remove('paow-giv-03', {why: ' '}), fails(400));
});

test('the text file is the truth: the database follows a changed text and is made again when it is gone; a broken line stops the read', t => {
  const root = temp(t), register = motionRegister(root), posts = film('paow-giv-01', his);
  register.putAll(posts);
  const whole = text(root);
  // Another checkout's commit arrives (a pull, a merge): the text has one post more and one changed.
  const pulled = [...posts.slice(0, 2), {...posts[2], review: {decision: 'REJECTED'}}, {id: 'paow-vila-01', source: {path: 'assets/motions/paow-vila-01/source.mp4'}}];
  writeFileSync(path.join(root, MOTIONS_TEXT), pulled.map(p => JSON.stringify(p) + '\n').join(''));
  assert.deepEqual(register.list().map(e => e.post), pulled);
  assert.deepEqual(register.ofFilm('paow-vila-01').map(e => e.id), ['paow-vila-01']);
  // The database is only a working copy: deleted, it is made again from the text, his verdict with it.
  rmSync(path.join(root, REGISTER_DB));
  assert.deepEqual(register.get('paow-giv-01-deal')!.review, his); assert.equal(register.status().posts, 4);
  // A line that is not a whole post (a merge that collided) is said, with its line, and nothing is repaired or dropped.
  const broken = whole + '<<<<<<< HEAD\n';
  writeFileSync(path.join(root, MOTIONS_TEXT), broken);
  assert.throws(() => register.list(), (error: unknown) => fails(422)(error) && /rad 4/.test((error as Error).message));
  assert.throws(() => register.patch('paow-giv-01-deal', {review: {decision: 'REJECTED'}}), fails(422));
  assert.equal(text(root), broken);
  writeFileSync(path.join(root, MOTIONS_TEXT), whole);
  assert.deepEqual(register.list().map(e => e.post), posts);
});

test('the sweep removes the posts of films that are gone from the disk, and never empties the register in a tree without media', t => {
  const root = temp(t), register = motionRegister(root), ids = ['paow-giv-01', 'paow-giv-02', 'paow-giv-03', 'paow-giv-04'];
  register.putAll([...film('paow-giv-01', his), ...ids.slice(1).flatMap(id => film(id))]);
  writeFileSync(path.join(root, 'data/clip-jobs.json'), JSON.stringify(jobsOf(ids), null, 2) + '\n');
  const whole = text(root), jobs = text(root, 'data/clip-jobs.json');
  const untouched = (why: RegExp, out = sweepMotions(root)) => { assert.equal(out.ran, false); assert.match(out.why ?? '', why); assert.equal(text(root), whole); assert.equal(text(root, 'data/clip-jobs.json'), jobs); assert.equal(existsSync(path.join(root, REMOVED_TEXT)), false); };
  // No assets/motions/ at all (a new worktree, the build tree, a copy from GitHub), or one with none of the register's films.
  untouched(/ingen assets\/motions\//);
  mkdirSync(path.join(root, 'assets/motions/other-film'), {recursive: true});
  untouched(/Ingen av registrets filmer/);
  // Only a part of the films is here: it looks like a tree with some media, and nothing is taken unless it is said to be right.
  const put = (id: string) => { mkdirSync(path.join(root, 'assets/motions', id), {recursive: true}); writeFileSync(path.join(root, 'assets/motions', id, 'source.mp4'), 'film'); };
  put('paow-giv-04');
  untouched(/3 av 4 filmer saknas/);
  // Most films are here and one is gone: a dry run lists it and changes nothing; the sweep takes its posts and keeps his verdict.
  put('paow-giv-02'); put('paow-giv-03');
  mkdirSync(path.join(root, 'assets/tracking/paow-giv-01'), {recursive: true});
  const dry = sweepMotions(root, {dry: true});
  assert.deepEqual([dry.ran, dry.present, dry.films], [true, 3, [{film: 'paow-giv-01', posts: ['paow-giv-01', 'paow-giv-01-deal', 'paow-giv-01-return-ready']}]]);
  assert.deepEqual(dry.verdicts.map(v => v.id), ['paow-giv-01-deal']); assert.deepEqual(dry.left, ['assets/tracking/paow-giv-01']);
  assert.equal(text(root), whole); assert.equal(text(root, 'data/clip-jobs.json'), jobs);
  const swept = sweepMotions(root, {at: '2026-11-23T20:00:00.000Z'});
  assert.deepEqual(swept.films, dry.films); assert.deepEqual(swept.jobs, ['paow-giv-01-deal', 'paow-giv-01-return-ready']);
  assert.deepEqual(register.ids(), ids.slice(1).flatMap(id => [id, `${id}-deal`, `${id}-return-ready`]));
  assert.deepEqual(register.removed().map(r => [r.id, r.decision, r.acceptedAs, r.note, r.why]), [['paow-giv-01-deal', 'ACCEPTED', 'MAIN', 'Den här är bäst.', 'filmen finns inte på disken (svep)']]);
  assert.deepEqual(JSON.parse(text(root, 'data/clip-jobs.json')), jobsOf(ids.slice(1)));
  assert.ok(existsSync(path.join(root, 'assets/tracking/paow-giv-01')), 'no local file is deleted by the sweep');
  // Nothing more to take: a second sweep changes nothing.
  const after = text(root);
  assert.deepEqual(sweepMotions(root).films, []); assert.equal(text(root), after);
});
