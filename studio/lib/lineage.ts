// What builds on what: every take of the bank and the anchor pictures it was made from (its first and last picture), and
// whether the picture it was built on is still the one that holds in its role. Pure: no DOM, no network, no fs; the lab
// server (tools/media-roles.ts answer) traces, the page (Karta, Material) reads.
//
// One level only (Jakob 2026-11-18: "om jag väljer ett visst, kanske nytt ankare, så ska då såklart vissa andra klipp som
// bygger på det ankaret i så fall gråas"): a take is marked by its own first and last pictures. An anchor made from a
// keystone that no longer holds gets a chip of its own (builtOn), and its takes are not marked for that reason.
// The mark is information, not a verdict: the take keeps playing until he chooses otherwise.
import { entryKey, isStanding, ROLE_LABEL, type Entry, type JobPicture } from "./media.ts";

/** A take's first and last picture as the job file, an order or a derived take writes it. */
export type TakeLike = { id: string; clip?: string; frames?: [number, number]; first?: JobPicture; last?: JobPicture };
/** An order's picture (data/orders/<id>.json pictures[]): where it lies, its hash, and the register entry it was made from. */
export type OrderPicture = { path?: unknown; sha256?: unknown; from?: { entry?: unknown } | null };
/** Which entry a take's first and last picture is (an id of data/media-roles.json), or null where nothing says it. */
export type Trace = { first: string | null; last: string | null };
export type Lineage = Record<string, Trace>;

type Pick_ = Pick<Entry, "id" | "path" | "frame" | "pattern">;
/**
 * The entry each take was made from, side by side: a picture that is an entry itself (by path, or by one frame of a film),
 * an order's picture whose `from.entry` names one (by its path or its sha256), or an entry whose own file has the same sha256.
 */
export function traceTakes(entries: readonly (Pick_ & { sha256?: string | null })[], takes: readonly TakeLike[], orderPictures: readonly OrderPicture[] = []): Lineage {
  const byKey = new Map<string, string>(), bySha = new Map<string, string>(), ids = new Set(entries.map((e) => e.id));
  for (const e of entries) {
    const key = entryKey(e);
    if (key && !byKey.has(key)) byKey.set(key, e.id);
    if (e.sha256 && !bySha.has(e.sha256)) bySha.set(e.sha256, e.id);
  }
  const orderByPath = new Map<string, string>(), orderBySha = new Map<string, string>();
  for (const p of orderPictures) {
    const entry = typeof p.from?.entry === "string" && ids.has(p.from.entry) ? p.from.entry : null;
    if (!entry) continue;
    if (typeof p.path === "string") orderByPath.set(p.path, entry);
    if (typeof p.sha256 === "string") orderBySha.set(p.sha256, entry);
  }
  const one = (picture: JobPicture): string | null => {
    if (!picture) return null;
    if (picture.file && typeof picture.file.path === "string") {
      const path = picture.file.path, sha = typeof picture.file.sha256 === "string" ? picture.file.sha256 : null;
      return byKey.get(`file:${path}`) ?? orderByPath.get(path) ?? (sha ? orderBySha.get(sha) ?? bySha.get(sha) ?? null : null);
    }
    if (picture.frame && typeof picture.frame.video === "string" && Number.isInteger(picture.frame.index)) return byKey.get(`frame:${picture.frame.video}#${picture.frame.index as number}`) ?? null;
    return null;
  };
  const out: Lineage = {};
  for (const t of takes) out[t.id] = { first: one(t.first), last: one(t.last) };
  // A piece cut from a film without pictures of its own (a deal and its return cut from one take) starts on the film's first
  // picture when it starts on frame 0, and ends on the film's last when it ends where the last piece of that film ends.
  const whole = new Map<string, Trace>(), end = new Map<string, number>();
  for (const t of takes) if (t.clip && t.id === t.clip && out[t.id]) whole.set(t.clip, out[t.id]);
  for (const t of takes) if (t.clip && Array.isArray(t.frames)) end.set(t.clip, Math.max(end.get(t.clip) ?? 0, t.frames[1]));
  for (const t of takes) {
    const film = t.clip ? whole.get(t.clip) : undefined, own = out[t.id];
    if (!film || t.id === t.clip || !Array.isArray(t.frames)) continue;
    if (!own.first && t.frames[0] === 0) own.first = film.first;
    if (!own.last && t.frames[1] === end.get(t.clip!)) own.last = film.last;
  }
  return out;
}

type StateLike = Pick<Entry, "id" | "role" | "node" | "card" | "state" | "name">;
/** The pictures that share a place with `entry`: the same role, node and card (a keystone also the same posture). */
export const samePlace = <T extends StateLike>(entries: readonly T[], entry: T): T[] =>
  entries.filter((e) => e.role === entry.role && e.node === entry.node && e.card === entry.card && (entry.role !== "keystone" || isStanding(e) === isStanding(entry)));

/** The picture that holds now where `entry` stands, when that is another picture than `entry`; else null. */
export function holderInstead<T extends StateLike>(entries: readonly T[], entry: T): T | null {
  if (entry.state === "gäller" || entry.state === undefined) return null;
  return samePlace(entries, entry).find((e) => e.id !== entry.id && e.state === "gäller") ?? null;
}

/** The chip on a take built on a picture that no longer holds: "äldre ankare 2.2" (lower case, short). */
export const olderChip = (entry: Pick<Entry, "role">): string => `äldre ${ROLE_LABEL[entry.role].toLowerCase().replace(/^landningar$/, "landning")}`;

export type Older = { side: "first" | "last"; built: string; holds: string; chip: string };
/** Why a take is marked: each of its two pictures whose place another picture holds now. Empty when it is built on what holds (or cannot be traced). */
export function olderOf<T extends StateLike>(trace: Trace | undefined, entries: readonly T[]): Older[] {
  if (!trace) return [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: Older[] = [];
  for (const side of ["first", "last"] as const) {
    const built = trace[side] ? byId.get(trace[side]!) : undefined, holds = built ? holderInstead(entries, built) : null;
    if (built && holds) out.push({ side, built: built.id, holds: holds.id, chip: olderChip(built) });
  }
  return out;
}

/** The takes built on `entryId` (either side). */
export const builtOnPicture = (lineage: Lineage, entryId: string): string[] => Object.entries(lineage).filter(([, t]) => t.first === entryId || t.last === entryId).map(([id]) => id);

/**
 * What follows when `entry` is made the one that holds: the takes built on the picture that holds there today (or on any
 * other picture of the same place) become marked as older. The one line the dialog says before he confirms.
 */
export function consequenceOfHolding<T extends StateLike>(entries: readonly T[], entry: T, lineage: Lineage): { takes: string[]; line: string } {
  const others = samePlace(entries, entry).filter((e) => e.id !== entry.id).map((e) => e.id);
  const takes = [...new Set(others.flatMap((id) => builtOnPicture(lineage, id)))];
  const holder = samePlace(entries, entry).find((e) => e.id !== entry.id && e.state === "gäller");
  const line = takes.length === 0 ? "Inga klipp är byggda på de andra bilderna här; inget blir markerat."
    : `${takes.length} ${takes.length === 1 ? "klipp är byggt" : "klipp är byggda"} på ${holder ? "den bild som gäller nu" : "de andra bilderna här"} och blir markerade som äldre. De spelas som förut tills du väljer annat.`;
  return { takes, line };
}

/** The chip on an anchor made from a picture (a keystone) that no longer holds: "från äldre keystone"; null otherwise. */
export function fromOlderChip<T extends StateLike & { builtOn?: readonly string[] }>(entry: T, entries: readonly T[]): string | null {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const older = (entry.builtOn ?? []).map((id) => byId.get(id)).find((e) => e && holderInstead(entries, e));
  return older ? `från äldre ${ROLE_LABEL[older.role].toLowerCase()}` : null;
}
