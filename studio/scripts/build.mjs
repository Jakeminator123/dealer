// One build of the studio at a time. Several builders work in the studio at once and each wants to see its page; two
// builds in the same folder at the same moment destroy each other. This takes a lock (a folder, made atomically), builds,
// and lets go; a second caller waits its turn. A lock older than five minutes was left by a build that died, and is taken over.
//
// node scripts/build.mjs: the local studio (out/, served by the lab server). node scripts/build.mjs --snapshot: the locked
// online copy (lib/mode.ts), exported to ../.runtime/studio-snapshot/out (next.config.ts) for tools/build-studio-snapshot.ts.
// The mode is set here and nowhere else: a plain build always clears it, so a stray variable never turns the lab into a copy.
import {spawnSync} from 'node:child_process';
import {mkdirSync, rmSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
const lock = '.next-build.lock', wait = ms => new Promise(done => setTimeout(done, ms));
const snapshot = process.argv.includes('--snapshot');
const env = {...process.env};
if (snapshot) env.NEXT_PUBLIC_DEALER_MODE = 'snapshot'; else delete env.NEXT_PUBLIC_DEALER_MODE;
for (let waited = 0; ; waited += 2) {
  try { mkdirSync(lock); break; } catch {
    let age = Infinity; try { age = Date.now() - statSync(lock).mtimeMs; } catch {}
    if (age > 300000) { rmSync(lock, {recursive: true, force: true}); continue; }
    if (waited === 0) console.log('En annan byggare bygger just nu; väntar på min tur.');
    await wait(2000);
  }
}
try {
  if (snapshot) console.log('Bygger kopian för nätet (NEXT_PUBLIC_DEALER_MODE=snapshot).');
  const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const run = spawnSync(process.execPath, [next, 'build'], {stdio: 'inherit', env});
  process.exitCode = run.status ?? 1;
} finally { rmSync(lock, {recursive: true, force: true}); }
