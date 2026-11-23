// The push from a clean worktree (DRIFT, "Git och kontroller", "Push medan andra skriver"): main's commits are pushed from
// an explicitly selected IDE worktree, so unfinished files in the main checkout cannot turn the publication check
// red, and no one's open file goes out. The steps of the main agent's pusha-fran-rent-trad.sh (2026-11-13 to 11-17), the
// same stops and words: the tree set to the commit and clean, npm ci when the package list changed (or node_modules is
// missing), npm run check (which runs the suite of npm test once), git push origin HEAD:main, then the local and the remote SHA. Each step's log lies in
// push-logg beside the tree. Never a force push, never --no-verify; the pre-push hook scans the outgoing commits and reuses
// the check's green run. The steps up to and including the check are checkClean, which the publication check itself uses
// to test a commit here when the working tree it was started in has open files (tools/publication-check.ts).
//
//   node tools/push-clean.ts [<commit>] [--trad <mapp>] [--dry-run]
//     <commit>   what is pushed (default main)
//     --trad     required: an existing clean worktree of this repository
//     --dry-run  every step except git push; the remote SHA is still read
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Stop, clock, cleanAt, commitOf, exec, needsCi, tail, type Exec, type Say} from './clean-tree.ts';

/** `base`: the commit the outgoing interval starts after, when the caller knows it; else the remote's main is read. */
export type Options = {commit: string; tree: string; dryRun: boolean; base?: string};

export function parseArgs(argv: string[]): Options {
  const options: Options = {commit: 'main', tree: '', dryRun: false};
  const loose: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--trad') { const value = argv[++i]; if (!value) throw new Stop('STOPP: --trad kräver en mapp'); options.tree = value; }
    else if (arg.startsWith('--')) throw new Stop(`STOPP: okänd flagga ${arg} (node tools/push-clean.ts [<commit>] [--trad <mapp>] [--dry-run])`);
    else loose.push(arg);
  }
  if (loose.length > 1) throw new Stop('STOPP: högst en commit');
  if (loose[0]) options.commit = loose[0];
  if (!options.tree) throw new Stop('STOPP: välj ett rent IDE-arbetsträd med --trad <mapp>; ingen disk eller arbetsmapp väljs automatiskt');
  return options;
}

/** The summary lines of node's test runner ("ℹ tests 1023 ℹ pass 1018 …") on one line. */
export const testSummary = (log: string) => log.split(/\r?\n/).filter(line => /^ℹ (tests|pass|fail|cancelled|skipped|todo)\b/.test(line)).join(' ');
/** The failing tests' lines, at most 20. */
export const testFailures = (log: string) => log.split(/\r?\n/).filter(line => /^✖|not ok/.test(line)).slice(0, 20);
/** The publication check's red lines, at most 20. */
export const checkRed = (log: string) => log.split(/\r?\n/).filter(line => /RÖD|✖/.test(line)).slice(0, 20);

export type Io = {run: Exec; say: Say; log: (name: string, text: string) => void; exists?: (p: string) => boolean};

/** The real io: the commands run, the lines go to the console, and each step's log lies in push-logg beside the tree. */
export function fileIo(tree: string): Io {
  const logs = path.join(path.dirname(path.resolve(tree)), 'push-logg');
  mkdirSync(logs, {recursive: true});
  return {run: exec, say: line => console.log(line), log: (name, text) => writeFileSync(path.join(logs, name), text)};
}

function remoteHead(cwd: string, run: Exec): string {
  const result = run('git', ['ls-remote', 'origin', 'refs/heads/main'], cwd);
  const match = /^([a-f0-9]{40,64})\s+refs\/heads\/main\s*$/i.exec(result.out.trim());
  if (result.code !== 0 || !match) throw new Stop('STOPP: fjärrens main kunde inte verifieras');
  return match[1];
}

/** The commit tested in the clean tree: the tree set to it, npm ci where needed, then npm run check there. Returns the
 *  commit's full id and throws the Stop of the first step that fails. Nothing is pushed. */
export function checkClean(root: string, options: Options, io: Io): string {
  const {run, say, log} = io;
  const step = (name: string, cmd: string, args: string[]) => { const r = run(cmd, args, options.tree); log(name, r.out); return r; };
  const sha = commitOf(root, options.commit, run);
  const old = cleanAt(root, options.tree, sha, say, run, io.exists);
  // A detached tree has no upstream. Without an explicit base the gate scans all history on every push.
  // Read the actual destination; the pre-push hook still checks Git's exact outgoing interval independently.
  const base = options.base || remoteHead(root, run);
  const why = needsCi(options.tree, '', old, sha, run, io.exists);
  if (why) {
    say(`${why}: npm ci`);
    const ci = step('npm-ci.log', 'npm', ['ci']);
    if (ci.code !== 0) throw new Stop(['STOPP: npm ci', ...tail(ci.out, 20)].join('\n'));
  }
  // The check runs the whole suite (the files of npm test), once; the pre-push hook then reuses its receipt for the same
  // HEAD instead of running it again (tools/publication-check.ts reusablePass; Jakob 2026-11-21: tests seldom).
  const check = step('npm-check.log', 'npm', ['run', 'check', '--', '--base', base]);
  if (testSummary(check.out)) say(testSummary(check.out));
  for (const line of tail(check.out, 6)) say(line);
  // A failing test's line is in both readers; it is said once.
  if (check.code !== 0) throw new Stop([`STOPP: npm run check (kod ${check.code})`, ...new Set([...testFailures(check.out), ...checkRed(check.out)])].join('\n'));
  return sha;
}

/** The whole routine; returns the exit code. Every stop prints its STOPP line and ends the run. */
export function pushClean(root: string, options: Options, io: Io): number {
  const {run, say, log} = io;
  try {
    const sha = checkClean(root, options, io);
    if (options.dryRun) say('torrkörning: git push origin HEAD:main körs inte');
    else {
      const push = run('git', ['push', 'origin', 'HEAD:main'], options.tree);
      log('push.log', push.out);
      for (const line of tail(push.out, 5)) say(line);
      if (push.code !== 0) throw new Stop(`STOPP: git push (kod ${push.code})`);
    }
    const local = run('git', ['rev-parse', 'HEAD'], options.tree);
    if (local.code !== 0 || local.out.trim() !== sha) throw new Stop('STOPP: arbetsträdets HEAD ändrades under körningen');
    const remote = remoteHead(options.tree, run);
    say(`lokalt: ${sha}`);
    say(`fjärr:  ${remote}`);
    if (!options.dryRun && remote !== sha) throw new Stop('STOPP: fjärrens main motsvarar inte den pushade committen');
    say(`klart ${clock()}`);
    return 0;
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    say(error.message);
    return error.code;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  let options: Options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.log((error as Error).message); process.exit(1); }
  process.exitCode = pushClean(root, options, fileIo(options.tree));
}
