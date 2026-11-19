// The round as the stage plays it (studio/lib/parts.ts). Run: node --test "studio/tests/parts.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, resolveRound, type BankData, type BankJob, type Step } from "../../src/clip-graph.ts";
import { createLayout } from "../../src/game-table.ts";
import { defaultPlan } from "../../src/placement-model.ts";
import type { Part } from "../../src/scene3d-film.ts";
import { createSceneEngine, type Scene } from "../components/stage/engines.ts";
import { readSceneCardTrial, withSceneCardTrial } from "../lib/scene-card-trial.ts";
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

test("a pinned film carry trial uses the plan and keeps the same source handoff into the return", () => {
  const clips = [["P1.C1", "earlier"], ["P4.C1", "trial"]] as const;
  const derived = clips.flatMap(([to, clip]): NonNullable<BankData["derived"]> => [
    { id: `${clip}-deal`, kind: "DEAL", from: "READY-C", to, clip, frames: [0, 64], dealer: "paow" },
    { id: `${clip}-back`, kind: "RETURN", from: to, to: "READY-C", clip, frames: [65, 96], dealer: "paow" },
  ]);
  const graph = buildGraph({ derived,
    media: Object.fromEntries(derived.map(d => [d.id, { video: video(d.clip), track: `assets/tracking/${d.clip}/card-track.json` }])),
    motions: Object.fromEntries(derived.map(d => [d.id, { source: { fps: 24, frames: 97 }, review: { decision: "ACCEPTED", acceptedAs: "VARIANT" } }])),
  }, { dealer: "paow" });
  const steps = derived.map(d => ({ from: d.from, to: d.to, take: d.id })), segments = resolveRound(graph, steps), source = partsOf(segments);
  const words = readSceneCardTrial(new URLSearchParams("kort=liggande&cardBack=dark&cardFace=paper"));
  assert.deepEqual(words, { back: "dark", face: "paper" });
  assert.equal(readSceneCardTrial(new URLSearchParams("cardBack=dark&cardFace=paper")), null);
  const plan = defaultPlan(), parts = withSceneCardTrial(source, segments, plan, "contract", words!);
  const [,, deal, back] = parts;
  assert.deepEqual([deal.start, deal.end, back.start, back.end], [0, 65, 65, 97]);
  assert.deepEqual(deal.cards?.land, createLayout(plan).quad({ owner: "P", seat: 4, hand: 0, hands: 1, index: 0 }));
  assert.deepEqual([deal.cards?.carry, deal.cards?.back, deal.cards?.face], ["film", "dark", "paper"]);
  assert.equal(back.cards?.returning, true);
  assert.equal(back.cards?.filmContinuesDeal, true);
  assert.deepEqual(back.cards?.land, deal.cards?.land);
  assert.deepEqual(back.cards?.placed?.map(card => card.target), ["P1.C1"], "the own card is drawn once and earlier cards stay on the table");
  assert.notEqual(partsKey(parts), partsKey(source), "the stage refreshes when only the card options changed");
  const separate = segments.map((s, i) => i === 3 ? { ...s, video: video("different") } : s);
  assert.equal(withSceneCardTrial(partsOf(separate), separate, plan, "contract", words!)[3].cards?.filmContinuesDeal, undefined);
});

test("the scene engine gives both playback and frame loading the part's card options", async () => {
  const played: Part[][] = [], loaded: Part[][] = [];
  const scene = { start() {}, onFrame() { return () => {}; }, players: {
    play(parts: Part[]) { played.push(parts); }, toggle() {}, async load(parts: Part[]) { loaded.push(parts); },
  } } as unknown as Scene;
  const engine = createSceneEngine(scene), cards = { returning: true, carry: "film", filmContinuesDeal: true } as const;
  const part: PlayPart = { step: 0, edge: "P4.C1>READY-C", from: "P4.C1", to: "READY-C", take: "trial", path: video("trial"), start: 65, end: 97, fps: 24, speed: 1, track: null, gap: null, known: true, cards };
  engine.play([part], 66, 0.5, { onStep() {}, onEnd() {}, onError(error) { throw error; } });
  await engine.show(part, 65);
  assert.deepEqual(played, [[{ path: part.path, start: 66, end: 97, fps: 24, rate: 0.5, cards }]]);
  assert.deepEqual(loaded, [[{ path: part.path, start: 65, end: 97, fps: 24, cards }]]);
  engine.dispose();
});

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

test("a film carry round keeps the shoe's appearance through the entry without placing a card early", () => {
  const segments = resolveRound(graph, [
    { from: "IDLE", to: "READY", take: "pamela-idle-ready-entry-01" },
    { from: "READY", to: "P4.C1", take: "pamela-p4-c1-plan-deal-02" },
    { from: "P4.C1", to: "IDLE", take: "pamela-p4-c1-plan-return-idle-01" },
  ]);
  const source = partsOf(segments), plan = defaultPlan(), words = { back: "dark", face: "paper" } as const;
  const trial = withSceneCardTrial(source, segments, plan, "contract", words);
  assert.deepEqual(trial.map(p => [p.cards?.carry, p.cards?.back, p.cards?.face]),
    Array.from({ length: 3 }, () => ["film", "dark", "paper"]));
  assert.deepEqual(trial[0].cards?.placed, []);
  assert.equal(trial[0].cards?.target, undefined);
  assert.equal(trial[0].cards?.land, undefined);
  assert.ok(source.every(p => p.cards === undefined), "the ordinary scene parts remain unchanged");
  const live = withSceneCardTrial(source, segments, plan, "contract", {}, null);
  assert.ok(live.every(p => p.cards?.carry === undefined), "the scene control supplies the carry mode");
  assert.ok(live[1].cards?.land && live[2].cards?.returning, "the ordinary scene keeps landing and return metadata");
  const gapped = [{ ...source[0], path: null }, ...source.slice(1)];
  assert.equal(withSceneCardTrial(gapped, segments, plan, "contract", words)[0], gapped[0], "a missing film stays a gap");
});

test("film carry applies to a resolved Primary deal and main return without locked takes", () => {
  const dealId = "pamela-p4-c1-plan-deal-02", backId = "pamela-p4-c1-plan-return-ready-01";
  const bankWithPrimary = { ...bank, motions: { ...bank.motions,
    [dealId]: { ...bank.motions?.[dealId], review: { decision: "ACCEPTED", acceptedAs: "MAIN" } },
  } };
  const segments = resolveRound(buildGraph(bankWithPrimary), [{ from: "READY", to: "P4.C1" }, { from: "P4.C1", to: "READY" }]);
  assert.deepEqual(segments.map(s => [s.take?.id, s.why]), [[dealId, "PRIMARY"], [backId, "MAIN"]]);

  const params = new URLSearchParams("kort=liggande&cardBack=dark&cardFace=paper");
  const source = partsOf(segments), plan = defaultPlan(), words = readSceneCardTrial(params)!;
  const trial = withSceneCardTrial(source, segments, plan, "contract", words);
  assert.deepEqual(trial.map(p => [p.take, p.cards?.carry, p.cards?.back, p.cards?.face]), [
    [dealId, "film", "dark", "paper"], [backId, "film", "dark", "paper"],
  ]);
  assert.equal(trial[1].cards?.returning, true);
  assert.equal(trial[1].cards?.filmContinuesDeal, undefined, "a separate source film keeps its ordinary return");

  const loneDeal = partsOf(segments.slice(0, 1));
  assert.equal(withSceneCardTrial(loneDeal, segments.slice(0, 1), plan, "contract", words), loneDeal);
  const missing = [segments[0], { ...segments[1], video: null }], missingParts = partsOf(missing);
  assert.equal(withSceneCardTrial(missingParts, missing, plan, "contract", words), missingParts);
  assert.equal(readSceneCardTrial(new URLSearchParams()), null);
  assert.ok(source.every(p => p.cards === undefined), "default parts have no trial card options");
});

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
