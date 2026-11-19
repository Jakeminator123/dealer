// A rebuildable inventory, not another media register. No files are moved or deleted.
import {existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {audit, type Item} from './media-audit.ts';

export type StoredFile = {file: string; bytes: number; identity: string; changed: string};
export function scanStorage(repo: string): StoredFile[] {
  const files: StoredFile[] = [];
  const visit = (relative: string) => {
    if (relative === '.runtime/media-status') return;
    const full = path.join(repo, relative), s = lstatSync(full, {bigint: true});
    if (s.isSymbolicLink()) return;
    if (s.isDirectory()) {
      if (existsSync(path.join(full, '.git'))) return;
      for (const name of readdirSync(full)) {
        if (['node_modules', '.git', '.venv'].includes(name)) continue;
        visit(`${relative}/${name}`);
      }
    } else if (s.isFile()) files.push({file: relative, bytes: Number(s.size), identity: `${s.dev}:${s.ino}`, changed: new Date(Number(s.mtimeMs)).toISOString()});
  };
  for (const root of ['assets', 'output', '.runtime']) if (existsSync(path.join(repo, root))) visit(root);
  return files;
}
export function storageSummary(files: StoredFile[]) {
  const identities = new Set<string>();
  let logicalBytes = 0, uniqueBytes = 0;
  for (const f of files) {
    logicalBytes += f.bytes;
    if (!identities.has(f.identity)) { uniqueBytes += f.bytes; identities.add(f.identity); }
  }
  return {files: files.length, logicalBytes, uniqueBytes};
}
const size = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
/** Assign a shared file to its first path only, so categories add up to the total. */
export function storageCategories(files: StoredFile[]) {
  const seen = new Set<string>(), groups = new Map<string, number>();
  for (const f of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    if (seen.has(f.identity)) continue;
    seen.add(f.identity);
    const group = f.file.startsWith('assets/') ? f.file.split('/').slice(0, 2).join('/') : f.file.split('/')[0];
    groups.set(group, (groups.get(group) ?? 0) + f.bytes);
  }
  return [...groups].map(([category, bytes]) => ({category, bytes})).sort((a, b) => b.bytes - a.bytes);
}
const text = (s: string) => s.replace(/[\r\n|]/g, ' ');
const use = (item: Item) => item.use === 'bara registrerad' || item.use === 'okänd' ? 'Användning behöver granskas' : item.use;
function title(repo: string, item: Item): string {
  try { const proof = JSON.parse(readFileSync(path.join(repo, item.path, 'proof.json'), 'utf8')); if (typeof proof.title === 'string') return proof.title; } catch {}
  return item.what;
}
export function report(repo: string, files: StoredFile[], items: Item[], previous?: {at: string; uniqueBytes: number}) {
  const summary = storageSummary(files), at = new Date().toISOString();
  const lines = ['# Videomaterial och arbetsfiler', '', `Uppdaterad ${at}. Arbetsmapp: ${repo}.`, '',
    `**${size(summary.uniqueBytes)} unika filbytes**; ${size(summary.logicalBytes)} summerat per sökväg, ${summary.files} filer.`,
    'Hårda länkar räknas bara en gång i unika filbytes. Det är inte ett mått på diskens block eller komprimering.',
    'Omfattar assets/, output/ och .runtime/. Källkod, beroenden och andra arbetsträd ingår inte. Inga filmer har öppnats eller ändrats.', ''];
  if (previous) lines.push(`Förändring sedan ${previous.at}: ${summary.uniqueBytes >= previous.uniqueBytes ? '+' : '-'}${size(Math.abs(summary.uniqueBytes - previous.uniqueBytes))}.`, '');
  lines.push('## Vad utrymmet används till', '', '| Kategori | Storlek per sökväg | |', '| --- | ---: | --- |');
  for (const root of ['assets', 'output', '.runtime']) {
    const total = storageSummary(files.filter(f => f.file.startsWith(`${root}/`)));
    lines.push(`| ${root} | ${size(total.logicalBytes)} | ${root === 'assets' ? 'Bibliotek: filmer, bilder, prov, ljud och original' : root === 'output' ? 'Exporter; innehåller också bevarade V6-referenser' : 'Tillfälligt arbete, testkvitton och serverdata'} |`);
  }
  const categories = storageCategories(files);
  lines.push('', '## Fördelning utan dubbelräkning', '',
    'En fil som har flera hårda länkar tilldelas den första sökvägen i alfabetisk ordning. Kategorierna summerar till totalen; de säger inte att filerna är oanvända.', '',
    '| Kategori | Unika filbytes | Andel |', '| --- | ---: | ---: |');
  for (const c of categories) lines.push(`| ${c.category} | ${size(c.bytes)} | ${summary.uniqueBytes ? (100 * c.bytes / summary.uniqueBytes).toFixed(1) : '0'} % |`);
  lines.push('', '## Största materialen', '', '| Material | Storlek | Användning | Mapp |', '| --- | ---: | --- | --- |');
  for (const item of [...items].sort((a, b) => b.bytes - a.bytes).slice(0, 30)) lines.push(`| ${text(title(repo, item))} | ${size(item.bytes)} | ${use(item)} | ${item.path} |`);
  const work = new Map<string, StoredFile[]>();
  for (const f of files.filter(f => f.file.startsWith('.runtime/'))) {
    const bits = f.file.split('/'), folder = bits.length > 2 ? bits.slice(0, 2).join('/') : '.runtime (lösa filer)';
    work.set(folder, [...(work.get(folder) ?? []), f]);
  }
  lines.push('', '## Största tillfälliga mapparna', '', '| Mapp | Storlek | Senast ändrat |', '| --- | ---: | --- |');
  for (const [folder, entries] of [...work].sort((a, b) => storageSummary(b[1]).logicalBytes - storageSummary(a[1]).logicalBytes).slice(0, 20)) lines.push(`| ${folder} | ${size(storageSummary(entries).logicalBytes)} | ${entries.map(f => f.changed).sort().at(-1)!.slice(0, 10)} |`);
  lines.push('', '## Rutin', '',
    '- Arbeta i projektmappen på C:. Använd vanliga kortlivade grenar; ett extra arbetsträd behövs bara vid parallellt eller isolerat arbete.',
    '- Ge tillfälliga uppgifter en tydlig mapp under .runtime/ och en kort README med syfte och vad som ska sparas.',
    '- Behåll ett original och den valda leveransen. Små kontaktark och kvitton beskriver versionerna; skapa inte en ny full kopia per granskning.',
    '- Efter en lyckad 3D-referensrendering rensas mellanrutorna. --keep-frames behåller dem för felsökning.',
    '- Vid avslut: flytta den valda leveransen till assets/ och registrera rollen, radera egna överflödiga mellanresultat och kör npm run media:status.',
    '- ”Användning behöver granskas” är ingen raderingslista. Kontrollera även Prov, anteckningar och pågående uppdrag. Flytt till en annan disk frigör inte totalt utrymme.', '');
  return {at, ...summary, categories, markdown: lines.join('\n')};
}
export function main(repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)))) {
  const folder = path.join(repo, '.runtime', 'media-status');
  let previous: {at: string; uniqueBytes: number} | undefined;
  try { previous = JSON.parse(readFileSync(path.join(folder, 'status.json'), 'utf8')); } catch {}
  const files = scanStorage(repo), {items} = audit(repo), result = report(repo, files, items, previous);
  mkdirSync(folder, {recursive: true});
  writeFileSync(path.join(folder, 'LASMIG.md'), result.markdown);
  const {markdown: _, ...counts} = result;
  writeFileSync(path.join(folder, 'status.json'), JSON.stringify({...counts, items}, null, 2) + '\n');
  console.log(`${size(result.uniqueBytes)} unika filbytes. Översikt: ${path.join(folder, 'LASMIG.md')}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
