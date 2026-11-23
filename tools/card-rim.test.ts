// tools/card-rim.ts on made-up pictures at the bank's size: the pale rim round the dealt card becomes felt and the card's
// colour keeps its place and size; a finger lying over the rim stays; the shoe and its window are never touched; a dim patch
// of card colour on her hand is not the card; and the step over a film counts what it did. The other way, the rim in the card's
// own colour: the card keeps its outer size, her finger stays on it, and a blend into the felt stays a blend. The colours are the
// ones measured on paow-giv-2-3-p3-01 (felt, blue face, yellow back, rim, her skin).
import test from 'node:test';
import assert from 'node:assert/strict';
import {W, H, type Rgb} from './order-images.ts';
import {SHOE_WINDOW} from '../src/film-after.ts';
import {is} from '../src/card-track.ts';
import {CARD_RIM, cardRimOff, rimOffFilm, shoeKeep} from './card-rim.ts';
import {readFlags} from './film-after.ts';

type Block = [number[], number, number, number, number];
const FELT = [0, 236, 43], BLUE = [103, 192, 245], YELLOW = [234, 241, 14], WHITE = [248, 248, 245], SKIN = [238, 152, 156], PINK = [235, 140, 225], RED = [200, 30, 80], DARK = [20, 20, 20];
const picture = (...blocks: Block[]): Buffer => {
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set(FELT, i * 3);
  for (const [colour, x0, y0, w, h] of blocks) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) rgb.set(colour, (y * W + x) * 3);
  return rgb;
};
const at = (rgb: Rgb, x: number, y: number) => [...rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
const count = (rgb: Rgb, rule: (r: number, g: number, b: number) => boolean) => { let n = 0; for (let p = 0; p < rgb.length; p += 3) if (rule(rgb[p], rgb[p + 1], rgb[p + 2])) n++; return n; };
const same = (a: Rgb, b: Rgb, [, x0, y0, w, h]: Block) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (at(a, x, y).join() !== at(b, x, y).join()) return false; return true; };
const pale = (r: number, g: number, b: number) => Math.min(r, g, b) > 150;
// The dealt card face up at its seat: a rim 8 px wide round the blue, the pink cross and the red dot in the blue.
const RIM: Block = [WHITE, 600, 1020, 100, 70], FACE: Block = [BLUE, 608, 1028, 84, 54], CROSS: Block[] = [[PINK, 636, 1052, 28, 6], [PINK, 647, 1041, 6, 28]], DOT: Block = [RED, 676, 1068, 10, 10];
const NO_SHOE = shoeKeep(picture());

test('the pale rim round a blue card becomes felt, and the card\'s colour keeps its place and size', () => {
  const before = picture(RIM, FACE, ...CROSS, DOT), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE);
  assert.equal(did.cards, 1);
  assert.equal(did.painted, 100 * 70 - 84 * 54, 'every pixel of the rim, and nothing else');
  assert.equal(count(after, pale), 0, 'no pale pixel is left');
  assert.deepEqual(at(after, 603, 1050), FELT, 'the rim is the felt beside it');
  assert.deepEqual(at(after, 650, 1022), FELT);
  const [r, g, b] = at(after, 607, 1050);
  assert.ok(g - Math.max(r, b) > 40 && b > FELT[2], `the pixel nearest the card is felt with a share of the card's colour: ${[r, g, b]}`);
  assert.ok(did.softEdge > 0 && did.softEdge < did.painted);
  assert.ok(same(before, after, FACE), 'the blue, the cross and the dot are as they were');
  assert.equal(count(after, is.blue), count(before, is.blue), 'the card is as large as it was by the lab\'s rule');
  assert.ok(same(before, after, [FELT, 560, 980, 40, 150]) && same(before, after, [FELT, 600, 1090, 100, 40]), 'the felt outside the rim is as it was');
});

test('a fingertip lying over the rim and the card stays as it is, and the rim beside it goes', () => {
  const FINGER: Block = [SKIN, 640, 990, 24, 50];
  const before = picture(RIM, FACE, ...CROSS, DOT, FINGER), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE);
  assert.ok(same(before, after, FINGER), 'her finger is as it was');
  assert.equal(did.painted, 100 * 70 - 84 * 54 - 24 * 8, 'all of the rim that shows');
  assert.equal(did.herEdge, 0, 'skin with no share of white in it is not changed');
  assert.deepEqual(at(after, 638, 1023), FELT, 'the rim right beside her finger is felt');
  assert.ok(same(before, after, FACE));
});

test('a card in the shoe\'s window is never touched', () => {
  const [x0, y0] = SHOE_WINDOW;
  const before = picture([WHITE, x0 + 30, y0 + 40, 90, 70], [YELLOW, x0 + 35, y0 + 45, 80, 60]), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE);
  assert.deepEqual(did, {cards: 0, painted: 0, softEdge: 0, herEdge: 0});
  assert.ok(before.equals(after));
});

test('the rim goes where the card lies on the felt and stays where it lies on the shoe', () => {
  // The shoe as the anchor shows it (beside its window), and the yellow back half out of it: the card's right part still lies on the shoe.
  const SHOE: Block = [DARK, 1500, 800, 150, 100], rim: Block = [WHITE, 1434, 834, 112, 62], back: Block = [YELLOW, 1440, 840, 100, 50];
  const keep = shoeKeep(picture(SHOE)), before = picture(SHOE, rim, back), after = Buffer.from(before), did = cardRimOff(after, keep);
  assert.equal(did.cards, 1);
  assert.deepEqual(at(after, 1436, 860), FELT, 'on the felt the rim is felt');
  assert.deepEqual(at(after, 1460, 836), FELT);
  assert.deepEqual(at(after, 1520, 836), WHITE, 'on the shoe the rim is left');
  assert.deepEqual(at(after, 1543, 860), WHITE);
  assert.ok(same(before, after, SHOE), 'the shoe and what lies on it are as they were');
  assert.ok(same(before, after, back), 'the yellow is as it was');
});

test('a dim patch of card colour on her hand is not the card: the rim on that side goes too', () => {
  // A tattoo's shading reads as dim yellow (frame 20 of paow-giv-2-3-p3-01); taken for the card it drew the outline out over her hand.
  const rim: Block = [WHITE, 1052, 884, 86, 54], back: Block = [YELLOW, 1058, 890, 74, 42], HAND: Block = [SKIN, 1010, 830, 50, 40], PATCH: Block = [[114, 124, 45], 1036, 857, 6, 4];
  const before = picture(rim, back, HAND, PATCH), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE);
  assert.equal(did.painted, 86 * 54 - 74 * 42, 'every pixel of the rim');
  assert.deepEqual(at(after, 1054, 886), FELT, 'the corner nearest her hand');
  assert.ok(same(before, after, HAND), 'her hand and the patch are as they were');
});

test('the felt the rim has tinted goes with it, and in a dark shadow the soft edge never reads as the card\'s colour', () => {
  // Below the card the felt lies in her hand's shadow (yellow over it, two parts to three, is yellow by the lab's rule); left of
  // the rim the felt is tinted grey for three pixels, as right outside a rim in a film.
  const rim: Block = [WHITE, 1052, 884, 86, 54], back: Block = [YELLOW, 1058, 890, 74, 42], SHADOW: Block = [[40, 110, 35], 1040, 938, 110, 30], TINT: Block = [[30, 200, 40], 1049, 890, 3, 40];
  const before = picture(SHADOW, TINT, rim, back), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE);
  assert.ok(did.painted >= 86 * 54 - 74 * 42 + 3 * 40, 'the rim and the tinted felt beside it');
  assert.equal(count(after, pale), 0, 'no pale pixel is left');
  const tint = at(after, 1050, 910), under = at(after, 1095, 936);
  assert.ok(tint[0] < 8 && tint[1] > 230, `the tinted felt is plain felt: ${tint}`);
  assert.ok(under[1] < 140 && under[1] - Math.max(under[0], under[2]) > 40, `under the card the rim is the shadow's felt: ${under}`);
  assert.equal(count(after, is.yellow), count(before, is.yellow), 'the card is as large as it was by the lab\'s rule');
  assert.ok(same(before, after, back), 'the yellow is as it was');
});

test('a frame without a card outside the shoe is left as it is, and a frame of another size is refused', () => {
  const before = picture([SKIN, 600, 900, 80, 60], [WHITE, 900, 900, 30, 30]), after = Buffer.from(before);
  assert.deepEqual(cardRimOff(after, NO_SHOE), {cards: 0, painted: 0, softEdge: 0, herEdge: 0});
  assert.ok(before.equals(after));
  assert.throws(() => cardRimOff(Buffer.alloc(100 * 100 * 3), new Uint8Array(100 * 100)), /Rutan är inte bankens/);
});

test('over a film the step takes the frames as the after-work has them and counts what it did', () => {
  const bgr = (rgb: Buffer) => { const out = new Uint8Array(rgb.length); for (let p = 0; p < rgb.length; p += 3) { out[p] = rgb[p + 2]; out[p + 1] = rgb[p + 1]; out[p + 2] = rgb[p]; } return out; };
  const empty = bgr(picture()), card = bgr(picture(RIM, FACE, ...CROSS, DOT)), film = rimOffFilm(bgr(picture()));
  film.add(empty); film.add(card);
  const r = film.result();
  assert.deepEqual([r.frames, r.framesChanged, r.firstFrame, r.lastFrame, r.pixelsPainted], [2, 1, 1, 1, 100 * 70 - 84 * 54]);
  assert.deepEqual(r.perFrame.map((f) => f.frame), [1]);
  assert.ok(empty.every((v, p) => v === [FELT[2], FELT[1], FELT[0]][p % 3]), 'the frame without a card is as it was');
  const p = (1050 * W + 603) * 3;
  assert.deepEqual([...card.subarray(p, p + 3)], [FELT[2], FELT[1], FELT[0]], 'the rim is felt in the frame itself, blue first');
});

test('where the film stands still the result stands still, and where it moves the result follows', () => {
  const bgr = (rgb: Buffer) => { const out = new Uint8Array(rgb.length); for (let p = 0; p < rgb.length; p += 3) { out[p] = rgb[p + 2]; out[p + 1] = rgb[p + 1]; out[p + 2] = rgb[p]; } return out; };
  const px = (frame: Uint8Array, x: number, y: number) => { const p = (y * W + x) * 3; return [frame[p + 2], frame[p + 1], frame[p]]; };
  // The second frame is the first with the film's own small unrest: the rim a little darker, and the felt left of it lighter.
  // Alone it would be painted with that lighter felt at once; in the film the paint of the first frame stays and glides there.
  const LIGHTER: Block = [[0, 250, 43], 560, 1020, 40, 70], GREYER: Block = [[244, 244, 241], 600, 1020, 8, 70];
  const first = bgr(picture(RIM, FACE, ...CROSS, DOT)), second = bgr(picture(LIGHTER, RIM, GREYER, FACE, ...CROSS, DOT)), third = bgr(picture()), alone = picture(LIGHTER, RIM, GREYER, FACE, ...CROSS, DOT);
  cardRimOff(alone, NO_SHOE);
  assert.deepEqual(at(alone, 603, 1050), [0, 250, 43], 'alone, the rim of the second frame is its own lighter felt');
  const film = rimOffFilm(bgr(picture()));
  film.add(first); film.add(second); film.add(third);
  assert.deepEqual(px(first, 603, 1050), FELT);
  assert.deepEqual(px(second, 603, 1050), [0, 236 + CARD_RIM.slew, 43], 'the paint of the first frame, one step nearer the lighter felt');
  assert.deepEqual(px(second, 580, 1050), [0, 250, 43], 'the felt the step never changed is as the film has it');
  assert.deepEqual(px(third, 603, 1050), FELT, 'the card gone: the felt as the film has it');
  assert.ok(third.every((v, p) => v === [FELT[2], FELT[1], FELT[0]][p % 3]), 'nothing is held over where the film has moved on');
  const r = film.result();
  assert.deepEqual([r.frames, r.framesChanged, r.firstFrame, r.lastFrame], [3, 2, 0, 1]);
  assert.ok(r.perFrame[1].held > 0 && r.perFrame[0].held === 0 && r.held === r.perFrame[1].held);
});

test('a pixel that was the card\'s colour a frame ago and stands still is left as the film has it', () => {
  const bgr = (rgb: Buffer) => { const out = new Uint8Array(rgb.length); for (let p = 0; p < rgb.length; p += 3) { out[p] = rgb[p + 2]; out[p + 1] = rgb[p + 1]; out[p + 2] = rgb[p]; } return out; };
  const px = (frame: Uint8Array, x: number, y: number) => { const p = (y * W + x) * 3; return [frame[p + 2], frame[p + 1], frame[p]]; };
  // The card's outermost column is a lighter blue: the card's colour by the lab's rule in the first frame and, two levels off,
  // just not in the second. Alone the second frame would have it painted; in the film it stays the card's.
  const EDGE = [120, 200, 234], OFF = [122, 204, 232], column = (c: number[]): Block => [c, 608, 1028, 1, 54];
  assert.ok(is.blue(EDGE[0], EDGE[1], EDGE[2]) && !is.blue(OFF[0], OFF[1], OFF[2]));
  const alone = picture(RIM, FACE, column(OFF), ...CROSS, DOT);
  cardRimOff(alone, NO_SHOE);
  assert.notDeepEqual(at(alone, 608, 1050), OFF, 'alone, the column is taken for rim');
  const first = bgr(picture(RIM, FACE, column(EDGE), ...CROSS, DOT)), second = bgr(picture(RIM, FACE, column(OFF), ...CROSS, DOT)), film = rimOffFilm(bgr(picture()));
  film.add(first); film.add(second);
  assert.deepEqual(px(first, 608, 1050), EDGE);
  assert.deepEqual(px(second, 608, 1050), OFF, 'in the film it is left as it came');
  assert.deepEqual(px(second, 603, 1050), FELT, 'and the rim beside it is felt');
});

test('a result is held only beside what the step changes in the frame: where the card has moved on the film is as it came', () => {
  const bgr = (rgb: Buffer) => { const out = new Uint8Array(rgb.length); for (let p = 0; p < rgb.length; p += 3) { out[p] = rgb[p + 2]; out[p + 1] = rgb[p + 1]; out[p + 2] = rgb[p]; } return out; };
  const px = (frame: Uint8Array, x: number, y: number) => { const p = (y * W + x) * 3; return [frame[p + 2], frame[p + 1], frame[p]]; };
  // A grey tint on the felt right beside the rim goes with the rim. In the second frame the card lies 300 px to the right and the
  // tint is still on the felt, pixel for pixel as it was: nothing is painted beside it any more, so it is the film's again.
  const TINT: Block = [[12, 236, 43], 596, 1030, 4, 20], moved = (b: Block): Block => [b[0], b[1] + 300, b[2], b[3], b[4]];
  const first = bgr(picture(TINT, RIM, FACE, ...CROSS, DOT)), second = bgr(picture(TINT, ...[RIM, FACE, ...CROSS, DOT].map(moved)));
  const film = rimOffFilm(bgr(picture()));
  film.add(first); film.add(second);
  assert.ok(px(first, 597, 1040)[0] < 8, `beside the rim the tint is painted as felt: ${px(first, 597, 1040)}`);
  assert.deepEqual(px(second, 597, 1040), [12, 236, 43], 'with the card gone from there the tint is as the film has it');
  assert.deepEqual(px(second, 903, 1050), FELT, 'and the rim is painted where the card now lies');
  assert.equal(film.result().held, 0);
});

test('in the card\'s own colour the rim becomes the card\'s colour: the card keeps its outer size, and its marks are as they were', () => {
  const before = picture(RIM, FACE, ...CROSS, DOT), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE, 'card');
  assert.deepEqual(did, {cards: 1, painted: 100 * 70 - 84 * 54, softEdge: 0, herEdge: 0}, 'every pixel of the rim, and nothing else');
  assert.equal(count(after, pale), 0, 'no pale pixel is left');
  for (const [x, y] of [[600, 1020], [603, 1050], [650, 1022], [699, 1089], [650, 1085]]) assert.deepEqual(at(after, x, y), BLUE, `the rim at ${x},${y} is the blue beside it`);
  assert.equal(count(after, is.blue), count(before, is.blue) + did.painted, 'by the lab\'s rule the card now reaches the rim\'s outer edge');
  assert.ok(same(before, after, FACE), 'the blue, the cross and the dot are as they were');
  assert.ok(same(before, after, [FELT, 560, 980, 40, 150]) && same(before, after, [FELT, 600, 1090, 100, 40]), 'the felt outside the rim is as it was');
  // The yellow back likewise: yellow beside yellow.
  const rim: Block = [WHITE, 1052, 884, 86, 54], back: Block = [YELLOW, 1058, 890, 74, 42], yellow = picture(rim, back);
  assert.equal(cardRimOff(yellow, NO_SHOE, 'card').painted, 86 * 54 - 74 * 42);
  assert.deepEqual(at(yellow, 1054, 910), YELLOW);
  assert.equal(count(yellow, is.yellow), 86 * 54);
});

test('in the card\'s own colour her finger stays on the card, the rim\'s blend into the felt stays a blend, and the card\'s paled edge goes', () => {
  // Her fingertip over the rim; the rim's outermost column half white and half felt; the card's outermost column paled by the rim.
  const FINGER: Block = [SKIN, 640, 990, 24, 50], HALF: Block = [[124, 242, 144], 600, 1020, 1, 70], PALED: Block = [[120, 200, 234], 608, 1028, 1, 54];
  const before = picture(RIM, HALF, FACE, PALED, ...CROSS, DOT, FINGER), after = Buffer.from(before), did = cardRimOff(after, NO_SHOE, 'card');
  assert.ok(same(before, after, FINGER), 'her finger is as it was');
  assert.equal(did.painted, 100 * 70 - 84 * 54 - 24 * 8, 'all of the rim that shows');
  assert.deepEqual(at(after, 638, 1023), BLUE, 'the rim right beside her finger is the card\'s colour: she holds the card');
  assert.deepEqual(at(after, 608, 1050), BLUE, 'the card\'s paled edge is the colour from further in');
  const [r, g, b] = at(after, 600, 1050);
  assert.ok(Math.abs(r - 52) <= 6 && Math.abs(g - 214) <= 6 && Math.abs(b - 144) <= 6, `the half-white pixel is half the card\'s colour and half felt: ${[r, g, b]}`);
  assert.equal(did.softEdge, 70, 'and it is counted as soft edge');
  assert.deepEqual(at(after, 599, 1050), FELT, 'the felt beside it is as it was');
});

test('over a film in the card\'s own colour the paint stays where the film stands still, and the receipt names the way', () => {
  const bgr = (rgb: Buffer) => { const out = new Uint8Array(rgb.length); for (let p = 0; p < rgb.length; p += 3) { out[p] = rgb[p + 2]; out[p + 1] = rgb[p + 1]; out[p + 2] = rgb[p]; } return out; };
  const px = (frame: Uint8Array, x: number, y: number) => { const p = (y * W + x) * 3; return [frame[p + 2], frame[p + 1], frame[p]]; };
  // The second frame is the first with the blue a little bluer: alone its rim would be that blue at once; in the film the paint
  // of the first frame stays and glides there.
  const BLUER = [103, 192, 255], face2: Block = [BLUER, 608, 1028, 84, 54];
  const alone = picture(RIM, face2, ...CROSS, DOT);
  cardRimOff(alone, NO_SHOE, 'card');
  assert.deepEqual(at(alone, 603, 1050), BLUER, 'alone, the rim of the second frame is its own bluer blue');
  const first = bgr(picture(RIM, FACE, ...CROSS, DOT)), second = bgr(picture(RIM, face2, ...CROSS, DOT)), third = bgr(picture()), film = rimOffFilm(bgr(picture()), 'card');
  film.add(first); film.add(second); film.add(third);
  assert.deepEqual(px(first, 603, 1050), BLUE);
  assert.deepEqual(px(second, 603, 1050), [103, 192, 245 + CARD_RIM.slew], 'the paint of the first frame, one step nearer the bluer blue');
  assert.ok(third.every((v, p) => v === [FELT[2], FELT[1], FELT[0]][p % 3]), 'nothing is held over where the film has moved on');
  const r = film.result();
  assert.deepEqual([r.way, r.frames, r.framesChanged, r.firstFrame, r.lastFrame], ['card', 3, 2, 0, 1]);
  assert.match(r.what, /kortets egen färg/);
  assert.equal(rimOffFilm(bgr(picture())).result().way, 'felt');
});

test('the after-work paints the rim only when asked to, and in the way asked for', () => {
  assert.equal(readFlags([]).rim, undefined);
  assert.equal(readFlags(['--rim', 'felt']).rim, 'felt');
  assert.deepEqual(readFlags(['--rim', 'card', '--out', 'mapp']), {rim: 'card', out: 'mapp'});
  assert.throws(() => readFlags(['--rim', 'blue']), /felt .* eller card/);
  assert.throws(() => readFlags(['--rim']), /behöver ett värde/);
});
