// The only writer of an order's receipt (assets/orders/<id>/receipt.json): what the ordering agent did with each take,
// exactly once. requestedAt is written BEFORE the call to Runway and the task id AFTER it; a take with requestedAt and no
// task id is OSÄKER (the call may have gone) and is never placed again by a tool. Every command first checks that the
// order is approved and unchanged (its hash against approval.orderSha256) and that its pictures on disk are the ones
// approved. Instructions for the agent: tools/order-clerk.md.
//
//   node tools/order-put.ts check <id>                       may it be placed: approval, hash, files, takes (JSON)
//   node tools/order-put.ts begin <id> <take>                write requestedAt, print the exact call for that take (JSON)
//   node tools/order-put.ts placed <id> <take> <taskId> [creditsRemaining] [--via api|mcp]   the call answered with a task id; --via: the channel it went through
//   node tools/order-put.ts failed <id> <take> "<error>"     the call answered with an error and no task id
//   node tools/order-put.ts status <id> <take> <STATUS> [--file <path>] [--note "<text>"]
//                                                            KLAR, HÄMTAD (with --file), EFTERARBETAD, MÄTT, GRANSKAD,
//                                                            INFÖRD; MISSLYCKAD (Runway failed it); AVBRUTEN (never begun)
//   node tools/order-put.ts review <id> <take> --note "<verdict>"   the independent reviewer's verdict, beside the take
//                                                            from HÄMTAD on, its state unchanged (the protocol reads it)
//                  [--evidence <json>]                       film + files, each with relative path and SHA-256;
//                                                            checked against this take's actual local bytes before writing
//   node tools/order-put.ts show <id>                        the receipt
// A take placed outside Beställ is recorded once with imported (tools/order-import.ts writes the order and calls it).
import { readFile, writeFile, mkdir, rename, rm, open, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './placement-store.ts';
import { orderHash, orderStore } from './order-store.ts';
import { readMandateBudget, withMandateLock } from './order-mandate.ts';
import { parseReviewEvidence } from '../src/review-evidence.ts';
import { TAKE_FLOW, approvalWords, mandateRefusal, priceOf, requestOf, type Order, type Policy, type Receipt, type TakeStatus, type ReviewEvidence } from '../src/order-model.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
type Take = Receipt['takes'][number];
/** A receipt stays tied to the original submitted order. Only an audited summary correction may bridge hashes. */
export function receiptMatchesOrder(order: Order, hash: string): boolean {
  if (!order.approval || orderHash(order) !== order.approval.orderSha256) return false;
  let prior = structuredClone(order);
  const hashes = [orderHash(prior)];
  while (prior.summaryCorrections?.length) {
    const correction = prior.summaryCorrections.pop()!;
    if (!prior.summaryCorrections.length) delete prior.summaryCorrections;
    if (correction.before === null) delete prior.summary; else prior.summary = correction.before;
    if (orderHash(prior) !== correction.orderSha256) return false;
    hashes.push(correction.orderSha256);
  }
  return hashes.includes(hash);
}
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', mp4: 'video/mp4' };

function reservationCost(order: Order, policy: Policy): number {
  const priced = Array.isArray(policy.prices) ? priceOf(order.generation, policy.prices)?.worstPerTake : undefined;
  return priced !== undefined ? Math.ceil(Math.max(priced, order.cost.worstPerTake)) : NaN;
}

/** A report describes the exact reviewed version, which may be an after-worked film rather than the downloaded one. */
async function checkedReviewEvidence(root: string, id: string, take: number, value: unknown): Promise<ReviewEvidence> {
  const prefix = `assets/orders/${id}/take-${take}/`;
  const evidence = parseReviewEvidence(value, prefix);
  if (!evidence) throw new StoreError(400, `Granskningsunderlaget kräver film och 1–32 unika bevisfiler med relativa sökvägar under ${prefix} och full SHA-256.`);
  const canonicalRoot = await realpath(root);
  const takeRoot = path.join(canonicalRoot, ...prefix.split('/'));
  const actualFiles = new Set<string>();
  const checked = async (file: ReviewEvidence['film']): Promise<ReviewEvidence['film']> => {
    let actual: string;
    try { actual = await realpath(path.join(root, ...file.path.split('/'))); }
    catch { throw new StoreError(409, `Granskningsunderlaget saknas: ${file.path}.`); }
    const relative = path.relative(takeRoot, actual);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new StoreError(400, 'Granskningsunderlagets länk lämnar tagningens egen mapp.');
    }
    const identity = process.platform === 'win32' ? actual.toLowerCase() : actual;
    if (actualFiles.has(identity)) throw new StoreError(400, 'Granskningsunderlaget pekar på samma verkliga fil mer än en gång.');
    actualFiles.add(identity);
    if (sha(await readFile(actual)) !== file.sha256) throw new StoreError(409, `Granskningsunderlaget har ändrats: ${file.path} (sha256 skiljer).`);
    return {path: file.path, sha256: file.sha256};
  };
  const film = await checked(evidence.film), files: ReviewEvidence['files'] = [];
  for (const file of evidence.files) files.push(await checked(file));
  return {film, files};
}

export function receipts(root: string, options: { now?: () => Date } = {}) {
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  const store = orderStore(root, options);
  const folderOf = (id: string) => path.join(root, 'assets', 'orders', id);
  const fileOf = (id: string) => path.join(folderOf(id), 'receipt.json');

  async function read(id: string): Promise<Receipt | null> {
    try { return JSON.parse(await readFile(fileOf(id), 'utf8')) as Receipt; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }

  /** The order may be placed: approved by Jakob, unchanged since, its files the approved ones, ordering switched on. */
  async function check(id: string): Promise<{ order: Order; receipt: Receipt | null; policy: Policy; files: { name: string; path: string; sha256: string; bytes: number; mimeType: string; tag?: string; goesAs: string }[] }> {
    const { order } = await store.load(id);
    if (order.status !== 'GODKÄND' || !order.approval) throw new StoreError(409, `${id} är inte godkänd (av Jakob eller av huvudagenten på hans uppdrag).`);
    // Jakob's click, or the main agent on his mandate (2026-11-13); the latter only with the mandate it acts on.
    if (order.approval.by === 'huvudagent' ? !order.approval.mandate?.trim() : order.approval.by !== 'jakob') throw new StoreError(409, order.approval.by === 'huvudagent' ? `${id}: huvudagentens godkännande saknar uppdrag (mandate); lägg den inte.` : `${id}: godkännandet är varken Jakobs eller huvudagentens på hans uppdrag.`);
    if (orderHash(order) !== order.approval.orderSha256) throw new StoreError(409, `${id} har ändrats efter godkännandet (hashen stämmer inte). Lägg den inte.`);
    if (sha(order.prompt.text) !== order.prompt.sha256) throw new StoreError(409, `${id}: textens hash stämmer inte.`);
    const policy = JSON.parse(await readFile(path.join(root, 'data/order-policy.json'), 'utf8')) as Policy;
    if (policy?.enabled !== true) throw new StoreError(403, 'Beställningar är avstängda (enabled: false i data/order-policy.json).');
    const files = [];
    const all = [...order.pictures.map((p) => ({ name: p.name, path: p.path, sha256: p.sha256, tag: p.tag, goesAs: p.goesAs as string })), ...(order.reference.status === 'FINNS' ? [{ name: order.reference.path.split('/').pop()!, path: order.reference.path, sha256: order.reference.sha256, tag: undefined, goesAs: 'referenceVideo' }] : []),
      // A revansch sends its predecessor's film as the last reference video (video 2 in the text; src/order-model.ts requestOf).
      ...(order.revansch ? [{ name: order.revansch.path.split('/').pop()!, path: order.revansch.path, sha256: order.revansch.sha256, tag: undefined, goesAs: 'referenceVideo' }] : [])];
    for (const f of all) {
      if (!f.path || !f.sha256) throw new StoreError(409, `${id}: ${f.name} saknas.`);
      let bytes: Buffer;
      try { bytes = await readFile(path.join(root, ...f.path.split('/'))); } catch { throw new StoreError(409, `${id}: ${f.path} finns inte på disken.`); }
      if (sha(bytes) !== f.sha256) throw new StoreError(409, `${id}: ${f.path} är inte den godkända filen (sha256 skiljer).`);
      files.push({ name: f.name, path: f.path, sha256: f.sha256, bytes: bytes.length, mimeType: MIME[f.name.split('.').pop()!] ?? 'application/octet-stream', ...(f.tag ? { tag: f.tag } : {}), goesAs: f.goesAs });
    }
    return { order, receipt: await read(id), files, policy };
  }

  /** Changes the receipt under a lock file, so that two agents never write it at once. */
  async function update(id: string, change: (receipt: Receipt, order: Order, policy: Policy) => Take | Promise<Take>): Promise<{ receipt: Receipt; take: Take }> {
    const { order, policy } = await check(id);
    await mkdir(folderOf(id), { recursive: true });
    const lock = path.join(folderOf(id), '.receipt.lock');
    let handle;
    try { handle = await open(lock, 'wx'); } catch { throw new StoreError(409, `${id}: kvittot skrivs redan av någon annan (${lock}). Vänta, eller ta bort låset bara om ingen annan kör.`); }
    try {
      const receipt: Receipt = (await read(id)) ?? { schemaVersion: 1, order: id, orderSha256: order.approval!.orderSha256, takes: [] };
      if (!receiptMatchesOrder(order, receipt.orderSha256)) throw new StoreError(409, `${id}: kvittot hör till en annan version av beställningen.`);
      const take = await change(receipt, order, policy);
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
  const step = (t: Take, status: TakeStatus, note?: string): Take => {
    const at = now();
    return {
      ...t, status, history: [...t.history, { at, status, ...(note ? { note } : {}) }],
      ...(status === 'GRANSKAD' && note?.trim() ? { review: { at, note } } : {}),
    };
  };

  /** Before the call: requestedAt. Refused when the take was begun before, whatever came of it. Returns the exact call. */
  async function begin(id: string, takeValue: unknown) {
    return withMandateLock(root, async () => {
      let request: ReturnType<typeof requestOf> | null = null;
      let validUntil = '';
      const result = await update(id, async (receipt, order, policy) => {
        const take = takeNumber(order, takeValue);
        const old = receipt.takes.find((t) => t.take === take);
        if (old) throw new StoreError(409, `${id} tagning ${take} är redan ${old.status}${old.requestedAt ? ` (begärd ${old.requestedAt})` : ''}: den läggs aldrig igen av ett verktyg.`);
        const credits = reservationCost(order, policy);
        const budget = await readMandateBudget(root, policy.mandate, now);
        const refusal = mandateRefusal(budget, credits);
        if (refusal) throw new StoreError(403, refusal);
        const mandate = budget.mandate!;
        request = requestOf(order, take);
        validUntil = mandate.endsAt;
        const at = budget.at;
        return {
          take, status: 'OSÄKER', requestedAt: at, reservation: { mandateId: mandate.id, credits }, taskId: null,
          creditsRemainingAfter: null, error: null, file: null, sha256: null,
          history: [{ at, status: 'OSÄKER', note: 'begärd: anropet är på väg' }],
        };
      });
      return { ...result, request: request!, validUntil };
    });
  }
  /**
   * After the call: the task id. Only for a take that was begun and has none. via: the channel the call went through (the API
   * client on the developer project's credits, or Runway's MCP server on the app account's), kept in the take so that
   * tools/register-order.ts says it; left out, the receipt does not say it and the bank writes "kanal okänd".
   */
  async function placed(id: string, takeValue: unknown, taskId: string, creditsRemaining: number | null = null, via: 'api' | 'mcp' | null = null) {
    if (via !== null && via !== 'api' && via !== 'mcp') throw new StoreError(400, 'Kanalen är api eller mcp.');
    if (!/^[A-Za-z0-9-]{8,80}$/.test(taskId ?? '')) throw new StoreError(400, 'Ogiltigt task-id.');
    if (creditsRemaining !== null && (typeof creditsRemaining !== 'number' || !Number.isFinite(creditsRemaining) || creditsRemaining < 0)) {
      throw new StoreError(400, 'Saldot efter anropet ska vara ett ändligt tal på minst 0 eller null.');
    }
    return update(id, (receipt, order) => {
      const take = takeNumber(order, takeValue), t = receipt.takes.find((x) => x.take === take);
      if (!t?.requestedAt) throw new StoreError(409, `${id} tagning ${take} är inte begärd: kör begin först, före anropet.`);
      if (t.taskId) throw new StoreError(409, `${id} tagning ${take} har redan task-id ${t.taskId}.`);
      if (t.status !== 'OSÄKER') throw new StoreError(409, `${id} tagning ${take} är ${t.status}.`);
      return { ...step(t, 'LAGD', `task ${taskId}`), taskId, creditsRemainingAfter: creditsRemaining, ...(via ? { via } : {}) };
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
  async function review(id: string, takeValue: unknown, note: string, evidence?: unknown) {
    const text = String(note ?? '').trim();
    if (!text || text.length > 2000) throw new StoreError(400, 'Granskarens dom ska vara en text på högst 2000 tecken (--note "…").');
    return update(id, async (receipt, order) => {
      const take = takeNumber(order, takeValue), t = receipt.takes.find((x) => x.take === take);
      if (!t || TAKE_FLOW.indexOf(t.status as (typeof TAKE_FLOW)[number]) < TAKE_FLOW.indexOf('HÄMTAD')) throw new StoreError(409, `${id} tagning ${take} är ${t?.status ?? 'inte lagd'}: granskarens dom förs in först när filmen är hämtad (HÄMTAD eller senare).`);
      const verified = evidence === undefined ? undefined : await checkedReviewEvidence(root, id, take, evidence);
      return { ...t, review: { at: now(), note: text, ...(verified ? {evidence: verified} : {}) } };
    });
  }
  /**
   * A take placed OUTSIDE Beställ (an agent's call through Runway's MCP server or, with via: api, the API key, written down in a ledger), recorded once, by
   * tools/order-import.ts: the call's own time and task id, the film as it was fetched, and, where the film was after-worked
   * already, that too. Only for an order that says it was placed outside (order.outside) and a take with no entry yet. Nothing
   * is placed by it; the history says who placed it and when, so the receipt never looks like a call made from here.
   */
  async function imported(id: string, takeValue: unknown, call: { requestedAt: string; taskId: string; creditsRemainingAfter: number | null; file: string; placedBy: string; fetched: string; after?: string | null; via?: 'api' | 'mcp' }) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(call.taskId ?? '')) throw new StoreError(400, 'Ogiltigt task-id.');
    if (!/^\d{4}-\d{2}-\d{2}T/.test(call.requestedAt ?? '')) throw new StoreError(400, 'requestedAt ska vara en tid (ISO).');
    const fileBytes = await readFile(path.resolve(root, call.file));
    return update(id, (receipt, order) => {
      if (!(order as Order & { outside?: unknown }).outside) throw new StoreError(409, `${id} är beställd genom Beställ: dess kvitto skrivs med begin och placed, inte i efterhand.`);
      const take = takeNumber(order, takeValue);
      if (receipt.takes.some((t) => t.take === take)) throw new StoreError(409, `${id} tagning ${take} finns redan i kvittot.`);
      const history = [
        { at: call.requestedAt, status: 'LAGD' as TakeStatus, note: `lagd utanför Beställ av ${call.placedBy}: task ${call.taskId}` },
        { at: now(), status: 'HÄMTAD' as TakeStatus, note: call.fetched },
        ...(call.after ? [{ at: now(), status: 'EFTERARBETAD' as TakeStatus, note: call.after }] : []),
      ];
      return { take, status: call.after ? 'EFTERARBETAD' : 'HÄMTAD', requestedAt: call.requestedAt, taskId: call.taskId, creditsRemainingAfter: call.creditsRemainingAfter, error: null, file: path.relative(root, path.resolve(root, call.file)).split(path.sep).join('/'), sha256: sha(fileBytes), outside: true, ...(call.via ? { via: call.via } : {}), history } as Take;
    });
  }
  /** Correct display wording only. Original approval hash and original receipt remain independently verifiable. */
  async function amendSummary(id: string, summary: string, reason: string) {
    if (!/^Gör .+/.test(summary) || summary.length > 500 || !reason.trim()) throw new StoreError(400, 'Rättningen kräver en kort Gör-beskrivning och en orsak.');
    const {order} = await check(id), receipt = await read(id);
    if (receipt && !receiptMatchesOrder(order, receipt.orderSha256)) throw new StoreError(409, 'Kvittot hör inte till beställningen.');
    const folder = folderOf(id), lock = path.join(folder, '.receipt.lock');
    await mkdir(folder, {recursive: true});
    let handle;
    try { handle = await open(lock, 'wx'); } catch { throw new StoreError(409, 'Beställningen skrivs av någon annan.'); }
    try {
      const file = path.join(root, 'data/orders', `${id}.json`);
      const original = await readFile(file, 'utf8');
      if (orderHash(JSON.parse(original)) !== orderHash(order)) throw new StoreError(409, 'Beställningen ändrades under rättningen.');
      if (summary === order.summary) return order;
      const next = structuredClone(order);
      next.summaryCorrections = [...(order.summaryCorrections ?? []), {before: order.summary ?? null, orderSha256: orderHash(order), at: now(), reason}];
      next.summary = summary;
      next.approval!.orderSha256 = orderHash(next);
      // The archive is written before the new display text; no request, take, cost, prompt or picture is rewritten.
      const archived = path.join(folder, `order-${orderHash(order)}.json`);
      try { await writeFile(archived, original, {flag: 'wx'}); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(archived, 'utf8') !== original) throw error; }
      const temporary = path.join(root, 'data/orders', `.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', {flag: 'wx'});
      await rename(temporary, file);
      return next;
    } finally { await handle.close(); await rm(lock, {force: true}); }
  }
  return { read, check, begin, placed, failed, advance, review, imported, amendSummary };
}

/** Pass only the task id and optional positional balance from the CLI. */
export function placedFromCommand(root: string, id: string, take: unknown, all: readonly string[]) {
  // --via api|mcp, anywhere: the channel the call went through.
  const at = all.indexOf('--via'), via = at < 0 ? null : all[at + 1];
  if (at >= 0 && via !== 'api' && via !== 'mcp') throw new StoreError(400, 'Använd: --via api eller --via mcp.');
  const args = at < 0 ? all : [...all.slice(0, at), ...all.slice(at + 2)];
  const [taskId, balance] = args;
  if (!taskId || taskId.startsWith('-') || args.length > 2 || balance?.startsWith('--')) {
    throw new StoreError(400, 'Använd: placed <id> <tagning> <task-id> [saldo] [--via api|mcp]. Saldot anges som ett tal utan flagga.');
  }
  if (balance !== undefined && !balance.trim()) throw new StoreError(400, 'Saldot efter anropet saknar värde.');
  return receipts(root).placed(id, take, taskId, balance === undefined ? null : Number(balance), via as 'api' | 'mcp' | null);
}

/** Strict CLI boundary: a misspelled evidence flag must never become a note-only replacement. */
export async function reviewFromCommand(root: string, id: string, take: unknown, args: readonly string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (flag !== '--note' && flag !== '--evidence') throw new StoreError(400, `Okänd granskningsflagga: ${flag}. Använd --note och valfritt --evidence med separata värden.`);
    if (values.has(flag)) throw new StoreError(400, `${flag} angavs mer än en gång.`);
    if (!value || value.startsWith('--')) throw new StoreError(400, `${flag} saknar värde.`);
    values.set(flag, value);
  }
  const evidenceFile = values.get('--evidence');
  const evidence = evidenceFile ? JSON.parse(await readFile(path.resolve(root, evidenceFile), 'utf8')) : undefined;
  return receipts(root).review(id, take, values.get('--note') ?? '', evidence);
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
      const { order, receipt, files, policy } = await r.check(id);
      const budget = await readMandateBudget(root, policy.mandate, () => new Date().toISOString());
      const refusal = mandateRefusal(budget, reservationCost(order, policy));
      out({ ok: true, id, title: order.title, approvedBy: `${approvalWords(order.approval!)}${order.approval!.mandate ? `: ${order.approval!.mandate}` : ''}`, orderSha256: order.approval!.orderSha256, takes: Array.from({ length: order.takes }, (_, i) => { const t = receipt?.takes.find((x) => x.take === i + 1); return { take: i + 1, status: t?.status ?? 'GODKÄND', mayBegin: !t && !refusal }; }), mandate: { ...budget, refusal }, stopBelowCredits: order.limits.stopBelowCredits, files });
    } else if (command === 'begin') out(await r.begin(id, take));
    else if (command === 'placed') out((await placedFromCommand(root, id, take, rest)).take);
    else if (command === 'failed') out((await r.failed(id, take, rest.join(' '))).take);
    else if (command === 'status') out((await r.advance(id, take, rest[0], { file: flag('--file'), note: flag('--note') })).take);
    else if (command === 'show') out(await r.read(id));
    else if (command === 'review') out((await reviewFromCommand(root, id, take, rest)).take);
    else { console.log('Använd: node tools/order-put.ts check|begin|placed|failed|status|review|show <id> [tagning] …'); process.exitCode = 2; }
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
