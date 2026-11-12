// The Scen view's address (app/page.tsx): the round and the look in one question, so that either can be sent as a link.
//   /?runda=<his notation>&vy=platt&forval=levande&dust=0.8
// The round's words (runda, kant, tagning, vy: lib/rounds.ts) and the look's (forval and the scene's keys:
// lib/scene-presets.ts) share the address, and each part is read and written by its own rules; "robot" belongs to every lab
// page (src/preview-ui.ts) and is kept as it stands. A look that names no preset is Levande here, the look Jakob remembers
// of the 3D lab (2026-11-12), so the view always writes forval. The old Scen view's address (/scen/…) meant basgrund when it
// named none: its page sends such a link on with basgrund named (fromOldScen). Pure: tests in studio/tests/scene-address.test.ts.
import type { SceneState } from "../../../src/scene3d-view.ts";
import { SCENE_KEYS, encodeValue } from "../../lib/scene-keys.ts";
import { BASE, differences, readAddress } from "../../lib/scene-presets.ts";

/** The look of an address that names no preset. */
export const START_LOOK = "levande";
/** The words of the address that are not the look's: the round's and the lab's own. */
export const ROUND_WORDS: readonly string[] = ["runda", "kant", "tagning", "vy", "robot"];

type Params = { get(name: string): string | null; forEach(fn: (value: string, key: string) => void): void };
export type LookAsk = { forval: string; patch: Partial<SceneState>; ignored: string[] };

/** The round's words of an address as they stand ("runda=…&vy=platt"), in their order. */
export function roundPart(params: Params): string {
  const out = new URLSearchParams();
  params.forEach((value, key) => {
    if (ROUND_WORDS.includes(key)) out.append(key, value);
  });
  return out.toString();
}

/** The look an address asks for: its preset (Levande when it names none) and the keys over it; what does not fit is named. */
export function readLook(params: Params, rooms?: readonly string[]): LookAsk {
  const look = new URLSearchParams();
  params.forEach((value, key) => {
    if (!ROUND_WORDS.includes(key)) look.append(key, value);
  });
  const read = readAddress(look, rooms);
  return look.has("forval") ? read : { ...read, forval: START_LOOK };
}

/** "forval=levande&dust=0.8": the preset, always named, and the keys of `state` that differ from the preset's whole state. */
export function lookPart(forval: string, state: SceneState, presetState: SceneState): string {
  const params = new URLSearchParams({ forval });
  for (const key of differences(state, presetState)) {
    const spec = SCENE_KEYS.find((s) => s.key === key)!;
    params.set(key, encodeValue(spec, state[key]));
  }
  return params.toString();
}

/** The look as the address asked for it, before the scene is there to say it: the preset and the keys given, in the catalogue's order. */
export function askedPart(look: Pick<LookAsk, "forval" | "patch">): string {
  const params = new URLSearchParams({ forval: look.forval });
  for (const s of SCENE_KEYS) if (look.patch[s.key] !== undefined) params.set(s.key, encodeValue(s, look.patch[s.key]));
  return params.toString();
}

/** "?a&b" from the parts that are not empty; "" when all are. */
export function joinParts(...parts: string[]): string {
  const text = parts.filter(Boolean).join("&");
  return text ? `?${text}` : "";
}

/** Where an address of the old Scen view (/scen/?…) leads now: the same question at /, with basgrund named when it named no preset. */
export function fromOldScen(params: Params): string {
  const rest = new URLSearchParams();
  params.forEach((value, key) => rest.append(key, value));
  return `/${joinParts(rest.has("forval") ? "" : `forval=${BASE}`, rest.toString())}`;
}
