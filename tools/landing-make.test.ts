// The pure parts of tools/landing-make.ts on made-up pictures: which cards an A3 is made for, the checks that stop a source
// picture that does not hold the anchor's frame, and the making itself (a card the source drew goes, her fingers stay on top).
import test from 'node:test';
import assert from 'node:assert/strict';
import {W, H, inPolygon, matchGreen, type Pt, type Rgb} from './order-images.ts';
import {SHOE_AT_ANCHOR} from './order-store.ts';
import {LANDING_TARGET, checkLanding, composeLanding, isCardMark, isWhite, makeLanding, nearEdge, seamOutlineOf, seatGuard, takeHandAtShoe} from './landing-make.ts';

const GREEN = [30, 190, 40], DARK = [20, 20, 20], SKIN = [205, 150, 130], BLUE = [30, 90, 220];
const picture = (...blocks: [number[], number, number, number, number][]): Rgb => {
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set(GREEN, i * 3);
  for (const [colour, x0, y0, w, h] of blocks) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) rgb.set(colour, (y * W + x) * 3);
  return rgb;
};
const at = (rgb: Rgb, x: number, y: number) => [...rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
const HEAD: [number[], number, number, number, number] = [DARK, 700, 100, 300, 400];
const TIPS: [number[], number, number, number, number] = [SKIN, 890, 1040, 40, 30]; // her fingertips, over the card's edge nearest her
const QUAD: Pt[] = [[880, 1060], [940, 1060], [945, 1130], [875, 1130]];
const WINDOW: [number, number, number, number] = [1150, 560, 330, 260];

test('an A3 is made for a player\'s first and second card and the dealer\'s first, and for nothing else', () => {
  for (let seat = 1; seat <= 7; seat++) for (const card of [1, 2]) assert.ok(LANDING_TARGET.test(`P${seat}.C${card}`), `P${seat}.C${card}`);
  assert.ok(LANDING_TARGET.test('D.C1'));
  for (const no of ['D.C2', 'D.C3', 'P4.C3', 'P8.C1', 'P0.C1', 'P4C2', 'LAND(P4.C2)', 'A3P4C2', '']) assert.ok(!LANDING_TARGET.test(no), no);
});

test('a card without an A3 is refused before anything is read', async () => {
  await assert.rejects(makeLanding('en-mapp-som-inte-finns', {source: 'ingen.png', target: 'D.C2', hand: 'RH', name: 'prov'}), /D\.C2: ett A3 görs för ett kort som läggs öppet/);
});

test('the fingertips are looked for at the two corners of the card nearest her', () => {
  assert.deepEqual(nearEdge(QUAD), [[880, 1060], [940, 1060]]);
  assert.deepEqual(nearEdge([[10, 50], [40, 20], [70, 50], [40, 80]]).map((p) => p[1]), [20, 50]);
});

test('a source that holds the anchor\'s frame with her fingertips at the card passes every check', () => {
  const anchor = picture(HEAD), source = picture(HEAD, TIPS);
  const checks = checkLanding(source, anchor, source, QUAD, WINDOW);
  assert.deepEqual(checks.fails, []);
  assert.equal(checks.headIoU, 1);
  assert.equal(checks.shoeMean, 0);
  assert.ok(checks.tipsPixels >= 120, `${checks.tipsPixels} bildpunkter vid kortets kant`);
});

test('a source with no hand at the card, or with her head moved, is stopped and says why', () => {
  const anchor = picture(HEAD);
  const noHand = checkLanding(picture(HEAD), anchor, picture(HEAD), QUAD, WINDOW);
  assert.equal(noHand.fails.length, 1);
  assert.match(noHand.fails[0], /inga fingertoppar vid kortets hörn närmast henne/);
  const moved = picture([DARK, 1100, 100, 300, 400], TIPS);
  const movedChecks = checkLanding(moved, anchor, moved, QUAD, WINDOW);
  assert.ok(movedChecks.fails.some((f) => /bildrutan är inte hållen/.test(f)), movedChecks.fails.join('; '));
});

test('the making takes away a card the source drew, draws the plan\'s card, and keeps her fingers on top of it', () => {
  const anchor = picture(HEAD);
  const source = picture(HEAD, [BLUE, 780, 1050, 60, 70], TIPS); // a stray blue card on the felt beside the seat
  const draw = (base: Rgb) => { const out = Buffer.from(base); for (let y = 1060; y < 1130; y++) for (let x = 880; x < 940; x++) out.set(BLUE, (y * W + x) * 3); return out; };
  const made = composeLanding(source, anchor, draw, QUAD);
  assert.ok(made.strayBlue >= 60 * 70, `${made.strayBlue} bildpunkter av det främmande kortet togs bort`);
  assert.deepEqual(at(made.rgb, 810, 1085), at(anchor, 810, 1085), 'the stray card has given way to the anchor\'s felt');
  assert.ok(made.fingers > 0);
  assert.deepEqual(at(made.rgb, 910, 1065), SKIN, 'her fingertip lies over the drawn card');
  assert.deepEqual(at(made.rgb, 910, 1110), BLUE, 'the plan\'s card is drawn where no finger lies');
});

// New in round two (2026-11-21): on pilot 02's frame 72 the pink cross and red circle of the card the film laid stayed on the
// felt, counted as skin. Near the seat they are the card's and go; her skin, a rosy fingertip's shade too, stays.
test('the marks of a card the source drew go with it, and her skin, a rosy fingertip too, stays', () => {
  const PINK = [240, 120, 200], RED = [200, 30, 50], ROSY = [185, 105, 95];
  const px = (c: number[]) => Buffer.from(c);
  assert.ok(isCardMark(px(PINK), 0) && isCardMark(px(RED), 0));
  assert.ok(!isCardMark(px(SKIN), 0) && !isCardMark(px(ROSY), 0) && !isCardMark(px(DARK), 0));
  const anchor = picture(HEAD);
  const source = picture(HEAD, [PINK, 790, 1070, 12, 4], [PINK, 794, 1066, 4, 12], [RED, 820, 1110, 8, 8], [ROSY, 860, 1040, 20, 20], TIPS);
  const draw = (base: Rgb) => Buffer.from(base);
  const made = composeLanding(source, anchor, draw, QUAD);
  for (const [x, y] of [[795, 1071], [823, 1113]]) assert.deepEqual(at(made.rgb, x, y), at(anchor, x, y), `the card's mark at ${x},${y} has given way to the felt`);
  assert.deepEqual(at(made.rgb, 868, 1048), ROSY, 'a rosy fingertip stays');
  assert.deepEqual(at(made.rgb, 900, 1045), SKIN, 'her fingertips stay');
});

// New in round three (2026-11-21): on A2.3 → P4C2's frame 68 the film's hand at the shoe lay 3–7 px off the anchor's, and the
// shoe's straight edge (x + y = 2000 there) cut through her fingers. The hand comes whole from the anchor, to the cuff.
test('her hand at the shoe comes whole from the anchor when the source\'s lies off it, the seam in sleeve or green, and a cut through her fingers is stopped', () => {
  const SKIN2 = [215, 160, 140];
  const anchor = picture(HEAD, [DARK, 1060, 700, 110, 70], [SKIN, 1170, 700, 100, 70], [DARK, 1200, 730, 30, 3]);
  const source = picture(HEAD, [DARK, 1054, 707, 110, 70], [SKIN2, 1164, 707, 100, 70], [DARK, 1194, 737, 30, 3], TIPS);
  const made = composeLanding(source, anchor, (base) => Buffer.from(base), QUAD);
  assert.equal(made.seam.seamSkin, 0, 'no skin on the seam');
  assert.ok(made.seam.handPixels > 7000, `${made.seam.handPixels} bildpunkter hand i de två bilderna`);
  let off = 0;
  for (let y = 680; y < 800; y++) for (let x = 1030; x < 1300; x++) if (at(made.rgb, x, y).join() !== at(anchor, x, y).join()) off++;
  assert.equal(off, 0, 'the hand, its cuff and the sleeve round it are the anchor\'s, pixel for pixel');
  assert.deepEqual(at(made.rgb, 900, 1045), SKIN, 'the laying hand stays the source\'s');
  const checks = checkLanding(source, anchor, made.rgb, QUAD, WINDOW, made.seam);
  assert.deepEqual(checks.fails, []);
  assert.equal(checks.handForeign, 0);
  // The way it was made before: only the shoe's polygon from the anchor. The film's fingers above its edge are left beside the anchor's.
  const cut = Buffer.from(source);
  for (let y = 560; y < 931; y++) for (let x = 1182; x < 1731; x++) if (inPolygon(SHOE_AT_ANCHOR, x + 0.5, y + 0.5)) cut.set(at(anchor, x, y), (y * W + x) * 3);
  const cutChecks = checkLanding(source, anchor, cut, QUAD, WINDOW);
  assert.ok(cutChecks.handForeign > 500, `${cutChecks.handForeign} bildpunkter`);
  assert.ok(cutChecks.fails.some((f) => /handen vid skon är inte ankarets/.test(f)), cutChecks.fails.join('; '));
});

test('at a seat near the shoe the laying hand is never taken for the hand at the shoe', () => {
  const NEAR_SHOE: Pt[] = [[1442, 950], [1511, 950], [1540, 1011], [1462, 1011]]; // P7.C1 in the plan, 20 px below the shoe's foot
  const anchor = picture(HEAD), source = picture(HEAD, [SKIN, 1450, 900, 60, 70]); // her laying hand from the shoe's foot to the card
  const made = composeLanding(source, anchor, (base) => Buffer.from(base), NEAR_SHOE);
  assert.equal(made.seam.handPixels, 0);
  assert.deepEqual(at(made.rgb, 1480, 945), SKIN, 'the laying hand below the shoe stays');
});

// New in round three: on frame 68 the white rim of the card the film laid, warm from her skin beside it, was kept as skin (85
// pixels with R, G and B over 200), and the line where her fingertips met it stayed pink.
test('the white rim of the source\'s card becomes felt round the drawn card, her fingertips stay, and their edge on the rim meets the felt', () => {
  const RIM = [238, 226, 224], MIX = [222, 188, 177]; // MIX: half her fingertip, half the rim
  const anchor = picture(HEAD);
  const source = picture(HEAD, [RIM, 856, 1046, 96, 67], [BLUE, 862, 1052, 84, 55], [SKIN, 846, 1010, 30, 35], [MIX, 856, 1045, 20, 1], TIPS);
  const draw = (base: Rgb) => { const out = Buffer.from(base); for (let y = 1060; y < 1130; y++) for (let x = 880; x < 940; x++) out.set(BLUE, (y * W + x) * 3); return out; };
  const made = composeLanding(source, anchor, draw, QUAD);
  let white = 0;
  for (let y = 1000; y < 1180; y++) for (let x = 820; x < 1000; x++) if (isWhite(made.rgb, y * W + x)) white++;
  assert.equal(white, 0, 'no white of the source\'s card is left');
  assert.deepEqual(at(made.rgb, 860, 1080), at(anchor, 860, 1080), 'the rim beside the drawn card is felt');
  assert.deepEqual(at(made.rgb, 860, 1030), SKIN, 'her fingertip stays');
  assert.deepEqual(at(made.rgb, 900, 1100), BLUE, 'the plan\'s card is drawn');
  const [r, g] = at(made.rgb, 866, 1045);
  assert.ok(g > r && r > 90, `her fingertip's edge on the rim meets the felt (${at(made.rgb, 866, 1045)})`);
  assert.equal(checkLanding(source, anchor, made.rgb, QUAD, WINDOW, made.seam).whiteRim, 0);
  const left = checkLanding(source, anchor, source, QUAD, WINDOW);
  assert.ok(left.whiteRim > 100 && left.fails.some((f) => /vita rester av ett kort/.test(f)), left.fails.join('; '));
});

// New in round three, second look (2026-11-21): where the take at the shoe ended on the upper arm, the film's outline lay 8 px
// outside the anchor's and jumped 8 px in 4 rows. It now glides from the anchor's at the seam to the source's, and a notch
// left there is caught by the check (seamOutline).
test('her outline glides across the seam where the source\'s lies off the anchor\'s, and a notch there is stopped', () => {
  const anchor = picture(HEAD, [DARK, 1040, 300, 60, 400], [DARK, 1060, 700, 110, 70], [SKIN, 1170, 700, 100, 70]);
  const source = picture(HEAD, [DARK, 1040, 300, 68, 407], [DARK, 1054, 707, 110, 70], [SKIN, 1164, 707, 100, 70], TIPS);
  const made = composeLanding(source, anchor, (base) => Buffer.from(base), QUAD);
  assert.equal(made.seam.seamOutline, 0, 'no step in her outline at the seam');
  assert.ok(made.seam.outlineGlided > 100, `${made.seam.outlineGlided} bildpunkter flyttade längs konturen`);
  // Her outline per row (sub-pixel: the share of her across the row by the arm) moves at most 1.5 px a row, 3 px in 4 rows.
  const her = (rgb: Rgb, i: number) => Math.max(0, Math.min(1, 1 - (rgb[i * 3 + 1] - Math.max(rgb[i * 3], rgb[i * 3 + 2])) / 150));
  const edge: number[] = [];
  for (let y = 360; y < 700; y++) { let s = 0; for (let x = 1070; x < 1140; x++) s += her(made.rgb, y * W + x); edge.push(1070 + s); }
  const rowStep = Math.max(...edge.slice(1).map((v, k) => Math.abs(v - edge[k]))), fourStep = Math.max(...edge.slice(4).map((v, k) => Math.abs(v - edge[k])));
  assert.ok(rowStep <= 1.5 && fourStep <= 3, `konturen flyttar sig ${rowStep.toFixed(2)} px på en rad, ${fourStep.toFixed(2)} px på fyra`);
  assert.ok(edge[0] > 1106 && edge[edge.length - 1] < 1102, `the source's outline far above (${edge[0].toFixed(1)}), the anchor's at the cuff (${edge[edge.length - 1].toFixed(1)})`);
  const checks = checkLanding(source, anchor, made.rgb, QUAD, WINDOW, made.seam);
  assert.deepEqual(checks.fails, []);
  // The way it was made in round two near enough: the anchor in the take, the source outside it, no glide. The notch is stopped.
  const matched = matchGreen(source, anchor).rgb, {take} = takeHandAtShoe(Buffer.from(matched), anchor, QUAD), cut = Buffer.from(matched);
  for (let i = 0; i < W * H; i++) if (take[i]) cut.set(anchor.subarray(i * 3, i * 3 + 3), i * 3);
  const notch = seamOutlineOf(cut, anchor, take, seatGuard(QUAD), 150);
  assert.ok(notch > 10, `${notch} bildpunkter`);
  const cutChecks = checkLanding(source, anchor, cut, QUAD, WINDOW, {seamSkin: 0, seamOutline: notch});
  assert.ok(cutChecks.fails.some((f) => /hennes kontur hoppar där skarven vid skon korsar den/.test(f)), cutChecks.fails.join('; '));
});

// New in round three, second look: the anchor's lighter sleeve fold stood with a ragged edge against the film's near-black
// sleeve where the take ended in the sleeve. The anchor now fades into the source there; her hand at the shoe stays the anchor's.
test('the sleeve across the seam fades from the anchor\'s to the source\'s without a step, and the hand at the shoe stays the anchor\'s', () => {
  const FOLD = [34, 26, 30], BLACK = [6, 6, 6];
  const anchor = picture(HEAD, [FOLD, 900, 700, 270, 70], [SKIN, 1170, 700, 100, 70]);
  const source = picture(HEAD, [BLACK, 894, 707, 270, 70], [SKIN, 1164, 707, 100, 70], TIPS);
  const made = composeLanding(source, anchor, (base) => Buffer.from(base), QUAD);
  assert.ok(made.seam.sleeveBlended > 100, `${made.seam.sleeveBlended} bildpunkter ärm tonade`);
  let step = 0;
  for (let y = 715; y < 765; y++) for (let x = 910; x < 1160; x++) { const a = at(made.rgb, x, y), b = at(made.rgb, x + 1, y); step = Math.max(step, ...a.map((v, c) => Math.abs(v - b[c]))); }
  assert.ok(step <= 6, `största steg i ärmen ${step} nivåer (ankarets veck mot filmens svarta: 28)`);
  for (const [x, y] of [[1165, 740], [1200, 740], [1250, 760]]) assert.deepEqual(at(made.rgb, x, y), at(anchor, x, y), `${x},${y} is the anchor's`);
  assert.equal(checkLanding(source, anchor, made.rgb, QUAD, WINDOW, made.seam).handForeign, 0);
});
