// Karta's films per step (studio/lib/primaries.ts): Primär and its secondary films, how the game uses each, the proposal
// and its seam, the tree's order, and the one write. Run: node --test "studio/tests/primaries.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEALER, buildGraph, type BankData, type BankJob, type ImageRef, type MotionRecord } from "../../src/clip-graph.ts";
import { hubDeals } from "../../src/game-director.ts";
import type { Decision } from "../lib/api.ts";
import { SHOWN, gameGraph, makePrimary, roleOf, stepFilms, treeOrder, usesOf, withPrimary } from "../lib/primaries.ts";

// ── A small bank: no media files, only the records the graph reads ──
type Review = NonNullable<MotionRecord["review"]>;
type Motion = NonNullable<MotionRecord["motion"]>;
const file = (path: string): ImageRef => ({ file: { path, sha256: path } });
const jakob = (extra: Review = {}): Review => ({ decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-12: bra.", ...extra });
type Row = [id: string, from: string, to: string, kind: string, review: Review | null, first?: ImageRef, last?: ImageRef, motion?: Motion & { stopgap?: boolean }];
function bank(rows: Row[], dealer?: string): BankData {
  const jobs: BankJob[] = [];
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  const revisions: Record<string, string> = {};
  for (const [id, from, to, kind, review, first = {}, last, motion] of rows) {
    jobs.push({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first, ...(last ? { last } : {}), purpose: "", ...(dealer ? { dealer } : {}) });
    motions[id] = { source: { frames: 120, fps: 30 }, ...(review ? { review } : {}), ...(motion ? { motion } : {}) };
    media[id] = { video: `assets/motions/${id}/source.mp4` };
    revisions[id] = `"${id}"`;
  }
  return { jobs, motions, media, revisions };
}

const data = bank([
  // Ingång: his own ✓.
  ["paow-idle-ready-entry-01", "IDLE", "READY", "ENTRY", jakob()],
  // P1: a Primär is set; another take he accepted, one rejected and one waiting.
  ["paow-p1-c1-plan-deal-01", "READY", "P1.C1", "DEAL", jakob({ acceptedAs: "MAIN" }), {}, file("L1")],
  ["paow-p1-c1-plan-deal-02", "READY", "P1.C1", "DEAL", jakob(), {}, file("L1b")],
  ["paow-p1-c1-plan-deal-03", "READY", "P1.C1", "DEAL", { decision: "REJECTED", userReview: "Jakob 2026-11-12: nej." }, {}, file("L1c")],
  ["paow-p1-c1-plan-deal-04", "READY", "P1.C1", "DEAL", { decision: "PENDING" }, {}, file("L1d")],
  // P2: the deal that plays is his ✓; a variant deal is the one a Primär return to A1 continues.
  ["paow-p2-c1-plan-deal-01", "READY", "P2.C1", "DEAL", jakob(), {}, file("L2a")],
  ["paow-p2-c1-plan-deal-02", "READY", "P2.C1", "DEAL", jakob({ acceptedAs: "VARIANT" }), {}, file("L2b")],
  ["paow-p2-c1-plan-return-ready-01", "P2.C1", "READY", "RETURN", jakob(), file("L2a")],
  ["paow-p2-c1-plan-return-idle-01", "P2.C1", "IDLE", "RETURN", jakob({ acceptedAs: "MAIN" }), file("L2b")],
  // P3: the Primär return comes back with the other hand than the deal laid the card with: the game plays another.
  ["paow-p3-c1-plan-deal-01", "READY", "P3.C1", "DEAL", jakob(), {}, file("L3"), { releaseHand: "LH" }],
  ["paow-p3-c1-plan-return-ready-01", "P3.C1", "READY", "RETURN", jakob({ acceptedAs: "MAIN" }), file("L3x"), undefined, { releaseHand: "RH" }],
  ["paow-p3-c1-plan-return-ready-02", "P3.C1", "READY", "RETURN", jakob(), file("L3"), undefined, { releaseHand: "LH" }],
  // P4: two deals he accepted. The older one's returns (from its landing anchor) are his own ✓, the newer one's only a
  // variant: the older is proposed first, though the newer plays.
  ["paow-p4-c1-plan-deal-02", "READY", "P4.C1", "DEAL", jakob(), {}, file("L4")],
  ["paow-p4-c1-plan-deal-05", "READY", "P4.C1", "DEAL", jakob(), {}, file("L4n")],
  ["paow-p4-c1-plan-return-ready-01", "P4.C1", "READY", "RETURN", jakob(), file("L4")],
  ["paow-p4-c1-plan-return-idle-01", "P4.C1", "IDLE", "RETURN", jakob(), file("L4")],
  ["paow-p4-c1-return-idle-calm-01", "P4.C1", "IDLE", "RETURN", jakob({ acceptedAs: "VARIANT" }), file("L4n")],
  // P5: the archive deal plays with a variant return; his accepted return continues a variant deal.
  ["paow-p5-c1-arkiv-deal-01", "READY", "P5.C1", "DEAL", jakob(), {}, file("L5a")],
  ["paow-p5-c1-plan-deal-01", "READY", "P5.C1", "DEAL", jakob({ acceptedAs: "VARIANT" }), {}, file("L5v")],
  ["paow-p5-c1-arkiv-return-ready-01", "P5.C1", "READY", "RETURN", jakob({ acceptedAs: "VARIANT" }), file("L5a")],
  ["paow-p5-c1-plan-return-ready-01", "P5.C1", "READY", "RETURN", jakob(), file("L5v")],
  // P6: his accepted return starts from an anchor no playable deal ends on.
  ["paow-p6-c1-arkiv-deal-01", "READY", "P6.C1", "DEAL", jakob({ acceptedAs: "VARIANT" }), {}, file("L6a")],
  ["paow-p6-c1-arkiv-return-ready-01", "P6.C1", "READY", "RETURN", jakob({ acceptedAs: "VARIANT" }), file("L6a")],
  ["paow-p6-c1-plan-return-ready-01", "P6.C1", "READY", "RETURN", jakob(), file("L6x")],
  // P7: an exit played backwards (a stopgap) beside a judged exit: the game leaves the stopgap out, and so does the page.
  ["paow-ready-idle-exit-01", "READY", "IDLE", "RETURN", jakob()],
  ["paow-ready-idle-exit-reversed-01", "READY", "IDLE", "RETURN", jakob(), {}, undefined, { stopgap: true }],
  // The rest: two calm films (one Primär), two gestures by weight, a talk film played on request, one weighed out.
  ["paow-idle-loop-01", "IDLE", "IDLE", "IDLE", jakob()],
  ["paow-idle-loop-02", "IDLE", "IDLE", "IDLE", jakob({ acceptedAs: "MAIN" })],
  ["paow-idle-smile-01", "IDLE", "IDLE", "IDLE", jakob(), {}, undefined, { idle: { weight: 3 } }],
  ["paow-idle-wave-01", "IDLE", "IDLE", "IDLE", jakob({ acceptedAs: "VARIANT" }), {}, undefined, { idle: { weight: 1 } }],
  ["paow-idle-talk-01", "IDLE", "IDLE", "IDLE", jakob(), {}, undefined, { idle: { onRequest: true, label: "hej" } }],
  ["paow-idle-nod-01", "IDLE", "IDLE", "IDLE", jakob(), {}, undefined, { idle: { weight: 0 } }],
]);
const graph = buildGraph(data);
const game = gameGraph(data, DEALER);
const step = (edge: string) => stepFilms(data, graph, game, edge)!;
const ids = (films: { take: { id: string } }[]) => films.map((f) => f.take.id);
const words = (edge: string) => Object.fromEntries([...usesOf(game, edge)].map(([id, use]) => [id, use.word]));

test("the node tree's order: seat by seat (deal, return to A2.1, return to A1), the dealer, then the anchors' own films", () => {
  const order = treeOrder(graph);
  assert.equal(order.length, graph.summary.films.required.length);
  assert.deepEqual(order.slice(0, 3), ["READY>P1.C1", "P1.C1>READY", "P1.C1>IDLE"]);
  assert.deepEqual(order.slice(21, 28), ["READY>D.C1", "D.C1>READY", "D.C1>IDLE", "READY>D.C2", "D.C2>READY", "D.C2>IDLE", "IDLE>REVEAL(D.C2)"]);
  assert.deepEqual(order.slice(28).map((id) => roleOf(graph.edge[id])), ["entry", "exit", "rest", "arrive", "leave"]);
});

test("Primär and beside it the secondary films: approved and not Primär; rejected and waiting takes are in Granska", () => {
  const p1 = step("READY>P1.C1");
  assert.equal(p1.primary?.take.id, "paow-p1-c1-plan-deal-01");
  assert.deepEqual(ids(p1.secondaries), ["paow-p1-c1-plan-deal-02"]);
  assert.equal(p1.elsewhere, 2, "the rejected and the waiting take");
  assert.equal(p1.proposal, null, "with a Primär nothing is proposed");
  assert.deepEqual([p1.primary?.use.kind, p1.primary?.use.word], ["always", "Spelas"]);
  assert.deepEqual([p1.secondaries[0].use.kind, p1.secondaries[0].use.word], ["never", "Spelas inte"]);
  assert.match(p1.secondaries[0].use.detail, /Spelet spelar Giv 01 här/);
  // A stopgap the game has replaced is not among them.
  assert.deepEqual(ids(step("READY>IDLE").secondaries), ["paow-ready-idle-exit-01"]);
  assert.equal(step("READY>IDLE").elsewhere, 1);
});

test("no Primär: the best take he accepted outright is proposed first, the take that plays stands in for Primär", () => {
  const deal = step("READY>P4.C1");
  assert.equal(deal.primary, null);
  assert.equal(deal.proposal?.id, "paow-p4-c1-plan-deal-02", "the one his own returns continue, though a newer take plays");
  assert.deepEqual(ids(deal.secondaries), ["paow-p4-c1-plan-deal-02", "paow-p4-c1-plan-deal-05"]);
  assert.ok(deal.secondaries[0].proposal);
  assert.deepEqual(deal.secondaries.map((f) => f.use.word), ["Spelas inte", "Står in för Primär"]);
  assert.equal(deal.now.take?.id, "paow-p4-c1-plan-deal-05");
  // The proposal carries what making it Primär does to the seam; the others carry none.
  assert.equal(deal.secondaries[0].seam?.tone, "ok");
  assert.match(deal.secondaries[0].seam!.text, /Returen till A1 blir Retur 01/);
  assert.equal(deal.secondaries[1].seam, null);
  // His return to A1 continues deal 02, while the newer deal 05 plays: making it Primär brings deal 02 back.
  const back = step("P4.C1>IDLE");
  assert.equal(back.proposal?.id, "paow-p4-c1-plan-return-idle-01");
  assert.deepEqual(back.secondaries[0].seam, { tone: "ok", text: "Då spelas Giv 02 (godkänd) före, eftersom returen fortsätter den." });
  assert.equal(back.secondaries.find((f) => f.take.id === "paow-p4-c1-return-idle-calm-01")?.use.word, "Står in för Primär");
});

test("a deal the game plays only before one of its returns says which", () => {
  // Deal 01 is the step's main take; before the Primär return to A1 the game plays the variant deal it continues.
  assert.deepEqual(words("READY>P2.C1"), { "paow-p2-c1-plan-deal-01": "Före retur till A2.1", "paow-p2-c1-plan-deal-02": "Före retur till A1" });
  assert.equal(usesOf(game, "READY>P2.C1").get("paow-p2-c1-plan-deal-02")?.kind, "some");
  assert.deepEqual(words("P2.C1>IDLE"), { "paow-p2-c1-plan-return-idle-01": "Spelas" });
});

test("a Primär the game does not play says so, and the film it plays instead says it", () => {
  const back = step("P3.C1>READY");
  assert.deepEqual([back.primary?.take.id, back.primary?.use.word], ["paow-p3-c1-plan-return-ready-01", "Spelas inte"]);
  assert.match(back.primary!.use.detail, /Spelet spelar Retur 02 här \(passar given före\)/);
  assert.deepEqual([back.secondaries[0].take.id, back.secondaries[0].use.word], ["paow-p3-c1-plan-return-ready-02", "Spelas i stället för Primär"]);
  assert.equal(back.secondaries[0].use.kind, "always");
});

test("the seam a proposal would give: a variant deal pulled in, or a visible jump", () => {
  const p5 = step("P5.C1>READY");
  assert.equal(p5.now.take?.id, "paow-p5-c1-arkiv-return-ready-01");
  assert.equal(p5.proposal?.id, "paow-p5-c1-plan-return-ready-01");
  assert.equal(p5.secondaries[0].seam?.tone, "warn");
  assert.match(p5.secondaries[0].seam!.text, /^Då spelas Giv 01 \(variant\) före, eftersom returen fortsätter den\.$/);
  assert.equal(p5.secondaries.find((f) => f.take.id === "paow-p5-c1-arkiv-return-ready-01")?.use.word, "Står in för Primär", "a variant can stand in");
  const p6 = step("P6.C1>READY");
  assert.equal(p6.secondaries[0].seam?.tone, "bad");
  assert.match(p6.secondaries[0].seam!.text, /synligt hopp/);
});

test("the rest: calm films are the base by weight, gestures come in by weight, a talk film only when chosen", () => {
  const rest = step("IDLE>IDLE");
  assert.equal(rest.primary?.use.word, "Vilan · lugn · 50 %", "the Primär is one of the calm films the loop picks from");
  assert.deepEqual(words("IDLE>IDLE"), {
    "paow-idle-loop-01": "Vilan · lugn · 50 %",
    "paow-idle-loop-02": "Vilan · lugn · 50 %",
    "paow-idle-smile-01": "Vilan · gest · 75 %",
    "paow-idle-wave-01": "Vilan · gest · 25 %",
    "paow-idle-talk-01": "Bara när den väljs",
    "paow-idle-nod-01": "Spelas inte",
  });
  // Calm first, then the gestures by weight, then what chance never picks.
  assert.deepEqual(ids(rest.secondaries), ["paow-idle-loop-01", "paow-idle-smile-01", "paow-idle-wave-01", "paow-idle-talk-01", "paow-idle-nod-01"]);
  assert.ok(rest.secondaries.length > SHOWN, "the page shows three and folds the rest");
});

test("a seat the game deals from A2.2: the films from there are used, the seat's plain films are not", () => {
  const rows: Row[] = [
    ["paow-in-b", "IDLE", "READY-B", "ENTRY", jakob()],
    ["paow-p6-deal-b", "READY-B", "P6.C1", "DEAL", jakob(), {}, file("L6b")],
    ["paow-p6-back-b", "P6.C1", "READY-B", "RETURN", jakob(), { frame: { video: "assets/motions/paow-p6-deal-b/source.mp4", videoSha256: "x", index: 100 } }],
    ["paow-out-b", "READY-B", "IDLE", "RETURN", jakob()],
    ["paow-p6-deal", "READY", "P6.C1", "DEAL", jakob(), {}, file("L6")],
    ["paow-in", "IDLE", "READY", "ENTRY", jakob()],
  ];
  const b = bank(rows, "paow"), g = buildGraph(b, { dealer: "paow" }), gg = gameGraph(b, "paow"), hubs = hubDeals(b, "paow");
  const hers = (edge: string) => Object.fromEntries([...usesOf(gg, edge)].map(([id, u]) => [id, u.word]));
  assert.deepEqual(hers("READY>P6.C1"), { "paow-p6-deal-b": "Från A2.2", "paow-p6-deal": "Spelas inte" });
  assert.match(usesOf(gg, "READY>P6.C1").get("paow-p6-deal")!.detail, /A2\.2/);
  assert.deepEqual(hers("IDLE>READY"), { "paow-in-b": "Från A2.2", "paow-in": "Står in för Primär" });
  const deal = stepFilms(b, g, gg, "READY>P6.C1", hubs)!;
  assert.equal(deal.now.take?.id, "paow-p6-deal-b");
  assert.deepEqual(ids(deal.secondaries), ["paow-p6-deal", "paow-p6-deal-b"], "his own ✓ proposed first, then the film from A2.2");
});

test("what a Primär would be: the bank changed in memory only", () => {
  const take = graph.takes["paow-p1-c1-plan-deal-02"];
  const changed = withPrimary(data, graph, take);
  assert.equal(changed.motions!["paow-p1-c1-plan-deal-02"].review?.acceptedAs, "MAIN");
  assert.equal(changed.motions!["paow-p1-c1-plan-deal-01"].review?.acceptedAs, undefined, "the earlier Primär is lowered");
  assert.equal(changed.motions!["paow-p1-c1-plan-deal-01"].review?.decision, "ACCEPTED");
  assert.equal(data.motions!["paow-p1-c1-plan-deal-01"].review?.acceptedAs, "MAIN", "the bank itself is untouched");
});

test("Gör primär: one write for the take, then an earlier Primär on the edge is lowered with its note kept", async () => {
  const calls: [string, Decision, string, string][] = [];
  const put = async (id: string, decision: Decision, note: string, revision: string) => {
    calls.push([id, decision, note, revision]);
    return { id, review: {}, revision };
  };
  const result = await makePrimary(graph.takes["paow-p1-c1-plan-deal-02"], graph, put);
  assert.deepEqual(calls, [
    ["paow-p1-c1-plan-deal-02", "MAIN", "bra.", '"paow-p1-c1-plan-deal-02"'],
    ["paow-p1-c1-plan-deal-01", "ACCEPTED", "bra.", '"paow-p1-c1-plan-deal-01"'],
  ]);
  assert.deepEqual(result, { lowered: ["Giv 01"], failed: [] });
  // Nothing else is written; a failed lowering is reported, not hidden.
  const failing = async (id: string, decision: Decision, note: string, revision: string) => {
    if (decision === "ACCEPTED") throw new Error("409");
    return { id, review: {}, revision };
  };
  assert.deepEqual(await makePrimary(graph.takes["paow-p1-c1-plan-deal-02"], graph, failing), { lowered: [], failed: ["Giv 01"] });
  const once: string[] = [];
  await makePrimary(graph.takes["paow-p5-c1-plan-return-ready-01"], graph, async (id, decision, note, revision) => {
    once.push(id);
    return { id, review: {}, revision };
  });
  assert.deepEqual(once, ["paow-p5-c1-plan-return-ready-01"]);
});

test("an empty bank: every step has no Primär and no film", () => {
  const empty = buildGraph({});
  for (const id of treeOrder(empty)) {
    const s = stepFilms({}, empty, gameGraph({}, DEALER), id)!;
    assert.deepEqual([s.primary, s.secondaries.length, s.proposal, s.now.take], [null, 0, null, null], id);
  }
  assert.equal(stepFilms({}, empty, empty, "NO>SUCH"), null);
});
