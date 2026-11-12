// Typed reads from the lab server and its one write the studio makes: a review decision. Every error is an ApiError with
// a short Swedish message for the page, its HTTP status (0 when the server did not answer) and a kind to branch on.
import type { BankData, BankJob, DerivedTake, EditTake, Media, MotionRecord, Receipt } from "../../src/clip-graph.ts";
import type { PlacementPlan } from "../../src/placement-model.ts";
import type { RegisterRoom } from "../../src/scene3d-room.ts";
import type { SceneData } from "../../src/scene3d-view.ts";
import { labModule, labUrl } from "./lab.ts";
import { isSnapshot } from "./mode.ts";

// ── Shapes ──────────────────────────────────────────────────────────────────
/** GET /api/clip-bank (tools/preview.ts clipBank). It is a BankData: hand it to buildGraph as it is. */
export type ClipBankResponse = BankData & {
  schemaVersion: 1;
  readable: boolean;
  budget: { maximumCredits?: number } | null;
  jobs: BankJob[];
  derived: DerivedTake[];
  edits: EditTake[];
  motions: Record<string, MotionRecord>;
  receipts: Record<string, Receipt>;
  media: Record<string, Media>;
  /** '"<sha256>"' of each motions/<id>.json; sent back as If-Match with a decision. */
  revisions: Record<string, string>;
};

export type ProofFile = { name: string; path: string; kind: "video" | "image"; bytes: number };
export type Proof = {
  id: string;
  title: string | null;
  description: string | null;
  labels: Record<string, string> | null;
  verdicts: Record<string, string> | null;
  updatedAt: number | null;
  chapters: { label: string; frame: number }[] | null;
  fps: number;
  files: ProofFile[];
};
export type ProofList = { schemaVersion: 1; proofs: Proof[] };

export type Placements = { plan: PlacementPlan; revision: string };
export type SceneContract = SceneData["contract"];
export type Rooms = { rooms: RegisterRoom[]; problems: string[] };

/** The decisions the studio writes. MAIN = Primär, PENDING = Återställ (his word is taken away; the take waits again). */
export type Decision = "MAIN" | "ACCEPTED" | "VARIANT" | "REJECTED" | "PENDING";
export const NOTE_LIMIT = 1500;
export type DecisionResult = { id: string; review: NonNullable<MotionRecord["review"]>; revision: string };

// ── Errors ──────────────────────────────────────────────────────────────────
export type ApiErrorKind = "network" | "conflict" | "missing" | "precondition" | "refused" | "invalid" | "server";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  constructor(message: string, status: number, kind: ApiErrorKind) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

const kindOf = (status: number): ApiErrorKind =>
  status === 0 ? "network" : status === 409 ? "conflict" : status === 404 ? "missing" : status === 428 ? "precondition"
  : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid";

const DEFAULT_TEXT: Record<ApiErrorKind, string> = {
  network: isSnapshot ? "Kopian svarar inte. Ladda om sidan." : "Labbet svarar inte. Starta det med START.cmd.",
  conflict: "Posten har ändrats sedan den lästes.",
  missing: "Finns inte.",
  precondition: "Läs klippbanken innan du sparar.",
  refused: "Labbet tog inte emot det här.",
  invalid: "Labbet förstod inte frågan.",
  server: "Något gick fel i labbet.",
};

/** Any thrown value as an ApiError, for code that catches. */
export const asApiError = (error: unknown, what = "Det"): ApiError =>
  error instanceof ApiError ? error : new ApiError(`${what} gick inte: ${(error as Error)?.message ?? String(error)}`, 0, "server");

/** What the online copy answers to any attempt to save: Jakob's decisions are made in his lab only. */
export const SNAPSHOT_REFUSAL = "Bara Jakob dömer. Det här är en kopia: inget sparas här.";

async function send(path: string, what: string, init?: RequestInit): Promise<string> {
  // The online copy only reads: a request that could write is refused here, before anything leaves the page.
  if (isSnapshot && (init?.method ?? "GET").toUpperCase() !== "GET") throw new ApiError(SNAPSHOT_REFUSAL, 403, "refused");
  let response: Response;
  try {
    response = await fetch(labUrl(path), { cache: "no-store", ...init });
  } catch {
    throw new ApiError(`${what}: ${DEFAULT_TEXT.network}`, 0, "network");
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    let said = "";
    try {
      said = String(JSON.parse(text)?.error ?? "");
    } catch {}
    const kind = kindOf(response.status);
    throw new ApiError(said || `${what}: ${DEFAULT_TEXT[kind]}`, response.status, kind);
  }
  return text;
}

async function read<T>(path: string, what: string): Promise<T> {
  const text = await send(path, what);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(`${what} gick inte att läsa (inte JSON).`, 200, "server");
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────
/** The clip bank and its raw text (the bank hook compares the text to see whether anything changed). */
export async function readBank(): Promise<{ text: string; data: ClipBankResponse }> {
  const text = await send("api/clip-bank", "Klippbanken");
  try {
    return { text, data: JSON.parse(text) as ClipBankResponse };
  } catch {
    throw new ApiError("Klippbanken gick inte att läsa (inte JSON).", 200, "server");
  }
}
export const getBank = async (): Promise<ClipBankResponse> => (await readBank()).data;

/** Jakob's placement plan and its revision (GET /api/placements). */
export const getPlacements = (): Promise<Placements> => read<Placements>("api/placements", "Placeringsplanen");

/** The scene contract (data/scene-contract.json): camera, film and table, as createScene wants it. */
export const getContract = (): Promise<SceneContract> => read<SceneContract>("data/scene-contract.json", "Scenkontraktet");

/**
 * The rooms of the 3D scene (data/scene-rooms.json) read through the lab's own readRegister (src/scene3d-room.ts). That
 * module is loaded from the lab server at run time and brings three.js with it, so call this where the scene is used.
 */
export async function getRooms(): Promise<Rooms> {
  const json = await read<unknown>("data/scene-rooms.json", "Rumsregistret");
  const { readRegister } = await labModule<typeof import("../../src/scene3d-room.ts")>("scene3d-room").catch(() => {
    throw new ApiError("Rumsmodulen kunde inte läsas från labbet.", 0, "network");
  });
  return readRegister(json);
}

/** Every proof under assets/proofs/ (GET /api/proofs). */
export const getProofs = (): Promise<ProofList> => read<ProofList>("api/proofs", "Proven");

// ── The write ───────────────────────────────────────────────────────────────
/**
 * Saves one review decision for one take (PUT /api/clip-bank/review/<id>). revision is the take's revision from the bank
 * (take.revision); a 409 means the record changed since: read the bank again and let Jakob choose again. Only call this
 * from his click. In the online copy it always refuses (lib/mode.ts).
 */
export async function putDecision(id: string, decision: Decision, note: string, revision: string): Promise<DecisionResult> {
  if (isSnapshot) throw new ApiError(SNAPSHOT_REFUSAL, 403, "refused");
  if (note.length > NOTE_LIMIT) throw new ApiError(`Anteckningen får vara högst ${NOTE_LIMIT} tecken.`, 400, "invalid");
  if (!revision) throw new ApiError("Tagningen har ingen post i motions/ ännu, så beslutet kan inte sparas.", 428, "precondition");
  const text = await send(`api/clip-bank/review/${encodeURIComponent(id)}`, "Beslutet", {
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": revision },
    body: JSON.stringify({ decision, note }),
  });
  try {
    return JSON.parse(text) as DecisionResult;
  } catch {
    throw new ApiError("Beslutet sparades men svaret gick inte att läsa. Läs om klippbanken.", 200, "server");
  }
}

/** A film or picture of the lab as an address the page can use: "assets/motions/x/source.mp4" → "/assets/motions/x/source.mp4". */
export const mediaUrl = (path: string | null | undefined): string | null => (path ? labUrl(path) : null);
