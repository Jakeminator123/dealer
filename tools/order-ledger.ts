// The order protocol, read from disk: every order (data/orders/<id>.json), its receipt (assets/orders/<id>/receipt.json),
// the clip bank's records that name it (motions/<id>.json) and the pictures of the register made from its takes
// (data/media-roles.json with each picture's receipt), joined by the pure ledgerOf in studio/lib/ledger.ts, the same
// function the studio's view Protokoll shows. Reads only; a missing or half-written file is a word in problems, never a stop.
//   node tools/order-ledger.ts                       every take, then the summary per method (best first)
//   node tools/order-ledger.ts --efter modell        the summary by one fact: metod, modell, text, vandning, referens, langd
//   node tools/order-ledger.ts --steg giv --dealer paow   only those takes (steg: ingang, giv, retur, vila, bild)
//   node tools/order-ledger.ts --json                the rows, the summary and the problems as JSON
// The lab server answers GET /api/orders/ledger with serveLedger (tools/preview.ts). Tests: tools/order-ledger.test.ts.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dealersOf } from '../src/clip-graph.ts';
import {
  GROUP_BY, STEP_GROUPS, STEP_GROUP_LABEL, filterRows, ledgerOf, methodChips, scoreWords, summarize, verdictWords,
  type GroupBy, type Ledger, type LedgerInput, type LedgerRow, type StepGroup, type StillInput, type SummaryRow,
} from '../studio/lib/ledger.ts';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ANCHOR = /^assets\/anchors\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[a-z0-9._-]+\.(?:png|jpe?g)$/;

type Read = { value: unknown; problem: string | null };
async function readJson(root: string, rel: string, missingIsProblem = false): Promise<Read> {
  let text: string;
  try { text = await readFile(path.join(root, ...rel.split('/')), 'utf8'); } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return { value: null, problem: missing && !missingIsProblem ? null : `${rel} kunde inte läsas.` };
  }
  try { return { value: JSON.parse(text), problem: null }; } catch { return { value: null, problem: `${rel} är inte hel JSON (skrivs den just nu?).` }; }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Everything the ledger joins, read from the checkout at root. */
export async function readLedgerInput(root: string): Promise<LedgerInput> {
  const problems: string[] = [];
  const note = (r: Read) => { if (r.problem) problems.push(r.problem); return r.value; };
  // The orders.
  const names = (await readdir(path.join(root, 'data', 'orders')).catch(() => [] as string[])).filter((n) => n.endsWith('.json') && ID.test(n.slice(0, -5))).sort();
  const orders = (await Promise.all(names.map((n) => readJson(root, `data/orders/${n}`)))).map(note).filter((o): o is Record<string, unknown> => isObj(o) && typeof o.id === 'string' && ID.test(o.id));
  const ids = new Set(orders.map((o) => o.id as string));
  // Their receipts: none yet is no problem (the order is not placed).
  const receipts: Record<string, unknown> = {};
  await Promise.all([...ids].map(async (id) => { receipts[id] = note(await readJson(root, `assets/orders/${id}/receipt.json`)); }));
  // The bank's records that name one of them.
  const records: Record<string, unknown> = {};
  const motionNames = (await readdir(path.join(root, 'motions')).catch(() => [] as string[])).filter((n) => n.endsWith('.json') && ID.test(n.slice(0, -5)));
  await Promise.all(motionNames.map(async (n) => {
    let text: string;
    try { text = await readFile(path.join(root, 'motions', n), 'utf8'); } catch { return; }
    if (!text.includes('"order"')) return;
    let value: unknown;
    try { value = JSON.parse(text); } catch { problems.push(`motions/${n} är inte hel JSON.`); return; }
    const ref = isObj(value) && isObj(value.order) ? value.order : null;
    if (ref && typeof ref.id === 'string' && ids.has(ref.id)) records[n.slice(0, -5)] = value;
  }));
  // The register's pictures of the dealers ordered for, with what their receipts say they were made from.
  const dealers = new Set(orders.map((o) => String(o.dealer)));
  const register = note(await readJson(root, 'data/media-roles.json', true));
  const stills: StillInput[] = [];
  const registered = isObj(register) && isObj(register.dealers) ? register.dealers : {};
  await Promise.all(Object.entries(registered).filter(([d]) => dealers.has(d)).flatMap(([dealer, d]) => (isObj(d) && Array.isArray(d.entries) ? d.entries : []).map(async (e: unknown) => {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.path !== 'string') return;
    const m = ANCHOR.exec(e.path);
    if (!m) return;
    const receipt = (await readJson(root, `assets/anchors/${m[1]}/receipt.json`)).value;
    const r = isObj(receipt) ? receipt : {};
    const shas = [isObj(r.original) ? r.original.sha256 : null, isObj(r.output) ? r.output.sha256 : null].filter((s): s is string => typeof s === 'string');
    stills.push({ id: e.id, dealer, name: typeof e.name === 'string' ? e.name : null, path: e.path, state: typeof e.state === 'string' ? e.state : null, stateBy: typeof e.stateBy === 'string' ? e.stateBy : null, shas, by: typeof r.by === 'string' ? r.by : null });
  })));
  stills.sort((a, b) => a.id.localeCompare(b.id));
  // Whose each clip is (a reference film) and the dealers' names.
  const jobs = (await readJson(root, 'data/clip-jobs.json')).value;
  const owners = isObj(jobs) ? dealersOf(jobs as never) : {};
  const named = (await readJson(root, 'data/dealers.json')).value;
  const dealerNames: Record<string, string> = {};
  for (const d of isObj(named) && Array.isArray(named.dealers) ? named.dealers : []) if (isObj(d) && typeof d.id === 'string' && typeof d.name === 'string') dealerNames[d.id] = d.name;
  return { orders, receipts, records, stills, owners, dealers: dealerNames, problems };
}

export async function readLedger(root: string): Promise<Ledger> {
  return ledgerOf(await readLedgerInput(root));
}

/** GET /api/orders/ledger for the lab server: the rows and the problems. Task ids are not in the rows. */
export async function serveLedger(req: IncomingMessage, res: ServerResponse, root = process.cwd()): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  try {
    const body = JSON.stringify(await readLedger(root));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error: 'Protokollet gick inte att läsa.' }));
  }
}

// ── The table ───────────────────────────────────────────────────────────────
const pad = (rows: string[][]) => {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => [...(r[i] ?? '')].length)));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c + ' '.repeat(widths[i] - [...c].length))).join('  ').trimEnd());
};
const reviewerWords = (r: LedgerRow) => (!r.reviewer ? '–' : r.reviewer.deal !== null || r.reviewer.back !== null ? [r.reviewer.deal !== null ? `giv ${scoreWords(r.reviewer.deal)}` : null, r.reviewer.back !== null ? `retur ${scoreWords(r.reviewer.back)}` : null, r.reviewer.score !== null && r.reviewer.deal === null && r.reviewer.back === null ? scoreWords(r.reviewer.score) : null].filter(Boolean).join(', ') + '/5' : r.reviewer.score !== null ? `${scoreWords(r.reviewer.score)}/5` : 'ingen poäng');
const ownerWords = (r: LedgerRow) => {
  const back = r.parts.find((p) => p.part === 'return');
  const main = verdictWords(r.owner) + (r.owner.words ? ` «${r.owner.words}»` : '');
  return back && back.verdict !== 'vantar' ? `${main}; retur ${verdictWords(back)}` : main;
};

export function rowsTable(rows: readonly LedgerRow[]): string[] {
  const head = ['Tagning', 'Steg', 'Status', 'Granskare', 'Jakob', 'Krediter'];
  const out: string[] = [];
  const lines = pad([head, ...rows.map((r) => [`${r.order} #${r.take}`, [STEP_GROUP_LABEL[r.step.group], r.step.seat].filter(Boolean).join(' '), r.status.label, reviewerWords(r), ownerWords(r), r.cost.credits === null ? '–' : `${r.cost.credits}${r.cost.spent ? '' : ' (ej lagd)'}`])]);
  out.push(lines[0]);
  rows.forEach((r, i) => { out.push(lines[i + 1]); out.push(`    ${methodChips(r.method).join(' · ')}`); });
  return out;
}

export function summaryTable(summary: readonly SummaryRow[], by: GroupBy): string[] {
  const head = [by === 'metod' ? 'Steg' : '', by === 'metod' ? 'Metod' : 'Efter', 'Tagningar', 'Lagda', 'Granskare', 'Jakob ✓ godk', '◆ var', '✕ underk', '○ ej dömd', 'Krediter'];
  return pad([head, ...summary.map((s) => [s.step ? STEP_GROUP_LABEL[s.step] : '', s.facts.join(' · '), String(s.takes), String(s.placed), s.mean === null ? '–' : `${scoreWords(s.mean)}/5 (n=${s.scored})${s.backMean !== null ? `, retur ${scoreWords(s.backMean)}` : ''}`, String(s.accepted), String(s.variant), String(s.rejected), String(s.open), String(s.credits)])]).map((line) => line.replace(/^ +/, ''));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const by = (flag('--efter') ?? 'metod') as GroupBy, group = flag('--steg') as StepGroup | undefined, dealer = flag('--dealer');
  if (!GROUP_BY.includes(by) || (group && !STEP_GROUPS.includes(group))) {
    console.error(`Använd: node tools/order-ledger.ts [--efter ${GROUP_BY.join('|')}] [--steg ${STEP_GROUPS.join('|')}] [--dealer <id>] [--json]`);
    process.exit(2);
  }
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const ledger = await readLedger(root);
  const rows = filterRows(ledger.rows, { group: group ?? null, dealer: dealer ?? null });
  const summary = summarize(rows, by);
  if (args.includes('--json')) console.log(JSON.stringify({ rows, summary, problems: ledger.problems }, null, 2));
  else {
    const placed = rows.filter((r) => r.status.placed).length;
    console.log(`Protokoll: ${rows.length} tagningar ur ${new Set(rows.map((r) => r.order)).size} beställningar, ${placed} lagda.\n`);
    console.log(rowsTable(rows).join('\n'));
    console.log(`\nPer ${by === 'metod' ? 'metod' : by} (bäst först; Jakobs omdömen räknas på lagda tagningar):`);
    console.log(summaryTable(summary, by).join('\n'));
    if (ledger.problems.length) console.log(`\nProblem:\n${ledger.problems.map((p) => `  ${p}`).join('\n')}`);
  }
}
