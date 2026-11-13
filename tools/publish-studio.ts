// The studio's locked copy on the internet, published again from a commit: the whole way in one command (docs/DRIFT.md,
// "Den låsta kopian på nätet"). Run from Jakob's own checkout, which holds the media (assets/) and the copy's state
// (.runtime/studio-deploy with the Vercel project's link, .runtime/studio-blob with the store's key and the receipt).
//
//   node tools/publish-studio.ts                    plan: which commit, which worktree, what would run; nothing is sent
//   node tools/publish-studio.ts --kor              build that commit, upload new media, build again, deploy, check
//   … --commit <ref>                                another commit than origin/main (fetched first)
//   … --utan-deploy                                 stop after the upload and the second build
//
// The code is never this checkout's working tree, where other sessions have unfinished files: the commit is checked out,
// detached and clean, in a worktree of its own (WORKTREE below), with its own npm packages and the media of this checkout
// through a junction (assets/ is outside Git). There its own lab server runs on LAB_PORT, so that the copy is frozen from
// that commit's registers and modules (tools/build-studio-snapshot.ts --lab … --hem …). tools/preview.ts has a fixed port
// and host check and tidies D: when it starts; it is started unchanged, with a start-up module (LAB_HOOK) that moves its
// port, lets its host check see the address it expects, and leaves the tidying to the lab server on 4319. Jakob's lab
// server on 4319 is never started, stopped or asked.
//
// Media go up only when new: each object is named by its content (tools/sync-studio-media.ts), so a republish sends only
// films that changed or were added. The deploy is `vercel deploy --prebuilt --prod` from .runtime/studio-deploy, never from
// the repo root (its .env.local holds another store's key). Afterwards the copy is asked, without the cookie, for a page, a
// film and an answer: each must be the login page. With DEALER_LOSEN_PROV set (the password, for this run only, never
// written down) it also logs in and checks the first page, a film by range and the commit the copy says it is.
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {readFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const home = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (path.resolve(process.cwd()) !== home) throw Error('Kör från dealer-katalogen (Jakobs utcheckning).');
const args = process.argv.slice(2), run = args.includes('--kor'), noDeploy = args.includes('--utan-deploy');
const option = (name: string) => { const at = args.indexOf(name); if (at < 0) return null; const v = args[at + 1]; if (!v || v.startsWith('--')) throw Error(`${name} saknar värde.`); return v; };

export const WORKTREE = 'D:/dealer-scratch/tmp/publiceringsagent/kopia';
export const LAB_PORT = 4341;
const TEAM = 'jakeminator123s-projects', PROJECT = 'dealer-studio';
const deployDir = path.join(home, '.runtime', 'studio-deploy');
const say = (text: string) => console.log(text);
const git = (cwd: string, ...a: string[]) => { const r = spawnSync('git', a, {cwd, encoding: 'utf8'}); if (r.status !== 0) throw Error(`git ${a.join(' ')}: ${(r.stderr || r.stdout).trim()}`); return r.stdout.trim(); };
const step = (name: string, command: string, list: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
  say(`\n── ${name}\n   ${command} ${list.join(' ')}   (i ${cwd})`);
  if (!run) return;
  const r = spawnSync(command, list, {cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && !command.endsWith('.exe') && command !== process.execPath});
  if (r.status !== 0) throw Error(`${name} gick inte (kod ${r.status}).`);
};

/**
 * The start-up module of the worktree's lab server: tools/preview.ts listens on 4319 and answers only Host 127.0.0.1:4319;
 * here it listens on LAB_PORT and a request's Host is read as it expects. Its tidying of D: at start (tools/scratch-clean.ts)
 * is not started: that belongs to the lab server on 4319. Nothing else of the server is touched.
 */
export const LAB_HOOK = `import http from 'node:http'; import cp from 'node:child_process'; import {EventEmitter} from 'node:events'; import {syncBuiltinESMExports} from 'node:module';
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (port, ...rest) { return listen.call(this, port === 4319 ? ${LAB_PORT} : port, ...rest); };
const create = http.createServer;
http.createServer = function (...a) { const i = a.findIndex(x => typeof x === 'function'); if (i >= 0) { const handler = a[i]; a[i] = (req, res) => { if (req.headers.host === '127.0.0.1:${LAB_PORT}') req.headers.host = '127.0.0.1:4319'; return handler(req, res); }; } return create.apply(this, a); };
const spawnOriginal = cp.spawn;
cp.spawn = function (command, list, ...rest) { if (Array.isArray(list) && list.includes('tools/scratch-clean.ts')) return new EventEmitter(); return spawnOriginal.call(this, command, list, ...rest); };
syncBuiltinESMExports();`;

// ── What is published ───────────────────────────────────────────────────────
const asked = option('--commit') ?? 'origin/main';
git(home, 'fetch', '--quiet', 'origin');
const commit = git(home, 'rev-parse', '--verify', `${asked}^{commit}`);
say(`Kopian byggs från ${commit.slice(0, 7)} (${asked}) i ${WORKTREE}; media och kopians tillstånd från ${home}.`);
// The project's and the team's ids are not written in the repo, which is public: they come from the deploy folder's link
// (.runtime/studio-deploy/.vercel/project.json, written by `vercel link` and ignored by Git), or from VERCEL_ORG_ID and
// VERCEL_PROJECT_ID, which the Vercel CLI reads as well. The team the id names is asked for its name before anything is sent.
const linked = (() => { try { return JSON.parse(readFileSync(path.join(deployDir, '.vercel', 'project.json'), 'utf8')) as {projectId?: string; orgId?: string; projectName?: string}; } catch { return null; } })();
const link = {orgId: linked?.orgId ?? process.env.VERCEL_ORG_ID, projectId: linked?.projectId ?? process.env.VERCEL_PROJECT_ID, projectName: linked?.projectName ?? PROJECT};
if (!link.orgId || !link.projectId) throw Error(`Projektets id saknas: länka .runtime/studio-deploy till ${PROJECT} i ${TEAM} med vercel link (docs/DRIFT.md), eller sätt VERCEL_ORG_ID och VERCEL_PROJECT_ID.`);
if (link.projectName !== PROJECT) throw Error(`.runtime/studio-deploy är länkad till ${link.projectName}, inte ${PROJECT}.`);
const team = spawnSync('vercel', ['api', `/v2/teams/${link.orgId}`, '--raw'], {cwd: deployDir, encoding: 'utf8', shell: process.platform === 'win32'});
const slug = (() => { try { return (JSON.parse(team.stdout) as {slug?: string}).slug; } catch { return null; } })();
if (slug !== TEAM) throw Error(`Länkens team är ${slug ?? 'okänt (vercel whoami?)'}, inte ${TEAM}; inget skickas.`);
const receipt = (() => { try { return JSON.parse(readFileSync(path.join(home, '.runtime', 'studio-blob', 'studio-media.json'), 'utf8')) as {storeId?: string}; } catch { return null; } })();
const store = option('--store') ?? receipt?.storeId;
if (!store) throw Error('Ingen Blob-store: ange --store store_… första gången (docs/DRIFT.md).');
if (!existsSync(path.join(home, '.runtime', 'studio-blob', '.env.local'))) throw Error('Storens nyckel saknas i .runtime/studio-blob/.env.local (docs/DRIFT.md).');
say(`Vercel: ${link.projectName ?? link.projectId} i ${TEAM}; Blob-store ${store}.`);

// ── The worktree: the commit, detached and clean, with its packages and the media ──
const sameDir = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
if (!existsSync(WORKTREE)) {
  say(`\n── Ny arbetskopia\n   git worktree add --detach ${WORKTREE} ${commit.slice(0, 7)}`);
  if (run) { await mkdir(path.dirname(WORKTREE), {recursive: true}); git(home, 'worktree', 'add', '--detach', WORKTREE, commit); }
} else {
  const common = git(WORKTREE, 'rev-parse', '--git-common-dir');
  if (!sameDir(path.resolve(WORKTREE, common), path.join(home, '.git'))) throw Error(`${WORKTREE} är inte en arbetskopia av den här utcheckningen.`);
  const dirty = git(WORKTREE, 'status', '--porcelain');
  if (dirty) throw Error(`Arbetskopian har ändringar; kopian byggs bara ur en ren commit:\n${dirty}`);
  say(`\n── Arbetskopian till ${commit.slice(0, 7)}\n   git checkout --detach ${commit.slice(0, 7)}   (i ${WORKTREE})`);
  if (run) git(WORKTREE, 'checkout', '--quiet', '--detach', commit);
}
if (run) {
  // assets/ is outside Git: the worktree reads this checkout's media through a junction (ignored by Git, so the worktree stays clean).
  const assets = path.join(WORKTREE, 'assets');
  if (!existsSync(assets)) { const r = spawnSync('cmd', ['/c', 'mklink', '/J', assets.replaceAll('/', '\\'), path.join(home, 'assets')], {encoding: 'utf8'}); if (r.status !== 0) throw Error(`Kopplingen till media gick inte: ${r.stderr || r.stdout}`); }
  if (!lstatSync(assets).isSymbolicLink() && !sameDir(realpathSync(assets), path.join(home, 'assets'))) throw Error(`${assets} är inte kopplingen till ${home}\\assets.`);
  if (!sameDir(realpathSync(assets), realpathSync(path.join(home, 'assets')))) throw Error(`${assets} pekar inte på ${home}\\assets.`);
  if (git(WORKTREE, 'status', '--porcelain')) throw Error('Kopplingen till media syns i Git; avbryter.');
  // Packages as the commit's lock files say; again only when a lock file changed.
  for (const dir of ['.', 'studio']) {
    const lock = path.join(WORKTREE, dir, 'package-lock.json'), stamp = path.join(WORKTREE, dir, 'node_modules', '.publish-lock-sha256');
    const sha = createHash('sha256').update(readFileSync(lock)).digest('hex');
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === sha) continue;
    step(`npm ci (${dir})`, 'npm', ['ci', '--no-audit', '--no-fund'], path.join(WORKTREE, dir));
    await import('node:fs/promises').then(fs => fs.writeFile(stamp, sha));
  }
}

// ── Its own lab server, the builds, the upload ──────────────────────────────
const scratchEnv = existsSync('D:/dealer-scratch/tmp') ? {TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'} : {};
// The bot's knowledge reads Scoutgaming's documents beside the checkout (tools/build-knowledge.ts scoutRoot): the worktree on
// D: has no such neighbour, so the home checkout's is named.
const env = {...process.env, ...scratchEnv, DEALER_SCOUT_ROOT: process.env.DEALER_SCOUT_ROOT || path.resolve(home, '..', '..', 'scoutgaming')};
delete env.BLOB_READ_WRITE_TOKEN;
const LAB = `http://127.0.0.1:${LAB_PORT}`;
let server: ChildProcess | null = null;
const health = async () => { try { const r = await fetch(`${LAB}/health`, {signal: AbortSignal.timeout(1500)}); return r.ok ? await r.json() as {name?: string; root?: string} : null; } catch { return null; } };
const stopServer = async () => {
  if (!server) return;
  const token = await readFile(path.join(WORKTREE, '.runtime', 'preview.json'), 'utf8').then(t => JSON.parse(t).token as string).catch(() => '');
  await fetch(`${LAB}/stop`, {method: 'POST', headers: {'x-dealer-token': token}}).catch(() => null);
  for (let i = 0; i < 20 && await health(); i++) await new Promise(r => setTimeout(r, 250));
  if (await health()) server.kill();
  server = null;
};
const build = () => step('Kopian byggs', process.execPath, ['tools/build-studio-snapshot.ts', '--lab', LAB, '--hem', home], WORKTREE, env);
try {
  say(`\n── Arbetskopians labbserver\n   node --import <LAB_HOOK> tools/preview.ts   (i ${WORKTREE}, ${LAB})`);
  if (run) {
    if (await health()) throw Error(`Något svarar redan på ${LAB}; avbryter.`);
    server = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(LAB_HOOK).toString('base64')}`, 'tools/preview.ts'], {cwd: WORKTREE, env, stdio: 'ignore', windowsHide: true});
    let alive = null; for (let i = 0; i < 80 && !alive; i++) { await new Promise(r => setTimeout(r, 250)); alive = await health(); }
    if (alive?.name !== 'dealer' || !sameDir(String(alive.root), WORKTREE)) throw Error('Arbetskopians labbserver startade inte.');
  }
  build();
  step('Nya filmer och bilder till Blob', process.execPath, ['tools/sync-studio-media.ts', '--upload', '--store', store], home, env);
  build();
  await stopServer();
  if (run) {
    const built = JSON.parse(readFileSync(path.join(deployDir, 'build.json'), 'utf8'));
    if (!built.deployable || built.trial || built.sourceCommit !== commit || built.sourceDirty || built.codeLeaks?.length) throw Error(`Bygget går inte att publicera: ${JSON.stringify({deployable: built.deployable, trial: built.trial, commit: built.sourceCommit, dirty: built.sourceDirty, leaks: built.codeLeaks})}`);
    say(`   Bygget: ${built.static.length} statiska filer, ${built.blob.length} i Blob, commit ${commit.slice(0, 7)}.`);
  }
  if (noDeploy) { say('\nStannar före deploy (--utan-deploy).'); process.exit(0); }
  step('Deploy', 'vercel', ['deploy', '--prebuilt', '--prod', '--yes', '--scope', TEAM], deployDir, env);
} finally { await stopServer(); }

// ── Checked from the outside ────────────────────────────────────────────────
if (!run) { say('\nPlan: inget har körts. Kör med --kor.'); process.exit(0); }
const domains = (() => { const r = spawnSync('vercel', ['api', `/v9/projects/${link.projectId}/domains?teamId=${link.orgId}`, '--raw'], {cwd: deployDir, encoding: 'utf8', shell: process.platform === 'win32'});
  try { return (JSON.parse(r.stdout).domains as {name: string}[]).map(d => d.name); } catch { return []; } })();
if (!domains.length) throw Error('Projektets adresser kunde inte läsas; kontrollera kopian för hand.');
const built = JSON.parse(readFileSync(path.join(deployDir, 'build.json'), 'utf8')) as {blob: {path: string; type: string}[]};
const film = built.blob.find(f => f.type === 'video/mp4')!.path, password = process.env.DEALER_LOSEN_PROV ?? '';
let bad = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) bad++; say(`   ${ok ? 'ok ' : 'FEL'} ${name}${detail ? ` (${detail})` : ''}`); };
for (const domain of domains) {
  const site = `https://${domain}`;
  say(`\n── ${site}`);
  for (const p of ['/studio/', '/studio/game/', '/api/clip-bank', '/game.html', `/${film}`]) {
    const r = await fetch(site + p, {redirect: 'manual'}).catch(() => null);
    const text = r ? await r.text() : '';
    check(`utan kaka ${p}`, r?.status === 401 && text.includes('name="losen"'), String(r?.status ?? 'inget svar'));
  }
  if (!password) { say('   (DEALER_LOSEN_PROV är inte satt: inloggningen prövas inte)'); continue; }
  const login = await fetch(`${site}/api/login`, {method: 'POST', redirect: 'manual', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({losen: password, next: '/studio/'})});
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  check('inloggning', login.status === 303 && cookie.startsWith('dealer_studio='), String(login.status));
  const page = await fetch(`${site}/studio/`, {headers: {cookie}});
  check('första sidan', page.status === 200 && (await page.text()).includes('/studio/game/'), String(page.status));
  const meta = await (await fetch(`${site}/meta.json`, {headers: {cookie}})).json().catch(() => null) as {sourceCommit?: string} | null;
  check('kopian säger rätt commit', meta?.sourceCommit === commit, meta?.sourceCommit?.slice(0, 7));
  const range = await fetch(`${site}/${film}`, {headers: {cookie, range: 'bytes=0-1023'}});
  const bytes = Buffer.from(await range.arrayBuffer());
  check(`film med Range /${film}`, range.status === 206 && bytes.subarray(4, 8).toString() === 'ftyp', `${range.status} ${range.headers.get('content-range')}`);
}
say(bad ? `\n${bad} kontroller föll.` : `\nKopian är publicerad från ${commit.slice(0, 7)} och svarar som den ska.`);
process.exit(bad ? 1 : 0);
