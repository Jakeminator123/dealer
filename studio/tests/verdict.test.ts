// Verdicts of takes and proof files (studio/lib/verdict.ts). Run: node --test studio/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob } from "../../src/clip-graph.ts";
import { DECISIONS, NOTE_LIMIT as STORE_LIMIT, applyChange, applyProvisional } from "../../tools/review-store.ts";
import { NOTE_LIMIT, type Decision } from "../lib/api.ts";
import { SAID_WITHOUT_NOTE, awaitingJakob, chosenDecision, primarCount, proofVerdict, provisionalChip, provisionalOf, reviewStamp, splitLabel, storedNote, verdictOf, verdictPhrase } from "../lib/verdict.ts";

type R = Record<string, unknown>;
const take = (review: R | null, extra: R = {}) => ({
  stage: "DONE" as const,
  decision: String(review?.decision ?? "PENDING"),
  variant: review?.acceptedAs === "VARIANT",
  explicitMain: review?.acceptedAs === "MAIN",
  motion: review ? { review } : null,
  ...extra,
});
const jakob = "Jakob 2026-11-11: Det ser bra ut.";

test("the five verdicts and whose word it is", () => {
  assert.deepEqual(verdictOf(take({ decision: "ACCEPTED", acceptedAs: "MAIN", userAccepted: true, userReview: jakob })), { verdict: "primar", byJakob: true, label: "Primär", sign: "★", detail: null, provisional: false });
  assert.equal(verdictOf(take({ decision: "ACCEPTED", userAccepted: true, userReview: jakob })).verdict, "godkand");
  assert.equal(verdictOf(take({ decision: "ACCEPTED", acceptedAs: "VARIANT", userAccepted: true, userReview: jakob })).verdict, "variant");
  assert.equal(verdictOf(take({ decision: "PENDING", userAccepted: false })).verdict, "vantar");
  assert.equal(verdictOf(take(null)).verdict, "vantar");
  assert.equal(verdictOf(take({})).verdict, "vantar");
  assert.deepEqual(verdictOf(take({ decision: "REJECTED", userAccepted: false, userReview: jakob })), { verdict: "underkand", byJakob: true, label: "Underkänd", sign: "✕", detail: null, provisional: false });
  // A reviewer's decision: no userAccepted / no words of Jakob's.
  assert.equal(verdictOf(take({ decision: "ACCEPTED" })).byJakob, false);
  assert.equal(verdictOf(take({ decision: "REJECTED" })).byJakob, false);
  assert.equal(verdictOf(take({ decision: "ACCEPTED", acceptedAs: "VARIANT", userAccepted: false })).byJakob, false);
  // Secondary: set aside, with his words about its faults when he gave it.
  assert.deepEqual(verdictOf(take({ decision: "SECONDARY", userAccepted: false, userReview: "Jakob 2026-11-10: dålig." })), { verdict: "underkand", byJakob: true, label: "Underkänd", sign: "✕", detail: "sekundär", provisional: false });
  // Not finished.
  assert.deepEqual(verdictOf(take(null, { stage: "ORDERED" })), { verdict: "vantar", byJakob: false, label: "Väntar", sign: "○", detail: "renderas", provisional: false });
  assert.equal(verdictOf(take(null, { stage: "FAILED" })).detail, "misslyckad");
});

test("the chosen button", () => {
  assert.equal(chosenDecision(take({ decision: "ACCEPTED", acceptedAs: "MAIN" })), "MAIN");
  assert.equal(chosenDecision(take({ decision: "ACCEPTED", acceptedAs: "VARIANT" })), "VARIANT");
  assert.equal(chosenDecision(take({ decision: "ACCEPTED" })), "ACCEPTED");
  assert.equal(chosenDecision(take({ decision: "REJECTED" })), "REJECTED");
  assert.equal(chosenDecision(take({ decision: "PENDING" })), null);
  assert.equal(chosenDecision(take({ decision: "SECONDARY" })), null);
});

test("the stored note is his words only, checked against the review store itself", () => {
  assert.equal(storedNote({ userReview: jakob }), "Det ser bra ut.");
  assert.equal(storedNote({}), "");
  assert.equal(storedNote(null), "");
  assert.equal(reviewStamp({ userReview: jakob }), "Jakob 2026-11-11");
  // Every decision saved without a note writes words that are not a note.
  for (const decision of DECISIONS.filter((d) => d !== "PENDING")) {
    const review = applyChange({}, { decision, note: "" }, "2026-11-12");
    assert.equal(storedNote(review), "", decision);
    assert.ok(SAID_WITHOUT_NOTE.includes(String(review.userReview).replace(/^Jakob 2026-11-12: /, "")), decision);
  }
  const kept = applyChange({}, { decision: "ACCEPTED", note: "Bra hand." }, "2026-11-12");
  assert.equal(storedNote(kept), "Bra hand.");
  // The lowered Primär keeps its note: storedNote of the old record, saved again as a plain approval.
  const main = applyChange({}, { decision: "MAIN", note: "Den bästa." }, "2026-11-11");
  const lowered = applyChange(main, { decision: "ACCEPTED", note: storedNote(main) }, "2026-11-12");
  assert.equal(lowered.userReview, "Jakob 2026-11-12: Den bästa.");
  assert.equal(lowered.acceptedAs, undefined);
});

test("the studio's decisions are the store's", () => {
  const ours: Decision[] = ["MAIN", "ACCEPTED", "VARIANT", "REJECTED", "PENDING"];
  for (const d of ours) assert.ok((DECISIONS as readonly string[]).includes(d), d);
  assert.equal(NOTE_LIMIT, STORE_LIMIT);
});

test("counts for the rail", () => {
  const job = (id: string, from: string, to: string, kind: string): BankJob => ({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
  const bank: BankData = {
    jobs: [job("a-deal-01", "READY", "P4.C1", "DEAL"), job("a-deal-02", "READY", "P4.C1", "DEAL"), job("a-deal-03", "READY", "P4.C1", "DEAL"), job("b-ret-01", "P4.C1", "READY", "RETURN")],
    motions: {
      "a-deal-01": { source: { frames: 120 }, review: { decision: "ACCEPTED", acceptedAs: "MAIN", userAccepted: true, userReview: jakob } },
      "a-deal-02": { source: { frames: 120 }, review: { decision: "PENDING" } },
      "a-deal-03": { source: { frames: 120 }, review: { decision: "REJECTED" } },
      "b-ret-01": { source: { frames: 90 } },
    },
  };
  const graph = buildGraph(bank);
  assert.deepEqual(awaitingJakob(graph).map((t) => t.id), ["a-deal-02", "b-ret-01"]);
  const count = primarCount(graph);
  assert.equal(count.set, 1);
  assert.equal(count.total, graph.summary.films.required.length);
});

test("proof files: stated verdict first, then the label's words", () => {
  const proof = { labels: { "a.mp4": "Hemvy (användbar med anmärkning: kanten)", "b.mp4": "Titta runt · inte användbar", "c.png": "Bara mätt, inte granskad", "d.mp4": "Godkänd hemvy" }, verdicts: { "e.mp4": "ok", "f.mp4": "nonsense" } };
  assert.equal(proofVerdict(proof, "a.mp4"), "remarks");
  assert.equal(proofVerdict(proof, "b.mp4"), "failed");
  assert.equal(proofVerdict(proof, "c.png"), "unreviewed");
  assert.equal(proofVerdict(proof, "d.mp4"), "ok");
  assert.equal(proofVerdict(proof, "e.mp4"), "ok");
  assert.equal(proofVerdict(proof, "f.mp4"), null);
  assert.equal(proofVerdict({ labels: null, verdicts: null }, "x.mp4"), null);
  assert.deepEqual(splitLabel("Titta runt · 3D-salong (exakt)"), { name: "Titta runt · 3D-salong", rest: "(exakt)" });
  assert.deepEqual(splitLabel("Hemvy. Kameran står still"), { name: "Hemvy. Kameran står still", rest: "" });
  assert.deepEqual(splitLabel("Hemvy salong. Kameran står still"), { name: "Hemvy salong", rest: "Kameran står still" });
});

test("a provisional verdict: its own chip and words, never Jakob's, never a pressed button of his, and waiting for him first", () => {
  const by = "huvudagenten och en oberoende granskare";
  const mandate = 'Jakob 2026-11-13: "bedöm de sista filmerna, för jag måste sova."';
  const prov = (decision: "ACCEPTED" | "VARIANT" | "REJECTED", before: R = { decision: "PENDING", inbox: true, userAccepted: false }) =>
    applyProvisional(before, { decision, by, mandate, note: "Ren landning." }, "2026-11-13T03:00:00.000Z") as R;
  const ok = verdictOf(take(prov("ACCEPTED")));
  assert.deepEqual(ok, { verdict: "godkand", byJakob: false, label: "Godkänd", sign: "✓", detail: null, provisional: true });
  assert.equal(verdictOf(take(prov("VARIANT"))).verdict, "variant");
  assert.equal(verdictOf(take(prov("VARIANT"))).provisional, true);
  const bad = verdictOf(take(prov("REJECTED")));
  assert.deepEqual([bad.verdict, bad.byJakob, bad.provisional], ["underkand", false, true]);
  assert.equal(provisionalChip(ok), "Preliminär · godkänd av granskaren");
  assert.equal(provisionalChip(bad), "Preliminär · underkänd av granskaren");
  assert.equal(verdictPhrase(ok), "preliminärt godkänd, väntar på din dom");
  assert.equal(verdictPhrase(bad), "preliminärt underkänd, väntar på din dom");
  assert.equal(verdictPhrase({ verdict: "godkand", provisional: false }), "godkänd");
  // Not his note, not his stamp, no button of his pressed.
  assert.equal(storedNote(prov("ACCEPTED") as never), "");
  assert.equal(reviewStamp(prov("ACCEPTED") as never), null);
  assert.equal(chosenDecision(take(prov("ACCEPTED"))), null);
  assert.equal(chosenDecision(take(prov("REJECTED"))), null);
  assert.deepEqual(provisionalOf(prov("ACCEPTED") as never), { by, at: "2026-11-13T03:00:00.000Z", mandate, note: "Ren landning." });
  // His word wins over a block left behind; his decision through the store removes it anyway.
  assert.equal(provisionalOf({ ...prov("ACCEPTED"), userReview: jakob } as never), null);
  assert.equal(verdictOf(take(applyChange(prov("ACCEPTED"), { decision: "ACCEPTED", note: "" }, "2026-11-13"))).provisional, false);
  assert.equal(verdictOf(take(applyChange(prov("ACCEPTED"), { decision: "ACCEPTED", note: "" }, "2026-11-13"))).byJakob, true);

  // The queue: provisional takes wait for him, a provisional rejection too, and come first.
  const job = (id: string, from: string, to: string, kind: string): BankJob => ({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
  const bank: BankData = {
    jobs: [job("a-deal-01", "READY", "P4.C1", "DEAL"), job("a-deal-02", "READY", "P4.C1", "DEAL"), job("a-deal-03", "READY", "P4.C1", "DEAL"), job("a-deal-04", "READY", "P4.C1", "DEAL")],
    motions: {
      "a-deal-01": { source: { frames: 120 }, review: { decision: "PENDING" } },
      "a-deal-02": { source: { frames: 120 }, review: prov("ACCEPTED") },
      "a-deal-03": { source: { frames: 120 }, review: prov("REJECTED") },
      "a-deal-04": { source: { frames: 120 }, review: { decision: "REJECTED" } },
    },
  };
  assert.deepEqual(awaitingJakob(buildGraph(bank)).map((t) => t.id), ["a-deal-02", "a-deal-03", "a-deal-01"]);
});
