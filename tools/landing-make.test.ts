// A3 (ankare 3): a seat's landing picture for one hand. The line's rule (src/order-model.ts landingOf, seatEndOf, a3Candidates)
// and the pure parts of tools/landing-make.ts on made-up pictures in the bank's frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import {W, H, type Pt} from './order-images.ts';
import {checkLanding, composeLanding, isCardBlue, nearEdge} from './landing-make.ts';
import {a3Candidates, a3Name, landingOf, seatEndOf, stepOf} from '../src/order-model.ts';

test('an A3 is for one seat and one hand: the right hand\'s never ends a deal laid with the left, a candidate only when named', () => {
  const at = (id: string, hand: string | undefined, state: string) => ({id, role: 'landning', node: 'LAND(P4.C1)', card: 'P4.C1', state, ...(hand ? {hand} : {})});
  const entries = [at('a3-p4-rh', 'RH', 'gäller'), at('a3-p4-rh-ny', 'RH', 'kandidat'), at('landning-p4', undefined, 'gäller')];
  assert.equal(landingOf(entries, 'P4.C1')?.id, 'landning-p4', 'no hand said: the left, as every landing made before');
  assert.equal(landingOf(entries, 'P4.C1', 'RH')?.id, 'a3-p4-rh');
  assert.equal(landingOf([entries[0]], 'P4.C1', 'LH'), null, 'the right hand\'s A3 is no landing for the left');
  const pinch = stepOf('GIV-2.1')!, two = stepOf('GIV-2.3')!;
  assert.equal(seatEndOf([entries[0]], null, {dealer: 'paow', step: pinch, target: 'P4.C1', hand: 'LH'}), null, 'a deal laid with the left hand never ends on the right hand\'s A3');
  assert.deepEqual(seatEndOf(entries, null, {dealer: 'paow', step: two, target: 'P4.C1', hand: 'RH'}), {kind: 'LANDNING', entry: entries[0]});
  assert.deepEqual(a3Candidates(entries, 'P4.C1', 'RH').map((e) => e.id), ['a3-p4-rh-ny']);
  assert.deepEqual(seatEndOf(entries, null, {dealer: 'paow', step: two, target: 'P4.C1', hand: 'RH', chosen: 'a3-p4-rh-ny'}), {kind: 'LANDNING', entry: entries[1], candidate: true}, 'a named candidate, said to be one');
  assert.equal(seatEndOf(entries, null, {dealer: 'paow', step: pinch, target: 'P4.C1', hand: 'LH', chosen: 'a3-p4-rh-ny'}), null, 'a candidate of the other hand is refused');
  assert.equal(a3Name('P4.C1'), 'A3 · P4');
  assert.equal(a3Name('D.C1'), 'A3 · Dealer');
});

// Made-up pictures: green felt, a grey figure in the head band, a black shoe, a yellow card in its window.
const QUAD: Pt[] = [[900, 1000], [960, 1000], [965, 1060], [895, 1060]];
const blank = () => { const b = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { b[i * 3] = 20; b[i * 3 + 1] = 230; b[i * 3 + 2] = 40; } return b; };
const fill = (b: Buffer, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * W + x) * 3; b[i] = rgb[0]; b[i + 1] = rgb[1]; b[i + 2] = rgb[2]; } };
function anchor() { const b = blank(); fill(b, 700, 150, 400, 370, [90, 80, 85]); fill(b, 1300, 640, 400, 250, [15, 15, 15]); fill(b, 1250, 700, 60, 90, [240, 220, 30]); return b; }

test('the A3 is composed from the source and the anchor: the shoe back, a stray card away, the plan\'s card drawn under her fingers', () => {
  const a = anchor(), source = Buffer.from(a);
  fill(source, 1300, 640, 400, 250, [60, 60, 60]);         // the model redrew the shoe
  fill(source, 1000, 1010, 70, 60, [30, 90, 220]);         // and drew its own card beside the seat
  fill(source, 910, 975, 40, 40, [200, 160, 140]);          // her fingertips at the card's edge nearest her
  const made = composeLanding(source, a, (base) => { const d = Buffer.from(base); fill(d, 900, 1000, 60, 60, [20, 110, 230]); return d; }, QUAD);
  const px = (x: number, y: number) => Array.from(made.rgb.subarray((y * W + x) * 3, (y * W + x) * 3 + 3));
  assert.deepEqual(px(1500, 800), [15, 15, 15], 'the shoe is the anchor\'s');
  assert.equal(isCardBlue(made.rgb, 1010 + 1040 * W), false, 'the card the source drew beside the seat is gone');
  assert.deepEqual(px(930, 1030), [20, 110, 230], 'the plan\'s card is drawn');
  assert.deepEqual(px(920, 1005), [200, 160, 140], 'her fingers over the card stay on top');
  assert.ok(made.fingers > 0 && made.strayBlue > 0);
});

test('the checks: a held frame with the fingertips at the card passes; a moved frame and a hand away from the card are said', () => {
  const a = anchor(), source = Buffer.from(a);
  fill(source, 910, 975, 40, 40, [200, 160, 140]);
  const window: [number, number, number, number] = [1150, 560, 330, 260];
  assert.deepEqual(checkLanding(source, a, a, QUAD, window).fails, []);
  assert.deepEqual(nearEdge(QUAD), [[900, 1000], [960, 1000]]);
  const moved = Buffer.from(blank()); fill(moved, 1000, 250, 400, 270, [90, 80, 85]); fill(moved, 1300, 640, 400, 250, [15, 15, 15]); fill(moved, 1250, 700, 60, 90, [240, 220, 30]);
  const c = checkLanding(moved, a, a, QUAD, window);
  assert.match(c.fails.join(' | '), /bildrutan är inte hållen/);
  assert.match(c.fails.join(' | '), /inga fingertoppar/);
});
