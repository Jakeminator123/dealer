// Beslut (/beslut/): what waits for Jakob (data/decisions.json, read and written through tools/decision-store.ts) and his
// answers. The view's calls to the lab server and the pure words and order it shows. Only in the lab: the online copy reads
// and writes nothing here (app/beslut/page.tsx shows a word instead, the rail leaves the view out). Tests:
// studio/tests/decisions.test.ts.
import type { Answer, Chip, Kind } from "../../tools/decision-register.ts";
import type { DecisionsAnswer, Saved, Shown, ShownDecision } from "../../tools/decision-store.ts";
import { ApiError, SNAPSHOT_REFUSAL } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot, swedishMoment } from "./mode.ts";

export type { Answer, Chip, Kind, DecisionsAnswer, Saved, Shown, ShownDecision };
/** As tools/decision-register.ts NOTE_LIMIT: the longest note the lab takes. */
export const NOTE_LIMIT = 1000;

// ── Calls ───────────────────────────────────────────────────────────────────
const kind = (status: number) => (status === 409 ? "conflict" : status === 404 ? "missing" : status === 428 ? "precondition" : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid");
const NOT_UP = "Labbet svarar inte. Starta det med START.cmd.";

async function errorOf(response: Response, what: string): Promise<ApiError> {
  let said = "";
  try {
    said = String((await response.json())?.error ?? "");
  } catch {}
  return new ApiError(said || `${what} gick inte (${response.status}).`, response.status, kind(response.status));
}

/** Every entry of the register, the most urgent first (GET /api/decisions). */
export async function getDecisions(): Promise<DecisionsAnswer> {
  if (isSnapshot) throw new ApiError("Beslut finns bara i labbet.", 403, "refused");
  let response: Response;
  try {
    response = await fetch(labUrl("api/decisions"), { cache: "no-store" });
  } catch {
    throw new ApiError(NOT_UP, 0, "network");
  }
  if (response.status === 404) throw new ApiError("Labbet känner inte vyn Beslut än: labbservern behöver startas om.", 404, "missing");
  if (!response.ok) throw await errorOf(response, "Frågorna");
  return (await response.json()) as DecisionsAnswer;
}

/** Jakob's answer to one entry, on his press only: a chip's value, or null to take the answer back (PUT /api/decisions/<id>). */
export async function putAnswer(id: string, value: string | null, note: string, revision: string): Promise<Saved> {
  if (isSnapshot) throw new ApiError(SNAPSHOT_REFUSAL, 403, "refused");
  if (note.length > NOTE_LIMIT) throw new ApiError(`Anteckningen får vara högst ${NOTE_LIMIT} tecken.`, 400, "invalid");
  let response: Response;
  try {
    response = await fetch(labUrl(`api/decisions/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": revision },
      body: JSON.stringify({ value, note }),
    });
  } catch {
    throw new ApiError(NOT_UP, 0, "network");
  }
  if (!response.ok) throw await errorOf(response, "Svaret");
  return (await response.json()) as Saved;
}

// ── Order and words ─────────────────────────────────────────────────────────
type Entry = Pick<ShownDecision, "id" | "answer">;

/** What waits, in the register's order (the most urgent first), and what is answered, the latest answer first. */
export function splitDecisions<T extends Entry>(list: readonly T[]): { waiting: T[]; answered: T[] } {
  const waiting = list.filter((d) => !d.answer);
  const answered = list.filter((d) => !!d.answer).sort((a, b) => b.answer!.at.localeCompare(a.answer!.at));
  return { waiting, answered };
}

export const waitingCount = (list: readonly Entry[]): number => list.filter((d) => !d.answer).length;

/** The list with one entry replaced by what the lab answered after a write. */
export const replaceEntry = <T extends Entry>(list: readonly T[], next: T): T[] => list.map((d) => (d.id === next.id ? next : d));

export const KIND_WORD: Record<Kind, string> = { beslut: "Beslut", gora: "Att göra" };

/** The view's header: "Inget väntar på dig", "1 väntar på dig". */
export const waitingLine = (n: number): string => (n === 0 ? "Inget väntar på dig" : `${n} väntar på dig`);

/** The start page's entry: "1 beslut väntar", "5 beslut väntar". */
export const entryLine = (n: number): string => `${n} beslut väntar`;

/** The button for an entry's page of the lab: the game, a view of the studio, or any other page. */
export function openWord(page: string): string {
  if (/^game\.html(?:\?|$)/.test(page)) return "Öppna spelet";
  if (/^studio(?:\/|$)/.test(page)) return "Öppna i studion";
  return "Öppna sidan";
}

/** The address of an entry's page, from the lab server's root. */
export const pageHref = (page: string): string => labUrl(page);

/** An outside address as a link: https:// in front when the register leaves it out. */
export const linkHref = (link: string): string => (/^https:\/\//.test(link) ? link : `https://${link}`);

/** The chosen chip's text, or null when nothing is answered (or the answer names no chip). */
export const chosenLabel = (d: Pick<ShownDecision, "answer" | "chips">): string | null => (d.answer ? (d.chips.find((c) => c.value === d.answer!.value)?.label ?? null) : null);

/** "17 nov 14:05": when he answered, in Swedish time. */
export const answeredAt = (iso: string): string => swedishMoment(iso) ?? iso;

/** "17 nov": the day an entry was asked. */
export function askedDay(day: string): string {
  const moment = swedishMoment(`${day}T12:00:00Z`);
  return moment ? moment.replace(/\s\d{2}:\d{2}$/, "") : day;
}

/** Where a proof opens in the Prov room, on the file the card shows. */
export function proofHref(proof: string, file?: string | null): string {
  const query = new URLSearchParams({ prov: proof });
  if (file) query.set("fil", file);
  return `/prov/?${query.toString()}`;
}
