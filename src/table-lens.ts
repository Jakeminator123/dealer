// The table's lens: the one camera under which a real playing card and the dealer herself both have their film sizes.
// Place in, outline out: a real card lying at a place of the bank's picture, or standing in the shoe's window, as four
// corners in the bank's pixels. Pure and self-contained: no imports, no I/O, so it can be lifted as it stands.
//
// World frame, the scene's own (src/scene3d-geometry.ts): x toward image right, y up, z toward the camera, the felt is
// y = 0, and the film camera stands at (0, height, 0) looking along -z, pitched down. Real metres, no scale factor.
// Pixels are pixel centres of the bank's frame (1764 x 1174), origin top left.
//
// Why another lens than the contract's (data/scene-contract.json): that one is fitted to the plan's card outlines, whose
// perspective (a card narrowing to 0.87) belongs to a wide lens 0.76 m from the card; under it the dealer is twice the
// size of a person, which is the contract's own k = 2. This lens is the one of the family that gives the card at seat 4
// its film size and shape (dealer3d/src/camera.ts, lensForFocal) which draws her knuckles, shoulders and pupils nearest
// their real sizes (dealer3d/src/world.ts, filmLens; a test holds the numbers below to that fit). Two things that took
// no part in the fit agree with it: the shoe's foot comes out 0.45 m long, and the card standing in the shoe's window is
// 0.94 of a real card's length (0.95 where the shoe model itself puts the card).
export const FILM = {width: 1764, height: 1174};
/** The card of data/scene-contract.json (cardMillimetres, 63 x 88), in metres; thickness and corner radius for a drawn card. */
export const CARD = {width: 0.063, height: 0.088, thickness: 0.0003, corner: 0.0035};
export type Vec3 = [number, number, number];
export type Pixel = {x: number; y: number};
/** The film camera: focal length in pixels, pitch below the horizontal in radians, height over the felt in metres. */
export type Lens = {focalPx: number; pitch: number; height: number};
/** Any pinhole without roll: where it stands, where it looks, and its focal length in film pixels. */
export type Eye = {position: Vec3; forward: Vec3; focalPx: number};

/**
 * The lens. Vertical field of view 28.2 degrees, pitched 25.06 degrees down, 1.110 m over the felt and 1.844 m from the
 * dealer's edge of the table. Rests on: the card lying at seat 4 in paow-giv-2-1-p4-11-01 (near edge 84.5 px, 72 px deep,
 * measured on frame 120), her knuckles, shoulders and pupils read by eye on the anchor paow-nyp-ung-1 (within 10 px), and
 * the assumptions that those are 76, 400 and 62 mm in life and that she sits 0.18 m behind the table edge
 * (dealer3d/src/world.ts, MEASURED and ASSUMED). A focal length between 2000 and 2300 gives the same picture to within
 * two pixels a card; under 1500 she is plainly too large.
 */
export const TABLE_LENS: Lens = {focalPx: 2334, pitch: 0.4373194931932115, height: 1.1099955533438894};

const CX = (FILM.width - 1) / 2, CY = (FILM.height - 1) / 2;
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => mul(a, 1 / (length(a) || 1));
const basis = (e: Eye) => { const f = unit(e.forward), r = unit(cross(f, [0, 1, 0])); return {f, r, u: cross(r, f)}; };
const ray = (e: Eye, px: number, py: number): Vec3 => { const {f, r, u} = basis(e); return add(add(f, mul(r, (px - CX) / e.focalPx)), mul(u, -(py - CY) / e.focalPx)); };

export const filmEye = (l: Lens): Eye => ({position: [0, l.height, 0], forward: [0, -Math.sin(l.pitch), -Math.cos(l.pitch)], focalPx: l.focalPx});
export const horizonRow = (l: Lens) => CY - l.focalPx * Math.tan(l.pitch);
export const fovYDeg = (focalPx: number) => 2 * Math.atan(FILM.height / 2 / focalPx) * 180 / Math.PI;

/** A world point as this eye sees it, in film pixels; null behind the eye. */
export function see(e: Eye, p: Vec3): Pixel | null {
  const {f, r, u} = basis(e), d = sub(p, e.position), z = dot(d, f);
  return z > 1e-9 ? {x: CX + e.focalPx * dot(d, r) / z, y: CY - e.focalPx * dot(d, u) / z} : null;
}
/** The point where the ray through a pixel meets the horizontal plane `lift` metres over the felt; null at or above the horizon. */
export function onPlane(e: Eye, px: number, py: number, lift = 0): Vec3 | null {
  const d = ray(e, px, py); return d[1] > -1e-9 ? null : add(e.position, mul(d, (lift - e.position[1]) / d[1]));
}
/** The point where the ray through a pixel meets the upright plane that faces the film camera at depth `z`; null if it never does. */
export function onUpright(e: Eye, px: number, py: number, z: number): Vec3 | null {
  const d = ray(e, px, py), t = (z - e.position[2]) / d[2]; return Number.isFinite(t) && t > 0 ? add(e.position, mul(d, t)) : null;
}
/** The same eye carried around the vertical line through `pivot`; a positive angle (radians) moves it toward image right. */
export function orbit(e: Eye, pivot: Vec3, angle: number): Eye {
  const c = Math.cos(angle), s = Math.sin(angle), turn = (v: Vec3): Vec3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return {position: add(pivot, turn(sub(e.position, pivot))), forward: turn(e.forward), focalPx: e.focalPx};
}

/** The four corners of a card lying flat at `centre`: far left, far right, near right, near left for heading 0. `grow` enlarges the card about its middle. */
export function cardCorners(centre: Vec3, heading = 0, grow = 1): Vec3[] {
  const c = Math.cos(heading), s = Math.sin(heading), right: Vec3 = [c, 0, s], away: Vec3 = [s, 0, -c], hw = CARD.width * grow / 2, hh = CARD.height * grow / 2;
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => add(centre, add(mul(right, a * hw), mul(away, b * hh))));
}
/** How a lying card's outline measures on screen: its far and near edge, its depth between their middles, and far over near (the taper). */
export function quadMeasure(q: Pixel[]) {
  const d = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y), mid = (a: Pixel, b: Pixel): Pixel => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
  const far = d(q[0], q[1]), near = d(q[3], q[2]);
  return {far, near, depth: d(mid(q[0], q[1]), mid(q[3], q[2])), taper: far / near};
}
/** The sides of a card's outline on screen: the mean of its two short sides and of its two long sides, in pixels. */
export function sides(q: Pixel[]) {
  const d = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
  return {short: (d(q[0], q[1]) + d(q[3], q[2])) / 2, long: (d(q[1], q[2]) + d(q[0], q[3])) / 2};
}

/**
 * A real card lying on the felt at a place of the bank's picture, as the film camera draws it: its four corners in the
 * bank's pixels, clockwise on screen in the card's own order, as the card track orders them: for heading 0 top left, top
 * right, bottom right, bottom left, and the same corners of the card when it is turned. `place` is the pixel of the card's
 * middle; `heading` turns the card on the felt (radians, 0 = its long side straight away from the camera, positive toward
 * image right); `grow` draws a card that many times a real one about the same middle (1.025 gives seat 4 the 86.6 px near
 * edge of the plan of 2026-11-17, the film's own card there being 84.5). Null for a place at or above the horizon.
 */
export function realCardQuad(place: Pixel, heading = 0, grow = 1, lens: Lens = TABLE_LENS): Pixel[] | null {
  const eye = filmEye(lens), at = onPlane(eye, place.x, place.y); if (!at) return null;
  const q = cardCorners(at, heading, grow).map(p => see(eye, p)); return q.every(Boolean) ? q as Pixel[] : null;
}
/** The pixel of a place of the plan (normalised, bottom-up: placements/default.json, geometry.native u and v). */
export const planPixel = (place: {u: number; v: number}): Pixel => ({x: place.u * (FILM.width - 1), y: (1 - place.v) * (FILM.height - 1)});
/** realCardQuad for a place of the plan. */
export const realCardQuadAt = (place: {u: number; v: number}, heading = 0, grow = 1, lens: Lens = TABLE_LENS): Pixel[] | null => realCardQuad(planPixel(place), heading, grow, lens);

// ---- the shoe -------------------------------------------------------------------------------------------------
// The dealing shoe as a real object standing on the felt, and the next card in it. Measured: the foot of the shoe's near
// wall, read by eye on frame 36 of paow-giv-2-1-p4-11-01 (within 10 px), and the yellow card standing in the window on
// frame 120 (the track's colour rule; corners top left, top right, bottom right, bottom left; 51.0 x 92.2 px). Assumed:
// the shoe's measures, that its front plate leans 58 degrees back from the felt, and that the card's lower edge is 12 mm
// over the felt. A plate that leans 50 or 65 degrees changes the card's length on screen by under 3 px.
export const SHOE_FOOT = {front: {x: 1262, y: 890}, back: {x: 1688, y: 800}};
export const SHOE_WINDOW_CARD: Pixel[] = [{x: 1298, y: 756}, {x: 1340, y: 785}, {x: 1285, y: 859}, {x: 1243, y: 830}];
export const SHOE = {length: 0.42, width: 0.118, backHeight: 0.19, frontHeight: 0.105, plateLean: 58 * Math.PI / 180, windowLift: 0.012};
/** Where the shoe stands: the front end of its near wall on the felt, the direction from front to back, across the shoe away from the camera, and the length of the foot read off the film. */
export type ShoePose = {front: Vec3; back: Vec3; far: Vec3; footLength: number};
export function shoePose(lens: Lens = TABLE_LENS): ShoePose {
  const eye = filmEye(lens), f = onPlane(eye, SHOE_FOOT.front.x, SHOE_FOOT.front.y)!, b = onPlane(eye, SHOE_FOOT.back.x, SHOE_FOOT.back.y)!;
  const footLength = Math.hypot(b[0] - f[0], b[2] - f[2]), back: Vec3 = [(b[0] - f[0]) / footLength, 0, (b[2] - f[2]) / footLength];
  const side: Vec3 = [-back[2], 0, back[0]]; // across the shoe; the wall read off the film is the near one, so the body lies away from the camera (-z)
  return {front: f, back, far: side[2] <= 0 ? side : [-side[0], 0, -side[2]], footLength};
}
/**
 * The next card in the shoe: a real card lying against the front plate in the middle of the shoe, its long side up the
 * plate, its lower short side `windowLift` over the felt. Its centre, the direction of its long side (up the plate, leaning
 * back by `plateLean` from the felt) and of its short side.
 */
export function shoeCard(pose: ShoePose, shoe = SHOE): {centre: Vec3; up: Vec3; across: Vec3} {
  const c = Math.cos(shoe.plateLean), s = Math.sin(shoe.plateLean), up: Vec3 = [pose.back[0] * c, s, pose.back[2] * c];
  // The plate rises from the shoe's front bottom edge; the card's lower edge is where the plate is `windowLift` over the felt,
  // and the card lies a millimetre outside the plate so that it is the plate's face one sees.
  const along = shoe.windowLift / s + CARD.height / 2, out: Vec3 = [-pose.back[0] * s, c, -pose.back[2] * s], mid: Vec3 = [pose.front[0] + pose.far[0] * shoe.width / 2, 0, pose.front[2] + pose.far[2] * shoe.width / 2];
  return {centre: [mid[0] + up[0] * along + out[0] * 0.001, up[1] * along + out[1] * 0.001, mid[2] + up[2] * along + out[2] * 0.001], up, across: pose.far};
}
/** A card in space from its centre and the directions of its long and short sides: the two corners at the long side's far end first, then the other two, going round. */
export function cardInSpace(centre: Vec3, up: Vec3, across: Vec3, grow = 1): Vec3[] {
  const hw = CARD.width * grow / 2, hh = CARD.height * grow / 2;
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => add(centre, add(mul(across, a * hw), mul(up, b * hh))));
}
/**
 * A real card standing in the shoe's window, as the film camera draws it: four corners in the bank's pixels, clockwise on
 * screen from the upper left one (the upper short side first). The card leans on the shoe's front plate; `centre` is
 * the pixel of its middle (by default the middle of the card the film has in the window), `grow` as in realCardQuad.
 */
export function shoeCardQuad(centre: Pixel | null = null, grow = 1, lens: Lens = TABLE_LENS): Pixel[] {
  const eye = filmEye(lens), card = shoeCard(shoePose(lens)), normal = unit(cross(card.up, card.across));
  const want = centre ?? {x: SHOE_WINDOW_CARD.reduce((s, p) => s + p.x, 0) / 4, y: SHOE_WINDOW_CARD.reduce((s, p) => s + p.y, 0) / 4};
  const d = ray(eye, want.x, want.y), t = dot(sub(card.centre, eye.position), normal) / dot(d, normal), at = add(eye.position, mul(d, t)); // where that pixel's ray meets the plate
  const q = cardInSpace(at, card.up, card.across, grow).map(p => see(eye, p)!), area = q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p.x * n.y - n.x * p.y; }, 0);
  return area >= 0 ? q : [q[1], q[0], q[3], q[2]]; // clockwise on screen (y runs down), the upper short side first
}

// ---- the family of lenses ---------------------------------------------------------------------------------------
// The card lying at seat 4 has its film size and shape under a whole family of lenses, from a wide one close by to a long
// one far away; the focal length alone decides how much a card narrows toward its far edge and how fast the cards shrink
// away from the camera. TABLE_LENS is the member that draws the dealer at her real size (a card narrows to 0.956), and the
// one the card plan draws through (src/card-plan.ts: Kortplan's "Perspektiv" changes only a card's shape, not the lens).
// drawnCard and lensForFocal are lifted word for word from dealer3d/src/camera.ts (with the type of their card named here);
// the card is world.ts MEASURED.restingCard.

/** The card lying at seat 4 in paow-giv-2-1-p4-11-01, frame 120: its centre pixel, near edge and depth (dealer3d/src/world.ts, MEASURED.restingCard). */
export type FilmCard = {centre: Pixel; nearPx: number; depthPx: number};
export const SEAT_FOUR_CARD: FilmCard = {centre: {x: 857, y: 1102}, nearPx: 84.5, depthPx: 72};
/** A card lying flat with its centre at a pixel, as a lens draws it (its measures on screen), or null out of sight. */
export function drawnCard(l: Lens, centre: Pixel) {
  const eye = filmEye(l), at = onPlane(eye, centre.x, centre.y); if (!at) return null;
  const q = cardCorners(at).map(p => see(eye, p)); return q.every(Boolean) ? quadMeasure(q as Pixel[]) : null;
}
/**
 * The one lens of a given focal length under which the flat card has its film size and shape: the shape on screen (depth
 * over near edge) fixes the pitch and the size fixes the height, each by bisection. The focal length stays free: the card's
 * size and shape alone leave a family of lenses, from a wide one close by to a long one far away.
 */
export function lensForFocal(card: FilmCard, focalPx: number): Lens {
  const want = card.depthPx / card.nearPx, cy = (FILM.height - 1) / 2;
  const sized = (pitch: number): Lens => { // the height at which the near edge has its film length
    let lo = 0.05, hi = 8; for (let i = 0; i < 60; i++) { const h = (lo + hi) / 2, m = drawnCard({focalPx, pitch, height: h}, card.centre); if (!m || m.near > card.nearPx) lo = h; else hi = h; }
    return {focalPx, pitch, height: (lo + hi) / 2};
  };
  let lo = -Math.atan((card.centre.y - cy) / focalPx) + 0.02, hi = 1.4; // from just under the card's own line of sight to steeply down
  for (let i = 0; i < 60; i++) { const pitch = (lo + hi) / 2, m = drawnCard(sized(pitch), card.centre); if (!m || m.depth / m.near < want) lo = pitch; else hi = pitch; }
  return sized((lo + hi) / 2);
}
