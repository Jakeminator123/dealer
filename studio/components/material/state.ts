// Jakob's choice of picture in Material, by hand (2026-11-18: "Jag vill också kunna manuellt ändra typ ankare och klipp så
// jag får välja de som är primära eller radera eller arkivera"): any picture of a place can be made the one that holds, also
// one set aside before; one that holds or a candidate can be set aside; any can be archived (out of the lists, kept in the
// register with who and when, never a deletion); an archived one comes back as a candidate. Making one hold sets the others of
// the same role, node and card (a keystone also of the same posture) aside. Pure, shared by the page (which names what follows
// before anything is written) and the lab server (tools/media-roles.ts setState, PUT /api/media/<id>/state in
// tools/order-routes.ts). Tests: tools/order-routes.test.ts.
import { isStanding, kindOfPath, type Entry, type State } from "../../lib/media.ts";

export const CHANGES: Readonly<Record<State, readonly State[]>> = {
  kandidat: ["gäller", "ersatt", "arkiverad"],
  "gäller": ["ersatt", "arkiverad"],
  ersatt: ["gäller", "arkiverad"],
  arkiverad: ["kandidat"],
};
/** A picture without a state (most of Pamela's) counts as a candidate: he may make any of them the one that holds. */
export const allowed = (from: State | undefined, to: State): boolean => CHANGES[from ?? "kandidat"].includes(to);

/** The words of each change, the same on every page that offers it (Material's tile and viewer). */
export const ACTION: Readonly<Record<State, { button: string; done: string }>> = {
  "gäller": { button: "Gör till den som gäller", done: "gäller nu" },
  ersatt: { button: "Lägg åt sidan", done: "lagd åt sidan" },
  arkiverad: { button: "Arkivera", done: "arkiverad (går att ta tillbaka)" },
  kandidat: { button: "Ta tillbaka", done: "tillbaka som kandidat" },
};
/** The changes a picture offers, in the order the buttons stand. */
export const offered = (from: State | undefined): State[] => (["gäller", "ersatt", "arkiverad", "kandidat"] as const).filter((to) => allowed(from, to));

/** A picture (a file or one frame of a film) with a role in the chain or beside it, not a whole film. */
export const isDecidable = (e: Pick<Entry, "role" | "path" | "frame">): boolean =>
  e.role !== "film" && !!e.path && (e.frame !== undefined || kindOfPath(e.path) === "image");

/**
 * The pictures that are set aside when `entry` is made the one that holds: same role, same node, same card, and either still
 * a candidate or the one that held until now. Only one picture holds per role, node and card: an order finds its anchor that
 * way, and a repaired copy approved after its original must take the original's place (2026-11-13). A keystone is also kept
 * apart by its posture: a dealer has a standing and a sitting one (2026-11-18), and a landing picture by its hand (A3: one per
 * seat and hand; absent is the left).
 */
export function replacedBy<T extends Pick<Entry, "id" | "role" | "node" | "card" | "state"> & { name?: string; hand?: string }>(entries: readonly T[], entry: T): T[] {
  const samePosture = (e: T) => entry.role !== "keystone" || isStanding(e) === isStanding(entry);
  const sameHand = (e: T) => entry.role !== "landning" || (e.hand ?? "LH") === (entry.hand ?? "LH");
  return entries.filter((e) => e.id !== entry.id && e.role === entry.role && e.node === entry.node && e.card === entry.card && samePosture(e) && sameHand(e) && (e.state === "kandidat" || e.state === "gäller"));
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
