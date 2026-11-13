// What the map says about one edge (studio/lib/edge-stats.ts). Run: node --test "studio/tests/edge-stats.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type ImageRef, type MotionRecord } from "../../src/clip-graph.ts";
import { hubDeals } from "../../src/game-director.ts";
import { bankSummary, bucketOf, chainFor, countsText, edgeCounts, edgeInfo, edgeTag, groupTakes, hubLine, isOutright, playing, primaryOf } from "../lib/edge-stats.ts";

// ── A small bank: no media files, only the records the graph reads ──
type Review = NonNullable<MotionRecord["review"]>;
const file = (path: string): ImageRef => ({ file: { path, sha256: path } });
const jakob = (extra: Review = {}): Review => ({ decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-12: bra.", ...extra });
function bank(rows: [id: string, from: string, to: string, kind: string, review: Review | null, first?: ImageRef, last?: ImageRef, done?: boolean][]): BankData {
  const jobs: BankJob[] = [];
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  const revisions: Record<string, string> = {};
  for (const [id, from, to, kind, review, first = {}, last, done = true] of rows) {
    jobs.push({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first, ...(last ? { last } : {}), purpose: "" });
    if (done) {
      motions[id] = { source: { frames: 120, fps: 30 }, ...(review ? { review } : {}) };
      media[id] = { video: `assets/motions/${id}/source.mp4` };
      revisions[id] = `"${id}"`;
    }
  }
  return { jobs, motions, media, revisions };
}

const data = bank([
  ["pamela-p4-c1-plan-deal-01", "READY", "P4.C1", "DEAL", jakob({ acceptedAs: "VARIANT" }), {}, file("L4v")],
  ["pamela-p4-c1-plan-deal-02", "READY", "P4.C1", "DEAL", jakob(), {}, file("L4")],
  ["pamela-p4-c1-plan-deal-03", "READY", "P4.C1", "DEAL", { decision: "REJECTED", userReview: "Jakob 2026-11-12: nej." }, {}, file("L4x")],
  ["pamela-p4-c1-plan-deal-04", "READY", "P4.C1", "DEAL", null, {}, file("L4w"), false],
  ["pamela-p4-c1-readyb-deal-01", "READY-B", "P4.C1", "DEAL", jakob(), {}, file("L4b")],
  ["pamela-p4-c1-plan-return-ready-01", "P4.C1", "READY", "RETURN", jakob(), file("L4v")],
  ["pamela-p4-c1-plan-return-ready-02", "P4.C1", "READY", "RETURN", jakob(), file("L4")],
  ["pamela-p4-c2-plan-deal-01", "READY", "P4.C2", "DEAL", jakob(), {}, file("L4c2")],
  ["pamela-d-c2-plan-deal-01", "READY", "D.C2", "DEAL", { decision: "REJECTED" }, {}, file("LD2")],
  ["pamela-idle-ready-entry-01", "IDLE", "READY", "ENTRY", { decision: "ACCEPTED" }],
  ["pamela-table-arrive-01", "AWAY", "IDLE", "ARRIVE", jakob({ acceptedAs: "MAIN" })],
]);
const graph = buildGraph(data);
const take = (id: string) => graph.takes[id];

test("every take falls in one of four counts", () => {
  assert.equal(bucketOf(take("pamela-p4-c1-plan-deal-02")), "accepted");
  assert.equal(bucketOf(take("pamela-p4-c1-plan-deal-01")), "variants");
  assert.equal(bucketOf(take("pamela-p4-c1-readyb-deal-01")), "variants", "a variant start (A2.2) is an alternative, not the edge's own");
  assert.equal(bucketOf(take("pamela-p4-c1-plan-deal-03")), "rejected");
  assert.equal(bucketOf(take("pamela-p4-c1-plan-deal-04")), "waiting");
  const counts = edgeCounts(graph.edge["READY>P4.C1"]);
  assert.deepEqual(counts, { accepted: 1, variants: 2, waiting: 1, rejected: 1, total: 5 });
  assert.equal(countsText(counts), "1 godkänd, 2 varianter, 1 väntar, 1 underkänd");
  assert.equal(countsText(edgeCounts({ takes: [] })), "inga tagningar");
});

test("the side panel's groups, the take that plays first", () => {
  const edge = graph.edge["READY>P4.C1"];
  const g = groupTakes(edge, take("pamela-p4-c1-plan-deal-02"));
  assert.deepEqual(g.godkanda.map((t) => t.id), ["pamela-p4-c1-plan-deal-02"]);
  assert.deepEqual(g.varianter.map((t) => t.id), ["pamela-p4-c1-readyb-deal-01", "pamela-p4-c1-plan-deal-01"], "newest first");
  assert.deepEqual(g.underkanda.map((t) => t.id), ["pamela-p4-c1-plan-deal-03"]);
  assert.deepEqual(g.vantar.map((t) => t.id), ["pamela-p4-c1-plan-deal-04"]);
  assert.equal(g.primar.length, 0);
  assert.deepEqual(groupTakes(graph.edge["AWAY>IDLE"]).primar.map((t) => t.id), ["pamela-table-arrive-01"]);
});

test("outright: his own ✓, not a variant, not from A2.2, with a film", () => {
  assert.ok(isOutright(take("pamela-p4-c1-plan-deal-02")));
  assert.ok(!isOutright(take("pamela-p4-c1-plan-deal-01")), "variant");
  assert.ok(!isOutright(take("pamela-p4-c1-readyb-deal-01")), "variant start");
  assert.ok(!isOutright(take("pamela-idle-ready-entry-01")), "a reviewer's ✓ is not his");
  assert.equal(primaryOf(graph.edge["AWAY>IDLE"])?.id, "pamela-table-arrive-01");
  assert.equal(primaryOf(graph.edge["READY>P4.C1"]), null);
});

test("what plays, resolved as a round would play it", () => {
  assert.deepEqual(chainFor(graph.edge["READY>P4.C1"]), { steps: [{ from: "READY", to: "P4.C1" }, { from: "P4.C1", to: "READY" }], at: 0 });
  assert.deepEqual(chainFor(graph.edge["P4.C1>IDLE"]), { steps: [{ from: "READY", to: "P4.C1" }, { from: "P4.C1", to: "IDLE" }], at: 1 });
  assert.deepEqual(chainFor(graph.edge["IDLE>READY"]).steps, [{ from: "IDLE", to: "READY" }]);
  // The return that continues the deal before it plays, not just the newest.
  const back = playing(graph, "P4.C1>READY");
  assert.equal(back.take?.id, "pamela-p4-c1-plan-return-ready-02");
  assert.equal(back.before?.id, "pamela-p4-c1-plan-deal-02");
  // One film per seat: the second card plays the seat's film.
  const second = playing(graph, "READY>P4.C2");
  assert.equal(second.take?.id, "pamela-p4-c1-plan-deal-02");
  assert.equal(second.why, "SHARED");
  assert.equal(second.film?.id, "READY>P4.C1");
  assert.ok(second.notes.every((n) => !n.startsWith("Kortets flytt")));
  // Nothing playable: a gap, said as "saknas".
  const gap = playing(graph, "READY>D.C2");
  assert.equal(gap.take, null);
  assert.deepEqual(edgeTag(gap), { kind: "gap", gap: "REJECTED", word: "saknas" });
  assert.deepEqual(edgeTag(playing(graph, "P7.C1>IDLE")), { kind: "gap", gap: "MISSING", word: "saknas" });
  assert.deepEqual(edgeTag(playing(graph, "AWAY>IDLE")), { kind: "take", verdict: "primar", byJakob: true });
  assert.deepEqual(edgeTag(playing(graph, "IDLE>READY")), { kind: "take", verdict: "godkand", byJakob: false });
});

test("one edge in words, for its chip's tooltip", () => {
  const info = edgeInfo(graph, "READY>P4.C1")!;
  assert.equal(info.title, "A2.1 → P4C1 · spelar Giv 02 (godkänd) · 1 godkänd, 2 varianter, 1 väntar, 1 underkänd");
  assert.equal(edgeInfo(graph, "READY>D.C2")!.title, "A2.1 → DC2 · saknas · 1 underkänd");
  assert.equal(edgeInfo(graph, "NO>SUCH"), null);
});

test("the bank in numbers", () => {
  const s = bankSummary(graph);
  assert.equal(s.films, graph.summary.films.required.length);
  assert.equal(s.primary, 1);
  assert.equal(s.outright, 3, "the P4 deal, the P4 return and her coming in");
  assert.equal(s.variant, 0);
  assert.equal(s.missing, s.films - 4, "four films play: entry, P4 deal, P4 return, coming in");
});

test("a seat the round deals from A2.2 is shown as played, from there, only when the game would deal it so", () => {
  // Paow's seat 6 from READY-B (data/dealers' second dealer, on the game's map): the entry to 2.2, the deal, its return cut from it, the exit.
  const viaHub = (pending: string | null) => {
    const rows: Parameters<typeof bank>[0] = [
      ["paow-in-b", "IDLE", "READY-B", "ENTRY", jakob()],
      ["paow-p6-deal-b", "READY-B", "P6.C1", "DEAL", jakob(), {}, file("L6b")],
      ["paow-p6-back-b", "P6.C1", "READY-B", "RETURN", jakob(), { frame: { video: "assets/motions/paow-p6-deal-b/source.mp4", videoSha256: "x", index: 100 } }],
      ["paow-out-b", "READY-B", "IDLE", "RETURN", jakob()],
      ["paow-p4-deal", "READY", "P4.C1", "DEAL", jakob(), {}, file("L4p")],
    ];
    const b = bank(rows.map((r) => (r[0] === pending ? [r[0], r[1], r[2], r[3], { decision: "PENDING", inbox: true }, ...r.slice(5)] : r) as (typeof rows)[number]));
    for (const j of b.jobs!) j.dealer = "paow";
    return b;
  };
  const data = viaHub(null), g = buildGraph(data, { dealer: "paow" }), hubs = hubDeals(data, "paow");
  // Without the game's rule the deal to seat 6 plays nothing: the takes from A2.2 are variant starts of the edge.
  assert.equal(playing(g, "READY>P6.C1").take, null);
  const deal = playing(g, "READY>P6.C1", hubs), back = playing(g, "P6.C1>READY", hubs);
  assert.deepEqual([deal.take?.id, deal.hub, deal.gap, back.take?.id, back.hub, back.before?.id], ["paow-p6-deal-b", "READY-B", null, "paow-p6-back-b", "READY-B", "paow-p6-deal-b"]);
  assert.deepEqual(edgeTag(deal), { kind: "take", verdict: "godkand", byJakob: true });
  assert.equal(edgeInfo(g, "READY>P6.C1", hubs)!.title, "A2.1 → P6C1 · spelar Giv B (godkänd) · via ankare 2.2 · 1 variant");
  assert.equal(hubLine("READY-B"), "I rundan ges platsen från A2.2 (ankare 2.2), via vila");
  assert.equal(bankSummary(g, hubs).missing, bankSummary(g).missing - 2, "the deal and its return");
  // Any other edge is as without the rule.
  for (const id of ["READY>P4.C1", "IDLE>READY", "READY>IDLE", "READY>P5.C1"]) assert.deepEqual(playing(g, id, hubs), playing(g, id));
  // One of the four without a verdict, or a dealer without a map: nothing changes.
  for (const pending of ["paow-out-b", "paow-in-b", "paow-p6-back-b"]) {
    const d = viaHub(pending), h = hubDeals(d, "paow"), gg = buildGraph(d, { dealer: "paow" });
    assert.deepEqual(h, {}, pending);
    assert.deepEqual(bankSummary(gg, h), bankSummary(gg));
  }
  const hers = bank([["pamela-in-b", "IDLE", "READY-B", "ENTRY", jakob()], ["pamela-p6-deal-b", "READY-B", "P6.C1", "DEAL", jakob()], ["pamela-p6-back-b", "P6.C1", "READY-B", "RETURN", jakob()], ["pamela-out-b", "READY-B", "IDLE", "RETURN", jakob()]]);
  assert.deepEqual(hubDeals(hers, "pamela"), {});
});
