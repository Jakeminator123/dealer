// The method of record (data/order-methods.json, src/order-methods.ts): the register holds and names only steps, models and
// styles that exist; every step of Beställ has a method (gäller, prov or saknas); Jakob is quoted exactly as his records
// say; the method for a seat follows its class; and a register that names what does not exist is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { MODELS, STEPS, stepOf, stylesFor } from '../src/order-model.ts';
import { METHOD_STATUSES, methodFor, readMethods, recipeWords, seatClass, type Method } from '../src/order-methods.ts';

const register = async () => JSON.parse(await readFile('data/order-methods.json', 'utf8'));

test('the register holds, names only what exists, and covers every step of Beställ', async () => {
  const value = await register();
  const { register: read, errors } = readMethods(value);
  assert.deepEqual(errors, []);
  assert.ok(read!.about.length > 100, 'a short about, like the other registers');
  for (const m of read!.methods) {
    const step = stepOf(m.step)!;
    assert.ok(step, `${m.id}: ${m.step} is a step`);
    if (m.model) assert.ok(MODELS[m.model] && !MODELS[m.model].off, `${m.id}: ${m.model} is offered`);
    if (m.style) assert.ok(stylesFor(step.kind, step).includes(m.style), `${m.id}: ${m.style} is a style of ${m.step}`);
    assert.ok((METHOD_STATUSES as readonly string[]).includes(m.status));
    if (m.status !== 'saknas') assert.ok(m.model && m.style && m.takes, `${m.id}: a whole recipe`);
  }
  for (const step of STEPS) assert.ok(methodFor(read, step.key, step.card ? 'P4.C1' : null), `${step.key} has a method`);
});

test('tonight\'s methods: the entry holds, rest and the deals are tried, the rest has none yet', async () => {
  const { register: read } = readMethods(await register());
  const status = (step: string, target: string | null = null) => methodFor(read, step as Method['step'], target)?.status;
  assert.equal(status('INGANG-2.1'), 'gäller');
  assert.deepEqual(['VILA', 'GIV-2.1'].map((s) => status(s, 'P4.C1')), ['prov', 'prov']);
  assert.equal(methodFor(read, 'GIV-2.1', 'P4.C1')!.id, 'giv-2.1-mitten');
  assert.equal(methodFor(read, 'GIV-2.1', 'P7.C1')!.id, 'giv-2.1-ytter');
  assert.equal(methodFor(read, 'GIV-2.1', 'D.C2')!.id, 'giv-2.1-dealer');
  for (const s of ['RETUR-2.1', 'RETUR-2.2', 'RETUR-1', 'UTGANG', 'HALKORT', 'GIV-2.2', 'INGANG-2.2', 'ANKARE-2.2']) assert.equal(status(s, 'P4.C1'), 'saknas', s);
  assert.equal(status('GIV-2.1', 'D.C1'), 'saknas', 'the dealer\'s cards');
  const entry = methodFor(read, 'INGANG-2.1')!;
  assert.deepEqual([entry.model, entry.style, entry.seconds, entry.takes], ['wan3', 'KORT', 4, 2]);
  // The deals are tried at the place with the place in words; Kling 4 with a straight-approved reference to the same seat,
  // WAN 3 where none exists.
  const far = methodFor(read, 'GIV-2.1', 'P1.C1')!;
  assert.deepEqual([far.model, far.turn, far.reference, far.noReferenceModel, far.shape], ['kling-4', 'AT_PLACE', 'samma-plats-rakt-godkänd', 'wan3', 'ROUND_TRIP']);
  assert.equal(recipeWords(far), 'Kling 4 · kort text · 7 s · vänd vid platsen · prov: 1 tagning · referensfilm: en rakt godkänd giv till samma plats');
  assert.equal(recipeWords(far, true), 'WAN 3 · kort text · 7 s · vänd vid platsen · prov: 1 tagning · utan referensfilm (ingen finns till platsen)');
  assert.equal(recipeWords(methodFor(read, 'UTGANG')), 'ingen metod än');
});

test('Jakob is quoted exactly as his records say, never paraphrased', async () => {
  const { register: read } = readMethods(await register());
  let quoted = 0;
  for (const m of read!.methods) for (const q of m.evidence.owner) {
    const file = `motions/${q.take}.json`;
    if (!existsSync(file)) continue; // the records are in Git; a checkout without them has nothing to compare with
    const review = JSON.parse(await readFile(file, 'utf8')).review;
    assert.equal(q.words, review?.userReview, `${m.id}: ${q.take}`);
    quoted++;
  }
  assert.ok(quoted >= 10, `${quoted} quotes checked`);
});

test('a register that names what does not exist, or lacks a recipe or a source, is refused', async () => {
  const value = await register();
  const one = (change: Partial<Method>, index = 0) => readMethods({ ...value, methods: value.methods.map((m: Method, i: number) => (i === index ? { ...m, ...change } : m)) }).errors.join(' ');
  assert.match(one({ step: 'GIV-3' as Method['step'] }), /steget GIV-3 finns inte/);
  assert.match(one({ model: 'sora' }), /modellen sora finns inte/);
  assert.match(one({ model: 'kling-3-4k' }), /beställs inte längre/);
  assert.match(one({ status: 'gäller', model: 'wan3', style: 'UTFÖRLIG', seconds: 4, takes: 2 }, value.methods.findIndex((m: Method) => m.step === 'UTGANG')), /stilen UTFÖRLIG finns inte för Ankare 2\.1 → 1/, 'the way out has no long text');
  assert.match(one({ seconds: 40 }), /WAN 3 tar 2–30 s/);
  assert.match(one({ takes: 9 }), /takes ska vara 1–4/);
  assert.match(one({ seats: 'mitten' }), /INGANG-2\.1 har ingen plats/);
  assert.match(one({ status: 'gäller', model: null }), /kräver en modell/);
  assert.match(one({ reference: 'samma-plats-rakt-godkänd' }), /WAN 3 tar ingen referensfilm/);
  assert.match(one({ evidence: { orders: [], reviewer: [], owner: [{ take: 'x', words: 'Han tyckte den var bra.' }], note: '' } }), /citeras som de står/);
  assert.match(one({ setBy: '' }), /setBy och setAt/);
  assert.match(readMethods({ ...value, methods: [...value.methods, value.methods[0]] }).errors.join(' '), /finns två gånger|två metoder för INGANG-2\.1/);
  assert.deepEqual(readMethods(null).errors, ['Registret är inte ett objekt.']);
});

test('the class of a seat: the middle seats, the far seats, the dealer\'s cards', () => {
  assert.deepEqual(['P1.C1', 'P2.C1', 'P3.C1', 'P4.C2', 'P5.C1', 'P6.C1', 'P7.C1', 'D.C1', 'D.C2', null].map(seatClass), ['ytter', 'ytter', 'mitten', 'mitten', 'mitten', 'ytter', 'ytter', 'dealer', 'dealer', null]);
});
