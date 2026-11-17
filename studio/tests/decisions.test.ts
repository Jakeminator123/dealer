// Beslut: the order of the cards, the words and the addresses on them (studio/lib/decisions.ts).
// Run: node --test "studio/tests/decisions.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { KIND_WORD, answeredAt, askedDay, chosenLabel, entryLine, linkHref, openWord, pageHref, proofHref, replaceEntry, splitDecisions, waitingCount, waitingLine } from "../lib/decisions.ts";

const answer = (value: string, at: string) => ({ value, note: "", at });
const list = [
  { id: "a", answer: null },
  { id: "b", answer: answer("ja", "2026-11-17T10:00:00.000Z") },
  { id: "c", answer: null },
  { id: "d", answer: answer("nej", "2026-11-17T12:00:00.000Z") },
];

test("what waits keeps the register's order; what is answered comes latest first", () => {
  const { waiting, answered } = splitDecisions(list);
  assert.deepEqual(waiting.map((d) => d.id), ["a", "c"]);
  assert.deepEqual(answered.map((d) => d.id), ["d", "b"]);
  assert.equal(waitingCount(list), 2);
  assert.equal(waitingCount([]), 0);
  // An answer taken back puts the entry where the register has it, among the waiting.
  const back = replaceEntry(list, { id: "b", answer: null });
  assert.deepEqual(splitDecisions(back).waiting.map((d) => d.id), ["a", "b", "c"]);
  assert.equal(list[1].answer?.value, "ja", "the list itself is left as it was");
});

test("the words a card and the header use", () => {
  assert.deepEqual(KIND_WORD, { beslut: "Beslut", gora: "Att göra" });
  assert.equal(waitingLine(0), "Inget väntar på dig");
  assert.equal(waitingLine(1), "1 väntar på dig");
  assert.equal(waitingLine(12), "12 väntar på dig");
  assert.equal(entryLine(5), "5 beslut väntar");
  const chips = [{ value: "ja", label: "Ja" }, { value: "nej", label: "Nej" }];
  assert.equal(chosenLabel({ chips, answer: null }), null);
  assert.equal(chosenLabel({ chips, answer: answer("nej", "2026-11-17T12:00:00.000Z") }), "Nej");
  assert.equal(chosenLabel({ chips, answer: answer("kanske", "2026-11-17T12:00:00.000Z") }), null);
  assert.equal(answeredAt("2026-11-17T13:05:00.000Z"), "17 nov 14:05", "Swedish time");
  assert.equal(answeredAt("inte en tid"), "inte en tid");
  assert.equal(askedDay("2026-11-17"), "17 nov");
});

test("an entry's page, outside address and proof as addresses", () => {
  assert.equal(openWord("game.html?table=casino&dealer=paow"), "Öppna spelet");
  assert.equal(openWord("game.html"), "Öppna spelet");
  assert.equal(openWord("studio/prov/?prov=x"), "Öppna i studion");
  assert.equal(openWord("scene3d.html"), "Öppna sidan");
  assert.equal(pageHref("game.html?table=casino&dealer=paow"), "/game.html?table=casino&dealer=paow");
  assert.equal(linkHref("dealer-lake.vercel.app/trailer"), "https://dealer-lake.vercel.app/trailer");
  assert.equal(linkHref("https://github.com/settings/billing"), "https://github.com/settings/billing");
  assert.equal(proofHref("paow-mun", "paow-mun-1-lycka-till.mp4"), "/prov/?prov=paow-mun&fil=paow-mun-1-lycka-till.mp4");
  assert.equal(proofHref("monaco-liv-2"), "/prov/?prov=monaco-liv-2");
});
