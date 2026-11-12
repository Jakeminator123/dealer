// Builds the studio's locked, read-only copy for the internet as a Vercel Build Output tree in
// .runtime/studio-deploy/.vercel/output. It uploads nothing and deploys nothing: tools/sync-studio-media.ts plans the
// upload of the films, and the publish steps are the main agent's, on Jakob's word.
//
//   node tools/build-studio-snapshot.ts
//
// With the lab server running on 127.0.0.1:4319 it freezes what the studio reads there: the clip bank, the proofs and the
// placement plan (every cost and private field taken out, tools/studio-freeze.ts), the 3D scene's modules exactly as the
// server serves them, and the scene's files. What goes up is decided by data/studio-release.json. It builds the studio in
// snapshot mode (studio/scripts/build.mjs --snapshot), writes stills as small WebP, and adds the lock: the Routing
// Middleware of cloud/studio/, with the map from each film's address to its object in Vercel Blob. Films and proof files go
// to Blob, everything else is a static file of the deployment. The bot and the request inbox are one Node.js function
// (cloud/studio/bot.ts) with its knowledge beside it (tools/build-knowledge.ts), never a static file. It prints a table of
// what goes up and what was left out.
import {readFile, writeFile, mkdir, rm, realpath, lstat, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {buildGraph, resolveRound, roundSequence, type BankData} from '../src/clip-graph.ts';
import {SCRIPTS, VENDOR, SCENE_FILES, forBrowser} from './lab-routes.ts';
import {STUDIO_TYPES} from './studio-files.ts';
import {readRelease, pickTakes, freezeBank, pickProofs, graphShape, roundShape, scrub, findLeaks, findTextLeaks, blockedPath, safeRelative, prefetchAlias, objectName, MEDIA_TYPES, type Proof, type Left} from './studio-freeze.ts';
import type {MediaMap} from '../cloud/studio/gate.ts';
import {buildKnowledge, BOT_FUNCTION_FILES} from './build-knowledge.ts';
import {knowledgeLeaks} from './knowledge.ts';
import {isBotPath} from '../cloud/studio/bot-routes.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (path.resolve(process.cwd()) !== root) throw Error('Kör från dealer-katalogen.');
const LAB = 'http://127.0.0.1:4319';
const deploy = path.join(root, '.runtime', 'studio-deploy');
const output = path.join(deploy, '.vercel', 'output');
const staticRoot = path.join(output, 'static');
const middlewareRoot = path.join(output, 'functions', '_middleware.func');
// The bot and the request inbox: one Node.js function (cloud/studio/bot-function.ts) with the knowledge beside it.
const botRoot = path.join(output, 'functions', 'api', 'bot.func');
// The export of studio/scripts/build.mjs --snapshot (studio/next.config.ts SNAPSHOT_OUT).
const studioOut = path.join(root, '.runtime', 'studio-snapshot', 'out');

// ── One fixed, disposable output tree, never reached through a link ─────────
if (output !== path.resolve(root, '.runtime/studio-deploy/.vercel/output')) throw Error('Unsafe build output.');
const realRoot = await realpath(root);
await mkdir(path.dirname(output), {recursive: true});
if (await realpath(deploy) !== path.join(realRoot, '.runtime', 'studio-deploy')) throw Error('Linked studio build directory.');
if (await realpath(path.dirname(output)) !== path.join(realRoot, '.runtime', 'studio-deploy', '.vercel')) throw Error('Linked Vercel output parent.');
if ((await lstat(output).catch(() => null))?.isSymbolicLink()) throw Error('Linked studio build output.');
await rm(output, {recursive: true, force: true});
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
if (health?.name !== 'dealer' || !same(health.root, root)) throw Error('Labbservern på 4319 är inte den här utcheckningens.');

/** A file of the checkout that really lies where its path says (no link along the way), or null. */
async function localFile(relative: string): Promise<string | null> {
  if (!safeRelative(relative)) return null;
  const wanted = path.join(realRoot, ...relative.split('/'));
  const real = await realpath(path.join(root, relative)).catch(() => null);
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
const GROUP_RANK = ['runda', 'godkänd', 'variant', 'väntar', 'scen', 'prov'];
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
const graph = buildGraph(bank);
const roundSteps = roundSequence({seats: release.round.seats, reveal: release.round.reveal});
const round = resolveRound(graph, roundSteps, {holeCardDown: release.round.holeCardDown});
const takes = pickTakes(graph, round, release);
if (takes.refused.length) throw Error(`Registret väljer spärrade tagningar: ${takes.refused.map(r => `${r.id} (${r.why})`).join(', ')}`);
const shown = new Map<string, string>(); // a lab path of the bank to the copy's path
const clipMedia = /^assets\/motions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(source\.mp4|source-reversed\.mp4|first\.png|last\.png)$/;
const trackMedia = /^assets\/tracking\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(card-track\.json|overrides\.json)$/;
const stills = new Map<string, string>(); // png → webp, made below
for (const {id, group} of takes.picked) {
  const m = graph.takes[id].media;
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
// The copy must decide as the lab does: every edge's main take, variants and status, and the round frame by frame.
const frozenGraph = buildGraph(frozenBank);
const frozenRound = resolveRound(frozenGraph, roundSteps, {holeCardDown: release.round.holeCardDown});
if (json(graphShape(frozenGraph)) !== json(graphShape(graph))) throw Error('Den frysta klippbanken ger en annan graf än labbet.');
if (json(roundShape(frozenRound)) !== json(roundShape(round))) throw Error('Den frysta klippbanken spelar rundan annorlunda än labbet.');
for (const s of frozenRound) if (s.video && !blob.has(s.video)) throw Error(`Rundans film går inte upp: ${s.video}`);

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
const roots = new Set(['/scene3d-view.js', '/scene3d-room.js']);
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
const sceneFilms = new Set<string>(), props = new Set<string>();
while (queue.length) {
  const address = queue.shift()!;
  if (moduleFiles.has(address)) continue;
  let expected: string;
  if (SCRIPTS[address]) expected = forBrowser(await readFile(path.join(root, SCRIPTS[address]), 'utf8'));
  else if (VENDOR[address]) expected = await readFile(path.join(root, VENDOR[address]), 'utf8');
  else if (allowedMaterials.has(address.slice(1))) { const file = await localFile(address.slice(1)); if (!file) throw Error(`Modulen saknas: ${address}`); expected = await readFile(file, 'utf8'); }
  else throw Error(`Modulen ${address} hör inte till labbservern (tools/lab-routes.ts).`);
  const served = (await lab(address)).toString('utf8');
  if (served !== expected) throw Error(`Labbservern serverar ${address} annorlunda än tools/lab-routes.ts gör: kartorna har glidit isär.`);
  moduleFiles.set(address, expected);
  for (const m of expected.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]+?from\s*)?(['"])([^'"\n]+)\1/g)) { const next = resolveSpecifier(m[2], address); if (next) queue.push(next); else throw Error(`${address} importerar ${m[2]}, som kopian inte kan lösa.`); }
  for (const m of expected.matchAll(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g)) { const next = resolveSpecifier(m[2], address); if (next) queue.push(next); else throw Error(`${address} importerar ${m[2]}, som kopian inte kan lösa.`); }
  for (const m of expected.matchAll(/['"`](assets\/motions\/[a-z0-9-]+\/source\.mp4)['"`]/g)) sceneFilms.add(m[1]);
  for (const m of expected.matchAll(/['"`](assets\/props\/[a-z0-9-]+\.glb)['"`]/g)) props.add(m[1]);
}
for (const [address, text] of moduleFiles) await emit(address.slice(1), text, address.startsWith('/vendor/') || address.startsWith('/materials/') ? 'three.js' : 'scenens moduler');
for (const film of sceneFilms) { await toBlob(film, 'scen'); }
for (const prop of props) await copyStatic(prop, 'scenens filer');

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
// Other scene data the studio's code names (data/…json): only registers of the scene, scrubbed like the rest.
const notInCopy: string[] = [];
for (const name of asked) {
  if (name.startsWith('data/') && !(name in dataFiles)) {
    if (/^data\/(?:scene-[a-z-]+|props)\.json$/.test(name) && await localFile(name)) dataFiles[name] = await frozenJson(name);
    else notInCopy.push(name);
  } else if (name.startsWith('api/') && !['api/clip-bank', 'api/proofs', 'api/placements', 'api/library'].includes(name.replace(/\?.*$/, '')) && !isBotPath(`/${name.replace(/\?.*$/, '')}`)) notInCopy.push(name);
}

// ── The frozen answers of the read routes ───────────────────────────────────
const placements = scrub(JSON.parse((await lab('/api/placements')).toString('utf8')), release);
const answers: Record<string, unknown> = {
  'api/clip-bank.json': frozenBank,
  'api/proofs.json': {schemaVersion: 1, proofs: proofs.proofs},
  'api/placements.json': placements,
  'api/library.json': release.library ? scrub(JSON.parse((await lab('/api/library')).toString('utf8')), release) : {schemaVersion: 1, items: []},
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
// After an upload, data/studio-media.json (tools/sync-studio-media.ts) holds each object's address; until then it is null.
const uploaded = await readFile(path.join(root, 'data/studio-media.json'), 'utf8').then(JSON.parse).catch(() => null) as {host?: string; entries?: {object: string; sha256: string; bytes: number; url: string}[]} | null;
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
// Every text that goes up, once more: no machine path and no blocked name in a page, a module or an answer.
for (const w of written) if (/\.(?:html|js|json|txt|css)$/.test(w.path)) {
  const leaks = findTextLeaks(await readFile(path.join(staticRoot, ...w.path.split('/')), 'utf8'), release);
  // three.js and the studio's own bundle carry no data of ours; a machine path there would still be a leak.
  if (leaks.length) throw Error(`Får inte gå upp: ${w.path}: ${leaks.join(', ')}`);
}
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
await writeFile(path.join(deploy, 'media-plan.json'), JSON.stringify({schemaVersion: 1, builtAt: meta.builtAt, sourceCommit, files: plan}, null, 2));
await writeFile(path.join(deploy, 'build.json'), JSON.stringify({builtAt: meta.builtAt, sourceCommit, sourceDirty, bankSha256: digest(bankText), proofsSha256: digest(proofsText), release: digest(await readFile(path.join(root, 'data/studio-release.json'))),
  deployable: missing === 0, filmsWithoutUpload: missing, staticBytes, blobBytes, static: written, blob: plan,
  bot: {knowledgeBytes: knowledgeReport.bytes, core: knowledgeReport.karna, searched: knowledgeReport.rest, views: knowledgeReport.vyer, missingSources: knowledgeReport.saknas, removed: knowledgeReport.borttaget,
    files: Object.fromEntries(Object.entries(botTexts).map(([name, text]) => [name, {bytes: Buffer.byteLength(text), sha256: digest(text)}]))},
  leftOut: {takes: takes.left, proofs: proofs.left, notInCopy}}, null, 2));

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
console.log('\nLämnas utanför');
console.log(`  tagningar: ${tally(takes.left) || 'inga'}`);
console.log(`  prov: ${tally(proofs.left) || 'inga'}`);
if (notInCopy.length) console.log(`  studion frågar efter, finns inte i kopian: ${notInCopy.join(', ')}`);
console.log('\nBoten (functions/api/bot.func, kunskapen bara där)');
console.log(`  kunskapen: ${MB(knowledgeReport.bytes)} MB; kärnan ${knowledgeReport.karna.avsnitt} avsnitt, cirka ${knowledgeReport.karna.tokens} token; sökbart ${knowledgeReport.rest.avsnitt} avsnitt, cirka ${knowledgeReport.rest.tokens} token (skattat)`);
console.log(`  vyerna ur ${knowledgeReport.vyer === 'guide' ? 'studio/lib/guide.ts' : 'botens egna texter'}; borttaget: ${Object.entries(knowledgeReport.borttaget).map(([k, n]) => `${n} ${k}`).join(', ') || 'inget'}`);
if (knowledgeReport.saknas.length) console.log(`  källor som saknas: ${knowledgeReport.saknas.join(', ')}`);
console.log(`\n${output}`);
console.log(missing ? `Inte klar att publicera: ${missing} filer saknar Blob-adress (node tools/sync-studio-media.ts).` : 'Alla filer har en verifierad Blob-adress.');
