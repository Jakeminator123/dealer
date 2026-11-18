import { lstat, mkdir, open, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ORDER_ID, type MandateBudget, type OrderMandate, type Receipt } from '../src/order-model.ts';
import { StoreError } from './placement-store.ts';

const hour = 60 * 60 * 1000;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const finiteTime = (value: unknown, format = utc) => typeof value === 'string' && format.test(value) ? Date.parse(value) : NaN;
const credits = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function mandateOf(value: unknown): OrderMandate | null {
  if (!value || typeof value !== 'object') return null;
  const mandate = value as Partial<OrderMandate>;
  const { id, startsAt, endsAt, rollingHourCredits, totalCredits } = mandate;
  if (typeof id !== 'string' || !ORDER_ID.test(id) || !startsAt || !endsAt || !(finiteTime(startsAt) < finiteTime(endsAt))
    || !credits(rollingHourCredits) || !credits(totalCredits)) return null;
  return { id, startsAt, endsAt, rollingHourCredits, totalCredits };
}

type Reservation = { countHourFrom: number | null; credits: number };

async function readJson(file: string): Promise<unknown> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (missing(error)) return null; throw error; }
}

async function reservations(root: string, mandate: OrderMandate): Promise<Reservation[]> {
  const from = finiteTime(mandate.startsAt), until = finiteTime(mandate.endsAt);
  const directory = path.join(root, 'assets/orders');
  const dirs = await readdir(directory, { withFileTypes: true }).catch(error => { if (missing(error)) return []; throw error; });
  const found: Reservation[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory() || !ORDER_ID.test(dir.name)) continue;
    const receipt = await readJson(path.join(directory, dir.name, 'receipt.json')) as Receipt | null;
    if (!receipt) continue;
    if (receipt.schemaVersion !== 1 || receipt.order !== dir.name || !Array.isArray(receipt.takes)) throw Error('Ogiltigt beställningskvitto.');
    let legacyCredits: number | undefined;
    for (const take of receipt.takes) {
      // A receipt in this ledger belongs to Dealer. "outside" also covers Dealer's own runs imported into Beställ.
      if (take.requestedAt === null) continue;
      const requested = finiteTime(take.requestedAt, zoned);
      if (!Number.isFinite(requested)) throw Error('En begärd tagning saknar giltig tid.');
      if (requested < from || requested >= until) continue;
      if (!take.reservation && legacyCredits === undefined) {
        const order = await readJson(path.join(root, 'data/orders', dir.name + '.json')) as { cost?: { worstPerTake?: unknown } } | null;
        const cost = order?.cost?.worstPerTake;
        if (!credits(cost)) throw Error('Äldre reservation saknar verifierad kostnad.');
        legacyCredits = cost;
      }
      const charge = take.reservation ? take.reservation.credits : legacyCredits;
      if (!credits(charge)) throw Error('Ogiltigt reserverat belopp.');
      let countHourFrom = take.taskId && take.status !== 'OSÄKER' ? requested : null;
      if (countHourFrom !== null) {
        for (const event of take.history ?? []) {
          const placedAt = finiteTime(event.at, zoned);
          if (event.status === 'LAGD' && Number.isFinite(placedAt)) countHourFrom = Math.max(countHourFrom, placedAt);
        }
      }
      found.push({ countHourFrom, credits: charge });
    }
  }
  return found;
}

/** This checkout's own requests are the ledger. The shared provider balance is not a measure of its spend. */
export async function readMandateBudget(root: string, value: unknown, now: () => string): Promise<MandateBudget> {
  const mandate = mandateOf(value);
  const empty = (status: MandateBudget['status'], at = now()): MandateBudget =>
    ({ status, mandate, at, hourlyReserved: 0, totalReserved: 0, available: 0 });
  if (!mandate) return empty(value == null ? 'missing' : 'unreadable');
  const phase = (at: string) => finiteTime(at) < finiteTime(mandate.startsAt) ? 'before-start'
    : finiteTime(at) >= finiteTime(mandate.endsAt) ? 'expired' : 'active';
  const initially = now(), initialPhase = phase(initially);
  if (initialPhase !== 'active') return empty(initialPhase, initially);

  try {
    const records = await reservations(root, mandate);
    const at = now(), latestPhase = phase(at), instant = finiteTime(at);
    if (latestPhase !== 'active') return empty(latestPhase, at);
    const totalReserved = records.reduce((sum, record) => sum + record.credits, 0);
    const hourlyReserved = records.filter(record => record.countHourFrom === null || record.countHourFrom > instant - hour)
      .reduce((sum, record) => sum + record.credits, 0);
    const available = Math.max(0, Math.min(mandate.rollingHourCredits - hourlyReserved, mandate.totalCredits - totalReserved));
    return { status: latestPhase, mandate, at, hourlyReserved, totalReserved, available };
  } catch {
    return empty('unreadable');
  }
}

/** Worktree copies have separate order media. Paid starts use the owning checkout and race for one shared lock there. */
export async function withMandateLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const git = await lstat(path.join(root, '.git')).catch(error => { if (missing(error)) return null; throw error; });
  if (git && !git.isDirectory()) throw new StoreError(403, 'Starta betalda order i huvudcheckouten med den gemensamma kvittoliggaren.');
  const directory = path.join(root, '.runtime');
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, 'order-mandate.lock');
  let handle;
  try { handle = await open(lock, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new StoreError(409, 'En annan tagning reserverar krediter. Kontrollera kvittot innan du försöker igen.');
  }
  try { return await action(); }
  finally { await handle.close(); await rm(lock, { force: true }); }
}
