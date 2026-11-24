// The doll's card is Kortplan's card (Jakob 2026-11-24: "så att det inte blir två olika typer av kort"): the marks on each
// of its sides have Kortplan's measures and colours.   node --test dealer3d/tests/card-marks.test.ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CARD_MARK, CARD_RGB} from '../../src/placement-model.ts';
import {CARD_MARKS} from '../src/card-marks.ts';

test('dockans kort bär Kortplanens märken på båda sidor: samma mått och samma färger', () => {
  const hex = (c: readonly number[]) => (c[0] << 16) | (c[1] << 8) | c[2];
  assert.deepEqual({arm: CARD_MARKS.cross.arm, stroke: CARD_MARKS.cross.stroke}, CARD_MARK.cross);
  assert.deepEqual({radius: CARD_MARKS.dot.radius, inset: CARD_MARKS.dot.inset}, CARD_MARK.dot);
  assert.deepEqual(CARD_MARKS.back, CARD_MARK.back);
  assert.equal(CARD_MARKS.cross.colour, hex(CARD_RGB.cross));
  assert.equal(CARD_MARKS.dot.colour, hex(CARD_RGB.dot));
});
