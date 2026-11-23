// The doll's films with what came of them (Bordet's part Docka, components/bordet/DollFilms.tsx): each film of
// data/rendered-references.json under the card it deals to, and beside it the orders that were sent with it as their
// reference film, with the takes they brought (the protocol's rows, lib/ledger.ts). An order says which film it was built
// on in reference.clips (and reference.from.film, the film its copy was taken from); nothing is guessed from names.
// Pure: no fs, no network. It joins what GET /api/orders and GET /api/orders/ledger already answer.
import type { OrderAnswer, RenderedReference } from "../../src/order-model.ts";
import type { LedgerRow } from "./ledger.ts";

/** An order sent with the doll's film: the takes that have a film to show, and how many of its takes have none (set aside, failed, a draft). */
export type DollOrder = { id: string; takes: LedgerRow[]; without: LedgerRow[] };
export type DollFilm = {
  film: RenderedReference;
  /** The card it deals to, as the plan names it ("P5.C1"); null for a film without a card (the entry to an anchor). */
  place: string | null;
  /** What tells it from the place's other films: "naturlig cykel a", "svep24d", "f". */
  name: string;
  /** Whose doll it is filmed with: "paow", or null for the standard doll. */
  doll: string | null;
  orders: DollOrder[];
};
export type DollGroup = { place: string | null; films: DollFilm[] };

const CARD = /^(P[1-7]|D)\.C([123])$/;

/** The card a film's edge ends on ("READY-C>P5.C1" → "P5.C1"), or null where it ends on no card. */
export const dollPlace = (edge: string): string | null => {
  const to = edge.split(">")[1] ?? "";
  return CARD.test(to) ? to : null;
};

/**
 * A film's short name: its id without what its place in the list already says: "docka", whose doll, the anchor it goes
 * from and the card ("docka-paow-2-3-p5c1-naturlig-cykel-a" → "naturlig cykel a"; "docka-vila-till-2-3-b" → "b").
 */
export function dollName(film: Pick<RenderedReference, "id" | "edge" | "doll">): string {
  const place = dollPlace(film.edge);
  let words = film.id.split("-");
  if (words[0] === "docka") words = words.slice(1);
  if (film.doll && words[0] === film.doll) words = words.slice(1);
  const card = place ? place.toLowerCase().replace(".", "") : null;
  const at = card ? words.indexOf(card) : -1;
  if (at >= 0) words = words.slice(at + 1);
  else {
    // a film without a card: what is left after its anchor ("vila till 2 3 b" → "b")
    const anchor = words.findIndex((w, i) => w === "2" && /^\d$/.test(words[i + 1] ?? ""));
    if (anchor >= 0 && anchor + 2 < words.length) words = words.slice(anchor + 2);
  }
  return words.join(" ") || film.id;
}

/** A take has a film to show: one in the bank, or the delivered file in the order's folder. */
export const takeHasFilm = (row: Pick<LedgerRow, "see">): boolean => !!(row.see.film || row.see.file);

const seatOrder = (place: string | null): number => {
  const m = place ? CARD.exec(place) : null;
  if (!m) return 1000;
  return (m[1] === "D" ? 8 : Number(m[1][1])) * 10 + Number(m[2]);
};

/**
 * The doll's films in groups, one per card (seat 1 first, the dealer's cards after the seats, the films without a card
 * last). Within a card the film listed last in the register stands first: a film made again is listed after the one it
 * replaces. Each film carries its orders, oldest first, as the orders' answer lists them.
 */
export function dollFilms(rendered: readonly RenderedReference[], orders: readonly OrderAnswer[], rows: readonly LedgerRow[]): DollGroup[] {
  const byOrder = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.order);
    if (list) list.push(row);
    else byOrder.set(row.order, [row]);
  }
  const groups = new Map<string | null, DollFilm[]>();
  for (const film of [...rendered].reverse()) {
    const place = dollPlace(film.edge);
    const used: DollOrder[] = [];
    for (const { order } of orders) {
      const ref = order.reference;
      if (ref.status !== "FINNS" || !(ref.clips.includes(film.id) || ref.from?.film === film.id)) continue;
      const takes = [...(byOrder.get(order.id) ?? [])].sort((a, b) => a.take - b.take);
      used.push({ id: order.id, takes: takes.filter(takeHasFilm), without: takes.filter((t) => !takeHasFilm(t)) });
    }
    const entry: DollFilm = { film, place, name: dollName(film), doll: film.doll ?? null, orders: used };
    const list = groups.get(place);
    if (list) list.push(entry);
    else groups.set(place, [entry]);
  }
  return [...groups.entries()].map(([place, films]) => ({ place, films })).sort((a, b) => seatOrder(a.place) - seatOrder(b.place));
}

/** How many takes with a film the doll's film has brought, over all its orders. */
export const takesOf = (film: DollFilm): number => film.orders.reduce((n, o) => n + o.takes.length, 0);
