// node --test dealer3d/tests/capture.test.ts
// The deal read off Pamela's film (dealer3d/data/giv-pamela-p4.json): every joint within what a person can do in every
// frame, the card in her fingers until it lies, on edge to the bank's camera once. And the lifting itself on a made-up hand.
// Needs no media: the data file holds the deal as numbers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CARD, TABLE_LENS, filmEye, length, see, sub, type Vec3} from '../../src/table-lens.ts';
import {LIMITS, TIPS, joints, placeHand, type ArmPose, type HandMarks} from '../src/capture.ts';
import {sideSeen, type CardPose} from '../src/deal.ts';

type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
const data = JSON.parse(await readFile(new URL('../data/giv-pamela-p4.json', import.meta.url), 'utf8')) as {film: string; fps: number; frameCount: number; leavesShoe: number; edge: number[]; rests: number; palm: number; frames: {card: {c: Vec3; l: Vec3; n: Vec3}; L: Limb; R: Limb; h: Vec3}[]};
const eye = filmEye(TABLE_LENS), arm = (a: Limb): ArmPose => ({shoulder: a.s, elbow: a.e, wrist: a.w, stretch: a.k, points: a.p});
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const card = (f: (typeof data.frames)[number]): CardPose => ({centre: f.card.c, long: f.card.l, normal: f.card.n, across: cross(f.card.n, f.card.l)});
const unwrap = (v: number[]) => { const o = [v[0]]; for (let i = 1; i < v.length; i++) { let d = v[i] - v[i - 1]; while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i - 1] + d); } return o; };

test('the film read is the approved deal to seat 4, whole', () => {
  assert.equal(data.film, 'pamela-p4-c1-plan-deal-02'); assert.equal(data.frameCount, 120); assert.equal(data.frames.length, 120); assert.equal(data.fps, 30);
});

test('every joint of both arms and hands stays within what a person can do, in every frame', () => {
  for (const [side, sign] of [['L', data.palm], ['R', -data.palm]] as const) {
    const all = data.frames.map(f => joints(arm(f[side]), sign));
    all.forEach((j, i) => { const at = `${side} frame ${i}`;
      assert.ok(j.elbow <= LIMITS.elbow, `${at}: elbow bent ${j.elbow.toFixed(0)}`); assert.ok(j.wrist <= LIMITS.wrist, `${at}: wrist ${j.wrist.toFixed(0)}`); assert.ok(j.stretch <= LIMITS.stretch, `${at}: arm stretched ${j.stretch}`);
      for (const bend of j.fingers.flat()) assert.ok(bend <= LIMITS.fingerBend && bend >= -LIMITS.fingerBack, `${at}: a finger joint at ${bend.toFixed(0)}`); });
    const twist = unwrap(all.filter(j => j.twist !== null).map(j => j.twist as number)); assert.ok(Math.max(...twist) - Math.min(...twist) <= LIMITS.twistSpan, `${side}: the forearm turns ${(Math.max(...twist) - Math.min(...twist)).toFixed(0)} degrees`);
  }
});

test('the dealing forearm turns with the card: more than a quarter turn through the deal, and the resting one hardly at all', () => {
  const span = (side: 'L' | 'R', sign: number) => { const t = unwrap(data.frames.map(f => joints(arm(f[side]), sign).twist).filter(v => v !== null) as number[]); return Math.max(...t) - Math.min(...t); };
  assert.ok(span('L', data.palm) > 60, `dealing forearm ${span('L', data.palm).toFixed(0)}`); assert.ok(span('R', -data.palm) < 25, `resting forearm ${span('R', -data.palm).toFixed(0)}`);
});

test('no fingertip and no part of the card goes under the felt, and the resting hand lies on it', () => {
  data.frames.forEach((f, i) => { for (const side of ['L', 'R'] as const) for (const k of TIPS) assert.ok(f[side].p[k][1] >= -0.001, `${side} frame ${i}: fingertip ${k} at ${f[side].p[k][1]}`);
    const c = card(f), lowest = c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); assert.ok(lowest >= -0.0005, `frame ${i}: the card ${lowest} under the felt`);
    assert.ok(Math.min(...TIPS.map(k => f.R.p[k][1])) < 0.03, `frame ${i}: the resting hand has left the felt`); });
});

test('the card is in her fingers from the shoe until it lies: its held end never more than 45 mm from thumb and forefinger', () => {
  for (let i = data.leavesShoe + 5; i <= data.rests; i++) { const f = data.frames[i], c = card(f), end: Vec3 = [0, 1, 2].map(k => c.centre[k] + c.long[k] * (CARD.height / 2 - 0.012)) as Vec3, grip: Vec3 = [0, 1, 2].map(k => (f.L.p[4][k] + f.L.p[8][k]) / 2) as Vec3;
    assert.ok(length(sub(end, grip)) <= 0.045, `frame ${i}: ${(length(sub(end, grip)) * 1000).toFixed(0)} mm from her fingers`); }
});

test('the bank\'s camera sees the back, then the edge once, mid-way and not at the shoe, then the face', () => {
  const seen = data.frames.map(f => sideSeen(card(f), eye.position, 0)), turns = seen.map((s, i) => i > 0 && s !== seen[i - 1] ? i : -1).filter(i => i >= 0);
  assert.equal(seen[0], 'BACK'); assert.equal(seen[seen.length - 1], 'FRONT'); assert.equal(turns.length, 1, `the side changes at frames ${turns}`);
  assert.ok(turns[0] >= data.edge[0] - 2 && turns[0] <= data.edge[1] + 2, `the card turns at frame ${turns[0]}, the film's is on edge at ${data.edge}`); assert.ok(turns[0] > data.leavesShoe + 15, 'well after the shoe');
});

test('the card starts in the shoe and ends flat on the felt, face up, a real card all the way', () => {
  const first = card(data.frames[0]), last = card(data.frames[data.frameCount - 1]);
  assert.ok(first.centre[1] > 0.03 && first.long[1] > 0.7, 'standing in the shoe'); assert.ok(Math.abs(last.centre[1] - CARD.thickness / 2) < 1e-4 && last.normal[1] > 0.9999, 'lying face up');
  const at = see(eye, last.centre)!; assert.ok(Math.hypot(at.x - 853.3, at.y - 1101.5) < 2, `lies on the film's resting card (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);
  for (const f of data.frames) { const c = card(f); for (const v of [c.long, c.normal, c.across]) assert.ok(Math.abs(length(v) - 1) < 2e-3, 'unit'); assert.ok(Math.abs(c.long[0] * c.normal[0] + c.long[1] * c.normal[1] + c.long[2] * c.normal[2]) < 2e-3, 'square'); }
});

test('placeHand: every point comes back on its own pixel, the wrist at the depth asked for', () => {
  const hand: HandMarks = {score: 1, world: Array.from({length: 21}, (_, i) => [0.01 * (i % 5) - 0.02, 0.012 * Math.floor(i / 5) - 0.03, 0.004 * ((i * 7) % 5) - 0.008]), image: Array.from({length: 21}, (_, i) => [1000 + 14 * (i % 5), 700 + 16 * Math.floor(i / 5), 0])};
  const points = placeHand(TABLE_LENS, hand, 2.0, 1.3);
  points.forEach((p, i) => { const q = see(eye, p)!; assert.ok(Math.hypot(q.x - hand.image[i][0], q.y - hand.image[i][1]) < 1e-6, `point ${i} off its pixel`); });
  const forward: Vec3 = eye.forward, depth = (p: Vec3) => (p[0] - eye.position[0]) * forward[0] + (p[1] - eye.position[1]) * forward[1] + (p[2] - eye.position[2]) * forward[2];
  assert.ok(Math.abs(depth(points[0]) - 2.0) < 1e-9, 'the wrist at its depth'); assert.ok(Math.max(...points.map(depth)) - Math.min(...points.map(depth)) < 0.05, 'the hand as deep as a hand');
});
