import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {checkedPath, hash, removeCopy, within} from './media-dedupe.ts';

test('duplicate deletion retains the canonical file and rejects escapes, new files, changed content and references', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dealer-dedupe-'));
  const source = path.join(root, 'scratch'), assets = path.join(root, 'assets');
  mkdirSync(source); mkdirSync(assets);
  const remove = path.join(source, 'old.mp4'), keep = path.join(assets, 'original.mp4');
  const old = new Date(Date.now() - 7 * 86400_000);
  try {
    writeFileSync(remove, 'film'); writeFileSync(keep, 'film');
    const copy = {remove, keep, bytes: 4, sha256: await hash(keep)};
    await assert.rejects(removeCopy(source, assets, copy, () => false), /Ändrad eller skyddad/);
    utimesSync(remove, old, old);
    await assert.rejects(removeCopy(source, assets, copy, () => true), /Ändrad eller skyddad/);
    writeFileSync(keep, 'lost');
    await assert.rejects(removeCopy(source, assets, copy, () => false), /Innehållet har ändrats/);
    writeFileSync(keep, 'film');
    await assert.rejects(removeCopy(source, assets, {...copy, remove: keep}, () => false), /Utanför vald rot/);
    assert.equal(within(source, path.join(root, 'scratch-other', 'old.mp4')), false);
    assert.equal(within(source, source), false);
    assert.ok(existsSync(remove));
    await removeCopy(source, assets, copy, () => false);
    assert.equal(existsSync(remove), false); assert.ok(existsSync(keep));
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('a junction cannot redirect a cleanup path', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dealer-dedupe-link-'));
  try {
    const outside = path.join(root, 'outside'), source = path.join(root, 'scratch');
    mkdirSync(outside); mkdirSync(source); writeFileSync(path.join(outside, 'film.mp4'), 'film');
    symlinkSync(outside, path.join(source, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => checkedPath(source, path.join(source, 'link', 'film.mp4')), /Länk vägras/);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
