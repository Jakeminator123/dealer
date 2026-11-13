// Verdicts of takes and proof files (studio/lib/verdict.ts). Run: node --test studio/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob } from "../../src/clip-graph.ts";
import { DECISIONS, NOTE_LIMIT as STORE_LIMIT, applyChange, applyProvisional } from "../../tools/review-store.ts";
import { NOTE_LIMIT, type Decision } from "../lib/api.ts";
import { SAID_WITHOUT_NOTE, awaitingJakob, chosenDecision, judgedForJakob, primarCount, proofVerdict, provisionalChip, provisionalOf, provisionalWords, reviewStamp, splitLabel, storedNote, verdictOf, verdictPhrase } from "../lib/verdict.ts";

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

test("a verdict judged for him: its own chip and words, never Jakob's, never a pressed button of his, and not waiting for him", () => {
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
  assert.deepEqual(provisionalChip(ok), { label: "Godkänd", note: "åt dig" });
  assert.deepEqual(provisionalChip(bad), { label: "Underkänd", note: "åt dig" });
  assert.equal(verdictPhrase(ok), "godkänd åt dig");
  assert.equal(verdictPhrase(verdictOf(take(prov("VARIANT")))), "variant åt dig");
  assert.equal(verdictPhrase(bad), "underkänd åt dig");
  assert.equal(verdictPhrase({ verdict: "godkand", provisional: false }), "godkänd");
  // The tooltip: who, when, under which words of his, and that his decision replaces it; nothing says it waits.
  const words = provisionalWords(ok, provisionalOf(prov("ACCEPTED") as never));
  assert.equal(words, `Godkänd åt dig av ${by}, 2026-11-13, på ditt uppdrag: ${mandate}. Inte din egen dom; ditt beslut ersätter den.`);
  assert.equal(provisionalWords(bad), "Underkänd åt dig. Inte din egen dom; ditt beslut ersätter den.");
  for (const said of [words, verdictPhrase(ok), verdictPhrase(bad)]) assert.doesNotMatch(said, /väntar|preliminär/i);
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

  // The queue (Jakob 2026-11-13: "Med andra ord vill jag inte se en sån här lista när jag är tillbaka!"): a take
  // judged for him, approved or rejected, does not wait for him; judgedForJakob lists exactly those.
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
  const graph = buildGraph(bank);
  assert.deepEqual(awaitingJakob(graph).map((t) => t.id), ["a-deal-01"]);
  assert.deepEqual(judgedForJakob(Object.values(graph.takes)).map((t) => t.id).sort(), ["a-deal-02", "a-deal-03"]);
});

test("the queue is the unjudged takes; one judged by him and one judged for him are not in it", () => {
  const job = (id: string): BankJob => ({ id, kind: "DEAL", target: null, from: "READY", to: "P4.C1", model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
  const forHim = applyProvisional({ decision: "PENDING", inbox: true }, { decision: "ACCEPTED", by: "huvudagenten och en oberoende granskare", mandate: "Jakob 2026-11-13: godkänn allt.", note: "Ren giv." }, "2026-11-13T16:00:00.000Z");
  const bank: BankData = {
    jobs: [job("unjudged-01"), job("his-01"), job("for-him-01")],
    motions: {
      "unjudged-01": { source: { frames: 120 }, review: { decision: "PENDING", inbox: true } },
      "his-01": { source: { frames: 120 }, review: { decision: "ACCEPTED", userAccepted: true, userReview: jakob } },
      "for-him-01": { source: { frames: 120 }, review: forHim },
    },
  };
  const graph = buildGraph(bank);
  assert.deepEqual(awaitingJakob(graph).map((t) => t.id), ["unjudged-01"]);
  assert.deepEqual(judgedForJakob(Object.values(graph.takes)).map((t) => t.id), ["for-him-01"]);
  // His decision on it replaces the verdict judged for him: his own, and still not waiting.
  bank.motions!["for-him-01"] = { source: { frames: 120 }, review: applyChange(forHim, { decision: "REJECTED", note: "" }, "2026-11-14") };
  const after = buildGraph(bank);
  assert.deepEqual(judgedForJakob(Object.values(after.takes)), []);
  assert.deepEqual(awaitingJakob(after).map((t) => t.id), ["unjudged-01"]);
  // A reset of it makes it wait again, without the verdict judged for him.
  bank.motions!["for-him-01"] = { source: { frames: 120 }, review: applyChange(forHim, { decision: "PENDING", note: "" }, "2026-11-14") };
  assert.deepEqual(awaitingJakob(buildGraph(bank)).map((t) => t.id), ["unjudged-01", "for-him-01"]);
});
