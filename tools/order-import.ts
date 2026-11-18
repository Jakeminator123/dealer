// Brings a take ordered OUTSIDE Beställ into the repo: an agent's call through Runway's MCP server, written down entry by entry
// in a ledger on the scratch disk (bestallningar.json: model, parameters, the text word for word, the pictures and the reference
// film with their hashes, who approved it and on whose word, the call's time, task id and credits, the film as delivered and as
// after-worked). It becomes an order in data/orders/<id>.json and a receipt that say exactly that, marked as placed outside
// Beställ (order.outside, the receipt's take outside: true), so that the bank takes it in the usual way afterwards:
//   node tools/order-import.ts <ledger.json> <entry name> --id <order-id> --step <STEG> [--target P5.C1] --by "<who placed it>"
//                              [--after <after.mp4>] [--flip <FREE|…>] [--dry]
//   then  node tools/order-bring.ts <order-id> 1      (the clip bank's inbox and Material, as for any order)
// The order is GODKÄND with the approval it had at the time (approval.by huvudagent, the main agent's words from the ledger);
// its hash is the order as written here, and order.outside says when, by whom and from which ledger. Every file is checked
// against the ledger's hash before it is copied; nothing is written when one differs, and an order or folder that exists is
// never written over. The text is the one sent, never promptFor's. Times without a zone in the ledger are Swedish time.
// Tests: tools/order-import.test.ts.
import {readFile, writeFile, mkdir, copyFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StoreError} from './placement-store.ts';
import {receipts} from './order-put.ts';
import {probe} from './film-fix.ts';
import {ANCHOR_NODE, MODELS, ORDER_ID, hashInput, seatWords, stepOf, validateOrder, type Order} from '../src/order-model.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
type Named = {file: string; sha256: string; assetId?: string; what?: string};
type Ledger = {about?: string; mandate?: string; sent?: Record<string, Named>; orders: LedgerEntry[]};
type LedgerEntry = {name: string; take?: number; tool: string; model: string; params: {resolution?: string; duration?: number; startFrame?: string | null; endFrame?: string | null; referenceVideos?: {file: string; durationSeconds?: number}[]; ratio?: string | null};
  textFile: string; pictures?: Record<string, Named>; reference?: Record<string, Named>; approvedBy: string; requestedAt: string; taskId: string; credits: number; creditsHow?: string; balanceBefore?: number; balanceAfter?: number;
  delivered: {file: string; sha256: string; fetchedAt?: string}; after?: {file: string; sha256: string; tool?: string}; outcome?: string; dealCheck?: unknown};

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

export type ImportInput = {ledgerPath: string; entry: string; id: string; step: string; target?: string | null; by: string; after?: string | null; flip?: string | null; now?: () => Date};
export type ImportPlan = {order: Order; copies: [string, string, string][]; receipt: {requestedAt: string; taskId: string; creditsRemainingAfter: number | null; file: string; placedBy: string; fetched: string; after: string | null}};

/** Works out the order, the files and the receipt's take, and refuses before anything is written. */
export async function planImport(root: string, input: ImportInput): Promise<ImportPlan> {
  const ledgerFile = path.resolve(input.ledgerPath), base = path.dirname(ledgerFile), ledgerText = await readFile(ledgerFile, 'utf8');
  const ledger = JSON.parse(ledgerText) as Ledger, entry = ledger.orders?.find((o) => o.name === input.entry);
  if (!entry) throw new StoreError(404, `${input.entry} finns inte i ${ledgerFile}.`);
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
  const resolve = (file: string) => (path.isAbsolute(file) ? file : existsSync(path.join(root, file)) ? path.join(root, file) : path.join(base, file));
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
  const named = namedFiles(ledger), pictures: Order['pictures'] = [];
  for (const [goesAs, key, name] of [['startFrame', entry.params.startFrame, 'first.png'], ['endFrame', entry.params.endFrame, 'last.png']] as const) {
    if (!key) continue;
    const n = named[key];
    if (!n) throw new StoreError(404, `${entry.name}: ${key} saknas bland liggarens filer.`);
    await checked(n.file, n.sha256, rel(name));
    pictures.push({name, label: `${goesAs === 'startFrame' ? 'Första' : 'Sista'} bild · ${n.what ?? path.basename(n.file)}`.slice(0, 300), goesAs, path: rel(name), sha256: n.sha256, from: {path: n.file, note: `ur liggaren ${path.basename(ledgerFile)} (${key}${n.assetId ? `, uppladdad som ${n.assetId}` : ''})`}, waits: null} as Order['pictures'][number]);
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
  const text = await readFile(resolve(entry.textFile), 'utf8').then((t) => t.replace(/\s+$/, ''));
  const requestedAt = isoOf(entry.requestedAt), now = (input.now ?? (() => new Date()))().toISOString();
  const edge = step.card ? `${ANCHOR_NODE[step.from]}>${target}` : `${ANCHOR_NODE[step.from]}>${ANCHOR_NODE[step.to!]}`;
  const params: Record<string, unknown> = {resolution: entry.params.resolution, duration: entry.params.duration, ...(entry.params.ratio ? {ratio: entry.params.ratio} : {})};
  const twoHands = step.grip === 'TWO_HANDS';
  const order = {
    schemaVersion: 1, id: input.id,
    title: `${step.label}${target ? ` · ${seatWords(target)}` : ''} · beställd utanför Beställ (${entry.name})`.slice(0, 120),
    summary: `Gör en film av Paow: ${step.label.toLowerCase()}${target ? ` till ${seatWords(target)}` : ''}. Beställd utanför Beställ genom Runways MCP-server och införd i efterhand ur liggaren.`.slice(0, 320),
    group: null, dealer: 'paow', kind: 'FILM',
    step: {key: step.key, label: step.label, edge, shape: 'ONE_WAY', makes: null},
    motion: step.card ? {grip: step.grip ?? 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: input.flip ?? 'FREE', target, side: 'FRONT'} : null,
    pictures, reference,
    generation: {provider: 'runway-app', tool: entry.tool, model: entry.model, params},
    prompt: {template: null, text, sha256: sha(text), extra: null, middle: false},
    takes: 1,
    cost: {perTake: entry.credits, total: entry.credits, worstPerTake: entry.credits, worstTotal: entry.credits, basis: entry.creditsHow ?? 'liggaren'},
    limits: {maxCredits: entry.credits, stopBelowCredits: 0},
    notes: [
      `Beställd utanför Beställ: ${input.by} lade anropet genom Runways MCP-server (${entry.tool}, ${entry.model}) ${entry.requestedAt} svensk tid, task ${entry.taskId}, ${entry.credits} krediter${entry.balanceBefore !== undefined && entry.balanceAfter !== undefined ? ` (saldot ${entry.balanceBefore} före, ${entry.balanceAfter} efter)` : ''}.`,
      `Texten är den som skickades, ord för ord (${entry.textFile}), inte promptFor:s.${twoHands ? ' Vänster hand stryker ut kortet, höger lägger det.' : ''}`,
      ...(entry.outcome ? [`Utfallet enligt den som beställde: ${entry.outcome}`.slice(0, 2000)] : []),
    ],
    created: requestedAt, createdBy: input.by,
    outside: {ledger: ledgerFile.split(path.sep).join('/'), ledgerSha256: sha(ledgerText), entry: entry.name, placedBy: input.by, approvedBy: entry.approvedBy, mandate: ledger.mandate ?? null, importedAt: now, importedBy: 'tools/order-import.ts',
      note: 'Godkänd av huvudagenten före anropet, med orden i approvedBy; approval nedan är det godkännandet, skrivet när ordern fördes in, med hashen av ordern som den står här.'},
    approval: null as Order['approval'], status: 'GODKÄND',
  } as unknown as Order & {outside: unknown};
  order.approval = {by: 'huvudagent', at: requestedAt, orderSha256: '', mandate: entry.approvedBy.slice(0, 300)} as Order['approval'];
  order.approval!.orderSha256 = sha(hashInput(order));
  const {errors} = validateOrder(order);
  if (errors.length) throw new StoreError(422, `Ordern håller inte: ${errors.join(' ')}`);
  const fetched = `hämtad av ${input.by}${entry.delivered.fetchedAt ? ` ${entry.delivered.fetchedAt} svensk tid` : ''} utanför repot; kopierad hit oförändrad ur ${entry.delivered.file} med liggarens hash`;
  return {order, copies, receipt: {requestedAt, taskId: entry.taskId, creditsRemainingAfter: entry.balanceAfter ?? null, file: rel('take-1/source.mp4'), placedBy: input.by, fetched, after: afterNote}};
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
    if (!ledgerPath || !entry || ledgerPath.startsWith('--') || entry.startsWith('--')) throw new StoreError(400, 'Använd: node tools/order-import.ts <liggare.json> <post> --id <order-id> --step <STEG> [--target P5.C1] --by "<vem>" [--after <after.mp4>] [--flip <vändning>] [--dry]');
    const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
    const plan = await planImport(root, {ledgerPath, entry, id: flag('--id') ?? '', step: flag('--step') ?? '', target: flag('--target') ?? null, by: flag('--by') ?? '', after: flag('--after') ?? null, flip: flag('--flip') ?? null});
    if (!args.includes('--dry')) await writeImport(root, plan);
    console.log(JSON.stringify({written: !args.includes('--dry'), order: `data/orders/${plan.order.id}.json`, title: plan.order.title, files: plan.copies.map(([, to]) => path.relative(root, to).split(path.sep).join('/')), receipt: plan.receipt,
      next: [`node tools/order-put.ts review ${plan.order.id} 1 --note "Oberoende granskare: …"`, `node tools/order-bring.ts ${plan.order.id} 1`]}, null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
