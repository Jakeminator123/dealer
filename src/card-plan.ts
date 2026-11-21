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
// picture, an order's last picture (tools/order-images.ts). The game's lying cards (src/game-table.ts), the resting card of
// the drawn cards (src/card-overlay.ts) and the 3D scene's film camera (src/scene3d-view.ts) follow the same rule and lens
// by default since Jakob chose comparison B on 2026-11-19; explicit 'contract' preserves historical references.
// Pure; tests in tools/card-plan.test.ts.
import { TABLE_PERSPECTIVE, flatQuad, planQuad, quad, toPixels, type Geometry, type PlacementPlan, type View } from './placement-model.ts';
import { FILM, TABLE_LENS, pixelToFelt, realCardQuad, type Lens, type Pixel } from './table-lens.ts';

/**
 * Which geometry the game and the 3D scene follow (the lab's card plan always follows the lens):
 * - 'contract', as before 2026-11-18: the game lays its cards with the plan's older projective plane (flatQuad), the drawn card
 *   rests as the contract's card times Kortens storlek (card-overlay.ts restingQuad), and the scene's film camera is the
 *   contract's (scene3d-geometry.ts cameraFromContract, k = 2), which is another camera than the lens;
 * - 'lens': all three follow the card plan's rule below through the table's lens, so the same plan and the same card give the
 *   same outline in the lab, in the game and in the scene.
 * Jakob chose 'lens' after comparison B (2026-11-19). Explicit geometri=kontrakt remains for old proofs and references;
 * ordinary lab and Casino addresses need no geometry word. Camera/view variations are saved scene presets.
 * The studio's Scen calls 'contract' Bred lins and 'lens' Standard. Since Jakob 2026-11-21 Casino's saved look may carry
 * Bred lins (the preset's geometri, studio/lib/scene-presets.ts, written by Använd i Casino); the card plan and the orders
 * stay on 'lens'.
 */
export type TableGeometry = 'contract' | 'lens';
export const TABLE_GEOMETRY: TableGeometry = 'lens';
export const GEOMETRY_WORD = 'geometri', GEOMETRY_WORDS: Readonly<Record<string, TableGeometry>> = { lins: 'lens', kontrakt: 'contract' };
const geometryOf = (word: string | null | undefined): TableGeometry | null => (typeof word === 'string' && Object.hasOwn(GEOMETRY_WORDS, word) ? GEOMETRY_WORDS[word] : null);
/**
 * The geometry a page follows: its address's word (geometri=lins or geometri=kontrakt), else the word a saved look carries
 * (`saved`: a scene preset's geometri, read by the game page), else TABLE_GEOMETRY. `search` is the address's query; left
 * out, the page's own (there is none in Node).
 */
export function tableGeometry(search: string | null = (globalThis as { location?: { search?: string } }).location?.search ?? null, saved: string | null = null): TableGeometry {
  return geometryOf(search ? new URLSearchParams(search).get(GEOMETRY_WORD) : null) ?? geometryOf(saved) ?? TABLE_GEOMETRY;
}
/**
 * Efterarbete's "Kortens storlek" as a share of the rule's card. The setting is written against the contract's card, of which
 * the plan's own card is 1.2 (the scene's default: restingQuad at 1.2 is the older plan's outline at seat 4 within a
 * twentieth). Under the lens the plan's card is a real card, so the same setting draws the same share of the plan's card:
 * 1.2 is a real card, exactly what the lab's Kortplan draws, and 1.65 is 1.375 of one. When the default geometry has changed,
 * the setting can be rewritten so that 1 is a real card, and this goes.
 */
export const PLAN_CARD_SIZE = 1.2;
export const cardGrow = (size: number, geometry: TableGeometry): number => (geometry === 'lens' ? size / PLAN_CARD_SIZE : size);

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
/** A real card at a place of the plan's Dator view through the real camera, film pixels (corners far left, far right, near right, near left). */
function realAt(plan: PlacementPlan, g: { u: number; v: number }, lens: Lens = TABLE_LENS): Pixel[] | null {
  return realCardQuad(planToFilm(toPixels(g, 'native')), headingOf(plan, plan.targets['P4.C1'].geometry.native), 1, lens);
}
/**
 * The plan's shape as one number for every card, film pixels: how much a card's sideways offsets from its own middle shrink
 * per pixel up the picture (0: a real card's shape), set so that seat 4's card (P4C1, real) has its far edge `planTaper` of
 * its near edge. 96 % is a real card's own shape.
 */
export function planShape(plan: PlacementPlan, lens: Lens = TABLE_LENS): number {
  const t = planTaper(plan), q = realAt(plan, plan.targets['P4.C1'].geometry.native, lens);
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
export function planCardQuad(plan: PlacementPlan, id: string, view: View, lens: Lens = TABLE_LENS): Pixel[] {
  if (!throughLens(plan, view)) return planQuad(plan, id, view);
  const g = plan.targets[id]?.geometry.native;
  if (!g) throw Error(`Okänd kortplats ${id}.`);
  return planCardAt(plan, g, view, lens);
}
/**
 * The same rule for a card at any place of the view, for the places the plan does not name (the game's third and later cards,
 * split hands and the dealer's third card, which src/game-table.ts lays out from the plan's two per seat): `g` is the card's
 * place, with the stored measures the plan's own rule reads where the table is not drawn through the lens. In the view's pixels.
 */
export function planCardAt(plan: PlacementPlan, g: Geometry, view: View, lens: Lens = TABLE_LENS): Pixel[] {
  if (!throughLens(plan, view)) return plan.tableProjection?.mode === 'flat' ? flatQuad(g, plan.targets['P4.C1'].geometry[view], view, plan.tableProjection.heading) : quad(g, view);
  const q = realAt(plan, g, lens);
  return q ? keystone(q, planToFilm(toPixels(g, 'native')).x, planShape(plan, lens)).map(filmToPlan) : quad(g, 'native');
}

// ---- from an outline back to the card ------------------------------------------------------------------------------------
// The game's drawn cards are handed outlines (the place the layout gave a card, or the film's own card where it came to rest)
// and lay a card of their own size there (Efterarbete's "Kortens storlek"). These two read where an outline lies on the table
// and lay the rule's card at that place, so that a card of size 1 on a place of the plan is the plan's own outline.
const SIDEWAYS = 1.15; // an outline whose first side is this much longer than its second (on the felt, in metres) begins on a long side
/**
 * Where an outline (film pixels, four corners going round) lies on the table: the pixel of the card's middle, its turn on the
 * felt (radians, as realCardQuad takes it), whether the outline begins on one of the card's long sides (`turned`: the card's
 * own first corner is then the outline's second) and whether it runs the other way round than a card seen from above
 * (`mirrored`). `shape` is the plan's shape the outline was drawn with (planShape; 0 for a real card's own). Null for an
 * outline that is no card on the felt (at or above the horizon, folded).
 */
export function cardPlace(outline: readonly Pixel[], shape = 0, lens: Lens = TABLE_LENS): { place: Pixel; heading: number; turned: boolean; mirrored: boolean } | null {
  if (outline.length !== 4 || !outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const near = Math.max(...outline.map((p) => p.y));
  // the keystone undone about a middle: the outline the real camera gives
  const real = (middle: number) => outline.map((p) => ({ x: middle + (p.x - middle) / Math.max(0.2, 1 - shape * (near - p.y)), y: p.y }));
  // a card's middle is where its diagonals meet, in the picture as on the felt; the middle the keystone was made about is
  // found by going round (each turn brings it about twenty times nearer)
  const meet = (q: Pixel[]): Pixel | null => {
    const [a, b, c, d] = q, rx = c.x - a.x, ry = c.y - a.y, sx = d.x - b.x, sy = d.y - b.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((b.x - a.x) * sy - (b.y - a.y) * sx) / den;
    return { x: a.x + rx * t, y: a.y + ry * t };
  };
  let place = meet([...outline]);
  for (let i = 0; place && shape && i < 8; i++) place = meet(real(place.x));
  if (!place) return null;
  const felt = real(place.x).map((p) => pixelToFelt(p, lens));
  if (!felt.every(Boolean)) return null;
  const [a, b, c, d] = felt as [number, number, number][], mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[2] + q[2]) / 2];
  let up = [mid(a, b)[0] - mid(d, c)[0], mid(a, b)[1] - mid(d, c)[1]], right = [mid(b, c)[0] - mid(a, d)[0], mid(b, c)[1] - mid(a, d)[1]];
  const turned = Math.hypot(right[0], right[1]) > SIDEWAYS * Math.hypot(up[0], up[1]);
  if (turned) [up, right] = [right, [-up[0], -up[1]]]; // the long way is the card's length
  if (!(Math.hypot(up[0], up[1]) > 1e-9)) return null;
  const heading = Math.atan2(up[0], -up[1]);
  return { place, heading, turned, mirrored: right[0] * Math.cos(heading) + right[1] * Math.sin(heading) < 0 };
}
/**
 * The rule's card where an outline lies: a card `grow` times a real one at the outline's place and turn, through the lens, in
 * the plan's `shape`; film pixels, in the card's own corner order as the outline has it (the corners of its far short side
 * first; `turned` says that this is the outline's order a quarter turn on). An outline that is itself the rule's card of size 1
 * comes back as it is (within a thousandth of a pixel). Null where cardPlace gives none.
 */
export function planCardFrom(outline: readonly Pixel[], shape = 0, grow = 1, lens: Lens = TABLE_LENS): { quad: Pixel[]; turned: boolean } | null {
  const at = cardPlace(outline, shape, lens), q = at ? realCardQuad(at.place, at.heading, grow, lens) : null;
  if (!at || !q) return null;
  const k = keystone(q, at.place.x, shape);
  return { quad: at.mirrored ? [k[1], k[0], k[3], k[2]] : k, turned: at.turned };
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
