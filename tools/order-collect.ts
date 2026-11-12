// Fetches one delivered take of an order into place, hashes and probes it. Orders nothing and spends nothing.
//   node tools/order-collect.ts <order-id> <take> --url <the delivered file's signed address>
//   node tools/order-collect.ts <order-id> <take> --from <a file already downloaded>
// Writes assets/orders/<id>/take-<n>/source.mp4 (the original: never changed afterwards) and fetched.json beside it (SHA-256,
// bytes, the film's facts from ffprobe, where it came from: host and path only). The signed address itself is never written or
// printed: its query carries the signature. receipt.json is not touched (only tools/order-put.ts writes it); the commands that
// come next are printed.
// Reads only the fields it needs: the order's id, dealer, kind and number of takes, and the take's task id and status in the receipt.
import {readFile, writeFile, mkdir, rename, rm, copyFile, stat} from 'node:fs/promises';
import {createWriteStream, existsSync} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {probe, sha256File} from './film-fix.ts';

export const ORDER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FETCH_LIMIT = 800_000_000; // bytes; a 7 s film in 1080p is some tens of MB
export type OrderLike = {id: string; dealer: string; kind: string; takes: number; title?: string; step?: {key?: string; label?: string; edge?: string | null; shape?: string | null; cutInto?: string[]};
  approval?: {by?: string; at?: string; orderSha256?: string} | null; generation?: {tool?: string; model?: string; params?: Record<string, unknown>}; prompt?: {text?: string; sha256?: string; template?: string};
  pictures?: {name: string; goesAs: string; path: string | null; sha256: string | null; drawn?: unknown}[]; reference?: {status?: string; path?: string; sha256?: string; clips?: string[]}; motion?: Record<string, unknown> | null; cost?: {perTake?: number}};
export type ReceiptTake = {take: number; status: string; requestedAt: string | null; taskId: string | null; file?: string | null; sha256?: string | null};
export class OrderError extends Error {}

const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
/** The order and its take as the receipt has it. The order file is the order builder's (src/order-model.ts); only these fields are read. */
export async function orderTake(root: string, id: string, take: number): Promise<{order: OrderLike; receipt: {takes?: ReceiptTake[]} | null; entry: ReceiptTake | null; folder: string}> {
  if (!ORDER_ID.test(id)) throw new OrderError(`Ogiltigt beställnings-id: ${id}.`);
  const file = path.join(root, 'data', 'orders', `${id}.json`);
  if (!existsSync(file)) throw new OrderError(`Beställningen ${id} finns inte (data/orders/${id}.json).`);
  const order = await json(file) as OrderLike;
  if (order.id !== id || typeof order.dealer !== 'string' || !/^[a-z0-9]+$/.test(order.dealer)) throw new OrderError(`${id}: beställningen saknar id eller dealer.`);
  if (!Number.isInteger(take) || take < 1 || take > Number(order.takes)) throw new OrderError(`${id} har tagning 1–${order.takes}, inte ${take}.`);
  const folder = path.join(root, 'assets', 'orders', id), receiptFile = path.join(folder, 'receipt.json');
  const receipt = existsSync(receiptFile) ? await json(receiptFile) : null, entry = (receipt?.takes ?? []).find((t: ReceiptTake) => t?.take === take) ?? null;
  return {order, receipt, entry, folder};
}
const posix = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');

export type Collected = {path: string; sha256: string; bytes: number; already: boolean; record: Record<string, unknown>; next: string[]};
/** Fetches (url) or copies (from) the take's film into assets/orders/<id>/take-<n>/source.mp4. A different file already there is refused. */
export async function collectTake(root: string, id: string, take: number, source: {url?: string; from?: string}, now = () => new Date()): Promise<Collected> {
  const {order, entry, folder} = await orderTake(root, id, take);
  if (order.kind !== 'FILM') throw new OrderError(`${id} är en stillbild; en bild hämtas inte hit.`);
  if (!entry?.taskId) throw new OrderError(`${id} tagning ${take} har ingen task-id i kvittot: filmen kan inte knytas till beställningen.`);
  if (['MISSLYCKAD', 'AVBRUTEN', 'OSÄKER'].includes(entry.status)) throw new OrderError(`${id} tagning ${take} står som ${entry.status} i kvittot.`);
  if (!!source.url === !!source.from) throw new OrderError('Ange antingen --url eller --from.');
  let from: Record<string, unknown>;
  if (source.url) {
    let address: URL;
    try { address = new URL(source.url); } catch { throw new OrderError('Adressen går inte att läsa.'); }
    const local = address.hostname === '127.0.0.1' || address.hostname === 'localhost';
    if (address.protocol !== 'https:' && !(address.protocol === 'http:' && local)) throw new OrderError('Bara https-adresser hämtas.');
    from = {kind: 'url', host: address.host, path: address.pathname};
  } else {
    if (!existsSync(source.from!)) throw new OrderError(`${source.from} finns inte.`);
    from = {kind: 'file', path: posix(root, path.resolve(source.from!))};
  }
  const dir = path.join(folder, `take-${take}`), target = path.join(dir, 'source.mp4'), part = path.join(dir, `.${randomUUID()}.part`);
  await mkdir(dir, {recursive: true});
  try {
    if (source.url) {
      const answer = await fetch(source.url, {redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000)});
      if (!answer.ok || !answer.body) throw new OrderError(`Hämtningen svarade ${answer.status}.`);
      const length = Number(answer.headers.get('content-length'));
      if (length > FETCH_LIMIT) throw new OrderError(`Filen är ${length} byte; gränsen är ${FETCH_LIMIT}.`);
      await pipeline(Readable.fromWeb(answer.body as never), createWriteStream(part, {flags: 'wx'}));
    } else await copyFile(source.from!, part);
    const bytes = (await stat(part)).size;
    if (bytes > FETCH_LIMIT || bytes < 512) throw new OrderError(`Filen är ${bytes} byte: ingen film.`);
    const sha256 = await sha256File(part);
    let facts;
    try { facts = probe(part); } catch { throw new OrderError('Filen är ingen läsbar film (ffprobe).'); }
    if (entry.sha256 && entry.file && path.resolve(root, entry.file) !== path.resolve(target) && entry.sha256 !== sha256) throw new OrderError(`Kvittot säger att tagningen hämtades som ${entry.file} med en annan SHA-256 (${entry.sha256.slice(0, 12)}).`);
    let already = false;
    if (existsSync(target)) {
      if (await sha256File(target) !== sha256) throw new OrderError(`En annan film ligger redan i ${posix(root, target)}; originalet ändras aldrig.`);
      already = true;
    } else await rename(part, target);
    const record = {schemaVersion: 1, order: id, take, dealer: order.dealer, fetchedAt: now().toISOString(), from, file: {path: posix(root, target), sha256, bytes},
      film: {width: facts.width, height: facts.height, fps: facts.fps, frames: facts.frames, codec: facts.codec, profile: facts.profile, pixelFormat: facts.pixelFormat, audio: facts.audio, colour: facts.colour},
      receipt: {status: entry.status, taskId: entry.taskId}, model: order.generation?.model ?? null, note: 'Originalet: ändras aldrig. Rättade kopior skrivs bredvid (tools/film-fix.ts).'};
    const fetched = path.join(dir, 'fetched.json');
    if (!already || !existsSync(fetched)) await writeFile(fetched, JSON.stringify(record, null, 2) + '\n');
    const rel = posix(root, target);
    return {path: rel, sha256, bytes, already, record, next: [`node tools/order-put.ts status ${id} ${take} HÄMTAD --file ${rel}`, `node tools/register-order.ts ${id} ${take}${order.step?.shape === 'ROUND_TRIP' ? ' --split <första rutan i returen>' : ''}`, `node tools/film-fix.ts ${rel} <fixes.json>`]};
  } finally {
    await rm(part, {force: true});
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const [id, take] = args;
  if (!id || !take || !(flag('--url') || flag('--from'))) { console.error('Användning: node tools/order-collect.ts <order-id> <tagning> --url <adress> | --from <fil>'); process.exit(1); }
  try {
    const done = await collectTake(process.cwd(), id, Number(take), {url: flag('--url'), from: flag('--from')});
    console.log(JSON.stringify({file: done.path, sha256: done.sha256, bytes: done.bytes, already: done.already, film: done.record.film, next: done.next}, null, 2));
  } catch (error) {
    if (error instanceof OrderError) { console.error(error.message); process.exit(2); }
    throw error;
  }
}
