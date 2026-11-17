// The lip-sync facts (data/lipsync.json) and their strict reader (tools/lipsync-register.ts).
// Run: node --test tools/lipsync-register.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LipsyncError, pickStill, readLipsync} from './lipsync-register.ts';

const tracked = () => JSON.parse(readFileSync('data/lipsync.json', 'utf8'));
const problems = (value: unknown): string[] => { try { readLipsync(value); return []; } catch (error) { assert.ok(error instanceof LipsyncError); assert.equal((error as LipsyncError).status, 422); return (error as LipsyncError).problems; } };
/** The tracked facts with one change made by `change`. */
const changed = (change: (facts: any) => void) => { const facts = tracked(); change(facts); return problems(facts); };
const has = (found: string[], part: string) => assert.ok(found.some(p => p.includes(part)), `${part} in ${found.join(' | ')}`);

test('the tracked facts read, and the checked copy holds every fact as the file has it', () => {
  const raw = tracked(), read = readLipsync(raw);
  assert.deepEqual(read, raw);
  assert.equal(read.steps.length, 11);
  assert.deepEqual(read.steps.map(s => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(read.settings.length >= 14);
  assert.ok(read.settings.some(s => s.locked) && read.settings.some(s => !s.locked));
  assert.ok(read.proofs.length > 0 && read.open.length > 0 && read.baseImages.length > 0);
});

test('every problem is named at once, and a file with any problem is refused', () => {
  const found = changed(f => { f.extra = 1; f.schemaVersion = 2; delete f.lockNote; f.steps[0].more = true; f.settings[0].locked = 'ja'; f.proofs[1].id = 'Paow Prov'; });
  for (const part of ['filen: okända fält extra', 'schemaVersion ska vara 1', 'filen: lockNote saknas', 'steps[0]: okända fält more', 'settings[0].locked: true eller false', 'proofs[1].id']) has(found, part);
  assert.deepEqual(problems(null), ['filen ska vara ett objekt']);
  assert.deepEqual(problems([]), ['filen ska vara ett objekt']);
  has(changed(f => { f.proofs.push({...f.proofs[0]}); }), 'står två gånger');
  has(changed(f => { f.steps = 'många'; }), 'steps: ska vara en lista');
  has(changed(f => { f.steps = []; }), 'steps: 1 till 50 poster');
});

test('the chain is read in its order: step n stands as entry n, from 1', () => {
  has(changed(f => { f.steps.reverse(); }), 'steps[0].n: ska vara 1');
  has(changed(f => { f.steps.splice(3, 1); }), 'steps[3].n: ska vara 4');
  has(changed(f => { f.steps[0].n = '1'; }), 'steps[0].n: ett heltal');
});

test('nothing private goes into the public repo, and every text is one plain line', () => {
  for (const secret of ['D:/dealer-scratch/tmp/tal/lipsync/lipsync.json', 'C:\\Users\\x\\a.py', '/Users/x/y', 'skriv till a.b@example.com'])
    has(changed(f => { f.steps[2].where = secret; }), 'steps[2].where: ');
  has(changed(f => { f.settings[0].where = 'D:/x'; }), 'publika repot');
  has(changed(f => { f.runs.runpod.notBuilt[0] = 'se /home/x/'; }), 'runs.runpod.notBuilt[0]');
  has(changed(f => { f.open[0].what = 'två\nrader'; }), 'utan radbrytningar');
  has(changed(f => { f.about = ' början'; }), 'about: utan radbrytningar');
  has(changed(f => { f.steps[0].what = 'x'.repeat(401); }), 'högst 400 tecken');
  // A path of the repo or of the other team's renderer is no path of this machine.
  assert.deepEqual(changed(f => { f.steps[2].where = 'rendererns vendor/rorlig.py rad 27 (SCALE 2); src/speech-plan.ts rad 18 (BRIDGE: cropX 328, padY 372)'; }), []);
});

test('texts, measures, dates and hashes are checked where they stand', () => {
  has(changed(f => { f.proofs[0].what = ''; }), 'proofs[0].what: ska vara en text');
  assert.deepEqual(changed(f => { f.proofs[0].ownerSaid = ''; }), [], 'he may not have said anything about a proof yet');
  has(changed(f => { f.proofs[0].ownerSaid = 5; }), 'ownerSaid: ska vara en text (tom går bra)');
  for (const date of ['2026-11-31', '17 nov', 20261117]) has(changed(f => { f.proofs[0].date = date; }), 'proofs[0].date');
  has(changed(f => { f.updated = 'i dag'; }), 'updated: ett datum');
  has(changed(f => { f.baseImages[1].sha256 = 'abc'; }), 'baseImages[1].sha256');
  assert.deepEqual(changed(f => { f.baseImages[1].sha256 = 'a'.repeat(64); }), []);
  has(changed(f => { f.lipsMeasured.rows[0].width = -1; }), 'lipsMeasured.rows[0].width: ett mått');
  has(changed(f => { f.lipsMeasured.rows[0] = {what: 'Ingenting'}; }), 'måtten (width, upperLip, lowerLip) eller en note');
  has(changed(f => { f.runs.today.realtime = 'nej'; }), 'runs.today.realtime');
  has(changed(f => { delete f.baseImages[0].where; }), 'baseImages[0]: where saknas');
  assert.deepEqual(changed(f => { delete f.baseImages[0].reference; }), [], 'reference is optional');
  has(changed(f => { f.runs.runpod = null; }), 'runs.runpod: ska vara ett objekt');
});

test('a proof shows its first picture in the labels\' order, else its first film', () => {
  const names = ['b.mp4', 'a.mp4', 'c.png', 'proof.json', 'd.jpg', 'Bad Name.png'];
  assert.deepEqual(pickStill(names, {'b.mp4': 'B', 'd.jpg': 'D', 'c.png': 'C'}), {name: 'd.jpg', kind: 'image'});
  assert.deepEqual(pickStill(names, null), {name: 'c.png', kind: 'image'});
  assert.deepEqual(pickStill(['b.mp4', 'a.mp4'], {'b.mp4': 'B'}), {name: 'b.mp4', kind: 'video'});
  assert.equal(pickStill(['proof.json', 'Bad Name.png'], null), null);
});

test('the own runner and the licences are read where the file has them, and are checked like the rest', () => {
  const tracked = JSON.parse(readFileSync(new URL('../data/lipsync.json', import.meta.url), 'utf8'));
  const facts = readLipsync(tracked);
  assert.ok(facts.runs.ownRunner && facts.runs.ownRunner.what.length > 0 && Array.isArray(facts.runs.ownRunner.notBuilt));
  assert.ok(facts.licences && facts.licences.length >= 4 && facts.licences.every(l => l.what && l.licence && l.commercial && l.where));
  const without = structuredClone(tracked); delete without.licences; delete without.runs.ownRunner;
  const plain = readLipsync(without); assert.equal(plain.licences, undefined); assert.equal(plain.runs.ownRunner, undefined);
  const bad = structuredClone(tracked); bad.runs.ownRunner.extra = 1; bad.licences[0].licence = 5;
  assert.throws(() => readLipsync(bad), (e: unknown) => /runs\.ownRunner: okända fält extra/.test((e as {problems: string[]}).problems.join('|')) && /licences\[0\]\.licence/.test((e as {problems: string[]}).problems.join('|')));
});
