// The catalogue of the scene's keys (studio/lib/scene-keys.ts). Run: node --test "studio/tests/scene-keys.test.ts"
// The first test is the guard: a key added to the scene (DEFAULTS in src/scene3d-view.ts) without a control here fails it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../../src/scene3d-view.ts";
import { FELT_MARKS, feltMarks, marksText as sceneMarksText } from "../../src/scene3d-table.ts";
import { readRegister } from "../../src/scene3d-room.ts";
import { readFile } from "node:fs/promises";
import {
  BUILT_BLUR,
  BUILT_ROOMS,
  GROUPS,
  MARKS,
  REBUILDS,
  REPRINTS,
  SCENE_KEYS,
  checkValue,
  decodeValue,
  encodeValue,
  formatValue,
  inUse,
  keySpec,
  keysOf,
  marksOf,
  marksText,
  sameValue,
  searchKeys,
} from "../lib/scene-keys.ts";

test("every key of the scene has exactly one control, and nothing else does", () => {
  const scene = Object.keys(DEFAULTS).sort();
  const catalogue = SCENE_KEYS.map((s) => s.key).sort();
  assert.deepEqual(catalogue, scene, "a key of SceneState without a control here, or a control for a key the scene does not have");
  assert.equal(new Set(catalogue).size, catalogue.length);
});

test("each control: a group in order, a label of at most three words, one line of help, D or U", () => {
  const order = GROUPS.map((g) => g.id);
  assert.deepEqual(GROUPS.map((g) => g.label), ["Miljö", "Rörelser", "Ljus", "Bord", "Kort och marker", "Kamera", "Avancerat"]);
  assert.deepEqual(GROUPS.filter((g) => !g.folded).map((g) => g.id), ["miljo"]);
  let last = 0;
  for (const s of SCENE_KEYS) {
    const at = order.indexOf(s.group);
    assert.ok(at >= last, `${s.key} is listed in its group's order`);
    last = at;
    assert.ok(s.label.split(/\s+/).length <= 3, `${s.key}: "${s.label}" is at most three words`);
    assert.ok(s.help.length > 10 && s.help.length <= 120 && !s.help.includes("\n"), `${s.key}: one line of help`);
    assert.ok(s.who === "D" || s.who === "U");
  }
  assert.deepEqual(GROUPS.map((g) => keysOf(g.id).length), [6, 9, 8, 8, 7, 13, 8]);
  assert.deepEqual(SCENE_KEYS.filter((s) => s.who === "D").map((s) => s.key), ["room", "roomShift", "roomShiftSeconds", "clock", "dust", "flicker", "fan", "cards", "pitch", "zoom", "format"]);
});

test("a key that needs another names a real key and real values, and comes after it in its group", () => {
  const order = SCENE_KEYS.map((s) => s.key);
  const needing = SCENE_KEYS.filter((s) => s.needs);
  assert.equal(needing.length, 15);
  for (const s of needing) {
    const parent = keySpec(s.needs!.key);
    assert.ok(parent && parent.key !== s.key, s.key);
    for (const v of s.needs!.is) assert.equal(checkValue(parent!, v), null, `${s.key} needs ${parent!.key} = ${String(v)}`);
    if (parent!.group === s.group) assert.ok(order.indexOf(parent!.key) < order.indexOf(s.key), `${s.key} after ${parent!.key}`);
  }
  // at the scene's defaults: the flicker's and the fan's timing, the card options and the focus values are tucked away
  const idle = SCENE_KEYS.filter((s) => !inUse(s, DEFAULTS)).map((s) => s.key);
  assert.deepEqual(idle, ["roomShiftSeconds", "flickerEvery", "flickerStrength", "fanStrength", "fanPeriod", "roomLight", "cardMethod", "cardHand", "cardScale", "cardRank", "cardSuit", "focusDistance", "tolerance"]);
});

test("the scene's own default of every key is a value its control can hold", () => {
  const rooms = [...BUILT_ROOMS.map((r) => r.value)];
  for (const s of SCENE_KEYS) {
    const value = DEFAULTS[s.key];
    assert.equal(checkValue(s, value, rooms), null, `${s.key} = ${String(value)}`);
    const kind = typeof value;
    assert.equal(kind, s.kind === "switch" ? "boolean" : s.kind === "slider" ? "number" : "string", `${s.key}: the kind matches the default's type`);
  }
});

test("the ranges are the lab panel's own", async () => {
  const source = await readFile("src/scene3d-ui.ts", "utf8");
  let checked = 0;
  for (const m of source.matchAll(/slider\('[^']*', '(\w+)', (-?[\d.]+), (-?[\d.]+), ([\d.]+)/g)) {
    const s = keySpec(m[1]);
    assert.ok(s && s.kind === "slider", m[1]);
    if (s.kind !== "slider") continue;
    assert.deepEqual([s.min, s.max, s.step], [Number(m[2]), Number(m[3]), Number(m[4])], m[1]);
    checked++;
  }
  assert.ok(checked >= 28, `${checked} sliders compared`);
  for (const m of source.matchAll(/choice\('(\w+)', \[((?:\['[^']*', '[^']*'\],? ?)+)\]/g)) {
    const s = keySpec(m[1]);
    if (!s || s.kind !== "choice" || m[1] === "room") continue;
    const values = [...m[2].matchAll(/\['([^']*)', '[^']*'\]/g)].map((x) => x[1]);
    assert.deepEqual(s.options.map((o) => o.value), values, m[1]);
    checked++;
  }
  assert.ok(checked >= 28 + 9, `${checked - 28} choices compared too`);
});

test("the felt's marks: the same list and the same one word as the scene's", () => {
  assert.deepEqual(MARKS.map((m) => m.value), [...FELT_MARKS]);
  for (const text of ["all", "ALL", "none", "", " rings, numbers,logga+boxes", "trim", undefined]) {
    assert.deepEqual([...marksOf(text)].sort(), [...feltMarks(text)].sort(), String(text));
    assert.equal(marksText(marksOf(text)), sceneMarksText(feltMarks(text)), String(text));
  }
});

test("rebuild and reprint keys are the scene's own", async () => {
  const view = await readFile("src/scene3d-view.ts", "utf8");
  const relens = /relens = ([^,]+(?:, [^,]+)*?), reprint = ([^;]+);/.exec(view);
  assert.ok(relens, "the set() line of scene3d-view.ts");
  const named = (text: string) => [...new Set([...text.matchAll(/'(\w+)' in patch/g)].map((m) => m[1]))].sort();
  assert.deepEqual(named(relens![1]), [...REBUILDS].sort());
  assert.deepEqual(named(relens![2]), [...REPRINTS].sort());
});

test("values: checked, written, read back from an address, compared", () => {
  const dust = keySpec("dust")!;
  assert.equal(checkValue(dust, 0.6), null);
  assert.match(checkValue(dust, 1.2)!, /mellan 0 och 1/);
  assert.match(checkValue(dust, "0.5")!, /tal/);
  const scale = keySpec("scale")!;
  assert.equal(checkValue(scale, 0), null, "0 = the contract's own k");
  assert.equal(formatValue(scale, 0), "kontraktets");
  assert.equal(formatValue(scale, 1.8), "1,80×");
  assert.equal(formatValue(keySpec("blur")!, 11), "11,0 px");
  assert.equal(formatValue(keySpec("pitch")!, -8), "−8,0°");
  assert.equal(formatValue(keySpec("felt")!, "vin"), "Vinröd");
  assert.equal(formatValue(keySpec("sway")!, true), "På");
  assert.equal(formatValue(keySpec("marks")!, "rings,numbers"), "2 av 7");
  assert.equal(formatValue(keySpec("room")!, "skog", (id) => (id === "skog" ? "Skogen" : undefined)), "Skogen");
  const room = keySpec("room")!;
  assert.equal(checkValue(room, "skog"), null, "a register room by its id when the list is not known");
  assert.match(checkValue(room, "skog", ["salong"])!, /känner inte till/);
  assert.match(checkValue(room, "Ett rum")!, /känner inte till/);
  for (const s of SCENE_KEYS) {
    const value = DEFAULTS[s.key];
    assert.ok(sameValue(decodeValue(s, encodeValue(s, value)), value), `${s.key} goes through an address`);
  }
  assert.equal(encodeValue(keySpec("aim")!, false), "0");
  assert.equal(decodeValue(keySpec("aim")!, "1"), true);
  assert.equal(decodeValue(dust, "9"), null);
  assert.equal(decodeValue(dust, ""), null);
  assert.equal(encodeValue(keySpec("zoom")!, 0.8400000001), "0.84");
  assert.ok(sameValue(0.84, 0.8400000001) && !sameValue(0.84, 0.85) && !sameValue("a", "b"));
});

test("search finds controls by their words, accents aside", () => {
  assert.deepEqual(searchKeys("glans").map((s) => s.key), ["chipGloss"]);
  assert.ok(searchKeys("skarpa").some((s) => s.key === "focus"), "skärpa without the dots");
  assert.ok(searchKeys("damm").map((s) => s.key).includes("dust"));
  assert.ok(searchKeys("Vinröd").map((s) => s.key).includes("felt"), "an option's name");
  assert.equal(searchKeys("  ").length, SCENE_KEYS.length);
  assert.deepEqual(searchKeys("finns inte alls"), []);
});

test("the built rooms and their blur are the lab page's; the register's rooms do not clash with them", async () => {
  assert.deepEqual(BUILT_ROOMS.map((r) => r.value), ["salong", "hall", "kuliss", "plat"]);
  assert.deepEqual(BUILT_BLUR, { salong: 11, hall: 11, kuliss: 9, plat: 8 });
  const ui = await readFile("src/scene3d-ui.ts", "utf8");
  assert.match(ui, /\{salong: 11, hall: 11, kuliss: 9, plat: 8\}/);
  const { rooms, problems } = readRegister(JSON.parse(await readFile("data/scene-rooms.json", "utf8")));
  assert.deepEqual(problems, []);
  for (const r of rooms) assert.equal(checkValue(keySpec("room")!, r.id, rooms.map((x) => x.id)), null, r.id);
});
