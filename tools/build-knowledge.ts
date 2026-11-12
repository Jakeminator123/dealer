// Builds the bot's knowledge: the dealer's documents, the clip bank as it is now (buildGraph), the proofs, the studio's views,
// the last thirty commit subjects and Scoutgaming's named documents (read only), cleaned and split by tools/knowledge.ts.
// tools/build-studio-snapshot.ts calls buildKnowledge with the frozen bank and writes the result beside the bot's function
// only (functions/api/bot.func/bot-knowledge.js), never as a static file. On its own it reads the bank from the repo's files
// as the lab server does, and writes .runtime/bot-knowledge/knowledge.json to look at:
//
//   node tools/build-knowledge.ts                     build, write, print the sizes and what the cleaning removed
//   node tools/build-knowledge.ts --sok "<fråga>"     also show the six sections the search gives a question
//
// Any finding of the last scan (a cost, a blocked name, a path, an id, a token pattern) stops it.
import {readFile, readdir, stat, mkdir, writeFile, realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildGraph, type BankData, type Graph} from '../src/clip-graph.ts';
import {readRelease, type Proof, type Release} from './studio-freeze.ts';
import {DEALER_DOCS, OWN_VIEWS, SCOUT_CORE, SCOUT_DROP, assemble, bankSections, cleanDoc, commitSection, prioFrom, proofSections, scanLeaks, slug, viewSection, type Built, type Doc, type Removed, type ViewText} from './knowledge.ts';
import {Index, type Knowledge} from '../cloud/studio/bot-search.ts';

const here = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Scoutgaming's documents the bot reads, by their real names (and only these: no environment, operations or incidents). */
export const SCOUT_FILES: {kalla: string; file: string}[] = [
  {kalla: 'Scoutgaming › README', file: 'README.md'},
  {kalla: 'Scoutgaming › Dokument', file: 'docs/README.md'},
  {kalla: 'Scoutgaming › Ordlista', file: 'docs/TERMINOLOGI.md'},
  {kalla: 'Scoutgaming › Blackjack', file: 'docs/games/blackjack/README.md'},
  {kalla: 'Scoutgaming › Dealerbank', file: 'docs/games/blackjack/DEALERBANK.md'},
  {kalla: 'Scoutgaming › Signaler', file: 'docs/games/SIGNALER.md'},
  {kalla: 'Scoutgaming › Nästa agent', file: 'docs/NEXT-AGENT.md'},
];
const DEALER_FILES: {kalla: keyof typeof DEALER_DOCS; file: string; optional?: boolean}[] = [
  {kalla: 'HANDOFF', file: 'HANDOFF.md'}, {kalla: 'README', file: 'README.md'}, {kalla: 'SYSTEM', file: 'docs/SYSTEM.md'},
  {kalla: 'DRIFT', file: 'docs/DRIFT.md'}, {kalla: 'CHECKLISTA', file: 'CHECKLISTA.md', optional: true},
];
// Core order: HANDOFF first, then the bank now, the views, Jakob's checklist, the bank's table, the proofs, README, the
// commits, Scoutgaming, SYSTEM. What does not fit in the core's budget is still searched.
const BASE: Record<string, number> = {HANDOFF: 0, CHECKLISTA: 3, README: 6, SYSTEM: 16, DRIFT: 20};

/** Scoutgaming's checkout: beside this project's parent folder, or DEALER_SCOUT_ROOT. */
export const scoutRoot = (root: string) => process.env.DEALER_SCOUT_ROOT || path.resolve(root, '..', '..', 'scoutgaming');

/** The cloud/studio files that make up the bot's function (as <published name>: <source>); bot-knowledge.js is written. */
export const BOT_FUNCTION_FILES: Record<string, string> = Object.fromEntries([
  ['index.js', 'bot-function.ts'], ...['bot', 'bot-node', 'bot-caps', 'bot-models', 'bot-prompt', 'bot-search', 'bot-sse', 'bot-openai', 'bot-provider', 'bot-store', 'onskemal', 'lock'].map(n => [`${n}.js`, `${n}.ts`]),
].map(([name, file]) => [name, `cloud/studio/${file}`]));

export type KnowledgeReport = {
  kallor: {kalla: string; tecken: number}[]; saknas: string[]; vyer: 'guide' | 'egna';
  karna: {avsnitt: number; tokens: number}; rest: {avsnitt: number; tokens: number}; borttaget: Removed; bytes: number;
};

/**
 * The views from studio/lib/guide.ts (the panel builder's: GUIDE, one {namn, adress, text} per view, FRAGA for the panel
 * itself, WORDS for Jakob's short names), or null when it is not there or reads wrong; then the bot's own texts are used.
 */
async function guideViews(root: string): Promise<{views: ViewText[]; words: {ord: string; betyder: string}[]} | null> {
  const file = path.join(root, 'studio', 'lib', 'guide.ts');
  if (!existsSync(file)) return null;
  try {
    const mod = await import(pathToFileURL(file).href) as {GUIDE?: unknown; FRAGA?: unknown; WORDS?: unknown};
    const asView = (v: any): ViewText | null => typeof v?.namn === 'string' && typeof v?.text === 'string' && v.text.length > 10 ? {namn: v.namn, adress: typeof v.adress === 'string' ? v.adress : '', text: v.text} : null;
    const views = [...(Array.isArray(mod.GUIDE) ? mod.GUIDE : []), mod.FRAGA].map(asView).filter((v): v is ViewText => !!v);
    const words = (Array.isArray(mod.WORDS) ? mod.WORDS : []).filter((w: any) => typeof w?.ord === 'string' && typeof w?.betyder === 'string') as {ord: string; betyder: string}[];
    if (views.length >= 3) return {views, words};
    console.warn('studio/lib/guide.ts har inga vyer i väntad form; botens egna vytexter används.');
  } catch (error) {
    console.warn(`studio/lib/guide.ts gick inte att läsa (${(error as Error).message}); botens egna vytexter används.`);
  }
  return null;
}

const addRemoved = (into: Removed, from: Removed) => { for (const [k, n] of Object.entries(from)) into[k as keyof Removed] = (into[k as keyof Removed] ?? 0) + (n ?? 0); };

/** The knowledge from the graph and proofs it is handed (the snapshot's frozen ones, or the repo's own on the command line). */
export async function buildKnowledge(input: {root: string; release: Release; graph: Graph; proofs: readonly Proof[]; onSite: ReadonlySet<string>; byggd?: string}): Promise<{knowledge: Knowledge; report: KnowledgeReport}> {
  const {root, release} = input, removed: Removed = {}, sections: Built[] = [], kallor: KnowledgeReport['kallor'] = [], saknas: string[] = [];
  const add = (doc: Doc) => { const r = cleanDoc(doc, release); addRemoved(removed, r.removed); sections.push(...r.sections); kallor.push({kalla: doc.kalla, tecken: doc.text.length}); };

  for (const d of DEALER_FILES) {
    const file = path.join(root, d.file);
    if (!existsSync(file)) { if (d.optional) { saknas.push(d.file); continue; } throw Error(`Källan saknas: ${d.file}`); }
    const rules = DEALER_DOCS[d.kalla];
    add({kalla: d.kalla, id: d.kalla.toLowerCase(), text: await readFile(file, 'utf8'), scout: false, dropHeadings: rules.drop ?? undefined, prio: prioFrom(rules.core, BASE[d.kalla])});
  }

  const bank = bankSections(input.graph, release, removed);
  sections.push(...bank);
  const guide = await guideViews(root);
  sections.push(viewSection(guide?.views ?? OWN_VIEWS, guide?.words ?? [], release, removed));
  sections.push(...proofSections(input.proofs, input.onSite, release, removed));
  const subjects = execFileSync('git', ['log', '-30', '--format=%s'], {cwd: root, encoding: 'utf8'}).split('\n').map(s => s.trim()).filter(Boolean);
  sections.push(commitSection(subjects, release, removed));
  kallor.push({kalla: 'Banken (buildGraph)', tecken: bank.reduce((n, s) => n + s.text.length, 0)}, {kalla: 'Prov', tecken: 0}, {kalla: 'Studions vyer', tecken: 0}, {kalla: 'Git', tecken: subjects.join('\n').length});

  const scout = scoutRoot(root);
  if (!existsSync(path.join(scout, 'docs'))) throw Error(`Scoutgaming finns inte på ${scout}: sätt DEALER_SCOUT_ROOT.`);
  for (const [i, s] of SCOUT_FILES.entries()) {
    const file = path.join(scout, ...s.file.split('/'));
    if (!existsSync(file)) { saknas.push(`scoutgaming/${s.file}`); continue; }
    add({kalla: s.kalla, id: `scout-${slug(s.kalla.split('›').at(-1)!)}`, text: await readFile(file, 'utf8'), scout: true,
      dropHeadings: SCOUT_DROP, dropIntro: s.file === 'docs/NEXT-AGENT.md', prio: prioFrom(SCOUT_CORE[s.kalla] ?? [], 8 + i)});
  }

  const assembled = assemble(sections, kallor.filter(k => k.tecken > 0 || /Prov|vyer/.test(k.kalla)).map(k => k.kalla), input.byggd ?? new Date().toISOString());
  const {karnaTokens, avsnittTokens, ...knowledge} = assembled;
  const leaks = scanLeaks(knowledge, release);
  if (leaks.length) throw Error(`Kunskapen får inte gå upp: ${leaks.slice(0, 8).join(' | ')}`);
  const bytes = Buffer.byteLength(JSON.stringify(knowledge));
  return {knowledge, report: {kallor, saknas, vyer: guide ? 'guide' : 'egna', karna: {avsnitt: knowledge.karna.length, tokens: karnaTokens}, rest: {avsnitt: knowledge.avsnitt.length, tokens: avsnittTokens}, borttaget: removed, bytes}};
}

// ── The bank and the proofs from the repo's files, as the lab server reads them (tools/preview.ts clipBank, proofs) ──
const CLIP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const readJson = async (file: string) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } };
const exists = async (file: string) => !!(await stat(file).catch(() => null))?.isFile();

export async function localBank(root: string): Promise<BankData> {
  const at = (rel: string) => path.join(root, rel);
  const file = await readJson(at('data/clip-jobs.json')), named = (list: unknown) => (Array.isArray(list) ? list : []).filter((x: any) => typeof x?.id === 'string' && CLIP.test(x.id));
  const jobs = named(file?.jobs), edits = named(file?.edits).filter((e: any) => typeof e.source?.clip === 'string'), derived = named(file?.derived).filter((d: any) => typeof d.clip === 'string' && CLIP.test(d.clip));
  const motions: Record<string, unknown> = {}, receipts: Record<string, unknown> = {}, media: Record<string, unknown> = {};
  const tracking = async (id: string) => ({track: await exists(at(`assets/tracking/${id}/card-track.json`)) ? `assets/tracking/${id}/card-track.json` : null, overrides: await exists(at(`assets/tracking/${id}/overrides.json`)) ? `assets/tracking/${id}/overrides.json` : null});
  for (const take of derived as any[]) {
    const own = await readJson(at(`motions/${take.id}.json`)), clip = await readJson(at(`motions/${take.clip}.json`));
    motions[take.id] = {source: clip?.source, motion: own?.motion, review: own?.review};
    media[take.id] = {video: await exists(at(`assets/motions/${take.clip}/source.mp4`)) ? `assets/motions/${take.clip}/source.mp4` : null, first: null, last: null, ...await tracking(take.clip)};
  }
  for (const job of [...jobs, ...edits] as any[]) {
    const motion = await readJson(at(`motions/${job.id}.json`)), receipt = await readJson(at(`assets/motions/${job.id}/generation.json`));
    if (motion) motions[job.id] = {source: motion.source, motion: motion.motion, review: motion.review};
    if (receipt) receipts[job.id] = {status: receipt.status, output: receipt.output ? {fps: receipt.output.fps, frames: receipt.output.frames, width: receipt.output.width, height: receipt.output.height} : null};
    const present = async (name: string) => await exists(at(`assets/motions/${job.id}/${name}`)) ? `assets/motions/${job.id}/${name}` : null;
    media[job.id] = {video: await present('source.mp4'), reversed: await present('source-reversed.mp4'), first: await present('first.png'), last: await present('last.png'), ...await tracking(job.id)};
  }
  return {jobs, derived, edits, motions, receipts, media} as BankData;
}

export async function localProofs(root: string): Promise<Proof[]> {
  const list: Proof[] = [], base = path.join(root, 'assets', 'proofs');
  for (const dir of await readdir(base, {withFileTypes: true}).catch(() => [])) {
    if (!dir.isDirectory() || !CLIP.test(dir.name)) continue;
    const info = await readJson(path.join(base, dir.name, 'proof.json')), files: Proof['files'] = [];
    for (const entry of await readdir(path.join(base, dir.name), {withFileTypes: true}).catch(() => [])) {
      if (entry.isFile() && /\.(?:mp4|png)$/.test(entry.name)) files.push({name: entry.name, path: `assets/proofs/${dir.name}/${entry.name}`, kind: entry.name.endsWith('.mp4') ? 'video' : 'image', bytes: (await stat(path.join(base, dir.name, entry.name))).size});
    }
    list.push({id: dir.name, title: typeof info?.title === 'string' ? info.title : null, description: typeof info?.description === 'string' ? info.description : null,
      labels: info?.labels && typeof info.labels === 'object' ? info.labels : null, verdicts: info?.verdicts && typeof info.verdicts === 'object' ? info.verdicts : null, updatedAt: null, chapters: null, fps: 30, files});
  }
  return list;
}

// ── On its own ──────────────────────────────────────────────────────────────
async function main() {
  const root = here;
  if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw Error('Kör från dealer-katalogen.');
  const release = readRelease(JSON.parse(await readFile(path.join(root, 'data/studio-release.json'), 'utf8')));
  const graph = buildGraph(await localBank(root)), proofs = await localProofs(root);
  const onSite = new Set(release.proofs.map(p => p.id).filter(id => proofs.some(p => p.id === id)));
  const {knowledge, report} = await buildKnowledge({root, release, graph, proofs, onSite});
  const out = path.join(root, '.runtime', 'bot-knowledge');
  await mkdir(out, {recursive: true});
  if (await realpath(out) !== path.join(await realpath(root), '.runtime', 'bot-knowledge')) throw Error('Länkad utmapp.');
  await writeFile(path.join(out, 'knowledge.json'), JSON.stringify(knowledge, null, 1));
  console.log(`Kunskapen: ${knowledge.karna.length + knowledge.avsnitt.length} avsnitt, ${(report.bytes / 1000).toFixed(0)} kB.`);
  console.log(`  kärnan: ${report.karna.avsnitt} avsnitt, cirka ${report.karna.tokens} token (skattat, 3,5 tecken per token)`);
  console.log(`  sökbart: ${report.rest.avsnitt} avsnitt, cirka ${report.rest.tokens} token`);
  console.log(`  vyerna: ${report.vyer === 'guide' ? 'studio/lib/guide.ts' : 'botens egna texter (guide.ts finns inte)'}`);
  console.log(`  källor: ${report.kallor.map(k => `${k.kalla} ${k.tecken}`).join(', ')}`);
  if (report.saknas.length) console.log(`  saknas: ${report.saknas.join(', ')}`);
  console.log(`  borttaget: ${Object.entries(report.borttaget).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  const at = process.argv.indexOf('--sok');
  if (at >= 0) {
    const query = process.argv.slice(at + 1).join(' ');
    console.log(`\nSökning: ${query}`);
    for (const hit of new Index(knowledge.avsnitt).search(query, 6)) console.log(`  ${hit.score.toFixed(2).padStart(6)}  ${hit.section.titel}`);
  }
  console.log(`\n${path.join(out, 'knowledge.json')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
