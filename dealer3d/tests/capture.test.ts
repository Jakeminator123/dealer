// node --test dealer3d/tests/capture.test.ts
// The deal read off Pamela's film (dealer3d/data/giv-pamela-p4.json) and the same deal moved to seat 1
// (giv-pamela-p1.json): every joint within what a person can do in every frame, the card in her fingers until it lies, on
// edge to the bank's camera once. And the lifting itself on a made-up hand. Needs no media: the data files hold the deals
// as numbers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CARD, TABLE_LENS, filmEye, length, see, sub, type Vec3} from '../../src/table-lens.ts';
import {LIMITS, LOOSE, TIPS, joints, placeHand, type ArmPose, type HandMarks} from '../src/capture.ts';
import {sideSeen, type CardPose} from '../src/deal.ts';

type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
type Deal = {film: string; to: string | null; throughShoe: number; fps: number; frameCount: number; leavesShoe: number; edge: number[]; rests: number; palm: number; frames: {card: {c: Vec3; l: Vec3; n: Vec3}; L: Limb; R: Limb; h: Vec3}[]};
const load = async (name: string) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8')) as Deal;
// Where the card must lie at the end, in the bank's pixels: the film's own resting card for the deal as read, and for each
// moved deal the first card's place of that seat in the plan of 2026-11-17. Seats 6 and 7 are not here: moved there, the
// hand goes through the shoe (lift.ts says so), and such a deal is not kept.
const PLACES: [string, string | null, number, number][] = [['giv-pamela-p4', null, 853.3, 1101.5], ['giv-pamela-p1', 'P1.C1', 236.7, 980.1], ['giv-pamela-p3', 'P3.C1', 643.5, 1056.9], ['giv-pamela-p5', 'P5.C1', 1074.0, 1056.9],
  ['giv-pamela-p4-los', null, 853.3, 1101.5], ['giv-pamela-p1-los', 'P1.C1', 236.7, 980.1]]; // the same two with her resting hand let loose (lift.ts --loose 1)
const DEALS = await Promise.all(PLACES.map(async ([name, to, x, y]) => ({name, to, data: await load(name), lies: {x, y}})));
const eye = filmEye(TABLE_LENS), arm = (a: Limb): ArmPose => ({shoulder: a.s, elbow: a.e, wrist: a.w, stretch: a.k, points: a.p});
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const card = (f: Deal['frames'][number]): CardPose => ({centre: f.card.c, long: f.card.l, normal: f.card.n, across: cross(f.card.n, f.card.l)});
const unwrap = (v: number[]) => { const o = [v[0]]; for (let i = 1; i < v.length; i++) { let d = v[i] - v[i - 1]; while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i - 1] + d); } return o; };
const turning = (data: Deal, side: 'L' | 'R', sign: number) => { const t = unwrap(data.frames.map(f => joints(arm(f[side]), sign).twist).filter(v => v !== null) as number[]); return Math.max(...t) - Math.min(...t); };

test('the film read is the approved deal to seat 4, whole, and every other deal is that film moved to its seat', () => {
  for (const {data, to} of DEALS) { assert.equal(data.film, 'pamela-p4-c1-plan-deal-02'); assert.equal(data.frameCount, 120); assert.equal(data.frames.length, 120); assert.equal(data.fps, 30); assert.equal(data.to, to); assert.equal(data.throughShoe, 0, 'the hand goes clear of the shoe'); }
});

for (const {name, data, lies} of DEALS) {
  test(`${name}: every joint of both arms and hands stays within what a person can do, in every frame`, () => {
    for (const [side, sign] of [['L', data.palm], ['R', -data.palm]] as const) {
      data.frames.map(f => joints(arm(f[side]), sign)).forEach((j, i) => { const at = `${side} frame ${i}`;
        assert.ok(j.elbow <= LIMITS.elbow, `${at}: elbow bent ${j.elbow.toFixed(0)}`); assert.ok(j.wrist <= LIMITS.wrist, `${at}: wrist ${j.wrist.toFixed(0)}`); assert.ok(j.stretch <= LIMITS.stretch, `${at}: arm stretched ${j.stretch}`);
        for (const bend of j.fingers.flat()) assert.ok(bend <= LIMITS.fingerBend && bend >= -LIMITS.fingerBack, `${at}: a finger joint at ${bend.toFixed(0)}`); });
      assert.ok(turning(data, side, sign) <= LIMITS.twistSpan, `${side}: the forearm turns ${turning(data, side, sign).toFixed(0)} degrees`);
    }
  });

  test(`${name}: no fingertip and no part of the card goes under the felt, and the resting hand lies on it`, () => {
    data.frames.forEach((f, i) => { for (const side of ['L', 'R'] as const) for (const k of TIPS) assert.ok(f[side].p[k][1] >= -0.001, `${side} frame ${i}: fingertip ${k} at ${f[side].p[k][1]}`);
      const c = card(f), lowest = c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); assert.ok(lowest >= -0.0005, `frame ${i}: the card ${lowest} under the felt`);
      assert.ok(Math.min(...TIPS.map(k => f.R.p[k][1])) < 0.03, `frame ${i}: the resting hand has left the felt`); });
  });

  test(`${name}: the card is in her fingers from the shoe until it lies, its held end never more than 45 mm from thumb and forefinger`, () => {
    for (let i = data.leavesShoe + 5; i <= data.rests; i++) { const f = data.frames[i], c = card(f), end = [0, 1, 2].map(k => c.centre[k] + c.long[k] * (CARD.height / 2 - 0.012)) as Vec3, grip = [0, 1, 2].map(k => (f.L.p[4][k] + f.L.p[8][k]) / 2) as Vec3;
      assert.ok(length(sub(end, grip)) <= 0.045, `frame ${i}: ${(length(sub(end, grip)) * 1000).toFixed(0)} mm from her fingers`); }
  });

  test(`${name}: the bank's camera sees the back, then the edge once, mid-way and not at the shoe, then the face`, () => {
    const seen = data.frames.map(f => sideSeen(card(f), eye.position, 0)), turns = seen.map((s, i) => i > 0 && s !== seen[i - 1] ? i : -1).filter(i => i >= 0);
    assert.equal(seen[0], 'BACK'); assert.equal(seen[seen.length - 1], 'FRONT'); assert.equal(turns.length, 1, `the side changes at frames ${turns}`);
    assert.ok(turns[0] >= data.edge[0] - 2 && turns[0] <= data.edge[1] + 2, `the card turns at frame ${turns[0]}, the film's is on edge at ${data.edge}`); assert.ok(turns[0] > data.leavesShoe + 15, 'well after the shoe');
  });

  test(`${name}: the card starts in the shoe and ends flat on its place, face up, a real card all the way`, () => {
    const first = card(data.frames[0]), last = card(data.frames[data.frameCount - 1]);
    assert.ok(first.centre[1] > 0.03 && first.long[1] > 0.7, 'standing in the shoe'); assert.ok(Math.abs(last.centre[1] - CARD.thickness / 2) < 1e-4 && last.normal[1] > 0.9999, 'lying face up');
    const at = see(eye, last.centre)!; assert.ok(Math.hypot(at.x - lies.x, at.y - lies.y) < 2, `lies at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}), not at (${lies.x}, ${lies.y})`);
    for (const f of data.frames) { const c = card(f); for (const v of [c.long, c.normal, c.across]) assert.ok(Math.abs(length(v) - 1) < 2e-3, 'unit'); assert.ok(Math.abs(c.long[0] * c.normal[0] + c.long[1] * c.normal[1] + c.long[2] * c.normal[2]) < 2e-3, 'square'); }
  });
}

test('in the film as read, the dealing forearm turns with the card (more than a quarter turn) and the resting one hardly at all', () => {
  const data = DEALS[0].data; assert.ok(turning(data, 'L', data.palm) > 60, `dealing forearm ${turning(data, 'L', data.palm).toFixed(0)}`); assert.ok(turning(data, 'R', -data.palm) < 25, `resting forearm ${turning(data, 'R', -data.palm).toFixed(0)}`);
});

test('let loose, her resting hand goes with the deal and lies as it lay when the card lies; the dealing hand and the card are untouched', () => {
  for (const [stiff, loose] of [[DEALS[0].data, DEALS[4].data], [DEALS[1].data, DEALS[5].data]]) { const turn = Math.round((stiff.edge[0] + stiff.edge[1]) / 2), gone = (i: number) => length(sub(loose.frames[i].R.w, stiff.frames[i].R.w));
    assert.ok(gone(turn) > 0.04 && gone(turn) < 0.06, `as the card turns the wrist is ${(gone(turn) * 1000).toFixed(0)} mm from where it lay`); assert.ok(loose.frames[turn].R.w[1] > stiff.frames[turn].R.w[1] + 0.02, 'its heel is lifted');
    for (const i of [0, stiff.leavesShoe, stiff.rests + LOOSE.settled, 119]) assert.ok(gone(i) < 1e-9, `frame ${i}: the hand lies where the film has it`);
    for (let i = 1; i < 120; i++) assert.ok(length(sub(loose.frames[i].R.w, loose.frames[i - 1].R.w)) < 0.006, `frame ${i}: the wrist jumps`);
    stiff.frames.forEach((f, i) => { assert.deepEqual(loose.frames[i].L, f.L); assert.deepEqual(loose.frames[i].card, f.card); assert.deepEqual(loose.frames[i].h, f.h); }); }
});

test('moved to seat 1, the hand and the card are the read ones carried across: the same fingers, the same card turning, another place', () => {
  const a = DEALS[0].data, b = DEALS[1].data, bend = (d: Deal, i: number) => joints(arm(d.frames[i].L), d.palm).fingers.flat();
  for (const i of [0, 30, 54, 80, 119]) { bend(a, i).forEach((v, k) => assert.ok(Math.abs(v - bend(b, i)[k]) < 0.5, `frame ${i}: finger joint ${k} differs`)); for (const k of [0, 1, 2]) { assert.ok(Math.abs(a.frames[i].card.n[k] - b.frames[i].card.n[k]) < 1e-9); assert.ok(Math.abs(a.frames[i].card.l[k] - b.frames[i].card.l[k]) < 1e-9); } }
  assert.deepEqual(a.frames[0].card.c, b.frames[0].card.c, 'the same card in the same shoe'); assert.ok(b.frames[119].card.c[0] < a.frames[119].card.c[0] - 0.4, 'laid half a metre to the left');
});

test('placeHand: every point comes back on its own pixel, the wrist at the depth asked for', () => {
  const hand: HandMarks = {score: 1, world: Array.from({length: 21}, (_, i) => [0.01 * (i % 5) - 0.02, 0.012 * Math.floor(i / 5) - 0.03, 0.004 * ((i * 7) % 5) - 0.008]), image: Array.from({length: 21}, (_, i) => [1000 + 14 * (i % 5), 700 + 16 * Math.floor(i / 5), 0])};
  const points = placeHand(TABLE_LENS, hand, 2.0, 1.3);
  points.forEach((p, i) => { const q = see(eye, p)!; assert.ok(Math.hypot(q.x - hand.image[i][0], q.y - hand.image[i][1]) < 1e-6, `point ${i} off its pixel`); });
  const forward: Vec3 = eye.forward, depth = (p: Vec3) => (p[0] - eye.position[0]) * forward[0] + (p[1] - eye.position[1]) * forward[1] + (p[2] - eye.position[2]) * forward[2];
  assert.ok(Math.abs(depth(points[0]) - 2.0) < 1e-9, 'the wrist at its depth'); assert.ok(Math.max(...points.map(depth)) - Math.min(...points.map(depth)) < 0.05, 'the hand as deep as a hand');
});
