// Offline tests for the clip-bank graph. No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import * as graph from '../src/clip-graph.ts';
import type {BankData, BankJob, MotionRecord} from '../src/clip-graph.ts';
import {TARGETS as PLAN_TARGETS, defaultPlan, toPixels} from '../src/placement-model.ts';
import {validateJob} from '../src/clip-job.ts';
import {applyChange} from './review-store.ts';

const sha = 'a'.repeat(64), ready = {file: {path: 'assets/motions/pamela-p4-c1-color-control-01/start.png', sha256: sha}};
const video = (id: string) => `assets/motions/${id}/source.mp4`;
function job(id: string, from: string, to: string, extra: Partial<BankJob> = {}): BankJob {
  const deal = from === 'READY';
  return {id, kind: deal ? 'DEAL' : 'RETURN', target: (deal ? to : from).replace(/^\w+\((.+)\)$/, '$1'), from, to, model: 'wan3', duration: deal ? 4 : 3, ratio: 'auto_1080p', audio: false,
    promptText: deal ? 'Locked camera. One continuous, calm and unhurried four-second deal directly in front, centred in the image. She lays the card on the footprint of the last image.'
      : 'Locked camera. One plain solid blue card lies flat and still on the table in front of her. The hand glides low back.',
    first: ready, last: {file: {path: `assets/anchors/${id}/anchor.png`, sha256: sha}}, purpose: 'fixture', ...extra};
}
const from = (clip: string, index: number) => ({first: {frame: {video: video(clip), videoSha256: sha, index}}});
const done = (decision = 'PENDING', extra: MotionRecord = {}): MotionRecord => ({source: {fps: 30, frames: 120, sha256: sha}, review: {decision}, motion: {physicalEndSide: 'FRONT'}, ...extra});
// Mirrors the bank on 2026-11-10: complete chains for P4.C1 and P1.C1, two P7.C1 deals and nothing else.
function bank(): BankData {
  const jobs = [
    job('pamela-p4-c1-return-ready-calm-01', 'RELEASE(P4.C1)', 'READY', from('pamela-p4-c1-source-turn', 80)),
    job('pamela-p4-c1-deal-calm-01', 'READY', 'RELEASE(P4.C1)'),
    job('pamela-p4-c1-plan-deal-01', 'READY', 'RELEASE(P4.C1)'),
    job('pamela-p1-c1-plan-deal-01', 'READY', 'LAND(P1.C1)'),
    job('pamela-p7-c1-plan-deal-01', 'READY', 'LAND(P7.C1)'),
    job('pamela-p4-c1-plan-deal-02', 'READY', 'RELEASE(P4.C1)'),
    job('pamela-p1-c1-plan-deal-02', 'READY', 'LAND(P1.C1)'),
    job('pamela-p7-c1-plan-deal-02', 'READY', 'LAND(P7.C1)'),
    job('pamela-p4-c1-plan-return-ready-01', 'LAND(P4.C1)', 'READY', {...from('pamela-p4-c1-plan-deal-02', 105), last: {file: {path: 'assets/anchors/pamela-ready-p4-c1-plan-01/anchor.png', sha256: sha}}}),
    job('pamela-p4-c1-plan-return-idle-01', 'LAND(P4.C1)', 'IDLE', from('pamela-p4-c1-plan-deal-02', 105)),
    job('pamela-p1-c1-plan-return-ready-01', 'LAND(P1.C1)', 'READY', from('pamela-p1-c1-plan-deal-02', 112)),
    job('pamela-p1-c1-plan-return-idle-01', 'LAND(P1.C1)', 'IDLE', from('pamela-p1-c1-plan-deal-02', 112)),
  ];
  const motions: Record<string, MotionRecord> = Object.fromEntries(jobs.map(j => [j.id, done()]));
  motions['pamela-p4-c1-plan-deal-01'] = done('REJECTED');
  motions['pamela-p1-c1-plan-deal-01'] = done('SECONDARY');
  motions['pamela-p7-c1-plan-deal-02'] = done('ACCEPTED', {review: {decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true}});
  for (const j of jobs.filter(j => j.kind === 'RETURN')) motions[j.id].source!.frames = 90;
  return {budget: {maximumCredits: 1500}, jobs, motions,
    receipts: Object.fromEntries(jobs.map(j => [j.id, {status: 'SUCCEEDED', estimatedCredits: j.duration * 20}])),
    media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id), first: null, last: null}]))};
}

test('notation: nodes and edges parse tolerantly and print in one canonical form', () => {
  for (const [text, node] of [['p4.c1', 'P4.C1'], ['P4C1', 'P4.C1'], [' d.c2 ', 'D.C2'], ['LAND(P1.C1)', 'P1.C1'], ['RELEASE(P4.C1)', 'P4.C1'], ['vila', 'IDLE'], ['REDO', 'READY'], ['D.C3', 'D.C3']]) assert.equal(graph.parseNode(text), node);
  for (const bad of ['P8.C1', 'P4.C3', 'P0.C1', 'C1', '', 'READY>IDLE', null]) assert.equal(graph.parseNode(bad), null);
  assert.deepEqual(graph.parseEdge('ready > p4c1'), {id: 'READY>P4.C1', from: 'READY', to: 'P4.C1', kind: 'DEAL', target: 'P4.C1', base: 'READY>P4.C1', hub: null});
  assert.deepEqual(['IDLE>READY', 'READY>IDLE', 'IDLE>IDLE', 'P4.C1>READY', 'D.C2->IDLE'].map(e => graph.parseEdge(e)?.kind), ['ENTRY', 'RETURN', 'IDLE', 'RETURN', 'RETURN']);
  // A card is reached from READY and left towards a hub: nothing else is a clip.
  for (const bad of ['P1.C1>P2.C1', 'IDLE>P4.C1', 'READY>READY', 'READY', 'READY>P4.C1>IDLE']) assert.equal(graph.parseEdge(bad), null);
  const text = 'IDLE>READY | READY>P1.C1 | P1.C1>READY | READY>D.C2 | D.C2>IDLE';
  assert.equal(graph.formatSequence(graph.parseSequence(text).steps), text);
  assert.deepEqual(graph.parseSequence('idle>ready\nready>p1c1 | nonsense | p1.c1>idle').errors, ['nonsense']);
  // "@<clip id>" pins one take of an edge, for example an accepted variant.
  const pinned = 'READY>P7.C1@pamela-p7-c1-plan-deal-02 | P7.C1>IDLE';
  assert.equal(graph.parseSequence(pinned).steps[0].take, 'pamela-p7-c1-plan-deal-02'); assert.equal(graph.formatSequence(graph.parseSequence(pinned).steps), pinned);
  assert.deepEqual(graph.parseSequence('READY>P7.C1@Not A Clip | READY>P7.C1@a@b').errors, ['READY>P7.C1@Not A Clip', 'READY>P7.C1@a@b']);
});

test('the bank is 54 edges: three per planned card, entry, exit, idle, the turn of the hole card, her coming and her leaving, with the third dealer card kept apart', () => {
  assert.deepEqual(graph.TARGETS, PLAN_TARGETS);
  const g = graph.buildGraph({});
  assert.equal(g.summary.total, 54); assert.equal(g.summary.optional.total, 3);
  assert.equal(g.summary.done, 0); assert.equal(g.summary.byStatus.MISSING, 54);
  assert.equal(new Set(g.edges.map(e => e.id)).size, 57);
  assert.deepEqual(g.edges.filter(e => e.optional).map(e => e.id), ['READY>D.C3', 'D.C3>READY', 'D.C3>IDLE']);
  assert.equal(g.summary.credits.committed, null);
});

test('status, main take and cut frame follow jobs, receipts and review decisions', () => {
  const g = graph.buildGraph(bank());
  assert.deepEqual(g.unplaced, []);
  assert.equal(g.summary.done, 7); assert.equal(g.summary.total, 54); assert.equal(g.summary.byStatus.UNREVIEWED, 7); assert.equal(g.summary.byStatus.MISSING, 47);
  assert.equal(g.summary.credits.committed, 7 * 80 + 5 * 60); assert.equal(g.summary.credits.maximum, 1500);
  const deal = g.edge['READY>P4.C1'];
  // The rejected take is never chosen; among unreviewed takes the one with its own returns wins.
  assert.equal(deal.main?.id, 'pamela-p4-c1-plan-deal-02'); assert.equal(deal.status, 'UNREVIEWED'); assert.equal(deal.takes.length, 3);
  assert.equal(deal.main?.landingFrame, 105); assert.equal(deal.main?.landingConflict, false);
  assert.equal(g.takes['pamela-p4-c1-deal-calm-01'].landingFrame, null);
  assert.deepEqual(deal.takes.map(t => graph.takeRole(deal, t)), ['OTHER', 'REJECTED', 'MAIN']);
  // The return that starts on the main deal is the main return, not the older one from another film.
  assert.equal(g.edge['P4.C1>READY'].main?.id, 'pamela-p4-c1-plan-return-ready-01');
  assert.deepEqual(g.edge['P4.C1>READY'].main?.startsOn, {clip: 'pamela-p4-c1-plan-deal-02', video: video('pamela-p4-c1-plan-deal-02'), frame: 105});
  assert.equal(g.edge['READY>P1.C1'].main?.id, 'pamela-p1-c1-plan-deal-02'); assert.equal(g.edge['READY>P1.C1'].main?.landingFrame, 112);
  // An accepted variant is offered beside the main take, never instead of it.
  const p7 = g.edge['READY>P7.C1'];
  assert.equal(p7.main?.id, 'pamela-p7-c1-plan-deal-01'); assert.equal(p7.hasVariant, true); assert.deepEqual(p7.variants.map(t => t.id), ['pamela-p7-c1-plan-deal-02']);
  assert.equal(p7.main?.landingFrame, null); assert.equal(g.edge['P7.C1>READY'].status, 'MISSING');
});

test('a take is only playable once it is finished; unfinished and failed work shows as such', () => {
  const stage = (status: string | undefined, motion?: MotionRecord) => graph.buildGraph({jobs: [job('pamela-p2-c1-plan-deal-01', 'READY', 'LAND(P2.C1)')],
    receipts: status ? {'pamela-p2-c1-plan-deal-01': {status}} : {}, motions: motion ? {'pamela-p2-c1-plan-deal-01': motion} : {}}).edge['READY>P2.C1'];
  assert.equal(stage(undefined).status, 'PREPARED'); assert.equal(stage(undefined).takes[0].stage, 'WRITTEN');
  assert.equal(stage('PREPARED').status, 'PREPARED');
  for (const s of ['SUBMITTING', 'PENDING', 'RUNNING', 'THROTTLED']) assert.equal(stage(s).status, 'ORDERED');
  assert.equal(stage('FAILED').status, 'MISSING'); assert.equal(stage('FAILED').main, null);
  assert.equal(stage('SUCCEEDED').status, 'UNREVIEWED');
  assert.equal(stage('SUCCEEDED', done('ACCEPTED')).status, 'ACCEPTED');
  assert.equal(stage('SUCCEEDED', done('REJECTED')).status, 'REJECTED'); assert.equal(stage('SUCCEEDED', done('REJECTED')).main, null);
  assert.equal(stage('SUCCEEDED', done('ACCEPTED', {review: {decision: 'ACCEPTED', acceptedAs: 'VARIANT'}})).status, 'VARIANT');
  // The public site has no receipts: a registered motion alone proves the clip exists.
  assert.equal(stage(undefined, done()).status, 'UNREVIEWED');
});

test('a job outside the model becomes an experiment with its own takes; nothing is dropped silently', () => {
  const data = bank(), before = graph.buildGraph(data).summary;
  const loop = {...job('pamela-ready-b-shoe-plate-01', 'READY-B', 'READY-B'), kind: 'IDLE', target: null};
  data.jobs!.push(loop, {...loop, id: 'pamela-ready-b-shoe-plate-02'}, job('pamela-odd-01', 'LAND(P1.C1)', 'LAND(P2.C1)'), job('pamela-p9-01', 'READY', 'LAND(P9.C1)'));
  data.motions!['pamela-ready-b-shoe-plate-01'] = done('REJECTED'); data.motions!['pamela-ready-b-shoe-plate-02'] = done();
  const g = graph.buildGraph(data);
  // The 54 edges and their counts are untouched; experiments are counted on their own.
  assert.deepEqual({...g.summary, experiments: null, credits: null}, {...before, experiments: null, credits: null});
  // Known node names are written the model's way, unknown ones as the job wrote them.
  assert.deepEqual(g.experiments.map(e => [e.id, e.kind, e.takes.length, e.status, e.experiment]), [['READY-B>READY-B', 'IDLE', 2, 'UNREVIEWED', true], ['P1.C1>P2.C1', 'RETURN', 1, 'PREPARED', true], ['READY>LAND(P9.C1)', 'DEAL', 1, 'PREPARED', true]]);
  assert.equal(g.summary.experiments.total, 3); assert.equal(g.summary.experiments.done, 1);
  assert.equal(g.edges.length, 57); assert.equal(g.edges.some(e => e.experiment), false);
  // Same take logic as inside the model: the rejected take is never the main one.
  const shoe = g.edge['READY-B>READY-B'];
  assert.equal(shoe.main?.id, 'pamela-ready-b-shoe-plate-02'); assert.deepEqual(shoe.takes.map(t => graph.takeRole(shoe, t)), ['REJECTED', 'MAIN']);
  assert.equal(g.takes['pamela-ready-b-shoe-plate-01'].edge, 'READY-B>READY-B');
  // An experiment has no recipe to draft from. It can be played in a chain, but only under a name the graph knows.
  assert.equal(graph.draftJob(g, 'READY-B>READY-B'), null);
  assert.deepEqual(graph.resolveRound(g, [{from: 'READY-B', to: 'READY-B'}, {from: 'READY-B', to: 'NOWHERE'}]).map(s => [s.take?.id ?? null, s.gap]), [['pamela-ready-b-shoe-plate-02', 'LOCAL_ONLY'], [null, 'INVALID']]);
  const known = (id: string) => !!g.edge[id]?.experiment;
  assert.deepEqual(graph.parseSequence('ready-b>ready-b | land(p1.c1)>p2c1 | ready-b>nowhere', known), {steps: [{from: 'READY-B', to: 'READY-B'}, {from: 'P1.C1', to: 'P2.C1'}], errors: ['ready-b>nowhere']});
  assert.deepEqual(graph.parseSequence('READY-B>READY-B').errors, ['READY-B>READY-B']);
  // Every job is accounted for: a take on a model edge, a take on an experiment, or named in unplaced.
  data.jobs!.push({...loop}, {...loop, id: ''}, null as never);
  const odd = graph.buildGraph(data);
  assert.equal(odd.unplaced.length, 3); assert.match(odd.unplaced[0].reason, /två gånger/);
  assert.equal(Object.keys(odd.takes).length + odd.unplaced.length, data.jobs!.length);
  assert.equal(Object.values(odd.takes).filter(t => !odd.edge[t.edge].takes.includes(t)).length, 0);
});

test('experiments read as chains beside the model, and replaced takes are listed, never dropped', () => {
  const data = bank(), film = (id: string, start: string, end: string, kind: string, extra: Partial<BankJob> = {}) => ({...job(id, start, end, extra), kind, target: null});
  data.jobs!.push(film('pamela-readyb-draw-01', 'READY-B', 'DRAWN', 'ENTRY'), film('pamela-p4-c1-drawn-deal-01', 'DRAWN', 'LAND(P4.C1)', 'DEAL', from('pamela-readyb-draw-01', 88)),
    job('pamela-p4-c1-readyb-deal-01', 'READY-B', 'LAND(P4.C1)'), film('pamela-ready-b-shoe-plate-01', 'READY-B', 'READY-B', 'IDLE'));
  for (const id of ['pamela-readyb-draw-01', 'pamela-p4-c1-drawn-deal-01', 'pamela-p4-c1-readyb-deal-01']) { data.motions![id] = done(); data.media![id] = {video: video(id)}; }
  data.motions!['pamela-p4-c1-plan-deal-01'].source!.bytes = 11443369;
  const g = graph.buildGraph(data), chains = graph.experimentChains(g);
  assert.deepEqual(g.experiments.map(e => e.id), ['READY-B>DRAWN', 'DRAWN>P4.C1', 'READY-B>READY-B']);
  // Two ways to the same card besides the model's own READY>P4.C1: over DRAWN, and straight from READY-B.
  assert.deepEqual(chains, [{nodes: ['READY-B', 'DRAWN', 'P4.C1'], steps: [{from: 'READY-B', to: 'DRAWN'}, {from: 'DRAWN', to: 'P4.C1'}], target: 'P4.C1'},
    {nodes: ['READY-B', 'P4.C1'], steps: [{from: 'READY-B', to: 'P4.C1'}], target: 'P4.C1'}]);
  // A chain plays like any other: a film is cut where the next was cut out of it, and the model's return follows.
  const played = graph.resolveRound(g, [...chains[0].steps, {from: 'P4.C1', to: 'IDLE'}]);
  assert.deepEqual(played.map(s => [s.take?.id, s.end, s.cut, s.gap]), [['pamela-readyb-draw-01', 88, 'FRAME', null], ['pamela-p4-c1-drawn-deal-01', null, null, null], ['pamela-p4-c1-plan-return-idle-01', null, null, null]]);
  assert.deepEqual(played[1].notes, []); assert.match(played[2].notes.join(' '), /Skarv/);
  assert.equal(graph.resolveRound(g, chains[1].steps)[0].take?.id, 'pamela-p4-c1-readyb-deal-01');
  // What matters now is the main take, accepted variants, variant starts and work on its way. The rest is kept as leftovers.
  const deal = g.edge['READY>P4.C1'];
  assert.deepEqual(deal.takes.map(t => [t.id.replace('pamela-p4-c1-', ''), graph.isCurrent(deal, t)]), [['deal-calm-01', false], ['plan-deal-01', false], ['plan-deal-02', true], ['readyb-deal-01', true]]);
  assert.equal(graph.isCurrent(g.edge['READY>P7.C1'], g.takes['pamela-p7-c1-plan-deal-02']), true);
  assert.deepEqual(graph.leftovers(g).map(l => [l.take.id, l.edge.id, l.role, l.bytes]), [['pamela-p1-c1-plan-deal-01', 'READY>P1.C1', 'OTHER', null],
    ['pamela-p4-c1-deal-calm-01', 'READY>P4.C1', 'OTHER', null], ['pamela-p4-c1-plan-deal-01', 'READY>P4.C1', 'REJECTED', 11443369], ['pamela-p4-c1-return-ready-calm-01', 'P4.C1>READY', 'OTHER', null]]);
  assert.equal(Object.keys(g.takes).length, data.jobs!.length);
});

test('a derived take is a range of frames from an existing clip and plays as its own step', () => {
  const data = bank(), source = 'pamela-p1-c1-ready2-01';
  data.jobs!.push({...job('pamela-p4-c1-drawn-deal-01', 'DRAWN', 'LAND(P4.C1)'), kind: 'DEAL', target: null});
  data.motions!['pamela-p4-c1-drawn-deal-01'] = done('ACCEPTED'); data.media!['pamela-p4-c1-drawn-deal-01'] = {video: video('pamela-p4-c1-drawn-deal-01')};
  data.derived = [{id: 'pamela-readyb-draw-cut-01', kind: 'ENTRY', from: 'READY-B', to: 'DRAWN', clip: source, frames: [0, 50], purpose: 'Real draw-out motion from an older clip.'},
    {id: 'pamela-bad-cut-01', from: 'READY-B', to: 'DRAWN', clip: source, frames: [50, 10]} as never, {id: 'pamela-end-cut-01', kind: 'IDLE', from: 'DRAWN', to: 'DRAWN', clip: source, frames: [300, 359]}];
  for (const id of ['pamela-readyb-draw-cut-01', 'pamela-end-cut-01']) { data.motions![id] = {source: {fps: 30, frames: 360}}; data.media![id] = {video: video(source)}; }
  const g = graph.buildGraph(data), take = g.takes['pamela-readyb-draw-cut-01'];
  assert.deepEqual(g.unplaced, [{id: 'pamela-bad-cut-01', reason: 'Utsnittet saknar klipp eller giltiga rutor.'}]);
  assert.deepEqual([take.edge, take.kind, take.stage, take.segment, take.startsOn, take.credits], ['READY-B>DRAWN', 'ENTRY', 'DONE', {clip: source, start: 0, end: 50}, null, 0]);
  assert.equal(g.edge['READY-B>DRAWN'].main, take); assert.equal(g.edge['READY-B>DRAWN'].status, 'UNREVIEWED');
  // The chain READY-B > DRAWN > P4.C1 shows frames 0–50 of the old clip and then the approved deal in full.
  const [draw, deal] = graph.resolveRound(g, graph.experimentChains(g)[0].steps);
  assert.deepEqual([draw.take?.id, draw.video, draw.start, draw.end, deal.take?.id, deal.start, deal.end], ['pamela-readyb-draw-cut-01', video(source), 0, 51, 'pamela-p4-c1-drawn-deal-01', 0, null]);
  // A range that runs to the clip's last frame simply plays to the end.
  assert.deepEqual(graph.resolveRound(g, [{from: 'DRAWN', to: 'DRAWN'}]).map(s => [s.start, s.end]), [[300, null]]);
  // Without the film on this machine the take is still listed, as a named gap.
  data.media = {}; data.motions!['pamela-readyb-draw-cut-01'] = {};
  assert.equal(graph.buildGraph(data).takes['pamela-readyb-draw-cut-01'].stage, 'WRITTEN');
});

test('READY can have named variants: such a take sits beside the edge it belongs to and is only used when asked for', () => {
  assert.equal(graph.parseNode('ready-b'), 'READY-B'); assert.equal(graph.hubOf('READY-B'), 'READY'); assert.equal(graph.hubOf('P4.C1'), null);
  assert.deepEqual(graph.parseEdge('ready-b>p4c1'), {id: 'READY-B>P4.C1', from: 'READY-B', to: 'P4.C1', kind: 'DEAL', target: 'P4.C1', base: 'READY>P4.C1', hub: 'READY-B'});
  assert.deepEqual(['P4.C1>READY-B', 'IDLE>READY-B', 'READY-B>IDLE'].map(e => { const r = graph.parseEdge(e)!; return [r.kind, r.base, r.hub]; }),
    [['RETURN', 'P4.C1>READY', 'READY-B'], ['ENTRY', 'IDLE>READY', 'READY-B'], ['RETURN', 'READY>IDLE', 'READY-B']]);
  // Between two READY poses there is no model edge; such a clip is an experiment.
  for (const none of ['READY-B>READY-B', 'READY>READY-B', 'READY-B>READY', 'READY-']) assert.equal(graph.parseEdge(none), null);
  const data = bank();
  data.jobs!.push(job('pamela-p4-c1-readyb-deal-01', 'READY-B', 'LAND(P4.C1)'), job('pamela-p2-c1-readyb-deal-01', 'READY-B', 'LAND(P2.C1)'));
  data.motions!['pamela-p4-c1-readyb-deal-01'] = done('ACCEPTED'); data.motions!['pamela-p2-c1-readyb-deal-01'] = done();
  const g = graph.buildGraph(data), deal = g.edge['READY>P4.C1'];
  assert.deepEqual(g.experiments, []); assert.equal(g.summary.done, 7);
  // The edge keeps its plain main take and status; the variant start is offered next to it.
  assert.equal(deal.main?.id, 'pamela-p4-c1-plan-deal-02'); assert.equal(deal.status, 'UNREVIEWED'); assert.deepEqual(deal.hubVariants, ['READY-B']);
  assert.equal(g.takes['pamela-p4-c1-readyb-deal-01'].hub, 'READY-B'); assert.equal(graph.takeRole(deal, g.takes['pamela-p4-c1-readyb-deal-01']), 'START');
  // A card that only has a variant-start deal is still missing in the 54-edge count.
  assert.equal(g.edge['READY>P2.C1'].status, 'MISSING'); assert.equal(g.edge['READY>P2.C1'].main, null); assert.deepEqual(g.edge['READY>P2.C1'].hubVariants, ['READY-B']);
  // In a round the notation decides: READY>P4.C1 plays the plain take, READY-B>P4.C1 the variant start.
  const [plain, variant, missing] = graph.resolveRound(g, graph.parseSequence('READY>P4.C1 | READY-B>P4.C1 | READY-B>P1.C1').steps);
  assert.equal(plain.take?.id, 'pamela-p4-c1-plan-deal-02'); assert.equal(variant.take?.id, 'pamela-p4-c1-readyb-deal-01'); assert.equal(variant.edge?.id, 'READY>P4.C1');
  assert.match(variant.notes.join(' '), /Bryter kedjan/); assert.equal(missing.gap, 'MISSING');
  assert.equal(graph.resolveRound(g, [{from: 'READY', to: 'P2.C1'}])[0].gap, 'MISSING');
});

test('an explicit main marker and landing frame in the motion record override the derived ones', () => {
  const data = bank();
  data.motions!['pamela-p4-c1-deal-calm-01'].review!.acceptedAs = 'MAIN';
  data.motions!['pamela-p4-c1-deal-calm-01'].motion!.landingFrame = 96;
  const g = graph.buildGraph(data);
  assert.equal(g.edge['READY>P4.C1'].main?.id, 'pamela-p4-c1-deal-calm-01'); assert.equal(g.edge['READY>P4.C1'].main?.landingFrame, 96);
  // Returns that disagree about the landing frame are reported instead of silently averaged.
  data.jobs!.push(job('pamela-p4-c1-plan-return-idle-02', 'LAND(P4.C1)', 'IDLE', from('pamela-p4-c1-plan-deal-02', 108)));
  const conflict = graph.buildGraph(data).takes['pamela-p4-c1-plan-deal-02'];
  assert.equal(conflict.landingConflict, true); assert.equal(conflict.landingFrame, 105);
});

test('a standard round is IDLE>READY, each deal with its return, and IDLE after the last card', () => {
  assert.equal(graph.formatSequence(graph.roundSequence({seats: ['P2', 'P1']})),
    'IDLE>READY | READY>P1.C1 | P1.C1>READY | READY>P2.C1 | P2.C1>READY | READY>D.C1 | D.C1>READY | READY>P1.C2 | P1.C2>READY | READY>P2.C2 | P2.C2>READY | READY>D.C2 | D.C2>IDLE');
  assert.equal(graph.formatSequence(graph.roundSequence({seats: ['P4'], dealer: false, cards: 1})), 'IDLE>READY | READY>P4.C1 | P4.C1>IDLE');
  assert.equal(graph.formatSequence(graph.roundSequence({seats: [], cards: 1, thirdDealerCard: true})), 'IDLE>READY | READY>D.C1 | D.C1>IDLE | IDLE>READY | READY>D.C3 | D.C3>IDLE');
  assert.deepEqual(graph.roundSequence({seats: [], dealer: false}), []);
  assert.equal(graph.roundSequence({seats: graph.SEATS}).length, 1 + 16 * 2);
  for (const steps of [graph.roundSequence({seats: graph.SEATS, thirdDealerCard: true}), graph.roundSequence({seats: ['P3'], cards: 1})])
    steps.forEach((s, i) => assert.equal(s.from, i ? steps[i - 1].to : 'IDLE'));
  assert.equal(graph.wantedSide('D.C2'), 'BACK'); assert.equal(graph.wantedSide('D.C2', false), 'FRONT'); assert.equal(graph.wantedSide('P4.C2'), 'FRONT');
});

test('a round can deal a seat from READY-B: through rest around it, staying at READY-B between two of its cards', () => {
  const hubs = {'P6.C1': 'READY-B'}, round = (options: graph.RoundOptions) => graph.formatSequence(graph.roundSequence(options));
  // In the middle of the round: the deal before it goes to rest, then rest to READY-B and back to rest, and the next deal from READY starts with the plain entry.
  assert.equal(round({seats: ['P4', 'P6'], hubs}),
    'IDLE>READY | READY>P4.C1 | P4.C1>IDLE | IDLE>READY-B | READY-B>P6.C1 | P6.C1>READY-B | READY-B>IDLE | IDLE>READY | READY>D.C1 | D.C1>READY | READY>P4.C2 | P4.C2>IDLE'
    + ' | IDLE>READY-B | READY-B>P6.C2 | P6.C2>READY-B | READY-B>IDLE | IDLE>READY | READY>D.C2 | D.C2>IDLE');
  // First in the round, and last.
  assert.equal(round({seats: ['P6', 'P7'], dealer: false, cards: 1, hubs}), 'IDLE>READY-B | READY-B>P6.C1 | P6.C1>READY-B | READY-B>IDLE | IDLE>READY | READY>P7.C1 | P7.C1>IDLE');
  assert.equal(round({seats: ['P4', 'P6'], dealer: false, cards: 1, hubs}), 'IDLE>READY | READY>P4.C1 | P4.C1>IDLE | IDLE>READY-B | READY-B>P6.C1 | P6.C1>READY-B | READY-B>IDLE');
  // Two cards of the seat in a row: the hand waits at READY-B between them; the second card plays the first card's film, as from READY.
  assert.equal(round({seats: ['P6'], dealer: false, hubs}), 'IDLE>READY-B | READY-B>P6.C1 | P6.C1>READY-B | READY-B>P6.C2 | P6.C2>READY-B | READY-B>IDLE');
  // The hole card's turn and the third dealer card start from rest, after READY-B's exit as after any return to rest.
  assert.deepEqual(graph.roundSequence({seats: ['P6'], reveal: true, thirdDealerCard: true, hubs}).map(e => e.id).slice(-8),
    ['READY-B>IDLE', 'IDLE>READY', 'READY>D.C2', 'D.C2>IDLE', 'IDLE>REVEAL(D.C2)', 'IDLE>READY', 'READY>D.C3', 'D.C3>IDLE']);
  // Every step is an edge of the model, and each starts where the one before it ended (rest with the hole card turned is rest).
  for (const options of [{seats: graph.SEATS, hubs}, {seats: ['P6'], dealer: false, hubs}, {seats: ['P5', 'P6', 'P7'], reveal: true, thirdDealerCard: true, hubs}]) {
    const steps = graph.roundSequence(options), pose = (node: string) => node === graph.REVEAL_NODE ? 'IDLE' : node;
    steps.forEach((s, i) => { assert.ok(s, 'a model edge'); assert.equal(s.from, i ? pose(steps[i - 1].to) : 'IDLE'); });
  }
  // A round without that seat, an empty map, and a map that names no READY variant are the round as it always was.
  for (const options of [{seats: ['P2', 'P1']}, {seats: graph.SEATS.filter(s => s !== 'P6'), reveal: true, thirdDealerCard: true}, {seats: ['P4'], dealer: false, cards: 1}])
    for (const other of [hubs, {}, {'P4.C1': 'READY'}, {'P4.C1': 'IDLE'}, {'P4.C1': 'READY-'}, {'D.C1': 'nonsense'}] as Record<string, string>[])
      assert.equal(round({...options, hubs: other}), round(options), JSON.stringify([options, other]));
  assert.equal(graph.dealHub('P6.C2', hubs), 'READY-B', "the second card follows the seat's first"); assert.equal(graph.dealHub('D.C2', {'D.C1': 'READY-B'}), 'READY', 'the hole card keeps its own film');
  assert.equal(graph.dealHub('P6.C2', {'P6.C1': 'READY-B', 'P6.C2': 'READY-C'}), 'READY-C'); assert.equal(graph.dealHub('P6.C1', null), 'READY');
});

test('a round through READY-B resolves with what the graph already knows: takes of that pose only, the deal cut where its return begins', () => {
  const data = bank(), b = (id: string, from: string, to: string, extra: Partial<BankJob>) => job(id, from, to, {target: null, ...extra});
  data.jobs!.push(b('pamela-entry-01', 'IDLE', 'READY', {kind: 'ENTRY'}), b('pamela-exit-01', 'READY', 'IDLE', {kind: 'RETURN'}),
    b('pamela-ready-b-entry-01', 'IDLE', 'READY-B', {kind: 'ENTRY'}), b('pamela-ready-b-exit-01', 'READY-B', 'IDLE', {kind: 'RETURN'}),
    job('pamela-p6-c1-readyb-deal-01', 'READY-B', 'LAND(P6.C1)', {kind: 'DEAL', target: 'P6.C1'}),
    job('pamela-p6-c1-readyb-return-01', 'LAND(P6.C1)', 'READY-B', from('pamela-p6-c1-readyb-deal-01', 100)));
  for (const j of data.jobs!.slice(-6)) { data.motions![j.id] = done('ACCEPTED'); data.media![j.id] = {video: video(j.id)}; data.receipts![j.id] = {status: 'SUCCEEDED'}; }
  const g = graph.buildGraph(data), hubs = {'P6.C1': 'READY-B'};
  const ids = (segments: graph.Segment[]) => segments.map(s => [s.id, s.take?.id ?? s.gap]);
  const segments = graph.resolveRound(g, graph.roundSequence({seats: ['P4', 'P6'], dealer: false, cards: 1, hubs}));
  assert.deepEqual(ids(segments), [['IDLE>READY', 'pamela-entry-01'], ['READY>P4.C1', 'pamela-p4-c1-plan-deal-02'], ['P4.C1>IDLE', 'pamela-p4-c1-plan-return-idle-01'],
    ['IDLE>READY-B', 'pamela-ready-b-entry-01'], ['READY-B>P6.C1', 'pamela-p6-c1-readyb-deal-01'], ['P6.C1>READY-B', 'pamela-p6-c1-readyb-return-01'], ['READY-B>IDLE', 'pamela-ready-b-exit-01']]);
  assert.deepEqual(segments.flatMap(s => s.notes), [], 'no broken chain, no seam');
  assert.deepEqual([segments[4].end, segments[4].cut, segments[4].edge?.id], [100, 'FRAME', 'READY>P6.C1']);
  // Two cards of the seat in a row: the second plays the seat's film from READY-B, moved to its own place.
  const places = {'P6.C1': {x: 100, y: 50}, 'P6.C2': {x: 130, y: 45}};
  const twice = graph.resolveRound(g, graph.roundSequence({seats: ['P6'], dealer: false, hubs}), {places});
  assert.deepEqual(ids(twice), [['IDLE>READY-B', 'pamela-ready-b-entry-01'], ['READY-B>P6.C1', 'pamela-p6-c1-readyb-deal-01'], ['P6.C1>READY-B', 'pamela-p6-c1-readyb-return-01'],
    ['READY-B>P6.C2', 'pamela-p6-c1-readyb-deal-01'], ['P6.C2>READY-B', 'pamela-p6-c1-readyb-return-01'], ['READY-B>IDLE', 'pamela-ready-b-exit-01']]);
  assert.deepEqual([twice[3].why, twice[3].shift, twice[3].end], ['SHARED', {x: 30, y: -5}, 100]);
  // The plain steps never play a take of READY-B, and the READY-B steps never a plain one: a round without the map is as it was before those takes came.
  const plain = graph.roundSequence({seats: ['P4', 'P1'], dealer: false, cards: 1});
  assert.deepEqual(ids(graph.resolveRound(g, plain)).slice(1), ids(graph.resolveRound(graph.buildGraph(bank()), plain)).slice(1));
  assert.equal(graph.resolveRound(g, plain)[0].take?.id, 'pamela-entry-01');
  delete data.media!['pamela-ready-b-exit-01'];
  data.jobs = data.jobs!.filter(j => j.id !== 'pamela-ready-b-exit-01');
  assert.equal(graph.resolveRound(graph.buildGraph(data), [{from: 'READY-B', to: 'IDLE'}])[0].gap, 'MISSING', 'the plain exit does not stand in for the exit from READY-B');
});

test('a round resolves to one take per step, cuts each deal at its landing frame and marks gaps', () => {
  const g = graph.buildGraph(bank());
  const segments = graph.resolveRound(g, graph.roundSequence({seats: ['P1', 'P4'], dealer: false, cards: 1}));
  assert.deepEqual(segments.map(s => [s.id, s.take?.id ?? s.gap, s.start, s.end]), [
    ['IDLE>READY', 'MISSING', 0, null],
    ['READY>P1.C1', 'pamela-p1-c1-plan-deal-02', 0, 112],
    ['P1.C1>READY', 'pamela-p1-c1-plan-return-ready-01', 0, null],
    ['READY>P4.C1', 'pamela-p4-c1-plan-deal-02', 0, 105],
    ['P4.C1>IDLE', 'pamela-p4-c1-plan-return-idle-01', 0, null],
  ]);
  assert.deepEqual(segments.flatMap(s => s.notes), []);
  assert.equal(segments[1].video, video('pamela-p1-c1-plan-deal-02')); assert.equal(segments[1].side, 'FRONT');
  // A pinned deal without its own returns: the return is still played, with the seam named.
  const pinned = graph.resolveRound(g, [{from: 'READY', to: 'P4.C1', take: 'pamela-p4-c1-deal-calm-01'}, {from: 'P4.C1', to: 'READY'}]);
  assert.equal(pinned[0].end, null); assert.match(pinned[0].notes[0], /Landningsrutan är okänd/);
  assert.equal(pinned[1].take?.id, 'pamela-p4-c1-plan-return-ready-01'); assert.match(pinned[1].notes[0], /Skarv/);
  // A pinned variant is played; a pinned take that is rejected or unknown falls back to the main take, with a note.
  assert.equal(graph.resolveRound(g, [{from: 'READY', to: 'P7.C1', take: 'pamela-p7-c1-plan-deal-02'}])[0].take?.id, 'pamela-p7-c1-plan-deal-02');
  const refused = graph.resolveRound(g, [{from: 'READY', to: 'P4.C1', take: 'pamela-p4-c1-plan-deal-01'}])[0];
  assert.equal(refused.take?.id, 'pamela-p4-c1-plan-deal-02'); assert.match(refused.notes[0], /Låst tagning/);
  // Unknown edges, broken chains and unfinished work never throw.
  const odd = graph.resolveRound(g, [{from: 'P1.C1', to: 'P2.C1'}, {from: 'READY', to: 'P7.C1'}, {from: 'P7.C1', to: 'IDLE'}, {from: 'READY', to: 'D.C2'}]);
  assert.deepEqual(odd.map(s => s.gap), ['INVALID', null, 'MISSING', 'MISSING']);
  assert.match(odd[1].notes.join(' '), /Bryter kedjan/); assert.match(odd[1].notes.join(' '), /Landningsrutan/); assert.equal(odd[3].side, 'BACK');
  // Without local media (public site) a finished take is a named gap, not a broken player.
  const remote = bank(); remote.media = {}; remote.receipts = {};
  assert.equal(graph.resolveRound(graph.buildGraph(remote), [{from: 'READY', to: 'P4.C1'}])[0].gap, 'LOCAL_ONLY');
  // The hole card wants a closed take; an open one is used with a warning rather than hidden.
  const hole = bank(); hole.jobs!.push(job('pamela-d-c2-plan-deal-01', 'READY', 'LAND(D.C2)')); hole.motions!['pamela-d-c2-plan-deal-01'] = done();
  assert.match(graph.resolveRound(graph.buildGraph(hole), [{from: 'READY', to: 'D.C2'}])[0].notes.join(' '), /rundan vill ha stängt/);
  assert.deepEqual(graph.resolveRound(graph.buildGraph(hole), [{from: 'READY', to: 'D.C2'}], {holeCardDown: false})[0].notes.filter(n => /vill ha/.test(n)), []);
});

test('anchor rule: a return from the landing anchor follows every take of the deal, each played to its last frame', () => {
  const anchor = {file: {path: 'assets/anchors/pamela-p2-c1-plan-land-01/anchor.png', sha256: sha}}, id = (name: string) => `pamela-p2-c1-plan-${name}`;
  const jobs = [job(id('deal-01'), 'READY', 'LAND(P2.C1)', {last: anchor}), job(id('deal-02'), 'READY', 'LAND(P2.C1)', {last: anchor}),
    job(id('return-ready-01'), 'LAND(P2.C1)', 'READY', {first: anchor}), job(id('return-idle-01'), 'LAND(P2.C1)', 'IDLE', {first: anchor})];
  const build = () => graph.buildGraph({jobs, motions: Object.fromEntries(jobs.map(j => [j.id, done()])), media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id)}]))});
  const g = build(), back = g.takes[id('return-ready-01')];
  assert.equal(back.anchorStart, anchor.file.path); assert.equal(back.startsOn, null);
  for (const deal of [g.takes[id('deal-01')], g.takes[id('deal-02')]]) {
    assert.equal(deal.landingFrame, null); assert.equal(graph.returnFits(back, deal), true);
    assert.deepEqual(graph.returnsOf(g, deal), {frame: [], anchor: [back, g.takes[id('return-idle-01')]]});
  }
  // No take is tied to a return any more, so the newest unreviewed deal is the main one.
  assert.equal(g.edge['READY>P2.C1'].main?.id, id('deal-02')); assert.equal(g.edge['P2.C1>READY'].main, back);
  for (const take of [undefined, id('deal-01')]) {
    const [deal, home] = graph.resolveRound(g, [{from: 'READY', to: 'P2.C1', take}, {from: 'P2.C1', to: 'IDLE'}]);
    assert.deepEqual([deal.take?.id, deal.end, deal.cut, home.take?.id], [take ?? id('deal-02'), null, 'END', id('return-idle-01')]);
    assert.deepEqual([...deal.notes, ...home.notes], []);
  }
  assert.deepEqual(graph.resolveRound(g, [{from: 'READY', to: 'P2.C1'}]).map(s => [s.end, s.cut, s.notes.length]), [[null, 'END', 0]]);
  // The older rule still holds where a return was cut from one frame of one deal clip: it fits only that take.
  jobs.push(job(id('return-ready-02'), 'LAND(P2.C1)', 'READY', from(id('deal-01'), 101)));
  const mixed = build(), cut = mixed.takes[id('return-ready-02')];
  assert.equal(cut.anchorStart, null); assert.equal(mixed.takes[id('deal-01')].landingFrame, 101);
  assert.deepEqual(graph.returnsOf(mixed, mixed.takes[id('deal-01')]).frame, [cut]); assert.deepEqual(graph.returnsOf(mixed, mixed.takes[id('deal-02')]).frame, []);
  assert.equal(graph.returnFits(cut, mixed.takes[id('deal-01')]), true); assert.equal(graph.returnFits(cut, mixed.takes[id('deal-02')]), false);
  const exact = graph.resolveRound(mixed, graph.parseSequence(`READY>P2.C1@${id('deal-01')} | P2.C1>READY@${id('return-ready-02')}`).steps);
  assert.deepEqual([exact[0].end, exact[0].cut, exact.flatMap(s => s.notes)], [101, 'FRAME', []]);
  const wrong = graph.resolveRound(mixed, graph.parseSequence(`READY>P2.C1@${id('deal-02')} | P2.C1>READY@${id('return-ready-02')}`).steps);
  assert.equal(wrong[0].cut, null); assert.match(wrong[1].notes.join(' '), /Skarv/);
  // Unpinned, the chain picks the return that fits the deal it just played.
  assert.deepEqual(graph.resolveRound(mixed, graph.parseSequence('READY>P2.C1, P2.C1>READY').steps).map(s => [s.take?.id, s.cut]), [[id('deal-02'), 'END'], [id('return-ready-01'), null]]);
  assert.equal(mixed.edge['P2.C1>READY'].main?.id, id('return-ready-01'));
  // "Every take" means every take that ends on that anchor image. Variant B deals end on their own landing
  // anchor, so B's returns follow B's deals and the model's returns the model's deals, never crosswise.
  const other = {file: {path: 'assets/anchors/pamela-p2-c1-plan-land-b-01/anchor.png', sha256: 'b'.repeat(64)}};
  jobs.push({...job('pamela-p2-c1-drawn-deal-01', 'DRAWN', 'LAND(P2.C1)', {last: other}), kind: 'DEAL', target: null},
    {...job('pamela-p2-c1-plan-return-idleb-01', 'LAND(P2.C1)', 'IDLE-B', {first: other}), kind: 'RETURN', target: null});
  const both = build(), dealB = both.takes['pamela-p2-c1-drawn-deal-01'], homeB = both.takes['pamela-p2-c1-plan-return-idleb-01'];
  assert.deepEqual([graph.returnFits(homeB, dealB), graph.returnFits(homeB, both.takes[id('deal-02')]), graph.returnFits(both.takes[id('return-idle-01')], dealB)], [true, false, false]);
  assert.deepEqual(graph.returnsOf(both, dealB), {frame: [], anchor: [homeB]}); assert.equal(graph.returnsOf(both, both.takes[id('deal-02')]).anchor.includes(homeB), false);
  assert.deepEqual(graph.resolveRound(both, [{from: 'DRAWN', to: 'P2.C1'}, {from: 'P2.C1', to: 'IDLE-B'}]).map(s => [s.take?.id, s.cut, s.notes]),
    [['pamela-p2-c1-drawn-deal-01', 'END', []], ['pamela-p2-c1-plan-return-idleb-01', null, []]]);
  assert.match(graph.resolveRound(both, [{from: 'READY', to: 'P2.C1'}, {from: 'P2.C1', to: 'IDLE-B'}])[1].notes.join(' '), /annat landningsankare/);
});

test('a job draft for a missing edge has the job file shape, the next free id and seat wording', () => {
  const g = graph.buildGraph(bank());
  const deal = graph.draftJob(g, 'READY>P2.C1')!;
  assert.deepEqual(Object.keys(deal.job), ['id', 'kind', 'target', 'from', 'to', 'model', 'duration', 'ratio', 'audio', 'promptText', 'first', 'last', 'purpose']);
  assert.deepEqual([deal.job.id, deal.job.kind, deal.job.target, deal.job.from, deal.job.to, deal.job.model, deal.job.duration, deal.job.ratio, deal.job.audio],
    ['pamela-p2-c1-plan-deal-01', 'DEAL', 'P2.C1', 'READY', 'LAND(P2.C1)', 'wan3', 4, 'auto_1080p', false]);
  assert.equal(deal.basedOn, 'pamela-p1-c1-plan-deal-02'); // nearest seat with a main take
  assert.match(deal.job.promptText, /four-second deal to the left side of the image\./); assert.doesNotMatch(deal.job.promptText, /centred in the image/);
  assert.deepEqual(deal.job.first, ready);
  assert.equal(deal.job.last.file?.path, 'assets/anchors/pamela-p2-c1-plan-land-01/anchor.png');
  // An anchor that does not exist yet keeps a visible TODO, so an unfinished draft cannot be frozen.
  assert.throws(() => validateJob(deal.job), /file reference/);
  const back = graph.draftJob(g, 'P7.C1>IDLE')!;
  assert.deepEqual([back.job.id, back.job.kind, back.job.from, back.job.to, back.job.duration], ['pamela-p7-c1-plan-return-idle-01', 'RETURN', 'LAND(P7.C1)', 'IDLE', 3]);
  // Anchor rule: a new return starts from the deal's own end image, so it follows every take of that deal.
  assert.deepEqual(back.job.first.file, g.edge['READY>P7.C1'].main!.job.last.file); assert.equal(back.job.first.frame, undefined);
  assert.match(back.job.promptText, /on the table at the right side of the image, just in front of the shoe\./);
  const early = graph.draftJob(graph.buildGraph({}), 'P3.C1>READY')!;
  assert.equal(early.job.first.file?.path, 'assets/anchors/pamela-p3-c1-plan-land-01/anchor.png'); assert.match(early.notes.join(' '), /Ingen giv med landningsankare/);
  // A retake of an existing edge reuses its recorded inputs and is a valid job as it stands.
  const retake = graph.draftJob(g, 'P4.C1>READY')!;
  assert.equal(retake.job.id, 'pamela-p4-c1-plan-return-ready-02'); assert.deepEqual(retake.job.first.file, g.takes['pamela-p4-c1-plan-deal-02'].job.last.file);
  assert.equal(retake.job.promptText, g.edge['P4.C1>READY'].main!.job.promptText);
  assert.doesNotThrow(() => validateJob(retake.job));
  // The hole card is dealt closed unless the round says otherwise; hub clips have their own templates.
  assert.match(graph.draftJob(g, 'READY>D.C2')!.job.promptText, /never turned/);
  assert.match(graph.draftJob(g, 'READY>D.C2', {holeCardDown: false})!.job.promptText, /four-second deal to her own dealer position/);
  assert.deepEqual(['IDLE>READY', 'READY>IDLE', 'IDLE>IDLE'].map(id => { const d = graph.draftJob(g, id)!.job; return [d.id, d.kind, d.target, d.duration]; }),
    [['pamela-idle-ready-entry-01', 'ENTRY', null, 3], ['pamela-ready-idle-exit-01', 'RETURN', null, 3], ['pamela-idle-loop-01', 'IDLE', null, 4]]);
  assert.equal(graph.draftJob(graph.buildGraph({}), 'READY>P4.C1')!.basedOn, null);
  assert.equal(graph.draftJob(g, 'P1.C1>P2.C1'), null);
  for (const e of g.edges) assert.ok(graph.draftJob(g, e.id)!.job.promptText.length <= 2000, e.id);
});

test('the tree is laid out like the table: P1 far left, P7 far right, the dealer above', () => {
  const plan = defaultPlan(), points = Object.fromEntries(PLAN_TARGETS.map(id => [id, toPixels(plan.targets[id].geometry.native, 'native')]));
  for (const layout of [graph.tableLayout(points), graph.tableLayout(null), graph.tableLayout({'P1.C1': {x: NaN, y: 0}})]) {
    const xs = graph.SEATS.map(s => layout[`${s}.C1`].x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs);
    for (const s of graph.SEATS) { assert.ok(layout['D.C1'].y < layout[`${s}.C1`].y - graph.TREE.nodeHeight); assert.ok(Math.abs(layout[`${s}.C2`].x - layout[`${s}.C1`].x - 56) < 1e-9); }
    const all = [...PLAN_TARGETS, 'D.C3'].map(id => layout[id]);
    for (const p of all) assert.ok(p.x >= 40 + graph.TREE.nodeWidth / 2 && p.x <= graph.TREE.readyTrunk - graph.TREE.nodeWidth / 2 && p.y + graph.TREE.nodeHeight / 2 < graph.TREE.idleBus);
    for (const a of all) for (const b of all) if (a !== b && Math.abs(a.y - b.y) < graph.TREE.nodeHeight) assert.ok(Math.abs(a.x - b.x) >= graph.TREE.nodeWidth + 4);
    assert.ok(layout['P4.C1'].y > layout['P1.C1'].y && layout['P4.C1'].y > layout['P7.C1'].y);
  }
  // Seats that sit almost on top of each other in a plan are still drawn apart.
  const crowded = {...points}; for (const c of ['C1', 'C2']) crowded[`P2.${c}`] = {x: points[`P1.${c}`].x + 3, y: points[`P1.${c}`].y};
  const tight = graph.tableLayout(crowded);
  assert.ok(tight['P2.C1'].x - tight['P1.C2'].x >= graph.TREE.nodeWidth + 4);
});

test('every tracked job is shown: known nodes map to model edges, unknown nodes land in the experiment group', async () => {
  const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')), motions: Record<string, MotionRecord> = {};
  for (const name of await readdir('motions')) if (name.endsWith('.json')) motions[name.slice(0, -5)] = JSON.parse(await readFile(`motions/${name}`, 'utf8'));
  // The graph is Pamela's: another dealer's jobs in the same file are hers to show.
  file.jobs = file.jobs.filter((j: BankJob) => (j.dealer ?? graph.DEALER) === graph.DEALER);
  const g = graph.buildGraph({jobs: file.jobs, budget: file.budget, motions});
  assert.deepEqual(g.unplaced, []);
  assert.equal(Object.keys(g.takes).length, file.jobs.length);
  assert.equal(g.summary.total, 54); assert.equal(g.edges.length, 57);
  for (const job of file.jobs as BankJob[]) {
    const take = g.takes[job.id], ref = graph.parseEdge(`${job.from}>${job.to}`), edge = g.edge[take.edge];
    assert.ok(edge.takes.includes(take), job.id);
    // Known from/to: a take of that model edge. Anything else: a take of an experiment named as the job wrote it.
    if (ref) { assert.equal(take.edge, ref.base, job.id); assert.equal(edge.experiment, false, job.id); assert.equal(take.kind, job.kind, job.id); assert.equal(take.hub, ref.hub, job.id); }
    else { assert.equal(take.edge, `${graph.nodeName(job.from)}>${graph.nodeName(job.to)}`, job.id); assert.ok(g.experiments.includes(edge), job.id); }
    // A return that starts on a frame of another film was cut out of a deal. Any other film may start on a frame of any film (a deal from a READY-B plate, an idle clip from the entry).
    if (take.kind === 'RETURN' && take.startsOn?.clip && g.takes[take.startsOn.clip]) assert.equal(g.takes[take.startsOn.clip].kind, 'DEAL', job.id);
  }
  assert.equal(g.experiments.reduce((sum, e) => sum + e.takes.length, 0) + g.edges.reduce((sum, e) => sum + e.takes.length, 0), file.jobs.length);
  // The round player must always get a usable plan from the real bank.
  for (const segment of graph.resolveRound(g, graph.roundSequence({seats: graph.SEATS, thirdDealerCard: true}))) assert.ok(segment.take || segment.gap, segment.id);
});

test('a corrected copy is a further take of its source\'s edge, and a slow-motion clip carries its viewing speed', async () => {
  const data = bank(), source = 'pamela-p1-c1-plan-deal-02';
  data.edits = [{id: `${source}-edit-01`, source: {clip: source, sha256: sha}, model: 'aleph2', promptText: 'Keep this video identical. One correction only.', purpose: 'grip'},
    {id: 'orphan-edit-01', source: {clip: 'no-such-clip'}}, null as never];
  data.jobs!.push(job('pamela-p1-c1-plan-deal-slow-01', 'READY', 'LAND(P1.C1)', {duration: 8, playbackSpeed: 2}), job('pamela-p1-c1-plan-deal-odd-01', 'READY', 'LAND(P1.C1)', {playbackSpeed: 40}));
  data.media = {...data.media, [`${source}-edit-01`]: {video: video(`${source}-edit-01`), reversed: `assets/motions/${source}-edit-01/source-reversed.mp4`}};
  const g = graph.buildGraph(data), copy = g.takes[`${source}-edit-01`], original = g.takes[source];
  // Same edge, same kind and images as the source; its own id, model, prompt, film and review.
  assert.equal(copy.edge, original.edge); assert.equal(copy.edge, 'READY>P1.C1'); assert.equal(copy.editOf, source); assert.equal(original.editOf, null);
  assert.deepEqual([copy.job.model, copy.job.promptText, copy.job.purpose, copy.job.duration], ['aleph2', 'Keep this video identical. One correction only.', 'grip', original.job.duration]);
  assert.deepEqual(copy.job.first, original.job.first); assert.equal(copy.stage, 'DONE'); assert.equal(copy.media.reversed, `assets/motions/${source}-edit-01/source-reversed.mp4`);
  assert.ok(g.edge['READY>P1.C1'].takes.includes(copy)); assert.ok(copy.order > original.order);
  // The returns cut from the source follow the copy at the same frame, since the copy keeps the source's timing and landing.
  const back = Object.values(g.takes).find(r => r.startsOn?.clip === source)!;
  assert.ok(Number.isInteger(original.landingFrame)); assert.equal(copy.landingFrame, original.landingFrame); assert.equal(back.startsOn!.frame, copy.landingFrame);
  assert.equal(graph.returnFits(back, copy), true); assert.equal(graph.returnFits(back, original), true); assert.equal(graph.returnFits(back, g.takes['pamela-p1-c1-plan-deal-01']), false);
  // Unreviewed, it is shown among the current takes even when its source stays the main take; once rejected it is folded away like any other.
  const e = g.edge['READY>P1.C1']; if (e.main !== copy) { assert.equal(graph.takeRole(e, copy), 'OTHER'); assert.equal(graph.isCurrent(e, copy), true); }
  data.motions = {...data.motions, [copy.id]: done('REJECTED')}; const after = graph.buildGraph(data); assert.equal(graph.isCurrent(after.edge['READY>P1.C1'], after.takes[copy.id]), false);
  // A copy whose source is unknown is named, not shown, and breaks nothing; the 54 edges are still 54.
  assert.deepEqual(g.unplaced.filter(u => /källklipp/.test(u.reason)).map(u => u.id), ['orphan-edit-01', 'undefined']); assert.equal(g.edges.length, 57);
  // The viewing speed is the job's own, within reason; everything else plays at 1.
  assert.deepEqual([g.takes['pamela-p1-c1-plan-deal-slow-01'].speed, g.takes['pamela-p1-c1-plan-deal-odd-01'].speed, original.speed, copy.speed], [2, 1, 1, 1]);
  // The real job file: every edit lands on the edge of the clip it corrects.
  const real = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')), live = graph.buildGraph({jobs: real.jobs, derived: real.derived, edits: real.edits});
  for (const edit of real.edits ?? []) { assert.equal(live.takes[edit.id].edge, live.takes[edit.source.clip].edge, edit.id); assert.equal(live.takes[edit.id].editOf, edit.source.clip); }
  for (const j of real.jobs) if (j.playbackSpeed) assert.equal(live.takes[j.id].speed, j.playbackSpeed, j.id);
});

// ── One film per seat ───────────────────────────────────────────────────────
// A small bank built here, so the counts do not move with the real job file.
function seatBank(): BankData {
  const jobs = [job('entry-01', 'IDLE', 'READY', {kind: 'ENTRY', target: null}), job('p4-deal-01', 'READY', 'LAND(P4.C1)'), job('p4-back-ready-01', 'LAND(P4.C1)', 'READY', from('p4-deal-01', 100)),
    job('p4-back-idle-01', 'LAND(P4.C1)', 'IDLE', from('p4-deal-01', 100)), job('p1-deal-01', 'READY', 'LAND(P1.C1)'), job('p4-second-01', 'READY', 'LAND(P4.C2)'), job('hole-deal-01', 'READY', 'LAND(D.C2)')];
  const decisions: Record<string, string> = {'p4-back-ready-01': 'ACCEPTED', 'p4-back-idle-01': 'SECONDARY', 'p1-deal-01': 'REJECTED'};
  return {jobs, motions: Object.fromEntries(jobs.map(j => [j.id, done(decisions[j.id] ?? 'PENDING', j.id === 'hole-deal-01' ? {motion: {physicalEndSide: 'BACK'}} : {})])), media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id)}]))};
}

test('one film per seat is the default: a second card shares the first card\'s films when it ends on the same side, and only needed films are counted', () => {
  // The rule is the side, not the name.
  assert.deepEqual(['P4.C1', 'P4.C2', 'D.C1', 'D.C2', 'D.C3'].map(t => graph.filmCard(t)), ['P4.C1', 'P4.C1', 'D.C1', 'D.C2', 'D.C3']);
  assert.equal(graph.filmCard('D.C2', false), 'D.C1', 'an open hole card ends on the same side as the first dealer card');
  const g = graph.buildGraph(seatBank()), f = g.summary.films;
  assert.equal(graph.FILM_MODE, 'SEAT'); assert.equal(g.mode, 'SEAT');
  // 3 hub films, the turn of the hole card, her coming and leaving, three per seat, and both dealer cards on their own: 3 + 1 + 2 + 7 × 3 + 3 + 3.
  assert.equal(f.total, 33); assert.equal(f.required.length, 33); assert.ok(!f.required.some(id => /P\d\.C2|D\.C3/.test(id))); assert.ok(f.required.includes('READY>D.C2')); assert.ok(f.required.includes('IDLE>REVEAL(D.C2)'));
  for (const seat of graph.SEATS) for (const [own, first] of [[`READY>${seat}.C2`, `READY>${seat}.C1`], [`${seat}.C2>READY`, `${seat}.C1>READY`], [`${seat}.C2>IDLE`, `${seat}.C1>IDLE`]]) assert.equal(g.edge[own].shares, first);
  for (const id of ['READY>D.C2', 'D.C2>READY', 'D.C2>IDLE', 'READY>D.C3', 'READY>P4.C1', 'IDLE>READY']) assert.equal(g.edge[id].shares, null, id);
  assert.equal(g.edge['READY>D.C3'].optional, true);
  // Candidates: unreviewed or accepted main take. Known flaws: a secondary main take. Missing: nothing playable, a rejected film included.
  assert.deepEqual([f.done, f.candidates, f.flaws, f.missing], [5, 4, 1, 28]);
  // The second card's own film stays a take of its own edge and is not one of the needed films.
  assert.equal(g.edge['READY>P4.C2'].main?.id, 'p4-second-01'); assert.ok(!f.required.includes('READY>P4.C2'));
  // The per-card summary is untouched by the mode, so older callers read what they always read.
  assert.equal(g.summary.total, 54); assert.equal(g.summary.done, 6);
  // One film per card: nothing is shared and all 54 are needed.
  const card = graph.buildGraph(seatBank(), {mode: 'CARD'});
  assert.equal(card.mode, 'CARD'); assert.ok(card.edges.every(e => e.shares === null));
  assert.deepEqual([card.summary.films.total, card.summary.films.done, card.summary.films.candidates, card.summary.films.flaws, card.summary.films.missing], [54, 6, 5, 1, 48]);
  // With the hole card open the dealer's second card shares too, and no film is needed to turn it.
  const open = graph.buildGraph(seatBank(), {holeCardDown: false});
  assert.equal(open.edge['READY>D.C2'].shares, 'READY>D.C1'); assert.equal(open.summary.films.total, 29); assert.ok(!open.summary.films.required.includes('IDLE>REVEAL(D.C2)'));
});

test('in a round a second card plays the seat film with the card shifted; a film of its own is used only when the step names it', () => {
  const g = graph.buildGraph(seatBank()), places = {'P4.C1': {x: 850, y: 1100}, 'P4.C2': {x: 890, y: 1084}, 'D.C1': {x: 800, y: 700}, 'D.C2': {x: 848, y: 700}};
  const steps = graph.parseSequence('READY>P4.C1 | P4.C1>READY | READY>P4.C2 | P4.C2>IDLE').steps, round = graph.resolveRound(g, steps, {places});
  // The first card is unchanged. The second card's steps keep their own name and play the seat's films.
  assert.deepEqual(round.map(s => [s.id, s.edge?.id, s.film?.id, s.take?.id, s.gap]), [['READY>P4.C1', 'READY>P4.C1', 'READY>P4.C1', 'p4-deal-01', null], ['P4.C1>READY', 'P4.C1>READY', 'P4.C1>READY', 'p4-back-ready-01', null],
    ['READY>P4.C2', 'READY>P4.C2', 'READY>P4.C1', 'p4-deal-01', null], ['P4.C2>IDLE', 'P4.C2>IDLE', 'P4.C1>IDLE', 'p4-back-idle-01', null]]);
  assert.deepEqual(round.map(s => s.shift), [null, null, {x: 40, y: -16}, {x: 40, y: -16}]);
  // The seat film is cut for the second card exactly as for the first, and the chain is unbroken.
  assert.deepEqual([round[2].start, round[2].end, round[2].cut], [round[0].start, round[0].end, round[0].cut]); assert.equal(round[2].end, 100);
  assert.ok(round.every(s => s.notes.length === 0), JSON.stringify(round.map(s => s.notes)));
  // Naming the second card's own film plays that film where it lies: no shift.
  const own = graph.resolveRound(g, [{from: 'READY', to: 'P4.C2', take: 'p4-second-01'}], {places})[0];
  assert.deepEqual([own.film?.id, own.take?.id, own.shift, own.video], ['READY>P4.C2', 'p4-second-01', null, video('p4-second-01')]);
  // Naming a take of the seat film keeps the shift.
  const pinned = graph.resolveRound(g, [{from: 'READY', to: 'P4.C2', take: 'p4-deal-01'}], {places})[0];
  assert.deepEqual([pinned.film?.id, pinned.take?.id, pinned.shift], ['READY>P4.C1', 'p4-deal-01', {x: 40, y: -16}]);
  // Without the plan the film is still chosen; the missing shift is said, not guessed.
  const blind = graph.resolveRound(g, [{from: 'READY', to: 'P4.C2'}])[0];
  assert.equal(blind.take?.id, 'p4-deal-01'); assert.equal(blind.shift, null); assert.match(blind.notes.join(' '), /flytt är okänd utan placeringsplan/);
  // The dealer's hole card is not shared: it plays its own film, unshifted, and a seat without a film is a gap for both its cards.
  const dealer = graph.resolveRound(g, graph.parseSequence('READY>D.C2 | READY>P1.C2 | READY>P2.C2').steps, {places});
  assert.deepEqual(dealer.map(s => [s.film?.id, s.take?.id ?? null, s.shift, s.gap]), [['READY>D.C2', 'hole-deal-01', null, null], ['READY>P1.C1', null, null, 'REJECTED'], ['READY>P2.C1', null, null, 'MISSING']]);
  // One film per card: the same step plays the card's own film or is a gap, never the seat's.
  const card = graph.buildGraph(seatBank(), {mode: 'CARD'}), each = graph.resolveRound(card, graph.parseSequence('READY>P4.C2 | P4.C2>IDLE').steps, {places});
  assert.deepEqual(each.map(s => [s.film?.id, s.take?.id ?? null, s.shift, s.gap]), [['READY>P4.C2', 'p4-second-01', null, null], ['P4.C2>IDLE', null, null, 'MISSING']]);
});

test('an idle loop that starts on frame 0 of the entry clip, and a deal that ends on a frame of an earlier deal, cut and reorder nothing', () => {
  const entry = 'pamela-idle-ready-entry-01', frame0 = {frame: {video: video(entry), videoSha256: sha, index: 0}}, base = seatBank(), plain = graph.buildGraph(base);
  const data = seatBank();
  data.derived = [{id: entry, kind: 'ENTRY', from: 'IDLE', to: 'READY', clip: entry, frames: [12, 96]}];
  data.jobs!.push(job('pamela-idle-loop-01', 'IDLE', 'IDLE', {kind: 'IDLE', target: null, first: frame0, last: frame0}),
    job('p4-deal-02', 'READY', 'LAND(P4.C1)', {last: {frame: {video: video('p4-deal-01'), videoSha256: sha, index: 100}}}));
  data.motions = {...data.motions, [entry]: done(), 'pamela-idle-loop-01': done(), 'p4-deal-02': done('SECONDARY')}; data.media = {...data.media, [entry]: {video: video(entry)}, 'pamela-idle-loop-01': {video: video('pamela-idle-loop-01')}};
  const g = graph.buildGraph(data);
  assert.deepEqual(g.unplaced, []); assert.equal(g.takes['pamela-idle-loop-01'].edge, 'IDLE>IDLE'); assert.equal(g.edge['IDLE>IDLE'].main?.id, 'pamela-idle-loop-01');
  // The entry clip is a derived take of its own film: one id, its own frames.
  assert.deepEqual(g.takes[entry].segment, {clip: entry, start: 12, end: 96}); assert.equal(g.takes[entry].startsOn, null);
  // Nothing about the first card's films moves: same main takes, same landing frame.
  for (const id of ['READY>P4.C1', 'P4.C1>READY', 'P4.C1>IDLE']) assert.equal(g.edge[id].main?.id, plain.edge[id].main?.id, id);
  assert.equal(g.takes['p4-deal-01'].landingFrame, plain.takes['p4-deal-01'].landingFrame); assert.equal(g.takes['p4-deal-02'].landingFrame, null);
  // In a round the loop and the entry play their own frames to the end; frame 0 is never a cut.
  const round = graph.resolveRound(g, graph.parseSequence('IDLE>IDLE | IDLE>READY@' + entry + ' | READY>P4.C1 | P4.C1>IDLE | IDLE>IDLE').steps);
  assert.deepEqual(round.map(s => [s.take?.id, s.start, s.end, s.cut]), [['pamela-idle-loop-01', 0, null, null], [entry, 12, 97, null], ['p4-deal-01', 0, 100, 'FRAME'], ['p4-back-idle-01', 0, null, null], ['pamela-idle-loop-01', 0, null, null]]);
  assert.ok(round.every(s => s.notes.length === 0), JSON.stringify(round.map(s => s.notes)));
});

test('the turn of the hole card is an edge of the model: from rest, back to rest, and the round goes on from IDLE', () => {
  const ref = graph.parseEdge('vila > reveal(dc2)')!;
  assert.deepEqual([ref.id, ref.kind, ref.target, ref.base, ref.hub], ['IDLE>REVEAL(D.C2)', 'REVEAL', 'D.C2', graph.REVEAL_EDGE, null]);
  // Only the hole card is turned on the table, and only from rest. The pose after it is rest.
  assert.equal(graph.parseNode('REVEAL(P4.C1)'), null); assert.equal(graph.parseEdge('READY>REVEAL(D.C2)'), null); assert.equal(graph.parseEdge('D.C2>REVEAL(D.C2)'), null);
  assert.equal(graph.hubOf(graph.REVEAL_NODE), 'IDLE'); assert.equal(graph.parseEdge('REVEAL(D.C2)>READY')?.base, 'IDLE>READY');
  assert.match(graph.describeEdge(ref), /vänds upp/); assert.match(graph.describeNode(graph.REVEAL_NODE), /hålkortet/);
  // Without a film the edge is there and missing, not unknown; it never shares another card's film.
  const empty = graph.buildGraph({}), bare = empty.edge[graph.REVEAL_EDGE];
  assert.deepEqual([bare.status, bare.experiment, bare.optional, bare.shares, bare.kind, bare.target], ['MISSING', false, false, null, 'REVEAL', 'D.C2']);
  assert.equal(graph.resolveRound(empty, [{from: 'IDLE', to: graph.REVEAL_NODE}])[0].gap, 'MISSING');
  assert.equal(graph.buildGraph({}, {holeCardDown: false}).edge[graph.REVEAL_EDGE].shares, null);
  // A take cut out of an older film and a generated one land on the same edge, never among the experiments.
  const data: BankData = {jobs: [{...job('turn-01', 'IDLE', 'REVEAL(D.C2)'), kind: 'REVEAL', target: 'D.C2', duration: 4}, job('entry-01', 'IDLE', 'READY', {kind: 'ENTRY', target: null})],
    derived: [{id: 'turn-cut-01', kind: 'REVEAL', from: 'IDLE', to: 'REVEAL(D.C2)', clip: 'old-turn', frames: [0, 119]}],
    motions: {'turn-01': done('REJECTED'), 'entry-01': done()}, media: {'turn-cut-01': {video: video('old-turn')}, 'turn-01': {video: video('turn-01')}, 'entry-01': {video: video('entry-01')}}};
  let g = graph.buildGraph(data);
  assert.deepEqual(g.experiments, []); assert.deepEqual(g.unplaced, []);
  assert.deepEqual(g.edge[graph.REVEAL_EDGE].takes.map(t => [t.id, t.kind, t.endSide]), [['turn-01', 'REVEAL', 'FRONT'], ['turn-cut-01', 'REVEAL', null]]);
  // Like an idle clip it is played without its first three and last three frames, whether the film's length is known or only the cut's.
  const steps = [{from: 'IDLE', to: 'REVEAL(D.C2)'}, {from: 'IDLE', to: 'READY'}];
  let [turn, entry] = graph.resolveRound(g, steps);
  assert.deepEqual([turn.kind, turn.take?.id, turn.video, turn.start, turn.end, turn.side, turn.gap, turn.edge?.target], ['REVEAL', 'turn-cut-01', video('old-turn'), 3, 117, 'FRONT', null, 'D.C2']);
  // The step after it leaves from IDLE: that is where the turn ends, so the chain is not broken.
  assert.equal(entry.take?.id, 'entry-01'); assert.deepEqual(entry.notes, []);
  data.motions!['turn-01'] = done('ACCEPTED'); g = graph.buildGraph(data); [turn] = graph.resolveRound(g, steps);
  assert.deepEqual([turn.take?.id, turn.start, turn.end, turn.notes], ['turn-01', 3, 117, []]);
  assert.equal(g.edge[graph.REVEAL_EDGE].status, 'ACCEPTED'); assert.ok(g.summary.films.required.includes(graph.REVEAL_EDGE));
  // A round may ask for it: after the last return to rest, before a third dealer card.
  assert.deepEqual(graph.roundSequence({seats: ['P4'], reveal: true, thirdDealerCard: true}).map(e => e.id).slice(-5), ['D.C2>IDLE', 'IDLE>REVEAL(D.C2)', 'IDLE>READY', 'READY>D.C3', 'D.C3>IDLE']);
  assert.ok(!graph.roundSequence({seats: ['P4']}).some(e => e.kind === 'REVEAL')); assert.ok(!graph.roundSequence({seats: ['P4'], cards: 1, reveal: true}).some(e => e.kind === 'REVEAL'));
  assert.deepEqual(graph.parseSequence('D.C2>IDLE | IDLE>REVEAL(D.C2) | IDLE>READY').errors, []);
  // The draft is a job the order tool accepts once its images are real: four seconds, from rest to rest.
  const draft = graph.draftJob(empty, graph.REVEAL_EDGE)!;
  assert.deepEqual([draft.job.id, draft.job.kind, draft.job.target, draft.job.from, draft.job.to, draft.job.duration], ['pamela-d-c2-reveal-01', 'REVEAL', 'D.C2', 'IDLE', 'REVEAL(D.C2)', 4]);
  assert.match(draft.job.promptText, /turns it over once/); assert.ok(draft.job.promptText.length <= 2000);
  assert.equal(validateJob({...draft.job, first: ready, last: ready}).kind, 'REVEAL');
});

test('she comes to the table and leaves it: two edges with rest as their fixed end, and AWAY as the picture without her', () => {
  const arrive = graph.parseEdge('borta > vila')!, leave = graph.parseEdge('IDLE>AWAY')!;
  assert.deepEqual([arrive.id, arrive.kind, arrive.target, arrive.base, arrive.hub], ['AWAY>IDLE', 'ARRIVE', null, graph.ARRIVE_EDGE, null]);
  assert.deepEqual([leave.id, leave.kind, leave.target, leave.base], ['IDLE>AWAY', 'LEAVE', null, graph.LEAVE_EDGE]);
  // Away is left for rest only and reached from rest only; rest with the hole card open counts as rest.
  for (const id of ['AWAY>READY', 'READY>AWAY', 'P4.C1>AWAY', 'AWAY>P4.C1', 'AWAY>AWAY', 'AWAY>REVEAL(D.C2)']) assert.equal(graph.parseEdge(id), null, id);
  assert.equal(graph.parseEdge('REVEAL(D.C2)>AWAY')?.base, graph.LEAVE_EDGE); assert.equal(graph.hubOf(graph.AWAY), null);
  assert.match(graph.describeEdge(arrive), /sätter sig/); assert.match(graph.describeEdge(leave), /reser sig/); assert.match(graph.describeNode(graph.AWAY), /utan dealer/);
  const empty = graph.buildGraph({});
  for (const id of [graph.ARRIVE_EDGE, graph.LEAVE_EDGE]) { const e = empty.edge[id]; assert.deepEqual([e.status, e.experiment, e.optional, e.shares, e.target], ['MISSING', false, false, null, null], id); assert.ok(empty.summary.films.required.includes(id)); }
  assert.equal(graph.resolveRound(empty, [{from: 'AWAY', to: 'IDLE'}])[0].gap, 'MISSING');
  // A leave film is ordered from its first image alone; an arrival has both. Both are played without their first three and last three frames.
  const {last: _none, ...leaveJob} = {...job('leave-01', 'IDLE', 'AWAY'), kind: 'LEAVE', target: null, duration: 5};
  const data: BankData = {jobs: [leaveJob, {...job('arrive-01', 'AWAY', 'IDLE'), kind: 'ARRIVE', target: null, duration: 5}, job('entry-01', 'IDLE', 'READY', {kind: 'ENTRY', target: null})],
    motions: {'leave-01': {...done(), source: {fps: 30, frames: 150, sha256: sha}}, 'arrive-01': {...done(), source: {fps: 30, frames: 150, sha256: sha}}, 'entry-01': done()},
    media: {'leave-01': {video: video('leave-01')}, 'arrive-01': {video: video('arrive-01')}, 'entry-01': {video: video('entry-01')}}};
  const g = graph.buildGraph(data), [a, b, c] = graph.resolveRound(g, [{from: 'AWAY', to: 'IDLE'}, {from: 'IDLE', to: 'READY'}, {from: 'IDLE', to: 'AWAY'}]);
  assert.deepEqual(g.experiments, []); assert.deepEqual(g.unplaced, []);
  assert.deepEqual([a.kind, a.take?.id, a.start, a.end, a.side, a.gap], ['ARRIVE', 'arrive-01', 3, 147, null, null]);
  assert.equal(b.take?.id, 'entry-01'); assert.deepEqual(b.notes, []);
  assert.deepEqual([c.kind, c.take?.id, c.start, c.end], ['LEAVE', 'leave-01', 3, 147]);
  // The drafts: leaving has no last image, arriving ends on the frame the idle clips start on.
  const out = graph.draftJob(empty, graph.LEAVE_EDGE)!, back = graph.draftJob(empty, graph.ARRIVE_EDGE)!;
  assert.deepEqual([out.job.id, out.job.kind, out.job.target, out.job.from, out.job.to, out.job.duration, 'last' in out.job], ['pamela-table-leave-01', 'LEAVE', null, 'IDLE', 'AWAY', 5, false]);
  assert.deepEqual([back.job.id, back.job.kind, back.job.from, back.job.to, back.job.duration, !!back.job.last], ['pamela-table-arrive-01', 'ARRIVE', 'AWAY', 'IDLE', 5, true]);
  assert.match(out.job.promptText, /stands up/); assert.match(back.job.promptText, /sits down/);
  assert.equal(validateJob({...out.job, first: ready}).kind, 'LEAVE'); assert.equal(validateJob({...back.job, first: ready, last: ready}).kind, 'ARRIVE');
});

test('the real job file in seat mode: 33 needed films, every entry placed, and each shared second card follows its seat', async () => {
  const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')), motions: Record<string, MotionRecord> = {};
  for (const name of await readdir('motions')) if (name.endsWith('.json')) motions[name.slice(0, -5)] = JSON.parse(await readFile(`motions/${name}`, 'utf8'));
  const g = graph.buildGraph({jobs: file.jobs, derived: file.derived, edits: file.edits, budget: file.budget, motions}), f = g.summary.films;
  // Every entry is placed in its dealer's graph; this one is Pamela's.
  const owner = graph.dealersOf(file), hers = (list?: {id: string}[]) => (list ?? []).filter(x => owner[x.id] === graph.DEALER).length;
  assert.deepEqual(g.unplaced, []); assert.equal(Object.keys(g.takes).length, hers(file.jobs) + hers(file.derived) + hers(file.edits));
  for (const dealer of new Set(Object.values(owner))) assert.deepEqual(graph.buildGraph({jobs: file.jobs, derived: file.derived, edits: file.edits, motions}, {dealer}).unplaced, [], dealer);
  // The numbers move as films arrive; what holds is how they add up.
  assert.equal(f.mode, 'SEAT'); assert.equal(f.total, 33); assert.equal(f.done + f.missing, f.total); assert.equal(f.candidates + f.flaws, f.done); assert.equal(g.summary.total, 54);
  // The archive's turn of the hole card is a take of the model's edge, not an experiment.
  assert.equal(g.takes['pamela-d-c2-arkiv-reveal-01'].edge, 'IDLE>REVEAL(D.C2)'); assert.ok(!g.experiments.some(e => /REVEAL/.test(e.id)));
  const shared = g.edges.filter(e => e.shares);
  assert.equal(shared.length, 21);
  for (const e of shared) { const seat = g.edge[e.shares!]; assert.equal(seat.target, e.target!.replace('C2', 'C1')); assert.equal(seat.kind, e.kind); assert.equal(seat.shares, null); assert.ok(!f.required.includes(e.id)); }
  // A full round resolves every shared step to its seat's film, or to the same gap as the seat.
  for (const s of graph.resolveRound(g, graph.roundSequence({seats: graph.SEATS}))) {
    assert.ok(s.take || s.gap, s.id);
    if (s.edge?.shares) { assert.equal(s.film?.id, s.edge.shares, s.id); if (s.take) assert.ok(s.film!.takes.includes(s.take), s.id); } else assert.equal(s.film, s.edge, s.id);
  }
});

test('films recovered from a longer film chain like any others: a derived return follows the derived deal whose range ends where it begins', () => {
  const old = 'pamela-arkiv-table-01', film = video(old), long = {fps: 30, frames: 500, sha256: sha}, take = (id: string, from: string, to: string, kind: string, frames: [number, number]) => ({id, kind, from, to, clip: old, frames});
  for (const named of ['film', 'take'] as const) {
    const deal = 'pamela-d-c1-arkiv-deal-01', back = 'pamela-d-c1-arkiv-return-ready-01', other = 'pamela-d-c2-arkiv-deal-01';
    const data: BankData = {jobs: [], derived: [take(deal, 'READY', 'LAND(D.C1)', 'DEAL', [100, 219]), take(back, 'LAND(D.C1)', 'READY', 'RETURN', [220, 300]), take(other, 'READY', 'LAND(D.C2)', 'DEAL', [301, 420])],
      motions: {[deal]: done('PENDING', {source: long}), [other]: done('PENDING', {source: long}), [back]: done('PENDING', {source: long, motion: {startsOn: {clip: named === 'film' ? old : deal, frame: 220}}})}, media: {[deal]: {video: film}, [back]: {video: film}, [other]: {video: film}}};
    const g = graph.buildGraph(data);
    assert.deepEqual(g.unplaced, [], named);
    // The return starts on the frame after the deal's last one: it follows that deal and no other range of the same film.
    assert.deepEqual(g.takes[back].startsOn, {clip: named === 'film' ? old : deal, video: null, frame: 220});
    assert.equal(graph.returnFits(g.takes[back], g.takes[deal]), true, named); assert.equal(graph.returnFits(g.takes[back], g.takes[other]), false, named);
    assert.equal(g.takes[deal].landingFrame, 220); assert.equal(g.takes[other].landingFrame, null);
    assert.equal(g.edge['READY>D.C1'].main?.id, deal); assert.equal(g.edge['D.C1>READY'].main?.id, back);
    // In a round each plays its own frames of the old film, one after the other, without a note about the seam.
    const round = graph.resolveRound(g, graph.parseSequence('READY>D.C1 | D.C1>READY').steps);
    assert.deepEqual(round.map(s => [s.take?.id, s.video, s.start, s.end, s.cut]), [[deal, film, 100, 220, 'FRAME'], [back, film, 220, 301, null]], named);
    assert.ok(round.every(s => s.notes.length === 0), JSON.stringify(round.map(s => s.notes)));
  }
});

// ── Primär ──────────────────────────────────────────────────────────────────
// Seat 4 as seats 5 and 6 of the real bank stood on 2026-11-12: the deal Jakob accepted is continued only by variants, while the return
// he accepted outright was cut from an older deal. A READY-B deal and the hole card stand beside them. marks: 'MAIN' (Primär), 'VARIANT' or a decision.
function primaryBank(marks: Record<string, string> = {}): BankData {
  const jobs = [job('entry-01', 'IDLE', 'READY', {kind: 'ENTRY', target: null}), job('p4-deal-01', 'READY', 'LAND(P4.C1)'), job('p4-deal-02', 'READY', 'LAND(P4.C1)'), job('p4-readyb-deal-01', 'READY-B', 'LAND(P4.C1)'),
    job('p4-back-ready-01', 'LAND(P4.C1)', 'READY', from('p4-deal-01', 96)), job('p4-back-ready-02', 'LAND(P4.C1)', 'READY', from('p4-deal-02', 104)), job('p4-back-idle-01', 'LAND(P4.C1)', 'IDLE', from('p4-deal-02', 104)),
    job('hole-open-01', 'READY', 'LAND(D.C2)'), job('hole-closed-01', 'READY', 'LAND(D.C2)'), job('hole-back-idle-01', 'LAND(D.C2)', 'IDLE', from('hole-open-01', 90))];
  const marked: Record<string, string> = {'p4-deal-02': 'ACCEPTED', 'p4-readyb-deal-01': 'ACCEPTED', 'p4-back-ready-01': 'ACCEPTED', 'p4-back-ready-02': 'VARIANT', 'p4-back-idle-01': 'VARIANT', 'hole-closed-01': 'ACCEPTED', ...marks};
  const review = (mark = 'PENDING') => mark === 'MAIN' || mark === 'VARIANT' ? {decision: 'ACCEPTED', acceptedAs: mark} : {decision: mark};
  return {jobs, motions: Object.fromEntries(jobs.map(j => [j.id, done('PENDING', {review: review(marked[j.id]), motion: {physicalEndSide: j.id === 'hole-closed-01' ? 'BACK' : 'FRONT'}})])),
    media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id)}]))};
}
const played = (round: graph.Segment[]) => round.map(s => [s.id, s.take?.id ?? null, s.why, s.end, s.cut]);

test('a Primär return plays right after a deal, and the deal before it is the one it was cut from, cut on its frame', () => {
  const steps = graph.parseSequence('READY>P4.C1 | P4.C1>READY').steps;
  // Without Primär the accepted deal plays, and after it the variant return that continues it: the rule before Primär.
  assert.deepEqual(played(graph.resolveRound(graph.buildGraph(primaryBank()), steps)), [['READY>P4.C1', 'p4-deal-02', 'MAIN', 104, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-02', 'MAIN', null, null]]);
  // With the outright accepted return as Primär it plays, and the deal is the one it continues, cut where the return begins. No seam.
  const g = graph.buildGraph(primaryBank({'p4-back-ready-01': 'MAIN'})), round = graph.resolveRound(g, steps);
  assert.equal(g.edge['READY>P4.C1'].main?.id, 'p4-deal-02', 'the accepted deal stays the main deal: rank comes first');
  assert.deepEqual(played(round), [['READY>P4.C1', 'p4-deal-01', 'FITS_PRIMARY_RETURN', 96, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-01', 'PRIMARY', null, null]]);
  assert.deepEqual(round.flatMap(s => s.notes), []);
  // The other return keeps its own chain: a Primär to READY does not move the deal before a return to IDLE.
  assert.deepEqual(played(graph.resolveRound(g, graph.parseSequence('READY>P4.C1 | P4.C1>IDLE').steps)), [['READY>P4.C1', 'p4-deal-02', 'MAIN', 104, 'FRAME'], ['P4.C1>IDLE', 'p4-back-idle-01', 'MAIN', null, null]]);
});

test('two Primär takes that do not fit both play: the deal to its own landing frame, and the seam is named', () => {
  const g = graph.buildGraph(primaryBank({'p4-deal-02': 'MAIN', 'p4-back-ready-01': 'MAIN'})), round = graph.resolveRound(g, graph.parseSequence('READY>P4.C1 | P4.C1>READY').steps);
  assert.deepEqual(played(round), [['READY>P4.C1', 'p4-deal-02', 'PRIMARY', 104, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-01', 'PRIMARY', null, null]]);
  assert.deepEqual(round[0].notes, []); assert.deepEqual(round[1].notes, ['Skarv: returen startar på p4-deal-01, inte på föregående giv p4-deal-02.']);
});

// Paow's seat 1 as it stood 2026-11-13: the Primär deal lays the card with the left hand, the Primär return was cut from a deal whose
// right hand laid it (a hand switch), and the deal's own return is accepted. Jakob: the return must be the arm that is out.
function handBank(back: string = 'VARIANT', hands: Record<string, string> = {'p4-deal-01': 'RH', 'p4-deal-02': 'LH'}): BankData {
  const data = primaryBank({'p4-deal-02': 'MAIN', 'p4-back-ready-01': 'MAIN', 'p4-back-ready-02': back});
  for (const [id, hand] of Object.entries(hands)) data.motions![id] = {...data.motions![id], motion: {...data.motions![id].motion, takeHand: 'LH', releaseHand: hand}};
  return data;
}
test('after a deal the return comes back with the hand that laid the card: a Primär return of the other hand gives way to the deal\'s own', () => {
  const steps = graph.parseSequence('READY>P4.C1 | P4.C1>READY').steps, g = graph.buildGraph(handBank());
  // A return without a hand of its own has the hand of the deal it was cut from.
  assert.deepEqual(['p4-deal-01', 'p4-deal-02', 'p4-back-ready-01', 'p4-back-ready-02', 'entry-01'].map(id => g.takes[id].releaseHand), ['RH', 'LH', 'RH', 'LH', null]);
  const round = graph.resolveRound(g, steps);
  assert.deepEqual(played(round), [['READY>P4.C1', 'p4-deal-02', 'PRIMARY', 104, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-02', 'FITS_DEAL', null, null]]);
  assert.deepEqual(round[1].notes, ['Primärreturen p4-back-ready-01 kommer tillbaka med höger hand; given p4-deal-02 lade kortet med vänster.']);
  // Without its own return, another return of the left hand plays, a seam said; with none, the Primär of the other hand, the fault said.
  const other = graph.buildGraph(handBank('REJECTED', {'p4-deal-01': 'RH', 'p4-deal-02': 'LH', 'p4-back-idle-01': 'LH'}));
  assert.equal(graph.resolveRound(other, steps)[1].take?.id, 'p4-back-ready-01', 'a return to IDLE is no return to READY');
  const lone = graph.resolveRound(graph.buildGraph(handBank('REJECTED')), steps);
  assert.equal(lone[1].take?.id, 'p4-back-ready-01'); assert.match(lone[1].notes.join(' '), /^Fel hand: returen p4-back-ready-01 kommer tillbaka med höger hand/);
  // The same hand, or a hand that is not known, leaves Primär as it was: it plays and the seam is named.
  for (const hands of [{'p4-deal-01': 'LH', 'p4-deal-02': 'LH'}, {}]) {
    const same = graph.resolveRound(graph.buildGraph(handBank('VARIANT', hands)), steps);
    assert.deepEqual(played(same), [['READY>P4.C1', 'p4-deal-02', 'PRIMARY', 104, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-01', 'PRIMARY', null, null]], JSON.stringify(hands)); assert.match(same[1].notes.join(' '), /^Skarv/);
  }
});

test('a take the round names beats Primär, on the return and on the deal', () => {
  const g = graph.buildGraph(primaryBank({'p4-back-ready-01': 'MAIN'})), round = (text: string) => graph.resolveRound(g, graph.parseSequence(text).steps);
  // A named return: the deal is not chosen for the Primär that does not play.
  assert.deepEqual(played(round('READY>P4.C1 | P4.C1>READY@p4-back-ready-02')), [['READY>P4.C1', 'p4-deal-02', 'MAIN', 104, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-02', 'LOCKED', null, null]]);
  // A named deal: it plays, and so does the Primär return after it, with the seam said.
  const named = round('READY>P4.C1@p4-deal-02 | P4.C1>READY');
  assert.deepEqual(played(named), [['READY>P4.C1', 'p4-deal-02', 'LOCKED', 104, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-01', 'PRIMARY', null, null]]); assert.match(named[1].notes.join(' '), /^Skarv/);
  // A named deal beats a Primär deal too.
  assert.deepEqual(played(graph.resolveRound(graph.buildGraph(primaryBank({'p4-deal-02': 'MAIN'})), [{from: 'READY', to: 'P4.C1', take: 'p4-deal-01'}])), [['READY>P4.C1', 'p4-deal-01', 'LOCKED', 96, 'FRAME']]);
});

test('one film per seat: the second card plays the seat\'s Primär return, after a seat deal it continues', () => {
  const places = {'P4.C1': {x: 850, y: 1100}, 'P4.C2': {x: 890, y: 1084}}, steps = graph.parseSequence('READY>P4.C1 | P4.C1>READY | READY>P4.C2 | P4.C2>READY').steps;
  const view = (round: graph.Segment[]) => round.map(s => [s.id, s.film?.id, s.take?.id, s.why, s.end, s.shift]);
  const before = graph.resolveRound(graph.buildGraph(primaryBank()), steps, {places});
  assert.deepEqual(view(before).slice(2), [['READY>P4.C2', 'READY>P4.C1', 'p4-deal-02', 'SHARED', 104, {x: 40, y: -16}], ['P4.C2>READY', 'P4.C1>READY', 'p4-back-ready-02', 'SHARED', null, {x: 40, y: -16}]]);
  const round = graph.resolveRound(graph.buildGraph(primaryBank({'p4-back-ready-01': 'MAIN'})), steps, {places});
  assert.deepEqual(view(round), [['READY>P4.C1', 'READY>P4.C1', 'p4-deal-01', 'FITS_PRIMARY_RETURN', 96, null], ['P4.C1>READY', 'P4.C1>READY', 'p4-back-ready-01', 'PRIMARY', null, null],
    ['READY>P4.C2', 'READY>P4.C1', 'p4-deal-01', 'FITS_PRIMARY_RETURN', 96, {x: 40, y: -16}], ['P4.C2>READY', 'P4.C1>READY', 'p4-back-ready-01', 'PRIMARY', null, {x: 40, y: -16}]]);
  assert.deepEqual(round.flatMap(s => s.notes), []);
});

test('a READY-B start is unaffected by a Primär return after it, and the closed hole card is never traded for a deal the Primär continues', () => {
  const steps = graph.parseSequence('READY-B>P4.C1 | P4.C1>READY').steps, plain = graph.resolveRound(graph.buildGraph(primaryBank()), steps);
  const marked = graph.resolveRound(graph.buildGraph(primaryBank({'p4-back-ready-01': 'MAIN'})), steps), deal = (s: graph.Segment) => [s.take?.id, s.why, s.start, s.end, s.cut, s.notes];
  // The READY-B deal plays from its own pose either way, although the Primär return continues a plain deal; the return after it is the Primär, with the seam said.
  assert.deepEqual(deal(marked[0]), deal(plain[0])); assert.equal(marked[0].take?.id, 'p4-readyb-deal-01');
  assert.deepEqual([plain[1].take?.id, marked[1].take?.id, marked[1].why], ['p4-back-ready-02', 'p4-back-ready-01', 'PRIMARY']); assert.match(marked[1].notes.join(' '), /^Skarv/);
  // The hole card stays closed: the Primär return was cut from an open deal, so the closed deal plays and the seam is said.
  const hole = graph.buildGraph(primaryBank({'hole-back-idle-01': 'MAIN'})), last = graph.parseSequence('READY>D.C2 | D.C2>IDLE').steps;
  const closed = graph.resolveRound(hole, last);
  assert.deepEqual(played(closed), [['READY>D.C2', 'hole-closed-01', 'MAIN', null, null], ['D.C2>IDLE', 'hole-back-idle-01', 'PRIMARY', null, null]]);
  assert.equal(closed[0].side, 'BACK'); assert.match(closed[1].notes.join(' '), /^Skarv/);
  // Dealt open, the deal the Primär return continues may play.
  const open = graph.resolveRound(hole, last, {holeCardDown: false});
  assert.deepEqual(played(open), [['READY>D.C2', 'hole-open-01', 'FITS_PRIMARY_RETURN', 90, 'FRAME'], ['D.C2>IDLE', 'hole-back-idle-01', 'PRIMARY', null, null]]); assert.deepEqual(open.flatMap(s => s.notes), []);
});

test('the main deal: among equals, the one a Primär return continues; rank and a Primär deal still come first', () => {
  const main = (marks: Record<string, string>) => { const g = graph.buildGraph(primaryBank(marks)); return [g.edge['READY>P4.C1'].main?.id, g.edge['P4.C1>READY'].main?.id]; };
  // Two unreviewed deals that both have a return: the newer is the main deal.
  assert.deepEqual(main({'p4-deal-02': 'PENDING'}), ['p4-deal-02', 'p4-back-ready-02']);
  // A Primär return continues the older one: that one is the main deal now, so the default chain is seamless.
  assert.deepEqual(main({'p4-deal-02': 'PENDING', 'p4-back-ready-01': 'MAIN'}), ['p4-deal-01', 'p4-back-ready-01']);
  assert.deepEqual(main({'p4-back-ready-01': 'MAIN'}), ['p4-deal-02', 'p4-back-ready-01']);
  assert.deepEqual(main({'p4-deal-02': 'PENDING', 'p4-back-ready-01': 'MAIN', 'p4-deal-01': 'SECONDARY'}), ['p4-deal-02', 'p4-back-ready-01']);
  assert.deepEqual(main({'p4-deal-01': 'MAIN', 'p4-back-ready-02': 'MAIN'}), ['p4-deal-01', 'p4-back-ready-02']);
  // A Primär on a return of a READY-B pose or of an experiment does not choose the plain main deal.
  const data = primaryBank({'p4-deal-02': 'PENDING'});
  data.jobs!.push(job('p4-back-readyb-01', 'LAND(P4.C1)', 'READY-B', from('p4-deal-01', 96)), job('p4-back-odd-01', 'LAND(P4.C1)', 'LAND(P5.C1)', from('p4-deal-01', 96)));
  for (const id of ['p4-back-readyb-01', 'p4-back-odd-01']) { data.motions![id] = done('ACCEPTED', {review: {decision: 'ACCEPTED', acceptedAs: 'MAIN'}}); data.media![id] = {video: video(id)}; }
  assert.equal(graph.buildGraph(data).edge['READY>P4.C1'].main?.id, 'p4-deal-02');
});

// The rule before Primär, written out from the lines it replaced: a named take, then the side the round wants, then the return that
// continues the deal just played, then the main take. Rank as it was, without Primär; the newer take wins a tie.
function takesBeforePrimary(g: graph.Graph, steps: graph.Step[]): (string | null)[] {
  const rank = (t: graph.Take) => t.variant ? 0 : t.decision === 'ACCEPTED' ? 4 : t.decision === 'PENDING' ? 3 : t.decision === 'SECONDARY' ? 1 : 2;
  const best = (list: graph.Take[]) => list.filter(graph.playable).sort((a, b) => rank(b) - rank(a) || b.order - a.order)[0] ?? null;
  const out: {to: string; deal: boolean; take: graph.Take | null}[] = [];
  for (const step of steps) {
    const id = graph.formatEdge(step.from, step.to), ref = graph.parseEdge(id), found = g.edge[ref?.base ?? id], e = found && (ref || found.experiment) ? found : null, prev = out.at(-1);
    if (!e) { out.push({to: step.to, deal: false, take: null}); continue; }
    const film = e.shares && !(step.take && e.takes.some(t => t.id === step.take && graph.playable(t))) ? g.edge[e.shares] : e;
    const pool = film.takes.filter(t => t.hub === (ref?.hub ?? null)), main = ref?.hub ? best(pool) : film.main, side = e.kind === 'DEAL' && e.target ? graph.wantedSide(e.target) : null;
    const after = prev?.take && prev.deal && prev.to === step.from ? prev.take : null;
    let take = step.take ? film.takes.find(t => t.id === step.take && graph.playable(t)) ?? null : null;
    if (!take && e.kind === 'DEAL' && main?.endSide && main.endSide !== side) take = best(pool.filter(t => t.endSide === side));
    if (!take && after) take = best(pool.filter(t => graph.returnFits(t, after)));
    out.push({to: step.to, deal: e.kind === 'DEAL', take: take ?? main});
  }
  return out.map(s => s.take?.id ?? null);
}

test('a bank without any Primär resolves as before: the takes of the rule before Primär, cut exactly as when the round names each of them', async () => {
  const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')), motions: Record<string, MotionRecord> = {};
  for (const name of await readdir('motions')) if (name.endsWith('.json')) motions[name.slice(0, -5)] = JSON.parse(await readFile(`motions/${name}`, 'utf8'));
  // The real bank as it is, with any Primär Jakob has set since taken away again.
  for (const motion of Object.values(motions)) if (motion.review?.acceptedAs === 'MAIN') delete motion.review.acceptedAs;
  const real: BankData = {jobs: file.jobs, derived: file.derived, edits: file.edits, motions}, whole = graph.roundSequence({seats: graph.SEATS, reveal: true, thirdDealerCard: true});
  const cases: [string, BankData, graph.Step[]][] = [['bank', bank(), whole], ['seat bank', seatBank(), whole], ['seat bank, both cards', seatBank(), graph.parseSequence('READY>P4.C1 | P4.C1>READY | READY>P4.C2 | P4.C2>IDLE').steps],
    ['primary bank unmarked', primaryBank(), whole], ['primary bank, READY-B and hole card', primaryBank(), graph.parseSequence('READY-B>P4.C1 | P4.C1>READY | READY>P4.C2 | P4.C2>IDLE | READY>D.C2 | D.C2>IDLE').steps], ['real bank', real, whole]];
  const view = (round: graph.Segment[]) => round.map(s => [s.id, s.take?.id ?? null, s.film?.id ?? null, s.shift, s.start, s.end, s.cut, s.gap, s.side, s.notes]);
  for (const [name, data, steps] of cases) {
    const g = graph.buildGraph(data);
    assert.ok(!Object.values(g.takes).some(t => t.explicitMain), `${name} has no Primär`);
    const expected = takesBeforePrimary(g, steps), round = graph.resolveRound(g, steps);
    assert.ok(expected.some(Boolean), name);
    assert.deepEqual(round.map(s => s.take?.id ?? null), expected, name);
    // Named takes go through no choice at all, so their cuts are the cut rule's alone.
    assert.deepEqual(view(round), view(graph.resolveRound(g, steps.map((s, i) => expected[i] ? {from: s.from, to: s.to, take: expected[i]!} : s))), name);
  }
});

test('every segment of a whole round says why its take plays, with a short Swedish word for each reason', async () => {
  assert.deepEqual(graph.WHY_LABEL, {LOCKED: 'låst', PRIMARY: 'primär', MAIN: 'huvudtagning', SHARED: 'platsens film', FITS_DEAL: 'passar given före', FITS_PRIMARY_RETURN: 'passar primär retur', SIDE: 'rätt kortsida krävs', HAND: 'samma hand som given', GAP: 'lucka'});
  const whole = graph.roundSequence({seats: graph.SEATS, reveal: true}), round = graph.resolveRound(graph.buildGraph(primaryBank({'p4-back-ready-01': 'MAIN'})), whole);
  assert.deepEqual(round.filter(s => s.take).map(s => [s.id, s.take!.id, s.why]), [['IDLE>READY', 'entry-01', 'MAIN'], ['READY>P4.C1', 'p4-deal-01', 'FITS_PRIMARY_RETURN'], ['P4.C1>READY', 'p4-back-ready-01', 'PRIMARY'],
    ['READY>P4.C2', 'p4-deal-01', 'FITS_PRIMARY_RETURN'], ['P4.C2>READY', 'p4-back-ready-01', 'PRIMARY'], ['READY>D.C2', 'hole-closed-01', 'MAIN'], ['D.C2>IDLE', 'hole-back-idle-01', 'MAIN']]);
  // The other reasons: the side the round wants, the return that continues the deal before it, a named take.
  const sided = graph.resolveRound(graph.buildGraph(primaryBank({'hole-closed-01': 'PENDING'})), [{from: 'READY', to: 'D.C2'}])[0];
  assert.deepEqual([sided.take?.id, sided.why], ['hole-closed-01', 'SIDE']);
  const fit = graph.resolveRound(graph.buildGraph(primaryBank()), graph.parseSequence('READY>P4.C1@p4-deal-01 | P4.C1>READY').steps);
  assert.deepEqual(played(fit), [['READY>P4.C1', 'p4-deal-01', 'LOCKED', 96, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-01', 'FITS_DEAL', null, null]]);
  const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')), motions: Record<string, MotionRecord> = {};
  for (const name of await readdir('motions')) if (name.endsWith('.json')) motions[name.slice(0, -5)] = JSON.parse(await readFile(`motions/${name}`, 'utf8'));
  for (const segments of [round, graph.resolveRound(graph.buildGraph({jobs: file.jobs, derived: file.derived, edits: file.edits, motions}), graph.roundSequence({seats: graph.SEATS, reveal: true, thirdDealerCard: true}))])
    for (const s of segments) { assert.ok(s.why in graph.WHY_LABEL, s.id); assert.equal(s.why === 'GAP', !s.take, s.id); }
});

// ── Idle ────────────────────────────────────────────────────────────────────
function idleBank(): BankData {
  const frame0 = {frame: {video: video('pamela-idle-ready-entry-01'), videoSha256: sha, index: 0}}, idle = (id: string) => job(id, 'IDLE', 'IDLE', {kind: 'IDLE', target: null, first: frame0, last: frame0});
  const jobs = [idle('pamela-idle-loop-01'), idle('pamela-idle-breath-b-01'), idle('pamela-idle-smile-01'), idle('pamela-idle-coffee-01'), idle('pamela-idle-stretch-01'), idle('pamela-idle-glance-01')];
  return {jobs, media: Object.fromEntries(jobs.map(j => [j.id, {video: video(j.id)}])), motions: {
    'pamela-idle-loop-01': done(), 'pamela-idle-breath-b-01': done('PENDING', {motion: {idle: {calm: true, weight: 10, label: 'andning'}}}), 'pamela-idle-smile-01': done(),
    'pamela-idle-coffee-01': done('PENDING', {motion: {idle: {onRequest: true}}}), 'pamela-idle-stretch-01': done('REJECTED')}}; // the glance film has no record yet
}

test('an idle take carries its weight, calm flag, on-request flag and a word for what it shows, with defaults when the record is silent', () => {
  const g = graph.buildGraph(idleBank()), idle = (id: string) => g.takes[`pamela-idle-${id}-01`].idle;
  assert.deepEqual(idle('loop'), {calm: true, weight: 20, onRequest: false, label: 'lugn vila', cut: true});        // only the plain loop is calm by default, and may be cut
  assert.deepEqual(idle('breath-b'), {calm: true, weight: 10, onRequest: false, label: 'andning', cut: true});      // the record's own words
  assert.deepEqual(idle('smile'), {calm: false, weight: 3, onRequest: false, label: 'leende', cut: false});          // a gesture until its record says otherwise, played out
  assert.deepEqual(idle('coffee'), {calm: false, weight: 3, onRequest: true, label: 'kaffe', cut: false});
  assert.deepEqual(idle('glance'), {calm: false, weight: 3, onRequest: false, label: 'blick åt sidan', cut: false}); assert.equal(g.takes['pamela-idle-glance-01'].stage, 'DONE', 'a film without a record is still a film');
  assert.equal(graph.buildGraph(seatBank()).takes['p4-deal-01'].idle, null);
  // The round's idle step is the calmest film, not the newest: calm before gesture, the highest weight, the older take on a tie.
  assert.equal(g.edge['IDLE>IDLE'].main?.id, 'pamela-idle-loop-01');
  const even = idleBank(); even.motions!['pamela-idle-breath-b-01'] = done('PENDING', {motion: {idle: {calm: true, weight: 20}}});
  assert.equal(graph.buildGraph(even).edge['IDLE>IDLE'].main?.id, 'pamela-idle-loop-01');
  // His acceptance or an explicit main still wins, as on every other edge.
  const chosen = idleBank(); chosen.motions!['pamela-idle-smile-01'] = done('ACCEPTED');
  assert.equal(graph.buildGraph(chosen).edge['IDLE>IDLE'].main?.id, 'pamela-idle-smile-01');
  assert.deepEqual(graph.resolveRound(g, [{from: 'IDLE', to: 'IDLE'}]).map(s => s.take?.id), ['pamela-idle-loop-01']);
});

test('the idle picker: weighted, never the same clip twice in a row, two calm clips and then a gesture that was not just seen, nothing rejected or on request', () => {
  const g = graph.buildGraph(idleBank()), takes = g.edge['IDLE>IDLE'].takes, pick = (played: string[], random: number) => graph.pickIdle(takes, played, random)!.take.id;
  const loop = 'pamela-idle-loop-01', breath = 'pamela-idle-breath-b-01', smile = 'pamela-idle-smile-01', glance = 'pamela-idle-glance-01';
  // At the start only calm clips come, by weight: loop 20 and breath 10 of 30.
  assert.equal(pick([], 0), loop); assert.equal(pick([], 0.66), loop); assert.equal(pick([], 0.67), breath); assert.equal(pick([], 0.999), breath);
  // Never the same clip twice in a row.
  for (const r of [0, 0.5, 0.99]) { assert.equal(pick([loop], r), breath); assert.equal(pick([breath], r), loop); }
  // After two calm clips a gesture comes, by weight among the gestures: smile 3 and glance 3. One calm clip is not enough.
  const calm2 = [loop, breath];
  assert.equal(graph.IDLE_RULE.calmBetweenGestures, 2); assert.equal(pick([loop], 0.99), breath, 'one calm clip is not enough');
  assert.equal(pick(calm2, 0), smile); assert.equal(pick(calm2, 0.49), smile); assert.equal(pick(calm2, 0.5), glance); assert.equal(pick(calm2, 0.99), glance); assert.match(graph.pickIdle(takes, calm2, 0.7)!.why, /^gest · 2 lugna klipp har gått · 50 % chans$/);
  // Right after a gesture two calm clips must pass again, whatever the dice say.
  for (const played of [[...calm2, smile], [...calm2, smile, loop]]) for (const r of [0, 0.5, 0.99]) assert.ok([loop, breath].includes(pick(played, r)), played.join(','));
  // The next gesture is one that was not just seen, whatever the dice say; when every gesture has been seen lately, any of them but the last clip.
  for (const r of [0, 0.5, 0.99]) assert.equal(pick([...calm2, smile, loop, breath], r), glance, 'the other gesture');
  for (const r of [0, 0.5, 0.99]) assert.equal(pick([...calm2, smile, loop, breath, glance, loop, breath], r), smile, 'the one seen longest ago');
  // A take and its variant with an effect are one film: after the one, the other is not the next gesture while another is left.
  const twin = {...takes.find(t => t.id === smile)!, id: 'pamela-idle-smile-01-blixt'}, withTwin = [...takes, twin];
  for (const r of [0, 0.5, 0.99]) assert.equal(graph.pickIdle(withTwin, [...calm2, smile, loop, breath], r)!.take.id, glance, 'not the same film with an effect');
  // The rejected stretch and the coffee on request never come by chance, however long it runs; every clip that may come does come.
  const played: string[] = [], seen = new Set<string>(); let seed = 7;
  for (let i = 0; i < 600; i++) { seed = (seed * 16807) % 2147483647; const next = pick(played, seed / 2147483647); assert.notEqual(next, played.at(-1)); played.push(next); seen.add(next); }
  assert.deepEqual([...seen].sort(), [breath, glance, loop, smile].sort());
  for (let i = 0; i < played.length; i++) if (![loop, breath].includes(played[i])) { const before = played.slice(Math.max(0, i - 2), i); assert.ok(before.length === 2 && before.every(id => [loop, breath].includes(id)), `gesture at ${i} after ${before.join(',')}`); }
  // every third clip is a gesture, and the two gestures take turns
  const shown = played.filter(id => ![loop, breath].includes(id));
  assert.equal(shown.length, 200); assert.ok(shown.every((id, i) => i === 0 || id !== shown[i - 1]), 'never the same gesture twice running while another is left');
  // With a single calm clip it is that clip that repeats; the spacing between gestures is kept.
  const one = takes.filter(t => t.id !== breath);
  assert.equal(graph.pickIdle(one, [loop], 0.5)!.take.id, loop); assert.match(graph.pickIdle(one, [loop], 0.5)!.why, /enda lugna klippet/);
  assert.equal(graph.pickIdle(one, [smile, loop], 0.99)!.take.id, loop); assert.equal(graph.pickIdle(one, [smile, loop, loop], 0.99)!.take.id, glance);
  // Nothing to play: no pick. Only gestures: they play, never the same twice.
  assert.equal(graph.pickIdle([], [], 0.5), null); assert.equal(graph.pickIdle(takes.filter(t => t.id === 'pamela-idle-stretch-01'), [], 0.5), null);
  const only = takes.filter(t => [smile, glance].includes(t.id)); assert.equal(graph.pickIdle(only, [smile], 0.1)!.take.id, glance);
  // What is played of a clip, and how the idle is left to deal.
  assert.deepEqual(graph.idleRange(120), {start: 3, end: 117}); assert.deepEqual(graph.idleRange(4), {start: 3, end: 4});
  assert.equal(graph.idleExit(g.takes[loop]), 'CUT'); assert.equal(graph.idleExit(g.takes[smile]), 'FINISH_FAST'); assert.equal(graph.IDLE_RULE.exitRate, 1, 'played out as filmed: nothing in a round is hurried from the start (Jakob 2026-11-13)');
  // A calm take that says cut: false (a rest where she turns her head) stays calm in the rotation but is played out before a deal.
  assert.equal(g.takes[loop].idle!.cut, true); assert.equal(g.takes[smile].idle!.cut, false);
  assert.equal(graph.idleExit({...g.takes[loop], idle: {...g.takes[loop].idle!, cut: false}}), 'FINISH_FAST');
});

// ── Dealers ─────────────────────────────────────────────────────────────────
// The seat bank above for Pamela, and Paow's takes in the same file: Jakob's word on hers (a Primär, an accepted deal) would win on
// Pamela's edges if the two ever mixed. Her derived take and her corrected copy name no dealer: they are hers by their film.
const paowReady = {file: {path: 'assets/anchors/paow-ready-01/anchor.png', sha256: sha}};
function twoDealers(): BankData {
  const data = bank(), paow = (id: string, from: string, to: string, extra: Partial<BankJob> = {}) => job(id, from, to, {dealer: 'paow', first: paowReady, ...extra});
  const hers = [paow('paow-p4-c1-plan-deal-01', 'READY', 'LAND(P4.C1)'), paow('paow-p4-c1-plan-return-ready-01', 'LAND(P4.C1)', 'READY', from('paow-p4-c1-plan-deal-01', 90)), paow('paow-p1-c1-plan-deal-01', 'READY', 'LAND(P1.C1)')];
  data.jobs!.push(...hers);
  data.derived = [{id: 'paow-p4-c1-plan-deal-01-cut', kind: 'DEAL', from: 'READY', to: 'LAND(P4.C1)', clip: 'paow-p4-c1-plan-deal-01', frames: [0, 80]}];
  data.edits = [{id: 'paow-p1-c1-plan-deal-01-edit-01', source: {clip: 'paow-p1-c1-plan-deal-01', sha256: sha}, model: 'aleph2', promptText: 'A corrected copy.', purpose: 'fixture'}];
  data.motions!['paow-p4-c1-plan-deal-01'] = done('ACCEPTED', {review: {decision: 'ACCEPTED', acceptedAs: 'MAIN'}});
  data.motions!['paow-p4-c1-plan-return-ready-01'] = done('ACCEPTED', {review: {decision: 'ACCEPTED', acceptedAs: 'MAIN'}});
  data.motions!['paow-p1-c1-plan-deal-01'] = done('ACCEPTED');
  for (const id of [...hers.map(j => j.id), 'paow-p1-c1-plan-deal-01-edit-01']) { data.receipts![id] = {status: 'SUCCEEDED', estimatedCredits: 80}; data.media![id] = {video: video(id)}; }
  data.media!['paow-p4-c1-plan-deal-01-cut'] = {video: video('paow-p4-c1-plan-deal-01')};
  return data;
}

test('two dealers share the job file but never a graph; a take without a dealer field is Pamela\'s', () => {
  const data = twoDealers(), owner = graph.dealersOf(data);
  assert.equal(owner['pamela-p4-c1-plan-deal-02'], 'pamela'); assert.equal(owner['paow-p4-c1-plan-deal-01'], 'paow');
  assert.equal(owner['paow-p4-c1-plan-deal-01-cut'], 'paow', 'a derived take is the dealer\'s whose film it is cut from');
  assert.equal(owner['paow-p1-c1-plan-deal-01-edit-01'], 'paow', 'a corrected copy is the dealer\'s whose clip it corrects');
  assert.deepEqual(graph.dealersOf({derived: [{id: 'x-01', from: 'READY', to: 'P4.C1', clip: 'old-film', frames: [0, 9]}], edits: [{id: 'y-01', source: {clip: 'gone'}}]}), {'x-01': 'pamela', 'y-01': 'pamela'});
  const pamela = graph.buildGraph(data), paow = graph.buildGraph(data, {dealer: 'paow'});
  assert.equal(pamela.dealer, 'pamela'); assert.equal(paow.dealer, 'paow'); assert.deepEqual([pamela.unplaced, paow.unplaced], [[], []]);
  assert.deepEqual(Object.keys(paow.takes).sort(), ['paow-p1-c1-plan-deal-01', 'paow-p1-c1-plan-deal-01-edit-01', 'paow-p4-c1-plan-deal-01', 'paow-p4-c1-plan-deal-01-cut', 'paow-p4-c1-plan-return-ready-01']);
  assert.ok(Object.keys(pamela.takes).every(id => id.startsWith('pamela-')), 'none of Paow\'s takes in Pamela\'s graph');
  assert.ok(Object.values(paow.takes).every(t => t.dealer === 'paow') && Object.values(pamela.takes).every(t => t.dealer === 'pamela'));
  assert.equal(paow.takes['paow-p1-c1-plan-deal-01-edit-01'].editOf, 'paow-p1-c1-plan-deal-01');
  // Her own graph: her Primär plays at seat 4 and her accepted deal at seat 1; nothing of Pamela's fills her gaps.
  assert.deepEqual(graph.resolveRound(paow, graph.parseSequence('READY>P4.C1 | P4.C1>READY | READY>P1.C1 | P1.C1>READY').steps).map(s => [s.take?.id ?? null, s.why, s.gap]),
    [['paow-p4-c1-plan-deal-01', 'PRIMARY', null], ['paow-p4-c1-plan-return-ready-01', 'PRIMARY', null], ['paow-p1-c1-plan-deal-01', 'MAIN', null], [null, 'GAP', 'MISSING']]);
  // A round in her graph that names one of Pamela's takes cannot play it.
  const named = graph.resolveRound(paow, [{from: 'READY', to: 'P4.C1', take: 'pamela-p4-c1-plan-deal-02'}])[0];
  assert.equal(named.take?.id, 'paow-p4-c1-plan-deal-01'); assert.match(named.notes.join(' '), /kan inte spelas här/);
  assert.deepEqual(Object.keys(graph.buildGraph(data, {dealer: 'nobody'}).takes), []);
});

test('a Paow take, even one Jakob made Primär, does not move Pamela\'s main take, her round or her counts', () => {
  const alone = graph.buildGraph(bank()), mixed = graph.buildGraph(twoDealers()), steps = graph.roundSequence({seats: graph.SEATS, reveal: true});
  const mains = (g: graph.Graph) => [...g.edges, ...g.experiments].map(e => [e.id, e.main?.id ?? null, e.status, e.variants.map(t => t.id), e.inProgress]);
  const round = (g: graph.Graph) => graph.resolveRound(g, steps).map(s => [s.id, s.take?.id ?? null, s.why, s.start, s.end, s.cut, s.gap, s.notes]);
  assert.deepEqual(mains(mixed), mains(alone)); assert.deepEqual(round(mixed), round(alone)); assert.deepEqual(mixed.summary, alone.summary);
  assert.deepEqual(mixed.takes['pamela-p4-c1-plan-deal-02'].landingFrame, alone.takes['pamela-p4-c1-plan-deal-02'].landingFrame);
});

test('a job draft is written for the graph\'s dealer: her ids, her anchors, her own takes as wording, her name and look in the text', () => {
  const look = 'a young, slim, petite woman with a platinum-blonde chin-length bob, in a black tailored blazer over a cream V-neck top';
  const g = graph.buildGraph(twoDealers(), {dealer: 'paow'}), profile = {id: 'paow', name: 'Paow', look, prefix: 'paow-'};
  const deal = graph.draftJob(g, 'READY>P2.C1', {dealer: profile})!;
  assert.deepEqual([deal.job.id, deal.job.dealer, deal.basedOn], ['paow-p2-c1-plan-deal-01', 'paow', 'paow-p1-c1-plan-deal-01']);
  assert.deepEqual(deal.job.first, paowReady); assert.equal(deal.job.last?.file?.path, 'assets/anchors/paow-p2-c1-plan-land-01/anchor.png');
  assert.equal(graph.draftJob(g, 'P4.C1>IDLE', {dealer: profile})!.job.id, 'paow-p4-c1-plan-return-idle-01');
  // Without a profile the graph's dealer still decides: her id as her name, no look, her anchors.
  const entry = graph.draftJob(g, 'IDLE>READY')!;
  assert.equal(entry.job.id, 'paow-idle-ready-entry-01'); assert.equal(entry.job.dealer, 'paow');
  assert.match(entry.job.promptText, /^Locked camera on the same Paow, green felt and fixed shoe\./); assert.doesNotMatch(entry.job.promptText, /Pamela/);
  assert.deepEqual([entry.job.first.file?.path, entry.job.last?.file?.path], ['assets/anchors/paow-idle-empty-01/anchor.png', paowReady.file.path]);
  assert.match(graph.draftJob(g, 'IDLE>READY', {dealer: profile})!.job.promptText, /^Locked camera on the same Paow, a young, slim, petite woman .* V-neck top, green felt and fixed shoe\./);
  for (const id of ['READY>D.C2', 'IDLE>REVEAL(D.C2)', 'AWAY>IDLE', 'IDLE>AWAY', 'IDLE>IDLE', 'READY>IDLE']) {
    const d = graph.draftJob(g, id, {dealer: profile})!.job;
    assert.ok(d.id.startsWith('paow-'), id); assert.doesNotMatch(d.promptText, /Pamela/, id);
    for (const ref of [d.first, d.last]) if (ref?.file) assert.match(ref.file.path, /^assets\/anchors\/paow-/, id);
  }
  // Pamela's drafts are what they were: no dealer field, her own words.
  const hers = graph.draftJob(graph.buildGraph(twoDealers()), 'IDLE>READY')!;
  assert.deepEqual([hers.job.id, hers.job.dealer], ['pamela-idle-ready-entry-01', undefined]); assert.match(hers.job.promptText, /^Locked camera on the same Pamela, black suit, green felt/);
});

// ── The inbox ───────────────────────────────────────────────────────────────
// A take from an order (tools/register-order.ts) comes in with review.inbox: it may not push aside anything Jakob has seen.
const inbox = (extra: MotionRecord = {}): MotionRecord => done('PENDING', {...extra, review: {decision: 'PENDING', inbox: true}});
function inboxBank(): BankData {
  const data = primaryBank(), add = (j: BankJob, record: MotionRecord) => { data.jobs!.push(j); data.motions![j.id] = record; data.media![j.id] = {video: video(j.id)}; };
  add(job('p4-deal-03', 'READY', 'LAND(P4.C1)'), inbox());                                                         // a new deal beside the accepted one
  add(job('p4-back-ready-03', 'LAND(P4.C1)', 'READY', from('p4-deal-03', 100)), inbox());                          // its own return
  add(job('p4-back-idle-02', 'LAND(P4.C1)', 'IDLE', from('p4-deal-02', 110)), inbox());                            // continues the main deal, where only a variant does today
  add(job('p7-deal-01', 'READY', 'LAND(P7.C1)'), inbox());                                                         // the only film of its step
  return data;
}

test('a take in the inbox ranks below a variant and plays only where its step has no other film', () => {
  const before = graph.buildGraph(primaryBank()), g = graph.buildGraph(inboxBank()), mains = (x: graph.Graph) => x.edges.filter(e => e.main).map(e => [e.id, e.main!.id, e.status]);
  assert.ok(g.takes['p4-deal-03'].inbox && !g.takes['p4-deal-02'].inbox);
  // Every main take Jakob has seen stays; seat 7, with nothing else, plays its new deal as unreviewed.
  const order = (id: string) => g.edges.findIndex(e => e.id === id);
  assert.deepEqual(mains(g), [...mains(before), ['READY>P7.C1', 'p7-deal-01', 'UNREVIEWED']].sort((a, b) => order(a[0]) - order(b[0])));
  assert.equal(g.edge['P4.C1>IDLE'].main?.id, 'p4-back-idle-01', 'the variant stays, although the new return continues the main deal');
  // A new return does not move the frame the main deal is cut at.
  assert.deepEqual([g.takes['p4-deal-02'].landingFrame, g.takes['p4-deal-02'].landingConflict], [104, false]);
  const steps = graph.roundSequence({seats: ['P4', 'P7'], dealer: false}), was = graph.resolveRound(before, steps).map(s => s.take?.id ?? null);
  assert.deepEqual(graph.resolveRound(g, steps).map(s => s.take?.id ?? null), was.map((id, i) => steps[i].to === 'P7.C1' || steps[i].to === 'P7.C2' ? 'p7-deal-01' : id));
  // A round that names the new takes plays them, its own return with it, without a seam.
  const named = graph.resolveRound(g, graph.parseSequence('READY>P4.C1@p4-deal-03 | P4.C1>READY@p4-back-ready-03').steps);
  assert.deepEqual(played(named), [['READY>P4.C1', 'p4-deal-03', 'LOCKED', 100, 'FRAME'], ['P4.C1>READY', 'p4-back-ready-03', 'LOCKED', null, null]]); assert.ok(named.every(s => !s.notes.length));
  // Unnamed, the return after it is still one Jakob has seen: the seam is named, never hidden.
  const after = graph.resolveRound(g, graph.parseSequence('READY>P4.C1@p4-deal-03 | P4.C1>READY').steps)[1];
  assert.equal(after.take?.id, 'p4-back-ready-02'); assert.match(after.notes.join(' '), /Skarv/);
  // It is current work, not a leftover.
  for (const id of ['p4-deal-03', 'p4-back-ready-03', 'p4-back-idle-02']) assert.ok(graph.isCurrent(g.edge[g.takes[id].edge], g.takes[id]), id);
  assert.ok(!graph.leftovers(g).some(l => l.take.inbox));
});

test('Jakob\'s decision takes a take out of the inbox, and it then ranks as any other', () => {
  const data = inboxBank(), decide = (id: string, decision: 'ACCEPTED' | 'VARIANT' | 'REJECTED' | 'PENDING') => { data.motions![id] = {...data.motions![id], review: applyChange(data.motions![id].review, {decision, note: ''}, '2026-11-12') as MotionRecord['review']}; };
  decide('p4-back-idle-02', 'PENDING'); assert.equal(data.motions!['p4-back-idle-02'].review?.inbox, true, 'a reset is no decision');
  decide('p4-back-idle-02', 'ACCEPTED'); decide('p4-deal-03', 'REJECTED');
  assert.equal(data.motions!['p4-back-idle-02'].review?.inbox, undefined); assert.equal(data.motions!['p4-deal-03'].review?.inbox, undefined);
  const g = graph.buildGraph(data);
  assert.equal(g.edge['P4.C1>IDLE'].main?.id, 'p4-back-idle-02', 'accepted and continuing the main deal');
  assert.equal(g.edge['READY>P4.C1'].main?.id, 'p4-deal-02'); assert.equal(g.takes['p4-deal-03'].decision, 'REJECTED');
});

test('the idle picker leaves a take in the inbox alone while other idle films exist', () => {
  const data = idleBank(); data.motions!['pamela-idle-new-01'] = inbox({motion: {idle: {calm: true, weight: 1000}}});
  data.jobs!.push(job('pamela-idle-new-01', 'IDLE', 'IDLE', {kind: 'IDLE', target: null, first: data.jobs![0].first, last: data.jobs![0].last})); data.media!['pamela-idle-new-01'] = {video: video('pamela-idle-new-01')};
  const g = graph.buildGraph(data), takes = g.edge['IDLE>IDLE'].takes;
  assert.equal(g.edge['IDLE>IDLE'].main?.id, 'pamela-idle-loop-01');
  const seen: string[] = []; for (let i = 0; i < 200; i++) seen.push(graph.pickIdle(takes, seen, (i * 37 % 100) / 100)!.take.id);
  assert.ok(!seen.includes('pamela-idle-new-01'));
  assert.equal(graph.pickIdle(takes.filter(t => t.inbox), [], 0.5)?.take.id, 'pamela-idle-new-01', 'alone it plays');
});

test('a film from an order enters as frames of its own clip with what it was ordered with, and its fixed copy is a corrected copy', () => {
  const clip = 'paow-giv-p4-01', deal = `${clip}-deal`, back = `${clip}-return-ready`, fix = `${clip}-fix-1`, fixDeal = `${fix}-deal`, fixBack = `${fix}-return-ready`;
  const order = {dealer: 'paow', model: 'kling-4', duration: 7, promptText: 'Round trip to seat 4.'};
  const record = (frames: number, extra: MotionRecord = {}) => inbox({source: {fps: 24, frames}, ...extra});
  const data: BankData = {jobs: [], derived: [
    {id: deal, kind: 'DEAL', from: 'READY', to: 'P4.C1', clip, frames: [0, 99], ...order, first: {file: {path: 'assets/orders/o-1/first.png', sha256: sha}}},
    {id: back, kind: 'RETURN', from: 'P4.C1', to: 'READY', clip, frames: [100, 167], ...order, last: {file: {path: 'assets/orders/o-1/last.png', sha256: sha}}},
    {id: fixDeal, kind: 'DEAL', from: 'READY', to: 'P4.C1', clip: fix, frames: [0, 99], ...order, model: 'kling-4 + film-fix', editOf: deal},
    {id: fixBack, kind: 'RETURN', from: 'P4.C1', to: 'READY', clip: fix, frames: [100, 165], ...order, model: 'kling-4 + film-fix', editOf: back}],
    motions: {[deal]: record(168), [back]: record(168, {motion: {startsOn: {clip: deal, frame: 100}}}), [fixDeal]: record(166), [fixBack]: record(166, {motion: {startsOn: {clip: deal, frame: 100}}})},
    media: {[deal]: {video: video(clip)}, [back]: {video: video(clip)}, [fixDeal]: {video: video(fix)}, [fixBack]: {video: video(fix)}}};
  assert.deepEqual(Object.keys(graph.buildGraph(data).takes), [], 'none of it is Pamela\'s');
  const g = graph.buildGraph(data, {dealer: 'paow'}), t = g.takes;
  assert.deepEqual(g.unplaced, []);
  assert.deepEqual([t[deal].job.model, t[deal].job.duration, t[deal].job.promptText, t[deal].job.first.file?.path, t[deal].job.last?.frame?.index], ['kling-4', 7, 'Round trip to seat 4.', 'assets/orders/o-1/first.png', 99]);
  assert.deepEqual([t[back].job.first.frame?.index, t[back].job.last?.file?.path, t[back].anchorStart], [100, 'assets/orders/o-1/last.png', null]);
  assert.deepEqual([t[deal].startsOn, t[back].startsOn, t[deal].landingFrame], [null, {clip: deal, video: null, frame: 100}, 100]);
  assert.deepEqual([t[fixDeal].editOf, t[fixBack].editOf, t[deal].editOf], [deal, back, null]);
  // Frame numbers are shared, so each return follows both deals, and the copy's own pair plays as one film.
  for (const [r, d] of [[back, deal], [back, fixDeal], [fixBack, deal], [fixBack, fixDeal]]) assert.ok(graph.returnFits(t[r], t[d]), `${r} after ${d}`);
  assert.deepEqual(graph.resolveRound(g, graph.parseSequence(`READY>P4.C1@${fixDeal} | P4.C1>READY@${fixBack}`).steps).map(s => [s.take?.id, s.video, s.start, s.end, s.cut, s.notes.length]),
    [[fixDeal, video(fix), 0, 100, 'FRAME', 0], [fixBack, video(fix), 100, null, null, 0]]);
  for (const id of [deal, back, fixDeal, fixBack]) assert.ok(graph.isCurrent(g.edge[t[id].edge], t[id]), id);
  // A return ordered on its own from the landing picture follows every deal that ends on that picture.
  const alone: BankData = {jobs: [job('paow-p4-deal-01', 'READY', 'LAND(P4.C1)', {dealer: 'paow', last: {file: {path: 'assets/orders/o-2/last.png', sha256: sha}}})],
    derived: [{id: 'paow-p4-back-01', kind: 'RETURN', from: 'P4.C1', to: 'IDLE', clip: 'paow-p4-back-01', frames: [0, 71], dealer: 'paow', model: 'kling-4', first: {file: {path: 'assets/orders/o-2/last.png', sha256: sha}}}],
    motions: {'paow-p4-deal-01': done(), 'paow-p4-back-01': record(72)}, media: {'paow-p4-deal-01': {video: video('paow-p4-deal-01')}, 'paow-p4-back-01': {video: video('paow-p4-back-01')}}};
  const a = graph.buildGraph(alone, {dealer: 'paow'});
  assert.equal(a.takes['paow-p4-back-01'].anchorStart, 'assets/orders/o-2/last.png'); assert.ok(graph.returnFits(a.takes['paow-p4-back-01'], a.takes['paow-p4-deal-01']));
});
