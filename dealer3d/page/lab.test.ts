// node --test dealer3d/page/lab.test.ts
// The doll lab's two copies of a tool's body (dealer3d/page/lay.ts of tools/deal-film.ts, page/pose-on-doll.ts of
// tools/doll-pose.ts) give what the tools give: a stored deal laid again from its own recipe is the stored deal, and a
// motion posed on the doll paow is the file the tool writes of it today. So what the lab shows and saves is what the
// tools would have made, as long as the copies exist. And every place of Jakob's plan has either a recipe that is a file
// here or a reason why not. Needs no media and no browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SHOE_LAID_BEFORE_20261123, filmLens} from '../src/world.ts';
import {dollNamed} from '../src/doll.ts';
import {NO_STEER, layDeal, recipeFor, recipeOf, steered} from './lay.ts';
import {poseOnDoll} from './pose-on-doll.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = async (name: string) => JSON.parse(await readFile(path.join(ROOT, 'dealer3d/data', `${name}.json`), 'utf8'));
const plan = JSON.parse((await readFile(path.join(ROOT, 'placements/default.json'), 'utf8')).replace(/^﻿/, ''));

test('every place of the plan has a recipe that is a file here, or a reason', () => {
  const ids = Object.keys(plan.targets); assert.ok(ids.length >= 17);
  for (const id of ids) { const r = recipeFor(id); assert.ok(r, `${id} is not a place the lab knows`);
    if ('recipe' in r) assert.ok(existsSync(path.join(ROOT, 'dealer3d/data', `${r.recipe}.json`)), `${id}: ${r.recipe} is not a file`); else assert.match(r.none, /^(reach|closed)$/); }
});

test('a stored deal laid again from its own recipe is the stored deal', async () => {
  const names = new Set<string>(); for (const id of Object.keys(plan.targets)) { const r = recipeFor(id); if (r && 'recipe' in r) names.add(r.recipe); }
  names.delete('giv-fran-2-3-p6-f'); // its place has moved in the plan since it was laid
  assert.ok(names.size >= 8);
  for (const name of names) { const stored = await read(name), recipe = recipeOf(name, stored), pose = await read(recipe.poseFilm ?? 'till-ankare-2-3');
    assert.deepEqual(steered(recipe, NO_STEER), {frames: stored.frameCount, beats: recipe.beats}, name);
    const deal = layDeal({plan, target: stored.to[0], recipe, pose, shoe: SHOE_LAID_BEFORE_20261123}); // with the shoe it was laid with
    assert.equal(JSON.stringify(deal.frames), JSON.stringify(stored.frames), `${name}: the frames`);
    for (const key of ['beats', 'laid', 'turns', 'leavesShoe', 'edge', 'folds', 'rests', 'hip', 'elbowForced', 'throughShoe'] as const) assert.deepEqual(JSON.parse(JSON.stringify(deal[key])), stored[key], `${name}: ${key}`); }
});

test('a motion posed on paow is what dealer3d/tools/doll-pose.ts writes of it', async () => {
  const work = await mkdtemp(path.join(tmpdir(), 'docklabb-'));
  try {
    for (const name of ['giv-fran-2-3-p4c2-grepp-svep-d', 'till-ankare-2-3-c']) { const out = path.join(work, `${name}.json`);
      execFileSync(process.execPath, ['dealer3d/tools/doll-pose.ts', '--motion', `dealer3d/data/${name}.json`, '--doll', 'paow', '--out', out], {cwd: ROOT, stdio: 'pipe', windowsHide: true});
      const theirs = JSON.parse(await readFile(out, 'utf8')), mine = poseOnDoll(filmLens(), await read(name), dollNamed('paow')).motion;
      assert.equal(JSON.stringify(mine.frames), JSON.stringify(theirs.frames), `${name}: the frames`); assert.equal(mine.doll, theirs.doll);
      assert.deepEqual(Object.keys(mine), Object.keys(theirs), `${name}: the fields`); }
  } finally { await rm(work, {recursive: true, force: true}); }
});
