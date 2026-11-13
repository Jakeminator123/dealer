// Tests for the after-work of an anchor still (src/still-after.ts) and its command (tools/still-after.ts), on small made-up pictures
// (BGR, as OpenCV holds them). That the port gives tonight's pixels was shown on paow-ankare-2-1 (both takes identical), not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fillDark, removeShadow, greenTo, toneTo, maxFilter, cornerGreen} from '../src/still-after.ts';
import {edgeVerdict, readStillFlags} from './still-after.ts';
import {Refused} from './film-after.ts';

const GREEN = [44, 237, 0];
const picture = (w: number, h: number, bgr = GREEN) => { const d = new Uint8Array(w * h * 3); for (let i = 0; i < d.length; i += 3) d.set(bgr, i); return d; };
const box = (d: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, bgr: number[]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.set(bgr, (y * w + x) * 3); };
const px = (d: Uint8Array, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 3, (y * w + x) * 3 + 3));

test('the max filter and the corner green', () => {
  const m = new Uint8Array(25); m[12] = 200;
  assert.deepEqual(Array.from(maxFilter(m, 5, 5, 3)).filter(v => v === 200).length, 9);
  assert.deepEqual(cornerGreen(picture(400, 200), 400), [44, 237, 0]);
});

test('removing shadows: far from her a dark green becomes the background; beside light skin the rim is lifted, beside dark cloth it stays', () => {
  const w = 400, h = 200, im = picture(w, h);
  box(im, w, 340, 20, 360, 40, [40, 225, 0]);                 // a shadow on its own: 12 levels dark
  box(im, w, 100, 60, 140, 120, [150, 180, 230]);             // light skin…
  box(im, w, 140, 60, 142, 120, [40, 225, 0]);                // …with a dark rim beside it
  box(im, w, 200, 60, 240, 120, [30, 30, 30]);                // dark cloth…
  box(im, w, 240, 60, 242, 120, [40, 225, 0]);                // …with its soft edge
  box(im, w, 340, 160, 360, 180, [40, 225, 0]);               // below the edge row: left alone
  const r = removeShadow(im, w, h, 150);
  assert.deepEqual(r.green, [0, 237, 44]);
  assert.deepEqual(px(r.data, w, 350, 30), GREEN); assert.deepEqual(px(r.data, w, 141, 90), GREEN);
  assert.deepEqual(px(r.data, w, 241, 90), [40, 225, 0]); assert.deepEqual(px(r.data, w, 350, 170), [40, 225, 0]);
  assert.equal(r.far, 400); assert.equal(r.rim, 2 * 60);
});

test('filling the dark garment down to the edge: the columns under dark cloth that ends a few rows short, the soft cut copied', () => {
  const w = 300, h = 260, cut = 200, im = picture(w, h);
  box(im, w, 100, 20, 200, 196, [30, 30, 30]);                // her jacket, ending on row 195 (4 rows short of row 199)
  const r = fillDark(im, w, h, cut);
  assert.deepEqual([r.columnsFilled, r.rowsAddedMax, r.pixelsFilled], [100, 4, 900]);
  const near = (a: number[], b: number[], d: number) => a.every((v, k) => Math.abs(v - b[k]) <= d);
  assert.ok(near(px(r.data, w, 150, 199), [30, 30, 30], 4), String(px(r.data, w, 150, 199)));   // the σ 1.2 softening reaches a little green from below
  const blend = px(r.data, w, 150, cut);                       // 0.55 of the (softened) cloth and 0.45 of the green
  assert.ok(blend[1] > 0.45 * 237 && blend[1] < 0.55 * 60 + 0.45 * 237, String(blend));
  assert.deepEqual(px(r.data, w, 50, 199), GREEN);              // beside her nothing changes
  // A jacket that ends far too high (a sleeve's underside) is left alone.
  const high = picture(w, h); box(high, w, 100, 20, 200, 170, [30, 30, 30]);
  assert.equal(fillDark(high, w, h, cut).pixelsFilled, 0);
});

test('the green to another still\'s level, and her tone to another still\'s tone; the screen and the shoe are left as they are', () => {
  const w = 120, h = 90, K = picture(w, h, [50, 255, 20]), T = picture(w, h);
  box(K, w, 30, 20, 60, 80, [120, 150, 220]); box(T, w, 30, 20, 60, 80, [125, 155, 230]);      // skin
  box(K, w, 60, 20, 80, 80, [235, 235, 240]); box(T, w, 60, 20, 80, 80, [240, 242, 244]);      // light cloth
  const g = greenTo(K, T, w, h), within1 = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]) <= 1);
  assert.ok(within1(px(g.data, w, 5, 5), GREEN), String(px(g.data, w, 5, 5)));   // truncated to bytes as astype(uint8): 236.99… is 236
  assert.deepEqual(px(g.data, w, 45, 50), [120, 150, 220]); assert.equal(g.changedWhereNotGreen, 0);
  const t = toneTo(g.data, T, w, h);
  assert.ok(within1(px(t.data, w, 45, 50), [125, 155, 230]) && within1(px(t.data, w, 70, 50), [240, 242, 244]), String([px(t.data, w, 45, 50), px(t.data, w, 70, 50)]));
  assert.deepEqual(px(t.data, w, 5, 5), px(g.data, w, 5, 5));
  assert.deepEqual([t.skinWarmthRminusG.before, t.skinWarmthRminusG.wanted], [70, 75]); assert.ok(Math.abs(t.skinWarmthRminusG.after! - 75) <= 1);
});

test('the edge verdict and the flags of the command', () => {
  assert.deepEqual(edgeVerdict({green: [0, 237, 44], darkGreenPixelsAboveEdge: 0, blobs: [], bodyEnds: {columns: 400, min: 580, median: 831, max: 880}, betweenHands: {min: 831, median: 831, max: 831}}), {holds: true, why: []});
  const bad = edgeVerdict({green: [0, 237, 44], darkGreenPixelsAboveEdge: 12, blobs: [], bodyEnds: null, betweenHands: {min: 818, median: 820, max: 822}});
  assert.equal(bad.holds, false); assert.match(bad.why.join(' | '), /12 mörka.*rad 820/);
  assert.deepEqual(readStillFlags(['--fitted', 'a.png']), {fitted: 'a.png'});
  assert.throws(() => readStillFlags(['--fitted', 'a.png', '--shoe', 'b.png']), Refused);
  assert.throws(() => readStillFlags([]), /antingen/); assert.throws(() => readStillFlags(['--plate', 'x']), /Okänd flagga/);
});
