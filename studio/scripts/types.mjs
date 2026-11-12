// Type check of the studio's own files. The lab's modules in ../src are written for Node's type stripping and have never
// been through a type checker; their findings are counted, not failed on, so that a real error in the studio stands out.
// With paths given (node scripts/types.mjs app/karta components/map), only findings in those files and folders count:
// several builders work in the studio at once, and each answers for its own files.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const run = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], {encoding: 'utf8'});
const slashes = text => text.split('\\').join('/');
const lines = (run.stdout + run.stderr).split('\n').filter(line => /error TS\d+/.test(line)).map(slashes);
const mine = process.argv.slice(2).map(path => slashes(path).replace(/^\.\//, ''));
const studio = lines.filter(line => !line.startsWith('../'));
const own = mine.length ? studio.filter(line => mine.some(path => line.startsWith(path))) : studio;
for (const line of own) console.log(line);
console.log(`${own.length} fel i ${mine.length ? 'dina filer' : 'studions filer'}; ${studio.length - own.length} i andras studiofiler; ${lines.length - studio.length} anmärkningar i ../src (räknas inte).`);
process.exit(own.length ? 1 : 0);
