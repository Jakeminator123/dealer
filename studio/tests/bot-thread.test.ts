// The panel's conversation and what goes with a question (studio/components/bot/thread.ts).
// Run: node --test "studio/tests/bot-thread.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromKept, threadOf, threadThrough, toKeep, type BotLine, type DuLine, type Line } from "../components/bot/thread.ts";

const du = (id: string, text: string): DuLine => ({ id, roll: "du", text, bild: null, harBild: false, vy: null, niva: "snabb" });
const bot = (id: string, fraga: string, text: string, status: BotLine["status"] = "klar"): BotLine => ({
  id,
  roll: "bot",
  fraga,
  text,
  kallor: [],
  used: null,
  status,
  fel: status === "fel" ? { kod: "tak", text: "Taket." } : null,
  niva: "snabb",
  started: 0,
  beat: 0,
});

const lines: Line[] = [
  du("q1", "Vad är läget?"),
  bot("a1", "q1", "Bra."),
  du("q2", "Och nu?"),
  bot("a2", "q2", "", "fel"),
  { id: "i1", roll: "info", text: "Skickat", href: "/onskemal/", link: "Se" },
  du("q3", "Ankare?"),
  bot("a3", "q3", "A2.1 är nypet.", "stoppad"),
  du("q4", "Mer?"),
  bot("a4", "q4", "", "tanker"),
];

test("the thread is questions with the answers they got; failed ones and notes are left out", () => {
  assert.deepEqual(threadOf(lines), [
    { roll: "du", text: "Vad är läget?" },
    { roll: "bot", text: "Bra." },
    { roll: "du", text: "Ankare?" },
    { roll: "bot", text: "A2.1 är nypet." },
  ]);
});

test("before a question: only what came earlier", () => {
  assert.deepEqual(threadOf(lines, "q3"), [
    { roll: "du", text: "Vad är läget?" },
    { roll: "bot", text: "Bra." },
  ]);
});

test("the last lines only", () => {
  const many: Line[] = [];
  for (let i = 0; i < 20; i++) many.push(du(`q${i}`, `fråga ${i}`), bot(`a${i}`, `q${i}`, `svar ${i}`));
  const thread = threadOf(many, undefined, 12);
  assert.equal(thread.length, 12);
  assert.deepEqual(thread[0], { roll: "du", text: "fråga 14" });
  assert.deepEqual(thread[11], { roll: "bot", text: "svar 19" });
});

test("through an answer: up to and including it", () => {
  assert.deepEqual(threadThrough(lines, "a1"), [
    { roll: "du", text: "Vad är läget?" },
    { roll: "bot", text: "Bra." },
  ]);
});

test("kept for the tab: no pictures, an answer cut off by a reload is marked", () => {
  const kept = toKeep([{ ...du("q", "x"), bild: "data:image/png;base64,AAAA", harBild: true }, bot("a", "q", "halv", "skriver"), bot("b", "q", "", "tanker")]);
  assert.equal((kept[0] as DuLine).bild, null);
  assert.equal((kept[0] as DuLine).harBild, true);
  assert.equal((kept[1] as BotLine).status, "stoppad");
  assert.equal((kept[2] as BotLine).status, "fel");
  assert.deepEqual(fromKept(JSON.parse(JSON.stringify(kept))).length, 3);
  assert.deepEqual(fromKept("x"), []);
  assert.deepEqual(fromKept([{ id: 1 }, null, { id: "a", roll: "konstig" }]), []);
});
