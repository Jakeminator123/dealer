// The bot's answer as blocks (studio/components/bot/markdown.ts). Run: node --test "studio/tests/bot-markdown.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { citedNumbers, normTitle, parseAnswer, parseInline, plainAnswer } from "../components/bot/markdown.ts";

const sources = [
  { id: "handoff-lage", titel: "HANDOFF › Läget i banken" },
  { id: "bank-kanter", titel: "Klippbanken › Filmerna per kant, med omdöme" },
  { id: "guide-primara", titel: "Studion › Primära" },
];

test("paragraphs, a list and a heading", () => {
  const blocks = parseAnswer("Kort sagt:\nrundan går.\n\n- ett\n- två\n  fortsätter\n\n## Rubrik\n1. först\n2) sen", sources);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["p", "ul", "h", "ol"],
  );
  assert.deepEqual(blocks[0], { kind: "p", parts: [{ t: "text", v: "Kort sagt:" }, { t: "br" }, { t: "text", v: "rundan går." }] });
  const list = blocks[1] as { items: unknown[] };
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[1], [{ t: "text", v: "två fortsätter" }]);
  assert.equal((blocks[3] as { start: number }).start, 1);
});

test("bold and code; an unclosed ** stays text while the answer streams", () => {
  assert.deepEqual(parseInline("**Godkända:** plats `P4C1`"), [
    { t: "b", v: "Godkända:" },
    { t: "text", v: " plats " },
    { t: "code", v: "P4C1" },
  ]);
  assert.deepEqual(parseInline("ett **halv"), [{ t: "text", v: "ett **halv" }]);
});

test("a mark is the section's title, as the server asks the model to write it", () => {
  assert.deepEqual(parseInline("rakt av [HANDOFF › Läget i banken].", sources), [{ t: "text", v: "rakt av" }, { t: "cite", n: 1 }, { t: "text", v: "." }]);
  // Compared as the server compares: spaces, separators and case.
  assert.deepEqual(parseInline("x [handoff >  läget i BANKEN]", sources), [{ t: "text", v: "x" }, { t: "cite", n: 1 }]);
  // A title with a comma, and two titles with ";".
  assert.deepEqual(parseInline("x [Klippbanken › Filmerna per kant, med omdöme]", sources), [{ t: "text", v: "x" }, { t: "cite", n: 2 }]);
  assert.deepEqual(parseInline("x [Studion › Primära; HANDOFF › Läget i banken]", sources), [{ t: "text", v: "x" }, { t: "cite", n: 3 }, { t: "cite", n: 1 }]);
});

test("numbers and ids also mark; a bracket that names no source stays text", () => {
  assert.deepEqual(parseInline("x [1, 3]", sources), [{ t: "text", v: "x" }, { t: "cite", n: 1 }, { t: "cite", n: 3 }]);
  assert.deepEqual(parseInline("x [bank-kanter]", sources), [{ t: "text", v: "x" }, { t: "cite", n: 2 }]);
  assert.deepEqual(parseInline("x [källa: guide-primara]", sources), [{ t: "text", v: "x" }, { t: "cite", n: 3 }]);
  assert.deepEqual(parseInline("x [4]", sources), [{ t: "text", v: "x [4]" }]);
  assert.deepEqual(parseInline("[A2.1 nyp]", sources), [{ t: "text", v: "[A2.1 nyp]" }]);
  assert.deepEqual(parseInline("[Studion › Primära; okänd]", sources), [{ t: "text", v: "[Studion › Primära; okänd]" }]);
  assert.deepEqual(parseInline("[1]", []), [{ t: "text", v: "[1]" }]);
});

test("while it streams, a mark not yet closed is held back", () => {
  assert.deepEqual(parseAnswer("Läget är gott [HANDOFF › Lä", sources, true), [{ kind: "p", parts: [{ t: "text", v: "Läget är gott" }] }]);
  assert.deepEqual(parseAnswer("Läget är gott [HANDOFF › Lä", sources, false)[0], { kind: "p", parts: [{ t: "text", v: "Läget är gott [HANDOFF › Lä" }] });
});

test("the numbers cited, in order of first mention", () => {
  const blocks = parseAnswer("A [Studion › Primära].\n\n- B [1]\n- C [Studion › Primära]", sources);
  assert.deepEqual(citedNumbers(blocks), [3, 1]);
  assert.equal(normTitle(" HANDOFF»Läget "), "handoff › läget");
});

test("plain text for copying", () => {
  assert.equal(plainAnswer("**Ja** [1]. "), "Ja [1].");
});

test("an empty answer has no blocks", () => {
  assert.deepEqual(parseAnswer("", sources), []);
  assert.deepEqual(parseAnswer("\n\n", sources), []);
});
