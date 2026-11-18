// The method of record (data/order-methods.json, src/order-methods.ts): the ONE recipe per step. The behaviour (the method
// for a seat follows its class, the recipe as a draft takes it, the reference film a rule finds, the film's length, the
// recipe's words, what the register refuses) is tested against a small register written here, so that a change of method on
// evidence never needs a change of test; the live register is checked for what must always hold: it reads, names only
// steps, models, styles and turns that exist, covers every step of Beställ, a method that holds has orders and Jakob's own
// words behind it, Jakob is quoted exactly as his records say, and the deal's recipe is the one the trials support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { FLIP_AXES, MODELS, STEPS, stepOf, stylesFor, type BankFacts, type FlipAxis } from '../src/order-model.ts';
import { METHOD_STATUSES, lastPictureOf, methodFor, readMethods, recipeFor, recipeWords, referenceByRule, referenceWaits, seatClass, secondsOf, type Method, type MethodRegister } from '../src/order-methods.ts';
import { TEMPLATE_VERSION } from '../src/order-prompts.ts';

const register = async () => JSON.parse(await readFile('data/order-methods.json', 'utf8'));

/** A method with nothing but what is given (a missing method's empty recipe). */
const method = (m: Partial<Method> & Pick<Method, 'id' | 'step' | 'status'>): Method => ({
  seats: null, model: null, resolution: null, style: null, template: null, seconds: null, takes: null, turn: null, hand: null, shape: null, reference: 'ingen', lastPicture: null, extra: null,
  evidence: { orders: [], reviewer: [], owner: [], note: '' }, setBy: 'testet', setAt: '2026-11-13', ...m,
});
const film = { resolution: '1080p', style: 'KORT', template: TEMPLATE_VERSION } as const;
/** One method that holds, one tried with a reference rule, one tried for a class of seats with the dummy's film alone, one missing. */
const FIXTURE: MethodRegister = {
  about: 'A small register written in the test: one method that holds, one tried with a reference rule, one tried for a class of seats, one missing.',
  schemaVersion: 1,
  methods: [
    method({ id: 'ingang-2.1', step: 'INGANG-2.1', status: 'gäller', model: 'wan3', ...film, seconds: 4, takes: 2, lastPicture: 'ankare', evidence: { orders: ['paow-ingang-2-1-01'], reviewer: [], owner: [{ take: 'paow-ingang-2-1-01-01', words: 'Jakob 2026-11-13: bra' }], note: '' } }),
    method({ id: 'giv-2.1', step: 'GIV-2.1', status: 'prov', model: 'kling-4', ...film, seconds: 3, takes: 1, turn: 'FREE', shape: 'ONE_WAY', reference: 'renderad-eller-samma-plats', lastPicture: 'platsens-slutbild' }),
    method({ id: 'giv-2.1-dealer', step: 'GIV-2.1', seats: 'dealer', status: 'prov', model: 'kling-4', ...film, seconds: 7, takes: 1, turn: 'plan', shape: 'ROUND_TRIP', lastPicture: 'ritat-kort' }),
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
    if (m.style) assert.ok(stylesFor(step.kind, step).includes(m.style), `${m.id}: ${m.style} is a style of ${m.step}`);
    if (m.turn) assert.ok(m.turn === 'plan' || FLIP_AXES.includes(m.turn as FlipAxis), `${m.id}: ${m.turn} is a turn`);
    if (m.status !== 'saknas') {
      assert.ok(m.model && m.style && m.takes, `${m.id}: a whole recipe`);
      assert.equal(m.template, TEMPLATE_VERSION, `${m.id}: written for today's template`);
      assert.equal(m.lastPicture, lastPictureOf(step, m.shape), `${m.id}: the last picture its shape has`);
      assert.ok(recipeFor(read, m.step, m.seats === 'dealer' ? 'D.C1' : m.seats === 'ytter' ? 'P1.C1' : step.card ? 'P4.C1' : null), `${m.id}: a recipe a draft can take`);
    } else assert.equal(recipeFor({ methods: [m] }, m.step, null), null, `${m.id}: no method, no default`);
    if (m.status === 'prov') assert.equal(m.takes, 1, `${m.id}: a trial is one take`);
    if (m.status === 'gäller') {
      assert.ok(m.evidence.orders.length >= 1, `${m.id}: holds on at least one order`);
      assert.ok(m.evidence.owner.some((o) => /^Jakob \d{4}-\d{2}-\d{2}: /.test(o.words)), `${m.id}: holds on Jakob's own words`);
    }
  }
  for (const step of STEPS) assert.ok(methodFor(read, step.key, step.card ? 'P4.C1' : null), `${step.key} has a method`);
  // No method is the long text: a new order is never written Utförlig.
  assert.ok(read!.methods.every((m) => m.style !== 'UTFÖRLIG'));
});

test('the recipe for a deal is the one the trials support, for every seat: Kling 4, 1080p, bara dit, 3 s, a reference film, the seat\'s end picture', async () => {
  const { register: read } = readMethods(await register());
  for (const step of ['GIV-2.1', 'GIV-2.2', 'GIV-2.3'] as const) for (const target of ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1', 'D.C1', 'D.C2']) {
    const r = recipeFor(read, step, target)!, at = `${step} ${target}`;
    assert.deepEqual([r.model, r.resolution, r.shape, r.seconds, r.lastPicture, r.style, r.template], ['kling-4', '1080p', 'ONE_WAY', 3, 'platsens-slutbild', 'KORT', TEMPLATE_VERSION], at);
    assert.notEqual(r.reference, 'ingen', `${at}: never without a reference film`);
    assert.ok(MODELS[r.model].videos, `${at}: a model that takes a reference film`);
  }
  // No recipe of any step is tur och retur, and none is WAN 3 for a deal.
  assert.ok(read!.methods.every((m) => m.shape !== 'ROUND_TRIP'), 'tur och retur is no recipe');
  assert.ok(read!.methods.filter((m) => m.step.startsWith('GIV')).every((m) => m.model === 'kling-4'));
  // The hand is the recipe's too: the hand at the shoe all the way from anchors 2.1 and 2.2 (every trial that held), the step's
  // own two hands from 2.3. A handbyte fell in both its trials and is no recipe: where the plan says it, it is an exception.
  for (const target of ['P1.C1', 'P4.C1', 'D.C2']) assert.deepEqual([recipeFor(read, 'GIV-2.1', target)!.hand, recipeFor(read, 'GIV-2.2', target)!.hand, recipeFor(read, 'GIV-2.3', target)!.hand], ['LH', 'LH', null], target);
  assert.match(recipeWords(methodFor(read, 'GIV-2.1', 'P4.C1')), /bara dit · handen vid skon hela vägen · handleden vänder kortet på vägen/);
  // The far seats take only the dummy's film: Pamela's approved deal to seat 1 fell as a reference (trial 2B).
  assert.equal(recipeFor(read, 'GIV-2.1', 'P1.C1')!.reference, 'renderad');
});

test('the method for a step and a seat: its class of seat first, else the one for every seat; the recipe as a draft takes it and in words', () => {
  assert.deepEqual(readMethods(FIXTURE).errors, [], 'the fixture is a register that reads');
  const id = (step: Method['step'], target: string | null = null) => methodFor(FIXTURE, step, target)?.id ?? null;
  assert.equal(id('INGANG-2.1'), 'ingang-2.1');
  assert.deepEqual(['P1.C1', 'P4.C1', 'P7.C1'].map((t) => id('GIV-2.1', t)), ['giv-2.1', 'giv-2.1', 'giv-2.1'], 'no class of its own: the one for every seat');
  assert.deepEqual(['D.C1', 'D.C2'].map((t) => id('GIV-2.1', t)), ['giv-2.1-dealer', 'giv-2.1-dealer'], 'the dealer\'s cards: their class');
  assert.equal(id('HALKORT'), null, 'a step the register does not name');
  assert.equal(methodFor(null, 'GIV-2.1', 'P4.C1'), null);
  assert.deepEqual(['INGANG-2.1', 'GIV-2.1', 'UTGANG'].map((s) => methodFor(FIXTURE, s as Method['step'], 'P4.C1')!.status), ['gäller', 'prov', 'saknas']);
  // The recipe: every value a draft needs; the plan's turn is null (the store takes Placering's); no method, no recipe.
  const deal = recipeFor(FIXTURE, 'GIV-2.1', 'P4.C1')!;
  assert.deepEqual([deal.model, deal.resolution, deal.seconds, deal.takes, deal.style, deal.shape, deal.turn, deal.reference, deal.lastPicture], ['kling-4', '1080p', 3, 1, 'KORT', 'ONE_WAY', 'FREE', 'renderad-eller-samma-plats', 'platsens-slutbild']);
  assert.equal(recipeFor(FIXTURE, 'GIV-2.1', 'D.C1')!.turn, null);
  assert.equal(recipeFor(FIXTURE, 'UTGANG'), null);
  assert.equal(recipeFor(FIXTURE, 'HALKORT'), null);
  assert.equal(recipeFor(null, 'GIV-2.1', 'P4.C1'), null);
  // In words: each thing once; a trial says its one take; the plan's turn and an anchor as last picture are not named.
  assert.equal(recipeWords(methodFor(FIXTURE, 'INGANG-2.1')), `WAN 3 · 1080p · 4 s · kort text · mall ${TEMPLATE_VERSION} · 2 tagningar`);
  assert.equal(recipeWords(methodFor(FIXTURE, 'GIV-2.1', 'P1.C1')), `Kling 4 · 1080p · 3 s · bara dit · handleden vänder kortet på vägen · sista bild: platsens egen slutbild · referensfilm: dockan till platsen, annars en rakt godkänd giv dit · kort text · mall ${TEMPLATE_VERSION} · prov: 1 tagning`);
  assert.equal(recipeWords(methodFor(FIXTURE, 'GIV-2.1', 'D.C2')), `Kling 4 · 1080p · 7 s · tur och retur · sista bild: ankaret med kortet ritat · kort text · mall ${TEMPLATE_VERSION} · prov: 1 tagning`);
  assert.equal(recipeWords(methodFor(FIXTURE, 'UTGANG')), 'ingen metod än');
  assert.equal(recipeWords(null), 'ingen metod än');
});

test('the reference film a rule finds: the same step and seat, the deal alone for bara dit, the right hand, never a failed check; and the length it gives', () => {
  const deal = stepOf('GIV-2.1')!, drag = stepOf('GIV-2.2')!, kling = MODELS['kling-4'];
  const straight = { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-11: bra' }, source = (frames: number) => ({ frames, fps: 30 });
  const bank: BankFacts = {
    jobs: [
      { id: 'pamela-p4-c1-plan-deal-02', from: 'READY', to: 'LAND(P4.C1)' }, { id: 'pamela-p4-c1-drawn-deal-01', from: 'DRAWN', to: 'LAND(P4.C1)' },
      { id: 'pamela-p1-c1-plan-deal-01', from: 'READY', to: 'LAND(P1.C1)' }, { id: 'pamela-p2-c1-variant', from: 'READY', to: 'LAND(P2.C1)' }, { id: 'pamela-p3-c1-hoger', from: 'READY', to: 'LAND(P3.C1)' },
      { id: 'paow-giv-2-1-p4-04-01', from: 'READY', to: 'READY', dealer: 'paow' },
    ],
    derived: [{ id: 'paow-giv-2-1-p4-04-01-deal', from: 'READY', to: 'P4.C1', clip: 'paow-giv-2-1-p4-04-01', frames: [0, 108], dealer: 'paow' }, { id: 'paow-giv-2-1-p4-04-01-return', from: 'P4.C1', to: 'READY', clip: 'paow-giv-2-1-p4-04-01', frames: [109, 168], dealer: 'paow' }],
    motions: {
      'pamela-p4-c1-plan-deal-02': { source: source(120), review: straight }, 'pamela-p4-c1-drawn-deal-01': { source: source(150), review: straight },
      'pamela-p1-c1-plan-deal-01': { source: source(120), review: straight }, 'pamela-p2-c1-variant': { source: source(120), review: { decision: 'ACCEPTED', acceptedAs: 'VARIANT', userAccepted: true } },
      'pamela-p3-c1-hoger': { source: source(120), review: straight, motion: { releaseHand: 'RH' } },
      'paow-giv-2-1-p4-04-01': { source: source(169) }, 'paow-giv-2-1-p4-04-01-deal': { source: source(169), review: straight }, 'paow-giv-2-1-p4-04-01-return': { source: source(169), review: straight },
    },
    referenceChecks: { 'pamela-p1-c1-plan-deal-01': { pass: false, codes: ['kant-vid-skon'] } },
  };
  const by = (rule: Method['reference'], step = deal, target = 'P4.C1', more: { shape?: 'ONE_WAY' | 'ROUND_TRIP'; lays?: 'LH' | 'RH'; bank?: BankFacts } = {}) => referenceByRule(more.bank ?? bank, rule, { dealer: 'paow', step, target, model: kling, shape: more.shape ?? 'ONE_WAY', lays: more.lays })?.take ?? null;
  assert.equal(by('ingen'), null);
  // Bara dit: the dealer's own round trip is no reference (the whole film goes, and it ends at the shoe); the deal alone is.
  assert.equal(by('samma-plats-rakt-godkänd'), 'pamela-p4-c1-plan-deal-02');
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P4.C1', { shape: 'ROUND_TRIP' }), 'paow-giv-2-1-p4-04-01-deal', 'a round trip may follow a round trip');
  // The drag: the film from the drawn-out pose counts as the drag to the seat, and a pinch deal never does.
  assert.equal(by('samma-plats-rakt-godkänd', drag), 'pamela-p4-c1-drawn-deal-01');
  assert.equal(by('samma-plats-rakt-godkänd', drag, 'P1.C1'), null, 'the other grip is no reference by rule');
  // A film that fails its own reference check, a variant, and a film laid with the other hand are not taken.
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P1.C1'), null);
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P2.C1'), null);
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P3.C1'), null, 'laid with the right hand: no reference for the left');
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P3.C1', { lays: 'RH' }), 'pamela-p3-c1-hoger');
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P4.C1', { lays: 'RH' }), null, 'a one-hand deal is no reference for a handbyte');
  // The dummy's film first; alone where the rule says so; an archived take never.
  const docka = { ...bank, rendered: [{ id: 'docka-giv-p4-4', edge: 'READY>P4.C1', path: 'assets/references/docka/docka-giv-p4-4/source.mp4', sha256: 'a'.repeat(64), seconds: 3.967 }] };
  assert.equal(by('renderad-eller-samma-plats'), 'pamela-p4-c1-plan-deal-02', 'no dummy film yet: the bank\'s');
  assert.equal(by('renderad-eller-samma-plats', deal, 'P4.C1', { bank: docka }), 'docka-giv-p4-4');
  assert.equal(by('renderad'), null, 'only the dummy\'s film, and there is none');
  assert.equal(by('renderad', deal, 'P4.C1', { bank: docka }), 'docka-giv-p4-4');
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P4.C1', { bank: docka }), 'pamela-p4-c1-plan-deal-02', 'a rule without the dummy does not take it');
  const archived = { ...bank, motions: { ...bank.motions, 'pamela-p4-c1-plan-deal-02': { source: source(120), review: { ...straight, archived: { by: 'Jakob', where: 'Karta' } } } } };
  assert.equal(by('samma-plats-rakt-godkänd', deal, 'P4.C1', { bank: archived }), null, 'an archived take is out of play');
  assert.equal(referenceByRule(bank, 'samma-plats-rakt-godkänd', { dealer: 'paow', step: deal, target: 'P4.C1', model: MODELS.wan3 }), null, 'a model that takes no film');
  // What a step waits for where its rule finds no film: with the seat for a film with a card, without it for one without.
  assert.equal(referenceWaits('renderad', deal), 'väntar på dockans film till platsen');
  assert.equal(referenceWaits('renderad', stepOf('INGANG-2.3')!), 'väntar på dockans film');
  assert.equal(referenceWaits('renderad-eller-samma-plats', stepOf('INGANG-2.3')!), 'väntar på dockans film eller en rakt godkänd film av samma steg');
  assert.equal(referenceWaits('ingen', deal), '');
  // The length: the reference film's own in whole seconds, never shorter than it; without one the recipe's, within the model's range.
  assert.equal(secondsOf(kling, 3, null), 3);
  assert.equal(secondsOf(kling, 3, { seconds: 3.967 }), 4);
  assert.equal(secondsOf(kling, 3, { seconds: 4 }), 4);
  assert.equal(secondsOf(kling, 3, { seconds: 4.2 }), 5);
  assert.equal(secondsOf(kling, 3, { seconds: 2.5 }), 3, 'never under what the model takes');
  assert.equal(secondsOf(kling, 2, null), 3);
  assert.equal(secondsOf(MODELS.wan3, 2, null), 2);
  assert.equal(secondsOf(kling, null, null), null);
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
  assert.match(one({ status: 'gäller', model: 'wan3', ...film, style: 'UTFÖRLIG', seconds: 4, takes: 2, lastPicture: 'ankare' }, exit), /stilen UTFÖRLIG finns inte för Ankare 2\.1 → 1/, 'the way out has no long text');
  assert.match(one({ seconds: 40 }), /WAN 3 tar 2–30 s/);
  assert.match(one({ resolution: '4k' }), /WAN 3 tar upplösningen 480p, 720p, 1080p/);
  assert.match(one({ resolution: null }), /WAN 3 tar upplösningen/, 'a film says its resolution');
  assert.match(one({ template: TEMPLATE_VERSION - 1 }), new RegExp(`receptet säger mall ${TEMPLATE_VERSION - 1}; texten skrivs med mall ${TEMPLATE_VERSION}`), 'a recipe is looked at again when the template is counted up');
  assert.match(one({ takes: 9 }), /takes ska vara 1–4/);
  assert.match(one({ takes: 2 }, deal), /ett prov är en tagning/);
  assert.match(one({ seats: 'mitten' }), /INGANG-2\.1 har ingen plats/);
  assert.match(one({ status: 'gäller', model: null }), /kräver en modell/);
  assert.match(one({ reference: 'samma-plats-rakt-godkänd' }), /WAN 3 tar ingen referensfilm/);
  assert.match(one({ turn: 'SIDEWAYS' as Method['turn'] }, deal), /turn ska vara plan/);
  assert.match(one({ turn: 'FREE' }), /INGANG-2\.1 vänder inget kort/);
  assert.match(one({ shape: null }, deal), /en giv säger sin form/);
  assert.match(one({ hand: 'PASS' as Method['hand'] }, deal), /hand ska vara plan, LH, RH eller null/, 'a handbyte is never a recipe');
  assert.match(one({ hand: 'LH' }), /INGANG-2\.1 har ingen hand att välja/);
  assert.equal(recipeFor({ methods: [{ ...value.methods[deal], hand: 'LH' }] }, 'GIV-2.1', 'P4.C1')!.hand, 'LH');
  assert.equal(recipeFor({ methods: [{ ...value.methods[deal], hand: 'plan' }] }, 'GIV-2.1', 'P4.C1')!.hand, null, 'plan: the store takes what Placering says');
  assert.match(one({ lastPicture: 'ritat-kort' }, deal), /lastPicture ska vara platsens-slutbild för GIV-2\.1 \(ONE_WAY\)/);
  assert.match(one({ lastPicture: 'platsens-slutbild' }), /lastPicture ska vara ankare för INGANG-2\.1/);
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
