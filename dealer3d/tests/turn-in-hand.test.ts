// node --test dealer3d/tests/turn-in-hand.test.ts
// The card turned in her right hand (dealer3d/src/turn-in-hand.ts; Jakob's word in docs/BESKED.md, "Kortet sitter i
// fingrarna genom vändningen"): the default changes nothing, a stored value is read safely, and "I handen", laid on the
// registered cycle to P5.C1, holds the card fast in her fingers with no part of her hand through it. Needs no media.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {TURN_DEFAULT, pierced, turnOf, turnedInHand} from '../src/turn-in-hand.ts';
import {dollNamed} from '../src/doll.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('a stored turn is read as one of the turns, and anything else as the default', () => {
  assert.equal(TURN_DEFAULT, 'forut');
  assert.equal(turnOf(undefined), 'forut');
  assert.equal(turnOf('i-handen'), 'i-handen');
  assert.equal(turnOf('sideways'), 'forut');
});

test('the default turn gives the motion itself', () => {
  const motion = {rests: 0, frames: []};
  const r = turnedInHand(motion as never, dollNamed('paow'), TURN_DEFAULT);
  assert.equal(r.motion, motion);
  assert.equal(r.receipt, null);
});

test('"I handen" holds the card fast, no part of her hand through it', async () => {
  const m = JSON.parse(await readFile(`${ROOT}dealer3d/data/giv-fran-2-3-p5c1-naturlig-cykel-paow.json`, 'utf8'));
  const {motion, receipt} = turnedInHand(m, dollNamed('paow'), 'i-handen');
  assert.ok(receipt?.laid, receipt?.why);
  const F = motion.frames as {card: {c: V; l: V; n: V}; R: {p: V[]}}[], take = receipt!.take!, letGo = receipt!.letGo!, lies = receipt!.lies!;
  // nothing of her right hand in the card, from where she takes it to where it lies (a millimetre is a fingertip resting on it)
  for (let i = take; i <= lies; i++) assert.ok(pierced(F[i].card as never, F[i].R.p) <= 0.001, `frame ${i}: ${pierced(F[i].card as never, F[i].R.p)} m into the card`);
  // held: the thumb and forefinger tips stay where they are on the card, within a millimetre
  const onCard = (i: number, k: number) => { const f = F[i], d = sub(f.R.p[k], f.card.c); return [dot(d, f.card.l), dot(d, cross(f.card.n, f.card.l)), dot(d, f.card.n)]; };
  for (const k of [4, 8]) for (let i = take + 1; i < letGo; i++) {
    const was = onCard(take, k), now = onCard(i, k), moved = Math.hypot(...was.map((x, j) => Math.abs(x) - Math.abs(now[j])));
    assert.ok(moved <= 0.001, `frame ${i}, point ${k}: moved ${(moved * 1000).toFixed(1)} mm on the card`);
  }
});
