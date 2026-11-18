// The studio Jakob sees, built from the committed state (docs/lage/labbet-och-studion.md; DRIFT, "Labbservern och fliken"): the lab
// server hands out the main checkout's studio/out, and a build there would carry every session's half-finished studio
// file to his tab. This builds a commit in a clean worktree on the scratch disk (detached, `npm ci` when a package list
// changed or node_modules is missing, `npm --prefix studio run build`) and only after a build that succeeded swaps the
// result into the main checkout's studio/out: copied beside it as out.ny, the old folder moved aside, the new one moved
// in, the old one removed. A failed build or a failed move leaves the served folder as it was. bygge.json in the folder
// says which commit it is. Nothing is committed, and the lab server is not restarted (it reads studio/out per request).
//
//   node tools/studio-from-commit.ts [<commit>] [--trad <mapp>] [--ut <mapp>]
//     <commit>   what is built (default main)
//     --trad     the clean tree (default D:/dealer-scratch/tmp/huvudagent11/push-trad, the one in use; made once with
//                git worktree add --detach <mapp> main)
//     --ut       the folder swapped (default the main checkout's studio/out); a trial gives a folder of its own
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Stop, cleanAt, clock, commitOf, commonDirOf, exec, mainCheckout, needsCi, tail, type Exec, type Say} from './clean-tree.ts';
import type {RunReceiptInput} from './evidence-store.ts';
import {captureRunContext} from './evidence-context.ts';

export const DEFAULT_TREE = 'D:/dealer-scratch/tmp/huvudagent11/push-trad';
export type Options = {commit: string; tree: string; out?: string};

export function parseArgs(argv: string[]): Options {
  const options: Options = {commit: 'main', tree: DEFAULT_TREE};
  const loose: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--trad' || arg === '--ut') {
      const value = argv[++i];
      if (!value) throw new Stop(`STOPP: ${arg} kräver en mapp`);
      if (arg === '--trad') options.tree = value; else options.out = value;
    } else if (arg.startsWith('--')) throw new Stop(`STOPP: okänd flagga ${arg} (node tools/studio-from-commit.ts [<commit>] [--trad <mapp>] [--ut <mapp>])`);
    else loose.push(arg);
  }
  if (loose.length > 1) throw new Stop('STOPP: högst en commit');
  if (loose[0]) options.commit = loose[0];
  return options;
}

const count = (dir: string): number => readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);

/** Puts a copy of `built` where `target` is, with `stamp` as bygge.json. The served folder is moved aside only when the
 *  copy is complete, and put back if the new one cannot be moved in. Returns the number of files. */
export function swapInto(built: string, target: string, stamp: Record<string, unknown>, rename = renameSync): number {
  const next = `${target}.ny`, old = `${target}.gammal`;
  // A run that died between the two moves left the served folder aside: put it back before anything else.
  if (!existsSync(target) && existsSync(old)) rename(old, target);
  for (const leftover of [next, old]) rmSync(leftover, {recursive: true, force: true});
  try {
    cpSync(built, next, {recursive: true});
    writeFileSync(path.join(next, 'bygge.json'), JSON.stringify(stamp, null, 2) + '\n');
  } catch (error) { rmSync(next, {recursive: true, force: true}); throw new Stop(`STOPP: kopian gick inte att skriva (${(error as Error).message}); det som visas är orört`); }
  const files = count(next);
  const had = existsSync(target);
  if (had) {
    try { rename(target, old); } catch (error) { rmSync(next, {recursive: true, force: true}); throw new Stop(`STOPP: ${target} gick inte att flytta undan (${(error as Error).message}); det som visas är orört`); }
  }
  try { rename(next, target); } catch (error) {
    if (had) rename(old, target);
    rmSync(next, {recursive: true, force: true});
    throw new Stop(`STOPP: det nya bygget gick inte att flytta in (${(error as Error).message}); det gamla står kvar`);
  }
  rmSync(old, {recursive: true, force: true});
  return files;
}

export type Io = {
  run: Exec;
  say: Say;
  log: (name: string, text: string) => void;
  exists?: (p: string) => boolean;
  swap?: typeof swapInto;
  installedRevision?: (target: string) => string | null;
  receipt?: (root: string, result: RunReceiptInput) => void;
  context?: typeof captureRunContext;
};

function installedRevision(target: string): string | null {
  try {
    const stamp = JSON.parse(readFileSync(path.join(target, 'bygge.json'), 'utf8'));
    return typeof stamp?.commit === 'string' ? stamp.commit : null;
  } catch {
    return null;
  }
}

/** The whole routine; returns the exit code. */
export function studioFromCommit(root: string, options: Options, io: Io): number {
  const {run, say, log} = io, exists = io.exists ?? existsSync;
  const step = (name: string, args: string[]) => { const r = run('npm', args, options.tree); log(name, r.out); return r; };
  const context = io.context ?? captureRunContext;
  let attempt: {root: string; revision: string; startedAt: string; served: boolean; inputs: RunReceiptInput['inputs']; dirtyInputs: string[]} | null = null;
  let status = 'fail';
  let note = 'npm-build';
  try {
    const checkout = mainCheckout(commonDirOf(root, run));
    const studio = path.join(checkout, 'studio', 'out');
    const target = options.out ?? studio;
    const sha = commitOf(root, options.commit, run);
    const old = cleanAt(root, options.tree, sha, say, run, exists);
    for (const folder of ['', 'studio']) {
      const why = needsCi(options.tree, folder, old, sha, run, exists);
      if (!why) continue;
      const args = folder ? ['--prefix', folder, 'ci'] : ['ci'];
      say(`${why}: npm ${args.join(' ')}`);
      const ci = step(folder ? 'studio-ci.log' : 'npm-ci.log', args);
      if (ci.code !== 0) throw new Stop([`STOPP: npm ${args.join(' ')}`, ...tail(ci.out, 20)].join('\n'));
    }
    const revision = commitOf(options.tree, 'HEAD', run);
    if (revision !== sha) throw new Stop(`STOPP: byggträdet står på ${revision}, väntade ${sha}`);
    const before = context(options.tree);
    if (before.revision !== revision || before.dirtyInputs.length) throw new Stop(`STOPP: byggträdet ändrades före bygget; ${target} är orört`);
    attempt = {root: checkout, revision, startedAt: new Date().toISOString(), served: path.relative(studio, target) === '', inputs: before.inputs, dirtyInputs: []};
    const build = step('studio-build.log', ['--prefix', 'studio', 'run', 'build']);
    if (build.code !== 0) throw new Stop([`STOPP: bygget föll (kod ${build.code}); ${target} är orört`, ...tail(build.out, 20)].join('\n'));
    note = 'build-tree-revision';
    if (commitOf(options.tree, 'HEAD', run) !== revision) throw new Stop(`STOPP: byggträdet bytte commit under bygget; ${target} är orört`);
    note = 'build-tree-inputs';
    const after = context(options.tree);
    attempt.dirtyInputs = after.dirtyInputs;
    if (after.revision !== revision || after.dirtyInputs.length || after.fingerprint !== before.fingerprint) {
      throw new Stop(`STOPP: byggträdets filer ändrades under bygget; ${target} är orört`);
    }
    note = 'missing-build-index';
    const built = path.join(options.tree, 'studio', 'out');
    if (!exists(path.join(built, 'index.html'))) throw new Stop(`STOPP: bygget gav ingen ${built}/index.html; ${target} är orört`);
    note = 'swap-output';
    const files = (io.swap ?? swapInto)(built, target, {commit: revision, at: new Date().toISOString(), from: options.tree});
    note = 'verify-output';
    if (!exists(path.join(target, 'index.html')) || (io.installedRevision ?? installedRevision)(target) !== revision) {
      throw new Stop(`STOPP: bygget i ${target} kunde inte verifieras mot ${revision}`);
    }
    status = 'pass';
    note = 'verified-output';
    say(`${target} bytt: ${files} filer från ${revision.slice(0, 7)} (${clock()})`);
    return 0;
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    say(error.message);
    return error.code;
  } finally {
    if (attempt && io.receipt) {
      io.receipt(attempt.root, {
        kind: 'studio-build',
        status,
        startedAt: attempt.startedAt,
        finishedAt: new Date().toISOString(),
        revision: attempt.revision,
        studioRevision: status === 'pass' && attempt.served ? attempt.revision : null,
        inputs: attempt.inputs,
        dirtyInputs: attempt.dirtyInputs,
        counts: {pass: 0, fail: 0, skip: 0, todo: 0, cancelled: 0},
        notes: [note, ...(!attempt.served ? ['trial-output'] : [])],
      });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  let options: Options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.log((error as Error).message); process.exit(1); }
  const logs = path.join(path.dirname(path.resolve(options.tree)), 'studio-logg');
  mkdirSync(logs, {recursive: true});
  const {writeRunReceipt} = await import('./evidence-store.ts');
  let journalFailed = false;
  const code = studioFromCommit(root, options, {
    run: exec,
    say: line => console.log(line),
    log: (name, text) => writeFileSync(path.join(logs, name), text),
    receipt: (checkout, receipt) => {
      try {
        console.log(`Körkvitto sparat i ${writeRunReceipt(checkout, receipt)}`);
      } catch {
        journalFailed = true;
        console.error('STOPP: byggutfallet kunde inte sparas i körjournalen.');
      }
    },
  });
  process.exitCode = code || (journalFailed ? 1 : 0);
}
