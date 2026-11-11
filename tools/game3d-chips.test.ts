import test from 'node:test';
import assert from 'node:assert/strict';
import {chipFall, stackChange, chipRest, lookOf, DROP, CHIP_RADIUS, CHIP_HEIGHT} from '../src/game3d-chips.ts';

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
