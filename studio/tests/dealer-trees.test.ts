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
  assert.equal(orderCommand("pamela", "D.C1", "READY"), 'node tools/order-new.ts pamela "A3DC1 - A2.1"');
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
