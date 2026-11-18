import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, lstatSync, openSync, readFileSync, readlinkSync, readSync} from 'node:fs';
import path from 'node:path';

// Small, named inputs are included in the receipt. The working-tree fingerprint also covers dirty files.
const metadata = ['package.json', 'studio/package.json', 'data/order-methods.json', 'data/order-policy.json',
  'data/media-roles.json', 'data/rendered-references.json'];
export const committedPlan = 'placements/default.json';
export const fullGitSha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function fileState(file: string, chunk: Buffer): {mode: number; sha256: string | null} | null {
  try {
    const info = lstatSync(file);
    if (info.isSymbolicLink()) return {mode: info.mode, sha256: digest(readlinkSync(file))};
    if (!info.isFile()) return {mode: info.mode, sha256: null};
    const hash = createHash('sha256'), fd = openSync(file, 'r');
    try {
      let count: number;
      while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, count));
    } finally {
      closeSync(fd);
    }
    return {mode: info.mode, sha256: hash.digest('hex')};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function readStudioStamp(root: string): {revision: string | null; note: string | null} {
  const file = path.join(root, 'studio/out/bygge.json');
  try {
    const stat = lstatSync(file);
    if (stat.isFile() && stat.size <= 64 * 1024) {
      const commit: unknown = JSON.parse(readFileSync(file, 'utf8'))?.commit;
      if (typeof commit === 'string' && fullGitSha.test(commit)) return {revision: commit, note: null};
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {revision: null, note: null};
  }
  return {revision: null, note: 'studio-stamp-unreadable'};
}

export function captureRunContext(root: string) {
  const env = {...process.env};
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  const gitBytes = (...args: string[]) => execFileSync('git', args, {cwd: root, env, maxBuffer: 32 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  const git = (...args: string[]) => gitBytes(...args).toString('utf8').trim();
  const names = (...args: string[]) => gitBytes(...args).toString('utf8').split('\0').filter(Boolean);
  const revision = git('rev-parse', 'HEAD');
  const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (path.basename(commonDir) !== '.git') throw Error('Körjournalen kräver en vanlig checkout med gemensam .git-katalog.');
  const storageRoot = path.resolve(path.dirname(commonDir));
  const dirtyInputs = [...new Set([
    ...names('diff', '--name-only', '-z', revision),
    ...names('ls-files', '--others', '--exclude-standard', '-z'),
  ])].sort();

  // This plan deliberately comes from the commit, even if its working copy is edited or removed.
  const chunk = Buffer.allocUnsafe(64 * 1024);
  const changes = new Map(dirtyInputs.filter(file => file !== committedPlan)
    .map(file => [file, fileState(path.join(root, file), chunk)] as const));
  const inputs: {path: string; sha256: string}[] = [];
  for (const file of metadata) {
    const state = changes.has(file) ? changes.get(file) : fileState(path.join(root, file), chunk);
    if (state?.sha256) inputs.push({path: file, sha256: state.sha256});
  }
  if (gitBytes('ls-tree', '-z', revision, '--', committedPlan).length) {
    inputs.push({path: committedPlan, sha256: digest(gitBytes('show', revision + ':' + committedPlan))});
  }
  const studio = readStudioStamp(root);
  const fingerprint = digest(JSON.stringify({revision, changes: [...changes], inputs}));
  return {revision, dirtyInputs, inputs, studioRevision: studio.revision, studioNote: studio.note, fingerprint, storageRoot};
}
