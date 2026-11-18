// Offline tests for the order model (src/order-model.ts): the checkout's drafts hold, the exact call per take, the cost
// from the price table, the policy check, the hash an approval freezes, and the status a person sees. No media needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  ALL_SEVEN, CARD_SCALES, cutFrameOf, cutFrameWords, endsOnOf, FLIP_AXES, FLIP_LABEL, HAND_LABEL, LANDS_LABEL, SHAPE_LABEL, MODELS, SEAT_TARGETS, STEPS, TEXT_STYLES, plannedDiffers, plannedOf, bodyLine, canonical, checkPolicy, costOf, crossesBody, cutIntoOf, dayOf, defaultFlip, defaultStyle, draftProblems, edgeOf, genitive, groupBudget, handChoiceOf, handsOf, hashInput, isArchived, cutCheckKey, readCutChecks, landingMissing, landingOf, lengthFor, lengthOfReference, modelFor, modelsFor, paramsOf, priceOf, referenceCandidates, requestOf, scaleQuad, scaleWords, seatEndMissing, seatEndOf, seatEndWords, seatList, seatWords, shownOf, spentOn, stepOf, styleOf, stylesFor, summaryOf, takeStates, tidyMotion, validateOrder, verdictOf, waitWords,
  type BankFacts, type Order, type Policy, type Receipt,
} from '../src/order-model.ts';
import * as model from '../src/order-model.ts';
import { orderPrompt } from '../src/order-prompts.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const policy = async () => JSON.parse(await readFile('data/order-policy.json', 'utf8')) as Policy;
async function drafts(): Promise<Order[]> {
  const out: Order[] = [];
  for (const name of (await readdir('data/orders').catch(() => [] as string[])).filter((f) => f.endsWith('.json'))) out.push(JSON.parse(await readFile(`data/orders/${name}`, 'utf8')));
  return out;
}

test('the checkout: every order file holds, a draft is on today\'s template, an approved one is Jakob\'s and unchanged', async () => {
  const list = await drafts();
  assert.ok(list.length >= 3, 'the three prepared drafts');
  for (const order of list) {
    const { errors } = validateOrder(order);
    assert.deepEqual(errors, [], order.id);
    assert.equal(order.prompt.sha256, sha(order.prompt.text), order.id);
    if (order.approval) {
      // Approved in the studio by Jakob (paow-ankare-2-1, 2026-11-13 00:55): never changed since, on the template it was approved on.
      assert.equal(order.status, 'GODKÄND', order.id);
      assert.ok(order.approval.by === 'jakob' || (order.approval.by === 'huvudagent' && !!order.approval.mandate), `${order.id}: Jakob's, or the main agent's on his mandate`);
      assert.equal(order.approval.orderSha256, sha(hashInput(order)), `${order.id}: unchanged since the approval`);
    } else if (order.status === 'AVBRUTEN') {
      // Set aside (tools/order-approve.ts --set-aside): kept as it was, with who set it aside and why.
      assert.ok(order.setAside && typeof order.setAside.why === 'string' && order.setAside.why.length > 0, `${order.id}: set aside with a reason`);
    } else {
      assert.equal(order.status, 'UTKAST', order.id);
      // Today's template for its style: a draft without a style is Utförlig, still template 3's text.
      const dealer = { name: 'Paow', look: 'x' };
      assert.equal(order.prompt.template, orderPrompt(order, dealer, null).template, `${order.id}: a draft is written with today's template for its style`);
      if (order.motion) assert.equal(typeof order.motion.pass, 'boolean', `${order.id}: the hand is said`);
    }
    assert.ok(!JSON.stringify(order).includes('_jwt'), `${order.id}: no signed address in data/`);
    assert.match(order.summary ?? '', /^Gör /, `${order.id}: one line on what it makes`);
    // Nothing of the other dealer goes out or is shown, but the cut figure of her arm at the shoe.
    for (const p of order.pictures) if (p.from?.entry?.startsWith('pamela') || p.from?.path?.includes('/pamela-')) assert.ok(p.cut && p.name === 'pose-figure.png', `${order.id}: ${p.name}`);
    assert.ok(!JSON.stringify(order).includes('preview'), `${order.id}: no stand-in preview`);
  }
  const film = list.find((o) => o.id === 'paow-giv-p4')!;
  assert.deepEqual(film.generation, { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 7 } });
  assert.equal(film.reference.status, 'INGEN');
  assert.equal(film.takes, 2);
  assert.equal(film.group, null);
  assert.deepEqual(film.pictures.map((p) => p.name), ['first.png', 'last.png']);
  // The checkout moves on: the draft waits for anchor 2.1 until Jakob has approved one, and then carries both pictures.
  if (film.status === 'UTKAST' && film.pictures.some((p) => !p.path)) assert.match(draftProblems(film).join(' '), /Väntar på ankare 2\.1/);
  else assert.doesNotMatch(draftProblems(film).join(' '), /Väntar på/);
  const still = list.find((o) => o.id === 'paow-ankare-2-1')!;
  assert.deepEqual(still.pictures.map((p) => [p.name, p.label]), [['anchor.png', 'Paows ankare 1 · kandidat 2'], ['pose-figure.png', 'Pose · bara armen, handen och skon']]);
  // An order stored before 2026-11-18 keeps the line it was made with (and its hash): nothing rewrites it.
  assert.equal(still.summary, 'Gör Paows ankare 2.1: hennes ankare 1 där bara vänsterarmen flyttas till nypet vid skon.');
});

test('the exact call per take: pictures by name, nothing the tool does not take, confirmRepeat from take 2', () => {
  const order = {
    generation: { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 4 } },
    pictures: [
      { name: 'first.png', goesAs: 'startFrame' }, { name: 'last.png', goesAs: 'endFrame' }, { name: 'middle.png', goesAs: 'referenceImage' },
    ],
    reference: { status: 'INGEN', why: '' },
    prompt: { text: 'T' },
  } as unknown as Order;
  assert.deepEqual(requestOf(order, 1), { tool: 'generate_video', args: { model: 'kling-4', promptText: 'T', resolution: '1080p', duration: 4, startFrame: { url: '$file:first.png' }, endFrame: { url: '$file:last.png' }, referenceImages: [{ url: '$file:middle.png' }] } });
  assert.equal(requestOf(order, 2).args.confirmRepeat, true);
  assert.equal('generateAudio' in requestOf(order, 1).args, false, 'Kling 4 has its sound always on and refuses generateAudio');
  const still = { ...order, generation: { provider: 'runway-app', tool: 'generate_image', model: 'nano-banana-pro', params: { ratio: '4:3', imageSize: '4K' } }, pictures: [{ name: 'anchor.png', goesAs: 'referenceImage', tag: 'anchor' }, { name: 'pose.png', goesAs: 'referenceImage', tag: 'pose' }] } as unknown as Order;
  assert.deepEqual(requestOf(still, 1).args, { model: 'nano-banana-pro', promptText: 'T', ratio: '4:3', imageSize: '4K', referenceImages: [{ url: '$file:anchor.png', tag: 'anchor' }, { url: '$file:pose.png', tag: 'pose' }], count: 1 });
});

test('a film made with another model: the models that can make a step, their parameters, the exact call, the price and the check', async () => {
  const entry = stepOf('INGANG-2.1')!, deal = stepOf('GIV-2.1')!, still = stepOf('ANKARE-2.1')!;
  assert.deepEqual(modelsFor(entry).map((m) => m.id), ['kling-4', 'wan3', 'kling-3-4k'], 'every model that takes a first and a last picture');
  assert.deepEqual(modelsFor(deal).map((m) => m.id), ['kling-4', 'wan3', 'kling-3-4k']);
  assert.deepEqual(modelsFor(still).map((m) => m.id), ['nano-banana-pro'], 'a still: only the picture model');
  // No step has a model of its own: which one it is ordered with is its recipe's (data/order-methods.json), and nothing else.
  assert.equal(modelFor(entry, null), null);
  assert.equal(modelFor(entry, undefined), null);
  assert.equal(modelFor(entry, 'wan3')?.id, 'wan3');
  assert.equal(modelFor(entry, 'nano-banana-pro'), null);
  assert.equal(modelFor(still, 'kling-3-4k'), null);
  assert.equal(modelFor(entry, 'gen-9'), null);
  // The parameters: the length and the resolution given (the recipe's, or an exception's); a still's size is its step's.
  assert.deepEqual(paramsOf(entry, MODELS.wan3, { duration: 4, resolution: '1080p' }), { resolution: '1080p', duration: 4, ratio: 'adaptive', generateAudio: false });
  assert.deepEqual(paramsOf(deal, MODELS['kling-4'], { duration: 3 }), { resolution: '1080p', duration: 3 });
  assert.deepEqual(paramsOf(still, MODELS['nano-banana-pro']), { ratio: '4:3', imageSize: '4K' });
  assert.deepEqual(paramsOf(deal, MODELS.wan3, { duration: 7 }), { resolution: '1080p', duration: 7, ratio: 'adaptive', generateAudio: false }, 'the ratio and the sound are the model\'s');
  assert.equal(paramsOf(deal, MODELS['kling-4'], { duration: 3, resolution: '4k' }).resolution, '1080p', 'a resolution the model does not take: its highest');
  // The shortest each model takes (Runway's tool, 2026-11-18): Kling 4 from 3 s, WAN 3 from 2 s.
  assert.deepEqual([MODELS['kling-4'].durations, MODELS.wan3.durations], [[3, 30], [2, 30]]);
  assert.deepEqual([lengthOfReference(MODELS['kling-4'], 3.967), lengthOfReference(MODELS['kling-4'], 4.2), lengthOfReference(MODELS['kling-4'], 2.4), lengthOfReference(MODELS['kling-4'], 40)], [4, 5, 3, 30]);
  // Kling 3.0 4K: resolution fixed 4k, no ratio, sound off, 3–15 s.
  const k4k = modelFor(entry, 'kling-3-4k')!;
  const params = paramsOf(entry, k4k, { duration: 4 });
  assert.deepEqual(params, { resolution: '4k', duration: 4, generateAudio: false });
  assert.deepEqual([lengthFor(k4k, 20), lengthFor(k4k, 2), lengthFor(k4k, 7)], [15, 3, 7]);
  const order = {
    generation: { provider: 'runway-app', tool: 'generate_video', model: 'kling-3-4k', params },
    pictures: [{ name: 'first.png', goesAs: 'startFrame' }, { name: 'last.png', goesAs: 'endFrame' }],
    reference: { status: 'INGEN', why: '' },
    prompt: { text: 'T' },
  } as unknown as Order;
  assert.deepEqual(requestOf(order, 1), { tool: 'generate_video', args: { model: 'kling-3-4k', promptText: 'T', resolution: '4k', duration: 4, generateAudio: false, startFrame: { url: '$file:first.png' }, endFrame: { url: '$file:last.png' } } });
  const { prices } = await policy();
  assert.deepEqual(costOf({ model: 'kling-3-4k', params }, 1, prices), { perTake: 172, total: 172, worstPerTake: 172, worstTotal: 172, basis: priceOf({ model: 'kling-3-4k', params }, prices)!.basis }, '43 per s × 4 s');
  assert.equal(costOf({ model: 'kling-3-4k', params: { ...params, resolution: '1080p' } }, 1, prices), null, 'only 4k has a price');
  // The order check refuses what the tool does not take for it.
  const film = (await drafts()).find((o) => o.id === 'paow-giv-p4')!;
  const as4k = { ...film, status: 'UTKAST', approval: null, generation: { ...film.generation, model: 'kling-3-4k', params } } as Order;
  assert.deepEqual(validateOrder(as4k).errors, []);
  const errors = (o: unknown) => validateOrder(o).errors.join(' ');
  assert.match(errors({ ...as4k, generation: { ...as4k.generation, params: { ...params, resolution: '1080p' } } }), /Upplösningen ska vara 4k för Kling 3\.0 4K/);
  assert.match(errors({ ...as4k, generation: { ...as4k.generation, params: { ...params, duration: 20 } } }), /3–15 s för Kling 3\.0 4K/);
  assert.match(errors({ ...as4k, reference: { status: 'FINNS', clips: [], path: 'assets/x/ref.mp4', sha256: 'a'.repeat(64), seconds: 4, goesTo: 'x', approvedStraight: true } }), /tar ingen referensfilm/);
  const waits = { dealer: 'paow', label: 'mellanbilden' };
  assert.match(errors({ ...as4k, pictures: [...as4k.pictures, { name: 'middle.png', label: 'Mellanbild', goesAs: 'referenceImage', path: null, sha256: null, from: null, waits }] }), /tar ingen mellanbild/);
  assert.equal(MODELS['kling-3-4k'].ratio, undefined, 'no ratio goes out: the schema does not say which shape the film gets');
});

test('cost from the price table, with the worst case where the listed price is higher', async () => {
  const { prices } = await policy();
  assert.deepEqual(priceOf({ model: 'kling-4', params: { resolution: '1080p', duration: 7 } }, prices)?.perTake, 150, '21,3 × 7 = 149,1, rounded up');
  assert.deepEqual(costOf({ model: 'kling-4', params: { resolution: '1080p', duration: 4 } }, 2, prices), { perTake: 86, total: 172, worstPerTake: 94, worstTotal: 188, basis: priceOf({ model: 'kling-4', params: { resolution: '1080p', duration: 4 } }, prices)!.basis });
  assert.deepEqual(costOf({ model: 'kling-4', params: { resolution: '1080p', duration: 7 } }, 2, prices), { perTake: 150, total: 300, worstPerTake: 165, worstTotal: 330, basis: priceOf({ model: 'kling-4', params: { resolution: '1080p', duration: 7 } }, prices)!.basis });
  assert.equal(costOf({ model: 'wan3', params: { resolution: '1080p', duration: 4 } }, 1, prices)?.total, 80, 'the plan: entrance 4 s = 80');
  assert.equal(costOf({ model: 'nano-banana-pro', params: { imageSize: '4K' } }, 2, prices)?.total, 80);
  assert.equal(costOf({ model: 'nano-banana-pro', params: { imageSize: '1K' } }, 1, prices), null, 'no price, no order');
});

test('the policy: switch, cap per order, cap per day, floor on the balance; the worst case counts', async () => {
  // The limits are Jakob's and move (the daily cap went from 1 000 to 8 000 on 2026-11-13); the arithmetic is tested on fixed ones.
  const p = { ...(await policy()), enabled: true, dailyCapCredits: 1000, maxPerOrder: 400, minBalance: 2000 };
  const order = { cost: { perTake: 86, total: 172, worstPerTake: 94, worstTotal: 188, basis: '' } };
  assert.equal(checkPolicy(order, p, 0, 17884).ok, true);
  assert.match(checkPolicy(order, { ...p, enabled: false }, 0, 17884).refusals[0], /avstängda/);
  assert.match(checkPolicy({ cost: { ...order.cost, worstTotal: 401 } }, p, 0, 17884).refusals.join(' '), /taket per beställning är 400/);
  assert.match(checkPolicy(order, p, 900, 17884).refusals.join(' '), /900 av 1000/);
  assert.match(checkPolicy(order, p, 0, 2100).refusals.join(' '), /golvet 2000/);
  const approved = (at: string, total: number) => ({ approval: { by: 'jakob' as const, at, orderSha256: 'x' }, cost: { ...order.cost, worstTotal: total }, status: 'GODKÄND' as const });
  // 23:30 UTC on the 12th is the 13th in Stockholm.
  assert.equal(dayOf('2026-11-12T23:30:00Z'), '2026-11-13');
  assert.equal(spentOn([approved('2026-11-12T10:00:00Z', 100), approved('2026-11-12T23:30:00Z', 50), { approval: null, cost: order.cost, status: 'UTKAST' }], '2026-11-12'), 100);
});

test('the hash covers everything but approval and status, whatever the key order', async () => {
  const [order] = await drafts();
  const approved = { ...order, status: 'GODKÄND', approval: { by: 'jakob', at: '2026-11-12T22:00:00Z', orderSha256: 'a'.repeat(64) } } as Order;
  assert.equal(hashInput(approved), hashInput(order));
  assert.notEqual(hashInput({ ...order, takes: order.takes + 1 }), hashInput(order));
  assert.notEqual(hashInput({ ...order, prompt: { ...order.prompt, text: order.prompt.text + ' ' } }), hashInput(order));
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test('what a person sees: waiting, ready, then the least advanced take; doubt and failure first', async () => {
  const found = (await drafts()).find((o) => o.id === 'paow-ankare-2-1')!;
  const order = { ...found, status: 'UTKAST', approval: null } as Order;
  assert.equal(shownOf(order, [], null), 'KLAR_ATT_TRYCKA');
  assert.equal(shownOf(order, ['x'], null), 'UTKAST');
  // A film whose pictures wait for an anchor, whatever the checkout's own draft has reached.
  const made = (await drafts()).find((o) => o.id === 'paow-giv-p4')!;
  const waits = { dealer: 'paow', role: 'ankare-2.1', node: 'READY', label: 'ankare 2.1' };
  const film = { ...made, status: 'UTKAST', approval: null, pictures: made.pictures.map((p) => ({ ...p, path: null, sha256: null, waits })) } as Order;
  assert.equal(shownOf(film, draftProblems(film), null), 'VÄNTAR');
  const approved = { ...order, status: 'GODKÄND', approval: { by: 'jakob', at: '2026-11-12T22:00:00Z', orderSha256: 'a'.repeat(64) } } as Order;
  const take = (n: number, status: Receipt['takes'][number]['status']) => ({ take: n, status, requestedAt: '2026-11-12T22:01:00Z', taskId: null, history: [] });
  const receipt = (...takes: Receipt['takes']): Receipt => ({ schemaVersion: 1, order: order.id, orderSha256: 'a'.repeat(64), takes });
  assert.equal(shownOf(approved, [], null), 'GODKÄND');
  assert.deepEqual(takeStates(approved, receipt(take(1, 'LAGD'))), ['LAGD', 'GODKÄND']);
  assert.equal(shownOf(approved, [], receipt(take(1, 'HÄMTAD'), take(2, 'LAGD'))), 'LAGD');
  assert.equal(shownOf(approved, [], receipt(take(1, 'HÄMTAD'), take(2, 'OSÄKER'))), 'OSÄKER');
  assert.equal(waitWords([{ dealer: 'paow', label: 'ankare 2.1' }, { dealer: 'paow', label: 'ankare 2.1' }, { dealer: 'paow', label: 'mellanbilden' }]), 'ankare 2.1 och mellanbilden');
});

test('the steps: defaults from the plan, edges in the graph notation, and an order file that lies is refused', () => {
  // A step says what a film is between; how it is ordered is its recipe's alone (data/order-methods.json): no model, length or resolution here.
  for (const s of STEPS) assert.deepEqual(Object.keys(s).filter((k) => ['model', 'duration', 'resolution', 'seconds', 'takes', 'shape'].includes(k)), [], `${s.key}: no ordering default on the step`);
  // A return is its own film from the landing picture (one action per film, 2026-11-13).
  for (const key of ['RETUR-2.1', 'RETUR-2.2', 'RETUR-1'] as const) assert.deepEqual([stepOf(key)?.start, stepOf(key)?.off], ['LAND', undefined], key);
  // A deal's name says where the card goes, not that the hand comes back (the recipe is bara dit).
  for (const s of STEPS.filter((x) => x.card)) assert.doesNotMatch(s.label, /och tillbaka/, s.key);
  // Anchor 2.3 (Jakob 2026-11-18): its entry from rest and the deal with two hands, in the graph as a third pose at the shoe.
  assert.deepEqual([stepOf('INGANG-2.3')?.from, stepOf('INGANG-2.3')?.to, edgeOf(stepOf('INGANG-2.3')!, null)], ['1', '2.3', 'IDLE>READY-C']);
  assert.deepEqual([stepOf('GIV-2.3')?.from, stepOf('GIV-2.3')?.grip, edgeOf(stepOf('GIV-2.3')!, 'P4.C1'), cutIntoOf(stepOf('GIV-2.3')!, 'P4.C1', 'ONE_WAY')], ['2.3', 'TWO_HANDS', 'READY-C>P4.C1', ['READY-C>P4.C1']]);
  assert.deepEqual([model.ANCHOR_NODE['2.3'], model.ANCHOR_ROLE['2.3']], ['READY-C', 'ankare-2.3']);
  assert.deepEqual(STEPS.map((s) => s.key).filter((k) => stepOf(k)?.off), [], 'nothing is switched off now');
  assert.deepEqual(['RETUR-2.1', 'RETUR-2.2', 'RETUR-1'].map((k) => edgeOf(stepOf(k)!, 'P4.C1')), ['P4.C1>READY', 'P4.C1>READY-B', 'P4.C1>IDLE']);
  assert.deepEqual(cutIntoOf(stepOf('GIV-2.1')!, 'P4.C1', 'ROUND_TRIP'), ['READY>P4.C1', 'P4.C1>READY']);
  assert.deepEqual(cutIntoOf(stepOf('GIV-2.1')!, 'P4.C1', 'ONE_WAY'), ['READY>P4.C1'], 'bara dit: the deal alone');
  assert.deepEqual(cutIntoOf(stepOf('RETUR-2.2')!, 'P4.C1', 'ONE_WAY'), ['P4.C1>READY-B']);
  assert.equal(edgeOf(stepOf('GIV-2.1')!, 'P4.C1'), 'READY>P4.C1');
  assert.equal(edgeOf(stepOf('INGANG-2.2')!, null), 'IDLE>READY-B');
  assert.equal(edgeOf(stepOf('ANKARE-2.1')!, null), null);
  assert.equal(stepOf('MELLANBILD'), null, 'the in-between picture (a turn about the short edge) is dropped');
  assert.ok(validateOrder({ schemaVersion: 1 }).errors.length > 3);
});

test('one line on what an order makes: the pictures it goes between, never how she moves', () => {
  assert.equal(summaryOf(stepOf('ANKARE-2.2')!, 'Paow', null), 'Gör Paows ankare 2.2 ur hennes ankare 1.');
  assert.equal(summaryOf(stepOf('GIV-2.1')!, 'Paow', { target: 'P4.C1' }, 'ONE_WAY'), 'Gör en film av Paow: ett kort från ankare 2.1 till plats 4, bara dit.');
  assert.equal(summaryOf(stepOf('GIV-2.2')!, 'Paow', { target: 'P1.C1' }, 'ROUND_TRIP'), 'Gör en film av Paow: ett kort från ankare 2.2 till plats 1, tur och retur.');
  assert.equal(summaryOf(stepOf('GIV-2.3')!, 'Paow', { target: 'D.C2' }, 'ONE_WAY'), 'Gör en film av Paow: ett kort från ankare 2.3 till dealerns hålkort, bara dit.');
  assert.equal(summaryOf(stepOf('RETUR-2.2')!, 'Paow', { target: 'P4.C1' }), 'Gör en film av Paow: från kortet på plats 4 till ankare 2.2.');
  assert.equal(summaryOf(stepOf('INGANG-2.3')!, 'Paow', null), 'Gör en film av Paow: från ankare 1 till ankare 2.3.');
  assert.equal(summaryOf(stepOf('UTGANG-2.2')!, 'Paow', null), 'Gör en film av Paow: från ankare 2.2 till ankare 1.');
  assert.equal(summaryOf(stepOf('HALKORT')!, 'Paow', null), 'Gör en film av Paow: hålkortet vänds upp, från och till ankare 1.');
  assert.equal(summaryOf(stepOf('VILA')!, 'Paow', null), 'Gör en vilofilm av Paow: från och till ankare 1.');
  // Only what is sent is described (Jakob 2026-11-17): no line of a new order says how the hand or the card moves, and the
  // model holds no description of a choice beside its name. The movement is said by the text that is sent and by nothing else.
  for (const s of STEPS) for (const shape of ['ONE_WAY', 'ROUND_TRIP'] as const) assert.doesNotMatch(summaryOf(s, 'Paow', { target: 'P4.C1' }, shape), /hand|vrid|vänd(?!s upp)|släpa|nyp|lägg|handled|öppet|stängt|baksida/i, s.key);
  for (const gone of ['FLIP_ABOUT', 'HAND_ABOUT', 'SHAPE_ABOUT', 'LANDS_ABOUT', 'startWords', 'dealWords']) assert.ok(!(gone in model), `${gone} is gone: it described the movement and was never sent`);
  // The names of the choices stay: a name, not a description.
  assert.deepEqual([FLIP_LABEL.FREE, HAND_LABEL.PASS, LANDS_LABEL.FRONT, SHAPE_LABEL.ONE_WAY], ['Handleden vänder kortet på vägen', 'Handbyte', 'Stängt → öppet', 'Bara dit']);
  assert.equal(genitive('Agnes'), 'Agnes');
  assert.equal(seatWords('D.C1'), 'dealerns plats');
  assert.equal(seatWords('P2.C2'), 'plats 2, kort 2');
});

test('the hand: left, right or handbyte (left to right), stored as the plan stores it', () => {
  assert.deepEqual(handsOf('PASS'), { hand: 'LH', pass: true });
  assert.deepEqual(handsOf('RH'), { hand: 'RH', pass: false });
  assert.equal(handChoiceOf({ hand: 'LH', pass: true }), 'PASS');
  assert.equal(handChoiceOf({ hand: 'LH' }), 'LH', 'an older order without pass is left all the way');
  // Placering rules (Jakob 2026-11-13, "vi ska beställa via den primärt"): the plan's "Var kortet vänds" sets the turn.
  assert.equal(defaultFlip('GIV-2.1'), 'FREE', 'without the plan\'s word the hand turns it as it can');
  assert.equal(defaultFlip('GIV-2.1', 'AIR'), 'FREE');
  assert.equal(defaultFlip('GIV-2.2'), 'FREE');
  assert.equal(defaultFlip('GIV-2.1', 'PLACE'), 'AT_PLACE', 'where the plan turns the card at its place');
  assert.equal(defaultFlip('GIV-2.2', 'PLACE'), 'AT_PLACE');
  // the plan's turn on the way (Rörelse, "Hur kortet vänds", 2026-11-17): the wrist or like a key; at the place it is AT_PLACE whatever the axis
  assert.equal(defaultFlip('GIV-2.1', 'AIR', 'LONG_EDGE'), 'LONG_EDGE');
  assert.equal(defaultFlip('GIV-2.1', 'AIR', 'FREE'), 'FREE');
  assert.equal(defaultFlip('GIV-2.2', 'PLACE', 'LONG_EDGE'), 'AT_PLACE');
  // what Placering said, as an order keeps it, and where a deal differs from it
  assert.deepEqual(plannedOf({ grip: 'PINCH', turnAt: 'AIR', flipAxis: 'LONG_EDGE', side: 'FRONT' }), { grip: 'PINCH', flipAxis: 'LONG_EDGE' });
  assert.deepEqual(plannedOf({ grip: 'DRAG', turnAt: 'PLACE', flipAxis: 'FREE', side: 'FRONT' }), { grip: 'DRAG', flipAxis: 'AT_PLACE' });
  assert.deepEqual(plannedOf({ grip: 'PINCH', turnAt: 'AIR', flipAxis: 'FREE', side: 'BACK' }), { grip: 'PINCH', flipAxis: null }, 'laid closed: no turn');
  assert.deepEqual(plannedDiffers({ grip: 'DRAG', turn: true, flipAxis: 'FREE' }, { grip: 'PINCH', flipAxis: 'FREE' }), ['grip'], 'GIV-2.2 where the plan says nyp');
  assert.deepEqual(plannedDiffers({ grip: 'PINCH', turn: true, flipAxis: 'AT_PLACE' }, { grip: 'PINCH', flipAxis: 'LONG_EDGE' }), ['turn']);
  assert.deepEqual(plannedDiffers({ grip: 'PINCH', turn: false, flipAxis: null }, { grip: 'PINCH', flipAxis: 'FREE' }), [], 'a card laid closed has no turn to differ in');
  assert.deepEqual(plannedDiffers({ grip: 'PINCH', turn: true, flipAxis: 'FREE' }, undefined), [], 'an order from before 2026-11-17 says nothing');
  const order = { schemaVersion: 1, id: 'x', title: 'x', dealer: 'paow', kind: 'FILM', step: { key: 'GIV-2.1' }, pictures: [], generation: {}, prompt: {}, takes: 1, cost: {}, reference: {}, status: 'UTKAST', approval: null, notes: [] };
  const motion = { grip: 'PINCH', hand: 'RH', pass: true, turn: true, flipAxis: 'AT_PLACE', target: 'P1.C1', side: 'FRONT', fromPlan: false };
  assert.match(validateOrder({ ...order, motion }).errors.join(' '), /handbyte går från vänster hand till höger/);
  assert.doesNotMatch(validateOrder({ ...order, motion: { ...motion, hand: 'LH' } }).errors.join(' '), /motion/);
  assert.match(validateOrder({ ...order, motion: { ...motion, hand: 'LH', side: 'UP' } }).errors.join(' '), /motion: hand/);
  assert.match(validateOrder({ ...order, motion: { ...motion, hand: 'LH', grip: 'SLIDE' } }).errors.join(' '), /grip \(PINCH\/DRAG\/TWO_HANDS\)/, 'the grip is checked too');
  assert.doesNotMatch(validateOrder({ ...order, motion: { ...motion, hand: 'LH', pass: false, grip: 'TWO_HANDS' } }).errors.join(' '), /motion/, 'the deal with two hands from anchor 2.3');
  // what Placering said for the card: its grip and its turn (or null), nothing else
  assert.doesNotMatch(validateOrder({ ...order, motion: { ...motion, hand: 'LH', planned: { grip: 'DRAG', flipAxis: 'LONG_EDGE' } } }).errors.join(' '), /motion/);
  assert.doesNotMatch(validateOrder({ ...order, motion: { ...motion, hand: 'LH', planned: { grip: 'PINCH', flipAxis: null } } }).errors.join(' '), /motion/);
  for (const planned of [{ grip: 'SLIDE', flipAxis: null }, { grip: 'PINCH', flipAxis: 'SHORT_EDGE' }, { grip: 'PINCH' }, { grip: 'PINCH', flipAxis: null, hand: 'LH' }, 'PINCH', null])
    assert.match(validateOrder({ ...order, motion: { ...motion, hand: 'LH', planned } }).errors.join(' '), /motion\.planned/, JSON.stringify(planned));
});

test('the seats where the left hand would cross her body, from the plan alone', async () => {
  const plan = JSON.parse(await readFile('placements/default.json', 'utf8'));
  // The plan's points in film pixels (the order's own drawing is tested in tools/order-routes.test.ts).
  const x = (t: string) => plan.targets[t].geometry.native.u * 1763;
  const centres = Object.fromEntries(Object.keys(plan.targets).map((t) => [t, [x(t), 0] as [number, number]]));
  const line = bodyLine(centres, { 'P4.C1': [[0, 0], [87, 0], [87, 70], [0, 70]] });
  assert.ok(Math.abs(line.midline - 882) < 5, `her midline between the dealer's two cards: ${line.midline}`);
  assert.equal(line.halfCard, 43.5);
  assert.deepEqual(ALL_SEVEN.filter((t) => crossesBody(x(t), line)), ['P1.C1', 'P2.C1', 'P3.C1'], 'P4 lies in front of her');
  assert.equal(crossesBody(x('D.C1'), line), false);
  assert.deepEqual(bodyLine({}, {}), { midline: 881.5, halfCard: 43.5 });
  assert.equal(seatList(['P1.C1', 'P2.C1', 'P3.C1']), 'plats 1–3');
  assert.equal(seatList(['P1.C1', 'P3.C1']), 'plats 1 och 3');
  assert.equal(seatList(['P5.C1', 'D.C1']), 'plats 5 och dealerns plats');
});

test('a group of drafts against the limits: what all cost and how many fit today', async () => {
  const p = { ...(await policy()), enabled: true, dailyCapCredits: 1000, maxPerOrder: 400, minBalance: 2000 };
  // Alla sju from 2.2 with two takes: WAN 3, 6 s, 1080p = 120 per take, 240 per draft.
  const cost = costOf({ model: 'wan3', params: { resolution: '1080p', duration: 6 } }, 2, p.prices)!;
  assert.deepEqual([cost.total, cost.worstTotal], [240, 240]);
  const seven = groupBudget(cost, 7, p, 0, 17884);
  assert.deepEqual([seven.total, seven.worstTotal, seven.fitToday, seven.fitBalance, seven.overPerOrder], [1680, 1680, 4, 7, false]);
  assert.match(seven.words[0], /räcker till 4 av 7 i dag/);
  assert.equal(groupBudget(cost, 7, p, 900, 17884).fitToday, 0);
  assert.match(groupBudget(cost, 3, p, 0, 17884).words[0], /^Ryms i dagens tak: 720 av 1 000/);
  assert.equal(groupBudget({ total: 300, worstTotal: 450 }, 2, p, 0, 17884).overPerOrder, true);
  assert.match(groupBudget(cost, 7, p, 0, 2600).words.join(' '), /räcker till 2 av 7 över golvet 2 000/);
  assert.match(groupBudget(cost, 7, { ...p, enabled: false }, 0, 17884).words[0], /avstängda/);
});

test('the text style: Kort for every new order, no minimal still, never Utförlig; Utförlig only read for an order made before template 4', () => {
  assert.deepEqual([defaultStyle('FILM'), defaultStyle('STILL')], ['KORT', 'KORT']);
  assert.deepEqual(stylesFor('STILL'), ['KORT']);
  assert.deepEqual(stylesFor('FILM'), ['KORT', 'MINIMAL']);
  // A new order cannot be written in the long text: no step offers it (Jakob 2026-11-17, its words go against today's rules).
  for (const s of STEPS) assert.ok(!stylesFor(s.kind, s).includes('UTFÖRLIG'), `${s.key}: no long text for a new order`);
  assert.ok(TEXT_STYLES.includes('UTFÖRLIG'), 'a stored order in the long text still reads');
  assert.equal(styleOf({}), 'UTFÖRLIG', 'no style: the long text of template 3');
  assert.equal(styleOf({ style: 'MINIMAL' }), 'MINIMAL');
  const order = { schemaVersion: 1, id: 'x', title: 'x', dealer: 'paow', kind: 'FILM', step: { key: 'GIV-2.1', shape: 'ONE_WAY' }, pictures: [], generation: {}, prompt: { text: '', sha256: '', extra: null, style: 'LÅNG' }, takes: 1, cost: {}, reference: {}, status: 'UTKAST', approval: null, notes: [] };
  assert.match(validateOrder(order).errors.join(' '), /prompt\.style ska vara KORT, MINIMAL eller UTFÖRLIG/);
  assert.match(validateOrder({ ...order, step: { key: 'GIV-2.1', shape: 'BOTH' } }).errors.join(' '), /step\.shape/);
});

test('the landing picture: role landning, LAND(<seat>), gäller, the card on that seat; what is missing otherwise', () => {
  const e = (id: string, node: string, state: string | undefined, card: string) => ({ id, role: 'landning', node, state, card });
  const entries = [e('a', 'LAND(P4.C1)', 'kandidat', 'P4.C1'), e('b', 'RELEASE(P4.C1)', 'gäller', 'P4.C1'), e('c', 'LAND(P4.C1)', 'gäller', 'P4.C1'), { id: 'd', role: 'ankare-2.1', node: 'READY', state: 'gäller' }];
  assert.equal(landingOf(entries, 'P4.C1')?.id, 'c');
  assert.equal(landingOf(entries, 'P1.C1'), null);
  assert.equal(landingOf(entries, null), null);
  assert.match(landingMissing('Paow', 'P1.C1'), /^Ingen landningsbild gäller för Paows plats 1\. En retur som egen film börjar på den: gör en gällande i Material \(roll landning, LAND\(P1\.C1\)\)/);
});

test('a deal bara dit ends on THAT seat\'s own end picture: its landing picture, else the cut frame of the bank\'s film there; a seat with neither says so', () => {
  const landing = (id: string, target: string, state = 'gäller') => ({ id, name: `Plats ${target[1]}, landning`, role: 'landning', node: `LAND(${target})`, state, card: target });
  const straight = { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-13: bra' };
  const trip = (clip: string, target: string, cut: number, node = 'READY') => [{ id: `${clip}-deal`, from: node, to: target, clip, frames: [0, cut] as [number, number], dealer: 'paow' }, { id: `${clip}-return`, from: target, to: node, clip, frames: [cut + 1, cut + 60] as [number, number], dealer: 'paow' }];
  const bank: BankFacts = {
    derived: [...trip('paow-giv-2-1-p4-04-01', 'P4.C1', 108), ...trip('paow-giv-2-1-p1-06-01', 'P1.C1', 112), ...trip('paow-giv-2-2-p4-01-01', 'P4.C1', 126, 'READY-B')],
    motions: { 'paow-giv-2-1-p4-04-01-return': { review: straight }, 'paow-giv-2-1-p1-06-01-return': { review: straight }, 'paow-giv-2-2-p4-01-01-return': { review: straight } },
  };
  const pinch = stepOf('GIV-2.1')!, drag = stepOf('GIV-2.2')!, two = stepOf('GIV-2.3')!;
  const end = (entries: ReturnType<typeof landing>[], step: typeof pinch, target: string, hand?: 'LH' | 'RH', from = bank) => seatEndOf(entries, from, { dealer: 'paow', step, target, hand });
  // The seat's landing picture first; one seat's picture never stands in for another seat.
  const p4 = [landing('paow-landning-p4', 'P4.C1')];
  assert.deepEqual(end(p4, pinch, 'P4.C1'), { kind: 'LANDNING', entry: p4[0] });
  assert.equal(end(p4, pinch, 'P1.C1')?.kind, 'SNITTRUTA', 'seat 1 does not end on seat 4\'s picture');
  assert.equal(end(p4, pinch, 'P5.C1'), null, 'no landing picture and no film of its own: no end picture');
  // A landing picture set aside does not hold: the seat then ends on the cut frame of the bank's own film from the same anchor.
  const aside = [landing('paow-landning-p4', 'P4.C1', 'ersatt')];
  const cut = end(aside, pinch, 'P4.C1');
  assert.deepEqual(cut && cut.kind === 'SNITTRUTA' ? [cut.cut.clip, cut.cut.frame, cut.cut.ret] : null, ['paow-giv-2-1-p4-04-01', 108, 'paow-giv-2-1-p4-04-01-return']);
  const dragged = end([], drag, 'P4.C1');
  assert.deepEqual(dragged && dragged.kind === 'SNITTRUTA' ? [dragged.cut.clip, dragged.cut.frame] : null, ['paow-giv-2-2-p4-01-01', 126], 'the drag ends on the drag\'s own film');
  assert.equal(end([], drag, 'P1.C1'), null, 'the pinch\'s film to seat 1 is no end for the drag');
  // The hand that lays the card: a cut frame laid with the left is no end for a handbyte or for the two-hand deal from 2.3.
  assert.equal(end([], pinch, 'P4.C1', 'RH'), null);
  assert.equal(end([], two, 'P4.C1', 'RH'), null);
  assert.equal(seatEndOf([], null, { dealer: 'paow', step: pinch, target: 'P4.C1' }), null, 'no bank read: no cut frame');
  // An archived take is out of play: neither its deal nor its return gives a last frame.
  const archived = { ...bank, motions: { ...bank.motions, 'paow-giv-2-1-p4-04-01-return': { review: { ...straight, archived: { by: 'Jakob', where: 'Karta' } } } } };
  assert.equal(isArchived(archived, 'paow-giv-2-1-p4-04-01-return'), true);
  assert.equal(end([], pinch, 'P4.C1', 'LH', archived), null);
  assert.equal(end([], pinch, 'P4.C1', 'LH', { ...bank, motions: { ...bank.motions, 'paow-giv-2-1-p4-04-01': { review: { archived: { by: 'Jakob' } } } } }), null, 'the whole film archived');
  // A cut frame whose picture check is written down as not holding (its card lies off the plan's card) is no end picture:
  // the next film's frame is taken, and a seat whose every frame fails has none. A frame not written down is offered.
  const checks = readCutChecks({ frames: [
    { clip: 'paow-giv-2-1-p4-04-01', frame: 108, target: 'P4.C1', holds: false, problems: ['kortet ligger 12 px från planens'], windowPrinted: true, offFromPlan: 12 },
    { clip: 'paow-giv-2-1-p1-06-01', frame: 112, target: 'P1.C1', holds: true, problems: [], windowPrinted: false, offFromPlan: 2 },
    { clip: 'utan-ruta', target: 'P4.C1', holds: false }, 'skräp',
  ] });
  assert.deepEqual(Object.keys(checks), [cutCheckKey('paow-giv-2-1-p4-04-01', 108, 'P4.C1'), 'paow-giv-2-1-p1-06-01@112>P1.C1'], 'what does not hold its shape is left out');
  assert.deepEqual(checks['paow-giv-2-1-p4-04-01@108>P4.C1'], { holds: false, problems: ['kortet ligger 12 px från planens'], windowPrinted: true, offFromPlan: 12 });
  assert.deepEqual(readCutChecks(null), {});
  const checked = { ...bank, cutChecks: checks };
  assert.equal(end([], pinch, 'P4.C1', 'LH', checked), null, 'seat 4\'s only frame from the pinch does not hold');
  assert.equal(end([], pinch, 'P1.C1', 'LH', checked)?.kind, 'SNITTRUTA');
  assert.equal(end([], drag, 'P4.C1', 'LH', checked)?.kind, 'SNITTRUTA', 'the drag\'s own frame is not written down: offered');
  assert.equal(end(p4, pinch, 'P4.C1', 'LH', checked)?.kind, 'LANDNING', 'a landing picture that holds needs no frame');
  // In words: which picture, or plainly that there is none and the two ways to get one.
  assert.equal(seatEndWords(end(p4, pinch, 'P4.C1')), 'landningsbilden Plats 4, landning');
  assert.equal(seatEndWords(cut), 'ruta 108 ur paow-giv-2-1-p4-04-01, där returen börjar (Jakob: ”bra”)');
  assert.equal(seatEndWords(null), 'ingen slutbild');
  assert.equal(seatEndMissing('Paow', 'P5.C1', '2.1'), 'Plats 5 har ingen slutbild för Paows giv från ankare 2.1: ingen landningsbild gäller för platsen, och banken har ingen egen film dit vars retur du har godkänt rakt. Gör en landningsbild för platsen gällande i Material, eller godkänn en retur från platsen i Granska.');
  // Laid with the right hand (a handbyte, or from anchor 2.3): a landing picture for the left hand may hold, so the hand is said.
  assert.equal(seatEndMissing('Paow', 'P4.C1', '2.1', 'RH'), 'Plats 4 har ingen slutbild för Paows giv från ankare 2.1 med höger hand vid kortet: ingen landningsbild för höger hand gäller för platsen, och banken har ingen egen film dit, lagd med höger hand, vars retur du har godkänt rakt. Gör en landningsbild för platsen med höger hand vid kortet gällande i Material, eller godkänn en sådan retur från platsen i Granska.');
});

test('a reference film from the bank: the same step and seat first, the dealer\'s own before another\'s, a rejected take last; length against the model', () => {
  const review = (decision: string, extra: Record<string, unknown> = {}) => ({ review: { decision, ...extra } });
  const source = (frames: number, fps: number) => ({ source: { frames, fps, sha256: 'f'.repeat(64) } });
  const bank: BankFacts = {
    jobs: [
      { id: 'pamela-p4-c1-plan-deal-02', from: 'READY', to: 'RELEASE(P4.C1)', duration: 4 },
      { id: 'pamela-p4-c1-plan-deal-01', from: 'READY', to: 'RELEASE(P4.C1)', duration: 4 },
      { id: 'pamela-p4-c1-readyb-deal-01', from: 'READY-B', to: 'LAND(P4.C1)', duration: 5 },
      { id: 'pamela-p1-c1-plan-deal-02', from: 'READY', to: 'LAND(P1.C1)', duration: 4 },
      { id: 'pamela-idle-ready-entry-01', from: 'IDLE', to: 'READY', duration: 2 },
      { id: 'pamela-p4-c1-drawn-deal-01', from: 'DRAWN', to: 'LAND(P4.C1)', duration: 4 },
    ],
    derived: [
      { id: 'paow-giv-p4-02-deal', from: 'READY', to: 'P4.C1', clip: 'paow-giv-p4-02', frames: [0, 104], dealer: 'paow' },
      { id: 'paow-giv-p4-02-return-ready', from: 'P4.C1', to: 'READY', clip: 'paow-giv-p4-02', frames: [105, 168], dealer: 'paow' },
      { id: 'paow-giv-p4-01-deal', from: 'READY', to: 'P4.C1', clip: 'paow-giv-p4-01', frames: [0, 102], dealer: 'paow' },
    ],
    motions: {
      'pamela-p4-c1-plan-deal-02': { ...source(120, 30), ...review('ACCEPTED', { userAccepted: true, userReview: 'Jakob 2026-11-11: Det ser bra ut.' }) },
      'pamela-p4-c1-plan-deal-01': { ...source(120, 30), ...review('REJECTED') },
      'pamela-idle-ready-entry-01': source(60, 30),
      'paow-giv-p4-02-deal': { ...source(169, 24), ...review('ACCEPTED', { userAccepted: true, userReview: 'Jakob 2026-11-13: Denna är bra' }) },
      'paow-giv-p4-01-deal': { ...source(169, 24), ...review('REJECTED') },
    },
  };
  const list = referenceCandidates(bank, { dealer: 'paow', step: stepOf('GIV-2.1')!, target: 'P4.C1', model: MODELS['kling-4'] });
  assert.deepEqual(list.map((c) => [c.take, c.match, c.dealer, c.verdict]), [
    ['paow-giv-p4-02-deal', 0, 'paow', 'GODKÄND'],
    ['pamela-p4-c1-plan-deal-02', 0, 'pamela', 'GODKÄND'],
    ['paow-giv-p4-01-deal', 0, 'paow', 'UNDERKÄND'],
    ['pamela-p4-c1-plan-deal-01', 0, 'pamela', 'UNDERKÄND'],
    ['pamela-p4-c1-drawn-deal-01', 1, 'pamela', 'EJ_DÖMD'],
    ['pamela-p4-c1-readyb-deal-01', 1, 'pamela', 'EJ_DÖMD'],
    ['pamela-p1-c1-plan-deal-02', 2, 'pamela', 'EJ_DÖMD'],
  ], 'one per film; the film from the drawn-out pose is a drag to the seat (the other grip here); the entry is another step');
  // For the drag itself that film is the same step and seat (trial 2A held with it as the reference).
  assert.deepEqual(referenceCandidates(bank, { dealer: 'paow', step: stepOf('GIV-2.2')!, target: 'P4.C1', model: MODELS['kling-4'] }).filter((c) => c.match === 0).map((c) => c.take), ['pamela-p4-c1-drawn-deal-01', 'pamela-p4-c1-readyb-deal-01']);
  const own = list[0];
  assert.deepEqual([own.film, own.path, own.seconds, own.frames, own.also, own.fits, own.words], ['paow-giv-p4-02', 'assets/motions/paow-giv-p4-02/source.mp4', 7.042, [0, 104], ['paow-giv-p4-02-return-ready'], true, 'Denna är bra']);
  assert.deepEqual([list[1].seconds, list[1].frames, list[1].approvedStraight, list[1].goesTo], [4, null, true, 'P4.C1']);
  // The entry: Kling 4 takes 3–30 s, so the bank's 2-s entry is offered but does not fit.
  const entry = referenceCandidates(bank, { dealer: 'paow', step: stepOf('INGANG-2.1')!, target: null, model: MODELS['kling-4'] });
  assert.deepEqual(entry.map((c) => [c.take, c.seconds, c.fits]), [['pamela-idle-ready-entry-01', 2, false]]);
  // A return: the return to the same anchor and seat.
  assert.deepEqual(referenceCandidates(bank, { dealer: 'paow', step: stepOf('RETUR-2.1')!, target: 'P4.C1' }).map((c) => c.take), ['paow-giv-p4-02-return-ready']);
  // A film the lab does not have is not offered.
  assert.equal(referenceCandidates({ ...bank, media: { 'paow-giv-p4-02-deal': { video: null } } }, { dealer: 'paow', step: stepOf('GIV-2.1')!, target: 'P4.C1' })[0].take, 'pamela-p4-c1-plan-deal-02');
  assert.deepEqual(verdictOf({ decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true }), { verdict: 'VARIANT', straight: false, words: null });
  // The order check: the film lies in the order's folder, with its hash, within the model's lengths.
  const film = { schemaVersion: 1, id: 'x', title: 'x', dealer: 'paow', kind: 'FILM', step: { key: 'GIV-2.1' }, pictures: [{ name: 'first.png', label: 'f', goesAs: 'startFrame', path: 'assets/orders/x/first.png', sha256: 'a'.repeat(64), from: null }], generation: { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 7 } }, prompt: { template: 't', text: 'T', sha256: 's', extra: null, middle: false }, takes: 1, cost: { total: 1, worstTotal: 1 }, status: 'UTKAST', approval: null, notes: [] };
  const ref = { status: 'FINNS', clips: ['pamela-p4-c1-plan-deal-02'], path: 'assets/orders/x/reference.mp4', sha256: 'b'.repeat(64), seconds: 4, goesTo: 'P4.C1', approvedStraight: true, dealer: 'pamela' };
  assert.deepEqual(validateOrder({ ...film, reference: ref }).errors, []);
  assert.match(validateOrder({ ...film, reference: { ...ref, path: 'assets/motions/p/source.mp4' } }).errors.join(' '), /filmen ska ligga i assets\/orders\/<id>\//);
  assert.match(validateOrder({ ...film, reference: { ...ref, seconds: 2 } }).errors.join(' '), /3–30 s för Kling 4/);
  assert.deepEqual(requestOf({ ...film, reference: ref } as unknown as Order, 1).args.referenceVideos, [{ url: '$file:reference.mp4', durationSeconds: 4 }]);
});

test('a card size for one order: grown about its centre, stopped at the picture\'s edge as the plan stops a card', () => {
  const q: [number, number][] = [[100, 100], [200, 100], [200, 180], [100, 180]];
  assert.deepEqual(scaleQuad(q, 1.5), { quad: [[75, 80], [225, 80], [225, 200], [75, 200]], factor: 1.5 });
  const edge = scaleQuad([[10, 500], [60, 500], [60, 540], [10, 540]], 2);
  assert.equal(edge.factor, 1.4, 'the left corners meet x 0 at 1,4');
  assert.equal(Math.min(...edge.quad.map((p) => p[0])), 0);
  assert.deepEqual([scaleWords(1), scaleWords(1.5), scaleWords(undefined)], ['som planen', '150 %', 'som planen']);
  assert.deepEqual([...CARD_SCALES], [1, 1.25, 1.5, 2]);
  const order = { schemaVersion: 1, id: 'x', title: 'x', dealer: 'paow', kind: 'FILM', step: { key: 'GIV-2.1', shape: 'ROUND_TRIP' }, pictures: [], generation: {}, prompt: {}, takes: 1, cost: {}, reference: {}, status: 'UTKAST', approval: null, notes: [] };
  const motion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', target: 'P4.C1', side: 'FRONT', fromPlan: true };
  assert.match(validateOrder({ ...order, step: { key: 'GIV-2.1', shape: 'ONE_WAY' }, motion: { ...motion, cardScale: 1.5 } }).errors.join(' '), /cardScale gäller bara tur och retur/);
  // A choice that does not apply: a turn stored for a card that is not turned; an approved order keeps what it had.
  assert.match(validateOrder({ ...order, motion: { ...motion, turn: false, side: 'BACK' } }).errors.join(' '), /ingen vändning lagras/);
  assert.doesNotMatch(validateOrder({ ...order, status: 'GODKÄND', approval: { by: 'jakob', at: 'x', orderSha256: 'a'.repeat(64) }, motion: { ...motion, turn: false, side: 'BACK' } }).errors.join(' '), /vändning/);
  assert.deepEqual(tidyMotion({ ...motion, turn: false, side: 'BACK' } as never)!.flipAxis, null);
  assert.doesNotMatch(validateOrder({ ...order, motion: { ...motion, cardScale: 1.5 } }).errors.join(' '), /cardScale/);
  assert.match(validateOrder({ ...order, motion: { ...motion, cardScale: 3 } }).errors.join(' '), /motion\.cardScale ska vara 1, 1\.25, 1\.5, 2/);
});

test('the steps a round needs: the hole card as a deal\'s target, its turn from rest with only the hole card drawn, and the way out', () => {
  // The dealer's second card is a seat a deal goes to; it lands closed, as the plan says, and is the hole card in words.
  assert.ok(SEAT_TARGETS.includes('D.C2'));
  assert.ok(!ALL_SEVEN.includes('D.C2'), '"Alla sju" stays the players');
  assert.equal(seatWords('D.C2'), 'dealerns hålkort');
  assert.equal(seatWords('D.C1'), 'dealerns plats', 'the dealer\'s first card keeps its words');
  const give = stepOf('GIV-2.1')!;
  assert.equal(edgeOf(give, 'D.C2'), 'READY>D.C2');
  assert.deepEqual(cutIntoOf(give, 'D.C2', 'ROUND_TRIP'), ['READY>D.C2', 'D.C2>READY']);
  assert.match(summaryOf(give, 'Paow', { target: 'D.C2' }, 'ONE_WAY'), /ett kort från ankare 2\.1 till dealerns hålkort, bara dit/);
  // The hole card turned open from rest and back to rest: IDLE>REVEAL(D.C2), the card fixed, both pictures with that card
  // alone (the game draws every lying card itself; with both drawn she lifted both, round 6).
  const turn = stepOf('HALKORT')!;
  assert.deepEqual([turn.kind, turn.from, turn.to, turn.card, turn.target], ['FILM', '1', '1', false, 'D.C2']);
  assert.equal(edgeOf(turn, null), 'IDLE>REVEAL(D.C2)');
  assert.deepEqual(cutIntoOf(turn, null, 'ONE_WAY'), [], 'one edge, its step.edge');
  assert.deepEqual(turn.cards, [{ target: 'D.C2', before: 'BACK', after: 'FRONT' }]);
  assert.match(summaryOf(turn, 'Paow', null), /hålkortet vänds upp, från och till ankare 1/);
  // The way out: anchor 2.1 to anchor 1, READY>IDLE.
  const out = stepOf('UTGANG')!;
  assert.deepEqual([out.from, out.to, out.card, edgeOf(out, null)], ['2.1', '1', false, 'READY>IDLE']);
  // The way out from the drag: anchor 2.2 to anchor 1, READY-B>IDLE (a round through 2.2 goes by rest, 2026-11-13).
  const outDrag = stepOf('UTGANG-2.2')!;
  assert.deepEqual([outDrag.kind, outDrag.from, outDrag.to, outDrag.card, edgeOf(outDrag, null)], ['FILM', '2.2', '1', false, 'READY-B>IDLE']);
  assert.deepEqual(cutIntoOf(outDrag, null, 'ONE_WAY'), [], 'one edge');
  assert.match(summaryOf(outDrag, 'Paow', null), /från ankare 2\.2 till ankare 1/);
  // Short or minimal only, as every new film; a still Kort only.
  for (const s of [turn, out, outDrag]) assert.deepEqual(stylesFor(s.kind, s), ['KORT', 'MINIMAL']);
  assert.deepEqual(stylesFor('FILM', stepOf('VILA')), ['KORT', 'MINIMAL']);
  assert.deepEqual(stylesFor('STILL'), ['KORT']);
  // A reference film is chosen from the bank's takes of that edge.
  const bank: BankFacts = { jobs: [{ id: 'pamela-reveal-01', from: 'IDLE', to: 'REVEAL(D.C2)', duration: 4 }], motions: { 'pamela-reveal-01': { source: { frames: 120, fps: 30 }, review: { decision: 'ACCEPTED', userAccepted: true } } } };
  assert.deepEqual(referenceCandidates(bank, { dealer: 'paow', step: turn, target: null, model: MODELS['kling-4'] }).map((c) => [c.take, c.match, c.approvedStraight]), [['pamela-reveal-01', 0, true]]);
});

test('the last picture of a deal bara dit by rule: the cut frame of a round trip whose return Jakob approved straight, with the same hand', () => {
  // A made-up bank in the real bank's form: Paow's round trips cut into deal and return (data/clip-jobs.json derived).
  const cut = (clip: string, from: string, to: string, at: number, end: number) => [
    { id: `${clip}-deal`, kind: 'DEAL', from, to, clip, frames: [0, at] as [number, number], dealer: 'paow' },
    { id: `${clip}-return`, kind: 'RETURN', from: to, to: from, clip, frames: [at + 1, end] as [number, number], dealer: 'paow' },
  ];
  const review = (decision: string, extra: Record<string, unknown> = {}) => ({ review: { decision, userAccepted: decision !== 'REJECTED', userReview: 'Jakob 2026-11-13: Bra.', ...extra } });
  const bank: BankFacts = {
    derived: [...cut('p4-a', 'READY', 'P4.C1', 108, 168), ...cut('p4-b', 'READY', 'P4.C1', 103, 168), ...cut('p4-c', 'READY', 'P4.C1', 93, 168), ...cut('p4-d', 'READY', 'P4.C1', 100, 168),
      ...cut('p4-e', 'READY', 'P4.C1', 97, 168), ...cut('slap-p4', 'READY-B', 'P4.C1', 126, 177), ...cut('p1-rh', 'READY', 'P1.C1', 137, 168),
      { id: 'pamela-p4-deal', kind: 'DEAL', from: 'READY', to: 'P4.C1', clip: 'pamela-p4', frames: [0, 90], dealer: 'pamela' }, { id: 'pamela-p4-return', kind: 'RETURN', from: 'P4.C1', to: 'READY', clip: 'pamela-p4', frames: [91, 150], dealer: 'pamela' }],
    motions: {
      'p4-a-return': review('ACCEPTED', { acceptedAs: 'MAIN' }), 'p4-a-deal': review('ACCEPTED', { acceptedAs: 'MAIN' }),
      'p4-b-return': review('ACCEPTED'), 'p4-b-deal': review('ACCEPTED', { acceptedAs: 'MAIN' }),
      'p4-c-return': review('ACCEPTED', { acceptedAs: 'VARIANT' }),
      'p4-d-return': { review: { decision: 'ACCEPTED', userAccepted: false, provisional: { by: 'huvudagent' } } },
      'p4-e-return': review('REJECTED'),
      'slap-p4-return': review('ACCEPTED'),
      'p1-rh-return': { ...review('ACCEPTED', { acceptedAs: 'MAIN' }), motion: { releaseHand: 'RH' } },
      'pamela-p4-return': review('ACCEPTED'),
    },
  };
  const step = (key: string) => STEPS.find((s) => s.key === key)!;
  const of = (key: string, target: string | null, hand?: 'LH' | 'RH') => cutFrameOf(bank, { dealer: 'paow', step: step(key), target, hand }).map((c) => [c.clip, c.frame, c.ret]);
  // Primär return first, then the film whose deal is Primär; a variant, one given in his place, a rejected one and another
  // dealer's film are left out.
  assert.deepEqual(of('GIV-2.1', 'P4.C1'), [['p4-a', 108, 'p4-a-return'], ['p4-b', 103, 'p4-b-return']]);
  // From anchor 2.2 only the drag's own films; the frame is the deal's last, the return starts on the next.
  assert.deepEqual(of('GIV-2.2', 'P4.C1'), [['slap-p4', 126, 'slap-p4-return']]);
  // The same hand: a Primär return laid with the right hand after a handover does not end a left-hand deal.
  assert.deepEqual(of('GIV-2.1', 'P1.C1'), []);
  assert.deepEqual(of('GIV-2.1', 'P1.C1', 'RH'), [['p1-rh', 137, 'p1-rh-return']]);
  // Only a deal: a return, a still and a deal without a seat have none.
  assert.deepEqual(of('RETUR-2.1', 'P4.C1'), []);
  assert.deepEqual(of('ANKARE-2.1', 'P4.C1'), []);
  assert.deepEqual(of('GIV-2.1', null), []);
  const [first] = cutFrameOf(bank, { dealer: 'paow', step: step('GIV-2.2'), target: 'P4.C1' });
  assert.equal(first.path, 'assets/motions/slap-p4/source.mp4');
  assert.equal(cutFrameWords(first), 'ruta 126 ur slap-p4, där returen börjar (Jakob: ”Bra.”)');
  // The deal that ends there carries it: the last picture's from.cut.
  assert.deepEqual(endsOnOf([{ goesAs: 'startFrame' }, { goesAs: 'endFrame', from: { cut: { clip: 'slap-p4', frame: 126 } } }]), { clip: 'slap-p4', frame: 126 });
  assert.equal(endsOnOf([{ goesAs: 'endFrame', from: { path: 'assets/anchors/x/anchor.png' } as never }]), null);
});

test('a reference film whose check fails is not offered first: on edge before the turn, a colour change without an edge', () => {
  // Pamela's approved deal to seat 1 fails the reference check (trial 2B and Jakob: "Pamelas grundfilm är otydlig"); Paow's own
  // approved deal there passes. Without the check Pamela's straight-approved film comes before; with it, Paow's.
  const step = STEPS.find((s) => s.key === 'GIV-2.1')!;
  const bank: BankFacts = {
    jobs: [{ id: 'pamela-p1-c1-plan-deal-01', from: 'READY', to: 'LAND(P1.C1)', duration: 4 }, { id: 'pamela-p1-c1-plan-deal-09', from: 'READY', to: 'LAND(P1.C1)', duration: 4 }],
    motions: {
      'pamela-p1-c1-plan-deal-01': { source: { frames: 120, fps: 30 }, review: { decision: 'ACCEPTED', userAccepted: true } },
      'pamela-p1-c1-plan-deal-09': { source: { frames: 120, fps: 30 }, review: { decision: 'ACCEPTED', userAccepted: true } },
    },
  };
  const order = (b: BankFacts) => referenceCandidates(b, { dealer: 'paow', step, target: 'P1.C1', model: MODELS['kling-4'] }).map((c) => [c.take, c.check?.pass ?? null]);
  assert.deepEqual(order(bank), [['pamela-p1-c1-plan-deal-01', null], ['pamela-p1-c1-plan-deal-09', null]]);
  const checked = { ...bank, referenceChecks: { 'pamela-p1-c1-plan-deal-01': { pass: false, codes: ['fargbyte-utan-kant', 'ljus-kant'] }, 'pamela-p1-c1-plan-deal-09': { pass: true, clean: true } } };
  assert.deepEqual(order(checked), [['pamela-p1-c1-plan-deal-09', true], ['pamela-p1-c1-plan-deal-01', false]]);
});

test('a rendered reference film (the dummy, read off a real deal) is offered first for its step and seat, before a take of the bank', () => {
  const step = STEPS.find((s) => s.key === 'GIV-2.1')!;
  const bank: BankFacts = {
    jobs: [{ id: 'pamela-p4-c1-plan-deal-02', from: 'READY', to: 'RELEASE(P4.C1)', duration: 4 }],
    motions: { 'pamela-p4-c1-plan-deal-02': { source: { frames: 120, fps: 30, sha256: 'a'.repeat(64) }, review: { decision: 'ACCEPTED', userAccepted: true } } },
    rendered: [
      { id: 'docka-giv-p4-01', edge: 'READY>P4.C1', path: 'assets/references/docka/docka-giv-p4-01/source.mp4', sha256: 'b'.repeat(64), seconds: 4.042, fromDeal: 'pamela-p4-c1-plan-deal-02', capture: 'dealer3d/data/giv-pamela-p4.json', check: { pass: true, clean: true } },
      { id: 'docka-giv-p3-01', edge: 'READY>P3.C1', path: 'assets/references/docka/docka-giv-p3-01/source.mp4', sha256: 'c'.repeat(64), seconds: 4.042 },
    ],
  };
  const list = referenceCandidates(bank, { dealer: 'paow', step, target: 'P4.C1', model: MODELS['kling-4'] });
  assert.deepEqual(list.map((c) => [c.take, c.kind ?? 'BANK', c.dealer, c.match]), [['docka-giv-p4-01', 'RENDERED', 'docka', 0], ['pamela-p4-c1-plan-deal-02', 'BANK', 'pamela', 0]]);
  assert.deepEqual([list[0].path, list[0].fromDeal, list[0].fits, list[0].approvedStraight], ['assets/references/docka/docka-giv-p4-01/source.mp4', 'pamela-p4-c1-plan-deal-02', true, false]);
  // Another seat's rendered film is not offered for this one.
  assert.ok(!list.some((c) => c.take === 'docka-giv-p3-01'));
});
