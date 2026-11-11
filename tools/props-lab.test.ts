import test from 'node:test';
import assert from 'node:assert/strict';
import {LOOKS, MOTIONS, LIGHTS, DEFAULTS, ACCENT, SUBSTANCE, MOTION, STAGE_LIGHTS, FLOORS, HANDS, accentScore, goldShare, analyse, paintLook, glossFactor, alignWinding, motionPose, propList, modelName, sizeText, type LookId} from '../src/props-lab.ts';
import {stagePlacement, stageFit, ROOMS, KEY, PHOTO, PHOTO_MAPS, panoramaDirection, turnY, roomKey, keyStrength, footprint} from '../src/props-stage.ts';
import {solveCamera, type FilmCamera} from '../src/scene3d-geometry.ts';
import {TABLE as FILM_TABLE} from '../src/scene3d-table.ts';

// The colours the three models' own base colour textures consist of (the means of their largest colour groups).
const SHOE = {black: [27, 28, 30], brass: [228, 182, 111], brassShade: [130, 105, 68]};
const TRAY = {grey: [33, 34, 35], white: [230, 232, 233], red: [170, 34, 42], green: [13, 129, 78], purple: [86, 44, 116], orange: [247, 122, 23]};
const TABLE = {wood: [67, 13, 10], leather: [37, 26, 25], felt: [9, 68, 54], brass: [224, 203, 151], print: [242, 213, 117], blueChip: [42, 63, 220]};
const score = (c: number[]) => accentScore(c[0], c[1], c[2]);
const image = (...colours: number[][]) => colours.flatMap(c => [...c, 255]);

test('the module is read without a page, and the panel offers what was asked for', () => {
  assert.equal(typeof document, 'undefined');
  assert.deepEqual(LOOKS.map(l => l.label), ['Som den kom', 'Elfenben', 'Guld', 'Elfenben och guld', 'Svart lack och guld', 'Fotomaterial']);
  assert.equal(LOOKS[0].id, 'original', 'the original is the first choice');
  assert.deepEqual(LOOKS.filter(l => l.accents).map(l => l.id), ['ivory-gold', 'lacquer-gold'], 'the looks the gold slider belongs to');
  assert.deepEqual(MOTIONS.map(m => m.id), ['still', 'turn', 'present', 'sweep']);
  assert.deepEqual(LIGHTS.map(l => l.id), ['warm', 'neutral', 'cool']);
  for (const list of [LOOKS, MOTIONS, LIGHTS]) { assert.equal(new Set(list.map(item => item.id)).size, list.length); for (const item of list) assert.ok(item.label.length > 0); }
  const [warm, neutral, cool] = LIGHTS.map(l => l.tint);
  assert.deepEqual(neutral, [1, 1, 1]); assert.ok(warm[0] > warm[2] && cool[2] > cool[0], 'warm leans red, cool leans blue');
  assert.equal(DEFAULTS.look, 'original', 'the page opens on the model as it came');
});

test('gold and brass score highest, bright colours next, dark colours after them, and black, grey and white nothing', () => {
  for (const brass of [SHOE.brass, SHOE.brassShade, TABLE.brass, TABLE.print]) assert.ok(score(brass) > 0.95, `${brass} is brass`);
  for (const chip of [TRAY.red, TRAY.green, TRAY.purple, TABLE.blueChip]) assert.ok(score(chip) > 0.55 && score(chip) <= ACCENT.vividWeight + 1e-9, `${chip} is a bright colour`);
  assert.ok(score(TRAY.orange) >= ACCENT.vividWeight, 'an orange chip is at least a bright colour');
  assert.ok(Math.abs(score(TABLE.wood) - ACCENT.deepWeight) < 1e-9, 'red wood is a dark warm colour');
  assert.ok(score(TABLE.felt) < score(TABLE.wood) && score(TABLE.felt) > 0.2, 'green felt turns after the wood');
  assert.ok(score(TABLE.leather) < score(TABLE.felt), 'near-black leather turns after the felt');
  for (const plain of [SHOE.black, TRAY.grey, TRAY.white, [0, 0, 0], [255, 255, 255], [128, 128, 128]]) assert.equal(score(plain), 0, `${plain} is no accent`);
  // Every colour gives a score from 0 to 1.
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) { const s = accentScore(r, g, b); assert.ok(s >= 0 && s <= 1 && Number.isFinite(s)); }
});

test('the slider draws its line through the scores: nothing at 0, everything at 1, never less gold for more slider', () => {
  for (const s of [0, 0.2, 0.4, 0.8, 1]) { assert.equal(goldShare(s, 0), 0); assert.equal(goldShare(s, 1), 1); }
  for (const s of [0, 0.24, 0.4, 0.62, 0.8, 1]) { let before = 0; for (let amount = 0; amount <= 1.0001; amount += 0.01) { const share = goldShare(s, amount); assert.ok(share >= before - 1e-12 && share >= 0 && share <= 1); before = share; } }
  for (let amount = 0; amount <= 1; amount += 0.1) { let before = 0; for (let s = 0; s <= 1.0001; s += 0.01) { const share = goldShare(s, amount); assert.ok(share >= before - 1e-12); before = share; } }
  // Where the slider stands when the page opens: brass and the chips are gold; wood, felt, leather and everything colourless are not.
  const at = (c: number[], amount = DEFAULTS.gold) => goldShare(score(c), amount);
  for (const gold of [SHOE.brass, TABLE.brass, TABLE.print, TRAY.red, TRAY.green, TRAY.purple, TRAY.orange, TABLE.blueChip]) assert.equal(at(gold), 1, `${gold} is gold`);
  for (const ivory of [SHOE.black, TRAY.grey, TRAY.white, TABLE.wood, TABLE.felt, TABLE.leather]) assert.equal(at(ivory), 0, `${ivory} is not gold`);
  // A little further the wood has turned and the felt has not; further still the felt has too.
  assert.equal(at(TABLE.wood, 0.65), 1); assert.equal(at(TABLE.felt, 0.65), 0); assert.equal(at(TABLE.felt, 0.8), 1);
  // Low down only what was brass is left.
  assert.equal(at(TABLE.brass, 0.15), 1); assert.equal(at(TRAY.red, 0.15), 0);
});

test('a look is painted as a colour image and a surface image of the same size', () => {
  const pixels = image(SHOE.brass, SHOE.black, TRAY.red, TABLE.wood), analysis = analyse(pixels);
  assert.equal(analysis.score.length, 4); assert.equal(analysis.light.length, 4);
  assert.ok(analysis.light[0] > analysis.light[1], 'brass is lighter than black');
  const texel = (painted: {colour: Uint8Array; surface: Uint8Array}, i: number) => ({colour: [...painted.colour.subarray(i * 4, i * 4 + 3)], coat: painted.surface[i * 4], rough: painted.surface[i * 4 + 1], metal: painted.surface[i * 4 + 2], alpha: [painted.colour[i * 4 + 3], painted.surface[i * 4 + 3]]});
  const near = (colour: number[], substance: {colour: number[]; shade: number}) => colour.every((v, k) => v <= substance.colour[k] && v >= substance.colour[k] * (1 - substance.shade) - 1);

  const ivory = paintLook('ivory', analysis, 0.5);
  assert.equal(ivory.colour.length, 16); assert.equal(ivory.surface.length, 16);
  for (let i = 0; i < 4; i++) { const t = texel(ivory, i); assert.equal(t.metal, 0); assert.ok(near(t.colour, SUBSTANCE.ivory), `${t.colour} is ivory`); assert.deepEqual(t.alpha, [255, 255]); assert.ok(t.coat > 0, 'softly polished'); }
  assert.ok(texel(ivory, 0).colour[0] > texel(ivory, 1).colour[0], 'what was light in the original stays a little lighter');
  assert.ok(texel(ivory, 0).rough < texel(ivory, 1).rough, 'and a little smoother');

  const gold = paintLook('gold', analysis, 0);
  for (let i = 0; i < 4; i++) { const t = texel(gold, i); assert.equal(t.metal, 255); assert.equal(t.coat, 0); assert.ok(near(t.colour, SUBSTANCE.gold), `${t.colour} is gold`); assert.ok(t.rough < texel(ivory, i).rough, 'gold is the more polished'); }

  const two = paintLook('ivory-gold', analysis, DEFAULTS.gold);
  assert.deepEqual([0, 1, 2, 3].map(i => texel(two, i).metal), [255, 0, 255, 0], 'brass and the red chip are gold, black and wood are ivory');
  assert.deepEqual(texel(two, 0), texel(gold, 0)); assert.deepEqual(texel(two, 1), texel(ivory, 1));
  // The ends of the slider are the two plain looks.
  assert.deepEqual(paintLook('ivory-gold', analysis, 0), ivory); assert.deepEqual(paintLook('ivory-gold', analysis, 1), paintLook('gold', analysis, 1));

  const lacquer = paintLook('lacquer-gold', analysis, DEFAULTS.gold);
  assert.deepEqual([0, 1, 2, 3].map(i => texel(lacquer, i).metal), [255, 0, 255, 0]);
  assert.deepEqual(texel(lacquer, 1).colour, SUBSTANCE.lacquer.colour); assert.equal(texel(lacquer, 1).coat, 255, 'black under a clear coat');
  assert.deepEqual(texel(lacquer, 0), texel(gold, 0), 'the gold is the same gold');

  // Painting again into the same memory gives the same picture, and the original is not something to paint.
  const again = paintLook('ivory', analysis, 0.5, two);
  assert.equal(again.colour, two.colour); assert.equal(again.surface, two.surface); assert.deepEqual(again, ivory);
  assert.throws(() => paintLook('original' as LookId, analysis, 0.5), /original/);
  assert.throws(() => paintLook('photo' as LookId, analysis, 0.5), /photo/, 'the photographed look is laid on in the shader, not painted');
  assert.deepEqual(analyse([]), {score: new Uint8Array(0), light: new Uint8Array(0)});
});

test('Glans runs from satin to mirror', () => {
  assert.equal(glossFactor(0), 1); assert.ok(Math.abs(glossFactor(1) - 0.1) < 1e-12); assert.ok(glossFactor(0.6) < glossFactor(0.3));
  assert.equal(glossFactor(-1), 1); assert.ok(Math.abs(glossFactor(2) - 0.1) < 1e-12);
});

test('a triangle wound against its normals is turned, the others are left', () => {
  // Two triangles in the x–y plane with normals toward +z: the first is wound counter-clockwise seen from +z, the second clockwise.
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], index = new Uint32Array([0, 1, 2, 1, 2, 3]);
  assert.equal(alignWinding(index, positions, normals), 1);
  assert.deepEqual([...index], [0, 1, 2, 1, 3, 2]);
  assert.equal(alignWinding(index, positions, normals), 0, 'a second pass finds nothing to turn');
  assert.equal(alignWinding(new Uint32Array([0, 1]), positions, normals), 0, 'an incomplete triangle is left alone');
});

test('the movements are calm, stay within their bounds and end where they began', () => {
  assert.deepEqual(motionPose('still', 12.3), {yaw: 0, lift: 0, sweep: 0, glow: 0});
  // Turning: a quarter of a turn in a quarter of the time, at a steady pace, and nothing else moves.
  const quarter = motionPose('turn', MOTION.turnSeconds / 4);
  assert.ok(Math.abs(quarter.yaw - Math.PI / 2) < 1e-9); assert.equal(quarter.lift, 0); assert.equal(quarter.glow, 0);
  assert.ok(MOTION.turnSeconds >= 20, 'slow');
  // Shown off: at rest at both ends of a round, lifted and half turned in the middle, never below the floor.
  const start = motionPose('present', 0), end = motionPose('present', MOTION.presentSeconds - 1e-6), middle = motionPose('present', 5.7);
  assert.deepEqual([start.yaw, start.lift], [0, 0]); assert.ok(end.lift < 1e-9 && Math.abs(Math.sin(end.yaw)) < 1e-6 && Math.cos(end.yaw) > 0.999);
  assert.ok(Math.abs(middle.lift - MOTION.lift) < 1e-9 && Math.abs(middle.yaw - Math.PI) < 1e-6);
  assert.deepEqual(motionPose('present', MOTION.presentSeconds + 2), motionPose('present', 2), 'the round repeats');
  // No jump anywhere: over a sixtieth of a second nothing moves more than a little.
  for (const motion of ['turn', 'present', 'sweep'] as const) {
    let before = motionPose(motion, 0);
    for (let t = 1 / 60; t < 40; t += 1 / 60) {
      const now = motionPose(motion, t), turned = Math.hypot(Math.cos(now.yaw) - Math.cos(before.yaw), Math.sin(now.yaw) - Math.sin(before.yaw));
      assert.ok(turned < 0.03 && Math.abs(now.lift - before.lift) < 0.002 && Math.abs(now.sweep - before.sweep) < 0.02 && Math.abs(now.glow - before.glow) < 0.03, `${motion} at ${t.toFixed(2)} s`);
      assert.ok(now.lift >= 0 && now.lift <= MOTION.lift + 1e-12 && Math.abs(now.sweep) <= 1 && now.glow >= 0 && now.glow <= 1);
      before = now;
    }
  }
  // The travelling light starts dark over the middle and reaches both sides.
  assert.deepEqual(motionPose('sweep', 0), {yaw: 0, lift: 0, sweep: 0, glow: 0});
  assert.ok(Math.abs(motionPose('sweep', MOTION.sweepSeconds / 4).sweep - 1) < 1e-9 && Math.abs(motionPose('sweep', MOTION.sweepSeconds * 3 / 4).sweep + 1) < 1e-9);
  assert.equal(motionPose('sweep', 5).glow, 1);
  assert.deepEqual(motionPose('turn', -3), motionPose('turn', 0), 'time before the start is the start');
});

test('the model list is read from the prop register, and names and sizes are written in Swedish', () => {
  const register = {schemaVersion: 1, props: [{id: 'shoe', file: 'shoe-meshy.glb'}, {id: 'tray'}, {id: 'table'}, {id: '../secret'}, {id: 'Upper'}, {file: 'no-id.glb'}, null, {id: 'chip-rack'}]};
  assert.deepEqual(propList(register), [{id: 'shoe'}, {id: 'tray'}, {id: 'table'}, {id: 'chip-rack'}], 'only ids the server serves a file for');
  for (const broken of [null, undefined, {}, {props: 'shoe'}, 'text', 7]) assert.deepEqual(propList(broken), []);
  assert.deepEqual(['shoe', 'tray', 'table', 'chip-rack'].map(modelName), ['Sko', 'Markerbricka', 'Bord', 'chip-rack']);
  assert.equal(sizeText(0.1397, 0.1501, 0.45), '0,14 × 0,15 × 0,45 m');
});

test('the film of the dealer is laid on a table model: felt on felt, edge on edge, width on width', () => {
  const camera: FilmCamera = {focalPx: 1270, horizonRow: 215, edgeRow: 831.5, heightM: 0.55, scale: 1.3, source: 'estimate'}, fit = {feltY: 0.99, edgeZ: -0.75, halfWidth: 0.93};
  const {scale, matrix, eye} = stagePlacement(camera, fit), at = (x: number, y: number, z: number) => [matrix[0] * x + matrix[12], matrix[5] * y + matrix[13], matrix[10] * z + matrix[14]];
  const edge = -solveCamera(camera).edgeDistance, near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(at(0, 0, edge), [0, 0.99, -0.75]), 'the middle of the dealer-side edge in the film lies on that of the model');
  assert.ok(near(at(FILM_TABLE.a * camera.scale, 0, edge), [0.93, 0.99, -0.75]), 'half the width of the film table is half the width of the felt');
  assert.ok(near(at(0, camera.heightM, 0), eye) && eye[1] > 0.99 && eye[2] > -0.75, 'the camera stands above the felt, on the side of the players');
  assert.ok(Math.abs(scale - 0.93 / (0.95 * 1.3)) < 1e-12);
  // Where the felt is comes from the register; an entry that does not say it in full has no stage.
  assert.deepEqual(stageFit({feltY: 0.99, edgeZ: -0.75, halfWidth: 0.93, extra: 1}), fit);
  for (const broken of [null, undefined, {}, {feltY: 1, edgeZ: 0}, {feltY: '1', edgeZ: 0, halfWidth: 1}, {feltY: 1, edgeZ: 0, halfWidth: 0}, {feltY: NaN, edgeZ: 0, halfWidth: 1}]) assert.equal(stageFit(broken), null);
  assert.deepEqual(propList({props: [{id: 'table', stage: fit}, {id: 'shoe', stage: {feltY: 1}}]}), [{id: 'table', stage: fit}, {id: 'shoe'}]);
});

test('the stage offers three rooms and begins as it was, except that the table is lit by the room it stands in', () => {
  assert.deepEqual(ROOMS.map(r => r.id), ['vegas', 'la', 'skog']);
  assert.deepEqual(ROOMS.map(r => r.file), ['assets/scene/panorama-vegas.jpg', 'assets/scene/panorama-la.jpg', 'assets/scene/panorama-skog.jpg']);
  for (const room of ROOMS) { assert.ok(room.label.length > 0 && room.shown > 0 && room.shown <= 1); assert.ok(room.ground.eye > 0 && room.ground.walls > room.ground.eye && room.ground.ceiling > room.ground.eye); }
  assert.equal(ROOMS[0].turn, Math.PI, 'Las Vegas is turned as the stage showed it before');
  assert.deepEqual([STAGE_LIGHTS, FLOORS, HANDS].map(list => list.map(item => item.id)), [['studio', 'room'], ['none', 'room'], ['behind', 'felt']]);
  for (const list of [STAGE_LIGHTS, FLOORS, HANDS]) for (const item of list) assert.ok(item.label.length > 0 && item.note.length > 0);
  assert.deepEqual([DEFAULTS.room, DEFAULTS.stageLight, DEFAULTS.floor, DEFAULTS.hands, DEFAULTS.stage], ['vegas', 'room', 'none', 'behind', 'alone'], 'the lab still opens alone; on the stage only the light is new from the start');
  assert.deepEqual(Object.values(PHOTO_MAPS).map(name => `${name}.webp`).sort(), ['brown_leather-nor_gl.webp', 'brown_leather-rough.webp', 'denim_fabric-nor_gl.webp', 'denim_fabric-rough.webp', 'wood_table-diffuse.webp', 'wood_table-nor_gl.webp', 'wood_table-rough.webp'], 'the photographed maps are those of data/scene-materials.json');
  for (const v of [...Object.values(PHOTO.tile), ...Object.values(PHOTO.relief)]) assert.ok(v > 0);
});

test('a panorama pixel is a direction in three.js\'s equirectangular frame, and the room\'s turn lays it in the world', () => {
  const near = (a: number[], b: number[], eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);
  const W = 400, H = 200, at = (u: number, v: number) => panoramaDirection(u * W - 0.5, v * H - 0.5, W, H);
  assert.ok(near(at(0.5, 0.5), [1, 0, 0]), 'the middle of the picture lies toward +x');
  assert.ok(near(at(0.75, 0.5), [0, 0, 1]) && near(at(0.25, 0.5), [0, 0, -1]), 'three quarters toward +z, a quarter toward -z');
  assert.ok(panoramaDirection(0, 0, W, H)[1] > 0.999 && panoramaDirection(0, H - 1, W, H)[1] < -0.999, 'the top row is straight up, the bottom row straight down');
  for (let i = 0; i < 50; i++) { const d = panoramaDirection(i * 7 % W, i * 3 % H, W, H); assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-12); }
  // Turned half round (Las Vegas), what lies at three quarters of the picture stands behind her (-z, away from the camera).
  assert.ok(near(turnY(at(0.75, 0.5), Math.PI), [0, 0, -1]));
  assert.ok(near(turnY([1, 0.3, 0], Math.PI / 2), [0, 0.3, -1]) && near(turnY([0.2, 0.5, 0.7], 0), [0.2, 0.5, 0.7]));
});

test('the key shines from where the panorama is brightest, and gives the felt the light her hands have in the film', () => {
  // A dark room (sRGB 40) with one warm lamp: a block of pixels high up at three quarters of the picture.
  const W = 128, H = 64, pixels = new Uint8Array(W * H * 4), lamp = {c0: 92, c1: 100, r0: 8, r1: 14};
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const p = (r * W + c) * 4, lit = c >= lamp.c0 && c < lamp.c1 && r >= lamp.r0 && r < lamp.r1; pixels.set(lit ? [255, 200, 120, 255] : [40, 40, 40, 255], p); }
  const key = roomKey(pixels, W, H), toward = panoramaDirection((lamp.c0 + lamp.c1) / 2 - 0.5, (lamp.r0 + lamp.r1) / 2 - 0.5, W, H);
  assert.ok(key.direction[0] * toward[0] + key.direction[1] * toward[1] + key.direction[2] * toward[2] > 0.99, 'toward the lamp');
  assert.ok(Math.abs(Math.hypot(...key.direction) - 1) < 1e-9);
  assert.equal(key.colour[0], 1); assert.ok(key.colour[1] < 1 && key.colour[2] < key.colour[1], 'its colour is the lamp\'s, warm');
  // A grey room lights a surface facing up with its own brightness, and its brightest share of the sky carries that share of its
  // light; the lamp carries far more than its share. A black room has no key to speak of.
  const grey = new Uint8Array(W * H * 4).fill(128), black = new Uint8Array(W * H * 4); for (let i = 3; i < black.length; i += 4) black[i] = 255;
  const even = roomKey(grey, W, H); assert.ok(Math.abs(even.up - ((128 / 255 + 0.055) / 1.055) ** 2.4) < 1e-6);
  assert.ok(Math.abs(even.share - KEY.share) < 0.005, `an even sky: ${even.share}`); assert.ok(key.share > 5 * even.share && key.share <= 1, `the lamp: ${key.share}`);
  assert.deepEqual(roomKey(black, W, H), {direction: [0, 1, 0], colour: [1, 1, 1], up: 0, share: 0});
  // Only the sky half counts: a bright floor is no lamp.
  const floor = new Uint8Array(W * H * 4); for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) floor.set(r > H * 0.75 ? [255, 255, 255, 255] : [30, 30, 30, 255], (r * W + c) * 4);
  assert.ok(roomKey(floor, W, H).direction[1] > 0.2, 'the key comes from above the horizon');
  // Its strength: what the room gives a surface facing up and the key together make KEY.table; a low key is counted as KEY.softest high.
  const up = 0.1, overhead = {direction: [0, 1, 0] as [number, number, number], colour: [1, 1, 1] as [number, number, number], up, share: 1};
  assert.ok(Math.abs(keyStrength(overhead, 0.5) / Math.PI + up * 0.5 - KEY.table) < 1e-12);
  assert.equal(keyStrength({...overhead, up: 5}, 1), 0, 'a room that is bright enough needs no key');
  const low = {...overhead, direction: [Math.cos(0.1), Math.sin(0.1), 0] as [number, number, number]};
  assert.ok(Math.abs(keyStrength(low, 0.5) - keyStrength(overhead, 0.5) / KEY.softest) < 1e-9);
});

test('where a model meets the floor', () => {
  const positions = [0.5, 0, 0.2, -0.4, 0.01, -0.3, 0.9, 0.5, 0.9, -1, 1, -1];
  assert.deepEqual(footprint(positions, 0.05), {x0: -0.4, z0: -0.3, x1: 0.5, z1: 0.2}, 'only what is lower than the line');
  assert.equal(footprint([0, 1, 0], 0.05), null); assert.equal(footprint([], 0.05), null);
});
