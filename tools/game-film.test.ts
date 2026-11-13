// Offline tests for src/game-film.ts: what the film queue is handed for each part. No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, type BankData, type BankJob, type MotionRecord} from '../src/clip-graph.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createLayout} from '../src/game-table.ts';
import {cardsChoice, createFilm, faceFrame, filmModel, type FilmPart} from '../src/game-film.ts';

const sha = 'a'.repeat(64), first = {file: {path: 'assets/anchors/paow-ready-01/anchor.png', sha256: sha}};
const video = (id: string) => `assets/motions/${id}/source.mp4`;
const job = (id: string, from: string, to: string, model: string, extra: Partial<BankJob> = {}): BankJob => ({id, kind: from === 'READY' ? 'DEAL' : to === 'IDLE' && from === 'IDLE' ? 'IDLE' : 'RETURN',
  target: from === 'READY' ? to : null, from, to, model, duration: 4, ratio: 'auto_1080p', audio: false, promptText: 'fixture', first, purpose: 'fixture', dealer: 'paow', ...extra});
const record = (model: string | null, extra: MotionRecord & Record<string, unknown> = {}): MotionRecord => ({source: {fps: 30, frames: 120, sha256: sha, ...(model ? {model} : {})} as MotionRecord['source'], review: {decision: 'ACCEPTED'}, motion: {physicalEndSide: 'FRONT'}, ...extra});
// Paow at seat 4: a deal and its two returns made with WAN 3, a rest film made with Kling 4, a talk film made on that rest film, the way
// in and out, and a cut take whose order says "utsnitt" while its film says wan3 (as Pamela's archive cuts do).
function bank(): BankData {
  const jobs = [job('p4-deal', 'READY', 'P4.C1', 'wan3'), job('p4-back', 'P4.C1', 'READY', 'wan3'), job('p4-rest', 'P4.C1', 'IDLE', 'wan3'), job('vila', 'IDLE', 'IDLE', 'kling-4'),
    job('tal', 'IDLE', 'IDLE', 'moving-gpu-worker (MuseTalk) · Jessica'), job('in', 'IDLE', 'READY', 'utsnitt', {kind: 'ENTRY'}), job('ut', 'READY', 'IDLE', 'kling-4'), job('okand', 'IDLE', 'IDLE', 'x')];
  const motions: Record<string, MotionRecord> = {'p4-deal': record('wan3'), 'p4-back': record('wan3'), 'p4-rest': record('wan3'), vila: record('kling-4', {motion: {idle: {calm: true, weight: 20}}} as never),
    tal: record('moving-gpu-worker (MuseTalk) · Jessica', {motion: {idle: {onRequest: true, calm: true, weight: 0}}, speech: {restFilm: 'vila'}} as never), in: record('wan3'), ut: record('kling-4'),
    okand: record(null, {motion: {idle: {calm: true, weight: 0}}} as never)};
  return {jobs, motions, receipts: Object.fromEntries(jobs.map(j => [j.id, {status: 'SUCCEEDED', estimatedCredits: 0}])), media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id), first: null, last: null}]))};
}
// The scene's film queue as a list of what it was handed. A chain ends when the test says so (end); the rest loop never does by itself.
function players() {
  const parts: FilmPart[][] = []; let last: {onPart?(index: number): void; onEnd?(): void} = {};
  return {parts, end() { const o = last; last = {}; o.onEnd?.(); },
    players: {play(list: FilmPart[], options: {onPart?(index: number): void; onEnd?(): void} = {}) { parts.push(list); last = options; list.forEach((_, i) => options.onPart?.(i)); }, hurry() {}, preload() {}}};
}

test('the film model: the film\'s own record, not the order\'s cut; a talk film carries its rest film\'s; unknown is left out', async () => {
  const graph = buildGraph(bank(), {dealer: 'paow'}), takes = graph.takes;
  assert.equal(filmModel(takes['p4-deal'], takes), 'wan3');
  assert.equal(filmModel(takes.in, takes), 'wan3', 'job.model "utsnitt" names a cut, not a model');
  assert.equal(filmModel(takes.tal, takes), 'kling-4', 'the talk film is its rest film with a new mouth');
  assert.equal(filmModel(takes.okand, takes), null);
  assert.equal(filmModel(null, takes), null);

  const queue = players(), {parts, players: p} = queue, film = createFilm(p, graph, createLayout(defaultPlan()), async () => null, () => 0);
  film.rest(); await new Promise(r => setTimeout(r, 0));
  assert.equal(parts.at(-1)![0].path, video('vila')); assert.equal(parts.at(-1)![0].model, 'kling-4', 'the rest loop');
  assert.equal(parts.at(-1)![0].rest, true, 'the rest loop says it is the rest');
  assert.equal(film.talkPart('tal')?.model, 'kling-4', 'a talk film'); assert.equal(film.talkPart('tal')?.rest, undefined, 'a talk film is no rest');
  // A round's chain: rest to the shoe, the deal to seat 4, back to rest. Every part names its model.
  const table = {hands: [{seat: 4, cards: [2]}], dealer: []};
  const round = film.play([{type: 'deal', shoeDraw: 2}] as never, {table, records: [{shoeDraw: 2, target: 'P4.C1', r: 'A', s: 'spades'}]});
  await new Promise(r => setTimeout(r, 0)); queue.end(); await round;
  const chain = parts.find(list => list.some(part => part.path === video('p4-deal')))!;
  assert.deepEqual(chain.map(part => [part.path.split('/')[2], part.model]), [['in', 'wan3'], ['p4-deal', 'wan3'], ['p4-rest', 'wan3']]);
  assert.ok(chain.every(part => part.rest === undefined), "a round's films are no rest");
  // A part whose take says nothing has no model at all, not an empty one.
  const silent = buildGraph({...bank(), motions: {...bank().motions, vila: record(null, {motion: {idle: {calm: true, weight: 20}}} as never)}}, {dealer: 'paow'});
  const quiet = players(), still = createFilm(quiet.players, silent, createLayout(defaultPlan()), async () => null, () => 0);
  still.rest(); await new Promise(r => setTimeout(r, 0));
  assert.equal('model' in quiet.parts.at(-1)![0], false);
});

test('the hole card\'s turn is shown when its face shows in the film: the first face-up frame after the last face-down one', () => {
  const sides = (list: string) => ({frames: list.split('').map(c => ({side: c === 'B' ? 'BACK' : c === 'F' ? 'FRONT' : c === 'E' ? 'EDGE' : 'NONE'}))});
  assert.equal(faceFrame(sides('BBBBEEEFFFF')), 7);
  assert.equal(faceFrame(sides('BBFBBEEFFF')), 7, 'a face glimpsed before the last back frame is not the turn');
  assert.equal(faceFrame(sides('BBBBNN')), null); assert.equal(faceFrame(null), null); assert.equal(faceFrame({}), null);
});

test('who decides the drawn cards: the address, then the player\'s own menu (also under a preset), then the preset, then on', () => {
  // the preset says on (Profilval 1), the player switched them off in the game's menu: off, also after the frame reloads
  assert.deepEqual(cardsChoice({preset: true, memory: 'off'}), {cards: false, carry: 'object'});
  // the address (the Casino view's button, a recording) wins over what a browser remembers, both ways
  assert.equal(cardsChoice({address: true, memory: 'off', preset: false}).cards, true);
  assert.equal(cardsChoice({address: false, memory: 'on', preset: true}).cards, false);
  // nothing remembered: the preset, else on
  assert.equal(cardsChoice({preset: false}).cards, false); assert.equal(cardsChoice({}).cards, true); assert.equal(cardsChoice({memory: 'on', preset: false}).cards, true);
  // how the card in her hand is shown is the address's kort word alone (and a kort word means the cards are on); the menu has no
  // switch for it, and a browser that still remembers the removed switch reads as cards on, carried as the game does
  assert.deepEqual(cardsChoice({memory: 'lying', preset: true}), {cards: true, carry: 'object'});
  assert.deepEqual(cardsChoice({memory: 'lying', preset: false}), {cards: true, carry: 'object'});
  assert.deepEqual(cardsChoice({kort: 'hand', memory: 'lying'}), {cards: true, carry: 'object'});
  assert.deepEqual(cardsChoice({kort: 'liggande', memory: 'off', preset: true}), {cards: true, carry: 'film'});
  assert.deepEqual(cardsChoice({kort: 'liggande', address: false}), {cards: false, carry: 'film'});
  assert.equal(cardsChoice({kort: 'matt'}).carry, 'matte'); assert.equal(cardsChoice({kort: 'nej'}).carry, 'object');
});
