// The owner's tool for the request inbox of the studio's online copy (cloud/studio/onskemal.ts): read what the boss has
// asked for, fetch it all to this machine as a readable list, and set a request's status and answer.
//
//   node tools/onskemal.ts lista                              the requests, newest first
//   node tools/onskemal.ts hamta                              everything to .runtime/onskemal/ and a readable ONSKEMAL.md
//   node tools/onskemal.ts status Ö-12 planerad "<svar>"      set status (ny, sedd, planerad, pagar, klar, avbojd,
//                                                             fraga_tillbaka) and, optionally, the answer the boss sees
//
// It reads the copy's address from DEALER_KOPIA_ADRESS (https, or http on 127.0.0.1 for the rehearsal on 4330) and the admin
// key from DEALER_ADMIN_NYCKEL; it never reads them from a file and never prints the key. ONSKEMAL.md lies in the repo root
// for reading and stays out of Git; the pictures lie in .runtime/onskemal/.
import {mkdir, writeFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Post} from '../cloud/studio/onskemal.ts';
import {STATUSES, numberOf} from '../cloud/studio/onskemal.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

export const TYPE_WORD: Record<string, string> = {fel: 'Fel', onskemal: 'Önskemål', fraga: 'Fråga', ide: 'Idé'};
export const STATUS_WORD: Record<string, string> = {ny: 'ny', sedd: 'sedd', planerad: 'planerad', pagar: 'pågår', klar: 'klar', avbojd: 'avböjd', fraga_tillbaka: 'fråga tillbaka'};

/** "12 nov 21:40" in Swedish time. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.day} ${String(p.month).replace('.', '')} ${p.hour}:${p.minute}`;
}

/** The address the tool talks to: https, or plain http only to this machine (the rehearsal). */
export function checkAddress(value: string | undefined): URL {
  if (!value) throw Error('Sätt DEALER_KOPIA_ADRESS till kopians adress (eller http://127.0.0.1:4330 för repetitionen).');
  const url = new URL(value);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw Error('Adressen ska vara https (nyckeln skickas med).');
  return new URL(url.origin);
}

/** The requests as one readable Markdown page, newest first. The visitor's own words stand as written, in a quote. */
export function markdownOf(posts: readonly Post[], fetched: Date, host: string, pictures: ReadonlySet<string>): string {
  const counts = Object.entries(posts.reduce<Record<string, number>>((m, p) => ({...m, [p.status]: (m[p.status] ?? 0) + 1}), {})).map(([s, n]) => `${n} ${STATUS_WORD[s] ?? s}`).join(', ');
  const out = [
    '# Önskemål från studion', '',
    `Hämtat ${when(fetched.toISOString())} från ${host}: ${posts.length} st${counts ? ` (${counts})` : ''}. Filen ligger utanför Git och skrivs om vid varje hämtning.`,
    'Svara med `node tools/onskemal.ts status <id> <status> "<svar>"`; svaret syns för den som skrev.', '',
  ];
  for (const p of posts) {
    const n = numberOf(p.id);
    out.push(`## ${p.id} · ${p.rubrik.replace(/\s+/g, ' ')}`, '');
    out.push(`- **${TYPE_WORD[p.typ] ?? p.typ}**, status **${STATUS_WORD[p.status] ?? p.status}**, från ${p.vem || 'okänd'}, ${when(p.skapad)}${p.andrad && p.andrad !== p.skapad ? ` (ändrad ${when(p.andrad)})` : ''}`);
    if (p.vy) out.push(`- Vy: ${p.vy.namn} (${p.vy.adress})${Object.keys(p.vy.val ?? {}).length ? ` · ${Object.entries(p.vy.val).map(([k, v]) => `${k} = ${v}`).join(' · ')}` : ''}`);
    if (p.harBild && n !== null) out.push(pictures.has(p.id) ? `- Skärmbild: ![${p.id}](.runtime/onskemal/o-${n}.png)` : '- Skärmbild: finns, men hämtades inte');
    out.push('');
    out.push(...(p.text ? p.text.split('\n').map(line => `> ${line}`) : ['> (ingen egen text)']), '');
    if (p.sammanfattning) out.push(`**Sammanfattning:** ${p.sammanfattning}`, '');
    if (p.forslag) out.push('**Förslag:**', '', p.forslag, '');
    if (p.svar) out.push(`**Svar:** ${p.svar}`, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ── On the command line ─────────────────────────────────────────────────────
async function call(base: URL, key: string, pathname: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(new URL(pathname, base), {...init, headers: {...init.headers as Record<string, string>, authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(30_000)});
  if (response.status === 401 || response.status === 403) throw Error(`Kopian godtog inte nyckeln (${response.status}). Kontrollera DEALER_ADMIN_NYCKEL här och i Vercel.`);
  return response;
}
const fail = async (response: Response) => { const body = await response.json().catch(() => null) as {text?: string} | null; return Error(`Kopian svarade ${response.status}${body?.text ? `: ${body.text}` : ''}`); };

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const base = checkAddress(process.env.DEALER_KOPIA_ADRESS), key = process.env.DEALER_ADMIN_NYCKEL ?? '';
  if (key.length < 32) throw Error('Sätt DEALER_ADMIN_NYCKEL (minst 32 tecken, samma som i Vercel).');
  const list = async () => {
    const response = await call(base, key, '/api/onskemal');
    if (!response.ok) throw await fail(response);
    return ((await response.json()) as {poster: Post[]}).poster;
  };
  if (command === 'lista') {
    const posts = await list();
    if (!posts.length) { console.log('Inga önskemål.'); return; }
    for (const p of posts) console.log(`${p.id.padEnd(6)} ${(STATUS_WORD[p.status] ?? p.status).padEnd(15)} ${(TYPE_WORD[p.typ] ?? p.typ).padEnd(9)} ${when(p.skapad).padEnd(13)} ${p.harBild ? '▣' : ' '} ${p.rubrik}`);
    return;
  }
  if (command === 'hamta') {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw Error('Kör från dealer-katalogen.');
    const posts = await list(), dir = path.join(root, '.runtime', 'onskemal'), pictures = new Set<string>();
    await mkdir(dir, {recursive: true});
    if (await realpath(dir) !== path.join(await realpath(root), '.runtime', 'onskemal')) throw Error('Länkad mapp .runtime/onskemal.');
    for (const p of posts) {
      const n = numberOf(p.id);
      if (n === null) continue;
      await writeFile(path.join(dir, `o-${n}.json`), JSON.stringify(p, null, 1));
      if (p.harBild) {
        const response = await call(base, key, `/api/onskemal/o-${n}/bild`);
        if (response.ok && response.headers.get('content-type')?.startsWith('image/png')) { await writeFile(path.join(dir, `o-${n}.png`), Buffer.from(await response.arrayBuffer())); pictures.add(p.id); }
      }
    }
    await writeFile(path.join(root, 'ONSKEMAL.md'), markdownOf(posts, new Date(), base.host, pictures));
    console.log(`${posts.length} önskemål hämtade (${pictures.size} bilder) till .runtime/onskemal/; läs ONSKEMAL.md.`);
    return;
  }
  if (command === 'status') {
    const [id, status, svar] = args, n = numberOf(id ?? '');
    if (n === null) throw Error('Ange ett id som Ö-12.');
    if (!STATUSES.includes(status as never)) throw Error(`Status ska vara en av: ${STATUSES.join(', ')}.`);
    const response = await call(base, key, `/api/onskemal/o-${n}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({status, ...(svar !== undefined ? {svar} : {})})});
    if (!response.ok) throw await fail(response);
    const post = await response.json() as Post;
    console.log(`${post.id}: ${STATUS_WORD[post.status] ?? post.status}${post.svar ? `, svar: ${post.svar}` : ''}`);
    return;
  }
  console.log('Använd: node tools/onskemal.ts lista | hamta | status <id> <status> "<svar>"');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
