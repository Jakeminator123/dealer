// The register of what waits for Jakob (data/decisions.json) and its strict reader (tools/decision-register.ts).
// Run: node --test tools/decision-register.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NOTE_LIMIT, QUESTION_WORDS, RegisterError, applyAnswer, entryRevision, formatRegister, pickShown, readRegister, validateAnswer} from './decision-register.ts';

const entry = (more: Record<string, unknown> = {}) => ({id: 'ett-beslut', kind: 'beslut', question: 'Ska vi göra så här?', leads: 'Ja gör det i morgon.',
  chips: [{value: 'ja', label: 'Ja'}, {value: 'nej', label: 'Nej'}], asked: '2026-11-17', from: 'huvudagenten', answer: null, ...more});
const register = (...decisions: unknown[]) => ({schemaVersion: 1, about: 'Prov.', decisions});
const problems = (value: unknown): string[] => { try { readRegister(value); return []; } catch (error) { assert.ok(error instanceof RegisterError); assert.equal((error as RegisterError).status, 422); return (error as RegisterError).problems; } };
const refused = (status: number) => (error: unknown) => (error as {status?: number}).status === status;

test('the tracked register reads, and lies in the form a write keeps (so an answer changes no other line)', () => {
  const text = readFileSync('data/decisions.json', 'utf8');
  const read = readRegister(JSON.parse(text));
  assert.ok(read.decisions.length > 0);
  assert.equal(text, formatRegister(JSON.parse(text)), 'data/decisions.json: keep the form JSON.stringify(value, null, 2) gives, with a line break at the end');
});

test('a good entry reads as it is, with its optional parts', () => {
  const full = entry({proof: 'paow-mun', file: 'paow-mun-1-lycka-till.mp4', page: 'game.html?table=casino&dealer=paow', link: 'dealer-lake.vercel.app/trailer', cost: 'cirka 105 krediter',
    answer: {value: 'nej', note: 'inte nu', at: '2026-11-17T14:05:00.000Z'}});
  assert.deepEqual(readRegister(register(full)).decisions[0], full);
  assert.deepEqual(readRegister(register(entry({kind: 'gora', chips: [{value: 'klart', label: 'Klart'}]}))).decisions[0].chips, [{value: 'klart', label: 'Klart'}]);
  assert.deepEqual(readRegister({schemaVersion: 1, decisions: []}), {schemaVersion: 1, decisions: []});
});

test('every problem is named at once, and a register with any problem is refused', () => {
  const found = problems(register(entry({kind: 'kanske', extra: 1}), entry({id: 'ett-beslut'}), 'x'));
  for (const part of ['okända fält extra', 'kind: beslut eller gora', 'id ett-beslut finns två gånger', 'decisions[2]: ska vara ett objekt']) assert.ok(found.some(p => p.includes(part)), `${part} in ${found.join(' | ')}`);
  assert.ok(problems({schemaVersion: 2, decisions: [], more: true}).length === 2);
  assert.deepEqual(problems(null), ['filen ska vara ett objekt']);
  const missing = problems(register({id: 'x'}));
  for (const key of ['kind', 'question', 'leads', 'chips', 'asked', 'from', 'answer']) assert.ok(missing.some(p => p.endsWith(`${key} saknas`)), key);
});

test('the texts are short and plain, and nothing private goes into the public repo', () => {
  const one = (more: Record<string, unknown>) => problems(register(entry(more)));
  assert.ok(one({question: Array(QUESTION_WORDS + 1).fill('ord').join(' ') + '?'}).some(p => p.includes(`högst ${QUESTION_WORDS} ord`)));
  assert.deepEqual(one({question: Array(QUESTION_WORDS).fill('ord').join(' ')}), []);
  assert.ok(one({leads: 'Ja gör det. Nej låter bli.'}).some(p => p.includes('en enda mening')));
  assert.deepEqual(one({leads: 'Ja gör det t.ex. i morgon, se /trailer?diagnos=1.'}), []);
  assert.ok(one({question: ' Ska vi?'}).length && one({leads: 'Ja\ngör det.'}).length && one({from: ''}).length);
  for (const secret of ['Se D:/dealer-scratch/tmp/x.', 'Se C:\\Users\\x.', 'Skriv till a.b@example.com.', 'Se /Users/x/y.']) assert.ok(one({leads: secret}).some(p => p.includes('publika repot')), secret);
  assert.ok(one({cost: 'x'.repeat(101)}).some(p => p.includes('högst 100 tecken')));
});

test('chips, proof, file, page, link and dates are checked', () => {
  const one = (more: Record<string, unknown>) => problems(register(entry(more)));
  assert.ok(one({chips: [{value: 'ja', label: 'Ja'}]}).some(p => p.includes('2 till 4 val för beslut')));
  assert.ok(one({kind: 'gora', chips: []}).some(p => p.includes('1 till 4 val för gora')));
  assert.ok(one({chips: [{value: 'ja', label: 'Ja'}, {value: 'ja', label: 'Nej'}]}).some(p => p.includes('samma value')));
  assert.ok(one({chips: [{value: 'ja', label: 'Ja'}, {value: 'nej', label: 'ja'}]}).some(p => p.includes('samma text')));
  assert.ok(one({chips: [{value: 'Ja!', label: 'Ja'}, {value: 'nej', label: 'Nej', more: 1}]}).length === 2);
  assert.ok(one({file: 'a.mp4'}).some(p => p.includes('kräver proof')));
  assert.ok(one({proof: 'Paow mun', file: '../a.mp4'}).length === 2);
  for (const page of ['/game.html', 'http://x.se/a', '../tools/preview.ts', 'studio/../x', 'a b.html']) assert.ok(one({page}).some(p => p.includes('.page')), page);
  for (const page of ['game.html', 'game.html?table=casino&dealer=paow', 'studio/prov/?prov=paow-mun&fil=a.mp4']) assert.deepEqual(one({page}), [], page);
  for (const link of ['javascript:alert(1)', 'http://dealer-lake.vercel.app', 'localhost/x', 'a b.se']) assert.ok(one({link}).some(p => p.includes('.link')), link);
  for (const link of ['dealer-lake.vercel.app/trailer', 'https://github.com/settings/billing']) assert.deepEqual(one({link}), [], link);
  for (const asked of ['2026-11-31', '17 nov', 20261117]) assert.ok(one({asked}).some(p => p.includes('.asked')), String(asked));
});

test('an answer is one of the chips, with a note and a moment', () => {
  const one = (answer: unknown) => problems(register(entry({answer})));
  assert.deepEqual(one({value: 'ja', note: '', at: '2026-11-17T14:05:00.000Z'}), []);
  assert.ok(one({value: 'kanske', note: '', at: '2026-11-17T14:05:00.000Z'}).some(p => p.includes('ett av valen')));
  assert.ok(one({value: 'ja', note: '', at: '2026-11-17'}).some(p => p.includes('.at')));
  assert.ok(one({value: 'ja', at: '2026-11-17T14:05:00.000Z'}).some(p => p.includes('.note')));
  assert.ok(one({value: 'ja', note: '', at: '2026-11-17T14:05:00.000Z', by: 'agent'}).some(p => p.includes('okända fält by')));
  assert.ok(one('ja').length === 1);
});

test('the page sends {value, note}: a chip or null, and a note that may go into the public repo', () => {
  const d = {chips: [{value: 'ja', label: 'Ja'}, {value: 'nej', label: 'Nej'}]};
  assert.deepEqual(validateAnswer({value: 'ja', note: '  bra,\n men senare '}, d), {value: 'ja', note: 'bra, men senare'});
  assert.deepEqual(validateAnswer({value: 'nej'}, d), {value: 'nej', note: ''});
  assert.deepEqual(validateAnswer({value: null, note: 'glöms'}, d), {value: null, note: ''});
  for (const bad of [{value: 'kanske'}, {note: 'x'}, {value: 'ja', note: 5}, {value: 'ja', note: 'x'.repeat(NOTE_LIMIT + 1)}, {value: 'ja', at: 'nu'}, null, 'ja', {value: 'ja', note: 'se D:/x/y'}])
    assert.throws(() => validateAnswer(bad, d), refused(400), JSON.stringify(bad));
});

test('an answer changes only the answer of its entry, and the revision follows the entry', () => {
  const before = entry({proof: 'p'});
  const after = applyAnswer(before, {value: 'ja', note: 'n'}, '2026-11-17T14:05:00.000Z');
  assert.deepEqual(Object.keys(after), Object.keys(before));
  assert.deepEqual({...after, answer: null}, before);
  assert.deepEqual(after.answer, {value: 'ja', note: 'n', at: '2026-11-17T14:05:00.000Z'});
  assert.equal(applyAnswer(after, {value: null, note: ''}, 'x').answer, null);
  assert.equal(entryRevision(before), entryRevision(entry({proof: 'p'})));
  assert.notEqual(entryRevision(before), entryRevision(after));
  assert.match(entryRevision(before), /^"[0-9a-f]{64}"$/);
});

test('a card shows the file asked for, else the first film in the labels\' order, else the first picture', () => {
  const names = ['b.mp4', 'a.mp4', 'c.png', 'proof.json', 'd.jpg', 'Bad Name.mp4'];
  assert.deepEqual(pickShown(names, {'b.mp4': 'B', 'c.png': 'C'}), {name: 'b.mp4', kind: 'video'});
  assert.deepEqual(pickShown(names, null), {name: 'a.mp4', kind: 'video'});
  assert.deepEqual(pickShown(['c.png', 'd.jpg'], {'d.jpg': 'D'}), {name: 'd.jpg', kind: 'image'});
  assert.deepEqual(pickShown(names, null, 'c.png'), {name: 'c.png', kind: 'image'});
  assert.equal(pickShown(names, null, 'x.mp4'), null);
  assert.equal(pickShown(['proof.json'], null), null);
});
