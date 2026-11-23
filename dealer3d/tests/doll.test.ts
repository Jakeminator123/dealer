// node --test dealer3d/tests/doll.test.ts
// The dolls of dealer3d/src/doll.ts. "standard" is the figure as it was before there were dolls: its measures, where it
// stands and how it bends toward a hand are locked to the numbers dealer3d/src/body.ts gave before the dolls (commit
// bcdef22~1). "paow" stands where her keystone shows her and reaches the card places of Jakob's plan within the lean the
// seat films are held to. What paow got when she was set against her films (where she sits, where her elbows hang, a hand
// of her own) the standard doll took none of. Only placements/default.json is read.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {add, cross, dot, filmEye, length, mul, see, sub, unit, type Vec3} from '../src/camera.ts';
import {dealerEdge, filmLens, spots, type Plan} from '../src/world.ts';
import {BODY, restingHand, solveBody, standing} from '../src/body.ts';
import {FINGERS} from '../src/capture.ts';
import {placed} from '../src/hand-pose.ts';
import {DOLLS, ELBOW_POLES, PAOW, STANDARD, dollNamed, elbowPolesAt, type Doll, type Frame} from '../src/doll.ts';

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

test('the standard doll has no elbow poles and no hand of its own, and stands 0.18 m behind the table edge as before', () => {
  assert.equal(STANDARD.elbowPoles, undefined); assert.equal(STANDARD.hand, undefined); assert.equal(STANDARD.place.kind, 'film');
  for (const s of standing(lens, STANDARD).shoulders) near(dealerEdge(lens)[2] - s[2], 0.18, 1e-9, 'shoulder behind the edge');
});

test('the paow doll sits as far behind the table edge as her hands on the felt put her, and her elbows hang down', () => {
  const place = PAOW.place; assert.equal(place.kind, 'joints'); if (place.kind !== 'joints') return;
  for (const s of standing(lens, PAOW).shoulders) near(dealerEdge(lens)[2] - s[2], place.behindEdge, 1e-9, 'shoulder behind the edge');
  assert.ok(place.behindEdge > 0.3 && place.behindEdge < 0.45, `her hands put her 0.37-0.39 m behind the edge, the doll stands ${place.behindEdge}`);
  assert.ok(PAOW.elbowPoles, 'paow has elbow poles of her own');
  for (const pole of PAOW.elbowPoles!) { near(length(pole), 1, 1e-3, 'pole length'); assert.ok(pole[1] < -0.5, `the pole ${pole.join(', ')} points down`); }
});

test('the standard doll\'s elbows bend toward its poles wherever the hands are; paow\'s turn to the poles of her rest only while both hands lie in front of their shoulders', () => {
  const s = standing(lens, STANDARD).shoulders;
  for (const wrists of [[s[0], s[1]], [add(s[0], [-0.3, -0.2, 0.3]), add(s[1], [0.3, -0.2, 0.3])], [add(s[0], [0.2, -0.2, 0.3]), add(s[1], [-0.2, -0.2, 0.3])]] as [Vec3, Vec3][]) assert.equal(elbowPolesAt(STANDARD, s, wrists), ELBOW_POLES);
  const rest = PAOW.elbowAtRest; assert.ok(rest, 'paow has poles for her rest');
  for (const pole of rest.poles) { near(length(pole), 1, 1e-3, 'rest pole length'); assert.ok(pole[1] < -0.5, `the rest pole ${pole.join(', ')} points down`); }
  // A wrist `r` and `l` of the arm's length out to its own side of its shoulder (her right is toward -x), a little down and forward.
  const p = standing(lens, PAOW).shoulders, long = PAOW.upperArm + PAOW.forearm, hands = (r: number, l: number): [Vec3, Vec3] => [add(p[0], [-r * long, -0.2, 0.3]), add(p[1], [l * long, -0.2, 0.3])];
  elbowPolesAt(PAOW, p, hands(-0.05, -0.05)).forEach((pole, k) => nearV(pole, unit(rest.poles[k]), 1e-9, `both hands in front, pole ${k}`));
  assert.equal(elbowPolesAt(PAOW, p, hands(-0.37, 0.22)), PAOW.elbowPoles, 'the left hand at the shoe: the poles of the deals');
  assert.equal(elbowPolesAt(PAOW, p, hands(0.4, -0.05)), PAOW.elbowPoles, 'the right hand out at seat 1: the poles of the deals');
  const half = elbowPolesAt(PAOW, p, hands(-0.05, (rest.within[0] + rest.within[1]) / 2));
  half.forEach((pole, k) => { near(length(pole), 1, 1e-9, `between, pole ${k} length`); assert.ok(dot(pole, unit(rest.poles[k])) < 1 - 1e-6 && dot(pole, PAOW.elbowPoles![k]) < 1 - 1e-6, `between, pole ${k} lies between the two`); });
});

test('paow\'s hand is one hand: the same bones right and left, at her anchor, carrying a card and at rest, and where it lies at the anchor and at rest it is palm down over the felt', () => {
  const hand = PAOW.hand; assert.ok(hand?.grip && hand.rest && hand.natural, 'paow has a hand of her own, with the shape she carries a card in, the one she rests in and her left as Naturlig has it');
  const bones = (p: Vec3[]) => FINGERS.flatMap(c => c.map((k, n) => length(sub(p[k], p[n ? c[n - 1] : 0])))), PALM = [0, 1, 5, 9, 13, 17];
  for (const p of [hand.right, hand.left, hand.grip.right, hand.grip.left, hand.rest.right, hand.rest.left, hand.natural.left]) assert.equal(p.length, 21);
  // The shapes are written to a tenth of a millimetre, so a bone of two points is the same within 0.3 mm.
  bones(hand.right).forEach((b, k) => near(b, bones(hand.left)[k], 3e-4, `bone ${k}, right and left`));
  for (const [side, own, others] of [['right', hand.right, [hand.grip.right, hand.rest.right]], ['left', hand.left, [hand.grip.left, hand.rest.left, hand.natural.left]]] as const) for (const other of others) {
    bones(own).forEach((b, k) => near(b, bones(other)[k], 3e-4, `${side} bone ${k}, at the anchor and carrying or resting`));
    for (const k of PALM) nearV(other[k], own[k], 1e-9, `${side} palm point ${k}`);
  }
  for (const [side, shape, at] of [['right', hand.right, hand.at.right], ['left', hand.left, hand.at.left], ['right at rest', hand.rest.right, hand.rest.at.right], ['left at rest', hand.rest.left, hand.rest.at.left], ['left in Naturlig', hand.natural.left, hand.natural.at.left]] as const) {
    near(length(at.forward), 1, 1e-3, `${side} forward`); near(length(at.palm), 1, 1e-3, `${side} palm`); near(dot(at.forward, at.palm), 0, 1e-3, `${side} forward across palm`);
    assert.ok(at.palm[1] < -0.9, `${side}: the palm faces the felt (${at.palm[1]})`);
    const lowest = Math.min(...placed(shape, {forward: at.forward, palm: at.palm, across: cross(at.palm, at.forward)}, at.wrist).map(q => q[1]));
    assert.ok(lowest > 0, `${side}: the hand's lowest point is ${lowest} m over the felt`);
  }
});
