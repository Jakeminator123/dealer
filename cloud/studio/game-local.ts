// The game's engine in the page, for the studio's online copy. In the lab, game.html talks to the engine (game/session.ts)
// in the lab server through /api/game; the copy has no server that could keep a game between two requests, so there the
// same engine runs in the game page itself. tools/build-studio-snapshot.ts puts this module in front of game-page.js in the
// copy's game.html, and it answers the page's three engine addresses as the lab server does (tools/preview.ts): GET
// /api/game reads a table, POST /api/game/command plays one command, POST /api/game/new starts a table over; one session
// per table name (?table=, "main" when none), at most 24, in this tab's memory. Everything else goes to the network as
// before. A reload is a new table. Rules, shuffle, card values and money stay game/'s: nothing here decides an outcome. The
// shoe is always the secure one, drawn from the browser's CSPRNG (cloud/studio/node-crypto.ts): the lab's seeded and stacked
// shoes are refused here. Tested in tools/studio-freeze.test.ts.
import {createSession, SessionError, type Session, type SessionOptions} from '../../game/session.ts';

export const ENGINE_PATHS: readonly string[] = ['/api/game', '/api/game/command', '/api/game/new'];
const TABLE = /^[a-z0-9-]{1,40}$/, BODY_LIMIT = 16384, TABLES = 24;

export type EngineAnswer = {status: number; body: unknown};
const refuse = (status: number, code: string, message: string): EngineAnswer => ({status, body: {error: {code, message}}});

/** The engine's answer to one request, as the lab server gives it; null for an address that is not the engine's. */
export function localEngine(create: (options?: SessionOptions) => Session = createSession) {
  const games = new Map<string, Session>();
  const keep = (name: string, game: Session) => { games.delete(name); if (games.size >= TABLES) games.delete(games.keys().next().value!); games.set(name, game); return game; };
  const tableOf = (name: string) => games.get(name) ?? keep(name, create());
  return function answer(method: string, url: URL, body: string | null): EngineAnswer | null {
    if (!ENGINE_PATHS.includes(url.pathname)) return null;
    const name = url.searchParams.get('table') ?? 'main';
    if (url.pathname === '/api/game') {
      if (method !== 'GET' && method !== 'HEAD') return {status: 405, body: null};
      return TABLE.test(name) ? {status: 200, body: tableOf(name).state()} : refuse(400, 'INVALID_TABLE', 'Ogiltigt bordsnamn.');
    }
    if (method !== 'POST') return {status: 405, body: null};
    if (!TABLE.test(name)) return refuse(400, 'INVALID_TABLE', 'Ogiltigt bordsnamn.');
    if ((body ?? '').length > BODY_LIMIT) return refuse(413, 'TOO_LARGE', 'Kommandot är för stort.');
    let input: unknown;
    try { input = JSON.parse(body ?? ''); } catch { return refuse(400, 'INVALID_COMMAND', 'Kommandot är inte giltig JSON.'); }
    try {
      if (url.pathname === '/api/game/new') {
        const options = (input ?? {}) as SessionOptions;
        if (options.shoe !== undefined && (options.shoe as {mode?: unknown})?.mode !== 'secure') return refuse(403, 'SHOE_REFUSED', 'Kopian spelar bara med en blandad sko.');
        return {status: 200, body: keep(name, create(options)).state()};
      }
      return {status: 200, body: tableOf(name).command(input)};
    } catch (error) {
      if (error instanceof SessionError) return refuse(error.status, error.code, error.message);
      return refuse(500, 'INTERNAL', 'Spelet kunde inte svara.');
    }
  };
}

type Page = {fetch: typeof fetch; location: {href: string}};

/** Puts the engine in front of the page's fetch: the engine's addresses on this origin are answered here, all else as before. */
export function install(page: Page = globalThis as unknown as Page, answer = localEngine()): void {
  const network = page.fetch.bind(page);
  page.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = typeof input === 'object' && 'url' in input && !(input instanceof URL) ? input as Request : null;
    const here = new URL(page.location.href), url = new URL(request ? request.url : String(input), here);
    if (url.origin !== here.origin || !ENGINE_PATHS.includes(url.pathname)) return network(input, init);
    const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
    const body = init?.body != null ? String(init.body) : request && method !== 'GET' && method !== 'HEAD' ? await request.text() : null;
    const out = answer(method, url, body)!;
    return new Response(out.body === null ? null : JSON.stringify(out.body), {status: out.status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});
  };
}

// In a page (the copy's game.html), at once: game-page.js reads the table as its first step.
if (typeof window !== 'undefined' && typeof document !== 'undefined') install();
