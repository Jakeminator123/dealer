// "Bara sätt som håller, och en pilot först" (Jakob 2026-11-24, docs/BESKED.md): what a way of making a film is, how its
// state is counted from his own verdicts, and what the approval answers (src/order-ways.ts). The same contract through
// the store and the routes, with files and a register: tools/order-routes.test.ts, "a pilot first".
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order, TakeStatus } from '../src/order-model.ts';
import { dollWayAnswer, filmVerdicts, pilotOf, referenceKind, reviewAddress, wayAnswer, wayBasis, wayBook, wayChip, wayOf, wayStop, withBeslut } from '../src/order-ways.ts';

const METHODS = { methods: [] };
/** The doll's films as their register lists them: one built, one read off a real deal. */
const RENDERED = [{ id: 'docka-byggd-a' }, { id: 'docka-avlast-a', fromDeal: 'ada-giv-2-1-p4-01-01' }];
const doll = (id: string) => ({ status: 'FINNS', clips: [id], path: 'x', sha256: 'x', seconds: 4, goesTo: 'P4.C1', approvedStraight: false, dealer: 'docka' }) as Order['reference'];
const NONE = { status: 'INGEN', why: '' } as Order['reference'];

/** An order with only what a way reads; approved unless said otherwise. */
function order(id: string, over: { step?: string; shape?: 'ROUND_TRIP' | 'ONE_WAY' | null; model?: string; template?: string; reference?: Order['reference']; side?: 'FRONT' | 'BACK'; approved?: boolean; created?: string } = {}): Order {
  const step = over.step ?? 'GIV-2.3';
  return {
    id, dealer: 'ada', kind: 'FILM', created: over.created ?? `2026-11-24T00:00:00Z ${id}`,
    step: { key: step, shape: step.startsWith('GIV-') ? (over.shape === undefined ? 'ROUND_TRIP' : over.shape) : null },
    motion: step.startsWith('GIV-') ? { target: 'P4.C1', side: over.side ?? 'FRONT' } : null,
    generation: { model: over.model ?? 'kling-4' }, prompt: { template: over.template ?? 'film-giv-kort@15' }, reference: over.reference ?? doll('docka-byggd-a'),
    status: over.approved === false ? 'UTKAST' : 'GODKÄND', approval: over.approved === false ? null : { by: 'huvudagent', at: 'x', orderSha256: 'x', mandate: 'x' },
  } as unknown as Order;
}
const his = (decision: 'ACCEPTED' | 'REJECTED', words: string, day = '2026-11-24') => ({ decision, userReview: `Jakob ${day}: ${words}` });
const forHim = (decision: 'ACCEPTED' | 'REJECTED') => ({ decision, userAccepted: false, provisional: { by: 'granskare', at: 'x', mandate: 'Jakob 2026-11-13: domar åt honom', note: 'x' } });
/** A film of the bank cut from an order's take: the deal, or the return of the same film. */
const film = (orderId: string, take: number, part: 'deal' | 'return-ready-c' | '', review: Record<string, unknown> | null) =>
  [`${orderId}-0${take}${part ? `-${part}` : ''}`, { order: { id: orderId, take }, motion: { kind: part.startsWith('return') ? 'RETURN' : 'DEAL' }, ...(review ? { review } : {}) }] as const;
const book = (orders: Order[], posts: (readonly [string, unknown])[], takes: TakeStatus[] = ['INFÖRD']) =>
  wayBook(orders.map((o) => ({ order: o, takes })), filmVerdicts(posts, new Map(orders.map((o) => [o.id, o]))), METHODS, RENDERED);

test('a way is the recipe plus how the film is made: model, template, shape, the kind of reference film, a closed card', () => {
  const key = (o: Order) => wayOf(o, METHODS, RENDERED)!.key;
  const base = order('a');
  assert.equal(key(order('b')), key(base), 'two orders made the same are one way, whatever the seat picture or the take');
  for (const [what, other] of [
    ['the model', order('b', { model: 'wan3' })], ['the template', order('b', { template: 'film-giv-kort@14' })], ['bara dit', order('b', { shape: 'ONE_WAY' })],
    ['no reference film', order('b', { reference: NONE })], ['a read-off doll film', order('b', { reference: doll('docka-avlast-a') })],
    ['a real film', order('b', { reference: { ...doll('ada-giv-2-1-p4-01-01'), dealer: 'ada' } as Order['reference'] })], ['a closed card', order('b', { side: 'BACK' })], ['the step', order('b', { step: 'GIV-2.1' })],
  ] as const) assert.notEqual(key(other), key(base), `${what} is another way`);
  // The doll's film read off a real deal is told from a built one by its register entry (fromDeal), never by its name.
  assert.deepEqual([referenceKind(doll('docka-byggd-a'), RENDERED), referenceKind(doll('docka-avlast-a'), RENDERED), referenceKind(NONE, RENDERED)], ['docka-byggd', 'docka-avläst', 'ingen']);
  assert.equal(wayOf({ ...base, kind: 'STILL' } as Order, METHODS, RENDERED), null, 'a still is not tried by a pilot');
  assert.equal(wayAnswer(base, [], METHODS, RENDERED)!.words, 'Kling 4 · mall 15 · tur och retur · dockans byggda film');
  // The guide's "Från dockan" asks about the doll's way before its film is made: the same deal, whatever the draft itself chose.
  const plain = order('c', { approved: false, shape: 'ONE_WAY', template: 'film-giv-kort@14', reference: NONE });
  assert.equal(dollWayAnswer(plain, [], METHODS, RENDERED)!.key, key(base));
  assert.equal(dollWayAnswer(order('d', { step: 'VILA' }), [], METHODS, RENDERED), null, 'only a deal is saved from the doll');
});

test('the state is counted from his own verdicts on the films: one set for him never counts, and a deal is judged on the deal', () => {
  const o = order('ada-giv-01'), state = (posts: (readonly [string, unknown])[]) => book([o], posts)[0];
  assert.equal(state([]).state, 'oprövat');
  // Approved for him, and the return approved by him: he has not judged the deal.
  const waiting = state([film(o.id, 1, '', null), film(o.id, 1, 'deal', forHim('ACCEPTED')), film(o.id, 1, 'return-ready-c', his('ACCEPTED', 'Bra!'))]);
  assert.deepEqual([waiting.state, waiting.yes, waiting.no, waiting.forHim, waiting.back], ['oprövat', 0, 0, { yes: 1, no: 0 }, { yes: 1, no: 0 }]);
  assert.deepEqual(pilotOf(waiting)!.pilot, { order: o.id, film: 'ada-giv-01-01-deal', forHim: 'ja', takes: ['INFÖRD'] }, 'the deal waits for his eyes, not the whole film it was cut from');
  const held = state([film(o.id, 1, 'deal', his('ACCEPTED', 'Den är mycket bra.'))]);
  assert.deepEqual([held.state, held.said, wayChip(held)], ['håller', { film: 'ada-giv-01-01-deal', words: 'Den är mycket bra.', at: '2026-11-24', from: 'granska' }, 'Håller']);
  const fell = state([film(o.id, 1, 'deal', his('REJECTED', 'MÅSTE FINNAS METODFEL')), film(o.id, 1, 'return-ready-c', his('ACCEPTED', 'Bra!'))]);
  assert.deepEqual([fell.state, fell.said?.words, wayChip(fell)], ['föll', 'MÅSTE FINNAS METODFEL', 'Föll: MÅSTE FINNAS METODFEL'], 'an approved return does not save a rejected deal');
});

test('his approvals against his rejections: five of six rejected fell, and a way holds while his yes are at least his no', () => {
  const orders = [1, 2, 3, 4, 5, 6].map((n) => order(`ada-giv-0${n}`));
  const night = book(orders, orders.map((o, i) => film(o.id, 1, 'deal', i === 2 ? { ...his('ACCEPTED', 'Rolig som variant'), acceptedAs: 'VARIANT' } : his('REJECTED', `nej ${i}`))))[0];
  assert.deepEqual([night.state, night.yes, night.no, night.orders.length], ['föll', 1, 5, 6]);
  const even = book(orders.slice(0, 2), [film('ada-giv-01', 1, 'deal', his('ACCEPTED', 'Bra')), film('ada-giv-01', 2, 'deal', his('REJECTED', 'nej'))])[0];
  assert.equal(even.state, 'håller', 'one take of two sifted out is how two takes are meant to work');
  // Drafts and orders set aside are no evidence, and a way nothing approved was made with has no row.
  assert.deepEqual(book([order('ada-giv-07', { approved: false })], []), []);
});

test('en pilot först: one order of an untried way, no second before he has judged its film; a way that fell is refused', () => {
  const pilot = order('ada-giv-01'), draft = order('ada-giv-02', { approved: false });
  const stop = (posts: (readonly [string, unknown])[], takes: TakeStatus[] = ['LAGD']) => wayAnswer(draft, book([pilot, draft], posts, takes), METHODS, RENDERED)!;
  // No approved order made so: the draft is the pilot. The pilot itself is never stopped by itself.
  assert.equal(wayAnswer(draft, book([draft], []), METHODS, RENDERED)!.stop, null);
  assert.equal(wayStop(book([pilot], [])[0], pilot.id), null);
  // The pilot is approved and its film has not come.
  const early = stop([]);
  assert.deepEqual([early.state, early.chip], ['oprövat', 'Oprövat: en pilot först']);
  assert.equal(early.stop, 'En pilot först: sättet är oprövat (Kling 4 · mall 15 · tur och retur · dockans byggda film), och piloten ada-giv-01 är redan godkänd. Dess film finns inte i banken än (tagningen står som LAGD): hämta den och för in den, så att Jakob ser den i Granska; kom ingen film, avbryt tagningen. Nästa order går att godkänna när han själv har godkänt pilotens film.');
  // A pilot that gave no film (failed, set aside, a call nobody knows the fate of) holds nothing back.
  for (const dead of ['MISSLYCKAD', 'AVBRUTEN', 'OSÄKER'] as const) assert.equal(stop([], [dead]).stop, null, dead);
  // Its film is in the bank, approved for him: that is not his verdict, and the answer says where he sees it.
  const shown = stop([film(pilot.id, 1, 'deal', forHim('ACCEPTED'))], ['INFÖRD']);
  assert.equal(shown.stop, `En pilot först: sättet är oprövat (Kling 4 · mall 15 · tur och retur · dockans byggda film), och piloten ada-giv-01 är redan godkänd. Filmen ada-giv-01-01-deal väntar på Jakobs ögon (den är dömd åt honom, och det räknas inte): han ser och dömer den i Granska, ${reviewAddress('ada-giv-01-01-deal')}. När han har godkänt den går nästa order att godkänna; underkänner han den har sättet fallit.`);
  assert.equal(reviewAddress('ada-giv-01-01-deal'), '/studio/granska/?tagning=ada-giv-01-01-deal');
  // He approves it: the way holds and nothing stops.
  assert.deepEqual([stop([film(pilot.id, 1, 'deal', his('ACCEPTED', 'Bra!'))]).stop, stop([film(pilot.id, 1, 'deal', his('ACCEPTED', 'Bra!'))]).chip], [null, 'Håller']);
  // He rejects it: the way fell, with his words and the day, until the recipe is changed.
  const fell = stop([film(pilot.id, 1, 'deal', his('REJECTED', 'Kortet flyger upp från bordet.'))]);
  assert.equal(fell.stop, 'Sättet föll och beställs inte igen: Kling 4 · mall 15 · tur och retur · dockans byggda film. Jakob underkände ada-giv-01-01-deal 2026-11-24 (”Kortet flyger upp från bordet.”). Ändra receptet (mall, modell, referensfilm eller tur och retur): då är det ett nytt sätt, som prövas med en pilot.');
  const changed = order('ada-giv-03', { approved: false, template: 'film-giv-kort@16' });
  assert.equal(wayAnswer(changed, book([pilot, changed], [film(pilot.id, 1, 'deal', his('REJECTED', 'nej'))]), METHODS, RENDERED)!.stop, null, 'a changed recipe is a new way, and its first order is its pilot');
  // Films approved for him on a way that fell are named as what they are.
  const mixed = stop([film(pilot.id, 1, 'deal', forHim('ACCEPTED')), film(pilot.id, 2, 'deal', his('REJECTED', 'nej.'))]);
  assert.match(mixed.stop!, / 1 film på sättet är godkänd åt honom; den räknas först när han själv har dömt den i Granska\.$/);
});

test('his yes in Beslut about named films is his own word about the way: counted where Granska has none of his, and said as that', () => {
  const orders = [1, 2, 3, 4, 5, 6].map((n) => order(`ada-giv-0${n}`)), draft = order('ada-giv-07', { approved: false });
  // Five deals approved for him, each with its return, and his own no in Granska on the sixth.
  const posts = [...orders.slice(0, 5).flatMap((o) => [film(o.id, 1, 'deal', forHim('ACCEPTED')), film(o.id, 1, 'return-ready-c', forHim('ACCEPTED'))]), film('ada-giv-06', 1, 'deal', his('REJECTED', 'Kortet flyger upp från bordet.'))];
  const card = { card: 'ada-givar-c1', at: '2026-11-23', question: 'Håller givarna till plats 1–5?', words: 'Ja, alla håller', source: 'Beslut-kortet ada-givar-c1', films: orders.slice(0, 5).map((o) => `${o.id}-01`) };
  const verdicts = filmVerdicts(posts, new Map(orders.map((o) => [o.id, o])));
  const counted = (beslut: (typeof card)[], list = verdicts) => wayBook([...orders, draft].map((o) => ({ order: o, takes: ['INFÖRD'] as TakeStatus[] })), list, { ...METHODS, beslut }, RENDERED);
  // Without the card the way fell: the verdicts set for him never count.
  const before = counted([])[0];
  assert.deepEqual([before.state, before.yes, before.no, before.forHim.yes, before.beslut], ['föll', 0, 1, 5, { yes: 0, days: [] }]);
  // With it: five yes against one no. Each film counts once, as his yes in Beslut and no longer as one set for him too.
  const after = counted([card])[0];
  assert.deepEqual([after.state, after.yes, after.no, after.forHim.yes, after.beslut, after.back], ['håller', 5, 1, 0, { yes: 5, days: ['2026-11-23'] }, { yes: 0, no: 0 }]);
  assert.deepEqual(after.said, { film: 'ada-giv-05-01-deal', words: 'Ja, alla håller', at: '2026-11-23', from: 'beslut' });
  assert.equal(wayBasis(after), 'Jakob själv: 5 ja mot 1 nej (5 ja är hans ja i Beslut 2026-11-23).');
  const answer = wayAnswer(draft, counted([card]), METHODS, RENDERED)!;
  assert.deepEqual([answer.state, answer.chip, answer.stop, answer.basis], ['håller', 'Håller', null, 'Jakob själv: 5 ja mot 1 nej (5 ja är hans ja i Beslut 2026-11-23).']);
  // The films' verdicts as the bank has them are not touched: still set for him.
  assert.deepEqual(verdicts.filter((v) => v.part === 'film').map((v) => [v.his, v.from, v.forHim]).slice(0, 5), Array(5).fill([null, null, 'ja']));
  assert.deepEqual(withBeslut(verdicts, [card], new Set(orders.map((o) => o.id))).find((v) => v.film === 'ada-giv-01-01-deal'), { film: 'ada-giv-01-01-deal', order: 'ada-giv-01', take: 1, part: 'film', his: 'ja', from: 'beslut', forHim: null, words: 'Ja, alla håller', at: '2026-11-23' });
  // His own verdict in Granska on a named film goes first: a no there is a no, and the card adds nothing to that film.
  const judged = filmVerdicts([film('ada-giv-01', 1, 'deal', his('REJECTED', 'nej.')), ...posts.slice(2)], new Map(orders.map((o) => [o.id, o])));
  assert.deepEqual([counted([card], judged)[0].yes, counted([card], judged)[0].no, counted([card], judged)[0].beslut.yes], [4, 2, 4]);
  // A way that fell all the same says where its yes come from.
  const one = { ...card, films: ['ada-giv-01-01'] }, two = filmVerdicts([posts[0], posts.at(-1)!, film('ada-giv-06', 2, 'deal', his('REJECTED', 'nej igen.'))], new Map(orders.map((o) => [o.id, o])));
  const fell = wayAnswer(draft, counted([one], two), METHODS, RENDERED)!;
  assert.equal(fell.state, 'föll');
  assert.ok(fell.stop!.includes(' Av 3 filmer som han själv har dömt på det här sättet är 2 underkända (1 ja är hans ja i Beslut 2026-11-23).'), fell.stop!);
  // A named film that has no verdict block in the bank is counted from its order.
  const rest = order('ada-vila-01', { step: 'VILA', template: 'film-vila-kort@12', reference: NONE });
  const resting = wayBook([{ order: rest, takes: ['INFÖRD'] }], [], { ...METHODS, beslut: [{ ...card, films: ['ada-vila-01-01'] }] }, RENDERED)[0];
  assert.deepEqual([resting.state, resting.yes, resting.beslut.yes], ['håller', 1, 1]);
});
