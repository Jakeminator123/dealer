// node --test dealer3d/tests/two-hand.test.ts
// The two-hand deal from pose 2.3 (dealer3d/data/giv-fran-2-3-p4.json: one card to seat 4; giv-fran-2-3-alla.json: the
// seven seats and the dealer's own card in one sweep), laid by dealer3d/tools/deal-film.ts: it begins in the pose, every
// joint stays within what a person can do, the two hands are one size, the card is a real card that goes end over end
// about its short side and is never a frame from upright to lying, and the film ends still with her fingertips on the
// card. And that the data files are what the code lays today. Needs no media.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CARD, TABLE_LENS, filmEye, length, see, sub, type Vec3} from '../../src/table-lens.ts';
import {spots} from '../src/world.ts';
import {FINGERS, LIMITS, joints, type ArmPose} from '../src/capture.ts';
import {sideSeen, type CardPose} from '../src/deal.ts';
import {REAL_DEAL, type RealCard} from '../src/real-deal.ts';
import {shoeHolds, startOnAnchor, twoHandDeal} from '../src/two-hand.ts';
import {track} from '../src/hand-pose.ts';

type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
type Beat = {to: string; a: number; b: number; c: number; d: number; e: number; l: number; turned: number; f: number; g: number; h: number; i: number | null};
type Deal = {to: string[]; rightAt: {x: number; y: number; yaw: number} | null; pace: {real: RealCard; flowing: boolean; leftBack: number; elbows: {L: Vec3; R: Vec3}} | null; elbowForced: string[]; fps: number; frameCount: number; palm: number; throughShoe: number; beats: Beat[]; turns: {axis: Vec3; angle: number}[]; laid: {from: number; c: Vec3; l: Vec3; n: Vec3}[]; frames: {card: {c: Vec3; l: Vec3; n: Vec3; id: number}; L: Limb; R: Limb; h: Vec3; g: Vec3}[]};
const load = async (name: string) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const pose = await load('till-ankare-2-3'), start = pose.frames[pose.frameCount - 1], plan = JSON.parse(await readFile(new URL('../../placements/default.json', import.meta.url), 'utf8'));
const DEALS: [string, Deal][] = [['giv-fran-2-3-p5', await load('giv-fran-2-3-p5')], ['giv-fran-2-3-p5-langsam', await load('giv-fran-2-3-p5-langsam')], ['giv-fran-2-3-p4', await load('giv-fran-2-3-p4')], ['giv-fran-2-3-alla', await load('giv-fran-2-3-alla')]];
const ONE: Record<string, string> = {'giv-fran-2-3-p5': 'P5.C1', 'giv-fran-2-3-p5-langsam': 'P5.C1', 'giv-fran-2-3-p4': 'P4.C1'};
const eye = filmEye(TABLE_LENS), all = spots(plan, TABLE_LENS), arm = (a: Limb): ArmPose => ({shoulder: a.s, elbow: a.e, wrist: a.w, stretch: a.k, points: a.p});
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const card = (c: {c: Vec3; l: Vec3; n: Vec3}): CardPose => ({centre: c.c, long: c.l, normal: c.n, across: cross(c.n, c.l)});
const unwrap = (v: number[]) => { const o = [v[0]]; for (let i = 1; i < v.length; i++) { let d = v[i] - v[i - 1]; while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i - 1] + d); } return o; };
/** The turn between two poses of a card: its axis and its angle in degrees. */
const turnBetween = (a: CardPose, b: CardPose) => { const A = [a.long, a.normal, a.across], B = [b.long, b.normal, b.across], R = [0, 1, 2].map(r => [0, 1, 2].map(c => A.reduce((s, ak, k) => s + B[k][r] * ak[c], 0)));
  const anti: Vec3 = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]], n = length(anti) || 1; return {axis: [anti[0] / n, anti[1] / n, anti[2] / n] as Vec3, angle: Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))) * 180 / Math.PI}; };
const bones = (p: Vec3[]) => FINGERS.flatMap(c => [0, 1, 2].map(k => length(sub(p[c[k + 1]], p[c[k]])))).concat([length(sub(p[5], p[0])), length(sub(p[17], p[0])), length(sub(p[5], p[17]))]);

test('the real dealer\'s moments are whole: every card in the order a to i, a hand change every 0.58 to 0.82 s, the next card moving before the last is let go', () => {
  assert.deepEqual(REAL_DEAL.map(r => r.place), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'D']);
  for (const [k, r] of REAL_DEAL.entries()) { const order = [r.a, r.b, r.c, r.d, r.e, r.l, r.f, r.g, r.h, r.i]; for (let j = 1; j < order.length; j++) assert.ok(order[j] >= order[j - 1], `${r.place}: moment ${j} before moment ${j - 1}`);
    if (k > 0) { const cycle = r.d - REAL_DEAL[k - 1].d; assert.ok(cycle > 0.57 && cycle < 0.83, `${r.place}: ${cycle.toFixed(2)} s after the hand change before`); assert.ok(r.b < REAL_DEAL[k - 1].i, `${r.place}: the card moves only after the last is let go`); } }
});

test('the slow film to seat 5 is the same deal drawn out, and the card never stands still between the hand change and the felt', () => {
  const slow = DEALS.find(([n]) => n === 'giv-fran-2-3-p5-langsam')![1], own = DEALS.find(([n]) => n === 'giv-fran-2-3-p5')![1], b = slow.beats[0], N = slow.frameCount;
  assert.ok(slow.pace?.flowing, 'the raising goes straight over into the fall'); assert.deepEqual(slow.rightAt, own.rightAt); for (let i = 0; i < b.b; i++) { assert.deepEqual({...slow.frames[i], g: 0}, {...own.frames[0], g: 0}, `frame ${i} is the fast film's first frame`); assert.ok(length(sub(slow.frames[i].g, own.frames[0].card.c)) < 2e-4, `frame ${i}: her eyes are not on the card in the shoe`); } assert.deepEqual(slow.frames[N - 1], own.frames[own.frameCount - 1], 'the same last frame, to the last number');
  assert.ok(b.b <= 6 && b.h >= 62 && b.h <= 72, `it moves from frame ${b.b} and lies at frame ${b.h}`); assert.ok(b.turned - b.l >= 12 && b.turned - b.l <= 14, `the fall takes ${b.turned - b.l} frames`);
  // From the frame after her right hand has taken the card until it meets the felt, the card turns in every frame, and at least 5 degrees a frame from the fifth frame of the raising until the turn in the air is done: no frame of a standing card.
  for (let i = Math.ceil(b.d) + 2; i < b.g; i++) { const step = turnBetween(card(slow.frames[i - 1].card), card(slow.frames[i].card)).angle; assert.ok(step >= (i > b.d + 4 && i <= b.turned ? 5 : 1.5) && step <= 10, `frame ${i}: the card turns ${step.toFixed(1)} degrees`); }
  // On edge to the bank's camera (its face within 12 degrees of the line of sight) in two frames at least, and four at most.
  const edge = slow.frames.map((f, i) => { const c = card(f.card), d = sub(eye.position, c.centre); return i > b.l && i < b.g && Math.abs(Math.asin(dot(c.normal, d) / length(d))) * 180 / Math.PI < 12 ? i : -1; }).filter(i => i >= 0);
  assert.ok(edge.length >= 2 && edge.length <= 5 && edge[edge.length - 1] - edge[0] === edge.length - 1, `on edge in frames ${edge}`);
});

test('a track goes through its keys, rests at its ends and never overshoots between two keys', () => {
  const t = track([[0, 0], [2, 1], [3, 5], [6, 5.5]]); for (const [x, y] of [[0, 0], [2, 1], [3, 5], [6, 5.5], [-1, 0], [9, 5.5]]) assert.ok(Math.abs(t(x) - y) < 1e-12);
  for (let x = 0; x < 6; x += 0.05) assert.ok(t(x + 0.05) >= t(x) - 1e-12, `falls at ${x}`); assert.ok(Math.abs(t(0.01)) < 1e-3 && Math.abs(t(5.99) - 5.5) < 1e-3, 'at rest at both ends');
});

for (const [name, data] of DEALS) {
  const N = data.frameCount, last = data.beats[data.beats.length - 1], stillFrom = Math.ceil(Math.max(last.h, last.l + 0.3 * data.fps)) + 4, of = (k: number) => data.frames.map((f, i) => f.card.id === k ? i : -1).filter(i => i >= 0);

  test(`${name}: the file is what the code lays today`, () => {
    const real = (id: string) => REAL_DEAL[id === 'D.C1' ? 7 : 7 - Number(id[1])], posed = {L: start.L, R: start.R, h: start.h}, laid = twoHandDeal(TABLE_LENS, data.rightAt ? startOnAnchor(TABLE_LENS, posed, data.rightAt, data.rightAt.yaw) : posed, data.to.map(id => ({id, at: all.find(s => s.id === id)!.at, real: data.pace?.real ?? real(id)})), data.beats[0].a, data.fps, N, data.pace ? {flowing: data.pace.flowing, leftBack: data.pace.leftBack, elbows: data.pace.elbows} : {});
    assert.deepEqual(laid.forced, data.elbowForced);
    assert.equal(laid.frames.length, N); for (const i of [0, Math.round(last.d), Math.round(last.l) + 1, Math.round(last.g), N - 1]) { const a = laid.frames[i], b = data.frames[i];
      for (const [x, y] of [[a.card.c, b.card.c], [a.card.l, b.card.l], [a.R.w, b.R.w], [a.R.e, b.R.e], [a.L.w, b.L.w], [a.R.p[8], b.R.p[8]], [a.L.p[12], b.L.p[12]], [a.h, b.h], [a.g, b.g]] as [Vec3, Vec3][]) assert.ok(length(sub(x, y)) < 1e-4, `frame ${i} differs: lay the file again with dealer3d/tools/deal-film.ts`); }
  });

  test(`${name}: it begins in pose 2.3 (her right hand where the anchor picture has it, if the file says so) and stands in it until the first card moves`, () => {
    assert.equal(data.fps, 30); assert.equal(data.frames.length, N); assert.ok(data.beats[0].b >= 5, 'at least a sixth of a second in the pose');
    if (data.rightAt) { const R = data.frames[0].R, tip = see(eye, R.p[12])!, f = sub(R.p[9], R.p[0]); assert.ok(Math.hypot(tip.x - data.rightAt.x, tip.y - data.rightAt.y) < 1, `her right middle fingertip is drawn at (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)})`);
      assert.ok(Math.abs(Math.atan2(f[0], f[2]) * 180 / Math.PI - data.rightAt.yaw) < 0.5, "the hand points as the anchor's"); assert.deepEqual(R.s, start.R.s, "from the pose's shoulder"); assert.ok(Math.abs(R.p[12][1] - start.R.p[12][1]) < 1e-4 && Math.abs(R.w[1] - start.R.w[1]) < 1e-4, 'lying on the felt as in the pose'); }
    for (let i = 0; i < data.beats[0].b; i++) { const f = data.frames[i]; assert.deepEqual(f.L, start.L, `frame ${i}: left arm`); assert.deepEqual(f.h, start.h, `frame ${i}: head`); assert.deepEqual(f.R, data.rightAt ? data.frames[0].R : start.R, `frame ${i}: right arm`);
      assert.ok(length(sub(f.card.c, start.card.c)) < 2e-4 && length(sub(f.card.n, start.card.n)) < 2e-4 && length(sub(f.card.l, [-start.card.l[0], -start.card.l[1], -start.card.l[2]])) < 2e-4, `frame ${i}: the card stands in the shoe as in the pose film (its long side named from the other end)`); }
  });

  test(`${name}: every joint of both arms and hands stays within what a person can do, in every frame, and no arm is stretched`, () => {
    for (const [side, sign] of [['L', -1], ['R', 1]] as const) { const j = data.frames.map(f => joints(arm(f[side]), sign));
      j.forEach((x, i) => { const at = `${side} frame ${i}`; assert.ok(x.elbow <= LIMITS.elbow, `${at}: elbow bent ${x.elbow.toFixed(0)}`); assert.ok(x.wrist <= LIMITS.wrist, `${at}: wrist ${x.wrist.toFixed(0)}`);
        for (const bend of x.fingers.flat()) assert.ok(bend <= LIMITS.fingerBend && bend >= -LIMITS.fingerBack, `${at}: a finger joint at ${bend.toFixed(0)}`);
        const f = data.frames[i][side]; assert.equal(f.k, 1); assert.ok(Math.abs(length(sub(f.e, f.s)) - 0.29) < 5e-4 && Math.abs(length(sub(f.w, f.e)) - 0.26) < 5e-4, `${at}: the arm's bones are not their own length`); });
      const twist = unwrap(j.map(x => x.twist).filter(v => v !== null) as number[]); assert.ok(Math.max(...twist) - Math.min(...twist) <= LIMITS.twistSpan, `${side}: the forearm turns ${(Math.max(...twist) - Math.min(...twist)).toFixed(0)} degrees`); }
  });

  test(`${name}: the two hands are one size and keep it: every bone of each hand as long as in the pose, in every frame`, () => {
    const was = bones(start.R.p), left = bones(start.L.p); was.forEach((b, k) => assert.ok(Math.abs(b - left[k]) < 6e-4, `bone ${k}: ${b} in the right hand, ${left[k]} in the left`));
    data.frames.forEach((f, i) => { for (const side of ['L', 'R'] as const) bones(f[side].p).forEach((b, k) => assert.ok(Math.abs(b - was[k]) < 6e-4, `${side} frame ${i}: bone ${k} is ${(b * 1000).toFixed(1)} mm, not ${(was[k] * 1000).toFixed(1)}`)); });
  });

  test(`${name}: nothing goes under the felt or into the shoe, and the hands do not go through each other`, () => {
    const inside = shoeHolds(TABLE_LENS); assert.equal(data.throughShoe, 0); assert.deepEqual(data.elbowForced, [], 'an elbow had no place free of her body, the table and the shoe');
    data.frames.forEach((f, i) => { for (const side of ['L', 'R'] as const) for (const q of f[side].p) assert.ok(q[1] >= 0.004, `${side} frame ${i}: a point of the hand at ${q[1]}`);
      const c = card(f.card), lowest = c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); assert.ok(lowest >= -0.0005, `frame ${i}: the card ${lowest} under the felt`);
      assert.ok(!f.R.p.some(inside) && ![0.2, 0.4, 0.6, 0.8].some(t => inside([0, 1, 2].map(k => f.R.e[k] + (f.R.w[k] - f.R.e[k]) * t) as Vec3)), `frame ${i}: the right hand or forearm is in the shoe`);
      assert.ok(Math.min(...f.R.p.flatMap(p => f.L.p.map(q => length(sub(p, q))))) > 0.015, `frame ${i}: the two hands are in each other`); });
  });

  test(`${name}: the card is a real card all the way, and the order is the dealer's: seat 7 first, her own card last`, () => {
    assert.deepEqual(data.to, ONE[name] ? [ONE[name]] : ['P7.C1', 'P6.C1', 'P5.C1', 'P4.C1', 'P3.C1', 'P2.C1', 'P1.C1', 'D.C1']); assert.equal(data.beats.length, data.to.length); assert.equal(data.laid.length, data.to.length - 1);
    for (const f of data.frames) { const c = card(f.card); for (const v of [c.long, c.normal, c.across]) assert.ok(Math.abs(length(v) - 1) < 2e-3, 'unit'); assert.ok(Math.abs(dot(c.long, c.normal)) < 2e-3, 'square'); }
    data.frames.forEach((f, i) => { if (i > 0) assert.ok(f.card.id === data.frames[i - 1].card.id || f.card.id === data.frames[i - 1].card.id + 1, `frame ${i}: the cards come in order`); });
  });

  for (const [k, b] of data.beats.entries()) {
    test(`${name}, ${b.to}: stood up about its short side with its back to the players, then one turn about one axis, and never a frame from upright to lying`, () => {
      const mine = of(k), poses = mine.map(i => card(data.frames[i].card)), tilt = poses.map(c => Math.asin(Math.min(1, Math.abs(c.long[1]))) * 180 / Math.PI);
      // Flat with its back up when the hands change, then standing: its long side within 12 degrees of plumb, the held end down, the back toward the players.
      const stands = poses[mine.indexOf(Math.round(b.l))]; for (const i of mine.filter(i => i >= b.c && i <= b.d)) assert.ok(card(data.frames[i].card).normal[1] < -0.999, `frame ${i}: flat on the felt with its back up until the hands change`); const raising = mine.filter(i => i > b.d && i <= b.l), short = card(data.frames[raising[0]].card).across; assert.ok(card(data.frames[raising[0]].card).long[2] > 0.5, 'a short side toward the players');
      assert.ok(stands.long[1] < -Math.cos(12 * Math.PI / 180), `stands ${(Math.acos(-stands.long[1]) * 180 / Math.PI).toFixed(0)} degrees off plumb`); assert.ok(stands.normal[2] < -0.6, 'its back toward the players');
      // While it is stood up its lower edge is on the felt (at most 15 mm up), and the turn is about its short side: `across` does not move.
      for (const i of raising) { const c = card(data.frames[i].card), low = c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); assert.ok(low < 0.015, `frame ${i}: the lower edge ${(low * 1000).toFixed(0)} mm up`); assert.ok(dot(c.across, short) > 0.999, `frame ${i}: not about the short side`); }
      // In the air: every step of the turn is about the one axis the file names.
      const inAir = mine.filter(i => i - 1 > b.l + (b.turned - b.l) * 0.1 && i < b.turned); for (const i of inAir) { const step = turnBetween(card(data.frames[i - 1].card), card(data.frames[i].card)); if (step.angle > 2) assert.ok(dot(step.axis, data.turns[k].axis) > 0.995, `frame ${i}: turns about another axis`); }
      assert.ok(data.turns[k].angle > 70 && data.turns[k].angle < 110, `the turn in the air is ${data.turns[k].angle} degrees`);
      // The bank's camera sees the back, then the face, changing once; and the top falls toward the players (the held end ends nearest her).
      const seen = poses.map(c => sideSeen(c, eye.position, 0)), changes = seen.filter((s, j) => j > 0 && s !== seen[j - 1]).length; assert.equal(seen[0], 'BACK'); assert.equal(seen[seen.length - 1], 'FRONT'); assert.equal(changes, 1, 'the side changes once');
      // Lowered evenly: from the frame the turn is done the card is within 15 degrees of flat, so the frame before it lies it is not upright; and no step is more than 50 degrees.
      mine.forEach((i, j) => { if (i >= b.turned && i > 0) assert.ok(tilt[j] <= 15, `frame ${i}: ${tilt[j].toFixed(0)} degrees from flat after the turn`); if (j > 0) assert.ok(turnBetween(poses[j - 1], poses[j]).angle <= 50, `frame ${i}: the card turns ${turnBetween(poses[j - 1], poses[j]).angle.toFixed(0)} degrees in one frame`); });
      // It lies flat, face up, on the plan's place, from the frame the file says.
      const lies = card(data.frames[Math.ceil(b.h)].card), place = all.find(s => s.id === b.to)!.pixel, at = see(eye, lies.centre)!; assert.ok(Math.abs(lies.centre[1] - CARD.thickness / 2) < 1e-4 && lies.normal[1] > 0.9999 && lies.long[2] < -0.9999, 'lying face up, its long side toward the player');
      assert.ok(Math.hypot(at.x - place.x, at.y - place.y) < 2, `lies at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}), not at (${place.x.toFixed(1)}, ${place.y.toFixed(1)})`);
      if (k < data.laid.length) { assert.deepEqual(data.laid[k].c, data.frames[Math.ceil(b.h)].card.c); assert.ok(data.laid[k].from >= data.beats[k + 1].b - 0.06 && data.laid[k].from < data.beats[k + 1].b + 1.06, 'it is counted as lying from the frame the next card moves'); }
    });

    test(`${name}, ${b.to}: while the card stands her right hand is closed about its long side, fingers on the back and thumb on the face, and it has the card until it lies`, () => {
      // From the frame it stands until her left hand lets go: thumb-up (the palm looks the way the face does),
      // fore and middle fingertip on the back's side of the card, the thumb's tip on the face's side, and the fingertips within 25 mm of the card's long side on her right.
      const has = of(k).filter(i => i >= b.e && i <= b.l); assert.ok(has.length >= 1, 'no frame with the card standing in her hand');
      for (const i of has) { const f = data.frames[i], c = card(f.card), side = (q: Vec3) => dot(sub(q, c.centre), c.normal), palm = cross(sub(f.R.p[5], f.R.p[0]), sub(f.R.p[17], f.R.p[0])), n = length(palm);
        assert.ok(dot(palm, c.normal) / n > 0.5, `frame ${i}: the hand is not turned to the card (${(dot(palm, c.normal) / n).toFixed(2)})`);
        for (const tip of [8, 12]) { assert.ok(side(f.R.p[tip]) < -0.003, `frame ${i}: fingertip ${tip} is not on the back's side`); assert.ok(Math.abs(dot(sub(f.R.p[tip], c.centre), c.across) - CARD.width / 2) < 0.025, `frame ${i}: fingertip ${tip} is ${(Math.abs(dot(sub(f.R.p[tip], c.centre), c.across) - CARD.width / 2) * 1000).toFixed(0)} mm from the card's long side`); }
        assert.ok(side(f.R.p[4]) > -0.002, `frame ${i}: the thumb is not on the face's side (${(side(f.R.p[4]) * 1000).toFixed(0)} mm)`); }
      // And in every frame from the hand change until the card lies, fore or middle fingertip is within 30 mm of the card.
      for (const i of of(k).filter(i => i > b.d && i <= b.h)) { const f = data.frames[i], c = card(f.card), far = Math.min(...[8, 12].map(tip => { const d = sub(f.R.p[tip], c.centre), x = Math.max(0, Math.abs(dot(d, c.long)) - CARD.height / 2), y = Math.max(0, Math.abs(dot(d, c.across)) - CARD.width / 2); return Math.hypot(x, y, dot(d, c.normal)); }));
        assert.ok(far < 0.03, `frame ${i}: her fingertips are ${(far * 1000).toFixed(0)} mm from the card`); }
    });

    test(`${name}, ${b.to}: her right fingertips are at the card's corner from the hand change until she lets go, and lie on the corner nearest her when it lies`, () => {
      const until = b.i ?? N - 1; for (let i = Math.ceil(b.h); i <= until; i++) { const f = data.frames[i], c = data.beats[f.card.id].to === b.to ? f.card.c : data.laid[k].c, corner: Vec3 = [c[0] - CARD.width / 2, 0, c[2] - CARD.height / 2];
        for (const tip of [8, 12]) { const q = f.R.p[tip]; assert.ok(Math.hypot(q[0] - corner[0], q[2] - corner[2]) < 0.035 && q[1] < 0.025, `frame ${i}: fingertip ${tip} is ${(Math.hypot(q[0] - corner[0], q[2] - corner[2]) * 1000).toFixed(0)} mm from the corner, ${(q[1] * 1000).toFixed(0)} mm up`); }
        assert.ok(f.R.p[9][1] > f.R.p[12][1] && f.R.p[0][1] > f.R.p[12][1], `frame ${i}: the hand is not over its fingertips`); }
    });
  }

  test(`${name}: the hands overlap as the real dealer's, the left hand is back at the shoe, and the film ends still`, () => {
    for (const [k, b] of data.beats.entries()) if (b.i !== null) assert.ok(data.beats[k + 1].b < b.i, `${b.to}: the next card moves before her right hand lets go`);
    assert.ok(stillFrom <= N - 12, `only ${N - stillFrom} still frames at the end`); for (let i = stillFrom; i < N; i++) assert.deepEqual(data.frames[i], data.frames[N - 1], `frame ${i} is not the last frame`);
    const end = data.frames[N - 1]; assert.ok(length(sub(end.L.w, start.L.w)) < 1e-4, 'her left wrist where it was in the pose'); end.L.p.forEach((q, j) => assert.ok(length(sub(q, start.L.p[j])) < 1e-4, `left hand point ${j} as in the pose`));
    // Her head follows the place: at the end she looks at the last card, not at the shoe.
    assert.ok(length(sub(end.g, end.card.c)) < 0.01, 'her eyes on the last card');
  });
}
