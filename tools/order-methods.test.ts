// The method of record (data/order-methods.json, src/order-methods.ts). The behaviour (the method for a seat follows its
// class, the recipe's words, what the register refuses) is tested against a small register written here, so that a change
// of method on evidence never needs a change of test; the live register is checked only for what must always hold: it
// reads, names only steps, models, styles and turns that exist, covers every step of Beställ, a method that holds has
// orders and Jakob's own words behind it, and Jakob is quoted exactly as his records say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { FLIP_AXES, MODELS, STEPS, stepOf, stylesFor, type FlipAxis } from '../src/order-model.ts';
import { METHOD_STATUSES, methodFor, readMethods, recipeWords, seatClass, type Method, type MethodRegister } from '../src/order-methods.ts';

const register = async () => JSON.parse(await readFile('data/order-methods.json', 'utf8'));

/** A method with nothing but what is given (a missing method's empty recipe). */
const method = (m: Partial<Method> & Pick<Method, 'id' | 'step' | 'status'>): Method => ({
  seats: null, model: null, style: null, seconds: null, takes: null, turn: null, shape: null, reference: 'ingen', extra: null,
  evidence: { orders: [], reviewer: [], owner: [], note: '' }, setBy: 'testet', setAt: '2026-11-13', ...m,
});
/** One method that holds, one tried with a reference rule and a model for where no reference exists, one tried without a reference (for a class of seats), one missing. */
const FIXTURE: MethodRegister = {
  about: 'A small register written in the test: one method that holds, one tried with a reference rule, one tried without, one missing.',
  schemaVersion: 1,
  methods: [
    method({ id: 'ingang-2.1', step: 'INGANG-2.1', status: 'gäller', model: 'wan3', style: 'KORT', seconds: 4, takes: 2, evidence: { orders: ['paow-ingang-2-1-01'], reviewer: [], owner: [{ take: 'paow-ingang-2-1-01-01', words: 'Jakob 2026-11-13: bra' }], note: '' } }),
    method({ id: 'giv-2.1', step: 'GIV-2.1', status: 'prov', model: 'kling-4', style: 'KORT', seconds: 7, takes: 2, turn: 'AT_PLACE', shape: 'ROUND_TRIP', reference: 'samma-plats-rakt-godkänd', noReferenceModel: 'wan3' }),
    method({ id: 'giv-2.1-dealer', step: 'GIV-2.1', seats: 'dealer', status: 'prov', model: 'kling-4', style: 'KORT', seconds: 7, takes: 2, turn: 'FREE', shape: 'ROUND_TRIP' }),
    method({ id: 'utgang', step: 'UTGANG', status: 'saknas' }),
  ],
};

test('the live register holds, names only what exists, and covers every step of Beställ', async () => {
  const { register: read, errors } = readMethods(await register());
  assert.deepEqual(errors, []);
  assert.ok(read!.about.length > 100, 'a short about, like the other registers');
  assert.equal(new Set(read!.methods.map((m) => m.id)).size, read!.methods.length, 'ids are unique');
  for (const m of read!.methods) {
    const step = stepOf(m.step)!;
    assert.ok(step, `${m.id}: ${m.step} is a step`);
    assert.ok((METHOD_STATUSES as readonly string[]).includes(m.status), `${m.id}: ${m.status}`);
    if (m.model) assert.ok(MODELS[m.model] && !MODELS[m.model].off, `${m.id}: ${m.model} is offered`);
    if (m.noReferenceModel) assert.ok(MODELS[m.noReferenceModel] && !MODELS[m.noReferenceModel].off, `${m.id}: ${m.noReferenceModel} is offered`);
    if (m.style) assert.ok(stylesFor(step.kind, step).includes(m.style), `${m.id}: ${m.style} is a style of ${m.step}`);
    if (m.turn) assert.ok(m.turn === 'plan' || FLIP_AXES.includes(m.turn as FlipAxis), `${m.id}: ${m.turn} is a turn`);
    if (m.status !== 'saknas') assert.ok(m.model && m.style && m.takes, `${m.id}: a whole recipe`);
    if (m.status === 'gäller') {
      assert.ok(m.evidence.orders.length >= 1, `${m.id}: holds on at least one order`);
      assert.ok(m.evidence.owner.some((o) => /^Jakob \d{4}-\d{2}-\d{2}: /.test(o.words)), `${m.id}: holds on Jakob's own words`);
    }
  }
  for (const step of STEPS) assert.ok(methodFor(read, step.key, step.card ? 'P4.C1' : null), `${step.key} has a method`);
});

test('the method for a step and a seat: its class of seat first, else the one for every seat; the recipe in words', () => {
  assert.deepEqual(readMethods(FIXTURE).errors, [], 'the fixture is a register that reads');
  const id = (step: Method['step'], target: string | null = null) => methodFor(FIXTURE, step, target)?.id ?? null;
  assert.equal(id('INGANG-2.1'), 'ingang-2.1');
  assert.deepEqual(['P1.C1', 'P4.C1', 'P7.C1'].map((t) => id('GIV-2.1', t)), ['giv-2.1', 'giv-2.1', 'giv-2.1'], 'no class of its own: the one for every seat');
  assert.deepEqual(['D.C1', 'D.C2'].map((t) => id('GIV-2.1', t)), ['giv-2.1-dealer', 'giv-2.1-dealer'], 'the dealer\'s cards: their class');
  assert.equal(id('HALKORT'), null, 'a step the register does not name');
  assert.equal(methodFor(null, 'GIV-2.1', 'P4.C1'), null);
  assert.deepEqual(['INGANG-2.1', 'GIV-2.1', 'UTGANG'].map((s) => methodFor(FIXTURE, s as Method['step'], 'P4.C1')!.status), ['gäller', 'prov', 'saknas']);
  // A method that holds: its takes; a tried one: one take per trial; a reference rule, and the recipe where none exists.
  assert.equal(recipeWords(methodFor(FIXTURE, 'INGANG-2.1')), 'WAN 3 · kort text · 4 s · 2 tagningar');
  const ref = methodFor(FIXTURE, 'GIV-2.1', 'P1.C1')!;
  assert.equal(recipeWords(ref), 'Kling 4 · kort text · 7 s · vänd vid platsen · prov: 1 tagning · referensfilm: en rakt godkänd giv till samma plats');
  assert.equal(recipeWords(ref, true), 'WAN 3 · kort text · 7 s · vänd vid platsen · prov: 1 tagning · utan referensfilm (ingen finns till platsen)');
  assert.equal(recipeWords(methodFor(FIXTURE, 'GIV-2.1', 'D.C2')), 'Kling 4 · kort text · 7 s · naturlig vändning på vägen · prov: 1 tagning');
  assert.equal(recipeWords(methodFor(FIXTURE, 'GIV-2.1', 'D.C2'), true), recipeWords(methodFor(FIXTURE, 'GIV-2.1', 'D.C2')), 'no reference rule: nothing changes');
  assert.equal(recipeWords({ ...ref, turn: 'plan' }), 'Kling 4 · kort text · 7 s · prov: 1 tagning · referensfilm: en rakt godkänd giv till samma plats', 'the plan\'s turn is not named');
  assert.equal(recipeWords(methodFor(FIXTURE, 'UTGANG')), 'ingen metod än');
  assert.equal(recipeWords(null), 'ingen metod än');
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

test('a register that names what does not exist, or lacks a recipe or a source, is refused', () => {
  const value = FIXTURE;
  const one = (change: Partial<Method>, index = 0) => readMethods({ ...value, methods: value.methods.map((m, i) => (i === index ? { ...m, ...change } : m)) }).errors.join(' ');
  const exit = value.methods.findIndex((m) => m.step === 'UTGANG'), deal = value.methods.findIndex((m) => m.id === 'giv-2.1');
  assert.match(one({ step: 'GIV-3' as Method['step'] }), /steget GIV-3 finns inte/);
  assert.match(one({ model: 'sora' }), /modellen sora finns inte/);
  assert.match(one({ model: 'kling-3-4k' }), /beställs inte längre/);
  assert.match(one({ status: 'gäller', model: 'wan3', style: 'UTFÖRLIG', seconds: 4, takes: 2 }, exit), /stilen UTFÖRLIG finns inte för Ankare 2\.1 → 1/, 'the way out has no long text');
  assert.match(one({ seconds: 40 }), /WAN 3 tar 2–30 s/);
  assert.match(one({ takes: 9 }), /takes ska vara 1–4/);
  assert.match(one({ seats: 'mitten' }), /INGANG-2\.1 har ingen plats/);
  assert.match(one({ status: 'gäller', model: null }), /kräver en modell/);
  assert.match(one({ reference: 'samma-plats-rakt-godkänd' }), /WAN 3 tar ingen referensfilm/);
  assert.match(one({ noReferenceModel: 'wan3' }), /noReferenceModel gäller bara där metoden vill ha en referensfilm/);
  assert.match(one({ noReferenceModel: 'sora' }, deal), /noReferenceModel sora kan inte göra/);
  assert.match(one({ turn: 'SIDEWAYS' as Method['turn'] }, deal), /turn ska vara plan/);
  assert.match(one({ turn: 'FREE' }), /INGANG-2\.1 vänder inget kort/);
  assert.match(one({ status: 'klar' as Method['status'] }), /status ska vara gäller, prov, saknas/);
  assert.match(one({ evidence: { orders: [], reviewer: [], owner: [{ take: 'x', words: 'Han tyckte den var bra.' }], note: '' } }), /citeras som de står/);
  assert.match(one({ setBy: '' }), /setBy och setAt/);
  assert.match(readMethods({ ...value, methods: [...value.methods, value.methods[0]] }).errors.join(' '), /finns två gånger|två metoder för INGANG-2\.1/);
  assert.match(readMethods({ ...value, methods: [...value.methods, { ...value.methods[0], id: 'ingang-igen' }] }).errors.join(' '), /två metoder för INGANG-2\.1/);
  assert.deepEqual(readMethods(null).errors, ['Registret är inte ett objekt.']);
});

test('the class of a seat: the middle seats, the far seats, the dealer\'s cards', () => {
  assert.deepEqual(['P1.C1', 'P2.C1', 'P3.C1', 'P4.C2', 'P5.C1', 'P6.C1', 'P7.C1', 'D.C1', 'D.C2', null].map(seatClass), ['ytter', 'ytter', 'mitten', 'mitten', 'mitten', 'ytter', 'ytter', 'dealer', 'dealer', null]);
});
