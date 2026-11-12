// Small files without a database: the bot's day counters and logs and the request inbox, as objects in a private Vercel Blob
// store on the internet, or as files on disk in the rehearsal (cloud/studio/store-file.ts), or in memory in the tests.
//
// The Blob calls are the ones @vercel/blob 2.8.2 makes (its dist source, read 2026-11-12; Vercel documents the SDK, and for
// the HTTP API only the read of a private blob): PUT https://vercel.com/api/blob/?pathname=… with the x-vercel-blob-* and
// x-api-version headers, GET https://vercel.com/api/blob?prefix=… to list, and GET https://<store>.private.blob.vercel-
// storage.com/<path>?cache=0 to read the latest version past the CDN cache ("consistent read"). A write can carry the
// ETag it read (x-if-match): Blob then refuses it if the object changed meanwhile ("conditional writes" in the docs), which
// is what keeps two counters written at once from losing one of the two.

export type Stored = {body: Uint8Array; etag: string; type: string};
export type Written = {ok: true; etag: string} | {ok: false};
export type Store = {
  /** The latest version of an object, or null when there is none. */
  get(key: string): Promise<Stored | null>;
  /** create: only if it does not exist. ifMatch: only if it is still that version. ok false: the condition did not hold. */
  put(key: string, body: Uint8Array | string, type: string, cond?: {ifMatch?: string; create?: boolean}): Promise<Written>;
  /** The keys under a prefix, in no promised order. */
  list(prefix: string): Promise<string[]>;
};

/** Keys are short, lower case, slash-separated, never "..": the layout is bot/dag/…, bot/logg/…, onskemal/…. */
export const KEY = /^(?:[a-z0-9][a-z0-9._-]{0,80}\/){0,4}[a-z0-9][a-z0-9._-]{0,120}$/;
export function checkKey(key: string): string {
  if (!KEY.test(key) || key.split('/').some(part => part === '.' || part === '..' || part.includes('..'))) throw Error(`Ogiltig nyckel: ${key}`);
  return key;
}

const encoder = new TextEncoder(), decoder = new TextDecoder();
export const bytesOf = (body: Uint8Array | string): Uint8Array => typeof body === 'string' ? encoder.encode(body) : body;

export async function readJson<T>(store: Store, key: string): Promise<{value: T; etag: string} | null> {
  const got = await store.get(key);
  if (!got) return null;
  try { return {value: JSON.parse(decoder.decode(got.body)) as T, etag: got.etag}; } catch { throw Error(`Trasig JSON i ${key}`); }
}

/**
 * Reads, changes and writes back one JSON object, and starts over when someone else wrote it in between (the write carries
 * the version it read, or asks to create the object). change gets null when there is none yet. Gives up after tries.
 */
export async function updateJson<T>(store: Store, key: string, change: (current: T | null) => T, tries = 8): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const current = await readJson<T>(store, key);
    const next = change(current ? current.value : null);
    const done = await store.put(key, JSON.stringify(next), 'application/json', current ? {ifMatch: current.etag} : {create: true});
    if (done.ok) return next;
  }
  throw Error(`${key} skrevs av någon annan ${tries} gånger i rad.`);
}

// ── In memory (tests) ───────────────────────────────────────────────────────
export function memoryStore(): Store & {objects: Map<string, Stored>} {
  const objects = new Map<string, Stored>();
  let version = 0;
  return {
    objects,
    async get(key) { const o = objects.get(checkKey(key)); return o ? {...o, body: o.body.slice()} : null; },
    async put(key, body, type, cond = {}) {
      const have = objects.get(checkKey(key));
      if (cond.create && have) return {ok: false};
      if (cond.ifMatch && have?.etag !== cond.ifMatch) return {ok: false};
      const etag = `"m${++version}"`;
      objects.set(key, {body: bytesOf(body).slice(), etag, type});
      return {ok: true, etag};
    },
    async list(prefix) { return [...objects.keys()].filter(k => k.startsWith(prefix)); },
  };
}

// ── Vercel Blob, private store ──────────────────────────────────────────────
const API = 'https://vercel.com/api/blob';
const API_VERSION = '13';

/** The store's id inside a read-write token ("vercel_blob_rw_<store>_<secret>"), as the SDK reads it; null when it has none. */
export function storeIdOf(token: string): string | null {
  const id = token.split('_')[3] ?? '';
  return /^[A-Za-z0-9]{6,64}$/.test(id) ? id : null;
}

/**
 * A private Blob store reached with its read-write token (the environment variable BOT_BLOB_TOKEN). Every write's answer is
 * checked: an object that comes back on a public address means the token is a public store's, and the store refuses to go on.
 */
export function blobStore(token: string, fetcher: typeof fetch = fetch): Store {
  const id = storeIdOf(token);
  if (!id) throw Error('BOT_BLOB_TOKEN är inte en läs- och skrivnyckel till en Blob-lagring.');
  const api = {authorization: `Bearer ${token}`, 'x-api-version': API_VERSION, 'x-vercel-blob-store-id': id};
  const failure = async (response: Response) => {
    const body = await response.json().catch(() => null) as {error?: {code?: string; message?: string}} | null;
    return {code: body?.error?.code ?? `http_${response.status}`, message: body?.error?.message ?? ''};
  };
  return {
    async get(key) {
      const response = await fetcher(`https://${id}.private.blob.vercel-storage.com/${checkKey(key)}?cache=0`, {headers: {authorization: `Bearer ${token}`}});
      if (response.status === 404) return null;
      if (!response.ok) throw Error(`Blob svarade ${response.status} på läsning.`);
      return {body: new Uint8Array(await response.arrayBuffer()), etag: response.headers.get('etag') ?? '', type: response.headers.get('content-type') ?? 'application/octet-stream'};
    },
    async put(key, body, type, cond = {}) {
      const headers: Record<string, string> = {...api, 'x-vercel-blob-access': 'private', 'x-content-type': type, 'x-add-random-suffix': '0',
        'x-allow-overwrite': cond.create ? '0' : '1', 'x-cache-control-max-age': '60', ...(cond.ifMatch ? {'x-if-match': cond.ifMatch} : {})};
      const response = await fetcher(`${API}/?${new URLSearchParams({pathname: checkKey(key)})}`, {method: 'PUT', headers, body: bytesOf(body) as BodyInit});
      if (!response.ok) {
        const {code, message} = await failure(response);
        // A changed object (If-Match) or one that already exists (create): the caller reads again and decides.
        if (code === 'precondition_failed' || response.status === 409 || response.status === 412 || (cond.create && /exist/i.test(message))) return {ok: false};
        throw Error(`Blob vägrade skrivningen (${code}).`);
      }
      const answer = await response.json() as {url?: string; etag?: string};
      let host = '';
      try { host = new URL(String(answer.url)).hostname; } catch { /* checked below */ }
      if (!host.endsWith('.private.blob.vercel-storage.com')) throw Error('Blob-lagringen är inte privat: BOT_BLOB_TOKEN ska höra till en privat lagring.');
      return {ok: true, etag: answer.etag ?? response.headers.get('etag') ?? ''};
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 50; page++) {
        const query = new URLSearchParams({prefix, limit: '1000', ...(cursor ? {cursor} : {})});
        const response = await fetcher(`${API}?${query}`, {headers: api});
        if (!response.ok) throw Error(`Blob vägrade listningen (${(await failure(response)).code}).`);
        const answer = await response.json() as {blobs?: {pathname?: string}[]; cursor?: string; hasMore?: boolean};
        for (const b of answer.blobs ?? []) if (typeof b.pathname === 'string') keys.push(b.pathname);
        if (!answer.hasMore || !answer.cursor) break;
        cursor = answer.cursor;
      }
      return keys;
    },
  };
}
