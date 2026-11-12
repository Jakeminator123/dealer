// The map's experiment lines (studio/components/map/experiment-lines.ts) and the rest step's groups (rest.ts).
// Run from the repo root: node --test "studio/tests/map-experiments.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import { mapLayout, segments, overlaps } from "../lib/map-layout.ts";
import { experimentLines } from "../components/map/experiment-lines.ts";
import { REST_EDGE, restGroups, restLine, restWord } from "../components/map/rest.ts";

const exp = (id: string, from: string, to: string) => ({ id, from, to });

test("A1 ↔ A2.2 are drawn as two dashed lanes that do not cross; experiments elsewhere stay in the tray", () => {
  const layout = mapLayout({ mode: "SEAT" });
  const lines = experimentLines(layout, [
    exp("IDLE-B>READY-B", "IDLE-B", "READY-B"),
    exp("READY-B>IDLE-B", "READY-B", "IDLE-B"),
    exp("READY-B>DRAWN", "READY-B", "DRAWN"),
    exp("DRAWN>P4.C1", "DRAWN", "P4.C1"),
    exp("P4.C1>IDLE-B", "P4.C1", "IDLE-B"),
    exp("READY-B>READY-B", "READY-B", "READY-B"),
  ]);
  assert.deepEqual(lines.map((l) => [l.id, l.text, l.nodes]), [
    ["IDLE-B>READY-B", "A1 → A2.2", ["IDLE", "READY-B"]],
    ["READY-B>IDLE-B", "A2.2 → A1", ["READY-B", "IDLE"]],
  ]);
  assert.match(lines[0].detail, /öppna skon/);
  // The two lines have no piece in common, and neither runs through a node other than its own two.
  const [a, b] = lines.map((l) => segments(l.path));
  for (const p of a) for (const q of b) assert.ok(!overlaps(p, q), `${JSON.stringify(p)} meets ${JSON.stringify(q)}`);
  for (const line of lines)
    for (const node of layout.nodes.filter((n) => !line.nodes.includes(n.id)))
      for (const piece of segments(line.path)) assert.ok(!overlaps(piece, node.box), `${line.text} crosses ${node.id}`);
  // The labels stay apart.
  assert.ok(Math.abs(lines[0].label.x - lines[1].label.x) > 120);
});

test("one lane each way: a second film of the same pair stays in the tray", () => {
  const layout = mapLayout({ mode: "CARD" });
  const lines = experimentLines(layout, [exp("IDLE-B>READY-B", "IDLE-B", "READY-B"), exp("IDLE>READY-B", "IDLE", "READY-B")]);
  assert.deepEqual(lines.map((l) => l.id), ["IDLE-B>READY-B"]);
});

const sha = "a".repeat(64);
const restJob = (id: string): BankJob => ({ id, kind: "IDLE", target: null, from: "IDLE", to: "IDLE", model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: { file: { path: "assets/anchors/idle/anchor.png", sha256: sha } }, last: { file: { path: "assets/anchors/idle/anchor.png", sha256: sha } }, purpose: "" });
const record = (decision: string, idle: NonNullable<MotionRecord["motion"]>["idle"], variant = false): MotionRecord => ({ source: { fps: 30, frames: 120 }, review: { decision, ...(variant ? { acceptedAs: "VARIANT" } : {}) }, motion: { idle } });

test("the rest step: calm films are the base, gestures are picked at random between them, each with its own word", () => {
  const ids = ["pamela-idle-loop-01", "pamela-idle-breath-b-01", "pamela-idle-smile-01", "pamela-idle-cough-01", "pamela-idle-coffee-01", "pamela-idle-stretch-01"];
  const bank: BankData = {
    jobs: ids.map(restJob),
    motions: {
      "pamela-idle-loop-01": record("ACCEPTED", { calm: true, weight: 10, label: "lugn vila" }, true),
      "pamela-idle-breath-b-01": record("ACCEPTED", { calm: true, weight: 20, label: "andning" }),
      "pamela-idle-smile-01": record("ACCEPTED", { calm: false, weight: 4, label: "leende" }, true),
      "pamela-idle-cough-01": record("ACCEPTED", { calm: false, weight: 0, onRequest: true, label: "handen för munnen" }, true),
      "pamela-idle-coffee-01": record("REJECTED", { calm: false, weight: 0, label: "kaffe" }),
      "pamela-idle-stretch-01": record("ACCEPTED", { calm: false, weight: 2 }, true),
    },
    media: Object.fromEntries(ids.map((id) => [id, { video: `assets/motions/${id}/source.mp4` }])),
  };
  const graph = buildGraph(bank);
  const groups = restGroups(graph.edge[REST_EDGE]);
  assert.deepEqual(groups.lugna.map((t) => t.id), ["pamela-idle-breath-b-01", "pamela-idle-loop-01"], "calm, by their share of the rest");
  assert.deepEqual(groups.gester.map((t) => t.id), ["pamela-idle-smile-01", "pamela-idle-stretch-01", "pamela-idle-cough-01"], "gestures by share, the one only on request last");
  assert.deepEqual(groups.underkanda.map((t) => t.id), ["pamela-idle-coffee-01"]);
  assert.equal(restWord(graph.takes["pamela-idle-breath-b-01"]), "Andning");
  assert.equal(restWord({ id: "pamela-idle-smile-02", idle: null }), "Smile 02", "without a word in the record: the id");
  assert.equal(restLine(20), "Vilan · 20 filmer");
  assert.equal(restLine(1), "Vilan · 1 film");
});
