// The last picture's card (tools/order-images.ts): the homography and the parts of a mask always; the real drawing with
// the bank's card texture only where the bank's films are on disk (they are outside Git). The pose figure's green brought
// to the anchor's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { H, W, apply, cardTexture, components, drawCard, greenOf, homography, matchGreen, planQuad, readPlan, type Pt } from './order-images.ts';

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

test("the pose figure's green is brought to the anchor's: the whole green moves, the arm and the card do not, no fringe", () => {
  // The figure: the source film's green (Pamela's, 10 223 61) with a soft shadow, a black sleeve, a yellow card, and an
  // edge pixel that is half sleeve and half green. The anchor: Paow's green (0 238 45).
  const figure = Buffer.alloc(W * H * 3), anchor = Buffer.alloc(W * H * 3);
  const set = (rgb: Buffer, x: number, y: number, c: number[]) => rgb.set(c, (y * W + x) * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { set(figure, x, y, [10, 223, 61]); set(anchor, x, y, [0, 238, 45]); }
  for (let y = 100; y < 200; y++) for (let x = 100; x < 200; x++) set(figure, x, y, [8, 190, 52]);
  for (let y = 600; y < 700; y++) for (let x = 1200; x < 1300; x++) set(figure, x, y, [20, 20, 22]);
  for (let y = 600; y < 700; y++) for (let x = 1400; x < 1440; x++) set(figure, x, y, [235, 205, 30]);
  set(figure, 1300, 650, [15, 122, 42]);
  const m = matchGreen(figure, anchor);
  const at = (x: number, y: number) => [...m.rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
  assert.deepEqual(m.before, [10, 223, 61]);
  assert.deepEqual(m.anchor, [0, 238, 45]);
  assert.deepEqual(m.after, [0, 238, 45], 'the green is the anchor\'s');
  assert.deepEqual(at(10, 10), [0, 238, 45]);
  assert.deepEqual(at(1700, 1100), [0, 238, 45]);
  const shadow = at(150, 150);
  assert.ok(shadow[1] > 190 && shadow[0] <= 8 && shadow[2] < 52, `the shadowed green moves too: ${shadow}`);
  assert.deepEqual(at(1250, 650), [20, 20, 22], 'the sleeve is not recoloured');
  assert.deepEqual(at(1420, 650), [235, 205, 30], 'the yellow card is not recoloured');
  const edge = at(1300, 650);
  assert.ok(Math.abs(edge[1] - 122 - 7) <= 2 && Math.abs(edge[2] - 42 + 8) <= 2, `an edge pixel moves by its green part, no fringe: ${edge}`);
  assert.ok(matchGreen(figure, anchor).rgb.equals(m.rgb), 'the same pictures give the same bytes');
  assert.deepEqual(greenOf(figure, [0, 0, 200, 200]), [10, 223, 61], 'a box is measured on its own');
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
