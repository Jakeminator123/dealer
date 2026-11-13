// The only writer of an order's receipt (assets/orders/<id>/receipt.json): what the ordering agent did with each take,
// exactly once. requestedAt is written BEFORE the call to Runway and the task id AFTER it; a take with requestedAt and no
// task id is OSÄKER (the call may have gone) and is never placed again by a tool. Every command first checks that the
// order is approved and unchanged (its hash against approval.orderSha256) and that its pictures on disk are the ones
// approved. Instructions for the agent: tools/order-clerk.md.
//
//   node tools/order-put.ts check <id>                       may it be placed: approval, hash, files, takes (JSON)
//   node tools/order-put.ts begin <id> <take>                write requestedAt, print the exact call for that take (JSON)
//   node tools/order-put.ts placed <id> <take> <taskId> [creditsRemaining]   the call answered with a task id
//   node tools/order-put.ts failed <id> <take> "<error>"     the call answered with an error and no task id
//   node tools/order-put.ts status <id> <take> <STATUS> [--file <path>] [--note "<text>"]
//                                                            KLAR, HÄMTAD (with --file), EFTERARBETAD, MÄTT, GRANSKAD,
//                                                            INFÖRD; MISSLYCKAD (Runway failed it); AVBRUTEN (never begun)
//   node tools/order-put.ts review <id> <take> --note "<verdict>"   the independent reviewer's verdict, beside the take
//                                                            from HÄMTAD on, its state unchanged (the protocol reads it)
//   node tools/order-put.ts show <id>                        the receipt
import { readFile, writeFile, mkdir, rename, rm, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './placement-store.ts';
import { orderHash, orderStore } from './order-store.ts';
import { TAKE_FLOW, approvalWords, requestOf, type Order, type Receipt, type TakeStatus } from '../src/order-model.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
type Take = Receipt['takes'][number];
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', mp4: 'video/mp4' };

export function receipts(root: string, options: { now?: () => Date } = {}) {
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const store = orderStore(root, options);
  const folderOf = (id: string) => path.join(root, 'assets', 'orders', id);
  const fileOf = (id: string) => path.join(folderOf(id), 'receipt.json');

  async function read(id: string): Promise<Receipt | null> {
    try { return JSON.parse(await readFile(fileOf(id), 'utf8')) as Receipt; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }

  /** The order may be placed: approved by Jakob, unchanged since, its files the approved ones, ordering switched on. */
  async function check(id: string): Promise<{ order: Order; receipt: Receipt | null; files: { name: string; path: string; sha256: string; bytes: number; mimeType: string; tag?: string; goesAs: string }[] }> {
    const { order } = await store.load(id);
    if (order.status !== 'GODKÄND' || !order.approval) throw new StoreError(409, `${id} är inte godkänd (av Jakob eller av huvudagenten på hans uppdrag).`);
    // Jakob's click, or the main agent on his mandate (2026-11-13); the latter only with the mandate it acts on.
    if (order.approval.by === 'huvudagent' ? !order.approval.mandate?.trim() : order.approval.by !== 'jakob') throw new StoreError(409, order.approval.by === 'huvudagent' ? `${id}: huvudagentens godkännande saknar uppdrag (mandate); lägg den inte.` : `${id}: godkännandet är varken Jakobs eller huvudagentens på hans uppdrag.`);
    if (orderHash(order) !== order.approval.orderSha256) throw new StoreError(409, `${id} har ändrats efter godkännandet (hashen stämmer inte). Lägg den inte.`);
    if (sha(order.prompt.text) !== order.prompt.sha256) throw new StoreError(409, `${id}: textens hash stämmer inte.`);
    const policy = JSON.parse(await readFile(path.join(root, 'data/order-policy.json'), 'utf8'));
    if (policy?.enabled !== true) throw new StoreError(403, 'Beställningar är avstängda (enabled: false i data/order-policy.json).');
    const files = [];
    const all = [...order.pictures.map((p) => ({ name: p.name, path: p.path, sha256: p.sha256, tag: p.tag, goesAs: p.goesAs as string })), ...(order.reference.status === 'FINNS' ? [{ name: order.reference.path.split('/').pop()!, path: order.reference.path, sha256: order.reference.sha256, tag: undefined, goesAs: 'referenceVideo' }] : [])];
    for (const f of all) {
      if (!f.path || !f.sha256) throw new StoreError(409, `${id}: ${f.name} saknas.`);
      let bytes: Buffer;
      try { bytes = await readFile(path.join(root, ...f.path.split('/'))); } catch { throw new StoreError(409, `${id}: ${f.path} finns inte på disken.`); }
      if (sha(bytes) !== f.sha256) throw new StoreError(409, `${id}: ${f.path} är inte den godkända filen (sha256 skiljer).`);
      files.push({ name: f.name, path: f.path, sha256: f.sha256, bytes: bytes.length, mimeType: MIME[f.name.split('.').pop()!] ?? 'application/octet-stream', ...(f.tag ? { tag: f.tag } : {}), goesAs: f.goesAs });
    }
    return { order, receipt: await read(id), files };
  }

  /** Changes the receipt under a lock file, so that two agents never write it at once. */
  async function update(id: string, change: (receipt: Receipt, order: Order) => Take): Promise<{ receipt: Receipt; take: Take }> {
    const { order } = await check(id);
    await mkdir(folderOf(id), { recursive: true });
    const lock = path.join(folderOf(id), '.receipt.lock');
    let handle;
    try { handle = await open(lock, 'wx'); } catch { throw new StoreError(409, `${id}: kvittot skrivs redan av någon annan (${lock}). Vänta, eller ta bort låset bara om ingen annan kör.`); }
    try {
      const receipt: Receipt = (await read(id)) ?? { schemaVersion: 1, order: id, orderSha256: order.approval!.orderSha256, takes: [] };
      if (receipt.orderSha256 !== order.approval!.orderSha256) throw new StoreError(409, `${id}: kvittot hör till en annan version av beställningen.`);
      const take = change(receipt, order);
      receipt.takes = [...receipt.takes.filter((t) => t.take !== take.take), take].sort((a, b) => a.take - b.take);
      const temporary = path.join(folderOf(id), `.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, fileOf(id));
      return { receipt, take };
    } finally {
      await handle.close();
      await rm(lock, { force: true });
    }
  }
  const takeNumber = (order: Order, value: unknown) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > order.takes) throw new StoreError(400, `Tagningen ska vara 1–${order.takes}.`);
    return n;
  };
  const step = (t: Take, status: TakeStatus, note?: string): Take => ({ ...t, status, history: [...t.history, { at: now(), status, ...(note ? { note } : {}) }] });

  /** Before the call: requestedAt. Refused when the take was begun before, whatever came of it. Returns the exact call. */
  async function begin(id: string, takeValue: unknown) {
    let request: ReturnType<typeof requestOf> | null = null;
    const result = await update(id, (receipt, order) => {
      const take = takeNumber(order, takeValue);
      const old = receipt.takes.find((t) => t.take === take);
      if (old) throw new StoreError(409, `${id} tagning ${take} är redan ${old.status}${old.requestedAt ? ` (begärd ${old.requestedAt})` : ''}: den läggs aldrig igen av ett verktyg.`);
      request = requestOf(order, take);
      const at = now();
      return { take, status: 'OSÄKER', requestedAt: at, taskId: null, creditsRemainingAfter: null, error: null, file: null, sha256: null, history: [{ at, status: 'OSÄKER', note: 'begärd: anropet är på väg' }] };
    });
    return { ...result, request: request! };
  }
  /** After the call: the task id. Only for a take that was begun and has none. */
  async function placed(id: string, takeValue: unknown, taskId: string, creditsRemaining?: number | null) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(taskId ?? '')) throw new StoreError(400, 'Ogiltigt task-id.');
    return update(id, (receipt, order) => {
      const take = takeNumber(order, takeValue), t = receipt.takes.find((x) => x.take === take);
      if (!t?.requestedAt) throw new StoreError(409, `${id} tagning ${take} är inte begärd: kör begin först, före anropet.`);
      if (t.taskId) throw new StoreError(409, `${id} tagning ${take} har redan task-id ${t.taskId}.`);
      if (t.status !== 'OSÄKER') throw new StoreError(409, `${id} tagning ${take} är ${t.status}.`);
      return { ...step(t, 'LAGD', `task ${taskId}`), taskId, creditsRemainingAfter: typeof creditsRemaining === 'number' && Number.isFinite(creditsRemaining) ? creditsRemaining : null };
    });
  }
  /** The call answered with an error and no task: nothing was made. The take is not placed again by a tool. */
  async function failed(id: string, takeValue: unknown, error: string) {
    return update(id, (receipt, order) => {
      const take = takeNumber(order, takeValue), t = receipt.takes.find((x) => x.take === take);
      if (!t?.requestedAt || t.taskId || t.status !== 'OSÄKER') throw new StoreError(409, `${id} tagning ${take}: bara en begärd tagning utan task-id kan misslyckas här.`);
      return { ...step(t, 'MISSLYCKAD', 'anropet gav fel'), error: String(error).slice(0, 2000) };
    });
  }
  /** Later steps, forwards only. HÄMTAD keeps the downloaded file's path and hash. */
  async function advance(id: string, takeValue: unknown, statusValue: string, options: { file?: string; note?: string } = {}) {
    const status = statusValue as TakeStatus;
    const fileBytes = options.file ? await readFile(path.resolve(root, options.file)) : null;
    return update(id, (receipt, order) => {
      const take = takeNumber(order, takeValue), t = receipt.takes.find((x) => x.take === take);
      if (status === 'AVBRUTEN') {
        if (t) throw new StoreError(409, `${id} tagning ${take} är redan ${t.status}; bara en tagning som aldrig begärts kan avbrytas.`);
        return { take, status, requestedAt: null, taskId: null, history: [{ at: now(), status, ...(options.note ? { note: options.note } : {}) }] };
      }
      if (!t?.taskId) throw new StoreError(409, `${id} tagning ${take} har inget task-id.`);
      if (status === 'MISSLYCKAD') {
        if (t.status !== 'LAGD' && t.status !== 'KLAR') throw new StoreError(409, `${id} tagning ${take} är ${t.status}.`);
        return { ...step(t, status, options.note), error: options.note ?? 'misslyckad hos Runway' };
      }
      const to = TAKE_FLOW.indexOf(status as (typeof TAKE_FLOW)[number]), from = TAKE_FLOW.indexOf(t.status as (typeof TAKE_FLOW)[number]);
      if (to < 2) throw new StoreError(400, `Status ska vara en av ${TAKE_FLOW.slice(2).join(', ')}, MISSLYCKAD eller AVBRUTEN.`);
      if (from < 1 || to <= from) throw new StoreError(409, `${id} tagning ${take} är ${t.status}; ${status} går inte bakåt eller från ett misslyckande.`);
      if (status === 'HÄMTAD' && !fileBytes) throw new StoreError(400, 'HÄMTAD kräver --file med den hämtade filen.');
      const rel = options.file ? path.relative(root, path.resolve(root, options.file)).split(path.sep).join('/') : t.file ?? null;
      return { ...step(t, status, options.note), ...(fileBytes ? { file: rel, sha256: sha(fileBytes) } : {}) };
    });
  }
  /**
   * The independent reviewer's verdict, kept beside the take (review: when and the note) at any state from HÄMTAD on,
   * without moving the state: a take is often in the bank (INFÖRD) before the review is back. A later verdict replaces it.
   */
  async function review(id: string, takeValue: unknown, note: string) {
    const text = String(note ?? '').trim();
    if (!text || text.length > 2000) throw new StoreError(400, 'Granskarens dom ska vara en text på högst 2000 tecken (--note "…").');
    return update(id, (receipt, order) => {
      const take = takeNumber(order, takeValue), t = receipt.takes.find((x) => x.take === take);
      if (!t || TAKE_FLOW.indexOf(t.status as (typeof TAKE_FLOW)[number]) < TAKE_FLOW.indexOf('HÄMTAD')) throw new StoreError(409, `${id} tagning ${take} är ${t?.status ?? 'inte lagd'}: granskarens dom förs in först när filmen är hämtad (HÄMTAD eller senare).`);
      return { ...t, review: { at: now(), note: text } };
    });
  }
  return { read, check, begin, placed, failed, advance, review };
}

// ── On the command line ─────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const [command, id, take, ...rest] = process.argv.slice(2);
  const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const out = (value: unknown) => console.log(JSON.stringify(value, null, 2));
  try {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new StoreError(400, 'Kör från dealer-katalogen.');
    const r = receipts(root);
    if (command === 'check') {
      const { order, receipt, files } = await r.check(id);
      out({ ok: true, id, title: order.title, approvedBy: `${approvalWords(order.approval!)}${order.approval!.mandate ? `: ${order.approval!.mandate}` : ''}`, orderSha256: order.approval!.orderSha256, takes: Array.from({ length: order.takes }, (_, i) => { const t = receipt?.takes.find((x) => x.take === i + 1); return { take: i + 1, status: t?.status ?? 'GODKÄND', mayBegin: !t }; }), stopBelowCredits: order.limits.stopBelowCredits, files });
    } else if (command === 'begin') out(await r.begin(id, take));
    else if (command === 'placed') out((await r.placed(id, take, rest[0], rest[1] !== undefined ? Number(rest[1]) : null)).take);
    else if (command === 'failed') out((await r.failed(id, take, rest.join(' '))).take);
    else if (command === 'status') out((await r.advance(id, take, rest[0], { file: flag('--file'), note: flag('--note') })).take);
    else if (command === 'show') out(await r.read(id));
    else if (command === 'review') out((await r.review(id, take, flag('--note') ?? '')).take);
    else { console.log('Använd: node tools/order-put.ts check|begin|placed|failed|status|review|show <id> [tagning] …'); process.exitCode = 2; }
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
