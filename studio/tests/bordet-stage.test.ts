// Bordet's stage in Kortplan: the picture never lies under the place buttons (Jakob 2026-11-23: "Platsknapparna döljer vyn,
// samt bordet."). Three things hold that, and each is held here: the camera keeps the picture's edges at the stage's at every
// zoom and pan (lib/bordet.ts), the stage clips what is drawn in it (Board.tsx), and in one column every part of the view
// has its own height, the picture at most a share of what is seen (columnStage), so that nothing runs on under what follows.
// Also "Spelet", the zoom that shows the film at the size the game draws it in the window (gameScale, gameCamera).
// Run: node --test "studio/tests/bordet-stage.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import { VIEWS } from "../../src/placement-model.ts";
import { STAGE_MIN, STAGE_SHARE, ZOOM_MAX, actualCamera, clampCamera, closeUp, columnStage, fitCamera, gameCamera, gameScale, panBy, pictureOrigin, zoomAt, type Camera, type Size } from "../lib/bordet.ts";
import { PLAN_VIEW } from "../lib/placement.ts";

const picture: Size = { w: VIEWS[PLAN_VIEW].width, h: VIEWS[PLAN_VIEW].height };
const aspect = picture.w / picture.h;
// stages as the view makes them: one column in a lying, narrow window; one column upright; side by side; a phone
const stages: Size[] = [{ w: 924, h: 411 }, { w: 824, h: 549 }, { w: 964, h: 642 }, { w: 390, h: 260 }];

test("at every zoom and pan the picture's edges stay at the stage's", () => {
  for (const area of stages) {
    const fit = fitCamera(area, picture);
    const cameras: Camera[] = [fit, actualCamera(fit, area, picture), closeUp([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 100 }, { x: 0, y: 100 }], area, picture)];
    for (const factor of [0.2, 1.7, 3, 40]) for (const at of [{ x: 0, y: 0 }, { x: area.w, y: area.h }, { x: area.w / 2, y: area.h }]) cameras.push(zoomAt(fit, factor, at, area, picture));
    for (const c of [...cameras]) for (const [dx, dy] of [[9000, 9000], [-9000, -9000], [9000, -9000], [-300, 120]]) cameras.push(panBy(c, dx, dy, area, picture));
    cameras.push(clampCamera({ scale: 0.01, x: -5000, y: 9000 }, area, picture), clampCamera({ scale: 99, x: 5000, y: -9000 }, area, picture));
    for (const c of cameras) {
      const said = `${JSON.stringify(c)} on ${area.w} × ${area.h}`;
      assert.ok(c.scale >= fit.scale - 1e-9 && c.scale <= ZOOM_MAX, `the scale lies between the fitted one and the largest: ${said}`);
      const o = pictureOrigin(c, area);
      for (const [from, size, room] of [[o.left, picture.w * c.scale, area.w], [o.top, picture.h * c.scale, area.h]]) {
        // smaller than the stage in a direction: in the middle there; larger: it covers the stage, no edge of it inside
        if (size <= room + 1e-6) assert.ok(Math.abs(from - (room - size) / 2) < 1e-6, `in the middle: ${said}`);
        else assert.ok(from <= 1e-6 && from + size >= room - 1e-6, `covers the stage: ${said}`);
      }
    }
  }
});

test("Spelet: the scale the game draws the film at in the window, never smaller than the whole picture", () => {
  // The game's lying framing: 0.84 × min(width / 1764, height / 1174); upright (width / height under 0.8) its tall one, 1.55 ×.
  const near = (got: number, want: number, said: string) => assert.ok(Math.abs(got - want) < 5e-4, `${said}: ${got}, not ${want}`);
  near(gameScale({ w: 1764, h: 1174 }), 0.84, "the game's own frame");
  near(gameScale({ w: 1440, h: 900 }), 0.84 * (900 / 1174), "a lying window, its height decides");
  near(gameScale({ w: 1000, h: 1100 }), 0.84 * (1000 / 1764), "a nearly square window, its width decides");
  near(gameScale({ w: 390, h: 844 }), 1.55 * (390 / 1764), "a phone held upright: the tall framing");
  assert.equal(gameScale({ w: 0, h: 0 }), 1, "before the window is measured");
  // Side by side the stage is narrower than the window, and the game's size is larger than the fitted picture: it is shown.
  const wide = { w: 1920, h: 1080 }, beside: Size = { w: 964, h: 642 };
  const held: Camera = { scale: 3, x: 400, y: 300 };
  const game = gameCamera(held, wide, beside, picture);
  near(game.scale, gameScale(wide), "the game's scale");
  assert.ok(game.scale > fitCamera(beside, picture).scale);
  // In one column of an upright window (900 × 1100) the stage is nearly as wide as the window and shows the whole picture
  // larger than the game shows the film: the whole picture is shown then (the hover text says so).
  const narrow = { w: 900, h: 1100 }, column: Size = { w: 824, h: 549 };
  assert.ok(gameScale(narrow) < fitCamera(column, picture).scale);
  assert.equal(gameCamera(held, narrow, column, picture).scale, fitCamera(column, picture).scale);
});

test("one column: the picture's own shape, at most the share of what is seen of the column", () => {
  assert.equal(columnStage(924, 748, aspect), 411, "a lying, narrow window (1000 × 800): the share, so that the place buttons under it are in sight");
  assert.equal(columnStage(824, 1048, aspect), 549, "an upright window (900 × 1100): the picture's own shape");
  assert.equal(columnStage(390, 700, aspect), 260, "a phone held upright: the picture's own shape");
  assert.equal(columnStage(924, 300, aspect), STAGE_MIN, "a very low window: never lower than the least height");
  assert.equal(columnStage(300, 300, aspect), 200, "unless the picture's own shape is lower than that");
  for (const seen of [300, 500, 748, 1048, 1600]) {
    for (const width of [320, 600, 924, 1400]) {
      const h = columnStage(width, seen, aspect);
      assert.ok(h <= Math.round(width / aspect) && h <= Math.max(STAGE_MIN, Math.round(seen * STAGE_SHARE)), `${width} wide, ${seen} seen: ${h}`);
    }
  }
});
