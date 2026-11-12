// Rounds for the Spela view (studio/lib/rounds.ts). Run: node --test "studio/tests/rounds.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, resolveRound, type BankData, type BankJob } from "../../src/clip-graph.ts";
import { defaultPlan } from "../../src/placement-model.ts";
import { formatJakob } from "../lib/names.ts";
import { partsOf } from "../lib/parts.ts";
import { readFileSync } from "node:fs";
import { SEAT_FOUR, V6_FILM, addressOf, contextRound, contextSteps, isReference, matchReady, no3d, placesOf, readAddress, readyRounds, referencePart, roundFacts, roundFromText, roundParts, viewFor } from "../lib/rounds.ts";
import { nearSteps, sameSet, stillOf } from "../components/round/strip.ts";

test("the ready-made rounds, in his notation", () => {
  const all_ = readyRounds();
  assert.deepEqual(all_.map((r) => r.name), ["Plats 4", "Plats 4 · två kort", "Alla platser", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "V6-filmen"]);
  const rounds = all_.filter((r) => !isReference(r));
  assert.ok(rounds.every((r) => !r.errors.length && r.steps.length));
  const [four, v6, all, p1] = rounds;
  assert.equal(formatJakob(four.steps), "A1 - A2.1 - P4C1 - A1");
  assert.deepEqual(four.steps.map((s) => s.take), ["pamela-idle-ready-entry-01", "pamela-p4-c1-plan-deal-02", "pamela-p4-c1-plan-return-idle-01"]);
  assert.equal(four.text, SEAT_FOUR);
  // the bank's films in V6's order: named so that it cannot be taken for the V6 film
  assert.equal(formatJakob(v6.steps), "A2.1 - P4C1 - A2.1 - P4C2 - A2.1");
  assert.equal(v6.sub, "A2.1 - P4C1 - A2.1 - P4C2 - A2.1 · bankens filmer");
  assert.ok(!/V6/.test(v6.name));
  // every seat and the dealer, two cards each, the last deal back to rest and the hole card turned: 1 + 16 × 2 + 1 steps
  assert.equal(all.steps.length, 34);
  assert.equal(`${all.steps.at(-1)!.from}>${all.steps.at(-1)!.to}`, "IDLE>REVEAL(D.C2)");
  assert.equal(formatJakob(p1.steps), "A1 - A2.1 - P1C1 - A1");
  // the text of each goes back to the same steps (the address carries it)
  for (const r of rounds) assert.deepEqual(roundFromText(r.text).steps, r.steps, r.name);
});

test("what he types becomes a round; a ready-made one is recognised; errors are kept", () => {
  const own = roundFromText("A2.1 - P4C1 - A1");
  assert.equal(own.key, "egen");
  assert.deepEqual(own.steps.map((s) => `${s.from}>${s.to}`), ["READY>P4.C1", "P4.C1>IDLE"]);
  assert.equal(roundFromText(" A2.1 - P4C1 - A2.1 - P4C2 - A2.1 ").key, "plats-4-tva");
  assert.equal(roundFromText("A1 - A2.1 - P1C1 - A1").key, "p1");
  const bad = roundFromText("A2 - P4C1");
  assert.equal(bad.steps.length, 0);
  assert.equal(bad.errors.length, 1);
  assert.equal(matchReady([]), null);
});

const video = (id: string) => `assets/motions/${id}/source.mp4`;
const job = (id: string, kind: string, from: string, to: string, extra: Partial<BankJob> = {}): BankJob => ({
  id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_720p", audio: false, promptText: "", first: {}, purpose: "", ...extra,
});
const startsOn = (clip: string, index: number) => ({ first: { frame: { video: video(clip), videoSha256: "", index } } });
const ids = ["pamela-p4-c1-plan-deal-01", "pamela-p4-c1-plan-deal-02", "pamela-p4-c1-plan-return-idle-01", "pamela-p4-c1-plan-return-ready-02", "pamela-idle-ready-entry-01"];
const bank: BankData = {
  jobs: [
    job(ids[0], "DEAL", "READY", "P4.C1"),
    job(ids[1], "DEAL", "READY", "P4.C1"),
    job(ids[2], "RETURN", "P4.C1", "IDLE", startsOn(ids[1], 105)), // continues deal 02 only
    job(ids[3], "RETURN", "P4.C1", "READY", startsOn(ids[0], 98)), // continues deal 01 only
    job(ids[4], "ENTRY", "IDLE", "READY"),
  ],
  motions: Object.fromEntries(ids.map((id) => [id, { source: { frames: 120, fps: 30 } }])),
  media: Object.fromEntries(ids.map((id) => [id, { video: video(id) }])),
};
const graph = buildGraph(bank);

test("a take in its context: a deal with the return that continues it", () => {
  // deal 02 is continued only by the return to A1, so the pair goes there and the bank picks that return
  const deal = contextSteps(graph, "READY>P4.C1", ids[1]);
  assert.equal(deal.error, null);
  assert.deepEqual(deal.steps, [{ from: "READY", to: "P4.C1", take: ids[1] }, { from: "P4.C1", to: "IDLE" }]);
  const segments = resolveRound(graph, deal.steps);
  assert.equal(segments[1].take?.id, ids[2]);
  assert.equal(segments[0].end, 105);
  // deal 01 goes back to A2.1, where its return is
  assert.deepEqual(contextSteps(graph, "READY>P4.C1", ids[0]).steps, [{ from: "READY", to: "P4.C1", take: ids[0] }, { from: "P4.C1", to: "READY" }]);
});

test("a take in its context: a return after the deal it continues; anything else on its own", () => {
  assert.deepEqual(contextSteps(graph, "P4.C1>READY", ids[3]).steps, [{ from: "READY", to: "P4.C1", take: ids[0] }, { from: "P4.C1", to: "READY", take: ids[3] }]);
  assert.deepEqual(contextSteps(graph, "P4.C1>IDLE", ids[2]).steps, [{ from: "READY", to: "P4.C1", take: ids[1] }, { from: "P4.C1", to: "IDLE", take: ids[2] }]);
  assert.deepEqual(contextSteps(graph, "IDLE>READY", ids[4]).steps, [{ from: "IDLE", to: "READY", take: ids[4] }]);
  assert.deepEqual(contextSteps(graph, "READY>P4.C1", null).steps, [{ from: "READY", to: "P4.C1" }, { from: "P4.C1", to: "READY" }]);
  assert.match(contextSteps(graph, "READY>P9.C1", null).error!, /finns inte/);
  assert.match(contextSteps(graph, "READY>P4.C1", "pamela-nothing").error!, /finns inte/);
  const named = contextRound(graph, "READY>P4.C1", ids[1]);
  assert.equal(named.key, "tagning");
  assert.equal(named.name, "Giv 02");
  assert.equal(named.text, `READY>P4.C1@${ids[1]} | P4.C1>IDLE`);
});

test("the address: read and written", () => {
  const read = (q: string) => readAddress(new URLSearchParams(q));
  assert.deepEqual(read(""), { asked: { kind: "none" }, view: "3d" });
  assert.deepEqual(read("runda=A2.1%20-%20P4C1%20-%20A2.1&vy=platt"), { asked: { kind: "runda", text: "A2.1 - P4C1 - A2.1" }, view: "platt" });
  assert.deepEqual(read("kant=READY%3EP4.C1&tagning=pamela-p4-c1-plan-deal-02"), { asked: { kind: "kant", edge: "READY>P4.C1", take: "pamela-p4-c1-plan-deal-02" }, view: "3d" });
  assert.deepEqual(read("kant=READY%3EP4.C1"), { asked: { kind: "kant", edge: "READY>P4.C1", take: null }, view: "3d" });
  const v6 = readyRounds()[1];
  assert.equal(addressOf(v6, "3d"), "?runda=A2.1+-+P4C1+-+A2.1+-+P4C2+-+A2.1");
  assert.equal(addressOf(v6, "platt"), "?runda=A2.1+-+P4C1+-+A2.1+-+P4C2+-+A2.1&vy=platt");
  assert.equal(addressOf(null, "3d"), "");
  assert.deepEqual(read(addressOf(readyRounds()[0], "platt").slice(1)), { asked: { kind: "runda", text: SEAT_FOUR }, view: "platt" });
});

test("the V6 film: a reference of its own, the library's file, one part, only in Inte 3D", () => {
  const film = readyRounds().find(isReference)!;
  assert.equal(film.key, "v6-filmen");
  assert.equal(film.sub, "den färdiga filmen från 10 nov · byter hand · större kort");
  assert.deepEqual(film.steps, []);
  // the file is the library's V6 item, the manifest's visual reference (the lab server hands out what the manifest lists)
  const library = JSON.parse(readFileSync(new URL("../../data/library.json", import.meta.url), "utf8")) as { items: { id: string; path: string; fps: number; frameCount: number; width: number; height: number }[] };
  const item = library.items.find((i) => i.id === V6_FILM.id)!;
  assert.deepEqual({ path: item.path, fps: item.fps, frames: item.frameCount, width: item.width, height: item.height }, { path: V6_FILM.path, fps: V6_FILM.fps, frames: V6_FILM.frames, width: V6_FILM.width, height: V6_FILM.height });
  const manifest = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8")) as { visualReference: { path: string } };
  assert.equal(manifest.visualReference.path, V6_FILM.path);
  // /?runda=v6-filmen opens it, and the address it writes is that, without a view (it is always flat)
  assert.deepEqual(roundFromText("v6-filmen"), film);
  assert.deepEqual(roundFromText(" V6-filmen "), film);
  const asked = readAddress(new URLSearchParams("runda=v6-filmen"));
  assert.equal(roundFromText((asked.asked as { text: string }).text).key, "v6-filmen");
  assert.equal(addressOf(film, "3d"), "?runda=v6-filmen");
  assert.equal(addressOf(film, "platt"), "?runda=v6-filmen");
  // one part, the whole film, played as any film (transport and frame stepping read parts)
  const parts = roundParts(film, []);
  assert.deepEqual(parts, [referencePart(V6_FILM)]);
  assert.deepEqual(
    { path: parts[0].path, start: parts[0].start, end: parts[0].end, fps: parts[0].fps, speed: parts[0].speed, gap: parts[0].gap, track: parts[0].track },
    { path: "/assets/reference/v6.mp4", start: 0, end: 926, fps: 30, speed: 1, gap: null, track: null },
  );
  assert.equal(roundFacts(parts), "1 steg · 30,9 s");
  // only Inte 3D, with a reason for the disabled 3D choice; a round of the bank as asked
  assert.equal(viewFor(film, "3d"), "platt");
  assert.match(no3d(film)!, /färdig film/);
  const bankRound = readyRounds()[1];
  assert.equal(viewFor(bankRound, "3d"), "3d");
  assert.equal(no3d(bankRound), null);
  assert.equal(viewFor(null, "3d"), "3d");
});

test("the strip: a return's still a third in, a deal's at its landing; stills only near the window", () => {
  assert.equal(stillOf({ start: 0, end: 91 }, "RETURN"), 30);
  assert.equal(stillOf({ start: 10, end: 101 }, "DEAL"), 100);
  assert.equal(stillOf({ start: 0, end: 61 }, "ENTRY"), 30);
  const boxes = Array.from({ length: 34 }, (_, step) => ({ step, left: 12 + step * 252, width: 244 }));
  // a strip 1000 px wide at its start: the four boxes in view and the one beyond, nothing of the other 29
  assert.deepEqual([...nearSteps(0, 1000, boxes, 260)], [0, 1, 2, 3, 4]);
  assert.deepEqual([...nearSteps(20 * 252, 1000, boxes, 260)], [18, 19, 20, 21, 22, 23, 24]);
  assert.ok(sameSet(new Set([1, 2]), new Set([2, 1])));
  assert.ok(!sameSet(new Set([1, 2]), new Set([1, 3])));
});

test("card places from the plan, as the old lab hands them to the bank", () => {
  assert.equal(placesOf(null), null);
  const places = placesOf(defaultPlan())!;
  assert.equal(Object.keys(places).length, 16);
  assert.ok(Number.isFinite(places["P4.C2"].x) && Number.isFinite(places["D.C1"].y));
  // with places a seat's second card knows how far its card moves, and the note about it goes
  const shared = resolveRound(buildGraph(bank), [{ from: "READY", to: "P4.C2" }], { places });
  assert.ok(shared[0].shift && Number.isFinite(shared[0].shift.x));
  assert.ok(!shared[0].notes.some((n) => n.includes("placeringsplan")));
});

test("the round in a few words", () => {
  const parts = partsOf(resolveRound(graph, [{ from: "READY", to: "P4.C1", take: ids[1] }, { from: "P4.C1", to: "IDLE" }, { from: "IDLE", to: "REVEAL(D.C2)" }]));
  assert.equal(roundFacts(parts), "3 steg · 1 lucka · 7,5 s");
});
