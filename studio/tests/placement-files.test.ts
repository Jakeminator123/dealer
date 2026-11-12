// The Placering view's files (studio/lib/placement-files.ts). Run: node --test "studio/tests/placement-files.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGETS, defaultPlan, flatQuad, toPixels } from "../../src/placement-model.ts";
import { FILE_LIMIT, draftText, planeComparison, planeFile, readDraftText } from "../lib/placement-files.ts";

test("a draft written as a file reads back as the same plan, checked as strictly as a save", () => {
  const plan = defaultPlan();
  const text = draftText(plan);
  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(readDraftText(text), plan);
  assert.throws(() => readDraftText("not json"), /inte JSON/);
  assert.throws(() => readDraftText(JSON.stringify({ ...plan, id: "other" })), /Okänd placering/);
  assert.throws(() => readDraftText(text, FILE_LIMIT + 1), /för stor/);
  // a file from before grip and turnAt existed gets them, as the lab's own reading does
  const old = structuredClone(plan) as unknown as { targets: Record<string, { intent: Record<string, unknown> }> };
  for (const t of Object.values(old.targets)) {
    delete t.intent.grip;
    delete t.intent.turnAt;
  }
  assert.equal(readDraftText(JSON.stringify(old)).targets["P1.C1"].intent.grip, "PINCH");
});

test("the flat table's comparison has every card's centre and drawn corners, as the old tab exported it", () => {
  const plan = defaultPlan();
  const c = planeComparison(plan, "native");
  assert.equal(c.kind, "flat-plane-comparison");
  assert.equal(c.reference, "P4.C1");
  assert.equal(c.calibrated, false);
  assert.equal(Object.keys(c.targets).length, TARGETS.length);
  assert.deepEqual(c.targets["P2.C2"].centre, toPixels(plan.targets["P2.C2"].geometry.native, "native"));
  assert.deepEqual(c.targets["P2.C2"].corners, flatQuad(plan.targets["P2.C2"].geometry.native, plan.targets["P4.C1"].geometry.native, "native", 0));
  assert.equal(planeFile("portrait"), "plant-bord-portrait.json");
});
