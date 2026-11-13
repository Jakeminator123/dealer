// The game's use of a mouth patch (src/game-film.ts with placeLines from src/speech-patch.ts): a line due before a step's chain is
// laid on the first of its films that has a patch for it, and its talk film is then not played. No network, media or page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, type BankData, type BankJob, type MotionRecord} from '../src/clip-graph.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createLayout} from '../src/game-table.ts';
import {createFilm, type FilmPart} from '../src/game-film.ts';
import type {MouthPatch} from '../src/speech-patch.ts';

const sha = 'a'.repeat(64), first = {file: {path: 'assets/anchors/paow-ready-01/anchor.png', sha256: sha}};
const video = (id: string) => `assets/motions/${id}/source.mp4`;
const job = (id: string, from: string, to: string, extra: Partial<BankJob> = {}): BankJob => ({id, kind: from === 'READY' ? 'DEAL' : to === 'IDLE' && from === 'IDLE' ? 'IDLE' : 'RETURN',
  target: from === 'READY' ? to : null, from, to, model: 'kling-4', duration: 4, ratio: 'auto_1080p', audio: false, promptText: 'fixture', first, purpose: 'fixture', dealer: 'paow', ...extra});
const record = (extra: Record<string, unknown> = {}): MotionRecord => ({source: {fps: 30, frames: 120, sha256: sha, model: 'kling-4'} as MotionRecord['source'], review: {decision: 'ACCEPTED', by: 'jakob'}, ...extra} as never);
// Paow at seat 4: the way in, a deal and its return to rest, a rest film and a talk film of the good-luck line made on it.
function bank(): BankData {
  const jobs = [job('in', 'IDLE', 'READY', {kind: 'ENTRY'}), job('p4-deal', 'READY', 'P4.C1'), job('p4-rest', 'P4.C1', 'IDLE'), job('vila', 'IDLE', 'IDLE'), job('tal', 'IDLE', 'IDLE')];
  const motions: Record<string, MotionRecord> = {in: record(), 'p4-deal': record(), 'p4-rest': record(), vila: record({motion: {idle: {calm: true, weight: 20}}}),
    tal: record({motion: {idle: {onRequest: true, calm: true, weight: 0}}, speech: {restFilm: 'vila', line: 'goodluck', text: 'Lycka till!', voice: 'Paow'}})};
  return {jobs, motions, receipts: Object.fromEntries(jobs.map(j => [j.id, {status: 'SUCCEEDED', estimatedCredits: 0}])), media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id), first: null, last: null}]))} as never;
}
function players() {
  const parts: FilmPart[][] = []; let last: {onPart?(index: number): void; onEnd?(): void} = {};
  return {parts, end() { const o = last; last = {}; o.onEnd?.(); },
    players: {play(list: FilmPart[], options: {onPart?(index: number): void; onEnd?(): void} = {}) { parts.push(list); last = options; list.forEach((_, i) => options.onPart?.(i)); }, hurry() {}, preload() {}}};
}
const patchOver = (id: string, over: Partial<MouthPatch> = {}): MouthPatch => ({schemaVersion: 1, kind: 'mouth-patch', id: `paow-mun-goodluck-sv-${id}`, dealer: 'paow',
  film: {id, path: video(id), sha256: sha, fps: 30, frames: 120, width: 1764, height: 1174}, line: {key: 'goodluck', language: 'sv', text: 'Lycka till!', voice: 'Paow'},
  box: {x: 768, y: 208, w: 184, h: 176}, feather: 24, first: 10, count: 20, weights: new Array(20).fill(1),
  strip: {path: 'mouth.webp', type: 'image/webp', lossless: true, columns: 4, rows: 5, width: 736, height: 880, colour: 'bt709-tv', sha256: sha},
  sound: {path: 'line.wav', type: 'audio/wav', rate: 24000, channels: 1, samples: 24000, startsAtSeconds: 0.6, endsAtSeconds: 1.6, sha256: sha},
  made: {by: 'test', at: '2026-11-13T00:00:00Z', from: {path: 'x', sha256: sha}}, ...over});
const table = {hands: [{seat: 4, cards: [2]}], dealer: []}, records = [{shoeDraw: 2, target: 'P4.C1', r: 'A', s: 'spades'}];
async function step(mouths: MouthPatch[]) {
  const graph = buildGraph(bank(), {dealer: 'paow'}), queue = players(), film = createFilm(queue.players, graph, createLayout(defaultPlan()), async () => null, () => 0), said: string[] = [];
  film.mouths = () => mouths.map(patch => ({patch, base: `assets/speech/paow/patches/${patch.id}/`}));
  const talk = film.talkPart('tal'); assert.ok(talk, 'the talk film is playable');
  const round = film.play([{type: 'speak', line: 'goodluck'}, {type: 'deal', shoeDraw: 2}] as never, {table, records}, () => {}, {before: [{key: 'goodluck', part: talk, begin: () => said.push('goodluck')}]});
  await new Promise(r => setTimeout(r, 0)); queue.end(); await round;
  return {chain: queue.parts.find(list => list.some(part => part.path === video('p4-deal')))!, said};
}

test('a line goes over the chain\'s first film that has its patch, and its talk film is not played', async () => {
  const {chain, said} = await step([patchOver('p4-deal'), patchOver('in')]);
  assert.deepEqual(chain.map(p => p.path.split('/')[2]), ['in', 'p4-deal', 'p4-rest'], 'no talk film before the chain');
  assert.equal(chain[0].mouth?.patch.id, 'paow-mun-goodluck-sv-in'); assert.equal(chain[1].mouth, undefined, 'one line, one part');
  assert.deepEqual(said, [], 'the chat line waits for the sound'); chain[0].mouth!.begin!(true); assert.deepEqual(said, ['goodluck']);
});

test('without the entry\'s patch the line goes over the deal; a patch that does not fit or comes too late is not used', async () => {
  const deal = await step([patchOver('p4-deal')]);
  assert.equal(deal.chain[1].mouth?.patch.id, 'paow-mun-goodluck-sv-p4-deal'); assert.equal(deal.chain[0].mouth, undefined);
  // the patch's frames past the film's end, or its sound past 8 s into the chain (the third film begins 8 s in): the talk film plays as before
  for (const patch of [patchOver('in', {first: 110, count: 20, weights: new Array(20).fill(1)}), patchOver('p4-rest')]) {
    const {chain, said} = await step([patch]);
    assert.equal(chain[0].path, video('tal'), `${patch.id}: the talk film first`); assert.ok(chain.every(p => !p.mouth)); assert.deepEqual(said, ['goodluck'], 'begun as its talk film begins');
  }
});
