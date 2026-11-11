// Offline tests for the clip-bank graph. No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import * as graph from '../src/clip-graph.ts';
import type {BankData, BankJob, MotionRecord} from '../src/clip-graph.ts';
import {TARGETS as PLAN_TARGETS, defaultPlan, toPixels} from '../src/placement-model.ts';
import {validateJob} from '../src/clip-job.ts';

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

test('the bank is 51 edges for the 16 planned cards, with the third dealer card kept apart', () => {
  assert.deepEqual(graph.TARGETS, PLAN_TARGETS);
  const g = graph.buildGraph({});
  assert.equal(g.summary.total, 51); assert.equal(g.summary.optional.total, 3);
  assert.equal(g.summary.done, 0); assert.equal(g.summary.byStatus.MISSING, 51);
  assert.equal(new Set(g.edges.map(e => e.id)).size, 54);
  assert.deepEqual(g.edges.filter(e => e.optional).map(e => e.id), ['READY>D.C3', 'D.C3>READY', 'D.C3>IDLE']);
  assert.equal(g.summary.credits.committed, null);
});

test('status, main take and cut frame follow jobs, receipts and review decisions', () => {
  const g = graph.buildGraph(bank());
  assert.deepEqual(g.unplaced, []);
  assert.equal(g.summary.done, 7); assert.equal(g.summary.total, 51); assert.equal(g.summary.byStatus.UNREVIEWED, 7); assert.equal(g.summary.byStatus.MISSING, 44);
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
  // The 51 edges and their counts are untouched; experiments are counted on their own.
  assert.deepEqual({...g.summary, experiments: null, credits: null}, {...before, experiments: null, credits: null});
  // Known node names are written the model's way, unknown ones as the job wrote them.
  assert.deepEqual(g.experiments.map(e => [e.id, e.kind, e.takes.length, e.status, e.experiment]), [['READY-B>READY-B', 'IDLE', 2, 'UNREVIEWED', true], ['P1.C1>P2.C1', 'RETURN', 1, 'PREPARED', true], ['READY>LAND(P9.C1)', 'DEAL', 1, 'PREPARED', true]]);
  assert.equal(g.summary.experiments.total, 3); assert.equal(g.summary.experiments.done, 1);
  assert.equal(g.edges.length, 54); assert.equal(g.edges.some(e => e.experiment), false);
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
  // A card that only has a variant-start deal is still missing in the 51-edge count.
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
  const g = graph.buildGraph({jobs: file.jobs, budget: file.budget, motions});
  assert.deepEqual(g.unplaced, []);
  assert.equal(Object.keys(g.takes).length, file.jobs.length);
  assert.equal(g.summary.total, 51); assert.equal(g.edges.length, 54);
  for (const job of file.jobs as BankJob[]) {
    const take = g.takes[job.id], ref = graph.parseEdge(`${job.from}>${job.to}`), edge = g.edge[take.edge];
    assert.ok(edge.takes.includes(take), job.id);
    // Known from/to: a take of that model edge. Anything else: a take of an experiment named as the job wrote it.
    if (ref) { assert.equal(take.edge, ref.base, job.id); assert.equal(edge.experiment, false, job.id); assert.equal(take.kind, job.kind, job.id); assert.equal(take.hub, ref.hub, job.id); }
    else { assert.equal(take.edge, `${graph.nodeName(job.from)}>${graph.nodeName(job.to)}`, job.id); assert.ok(g.experiments.includes(edge), job.id); }
    if (take.startsOn?.clip && g.takes[take.startsOn.clip]) assert.equal(g.takes[take.startsOn.clip].kind, 'DEAL', job.id);
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
  // A copy whose source is unknown is named, not shown, and breaks nothing; the 51 edges are still 51.
  assert.deepEqual(g.unplaced.filter(u => /källklipp/.test(u.reason)).map(u => u.id), ['orphan-edit-01', 'undefined']); assert.equal(g.edges.length, 54);
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
  // 3 hub films, three per seat, and both dealer cards on their own: 3 + 7 × 3 + 3 + 3.
  assert.equal(f.total, 30); assert.equal(f.required.length, 30); assert.ok(!f.required.some(id => /P\d\.C2|D\.C3/.test(id))); assert.ok(f.required.includes('READY>D.C2'));
  for (const seat of graph.SEATS) for (const [own, first] of [[`READY>${seat}.C2`, `READY>${seat}.C1`], [`${seat}.C2>READY`, `${seat}.C1>READY`], [`${seat}.C2>IDLE`, `${seat}.C1>IDLE`]]) assert.equal(g.edge[own].shares, first);
  for (const id of ['READY>D.C2', 'D.C2>READY', 'D.C2>IDLE', 'READY>D.C3', 'READY>P4.C1', 'IDLE>READY']) assert.equal(g.edge[id].shares, null, id);
  assert.equal(g.edge['READY>D.C3'].optional, true);
  // Candidates: unreviewed or accepted main take. Known flaws: a secondary main take. Missing: nothing playable, a rejected film included.
  assert.deepEqual([f.done, f.candidates, f.flaws, f.missing], [5, 4, 1, 25]);
  // The second card's own film stays a take of its own edge and is not one of the needed films.
  assert.equal(g.edge['READY>P4.C2'].main?.id, 'p4-second-01'); assert.ok(!f.required.includes('READY>P4.C2'));
  // The per-card summary is untouched by the mode, so older callers read what they always read.
  assert.equal(g.summary.total, 51); assert.equal(g.summary.done, 6);
  // One film per card: nothing is shared and all 51 are needed.
  const card = graph.buildGraph(seatBank(), {mode: 'CARD'});
  assert.equal(card.mode, 'CARD'); assert.ok(card.edges.every(e => e.shares === null));
  assert.deepEqual([card.summary.films.total, card.summary.films.done, card.summary.films.candidates, card.summary.films.flaws, card.summary.films.missing], [51, 6, 5, 1, 45]);
  // With the hole card open the dealer's second card shares too.
  const open = graph.buildGraph(seatBank(), {holeCardDown: false});
  assert.equal(open.edge['READY>D.C2'].shares, 'READY>D.C1'); assert.equal(open.summary.films.total, 27);
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

test('the real job file in seat mode: 30 needed films, every entry placed, and each shared second card follows its seat', async () => {
  const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8')), motions: Record<string, MotionRecord> = {};
  for (const name of await readdir('motions')) if (name.endsWith('.json')) motions[name.slice(0, -5)] = JSON.parse(await readFile(`motions/${name}`, 'utf8'));
  const g = graph.buildGraph({jobs: file.jobs, derived: file.derived, edits: file.edits, budget: file.budget, motions}), f = g.summary.films;
  assert.deepEqual(g.unplaced, []); assert.equal(Object.keys(g.takes).length, file.jobs.length + (file.derived ?? []).length + (file.edits ?? []).length);
  // The numbers move as films arrive; what holds is how they add up.
  assert.equal(f.mode, 'SEAT'); assert.equal(f.total, 30); assert.equal(f.done + f.missing, f.total); assert.equal(f.candidates + f.flaws, f.done); assert.equal(g.summary.total, 51);
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
