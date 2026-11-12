// Primära: proposals for the primary take per edge (studio/lib/primaries.ts). Run: node --test "studio/tests/primaries.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type ImageRef, type MotionRecord } from "../../src/clip-graph.ts";
import type { Decision } from "../lib/api.ts";
import { PRAISED, makePrimary, primaries, withPrimary, type Row } from "../lib/primaries.ts";

// ── A small bank: no media files, only the records the graph reads ──
type Review = NonNullable<MotionRecord["review"]>;
const file = (path: string): ImageRef => ({ file: { path, sha256: path } });
const jakob = (extra: Review = {}): Review => ({ decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-12: bra.", ...extra });
function bank(rows: [id: string, from: string, to: string, kind: string, review: Review | null, first?: ImageRef, last?: ImageRef][]): BankData {
  const jobs: BankJob[] = [];
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  const revisions: Record<string, string> = {};
  for (const [id, from, to, kind, review, first = {}, last] of rows) {
    jobs.push({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first, ...(last ? { last } : {}), purpose: "" });
    motions[id] = { source: { frames: 120, fps: 30 }, ...(review ? { review } : {}) };
    media[id] = { video: `assets/motions/${id}/source.mp4` };
    revisions[id] = `"${id}"`;
  }
  return { jobs, motions, media, revisions };
}

const data = bank([
  // Ingång: his own ✓, and one of the three he praised.
  ["pamela-idle-ready-entry-01", "IDLE", "READY", "ENTRY", jakob()],
  // P1: a Primär is set.
  ["pamela-p1-c1-plan-deal-01", "READY", "P1.C1", "DEAL", jakob({ acceptedAs: "MAIN" }), {}, file("L1")],
  ["pamela-p1-c1-plan-deal-02", "READY", "P1.C1", "DEAL", jakob(), {}, file("L1b")],
  // P2: only a reviewer's ✓.
  ["pamela-p2-c1-plan-deal-01", "READY", "P2.C1", "DEAL", { decision: "ACCEPTED" }, {}, file("L2")],
  // P3: only rejected takes: a gap.
  ["pamela-p3-c1-plan-deal-01", "READY", "P3.C1", "DEAL", { decision: "REJECTED" }, {}, file("L3")],
  // P4: two deals he accepted; the praised one is the older, it still leads. Its returns start from its landing anchor.
  ["pamela-p4-c1-plan-deal-02", "READY", "P4.C1", "DEAL", jakob(), {}, file("L4")],
  ["pamela-p4-c1-plan-deal-05", "READY", "P4.C1", "DEAL", jakob(), {}, file("L4n")],
  ["pamela-p4-c1-plan-return-ready-01", "P4.C1", "READY", "RETURN", jakob(), file("L4")],
  ["pamela-p4-c1-plan-return-idle-01", "P4.C1", "IDLE", "RETURN", jakob(), file("L4")],
  ["pamela-p4-c1-return-idle-calm-01", "P4.C1", "IDLE", "RETURN", jakob(), file("L4n")],
  // P5: the archive deal plays with a variant return; his accepted return continues a variant deal.
  ["pamela-p5-c1-arkiv-deal-01", "READY", "P5.C1", "DEAL", jakob(), {}, file("L5a")],
  ["pamela-p5-c1-plan-deal-01", "READY", "P5.C1", "DEAL", jakob({ acceptedAs: "VARIANT" }), {}, file("L5v")],
  ["pamela-p5-c1-arkiv-return-ready-01", "P5.C1", "READY", "RETURN", jakob({ acceptedAs: "VARIANT" }), file("L5a")],
  ["pamela-p5-c1-plan-return-ready-01", "P5.C1", "READY", "RETURN", jakob(), file("L5v")],
  // P6: his accepted return starts from an anchor no playable deal ends on.
  ["pamela-p6-c1-arkiv-deal-01", "READY", "P6.C1", "DEAL", jakob({ acceptedAs: "VARIANT" }), {}, file("L6a")],
  ["pamela-p6-c1-arkiv-return-ready-01", "P6.C1", "READY", "RETURN", jakob({ acceptedAs: "VARIANT" }), file("L6a")],
  ["pamela-p6-c1-plan-return-ready-01", "P6.C1", "READY", "RETURN", jakob(), file("L6x")],
  // P7: two returns to A1 he accepted; the older continues the deal, the newer starts from an anchor nothing ends on.
  ["pamela-p7-c1-plan-deal-01", "READY", "P7.C1", "DEAL", jakob(), {}, file("L7")],
  ["pamela-p7-c1-plan-return-idle-01", "P7.C1", "IDLE", "RETURN", jakob(), file("L7")],
  ["pamela-p7-c1-plan-return-idle-02", "P7.C1", "IDLE", "RETURN", jakob(), file("L7x")],
]);
const graph = buildGraph(data);
const page = primaries(data, graph);
const row = (edge: string): Row => page.rows.find((r) => r.edge.id === edge)!;

test("one row per film of a whole round, grouped seat by seat", () => {
  assert.equal(page.rows.length, graph.summary.films.required.length);
  assert.deepEqual(page.groups.map((g) => g.id), ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "D", "hub"]);
  assert.deepEqual(page.groups[3].rows.map((r) => r.role), ["deal", "ready", "idle"]);
  assert.deepEqual(page.groups.at(-1)!.rows.map((r) => r.role), ["entry", "exit", "rest", "arrive", "leave"]);
  assert.deepEqual(page.groups[7].rows.map((r) => r.edge.id), ["READY>D.C1", "D.C1>READY", "D.C1>IDLE", "READY>D.C2", "D.C2>READY", "D.C2>IDLE", "IDLE>REVEAL(D.C2)"]);
});

test("the five states of a row", () => {
  assert.equal(row("READY>P1.C1").status, "primary");
  assert.equal(row("READY>P1.C1").proposal?.id, "pamela-p1-c1-plan-deal-01", "the Primär is shown, not replaced");
  assert.equal(row("READY>P2.C1").status, "none", "a reviewer's ✓ is not his");
  assert.equal(row("READY>P2.C1").proposal, null);
  assert.equal(row("READY>P3.C1").status, "gap");
  assert.equal(row("IDLE>READY").status, "same");
  assert.equal(row("P5.C1>READY").status, "different");
  const sum = Object.values(page.counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, page.rows.length);
});

test("the three films he called very good lead the page, also when a newer take would be proposed", () => {
  assert.deepEqual(page.praised.map((r) => r.proposal?.id), [...PRAISED]);
  assert.ok(page.praised.every((r) => r.praised));
  const deal = row("READY>P4.C1");
  assert.equal(deal.proposal?.id, "pamela-p4-c1-plan-deal-02");
  assert.deepEqual(deal.others.map((t) => t.id), ["pamela-p4-c1-plan-deal-05"]);
});

test("a return is proposed that continues the deal before it, before a newer one", () => {
  const back = row("P7.C1>IDLE");
  assert.equal(back.proposal?.id, "pamela-p7-c1-plan-return-idle-01");
  assert.deepEqual(back.others.map((t) => t.id), ["pamela-p7-c1-plan-return-idle-02"]);
  assert.equal(back.status, "same");
  assert.deepEqual(back.seam, { tone: "ok", text: "Fortsätter given som spelas nu." });
  // The praised return on P4 continues deal 02, while the newer deal 05 plays: making it Primär brings deal 02 back.
  const praised = row("P4.C1>IDLE");
  assert.equal(praised.now?.id, "pamela-p4-c1-return-idle-calm-01");
  assert.equal(praised.status, "different");
  assert.deepEqual(praised.seam, { tone: "ok", text: "Då spelas Giv 02 (godkänd) före, eftersom returen fortsätter den." });
});

test("a deal: whether the returns after it continue it", () => {
  const deal = row("READY>P7.C1");
  assert.equal(deal.status, "same");
  assert.deepEqual(deal.seam, { tone: "ok", text: "Returerna som spelas fortsätter den." });
  // The praised deal 02 on P4: both its returns start from its anchor; the calm return to A1 gives way.
  const p4 = row("READY>P4.C1");
  assert.equal(p4.seam?.tone, "ok");
  assert.match(p4.seam!.text, /Returen till A1 blir Retur 01/);
});

test("seat 5: a Primär return pulls in the variant deal it continues", () => {
  const back = row("P5.C1>READY");
  assert.equal(back.now?.id, "pamela-p5-c1-arkiv-return-ready-01");
  assert.equal(back.proposal?.id, "pamela-p5-c1-plan-return-ready-01");
  assert.equal(back.seam?.tone, "warn");
  assert.match(back.seam!.text, /^Då spelas Giv 01 \(variant\) före, eftersom returen fortsätter den\.$/);
});

test("seat 6: no playable deal ends where the return starts: a visible jump", () => {
  const back = row("P6.C1>READY");
  assert.equal(back.status, "different");
  assert.equal(back.seam?.tone, "bad");
  assert.match(back.seam!.text, /synligt hopp/);
  // The seat's line: the deal that plays and the proposed return do not meet.
  const group = page.groups.find((g) => g.id === "P6")!;
  assert.ok(group.pairs.some((p) => p.tone === "bad" && /A2\.1/.test(p.text)));
});

test("what a Primär would be: the bank changed in memory only", () => {
  const take = graph.takes["pamela-p1-c1-plan-deal-02"];
  const changed = withPrimary(data, graph, take);
  assert.equal(changed.motions!["pamela-p1-c1-plan-deal-02"].review?.acceptedAs, "MAIN");
  assert.equal(changed.motions!["pamela-p1-c1-plan-deal-01"].review?.acceptedAs, undefined, "the earlier Primär is lowered");
  assert.equal(changed.motions!["pamela-p1-c1-plan-deal-01"].review?.decision, "ACCEPTED");
  assert.equal(data.motions!["pamela-p1-c1-plan-deal-01"].review?.acceptedAs, "MAIN", "the bank itself is untouched");
});

test("Gör primär: one write for the take, then an earlier Primär on the edge is lowered with its note kept", async () => {
  const calls: [string, Decision, string, string][] = [];
  const put = async (id: string, decision: Decision, note: string, revision: string) => {
    calls.push([id, decision, note, revision]);
    return { id, review: {}, revision };
  };
  const result = await makePrimary(graph.takes["pamela-p1-c1-plan-deal-02"], graph, put);
  assert.deepEqual(calls, [
    ["pamela-p1-c1-plan-deal-02", "MAIN", "bra.", '"pamela-p1-c1-plan-deal-02"'],
    ["pamela-p1-c1-plan-deal-01", "ACCEPTED", "bra.", '"pamela-p1-c1-plan-deal-01"'],
  ]);
  assert.deepEqual(result, { lowered: ["Giv 01"], failed: [] });
  // Nothing else is written; a failed lowering is reported, not hidden.
  const failing = async (id: string, decision: Decision, note: string, revision: string) => {
    if (decision === "ACCEPTED") throw new Error("409");
    return { id, review: {}, revision };
  };
  assert.deepEqual(await makePrimary(graph.takes["pamela-p1-c1-plan-deal-02"], graph, failing), { lowered: [], failed: ["Giv 01"] });
  const once: string[] = [];
  await makePrimary(graph.takes["pamela-p5-c1-plan-return-ready-01"], graph, async (id, decision, note, revision) => {
    once.push(id);
    return { id, review: {}, revision };
  });
  assert.deepEqual(once, ["pamela-p5-c1-plan-return-ready-01"]);
});

test("an empty bank gives rows that all say gap", () => {
  const empty = primaries({}, buildGraph({}));
  assert.ok(empty.rows.every((r) => r.status === "gap"));
  assert.equal(empty.praised.length, 0);
});
