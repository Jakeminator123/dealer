// The push from a clean worktree (DRIFT, "Git och kontroller", "Push medan andra skriver"): main's commits are pushed from
// an explicitly selected IDE worktree, so unfinished files in the main checkout cannot turn the publication check
// red, and no one's open file goes out. The steps of the main agent's pusha-fran-rent-trad.sh (2026-11-13 to 11-17), the
// same stops and words: the tree set to the commit and clean, npm ci when the package list changed (or node_modules is
// missing), npm test, npm run check, git push origin HEAD:main, then the local and the remote SHA. Each step's log lies in
// push-logg beside the tree. Never a force push, never --no-verify; the pre-push hook runs the check once more.
//
//   node tools/push-clean.ts [<commit>] [--trad <mapp>] [--dry-run]
//     <commit>   what is pushed (default main)
//     --trad     required: an existing clean worktree of this repository
//     --dry-run  every step except git push; the remote SHA is still read
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Stop, clock, cleanAt, commitOf, exec, needsCi, tail, type Exec, type Say} from './clean-tree.ts';

export type Options = {commit: string; tree: string; dryRun: boolean};

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

/** The whole routine; returns the exit code. Every stop prints its STOPP line and ends the run. */
export function pushClean(root: string, options: Options, io: Io): number {
  const {run, say, log} = io;
  const step = (name: string, cmd: string, args: string[]) => { const r = run(cmd, args, options.tree); log(name, r.out); return r; };
  const remoteHead = (cwd: string) => {
    const result = run('git', ['ls-remote', 'origin', 'refs/heads/main'], cwd);
    const match = /^([a-f0-9]{40,64})\s+refs\/heads\/main\s*$/i.exec(result.out.trim());
    if (result.code !== 0 || !match) throw new Stop('STOPP: fjärrens main kunde inte verifieras');
    return match[1];
  };
  try {
    const sha = commitOf(root, options.commit, run);
    const old = cleanAt(root, options.tree, sha, say, run, io.exists);
    // A detached tree has no upstream. Without an explicit base the gate scans all history on every push.
    // Read the actual destination; the pre-push hook still checks Git's exact outgoing interval independently.
    const base = remoteHead(root);
    const why = needsCi(options.tree, '', old, sha, run, io.exists);
    if (why) {
      say(`${why}: npm ci`);
      const ci = step('npm-ci.log', 'npm', ['ci']);
      if (ci.code !== 0) throw new Stop(['STOPP: npm ci', ...tail(ci.out, 20)].join('\n'));
    }
    const test = step('npm-test.log', 'npm', ['test']);
    say(testSummary(test.out));
    if (test.code !== 0) throw new Stop([`STOPP: npm test (kod ${test.code})`, ...testFailures(test.out)].join('\n'));
    const check = step('npm-check.log', 'npm', ['run', 'check', '--', '--base', base]);
    for (const line of tail(check.out, 6)) say(line);
    if (check.code !== 0) throw new Stop([`STOPP: npm run check (kod ${check.code})`, ...checkRed(check.out)].join('\n'));
    if (options.dryRun) say('torrkörning: git push origin HEAD:main körs inte');
    else {
      const push = step('push.log', 'git', ['push', 'origin', 'HEAD:main']);
      for (const line of tail(push.out, 5)) say(line);
      if (push.code !== 0) throw new Stop(`STOPP: git push (kod ${push.code})`);
    }
    const local = run('git', ['rev-parse', 'HEAD'], options.tree);
    if (local.code !== 0 || local.out.trim() !== sha) throw new Stop('STOPP: arbetsträdets HEAD ändrades under körningen');
    const remote = remoteHead(options.tree);
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
  const logs = path.join(path.dirname(path.resolve(options.tree)), 'push-logg');
  mkdirSync(logs, {recursive: true});
  process.exitCode = pushClean(root, options, {run: exec, say: line => console.log(line), log: (name, text) => writeFileSync(path.join(logs, name), text)});
}
