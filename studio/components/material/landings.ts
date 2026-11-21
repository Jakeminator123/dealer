// Material's station Landningar, per seat (Jakob 2026-11-18: a landing "bör rimligtvis tas bort helt, eller så bör vi skapa
// nya bilder för respektive position"): where a deal bara dit to each seat ends. A seat's own landing picture where one
// holds, else the cut frame of the bank's own film to the seat (src/order-model.ts seatEndOf, the function the store orders
// with), else nothing, said plainly. One seat's picture is never shown as if it were every seat's. A landing picture is for one
// hand (A3, src/order-model.ts landingOf): from 2.1 and 2.2 the left hand lays the card, from 2.3 the right, so the seat shows
// each; an A3 that is a candidate is counted only as one, never as the seat's end. Pure.
import { SEAT_TARGETS, a3Candidates, a3Name, seatEndOf, stepOf, type BankFacts, type SeatEnd } from "../../../src/order-model.ts";
import type { RoleStatus } from "../../lib/media.ts";

/** The station's state: as a role's, and "delvis" while some seats have an end picture and others do not. */
export type SeatEndsState = RoleStatus | "delvis";

type EntryLike = { id: string; role: string; node?: string; state?: string; card?: string; hand?: string; name?: string };
/** One seat: its card, its short name, where a deal from anchor 2.1 (the pinch), 2.2 (the drag) and 2.3 (two hands, the right lays) ends, and its A3 candidates for the right hand. */
export type SeatEndRow<E> = { target: string; label: string; pinch: SeatEnd<E> | null; drag: SeatEnd<E> | null; two: SeatEnd<E> | null; candidates: E[] };

/** "P4", "DC1", "DC2": a seat by its place, the dealer's cards as in Kortplan; a player's second card by its A3, as Jakob writes it ("A3P4C2"). */
export const seatLabel = (target: string): string => (/^D\.C\d$/.test(target) ? target.replace(".", "") : /^P\d\.C2$/.test(target) ? a3Name(target) : target.replace(/\.C1$/, ""));

/**
 * Every seat a deal can be ordered to, and a player's second card where a landing picture is made for it (its own A3 since
 * 2026-11-21, tools/landing-make.ts), right after its seat, with its end picture from each anchor. Archived pictures are
 * out of play.
 */
export function seatEnds<E extends EntryLike>(entries: readonly E[], bank: BankFacts | null, dealer: string): SeatEndRow<E>[] {
  const live = entries.filter((e) => e.state !== "arkiverad");
  const pinch = stepOf("GIV-2.1")!, drag = stepOf("GIV-2.2")!, two = stepOf("GIV-2.3")!;
  const hasLanding = (target: string) => live.some((e) => e.role === "landning" && e.card === target);
  const targets = SEAT_TARGETS.flatMap((seat) => {
    const second = seat.replace(/^(P\d)\.C1$/, "$1.C2");
    return second !== seat && hasLanding(second) ? [seat, second] : [seat];
  });
  return targets.map((target) => ({
    target, label: seatLabel(target),
    pinch: seatEndOf(live, bank, { dealer, step: pinch, target }),
    drag: seatEndOf(live, bank, { dealer, step: drag, target }),
    two: seatEndOf(live, bank, { dealer, step: two, target, hand: "RH" }),
    candidates: a3Candidates(live, target, "RH"),
  }));
}

/**
 * How the station stands: no seat has an end picture (saknas), some have and some not (delvis), or every seat has one, a
 * landing picture holding for some seat (gäller) or only cut frames (finns). Never ✓ while a seat lacks its end picture.
 */
export function seatEndsStatus(rows: readonly SeatEndRow<unknown>[]): { status: SeatEndsState; have: number; total: number } {
  const have = rows.filter((r) => r.pinch || r.drag || r.two).length;
  const landing = rows.some((r) => r.pinch?.kind === "LANDNING" || r.drag?.kind === "LANDNING" || r.two?.kind === "LANDNING");
  const status: SeatEndsState = !have ? "saknas" : have < rows.length ? "delvis" : landing ? "gäller" : "finns";
  return { status, have, total: rows.length };
}

/** "landningsbild", "snittruta" or "ingen slutbild": what a seat's end picture is, in one word for its chip. */
export const endWord = (end: SeatEnd<unknown> | null): string => (!end ? "ingen slutbild" : end.kind === "LANDNING" ? "landningsbild" : "snittruta");
/** "3 av 10 platser har en slutbild": the station's count; the total is the rows', so a second card with a landing picture counts as one more. */
export const seatEndsCount = (s: { have: number; total: number }): string => `${s.have} av ${s.total} platser har en slutbild`;
