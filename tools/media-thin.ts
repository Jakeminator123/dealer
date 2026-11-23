// Keeps assets/ light (Jakob 2026-11-21: "kan du inte bara fixa upp något bra ang detta?"): a plan of what can go, in three levels,
// and the execution of one level or group only when asked. Built on tools/dealer-tree.ts (every film against the trees, its verdict
// and whether the game holds it) and tools/media-audit.ts (what every folder is used for).
//   node tools/media-thin.ts                        the report only: .runtime/gallring/LASMIG.md and plan.json (every file, why,
//                                                   bytes and number of hard links)
//   node tools/media-thin.ts --kor                  carries out the safe level (säkert) of plan.json
//   node tools/media-thin.ts --kor --grupp <namn>   carries out one named group of the proposals (only on Jakob's word)
//   node tools/media-thin.ts --tom-korgen           deletes the trash days older than 14 days
// Levels:
//   säkert   what one rule decides alone: the films of a take with Jakob's OWN verdict Inte bra (never one given for him), that the
//            game does not hold, that nothing else points to and that is older than three days (the film's posts leave the
//            register with it, tools/register-store.ts: his verdict stays as one row in data/motions-removed.jsonl, and the
//            folder gets RADERAD.txt); what can provably be made again from a kept file by a command (none today: see the report);
//            byte-identical files under assets/ made one file with hard links (talets filer, V6, originals and references never share).
//   förslag  never without his word: verdicts Inte bra that are not his own; loose films (half or not linked to a tree) not judged
//            good; order deliveries that never became a record; proofs without an open card and without a note of his in 14 days;
//            older talk films and mouth patches where a newer one is played; the
//            raw deliveries of takes removed above; after-work copies that a recorded command can make again once proven.
//   blob     prepared, nothing done: the files of the release's list (.runtime/ny-blob/filer.json) that could live only on Blob.
// The guard (blocked) is a hard stop, checked when the plan is made and again for every file just before it is touched: Primär,
// Godkänd and Variant (his or given for him); everything the game holds (gameTakes, usesOf); everything with a role in
// data/media-roles.json that is not a rejected take; V6, originals and references (data/manifest.json,
// evidence/); assets/noir/ and every file sharing a file with it; assets/films/intro/; the scene the game uses; anything an entry in
// Beslut or an order still under way names; files younger than three days; anything outside assets/ (private/ among it). A file that
// shares its bytes (a hard link) with a guarded file is guarded too.
// Moving: copied to D:/dealer-scratch/papperskorg/<date>/<path>, both SHA-256 compared, only then removed; a hard link is made under
// a temporary name and renamed over the copy after both SHA-256 agree. Every step goes into a receipt in .runtime/cleanup/ as it
// happens. Bytes are honest: a file with several hard links frees its bytes only when its last name goes.
import {copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync, constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkedPath, hash} from './media-dedupe.ts';
import {MOTIONS_TEXT, filmFiles, motionRegister, type Removal} from './register-store.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DAY = 86_400_000, MIN_AGE_DAYS = 3, NOTE_DAYS = 14, TRASH_DAYS = 14, PLAN_HOURS = 24;
export const TRASH = 'D:/dealer-scratch/papperskorg';
export const MARKER = 'RADERAD.txt';
const VIDEO = /\.(mp4|mov|webm|mkv)$/i, MEDIA = /\.(mp4|mov|webm|mkv|wav|mp3|m4a|png|jpe?g|webp|glb|tar)$/i;
const MIN_DUPLICATE = 64 * 1024;

// ── The guard ───────────────────────────────────────────────────────────────
export type Fact = {path: string; mtimeMs: number; key: string};
/** files and dirs: guarded paths with why; keys: guarded files on the disk (dev:ino), so every name of one is guarded. */
export type Shield = {now: number; files: Map<string, string>; dirs: Map<string, string>; keys: Map<string, string>};
/** Never touched, whatever a register says; kept in the code so that no shield can leave them out. */
export const HARD: [string, string][] = [
  ['assets/noir', 'bevarad samling (Jakob 2026-11-21: alla noir-filmer i en mapp)'],
  ['assets/films/intro', 'filmen före spelet'],
  ['assets/v6', 'V6, Jakobs visuella referens'],
  ['assets/reference', 'referens (data/manifest.json)'],
  ['assets/originals', 'original (data/manifest.json)'],
];
export const emptyShield = (now = Date.now()): Shield => ({now, files: new Map(), dirs: new Map(HARD), keys: new Map()});
const clean = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
/** Why a path is guarded by where it lies (not by age or by sharing a file), or null. */
export function pathGuard(p: string, s: Shield): string | null {
  const q = clean(p);
  if (!q.startsWith('assets/') || q.split('/').some(x => x === '..' || x === '.' || x === '')) return 'utanför assets/ (private/ och allt annat rörs aldrig)';
  for (const [d, why] of HARD) if (q === d || q.startsWith(`${d}/`)) return why;
  const own = s.files.get(q); if (own) return own;
  const parts = q.split('/');
  for (let i = parts.length; i >= 2; i--) { const why = s.dirs.get(parts.slice(0, i).join('/')); if (why) return why; }
  return null;
}
/** The hard stop: the reason a file may not be touched, or null. */
export function blocked(f: Fact, s: Shield): string | null {
  const where = pathGuard(f.path, s); if (where) return where;
  if (!(s.now - f.mtimeMs >= MIN_AGE_DAYS * DAY)) return 'yngre än tre dygn: aktivt arbete';
  const twin = s.keys.get(f.key); if (twin) return `samma fil som ${twin}`;
  return null;
}
/** Guards a file, or a folder no wider than one thing (unitOf: tools/media-audit.ts); a register that names a whole top folder
 *  ("assets/motions/") does not guard everything under it. */
export function protect(s: Shield, p: string, why: string, unitOf: (file: string) => string | null): void {
  const q = clean(p); if (!q.startsWith('assets/')) return;
  const file = /\.[A-Za-z0-9]{2,5}$/.test(q.split('/').at(-1)!);
  if (!file && (unitOf(`${q}/_/_/_/_/_`)?.length ?? 0) > q.length) return;
  const target = file ? s.files : s.dirs;
  if (!target.has(q)) target.set(q, why);
}

/** Every name of a guarded file is guarded: the file on the disk (dev:ino) of each guarded path goes into keys. */
export function guardKeys(s: Shield, files: Iterable<{path: string; key: string}>): void {
  for (const f of files) if (!s.keys.has(f.key)) { const why = pathGuard(f.path, s); if (why) s.keys.set(f.key, `${f.path} (${why})`); }
}

// ── Bytes, honestly ─────────────────────────────────────────────────────────
export type FileRow = {path: string; bytes: number; links: number; key: string; mtimeMs: number};
export type Action = FileRow & {action: 'flytta' | 'länka'; to?: string; sha256?: string};
/** The bytes a set of removed names frees: a file on the disk only when every one of its names is in the set. */
export function freedBytes(files: {key: string; bytes: number; links: number}[]): number {
  const by = new Map<string, {n: number; links: number; bytes: number}>();
  for (const f of files) { const e = by.get(f.key) ?? {n: 0, links: f.links, bytes: f.bytes}; e.n++; by.set(f.key, e); }
  let freed = 0; for (const e of by.values()) if (e.n >= e.links) freed += e.bytes;
  return freed;
}
/** A file's size, links, identity on the disk (dev:ino) and time. */
export function factOf(abs: string, rel: string): FileRow {
  const st = statSync(abs, {bigint: true});
  return {path: rel, bytes: Number(st.size), links: Number(st.nlink), key: `${st.dev}:${st.ino}`, mtimeMs: Number(st.mtimeMs)};
}
function walk(repo: string, rel: string, out: Map<string, FileRow>): Map<string, FileRow> {
  let list; try { list = readdirSync(path.join(repo, rel), {withFileTypes: true}); } catch { return out; }
  for (const e of list) {
    const r = `${rel}/${e.name}`;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(repo, r, out); else if (e.isFile()) out.set(r, factOf(path.join(repo, r), r));
  }
  return out;
}

// ── The plan ────────────────────────────────────────────────────────────────
export type Level = 'säkert' | 'förslag' | 'blob';
export type Unit = {id: string; reason: string; files: Action[]; marker: string | null; removeEmpty?: string; command?: string};
export type GroupPlan = {name: string; level: Level; title: string; rule: string; units: Unit[]; count: number; mb: number; mbFreed: number; examples: string[]};
export type Plan = {schemaVersion: 1; about: string; made: string; trash: string; groups: GroupPlan[];
  skipped: {group: string; reason: string; count: number; mb: number; examples: string[]}[];
  assets: {mb: number; files: number; byTop: Record<string, number>}; blob: {listed: number; local: number; mb: number; byGroup: Record<string, number>; missing: number; changed: number; young: number; source: string | null};
  notes: string[]};
const mb = (bytes: number) => Math.round(bytes / 1e5) / 10;
const GROUPS: {name: string; level: Level; title: string; rule: string}[] = [
  {name: 'inte-bra-hans', level: 'säkert', title: 'Hans eget Inte bra', rule: 'Filmen till en tagning som Jakob själv dömt Inte bra (inte sekundär, inte given åt honom), som spelet inte har, som ingen annan post eller register pekar på och som är äldre än tre dygn; samma fil i dess egen beställningsmapp går med. Filmens poster lämnar registret med filmen (hans dom står kvar som en rad i data/motions-removed.jsonl) och mappen får RADERAD.txt.'},
  {name: 'aterskapbart', level: 'säkert', title: 'Går att göra igen ur en bevarad fil', rule: 'Det ett register visar är gjort ur en bevarad fil med ett kommando, och där en körning har visat samma SHA-256.'},
  {name: 'dubbletter', level: 'säkert', title: 'Byteidentiska filer blir en fil', rule: 'Filer under assets/ med samma SHA-256 som inte redan delar fil görs till hårda länkar; båda namnen finns kvar. Talets filer, V6, original, referenser och noir-samlingen delar aldrig fil.'},
  {name: 'inte-bra-inte-hans', level: 'förslag', title: 'Inte bra, men inte hans dom', rule: 'Som hans eget Inte bra, men domen är given åt honom, en granskares, eller sekundär.'},
  {name: 'tal-aldre', level: 'förslag', title: 'Äldre talfilmer och munlappar', rule: 'En talfilm med ett lägre nummer än den som spelet har för samma replik, och munlappar som är ersatta eller som registret inte längre nämner. Talets mapp går helt (så att numret inte tas upp igen), bankens film får RADERAD.txt.'},
  {name: 'lost', level: 'förslag', title: 'Löst, inte dömt bra', rule: 'Halv- eller okopplade filmer (tools/dealer-tree.ts) som inte är dömda bra och som spelet inte har.'},
  {name: 'original-forkastade', level: 'förslag', title: 'Råleveranser till borttagna tagningar', rule: 'Runways egen leverans (source.mp4) i beställningsmappen till en tagning vars film går i en av grupperna ovan.'},
  {name: 'bestallningar-utan-post', level: 'förslag', title: 'Leveranser som aldrig blev en post', rule: 'En beställd tagning som stannade före INFÖRD och som ingen post i registret har; bilderna och filmerna går, kvittona står kvar.'},
  {name: 'prov-utan-kort', level: 'förslag', title: 'Prov utan kort', rule: 'Prov i assets/proofs/ utan kort i Beslut, utan anteckning från honom de senaste 14 dygnen och som inget dokument eller utgåvan nämner.'},
  {name: 'efterarbete-kopior', level: 'förslag', title: 'Efterarbetets kopior', rule: 'after.mp4 vars after.json säger hur den gjordes ur leveransen; går att göra igen med kommandot, men ingen körning har ännu visat samma SHA-256.'},
];
const TALK = /^(.+-tal-[a-z0-9]+-[a-z]{2}-)(\d+)$/;
const DOCS = /^(HANDOFF\.md|README\.md|AGENTS\.md|docs\/|tools\/[^/]+\.md|\.claude\/skills\/|dealer3d\/LASMIG\.md|data\/decisions\.json|data\/studio-release\.json|placements\/)/;

type Rec = {id?: string; dealer?: string; order?: {id?: string; take?: number}; review?: unknown; speech?: {line?: string}};
type RowLike = {id: string; dealer: string; kind: string; group: string; verdict: string; good: boolean; variant: boolean; inGame?: boolean; plays: boolean;
  judge?: {verdict: string; byJakob: boolean; provisional: boolean; detail?: string | null} | null};

export async function makePlan(repo = ROOT, now = Date.now()): Promise<{plan: Plan; shield: Shield}> {
  if (path.resolve(repo) !== ROOT) throw new Error('Planen görs bara för den här utcheckningen (dealer-tree läser sin egen).');
  const {buildReport} = await import('./dealer-tree.ts');
  const {audit, unitOf, pathsIn, idsNamed} = await import('./media-audit.ts');
  const read = (f: string) => { try { return readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } };
  const json = <T>(f: string): T | null => { try { return JSON.parse(read(f)) as T; } catch { return null; } };
  const files = walk(repo, 'assets', new Map());
  const names = new Map<string, string[]>(); for (const f of files.values()) names.set(f.key, [...(names.get(f.key) ?? []), f.path]);
  const report = await buildReport(), rows = report.rows as RowLike[];
  const {items} = audit(repo);
  const records = motionRegister(repo).posts() as Map<string, Rec>, postOf = (id: string) => `${MOTIONS_TEXT}#${id}`; // the register's posts, and how one is named as a pointer
  const jobs = json<{jobs?: {id: string}[]; derived?: {id: string; clip?: string}[]; edits?: {id: string}[]}>('data/clip-jobs.json') ?? {};
  const clipOf = new Map((jobs.derived ?? []).filter(d => d.clip).map(d => [d.id, d.clip!]));
  const folderOf = (id: string) => clipOf.get(id) ?? id;
  const dealersDirs = readdirSync(path.join(repo, 'assets/speech')).filter(d => !d.includes('.'));
  const goodRow = (r: RowLike) => r.good || r.variant || ['primar', 'godkand', 'variant'].includes(r.judge?.verdict ?? '');
  const heldRow = (r: RowLike) => !!r.inGame || r.plays;
  const unitIds = new Map<string, string[]>(); for (const i of items) { const id = i.path.split('/').at(-1)!; unitIds.set(id, [...(unitIds.get(id) ?? []), i.path]); }

  // ── The shield ──
  const shield = emptyShield(now);
  const guard = (p: string, why: string) => protect(shield, p, why, unitOf);
  for (const r of rows) {
    if (!goodRow(r) && !heldRow(r)) continue;
    const why = heldRow(r) ? `spelet har ${r.id}` : `${r.id} är dömd ${r.verdict.split(',')[0]}`, f = folderOf(r.id);
    guard(`assets/motions/${f}`, why); guard(`assets/tracking/${f}`, why);
    for (const d of dealersDirs) { guard(`assets/speech/${d}/${r.id}`, why); guard(`assets/speech/${d}/bank-${r.id}`, why); }
  }
  // A folder whose takes are all judged Inte bra (a source film cut into takes has no verdict of its own: they decide).
  const rejectedFolder = (f: string) => { const own = rows.filter(r => folderOf(r.id) === f && !(r.kind === 'källfilm' && !r.judge)); return own.length > 0 && own.every(r => r.judge?.verdict === 'underkand'); };
  for (const p of json<{patches?: {path?: string}[]}>('data/speech-patches.json')?.patches ?? []) if (p.path) guard(path.posix.dirname(p.path), 'munlapp i data/speech-patches.json');
  const roles = json<{dealers?: Record<string, {entries?: Record<string, unknown>[]}>}>('data/media-roles.json');
  for (const [dealer, d] of Object.entries(roles?.dealers ?? {})) for (const e of d.entries ?? []) {
    const main = typeof e.path === 'string' ? e.path : null, clip = main ? /^assets\/motions\/([^/]+)\//.exec(main)?.[1] : null;
    if (e.role === 'film' && clip && rejectedFolder(clip)) continue;
    const why = `roll i Material: ${dealer} ${String(e.id)} (${String(e.role)})`;
    if (main) guard(unitOf(main) ?? main, why);
    for (const p of pathsIn(JSON.stringify(e))) guard(p, why);
  }
  for (const f of ['data/manifest.json', ...readdirSync(path.join(repo, 'evidence')).filter(f => f.endsWith('.json')).map(f => `evidence/${f}`)]) for (const p of pathsIn(read(f))) guard(p, `V6, original eller referens (${f})`);
  for (const i of items) {
    if (i.use === 'spelas' || i.use === 'referens') guard(i.path, `${i.use}: ${i.why[0] ?? ''}`.slice(0, 160));
    // An order's own record shows its folder in Beställ; that alone does not guard a take that stopped (orders still under way are guarded below).
    else if (i.use === 'visas') { const why = i.why.find(w => !w.startsWith('data/orders/')); if (why) guard(i.path, `visas: ${why}`.slice(0, 160)); }
  }
  const cards = json<{decisions?: Record<string, unknown>[]}>('data/decisions.json')?.decisions ?? [];
  for (const c of cards) {
    const why = `kort i Beslut: ${String(c.id)}`, text = JSON.stringify(c);
    if (typeof c.proof === 'string') guard(`assets/proofs/${c.proof}`, why);
    for (const p of pathsIn(text)) guard(p, why);
    for (const id of idsNamed(text, [...unitIds.keys()])) for (const p of unitIds.get(id)!) guard(p, why);
  }
  const release = read('data/studio-release.json');
  for (const p of pathsIn(release)) guard(p, 'utgåvan (data/studio-release.json)');
  for (const id of idsNamed(release, [...unitIds.keys()])) for (const p of unitIds.get(id)!) guard(p, 'utgåvan (data/studio-release.json)');
  const IN_FLIGHT = new Set(['GODKÄND', 'LAGD', 'KLAR', 'HÄMTAD', 'OSÄKER']);
  type OrderRec = {id: string; status?: string};
  type OrderTake = {take: number; status?: string; history?: {status?: string; note?: string}[]};
  const orders = readdirSync(path.join(repo, 'data/orders')).filter(f => f.endsWith('.json')).map(f => json<OrderRec>(`data/orders/${f}`)).filter((o): o is OrderRec => !!o?.id);
  const orderTakes = new Map<string, OrderTake[]>();
  for (const o of orders) {
    const receipt = json<{takes?: OrderTake[]}>(`assets/orders/${o.id}/receipt.json`), takes = receipt?.takes ?? [];
    orderTakes.set(o.id, takes);
    const open = o.status === 'UTKAST' || (o.status === 'GODKÄND' && !receipt) || takes.some(t => IN_FLIGHT.has(t.status ?? ''));
    if (open) { guard(`assets/orders/${o.id}`, `beställningen ${o.id} är inte klar`); for (const p of pathsIn(read(`data/orders/${o.id}.json`))) guard(p, `beställningen ${o.id} är inte klar`); }
  }
  guardKeys(shield, files.values());

  // ── Who points at what: paths anywhere in a register, and exact ids of films ──
  const motionIds = new Set([...readdirSync(path.join(repo, 'assets/motions')), ...records.keys()]);
  const refs = new Map<string, Set<string>>();
  const addRef = (p: string, from: string) => { const parts = clean(p).split('/'); for (let d = 3; d <= Math.min(parts.length, 5); d++) { const k = parts.slice(0, d).join('/'); if (!refs.has(k)) refs.set(k, new Set()); refs.get(k)!.add(from); } };
  const scan = (value: unknown, from: string) => {
    for (const p of pathsIn(JSON.stringify(value))) addRef(p, from);
    const leaf = (v: unknown): void => { if (typeof v === 'string') { if (motionIds.has(v)) addRef(`assets/motions/${v}`, from); } else if (Array.isArray(v)) v.forEach(leaf); else if (v && typeof v === 'object') Object.values(v).forEach(leaf); };
    leaf(value);
  };
  for (const [id, r] of records) scan(r, postOf(id));
  const perEntry: Record<string, (v: Record<string, unknown>) => [string, unknown][]> = {
    'clip-jobs.json': v => ['jobs', 'derived', 'edits'].flatMap(k => ((v[k] ?? []) as {id: string}[]).map(e => [e.id, e] as [string, unknown])),
    'speech-patches.json': v => ((v.patches ?? []) as {id: string}[]).map(e => [e.id, e] as [string, unknown]),
    'media-roles.json': v => Object.values((v.dealers ?? {}) as Record<string, {entries?: {id: string}[]}>).flatMap(d => (d.entries ?? []).map(e => [e.id, e] as [string, unknown])),
    'decisions.json': v => ((v.decisions ?? []) as {id: string}[]).map(e => [e.id, e] as [string, unknown]),
  };
  // Material's entry for a film itself (role film, its path in the film's folder): the film's own description, not a pointer.
  const roleFilm = new Map<string, string>();
  for (const d of Object.values(roles?.dealers ?? {})) for (const e of d.entries ?? []) {
    const clip = e.role === 'film' && typeof e.path === 'string' ? /^assets\/motions\/([^/]+)\/[^/]+$/.exec(e.path)?.[1] : null;
    if (clip) roleFilm.set(`data/media-roles.json#${String(e.id)}`, clip);
  }
  for (const f of readdirSync(path.join(repo, 'data')).filter(f => f.endsWith('.json'))) {
    const v = json<Record<string, unknown>>(`data/${f}`); if (!v) continue;
    if (perEntry[f]) for (const [id, e] of perEntry[f](v)) scan(e, `data/${f}#${id}`); else scan(v, `data/${f}`);
  }
  for (const dir of ['data/orders', 'placements', 'evidence']) for (const f of readdirSync(path.join(repo, dir)).filter(f => f.endsWith('.json'))) scan(json(`${dir}/${f}`), `${dir}/${f}`);
  for (const f of files.values()) if (f.path.endsWith('.json') && f.bytes < 8e6) scan(json(f.path), f.path);
  const foreign = (folder: string, own: (from: string) => boolean) => [...(refs.get(folder) ?? [])].filter(from => !from.startsWith(`${folder}/`) && !own(from));

  // ── The groups ──
  const plan: Plan = {schemaVersion: 1, about: 'What can leave assets/, written by node tools/media-thin.ts; --kor reads it and checks every file again.', made: new Date(now).toISOString(), trash: TRASH,
    groups: GROUPS.map(g => ({...g, units: [], count: 0, mb: 0, mbFreed: 0, examples: []})), skipped: [], assets: {mb: 0, files: 0, byTop: {}},
    blob: {listed: 0, local: 0, mb: 0, byGroup: {}, missing: 0, changed: 0, young: 0, source: null}, notes: []};
  const group = (name: string) => plan.groups.find(g => g.name === name)!;
  const skips = new Map<string, {group: string; reason: string; count: number; bytes: number; examples: string[]}>();
  const skip = (g: string, reason: string, id: string, bytes: number) => { const k = `${g}|${reason}`; const e = skips.get(k) ?? {group: g, reason, count: 0, bytes: 0, examples: []}; e.count++; e.bytes += bytes; if (e.examples.length < 3) e.examples.push(id); skips.set(k, e); };
  const planned = new Set<string>();
  /** The guard's reason in a few words, so that skipped units add up by kind (plan.json keeps the examples). */
  const source = (w: string) => /^talfilmen \S+ spelas/.test(w) ? 'talfilm på begäran i bankens graf (buildGraph)' : /buildGraph/.test(w) ? 'bankens graf (buildGraph)'
    : (/^(\S+\.(?:md|jsonl?|ts))/.exec(w)?.[1] ?? w).replace(/^(data\/orders|evidence|placements)\/.*/, '$1/…').slice(0, 60);
  const short = (s: string): string => {
    const twin = /^samma fil som \S+ \((.*)\)$/.exec(s); if (twin) return `delar fil med en skyddad fil: ${short(twin[1])}`;
    const use = /^(visas|spelas|referens): (.*)$/.exec(s); if (use) return `${use[1]}: ${source(use[2])}`;
    return s.replace(/^spelet har .*$/, 'spelet har den').replace(/^\S+ är dömd .*$/, 'dömd bra').replace(/^(roll i Material|kort i Beslut):.*$/, '$1').replace(/^utgåvan .*$/, 'utgåvan')
      .replace(/^beställningen .*$/, 'beställning under arbete').replace(/^munlapp i .*$/, 'munlapp i data/speech-patches.json').replace(/^V6, original eller referens \((.*)\)$/, (_, f: string) => `V6, original eller referens: ${source(f)}`).slice(0, 80);
  };
  const outWord = (from: string) => `pekas ut av ${from.replace(/#.*$/, '').replace(/^assets\/([^/]+)\/.*$/, 'assets/$1/…').replace(/^(data\/orders|evidence|placements)\/.*/, '$1/…')}`;
  /** A unit enters its group only when every file passes the guard and nothing outside it points at it (out: who does);
   *  otherwise it is counted under why, the guard's reason first. */
  const take = (g: string, u: Unit, out: string[] = []): boolean => {
    const files = u.files.filter(f => !planned.has(f.path));
    if (!files.length) return false;
    const stop = files.map(f => blocked(f, shield)).find(Boolean);
    if (stop) { skip(g, short(stop), u.id, files.reduce((n, f) => n + f.bytes, 0)); return false; }
    if (out.length) { skip(g, outWord(out[0]), u.id, files.reduce((n, f) => n + f.bytes, 0)); return false; }
    for (const f of files) planned.add(f.path);
    group(g).units.push({...u, files}); return true;
  };
  const videosIn = (dir: string) => [...files.values()].filter(f => f.path.startsWith(`${dir}/`) && VIDEO.test(f.path));
  const orderTakeDir = (id: string) => { const o = records.get(id)?.order; return o?.id && o.take ? `assets/orders/${o.id}/take-${o.take}` : null; };

  // Film folders in the bank, each with the ids it holds (its own record and the takes cut from it).
  const byFolder = new Map<string, RowLike[]>(); for (const r of rows) { const f = folderOf(r.id); byFolder.set(f, [...(byFolder.get(f) ?? []), r]); }
  const talk = new Map<string, {n: number; r: RowLike}[]>();
  for (const r of rows) { const m = TALK.exec(r.id); if (m && records.get(r.id)?.speech) talk.set(m[1], [...(talk.get(m[1]) ?? []), {n: Number(m[2]), r}]); }
  const olderTalk = (id: string) => { const m = TALK.exec(id); if (!m) return null; const list = talk.get(m[1]) ?? [], held = list.filter(x => heldRow(x.r)); if (!held.length) return null; const top = Math.max(...held.map(x => x.n)); return Number(m[2]) < top ? held.find(x => x.n === top)!.r.id : null; };
  const forFolder = new Map<string, string>(); // folder → the group its films went to (for the raw deliveries)
  for (const [f, own] of [...byFolder].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dir = `assets/motions/${f}`, films = videosIn(dir);
    if (!films.length) continue;
    if (own.some(goodRow) || own.some(heldRow)) continue; // guarded: used or judged good
    const ids = new Set(own.map(r => r.id)), ownOrders = new Set(own.map(r => records.get(r.id)?.order?.id).filter(Boolean) as string[]);
    // Its own: its records and job entries, its speech folder, its order, and Material's entry for the film itself (role film);
    // any other entry of Material (a landing, a reference, a keystone made from it) points at it.
    const isOwn = (from: string) => [...ids].some(id => from === postOf(id) || from === `data/clip-jobs.json#${id}` || dealersDirs.some(d => from.startsWith(`assets/speech/${d}/${id}/`)))
      || [...ownOrders].some(o => from === `data/orders/${o}.json` || from.startsWith(`assets/orders/${o}/`)) || roleFilm.get(from) === f;
    // A source film cut into takes has no verdict of its own: the takes cut from it decide.
    const judged = own.filter(r => !(r.kind === 'källfilm' && !r.judge));
    const mine = judged.length > 0 && judged.every(r => r.judge?.verdict === 'underkand' && r.judge.byJakob && !r.judge.provisional && r.judge.detail !== 'sekundär');
    const rejected = judged.length > 0 && judged.every(r => r.judge?.verdict === 'underkand');
    const g = mine ? 'inte-bra-hans' : rejected ? 'inte-bra-inte-hans' : own.every(r => olderTalk(r.id)) ? 'tal-aldre'
      : own.every(r => r.group !== 'kopplad') ? 'lost' : null;
    if (!g) { skip('ingen grupp', 'kopplad, inte dömd bra, spelas inte', f, films.reduce((n, x) => n + x.bytes, 0)); continue; }
    const out = foreign(dir, isOwn);
    const twins = films.flatMap(x => (names.get(x.key) ?? []).filter(n => n !== x.path && [...ids].some(id => { const t = orderTakeDir(id); return t && n.startsWith(`${t}/`); })).map(n => files.get(n)!));
    const verdicts = [...new Set(own.map(r => r.verdict.split(',')[0]))].join(', ');
    const reason = g === 'tal-aldre' ? `äldre än ${olderTalk(own[0].id)}, som spelet har; ${verdicts}` : g === 'lost' ? `${own[0].group}; ${verdicts}` : verdicts;
    const ok = take(g, {id: f, reason, marker: dir, files: [...films, ...twins].map(x => ({...x, action: 'flytta'}))}, out);
    if (ok) forFolder.set(f, g);
  }

  // Older talk films' own speech folders, and replaced or unregistered mouth patches.
  const registered = new Set((json<{patches?: {path?: string}[]}>('data/speech-patches.json')?.patches ?? []).map(p => p.path ? path.posix.dirname(p.path) : ''));
  for (const d of dealersDirs) {
    const base = `assets/speech/${d}`;
    for (const name of readdirSync(path.join(repo, base))) {
      const dir = `${base}/${name}`, newer = olderTalk(name), row = rows.find(r => r.id === name);
      if (!newer || !row || heldRow(row) || goodRow(row)) continue;
      const all = [...files.values()].filter(f => f.path.startsWith(`${dir}/`)); if (!all.length) continue;
      // The working folder goes only with its film: while the bank keeps the film, its record still names the folder.
      const film = videosIn(`assets/motions/${folderOf(name)}`);
      if (film.some(x => !planned.has(x.path))) { skip('tal-aldre', 'talets mapp går bara med filmen, som står kvar i banken', dir, all.reduce((n, x) => n + x.bytes, 0)); continue; }
      const out = foreign(dir, from => from === postOf(name) || from === `data/clip-jobs.json#${name}` || from.startsWith(`assets/motions/${name}/`));
      take('tal-aldre', {id: dir, reason: `talets mapp; ${name} är äldre än ${newer}, som spelet har`, marker: null, removeEmpty: dir, files: all.map(x => ({...x, action: 'flytta'}))}, out);
    }
    for (const sub of ['patches', 'patches-ersatta']) {
      const at = `${base}/${sub}`; if (!existsSync(path.join(repo, at))) continue;
      for (const name of readdirSync(path.join(repo, at))) {
        const dir = `${at}/${name}`; if (registered.has(dir)) continue;
        const all = [...files.values()].filter(f => f.path.startsWith(`${dir}/`)); if (!all.length) continue;
        take('tal-aldre', {id: dir, reason: sub === 'patches-ersatta' ? 'munlapp ersatt av en nyare' : 'munlapp som data/speech-patches.json inte nämner', marker: null, removeEmpty: dir, files: all.map(x => ({...x, action: 'flytta'}))}, foreign(dir, () => false));
      }
    }
  }

  // Raw deliveries of takes whose film went above, and deliveries that never became a record.
  const inBank = new Set([...records.values()].map(r => r.order?.id && r.order.take ? `${r.order.id}/take-${r.order.take}` : '').filter(Boolean));
  for (const o of orders) for (const t of orderTakes.get(o.id) ?? []) {
    const dir = `assets/orders/${o.id}/take-${t.take}`, media = [...files.values()].filter(f => f.path.startsWith(`${dir}/`) && MEDIA.test(f.path) && !planned.has(f.path));
    if (!media.length) continue;
    const post = [...records].find(([, r]) => r.order?.id === o.id && r.order.take === t.take)?.[0];
    if (post) {
      const g = forFolder.get(folderOf(post)); if (!g) continue;
      const raw = media.filter(f => VIDEO.test(f.path));
      if (raw.length) take('original-forkastade', {id: dir, reason: `leveransen till ${post} (${g})`, marker: dir, files: raw.map(x => ({...x, action: 'flytta'}))});
      continue;
    }
    if (t.status === 'INFÖRD' || inBank.has(`${o.id}/take-${t.take}`)) continue;
    const out = foreign(dir, from => from === `data/orders/${o.id}.json` || from.startsWith(`assets/orders/${o.id}/`));
    take('bestallningar-utan-post', {id: dir, reason: `stannade på ${t.status ?? '?'}${(() => { const n = [...(t.history ?? [])].reverse().find(h => h.note)?.note; return n ? `: ${n.replace(/\s+/g, ' ').slice(0, 110)}` : ''; })()}`, marker: dir, files: media.map(x => ({...x, action: 'flytta'}))}, out);
  }

  // Proofs without a card, without a recent note, and named by no document.
  const notes = json<{notes?: {proof: string; at?: string}[]}>('data/proof-notes.json')?.notes ?? [];
  for (const name of readdirSync(path.join(repo, 'assets/proofs'))) {
    const dir = `assets/proofs/${name}`, all = [...files.values()].filter(f => f.path.startsWith(`${dir}/`) && !planned.has(f.path)); if (!all.length) continue;
    const recent = notes.filter(n => n.proof === name && n.at && now - Date.parse(n.at) < NOTE_DAYS * DAY);
    if (recent.length) { skip('prov-utan-kort', 'hans anteckning de senaste 14 dygnen', name, all.reduce((n, x) => n + x.bytes, 0)); continue; }
    take('prov-utan-kort', {id: dir, reason: 'inget kort, ingen ny anteckning, inget dokument nämner det', marker: dir, files: all.map(x => ({...x, action: 'flytta'}))}, foreign(dir, from => from === 'data/proof-notes.json'));
  }

  // ── Same bytes, one file: hashes for files of the same size ──
  const cachePath = path.join(repo, '.runtime/gallring/sha-cache.json');
  const cache = new Map<string, string>(Object.entries(json<Record<string, string>>('.runtime/gallring/sha-cache.json') ?? {}));
  const shaOf = async (f: FileRow) => { const k = `${f.key}|${f.bytes}|${Math.round(f.mtimeMs)}`; let v = cache.get(k); if (!v) { v = await hash(path.join(repo, f.path)); cache.set(k, v); } return v; };
  // Speech, V6, originals and references (the manifest's, and the doll's in assets/references/) never share a file.
  const never = (p: string) => /^assets\/(speech|references)\//.test(p) || HARD.some(([d]) => p.startsWith(`${d}/`)) || /^(V6, original eller referens|referens:)/.test(pathGuard(p, shield) ?? '');
  const inodes = new Map<string, FileRow>(); for (const f of files.values()) if (MEDIA.test(f.path) && f.bytes >= MIN_DUPLICATE && !inodes.has(f.key)) inodes.set(f.key, f);
  const bySize = new Map<number, FileRow[]>(); for (const f of inodes.values()) bySize.set(f.bytes, [...(bySize.get(f.bytes) ?? []), f]);
  const bySha = new Map<string, FileRow[]>();
  for (const list of bySize.values()) if (list.length > 1) for (const f of list) { const s = await shaOf(f); bySha.set(s, [...(bySha.get(s) ?? []), f]); }
  for (const [sha, list] of bySha) {
    if (list.length < 2) continue;
    const all = list.map(f => ({f, n: names.get(f.key) ?? [f.path]}));
    if (all.some(x => x.n.some(never) || shield.keys.get(x.f.key)?.includes('bevarad samling'))) { skip('dubbletter', 'talets fil, V6, original, referens eller noir: delar aldrig fil', all[0].n[0], (all.length - 1) * all[0].f.bytes); continue; }
    // Keep a guarded file, else one no group above moves away, else the one with most names, then the oldest.
    const guarded = (x: {n: string[]}) => x.n.some(p => pathGuard(p, shield)), moving = (x: {n: string[]}) => x.n.some(p => planned.has(p));
    const keep = [...all].sort((a, b) => Number(guarded(b)) - Number(guarded(a)) || Number(moving(a)) - Number(moving(b)) || b.n.length - a.n.length || a.f.mtimeMs - b.f.mtimeMs || a.n[0].localeCompare(b.n[0]))[0];
    for (const x of all.filter(x => x !== keep)) {
      if (x.n.length < x.f.links) { skip('dubbletter', 'har namn utanför assets/', x.n[0], 0); continue; }
      take('dubbletter', {id: x.n[0], reason: `samma bytes som ${keep.n[0]}`, marker: null, files: x.n.map(p => ({...files.get(p)!, action: 'länka', to: keep.n[0], sha256: sha}))});
    }
  }
  // After-work copies a recorded command can make again (proposal until a run has shown the same SHA-256).
  for (const f of files.values()) {
    if (!/^assets\/orders\/[^/]+\/take-\d+\/after\.mp4$/.test(f.path) || planned.has(f.path) || f.links > 1) continue;
    const dir = path.posix.dirname(f.path), receipt = json<{order?: string; take?: number; output?: {sha256?: string}; source?: {path?: string; sha256?: string}; treatment?: {flags?: Record<string, unknown>}}>(`${dir}/after.json`);
    if (!receipt?.output?.sha256 || !receipt.source?.path || !files.has(receipt.source.path)) continue;
    const sha = await shaOf(f); if (sha !== receipt.output.sha256) { skip('efterarbete-kopior', 'after.mp4 är inte den after.json beskriver', f.path, f.bytes); continue; }
    if ((bySha.get(sha)?.length ?? 0) > 1) continue;
    const flags = Object.entries(receipt.treatment?.flags ?? {}).map(([k, v]) => { const flag = k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`); return v === true ? `--${flag}` : v === false ? `--no-${flag}` : `--${flag} ${String(v)}`; }).join(' ');
    take('efterarbete-kopior', {id: f.path, reason: `görs om ur ${receipt.source.path}`, marker: null, command: `node tools/film-after.ts ${receipt.order} ${receipt.take}${flags ? ` ${flags}` : ''} --out .runtime/gallring/bevis/${receipt.order}-take-${receipt.take} (jämför SHA-256 med after.json)`, files: [{...f, action: 'flytta', sha256: sha}]});
  }
  mkdirSync(path.dirname(cachePath), {recursive: true}); writeFileSync(cachePath, JSON.stringify(Object.fromEntries(cache)) + '\n');

  // ── Blob: what the release's list would carry (no SHA-256 in the list: matched by path and size) ──
  const blobFile = '.runtime/ny-blob/filer.json', blob = json<{withVariants?: {files?: {path: string; bytes: number; group?: string}[]}}>(blobFile);
  if (blob?.withVariants?.files) {
    const seen = new Set<string>(); plan.blob.source = blobFile;
    for (const b of blob.withVariants.files) {
      plan.blob.listed++; const f = files.get(b.path);
      if (!f) { plan.blob.missing++; continue; } if (f.bytes !== b.bytes) { plan.blob.changed++; continue; } if (now - f.mtimeMs < MIN_AGE_DAYS * DAY) { plan.blob.young++; continue; }
      plan.blob.local++; if (seen.has(f.key)) continue; seen.add(f.key);
      plan.blob.mb += f.bytes; plan.blob.byGroup[b.group ?? '?'] = (plan.blob.byGroup[b.group ?? '?'] ?? 0) + f.bytes;
    }
    plan.blob.mb = mb(plan.blob.mb); for (const k of Object.keys(plan.blob.byGroup)) plan.blob.byGroup[k] = mb(plan.blob.byGroup[k]);
  }

  // ── Sums ──
  for (const g of plan.groups) {
    const all = g.units.flatMap(u => u.files);
    g.count = g.units.length; g.mb = mb(all.reduce((n, f) => n + f.bytes, 0)); g.mbFreed = mb(freedBytes(all));
    g.examples = [...g.units].sort((a, b) => b.files.reduce((n, f) => n + f.bytes, 0) - a.files.reduce((n, f) => n + f.bytes, 0)).slice(0, 3).map(u => u.id);
  }
  plan.skipped = [...skips.values()].sort((a, b) => b.bytes - a.bytes).map(s => ({group: s.group, reason: s.reason, count: s.count, mb: mb(s.bytes), examples: s.examples}));
  const unique = new Map<string, FileRow>(); for (const f of files.values()) if (!unique.has(f.key)) unique.set(f.key, f);
  plan.assets.files = files.size; plan.assets.mb = mb([...unique.values()].reduce((n, f) => n + f.bytes, 0));
  for (const f of unique.values()) { const t = f.path.split('/')[1]; plan.assets.byTop[t] = (plan.assets.byTop[t] ?? 0) + f.bytes; }
  for (const k of Object.keys(plan.assets.byTop)) plan.assets.byTop[k] = mb(plan.assets.byTop[k]);
  plan.notes.push('aterskapbart: inget register visar i dag en körning som gjort om en fil till samma SHA-256; efterarbetets kopior står därför som förslag med kommandot som bevisar det.',
    'Talets egna källfilmer (assets/speech/<dealer>/<id>/source.mp4) tas aldrig ensamma: tools/speech.ts tar upp en mapp utan source.mp4 igen och skriver en ny film under samma namn.');
  return {plan, shield};
}

// ── The report in plain words ───────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('sv-SE', {maximumFractionDigits: 1});
export function lasmig(p: Plan): string {
  const L: string[] = [], sum = (l: GroupPlan) => l.mbFreed, of = (level: Level) => p.groups.filter(g => g.level === level);
  const safe = of('säkert').reduce((n, g) => n + sum(g), 0), offer = of('förslag').reduce((n, g) => n + sum(g), 0);
  L.push('# Gallring av assets/', '', `Gjord ${p.made.slice(0, 16).replace('T', ' ')} av \`node tools/media-thin.ts\`. Rapporten flyttar ingenting. Alla filer med skäl, storlek och antal hårda länkar: \`plan.json\` bredvid.`, '');
  L.push(`**I dag:** ${fmt(p.assets.mb)} MB unikt i assets/ (${p.assets.files} filnamn). **Säkert** frigör ${fmt(safe)} MB. **Förslag** (bara på Jakobs ord) frigör ${fmt(offer)} MB till. **Blob:** ${fmt(p.blob.mb)} MB skulle kunna ligga bara på Blob när den nya storen finns.`, '');
  L.push('MB "frigörs" räknar en fil först när dess sista namn går (hårda länkar); MB "på namnen" är filernas storlek per namn.', '');
  for (const level of ['säkert', 'förslag'] as Level[]) {
    L.push(`## ${level === 'säkert' ? 'Säkert (det enda `--kor` gör utan fler ord)' : 'Förslag (`--kor --grupp <namn>`, bara på Jakobs ord)'}`, '', '| Grupp | Vad | Antal | MB frigörs | MB på namnen | Exempel |', '|---|---|---|---|---|---|');
    for (const g of of(level)) L.push(`| \`${g.name}\` | ${g.title} | ${g.count} | ${fmt(g.mbFreed)} | ${fmt(g.mb)} | ${g.examples.map(e => `\`${e}\``).join(', ') || '–'} |`);
    L.push('');
    for (const g of of(level)) L.push(`- **${g.name}**: ${g.rule}`);
    L.push('');
  }
  const cmd = p.groups.find(g => g.name === 'efterarbete-kopior')?.units[0]?.command;
  if (cmd) L.push(`Efterarbetets kopior blir säkra först när en körning visat samma SHA-256, till exempel: \`${cmd}\`.`, '');
  L.push('## Blob (förberett, inget görs i dag)', '', p.blob.source ? `Utgåvans fillista (\`${p.blob.source}\`) har ${p.blob.listed} filer; ${p.blob.local} finns här med samma storlek och är äldre än tre dygn, ${fmt(p.blob.mb)} MB unikt. Listan har ingen SHA-256, så filerna är matchade på sökväg och storlek. ${p.blob.missing} saknas här, ${p.blob.changed} har annan storlek och ${p.blob.young} är aktivt arbete.` : 'Utgåvans fillista finns inte än.', '');
  if (Object.keys(p.blob.byGroup).length) { L.push('| Del av utgåvan | MB |', '|---|---|'); for (const [k, v] of Object.entries(p.blob.byGroup).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${fmt(v)} |`); L.push(''); }
  L.push('## Valt bort', '', 'Det spärren eller en regel håller kvar (de största först):', '', '| Grupp | Skäl | Antal | MB | Exempel |', '|---|---|---|---|---|');
  for (const s of p.skipped.slice(0, 30)) L.push(`| ${s.group} | ${s.reason.replace(/\|/g, '/')} | ${s.count} | ${fmt(s.mb)} | ${s.examples.map(e => `\`${e}\``).join(', ')} |`);
  L.push('', ...p.notes.map(n => `- ${n}`), '');
  L.push('## Spärren', '', 'Rörs aldrig, oavsett grupp: Primär, Godkänd och Variant (hans eller givna åt honom); allt spelet har (`gameTakes`, `usesOf`); allt med roll i Material som inte är en förkastad tagning; V6, original och referenser; `assets/noir/` och filer som delar fil med den; `assets/films/intro/`; scenen spelet använder; allt ett kort i Beslut, utgåvan eller en beställning under arbete nämner; filer yngre än tre dygn; allt utanför assets/. En fil som delar bytes med en skyddad fil är skyddad.', '');
  L.push('## Köra', '', `- \`node tools/media-thin.ts --kor\` gör säkert-nivån ur plan.json (yngre än ${PLAN_HOURS} timmar). Varje fil kontrolleras igen mot spärren och en ny plan; en flyttad fil kopieras till \`${p.trash}/<datum>/\`, SHA-256 jämförs, och först då tas den bort. Kvitto i \`.runtime/cleanup/\`.`,
    '- `node tools/media-thin.ts --kor --grupp <namn>` gör en namngiven grupp, bara på Jakobs ord.', `- \`node tools/media-thin.ts --tom-korgen\` raderar korgar äldre än ${TRASH_DAYS} dygn.`, '');
  return L.join('\n');
}

// ── Carrying it out ─────────────────────────────────────────────────────────
export type Done = {at: string; path: string; action: string; bytes: number; sha256: string; to: string};
export type Receipt = {tool: string; started: string; plan: string; groups: string[]; trash: string; done: Done[]; skipped: {unit: string; reason: string}[]; markers: string[]; posts: string[]; error: string | null};
/** Carries out named groups of a plan: every file is checked again (size, time, the guard, SHA-256) before it is touched; a unit
 *  with one file that does not hold is left whole. fresh: the units the plan made just now still has, by group. */
export async function carryOut(p: Plan, groups: string[], o: {repo: string; trash: string; shield: Shield; fresh?: Map<string, Set<string>>; receiptDir: string; now?: number}): Promise<{receipt: string; result: Receipt}> {
  const chosen = groups.map(n => p.groups.find(g => g.name === n));
  if (chosen.some(g => !g)) throw new Error(`Okänd grupp: ${groups.filter((n, i) => !chosen[i]).join(', ')}`);
  if (chosen.some(g => g!.level === 'blob')) throw new Error('Blob-nivån görs inte här.');
  const moves = (chosen as GroupPlan[]).some(g => g.units.some(u => u.files.some(f => f.action === 'flytta')));
  if (moves && !existsSync(path.dirname(path.resolve(o.trash)))) throw new Error(`Korgen saknas: ${path.dirname(o.trash)} finns inte (D: saknas?). Inget flyttas.`);
  const now = o.now ?? Date.now(), day = new Date(now).toISOString().slice(0, 10), bin = path.join(o.trash, day);
  mkdirSync(o.receiptDir, {recursive: true});
  const receipt = path.join(o.receiptDir, `${new Date(now).toISOString().replace(/[:.]/g, '-')}-gallra-${groups.join('+')}.json`);
  const result: Receipt = {tool: 'tools/media-thin.ts', started: new Date(now).toISOString(), plan: p.made, groups, trash: bin, done: [], skipped: [], markers: [], posts: [], error: null};
  const save = () => writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n');
  save();
  try {
    for (const g of chosen as GroupPlan[]) for (const u of g.units) {
      if (o.fresh && !o.fresh.get(g.name)?.has(u.id)) { result.skipped.push({unit: u.id, reason: 'inte längre med i en ny plan'}); save(); continue; }
      // Check every file first; nothing in the unit is touched unless all hold.
      const checked: {f: Action; abs: string; sha: string; key: string}[] = []; let stop: string | null = null;
      for (const f of u.files) {
        const abs = path.join(o.repo, f.path);
        let st; try { checkedPath(o.repo, abs); st = lstatSync(abs, {bigint: true}); } catch (e) { stop = existsSync(abs) ? `${f.path}: ${e instanceof Error ? e.message : e}` : `${f.path} finns inte`; break; }
        if (st.isSymbolicLink() || !st.isFile()) { stop = `${f.path} är ingen vanlig fil`; break; }
        if (Number(st.size) !== f.bytes || Math.abs(Number(st.mtimeMs) - f.mtimeMs) > 1) { stop = `${f.path} har ändrats sedan planen`; break; }
        const why = blocked({path: f.path, mtimeMs: Number(st.mtimeMs), key: `${st.dev}:${st.ino}`}, o.shield); if (why) { stop = `${f.path}: ${why}`; break; }
        const sha = await hash(abs); if (f.sha256 && sha !== f.sha256) { stop = `${f.path} har annat innehåll än i planen`; break; }
        if (f.action === 'länka') {
          const keep = path.join(o.repo, f.to ?? '');
          if (!f.to || !existsSync(keep) || await hash(keep) !== sha) { stop = `${f.to ?? '?'} är inte längre samma bytes`; break; }
          if (statSync(keep, {bigint: true}).ino === st.ino) { stop = `${f.path} delar redan fil`; break; }
        }
        checked.push({f, abs, sha, key: `${st.dev}:${st.ino}`});
      }
      if (stop) { result.skipped.push({unit: u.id, reason: stop}); save(); continue; }
      const moved: Done[] = [], inBin = new Map<string, string>(); // a file with two names in the unit is copied once; its second name is a link in the trash
      for (const {f, abs, sha, key} of checked) {
        if (f.action === 'länka') {
          const temporary = `${abs}.gallra-lank`;
          linkSync(path.join(o.repo, f.to!), temporary);
          try { renameSync(temporary, abs); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
          result.done.push({at: new Date().toISOString(), path: f.path, action: 'länkad', bytes: f.bytes, sha256: sha, to: f.to!}); save(); continue;
        }
        const dest = path.join(bin, f.path);
        mkdirSync(path.dirname(dest), {recursive: true});
        const first = inBin.get(key);
        if (first) linkSync(first, dest); else copyFileSync(abs, dest, constants.COPYFILE_EXCL);
        if (await hash(dest) !== sha) { unlinkSync(dest); throw new Error(`Kopian i korgen blev inte lika: ${f.path}`); }
        inBin.set(key, dest);
        unlinkSync(abs);
        const d = {at: new Date().toISOString(), path: f.path, action: 'flyttad', bytes: f.bytes, sha256: sha, to: path.relative(o.trash, dest).replace(/\\/g, '/')};
        result.done.push(d); moved.push(d); save();
      }
      // A film that is gone takes its posts out of the register with it (Jakob 2026-11-23: self-cleaning); his verdict stays as one row.
      const film = moved.length ? /^assets\/motions\/([^/]+)$/.exec(u.marker ?? '')?.[1] : undefined;
      let gone: Removal | null = null;
      if (film) {
        const register = motionRegister(o.repo), named = filmFiles(register.ofFilm(film).map(e => e.post));
        if (named.length && !named.some(f => existsSync(path.join(o.repo, f)))) { gone = register.remove(film, {why: `gallrad ${day} av tools/media-thin.ts, gruppen ${g.name}: ${u.reason}`}); result.posts.push(...gone.removed); save(); }
      }
      const posts = gone?.removed.length ? `Filmens poster är borttagna ur registret: ${gone.removed.join(', ')}. De kan tas tillbaka ur Git (${MOTIONS_TEXT}).${gone.verdicts.length ? ' Jakobs dom står kvar som en rad i data/motions-removed.jsonl.' : ''}\n` : '';
      if (u.marker && moved.length) {
        const file = path.join(o.repo, u.marker, MARKER), had = existsSync(file) ? readFileSync(file, 'utf8') + '\n' : '';
        mkdirSync(path.dirname(file), {recursive: true});
        writeFileSync(file, `${had}Raderad ${day} av tools/media-thin.ts, gruppen ${g.name} (${g.level}).\nSkäl: ${u.reason}\nFilerna ligger i papperskorgen ${bin.replace(/\\/g, '/')} i ${TRASH_DAYS} dygn:\n${moved.map(m => `- ${m.path} (${m.bytes} byte, sha256 ${m.sha256})`).join('\n')}\n${posts}`);
        result.markers.push(`${u.marker}/${MARKER}`); save();
      }
      if (u.removeEmpty) { const dir = path.join(o.repo, u.removeEmpty); const prune = (d: string) => { for (const e of readdirSync(d, {withFileTypes: true})) if (e.isDirectory()) prune(path.join(d, e.name)); if (!readdirSync(d).length) rmdirSync(d); }; if (existsSync(dir)) prune(dir); }
    }
  } catch (error) { result.error = String(error); save(); throw error; }
  save();
  return {receipt, result};
}

/** Deletes the trash's day folders older than TRASH_DAYS. */
export function emptyTrash(trash: string, now = Date.now()): {removed: string[]; kept: string[]} {
  if (!existsSync(trash)) throw new Error(`Korgen ${trash} finns inte.`);
  const out = {removed: [] as string[], kept: [] as string[]};
  for (const name of readdirSync(trash)) {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(name) ? Date.parse(`${name}T00:00:00Z`) : NaN;
    if (Number.isFinite(t) && now - t > TRASH_DAYS * DAY) { rmSync(path.join(trash, name), {recursive: true, force: true}); out.removed.push(name); } else out.kept.push(name);
  }
  return out;
}

async function main(argv: string[]) {
  const kor = argv.includes('--kor'), empty = argv.includes('--tom-korgen'), gi = argv.indexOf('--grupp'), named = gi >= 0 ? argv[gi + 1] : null;
  if (argv.some((a, i) => !['--kor', '--tom-korgen', '--grupp'].includes(a) && i !== gi + 1) || (gi >= 0 && (!named || !kor)) || (kor && empty))
    throw new Error('Använd: node tools/media-thin.ts [--kor [--grupp <namn>]] | --tom-korgen');
  const out = path.join(ROOT, '.runtime/gallring'), planFile = path.join(out, 'plan.json'), receipts = path.join(ROOT, '.runtime/cleanup');
  if (empty) {
    const r = emptyTrash(TRASH); mkdirSync(receipts, {recursive: true});
    writeFileSync(path.join(receipts, `${new Date().toISOString().replace(/[:.]/g, '-')}-tom-korgen.json`), JSON.stringify({tool: 'tools/media-thin.ts --tom-korgen', trash: TRASH, ...r}, null, 2) + '\n');
    console.log(`Korgen: ${r.removed.length} dagar raderade (${r.removed.join(', ') || 'inga'}), ${r.kept.length} kvar.`); return;
  }
  if (kor) {
    if (!existsSync(planFile)) throw new Error('Ingen plan: kör node tools/media-thin.ts först och läs den.');
    const p = JSON.parse(readFileSync(planFile, 'utf8')) as Plan;
    if (Date.now() - Date.parse(p.made) > PLAN_HOURS * 3600e3) throw new Error(`Planen är äldre än ${PLAN_HOURS} timmar: gör den igen och läs den.`);
    const groups = named ? [named] : p.groups.filter(g => g.level === 'säkert').map(g => g.name);
    const fresh = await makePlan(ROOT);
    const units = new Map(fresh.plan.groups.map(g => [g.name, new Set(g.units.map(u => u.id))]));
    const {receipt, result} = await carryOut(p, groups, {repo: ROOT, trash: TRASH, shield: fresh.shield, fresh: units, receiptDir: receipts});
    console.log(`${result.done.length} filer (${mb(result.done.reduce((n, d) => n + d.bytes, 0))} MB på namnen), ${result.skipped.length} enheter hoppade över. Kvitto: ${path.relative(ROOT, receipt).replace(/\\/g, '/')}`); return;
  }
  const {plan} = await makePlan(ROOT);
  mkdirSync(out, {recursive: true});
  writeFileSync(planFile, JSON.stringify(plan, null, 1) + '\n'); writeFileSync(path.join(out, 'LASMIG.md'), lasmig(plan) + '\n');
  for (const g of plan.groups) console.log(`${g.level.padEnd(7)} ${g.name.padEnd(24)} ${String(g.count).padStart(4)} st ${fmt(g.mbFreed).padStart(9)} MB frigörs (${fmt(g.mb)} MB på namnen)`);
  console.log(`blob    ${fmt(plan.blob.mb)} MB. Skrev .runtime/gallring/LASMIG.md och plan.json`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1; });
