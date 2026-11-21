// One draft from the command line, made the way Bordet and Beställ make one (tools/order-store.ts create): the step's
// recipe gives everything the command does not say, and what it says against the recipe is named in the draft's notes.
// For the main agent's orders on Jakob's mandate, as one take of the deal from 2.3 with each template (mall 12, today's,
// and 13, the review of 2026-11-21; src/order-prompts.ts TEMPLATE_CHOICES):
//
//   node tools/order-new.ts <dealer> <step> [<card>] [--mall 12|13] [--takes <n>] [--title "<namn>"] [--extra "<tillägg>"]
//                           [--reference <id> | --no-reference] [--end <A3-kandidat>] [--base <post>] [--continues <order>] [--dry]
//
// --dry shows the draft without writing it. It makes a draft only: approving is tools/order-approve.ts, placing
// tools/order-put.ts. Nothing here pays or approves. Tests: tools/order-routes.test.ts (the template per order).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './placement-store.ts';
import { orderStore, type NewOrder, type StoreOptions } from './order-store.ts';
import type { StepKey } from '../src/order-model.ts';

const VALUED = ['--mall', '--takes', '--title', '--extra', '--reference', '--end', '--base', '--continues'];
const ALONE = ['--no-reference', '--dry'];
const USE = 'Använd: node tools/order-new.ts <dealer> <steg> [<plats>] [--mall 12|13] [--takes <n>] [--title "<namn>"] [--extra "<tillägg>"] [--reference <id> | --no-reference] [--end <A3-kandidat>] [--base <post>] [--continues <order>] [--dry]';

/** The order the command asks for: the words after the dealer, the step and the card. */
export function newOrderOf(args: readonly string[]): { input: NewOrder; dry: boolean } {
  const plain: string[] = [], flags = new Map<string, string>(), alone = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUED.includes(a)) { const v = args[++i]; if (v === undefined || v.startsWith('--')) throw new StoreError(400, `${a} behöver ett värde. ${USE}`); flags.set(a, v); }
    else if (ALONE.includes(a)) alone.add(a);
    else if (a.startsWith('--')) throw new StoreError(400, `Okänd flagga ${a}. ${USE}`);
    else plain.push(a);
  }
  const [dealer, step, target, ...rest] = plain;
  if (!dealer || !step || rest.length) throw new StoreError(400, USE);
  if (flags.has('--reference') && alone.has('--no-reference')) throw new StoreError(400, 'Välj --reference eller --no-reference.');
  const number = (name: string) => { const v = flags.get(name); if (v === undefined) return undefined; const n = Number(v); if (!Number.isInteger(n)) throw new StoreError(400, `${name} ska vara ett heltal.`); return n; };
  const input: NewOrder = {
    dealer, step: step as StepKey, target: target ?? null,
    template: number('--mall'), takes: number('--takes'), title: flags.get('--title'), extra: flags.get('--extra'),
    reference: alone.has('--no-reference') ? null : flags.get('--reference'), end: flags.get('--end'), base: flags.get('--base'), continues: flags.get('--continues'),
    createdBy: 'huvudagenten, tools/order-new.ts',
  };
  for (const key of Object.keys(input) as (keyof NewOrder)[]) if (input[key] === undefined) delete input[key];
  return { input, dry: alone.has('--dry') };
}

/** Makes (or with --dry shows) one draft in the repo at `root`; returns what the command prints. */
export async function newCommand(root: string, args: readonly string[], options: StoreOptions = {}): Promise<Record<string, unknown>> {
  const { input, dry } = newOrderOf(args);
  const store = orderStore(root, options);
  const order = dry ? (await store.preview([input])).orders[0] : (await store.create(input)).order;
  return {
    ok: true, id: dry ? null : order.id, dry, title: order.title, status: order.status,
    template: order.prompt.template, style: order.prompt.style, words: order.prompt.text.split(/\s+/).length, text: order.prompt.text,
    pictures: order.pictures.map((p) => ({ goesAs: p.goesAs, label: p.label, path: p.path ?? null })),
    reference: order.reference, takes: order.takes, cost: { total: order.cost.total, worstTotal: order.cost.worstTotal }, notes: order.notes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  try {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new StoreError(400, 'Kör från dealer-katalogen.');
    console.log(JSON.stringify(await newCommand(root, process.argv.slice(2)), null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
