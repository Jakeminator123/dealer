// The few things the panel keeps in the browser, each behind try/catch (a private window or blocked storage only makes
// the panel forget): who the person is, the panel's width and level, the welcome seen, the answers seen, the conversation
// of this tab.
export const KEYS = {
  name: "studio.vem",
  width: "studio.fraga.bredd",
  open: "studio.fraga.oppen",
  level: "studio.fraga.niva",
  welcome: "studio.valkommen.1",
  seen: "studio.onskemal.sett",
  thread: "studio.fraga.trad",
} as const;

type Area = "local" | "session";
const area = (where: Area): Storage | null => {
  try {
    return where === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export function readText(key: string, where: Area = "local"): string | null {
  try {
    return area(where)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string | null, where: Area = "local"): void {
  try {
    const store = area(where);
    if (!store) return;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    /* full or closed: forgotten on reload */
  }
}

export function readJsonValue<T>(key: string, fallback: T, where: Area = "local"): T {
  const raw = readText(key, where);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const writeJsonValue = (key: string, value: unknown, where: Area = "local") => writeText(key, JSON.stringify(value), where);
