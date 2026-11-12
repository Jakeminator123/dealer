// The Placering view's helpers (studio/lib/placement.ts). Run: node --test "studio/tests/placement.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData } from "../../src/clip-graph.ts";
import { SHOE, VIEWS, defaultPlan, editPlace, quad, sequence, toPixels, validatePlan, INTENT_DEFAULTS, type Geometry } from "../../src/placement-model.ts";
import {
  GREEN_FILM, HISTORY, PLACES, START_PLACE, afterSave, amend, bankFilms, begin, changedPlaces, commit, decimal, end, filmView, isDirty, libraryFilms,
  motionSteps, nudged, openDraft, parseDecimal, placeCode, placeFromCode, placeName, placementQuery, quadSize, readPlacementAddress, signature, sizeFromCorner,
  taperFromCorner, toLocal, toSaved, turnHandle, undo,
} from "../lib/placement.ts";

test("places in his words: Plats 1–7 and dealern, the shoe, and their short forms", () => {
  assert.equal(PLACES.length, 17);
  assert.equal(placeName("P4.C2"), "Plats 4 · kort 2");
  assert.equal(placeName("D.C1"), "Dealern · kort 1");
  assert.equal(placeName(SHOE), "Skon");
  assert.equal(placeCode("P4.C2"), "P4C2");
  assert.equal(placeCode("D.C2"), "DC2");
  assert.equal(placeCode(SHOE), "Sko");
  for (const id of PLACES) assert.equal(placeFromCode(placeCode(id)), id);
  assert.equal(placeFromCode("p7c1"), "P7.C1");
  assert.equal(placeFromCode("P4.C1"), "P4.C1");
  assert.equal(placeFromCode("P8C1"), null);
  assert.equal(placeFromCode("DC3"), null);
  assert.equal(placeFromCode(null), null);
});

test("numbers with a decimal comma, read either way", () => {
  assert.equal(decimal(12.345, 2), "12,35");
  assert.equal(decimal(-3, 0), "−3");
  assert.equal(parseDecimal("12,5"), 12.5);
  assert.equal(parseDecimal(" 12.5 "), 12.5);
  assert.equal(parseDecimal("−7"), -7);
  assert.equal(parseDecimal(",5"), 0.5);
  for (const bad of ["", "abc", "1,2,3", "5px", "-"]) assert.ok(Number.isNaN(parseDecimal(bad)), bad);
});

test("the draft: one step per change, a gesture is one step, undo, back to saved, and dirty only when it differs", () => {
  const saved = defaultPlan();
  let d = openDraft(saved, '"r1"');
  assert.equal(isDirty(d), false);
  // a change that changes nothing is no step
  assert.equal(commit(d, structuredClone(d.plan)), d);
  d = commit(d, editPlace(d.plan, "P1.C1", "native", { u: 0.2 }));
  assert.equal(d.past.length, 1);
  assert.equal(isDirty(d), true);
  // a drag: many changes, one step
  d = begin(d);
  for (const u of [0.3, 0.31, 0.32]) d = amend(d, editPlace(d.plan, "P2.C1", "native", { u }));
  d = end(d);
  assert.equal(d.past.length, 2);
  assert.equal(d.plan.targets["P2.C1"].geometry.native.u, 0.32);
  // a gesture that moves nothing leaves no step
  assert.equal(end(begin(d)).past.length, 2);
  // back to saved is a step of its own, and undo brings the changes back
  const back = toSaved(d);
  assert.equal(isDirty(back), false);
  assert.equal(back.past.length, 3);
  assert.equal(signature(undo(back).plan), signature(d.plan));
  // undo all the way is clean again
  assert.equal(isDirty(undo(undo(d))), false);
  assert.equal(undo(openDraft(saved, "x")).past.length, 0);
  // the undo list is bounded
  let long = openDraft(saved, "x");
  for (let i = 0; i < HISTORY + 10; i++) long = commit(long, editPlace(long.plan, "P3.C1", "native", { u: 0.2 + i * 0.001 }));
  assert.equal(long.past.length, HISTORY);
  // after a save the server's plan is both saved and draft, and the undo list is cleared
  const s = afterSave({ ...d.plan, updatedAt: "2026-11-12T20:00:00.000Z" }, '"r2"');
  assert.equal(isDirty(s), false);
  assert.equal(s.past.length, 0);
  assert.equal(s.revision, '"r2"');
});

test("a plan saved before the table projection existed opens as the flat table, and says it differs from the file", () => {
  const legacy = defaultPlan();
  delete legacy.tableProjection;
  validatePlan(legacy);
  const d = openDraft(legacy, "x");
  assert.deepEqual(d.plan.tableProjection, { mode: "flat", heading: 0 });
  assert.equal(isDirty(d), true);
  assert.equal(d.saved.tableProjection, undefined);
});

test("what differs between two plans: places in either view, motion, material, and the table", () => {
  const a = defaultPlan();
  assert.deepEqual(changedPlaces(a, structuredClone(a)), { places: [], table: false });
  const b = editPlace(editPlace(a, "P4.C1", "portrait", { u: 0.5 }), SHOE, "native", { u: 0.5 });
  b.targets["D.C2"].material.gloss = 0.9;
  b.tableProjection = { mode: "individual", heading: 0 };
  assert.deepEqual(changedPlaces(a, b), { places: ["P4.C1", "D.C2", SHOE], table: true });
});

test("a card's size readout is the old tab's: near edge × depth in the view's pixels", () => {
  const g: Geometry = { u: 0.5, v: 0.5, width: 0.05, height: 0.08, angle: 0, taper: 1, reviewed: false };
  const size = quadSize(quad(g, "native"));
  assert.equal(size.text, `${Math.round(0.05 * 1761)} × ${Math.round(0.08 * 1173)} px`);
});

test("the handles: a near corner sets width and height around the centre, a far corner sets the perspective", () => {
  for (const angle of [0, 33, -120]) {
    const g: Geometry = { u: 0.4, v: 0.3, width: 0.05, height: 0.07, angle, taper: 0.9, reviewed: false };
    const q = quad(g, "native");
    // the corner where it is gives the same size back; the far corner gives the same taper back
    const same = sizeFromCorner(g, "native", q[2]);
    assert.ok(Math.abs(same.width - g.width) < 1e-9 && Math.abs(same.height - g.height) < 1e-9);
    assert.ok(Math.abs(taperFromCorner(g, "native", q[1]) - g.taper) < 1e-9);
    assert.ok(Math.abs(taperFromCorner(g, "native", q[0]) - g.taper) < 1e-9);
    // a corner moved out along the card's own axes
    const c = toPixels(g, "native");
    const l = toLocal(g, "native", q[3]);
    assert.ok(Math.abs(l.x + (g.width * 1761) / 2) < 1e-9 && Math.abs(l.y - (g.height * 1173) / 2) < 1e-9);
    const a = (angle * Math.PI) / 180;
    const out = { x: c.x + 2 * l.x * Math.cos(a) - 2 * l.y * Math.sin(a), y: c.y + 2 * l.x * Math.sin(a) + 2 * l.y * Math.cos(a) };
    const twice = sizeFromCorner(g, "native", out);
    assert.ok(Math.abs(twice.width - 2 * g.width) < 1e-9 && Math.abs(twice.height - 2 * g.height) < 1e-9);
    // keeping the shape: only the scale along the corner's diagonal
    const kept = sizeFromCorner(g, "native", { x: out.x + 3, y: out.y - 1 }, true);
    assert.ok(Math.abs(kept.width / kept.height - g.width / g.height) < 1e-9);
  }
  // the turning handle lies beyond the far edge, away from the centre
  const g: Geometry = { u: 0.5, v: 0.5, width: 0.05, height: 0.08, angle: 0, taper: 1, reviewed: false };
  const h = turnHandle(quad(g, "native"), 24);
  assert.ok(Math.abs(h.at.y - (h.from.y - 24)) < 1e-9 && Math.abs(h.at.x - h.from.x) < 1e-9);
});

test("the card's way in his words: A2.1 or A2.2 by the grip, the code line kept for the exact reading", () => {
  const intent = { takeHand: "LH" as const, startSide: "BACK" as const, endSide: "FRONT" as const, pass: true, turn: true, ...INTENT_DEFAULTS };
  const m = motionSteps("P4.C1", intent);
  assert.deepEqual(m.steps.map((s) => s.label), ["A2.1", "Nyp", "Handbyte", "Vänd", "Landar", "Släpper", "Tillbaka"]);
  assert.equal(m.steps[4].detail, "P4C1 · öppet");
  assert.equal(m.steps[5].detail, "höger");
  assert.equal(m.code, sequence("P4.C1", intent));
  const drag = motionSteps("D.C2", { ...intent, grip: "DRAG", pass: false, turn: false, endSide: "BACK" });
  assert.deepEqual(drag.steps.map((s) => s.label), ["A2.2", "Släp", "Landar", "Släpper", "Tillbaka"]);
  assert.equal(drag.steps.at(-1)!.detail, "A2.2");
});

test("the address: view, place and a film with its frame; defaults are left out and robot is kept", () => {
  const none = { get: () => null };
  assert.deepEqual(readPlacementAddress(none), { view: "native", place: START_PLACE, film: null, frame: 0 });
  const p = new URLSearchParams("vy=mobil&plats=dc1&bakgrund=pamela-p4-c2-source-turn&ruta=40&robot=1");
  const a = readPlacementAddress(p);
  assert.deepEqual(a, { view: "portrait", place: "D.C1", film: GREEN_FILM, frame: 40 });
  assert.equal(placementQuery(a, p), "?vy=mobil&plats=dc1&bakgrund=pamela-p4-c2-source-turn&ruta=40&robot=1");
  assert.equal(placementQuery({ view: "native", place: START_PLACE, film: null, frame: 12 }), "");
  assert.equal(readPlacementAddress(new URLSearchParams("bakgrund=../x&ruta=-3")).film, null);
  assert.equal(readPlacementAddress(new URLSearchParams("plats=zz")).place, START_PLACE);
});

test("films to lay the cards over: the bank's current takes, main take first, and the library's older ones", () => {
  const job = (id: string, from: string, to: string, kind: string) => ({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
  const bank: BankData = {
    jobs: [job("pamela-p4-c1-plan-deal-01", "READY", "P4.C1", "DEAL"), job("pamela-p4-c1-plan-deal-02", "READY", "P4.C1", "DEAL"), job("pamela-p5-c1-plan-deal-01", "READY", "P5.C1", "DEAL")],
    motions: {
      "pamela-p4-c1-plan-deal-01": { source: { frames: 120, fps: 30, width: 1764, height: 1174 }, review: { decision: "ACCEPTED" } },
      "pamela-p4-c1-plan-deal-02": { source: { frames: 90, fps: 30 }, review: { decision: "ACCEPTED", acceptedAs: "VARIANT" } },
      "pamela-p5-c1-plan-deal-01": { source: { frames: 120, fps: 30 }, review: { decision: "REJECTED" } },
    },
    media: {
      "pamela-p4-c1-plan-deal-01": { video: "assets/motions/pamela-p4-c1-plan-deal-01/source.mp4" },
      "pamela-p4-c1-plan-deal-02": { video: "assets/motions/pamela-p4-c1-plan-deal-02/source.mp4" },
      "pamela-p5-c1-plan-deal-01": { video: "assets/motions/pamela-p5-c1-plan-deal-01/source.mp4" },
    },
  } as unknown as BankData;
  const films = bankFilms(buildGraph(bank));
  // the rejected take is left out; on P4 the accepted take is the main take and comes first
  assert.deepEqual(films.map((f) => f.id), ["pamela-p4-c1-plan-deal-01", "pamela-p4-c1-plan-deal-02"]);
  assert.equal(films[0].title, "A2.1 → P4C1");
  assert.match(films[1].title, /^A2\.1 → P4C1 · /);
  assert.ok(films.every((f) => f.group === "bank" && f.width === 1764 && f.frames > 0));
  const older = libraryFilms([
    { id: "v6-native-reference", kind: "reference", path: "assets/reference/v6.mp4", width: 1762, height: 1174, frameCount: 926, fps: 30 },
    { id: "v6-portrait-reference", kind: "reference", path: "output/v6/x.mp4", width: 1080, height: 1920, frameCount: 926 },
    { id: GREEN_FILM, title: "P4 C2 grön", path: "assets/motions/a/source.mp4", width: 1764, height: 1174, frameCount: 120, fps: 30 },
    { id: "bad", path: "assets/x.png" },
    { path: "assets/y.mp4" },
  ]);
  assert.deepEqual(older.map((f) => f.title), ["V6 · dator", "V6 · mobil", "P4 C2 grön"]);
  assert.deepEqual(older.map(filmView), ["native", "portrait", "native"]);
  assert.equal(older[1].fps, 30);
});

test("the view's sizes the address and handles rely on", () => {
  assert.equal(VIEWS.native.width, 1762);
  assert.equal(VIEWS.portrait.height, 1920);
});

test("arrow keys: a pixel (Shift ten) the arrow's way, or a degree (Shift fifteen) on the turning handle; the shoe only moves", () => {
  const plan = defaultPlan();
  const g = plan.targets["P3.C1"].geometry.native;
  const right = nudged(plan, "P3.C1", "native", "ArrowRight", false, false)!;
  const a = toPixels(g, "native");
  const b = toPixels(right.targets["P3.C1"].geometry.native, "native");
  assert.ok(Math.abs(b.x - a.x - 1) < 1e-9 && Math.abs(b.y - a.y) < 1e-9);
  const up = nudged(plan, "P3.C1", "native", "ArrowUp", true, false)!;
  assert.ok(Math.abs(toPixels(up.targets["P3.C1"].geometry.native, "native").y - (a.y - 10)) < 1e-9);
  assert.equal(nudged(plan, "P3.C1", "native", "ArrowRight", false, true)!.targets["P3.C1"].geometry.native.angle, 1);
  assert.equal(nudged(plan, "P3.C1", "native", "ArrowDown", true, true)!.targets["P3.C1"].geometry.native.angle, -15);
  const shoe = nudged(plan, SHOE, "portrait", "ArrowLeft", false, true)!;
  assert.ok(Math.abs(toPixels(shoe.shoe.portrait, "portrait").x - (toPixels(plan.shoe.portrait, "portrait").x - 1)) < 1e-9);
  assert.equal(nudged(plan, "P3.C1", "native", "Enter", false, false), null);
});
