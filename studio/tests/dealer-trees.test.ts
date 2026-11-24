// src/dealer-trees.ts: a tree's 36 steps against his measure (Jakob 2026-11-21: "en giv per kort för respektive spelare"),
// each step's state (finns, prov, saknas) and the one number per tree, on made-up data: today's register changes every
// time a film is judged. Also that Karta's tree map (studio/lib/map-layout.ts treeLayout) draws one line per step.
// Run from the repo root: node --test "studio/tests/dealer-trees.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import {
  MEASURE_SIZE,
  countWord,
  defaultTree,
  homeOf,
  measure,
  nodeCode,
  orderCommand,
  treeCount,
  treeNodes,
  treeSteps,
  treeView,
  type Delivery,
  type TreeDef,
  type TreeEntry,
  type TreeTake,
} from "../../src/dealer-trees.ts";
import { treeLayout } from "../lib/map-layout.ts";
import { verdictOf } from "../lib/verdict.ts";
import { buildGraph, resolveRound, returnFits, type BankData } from "../../src/clip-graph.ts";
import { nodesOf, treePlay } from "../../src/dealer-trees.ts";
import { hubChain, judgedBank } from "../../src/game-director.ts";

const take = (id: string, from: string, to: string, verdict: TreeTake["verdict"], more: Partial<TreeTake> = {}): TreeTake => ({ id, tree: "t", from, to, verdict, byJakob: true, provisional: false, ...more });
const byId = <T extends { id: string }>(list: readonly T[], id: string): T => {
  const hit = list.find((x) => x.id === id);
  assert.ok(hit, `${id} finns`);
  return hit;
};

test("the measure: 36 steps per anchor at the shoe, in the order a round meets them", () => {
  for (const hub of ["READY", "READY-B", "READY-C"]) {
    const steps = measure(hub);
    assert.equal(steps.length, MEASURE_SIZE);
    assert.equal(new Set(steps.map((s) => s.id)).size, MEASURE_SIZE, "no step twice");
    const kinds = Object.fromEntries(["vila", "ingang", "giv", "retur", "utgang", "halkort"].map((k) => [k, steps.filter((s) => s.kind === k).length]));
    assert.deepEqual(kinds, { vila: 1, ingang: 1, giv: 16, retur: 16, utgang: 1, halkort: 1 });
    assert.deepEqual([steps[0].id, steps[1].id, steps[34].id, steps[35].id], ["IDLE>IDLE", `IDLE>${hub}`, `${hub}>IDLE`, "IDLE>REVEAL(D.C2)"]);
    assert.ok(steps.filter((s) => s.kind === "giv").every((s) => s.from === hub && s.card === s.to), "every deal leaves the tree's anchor for its card");
    assert.ok(steps.filter((s) => s.kind === "retur").every((s) => s.to === hub), "every return goes back to the anchor, not to A1");
    assert.ok(!steps.some((s) => s.card === "D.C3"), "DC3 is not counted");
  }
  // An anchor variant at the shoe is a take of A2.1's edge in the bank's graph.
  assert.equal(byId(measure("READY-C"), "READY-C>P4.C1").edge, "READY>P4.C1");
  assert.equal(byId(measure("READY"), "READY>P4.C1").edge, "READY>P4.C1");
});

test("a step's state: finns, prov or saknas, read from the verdicts and never set", () => {
  const takes: TreeTake[] = [
    take("vila", "IDLE", "IDLE", "godkand"),
    take("vantar-p4c1", "READY-C", "P4.C1", "vantar", { byJakob: false }),
    take("under-p5c1", "READY-C", "P5.C1", "underkand"),
    take("via-p6c1", "READY-B", "P6.C1", "primar"),
    take("gone-p1c1", "READY-C", "P1.C1", "primar", { archived: true }),
    take("own-p3c1", "READY-C", "P3.C1", "godkand"),
    take("via-p3c1", "READY-B", "P3.C1", "godkand"),
    take("via-vantar-p7c1", "READY-B", "P7.C1", "vantar"),
    take("given-p2c1", "READY-C", "P2.C1", "variant", { byJakob: false, provisional: true }),
  ];
  const deliveries: Delivery[] = [{ order: "ord-p4c2", tree: "t", from: "READY-C", to: "P4.C2" }];
  const steps = treeSteps("READY-C", ["READY-B"], takes, deliveries);
  assert.equal(steps.length, MEASURE_SIZE);
  const at = (id: string) => byId(steps, id);

  assert.equal(at("IDLE>IDLE").state, "finns");
  assert.deepEqual([at("READY-C>P4.C1").state, at("READY-C>P4.C1").take], ["prov", "vantar-p4c1"], "a film waiting for his verdict");
  assert.deepEqual([at("READY-C>P4.C2").state, at("READY-C>P4.C2").deliveries], ["prov", ["ord-p4c2"]], "an order delivered, not in the bank");
  assert.equal(at("READY-C>P5.C1").state, "saknas", "only a film judged Inte bra");
  assert.deepEqual([at("READY-C>P6.C1").state, at("READY-C>P6.C1").via], ["finns", "READY-B"], "the other anchor stands in");
  assert.deepEqual([at("READY-C>P1.C1").state, at("READY-C>P1.C1").takes], ["saknas", 0], "an archived take is left out");
  assert.deepEqual([at("READY-C>P3.C1").take, at("READY-C>P3.C1").via], ["own-p3c1", null], "the tree's own film before a stand-in at the same verdict");
  assert.deepEqual(at("READY-C>P3.C1").ids, ["own-p3c1", "via-p3c1"], "the films panel lists the tree's films on the step, its stand-ins' too");
  assert.deepEqual(at("READY-C>P1.C1").ids, [], "not an archived one");
  assert.equal(at("READY-C>P7.C1").state, "saknas", "a stand-in waiting for a verdict does not make the step a trial");
  assert.deepEqual([at("READY-C>P2.C1").state, at("READY-C>P2.C1").byJakob, at("READY-C>P2.C1").provisional], ["finns", false, true], "a verdict given for him counts, marked as not his");
  assert.equal(at("READY-C>IDLE").state, "saknas");

  // The one number: the steps that have a film, of 36.
  assert.deepEqual(treeCount(steps), { have: 4, total: 36 });
  assert.equal(countWord(treeCount(steps)), "4/36");
  assert.equal(countWord(treeCount(treeSteps("READY", [], []))), "0/36");
});

test("a tree that shares another plays its films; the view opens on the tree the game plays", () => {
  const casino: TreeDef = { id: "casino", name: "Casino", state: "spelas", root: "a1", anchors: [{ entry: "a1" }, { entry: "a21" }] };
  const ingangen: TreeDef = { id: "ingangen", name: "Ingången", state: "spelas", root: "a1", anchors: [], shares: "casino" };
  const tatuerad: TreeDef = { id: "tatuerad", name: "Tatuerad", state: "byggs", root: "t1", anchors: [{ entry: "t1" }, { entry: "t23" }] };
  const trees = [tatuerad, ingangen, casino];
  const entries = new Map<string, TreeEntry>([
    ["a1", { id: "a1", role: "ankare", node: "IDLE" }],
    ["a21", { id: "a21", role: "ankare", node: "READY" }],
    ["t1", { id: "t1", role: "ankare", node: "IDLE" }],
    ["t23", { id: "t23", role: "ankare", node: "READY-C" }],
  ]);
  const takes = [take("c-vila", "IDLE", "IDLE", "primar", { tree: "casino" }), take("t-giv", "READY-C", "P4.C1", "godkand", { tree: "tatuerad" })];

  assert.equal(homeOf(ingangen, trees).id, "casino");
  assert.equal(homeOf(casino, trees).id, "casino");
  const views = trees.map((t) => treeView("paow", t, trees, entries, takes));
  const [t, i, c] = views;
  assert.ok(views.every((v) => v.steps.length === MEASURE_SIZE));
  assert.deepEqual([c.count, i.count, t.count], [{ have: 1, total: 36 }, { have: 1, total: 36 }, { have: 1, total: 36 }]);
  assert.equal(i.home, "casino");
  assert.equal(c.hub, "READY");
  assert.equal(t.hub, "READY-C", "a tree is measured from its own anchor at the shoe");
  assert.equal(byId(t.steps, "READY-C>P4.C1").state, "finns");
  assert.equal(byId(c.steps, "READY>P4.C1").state, "saknas", "another tree's film does not count");

  assert.equal(defaultTree(trees)?.id, "casino", "the first tree the game plays that shares none");
  assert.equal(defaultTree([tatuerad])?.id, "tatuerad");
  assert.equal(defaultTree([]), null);
});

test("the tree's nodes: a picture from Material or an empty box, with his short names", () => {
  const tree: TreeDef = { id: "t", name: "T", state: "byggs", root: "a1", anchors: [{ entry: "a1" }, { entry: "a23" }, { entry: "a22" }, { entry: "p4c1" }] };
  const entries = new Map<string, TreeEntry>([
    ["a1", { id: "a1", role: "ankare", node: "IDLE" }],
    ["a23", { id: "a23", role: "ankare", node: "READY-C" }],
    ["a22", { id: "a22", role: "ankare", node: "READY-B" }],
    ["p4c1", { id: "p4c1", role: "landning", card: "P4.C1" }],
    ["l-p5c1", { id: "l-p5c1", role: "landning", card: "P5.C1", builtOn: ["a1", "a23"] }],
    ["l-p6c1", { id: "l-p6c1", role: "landning", card: "P6.C1", builtOn: ["a1", "elsewhere"] }],
    ["l-p7c1", { id: "l-p7c1", role: "landning", card: "P7.C1", builtOn: ["a23"], state: "ersatt" }],
  ]);
  const nodes = treeNodes(tree, entries);
  assert.equal(nodes.length, 1 + 2 + 16 + 1, "A1, two anchors at the shoe, 16 cards, the hole card");
  const at = (n: string) => nodes.find((x) => x.node === n);
  assert.deepEqual(nodes.slice(0, 3).map((n) => [n.code, n.entry]), [["A1", "a1"], ["A2.3", "a23"], ["A2.2", "a22"]], "the first A2.x anchor is the tree's");
  assert.equal(at("P4.C1")?.entry, "p4c1", "the tree's own A3");
  assert.equal(at("P5.C1")?.entry, "l-p5c1", "a landing made from the tree's anchors only");
  assert.equal(at("P6.C1")?.entry, null, "a landing made from another anchor is not this tree's");
  assert.equal(at("P7.C1")?.entry, null, "a replaced landing is not drawn");
  assert.equal(at("P1.C1")?.entry, null, "no picture: an empty box with its name");
  assert.deepEqual([at("P4.C2")?.code, at("D.C1")?.code, at("REVEAL(D.C2)")?.code], ["A3P4C2", "A3DC1", "DC2 upp"]);
  assert.equal(treeNodes({ ...tree, anchors: [{ entry: "a1" }] }, entries)[1].node, "READY", "a tree without an anchor at the shoe is measured from A2.1");
  assert.equal(nodeCode("READY-B", 2), "S2-A2.2");
});

test("the command for a draft of a missing step is in his names", () => {
  assert.equal(orderCommand("paow", "READY-C", "P4.C2"), 'node tools/order-new.ts paow "A2.3 - A3P4C2"');
  assert.equal(orderCommand("ada", "D.C1", "READY"), 'node tools/order-new.ts ada "A3DC1 - A2.1"');
});

test("the tree map draws one line per step, between boxes it draws", () => {
  for (const [hub, others] of [["READY", []], ["READY-C", ["READY-B"]]] as const) {
    const layout = treeLayout({ hub, others, railText: "x" });
    assert.deepEqual(layout.lines.map((l) => l.id), measure(hub).map((s) => s.id));
    const ids = new Set(layout.boxes.map((b) => b.id));
    for (const line of layout.lines) for (const n of line.nodes) assert.ok(ids.has(n), `${line.id}: ${n} is drawn`);
    const cards = layout.boxes.flatMap((b) => b.cards.map((c) => c.card));
    assert.equal(cards.length, 16, "every card of the measure is a picture box");
    const chips = new Set(layout.lines.map((l) => `${l.chip.x},${l.chip.y}`));
    assert.equal(chips.size, MEASURE_SIZE, "no two chips on the same spot");
    assert.ok(layout.lines.every((l) => l.chip.x >= 0 && l.chip.x <= layout.width && l.chip.y >= 0 && l.chip.y <= layout.height));
    assert.equal(layout.boxes.filter((b) => b.kind === "annan").length, others.length);
  }
});

// What a step shows (Jakob 2026-11-24 at A3P7C1: no film there "actually deals the card the way the return is"): the views
// showed each step's best film by verdict alone, the game plays a deal with the return cut from it. On made-up films of a tree
// on A2.3 with an A2.2: seat 7 has a rejected deal with an approved return and a newer deal and return that are variants;
// seat 5 two approved pairs; seat 6 an approved pair of the tree's own and one from A2.2, where Paow's game deals the seat
// from (SEAT_HUB); seat 4 a deal that waits and one rejected; seat 3 a rejected deal.
test("a step's shown return continues its shown deal, and both are the films the game plays in the tree", () => {
  type Made = { id: string; clip: string; frames: [number, number]; from: string; to: string; decision?: string; variant?: boolean };
  const pair = (seat: number, word: string, from: string, deal: Partial<Made> = {}, back: Partial<Made> = {}): Made[] => [
    { id: `p${seat}-${word}-deal`, clip: `p${seat}-${word}`, frames: [0, 60], from, to: `P${seat}.C1`, decision: "ACCEPTED", ...deal },
    { id: `p${seat}-${word}-back`, clip: `p${seat}-${word}`, frames: [61, 90], from: `P${seat}.C1`, to: from, decision: "ACCEPTED", ...back },
  ];
  const one = (id: string, from: string, to: string, decision?: string): Made => ({ id, clip: id, frames: [0, 40], from, to, decision });
  const made: Made[] = [
    one("rest", "IDLE", "IDLE", "ACCEPTED"), one("in", "IDLE", "READY-C", "ACCEPTED"), one("out", "READY-C", "IDLE", "ACCEPTED"),
    one("b-in", "IDLE", "READY-B", "ACCEPTED"), one("b-out", "READY-B", "IDLE", "ACCEPTED"),
    ...pair(7, "old", "READY-C", { decision: "REJECTED" }), ...pair(7, "new", "READY-C", { variant: true }, { variant: true }),
    ...pair(5, "a", "READY-C"), ...pair(5, "b", "READY-C"),
    ...pair(6, "own", "READY-C"), ...pair(6, "b", "READY-B"),
    one("p4-waits", "READY-C", "P4.C1"), one("p4-fell", "READY-C", "P4.C1", "REJECTED"), one("p3-fell", "READY-C", "P3.C1", "REJECTED"),
  ];
  const review = (m: Made) => (m.decision ? { review: { decision: m.decision, ...(m.variant ? { acceptedAs: "VARIANT" } : {}), userAccepted: m.decision === "ACCEPTED" } } : {});
  // A return starts on the frame after its deal's last, as a film cut in two does.
  const seam = (m: Made) => (m.id.endsWith("-back") ? { motion: { startsOn: { clip: m.id.replace(/-back$/, "-deal"), frame: m.frames[0] } } } : {});
  const bank = {
    jobs: [], edits: [], derived: made.map(({ id, clip, frames, from, to }) => ({ id, clip, frames, from, to })),
    motions: Object.fromEntries(made.map((m) => [m.id, { ...review(m), ...seam(m) }])),
    media: Object.fromEntries(made.map((m) => [m.id, { video: `assets/motions/${m.clip}/source.mp4` }])),
  } as unknown as BankData;

  // The tree, and every film placed in it with its verdict, as tools/dealer-tree.ts placedTakes gives them.
  const tree: TreeDef = { id: "t", name: "T", state: "byggs", root: "a1", anchors: [{ entry: "a1" }, { entry: "a23" }, { entry: "a22" }] };
  const entries = new Map<string, TreeEntry>([["a1", { id: "a1", role: "ankare", node: "IDLE" }], ["a23", { id: "a23", role: "ankare", node: "READY-C" }], ["a22", { id: "a22", role: "ankare", node: "READY-B" }]]);
  const all = buildGraph(bank, { dealer: "paow" });
  const takes: TreeTake[] = Object.values(all.takes).map((t) => { const [from, to] = nodesOf(t.edge, t.hub), v = verdictOf(t); return { id: t.id, tree: "t", from, to, verdict: v.verdict, byJakob: v.byJakob, provisional: v.provisional }; });
  const view = treeView("paow", tree, [tree], entries, takes, [], bank), plain = treeView("paow", tree, [tree], entries, takes);
  assert.deepEqual([view.hub, view.others], ["READY-C", ["READY-B"]]);

  // The game with this tree, as the page builds it (?trad=t), and what it plays to a card and back to the shoe.
  const cut = { schemaVersion: 1, dealer: "paow", tree: "t", name: "T", home: "t", hub: view.hub, count: view.count, own: takes.map((t) => t.id), drop: [] };
  const game = buildGraph(judgedBank(treePlay(bank, "t", { status: 200, answer: cut }, "Paow").bank), { dealer: "paow" });
  const plays = (steps: { from: string; to: string }[]) => resolveRound(game, steps).map((s) => s.take?.id ?? null);
  const shown = (card: string) => { const deal = view.steps.find((s) => s.kind === "giv" && s.card === card)!, back = view.steps.find((s) => s.kind === "retur" && s.card === card)!; return { deal, back, films: [deal.take, back.take] }; };

  for (const card of ["P5.C1", "P7.C1"]) {
    const { deal, back, films } = shown(card);
    assert.deepEqual(films, plays([{ from: "READY", to: card }, { from: card, to: "READY" }]), `${card}: the view shows the game's deal and return`);
    assert.ok(returnFits(all.takes[back.take!], all.takes[deal.take!]), `${card}: the shown return continues the shown deal`);
  }
  assert.deepEqual(shown("P7.C1").films, ["p7-new-deal", "p7-new-back"], "the variant deal with its own return, not the approved return of a rejected deal");
  assert.deepEqual([shown("P7.C1").back.verdict, shown("P7.C1").back.state], ["variant", "finns"], "the step says the shown film's verdict");
  assert.deepEqual(shown("P5.C1").films, ["p5-b-deal", "p5-b-back"], "among equals the game plays the newest pair");
  // Seat 6: the game deals it from A2.2 when that pose's four films play, so both steps show A2.2's films, given from there.
  const six = shown("P6.C1"), fromB = hubChain(game, "READY-B", "P6.C1");
  assert.deepEqual(six.films, fromB?.slice(1, 3).map((s) => s.take?.id), "the deal and the return the game plays from A2.2");
  assert.deepEqual([six.films, six.deal.via, six.back.via], [["p6-b-deal", "p6-b-back"], "READY-B", "READY-B"]);
  assert.ok(returnFits(all.takes[six.back.take!], all.takes[six.deal.take!]));

  // Only which film is shown changes: every step keeps its state and its films, the shown one first; a step without an approved film is as it was.
  for (const [k, s] of view.steps.entries()) {
    assert.deepEqual([s.state, s.takes, [...s.ids].sort()], [plain.steps[k].state, plain.steps[k].takes, [...plain.steps[k].ids].sort()], s.id);
    if (s.take) assert.equal(s.ids[0], s.take, `${s.id}: the shown film is listed first`);
  }
  assert.deepEqual(view.count, plain.count);
  const at = (id: string) => byId(view.steps, id);
  assert.deepEqual([at("READY-C>P4.C1").state, at("READY-C>P4.C1").take, at("READY-C>P4.C1").verdict], ["prov", "p4-waits", "vantar"], "a film that waits is shown as before");
  assert.deepEqual([at("READY-C>P3.C1").state, at("READY-C>P3.C1").take], ["saknas", null], "a rejected film is not shown");
});

// The game with one tree (?trad=<id>, src/game-page.ts; Jakob 2026-11-23): the contract, on made-up takes. Tree "t" stands on
// A2.3 (READY-C), tree "c" on A2.1; Borta and an older A2.3 attempt are placed in no tree; "x-p1" is another dealer's.
test("one tree in the game: without the word the bank is untouched; with it the tree's takes and the ownerless ones play, never another tree's", () => {
  const take = (id: string, from: string, to: string, dealer?: string) => ({ id, clip: id, frames: [0, 40] as [number, number], from, to, ...(dealer ? { dealer } : {}) });
  const derived = [
    take("t-in", "IDLE", "READY-C"), take("t-p1", "READY-C", "P1.C1"), take("t-p1-back", "P1.C1", "READY-C"),
    take("c-in", "IDLE", "READY"), take("c-p1", "READY", "P1.C1"), take("c-rest", "IDLE", "IDLE"), take("c-p6", "READY-B", "P6.C1"),
    take("borta", "IDLE", "AWAY"), take("old-23", "READY-C", "P2.C1"), take("x-p1", "READY", "P1.C1", "nova"),
  ];
  const bank = { jobs: [], edits: [], derived, motions: Object.fromEntries(derived.map((d) => [d.id, { review: { decision: "ACCEPTED" } }])) } as unknown as BankData;
  const before = structuredClone(bank);
  const cut = { schemaVersion: 1, dealer: "paow", tree: "t", name: "Tatuerad", home: "t", hub: "READY-C", count: { have: 3, total: 36 }, own: ["t-in", "t-p1", "t-p1-back"], drop: ["c-in", "c-p1", "c-rest", "c-p6"] };
  const takes = (b: BankData, dealer = "paow") => Object.keys(buildGraph(judgedBank(b), { dealer }).takes).sort();

  const plain = treePlay(bank, null, null, "Paow");
  assert.equal(plain.bank, bank, "without ?trad= the game plays the bank it read");
  assert.equal(plain.line, null);

  const one = treePlay(bank, "t", { status: 200, answer: cut }, "Paow");
  assert.equal(one.line, "Tatuerad 3/36: kort utan film läggs utan hand");
  assert.deepEqual(takes(one.bank), ["borta", "old-23", "t-in", "t-p1", "t-p1-back"], "the tree's takes and the ones no tree owns; none of tree c");
  const graph = buildGraph(judgedBank(one.bank), { dealer: "paow" });
  assert.deepEqual([graph.takes["t-in"].edge, graph.takes["t-p1"].edge, graph.takes["t-p1"].hub], ["IDLE>READY", "READY>P1.C1", null], "the tree's A2.3 is the game's shoe");
  assert.equal(graph.takes["old-23"].hub, "READY-C", "a take of no tree stays as it was");
  assert.deepEqual(takes(one.bank, "nova"), ["x-p1"], "another dealer's takes are not touched");
  assert.deepEqual(bank, before, "the bank read is not changed");

  // An unknown tree, a tree without films, an answer that is no cut (a lab server not yet restarted) or none: as without the word.
  const usual = " Spelet spelar som vanligt, med alla hennes filmer.";
  for (const [word, reply, line] of [
    ["nej", { status: 404, answer: { error: 'paow har inget träd "nej".' } }, `Paow har inget träd "nej".${usual}`],
    ["t", { status: 200, answer: { ...cut, count: { have: 0, total: 36 } } }, `Tatuerad har inga filmer än.${usual}`],
    ["t", { status: 200, answer: { schemaVersion: 1, dealer: "paow", trees: [] } }, `Trädet "t" kunde inte läsas.${usual}`],
    ["t", null, `Trädet "t" kunde inte läsas.${usual}`],
    ["T Ä", null, `"T Ä" är inget träd.${usual}`],
  ] as const) {
    const out = treePlay(bank, word, reply, "Paow");
    assert.equal(out.bank, bank, `${word}: the bank as it is`);
    assert.equal(out.line, line);
  }
});
