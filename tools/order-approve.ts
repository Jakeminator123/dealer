// The main agent's approval on Jakob's mandate (Jakob 2026-11-13: "beställ lämpliga filmer automatiskt utan mitt
// godkännande"): the same store function as his click in Beställ (tools/order-store.ts approve: nothing waits or is
// missing, the policy in data/order-policy.json, the order's hash frozen), written as by huvudagent with the mandate it acts
// on. Or a draft set aside (AVBRUTEN) with why. The route for his click keeps writing jakob and never takes "by" from a
// page. Placing stays tools/order-put.ts and tools/order-clerk.md.
//
//   node tools/order-approve.ts <id> --mandate "<whose word and when>"     approve a draft
//   node tools/order-approve.ts <id> --set-aside "<why>"                   set a draft aside
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './placement-store.ts';
import { orderStore } from './order-store.ts';
import { credits } from '../src/order-model.ts';

/** Approves or sets aside one draft in the repo at `root`; returns what the command prints. */
export async function approveCommand(root: string, args: string[], options: { now?: () => Date } = {}): Promise<Record<string, unknown>> {
  const [id, flag, text, ...rest] = args;
  if (!id || !['--mandate', '--set-aside'].includes(flag ?? '') || !text?.trim() || rest.length) throw new StoreError(400, 'Använd: node tools/order-approve.ts <id> --mandate "<vems ord och när>" | --set-aside "<varför>"');
  const store = orderStore(root, options);
  const { revision } = await store.load(id);
  if (flag === '--set-aside') {
    const { order } = await store.setAside(id, revision, text, 'huvudagenten');
    return { ok: true, id, status: order.status, setAside: order.setAside };
  }
  const { order, check } = await store.approve(id, revision, { by: 'huvudagent', mandate: text });
  const cap = Number(JSON.parse(await readFile(path.join(root, 'data/order-policy.json'), 'utf8')).dailyCapCredits);
  return {
    ok: true, id, title: order.title, status: order.status, approval: order.approval,
    cost: { total: order.cost.total, worstTotal: order.cost.worstTotal },
    day: { before: check.spentToday, after: check.afterToday, cap, words: `${credits(check.afterToday)} av ${credits(cap)} krediter intecknade i dag med den här (${credits(check.spentToday)} före)` },
    balanceAfter: check.balanceAfter,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  try {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new StoreError(400, 'Kör från dealer-katalogen.');
    console.log(JSON.stringify(await approveCommand(root, process.argv.slice(2)), null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
