// The chain from picture to played film, read from the registers as they stand when the test runs (data/media-roles.json,
// data/dealers.json, data/clip-jobs.json, the register of films and takes, data/orders/): anchors, verdicts, the clip bank's graph and what the game
// plays from it. Each test holds something that is consistent today; a contradiction that still stands is no test here,
// neither red nor todo: it is a line in docs/BRISTER.md. No media is needed: a film
// counts as there when its record says it was made (as the lab server serves it where the file lies), and the checks that
// need a file run only where assets/ is. Nothing reads placements/default.json: what is held does not depend on his plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {motionRegister} from './register-store.ts';
import {
  OPTIONAL_TARGETS, REVEAL_EDGE, SEATS, TARGETS, bankEdges, buildGraph, dealHub, dealersOf, filmCard, hubOf, parseEdge, parseNode, pickIdle,
  resolveRound, returnFits, returnsOf, roundSequence, type BankData, type Graph, type MotionRecord, type Segment, type Take,
} from '../src/clip-graph.ts';
import {SEAT_HUB, STAND_IN_FILM, hubChain, hubDeals, judgedBank, planBeats} from '../src/game-director.ts';
import {ANCHOR_NODE, ANCHOR_ROLE, cutFrameOf, referenceCandidates, stepOf} from '../src/order-model.ts';

// ── The registers as the lab server reads them (tools/build-knowledge.ts localBank), without media ──
const json = (rel: string) => JSON.parse(readFileSync(rel, 'utf8'));
const maybe = (rel: string) => { try { return json(rel); } catch { return null; } };
const posts = motionRegister(process.cwd()).posts() as Map<string, any>, post = (id: string) => posts.get(id) ?? null;
const CLIP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function readBank(): BankData {
  const file = json('data/clip-jobs.json'), named = (list: unknown) => (Array.isArray(list) ? list : []).filter((x: any) => typeof x?.id === 'string' && CLIP.test(x.id));
  const jobs = named(file.jobs), edits = named(file.edits).filter((e: any) => typeof e.source?.clip === 'string'), derived = named(file.derived).filter((d: any) => typeof d.clip === 'string' && CLIP.test(d.clip));
  const motions: Record<string, MotionRecord> = {}, receipts: Record<string, unknown> = {}, media: Record<string, {video: string | null}> = {};
  // A film is there when its file lies in assets/ or its record says it was made (source.frames): the registers, not the disk.
  const film = (clip: string, record: MotionRecord | null) => existsSync(`assets/motions/${clip}/source.mp4`) || Number.isInteger(record?.source?.frames) ? `assets/motions/${clip}/source.mp4` : null;
  for (const t of derived as any[]) {
    const own = post(t.id), clip = post(t.clip);
    motions[t.id] = {source: clip?.source, motion: own?.motion, review: own?.review};
    media[t.id] = {video: film(t.clip, clip ?? own)};
  }
  for (const j of [...jobs, ...edits] as any[]) {
    const record = post(j.id), receipt = maybe(`assets/motions/${j.id}/generation.json`);
    if (record) motions[j.id] = {source: record.source, motion: record.motion, review: record.review};
    if (receipt) receipts[j.id] = {status: receipt.status, output: receipt.output ?? null};
    media[j.id] = {video: film(j.id, record)};
  }
  return {jobs, derived, edits, motions, receipts, media} as BankData;
}
const bank = readBank();
const roles = json('data/media-roles.json') as {dealers: Record<string, {entries: Entry[]}>};
const dealerList = (json('data/dealers.json').dealers as {id: string; name: string; paused: string | null}[]);
type Entry = {id: string; role: string; name?: string; path?: string; node?: string; card?: string; state?: string; builtOn?: string[]; stateBy?: string};
const entriesOf = (dealer: string): Entry[] => roles.dealers[dealer]?.entries ?? [];
const bankDealers = [...new Set(Object.values(dealersOf(bank)))];
const labOf = new Map<string, Graph>(), gameOf = new Map<string, Graph>();
const lab = (dealer: string) => { let g = labOf.get(dealer); if (!g) { g = buildGraph(bank, {dealer}); labOf.set(dealer, g); } return g; };
const game = (dealer: string) => { let g = gameOf.get(dealer); if (!g) { g = buildGraph(judgedBank(bank), {dealer}); gameOf.set(dealer, g); } return g; };
const review = (id: string) => bank.motions?.[id]?.review;
const hasVerdict = (id: string) => { const r = review(id); return !!r && r.inbox !== true && String(r.decision ?? 'PENDING').toUpperCase() !== 'PENDING'; };
const onRequest = (id: string) => bank.motions?.[id]?.motion?.idle?.onRequest === true;
// Anchors by number as the order model names them: role in Material and node in the graph (1 → ankare-1, IDLE).
const anchors = Object.keys(ANCHOR_ROLE) as (keyof typeof ANCHOR_ROLE)[];
const roleOfNode = new Map(anchors.map(a => [ANCHOR_NODE[a], ANCHOR_ROLE[a]]));

// ── Material: which picture holds ────────────────────────────────────────────
// The other poses at the shoe (2.2, 2.3) are a tree's own (data/dealer-trees.json): Jakob archived both A2.2 pictures in Material
// 2026-11-23, and the Casino tree keeps its own for the one deal that starts there.
test('every dealer of data/dealers.json has a block in Material, and anchors 1 and 2.1 each have one picture that holds, at its node', () => {
  for (const d of dealerList) {
    assert.ok(roles.dealers[d.id], `${d.id} has no block in data/media-roles.json`);
    for (const a of ['1', '2.1'] as const) {
      const holds = entriesOf(d.id).filter(e => e.role === ANCHOR_ROLE[a] && e.state === 'gäller' && !e.card);
      assert.equal(holds.length, 1, `${d.name}: ${holds.length} pictures hold for ankare ${a}`);
      assert.equal(holds[0].node, ANCHOR_NODE[a], `${d.name}: ankare ${a} (${holds[0].id}) stands at ${holds[0].node}, not ${ANCHOR_NODE[a]}`);
      assert.equal(typeof holds[0].path, 'string', `${d.name}: ankare ${a} has no file`);
      if (existsSync('assets/anchors')) assert.ok(existsSync(holds[0].path!), `${d.name}: ${holds[0].path} is missing`);
    }
  }
});

test('at most one picture holds on each place (role, node, card; a keystone also its posture), for every dealer', () => {
  for (const [dealer, block] of Object.entries(roles.dealers)) {
    const seen = new Map<string, string>();
    for (const e of block.entries.filter(x => x.state === 'gäller')) {
      const key = `${e.role}|${e.node ?? ''}|${e.card ?? ''}|${e.role === 'keystone' ? (/st[aå]ende/i.test(`${e.id} ${e.name ?? ''}`) ? 'stående' : 'sittande') : ''}`;
      assert.ok(!seen.has(key), `${dealer}: both ${seen.get(key)} and ${e.id} hold on ${key}`);
      seen.set(key, e.id);
    }
  }
});

test('an anchor that holds stands at its own node; a landing that holds stands at its own card; builtOn names pictures of the same dealer', () => {
  for (const [dealer, block] of Object.entries(roles.dealers)) {
    const ids = new Set(block.entries.map(e => e.id));
    for (const e of block.entries) {
      for (const id of e.builtOn ?? []) assert.ok(ids.has(id), `${dealer}: ${e.id} is built on ${id}, which is no picture of hers`);
      if (e.state !== 'gäller') continue;
      const a = anchors.find(x => ANCHOR_ROLE[x] === e.role);
      if (a && !e.card) assert.equal(e.node, ANCHOR_NODE[a], `${dealer}: ${e.id} holds as ${e.role} at ${e.node}`);
      if (e.role === 'landning') assert.equal(parseNode(e.node), e.card, `${dealer}: the landing ${e.id} stands at ${e.node} for ${e.card}`);
    }
  }
});

test('a picture that holds for a dealer who is not paused says who made it hold (stateBy), so that nothing looks like his without being his', () => {
  for (const d of dealerList.filter(x => !x.paused)) for (const e of entriesOf(d.id).filter(x => x.state === 'gäller')) assert.ok(typeof e.stateBy === 'string' && e.stateBy.trim(), `${d.name}: ${e.id} holds without stateBy`);
});

// ── The game's own maps against the registers ────────────────────────────────
test('the game\'s maps name real places and real anchors: SEAT_HUB deals a seat\'s first card from a READY variant that is an anchor of a tree the game plays; STAND_IN_FILM stands one card for another', () => {
  const trees = json('data/dealer-trees.json').dealers as Record<string, {trees: {state: string; anchors: {entry: string}[]}[]}>;
  const played = (dealer: string) => new Set((trees[dealer]?.trees ?? []).filter(t => t.state === 'spelas').flatMap(t => t.anchors.map(a => a.entry)));
  for (const [dealer, map] of Object.entries(SEAT_HUB)) {
    assert.ok(dealerList.some(d => d.id === dealer), `SEAT_HUB names ${dealer}, who is not in data/dealers.json`);
    for (const [card, hub] of Object.entries(map)) {
      assert.ok(TARGETS.includes(card) && filmCard(card) === card && card.endsWith('.C1'), `${dealer}: ${card} is no seat's first card`);
      assert.equal(hubOf(hub), 'READY', `${dealer}: ${hub} is no pose at the shoe`);
      assert.notEqual(hub, 'READY', `${dealer}: ${card} is mapped to plain READY`);
      const role = roleOfNode.get(hub);
      assert.ok(role, `${dealer}: ${hub} is no anchor the order model knows (ANCHOR_NODE)`);
      assert.ok(entriesOf(dealer).some(e => e.role === role && e.node === hub && !e.card && played(dealer).has(e.id)), `${dealer}: the game deals ${card} from ${hub}, but no tree that is played has a ${role} there`);
    }
  }
  for (const [dealer, map] of Object.entries(STAND_IN_FILM)) for (const [card, film] of Object.entries(map)) {
    assert.ok(TARGETS.includes(card) && TARGETS.includes(film) && card !== film, `${dealer}: ${card} → ${film}`);
    assert.ok(!card.startsWith('D.C3') && !film.startsWith('D.C3'), 'the third dealer card is laid without a hand, never with another card\'s film');
  }
});

test('the game opens on a dealer of data/dealers.json who is not paused', async () => {
  const {DEALER} = await import('../src/clip-graph.ts');
  assert.ok(dealerList.some(d => d.id === DEALER && !d.paused), `the first dealer ${DEALER} is paused or unknown`);
});

// ── Verdicts: what is his, what is given for him, what is out of play ────────
test('a Primär is his: no MAIN without his verdict, none given for him (provisional), none with his verdict and a provisional block at once', () => {
  for (const [id, own] of posts) {
    const r = own.review ?? {};
    if (r.acceptedAs === 'MAIN') assert.ok(r.userAccepted === true || typeof r.userReview === 'string', `${id} is Primär without his verdict`);
    if (r.provisional) assert.notEqual(r.acceptedAs, 'MAIN', `${id} is Primär by a provisional verdict`);
    if (r.provisional) assert.ok(r.userAccepted !== true && !r.userReview, `${id} carries both his verdict and one given for him`);
  }
});

test('the game plays judged takes only: every main take of its graph and every take of a full round has a verdict and is not archived', () => {
  for (const dealer of bankDealers) {
    const g = game(dealer);
    for (const e of [...g.edges, ...g.experiments]) if (e.main) {
      assert.ok(hasVerdict(e.main.id) || onRequest(e.main.id), `${dealer} ${e.id}: the game's main take ${e.main.id} has no verdict`);
      assert.ok(!review(e.main.id)?.archived, `${dealer} ${e.id}: the game's main take ${e.main.id} is archived`);
    }
    const round = resolveRound(g, roundSequence({seats: SEATS, reveal: true, thirdDealerCard: true, hubs: SEAT_HUB[dealer]}));
    for (const s of round.filter(x => x.take)) assert.ok(hasVerdict(s.take!.id) && !review(s.take!.id)?.archived, `${dealer} ${s.id}: ${s.take!.id}`);
    for (const deal of Object.values(hubDeals(bank, dealer))) assert.ok(hasVerdict(deal.take) && !review(deal.take)?.archived, `${dealer}: the hub plays ${deal.take}`);
  }
});

test('an archived take never plays, whatever it was: with every main take of today archived, no graph, round, rest, return or hub chooses one', () => {
  for (const dealer of bankDealers) {
    const mains = new Set([...lab(dealer).edges, ...game(dealer).edges].flatMap(e => e.main ? [e.main.id] : []));
    for (const deal of Object.values(hubDeals(bank, dealer))) mains.add(deal.take);
    const motions = {...bank.motions};
    for (const id of mains) motions[id] = {...motions[id], review: {...motions[id]?.review, archived: {by: 'test', at: '2026-11-18', where: 'test'}}};
    const archivedBank = {...bank, motions}, out = (t: Take | null | undefined) => !t || !mains.has(t.id);
    assert.ok([...(judgedBank(archivedBank).jobs ?? []), ...(judgedBank(archivedBank).derived ?? []), ...(judgedBank(archivedBank).edits ?? [])].every(out), `${dealer}: judgedBank keeps an archived take`);
    for (const g of [buildGraph(archivedBank, {dealer}), buildGraph(judgedBank(archivedBank), {dealer})]) {
      for (const e of [...g.edges, ...g.experiments]) assert.ok(out(e.main) && e.variants.every(out), `${dealer} ${e.id}: ${e.main?.id}`);
      for (const s of resolveRound(g, roundSequence({seats: SEATS, reveal: true, thirdDealerCard: true, hubs: SEAT_HUB[dealer]}))) assert.ok(out(s.take), `${dealer} ${s.id}: ${s.take?.id}`);
      for (const d of Object.values(g.takes).filter(t => t.kind === 'DEAL')) { const r = returnsOf(g, d); assert.ok([...r.frame, ...r.anchor].every(out), `${dealer}: a return of ${d.id}`); }
      const rests = g.edge['IDLE>IDLE']?.takes ?? [];
      for (let i = 0; i < 40; i++) assert.ok(out(pickIdle(rests, [], i / 40)?.take), `${dealer}: the rest loop picked an archived take`);
      for (const card of Object.keys(SEAT_HUB[dealer] ?? {})) for (const s of hubChain(g, dealHub(card, SEAT_HUB[dealer]), card) ?? []) assert.ok(out(s.take), `${dealer} ${card}: ${s.take?.id}`);
    }
  }
});

test('a take made from another pose at the shoe (READY-B, READY-C …) is never the main take of a plain edge: the bank does not switch to a newer anchor by itself', () => {
  for (const dealer of bankDealers) for (const g of [lab(dealer), game(dealer)]) for (const e of g.edges) assert.equal(e.main?.hub ?? null, null, `${dealer} ${e.id}: ${e.main?.id} is a take from ${e.main?.hub}`);
});

// ── The node map against what is played ──────────────────────────────────────
// Tables as the engine deals them (src/game-table.ts TableCards): every seat with one to four cards, a split, the dealer with up to
// five, and the hole card's turn; the beats the game plans for them with each dealer's own films (src/game-film.ts predicates).
function tables(): {table: {hands: {seat: number; cards: number[]}[]; dealer: number[]}; signals: {type: string; shoeDraw: number}[]}[] {
  const out: ReturnType<typeof tables> = [];
  let n = 0; const draw = () => ++n;
  const deal = (cards: number[]) => cards.map(c => ({type: 'deal', shoeDraw: c}));
  for (let seat = 1; seat <= 7; seat++) for (let count = 1; count <= 4; count++) { const cards = Array.from({length: count}, draw); out.push({table: {hands: [{seat, cards}], dealer: []}, signals: deal(cards)}); }
  const all = SEATS.map((_, i) => ({seat: i + 1, cards: [draw(), draw()]})), dealerCards = [draw(), draw(), draw(), draw(), draw()];
  out.push({table: {hands: all, dealer: dealerCards.slice(0, 2)}, signals: [...all.map(h => ({type: 'deal', shoeDraw: h.cards[0]})), {type: 'deal', shoeDraw: dealerCards[0]}, ...all.map(h => ({type: 'deal', shoeDraw: h.cards[1]})), {type: 'deal', shoeDraw: dealerCards[1]}]});
  out.push({table: {hands: [], dealer: dealerCards}, signals: [{type: 'reveal', shoeDraw: dealerCards[1]}, ...deal(dealerCards.slice(2))]});
  const split = [{seat: 4, cards: [draw(), draw()]}, {seat: 4, cards: [draw(), draw()]}];
  out.push({table: {hands: split, dealer: []}, signals: deal(split.flatMap(h => h.cards))});
  return out;
}
const MODEL = new Set(bankEdges().map(e => e.id));

test('every step the game can plan is an edge of the node map (or a take of one from another pose at the shoe), for every dealer and every table', () => {
  for (const dealer of bankDealers) {
    const g = game(dealer);
    const filmless = (t: string) => !resolveRound(g, [{from: 'READY', to: t}])[0]?.video, toRest = (f: string) => !!resolveRound(g, [{from: f, to: 'IDLE'}])[0]?.video;
    const fromHub = (hub: string, film: string) => !!hubChain(g, hub, film);
    for (const {table, signals} of tables()) {
      for (const beat of planBeats(table, [], signals, filmless, toRest, STAND_IN_FILM[dealer] ?? {}, SEAT_HUB[dealer] ?? {}, fromHub)) {
        if (!beat.step) { assert.equal(beat.kind, 'PLACE'); continue; }
        const ref = parseEdge(`${beat.step.from}>${beat.step.to}`);
        assert.ok(ref && MODEL.has(ref.base), `${dealer}: the game plans ${beat.step.from}>${beat.step.to}, which is no edge of the map`);
        assert.ok(!ref!.target || [...TARGETS, ...OPTIONAL_TARGETS].includes(ref!.target), `${dealer}: ${ref!.id}`);
      }
    }
  }
  assert.ok(MODEL.has(REVEAL_EDGE));
});

// ── Returns: the one that plays after a deal begins where the deal stops ─────
// For every seat (and the dealer's cards) the deal and its return to the shoe and to rest, as the game resolves them. A return
// that does not continue its deal is allowed only where the clip bank names the seam (two Primär of his that do not fit); one of
// the other hand only where it names that. A return made from a frame of the deal's film is played after the deal cut at that frame.
test('in the game a return continues the deal before it, or the seam is named; a return made from a frame of the deal is played after the deal cut there', () => {
  for (const dealer of bankDealers) {
    const g = game(dealer);
    for (const card of [...TARGETS, ...OPTIONAL_TARGETS]) {
      const hub = dealHub(card, SEAT_HUB[dealer]), viaHub = hub !== 'READY' && !!hubChain(g, hub, filmCard(card));
      const chains = viaHub ? [[{from: hub, to: card}, {from: card, to: hub}]] : [[{from: 'READY', to: card}, {from: card, to: 'READY'}], [{from: 'READY', to: card}, {from: card, to: 'IDLE'}]];
      for (const steps of chains) {
        const [deal, back] = resolveRound(g, steps) as [Segment, Segment];
        if (!deal.take || !back.take) continue;
        const where = `${dealer} ${deal.id} | ${back.id}: ${deal.take.id} then ${back.take.id}`;
        if (!returnFits(back.take, deal.take)) assert.ok(back.notes.some(n => /Skarv/.test(n)), `${where}: a seam nobody names`);
        const a = deal.take.releaseHand, b = back.take.releaseHand;
        if (a && b && a !== b) assert.ok(back.notes.some(n => /hand/i.test(n)), `${where}: another hand comes back, unnamed`);
        // The deal's end is exclusive: it shows up to the frame before the one its return was made from (its own file or the deal's).
        const s = back.take.startsOn;
        if (s && returnFits(back.take, deal.take) && !back.take.anchorStart) assert.equal(deal.end, s.frame, `${where}: the deal stops at ${deal.end}, the return was made from frame ${s.frame}`);
      }
    }
  }
});

// The hole card's turn is a node of the map: the game takes it from the clip bank.
test('the hole card\'s turn is one node of the map, which the game takes from the clip bank', async () => {
  const graph = await import('../src/clip-graph.ts'), game = await import('../src/game-director.ts');
  assert.equal(game.REVEAL_NODE, graph.REVEAL_NODE);
  assert.ok(MODEL.has(`IDLE>${game.REVEAL_NODE}`));
});

// ── Findings of the rescue lane Kedjan (FYND 1 to 11) that have been put right, each held by a test ──
// FYND 1: the anchor a card is dealt from had two sources. The game's (SEAT_HUB: Paow's seat 6 from anchor 2.2, Jakob's own word
// 2026-11-13, "Förvalen han sade ja till" in docs/BESKED.md) is the one; the plan's grip is not. Bordet's default round and the
// deal on Beställ's row for a card followed the grip, so the lab played seat 6 from 2.1, where she has no film.
test('Bordet\'s default round and Beställ\'s row deal a card from the anchor the game deals it from, whatever the plan\'s grip', async () => {
  const B = await import('../studio/lib/bordet.ts'), R = await import('../studio/lib/rounds.ts');
  for (const d of dealerList) for (const card of TARGETS) {
    // The game, with every film there: a seat's two cards (or the dealer's), and the pose its deal of this card starts from.
    const [seat] = card.split('.'), table = seat === 'D' ? {hands: [], dealer: [1, 2]} : {hands: [{seat: Number(seat.slice(1)), cards: [1, 2]}], dealer: []};
    const beats = planBeats(table, [], [{type: 'deal', shoeDraw: 1}, {type: 'deal', shoeDraw: 2}], () => false, () => true, {}, SEAT_HUB[d.id] ?? {}, () => true);
    const pose = beats.find(b => b.kind === 'DEAL' && b.own?.label === card)!.step!.from;
    for (const grip of ['PINCH', 'DRAG']) {
      const deal = stepOf(B.cardWishes(card, {grip}, d.id)[0].step)!;
      assert.equal(ANCHOR_NODE[deal.from as keyof typeof ANCHOR_NODE], pose, `${d.name} ${card}, the plan saying ${grip}: Beställ offers ${deal.key}, the game deals from ${pose}`);
      assert.equal(R.roundFromText(B.roundFor(card, d.id), R.readyRounds()).steps[0]?.from, pose, `${d.name} ${card}: Bordet's round ${B.roundFor(card, d.id)}`);
    }
  }
  assert.equal(B.roundFor('P6.C1', 'paow'), 'A2.2 - A3P6C1 - A2.2'); // his notation since 2026-11-21: the card's anchor is A3 + player + card
});
// FYND 4, fixed by the branch rak-linje: an archived take could still be offered as a reference film or give a deal its last picture.
test('an archived take is never a reference film or a cut frame: with every take of the bank archived, the order model offers none', () => {
  const steps = ['GIV-2.1', 'GIV-2.2', 'GIV-2.3', 'RETUR-2.1', 'RETUR-1'].map(stepOf).filter((s): s is NonNullable<ReturnType<typeof stepOf>> => !!s);
  const ask = (data: BankData) => dealerList.flatMap(d => steps.flatMap(step => TARGETS.flatMap(target => [
    ...referenceCandidates(data as never, {dealer: d.id, step, target}).filter(c => c.kind !== 'RENDERED').map(c => `${d.id} ${step.key} ${target}: reference ${c.take}`),
    ...(['LH', 'RH'] as const).flatMap(hand => cutFrameOf(data as never, {dealer: d.id, step, target, hand}).map(c => `${d.id} ${step.key} ${target}: cut frame ${c.clip}#${c.frame}`))])));
  assert.ok(ask(bank).length > 0, 'the bank as it is offers references and cut frames, so the check below is not empty');
  const ids = [...(bank.jobs ?? []), ...(bank.derived ?? []), ...(bank.edits ?? [])].map(t => t.id);
  const motions = {...bank.motions};
  for (const id of ids) motions[id] = {...motions[id], review: {...motions[id]?.review, archived: {by: 'test', at: '2026-11-18', where: 'test'}}};
  assert.deepEqual(ask({...bank, motions}), []);
});
