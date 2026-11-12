// The Placering view's files on Jakob's own disk, never the lab's: the draft as a placement file (the old tab's "Exportera
// placeringsfil" and "Läs in placeringsfil") and the flat table's comparison ("Exportera jämförelse"). A file read in only
// replaces the draft; it reaches placements/default.json when he presses Spara. Pure; tests in studio/tests/placement-files.test.ts.
import { TARGETS, planQuad, toPixels, validatePlan, type PlacementPlan, type View } from "../../src/placement-model.ts";

export const DRAFT_FILE = "pamela-placeringar.json";
/** The largest placement file read in (the lab server's own limit for a save). */
export const FILE_LIMIT = 65536;

/** The draft as a placement file, written as the lab writes placements/default.json. */
export const draftText = (plan: PlacementPlan) => JSON.stringify(plan, null, 2) + "\n";

/** A placement file read in: checked as strictly as a save is. Throws with a short Swedish reason. */
export function readDraftText(text: string, bytes = text.length): PlacementPlan {
  if (bytes > FILE_LIMIT) throw new Error("Placeringsfilen är för stor.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Filen är inte en placeringsfil (inte JSON).");
  }
  validatePlan(value);
  return value;
}

/** The flat table's comparison for one view: every card's centre and the corners it is drawn with (plant-bord-<view>.json). */
export function planeComparison(plan: PlacementPlan, view: View) {
  return {
    schemaVersion: 1,
    kind: "flat-plane-comparison",
    view,
    reference: "P4.C1",
    referenceGeometry: plan.targets["P4.C1"].geometry[view],
    heading: plan.tableProjection?.heading ?? 0,
    calibrated: false,
    targets: Object.fromEntries(TARGETS.map((id) => [id, { centre: toPixels(plan.targets[id].geometry[view], view), corners: planQuad(plan, id, view) }])),
  };
}
export const planeFile = (view: View) => `plant-bord-${view}.json`;
