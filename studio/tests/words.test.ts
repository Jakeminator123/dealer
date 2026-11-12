// The studio's one table of words (studio/lib/words.ts): names.ts agrees with it, the search finds a word by its other
// names, and the bot's guide carries it. Run from the repo root: node --test "studio/tests/words.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANCHOR_WORDS, WORDS, WORD_GROUPS, findWords } from "../lib/words.ts";
import { edgeName, nodeCode, nodeName } from "../lib/names.ts";
import { WORDS as GUIDE_WORDS } from "../lib/guide.ts";

test("names.ts writes the anchors as the table does, and its answers are unchanged", () => {
  for (const [node, w] of Object.entries(ANCHOR_WORDS)) {
    assert.equal(nodeCode(node), w.code);
    assert.equal(nodeName(node), w.name);
  }
  assert.equal(edgeName("READY>P4.C1"), "A2.1 → P4C1");
  assert.equal(nodeName("READY-B"), "A2.2 hand över");
  assert.equal(nodeCode("P4.C1"), "P4C1");
});

test("every word has one meaning line, a group, and no word stands twice", () => {
  assert.equal(new Set(WORDS.map((w) => w.ord)).size, WORDS.length);
  for (const w of WORDS) {
    assert.ok(w.betyder.length > 10 && !w.betyder.includes("\n"), w.ord);
    assert.ok(WORD_GROUPS.includes(w.grupp), w.ord);
  }
  // Plain words for people: the studio's word for an edge is "Steg", and "kant" is only one of its other names.
  assert.ok(!WORDS.some((w) => /\bkant\b/i.test(w.ord)));
  assert.ok(WORDS.find((w) => w.ord === "Steg")!.aven.includes("kant"));
});

test("a search finds the studio's word from an older name, the word itself first", () => {
  assert.equal(findWords("kant")[0].ord, "Steg");
  assert.equal(findWords("Keystone 1")[0].ord, "A1 vila");
  assert.equal(findWords("READY-B")[0].ord, "A2.2 hand över");
  assert.equal(findWords("REDO B")[0].ord, "A2.2 hand över");
  assert.equal(findWords("vilan")[0].ord, "Vilan");
  assert.equal(findWords("platt")[0].ord, "Inte 3D", "marks do not matter: plätt and platt are one");
  assert.equal(findWords("xyzzy").length, 0);
  assert.equal(findWords("  ").length, WORDS.length);
});

test("the bot's guide carries the table, with the other names", () => {
  const steg = GUIDE_WORDS.find((w) => w.ord === "Steg");
  assert.ok(steg && /Kallas också: kant, edge/.test(steg.betyder));
  assert.ok(GUIDE_WORDS.some((w) => w.ord === "A1 vila" && /IDLE/.test(w.betyder)));
});
