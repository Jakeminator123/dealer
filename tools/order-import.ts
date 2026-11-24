// Brings a take ordered OUTSIDE Beställ into the repo: an agent's call through Runway's MCP server, written down entry by entry
// in a ledger on the scratch disk (bestallningar.json: model, parameters, the text word for word, the pictures and the reference
// film with their hashes, who approved it and on whose word, the call's time, task id and credits, the film as delivered and as
// after-worked), or a call through the API key, as the API client's ledger has it (.runtime/natt-1121/api/ledger.json: the
// endpoint, the body as sent, the files with their hashes, the delivery; fromApiEntry reads it). It becomes an order in
// data/orders/<id>.json and a receipt that say exactly that, marked as placed outside Beställ (order.outside, the receipt's
// take outside: true, and via: api for a call through the API key), so that the bank takes it in the usual way afterwards:
//   node tools/order-import.ts <ledger.json> <entry name> --id <order-id> --step <STEG> [--target P5.C1] --by "<who placed it>"
//                              [--shape ROUND_TRIP] [--no-pass] [--files <folder>] [--after <after.mp4>] [--flip <FREE|…>] [--dry]
//                              [--first <Material id>] [--word "<whose word, and when>"]
// A call to /v1/video_to_video (the model as editor: the film it made over is the order's reference film, and a picture sent
// as references is named in the notes) is read like one from pictures. --first: the first picture IS that picture of Material
// (the same bytes, or the picture its receipt says it was made from; checked), so that the film stands on it in the dealer's
// tree (a seat's anchor). --word: the call was placed on that word and not on the main agent's approval; the order says so
// (outside.note, approval.mandate).
//   then  node tools/film-after.ts <order-id> 1 (unless --after) and node tools/order-bring.ts <order-id> 1
//         (the clip bank's inbox and Material, as for any order)
// --shape ROUND_TRIP: the film is a deal and its return in one, and the bank splits it (step.cutInto). --no-pass: in a deal with
// two hands, the hand at the shoe lays the card itself. --files: the folder the ledger's files lie in now, found there by file name (a copy kept beside
// a proof); the hashes are the ledger's all the same.
// The order is GODKÄND with the approval it had at the time (approval.by huvudagent, the main agent's words from the ledger);
// its hash is the order as written here, and order.outside says when, by whom and from which ledger. Every file is checked
// against the ledger's hash before it is copied; nothing is written when one differs, and an order or folder that exists is
// never written over. The text is the one sent, never promptFor's. Times without a zone in the ledger are Swedish time.
// No test of its own holds it now (tools/order-import.test.ts is gone); run it with --dry first.
import {readFile, writeFile, mkdir, copyFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StoreError} from './placement-store.ts';
import {receipts} from './order-put.ts';
import {probe} from './film-fix.ts';
import {ANCHOR_NODE, MODELS, ORDER_ID, cutIntoOf, hashInput, seatWords, stepOf, validateOrder, type Order, type Shape} from '../src/order-model.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
type Named = {file: string; sha256: string; assetId?: string; what?: string};
type Ledger = {about?: string; mandate?: string; sent?: Record<string, Named>; orders: LedgerEntry[]};
type LedgerEntry = {name: string; take?: number; tool: string; model: string; params: {resolution?: string; duration?: number; startFrame?: string | null; endFrame?: string | null; referenceVideos?: {file: string; durationSeconds?: number}[]; ratio?: string | null};
  textFile?: string; text?: string; channel?: 'api' | 'mcp'; pictures?: Record<string, Named>; reference?: Record<string, Named>; approvedBy: string; requestedAt: string; taskId: string; credits: number; creditsHow?: string; balanceBefore?: number; balanceAfter?: number;
  delivered: {file: string; sha256: string; fetchedAt?: string}; after?: {file: string; sha256: string; tool?: string}; outcome?: string; dealCheck?: unknown; how?: string};
/** An entry of the API client's ledger: the call as it was sent to Runway's API, and what came back. */
type ApiEntry = {name: string; what?: string; endpoint: string; body: {model: string; promptImage?: {uri: string; position: string}[]; promptText: string; duration: number; ratio?: string; referenceVideos?: {uri: string}[]; videoUri?: string; references?: {uri: string}[]};
  files?: Record<string, {sha256: string}>; requestedAt: string; finishedAt?: string; taskId: string; cost?: number; expectCredits?: number; balanceBefore?: number; balanceAfter?: number; delivery?: {path: string; sha256: string}};
/** The API's names of the models the order model knows. */
const API_MODELS: Record<string, string> = {kling_4: 'kling-4'};

/** An entry of the API client's ledger in the form the MCP ledgers have, so that one plan serves both. */
export function fromApiEntry(e: ApiEntry): LedgerEntry {
  const edited = e.endpoint === '/v1/video_to_video'; // the model as editor: body.videoUri is the film it makes over
  if (e.endpoint !== '/v1/image_to_video' && !edited) throw new StoreError(400, `${e.name}: ${e.endpoint} är inget filmanrop ur bilder eller ur en film.`);
  if (edited && !e.body.videoUri) throw new StoreError(400, `${e.name}: ${e.endpoint} utan film att göra om (videoUri).`);
  const model = API_MODELS[e.body.model];
  if (!model) throw new StoreError(400, `${e.name}: ${e.body.model} är ingen modell ordermodellen känner.`);
  if (!e.delivery) throw new StoreError(400, `${e.name}: liggaren har ingen leverans.`);
  const file = (uri: string) => uri.replace(/^\$file:/, ''), at = (position: string) => { const p = e.body.promptImage?.find((x) => x.position === position); return p ? file(p.uri) : null; };
  const named = (keys: (string | null)[]) => Object.fromEntries(keys.filter((k): k is string => !!k).map((k) => { const f = e.files?.[k]; if (!f) throw new StoreError(404, `${e.name}: ${k} saknas bland liggarens filer.`); return [k, {file: k, sha256: f.sha256}]; }));
  const films = edited ? [file(e.body.videoUri!)] : (e.body.referenceVideos ?? []).map((v) => file(v.uri)), looks = edited ? (e.body.references ?? []).map((r) => file(r.uri)) : [];
  const how = edited ? `Gjord med modellen som redigerare (${e.endpoint}): referensfilmen är filmen som gjordes om, och den nya följer dess rörelse${looks.length ? `; ${looks.join(', ')} gick med som bild av utseendet (references)` : ''}.` : undefined;
  return {name: e.name, tool: MODELS[model].tool, model, channel: 'api', text: e.body.promptText, ...(how ? {how} : {}),
    params: {resolution: /^auto_(\d+p)$/.exec(e.body.ratio ?? '')?.[1], duration: e.body.duration, startFrame: at('first'), endFrame: at('last'), referenceVideos: films.map((f) => ({file: f}))},
    pictures: named([at('first'), at('last')]), reference: named(films), approvedBy: e.what ?? '', requestedAt: e.requestedAt, taskId: e.taskId,
    credits: e.cost ?? e.expectCredits ?? 0, creditsHow: e.cost === undefined ? 'liggarens väntade belopp' : 'liggaren: saldot före minus saldot efter', balanceBefore: e.balanceBefore, balanceAfter: e.balanceAfter,
    delivered: {file: e.delivery.path, sha256: e.delivery.sha256, fetchedAt: e.finishedAt}};
}

/** A ledger time as ISO: one with a zone as it stands, one without (the ledgers write Swedish time) in Europe/Stockholm. */
export function isoOf(at: string, zone = 'Europe/Stockholm'): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(at)) return new Date(at).toISOString();
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(at);
  if (!local) throw new StoreError(400, `Tiden ${at} går inte att läsa.`);
  const [y, mo, d, h, mi, s] = local.slice(1).map(Number), guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  const shown = new Intl.DateTimeFormat('en-GB', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(guess));
  const part = (t: string) => Number(shown.find((p) => p.type === t)?.value);
  const offset = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - guess;
  return new Date(guess - offset).toISOString();
}

/** Every named file of a ledger: what it sent first (sent), each entry's pictures and reference films, by the name the entries use. */
export function namedFiles(ledger: Ledger): Record<string, Named> {
  const out: Record<string, Named> = {...(ledger.sent ?? {})};
  for (const e of ledger.orders ?? []) Object.assign(out, e.pictures ?? {}, e.reference ?? {});
  return out;
}

export type ImportInput = {ledgerPath: string; entry: string; id: string; step: string; target?: string | null; by: string; after?: string | null; flip?: string | null; shape?: Shape | null; pass?: boolean; files?: string | null; first?: string | null; word?: string | null; now?: () => Date};
export type ImportPlan = {order: Order; copies: [string, string, string][]; receipt: {requestedAt: string; taskId: string; creditsRemainingAfter: number | null; file: string; placedBy: string; fetched: string; after: string | null; via?: 'api' | 'mcp'}};

/** A picture of Material named as an order's first picture (--first): the dealer's own, and the same bytes as the one that was sent. */
async function materialPicture(root: string, id: string, sha256: string): Promise<{id: string; path: string; name: string; how?: string}> {
  const roles = JSON.parse(await readFile(path.join(root, 'data', 'media-roles.json'), 'utf8')) as {dealers: Record<string, {entries: {id: string; path?: string; name?: string}[]}>};
  const found = roles.dealers.paow?.entries.find((e) => e.id === id);
  if (!found?.path) throw new StoreError(404, `${id} är ingen bild för Paow i Material.`);
  // The picture itself, or the picture it was made from: a still brought to the bank's frame names the still as delivered in its receipt (madeFrom).
  const file = path.join(root, ...found.path.split('/')), receipt = path.join(path.dirname(file), 'receipt.json');
  const madeFrom = existsSync(receipt) ? (JSON.parse(await readFile(receipt, 'utf8')) as {madeFrom?: {sha256?: string; how?: string}}).madeFrom : undefined;
  const same = sha(await readFile(file)) === sha256;
  if (!same && madeFrom?.sha256 !== sha256) throw new StoreError(409, `${id} är varken bilden som skickades eller gjord av den (sha256 skiljer).`);
  return {id, path: found.path, name: found.name ?? id, ...(same ? {} : {how: `${id} är den skickade bilden ${madeFrom!.how ?? 'i bankens ram'}`})};
}

/** Works out the order, the files and the receipt's take, and refuses before anything is written. */
export async function planImport(root: string, input: ImportInput): Promise<ImportPlan> {
  const ledgerFile = path.resolve(input.ledgerPath), base = path.dirname(ledgerFile), ledgerText = await readFile(ledgerFile, 'utf8');
  // The ledger as the order names it: from the project's root when it lies inside the project (the repo is public, and an absolute
  // path carries this machine's folders), as it stands when it lies outside (the scratch disk).
  const inRoot = path.relative(root, ledgerFile), ledgerSaid = (inRoot.startsWith('..') || path.isAbsolute(inRoot) ? ledgerFile : inRoot).split(path.sep).join('/');
  const ledger = JSON.parse(ledgerText) as Ledger, raw = ledger.orders?.find((o) => o.name === input.entry) as LedgerEntry | ApiEntry | undefined;
  if (!raw) throw new StoreError(404, `${input.entry} finns inte i ${ledgerFile}.`);
  const entry = 'endpoint' in raw ? fromApiEntry(raw) : raw, api = entry.channel === 'api';
  const channel = api ? 'Runways API (utvecklarprojektets krediter)' : 'Runways MCP-server', when = (at: string) => (/[zZ]|[+-]\d{2}:\d{2}$/.test(at) ? at : `${at} svensk tid`);
  if (!ORDER_ID.test(input.id)) throw new StoreError(400, `Ogiltigt beställnings-id: ${input.id}.`);
  if (existsSync(path.join(root, 'data', 'orders', `${input.id}.json`)) || existsSync(path.join(root, 'assets', 'orders', input.id))) throw new StoreError(409, `${input.id} finns redan; inget skrivs över.`);
  const step = stepOf(input.step);
  if (!step || step.kind !== 'FILM') throw new StoreError(400, `${input.step} är inget filmsteg.`);
  const model = MODELS[entry.model];
  if (!model || model.tool !== entry.tool) throw new StoreError(400, `${entry.model} genom ${entry.tool} är ingen modell ordermodellen känner.`);
  const target = step.card ? (input.target ?? null) : null;
  if (step.card && !target) throw new StoreError(400, `${step.label}: säg kortets plats (--target).`);
  if (!input.by?.trim()) throw new StoreError(400, 'Säg vem som lade anropet (--by).');
  if (!/^[A-Za-z0-9-]{8,80}$/.test(entry.taskId ?? '')) throw new StoreError(400, `${entry.name}: liggaren har inget task-id.`);
  const shape: Shape = input.shape ?? 'ONE_WAY', cutInto = cutIntoOf(step, target, shape);
  if (shape === 'ROUND_TRIP' && cutInto.length !== 2) throw new StoreError(400, `${step.label} går inte att dela i en giv och en retur.`);
  const kept = input.files ? path.resolve(root, input.files) : null;
  const resolve = (file: string) => (kept && existsSync(path.join(kept, path.basename(file))) ? path.join(kept, path.basename(file)) : path.isAbsolute(file) ? file : existsSync(path.join(root, file)) ? path.join(root, file) : path.join(base, file));
  const shown = (file: string) => { const r = path.relative(root, resolve(file)); return r.startsWith('..') || path.isAbsolute(r) ? file : r.split(path.sep).join('/'); };
  const folder = path.join(root, 'assets', 'orders', input.id), rel = (name: string) => `assets/orders/${input.id}/${name}`;
  const copies: ImportPlan['copies'] = [];
  async function checked(from: string, want: string, to: string): Promise<Buffer> {
    const file = resolve(from);
    if (!existsSync(file)) throw new StoreError(404, `${from} finns inte.`);
    const bytes = await readFile(file);
    if (sha(bytes) !== want) throw new StoreError(409, `${from} är inte filen liggaren beskriver (sha256 skiljer).`);
    copies.push([file, path.join(root, ...to.split('/')), want]);
    return bytes;
  }
  // The pictures and the reference film, by the names the entry's parameters use.
  const named = {...namedFiles(ledger), ...(entry.pictures ?? {}), ...(entry.reference ?? {})}, pictures: Order['pictures'] = [];
  for (const [goesAs, key, name] of [['startFrame', entry.params.startFrame, 'first.png'], ['endFrame', entry.params.endFrame, 'last.png']] as const) {
    if (!key) continue;
    const n = named[key];
    if (!n) throw new StoreError(404, `${entry.name}: ${key} saknas bland liggarens filer.`);
    await checked(n.file, n.sha256, rel(name));
    const material = goesAs === 'startFrame' && input.first ? await materialPicture(root, input.first, n.sha256) : null;
    pictures.push({name, label: `${goesAs === 'startFrame' ? 'Första' : 'Sista'} bild · ${material?.name ?? n.what ?? path.basename(n.file)}`.slice(0, 300), goesAs, path: rel(name), sha256: n.sha256, from: {...(material ? {entry: material.id} : {}), path: material?.path ?? shown(n.file), note: `ur liggaren ${path.basename(ledgerFile)} (${key}${n.assetId ? `, uppladdad som ${n.assetId}` : ''})${material?.how ? `; ${material.how}` : ''}`}, waits: null} as Order['pictures'][number]);
  }
  if (!pictures.some((p) => p.goesAs === 'startFrame')) throw new StoreError(400, `${entry.name}: ingen första bild.`);
  const refKey = entry.params.referenceVideos?.[0]?.file ?? null;
  let reference: Order['reference'] = {status: 'INGEN', why: 'Ingen referensfilm skickades (liggaren).'};
  if (refKey) {
    const n = named[refKey];
    if (!n) throw new StoreError(404, `${entry.name}: referensfilmen ${refKey} saknas bland liggarens filer.`);
    await checked(n.file, n.sha256, rel('reference.mp4'));
    const facts = probe(resolve(n.file)), seconds = Math.round((facts.frames / facts.rate) * 1000) / 1000;
    const rendered = (JSON.parse(await readFile(path.join(root, 'data', 'rendered-references.json'), 'utf8').catch(() => '{}')) as {films?: {id: string; sha256: string}[]}).films?.find((f) => f.sha256 === n.sha256);
    reference = {status: 'FINNS', clips: rendered ? [rendered.id] : [], path: rel('reference.mp4'), sha256: n.sha256, seconds, goesTo: target ?? '', approvedStraight: false, ...(rendered ? {dealer: 'docka'} : {})} as Order['reference'];
  }
  // The film as delivered, and as after-worked where the ledger says so.
  await checked(entry.delivered.file, entry.delivered.sha256, rel('take-1/source.mp4'));
  let afterNote: string | null = null;
  if (input.after) {
    if (!entry.after) throw new StoreError(400, `${entry.name}: liggaren säger inget efterarbete.`);
    if (path.resolve(input.after) !== path.resolve(resolve(entry.after.file))) throw new StoreError(400, `--after ska vara liggarens ${entry.after.file}.`);
    await checked(entry.after.file, entry.after.sha256, rel('take-1/after.mp4'));
    const receiptBeside = path.join(path.dirname(resolve(entry.after.file)), 'after.json');
    if (existsSync(receiptBeside)) copies.push([receiptBeside, path.join(folder, 'take-1', 'after.json'), sha(await readFile(receiptBeside))]);
    afterNote = `efterarbetad utanför repot: ${entry.after.tool ?? 'tools/film-after.ts'}; after.mp4 och after.json kopierade hit oförändrade`;
  }
  if (entry.text === undefined && !entry.textFile) throw new StoreError(400, `${entry.name}: liggaren har ingen text.`);
  const text = (entry.text ?? await readFile(resolve(entry.textFile!), 'utf8')).replace(/\s+$/, ''), textFrom = entry.textFile ?? 'liggarens body.promptText';
  const requestedAt = isoOf(entry.requestedAt), now = (input.now ?? (() => new Date()))().toISOString();
  const edge = step.card ? `${ANCHOR_NODE[step.from]}>${target}` : `${ANCHOR_NODE[step.from]}>${ANCHOR_NODE[step.to!]}`;
  const params: Record<string, unknown> = {resolution: entry.params.resolution, duration: entry.params.duration, ...(entry.params.ratio ? {ratio: entry.params.ratio} : {})};
  const twoHands = step.grip === 'TWO_HANDS', pass = input.pass ?? twoHands;
  const order = {
    schemaVersion: 1, id: input.id,
    title: `${step.label}${target ? ` · ${seatWords(target)}` : ''} · beställd utanför Beställ (${entry.name})`.slice(0, 120),
    summary: `Gör en film av Paow: ${step.label.toLowerCase()}${target ? ` till ${seatWords(target)}` : ''}${shape === 'ROUND_TRIP' ? ', tur och retur' : ''}. Beställd utanför Beställ genom ${channel} och införd i efterhand ur liggaren.`.slice(0, 320),
    group: null, dealer: 'paow', kind: 'FILM',
    step: {key: step.key, label: step.label, edge, shape, cutInto, makes: null},
    motion: step.card ? {grip: step.grip ?? 'PINCH', hand: 'LH', pass, turn: true, flipAxis: input.flip ?? 'FREE', target, side: 'FRONT'} : null,
    pictures, reference,
    generation: {provider: 'runway-app', tool: entry.tool, model: entry.model, params},
    prompt: {template: null, text, sha256: sha(text), extra: null, middle: false},
    takes: 1,
    cost: {perTake: entry.credits, total: entry.credits, worstPerTake: entry.credits, worstTotal: entry.credits, basis: entry.creditsHow ?? 'liggaren'},
    limits: {maxCredits: entry.credits, stopBelowCredits: 0},
    notes: [
      `Beställd utanför Beställ: ${input.by} lade anropet genom ${channel} (${entry.tool}, ${entry.model}) ${when(entry.requestedAt)}, task ${entry.taskId}, ${entry.credits} krediter${entry.balanceBefore !== undefined && entry.balanceAfter !== undefined ? ` (saldot ${entry.balanceBefore} före, ${entry.balanceAfter} efter)` : ''}.`,
      `Texten är den som skickades, ord för ord (${textFrom}), inte promptFor:s.${twoHands && pass ? ' Vänster hand stryker ut kortet, höger lägger det.' : ''}`,
      ...(entry.how ? [entry.how.slice(0, 2000)] : []),
      ...(entry.outcome ? [`Utfallet enligt den som beställde: ${entry.outcome}`.slice(0, 2000)] : []),
    ],
    created: requestedAt, createdBy: input.by,
    outside: {ledger: ledgerSaid, ledgerSha256: sha(ledgerText), entry: entry.name, placedBy: input.by, approvedBy: entry.approvedBy, mandate: api ? null : ledger.mandate ?? null, importedAt: now, importedBy: 'tools/order-import.ts',
      note: input.word?.trim()
        ? 'Lagd på det ord som står i approval.mandate, inte på huvudagentens godkännande i Beställ; approvedBy är anropets egen beskrivning i liggaren. approval nedan skrevs när ordern fördes in, så att banken tar emot den, med hashen av ordern som den står här.'
        : 'Godkänd av huvudagenten före anropet, med orden i approvedBy; approval nedan är det godkännandet, skrivet när ordern fördes in, med hashen av ordern som den står här.'},
    approval: null as Order['approval'], status: 'GODKÄND',
  } as unknown as Order & {outside: unknown};
  order.approval = {by: 'huvudagent', at: requestedAt, orderSha256: '', mandate: (input.word?.trim() || entry.approvedBy).slice(0, 300)} as Order['approval'];
  order.approval!.orderSha256 = sha(hashInput(order));
  const {errors} = validateOrder(order);
  if (errors.length) throw new StoreError(422, `Ordern håller inte: ${errors.join(' ')}`);
  const fetched = `hämtad av ${input.by}${entry.delivered.fetchedAt ? ` ${when(entry.delivered.fetchedAt)}` : ''} utanför repot; kopierad hit oförändrad ur ${shown(entry.delivered.file)} med liggarens hash`;
  return {order, copies, receipt: {requestedAt, taskId: entry.taskId, creditsRemainingAfter: entry.balanceAfter ?? null, file: rel('take-1/source.mp4'), placedBy: input.by, fetched, after: afterNote, ...(entry.channel ? {via: entry.channel} : {})}};
}

/** Writes a plan: the files (each checked again), the order, then the receipt through tools/order-put.ts. Undone on a failure. */
export async function writeImport(root: string, plan: ImportPlan, now?: () => Date): Promise<void> {
  const folder = path.join(root, 'assets', 'orders', plan.order.id), file = path.join(root, 'data', 'orders', `${plan.order.id}.json`);
  await mkdir(path.dirname(folder), {recursive: true});
  await mkdir(folder);
  try {
    for (const [from, to, want] of plan.copies) {
      await mkdir(path.dirname(to), {recursive: true});
      await copyFile(from, to);
      if (sha(await readFile(to)) !== want) throw new StoreError(409, `${to} blev inte den fil liggaren beskriver.`);
    }
    await writeFile(file, JSON.stringify(plan.order, null, 2) + '\n', {flag: 'wx'});
    await receipts(root, now ? {now} : {}).imported(plan.order.id, 1, plan.receipt);
  } catch (error) {
    await rm(folder, {recursive: true, force: true});
    await rm(file, {force: true});
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const [ledgerPath, entry] = args;
  try {
    if (!ledgerPath || !entry || ledgerPath.startsWith('--') || entry.startsWith('--')) throw new StoreError(400, 'Använd: node tools/order-import.ts <liggare.json> <post> --id <order-id> --step <STEG> [--target P5.C1] --by "<vem>" [--shape ROUND_TRIP] [--no-pass] [--files <mapp>] [--after <after.mp4>] [--flip <vändning>] [--first <bild i Material>] [--word "<vems ord och när>"] [--dry]');
    const shape = flag('--shape') ?? null;
    if (shape !== null && shape !== 'ROUND_TRIP' && shape !== 'ONE_WAY') throw new StoreError(400, '--shape är ROUND_TRIP eller ONE_WAY.');
    const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
    const plan = await planImport(root, {ledgerPath, entry, id: flag('--id') ?? '', step: flag('--step') ?? '', target: flag('--target') ?? null, by: flag('--by') ?? '', after: flag('--after') ?? null, flip: flag('--flip') ?? null, shape, pass: args.includes('--no-pass') ? false : undefined, files: flag('--files') ?? null, first: flag('--first') ?? null, word: flag('--word') ?? null});
    if (!args.includes('--dry')) await writeImport(root, plan);
    console.log(JSON.stringify({written: !args.includes('--dry'), order: `data/orders/${plan.order.id}.json`, title: plan.order.title, files: plan.copies.map(([, to]) => path.relative(root, to).split(path.sep).join('/')), receipt: plan.receipt,
      next: [...(plan.receipt.after ? [] : [`node tools/film-after.ts ${plan.order.id} 1`]), `node tools/order-put.ts review ${plan.order.id} 1 --note "Oberoende granskare: …"`, `node tools/order-bring.ts ${plan.order.id} 1`]}, null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
