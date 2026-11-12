// Requests to Jakob: status words, answers not yet seen, order and filters (studio/components/requests/status.ts).
// Run: node --test "studio/tests/requests-status.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Post } from "../lib/bot-client.ts";
import { KIND, STATUS, STATUS_ORDER, applyFilter, countUnseen, filters, headingFrom, markSeen, newestFirst, unseenAnswer } from "../components/requests/status.ts";

const post = (id: string, skapad: string, status: Post["status"], svar: string | null = null, andrad = skapad): Post => ({
  id,
  skapad,
  vem: "A",
  typ: "onskemal",
  rubrik: id,
  text: "",
  vy: null,
  sammanfattning: "",
  forslag: "",
  harBild: false,
  status,
  svar,
  andrad,
});

const posts = [
  post("a", "2026-11-10T10:00:00Z", "klar", "Gjort.", "2026-11-11T10:00:00Z"),
  post("b", "2026-11-12T10:00:00Z", "ny"),
  post("c", "2026-11-11T10:00:00Z", "fraga_tillbaka", "Vilken plats?", "2026-11-12T11:00:00Z"),
];

test("every status has a word, a sign and a tone; signs differ", () => {
  for (const s of STATUS_ORDER) assert.ok(STATUS[s].label && STATUS[s].sign && STATUS[s].tone);
  assert.equal(new Set(STATUS_ORDER.map((s) => STATUS[s].sign)).size, STATUS_ORDER.length);
  assert.equal(KIND.fel.label, "Fel");
});

test("an answer is new until it has been shown, and new again when it changes", () => {
  assert.equal(countUnseen(posts, {}), 2);
  const seen = markSeen(posts, {});
  assert.deepEqual(seen, { a: "2026-11-11T10:00:00Z", c: "2026-11-12T11:00:00Z" });
  assert.equal(countUnseen(posts, seen), 0);
  const changed = [...posts.slice(0, 2), { ...posts[2], svar: "Plats 2.", andrad: "2026-11-12T12:00:00Z" }];
  assert.equal(unseenAnswer(changed[2], seen), true);
  assert.equal(unseenAnswer(posts[1], seen), false, "no answer, nothing new");
});

test("seen answers of requests no longer listed are forgotten", () => {
  assert.deepEqual(markSeen([posts[1]], { gone: "x", b: "y" }), { b: "y" });
});

test("newest first by when it was written", () => {
  assert.deepEqual(newestFirst(posts).map((p) => p.id), ["b", "c", "a"]);
});

test("filters: all, then each status that has requests", () => {
  assert.deepEqual(
    filters(posts).map((f) => `${f.value}:${f.count}`),
    ["alla:3", "ny:1", "fraga_tillbaka:1", "klar:1"],
  );
  assert.deepEqual(applyFilter(posts, "klar").map((p) => p.id), ["a"]);
  assert.equal(applyFilter(posts, "alla").length, 3);
});

test("a heading from his own words", () => {
  assert.equal(headingFrom("  Kortet hoppar\nmer text"), "Kortet hoppar");
  assert.equal(headingFrom("x".repeat(100)).length, 70);
  assert.equal(headingFrom(""), "");
});
