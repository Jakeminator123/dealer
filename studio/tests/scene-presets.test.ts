// Presets and addresses of the 3D scene (studio/lib/scene-presets.ts). Run: node --test "studio/tests/scene-presets.test.ts"
// The files in data/scene-presets/ and the store are tested in tools/scene-preset-store.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULTS, type SceneState } from "../../src/scene3d-view.ts";
import {
  BASE,
  NAME_LIMIT,
  PRESET_NAME,
  SHIPPED,
  SLOTS,
  differences,
  effective,
  isShipped,
  matchPreset,
  oldLabAddress,
  patchOf,
  readAddress,
  slotLabel,
  slotName,
  slotOf,
  slotToSave,
  slotsOf,
  slugOf,
  validatePreset,
  validateState,
  writeAddress,
} from "../lib/scene-presets.ts";

const [basgrund, levande, rumsstudien] = SHIPPED.map((p) => effective(DEFAULTS, p.state));

test("three ship with the lab; basgrund is the baseline", async () => {
  assert.deepEqual(SHIPPED.map((p) => p.name), ["basgrund", "levande", "rumsstudien"]);
  assert.equal(BASE, "basgrund");
  assert.ok(isShipped("levande") && !isShipped("min-egen"));
  for (const p of SHIPPED) assert.deepEqual(validatePreset(p, p.name).errors, [], p.name);
  // levande is basgrund with exactly the four keys of the look Jakob remembers (proof 3d-kanslan); the Scen view starts
  // there, and its camera does not sway by itself (Jakob 2026-11-13: "Autoläget ska inte gunga heller")
  const alive = { mode: "lean", focus: "follow", dust: 0.6, clock: true };
  assert.deepEqual(patchOf(levande, basgrund), alive);
  assert.equal(levande.sway, false);
  assert.equal(rumsstudien.sway, false);
  // the data file that ships with the lab says the same
  const file = JSON.parse(await readFile("data/scene-presets/levande.json", "utf8")) as { state: Partial<SceneState> };
  assert.deepEqual(patchOf(effective(DEFAULTS, file.state), basgrund), alive);
  assert.deepEqual(Object.keys(patchOf(rumsstudien, levande)).sort(), ["base", "lamp", "shadowAbove", "surface"]);
  assert.deepEqual(differences(basgrund, DEFAULTS), ["room", "roomShift", "blur", "tray", "cards", "pitch", "zoom", "format"]);
});

test("the state of a preset: unknown keys and wrong values refused, the rest kept", () => {
  const { state, errors } = validateState({ dust: 0.4, glitter: 2, zoom: 9, room: "skog" }, ["salong", "skog"]);
  assert.deepEqual(state, { dust: 0.4, room: "skog" });
  assert.deepEqual(errors, ["okänd nyckel glitter", "zoom ska ligga mellan 0,45 och 2,5"]);
  assert.deepEqual(validateState(null).errors, ["state ska vara ett objekt"]);
  const sent = validatePreset({ label: "  Kväll  ", state: { dust: 0.3 } }, "kvall");
  assert.deepEqual(sent.preset, { schemaVersion: 1, name: "kvall", label: "Kväll", about: "", state: { dust: 0.3 } });
  assert.ok(validatePreset({ label: "x", state: {} }, "Kväll").errors[0].includes("a–z"));
  assert.ok(validatePreset({ label: "x\u0007", state: {} }, "x").errors.includes("label får inte ha styrtecken"));
});

test("a name for the file from what he called it", () => {
  assert.equal(slugOf("Kväll i skogen"), "kvall-i-skogen");
  assert.equal(slugOf("  Åska & ÖL!! "), "aska-ol");
  assert.equal(slugOf("———"), "");
  assert.ok(slugOf("x".repeat(80)).length <= 40);
});

test("the ten places: place n is the preset profilval-<n>, what Spara som… makes of the name Profilval n", () => {
  assert.equal(SLOTS, 10);
  for (let n = 1; n <= SLOTS; n++) {
    assert.equal(slotOf(slotName(n)), n);
    assert.equal(slugOf(slotLabel(n)), slotName(n), `"${slotLabel(n)}" typed in Spara som… is place ${n}`);
    assert.ok(PRESET_NAME.test(slotName(n)) && slotName(n).length <= NAME_LIMIT && !isShipped(slotName(n)));
    assert.deepEqual(validatePreset({ label: slotLabel(n), state: { dust: 0.2 } }, slotName(n)).errors, []);
  }
  assert.equal(slotName(1), "profilval-1");
  assert.equal(slotLabel(10), "Profilval 10");
  for (const name of ["profilval-0", "profilval-11", "profilval-01", "profilval", "profilval-1-b", "min-profilval-1", "basgrund", ""]) assert.equal(slotOf(name), null, name);
  // the places in order, the named presets left out; a place without a file is empty
  const list = [...SHIPPED, { name: "profilval-3" }, { name: "kvall" }, { name: "profilval-10" }, { name: "profilval-12" }];
  const slots = slotsOf(list);
  assert.equal(slots.length, SLOTS);
  assert.deepEqual(slots.map((p) => p?.name ?? null), [null, null, "profilval-3", null, null, null, null, null, null, "profilval-10"]);
  assert.deepEqual(slotsOf([]), Array(SLOTS).fill(null));
  // a save offers the place the look started from, else the first empty one, else none
  assert.equal(slotToSave("profilval-3", slots), 3);
  assert.equal(slotToSave("levande", slots), 1);
  assert.equal(slotToSave("levande", slotsOf(Array.from({ length: SLOTS }, (_, i) => ({ name: slotName(i + 1) })))), null);
  assert.equal(slotToSave("profilval-7", slotsOf(Array.from({ length: SLOTS }, (_, i) => ({ name: slotName(i + 1) })))), 7);
});

test("which preset a state is, and what differs", () => {
  assert.equal(matchPreset(levande, DEFAULTS, SHIPPED)?.name, "levande");
  const changed: SceneState = { ...levande, dust: 0.8 };
  assert.equal(matchPreset(changed, DEFAULTS, SHIPPED), null);
  assert.deepEqual(differences(changed, levande), ["dust"]);
  assert.deepEqual(differences(changed, basgrund), ["clock", "dust", "mode", "focus"]); // in the catalogue's order
  assert.deepEqual(patchOf(basgrund, changed), { dust: 0, clock: false, mode: "look", focus: "off" });
});

test("the address: the preset and the keys that differ from it, and back", () => {
  const changed: SceneState = { ...levande, dust: 0.8, felt: "vin" };
  const text = writeAddress("levande", changed, levande);
  assert.equal(text, "?forval=levande&dust=0.8&felt=vin");
  const read = readAddress(new URLSearchParams(text));
  assert.equal(read.forval, "levande");
  assert.deepEqual(effective(levande, read.patch), changed);
  assert.equal(writeAddress(BASE, basgrund, basgrund), "", "basgrund itself is the bare address");
  assert.equal(writeAddress(BASE, { ...basgrund, sway: true }, basgrund), "?sway=1");
  // what does not fit is left out and named; a preset name that cannot be one falls back to basgrund
  const odd = readAddress(new URLSearchParams("forval=../x&dust=7&glitter=1&zoom=1.2&room=skog"), ["salong", "skog"]);
  assert.equal(odd.forval, "basgrund");
  assert.deepEqual(odd.patch, { zoom: 1.2, room: "skog" });
  assert.deepEqual(odd.ignored, ["dust", "glitter"]);
});

test("the old lab's address starts from the scene's defaults", () => {
  const url = oldLabAddress(levande, DEFAULTS, { shoe: true });
  assert.ok(url.startsWith("/scene3d.html?"));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("room"), "panorama");
  assert.equal(params.get("mode"), "lean");
  assert.equal(params.get("sway"), null, "levande does not sway: the old page's own default");
  assert.equal(params.get("pitch"), "-8");
  assert.equal(params.get("sko"), "3d");
  assert.equal(oldLabAddress(DEFAULTS, DEFAULTS), "/scene3d.html");
  // the old page reads the address as src/scene3d-ui.ts line 40 does: every key of DEFAULTS, numbers, 1 for true, words
  const state: Record<string, unknown> = { ...DEFAULTS };
  for (const [key, value] of params) if (key in DEFAULTS) { const b = DEFAULTS[key as keyof SceneState]; state[key] = typeof b === "number" ? Number(value) : typeof b === "boolean" ? value === "1" : value; }
  assert.deepEqual(state, levande);
});
