// The pen's shapes, history and geometry (studio/components/krita/model.ts). Run: node --test "studio/tests/krita-model.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addShape,
  arrowHead,
  canRedo,
  canUndo,
  clearShapes,
  dataUrlBytes,
  emptyHistory,
  exportSize,
  extendStroke,
  fitInside,
  isMark,
  normalRect,
  redo,
  strokeWidth,
  textSize,
  toPicture,
  undo,
  type Shape,
} from "../components/krita/model.ts";

const rect = (x: number): Shape => ({ kind: "rect", colour: "red", weight: "tunn", from: { x, y: 0 }, to: { x: x + 10, y: 10 } });

test("undo and redo walk the list of lists; a new mark drops the redo", () => {
  let h = emptyHistory();
  assert.equal(canUndo(h), false);
  h = addShape(h, rect(1));
  h = addShape(h, rect(2));
  assert.equal(h.present.length, 2);
  h = undo(h);
  assert.equal(h.present.length, 1);
  assert.equal(canRedo(h), true);
  h = redo(h);
  assert.equal(h.present.length, 2);
  h = undo(undo(h));
  assert.equal(h.present.length, 0);
  assert.equal(undo(h), h);
  h = addShape(h, rect(3));
  assert.equal(canRedo(h), false);
  assert.equal(redo(h), h);
});

test("clearing is one step that undo brings back; clearing nothing is nothing", () => {
  let h = addShape(addShape(emptyHistory(), rect(1)), rect(2));
  h = clearShapes(h);
  assert.equal(h.present.length, 0);
  assert.equal(undo(h).present.length, 2);
  assert.equal(clearShapes(emptyHistory()).past.length, 0);
});

test("earlier marks are the start, not something to undo", () => {
  const h = emptyHistory([rect(1)]);
  assert.equal(h.present.length, 1);
  assert.equal(canUndo(h), false);
});

test("a point on screen in the picture's pixels, kept inside", () => {
  const box = { left: 100, top: 50, width: 800, height: 450 };
  assert.deepEqual(toPicture(500, 275, box, 1600, 900), { x: 800, y: 450 });
  assert.deepEqual(toPicture(0, 0, box, 1600, 900), { x: 0, y: 0 });
  assert.deepEqual(toPicture(2000, 2000, box, 1600, 900), { x: 1600, y: 900 });
});

test("a still hand adds no points", () => {
  const a = extendStroke([], { x: 0, y: 0 });
  const b = extendStroke(a, { x: 0.5, y: 0.5 });
  assert.equal(b, a);
  assert.equal(extendStroke(b, { x: 3, y: 0 }).length, 2);
});

test("a click is no mark; a drag is", () => {
  assert.equal(isMark({ kind: "arrow", colour: "red", weight: "tunn", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }), false);
  assert.equal(isMark({ kind: "arrow", colour: "red", weight: "tunn", from: { x: 0, y: 0 }, to: { x: 30, y: 1 } }), true);
  assert.equal(isMark({ kind: "pen", colour: "red", weight: "tunn", points: [{ x: 0, y: 0 }] }), false);
  assert.equal(isMark({ kind: "pen", colour: "red", weight: "tunn", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }), true);
  assert.equal(isMark({ kind: "text", colour: "red", weight: "tunn", at: { x: 0, y: 0 }, text: "  " }), false);
  assert.equal(isMark({ kind: "text", colour: "red", weight: "tunn", at: { x: 0, y: 0 }, text: "här" }), true);
});

test("an arrow's head sits at its tip, its base on the shaft", () => {
  const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 6);
  assert.deepEqual(head.tip, { x: 100, y: 0 });
  assert.ok(head.left.x < 100 && head.right.x < 100);
  assert.ok(Math.abs(head.left.y + head.right.y) < 1e-9, "symmetric about the shaft");
  assert.ok(head.base.x < 100 && head.base.x > head.left.x - 1 && Math.abs(head.base.y) < 1e-9);
  // A short arrow keeps a head shorter than itself.
  const short = arrowHead({ x: 0, y: 0 }, { x: 10, y: 0 }, 6);
  assert.ok(short.left.x >= 0);
});

test("a frame from two corners, whatever way it was dragged", () => {
  assert.deepEqual(normalRect({ x: 50, y: 40 }, { x: 10, y: 80 }), { x: 10, y: 40, w: 40, h: 40 });
});

test("sizes: fit inside a box, never past 1600 on export", () => {
  assert.deepEqual(fitInside(1600, 900, 800, 800), { w: 800, h: 450, scale: 0.5 });
  assert.deepEqual(fitInside(400, 300, 800, 800), { w: 400, h: 300, scale: 1 });
  assert.equal(fitInside(400, 300, 800, 800, true).w, 800);
  assert.deepEqual(exportSize(3200, 1800), { w: 1600, h: 900, scale: 0.5 });
  assert.deepEqual(exportSize(900, 1800), { w: 800, h: 1600, scale: 0.8888888888888888 });
  assert.equal(exportSize(1200, 700).w, 1200);
});

test("strokes and text grow with the picture; thick is thicker", () => {
  assert.ok(strokeWidth("tjock", 1600, 900) > strokeWidth("tunn", 1600, 900));
  assert.ok(strokeWidth("tunn", 3200, 1800) > strokeWidth("tunn", 1600, 900));
  assert.ok(strokeWidth("tunn", 100, 100) >= 2);
  assert.ok(textSize("tjock", 1600, 900) > textSize("tunn", 1600, 900));
});

test("bytes of a data URL", () => {
  assert.equal(dataUrlBytes("data:image/png;base64,AAAA"), 3);
  assert.equal(dataUrlBytes(`data:image/png;base64,${"A".repeat(4000)}`), 3000);
});
