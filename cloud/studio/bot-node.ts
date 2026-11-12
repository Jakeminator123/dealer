// The bot's handler (Request → Response, bot.ts) behind Node's (req, res): the Vercel function's entry (Build Output API,
// launcherType Nodejs, supportsResponseStreaming) and the local rehearsal both use it. The answer's body is written piece by
// piece as it comes, so the events of a streamed answer reach the browser at once; when the browser goes away the handler is
// told (its signal aborts), which stops the model call.
import type {IncomingMessage, ServerResponse} from 'node:http';

/** A Web Request for a Node request whose body has been read (or is read here, up to limit bytes; more gives null). */
export async function webRequest(req: IncomingMessage, origin: string, limit: number, signal?: AbortSignal, body?: Uint8Array): Promise<Request | null> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(', '));
  let bytes = body;
  if (!bytes && req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > limit) return null; chunks.push(chunk); }
    bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.length; }
  }
  return new Request(new URL(req.url ?? '/', origin), {method: req.method, headers, signal, body: bytes && req.method !== 'GET' && req.method !== 'HEAD' ? bytes as BodyInit : undefined});
}

/** Writes a Web Response to Node's res, flushing each piece of the body as it arrives. Resolves when all is sent. */
export async function sendResponse(res: ServerResponse, response: Response, extra: Record<string, string> = {}): Promise<void> {
  // Header names in lower case, so one the platform adds and one the answer sets are one header, not two.
  const headers: Record<string, string | string[]> = Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v]));
  for (const [k, v] of response.headers) if (k !== 'set-cookie') headers[k] = v;
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  if (!response.body) { res.end(); return; }
  (res as {flushHeaders?: () => void}).flushHeaders?.();
  const reader = response.body.getReader();
  const gone = () => { void reader.cancel().catch(() => {}); };
  res.on('close', gone);
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (res.destroyed) break;
      res.write(value);
    }
  } catch { /* the reader was cancelled: the browser went away */ }
  res.off('close', gone);
  if (!res.destroyed) res.end();
}

/** A Node (req, res) handler for a Web handler. limit: the most body bytes accepted (413 above). */
export function nodeHandler(handle: (request: Request, signal: AbortSignal) => Promise<Response>, limit: number) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim(), host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
    const request = await webRequest(req, `${proto === 'http' ? 'http' : 'https'}://${host}`, limit, abort.signal).catch(() => null);
    if (!request) { res.writeHead(413, {'content-type': 'text/plain; charset=utf-8'}).end('För stort.'); return; }
    await sendResponse(res, await handle(request, abort.signal));
  };
}
