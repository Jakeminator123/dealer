// node --test dealer3d/tests/world.test.ts
// The fit of the lens, the world and one deal, checked without a browser and without media: only placements/default.json is read.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CARD, TABLE_LENS, cardCorners, drawnCard, filmEye, length, lensForFocal, orbit, quadMeasure, see, sub, type Pixel, type Vec3} from '../src/camera.ts';
import {ASSUMED, MEASURED, anchors, bodyUnder, dealerEdge, filmLens, seatEye, shoeCard, shoePose, spots, type Plan} from '../src/world.ts';
import {MOMENTS, cardAxes, planDeal, sideSeen} from '../src/deal.ts';
import {BODY, restingHand, solveBody, standing} from '../src/body.ts';

const plan = JSON.parse(await readFile(new URL('../../placements/default.json', import.meta.url), 'utf8')) as Plan, lens = filmLens();
const near = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const dealTo = (target: string) => { const all = spots(plan, lens), place = all.find(s => s.id === target)!.at, four = all.find(s => s.id === 'P4.C1')!.at; return planDeal({lens, target, place, placeOfSeat4: four, shoe: shoeCard(shoePose(lens))}); };

test('the fit from what is measured and assumed gives the lens that stands written in src/table-lens.ts', () => {
  near(lens.focalPx, TABLE_LENS.focalPx, 1e-9, 'focal length'); near(lens.pitch, TABLE_LENS.pitch, 1e-12, 'pitch'); near(lens.height, TABLE_LENS.height, 1e-12, 'height');
});

test('the lens draws the card at seat 4 as the film has it, whatever its focal length', () => {
  for (const f of [800, 1270, 2334]) { const m = drawnCard(lensForFocal(anchors().card, f), MEASURED.restingCard.centre)!; near(m.near, MEASURED.restingCard.nearPx, 0.05, `near edge at ${f}`); near(m.depth, MEASURED.restingCard.depthPx, 0.05, `depth at ${f}`); }
});

test('the chosen lens draws the dealer near her real size, and the plan\'s own perspective does not', () => {
  const body = bodyUnder(lens);
  near(body.knuckles / ASSUMED.knuckleBreadth, 1, 0.1, 'knuckles'); near(body.shoulders / ASSUMED.shoulderBreadth, 1, 0.1, 'shoulders'); near(body.pupils / ASSUMED.pupilDistance, 1, 0.1, 'pupils');
  const wide = lensForFocal(anchors().card, 800); // the lens under which a real card narrows as the plan's does
  near(drawnCard(wide, MEASURED.restingCard.centre)!.taper, 0.87, 0.01, 'the plan\'s taper');
  assert.ok(bodyUnder(wide).shoulders > 1.8 * ASSUMED.shoulderBreadth, 'under the plan\'s lens she is about twice a person');
});

test('a real card keeps its size in the world and only its picture changes with the seat', () => {
  const place = spots(plan, lens).find(s => s.id === 'P4.C1')!.at, corners = cardCorners(place);
  near(length(sub(corners[0], corners[1])), CARD.width, 1e-9, 'width'); near(length(sub(corners[1], corners[2])), CARD.height, 1e-9, 'height');
  const seen = (seat: number) => quadMeasure(corners.map(p => see(seatEye(seat, plan, lens), p)!) as Pixel[]);
  near(seen(4).near, MEASURED.restingCard.nearPx, 0.1, 'seat 4 is the film camera');
  assert.ok(Math.abs(seen(1).near - seen(4).near) > 3, 'seat 1 sees the same card with another outline');
});

test('every seat sees its own first card where the bank\'s camera sees seat 4\'s: as far off, as high, as steeply down', () => {
  const pivot = dealerEdge(lens), all = spots(plan, lens), place = (seat: number) => all.find(s => s.id === `P${seat}.C1`)!.at, bank = filmEye(lens), four = see(bank, place(4))!;
  for (let seat = 1; seat <= 7; seat++) { const eye = seatEye(seat, plan, lens), own = see(eye, place(seat))!;
    near(own.x, four.x, 1e-6, `seat ${seat}: its card's column`); near(own.y, four.y, 1e-6, `seat ${seat}: its card's row`);
    near(eye.position[1], bank.position[1], 1e-12, `seat ${seat}: height`); near(eye.forward[1], bank.forward[1], 1e-12, `seat ${seat}: how steeply it looks down`);
    near(length(sub(eye.position, place(seat))), length(sub(bank.position, place(4))), 1e-9, `seat ${seat}: distance to its card`); }
  for (const k of [0, 1, 2]) near(seatEye(4, plan, lens).position[k], bank.position[k], 1e-12, 'seat 4 is the bank\'s camera');
  assert.ok(seatEye(1, plan, lens).position[0] < -1 && seatEye(7, plan, lens).position[0] > 1, 'seat 1 to the left and seat 7 to the right');
  near(length(sub(orbit(bank, pivot, 0).position, bank.position)), 0, 1e-12, 'no turn, no move');
});

test('the card starts in the shoe, lands on the plan\'s place face up, and never goes under the felt', () => {
  for (const target of ['P4.C1', 'P1.C1', 'P7.C2', 'D.C1']) {
    const deal = dealTo(target), place = spots(plan, lens).find(s => s.id === target)!.at, start = deal.card(0), end = deal.card(deal.duration), inShoe = shoeCard(shoePose(lens));
    near(length(sub(start.centre, inShoe.centre)), 0, 1e-9, `${target} starts in the shoe`); near(length(sub(start.long, inShoe.up)), 0, 1e-9, `${target} lies along the plate`);
    near(end.centre[0], place[0], 1e-9, `${target} x`); near(end.centre[2], place[2], 1e-9, `${target} z`); near(end.centre[1], CARD.thickness / 2, 1e-9, `${target} on the felt`);
    near(end.normal[1], 1, 1e-9, `${target} face up`); assert.ok(start.normal[1] < 0, 'back toward the eye in the shoe');
    for (let t = 0; t <= deal.duration; t += 1 / 48) { const c = deal.card(t), lowest = c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); assert.ok(lowest >= -1e-9, `${target} under the felt at ${t.toFixed(2)} s: ${lowest}`); }
  }
});

test('the card is a rigid thing: its axes stay at right angles and of unit length through the turn', () => {
  const deal = dealTo('P4.C1');
  for (let t = 0; t <= deal.duration; t += 1 / 24) { const c = deal.card(t); for (const v of [c.long, c.normal, c.across]) near(length(v), 1, 1e-9, 'unit'); near(c.long[0] * c.normal[0] + c.long[1] * c.normal[1] + c.long[2] * c.normal[2], 0, 1e-9, 'square'); }
  const a = cardAxes(0, 0, 0), b = cardAxes(0, 0, Math.PI); near(a.normal[1], -1, 1e-12, 'back up'); near(b.normal[1], 1, 1e-12, 'face up');
});

test('from the film camera the 3D card is where the film has its card on the keyed frames', () => {
  const deal = dealTo('P4.C1'), eye = filmEye(lens);
  for (const [frame, x, y] of [[30, 1145.8, 698.1], [40, 932.2, 816.5], [50, 867.0, 971.4], [60, 850.2, 1065.5]]) { const p = see(eye, deal.card(frame / 24).centre)!; near(p.x, x, 1.5, `frame ${frame} x`); near(p.y, y, 6, `frame ${frame} y`); }
  near(see(eye, deal.card(deal.duration).centre)!.y, MEASURED.restingCard.centre.y, 1.5, 'lands on the plan\'s place, a pixel from the film\'s card');
});

test('in the middle of the turn two seats see two different sides of the same card', () => {
  const deal = dealTo('P4.C1'), eye = (seat: number): Vec3 => seatEye(seat, plan, lens).position;
  assert.equal(sideSeen(deal.card(0.5), eye(4)), 'BACK'); assert.equal(sideSeen(deal.card(deal.duration), eye(4)), 'FRONT'); assert.equal(sideSeen(deal.card(deal.duration), eye(1)), 'FRONT');
  // The card is tipped over about a line across the bank's picture, so the seats at the sides see its face before seat 4 does.
  let split = 0; for (let t = MOMENTS.lifted; t <= MOMENTS.lands; t += 1 / 96) if (sideSeen(deal.card(t), eye(4)) === 'BACK' && sideSeen(deal.card(t), eye(1)) === 'FRONT') split++;
  assert.ok(split >= 6, `seat 4 still sees the back while seat 1 already sees the face on ${split} of the sampled moments`);
});

test('the bank\'s camera sees the back until frame 44, the edge at frame 45 and the face from frame 46, as the film\'s track has it', () => {
  const deal = dealTo('P4.C1'), eye = filmEye(lens).position, seen = (frame: number) => sideSeen(deal.card(frame / 24), eye, 6);
  for (const frame of [0, 22, 30, 40, 42]) assert.equal(seen(frame), 'BACK', `frame ${frame}`);
  for (const frame of [48, 50, 60, 80, 120]) assert.equal(seen(frame), 'FRONT', `frame ${frame}`);
  const turns = [43, 44, 45, 46, 47].filter(frame => seen(frame) === 'EDGE'); assert.ok(turns.length >= 1, 'edge-on on one of the frames 43 to 47');
});

test('the hand holds the card until it lets go over the place, and the arm reaches it the whole way', () => {
  const frame = standing(lens), rest = restingHand(lens);
  for (const target of ['P4.C1', 'P1.C1', 'P7.C1']) { const deal = dealTo(target);
    for (let t = 0; t <= deal.duration; t += 1 / 24) { const h = deal.hand(t), body = solveBody(frame, h.wrist, rest.wrist), armD = body.arms[1];
      assert.equal(h.holds, t <= MOMENTS.lets + 1e-9, `holding at ${t.toFixed(2)}`);
      assert.ok(armD.reached, `${target}: the wrist is out of reach at ${t.toFixed(2)} s (lean ${body.lean.toFixed(2)})`);
      near(length(sub(armD.elbow, armD.shoulder)), BODY.upperArm, 1e-6, 'upper arm'); near(length(sub(armD.wrist, armD.elbow)), BODY.forearm, 1e-6, 'forearm');
      near(length(h.forward), 1, 1e-6, 'forward'); near(length(h.palm), 1, 1e-6, 'palm'); assert.ok(h.wrist[1] > 0, 'the wrist is over the felt'); } }
});
