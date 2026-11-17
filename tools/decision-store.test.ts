// Offline tests for Jakob's answers from the studio's view Beslut (tools/decision-store.ts). Every write goes to a
// temporary copy; the checkout's own data/decisions.json is only read.
// Run: node --test tools/decision-store.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {decisionStore} from './decision-store.ts';
import {formatRegister} from './decision-register.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
const AT = '2026-11-17T14:05:00.000Z';
const entry = (id: string, more: Record<string, unknown> = {}) => ({id, kind: 'beslut', question: `Ska ${id} göras?`, leads: 'Ja gör det i morgon.',
  chips: [{value: 'ja', label: 'Ja'}, {value: 'nej', label: 'Nej'}, {value: 'senare', label: 'Senare'}], asked: '2026-11-17', from: 'huvudagenten', answer: null, ...more});
const register = () => ({schemaVersion: 1, about: 'Prov.', decisions: [entry('forsta', {proof: 'ett-prov'}), entry('andra', {proof: 'saknas'}), entry('tredje', {proof: 'ett-prov', file: 'b.png'})]});
const refused = (status: number) => (error: unknown) => (error as {status?: number}).status === status;

async function temp(t: {after(fn: () => Promise<void>): void}, value: unknown = register()) {
  const root = await mkdtemp(path.join(base, 'decision-store-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'data'));
  await mkdir(path.join(root, 'assets', 'proofs', 'ett-prov'), {recursive: true});
  for (const name of ['b.png', 'a.mp4', 'c.mp4']) await writeFile(path.join(root, 'assets', 'proofs', 'ett-prov', name), 'x');
  await writeFile(path.join(root, 'assets', 'proofs', 'ett-prov', 'proof.json'), JSON.stringify({labels: {'c.mp4': 'C', 'a.mp4': 'A'}}));
  const text = typeof value === 'string' ? value : formatRegister(value);
  await writeFile(path.join(root, 'data', 'decisions.json'), text);
  return {root, text, file: path.join(root, 'data', 'decisions.json')};
}

test('the page reads every entry with its revision and what its card shows', async t => {
  const {root} = await temp(t);
  const {decisions} = await decisionStore(root).answer();
  assert.deepEqual(decisions.map(d => d.id), ['forsta', 'andra', 'tredje']);
  assert.deepEqual(decisions[0].shown, {name: 'c.mp4', kind: 'video', path: 'assets/proofs/ett-prov/c.mp4'}, 'the first film in the labels\' order');
  assert.equal(decisions[0].missing, null);
  assert.deepEqual([decisions[1].shown, decisions[1].missing], [null, 'Provet saknas finns inte på den här datorn.']);
  assert.deepEqual(decisions[2].shown, {name: 'b.png', kind: 'image', path: 'assets/proofs/ett-prov/b.png'});
  assert.match(decisions[0].revision, /^"[0-9a-f]{64}"$/);
  // No register yet is an empty one; an unreadable one is refused and named.
  await rm(path.join(root, 'data', 'decisions.json'));
  assert.deepEqual(await decisionStore(root).answer(), {schemaVersion: 1, decisions: []});
});

test('an answer rewrites only the answer block of its entry, and is logged outside Git', async t => {
  const {root, text, file} = await temp(t), store = decisionStore(root, () => AT);
  const read = await store.answer();
  const saved = await store.save('andra', {value: 'nej', note: ' inte\n nu '}, read.decisions[1].revision);
  const after = await readFile(file, 'utf8'), before = JSON.parse(text);
  before.decisions[1].answer = {value: 'nej', note: 'inte nu', at: AT};
  assert.equal(after, formatRegister(before), 'every other line as it was');
  assert.deepEqual(saved.decision.answer, {value: 'nej', note: 'inte nu', at: AT});
  assert.equal(saved.revision, (await store.answer()).decisions[1].revision);
  assert.notEqual(saved.revision, read.decisions[1].revision);
  assert.deepEqual((await store.answer()).decisions.filter(d => d.id !== 'andra').map(d => d.revision), read.decisions.filter(d => d.id !== 'andra').map(d => d.revision), 'the other entries keep their revisions');
  assert.deepEqual(await readdir(path.join(root, 'data')), ['decisions.json'], 'no temporary file is left');
  const log = (await readFile(path.join(root, '.runtime', 'decision-answers.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(log, [{id: 'andra', before: null, after: {value: 'nej', note: 'inte nu', at: AT}, at: AT}]);
});

test('he can change an answer and take it back; a page that read before the change must read again', async t => {
  const {root, text, file} = await temp(t), store = decisionStore(root, () => AT);
  const first = (await store.answer()).decisions[0].revision;
  const yes = await store.save('forsta', {value: 'ja', note: ''}, first);
  await assert.rejects(store.save('forsta', {value: 'nej', note: ''}, first), refused(409), 'the answer changed on another screen');
  const no = await store.save('forsta', {value: 'nej', note: 'ändrade mig'}, yes.revision);
  assert.equal(no.decision.answer?.value, 'nej');
  const back = await store.save('forsta', {value: null, note: 'glöms'}, no.revision);
  assert.equal(back.decision.answer, null);
  assert.equal(await readFile(file, 'utf8'), text, 'taken back, the register is as it was');
  assert.equal(back.revision, first);
});

test('nothing is written without the revision, for an unknown entry, a bad answer or an unreadable register', async t => {
  const {root, text, file} = await temp(t), store = decisionStore(root, () => AT);
  const {revision} = (await store.answer()).decisions[0];
  await assert.rejects(store.save('forsta', {value: 'ja'}, undefined), refused(428));
  await assert.rejects(store.save('forsta', {value: 'ja'}, '"gammal"'), refused(409));
  await assert.rejects(store.save('finns-inte', {value: 'ja'}, revision), refused(404));
  await assert.rejects(store.save('../data', {value: 'ja'}, revision), refused(400));
  for (const bad of [{value: 'kanske'}, {value: 'ja', note: 'se D:/x/y'}, {value: 'ja', answer: {value: 'nej'}}, {question: 'ny fråga'}])
    await assert.rejects(store.save('forsta', bad, revision), refused(400), JSON.stringify(bad));
  assert.equal(await readFile(file, 'utf8'), text);
  // An agent left the register broken: the page reads nothing and writes nothing until it is mended.
  const broken = text.replace('"kind": "beslut"', '"kind": "kanske"');
  await writeFile(file, broken);
  await assert.rejects(store.answer(), refused(422));
  await assert.rejects(store.save('andra', {value: 'ja'}, revision), refused(422));
  await writeFile(file, '{ inte json');
  await assert.rejects(store.answer(), refused(422));
  assert.equal(await readFile(file, 'utf8'), '{ inte json');
});

test('an agent\'s edit of another entry does not stop his answer, and answers to two entries at once both land', async t => {
  const {root, file} = await temp(t), store = decisionStore(root, () => AT);
  const read = await store.answer();
  // An agent adds an entry after the page read the register.
  const edited = JSON.parse(await readFile(file, 'utf8'));
  edited.decisions.push(entry('fjarde'));
  await writeFile(file, formatRegister(edited));
  await Promise.all([store.save('forsta', {value: 'ja'}, read.decisions[0].revision), store.save('tredje', {value: 'senare', note: 'efter jul'}, read.decisions[2].revision)]);
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(after.decisions.map((d: {id: string; answer: {value: string} | null}) => [d.id, d.answer?.value ?? null]), [['forsta', 'ja'], ['andra', null], ['tredje', 'senare'], ['fjarde', null]]);
  // An agent changed the entry itself: his answer to what he saw is refused, and the page reads it again.
  const changed = JSON.parse(await readFile(file, 'utf8'));
  const seen = (await store.answer()).decisions[1].revision;
  changed.decisions[1].question = 'Ska andra göras nu?';
  await writeFile(file, formatRegister(changed));
  await assert.rejects(store.save('andra', {value: 'ja'}, seen), refused(409));
});
