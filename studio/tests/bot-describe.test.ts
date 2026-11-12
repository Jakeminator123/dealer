// What a view tells the bot, in Jakob's words (studio/components/bot/describe.ts), and the guide the bot and the welcome
// read (studio/lib/guide.ts). Run: node --test "studio/tests/bot-describe.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import { cleanVal, contextLine, describeGranska, describeJamfor, describeKarta, describeProv, stepFacts, viewName, VIEW_NAMES } from "../components/bot/describe.ts";
import { FRAGA, GUIDE, WELCOME, WORDS, guideOf } from "../lib/guide.ts";
import type { Proof } from "../lib/api.ts";

const job = (id: string, from: string, to: string, kind: string): BankJob => ({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });

function graph() {
  const jobs = [job("pamela-p4-c1-plan-deal-01", "READY", "P4.C1", "DEAL"), job("pamela-p4-c1-plan-deal-02", "READY", "P4.C1", "DEAL"), job("pamela-p4-c1-plan-return-ready-01", "P4.C1", "READY", "RETURN")];
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  for (const j of jobs) {
    motions[j.id] = { source: { frames: 120, fps: 30 }, review: j.id.endsWith("deal-02") ? { decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-12: bra" } : { decision: "PENDING" } };
    media![j.id] = { video: `assets/motions/${j.id}/source.mp4` };
  }
  return buildGraph({ jobs, derived: [], edits: [], motions, receipts: {}, media } as unknown as BankData);
}
const q = (query: string) => new URLSearchParams(query);

test("Karta: the film and the take in his words, the verdict beside", () => {
  const g = graph();
  assert.deepEqual(describeKarta(g, q("kant=READY%3EP4.C1&tagning=pamela-p4-c1-plan-deal-02")), { kant: "A2.1 → P4C1", tagning: "Giv 02", omdome: "Godkänd" });
  assert.deepEqual(describeKarta(g, q("")), {});
  assert.deepEqual(describeKarta(null, q("kant=READY%3EP4.C1&filmer=kort")), { kant: "A2.1 → P4C1", filmer: "en film per kort" });
  // A take the bank does not know: its id without "pamela-", never nothing.
  assert.equal(describeKarta(g, q("tagning=pamela-okand-01")).tagning, "okand-01");
});

test("Granska: the take open on its film; the list of all", () => {
  const g = graph();
  assert.deepEqual(describeGranska(g, q("tagning=pamela-p4-c1-plan-deal-01")), { kant: "A2.1 → P4C1", tagning: "Giv 01", omdome: "Väntar" });
  assert.deepEqual(describeGranska(g, q("vy=alla")), { lista: "Alla tagningar" });
});

test("Jämför: the film and the pair", () => {
  assert.deepEqual(describeJamfor(graph(), q("kant=READY%3EP4.C1&a=pamela-p4-c1-plan-deal-01&b=pamela-p4-c1-plan-deal-02")), { kant: "A2.1 → P4C1", par: "Giv 01 mot Giv 02" });
});

test("Prov: the proof's title and the file's short name", () => {
  const proofs = [{ id: "v6-referens", title: "V6-referens", description: null, labels: { "kortstorlek.png": "Kortstorlek (mätt mot bordet)" }, verdicts: null, updatedAt: 0, chapters: null, fps: 30, files: [{ name: "kortstorlek.png", path: "x", kind: "image", bytes: 1 }] }] as Proof[];
  assert.deepEqual(describeProv(proofs, q("prov=v6-referens&fil=kortstorlek.png")), { prov: "V6-referens", fil: "Kortstorlek" });
  assert.deepEqual(describeProv(null, q("prov=v6-referens")), { prov: "v6-referens" });
  assert.deepEqual(describeProv(proofs, q("")), {});
});

test("Spela: the step on screen and its film", () => {
  const g = graph();
  const segments = [{ id: "READY>P4.C1", take: g.takes["pamela-p4-c1-plan-deal-02"] }, { id: "P4.C1>READY", take: null }];
  assert.deepEqual(stepFacts({ step: 0, frame: 88 }, segments), { steg: "1/2", film: "A2.1 → P4C1 · Giv 02", ruta: "88" });
  assert.deepEqual(stepFacts({ step: 1, frame: 0 }, segments), { steg: "2/2", film: "P4C1 → A2.1 · ingen tagning", ruta: "0" });
  assert.deepEqual(stepFacts(null, segments), {});
});

test("the chip: name and the first two choices, extras left out", () => {
  assert.equal(contextLine("Karta", { kant: "A2.1 → P4C1", omdome: "Godkänd", tagning: "Giv 02" }), "Karta · A2.1 → P4C1 · Giv 02");
  assert.equal(contextLine("Primära", {}), "Primära");
  assert.deepEqual(cleanVal({ a: " x ", b: "", c: null, d: undefined }), { a: "x" });
  assert.equal(viewName("karta"), "Karta");
  assert.equal(viewName("ny"), "Ny");
});

test("the guide has a text for every view the panel can name, and the welcome its three lines", () => {
  for (const vy of Object.keys(VIEW_NAMES)) {
    const g = guideOf(vy);
    assert.ok(g, vy);
    assert.equal(g!.namn, VIEW_NAMES[vy]);
    assert.ok(g!.text.length > 60 && g!.kort.length > 3, vy);
    assert.ok(g!.adress.startsWith("/studio/"), vy);
  }
  assert.equal(guideOf("fraga"), FRAGA);
  assert.equal(WELCOME.rader.length, 3);
  assert.ok(WORDS.some((w) => w.ord.startsWith("A2.1")));
  assert.equal(new Set(GUIDE.map((g) => g.vy)).size, GUIDE.length);
});

test("the guide ships in the copy: no machine path, no blocked name", () => {
  const release = JSON.parse(readFileSync(new URL("../../data/studio-release.json", import.meta.url), "utf8")) as { blocked: { names: string[] } };
  const text = JSON.stringify([GUIDE, FRAGA, WELCOME, WORDS]);
  assert.doesNotMatch(text, /\b[A-Za-z]:[\\/]|\/(?:Users|home|tmp)\//);
  assert.doesNotMatch(text, /127\.0\.0\.1/);
  for (const name of release.blocked.names) assert.ok(!text.includes(name), name);
});
