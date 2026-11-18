// Material's station Landningar, per seat (Jakob 2026-11-18: a landing "bör rimligtvis tas bort helt, eller så bör vi skapa
// nya bilder för respektive position"): where a deal bara dit to each seat ends. A seat's own landing picture where one
// holds, else the cut frame of the bank's own film to the seat (src/order-model.ts seatEndOf, the function the store orders
// with), else nothing, said plainly. One seat's picture is never shown as if it were every seat's. Pure; tests in
// studio/tests/landings.test.ts.
import { SEAT_TARGETS, seatEndOf, stepOf, type BankFacts, type SeatEnd } from "../../../src/order-model.ts";
import type { RoleStatus } from "../../lib/media.ts";

type EntryLike = { id: string; role: string; node?: string; state?: string; card?: string; name?: string };
/** One seat: its card, its short name, and where a deal from anchor 2.1 (the pinch) and from anchor 2.2 (the drag) ends there. */
export type SeatEndRow<E> = { target: string; label: string; pinch: SeatEnd<E> | null; drag: SeatEnd<E> | null };

/** "P4", "Dealer", "Hålkort": a seat as the order views name it. */
export const seatLabel = (target: string): string => (target === "D.C1" ? "Dealer" : target === "D.C2" ? "Hålkort" : target.replace(/\.C1$/, ""));

/** Every seat a deal can be ordered to, with its end picture from each anchor. Archived pictures are out of play. */
export function seatEnds<E extends EntryLike>(entries: readonly E[], bank: BankFacts | null, dealer: string): SeatEndRow<E>[] {
  const live = entries.filter((e) => e.state !== "arkiverad");
  const pinch = stepOf("GIV-2.1")!, drag = stepOf("GIV-2.2")!;
  return SEAT_TARGETS.map((target) => ({
    target, label: seatLabel(target),
    pinch: seatEndOf(live, bank, { dealer, step: pinch, target }),
    drag: seatEndOf(live, bank, { dealer, step: drag, target }),
  }));
}

/** How the station stands: a landing picture holds for some seat, some seat has an end picture at all, or none has. */
export function seatEndsStatus(rows: readonly SeatEndRow<unknown>[]): { status: RoleStatus; have: number; total: number } {
  const have = rows.filter((r) => r.pinch || r.drag).length;
  const status: RoleStatus = rows.some((r) => r.pinch?.kind === "LANDNING" || r.drag?.kind === "LANDNING") ? "gäller" : have ? "finns" : "saknas";
  return { status, have, total: rows.length };
}

/** "landningsbild", "snittruta" or "ingen slutbild": what a seat's end picture is, in one word for its chip. */
export const endWord = (end: SeatEnd<unknown> | null): string => (!end ? "ingen slutbild" : end.kind === "LANDNING" ? "landningsbild" : "snittruta");
/** "3 av 9 platser har en slutbild": the station's count. */
export const seatEndsCount = (s: { have: number; total: number }): string => `${s.have} av ${s.total} platser har en slutbild`;
