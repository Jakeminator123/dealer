// Offline tests for the lip-sync facts as the view Lipsync reads them (tools/lipsync-store.ts). Every file lies in a
// temporary folder; the checkout's own data/lipsync.json is only read.
// Run: node --test tools/lipsync-store.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {BASE_STILL, lipsyncAnswer, speechSets} from './lipsync-store.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
const facts = () => JSON.parse(readFileSync('data/lipsync.json', 'utf8'));
const refused = (status: number) => (error: unknown) => (error as {status?: number}).status === status;

async function temp(t: {after(fn: () => Promise<void>): void}, text: string | null = JSON.stringify(facts())) {
  const root = await mkdtemp(path.join(base, 'lipsync-store-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'data'));
  if (text !== null) await writeFile(path.join(root, 'data', 'lipsync.json'), text);
  return root;
}
async function proof(root: string, id: string, files: string[], labels?: Record<string, string>) {
  const folder = path.join(root, 'assets', 'proofs', id);
  await mkdir(folder, {recursive: true});
  for (const name of files) await writeFile(path.join(folder, name), 'x');
  if (labels) await writeFile(path.join(folder, 'proof.json'), JSON.stringify({labels}));
}

test('the view gets the facts as the file holds them, with a still for each proof found on this machine', async t => {
  const root = await temp(t), first = facts().proofs[0].id, second = facts().proofs[1].id;
  await proof(root, first, ['a-film.mp4']);
  await proof(root, second, ['b-film.mp4', 'b-stillbild.png', 'c-stillbild.png'], {'b-film.mp4': 'Film', 'c-stillbild.png': 'C', 'b-stillbild.png': 'B'});
  const answer = await lipsyncAnswer(root);
  const {stills, speech, ...rest} = answer;
  assert.deepEqual(rest, facts());
  assert.deepEqual(speech, {}, 'no speech register: no dealer is set up for speech');
  assert.deepEqual(stills.proofs[first], {proof: first, name: 'a-film.mp4', path: `assets/proofs/${first}/a-film.mp4`, kind: 'video'}, 'only a film: the film');
  assert.deepEqual(stills.proofs[second], {proof: second, name: 'c-stillbild.png', path: `assets/proofs/${second}/c-stillbild.png`, kind: 'image'}, 'the first picture in the labels\' order');
  assert.deepEqual(Object.keys(stills.proofs), facts().proofs.map((p: {id: string}) => p.id), 'every proof has its place, null where none is here');
  assert.equal(stills.proofs[facts().proofs[2].id], null);
  assert.equal(stills.base, null, 'no base still without its proof');
});

test('the base still comes from its proof, and only when the file lies there', async t => {
  const root = await temp(t);
  await proof(root, BASE_STILL.proof, ['annan.png']);
  assert.equal((await lipsyncAnswer(root)).stills.base, null);
  await writeFile(path.join(root, 'assets', 'proofs', BASE_STILL.proof, BASE_STILL.file), 'x');
  assert.deepEqual((await lipsyncAnswer(root)).stills.base, {proof: BASE_STILL.proof, name: BASE_STILL.file, path: `assets/proofs/${BASE_STILL.proof}/${BASE_STILL.file}`, kind: 'image'});
});

test('each dealer\'s mouth proof brings its first film, to be seen in motion', async t => {
  const root = await temp(t), proofId = facts().dealers.find((d: {mouth: unknown}) => d.mouth).mouth.proof;
  assert.deepEqual((await lipsyncAnswer(root)).stills.films, {[proofId]: null}, 'its place is there, null while the proof is not on this machine');
  await proof(root, proofId, ['x-2-stillbild.png', 'x-3-nara.mp4', 'x-1-spelets-storlek.mp4'], {'x-1-spelets-storlek.mp4': 'A', 'x-2-stillbild.png': 'B', 'x-3-nara.mp4': 'C'});
  const answer = await lipsyncAnswer(root);
  assert.deepEqual(answer.stills.films[proofId], {proof: proofId, name: 'x-1-spelets-storlek.mp4', path: `assets/proofs/${proofId}/x-1-spelets-storlek.mp4`, kind: 'video'});
  assert.equal(answer.stills.proofs[proofId]?.name, 'x-2-stillbild.png', 'the proof row keeps its still');
});

test('the speech register gives per dealer the bank, the rest film, the language and the voice, never the key line', async t => {
  const tracked = JSON.parse(readFileSync('data/speech.json', 'utf8'));
  const sets = speechSets(tracked)!;
  assert.deepEqual(Object.keys(sets), Object.keys(tracked.dealers));
  assert.deepEqual(sets.paow, {bankId: 'paow-v2', rest: 'paow-vila-01-01', language: 'sv', voice: {name: 'Paow', provider: 'elevenlabs', model: 'eleven_multilingual_v2', languages: ['en']}});
  assert.ok(!JSON.stringify(sets).includes('KEY'), 'the name of the line with an account\'s key stays out');
  assert.equal(sets.pamela, undefined, 'a dealer the register does not name is not set up');
  assert.equal(speechSets(null), null);
  assert.equal(speechSets({dealers: 'x'}), null);
  assert.deepEqual(speechSets({dealers: {paow: {bankId: 'paow-v2', rest: 'r', language: 'sv', voice: 'ingen'}}}), {paow: {bankId: 'paow-v2', rest: 'r', language: 'sv', voice: null}});
  const root = await temp(t);
  await writeFile(path.join(root, 'data', 'speech.json'), JSON.stringify(tracked));
  assert.deepEqual((await lipsyncAnswer(root)).speech, sets);
  await writeFile(path.join(root, 'data', 'speech.json'), '{ inte json');
  assert.equal((await lipsyncAnswer(root)).speech, null, 'a broken register is not known, and the page still reads');
});

test('a missing, broken or refused file is an error with its status, never a half page', async t => {
  await assert.rejects(lipsyncAnswer(await temp(t, null)), refused(404));
  await assert.rejects(lipsyncAnswer(await temp(t, '{ inte json')), refused(422));
  const bad = facts(); bad.steps[0].where = 'D:/dealer-scratch/tmp/x.ts';
  await assert.rejects(lipsyncAnswer(await temp(t, JSON.stringify(bad))), (error: unknown) => refused(422)(error) && /publika repot/.test((error as Error).message));
});
