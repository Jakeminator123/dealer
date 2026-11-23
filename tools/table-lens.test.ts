// node --test tools/table-lens.test.ts
// The table's lens against the numbers measured on 2026-11-17. Needs no media and no plan file: the places and the
// plan's outline widths of that day stand here as they were, so the test says the same after the plan has changed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CARD, SHOE_WINDOW_CARD, TABLE_LENS, cardCorners, filmEye, fovYDeg, length, onPlane, planPixel, quadMeasure, realCardQuad, realCardQuadAt, see, shoeCardQuad, shoePose, sides, sub, type Pixel} from '../src/table-lens.ts';

const near = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const d = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
// placements/default.json on 2026-11-17: each seat's first card (u, v, normalised bottom-up), the near edge of the plan's
// own outline there in the bank's pixels, and how many times wider a real card is (the figures of the proof dealer-3d-kamera).
const PLAN = [
  {id: 'P1.C1', u: 0.13428801143717062, v: 0.16444325374119795, planNear: 65.4, real: 78.0, times: 1.19},
  {id: 'P2.C1', u: 0.2478903994788163, v: 0.12998427842468396, planNear: 72.4, real: 80.1, times: 1.11},
  {id: 'P3.C1', u: 0.36501045899454837, v: 0.09897120063982123, planNear: 78.8, real: 82.1, times: 1.04},
  {id: 'P4.C1', u: 0.4858844998096943, v: 0.06106632779165577, planNear: 86.7, real: 84.5, times: 0.97},
  {id: 'P5.C1', u: 0.609189902492561, v: 0.09897120063982123, planNear: 78.8, real: 82.1, times: 1.04},
  {id: 'P6.C1', u: 0.7282992580818827, v: 0.12998427842468396, planNear: 72.4, real: 80.1, times: 1.11},
  {id: 'P7.C1', u: 0.8441119750941837, v: 0.16444325374119795, planNear: 65.4, real: 78.0, times: 1.19},
  {id: 'D.C1', u: 0.48239636570130606, v: 0.2097186700767263, planNear: 56.2, real: 75.1, times: 1.34},
];

test('the lens: 28 degrees of view, a metre and a tenth over the felt, pitched 25 degrees down', () => {
  near(fovYDeg(TABLE_LENS.focalPx), 28.2, 0.05, 'field of view'); near(TABLE_LENS.pitch * 180 / Math.PI, 25.06, 0.01, 'pitch'); near(TABLE_LENS.height, 1.11, 0.001, 'height');
  const eye = filmEye(TABLE_LENS), edge = onPlane(eye, 881.5, 831.5)!; near(-edge[2], 1.844, 0.001, 'from the camera to the dealer\'s edge of the table');
});

test('a point on the felt goes to its pixel and back', () => {
  const eye = filmEye(TABLE_LENS);
  for (const [x, y] of [[857, 1102], [237, 980], [1500, 900], [881.5, 831.5]]) { const p = onPlane(eye, x, y)!, back = see(eye, p)!; near(back.x, x, 1e-6, 'x'); near(back.y, y, 1e-6, 'y'); near(p[1], 0, 1e-9, 'on the felt'); }
});

test('a real card at each seat: as wide as measured, and that many times the plan\'s outline of 2026-11-17', () => {
  for (const p of PLAN) { const q = realCardQuadAt(p)!, m = quadMeasure(q);
    near(m.near, p.real, 0.06, `${p.id} near edge`); near(m.near / p.planNear, p.times, 0.01, `${p.id} against the plan`); near(m.taper, 0.958, 0.004, `${p.id} taper`); }
});

test('the outline: the card\'s own corners clockwise from the upper left, about the place, and the same from pixel or plan place', () => {
  const place = PLAN[3], centre = planPixel(place), q = realCardQuadAt(place)!, same = realCardQuad(centre)!;
  assert.ok(q[0].y < q[3].y && q[1].y < q[2].y, 'the first two corners are the far ones, uppermost in the picture'); assert.ok(q[0].x < q[1].x && q[3].x < q[2].x, 'left before right');
  q.forEach((p, i) => { near(p.x, same[i].x, 1e-9, 'x'); near(p.y, same[i].y, 1e-9, 'y'); });
  const middle = see(filmEye(TABLE_LENS), onPlane(filmEye(TABLE_LENS), centre.x, centre.y)!)!; near(middle.x, centre.x, 1e-6, 'x'); near(middle.y, centre.y, 1e-6, 'y');
  const turned = realCardQuad(centre, Math.PI / 2)!; assert.ok(d(turned[1], turned[2]) > 1.3 * d(q[3], q[2]), 'turned a quarter, its long side lies across the picture; the corners keep the card\'s own order');
  assert.equal(realCardQuad({x: 880, y: -600}), null, 'no card above the horizon');
});

test('grow: 1.025 gives seat 4 the plan\'s 86.6 px near edge and leaves the card where it lies', () => {
  const place = PLAN[3], one = realCardQuadAt(place)!, grown = realCardQuadAt(place, 0, 1.025)!;
  near(d(grown[3], grown[2]), 86.6, 0.1, 'near edge'); near(d(grown[3], grown[2]) / d(one[3], one[2]), 1.025, 0.001, 'in proportion');
  const mid = (q: Pixel[]) => ({x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4}); near(mid(grown).x, mid(one).x, 0.05, 'x'); near(mid(grown).y, mid(one).y, 0.05, 'y');
});

test('a real card keeps its size in the world: 63 by 88 mm wherever it lies', () => {
  const eye = filmEye(TABLE_LENS);
  for (const p of PLAN) { const at = onPlane(eye, planPixel(p).x, planPixel(p).y)!, c = cardCorners(at); near(length(sub(c[0], c[1])), CARD.width, 1e-12, 'width'); near(length(sub(c[1], c[2])), CARD.height, 1e-12, 'height'); }
});

test('the shoe: its foot is a real shoe\'s length, and the card in its window is the film\'s card to within a twentieth', () => {
  const foot = shoePose().footLength; assert.ok(foot > 0.38 && foot < 0.47, `shoe foot ${foot} m`);
  const q = shoeCardQuad(), real = sides(q), film = sides(SHOE_WINDOW_CARD);
  near(real.short, 50.9, 0.5, 'short side'); near(real.long, 99.1, 0.5, 'long side'); near(film.long, 92.2, 0.1, 'the film\'s card, long side'); near(film.long / real.long, 0.94, 0.01, 'the film\'s card against a real one');
  assert.ok(q[0].y < q[3].y && q[0].x < q[1].x, 'the upper short side first, from the left'); assert.ok(q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p.x * n.y - n.x * p.y; }, 0) > 0, 'clockwise on screen');
  const middle = {x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4}, want = {x: SHOE_WINDOW_CARD.reduce((s, p) => s + p.x, 0) / 4, y: SHOE_WINDOW_CARD.reduce((s, p) => s + p.y, 0) / 4};
  near(middle.x, want.x, 1.5, 'on the film\'s card, x'); near(middle.y, want.y, 1.5, 'on the film\'s card, y');
  const moved = shoeCardQuad({x: 1300, y: 800}), grown = shoeCardQuad(null, 1.1); near(sides(moved).long, real.long, 1.5, 'much the same size a few pixels away'); near(sides(grown).long / real.long, 1.1, 0.005, 'grow');
});
