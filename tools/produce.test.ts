// The production list (tools/produce.ts): every step of a dealer's graph with what plays (as Karta says it), what is in
// flight, whether a round needs it, what it waits for and its method, in one state; the drafts it makes (never twice for a
// step in flight unless told, a trial only for a method that is tried, one take, and always saying the list made it); and
// on the checkout, the same count of missing films as Karta's. The methods are a small register written here (one that
// holds, one tried with a reference rule and a model for where none exists, one tried without, two missing), so that a
// change of method on evidence never needs a change of test; the live register is read only on the checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, type BankData, type BankJob } from '../src/clip-graph.ts';
import { readMethods, type Method, type MethodRegister } from '../src/order-methods.ts';
import type { Entry } from '../studio/lib/media.ts';
import { makeDrafts, productionList, readProduction, roundFilms, stepFor, trialRows, type OrderLike, type ProductionInput } from './produce.ts';
import type { NewOrder } from './order-store.ts';

const job = (id: string, from: string, to: string, dealer = 'paow'): BankJob => ({ id, kind: '', target: null, from, to, model: 'wan3', duration: 4, ratio: '', audio: false, promptText: '', first: {}, purpose: 'prov', dealer });
const accepted = { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-13: bra' };
function bank(): BankData {
  const jobs = [
    job('paow-entry', 'IDLE', 'READY'), job('paow-rest', 'IDLE', 'IDLE'), job('paow-p4-deal', 'READY', 'P4.C1'), job('paow-p4-back', 'P4.C1', 'READY'),
    job('paow-p1-deal', 'READY', 'P1.C1'), job('pamela-p5-deal', 'READY', 'P5.C1', 'pamela'),
  ];
  const review: Record<string, object> = {
    'paow-entry': accepted, 'paow-rest': { ...accepted, acceptedAs: 'VARIANT' }, 'paow-p4-deal': { ...accepted, acceptedAs: 'MAIN' }, 'paow-p4-back': accepted,
    'paow-p1-deal': { decision: 'PENDING', inbox: true }, 'pamela-p5-deal': accepted,
  };
  return {
    jobs,
    motions: Object.fromEntries(jobs.map((j) => [j.id, { source: { frames: 168, fps: 24, sha256: 'a'.repeat(64) }, review: review[j.id] }])) as BankData['motions'],
    media: Object.fromEntries(jobs.map((j) => [j.id, { video: `assets/motions/${j.id}/source.mp4` }])),
  };
}
const anchors = (...at: ('1' | '2.1' | '2.2')[]): Entry[] =>
  at.map((a) => ({ id: `paow-${a}`, role: `ankare-${a}`, name: `Ankare ${a}`, path: `assets/anchors/paow-${a}/anchor.png`, node: { '1': 'IDLE', '2.1': 'READY', '2.2': 'READY-B' }[a], state: 'gäller' }) as Entry);
const order = (id: string, edge: string | null, cutInto: string[], status: 'UTKAST' | 'GODKÄND', shown: OrderLike['shown'], kind: 'FILM' | 'STILL' = 'FILM', makes: { role: string } | null = null): OrderLike => ({
  order: { id, title: id, dealer: 'paow', kind, status, approval: status === 'GODKÄND' ? { by: 'jakob', at: '2026-11-13T00:00:00Z', orderSha256: 'c'.repeat(64) } : null, created: '2026-11-13T00:00:00Z', step: { key: 'GIV-2.1', label: '', edge, shape: cutInto.length === 2 ? 'ROUND_TRIP' : 'ONE_WAY', cutInto, makes: makes ? { ...makes, label: '' } : null } },
  shown,
});
const method = (m: Partial<Method> & Pick<Method, 'id' | 'step' | 'status'>): Method => ({
  seats: null, model: null, style: null, seconds: null, takes: null, turn: null, shape: null, reference: 'ingen', extra: null,
  evidence: { orders: [], reviewer: [], owner: [], note: '' }, setBy: 'testet', setAt: '2026-11-13', ...m,
});
const METHODS: MethodRegister = {
  about: 'A small register written in the test for the production list.',
  schemaVersion: 1,
  methods: [
    method({ id: 'ingang-2.1', step: 'INGANG-2.1', status: 'gäller', model: 'wan3', style: 'KORT', seconds: 4, takes: 2, evidence: { orders: ['paow-ingang-2-1-01'], reviewer: [], owner: [{ take: 'paow-ingang-2-1-01-01', words: 'Jakob 2026-11-13: bra' }], note: '' } }),
    method({ id: 'vila', step: 'VILA', status: 'prov', model: 'wan3', style: 'KORT', seconds: 4, takes: 2, extra: 'She nods once.' }),
    // Every seat: Kling 4 with a straight-approved deal to the same seat as the reference, WAN 3 where none exists.
    method({ id: 'giv-2.1', step: 'GIV-2.1', status: 'prov', model: 'kling-4', style: 'KORT', seconds: 7, takes: 2, turn: 'AT_PLACE', shape: 'ROUND_TRIP', reference: 'samma-plats-rakt-godkänd', noReferenceModel: 'wan3' }),
    // The dealer's cards: tried without a reference, the turn as the plan says.
    method({ id: 'giv-2.1-dealer', step: 'GIV-2.1', seats: 'dealer', status: 'prov', model: 'kling-4', style: 'KORT', seconds: 7, takes: 2, turn: 'plan', shape: 'ROUND_TRIP' }),
    method({ id: 'halkort', step: 'HALKORT', status: 'saknas' }),
    method({ id: 'utgang', step: 'UTGANG', status: 'saknas' }),
  ],
};
/** The fixture with one method changed or added. */
const withMethod = (m: Method): MethodRegister => ({ ...METHODS, methods: [...METHODS.methods.filter((x) => x.id !== m.id), m] });
async function input(change: Partial<ProductionInput> = {}): Promise<ProductionInput> {
  const data = bank();
  const methods = readMethods(METHODS).register!;
  return {
    dealer: { id: 'paow', name: 'Paow' }, graph: buildGraph(data, { dealer: 'paow' }), bank: data as never, methods, entries: anchors('1', '2.1'),
    orders: [order('paow-giv-2-1-p2-03', 'READY>P2.C1', ['READY>P2.C1', 'P2.C1>READY'], 'GODKÄND', 'LAGD'), order('paow-ankare-2-2-09', null, [], 'GODKÄND', 'MÄTT', 'STILL', { role: 'ankare-2.2' })],
    ...change,
  };
}
const row = (list: ReturnType<typeof productionList>, edge: string) => list.rows.find((r) => r.edge === edge)!;

test('every step of the graph, a round\'s first, each with one state in Jakob\'s words', async () => {
  const list = productionList(await input());
  assert.equal(list.rows.length, 33, 'the 33 films Karta counts');
  assert.equal(list.counts.needed, 21, 'every player two cards (the second plays the first\'s film), the dealer two, the hole card turned, the rest between');
  assert.deepEqual(list.rows.filter((r) => r.needed).map((r) => r.edge).slice(0, 4), ['IDLE>READY', 'IDLE>IDLE', 'READY>P1.C1', 'P1.C1>READY']);
  assert.deepEqual(list.rows.filter((r) => r.needed).map((r) => r.edge).slice(-5), ['READY>D.C1', 'D.C1>READY', 'READY>D.C2', 'D.C2>IDLE', 'IDLE>REVEAL(D.C2)']);
  assert.deepEqual(list.rows.filter((r) => !r.needed).map((r) => r.edge).slice(0, 3), ['READY>IDLE', 'AWAY>IDLE', 'IDLE>AWAY']);
  const states = Object.fromEntries(list.rows.map((r) => [r.edge, r.state]));
  assert.equal(states['IDLE>READY'], 'KLAR');
  assert.equal(row(list, 'IDLE>IDLE').words, 'klar · variant');
  assert.equal(row(list, 'READY>P4.C1').words, 'klar · primär');
  assert.equal(states['READY>P1.C1'], 'DOM', 'delivered and in the inbox: waits for his verdict');
  assert.equal(row(list, 'READY>P1.C1').words, 'levererad, väntar på din dom');
  assert.deepEqual([states['READY>P2.C1'], states['P2.C1>READY']], ['BESTÄLLD', 'BESTÄLLD'], 'a round trip in flight covers the deal and its return');
  assert.equal(row(list, 'READY>P2.C1').orders[0].id, 'paow-giv-2-1-p2-03');
  assert.equal(states['P3.C1>READY'], 'MED_GIVEN', 'the return comes with its deal');
  assert.equal(row(list, 'P3.C1>READY').words, 'kommer med given till plats 3 (tur och retur)');
  // The deal to a seat with a straight-approved deal of the bank to the same seat: Kling 4 with it as the reference film.
  const p5 = row(list, 'READY>P5.C1');
  assert.deepEqual([p5.state, p5.method!.reference, p5.draft!.model, p5.draft!.reference], ['PROV', 'pamela-p5-deal', undefined, 'pamela-p5-deal']);
  // Without one: WAN 3 without a reference, as the method says.
  const p6 = row(list, 'READY>P6.C1');
  assert.deepEqual([p6.state, p6.draft!.model, p6.draft!.reference, p6.draft!.flipAxis, p6.draft!.takes], ['PROV', 'wan3', undefined, 'AT_PLACE', 1]);
  assert.match(p6.method!.recipe, /^WAN 3 .* utan referensfilm/);
  assert.match(p6.draft!.title!, /^Paow · prov: giv till plats 6 · WAN 3$/);
  assert.match(p6.draft!.createdBy!, /^Produktionslistan.*, prov: steg READY>P6\.C1, metod giv-2\.1$/);
  // A method of its own for the dealer's cards, tried without a reference: the model it names, the turn as the plan says.
  const hole = row(list, 'READY>D.C2');
  assert.deepEqual([hole.state, hole.method!.id, hole.method!.reference, hole.draft!.model, hole.draft!.reference, hole.draft!.flipAxis, hole.draft!.shape], ['PROV', 'giv-2.1-dealer', null, undefined, undefined, undefined, 'ROUND_TRIP']);
  assert.equal(hole.method!.recipe, 'Kling 4 · kort text · 7 s · prov: 1 tagning');
  // A missing method, and a step the register does not name: no method yet.
  assert.equal(states['IDLE>REVEAL(D.C2)'], 'INGEN_METOD');
  assert.equal(states['READY>IDLE'], 'INGEN_METOD');
  assert.equal(row(list, 'READY>IDLE').words, 'ingen metod än');
  assert.equal(row(list, 'P6.C1>IDLE').method, null, 'a return the register does not name');
  assert.equal(states['AWAY>IDLE'], 'INTE_BYGGD');
  assert.match(row(list, 'AWAY>IDLE').words, /^inte byggd: kräver en bild av bordet utan henne.* och en stående bild av henne$/);
  // The same count of missing films as Karta's own (bankSummary over the same graph).
  assert.equal(list.counts.missing, list.karta.missing);
  assert.equal(list.counts.done, 4);
  // The anchors: 2.2 is missing, with the still on its way named.
  assert.deepEqual(list.anchors.map((a) => [a.at, a.state, a.orders.map((o) => o.id)]), [['1', 'gäller', []], ['2.1', 'gäller', []], ['2.2', 'saknas', ['paow-ankare-2-2-09']]]);
  // What a step starts from, with its card where the plan lays it.
  assert.deepEqual(row(list, 'READY>D.C2').picture, { path: 'assets/anchors/paow-2.1/anchor.png', frame: null, waits: null, cards: [{ target: 'D.C2', side: 'BACK' }] });
  assert.deepEqual(row(list, 'IDLE>REVEAL(D.C2)').picture.cards, [{ target: 'D.C2', side: 'FRONT' }]);
});

test('a step waits for the picture it is made from, and a return for its landing picture', async () => {
  const list = productionList(await input({ entries: anchors('1') }));
  assert.equal(row(list, 'READY>P6.C1').state, 'VÄNTAR');
  assert.equal(row(list, 'READY>P6.C1').words, 'väntar på ankare 2.1');
  assert.equal(row(list, 'READY>P6.C1').picture.waits, 'ankare 2.1');
  // With a method holding, a return from the landing picture says that it lacks one.
  const methods = withMethod(method({ id: 'retur-1', step: 'RETUR-1', status: 'gäller', model: 'wan3', style: 'KORT', seconds: 3, takes: 2 }));
  const back = row(productionList(await input({ methods })), 'P6.C1>IDLE');
  assert.deepEqual([back.state, back.words], ['VÄNTAR', 'väntar på landningsbild på plats 6']);
  assert.equal(stepFor({ kind: 'RETURN', target: 'P6.C1', to: 'IDLE' })!.step, 'RETUR-1');
  assert.equal(stepFor({ kind: 'ARRIVE', target: null, to: 'IDLE' }), null);
});

test('the drafts: only what is missing and can be ordered with a method that holds; never twice unless told; a trial for a tried method', async () => {
  const base = await input();
  // Rest holds as a method here, and the bank has no rest: the list can order it now.
  const methods = withMethod({ ...METHODS.methods.find((m) => m.id === 'vila')!, status: 'gäller' });
  const noRest = bank(); noRest.jobs = noRest.jobs!.filter((j) => j.id !== 'paow-rest');
  const made: NewOrder[] = [];
  const store = { create: async (o: NewOrder) => { made.push(o); return { order: { id: `utkast-${made.length}`, title: o.title ?? o.step } as never, revision: '"r"' }; } };
  const list = productionList({ ...base, methods, graph: buildGraph(noRest, { dealer: 'paow' }) });
  assert.equal(row(list, 'IDLE>IDLE').state, 'KAN');
  const result = await makeDrafts(list, store);
  assert.deepEqual(result.made.map((m) => m.edge), ['IDLE>IDLE'], 'nothing that is tried, waits or is klar');
  assert.deepEqual([made[0].step, made[0].takes, made[0].extra, made[0].title], ['VILA', 2, methods.methods.find((m) => m.step === 'VILA')!.extra, undefined]);
  assert.match(made[0].createdBy!, /^Produktionslistan \(node tools\/produce\.ts --draft\): steg IDLE>IDLE, metod vila$/);
  // Once a draft is there, the step is in flight: not drafted again unless told.
  const after = productionList({ ...base, methods, graph: buildGraph(noRest, { dealer: 'paow' }), orders: [...base.orders, order('paow-vila-09', 'IDLE>IDLE', [], 'UTKAST', 'KLAR_ATT_TRYCKA')] });
  assert.equal(row(after, 'IDLE>IDLE').state, 'UTKAST');
  assert.deepEqual((await makeDrafts(after, store)).made, []);
  assert.deepEqual((await makeDrafts(after, store, { trial: 'VILA' })).skipped, [{ edge: 'IDLE>IDLE', why: 'metoden gäller redan: beställ utan --trial' }]);
  // A trial: a seat, an edge or a step; one take; only for a tried method; in flight only with again.
  assert.deepEqual(trialRows(list.rows, 'P6').map((r) => r.edge), ['READY>P6.C1']);
  assert.deepEqual(trialRows(list.rows, 'ready>p6.c1').map((r) => r.edge), ['READY>P6.C1']);
  assert.deepEqual(trialRows(list.rows, 'D.C2').map((r) => r.edge), ['READY>D.C2']);
  assert.deepEqual(trialRows(list.rows, 'HALKORT').map((r) => r.edge), ['IDLE>REVEAL(D.C2)']);
  const trial = await makeDrafts(list, store, { trial: 'P6' });
  assert.deepEqual([trial.made.length, made.at(-1)!.takes, made.at(-1)!.model], [1, 1, 'wan3']);
  const hole = await makeDrafts(list, store, { trial: 'D.C2' });
  assert.deepEqual([hole.made.length, made.at(-1)!.target, made.at(-1)!.takes, made.at(-1)!.model, made.at(-1)!.flipAxis], [1, 'D.C2', 1, undefined, undefined], 'a trial without a reference');
  assert.match((await makeDrafts(list, store, { trial: 'HALKORT' })).skipped[0].why, /^metoden saknas$/);
  assert.match((await makeDrafts(list, store, { trial: 'P2' })).skipped[0].why, /redan på väg \(--again beställer ändå\)/);
  assert.equal((await makeDrafts(list, store, { trial: 'P2', again: true })).made.length, 1);
  assert.match((await makeDrafts(list, store, { trial: 'P9' })).skipped[0].why, /inget steg heter så/);
});

test('on the checkout: 33 steps for Paow and the same count of missing films as Karta', async () => {
  const { input: real } = await readProduction(process.cwd(), 'paow');
  const list = productionList(real);
  assert.equal(list.rows.length, 33);
  assert.equal(list.counts.missing, list.karta.missing);
  assert.equal(list.counts.needed, roundFilms(real.graph).length);
  assert.ok(list.rows.every((r) => r.method || r.state === 'INTE_BYGGD'), 'every step Beställ can make has a method of record');
  await assert.rejects(readProduction(process.cwd(), 'nobody'), /finns inte i data\/dealers\.json/);
});
