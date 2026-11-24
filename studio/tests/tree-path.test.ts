// studio/lib/tree-path.ts: a path Jakob clicks through a tree on Karta and what the stage plays for it, back to back (Jakob
// 2026-11-23: "kan man inte tex här också spela upp flera klipp tillsammans"), on made-up data. Each step plays the tree's
// film on it, the Primär before an approved film and never a rejected or a waiting one; a step without one is a gap.
// Run from the repo root: node --test "studio/tests/tree-path.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import { treeSteps, type TreeTake } from "../../src/dealer-trees.ts";
import { PATH_GAP_WORD, nextNodes, parsePath, pathClips, pathParts, pathText } from "../lib/tree-path.ts";

type Review = NonNullable<MotionRecord["review"]>;
const jakob = (extra: Review = {}): Review => ({ decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-23: bra.", ...extra });
// id, from, to, kind, review, the verdict the tree reads for it, and whether its film lies here
type Row = [id: string, from: string, to: string, kind: string, review: Review, verdict: TreeTake["verdict"], file?: boolean];

function world(rows: Row[], tree = "t") {
  const jobs: BankJob[] = [];
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  for (const [id, from, to, kind, review, , file = true] of rows) {
    jobs.push({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
    motions[id] = { source: { frames: 120, fps: 30 }, review };
    media[id] = file ? { video: `assets/motions/${id}/source.mp4` } : {};
  }
  const takes: TreeTake[] = rows.map(([id, from, to, , , verdict]) => ({ id, tree, from, to, verdict, byJakob: true, provisional: false }));
  return { graph: buildGraph({ jobs, motions, media }, { mode: "CARD" }), takes };
}

const rows: Row[] = [
  ["paow-idle-ready-entry-01", "IDLE", "READY", "ENTRY", jakob(), "godkand"],
  // P1: his Primär, an approved film and a rejected one: the Primär plays.
  ["paow-p1-c1-plan-deal-01", "READY", "P1.C1", "DEAL", jakob(), "godkand"],
  ["paow-p1-c1-plan-deal-02", "READY", "P1.C1", "DEAL", jakob({ acceptedAs: "MAIN" }), "primar"],
  ["paow-p1-c1-plan-deal-03", "READY", "P1.C1", "DEAL", { decision: "REJECTED", userReview: "Jakob 2026-11-23: nej." }, "underkand"],
  // The way back from P1 has only a rejected film; P2's deal waits for his verdict.
  ["paow-p1-c1-plan-return-ready-01", "P1.C1", "READY", "RETURN", { decision: "REJECTED", userReview: "Jakob 2026-11-23: nej." }, "underkand"],
  ["paow-p2-c1-plan-deal-01", "READY", "P2.C1", "DEAL", { decision: "PENDING" }, "vantar"],
  // Her leaving is approved, but its film is not on this computer.
  ["paow-ready-idle-leave-01", "READY", "IDLE", "LEAVE", jakob(), "godkand", false],
];

test("where the path may go next: along the tree's steps from its last node", () => {
  const steps = treeSteps("READY", [], world(rows).takes);
  const first = nextNodes(steps, []);
  assert.ok(first.has("IDLE") && first.has("READY") && first.has("P1.C1"), "any node a step leaves from starts a path");
  assert.ok(!first.has("REVEAL(D.C1)"), "the hole card turned up leads nowhere");
  assert.deepEqual([...nextNodes(steps, ["IDLE"])].sort(), ["IDLE", "READY", "REVEAL(D.C1)"]);
  assert.equal(nextNodes(steps, ["IDLE", "READY"]).size, 17, "the 16 cards and back to A1");
  assert.deepEqual([...nextNodes(steps, ["READY", "P1.C1"])], ["READY"], "a card goes back to the anchor at the shoe");
});

test("each step of the path plays the tree's film: the Primär first, never a rejected or a waiting one", () => {
  const { graph, takes } = world(rows);
  const steps = treeSteps("READY", [], takes);
  const clips = pathClips(steps, ["IDLE", "READY", "P1.C1", "READY", "P2.C1", "IDLE"]);
  assert.deepEqual(
    clips.map((c) => [c.name, c.take, c.gap]),
    [
      ["A1 → A2.1", "paow-idle-ready-entry-01", null],
      ["A2.1 → A3P1C1", "paow-p1-c1-plan-deal-02", null],
      ["A3P1C1 → A2.1", null, "MISSING"],
      ["A2.1 → A3P2C1", null, "WAITING"],
      ["A3P2C1 → A1", null, "INVALID"],
    ],
  );

  const parts = pathParts(graph, clips);
  assert.deepEqual(parts.map((p) => p.step), [0, 1, 2, 3, 4], "one part per step, in order");
  assert.deepEqual(parts.map((p) => p.take), ["paow-idle-ready-entry-01", "paow-p1-c1-plan-deal-02", null, null, null]);
  assert.ok(parts[1].path?.endsWith("paow-p1-c1-plan-deal-02/source.mp4"), "the Primär's own film plays");
  assert.deepEqual(parts.slice(2).map((p) => [p.path, PATH_GAP_WORD[p.gap!]]), [[null, "film saknas"], [null, "väntar på dom"], [null, "inget steg"]]);
});

test("the tree's own film plays, not the bank's Primär when that is another tree's", () => {
  const { graph, takes } = world(rows);
  const mine = takes.filter((t) => t.id !== "paow-p1-c1-plan-deal-02"); // the Primär is placed in another tree
  const [part] = pathParts(graph, pathClips(treeSteps("READY", [], mine), ["READY", "P1.C1"]));
  assert.equal(part.take, "paow-p1-c1-plan-deal-01");
});

test("an approved film whose file is not here is a gap, not another film", () => {
  const { graph, takes } = world(rows);
  const parts = pathParts(graph, pathClips(treeSteps("READY", [], takes), ["IDLE", "READY", "IDLE"]));
  assert.equal(parts[0].take, "paow-idle-ready-entry-01");
  assert.deepEqual([parts[1].path, parts[1].take, PATH_GAP_WORD[parts[1].gap!]], [null, null, "filen saknas"]);
});

test("a step given from another anchor at the shoe plays that anchor's film", () => {
  const { graph, takes } = world([
    ["paow-ready-c-p6-c1-deal-01", "READY-C", "P6.C1", "DEAL", jakob(), "godkand"],
    ["paow-ready-b-p6-c1-deal-01", "READY-B", "P6.C1", "DEAL", jakob({ acceptedAs: "MAIN" }), "primar"],
  ]);
  const clips = pathClips(treeSteps("READY-C", ["READY-B"], takes), ["READY-C", "P6.C1"]);
  assert.deepEqual([clips[0].name, clips[0].take, clips[0].step?.via], ["A2.3 → A3P6C1", "paow-ready-b-p6-c1-deal-01", "READY-B"]);
  const [part] = pathParts(graph, clips);
  assert.equal(part.take, "paow-ready-b-p6-c1-deal-01");
  assert.ok(part.path?.endsWith("paow-ready-b-p6-c1-deal-01/source.mp4"));
});

test("the path in the address is his codes, and a code the tree lacks is left out", () => {
  const nodes = ["IDLE", "READY-C", "P4.C1", "REVEAL(D.C1)"].map((node) => ({ node, code: { IDLE: "A1", "READY-C": "A2.3", "P4.C1": "A3P4C1", "REVEAL(D.C1)": "DC1 upp" }[node]! }));
  const path = ["IDLE", "READY-C", "P4.C1", "READY-C"];
  assert.equal(pathText(path), "A1-A2.3-A3P4C1-A2.3");
  assert.deepEqual(parsePath(pathText(path), nodes), path);
  assert.deepEqual(parsePath("A1-A9-DC1 upp", nodes), ["IDLE", "REVEAL(D.C1)"]);
  assert.deepEqual(parsePath(null, nodes), []);
});
