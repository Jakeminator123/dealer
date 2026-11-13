// Offline tests for the order model (src/order-model.ts): the checkout's drafts hold, the exact call per take, the cost
// from the price table, the policy check, the hash an approval freezes, and the status a person sees. No media needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  ALL_SEVEN, STEPS, bodyLine, canonical, checkPolicy, costOf, crossesBody, dayOf, defaultFlip, draftProblems, edgeOf, genitive, groupBudget, handChoiceOf, handsOf, hashInput, priceOf, requestOf, seatList, seatWords, shownOf, spentOn, startWords, stepOf, summaryOf, takeStates, validateOrder, waitWords,
  type Order, type Policy, type Receipt,
} from '../src/order-model.ts';

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
      assert.equal(order.approval.by, 'jakob');
      assert.equal(order.approval.orderSha256, sha(hashInput(order)), `${order.id}: unchanged since the approval`);
    } else {
      assert.equal(order.status, 'UTKAST', order.id);
      assert.match(order.prompt.template, /@3$/, `${order.id}: a draft is written with today's template`);
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
  assert.match(draftProblems(film).join(' '), /Väntar på ankare 2\.1/);
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
  const p = await policy();
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
  const film = (await drafts()).find((o) => o.id === 'paow-giv-p4')!;
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
  assert.ok(STEPS.find((s) => s.key === 'RETUR-2.1')?.off, 'a return to 2.1 is part of the round trip');
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
  const p = await policy();
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
