// The guide Ny film's contract (studio/lib/new-film.ts): Karta's "Beställ" address names the dealer, the tree and the step,
// and Bordet reads back exactly that step and the order it is made as; an old address that named the order's step and card
// leads to the same step; and an order of a tree goes from the tree's own anchor picture where that is not the one that holds.
// Run: node --test "studio/tests/new-film.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_NODE } from "../../src/clip-graph.ts";
import { treeView, type TreeDef, type TreeEntry } from "../../src/dealer-trees.ts";
import { STEPS, stepOfEdge } from "../../src/order-model.ts";
import { guideHref, guideOf, itemOf, kartaHref, pickFor, pickOfWish, treeBase, type StepPick } from "../lib/new-film.ts";

const entries: TreeEntry[] = [
  { id: "a1", role: "ankare-1", node: "IDLE", state: "gäller" },
  { id: "a23-tree", role: "ankare-2.3", node: "READY-C", state: "kandidat" },
];
const tree: TreeDef = { id: "tatuerad", name: "Tatuerad", state: "byggs", root: "a1", anchors: [{ entry: "a1" }, { entry: "a23-tree" }] };
const view = treeView("paow", tree, [tree], new Map(entries.map((e) => [e.id, e])), []);

const read = (href: string) => {
  const url = new URL(href, "http://lab");
  assert.equal(url.pathname, "/bordet/");
  return { guide: guideOf(url.searchParams), dealer: url.searchParams.get("dealer") };
};

test("Karta's Beställ opens the guide on the dealer, the tree and the step it names", () => {
  const cases: [StepPick, string, string | null][] = [
    [{ from: "READY-C", to: "P4.C2" }, "GIV-2.3", "P4.C2"],
    [{ from: "P4.C2", to: "READY-C" }, "RETUR-2.3", "P4.C2"],
    [{ from: "IDLE", to: "READY-C" }, "INGANG-2.3", null],
    [{ from: "READY-C", to: "IDLE" }, "UTGANG-2.3", null],
    [{ from: "IDLE", to: "IDLE" }, "VILA", null],
    [{ from: "IDLE", to: REVEAL_NODE }, "HALKORT", null],
    [{ from: "D.C1", to: "READY-C" }, "RETUR-2.3", "D.C1"],
  ];
  for (const [pick, step, target] of cases) {
    const { guide, dealer } = read(guideHref("paow", "tatuerad", pick));
    assert.equal(dealer, "paow");
    assert.deepEqual(guide, { tree: "tatuerad", pick, composition: null });
    const item = itemOf(view, guide!.pick!);
    assert.equal(item.step?.id, `${pick.from}>${pick.to}`, "the tree's own step");
    assert.deepEqual(item.wish, { step, target });
  }
});

test("a step outside the tree's measure is read as it stands: the return to rest", () => {
  const { guide } = read(guideHref("paow", "tatuerad", { from: "P4.C2", to: "IDLE" }, "casino-tatuerad"));
  assert.equal(guide!.composition, "casino-tatuerad");
  const item = itemOf(view, guide!.pick!);
  assert.equal(item.step, null);
  assert.equal(item.card, "P4.C2");
  assert.deepEqual(item.wish, { step: "RETUR-1", target: "P4.C2" });
});

test("words that name nothing are left out, never guessed", () => {
  assert.equal(guideOf(new URLSearchParams("trad=tatuerad&film=A2.3-A3P4C2")), null, "only with lage=bestall");
  assert.deepEqual(guideOf(new URLSearchParams("lage=bestall&trad=Ta%20tuerad&film=A2-A3P4C2")), { tree: null, pick: null, composition: null });
  assert.equal(guideOf(new URLSearchParams("lage=bestall&film=A2.3-A3P4C2-A2.3"))!.pick, null, "two steps are not one");
});

test("the way back names the tree and its step, or the composition", () => {
  assert.equal(kartaHref("paow", "tatuerad", "READY-C>P4.C2"), "/karta/?trad=tatuerad&steg=READY-C%3EP4.C2&dealer=paow");
  assert.equal(kartaHref("paow", "tatuerad", "READY-C>P4.C2", "casino-tatuerad"), "/karta/?komposition=casino-tatuerad&dealer=paow");
});

test("a card chosen on the board moves the step to that card and keeps a step without one", () => {
  const deal = itemOf(view, { from: "READY-C", to: "P4.C2" });
  assert.deepEqual(pickFor(view, deal, "P5.C1"), { from: "READY-C", to: "P5.C1" });
  assert.deepEqual(pickFor(view, itemOf(view, { from: "P4.C2", to: "IDLE" }), "D.C1"), { from: "D.C1", to: "IDLE" }, "outside the measure: the card swapped");
  assert.deepEqual(pickFor(view, itemOf(view, { from: "IDLE", to: REVEAL_NODE }), "P4.C2"), { from: "IDLE", to: REVEAL_NODE }, "the hole card's turn stays");
  assert.deepEqual(pickFor(view, deal, "shoe"), { from: "READY-C", to: "P4.C2" }, "the shoe is no card");
});

test("an old address's step and card lead to the same step", () => {
  for (const def of STEPS.filter((s) => s.kind === "FILM")) {
    const wish = { step: def.key, target: def.card ? "P4.C1" : null };
    const pick = pickOfWish(wish);
    assert.ok(pick, def.key);
    assert.deepEqual(stepOfEdge(pick.from, pick.to), wish, def.key);
  }
});

test("an order goes from the tree's anchor picture where another one holds, and names none where the tree's holds", () => {
  const holding = { id: "a23-new", role: "ankare-2.3", node: "READY-C", state: "gäller", served: "x" };
  const own = { ...entries[1], served: "x" };
  const a1 = { ...entries[0], served: "x" };
  const deal = { step: "GIV-2.3" as const, target: "P4.C2" };
  assert.equal(treeBase(view, deal, [a1, own, holding]), "a23-tree");
  assert.equal(treeBase(view, deal, [a1, { ...own, state: "gäller" }]), null, "the tree's picture holds");
  assert.equal(treeBase(view, { step: "VILA", target: null }, [a1, own, holding]), null, "A1 is the tree's and holds");
  assert.equal(treeBase(view, { step: "RETUR-2.3", target: "P4.C2" }, [a1, own, holding]), null, "the return to A2.3 is made by command");
});
