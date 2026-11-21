// The pure parts of tools/landing-make.ts on made-up pictures: which cards an A3 is made for, the checks that stop a source
// picture that does not hold the anchor's frame, and the making itself (a card the source drew goes, her fingers stay on top).
import test from 'node:test';
import assert from 'node:assert/strict';
import {W, H, type Pt, type Rgb} from './order-images.ts';
import {LANDING_TARGET, checkLanding, composeLanding, makeLanding, nearEdge} from './landing-make.ts';

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
