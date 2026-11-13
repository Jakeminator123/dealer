// What the middleware does with one request (cloud/studio/middleware.ts is only its entry). Everything but the login page,
// the login route and robots.txt needs the signed cookie; without it the answer is the login page itself, whatever was
// asked for: a page, a film or /api/clip-bank. With it, a film is fetched from its object in Vercel Blob by this function,
// with the Range asked for, and answered as private (the browser keeps the site's own address, so films stay same-origin for
// the 3D scene and stay behind the password), and everything else goes on to the static files. A rewrite to Blob would cost
// less, but Vercel's CDN keeps the first answer of a rewritten film for its address whatever Range is asked later (measured on
// the copy 2026-11-13: every request then got the first 1 000 bytes), so it is used only with DEALER_MEDIA_MODE=rewrite. Only GET and HEAD pass, except to the bot and the request inbox (cloud/studio/bot-routes.ts),
// the copy's only addresses that write; the gate refuses the rest.
// A second kind of password (DEALER_LOSEN_SPEL, lock.ts) opens only the game: /casino leads to the game page alone (GAME_HOME),
// and with such a cookie the game page and what it loads are let through, while the studio, every other page and the bot
// lead back to the game.
//
// The answers follow Vercel's middleware protocol for the Build Output API: a response with "x-middleware-next: 1" goes on
// to the files, one with "x-middleware-rewrite: <url>" is served from that address, any other response is the answer.
import {COOKIE, MAX_AGE, TryLimit, clearCookieHeader, clientAddress, cookieHeader, cookieScope, passwordScope, readCookies, secrets, signCookie, signGameCookie, type Secrets} from './lock.ts';
import {loginPage, safeNext} from './login-page.ts';
import {isAdminCall, isBotPath} from './bot-routes.ts';

/** A film or picture that lies in Blob: its address there (null until it is uploaded), its type, size and SHA-256. */
export type MediaEntry = {url: string | null; type: string; bytes: number; sha256: string};
/** The site's own path ("/assets/motions/<id>/source.mp4") to its object in Blob. Written by tools/build-studio-snapshot.ts. */
export type MediaMap = Record<string, MediaEntry>;
export type Env = {DEALER_LOSEN?: string; DEALER_LOSEN_SPEL?: string; DEALER_KAKNYCKEL?: string; DEALER_MEDIA_MODE?: string};
export type GateContext = {
  env: Env;
  media: MediaMap;
  limiter: TryLimit;
  /** ms since 1970; the clock for tests. */
  now?: () => number;
  /** For proxy mode: how a film is fetched from Blob (the tests give their own). */
  fetch?: typeof fetch;
};

export const ROBOTS = {'X-Robots-Tag': 'noindex, nofollow'} as const;
export const OPEN = new Set(['/robots.txt']);
/**
 * The game alone, for someone who is only to play: the look, the table and the dealer of the link Jakob himself uses for the
 * Casino view (2026-11-13). /casino leads here, and so does every login with one of the game's passwords.
 */
export const GAME_HOME = '/game.html?forval=levande&dx=-0.0624&dy=0.016&table=casino&dealer=paow';
const GAME_DOOR = new Set(['/casino', '/casino/']);
/** A page of the copy other than the game: the studio, the root, a folder or another .html. */
const otherPage = (path: string): boolean => path !== '/game.html' && (path === '/studio' || path.startsWith('/studio/') || path.endsWith('/') || path.endsWith('.html'));
/** What a visitor with one of the game's passwords may ask for: the game page and what it loads, never another page or the bot. */
export const gameMay = (path: string): boolean => !otherPage(path) && !isBotPath(path);
/** Where a login with one of the game's passwords leads: the game address that was asked for, else the game's own. */
const gameNext = (next: string): string => next.startsWith('/game.html') ? next : GAME_HOME;
const BODY_LIMIT = 4096;

const page = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...ROBOTS, ...extra}});
const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {status, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...ROBOTS, ...extra}});
export const passOn = () => new Response(null, {headers: {'x-middleware-next': '1', ...ROBOTS}});
export const rewriteTo = (url: string) => new Response(null, {headers: {'x-middleware-rewrite': url, ...ROBOTS}});
const goTo = (location: string) => new Response(null, {status: 303, headers: {Location: location, 'Cache-Control': 'no-store', ...ROBOTS}});

// The secrets are read once per pair of values: a cold instance pays one key import, a warm one none.
let memo: {password: string; game: string; key: string; secrets: Promise<Secrets | null>} | null = null;
function lockOf(env: Env): Promise<Secrets | null> {
  const password = env.DEALER_LOSEN ?? '', game = env.DEALER_LOSEN_SPEL ?? '', key = env.DEALER_KAKNYCKEL ?? '';
  if (!memo || memo.password !== password || memo.game !== game || memo.key !== key) memo = {password, game, key, secrets: secrets(env)};
  return memo.secrets;
}

async function login(request: Request, s: Secrets, ctx: GateContext, now: number, secure: boolean): Promise<Response> {
  const address = clientAddress(request.headers);
  const turn = ctx.limiter.take(address, now);
  if (!turn.ok) return page(loginPage({error: 'many', wait: turn.wait}), 429, {'Retry-After': String(Math.ceil(turn.wait / 1000))});
  if (Number(request.headers.get('content-length') ?? 0) > BODY_LIMIT) return text('För stort.', 413);
  const body = await request.text();
  if (body.length > BODY_LIMIT) return text('För stort.', 413);
  const form = new URLSearchParams(body), next = safeNext(form.get('next'));
  const scope = await passwordScope(s, form.get('losen') ?? '');
  if (!scope) return page(loginPage({next, error: 'wrong'}), 401);
  ctx.limiter.clear(address);
  // One of the game's passwords gives the game's kind of cookie and leads to the game, whatever page was asked for.
  const expires = Math.floor(now / 1000) + MAX_AGE, value = scope === 'game' ? await signGameCookie(s, expires) : await signCookie(s, expires);
  return new Response(null, {status: 303, headers: {Location: scope === 'game' ? gameNext(next) : next, 'Set-Cookie': cookieHeader(value, secure), 'Cache-Control': 'no-store', ...ROBOTS}});
}

/** A film from Blob through this function, the Range header passed on as it came; private, so no CDN keeps it. */
async function proxy(request: Request, entry: MediaEntry, ctx: GateContext): Promise<Response> {
  const range = request.headers.get('range');
  const upstream = await (ctx.fetch ?? fetch)(entry.url!, {method: request.method, headers: range ? {range} : {}});
  const headers = new Headers({'Content-Type': entry.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400', ...ROBOTS});
  for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
  return new Response(request.method === 'HEAD' ? null : upstream.body, {status: upstream.status, headers});
}

export async function gate(request: Request, ctx: GateContext): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, now = ctx.now?.() ?? Date.now(), secure = url.protocol === 'https:';
  if (OPEN.has(path)) return passOn();
  const s = await lockOf(ctx.env);
  // Without a password and a long enough key the lock stays shut: nothing but this page is shown.
  if (!s) return page(loginPage({error: 'closed'}), 503);
  if (path === '/login' || path === '/login/') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return text('Bara GET.', 405, {Allow: 'GET, HEAD'});
    return page(loginPage({next: safeNext(url.searchParams.get('next'))}), 200);
  }
  if (path === '/api/login') return request.method === 'POST' ? login(request, s, ctx, now, secure) : text('Bara POST.', 405, {Allow: 'POST'});
  if (path === '/api/logout') {
    if (request.method !== 'POST') return text('Bara POST.', 405, {Allow: 'POST'});
    return new Response(null, {status: 303, headers: {Location: '/login', 'Set-Cookie': clearCookieHeader(secure), 'Cache-Control': 'no-store', ...ROBOTS}});
  }
  // The bot's hook (cloud/studio/bot-routes.ts): the owner's tool reaches the inbox with its admin key, which the function
  // itself compares; with the cookie, every method of the bot's addresses goes on to the function, which allows its own.
  if (isAdminCall(path, request.headers)) return passOn();
  const scope = await cookieScope(s, readCookies(request.headers.get('cookie')).get(COOKIE), Math.floor(now / 1000));
  // The door for someone who is only to play: the game's own address, behind the same lock.
  if (GAME_DOOR.has(path)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return text('Bara GET.', 405, {Allow: 'GET, HEAD'});
    return scope ? goTo(GAME_HOME) : page(loginPage({next: GAME_HOME}), 401);
  }
  if (!scope) {
    // The login page itself, for every address: a page asked for comes back to it after the login.
    const next = request.method === 'GET' && request.headers.get('sec-fetch-dest') !== 'video' ? safeNext(path + url.search) : '/studio/';
    return page(loginPage({next}), 401);
  }
  // With one of the game's passwords: the game and what it loads. Another page leads back to the game; the bot is shut.
  if (scope === 'game' && !gameMay(path)) return isBotPath(path) || request.method !== 'GET' && request.method !== 'HEAD' ? text('Bara spelet är öppet med det här lösenordet.', 403) : goTo(GAME_HOME);
  if (isBotPath(path)) return passOn();
  if (request.method !== 'GET' && request.method !== 'HEAD') return text('Kopian går inte att ändra.', 405, {Allow: 'GET, HEAD'});
  const entry = Object.hasOwn(ctx.media, path) ? ctx.media[path] : null;
  if (entry) {
    if (!entry.url) return text('Filmen är inte uppladdad.', 503);
    return ctx.env.DEALER_MEDIA_MODE === 'rewrite' ? rewriteTo(entry.url) : proxy(request, entry, ctx);
  }
  return passOn();
}
