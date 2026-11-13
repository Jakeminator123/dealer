// The matte way of drawing the card (src/scene3d-matte.ts): the parts that need no GPU. The colour rules, which the shader and
// these tests read from the same text, against the tracker's own; the card's body as the passes make it; unmixing a blurred
// edge; where the passes run; which quad lays the face print and how a film pixel finds its place on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BACK_ZONE, CLASS_GLSL, CLASSIFY_FRAGMENT, DARK_BACK, FILM_CARD_GLSL, LIT, MATTE, MATTE_GLSL, MORPH_FRAGMENT, PAPER_FACE, PLANE, PLANE_GLSL, RULES, SHADE_FRAGMENT, SHOE_BOX, backZone, bodyOf, darkBackOf, matteBox, matteZone, meanLinear, paleZone, planeLight, printQuad, toPrint, turnZone, unmix} from '../src/scene3d-matte.ts';
import {is} from '../src/card-track.ts';
import {BACK, CARRY, FACE} from '../src/card-overlay.ts';
import {squareToQuad, onSquare} from '../src/scene3d-geometry.ts';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {readFile} from 'node:fs/promises';

// The rules as JavaScript: the same text, compiled here (the module itself never evaluates text).
const rule = (name: keyof typeof RULES) => new Function('r', 'g', 'b', 'min', `return ${RULES[name]};`) as (r: number, g: number, b: number, min: (a: number, b: number) => number) => boolean;
const on = (name: keyof typeof RULES, [r, g, b]: number[]) => rule(name)(r, g, b, Math.min);
const grid = function* () { for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) yield [r, g, b]; };

test('the matte is off from the start: the scene draws its card as an object until the matte is chosen', () => {
  assert.equal(DEFAULTS.cardMethod, 'scene'); assert.equal(DEFAULTS.cards, false);
});

test('the back and the face are the tracker\'s own yellow and blue, colour for colour', () => {
  let yellow = 0, blue = 0;
  for (const c of grid()) { assert.equal(on('back', c), is.yellow(c[0], c[1], c[2]), `gul ${c}`); assert.equal(on('face', c), is.blue(c[0], c[1], c[2]), `blå ${c}`); assert.equal(on('shade', c), is.shade(c[0], c[1], c[2]), `skugga ${c}`); yellow += +on('back', c); blue += +on('face', c); }
  assert.ok(yellow > 20 && blue > 20, 'reglerna fångar något');
  for (const name of Object.keys(RULES)) assert.ok(CLASS_GLSL.includes(RULES[name as keyof typeof RULES]), `${name} står i shadern`);
});

test('the darker card colours take no skin, no sleeve and no felt', () => {
  // skin from a pale fingertip to a warm knuckle in shadow (P1), the black jacket, the felt in a finger's shadow and in light
  const others = [[247, 181, 126], [246, 175, 151], [229, 164, 109], [200, 130, 100], [120, 80, 60], [90, 60, 45], [20, 22, 25], [40, 42, 48], [10, 80, 30], [30, 140, 60], [50, 220, 90], [240, 240, 235]];
  for (const c of others) for (const name of ['back', 'face', 'shade', 'dimBack', 'dimFace'] as const) assert.equal(on(name, c), false, `${name} tar ${c}`);
  // the film's card in a finger's shadow is still card
  assert.ok(on('dimBack', [80, 70, 5]) && on('dimFace', [10, 40, 80]) && !is.yellow(80, 70, 5) && !is.blue(10, 40, 80));
});

const W = 120, H = 90, at = (x: number, y: number) => y * W + x;
const mask = (fill: (x: number, y: number) => boolean) => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fill(x, y)) m[at(x, y)] = 1; return m; };
test('the card\'s body: a card stays whole to its corners, a glint thinner than about five pixels goes', () => {
  const card = (x: number, y: number) => x >= 20 && x < 70 && y >= 15 && y < 75, glint = (x: number, y: number) => x >= 85 && x < 88 && y >= 10 && y < 80; // 3 px wide, like the shoe frame's gold
  const strict = mask((x, y) => card(x, y) || glint(x, y)), body = bodyOf(strict, strict, W, H);
  for (const [x, y] of [[20, 15], [69, 15], [69, 74], [20, 74], [45, 45]]) assert.equal(body[at(x, y)], 1, `kortet saknas vid ${x},${y}`);
  for (let y = 10; y < 80; y++) for (let x = 85; x < 88; x++) assert.equal(body[at(x, y)], 0, `glimten är kvar vid ${x},${y}`);
  assert.equal(body.reduce((s, v) => s + v, 0), 50 * 60, 'inget mer och inget mindre än kortet');
  // a five-pixel strip is about the limit: it is kept
  const wide = mask((x, y) => x >= 50 && x < 55 && y >= 10 && y < 80); assert.ok(bodyOf(wide, wide, W, H).reduce((s, v) => s + v, 0) > 300);
});

test('a shadowed or darker card pixel counts beside the card, not by itself far off', () => {
  const card = (x: number, y: number) => x >= 20 && x < 60 && y >= 15 && y < 75, shadow = (x: number, y: number) => x >= 60 && x < 66 && y >= 30 && y < 50, far = (x: number, y: number) => x >= 90 && x < 110 && y >= 30 && y < 50;
  const strict = mask(card), candidate = mask((x, y) => card(x, y) || shadow(x, y) || far(x, y)), body = bodyOf(candidate, strict, W, H);
  assert.equal(body[at(63, 40)], 1, 'skuggan på kortet hör till kortet');
  assert.equal(body[at(100, 40)], 0, 'en ensam mörkgul fläck långt bort är inget kort');
});

test('a pixel of card and screen blurred together is unmixed in any light; skin, the sleeve and the shoe\'s gold are not', () => {
  const back = [0.91, 0.82, 0.02], face = [0, 0.475, 0.89], T = [0.04, 0.84, 0.25];
  for (const K of [back, face]) for (const light of [1, 0.6]) for (const s of [0, 0.1, 0.35, 0.8, 1]) {
    const c = K.map((k, i) => s * light * k + (1 - s) * T[i]), u = unmix(c, K, T); assert.ok(Math.abs(u.card - s * light) < 1e-9 && Math.abs(u.screen - (1 - s)) < 1e-9 && u.off < 1e-9, `andel ${s}, ljus ${light}`); }
  const mixed = (c: number[]) => [back, face].some(K => { const u = unmix(c.map(v => v / 255), K, T); return u.card >= MATTE.share && u.screen >= -0.05 && u.off < MATTE.off[1]; });
  for (const c of [[247, 181, 126], [229, 164, 109], [255, 187, 155], [253, 180, 149], [20, 22, 25], [190, 140, 60]]) assert.equal(mixed(c), false, `${c} räknas som kort och skärm`);
  assert.equal(mixed([20, 80, 150]), true, 'P1:s mörkare blå framsida, ensam'); assert.equal(mixed([15, 147, 107]), true, 'samma blå till hälften utsmetad över skärmen');
  assert.ok(MATTE_GLSL.includes('matteUnmix') && MATTE_GLSL.includes(MATTE.off[1].toFixed(2)));
});

test('the passes run around the shoe window and the track\'s card over the frames around this one, inside the frame', () => {
  const quad = (x: number, y: number) => [[x, y], [x + 60, y], [x + 60, y + 80], [x, y + 80]];
  const track = {frames: Array.from({length: 10}, (_, i) => ({frame: i, side: i === 4 ? 'EDGE' : 'BACK', quad: i === 4 ? null : quad(300 + 20 * i, 600), edge: i === 4 ? [[380, 640], [440, 640]] : null}))};
  const box = matteBox(track, 5);
  for (const [x, y] of [[SHOE_BOX[0], SHOE_BOX[1]], [SHOE_BOX[2], SHOE_BOX[3]], [400 - MATTE.reach, 600], [460 + MATTE.reach, 680 + MATTE.reach]]) assert.ok(x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3], `${x},${y} utanför ${box}`);
  assert.ok(box[0] <= 360 - MATTE.reach && box[2] >= 440 + 60 + MATTE.reach, 'två rutor bakåt och framåt');
  assert.ok(box.every(Number.isInteger) && box[0] >= 0 && box[3] <= 1173);
  assert.deepEqual(matteBox(null, 0), [SHOE_BOX[0] - MATTE.shoeRoom, SHOE_BOX[1] - MATTE.shoeRoom, SHOE_BOX[2] + MATTE.shoeRoom, SHOE_BOX[3] + MATTE.shoeRoom], 'utan spår: bara skofönstret');
  assert.deepEqual(matteBox({frames: [{frame: 0, side: 'BACK', quad: [[-50, -50], [10, -50], [10, 10], [-50, 10]]}]}, 0).slice(0, 2), [0, 0], 'inom rutan');
  assert.equal(matteZone(track, 4), null, 'en kant har ingen yta att reda ut');
  assert.ok(matteZone(track, 5)!.every(([x, y]) => x < 400 || x > 460 || y < 600 || y > 680), 'zonen ligger utanför kortet');
});

test('the face print is laid by the track\'s face quad, or by the other file\'s where it has one, out to the pale edge and never mirrored', () => {
  const q = [[100, 100], [160, 100], [160, 180], [100, 180]];
  const track = {frames: [{frame: 0, side: 'BACK', quad: q}, {frame: 1, side: 'FRONT', quad: q}, {frame: 2, side: 'FRONT', quad: q, film: [[0, 0], [60, 0], [60, 80], [0, 80]]}, {frame: 3, side: 'EDGE', edge: [[0, 0], [5, 5]]}]};
  assert.equal(printQuad(track, 0), null); assert.equal(printQuad(track, 3), null);
  const p = printQuad(track, 1)!; // each corner moved out from the middle (130, 140) by the pale edge, in the same order
  p.forEach(([x, y], i) => { const [qx, qy] = q[i], out = Math.hypot(x - 130, y - 140) - Math.hypot(qx - 130, qy - 140); assert.ok(Math.abs(out - MATTE.print) < 1e-9 && Math.sign(x - 130) === Math.sign(qx - 130), `hörn ${i}`); });
  assert.ok(printQuad(track, 2)![0][0] < 0, 'filmens eget kort där spåret ritar kortet någon annanstans');
  const alt = [{frame: 1, side: 'FRONT', quad: [[200, 200], [260, 200], [260, 280], [200, 280]]}];
  assert.ok(printQuad(track, 1, alt)![0][0] < 200 && printQuad(track, 1, alt)![0][0] > 198, 'den andra filens fyrhörning');
  const mirrored = printQuad({frames: [{frame: 0, side: 'FRONT', quad: [q[1], q[0], q[3], q[2]]}]}, 0)!;
  assert.ok(mirrored[0][0] < mirrored[1][0], 'en spegelvänd fyrhörning vänds rätt');
});

test('a film pixel finds its place on the print: the quad\'s corners are the print\'s corners', () => {
  const q = [[812.3, 1066.1], [889.4, 1067.9], [893.2, 1136.2], [815.9, 1135.7]], m = toPrint(q), H = squareToQuad(q);
  const apply = (p: number[]) => { const w = m[6] * p[0] + m[7] * p[1] + m[8]; return [(m[0] * p[0] + m[1] * p[1] + m[2]) / w, (m[3] * p[0] + m[4] * p[1] + m[5]) / w]; };
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach((st, i) => { const [u, v] = apply(q[i]); assert.ok(Math.abs(u - st[0]) < 1e-9 && Math.abs(v - st[1]) < 1e-9, `hörn ${i}`); });
  const mid = onSquare(H, 0.3, 0.7), back = apply(mid); assert.ok(Math.abs(back[0] - 0.3) < 1e-9 && Math.abs(back[1] - 0.7) < 1e-9);
  const off = toPrint(null), w = off[8]; assert.ok(off[2] / w < 0 && off[5] / w < 0, 'utan fyrhörning ligger varje punkt utanför trycket och läser dess kant');
  assert.deepEqual(toPrint([[0, 0], [0, 0], [0, 0], [0, 0]]), off, 'en hopfallen fyrhörning likaså');
});

test('the back print as one colour is its mean in linear light', () => {
  const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]); // white, black, and one transparent pixel that does not count
  assert.deepEqual(meanLinear(rgba), [0.5, 0.5, 0.5]);
  assert.deepEqual(meanLinear(new Uint8Array(0)), [0, 0, 0]);
});

test('the passes\' loops reach as far as their widest step', () => {
  assert.ok(MORPH_FRAGMENT.includes(`i <= ${Math.max(MATTE.fringe, MATTE.near, MATTE.thin + MATTE.keep, MATTE.beside)}`));
  assert.ok(SHADE_FRAGMENT.includes(`i <= ${Math.ceil(3 * Math.max(MATTE.sigma.back, MATTE.sigma.face))}`));
});

test('a washed-out face is card only where the card was and while the track shows the face; skin, blouse, sleeve and felt never are', () => {
  // seat 1 (paow-giv-2-1-p1-06-01), the face's mean colour in frames 75-80, and its lighter and bluer ends
  for (const c of [[192, 193, 239], [201, 205, 244], [215, 219, 245], [197, 202, 246], [175, 185, 240]]) assert.equal(on('pale', c), true, `blek ${c}`);
  // skin from fingertip to knuckle, the pale "skin" inside the card's quad in frames 70-74 (227/181/189), her cream blouse, her white, the jacket, the felt, the screen
  for (const c of [[247, 181, 126], [246, 175, 151], [227, 181, 189], [230, 185, 198], [235, 222, 210], [240, 240, 235], [250, 250, 250], [20, 22, 25], [30, 140, 60], [50, 220, 90]]) assert.equal(on('pale', c), false, `inte blek ${c}`);
  assert.ok(CLASSIFY_FRAGMENT.includes('if (paleOn > .5 && inZone(p)) {') && CLASSIFY_FRAGMENT.includes('if (paleOf(c.r, c.g, c.b) ||'), 'only inside the zone');
  const q = (x: number) => [[x, 800], [x + 90, 800], [x + 90, 960], [x, 960]], frames = Array.from({length: 10}, (_, i) => ({frame: i, side: i < 5 ? 'BACK' : 'FRONT', quad: q(200 + i * 4), edge: null}));
  assert.equal(paleZone({frames}, 4), null, 'not while the back shows'); assert.equal(paleZone({frames}, 3), null);
  const zone = paleZone({frames}, 9)!, xs = zone.map(p => p[0]), ys = zone.map(p => p[1]);
  assert.ok(Math.min(...xs) < 200 + 5 * 4 && Math.max(...xs) > 200 + 9 * 4 + 90, 'the frames before are in it'); assert.ok(Math.min(...ys) < 800 && Math.max(...ys) > 960 && Math.max(...ys) < 1020, 'grown, not far');
});

test('in the turn the film\'s washed-out card counts as card, each side in its half, never skin, her clothes, the screen or the shoe', async () => {
  // seat 4 (paow-giv-2-1-p4-04-01): the back washed dull in frame 45 and at seat 7 light; the face blurred into teal in frames 50-52
  for (const c of [[178, 159, 91], [197, 172, 97], [211, 200, 95], [204, 182, 104]]) assert.equal(on('turnBack', c), true, `matt baksida ${c}`);
  assert.equal(on('paleBack', [248, 241, 112]), true);
  for (const c of [[14, 98, 104], [21, 96, 100], [51, 101, 106], [10, 96, 109]]) assert.equal(on('turnFace', c), true, `blågrön framsida ${c}`);
  // skin in light and shadow, skin blurred into the screen at the hand's edge (seat 4 frames 51-52), the hole card's fingers over the
  // felt, her cream top, her hair, the jacket, the card's grey edge over it, the screen, mint (a light card blurred into the screen)
  const others = [[215, 152, 134], [240, 200, 170], [230, 180, 150], [150, 95, 70], [133, 121, 66], [119, 102, 53], [240, 225, 205], [230, 220, 180], [34, 20, 33], [87, 82, 87], [104, 95, 91], [15, 232, 41], [50, 220, 90], [162, 210, 83], [149, 202, 148], [25, 30, 70]];
  for (const c of others) for (const name of ['turnBack', 'turnFace', 'paleBack'] as const) assert.equal(on(name, c), false, `${name} tar ${c}`);
  // what lies within 3 px of a hand keeps the film's colour: the hand rule is skin in light and shadow, not the card
  for (const c of [[215, 152, 134], [150, 95, 70], [200, 130, 100]]) assert.equal(on('hand', c), true, `hand ${c}`);
  for (const c of [[178, 159, 91], [14, 98, 104], [231, 212, 78], [15, 232, 41], [34, 20, 33]]) assert.equal(on('hand', c), false, `inte hand ${c}`);
  assert.ok(CLASSIFY_FRAGMENT.includes('!handNear(uv)') && CLASSIFY_FRAGMENT.includes('p.x >= shoeBox.x'), 'not beside a hand, not in the shoe window');
  assert.ok(CLASSIFY_FRAGMENT.includes('turn && turnFaceOf') && CLASSIFY_FRAGMENT.includes('turn && (paleBackOf'), 'each side by its own rules');
  // the zone: the whole turn, from the last back to the first face, the back's half first
  const q = (x: number, y: number) => [[x, y], [x + 60, y], [x + 60, y + 90], [x, y + 90]];
  const frames = [{frame: 0, side: 'BACK', quad: q(100, 400), edge: null}, {frame: 1, side: 'BACK', quad: q(120, 420), edge: null}, {frame: 2, side: 'EDGE', quad: null, edge: [[160, 470], [170, 520]]},
    {frame: 3, side: 'EDGE', quad: null, edge: [[180, 480], [185, 530]]}, {frame: 4, side: 'FRONT', quad: null, edge: null}, {frame: 5, side: 'FRONT', quad: q(200, 520), edge: null}, {frame: 6, side: 'FRONT', quad: q(210, 530), edge: null}];
  const track = {frames, leavesShoe: 0} as never;
  assert.equal(turnZone(track, 1), null); assert.equal(turnZone(track, 5), null);
  const z2 = turnZone(track, 2)!, z4 = turnZone(track, 4)!, xs = z2.zone.map(p => p[0]), ys = z2.zone.map(p => p[1]);
  assert.ok(Math.min(...xs) < 120 && Math.max(...xs) > 260 && Math.min(...ys) < 420 && Math.max(...ys) > 610, 'the last back and the first face are in it');
  assert.equal(z2.back, true); assert.equal(turnZone(track, 3)!.back, true); assert.equal(z4.back, false); assert.deepEqual(z4.zone, z2.zone);
  // and the deal draws no card in the turn: the film's own card is recoloured there instead (src/scene3d-deal.ts)
  const deal = await readFile('src/scene3d-deal.ts', 'utf8');
  // (only an edge line is still drawn and keyed there: a thin sliver is too thin for the matte's body)
  assert.ok(deal.includes('now = drawn && (drawn.line || !turning(track, at, extra)) ? drawn : null') && deal.includes('if (inHand || turning(track, at, extra)) drawMatte('), 'no card in the turn but an edge line, the matte there');
  assert.ok(deal.includes("carryOf(extra) === 'film') return false"), 'Bara liggande leaves the film\'s card');
  // one card at the shoe (Prov kort-en-linje, step 1): the shoe window's card is the film's own, recoloured, neither drawn nor
  // keyed, in every carry but 'film' and without the shoe model; the dealt card is the film's own until two frames after it has
  // left the window, and the matte recolours both there, then the window alone
  assert.ok(deal.includes("const filmSeat = (extra: Extra) => carryOf(extra) !== 'film' && !shoeModel();") && deal.includes('seated: ownSeat ? null :'), 'the window card the film\'s own');
  // with carry 'film' (kort=liggande) the window's card is left as the film has it: not drawn, not keyed and not recoloured (a
  // black card was drawn there, and she pulled the film's yellow card out of it). Where a page says no carry, the layer takes
  // the game's line, which is the drawn card in her hand.
  assert.equal(CARRY, 'object');
  assert.ok(deal.includes('const carryOf = (extra: Extra): Carry => extra.carry ?? CARRY;'), 'a page that says nothing gets the line');
  assert.ok(deal.includes("const leftSeat = (extra: Extra) => carryOf(extra) === 'film' && !shoeModel();") && deal.includes('const ownSeat = filmSeat(extra) || leftSeat(extra);'), 'the window card left to the film under the line');
  assert.ok(deal.includes('early = (model || filmSeat(extra)) && inShoe(track, at)') && deal.includes('at < track.leavesShoe + 2'), 'the dealt card drawn once it has left the window');
  assert.ok(deal.includes('else if (filmSeat(extra)) drawMatte(track, at, choice, extra, false, !inShoe(track, at), true);'), 'the matte at the shoe in every frame, in the drawn back\'s black field');
});

test('the recoloured back keeps the film\'s light on it, stronger, and a lighter edge: flat it read as a hole', () => {
  assert.ok(MATTE_GLSL.includes(`pow(shadeB, ${MATTE.contrast.toFixed(1)})`) && MATTE_GLSL.includes('float edgeB = (1. - smoothstep('), 'light and edge in the shader');
  assert.ok(MATTE.contrast > 1 && MATTE.edgeShare > 0 && MATTE.edgeShare < 1 && MATTE.edge[0] < MATTE.edge[1]);
});

test('the drawn print at the film\'s sharpness and level (Prov kort-en-linje, step 2): the back read coarser and dimmer, the face less so', async () => {
  const deal = await readFile('src/scene3d-deal.ts', 'utf8');
  const m = /export const PRINT = \{soft: ([\d.]+), softFace: ([\d.]+), back: ([\d.]+), face: ([\d.]+), in: (\d+)\};/.exec(deal);
  assert.ok(m, 'PRINT stands in the deal');
  const [soft, softFace, back, face, frames] = m.slice(1).map(Number);
  assert.ok(soft > softFace && softFace > 0 && soft <= 2, 'the back softer than the face, whose value must stay legible');
  assert.ok(back < face && face <= 1 && back >= 0.5, 'the gold of the back dimmed more than the face');
  assert.ok(deal.includes('mix(field, texture2D(print, vUv, soft).rgb, printIn) * level'), 'the shader reads the print with them');
  assert.ok(deal.includes('u.soft.value = back ? PRINT.soft : PRINT.softFace'), 'each print its own');
  // the back's print comes in over several frames once the dealt card is drawn after the shoe (until then the film's own card,
  // recoloured to the back's field): no single frame switches the gold on (the boss film's review: 14 draws of 14)
  assert.ok(frames >= 4 && frames <= 12, 'over several frames, under half a second');
  assert.ok(deal.includes("const since = filmSeat(extra) && typeof track!.leavesShoe === 'number' ? at - (track!.leavesShoe + 2) + 1 : Infinity, t = Math.max(0, Math.min(1, since / (PRINT.in + 1)));"), 'from the first frame drawn after the shoe, where the film showed its card before');
  assert.ok(deal.includes('printIn: t * t * (3 - 2 * t)') && deal.includes('u.printIn.value = back ? how.printIn ?? 1 : 1; if (back) (u.field.value as T.Vector3).fromArray(backBody());'), 'smoothly, over the back\'s own field, on the back only');
  const shown = Array.from({length: frames + 3}, (_, i) => { const s = Math.max(0, Math.min(1, (i + 1) / (frames + 1))); return s * s * (3 - 2 * s); });
  assert.ok(shown[0] < 0.1 && shown[frames] === 1 && shown.every((s, i) => !i || s - shown[i - 1] < 0.3), 'no more than 30 % of the print comes on between two frames');
});

test('the drawn card takes how the film\'s light falls across the film\'s card, and keeps its own mean (Prov kort-en-linje, step 2b)', async () => {
  // a film frame: felt, and the film's yellow card (x 100-160, y 100-190), lit evenly or brighter toward the right
  const felt = [20, 90, 60], lit = [230, 207, 5], card = [[100, 100], [160, 100], [160, 190], [100, 190]], inCard = (x: number, y: number) => x >= 100 && x <= 160 && y >= 100 && y <= 190;
  const frame = (paint: (x: number, y: number) => number[] | null) => (x: number, y: number) => (inCard(x, y) ? paint(x, y) ?? lit : felt).map(v => v / 255);
  const even = frame(() => null), ramp = frame(x => lit.map(v => v * (0.85 + 0.3 * (x - 100) / 60)));
  for (const px of [[130, 145], [95, 145], [170, 100]]) assert.ok(Math.abs(planeLight(even, card, LIT.BACK, px) - 1) < 1e-9, `even light: flat at ${px}`);
  const left = planeLight(ramp, card, LIT.BACK, [100, 145]), mid = planeLight(ramp, card, LIT.BACK, [130, 145]), right = planeLight(ramp, card, LIT.BACK, [160, 145]);
  assert.ok(Math.abs(mid - 1) < 0.02, 'its own mean in the middle');
  assert.ok(left < 0.8 && right > 1.2, 'darker on the darker side, in linear light');
  assert.ok(Math.abs(right ** (1 / PLANE.gamma) - 1.15) < 0.02 && Math.abs(left ** (1 / PLANE.gamma) - 0.85) < 0.02, 'as much darker on screen as the film\'s card');
  assert.ok(planeLight(ramp, card, LIT.BACK, [190, 145]) === PLANE.range[1] ** PLANE.gamma, 'held to its range beyond the card');
  // a finger over the left third and its deep shadow beside it are neither card colour nor light across the card: still even
  const finger = frame(x => (x < 120 ? [240, 180, 140] : x < 126 ? lit.map(v => v * 0.4) : null));
  assert.ok(Math.abs(planeLight(finger, card, LIT.BACK, [100, 145]) - 1) < 0.01 && Math.abs(planeLight(finger, card, LIT.BACK, [160, 145]) - 1) < 0.01, 'a finger and its shadow tilt nothing');
  // a card mostly hidden (too few samples of its colour): flat
  const hidden = frame((x, y) => (y < 180 ? [240, 180, 140] : null));
  assert.equal(planeLight(hidden, card, LIT.BACK, [100, 145]), 1, 'too few samples');
  // the shader is the same arithmetic, and the deal uses it for the dealt card only, and not with Bara liggande
  for (const v of [`j < ${PLANE.grid}`, PLANE.inset.toFixed(2), PLANE.dark.toFixed(2), `${PLANE.least}.`, PLANE.range[0].toFixed(2), PLANE.range[1].toFixed(2), PLANE.gamma.toFixed(1)]) assert.ok(PLANE_GLSL.includes(v), v);
  const deal = await readFile('src/scene3d-deal.ts', 'utf8');
  assert.ok(deal.includes('if (shadeOn > .5 && localOn > .5) vPlane = lightPlane(map, core, cardColour, vMean);') && deal.includes('vShade * vLight * planeLight(vPlane, vMean, filmPixel)'), 'the paper lit by it');
  assert.ok(deal.includes("local: carryOf(extra) !== 'film'}"), 'the dealt card, not with Bara liggande');
  assert.ok(deal.includes("lay(seated, seat, {print: print(), shade: {core: seat, colour: COLOUR.BACK, lying: LYING.BACK}, contact: 0})") && deal.includes('u.localOn.value = how.shade?.local ? 1 : 0;'), 'the seated card and the lying cards as before');
});

test('the dark back ("pålägg"): the film\'s yellow back goes dark in the film\'s own pixels, and skin, sleeve, blouse, screen and the shoe\'s gold do not', async () => {
  const key = [0, 201, 38].map(v => v / 255), c = (r: number, g: number, b: number) => [r, g, b].map(v => v / 255), luma = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  const dark = (col: number[], o = {}) => darkBackOf(col, key, o), same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
  // the film card's back as the films show it (Paow, 2026-11-13): lit at seat 4, oranger in the dealer's films, washed light in a
  // blurred frame (seat 7, frame 26), its orange shade under a finger, olive in the dealer's turn (frame 140): all of it the card,
  // and all of it the dark field in its own light (the washed card no lighter than a third over the field, the shade darker)
  for (const [name, col] of [['lit', c(240, 208, 3)], ['the dealer\'s', c(255, 201, 0)], ['washed', c(251, 232, 106)], ['shade', c(196, 134, 34)], ['the turn\'s olive', c(150, 140, 20)], ['her fingertip\'s orange edge', c(239, 151, 0)]] as const) {
    const r = dark(col); assert.ok(r.card > 0.95, `${name}: the card`);
    assert.ok(r.colour.every((v, i) => Math.abs(v - DARK_BACK.field[i] * r.colour[0] / DARK_BACK.field[0]) < 0.02) && luma(r.colour) <= DARK_BACK.bright * luma(DARK_BACK.field), `${name}: the dark field in its own light`); }
  assert.ok(luma(dark(c(196, 134, 34)).colour) < luma(dark(c(240, 208, 3)).colour), 'the shade stays darker than the lit card');
  // the card blurred with the screen: its part goes dark and the screen's stays for the key (the key then makes it partly see-through)
  const half = c(240, 208, 3).map((v, i) => (v + key[i]) / 2), h = dark(half);
  assert.ok(h.card > 0.95 && h.colour[1] - Math.max(h.colour[0], h.colour[2]) > 0.3, 'half card, half screen: the screen half stays screen');
  // a screen share of a few hundredths inside the card is the video's noise and goes with the card (it left the dark card mottled olive)
  const noisy = c(240, 208, 3).map((v, i) => v * 0.97 + key[i] * 0.03); assert.ok(dark(noisy).colour[1] - dark(noisy).colour[0] < 0.01, 'no green from noise');
  // what is not the card stays as the film has it, wherever it lies: skin, a pale fingertip, her cream blouse, her jacket, the screen,
  // the shoe's dark plastic, her lips; and the shoe's gold, in its window and beside it, with or without a finger near
  for (const col of [c(249, 157, 124), c(240, 200, 190), c(230, 215, 190), c(40, 30, 45), key, c(60, 58, 62), c(180, 80, 80)]) assert.ok(same(dark(col).colour, col), `${col.map(v => Math.round(v * 255))} stays`);
  for (const gold of [c(200, 160, 80), c(230, 190, 100)]) { assert.ok(same(dark(gold, {shoe: true, skin: 1}).colour, gold), 'gold in the shoe window'); assert.ok(same(dark(gold).colour, gold), 'gold with no skin near'); }
  // the card blurred over a finger (seat 4, frame 43): beside skin, outside the shoe window, its part goes dark and the finger's stays
  for (const col of [c(252, 210, 88), c(253, 215, 101)]) { const r = dark(col, {skin: 1}); assert.ok(r.card + r.finger > 0.95, 'the card and the finger');
    assert.ok(luma(r.colour) < 0.6 * luma(col) && r.colour[0] > r.colour[2] + 0.05, 'darker, and the finger\'s warmth kept'); assert.deepEqual(dark(col, {skin: 1, shoe: true}).finger, 0, 'not in the shoe window'); }
  // the film card's pale cream rim is the card's
  assert.ok(dark(c(245, 232, 170)).card > 0.8);
  // the shader is the same arithmetic
  for (const v of [...DARK_BACK.card, ...DARK_BACK.finger, DARK_BACK.share, ...DARK_BACK.shade, ...DARK_BACK.blue, ...DARK_BACK.noise, DARK_BACK.skinNear, DARK_BACK.shoeRoom, ...DARK_BACK.blurredSkin.red, ...DARK_BACK.blurredSkin.blue, ...DARK_BACK.blurredSkin.reach, DARK_BACK.blurredSkin.shoeFar]) assert.ok(FILM_CARD_GLSL.includes(v.toFixed(4)), `${v} in the shader`);
  // where it acts: the box round the track's card over this frame, the four before and the two after, grown; nothing without a card
  const q = (x: number, y: number) => [[x, y], [x + 60, y], [x + 60, y + 90], [x, y + 90]];
  const track = {frames: Array.from({length: 12}, (_, i) => ({frame: i, side: i === 6 ? 'EDGE' : 'BACK', quad: i === 6 ? null : q(100 + 10 * i, 200), edge: i === 6 ? [[150, 230], [200, 260]] : null}))};
  const z = backZone(track, 6)!; assert.deepEqual(z, [[100 + 20 - BACK_ZONE.grow, 200 - BACK_ZONE.grow], [100 + 80 + 60 + BACK_ZONE.grow, 200 - BACK_ZONE.grow], [100 + 80 + 60 + BACK_ZONE.grow, 290 + BACK_ZONE.grow], [100 + 20 - BACK_ZONE.grow, 290 + BACK_ZONE.grow]]);
  assert.equal(backZone({frames: track.frames.map(f => ({...f, side: 'NONE', quad: null, edge: null}))}, 6), null);
  // the scene: a word asks for it (BACK is 'film', the back as filmed), with the film's own card in her hand and beneath the drawn card
  // alike ("underlägg"), and not with the shoe model; the film's shader recolours before its key, and the card key and the matte read
  // the film's own colour, so beneath the drawn card only what they leave of the film's card is recoloured
  assert.equal(BACK, 'film');
  const deal = await readFile('src/scene3d-deal.ts', 'utf8'), film = await readFile('src/scene3d-film.ts', 'utf8');
  assert.ok(deal.includes("const backOf = (choice: Choice, extra: Extra): 'film' | 'dark' => extra.back ?? choice.back ?? BACK;") && deal.includes("if ((dark || paper) && !shoeModel())"), 'asked for, under either carry');
  // beneath the drawn card the shoe window is the matte's and a card blurred with a finger is the key's: neither is recoloured there
  const matteSrc = await readFile('src/scene3d-matte.ts', 'utf8');
  assert.ok(deal.includes("under: carry !== 'film'}); }") && film.includes('back.backUnder.value = b.under ? 1 : 0;') && matteSrc.includes('if (backUnder > .5 && shoe > .5) return c;') && matteSrc.includes('(1. - shoe) * (1. - backUnder)'), 'beneath the drawn card: not the window, not fingers');
  // ... and beside skin the back's share is de-yellowed, not darkened, and the face goes paper only where it is solid card
  const glsl = (await import('../src/scene3d-matte.ts')).FILM_CARD_GLSL, backFn = glsl.slice(glsl.indexOf('vec3 backSide'), glsl.indexOf('float faceCardOf')), faceFn = glsl.slice(glsl.indexOf('vec3 faceSide'), glsl.indexOf('vec3 beforeEven'));
  assert.ok(backFn.includes('card = mix(card, vec3(c.r, c.g, max(c.b, .8 * c.g)), near);') && !faceFn.includes('card = mix(card, vec3(c.r'), 'beside skin the back is de-yellowed');
  assert.ok(faceFn.includes('if (backUnder > .5) w1 *= smoothstep(.4, .7, u.x);') && !backFn.includes('w1 *= smoothstep(.4, .7, u.x)'), 'the face paper only where solid');
  assert.ok(deal.includes('o.film.setMatte(null); o.film.setBack(null); }') && deal.includes('drawMatte(track, at, choice, extra); o.film.setBack(null); }'), 'off with the cards, and with the matte');
  assert.ok(film.includes('vec3 raw = c; if ((backOn > .5 || faceOn > .5) && frameOn < .5) c = filmCard(c, vec2(uv.x, 1. - uv.y) * FILM_PX, key);') && film.includes('o = keyCards(o, uv, raw, key)') && film.includes('matteCard(o, vec2(uv.x, 1. - uv.y) * FILM_PX, raw, key'), 'before the key; the card key reads the film');
});

test('the paper face ("pålägg: framsidan"): the blue face of the film goes paper in its own pixels, washed lilac and the teal of the turn too, and nothing else', async () => {
  const key = [0, 201, 38].map(v => v / 255), c = (r: number, g: number, b: number) => [r, g, b].map(v => v / 255), luma = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  // (what stays may move by a level or two: her jacket's darkest blue is a hundredth the face's)
  const face = (col: number[], o = {}) => darkBackOf(col, key, {side: 'face', ...o}), same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.008);
  // the face as the films show it: lit (seat 4), in a finger's shadow, washed to lilac (seat 1, frames 74-81), the turn's teal and mint
  // with the screen (seat 4, frames 50-52): all the card, and paper in its own light, at most PAPER_FACE.bright over the paper lying flat
  for (const [name, col] of [['lit', c(0, 121, 227)], ['shadow', c(0, 70, 140)], ['lilac', c(205, 206, 243)], ['teal', c(14, 98, 104)], ['mint', c(51, 101, 106)]] as const) {
    const r = face(col); assert.ok(r.card > 0.9, `${name}: the face`); assert.ok(luma(r.colour) <= PAPER_FACE.bright * luma(PAPER_FACE.field) + 1e-6, `${name}: no brighter than paper allows`); }
  assert.ok(Math.abs(luma(face(c(0, 121, 227)).colour) - luma(PAPER_FACE.field) * (luma(c(0, 121, 227)) / PAPER_FACE.lying) ** PAPER_FACE.response) < 0.02, 'lit about as lying flat: the paper');
  assert.ok(luma(face(c(0, 70, 140)).colour) < 0.85 * luma(face(c(0, 121, 227)).colour), 'the shadow of a finger stays a shadow');
  assert.ok(same(face(c(14, 98, 104)).colour, face(c(14, 98, 104)).colour.map((v, i, a) => v)) && face(c(14, 98, 104)).colour[1] - face(c(14, 98, 104)).colour[0] < 0.05, 'teal is the card, not screen: no green kept');
  // half face, half screen: the screen half stays for the key
  const half = c(0, 121, 227).map((v, i) => (v + key[i]) / 2), h = face(half); assert.ok(h.card > 0.9 && h.colour[1] - Math.max(h.colour[0], h.colour[2]) > 0.2, 'the screen half stays screen');
  // not the face: the yellow back, skin, a pale fingertip, her blouse, her jacket, the screen, gold, lips
  for (const col of [c(240, 208, 3), c(249, 157, 124), c(240, 200, 190), c(225, 200, 215), c(230, 215, 190), c(40, 30, 45), key, c(200, 160, 80), c(180, 80, 80)]) assert.ok(same(face(col).colour, col), `${col.map(v => Math.round(v * 255))} stays`);
  // and the back's rule does not take the face
  assert.ok(darkBackOf(c(0, 121, 227), key).card < 0.05);
  // the shader has both sides, the face with its own colour, whiteness and light; the deal asks for each by its word (FACE: as filmed)
  for (const v of [...PAPER_FACE.card, ...PAPER_FACE.pale, ...PAPER_FACE.screen, ...PAPER_FACE.red, ...PAPER_FACE.dim, PAPER_FACE.smooth, PAPER_FACE.bright, PAPER_FACE.response]) assert.ok(FILM_CARD_GLSL.includes(v.toFixed(4)), `${v} in the shader`);
  assert.ok(FILM_CARD_GLSL.includes('vec3 backSide(') && FILM_CARD_GLSL.includes('vec3 faceSide(') && FILM_CARD_GLSL.includes('return wf > wb ? f : b;'));
  assert.equal(FACE, 'film');
  const deal = await readFile('src/scene3d-deal.ts', 'utf8');
  assert.ok(deal.includes("const faceOf = (choice: Choice, extra: Extra): 'film' | 'paper' => extra.face ?? choice.face ?? FACE;") && deal.includes('face: paper ? PAPER_FACE.field : null'), 'the face by its own word');
});
