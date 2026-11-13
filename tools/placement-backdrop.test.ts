// The pure parts of tools/placement-backdrop.ts: film and plan pixels, the patches that tell dealer from shoe, the body's
// measures, the figure (its cut at the table edge, the hands over it), the card in a picture, and the scene's look. The
// stills themselves need the lab server and Chrome and are not made here. Run: node --test tools/placement-backdrop.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {FELT_MARKS} from '../src/scene3d-table.ts';
import {NEUTRAL_BACKDROP, VIEWS} from '../src/placement-model.ts';
import {SHIPPED} from '../studio/lib/scene-presets.ts';
import {
  FILM, MARKS, OUT, PLAN, RECEIPT, cardIn, differs, figureSvg, filmToPlan, grown, lookOf, measureBody, mitten, patchIn, patches, planToFilm, quadCentre, smoothPath, type Body, type Hand,
} from './placement-backdrop.ts';

test('the picture lies beside the hash-locked V6 pictures, never on them', () => {
  assert.equal(OUT, NEUTRAL_BACKDROP.native);
  assert.match(OUT, /^assets\/lab\/placement-backdrop\/native\.jpg$/);
  assert.notEqual(OUT, VIEWS.native.background);
  assert.equal(RECEIPT, 'assets/lab/placement-backdrop/receipt.json');
  assert.equal('portrait' in NEUTRAL_BACKDROP, false, 'Mobil has no home view of the scene to match');
});

test('film pixels and plan pixels: the two ends meet, and one is the other undone', () => {
  assert.deepEqual(filmToPlan({x: 0, y: 0}), {x: 0, y: 0});
  const end = filmToPlan({x: FILM.width - 1, y: FILM.height - 1});
  assert.ok(Math.abs(end.x - (PLAN.width - 1)) < 1e-9 && Math.abs(end.y - (PLAN.height - 1)) < 1e-9);
  const p = {x: 853.3, y: 1101.5}, back = filmToPlan(planToFilm(p));
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  assert.ok(Math.abs(planToFilm({x: 880, y: 0}).x - 880 * 1763 / 1761) < 1e-9);
});

test('patches: what differs falls into connected pieces, the one in a box is found, and a piece grows', () => {
  const W = 12, H = 6, a = new Uint8Array(W * H * 3), b = new Uint8Array(W * H * 3);
  const dot = (x: number, y: number, v = 200) => { b[(y * W + x) * 3 + 1] = v; };
  for (const [x, y] of [[1, 1], [2, 1], [2, 2]]) dot(x, y); // a piece on the left
  for (const [x, y] of [[8, 3], [9, 3], [9, 4], [10, 4]]) dot(x, y); // a piece on the right
  dot(5, 5, 3); // below the level: not a difference
  const mask = differs(a, b, 4);
  assert.equal(mask.reduce((s, v) => s + v, 0), 7);
  const {labels, list} = patches(mask, W, H);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(p => [p.pixels, p.box]), [[3, [1, 1, 2, 2]], [4, [8, 3, 10, 4]]]);
  assert.equal(patchIn(labels, W, [7.6, 2.4, 11, 5]), 1);
  assert.equal(patchIn(labels, W, [4, 0, 6, 5]), null);
  const g = grown(labels, 0, W, H, 1); let n = 0, x0 = W, x1 = 0; g.forEach((v, i) => { if (v) { n++; x0 = Math.min(x0, i % W); x1 = Math.max(x1, i % W); } });
  assert.deepEqual([x0, x1], [0, 3]);
  assert.equal(n, 15);
});

test('the body is read off its patch: head, neck, shoulders, elbows and middle', () => {
  const W = 400, edge = 300, mask = new Uint8Array(W * 320), span = (y: number, l: number, r: number) => { for (let x = l; x <= r; x++) mask[y * W + x] = 1; };
  for (let y = 20; y < edge; y++) {
    if (y < 40) span(y, 190, 210); // the top of the head
    else if (y < 175) span(y, 170, 230); // head, 61 wide
    else if (y < 200) span(y, 190, 210); // neck, 21 wide
    else if (y < 240) span(y, 120, 280); // shoulders, 161 wide
    else span(y, 100, 300); // arms out, 201 wide
  }
  const b = measureBody(mask, W, edge);
  assert.equal(b.headTop, 20);
  assert.equal(b.neckRow, 175);
  assert.equal(b.neckHalf, 11);
  assert.equal(b.headHalf, 31);
  assert.equal(b.shoulderRow, 200);
  assert.equal(b.elbowRow, 240);
  assert.deepEqual([b.elbowLeft, b.elbowRight, b.centre], [100, 300, 200]);
  assert.throws(() => measureBody(new Uint8Array(W * 320), W, edge), /Ingen kropp/);
});

const HAND_L: Hand = {wrist: [702.6, 781.2], indexKnuckle: [775.4, 802], littleKnuckle: [706.3, 826.8], middleFingertip: [804.7, 872.4]};
const HAND_R: Hand = {wrist: [1044.1, 782.7], indexKnuckle: [969.5, 799.4], littleKnuckle: [1037.1, 827.3], middleFingertip: [938.4, 873.9]};
test('a hand is a mitten through the standard\'s points: wrist, index knuckle, fingertips, little knuckle', () => {
  for (const h of [HAND_L, HAND_R]) {
    const m = mitten(h, 50);
    assert.equal(m.length, 7);
    assert.deepEqual([m[1], m[3], m[5]], [h.indexKnuckle, h.middleFingertip, h.littleKnuckle]);
    assert.ok(Math.abs(Math.hypot(m[0][0] - m[6][0], m[0][1] - m[6][1]) - 50) < 1e-9, 'the wrist is as wide as asked');
    assert.ok(Math.hypot(m[0][0] - h.indexKnuckle[0], m[0][1] - h.indexKnuckle[1]) < Math.hypot(m[6][0] - h.indexKnuckle[0], m[6][1] - h.indexKnuckle[1]), 'the wrist side next to the index knuckle comes first');
    assert.ok(m[2][1] > h.indexKnuckle[1] && m[4][1] > h.littleKnuckle[1], 'the fingertips lie beyond the knuckles, toward the players');
  }
  assert.match(smoothPath([[0, 0], [10, 0], [10, 10]]), /^M0,0 C.* Z$/);
});

test('the figure: one grey, cut at the row the body ends on, hands over the table edge and nothing above the head', async () => {
  const body: Body = {centre: 867, headTop: 80, headHalf: 97, neckRow: 316, neckHalf: 59, shoulderRow: 400, shoulderHalf: 217, elbowRow: 717, elbowLeft: 536, elbowRight: 1196};
  const svg = figureSvg(body, {left: HAND_L, right: HAND_R}, 73.2, 831, 831.5);
  assert.doesNotMatch(svg, /<image|href=/, 'drawn, never a picture');
  const {data, info} = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual([info.width, info.height], [FILM.width, FILM.height]);
  const at = (x: number, y: number) => { const i = (y * info.width + x) * 4; return {rgb: [data[i], data[i + 1], data[i + 2]], a: data[i + 3]}; };
  const head = at(867, 200), chest = at(867, 600), hand = at(760, 840), above = at(867, 60), lap = at(867, 845), room = at(300, 400);
  assert.equal(head.a, 255); assert.equal(chest.a, 255);
  assert.ok([118, 123, 131].every((v, i) => Math.abs(head.rgb[i] - v) <= 2), `the one grey tone (#767b83), not ${head.rgb}`);
  assert.deepEqual(hand.rgb, head.rgb, 'the hands have the body\'s tone');
  assert.equal(hand.a, 255, 'a hand lies on the felt below the edge row');
  assert.equal(above.a, 0);
  assert.ok(lap.a < 40, 'the body ends at the table edge; under it only the hands\' faint shadow');
  assert.equal(room.a, 0);
});

test('a card in a picture: its face\'s pixels, centre and extent; a quad\'s area centre', () => {
  const W = 40, H = 30, rgb = new Uint8Array(W * H * 3).fill(30);
  for (let y = 10; y <= 19; y++) for (let x = 5; x <= 14; x++) { const i = (y * W + x) * 3; rgb[i] = 0; rgb[i + 1] = 115; rgb[i + 2] = 235; }
  const card = cardIn(rgb, W, [0, 0, 39, 29], 'FRONT')!;
  assert.equal(card.pixels, 100);
  assert.deepEqual([card.centre, card.box], [{x: 9.5, y: 14.5}, [5, 10, 14, 19]]);
  assert.equal(cardIn(rgb, W, [0, 0, 39, 29], 'BACK'), null);
  assert.equal(cardIn(rgb, W, [20, 0, 39, 29], 'FRONT'), null);
  const c = quadCentre([{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 4}, {x: 0, y: 4}]);
  assert.ok(Math.abs(c.x - 5) < 1e-9 && Math.abs(c.y - 2) < 1e-9);
});

test('the look: the shipped Basgrund at the home view, still, without rendered cards and without the printed card boxes', () => {
  const base = SHIPPED.find(p => p.name === 'basgrund')!.state, look = lookOf(base);
  assert.equal(look.room, base.room);
  assert.equal(look.tray, base.tray);
  assert.deepEqual([look.yaw, look.pitch, look.zoom, look.dx, look.dy, look.dz, look.sway, look.format], [0, 0, 1, 0, 0, 0, false, 'desk']);
  assert.deepEqual([look.cards, look.focus, look.dust, look.clock], [false, 'off', 0, false]);
  assert.deepEqual(MARKS.split(','), FELT_MARKS.filter(m => m !== 'boxes'));
});
