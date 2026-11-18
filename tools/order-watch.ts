// The watch on Jakob's queue in Beställ: prints one line when an order he has approved has a take that has never been
// placed, so that the main agent can start the ordering agent (tools/order-clerk.md) without him having to say "lägg
// kön". It only reads. It lives as long as the chat that started it (docs/BRISTER.md): a new main agent starts it again.
// Until 2026-11-18 it lay on the scratch disk, outside Git, as vakta-kon.mjs.
//
//   node tools/order-watch.ts [id to skip ...]     (orders already handed to an ordering agent); run from the repo root
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

type Queued = { id: string; status: string; takes: number; approval?: { by?: string } | null; generation?: { model?: string }; cost?: { total?: number } };

const told = new Set(process.argv.slice(2));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (;;) {
  try {
    for (const name of readdirSync('data/orders')) {
      if (!name.endsWith('.json')) continue;
      let order: Queued;
      try { order = JSON.parse(readFileSync(`data/orders/${name}`, 'utf8')); } catch { continue; }
      // Only Jakob's own clicks: an order the main agent approved on his mandate is handed to an ordering agent at once.
      if (order.status !== 'GODKÄND' || order.approval?.by !== 'jakob' || told.has(order.id)) continue;
      const receipt = `assets/orders/${order.id}/receipt.json`;
      if (existsSync(receipt)) {
        try { if ((JSON.parse(readFileSync(receipt, 'utf8')).takes ?? []).length >= order.takes) { told.add(order.id); continue; } } catch { /* ask the tool */ }
      }
      const check = spawnSync('node', ['tools/order-put.ts', 'check', order.id], { encoding: 'utf8' });
      const ok = /"ok": true/.test(check.stdout), open = (check.stdout.match(/"mayBegin": true/g) ?? []).length;
      if (ok && open) console.log(`GODKÄND, inte lagd: ${order.id} (${order.generation?.model}, ${open} av ${order.takes} tagningar, ${order.cost?.total} krediter)`);
      else if (!ok) console.log(`GODKÄND men kontrollen nekar: ${order.id}: ${(check.stdout + check.stderr).trim().split('\n')[0].slice(0, 200)}`);
      if (!ok || open) told.add(order.id);
    }
  } catch (error) { console.log(`vakten: ${String(error).slice(0, 160)}`); }
  await sleep(8000);
}
