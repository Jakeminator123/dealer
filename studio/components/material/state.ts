// Jakob's verdict on a candidate picture in Material: Godkänn (kandidat → gäller; the other candidates of the same role,
// position and card become ersatt) or Underkänn (kandidat → ersatt); a picture that holds can also be set aside
// (gäller → ersatt). Pure, shared by the page (which names what will be replaced before anything is written) and the lab
// server (tools/media-roles.ts setState, PUT /api/media/<id>/state in tools/order-routes.ts). Tests: tools/order-routes.test.ts.
import { kindOfPath, type Entry, type State } from "../../lib/media.ts";

export const CHANGES: Readonly<Record<State, readonly State[]>> = { kandidat: ["gäller", "ersatt"], "gäller": ["ersatt"], ersatt: [] };
export const allowed = (from: State | undefined, to: State): boolean => !!from && CHANGES[from].includes(to);

/** A picture (a file or one frame of a film) with a role in the chain or beside it, not a whole film or a proof folder. */
export const isDecidable = (e: Pick<Entry, "role" | "path" | "frame" | "proof">): boolean =>
  e.role !== "film" && e.role !== "prov" && !e.proof && !!e.path && (e.frame !== undefined || kindOfPath(e.path) === "image");

/**
 * The pictures that become ersatt when `entry` is approved: same role, same node, same card, and either still a candidate
 * or the one that held until now. Only one picture holds per role, node and card: an order finds its anchor that way, and a
 * repaired copy approved after its original must take the original's place (2026-11-13).
 */
export function replacedBy<T extends Pick<Entry, "id" | "role" | "node" | "card" | "state">>(entries: readonly T[], entry: T): T[] {
  return entries.filter((e) => e.id !== entry.id && e.role === entry.role && e.node === entry.node && e.card === entry.card && (e.state === "kandidat" || e.state === "gäller"));
}

/** "Jakob 2026-11-12 22:40: kandidat → gäller (Material)". */
export function stateLine(who: string, at: Date, from: State, to: State, why?: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${who} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}: ${from} → ${to}${why ? ` (${why})` : " (Material)"}`;
}
