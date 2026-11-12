// The schematic card path of the Placering view (studio/lib/placement-path.ts). Run: node --test "studio/tests/placement-path.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { INTENT_DEFAULTS, quad, toPixels, type Geometry } from "../../src/placement-model.ts";
import { pathFrame } from "../lib/placement-path.ts";

const g: Geometry = { u: 0.3, v: 0.2, width: 0.04, height: 0.05, angle: 10, taper: 0.9, reviewed: false };
const end = toPixels(g, "native");
const start = { x: 1290, y: 790 };
const q = quad(g, "native");
const turned = { takeHand: "LH" as const, startSide: "BACK" as const, endSide: "FRONT" as const, pass: false, turn: true, ...INTENT_DEFAULTS };

test("the card starts at the shoe, turns on the way, lies on its place, and the hand goes back", () => {
  const first = pathFrame(0, start, end, q, turned);
  assert.equal(first.phase, "ready");
  assert.equal(first.side, "BACK");
  // at the start the card is drawn around the shoe point
  const c0 = first.points.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  const qc = q.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  assert.ok(Math.hypot(c0.x - (start.x + qc.x - end.x), c0.y - (start.y + qc.y - end.y)) < 1e-6);
  assert.equal(pathFrame(0.3, start, end, q, turned).phase, "turn");
  // after the turn it shows its landing side, and from 0.58 it lies exactly on its quad
  const laid = pathFrame(0.6, start, end, q, turned);
  assert.equal(laid.side, "FRONT");
  assert.deepEqual(laid.points, q);
  assert.equal(laid.phase, "release");
  const last = pathFrame(1, start, end, q, turned);
  assert.ok(Math.hypot(last.hand.x - start.x, last.hand.y - start.y) < 1e-6);
  assert.equal(last.phase, "ready");
  assert.match(last.arc, /^M1290,790 Q/);
});

test("a card that is not turned keeps its side; a hand change shows the other hand from the take on", () => {
  const closed = { ...turned, endSide: "BACK" as const, turn: false, pass: true };
  for (const t of [0, 0.2, 0.3, 0.5, 0.9]) assert.equal(pathFrame(t, start, end, q, closed).side, "BACK");
  assert.equal(pathFrame(0.1, start, end, q, closed).handName, "LH");
  assert.equal(pathFrame(0.3, start, end, q, closed).handName, "RH");
  assert.equal(pathFrame(0.3, start, end, q, closed).phase, "pass");
  // time outside 0…1 is held to it
  assert.deepEqual(pathFrame(-1, start, end, q, closed), pathFrame(0, start, end, q, closed));
  assert.deepEqual(pathFrame(2, start, end, q, closed), pathFrame(1, start, end, q, closed));
});
