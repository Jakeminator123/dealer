// The round as the stage plays it (studio/lib/parts.ts). Run: node --test "studio/tests/parts.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, resolveRound, type BankData, type BankJob, type Step } from "../../src/clip-graph.ts";
import {
  GAP_SECONDS,
  atEnd,
  clampPosition,
  cutsOf,
  firstPosition,
  nextStep,
  partSeconds,
  partsKey,
  partsOf,
  positionAt,
  readout,
  roundSeconds,
  runFrom,
  shareOf,
  stepFrame,
  timeline,
  type PlayPart,
} from "../lib/parts.ts";

const video = (id: string) => `assets/motions/${id}/source.mp4`;
const job = (id: string, kind: string, from: string, to: string, extra: Partial<BankJob> = {}): BankJob => ({
  id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_720p", audio: false, promptText: "", first: {}, purpose: "", ...extra,
});
const startsOn = (clip: string, index: number) => ({ first: { frame: { video: video(clip), videoSha256: "", index } } });

// The round Jakob liked, as the bank holds it today (entry 60 frames, deal 120 cut at 105 where its return starts, return 90),
// a slow-motion deal to P2 (speed 2), and nothing playable to the dealer's hole card.
const bank: BankData = {
  jobs: [
    job("pamela-idle-ready-entry-01", "ENTRY", "IDLE", "READY"),
    job("pamela-p4-c1-plan-deal-02", "DEAL", "READY", "P4.C1"),
    job("pamela-p4-c1-plan-return-idle-01", "RETURN", "P4.C1", "IDLE", startsOn("pamela-p4-c1-plan-deal-02", 105)),
    job("pamela-p4-c1-plan-return-ready-01", "RETURN", "P4.C1", "READY", startsOn("pamela-p4-c1-plan-deal-02", 105)),
    job("pamela-p2-c1-slow-deal-01", "DEAL", "READY", "P2.C1", { playbackSpeed: 2 }),
    job("pamela-d-c2-plan-deal-01", "DEAL", "READY", "D.C2"),
  ],
  motions: {
    "pamela-idle-ready-entry-01": { source: { frames: 60, fps: 30 } },
    "pamela-p4-c1-plan-deal-02": { source: { frames: 120, fps: 30 } },
    "pamela-p4-c1-plan-return-idle-01": { source: { frames: 90, fps: 30 } },
    "pamela-p4-c1-plan-return-ready-01": { source: { frames: 90, fps: 30 } },
    "pamela-p2-c1-slow-deal-01": { source: { frames: 120, fps: 30 } },
    "pamela-d-c2-plan-deal-01": { source: { frames: 120, fps: 30 }, review: { decision: "REJECTED" } },
  },
  media: Object.fromEntries(
    ["pamela-idle-ready-entry-01", "pamela-p4-c1-plan-deal-02", "pamela-p4-c1-plan-return-idle-01", "pamela-p4-c1-plan-return-ready-01", "pamela-p2-c1-slow-deal-01", "pamela-d-c2-plan-deal-01"].map(
      (id) => [id, { video: video(id), track: `assets/tracking/${id}/card-track.json` }],
    ),
  ),
};
const graph = buildGraph(bank);
const round = (steps: Step[]) => partsOf(resolveRound(graph, steps));
const seatFour = round([
  { from: "IDLE", to: "READY", take: "pamela-idle-ready-entry-01" },
  { from: "READY", to: "P4.C1", take: "pamela-p4-c1-plan-deal-02" },
  { from: "P4.C1", to: "IDLE", take: "pamela-p4-c1-plan-return-idle-01" },
]);

test("segments become parts: path from the root, frames end exclusive, the deal cut where its return starts", () => {
  assert.deepEqual(
    seatFour.map((p) => [p.step, p.edge, p.path, p.start, p.end, p.fps, p.speed, p.gap, p.known]),
    [
      [0, "IDLE>READY", "/assets/motions/pamela-idle-ready-entry-01/source.mp4", 0, 60, 30, 1, null, true],
      [1, "READY>P4.C1", "/assets/motions/pamela-p4-c1-plan-deal-02/source.mp4", 0, 105, 30, 1, null, true],
      [2, "P4.C1>IDLE", "/assets/motions/pamela-p4-c1-plan-return-idle-01/source.mp4", 0, 90, 30, 1, null, true],
    ],
  );
  assert.equal(seatFour[1].track, "/assets/tracking/pamela-p4-c1-plan-deal-02/card-track.json");
  assert.equal(seatFour[1].take, "pamela-p4-c1-plan-deal-02");
  assert.deepEqual(cutsOf(seatFour), [
    { from: 0, last: 59, to: 1, first: 0 },
    { from: 1, last: 104, to: 2, first: 0 },
  ]);
  assert.equal(roundSeconds(seatFour), (60 + 105 + 90) / 30);
});

test("a gap has no path and says why; a slow-motion take counts at its own speed", () => {
  const parts = round([{ from: "READY", to: "P2.C1" }, { from: "P2.C1", to: "READY" }, { from: "READY", to: "D.C2" }]);
  assert.equal(parts[0].speed, 2);
  assert.equal(partSeconds(parts[0]), 120 / 30 / 2);
  assert.equal(parts[1].path, null);
  assert.equal(parts[1].gap, "MISSING");
  assert.equal(parts[2].gap, "REJECTED");
  assert.equal(partSeconds(parts[2]), GAP_SECONDS);
  assert.equal(roundSeconds(parts), 2); // gaps are not film time
  assert.deepEqual(cutsOf(parts), []);
});

test("a film whose length the bank does not know ends where its order says, and says so", () => {
  const unknown = buildGraph({ jobs: [job("pamela-x-entry-01", "ENTRY", "IDLE", "READY", { duration: 2 })], media: { "pamela-x-entry-01": { video: video("pamela-x-entry-01") } } });
  const [part] = partsOf(resolveRound(unknown, [{ from: "IDLE", to: "READY" }]));
  assert.equal(part.end, 60);
  assert.equal(part.known, false);
});

const gapped: PlayPart[] = [
  { ...seatFour[0], step: 0 },
  { ...seatFour[1], step: 1, path: null, gap: "MISSING", start: 0, end: 0 },
  { ...seatFour[1], step: 2 },
  { ...seatFour[2], step: 3, start: 10 },
];

test("one frame on and back, across a cut and over a gap", () => {
  assert.deepEqual(stepFrame(seatFour, { step: 0, frame: 58 }, 1), { step: 0, frame: 59 });
  assert.deepEqual(stepFrame(seatFour, { step: 0, frame: 59 }, 1), { step: 1, frame: 0 });
  assert.deepEqual(stepFrame(seatFour, { step: 1, frame: 0 }, -1), { step: 0, frame: 59 });
  assert.deepEqual(stepFrame(seatFour, { step: 1, frame: 104 }, 1), { step: 2, frame: 0 });
  assert.deepEqual(stepFrame(seatFour, { step: 2, frame: 0 }, -1), { step: 1, frame: 104 });
  // the ends of the round hold
  assert.deepEqual(stepFrame(seatFour, { step: 0, frame: 0 }, -1), { step: 0, frame: 0 });
  assert.deepEqual(stepFrame(seatFour, { step: 2, frame: 89 }, 1), { step: 2, frame: 89 });
  // a gap is passed over, and from a gap the next film in that direction is found
  assert.deepEqual(stepFrame(gapped, { step: 0, frame: 59 }, 1), { step: 2, frame: 0 });
  assert.deepEqual(stepFrame(gapped, { step: 2, frame: 0 }, -1), { step: 0, frame: 59 });
  assert.deepEqual(stepFrame(gapped, { step: 1, frame: 0 }, 1), { step: 2, frame: 0 });
  assert.deepEqual(stepFrame(gapped, { step: 3, frame: 10 }, -1), { step: 2, frame: 104 });
});

test("runs, the next step and the end", () => {
  assert.deepEqual(runFrom(gapped, 0).map((p) => p.step), [0]);
  assert.deepEqual(runFrom(gapped, 1), []);
  assert.deepEqual(runFrom(gapped, 2).map((p) => p.step), [2, 3]);
  assert.equal(nextStep(gapped, 1, false), 2);
  assert.equal(nextStep(gapped, 3, false), null);
  assert.equal(nextStep(gapped, 3, true), 0);
  assert.equal(atEnd(seatFour, { step: 2, frame: 89 }), true);
  assert.equal(atEnd(seatFour, { step: 2, frame: 88 }), false);
  assert.deepEqual(firstPosition(gapped), { step: 0, frame: 0 });
  assert.equal(firstPosition([]), null);
  assert.deepEqual(clampPosition(seatFour, { step: 1, frame: 400 }), { step: 1, frame: 104 });
  assert.deepEqual(clampPosition(gapped, { step: 3, frame: 2 }), { step: 3, frame: 10 });
  assert.deepEqual(clampPosition(gapped, { step: 1, frame: 7 }), { step: 1, frame: 0 });
  assert.deepEqual(clampPosition(seatFour, { step: 9, frame: 7 }), { step: 0, frame: 0 });
});

test("the scrub bar: shares by time on screen, and back to a place", () => {
  const spans = timeline(seatFour);
  assert.equal(spans.length, 3);
  assert.equal(spans[0].from, 0);
  assert.ok(Math.abs(spans[0].to - 60 / 255) < 1e-12);
  assert.ok(Math.abs(spans[2].to - 1) < 1e-12);
  assert.deepEqual(positionAt(seatFour, 0), { step: 0, frame: 0 });
  assert.deepEqual(positionAt(seatFour, 1), { step: 2, frame: 89 });
  assert.deepEqual(positionAt(seatFour, 60 / 255), { step: 1, frame: 0 });
  for (const pos of [{ step: 0, frame: 17 }, { step: 1, frame: 104 }, { step: 2, frame: 45 }]) assert.deepEqual(positionAt(seatFour, shareOf(seatFour, pos) + 1e-9), pos);
  const g = timeline(gapped);
  assert.equal(g[1].gap, true);
  assert.deepEqual(positionAt(gapped, (g[1].from + g[1].to) / 2), { step: 1, frame: 0 });
});

test("the read-out and the key", () => {
  assert.equal(readout(seatFour, { step: 1, frame: 88 }), "steg 2/3 · ruta 88/104");
  assert.equal(readout(gapped, { step: 1, frame: 0 }), "steg 2/4 · lucka");
  assert.equal(readout(seatFour, null), "steg –/3");
  assert.equal(partsKey(seatFour), partsKey(round([
    { from: "IDLE", to: "READY", take: "pamela-idle-ready-entry-01" },
    { from: "READY", to: "P4.C1", take: "pamela-p4-c1-plan-deal-02" },
    { from: "P4.C1", to: "IDLE", take: "pamela-p4-c1-plan-return-idle-01" },
  ])));
  assert.notEqual(partsKey(seatFour), partsKey(gapped));
});
