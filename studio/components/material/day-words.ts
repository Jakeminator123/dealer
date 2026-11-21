// The register's own words as Material shows them: each ISO day written as he says it, "2026-11-21" → "21 nov". The day is
// read at noon, so that it is the same day in every time zone (a bare "2026-11-21" is midnight in UTC).
import { formatDay } from "../../lib/names.ts";

export const dayWords = (text: string): string => text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => formatDay(`${d}T12:00`) ?? d);

/** Gjord ur as he reads it: a command, a path or a receipt's file name goes; the words around it stay (the whole line waits under the pointer). */
export const fromWords = (from: string): string => {
  if (/^tools\/speech\.ts\b/.test(from)) {
    const voice = /\(([A-ZÅÄÖ][a-zåäö]+)\)$/.exec(from)?.[1];
    return voice ? `talverktyget, rösten ${voice}` : "talverktyget";
  }
  const words = from
    .replace(/\s*\([^()]*(?:[A-Za-z]:\/|\.(?:png|jpe?g|webp|mp4|json)\b)[^()]*\)/g, "")
    .replace(/[;,]\s*(?:se\s+)?[^;,]*\b(?:receipt|renderkvitto)\.json.*$/, "")
    .replace(/^(?:dealer3d|3d-dealer): \S+\.(?:json|mp4)$/, "3D-dealern")
    .replace(/^tools\/\S+$/, "ett verktyg i labbet")
    .replace(/^assets\/\S+$/, "en fil i labbet")
    .trim();
  return words || from;
};
