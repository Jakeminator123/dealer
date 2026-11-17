// Offline tests for the cut frame as a last picture (src/cut-frame.ts): the picture check (the laid card on the plan, the
// shoe's card plain or printed) and the shoe put back from anchor 1, on made-up pictures in the bank's frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOE_BOX, checkCutFrame, patchShoe } from '../src/cut-frame.ts';

const W = 1764, H = 1174;
const picture = () => { const d = new Uint8Array(W * H * 3); for (let i = 0; i < d.length; i += 3) d.set([0, 237, 43], i); return d; };
const rect = (d: Uint8Array, [x0, y0, x1, y1]: number[], rgb: number[]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d.set(rgb, (y * W + x) * 3); return d; };
const BLUE = [12, 136, 230], YELLOW = [235, 220, 20], INK = [40, 30, 20];
const plan: [number, number, number, number] = [813, 1066, 900, 1137];

test('the cut frame\'s picture check: the laid card on the plan, the shoe\'s card plain or printed', () => {
  const frame = rect(rect(picture(), [814, 1066, 899, 1137], BLUE), [1250, 760, 1330, 850], YELLOW);
  const plain = checkCutFrame(frame, W, H, plan);
  assert.deepEqual([plain.holds, plain.offFromPlan, plain.windowPrinted], [true, 1, false]);
  // An emblem on the window's card (trial 2A's frame 126): the frame holds, the shoe is to be put back.
  const printed = checkCutFrame(rect(frame.slice(), [1275, 790, 1305, 820], INK), W, H, plan);
  assert.deepEqual([printed.holds, printed.windowPrinted], [true, true]);
  // A card 20 px off the plan, or none, does not hold.
  const off = checkCutFrame(rect(rect(picture(), [834, 1086, 919, 1157], BLUE), [1250, 760, 1330, 850], YELLOW), W, H, plan);
  assert.deepEqual([off.holds, off.problems], [false, ['kortet ligger 20 px från planens']]);
  assert.deepEqual(checkCutFrame(picture(), W, H, plan).problems, ['inget lagt kort']);
});

test('the shoe put back from anchor 1: inside the shoe\'s box only, the printed card plain again', () => {
  const frame = rect(rect(rect(picture(), [814, 1066, 899, 1137], BLUE), [1250, 760, 1330, 850], YELLOW), [1275, 790, 1305, 820], INK);
  const anchor = rect(rect(picture(), [1250, 760, 1330, 850], YELLOW), [100, 900, 160, 960], INK); // anchor 1: a hand at the left
  const out = patchShoe(frame, anchor, W, H);
  const at = (d: Uint8Array, x: number, y: number) => Array.from(d.subarray((y * W + x) * 3, (y * W + x) * 3 + 3));
  assert.deepEqual(at(out, 1290, 805), YELLOW, 'the emblem is gone');
  assert.deepEqual(at(out, 850, 1100), BLUE, 'the laid card stays');
  assert.deepEqual(at(out, 130, 930), [0, 237, 43], 'nothing of the anchor outside the shoe\'s box');
  assert.ok(SHOE_BOX[0] > 1150 && SHOE_BOX[2] === W, 'the box lies right of the dealer\'s arms');
  assert.equal(checkCutFrame(out, W, H, plan).windowPrinted, false);
});
