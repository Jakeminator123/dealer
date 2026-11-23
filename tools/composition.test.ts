// src/composition.ts, the contract of a composition of node trees (Jakob 2026-11-23): the shares hold over many rounds, a film
// never follows a picture it does not begin on, a return goes home to its own anchor, and a tree alone is today's ?trad=.
// Trees with different hands (another A1) are not put together: not saved and not played. A composition's tempo: the tree's
// before the composition's before the look's, and a film's own speed times it, the tempo never past 2×.
// On made-up trees: the real ones change every time a film is judged.
// Run from the repo root: node --test tools/composition.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {REVEAL_NODE, buildGraph} from '../src/clip-graph.ts';
import {createSession, type Snapshot} from '../game/session.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createLayout} from '../src/game-table.ts';
import {cardRecords} from '../src/game-director.ts';
import {createFilm, filmRate} from '../src/game-film.ts';
import {cardFaces, tableCards} from '../src/game-view.ts';
import {MEASURE_SIZE, cutBank, measure, treeView, type TreeDef, type TreeEntry, type TreeTake} from '../src/dealer-trees.ts';
import {assign, checkComposition, compositionPlay, compositionView, createComposer, handsProblem, linkOf, pickFilm, seams, soloComposition, tempoOf, trace, treeBank, weave,
  type BridgeDef, type CompositionCut, type CompositionDef, type CutTree, type LegBeat, type Move} from '../src/composition.ts';
import {compositionToSave} from './dealer-composition.ts';

// ── Made-up trees: Casino (A1, A2.1, everything) and Tatuerad (its own A1 and A2.3, the seats' first cards and the hole card) ──
const SEATS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
const casino: CutTree = {tree: 'casino', name: 'Casino', share: 80, hub: 'READY', rest: 'a1', shoe: 'a21', own: []};
const tatuerad: CutTree = {tree: 'tatuerad', name: 'Tatuerad', share: 20, hub: 'READY-C', rest: 'a1t', shoe: 'a23', own: []};
const REST_BRIDGE: BridgeDef = {a: 'a1', b: 'a1t', ab: 'assets/x/dit.mp4', ba: 'assets/x/hem.mp4', seconds: 0.2};
const SHOE_BRIDGE: BridgeDef = {a: 'a21', b: 'a23'};
const spec = (bridges: BridgeDef[], trees: CutTree[] = [casino, tatuerad]) => ({trees, bridges, shares: {}, home: 'casino'});
const can = (tree: string, move: Move) => tree === 'casino' || 'reveal' in move || /^P[1-7]\.C1$/.test(move.deal);
const seeded = (seed: number) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** One tree's round of some moves as the game plans it (src/game-director.ts planBeats): from rest, each card and back, to rest. */
function leg(moves: readonly Move[]): LegBeat[] {
  const beats: LegBeat[] = [];
  let atShoe = false;
  moves.forEach((move, i) => {
    if ('reveal' in move) { beats.push({kind: 'REVEAL', step: {from: 'IDLE', to: REVEAL_NODE}}); return; }
    const next = moves[i + 1], last = !next || 'reveal' in next;
    if (!atShoe) beats.push({kind: 'ENTRY', step: {from: 'IDLE', to: 'READY'}});
    beats.push({kind: 'DEAL', step: {from: 'READY', to: move.deal}}, {kind: 'RETURN', step: {from: move.deal, to: last ? 'IDLE' : 'READY'}});
    atShoe = !last;
  });
  return beats;
}
/** The moves of a step, each given to a tree, as legs: a run of moves of one tree is one leg; a move of no tree is a card laid without a hand. */
function legsOf(moves: readonly Move[], trees: readonly (string | null)[]) {
  const legs: {tree: string; beats: LegBeat[]}[] = [];
  for (let i = 0; i < moves.length;) {
    let j = i; while (j < moves.length && trees[j] === trees[i]) j++;
    legs.push(trees[i] === null ? {tree: 'casino', beats: moves.slice(i, j).map(() => ({kind: 'PLACE', step: null}))} : {tree: trees[i]!, beats: leg(moves.slice(i, j))});
    i = j;
  }
  return legs;
}
const FIRST_DEAL: Move[] = [...SEATS.map(s => ({deal: `${s}.C1`})), {deal: 'D.C1'}, ...SEATS.map(s => ({deal: `${s}.C1`})), {deal: 'D.C2'}]; // second cards play the seat's film
const dealsOf = (w: {beats: LegBeat[]; tree: string[]}) => w.beats.flatMap((b, i) => b.kind === 'DEAL' ? [w.tree[i]] : []);

test('andelarna hålls över många rundor: per kort när träden möts vid skon', () => {
  const s = spec([REST_BRIDGE, SHOE_BRIDGE]), random = seeded(1), count = {casino: 0, tatuerad: 0};
  const seats: Move[] = SEATS.map(p => ({deal: `${p}.C1`}));
  for (let round = 0; round < 3000; round++) for (const t of assign(s, seats, can, random)) count[t as 'casino' | 'tatuerad']++;
  const share = count.tatuerad / (count.casino + count.tatuerad);
  assert.ok(Math.abs(share - 0.2) < 0.015, `Tatuerad fick ${(share * 100).toFixed(1)} % av korten, 20 % var satt`);
});

test('andelarna hålls över många rundor: per omgång kort när träden bara möts i vilan', () => {
  const s = spec([REST_BRIDGE]), random = seeded(2), seats: Move[] = SEATS.map(p => ({deal: `${p}.C1`}));
  let tattooed = 0;
  for (let round = 0; round < 4000; round++) {
    const trees = assign(s, seats, can, random);
    assert.equal(new Set(trees).size, 1, 'utan brygga vid skon byter handen inte träd mitt i en omgång kort');
    if (trees[0] === 'tatuerad') tattooed++;
  }
  assert.ok(Math.abs(tattooed / 4000 - 0.2) < 0.02, `Tatuerad fick ${(tattooed / 40).toFixed(1)} % av omgångarna, 20 % var satt`);
});

test('en film följer aldrig på en bild den inte börjar på', () => {
  for (const bridges of [[REST_BRIDGE], [REST_BRIDGE, SHOE_BRIDGE], [SHOE_BRIDGE], []]) {
    const s = spec(bridges), random = seeded(3 + bridges.length);
    for (let round = 0; round < 400; round++) {
      const moves: Move[] = round % 3 === 0 ? FIRST_DEAL : round % 3 === 1 ? [{deal: `P${1 + round % 7}.C1`}] : [{reveal: true}, {deal: 'D.C1'}];
      const woven = weave(s, legsOf(moves, assign(s, moves, can, random)));
      assert.deepEqual(woven.breaks, [], 'ingen skarv utan brygga');
      assert.deepEqual(seams(trace(s, woven), 'a1'), [], 'varje film börjar på bilden före');
      const hops = trace(s, woven);
      if (hops.length) assert.equal(hops.at(-1)!.to, 'a1', 'kedjan slutar i hemmaträdets vila');
    }
  }
});

test('utan brygga spelar bara hemmaträdet, och ett kort som inget träd har läggs utan hand', () => {
  const s = spec([]), random = seeded(9);
  for (let round = 0; round < 200; round++) assert.ok(assign(s, FIRST_DEAL, can, random).every(t => t === 'casino'));
  const only = (tree: string, move: Move) => tree === 'tatuerad' && can(tree, move); // only the tree that cannot be reached has films
  assert.deepEqual(assign(s, [{deal: 'P1.C1'}], only, random), [null]);
  const woven = weave(s, legsOf([{deal: 'P1.C1'}], [null]));
  assert.deepEqual(woven.beats.map(b => b.kind), ['PLACE']);
  assert.deepEqual(woven.bridges, []);
});

test('en retur går hem till sitt eget ankare', () => {
  for (const bridges of [[REST_BRIDGE], [REST_BRIDGE, SHOE_BRIDGE]]) {
    const s = spec(bridges), random = seeded(11 + bridges.length), byId = {casino, tatuerad};
    let switched = 0;
    for (let round = 0; round < 500; round++) {
      const woven = weave(s, legsOf(FIRST_DEAL, assign(s, FIRST_DEAL, can, random)));
      woven.beats.forEach((b, i) => {
        if (b.kind !== 'RETURN') return;
        const deal = woven.beats[i - 1], tree = byId[woven.tree[i] as 'casino' | 'tatuerad'];
        assert.equal(deal.kind, 'DEAL');
        assert.equal(woven.tree[i - 1], woven.tree[i], 'returen spelas av trädet som gav kortet');
        assert.equal(b.step!.from, deal.step!.to, 'returen börjar på kortet given lade');
        const hop = trace(s, woven).find(h => h.beat === i && h.kind === 'RETURN')!;
        assert.ok([tree.shoe, tree.rest].includes(hop.to), `returen slutar på trädets eget ankare, inte ${hop.to}`);
      });
      if (new Set(dealsOf(woven)).size > 1) switched++;
    }
    assert.ok(switched > 50, 'rundorna blandar de två träden');
  }
});

test('vid skon: handen stannar när ankarna möts, går annars via vilan', () => {
  const moves: Move[] = [{deal: 'P1.C1'}, {deal: 'P2.C1'}], legs = legsOf(moves, ['casino', 'tatuerad']);
  const atShoe = weave(spec([REST_BRIDGE, SHOE_BRIDGE]), legs);
  assert.deepEqual(atShoe.beats.map(b => `${b.kind} ${b.step!.from}>${b.step!.to}`), ['ENTRY IDLE>READY', 'DEAL READY>P1.C1', 'RETURN P1.C1>READY', 'DEAL READY>P2.C1', 'RETURN P2.C1>IDLE']);
  assert.deepEqual(atShoe.bridges.map(b => `${b.before}: ${b.from}>${b.to} ${b.film ?? 'klipp'}`), ['3: a21>a23 klipp', '5: a1t>a1 assets/x/hem.mp4']);
  const viaRest = weave(spec([REST_BRIDGE]), legs);
  assert.deepEqual(viaRest.beats.map(b => b.kind), ['ENTRY', 'DEAL', 'RETURN', 'ENTRY', 'DEAL', 'RETURN']);
  assert.deepEqual(viaRest.bridges.map(b => `${b.before}: ${b.from}>${b.to}`), ['3: a1>a1t', '6: a1t>a1']);
  // A tree without a return to the shoe from that card goes through rest although the anchors meet.
  const noReturn = weave(spec([REST_BRIDGE, SHOE_BRIDGE]), legs, () => false);
  assert.deepEqual(noReturn.beats.map(b => b.kind), ['ENTRY', 'DEAL', 'RETURN', 'ENTRY', 'DEAL', 'RETURN']);
  assert.deepEqual(seams(trace(spec([REST_BRIDGE, SHOE_BRIDGE]), noReturn), 'a1'), []);
});

test('ett träd utan andel lånar bara ut det de andra saknar', () => {
  const s = spec([REST_BRIDGE], [{...tatuerad, share: 100}, {...casino, share: 0}]), random = seeded(21);
  for (let round = 0; round < 100; round++) {
    const trees = assign(s, FIRST_DEAL, can, random);
    FIRST_DEAL.forEach((move, i) => assert.equal(trees[i], 'deal' in move && move.deal.startsWith('D.') ? 'casino' : 'tatuerad'));
    assert.deepEqual(seams(trace(s, weave(s, legsOf(FIRST_DEAL, trees))), 'a1'), []);
  }
});

test('en skarv utan brygga döljs inte: den sägs', () => {
  const s = spec([]), woven = weave(s, legsOf([{deal: 'P1.C1'}], ['tatuerad']));
  assert.equal(woven.breaks.length, 2); // to Tatuerad's rest and home again
  assert.equal(seams(trace(s, woven), 'a1').length, 1);
  const composer = createComposer({...s});
  assert.ok(composer.weave(legsOf([{deal: 'P1.C1'}], ['tatuerad'])).breaks.length >= 2);
});

test('en variants andel: filmen väljs efter sina andelar, och utan andelar väljer banken', () => {
  const random = seeded(31), shares = {'giv-a': 80, 'giv-b': 20};
  let b = 0; for (let i = 0; i < 5000; i++) if (pickFilm(shares, ['giv-a', 'giv-b', 'giv-c'], random()) === 'giv-b') b++;
  assert.ok(Math.abs(b / 5000 - 0.2) < 0.02);
  assert.equal(pickFilm(shares, ['giv-c', 'giv-d'], 0.5), null);
  assert.equal(pickFilm(undefined, ['giv-a'], 0.5), null);
});

// ── The drawn composition, on a made-up register ────────────────────────────
const entries = new Map<string, TreeEntry>([
  ['a1', {id: 'a1', role: 'ankare-1', node: 'IDLE'}], ['a21', {id: 'a21', role: 'ankare-2.1', node: 'READY'}],
  ['a1t', {id: 'a1t', role: 'ankare-1', node: 'IDLE'}], ['a23', {id: 'a23', role: 'ankare-2.3', node: 'READY-C'}],
]);
const defs: TreeDef[] = [
  {id: 'casino', name: 'Casino', state: 'spelas', root: 'a1', anchors: [{entry: 'a1'}, {entry: 'a21'}]},
  {id: 'tatuerad', name: 'Tatuerad', state: 'byggs', root: 'a1t', anchors: [{entry: 'a1t'}, {entry: 'a23'}]},
  {id: 'ingangen', name: 'Ingången', state: 'spelas', root: 'a1', anchors: [{entry: 'a1'}, {entry: 'a21'}], shares: 'casino'},
];
const placed = (id: string, tree: string, from: string, to: string, verdict: TreeTake['verdict'] = 'godkand'): TreeTake => ({id, tree, from, to, verdict, byJakob: true, provisional: false});
const takes: TreeTake[] = [
  placed('c-vila', 'casino', 'IDLE', 'IDLE'), placed('c-in', 'casino', 'IDLE', 'READY'), placed('c-ut', 'casino', 'READY', 'IDLE'),
  placed('c-p1', 'casino', 'READY', 'P1.C1', 'primar'), placed('c-p1-b', 'casino', 'READY', 'P1.C1', 'variant'), placed('c-p1-r', 'casino', 'P1.C1', 'READY'),
  placed('c-d1', 'casino', 'READY', 'D.C1'), placed('c-d1-r', 'casino', 'D.C1', 'READY'), placed('c-p2-x', 'casino', 'READY', 'P2.C1', 'underkand'),
  placed('t-in', 'tatuerad', 'IDLE', 'READY-C'), placed('t-p1', 'tatuerad', 'READY-C', 'P1.C1'), placed('t-p1-r', 'tatuerad', 'P1.C1', 'READY-C'),
  placed('t-p3', 'tatuerad', 'READY-C', 'P3.C1'),
];
const views = defs.map(def => treeView('paow', def, defs, entries, takes));
const both: CompositionDef = {id: 'bada', name: 'Båda', trees: [{tree: 'casino', share: 80}, {tree: 'tatuerad', share: 20}], bridges: [{a: 'a1', b: 'a1t', ab: 'assets/x/dit.mp4', ba: 'assets/x/hem.mp4'}]};

test('kompositionen ritad: vad varje steg täcks av, och dess tal', () => {
  const view = compositionView(both, views, takes), at = (key: string) => view.steps.find(s => s.key === key)!;
  assert.equal(view.steps.length, MEASURE_SIZE);
  assert.deepEqual(view.steps.map(s => s.key), measure('READY').map(m => `${m.kind}:${m.card ?? ''}`));
  assert.equal(at('giv:P1.C1').state, 'eget');
  assert.deepEqual(at('giv:P1.C1').parts.map(p => [p.tree, p.how, p.percent]), [['casino', 'eget', 80], ['tatuerad', 'eget', 20]]);
  assert.equal(at('giv:P1.C2').state, 'aterbruk'); assert.equal(at('giv:P1.C2').parts[0].of, 'P1.C1');
  assert.equal(at('giv:D.C1').state, 'lanat'); assert.deepEqual(at('giv:D.C1').lacking, ['tatuerad']); assert.equal(at('giv:D.C1').reach, 'vila');
  assert.equal(at('giv:P3.C1').state, 'lanat'); assert.deepEqual(at('giv:P3.C1').parts.map(p => [p.tree, p.percent]), [['tatuerad', 100]]);
  assert.equal(at('giv:P2.C1').state, 'saknas', 'en underkänd film täcker inget steg');
  assert.equal(at('vila:').state, 'lanat');
  assert.equal(view.home, 'casino');
  assert.equal(view.looks.length, 2, 'två vilobilder: händerna skiljer');
  assert.deepEqual(view.joins.map(j => [j.rest.how, j.rest.film, j.shoe.how]), [['brygga', true, 'ingen']]);
  assert.deepEqual(view.count, {have: view.steps.filter(s => s.state !== 'saknas').length, own: view.steps.filter(s => s.parts.some(p => p.how === 'eget')).length, total: 36});
  // A variant with a share of its own, and the step's best film alone without one.
  assert.deepEqual(at('giv:P1.C1').parts[0].films.map(f => [f.id, f.percent]), [['c-p1', 100], ['c-p1-b', 0]]);
  const shared = compositionView({...both, shares: {'c-p1': 80, 'c-p1-b': 20}}, views, takes).steps.find(s => s.key === 'giv:P1.C1')!;
  assert.deepEqual(shared.parts[0].films.map(f => [f.id, f.percent]), [['c-p1', 80], ['c-p1-b', 20]]); assert.equal(shared.variants, true);
  // A tree that shares another's films is that tree, once.
  assert.deepEqual(compositionView({id: 'x', name: 'X', trees: [{tree: 'ingangen', share: 1}, {tree: 'casino', share: 1}]}, views, takes).trees.map(t => [t.tree, t.share]), [['casino', 2]]);
});

test('ett ensamt träd är dagens trad: samma bank, samma träd för varje kort, inga bryggor', () => {
  const solo = compositionView(soloComposition(defs[1]), views, takes);
  assert.deepEqual(solo.trees.map(t => [t.tree, t.percent, t.hub]), [['tatuerad', 100, 'READY-C']]);
  assert.equal(solo.looks.length, 1);
  const own = takes.filter(t => t.tree === 'tatuerad').map(t => t.id), drop = takes.filter(t => t.tree === 'casino').map(t => t.id);
  const cut: CompositionCut = {schemaVersion: 1, dealer: 'paow', id: 'tatuerad', name: 'Tatuerad', trees: [{...tatuerad, share: 100, own}], drop, bridges: [], shares: {}, home: 'tatuerad', count: solo.count, looks: solo.looks};
  const bank = {jobs: takes.map(t => ({id: t.id, from: t.from, to: t.to})), derived: [{id: 'borta', from: 'READY', to: 'P5.C1'}]};
  assert.deepEqual(treeBank(bank, cut, 'tatuerad'), cutBank(bank, {hub: 'READY-C', own, drop}));
  const s = {trees: cut.trees, bridges: [], shares: {}, home: 'tatuerad'}, moves: Move[] = [{deal: 'P1.C1'}, {deal: 'P3.C1'}];
  assert.deepEqual(assign(s, moves, () => true, seeded(5)), ['tatuerad', 'tatuerad']);
  const beats = leg(moves), woven = weave(s, [{tree: 'tatuerad', beats}]);
  assert.deepEqual(woven.beats, beats); assert.deepEqual(woven.bridges, []); assert.deepEqual(woven.breaks, []);
  // In a composition of two, each tree's bank leaves the other's films out and plays its own anchor at the shoe as the shoe.
  const two = {trees: [{...casino, own: drop}, {...tatuerad, own}], drop: []};
  assert.deepEqual(treeBank(bank, two, 'casino').jobs!.map(j => j.id), drop);
  assert.deepEqual(treeBank(bank, two, 'tatuerad').jobs!.find(j => j.id === 't-p1'), {id: 't-p1', from: 'READY', to: 'P1.C1'});
  assert.equal(treeBank(bank, two, 'tatuerad').derived!.length, 1, 'en film i inget träd följer med');
});

test('registret: det som inte håller sägs', () => {
  const ids = ['casino', 'tatuerad'];
  assert.deepEqual(checkComposition(both, ids), []);
  assert.ok(checkComposition({...both, id: 'Två Träd'}, ids).length);
  assert.ok(checkComposition({...both, trees: [{tree: 'okand', share: 1}]}, ids).some(p => p.includes('okand')));
  assert.ok(checkComposition({...both, trees: [{tree: 'casino', share: 0}]}, ids).some(p => p.includes('över 0')));
  assert.ok(checkComposition({...both, bridges: [{a: 'a1', b: 'a1t', ab: '../hemligt.mp4'}]}, ids).length);
  assert.ok(checkComposition({...both, bridges: [{a: 'a1', b: 'a1'}]}, ids).length);
  assert.equal(linkOf(both.bridges, 'a1t', 'a1') && (linkOf(both.bridges, 'a1t', 'a1') as {film: string}).film, 'assets/x/hem.mp4');
  assert.equal(linkOf(both.bridges, 'a1', 'a1'), 'same'); assert.equal(linkOf(both.bridges, 'a1', 'a23'), null);
});

// Jakob 2026-11-23 21.10: "vi helt enkelt INTE får sätta samman nodträd om de är inkompatibla såsom nu" (Casino's hands are bare,
// Tatuerad's tattooed). Compatible: the same rest picture, A1.
test('träd med olika händer sätts inte samman: sparas inte, och ett träd ensamt går att spara', () => {
  const onDisk = () => true, save = (def: unknown, of = views) => compositionToSave(def, of, takes, onDisk);
  const refused = save(both);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.problems.some(p => p.includes('olika händer') && p.includes('A1') && p.includes('Jakob 2026-11-23')), 'skälet sägs på vanlig svenska, med hans ord');
  assert.match(handsProblem(compositionView(both, views, takes))!, /^Casino och Tatuerad har olika händer/);
  // One tree alone holds, with a tempo of its own: what the tempo of a tree is saved in.
  const alone = save({id: 'casino-snabb', name: ' Casino snabb ', trees: [{tree: 'casino', share: 100}], tempo: 2});
  assert.deepEqual(alone, {ok: true, def: {id: 'casino-snabb', name: 'Casino snabb', trees: [{tree: 'casino', share: 100}], tempo: 2}});
  assert.equal(handsProblem(compositionView(soloComposition(defs[0]), views, takes)), null);
  // Two trees that rest on the same picture are put together as before.
  const more = [...defs, {id: 'kvall', name: 'Kväll', state: 'byggs', root: 'a1', anchors: [{entry: 'a1'}, {entry: 'a21'}]} as TreeDef], same = more.map(def => treeView('paow', def, more, entries, takes));
  const pair = {id: 'casino-kvall', name: 'Casino + Kväll', trees: [{tree: 'casino', share: 80}, {tree: 'kvall', share: 20, tempo: 1.5}]};
  assert.deepEqual(save(pair, same), {ok: true, def: pair});
  assert.equal(compositionView(pair, same, takes).looks.length, 1);
  // An id that is a tree's is still refused, and so is a tempo outside 1 to 2.
  assert.equal(save({id: 'casino', name: 'Casino', trees: [{tree: 'casino', share: 100}]}).ok, false);
  assert.ok(checkComposition({...pair, tempo: 3}, ['casino', 'kvall']).some(p => p.includes('fart')));
  assert.ok(checkComposition({...pair, trees: [{tree: 'casino', share: 1, tempo: 0.5}]}, ['casino', 'kvall']).some(p => p.includes('Farten')));
});

test('tempot: trädets går före kompositionens, som går före utseendets', () => {
  const of = {tempo: 1.5, trees: [{tree: 'casino'}, {tree: 'tatuerad', tempo: 2}]};
  assert.equal(tempoOf(of, 'tatuerad', 1.2), 2, 'trädets eget');
  assert.equal(tempoOf(of, 'casino', 1.2), 1.5, 'kompositionens');
  assert.equal(tempoOf(of, null, 1.2), 1.5, 'en film som inte är något träds (en brygga): kompositionens');
  assert.equal(tempoOf({trees: of.trees}, 'casino', 1.2), 1.2, 'utan kompositionens: utseendets (filmTempo)');
  assert.equal(tempoOf({trees: of.trees}, 'tatuerad', 1.2), 2);
  assert.equal(tempoOf(null, null, undefined), 1); assert.equal(tempoOf({tempo: 9, trees: []}, null, 1.3), 1.3, 'ett tempo utanför 1 till 2 gäller inte');
  // The drawn composition carries the tempos to the game's cut.
  const view = compositionView({...both, tempo: 1.5, trees: [{tree: 'casino', share: 80}, {tree: 'tatuerad', share: 20, tempo: 2}]}, views, takes);
  assert.deepEqual(view.trees.map(t => [t.tree, t.tempo]), [['casino', undefined], ['tatuerad', 2]]);
});

// Jakob 2026-11-23: "spela upp dealerklipp i 1.5x eller 2x ... den nya standarden för respektive klipp". A film's own speed is
// the bank's playbackSpeed; the round's tempo is laid on it and never takes it past 2×.
test('farten: filmens egen fart gånger rundans tempo, och tempot aldrig över 2×', () => {
  assert.equal(filmRate(1, 1), 1); assert.equal(filmRate(1, 2), 2); assert.equal(filmRate(1.25, 1.5), 1.875);
  assert.equal(filmRate(2, 2), 2, '2× på filmen och 2× i tempot är 2×, inte 4×'); assert.equal(filmRate(1.5, 1.5), 2);
  assert.equal(filmRate(4, 2), 4, 'en film som själv ska gå fortare än 2× behåller sin fart'); assert.equal(filmRate(0.5, 2), 1);
  assert.equal(filmRate(NaN, NaN), 1);
});

// ── The game's film player with a composition (src/game-film.ts compose) ────
// A made-up bank: Casino deals seat 4 and the dealer's first card from A2.1 and has the rest film; Tatuerad deals seat 4 from
// A2.3 and has nothing else. A fake film queue records the parts it is handed, as tools/game-view.test.ts does.
// speeds: a film's own speed (the bank's playbackSpeed), by take id.
async function tableGame(speeds: Record<string, number> = {}) {
  const job = ([id, from, to, kind]: string[]) => ({id, kind, target: kind === 'DEAL' ? to : null, from, to, model: 'wan3', duration: 4, ratio: 'auto_1080p', audio: false, promptText: 'fixture', first: {file: {path: 'assets/anchors/x/anchor.png', sha256: 'a'.repeat(64)}}, purpose: 'fixture', dealer: 'paow', ...(speeds[id] ? {playbackSpeed: speeds[id]} : {})});
  const mine = [['c-in', 'IDLE', 'READY', 'ENTRY'], ['c-giv', 'READY', 'P4.C1', 'DEAL'], ['c-retur', 'P4.C1', 'READY', 'RETURN'], ['c-hem', 'P4.C1', 'IDLE', 'RETURN'], ['c-ut', 'READY', 'IDLE', 'RETURN'], ['c-vila', 'IDLE', 'IDLE', 'IDLE'],
    ['c-dealer', 'READY', 'D.C1', 'DEAL'], ['c-dealer-retur', 'D.C1', 'READY', 'RETURN'], ['c-dealer-hem', 'D.C1', 'IDLE', 'RETURN']];
  const hers = [['t-in', 'IDLE', 'READY-C', 'ENTRY'], ['t-giv', 'READY-C', 'P4.C1', 'DEAL'], ['t-retur', 'P4.C1', 'READY-C', 'RETURN'], ['t-ut', 'READY-C', 'IDLE', 'RETURN']];
  const jobs = [...mine, ...hers].map(job);
  const bank = {jobs, motions: Object.fromEntries(jobs.map(j => [j.id, {source: {fps: 30, frames: 120, sha256: 'a'.repeat(64)}, review: {decision: 'ACCEPTED'}, motion: j.id === 'c-vila' ? {idle: {calm: true, weight: 20}} : {physicalEndSide: 'FRONT'}}])),
    receipts: Object.fromEntries(jobs.map(j => [j.id, {status: 'SUCCEEDED'}])), media: Object.fromEntries(jobs.map(j => [j.id, {video: `assets/motions/${j.id}/source.mp4`}]))};
  const cut = {trees: [{...tatuerad, share: 100, own: hers.map(j => j[0])}, {...casino, share: 0, own: mine.map(j => j[0])}], drop: [], bridges: [REST_BRIDGE], shares: {}, home: 'casino'};
  const graphs = Object.fromEntries(cut.trees.map(t => [t.tree, buildGraph(treeBank(bank, cut, t.tree) as never, {dealer: 'paow'})]));
  type Part = {path: string; rest?: boolean; rate?: number; absoluteRate?: boolean};
  const parts: Part[][] = []; let end: () => void = () => {};
  const players = {play(list: Part[], options: {onPart?(i: number): void; onEnd?(): void} = {}) { parts.push(list); end = () => options.onEnd?.(); list.forEach((_, i) => options.onPart?.(i)); }, hurry() {}, preload() {}};
  const film = createFilm(players, graphs.casino, createLayout(defaultPlan()), async () => null, () => 0);
  film.compose({composer: createComposer(cut, seeded(41)), graphs});
  assert.equal(film.composing, true);
  const step = async (snapshot: Snapshot) => { const table = tableCards(snapshot), from = parts.length;
    const played = film.play(snapshot.events, {table, records: cardRecords(table, cardFaces(snapshot))}); await new Promise(r => setTimeout(r, 0)); end(); const result = await played; await new Promise(r => setTimeout(r, 0));
    return {played: parts.slice(from).flat(), gaps: result.gaps}; };
  const s = createSession({balance: 1000, shoe: {mode: 'stacked', seed: 'komposition', cards: 'K♠ 7♦ 6♥ 10♣ 5♦'.split(' ').map(text => ({r: text.slice(0, -1), s: text.slice(-1)}))}});
  const dealt = s.command({op: 'start', bets: [{seat: 4, main: 10}], requestId: 'k1', expectedVersion: s.state().ver});
  /** A part's film in a word: the take's id, or a bridge film's file name. */
  const nameOf = (p: Part) => p.path.split('/').at(-2) === 'x' ? p.path.split('/').at(-1)! : p.path.split('/')[2];
  return {film, deal: () => step(dealt), nameOf};
}

test('spelet spelar kompositionen: trädens filmer med bryggan emellan, och vilan i hemmaträdet', async () => {
  const {film, deal, nameOf} = await tableGame();
  const {played, gaps} = await deal(), chain = played.filter(p => !p.rest).map(nameOf);
  // Seat 4's two cards are Tatuerad's (the second with the seat's film), the dealer's two are lent by Casino (her second with
  // the film of her first, the game's stand-in); every change of tree goes over the bridge, and the chain ends in Casino's rest.
  const tattooed = ['dit.mp4', 't-in', 't-giv', 't-retur', 't-ut', 'hem.mp4'], lent = ['c-in', 'c-dealer', 'c-dealer-hem'];
  assert.deepEqual(chain, [...tattooed, ...lent, ...tattooed, ...lent]);
  assert.ok(played.at(-1)!.rest && played.at(-1)!.path.includes('c-vila'), 'efter kedjan vilar hon i hemmaträdets vilofilm');
  assert.deepEqual(gaps.filter(g => g.startsWith('Skarv') || g.includes('börjar på')), [], 'ingen skarv utan brygga');
  assert.ok(played.every(p => p.rate === undefined), 'utan fart på film eller träd säger ingen del en fart: kön spelar rundans tempo');
  // With no composition the same player is as before: one graph, no bridges.
  film.compose(null); assert.equal(film.composing, false);
});

test('spelet spelar farten: trädets tempo och filmens egen fart på rundans filmer, vilan som filmad', async () => {
  // Tatuerad has a tempo of its own (2×) and its deal a speed of its own (1,5×); Casino follows the round (1,5×), and its
  // dealer film has a speed of its own (1,25×).
  const {film, deal, nameOf} = await tableGame({'t-giv': 1.5, 'c-dealer': 1.25, 'c-vila': 2});
  film.tempo = {round: () => 1.5, tree: tree => tree === 'tatuerad' ? 2 : null};
  const {played} = await deal(), rateOf = (id: string) => { const p = played.find(x => nameOf(x) === id)!; return [p.rate, p.absoluteRate]; };
  assert.deepEqual(rateOf('t-in'), [2, true], 'trädets tempo, sagt av delen själv');
  assert.deepEqual(rateOf('t-giv'), [2, true], '1,5× på filmen gånger 2× i trädet stannar vid 2×');
  assert.deepEqual(rateOf('c-dealer'), [1.875, true], 'filmens 1,25× gånger rundans 1,5×');
  assert.deepEqual(rateOf('c-in'), [undefined, undefined], 'en film som filmad i ett träd utan eget tempo: kön lägger rundans tempo');
  assert.deepEqual(rateOf('dit.mp4'), [undefined, undefined], 'en brygga följer rundans tempo');
  const rest = played.at(-1)!;
  assert.ok(rest.rest && rest.rate === undefined, 'vilan går som filmad, vad dess jobb än säger');
});

test('spelets ord ?komposition=: raden på sidan, och varför när den inte kan spelas', () => {
  const cut = {schemaVersion: 1, dealer: 'paow', id: 'bada', name: 'Båda', trees: [{...casino}, {...tatuerad, rest: 'a1'}], drop: [], bridges: [], shares: {}, home: 'casino', count: {have: 33, own: 22, total: 36}, looks: ['a1']};
  assert.deepEqual(compositionPlay(null, null, 'Paow'), {cut: null, line: null});
  assert.equal(compositionPlay('bada', {status: 200, answer: cut}, 'Paow').line, 'Båda 33/36: kort utan film läggs utan hand');
  assert.equal(compositionPlay('bada', {status: 200, answer: cut}, 'Paow').cut, cut);
  assert.equal(compositionPlay('bada', {status: 200, answer: {...cut, tempo: 1.5}}, 'Paow').line, 'Båda 33/36: kort utan film läggs utan hand · fart 1,5×');
  // Trees with different hands are not played: the game plays as without the word, and the page says why.
  const mixed = compositionPlay('bada', {status: 200, answer: {...cut, trees: [{...casino}, {...tatuerad}], looks: ['a1', 'a1t']}}, 'Paow');
  assert.equal(mixed.cut, null);
  assert.equal(mixed.line, 'Båda spelas inte: träden har olika händer (olika A1), och sådana sätts inte samman. Spelet spelar som vanligt, med alla hennes filmer.');
  assert.match(compositionPlay('finns-inte', {status: 404, answer: {error: 'x'}}, 'Paow').line!, /Paow har ingen komposition "finns-inte"/);
  assert.match(compositionPlay('Fel Ord', null, 'Paow').line!, /är ingen komposition/);
  assert.match(compositionPlay('bada', null, 'Paow').line!, /kunde inte läsas/);
  assert.match(compositionPlay('bada', {status: 200, answer: {...cut, count: {have: 0, own: 0, total: 36}}}, 'Paow').line!, /har inga filmer än/);
});
