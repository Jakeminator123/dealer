// The gaming hall's pure parts: where things stand and when a machine wins. Nothing here needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {HALL, TINTS, hallLayout, winLevel} from '../src/scene3d-hall.ts';

const layout = hallLayout();
// The camera stands at about (0, 0.76) on the floor plan and looks toward -z; the dealer hides about 20 degrees to each side.
const CAMERA_Z = 0.76, degreesOff = (x: number, z: number) => Math.atan2(Math.abs(x), CAMERA_Z - z) * 180 / Math.PI;

test('the hall is laid out the same way every time', () => {
  assert.deepEqual(hallLayout(), layout);
  assert.ok(layout.machines.length >= 60 && layout.machines.length <= 110, `${layout.machines.length} maskiner`);
});

test('every machine stands inside the hall, behind the dealer or far out to the side, and none in another', () => {
  for (const m of layout.machines) {
    assert.ok(Math.abs(m.x) < HALL.halfWidth - 0.3 && m.z > HALL.back + 0.3 && m.z < HALL.front - 0.3, `maskin utanför hallen: ${m.x}, ${m.z}`);
    // nothing of the room may stand in front of the table: the table reaches x = ±1.05 and lies on the camera's side of z = 0
    assert.ok(m.z < -1.2 || Math.abs(m.x) > 6, `maskin för nära bordet: ${m.x}, ${m.z}`);
    assert.ok(Math.hypot(m.x - 1.9, m.z + 1.5) > 1, 'platsen för rummets klocka är fri');
    assert.ok(Number.isInteger(m.tint) && m.tint >= 0 && m.tint < TINTS.length && m.seed >= 0 && m.seed < 1 && m.period > 0);
  }
  for (let i = 0; i < layout.machines.length; i++) for (let j = i + 1; j < layout.machines.length; j++) {
    const a = layout.machines[i], b = layout.machines[j]; assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.64, `maskin ${i} och ${j} står i varandra`);
  }
});

test('there are machines at several distances on both sides of the dealer', () => {
  for (const side of [-1, 1]) {
    const seen = layout.machines.filter(m => m.x * side > 0 && m.z < 0 && degreesOff(m.x, m.z) > 20 && degreesOff(m.x, m.z) < 45), depths = seen.map(m => CAMERA_Z - m.z);
    assert.ok(Math.min(...depths) < 5.5 && Math.max(...depths) > 10, `sida ${side}: avstånd ${Math.min(...depths)} till ${Math.max(...depths)}`); // the far left corner is the bar's
  }
});

test('no ceiling lamp hangs in the wedge behind the dealer\'s head', () => {
  // the dealer hides about 20 degrees to each side; her head is the middle 6 of them
  for (const [x, z] of layout.downlights) assert.ok(z > CAMERA_Z || degreesOff(x, z) > 20, `lampa bakom dealern: ${x}, ${z}`);
  assert.ok(layout.downlights.length >= 6 && layout.downlights.length <= 16);
});

test('four machines can win, each in its own slot', () => {
  assert.equal(layout.winners.length, 4);
  assert.deepEqual(layout.winners.map(m => m.slot), [0, 1, 2, 3]);
  for (const m of layout.winners) assert.ok(m.every >= 2 && layout.machines.includes(m));
  assert.equal(layout.machines.filter(m => m.every > 0).length, 4);
});

test('a win is rare, comes after the reels have stopped and is over before they spin again', () => {
  for (const m of layout.winners) {
    let lit = 0; const round = m.period * m.every, steps = 4000;
    for (let i = 0; i < steps; i++) {
      const t = i / steps * round, level = winLevel(t, m), c = (t + m.offset) / m.period, phase = c - Math.floor(c);
      assert.ok(level >= 0 && level <= 1);
      if (level > 0) { lit++; assert.ok(phase > 0.6 && phase < 0.99, `vinst medan hjulen snurrar, fas ${phase}`); assert.equal(Math.floor(c) % m.every, 0); }
      assert.ok(Math.abs(winLevel(t + round, m) - level) < 1e-6, 'vinsten kommer tillbaka med samma takt');
    }
    assert.ok(lit > 0 && lit / steps < 0.1, `andel av tiden med vinst: ${lit / steps}`);
    assert.ok(Math.max(...Array.from({length: 400}, (_, i) => winLevel(i / 400 * round, m))) > 0.99, 'vinsten når full styrka');
  }
  const [a, b, c, d] = layout.winners; // no two of them win in the same breath during the first ten minutes
  for (let t = 0; t < 600; t += 0.25) assert.ok([a, b, c, d].filter(m => winLevel(t, m) > 0.5).length <= 2);
});

test('a machine that never wins, and a broken clock, show no win', () => {
  const quiet = layout.machines.find(m => m.every === 0)!;
  for (let t = 0; t < 200; t += 0.37) assert.equal(winLevel(t, quiet), 0);
  assert.equal(winLevel(NaN, layout.winners[0]), 0); assert.equal(winLevel(5, {period: 0, offset: 0, every: 3}), 0);
});
