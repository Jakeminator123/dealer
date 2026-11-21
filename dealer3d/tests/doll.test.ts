// node --test dealer3d/tests/doll.test.ts
// The dolls of dealer3d/src/doll.ts. "standard" is the figure as it was before there were dolls: its measures, where it
// stands and how it bends toward a hand are locked to the numbers dealer3d/src/body.ts gave before the dolls (commit
// bcdef22~1). "paow" stands where her keystone shows her and reaches the card places of Jakob's plan within the lean the
// seat films are held to. Only placements/default.json is read.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {add, filmEye, mul, see, unit, type Vec3} from '../src/camera.ts';
import {filmLens, spots, type Plan} from '../src/world.ts';
import {BODY, restingHand, solveBody, standing} from '../src/body.ts';
import {DOLLS, PAOW, STANDARD, dollNamed, type Doll, type Frame} from '../src/doll.ts';

const plan = JSON.parse(await readFile(new URL('../../placements/default.json', import.meta.url), 'utf8')) as Plan, lens = filmLens();
const near = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const nearV = (a: Vec3, b: Vec3, tolerance: number, what: string) => a.forEach((x, i) => near(x, b[i], tolerance, `${what}[${i}]`));

test('a doll is named: none or "standard" is the standard doll, "paow" hers, and an unknown name is an error', () => {
  assert.equal(dollNamed(undefined), STANDARD); assert.equal(dollNamed(null), STANDARD); assert.equal(dollNamed('standard'), STANDARD); assert.equal(dollNamed('paow'), PAOW);
  assert.deepEqual(Object.keys(DOLLS).sort(), ['paow', 'standard']);
  assert.throws(() => dollNamed('ingen'));
});

test('the standard doll has the measures the figure had before there were dolls', () => {
  assert.deepEqual({...BODY}, {upperArm: 0.29, forearm: 0.26, reach: 0.535, hipBelowFelt: 0.2, mostLean: 0.6, mostTwist: 0.6, jointInFromShoulderPoint: 0.82});
  for (const k of ['upperArm', 'forearm', 'reach', 'hipBelowFelt', 'mostLean', 'mostTwist'] as const) assert.equal(STANDARD[k], BODY[k], k);
});

test('the standard doll stands where the figure stood', () => {
  const was: Frame = {hip: [-0.015239, -0.2, -2.023773], shoulders: [[-0.17428, 0.348907, -2.023773], [0.143802, 0.348907, -2.023773]], neck: [-0.015239, 0.378907, -2.023773], head: [-0.007997, 0.541877, -2.023773], headRadius: 0.126942};
  for (const frame of [standing(lens), standing(lens, STANDARD)]) {
    nearV(frame.hip, was.hip, 1e-6, 'hip'); nearV(frame.shoulders[0], was.shoulders[0], 1e-6, 'right shoulder'); nearV(frame.shoulders[1], was.shoulders[1], 1e-6, 'left shoulder');
    nearV(frame.neck, was.neck, 1e-6, 'neck'); nearV(frame.head, was.head, 1e-6, 'head'); near(frame.headRadius, was.headRadius, 1e-6, 'head radius');
  }
});

test('the standard doll bends toward a hand as the figure did', () => {
  const frame = standing(lens), rest = restingHand(lens).wrist;
  const was: {wrist: Vec3; lean: number; twist: number; elbowL: Vec3; elbowR: Vec3; reached: boolean}[] = [
    {wrist: [-0.532079, 0.06, -1.507294], lean: 0.571426, twist: -0.571426, elbowL: [-0.30435, 0.105688, -1.624137], elbowR: [-0.403914, -0.028306, -1.992618], reached: true},
    {wrist: [-0.018986, 0.06, -1.346757], lean: 0.328703, twist: -0.328703, elbowL: [0.094246, 0.127259, -1.570933], elbowR: [-0.362694, 0.153751, -2.007287], reached: true},
    {wrist: [0.53504, 0.06, -1.519126], lean: 0.251898, twist: -0.251898, elbowL: [0.427807, 0.14184, -1.741394], elbowR: [-0.263853, 0.184937, -2.075837], reached: true},
    {wrist: [-0.25, 0.06, -1.2], lean: 0.6, twist: -0.6, elbowL: [-0.112709, 0.13365, -1.411006], elbowR: [-0.416505, 0.089978, -1.92564], reached: false}];
  for (const w of was) for (const body of [solveBody(frame, w.wrist, rest), solveBody(frame, w.wrist, rest, STANDARD)]) {
    const at = `wrist ${w.wrist.join(',')}`;
    near(body.lean, w.lean, 1e-6, `${at}: lean`); near(body.twist, w.twist, 1e-6, `${at}: twist`);
    nearV(body.arms[1].elbow, w.elbowL, 1e-6, `${at}: left elbow`); nearV(body.arms[0].elbow, w.elbowR, 1e-6, `${at}: right elbow`); assert.equal(body.arms[1].reached, w.reached, `${at}: reached`);
  }
});

test('the paow doll stands where her keystone shows her shoulders, neck and head', () => {
  const frame = standing(lens, PAOW), eye = filmEye(lens), place = PAOW.place;
  assert.equal(place.kind, 'joints'); if (place.kind !== 'joints') return;
  const pairs: [string, Vec3, {x: number; y: number}][] = [['right shoulder', frame.shoulders[0], place.shoulders[0]], ['left shoulder', frame.shoulders[1], place.shoulders[1]], ['neck', frame.neck, place.neck], ['head', frame.head, place.head]];
  for (const [what, p, px] of pairs) { const s = see(eye, p)!; near(s.x, px.x, 0.01, `${what} x`); near(s.y, px.y, 0.01, `${what} y`); }
  near(frame.headRadius, place.headRadius, 1e-12, 'head radius');
});

// Where the wrist is when a card is laid: over the card's middle, raised and drawn back toward her hip as the sweep lays it
// at P4.C2 (dealer3d/data/giv-fran-2-3-p4c2-grepp-svep-d.json, last frame: 0.06 m over the felt, 0.147 m behind the card).
// The lean each doll needs to reach it is solveBody's, with the doll's own reach; her right hand is solved by giving
// solveBody her shoulders the other way round (it bends toward the hand of the second shoulder).
const MOST_LEAN = 9 * Math.PI / 180; // the bound dealer3d/tests/two-hand.test.ts holds the seat films to
const leans = (doll: Doll) => { const frame = standing(lens, doll), rest = restingHand(lens).wrist, mirrored: Frame = {...frame, shoulders: [frame.shoulders[1], frame.shoulders[0]]};
  return spots(plan, lens).map(s => { const back = unit([frame.hip[0] - s.at[0], 0, frame.hip[2] - s.at[2]]), wrist = add(add(s.at, mul(back, 0.147)), [0, 0.06, 0]);
    const right = solveBody(mirrored, wrist, rest, doll), left = solveBody(frame, wrist, rest, doll);
    return {id: s.id, right: right.arms[1].reached ? right.lean : Infinity, left: left.arms[1].reached ? left.lean : Infinity}; }); };
const degrees = (r: number) => Number.isFinite(r) ? `${(r * 180 / Math.PI).toFixed(1)}°` : 'utom räckhåll';

test('paow reaches every card place in Jakob\'s plan with the hand nearer to it, leaning no more than the seat films may', t => {
  const rows = leans(PAOW), over = rows.filter(r => Math.min(r.right, r.left) > MOST_LEAN);
  assert.ok(rows.length >= 16, `the plan has ${rows.length} places`);
  t.diagnostic(rows.map(r => `${r.id} höger ${degrees(r.right)} vänster ${degrees(r.left)}`).join(' | '));
  assert.deepEqual(over.map(r => `${r.id} ${degrees(Math.min(r.right, r.left))}`), [], 'places paow does not reach within 9 degrees with either hand');
});

test('with her right hand, which lays every seat film so far, paow reaches seats 1 to 5 and the dealer\'s places within the bound, and never leans less than the standard doll', t => {
  const paow = leans(PAOW), standard = leans(STANDARD), byId = new Map(standard.map(r => [r.id, r]));
  for (const r of paow) assert.ok(r.right >= byId.get(r.id)!.right - 1e-9, `${r.id}: paow leans ${degrees(r.right)}, the standard ${degrees(byId.get(r.id)!.right)}`);
  const held = paow.filter(r => /^(P[1-5]|D)\./.test(r.id)), beyond = paow.filter(r => !/^(P[1-5]|D)\./.test(r.id));
  assert.deepEqual(held.filter(r => r.right > MOST_LEAN).map(r => `${r.id} ${degrees(r.right)}`), [], 'seats 1-5 and the dealer\'s places beyond 9 degrees with her right hand');
  t.diagnostic(`höger hand, säte 6-7 (paow / standard): ${beyond.map(r => `${r.id} ${degrees(r.right)} / ${degrees(byId.get(r.id)!.right)}`).join(', ')}`);
});
