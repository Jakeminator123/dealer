// The Placering view's talk with the lab server: Jakob's plan (GET /api/placements), its one write (PUT /api/placements,
// against the revision read, tools/placement-store.ts) and the film library's list (GET /api/library). The write is made only
// from his click on Spara; in the online copy it is refused before anything leaves the page (lib/mode.ts).
import { validatePlan, type PlacementPlan } from "../../src/placement-model.ts";
import { ApiError, SNAPSHOT_REFUSAL, getPlacements } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot } from "./mode.ts";
import type { LibraryItem } from "./placement.ts";

export type SavedPlan = { plan: PlacementPlan; revision: string };

const kindOf = (status: number) => (status === 409 ? "conflict" : status === 404 ? "missing" : status === 428 ? "precondition" : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid");

/** The plan as saved and its revision. The plan is checked as strictly as a save is (and older files get grip and turnAt). */
export async function readPlan(): Promise<SavedPlan> {
  const answer = (await getPlacements()) as unknown as { plan?: unknown; revision?: unknown };
  // The lab answers {plan, revision}; a copy may hand out the plan itself.
  const plan = answer && typeof answer === "object" && "plan" in answer ? answer.plan : answer;
  try {
    validatePlan(plan);
  } catch (error) {
    throw new ApiError(`Placeringsplanen går inte att läsa: ${(error as Error).message}`, 200, "server");
  }
  return { plan, revision: typeof answer?.revision === "string" ? answer.revision : "" };
}

/** Writes the plan against the revision read. Only from Jakob's click on Spara. A 409 means it changed since it was read. */
export async function writePlan(plan: PlacementPlan, revision: string): Promise<SavedPlan> {
  if (isSnapshot) throw new ApiError(SNAPSHOT_REFUSAL, 403, "refused");
  validatePlan(plan);
  let response: Response;
  try {
    response = await fetch(labUrl("api/placements"), { method: "PUT", cache: "no-store", headers: { "content-type": "application/json", "if-match": revision }, body: JSON.stringify(plan) });
  } catch {
    throw new ApiError("Labbet svarar inte. Starta det med START.cmd.", 0, "network");
  }
  const text = await response.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) throw new ApiError(String((data as { error?: unknown } | null)?.error ?? "") || `Placeringsplanen sparades inte (${response.status}).`, response.status, kindOf(response.status));
  const saved = data as { plan?: unknown; revision?: unknown } | null;
  if (!saved?.plan || typeof saved.revision !== "string") throw new ApiError("Planen sparades men svaret gick inte att läsa. Läs in planen igen.", 200, "server");
  validatePlan(saved.plan);
  return { plan: saved.plan, revision: saved.revision };
}

/** The film library's list (data/library.json through the lab); empty when it cannot be read. */
export async function readLibrary(): Promise<LibraryItem[]> {
  try {
    const response = await fetch(labUrl("api/library"), { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: unknown };
    return Array.isArray(data?.items) ? (data.items as LibraryItem[]) : [];
  } catch {
    return [];
  }
}
