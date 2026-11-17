// A clean worktree on the scratch disk, set to a commit: what the push (tools/push-clean.ts) and the studio built from
// the committed state (tools/studio-from-commit.ts) both start from, so that no session's open files in the main checkout
// come with them (DRIFT, "Git och kontroller" and "Labbservern och fliken"). The tree is made once by hand
// (`git worktree add --detach <mapp> main`); these steps never make, remove or commit in it, and stop at the first that fails.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

/** Runs one command in a folder; `out` is stdout and stderr together. */
export type Exec = (cmd: string, args: string[], cwd: string) => {code: number; out: string};
export type Say = (line: string) => void;
/** A stop: the words printed (always beginning STOPP) and the exit code. */
export class Stop extends Error { code: number; constructor(message: string, code = 1) { super(message); this.code = code; } }

// Hooks may export GIT_DIR; a command in another tree must not inherit it (as in tools/publication-check.ts).
const GIT_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'];

/** The real runner: git directly, npm through the shell on Windows (npm.cmd). */
export const exec: Exec = (cmd, args, cwd) => {
  const env = {...process.env};
  for (const key of GIT_ENV) delete env[key];
  const options = {cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024} as const;
  // npm is npm.cmd on Windows and needs the shell; its arguments here are fixed words, given as one line (DEP0190).
  const run = cmd === 'npm' && process.platform === 'win32' ? spawnSync([cmd, ...args].join(' '), {...options, shell: true}) : spawnSync(cmd, args, options);
  return {code: run.status ?? 1, out: `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? String(run.error) : ''}`};
};

export const clock = (at = new Date()) => at.toTimeString().slice(0, 8);
const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** The main checkout (where Jakob's lab server runs) of a repo whose shared git folder is `commonDir`. */
export const mainCheckout = (commonDir: string) => path.dirname(path.resolve(commonDir));

/** The shared git folder of the repo at `cwd`, absolute, or '' outside a repo. */
export function commonDirOf(cwd: string, run: Exec = exec): string {
  const r = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  return r.code === 0 ? r.out.trim() : '';
}

/** The full id of a commit named in the repo at `root` (default main). */
export function commitOf(root: string, name: string, run: Exec = exec): string {
  const r = run('git', ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], root);
  if (r.code !== 0) throw new Stop(`STOPP: ${name} är ingen commit`);
  return r.out.trim();
}

/** Sets `tree` to `sha` detached and checks that it is clean; returns the commit it stood on before. */
export function cleanAt(root: string, tree: string, sha: string, say: Say, run: Exec = exec, exists = existsSync): string {
  if (!exists(tree)) throw new Stop(`STOPP: arbetsträdet saknas (${tree}); gör det med: git worktree add --detach ${tree} main`);
  const mine = commonDirOf(root, run), its = commonDirOf(tree, run);
  if (!its || !same(mine, its)) throw new Stop(`STOPP: ${tree} är inget arbetsträd i det här repot`);
  const top = run('git', ['rev-parse', '--show-toplevel'], tree).out.trim();
  if (same(top, root) || same(top, mainCheckout(mine))) throw new Stop('STOPP: arbetsträdet är huvudträdet eller det här trädet; ange ett eget rent träd');
  const old = run('git', ['rev-parse', 'HEAD'], tree).out.trim();
  say(`från ${old} till ${sha} (${clock()})`);
  if (run('git', ['checkout', '-q', '--detach', sha], tree).code !== 0) throw new Stop('STOPP: checkout');
  const status = run('git', ['status', '--porcelain'], tree).out;
  if (status.trim()) {
    const short = run('git', ['status', '--short'], tree).out.split(/\r?\n/).filter(Boolean).slice(0, 10).join('\n');
    throw new Stop(`STOPP: arbetsträdet är inte rent\n${short}`);
  }
  return old;
}

/** Why `npm ci` is needed in `folder` of the tree (its package files changed between the commits, or it has no
 *  node_modules), or '' when it is not. */
export function needsCi(tree: string, folder: string, old: string, sha: string, run: Exec = exec, exists = existsSync): string {
  const files = ['package.json', 'package-lock.json'].map(name => folder ? `${folder}/${name}` : name);
  if (!exists(path.join(tree, folder, 'node_modules'))) return `${folder ? folder + '/' : ''}node_modules saknas`;
  return run('git', ['diff', '--quiet', old, sha, '--', ...files], tree).code !== 0 ? 'paketlistan har ändrats' : '';
}

/** The last `n` non-empty lines of a log. */
export const tail = (log: string, n: number) => log.split(/\r?\n/).filter(line => line.trim()).slice(-n);
