// Jakob's own verdicts counted per ordering method (read only): every deal take of a dealer that came from an order in
// Beställ, with the order's model, reference film, turn, and template, and his verdict on the deal part and on the
// return part (motions/<clip>.json, review). One line per take, then a count per method. A provisional verdict (not
// his) and an unjudged take count as not judged. The handbook's section 5 quotes these counts; run this before a new
// round is chosen, because his verdicts and a reviewer's scores have differed on about a third of the takes.
//   node tools/verdicts-per-method.ts [dealer]        (default paow)
import {readdirSync, readFileSync, existsSync} from 'node:fs';

type Verdict = {v: string; words: string} | null;
const dealer = process.argv[2] ?? 'paow';
const orders = new Map<string, any>();
for (const f of readdirSync('data/orders')) { try { const o = JSON.parse(readFileSync(`data/orders/${f}`, 'utf8')); orders.set(o.id, o); } catch { /* not an order file */ } }
const verdict = (id: string): Verdict => {
  const file = `motions/${id}.json`; if (!existsSync(file)) return null;
  const r = JSON.parse(readFileSync(file, 'utf8')).review ?? {};
  if (r.provisional || !r.userReview) return null;
  const v = r.decision === 'REJECTED' ? 'UNDERKÄND' : r.decision === 'ACCEPTED' ? (r.acceptedAs === 'MAIN' ? 'PRIMÄR' : r.acceptedAs === 'VARIANT' ? 'VARIANT' : 'GODKÄND') : null;
  return v ? {v, words: String(r.userReview).replace(/^\S+ \d{4}-\d{2}-\d{2}: /, '').slice(0, 70)} : null;
};
const rows: {take: string; seat: string; method: string; deal: Verdict; back: Verdict}[] = [];
for (const f of readdirSync('motions')) {
  const m = /^(.+)-(\d\d)-deal\.json$/.exec(f);
  if (!m || !f.startsWith(`${dealer}-`)) continue;
  const order = orders.get(m[1]); if (!order || order.motion?.target == null) continue;
  const take = `${m[1]}-${m[2]}`, deal = verdict(`${take}-deal`), back = verdict(`${take}-return-ready`) ?? verdict(`${take}-return-idle`);
  const ref = order.reference?.status === 'FINNS' ? ` + referens${order.reference.goesTo === order.motion.target && /plan|arkiv/.test(order.reference.clips?.[0] ?? '') ? '' : ' (annan pose)'}` : '';
  rows.push({take: take.replace(`${dealer}-giv-2-1-`, ''), seat: String(order.motion.target).replace('.C1', ''), method: `${order.generation.model}${ref} · ${order.motion.side === 'BACK' ? 'stängt' : order.motion.flipAxis} · ${order.prompt.template}`, deal, back});
}
rows.sort((a, b) => a.method.localeCompare(b.method) || a.take.localeCompare(b.take));
const yes = (v: Verdict) => !!v && v.v !== 'UNDERKÄND';
const by = new Map<string, {dealYes: number; dealNo: number; backYes: number; backNo: number; open: number}>();
for (const r of rows) {
  const key = r.method.replace(/ · film-giv[a-zö-]*@\d+$/, '');
  const c = by.get(key) ?? {dealYes: 0, dealNo: 0, backYes: 0, backNo: 0, open: 0};
  if (r.deal) { if (yes(r.deal)) c.dealYes++; else c.dealNo++; } else c.open++;
  if (r.back) { if (yes(r.back)) c.backYes++; else c.backNo++; }
  by.set(key, c);
  console.log(`${r.seat.padEnd(5)} ${r.take.padEnd(14)} ${r.method.padEnd(60)} giv: ${(r.deal?.v ?? 'ej dömd').padEnd(10)} retur: ${(r.back?.v ?? 'ej dömd').padEnd(10)} ${r.deal?.words ?? ''}`);
}
console.log('\nPer metod (Jakobs domar; godkänd = Primär, Godkänd eller Variant):');
for (const [k, c] of [...by].sort((a, b) => (b[1].dealYes + b[1].dealNo) - (a[1].dealYes + a[1].dealNo))) console.log(`  ${k.padEnd(46)} given ${c.dealYes} av ${c.dealYes + c.dealNo}${c.open ? ` (+${c.open} ej dömda)` : ''} · returen ${c.backYes} av ${c.backYes + c.backNo}`);
