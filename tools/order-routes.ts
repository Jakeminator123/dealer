// The lab server's routes for the studio's view Beställ, and Jakob's verdict on a picture in Material. The server calls
// handleOrders(req, res, url) before its own routes; it answers true when the request was one of these.
//   GET  /api/orders                    every order with its state, the day's credits and the balance
//   GET  /api/orders/<id>               one order
//   POST /api/orders                    a new draft from a few choices (dealer, step, place, hand, how the card lands and
//                                       turns, the text's style, tur och retur or bara dit, a reference film from the
//                                       bank, model, length, takes), or with seats one draft per seat sharing a group
//   PUT  /api/orders/<id>               change a draft: title, takes, hand, side, turn, free addition, length (If-Match)
//   POST /api/orders/<id>/refresh       fetch what a draft waits for once it holds, draw its last picture again (If-Match)
//   POST /api/orders/<id>/approve       Jakob's click: freezes the order with its hash, refused beyond the policy (If-Match)
//   GET  /api/orders/pose/<step>        the pose figure a still would get (ANKARE-2.1, ANKARE-2.2), before a draft exists;
//                                       ?anchor=<entry> brings its green to that anchor's
//   GET  /assets/orders/<id>/<file>     a picture or film of an order, only from that folder
//   PUT  /api/media/<id>/state          Godkänn / Underkänn of a picture in Material (If-Match on the register); the
//                                       dealer's drafts then follow the anchor that holds (store.follow)
//   GET  /api/production?dealer=<id>    the production list (tools/produce.ts): every step of the dealer's graph, its state
//   POST /api/production/draft          {dealer}: drafts for every step that is missing, can be ordered now and whose method
//                                       holds (gäller), as node tools/produce.ts <dealer> --draft; never an approval
// Writes come from the lab's own origin only, with the revision last read, as in tools/review-store.ts. Nothing here
// places an order: an ordering agent does that after tools/order-clerk.md. Tests: tools/order-routes.test.ts.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StoreError } from './placement-store.ts';
import { mediaRoles } from './media-roles.ts';
import { orderStore, type NewOrder, type StoreOptions } from './order-store.ts';
import { makeDrafts, productionList, readProduction } from './produce.ts';

const BODY_LIMIT = 16384;
const NEW_KEYS = ['dealer', 'step', 'target', 'hand', 'pass', 'side', 'seats', 'flipAxis', 'model', 'duration', 'resolution', 'takes', 'extra', 'title', 'base', 'style', 'shape', 'reference', 'cardScale'];

export function orderRoutes(options: { root: string; origin: string } & StoreOptions) {
  const { root, origin } = options;
  const store = orderStore(root, { now: options.now, poses: options.poses });
  const media = mediaRoles(root);

  const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(value)); };
  const fail = (res: ServerResponse, error: unknown) => json(res, error instanceof StoreError ? error.status : 500, { error: error instanceof StoreError ? error.message : 'Något gick fel i labbet.' });
  const ifMatch = (req: IncomingMessage) => (typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : undefined);
  async function body(req: IncomingMessage, required: boolean): Promise<unknown> {
    if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) throw new StoreError(413, 'Frågan är för stor.');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) { size += chunk.length; if (size > BODY_LIMIT) throw new StoreError(413, 'Frågan är för stor.'); chunks.push(chunk); }
    if (!size) { if (required) throw new StoreError(400, 'Frågan är tom.'); return null; }
    if (!req.headers['content-type']?.startsWith('application/json')) throw new StoreError(415, 'JSON krävs.');
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new StoreError(400, 'Frågan är inte giltig JSON.'); }
  }

  async function serve(req: IncomingMessage, res: ServerResponse, file: string) {
    const size = (await stat(file)).size, type = file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    let start = 0, end = size - 1;
    const headers: Record<string, string | number> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (req.headers.range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      start = Number(m[1]); end = m[2] ? Number(m[2]) : end;
      if (start > end || end >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    } else res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    res.on('close', () => stream.destroy());
  }

  return async function handleOrders(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname, method = req.method ?? 'GET';
    if (p.startsWith('/assets/orders/')) {
      if (method !== 'GET' && method !== 'HEAD') { res.writeHead(405).end(); return true; }
      let rel: string;
      try { rel = decodeURIComponent(p.slice(1)); } catch { res.writeHead(400).end(); return true; }
      const file = await store.servable(rel);
      if (!file) { res.writeHead(404).end(); return true; }
      try { await serve(req, res, file); } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
      return true;
    }
    const pose = /^\/api\/orders\/pose\/(ANKARE-2\.[12])$/.exec(p);
    if (pose) {
      if (method !== 'GET' && method !== 'HEAD') { res.writeHead(405).end(); return true; }
      try {
        const bytes = await store.posePicture(pose[1], url.searchParams.get('anchor'));
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
        res.end(method === 'HEAD' ? undefined : bytes);
      } catch (error) { fail(res, error); }
      return true;
    }
    const mediaState = /^\/api\/media\/([^/]+)\/state$/.exec(p);
    if (p !== '/api/orders' && !p.startsWith('/api/orders/') && !mediaState && p !== '/api/production' && p !== '/api/production/draft') return false;
    try {
      const write = method !== 'GET' && method !== 'HEAD';
      if (write && req.headers.origin !== origin) throw new StoreError(403, 'Spara från det lokala labbet.');
      // The production list of a dealer, and the drafts it makes for what can be ordered now (never an approval).
      if (p === '/api/production') {
        if (method !== 'GET') throw new StoreError(405, 'Bara GET.');
        const { input, problems } = await readProduction(root, url.searchParams.get('dealer') ?? '', { store });
        json(res, 200, { list: productionList(input), problems });
        return true;
      }
      if (p === '/api/production/draft') {
        if (method !== 'POST') throw new StoreError(405, 'Bara POST.');
        const value = (await body(req, true)) as { dealer?: unknown } | null;
        if (!value || typeof value !== 'object' || Object.keys(value).some((k) => k !== 'dealer') || typeof value.dealer !== 'string') throw new StoreError(400, 'Frågan ska bara innehålla dealer.');
        const read = () => readProduction(root, value.dealer as string, { store, createdBy: 'Produktionslistan i Beställ (Jakobs knapp "Skapa utkast för det som kan beställas")' });
        const result = await makeDrafts(productionList((await read()).input), store);
        const { input, problems } = await read();
        json(res, result.made.length ? 201 : 200, { ...result, list: productionList(input), problems });
        return true;
      }
      if (mediaState) {
        if (method !== 'PUT') throw new StoreError(405, 'Bara PUT.');
        const value = (await body(req, true)) as { state?: unknown } | null;
        if (!value || typeof value !== 'object' || Object.keys(value).some((k) => k !== 'state')) throw new StoreError(400, 'Ändringen ska bara innehålla state.');
        const decided = await media.setState({ id: decodeURIComponent(mediaState[1]), state: value.state, expected: ifMatch(req) });
        // The dealer's drafts follow what holds now; a draft that cannot is left as it is and says why in Beställ.
        const dealers = (await media.readRegister()).register?.dealers ?? {};
        const dealer = Object.entries(dealers).find(([, d]) => d.entries.some((e) => e.id === decided.entry.id))?.[0];
        const followed = dealer ? await store.follow(dealer).catch(() => [] as string[]) : [];
        json(res, 200, { ...decided, followed });
        return true;
      }
      if (p === '/api/orders') {
        if (method === 'GET') { json(res, 200, await store.list()); return true; }
        if (method !== 'POST') throw new StoreError(405, 'Bara GET och POST.');
        const value = (await body(req, true)) as Record<string, unknown>;
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreError(400, 'Beställningen ska vara ett objekt.');
        for (const key of Object.keys(value)) if (!NEW_KEYS.includes(key)) throw new StoreError(400, `${key} kan inte sättas från sidan.`);
        if (value.seats !== undefined) {
          const { orders } = await store.createMany(value as unknown as NewOrder);
          json(res, 201, { ...(await store.one(orders[0].id)), made: orders.map((o) => o.id) });
          return true;
        }
        const { order } = await store.create(value as unknown as NewOrder);
        json(res, 201, { ...(await store.one(order.id)), made: [order.id] });
        return true;
      }
      const m = /^\/api\/orders\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/approve|\/refresh)?$/.exec(p);
      if (!m) throw new StoreError(404, 'Okänd adress.');
      const [, id, action] = m;
      if (!action) {
        if (method === 'GET') { json(res, 200, await store.one(id)); return true; }
        if (method !== 'PUT') throw new StoreError(405, 'Bara GET och PUT.');
        await store.change(id, await body(req, true), ifMatch(req));
        json(res, 200, await store.one(id));
        return true;
      }
      if (method !== 'POST') throw new StoreError(405, 'Bara POST.');
      await body(req, false);
      if (action === '/approve') await store.approve(id, ifMatch(req));
      else await store.refresh(id, ifMatch(req));
      json(res, 200, await store.one(id));
      return true;
    } catch (error) {
      fail(res, error);
      return true;
    }
  };
}

/** The handler for the lab server (tools/preview.ts): the repo it runs in, on 127.0.0.1:4319. */
export const handleOrders = orderRoutes({ root: path.resolve(process.cwd()), origin: 'http://127.0.0.1:4319' });
