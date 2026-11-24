// What the doll can do with a card of the plan: one source for Kortplan's motion choices (studio MotionPanel, the anchor the
// card's films go from) and for the doll (dealer3d/page/lay.ts placeFrom, the doll lab, docka-cykel.ts, tools/doll-order.ts).
// Jakob 2026-11-24: "I vissa lägen från vissa typer av ställningar ska man liksom inte kunna byta hand kanske, eller så
// måste man det. Beroende på vad dockan försöker sig på att göra och vad som är anatomiskt möjligt." Pure: no I/O.
//
// - Handbyte måste, över handen: from A2.1 her left hand carries the card alone while her right hand rests on the felt in
//   front of her (dealer3d/data/ankare-2-1-paow.json). A place further to her right than her right shoulder takes the left
//   arm over that hand. Measured on the deals the builder makes (dealer3d/src/pinch-deal.ts, the plan as saved 2026-11-24),
//   the left arm's least distance to her right hand and forearm, bone to bone: P1 1–4 mm and P2 43–46 mm (through the hand
//   and against it), P3 52–58 mm (clear by about a centimetre), the dealer's cards 105 mm and more, P4 to P7 172 mm and more.
//   There the card changes hands and goes from A2.3, where her right hand lays it.
// - Handbyte måste, stängt: from A2.1 the card is turned face up in her fingers on the way, always; a card laid closed goes
//   from A2.3.
// - Handbyte går inte: nowhere so far. From A2.3 her right hand reaches every place of the plan.
// Everything else is free.
import {TABLE_LENS, filmEye, onPlane, planPixel, type Lens, type Vec3} from '../../src/table-lens.ts';

/** Her right shoulder across the table in the pose A2.1, metres (her left +): dealer3d/data/ankare-2-1-paow.json, frame.R.s. */
export const RIGHT_SHOULDER_21 = -0.2129;

/** The plan's places as far as the choices read them: each card's place on the bank's picture. */
export type PlanPlaces = {targets: Record<string, {geometry: {native: {u: number; v: number}}}>};
/** The plan as far as the choices read it: each card's place, and what the plan says of its motion. */
export type PlanChoices = {targets: Record<string, {geometry: {native: {u: number; v: number}}; intent: {pass: boolean; endSide: 'BACK' | 'FRONT'}}>};
/** Whether the card must change hands, and why, in his words; `over`: because her left arm would go over her right hand. */
export type HandChange = {must: boolean; over: boolean; why: string | null};

export const OVER_HAND = 'Från A2.1 skulle vänster arm gå över hennes högra hand, som vilar på bordet: platsen ligger till höger om hennes högra axel. Kortet byter hand och läggs från A2.3.';
export const CLOSED = 'Ett stängt kort läggs från A2.3 med handbyte: från A2.1 vänds kortet alltid upp i handen på vägen.';

/** Where a place of the plan lies on the felt, in metres; null if the plan has no such place. */
export function feltOf(plan: PlanPlaces, id: string, lens: Lens = TABLE_LENS): Vec3 | null {
  const g = plan.targets[id]?.geometry.native, p = g ? planPixel(g) : null;
  return p ? onPlane(filmEye(lens), p.x, p.y) : null;
}
/** Whether her left arm would go over her right hand on the way from A2.1 to the place. */
export function overHand(plan: PlanPlaces, id: string, lens: Lens = TABLE_LENS): boolean {
  const at = feltOf(plan, id, lens);
  return !!at && at[0] < RIGHT_SHOULDER_21;
}
/** Whether the card to the place must change hands: over her right hand from A2.1, or laid closed. */
export function handChange(plan: PlanChoices, id: string, lens: Lens = TABLE_LENS): HandChange {
  const t = plan.targets[id];
  if (!t) return {must: false, over: false, why: null};
  if (overHand(plan, id, lens)) return {must: true, over: true, why: OVER_HAND};
  if (t.intent.endSide === 'BACK') return {must: true, over: false, why: CLOSED};
  return {must: false, over: false, why: null};
}
/** The plan's motion for a card as the doll and its films follow it: with handbyte where the card must change hands. */
export function dollIntent<P extends PlanChoices>(plan: P, id: string): P['targets'][string]['intent'] {
  const i = plan.targets[id].intent;
  return i.pass || !handChange(plan, id).must ? i : {...i, pass: true};
}
/** The pose the doll deals a card from and returns to: A2.3 with handbyte, else A2.1. */
export const dollEntry = (plan: PlanChoices, id: string): 'A2.1' | 'A2.3' => (plan.targets[id] && dollIntent(plan, id).pass ? 'A2.3' : 'A2.1');
