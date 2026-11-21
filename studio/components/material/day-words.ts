// The register's own words as Material shows them: each ISO day written as he says it, "2026-11-21" → "21 nov". The day is
// read at noon, so that it is the same day in every time zone (a bare "2026-11-21" is midnight in UTC).
import { formatDay } from "../../lib/names.ts";

export const dayWords = (text: string): string => text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => formatDay(`${d}T12:00`) ?? d);
