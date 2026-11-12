// The two ways the studio is built. "lab" (the default): the local studio, served by the lab server on 127.0.0.1:4319,
// where Jakob's clicks are saved. "snapshot": the locked, read-only copy on the internet (tools/build-studio-snapshot.ts
// builds it with NEXT_PUBLIC_DEALER_MODE=snapshot through scripts/build.mjs --snapshot). The mode is fixed in the bundle
// when it is built: Next replaces process.env.NEXT_PUBLIC_DEALER_MODE with its value, so a copy can never become a lab.
// In snapshot mode nothing writes, the bank is read once, the lab's tab stream is not loaded, and a banner says so.

export type Mode = "lab" | "snapshot";
export const MODE: Mode = process.env.NEXT_PUBLIC_DEALER_MODE === "snapshot" ? "snapshot" : "lab";
export const isSnapshot = MODE === "snapshot";

/** /meta.json of a copy (tools/build-studio-snapshot.ts): when it was made, from which commit, and what it holds. */
export type SnapshotMeta = {
  schemaVersion: 1;
  builtAt: string;
  sourceCommit: string;
  counts: { takes: number; films: number; proofs: number; files: number };
};

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "12 nov 21:40": the moment in Swedish time, as the banner says it. */
export function swedishMoment(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.hour}:${parts.minute}`;
}

/** The copy's own facts, or null when there are none (the lab, or a copy without meta.json). */
export async function readMeta(): Promise<SnapshotMeta | null> {
  if (!isSnapshot) return null;
  try {
    const response = await fetch("/meta.json", { cache: "no-store" });
    if (!response.ok) return null;
    const meta = (await response.json()) as SnapshotMeta;
    return meta?.schemaVersion === 1 && typeof meta.builtAt === "string" ? meta : null;
  } catch {
    return null;
  }
}
