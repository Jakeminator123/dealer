// The cup holders set into the players' rail (src/scene3d-rail.ts), their pure parts: the roll as the table draws it read back
// at any point of the plan (railPoint in src/scene3d-table.ts), and the cups built on it so that they meet the leather. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_SIZE, railPoint, rollGeometry, sized} from '../src/scene3d-table.ts';
import {CUP, cupAngles, cupParts, railTop, type CupPart} from '../src/scene3d-rail.ts';

const close = (a: number, b: number, tolerance: number, what: string) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);
const seats = Array.from({length: 7}, (_, i) => { const t = Math.PI * (0.14 + 0.12 * i); return {x: 0.8 * 0.95 * Math.cos(t), s: 0.8 * 0.6 * Math.sin(t)}; });
const points = (p: CupPart) => Array.from({length: p.position.length / 3}, (_, i) => p.position.slice(3 * i, 3 * i + 3));

test('railPoint reads the roll back as the table draws it: height, texture and normal', () => {
  for (const size of [TABLE_SIZE.min, 1, TABLE_SIZE.max]) {
    const g = rollGeometry(size), at = g.getAttribute('position'), uv = g.getAttribute('uv'), normal = g.getAttribute('normal');
    let checked = 0;
    for (let i = 0; i < at.count; i++) {
      const x = at.getX(i), y = at.getY(i), z = at.getZ(i), {a, b} = sized(size), t = Math.atan2(z / b, x / a);
      if (y < 0.03 || t < 0.3 || t > Math.PI - 0.3) continue; // the top of the roll between the cups' last places
      const p = railPoint(x, z, size, t);
      close(p.o, (() => { const l = Math.hypot(b * Math.cos(p.t), a * Math.sin(p.t)); return (x - a * Math.cos(p.t)) * b * Math.cos(p.t) / l + (z - b * Math.sin(p.t)) * a * Math.sin(p.t) / l; })(), 1e-9, 'out from the edge');
      close(p.y, y, 2e-6, 'height'); close(p.u, uv.getX(i), 2e-5, 'u'); close(p.v, uv.getY(i), 1e-6, 'v');
      for (let d = 0; d < 3; d++) close(p.normal[d], [normal.getX(i), normal.getY(i), normal.getZ(i)][d], 0.02, 'normal');
      checked++;
    }
    assert.ok(checked > 1000, `checked ${checked} points of the roll's top`);
  }
});

test('a cup meets the roll: the leather it draws down ends on the roll, and the cover lies on or over it', () => {
  for (const size of [TABLE_SIZE.min, 1, 1.2, TABLE_SIZE.max]) {
    const angles = cupAngles(seats), parts = cupParts(angles, size), around = 97, perCup = parts.collar.position.length / 3 / angles.length, rings = perCup / around;
    assert.equal(angles.length, 8); assert.ok(Number.isInteger(rings));
    angles.forEach((t, c) => {
      for (let i = 0; i < around; i++) { // the collar's outer ring: on the roll, with the roll's normal
        const k = c * perCup + (rings - 1) * around + i, [x, y, z] = parts.collar.position.slice(3 * k, 3 * k + 3), on = railPoint(x, z, size, t);
        close(y, on.y, 1e-9, 'the collar ends on the roll'); for (let d = 0; d < 3; d++) close(parts.collar.normal[3 * k + d], on.normal[d], 1e-9, "with the roll's normal");
        close(parts.collar.uv[2 * k], on.u, 1e-9, "and the roll's texture");
      }
    });
    for (const [x, y, z] of points(parts.cover)) { const on = railPoint(x, z, size, Math.atan2(z / sized(size).b, x / sized(size).a)); assert.ok(y >= on.y - 1e-12 && y <= on.y + CUP.cover + 1e-12, 'the cover lies on the roll or just over it'); }
    // the leather never stands above the roll round a cup: it is drawn down
    for (const [x, y, z] of points(parts.collar)) { const on = railPoint(x, z, size, Math.atan2(z / sized(size).b, x / sized(size).a)); assert.ok(y <= on.y + CUP.folds + 1e-12); }
  }
});

test('a cup is deep and stays inside the roll, and its rim sits down in the leather', () => {
  const angles = cupAngles(seats), parts = cupParts(angles), wellY = points(parts.well).map(p => p[1]), lipY = points(parts.lip).map(p => p[1]);
  const top = railTop(angles[3]);
  assert.ok(top[1] - Math.min(...wellY) > 0.045, 'more than 4.5 cm deep under the roll\'s crown');
  assert.ok(Math.min(...wellY) > -0.016, 'its bottom stays inside the roll (its underside is 1.9 cm under the felt)');
  assert.ok(Math.max(...lipY) < top[1] + 0.001, 'the rim stands at most a millimetre over the crown');
  // per cup: the rim is lower along the rail, where the roll is highest, than the leather beside it
  const perCup = parts.lip.position.length / 3 / angles.length, rows = perCup / 97;
  angles.forEach((t, c) => { let highest = -1;
    for (let k = 0; k < rows; k++) for (let i = 0; i < 97; i++) highest = Math.max(highest, parts.lip.position[3 * (c * perCup + k * 97 + i) + 1]);
    assert.ok(highest > railTop(t)[1] - 0.004, 'the rim shows over the shoulders'); });
  // the well's light falls off with depth, from all of the room at the rim to a little at the bottom
  const shades = parts.well.shade.slice(0, parts.well.shade.length / angles.length); assert.ok(Math.max(...shades) > 0.95 && Math.min(...shades) < 0.4);
  assert.deepEqual(cupParts([]), {well: {position: [], normal: [], uv: [], shade: [], index: []}, lip: {position: [], normal: [], uv: [], shade: [], index: []}, collar: {position: [], normal: [], uv: [], shade: [], index: []}, cover: {position: [], normal: [], uv: [], shade: [], index: []}});
});

test('what a built-in material writes into a render target is bounded, so that the glint of the sun in the gold cannot become a black square in the focus blur', async () => {
  const {createFanLight, TARGET_MOST} = await import('../src/scene3d-light.ts');
  const material = {onBeforeCompile: (_shader: unknown) => {}, customProgramCacheKey: () => ''}, shader = {uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <colorspace_fragment>'};
  createFanLight().hook(material as never); material.onBeforeCompile(shader);
  const at = shader.fragmentShader.indexOf('sRGBTransferOETF('), bound = shader.fragmentShader.indexOf(`clamp(gl_FragColor.rgb, 0., ${TARGET_MOST}.)`);
  assert.ok(at > 0 && bound > at && bound < at + 40, 'the light is bounded before it is encoded for the target'); assert.ok(TARGET_MOST >= 4 && TARGET_MOST < 65504);
});
