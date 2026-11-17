// The card plan drawn in the real perspective (Jakob's yes 2026-11-17 to "Kortplanen: rita korten i verkligt perspektiv,
// större närmare dealern?", and on the size the same evening: "kör vi 1.0 så kanske det är bra. men bara allt är logiskt"):
// on "Plant bord" every card of placements/default.json is a real card (63 x 88 mm) lying at its own place, seen through the
// table's lens (src/table-lens.ts, the 3D lane's), so cards nearer the dealer are larger than the plan's old projective plane
// drew them (a real card narrows to 0.956 at its far edge). The plan says where a card lies and which way it points; its size
// follows from the lens. How large the game draws its cards is afterwork (Efterarbete's "Kortens storlek").
// How deep the table looks is one number of the plan, and it is only the cards' shape (tableProjection.perspective, Kortplan's
// "Perspektiv"; Jakob 2026-11-17: "Om alla kort är exakt lika stora, blir de väldigt tvådimensionella", and 2026-11-18 of a
// lens that also shrank the dealer's cards: "Kortet i skon är större än korten som ligger närmare oss"): size and place stay
// the real camera's, and each card is drawn as a keystone about its own middle (planShape).
// The rule every drawing of the plan in the lab and in an order uses: Bordet's Kortplan and card path, Ny beställning's
// picture, an order's last picture (tools/order-images.ts). The game keeps src/placement-model.ts flatQuad until its lying
// card is changed in a step of its own. Pure; tests in tools/card-plan.test.ts.
import { TABLE_PERSPECTIVE, planQuad, quad, toPixels, type Geometry, type PlacementPlan, type View } from './placement-model.ts';
import { FILM, TABLE_LENS, realCardQuad, type Lens, type Pixel } from './table-lens.ts';

/** The plan's Dator view is 1762 wide and the film 1764: a plan pixel's x times 1763/1761 is the film's (the game's FILM_X). */
const PLAN_X = 1761, FILM_X = FILM.width - 1;
export const planToFilm = (p: Pixel): Pixel => ({ x: (p.x * FILM_X) / PLAN_X, y: p.y });
export const filmToPlan = (p: Pixel): Pixel => ({ x: (p.x * PLAN_X) / FILM_X, y: p.y });
/** The card's turn on the felt: the table's direction (tableProjection.heading) and P4C1's own riktning, in radians. */
const headingOf = (plan: PlacementPlan, reference: Geometry) => (((plan.tableProjection?.heading ?? 0) + reference.angle) * Math.PI) / 180;

/**
 * The table's perspective, the share seat 4's far edge is of its near edge: the plan's value (Kortplan's "Perspektiv"), else
 * seat 4's own stored taper (P4C1's, his 87 % of 11 Nov), else a real card's 0.956; within the control's 0.80 to 0.96.
 */
export function planTaper(plan: Pick<PlacementPlan, 'tableProjection' | 'targets'>): number {
  const t = plan.tableProjection?.perspective ?? plan.targets['P4.C1']?.geometry.native.taper ?? 0.956;
  return Math.min(TABLE_PERSPECTIVE.max, Math.max(TABLE_PERSPECTIVE.min, t));
}
/** A real card at its place of the plan through the real camera, film pixels (corners far left, far right, near right, near left). */
function realAt(plan: PlacementPlan, id: string): Pixel[] | null {
  return realCardQuad(planToFilm(toPixels(plan.targets[id].geometry.native, 'native')), headingOf(plan, plan.targets['P4.C1'].geometry.native), 1, TABLE_LENS);
}
/**
 * The plan's shape as one number for every card, film pixels: how much a card's sideways offsets from its own middle shrink
 * per pixel up the picture (0: a real card's shape), set so that seat 4's card (P4C1, real) has its far edge `planTaper` of
 * its near edge. 96 % is a real card's own shape.
 */
export function planShape(plan: PlacementPlan): number {
  const t = planTaper(plan), q = realAt(plan, 'P4.C1');
  if (!q || t >= TABLE_PERSPECTIVE.max) return 0;
  const m = screenMeasure(q), near = Math.max(...q.map((p) => p.y)), far = (q[0].y + q[1].y) / 2;
  return near > far ? (1 - t / (m.far / m.near)) / (near - far) : 0;
}
/**
 * A real card drawn with the plan's shape: a keystone in the picture about the card's own middle axis up the picture (x of its
 * place), the corner nearest the camera where it is and the sideways offsets shrinking linearly with how far up a point lies.
 * The card's middle and its near edge stay where the real camera puts them; its depth is the real camera's.
 */
export function keystone(q: readonly Pixel[], middle: number, shape: number): Pixel[] {
  const near = Math.max(...q.map((p) => p.y));
  return q.map((p) => ({ x: middle + (p.x - middle) * (1 - shape * (near - p.y)), y: p.y }));
}
/** Whether the plan's cards are drawn through the lens: the table is "Plant bord" (every card follows P4C1) and the view is Dator. */
export const throughLens = (plan: Pick<PlacementPlan, 'tableProjection'>, view: View) => view === 'native' && plan.tableProjection?.mode === 'flat';

/**
 * A card of the plan as the lab and an order draw it, in the view's pixels, corners far left, far right, near right, near
 * left: where the table is "Plant bord" in Dator a real card at the card's own place through the real camera, turned as the
 * table, in the plan's shape (keystone, planShape); else the plan's own rule (planQuad: the card's stored measures; Mobil keeps its
 * projective plane, since the lens is the film's).
 */
export function planCardQuad(plan: PlacementPlan, id: string, view: View): Pixel[] {
  if (!throughLens(plan, view)) return planQuad(plan, id, view);
  const g = plan.targets[id]?.geometry.native;
  if (!g) throw Error(`Okänd kortplats ${id}.`);
  const q = realAt(plan, id);
  return q ? keystone(q, planToFilm(toPixels(g, 'native')).x, planShape(plan)).map(filmToPlan) : quad(g, 'native');
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
