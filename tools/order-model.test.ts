// Offline tests for the order model (src/order-model.ts): the checkout's drafts hold, the exact call per take, the cost
// from the price table, the policy check, the hash an approval freezes, and the status a person sees. No media needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  ALL_SEVEN, CARD_SCALES, MODELS, STEPS, bodyLine, canonical, checkPolicy, costOf, crossesBody, cutIntoOf, dayOf, defaultFlip, defaultStyle, draftProblems, edgeOf, genitive, groupBudget, handChoiceOf, handsOf, hashInput, landingMissing, landingOf, lengthFor, modelFor, modelsFor, paramsOf, priceOf, referenceCandidates, requestOf, scaleQuad, scaleWords, seatList, seatWords, shownOf, spentOn, startWords, stepOf, styleOf, stylesFor, summaryOf, takeStates, tidyMotion, validateOrder, verdictOf, waitWords,
  type BankFacts, type Order, type Policy, type Receipt,
} from '../src/order-model.ts';
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
  assert.deepEqual(modelsFor(entry).map((m) => m.id), ['wan3', 'kling-4', 'kling-3-4k'], 'its own first, then every model that takes a first and a last picture');
  assert.deepEqual(modelsFor(deal).map((m) => m.id), ['kling-4', 'wan3', 'kling-3-4k']);
  assert.deepEqual(modelsFor(still).map((m) => m.id), ['nano-banana-pro'], 'a still: only the picture model');
  assert.equal(modelFor(entry)?.id, 'wan3');
  assert.equal(modelFor(entry, 'nano-banana-pro'), null);
  assert.equal(modelFor(still, 'kling-3-4k'), null);
  assert.equal(modelFor(entry, 'gen-9'), null);
  // The step's own model gets what it got before the choice existed.
  assert.deepEqual(paramsOf(entry, MODELS.wan3), { resolution: '1080p', duration: 4, ratio: 'adaptive', generateAudio: false });
  assert.deepEqual(paramsOf(deal, MODELS['kling-4']), { resolution: '1080p', duration: 7 });
  assert.deepEqual(paramsOf(still, MODELS['nano-banana-pro']), { ratio: '4:3', imageSize: '4K' });
  assert.deepEqual(paramsOf(deal, MODELS.wan3), { resolution: '1080p', duration: 7, ratio: 'adaptive', generateAudio: false }, 'the ratio and the sound are the model\'s');
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
  assert.equal(stepOf('GIV-2.1')?.model, 'kling-4');
  assert.equal(stepOf('INGANG-2.1')?.duration, 4);
  // A return is its own film from the landing picture (one action per film, 2026-11-13): WAN 3, 3 s.
  for (const key of ['RETUR-2.1', 'RETUR-2.2', 'RETUR-1'] as const) assert.deepEqual([stepOf(key)?.start, stepOf(key)?.off, stepOf(key)?.model, stepOf(key)?.duration], ['LAND', undefined, 'wan3', 3], key);
  assert.deepEqual(STEPS.map((s) => s.key).filter((k) => stepOf(k)?.off), [], 'nothing is switched off now');
  assert.deepEqual(['RETUR-2.1', 'RETUR-2.2', 'RETUR-1'].map((k) => edgeOf(stepOf(k)!, 'P4.C1')), ['P4.C1>READY', 'P4.C1>READY-B', 'P4.C1>IDLE']);
  assert.deepEqual(cutIntoOf(stepOf('GIV-2.1')!, 'P4.C1', 'ROUND_TRIP'), ['READY>P4.C1', 'P4.C1>READY']);
  assert.deepEqual(cutIntoOf(stepOf('GIV-2.1')!, 'P4.C1', 'ONE_WAY'), ['READY>P4.C1'], 'bara dit: the deal alone');
  assert.deepEqual(cutIntoOf(stepOf('RETUR-2.2')!, 'P4.C1', 'ONE_WAY'), ['P4.C1>READY-B']);
  assert.equal(startWords(stepOf('RETUR-2.1')!), 'Börjar på platsens landningsbild (handen vid kortet) och slutar på ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster.');
  assert.equal(startWords(stepOf('GIV-2.1')!, 'ONE_WAY'), 'Börjar på ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster, och slutar på platsens landningsbild.');
  assert.equal(edgeOf(stepOf('GIV-2.1')!, 'P4.C1'), 'READY>P4.C1');
  assert.equal(edgeOf(stepOf('INGANG-2.2')!, null), 'IDLE>READY-B');
  assert.equal(edgeOf(stepOf('ANKARE-2.1')!, null), null);
  assert.equal(stepOf('MELLANBILD'), null, 'the in-between picture (a turn about the short edge) is dropped');
  assert.equal(stepOf('GIV-2.1')?.duration, 7, 'the bank round trip to seat 4 is 6,5 s');
  assert.ok(validateOrder({ schemaVersion: 1 }).errors.length > 3);
});

test('one line on what an order makes, in Jakob\'s words', () => {
  assert.equal(summaryOf(stepOf('ANKARE-2.2')!, 'Paow', null), 'Gör Paows ankare 2.2: hennes ankare 1 där bara vänsterarmen flyttas, så att handen ligger över kortet vid skons öppning.');
  assert.equal(summaryOf(stepOf('GIV-2.1')!, 'Paow', { turn: true, target: 'P4.C1' }), 'Gör en film av Paow: från ankare 2.1 (nyp) tar hon ett kort ur skon med vänster hand; hon vänder det som en hand kan på vägen och lägger det öppet på plats 4; handen går tillbaka till nypet.');
  assert.equal(summaryOf(stepOf('GIV-2.1')!, 'Paow', { turn: true, target: 'P4.C1', hand: 'LH', pass: false, side: 'FRONT', flipAxis: 'AT_PLACE' }), 'Gör en film av Paow: från ankare 2.1 (nyp) tar hon ett kort ur skon med vänster hand; hon för fram det med baksidan upp, vänder upp det vid plats 4 och lägger det öppet; handen går tillbaka till nypet.');
  assert.equal(summaryOf(stepOf('GIV-2.2')!, 'Paow', { turn: true, target: 'P1.C1', hand: 'LH', pass: true, side: 'FRONT', flipAxis: 'FREE' }), 'Gör en film av Paow: från ankare 2.2 (släp) släpar hon ett kort ur skon med vänster hand och ger det till höger lågt framför kroppen; höger vänder det som en hand kan på vägen och lägger det öppet på plats 1; händerna går tillbaka till ankaret.');
  assert.equal(summaryOf(stepOf('GIV-2.2')!, 'Paow', { turn: false, target: 'P6.C1', hand: 'RH', pass: false, side: 'BACK' }), 'Gör en film av Paow: från ankare 2.2 (släp) släpar hon ett kort ur skon med höger hand; hon lägger det stängt, baksidan upp, på plats 6; händerna går tillbaka till ankaret.');
  assert.equal(startWords(stepOf('GIV-2.2')!), 'Börjar och slutar på ankare 2.2 (släp): handen över kortet i skons öppning.');
  assert.equal(startWords(stepOf('INGANG-2.1')!), 'Börjar på ankare 1 och slutar på ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster.');
  assert.equal(genitive('Agnes'), 'Agnes');
  assert.equal(seatWords('D.C1'), 'dealerns plats');
  assert.equal(seatWords('P2.C2'), 'plats 2, kort 2');
});

test('the hand: left, right or handbyte (left to right), stored as the plan stores it', () => {
  assert.deepEqual(handsOf('PASS'), { hand: 'LH', pass: true });
  assert.deepEqual(handsOf('RH'), { hand: 'RH', pass: false });
  assert.equal(handChoiceOf({ hand: 'LH', pass: true }), 'PASS');
  assert.equal(handChoiceOf({ hand: 'LH' }), 'LH', 'an older order without pass is left all the way');
  assert.equal(defaultFlip('GIV-2.1'), 'AT_PLACE', 'a deal from 2.1 turns at the place (Jakob 2026-11-13)');
  assert.equal(defaultFlip('GIV-2.2'), 'FREE');
  assert.equal(defaultFlip('GIV-2.2', 'PLACE'), 'AT_PLACE', 'where the plan turns the card at its place');
  const order = { schemaVersion: 1, id: 'x', title: 'x', dealer: 'paow', kind: 'FILM', step: { key: 'GIV-2.1' }, pictures: [], generation: {}, prompt: {}, takes: 1, cost: {}, reference: {}, status: 'UTKAST', approval: null, notes: [] };
  const motion = { grip: 'PINCH', hand: 'RH', pass: true, turn: true, flipAxis: 'AT_PLACE', target: 'P1.C1', side: 'FRONT', fromPlan: false };
  assert.match(validateOrder({ ...order, motion }).errors.join(' '), /handbyte går från vänster hand till höger/);
  assert.doesNotMatch(validateOrder({ ...order, motion: { ...motion, hand: 'LH' } }).errors.join(' '), /motion/);
  assert.match(validateOrder({ ...order, motion: { ...motion, hand: 'LH', side: 'UP' } }).errors.join(' '), /motion: hand/);
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

test('the text style: Kort for every new order, no minimal still, Utförlig for an order made before template 4', () => {
  assert.deepEqual([defaultStyle('FILM'), defaultStyle('STILL')], ['KORT', 'KORT']);
  assert.deepEqual(stylesFor('STILL'), ['KORT', 'UTFÖRLIG']);
  assert.equal(styleOf({}), 'UTFÖRLIG', 'no style: the long text of template 3');
  assert.equal(styleOf({ style: 'MINIMAL' }), 'MINIMAL');
  const order = { schemaVersion: 1, id: 'x', title: 'x', dealer: 'paow', kind: 'FILM', step: { key: 'GIV-2.1', shape: 'ONE_WAY' }, pictures: [], generation: {}, prompt: { text: '', sha256: '', extra: null, style: 'LÅNG' }, takes: 1, cost: {}, reference: {}, status: 'UTKAST', approval: null, notes: [] };
  assert.match(validateOrder(order).errors.join(' '), /prompt\.style ska vara KORT, MINIMAL eller UTFÖRLIG/);
  assert.match(validateOrder({ ...order, step: { key: 'GIV-2.1', shape: 'BOTH' } }).errors.join(' '), /step\.shape/);
  assert.equal(summaryOf(stepOf('GIV-2.1')!, 'Paow', { turn: true, target: 'P4.C1', hand: 'LH', pass: false, side: 'FRONT', flipAxis: 'AT_PLACE' }, 'ONE_WAY'), 'Gör en film av Paow: från ankare 2.1 (nyp) tar hon ett kort ur skon med vänster hand; hon för fram det med baksidan upp, vänder upp det vid plats 4 och lägger det öppet; filmen slutar med handen vid kortet (bara dit).');
  assert.equal(summaryOf(stepOf('RETUR-2.2')!, 'Paow', { turn: false, target: 'P4.C1' }), 'Gör en film av Paow: handen går från kortet på plats 4 tillbaka och lägger sig över kortet vid skons öppning.');
});

test('the landing picture: role landning, LAND(<seat>), gäller, the card on that seat; what is missing otherwise', () => {
  const e = (id: string, node: string, state: string | undefined, card: string) => ({ id, role: 'landning', node, state, card });
  const entries = [e('a', 'LAND(P4.C1)', 'kandidat', 'P4.C1'), e('b', 'RELEASE(P4.C1)', 'gäller', 'P4.C1'), e('c', 'LAND(P4.C1)', 'gäller', 'P4.C1'), { id: 'd', role: 'ankare-2.1', node: 'READY', state: 'gäller' }];
  assert.equal(landingOf(entries, 'P4.C1')?.id, 'c');
  assert.equal(landingOf(entries, 'P1.C1'), null);
  assert.equal(landingOf(entries, null), null);
  assert.match(landingMissing('Paow', 'P1.C1'), /^Ingen landningsbild gäller för Paows plats 1\. Godkänn en i Material \(roll landning, LAND\(P1\.C1\)\)/);
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
    ['pamela-p4-c1-readyb-deal-01', 1, 'pamela', 'EJ_DÖMD'],
    ['pamela-p1-c1-plan-deal-02', 2, 'pamela', 'EJ_DÖMD'],
  ], 'one per film; DRAWN is not a node of the graph; the entry is another step');
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
