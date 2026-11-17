// Bordet's pure helpers (studio/lib/bordet.ts): the stage's camera, the one card shape, and step 3's list of films with the
// method's recipe, price and the body of POST /api/orders, which must be the production list's own draft (tools/produce.ts).
// Run: node --test "studio/tests/bordet.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STEPS, stepOf } from "../../src/order-model.ts";
import { methodFor, readMethods, type Method } from "../../src/order-methods.ts";
import { INTENT_DEFAULTS, SHOE, defaultPlan, planQuad } from "../../src/placement-model.ts";
import { draftOf } from "../../tools/produce.ts";
import {
  OTHER_STEPS, ZOOM_MAX, actualCamera, cardPath, cardWishes, clampCamera, closeUp, filmRow, fitCamera, orderBody, otherWishes, panBy, pictureOrigin, sumWords, wishKey, zoomAt,
} from "../lib/bordet.ts";

const picture = { w: 1762, h: 1174 };
const area = { w: 1000, h: 700 };

test("Anpassa lays the whole picture in the stage, in its middle", () => {
  const c = fitCamera(area, picture);
  assert.ok(Math.abs(c.scale - 1000 / 1762) < 1e-9);
  const o = pictureOrigin(c, area);
  assert.ok(Math.abs(o.left) < 1e-9);
  assert.ok(Math.abs(o.top - (700 - 1174 * c.scale) / 2) < 1e-9);
});

test("the wheel zooms towards the pointer: the picture's point under it stays", () => {
  const c = fitCamera(area, picture);
  const at = { x: 730, y: 420 };
  const before = pictureOrigin(c, area);
  const point = { x: (at.x - before.left) / c.scale, y: (at.y - before.top) / c.scale };
  const z = zoomAt(c, 2, at, area, picture);
  const after = pictureOrigin(z, area);
  assert.ok(Math.abs(z.scale - c.scale * 2) < 1e-9);
  assert.ok(Math.abs(after.left + point.x * z.scale - at.x) < 1e-6);
  assert.ok(Math.abs(after.top + point.y * z.scale - at.y) < 1e-6);
});

test("the camera stays sane: scale between half the fit and the most, the picture never pans out of the stage", () => {
  const c = fitCamera(area, picture);
  assert.equal(clampCamera({ ...c, scale: 100 }, area, picture).scale, ZOOM_MAX);
  assert.ok(Math.abs(clampCamera({ ...c, scale: 0.01 }, area, picture).scale - c.scale / 2) < 1e-9);
  const big = actualCamera(c, area, picture);
  assert.equal(big.scale, 1);
  const far = panBy(big, 100000, 100000, area, picture);
  const o = pictureOrigin(far, area);
  assert.ok(o.left <= 1e-6 && o.top <= 1e-6, "the picture's top left corner stays at or beyond the stage's");
  // smaller than the stage: it stays in the middle whatever the drag
  const small = panBy(c, 500, 0, area, picture);
  assert.equal(small.x, picture.w / 2);
});

test("Närbild puts the chosen card in the middle, large", () => {
  const q = planQuad(defaultPlan(), "P4.C1", "native");
  const c = closeUp(q, area, picture);
  const cx = (Math.max(...q.map((p) => p.x)) + Math.min(...q.map((p) => p.x))) / 2;
  assert.ok(Math.abs(c.x - cx) < 1e-6);
  assert.ok(c.scale > fitCamera(area, picture).scale * 2);
});

test("one card shape: rounded corners a share of the card's own side, the same look at every size", () => {
  const q = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }];
  const d = cardPath(q);
  assert.match(d, /^M0,8Q0,0 8,0L92,0Q100,0 100,8L100,132Q100,140 92,140L8,140Q0,140 0,132Z$/);
  // twice as large: the same path, every number doubled
  const big = cardPath(q.map((p) => ({ x: p.x * 2, y: p.y * 2 })));
  assert.equal(big, d.replace(/\d+(\.\d+)?/g, (n) => String(Number(n) * 2)));
});

test("a card's films: the deal from the anchor the plan's grip says, its return, the return to rest; the shoe has none", () => {
  const pinch = cardWishes("P4.C1", { grip: "PINCH" }).map((w) => w.step);
  const drag = cardWishes("P6.C1", { grip: "DRAG" }).map((w) => w.step);
  assert.deepEqual(pinch, ["GIV-2.1", "RETUR-2.1", "RETUR-1"]);
  assert.deepEqual(drag, ["GIV-2.2", "RETUR-2.2", "RETUR-1"]);
  assert.deepEqual(cardWishes(SHOE, { grip: "PINCH" }), []);
  // every film step of the model is offered somewhere in step 3
  const offered = new Set([...pinch, ...drag, ...OTHER_STEPS]);
  for (const s of STEPS.filter((x) => x.kind === "FILM" && !x.off)) assert.ok(offered.has(s.key), `${s.key} kan inte läggas till`);
});

const register = readMethods(JSON.parse(readFileSync(new URL("../../data/order-methods.json", import.meta.url), "utf8"))).register;

test("a film in his notation", () => {
  assert.ok(register, "data/order-methods.json reads");
  const line = (step: string, target: string | null) => filmRow("paow", { step: step as never, target }, register, null).line;
  assert.equal(line("GIV-2.1", "P4.C1"), "A2.1 → P4C1 → A2.1");
  assert.equal(line("GIV-2.2", "P3.C2"), "A2.2 → P3C2 → A2.2");
  assert.equal(line("RETUR-2.1", "P4.C1"), "P4C1 → A2.1");
  assert.equal(line("RETUR-1", "P4.C1"), "P4C1 → A1");
  assert.equal(line("INGANG-2.1", null), "A1 → A2.1");
  assert.equal(line("UTGANG-2.2", null), "A2.2 → A1");
});

test("the body sent for a film is the production list's own draft, without what the page cannot set", () => {
  assert.ok(register);
  const wishes = [...cardWishes("P4.C1", { grip: "PINCH" }), ...cardWishes("P6.C1", { grip: "DRAG" }), ...cardWishes("D.C1", { grip: "PINCH" }), ...otherWishes()];
  let compared = 0;
  for (const w of wishes) {
    const method = methodFor(register, w.step, w.target);
    const body = orderBody("paow", w, method);
    if (!method || method.status === "saknas" || method.reference !== "ingen") {
      assert.equal(body, null, `${wishKey(w)}: no body without a whole method`);
      continue;
    }
    // a method still being tried is ordered as the list's trial: one take (its title is the store's here)
    const draft = draftOf({ dealer: { id: "paow", name: "Paow" } }, { label: "x", edge: "x" }, { step: w.step, target: w.target }, method as Method, null, method.status === "prov");
    const { notes: _n, createdBy: _c, title: _t, ...same } = draft as typeof draft & { notes?: unknown; createdBy?: unknown; title?: unknown };
    assert.deepEqual(body, same, wishKey(w));
    compared++;
  }
  assert.ok(compared >= 5);
});

test("a film's price is the method's model, seconds and takes at the policy's prices; the sum says what has none", () => {
  assert.ok(register);
  const policy = JSON.parse(readFileSync(new URL("../../data/order-policy.json", import.meta.url), "utf8"));
  const row = filmRow("paow", { step: "GIV-2.1", target: "P4.C1" }, register, policy);
  const method = methodFor(register, "GIV-2.1", "P4.C1")!;
  assert.ok(row.cost !== null && row.cost > 0);
  assert.equal(row.recipe.startsWith(method.model === "kling-4" ? "Kling 4" : ""), true);
  const none = filmRow("paow", { step: "RETUR-2.1", target: "P4.C1" }, register, policy);
  assert.equal(none.cost, null);
  assert.equal(none.why, "ingen metod än");
  assert.match(sumWords([row, none]), /^2 filmer · [\d  ]+ krediter · 1 utan pris$/);
  assert.equal(sumWords([]), "Inga filmer");
  assert.equal(stepOf("GIV-2.1")!.card, true);
  void INTENT_DEFAULTS;
});
