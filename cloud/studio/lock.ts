// The lock of the studio's read-only copy on the internet: one shared password, a signed cookie, and a limit on tries.
// Only Web APIs (crypto.subtle, TextEncoder, URL), so the same file runs in Vercel's Edge runtime (the middleware), in Node
// (the local rehearsal, tools/serve-studio-snapshot.ts) and in the tests. The password and the signing key are never in the
// repo: they are the environment variables DEALER_LOSEN and DEALER_KAKNYCKEL, set in the Vercel project by the owner.
// DEALER_LOSEN may name more than one password, separated by commas ("john,jon": the word Jakob decided and the one he wrote
// later), each of which opens the lock; a password can then hold no comma. Spaces around each are not part of it.
// DEALER_LOSEN_SPEL names, in the same way, passwords that open only the game (Jakob 2026-11-13: one for someone who is only
// to play): such a cookie is another kind (signGameCookie), and the gate lets it reach the game page and what the game loads,
// never the studio. Without the variable there is no such password and nothing changes.

export const COOKIE = 'dealer_studio';
export const MAX_AGE = 30 * 24 * 60 * 60; // seconds: 30 days
export const TRIES = 10, WINDOW = 10 * 60 * 1000; // at most ten tries per address per ten minutes
/** Shortest signing key accepted: a short key would make the cookie guessable, so the lock stays shut instead. */
export const MIN_KEY = 32;

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const base64url = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function unbase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try { return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); } catch { return null; }
}

/** Two byte strings compared without an early exit: the time does not tell how much of a guess was right. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** What a login opens: everything on the copy, or only the game. */
export type Scope = 'all' | 'game';
export type Secrets = {passwords: string[]; game: string[]; key: CryptoKey; fingerprint: string; gameFingerprint: string};

/** The passwords DEALER_LOSEN names: separated by commas, each trimmed, empty ones dropped, each once. */
export const passwordsOf = (value: string | undefined): string[] => [...new Set((value ?? '').split(',').map(p => p.trim()).filter(Boolean))];

/**
 * The lock's secrets from the environment, or null when they are missing or too weak (the lock then stays shut). The
 * fingerprint of the passwords is signed into every cookie, so a new password (or one taken away) makes every old cookie worthless.
 */
export async function secrets(env: {DEALER_LOSEN?: string; DEALER_LOSEN_SPEL?: string; DEALER_KAKNYCKEL?: string}): Promise<Secrets | null> {
  const passwords = passwordsOf(env.DEALER_LOSEN), raw = env.DEALER_KAKNYCKEL ?? '';
  if (!passwords.length || raw.length < MIN_KEY) return null;
  // The game's passwords: a word that stands in both lists opens everything, so it is not one of these.
  const game = passwordsOf(env.DEALER_LOSEN_SPEL).filter(p => !passwords.includes(p));
  const key = await crypto.subtle.importKey('raw', bytes(raw), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  // One password: the same fingerprint as before there could be several, so cookies already given keep holding.
  const fingerprint = hex(await crypto.subtle.digest('SHA-256', bytes(`dealer-studio|losen|${passwords.join('\n')}`))).slice(0, 32);
  // The game's cookies carry their own fingerprint, so a change of the game's passwords ends them and leaves the others holding.
  const gameFingerprint = hex(await crypto.subtle.digest('SHA-256', bytes(`dealer-studio|losen-spel|${game.join('\n')}`))).slice(0, 32);
  return {passwords, game, key, fingerprint, gameFingerprint};
}

const mac = async (s: Secrets, message: string) => new Uint8Array(await crypto.subtle.sign('HMAC', s.key, bytes(message)));

/**
 * The posted password against each of DEALER_LOSEN's in constant time: all are run through the HMAC first, so each comparison is
 * of two 32-byte digests whatever their lengths, every one is made, and none stops at the first wrong character.
 */
export const samePassword = (s: Secrets, given: string): Promise<boolean> => among(s, given, s.passwords);
async function among(s: Secrets, given: string, list: string[]): Promise<boolean> {
  const [a, ...known] = await Promise.all([mac(s, `dealer-studio|try|${given}`), ...list.map(p => mac(s, `dealer-studio|try|${p}`))]);
  let hit = false;
  for (const b of known) hit = sameBytes(a, b) || hit;
  return hit;
}
/** What the posted password opens: everything, only the game, or nothing. Both lists are always compared, whatever the first says. */
export async function passwordScope(s: Secrets, given: string): Promise<Scope | null> {
  const [all, game] = await Promise.all([among(s, given, s.passwords), among(s, given, s.game)]);
  return all ? 'all' : game ? 'game' : null;
}

const signed = (s: Secrets, expires: number) => `dealer-studio|v1|${expires}|${s.fingerprint}`;

/** A cookie value that holds until expires (seconds since 1970): "v1.<expires>.<HMAC-SHA256>". */
export async function signCookie(s: Secrets, expires: number): Promise<string> {
  if (!Number.isSafeInteger(expires) || expires <= 0) throw Error('Ogiltig giltighetstid.');
  return `v1.${expires}.${base64url((await mac(s, signed(s, expires))).buffer as ArrayBuffer)}`;
}

/** Whether a cookie value is one this lock signed, with this password, and has not expired. now in seconds. */
export async function verifyCookie(s: Secrets, value: string | null | undefined, now: number): Promise<boolean> {
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value ?? '');
  if (!m) return false;
  const expires = Number(m[1]), given = unbase64url(m[2]);
  // An expiry further away than one cookie lifetime was never written by signCookie with MAX_AGE.
  if (!given || expires <= now || expires > now + MAX_AGE + 60) return false;
  return sameBytes(given, await mac(s, signed(s, expires)));
}

const signedGame = (s: Secrets, expires: number) => `dealer-studio|g1|${expires}|${s.gameFingerprint}`;

/** A cookie value for the game alone: "g1.<expires>.<HMAC-SHA256>". Another message than signCookie's, so neither kind can be made from the other. */
export async function signGameCookie(s: Secrets, expires: number): Promise<string> {
  if (!Number.isSafeInteger(expires) || expires <= 0) throw Error('Ogiltig giltighetstid.');
  return `g1.${expires}.${base64url((await mac(s, signedGame(s, expires))).buffer as ArrayBuffer)}`;
}

/** Whether a cookie value is a game cookie this lock signed, with the game's passwords as they are now, and has not expired. */
export async function verifyGameCookie(s: Secrets, value: string | null | undefined, now: number): Promise<boolean> {
  const m = /^g1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value ?? '');
  if (!m || !s.game.length) return false;
  const expires = Number(m[1]), given = unbase64url(m[2]);
  if (!given || expires <= now || expires > now + MAX_AGE + 60) return false;
  return sameBytes(given, await mac(s, signedGame(s, expires)));
}

/** What a cookie value opens: everything, only the game, or nothing. */
export async function cookieScope(s: Secrets, value: string | null | undefined, now: number): Promise<Scope | null> {
  return await verifyCookie(s, value, now) ? 'all' : await verifyGameCookie(s, value, now) ? 'game' : null;
}

/** The cookies of a request as a map (the first of a repeated name wins). */
export function readCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim(), value = part.slice(at + 1).trim();
    if (!out.has(name)) out.set(name, value);
  }
  return out;
}

/** Set-Cookie for a signed value: HttpOnly (no script reads it), Secure (https only), SameSite=Lax, the whole site. */
export const cookieHeader = (value: string, secure = true) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
/** Set-Cookie that removes the cookie (logging out). */
export const clearCookieHeader = (secure = true) => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

/**
 * At most TRIES login tries per address per WINDOW. Kept in the memory of one running instance: Vercel may run several,
 * each with its own count, so the real ceiling is TRIES per instance; it still turns a guessing run into a crawl.
 */
export class TryLimit {
  private readonly seen = new Map<string, number[]>();
  private readonly max: number;
  private readonly window: number;
  private readonly room: number;
  constructor(max = TRIES, window = WINDOW, room = 10_000) { this.max = max; this.window = window; this.room = room; }
  /** Counts one try from an address; ok false when it is over the limit, with the milliseconds until the next is allowed. */
  take(address: string, now: number): {ok: boolean; wait: number} {
    const recent = (this.seen.get(address) ?? []).filter(t => now - t < this.window);
    if (recent.length >= this.max) { this.seen.set(address, recent); return {ok: false, wait: this.window - (now - recent[0])}; }
    recent.push(now);
    this.seen.delete(address); this.seen.set(address, recent); // newest last, so the oldest address is dropped first when full
    if (this.seen.size > this.room) this.seen.delete(this.seen.keys().next().value!);
    return {ok: true, wait: 0};
  }
  /** A right password: the address starts over. */
  clear(address: string): void { this.seen.delete(address); }
}

/** The address a request came from: Vercel sets x-real-ip itself; x-forwarded-for's first entry otherwise. */
export function clientAddress(headers: Headers): string {
  return headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'okänd';
}
