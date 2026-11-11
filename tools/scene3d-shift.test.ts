// The change of room with a shimmer: the pure parts. The course over time, what a second change does, and that the
// shader text is whole. Nothing here needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANGE_FRAGMENT, CHANGE_UNIFORMS, SHIFT, SHIMMER_GLSL, SHIMMER_UNIFORMS, changedAt, levelAt, readyFrom, retake, roomChange, shiftProgress, shimmerLevel} from '../src/scene3d-shift.ts';

const steps = (n: number) => Array.from({length: n + 1}, (_, i) => i / n), near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the shimmer builds, is at its height while the rooms change, and dies away', () => {
  assert.equal(shimmerLevel(0), 0); assert.equal(shimmerLevel(1), 0); assert.equal(shimmerLevel(-1), 0); assert.equal(shimmerLevel(2), 0);
  let before = 0, peak = false;
  for (const p of steps(1000)) {
    const level = shimmerLevel(p), change = roomChange(p); assert.ok(level >= 0 && level <= 1 && change >= 0 && change <= 1);
    if (p <= SHIFT.rise) assert.ok(level >= before - 1e-12, `sjunker på vägen upp vid ${p}`); else if (p > SHIFT.change) assert.ok(level <= before + 1e-12, `stiger på vägen ned vid ${p}`);
    assert.ok(Math.abs(level - before) < 0.01, `hopp i styrkan vid ${p}`); // no jump from one step of a thousandth to the next
    // the rooms change only while the shimmer is in full: nothing of the new room is seen under a weaker one before, nothing of the old one after
    if (change > 0 && change < 1) { assert.equal(level, 1, `rummen byts under svagt skimmer vid ${p}`); peak = true; }
    if (p < SHIFT.rise) assert.equal(change, 0); if (p > SHIFT.change) assert.equal(change, 1);
    before = level;
  }
  assert.ok(peak); assert.ok(SHIFT.rise > 0.25 && SHIFT.change - SHIFT.rise >= 0.15 && 1 - SHIFT.change > 0.25, 'tre delar som alla hinner ses');
});

test('the course comes from the time alone and takes the seconds it is given', () => {
  for (const seconds of [1, 2.6, 5]) {
    assert.equal(shiftProgress(0, seconds), 0); assert.ok(near(shiftProgress(seconds / 2, seconds), 0.5)); assert.equal(shiftProgress(seconds, seconds), 1); assert.equal(shiftProgress(seconds * 3, seconds), 1);
    assert.equal(shiftProgress(-1, seconds), 0);
    assert.equal(shiftProgress(1.234, seconds), shiftProgress(1.234, seconds)); // the same moment is the same picture
  }
  assert.ok(shiftProgress(0.1, 0) < 1 && shiftProgress(0.1, -3) < 1, 'en längd på noll blir inte ett klipp mitt i en ruta');
  assert.equal(shiftProgress(5, NaN), 1, 'en längd som inte är ett tal får bytet att ta slut ändå'); assert.ok(shiftProgress(0.05, NaN) > 0 && shiftProgress(0.05, NaN) < 1);
});

test('the course waits at its height for a room whose picture has not arrived, and not for ever', () => {
  const seconds = 2.6, toHeight = SHIFT.rise * seconds;
  // not yet there: the course stops at the height, where nothing of the new room is asked for
  for (const t of [toHeight, toHeight + 0.5, toHeight + 3, toHeight + SHIFT.patience - 0.01]) { assert.equal(shiftProgress(t, seconds, Infinity), SHIFT.rise); assert.equal(roomChange(shiftProgress(t, seconds, Infinity)), 0); }
  // patience ends: it goes on without the picture and comes to its end
  assert.ok(shiftProgress(toHeight + SHIFT.patience + 0.2, seconds, Infinity) > SHIFT.rise); assert.equal(shiftProgress(toHeight + SHIFT.patience + seconds, seconds, Infinity), 1);
  // a picture that came before the height holds nothing up
  for (const t of steps(50).map(s => s * seconds)) assert.equal(shiftProgress(t, seconds, toHeight - 0.3), shiftProgress(t, seconds));
  // one that came later: the course goes on from that second, without a jump, and the rest takes as long as it would have
  const ready = toHeight + 1.7; let before = 0;
  for (const t of steps(4000).map(s => s * (seconds + 2))) { const p = shiftProgress(t, seconds, ready); assert.ok(p >= before && p - before < 0.001, `hopp vid ${t}`); before = p; }
  assert.equal(shiftProgress(ready, seconds, ready), SHIFT.rise); assert.ok(near(shiftProgress(ready + (1 - SHIFT.rise) * seconds, seconds, ready), 1));
  // the scene tells the course when: a picture seen in time counts from when it was seen, one that came during the wait from the frame after it was taken in
  assert.equal(readyFrom(0, 1.5, seconds), 0); assert.equal(readyFrom(toHeight - 0.01, 3, seconds), toHeight - 0.01); assert.equal(readyFrom(toHeight + 1, toHeight + 1.25, seconds), toHeight + 1.25);
  assert.equal(readyFrom(0.5, 0.9, seconds, SHIFT.rise), 0.9, 'en omtagning som börjar på höjden väntar från första stund');
});

test('a second change during one goes back to where the shimmer is as strong, and never forward', () => {
  for (const p of steps(500)) {
    const back = retake(p); assert.ok(back >= 0 && back <= SHIFT.rise && back <= p + 1e-12, `omtagning framåt vid ${p}`);
    assert.ok(near(shimmerLevel(back), shimmerLevel(p), 1e-9), `styrkan hoppar vid ${p}: ${shimmerLevel(back)} mot ${shimmerLevel(p)}`);
    assert.equal(roomChange(back), 0); // the new goal has not begun to show
    // and the course picks up there: a lead is where it starts
    assert.ok(near(shiftProgress(0, 2.6, 0, back), back)); assert.ok(near(shiftProgress((1 - back) * 2.6, 2.6, 0, back), 1));
  }
  assert.equal(retake(0.2), 0.2); assert.equal(retake(SHIFT.rise), SHIFT.rise); assert.equal(retake((SHIFT.rise + SHIFT.change) / 2), SHIFT.rise); assert.ok(retake(0.999) < 0.05);
  // with a lead the wait is counted from the start of the retake
  assert.equal(shiftProgress(1, 2.6, Infinity, SHIFT.rise), SHIFT.rise); assert.ok(shiftProgress(SHIFT.patience + 0.5, 2.6, Infinity, SHIFT.rise) > SHIFT.rise);
});

test('the rooms change everywhere and the shimmer reaches everywhere, whatever the pattern says', () => {
  for (const cloud of steps(20)) {
    assert.equal(changedAt(0, cloud), 0); assert.equal(changedAt(1, cloud), 1); assert.equal(levelAt(0, cloud), 0); assert.equal(levelAt(1, cloud), 1);
    let a = 0, b = 0; for (const v of steps(200)) { const m = changedAt(v, cloud), l = levelAt(v, cloud); assert.ok(m >= a && l >= b && m <= 1 && l <= 1); a = m; b = l; }
  }
  // not everywhere at once: half way, some places are well ahead of others
  assert.ok(changedAt(0.5, 0) - changedAt(0.5, 1) > 0.5); assert.ok(levelAt(0.4, 0) - levelAt(0.4, 1) > 0.5);
});

test('the shader text is whole and takes what the scene gives it', () => {
  for (const [text, uniforms] of [[CHANGE_FRAGMENT, CHANGE_UNIFORMS], [SHIMMER_GLSL, SHIMMER_UNIFORMS]] as const) {
    for (const [open, close] of ['()', '{}']) assert.equal(text.split(open).length, text.split(close).length, `obalanserat ${open}${close}`);
    const declared = [...text.matchAll(/uniform\s+\w+\s+([^;]+);/g)].flatMap(m => m[1].split(',').map(name => name.trim())).sort();
    assert.deepEqual(declared, [...uniforms].sort());
    for (const name of uniforms) assert.ok(text.split(new RegExp(`\\b${name}\\b`)).length > 2, `${name} används inte`);
    assert.ok(!/\$\{|undefined|NaN/.test(text), 'ett värde saknas i shadertexten');
    assert.ok(!/[^.\w]\d+(?![.\w])/.test(text.replace(/vec[234]|sampler2D|texture2D|r[1-4]\b/g, '')), 'ett heltal där GLSL väntar sig ett flyttal'); // "2" for "2." is an error in a WebGL 1 shader
  }
  assert.ok(CHANGE_FRAGMENT.includes('void main') && CHANGE_FRAGMENT.includes('gl_FragColor')); assert.ok(SHIMMER_GLSL.includes('vec4 shimmerOver(vec2 uv, out vec2 bent)') && !SHIMMER_GLSL.includes('void main'));
  // the two rules the shader shares with changedAt and levelAt carry the same numbers
  assert.ok(CHANGE_FRAGMENT.includes(`change * ${(1 + SHIFT.spread).toFixed(3)} - ${SHIFT.spread.toFixed(3)} * cloud`)); assert.ok(SHIMMER_GLSL.includes(`shimmer * ${(1 + SHIFT.bloom).toFixed(3)} - ${SHIFT.bloom.toFixed(3)} * arrive`));
});
