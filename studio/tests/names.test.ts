// Jakob's names and notation (studio/lib/names.ts). Run: node --test studio/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRound, buildGraph, type EdgeKind } from "../../src/clip-graph.ts";
import { edgeName, factsLine, formatJakob, modelName, nodeCode, nodeName, parseJakob, takeName, takeNames } from "../lib/names.ts";

test("anchors and cards have his names", () => {
  assert.equal(nodeName("IDLE"), "A1 vila");
  assert.equal(nodeName("READY"), "A2.1 nyp");
  assert.equal(nodeName("READY-B"), "A2.2 hand över");
  assert.equal(nodeName("AWAY"), "Borta");
  assert.equal(nodeName("REVEAL(D.C2)"), "DC2 upp");
  assert.equal(nodeCode("P4.C1"), "P4C1");
  assert.equal(nodeCode("D.C1"), "DC1");
  assert.equal(nodeCode("D.C3"), "DC3");
  assert.equal(nodeCode("DRAWN"), "DRAWN");
});

test("an edge reads anchor → anchor", () => {
  assert.equal(edgeName("READY>P4.C1"), "A2.1 → P4C1");
  assert.equal(edgeName({ from: "P4.C1", to: "IDLE" }), "P4C1 → A1");
  assert.equal(edgeName("IDLE>REVEAL(D.C2)"), "A1 → DC2 upp");
  assert.equal(edgeName("READY-B>P1.C1"), "A2.2 → P1C1");
  assert.equal(edgeName("AWAY>IDLE"), "Borta → A1");
});

const t = (id: string, edge: string, kind: EdgeKind | null) => ({ id, edge, kind });

test("a take's short name within its edge", () => {
  assert.equal(takeName(t("pamela-p4-c1-plan-deal-02", "READY>P4.C1", "DEAL")), "Giv 02");
  assert.equal(takeName(t("pamela-p4-c1-deal-calm-01", "READY>P4.C1", "DEAL")), "Giv lugn 01");
  assert.equal(takeName(t("pamela-p4-c1-readyb-deal-01", "READY>P4.C1", "DEAL")), "Giv B 01");
  assert.equal(takeName(t("pamela-p1-c1-plan-deal-03-edit-02", "READY>P1.C1", "DEAL")), "Giv 03 rättad 02");
  assert.equal(takeName(t("pamela-p3-c1-arkiv-deal-01", "READY>P3.C1", "DEAL")), "Giv arkiv 01");
  assert.equal(takeName(t("pamela-p4-c1-plan-return-ready-01", "P4.C1>READY", "RETURN")), "Retur 01");
  assert.equal(takeName(t("pamela-p4-c1-plan-return-readyb-01", "P4.C1>READY", "RETURN")), "Retur B 01");
  assert.equal(takeName(t("pamela-p4-c1-plan-return-idle-01", "P4.C1>IDLE", "RETURN")), "Retur 01");
  assert.equal(takeName(t("pamela-idle-ready-entry-01", "IDLE>READY", "ENTRY")), "Ingång 01");
  assert.equal(takeName(t("pamela-ready-idle-exit-02", "READY>IDLE", "RETURN")), "Utgång 02");
  assert.equal(takeName(t("pamela-idle-deep-breath-01", "IDLE>IDLE", "IDLE")), "Djupt andetag 01");
  assert.equal(takeName(t("pamela-idle-breath-b-01", "IDLE>IDLE", "IDLE")), "Andning B 01");
  assert.equal(takeName(t("pamela-d-c2-arkiv-reveal-01", "IDLE>REVEAL(D.C2)", "REVEAL")), "Vänd arkiv 01");
  assert.equal(takeName(t("pamela-table-leave-wide-kling-01", "IDLE>AWAY", "LEAVE")), "Går vid kling 01");
  assert.equal(takeName(t("pamela-table-arrive-01", "AWAY>IDLE", "ARRIVE")), "Kommer 01");
});

test("short names stay apart within an edge", () => {
  const deals = [
    t("pamela-p4-c1-deal-calm-01", "READY>P4.C1", "DEAL"),
    t("pamela-p4-c1-plan-deal-01", "READY>P4.C1", "DEAL"),
    t("pamela-p4-c1-plan-deal-02", "READY>P4.C1", "DEAL"),
    t("pamela-p4-c1-readyb-deal-01", "READY>P4.C1", "DEAL"),
    t("pamela-p4-c1-deal-01", "READY>P4.C1", "DEAL"), // reads "Giv 01" like plan-deal-01
  ];
  const names = takeNames(deals);
  assert.equal(new Set(names.values()).size, deals.length);
  assert.equal(names.get("pamela-p4-c1-plan-deal-02"), "Giv 02");
  assert.equal(names.get("pamela-p4-c1-plan-deal-01"), "p4-c1-plan-deal-01");
  assert.equal(names.get("pamela-p4-c1-deal-01"), "p4-c1-deal-01");
  assert.equal(takeName(deals[2], deals), "Giv 02");
});

test("his notation becomes the steps of a round", () => {
  const round = parseJakob("A2.1 - P4C1 - A2.1 - P4C2 - A2.1");
  assert.deepEqual(round.errors, []);
  assert.deepEqual(round.steps, [
    { from: "READY", to: "P4.C1" },
    { from: "P4.C1", to: "READY" },
    { from: "READY", to: "P4.C2" },
    { from: "P4.C2", to: "READY" },
  ]);
  for (const text of ["A2.1 – P4C1 – A2.1", "A2.1 → P4C1 → A2.1", "A2.1 > P4.C1 > A2.1", "A2.1 P4C1 A2.1", "a2.1-p4c1-a2.1", "READY - P4C1 - REDO"]) {
    assert.deepEqual(parseJakob(text), { steps: [{ from: "READY", to: "P4.C1" }, { from: "P4.C1", to: "READY" }], errors: [] }, text);
  }
  assert.deepEqual(parseJakob("A1 vila - A2.1 nyp - P4C1 - A1").steps.map((s) => `${s.from}>${s.to}`), ["IDLE>READY", "READY>P4.C1", "P4.C1>IDLE"]);
  assert.deepEqual(parseJakob("A2.2 hand över - P1C1").steps, [{ from: "READY-B", to: "P1.C1" }]);
  assert.deepEqual(parseJakob("READY-B - P1C1").steps, [{ from: "READY-B", to: "P1.C1" }]);
  assert.deepEqual(parseJakob("DC2 - A1 - DC2 upp").steps, [{ from: "D.C2", to: "IDLE" }, { from: "IDLE", to: "REVEAL(D.C2)" }]);
  assert.deepEqual(parseJakob("Borta - A1").steps, [{ from: "AWAY", to: "IDLE" }]);
});

test("a new chain after | or a new line", () => {
  const round = parseJakob("A2.1 - P4C1 - A1 | A1 - A2.1\nA2.1 - DC1");
  assert.deepEqual(round.errors, []);
  assert.deepEqual(round.steps.map((s) => `${s.from}>${s.to}`), ["READY>P4.C1", "P4.C1>IDLE", "IDLE>READY", "READY>D.C1"]);
});

test("what cannot be read is reported, not guessed", () => {
  const a2 = parseJakob("A2 - P4C1");
  assert.deepEqual(a2.steps, []);
  assert.match(a2.errors[0], /A2\.1.*A2\.2/);
  const word = parseJakob("A2.1 - P9C1 - A2.1");
  assert.deepEqual(word.steps, []);
  assert.deepEqual(word.errors, ["Kunde inte läsa ”P9C1”."]);
  const nofilm = parseJakob("A1 - P4C1");
  assert.deepEqual(nofilm.steps, []);
  assert.deepEqual(nofilm.errors, ["A1 → P4C1 är ingen film."]);
  assert.deepEqual(parseJakob("A2.1 - A2.1").errors, ["A2.1 → A2.1 är ingen film."]);
  assert.equal(parseJakob("A2.1").errors.length, 1);
  assert.deepEqual(parseJakob(""), { steps: [], errors: [] });
});

test("the lab's own notation with a pinned take goes through parseSequence", () => {
  const round = parseJakob("READY>P4.C1@pamela-p4-c1-plan-deal-02 | P4.C1>READY");
  assert.deepEqual(round.errors, []);
  assert.deepEqual(round.steps, [{ from: "READY", to: "P4.C1", take: "pamela-p4-c1-plan-deal-02" }, { from: "P4.C1", to: "READY" }]);
});

test("steps back to his notation, and the parse resolves as a round", () => {
  const text = "A1 - A2.1 - P4C1 - A2.1 - P4C2 - A1";
  const { steps } = parseJakob(text);
  assert.equal(formatJakob(steps), text);
  assert.equal(formatJakob([{ from: "READY", to: "P4.C1" }, { from: "IDLE", to: "READY" }]), "A2.1 - P4C1 | A1 - A2.1");
  const segments = resolveRound(buildGraph({}), steps);
  assert.equal(segments.length, steps.length);
  assert.ok(segments.every((s) => s.gap !== "INVALID"));
});

test("facts read as people say them", () => {
  assert.equal(modelName("wan3"), "Wan 3");
  assert.equal(modelName("utsnitt"), "Utsnitt");
  assert.equal(factsLine({ model: "Wan 3", frames: 120, seconds: 4, day: "10 nov", derived: false }), "Wan 3 · 4,0 s · 120 rutor · 10 nov");
  assert.equal(factsLine({ model: "Utsnitt", frames: null, seconds: null, day: null, derived: true }), "Utsnitt");
});
