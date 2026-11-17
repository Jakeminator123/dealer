// The card plan drawn in the real perspective (Jakob's yes 2026-11-17 to "Kortplanen: rita korten i verkligt perspektiv,
// större närmare dealern?", and on the size the same evening: "kör vi 1.0 så kanske det är bra. men bara allt är logiskt"):
// on "Plant bord" every card of placements/default.json is a real card (63 x 88 mm) lying at its own place, seen through the
// table's lens (src/table-lens.ts, the 3D lane's), so cards nearer the dealer are larger than the plan's old projective plane
// drew them and a card narrows to 0.956 at its far edge, not 0.87. The plan says where a card lies and which way it points;
// its size and shape follow from the lens. How large the game draws its cards is afterwork (Efterarbete's "Kortens storlek").
// The rule every drawing of the plan in the lab and in an order uses: Bordet's Kortplan and card path, Ny beställning's
// picture, an order's last picture (tools/order-images.ts). The game keeps src/placement-model.ts flatQuad until its lying
// card is changed in a step of its own. Pure; tests in tools/card-plan.test.ts.
import { planQuad, quad, toPixels, type Geometry, type PlacementPlan, type View } from './placement-model.ts';
import { FILM, TABLE_LENS, realCardQuad, type Lens, type Pixel } from './table-lens.ts';

/** The plan's Dator view is 1762 wide and the film 1764: a plan pixel's x times 1763/1761 is the film's (the game's FILM_X). */
const PLAN_X = 1761, FILM_X = FILM.width - 1;
export const planToFilm = (p: Pixel): Pixel => ({ x: (p.x * FILM_X) / PLAN_X, y: p.y });
export const filmToPlan = (p: Pixel): Pixel => ({ x: (p.x * PLAN_X) / FILM_X, y: p.y });
/** The card's turn on the felt: the table's direction (tableProjection.heading) and P4C1's own riktning, in radians. */
const headingOf = (plan: PlacementPlan, reference: Geometry) => (((plan.tableProjection?.heading ?? 0) + reference.angle) * Math.PI) / 180;

/** Whether the plan's cards are drawn through the lens: the table is "Plant bord" (every card follows P4C1) and the view is Dator. */
export const throughLens = (plan: Pick<PlacementPlan, 'tableProjection'>, view: View) => view === 'native' && plan.tableProjection?.mode === 'flat';

/**
 * A card of the plan as the lab and an order draw it, in the view's pixels, corners far left, far right, near right, near
 * left: through the table's lens where the table is "Plant bord" in Dator (a real card at the card's own place, turned as
 * the table), else the plan's own rule (planQuad: the card's stored measures; Mobil keeps its
 * projective plane, since the lens is the film's).
 */
export function planCardQuad(plan: PlacementPlan, id: string, view: View): Pixel[] {
  if (!throughLens(plan, view)) return planQuad(plan, id, view);
  const g = plan.targets[id]?.geometry.native;
  if (!g) throw Error(`Okänd kortplats ${id}.`);
  const q = realCardQuad(planToFilm(toPixels(g, 'native')), headingOf(plan, plan.targets['P4.C1'].geometry.native));
  return q ? q.map(filmToPlan) : quad(g, 'native');
}

/**
 * V6's cards against a real card (Jakob 2026-11-17: "native-0694.png har ju tex skitbra kortstorlekar"): frame 694 of V6
 * (assets/reference/native-0694.png, in the plan's own Dator pixels) has two open cards at seat 4 lying with their long side
 * across. The front card's corners, read off the frame (the card against the felt, the shadow line to the card under it),
 * far left, far right, near right, near left. Against a real card lying the same way at the same place under the table's
 * lens it is 1.46 times on the near edge and 1.47 times deep; its far edge narrows to 0.74 (V6's own camera is wider), so
 * as a whole, the square root of the areas, it is 1.38 times: the value of Efterarbete's "Kortens storlek" that would draw
 * the game's cards as V6's (an estimate: V6's camera is not the bank's).
 */
export const V6_CARD: readonly Pixel[] = [{ x: 867.8, y: 1024.5 }, { x: 990.3, y: 1024.5 }, { x: 1010.5, y: 1096.5 }, { x: 844.2, y: 1096.5 }];
export const V6_CARD_SIZE = 1.38;
/** A real card lying with its long side across at a place of the plan (Dator pixels), as the lens draws it, in plan pixels, far edge first. */
export function realCardAcross(place: Pixel, lens: Lens = TABLE_LENS): Pixel[] | null {
  const q = realCardQuad(planToFilm(place), Math.PI / 2, 1, lens);
  if (!q) return null;
  const byRow = q.map(filmToPlan).sort((a, b) => a.y - b.y), [f1, f2, n1, n2] = byRow;
  return [f1.x < f2.x ? f1 : f2, f1.x < f2.x ? f2 : f1, n1.x > n2.x ? n1 : n2, n1.x > n2.x ? n2 : n1];
}
/** A quad's near and far edge, depth and area on screen (corners far left, far right, near right, near left). */
export function screenMeasure(q: readonly Pixel[]) {
  const d = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
  const area = Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0) / 2);
  return { near: d(q[2], q[3]), far: d(q[0], q[1]), depth: Math.hypot((q[2].x + q[3].x - q[0].x - q[1].x) / 2, (q[2].y + q[3].y - q[0].y - q[1].y) / 2), area };
}
