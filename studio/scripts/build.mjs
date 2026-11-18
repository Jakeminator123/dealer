// One build of the studio at a time. Several builders work in the studio at once and each wants to see its page; two
// builds in the same folder at the same moment destroy each other. The Next process owns a lock directory until it exits.
// A second caller waits its turn. Only an identified owner that has exited permits automatic recovery.
//
// node scripts/build.mjs: the local studio (out/, served by the lab server). node scripts/build.mjs --snapshot: the locked
// online copy (lib/mode.ts), exported to ../.runtime/studio-snapshot/out (next.config.ts) for tools/build-studio-snapshot.ts.
// The mode is set here and nowhere else: a plain build always clears it, so a stray variable never turns the lab into a copy.
import {randomUUID} from 'node:crypto';
import {lstatSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const lock = resolve('.next-build.lock'), wait = ms => new Promise(done => setTimeout(done, ms));
const owner = `owner-${process.pid}-${randomUUID()}`;
const snapshot = process.argv.includes('--snapshot');
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');

function release(entry) {
  try { unlinkSync(join(lock, entry)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  // Only the caller that removed this exact owner can remove the now-empty directory.
  rmdirSync(lock);
}

function recover() {
  let entries;
  try {
    if (!lstatSync(lock).isDirectory()) return false;
    entries = readdirSync(lock);
  } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  const entry = entries.length === 1 ? entries[0] : '';
  const pid = /^owner-([1-9]\d*)-[0-9a-f-]{36}$/i.exec(entry)?.[1];
  if (!pid || !lstatSync(lock, {throwIfNoEntry: false})?.isDirectory()) return false;
  try { process.kill(Number(pid), 0); }
  catch (error) {
    if (error.code !== 'ESRCH') return false;
    release(entry);
    return true;
  }
  return false;
}

for (let waiting = false; ;) {
  try { mkdirSync(lock); break; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (recover()) continue;
  if (!waiting) console.log('Bygglåset är upptaget eller saknar verifierbar ägare. Väntar på min tur.');
  waiting = true;
  await wait(2000);
}
try { writeFileSync(join(lock, owner), '', {flag: 'wx'}); }
catch (error) { rmdirSync(lock); throw error; }
process.once('exit', () => release(owner));

if (snapshot) process.env.NEXT_PUBLIC_DEALER_MODE = 'snapshot';
else delete process.env.NEXT_PUBLIC_DEALER_MODE;
// At most four workers (AGENTS: the machine is shared with the lab server and other sessions). Next 16 takes its default
// worker count, when next.config.ts sets no experimental.cpus, as CIRCLE_NODE_TOTAL − 1 (else the cores − 1, 15 here), and
// reads that variable for nothing else (next/dist/server/config-shared.js).
process.env.CIRCLE_NODE_TOTAL = '5';
if (snapshot) console.log('Bygger kopian för nätet (NEXT_PUBLIC_DEALER_MODE=snapshot).');
// Run Next in this process so a launcher cannot die while its child still owns the build output.
process.argv = [process.execPath, next, 'build'];
await import(pathToFileURL(next).href);
