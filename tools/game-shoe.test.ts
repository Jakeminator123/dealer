// Shoe and core tests for game/core.ts, game/shoe-proof.ts and game/shoe-source.ts: commitment
// before the burn card, cut card, between-round reserve reshuffle, no mid-round shuffle,
// proof verification, reproducibility, hidden draws, and the lab's seeded/stacked sources.
// Ported in part from scoutgaming test/blackjack/blackjack-core.mjs (commit 0fe56ace3); the core is
// driven like Scout's coordinator would drive it (explicit inputs, wallet applied from effects).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BlackjackCoreError, CONTRACT_VERSION, newGame, publicView, SHOE_RULES, step } from '../game/core.ts';
import type { CoreCommand, CoreConfig, CoreEvent, Funding, GameState, PublicView, StepResult } from '../game/core.ts';
import { digest, replayShuffle, verifyShoe } from '../game/shoe-proof.ts';
import type { ProofDraw, ShoeProof } from '../game/shoe-proof.ts';
import { SHOE_RESERVE_POLICY, roundCardReserve } from '../game/shoe-rules.ts';
import { physicalDeck, seededRandom, sourceOfMode, stackedDrawOrder, stackedRandom, wordsForOrder } from '../game/shoe-source.ts';
import type { RandomPort } from '../game/random-port.ts';
import { secureRandom } from '../game/random-port.ts';

const EMPTY = { main: 0, pp: 0, tp: 0 };
const ONE_BOX = [{ main: 5, pp: 0, tp: 0 }, ...Array.from({ length: 6 }, () => ({ ...EMPTY }))];
const TWO_BOXES = [{ main: 10, pp: 5, tp: 5 }, { ...EMPTY }, { ...EMPTY }, { main: 25, pp: 0, tp: 2 }, { ...EMPTY }, { ...EMPTY }, { ...EMPTY }];
const code = (expected: string) => (error: unknown) => error instanceof BlackjackCoreError && error.code === expected;
const serials = (value: unknown) => JSON.stringify(value).match(/"serial":\d+/g)?.map(s => Number(s.slice(9))) ?? [];
const closingFor = (proof: ShoeProof, bets: Array<{ main: number }>) => ({ status: 'verified' as const, proofDigest: digest(proof), reason: proof.reason,
  policy: SHOE_RESERVE_POLICY, boxes: bets.filter(b => b.main > 0).length });

function reservationsFor(state: GameState, command: CoreCommand): Funding['reserved'] {
  const stake: Record<string, number> = {}, insurance: Record<string, number> = {};
  if (command.op === 'start') command.bets.forEach((b, box) => { const n = b.main + b.pp + b.tp; if (n > 0) stake[box] = n; });
  if (command.op === 'insurance' && state.round) for (const h of state.round.hands) {
    if (command.takeBoxes ? command.takeBoxes.includes(h.box) : command.take === true) insurance[h.box] = h.stake / 2;
  }
  return { stake, insurance };
}

interface Table {
  random: RandomPort; config: CoreConfig; state: GameState; log: CoreEvent[]; publicLog: CoreEvent[]; views: PublicView[]; wallet: number;
  send(command: CoreCommand, funding?: Funding | null): StepResult;
  act(action: string): StepResult;
  complete(): StepResult;
  commandDraws(shoeId: string): ProofDraw[];
}
function table(random: RandomPort = seededRandom('core'), config: CoreConfig = {}): Table {
  const opened = newGame({ random });
  const t: Table = {
    random, config, state: opened.state, log: [...opened.events] as CoreEvent[], publicLog: [...opened.publicEvents] as CoreEvent[],
    views: [opened.view] as PublicView[], wallet: 1000,
    send(command: CoreCommand, funding: Funding | null = { available: t.wallet, reserved: reservationsFor(t.state, command) }) {
      const before = JSON.stringify(t.state);
      const out = step(t.state, command, t.config, { random: t.random, funding });
      assert.equal(JSON.stringify(t.state), before, 'input state is not mutated');
      t.state = out.state; t.log.push(...out.events); t.publicLog.push(...out.publicEvents); t.views.push(out.view);
      for (const e of out.effects) t.wallet += e.direction === 'debit' ? -e.amount : e.amount;
      return out;
    },
    act(action: string) {
      const r = t.state.round!;
      return t.send({ op: 'act', action, roundId: t.state.roundId, turnSeq: t.state.turnSeq, handIndex: r.active, box: r.hands[r.active].box });
    },
    complete() {
      if (t.state.round!.phase === 'insurance') t.send({ op: 'insurance', take: false, roundId: t.state.roundId });
      while (t.state.round!.phase === 'decisions') t.act('stand');
      return t.send({ op: 'collect', roundId: t.state.roundId });
    },
    // What Scout's audit sync attaches: every engine.* draw for that shoe, in order.
    commandDraws: (shoeId: string) => t.log.filter(e => e.type.startsWith('engine.') && e.payload.shoeId === shoeId).flatMap(e => e.payload.draws),
  };
  return t;
}
// Burns cards off the top of the shoe without a round (Scout's test helper), to reach a reserve boundary.
function consumed(t: Table, remaining: number) {
  const shoe = t.state.shoe!;
  while (shoe.cards.length > remaining) {
    const card = shoe.cards.pop()!;
    shoe.proof.draws.push({ position: ++shoe.dealt, kind: 'deal', card });
    shoe.cutReached = shoe.dealt >= SHOE_RULES.cutAfter;
  }
}

test('a new game commits the shoe before the burn card and exposes only the commitment', () => {
  const t = table();
  assert.equal(t.state.contract, CONTRACT_VERSION);
  assert.equal(t.state.shoe!.cards.length, 415, 'one face-down burn card');
  assert.deepEqual(t.state.shoe!.proof.draws.map(d => [d.position, d.kind]), [[1, 'burn']]);
  const [opened] = t.log, p = t.state.shoe!.proof;
  assert.equal(opened.type, 'shoe.opened');
  assert.equal(opened.payload.commitment, digest({ version: p.version, shoeId: p.shoeId, rules: p.rules, nonce: p.nonce, samples: p.samples, policy: p.policy }));
  assert.equal(t.views[0].shoe!.commitment, opened.payload.commitment);
  const text = JSON.stringify([t.views[0], t.publicLog]);
  for (const secret of [p.nonce, '"samples"', '"cards"', '"draws"', '"rng"', p.rng!.receipt]) assert.ok(!text.includes(secret));
  assert.deepEqual(serials(t.views[0]), [], 'burn card and shoe order are private');
  assert.equal(p.rng!.mode, 'seeded');
});

test('one round: stake effects, the first dealt card is shoe draw 2, exactly one settlement', () => {
  const t = table();
  const started = t.send({ op: 'start', bets: TWO_BOXES });
  assert.deepEqual(started.effects, [
    { kind: 'stake', direction: 'debit', source: 'reservation', box: 0, amount: 20 },
    { kind: 'stake', direction: 'debit', source: 'reservation', box: 3, amount: 27 },
  ]);
  assert.equal(t.wallet, 953);
  const firstDraws = started.events.find(e => e.type === 'engine.start')!.payload.draws.map((d: { position: number }) => d.position);
  assert.deepEqual(firstDraws, [2, 3, 4, 5, 6, 7], 'two boxes: 2 + 1 + 2 + hole, right after the burn card');
  assert.equal(started.view.round!.hands[1].cards[0].shoeDraw, 2, 'box 3 (the rightmost live box) gets the first card');
  assert.throws(() => t.send({ op: 'start', bets: TWO_BOXES }), code('ROUND_IN_PROGRESS'));
  const collected = t.complete();
  assert.equal(collected.view.round, null);
  assert.throws(() => t.send({ op: 'collect', roundId: t.state.roundId }), code('NO_ACTIVE_ROUND'), 'no second settlement');
});

test('invalid commands are typed errors and leave state untouched', () => {
  const t = table();
  const bad = (bets: unknown) => () => t.send({ op: 'start', bets } as CoreCommand);
  assert.throws(bad(ONE_BOX.slice(1)), code('INVALID_BETS'));
  assert.throws(bad(Array.from({ length: 7 }, () => ({ ...EMPTY }))), code('INVALID_BETS'));
  assert.throws(bad(ONE_BOX.map(b => ({ ...b, main: b.main ? 2001 : 0 }))), code('INVALID_STAKE'));
  assert.throws(bad([{ main: 4, pp: 0, tp: 0 }, ...ONE_BOX.slice(1)]), code('INVALID_STAKE'));
  assert.throws(bad([{ main: 5.5, pp: 0, tp: 0 }, ...ONE_BOX.slice(1)]), code('INVALID_STAKE'));
  assert.throws(() => t.send({ op: 'teleport' } as unknown as CoreCommand), code('UNKNOWN_COMMAND'));
  assert.throws(() => t.send({ op: 'act', action: 'hit' } as unknown as CoreCommand), code('NO_ACTIVE_ROUND'));
  assert.equal(t.state.version, 0);
});

test('cut card: every round before and across the cut keeps its shoe; the next start closes, verifies and reopens', () => {
  const t = table(seededRandom('transition'));
  const first = t.state.shoe!.id, nonce = t.state.shoe!.proof.nonce;
  let rounds = 0;
  while (!t.state.shoe!.cutReached) {
    t.send({ op: 'start', bets: ONE_BOX });
    assert.equal(t.state.shoe!.id, first, 'no shuffle mid-round, also in the round that crosses the cut');
    t.complete(); rounds++;
    assert.equal(t.state.shoe!.cards.length + t.state.shoe!.dealt, SHOE_RULES.total, 'card conservation');
  }
  assert.ok(rounds > 10 && t.state.shoe!.dealt >= SHOE_RULES.cutAfter);
  assert.ok(!JSON.stringify([t.views, t.publicLog]).includes(nonce), 'nonce private until close');
  const out = t.send({ op: 'start', bets: ONE_BOX });
  assert.deepEqual(out.events.map(e => e.type), ['shoe.closed', 'shoe.opened', 'engine.start']);
  assert.equal(out.view.shuffled, true);
  const [closed, opened, engine] = out.events;
  assert.equal(closed.payload.proof.reason, 'cut-card');
  assert.equal(closed.payload.proof.nonce, nonce);
  assert.notEqual(opened.payload.shoeId, first);
  assert.ok(engine.payload.draws.every((d: { position: number }) => d.position > 1), 'the new burn is not a command draw');
  const proof = { ...closed.payload.proof, commandDraws: t.commandDraws(first) };
  assert.equal(verifyShoe(proof, t.log[0].payload.commitment).status, 'incomplete');
  assert.equal(verifyShoe(proof, t.log[0].payload.commitment, closingFor(proof, ONE_BOX)).status, 'verified');
});

test('reserve: a shoe below the funded boxes reserve is replaced before dealing, an exact one is kept', () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => roundCardReserve(i + 1)), [80, 114, 141, 164, 184, 202, 219]);
  for (const boxes of [2, 4, 7]) for (const deficit of [0, 1]) {
    const t = table(seededRandom(`reserve-${boxes}`)), minimum = roundCardReserve(boxes), id = t.state.shoe!.id;
    consumed(t, minimum - deficit);
    const bets = ONE_BOX.map((b, i) => ({ ...b, main: i < boxes ? 5 : 0 }));
    const out = t.send({ op: 'start', bets });
    assert.equal(out.view.shuffled, Boolean(deficit));
    assert.equal(t.state.shoe!.id === id, !deficit);
    if (deficit) {
      const p = out.events[0].payload.proof;
      assert.equal(p.reason, 'round-reserve');
      assert.deepEqual(p.reserve, { policy: SHOE_RESERVE_POLICY, boxes, minimum });
      const proof = { ...p, commandDraws: p.draws.slice(1) };
      assert.equal(verifyShoe(proof, proof.commitment, closingFor(proof, bets)).status, 'verified');
    }
  }
});

test('never mid-round: an exhausted shoe pauses the round with SHOE_EXHAUSTED instead of reshuffling', () => {
  const t = table(stackedRandom('exhaust', ['5♠', '6♦', '6♥', '10♣'].map(x => ({ r: x.slice(0, -1), s: x.slice(-1) }))));
  t.send({ op: 'start', bets: ONE_BOX });
  assert.equal(t.state.round!.phase, 'decisions');
  const s = structuredClone(t.state); s.shoe!.cards = []; t.state = s;
  assert.throws(() => t.act('hit'), code('SHOE_EXHAUSTED'));
  assert.equal(publicView(t.state).shoe!.remaining, 0);
});

test('tampered nonce, draw, remaining shoe or action log fail verification', () => {
  const t = table(seededRandom('tamper'));
  while (!t.state.shoe!.cutReached) { t.send({ op: 'start', bets: ONE_BOX }); t.complete(); }
  const commitment = t.log[0].payload.commitment, shoeId = t.state.shoe!.id;
  const closed = t.send({ op: 'start', bets: ONE_BOX }).events[0].payload.proof;
  const proof = { ...closed, commandDraws: t.commandDraws(shoeId) }, closing = closingFor(proof, ONE_BOX);
  assert.equal(verifyShoe(proof, commitment, closing).status, 'verified');
  const failed = (mutate: (p: ShoeProof) => void, check: string) => {
    const copy = structuredClone(proof); mutate(copy);
    const result = verifyShoe(copy, commitment, closing);
    assert.equal(result.status, 'failed');
    assert.equal(result.checks.find(c => c.name === check)?.pass, false, check);
  };
  failed(p => { p.nonce = p.nonce.slice(0, -1) + (p.nonce.endsWith('0') ? '1' : '0'); }, 'Opening commitment');
  failed(p => { [p.draws[5].card, p.draws[6].card] = [p.draws[6].card, p.draws[5].card]; }, 'Contiguous draws match RNG order');
  failed(p => { p.remaining!.pop(); }, 'Complete accounting');
  failed(p => { p.commandDraws!.pop(); }, 'Action log matches every dealt card');
});

test('the same seed reproduces state, events and views; another seed does not', () => {
  const run = (seed: string) => { const t = table(seededRandom(seed)); for (let i = 0; i < 8; i++) { t.send({ op: 'start', bets: TWO_BOXES }); t.complete(); } return t; };
  const a = run('seed-a'), b = run('seed-a'), c = run('seed-b');
  assert.deepEqual(b.state, a.state);
  assert.deepEqual(b.log, a.log);
  assert.deepEqual(b.views, a.views);
  assert.equal(b.wallet, a.wallet);
  assert.notEqual(c.state.shoe!.proof.commitment, a.state.shoe!.proof.commitment);
  assert.notDeepEqual(c.publicLog, a.publicLog);
});

test('randomness and ids come only from explicit inputs; the core never reads ambient clock or randomness', (t) => {
  assert.throws(() => newGame({}), code('INPUTS_REQUIRED'));
  assert.throws(() => newGame({ random: { ...seededRandom('x'), nonce: () => 'short' } }), code('INVALID_INPUT'));
  const unjournaled = { ...seededRandom('x'), rng: () => ({ mode: 'secure', shuffle: (items: unknown[]) => [...items] }) } as unknown as RandomPort;
  assert.throws(() => newGame({ random: unjournaled }), code('INVALID_INPUT'));
  for (const [object, name] of [[Math, 'random'], [Date, 'now'], [globalThis.crypto, 'getRandomValues'], [globalThis.crypto, 'randomUUID']] as const) {
    t.mock.method(object as any, name, () => { throw Error(`ambient ${name} used`); });
  }
  const pure = table(seededRandom('ambient'));
  for (let i = 0; i < 3; i++) { pure.send({ op: 'start', bets: TWO_BOXES }); pure.complete(); }
  t.mock.restoreAll();
  const one = newGame({ random: secureRandom() }), two = newGame({ random: secureRandom() });
  assert.notEqual(one.state.shoe!.proof.commitment, two.state.shoe!.proof.commitment);
  assert.equal(one.state.shoe!.proof.rng!.mode, 'secure');
});

test('stacked lab shoe: the listed cards come first after the burn, as a verifiable replay draw named stacked', () => {
  const cards = [{ r: 'A', s: '♠' }, { r: '9', s: '♦' }, { r: 'K', s: '♥' }, { r: '8', s: '♣' }, { r: 'A', s: '♠' }];
  const t = table(stackedRandom('lab', cards));
  const shoe = t.state.shoe!;
  assert.equal(shoe.proof.rng!.mode, 'replay');
  assert.equal(sourceOfMode(shoe.proof.rng!.mode), 'stacked');
  const next = [...shoe.cards].reverse().slice(0, cards.length);
  // serial = deck * 52 + suit (♠ ♥ ♦ ♣) * 13 + rank (A..K) + 1
  assert.deepEqual(next.map(c => ({ r: c.r, s: c.s })), cards, 'draw order from shoe draw 2');
  assert.deepEqual(next.map(c => c.serial), [1, 35, 26, 47, 53], 'each card takes the lowest unused serial of its rank and suit');
  assert.ok(!cards.some(c => c.r === shoe.proof.draws[0].card.r && c.s === shoe.proof.draws[0].card.s && shoe.proof.draws[0].card.serial === 1), 'the burn card comes from the seed');
  // The order replays from its own words, so the proof verifies like any other shoe.
  assert.deepEqual(replayShuffle(shoe.proof.samples).slice(1, 1 + cards.length).map(c => c.serial), [1, 35, 26, 47, 53]);
  while (!t.state.shoe!.cutReached) { t.send({ op: 'start', bets: ONE_BOX }); t.complete(); }
  const firstId = t.state.shoe!.id, commitment = t.log[0].payload.commitment;
  const out = t.send({ op: 'start', bets: ONE_BOX });
  const proof = { ...out.events[0].payload.proof, commandDraws: t.commandDraws(firstId) };
  assert.equal(verifyShoe(proof, commitment, closingFor(proof, ONE_BOX)).status, 'verified');
  assert.equal(t.state.shoe!.proof.rng!.mode, 'seeded', 'later shoes are seeded from the same seed');
});

test('stacked lab shoe: wordsForOrder rebuilds any permutation; invalid stacks are refused', () => {
  const deck = physicalDeck(), order = stackedDrawOrder('perm', [{ r: '2', s: '♣' }]).reverse();
  assert.deepEqual(replayShuffle(wordsForOrder(deck, order)).reverse().map(c => c.serial), order.map(c => c.serial));
  assert.throws(() => stackedRandom('x', Array.from({ length: 9 }, () => ({ r: 'A', s: '♠' }))), /More than 8/);
  assert.throws(() => stackedRandom('x', [{ r: '1', s: '♠' }]), /Unknown card/);
  assert.throws(() => stackedRandom('', [{ r: 'A', s: '♠' }]), /seed/);
  assert.throws(() => stackedRandom('x', []), /1-415/);
});
