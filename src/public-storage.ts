import { validatePlan } from './placement-model.ts';
import type { PlacementPlan } from './placement-model.ts';

export type PublicSnapshot = { plan: PlacementPlan; revision: string };
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const storageKey = 'dealer-public-placements-v1';

// The public site has no shared write endpoint. Each browser owns its draft.
export function publicStore(storage: StoragePort, initial: () => Promise<PublicSnapshot>,
  exclusive: <T>(action: () => Promise<T>) => Promise<T>, nextRevision: () => string) {
  async function load(): Promise<PublicSnapshot> {
    const saved = storage.getItem(storageKey);
    const snapshot = saved === null ? await initial() : JSON.parse(saved);
    validatePlan(snapshot.plan);
    if (typeof snapshot.revision !== 'string') throw Error('Ogiltigt sparat utkast.');
    const copy = structuredClone(snapshot);
    if (saved === null) copy.plan.updatedAt = null;
    return copy;
  }
  async function save(value: unknown, expected: string | null) {
    validatePlan(value);
    return exclusive(async () => {
      const before = await load();
      if (!expected) return { status: 428, body: { error: 'Läs placeringarna innan du sparar.' } };
      if (expected !== before.revision) return { status: 409, body: { error: 'En annan flik har sparat. Exportera ditt utkast och läs sedan in senaste.' } };
      const plan = structuredClone(value);
      plan.updatedAt = new Date().toISOString();
      const snapshot = { plan, revision: nextRevision() };
      storage.setItem(storageKey, JSON.stringify(snapshot));
      return { status: 200, body: snapshot };
    });
  }
  return { load, save };
}

let store: ReturnType<typeof publicStore> | undefined;
let initial: Promise<PublicSnapshot> | undefined;
function browserStore() {
  if (!store) store = publicStore(localStorage, () => initial ??= fetch('/data/default-plan.json').then(async response => {
    if (!response.ok) throw Error('Startplaceringarna kunde inte läsas.');
    return response.json();
  }), action => {
    if (!navigator.locks) throw Error('Säker sparning stöds inte i den här webbläsaren. Exportera placeringsfilen i stället.');
    return navigator.locks.request(storageKey, action);
  }, () => crypto.randomUUID());
  return store;
}

export async function publicFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const pathname = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).pathname;
  if (pathname === '/api/library') return fetch('/data/public-library.json');
  if (pathname !== '/api/placements') return fetch(input, init);
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  try {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return json(await browserStore().load());
    if (method !== 'PUT') return json({ error: 'Metoden stöds inte.' }, 405);
    const result = await browserStore().save(JSON.parse(String(init?.body ?? '')), new Headers(init?.headers).get('if-match'));
    return json(result.body, result.status);
  } catch {
    return json({ error: 'Webbläsarens utkast kunde inte läsas eller sparas. Exportera placeringsfilen för att behålla ditt arbete.' }, 400);
  }
}
