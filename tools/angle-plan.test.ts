// The angle trial's pure part (src/angle-plan.ts, for pages/vinklar.html): which film shows at which camera angle, the
// cross-fade's weights, the camera's orbit against the repo's own (src/table-lens.ts orbit), the view setting against the
// scene's own conversion (viewUnder), how a film's planes stand, the films' one clock, and that the scene's film shader still
// ends where a film's weight is laid in.   node --test tools/angle-plan.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {BEHIND_EDGE, CHANGE, FILMS, FILM_FPS, behind, drawOrder, follow, frameOf, frameTime, loopTime, orbitView, reach, rigMatrix, settingFor, showing, weightedShader, weights, withMirrors, wordNumber} from '../src/angle-plan.ts';
import {cameraFromContract, edgeRowOf, lensCamera, solveCamera, viewUnder} from '../src/scene3d-geometry.ts';
import {TABLE_LENS, filmEye, orbit} from '../src/table-lens.ts';
import {createFilmLayers} from '../src/scene3d-film.ts';

const near = (a: number, b: number, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} is not ${b}`);
const two = [{angle: 0}, {angle: 40}];

test('the films: the front one at 0, the side one at its angle, in the proof folder, and mirrored twins on the other side', () => {
  assert.deepEqual(FILMS.map(f => [f.id, f.angle]), [['fram', 0], ['sida', 40]]);
  for (const f of FILMS) assert.match(f.path, /^assets\/proofs\/sidovinkel-ur-film\/[a-z0-9-]+\.mp4$/, 'media stays in the proof folder, outside Git');
  assert.deepEqual(withMirrors(FILMS, false).map(f => f.id), ['fram', 'sida']);
  const all = withMirrors(FILMS, true);
  assert.deepEqual(all.map(f => [f.id, f.angle, !!f.mirror]), [['sida-spegel', -40, true], ['fram', 0, false], ['sida', 40, false]], 'the front film has no twin');
  assert.equal(all[0].path, FILMS[1].path, 'a twin is the same file');
  const five = withMirrors([...FILMS, {id: 'sida-70', name: 'Långt från sidan', path: 'x.mp4', angle: 70}], true);
  assert.deepEqual(five.map(f => f.angle), [-70, -40, 0, 40, 70], 'a third film is one line, and gives the five angles');
});

test('one film alone near its own angle, and a cut or a cross-fade at the point between two', () => {
  assert.deepEqual(weights(0, two), [1, 0]);
  assert.deepEqual(weights(-10, two), [1, 0], 'past the outermost film it alone');
  assert.deepEqual(weights(40, two), [0, 1]);
  assert.deepEqual(weights(65, two), [0, 1]);
  assert.deepEqual(weights(10, two), [1, 0], 'outside the fade the nearer film alone');
  assert.deepEqual(weights(30, two), [0, 1]);
  // a cut: the outer film from the point on
  assert.deepEqual(weights(19.9, two, 0.5, 0), [1, 0]);
  assert.deepEqual(weights(20, two, 0.5, 0), [0, 1]);
  assert.deepEqual(weights(29, two, 0.75, 0), [1, 0], 'the point follows its share');
  assert.deepEqual(weights(30, two, 0.75, 0), [0, 1]);
  // the fade: CHANGE.fade degrees about the point
  assert.deepEqual(weights(20 - CHANGE.fade / 2, two), [1, 0]);
  assert.deepEqual(weights(20 + CHANGE.fade / 2, two), [0, 1]);
  const mid = weights(20, two);
  near(mid[1], 0.5, 1e-12, 'the outer film is half in at the point:'); assert.equal(mid[0], 1, 'and the inner one still whole under it');
});

test('through a fade the outer film only comes in, the inner only goes out, and the room never shows through her by much', () => {
  let last = [1, 0], most = 0;
  for (let a = 10; a <= 30; a += 0.05) {
    const w = weights(a, two, 0.5, 12);
    assert.ok(w[1] >= last[1] - 1e-12 && w[0] <= last[0] + 1e-12, `at ${a}`);
    assert.ok(w[0] >= 0 && w[0] <= 1 && w[1] >= 0 && w[1] <= 1);
    most = Math.max(most, (1 - w[0]) * (1 - w[1])); // what is left of the background where both films are solid
    last = w;
  }
  assert.deepEqual(last, [0, 1]);
  assert.ok(most < 0.09, `the room shows through by ${most}`);
  // a fade longer than the films are apart is held to their distance
  assert.deepEqual(weights(0, two, 0.5, 400), [1, 0]); assert.deepEqual(weights(40, two, 0.5, 400), [0, 1]);
});

test('with mirrored twins the left side is the right side turned round, and the outer film is always drawn over the inner', () => {
  const five = [-70, -40, 0, 40, 70].map(angle => ({angle}));
  for (const a of [3, 17, 20, 22.5, 38, 51, 55, 58, 69]) {
    const right = weights(a, five, 0.5, 10), left = weights(-a, five, 0.5, 10);
    assert.deepEqual(left, [...right].reverse(), `at ${a}`);
  }
  const at55 = weights(55, five, 0.5, 10); assert.deepEqual(at55.slice(0, 3), [0, 0, 0]); assert.equal(at55[3], 1); near(at55[4], 0.5, 1e-12);
  assert.deepEqual(drawOrder(five).map((rank, i) => [five[i].angle, rank]).sort((a, b) => a[1] - b[1]).map(p => Math.abs(p[0])), [0, 40, 40, 70, 70]);
  assert.deepEqual(drawOrder(two), [0, 1]);
  assert.equal(showing([1, 0], [0, 1]), 0); assert.equal(showing([1, 0.5], [0, 1]), 0); assert.equal(showing([1, 1], [0, 1]), 1, 'of two whole films the one on top is the picture'); assert.equal(showing([0.2, 1], [0, 1]), 1);
  assert.equal(showing([0, 0], [0, 1]), -1);
});

test('the orbit is the table lens\'s own: same place and direction as orbit() about her line', () => {
  const distance = solveCamera(lensCamera(TABLE_LENS, 831.5)).edgeDistance + BEHIND_EDGE, eye = filmEye(TABLE_LENS);
  near(distance, 2.024, 0.001, 'the lens stands 2.024 m from her:');
  { const home = orbitView(distance, 0); near(home.dx, 0, 0); near(home.dz, 0, 0); near(home.yaw, 0, 0); }
  for (const degrees of [-40, 12.5, 40, 70]) {
    const v = orbitView(distance, degrees), o = orbit(eye, [0, 0, -distance], degrees * Math.PI / 180);
    near(v.dx, o.position[0], 1e-12); near(v.dz, o.position[2], 1e-12); near(o.position[1], TABLE_LENS.height, 1e-12);
    near(Math.hypot(v.dx, v.dz + distance), distance, 1e-12, 'the same distance from her:');
    // three.js's yaw turns the view's forward (0, 0, -1) to (-sin, 0, -cos): the orbit's own forward, so she stays in the middle
    const yaw = v.yaw * Math.PI / 180, flat = Math.hypot(o.forward[0], o.forward[2]);
    near(-Math.sin(yaw), o.forward[0] / flat, 1e-12); near(-Math.cos(yaw), o.forward[2] / flat, 1e-12);
  }
  assert.ok(orbitView(distance, 40).dx > 0, 'positive is toward image right, her left, where the shoe stands');
});

test('the view setting is the scene\'s conversion backwards: under the lens the scene ends up with the orbit itself', () => {
  const contract = JSON.parse(readFileSync(new URL('../data/scene-contract.json', import.meta.url), 'utf8'));
  const written = cameraFromContract(contract), camera = lensCamera(TABLE_LENS, edgeRowOf(contract));
  for (const degrees of [-70, -40, 0, 20, 40, 75]) {
    const want = orbitView(2.024, degrees), set = settingFor(want, camera, written), got = viewUnder(camera, written, {...set, pitch: 0, dy: 0});
    near(got.yaw, want.yaw, 1e-9); near(got.dx, want.dx, 1e-12); near(got.dz, want.dz, 1e-12); assert.equal(got.pitch, 0); assert.equal(got.dy, 0);
  }
  assert.deepEqual(settingFor({dx: 1, dz: -2, yaw: 30}, written, null), {dx: 1, dz: -2, yaw: 30}, 'under the contract\'s camera the scene converts nothing');
});

test('a film\'s planes: its camera is carried to its angle about her line, and a mirrored film is the opposite angle turned left to right', () => {
  const pivotZ = -2.024, at = (m: number[], p: number[]) => new T.Vector3(...p).applyMatrix4(new T.Matrix4().fromArray(m)).toArray();
  rigMatrix({angle: 0}, pivotZ).forEach((v, i) => near(v, new T.Matrix4().elements[i], 0, 'the front film stands as the scene has it:'));
  const eye = filmEye(TABLE_LENS), side = rigMatrix({angle: 40}, pivotZ), o = orbit(eye, [0, 0, pivotZ], 40 * Math.PI / 180);
  at(side, eye.position).forEach((v, i) => near(v, o.position[i], 1e-12));
  at(side, [0, 0.4, pivotZ]).forEach((v, i) => near(v, [0, 0.4, pivotZ][i], 1e-12, 'her line stays where it is:'));
  // the upright plane (z = pivotZ in the film's own frame) faces the film's camera: its normal points at the camera's place on the floor
  const m = new T.Matrix4().fromArray(side), normal = new T.Vector3(0, 0, 1).transformDirection(m);
  near(normal.x, Math.sin(40 * Math.PI / 180), 1e-12); near(normal.z, Math.cos(40 * Math.PI / 180), 1e-12);
  // the mirrored twin at -40: every point of the side film's rig, with x turned round
  const twin = rigMatrix({angle: -40, mirror: true}, pivotZ);
  for (const p of [eye.position, [0.3, 0, -1.7], [-0.5, 1, -2.2]]) { const a = at(side, p), b = at(twin, p); near(b[0], -a[0], 1e-12); near(b[1], a[1], 1e-12); near(b[2], a[2], 1e-12); }
  assert.ok(new T.Matrix4().fromArray(twin).determinant() < 0, 'a mirror');
  assert.ok(at(twin, eye.position)[0] < 0, 'its camera stands on the other side');
});

test('one clock: a film a little off changes its speed, a film far off is moved, and the loop is read the short way round', () => {
  near(loopTime(4.25, 4), 0.25); near(loopTime(-0.5, 4), 3.5); assert.equal(loopTime(1, 0), 0);
  near(behind(1, 0.9, 4), 0.1); near(behind(0.9, 1, 4), -0.1); near(behind(0.01, 3.99, 4), 0.02, 1e-9, 'across the loop\'s end:'); near(behind(3.99, 0.01, 4), -0.02);
  assert.deepEqual(follow(0), {seek: false, rate: 1});
  assert.ok(follow(0.04).rate > 1 && follow(0.04).rate < 1.1 && !follow(0.04).seek); assert.ok(follow(-0.04).rate < 1 && follow(-0.04).rate > 0.9);
  assert.deepEqual(follow(0.5), {seek: true, rate: 1}); assert.deepEqual(follow(-2), {seek: true, rate: 1});
  assert.equal(frameOf(2), 48); assert.equal(frameOf(58 / FILM_FPS), 58); assert.equal(frameOf(frameTime(95)), 95); assert.equal(frameOf(0), 0);
});

test('the address\'s words are held within their bounds, and the camera reaches a little past the outermost films', () => {
  assert.equal(wordNumber('40', -15, 70, 0), 40); assert.equal(wordNumber('12,5', -15, 70, 0), 12.5); assert.equal(wordNumber('900', -15, 70, 0), 70);
  assert.equal(wordNumber(null, -15, 70, 3), 3); assert.equal(wordNumber('', -15, 70, 3), 3); assert.equal(wordNumber('hej', -15, 70, 3), 3);
  assert.deepEqual(reach(two), {lo: -15, hi: 70}); assert.deepEqual(reach(withMirrors(FILMS, true)), {lo: -70, hi: 70});
  assert.deepEqual(reach([-70, 0, 70].map(angle => ({angle}))), {lo: -80, hi: 80});
});

test('the scene\'s film shader still ends on the line where a film\'s weight is laid in', () => {
  const layers = createFilmLayers(new T.Matrix4(), {});
  for (const mesh of [layers.body, layers.table]) {
    const own = (mesh.material as T.ShaderMaterial).fragmentShader, weighted = weightedShader(own);
    assert.ok(weighted, 'src/scene3d-film.ts: the fragment shader no longer ends with "gl_FragColor = o;"');
    assert.ok(weighted!.startsWith('uniform float angleFade;\n')); assert.ok(weighted!.trimEnd().endsWith('gl_FragColor = o * angleFade;\n}'));
    assert.equal(weighted!.length, own.length + 'uniform float angleFade;\n'.length + ' * angleFade'.length, 'nothing else is changed');
  }
  assert.equal(weightedShader('void main(){ gl_FragColor = vec4(1.); }'), null);
  assert.equal(weightedShader('void main(){ gl_FragColor = o; gl_FragColor.a = 1.; }'), null, 'a shader that goes on after the line is not the one this was written for');
});
