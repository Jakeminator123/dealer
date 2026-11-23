// node --test dealer3d/tests/landing.test.ts
// The landing (dealer3d/src/landing.ts; Jakob 2026-11-23, "inte alltid exakt samma slutpose för handen"): a standard saves it
// as `lab.landing`, and one saved without it, as every standard saved before, lays her hand as it always lay, to the last
// digit (Jakob 2026-11-23: "om saker ändras måste det vara kompatibelt med material skapat"). Needs no media and no browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {LANDINGS, LANDING_DEFAULT, landed, landingOf, landingTimes} from '../src/landing.ts';
import {dollNamed} from '../src/doll.ts';
import {faultOf} from '../page/server.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = async (file: string) => JSON.parse(await readFile(`${ROOT}${file}`, 'utf8'));

test('a standard saves its landing in lab.landing and reads it back; no field, or one not known, is the hand as before', async () => {
  const standard = await json('dealer3d/standard/paow-p3c1.json'), mine = {id: 'pek', roll: 12, reach: 1.5};
  assert.equal(faultOf('paow-p3c1', {...standard, lab: {...standard.lab, landing: mine}}), null);
  assert.deepEqual(landingOf(JSON.parse(JSON.stringify({...standard.lab, landing: mine})).landing), mine);
  for (const l of LANDINGS) assert.deepEqual(landingOf({id: l.id}), {id: l.id});
  for (const old of [undefined, null, {}, 'pek', {id: 'slapp'}, {roll: 5}]) assert.equal(landingOf(old).id, LANDING_DEFAULT, JSON.stringify(old));
  assert.deepEqual(landingOf({id: 'platt', reach: 9, curl: 0, spread: 'x', bend: -99}), {id: 'platt', reach: 3, bend: -30}, 'within the controls, nought left out');
});

test('no landing lays the cycle a film was ordered from as it is', async () => {
  const cycle = await json('dealer3d/data/giv-fran-2-3-p5c1-naturlig-cykel-paow.json'), before = JSON.stringify(cycle.frames);
  const end = landed(cycle, dollNamed('paow'), landingOf(undefined), landingTimes(cycle, cycle.cycle));
  assert.equal(end.motion, cycle); assert.equal(end.receipt, null); assert.equal(JSON.stringify(end.motion.frames), before);
});
