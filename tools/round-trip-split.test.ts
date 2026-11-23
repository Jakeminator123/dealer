// The contract of the split of a deal and its return in one film (tools/round-trip-split.ts), on drawn frames: no film needed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findSplit, LIMITS} from './round-trip-split.ts';

// A green table 120 × 90, a blue card 16 × 10 that ends at PLACE, and a skin-coloured hand 14 wide that comes down from the top
// edge with the card under its tip, and goes back up. The hand's top edge is given per frame; null is no hand in the picture.
const W = 120, H = 90, TABLE = [0, 235, 20], CARD = [30, 90, 220], SKIN = [240, 190, 160], PLACE = {x: 52, y: 60}, REST = 33, TIP = 27;
function picture(card: {x: number; y: number} | null, handTop: number | null): Uint8Array {
  const out = new Uint8Array(W * H * 3), fill = (x0: number, y0: number, w: number, h: number, c: number[]) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) out.set(c, (y * W + x) * 3); };
  fill(0, 0, W, H, TABLE);
  if (card) fill(card.x, card.y, 16, 10, CARD);
  if (handTop !== null) fill(53, Math.round(handTop), 14, 30, SKIN);
  return out;
}
/** A film from the hand's top edge per frame; the card follows the hand's tip until `lets` (the frame it is let go at its place). */
const film = (tops: number[], lets: number) => tops.map((top, f) => picture(f === 0 ? null : f >= lets ? PLACE : {x: PLACE.x, y: Math.round(top) + TIP}, top));
const down = Array.from({length: 11}, (_, k) => k * REST / 10), up = [...down].reverse().slice(1), stay = (frames: number, top: number) => Array(frames).fill(top);

test('the deal ends on a still frame with the card lying and the hand at it, and the return begins on the first frame that moves', () => {
  // Down in ten frames, seven frames at rest on the card, up again, four frames with the hand back.
  const found = findSplit(film([...down, ...stay(7, REST), ...up, ...stay(4, 0)], 10), W, H), m = found.measures;
  assert.equal(found.split, 18, found.why);
  const last = found.split! - 1;
  assert.ok(found.laid! < found.split!, 'the return never begins before the card lies');
  assert.ok(m.stray[last] <= LIMITS.stray && m.seen[last] >= LIMITS.seen, 'the card lies at its place in the last frame of the deal');
  assert.ok(m.hand[last] >= LIMITS.hand, 'the hand is at the card in the last frame of the deal');
  assert.equal(m.motion[last], 0, 'the last frame of the deal stands still');
  assert.ok(m.motion[found.split!] > 0, 'the first frame of the return moves');
});

test('a film without a safe frame gives none, and says why', () => {
  const none = (frames: Uint8Array[]) => { const found = findSplit(frames, W, H); assert.equal(found.split, null); assert.ok(found.why); };
  // The hand turns at once: it never stands still at the card.
  none(film([...down, ...up, ...stay(4, 0)], 10));
  // The hand waits with the card held beside its place, then lays it in passing: the only stillness is before the card lies.
  none(film([...down.slice(0, 7), ...stay(6, down[6]), ...down.slice(7), ...up, ...stay(4, 0)], 16));
  // The hand rests, leaves, and comes back over the card before it goes: which leaving is the return is not the tool's to say.
  none(film([...down, ...stay(4, REST), ...up.slice(0, 5), ...down.slice(6), ...stay(1, REST), ...up, ...stay(4, 0)], 10));
  // No card in the last frame.
  none([...down, ...stay(4, REST), ...up, ...stay(4, 0)].map(top => picture(null, top)));
});
