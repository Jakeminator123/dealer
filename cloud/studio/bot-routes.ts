// The addresses of the bot and the request inbox (cloud/studio/bot.ts) on the online copy, for the lock's one hook in
// gate.ts: once the cookie is good every method reaches them (the function allows its own), and the owner's tool reaches the
// inbox with its admin key instead of the cookie. The function checks that key itself; the gate only lets the call through.

/** POST /api/bot, POST /api/utkast, and /api/onskemal with its posts (/api/onskemal/<id>) and their pictures (…/bild). */
export const BOT_PATH = /^\/api\/(?:bot|utkast)\/?$|^\/api\/onskemal(?:\/[^/]+(?:\/bild)?)?\/?$/;
const INBOX_PATH = /^\/api\/onskemal(?:\/[^/]+(?:\/bild)?)?\/?$/;

export const isBotPath = (path: string): boolean => BOT_PATH.test(path);

/** A call of the owner's tool: the inbox, with "Authorization: Bearer <a key of at least 32 characters>". */
export const isAdminCall = (path: string, headers: Headers): boolean =>
  INBOX_PATH.test(path) && /^Bearer [\x21-\x7e]{32,512}$/.test(headers.get('authorization') ?? '');
