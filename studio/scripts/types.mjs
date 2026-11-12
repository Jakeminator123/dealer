// Type check of the studio's own files. The lab's modules in ../src are written for Node's type stripping and have never
// been through a type checker; their findings are counted, not failed on, so that a real error in the studio stands out.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const run = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], {encoding: 'utf8'});
const lines = (run.stdout + run.stderr).split('\n').filter(line => /error TS\d+/.test(line));
const own = lines.filter(line => !line.startsWith('../'));
for (const line of own) console.log(line);
console.log(`${own.length} fel i studions filer; ${lines.length - own.length} anmärkningar i ../src (räknas inte).`);
process.exit(own.length ? 1 : 0);
