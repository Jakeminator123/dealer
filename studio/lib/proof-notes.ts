// Jakob's own word on the proofs (data/proof-notes.json through tools/proof-notes-store.ts): the calls to the lab server and
// the pure words Granska's part Prov shows. Only his click writes (putProofNote); the online copy reads what he has said
// (a frozen answer) and writes nothing. Tests: studio/tests/proof-notes.test.ts.
import type { Choice, Note } from "../../tools/proof-notes-register.ts";
import type { NotesAnswer, SavedNote, ShownNote } from "../../tools/proof-notes-store.ts";
import { ApiError, SNAPSHOT_REFUSAL } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot } from "./mode.ts";

export type { Choice, Note, NotesAnswer, SavedNote, ShownNote };
/** As tools/proof-notes-register.ts TEXT_LIMIT: the longest text the lab takes. */
export const TEXT_LIMIT = 1000;
export const CHOICE_WORD: Record<Choice, string> = { bra: "Bra", "inte-bra": "Inte bra" };

const NOT_UP = "Labbet svarar inte. Starta det med START.cmd.";
const kind = (status: number) => (status === 409 ? "conflict" : status === 404 ? "missing" : status === 428 ? "precondition" : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid");

async function errorOf(response: Response, what: string): Promise<ApiError> {
  let said = "";
  try {
    said = String((await response.json())?.error ?? "");
  } catch {}
  return new ApiError(said || `${what} gick inte (${response.status}).`, response.status, kind(response.status));
}

/** Every note (GET /api/proof-notes). Where the route is missing (a lab not restarted, a copy without notes): none. */
export async function getProofNotes(): Promise<NotesAnswer> {
  let response: Response;
  try {
    response = await fetch(labUrl("api/proof-notes"), { cache: "no-store" });
  } catch {
    throw new ApiError(NOT_UP, 0, "network");
  }
  if (response.status === 404) return { schemaVersion: 1, newRevision: "", notes: [] };
  if (!response.ok) throw await errorOf(response, "Dina ord");
  return (await response.json()) as NotesAnswer;
}

/** His word on a file (or the proof, file null), on his click only: a choice or none, a text or none; both none take it away. */
export async function putProofNote(proof: string, file: string | null, choice: Choice | null, text: string, revision: string): Promise<SavedNote> {
  if (isSnapshot) throw new ApiError(SNAPSHOT_REFUSAL, 403, "refused");
  if (text.length > TEXT_LIMIT) throw new ApiError(`Texten får vara högst ${TEXT_LIMIT} tecken.`, 400, "invalid");
  let response: Response;
  try {
    response = await fetch(labUrl("api/proof-notes"), {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": revision },
      body: JSON.stringify({ proof, file, choice, text }),
    });
  } catch {
    throw new ApiError(NOT_UP, 0, "network");
  }
  if (!response.ok) throw await errorOf(response, "Ordet");
  return (await response.json()) as SavedNote;
}

// ── Pure ────────────────────────────────────────────────────────────────────
/** The key of a note's place: the proof and the file, or the proof alone. */
export const placeKey = (proof: string, file: string | null): string => `${proof}/${file ?? ""}`;

/** The notes by place. */
export const notesByPlace = (notes: readonly ShownNote[]): Map<string, ShownNote> => new Map(notes.map((n) => [placeKey(n.proof, n.file), n]));

/** The notes with one place's note replaced (or taken out, note null) after a save. */
export function replaceNote(notes: readonly ShownNote[], saved: SavedNote): ShownNote[] {
  const key = placeKey(saved.proof, saved.file);
  const rest = notes.filter((n) => placeKey(n.proof, n.file) !== key);
  return saved.note ? [...rest, saved.note] : rest;
}

/** Who said it: "Du" in the lab, where the one looking is Jakob; "Jakob" in the copy. */
export const speaker = (snapshot: boolean): string => (snapshot ? "Jakob" : "Du");

/** His word in one line: "Bra · för mörk", "Inte bra", "för mörk". */
export const noteWords = (note: Pick<Note, "choice" | "text">): string => [note.choice ? CHOICE_WORD[note.choice] : null, note.text || null].filter(Boolean).join(" · ");

/** How many of a proof's places he has said something about (a card's count). */
export const notesOn = (notes: readonly Pick<Note, "proof">[], proof: string): number => notes.filter((n) => n.proof === proof).length;
