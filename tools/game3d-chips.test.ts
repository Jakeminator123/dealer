import test from 'node:test';
import assert from 'node:assert/strict';
import {chipFall, chipCarry, stackChange, chipRest, lookOf, DROP, FLIGHT, CHIP_RADIUS, CHIP_HEIGHT} from '../src/game3d-chips.ts';
import {TRAY_ROWS, TRAY_FILL, rowFor, rowPlace} from '../src/game3d-tray.ts';
import {TRAY} from '../src/scene3d-props.ts';

test('a chip is the house chip at real size', () => {
  assert.equal(CHIP_RADIUS, 0.0195);
  assert.ok(CHIP_HEIGHT > 0.003 && CHIP_HEIGHT < 0.0034, 'a little over three millimetres thick');
  assert.deepEqual(lookOf(25), {value: '25', colour: 'green'});
  assert.deepEqual(lookOf(1000), {value: '1000', colour: 'blue'});
  assert.deepEqual(lookOf(50), {value: '25', colour: 'green'}, 'a value without a chip of its own shows the nearest one below');
});

test('a dropped chip falls, bounces lower each time and lies still', () => {
  assert.equal(chipFall(0).y, DROP.height);
  assert.equal(chipFall(-1).y, DROP.height, 'not let go yet');
  // Falling: lower and lower until the first touch, at the speed gravity gives.
  const touch = Math.sqrt(2 * DROP.height / DROP.gravity);
  let last = DROP.height; for (let t = 0.01; t < touch; t += 0.01) { const y = chipFall(t).y; assert.ok(y < last && y >= 0); last = y; }
  assert.ok(Math.abs(chipFall(touch / 2).y - DROP.height * 0.75) < 1e-9, 'half the time, a quarter of the way');
  // Bounces: each peak is lower than the one before, by the square of the bounce.
  const peaks: number[] = []; let rising = false, before = 0;
  for (let t = touch; t < 1; t += 0.0005) { const y = chipFall(t).y; if (y < before && rising) peaks.push(before); rising = y > before; before = y; }
  assert.ok(peaks.length >= 2, 'it bounces at least twice');
  assert.ok(peaks[0] < DROP.height * DROP.bounce ** 2 * 1.05 && peaks[0] > DROP.height * DROP.bounce ** 2 * 0.9);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1]);
  // And then it is at rest, flat, for good.
  for (const t of [1, 2, 60, Infinity]) assert.deepEqual(chipFall(t), {y: 0, tilt: 0, resting: true});
  assert.ok(!chipFall(touch + 0.02).resting);
  for (let t = 0; t < 1; t += 0.003) { const f = chipFall(t); assert.ok(f.y >= 0 && f.y <= DROP.height && Math.abs(f.tilt) <= DROP.tilt); }
});

test('a stack keeps the chips that were there and drops only the new ones', () => {
  assert.deepEqual(stackChange([], [25, 25]), {kept: 0, added: [25, 25]});
  assert.deepEqual(stackChange([25, 25], [25, 25, 100]), {kept: 2, added: [100]});
  assert.deepEqual(stackChange([25, 25, 100], [25, 25]), {kept: 2, added: []}, 'the last chip is taken back');
  assert.deepEqual(stackChange([25, 25], [100, 25]), {kept: 0, added: [100, 25]}, 'another stack is laid anew');
  assert.deepEqual(stackChange([25], []), {kept: 0, added: []});
});

test('a chip lies a little off the one below, the same way every time', () => {
  const a = chipRest(4, 2), b = chipRest(4, 2), c = chipRest(4, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let seat = 1; seat <= 7; seat++) for (let i = 0; i < 12; i++) { const r = chipRest(seat, i); assert.ok(Math.abs(r.x) <= 0.0008 && Math.abs(r.z) <= 0.0008 && r.turn >= 0 && r.turn < Math.PI * 2); }
});

test('a chip that changes hands is carried: it rises, turns onto its edge and is set down', () => {
  const from = [0.2, 0.004, 0.4], to = [-0.1, -0.02, 0.09];
  assert.deepEqual(chipCarry(from, to, 0, [0, 1]), {at: from, edge: 0});
  const end = chipCarry(from, to, 1, [0, 1]); assert.ok(end.at.every((v, i) => Math.abs(v - to[i]) < 1e-12)); assert.equal(end.edge, 1);
  const half = chipCarry(from, to, 0.5, [0, 1]);
  assert.ok(Math.abs(half.at[0] - 0.05) < 1e-12 && Math.abs(half.at[2] - 0.245) < 1e-12, 'half way across');
  assert.ok(Math.abs(half.at[1] - (-0.008 + FLIGHT.lift)) < 1e-12, 'and at the top of its arc'); assert.equal(half.edge, 0.5);
  // It never dips under the straight line between its ends, and it starts and ends without a jerk.
  for (let i = 0; i <= 20; i++) { const u = i / 20, {at} = chipCarry(from, to, u, [1, 0]), e = u * u * (3 - 2 * u); assert.ok(at[1] >= from[1] + (to[1] - from[1]) * e - 1e-12); }
  assert.ok(Math.abs(chipCarry(from, to, 0.02, [0, 1]).at[0] - from[0]) < 0.001, 'slow at the start');
  assert.deepEqual(chipCarry(from, to, -3, [0, 1]), chipCarry(from, to, 0, [0, 1])); assert.deepEqual(chipCarry(from, to, 7, [1, 0]).edge, 0);
});

test('the tray holds the house chips in rows, and a chip goes to a row of its own kind', () => {
  assert.equal(TRAY_ROWS.length, 12); for (const value of TRAY_ROWS) assert.equal(Number(lookOf(value).value), value, 'every row is a chip the players bet with');
  for (const value of [5, 25, 100, 500, 1000]) assert.ok(TRAY_ROWS.includes(value), `a row for ${value}`);
  // The rows fit side by side in the tray with air between them, and a full row fits its length.
  const pitch = rowPlace(1).x - rowPlace(0).x; assert.ok(pitch > 2 * CHIP_RADIUS + 0.003, 'chips of neighbouring rows do not touch');
  assert.ok(rowPlace(0).x - CHIP_RADIUS > TRAY.x0 && rowPlace(TRAY_ROWS.length - 1).x + CHIP_RADIUS < TRAY.x1);
  assert.ok(rowPlace(0).s - TRAY_FILL.room * CHIP_HEIGHT > TRAY.s0, 'a full row ends before the dealer-side wall');
  // Coming in: the emptiest row of that chip that has room. Going out: the fullest that has a chip.
  const counts = TRAY_ROWS.map(() => 20), fives = TRAY_ROWS.flatMap((v, i) => v === 5 ? [i] : []);
  assert.equal(rowFor(counts, 5, false), fives[0]); counts[fives[0]] = 21; assert.equal(rowFor(counts, 5, false), fives[1]); assert.equal(rowFor(counts, 5, true), fives[0]);
  for (const i of fives) counts[i] = TRAY_FILL.room; assert.equal(rowFor(counts, 5, false), -1, 'all rows of fives are full');
  for (const i of fives) counts[i] = 0; assert.equal(rowFor(counts, 5, true), -1, 'and none has a chip to give');
  assert.equal(rowFor(counts, 50, false), rowFor(counts, 25, false), 'a value without a chip of its own goes with the nearest chip below');
  assert.equal(TRAY_ROWS[rowFor(counts, 1000, true)], 1000);
});
