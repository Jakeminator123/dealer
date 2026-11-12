"use client";

// The Placering view's draft of Jakob's plan, kept in one store for the whole studio session: he can go to another view and
// come back to his unsaved changes, as he could switch tabs in the old lab. Reads the plan when the view opens (unless a
// draft with changes is waiting), keeps the undo list, and writes only when he presses Spara. A save that meets a plan
// changed elsewhere (409) keeps the draft and offers to read the saved plan in its place.
import { useEffect, useSyncExternalStore } from "react";
import type { PlacementPlan } from "../../../src/placement-model.ts";
import { asApiError } from "../../lib/api.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { afterSave, amend, begin, commit, end, isDirty, openDraft, toSaved, undo, type Draft } from "../../lib/placement.ts";
import { readPlan, writePlan } from "../../lib/placement-api.ts";

export type DraftState = {
  status: "loading" | "ready" | "error";
  draft: Draft | null;
  error: string | null;
  saving: boolean;
  /** The plan changed on disk since it was read: the draft is kept, and reading the saved plan is offered. */
  conflict: boolean;
  /** Which plan the picture shows: the draft, or the saved plan to compare with. */
  showing: "draft" | "saved";
};

let state: DraftState = { status: "loading", draft: null, error: null, saving: false, conflict: false, showing: "draft" };
const calls = new Set<() => void>();
const set = (patch: Partial<DraftState>) => {
  state = { ...state, ...patch };
  for (const call of calls) call();
};
const subscribe = (call: () => void) => {
  calls.add(call);
  return () => calls.delete(call);
};
const draftDo = (fn: (d: Draft) => Draft) => {
  if (!state.draft || isSnapshot) return;
  const next = fn(state.draft);
  if (next !== state.draft) set({ draft: next, showing: "draft" });
};

async function load() {
  set({ status: state.draft ? "ready" : "loading", error: null });
  try {
    const saved = await readPlan();
    set({ status: "ready", draft: openDraft(saved.plan, saved.revision), conflict: false, showing: "draft" });
  } catch (error) {
    set({ status: state.draft ? "ready" : "error", error: asApiError(error, "Placeringsplanen").message });
  }
}

export const draftActions = {
  load,
  /** One change as one step. */
  edit: (fn: (plan: PlacementPlan) => PlacementPlan) => draftDo((d) => commit(d, fn(d.plan))),
  /** A gesture (a drag, a run of key presses): begin, change as often as it moves, end. Its changes are one step. */
  begin: () => draftDo(begin),
  move: (fn: (plan: PlacementPlan) => PlacementPlan) => draftDo((d) => amend(d, fn(d.plan))),
  end: () => draftDo(end),
  undo: () => draftDo(undo),
  toSaved: () => draftDo(toSaved),
  /** A placement file read in: it replaces the draft as one step, and nothing on disk until Spara. */
  replace: (plan: PlacementPlan) => draftDo((d) => commit(d, plan)),
  show: (showing: DraftState["showing"]) => set({ showing }),
  /** Writes the draft to placements/default.json. Only from Jakob's click on Spara. */
  async save(): Promise<{ ok: true } | { ok: false; message: string; conflict: boolean }> {
    const d = state.draft;
    if (!d || state.saving || isSnapshot) return { ok: false, message: "Inget att spara.", conflict: false };
    set({ saving: true });
    try {
      const saved = await writePlan(d.plan, d.revision);
      set({ saving: false, draft: afterSave(saved.plan, saved.revision), conflict: false, showing: "draft" });
      return { ok: true };
    } catch (error) {
      const e = asApiError(error, "Placeringsplanen");
      set({ saving: false, conflict: e.kind === "conflict" || state.conflict });
      return { ok: false, message: e.message, conflict: e.kind === "conflict" };
    }
  },
};

/** The draft and its actions. The plan is read when the view opens, unless a draft with changes waits from earlier. */
export function useDraft() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!state.draft || !isDirty(state.draft)) void load();
  }, []);
  // A reload or a closed tab asks first while there are unsaved changes.
  const dirty = !!s.draft && isDirty(s.draft);
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
  return { ...s, dirty };
}
