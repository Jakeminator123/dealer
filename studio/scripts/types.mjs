// Check the studio and its imported files. An optional list restricts which studio files are reported.
// Project, compiler and imported-file errors always fail the check.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {isAbsolute, relative, resolve, sep} from 'node:path';

function contains(directory, file) {
  const name = relative(directory, file);
  return !isAbsolute(name) && name !== '..' && !name.startsWith('..' + sep);
}

function main() {
  let compiler;
  try {
    compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  } catch (error) {
    console.error(`TypeScript-kompilatorn kunde inte hittas. ${error.message}`);
    return 1;
  }

  const run = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {encoding: 'utf8'});
  if (run.error || run.signal || run.status === null) {
    const reason = run.error?.message ?? (run.signal ? `signal ${run.signal}` : 'slutstatus saknas');
    console.error(`TypeScript-kontrollen avbröts (${reason}).`);
    return 1;
  }

  const output = [run.stdout, run.stderr].filter(Boolean).join('\n');
  const studioRoot = process.cwd();
  const scopes = process.argv.slice(2).map((scope) => resolve(studioRoot, scope));
  const own = [], project = [], external = [];
  let others = 0;
  for (const line of output.split(/\r?\n/)) {
    const location = /^(.*)\(\d+,\d+\): error TS\d+:/.exec(line);
    if (!location) {
      if (/^error TS\d+:/.test(line)) project.push(line);
      continue;
    }
    const file = resolve(studioRoot, location[1]);
    if (!contains(studioRoot, file)) external.push(line);
    else if (!scopes.length || scopes.some((scope) => contains(scope, file))) own.push(line);
    else others++;
  }

  if (run.status !== 0 && !own.length && !project.length && !others && !external.length) {
    console.error(`TypeScript-kontrollen avslutades med kod ${run.status} utan läsbara fel från kompilatorn.`);
    if (output.trim()) console.error(output.trim());
    return 1;
  }
  for (const line of project) console.error(line);
  for (const line of own) console.log(line);
  for (const line of external) console.log(line);
  console.log(`${own.length} fel i ${scopes.length ? 'dina filer' : 'studions filer'}. ${others} i andra studiofiler. ${external.length} fel i importerade filer utanför studion.`);
  return own.length || project.length || external.length ? 1 : 0;
}

process.exitCode = main();
