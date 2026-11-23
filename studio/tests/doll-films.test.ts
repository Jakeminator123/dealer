// studio/lib/doll-films.ts: the doll's films under their cards with the orders that were sent with them (Bordet's part
// Docka), on made-up data. An order belongs to the film its reference names (reference.clips, reference.from.film), never
// to a film that only shares its card; a take without a film is counted apart; the film listed last stands first.
// Run from the repo root: node --test "studio/tests/doll-films.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import type { OrderAnswer, RenderedReference } from "../../src/order-model.ts";
import { dollFilms, dollName, dollPlace, takesOf } from "../lib/doll-films.ts";
import type { LedgerRow } from "../lib/ledger.ts";

const film = (id: string, edge: string, more: Partial<RenderedReference> = {}): RenderedReference => ({ id, edge, path: `assets/references/docka/${id}/source.mp4`, sha256: "0".repeat(64), seconds: 3, ...more });
const order = (id: string, reference: unknown): OrderAnswer => ({ order: { id, reference } }) as unknown as OrderAnswer;
const withFilm = (id: string, clips: string[], from?: string) => order(id, { status: "FINNS", clips, path: `assets/orders/${id}/reference.mp4`, ...(from ? { from: { film: from } } : {}) });
const row = (orderId: string, take: number, see: Partial<LedgerRow["see"]>): LedgerRow => ({ key: `${orderId}#${take}`, order: orderId, take, see: { film: null, file: null, ...see } }) as unknown as LedgerRow;

test("each film of the doll's stands under its card with the orders that named it", () => {
  const rendered = [
    film("docka-vila-till-2-3-b", "IDLE>READY-C"),
    film("docka-2-3-p5c1-f", "READY-C>P5.C1"),
    film("docka-2-3-p1c1-f", "READY-C>P1.C1"),
    film("docka-paow-2-3-p5c1-naturlig-cykel-a", "READY-C>P5.C1", { doll: "paow", shape: "ROUND_TRIP" }),
    film("docka-2-3-dc1-f", "READY-C>D.C1"),
  ];
  const orders = [
    withFilm("paow-giv-2-3-p5-01", ["docka-2-3-p5c1-f"]),
    withFilm("paow-giv-2-3-p5-04", ["docka-paow-2-3-p5c1-naturlig-cykel-a"]),
    withFilm("paow-giv-2-3-p5-05", [], "docka-paow-2-3-p5c1-naturlig-cykel-a"), // named only by the film its copy came from
    withFilm("paow-giv-p5-06", ["paow-giv-p5-01-01"]), // a take of the bank as reference: no film of the doll's
    order("paow-giv-2-3-p5-07", { status: "INGEN", why: "utan" }),
    withFilm("paow-ingang-2-3-01", ["docka-vila-till-2-3-b"]),
  ];
  const rows = [
    row("paow-giv-2-3-p5-04", 2, { file: "assets/orders/paow-giv-2-3-p5-04/take-2/after.mp4" }),
    row("paow-giv-2-3-p5-04", 1, { film: "assets/motions/paow-giv-2-3-p5-04-01/source.mp4" }),
    row("paow-giv-2-3-p5-05", 1, {}), // set aside: nothing came
    row("paow-giv-2-3-p5-01", 1, { film: "assets/motions/paow-giv-2-3-p5-01-01/source.mp4" }),
    row("paow-giv-p5-06", 1, { film: "assets/motions/paow-giv-p5-06-01/source.mp4" }),
  ];
  const groups = dollFilms(rendered, orders, rows);
  // seat 1 first, the dealer's card after the seats, the films without a card last
  assert.deepEqual(groups.map((g) => g.place), ["P1.C1", "P5.C1", "D.C1", null]);
  const p5 = groups[1].films;
  // the film listed last in the register first
  assert.deepEqual(p5.map((f) => f.film.id), ["docka-paow-2-3-p5c1-naturlig-cykel-a", "docka-2-3-p5c1-f"]);
  assert.deepEqual(p5.map((f) => [f.name, f.doll]), [["naturlig cykel a", "paow"], ["f", null]]);
  // the orders by what their reference names, with their takes in order; a take without a film apart
  assert.deepEqual(p5[0].orders.map((o) => [o.id, o.takes.map((t) => t.take), o.without.map((t) => t.take)]), [["paow-giv-2-3-p5-04", [1, 2], []], ["paow-giv-2-3-p5-05", [], [1]]]);
  assert.deepEqual(p5[1].orders.map((o) => o.id), ["paow-giv-2-3-p5-01"]);
  assert.equal(takesOf(p5[0]), 2);
  assert.deepEqual(groups[0].films[0].orders, []);
  // an entry to an anchor has no card; an order with it and no row yet is still listed
  assert.deepEqual(groups[3].films.map((f) => [f.name, f.orders.map((o) => o.id)]), [["b", ["paow-ingang-2-3-01"]]]);
  // an order that named a take of the bank, or no film at all, stands under no film of the doll's
  const listed = groups.flatMap((g) => g.films.flatMap((f) => f.orders.map((o) => o.id)));
  assert.ok(!listed.includes("paow-giv-p5-06") && !listed.includes("paow-giv-2-3-p5-07"));
});

test("a film's card and short name are read from its edge and id", () => {
  assert.equal(dollPlace("READY-C>P4.C2"), "P4.C2");
  assert.equal(dollPlace("IDLE>READY-C"), null);
  assert.equal(dollName(film("docka-2-3-p4c2-h24-omgrepp", "READY-C>P4.C2")), "h24 omgrepp");
  assert.equal(dollName(film("docka-giv-p4-4", "READY>P4.C1")), "giv p4 4"); // an id that does not name its card as the plan does stays whole
});
