// The game's picture of the table: which card lies where. Pure, no DOM, so Node can test it.
//
// The engine (game/) says which cards a seat's hands hold, by draw number in the shoe. This file turns that into a place per
// card: a slot (seat, hand, number in the hand), the placement key whose films deal a card there, and the card's quad in film
// pixels. The placement plan only has two places per seat (C1, C2). Everything beyond them is laid out here from those two:
// a third, fourth and fifth card continue the line C1 → C2 in short steps, and split hands lie one behind the other toward
// the dealer. Seats are 1–7, seat 1 at camera left; nothing here knows the engine's zero-based boxes.
import {flatQuad, quad, toPixels, fromPixels, type Geometry, type PlacementPlan} from './placement-model.ts';

export type Pt = {x: number; y: number};
// owner P: a seat 1–7. owner D: the dealer (seat 0). hand: which of the seat's hands, 0 first, of `hands`. index: the card's
// number in its hand, 0 first.
export type Slot = {owner: 'P' | 'D'; seat: number; hand: number; hands: number; index: number};
// Draw numbers in dealing order. A seat's hands keep the order the engine gives them.
export type TableHand = {seat: number; cards: number[]};
export type TableCards = {hands: TableHand[]; dealer: number[]};

export const SEAT_COUNT = 7;
// Pixels in the film frame. FAN: step between cards from the third on. SPLIT: step between the hands of one seat.
// Both are first values to be judged by eye in motion; the seat films were only tried to about 45–50 px from their own card.
export const FAN = 24, SPLIT = 66;
// Seats where the seat film's hand does not reach a fan of 24 px (the film agent's trial in motion, 2026-11-11): a shorter
// step keeps the cards under the fingers at seat 5 and away from the shoe at seat 7. Proposals, not yet tried in motion.
export const FAN_AT: Record<number, number> = {5: 16, 7: 12};
// The dealer's third card lies where its film lays it (film pixels), not beside the second: the archive film's hand lands
// there, and a card that slides a hundred pixels away from the fingers looks worse than a gap in the row.
export const DEALER_THIRD = {x: 1069, y: 926};
// The plan is written for the 1762 px wide lab view; the films are 1764 px wide.
const FILM_X = 1763 / 1761;

export function slotOf(table: TableCards, shoeDraw: number): Slot | null {
  const d = table.dealer.indexOf(shoeDraw);
  if (d >= 0) return {owner: 'D', seat: 0, hand: 0, hands: 1, index: d};
  for (const hand of table.hands) {
    const index = hand.cards.indexOf(shoeDraw); if (index < 0) continue;
    const own = table.hands.filter(h => h.seat === hand.seat);
    return {owner: 'P', seat: hand.seat, hand: own.indexOf(hand), hands: own.length, index};
  }
  return null;
}
const place = (slot: Slot) => slot.owner === 'D' ? 'D' : `P${slot.seat}`;
/** The card's name on the table: P4.C1, P4.C3, P4.H2.C1 (second hand after a split), D.C2. */
export const slotLabel = (slot: Slot) => `${place(slot)}${slot.hands > 1 ? `.H${slot.hand + 1}` : ''}.C${slot.index + 1}`;
/**
 * The placement key whose films deal a card to this slot. A seat has films for its first card; its second card shares them
 * (the clip bank knows that). The dealer has films of their own for the open first card, the closed second and a third.
 * Every other card plays the nearest film there is, and the rendered card is moved to the slot.
 */
export function slotFilm(slot: Slot): string {
  if (slot.owner === 'D') return `D.C${Math.min(slot.index, 2) + 1}`;
  return `P${slot.seat}.C${slot.hands === 1 && slot.index === 1 ? 2 : 1}`;
}
/** True when the plan has no place of its own for the slot, so the layout below made one up. */
export const slotImprovised = (slot: Slot) => slot.hands > 1 || slot.index > 1;

/** fan: one step for every seat instead of FAN and FAN_AT (for trying values from the page's address). */
export function createLayout(plan: PlacementPlan, options: {fan?: number | null} = {}) {
  const flat = plan.tableProjection?.mode === 'flat', heading = plan.tableProjection?.heading ?? 0, reference = plan.targets['P4.C1'].geometry.native;
  const shape = (g: Geometry): Pt[] => (flat ? flatQuad(g, reference, 'native', heading) : quad(g, 'native')).map(p => ({x: p.x * FILM_X, y: p.y}));
  function geometry(slot: Slot): Geometry {
    const first = plan.targets[`${place(slot)}.C1`].geometry.native, second = plan.targets[`${place(slot)}.C2`].geometry.native;
    if (slot.hands === 1 && slot.index <= 1) return slot.index ? second : first;
    const step = options.fan ?? FAN_AT[slot.seat] ?? FAN;
    if (slot.owner === 'D') return {...second, ...fromPixels((DEALER_THIRD.x + (slot.index - 2) * step) / FILM_X, DEALER_THIRD.y, 'native')};
    const a = toPixels(first, 'native'), b = toPixels(second, 'native'), length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const along = {x: (b.x - a.x) / length, y: (b.y - a.y) / length};
    // Split hands step away from the player, toward the dealer: up in the image, whichever way the line C1 → C2 points.
    const away = along.x >= 0 ? {x: along.y, y: -along.x} : {x: -along.y, y: along.x};
    const run = slot.index === 0 ? 0 : length + (slot.index - 1) * step, back = slot.hand * SPLIT;
    return {...(slot.index ? second : first), ...fromPixels(a.x + along.x * run + away.x * back, a.y + along.y * run + away.y * back, 'native')};
  }
  const quadOf = (slot: Slot) => shape(geometry(slot));
  return {
    /** The card's four corners in film pixels, in the plan's corner order. */
    quad: quadOf,
    centre(slot: Slot): Pt { const q = quadOf(slot); return {x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4}; },
    /** Bend and gloss of the plan's card at the seat (the Material panel's values). */
    material: (slot: Slot) => plan.targets[`${place(slot)}.C${slot.index ? 2 : 1}`].material,
  };
}
export type Layout = ReturnType<typeof createLayout>;
