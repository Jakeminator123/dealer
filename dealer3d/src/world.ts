// The table as a real place in metres, built from the film: what is measured and what is assumed, the fit that chooses
// the lens (its numbers stand frozen in src/table-lens.ts, and a test holds the two together), the card places of Jakob's
// plan laid on the felt, and an eye for every seat. Pure: no I/O and no three.js.
import {FILM, SEAT_FOUR_CARD, SHOE_FOOT, SHOE_WINDOW_CARD, filmEye, lensForFocal, onPlane, onUpright, orbit, planPixel, readSpan, see, cardCorners, quadMeasure, type Anchors, type Eye, type Lens, type Pixel, type Vec3} from './camera.ts';
export {SHOE, cardInSpace, realCardQuad, realCardQuadAt, shoeCard, shoeCardQuad, shoePose, sides, type ShoePose} from '../../src/table-lens.ts';

// What the film shows, read on frames of paow-giv-2-1-p4-11-01 (1764 x 1174) and in data/dealer-standard.json.
export const MEASURED = {
  // The blue card lying at seat 4, frame 120, read on a four times enlargement: near edge 84.5 px and 72 px deep
  // (SEAT_FOUR_CARD in src/table-lens.ts), and its far edge, 77.5 px.
  restingCard: {...SEAT_FOUR_CARD, farPx: 77.5},
  // The resting hand's knuckles, index to little finger (data/dealer-standard.json, hands.leftInPicture): 73.4 px apart.
  knuckles: {a: {x: 775.4, y: 802}, b: {x: 706.3, y: 826.8}},
  // The yellow card in the pinch (anchor 2.1), frame 0 of the same film's track: top left, top right, bottom right, bottom
  // left. The card is drawn a little out of the shoe here, and the track's outline takes in a strip of the card behind it.
  shoeCard: [{x: 1299, y: 739.2}, {x: 1351.7, y: 774.3}, {x: 1282.7, y: 862.6}, {x: 1240.2, y: 833}] as Pixel[],
  shoeWindowCard: SHOE_WINDOW_CARD, // the card standing in the shoe's window, frame 120 (src/table-lens.ts)
  dealerEdgeRow: 831.5, // data/scene-contract.json, keyFigures.dealerEdgeImageRow
  // Paow's anchor paow-nyp-ung-1, read by eye, +-10 px: the jacket's shoulder points, the pupils, the chin and the top of the hair.
  shoulders: {a: {x: 655, y: 405}, b: {x: 1075, y: 405}}, pupils: {a: {x: 836, y: 211}, b: {x: 909, y: 211}}, chinRow: 337, crownRow: 58,
  shoeFoot: SHOE_FOOT, // the shoe's near bottom edge, read by eye on frame 36; +-10 px (src/table-lens.ts)
};
// What is assumed, each in one place: the real sizes of what the film shows of her (a woman's knuckle breadth, index to
// little finger, is 70 to 80 mm; a jacket's shoulders about 400 mm; pupils 62 mm apart), that her knuckles lie 20 mm over
// the felt, and that she sits a little behind the table edge, shoulders and face 0.18 m behind it.
export const ASSUMED = {knuckleBreadth: 0.076, knuckleLift: 0.02, shoulderBreadth: 0.4, pupilDistance: 0.062, shouldersBehindEdge: 0.18};

export const anchors = (): Anchors => ({
  card: SEAT_FOUR_CARD,
  span: {...MEASURED.knuckles, metres: ASSUMED.knuckleBreadth, lift: ASSUMED.knuckleLift},
});
/** What a lens makes of the dealer's own body, in metres: her knuckles on the felt, her shoulders and her pupils behind the table edge. */
export function bodyUnder(l: Lens) {
  const e = filmEye(l), z = dealerEdge(l)[2] - ASSUMED.shouldersBehindEdge;
  const wide = (s: {a: Pixel; b: Pixel}) => { const a = onUpright(e, s.a.x, s.a.y, z), b = onUpright(e, s.b.x, s.b.y, z); return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : NaN; };
  return {knuckles: readSpan(l, anchors().span) ?? NaN, shoulders: wide(MEASURED.shoulders), pupils: wide(MEASURED.pupils)};
}
/** How far a lens is from drawing her at her real size: the squared logarithms of read over real, summed over the three measures. */
export function bodyError(l: Lens): number {
  const b = bodyUnder(l), e = (read: number, real: number) => Math.log(read / real) ** 2;
  return e(b.knuckles, ASSUMED.knuckleBreadth) + e(b.shoulders, ASSUMED.shoulderBreadth) + e(b.pupils, ASSUMED.pupilDistance);
}
let found: Lens | null = null;
/**
 * The lens, fitted anew from what is measured and assumed above; TABLE_LENS in src/table-lens.ts is this result written down.
 * The card lying at seat 4 has its film size and shape under a whole family of lenses
 * (lensForFocal); of these it is the one that draws the dealer herself nearest her real size. The plan's own perspective
 * (a card narrowing to 0.87) belongs to a much wider lens, under which she would be twice as large as a person.
 */
export function filmLens(): Lens {
  if (found) return found;
  const card = anchors().card, at = (f: number) => bodyError(lensForFocal(card, f));
  let best = 900, least = Infinity;
  for (let f = 900; f <= 3600; f += 50) { const e = at(f); if (e < least) { least = e; best = f; } }
  for (let step = 25; step > 0.5; step /= 2) for (const f of [best - step, best + step]) { const e = at(f); if (e < least) { least = e; best = f; } }
  return found = lensForFocal(card, Math.round(best));
}

export type Plan = {targets: Record<string, {geometry: {native: {u: number; v: number; width: number; height: number; taper: number}}}>; shoe?: {native?: {u: number; v: number}}};
export type Spot = {id: string; pixel: Pixel; at: Vec3};
/** Every card place of the plan as a point on the felt. */
export function spots(plan: Plan, lens: Lens): Spot[] {
  const eye = filmEye(lens), out: Spot[] = [];
  for (const [id, t] of Object.entries(plan.targets)) { const pixel = planPixel(t.geometry.native), at = onPlane(eye, pixel.x, pixel.y); if (at) out.push({id, pixel, at}); }
  return out;
}
/** The middle of the dealer-side table edge on the felt: where the film's row 831.5 meets the picture's centre line. */
export const dealerEdge = (lens: Lens): Vec3 => onPlane(filmEye(lens), (FILM.width - 1) / 2, MEASURED.dealerEdgeRow)!;

/**
 * The eye of a seat. Seat 4 is the film camera itself (that is the view the bank was filmed from). Every other seat's eye
 * stands to its own first card as the bank's camera stands to seat 4's: as far behind it, as high over the felt, looking
 * as steeply down, and turned round the table by the angle between the two cards as seen from the middle of the dealer's
 * edge. So a player's own card lands at the same spot of the picture from every seat, and only the side the dealer is
 * seen from differs. (Carried round the dealer's edge instead, as it was first, seat 1's own card fell below the picture:
 * that seat's cards lie farther from the dealer than seat 4's.)
 */
export function seatEye(seat: number, plan: Plan, lens: Lens): Eye {
  const all = spots(plan, lens), own = all.find(s => s.id === `P${seat}.C1`), four = all.find(s => s.id === 'P4.C1'), pivot = dealerEdge(lens);
  if (!own || !four) throw Error(`The plan has no first card for seat ${seat}.`);
  const bearing = (p: Vec3) => Math.atan2(p[0] - pivot[0], p[2] - pivot[2]), turned = orbit(filmEye(lens), four.at, bearing(own.at) - bearing(four.at));
  return {...turned, position: [turned.position[0] + own.at[0] - four.at[0], turned.position[1], turned.position[2] + own.at[2] - four.at[2]]};
}

/** A real card lying at a pixel of the felt, as the film camera draws it: near and far edge, depth and taper in pixels. */
export function realCardAt(lens: Lens, pixel: Pixel, heading = 0) {
  const eye = filmEye(lens), at = onPlane(eye, pixel.x, pixel.y); if (!at) return null;
  const q = cardCorners(at, heading).map(p => see(eye, p)); return q.every(Boolean) ? quadMeasure(q as Pixel[]) : null;
}
