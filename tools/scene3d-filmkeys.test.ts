// The film's own keys of 2026-11-13, their pure parts (src/scene3d-film.ts): filmEven (the films of the two generators in one
// colour), dealerLife (a slow movement in her head and upper body) and filmTempo. Each key's default is the film as it is, and the
// catalogues of the game and the studio hold the same ranges. No browser and no media.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {EVEN, FLASH, FRAME_FIX, LIFE, roomFlashAt, evenFor, lifeNow, lifeShiftAt, matchLeft, rematrix, toneMatch, toneOf, toneUnder} from '../src/scene3d-film.ts';
import {SCENE_KEYS} from '../studio/lib/scene-keys.ts';
import {KEYS as GAME_KEYS} from '../src/game-look.ts';
import {SMOKE, smokeMask} from '../src/scene3d-smoke.ts';
import {TABLE} from '../src/scene3d-table.ts';

const times = (m: readonly number[], v: number[]) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);

test('the defaults are Jakob\'s standard of 2026-11-13, and both catalogues hold the three keys', () => {
  // the films evened, the deals at twice their speed and the cup holders in the rail and life in her upper body, all from the start
  assert.equal(DEFAULTS.filmEven, true); assert.equal(DEFAULTS.filmTempo, 2); assert.equal(DEFAULTS.cups, true); assert.equal(DEFAULTS.dealerLife, 1);
  assert.deepEqual(lifeNow(12.3, 0).map(Math.abs), [0, 0, 0], 'no life is no movement at all');
  assert.deepEqual(GAME_KEYS.filmEven, {kind: 'switch'}); assert.deepEqual(GAME_KEYS.filmTempo, {kind: 'slider', min: 1, max: 2}); assert.deepEqual(GAME_KEYS.dealerLife, {kind: 'slider', min: 0, max: 2});
  assert.equal(DEFAULTS.shelf, false); assert.deepEqual(GAME_KEYS.shelf, {kind: 'switch'});
  assert.equal(DEFAULTS.edgeClean, 0); assert.deepEqual(GAME_KEYS.edgeClean, {kind: 'slider', min: 0, max: 1});
  const studio = (key: string) => SCENE_KEYS.find(s => s.key === key) as {kind: string; min?: number; max?: number} | undefined;
  assert.equal(studio('filmEven')?.kind, 'switch'); assert.deepEqual([studio('filmTempo')?.min, studio('filmTempo')?.max], [1, 2]); assert.deepEqual([studio('dealerLife')?.min, studio('dealerLife')?.max], [0, 2]);
});

test('reading a film with the other matrix: grey stays, the way back undoes it, and the figures are the standards\'', () => {
  const to601 = rematrix('bt709', 'bt601'), to709 = rematrix('bt601', 'bt709');
  for (const m of [to601, to709]) for (let r = 0; r < 3; r++) assert.ok(Math.abs(m[r * 3] + m[r * 3 + 1] + m[r * 3 + 2] - 1) < 1e-12, 'each row sums to 1');
  for (const v of [[0.9, 0.6, 0.5], [0.1, 0.8, 0.2], [0.3, 0.3, 0.9]]) times(to709, times(to601, v)).forEach((c, i) => assert.ok(Math.abs(c - v[i]) < 1e-12));
  assert.deepEqual(rematrix('bt709', 'bt709').map(c => +c.toFixed(12)), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  // worked by hand from Y = 0.2126 R + 0.7152 G + 0.0722 B read back with R = Y + 1.402 Cr, B = Y + 1.772 Cb
  [0.9136, 0.0785, 0.0079, -0.1050, 1.1722, -0.0671, 0.0096, 0.0322, 0.9582].forEach((c, i) => assert.ok(Math.abs(to601[i] - c) < 6e-5, `entry ${i}: ${to601[i]}`));
  // measured 2026-11-13: a WAN 3 film's face read with BT.709 (227.2, 152.3, 127.5) is, read with BT.601, (220.7, 146.2, 129.1)
  times(to601, [227.2, 152.3, 127.5]).forEach((c, i) => assert.ok(Math.abs(c - [220.7, 146.2, 129.1][i]) < 0.6));
});

test('which films are evened: every generator but Kling 4, and nothing without a known name', () => {
  for (const model of ['wan3', 'kling-3-4k', 'kling-3-4k, written backwards', 'moving-gpu-worker 8b1386c2cd4a (MuseTalk) · eleven_multilingual_v2 Jessica']) assert.deepEqual(evenFor(model), rematrix('bt709', 'bt601'), model);
  for (const model of ['kling-4', 'utsnitt', 'wan30', '', null, undefined]) assert.equal(evenFor(model), null, String(model));
});

test('life in the upper body: nothing at the hands, the shoe and the table, a few pixels at the head, and one rigid turn above the chest', () => {
  let most = 0;
  for (let t = 0; t < 120; t += 0.37) {
    const move = lifeNow(t, 1);
    // from LIFE.still down (wrists, hands, cards, the table edge at row 831.5) and LIFE.side out from her middle (the shoe): still
    for (const [x, y] of [[FRAME_FIX.x, LIFE.still], [700, 800], [1000, 831.5], [FRAME_FIX.x + LIFE.side, 300], [1290, 760], [1500, 640], [200, 100]]) assert.deepEqual(lifeShiftAt(x, y, move).map(Math.abs), [0, 0], `${x}, ${y} at ${t}`);
    const head = lifeShiftAt(FRAME_FIX.x, 190, move); most = Math.max(most, Math.hypot(...head));
    // above the chest and inside her width the lean is one turn about the pivot: two points on a row differ only by the turn across
    const a = lifeShiftAt(800, 450, move), b = lifeShiftAt(960, 450, move); assert.ok(Math.abs(a[0] - b[0]) < 1e-9); assert.ok(Math.abs((b[1] - a[1]) + move[0] * 160) < 1e-9);
  }
  assert.ok(most > 3 && most < 10, `the head moves at most ${most.toFixed(2)} px at amount 1`);
  const one = lifeShiftAt(900, 200, lifeNow(3.1, 1)), two = lifeShiftAt(900, 200, lifeNow(3.1, 2)); assert.ok(Math.abs(two[0] - 2 * one[0]) < 1e-9 && Math.abs(two[1] - 2 * one[1]) < 1e-9, 'twice the amount is twice the movement');
});

test('the join between two films: her tone read without the screen, the new film brought to the old one\'s, and the match fading out', () => {
  // a small picture: her (two tones, a dark jacket and a light face) on the screen's green
  const picture = (jacket: number[], face: number[]) => { const data: number[] = []; for (let i = 0; i < EVEN.cols * EVEN.rows; i++) data.push(...(i % 3 === 0 ? [0, 203, 38] : i % 3 === 1 ? jacket : face), 255); return data; };
  const old = toneOf(picture([40, 40, 44], [224, 150, 130]))!, next = toneOf(picture([28, 30, 40], [218, 144, 131]))!;
  assert.deepEqual(old.dark.map(v => Math.round(v * 255)), [40, 40, 44], 'her dark parts, the screen left out'); assert.deepEqual(old.light.map(v => Math.round(v * 255)), [224, 150, 130], 'her light parts');
  assert.equal(toneOf(picture([40, 40, 44], [40, 40, 44])), null, 'a frame without light parts has no tone');
  assert.equal(toneOf(picture([0, 203, 38], [0, 203, 38])), null, 'a frame with nothing but screen has no tone');
  // matched, the new film's two tones land on the old one's
  const match = toneMatch(old, next);
  for (const [from, to] of [[[28, 30, 40], [40, 40, 44]], [[218, 144, 131], [224, 150, 130]]]) from.forEach((v, c) => assert.ok(Math.abs((v / 255 * match.gain[c] + match.lift[c]) * 255 - to[c]) < 0.01, `channel ${c}`));
  assert.deepEqual(toneMatch(old, old).gain.map(g => +g.toFixed(9)), [1, 1, 1]); assert.deepEqual(toneMatch(old, old).lift.map(l => +l.toFixed(9) + 0), [0, 0, 0]);
  // another picture altogether is matched only as far as the limits go
  const far = toneMatch({dark: [0.6, 0.6, 0.6], light: [1, 1, 1]}, next); far.gain.forEach(g => assert.ok(g >= EVEN.gain[0] && g <= EVEN.gain[1])); far.lift.forEach(l => assert.ok(Math.abs(l) <= EVEN.lift));
  // the family's matrix is laid on each sample before it is counted: grey stays grey
  const grey = toneOf(picture([60, 60, 60], [180, 180, 180]), evenFor('wan3'))!; grey.dark.forEach(m => assert.ok(Math.abs(m - 60 / 255) < 1e-9)); grey.light.forEach(m => assert.ok(Math.abs(m - 180 / 255) < 1e-9));
  // all of the match at the join, none from the fade's end, never rising; a tone under a full match is the old tone
  assert.equal(matchLeft(0), 1); assert.equal(matchLeft(EVEN.fade), 0); assert.equal(matchLeft(EVEN.fade + 5), 0);
  for (let t = 0; t < EVEN.fade; t += 0.1) assert.ok(matchLeft(t + 0.1) <= matchLeft(t));
  toneUnder(next, match, 1).dark.forEach((m, c) => assert.ok(Math.abs(m - old.dark[c]) < 1e-9)); toneUnder(next, match, 1).light.forEach((m, c) => assert.ok(Math.abs(m - old.light[c]) < 1e-9)); assert.equal(toneUnder(next, match, 0), next); assert.equal(toneUnder(next, null, 1), next);
});

test('a film\'s lightning: white at once, the other room for the hold, a softer flash back, and nothing before or after', () => {
  for (const t of [-1, -0.001, 1 + FLASH.backFall, 5, NaN]) assert.deepEqual(roomFlashAt(t, 1), {flash: 0, on: false}, String(t));
  assert.deepEqual(roomFlashAt(0, 1), {flash: 0, on: false}); assert.deepEqual(roomFlashAt(FLASH.rise, 1), {flash: 1, on: true}, 'the room comes on at the peak, under full white');
  assert.ok(roomFlashAt(FLASH.rise / 2, 1).flash === 0.5 && !roomFlashAt(FLASH.rise / 2, 1).on);
  assert.equal(roomFlashAt(FLASH.rise + FLASH.fall + 0.01, 1).flash, 0, 'the first flash is over'); assert.ok(Math.abs(roomFlashAt(FLASH.after.at, 1).flash - FLASH.after.peak) < 1e-9, 'the faint second flash');
  for (const t of [1 - FLASH.backHold, 0.97, 0.999]) assert.deepEqual(roomFlashAt(t, 1), {flash: FLASH.backPeak, on: true}, 'the flash back is at its peak over the last frame of the other room'); assert.ok(roomFlashAt(1 - FLASH.backHold - FLASH.back / 2, 1).flash < FLASH.backPeak);
  assert.ok(roomFlashAt(1 + 1 / 30, 1).flash > FLASH.backPeak * 0.9, 'and nearly so over the first frame of the room that comes back'); assert.ok(!roomFlashAt(1, 1).on && Math.abs(roomFlashAt(1, 1).flash - FLASH.backPeak) < 1e-9);
  // a longer hold stretches the middle, not the flashes
  assert.ok(roomFlashAt(1.5, 2).on && roomFlashAt(1.5, 2).flash === 0); assert.ok(Math.abs(roomFlashAt(1, 2).flash - FLASH.after.peak) < 1e-9);
  for (let t = -0.2; t < 1.4; t += 0.01) { const f = roomFlashAt(t, 1).flash; assert.ok(f >= 0 && f <= 1); }
});

test('life in the upper body never falls back in step: the sway is not like itself again after any delay, nor after whole turns of a rest film', () => {
  const rate = 15, N = 80 * rate, x = Array.from({length: N + 40 * rate + 1}, (_, i) => lifeNow(i / rate, 1)[0]); let own = 0; for (let i = 0; i < N; i++) own += x[i] ** 2;
  const like = (lag: number) => { let a = 0, c = 0; for (let i = 0; i < N; i++) { a += x[i] * x[i + lag]; c += x[i + lag] ** 2; } return a / Math.sqrt(own * c); };
  let worst = 0; for (let lag = 2 * rate; lag <= 40 * rate; lag++) worst = Math.max(worst, like(lag));
  assert.ok(worst < 0.6, `after some delay of 2 to 40 s the sway is ${worst.toFixed(2)} like itself`);
  for (let loop = 3.7; loop <= 4.001; loop += 0.05) for (let turns = 1; turns <= 9; turns++) assert.ok(like(Math.round(turns * loop * rate)) < 0.6, `${turns} turns of a rest film of ${loop.toFixed(2)} s`);
  assert.ok(Math.abs(LIFE.sway.reduce((s, part) => s + part[1], 0) - 1) < 1e-9, 'the shares of the sway make one');
});

test('the smoke over the table: off from the start, thin where the cards are, round the rim, and never behind the dealer\'s edge', () => {
  assert.equal(DEFAULTS.smoke, 0); assert.deepEqual(GAME_KEYS.smoke, {kind: 'slider', min: 0, max: 1});
  const spec = SCENE_KEYS.find(s => s.key === 'smoke') as {min?: number; max?: number} | undefined; assert.deepEqual([spec?.min, spec?.max], [0, 1]);
  const middle = smokeMask(0, TABLE.b * 0.5), rim = smokeMask(TABLE.a * 0.9, TABLE.b * 0.5);
  assert.ok(Math.abs(middle - SMOKE.thin) < 1e-9, 'the middle of the felt has the thin share'); assert.ok(rim > 0.9, `the rim has nearly all: ${rim}`);
  for (const [x, z] of [[0, 0], [0.5, -0.1], [-0.9, -0.3]]) assert.equal(smokeMask(x, z), 0, 'nothing at or behind the dealer\'s edge');
  assert.equal(smokeMask(TABLE.a * 1.6, TABLE.b * 0.5), 0, 'nothing far outside the table'); assert.ok(smokeMask(TABLE.a * 1.1, TABLE.b * 0.5) > 0.5, 'still there over the rail');
  for (let x = -2; x <= 2; x += 0.05) for (let z = -0.5; z <= 2; z += 0.05) { const m = smokeMask(x, z); assert.ok(m >= 0 && m <= 1); }
  // a larger table carries its smoke out with it
  assert.ok(smokeMask(TABLE.a * 1.25, TABLE.b * 0.6, TABLE.a * 1.3, TABLE.b * 1.3) < smokeMask(TABLE.a * 1.25, TABLE.b * 0.6) + 1 && smokeMask(TABLE.a * 1.8, TABLE.b * 0.65, TABLE.a * 1.3, TABLE.b * 1.3) > 0);
});
