// Which ways of making a film can be used: the list, in plain text (read only). Per step (ingång, giv från A2.1, giv från
// A2.3, retur, vila, hålkortet …) every way an approved film order was made with (src/order-ways.ts: the recipe of
// data/order-methods.json plus model, template, tur och retur or not, the kind of reference film, closed card) and its
// state, counted from Jakob's own verdicts in the bank: HÅLLER, FÖLL (with his words and date) or OPRÖVAT (with the film
// that waits for his eyes). A verdict set for him is shown and never counted; his yes in Beslut about a named film
// (data/order-methods.json beslut) counts where the film has no verdict of his own in Granska, and is said as that. The approval reads the same book
// (tools/order-store.ts approve): one pilot of an untried way, none of a way that fell. Nothing is written by hand
// anywhere: run this before a film is ordered (Jakob 2026-11-24, docs/BESKED.md "Bara sätt som håller, och en pilot först").
//   node tools/verdicts-per-method.ts [dealer] [--tagningar] [--alla]
//   dealer        only the ways that dealer's orders were made with (the state is still counted over every order)
//   --tagningar   under each way, one line per film of the bank with its verdict
//   --alla        also the ways of older templates, which no new order can be written with (history)
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STEPS} from '../src/order-model.ts';
import {WAY_STATES, beslutWords, orderable, pilotOf, reviewAddress, type WayRow} from '../src/order-ways.ts';
import {orderStore} from './order-store.ts';

const STATE_WORD = {håller: 'HÅLLER', föll: 'FÖLL', oprövat: 'OPRÖVAT'} as const;
const short = (words: string | null, max = 110) => (words ? `”${words.length > max ? `${words.slice(0, max - 1).trimEnd()}…` : words}”` : '');

/** The list as lines: a heading per step, a line per way, and with takes a line per film. */
export function waysText(book: readonly WayRow[], options: {dealer?: string; takes?: boolean; all?: boolean} = {}): string[] {
  const known = book.filter(r => !options.dealer || r.dealers.includes(options.dealer)), rows = known.filter(r => options.all || orderable(r.way));
  const stepAt = (r: WayRow) => STEPS.findIndex(s => s.key === r.way.step);
  rows.sort((a, b) => stepAt(a) - stepAt(b) || a.step.localeCompare(b.step, 'sv') || WAY_STATES.indexOf(a.state) - WAY_STATES.indexOf(b.state) || b.yes + b.no - (a.yes + a.no) || a.words.localeCompare(b.words, 'sv'));
  const out = ['Sätten att göra en film, per steg. Läget räknas ur Jakobs egna domar i Granska och hans ja i Beslut om namngivna filmer; domar satta åt honom räknas inte.', 'HÅLLER: beställs fritt.  FÖLL: beställs inte igen.  OPRÖVAT: en pilot först, nästa när han har dömt den.'];
  let step = '';
  for (const r of rows) {
    if (r.step !== step) { step = r.step; out.push('', step); }
    const deal = r.way.step.startsWith('GIV-'), judged = r.yes + r.no;
    const counts = [
      judged ? `${deal ? 'given' : 'filmen'} godkänd ${r.yes} av ${judged}${r.beslut.yes ? ` (${r.beslut.yes} ja är ${beslutWords(r.beslut.days)})` : ''}` : 'ingen film dömd av honom',
      ...(r.back.yes + r.back.no ? [`returen ${r.back.yes} av ${r.back.yes + r.back.no}`] : []),
      ...(r.forHim.yes + r.forHim.no ? [`dömda åt honom: ${r.forHim.yes} ja, ${r.forHim.no} nej`] : []),
      `${r.orders.length} order`,
    ].join(' · ');
    out.push(`  ${STATE_WORD[r.state].padEnd(8)} ${r.words}`, `           ${counts}`);
    if (r.said) out.push(`           Jakob${r.said.from === 'beslut' ? ' i Beslut' : ''}${r.said.at ? ` ${r.said.at}` : ''} om ${r.said.film}: ${short(r.said.words) || (r.state === 'föll' ? 'underkänd' : 'godkänd')}`);
    if (r.state === 'oprövat') {
      const pilot = pilotOf(r)?.pilot;
      out.push(`           ${!pilot ? 'ingen pilot är godkänd: nästa order är piloten' : pilot.film ? `väntar på hans ögon: ${pilot.film}${pilot.forHim ? ' (dömd åt honom)' : ''}, ${reviewAddress(pilot.film)}` : `piloten ${pilot.order} är godkänd; dess film finns inte i banken än (${[...new Set(pilot.takes)].join(', ')})`}`);
    }
    if (options.takes) for (const f of r.films) out.push(`             ${f.film.padEnd(44)} ${f.part.padEnd(5)} ${(f.his ? `${f.from === 'beslut' ? 'Beslut' : 'Jakob'}: ${f.his}` : f.forHim ? `åt honom: ${f.forHim}` : 'ej dömd').padEnd(14)} ${f.at ?? ''} ${short(f.words, 80)}`.trimEnd());
  }
  const n = (state: WayRow['state']) => rows.filter(r => r.state === state).length;
  out.push('', `${rows.length} sätt: ${n('håller')} håller, ${n('föll')} föll, ${n('oprövat')} oprövade.${known.length > rows.length ? ` ${known.length - rows.length} äldre sätt, med mallar som ingen ny order skrivs med, visas med --alla.` : ''}`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), dealer = args.find(a => !a.startsWith('--'));
  const {book} = await orderStore(process.cwd()).ways();
  console.log(waysText(book, {dealer, takes: args.includes('--tagningar'), all: args.includes('--alla')}).join('\n'));
}
