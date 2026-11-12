// Offline tests for the order model (src/order-model.ts): the checkout's drafts hold, the exact call per take, the cost
// from the price table, the policy check, the hash an approval freezes, and the status a person sees. No media needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  STEPS, canonical, checkPolicy, costOf, dayOf, draftProblems, edgeOf, genitive, hashInput, priceOf, requestOf, seatWords, shownOf, spentOn, stepOf, summaryOf, takeStates, validateOrder, waitWords,
  type Order, type Policy, type Receipt,
} from '../src/order-model.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const policy = async () => JSON.parse(await readFile('data/order-policy.json', 'utf8')) as Policy;
async function drafts(): Promise<Order[]> {
  const out: Order[] = [];
  for (const name of (await readdir('data/orders').catch(() => [] as string[])).filter((f) => f.endsWith('.json'))) out.push(JSON.parse(await readFile(`data/orders/${name}`, 'utf8')));
  return out;
}

test('the checkout: every order file holds, is a draft without approval, and its text has the hash it says', async () => {
  const list = await drafts();
  assert.ok(list.length >= 3, 'the three prepared drafts');
  for (const order of list) {
    const { errors } = validateOrder(order);
    assert.deepEqual(errors, [], order.id);
    assert.equal(order.prompt.sha256, sha(order.prompt.text), order.id);
    assert.equal(order.status, 'UTKAST', `${order.id}: nothing is approved by a tool`);
    assert.equal(order.approval, null);
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
  const order = (await drafts()).find((o) => o.id === 'paow-ankare-2-1')!;
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
  assert.equal(summaryOf(stepOf('GIV-2.1')!, 'Paow', { turn: true, target: 'P4.C1' }), 'Gör en film av Paow: från nypet vid skon (ankare 2.1) tar hon ett kort, vänder det som en hand kan och lägger det på plats 4; handen går tillbaka till nypet.');
  assert.equal(genitive('Agnes'), 'Agnes');
  assert.equal(seatWords('D.C1'), 'dealerns plats');
  assert.equal(seatWords('P2.C2'), 'plats 2, kort 2');
});
