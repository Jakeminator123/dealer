// The proof room (Prov): proof folders newest first and searchable, each file by its short name with its verdict, films
// in the order the proof names them, the picture a card shows, and the chapters on a film. Pure: no DOM, no network;
// tests in studio/tests/proofs.test.ts. A file's verdict and the split of its label are lib/verdict.ts's.
import type { Proof, ProofFile } from "./api.ts";
import { formatDay } from "./names.ts";
import { proofLabel, proofVerdict, splitLabel, type ProofVerdict } from "./verdict.ts";

/** A proof's title as it is shown: its own, else its folder name. */
export const proofTitle = (proof: Pick<Proof, "id" | "title">): string => (proof.title ?? "").trim() || proof.id;

/** Newest first: the proof whose files changed last; the folder name on a tie. */
export function sortProofs<T extends Pick<Proof, "id" | "updatedAt">>(proofs: readonly T[]): T[] {
  return [...proofs].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id));
}

/** Lower case without accents, so "vandning" finds "vändning". */
export const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Every word of the query is in the title, the folder name, the description or a file's label. */
export function matchProof(proof: Pick<Proof, "id" | "title" | "description" | "labels">, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold([proof.title ?? "", proof.id, proof.description ?? "", ...Object.values(proof.labels ?? {})].join(" "));
  return words.every((w) => text.includes(w));
}

/** One file as the room shows it: its short name, the rest of its label (shown on demand) and its verdict chip. */
export type ProofEntry = { file: ProofFile; label: string; name: string; rest: string; verdict: ProofVerdict | null };

/** The rest of a label without the parentheses around all of it: "(exakt, 4 s)" → "exakt, 4 s". */
export const unwrap = (rest: string): string => {
  const t = rest.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return t;
  const inner = t.slice(1, -1);
  // Only when the first parenthesis closes at the very end: "(a) och (b)" stays as it is.
  let depth = 0;
  for (const c of inner) {
    if (c === "(") depth++;
    else if (c === ")" && --depth < 0) return t;
  }
  return depth === 0 ? inner.trim() : t;
};

const entry = (proof: Pick<Proof, "labels" | "verdicts">, file: ProofFile): ProofEntry => {
  const label = proofLabel(proof, file.name);
  const { name, rest } = splitLabel(label);
  return { file, label, name, rest: unwrap(rest), verdict: proofVerdict(proof, file.name) };
};

/** Films in the order the proof's labels name them (unnamed ones after, as listed); pictures as listed. */
export function proofFiles(proof: Pick<Proof, "labels" | "verdicts" | "files">): { films: ProofEntry[]; pictures: ProofEntry[] } {
  const order = Object.keys(proof.labels ?? {});
  const rank = (name: string) => order.indexOf(name) + 1 || order.length + 1;
  const films = proof.files.filter((f) => f.kind === "video").map((f, i) => ({ f, i })).sort((a, b) => rank(a.f.name) - rank(b.f.name) || a.i - b.i);
  return {
    films: films.map(({ f }) => entry(proof, f)),
    pictures: proof.files.filter((f) => f.kind === "image").map((f) => entry(proof, f)),
  };
}

/** "2 filmer · 7 bilder". */
export function countLine(proof: Pick<Proof, "files">): string {
  const films = proof.files.filter((f) => f.kind === "video").length;
  const pictures = proof.files.filter((f) => f.kind === "image").length;
  return [films ? `${films} ${films === 1 ? "film" : "filmer"}` : "", pictures ? `${pictures} ${pictures === 1 ? "bild" : "bilder"}` : ""].filter(Boolean).join(" · ") || "Inga filer";
}

/** The day a proof last changed: "12 nov". */
export const proofDay = (proof: Pick<Proof, "updatedAt">): string | null => formatDay(proof.updatedAt);

/** How many of its files have each verdict (files without one are not counted). */
export function verdictTally(proof: Pick<Proof, "labels" | "verdicts" | "files">): Record<ProofVerdict, number> {
  const tally: Record<ProofVerdict, number> = { ok: 0, remarks: 0, failed: 0, unreviewed: 0 };
  for (const f of proof.files) {
    const v = proofVerdict(proof, f.name);
    if (v) tally[v]++;
  }
  return tally;
}

/** The picture a proof's card shows: its first picture, else a frame of its first film (a second in, past any black start). */
export function coverOf(proof: Pick<Proof, "labels" | "verdicts" | "files" | "fps">): { kind: "image"; path: string } | { kind: "video"; path: string; frame: number } | null {
  const { films, pictures } = proofFiles(proof);
  if (pictures.length) return { kind: "image", path: pictures[0].file.path };
  if (films.length) return { kind: "video", path: films[0].file.path, frame: Math.round(proof.fps || 30) };
  return null;
}

export type Chapter = { label: string; frame: number };

/** The proof's chapters that are usable on a film of `frames` frames (all valid ones while the length is unknown), in order. */
export function chaptersOf(proof: Pick<Proof, "chapters">, frames?: number | null): Chapter[] {
  return (proof.chapters ?? [])
    .filter((c) => c && typeof c.label === "string" && Number.isSafeInteger(c.frame) && c.frame >= 0 && (!frames || c.frame < frames))
    .sort((a, b) => a.frame - b.frame);
}

/** The chapter a frame is in: the last one that starts at or before it. */
export function chapterAt(chapters: readonly Chapter[], frame: number): Chapter | null {
  let found: Chapter | null = null;
  for (const c of chapters) if (c.frame <= frame) found = c;
  return found;
}

/** Bytes in Swedish: "1,2 MB", "64 kB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** What `?fil=` names among a proof's files (proofFiles): a film to play or a picture to open; else the first film. */
export function pickFile(files: { films: readonly ProofEntry[]; pictures: readonly ProofEntry[] }, name: string | null): { film: ProofEntry | null; picture: ProofEntry | null; index: number | null } {
  const at = name ? files.pictures.findIndex((p) => p.file.name === name) : -1;
  const film = (name ? files.films.find((f) => f.file.name === name) : undefined) ?? files.films[0] ?? null;
  return { film, picture: at >= 0 ? files.pictures[at] : null, index: at >= 0 ? at : null };
}
