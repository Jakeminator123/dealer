// One draft from the command line, made the way Bordet and Beställ make one (tools/order-store.ts create): the step's
// recipe gives everything the command does not say, and what it says against the recipe is named in the draft's notes.
// For the main agent's orders on Jakob's mandate, as one take of the deal from 2.3 with each template (mall 12, today's,
// and 13, the review of 2026-11-21; src/order-prompts.ts TEMPLATE_CHOICES):
//
//   node tools/order-new.ts <dealer> <step> [<card>] [--mall 12|13] [--takes <n>] [--title "<namn>"] [--extra "<tillägg>"]
//                           [--reference <id> | --no-reference] [--end <A3-kandidat> | --no-end] [--base <post>]
//                           [--continues <order>] [--trad <träd>] [--docka <namn>] [--dry]
//   node tools/order-new.ts paow "A2.3 - A3P4C2" --dry      (his notation, studio/lib/names.ts parseJakob: one film,
//                                                           its step chosen by the anchor, GIV-2.3 here; "A2.3 - A1" is UTGANG-2.3)
//
// The pictures are the ones Bordet's row would take: the dealer's anchors that hold. --trad <id> (data/dealer-trees.json)
// refuses a draft whose A1 or A2 picture is not one of that tree's anchors; without it the output names the trees each
// picture belongs to. --no-end: a deal with no last picture, for a seat with no A3 yet (the A3 is then made from the
// delivered film's last frame with tools/landing-make.ts). --docka <namn>: the reference film is that dealer's own doll's
// film for the edge (data/rendered-references.json, an entry with "doll"), which is never the default. --dry shows the draft (model, length, price, pictures, reference film, text) without writing it.
// It makes a draft only: approving is tools/order-approve.ts, placing tools/order-put.ts. Nothing here pays or approves.
// Tests: tools/order-routes.test.ts (the template per order, his notation, the tree).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './placement-store.ts';
import { orderStore, type NewOrder, type StoreOptions } from './order-store.ts';
import { STEPS, edgeOf, stepOfEdge, type Order, type RenderedReference, type StepKey } from '../src/order-model.ts';
import { parseJakob } from '../studio/lib/names.ts';

const VALUED = ['--mall', '--takes', '--title', '--extra', '--reference', '--end', '--base', '--continues', '--trad', '--docka'];
const ALONE = ['--no-reference', '--no-end', '--dry'];
const USE = 'Använd: node tools/order-new.ts <dealer> <steg> [<plats>] (eller <dealer> "A2.3 - A3P4C2") [--mall 12|13] [--takes <n>] [--title "<namn>"] [--extra "<tillägg>"] [--reference <id> | --no-reference] [--end <A3-kandidat> | --no-end] [--base <post>] [--continues <order>] [--trad <träd>] [--docka <namn>] [--dry]';

/** His notation ("A2.3 - A3P4C2", "A2.3 → A1"): the step and the card of the one film it names. */
export function stepOfNotation(text: string): { step: StepKey; target: string | null } {
  const { steps, errors } = parseJakob(text);
  if (errors.length) throw new StoreError(400, `Kan inte läsa "${text}": ${errors.join(' ')}`);
  if (steps.length !== 1) throw new StoreError(400, `"${text}" är ${steps.length} filmer; ett utkast är en film, skriv ett steg i taget.`);
  const found = stepOfEdge(steps[0].from, steps[0].to);
  if (!found) throw new StoreError(400, `Inget steg i Beställ gör "${text}" (${steps[0].from} → ${steps[0].to}).`);
  return found;
}

/** The order the command asks for: the words after the dealer, the step and the card (or his notation). */
export function newOrderOf(args: readonly string[]): { input: NewOrder; dry: boolean; tree: string | null; doll: string | null } {
  const plain: string[] = [], flags = new Map<string, string>(), alone = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUED.includes(a)) { const v = args[++i]; if (v === undefined || v.startsWith('--')) throw new StoreError(400, `${a} behöver ett värde. ${USE}`); flags.set(a, v); }
    else if (ALONE.includes(a)) alone.add(a);
    else if (a.startsWith('--')) throw new StoreError(400, `Okänd flagga ${a}. ${USE}`);
    else plain.push(a);
  }
  const [dealer, ...said] = plain;
  if (!dealer || !said.length) throw new StoreError(400, USE);
  const keyed = STEPS.some((s) => s.key === said[0]);
  if (keyed && said.length > 2) throw new StoreError(400, USE);
  // In the step form the seat may be written as the plan writes it (P4.C2) or in his notation (A3P4C2, P4C2): the store takes the plan's.
  const seat = (text: string | undefined) => { const m = text ? /^(?:A3)?(P[1-7]|D)\.?C([1-3])$/i.exec(text) : null; return m ? `${m[1].toUpperCase()}.C${m[2]}` : text ?? null; };
  const { step, target } = keyed ? { step: said[0] as StepKey, target: seat(said[1]) } : stepOfNotation(said.join(' '));
  if (flags.has('--reference') && alone.has('--no-reference')) throw new StoreError(400, 'Välj --reference eller --no-reference.');
  if (flags.has('--end') && alone.has('--no-end')) throw new StoreError(400, 'Välj --end eller --no-end.');
  if (flags.has('--docka') && (flags.has('--reference') || alone.has('--no-reference'))) throw new StoreError(400, '--docka väljer referensfilmen; ta bort --reference eller --no-reference.');
  const number = (name: string) => { const v = flags.get(name); if (v === undefined) return undefined; const n = Number(v); if (!Number.isInteger(n)) throw new StoreError(400, `${name} ska vara ett heltal.`); return n; };
  const input: NewOrder = {
    dealer, step, target,
    template: number('--mall'), takes: number('--takes'), title: flags.get('--title'), extra: flags.get('--extra'),
    reference: alone.has('--no-reference') ? null : flags.get('--reference'), end: alone.has('--no-end') ? null : flags.get('--end'), base: flags.get('--base'), continues: flags.get('--continues'),
    createdBy: 'huvudagenten, tools/order-new.ts',
  };
  for (const key of Object.keys(input) as (keyof NewOrder)[]) if (input[key] === undefined) delete input[key];
  return { input, dry: alone.has('--dry'), tree: flags.get('--trad') ?? null, doll: flags.get('--docka') ?? null };
}

type TreeRegister = { dealers: Record<string, { trees: { id: string; anchors: { entry: string }[] }[] }> };

/**
 * The trees (data/dealer-trees.json) each picture's register entry belongs to. With a tree named, an anchor picture (A1,
 * A2.x) outside it stops the draft; the card's picture (A3, or the landing a return starts on) is only named, since a tree
 * takes its A3 from the films made for it.
 */
export function treesOf(root: string, order: Pick<Order, 'dealer' | 'step' | 'pictures'>, tree: string | null): { goesAs: string; entry: string | null; trees: string[] }[] {
  const register = JSON.parse(readFileSync(path.join(root, 'data', 'dealer-trees.json'), 'utf8')) as TreeRegister;
  const trees = register.dealers[order.dealer]?.trees ?? [];
  if (tree && !trees.some((t) => t.id === tree)) throw new StoreError(400, `${order.dealer} har inget träd "${tree}" (${trees.map((t) => t.id).join(', ') || 'inga träd'}).`);
  const def = STEPS.find((s) => s.key === order.step.key);
  const card = def?.card ? (def.start === 'LAND' ? 'startFrame' : 'endFrame') : null;
  return order.pictures.map((p) => {
    const entry = p.from?.entry ?? null;
    const of = entry ? trees.filter((t) => t.anchors.some((a) => a.entry === entry)).map((t) => t.id) : [];
    if (tree && p.goesAs !== card && !of.includes(tree)) throw new StoreError(400, `${p.label}${entry ? ` (${entry})` : ''} hör inte till trädet "${tree}". Välj trädets ankare med --base.`);
    return { goesAs: p.goesAs, entry, trees: of };
  });
}

/**
 * The film of a dealer's own doll for the order's edge (data/rendered-references.json, an entry with "doll"): the one listed
 * last where there are several (a film made again is listed after the one it replaces). Never the default; only --docka.
 */
export function dollFilm(root: string, doll: string, input: Pick<NewOrder, 'step' | 'target'>): RenderedReference {
  const file = path.join(root, 'data', 'rendered-references.json');
  const films = existsSync(file) ? ((JSON.parse(readFileSync(file, 'utf8')) as { films?: RenderedReference[] }).films ?? []) : [];
  const def = STEPS.find((s) => s.key === input.step);
  const edge = def ? edgeOf(def, input.target ?? null) : null;
  const own = films.filter((f) => f.doll === doll);
  const film = own.filter((f) => f.edge === edge).at(-1);
  if (!film) throw new StoreError(400, `Dockan ${doll} har ingen film för ${edge ?? input.step} i data/rendered-references.json${own.length ? ` (den har ${own.map((f) => f.edge).join(', ')})` : ''}.`);
  return film;
}

/** Makes (or with --dry shows) one draft in the repo at `root`; returns what the command prints. */
export async function newCommand(root: string, args: readonly string[], options: StoreOptions = {}): Promise<Record<string, unknown>> {
  const { input, dry, tree, doll } = newOrderOf(args);
  const dolls = doll ? dollFilm(root, doll, input) : null;
  if (dolls) input.reference = dolls.id;
  const store = orderStore(root, options);
  const shown = (await store.preview([input])).orders[0];
  treesOf(root, shown, tree); // a picture outside the named tree stops the draft before anything is written
  const order = dry ? shown : (await store.create(input)).order;
  const trees = treesOf(root, order, null);
  return {
    ok: true, id: dry ? null : order.id, dry, title: order.title, status: order.status, step: order.step.key, edge: order.step.edge,
    model: order.generation.model, seconds: order.generation.params.duration ?? null, resolution: order.generation.params.resolution ?? null,
    template: order.prompt.template, style: order.prompt.style, words: order.prompt.text.split(/\s+/).length, text: order.prompt.text,
    pictures: order.pictures.map((p, i) => ({ goesAs: p.goesAs, label: p.label, entry: trees[i].entry, trees: trees[i].trees, path: p.path ?? null })),
    reference: order.reference, doll: dolls ? `dockan ${doll}s film ${dolls.id} (${dolls.edge}) går med som referensfilm` : null, takes: order.takes, cost: { total: order.cost.total, worstTotal: order.cost.worstTotal }, notes: order.notes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  try {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new StoreError(400, 'Kör från dealer-katalogen.');
    console.log(JSON.stringify(await newCommand(root, process.argv.slice(2)), null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
