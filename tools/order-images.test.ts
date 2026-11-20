// The last picture's card (tools/order-images.ts): the homography and the parts of a mask always; the real drawing with
// the bank's card texture only where the bank's films are on disk (they are outside Git). The pose figure's green brought
// to the anchor's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { H, TEXTURE, W, apply, armAlone, cardOutline, cardTexture, components, drawCard, drawCards, greenOf, homography, layCard, markSeen, matchGreen, planQuad, pngOf, poseOnShoe, readPlan, type Pt } from './order-images.ts';
import { ARM_ALONE, SHOE_AT_ANCHOR, SLEEVE_AT_SHOE } from './order-store.ts';
import { CARD_RGB, cardMark } from '../src/placement-model.ts';
import { committedText } from './committed.ts';

test('the homography maps the four corners onto the four corners', () => {
  const from: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]], to: Pt[] = [[100, 200], [180, 205], [190, 280], [95, 270]];
  const h = homography(from, to);
  from.forEach((p, i) => { const [x, y] = apply(h, ...p); assert.ok(Math.hypot(x - to[i][0], y - to[i][1]) < 1e-6); });
});

test('parts of a mask: areas, centres and boxes', () => {
  const mask = new Uint8Array(10 * 6);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [7, 4]]) mask[y * 10 + x] = 1;
  const { parts } = components(mask, 10, 6);
  assert.deepEqual(parts.slice(1).map((p) => [p.area, p.cx, p.cy, p.x1 - p.x0 + 1]), [[4, 1.5, 1.5, 2], [1, 7, 4, 1]]);
});

test("the pose figure's green is brought to the anchor's: the whole green moves, the arm and the card do not, no fringe", () => {
  // The figure: the source film's green (Pamela's, 10 223 61) with a soft shadow, a black sleeve, a yellow card, and an
  // edge pixel that is half sleeve and half green. The anchor: Paow's green (0 238 45).
  const figure = Buffer.alloc(W * H * 3), anchor = Buffer.alloc(W * H * 3);
  const set = (rgb: Buffer, x: number, y: number, c: number[]) => rgb.set(c, (y * W + x) * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { set(figure, x, y, [10, 223, 61]); set(anchor, x, y, [0, 238, 45]); }
  for (let y = 100; y < 200; y++) for (let x = 100; x < 200; x++) set(figure, x, y, [8, 190, 52]);
  for (let y = 600; y < 700; y++) for (let x = 1200; x < 1300; x++) set(figure, x, y, [20, 20, 22]);
  for (let y = 600; y < 700; y++) for (let x = 1400; x < 1440; x++) set(figure, x, y, [235, 205, 30]);
  set(figure, 1300, 650, [15, 122, 42]);
  const m = matchGreen(figure, anchor);
  const at = (x: number, y: number) => [...m.rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
  assert.deepEqual(m.before, [10, 223, 61]);
  assert.deepEqual(m.anchor, [0, 238, 45]);
  assert.deepEqual(m.after, [0, 238, 45], 'the green is the anchor\'s');
  assert.deepEqual(at(10, 10), [0, 238, 45]);
  assert.deepEqual(at(1700, 1100), [0, 238, 45]);
  const shadow = at(150, 150);
  assert.ok(shadow[1] > 190 && shadow[0] <= 8 && shadow[2] < 52, `the shadowed green moves too: ${shadow}`);
  assert.deepEqual(at(1250, 650), [20, 20, 22], 'the sleeve is not recoloured');
  assert.deepEqual(at(1420, 650), [235, 205, 30], 'the yellow card is not recoloured');
  const edge = at(1300, 650);
  assert.ok(Math.abs(edge[1] - 122 - 7) <= 2 && Math.abs(edge[2] - 42 + 8) <= 2, `an edge pixel moves by its green part, no fringe: ${edge}`);
  assert.ok(matchGreen(figure, anchor).rgb.equals(m.rgb), 'the same pictures give the same bytes');
  assert.deepEqual(greenOf(figure, [0, 0, 200, 200]), [10, 223, 61], 'a box is measured on its own');
});

/**
 * A source like the bank's anchor 2.2: on her green a black shoe, a yellow card on it, a black sleeve and a hand whose
 * fingertips lie over the card's top, with one column at the hand's edge half skin and half green. A dealer's anchor: her
 * own green, the same shoe, her card at another place, and her body (to be cut away).
 */
function layScene() {
  const source = Buffer.alloc(W * H * 3), anchor = Buffer.alloc(W * H * 3);
  const fill = (rgb: Buffer, x0: number, y0: number, x1: number, y1: number, c: number[]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rgb.set(c, (y * W + x) * 3); };
  fill(source, 0, 0, W - 1, H - 1, [10, 230, 60]); fill(anchor, 0, 0, W - 1, H - 1, [0, 238, 45]);
  for (const rgb of [source, anchor]) fill(rgb, 1180, 780, 1500, 900, [40, 40, 40]);
  fill(source, 1200, 820, 1270, 880, [248, 220, 0]);
  fill(source, 1220, 620, 1300, 744, [15, 15, 15]);
  fill(source, 1210, 745, 1260, 840, [230, 150, 120]);
  fill(source, 1209, 755, 1209, 775, [120, 190, 90]);
  fill(anchor, 1260, 760, 1320, 830, [248, 220, 0]);
  fill(anchor, 600, 300, 1000, 830, [30, 30, 30]);
  return { source, anchor };
}

test("a pose on the dealer's own shoe: only the forearm and hand, moved by the cards' top sides, no other shoe or card", () => {
  const { source, anchor } = layScene();
  const at = (rgb: Buffer, x: number, y: number) => [...rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
  // The card: its four corners though a hand lies over its top, and its top side.
  const card = cardOutline(source);
  assert.deepEqual(card.topMid, [1235.5, 820]);
  assert.equal(card.quad.length, 4);
  assert.throws(() => cardOutline(Buffer.alloc(W * H * 3)), /Inget gult kort/);
  const lay = { keep: ARM_ALONE, sleeve: SLEEVE_AT_SHOE, shoe: SHOE_AT_ANCHOR };
  const made = poseOnShoe(source, anchor, lay);
  assert.deepEqual(made.by, [55, -60], 'the middle of the source card\'s top side onto the middle of hers');
  assert.deepEqual(made.cards.anchor.topMid, [1290.5, 760]);
  assert.deepEqual(at(made.rgb, 1235 + 55, 790 - 60), [230, 150, 120], 'the hand, moved');
  assert.deepEqual(at(made.rgb, 1260 + 55, 680 - 60), [15, 15, 15], 'the sleeve, moved');
  assert.deepEqual(at(made.rgb, 1235 + 55, 838 - 60), [230, 150, 120], 'the fingertips lie on her card');
  assert.deepEqual(at(made.rgb, 1235 + 55, 850 - 60), [248, 220, 0], 'just below them her own card, not the source card');
  assert.deepEqual(at(made.rgb, 1235, 870), [40, 40, 40], 'where the source card lay, her own shoe');
  assert.deepEqual(at(made.rgb, 1455, 790), [40, 40, 40], 'nothing of the source shoe comes along');
  assert.deepEqual(at(made.rgb, 800, 500), [0, 238, 45], 'the rest of her is her own green');
  // The edge: half skin and half the source's green becomes half skin and half her green.
  const edge = at(made.rgb, 1209 + 55, 765 - 60);
  assert.ok([115, 194, 83].every((v, c) => Math.abs(edge[c] - v) <= 1), `the edge is unmixed: ${edge}`);
  assert.ok(made.base.filledPx > 100000 && made.armPx > 10000, `${made.base.filledPx} filled, ${made.armPx} arm`);
  assert.ok(poseOnShoe(source, anchor, lay).rgb.equals(made.rgb), 'the same pictures give the same bytes');
  // While the anchor waits: the arm alone where it lies, the source's shoe and card cut away too.
  const alone = armAlone(source, lay);
  assert.deepEqual(at(alone.rgb, 1235, 790), [230, 150, 120]);
  assert.deepEqual(at(alone.rgb, 1235, 870), [10, 230, 60], 'the source card is green');
  assert.deepEqual(at(alone.rgb, 1400, 850), [10, 230, 60], 'the source shoe is green');
});

const media = existsSync('assets/motions/pamela-p4-c1-plan-return-idle-01/source.mp4') && existsSync('assets/anchors/pamela-idle-p4-c1-plan-01/receipt.json');
test('the card is drawn where the plan says, at the plan size (through the table lens since 2026-11-17: within 5 px, the texture edge grown), from real card pixels', { skip: !media && 'the bank films are not on this machine' }, async () => {
  const root = process.cwd();
  const { plan, file } = await readPlan(root);
  const texture = await cardTexture(root);
  const green = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { green[i * 3] = 0; green[i * 3 + 1] = 237; green[i * 3 + 2] = 44; }
  for (const target of ['P4.C1', 'P1.C1', 'P7.C1']) {
    const { drawn, rgb } = drawCard(green, texture, plan, file, target);
    assert.ok(drawn.measuredOffsetPx! < 2, `${target}: ${drawn.measuredOffsetPx} px from the plan`);
    assert.equal(drawn.measured!.changedElsewhere, 0);
    const q = planQuad(plan, target), wide = Math.max(...q.map((p) => p[0])) - Math.min(...q.map((p) => p[0]));
    assert.ok(Math.abs(drawn.measured!.box[0] - wide) < 5, `${target}: ${drawn.measured!.box[0]} px wide against the plan's ${wide.toFixed(1)}`);
    // Real pixels: the card's blue varies, a flat fill would not.
    const blues = new Set<number>();
    const [cx, cy] = drawn.centre.map(Math.round);
    for (let dx = -15; dx <= 15; dx++) blues.add(rgb[(cy * W + cx + dx) * 3 + 2]);
    assert.ok(blues.size > 3, `${target}: ${blues.size} shades of blue`);
  }
});

test('a card size for one order: the last picture draws the card 150 % about its own centre; the plan is not touched', { skip: !media && 'the bank films are not on this machine' }, async () => {
  const root = process.cwd();
  const { plan, file } = await readPlan(root);
  const before = JSON.stringify(plan);
  const texture = await cardTexture(root);
  const green = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { green[i * 3] = 0; green[i * 3 + 1] = 237; green[i * 3 + 2] = 44; }
  const plain = drawCard(green, texture, plan, file, 'P4.C1').drawn;
  const big = drawCard(green, texture, plan, file, 'P4.C1', 'FRONT', 1.5).drawn;
  assert.equal(plain.scale, undefined, 'the plan\'s size says nothing');
  assert.equal(big.scale, 1.5);
  assert.deepEqual(big.centre, plain.centre, 'about its own centre');
  const ratio = big.measured!.box[0] / plain.measured!.box[0];
  assert.ok(Math.abs(ratio - 1.5) < 0.06, `drawn ${ratio.toFixed(3)} × as wide`);
  // drawn where its outline is: the drawn pixels' middle against the outline's area middle (with the plan's shape, 87 % since
  // 2026-11-18, the far edge is narrower, so the area's middle lies nearer the near edge than the corners' mean: 2 px here)
  const q = big.quad, cross = q.map((p, i) => p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1]), area = cross.reduce((s, c) => s + c, 0) / 2;
  const middle = [0, 1].map((k) => q.reduce((s, p, i) => s + (p[k] + q[(i + 1) % 4][k]) * cross[i], 0) / (6 * area));
  const off = Math.hypot(big.measured!.centre[0] - middle[0], big.measured!.centre[1] - middle[1]);
  assert.ok(off < 1.5, `the drawn card's middle is ${off.toFixed(2)} px from its outline's`);
  assert.equal(JSON.stringify(plan), before);
});

test('several cards drawn one after the other, each where the plan says; the hole card\'s turn draws only the hole card on its two pictures', { skip: !media && 'the bank films are not on this machine' }, async (t) => {
  const root = process.cwd();
  const { plan, file } = await readPlan(root);
  const texture = await cardTexture(root);
  const green = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { green[i * 3] = 0; green[i * 3 + 1] = 237; green[i * 3 + 2] = 44; }
  const made = drawCards(green, texture, plan, file, [{ target: 'D.C1', side: 'FRONT' }, { target: 'D.C2', side: 'BACK' }]);
  assert.deepEqual([made.drawn.target, made.drawn.side, made.beside.map((d) => [d.target, d.side])], ['D.C2', 'BACK', [['D.C1', 'FRONT']]]);
  for (const d of [made.drawn, ...made.beside]) assert.ok(d.measuredOffsetPx! < 2, `${d.target}: ${d.measuredOffsetPx} px from the plan`);
  assert.equal(made.drawn.measured!.changedElsewhere, 0, 'the second card is measured against the picture with the first');
  const [cx, cy] = made.drawn.centre.map(Math.round), at = (cy * W + cx) * 3;
  assert.ok(made.rgb[at] > 150 && made.rgb[at + 2] < 60, 'the hole card is yellow');
  assert.throws(() => drawCards(green, texture, plan, file, []), /Inga kort/);

  // The store: her anchor 1 holds, so both pictures are drawn on it at once, the hole card alone, closed and then open
  // (the game draws the dealer's first card itself; with both drawn she lifted both, round 6).
  const { mkdtemp, mkdir, writeFile, copyFile, rm } = await import('node:fs/promises');
  const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : (await import('node:os')).tmpdir();
  const lab = await mkdtemp(path.join(base, 'order-images-'));
  t.after(() => rm(lab, { recursive: true, force: true }));
  // The step's recipe comes from the method register since the straight line (a step without one has no default).
  for (const f of ['data/order-policy.json', 'data/order-methods.json', 'data/dealers.json', TEXTURE.video, TEXTURE.quadFrom]) { await mkdir(path.dirname(path.join(lab, f)), { recursive: true }); await copyFile(f, path.join(lab, f)); }
  await mkdir(path.join(lab, 'placements'), { recursive: true }); await writeFile(path.join(lab, 'placements/default.json'), committedText('placements/default.json')); // his plan as committed (tools/committed.ts)
  await mkdir(path.join(lab, 'assets/anchors/paow-vila'), { recursive: true });
  await writeFile(path.join(lab, 'assets/anchors/paow-vila/anchor.png'), await pngOf(green));
  await writeFile(path.join(lab, 'data/clip-jobs.json'), '{"jobs": []}');
  await writeFile(path.join(lab, 'data/media-roles.json'), JSON.stringify({ schemaVersion: 1, measures: [], dealers: { paow: { name: 'Paow', entries: [{ id: 'paow-vila', role: 'ankare-1', name: 'Vila', path: 'assets/anchors/paow-vila/anchor.png', node: 'IDLE', state: 'gäller' }] } } }));
  const { orderStore } = await import('./order-store.ts');
  const { order } = await orderStore(lab).create({ dealer: 'paow', step: 'HALKORT' });
  const [first, last] = order.pictures;
  assert.deepEqual([first.drawn!.target, first.drawn!.side, first.drawnBeside!.map((d) => d.side), last.drawn!.side, last.drawnBeside!.map((d) => d.side)], ['D.C2', 'BACK', [], 'FRONT', []]);
  assert.equal(first.from!.entry, 'paow-vila');
  assert.match(first.label, /^Första bild · Paows ankare 1 \+ hålkortet stängt$/);
  assert.ok(first.sha256 && last.sha256 && first.sha256 !== last.sha256);
  assert.match(order.prompt.text, /lying close in front of her, in the middle of the picture, where the last frame shows it/, 'the place from the drawn card');
});

test('the blue side\'s marks (Jakob 2026-11-20): an open card is drawn with the pink cross in its middle and the red circle at its near left corner, in the register\'s colours; a closed card is plain yellow', () => {
  // a made-up card: flat blue over the whole picture, its outline a square; laid on green at P4's size
  const blue = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { blue[i * 3] = CARD_RGB.face[0]; blue[i * 3 + 1] = CARD_RGB.face[1]; blue[i * 3 + 2] = CARD_RGB.face[2]; }
  const mask = new Float32Array(W * H).fill(1);
  const texture = { rgb: blue, mask, quad: [[100, 100], [300, 100], [300, 380], [100, 380]] as Pt[], source: { video: 'made-up', frame: 0, sha256: '', quadFrom: 'made-up' } };
  const green = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { green[i * 3] = 0; green[i * 3 + 1] = 237; green[i * 3 + 2] = 44; }
  const to: Pt[] = [[819, 1066], [893, 1066], [897, 1138], [813, 1138]];
  const open = layCard(green, texture, to, 'FRONT'), closed = layCard(green, texture, to, 'BACK');
  const at = (rgb: Buffer, [x, y]: Pt) => [...rgb.subarray((Math.round(y) * W + Math.round(x)) * 3, (Math.round(y) * W + Math.round(x)) * 3 + 3)];
  const mark = cardMark(to.map(([x, y]) => ({ x, y }))), middle = (q: { x: number; y: number }[]): Pt => [q.reduce((s, p) => s + p.x, 0) / q.length, q.reduce((s, p) => s + p.y, 0) / q.length];
  assert.deepEqual(at(open, middle(mark.cross[0])), [...CARD_RGB.cross], 'the cross is pink in the card\'s middle');
  assert.deepEqual(at(open, middle(mark.dot)), [...CARD_RGB.dot], 'the circle is red');
  const dot = middle(mark.dot), centre = middle(to.map(([x, y]) => ({ x, y })));
  assert.ok(dot[0] < centre[0] && dot[1] > centre[1], 'the circle lies at the near left corner');
  assert.deepEqual(at(open, [centre[0] + 22, centre[1] - 22]), [...CARD_RGB.face], 'the rest of the side is blue');
  assert.equal(markSeen(open, to), true);
  assert.equal(markSeen(closed, to), false, 'a closed card carries nothing');
  assert.equal(markSeen(green, to), false);
  // her fingers over the cross: the circle alone is enough
  const covered = Buffer.from(open);
  for (let y = 1085; y <= 1118; y++) for (let x = 835; x <= 880; x++) { covered[(y * W + x) * 3] = 230; covered[(y * W + x) * 3 + 1] = 150; covered[(y * W + x) * 3 + 2] = 120; }
  assert.equal(markSeen(covered, to), true);
  // a plain blue card with skin over both places is not read as marked
  const plain = layCard(green, { ...texture, rgb: blue }, to, 'BACK');
  for (let y = 1066; y <= 1138; y++) for (let x = 813; x <= 897; x++) { plain[(y * W + x) * 3] = 230; plain[(y * W + x) * 3 + 1] = 150; plain[(y * W + x) * 3 + 2] = 120; }
  assert.equal(markSeen(plain, to), false, 'skin is neither the pink nor the red');
});
