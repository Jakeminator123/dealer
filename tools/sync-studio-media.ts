// The films and proof files of the studio's online copy, to Vercel Blob. The list is the snapshot's own
// (.runtime/studio-deploy/media-plan.json, written by tools/build-studio-snapshot.ts), so exactly what the copy's
// middleware points at goes up, and nothing else.
//
//   node tools/sync-studio-media.ts                          dry run (the default): what would go up, nothing is read
//                                                            from the credential file and nothing is sent
//   node tools/sync-studio-media.ts --upload --store <id>    upload, on Jakob's word only
//
// Same rules as tools/sync-public-media.ts: every object is named by its SHA-256 ("studio/<sha256>.<ext>"), an existing
// object is never overwritten (allowOverwrite false; one of the right size is reused), and every object is read back
// anonymously and hashed before it enters .runtime/studio-blob/studio-media.json, the receipt the next snapshot build reads.
// The receipt is not in Git: the repo is public, and every film's address in Blob would let anyone past the copy's lock. The store's
// read/write token lies in .runtime/studio-blob/.env.local (BLOB_READ_WRITE_TOKEN), outside Git, and is never printed.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {objectName, safeRelative, MEDIA_TYPES} from './studio-freeze.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (path.resolve(process.cwd()) !== root) throw Error('Kör från dealer-katalogen.');
const args = process.argv.slice(2), upload = args.includes('--upload');
if (upload && args.includes('--dry-run')) throw Error('Välj --upload eller --dry-run, inte båda.');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const MB = (bytes: number) => (bytes / 1e6).toFixed(1).replace('.', ',');
// A Hobby team has 1 GB of Blob storage and Blob stops for 30 days over it. The copy's team, jakeminator, is on Pro (read
// 2026-11-13 with `vercel api /v2/teams`): there storage is billed by use, with no such stop. The note stays for another team.
const HOBBY_BLOB_BYTES = 1e9;

type Planned = {path: string; sha256: string; bytes: number; type: string; object: string; group: string};
type Entry = {object: string; path: string; sha256: string; bytes: number; url: string};
type Receipt = {schemaVersion: 1; provider: 'vercel-blob'; storeId: string; host: string; access: 'public'; entries: Entry[]};

const plan = JSON.parse(await readFile(path.join(root, '.runtime/studio-deploy/media-plan.json'), 'utf8')) as {sourceCommit: string; trial?: boolean; files: Planned[]};
// A trial build (build-studio-snapshot --prov) writes its plan elsewhere; one that says it is a trial is never uploaded from.
if (plan.trial) throw Error('Planen är ett provbygge; bygg kopian utan --prov först.');
// The plan is checked again here, against the files as they lie now: a film changed since the build is not uploaded.
for (const f of plan.files) {
  if (!safeRelative(f.path) || !/^assets\//.test(f.path) || f.object !== objectName(f.sha256, f.path) || MEDIA_TYPES[path.extname(f.path)] !== f.type) throw Error(`Ogiltig rad i planen: ${f.path}`);
  const bytes = await readFile(path.join(root, ...f.path.split('/')));
  if (bytes.length !== f.bytes || digest(bytes) !== f.sha256) throw Error(`Filen har ändrats sedan kopian byggdes: ${f.path}. Bygg om kopian.`);
}
const receiptFile = path.join(root, '.runtime/studio-blob/studio-media.json');
const existing = await readFile(receiptFile, 'utf8').then(JSON.parse).catch(() => null) as Receipt | null;
const at = args.indexOf('--store'), storeId = at >= 0 ? args[at + 1] : existing?.storeId;
if (storeId !== undefined && !/^store_[A-Za-z0-9]{16}$/.test(storeId)) throw Error('Ogiltigt store-id (store_ följt av 16 tecken).');
if (existing && storeId && existing.storeId !== storeId) throw Error('Kvittot .runtime/studio-blob/studio-media.json gäller en annan Blob-store.');
const host = storeId ? `${storeId.slice(6).toLowerCase()}.public.blob.vercel-storage.com` : null;
const known = new Map((existing?.entries ?? []).map(e => [e.object, e]));
const todo = plan.files.filter(f => !known.has(f.object));
const total = plan.files.reduce((s, f) => s + f.bytes, 0), toSend = todo.reduce((s, f) => s + f.bytes, 0);

const groups = new Map<string, {files: number; bytes: number; todo: number}>();
for (const f of plan.files) { const g = groups.get(f.group) ?? {files: 0, bytes: 0, todo: 0}; g.files++; g.bytes += f.bytes; if (!known.has(f.object)) g.todo++; groups.set(f.group, g); }
console.log(`${upload ? 'Laddar upp' : 'Torrkörning: inget skickas'} · kopian från ${plan.sourceCommit.slice(0, 7)} · store ${storeId ?? '(ingen vald än: --store store_…)'}`);
console.log('  grupp        filer        MB   nya');
for (const [name, g] of groups) console.log(`  ${name.padEnd(10)} ${String(g.files).padStart(7)} ${MB(g.bytes).padStart(9)} ${String(g.todo).padStart(5)}`);
console.log(`  ${'summa'.padEnd(10)} ${String(plan.files.length).padStart(7)} ${MB(total).padStart(9)} ${String(todo.length).padStart(5)}  (${MB(toSend)} MB nytt)`);
if (total > HOBBY_BLOB_BYTES * 0.8) console.log(`OBS: ${MB(total)} MB är nära eller över 1 GB, Hobby-planens tak för Blob. Teamet jakeminator har Pro (inget sådant tak); kontrollera planen om storen ligger i ett annat team.`);
if (!upload) process.exit(0);

// ── Upload (only with --upload) ─────────────────────────────────────────────
if (!storeId || !host) throw Error('Ange vilken Blob-store: --store store_….');
// The checkout's own .env.local holds a Blob key of another store (the speech lane's). Neither it nor any key in the
// environment is ever used here: a key in the environment stops the upload (it came from --env-file or a shell), and the
// copy's key must be another than the checkout's. Only .runtime/studio-blob/.env.local is read for the key.
if (process.env.BLOB_READ_WRITE_TOKEN) throw Error('BLOB_READ_WRITE_TOKEN står i miljön; kör utan --env-file. Kopians nyckel läses bara ur .runtime/studio-blob/.env.local.');
const configured = parseEnv(await readFile(path.join(root, '.runtime/studio-blob/.env.local'), 'utf8'));
const token = configured.BLOB_READ_WRITE_TOKEN;
if (!token?.startsWith(`vercel_blob_rw_${storeId.slice(6)}_`)) throw Error('Nyckeln i .runtime/studio-blob/.env.local hör inte till den storen.');
const checkout = await readFile(path.join(root, '.env.local'), 'utf8').then(text => parseEnv(text).BLOB_READ_WRITE_TOKEN, () => undefined);
if (checkout && (checkout === token || checkout.startsWith(`vercel_blob_rw_${storeId.slice(6)}_`))) throw Error('Nyckeln eller storen är densamma som i utcheckningens .env.local, som hör till en annan bana. Välj kopians egen store.');
// The Blob SDK that ships with the installed Vercel CLI: no new dependency of the project.
const wrapper = execFileSync('volta', ['which', 'vercel'], {encoding: 'utf8', windowsHide: true}).trim();
const packageRoot = path.join(path.dirname(wrapper), 'node_modules/vercel');
JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const blob = createRequire(path.join(packageRoot, 'package.json'))('@vercel/blob');
await mkdir(path.join(root, '.runtime/studio-blob'), {recursive: true});
const progressFile = path.join(root, '.runtime/studio-blob/progress.json');
const entries = new Map(known);
for (const f of todo) {
  const expected = `https://${host}/${f.object}`;
  let url: string | null = null;
  try { const remote = await blob.head(expected, {token, abortSignal: AbortSignal.timeout(30000)}); if (remote.size !== f.bytes) throw Error(`Ett objekt med samma namn men annan storlek finns redan: ${f.object}`); url = remote.url; }
  catch (error) { if (!(error instanceof blob.BlobNotFoundError)) throw error; }
  if (!url) {
    const result = await blob.put(f.object, await readFile(path.join(root, ...f.path.split('/'))), {token, access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: f.type, cacheControlMaxAge: 31536000, multipart: f.bytes > 50_000_000, abortSignal: AbortSignal.timeout(600000)});
    url = result.url as string;
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== host || parsed.pathname !== `/${f.object}` || parsed.search || parsed.hash) throw Error(`Oväntad Blob-adress för ${f.path}.`);
  // Read back anonymously and hashed: only a verified object is written into the receipt.
  const response = await fetch(url, {signal: AbortSignal.timeout(300000)});
  if (!response.ok) throw Error(`Kontrolläsningen gav HTTP ${response.status}: ${f.path}`);
  const back = Buffer.from(await response.arrayBuffer());
  if (back.length !== f.bytes || digest(back) !== f.sha256) throw Error(`Objektet i Blob stämmer inte med filen: ${f.path}`);
  entries.set(f.object, {object: f.object, path: f.path, sha256: f.sha256, bytes: f.bytes, url});
  await writeFile(progressFile, JSON.stringify({storeId, host, entries: [...entries.values()]}, null, 2) + '\n');
  console.log(JSON.stringify({path: f.path, verified: true, done: entries.size, of: plan.files.length}));
}
const receipt: Receipt = {schemaVersion: 1, provider: 'vercel-blob', storeId, host, access: 'public', entries: [...entries.values()].sort((a, b) => a.object.localeCompare(b.object))};
await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
console.log(`Klart: ${entries.size} objekt verifierade. Bygg om kopian (node tools/build-studio-snapshot.ts) så att mellanvaran får adresserna.`);
