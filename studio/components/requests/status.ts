// Words, signs and colours for a request's status and kind, and the counts the rail and the list need. Pure; tests in
// studio/tests/requests-status.test.ts. A status chip has colour AND sign, never colour alone (as the verdict chips).
import type { Post, RequestKind, RequestStatus } from "../../lib/bot-client.ts";

export type Tone = "wait" | "variant" | "ok" | "bad" | "remark" | "neutral";

export const STATUS: Record<RequestStatus, { label: string; sign: string; tone: Tone; hint: string }> = {
  ny: { label: "Ny", sign: "○", tone: "wait", hint: "Jakob har inte sett den ännu" },
  sedd: { label: "Sedd", sign: "◉", tone: "neutral", hint: "Jakob har sett den" },
  planerad: { label: "Planerad", sign: "◇", tone: "variant", hint: "Jakob ska göra det" },
  pagar: { label: "Pågår", sign: "◐", tone: "variant", hint: "Jakob arbetar med det" },
  fraga_tillbaka: { label: "Fråga tillbaka", sign: "?", tone: "remark", hint: "Jakob undrar något; läs hans svar" },
  klar: { label: "Klar", sign: "✓", tone: "ok", hint: "Gjort" },
  avbojd: { label: "Avböjd", sign: "✕", tone: "bad", hint: "Jakob gör inte detta; läs varför" },
};
export const STATUS_ORDER: readonly RequestStatus[] = ["ny", "sedd", "fraga_tillbaka", "planerad", "pagar", "klar", "avbojd"];

export const KIND: Record<RequestKind, { label: string; hint: string }> = {
  fel: { label: "Fel", hint: "Något ser fel ut eller fungerar inte" },
  onskemal: { label: "Önskemål", hint: "Något du vill ha" },
  fraga: { label: "Fråga", hint: "Något du undrar" },
  ide: { label: "Idé", hint: "En tanke att pröva" },
};
export const KIND_ORDER: readonly RequestKind[] = ["onskemal", "fel", "fraga", "ide"];

/** Seen answers: each request's id and the change ("andrad") that was on screen when it was read. */
export type Seen = Record<string, string>;

/** Has the request an answer from Jakob that this browser has not shown yet? */
export const unseenAnswer = (post: Pick<Post, "id" | "svar" | "andrad">, seen: Seen): boolean => !!post.svar && seen[post.id] !== post.andrad;

export const countUnseen = (posts: readonly Post[], seen: Seen): number => posts.filter((p) => unseenAnswer(p, seen)).length;

/** Every answer on screen as seen; requests no longer listed are forgotten. */
export function markSeen(posts: readonly Post[], seen: Seen): Seen {
  const next: Seen = {};
  for (const post of posts) {
    if (post.svar) next[post.id] = post.andrad;
    else if (seen[post.id]) next[post.id] = seen[post.id];
  }
  return next;
}

const time = (value: string) => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
};

/** Newest first, by when it was written. */
export const newestFirst = (posts: readonly Post[]): Post[] => [...posts].sort((a, b) => time(b.skapad) - time(a.skapad) || b.id.localeCompare(a.id));

export type Filter = "alla" | RequestStatus;

/** The filters to show: all, then each status that has requests, with counts. */
export function filters(posts: readonly Post[]): { value: Filter; label: string; count: number }[] {
  const out: { value: Filter; label: string; count: number }[] = [{ value: "alla", label: "Alla", count: posts.length }];
  for (const status of STATUS_ORDER) {
    const count = posts.filter((p) => p.status === status).length;
    if (count) out.push({ value: status, label: STATUS[status].label, count });
  }
  return out;
}

export const applyFilter = (posts: readonly Post[], filter: Filter): Post[] => (filter === "alla" ? [...posts] : posts.filter((p) => p.status === filter));

/** A heading for a request that has none: the start of his own words. */
export function headingFrom(text: string, max = 70): string {
  const line = text.trim().split(/\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
