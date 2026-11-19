// Rounds for the Spela view (studio/lib/rounds.ts). Run: node --test "studio/tests/rounds.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, resolveRound, type BankData, type BankJob } from "../../src/clip-graph.ts";
import { defaultPlan } from "../../src/placement-model.ts";
import { formatJakob, nodeCode } from "../lib/names.ts";
import { partsOf } from "../lib/parts.ts";
import { readFileSync } from "node:fs";
import {
  EMPTY_PATH,
  OLDER14_FILM,
  REFERENCE_FILMS,
  SEAT_FOUR,
  SEQ16_FILM,
  SEQ17_FILM,
  V6_DEAL,
  V6_FILM,
  addNode,
  addressOf,
  chaptersOf,
  contextRound,
  contextSteps,
  followers,
  isCard,
  isReference,
  lastNode,
  matchReady,
  nextSteps,
  playableRoute,
  no3d,
  nodeOf,
  ownRound,
  pathNodes,
  pathOf,
  pathProblems,
  pathText,
  placesOf,
  readAddress,
  readPath,
  readyRounds,
  referencePart,
  referenceParts,
  roundFacts,
  roundFromText,
  roundParts,
  samePath,
  startNodes,
  stepGaps,
  stepWord,
  undoStep,
  viewFor,
  type SequenceSegment,
} from "../lib/rounds.ts";
import { nearSteps, sameSet, stillOf } from "../components/round/strip.ts";

test("the ready-made rounds, in his notation", () => {
  const all_ = readyRounds();
  assert.deepEqual(all_.map((r) => r.name), ["Plats 4", "Plats 4 · två kort", "Alla platser", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "V6-filmen", "Hel giv · alla sju och dealern", "Hel giv · med vändning och tredje kort", "Hel giv · äldre, bara spelarna"]);
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

test('P6 in the builder and examples uses the established A2.2 route, including the shared second card', () => {
  const edges = [['IDLE', 'READY'], ['READY', 'IDLE'], ['IDLE', 'READY-B'], ['READY-B', 'P6.C1'], ['P6.C1', 'READY-B'], ['READY-B', 'IDLE'], ['P6.C1', 'READY']];
  const jobs = edges.map(([from, to], i) => job(`paow-route-${i}`, '', from, to, {dealer: 'paow'}));
  const data: BankData = {
    jobs,
    motions: Object.fromEntries(jobs.map((j) => [j.id, {source: {frames: 120, fps: 24}, review: {decision: 'ACCEPTED', userAccepted: true}}])),
    media: Object.fromEntries(jobs.map((j) => [j.id, {video: video(j.id)}])),
  };
  const paow = buildGraph(data, {dealer: 'paow'});
  for (const card of ['P6.C1', 'P6.C2']) {
    const next = nextSteps(paow, 'READY').find((n) => n.node === card)!;
    assert.equal(next.plays, true);
    assert.equal(next.via, 'READY-B');
    assert.deepEqual(next.route, [{from: 'READY', to: 'IDLE'}, {from: 'IDLE', to: 'READY-B'}, {from: 'READY-B', to: card}]);
    assert.ok(resolveRound(paow, next.route).every((s) => s.video && !s.gap));
  }
  const six = readyRounds(paow).find((r) => r.name === 'P6')!;
  assert.equal(six.steps.length, 4, 'rest to A2.2, deal, return, rest; no redundant trip to A2.1');
  assert.ok(six.steps.some((s) => s.from === 'READY-B' && s.to === 'P6.C1'));
  assert.ok(resolveRound(paow, six.steps).every((s) => s.video && !s.gap));
  assert.deepEqual(playableRoute(paow, {from: 'P6.C1', to: 'READY'}), [{from: 'P6.C1', to: 'READY-B'}, {from: 'READY-B', to: 'IDLE'}, {from: 'IDLE', to: 'READY'}], 'return through the same pose as the deal, even when an older direct return exists');
  assert.deepEqual(playableRoute(paow, {from: 'READY', to: 'D.C3'}), [{from: 'READY', to: 'D.C3'}], 'a missing dealer film stays missing');
  delete data.media!['paow-route-5'];
  assert.equal(nextSteps(buildGraph(data, {dealer: 'paow'}), 'READY').find((n) => n.node === 'P6.C1')!.plays, false, 'do not offer an incomplete alternate chain');
});

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
  const manifest = JSON.parse(readFileSync(new URL("../../data/manifest.json", import.meta.url), "utf8")) as { visualReference: { path: string } };
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

test("the old public page's whole deals: references of their own, the library's files, chapters from the registry", () => {
  type Item = { id: string; path: string; fps: number; frameCount: number; width: number; height: number; sha256: string };
  const library = JSON.parse(readFileSync(new URL("../../data/library.json", import.meta.url), "utf8")) as { items: Item[] };
  const media = JSON.parse(readFileSync(new URL("../../data/public-media.json", import.meta.url), "utf8")) as { entries: { id: string; path: string }[] };
  // every reference is a library item on the public page, with its path, rate, length and size (the lab server hands out those paths)
  for (const { film } of REFERENCE_FILMS) {
    const item = library.items.find((i) => i.id === film.id)!;
    assert.ok(item, film.id);
    assert.deepEqual({ path: item.path, fps: item.fps, frames: item.frameCount, width: item.width, height: item.height }, { path: film.path, fps: film.fps, frames: film.frames, width: film.width, height: film.height }, film.id);
    assert.equal(media.entries.find((e) => e.id === film.id)?.path, film.path, film.id);
  }
  // keys and addresses: /?runda=16-kort opens it, always flat
  const refs = readyRounds().filter(isReference);
  assert.deepEqual(refs.map((r) => r.key), ["v6-filmen", "16-kort", "17-kort", "14-kort"]);
  for (const r of refs) {
    assert.equal(roundFromText(r.key).key, r.key);
    assert.equal(addressOf(r, "3d"), `?runda=${r.key}`);
    assert.equal(viewFor(r, "3d"), "platt");
  }
  assert.equal(refs[1].sub, "färdig film 10 nov · 16 kort: två till varje plats, två till dealern (det andra dolt)");

  // the chapters are the registry's timeline: each deal and the turn begins one (motions/<id>.json sequence.segments)
  for (const film of [SEQ16_FILM, SEQ17_FILM]) {
    const motion = JSON.parse(readFileSync(new URL(`../../motions/${film.id}.json`, import.meta.url), "utf8")) as { source: { frames: number }; sequence: { segments: SequenceSegment[] } };
    assert.equal(motion.source.frames, film.frames);
    assert.deepEqual(film.chapters, chaptersOf(motion.sequence.segments), film.id);
  }
  // 16: Början, 7 + dealer + 7 + dealer = 17 chapters; 17 adds the turn and the third card
  assert.deepEqual(SEQ16_FILM.chapters!.map((c) => c.label), ["Början", "P7C1", "P6C1", "P5C1", "P4C1", "P3C1", "P2C1", "P1C1", "DC1", "P7C2", "P6C2", "P5C2", "P4C2", "P3C2", "P2C2", "P1C2", "DC2"]);
  assert.deepEqual(SEQ17_FILM.chapters!.slice(-3).map((c) => c.label), ["DC2", "DC2 upp", "DC3"]);
  const p3 = SEQ17_FILM.chapters!.find((c) => c.label === "P3C1")!;
  assert.deepEqual(p3, { label: "P3C1", sub: "plats 3 · kort 1", frame: 765, still: 895 });

  // one part per chapter, back to back over the whole film, on the one file
  const parts = referenceParts(SEQ17_FILM);
  assert.equal(parts.length, 19);
  assert.deepEqual(parts.map((p) => p.step), [...parts.keys()]);
  assert.equal(parts[0].start, 0);
  assert.equal(parts.at(-1)!.end, 3598);
  for (let i = 1; i < parts.length; i++) assert.equal(parts[i].start, parts[i - 1].end);
  assert.ok(parts.every((p) => p.path === "/assets/motions/pamela-sequence-17-native-r2/source.mp4" && p.gap === null && p.speed === 1));
  assert.deepEqual(roundParts(refs[2], []), parts);
  assert.equal(roundFacts(parts), "19 steg · 119,9 s");
  // the 16-card film ends on the dealer's hole card at rest
  assert.equal(referenceParts(SEQ16_FILM).at(-1)!.end, 3296);
  // without chapters one part, the whole film
  assert.deepEqual(referenceParts(OLDER14_FILM), [referencePart(OLDER14_FILM)]);
  assert.deepEqual(chaptersOf([]), []);
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

test("card places from the plan, as resolveRound takes them", () => {
  assert.equal(placesOf(null), null);
  const places = placesOf(defaultPlan())!;
  assert.equal(Object.keys(places).length, 17);
  assert.ok(Number.isFinite(places["D.C3"].x));
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

// ── The builder ─────────────────────────────────────────────────────────────
const codes = (nodes: readonly string[]) => nodes.map(nodeCode);

test("the builder: a path grows a node at a time, goes back a step, and reads as his notation", () => {
  let path = addNode(EMPTY_PATH, "IDLE");
  assert.deepEqual(path, { head: "IDLE", steps: [] });
  assert.equal(pathText(path), "A1");
  assert.equal(lastNode(path), "IDLE");
  for (const node of ["READY", "P4.C1", "READY"]) path = addNode(path, node);
  assert.equal(pathText(path), "A1 - A2.1 - P4C1 - A2.1");
  assert.deepEqual(codes(pathNodes(path).map((n) => n.node)), ["A1", "A2.1", "P4C1", "A2.1"]);
  assert.deepEqual(pathNodes(path).map((n) => n.step), [null, 0, 1, 2]);
  assert.equal(pathText(undoStep(path)), "A1 - A2.1 - P4C1");
  assert.deepEqual(undoStep(addNode(EMPTY_PATH, "IDLE")), EMPTY_PATH);
  assert.deepEqual(undoStep(EMPTY_PATH), EMPTY_PATH);
  assert.equal(lastNode(EMPTY_PATH), null);
  // a typed "|" starts a new chain: its first node is a chip of its own, marked
  const broken = readPath("A2.1 - P4C1 | A1 - A2.1").path!;
  assert.deepEqual(pathNodes(broken).map((n) => [nodeCode(n.node), n.broken]), [["A2.1", false], ["P4C1", false], ["A1", true], ["A2.1", false]]);
  // a ready-made round is its path, a reference film none
  const ready = readyRounds();
  assert.equal(pathText(pathOf(ready[1])), V6_DEAL);
  assert.deepEqual(pathOf(ready.find(isReference)!), EMPTY_PATH);
  assert.deepEqual(pathOf(null), EMPTY_PATH);
  assert.ok(samePath(pathOf(ready[0]), pathOf(ready[0])));
  assert.ok(!samePath(pathOf(ready[0]), readPath("A1 - A2.1 - P4C1 - A1").path!)); // the favourite's takes are locked
});

test("the builder: what can follow a node is the model's steps, and the bank says which play", () => {
  // from rest: the entries to the shoe, the idle, the turn of the hole card and her leaving; never a card
  assert.deepEqual(codes(followers(graph, "IDLE")), ["A2.1", "A2.2", "A1", "DC2 upp", "Borta"]);
  assert.deepEqual(codes(startNodes(graph)), ["A1", "A2.1", "A2.2", "Borta"]);
  // from the shoe: every card and the exit; from a card: back to the shoe or to rest; once away, only back to rest
  const fromShoe = followers(graph, "READY");
  assert.equal(fromShoe.length, 18);
  assert.deepEqual(codes(fromShoe.filter((n) => !isCard(n))), ["A1"]);
  assert.deepEqual(codes(followers(graph, "P4.C1")), ["A2.1", "A2.2", "A1"]);
  assert.deepEqual(codes(followers(graph, "AWAY")), ["A1"]);
  // the hole card is turned once: after DC2 upp comes what follows rest, without a second turn
  assert.deepEqual(codes(followers(graph, "REVEAL(D.C2)")), ["A2.1", "A2.2", "A1", "Borta"]);

  const shoe = new Map(nextSteps(graph, "READY").map((n) => [n.node, n]));
  assert.ok(shoe.get("P4.C1")!.plays);
  assert.equal(shoe.get("P4.C1")!.take?.id, graph.edge["READY>P4.C1"].main!.id);
  // seat mode: the second card plays the seat's film, and says so
  assert.ok(shoe.get("P4.C2")!.plays);
  assert.equal(shoe.get("P4.C2")!.why, "SHARED");
  // no film: dimmed, with the reason, and no take
  assert.deepEqual({ plays: shoe.get("P5.C1")!.plays, gap: shoe.get("P5.C1")!.gap, take: shoe.get("P5.C1")!.take }, { plays: false, gap: "MISSING", take: null });
  assert.equal(shoe.get("IDLE")!.plays, false);
  const card = new Map(nextSteps(graph, "P4.C1").map((n) => [n.node, n]));
  assert.deepEqual([card.get("READY")!.plays, card.get("IDLE")!.plays, card.get("READY-B")!.plays], [true, true, false]); // no take from A2.2's pose
  assert.deepEqual(nextSteps(graph, "IDLE").filter((n) => n.plays).map((n) => n.node), ["READY"]);
  // what each film does, in the glossary's words
  assert.deepEqual(
    [["IDLE", "READY"], ["READY", "P4.C1"], ["P4.C1", "READY"], ["READY", "IDLE"], ["IDLE", "IDLE"], ["IDLE", "REVEAL(D.C2)"], ["AWAY", "IDLE"], ["IDLE", "AWAY"]].map(([from, to]) => stepWord({ from, to })),
    ["ingång", "giv", "retur", "utgång", "vila", "vändning", "hon kommer", "hon går"],
  );
});

test("the builder: a path with a step without a film names the step; one that cannot be read says what can follow", () => {
  const path = readPath("A1 - A2.1 - P4C1 - A2.1 - A1", graph).path!;
  const gaps = stepGaps(graph, path.steps);
  assert.deepEqual(gaps, [null, null, null, "MISSING"]);
  assert.deepEqual(pathProblems(path.steps, gaps), ["Steg 4, A2.1 → A1: ingen film"]);
  assert.deepEqual(pathProblems(path.steps.slice(0, 3), gaps), []);
  // two neighbours without a step between them
  assert.equal(readPath("A1 - P4C1", graph).error, "A1 → P4C1 går inte: efter A1 kommer A2.1, A2.2, A1, DC2 upp eller Borta.");
  assert.equal(readPath("A2.1 - A2.2").error, "A2.1 → A2.2 går inte: efter A2.1 kommer ett kort eller A1.");
  assert.equal(readPath("P4C1 - P5C1").error, "P4C1 → P5C1 går inte: efter P4C1 kommer A2.1, A2.2 eller A1.");
  assert.equal(readPath("A2 - P4C1").error, "”A2” kan vara A2.1 (nyp) eller A2.2 (hand över): skriv vilken.");
  assert.equal(readPath("A1 - X9").error, "Kunde inte läsa ”X9”.");
  // one node alone is a start, the empty field an empty path
  for (const word of ["A1", " a1 ", "A1 vila", "VILA", "IDLE"]) assert.deepEqual(readPath(word).path, { head: "IDLE", steps: [] }, word);
  assert.deepEqual(readPath("DC2 upp").path, { head: "REVEAL(D.C2)", steps: [] });
  assert.deepEqual(readPath("p4.c1").path, { head: "P4.C1", steps: [] });
  assert.equal(nodeOf("A2.2"), "READY-B");
  assert.equal(nodeOf("Borta"), "AWAY");
  assert.equal(nodeOf("A2"), null);
  assert.deepEqual(readPath("  "), { path: EMPTY_PATH, error: null });
});

test("the builder: what Spela plays is a ready-made round when the steps are its own, else his", () => {
  const rounds = readyRounds();
  assert.equal(ownRound(readPath(V6_DEAL).path!.steps, rounds).key, "plats-4-tva");
  assert.equal(ownRound(pathOf(rounds[0]).steps, rounds).key, "plats-4"); // the favourite's locked takes kept
  const own = ownRound(readPath("A1 - A2.1 - P4C1 - A2.1 - A1").path!.steps, rounds);
  assert.deepEqual({ key: own.key, name: own.name, text: own.text, errors: own.errors }, { key: "egen", name: "Egen runda", text: "A1 - A2.1 - P4C1 - A2.1 - A1", errors: [] });
  // its text is the address's and reads back to the same steps
  assert.deepEqual(roundFromText(own.text, rounds).steps, own.steps);
  // a path grown from the favourite keeps its locked takes and is written in the lab's notation for the address
  const grown = ownRound(addNode(pathOf(rounds[0]), "READY").steps, rounds);
  assert.equal(grown.key, "egen");
  assert.equal(grown.text, `${SEAT_FOUR} | IDLE>READY`);
  assert.deepEqual(roundFromText(grown.text, rounds).steps, grown.steps);
});
