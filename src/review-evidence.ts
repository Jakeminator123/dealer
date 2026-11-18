// Metadata shared by the receipt writer and the rebuildable index. No file or media reads here.
export type ReviewEvidence = {
  film: { path: string; sha256: string };
  files: { path: string; sha256: string }[];
};

const segment = /^[\p{L}\p{N}_.@() -]+$/u;
const secret = /^(?:\.env(?:\.|$)|private$|secrets?(?:[._-]|$)|credentials?(?:[._-]|$)|gh[pousr]_|github_pat_|sk-|AKIA)/i;

/** Only canonical paths inside this exact take; names follow the index's non-secret metadata contract. */
export function parseReviewEvidence(value: unknown, prefix: string): ReviewEvidence | null {
  const evidence = value as Partial<ReviewEvidence> | null;
  if (!evidence || !Array.isArray(evidence.files) || evidence.files.length < 1 || evidence.files.length > 32) return null;
  const fileOf = (raw: unknown): ReviewEvidence['film'] | null => {
    const file = raw as Partial<ReviewEvidence['film']> | null;
    if (!file || typeof file.path !== 'string' || file.path.length > 512 || !file.path.startsWith(prefix)
      || !file.path.split('/').every(part => segment.test(part) && part === part.trim() && !/\.$/.test(part)
        && !secret.test(part) && !/\.(?:pem|pfx|key)$/i.test(part))
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) return null;
    return {path: file.path, sha256: file.sha256};
  };
  const film = fileOf(evidence.film);
  if (!film) return null;
  const seen = new Set([film.path.toLowerCase()]), files: ReviewEvidence['files'] = [];
  for (const raw of evidence.files) {
    const file = fileOf(raw);
    if (!file || seen.has(file.path.toLowerCase())) return null;
    seen.add(file.path.toLowerCase());
    files.push(file);
  }
  return {film, files};
}
