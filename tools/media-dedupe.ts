// Delete only old scratch copies that have an identical canonical file in this repo's assets/.
// Planning is read-only. Applying rechecks paths, age, references, processes and both hashes.
import {createReadStream, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {namedIn, related, runningCommands} from './scratch-clean.ts';

const MEDIA = /\.(mp4|mov|webm|mkv|wav|mp3|m4a|png|jpe?g|webp)$/i;
const DAYS = 3 * 86400_000;
export type Copy = {remove: string; keep: string; bytes: number; sha256: string};
export function within(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return !!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export function checkedPath(root: string, file: string): string {
  if (!within(root, file)) throw new Error(`Utanför vald rot: ${file}`);
  for (let p = path.resolve(file); ; p = path.dirname(p)) {
    if (lstatSync(p).isSymbolicLink()) throw new Error(`Länk vägras: ${p}`);
    if (p === path.parse(p).root) break;
  }
  if (!within(realpathSync(root), realpathSync(file))) throw new Error(`Omdirigerad sökväg: ${file}`);
  return file;
}
export async function hash(file: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
function files(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (existsSync(path.join(dir, '.git'))) return; // Never touch an entire checkout, registered or otherwise.
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (entry.isSymbolicLink() || ['node_modules', '.git', '.venv', 'venv'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && MEDIA.test(entry.name)) found.push(full);
    }
  };
  walk(root); return found;
}
export async function removeCopy(source: string, assets: string, copy: Copy, blocked: (file: string) => boolean, now = Date.now()): Promise<void> {
  checkedPath(source, copy.remove); checkedPath(assets, copy.keep);
  const stat = lstatSync(copy.remove);
  if (!MEDIA.test(copy.remove) || !stat.isFile() || stat.size !== copy.bytes || now - stat.mtimeMs < DAYS || blocked(copy.remove)) throw new Error(`Ändrad eller skyddad fil: ${copy.remove}`);
  if (await hash(copy.remove) !== copy.sha256 || await hash(copy.keep) !== copy.sha256) throw new Error(`Innehållet har ändrats: ${copy.remove}`);
  unlinkSync(copy.remove);
}
function protection(repo: string, source: string): (file: string) => boolean {
  const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).split('\0');
  const texts = [...new Set(tracked)].filter(f => /\.(md|json|ts|tsx|mjs|cmd|ps1)$/i.test(f) && existsSync(path.join(repo, f))).map(f => readFileSync(path.join(repo, f), 'utf8'));
  // Fails closed if Windows process inventory cannot be read.
  const processes = runningCommands();
  if (!processes.length) throw new Error('Processlistan kunde inte verifieras');
  texts.push(...processes.map(p => p.cmd));
  const patterns = texts.flatMap(t => namedIn(t, source, new Set())).filter(a => a.segs.length >= 2).map(a => a.segs.map(s => new RegExp('^' + s.split('*').map(v => v.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')));
  return file => patterns.some(p => related(path.relative(source, file).split(path.sep).join('/'), p));
}
export async function main(argv: string[]): Promise<void> {
  const sourceArg = argv.indexOf('--source'), apply = argv.includes('--apply');
  if (sourceArg < 0 || !argv[sourceArg + 1] || argv.some((a, i) => i !== sourceArg + 1 && !['--source', '--apply'].includes(a))) throw new Error('Använd: node tools/media-dedupe.ts --source <absolut slaskmapp> [--apply]');
  if (!path.isAbsolute(argv[sourceArg + 1])) throw new Error('--source måste vara absolut');
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
  const source = path.resolve(argv[sourceArg + 1]), assets = path.join(repo, 'assets');
  const same = (a: string, b: string) => path.relative(a, b) === '';
  if (same(source, path.parse(source).root) || same(source, repo) || within(source, repo) || same(source, assets) || within(assets, source) || same(source, path.join(repo, 'output')) || within(path.join(repo, 'output'), source)) throw new Error('Projekt, assets, output eller överordnad rot får inte städas');
  if (within(repo, source) && !within(path.join(repo, '.runtime'), source) && !same(source, path.join(repo, '.runtime'))) throw new Error('Inuti projektet får bara .runtime städas');
  checkedPath(path.dirname(source), source);
  const blocked = protection(repo, source);
  const bySize = new Map<number, string[]>();
  for (const file of files(assets)) { const size = lstatSync(file).size; bySize.set(size, [...(bySize.get(size) ?? []), file]); }
  const cache = new Map<string, string>();
  const digest = async (f: string) => { if (!cache.has(f)) cache.set(f, await hash(f)); return cache.get(f)!; };
  const copies: Copy[] = [];
  for (const file of files(source)) {
    const stat = lstatSync(file);
    if (Date.now() - stat.mtimeMs < DAYS || blocked(file) || !bySize.has(stat.size)) continue;
    checkedPath(source, file);
    const sha256 = await digest(file);
    for (const keep of bySize.get(stat.size)!) {
      checkedPath(assets, keep);
      if (await digest(keep) === sha256) { copies.push({remove: file, keep, bytes: stat.size, sha256}); break; }
    }
  }
  const folder = path.join(repo, '.runtime', 'cleanup'); mkdirSync(folder, {recursive: true});
  const receipt = path.join(folder, `${new Date().toISOString().replace(/[:.]/g, '-')}-${apply ? 'apply' : 'plan'}.json`);
  const result = {source, apply, copies, removed: [] as string[], error: null as string | null};
  const save = () => writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n');
  save();
  try {
    if (apply) {
      const rechecked = protection(repo, source);
      for (const copy of copies) { await removeCopy(source, assets, copy, rechecked); result.removed.push(copy.remove); save(); }
    }
  } catch (error) { result.error = String(error); throw error; }
  finally { save(); }
  console.log(JSON.stringify({receipt, candidates: copies.length, removed: result.removed.length, bytes: copies.reduce((sum, c) => sum + c.bytes, 0)}));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => {console.error(String(e)); process.exitCode = 1;});
