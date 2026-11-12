// The last picture's card (tools/order-images.ts): the homography and the parts of a mask always; the real drawing with
// the bank's card texture only where the bank's films are on disk (they are outside Git).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { H, W, apply, cardTexture, components, drawCard, homography, planQuad, readPlan, type Pt } from './order-images.ts';

test('the homography maps the four corners onto the four corners', () => {
  const from: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]], to: Pt[] = [[100, 200], [180, 205], [190, 280], [95, 270]];
  const h = homography(from, to);
  from.forEach((p, i) => { const [x, y] = apply(h, ...p); assert.ok(Math.hypot(x - to[i][0], y - to[i][1]) < 1e-6); });
});

test('parts of a mask: areas, centres and boxes', () => {
  const mask = new Uint8Array(10 * 6);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [7, 4]]) mask[y * 10 + x] = 1;
  const { parts } = components(mask, 10, 6);
  assert.deepEqual(parts.slice(1).map((p) => [p.area, p.cx, p.cy, p.x1 - p.x0 + 1]), [[4, 1.5, 1.5, 2], [1, 7, 4, 1]]);
});

const media = existsSync('assets/motions/pamela-p4-c1-plan-return-idle-01/source.mp4') && existsSync('assets/anchors/pamela-idle-p4-c1-plan-01/receipt.json');
test('the card is drawn where the plan says, at the plan size, from real card pixels', { skip: !media && 'the bank films are not on this machine' }, async () => {
  const root = process.cwd();
  const { plan, file } = await readPlan(root);
  const texture = await cardTexture(root);
  const green = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { green[i * 3] = 0; green[i * 3 + 1] = 237; green[i * 3 + 2] = 44; }
  for (const target of ['P4.C1', 'P1.C1', 'P7.C1']) {
    const { drawn, rgb } = drawCard(green, texture, plan, file, target);
    assert.ok(drawn.measuredOffsetPx! < 2, `${target}: ${drawn.measuredOffsetPx} px from the plan`);
    assert.equal(drawn.measured!.changedElsewhere, 0);
    const q = planQuad(plan, target), wide = Math.max(...q.map((p) => p[0])) - Math.min(...q.map((p) => p[0]));
    assert.ok(Math.abs(drawn.measured!.box[0] - wide) < 4, `${target}: ${drawn.measured!.box[0]} px wide against the plan's ${wide.toFixed(1)}`);
    // Real pixels: the card's blue varies, a flat fill would not.
    const blues = new Set<number>();
    const [cx, cy] = drawn.centre.map(Math.round);
    for (let dx = -15; dx <= 15; dx++) blues.add(rgb[(cy * W + cx + dx) * 3 + 2]);
    assert.ok(blues.size > 3, `${target}: ${blues.size} shades of blue`);
  }
});
