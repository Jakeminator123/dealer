// node --test dealer3d/tests/two-hand.test.ts
// The two-hand deal from pose 2.3 (dealer3d/data/giv-fran-2-3-p4.json: one card to seat 4; giv-fran-2-3-alla.json: the
// seven seats and the dealer's own card in one sweep), laid by dealer3d/tools/deal-film.ts: it begins in the pose, every
// joint stays within what a person can do, the two hands are one size, the card is a real card that goes end over end
// about its short side and is never a frame from upright to lying, and the film ends still with her fingertips on the
// card. And that the data files are what the code lays today. Needs no media.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CARD, TABLE_LENS, add, filmEye, length, mul, see, sub, type Vec3} from '../../src/table-lens.ts';
import {FINGERS, LIMITS, joints, type ArmPose} from '../src/capture.ts';
import {sideSeen, type CardPose} from '../src/deal.ts';
import {REAL_DEAL, type RealCard} from '../src/real-deal.ts';
import {shoeHolds, startOnAnchor, twoHandDeal, type Pace} from '../src/two-hand.ts';
import {track} from '../src/hand-pose.ts';

type Limb = {s: Vec3; e: Vec3; w: Vec3; k: number; p: Vec3[]};
type Beat = {to: string; a: number; b: number; c: number; d: number; e: number; l: number; turned: number; f: number; g: number; h: number; i: number | null};
type Deal = {to: string[]; places?: {id: string; at: Vec3; pixel: {x: number; y: number}}[]; rightAt: {x: number; y: number; yaw: number} | null; pace: {real: RealCard; flowing: boolean; leftBack: number; elbows: {L: Vec3; R: Vec3}; meeting?: boolean; push?: number; swing?: number} | null; elbowForced: string[]; fps: number; frameCount: number; palm: number; throughShoe: number; beats: Beat[]; turns: {axis: Vec3; angle: number}[]; laid: {from: number; c: Vec3; l: Vec3; n: Vec3}[]; frames: {card: {c: Vec3; l: Vec3; n: Vec3; id: number}; L: Limb; R: Limb; h: Vec3; g: Vec3}[]};
const load = async (name: string) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
// Each file carries the places it was laid for (dealer3d/tools/deal-film.ts writes them), so the tests do not read placements/default.json, which Jakob's saved plan changes.
const pose = await load('till-ankare-2-3'), start = pose.frames[pose.frameCount - 1];
const DEALS: [string, Deal][] = [['giv-fran-2-3-p5', await load('giv-fran-2-3-p5')], ['giv-fran-2-3-p5-langsam', await load('giv-fran-2-3-p5-langsam')], ['giv-fran-2-3-p5-langsam-d', await load('giv-fran-2-3-p5-langsam-d')], ['giv-fran-2-3-p4', await load('giv-fran-2-3-p4')], ['giv-fran-2-3-alla', await load('giv-fran-2-3-alla')]];
const ONE: Record<string, string> = {'giv-fran-2-3-p5': 'P5.C1', 'giv-fran-2-3-p5-langsam': 'P5.C1', 'giv-fran-2-3-p5-langsam-d': 'P5.C1', 'giv-fran-2-3-p4': 'P4.C1'};
const eye = filmEye(TABLE_LENS), placeOf = (data: Deal, id: string): {at: Vec3; pixel: {x: number; y: number}} => { const p = data.places?.find(p => p.id === id); if (!p) throw Error(`The file has no place ${id}: lay it again with dealer3d/tools/deal-film.ts.`); return p; }, arm = (a: Limb): ArmPose => ({shoulder: a.s, elbow: a.e, wrist: a.w, stretch: a.k, points: a.p});
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const card = (c: {c: Vec3; l: Vec3; n: Vec3}): CardPose => ({centre: c.c, long: c.l, normal: c.n, across: cross(c.n, c.l)});
const unwrap = (v: number[]) => { const o = [v[0]]; for (let i = 1; i < v.length; i++) { let d = v[i] - v[i - 1]; while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i - 1] + d); } return o; };
/** The turn between two poses of a card: its axis and its angle in degrees. */
const turnBetween = (a: CardPose, b: CardPose) => { const A = [a.long, a.normal, a.across], B = [b.long, b.normal, b.across], R = [0, 1, 2].map(r => [0, 1, 2].map(c => A.reduce((s, ak, k) => s + B[k][r] * ak[c], 0)));
  const anti: Vec3 = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]], n = length(anti) || 1; return {axis: [anti[0] / n, anti[1] / n, anti[2] / n] as Vec3, angle: Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))) * 180 / Math.PI}; };
const bones = (p: Vec3[]) => FINGERS.flatMap(c => [0, 1, 2].map(k => length(sub(p[c[k + 1]], p[c[k]])))).concat([length(sub(p[5], p[0])), length(sub(p[17], p[0])), length(sub(p[5], p[17]))]);

const pilot: Deal & {planSha256: string; actualIntent: unknown} = await load('giv-fran-2-3-p4-grepp-pilot-g');
const landingPilot: typeof pilot = await load('giv-fran-2-3-p4-grepp-pilot-h');
const pilotBeats = pilot.beats[0], closed = Math.ceil(pilotBeats.l + 5), firstContact = Math.floor(pilotBeats.g);
// pointHand in stage.ts draws spheres at the joints and cylinders along the bones. The file stores coordinates to 0.1 mm.
const sphereRadius = (i: number) => i === 0 ? 0.0125 : [1, 5, 9, 13, 17].includes(i) ? 0.0105 : 0.0082;
const boneRadius = (finger: number, segment: number) => finger === 0 ? 0.0088 - segment * 0.0006 : 0.0078 - segment * 0.0007;
const tolerance = 0.00025;
const cardCoordinates = (p: Vec3, c: CardPose): Vec3 => {
  const d = sub(p, c.centre);
  return [dot(d, c.long), dot(d, c.normal), dot(d, c.across)];
};
const distanceToCard = (p: Vec3) => Math.hypot(
  Math.max(0, Math.abs(p[0]) - CARD.height / 2),
  Math.max(0, Math.abs(p[1]) - CARD.thickness / 2),
  Math.max(0, Math.abs(p[2]) - CARD.width / 2),
);
/** Minimise the convex distance from the axis of the rendered bone to the card box. */
function closestBone(a: Vec3, b: Vec3): number {
  const span = sub(b, a), distance = (t: number) => distanceToCard(add(a, mul(span, t)));
  let min = 0, max = 1;
  for (let i = 0; i < 30; i++) {
    const one = (2 * min + max) / 3, two = (min + 2 * max) / 3;
    if (distance(one) < distance(two)) max = two;
    else min = one;
  }
  return Math.min(distance(0), distance(1), distance((min + max) / 2));
}

// The sweep (2026-11-20): the take made on H was failed for a card standing on its edge at the place while the grip let go and the hand turned back.
const sweepPilot: typeof pilot = await load('giv-fran-2-3-p4-grepp-svep');
// The shared hand change (2026-11-20): in the takes made on S the card lay alone between the hands and the shoe's window went black behind her left hand.
const sharedPilot: typeof pilot = await load('giv-fran-2-3-p4-grepp-svep-b');
// The deal from the upright pose (2026-11-20): in anchor 2.3 C she stands upright and her right hand lies further from the shoe,
// so this film begins on the last frame of till-ankare-2-3-c, her trunk leans in only while the card is laid, and her right hand
// goes to the card in one movement (Pace: base, takeAt, leanFrom, seenForearm, clearTrunk, shared.soft).
const uprightPose = await load('till-ankare-2-3-c'), uprightStart = uprightPose.frames[uprightPose.frameCount - 1];
const uprightPilot: typeof pilot & {poseFilm?: string; hip: Vec3} = await load('giv-fran-2-3-p4-grepp-svep-c');
// V: U with her left hand flat and low the whole way, so that its forearm is as long in the picture as in the pose (dealer3d/data/giv-fran-2-3-p4-grepp-svep-d.json).
const lowPilot: typeof uprightPilot = await load('giv-fran-2-3-p4-grepp-svep-d');
// The first card of the other seats, laid as V (2026-11-21, on Jakob's yes to V: the other seats are made the same way), with
// what each seat asks. Seats 1 to 3 lie along the table to her right: her left hand lets go with the card 3 cm on its way
// (shared `gone`; else the card carries the riding hand off until its forearm points at the camera), and her right elbow's way
// is chosen over the whole film (`steady`; else it hops up over the table's edge as her hand slides out along it). Seat 1 is
// taken 12 px nearer the players (else her right wrist bends past 95 degrees at the place). Seat 5 is taken 30 px to the left
// and 8 px nearer her, her trunk content with 50 cm reach (else it leans 14 degrees) and her left hand home in a lower arc.
// Seats 6 and 7 are not laid: before the shoe her right arm reaches them only across her body.
const seatPilots = await Promise.all([1, 2, 3, 5].map(async n => [`P${n}`, await load(`giv-fran-2-3-p${n}-grepp-svep-d`) as typeof uprightPilot] as const));
for (const [name, film, grip] of [['G', pilot, true], ['H', landingPilot, 'landing'], ['S', sweepPilot, 'sweep'], ['T', sharedPilot, 'sweep']] as const) {
  test(`P4 pilot ${name} reproduces from its recorded place and pace`, () => {
    assert.deepEqual(film.to, ['P4.C1']);
    assert.equal(film.planSha256, 'dbb558211411ad4a2a45ee1047e9794ab39912084a0ad6717a020e443d2f7e7c');
    assert.deepEqual(film.actualIntent, {takeHand: 'LH', startSide: 'BACK', endSide: 'FRONT', pass: true, turn: true, grip: 'DRAG', turnAt: 'AIR', flipAxis: 'LONG_EDGE'});
    const pace = film.pace as (Pace & {real: RealCard}) | null;
    assert.equal(pace?.contactGrip, grip);
    assert.equal(!!pace?.sharedChange, name === 'T');
    assert.ok(pace && film.rightAt);
    const anchored = startOnAnchor(TABLE_LENS, start, film.rightAt, film.rightAt.yaw);
    const laid = twoHandDeal(TABLE_LENS, anchored, [{id: 'P4.C1', at: placeOf(film, 'P4.C1').at, real: pace.real}], film.beats[0].a, film.fps, film.frameCount, pace);
    assert.deepEqual(laid.forced, []);
    assert.equal(film.frames.length, laid.frames.length);
    for (const [i, was] of film.frames.entries()) {
      const now = laid.frames[i];
      const points = (f: typeof was) => [f.card.c, f.card.l, f.card.n, f.h, f.g, f.L.s, f.L.e, f.L.w, ...f.L.p, f.R.s, f.R.e, f.R.w, ...f.R.p];
      const expected = points(was);
      points(now).forEach((p, j) => assert.ok(length(sub(p, expected[j])) <= 0.0001, `frame ${i}, point ${j} no longer matches the pilot`));
    }
  });
}

function assertCardClearance(points: Vec3[], at: string, pinching: boolean) {
  points.forEach((p, j) => {
    if (j !== 8 && !(pinching && j === 4)) assert.ok(distanceToCard(p) + tolerance >= sphereRadius(j), `${at}: free joint ${j} cuts through the card`);
  });
  FINGERS.forEach((finger, j) => {
    for (let k = 0; k < 3; k++) assert.ok(closestBone(points[finger[k]], points[finger[k + 1]]) + tolerance >= boneRadius(j, k),
      `${at}: bone ${finger[k]}–${finger[k + 1]} cuts through the card`);
  });
}

test('P4 thumb and index pads stay on opposite card surfaces through the turn and first felt contact', () => {
  assert.ok(closed <= 29 && firstContact >= 45, 'the measured interval includes the visible turn');
  for (let i = closed; i <= firstContact; i++) {
    const f = pilot.frames[i], c = card(f.card), at = `frame ${i}`;
    assert.ok(Math.abs(length(c.long) - 1) < 0.0002 && Math.abs(length(c.normal) - 1) < 0.0002 && Math.abs(dot(c.long, c.normal)) < 0.0002, `${at}: rigid card axes`);
    const local = f.R.p.map(p => cardCoordinates(p, c));
    for (const [tip, side] of [[4, 1], [8, -1]]) {
      const [along, normal, across] = local[tip], expected = CARD.thickness / 2 + sphereRadius(tip);
      assert.ok(Math.abs(normal * side - expected) < tolerance, `${at}: fingertip ${tip} is off its surface or through it`);
      assert.ok(Math.abs(along - (CARD.height / 2 - 0.005)) < tolerance && Math.abs(across) < tolerance, `${at}: fingertip ${tip} slid off its place at the edge`);
    }
    assertCardClearance(local, at, true);
  }
  assert.ok(pilot.frames[closed].card.n[1] < -0.99, 'face down when the grip closes');
  const touchdown = card(pilot.frames[firstContact].card);
  const lowest = touchdown.centre[1] - (CARD.height * Math.abs(touchdown.long[1]) + CARD.width * Math.abs(touchdown.across[1]) + CARD.thickness * Math.abs(touchdown.normal[1])) / 2;
  assert.ok(Math.abs(lowest) <= tolerance && touchdown.normal[1] > 0.8, 'the far edge meets the felt with the face up and the grip still closed');
  assert.deepEqual(pilot.frames.at(-1)!.card.n, [0, 1, 0]);
});

test('P4 H keeps the index at the same point through release and flat landing, with a low elbow', () => {
  const beat = landingPilot.beats[0], begin = Math.ceil(beat.l + 5), flat = Math.ceil(beat.h);
  const atFelt = Math.floor(beat.g), tipHeight = CARD.thickness / 2 + sphereRadius(8);
  for (let i = begin; i <= flat; i++) {
    const frame = landingPilot.frames[i], c = card(frame.card), at = `H frame ${i}`;
    const local = frame.R.p.map(p => cardCoordinates(p, c));
    const [along, side, across] = local[8];
    assert.ok(Math.abs(side - tipHeight) < tolerance && Math.abs(along - (CARD.height / 2 - 0.005)) < tolerance &&
      Math.abs(across + 0.012) < tolerance, `${at}: index lost its contact with the card's face`);
    if (i <= atFelt) assert.ok(Math.abs(local[4][1] + tipHeight) < tolerance, `${at}: thumb is off the underside`);
    assertCardClearance(local, at, i <= atFelt);
    assert.ok(frame.R.e[1] <= 0.085, `${at}: elbow lifts beyond 8.5 cm above the felt`);
    assert.ok(length(sub(frame.R.e, landingPilot.frames[i - 1].R.e)) <= 0.03, `${at}: elbow jumps more than 3 cm in one frame`);
  }
  const clear = landingPilot.frames[atFelt + 3], clearThumb = cardCoordinates(clear.R.p[4], card(clear.card));
  assert.ok(clearThumb[0] > CARD.height / 2 + sphereRadius(4), 'thumb moves outside the short edge before rising');
  const flatPose = card(landingPilot.frames[flat].card);
  assert.deepEqual(flatPose.normal, [0, 1, 0]);
  assert.ok(Math.abs(flatPose.centre[1] - CARD.thickness / 2) < tolerance, 'the card lies flat on the felt');
});

for (const [name, film, closes] of [['P4 S', sweepPilot, 5], ['P4 T', sharedPilot, 1], ['P4 U', uprightPilot, 1], ['P4 V', lowPilot, 1], ...seatPilots.map(([seat, film]) => [seat, film, 1] as const)] as const) test(`${name} keeps the pinch through the whole turn, never holds the card still, and lays it without turning the hand back`, () => {
  const beat = film.beats[0], grasp = Math.ceil(beat.l + closes), atFelt = Math.floor(beat.g), flat = Math.ceil(beat.h), last = film.frameCount - 1;
  const tipHeight = CARD.thickness / 2 + sphereRadius(8), frames = film.frames;
  const backUp = (p: Vec3[]) => { const n = cross(sub(p[5], p[0]), sub(p[17], p[0])); return Math.acos(Math.max(-1, Math.min(1, n[1] / length(n) * Math.sign(cross(sub(frames[0].R.p[5], frames[0].R.p[0]), sub(frames[0].R.p[17], frames[0].R.p[0]))[1])))) * 180 / Math.PI; };
  const tilt = (i: number) => Math.acos(Math.min(1, Math.abs(frames[i].card.n[1]))) * 180 / Math.PI;
  assert.ok(frames[grasp].card.n[1] < -0.99, 'face down when the grip closes');
  for (let i = grasp; i <= last; i++) {
    const c = card(frames[i].card), at = `${name} frame ${i}`, local = frames[i].R.p.map(p => cardCoordinates(p, c)), [along, side, across] = local[8];
    assert.ok(Math.abs(side - tipHeight) < tolerance && Math.abs(along - (CARD.height / 2 - 0.005)) < tolerance && Math.abs(across + 0.012) < tolerance, `${at}: index lost its point on the card's face`);
    if (i <= atFelt) assert.ok(Math.abs(local[4][1] + tipHeight) < 0.0006 && Math.hypot(local[4][0] - along, local[4][2] - across) < 0.0015, `${at}: thumb is off its point under the index`);
    frames[i].R.p.forEach((p, k) => assert.ok(p[1] + 0.001 >= sphereRadius(k), `${at}: joint ${k} goes under the felt`));
    assert.ok(length(sub(frames[i].R.e, frames[i - 1].R.e)) <= 0.03, `${at}: elbow jumps more than 3 cm in one frame`);
  }
  // The turn is whole inside the grip: when the far edge meets the felt the card is face up and tipped no more than the thumb under its near edge needs.
  assert.ok(frames[atFelt].card.n[1] > 0.97 && tilt(atFelt) <= 13, 'the card comes to the felt face up, tipped at most 13 degrees, the grip still closed');
  for (let i = atFelt; i <= flat; i++) assert.ok(tilt(i) <= tilt(i - 1) + 0.01 || i === atFelt, `${name} frame ${i}: the card is raised again after it met the felt`);
  // No frame from the first movement until the card lies in which no corner of the card moves a millimetre.
  const corners = (i: number) => { const c = card(frames[i].card); return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([x, y]) => add(c.centre, add(mul(c.long, x * CARD.height / 2), mul(c.across, y * CARD.width / 2)))); };
  for (let i = Math.ceil(beat.b) + 2; i < flat; i++) { const a = corners(i - 1), b = corners(i); assert.ok(Math.max(...a.map((p, k) => length(sub(b[k], p)))) >= 0.001, `${name} frame ${i}: the card stands still`); }
  // The hand is palm down when the card meets the felt and stays so: nothing is turned back after the card lies.
  for (let i = atFelt; i <= last; i++) assert.ok(backUp(frames[i].R.p) <= 12, `${name} frame ${i}: the hand is turned ${backUp(frames[i].R.p).toFixed(0)} degrees from palm down`);
  const flatPose = card(frames[flat].card);
  assert.deepEqual(flatPose.normal, [0, 1, 0]);
  assert.ok(Math.abs(flatPose.centre[1] - CARD.thickness / 2) < tolerance, 'the card lies flat on the felt');
  assert.deepEqual(frames[last].R.p, frames[flat].R.p, 'the hand lies still on the card once it lies');
  assert.deepEqual(frames[last].R, frames[flat + 3].R, 'the elbow has settled three frames after the card lies');
});

test('P4 T: both hands have the card at the hand change, and her left hand keeps out of the camera\'s line to the window of the shoe', () => {
  const beat = sharedPilot.beats[0], grasp = Math.ceil(beat.l + 1), frames = sharedPilot.frames, reach = CARD.thickness / 2 + sphereRadius(8) + 0.001;
  const onCard = (i: number, p: Vec3) => { const [along, up, across] = cardCoordinates(p, card(frames[i].card)); return Math.abs(up) <= reach && Math.abs(along) <= CARD.height / 2 && Math.abs(across) <= CARD.width / 2; };
  // Her left forefinger rides on the card from the shoe until her right forefinger and thumb have had it for five frames (four of the film's 24 a second).
  const both = frames.map((f, i) => onCard(i, f.L.p[8]) && onCard(i, f.R.p[8]) && onCard(i, f.R.p[4]) ? i : -1).filter(i => i >= 0);
  assert.deepEqual(both, [grasp, grasp + 1, grasp + 2, grasp + 3, grasp + 4, grasp + 5]);
  for (let i = Math.ceil(beat.b) + 6; i <= grasp + 5; i++) assert.ok(onCard(i, frames[i].L.p[8]), `frame ${i}: her left forefinger is off the card before her right hand has it`);
  for (const i of both) assert.ok(length(sub(frames[i].card.c, frames[i - 1].card.c)) >= 0.001, `frame ${i}: the card stands still while both hands have it`);
  // The card in the shoe's window (the bank's picture, x 1225 to 1265 and y 775 to 855 of the box the films are measured in):
  // once the dealt card is out, no more of her left hand is before it than when the hand rests on the shoe. S had six joints there.
  const before = (f: typeof frames[number]) => f.L.p.filter(p => { const q = see(eye, p)!; return q.x >= 1225 && q.x <= 1265 && q.y >= 775 && q.y <= 855; }).length;
  for (let i = Math.ceil(beat.c); i < frames.length; i++) assert.ok(before(frames[i]) <= before(frames[0]) + 1, `frame ${i}: ${before(frames[i])} joints of her left hand are before the shoe's window`);
  assert.ok(Math.max(...sweepPilot.frames.slice(Math.ceil(beat.c)).map(before)) > before(frames[0]) + 1, 'the measure tells S from T');
  // Her left hand is back on the shoe, as it lay, no sooner than half a second after it let go: no snatch.
  const home = frames.findIndex((f, i) => i > grasp + 5 && length(sub(f.L.w, frames[0].L.w)) < 0.001);
  assert.ok(home >= grasp + 5 + 15 && home < frames.length, `her left hand is back at frame ${home}`);
  assert.deepEqual(frames[frames.length - 1].L.p, frames[0].L.p);
});

for (const [name, film, to] of [['P4 U', uprightPilot, 'P4.C1'], ['P4 V', lowPilot, 'P4.C1'], ...seatPilots.map(([seat, film]) => [seat, film, `${seat}.C1`] as const)] as const) test(`${name} begins on the last frame of the upright pose film and reproduces from its recorded pace`, () => {
  const pace = film.pace as (Pace & {real: RealCard}) | null;
  assert.deepEqual(film.to, [to]);
  assert.equal(film.poseFilm, 'till-ankare-2-3-c');
  assert.equal(film.rightAt, null);
  assert.ok(pace && pace.contactGrip === 'sweep' && pace.sharedChange && pace.shared?.soft && pace.takeAt && pace.seenForearm && pace.clearTrunk);
  assert.deepEqual(pace.base, [uprightPose.body.lean, uprightPose.body.twist]);
  assert.deepEqual(pace.base, [0, 0]);
  // The first frame is the pose film's last, to the digit: nothing of her moves across the join.
  const first = film.frames[0];
  assert.deepEqual([first.L, first.R, first.h], [uprightStart.L, uprightStart.R, uprightStart.h]);
  assert.ok(length(sub(first.g, uprightStart.g)) < 1e-9, 'her eyes are where the pose film left them');
  assert.deepEqual(film.frames[1].R, first.R, 'her right hand lies still until the card moves');
  const place = placeOf(film, to), laid = twoHandDeal(TABLE_LENS, {L: uprightStart.L, R: uprightStart.R, h: uprightStart.h, g: uprightStart.g}, [{id: to, at: place.at, real: pace.real}], film.beats[0].a, film.fps, film.frameCount, pace);
  assert.deepEqual(laid.forced, []);
  assert.equal(film.frames.length, laid.frames.length);
  const points = (f: typeof first) => [f.card.c, f.card.l, f.card.n, f.h, f.g, f.L.s, f.L.e, f.L.w, ...f.L.p, f.R.s, f.R.e, f.R.w, ...f.R.p];
  for (const [i, was] of film.frames.entries()) { const expected = points(was); points(laid.frames[i]).forEach((p, j) => assert.ok(length(sub(p, expected[j])) <= 0.0001, `frame ${i}, point ${j} no longer matches the film`)); }
  // The card ends where the plan the film was laid from has its place, on the felt and on the pixel.
  const end = film.frames[film.frames.length - 1].card.c, seen = see(eye, end)!;
  assert.ok(length(sub(end, [place.at[0], CARD.thickness / 2, place.at[2]])) < tolerance && Math.hypot(seen.x - place.pixel.x, seen.y - place.pixel.y) < 0.5, `the card ends ${(Math.hypot(seen.x - place.pixel.x, seen.y - place.pixel.y)).toFixed(2)} px from its place`);
});

// (bounds that differ: joints of her left hand before the window over the number at rest; the least angle of her left forearm to the line of sight;
// how many frames after the grasp her left fingers are still on the card, V's hand not lifting but letting the card slide out from under it; how far
// she has leaned in at the end, less the nearer the seat lies to her right; the most her right wrist changes speed in a frame; and how many frames
// after letting go her left hand is home at the earliest. At seats 1 to 3 her right wrist brakes where the card leaves the table's edge for its
// place, 9.1 mm in a frame at seat 1, 7.0 at seat 2 and 6.0 at seat 3 against at most 5 at seats 4 and 5: it is in their films, not hidden)
const seatFilm = Object.fromEntries(seatPilots);
for (const [name, film, windowMore, foreLeast, bothFor, leanLeast, brake, homeAfter] of [['P4 U', uprightPilot, 1, 24, 5, 7, 0.005, 30], ['P4 V', lowPilot, 3, 38, 8, 7, 0.005, 30],
  ['P1', seatFilm.P1, 2, 38, 6, 7, 0.0092, 29], ['P2', seatFilm.P2, 2, 38, 7, 5, 0.0071, 29], ['P3', seatFilm.P3, 3, 38, 7, 2.5, 0.0061, 30], ['P5', seatFilm.P5, 2, 38, 8, 7, 0.005, 29]] as const) test(`${name}: upright at the start, a calm lean while the card is laid, one calm movement to the card, both hands at the change with the pinch in sight, and arms that are whole in the picture`, () => {
  const frames = film.frames, beat = film.beats[0], grasp = Math.ceil(beat.l + 1), pace = film.pace as Pace, deg = 180 / Math.PI;
  // Her trunk: upright until the frame the film names, then toward the place without swaying back, never more than 9 degrees and never more than a third of a degree in a frame.
  const lean = frames.map(f => { const up = sub(mul(add(f.L.s, f.R.s), 0.5), film.hip); return Math.acos(up[1] / length(up)) * deg; });
  assert.ok(lean[0] < 0.05, 'she stands upright in the first frame');
  for (let i = 1; i < frames.length; i++) { const step = lean[i] - lean[i - 1], at = `frame ${i}`;
    assert.ok(i > pace.leanFrom! || Math.abs(step) < 1e-9, `${at}: her trunk moves before the lean begins`);
    assert.ok(step > -1e-6 && step <= 0.35 && lean[i] <= 9, `${at}: her trunk leans ${lean[i].toFixed(1)} degrees, ${step.toFixed(2)} more than the frame before`); }
  assert.ok(lean[frames.length - 1] > leanLeast && Math.abs(lean[frames.length - 1] - lean[Math.ceil(beat.g)]) < 1e-6, 'she has leaned in when the card meets the felt and stays so');
  // Her right hand: from the frame the card moves it is on its way to the card and does not stop or start with a jerk (T: 14 mm from one frame to the next).
  const speed = (i: number) => length(sub(frames[i].R.w, frames[i - 1].R.w));
  for (let i = beat.b + 3; i < grasp; i++) assert.ok(speed(i) >= 0.004, `frame ${i}: her right hand waits on its way to the card`);
  for (let i = beat.b + 1; i <= Math.floor(beat.g); i++) assert.ok(Math.abs(speed(i) - speed(i - 1)) <= brake, `frame ${i}: her right wrist changes speed by ${(Math.abs(speed(i) - speed(i - 1)) * 1000).toFixed(1)} mm in one frame`);
  // Both hands have the card for six frames or more in a row (five of the film's 24 a second), until her left lets go, and the card moves all the while.
  const reach = CARD.thickness / 2 + sphereRadius(8) + 0.001, onCard = (i: number, p: Vec3) => { const [along, up, across] = cardCoordinates(p, card(frames[i].card)); return Math.abs(up) <= reach && Math.abs(along) <= CARD.height / 2 && Math.abs(across) <= CARD.width / 2; };
  const both = frames.map((f, i) => onCard(i, f.L.p[8]) && onCard(i, f.R.p[8]) && onCard(i, f.R.p[4]) ? i : -1).filter(i => i >= 0);
  assert.ok(both.length >= 6 && both[0] <= grasp && both[both.length - 1] === grasp + bothFor && both.every((i, j) => j === 0 || i === both[j - 1] + 1), `both hands have the card in frames ${both.join(', ')}`);
  for (const i of both) assert.ok(length(sub(frames[i].card.c, frames[i - 1].card.c)) >= 0.001, `frame ${i}: the card stands still while both hands have it`);
  // The pinch is in sight at the change: in the bank's picture her right forefinger and thumb are left of every joint of her left hand, 20 px or more from the nearest.
  const px = (p: Vec3) => see(eye, p)!;
  for (const i of both) { const left = frames[i].L.p.map(px); for (const k of [4, 8]) { const tip = px(frames[i].R.p[k]);
    assert.ok(left.every(q => q.x > tip.x && Math.hypot(q.x - tip.x, q.y - tip.y) >= 20), `frame ${i}: her left hand is before the tip of right finger ${k}`); } }
  // The shoe's window: once the dealt card is out, no more of her left hand is before it than when the hand rests on the shoe.
  const before = (f: typeof frames[number]) => f.L.p.filter(p => { const q = px(p); return q.x >= 1225 && q.x <= 1265 && q.y >= 775 && q.y <= 855; }).length;
  for (let i = Math.ceil(beat.c); i < frames.length; i++) assert.ok(before(frames[i]) <= before(frames[0]) + windowMore, `frame ${i}: ${before(frames[i])} joints of her left hand are before the shoe's window`);
  // Her left hand is back on the shoe, as it lay, no sooner than about a second after it let go, and never faster than 2 cm a frame.
  const home = frames.findIndex((f, i) => i > grasp + 5 && length(sub(f.L.w, frames[0].L.w)) < 0.001);
  assert.ok(home >= grasp + 5 + homeAfter && home < frames.length, `her left hand is back at frame ${home}`);
  assert.deepEqual(frames[frames.length - 1].L.p, frames[0].L.p);
  for (let i = 1; i < frames.length; i++) assert.ok(length(sub(frames[i].L.w, frames[i - 1].L.w)) <= 0.02, `frame ${i}: her left hand is snatched away`);
  // Whole arms in the picture: her left forearm is never nearer the camera's line of sight than 24 degrees (a hand without an arm), and
  // no forearm goes through her trunk as the stage draws it (an egg from the hip to the shoulders; 1 is its surface, T went in to 0.82).
  const lerp = (a: Vec3, b: Vec3, t: number) => add(a, mul(sub(b, a), t)), unit = (a: Vec3) => mul(a, 1 / length(a));
  for (const [i, f] of frames.entries()) { const fore = sub(f.L.w, f.L.e), sight = sub(f.L.w, eye.position), angle = Math.acos(Math.abs(dot(fore, sight)) / length(fore) / length(sight)) * deg;
    assert.ok(angle >= foreLeast, `frame ${i}: her left forearm is ${angle.toFixed(0)} degrees from the line of sight`);
    const mid = mul(add(f.R.s, f.L.s), 0.5), across = sub(f.L.s, f.R.s), x = unit(across), up = sub(mid, film.hip), z = unit(cross(x, unit(up))), y = cross(z, x), centre = lerp(film.hip, mid, 0.52);
    const out = (p: Vec3) => { const d = sub(p, centre); return Math.hypot(dot(d, x) / (length(across) * 0.47), dot(d, y) / (length(up) * 0.56), dot(d, z) / 0.095); };
    for (const side of ['L', 'R'] as const) for (const s of [0, 0.2, 0.4, 0.6, 0.8]) assert.ok(out(lerp(f[side].e, f[side].w, s)) >= 0.97, `frame ${i}: the ${side} forearm goes through her trunk`); }
});

// A film model drew U's left arm as ending at the elbow where the doll's forearm was two thirds of its length in the picture and its hand hung, fingers down, from a wrist lifted over the card.
const leftPx = (p: Vec3) => see(eye, p)!, leftSeen = (f: typeof lowPilot.frames[number]) => { const a = leftPx(f.L.e), b = leftPx(f.L.w); return Math.hypot(a.x - b.x, a.y - b.y); };
for (const [name, film] of [['P4 V', lowPilot], ...seatPilots] as const) test(`${name}: her left forearm is as long in the picture as in the pose in every frame, and her left hand goes out and home flat and low, its back up`, () => {
  const unit = (a: Vec3) => mul(a, 1 / length(a)), back = (f: typeof lowPilot.frames[number]) => unit(cross(sub(f.L.p[5], f.L.w), sub(f.L.p[17], f.L.w))), rest = film.frames[0];
  assert.ok(back(rest)[1] > 0.9, 'at rest on the shoe the back of her left hand is up');
  for (const [i, f] of film.frames.entries()) { const at = `frame ${i}`, b = back(f), fingers = unit(sub(f.L.p[9], f.L.w));
    assert.ok(leftSeen(f) >= 0.95 * leftSeen(rest), `${at}: her left forearm is ${leftSeen(f).toFixed(0)} px long in the picture, ${leftSeen(rest).toFixed(0)} in the first frame`);
    assert.ok(b[1] >= 0.9 && dot(b, unit(sub(eye.position, f.L.w))) >= 0.3, `${at}: the back of her left hand is turned from up and from the camera`);
    assert.ok(Math.asin(-fingers[1]) * 180 / Math.PI <= 2, `${at}: her left fingers point down from the wrist`);
    assert.ok(f.L.w[1] <= rest.L.w[1] + 0.001, `${at}: her left wrist is ${(f.L.w[1] * 100).toFixed(1)} cm over the felt, higher than at rest on the shoe`); }
});

test('P4 V: the measures tell U from V, and only her left arm differs from U', () => {
  const rest = lowPilot.frames[0];
  assert.ok(Math.min(...uprightPilot.frames.map(leftSeen)) < 0.7 * leftSeen(uprightPilot.frames[0]) && Math.max(...uprightPilot.frames.map(f => f.L.w[1])) > rest.L.w[1] + 0.1, 'the measures tell U from V');
  // Nothing else is changed from U: her right arm, the card, her head and her trunk are the same frame for frame.
  for (const [i, f] of lowPilot.frames.entries()) { const u = uprightPilot.frames[i]; assert.deepEqual([f.R, f.card, f.h, f.g, f.L.s], [u.R, u.card, u.h, u.g, u.L.s], `frame ${i}: more than her left arm differs from U`); }
});

test('the H timing can lay its own P4.C2 card with independent IK and a frozen placement plan', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'dealer-p4c2-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const target = (u: number, v: number, pass: boolean) => ({
    geometry: {native: {u, v, width: 0.0492, height: 0.0612, angle: 0, taper: 0.87}},
    intent: {takeHand: 'LH', startSide: 'BACK', endSide: 'FRONT', pass, turn: true, grip: 'PINCH', turnAt: 'AIR', flipAxis: 'FREE'},
  });
  const first = target(0.4858844998096943, 0.06106632779165577, true);
  const second = target(0.5141155001903057, 0.07022096973605096, false);
  const bytes = JSON.stringify({targets: {'P4.C1': first, 'P4.C2': second}}), plan = join(temp, 'plan.json'), out = join(temp, 'c2.json');
  await writeFile(plan, bytes);
  const cli = fileURLToPath(new URL('../tools/deal-film.ts', import.meta.url));
  const args = [cli, '--to', 'P4.C2', '--plan', plan, '--seconds', '4', '--beats', '4,15,20,36,22,45,58,70',
    '--right-at', '1180,887,83', '--meet', '1', '--push', '0.004', '--single', '1', '--carry', '0.045', '--turned-at', '0.01',
    '--roll', '1', '--tuck', '300', '--out', out];
  execFileSync(process.execPath, [...args, '--contact-grip', 'landing']);
  const result = JSON.parse(await readFile(out, 'utf8')) as typeof pilot & {trial: {
    timingTarget: string; placementTarget: string; planIntent: typeof second.intent;
    ik: {body: Vec3; endElbows: boolean; wristDegrees: {L: number; R: number}; wristLimitDegrees: number};
  }};
  assert.deepEqual(result.to, ['P4.C2']);
  assert.deepEqual(result.beats[0], {...landingPilot.beats[0], to: 'P4.C2'});
  assert.equal(result.pace?.real.place, 'S4');
  assert.deepEqual(result.frames[0], landingPilot.frames[0]);
  assert.deepEqual(result.actualIntent, landingPilot.actualIntent);
  assert.equal(result.trial.timingTarget, 'P4.C1');
  assert.equal(result.trial.placementTarget, 'P4.C2');
  assert.deepEqual(result.trial.planIntent, second.intent);
  assert.deepEqual(result.trial.ik.body, [0, 0, 2]);
  assert.equal(result.trial.ik.endElbows, false);
  assert.equal(result.trial.ik.wristLimitDegrees, LIMITS.wrist);
  assert.equal(await readFile(plan, 'utf8'), bytes);
  assert.equal(result.planSha256, createHash('sha256').update(bytes).digest('hex'));

  const beat = result.beats[0], center = placeOf(result, 'P4.C2').at;
  const beforeTurn = result.frames[Math.ceil(beat.l + 5)].card;
  assert.ok(Math.abs(Math.abs(dot(result.turns[0].axis, beforeTurn.l)) - 1) < tolerance, 'default yaw gives a long-edge turn');
  assert.ok(length(sub(center, placeOf(landingPilot, 'P4.C1').at)) > 0.04);
  assert.deepEqual(result.frames.at(-1)?.card, result.frames[beat.h].card);
  assert.ok(length(sub(result.frames[beat.h].card.c, [center[0], CARD.thickness / 2, center[2]])) < tolerance);
  assert.deepEqual(result.elbowForced, []);
  assert.equal(result.throughShoe, 0);
  for (const [i, frame] of result.frames.entries()) {
    for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
      const j = joints(arm(frame[side]), sign);
      assert.ok(j.wrist <= LIMITS.wrist && j.elbow <= LIMITS.elbow, `${side} frame ${i}: wrist or elbow out of range`);
    }
    if (i < Math.ceil(beat.l + 5) || i > Math.ceil(beat.h)) continue;
    const points = frame.R.p.map(p => cardCoordinates(p, card(frame.card)));
    const [along, height, across] = points[8];
    assert.ok(Math.abs(along - (CARD.height / 2 - 0.005)) < tolerance && Math.abs(height - (CARD.thickness / 2 + sphereRadius(8))) < tolerance &&
      Math.abs(across + 0.012) < tolerance, `frame ${i}: index lost contact`);
    assertCardClearance(points, `C2 frame ${i}`, i <= Math.floor(beat.g));
    assert.ok(frame.R.e[1] <= 0.085 && length(sub(frame.R.e, result.frames[i - 1].R.e)) <= 0.03, `frame ${i}: elbow too high or abrupt`);
  }
  assert.throws(() => execFileSync(process.execPath, [...args, '--contact-grip', 'landing', '--end-elbows', '1'], {stdio: 'pipe'}), /wrist exceeds 95/);
  assert.throws(() => execFileSync(process.execPath, [...args, '--contact-grip', 'landing', '--hand-over-yaw', '140'], {stdio: 'pipe'}), /needs --hand-over-yaw 180/);
});

for (const [name, film] of [['P4 G', pilot], ['P4 H', landingPilot], ['P4 S', sweepPilot], ['P4 T', sharedPilot], ['P4 U', uprightPilot], ['P4 V', lowPilot], ...seatPilots] as const) test(`${name} keeps hand sizes, arm limits and clearances`, () => {
  const rightInsideShoe = shoeHolds(TABLE_LENS);
  for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
    const sizes = bones(start[side].p), twists: number[] = [];
    for (const [i, f] of film.frames.entries()) {
      const hand = f[side], j = joints(arm(hand), sign), at = `${side} frame ${i}`;
      assert.ok(j.wrist <= LIMITS.wrist && j.elbow <= LIMITS.elbow, `${at}: wrist or elbow out of range`);
      assert.ok(j.fingers.flat().every(bend => bend >= -LIMITS.fingerBack && bend <= LIMITS.fingerBend), `${at}: finger out of range`);
      assert.equal(hand.k, 1);
      assert.ok(Math.abs(length(sub(hand.s, hand.e)) - 0.29) < tolerance && Math.abs(length(sub(hand.e, hand.w)) - 0.26) < tolerance, `${at}: the arm changed size`);
      bones(hand.p).forEach((size, k) => assert.ok(Math.abs(size - sizes[k]) < tolerance, `${at}: bone ${k} changed length`));
      if (j.twist !== null) twists.push(j.twist);
      if (i >= closed) hand.p.forEach((p, k) => assert.ok(p[1] + tolerance >= sphereRadius(k), `${at}: joint ${k} goes under the felt`));
      if (side === 'R') {
        assert.ok(!hand.p.some(rightInsideShoe), `${at}: right hand hits the shoe`);
        for (const [k, p] of hand.p.entries()) for (const [m, q] of f.L.p.entries()) {
          assert.ok(length(sub(p, q)) + tolerance >= sphereRadius(k) + sphereRadius(m), `${at}: hands intersect at joints ${k},${m}`);
        }
      }
    }
    const turn = unwrap(twists);
    assert.ok(Math.max(...turn) - Math.min(...turn) <= LIMITS.twistSpan, `${side} forearm turned beyond its range`);
  }
});

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

test('the slow film in which her right hand meets the card: taken while it moves, near upright for four frames at most, laid on its place, ending on the last frame of the fast film', () => {
  const met = DEALS.find(([n]) => n === 'giv-fran-2-3-p5-langsam-d')![1], own = DEALS.find(([n]) => n === 'giv-fran-2-3-p5')![1], b = met.beats[0], N = met.frameCount, moved = (i: number) => length(sub(met.frames[i].card.c, met.frames[i - 1].card.c));
  assert.ok(met.pace?.meeting && met.pace.flowing); assert.deepEqual(met.frames[N - 1], own.frames[own.frameCount - 1], 'the same last frame, to the last number');
  // From the frame it begins to leave the shoe until it meets the felt, the card moves at least 3 mm in every frame: it never lies still on the felt.
  for (let i = Math.ceil(b.b) + 3; i < b.g; i++) assert.ok(moved(i) >= 0.003, `frame ${i}: the card moves ${(moved(i) * 1000).toFixed(1)} mm`);
  // Her right hand is closing as the card arrives: its forefinger already bending in the frame of the hand change and closed four frames on, while the far edge is still coming up.
  const at = Math.ceil(b.d), bentAt = (i: number) => Math.max(...joints(arm(met.frames[i].R), 1).fingers[1]); assert.ok(bentAt(at) > bentAt(0) + 4 && bentAt(at + 4) > bentAt(0) + 12, 'the forefinger is bending as the card arrives');
  // Near upright (within 25 degrees of plumb) in four frames at most.
  const upright = met.frames.filter((f, i) => i > b.d && i < b.g && f.card.l[1] < -Math.cos(25 * Math.PI / 180)).length; assert.ok(upright >= 2 && upright <= 4, `near upright in ${upright} frames`);
  // Laid on its place: when it meets the felt it is within 12 mm of where it lies, flat.
  const down = met.frames[Math.ceil(b.g)].card; assert.ok(length(sub(down.c, met.frames[N - 1].card.c)) < 0.012 && down.n[1] > 0.999, `it meets the felt ${(length(sub(down.c, met.frames[N - 1].card.c)) * 1000).toFixed(0)} mm from its place`);
});

test('a track goes through its keys, rests at its ends and never overshoots between two keys', () => {
  const t = track([[0, 0], [2, 1], [3, 5], [6, 5.5]]); for (const [x, y] of [[0, 0], [2, 1], [3, 5], [6, 5.5], [-1, 0], [9, 5.5]]) assert.ok(Math.abs(t(x) - y) < 1e-12);
  for (let x = 0; x < 6; x += 0.05) assert.ok(t(x + 0.05) >= t(x) - 1e-12, `falls at ${x}`); assert.ok(Math.abs(t(0.01)) < 1e-3 && Math.abs(t(5.99) - 5.5) < 1e-3, 'at rest at both ends');
});

// Versions -e and -f (one turn in her right hand alone; -f rolled about the long side, seat 1 with the body turned): the files are what the code lays today, and the card never stands still from the hand change until it meets the felt.
for (const name of ['giv-fran-2-3-p4-e', 'giv-fran-2-3-p1-e', ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'd'].map(p => `giv-fran-2-3-${p}-f`)]) { const data: Deal = await load(name), N = data.frameCount, b = data.beats[0];
  test(`${name}: the file is what the code lays today, and the card moves or turns in every frame from the hand change until it meets the felt`, () => {
    const posed = {L: start.L, R: start.R, h: start.h}, laid = twoHandDeal(TABLE_LENS, data.rightAt ? startOnAnchor(TABLE_LENS, posed, data.rightAt, data.rightAt.yaw) : posed, data.to.map(id => ({id, at: placeOf(data, id).at, real: data.pace!.real})), data.beats[0].a, data.fps, N, {...data.pace!});
    assert.deepEqual(laid.forced, data.elbowForced);
    for (let i = 0; i < N; i++) { const x = laid.frames[i], y = data.frames[i]; for (const [p, q] of [[x.card.c, y.card.c], [x.R.w, y.R.w], [x.R.e, y.R.e], [x.L.w, y.L.w]] as [Vec3, Vec3][]) assert.ok(length(sub(p, q)) < 1e-4, `frame ${i} differs: lay the file again with dealer3d/tools/deal-film.ts`); }
    for (let i = Math.ceil(b.d) + 1; i <= Math.floor(b.g); i++) { const p = data.frames[i - 1].card, q = data.frames[i].card; assert.ok(length(sub(p.c, q.c)) > 0.0005 || Math.abs(Math.abs(p.n[0] * q.n[0] + p.n[1] * q.n[1] + p.n[2] * q.n[2]) - 1) > 1e-5, `the card stands still at frame ${i}`); }
  });
}

for (const [name, data] of DEALS) {
  const N = data.frameCount, last = data.beats[data.beats.length - 1], stillFrom = Math.ceil(Math.max(last.h, last.l + 0.3 * data.fps)) + 4, of = (k: number) => data.frames.map((f, i) => f.card.id === k ? i : -1).filter(i => i >= 0);

  test(`${name}: the file is what the code lays today`, () => {
    const real = (id: string) => REAL_DEAL[id === 'D.C1' ? 7 : 7 - Number(id[1])], posed = {L: start.L, R: start.R, h: start.h}, laid = twoHandDeal(TABLE_LENS, data.rightAt ? startOnAnchor(TABLE_LENS, posed, data.rightAt, data.rightAt.yaw) : posed, data.to.map(id => ({id, at: placeOf(data, id).at, real: data.pace?.real ?? real(id)})), data.beats[0].a, data.fps, N, data.pace ? {...data.pace} : {});
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
      for (const i of raising) { const c = card(data.frames[i].card), low = c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); assert.ok(low < 0.015, `frame ${i}: the lower edge ${(low * 1000).toFixed(0)} mm up`); assert.ok(data.pace?.swing || dot(c.across, short) > 0.999, `frame ${i}: not about the short side`); }
      // In the air: every step of the turn is about the one axis the file names.
      const inAir = mine.filter(i => i - 1 > b.l + (b.turned - b.l) * 0.1 && i < b.turned); for (const i of inAir) { const step = turnBetween(card(data.frames[i - 1].card), card(data.frames[i].card)); if (step.angle > 2 && !data.pace?.swing) assert.ok(dot(step.axis, data.turns[k].axis) > 0.995, `frame ${i}: turns about another axis`); }
      assert.ok(data.turns[k].angle > 70 && data.turns[k].angle < 110, `the turn in the air is ${data.turns[k].angle} degrees`);
      // The bank's camera sees the back, then the face, changing once; and the top falls toward the players (the held end ends nearest her).
      const seen = poses.map(c => sideSeen(c, eye.position, 0)), changes = seen.filter((s, j) => j > 0 && s !== seen[j - 1]).length; assert.equal(seen[0], 'BACK'); assert.equal(seen[seen.length - 1], 'FRONT'); assert.equal(changes, 1, 'the side changes once');
      // Lowered evenly: from the frame the turn is done the card is within 15 degrees of flat, so the frame before it lies it is not upright; and no step is more than 50 degrees.
      mine.forEach((i, j) => { if (i >= b.turned && i > 0) assert.ok(tilt[j] <= 15, `frame ${i}: ${tilt[j].toFixed(0)} degrees from flat after the turn`); if (j > 0) assert.ok(turnBetween(poses[j - 1], poses[j]).angle <= 50, `frame ${i}: the card turns ${turnBetween(poses[j - 1], poses[j]).angle.toFixed(0)} degrees in one frame`); });
      // It lies flat, face up, on the plan's place, from the frame the file says.
      const lies = card(data.frames[Math.ceil(b.h)].card), place = placeOf(data, b.to).pixel, at = see(eye, lies.centre)!; assert.ok(Math.abs(lies.centre[1] - CARD.thickness / 2) < 1e-4 && lies.normal[1] > 0.9999 && lies.long[2] < -0.9999, 'lying face up, its long side toward the player');
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
