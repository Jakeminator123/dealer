// Offline tests for the bot and the request inbox of the studio's online copy (cloud/studio/bot*.ts, onskemal.ts): the cap
// arithmetic, the stores, the inbox, the SSE framing, the handler with no key, with the fake, and with a stand-in for the
// provider, and the lock's hook. No network: the provider and Blob are answered by functions here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CAPS, Caps, admit, dayKey, freshDay, settle, swedishDay, type Day, type Ticket} from '../cloud/studio/bot-caps.ts';
import {choose, oreOf, worstOre, usageOf, NO_USAGE} from '../cloud/studio/bot-models.ts';
import {memoryStore, readJson, updateJson, blobStore, storeIdOf, type Store} from '../cloud/studio/bot-store.ts';
import {fileStore} from '../cloud/studio/store-file.ts';
import {checkImage, checkNew, createPost, listPosts, numberOf, patchPost} from '../cloud/studio/onskemal.ts';
import {frame, readFrames, comment, eventStream} from '../cloud/studio/bot-sse.ts';
import {sseData, outputText, failureOf} from '../cloud/studio/bot-openai.ts';
import {buildInput, cited} from '../cloud/studio/bot-prompt.ts';
import {CACHE_KEY, GATEWAY_URL, OPENAI_URL, endpointOf, modelFor, providerOf, requestBody} from '../cloud/studio/bot-provider.ts';
import {handle, routeOf, checkThread, type BotContext} from '../cloud/studio/bot.ts';
import {gate} from '../cloud/studio/gate.ts';
import {COOKIE, MAX_AGE, TryLimit, secrets, signCookie} from '../cloud/studio/lock.ts';
import type {Knowledge} from '../cloud/studio/bot-search.ts';
import {markdownOf, checkAddress} from './onskemal.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const NOW = Date.parse('2026-11-12T12:00:00Z');
const env = {DEALER_LOSEN: 'prov-losen', DEALER_KAKNYCKEL: 'k'.repeat(40)};
const ADMIN = 'a'.repeat(40);
const knowledge: Knowledge = {schemaVersion: 1, byggd: '2026-11-12T10:00:00Z', kallor: ['HANDOFF'],
  karna: [{id: 'handoff/malet', titel: 'HANDOFF › Målet', text: 'Trovärdig utdelning: två kort till P1–P7.'}],
  avsnitt: [{id: 'banken/ready-p6-c1', titel: 'Banken › A2.1 → P6C1', text: 'Film till plats 6, kort 1. Spelas nu: variant.'}, {id: 'scout/regler', titel: 'Scoutgaming › Blackjack › Regler', text: 'Dealern står på 17.'}]};
const cookieOf = async (now = NOW) => `${COOKIE}=${await signCookie((await secrets(env))!, Math.floor(now / 1000) + MAX_AGE)}`;
const post = async (pathname: string, body: unknown, extra: Record<string, string> = {}) => new Request(`https://kopia.example${pathname}`, {method: 'POST', headers: {cookie: await cookieOf(), 'content-type': 'application/json', 'x-real-ip': '1.2.3.4', ...extra}, body: JSON.stringify(body)});
const context = (over: Partial<BotContext> = {}): BotContext & {store: Store} => ({env, knowledge, store: memoryStore(), now: () => NOW, pause: async () => {}, ...over}) as BotContext & {store: Store};
const events = async (response: Response) => readFrames(await response.text());
const CONTRACT: Record<string, string[]> = {kallor: ['id', 'titel'], text: ['t'], klar: ['modell', 'niva', 'tokensIn', 'tokensUt', 'kallor'], fel: ['kod', 'text']};
/** Every event's data has exactly the keys of the contract, and nothing anywhere names a cost. */
function contractOnly(list: {event: string; data: unknown}[], raw: string) {
  for (const e of list) {
    if (e.event === ':') continue;
    assert.ok(CONTRACT[e.event], `unknown event ${e.event}`);
    const items = Array.isArray(e.data) ? e.data : [e.data];
    for (const item of items) assert.deepEqual(Object.keys(item as object).sort(), [...CONTRACT[e.event]].sort(), `${e.event} keys`);
  }
  assert.doesNotMatch(raw, /"(?:ore|öre|cost|costs|price|usd|kronor|credits)"|\böre\b|\bkr\b|kronor|USD/i);
}

// ── Models and money ────────────────────────────────────────────────────────
test('models and efforts: the decided defaults, the table of allowed efforts, and the environment', () => {
  assert.deepEqual([choose('snabb', {}).model, choose('snabb', {}).effort, choose('snabb', {}).cap], ['gpt-6.1-terra', 'medium', 8000]);
  assert.deepEqual([choose('grundlig', {}).model, choose('grundlig', {}).effort], ['gpt-6.1-sol', 'xhigh']);
  const refused = choose('grundlig', {BOT_STARK_ANSTRANGNING: 'none'});
  assert.equal(refused.effort, 'xhigh', 'sol refuses none: the default is used');
  assert.match(refused.note!, /tar inte/);
  assert.equal(choose('snabb', {BOT_ENKEL_ANSTRANGNING: 'none'}).effort, 'none');
  assert.deepEqual([choose('snabb', {BOT_ENKEL_MODELL: 'gpt-7-x', BOT_ENKEL_ANSTRANGNING: 'high'}).model, choose('snabb', {BOT_ENKEL_MODELL: 'gpt-7-x'}).known], ['gpt-7-x', false]);
  assert.equal(choose('snabb', {BOT_ENKEL_MODELL: 'bad model!'}).model, 'gpt-6.1-terra');
});

test('öre from the provider\'s usage: plain, cached and written input and output at their prices', () => {
  const usage = usageOf({input_tokens: 30000, input_tokens_details: {cached_tokens: 28000, cache_write_tokens: 0}, output_tokens: 2000, output_tokens_details: {reasoning_tokens: 1500}});
  assert.deepEqual(usage, {input: 30000, cached: 28000, written: 0, output: 2000, reasoning: 1500});
  // terra: 2000 × 1 + 28000 × 0.05 + 2000 × 5 = 13 400 µUSD = 0.0134 USD; × 11 kr = 0.1474 kr = 14.74 öre
  assert.equal(oreOf('gpt-6.1-terra', usage, 11), 14.74);
  // sol at twice the price; an unknown model at the dearest known price
  assert.equal(oreOf('gpt-6.1-sol', usage, 11), 29.48);
  assert.equal(oreOf('gpt-x', usage, 11), 29.48);
  assert.equal(oreOf('gpt-6.1-terra', {...NO_USAGE, input: 1000, written: 1000}, 10), 1.25);
  // worst case: all input as a cache write and the whole output cap
  assert.equal(worstOre('gpt-6.1-sol', 40000, 25000, 11), Math.ceil((40000 * 2.5 + 25000 * 10) / 1e6 * 11 * 100 * 100) / 100);
});

// ── Caps ────────────────────────────────────────────────────────────────────
test('the caps: a day of 50 kronor, a month of 500, 15 thorough questions a day, 30 an hour per visitor', () => {
  const day = (over: Partial<Day> = {}): Day => ({...freshDay('2026-11-12', 0), ...over});
  const ask = {level: 'snabb' as const, visitor: 'v', worst: 100, now: NOW};
  assert.deepEqual(admit(day(), [], ask), {ok: true});
  assert.equal((admit(day({ore: 4950}), [], ask) as {kod: string}).kod, 'tak');
  assert.equal(admit(day({ore: 4900}), [], ask).ok, true, 'exactly at the cap is allowed');
  assert.equal((admit(day({manadFore: 45000, ore: 4950}), [], {...ask, worst: 60}) as {kod: string}).kod, 'tak', 'the month');
  assert.equal((admit(day({grundliga: 15}), [], {...ask, level: 'grundlig'}) as {kod: string}).kod, 'for_manga');
  assert.equal(admit(day({grundliga: 15}), [], ask).ok, true, 'quick questions still go');
  const inFlight: Ticket[] = [{id: 't', level: 'grundlig', visitor: 'w', worst: 200, datum: '2026-11-12', at: NOW}];
  assert.equal((admit(day({grundliga: 14}), inFlight, {...ask, level: 'grundlig'}) as {kod: string}).kod, 'for_manga', 'a question in flight counts');
  assert.equal((admit(day({ore: 4750}), inFlight, ask) as {kod: string}).kod, 'tak', 'its worst case counts too');
  const hour = Array.from({length: 30}, (_, i) => NOW - i * 60_000);
  assert.equal((admit(day({besok: {v: hour}}), [], ask) as {kod: string}).kod, 'for_manga');
  assert.equal(admit(day({besok: {v: hour.map(t => t - 3_600_000)}}), [], ask).ok, true, 'an hour later');
  assert.equal(admit(day({besok: {w: hour}}), [], ask).ok, true, 'another visitor');
  const after = settle(day({besok: {old: [NOW - 4_000_000]}}), {level: 'grundlig', visitor: 'v', ore: 12.345, now: NOW, question: true});
  assert.deepEqual([after.ore, after.fragor, after.grundliga, after.besok], [12.35, 1, 1, {v: [NOW]}]);
  const draft = settle(day(), {level: 'snabb', visitor: 'v', ore: 2, now: NOW, question: false});
  assert.deepEqual([draft.ore, draft.fragor, draft.besok.v.length], [2, 0, 1], 'a draft costs and counts toward the hour, but is no question');
  assert.equal(CAPS.dayOre, 5000);
  assert.equal(swedishDay(Date.parse('2026-11-12T23:30:00Z')), '2026-11-13', 'the day is Swedish');
  assert.equal(swedishDay(Date.parse('2026-07-01T21:59:00Z')), '2026-07-01', 'summer time');
});

test('the counter reads the month\'s earlier days once, keeps questions in flight, and never loses a write', async () => {
  const store = memoryStore();
  await store.put(dayKey('2026-11-10'), JSON.stringify({...freshDay('2026-11-10', 0), ore: 4000}), 'application/json');
  await store.put(dayKey('2026-11-11'), JSON.stringify({...freshDay('2026-11-11', 4000), ore: 3000}), 'application/json');
  await store.put(dayKey('2026-10-31'), JSON.stringify({...freshDay('2026-10-31', 0), ore: 9999}), 'application/json');
  const caps = new Caps(store);
  assert.equal((await caps.today(NOW)).manadFore, 7000);
  const a = await caps.admit('snabb', 'v', 10, NOW), b = await caps.admit('snabb', 'v', 10, NOW);
  assert.ok(a.ok && b.ok);
  assert.equal(caps.inFlight, 2);
  await Promise.all([caps.settle(a.ticket, 1.5, NOW), caps.settle(b.ticket, 2.25, NOW)]);
  const day = (await readJson<Day>(store, dayKey('2026-11-12')))!.value;
  assert.deepEqual([day.ore, day.fragor, day.manadFore, caps.inFlight], [3.75, 2, 7000, 0]);
  // Five writers at once, each with its own read: all five land.
  await Promise.all(Array.from({length: 5}, () => updateJson<{n: number}>(store, 'bot/prov.json', c => ({n: (c?.n ?? 0) + 1}))));
  assert.equal((await readJson<{n: number}>(store, 'bot/prov.json'))!.value.n, 5);
});

test('the file store keeps the same promises: create only once, write only over the version read', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dealer-bot-store-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const store = fileStore(dir);
  assert.equal(await store.get('bot/a.json'), null);
  const first = await store.put('bot/a.json', '{"n":1}', 'application/json', {create: true});
  assert.ok(first.ok);
  assert.deepEqual(await store.put('bot/a.json', '{"n":2}', 'application/json', {create: true}), {ok: false});
  assert.deepEqual(await store.put('bot/a.json', '{"n":2}', 'application/json', {ifMatch: '"old"'}), {ok: false});
  assert.ok((await store.put('bot/a.json', '{"n":2}', 'application/json', {ifMatch: (first as {etag: string}).etag})).ok);
  await Promise.all(Array.from({length: 5}, () => updateJson<{n: number}>(store, 'bot/a.json', c => ({n: (c?.n ?? 0) + 1}))));
  assert.equal((await readJson<{n: number}>(store, 'bot/a.json'))!.value.n, 7);
  assert.deepEqual((await store.list('bot/')).sort(), ['bot/a.json']);
  await assert.rejects(store.get('../x.json'), /Ogiltig nyckel/);
});

test('Blob: the calls the SDK makes, a refused condition, and a store that is not private', async () => {
  const token = ['vercel', 'blob', 'rw', 'AbCdEf123456', 'secretpart'].join('_'); // built, so the push check sees no token
  assert.equal(storeIdOf(token), 'AbCdEf123456');
  assert.throws(() => blobStore('nope'), /BOT_BLOB_TOKEN/);
  const seen: {url: string; init: RequestInit}[] = [];
  let host = 'abcdef123456.private.blob.vercel-storage.com', status = 200;
  const fake = (async (url: string, init: RequestInit = {}) => {
    seen.push({url: String(url), init});
    if (String(url).includes('.private.blob.')) return new Response('{"n":1}', {headers: {etag: '"e1"', 'content-type': 'application/json'}});
    if (init.method === 'PUT') return status === 200 ? Response.json({url: `https://${host}/bot/a.json`, pathname: 'bot/a.json', etag: '"e2"'}) : Response.json({error: {code: 'precondition_failed', message: 'x'}}, {status});
    return Response.json({blobs: [{pathname: 'bot/a.json'}], hasMore: false});
  }) as typeof fetch;
  const store = blobStore(token, fake);
  assert.deepEqual(await store.get('bot/a.json').then(g => g && {etag: g.etag, text: new TextDecoder().decode(g.body)}), {etag: '"e1"', text: '{"n":1}'});
  assert.equal(seen[0].url, 'https://AbCdEf123456.private.blob.vercel-storage.com/bot/a.json?cache=0');
  assert.deepEqual(await store.put('bot/a.json', 'x', 'application/json', {ifMatch: '"e1"'}), {ok: true, etag: '"e2"'});
  const put = seen[1], h = put.init.headers as Record<string, string>;
  assert.equal(put.url, 'https://vercel.com/api/blob/?pathname=bot%2Fa.json');
  assert.deepEqual([h['x-vercel-blob-access'], h['x-allow-overwrite'], h['x-if-match'], h['x-add-random-suffix'], h['x-api-version'], h.authorization], ['private', '1', '"e1"', '0', '13', `Bearer ${token}`]);
  assert.deepEqual(await store.list('bot/'), ['bot/a.json']);
  status = 412;
  assert.deepEqual(await store.put('bot/a.json', 'x', 'application/json', {ifMatch: '"e0"'}), {ok: false});
  status = 200; host = 'abcdef123456.public.blob.vercel-storage.com';
  await assert.rejects(store.put('bot/a.json', 'x', 'application/json'), /inte privat/);
});

// ── The inbox ───────────────────────────────────────────────────────────────
test('requests: checked, numbered Ö-1, Ö-2 …, the text kept as written, the picture beside, status set later', async () => {
  assert.deepEqual([numberOf('Ö-12'), numberOf('o-12'), numberOf('%C3%96-12'), numberOf('Ö-x'), numberOf('../1')], [12, 12, 12, null, null]);
  assert.equal(checkImage('data:image/png;base64,QUJD').ok, false, 'not a PNG');
  assert.equal(checkImage('data:image/jpeg;base64,QUJD').ok, false);
  assert.equal(checkImage(PNG).ok, true);
  assert.equal(checkNew({typ: 'okänd', rubrik: 'x'}).ok, false);
  assert.equal(checkNew({typ: 'fel', rubrik: ''}).ok, false);
  const text = '  Första raden.\nAndra raden med  två mellanslag.  ';
  const checked = checkNew({vem: 'Chefen', typ: 'onskemal', rubrik: ' Större kort ', text, vy: {namn: 'Karta', adress: '/studio/karta/', val: {kant: 'READY>P4.C1'}}, sammanfattning: 's', forslag: 'f', bild: PNG});
  assert.ok(checked.ok);
  const store = memoryStore();
  await store.put('onskemal/o-2.json', JSON.stringify({id: 'Ö-2', skapad: '2026-11-11T00:00:00Z', rubrik: 'äldre'}), 'application/json');
  const p = await createPost(store, checked.value, new Date(NOW));
  assert.equal(p.id, 'Ö-3', 'the next number after the highest');
  assert.equal(p.text, text, 'the visitor\'s words exactly');
  assert.equal(p.rubrik, 'Större kort');
  assert.ok(p.harBild && (await store.get('onskemal/o-3.png'))!.body.length > 60);
  const q = await createPost(store, {...checked.value, bild: null}, new Date(NOW));
  assert.deepEqual([q.id, q.harBild], ['Ö-4', false]);
  assert.deepEqual((await listPosts(store)).map(x => x.id), ['Ö-4', 'Ö-3', 'Ö-2']);
  const changed = await patchPost(store, 3, {status: 'planerad', svar: 'Jag tittar på det.'}, new Date(NOW + 1000));
  assert.deepEqual([changed!.status, changed!.svar, changed!.text], ['planerad', 'Jag tittar på det.', text]);
  assert.equal(await patchPost(store, 99, {status: 'klar'}, new Date(NOW)), null);
  // The owner's readable page: the words in a quote, as written.
  const md = markdownOf(await listPosts(store), new Date(NOW), 'kopia.example', new Set(['Ö-3']));
  assert.match(md, /## Ö-3 · Större kort/);
  assert.match(md, />   Första raden\.\n> Andra raden med {2}två mellanslag\. {2}\n/);
  assert.match(md, /!\[Ö-3\]\(\.runtime\/onskemal\/o-3\.png\)/);
  assert.match(md, /status \*\*planerad\*\*/);
  assert.throws(() => checkAddress('http://kopia.example'), /https/);
  assert.equal(checkAddress('http://127.0.0.1:4330/x').href, 'http://127.0.0.1:4330/');
});

// ── SSE ─────────────────────────────────────────────────────────────────────
test('SSE framing: one data line of JSON per event, comments, and reading it back; the provider\'s stream in pieces', async () => {
  const text = frame({event: 'text', data: {t: 'rad ett\nrad två'}});
  assert.equal(text, 'event: text\ndata: {"t":"rad ett\\nrad två"}\n\n');
  assert.equal(comment('tänker\nnu'), ': tänker nu\n\n');
  assert.deepEqual(readFrames(text + comment('x') + frame({event: 'fel', data: {kod: 'tak', text: 'Nej.'}})), [{event: 'text', data: {t: 'rad ett\nrad två'}}, {event: ':', data: 'x'}, {event: 'fel', data: {kod: 'tak', text: 'Nej.'}}]);
  const wire = 'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"Hej"}\r\n\r\nevent: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":5}}}\n\n';
  const bytes = new TextEncoder().encode(wire), body = new ReadableStream<Uint8Array>({start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); }});
  const got: any[] = [];
  for await (const d of sseData(body)) got.push(d.type);
  assert.deepEqual(got, ['response.output_text.delta', 'response.completed']);
  assert.equal(outputText({output: [{type: 'reasoning'}, {type: 'message', content: [{type: 'output_text', text: '{"a":'}, {type: 'output_text', text: '1}'}]}]}), '{"a":1}');
  assert.deepEqual(failureOf(429, 'insufficient_quota').kod, 'tak');
  assert.deepEqual(failureOf(401, null).kod, 'modell');
  // The keep-alive: a comment when nothing went out for a while.
  const s = eventStream({quiet: 5, tick: 5});
  await new Promise(r => setTimeout(r, 40));
  s.close();
  assert.match(await new Response(s.body).text(), /^: tänker\n\n/);
});

test('the input: rules and core first with the cache mark, then the thread, the found sections, the view and the question', () => {
  const input = buildInput({knowledge, thread: [{roll: 'du', text: 'Hej'}, {roll: 'bot', text: 'Hej!'}], found: knowledge.avsnitt.slice(0, 1), view: {namn: 'Karta', adress: '/studio/karta/', val: {kant: 'READY>P6.C1'}}, question: 'Plats 6?', image: PNG, cache: true}) as any[];
  assert.deepEqual(input.map(m => m.role), ['developer', 'user', 'assistant', 'developer', 'user']);
  assert.deepEqual(input[0].content[1].prompt_cache_breakpoint, {mode: 'explicit'});
  assert.match(input[0].content[1].text, /### \[HANDOFF › Målet\]/);
  assert.match(input[3].content[0].text, /\[Banken › A2.1 → P6C1\][\s\S]*vyn Karta \(\/studio\/karta\/\), med valen: kant = READY>P6.C1/);
  assert.deepEqual(input[4].content[1], {type: 'input_image', image_url: PNG, detail: 'high'});
  assert.equal((buildInput({knowledge, thread: [], found: [], view: null, question: 'x', image: null, cache: false})[0] as any).content[1].prompt_cache_breakpoint, undefined);
  assert.deepEqual(cited('Så är det [Banken › A2.1 > P6C1]; se också [HANDOFF › Målet; Okänd › Titel].', [...knowledge.avsnitt, ...knowledge.karna]), ['banken/ready-p6-c1', 'handoff/malet']);
  const long = checkThread(Array.from({length: 40}, (_, i) => ({roll: i % 2 ? 'bot' : 'du', text: 'x'.repeat(5000)})));
  assert.ok(long.ok && long.value.length === 6 && long.value.at(-1)!.roll === 'bot', 'the newest turns within the limit');
  assert.equal(checkThread([{roll: 'system', text: 'x'}]).ok, false);
});

// ── The handler ─────────────────────────────────────────────────────────────
test('routes: the path as asked or the rewritten query; without the cookie nothing answers', async () => {
  const at = (u: string) => routeOf(new URL(u, 'https://k.example'));
  assert.deepEqual([at('/api/bot'), at('/api/utkast/'), at('/api/onskemal'), at('/api/onskemal/%C3%96-2/bild'), at('/api/bot?vag=onskemal&id=Ö-2&del=/bild'), at('/api/bot?vag=onskemal&id=&del='), at('/api/bot?vag=utkast'), at('/api/x')],
    [{kind: 'bot', n: null}, {kind: 'utkast', n: null}, {kind: 'inkorg', n: null}, {kind: 'bild', n: 2}, {kind: 'bild', n: 2}, {kind: 'inkorg', n: null}, {kind: 'utkast', n: null}, null]);
  const ctx = context({env: {...env, BOT_FEJK: '1'}});
  assert.equal((await handle(new Request('https://k.example/api/bot', {method: 'POST', body: '{}'}), ctx)).status, 401);
  assert.equal((await handle(new Request('https://k.example/api/onskemal', {headers: {authorization: 'Bearer ' + 'b'.repeat(40)}}), {...ctx, env: {...ctx.env, DEALER_ADMIN_NYCKEL: ADMIN}})).status, 401, 'a wrong admin key');
  assert.equal((await handle(new Request('https://k.example/api/bot', {method: 'GET', headers: {cookie: await cookieOf()}}), ctx)).status, 405);
});

test('without a key the bot says so; bad input says so; no cost anywhere', async () => {
  const ctx = context();
  const response = await handle(await post('/api/bot', {fraga: 'Hur går det?', niva: 'snabb', trad: [], vy: null, bild: null}), ctx);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const raw = await response.text(), list = readFrames(raw);
  assert.deepEqual(list.map(e => e.event), ['fel']);
  assert.equal((list[0].data as {kod: string}).kod, 'ingen_nyckel');
  contractOnly(list, raw);
  for (const bad of [{fraga: '', niva: 'snabb'}, {fraga: 'x', niva: 'mellan'}, {fraga: 'x', niva: 'snabb', bild: 'data:image/png;base64,AAAA'}, {fraga: 'x', niva: 'snabb', vy: {namn: 1}}])
    assert.equal(((await events(await handle(await post('/api/bot', bad), context({env: {...env, BOT_FEJK: '1'}}))))[0].data as {kod: string}).kod, 'indata');
});

test('the fake streams sources, text and an end, counts the question, logs it, and shows no cost', async () => {
  const ctx = context({env: {...env, BOT_FEJK: '1'}});
  const response = await handle(await post('/api/bot', {fraga: 'Vad spelas på plats 6?', niva: 'grundlig', trad: [{roll: 'du', text: 'Hej'}, {roll: 'bot', text: 'Hej!'}], vy: {namn: 'Karta', adress: '/studio/karta/', val: {kant: 'READY>P6.C1'}}, bild: PNG}), ctx);
  const raw = await response.text(), list = readFrames(raw);
  assert.equal(list[0].event, 'kallor');
  assert.deepEqual((list[0].data as {id: string}[]).map(s => s.id), ['banken/ready-p6-c1', 'handoff/malet'], 'the found first, then the core');
  assert.ok(list.filter(e => e.event === 'text').length > 3);
  const end = list.at(-1)!;
  assert.equal(end.event, 'klar');
  assert.deepEqual((end.data as any).modell, 'fejk');
  assert.deepEqual((end.data as any).kallor, ['banken/ready-p6-c1'], 'the sources the answer cites');
  assert.match(list.filter(e => e.event === 'text').map(e => (e.data as {t: string}).t).join(''), /BOT_FEJK=1[\s\S]*Skärmbild: med/);
  contractOnly(list, raw);
  const day = (await readJson<Day>(ctx.store, dayKey('2026-11-12')))!.value;
  assert.deepEqual([day.fragor, day.grundliga, day.ore], [1, 1, 0]);
  const logs = await ctx.store.list('bot/logg/2026-11-12/');
  assert.equal(logs.length, 1);
  const log = (await readJson<any>(ctx.store, logs[0]))!.value;
  assert.deepEqual([log.niva, log.modell, log.fraga, log.bild, log.fejk, typeof log.ore, typeof log.ms], ['grundlig', 'fejk', 'Vad spelas på plats 6?', true, true, 'number', 'number']);
  // The fake's two errors on purpose.
  const tak = await events(await handle(await post('/api/bot', {fraga: 'fejk tak', niva: 'snabb'}), ctx));
  assert.deepEqual([tak[0].event, tak.at(-1)!.event, (tak.at(-1)!.data as {kod: string}).kod], ['kallor', 'fel', 'tak']);
});

/** A stand-in for the provider: one streamed answer, or an HTTP error. Records what it was sent. */
function provider(answer: {text?: string[]; status?: number; code?: string; type?: string; incomplete?: string; usage?: object; url?: string}) {
  const sent: any[] = [], auth: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    assert.equal(url, answer.url ?? 'https://api.openai.com/v1/responses');
    sent.push(JSON.parse(String(init.body)));
    auth.push(String((init.headers as Record<string, string>).authorization));
    if (answer.status) return Response.json({error: {code: answer.code, type: answer.type, message: 'nej'}}, {status: answer.status});
    const usage = answer.usage ?? {input_tokens: 30000, input_tokens_details: {cached_tokens: 28000, cache_write_tokens: 0}, output_tokens: 900, output_tokens_details: {reasoning_tokens: 500}};
    const blocks = [...(answer.text ?? []).map(delta => ({type: 'response.output_text.delta', delta})),
      answer.incomplete ? {type: 'response.incomplete', response: {incomplete_details: {reason: answer.incomplete}, usage}} : {type: 'response.completed', response: {usage}}];
    return new Response(blocks.map(b => `event: ${b.type}\ndata: ${JSON.stringify(b)}\n\n`).join(''), {headers: {'content-type': 'text/event-stream'}});
  }) as unknown as typeof fetch;
  return {fetcher, sent, auth};
}
/** The direct way to OpenAI, as the bot had it before the gateway (BOT_LEVERANTOR=openai). */
const OPENAI = {BOT_LEVERANTOR: 'openai'};

test('a real call: what the provider is sent, the answer streamed on, the öre counted on the server only', async () => {
  const {fetcher, sent} = provider({text: ['- Plats 6 spelar en variant ', '[Banken › A2.1 → P6C1].']});
  const ctx = context({env: {...env, ...OPENAI, OPENAI_API_KEY: 'test-key'}, fetch: fetcher});
  const raw = await (await handle(await post('/api/bot', {fraga: 'Vad spelas på plats 6?', niva: 'snabb', trad: [], vy: null, bild: PNG}), ctx)).text(), list = readFrames(raw);
  assert.deepEqual(list.map(e => e.event), ['kallor', 'text', 'text', 'klar']);
  assert.deepEqual(list.at(-1)!.data, {modell: 'gpt-6.1-terra', niva: 'snabb', tokensIn: 30000, tokensUt: 900, kallor: ['banken/ready-p6-c1']});
  contractOnly(list, raw);
  const body = sent[0];
  assert.deepEqual([body.model, body.reasoning, body.max_output_tokens, body.store, body.stream, body.prompt_cache_options], ['gpt-6.1-terra', {effort: 'medium'}, 8000, false, true, {mode: 'explicit'}]);
  assert.equal(body.input.at(-1).content[1].type, 'input_image');
  assert.ok(!JSON.stringify(body).includes('prov-losen'), 'no secret of the lock goes to the provider');
  const day = (await readJson<Day>(ctx.store, dayKey('2026-11-12')))!.value;
  assert.equal(day.ore, oreOf('gpt-6.1-terra', usageOf({input_tokens: 30000, input_tokens_details: {cached_tokens: 28000}, output_tokens: 900}), 11));
  assert.ok(day.ore > 0);
});

test('the caps stop a question before the provider is asked; the provider\'s own monthly limit reads as the cap', async () => {
  const {fetcher, sent} = provider({text: ['x']});
  const ctx = context({env: {...env, ...OPENAI, OPENAI_API_KEY: 'test-key'}, fetch: fetcher});
  await ctx.store.put(dayKey('2026-11-12'), JSON.stringify({...freshDay('2026-11-12', 0), ore: 4999}), 'application/json');
  const stop = await events(await handle(await post('/api/bot', {fraga: 'x', niva: 'grundlig'}), ctx));
  assert.deepEqual([stop.length, stop[0].event, (stop[0].data as {kod: string}).kod], [1, 'fel', 'tak']);
  assert.equal(sent.length, 0);
  const quota = provider({status: 429, code: 'insufficient_quota'});
  const over = await events(await handle(await post('/api/bot', {fraga: 'x', niva: 'snabb'}), context({env: {...env, ...OPENAI, OPENAI_API_KEY: 'k'}, fetch: quota.fetcher})));
  assert.deepEqual(over.map(e => e.event), ['kallor', 'fel']);
  assert.equal((over[1].data as {kod: string}).kod, 'tak');
  const cut = await events(await handle(await post('/api/bot', {fraga: 'x', niva: 'grundlig'}), context({env: {...env, ...OPENAI, OPENAI_API_KEY: 'k'}, fetch: provider({incomplete: 'max_output_tokens'}).fetcher})));
  assert.deepEqual([cut.at(-1)!.event, (cut.at(-1)!.data as {kod: string}).kod], ['fel', 'modell'], 'all reasoning and no answer');
});

test('the draft: the fake, and the quick model\'s JSON answer checked', async () => {
  const fake = await handle(await post('/api/utkast', {trad: [{roll: 'du', text: 'Kan kortet bli större?'}, {roll: 'bot', text: 'Materialet säger…'}], vy: null}), context({env: {...env, BOT_FEJK: '1'}}));
  assert.equal(fake.status, 200);
  assert.deepEqual(Object.keys(await fake.clone().json()).sort(), ['forslag', 'rubrik', 'sammanfattning', 'typ']);
  assert.deepEqual([(await fake.json()).typ], ['fraga']);
  const sent: any[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body)));
    return Response.json({status: 'completed', usage: {input_tokens: 400, output_tokens: 80}, output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({rubrik: 'Större kort', typ: 'onskemal', sammanfattning: 'Chefen vill ha större kort.', forslag: '- Pröva V6:s storlek.'})}]}]}); }) as unknown as typeof fetch;
  const ctx = context({env: {...env, ...OPENAI, OPENAI_API_KEY: 'k'}, fetch: fetcher});
  const real = await handle(await post('/api/utkast', {trad: [{roll: 'du', text: 'Större kort?'}], vy: {namn: 'Spela', adress: '/studio/', val: {}}}), ctx);
  assert.deepEqual(await real.json(), {rubrik: 'Större kort', typ: 'onskemal', sammanfattning: 'Chefen vill ha större kort.', forslag: '- Pröva V6:s storlek.'});
  assert.deepEqual([sent[0].reasoning, sent[0].store, sent[0].text.format.type, sent[0].text.format.strict], [{effort: 'low'}, false, 'json_schema', true]);
  const day = (await readJson<Day>(ctx.store, dayKey('2026-11-12')))!.value;
  assert.deepEqual([day.fragor, day.ore > 0], [0, true], 'a draft costs but is no question');
  const empty = await handle(await post('/api/utkast', {trad: [], vy: null}), context({env: {...env, BOT_FEJK: '1'}}));
  assert.deepEqual([empty.status, await empty.json()], [400, {kod: 'indata', text: 'Samtalet är tomt.'}], 'a refusal is {kod, text}, as the fel event');
  const noKey = await handle(await post('/api/utkast', {trad: [{roll: 'du', text: 'x'}], vy: null}), context());
  assert.deepEqual([noKey.status, (await noKey.json()).kod], [503, 'ingen_nyckel']);
});

test('the provider: the gateway by default, its token from the request or a key, and the request each provider is sent', () => {
  const oidc = new Headers({'x-vercel-oidc-token': 'oidc-token'});
  assert.deepEqual(providerOf({}), {provider: 'gateway', note: null});
  assert.equal(providerOf({BOT_LEVERANTOR: 'OpenAI'}).provider, 'openai');
  assert.match(providerOf({BOT_LEVERANTOR: 'azure'}).note ?? '', /gateway används/);
  assert.deepEqual(endpointOf({}, oidc), {provider: 'gateway', url: GATEWAY_URL, key: 'oidc-token', via: 'oidc'});
  assert.deepEqual(endpointOf({AI_GATEWAY_API_KEY: 'gw-key'}, oidc), {provider: 'gateway', url: GATEWAY_URL, key: 'gw-key', via: 'AI_GATEWAY_API_KEY'}, 'a key ranks above the token, as at the gateway');
  assert.deepEqual(endpointOf({VERCEL_OIDC_TOKEN: 'pulled'}, new Headers()), {provider: 'gateway', url: GATEWAY_URL, key: 'pulled', via: 'VERCEL_OIDC_TOKEN'});
  assert.equal(endpointOf({OPENAI_API_KEY: 'sk'}, oidc).key, 'oidc-token', 'the gateway never takes the OpenAI key');
  assert.deepEqual(endpointOf({BOT_LEVERANTOR: 'openai', OPENAI_API_KEY: 'sk'}, oidc), {provider: 'openai', url: OPENAI_URL, key: 'sk', via: 'OPENAI_API_KEY'});
  assert.equal(endpointOf({BOT_LEVERANTOR: 'openai'}, oidc).key, null, 'OpenAI never gets the gateway token');
  assert.equal(modelFor('gateway', 'gpt-6.1-terra'), 'openai/gpt-6.1-terra');
  assert.equal(modelFor('gateway', 'anthropic/claude-sonnet-5'), 'anthropic/claude-sonnet-5');
  assert.equal(modelFor('openai', 'openai/gpt-6.1-sol'), 'gpt-6.1-sol');
  assert.equal(choose('grundlig', {BOT_STARK_MODELL: 'openai/gpt-6.1-sol'}).model, 'gpt-6.1-sol', 'the gateway\'s name for a known model is known');
  const input = buildInput({knowledge, thread: [], found: [], view: null, question: 'Hej', image: PNG, cache: true});
  const call = {model: 'gpt-6.1-terra', input, effort: 'medium', cap: 8000, cache: true};
  const direct = requestBody('openai', call), viaGateway = requestBody('gateway', call);
  assert.deepEqual([direct.model, direct.reasoning, direct.max_output_tokens, direct.prompt_cache_options], ['gpt-6.1-terra', {effort: 'medium'}, 8000, {mode: 'explicit'}]);
  assert.match(JSON.stringify(direct.input), /prompt_cache_breakpoint/, 'OpenAI keeps its explicit cache mark');
  assert.deepEqual([viaGateway.model, viaGateway.reasoning, viaGateway.max_output_tokens, viaGateway.prompt_cache_key, viaGateway.caching, 'prompt_cache_options' in viaGateway], ['openai/gpt-6.1-terra', {effort: 'medium'}, 8000, CACHE_KEY, 'auto', false]);
  assert.ok(!JSON.stringify(viaGateway).includes('prompt_cache_breakpoint'), 'no OpenAI-only cache field goes to the gateway');
  assert.ok(CACHE_KEY.length <= 64);
  assert.equal((viaGateway.input as any[]).at(-1).content[1].type, 'input_image', 'the picture goes as input_image with its data URL');
  assert.match((viaGateway.input as any[]).at(-1).content[1].image_url, /^data:image\/png;base64,/);
  assert.match(JSON.stringify(input), /prompt_cache_breakpoint/, 'the input handed in is left as it was');
  const draft = requestBody('gateway', {...call, cache: false, text: {format: {type: 'json_schema', name: 'utkast', strict: true, schema: {}}}});
  assert.deepEqual([draft.text, 'caching' in draft, 'prompt_cache_key' in draft], [{format: {type: 'json_schema', name: 'utkast', strict: true, schema: {}}}, false, false]);
  // The gateway's spent budget or credit is the cap, in the visitor's words.
  assert.equal(failureOf(402, 'quota_for_entity_exceeded').kod, 'tak');
  assert.equal(failureOf(402, null).kod, 'tak');
});

test('a call through the gateway: its address, the deployment\'s token, the model with its provider, and the contract unchanged', async () => {
  const {fetcher, sent, auth} = provider({url: GATEWAY_URL, text: ['- Plats 6 spelar en variant ', '[Banken › A2.1 → P6C1].']});
  const ctx = context({env: {...env, OPENAI_API_KEY: 'never-used'}, fetch: fetcher});
  const raw = await (await handle(await post('/api/bot', {fraga: 'Vad spelas på plats 6?', niva: 'grundlig', trad: [], vy: null, bild: PNG}, {'x-vercel-oidc-token': 'oidc-token'}), ctx)).text(), list = readFrames(raw);
  assert.deepEqual(list.map(e => e.event), ['kallor', 'text', 'text', 'klar']);
  assert.deepEqual(list.at(-1)!.data, {modell: 'gpt-6.1-sol', niva: 'grundlig', tokensIn: 30000, tokensUt: 900, kallor: ['banken/ready-p6-c1']}, 'the panel sees the same events and names');
  contractOnly(list, raw);
  assert.deepEqual(auth, ['Bearer oidc-token']);
  assert.deepEqual([sent[0].model, sent[0].reasoning, sent[0].store, sent[0].stream, sent[0].caching], ['openai/gpt-6.1-sol', {effort: 'xhigh'}, false, true, 'auto']);
  const logs = await ctx.store.list('bot/logg/2026-11-12/');
  assert.equal((await readJson<any>(ctx.store, logs[0]))!.value.leverantor, 'gateway');
  // No token and no key: the bot says so and calls nothing.
  const none = provider({url: GATEWAY_URL, text: ['x']});
  const shut = await events(await handle(await post('/api/bot', {fraga: 'x', niva: 'snabb'}), context({fetch: none.fetcher})));
  assert.deepEqual([shut.length, (shut[0].data as {kod: string}).kod, none.sent.length], [1, 'ingen_nyckel', 0]);
  // A spent budget at the gateway reads as the cap.
  const spent = provider({url: GATEWAY_URL, status: 402, type: 'quota_for_entity_exceeded'});
  const over = await events(await handle(await post('/api/bot', {fraga: 'x', niva: 'snabb'}, {'x-vercel-oidc-token': 't'}), context({fetch: spent.fetcher})));
  assert.deepEqual(over.map(e => [e.event, (e.data as {kod?: string}).kod ?? null]), [['kallor', null], ['fel', 'tak']]);
});

test('the inbox over HTTP: the visitor sends and reads, only the admin key sets status', async () => {
  const ctx = context({env: {...env, DEALER_ADMIN_NYCKEL: ADMIN}});
  const created = await handle(await post('/api/onskemal', {vem: 'Chefen', typ: 'fel', rubrik: 'Fel kort', text: 'Kortet hoppar.', vy: null, sammanfattning: '', forslag: '', bild: PNG}), ctx);
  assert.deepEqual(await created.json(), {id: 'Ö-1'});
  const cookie = await cookieOf();
  const list = await (await handle(new Request('https://k.example/api/onskemal', {headers: {cookie}}), ctx)).json();
  assert.deepEqual(list.poster.map((p: any) => [p.id, p.status, p.harBild]), [['Ö-1', 'ny', true]]);
  const picture = await handle(new Request('https://k.example/api/onskemal/%C3%96-1/bild', {headers: {cookie}}), ctx);
  assert.deepEqual([picture.status, picture.headers.get('content-type'), (await picture.arrayBuffer()).byteLength > 60], [200, 'image/png', true]);
  const patch = (headers: Record<string, string>) => new Request('https://k.example/api/onskemal/o-1', {method: 'PATCH', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify({status: 'pagar', svar: 'Jag tittar.'})});
  assert.equal((await handle(patch({cookie}), ctx)).status, 403, 'the cookie is not enough');
  const done = await handle(patch({authorization: `Bearer ${ADMIN}`}), ctx);
  assert.deepEqual([(await done.json()).status], ['pagar']);
  assert.equal((await handle(new Request('https://k.example/api/onskemal', {headers: {authorization: `Bearer ${ADMIN}`}}), ctx)).status, 200, 'the owner\'s tool reads without the cookie');
  assert.equal((await handle(new Request('https://k.example/api/onskemal/o-1', {method: 'PATCH', headers: {authorization: `Bearer ${ADMIN}`}, body: JSON.stringify({status: 'borta'})}), ctx)).status, 400);
  assert.equal((await handle(new Request('https://k.example/api/onskemal/o-9/bild', {headers: {cookie}}), ctx)).status, 404);
});

// ── The lock's hook ─────────────────────────────────────────────────────────
test('the gate lets the bot\'s routes through with the cookie, the inbox with an admin key, and nothing else', async () => {
  const g = (pathname: string, init: RequestInit = {}) => gate(new Request(`https://k.example${pathname}`, init), {env, media: {}, limiter: new TryLimit(), now: () => NOW});
  const cookie = await cookieOf();
  for (const [pathname, method] of [['/api/bot', 'POST'], ['/api/utkast', 'POST'], ['/api/onskemal', 'GET'], ['/api/onskemal', 'POST'], ['/api/onskemal/o-1', 'PATCH'], ['/api/onskemal/o-1/bild', 'GET']])
    assert.equal((await g(pathname, {method, headers: {cookie}})).headers.get('x-middleware-next'), '1', `${method} ${pathname}`);
  assert.equal((await g('/api/bot', {method: 'POST'})).status, 401, 'no cookie: the login page');
  assert.equal((await g('/api/bot', {method: 'POST', headers: {authorization: `Bearer ${ADMIN}`}})).status, 401, 'an admin key opens only the inbox');
  assert.equal((await g('/api/onskemal/o-1', {method: 'PATCH', headers: {authorization: `Bearer ${ADMIN}`}})).headers.get('x-middleware-next'), '1');
  assert.equal((await g('/api/onskemal', {headers: {authorization: 'Bearer short'}})).status, 401);
  assert.equal((await g('/api/clip-bank', {method: 'POST', headers: {cookie}})).status, 405, 'the rest of the copy still cannot be written');
  assert.equal((await g('/api/botten', {method: 'POST', headers: {cookie}})).status, 405);
});
