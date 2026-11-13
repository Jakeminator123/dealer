import test from 'node:test';
import assert from 'node:assert/strict';
import {secrets, passwordsOf, signCookie, verifyCookie, samePassword, passwordScope, signGameCookie, cookieScope, readCookies, TryLimit, MAX_AGE, COOKIE, TRIES, WINDOW} from '../cloud/studio/lock.ts';
import {gate, GAME_HOME, type GateContext, type MediaMap} from '../cloud/studio/gate.ts';
import {loginPage, safeNext} from '../cloud/studio/login-page.ts';

// Throwaway values for the tests only; the real ones live in the Vercel project's environment.
const key = 'k'.repeat(40), env = {DEALER_LOSEN: 'prov-losen', DEALER_KAKNYCKEL: key};
const now = 1_800_000_000; // seconds

test('the lock stays shut without a password or with a short signing key', async () => {
  assert.equal(await secrets({DEALER_KAKNYCKEL: key}), null);
  assert.equal(await secrets({DEALER_LOSEN: 'x', DEALER_KAKNYCKEL: 'kort'}), null);
  assert.ok(await secrets(env));
});

test('a signed cookie holds until it expires, and only as it was signed', async () => {
  const s = (await secrets(env))!;
  const value = await signCookie(s, now + MAX_AGE);
  assert.match(value, /^v1\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await verifyCookie(s, value, now), true);
  // expired, and an expiry no signCookie with MAX_AGE writes
  assert.equal(await verifyCookie(s, value, now + MAX_AGE), false);
  assert.equal(await verifyCookie(s, await signCookie(s, now + MAX_AGE * 2), now), false);
  // tampered: the signature, the expiry, the form
  const [v, exp, sig] = value.split('.');
  const flipped = sig.slice(0, 10) + (sig[10] === 'A' ? 'B' : 'A') + sig.slice(11);
  assert.equal(await verifyCookie(s, `${v}.${exp}.${flipped}`, now), false);
  assert.equal(await verifyCookie(s, `${v}.${Number(exp) - 1}.${sig}`, now), false);
  for (const bad of ['', 'v1', `v2.${exp}.${sig}`, `v1.${exp}.${sig}=`, `v1.-5.${sig}`, null, undefined]) assert.equal(await verifyCookie(s, bad, now), false);
  // another key, or a new password, and every old cookie is worthless
  assert.equal(await verifyCookie((await secrets({...env, DEALER_KAKNYCKEL: 'q'.repeat(40)}))!, value, now), false);
  assert.equal(await verifyCookie((await secrets({...env, DEALER_LOSEN: 'nytt'}))!, value, now), false);
});

test('the password is compared whole', async () => {
  const s = (await secrets(env))!;
  assert.equal(await samePassword(s, 'prov-losen'), true);
  for (const wrong of ['', 'prov', 'prov-losen ', 'Prov-losen', 'prov-losen-prov-losen']) assert.equal(await samePassword(s, wrong), false);
});

test('DEALER_LOSEN may name several passwords, separated by commas; each opens, nothing else does', async () => {
  assert.deepEqual(passwordsOf(' john, jon ,,john'), ['john', 'jon']);
  assert.deepEqual(passwordsOf(undefined), []);
  assert.equal(await secrets({DEALER_LOSEN: ' , ', DEALER_KAKNYCKEL: key}), null, 'only commas and spaces: the lock stays shut');
  const s = (await secrets({DEALER_LOSEN: 'john,jon', DEALER_KAKNYCKEL: key}))!;
  for (const right of ['john', 'jon']) assert.equal(await samePassword(s, right), true, right);
  for (const wrong of ['', 'john,jon', 'jo', 'John', 'jon ', 'johnjon', ',']) assert.equal(await samePassword(s, wrong), false, JSON.stringify(wrong));
  // one password signs as before; adding or taking one away makes every cookie worthless
  const one = (await secrets(env))!, value = await signCookie(one, now + 60);
  assert.equal(await verifyCookie((await secrets({...env, DEALER_LOSEN: ' prov-losen '}))!, value, now), true);
  assert.equal(await verifyCookie((await secrets({...env, DEALER_LOSEN: 'prov-losen,jon'}))!, value, now), false);
  assert.equal(await verifyCookie(s, await signCookie((await secrets({DEALER_LOSEN: 'jon', DEALER_KAKNYCKEL: key}))!, now + 60), now), false);
});

test('at most ten tries per address per ten minutes', () => {
  const limit = new TryLimit();
  for (let i = 0; i < TRIES; i++) assert.equal(limit.take('1.2.3.4', 1000 + i).ok, true);
  const stop = limit.take('1.2.3.4', 2000);
  assert.equal(stop.ok, false);
  assert.ok(stop.wait > 0 && stop.wait <= WINDOW);
  assert.equal(limit.take('5.6.7.8', 2000).ok, true, 'another address has its own count');
  assert.equal(limit.take('1.2.3.4', 1000 + WINDOW).ok, true, 'the oldest try has left the window');
  limit.clear('1.2.3.4');
  for (let i = 0; i < TRIES; i++) assert.equal(limit.take('1.2.3.4', 3000).ok, true);
  // a full table drops its oldest address instead of growing
  const small = new TryLimit(1, WINDOW, 2);
  small.take('a', 0); small.take('b', 0); small.take('c', 0);
  assert.equal(small.take('a', 1).ok, true);
});

test('cookies are read by name and the login page never carries the password', () => {
  assert.equal(readCookies(`x=1; ${COOKIE}=v1.2.abc; ${COOKIE}=second`).get(COOKIE), 'v1.2.abc');
  const page = loginPage({next: '/studio/karta/', error: 'wrong'});
  assert.match(page, /Dealer Studio · Lösenord/);
  assert.match(page, /Fel lösenord/);
  assert.doesNotMatch(page, /prov-losen/);
  assert.match(loginPage({next: '"><script>'}), /value="&quot;&gt;&lt;script&gt;"/);
  assert.equal(safeNext('//evil.example/'), '/studio/');
  assert.equal(safeNext('https://evil.example/'), '/studio/');
  assert.equal(safeNext('/\\evil'), '/studio/');
  assert.equal(safeNext('/api/login'), '/studio/');
  assert.equal(safeNext('/studio/karta/?kant=x'), '/studio/karta/?kant=x');
});

// ── The gate as the middleware runs it ──────────────────────────────────────
const film = '/assets/motions/pamela-p4-c1-deal-01/source.mp4';
const media: MediaMap = {[film]: {url: 'https://store.public.blob.vercel-storage.com/studio/' + 'a'.repeat(64) + '.mp4', type: 'video/mp4', bytes: 10, sha256: 'a'.repeat(64)}};
const context = (over: Partial<GateContext> = {}): GateContext => ({env, media, limiter: new TryLimit(), now: () => now * 1000, ...over});
const ask = (path: string, init: RequestInit = {}) => new Request('https://kopia.example' + path, init);
const login = (losen: string, next = '/studio/karta/', ip = '9.9.9.9') => ask('/api/login', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': ip}, body: new URLSearchParams({losen, next}).toString()});
const cookieOf = (response: Response) => /dealer_studio=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1] ?? null;

test('without the cookie every address answers with the login page; robots.txt passes', async () => {
  const ctx = context();
  for (const path of ['/studio/', '/api/clip-bank', film, '/meta.json', '/scene3d-view.js', '/studio/_next/static/chunks/a.js']) {
    const answer = await gate(ask(path), ctx);
    assert.equal(answer.status, 401, path);
    assert.match(await answer.text(), /Dealer Studio · Lösenord/, path);
    assert.equal(answer.headers.get('x-middleware-next'), null);
    assert.equal(answer.headers.get('x-middleware-rewrite'), null);
    assert.equal(answer.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
  assert.equal((await gate(ask('/robots.txt'), ctx)).headers.get('x-middleware-next'), '1');
  assert.equal((await gate(ask('/login'), ctx)).status, 200);
  const shut = await gate(ask('/studio/'), context({env: {}}));
  assert.equal(shut.status, 503);
});

test('a wrong password does not get in; the right one sets a locked-down cookie and returns to the page', async () => {
  const ctx = context();
  const wrong = await gate(login('fel'), ctx);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  const right = await gate(login('prov-losen'), ctx);
  assert.equal(right.status, 303);
  assert.equal(right.headers.get('location'), '/studio/karta/');
  const set = right.headers.get('set-cookie') ?? '';
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${MAX_AGE}`, 'Path=/']) assert.ok(set.includes(part), part);
  const cookie = cookieOf(right)!;
  const page = await gate(ask('/studio/', {headers: {cookie: `${COOKIE}=${cookie}`}}), ctx);
  assert.equal(page.headers.get('x-middleware-next'), '1');
  const movie = await gate(ask(film, {headers: {cookie: `${COOKIE}=${cookie}`, range: 'bytes=0-1'}}), context({env: {...env, DEALER_MEDIA_MODE: 'rewrite'}}));
  assert.equal(movie.headers.get('x-middleware-rewrite'), media[film].url, 'rewrite only when asked for');
  // the copy writes nothing, whatever is sent
  for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) assert.equal((await gate(ask('/api/clip-bank/review/x', {method, headers: {cookie: `${COOKIE}=${cookie}`}}), ctx)).status, 405, method);
  // a stranger's next is not followed
  assert.equal((await gate(login('prov-losen', '//evil.example/x'), ctx)).headers.get('location'), '/studio/');
});

test('the eleventh try in ten minutes is refused, even with the right password', async () => {
  const ctx = context();
  for (let i = 0; i < TRIES; i++) assert.equal((await gate(login('fel', '/studio/', '7.7.7.7'), ctx)).status, 401);
  const stopped = await gate(login('prov-losen', '/studio/', '7.7.7.7'), ctx);
  assert.equal(stopped.status, 429);
  assert.ok(Number(stopped.headers.get('retry-after')) > 0);
  assert.equal(stopped.headers.get('set-cookie'), null);
  assert.equal((await gate(login('prov-losen', '/studio/', '8.8.8.8'), ctx)).status, 303);
});

test('a film not yet uploaded is a 503, and a film is fetched from Blob with its Range and answered as private', async () => {
  const s = (await secrets(env))!, cookie = `${COOKIE}=${await signCookie(s, now + 60)}`;
  const empty = await gate(ask(film, {headers: {cookie}}), context({media: {[film]: {...media[film], url: null}}}));
  assert.equal(empty.status, 503);
  let seen: string | null = null;
  const fakeFetch = (async (_url: string, init: RequestInit) => { seen = new Headers(init.headers).get('range'); return new Response('ab', {status: 206, headers: {'content-range': 'bytes 0-1/10', 'content-length': '2'}}); }) as typeof fetch;
  const proxied = await gate(ask(film, {headers: {cookie, range: 'bytes=0-1'}}), context({fetch: fakeFetch}));
  assert.equal(seen, 'bytes=0-1');
  assert.equal(proxied.status, 206);
  assert.equal(proxied.headers.get('content-range'), 'bytes 0-1/10');
  assert.equal(proxied.headers.get('content-type'), 'video/mp4');
  assert.equal(proxied.headers.get('cache-control'), 'private, max-age=86400', 'no CDN keeps a film: its first range would be served for every range');
  assert.equal(proxied.headers.get('x-middleware-rewrite'), null);
  assert.equal(await proxied.text(), 'ab');
});

// ── A password for the game alone (DEALER_LOSEN_SPEL) ───────────────────────
// Jakob 2026-11-13: a link "för någon som bara vill spela", with a password of its own "för bara casinot".
const gameEnv = {...env, DEALER_LOSEN_SPEL: 'spela, prov-losen'};

test('the game\'s passwords have their own kind of cookie, which neither opens the rest nor is made from the other kind', async () => {
  const s = (await secrets(gameEnv))!;
  assert.deepEqual(s.game, ['spela'], 'a word that stands in both lists opens everything and is not one of the game\'s');
  assert.equal(await passwordScope(s, 'prov-losen'), 'all'); assert.equal(await passwordScope(s, 'spela'), 'game');
  for (const wrong of ['', 'spel', 'Spela', 'spela ', 'spela,prov-losen']) assert.equal(await passwordScope(s, wrong), null, JSON.stringify(wrong));
  assert.equal(await samePassword(s, 'spela'), false, 'not a password of the whole copy');
  const game = await signGameCookie(s, now + 60), all = await signCookie(s, now + 60);
  assert.match(game, /^g1\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await cookieScope(s, game, now), 'game'); assert.equal(await cookieScope(s, all, now), 'all');
  assert.equal(await verifyCookie(s, game, now), false, 'the bot asks verifyCookie: a game cookie is none');
  // neither kind from the other: the same signature under the other prefix does not hold
  assert.equal(await cookieScope(s, game.replace(/^g1/, 'v1'), now), null); assert.equal(await cookieScope(s, all.replace(/^v1/, 'g1'), now), null);
  assert.equal(await cookieScope(s, game, now + 61), null, 'expired');
  // the game's passwords changed or taken away: its cookies end, the others hold
  assert.equal(await cookieScope((await secrets({...env, DEALER_LOSEN_SPEL: 'annat'}))!, game, now), null);
  assert.equal(await cookieScope((await secrets(env))!, game, now), null);
  assert.equal(await cookieScope((await secrets(env))!, all, now), 'all', 'a cookie given before the game had a password still holds');
  assert.equal(await passwordScope((await secrets(env))!, 'spela'), null, 'without the variable there is no such password');
});

test('with a game password the game and what it loads pass; the studio and every other page lead back to the game, and the bot is shut', async () => {
  const ctx = context({env: gameEnv});
  // /casino without a cookie: the login page on its way to the game, and it says Blackjack, not Dealer Studio
  const door = await gate(ask('/casino'), ctx), doorPage = await door.text();
  assert.equal(door.status, 401);
  assert.match(doorPage, /<title>Blackjack · Lösenord<\/title>/); assert.ok(doorPage.includes(`name="next" value="${GAME_HOME.replaceAll('&', '&amp;')}"`));
  // the game's password leads to the game whatever page was asked for; a game address that was asked for is kept
  const inStudio = await gate(login('spela', '/studio/karta/'), ctx);
  assert.equal(inStudio.status, 303); assert.equal(inStudio.headers.get('location'), GAME_HOME);
  assert.equal((await gate(login('spela', '/game.html?dealer=paow&table=x'), ctx)).headers.get('location'), '/game.html?dealer=paow&table=x');
  assert.match(cookieOf(inStudio)!, /^g1\./);
  const cookie = `${COOKIE}=${cookieOf(inStudio)!}`;
  // what the game loads passes
  for (const path of ['/game.html', '/game-page.js', '/scene3d-view.js', '/vendor/three.module.js', '/api/clip-bank', '/api/placements', '/data/speech-patches.json', '/meta.json'])
    assert.equal((await gate(ask(path, {headers: {cookie}}), ctx)).headers.get('x-middleware-next'), '1', path);
  const movie = await gate(ask(film, {headers: {cookie, range: 'bytes=0-1'}}), context({env: gameEnv, fetch: async () => new Response('ab', {status: 206, headers: {'content-range': 'bytes 0-1/10'}})}));
  assert.equal(movie.status, 206, 'a film is fetched for the game as for the studio');
  // another page leads back to the game
  for (const path of ['/studio/', '/studio/game/', '/studio', '/', '/lab.html', '/scene3d.html', '/materials/']) {
    const answer = await gate(ask(path, {headers: {cookie}}), ctx);
    assert.equal(answer.status, 303, path); assert.equal(answer.headers.get('location'), GAME_HOME, path);
  }
  assert.equal((await gate(ask('/casino', {headers: {cookie}}), ctx)).headers.get('location'), GAME_HOME);
  // the bot and the inbox are shut, and nothing is written
  for (const path of ['/api/bot', '/api/utkast', '/api/onskemal']) assert.equal((await gate(ask(path, {method: 'POST', headers: {cookie}}), ctx)).status, 403, path);
  assert.equal((await gate(ask('/api/clip-bank/review/x', {method: 'POST', headers: {cookie}}), ctx)).status, 405);
  // the whole copy's password still opens everything, and the game's door too
  const whole = await gate(login('prov-losen', '/studio/karta/'), ctx), wholeCookie = `${COOKIE}=${cookieOf(whole)!}`;
  assert.equal(whole.headers.get('location'), '/studio/karta/');
  assert.equal((await gate(ask('/studio/', {headers: {cookie: wholeCookie}}), ctx)).headers.get('x-middleware-next'), '1');
  assert.equal((await gate(ask('/casino', {headers: {cookie: wholeCookie}}), ctx)).headers.get('location'), GAME_HOME);
  // without the variable the game's password is a wrong password; /casino is still the door to the game for the others
  const plain = context();
  assert.equal((await gate(login('spela'), plain)).status, 401);
  assert.equal((await gate(ask('/casino'), plain)).status, 401);
});
