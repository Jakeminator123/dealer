// Brings one delivered take of an order into the clip bank, under the order's dealer, waiting in the inbox for Jakob.
//   node tools/register-order.ts <order-id> <take> [--split <frame>] [--film <file>] [--id <clip-id>] [--dry]
//   node tools/register-order.ts <order-id> <take> --fixed <k> [--dry]
// Ported from D:/dealer-scratch/tmp/filmagent/register-mcp.mjs, with the dealer and the model taken from the order. A film ordered
// through Runway's app is no job of tools/clip-job.ts (that file's jobs and edits follow the API's rules and are checked as such),
// so it enters the bank the way register-mcp.mjs brought films in: as frames of its own clip, a derived take in
// data/clip-jobs.json, here carrying what it was ordered with (dealer, model, duration, text, first and last picture, the order).
//   - The film is copied to assets/motions/<clip>/source.mp4 with generation.json beside it (the order, the task id, the hashes).
//   - ONE_WAY: one take. ROUND_TRIP (a deal and its return in one film): two takes, split where the return begins (--split, the
//     first frame of the return, from the review); the return starts on that frame of the deal (motion.startsOn).
//   - Every take gets a record motions/<id>.json with review PENDING and review.inbox true: it plays only where its step has no
//     other film until Jakob decides (src/clip-graph.ts); his decision takes the flag away (tools/review-store.ts).
//   - --fixed <k>: the fixed copy fixed-<k>.mp4 beside the film (tools/film-fix.ts) becomes a corrected copy of each of the
//     take's takes (editOf), with its own record in the inbox; it is reviewed again on its own.
// Never writes over a take Jakob has decided on: the whole run is refused, and nothing is written. --dry says what would be written.
import {readFile, writeFile, mkdir, rename, copyFile, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomUUID, createHash} from 'node:crypto';
import path from 'node:path';
import {parseEdge, nodeName, buildGraph, type DerivedTake, type ImageRef} from '../src/clip-graph.ts';
import {probe, sha256File} from './film-fix.ts';
import {orderTake, OrderError, ORDER_ID, type OrderLike} from './order-collect.ts';

const CLIP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROVIDER = 'Runway MCP server (app account credits)';
export type OrderRef = {id: string; take: number; fix?: number};
export type Entry = DerivedTake & {order: OrderRef};
export type Plan = {clip: string; takes: Entry[]; records: Record<string, Record<string, unknown>>; files: {copy: [string, string] | null; generation: [string, Record<string, unknown>]}; notes: string[]};

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const posix = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');
async function writeAtomic(file: string, text: string) { await mkdir(path.dirname(file), {recursive: true}); const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`); await writeFile(temporary, text, {flag: 'wx'}); await rename(temporary, file); }
/** Jakob has decided on a take when its record carries his word, his acceptance or any decision but waiting. */
export const decided = (record: {review?: {decision?: string; userReview?: string; userAccepted?: boolean}} | null) => !!record?.review && (!!record.review.userReview || record.review.userAccepted === true || (!!record.review.decision && record.review.decision !== 'PENDING'));

/** The clip id of a take: the order's id (with the dealer first, as the bank names films) and the take's number. */
export function clipIdOf(order: Pick<OrderLike, 'id' | 'dealer'>, take: number): string {
  const base = order.id.startsWith(`${order.dealer}-`) ? order.id : `${order.dealer}-${order.id}`;
  return `${base}-${String(take).padStart(2, '0')}`;
}
/** The edges a film is cut into: the order's own list for a round trip, else its one edge. */
function edgesOf(order: OrderLike): string[] {
  const shape = order.step?.shape, cut = Array.isArray(order.step?.cutInto) ? order.step!.cutInto! : [];
  if (shape === 'ROUND_TRIP') { if (cut.length !== 2) throw new OrderError(`${order.id}: en tur och retur ska delas i två kanter (step.cutInto).`); return cut; }
  const edge = order.step?.edge ?? cut[0];
  if (typeof edge !== 'string' || !edge.includes('>')) throw new OrderError(`${order.id}: steget saknar kant (step.edge).`);
  return [edge];
}
const picture = (order: OrderLike, goesAs: string): ImageRef | undefined => { const p = order.pictures?.find(x => x.goesAs === goesAs && x.path && x.sha256); return p ? {file: {path: p.path!, sha256: p.sha256!}, note: `${goesAs === 'startFrame' ? 'Första' : 'Sista'} bilden i beställningen ${order.id}.`} : undefined; };
function takeOf(id: string, edge: string, clip: string, frames: [number, number], order: OrderLike, ref: OrderRef, extra: Partial<DerivedTake>): Entry {
  const parsed = parseEdge(edge), [from, to] = edge.split('>').map(nodeName);
  return {id, kind: parsed?.kind ?? '', from, to, clip, frames, purpose: `Beställning ${order.id}, tagning ${ref.take}${ref.fix ? `, rättad kopia ${ref.fix}` : ''}: ${order.title ?? order.step?.label ?? edge}.`,
    dealer: order.dealer, model: ref.fix ? `${order.generation?.model ?? 'okänd'} + film-fix` : order.generation?.model ?? 'okänd', ...(Number.isFinite(Number(order.generation?.params?.duration)) ? {duration: Number(order.generation!.params!.duration)} : {}),
    promptText: order.prompt?.text ?? '', ...extra, order: ref};
}

/** Works out everything a registration writes, and refuses before anything is written. */
export async function planRegistration(root: string, id: string, take: number, options: {split?: number; film?: string; clip?: string; fixed?: number} = {}): Promise<Plan> {
  const {order, entry, folder} = await orderTake(root, id, take), notes: string[] = [];
  if (order.kind !== 'FILM') throw new OrderError(`${id} är en stillbild: den förs in i Material, inte i klippbanken.`);
  if (!order.approval || order.approval.by !== 'jakob') throw new OrderError(`${id} är inte godkänd av Jakob.`);
  if (!entry?.taskId) throw new OrderError(`${id} tagning ${take} har ingen task-id i kvittot: filmen kan inte knytas till beställningen.`);
  if (['MISSLYCKAD', 'AVBRUTEN', 'OSÄKER'].includes(entry.status)) throw new OrderError(`${id} tagning ${take} står som ${entry.status} i kvittot.`);
  const edges = edgesOf(order), trip = edges.length === 2, clip = options.clip ?? clipIdOf(order, take);
  if (!CLIP.test(clip)) throw new OrderError(`Ogiltigt klipp-id: ${clip}.`);
  // The film as delivered: in its take folder, or where the receipt says the clerk put it.
  const named = options.film ?? (existsSync(path.join(folder, `take-${take}`, 'source.mp4')) ? path.join(folder, `take-${take}`, 'source.mp4') : entry.file ? path.join(root, entry.file) : null);
  if (!named || !existsSync(named)) throw new OrderError(`Filmen för ${id} tagning ${take} är inte hämtad (tools/order-collect.ts).`);
  const delivered = path.resolve(named);
  if (!delivered.startsWith(path.resolve(folder) + path.sep)) throw new OrderError(`Filmen ska ligga under assets/orders/${id}/.`);
  const deliveredSha = await sha256File(delivered);
  if (entry.sha256 && entry.file && path.resolve(root, entry.file) === delivered && entry.sha256 !== deliveredSha) throw new OrderError(`${posix(root, delivered)} är inte den fil kvittot hämtade (SHA-256 skiljer).`);
  const ref: OrderRef = {id, take};
  const first = picture(order, 'startFrame'), last = picture(order, 'endFrame');
  let film = delivered, filmSha = deliveredSha, target = clip, frames: number, facts, fix: Record<string, unknown> | null = null, shift = 0;
  const jobsFile = path.join(root, 'data', 'clip-jobs.json'), bank = await json(jobsFile) as {jobs?: {id: string}[]; edits?: {id: string}[]; derived?: Entry[]};
  const ours = (bank.derived ?? []).filter(d => d?.order?.id === id && d.order.take === take && !d.order.fix);
  if (options.fixed !== undefined) {
    // The fixed copy beside the film, made by tools/film-fix.ts from exactly this film.
    if (!ours.length) throw new OrderError(`${id} tagning ${take} är inte införd än: för in originalet först.`);
    const k = options.fixed, copy = path.join(path.dirname(delivered), `fixed-${k}.mp4`), receiptFile = path.join(path.dirname(delivered), `fix-receipt-${k}.json`);
    if (!existsSync(copy) || !existsSync(receiptFile)) throw new OrderError(`fixed-${k}.mp4 och fix-receipt-${k}.json finns inte bredvid ${posix(root, delivered)}.`);
    const receipt = await json(receiptFile);
    if (receipt?.source?.sha256 !== deliveredSha) throw new OrderError(`fixed-${k}.mp4 är inte gjord ur den levererade filmen (kvittots källa skiljer).`);
    film = copy; filmSha = await sha256File(copy);
    if (receipt?.output?.sha256 !== filmSha) throw new OrderError(`fixed-${k}.mp4 är inte den fil kvittot beskriver (SHA-256 skiljer).`);
    shift = Number(receipt.output.frameShift) || 0;
    if (shift && edges.some(e => parseEdge(e)?.kind === 'DEAL')) throw new OrderError(`fixed-${k}.mp4 är kapad ${shift} rutor i början. En rättad giv måste ha originalets rutnummer, annars hamnar returernas skarvar fel: använd hold i stället för trim i början.`);
    target = `${ours[0].clip}-fix-${k}`; ref.fix = k;
    fix = {of: ours[0].clip, receipt: posix(root, receiptFile), receiptSha256: createHash('sha256').update(await readFile(receiptFile)).digest('hex'), steps: (receipt.steps ?? []).map((s: {step: number; op: string; changedFrames: number; maxPixelDiff: number; why: string | null}) => ({step: s.step, op: s.op, why: s.why, changedFrames: s.changedFrames, maxPixelDiff: s.maxPixelDiff})), frameShift: shift};
  }
  facts = probe(film); frames = facts.frames;
  if (!(frames > 1)) throw new OrderError(`${posix(root, film)} har ${frames} rutor.`);
  // The takes and where the film is split.
  const takes: Entry[] = [], records: Plan['records'] = {};
  if (!trip) takes.push(takeOf(target, edges[0], target, [0, frames - 1], order, ref, {...(first ? {first} : {}), ...(last ? {last} : {}), ...(ref.fix ? {editOf: ours[0].id} : {})}));
  else {
    // The original's two takes in film order: the deal, then the return, split where the return begins.
    const [first0, second0] = [...ours].sort((a, b) => a.frames[0] - b.frames[0]), originalDeal = first0?.id, originalBack = second0?.id;
    const split = ref.fix ? (second0 ? second0.frames[0] - shift : NaN) : options.split;
    if (!Number.isInteger(split) || split! < 1 || split! > frames - 1) throw new OrderError(ref.fix ? `Originalets delningsruta saknas eller ligger utanför den rättade kopian (${frames} rutor).` : `En tur och retur delas där returen börjar: ange --split <ruta> (1–${frames - 1}), den första rutan i returen enligt granskningen.`);
    const [dealEdge, backEdge] = edges, backTo = nodeName(backEdge.split('>')[1]).toLowerCase(), deal = `${target}-deal`, back = `${target}-return-${backTo}`;
    takes.push(takeOf(deal, dealEdge, target, [0, split! - 1], order, ref, {...(first ? {first} : {}), ...(ref.fix && originalDeal ? {editOf: originalDeal} : {})}));
    takes.push(takeOf(back, backEdge, target, [split!, frames - 1], order, ref, {...(last ? {last} : {}), ...(ref.fix && originalBack ? {editOf: originalBack} : {})}));
    // The return starts on the frame the deal ends after. A fixed copy keeps the original's frame numbers, so its return follows
    // the original deal and, through it, the fixed one.
    records[back] = {startsOn: {clip: ref.fix && originalDeal ? originalDeal : deal, frame: split}};
    notes.push(`Delad vid ruta ${split}: given ${deal} rutor 0–${split! - 1}, returen ${back} rutor ${split}–${frames - 1}.`);
  }
  // Ids must be new, or ours from an earlier run of the same take.
  const others = new Set([...(bank.jobs ?? []), ...(bank.edits ?? [])].map(x => x?.id)), existing = new Map((bank.derived ?? []).map(d => [d?.id, d]));
  for (const t of takes) {
    if (others.has(t.id)) throw new OrderError(`${t.id} finns redan som jobb eller rättad kopia i data/clip-jobs.json.`);
    const was = existing.get(t.id);
    if (was && !(was.order?.id === id && was.order.take === take && (was.order.fix ?? null) === (ref.fix ?? null))) throw new OrderError(`${t.id} finns redan i data/clip-jobs.json och kommer inte från ${id} tagning ${take}.`);
  }
  // Never over a decision of Jakob's: not the record, not the film, not the entry.
  for (const id2 of [...takes.map(t => t.id), target]) { const file = path.join(root, 'motions', `${id2}.json`); if (existsSync(file) && decided(await json(file))) throw new OrderError(`${id2} har Jakobs beslut: inget skrivs över.`); }
  const dir = path.join(root, 'assets', 'motions', target), source = path.join(dir, 'source.mp4');
  if (existsSync(source) && await sha256File(source) !== filmSha) throw new OrderError(`En annan film ligger redan i ${posix(root, source)}.`);
  const sourceRel = posix(root, source), bytes = (await stat(film)).size, model = order.generation?.model ?? 'okänd';
  const facts2 = {path: sourceRel, sha256: filmSha, bytes, width: facts.width, height: facts.height, fps: facts.rate, frames, provider: ref.fix ? 'tools/film-fix.ts' : PROVIDER, model: ref.fix ? `${model} + film-fix` : model};
  const orderRef = {id, take, path: `data/orders/${id}.json`, orderSha256: order.approval.orderSha256 ?? null, receipt: `assets/orders/${id}/receipt.json`, taskId: entry.taskId, delivered: {path: posix(root, delivered), sha256: deliveredSha}};
  const review = {decision: 'PENDING', inbox: true, basis: `Inte granskad av Jakob: förd in från beställningen ${id}, tagning ${take}${ref.fix ? `, rättad kopia ${ref.fix}` : ''} (tools/register-order.ts). Oberoende rutgranskning: tools/film-review.md.`,
    limitations: 'I inkorgen: spelas bara där steget inte har någon annan film, tills Jakob dömer den.', colorDoesNotProvePhysicalSide: true, userAccepted: false, productionReady: false};
  const record = (t: Entry, extra: Record<string, unknown> = {}) => ({schemaVersion: 1, id: t.id, dealer: order.dealer, source: facts2,
    motion: {kind: t.kind, from: t.from, to: t.to, pass: false, basis: 'SOURCE_FRAME_REVIEW', ...(t.id !== target ? {segment: {clip: target, frames: t.frames}} : {}), ...extra},
    review, order: orderRef, ...(fix ? {fix} : {}), postProcessing: fix ? `tools/film-fix.ts, ${fix.receipt}` : 'none', generationRef: `assets/motions/${target}/generation.json`, jobRef: 'data/clip-jobs.json', scoutIntegrated: false, published: false});
  for (const t of takes) records[t.id] = record(t, records[t.id] ?? {});
  // The clip's own record when the film is split: its facts, read by the bank for both halves (tools/preview.ts clipBank).
  if (trip) records[target] = {schemaVersion: 1, id: target, dealer: order.dealer, source: facts2, cutInto: takes.map(t => t.id), order: orderRef, ...(fix ? {fix} : {}), generationRef: `assets/motions/${target}/generation.json`, jobRef: 'data/clip-jobs.json', scoutIntegrated: false, published: false};
  const generation = {schemaVersion: 1, id: target, edges, takes: takes.map(t => t.id), dealer: order.dealer, purpose: takes[0].purpose, status: 'SUCCEEDED', provider: facts2.provider,
    endpoint: ref.fix ? 'tools/film-fix.ts' : `mcp ${order.generation?.tool ?? 'generate_video'}`, taskId: entry.taskId, model, params: order.generation?.params ?? null, estimatedCredits: 0, appCredits: ref.fix ? 0 : order.cost?.perTake ?? null,
    creditNote: ref.fix ? 'Rättad lokalt ur en levererad film: kostade inga krediter.' : 'Betald med appkontots krediter genom MCP-servern; ingår inte i taket i data/clip-jobs.json.', promptText: order.prompt?.text ?? '', promptSha256: order.prompt?.sha256 ?? null, template: order.prompt?.template ?? null,
    first: first ?? null, last: last ?? null, reference: order.reference ?? null, motion: order.motion ?? null, order: orderRef, requestedAt: entry.requestedAt, ...(fix ? {fix} : {}),
    output: {path: sourceRel, sha256: filmSha, bytes, width: facts.width, height: facts.height, fps: facts.rate, frames, codec: facts.codec, audio: facts.audio}};
  return {clip: target, takes, records, files: {copy: existsSync(source) ? null : [film, source], generation: [path.join(dir, 'generation.json'), generation]}, notes};
}

/** Writes a plan: the film, its receipt, the records and the entries in data/clip-jobs.json, the job file last. */
export async function register(root: string, plan: Plan): Promise<void> {
  if (plan.files.copy) { const [from, to] = plan.files.copy, temporary = `${to}.${randomUUID()}.part`; await mkdir(path.dirname(to), {recursive: true}); await copyFile(from, temporary); await rename(temporary, to); }
  await writeAtomic(plan.files.generation[0], JSON.stringify(plan.files.generation[1], null, 2) + '\n');
  for (const [id, record] of Object.entries(plan.records)) await writeAtomic(path.join(root, 'motions', `${id}.json`), JSON.stringify(record, null, 2) + '\n');
  const file = path.join(root, 'data', 'clip-jobs.json'), data = await json(file);
  data.derived ??= [];
  for (const t of plan.takes) { const at = data.derived.findIndex((d: {id: string}) => d?.id === t.id); if (at < 0) data.derived.push(t); else data.derived[at] = t; }
  await writeAtomic(file, JSON.stringify(data, null, 2) + '\n');
}

if (import.meta.main) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }, number = (v?: string) => v === undefined ? undefined : Number(v);
  const [id, take] = args;
  if (!id || !ORDER_ID.test(id) || !Number.isInteger(Number(take))) { console.error('Användning: node tools/register-order.ts <order-id> <tagning> [--split <ruta>] [--film <fil>] [--id <klipp-id>] [--fixed <k>] [--dry]'); process.exit(1); }
  try {
    const root = process.cwd(), plan = await planRegistration(root, id, Number(take), {split: number(flag('--split')), film: flag('--film'), clip: flag('--id'), fixed: number(flag('--fixed'))});
    if (!args.includes('--dry')) await register(root, plan);
    // What the dealer's graph now makes of it.
    const bank = await json(path.join(root, 'data', 'clip-jobs.json')), dealer = plan.takes[0].dealer!, graph = args.includes('--dry') ? null : buildGraph({jobs: bank.jobs, derived: bank.derived, edits: bank.edits}, {dealer});
    console.log(JSON.stringify({written: !args.includes('--dry'), clip: plan.clip, dealer, takes: plan.takes.map(t => ({id: t.id, edge: `${t.from}>${t.to}`, frames: t.frames, editOf: t.editOf ?? null, placed: graph ? !!graph.takes[t.id] : null})), notes: plan.notes,
      next: [`node tools/track-card.ts ${plan.clip}`, ...plan.takes.filter(t => t.kind === 'DEAL').map(t => `node tools/flip-axis.ts ${t.id}`), `node tools/order-put.ts status ${id} ${take} INFÖRD`]}, null, 2));
  } catch (error) {
    if (error instanceof OrderError) { console.error(error.message); process.exit(2); }
    throw error;
  }
}
