// What every folder of the ignored media is, and whether anything uses it. Read only: it writes nothing.
//   node tools/media-audit.ts [--json] [--repo <checkout>] [<folder>]
// <folder> limits the answer to units under it (for example assets/films/intro). --repo reads another checkout's registers and
// media (the default is this one). A unit is the folder that is one thing: one film, one anchor, one order, one proof (UNIT_DEPTH).
//
// Each unit gets one use, the strongest that holds, with the file and field that say so:
//   spelas            the game or the bank plays it: a take that buildGraph (src/clip-graph.ts) makes the main take of a step, a
//                     playable variant or variant start, an idle take with weight or said on request (speech), a mouth patch in
//                     data/speech-patches.json, or a file the game's own code loads (src/game-*.ts, src/scene3d-*.ts)
//   visas             the lab shows it as living work: an anchor, keystone or landing that holds or is a candidate in Material
//                     (data/media-roles.json), an order's folder (data/orders/<id>.json), anything named by its exact id in Beslut,
//                     data/studio-release.json or a document or instruction, a proof changed today, the card track a
//                     played film needs, the scene's rooms, table and
//                     props (data/scene-*.json, data/props.json), the lab's backdrops (src/placement-model.ts)
//   referens          kept by the rules: data/manifest.json, evidence/, a
//                     reference in Material, and the first or last picture of a film that plays
//   bara registrerad  a register names it, but nothing plays it, shows it as living work or builds on it
//   okänd             no register names it
// The logic (units, claims, ranking) is pure; the reading is at the bottom.
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraph, dealersOf, playable, type BankData, type Take} from '../src/clip-graph.ts';
import {planCardQuad, planToFilm} from '../src/card-plan.ts';
import {classify, blobs, outline, centre, YELLOW, BLUE, SHADE, TABLE, TINT, SKIN, type Pt} from '../src/card-track.ts';
import type {PlacementPlan} from '../src/placement-model.ts';
import {execFileSync} from 'node:child_process';
import {stat} from 'node:fs/promises';
import {mediaFileSha256, mediaFileStamp} from './media-roles.ts';
import {MOTIONS_TEXT, motionRegister} from './register-store.ts';
import {writeFileSync} from 'node:fs';

export type Use = 'spelas' | 'visas' | 'referens' | 'bara registrerad' | 'okänd';
export const USES: Use[] = ['spelas', 'visas', 'referens', 'bara registrerad', 'okänd'];
export type FileInfo = {path: string; bytes: number; mtimeMs: number};
export type Unit = {path: string; top: string; bytes: number; files: number; made: string; changed: string};
// A claim: a register or the code says something about one path (a file or a folder).
export type Claim = {path: string; use: Exclude<Use, 'okänd'>; why: string};
export type Item = Unit & {use: Use; why: string[]; what: string; judged?: string | null};

// The depth (in path segments after assets/ or output/) at which a folder is one thing.
export const UNIT_DEPTH: Record<string, number> = {
  anchors: 2, keystones: 2, motions: 2, orders: 2, proofs: 2, sources: 2, tracking: 2, lab: 2, originals: 2, reference: 2,
  films: 3, speech: 3, scene: 3, 'scene-work': 3, props: 2,
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

const DEALERS: Record<string, string> = {paow: 'Paows', petra: 'Petras'};
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
    case 'tracking': return parts.length > 2 && !id.includes('.') ? `kortspåret för filmen ${id}` : `kortdata (${id})`;
    case 'speech': return parts[3] === 'patches' ? `munlapp till en talfilm (${id})` : `${w}talfilmens arbetsmapp: ljud, röst och kvitto (${id})`;
    case 'scene': return `3D-scenens ${({rooms: 'rum', thumbs: 'rumsbild i menyn', materials: 'bordsmaterial', source: 'källmaterial'} as Record<string, string>)[parts[2]] ?? 'material'} (${id})`;
    case 'scene-work': return `arbetsmaterial för scenen (${id})`;
    case 'sources': return `${w}källbilder till ankare (${id})`;
    case 'lab': return `labbets bakgrundsbild (${id})`;
    case 'props': return `3D-föremål på bordet (${id})`;
    case 'reference': return `referensbild (${id})`;
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
    if (!p) continue;
    const clip = /^assets\/motions\/([^/]+)\//.exec(p)?.[1];
    if (role === 'referens') out.push({path: p, use: 'referens', why: `${at} (roll referens)`});
    else if (state === 'ersatt' || state === 'arkiverad') out.push({path: p, use: 'bara registrerad', why: `${at} (${role}, ${state})`});
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
  const posts = motionRegister(repo).posts() as Map<string, any>; // the register of films and takes (tools/register-store.ts)
  for (const t of [...jobs, ...edits, ...derived]) {
    const m = posts.get(t.id), clip = t.clip ?? t.id;
    if (m) { motions[t.id] = m as never; if (judgedBy(m.review)) judged.set(t.id, `${MOTIONS_TEXT} ${t.id} review (${m.review.decision ?? ''})`); }
    const r = json(`assets/motions/${t.id}/generation.json`); if (r) receipts[t.id] = r as never;
    media[t.id] = {video: existsSync(path.join(repo, `assets/motions/${clip}/source.mp4`)) ? `assets/motions/${clip}/source.mp4` : null};
  }
  for (const [id, m] of posts) if (judgedBy(m.review) && !judged.has(id)) judged.set(id, `${MOTIONS_TEXT} ${id} review (${m.review.decision ?? ''})`);
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
  for (const [id, m] of posts) for (const p of pathsIn(JSON.stringify(m))) claims.push({path: p, use: 'bara registrerad', why: `${MOTIONS_TEXT} ${id}`});
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
  // The rules' references: the manifest, evidence.
  for (const f of ['data/manifest.json']) for (const p of pathsIn(read(f))) claims.push({path: p, use: 'referens', why: f});
  for (const f of readdirSync(path.join(repo, 'evidence')).filter(f => f.endsWith('.json'))) for (const p of pathsIn(read(`evidence/${f}`))) claims.push({path: p, use: 'referens', why: `evidence/${f}`});
  // Anything Beslut, the release, a document or an instruction names by its exact id is living work; a proof also when it changed today.
  const list2 = (dir: string, test: (f: string) => boolean) => { try { return readdirSync(path.join(repo, dir)).filter(test).map(f => `${dir}/${f}`); } catch { return []; } };
  const skills = list2('.claude/skills', () => true).map(d => `${d}/SKILL.md`).filter(f => existsSync(path.join(repo, f)));
  const docNames = ['data/decisions.json', 'data/studio-release.json', 'HANDOFF.md', 'README.md', 'AGENTS.md', ...list2('docs', f => f.endsWith('.md')), ...list2('docs/lage', f => f.endsWith('.md')), ...list2('tools', f => f.endsWith('.md')), ...skills, 'dealer3d/LASMIG.md'];
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

// ── Fit: does a picture, a film or a reference fit today's rules? ───────────
// node tools/media-audit.ts --fit [--write]: for every landing and every anchor with a card at a seat, the card found in the
// picture by the films' colours (src/card-track.ts classify) against planCardQuad (src/card-plan.ts, the one rule; never its
// numbers copied); for every deal of the bank with a card track, the track's lying card (restQuad) against the same; for an
// anchor of rest, the hands and the shoe's card against the dealer's held rest image, using data/dealer-standard.json to find them;
// for a reference, which camera (the bank's
// frame size and table edge row of data/scene-contract.json) and so what it can be a reference for. --write keeps the
// answer in data/media-fit.json, which Material reads (tools/media-roles.ts). Jakob's states are never touched.
export type Verdict = 'stämmer' | 'äldre plan' | 'annan kamera' | 'går inte att mäta' | 'avviker';
export type FitRule = {placePx: number; sizeShare: number; handsPx: number};
export type CardMeasure = {distancePx: number; size: number; card: string};
const area = (q: Pt[]) => Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0) / 2);
/** A found card (its outline, film pixels) against the rule's card (film pixels): how far the middles lie, and the size as the square root of the areas. */
export function measureCard(found: Pt[], rule: Pt[], card: string): CardMeasure {
  const a = centre(found), b = centre(rule);
  return {distancePx: Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10, size: Math.round(Math.sqrt(area(found) / area(rule)) * 1000) / 1000, card};
}
export function cardVerdict(m: CardMeasure, rule: FitRule): Verdict { return m.distancePx <= rule.placePx && Math.abs(1 - m.size) <= rule.sizeShare ? 'stämmer' : 'äldre plan'; }
export function cardWords(m: CardMeasure): string {
  const pct = Math.round(Math.abs(1 - m.size) * 100);
  return `Kortet ligger ${Math.round(m.distancePx)} px från platsen ${m.card} och är ${pct === 0 ? 'lika stort som' : `${pct} % ${m.size < 1 ? 'mindre' : 'större'} än`} kortet dagens plan ritar (planCardQuad).`;
}
/** The table's top edge: the first row, from the top, where the felt fills most of the middle of the picture for three rows on end. */
export function edgeRowOf(cls: Uint8Array, w: number, h: number): number | null {
  const x0 = Math.round(w * 0.2), x1 = Math.round(w * 0.8); let run = 0;
  for (let y = Math.round(h * 0.35); y < h; y++) { let n = 0; for (let x = x0; x < x1; x++) { const c = cls[y * w + x]; if (c === TABLE || c === TINT) n++; }
    run = n / (x1 - x0) > 0.6 ? run + 1 : 0; if (run === 3) return y - 2; }
  return null;
}
export type Camera = 'bankens' | 'annan';
/**
 * The camera by the frame's size: the bank's films and anchors are 1764 × 1174; an older, wider camera gave
 * 1762 × 1174 (its cards measure about 1.38 times a real card at the same place), and the old lab's pictures 1536 × 1024. The table's edge row was tried as a second
 * sign and is only reported: on the green anchors the whole background reads as felt, and where the dealer sits in front of
 * the edge the first full row of felt lies about 36 px below the contract's 831.5 (868 on the first dealer's rest frame).
 */
export const cameraOf = (w: number, h: number, bank: {width: number; height: number}): Camera => w === bank.width && h === bank.height ? 'bankens' : 'annan';
/** The card nearest the rule's card in a picture: yellow, blue or shaded yellow pixels around it, the largest piece. */
export function findCard(cls: Uint8Array, w: number, h: number, rule: Pt[], margin = 90): Pt[] | null {
  const xs = rule.map(p => p.x), ys = rule.map(p => p.y), X0 = Math.max(0, Math.floor(Math.min(...xs) - margin)), X1 = Math.min(w - 1, Math.ceil(Math.max(...xs) + margin)), Y0 = Math.max(0, Math.floor(Math.min(...ys) - margin)), Y1 = Math.min(h - 1, Math.ceil(Math.max(...ys) + margin));
  const mask = new Uint8Array(w * h);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const c = cls[y * w + x]; if (c === YELLOW || c === BLUE || c === SHADE) mask[y * w + x] = 1; }
  const [best] = blobs(mask, w, h, 250); return best ? outline(best.pixels, w) : null;
}
/** The skin's box in a region (the hand in its place of the standard), as [x0, y0, x1, y1]. */
export function skinBox(cls: Uint8Array, w: number, h: number, box: number[], grow = 40): number[] | null {
  const mask = new Uint8Array(w * h);
  for (let y = Math.max(0, box[1] - grow); y <= Math.min(h - 1, box[3] + grow); y++) for (let x = Math.max(0, box[0] - grow); x <= Math.min(w - 1, box[2] + grow); x++) if (cls[y * w + x] === SKIN) mask[y * w + x] = 1;
  const [b] = blobs(mask, w, h, 400); return b ? [b.x0, b.y0, b.x1, b.y1] : null;
}
export const boxOff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

function validBox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isInteger)
    && value[0] <= value[2] && value[1] <= value[3];
}

type HandRegions = {leftInPicture?: {box?: unknown}; rightInPicture?: {box?: unknown}};
type RestHands = [number[], number[]];

function restHandsOf(cls: Uint8Array, w: number, h: number, regions: HandRegions | undefined): RestHands | null {
  const leftBox = regions?.leftInPicture?.box, rightBox = regions?.rightInPicture?.box;
  if (!validBox(leftBox) || !validBox(rightBox)) return null;
  const left = skinBox(cls, w, h, leftBox), right = skinBox(cls, w, h, rightBox);
  return left && right ? [left, right] : null;
}

function shoeCardOf(cls: Uint8Array, w: number, h: number, box: unknown): number[] | null {
  if (!validBox(box)) return null;
  const mask = new Uint8Array(w * h);
  for (let y = Math.max(0, box[1]); y <= Math.min(h - 1, box[3]); y++) {
    for (let x = Math.max(0, box[0]); x <= Math.min(w - 1, box[2]); x++) if (cls[y * w + x] === YELLOW) mask[y * w + x] = 1;
  }
  const [card] = blobs(mask, w, h, 100);
  return card ? [card.x0, card.y0, card.x1, card.y1] : null;
}

type Fit = {verdict: Verdict; words: string; measured?: Record<string, unknown>; for?: 'utseende' | 'rörelse' | 'kontroll' | null; usedBy?: string[]};
async function pixels(repo: string, file: string, frame?: number): Promise<{rgb: Uint8Array; w: number; h: number} | null> {
  const abs = path.join(repo, file); if (!existsSync(abs)) return null;
  if (/\.(png|jpe?g|webp)$/i.test(file)) { const sharp = (await import('sharp')).default; const {data, info} = await sharp(abs).removeAlpha().raw().toBuffer({resolveWithObject: true}); return {rgb: new Uint8Array(data), w: info.width, h: info.height}; }
  if (!/\.mp4$/i.test(file)) return null;
  const [w, h] = execFileSync(process.env.FFPROBE ?? 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', abs], {encoding: 'utf8'}).trim().split(',').map(Number);
  const raw = execFileSync(process.env.FFMPEG ?? 'ffmpeg', ['-v', 'error', '-i', abs, '-vf', `select=eq(n\\,${frame ?? 0})`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: w * h * 3 + 1024});
  return raw.length >= w * h * 3 ? {rgb: new Uint8Array(raw.buffer, raw.byteOffset, w * h * 3), w, h} : null;
}

export async function fitAll(repo: string, loadPixels = pixels): Promise<{rule: FitRule; entries: Record<string, Fit>; takes: Record<string, Fit & {approved: boolean; played: boolean}>}> {
  const read = (f: string) => { try { return readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } }, json = (f: string) => { try { return JSON.parse(read(f)); } catch { return null; } };
  const plan = json('placements/default.json') as PlacementPlan, roles = json('data/media-roles.json'), standard = json('data/dealer-standard.json');
  const BANK = {width: 1764, height: 1174, edgeRow: 831.5};
  const rule: FitRule = {placePx: 15, sizeShare: 0.12, handsPx: Number(standard?.hands?.fitTolerancePx?.hands) || 8};
  const ruleCard = (card: string): Pt[] | null => { try { return planCardQuad(plan, card, 'native').map(planToFilm); } catch { return null; } };
  const entries: Record<string, Fit> = {}, takes: Record<string, Fit & {approved: boolean; played: boolean}> = {};
  // The bank's deals with a card track.
  const jobsFile = json('data/clip-jobs.json') ?? {}, all = [...(jobsFile.jobs ?? []), ...(jobsFile.derived ?? []), ...(jobsFile.edits ?? [])] as {id: string; kind?: string; to?: string; clip?: string}[];
  const posts = motionRegister(repo).posts() as Map<string, any>;
  const {items} = audit(repo), playedFolders = new Set(items.filter(i => i.use === 'spelas' && i.top === 'assets/motions').map(i => i.path.split('/')[2]));
  for (const t of all.filter(t => t.kind === 'DEAL' || /\.C\d$/.test(String(t.to)))) {
    const clip = t.clip ?? t.id, track = json(`assets/tracking/${clip}/card-track.json`), card = /(?:P[1-7]|D)\.C[1-3]/.exec(String(t.to))?.[0];
    if (!card || takes[clip]) continue;
    const m = posts.get(t.id), approved = judgedBy(m?.review) === 'Jakob' && /ACCEPTED|APPROVED/.test(String(m?.review?.decision ?? ''));
    const want = ruleCard(card);
    if (!track?.restQuad || !want) { takes[clip] = {verdict: 'går inte att mäta', words: !want ? `Planen har ingen plats ${card}.` : 'Filmen har inget kortspår med ett liggande kort.', approved, played: playedFolders.has(clip)}; continue; }
    const q = (track.restQuad as number[][]).map(([x, y]) => ({x, y})), mm = measureCard(q, want, card);
    takes[clip] = {verdict: cardVerdict(mm, rule), words: cardWords(mm), measured: mm, approved, played: playedFolders.has(clip)};
  }
  // Material's pictures.
  const users = referenceUsers(repo, read);
  for (const [dealer, d] of Object.entries(roles?.dealers ?? {}) as [string, {entries: {id: string; role: string; path?: string; frame?: number; still?: number; card?: string; node?: string; state?: string}[]}][]) {
    const held = d.entries.filter(e => e.role === 'ankare-1' && !e.card && e.state === 'gäller');
    const reference = held.length === 1 ? held[0] : undefined;
    const order = reference ? [reference, ...d.entries.filter(e => e !== reference)] : d.entries;
    let rest: {hands: RestHands | null; shoe: number[] | null; sha256: string} | undefined;
    for (const e of order) {
      if (!['landning', 'ankare-1', 'ankare-2.1', 'ankare-2.2', 'referens', 'arbetsmaterial', 'film'].includes(e.role)) continue;
      if (!e.path) {
        if (e.role.startsWith('ankare')) entries[e.id] = {verdict: 'går inte att mäta', words: 'Ankaret saknar sökväg.'};
        continue;
      }
      if (e.role === 'film') { const clip = /^assets\/motions\/([^/]+)\//.exec(e.path)?.[1], t = clip ? takes[clip] : undefined; if (t) entries[e.id] = {verdict: t.verdict, words: t.words, measured: t.measured}; continue; }
      if (e.role === 'arbetsmaterial') { entries[e.id] = {verdict: 'går inte att mäta', words: 'Övrigt: inget att mäta mot planen.', usedBy: users(e.path)}; continue; }
      const sourceFile = e.role === 'ankare-1' && !e.card ? path.join(repo, e.path) : null;
      const sourceStat = sourceFile ? await stat(sourceFile).catch(() => null) : null;
      const px = await loadPixels(repo, e.path, e.frame ?? e.still).catch(() => null);
      if (!px) { entries[e.id] = {verdict: 'går inte att mäta', words: existsSync(path.join(repo, e.path)) ? 'Bilden gick inte att läsa.' : 'Filen finns inte här.', ...(e.role === 'referens' ? {for: null, usedBy: users(e.path)} : {})}; continue; }
      const cls = classify(px.rgb, px.w * px.h), edge = edgeRowOf(cls, px.w, px.h), camera = cameraOf(px.w, px.h, BANK);
      if (e.role === 'referens') {
        const used = users(e.path), verify = /assets\/(reference|originals)/.test(e.path);
        const forWhat = verify && camera === 'annan' ? 'kontroll' : camera === 'bankens' ? 'rörelse' : 'utseende';
        entries[e.id] = {verdict: camera === 'bankens' ? 'stämmer' : 'annan kamera', for: forWhat, usedBy: used, measured: {width: px.w, height: px.h, edgeRow: edge},
          words: camera === 'bankens' ? `Bankens kamera (${px.w} × ${px.h}, bordskanten på rad ${edge}): duger som referens för rörelse.` : `En annan kamera än bankens (${px.w} × ${px.h}, bordskanten på rad ${edge ?? '?'} mot ${BANK.edgeRow}): en referens för ${forWhat === 'kontroll' ? 'kontroll' : 'utseende'}, inte för mått eller platser.`};
        continue;
      }
      if (camera === 'annan') { entries[e.id] = {verdict: 'annan kamera', words: `Inte bankens ruta (${px.w} × ${px.h}, bordskanten på rad ${edge ?? '?'}).`, measured: {width: px.w, height: px.h, edgeRow: edge}}; continue; }
      const parts: string[] = [], measured: Record<string, unknown> = {}; let verdict: Verdict = 'går inte att mäta';
      if (e.card && /^P[1-7]\.C|^D\.C/.test(e.card)) {
        const want = ruleCard(e.card), found = want ? findCard(cls, px.w, px.h, want) : null;
        if (!want || !found) { verdict = 'går inte att mäta'; parts.push(!want ? `Planen har ingen plats ${e.card}.` : `Inget gult eller blått kort nära ${e.card}.`); }
        else { const mm = measureCard(found, want, e.card); measured.card = mm; verdict = cardVerdict(mm, rule); parts.push(cardWords(mm)); }
      }
      if (e.role === 'ankare-1' && !e.card) {
        const hands = restHandsOf(cls, px.w, px.h, standard?.hands);
        const shoe = shoeCardOf(cls, px.w, px.h, standard?.shoe?.box);
        const sha256 = sourceFile && sourceStat?.isFile() ? await mediaFileSha256(sourceFile, mediaFileStamp(sourceStat)) : null;
        if (e === reference && sha256) rest = {hands, shoe, sha256};
        // Both the measured image and the held calibration image must match the source used for the measurement.
        if (!sha256) {
          parts.push('Bildversionen kunde inte verifieras för handmåttet.');
        } else if (!reference || !rest) {
          parts.push('Handmått saknas för dealerns gällande ankare 1.');
        } else {
          measured.source = {path: e.path, frame: e.frame ?? e.still ?? null, sha256};
          measured.calibration = {
            dealer, role: reference.role, entry: reference.id, path: reference.path,
            frame: reference.frame ?? reference.still ?? null, sha256: rest.sha256,
          };
          const against = `gällande ankare 1 (${reference.id})`;
          if (hands && rest.hands) {
            const left = boxOff(hands[0], rest.hands[0]), right = boxOff(hands[1], rest.hands[1]);
            measured.leftInPicture = left;
            measured.rightInPicture = right;
            verdict = left > rule.handsPx || right > rule.handsPx ? 'avviker' : 'stämmer';
            parts.push(e === reference
              ? `Båda händerna mätta i ${against}, dealerns kalibreringsbild.`
              : `Mätt mot ${against}. Skillnaden i bilden är ${left} px för vänster hand och ${right} px för höger.`);
          } else if (!rest.hands) {
            parts.push(`Båda händerna gick inte att mäta i ${against}.`);
          } else {
            parts.push(`Båda händerna gick inte att mäta mot ${against}.`);
          }
          if (e !== reference && shoe && rest.shoe) {
            const off = boxOff(shoe, rest.shoe);
            measured.shoeOffPx = off;
            if (off > rule.handsPx) {
              if (verdict === 'stämmer') verdict = 'avviker';
              parts.push(`Skons kort ligger ${off} px från kalibreringsbildens.`);
            }
          }
        }
      } else if (e.role.startsWith('ankare') && !e.card) {
        parts.push('Handmått saknas för den här ankarrollen.');
      }
      entries[e.id] = {verdict, words: parts.join(' ') || 'Inget kort på en plats att mäta.', measured};
    }
  }
  return {rule, entries, takes};
}
/** What uses a reference or a working picture today: orders that sent it, the manifest's hashes, the bank's jobs. */
function referenceUsers(repo: string, read: (f: string) => string): (p: string) => string[] {
  // An order's reference film: its reference field (data/orders/<id>.json reference.from.path), not any mention.
  const orders = readdirSync(path.join(repo, 'data/orders')).filter(f => f.endsWith('.json')).map(f => { let r = ''; try { r = JSON.stringify(JSON.parse(read(`data/orders/${f}`)).reference ?? null); } catch {} return [f.slice(0, -5), r] as const; });
  const manifest = read('data/manifest.json'), jobs = read('data/clip-jobs.json'), game = readdirSync(path.join(repo, 'src')).filter(f => /^game/.test(f)).map(f => read(`src/${f}`)).join('\n');
  return (p: string) => {
    const out: string[] = [];
    const sent = orders.filter(([, t]) => t.includes(`"${p}"`)).map(([o]) => o); if (sent.length) out.push(`${sent.length} beställningar skickade den (${sent.slice(0, 3).join(', ')}${sent.length > 3 ? ' …' : ''})`);
    if (manifest.includes(`"${p}"`)) out.push('manifestet, hashen i data/manifest.json (tools/verify.ts)');
    if (jobs.includes(p)) out.push('första eller sista bild i bankens jobb');
    if (game.includes(p)) out.push('spelet laddar den');
    return out;
  };
}

const gb = (b: number) => (b / 1e9).toFixed(2);
if (process.argv.includes('--fit') && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--repo'), repo = path.resolve(at >= 0 ? args[at + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const res = await fitAll(repo);
  if (args.includes('--write')) {
    const out = {schemaVersion: 2, about: 'Whether each picture and film fits today\'s rules: written by node tools/media-audit.ts --fit --write; Material shows it. The card against planCardQuad (src/card-plan.ts), rest hands against the dealer\'s held rest image (search areas in data/dealer-standard.json), a reference by its camera. Jakob\'s states are not touched.',
      made: new Date().toISOString(), rule: res.rule, entries: res.entries, takes: res.takes};
    // --out <file> writes elsewhere (a worktree measuring the main checkout's media); without it, the measured checkout's own data/.
    const target = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(repo, 'data/media-fit.json');
    writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  }
  console.log(JSON.stringify(res, null, 1));
  process.exit(0);
}
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
