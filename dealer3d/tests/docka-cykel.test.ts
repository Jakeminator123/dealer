// node --test dealer3d/tests/docka-cykel.test.ts
// Material made stays makeable (Jakob 2026-11-23: "om saker ändras måste det vara kompatibelt med material skapat"):
// dealer3d/tools/docka-cykel.ts, laying P5.C1 on paow as "Naturlig" was before 2026-11-23 (--sam-hand --recipe-grip-yaw
// --fingrar-som-forut) with nothing steered, gives the frames of the cycle the film paow-giv-2-3-p5-04 was ordered from
// (registered as docka-paow-2-3-p5c1-naturlig-cykel-a). Needs no media and no browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('the cycle to P5.C1 in Naturlig as it was, nothing steered, is the one the film was ordered from', async () => {
  const work = await mkdtemp(path.join(tmpdir(), 'docka-cykel-')), out = path.join(work, 'cykel.json');
  try {
    execFileSync(process.execPath, ['dealer3d/tools/docka-cykel.ts', '--to', 'P5.C1', '--no-standard', '--sam-hand', '--recipe-grip-yaw', '--fingrar-som-forut', '--out', out], {cwd: ROOT, stdio: 'pipe', windowsHide: true});
    const mine = JSON.parse(await readFile(out, 'utf8')), theirs = JSON.parse(await readFile(path.join(ROOT, 'dealer3d/data/giv-fran-2-3-p5c1-naturlig-cykel-paow.json'), 'utf8'));
    assert.equal(JSON.stringify(mine.frames), JSON.stringify(theirs.frames), 'the frames');
    for (const key of ['fps', 'frameCount', 'rests', 'doll', 'hip', 'beats', 'pace', 'places']) assert.deepEqual(mine[key], theirs[key], key);
    assert.deepEqual({...mine.cycle, source: null, sourceSha256: null}, {...theirs.cycle, source: null, sourceSha256: null}, 'the cycle');
  } finally { await rm(work, {recursive: true, force: true}); }
});
