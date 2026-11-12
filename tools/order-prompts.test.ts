// Offline tests for the order texts (src/order-prompts.ts): scene + action + bans, the turn without a fixed side and its
// two variants, the place words, and the stills made as edits of the dealer's own picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BANS_FILM, BANS_STILL, placeWords, promptFor, turnSentence } from '../src/order-prompts.ts';
import { STEPS, type StepKey } from '../src/order-model.ts';

const paow = { name: 'Paow', look: 'a young, slim woman in a black blazer' };

test('every template ends with what must not happen', () => {
  for (const step of STEPS) {
    const { text, template } = promptFor({ dealer: paow, step: step.key as StepKey, model: step.model, place: { x: 852, y: 1101 }, motion: step.card ? { grip: step.grip ?? 'PINCH', turn: true, flipAxis: 'FREE', side: 'FRONT' } : null });
    assert.ok(text.endsWith(step.kind === 'STILL' ? BANS_STILL : BANS_FILM), `${step.key} (${template})`);
    assert.match(template, /@1$/);
  }
  for (const ban of ['a second card', 'a finger passes through the card', 'grows or shrinks', 'hovers in the air', 'the picture cuts']) assert.ok(BANS_FILM.includes(ban), ban);
});

test('the turn: no fixed side by default; the two variants say which side, in a sentence a model can follow', () => {
  const free = turnSentence('FREE');
  assert.match(free, /natural movement/);
  assert.match(free, /human hand can actually make/);
  assert.doesNotMatch(free, /long side|short edge/);
  assert.match(turnSentence('LONG_EDGE'), /about its long side/);
  assert.match(turnSentence('SHORT_EDGE'), /folds it over that held short edge/);
  assert.match(turnSentence('SHORT_EDGE'), /never about its long side/);
  assert.match(turnSentence('FREE', 'DRAG'), /fingertips on the card/);
});

test('a deal: the card is taken as it looks in the shoe, lands where the last frame shows, the other hand rests', () => {
  const kling = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', place: { x: 856.6, y: 1101.4 }, motion: { grip: 'PINCH', turn: true, flipAxis: 'FREE', side: 'FRONT' } }).text;
  assert.match(kling, /^One continuous take with a locked-off camera/);
  assert.match(kling, /a young, slim woman in a black blazer/);
  assert.match(kling, /looks as it does in the shoe, the same size and shape/);
  assert.match(kling, /exactly where the blue card lies in the last frame, in the middle of the picture, at the same size and angle/);
  assert.match(kling, /Her right hand, at the left of the picture, rests on the table the whole time/);
  assert.doesNotMatch(kling, /reference picture/);
  assert.match(promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', middle: true, motion: { grip: 'PINCH', turn: true, flipAxis: 'FREE', side: 'FRONT' } }).text, /Halfway there, her hand and the card look exactly as in the reference picture/);
  const wan = promptFor({ dealer: paow, step: 'GIV-2.2', model: 'wan3', place: { x: 220, y: 997 }, motion: { grip: 'DRAG', turn: false, flipAxis: 'FREE', side: 'BACK' } }).text;
  assert.match(wan, /^Locked camera\. A young, slim woman/);
  assert.match(wan, /slides that one card straight out of the shoe/);
  assert.match(wan, /the card is not turned/);
  assert.match(wan, /far to the left of the picture/);
  const extra = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', extra: '  She smiles. ', motion: { grip: 'PINCH', turn: true, flipAxis: 'FREE', side: 'FRONT' } }).text;
  assert.ok(extra.endsWith(`She smiles. ${BANS_FILM}`), 'the free addition goes before the bans');
});

test('the stills: an edit of @anchor, only the left arm and hand change, the shoe and card from @anchor', () => {
  const a21 = promptFor({ dealer: paow, step: 'ANKARE-2.1', model: 'nano-banana-pro' }).text;
  assert.match(a21, /^This is an edit of the picture @anchor\./);
  assert.match(a21, /Change only her left arm and hand/);
  assert.match(a21, /between thumb and forefinger, in exactly the pose of the dealer's left hand in @pose/);
  assert.match(a21, /not the person, her clothes, the shoe or the card/);
  assert.match(a21, /elbows hang free/);
  assert.match(promptFor({ dealer: paow, step: 'ANKARE-2.2', model: 'nano-banana-pro' }).text, /The shoe in @pose has an open front: do not copy it/);
  assert.match(promptFor({ dealer: paow, step: 'MELLANBILD', model: 'nano-banana-pro' }).text, /the card stands upright on that short edge/);
});

test('place words follow the script the bank was ordered with', () => {
  assert.equal(placeWords({ x: 852, y: 1101 }), 'in the middle of the picture');
  assert.equal(placeWords({ x: 1468, y: 951 }), 'close to her body, far to the right of the picture');
  assert.equal(placeWords({ x: 669, y: 1045 }), 'to the left of the middle of the picture');
});

test('the dealers named in the register of dealers have a look for the texts', async () => {
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  assert.deepEqual(dealers.map((d: { id: string }) => d.id), ['pamela', 'paow']);
  for (const d of dealers) assert.ok(d.look.length > 40 && !/[.]$/.test(d.look), d.id);
  assert.match(dealers[1].look, /black tailored blazer/);
});
