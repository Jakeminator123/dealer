// Jakob's own working files change when he saves in the lab and are not committed with the code: his card plan
// (placements/default.json) and a draft of his in data/orders/. A test that reads them from the disk says one thing in
// the main tree and another in a clean one, which hid two real faults on 2026-11-18. So a test reads them as they are
// committed: the suite then says the same wherever it runs, and what he has saved is judged by the lab, not by the tests.
// Outside a Git checkout (no HEAD) the disk is all there is, and it is read.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 27, stdio: ['ignore', 'pipe', 'ignore'] });

/** The text of a file as HEAD has it (`file` relative to `cwd`, forward slashes). */
export function committedText(file: string, cwd = process.cwd()): string {
  try { return git(['show', `HEAD:./${file}`], cwd); } catch { return readFileSync(`${cwd}/${file}`, 'utf8'); }
}

/** The files of a folder that HEAD holds, as paths relative to `cwd`; an untracked file of his is not among them. */
export function committedFiles(dir: string, cwd = process.cwd()): string[] {
  try {
    const list = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', `./${dir}`], cwd).split('\n').filter(Boolean);
    if (list.length) return list;
  } catch { /* not a checkout */ }
  return readdirSync(`${cwd}/${dir}`).map((name) => `${dir}/${name}`);
}
