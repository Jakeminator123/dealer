// node --test dealer3d/tests/capture.test.ts
// The lifting of a hand read off a film into the room (src/capture.ts, placeHand), on a made-up hand: no media and no
// stored deal is read. The read deals from A2.1 (dealer3d/data/giv-avlast-*.json) are data, not held by a test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_LENS, filmEye, see, type Vec3} from '../../src/table-lens.ts';
import {placeHand, type HandMarks} from '../src/capture.ts';

const eye = filmEye(TABLE_LENS);

test('placeHand: every point comes back on its own pixel, the wrist at the depth asked for', () => {
  const hand: HandMarks = {score: 1, world: Array.from({length: 21}, (_, i) => [0.01 * (i % 5) - 0.02, 0.012 * Math.floor(i / 5) - 0.03, 0.004 * ((i * 7) % 5) - 0.008]), image: Array.from({length: 21}, (_, i) => [1000 + 14 * (i % 5), 700 + 16 * Math.floor(i / 5), 0])};
  const points = placeHand(TABLE_LENS, hand, 2.0, 1.3);
  points.forEach((p, i) => { const q = see(eye, p)!; assert.ok(Math.hypot(q.x - hand.image[i][0], q.y - hand.image[i][1]) < 1e-6, `point ${i} off its pixel`); });
  const forward: Vec3 = eye.forward, depth = (p: Vec3) => (p[0] - eye.position[0]) * forward[0] + (p[1] - eye.position[1]) * forward[1] + (p[2] - eye.position[2]) * forward[2];
  assert.ok(Math.abs(depth(points[0]) - 2.0) < 1e-9, 'the wrist at its depth'); assert.ok(Math.max(...points.map(depth)) - Math.min(...points.map(depth)) < 0.05, 'the hand as deep as a hand');
});
