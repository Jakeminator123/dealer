// The request inbox (Jakob 2026-11-12: "just a JSON or an .md or something simple"): each request is one JSON file,
// onskemal/o-<n>.json, with its screenshot beside it as onskemal/o-<n>.png. The visitor's own words (text) are kept exactly
// as written. Status and answer are set only by the owner's tool (tools/onskemal.ts), with the admin key. Pure but for the
// store it is handed.
import {readJson, updateJson, type Store} from './bot-store.ts';
import type {View} from './bot-prompt.ts';

export const TYPES = ['fel', 'onskemal', 'fraga', 'ide'] as const;
export const STATUSES = ['ny', 'sedd', 'planerad', 'pagar', 'klar', 'avbojd', 'fraga_tillbaka'] as const;
export type RequestType = typeof TYPES[number];
export type RequestStatus = typeof STATUSES[number];

export type Post = {
  id: string; skapad: string; vem: string; typ: RequestType; rubrik: string; text: string; vy: View | null;
  sammanfattning: string; forslag: string; harBild: boolean; status: RequestStatus; svar: string; andrad: string;
};

/** "Ö-12" (also "ö-12", "O-12", "o-12", or the URL's "%C3%96-12") to its number, or null. */
export function numberOf(id: string): number | null {
  let text = id;
  try { text = decodeURIComponent(id); } catch { /* as given */ }
  const m = /^(?:Ö|ö|O|o)-(\d{1,6})$/.exec(text.normalize('NFC'));
  return m ? Number(m[1]) : null;
}
export const idOf = (n: number) => `Ö-${n}`;
export const jsonKey = (n: number) => `onskemal/o-${n}.json`;
export const pngKey = (n: number) => `onskemal/o-${n}.png`;

// ── Checking what a visitor sends ───────────────────────────────────────────
export type Check<T> = {ok: true; value: T} | {ok: false; text: string};
const isText = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length <= max && v.trim().length >= min;

/** A view as the panel sends it ({namn, adress, val}), or null; anything else is refused. */
export function checkView(v: unknown): Check<View | null> {
  if (v === null || v === undefined) return {ok: true, value: null};
  const o = v as Record<string, unknown>;
  if (typeof o !== 'object' || Array.isArray(o) || !isText(o.namn, 80) || !isText(o.adress, 400)) return {ok: false, text: 'Vyn har fel form.'};
  const val: Record<string, string> = {};
  const given = o.val === undefined || o.val === null ? {} : o.val;
  if (typeof given !== 'object' || Array.isArray(given)) return {ok: false, text: 'Vyns val har fel form.'};
  const entries = Object.entries(given as Record<string, unknown>);
  if (entries.length > 30) return {ok: false, text: 'Vyn har för många val.'};
  for (const [k, value] of entries) {
    if (!isText(k, 60, 1) || !isText(value, 300)) return {ok: false, text: 'Ett val i vyn har fel form.'};
    val[k] = value;
  }
  return {ok: true, value: {namn: o.namn as string, adress: o.adress as string, val}};
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_IMAGE = 1_600_000;
/** A screenshot as the panel sends it (a PNG data URL of at most about 1,5 MB), its bytes checked to be a PNG. */
export function checkImage(v: unknown): Check<{url: string; bytes: Uint8Array} | null> {
  if (v === null || v === undefined) return {ok: true, value: null};
  if (typeof v !== 'string') return {ok: false, text: 'Skärmbilden har fel form.'};
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return {ok: false, text: 'Skärmbilden ska vara en PNG.'};
  if (m[1].length > Math.ceil(MAX_IMAGE / 3) * 4) return {ok: false, text: 'Skärmbilden är för stor (högst cirka 1,5 MB).'};
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0)); } catch { return {ok: false, text: 'Skärmbilden går inte att läsa.'}; }
  if (bytes.length > MAX_IMAGE || bytes.length < 60 || PNG.some((b, i) => bytes[i] !== b)) return {ok: false, text: 'Skärmbilden är inte en PNG.'};
  return {ok: true, value: {url: v, bytes}};
}

export type NewRequest = {vem: string; typ: RequestType; rubrik: string; text: string; vy: View | null; sammanfattning: string; forslag: string; bild: {url: string; bytes: Uint8Array} | null};

/** POST /api/onskemal's body, checked. text is kept exactly as written; the others are trimmed. */
export function checkNew(body: unknown): Check<NewRequest> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b !== 'object' || Array.isArray(b)) return {ok: false, text: 'Önskemålet har fel form.'};
  if (!TYPES.includes(b.typ as RequestType)) return {ok: false, text: `typ ska vara ${TYPES.join(', ')}.`};
  if (!isText(b.rubrik, 140, 1)) return {ok: false, text: 'Rubriken saknas eller är för lång (högst 140 tecken).'};
  if (!isText(b.text ?? '', 8000)) return {ok: false, text: 'Texten är för lång (högst 8 000 tecken).'};
  if (!isText(b.vem ?? '', 80) || !isText(b.sammanfattning ?? '', 2000) || !isText(b.forslag ?? '', 4000)) return {ok: false, text: 'Ett fält är för långt.'};
  const vy = checkView(b.vy); if (!vy.ok) return vy;
  const bild = checkImage(b.bild); if (!bild.ok) return bild;
  if (!(b.text as string ?? '').trim() && !(b.rubrik as string).trim()) return {ok: false, text: 'Önskemålet är tomt.'};
  return {ok: true, value: {vem: ((b.vem as string) ?? '').trim() || 'okänd', typ: b.typ as RequestType, rubrik: (b.rubrik as string).trim(), text: (b.text as string) ?? '',
    vy: vy.value, sammanfattning: ((b.sammanfattning as string) ?? '').trim(), forslag: ((b.forslag as string) ?? '').trim(), bild: bild.value}};
}

// ── The store ───────────────────────────────────────────────────────────────
/** Every request, newest first. Files that do not read as a request are skipped. */
export async function listPosts(store: Store): Promise<Post[]> {
  const numbers = (await store.list('onskemal/')).map(k => /^onskemal\/o-(\d{1,6})\.json$/.exec(k)?.[1]).filter((n): n is string => !!n).map(Number);
  const posts = await Promise.all(numbers.map(async n => (await readJson<Post>(store, jsonKey(n)).catch(() => null))?.value ?? null));
  return posts.filter((p): p is Post => !!p && typeof p.id === 'string').sort((a, b) => (numberOf(b.id) ?? 0) - (numberOf(a.id) ?? 0));
}

/** A new request under the next free number: its JSON is created first (never over another), then its picture. */
export async function createPost(store: Store, request: NewRequest, now: Date): Promise<Post> {
  const taken = (await store.list('onskemal/')).map(k => Number(/^onskemal\/o-(\d{1,6})\.json$/.exec(k)?.[1] ?? 0));
  let n = Math.max(0, ...taken) + 1;
  const stamp = now.toISOString();
  for (let tries = 0; tries < 12; tries++, n++) {
    const post: Post = {id: idOf(n), skapad: stamp, vem: request.vem, typ: request.typ, rubrik: request.rubrik, text: request.text, vy: request.vy,
      sammanfattning: request.sammanfattning, forslag: request.forslag, harBild: !!request.bild, status: 'ny', svar: '', andrad: stamp};
    const written = await store.put(jsonKey(n), JSON.stringify(post, null, 1), 'application/json', {create: true});
    if (!written.ok) continue;
    if (request.bild) {
      try { await store.put(pngKey(n), request.bild.bytes, 'image/png'); } catch {
        return updateJson<Post>(store, jsonKey(n), current => ({...(current ?? post), harBild: false}));
      }
    }
    return post;
  }
  throw Error('Inget ledigt nummer för önskemålet.');
}

/** Status and answer of one request (the owner's tool only). null when there is no such request. */
export async function patchPost(store: Store, n: number, change: {status: RequestStatus; svar?: string}, now: Date): Promise<Post | null> {
  if (!await store.get(jsonKey(n))) return null;
  return updateJson<Post>(store, jsonKey(n), current => ({...current!, status: change.status, svar: change.svar ?? current!.svar, andrad: now.toISOString()}));
}
