import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('the approved mouth profile and explicit overrides pass their standard-library regressions', t => {
  const python = process.platform === 'win32' ? 'python.exe' : 'python3';
  const version = spawnSync(python, ['--version'], {encoding:'utf8', windowsHide:true, timeout:10_000});
  if ((version.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    t.skip('Python 3 is unavailable; the mouth profile regressions were not run.');
    return;
  }
  assert.equal(version.status, 0, version.error?.message ?? version.stderr);
  assert.match(version.stdout + version.stderr, /Python 3\./);
  const folder = fileURLToPath(new URL('./python/mouth-runner/', import.meta.url));
  const result = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
    cwd:folder, encoding:'utf8', windowsHide:true, timeout:30_000,
  });
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 0, result.error?.message ?? output);
  assert.match(output, /Ran [1-9]\d* tests?\b/, 'the interpreter must discover and run the profile regressions');
});
