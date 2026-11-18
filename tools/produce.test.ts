// The production list (tools/produce.ts): every step of a dealer's graph with what plays (as Karta says it), what is in
// flight, whether a round needs it, what it waits for and its method, in one state; the drafts it makes (never twice for a
// step in flight unless told, a trial only for a method that is tried, one take, and always saying the list made it); and
// on the checkout, the same count of missing films as Karta's. The methods are a small register written here (one that
// holds, one tried bara dit with a reference rule, one tried tur och retur without, two missing), so that a change of method
// on evidence never needs a change of test; the live register is read only on the checkout. A draft of the list is the line
// and nothing else: the dealer, the step and the card; the store fills in the recipe (tools/order-routes.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, type BankData, type BankJob } from '../src/clip-graph.ts';
import { readMethods, type Method, type MethodRegister } from '../src/order-methods.ts';
import { TEMPLATE_VERSION } from '../src/order-prompts.ts';
import type { Entry } from '../studio/lib/media.ts';
import { hubDeals } from '../src/game-director.ts';
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
/** A seat's landing picture that holds: the seat's own end picture for a deal bara dit. */
const landings = (...seats: number[]): Entry[] => seats.map((n) => ({ id: `paow-landning-p${n}`, role: 'landning', name: `Plats ${n}, landning`, path: `assets/anchors/paow-landning-p${n}/anchor.png`, node: `LAND(P${n}.C1)`, card: `P${n}.C1`, state: 'gäller' }) as Entry);
const order = (id: string, edge: string | null, cutInto: string[], status: 'UTKAST' | 'GODKÄND', shown: OrderLike['shown'], kind: 'FILM' | 'STILL' = 'FILM', makes: { role: string } | null = null): OrderLike => ({
  order: { id, title: id, dealer: 'paow', kind, status, approval: status === 'GODKÄND' ? { by: 'jakob', at: '2026-11-13T00:00:00Z', orderSha256: 'c'.repeat(64) } : null, created: '2026-11-13T00:00:00Z', step: { key: 'GIV-2.1', label: '', edge, shape: cutInto.length === 2 ? 'ROUND_TRIP' : 'ONE_WAY', cutInto, makes: makes ? { ...makes, label: '' } : null } },
  shown,
});
const method = (m: Partial<Method> & Pick<Method, 'id' | 'step' | 'status'>): Method => ({
  seats: null, model: null, resolution: null, style: null, template: null, seconds: null, takes: null, turn: null, hand: null, shape: null, reference: 'ingen', lastPicture: null, extra: null,
  evidence: { orders: [], reviewer: [], owner: [], note: '' }, setBy: 'testet', setAt: '2026-11-13', ...m,
});
const film = { resolution: '1080p', style: 'KORT', template: TEMPLATE_VERSION } as const;
const METHODS: MethodRegister = {
  about: 'A small register written in the test for the production list.',
  schemaVersion: 1,
  methods: [
    method({ id: 'ingang-2.1', step: 'INGANG-2.1', status: 'gäller', model: 'wan3', ...film, seconds: 4, takes: 2, lastPicture: 'ankare', evidence: { orders: ['paow-ingang-2-1-01'], reviewer: [], owner: [{ take: 'paow-ingang-2-1-01-01', words: 'Jakob 2026-11-13: bra' }], note: '' } }),
    method({ id: 'vila', step: 'VILA', status: 'prov', model: 'wan3', ...film, seconds: 4, takes: 1, lastPicture: 'ankare', extra: 'She nods once.' }),
    // Every player's seat: bara dit on Kling 4 with a straight-approved deal to the same seat as the reference film.
    method({ id: 'giv-2.1', step: 'GIV-2.1', status: 'prov', model: 'kling-4', ...film, seconds: 3, takes: 1, turn: 'FREE', shape: 'ONE_WAY', reference: 'samma-plats-rakt-godkänd', lastPicture: 'platsens-slutbild' }),
    // The dealer's cards here: tried tur och retur without a reference, the turn as the plan says.
    method({ id: 'giv-2.1-dealer', step: 'GIV-2.1', seats: 'dealer', status: 'prov', model: 'kling-4', ...film, seconds: 7, takes: 1, turn: 'plan', shape: 'ROUND_TRIP', lastPicture: 'ritat-kort' }),
    method({ id: 'halkort', step: 'HALKORT', status: 'saknas' }),
    method({ id: 'utgang', step: 'UTGANG', status: 'saknas' }),
  ],
};
/** The fixture with one method changed or added. */
const withMethod = (m: Method): MethodRegister => ({ ...METHODS, methods: [...METHODS.methods.filter((x) => x.id !== m.id), m] });
async function input(change: Partial<ProductionInput> = {}): Promise<ProductionInput> {
  const data = bank();
  const read = readMethods(METHODS);
  assert.deepEqual(read.errors, [], 'the fixture is a register that reads');
  const methods = read.register!;
  return {
    dealer: { id: 'paow', name: 'Paow' }, graph: buildGraph(data, { dealer: 'paow' }), bank: data as never, methods, entries: [...anchors('1', '2.1'), ...landings(5, 6)],
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
  // A deal that goes tur och retur brings its return with it (the dealer's cards here); a deal bara dit does not.
  assert.equal(states['D.C1>READY'], 'MED_GIVEN', 'the return comes with its deal');
  assert.equal(row(list, 'D.C1>READY').words, 'kommer med given till dealerns kort (tur och retur)');
  assert.notEqual(states['P3.C1>READY'], 'MED_GIVEN', 'a deal bara dit brings no return');
  // The deal to a seat with its own end picture and a straight-approved deal of the bank to the same seat: it can be tried.
  // The draft is the line and nothing else; the reference film the rule finds is shown, and the store takes the same one.
  const p5 = row(list, 'READY>P5.C1');
  assert.deepEqual([p5.state, p5.method!.reference, p5.needs], ['PROV', 'pamela-p5-deal', []]);
  assert.deepEqual(Object.keys(p5.draft!).sort(), ['createdBy', 'dealer', 'notes', 'step', 'target', 'title'], 'the dealer, the step and the card: the recipe is the store\'s to fill in');
  assert.deepEqual([p5.draft!.dealer, p5.draft!.step, p5.draft!.target], ['paow', 'GIV-2.1', 'P5.C1']);
  assert.equal(p5.method!.recipe, `Kling 4 · 1080p · 3 s · bara dit · handleden vänder kortet på vägen · sista bild: platsens egen slutbild · referensfilm: en rakt godkänd giv till samma plats · kort text · mall ${TEMPLATE_VERSION} · prov: 1 tagning`);
  assert.match(p5.draft!.title!, /^Paow · prov: giv till plats 5 · Kling 4 \+ referensfilm$/);
  assert.match(p5.draft!.createdBy!, /^Produktionslistan.*, prov: steg READY>P5\.C1, metod giv-2\.1$/);
  // An end picture but no reference film to the seat: the step waits for the film; nothing is ordered without it.
  const p6 = row(list, 'READY>P6.C1');
  assert.deepEqual([p6.state, p6.words, p6.draft], ['VÄNTAR', 'väntar på en rakt godkänd giv till platsen som referensfilm', null]);
  // Neither an end picture nor a reference film: both are said.
  assert.equal(row(list, 'READY>P7.C1').words, 'väntar på slutbild för plats 7 och en rakt godkänd giv till platsen som referensfilm');
  // A method of its own for the dealer's cards, tried tur och retur without a reference.
  const hole = row(list, 'READY>D.C2');
  assert.deepEqual([hole.state, hole.method!.id, hole.method!.reference, Object.keys(hole.draft!).sort()], ['PROV', 'giv-2.1-dealer', null, ['createdBy', 'dealer', 'notes', 'step', 'target', 'title']]);
  assert.equal(hole.method!.recipe, `Kling 4 · 1080p · 7 s · tur och retur · sista bild: ankaret med kortet ritat · kort text · mall ${TEMPLATE_VERSION} · prov: 1 tagning`);
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
  assert.deepEqual(list.anchors.map((a) => [a.at, a.state, a.orders.map((o) => o.id)]), [['1', 'gäller', []], ['2.1', 'gäller', []], ['2.2', 'saknas', ['paow-ankare-2-2-09']], ['2.3', 'saknas', []]]);
  assert.deepEqual(list.landings, ['P5.C1', 'P6.C1']);
  // What a step starts from, with its card where the plan lays it.
  assert.deepEqual(row(list, 'READY>D.C2').picture, { path: 'assets/anchors/paow-2.1/anchor.png', frame: null, waits: null, cards: [{ target: 'D.C2', side: 'BACK' }] });
  assert.deepEqual(row(list, 'IDLE>REVEAL(D.C2)').picture.cards, [{ target: 'D.C2', side: 'FRONT' }]);
});

test('a step waits for the picture it is made from, and a return for its landing picture', async () => {
  const list = productionList(await input({ entries: anchors('1') }));
  assert.equal(row(list, 'READY>P6.C1').state, 'VÄNTAR');
  assert.equal(row(list, 'READY>P6.C1').words, 'väntar på ankare 2.1 och slutbild för plats 6 och en rakt godkänd giv till platsen som referensfilm');
  assert.equal(row(list, 'READY>P6.C1').picture.waits, 'ankare 2.1');
  // With a method holding, a return from the landing picture says that it lacks one.
  const methods = withMethod(method({ id: 'retur-1', step: 'RETUR-1', status: 'gäller', model: 'wan3', ...film, seconds: 3, takes: 2, lastPicture: 'ankare' }));
  const back = row(productionList(await input({ methods })), 'P7.C1>IDLE');
  assert.deepEqual([back.state, back.words], ['VÄNTAR', 'väntar på landningsbild på plats 7']);
  assert.equal(stepFor({ kind: 'RETURN', target: 'P6.C1', to: 'IDLE' })!.step, 'RETUR-1');
  assert.equal(stepFor({ kind: 'ARRIVE', target: null, to: 'IDLE' }), null);
});

test('the drafts: only what is missing and can be ordered with a method that holds; never twice unless told; a trial for a tried method', async () => {
  const base = await input();
  // Rest holds as a method here, and the bank has no rest: the list can order it now.
  const methods = withMethod({ ...METHODS.methods.find((m) => m.id === 'vila')!, status: 'gäller', takes: 2 });
  const noRest = bank(); noRest.jobs = noRest.jobs!.filter((j) => j.id !== 'paow-rest');
  const made: NewOrder[] = [];
  const store = { create: async (o: NewOrder) => { made.push(o); return { order: { id: `utkast-${made.length}`, title: o.title ?? o.step } as never, revision: '"r"' }; } };
  const list = productionList({ ...base, methods, graph: buildGraph(noRest, { dealer: 'paow' }) });
  assert.equal(row(list, 'IDLE>IDLE').state, 'KAN');
  const result = await makeDrafts(list, store);
  assert.deepEqual(result.made.map((m) => m.edge), ['IDLE>IDLE'], 'nothing that is tried, waits or is klar');
  // The draft is the line: the dealer and the step. The takes, the model and Jakob's addition are the recipe's, filled in by the store.
  assert.deepEqual([made[0].step, Object.keys(made[0]).sort()], ['VILA', ['createdBy', 'dealer', 'notes', 'step']]);
  assert.match(made[0].createdBy!, /^Produktionslistan \(node tools\/produce\.ts --draft\): steg IDLE>IDLE, metod vila$/);
  // Once a draft is there, the step is in flight: not drafted again unless told.
  const after = productionList({ ...base, methods, graph: buildGraph(noRest, { dealer: 'paow' }), orders: [...base.orders, order('paow-vila-09', 'IDLE>IDLE', [], 'UTKAST', 'KLAR_ATT_TRYCKA')] });
  assert.equal(row(after, 'IDLE>IDLE').state, 'UTKAST');
  assert.deepEqual((await makeDrafts(after, store)).made, []);
  assert.deepEqual((await makeDrafts(after, store, { trial: 'VILA' })).skipped, [{ edge: 'IDLE>IDLE', why: 'metoden gäller redan: beställ utan --trial' }]);
  // A trial: a seat, an edge or a step; one take; only for a tried method; in flight only with again.
  assert.deepEqual(trialRows(list.rows, 'P5').map((r) => r.edge), ['READY>P5.C1']);
  assert.deepEqual(trialRows(list.rows, 'ready>p5.c1').map((r) => r.edge), ['READY>P5.C1']);
  assert.deepEqual(trialRows(list.rows, 'D.C2').map((r) => r.edge), ['READY>D.C2']);
  assert.deepEqual(trialRows(list.rows, 'HALKORT').map((r) => r.edge), ['IDLE>REVEAL(D.C2)']);
  const trial = await makeDrafts(list, store, { trial: 'P5' });
  assert.deepEqual([trial.made.length, made.at(-1)!.target, made.at(-1)!.model, made.at(-1)!.takes, made.at(-1)!.reference], [1, 'P5.C1', undefined, undefined, undefined], 'the line: the recipe\'s one take and its reference film are the store\'s');
  assert.match(made.at(-1)!.notes!.join(' '), /Ett prov: en tagning/);
  // A seat that waits for its reference film is not drafted, as a trial either.
  assert.match((await makeDrafts(list, store, { trial: 'P6' })).skipped[0].why, /väntar på en rakt godkänd giv till platsen som referensfilm/);
  const hole = await makeDrafts(list, store, { trial: 'D.C2' });
  assert.deepEqual([hole.made.length, made.at(-1)!.target, made.at(-1)!.model, made.at(-1)!.flipAxis, made.at(-1)!.shape], [1, 'D.C2', undefined, undefined, undefined], 'a trial of the dealer\'s method');
  assert.match((await makeDrafts(list, store, { trial: 'HALKORT' })).skipped[0].why, /^metoden saknas$/);
  // A step with a draft already on its way (the dealer's first card here) is not drafted again unless told.
  const flying = productionList({ ...base, orders: [...base.orders, order('paow-giv-2-1-d-09', 'READY>D.C1', ['READY>D.C1', 'D.C1>READY'], 'UTKAST', 'KLAR_ATT_TRYCKA')] });
  assert.match((await makeDrafts(flying, store, { trial: 'D.C1' })).skipped[0].why, /redan på väg \(--again beställer ändå\)/);
  assert.equal((await makeDrafts(flying, store, { trial: 'D.C1', again: true })).made.length, 1);
  assert.match((await makeDrafts(list, store, { trial: 'P9' })).skipped[0].why, /inget steg heter så/);
});

test('a seat the round deals from anchor 2.2 counts as done, says so with the take, and only with all four films judged', async () => {
  // Paow's seat 6 from READY-B: the entry to 2.2, a deal and its return cut from it, and the exit; no plain deal to seat 6.
  const via = (pending: string[] = []): BankData => {
    const data = bank(), more = [job('paow-in-b', 'IDLE', 'READY-B'), job('paow-p6-deal-b', 'READY-B', 'P6.C1'), { ...job('paow-p6-back-b', 'P6.C1', 'READY-B'), first: { frame: { video: 'assets/motions/paow-p6-deal-b/source.mp4', videoSha256: 'a'.repeat(64), index: 120 } } }, job('paow-out-b', 'READY-B', 'IDLE')];
    for (const j of more) { data.jobs!.push(j); data.motions![j.id] = { source: { frames: 168, fps: 24, sha256: 'a'.repeat(64) }, review: pending.includes(j.id) ? { decision: 'PENDING', inbox: true } : { decision: 'ACCEPTED', provisional: { by: 'huvudagenten' } } } as never; data.media![j.id] = { video: `assets/motions/${j.id}/source.mp4` }; }
    return data;
  };
  const listOf = async (data: BankData, dealer = 'paow', hubs = hubDeals(data, dealer)) => productionList(await input({ dealer: { id: dealer, name: dealer === 'paow' ? 'Paow' : dealer }, graph: buildGraph(data, { dealer }), bank: data as never, hubs }));
  const before = productionList(await input()), after = await listOf(via());
  const deal = row(after, 'READY>P6.C1'), back = row(after, 'P6.C1>READY');
  assert.deepEqual([deal.state, deal.take, deal.hub, deal.have], ['KLAR', 'paow-p6-deal-b', 'READY-B', 'godkand']);
  assert.equal(deal.words, 'klar · godkänd åt dig · ges via ankare 2.2: paow-p6-deal-b');
  assert.deepEqual([back.state, back.take, back.label, back.words], ['KLAR', 'paow-p6-back-b', 'Retur · plats 6 → ankare 2.2', 'klar · godkänd åt dig · ges via ankare 2.2: paow-p6-back-b']);
  // The numbers follow: two more steps done, both judged for him, two fewer missing on Karta, and the list's count is still Karta's.
  assert.deepEqual([after.counts.done, after.counts.neededDone, after.counts.missing, after.counts.provisional], [before.counts.done + 2, before.counts.neededDone + 2, before.counts.missing - 2, before.counts.provisional + 2]);
  assert.equal(after.counts.missing, after.karta.missing); assert.equal(after.karta.missing, before.karta.missing - 2);
  assert.match(after.notes.at(-1)!, /plats 6 via ankare 2\.2/);
  // The entry and exit of 2.2 are no steps of their own here: they stand in no row, and no other row changes.
  const others = (list: typeof before) => list.rows.filter((r) => !['READY>P6.C1', 'P6.C1>READY'].includes(r.edge)).map(({ draft, ...r }) => ({ ...r, draft: draft ? { ...draft, notes: [] } : null }));
  assert.deepEqual(others(after), others(before));
  // One of the four films without a verdict (the exit, the entry or the return), or the map not given: every row and number as before.
  const same = (list: typeof before) => ({ rows: list.rows.map(({ draft, ...r }) => r), counts: list.counts, karta: list.karta, notes: list.notes });
  for (const pending of [['paow-out-b'], ['paow-in-b'], ['paow-p6-back-b']]) {
    const fallen = await listOf(via(pending));
    assert.deepEqual([row(fallen, 'READY>P6.C1').state, row(fallen, 'READY>P6.C1').hub, fallen.counts.done, fallen.counts.missing, fallen.karta], [row(before, 'READY>P6.C1').state, null, before.counts.done, before.counts.missing, before.karta], pending[0]);
  }
  const plain = productionList(await input({ graph: buildGraph(via(), { dealer: 'paow' }), bank: via() as never }));
  assert.deepEqual(same(await listOf(via(), 'paow', {})), same(plain), 'no hubs given: every step as its edge plays');
  assert.deepEqual([row(plain, 'READY>P6.C1').hub, plain.counts.done, plain.karta], [null, before.counts.done, before.karta]);
  assert.deepEqual(hubDeals(via(), 'pamela'), {}, 'a dealer without a map');
  assert.deepEqual(hubDeals(via(), 'paow'), { 'READY>P6.C1': { hub: 'READY-B', take: 'paow-p6-deal-b', why: 'MAIN' }, 'P6.C1>READY': { hub: 'READY-B', take: 'paow-p6-back-b', why: 'MAIN' } });
});

test('on the checkout: 33 steps for Paow and the same count of missing films as Karta', async () => {
  const { input: real } = await readProduction(process.cwd(), 'paow');
  const list = productionList(real);
  assert.equal(list.rows.length, 33);
  assert.equal(list.counts.missing, list.karta.missing);
  assert.equal(list.counts.needed, roundFilms(real.graph).length);
  // A row without a step is a film Beställ cannot make (she comes in, she leaves): it has no method, whether it is still
  // unbuilt or a film made outside the order view already stands on its edge.
  assert.ok(list.rows.every((r) => r.method || !r.step), 'every step Beställ can make has a method of record');
  await assert.rejects(readProduction(process.cwd(), 'nobody'), /finns inte i data\/dealers\.json/);
});
