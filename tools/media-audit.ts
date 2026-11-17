// What every folder of the ignored media is, and whether anything uses it. Read only: it writes nothing.
//   node tools/media-audit.ts [--json] [--repo <checkout>] [<folder>]
// <folder> limits the answer to units under it (for example assets/films/pamela). --repo reads another checkout's registers and
// media (the default is this one). A unit is the folder that is one thing: one film, one anchor, one order, one proof (UNIT_DEPTH).
//
// Each unit gets one use, the strongest that holds, with the file and field that say so:
//   spelas            the game or the bank plays it: a take that buildGraph (src/clip-graph.ts) makes the main take of a step, a
//                     playable variant or variant start, an idle take with weight or said on request (speech), a mouth patch in
//                     data/speech-patches.json, or a file the game's own code loads (src/game-*.ts, src/scene3d-*.ts)
//   visas             the lab shows it as living work: an anchor, keystone or landing that holds or is a candidate in Material
//                     (data/media-roles.json), an order's folder (data/orders/<id>.json), anything named by its exact id in Beslut,
//                     data/studio-release.json or a document or instruction (DOCUMENTS), a proof changed today, the card track a
//                     played film needs, the scene's rooms, table and
//                     props (data/scene-*.json, data/props.json), the lab's backdrops (src/placement-model.ts)
//   referens          kept by the rules: V6 and what recreates it (data/library.json, output/), data/manifest.json, evidence/, a
//                     reference in Material, and the first or last picture of a film that plays
//   bara registrerad  a register names it, but nothing plays it, shows it as living work or builds on it
//   okänd             no register names it
// The logic (units, claims, ranking) is pure and tested in tools/media-audit.test.ts; the reading is at the bottom.
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraph, dealersOf, playable, type BankData, type Take} from '../src/clip-graph.ts';

export type Use = 'spelas' | 'visas' | 'referens' | 'bara registrerad' | 'okänd';
export const USES: Use[] = ['spelas', 'visas', 'referens', 'bara registrerad', 'okänd'];
export type FileInfo = {path: string; bytes: number; mtimeMs: number};
export type Unit = {path: string; top: string; bytes: number; files: number; made: string; changed: string};
// A claim: a register or the code says something about one path (a file or a folder).
export type Claim = {path: string; use: Exclude<Use, 'okänd'>; why: string};
export type Item = Unit & {use: Use; why: string[]; what: string; judged?: string | null};

// The depth (in path segments after assets/ or output/) at which a folder is one thing.
export const UNIT_DEPTH: Record<string, number> = {
  anchors: 2, keystones: 2, motions: 2, orders: 2, proofs: 2, sources: 2, sequences: 2, tracking: 2, lab: 2, candidates: 2, originals: 2, reference: 2,
  films: 3, speech: 3, scene: 3, 'scene-work': 3, frames: 2, props: 2, v6: 2, verification: 1,
};
// speech/<dealer>/patches/<id> is one patch, one level further down.
const deeper = (parts: string[]) => parts[0] === 'speech' && parts[2] === 'patches' ? 4 : parts[0] === 'props' && parts[1] === 'source' ? 3 : null;

/** The unit a file belongs to: its folder at the top's depth, or the file itself when it lies higher up. */
export function unitOf(file: string): string | null {
  const m = /^(assets|output)\/(.+)$/.exec(file); if (!m) return null;
  const parts = m[2].split('/'), depth = deeper(parts) ?? UNIT_DEPTH[parts[0]] ?? 1;
  return parts.length > depth ? `${m[1]}/${parts.slice(0, depth).join('/')}` : file;
}

export function unitsOf(files: FileInfo[]): Unit[] {
  const by = new Map<string, Unit & {min: number; max: number}>();
  for (const f of files) {
    const u = unitOf(f.path); if (!u) continue;
    const e = by.get(u) ?? {path: u, top: u.split('/').slice(0, 2).join('/'), bytes: 0, files: 0, made: '', changed: '', min: Infinity, max: 0};
    e.bytes += f.bytes; e.files++; e.min = Math.min(e.min, f.mtimeMs); e.max = Math.max(e.max, f.mtimeMs); by.set(u, e);
  }
  return [...by.values()].map(({min, max, ...u}) => ({...u, made: new Date(min).toISOString().slice(0, 10), changed: new Date(max).toISOString().slice(0, 10)})).sort((a, b) => a.path.localeCompare(b.path));
}

/** The units a claimed path speaks for: the unit it lies in, or every unit under a folder that is itself a unit's parent only when the
 *  claim says so explicitly (a claim on "assets/motions" says nothing about one film). */
export function unitsClaimed(claimPath: string, units: Map<string, Unit>): string[] {
  const p = claimPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const own = unitOf(p); if (own && units.has(own)) return [own];
  if (units.has(p)) return [p];
  return [];
}

/** The strongest use per unit, with every reason for it (weaker ones are left out). */
export function rank(units: Unit[], claims: Claim[], describe: (u: Unit) => string = whatOf): Item[] {
  const map = new Map(units.map(u => [u.path, u])), per = new Map<string, Claim[]>();
  for (const c of claims) for (const u of unitsClaimed(c.path, map)) per.set(u, [...(per.get(u) ?? []), c]);
  return units.map(u => {
    const list = per.get(u.path) ?? [], best = USES.find(use => list.some(c => c.use === use)) ?? 'okänd';
    return {...u, use: best, why: [...new Set(list.filter(c => c.use === best).map(c => c.why))].slice(0, 6), what: describe(u)};
  });
}

const DEALERS: Record<string, string> = {pamela: 'Pamelas', paow: 'Paows', petra: 'Petras'};
const dealerOf = (id: string) => DEALERS[id.split('-')[0]] ?? null;
/** What a unit is, in one line of plain Swedish, from where it lies. */
export function whatOf(u: Unit): string {
  const parts = u.path.split('/'), id = parts.at(-1) ?? '', who = dealerOf(id) ?? (parts[2] && DEALERS[parts[2]]) ?? '', w = who ? who + ' ' : '';
  switch (parts[1]) {
    case 'motions': return `${w}film i banken (${id})`.trim();
    case 'films': return parts[2] === 'intro' ? `filmen före spelet (${id})` : `${w}film utanför banken (${id})`;
    case 'anchors': return `${w}ankare, en stillbild filmerna börjar eller slutar på (${id})`;
    case 'keystones': return `${w}keystone, grundbilden av dealern (${id})`;
    case 'orders': return `en beställning hos Runway: kvitto, bilder och det som kom tillbaka (${id})`;
    case 'proofs': return `ett prov att titta på i Granska (${id})`;
    case 'tracking': return parts.length > 2 && !id.includes('.') ? `kortspåret för filmen ${id}` : `kortdata för V6 (${id})`;
    case 'speech': return parts[3] === 'patches' ? `munlapp till en talfilm (${id})` : `${w}talfilmens arbetsmapp: ljud, röst och kvitto (${id})`;
    case 'scene': return `3D-scenens ${({rooms: 'rum', thumbs: 'rumsbild i menyn', materials: 'bordsmaterial', source: 'källmaterial'} as Record<string, string>)[parts[2]] ?? 'material'} (${id})`;
    case 'scene-work': return `arbetsmaterial för scenen (${id})`;
    case 'frames': return `rutor ur V6-filmen (${id})`;
    case 'sources': return `${w}källbilder till ankare (${id})`;
    case 'sequences': return `${w}en hel runda i rutor (${id})`;
    case 'lab': return `labbets bakgrundsbild (${id})`;
    case 'props': return `3D-föremål på bordet (${id})`;
    case 'reference': return `referensbild (${id})`;
    case 'v6': return `V6-filmen, Jakobs visuella referens (${id})`;
    case 'verification': return 'kontrollrutor från tools/verify.ts';
    default: return id;
  }
}

/** The takes a dealer's bank plays, by take id, with why. */
export function playedTakes(data: BankData, dealers: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const dealer of dealers) {
    const g = buildGraph(data, {dealer});
    for (const e of [...g.edges, ...g.experiments]) {
      const say = (t: Take | null | undefined, why: string) => { if (t && playable(t) && !out.has(t.id)) out.set(t.id, `${why} (${e.id}, buildGraph för ${dealer})`); };
      say(e.main, 'huvudtagning');
      for (const t of e.variants) say(t, 'variant');
      for (const t of e.takes.filter(t => t.hub)) say(t, 'variant-start');
      if (e.id === 'IDLE>IDLE') for (const t of e.takes.filter(t => t.idle && (t.idle.weight > 0 || t.idle.onRequest))) say(t, t.motion?.speech ? `talfilm, repliken ${String((t.motion.speech as {line?: string}).line ?? '')}` : t.idle!.onRequest ? 'vila på begäran' : `vila med vikt ${t.idle!.weight}`);
    }
  }
  return out;
}

// Jakob's own verdict on a take, if he gave one.
export const judgedBy = (review: {userReview?: unknown; userAccepted?: unknown; provisional?: unknown} | undefined | null): string | null =>
  review && (typeof review.userReview === 'string' && review.userReview.trim() || review.userAccepted === true) ? 'Jakob' : null;

/** Claims from Material's register, entry by entry. */
export function roleClaims(roles: {dealers?: Record<string, {entries?: Record<string, unknown>[]}>}, played: Set<string>): Claim[] {
  const out: Claim[] = [];
  for (const [dealer, d] of Object.entries(roles?.dealers ?? {})) for (const e of d.entries ?? []) {
    const p = typeof e.path === 'string' ? e.path : null, role = String(e.role), state = e.state as string | undefined, at = `data/media-roles.json ${dealer} ${String(e.id)}`;
    if (typeof e.proof === 'string') out.push({path: `assets/proofs/${e.proof}`, use: 'bara registrerad', why: `${at} (roll prov)`});
    if (!p) continue;
    const clip = /^assets\/motions\/([^/]+)\//.exec(p)?.[1];
    if (role === 'referens') out.push({path: p, use: 'referens', why: `${at} (roll referens)`});
    else if (state === 'ersatt') out.push({path: p, use: 'bara registrerad', why: `${at} (${role}, ersatt)`});
    else if (role === 'film') out.push({path: p, use: clip && played.has(clip) ? 'spelas' : 'bara registrerad', why: `${at} (roll film${typeof e.note === 'string' ? ': ' + e.note.slice(0, 60) : ''})`});
    else if (role === 'arbetsmaterial') out.push({path: p, use: 'bara registrerad', why: `${at} (arbetsmaterial)`});
    else out.push({path: p, use: 'visas', why: `${at} (${role}${state ? ', ' + state : ''})`});
  }
  return out;
}

/** Path strings a text names under assets/ or output/. */
export function pathsIn(text: string): string[] {
  return [...new Set((text.replace(/\\/g, '/').match(/(?:assets|output)\/[A-Za-z0-9_.\-/]+/g) ?? []).map(s => s.replace(/[.,/]+$/, '')))];
}

/** The ids a text names exactly: bounded on both sides, so that trailer-noir is not found inside trailer-noir-3 (nor
 *  paow-runda inside paow-runda-6-…). An id of fewer than six characters without a hyphen is too plain a word to count. */
export function idsNamed(text: string, ids: string[]): string[] {
  return ids.filter(id => (id.length >= 6 || id.includes('-')) && new RegExp(`(?<![A-Za-z0-9_-])${id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?![A-Za-z0-9_-])`).test(text));
}
// The documents and instructions whose naming of a thing makes it living work (shown), whatever kind of unit it is.
export const DOCUMENTS = ['HANDOFF.md', 'README.md', 'AGENTS.md', 'docs/*.md', 'tools/*.md', '.claude/skills/*/SKILL.md', 'dealer3d/LASMIG.md'];

// ── Reading (not pure) ──────────────────────────────────────────────────────
function filesUnder(root: string, rel: string, out: FileInfo[] = []): FileInfo[] {
  let ents; try { ents = readdirSync(path.join(root, rel), {withFileTypes: true}); } catch { return out; }
  for (const e of ents) {
    const r = `${rel}/${e.name}`;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) filesUnder(root, r, out);
    else if (e.isFile()) { const s = statSync(path.join(root, r)); out.push({path: r, bytes: s.size, mtimeMs: s.mtimeMs}); }
  }
  return out;
}

export function audit(repo: string): {items: Item[]; judged: Map<string, string>} {
  const read = (f: string) => { try { return readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } };
  const json = (f: string) => { try { return JSON.parse(read(f)); } catch { return null; } };
  const units = unitsOf([...filesUnder(repo, 'assets'), ...filesUnder(repo, 'output')]);
  const claims: Claim[] = [];
  // The bank, built as tools/preview.ts clipBank builds it, from the files on disk.
  const jobsFile = json('data/clip-jobs.json') ?? {}, list = (v: unknown) => (Array.isArray(v) ? v : []) as {id: string; clip?: string; source?: {clip?: string}}[];
  const jobs = list(jobsFile.jobs), derived = list(jobsFile.derived), edits = list(jobsFile.edits);
  const motions: Record<string, never> = {}, receipts: Record<string, never> = {}, media: Record<string, {video: string | null}> = {}, judged = new Map<string, string>();
  for (const t of [...jobs, ...edits, ...derived]) {
    const m = json(`motions/${t.id}.json`), clip = t.clip ?? t.id;
    if (m) { motions[t.id] = m as never; if (judgedBy(m.review)) judged.set(t.id, `motions/${t.id}.json review (${m.review.decision ?? ''})`); }
    const r = json(`assets/motions/${t.id}/generation.json`); if (r) receipts[t.id] = r as never;
    media[t.id] = {video: existsSync(path.join(repo, `assets/motions/${clip}/source.mp4`)) ? `assets/motions/${clip}/source.mp4` : null};
  }
  for (const f of readdirSync(path.join(repo, 'motions')).filter(f => f.endsWith('.json'))) {
    const m = json(`motions/${f}`), id = f.slice(0, -5);
    if (m && judgedBy(m.review) && !judged.has(id)) judged.set(id, `motions/${f} review (${m.review.decision ?? ''})`);
  }
  const data = {jobs, derived, edits, motions, receipts, media} as unknown as BankData;
  const dealers = [...new Set([...Object.values(dealersOf(data as never)), ...list(json('data/dealers.json')?.dealers).map(d => d.id)])];
  const played = playedTakes(data, dealers), clipOf = new Map(derived.map(d => [d.id, String(d.clip)]));
  const playedClips = new Set<string>();
  for (const [id, why] of played) { const clip = clipOf.get(id) ?? id; playedClips.add(clip); claims.push({path: `assets/motions/${clip}/source.mp4`, use: 'spelas', why: `${id}: ${why}`}); claims.push({path: `assets/tracking/${clip}/card-track.json`, use: 'visas', why: `kortspåret för ${id}, som spelas`}); }
  // Pictures a playing film starts or ends on are its sources.
  for (const t of [...jobs, ...derived] as {id: string; first?: {file?: {path?: string}}; last?: {file?: {path?: string}}}[]) for (const ref of [t.first, t.last]) {
    const p = ref?.file?.path; if (typeof p === 'string') claims.push({path: p, use: played.has(t.id) ? 'referens' : 'bara registrerad', why: `data/clip-jobs.json ${t.id} ${ref === t.first ? 'first' : 'last'}.file`});
  }
  for (const t of [...jobs, ...edits, ...derived]) if (!played.has(t.id)) claims.push({path: `assets/motions/${t.clip ?? t.id}`, use: 'bara registrerad', why: `data/clip-jobs.json ${t.id} (${String((motions[t.id] as {review?: {decision?: string}} | undefined)?.review?.decision ?? 'ingen dom')}, spelas inte)`});
  for (const f of readdirSync(path.join(repo, 'motions')).filter(f => f.endsWith('.json'))) for (const p of pathsIn(read(`motions/${f}`))) claims.push({path: p, use: 'bara registrerad', why: `motions/${f}`});
  // Mouth patches the game lays on its films.
  for (const p of list(json('data/speech-patches.json')?.patches) as {path?: string; film?: string; id: string}[]) if (p.path && p.film && playedClips.has(/assets\/motions\/([^/]+)\//.exec(p.film)?.[1] ?? '')) claims.push({path: p.path, use: 'spelas', why: `data/speech-patches.json ${p.id}`});
  else if (p.path) claims.push({path: p.path, use: 'bara registrerad', why: `data/speech-patches.json ${p.id} (filmen spelas inte)`});
  // What the game's own code loads, and the lab's backdrops.
  for (const f of readdirSync(path.join(repo, 'src')).filter(f => /^(game|scene3d)[-a-z0-9]*\.ts$/.test(f) && !f.includes('test'))) for (const p of pathsIn(read(`src/${f}`))) if (!p.includes('$')) claims.push({path: p, use: 'spelas', why: `src/${f} laddar den`});
  for (const p of pathsIn(read('src/placement-model.ts'))) claims.push({path: p, use: 'visas', why: 'src/placement-model.ts (labbets bakgrund)'});
  // Material.
  claims.push(...roleClaims(json('data/media-roles.json'), playedClips));
  // Orders: a folder per order record.
  for (const f of readdirSync(path.join(repo, 'data/orders')).filter(f => f.endsWith('.json'))) claims.push({path: `assets/orders/${f.slice(0, -5)}`, use: 'visas', why: `data/orders/${f}`});
  // The scene: rooms, materials, props.
  for (const f of ['data/scene-rooms.json', 'data/scene-materials.json', 'data/props.json', 'data/scene-contract.json']) for (const p of pathsIn(read(f))) claims.push({path: p, use: 'visas', why: f});
  // Speech working folders: what data/speech.json and data/lipsync.json name.
  for (const f of ['data/speech.json', 'data/lipsync.json']) for (const p of pathsIn(read(f))) claims.push({path: p, use: 'visas', why: f});
  for (const u of units.filter(u => /^assets\/speech\/[^/]+\/[^/]+$/.test(u.path) && !u.path.endsWith('/patches'))) {
    const id = u.path.split('/').at(-1)!, take = id.startsWith('bank-') ? id.slice(5) : id;
    claims.push({path: u.path, use: playedClips.has(take) ? 'visas' : 'bara registrerad', why: playedClips.has(take) ? `talfilmen ${take} spelas` : `talets arbetsmapp för ${take}, som inte spelas`});
  }
  // The rules' references: V6, the manifest, evidence, the library.
  for (const f of ['data/manifest.json', 'data/library.json']) for (const p of pathsIn(read(f))) claims.push({path: p, use: 'referens', why: f});
  for (const f of readdirSync(path.join(repo, 'evidence')).filter(f => f.endsWith('.json'))) for (const p of pathsIn(read(`evidence/${f}`))) claims.push({path: p, use: 'referens', why: `evidence/${f}`});
  for (const t of ['tools/render.ts', 'tools/verify.ts']) for (const p of pathsIn(read(t))) if (p.startsWith('output/')) claims.push({path: p, use: 'referens', why: `${t} (V6)`});
  if (read('tools/verify.ts').includes('frames.json')) claims.push({path: 'output/verification/frames.json', use: 'referens', why: 'tools/verify.ts skriver och läser kontrollrutorna'});
  // Anything Beslut, the release, a document or an instruction names by its exact id is living work; a proof also when it changed today.
  const list2 = (dir: string, test: (f: string) => boolean) => { try { return readdirSync(path.join(repo, dir)).filter(test).map(f => `${dir}/${f}`); } catch { return []; } };
  const skills = list2('.claude/skills', () => true).map(d => `${d}/SKILL.md`).filter(f => existsSync(path.join(repo, f)));
  const docNames = ['data/decisions.json', 'data/studio-release.json', 'HANDOFF.md', 'README.md', 'AGENTS.md', ...list2('docs', f => f.endsWith('.md')), ...list2('tools', f => f.endsWith('.md')), ...skills, 'dealer3d/LASMIG.md'];
  const byId = new Map<string, string[]>();
  for (const u of units) { const id = u.path.split('/').at(-1)!; byId.set(id, [...(byId.get(id) ?? []), u.path]); }
  for (const name of docNames) { const text = read(name); if (!text) continue;
    for (const id of idsNamed(text, [...byId.keys()])) for (const p of byId.get(id)!) claims.push({path: p, use: 'visas', why: `${name} nämner ${id}`}); }
  const today = new Date().toISOString().slice(0, 10);
  for (const u of units.filter(u => u.top === 'assets/proofs')) claims.push(u.changed >= today ? {path: u.path, use: 'visas', why: 'ändrat i dag'} : {path: u.path, use: 'bara registrerad', why: `${u.path}/proof.json (Granskas Prov listar mappen)`});
  // Every other register that names a path.
  for (const f of readdirSync(path.join(repo, 'data')).filter(f => f.endsWith('.json'))) for (const p of pathsIn(read(`data/${f}`))) claims.push({path: p, use: 'bara registrerad', why: `data/${f}`});
  for (const f of readdirSync(path.join(repo, 'placements')).filter(f => f.endsWith('.json'))) for (const p of pathsIn(read(`placements/${f}`))) claims.push({path: p, use: 'visas', why: `placements/${f}`});
  // The lab's props and the table's material versions are named by id, not by path (src/props-lab.ts assets/props/${id}.glb;
  // tools/preview.ts serves assets/scene/materials/ by pattern for the versions data/scene-materials.json lists).
  for (const [f, top] of [['data/props.json', 'assets/props/'], ['data/scene-materials.json', 'assets/scene/materials/'], ['data/scene-rooms.json', 'assets/scene/']] as const) {
    const text = read(f);
    for (const u of units.filter(u => u.path.startsWith(top) && !u.path.includes('/source/'))) {
      // the menu's pictures are thumbs/room-<room id>.jpg
      const stem = u.path.split('/').at(-1)!.replace(/(-diffuse|-nor_gl|-rough|\.receipt)?\.[a-z0-9]+$/, '').replace(/^room-/, '');
      if (stem.length > 2 && new RegExp(`["/]${stem.replace(/[.-]/g, '\\$&')}["._/-]`).test(text)) claims.push({path: u.path, use: 'visas', why: `${f} nämner ${stem}`});
    }
  }
  // Sources named by file name: the Meshy models behind the props and the pictures behind the rooms.
  for (const [f, use] of [['data/props.json', 'referens'], ['data/scene-rooms.json', 'referens'], ['data/scene-materials.json', 'referens']] as const) {
    const text = read(f);
    for (const u of units.filter(u => /^assets\/(props|scene)\/source\//.test(u.path))) if (text.includes(u.path.split('/').at(-1)!.replace(/\.[a-z0-9]+$/, ''))) claims.push({path: u.path, use, why: `${f} nämner källan`});
  }
  // A unit nothing has claimed by path may still be named by its id in a register.
  const named = new Set(claims.flatMap(c => unitsClaimed(c.path, new Map(units.map(u => [u.path, u])))));
  const registers: [string, string][] = [...readdirSync(path.join(repo, 'data')).filter(f => f.endsWith('.json')).map(f => [`data/${f}`, read(`data/${f}`)] as [string, string]),
    ...readdirSync(path.join(repo, 'evidence')).filter(f => f.endsWith('.json')).map(f => [`evidence/${f}`, read(`evidence/${f}`)] as [string, string])];
  for (const u of units.filter(u => !named.has(u.path))) {
    const id = u.path.split('/').at(-1)!.replace(/\.[a-z0-9]+$/, ''), hit = id.length > 5 ? registers.find(([, t]) => new RegExp(`["/\`]${id.replace(/[.-]/g, '\\$&')}(?![a-z0-9-])`).test(t)) : undefined;
    if (hit) claims.push({path: u.path, use: hit[0].startsWith('evidence/') ? 'referens' : 'bara registrerad', why: `${hit[0]} nämner ${id}`});
  }
  const items = rank(units, claims).map(i => ({...i, judged: i.top === 'assets/motions' ? judged.get(i.path.split('/')[2]) ?? null : null}));
  return {items, judged};
}

const gb = (b: number) => (b / 1e9).toFixed(2);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--repo'), repo = path.resolve(at >= 0 ? args[at + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const only = args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1))?.replace(/\\/g, '/').replace(/\/+$/, '');
  const {items} = audit(repo), shown = only ? items.filter(i => i.path === only || i.path.startsWith(only + '/')) : items;
  if (args.includes('--json')) console.log(JSON.stringify({repo: repo.replace(/\\/g, '/'), items: shown}, null, 1));
  else {
    for (const use of USES) { const l = shown.filter(i => i.use === use); console.log(`${use.padEnd(17)} ${String(l.length).padStart(5)} st ${gb(l.reduce((s, i) => s + i.bytes, 0)).padStart(7)} GB`); }
    console.log('');
    for (const i of shown) console.log(`${i.use.padEnd(17)} ${gb(i.bytes).padStart(6)} GB  ${i.made}  ${i.path}\n${''.padEnd(37)}${i.what}${i.judged ? '; Jakob har dömt den' : ''}\n${''.padEnd(37)}${i.why.join('; ') || 'inget register nämner den'}`);
  }
}
