// Pure geometry for the 3D scene tab: the film camera read from data/scene-contract.json and the mapping
// between film pixels and the table top. No I/O and no three.js, so Node can test it.
// World frame, metres: x toward image right, y up, z toward the camera. The felt is y = 0, the film camera
// stands at (0, heightM, 0) looking along -z, pitched down. Lengths are in the contract's plan scale;
// `scale` (the contract's k) says how many times larger the dealer's own world is.
// The pinhole itself is the one in src/scene-geometry.ts (table millimetres, Y away from the camera); this file only changes frame.
import {applyH, cameraHomography, cameraProject, inv3, type Camera} from './scene-geometry.ts';

export const FILM = {width: 1764, height: 1174};
export type FilmCamera = {focalPx: number; horizonRow: number; edgeRow: number; heightM: number; scale: number; source: 'contract' | 'estimate'};
export type TablePoint = {x: number; z: number};
export type Spot = {id: string; x: number; s: number}; // dealer metres: x across the table, s from the dealer-side edge toward the players
const CX = (FILM.width - 1) / 2, CY = (FILM.height - 1) / 2;

// A lens estimated from the dealer herself (proportions, horizon at eye height). Not measured; kept only for comparison.
export const DEALER_LENS_ESTIMATE: FilmCamera = {focalPx: 1270, horizonRow: 215, edgeRow: 831.5, heightM: 0.55, scale: 1, source: 'estimate'};

type Figure = {value?: unknown};
const figure = (group: Record<string, Figure> | undefined, name: string): number => {
  const v = group?.[name]?.value; if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`scene-contract.json saknar keyFigures.${name}.value.`); return v;
};
// The plan's camera. The contract states that the dealer was not drawn with this lens; it is the one that fits the card quads.
export function cameraFromContract(contract: {keyFigures?: Record<string, Figure>; cardSizeAtTargets?: {scale?: {bodyScale?: {k?: unknown}}}}): FilmCamera {
  const k = contract.keyFigures, focalPx = figure(k, 'focalPx'), tilt = figure(k, 'tiltDownDeg') * Math.PI / 180, body = contract.cardSizeAtTargets?.scale?.bodyScale?.k;
  return {focalPx, horizonRow: CY - focalPx * Math.tan(tilt), edgeRow: figure(k, 'dealerEdgeImageRow'), heightM: figure(k, 'heightAboveFeltMm') / 1000, scale: typeof body === 'number' && body > 0 ? body : 1, source: 'contract'};
}
// Pitch below the horizontal (radians), ground distance from below the camera to the dealer-side table edge, vertical field of view.
export function solveCamera(c: FilmCamera) {
  const pitch = Math.atan((CY - c.horizonRow) / c.focalPx), edgeDistance = c.heightM / Math.tan(pitch + Math.atan((c.edgeRow - CY) / c.focalPx));
  return {pitch, edgeDistance, fovYDeg: 2 * Math.atan(FILM.height / 2 / c.focalPx) * 180 / Math.PI};
}
const pinhole = (c: FilmCamera): Camera => ({focalPx: c.focalPx, cx: CX, cy: CY, pitchDeg: solveCamera(c).pitch * 180 / Math.PI, rollDeg: 0, yawDeg: 0, heightMm: c.heightM * 1000, x: 0, y: 0});
// Film pixel -> point on the felt, or null for a pixel at or above the table's vanishing line.
export function filmToTable(c: FilmCamera, px: number, py: number): TablePoint | null {
  if (py <= c.horizonRow + 1e-9) return null;
  const p = applyH(inv3(cameraHomography(pinhole(c))), {x: px, y: py}); return {x: p.x / 1000, z: -p.y / 1000};
}
export const tableToFilm = (c: FilmCamera, x: number, z: number): {x: number; y: number} => cameraProject(pinhole(c), {x: x * 1000, y: -z * 1000, z: 0});
// Vertical field of view of a view that shows the whole film frame at zoom 1: fitted by height on wide canvases, by width on tall ones.
export function viewFovDeg(c: FilmCamera, aspect: number, zoom = 1): number {
  const half = aspect >= FILM.width / FILM.height ? FILM.height / 2 / c.focalPx : FILM.width / 2 / c.focalPx / aspect;
  return 2 * Math.atan(half / zoom) * 180 / Math.PI;
}
// Extra yaw and pitch (radians, three.js sign: yaw turns toward -x) that keep `pivot` where it was when the camera moves from `base` to `moved`.
export function aimCorrection(base: number[], moved: number[], pivot: number[]): {yaw: number; pitch: number} {
  const a = pivot.map((v, i) => v - base[i]), b = pivot.map((v, i) => v - moved[i]);
  return {yaw: Math.atan2(-b[0], -b[2]) - Math.atan2(-a[0], -a[2]), pitch: Math.atan2(b[1], Math.hypot(b[0], b[2])) - Math.atan2(a[1], Math.hypot(a[0], a[2]))};
}
// Card places of the placement plan (native view, normalised bottom-up) laid back onto the felt. Read only.
export function cardSpots(plan: {targets?: Record<string, {geometry?: {native?: {u?: number; v?: number}}}>} | null, c: FilmCamera): Spot[] {
  const edge = -solveCamera(c).edgeDistance, out: Spot[] = [];
  for (const [id, target] of Object.entries(plan?.targets ?? {})) {
    const n = target.geometry?.native; if (typeof n?.u !== 'number' || typeof n?.v !== 'number') continue;
    const p = filmToTable(c, n.u * (FILM.width - 1), (1 - n.v) * (FILM.height - 1)); if (!p) continue;
    const spot = {id, x: p.x / c.scale, s: (p.z - edge) / c.scale}; if (spot.s > -0.05 && spot.s < 1.2) out.push(spot);
  }
  return out;
}

// Where a film pixel lies in the scene: on the felt from the dealer edge row downward, on the vertical plane standing on that edge above it.
export function filmToScene(c: FilmCamera, px: number, py: number): [number, number, number] {
  const {pitch, edgeDistance} = solveCamera(c), table = py >= c.edgeRow ? filmToTable(c, px, py) : null;
  if (table) return [table.x, 0, table.z];
  const u = px - CX, v = py - CY, forward = c.focalPx * Math.cos(pitch) - v * Math.sin(pitch), t = edgeDistance / forward;
  return [u * t, c.heightM - (v * Math.cos(pitch) + c.focalPx * Math.sin(pitch)) * t, -edgeDistance];
}
// How blurred something at `distance` is when the picture is focused at `focus`: 0 inside the tolerance band, toward 1 far
// away. Behind the focus this is the thin-lens shape (1 - focus / distance); in front of it the mirror image is used, which
// is gentler than a real lens, so the near felt does not dissolve when the dealer is sharp. The shader in scene3d-view.ts follows this.
export function lensBlur(distance: number, focus: number, tolerance: number): number {
  return Math.max(0, Math.min(1, (Math.abs(distance - focus) / Math.max(distance, focus) - tolerance) / (1 - tolerance)));
}
export type CardTrack = {leavesShoe?: number | null; restFrom?: number | null; frames?: {frame: number; quad?: number[][] | null; edge?: number[][] | null}[]};
// The film pixel to keep sharp while a card is dealt: the card's centre from shortly before it leaves the shoe until
// shortly after it has come to rest. Null otherwise: a card lying still is not the subject, the dealer is.
export function cardFocusPixel(track: CardTrack | null, frame: number, lead = 6, hold = 18): {x: number; y: number} | null {
  if (!track?.frames || typeof track.leavesShoe !== 'number' || typeof track.restFrom !== 'number') return null;
  if (frame < track.leavesShoe - lead || frame > track.restFrom + hold) return null;
  return cardPixel(track, frame);
}
// Centre of the tracked card on a frame, wherever it is; null when the frame has neither quad nor edge.
export function cardPixel(track: CardTrack | null, frame: number): {x: number; y: number} | null {
  const entry = track?.frames?.find(f => f.frame === frame), points = entry?.quad ?? entry?.edge;
  if (!points?.length) return null;
  return {x: points.reduce((s, p) => s + p[0], 0) / points.length, y: points.reduce((s, p) => s + p[1], 0) / points.length};
}

// ---- a card as an object in the scene ---------------------------------------------------------------------
// The rendered card is geometry in the scene (src/scene3d-deal.ts), placed so that seen from the film camera it covers the
// film's card exactly: each point of the card is where the film's own surfaces (filmToScene) carry the film pixel that the
// card's homography gives it. The card thereby lies on the felt like the film's hands, and stays with them when the view
// moves. A true 3D pose solved from the quad (a card of known size seen by the known camera) was tried and dropped: the
// tracked corners are a few pixels off a true perspective rectangle, and a 70 px card has only about 8 px of perspective,
// so the lying P4 card came out 13 cm under the felt and tilted 35 degrees.
export type Vec3 = [number, number, number];
/**
 * The projective map of the unit square onto a quad (row-major, last element 1): (0,0), (1,0), (1,1), (0,1) go to the
 * quad's corners in order. Card coordinates u to the right and v downward of the visible print, as the track orders its
 * corners (top left, top right, bottom right, bottom left), so a print laid with it sits on the film's card exactly.
 */
export function squareToQuad(q: number[][]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) throw Error('Degenerate card quad.');
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
export const onSquare = (H: number[], u: number, v: number): [number, number] => { const w = H[6] * u + H[7] * v + H[8]; return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w]; };
/**
 * A point of the card in the scene: card coordinates through the homography to a film pixel, laid on the film's surfaces,
 * `lift` metres over the felt. The vertex shader of src/scene3d-deal.ts does the same per vertex; this copy is for tests.
 */
export function cardPoint(c: FilmCamera, H: number[], u: number, v: number, lift = 0): Vec3 {
  const [px, py] = onSquare(H, u, v), p = filmToScene(c, px, py); if (p[1] !== 0 || !lift) return p;
  const s = (c.heightM - lift) / c.heightM; return [p[0] * s, lift, p[2] * s]; // along the film camera's ray, so the pixel stays
}
/** A scene point seen from the film camera, in film pixels; null behind the camera. */
export function filmPixel(c: FilmCamera, p: Vec3): {x: number; y: number} | null {
  const q = solveCamera(c).pitch, cq = Math.cos(q), sq = Math.sin(q), y = p[1] - c.heightM, z = p[2], forward = -y * sq - z * cq;
  return forward > 1e-9 ? {x: CX + c.focalPx * p[0] / forward, y: CY + c.focalPx * (-y * cq + z * sq) / forward} : null;
}
/** An edge-on card as a thin quad along its edge line, `half` pixels to each side, in texture order (clockwise on screen). */
export function edgeQuad(a: number[], b: number[], half: number): number[][] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * half, ny = (b[0] - a[0]) / l * half;
  const q = [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]];
  const area = q.reduce((s, p, i) => { const r = q[(i + 1) % 4]; return s + p[0] * r[1] - r[0] * p[1]; }, 0);
  return area >= 0 ? q : [q[1], q[0], q[3], q[2]];
}
/**
 * How large the rendered card is drawn in the hand, as a share of the overlay's own size there (card-overlay.ts poseAt,
 * which makes it MARGIN times the film's card so that the film's card cannot show beside it). The scene keys the film's card
 * away instead, so in the hand the card can be the film's card itself (`held` = 1 / MARGIN): fingers that hold its edge then
 * hold the rendered card's edge. It grows to the plan's resting size while it settles (`resting` 0 to 1).
 */
export const heldScale = (resting: number, held: number): number => held + (1 - held) * Math.max(0, Math.min(1, resting));

// ---- time: what moves by the clock, kept pure so it can be tested ---------------------------------------
// Angles of a clock's hands in radians, clockwise from twelve. Every hand creeps; none of them ticks.
export function clockAngles(hours: number, minutes: number, seconds: number): {hour: number; minute: number; second: number} {
  const turn = 2 * Math.PI; return {second: seconds / 60 * turn, minute: (minutes + seconds / 60) / 60 * turn, hour: (hours % 12 + minutes / 60 + seconds / 3600) / 12 * turn};
}
// A lamp that flickers now and then: 1 most of the time, and once in every `every` seconds a short burst of dips,
// at most down to 1 - strength. Decided by the time alone, so nothing has to be stored and the same second always looks the same.
export function flickerLevel(seconds: number, every: number, strength: number): number {
  if (!(every > 0) || !(strength > 0) || !Number.isFinite(seconds)) return 1;
  const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const slot = Math.floor(seconds / every), length = Math.min(every, 0.5 + hash(slot + 0.5) * 0.7), t = seconds - (slot * every + hash(slot) * (every - length));
  if (t < 0 || t > length) return 1;
  const dip = hash(slot * 31 + Math.floor(t / 0.06)); // a new dip every 60 ms, strongest in the middle of the burst
  return 1 - Math.min(1, strength) * Math.sin(Math.PI * t / length) * (dip > 0.45 ? dip : 0.15);
}
// A cloud passing the sun, for rooms lit from outside: 1 most of the time, and once in every `every` seconds a smooth dip of
// three to five seconds, at most down to 1 - strength. Same rule as the flicker: the time alone decides.
export function cloudLevel(seconds: number, every: number, strength: number): number {
  if (!(every > 0) || !(strength > 0) || !Number.isFinite(seconds)) return 1;
  const hash = (n: number) => { const x = Math.sin(n * 91.7 + 17.3) * 24634.6345; return x - Math.floor(x); };
  const slot = Math.floor(seconds / every), length = Math.min(every, 3 + hash(slot + 0.5) * 2), t = seconds - (slot * every + hash(slot) * (every - length));
  return t < 0 || t > length ? 1 : 1 - Math.min(1, strength) * Math.sin(Math.PI * t / length) ** 2;
}

// Bet rings: one per player seat, a little past the seat's first card toward the player. The felt prints them from
// this and a game reads the same list, so print and game cannot drift apart. Dealer metres, seats in order.
export const BET = {offset: 0.068, radius: 0.027};
export type BetSpot = {id: string; x: number; s: number; radius: number};
export function betSpots(plan: Parameters<typeof cardSpots>[0], c: FilmCamera): BetSpot[] {
  return cardSpots(plan, c).filter(p => /^P[0-9]+[.]C1$/.test(p.id)).map(p => ({id: p.id.split('.')[0], x: p.x, s: p.s + BET.offset, radius: BET.radius}))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}
// A point in dealer metres (x across the table, s from the dealer-side edge toward the players, y above the felt) as a
// scene position, and a scene position on the felt back in dealer metres.
export function spotToScene(c: FilmCamera, x: number, s: number, y = 0): [number, number, number] { return [x * c.scale, y * c.scale, s * c.scale - solveCamera(c).edgeDistance]; }
export function sceneToSpot(c: FilmCamera, x: number, z: number): {x: number; s: number} { return {x: x / c.scale, s: (z + solveCamera(c).edgeDistance) / c.scale}; }
