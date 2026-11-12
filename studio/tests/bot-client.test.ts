// The bot's client (studio/lib/bot-client.ts): the event-stream reader, the words for errors, and what is read from the
// server's answers. Run from the repo root: node --test "studio/tests/bot-client.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSseParser, fakeAnswer, fakeDraft, httpProblem, readDraft, readFel, readPost, type SseEvent } from "../lib/bot-client.ts";

function collect(pieces: string[]) {
  const events: SseEvent[] = [];
  const comments: string[] = [];
  const parser = createSseParser((e) => events.push(e), (c) => comments.push(c));
  for (const piece of pieces) parser.push(piece);
  parser.end();
  return { events, comments };
}

test("events end at an empty line; data lines join", () => {
  const { events } = collect(['event: kallor\ndata: [{"id":"a","titel":"A"}]\n\n', "event: text\ndata: {\"t\":\"Hej\"}\n\n", "data: rad 1\ndata: rad 2\n\n"]);
  assert.deepEqual(events, [
    { event: "kallor", data: '[{"id":"a","titel":"A"}]' },
    { event: "text", data: '{"t":"Hej"}' },
    { event: "message", data: "rad 1\nrad 2" },
  ]);
});

test("an event split anywhere, also between \\r and \\n, reads the same", () => {
  const whole = 'event: text\r\ndata: {"t":"ett"}\r\n\r\nevent: klar\r\ndata: {}\r\n\r\n';
  const once = collect([whole]).events;
  for (let cut = 1; cut < whole.length; cut++) assert.deepEqual(collect([whole.slice(0, cut), whole.slice(cut)]).events, once, `cut at ${cut}`);
  assert.equal(once.length, 2);
  // "data: a\r" | "\ndata: b": one event with two lines, not two events.
  assert.deepEqual(collect(["data: a\r", "\ndata: b\n\n"]).events, [{ event: "message", data: "a\nb" }]);
});

test("comment lines are the heartbeat, not events", () => {
  const { events, comments } = collect([": tänker\n\n", ":\n", "event: text\ndata: {\"t\":\"x\"}\n\n"]);
  assert.equal(events.length, 1);
  assert.deepEqual(comments, ["tänker", ""]);
});

test("a last event without its empty line is still read at the end", () => {
  assert.deepEqual(collect(["event: klar\ndata: {}"]).events, [{ event: "klar", data: "{}" }]);
});

test("errors in plain Swedish: the server's own words first", () => {
  assert.deepEqual(readFel({ kod: "tak", text: "Taket är nått." }), { kod: "tak", text: "Taket är nått." });
  assert.equal(readFel({ kod: "tak" })?.kod, "tak");
  assert.ok(readFel({ kod: "tak" })!.text.length > 10);
  assert.equal(readFel({ kod: "okänd", text: "x" }), null);
  assert.equal(readFel(null), null);
  assert.equal(httpProblem(429, { kod: "for_manga", text: "Vänta." }).text, "Vänta.");
  assert.equal(httpProblem(401, null).kod, "utloggad");
  assert.equal(httpProblem(405, "Kopian går inte att ändra.").kod, "saknas");
  assert.equal(httpProblem(404, null).kod, "saknas");
  assert.equal(httpProblem(413, null).kod, "for_stor");
  assert.equal(httpProblem(0, null).kod, "natverk");
  assert.equal(httpProblem(502, null).kod, "server");
  for (const status of [0, 401, 404, 413, 429, 500]) assert.match(httpProblem(status, null).text, /^[A-ZÅÄÖ].+\.$/);
});

test("a draft is made safe to show", () => {
  assert.deepEqual(readDraft({ rubrik: " Kortet ", typ: "fel", sammanfattning: "S", forslag: 3 }), { rubrik: "Kortet", typ: "fel", sammanfattning: "S", forslag: "" });
  assert.equal(readDraft({ typ: "annat" }).typ, "onskemal");
  assert.equal(readDraft(null).rubrik, "");
});

test("a post is read with defaults; one without an id is left out", () => {
  const post = readPost({ id: "p1", skapad: "2026-11-12T20:00:00Z", vem: "", typ: "x", rubrik: "", status: "konstig", svar: "  ", harBild: true, vy: { namn: "Karta", adress: "/studio/karta/", val: { kant: "A2.1 → P4C1" } } })!;
  assert.equal(post.vem, "Okänd");
  assert.equal(post.typ, "onskemal");
  assert.equal(post.rubrik, "Utan rubrik");
  assert.equal(post.status, "ny");
  assert.equal(post.svar, null);
  assert.equal(post.harBild, true);
  assert.equal(post.andrad, "2026-11-12T20:00:00Z");
  assert.deepEqual(post.vy, { namn: "Karta", adress: "/studio/karta/", val: { kant: "A2.1 → P4C1" } });
  assert.equal(readPost({ rubrik: "x" }), null);
  assert.equal(readPost("x"), null);
});

test("the fake answers like the real one: sources first, each mark a given section's title", () => {
  for (const q of ["Vad är läget i banken?", "Vad väntar på Jakob?", "Hur hänger det här ihop med Scoutgaming?", "Vad är ankare 2.1?", "Något annat"]) {
    const a = fakeAnswer(q, { namn: "Karta", adress: "/studio/karta/", val: { kant: "A2.1 → P4C1" } });
    assert.ok(a.kallor.length > 0, q);
    const marks = [...a.text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    assert.ok(marks.length > 0, q);
    for (const mark of marks) assert.ok(a.kallor.some((k) => k.titel === mark), `${q}: [${mark}]`);
  }
  assert.match(fakeAnswer("hej", { namn: "Karta", adress: "", val: { kant: "A2.1 → P4C1" } }).text, /Karta · A2\.1 → P4C1/);
});

test("the fake's draft takes the last question as heading and guesses the kind", () => {
  const d = fakeDraft(
    [
      { roll: "du", text: "Kortet hoppar på plats 2, det ser fel ut" },
      { roll: "bot", text: "Det är en variant som spelar där [Klippbanken › Filmerna per kant]. Mer text." },
    ],
    null,
  );
  assert.equal(d.typ, "fel");
  assert.equal(d.rubrik, "Kortet hoppar på plats 2, det ser fel ut");
  assert.equal(d.sammanfattning, "Boten svarade: Det är en variant som spelar där.");
  assert.equal(fakeDraft([{ roll: "du", text: "Vad betyder A2.2?" }], null).typ, "fraga");
});
