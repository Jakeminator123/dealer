// The one way to Runway's developer API: the key in .env.local, the developer project's credits (docs/BESKED.md,
// "API-nyckeln": when Runway's MCP login is missing in a session). A take of an order approved in Beställ is placed with
// `lagg` and brought in with `hamta`, through the receipt tool as the MCP way does (tools/order-clerk.md §3–§4); a call
// outside Beställ, on Jakob's own word for a trial, is placed with `place` and fetched with `collect`.
//
// Every paid call stands in ONE ledger (.runtime/runway-api/ledger.json, outside Git) BEFORE it is sent. A call with
// requestedAt and no task id is OSÄKER: the call may have gone, and it is never sent again (order-clerk.md §3). The caps are
// data/order-policy.json's: maxPerOrder for one call, and the mandate's window, its total and its rolling hour over every
// call in the ledger. The key is read here and never printed; a signed address is never printed or written; the upload
// addresses lie only on D: (docs/DRIFT.md). Never `node -e`.
//
//   node tools/runway-api.ts org                         the balance and the tier (free)
//   node tools/runway-api.ts lagg <orderId> [take]       an approved order's take (1): check, the call, begin, placed or failed
//   node tools/runway-api.ts hamta <orderId> [take]      waits for it, then KLAR, tools/order-collect.ts and HÄMTAD
//   node tools/runway-api.ts place <call.json>           outside Beställ: { name, what, endpoint, body with "$file:<path>", expectCredits }
//   node tools/runway-api.ts collect <name> <outFile>    waits for that call and saves its first output
//   node tools/runway-api.ts task <name>                 a call's state (free), with no address
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, requestOf, type Order } from '../src/order-model.ts';

const LEDGER = '.runtime/runway-api/ledger.json';
const UPLOADS = 'D:/dealer-scratch/tmp/runway-api/uploads.json';
const BASE = 'https://api.dev.runwayml.com', VERSION = '2024-11-06';

type Call = { name: string; what: string; endpoint: string; body: unknown; expectCredits: number };
type Entry = Call & {
  files: Record<string, { sha256: string; bytes: number }>; requestedAt: string; order?: { id: string; take: number };
  taskId?: string; status?: string; error?: string; failure?: string; cost?: number; balanceBefore?: number; balanceAfter?: number;
  finishedAt?: string; delivery?: { path: string; sha256: string; bytes: number };
};
type Ledger = { about: string; pot: string; orders: Entry[] };

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const now = () => new Date().toISOString();
const readJson = <T>(file: string, otherwise: T): T => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : otherwise);
const save = (file: string, value: unknown) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const ledger = (): Ledger => readJson<Ledger>(LEDGER, {
  about: 'Varje betalt anrop genom API-nyckeln, skrivet före anropet (tools/runway-api.ts). Beloppen rapporteras till huvudagenten.',
  pot: 'Runways utvecklarprojekt (API-nyckeln i .env.local), inte MCP-appens krediter.',
  orders: [],
});
const fail = (words: string): never => { console.error(`[RÖD] ${words}`); process.exit(1); };

let headers: Record<string, string> | null = null;
function key() {
  if (headers) return headers;
  process.loadEnvFile('.env.local');
  const k = process.env.RUNWAY_API_KEY ?? process.env.RUNWAYML_API_SECRET;
  if (!k) fail('Ingen RUNWAY_API_KEY i .env.local.');
  headers = { Authorization: `Bearer ${k}`, 'X-Runway-Version': VERSION, 'Content-Type': 'application/json' };
  return headers;
}
async function api(method: string, route: string, body?: unknown) {
  const res = await fetch(BASE + route, { method, headers: key(), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, json };
}
const balance = async () => { const r = await api('GET', '/v1/organization'); if (!r.ok) fail(`organization: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`); return r.json.creditBalance as number; };

/** A file's hosted address (runway://…), uploaded once per content and kept on D: for 20 hours. */
async function upload(file: string): Promise<string> {
  const bytes = readFileSync(file), hash = sha(bytes), known = readJson<Record<string, { uri: string; at: string; file: string }>>(UPLOADS, {});
  const hit = known[hash];
  if (hit && Date.now() - Date.parse(hit.at) < 20 * 3600 * 1000) return hit.uri;
  const start = await api('POST', '/v1/uploads', { filename: path.basename(file), type: 'ephemeral' });
  if (!start.ok) fail(`uploads: ${start.status} ${JSON.stringify(start.json).slice(0, 300)}`);
  const form = new FormData();
  for (const [k, v] of Object.entries(start.json.fields as Record<string, string>)) form.append(k, v);
  form.append('file', new Blob([bytes]), path.basename(file));
  const put = await fetch(start.json.uploadUrl, { method: 'POST', body: form });
  if (!put.ok) fail(`uppladdningen av ${file}: ${put.status}`);
  known[hash] = { uri: start.json.runwayUri, at: now(), file };
  save(UPLOADS, known);
  return start.json.runwayUri;
}
/** The body with every "$file:<path>" uploaded, and the files' hashes. */
async function filled(body: unknown) {
  const files: Entry['files'] = {};
  const fill = async (node: unknown): Promise<unknown> => {
    if (typeof node === 'string' && node.startsWith('$file:')) { const f = node.slice(6), b = readFileSync(f); files[f] = { sha256: sha(b), bytes: b.length }; return upload(f); }
    if (Array.isArray(node)) { const out = []; for (const n of node) out.push(await fill(n)); return out; }
    if (node && typeof node === 'object') { const out: Record<string, unknown> = {}; for (const [k, v] of Object.entries(node)) out[k] = await fill(v); return out; }
    return node;
  };
  return { body: await fill(body), files };
}

/** The policy's caps for one more call of `credits`: refused words, or null. Every call in the ledger counts. */
export function capRefusal(policy: { enabled?: boolean; maxPerOrder?: number; mandate?: { id: string; startsAt: string; endsAt: string; rollingHourCredits: number; totalCredits: number } | null }, calls: readonly Pick<Entry, 'requestedAt' | 'expectCredits' | 'cost' | 'error'>[], credits: number, at = new Date()): string | null {
  if (policy.enabled === false) return 'Beställningarna är avstängda (data/order-policy.json, enabled).';
  if (!(credits > 0)) return 'Anropet saknar sitt pris (expectCredits).';
  if (policy.maxPerOrder !== undefined && credits > policy.maxPerOrder) return `Taket per beställning: ${credits} > ${policy.maxPerOrder}.`;
  const m = policy.mandate;
  if (!m) return 'Inget mandat i data/order-policy.json.';
  const t = at.getTime(), from = Date.parse(m.startsAt), to = Date.parse(m.endsAt);
  if (t < from) return `Mandatet ${m.id} börjar ${m.startsAt}.`;
  if (t >= to) return `Mandatet ${m.id} löpte ut ${m.endsAt}.`;
  const spent = (since: number) => calls.filter((c) => !c.error && Date.parse(c.requestedAt) >= since).reduce((s, c) => s + (c.cost ?? c.expectCredits), 0);
  const total = spent(from), hour = spent(Math.max(from, t - 3600_000));
  if (total + credits > m.totalCredits) return `Mandatet ${m.id}: ${total} + ${credits} > ${m.totalCredits} krediter.`;
  if (hour + credits > m.rollingHourCredits) return `Mandatet ${m.id} den här timmen: ${hour} + ${credits} > ${m.rollingHourCredits} krediter.`;
  return null;
}

/**
 * The developer API's call for take `n` of an approved order: the receipt tool's exact request (requestOf, as begin prints
 * it) in the API's words. Every picture and film is checked by hash against the order. What goes out follows the order:
 * a first picture always, a last picture where it has one, the reference film where its reference is FINNS (and a
 * revansch's earlier film after it). Problems are words; with any, nothing may be sent.
 */
export function apiCallOf(order: Order, n: number, root = '.'): { call: Call | null; problems: string[] } {
  const problems: string[] = [], must = (ok: boolean, what: string) => { if (!ok) problems.push(what); };
  const { tool, args } = requestOf(order, n) as { tool: string; args: Record<string, any> };
  const id = (order as Order & { id: string }).id, dir = `assets/orders/${id}`;
  const wan = args.model === 'wan3';
  must(order.status === 'GODKÄND', `status ${order.status}`);
  must(tool === 'generate_video', `${tool}: en stillbild läggs genom MCP-vägen (tools/order-clerk.md)`);
  must(args.model === 'kling-4' || wan, `modellen ${args.model} har ingen översättning hit`);
  must(args.resolution === '1080p', `upplösningen ${args.resolution}`);
  must(!args.referenceImages, 'ordern har referensbilder');
  if (wan) must(!args.referenceVideos, 'WAN 3 tar ingen referensfilm tillsammans med första och sista bild');
  const known = new Set(['model', 'promptText', 'resolution', 'duration', 'startFrame', 'endFrame', 'referenceVideos', 'confirmRepeat', ...(wan ? ['ratio', 'generateAudio'] : [])]);
  for (const k of Object.keys(args)) must(known.has(k), `okänd parameter ${k}`);
  if (wan) must(args.ratio === 'adaptive' && args.generateAudio === false, 'WAN 3 ska ha ratio adaptive och inget ljud');
  must(sha(args.promptText ?? '') === order.prompt.sha256, 'texten är inte orderns (prompt.sha256)');
  const file = (name: string, want: string | null | undefined) => {
    const p = `${dir}/${name}`;
    if (!existsSync(path.join(root, p))) { problems.push(`${p} saknas`); return; }
    must(sha(readFileSync(path.join(root, p))) === want, `${p} är inte den godkända filen`);
  };
  const first = order.pictures.find((p) => p.goesAs === 'startFrame'), last = order.pictures.find((p) => p.goesAs === 'endFrame');
  must(!!first && args.startFrame?.url === `$file:${first.name}`, 'första bilden');
  if (first) file(first.name, first.sha256);
  if (last) file(last.name, last.sha256);
  const videos: string[] = (args.referenceVideos ?? []).map((v: { url: string }) => v.url.replace(/^\$file:/, ''));
  if (order.reference.status === 'FINNS') file(videos[0] ?? '', order.reference.sha256);
  if (order.revansch) file(videos[videos.length - 1] ?? '', order.revansch.sha256);
  const credits = Number((order as Order & { limits?: { maxCredits?: number } }).limits?.maxCredits ?? order.cost?.worstPerTake);
  const body: Record<string, unknown> = {
    model: wan ? 'wan3' : 'kling_4',
    promptImage: [{ uri: `$file:${dir}/${first?.name}`, position: 'first' }, ...(last ? [{ uri: `$file:${dir}/${last.name}`, position: 'last' }] : [])],
    promptText: args.promptText,
    duration: args.duration,
    ratio: 'auto_1080p',
    ...(wan ? { audio: false } : {}),
    ...(videos.length ? { referenceVideos: videos.map((v) => ({ uri: `$file:${dir}/${v}` })) } : {}),
  };
  const what = `Tagning ${n} av den godkända ordern ${id} (orderSha256 ${order.approval?.orderSha256}): ${order.dealer}, ${order.step?.edge ?? order.step?.key}, ${wan ? 'WAN 3' : 'Kling 4'}, ${args.duration} s, ${last ? 'första och sista bild' : 'bara första bild'}${videos.length ? `, ${videos.length} referensfilm(er)` : ''}.`;
  return { call: problems.length ? null : { name: `${id}-take-${n}`, what, endpoint: '/v1/image_to_video', body, expectCredits: credits }, problems };
}

/** Sends one call that the ledger has never seen, within the caps; the ledger has it before the call goes. */
async function send(call: Call, extra: Partial<Entry> = {}): Promise<Entry> {
  const book = ledger();
  if (book.orders.some((c) => c.name === call.name)) fail(`${call.name} står redan i liggaren: ett anrop läggs en gång.`);
  const refusal = capRefusal(readJson('data/order-policy.json', {}), book.orders, call.expectCredits);
  if (refusal) fail(refusal);
  const { body, files } = await filled(call.body);
  const before = await balance();
  const entry: Entry = { ...call, ...extra, files, requestedAt: now(), balanceBefore: before };
  book.orders.push(entry); save(LEDGER, book);
  const res = await api('POST', call.endpoint, body);
  if (res.ok && res.json.id) { entry.taskId = res.json.id; entry.status = 'LAGD'; }
  else { entry.error = `${res.status} ${JSON.stringify(res.json).slice(0, 900)}`; entry.status = 'MISSLYCKAD'; }
  entry.balanceAfter = await balance().catch(() => undefined);
  save(LEDGER, book);
  return entry;
}

/** Waits for a call's task (25 minutes at most); the task when it has ended, or null. */
async function ended(name: string) {
  for (let round = 0; round < 150; round++) {
    const take = ledger().orders.find((c) => c.name === name);
    if (!take?.taskId) fail(`${name} har inget task-id i liggaren.`);
    const res = await api('GET', `/v1/tasks/${take!.taskId}`);
    if (res.ok && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(res.json.status)) return res.json;
    if (round % 6 === 0) console.log(now(), res.ok ? `${res.json.status} ${res.json.progress ?? ''}` : `tasks ${res.status}`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return null;
}
/** Writes what the task cost and how it ended into the ledger. */
async function settle(name: string, task: any, more: Partial<Entry> = {}) {
  const book = ledger(), take = book.orders.find((c) => c.name === name)!;
  Object.assign(take, more, { finishedAt: now(), balanceAfter: await balance() });
  if (task.status === 'SUCCEEDED') take.status = 'HÄMTAD';
  else { take.status = 'MISSLYCKAD'; take.failure = `${task.failureCode ?? ''} ${task.failure ?? ''}`.trim(); }
  take.cost = task.cost?.credits ?? task.estimatedCost?.credits ?? (take.balanceBefore !== undefined && take.balanceAfter !== undefined && task.status === 'SUCCEEDED' ? take.balanceBefore - take.balanceAfter : take.cost);
  save(LEDGER, book);
  return take;
}

const put = (args: string[]) => execFileSync(process.execPath, ['tools/order-put.ts', ...args], { encoding: 'utf8' });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'org') {
    const r = await api('GET', '/v1/organization');
    console.log(JSON.stringify({ status: r.status, creditBalance: r.json.creditBalance, maxMonthlyCreditSpend: r.json.tier?.maxMonthlyCreditSpend ?? null, at: now() }));
  } else if (cmd === 'lagg') {
    const [id, takeArg = '1'] = args, n = Number(takeArg);
    if (!id || !Number.isInteger(n) || n < 1) fail('node tools/runway-api.ts lagg <orderId> [tagning]');
    const order = readJson<Order | null>(`data/orders/${id}.json`, null) ?? fail(`data/orders/${id}.json finns inte.`);
    const { call, problems } = apiCallOf({ ...order, id } as Order, n);
    if (!call) fail(`${id}: ${problems.join('; ')}. Inget är begärt.`);
    const refusal = capRefusal(readJson('data/order-policy.json', {}), ledger().orders, call!.expectCredits);
    if (refusal) fail(`${refusal} Inget är begärt.`);
    const check = JSON.parse(put(['check', id]));
    if (!check.ok || !check.takes?.some((t: { take: number; mayBegin: boolean }) => t.take === n && t.mayBegin)) fail(`${id} tagning ${n} får inte läggas: ${JSON.stringify(check).slice(0, 600)}`);
    await filled(call!.body);                                                             // the uploads before begin: free, and a failure begins nothing
    const begun = JSON.parse(put(['begin', id, String(n)]));
    if (canonical(begun.request) !== canonical(requestOf(order, n))) {
      put(['failed', id, String(n), 'Inte skickat: begin gav ett annat anrop än ordern (tools/runway-api.ts).']);
      fail(`${id}: begin gav ett annat anrop än ordern; tagningen är märkt som inte skickad.`);
    }
    const entry = await send(call!, { order: { id, take: n } });
    if (entry.taskId) console.log(put(['placed', id, String(n), entry.taskId, String(entry.balanceAfter ?? ''), '--via', 'api'].filter(Boolean)).slice(0, 300));
    else console.log(put(['failed', id, String(n), entry.error ?? 'okänt fel']).slice(0, 300));
    console.log(JSON.stringify({ name: entry.name, status: entry.status, error: entry.error ?? null, balanceBefore: entry.balanceBefore, balanceAfter: entry.balanceAfter ?? null }));
  } else if (cmd === 'hamta') {
    const [id, takeArg = '1'] = args, name = `${id}-take-${takeArg}`;
    if (!id) fail('node tools/runway-api.ts hamta <orderId> [tagning]');
    const task = await ended(name);
    if (!task) fail(`${name}: inte klar efter 25 minuter; kör hamta igen.`);
    if (task.status !== 'SUCCEEDED') {
      const take = await settle(name, task);
      console.log(put(['status', id, takeArg, 'MISSLYCKAD', '--note', take.failure || task.status]).slice(0, 300));
      fail(`${name} föll hos Runway: ${take.failure || task.status}`);
    }
    const url = (task.output as string[])[0];
    put(['status', id, takeArg, 'KLAR']);
    // The signed address goes straight to the project's collector as an argument: never to a shell, a log or a file.
    const out = execFileSync(process.execPath, ['tools/order-collect.ts', id, takeArg, '--url', url], { encoding: 'utf8' });
    const file = `assets/orders/${id}/take-${takeArg}/source.mp4`;
    put(['status', id, takeArg, 'HÄMTAD', '--file', file]);
    const take = await settle(name, task);
    console.log(out.replaceAll(url, '<adressen>').slice(0, 1500));
    console.log(JSON.stringify({ name, status: 'HÄMTAD', file, cost: take.cost ?? null, balanceAfter: take.balanceAfter, next: `node tools/film-after.ts ${id} ${takeArg}` }));
  } else if (cmd === 'place') {
    const call = readJson<Call | null>(args[0] ?? '', null) ?? fail('node tools/runway-api.ts place <call.json>');
    const entry = await send(call!);
    console.log(JSON.stringify({ name: entry.name, status: entry.status, taskId: entry.taskId ?? null, error: entry.error ?? null, balanceBefore: entry.balanceBefore, balanceAfter: entry.balanceAfter ?? null }));
  } else if (cmd === 'collect') {
    const [name, outFile] = args;
    if (!name || !outFile) fail('node tools/runway-api.ts collect <name> <outFile>');
    const task = await ended(name);
    if (!task) fail(`${name}: inte klar efter 25 minuter; kör collect igen.`);
    if (task.status !== 'SUCCEEDED') { const take = await settle(name, task); fail(`${name} föll hos Runway: ${take.failure || task.status}`); }
    const got = await fetch((task.output as string[])[0]);                               // the signed address: fetched here, never printed or written
    if (!got.ok) fail(`hämtningen: ${got.status}`);
    const bytes = Buffer.from(await got.arrayBuffer());
    mkdirSync(path.dirname(outFile), { recursive: true }); writeFileSync(outFile, bytes);
    const take = await settle(name, task, { delivery: { path: outFile, sha256: sha(bytes), bytes: bytes.length } });
    console.log(JSON.stringify({ name, status: take.status, cost: take.cost ?? null, balanceAfter: take.balanceAfter, file: outFile, sha256: sha(bytes), bytes: bytes.length }));
  } else if (cmd === 'task') {
    const take = ledger().orders.find((c) => c.name === args[0]);
    if (!take?.taskId) console.log(JSON.stringify({ name: args[0], taskId: null, requestedAt: take?.requestedAt ?? null }));
    else { const r = await api('GET', `/v1/tasks/${take.taskId}`), t = r.json; console.log(JSON.stringify({ http: r.status, status: t.status, progress: t.progress ?? null, failure: t.failure ?? null, outputs: Array.isArray(t.output) ? t.output.length : 0 })); }
  } else console.log('org | lagg <orderId> [tagning] | hamta <orderId> [tagning] | place <call.json> | collect <name> <outFile> | task <name>');
}
