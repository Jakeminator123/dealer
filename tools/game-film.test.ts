// Offline tests for src/game-film.ts: what the film queue is handed for each part. No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, effectOf, type BankData, type BankJob, type MotionRecord} from '../src/clip-graph.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createLayout} from '../src/game-table.ts';
import {cardOptions, cardsChoice, cardWords, createFilm, effectPart, faceFrame, filmModel, type FilmPart, type FilmPlayers} from '../src/game-film.ts';
import {returnCardAt} from '../src/card-overlay.ts';
import {judgedBank, REVEAL_NODE} from '../src/game-director.ts';
import {partPlaybackRate} from '../src/scene3d-film.ts';
import type {MouthPatch} from '../src/speech-patch.ts';

const sha = 'a'.repeat(64), first = {file: {path: 'assets/anchors/paow-ready-01/anchor.png', sha256: sha}};
const video = (id: string) => `assets/motions/${id}/source.mp4`;
// A deal ends on the landing picture its returns start from, as a deal of the bank does (its last picture is the place's landing
// picture, or a frame of its own film): without it the game would name a seam after every deal of the fixture.
const job = (id: string, from: string, to: string, model: string, extra: Partial<BankJob> = {}): BankJob => ({id, kind: from === 'READY' ? 'DEAL' : to === 'IDLE' && from === 'IDLE' ? 'IDLE' : 'RETURN',
  target: from === 'READY' ? to : null, from, to, model, duration: 4, ratio: 'auto_1080p', audio: false, promptText: 'fixture', first, ...(/^(P[1-7]|D)\.C\d$/.test(to) ? {last: first} : {}), purpose: 'fixture', dealer: 'paow', ...extra});
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

test('the deal tempo trial preserves cards and cuts and never speeds up speech', async () => {
  const table = {hands: [{seat: 4, cards: [2]}], dealer: []};
  const records = [{shoeDraw: 2, target: 'P4.C1', r: 'A', s: 'spades'}];
  const patch: MouthPatch = {
    schemaVersion: 1, kind: 'mouth-patch', id: 'paow-mun-test', dealer: 'paow',
    film: {id: 'p4-deal', path: video('p4-deal'), sha256: sha, fps: 30, frames: 120, width: 1764, height: 1174},
    line: {key: 'goodluck', language: 'sv', text: 'Lycka till!', voice: 'Paow'},
    box: {x: 768, y: 208, w: 184, h: 176}, feather: 24, first: 10, count: 20, weights: new Array(20).fill(1),
    strip: {path: 'mouth.webp', type: 'image/webp', lossless: true, columns: 4, rows: 5, width: 736, height: 880, colour: 'bt709-tv', sha256: sha},
    sound: {path: 'line.wav', type: 'audio/wav', rate: 24000, channels: 1, samples: 24000, startsAtSeconds: 0.6, endsAtSeconds: 1.6, sha256: sha},
    made: {by: 'test', at: '2026-11-13T00:00:00Z', from: {path: 'x', sha256: sha}},
  };
  async function play(tempo?: number, withMouth = false) {
    const queue = players();
    const film = createFilm(queue.players, buildGraph(bank(), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0);
    if (tempo !== undefined) film.dealTempo = tempo;
    if (withMouth) film.mouths = () => [{patch, base: 'assets/speech/paow/patches/test/'}];
    const part = film.talkPart('tal');
    assert.ok(part?.sound);
    const round = film.play([{type: 'deal', shoeDraw: 2}], {table, records}, undefined, {before: [{key: 'goodluck', part, begin() {}}]});
    await new Promise(resolve => setTimeout(resolve, 0));
    queue.end();
    const {beats} = await round;
    const chain = queue.parts.find(list => list.some(p => p.path === video('p4-deal')))!;
    const rest = queue.parts.find(list => list[0]?.rest)?.[0];
    return {chain, rest, beats, lying: film.lying};
  }
  const baseline = await play(), trial = await play(1.12);
  assert.ok(baseline.chain.every(part => part.rate === undefined));
  assert.deepEqual(trial.chain.map(p => [p.path, p.rate]), [
    [video('tal'), undefined], [video('in'), undefined], [video('p4-deal'), 1.12], [video('p4-rest'), 1.12],
  ]);
  assert.deepEqual(trial.chain.map(({rate, absoluteRate, ...part}) => part), baseline.chain);
  assert.deepEqual(trial.beats, baseline.beats);
  assert.deepEqual(trial.lying, [2]);
  assert.equal(trial.rest?.rate, undefined);
  assert.deepEqual(trial.chain.map(p => partPlaybackRate(p, true, 2)), [1, 2, 1.12, 1.12], 'the global tempo never multiplies the trial');
  assert.equal(partPlaybackRate(trial.rest!, true, 2), 1);

  const patched = await play(1.4, true);
  const talkedOver = patched.chain.find(p => p.path === video('p4-deal'))!;
  assert.equal(talkedOver.mouth?.patch, patch);
  assert.equal(talkedOver.rate, undefined);
  assert.equal(partPlaybackRate(talkedOver, true, 2), 1);
  assert.equal(patched.chain.find(p => p.path === video('p4-rest'))?.rate, 1.15);
});

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
const playRound = async (data: BankData, table: {hands: {seat: number; cards: number[]}[]; dealer: number[]}, draws: number[], layout = createLayout(defaultPlan())) => {
  const queue = players(), film = createFilm(queue.players, buildGraph(data, {dealer: 'paow'}), layout, async () => null, () => 0);
  const records = draws.map(n => ({shoeDraw: n, target: '', r: 'A', s: 'spades'}));
  const round = film.play(draws.map(n => ({type: 'deal', shoeDraw: n})) as never, {table, records}); await new Promise(r => setTimeout(r, 0)); queue.end();
  const {gaps, beats} = await round, chain = queue.parts.find(list => list.some(part => !part.rest))!;
  return {gaps, beats, chain, clips: chain.map(part => part.path.split('/')[2])};
};

test('a final C2 uses its own compatible pair via READY if the exit can play', async () => {
  const table = {hands: [{seat: 4, cards: [1, 2]}], dealer: []};
  const records = [1, 2].map(shoeDraw => ({shoeDraw, target: `P4.C${shoeDraw}`, r: 'A', s: 'spades'}));
  const deal = 'p4-second-deal', back = 'p4-second-back';
  async function play(mode: 'own' | 'direct' | 'missing exit' | 'rejected exit' | 'bad return' | 'other hub' |
    'complete hub' | 'variant entry' | 'variant deal' | 'rejected entry' | 'pending exit') {
    const completeHub = ['complete hub', 'variant entry', 'variant deal', 'rejected entry', 'pending exit'].includes(mode);
    const data = bank(), queue = players(), hub = completeHub || mode === 'other hub' ? 'READY-C' : 'READY';
    const cut = {frame: {video: video(mode === 'bad return' ? 'different' : deal), videoSha256: sha, index: 105}};
    data.jobs!.push(job(deal, hub, 'P4.C2', 'wan3', {kind: 'DEAL'}), job(back, 'P4.C2', mode === 'direct' ? 'IDLE' : hub, 'wan3', {first: cut}));
    for (const id of [deal, back]) { data.motions![id] = record('wan3'); data.media![id] = {video: video(id)}; }
    if (completeHub) {
      data.jobs!.push(job('in-c', 'IDLE', hub, 'wan3', {kind: 'ENTRY'}), job('ut-c', hub, 'IDLE', 'wan3'));
      for (const id of ['in-c', 'ut-c']) { data.motions![id] = record('wan3'); data.media![id] = {video: video(id)}; }
    }
    if (mode === 'variant entry') data.motions!['in-c'].review!.acceptedAs = 'VARIANT';
    if (mode === 'variant deal') data.motions![deal].review!.acceptedAs = 'VARIANT';
    if (mode === 'rejected entry') data.motions!['in-c'].review!.decision = 'REJECTED';
    if (mode === 'pending exit') data.motions!['ut-c'].review!.decision = 'PENDING';
    data.motions!['p4-rest'].review!.acceptedAs = 'MAIN';
    if (mode === 'missing exit') data.media!.ut = {video: null};
    if (mode === 'rejected exit') data.motions!.ut = record('kling-4', {review: {decision: 'REJECTED'}});
    const film = createFilm(queue.players, buildGraph(judgedBank(data), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0);
    film.set({table, records, lying: [1]});
    const spoken: string[] = [], talk = film.talkPart('tal');
    const round = film.play([{type: 'deal', shoeDraw: 2}], {table, records}, undefined, {
      before: [{key: 'goodluck', part: talk, begin() { spoken.push('before'); }}],
      after: [{key: 'outcome', part: talk, begin() { spoken.push('after'); }}],
    });
    await new Promise(resolve => setTimeout(resolve, 0)); queue.end();
    const {beats, gaps} = await round, chain = queue.parts[0];
    assert.deepEqual(spoken, ['before', 'after']);
    assert.deepEqual(film.lying, [1, 2]);
    return {chain, gaps, beats, paths: chain.map(part => part.path)};
  }

  const own = await play('own');
  assert.deepEqual(own.paths, ['tal', 'in', deal, back, 'ut', 'tal'].map(video));
  assert.deepEqual(own.beats.map(b => b.kind), ['ENTRY', 'DEAL', 'RETURN', 'EXIT']);
  assert.deepEqual(own.gaps, []);
  assert.equal(own.chain[2].end, 105);
  assert.equal(own.chain[3].cards?.returning, true);
  const placed = (part: FilmPart) => (part.cards?.placed as {shoeDraw: number}[]).map(card => card.shoeDraw);
  assert.deepEqual(own.chain.map(placed), [[1], [1], [1], [1], [1, 2], [1, 2]]);
  assert.deepEqual((await play('direct')).paths, ['tal', 'in', deal, back, 'tal'].map(video));
  const alternate = await play('complete hub');
  assert.deepEqual(alternate.paths, ['tal', 'in-c', deal, back, 'ut-c', 'tal'].map(video));
  assert.deepEqual(alternate.gaps, []);
  assert.deepEqual(alternate.chain.map(placed), own.chain.map(placed));
  for (const mode of ['missing exit', 'rejected exit', 'bad return', 'other hub', 'variant entry', 'variant deal', 'rejected entry', 'pending exit'] as const) {
    const fallback = await play(mode);
    assert.deepEqual(fallback.paths, ['tal', 'in', 'p4-deal', 'p4-rest', 'tal'].map(video), mode);
    assert.deepEqual(fallback.gaps, [], mode);
  }
});

test('the film queue continues a carry only into adjacent source frames for the same target', async () => {
  const table = {hands: [{seat: 4, cards: [1, 2, 3]}], dealer: []};
  const records = [1, 2, 3].map((shoeDraw) => ({shoeDraw, target: `P4.C${shoeDraw}`, r: 'A', s: 'spades'}));
  const clip = 'p4-shared-source', track = `${clip}/card-track.json`;
  async function play(backClip: string, backStart: number) {
    const data = bank(), queue = players();
    data.jobs = data.jobs!.filter(j => !['p4-deal', 'p4-back', 'p4-rest'].includes(j.id));
    data.derived = [
      {id: 'p4-deal', kind: 'DEAL', from: 'READY', to: 'P4.C1', clip, frames: [0, 108], dealer: 'paow'},
      {id: 'p4-back', kind: 'RETURN', from: 'P4.C1', to: 'READY', clip: backClip, frames: [backStart, 119], dealer: 'paow'},
    ];
    data.media!['p4-deal'] = {video: video(clip), track};
    data.media!['p4-back'] = {video: video(backClip), track: `${backClip}/card-track.json`};
    const film = createFilm(queue.players, buildGraph(data, {dealer: 'paow'}), createLayout(defaultPlan()), async () => ({restFrom: 118}), () => 0);
    film.carry = 'film';
    const round = film.play([1, 2, 3].map(shoeDraw => ({type: 'deal', shoeDraw})), {table, records});
    await new Promise(resolve => setTimeout(resolve, 0)); queue.end(); await round;
    return queue.parts[0].filter(part => part.cards?.returning);
  }
  const same = await play(clip, 109);
  assert.deepEqual(same.map(p => [p.cards?.target, p.start, p.cards?.filmContinuesDeal]), [['P4.C1', 109, true], ['P4.C2', 109, undefined], ['P4.C3', 109, undefined]]);
  assert.deepEqual((same[2].cards?.placed as {shoeDraw: number}[]).map(p => p.shoeDraw), [1, 2], 'the current card is not in the placed list');
  assert.equal((await play('p4-separate-return', 109))[0].cards?.filmContinuesDeal, undefined);
  assert.equal((await play(clip, 110))[0].cards?.filmContinuesDeal, undefined);
});

test('the game card keeps its own gloss through an untracked return and appears once as placed in later beats', async () => {
  const table = {hands: [{seat: 6, cards: [2]}, {seat: 4, cards: [3]}], dealer: []};
  const plan = defaultPlan();
  plan.targets['P6.C1'].material.gloss = 0.62;
  plan.targets['P4.C1'].material.gloss = 0.12;
  const {chain} = await playRound(viaHub(), table, [2, 3], createLayout(plan));
  const [deal, back, exit, nextDeal] = ['p6-deal-b', 'p6-back-b', 'ut-b', 'p4-deal'].map(id => chain.find(part => part.path === video(id))!);
  assert.equal(deal.cards?.returning, undefined);
  assert.equal(back.track, null);
  assert.equal(back.cards?.returning, true);
  assert.deepEqual(back.cards?.placed, [], 'the returning card is not drawn twice');
  const options = back.cards as Parameters<typeof returnCardAt>[2];
  const end = returnCardAt(null, 88, options);
  assert.equal(end?.card.shoeDraw, deal.cards?.shoeDraw);
  assert.deepEqual(end?.card.quad, deal.cards?.land);
  assert.equal(end?.card.gloss, 0.62);
  assert.equal(exit.cards?.returning, undefined);
  assert.equal(exit.cards?.gloss, undefined, 'the exit carries no card of its own');
  assert.deepEqual(exit.cards?.placed, [end?.card]);
  assert.equal(nextDeal.cards?.gloss, 0.12);
  assert.deepEqual(nextDeal.cards?.placed, [end?.card], 'the next deal cannot change a lying card’s gloss');
});

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

test('a paused or stalled reveal hides the total until its displayed source frame, after any spoken lead-in', async () => {
  for (const tracked of [true, false]) {
    const data = bank(), reveal = job('turn', 'IDLE', REVEAL_NODE, 'wan3', {kind: 'REVEAL'});
    data.jobs!.push(reveal);
    data.motions!.turn = record('wan3', {source: {fps: 24, frames: 120, sha256: sha}} as never);
    data.receipts!.turn = {status: 'SUCCEEDED'};
    data.media!.turn = {video: video('turn'), track: 'turn-track.json'};
    const calls: {parts: FilmPart[]; options: NonNullable<Parameters<FilmPlayers['play']>[1]>}[] = [];
    const shown: string[] = [];
    const track = tracked ? {frames: Array.from({length: 120}, (_, i) => ({side: i < 2 ? 'BACK' : i < 6 ? 'EDGE' : 'FRONT'}))} : null;
    const film = createFilm({play(parts, options = {}) { calls.push({parts, options}); }, hurry() {}}, buildGraph(data, {dealer: 'paow'}), createLayout(defaultPlan()), async () => track, () => 0);
    const round = film.play([{type: 'reveal', shoeDraw: 2}], {
      table: {hands: [], dealer: [1, 2]},
      records: [{shoeDraw: 1, target: 'D.C1', r: '6', s: 'hearts'}, {shoeDraw: 2, target: 'D.C2', r: 'K', s: 'spades', faceDown: false}],
    }, beat => shown.push(beat.kind), {before: [{part: {path: 'spoken-lead.mp4', sound: true}, begin() {}}]});
    await new Promise(resolve => setImmediate(resolve));
    const {parts, options} = calls[0], index = parts.findIndex(part => part.path === video('turn'));
    assert.equal(index, 1); assert.equal(parts[index].fps, 24);
    options.onPart?.(0);
    options.onFrame?.(index, 6);
    assert.deepEqual(shown, [], 'preloaded reveal cannot expose a card during the spoken lead-in');
    options.onPart?.(index);
    if (tracked) await new Promise(resolve => setTimeout(resolve, 300)); // longer than the old 6/24-second wall-clock timer
    assert.deepEqual(shown, [], 'no presented frame: pause or decoder stall cannot reveal the total');
    options.onFrame?.(index, 5); options.onFrame?.(index, Number.POSITIVE_INFINITY);
    assert.deepEqual(shown, [], 'edge-on and invalid frames keep it hidden');
    options.onFrame?.(index, 6); options.onFrame?.(index, 6); options.onFrame?.(index, 7);
    assert.deepEqual(shown, tracked ? ['REVEAL'] : [], 'a real face frame reveals once; unknown tracking waits for the part to end');
    options.onEnd?.(); await round;
    assert.deepEqual(shown, ['REVEAL'], 'end-of-part fallback still completes the engine beat exactly once');
  }
});

test('while calm is asked for the rest rotation picks only calm rests, and the gestures come again afterwards', async () => {
  // a gesture so heavy that the weighted pick would take it nearly every time it may
  const base = bank(), gesture = job('gest', 'IDLE', 'IDLE', 'wan3');
  const data: BankData = {...base, jobs: [...base.jobs!, gesture], motions: {...base.motions, gest: record('wan3', {motion: {idle: {calm: false, weight: 1000}}} as never)},
    receipts: {...base.receipts, gest: {status: 'SUCCEEDED', estimatedCredits: 0}} as never, media: {...base.media, gest: {video: video('gest'), first: null, last: null}}};
  const graph = buildGraph(data, {dealer: 'paow'}), rests = graph.edge['IDLE>IDLE']?.takes ?? [];
  assert.ok(rests.some(t => t.id === 'gest' && t.idle?.calm === false) && rests.some(t => t.idle?.calm === true), 'the bank of this test has a gesture and a calm rest');
  const queue = players(), film = createFilm(queue.players, graph, createLayout(defaultPlan()), async () => null, () => 0.999);
  const paths = () => queue.parts.map(list => list[0].path);
  film.calm = true; assert.equal(film.calm, true);
  for (let i = 0; i < 6; i++) { film.rest(); await new Promise(r => setTimeout(r, 0)); }
  assert.ok(paths().length >= 6 && !paths().includes(video('gest')), `calm only: ${paths().join(' ')}`);
  film.calm = false; queue.parts.length = 0;
  for (let i = 0; i < 12; i++) { film.rest(); await new Promise(r => setTimeout(r, 0)); }
  assert.ok(paths().includes(video('gest')), `the gesture comes again: ${paths().join(' ')}`);
  // a calm rest that may not be cut (she turns her head in it) is left out too while calm is asked for, where a still one exists
  const turning = {...data, jobs: [...data.jobs!, job('blick', 'IDLE', 'IDLE', 'wan3')], motions: {...data.motions, blick: record('wan3', {motion: {idle: {calm: true, cut: false, weight: 1000}}} as never)},
    receipts: {...data.receipts, blick: {status: 'SUCCEEDED', estimatedCredits: 0}} as never, media: {...data.media, blick: {video: video('blick'), first: null, last: null}}};
  const cuts: boolean[] = [], seen: string[] = [], stub = {play(list: FilmPart[], options: {cut?: boolean} = {}) { seen.push(list[0].path); cuts.push(options.cut === true); }, hurry() {}, preload() {}};
  const held = createFilm(stub, buildGraph(turning, {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0.999);
  held.calm = true;
  for (let i = 0; i < 6; i++) { held.rest(); await new Promise(r => setTimeout(r, 0)); }
  assert.ok(seen.length >= 6 && seen.every(p => p === video('vila')), `only the rest where she holds still: ${seen.join(' ')}`);
  // started over with a cut: the queue is told to show it at once, not after the rest that plays
  assert.ok(cuts.every(c => !c)); held.rest({cut: true}); await new Promise(r => setTimeout(r, 0)); assert.equal(cuts.at(-1), true);
});

test('a rest held on its first frame stands until she speaks or it is let go, and a film played since is left alone', async () => {
  const log: string[] = []; let entered: () => void = () => {};
  const stub = {play(list: FilmPart[], options: {cut?: boolean; onPart?(index: number): void} = {}) { log.push(`${list[0].sound ? 'talk' : 'rest'}${options.cut ? ' cut' : ''}`); entered = () => options.onPart?.(0); },
    hurry() {}, preload() {}, toggle(force?: boolean) { log.push(force ? 'hold' : 'run'); }};
  const film = createFilm(stub, buildGraph(bank(), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0.5), tick = () => new Promise(r => setTimeout(r, 0));
  // without hold nothing is stopped, and there is nothing to let go
  film.rest({cut: true}); await tick(); assert.equal(film.held, false); entered(); film.release(); assert.deepEqual(log, ['rest cut']);
  // held: stopped when its first frame is on screen, and let go once
  log.length = 0; film.rest({cut: true, hold: true}); await tick(); assert.deepEqual(log, ['rest cut'], 'not stopped before its frame is on screen'); assert.equal(film.held, true, 'held from the asking, so the page does not ask twice'); entered(); assert.deepEqual(log, ['rest cut', 'hold']);
  film.release(); assert.equal(film.held, false); film.release(); assert.deepEqual(log, ['rest cut', 'hold', 'run']);
  // held, and then she speaks: the talk film's own play lets the queue run, so nothing is let go behind it
  log.length = 0; film.rest({cut: true, hold: true}); await tick(); entered();
  assert.equal(film.say('tal'), true); assert.equal(film.held, false, 'a film played since: nothing is held'); film.release(); assert.deepEqual(log, ['rest cut', 'hold', 'talk cut']);
  // a held rest whose first frame comes on screen after another film took over is not stopped
  log.length = 0; film.rest({cut: true, hold: true}); await tick(); const late = entered; film.say('tal'); late(); film.release(); assert.deepEqual(log, ['rest cut', 'talk cut']);
  // a queue without a stop (a stub, an older scene) plays the rest as before
  const plain: string[] = [], bare = createFilm({play(list: FilmPart[], options: {onPart?(index: number): void} = {}) { plain.push(list[0].path); options.onPart?.(0); }, hurry() {}, preload() {}}, buildGraph(bank(), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0.5);
  bare.rest({cut: true, hold: true}); await tick(); bare.release(); assert.deepEqual(plain, [video('vila')]);
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

test('the film card recoloured (cardBack=dark, cardFace=paper) goes with every part only when the address asks for it', () => {
  const q = (s: string) => new URLSearchParams(s);
  assert.deepEqual(cardWords(q('')), {});
  assert.deepEqual(cardWords(q('cardBack=yellow&cardFace=blue')), {}, 'only the words count');
  assert.deepEqual(cardWords(q('cardBack=film&cardFace=film')), {back: 'film', face: 'film'}, 'the film\'s colours beside the drawn card again');
  assert.deepEqual(cardWords(q('cardBack=dark')), {back: 'dark'});
  assert.deepEqual(cardWords(q('kort=liggande&cardBack=dark&cardFace=paper')), {back: 'dark', face: 'paper'});
  const layout = createLayout(defaultPlan()), table = {hands: [], dealer: []};
  const plain = cardOptions({own: null, lying: []}, table, [], layout, 'object'), asked = cardOptions({own: null, lying: []}, table, [], layout, 'object', {back: 'dark', face: 'paper'});
  assert.ok(!('back' in plain) && !('face' in plain), 'without a word the part says nothing, so the card layer keeps its line');
  assert.equal(asked.back, 'dark'); assert.equal(asked.face, 'paper'); assert.equal(asked.carry, 'object');
});

test('with a queue that queues, the next rest is asked for while the film before it plays, and a line gets its rest the same way', async () => {
  // A stand-in for the scene's queue: a chain played without cut waits behind the part on screen and comes on when that part ends.
  type Chain = {list: FilmPart[]; options: {cut?: boolean; onPart?(index: number): void; onEnd?(): void}};
  const asked: string[] = []; let on: Chain | null = null, waiting: Chain | null = null;
  const enter = (c: Chain) => { on = c; c.options.onPart?.(0); };
  const queue = {queues: true, hurry() {}, preload() {},
    play(list: FilmPart[], options: Chain['options'] = {}) { asked.push(list[0].path); const c = {list, options}; if (on && !options.cut) waiting = c; else { waiting = null; enter(c); } },
    finish() { const done = on; if (waiting) { const next = waiting; waiting = null; enter(next); } else { on = null; done?.options.onEnd?.(); } }};
  const film = createFilm(queue, buildGraph(bank(), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0.5), wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  film.rest(); await wait(20); assert.equal(asked.length, 1, 'the first rest, and nothing ahead of it at once');
  await wait(320); assert.equal(asked.length, 2, 'a quarter of a second in, the next rest is asked for'); assert.ok(waiting, 'and waits behind the one on screen');
  await wait(320); assert.equal(asked.length, 2, 'one ahead, not a row of them');
  queue.finish(); assert.equal(waiting, null); await wait(320); assert.equal(asked.length, 3, 'the one that came on asks for the next');
  // a line: its rest is asked for while the line plays, and the line's end asks for nothing more
  assert.equal(film.say('tal'), true); assert.equal(asked.at(-1), video('tal')); queue.finish(); await wait(320);
  const afterTalk = asked.length; assert.ok(waiting, 'a rest waits behind the line'); assert.notEqual(asked.at(-1), video('tal'));
  queue.finish(); await wait(20); assert.equal(asked.length, afterTalk, 'the line ended: the rest that waited came on, none was asked for twice');
  // a film played since: what the old turn would have asked for ahead is not asked for
  film.rest({cut: true}); const n = asked.length; film.rest({cut: true}); await wait(320); assert.equal(asked.length, n + 2, 'only the turn that stands asks ahead');
});

// Jakob archives a take by hand in Karta (review.archived): it is out of the game's bank whatever its verdict (judgedBank).
test('a round with an archived Primär plays the step\'s other take; with no take left the card is laid without a hand and the game says so', async () => {
  const archived = {by: 'Jakob', at: '2026-11-18T01:00:00.000Z', where: 'Karta'}, four = {hands: [{seat: 4, cards: [2]}], dealer: []};
  const round = (data: BankData) => playRound(judgedBank(data), four, [2]);
  // Two deals to seat 4: his Primär and another approved take.
  const data = bank();
  data.jobs!.push(job('p4-deal-2', 'READY', 'P4.C1', 'wan3')); data.motions!['p4-deal-2'] = record('wan3'); data.receipts!['p4-deal-2'] = {status: 'SUCCEEDED'}; data.media!['p4-deal-2'] = {video: video('p4-deal-2')};
  data.motions!['p4-deal'] = record('wan3', {review: {decision: 'ACCEPTED', acceptedAs: 'MAIN', userAccepted: true, userReview: 'Jakob 2026-11-17: bäst'}});
  const before = await round(data);
  assert.deepEqual([before.clips, before.gaps], [['in', 'p4-deal', 'p4-rest'], []], 'his Primär plays');
  // He archives the Primär: the round is whole, the other take in its place, and nothing is made Primär for him.
  data.motions!['p4-deal'].review = {...data.motions!['p4-deal'].review, archived};
  const after = await round(data);
  assert.deepEqual([after.clips, after.gaps, after.beats.map(b => b.kind)], [['in', 'p4-deal-2', 'p4-rest'], [], ['ENTRY', 'DEAL', 'RETURN']]);
  assert.deepEqual([data.motions!['p4-deal'].review!.acceptedAs, data.motions!['p4-deal'].review!.userReview, data.motions!['p4-deal-2'].review!.acceptedAs], ['MAIN', 'Jakob 2026-11-17: bäst', undefined], 'his verdict stays on the archived take');
  // He takes it back: the game plays his Primär again.
  const {archived: _gone, ...verdict} = data.motions!['p4-deal'].review!;
  assert.deepEqual((await round({...data, motions: {...data.motions, 'p4-deal': {...data.motions!['p4-deal'], review: verdict}}})).clips, ['in', 'p4-deal', 'p4-rest']);
  // He archives the other take too: nothing can deal to seat 4, so the card is laid without a hand, at once, and the game says it.
  data.motions!['p4-deal-2'].review = {...data.motions!['p4-deal-2'].review, archived};
  const queue = players(), film = createFilm(queue.players, buildGraph(judgedBank(data), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0);
  const landed: string[] = [];
  const none = await film.play([{type: 'deal', shoeDraw: 2}] as never, {table: four, records: [{shoeDraw: 2, target: 'P4.C1', r: 'A', s: 'spades'}]}, beat => landed.push(beat.kind));
  assert.deepEqual([none.gaps, none.beats.map(b => b.kind), landed], [['P4.C1: ingen spelbar film, kortet läggs utan hand'], ['PLACE'], ['PLACE']]);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(queue.parts.at(-1)![0].path, video('vila'), 'and she rests on, as after any step');
  // An archived talk film is not said, and an archived rest is never picked: the loop goes on with what is left, and stops plainly with nothing.
  assert.ok(film.talkPart('tal'), 'her line has its film');
  data.motions!.tal.review = {...data.motions!.tal.review, archived}; data.motions!.vila.review = {...data.motions!.vila.review, archived};
  const quiet = players(), silent = createFilm(quiet.players, buildGraph(judgedBank(data), {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0);
  assert.equal(silent.talkPart('tal'), null);
  silent.rest(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(quiet.parts, [], 'no rest film is left to play (the fixture\'s other rest has weight 0)');
});

// FYND 2 of the rescue lane Kedjan: what the clip bank says about a step it plays (a seam, the other hand) reached nobody in the
// game; it lay in the segment's notes. It is now one of the step's gaps, beside the films that are missing. Shown on the page: not yet.
test('a seam and a return of the other hand reach the game\'s gaps, beside a card laid without a hand; the card\'s move to its place does not', async () => {
  const four = {hands: [{seat: 4, cards: [2]}], dealer: []};
  const clean = await playRound(judgedBank(bank()), four, [2]);
  assert.deepEqual([clean.clips, clean.gaps], [['in', 'p4-deal', 'p4-rest'], []], 'a deal and the return that continues it: nothing to say');
  // The deal ends on another landing picture than its return starts from, and lays the card with the left hand; the return comes back with the right.
  const data = bank();
  data.jobs = data.jobs!.map(j => j.id === 'p4-deal' ? {...j, last: {file: {path: 'assets/anchors/paow-landing-other/anchor.png', sha256: 'b'.repeat(64)}}} : j);
  data.motions!['p4-deal'] = record('wan3', {motion: {physicalEndSide: 'FRONT', releaseHand: 'LH'}});
  data.motions!['p4-rest'] = record('wan3', {motion: {physicalEndSide: 'FRONT', releaseHand: 'RH'}});
  const seam = await playRound(judgedBank(data), four, [2]);
  assert.deepEqual(seam.clips, ['in', 'p4-deal', 'p4-rest'], 'the films are the same: the game says what it plays, it plays nothing else');
  assert.ok(seam.gaps.some(g => g.startsWith('P4.C1>IDLE: Skarv:')), JSON.stringify(seam.gaps));
  assert.ok(seam.gaps.some(g => g.startsWith('P4.C1>IDLE: Fel hand:')), JSON.stringify(seam.gaps));
  assert.ok(seam.gaps.every(g => !/Kortets flytt/.test(g)), 'where the drawn card is moved is the card layer\'s, not a gap');
  // A second card to the seat plays the seat's film with the card moved: no gap of its own for that.
  const two = await playRound(judgedBank(bank()), {hands: [{seat: 4, cards: [2, 3]}], dealer: []}, [2, 3]);
  assert.deepEqual(two.gaps, []);
});

// FYND 5 of the rescue lane Kedjan: the dealer change stood in with films Jakob had rejected when the bank had none of its own (the page's
// EXIT_TRIAL and the first entrance with a film). A film he has rejected is never played: without a judged film nothing is, and the gap is said.
test('the dealer change plays only judged films: without one she is cut, nothing he rejected stands in, and the gap is said', async () => {
  const away = () => {}, rejected = (id: string) => record('kling-4', {review: {decision: 'REJECTED', userAccepted: false, userReview: 'Jakob 2026-11-11: nej'}});
  const withChange = (leave: 'ACCEPTED' | 'REJECTED' | null, arrive: 'ACCEPTED' | 'REJECTED' | null, dealer = 'paow') => {
    const data = bank();
    data.jobs = data.jobs!.map(j => ({...j, dealer}));
    for (const [id, from, to, verdict] of [['leave', 'IDLE', 'AWAY', leave], ['arrive', 'AWAY', 'IDLE', arrive]] as const) {
      if (!verdict) continue;
      data.jobs!.push(job(id, from, to, 'kling-4', {kind: from === 'AWAY' ? 'ARRIVE' : 'LEAVE', dealer}));
      data.motions![id] = verdict === 'REJECTED' ? rejected(id) : record('kling-4'); data.receipts![id] = {status: 'SUCCEEDED'}; data.media![id] = {video: video(id)};
    }
    return buildGraph(judgedBank(data), {dealer});
  };
  // Her own films, judged: she leaves and comes back, nothing to say.
  const fine = players(), one = createFilm(fine.players, withChange('ACCEPTED', 'ACCEPTED'), createLayout(defaultPlan()), async () => null, () => 0);
  const asked = one.swap(away); await new Promise(r => setTimeout(r, 0)); fine.end(); await new Promise(r => setTimeout(r, 0)); fine.end();
  assert.deepEqual(await asked, {played: true, gaps: []});
  assert.deepEqual(fine.parts.flat().map(p => p.path.split('/')[2]).filter(id => id === 'leave' || id === 'arrive'), ['leave', 'arrive']);
  // The film she leaves with is one he rejected: it is not played, nothing is, and the page is told why.
  const queue = players(), film = createFilm(queue.players, withChange('REJECTED', 'ACCEPTED'), createLayout(defaultPlan()), async () => null, () => 0);
  const result = await film.swap(away);
  assert.deepEqual(result, {played: false, gaps: ['IDLE>AWAY: ingen dömd film, dealerbytet spelas inte']});
  assert.ok(queue.parts.flat().every(p => !p.path.includes('/leave/')), 'the rejected film is never handed to the scene');
  // Another dealer comes in who has no judged film to arrive with: she is cut in, the gap is said, and no other film stands in.
  const other = players(), change = createFilm(other.players, withChange('ACCEPTED', null), createLayout(defaultPlan()), async () => null, () => 0);
  const next = withChange(null, 'REJECTED', 'pamela'), swapped = change.swap(away, next);
  await new Promise(r => setTimeout(r, 0)); other.end();
  assert.deepEqual(await swapped, {played: true, gaps: ['AWAY>IDLE: ingen dömd film, hon klipps in']});
  assert.ok(other.parts.flat().every(p => !p.path.includes('/arrive/')), 'her rejected entrance is never played');
});
