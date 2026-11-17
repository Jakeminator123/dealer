// Lipsync: how the view reads the speech lane's words (studio/lib/lipsync.ts): who does a step, scales as factors, what is
// estimated, and the order and words it shows. Checked against every step of the tracked data/lipsync.json too.
// Run: node --test "studio/tests/lipsync.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DIRECTION_WORD, dayWord, direction, groupSettings, isEstimated, isNone, isOurs, isTrial, measureWord, outcomeTone, ownerWord, proofHref, readScale, scaleHeadline, scaleParts, whoOf } from "../lib/lipsync.ts";

const facts = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/lipsync.json", import.meta.url)), "utf8")) as {
  steps: { n: number; scale: string; by: string; in: string; out: string }[];
  settings: { group: string; name: string }[];
};

test("who does a step, with the words in brackets as a note; the other team's renderer and its model are sealed", () => {
  assert.deepEqual(whoOf("vårt verktyg"), { who: "ours", label: "Vårt verktyg", note: null, sealed: false });
  assert.deepEqual(whoOf("Scoutgamings renderer"), { who: "renderer", label: "Scoutgamings renderer", note: null, sealed: true });
  assert.deepEqual(whoOf("MuseTalk 1.5"), { who: "model", label: "MuseTalk 1.5", note: null, sealed: true });
  assert.deepEqual(whoOf("munlagret i spelet"), { who: "game", label: "Munlagret i spelet", note: null, sealed: false });
  assert.deepEqual(whoOf("vårt verktyg (prov, inte i spelet)"), { who: "ours", label: "Vårt verktyg", note: "prov, inte i spelet", sealed: false });
  assert.equal(whoOf("någon annan").who, "other");
  assert.equal(isTrial({ by: "vårt verktyg (prov, inte i spelet)" }), true);
  assert.equal(isTrial({ by: "vårt verktyg" }), false);
  assert.equal(isTrial({ by: "munlagret i spelet" }), false);
});

test("a scale is read as factors in width and height, and an estimate stays an estimate", () => {
  assert.deepEqual(readScale("× 2"), { width: { lo: 2, hi: 2, text: "2" }, height: { lo: 2, hi: 2, text: "2" }, estimated: false });
  assert.deepEqual(readScale("1 : 1 (en bildpunkt en bildpunkt)")?.width, { lo: 1, hi: 1, text: "1" });
  const shrink = readScale("cirka × 0,78 ut (skattat)")!;
  assert.deepEqual([shrink.width.lo, shrink.estimated, direction(shrink)], [0.78, true, "down"]);
  const taller = readScale("× 1,00 i bredd, × 1,25 i höjd")!;
  assert.deepEqual([taller.width.text, taller.height.text, direction(taller)], ["1,00", "1,25", "up"]);
  const trial = readScale("× 1,18 i bredd; × 1,18 till × 1,40 i höjd; överläppen för sig × 1,6 eller × 1,9")!;
  assert.deepEqual(trial.width, { lo: 1.18, hi: 1.18, text: "1,18" });
  assert.deepEqual(trial.height, { lo: 1.18, hi: 1.4, text: "1,18–1,40" }, "the upper lip's own factors are left to the words");
  assert.equal(readScale("-"), null);
  assert.equal(readScale("i filmens bildpunkter"), null);
  assert.equal(readScale("× 1,5 i höjd")!.width.text, "1", "a scale that names one way keeps the other");
  assert.equal(direction(readScale("× 0,5 i bredd, × 2 i höjd")!), "mixed");
  assert.equal(DIRECTION_WORD.same, "Samma storlek");
});

test("the overview's few signs and the words split for drawing", () => {
  assert.equal(scaleHeadline(readScale("1 : 1")), "1 : 1");
  assert.equal(scaleHeadline(readScale("× 2")), "× 2");
  assert.equal(scaleHeadline(readScale("cirka × 1,3 in (skattat)")), "≈ × 1,3");
  assert.equal(scaleHeadline(readScale("× 1,00 i bredd, × 1,25 i höjd")), "bredd × 1,00 · höjd × 1,25");
  assert.equal(scaleHeadline(null), "–");
  assert.deepEqual(scaleParts("cirka × 1,3 in (skattat)"), [
    { text: "cirka ", kind: "plain" },
    { text: "× 1,3", kind: "factor" },
    { text: " in ", kind: "plain" },
    { text: "(skattat)", kind: "estimate" },
  ]);
  assert.deepEqual(scaleParts("1 : 1 i filmens bildpunkter").map((p) => p.kind), ["factor", "plain"]);
  assert.equal(scaleParts("× 1,18 i bredd; × 1,18 till × 1,40 i höjd").filter((p) => p.kind === "factor").length, 3);
  for (const scale of ["× 2", "cirka × 0,78 ut (skattat)", "-"]) assert.equal(scaleParts(scale).map((p) => p.text).join(""), scale, "nothing is lost");
});

test("every step of the tracked facts: its scale is read or plainly none, and its words survive the split", () => {
  for (const step of facts.steps) {
    assert.equal(scaleParts(step.scale).map((p) => p.text).join(""), step.scale, `step ${step.n}`);
    if (isNone(step.scale)) continue;
    const scale = readScale(step.scale);
    assert.ok(scale, `step ${step.n}: "${step.scale}" is read`);
    assert.equal(scale.estimated, isEstimated(step.scale), `step ${step.n}`);
    assert.notEqual(whoOf(step.by).who, "other", `step ${step.n}: "${step.by}" has a colour`);
  }
  const estimated = facts.steps.filter((s) => readScale(s.scale)?.estimated).map((s) => s.n);
  assert.ok(estimated.length > 0, "the file marks its estimates, and the view sees them");
});

test("estimates, settings by group, owners, days, outcomes and the way to Prov", () => {
  assert.equal(isEstimated("cirka 200 × 200 i filmens bildpunkter"), true);
  assert.equal(isEstimated("rutans storlek skattad"), true);
  assert.equal(isEstimated("1080 × 1920"), false);
  assert.equal(isNone("-"), true);
  assert.equal(isNone("1764 × 1174"), false);
  const groups = groupSettings([{ group: "B" }, { group: "A" }, { group: "B" }]);
  assert.deepEqual(groups.map((g) => [g.group, g.settings.length]), [["B", 2], ["A", 1]]);
  assert.deepEqual(groupSettings(facts.settings).reduce((n, g) => n + g.settings.length, 0), facts.settings.length);
  assert.equal(ownerWord("vår"), "Vår");
  assert.equal(ownerWord("Scoutgaming"), "Scoutgaming");
  assert.equal(isOurs("vår"), true);
  assert.equal(isOurs("Scoutgaming"), false);
  assert.equal(dayWord("2026-11-17"), "17 nov");
  assert.equal(outcomeTone("väntar på hans val"), "brass");
  assert.equal(outcomeTone("nej"), "bad");
  assert.equal(outcomeTone("inte tagen"), "bad");
  assert.equal(outcomeTone("munnen bra, men vägen stängd: inte realtid, hela bilden görs om"), "bad");
  assert.equal(outcomeTone("godkänt för nu; ingen bokstav vald"), "ok");
  assert.equal(outcomeTone("utgångsläge"), "neutral");
  assert.equal(measureWord(7.4), "7,4");
  assert.equal(measureWord(undefined), "–");
  assert.equal(proofHref("paow-realtid-mun-3"), "/prov/?prov=paow-realtid-mun-3");
  assert.equal(proofHref("paow-realtid-mun-3", "paow-realtid-mun-3-2-stillbild.png"), "/prov/?prov=paow-realtid-mun-3&fil=paow-realtid-mun-3-2-stillbild.png");
});
