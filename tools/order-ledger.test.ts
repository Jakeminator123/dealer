// Offline tests for the order protocol: the pure join in studio/lib/ledger.ts (scores out of a reviewer's note, the text's
// style, a method as facts, Jakob's verdict per take from the bank and from Material, the summary per method) and the
// reading in tools/order-ledger.ts on a folder of its own with a half-written file, and on the checkout. No media needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { filterRows, ledgerOf, methodChips, methodOf, scoresOf, sharedFacts, styleOf, summarize, type LedgerInput } from '../studio/lib/ledger.ts';
import { readLedger, serveLedger } from './order-ledger.ts';

const order = (id: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, id, title: `Prov ${id}`, dealer: 'paow', kind: 'FILM', created: '2026-11-13T01:00:00.000Z',
  step: { key: 'GIV-2.1', label: 'Nyp, ett kort till platsen och tillbaka', edge: 'READY>P4.C1', shape: 'ROUND_TRIP', cutInto: ['READY>P4.C1', 'P4.C1>READY'] },
  motion: { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', target: 'P4.C1', side: 'FRONT', fromPlan: true },
  pictures: [{ name: 'first.png', goesAs: 'startFrame', path: `assets/orders/${id}/first.png`, sha256: 'a'.repeat(64) }, { name: 'last.png', goesAs: 'endFrame', path: `assets/orders/${id}/last.png`, sha256: 'b'.repeat(64) }],
  reference: { status: 'INGEN', why: '' },
  generation: { provider: 'runway-app', tool: 'generate_video', model: 'kling-4', params: { resolution: '1080p', duration: 7 } },
  prompt: { template: 'film-giv@3', text: 'One continuous take. She deals one card. Nothing of this happens: a second card appears.', sha256: 'c'.repeat(64), extra: null, middle: false },
  takes: 2, cost: { perTake: 150, total: 300, worstPerTake: 165, worstTotal: 330, basis: '' },
  approval: { by: 'jakob', at: '2026-11-13T01:00:00.000Z', orderSha256: 'd'.repeat(64) }, status: 'GODKÄND', notes: [],
  ...extra,
});
const take = (n: number, notes: { status: string; note?: string }[], extra: Record<string, unknown> = {}) => ({
  take: n, status: notes[notes.length - 1]?.status ?? 'LAGD', requestedAt: '2026-11-13T01:00:00.000Z', taskId: `task-0000000${n}`, file: `assets/orders/x/take-${n}/after.mp4`, sha256: null,
  history: notes.map((h, i) => ({ at: `2026-11-13T01:0${i}:00.000Z`, ...h })), ...extra,
});
const record = (id: string, orderId: string, n: number, kind: string | null, review: Record<string, unknown> | null, frames?: [number, number]) => ({
  id, source: { path: `assets/motions/${orderId}-0${n}/source.mp4`, fps: 24, frames: 169 },
  ...(kind ? { motion: { kind, ...(frames ? { segment: { clip: `${orderId}-0${n}`, frames } } : {}) } } : {}),
  ...(review ? { review } : { cutInto: [] }),
  order: { id: orderId, take: n },
});

test('scores out of a reviewer\'s note: the whole, or the deal and the return, with a decimal comma', () => {
  assert.deepEqual(scoresOf('Oberoende granskare: given 2/5, returen 1/5. Kortet vänds två gånger (ruta 61-63 och 90-93)'), { score: 2, deal: 2, back: 1 });
  assert.deepEqual(scoresOf('Oberoende granskare: given 2,5/5 möjlig variant, returen 1,5/5. Vänds en gång'), { score: 2.5, deal: 2.5, back: 1.5 });
  assert.deepEqual(scoresOf('Oberoende granskare: 3/5, användbar med anmärkningar.'), { score: 3, deal: null, back: null });
  assert.deepEqual(scoresOf('Oberoende granskare: användbar efter lätt lagning, 4/5; nypet på kortet'), { score: 4, deal: null, back: null });
  assert.deepEqual(scoresOf('ingen poäng här, 1764/1174 och 12/5'), { score: null, deal: null, back: null });
  assert.deepEqual(scoresOf(null), { score: null, deal: null, back: null });
});

test('the text\'s style: the order\'s own word, a style word in the template, else the template as its own label', () => {
  assert.equal(styleOf({ style: 'kort', template: 'film-giv@3' }), 'Kort');
  assert.equal(styleOf({ style: 'Lång', template: 'film-giv@3' }), 'Lång');
  assert.equal(styleOf({ template: 'film-giv-minimal@1' }), 'Minimal');
  assert.equal(styleOf({ template: 'film-giv-utforlig@4' }), 'Utförlig');
  assert.equal(styleOf({ template: 'film-giv@3' }), 'film-giv@3');
  assert.equal(styleOf({}), 'okänd mall');
});

test('a method as plain facts: model, length, text, ban list, turn, hand, landing, reference and pictures', () => {
  const m = methodOf(order('a'));
  assert.equal(m.modelLabel, 'Kling 4');
  assert.equal(m.seconds, 7);
  assert.equal(m.ban, true);
  assert.equal(m.turn, 'Vänd vid platsen');
  assert.equal(m.hand, 'Vänster');
  assert.equal(m.landing, 'öppet');
  assert.equal(m.pictures, 2);
  assert.deepEqual(methodChips(m), ['Kling 4', '7 s', 'film-giv@3 · 15 ord', 'förbudslista', 'Vänd vid platsen', 'Vänster', 'landar öppet', 'ingen referens', '2 bilder']);
  const closed = methodOf(order('b', { motion: { hand: 'LH', pass: true, turn: false, flipAxis: 'AT_PLACE', side: 'BACK', target: 'P1.C1' }, reference: { status: 'FINNS', clips: ['pamela-p4-c1-plan-deal-02'], path: 'x.mp4', sha256: 'e'.repeat(64), seconds: 7, goesTo: 'referenceVideos', approvedStraight: true } }), { 'pamela-p4-c1-plan-deal-02': 'pamela' });
  assert.equal(closed.turn, 'Stängt hela vägen');
  assert.equal(closed.hand, 'Handbyte');
  assert.equal(closed.landing, 'stängt');
  assert.deepEqual(closed.reference, { has: true, whose: 'pamela' });
  assert.notEqual(closed.key, m.key);
  // The same choices for another seat are the same method; the text's length is a fact, not part of the method.
  assert.equal(methodOf(order('c', { prompt: { template: 'film-giv@3', text: 'Longer text. '.repeat(40), sha256: 'f'.repeat(64), extra: null, middle: false } })).key.replace('|ban|', '||'), m.key.replace('|ban|', '||'));
});

function sample(): LedgerInput {
  return {
    orders: [
      order('giv-a'),
      order('giv-b', { generation: { provider: 'runway-app', tool: 'generate_video', model: 'wan3', params: { resolution: '1080p', duration: 7 } }, takes: 1, approval: null, status: 'UTKAST', created: '2026-11-13T02:00:00.000Z' }),
      order('bild-a', { kind: 'STILL', step: { key: 'ANKARE-2.1', label: 'Ankare 2.1 (nyp)', edge: null, shape: null, cutInto: [] }, motion: null, generation: { provider: 'runway-app', tool: 'generate_image', model: 'nano-banana-pro', params: { ratio: '4:3', imageSize: '4K' } }, pictures: [{ name: 'anchor.png', goesAs: 'referenceImage', tag: 'anchor', path: 'assets/orders/bild-a/anchor.png', sha256: 'a'.repeat(64) }], created: '2026-11-12T23:00:00.000Z' }),
      'half-written', { title: 'utan id' },
    ],
    receipts: {
      'giv-a': { schemaVersion: 1, order: 'giv-a', takes: [
        take(1, [{ status: 'LAGD' }, { status: 'MÄTT', note: 'mätt' }, { status: 'GRANSKAD', note: 'Oberoende granskare: given 2/5, returen 1/5. Jakob: hon vrider tillbaka kortet' }, { status: 'INFÖRD' }]),
        take(2, [{ status: 'LAGD' }, { status: 'GRANSKAD', note: 'Oberoende granskare: given 3/5, returen 2/5.' }, { status: 'INFÖRD' }]),
      ] },
      'bild-a': { schemaVersion: 1, order: 'bild-a', takes: [take(1, [{ status: 'GRANSKAD', note: 'Oberoende granskare: 4/5' }], { sha256: '1'.repeat(64) }), take(2, [{ status: 'GRANSKAD', note: 'Oberoende granskare: inte användbar, 2/5' }], { sha256: '2'.repeat(64) })] },
      'giv-b': null,
    },
    records: {
      'paow-giv-a-01': record('paow-giv-a-01', 'giv-a', 1, null, null),
      'paow-giv-a-01-deal': record('paow-giv-a-01-deal', 'giv-a', 1, 'DEAL', { decision: 'REJECTED', userAccepted: false, userReview: 'Jakob 2026-11-13: omsvängningen förstör' }, [0, 102]),
      'paow-giv-a-01-return-ready': record('paow-giv-a-01-return-ready', 'giv-a', 1, 'RETURN', { decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-13: godkänd i labbet.' }, [103, 168]),
      'paow-giv-a-02-deal': record('paow-giv-a-02-deal', 'giv-a', 2, 'DEAL', { decision: 'ACCEPTED', userAccepted: true, acceptedAs: 'VARIANT', userReview: 'Jakob 2026-11-13: En bra variant' }, [0, 104]),
      'paow-giv-a-02-return-ready': record('paow-giv-a-02-return-ready', 'giv-a', 2, 'RETURN', { decision: 'PENDING', inbox: true }, [105, 168]),
      'pamela-other': { id: 'pamela-other', review: { decision: 'ACCEPTED' } },
      broken: 'not an object',
    },
    stills: [
      { id: 'nyp-1', dealer: 'paow', name: 'Nyp 1', path: 'assets/anchors/nyp-1/anchor.png', state: 'gäller', stateBy: 'Jakob 2026-11-13 01:29: kandidat → gäller (Material)', shas: ['1'.repeat(64)], by: 'agent: beställningen bild-a, tagning 1, efterarbetad' },
      { id: 'nyp-1-lagad', dealer: 'paow', name: 'Nyp 1, lagad', path: 'assets/anchors/nyp-1-lagad/anchor.png', state: 'kandidat', stateBy: null, shas: ['9'.repeat(64)], by: 'agent: beställningen bild-a, tagning 1, lagad kopia' },
      { id: 'nyp-2', dealer: 'paow', name: 'Nyp 2', path: 'assets/anchors/nyp-2/anchor.png', state: 'ersatt', stateBy: 'Jakob 2026-11-13 01:29: kandidat → ersatt', shas: ['2'.repeat(64)], by: null },
      { id: 'bild-a-10', dealer: 'paow', name: 'Not the order\'s', path: 'assets/anchors/x/anchor.png', state: 'gäller', stateBy: null, shas: [], by: 'beställningen bild-a, tagning 10' },
    ],
    dealers: { paow: 'Paow' },
  };
}

test('one row per take: what was sent, what happened, the reviewer\'s score and Jakob\'s verdict, newest order first', () => {
  const { rows, problems } = ledgerOf(sample());
  assert.deepEqual(rows.map((r) => r.key), ['giv-b#1', 'giv-a#1', 'giv-a#2', 'bild-a#1', 'bild-a#2']);
  assert.equal(problems.length, 2, 'the half-written order and the one without id are passed over with a word');
  const [draft, a1, a2, s1, s2] = rows;
  // An order without a receipt is a row that is not placed, and costs nothing yet.
  assert.equal(draft.status.code, 'UTKAST');
  assert.equal(draft.status.placed, false);
  assert.equal(draft.cost.spent, false);
  assert.equal(draft.reviewer, null);
  assert.equal(draft.owner.verdict, 'vantar');
  assert.equal(draft.see.stand, 'assets/orders/giv-b/first.png');
  assert.equal(draft.see.film, null);
  // Take 1: Jakob rejected the deal in his own words; the return's acceptance carries the store's words, which are not his.
  assert.equal(a1.status.label, 'Införd');
  assert.deepEqual({ score: a1.reviewer!.score, deal: a1.reviewer!.deal, back: a1.reviewer!.back }, { score: 2, deal: 2, back: 1 });
  assert.match(a1.reviewer!.note, /hon vrider tillbaka/);
  assert.deepEqual(a1.owner, { verdict: 'underkand', byJakob: true, detail: null, words: 'omsvängningen förstör' });
  assert.deepEqual(a1.parts.map((p) => [p.part, p.verdict, p.words]), [['deal', 'underkand', 'omsvängningen förstör'], ['return', 'godkand', null]]);
  assert.equal(a1.see.film, 'assets/motions/giv-a-01/source.mp4');
  assert.equal(a1.see.landing, 102);
  assert.equal(a1.see.review, '/granska/?tagning=paow-giv-a-01-deal&dealer=paow');
  assert.equal(a1.see.send, '/bestall/?order=giv-a&dealer=paow');
  assert.equal(a1.step.seat, 'plats 4');
  assert.equal(a1.cost.credits, 150);
  assert.equal(a1.cost.spent, true);
  assert.deepEqual(a2.owner, { verdict: 'variant', byJakob: true, detail: null, words: 'En bra variant' });
  // A still: Jakob's word is the state of the picture made from the take (by its hash), its repaired copy by the receipt's words.
  assert.equal(s1.reviewer!.score, 4);
  assert.deepEqual(s1.owner, { verdict: 'godkand', byJakob: true, detail: null, words: null });
  assert.equal(s1.parts[0].stamp, 'Jakob 2026-11-13');
  assert.deepEqual(s1.parts.map((p) => [p.id, p.part, p.verdict]), [['nyp-1', 'whole', 'godkand'], ['nyp-1-lagad', 'fix', 'vantar']]);
  assert.equal(s1.see.picture, 'assets/anchors/nyp-1/anchor.png');
  assert.equal(s1.see.material, '/material/?bild=nyp-1&dealer=paow');
  assert.equal(s1.see.review, null);
  assert.deepEqual(s2.owner, { verdict: 'underkand', byJakob: true, detail: 'ersatt', words: null });
  assert.equal(s2.parts.length, 1, 'tagning 10 is not tagning 1');
});

test('the summary per method: counts always, the reviewer\'s mean, Jakob\'s verdicts on placed takes, best first', () => {
  const { rows } = ledgerOf(sample());
  const summary = summarize(rows);
  assert.deepEqual(summary.map((s) => [s.step, s.takes, s.placed, s.notPlaced, s.scored, s.mean, s.accepted, s.variant, s.rejected, s.open]), [
    ['bild', 2, 2, 0, 2, 3, 1, 0, 1, 0],
    ['giv', 2, 2, 0, 2, 2.5, 0, 1, 1, 0],
    ['giv', 1, 0, 1, 0, null, 0, 0, 0, 0],
  ]);
  assert.equal(summary[1].backMean, 1.5);
  assert.equal(summary[1].credits, 300);
  assert.deepEqual(summary[2].facts.slice(0, 2), ['WAN 3', '7 s']);
  // By one fact: every sample order has the same template and a ban list; by model, three.
  assert.deepEqual(summarize(rows, 'text').map((s) => [s.facts.join(' '), s.takes]), [['film-giv@3 förbudslista', 5]]);
  assert.deepEqual(summarize(rows, 'modell').map((s) => [s.facts[0], s.takes, s.mean]), [['Nano Banana Pro', 2, 3], ['Kling 4', 2, 2.5], ['WAN 3', 1, null]]);
  assert.deepEqual(filterRows(rows, { group: 'giv', placedOnly: true }).map((r) => r.key), ['giv-a#1', 'giv-a#2']);
  assert.deepEqual(filterRows(rows, { dealer: 'pamela' }), []);
  // What every method shown shares is said once: here the template, the ban list, no reference and two pictures.
  assert.deepEqual(sharedFacts(summary.map((s) => s.facts)), ['film-giv@3', 'förbudslista', 'ingen referens']);
  assert.deepEqual(sharedFacts([['a', 'b']]), []);
});

test('nothing breaks it: no orders, no receipts, rubbish everywhere', () => {
  assert.deepEqual(ledgerOf({ orders: [], receipts: {}, records: {} }).rows, []);
  const { rows } = ledgerOf({ orders: [{ id: 'bare' }], receipts: { bare: { takes: 'no' } }, records: { x: { order: 'no' } } } as unknown as LedgerInput);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].method.model, 'okänd');
  assert.equal(rows[0].step.group, 'ovrigt');
  assert.equal(summarize(rows)[0].mean, null);
});

test('read from a folder: orders, a receipt, the bank and Material; a half-written file is a word, not a stop', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'order-ledger-'));
  try {
    const put = async (rel: string, value: unknown) => { await mkdir(path.dirname(path.join(root, rel)), { recursive: true }); await writeFile(path.join(root, rel), typeof value === 'string' ? value : JSON.stringify(value)); };
    const s = sample();
    await put('data/orders/giv-a.json', s.orders[0]);
    await put('data/orders/bild-a.json', s.orders[2]);
    await put('data/orders/halv.json', '{"id": "halv", "title": ');
    await put('assets/orders/giv-a/receipt.json', s.receipts['giv-a']);
    await put('assets/orders/bild-a/receipt.json', '{"takes": [');
    await put('motions/paow-giv-a-01-deal.json', s.records['paow-giv-a-01-deal']);
    await put('motions/pamela-x.json', { id: 'pamela-x', review: { decision: 'ACCEPTED' } });
    await put('data/media-roles.json', { schemaVersion: 1, dealers: { paow: { entries: [{ id: 'nyp-1', role: 'ankare-2.1', name: 'Nyp 1', path: 'assets/anchors/nyp-1/anchor.png', state: 'gäller', stateBy: 'Jakob 2026-11-13: kandidat → gäller' }] } } });
    await put('assets/anchors/nyp-1/receipt.json', { original: { sha256: '1'.repeat(64) }, output: { sha256: '1'.repeat(64) }, by: 'beställningen bild-a, tagning 1' });
    await put('data/dealers.json', { dealers: [{ id: 'paow', name: 'Paow' }] });
    const ledger = await readLedger(root);
    assert.deepEqual(ledger.rows.map((r) => r.key), ['giv-a#1', 'giv-a#2', 'bild-a#1', 'bild-a#2']);
    assert.ok(ledger.problems.some((p) => p.includes('data/orders/halv.json')));
    assert.ok(ledger.problems.some((p) => p.includes('assets/orders/bild-a/receipt.json')));
    assert.equal(ledger.rows[0].owner.verdict, 'underkand');
    // The receipt of bild-a could not be read: its takes stand as approved and not placed, and the picture is not linked by hash.
    assert.equal(ledger.rows[2].status.code, 'INTE_LAGD');
    assert.equal(ledger.rows[2].parts[0]?.id, 'nyp-1', 'linked by the receipt\'s words');
    // The route answers the same rows, without task ids.
    let status = 0, body = '';
    const res = { writeHead(code: number) { status = code; return this; }, end(text?: string) { body = text ?? ''; return this; } };
    await serveLedger({ method: 'GET' } as never, res as never, root);
    assert.equal(status, 200);
    assert.equal(JSON.parse(body).rows.length, 4);
    assert.doesNotMatch(body, /task-0000000/);
    await serveLedger({ method: 'POST' } as never, res as never, root);
    assert.equal(status, 405);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the checkout: every order gives its takes, each once, and nothing in it stops the reading', async () => {
  const ledger = await readLedger(process.cwd());
  const keys = ledger.rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const r of ledger.rows) {
    assert.ok(r.take >= 1 && r.method.model, r.key);
    if (r.reviewer?.score != null) assert.ok(r.reviewer.score >= 0 && r.reviewer.score <= 5, r.key);
  }
  assert.ok(summarize(ledger.rows).every((s) => s.takes >= s.placed && s.placed === s.accepted + s.variant + s.rejected + s.open));
});
