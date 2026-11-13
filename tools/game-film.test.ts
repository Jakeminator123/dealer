// Offline tests for src/game-film.ts: what the film queue is handed for each part. No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, effectOf, type BankData, type BankJob, type MotionRecord} from '../src/clip-graph.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createLayout} from '../src/game-table.ts';
import {cardsChoice, createFilm, effectPart, faceFrame, filmModel, type FilmPart} from '../src/game-film.ts';
import {judgedBank} from '../src/game-director.ts';

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

// Paow with seat 6 dealt from anchor 2.2 (READY-B): its entry, a deal and a return cut from one film, and its exit, beside the films
// of seat 4 from READY. No plain deal to seat 6 exists, as in her bank. pending: takes still without a verdict; missing: takes not made.
function viaHub(pending: string[] = [], missing: string[] = []): BankData {
  const data = bank(), hubJobs = [job('in-b', 'IDLE', 'READY-B', 'wan3', {kind: 'ENTRY'}), job('p6-deal-b', 'READY-B', 'P6.C1', 'wan3', {kind: 'DEAL', target: 'P6.C1'}),
    job('p6-back-b', 'P6.C1', 'READY-B', 'wan3', {kind: 'RETURN', first: {frame: {video: video('p6-deal-b'), videoSha256: sha, index: 100}}}), job('ut-b', 'READY-B', 'IDLE', 'wan3', {kind: 'RETURN'})].filter(j => !missing.includes(j.id));
  for (const j of hubJobs) { data.jobs!.push(j); data.motions![j.id] = record('wan3', pending.includes(j.id) ? {review: {decision: 'PENDING', inbox: true}} : {}); data.receipts![j.id] = {status: 'SUCCEEDED'}; data.media![j.id] = {video: video(j.id)}; }
  return judgedBank(data);
}
const playRound = async (data: BankData, table: {hands: {seat: number; cards: number[]}[]; dealer: number[]}, draws: number[]) => {
  const queue = players(), film = createFilm(queue.players, buildGraph(data, {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0);
  const records = draws.map(n => ({shoeDraw: n, target: '', r: 'A', s: 'spades'}));
  const round = film.play(draws.map(n => ({type: 'deal', shoeDraw: n})) as never, {table, records}); await new Promise(r => setTimeout(r, 0)); queue.end();
  const {gaps, beats} = await round, chain = queue.parts.find(list => list.some(part => !part.rest))!;
  return {gaps, beats, chain, clips: chain.map(part => part.path.split('/')[2])};
};

test('a round deals Paow\'s seat 6 from anchor 2.2 when its four films have a verdict, and as before when one has none', async () => {
  // Seat 6 first, then seat 4: from rest to 2.2, the deal and its return, out to rest, and the plain entry for seat 4.
  const table = {hands: [{seat: 6, cards: [2]}, {seat: 4, cards: [3]}], dealer: []};
  const played = await playRound(viaHub(), table, [2, 3]);
  assert.deepEqual(played.clips, ['in-b', 'p6-deal-b', 'p6-back-b', 'ut-b', 'in', 'p4-deal', 'p4-rest']);
  assert.deepEqual(played.gaps, []);
  assert.deepEqual([played.chain[1].start, played.chain[1].end], [0, 100], 'the deal is cut where its return begins');
  assert.equal((played.chain[1].cards as {target?: string}).target, 'P6.C1', 'the film carries the card of seat 6');
  // Seat 6 last: seat 4 goes to rest first, and the chain ends with the exit from 2.2.
  const last = await playRound(viaHub(), {hands: [{seat: 4, cards: [2]}, {seat: 6, cards: [3]}], dealer: []}, [2, 3]);
  assert.deepEqual(last.clips, ['in', 'p4-deal', 'p4-rest', 'in-b', 'p6-deal-b', 'p6-back-b', 'ut-b']);
  // Two cards to seat 6 in a row: the hand waits at 2.2 between them.
  const twice = await playRound(viaHub(), {hands: [{seat: 6, cards: [2, 3]}], dealer: []}, [2, 3]);
  assert.deepEqual(twice.clips, ['in-b', 'p6-deal-b', 'p6-back-b', 'p6-deal-b', 'p6-back-b', 'ut-b']);
  assert.equal((twice.chain[3].cards as {target?: string}).target, 'P6.C2');
  // The exit from 2.2 without a verdict, or not made; the entry or the return without a verdict: seat 6 is laid without a hand, as today.
  const before = await playRound(viaHub([], ['in-b', 'p6-deal-b', 'p6-back-b', 'ut-b']), table, [2, 3]);
  assert.deepEqual(before.clips, ['in', 'p4-deal', 'p4-rest']); assert.deepEqual(before.gaps, ['P6.C1: ingen spelbar film, kortet läggs utan hand']);
  for (const [pending, missing] of [[['ut-b'], []], [[], ['ut-b']], [['in-b'], []], [['p6-back-b'], []]] as [string[], string[]][]) {
    const fallen = await playRound(viaHub(pending, missing), table, [2, 3]);
    assert.deepEqual([fallen.clips, fallen.gaps, fallen.beats.map(b => b.kind)], [before.clips, before.gaps, before.beats.map(b => b.kind)], JSON.stringify([pending, missing]));
  }
  // A round without seat 6 plays exactly what it played before the films of 2.2 came.
  const four = {hands: [{seat: 4, cards: [2]}], dealer: []};
  assert.deepEqual((await playRound(viaHub(), four, [2])).chain, (await playRound(bank(), four, [2])).chain);
});

test('the hole card\'s turn is shown when its face shows in the film: the first face-up frame after the last face-down one', () => {
  const sides = (list: string) => ({frames: list.split('').map(c => ({side: c === 'B' ? 'BACK' : c === 'F' ? 'FRONT' : c === 'E' ? 'EDGE' : 'NONE'}))});
  assert.equal(faceFrame(sides('BBBBEEEFFFF')), 7);
  assert.equal(faceFrame(sides('BBFBBEEFFF')), 7, 'a face glimpsed before the last back frame is not the turn');
  assert.equal(faceFrame(sides('BBBBNN')), null); assert.equal(faceFrame(null), null); assert.equal(faceFrame({}), null);
});

test('who decides the drawn cards: the address, then the player\'s own menu, then on; a look\'s preset has no say', () => {
  // the player switched them off in the game's menu: off, also after the frame reloads, whatever look is played
  assert.deepEqual(cardsChoice({memory: 'off'}), {cards: false, carry: 'object'});
  // the address (a link, a recording) wins over what a browser remembers, both ways
  assert.equal(cardsChoice({address: true, memory: 'off'}).cards, true);
  assert.equal(cardsChoice({address: false, memory: 'on'}).cards, false);
  // nothing remembered: on
  assert.equal(cardsChoice({}).cards, true); assert.equal(cardsChoice({memory: 'on'}).cards, true);
  // how the card in her hand is shown is the address's kort word alone (and a kort word means the cards are on). Without one it is
  // the game's line, the drawn card in her hand (CARRY in src/card-overlay.ts says why); kort=liggande is the film's own card there.
  // The menu has no switch for it, and a browser that still remembers the removed switch reads as cards on.
  assert.deepEqual(cardsChoice({}), {cards: true, carry: 'object'});
  assert.deepEqual(cardsChoice({memory: 'lying'}), {cards: true, carry: 'object'});
  assert.deepEqual(cardsChoice({kort: 'hand', memory: 'lying'}), {cards: true, carry: 'object'});
  assert.deepEqual(cardsChoice({kort: 'liggande', memory: 'off'}), {cards: true, carry: 'film'});
  assert.deepEqual(cardsChoice({kort: 'liggande', address: false}), {cards: false, carry: 'film'});
  assert.equal(cardsChoice({kort: 'matt'}).carry, 'matte'); assert.equal(cardsChoice({kort: 'nej'}).carry, 'object');
});

test('a rest film that asks for an effect hands it to the scene with its part; a broken or missing effect is left out', async () => {
  const flash = {kind: 'room-flash', room: 'spelhalan-sv', at: 4.2, seconds: 1, mono: true};
  const withEffect = (effect: unknown) => buildGraph({...bank(), motions: {...bank().motions, vila: record('kling-4', {motion: {idle: {calm: true, weight: 20}, effect}} as never)}}, {dealer: 'paow'});
  const restPart = async (effect: unknown) => { const q = players(), film = createFilm(q.players, withEffect(effect), createLayout(defaultPlan()), async () => null, () => 0); film.rest(); await new Promise(r => setTimeout(r, 0)); return q.parts.at(-1)![0]; };
  assert.deepEqual((await restPart(flash)).effect, flash);
  assert.deepEqual((await restPart({kind: 'room-flash', room: 'spelhalan', at: 0, seconds: 0.5})).effect, {kind: 'room-flash', room: 'spelhalan', at: 0, seconds: 0.5, mono: true}, 'black and white unless the record says no');
  for (const broken of [undefined, null, {}, {...flash, kind: 'blixt'}, {...flash, room: 'Spelhålan!'}, {...flash, at: -1}, {...flash, at: '4'}, {...flash, seconds: 0}, {...flash, seconds: 9}])
    assert.equal('effect' in (await restPart(broken)), false, JSON.stringify(broken));
  assert.equal(effectOf(null), null); assert.deepEqual(effectPart(null), {});
});
