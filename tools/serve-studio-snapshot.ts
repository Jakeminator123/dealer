// A local rehearsal of the studio's online copy, before anything is published: serves the built Build Output tree
// (.runtime/studio-deploy/.vercel/output, tools/build-studio-snapshot.ts) on http://127.0.0.1:4330 and behaves as Vercel
// would with it: the routes of its config.json in order, the lock of cloud/studio/gate.ts as the middleware (cookie,
// login, try limit), and a film's fetch from Blob (the gate's default, cloud/studio/gate.ts) answered from the local file it was
// made from, with Range; with DEALER_MEDIA_MODE=rewrite the rewrite is answered the same way.
//
//   DEALER_LOSEN=… DEALER_KAKNYCKEL=… node tools/serve-studio-snapshot.ts      start (in the foreground)
//   … node tools/serve-studio-snapshot.ts --prov                              the trial build instead (build-studio-snapshot --prov)
//   node tools/serve-studio-snapshot.ts --stop                                stop it through its control token
//
// Use a throwaway password and key for a rehearsal, never the real ones. The server never reaches the internet: every
// Blob address in the map is replaced by a local stand-in. It stops by itself after 30 minutes without a request.
//
// The bot (POST /api/bot, /api/utkast, /api/onskemal; cloud/studio/bot.ts) runs here too, as the built function would,
// with the knowledge built beside it, a store of files under .runtime/bot-rehearsal/ instead of Blob, and BOT_FEJK=1: a
// canned answer with real sources, no key and no model call. Set DEALER_ADMIN_NYCKEL (32+ characters, throwaway) to try
// the owner's tool against it: DEALER_KOPIA_ADRESS=http://127.0.0.1:4330 node tools/onskemal.ts lista.
// --riktig-modell lets the bot call the model instead (BOT_LEVERANTOR, cloud/studio/bot-provider.ts: the AI Gateway with
// AI_GATEWAY_API_KEY, since there is no deployment token here, or openai with OPENAI_API_KEY): that costs money, and is the
// owner's choice.
import http from 'node:http';
import {readFile, writeFile, stat, realpath, unlink, mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gate, type MediaMap} from '../cloud/studio/gate.ts';
import {TryLimit} from '../cloud/studio/lock.ts';
import {handle as botHandle} from '../cloud/studio/bot.ts';
import {isBotPath} from '../cloud/studio/bot-routes.ts';
import {sendResponse} from '../cloud/studio/bot-node.ts';
import {fileStore} from '../cloud/studio/store-file.ts';
import type {Knowledge} from '../cloud/studio/bot-search.ts';
import {forBrowser} from './lab-routes.ts';
import {BOT_FUNCTION_FILES} from './build-knowledge.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (path.resolve(process.cwd()) !== root) throw Error('Kör från dealer-katalogen.');
const port = 4330, origin = `http://127.0.0.1:${port}`, state = path.join(root, '.runtime', 'studio-rehearsal.json');
const trial = process.argv.includes('--prov');
const deploy = path.join(root, '.runtime', 'studio-deploy', ...(trial ? ['prov'] : [])), output = path.join(deploy, '.vercel', 'output'), staticRoot = path.join(output, 'static');
const STAND_IN = 'https://blob.rehearsal.invalid/';

if (process.argv.includes('--stop')) {
  const s = await readFile(state, 'utf8').then(JSON.parse).catch(() => null) as {token?: string} | null;
  if (!s?.token) { console.log('Repetitionsservern är inte igång.'); process.exit(0); }
  const r = await fetch(`${origin}/__stopp`, {method: 'POST', headers: {'x-rehearsal-token': s.token}}).catch(() => null);
  console.log(r?.ok ? 'Repetitionsservern är stoppad.' : 'Repetitionsservern svarade inte; den är troligen redan stoppad.');
  await unlink(state).catch(() => {});
  process.exit(0);
}

// What ships is what is rehearsed: the built middleware must be the type-stripped cloud/studio/ files.
const fn = path.join(output, 'functions', '_middleware.func');
for (const [name, source] of Object.entries({'index.js': 'cloud/studio/middleware.ts', 'gate.js': 'cloud/studio/gate.ts', 'lock.js': 'cloud/studio/lock.ts', 'login-page.js': 'cloud/studio/login-page.ts', 'bot-routes.js': 'cloud/studio/bot-routes.ts'}))
  if (await readFile(path.join(fn, name), 'utf8').catch(() => null) !== forBrowser(await readFile(path.join(root, source), 'utf8'))) throw Error(`Den byggda ${name} är inte cloud/studio/ som den ser ut nu: bygg om.`);
const botFn = path.join(output, 'functions', 'api', 'bot.func');
for (const [name, source] of Object.entries(BOT_FUNCTION_FILES))
  if (await readFile(path.join(botFn, name), 'utf8').catch(() => null) !== forBrowser(await readFile(path.join(root, source), 'utf8'))) throw Error(`Botens byggda ${name} är inte cloud/studio/ som den ser ut nu: bygg om.`);
const knowledge = (await import(pathToFileURL(path.join(botFn, 'bot-knowledge.js')).href)).default as Knowledge;
const realModel = process.argv.includes('--riktig-modell');
const botEnv = {...process.env, BOT_FEJK: realModel ? '' : '1'};
const botStore = fileStore(path.join(root, '.runtime', 'bot-rehearsal'));
const built = JSON.parse((await readFile(path.join(fn, 'media.js'), 'utf8')).replace(/^\/\/.*\n/, '').replace(/^export default /, '').replace(/;\s*$/, '')) as MediaMap;
const plan = JSON.parse(await readFile(path.join(deploy, 'media-plan.json'), 'utf8')) as {files: {path: string; object: string; sha256: string}[]};
const local = new Map(plan.files.map(f => [f.object, f.path]));
const media: MediaMap = Object.fromEntries(Object.entries(built).map(([at, entry]) => [at, {...entry, url: STAND_IN + plan.files.find(f => `/${f.path}` === at)!.object}]));
const config = JSON.parse(await readFile(path.join(output, 'config.json'), 'utf8')) as {routes: Record<string, any>[]};
const limiter = new TryLimit();

const TYPES: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.wav': 'audio/wav'};
const realStatic = await realpath(staticRoot), realRoot = await realpath(root);

/** Blob as the rehearsal has it: a stand-in address answered from the local file its object was made from, with Range. */
const localBlob = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const object = url.startsWith(STAND_IN) ? url.slice(STAND_IN.length) : null, from = object ? local.get(object) : null;
  const file = from ? await inside(realRoot, from) : null;
  if (!file) return new Response('Ingen lokal fil för Blob-objektet.', {status: 502});
  const size = (await stat(file)).size, range = new Headers(init?.headers).get('range'), head = init?.method === 'HEAD';
  let start = 0, end = size - 1, status = 200;
  const headers: Record<string, string> = {'content-type': 'application/octet-stream', 'accept-ranges': 'bytes', etag: `"${object}"`};
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) return new Response(null, {status: 416, headers: {'content-range': `bytes */${size}`}});
    if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; } else start = Math.max(0, size - Number(m[2]));
    if (start > end || start >= size) return new Response(null, {status: 416, headers: {'content-range': `bytes */${size}`}});
    status = 206; headers['content-range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['content-length'] = String(end - start + 1);
  return new Response(head ? null : Readable.toWeb(createReadStream(file, {start, end})) as ReadableStream, {status, headers});
}) as typeof fetch;

/** A file under base that really lies there, or null. */
async function inside(base: string, relative: string): Promise<string | null> {
  if (relative.split('/').some(part => part === '..' || part === '.') || /[\\\0:]/.test(relative)) return null;
  const real = await realpath(path.join(base, ...relative.split('/'))).catch(() => null);
  if (!real || !real.startsWith(base + path.sep)) return null;
  return (await stat(real).catch(() => null))?.isFile() ? real : null;
}

/** A file with Range, as the CDN and Blob answer: 206 with Content-Range for a range, 416 for one outside the file. */
async function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, type: string, status = 200, extra: Record<string, string> = {}) {
  const size = (await stat(file)).size;
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.setHeader('Content-Type', type); res.setHeader('Accept-Ranges', 'bytes');
  let start = 0, end = size - 1;
  const range = req.headers.range;
  if (range && status === 200) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) { res.writeHead(416, {'Content-Range': `bytes */${size}`}).end(); return; }
    if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; } else { start = Math.max(0, size - Number(m[2])); }
    if (start > end || start >= size) { res.writeHead(416, {'Content-Range': `bytes */${size}`}).end(); return; }
    res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1});
  } else res.writeHead(status, {'Content-Length': size});
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(file, {start, end}); stream.on('error', () => res.destroy()); stream.pipe(res); res.on('close', () => stream.destroy());
}

const token = randomUUID();
let last = Date.now();
const server = http.createServer(async (req, res) => {
  last = Date.now();
  try {
    if (req.url === '/__stopp' && req.method === 'POST' && req.headers['x-rehearsal-token'] === token) { res.end('stopp'); server.close(); setTimeout(() => server.closeAllConnections(), 300).unref(); return; }
    const url = new URL(req.url ?? '/', origin);
    const chunks: Buffer[] = []; let size = 0;
    // The bot's routes take a screenshot (as the function does, up to about 2,7 MB); everything else stays small.
    const withBody = !['GET', 'HEAD'].includes(req.method ?? 'GET'), limit = isBotPath(url.pathname) ? 2_700_000 : 65536;
    if (withBody) for await (const chunk of req) { size += chunk.length; if (size > limit) { res.writeHead(413).end(); return; } chunks.push(chunk); }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(', '));
    headers.set('x-real-ip', req.socket.remoteAddress ?? 'okänd');
    const body = withBody ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, {method: req.method, headers, body});
    let pathname = decodeURIComponent(url.pathname);
    /** The bot's function, as Vercel would run it after the routes: the address as rewritten, the request as it came. */
    const serveFunction = async (at: string) => {
      if (at.split('?')[0] !== '/api/bot') return false;
      const abort = new AbortController();
      res.on('close', () => { if (!res.writableFinished) abort.abort(); });
      const rewritten = new Request(new URL(at, origin), {method: req.method, headers, body, signal: abort.signal});
      await sendResponse(res, await botHandle(rewritten, {env: botEnv, knowledge, store: botStore, signal: abort.signal}), added);
      return true;
    };
    const added: Record<string, string> = {};
    const match = (route: Record<string, any>) => new RegExp(route.src).exec(pathname);
    const fill = (text: string, m: RegExpExecArray) => text.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');
    const serveStatic = async (at: string, status = 200) => {
      const file = await inside(realStatic, at.replace(/^\//, ''));
      if (!file) return false;
      await sendFile(req, res, file, TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', status, added);
      return true;
    };
    for (const route of config.routes) {
      if (route.handle === 'filesystem') { if (await serveStatic(pathname) || await serveFunction(pathname)) return; continue; }
      const m = match(route); if (!m) continue;
      if (route.middlewarePath) {
        const answer = await gate(request, {env: process.env, media, limiter, fetch: localBlob});
        const rewrite = answer.headers.get('x-middleware-rewrite');
        for (const [k, v] of answer.headers) if (!k.startsWith('x-middleware-')) added[k] = v;
        if (rewrite) {
          // A film to "Blob": the local file its object was made from.
          const object = rewrite.startsWith(STAND_IN) ? rewrite.slice(STAND_IN.length) : null, from = object ? local.get(object) : null;
          const file = from ? await inside(realRoot, from) : null;
          if (!file) { res.writeHead(502, added).end('Ingen lokal fil för Blob-objektet.'); return; }
          delete added['content-type'];
          await sendFile(req, res, file, TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 200, added); return;
        }
        if (answer.headers.get('x-middleware-next') === '1') continue;
        const cookies = answer.headers.getSetCookie();
        res.writeHead(answer.status, {...Object.fromEntries([...answer.headers].filter(([k]) => k !== 'set-cookie')), ...(cookies.length ? {'Set-Cookie': cookies} : {})});
        res.end(Buffer.from(await answer.arrayBuffer())); return;
      }
      if (route.headers && route.continue) { Object.assign(added, route.headers); continue; }
      if (route.status && route.headers?.Location) { res.writeHead(route.status, {...added, Location: fill(route.headers.Location, m)}).end(); return; }
      if (route.dest) {
        const dest = fill(route.dest, m);
        if (route.status) { if (await serveStatic(dest, route.status)) return; res.writeHead(route.status, added).end(); return; }
        pathname = dest;
        if (await serveStatic(pathname)) return;
        continue;
      }
    }
    res.writeHead(404, added).end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500); res.end();
  }
});
setInterval(() => { if (Date.now() - last > 30 * 60 * 1000) server.close(() => process.exit(0)); }, 60_000).unref();
server.on('close', () => { void unlink(state).catch(() => {}); });
server.listen(port, '127.0.0.1', async () => {
  await mkdir(path.dirname(state), {recursive: true});
  await writeFile(state, JSON.stringify({port, pid: process.pid, token, startedAt: new Date().toISOString()}));
  if (trial) console.log('PROVBYGGE (.runtime/studio-deploy/prov): bara för repetition, publiceras aldrig.');
  console.log(`${origin}/studio/  (lås: ${process.env.DEALER_LOSEN && (process.env.DEALER_KAKNYCKEL ?? '').length >= 32 ? 'inställt' : 'INTE inställt, allt ger inloggningssidan'})`);
  console.log(`boten: ${realModel ? 'RIKTIG MODELL (kostar)' : 'BOT_FEJK=1, inget modellanrop'}; lagring ${path.join('.runtime', 'bot-rehearsal')}; kunskap ${knowledge ? `${knowledge.karna.length} + ${knowledge.avsnitt.length} avsnitt` : 'saknas'}; adminnyckel ${(process.env.DEALER_ADMIN_NYCKEL ?? '').length >= 32 ? 'inställd' : 'inte inställd'}`);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
