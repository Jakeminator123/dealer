// Presets of the 3D scene: a named look, the keys that differ from the scene's DEFAULTS (src/scene3d-view.ts), kept in
// data/scene-presets/<name>.json and served by the lab server (tools/scene-preset-store.ts, /api/scene-presets). Three
// ship with the lab and cannot be changed: basgrund (what the game shows today), levande (basgrund with the look Jakob
// remembers of the 3D lab) and rumsstudien (levande with the room study's table, not yet judged by him). The Scen view's
// baseline is basgrund: what differs from it is marked. A look also travels as an address, /scen/?forval=levande&dust=0.8,
// and as the old lab's own, scene3d.html?…. Pure: no DOM, no network; tests in studio/tests/scene-presets.test.ts.
import type { SceneState } from "../../src/scene3d-view.ts";
import { SCENE_KEYS, checkValue, decodeValue, encodeValue, hasControl, isSceneKey, keySpec, sameValue, type SceneKey } from "./scene-keys.ts";

export type ScenePreset = { schemaVersion: 1; name: string; label: string; about: string; state: Partial<SceneState>; updatedAt: string };

export const PRESET_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const NAME_LIMIT = 40;
export const LABEL_LIMIT = 40;
export const ABOUT_LIMIT = 400;
/** Bytes of one preset file the server takes. */
export const PRESET_BYTES = 16384;
/** Presets of his own the server keeps at most. */
export const OWN_LIMIT = 100;
export const BASE = "basgrund";

// What the game sets on the scene today (src/game-page.ts): room, blur, format, tray, cards and the framing on line 58 (the
// room is Las Vegas when the player has chosen none, line 57; its blur 5 is its entry in data/scene-rooms.json; pitch −8 and
// zoom 0,84 are FRAMING.wide, line 39), and the shimmer when the room changes, line 173. Everything else is the scene's own.
const GAME: Partial<SceneState> = { format: "fill", room: "panorama", blur: 5, tray: true, cards: true, pitch: -8, zoom: 0.84, roomShift: "shimmer" };
// What Jakob remembers of the 3D lab (proof 3d-kanslan); the Scen view starts with it.
const ALIVE: Partial<SceneState> = { mode: "lean", sway: true, focus: "follow", dust: 0.6, clock: true };
// The room study of 2026-11-07 (docs/SYSTEM.md "3D-scenen") with the lab trials of 2026-11-12.
const STUDY: Partial<SceneState> = { surface: "photo", base: "legs", shadowAbove: 0, lamp: 0.5 };
const SHIPPED_AT = "2026-11-12T20:00:00.000Z";

/** The three that ship with the lab, in the order of their chips. data/scene-presets/<name>.json holds the same (the test compares). */
export const SHIPPED: readonly ScenePreset[] = [
  {
    schemaVersion: 1,
    name: "basgrund",
    label: "Basgrund",
    about: "Det spelet visar i dag och som Jakob har kallat mycket bra: Las Vegas, hela bordet (zoom 0,84, −8°), markerbrädet, ritade kort, skimmer vid rumsbyte. Resten är scenens grund. Spelet lägger dessutom Jakobs bricka och markerna; de styrs under Kort och marker.",
    state: { ...GAME },
    updatedAt: SHIPPED_AT,
  },
  {
    schemaVersion: 1,
    name: "levande",
    label: "Levande",
    about: "Basgrund med det Jakob minns av 3D-labbet: kameran lutar och gungar, skärpan följer kortet, damm i luften och klockan.",
    state: { ...GAME, ...ALIVE },
    updatedAt: SHIPPED_AT,
  },
  {
    schemaVersion: 1,
    name: "rumsstudien",
    label: "Rumsstudien",
    about: "Levande med rumsstudiens bord: fotomaterial, två ben, ingen filmskugga ovanför kanten och lampan över dealern till hälften. Inte bedömd av Jakob än.",
    state: { ...GAME, ...ALIVE, ...STUDY },
    updatedAt: SHIPPED_AT,
  },
];
export const SHIPPED_NAMES: readonly string[] = SHIPPED.map((p) => p.name);
export const isShipped = (name: string) => SHIPPED_NAMES.includes(name);

// ── Checking ──
/** The state of a preset: every key known, every value in its range. rooms: the rooms the scene has, when known. */
export function validateState(value: unknown, rooms?: readonly string[]): { state: Partial<SceneState>; errors: string[] } {
  const errors: string[] = [];
  const state: Record<string, unknown> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return { state: {}, errors: ["state ska vara ett objekt"] };
  for (const [key, v] of Object.entries(value)) {
    const s = keySpec(key);
    if (!s) {
      errors.push(`okänd nyckel ${key.slice(0, 40)}`);
      continue;
    }
    const wrong = checkValue(s, v, rooms);
    if (wrong) errors.push(`${key} ${wrong}`);
    else state[key] = v;
  }
  return { state: state as Partial<SceneState>, errors };
}

/**
 * A preset as it is to be kept under `name`: what was sent (label, about, state; schemaVersion and name may come along and
 * must agree, updatedAt is the server's) checked and cleaned. Errors in Swedish, for the answer.
 */
export function validatePreset(value: unknown, name: string, rooms?: readonly string[]): { preset: Omit<ScenePreset, "updatedAt"> | null; errors: string[] } {
  const errors: string[] = [];
  if (!PRESET_NAME.test(name) || name.length > NAME_LIMIT) errors.push(`namnet får bara ha a–z, 0–9 och bindestreck, högst ${NAME_LIMIT} tecken`);
  if (!value || typeof value !== "object" || Array.isArray(value)) return { preset: null, errors: [...errors, "förvalet ska vara ett objekt"] };
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) if (!["schemaVersion", "name", "label", "about", "state", "updatedAt"].includes(key)) errors.push(`okänt fält ${key.slice(0, 40)}`);
  if (v.schemaVersion !== undefined && v.schemaVersion !== 1) errors.push("schemaVersion ska vara 1");
  if (v.name !== undefined && v.name !== name) errors.push("namnet i förvalet och i adressen skiljer sig");
  const label = typeof v.label === "string" ? v.label.trim() : "";
  if (!label || label.length > LABEL_LIMIT) errors.push(`label ska vara 1–${LABEL_LIMIT} tecken`);
  const about = v.about === undefined ? "" : typeof v.about === "string" ? v.about.trim() : null;
  if (about === null || about.length > ABOUT_LIMIT) errors.push(`about ska vara text, högst ${ABOUT_LIMIT} tecken`);
  if (hasControl(label)) errors.push("label får inte ha styrtecken");
  const checked = validateState(v.state, rooms);
  errors.push(...checked.errors);
  return errors.length ? { preset: null, errors } : { preset: { schemaVersion: 1, name, label, about: about ?? "", state: checked.state }, errors };
}

/** A name for a file from what he called it: "Kvällsljus i skogen" → "kvallsljus-i-skogen". */
export function slugOf(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_LIMIT)
    .replace(/-+$/, "");
}

// ── States ──
/** The whole state a preset gives: the scene's defaults with the preset's keys over them. */
export const effective = (defaults: SceneState, state: Partial<SceneState>): SceneState => ({ ...defaults, ...state });

/** The keys whose values differ between two states, in the catalogue's order. */
export const differences = (a: SceneState, b: SceneState): SceneKey[] => SCENE_KEYS.filter((s) => !sameValue(a[s.key], b[s.key])).map((s) => s.key);

/** What turns `from` into `to`: the keys of `to` that differ. */
export function patchOf(to: SceneState, from: SceneState): Partial<SceneState> {
  const patch: Record<string, unknown> = {};
  for (const key of differences(to, from)) patch[key] = to[key];
  return patch as Partial<SceneState>;
}

/** The preset whose whole state is exactly this one, if any (the first in the list wins). */
export function matchPreset(state: SceneState, defaults: SceneState, presets: readonly ScenePreset[]): ScenePreset | null {
  return presets.find((p) => differences(state, effective(defaults, p.state)).length === 0) ?? null;
}

// ── Addresses ──
type Params = { get(name: string): string | null; forEach(fn: (value: string, key: string) => void): void };

/** The look an address asks for: the preset (basgrund when none) and the keys over it. Words that are no key, or values that do not fit, are left out and named. */
export function readAddress(params: Params, rooms?: readonly string[]): { forval: string; patch: Partial<SceneState>; ignored: string[] } {
  const asked = params.get("forval") ?? "";
  const forval = PRESET_NAME.test(asked) && asked.length <= NAME_LIMIT ? asked : BASE;
  const patch: Record<string, unknown> = {};
  const ignored: string[] = [];
  params.forEach((value, key) => {
    if (key === "forval") return;
    const s = isSceneKey(key) ? keySpec(key) : null;
    const decoded = s ? decodeValue(s, value, rooms) : null;
    if (s && decoded !== null) patch[key] = decoded;
    else ignored.push(key);
  });
  return { forval, patch: patch as Partial<SceneState>, ignored };
}

/** "?forval=levande&dust=0.8": the preset and the keys that differ from it (none for basgrund itself: an empty address). */
export function writeAddress(forval: string, state: SceneState, presetState: SceneState): string {
  const params = new URLSearchParams();
  if (forval !== BASE) params.set("forval", forval);
  for (const key of differences(state, presetState)) params.set(key, encodeValue(keySpec(key)!, state[key]));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The same look on the old lab's 3D page, which starts from the scene's DEFAULTS and reads every key from its address
 * (src/scene3d-ui.ts line 40): "/scene3d.html?room=panorama&blur=5&…". shoe: the 3D shoe trial is on (?sko=3d).
 */
export function oldLabAddress(state: SceneState, defaults: SceneState, extra: { shoe?: boolean } = {}): string {
  const params = new URLSearchParams();
  for (const key of differences(state, defaults)) params.set(key, encodeValue(keySpec(key)!, state[key]));
  if (extra.shoe) params.set("sko", "3d");
  const text = params.toString();
  return `/scene3d.html${text ? `?${text}` : ""}`;
}
