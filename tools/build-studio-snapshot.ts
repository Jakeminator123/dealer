// Builds the studio's locked, read-only copy for the internet as a Vercel Build Output tree in
// .runtime/studio-deploy/.vercel/output. It uploads nothing and deploys nothing: tools/sync-studio-media.ts plans the
// upload of the films, and the publish steps are the main agent's, on Jakob's word.
//
//   node tools/build-studio-snapshot.ts           the copy, in .runtime/studio-deploy/.vercel/output
//   node tools/build-studio-snapshot.ts --prov    a trial build, in .runtime/studio-deploy/prov/.vercel/output
//
// With the lab server running on 127.0.0.1:4319 it freezes what the studio reads there: the clip bank, the proofs, the
// placement plan and the scene's presets (every cost and private field taken out, tools/studio-freeze.ts), the 3D scene's
// and the game's modules exactly as the server serves them, and the files they name. What goes up is decided by
// data/studio-release.json: the takes of each dealer it carries (Pamela, and Paow while her switch is on), and for a dealer of
// casino.dealers every take the game can play, her talk films among them. It builds the studio in snapshot mode
// (studio/scripts/build.mjs --snapshot), writes stills as small WebP, and adds the lock: the Routing Middleware of
// cloud/studio/, with the map from each film's address to its object in Vercel Blob. Films and proof files go to Blob,
// everything else is a static file of the deployment. With casino.on the game page goes up too, with the engine of game/
// running in the page (cloud/studio/game-local.ts), since the copy has no server to hold a game. The bot and the request
// inbox are one Node.js function (cloud/studio/bot.ts) with its knowledge beside it (tools/build-knowledge.ts), never a
// static file. It prints a table of what goes up and what was left out.
//
// --lab <address> and --hem <checkout> build the copy of a commit from a checkout of its own (tools/publish-studio.ts does,
// from a worktree of origin/main): the code, the registers and the lab server's answers are that checkout's (its own lab
// server, on another port), while the media (assets/, outside Git) and the copy's state (.runtime/studio-deploy with the
// project's link, .runtime/studio-blob with the store's key and the receipt) are the home checkout's, Jakob's own. Without
// them both are this checkout, and the lab server is the one on 127.0.0.1:4319.
//
// --prov is for learning what breaks while the tree is being worked on: a machine path or a blocked name in a module's code
// is listed instead of stopping the build, and the tree goes to its own folder, which no Vercel project is linked to and
// tools/sync-studio-media.ts will not upload from. Everything else is checked as for the copy.
import {readFile, writeFile, mkdir, rm, realpath, lstat, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {buildGraph, resolveRound, roundSequence, type BankData, type Graph} from '../src/clip-graph.ts';
import {judgedBank} from '../src/game-director.ts';
import {SCRIPTS, VENDOR, SCENE_FILES, PAGES, forBrowser} from './lab-routes.ts';
import {STUDIO_TYPES} from './studio-files.ts';
import {readRelease, releaseDealers, gameTakes, pickTakes, freezeBank, pickProofs, graphShape, roundShape, scrub, findLeaks, findTextLeaks, blockedPath, safeRelative, prefetchAlias, objectName, namedAssets, engineSource, forEngine, copyGamePage, ENGINE_ENTRY, MEDIA_TYPES, type Proof, type Left, type Picked} from './studio-freeze.ts';
import {PRESET_NAME} from '../studio/lib/scene-presets.ts';
import type {MediaMap} from '../cloud/studio/gate.ts';
import {buildKnowledge, BOT_FUNCTION_FILES} from './build-knowledge.ts';
import {knowledgeLeaks} from './knowledge.ts';
import {isBotPath} from '../cloud/studio/bot-routes.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (path.resolve(process.cwd()) !== root) throw Error('Kör från dealer-katalogen.');
const trial = process.argv.includes('--prov');
const option = (name: string) => { const at = process.argv.indexOf(name); if (at < 0) return null; const value = process.argv[at + 1]; if (!value || value.startsWith('--')) throw Error(`${name} saknar värde.`); return value; };
const LAB = option('--lab') ?? 'http://127.0.0.1:4319';
if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(LAB)) throw Error('--lab ska vara http://127.0.0.1:<port>.');
// The home checkout: its assets/ are the media, its .runtime/ holds the copy's state. A folder of its own, never a link.
const home = path.resolve(option('--hem') ?? root);
if (!existsSync(path.join(home, 'assets')) || !existsSync(path.join(home, 'data', 'studio-release.json'))) throw Error(`--hem är ingen utcheckning av dealer med media: ${home}`);
const deployName = trial ? '.runtime/studio-deploy/prov' : '.runtime/studio-deploy';
const deploy = path.join(home, ...deployName.split('/'));
const output = path.join(deploy, '.vercel', 'output');
const staticRoot = path.join(output, 'static');
const middlewareRoot = path.join(output, 'functions', '_middleware.func');
// The bot and the request inbox: one Node.js function (cloud/studio/bot-function.ts) with the knowledge beside it.
const botRoot = path.join(output, 'functions', 'api', 'bot.func');
// The export of studio/scripts/build.mjs --snapshot (studio/next.config.ts SNAPSHOT_OUT).
const studioOut = path.join(root, '.runtime', 'studio-snapshot', 'out');

// ── One fixed, disposable output tree, never reached through a link ─────────
if (output !== path.resolve(home, `${deployName}/.vercel/output`)) throw Error('Unsafe build output.');
const realRoot = await realpath(root), realHome = await realpath(home);
await mkdir(path.dirname(output), {recursive: true});
if (await realpath(deploy) !== path.join(realHome, ...deployName.split('/'))) throw Error('Linked studio build directory.');
if (await realpath(path.dirname(output)) !== path.join(realHome, ...deployName.split('/'), '.vercel')) throw Error('Linked Vercel output parent.');
// A trial tree never sits where a Vercel project could be linked (.vercel/project.json is written by `vercel link`).
if (trial && existsSync(path.join(deploy, '.vercel', 'project.json'))) throw Error('Provbyggets mapp är länkad till ett Vercel-projekt; ta bort länken först.');
if ((await lstat(output).catch(() => null))?.isSymbolicLink()) throw Error('Linked studio build output.');
await rm(output, {recursive: true, force: true});
// A real build makes an earlier trial build worthless, and nothing but the copy itself is to lie beside the deploy.
if (!trial) await rm(path.join(deploy, 'prov'), {recursive: true, force: true});
await mkdir(staticRoot, {recursive: true});

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const MB = (bytes: number) => (bytes / 1e6).toFixed(1).replace('.', ',');

// ── Reading: the register, the lab server, local files ──────────────────────
const release = readRelease(JSON.parse(await readFile(path.join(root, 'data/studio-release.json'), 'utf8')));

async function lab(pathname: string): Promise<Buffer> {
  const response = await fetch(LAB + pathname, {signal: AbortSignal.timeout(30000)}).catch(() => null);
  if (!response) throw Error(`Labbservern svarar inte (${pathname}). Starta den med START.cmd.`);
  if (!response.ok) throw Error(`Labbservern svarade ${response.status} på ${pathname}.`);
  return Buffer.from(await response.arrayBuffer());
}
const health = JSON.parse((await lab('/health')).toString('utf8'));
const same = (a: unknown, b: string) => typeof a === 'string' && (process.platform === 'win32' ? path.resolve(a).toLowerCase() === b.toLowerCase() : path.resolve(a) === b);
if (health?.name !== 'dealer' || !same(health.root, root)) throw Error(`Labbservern på ${LAB} är inte den här utcheckningens.`);

/**
 * A file of the checkout that really lies where its path says (no link along the way), or null. Media (assets/) are the home
 * checkout's, everything else this checkout's.
 */
async function localFile(relative: string): Promise<string | null> {
  if (!safeRelative(relative)) return null;
  const [base, realBase] = relative.startsWith('assets/') ? [home, realHome] : [root, realRoot];
  const wanted = path.join(realBase, ...relative.split('/'));
  const real = await realpath(path.join(base, relative)).catch(() => null);
  if (real !== wanted) return null;
  return (await stat(real).catch(() => null))?.isFile() ? real : null;
}

// ── Writing: static files and the plan for Blob ─────────────────────────────
type Written = {path: string; bytes: number; sha256: string; group: string};
const written: Written[] = [];
async function emit(relative: string, content: Buffer | string, group: string) {
  if (!safeRelative(relative)) throw Error(`Unsafe output path: ${relative}`);
  const rule = blockedPath(relative, release);
  if (rule) throw Error(`Spärrad sökväg (${rule}): ${relative}`);
  if (written.some(w => w.path === relative)) throw Error(`Written twice: ${relative}`);
  const file = path.join(staticRoot, ...relative.split('/'));
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, content);
  written.push({path: relative, bytes: Buffer.byteLength(content), sha256: digest(content), group});
}
const json = (value: unknown) => JSON.stringify(value);

type BlobFile = {path: string; source: string; sha256: string; bytes: number; type: string; object: string; group: string};
const blob = new Map<string, BlobFile>();
const GROUP_RANK = ['runda', 'godkänd', 'variant', 'spel', 'väntar', 'scen', 'prov'];
async function toBlob(relative: string, group: string) {
  const rule = blockedPath(relative, release);
  if (rule) throw Error(`Spärrad sökväg (${rule}): ${relative}`);
  const have = blob.get(relative);
  if (have) { if (GROUP_RANK.indexOf(group) < GROUP_RANK.indexOf(have.group)) have.group = group; return; }
  const source = await localFile(relative);
  if (!source) throw Error(`Filen finns inte här (eller nås genom en länk): ${relative}`);
  const bytes = await readFile(source), type = MEDIA_TYPES[path.extname(relative).toLowerCase()];
  if (!type) throw Error(`Okänd filtyp: ${relative}`);
  const sha256 = digest(bytes);
  blob.set(relative, {path: relative, source: relative, sha256, bytes: bytes.length, type, object: objectName(sha256, relative), group});
}
async function copyStatic(relative: string, group: string) {
  const source = await localFile(relative);
  if (!source) throw Error(`Filen finns inte här (eller nås genom en länk): ${relative}`);
  await emit(relative, await readFile(source), group);
}

// ── The clip bank: which takes, their films, stills and card tracks ─────────
// The server fills the bank's records as its reads finish, so the order of keys differs between two answers with the same
// content: the bank is compared, and hashed, with its keys sorted.
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : value;
const bankRead = async () => JSON.stringify(canonical(JSON.parse((await lab('/api/clip-bank')).toString('utf8'))));
const bankText = await bankRead();
const bank = JSON.parse(bankText) as BankData & Record<string, unknown>;
const roundSteps = roundSequence({seats: release.round.seats, reveal: release.round.reveal});
// Each dealer of the copy on her own graph (buildGraph keeps one dealer's takes), as the studio's dealer switch shows her.
const dealers = releaseDealers(release);
type DealerPart = {graph: Graph; round: ReturnType<typeof resolveRound>; game: Set<string>; picked: Picked[]; left: Left[]};
const parts = new Map<string, DealerPart>();
for (const dealer of dealers) {
  const graph = buildGraph(bank, {dealer}), round = resolveRound(graph, roundSteps, {holeCardDown: release.round.holeCardDown});
  const game = release.casino.on && release.casino.dealers.includes(dealer) ? gameTakes(bank, dealer) : new Set<string>();
  const out = pickTakes(graph, round, release, game);
  if (out.refused.length) throw Error(`Registret väljer spärrade tagningar: ${out.refused.map(r => `${r.id} (${r.why})`).join(', ')}`);
  parts.set(dealer, {graph, round, game, picked: out.picked, left: out.left});
}
// The takes of every dealer the copy carries; a take of a dealer it does not carry is named, with the reason.
const takes = {picked: [...parts.values()].flatMap(p => p.picked), left: [...parts.values()].flatMap(p => p.left)};
const carried = new Set([...parts.values()].flatMap(p => Object.keys(p.graph.takes)));
for (const job of [...(bank.jobs ?? []), ...(bank.derived ?? []), ...(bank.edits ?? [])]) if (!carried.has(job.id)) takes.left.push({id: job.id, why: 'dealern följer inte med kopian'});
const shown = new Map<string, string>(); // a lab path of the bank to the copy's path
const clipMedia = /^assets\/motions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(source\.mp4|source-reversed\.mp4|first\.png|last\.png)$/;
const trackMedia = /^assets\/tracking\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(card-track\.json|overrides\.json)$/;
const stills = new Map<string, string>(); // png → webp, made below
for (const {id, group} of takes.picked) {
  const m = [...parts.values()].find(p => p.graph.takes[id])!.graph.takes[id].media;
  for (const film of [m.video, m.reversed]) if (film) {
    if (!clipMedia.test(film)) throw Error(`Oväntad filmväg för ${id}: ${film}`);
    await toBlob(film, group); shown.set(film, film);
  }
  for (const still of [m.first, m.last]) if (still) {
    if (!clipMedia.test(still)) throw Error(`Oväntad bildväg för ${id}: ${still}`);
    const webp = still.replace(/\.png$/, '.webp'); stills.set(still, webp); shown.set(still, webp);
  }
  for (const track of [m.track, m.overrides]) if (track) {
    const t = trackMedia.exec(track); if (!t) throw Error(`Oväntad spårväg för ${id}: ${track}`);
    shown.set(track, track);
    // The lab page's other way to place the card (scene3d-ui followTrack, ?spar=grepp) reads a grip track beside it.
    const grip = `assets/tracking/${t[1]}/card-track-grip.json`;
    if (await localFile(grip)) shown.set(grip, grip);
  }
}
for (const [png, webp] of stills) {
  const source = await localFile(png);
  if (!source) throw Error(`Stillbilden finns inte här: ${png}`);
  const buffer = await sharp(await readFile(source)).resize({width: release.stills.width, withoutEnlargement: true}).webp({quality: release.stills.quality}).toBuffer();
  await emit(webp, buffer, 'stillbilder');
}
// Card tracks name the tools that made them by their path on this machine: they go up scrubbed like every answer.
for (const [from, to] of shown) if (/\.json$/.test(to) && from === to) {
  const file = await localFile(to); if (!file) throw Error(`Saknas: ${to}`);
  await emit(to, JSON.stringify(scrub(JSON.parse(await readFile(file, 'utf8')), release)), 'kortspår');
}

const pickedIds = new Set(takes.picked.map(p => p.id));
const frozenBank = freezeBank(bank, shown, pickedIds, release, digest);
// The copy must decide as the lab does, for each dealer: every edge's main take, variants and status, the round frame by
// frame, and the same for the game's own bank (only takes with a verdict). Every film of the round and every take the game
// can play goes up.
const judgedLive = judgedBank(bank), judgedFrozen = judgedBank(frozenBank);
for (const [dealer, part] of parts) {
  const frozenGraph = buildGraph(frozenBank, {dealer});
  const frozenRound = resolveRound(frozenGraph, roundSteps, {holeCardDown: release.round.holeCardDown});
  if (json(graphShape(frozenGraph)) !== json(graphShape(part.graph))) throw Error(`Den frysta klippbanken ger en annan graf än labbet (${dealer}).`);
  if (json(roundShape(frozenRound)) !== json(roundShape(part.round))) throw Error(`Den frysta klippbanken spelar rundan annorlunda än labbet (${dealer}).`);
  for (const s of frozenRound) if (s.video && !blob.has(s.video)) throw Error(`Rundans film går inte upp (${dealer}): ${s.video}`);
  if (!part.game.size) continue;
  if (json(graphShape(buildGraph(judgedFrozen, {dealer}))) !== json(graphShape(buildGraph(judgedLive, {dealer})))) throw Error(`Spelets klippbank ger en annan graf i kopian än i labbet (${dealer}).`);
  for (const id of part.game) { const video = frozenGraph.takes[id]?.media.video; if (!video || !blob.has(video)) throw Error(`En film spelet kan spela går inte upp (${dealer}): ${id}`); }
}
const frozenGraph = buildGraph(frozenBank);

// ── Proofs ──────────────────────────────────────────────────────────────────
const proofsText = (await lab('/api/proofs')).toString('utf8');
const allProofs = (JSON.parse(proofsText) as {proofs: Proof[]}).proofs;
const raw = new Map<string, string>();
for (const p of allProofs) { const file = await localFile(`assets/proofs/${p.id}/proof.json`); raw.set(p.id, file ? await readFile(file, 'utf8') : ''); }
const proofs = pickProofs(allProofs, raw, release);
if (proofs.refused.length) throw Error(`Registret väljer prov som inte får gå upp: ${proofs.refused.map(r => `${r.id} (${r.why})`).join(', ')}`);
for (const proof of proofs.proofs) for (const file of proof.files) {
  if (!/^assets\/proofs\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.(?:mp4|png)$/i.test(file.path)) throw Error(`Oväntad provfil: ${file.path}`);
  await toBlob(file.path, 'prov');
}

// ── The 3D scene's modules, exactly as the lab server serves them ───────────
// Roots: the scene and its room register, and every module the studio's own code loads with labModule("…").
const studioSource = async function* (dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') yield* studioSource(full);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) yield await readFile(full, 'utf8');
  }
};
// With the game: its page's module, and the engine that answers the page's /api/game in the copy (tools/studio-freeze.ts).
const roots = new Set(['/scene3d-view.js', '/scene3d-room.js', ...(release.casino.on ? ['/game-page.js', ENGINE_ENTRY] : [])]);
const asked = new Set<string>();
for (const folder of ['app', 'components', 'lib']) for await (const text of studioSource(path.join(root, 'studio', folder))) {
  for (const m of text.matchAll(/labModule(?:<[^>]*>)?\(\s*["']([a-z0-9-]+)(?:\.js)?["']/g)) roots.add(`/${m[1]}.js`);
  for (const m of text.matchAll(/["'`]\/?((?:api|data)\/[a-z0-9._/-]+)["'`]/g)) asked.add(m[1]);
}
const allowedMaterials = new Set((JSON.parse(await readFile(path.join(root, 'data/manifest.json'), 'utf8')).files as {path: string}[]).map(f => f.path).filter(p => p.startsWith('materials/')));
const resolveSpecifier = (spec: string, from: string): string | null => {
  if (spec === 'three') return '/vendor/three.module.js';
  if (spec.startsWith('three/addons/')) return '/vendor/' + spec.slice('three/addons/'.length);
  if (/^(?:\.{1,2}\/|\/)/.test(spec)) return new URL(spec, 'http://copy' + from).pathname;
  return null;
};
const moduleFiles = new Map<string, string>(); // address → text
const queue = [...roots];
const named = new Set<string>(); // files of the checkout the modules name by a plain path (tools/studio-freeze.ts namedAssets)
while (queue.length) {
  const address = queue.shift()!;
  if (moduleFiles.has(address)) continue;
  let expected: string;
  // The engine's modules are the copy's own (the lab runs game/ in its server): made ready here, not compared with the lab.
  const engine = engineSource(address);
  if (engine) { const file = await localFile(engine); if (!file) throw Error(`Spelmotorns modul saknas: ${engine}`); expected = forEngine(forBrowser(await readFile(file, 'utf8')), address); }
  else if (SCRIPTS[address]) expected = forBrowser(await readFile(path.join(root, SCRIPTS[address]), 'utf8'));
  else if (VENDOR[address]) expected = await readFile(path.join(root, VENDOR[address]), 'utf8');
  else if (allowedMaterials.has(address.slice(1))) { const file = await localFile(address.slice(1)); if (!file) throw Error(`Modulen saknas: ${address}`); expected = await readFile(file, 'utf8'); }
  else throw Error(`Modulen ${address} hör inte till labbservern (tools/lab-routes.ts).`);
  if (!engine) {
    const served = (await lab(address)).toString('utf8');
    if (served !== expected) throw Error(`Labbservern serverar ${address} annorlunda än tools/lab-routes.ts gör: kartorna har glidit isär.`);
  }
  moduleFiles.set(address, expected);
  for (const m of expected.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]+?from\s*)?(['"])([^'"\n]+)\1/g)) { const next = resolveSpecifier(m[2], address); if (next) queue.push(next); else throw Error(`${address} importerar ${m[2]}, som kopian inte kan lösa.`); }
  for (const m of expected.matchAll(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g)) { const next = resolveSpecifier(m[2], address); if (next) queue.push(next); else throw Error(`${address} importerar ${m[2]}, som kopian inte kan lösa.`); }
  for (const file of namedAssets(expected)) named.add(file);
}
for (const [address, text] of moduleFiles) await emit(address.slice(1), text, address.startsWith('/vendor/') || address.startsWith('/materials/') ? 'three.js' : address.startsWith('/engine/') ? 'spelmotorn' : 'scenens moduler');

// ── The scene's files and data ──────────────────────────────────────────────
const frozenJson = async (relative: string, transform: (value: any) => unknown = v => v) => {
  const file = await localFile(relative); if (!file) throw Error(`Saknas: ${relative}`);
  return scrub(transform(JSON.parse(await readFile(file, 'utf8'))), release);
};
const rooms = await frozenJson('data/scene-rooms.json', register => ({...register, rooms: register.rooms.map(({source, ...room}: Record<string, unknown>) => room)}));
const dataFiles: Record<string, unknown> = {'data/scene-contract.json': await frozenJson('data/scene-contract.json'), 'data/scene-rooms.json': rooms};
for (const relative of SCENE_FILES) if (!(relative in dataFiles)) await copyStatic(relative, 'scenens filer');
for (const room of (rooms as {rooms: {id: string; file: string}[]}).rooms) {
  if (!SCENE_FILES.includes(room.file)) await copyStatic(room.file, 'scenens filer');
  const thumb = `assets/scene/thumbs/room-${room.id}.jpg`;
  if (!SCENE_FILES.includes(thumb) && await localFile(thumb)) await copyStatic(thumb, 'scenens filer');
}
// The files the modules name by their own path (V6's cloth, a room's live film, the trays, a dealer's picture in the game's
// menu): what the lab server hands out goes up, a film to Blob and the rest as a static file; what it does not hand out (a
// file of another tool, or not on this machine) is named and left out.
const namedLeft: string[] = [];
// The media are the home checkout's: built from another checkout, whether a medium is handed out is asked of the home's own lab
// server (a HEAD only, when it answers as that checkout's), since the other one reaches the media through a junction and hands
// out no medium that lies outside its own folder (tools/media-roles.ts).
const HOME_LAB = 'http://127.0.0.1:4319';
const homeHealth = home === root ? null : await fetch(`${HOME_LAB}/health`, {signal: AbortSignal.timeout(3000)}).then(r => r.ok ? r.json() : null, () => null);
const mediaLab = homeHealth?.name === 'dealer' && same(homeHealth.root, realHome) ? HOME_LAB : LAB;
const labServes = async (relative: string) => (await fetch(`${relative.startsWith('assets/') ? mediaLab : LAB}/${relative}`, {method: 'HEAD', signal: AbortSignal.timeout(30000)}).catch(() => null))?.ok === true;
for (const relative of named) {
  if (written.some(w => w.path === relative) || blob.has(relative)) continue;
  const rule = blockedPath(relative, release);
  if (rule) { namedLeft.push(`${relative} (spärrad: ${rule})`); continue; }
  if (!await localFile(relative) || !await labServes(relative)) { namedLeft.push(`${relative} (labbet lämnar inte ut den)`); continue; }
  if (relative.endsWith('.mp4')) await toBlob(relative, 'scen'); else await copyStatic(relative, 'scenens filer');
}

// ── The scene's presets, read-only ──────────────────────────────────────────
// The list as the Scen view reads it, and each preset as the game page asks for it by name. No revision goes up: nothing can
// be saved against the copy. Jakob's numbered places (profilval-<n>) are presets like any other.
const presetAnswers: Record<string, unknown> = {};
if (release.presets) {
  const list = JSON.parse((await lab('/api/scene-presets')).toString('utf8')) as {schemaVersion: 1; presets: {name: string; revision?: unknown}[]; problems?: unknown[]};
  if (!Array.isArray(list?.presets) || !list.presets.length) throw Error('Labbet gav inga förval.');
  if (list.problems?.length) throw Error(`Förvalen har fel i labbet: ${JSON.stringify(list.problems).slice(0, 300)}`);
  presetAnswers['api/scene-presets.json'] = scrub({schemaVersion: 1, presets: list.presets.map(p => ({...p, revision: null})), problems: []}, release);
  for (const {name} of list.presets) {
    if (typeof name !== 'string' || !PRESET_NAME.test(name)) throw Error(`Oväntat förvalsnamn: ${JSON.stringify(name)}`);
    const one = JSON.parse((await lab(`/api/scene-presets/${name}`)).toString('utf8')) as {preset: Record<string, unknown>};
    if (one?.preset?.name !== name) throw Error(`Förvalet ${name} kom tillbaka med ett annat namn.`);
    presetAnswers[`api/scene-presets/${name}.json`] = scrub({preset: {...one.preset, revision: null}}, release);
  }
}

// ── The game page ───────────────────────────────────────────────────────────
// The lab's own game.html and game.css as the server hands them out, with the engine in front of the page (copyGamePage).
if (release.casino.on) for (const address of ['/game.html', '/game.css']) {
  const source = PAGES[address]; if (!source) throw Error(`Spelets sida saknas i tools/lab-routes.ts: ${address}`);
  const text = await readFile(path.join(root, source), 'utf8');
  if ((await lab(address)).toString('utf8') !== text) throw Error(`Labbservern serverar ${address} annorlunda än filen ${source}.`);
  await emit(address.slice(1), address === '/game.html' ? copyGamePage(text) : text, 'spelet');
}

// ── Her lines over the films: the mouth patches the game may lay ────────────
// data/speech-patches.json names each patch by its record (assets/speech/<dealer>/patches/<id>/patch.json, src/speech-patch.ts),
// and the record names its strip and sound in the same folder. They go up as static files, each checked against the sha256
// the register and the record give. A patch of a dealer the Casino does not play, over a film that does not go up, or whose
// files do not check, is left out of the copy's register; the game then says that line with its talk film, as without patches.
const patchLeft: string[] = [];
const PATCH_FOLDER = /^assets\/speech\/([a-z0-9]+)\/patches\/([a-z0-9]+(?:-[a-z0-9]+)*)\/patch\.json$/;
const patchRegister = release.casino.on ? await localFile('data/speech-patches.json') : null;
if (patchRegister) {
  const register = JSON.parse(await readFile(patchRegister, 'utf8')) as {patches?: {id: string; dealer: string; film: string; path: string; sha256: string}[]} & Record<string, unknown>;
  const kept: typeof register.patches = [];
  for (const p of register.patches ?? []) {
    const m = PATCH_FOLDER.exec(String(p.path));
    if (!m || m[1] !== p.dealer || m[2] !== p.id) throw Error(`Oväntad sökväg till munlappen ${p.id}: ${p.path}`);
    if (!release.casino.dealers.includes(p.dealer)) { patchLeft.push(`${p.id} (dealern spelas inte i Casino)`); continue; }
    if (!blob.has(p.film)) { patchLeft.push(`${p.id} (filmen går inte upp)`); continue; }
    const record = await localFile(p.path);
    const recordBytes = record ? await readFile(record) : null;
    if (!recordBytes || digest(recordBytes) !== p.sha256) { patchLeft.push(`${p.id} (posten saknas eller stämmer inte med registret)`); continue; }
    const r = JSON.parse(recordBytes.toString('utf8')) as {strip?: {path?: string; sha256?: string}; sound?: {path?: string; sha256?: string}};
    const folder = p.path.slice(0, -'patch.json'.length), parts: [string, Buffer][] = [];
    for (const part of [r.strip, r.sound]) {
      const relative = `${folder}${part?.path}`, file = /^(?:mouth\.(?:webp|png)|line\.wav)$/.test(String(part?.path)) ? await localFile(relative) : null;
      const bytes = file ? await readFile(file) : null;
      if (bytes && digest(bytes) === part!.sha256) parts.push([relative, bytes]);
    }
    if (parts.length !== 2) { patchLeft.push(`${p.id} (remsan eller ljudet saknas eller stämmer inte med posten)`); continue; }
    if (blockedPath(p.path, release)) { patchLeft.push(`${p.id} (spärrad)`); continue; }
    await emit(p.path, recordBytes, 'munlappar');
    for (const [relative, bytes] of parts) await emit(relative, bytes, 'munlappar');
    kept.push(p);
  }
  dataFiles['data/speech-patches.json'] = scrub({...register, patches: kept}, release);
}
// Other scene data the studio's code names (data/…json): only registers of the scene, scrubbed like the rest.
const notInCopy: string[] = [];
for (const name of asked) {
  if (name.startsWith('data/') && !(name in dataFiles)) {
    if (/^data\/(?:scene-[a-z-]+|props)\.json$/.test(name) && await localFile(name)) dataFiles[name] = await frozenJson(name);
    else notInCopy.push(name);
  } else if (name.startsWith('api/') && !['api/clip-bank', 'api/proofs', 'api/placements', 'api/library', ...(release.presets ? ['api/scene-presets'] : [])].includes(name.replace(/\?.*$/, '')) && !isBotPath(`/${name.replace(/\?.*$/, '')}`)) notInCopy.push(name);
}

// ── The frozen answers of the read routes ───────────────────────────────────
const placements = scrub(JSON.parse((await lab('/api/placements')).toString('utf8')), release);
const answers: Record<string, unknown> = {
  'api/clip-bank.json': frozenBank,
  'api/proofs.json': {schemaVersion: 1, proofs: proofs.proofs},
  'api/placements.json': placements,
  'api/library.json': release.library ? scrub(JSON.parse((await lab('/api/library')).toString('utf8')), release) : {schemaVersion: 1, items: []},
  ...presetAnswers,
  ...dataFiles,
};
for (const [relative, value] of Object.entries(answers)) {
  const leaks = findLeaks(value, release, relative);
  if (leaks.length) throw Error(`Får inte gå upp: ${leaks.slice(0, 5).join('; ')}`);
  await emit(relative, json(value), relative.startsWith('api/') ? 'frysta svar' : 'scenens filer');
}

// ── The studio, built in snapshot mode ──────────────────────────────────────
const scratch = existsSync('D:/dealer-scratch/tmp') ? {TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'} : {};
const built = spawnSync(process.execPath, ['scripts/build.mjs', '--snapshot'], {cwd: path.join(root, 'studio'), env: {...process.env, ...scratch}, stdio: ['ignore', 'inherit', 'inherit']});
if (built.status !== 0) throw Error('Studion byggdes inte (studio/scripts/build.mjs --snapshot).');
if ((await lstat(studioOut).catch(() => null))?.isSymbolicLink() || await realpath(studioOut) !== path.join(realRoot, '.runtime', 'studio-snapshot', 'out')) throw Error('Linked studio export.');
async function* tree(dir: string, prefix = ''): AsyncGenerator<string> {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw Error(`Länk i studions export: ${prefix}${entry.name}`);
    if (entry.isDirectory()) yield* tree(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    else if (entry.isFile()) yield `${prefix}${entry.name}`;
  }
}
let pages = 0;
for await (const relative of tree(studioOut)) {
  if (!STUDIO_TYPES[path.extname(relative).toLowerCase()]) throw Error(`Oväntad fil i studions export: ${relative}`);
  const bytes = await readFile(path.join(studioOut, ...relative.split('/')));
  if (relative.endsWith('.html')) {
    pages++;
    const text = bytes.toString('utf8');
    if (text.includes('preview-ui.js')) throw Error(`Studion är inte byggd som kopia: ${relative} laddar labbets flikström.`);
  }
  if (bytes.includes('127.0.0.1:4319')) throw Error(`Studions export pekar på labbservern: ${relative}`);
  await emit(`studio/${relative}`, bytes, 'studion');
  const alias = prefetchAlias(relative);
  if (alias) await emit(`studio/${alias}`, bytes, 'studion');
}
if (!pages || !written.some(w => w.path === 'studio/index.html')) throw Error('Studions export saknar sidor.');

// ── The lock: the middleware and the map of the films in Blob ───────────────
// After an upload, .runtime/studio-blob/studio-media.json (tools/sync-studio-media.ts) holds each object's address; until then
// it is null. The receipt stays outside Git: the repo is public, and the list of addresses would open every film without the lock.
const uploaded = await readFile(path.join(home, '.runtime/studio-blob/studio-media.json'), 'utf8').then(JSON.parse).catch(() => null) as {host?: string; entries?: {object: string; sha256: string; bytes: number; url: string}[]} | null;
const media: MediaMap = {};
for (const file of [...blob.values()].sort((a, b) => a.path.localeCompare(b.path))) {
  const entry = uploaded?.entries?.find(e => e.object === file.object && e.sha256 === file.sha256 && e.bytes === file.bytes);
  if (entry) { const url = new URL(entry.url); if (url.protocol !== 'https:' || url.hostname !== uploaded!.host || url.pathname !== `/${file.object}` || url.search || url.hash) throw Error(`Oväntad Blob-adress för ${file.path}.`); }
  media[`/${file.path}`] = {url: entry?.url ?? null, type: file.type, bytes: file.bytes, sha256: file.sha256};
}
await mkdir(middlewareRoot, {recursive: true});
const lockFiles: Record<string, string> = {'index.js': 'cloud/studio/middleware.ts', 'gate.js': 'cloud/studio/gate.ts', 'lock.js': 'cloud/studio/lock.ts', 'login-page.js': 'cloud/studio/login-page.ts', 'bot-routes.js': 'cloud/studio/bot-routes.ts'};
for (const [name, source] of Object.entries(lockFiles)) await writeFile(path.join(middlewareRoot, name), forBrowser(await readFile(path.join(root, source), 'utf8')));
await writeFile(path.join(middlewareRoot, 'media.js'), `// The films of this copy in Blob (tools/build-studio-snapshot.ts).\nexport default ${JSON.stringify(media, null, 1)};\n`);
await writeFile(path.join(middlewareRoot, '.vc-config.json'), JSON.stringify({runtime: 'edge', entrypoint: 'index.js'}, null, 2));

// ── The bot: its function and its knowledge, which ships only inside the function ──
// The knowledge is made from the frozen bank and the proofs as the copy shows them (tools/build-knowledge.ts); its last scan
// stops the build on a cost, a blocked name, a path, an id or a token pattern. Without Paow in the register, Paow is out too.
const botRelease = release.paow ? release : {...release, blocked: {...release.blocked, names: [...release.blocked.names, 'Paow']}};
const {knowledge, report: knowledgeReport} = await buildKnowledge({root, release: botRelease, graph: frozenGraph, proofs: allProofs, onSite: new Set(proofs.proofs.map(p => p.id))});
await mkdir(botRoot, {recursive: true});
const botTexts: Record<string, string> = {};
for (const [name, source] of Object.entries(BOT_FUNCTION_FILES)) botTexts[name] = forBrowser(await readFile(path.join(root, source), 'utf8'));
botTexts['bot-knowledge.js'] = `// The bot's knowledge (tools/build-knowledge.ts), built with this copy. Only the function reads it.\nexport default ${JSON.stringify(knowledge)};\n`;
for (const [name, text] of Object.entries(botTexts)) {
  // The knowledge is checked as the bot reads it, every string decoded (tools/knowledge.ts knowledgeLeaks): in its JSON a
  // line break is "\n", which after "mål:" reads as a drive path, and a backslash path hides behind doubled backslashes.
  const leaks = name === 'bot-knowledge.js'
    ? [...findTextLeaks(text.slice(0, text.indexOf('export default ')), botRelease), ...knowledgeLeaks(knowledge, botRelease, t => findTextLeaks(t, botRelease))]
    : findTextLeaks(text, botRelease);
  if (leaks.length) throw Error(`Får inte gå upp: functions/api/bot.func/${name}: ${leaks.slice(0, 5).join(' | ')}`);
  await writeFile(path.join(botRoot, name), text);
}
await writeFile(path.join(botRoot, 'package.json'), JSON.stringify({type: 'module'}));
// Node.js 22 as in the Build Output API's own example; 300 s is the Hobby plan's maximum with Fluid compute.
await writeFile(path.join(botRoot, '.vc-config.json'), JSON.stringify({runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 300}, null, 2));

// ── Small files, the routes, the receipt ────────────────────────────────────
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const sourceDirty = execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim() !== '';
const films = [...blob.values()].filter(f => f.type === 'video/mp4');
const meta = {schemaVersion: 1, builtAt: new Date().toISOString(), sourceCommit, sourceDirty, counts: {takes: takes.picked.length, films: films.length, proofs: proofs.proofs.length, files: 0}};
await emit('robots.txt', 'User-agent: *\nDisallow: /\n', 'övrigt');
await emit('404.html', '<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Dealer Studio · Finns inte</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0f0d;color:#e8ece9;font:15px system-ui,sans-serif"><p>Den här sidan finns inte i kopian. <a style="color:#d9b96a" href="/studio/">Till studion</a></p></body></html>', 'övrigt');
meta.counts.files = written.length + blob.size + 1;
await emit('meta.json', json(meta), 'övrigt');
// Every text that goes up, once more: no machine path and no blocked name in a page, a module or an answer. All findings are
// named at once. A trial build (--prov) lists those in a module's code (a comment in src/ that names a folder on D:) and goes
// on; a finding in a page, an answer or a data file stops it as it stops the copy.
const textLeaks: string[] = [], codeLeaks: string[] = [];
for (const w of written) if (/\.(?:html|js|json|txt|css)$/.test(w.path)) {
  const leaks = findTextLeaks(await readFile(path.join(staticRoot, ...w.path.split('/')), 'utf8'), release);
  // three.js and the studio's own bundle carry no data of ours; a machine path there would still be a leak.
  if (leaks.length) (trial && w.path.endsWith('.js') && !w.path.startsWith('studio/') ? codeLeaks : textLeaks).push(`${w.path}: ${leaks.join(', ')}`);
}
if (textLeaks.length || (!trial && codeLeaks.length)) throw Error(`Får inte gå upp:\n  ${[...textLeaks, ...codeLeaks].join('\n  ')}`);
const config = {
  version: 3,
  routes: [
    // The lock first, for every address (cloud/studio/gate.ts): it answers alone, rewrites a film to Blob, or lets the request on.
    {src: '^/(.*)$', middlewarePath: '_middleware', continue: true},
    {src: '^/(.*)$', headers: {'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin'}, continue: true},
    {src: '^/$', status: 308, headers: {Location: '/studio/'}},
    {src: '^/studio$', status: 308, headers: {Location: '/studio/'}},
    {src: '^/lab\\.html$', status: 308, headers: {Location: '/studio/'}},
    {src: '^/api/(clip-bank|proofs|placements|library)$', dest: '/api/$1.json'},
    // The scene's presets: the list, and one by name as the game page asks for it (api/scene-presets/<name>).
    {src: '^/api/scene-presets/?$', dest: '/api/scene-presets.json'},
    {src: '^/api/scene-presets/([a-z0-9]+(?:-[a-z0-9]+)*)$', dest: '/api/scene-presets/$1.json'},
    // The bot's one function answers the draft and the inbox too (cloud/studio/bot.ts routeOf reads ?vag=…).
    {src: '^/api/utkast/?$', dest: '/api/bot?vag=utkast'},
    {src: '^/api/onskemal(?:/([^/]+?)(/bild)?)?/?$', dest: '/api/bot?vag=onskemal&id=$1&del=$2'},
    {src: '^/studio/((?:[^/]+/)*)$', dest: '/studio/$1index.html'},
    {handle: 'filesystem'},
    {src: '^/studio/((?:[^/.]+/)*[^/.]+)$', status: 308, headers: {Location: '/studio/$1/'}},
    {src: '^/(.*)$', status: 404, dest: '/404.html'},
  ],
};
await writeFile(path.join(output, 'config.json'), JSON.stringify(config, null, 2));
await writeFile(path.join(deploy, 'package.json'), JSON.stringify({private: true, name: 'dealer-studio-output', version: '1.0.0'}));
await writeFile(path.join(deploy, 'vercel.json'), JSON.stringify({framework: null, buildCommand: null, installCommand: null}, null, 2));

// The input must not have changed while the copy was made (Jakob may click in the lab meanwhile). Of the proofs only the
// ones that go up count: other agents add proofs of their own all the time.
const bankAfter = await bankRead();
const proofsAfter = pickProofs((JSON.parse((await lab('/api/proofs')).toString('utf8')) as {proofs: Proof[]}).proofs, raw, release).proofs;
if (bankAfter !== bankText || json(proofsAfter) !== json(proofs.proofs)) {
  await rm(output, {recursive: true, force: true});
  throw Error(`${bankAfter !== bankText ? 'Klippbanken' : 'Ett av proven'} ändrades medan kopian byggdes. Bygg om.`);
}
const staticBytes = written.reduce((sum, w) => sum + w.bytes, 0), blobBytes = [...blob.values()].reduce((sum, f) => sum + f.bytes, 0);
if (staticBytes > release.limits.staticBytes) throw Error(`De statiska filerna väger ${MB(staticBytes)} MB, över gränsen ${MB(release.limits.staticBytes)} MB.`);
if (blobBytes > release.limits.blobBytes) throw Error(`Filerna till Blob väger ${MB(blobBytes)} MB, över gränsen ${MB(release.limits.blobBytes)} MB.`);
const missing = Object.values(media).filter(m => !m.url).length;
const plan = [...blob.values()].map(({path: p, sha256, bytes, type, object, group}) => ({path: p, sha256, bytes, type, object, group}));
// A trial's plan says so: tools/sync-studio-media.ts uploads nothing from it.
await writeFile(path.join(deploy, 'media-plan.json'), JSON.stringify({schemaVersion: 1, builtAt: meta.builtAt, sourceCommit, ...(trial ? {trial: true} : {}), files: plan}, null, 2));
const perDealer = Object.fromEntries([...parts].map(([dealer, p]) => [dealer, {takes: p.picked.length, groups: p.picked.reduce((m: Record<string, number>, t) => (m[t.group] = (m[t.group] ?? 0) + 1, m), {}), game: p.game.size,
  roundGaps: p.round.filter(s => !s.video).map(s => s.id)}]));
await writeFile(path.join(deploy, 'build.json'), JSON.stringify({builtAt: meta.builtAt, sourceCommit, sourceDirty, from: {checkout: root, home, lab: LAB}, trial, codeLeaks, bankSha256: digest(bankText), proofsSha256: digest(proofsText), release: digest(await readFile(path.join(root, 'data/studio-release.json'))),
  deployable: !trial && missing === 0, filmsWithoutUpload: missing, staticBytes, blobBytes, dealers: perDealer, casino: release.casino, presets: Object.keys(presetAnswers).length - (release.presets ? 1 : 0), static: written, blob: plan,
  bot: {knowledgeBytes: knowledgeReport.bytes, core: knowledgeReport.karna, searched: knowledgeReport.rest, views: knowledgeReport.vyer, missingSources: knowledgeReport.saknas, removed: knowledgeReport.borttaget,
    files: Object.fromEntries(Object.entries(botTexts).map(([name, text]) => [name, {bytes: Buffer.byteLength(text), sha256: digest(text)}]))},
  leftOut: {takes: takes.left, proofs: proofs.left, notInCopy, named: namedLeft, patches: patchLeft}}, null, 2));

// ── The table ───────────────────────────────────────────────────────────────
const rows = new Map<string, {where: string; files: number; bytes: number}>();
for (const w of written) { const r = rows.get(`static:${w.group}`) ?? {where: 'statisk', files: 0, bytes: 0}; r.files++; r.bytes += w.bytes; rows.set(`static:${w.group}`, r); }
for (const f of blob.values()) { const r = rows.get(`blob:${f.group}`) ?? {where: 'Blob', files: 0, bytes: 0}; r.files++; r.bytes += f.bytes; rows.set(`blob:${f.group}`, r); }
console.log('\nGår upp');
console.log('  grupp                plats      filer        MB');
for (const [key, r] of [...rows].sort((a, b) => a[1].where.localeCompare(b[1].where) || b[1].bytes - a[1].bytes)) console.log(`  ${key.split(':')[1].padEnd(20)} ${r.where.padEnd(9)} ${String(r.files).padStart(6)} ${MB(r.bytes).padStart(9)}`);
console.log(`  ${'summa'.padEnd(20)} ${'statisk'.padEnd(9)} ${String(written.length).padStart(6)} ${MB(staticBytes).padStart(9)}`);
console.log(`  ${'summa'.padEnd(20)} ${'Blob'.padEnd(9)} ${String(blob.size).padStart(6)} ${MB(blobBytes).padStart(9)}`);
const tally = (list: Left[]) => [...list.reduce((m, l) => m.set(l.why, (m.get(l.why) ?? 0) + 1), new Map<string, number>())].map(([why, n]) => `${n} ${why}`).join(', ');
console.log('\nPer dealer');
for (const [dealer, d] of Object.entries(perDealer)) console.log(`  ${dealer.padEnd(8)} ${String(d.takes).padStart(4)} tagningar (${Object.entries(d.groups).map(([g, n]) => `${n} ${g}`).join(', ')})${d.game ? `; spelet kan spela ${d.game}` : ''}; rundans luckor: ${d.roundGaps.join(', ') || 'inga'}`);
console.log(`  förval: ${release.presets ? Object.keys(presetAnswers).filter(k => k !== 'api/scene-presets.json').map(k => k.replace(/^api\/scene-presets\/|\.json$/g, '')).join(', ') : 'av (studions tre inbyggda)'}; Casino: ${release.casino.on ? `på, ${release.casino.dealers.join(' och ')}` : 'av'}`);
console.log('\nLämnas utanför');
console.log(`  tagningar: ${tally(takes.left) || 'inga'}`);
console.log(`  prov: ${tally(proofs.left) || 'inga'}`);
if (namedLeft.length) console.log(`  filer modulerna nämner: ${namedLeft.join(', ')}`);
if (patchLeft.length) console.log(`  munlappar: ${patchLeft.join(', ')}`);
if (notInCopy.length) console.log(`  studion frågar efter, finns inte i kopian: ${notInCopy.join(', ')}`);
if (codeLeaks.length) console.log(`\nPROVBYGGE, får inte publiceras. I modulernas kod:\n  ${codeLeaks.join('\n  ')}`);
console.log('\nBoten (functions/api/bot.func, kunskapen bara där)');
console.log(`  kunskapen: ${MB(knowledgeReport.bytes)} MB; kärnan ${knowledgeReport.karna.avsnitt} avsnitt, cirka ${knowledgeReport.karna.tokens} token; sökbart ${knowledgeReport.rest.avsnitt} avsnitt, cirka ${knowledgeReport.rest.tokens} token (skattat)`);
console.log(`  vyerna ur ${knowledgeReport.vyer === 'guide' ? 'studio/lib/guide.ts' : 'botens egna texter'}; borttaget: ${Object.entries(knowledgeReport.borttaget).map(([k, n]) => `${n} ${k}`).join(', ') || 'inget'}`);
if (knowledgeReport.saknas.length) console.log(`  källor som saknas: ${knowledgeReport.saknas.join(', ')}`);
console.log(`\n${output}`);
console.log(trial ? 'Provbygge: repeteras med node tools/serve-studio-snapshot.ts --prov; publiceras aldrig.' : missing ? `Inte klar att publicera: ${missing} filer saknar Blob-adress (node tools/sync-studio-media.ts).` : 'Alla filer har en verifierad Blob-adress.');
