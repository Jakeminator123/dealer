import test from 'node:test';
import assert from 'node:assert/strict';
import {linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {report, scanStorage, storageSummary} from './media-status.ts';

test('inventory counts hard links once, skips worktrees and never follows junctions', t => {
  const repo = mkdtempSync(path.join(tmpdir(), 'dealer-inventory-'));
  t.after(() => rmSync(repo, {recursive: true, force: true}));
  for (const folder of ['assets', '.runtime/worktree', '.runtime/media-status', 'outside']) mkdirSync(path.join(repo, folder), {recursive: true});
  writeFileSync(path.join(repo, 'assets/one.mp4'), 'film');
  linkSync(path.join(repo, 'assets/one.mp4'), path.join(repo, 'assets/copy.mp4'));
  writeFileSync(path.join(repo, '.runtime/worktree/.git'), 'gitdir: elsewhere');
  writeFileSync(path.join(repo, '.runtime/worktree/ignored'), 'not media');
  writeFileSync(path.join(repo, '.runtime/media-status/status.json'), 'previous report');
  writeFileSync(path.join(repo, 'outside/source'), 'outside');
  symlinkSync(path.join(repo, 'outside'), path.join(repo, 'assets/link'), process.platform === 'win32' ? 'junction' : 'dir');
  const files = scanStorage(repo);
  assert.deepEqual(storageSummary(files), {files: 2, logicalBytes: 8, uniqueBytes: 4});
  const output = report(repo, files, [], {at: 'yesterday', uniqueBytes: 8});
  assert.match(output.markdown, /Förändring sedan yesterday: -/);
  assert.match(output.markdown, /ingen raderingslista/);
});
