// One build of the studio at a time. Several builders work in the studio at once and each wants to see its page; two
// builds in the same folder at the same moment destroy each other. This takes a lock (a folder, made atomically), builds,
// and lets go; a second caller waits its turn. A lock older than five minutes was left by a build that died, and is taken over.
import {spawnSync} from 'node:child_process';
import {mkdirSync, rmSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
const lock = '.next-build.lock', wait = ms => new Promise(done => setTimeout(done, ms));
for (let waited = 0; ; waited += 2) {
  try { mkdirSync(lock); break; } catch {
    let age = Infinity; try { age = Date.now() - statSync(lock).mtimeMs; } catch {}
    if (age > 300000) { rmSync(lock, {recursive: true, force: true}); continue; }
    if (waited === 0) console.log('En annan byggare bygger just nu; väntar på min tur.');
    await wait(2000);
  }
}
try {
  const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const run = spawnSync(process.execPath, [next, 'build'], {stdio: 'inherit'});
  process.exitCode = run.status ?? 1;
} finally { rmSync(lock, {recursive: true, force: true}); }
