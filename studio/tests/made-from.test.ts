// What a take was made from (studio/components/takes/made-from.ts) and the help line under the decision buttons
// (decision-help.ts). Run from the repo root: node --test "studio/tests/made-from.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob } from "../../src/clip-graph.ts";
import { clipWords, originOf } from "../components/takes/made-from.ts";
import { DECISION_HELP, decisionHelp } from "../components/takes/decision-help.ts";

const sha = "a".repeat(64);
const deal: BankJob = {
  id: "pamela-p4-c1-plan-deal-02", kind: "DEAL", target: "P4.C1", from: "READY", to: "LAND(P4.C1)", model: "wan3", duration: 4, ratio: "auto_1080p", audio: false,
  promptText: "Locked camera. The dealer slides the card to seat 4.", purpose: "Seat 4 deal with the calm tempo.",
  first: { file: { path: "assets/motions/pamela-p4-c1-color-control-01/start.png", sha256: sha }, note: "Proven READY anchor." },
  last: { frame: { video: "assets/motions/pamela-p4-c1-source-turn/source.mp4", videoSha256: sha, index: 80 }, note: "End at the release." },
};
const back: BankJob = {
  ...deal, id: "pamela-p4-c1-plan-return-idle-01", kind: "RETURN", from: "LAND(P4.C1)", to: "IDLE", duration: 3, promptText: "", purpose: "",
  first: { frame: { video: "assets/motions/pamela-p4-c1-plan-deal-02/source.mp4", videoSha256: sha, index: 88 } }, last: { file: { path: "lokal/1e5dc6d46f939688.png", sha256: sha } },
};
const bank: BankData = {
  jobs: [deal, back],
  derived: [{ id: "pamela-readyb-draw-from-trial-01", kind: "ENTRY", from: "READY-B", to: "DRAWN", clip: "pamela-p4-c1-plan-deal-02", frames: [0, 50] }],
  motions: { [deal.id]: { source: { fps: 30, frames: 121 } }, [back.id]: { source: { fps: 30, frames: 90 } } },
  media: {
    [deal.id]: { video: `assets/motions/${deal.id}/source.mp4`, first: `assets/motions/${deal.id}/first.webp`, last: null },
    [back.id]: { video: `assets/motions/${back.id}/source.mp4`, first: null, last: null },
  },
};

test("a generated take: its pictures, where each came from, the model, the length, the prompt and purpose", () => {
  const graph = buildGraph(bank);
  const o = originOf(graph.takes[deal.id], graph);
  assert.equal(o.how, "genererad");
  assert.equal(o.model, "Wan 3");
  assert.equal(o.length, "4,0 s · 121 rutor");
  assert.equal(o.first.still, `assets/motions/${deal.id}/first.webp`);
  assert.equal(o.first.frame, null, "a still the bank has is shown as it is");
  assert.match(o.first.words, /^bilden start\.png från /);
  assert.equal(o.first.note, "Proven READY anchor.");
  assert.deepEqual(o.last?.frame, { video: "assets/motions/pamela-p4-c1-source-turn/source.mp4", index: 80 }, "no last still: the frame is drawn from its film");
  assert.equal(o.last?.words, "ruta 80 ur p4-c1-source-turn");
  assert.equal(o.prompt, deal.promptText);
  assert.equal(o.purpose, deal.purpose);
});

test("a return starts on a frame of the deal it follows; a picture outside the bank is named without its path", () => {
  const graph = buildGraph(bank);
  const o = originOf(graph.takes[back.id], graph);
  assert.equal(o.first.words, `ruta 88 ur ${clipWords(graph, deal.id)}`);
  assert.match(clipWords(graph, deal.id), /^A2\.1 → P4C1 · /);
  assert.equal(o.last?.words, "en bild som bara finns hos Jakob");
  assert.equal(o.prompt, null, "no prompt in the bank: none shown");
});

test("a cut-out take names its clip and frames, and its pictures are that clip's frames", () => {
  const graph = buildGraph(bank);
  const o = originOf(graph.takes["pamela-readyb-draw-from-trial-01"], graph);
  assert.equal(o.how, "utsnitt");
  assert.deepEqual(o.cutFrom && { start: o.cutFrom.start, end: o.cutFrom.end, clip: o.cutFrom.clip }, { start: 0, end: 50, clip: deal.id });
  assert.equal(o.length, "1,7 s · 51 rutor");
  assert.deepEqual(o.first.frame, { video: `assets/motions/${deal.id}/source.mp4`, index: 0 });
  assert.deepEqual(o.last?.frame, { video: `assets/motions/${deal.id}/source.mp4`, index: 50 });
});

test("the help line says what each choice does to what is played, and the rest step's own rule", () => {
  assert.deepEqual(DECISION_HELP.map((p) => p.word), ["Primär", "Godkänd", "Variant", "Underkänd"]);
  assert.match(DECISION_HELP[0].text, /först/);
  assert.match(DECISION_HELP[2].text, /ibland/);
  assert.match(DECISION_HELP[3].text, /aldrig/);
  assert.equal(decisionHelp("READY>P4.C1").rest, null);
  assert.match(decisionHelp("IDLE>IDLE").rest ?? "", /lugna loopen.*gester.*varianter/);
  // Plain words (Jakob 2026-11-12): a step, never an edge.
  assert.ok(!/kant|edge/i.test(JSON.stringify(DECISION_HELP) + decisionHelp("IDLE>IDLE").rest));
});
