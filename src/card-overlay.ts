// Pure model for the live rendered card over a film: where the card is in a frame, how large it is
// drawn and what the film shows around it. Position, rotation and side come from the card track
// (tools/track-card.ts); size does not: a card has one physical size, taken from the scene contract.
// No DOM, WebGL or file access here. The drawing itself is src/card-overlay-view.ts.
import {classify, morph, grown, centre, signedArea, inside, clockwise, YELLOW, BLUE, SHADE, TINT, TABLE, SKIN, DARK, type Pt, type Side} from './card-track.ts';

export type TrackFrame = {frame: number; side: Side; quad: number[][] | null; edge: number[][] | null; confidence?: number; shoeShare?: number};
export type CardTrack = {clip?: string; width: number; height: number; frames: TrackFrame[]; edgeWindow: [number, number] | null; flips?: {from: number; to: number; quarterTurns: number}[];
  leavesShoe?: number | null; restFrom: number | null; restQuad: number[][] | null; shoeWindow?: {box: number[]} | null};
// toImage/toTable are homographies as eight numbers (the ninth is 1): table millimetres <-> image pixels.
export type Scene = {toImage: number[]; toTable: number[]; cardWidth: number; cardHeight: number; bodyScale: number};
export const RIM = 4; // the film's pale rim and its blur outside the tracked colour core, in pixels
export const SCALE = {min: 1, max: 2.5, fallback: 2};
const pts = (q: number[][]): Pt[] => q.map(([x, y]) => ({x, y}));
const apply = (h: number[], p: Pt): Pt => { const w = h[6] * p.x + h[7] * p.y + 1; return {x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w}; };
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const size = (q: Pt[]) => Math.sqrt(Math.abs(signedArea(q)));
const about = (q: Pt[], s: number): Pt[] => { const c = centre(q); return q.map(p => ({x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s})); };
const mix = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => ({x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t}));

/** What the overlay needs from data/scene-contract.json, or null if the contract is not what it expects. */
export function sceneOf(contract: unknown): Scene | null {
  const c = contract as {keyFigures?: {homographyTableMmToImagePx?: {matrix?: number[][]}}; cardMillimetres?: {width?: number; height?: number}; cardSizeAtTargets?: {scale?: {bodyScale?: {k?: number}}}};
  const m = c?.keyFigures?.homographyTableMmToImagePx?.matrix, width = c?.cardMillimetres?.width, height = c?.cardMillimetres?.height, k = c?.cardSizeAtTargets?.scale?.bodyScale?.k;
  if (!Array.isArray(m) || m.length !== 3 || m.some(row => !Array.isArray(row) || row.length !== 3 || row.some(v => !Number.isFinite(v))) || !Number.isFinite(width) || !Number.isFinite(height) || !(width! > 0) || !(height! > 0)) return null;
  const [[a, b, cc], [d, e, f], [g, h, i]] = m, det = a * (e * i - f * h) - b * (d * i - f * g) + cc * (d * h - e * g);
  if (!i || Math.abs(det) < 1e-12) return null;
  const inv = [e * i - f * h, cc * h - b * i, b * f - cc * e, f * g - d * i, a * i - cc * g, cc * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  return {toImage: [a, b, cc, d, e, f, g, h].map(v => v / i), toTable: inv.slice(0, 8).map(v => v / inv[8]), cardWidth: width!, cardHeight: height!,
    bodyScale: Number.isFinite(k) && k! >= SCALE.min && k! <= SCALE.max ? k! : SCALE.fallback};
}

/**
 * The card lying on the table at the film card's place and direction, but in its own constant size:
 * `scale` times the contract's card. `film` is the film's resting quad in texture order (top left,
 * top right, bottom right, bottom left). `turned` reports the quarter-turn correction: the tracker
 * takes the more horizontal sides of a foreshortened card as top and bottom, so a card that really
 * lies sideways arrives a quarter turn off, and is turned back here so the footprint is covered.
 */
export function restingQuad(scene: Scene, film: Pt[], scale: number): {quad: Pt[]; turned: boolean} {
  const t = film.map(p => apply(scene.toTable, p)), c = centre(t), mid = (a: Pt, b: Pt): Pt => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
  let up = {x: mid(t[0], t[1]).x - mid(t[3], t[2]).x, y: mid(t[0], t[1]).y - mid(t[3], t[2]).y}, right = {x: mid(t[1], t[2]).x - mid(t[0], t[3]).x, y: mid(t[1], t[2]).y - mid(t[0], t[3]).y};
  const turned = Math.hypot(right.x, right.y) > 1.15 * Math.hypot(up.x, up.y);
  if (turned) [up, right] = [right, {x: -up.x, y: -up.y}]; // the long way becomes the card's height
  const l = Math.hypot(up.x, up.y) || 1, u = {x: up.x / l, y: up.y / l}, side = right.x * -u.y + right.y * u.x >= 0 ? 1 : -1, r = {x: -u.y * side, y: u.x * side};
  const hw = scene.cardWidth * scale / 2, hh = scene.cardHeight * scale / 2;
  const corner = (a: number, b: number) => apply(scene.toImage, {x: c.x + u.x * hh * a + r.x * hw * b, y: c.y + u.y * hh * a + r.y * hw * b});
  return {quad: [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)], turned};
}

/**
 * Where the card lies still, and from which frame. The track says so when the hand lets go inside
 * the clip. A deal that ends at the landing, fingertip still on the card, has no such stretch: there
 * the card's place in the last frame stands in, so the size has settled when the clip is cut to its return.
 */
export function restOf(track: CardTrack): {from: number; quad: Pt[]; assumed: boolean} | null {
  if (track.restFrom !== null && track.restQuad?.length === 4) { const quad = pts(track.restQuad), c = centre(quad), reach = 0.35 * size(quad), side = track.frames[track.restFrom]?.side;
    // A return starts with the card already lying there, a finger still on it: it rests from the first frame, so nothing changes size at the cut from the deal.
    const lying = track.frames.slice(0, track.restFrom).every(f => f.side === side && f.quad?.length === 4 && Math.hypot(centre(pts(f.quad)).x - c.x, centre(pts(f.quad)).y - c.y) < reach);
    return {from: lying ? 0 : track.restFrom, quad, assumed: false}; }
  const last = track.frames[track.frames.length - 1];
  if (!last || last.quad?.length !== 4 || last.side !== 'FRONT' && last.side !== 'BACK' || track.frames.length < 2) return null;
  // A card that is face up at the end of a clip has been laid down; a card that never turned and never rested is still in the hand.
  if (!track.frames.some(f => f.side !== last.side && f.side !== 'NONE')) return null;
  return {from: last.frame, quad: pts(last.quad), assumed: true};
}

export type Pose = {
  frame: number; side: Side;
  quad: Pt[] | null;      // where the rendered card is drawn, in texture order
  edge: [Pt, Pt] | null;  // edge-on frames: the line the thin edge is drawn along
  film: Pt[] | null;      // the film's own card in this frame, rim included: what must be covered
  resting: number;        // 0 in the hand, 1 lying still; in between while the size settles
  turned: boolean;
};
/**
 * The rendered card in one frame. In the hand it follows the film's quad. From `restFrom` on it is
 * the constant-size card on the table. Over the last `ease` frames before that its size moves
 * smoothly to the resting size instead of following the film, which draws the card large in the
 * hand and shrinks it in the last two frames; the shape settles over the last three.
 */
export function poseAt(track: CardTrack, scene: Scene | null, frame: number, scale: number, ease = 12): Pose | null {
  const at = Math.max(0, Math.min(track.frames.length - 1, Math.round(frame))), f = track.frames[at];
  if (!f) return null;
  const none: Pose = {frame: at, side: f.side, quad: null, edge: null, film: null, resting: 0, turned: false};
  if (f.side === 'EDGE' && f.edge?.length === 2) return {...none, edge: [{x: f.edge[0][0], y: f.edge[0][1]}, {x: f.edge[1][0], y: f.edge[1][1]}]};
  if ((f.side !== 'BACK' && f.side !== 'FRONT') || f.quad?.length !== 4) return none;
  const film = grown(pts(f.quad), RIM), landed = restOf(track);
  if (!landed) return {...none, quad: film, film};
  // Without the contract the resting card can only be the film's own card, enlarged about its centre.
  const rest = landed.quad, from = landed.from, still = scene ? restingQuad(scene, rest, scale) : {quad: about(grown(rest, RIM), scale), turned: false};
  if (at >= from) return {...none, quad: still.quad, film, resting: 1, turned: still.turned};
  // The size only starts to settle once the card shows the side it will lie on.
  let start = Math.max(0, from - ease); for (let i = from - 1; i >= start; i--) if (track.frames[i].side !== track.frames[from].side || !track.frames[i].quad) { start = i + 1; break; }
  const t = at < start ? 0 : smooth((at - start + 1) / (from - start + 1)), shape = smooth((at - (from - 4)) / 4);
  const order = still.turned ? [film[1], film[2], film[3], film[0]] : film, settled = about(order, 1 + (size(still.quad) / (size(order) || 1) - 1) * t);
  return {...none, quad: mix(settled, still.quad, shape), film, resting: t, turned: still.turned};
}

/** Corners of the model card (width x height, y up, centred) and the eight numbers that carry them onto `quad`. */
export function cardToImage(quad: Pt[], width: number, height: number): number[] {
  const from = [{x: -width / 2, y: height / 2}, {x: width / 2, y: height / 2}, {x: width / 2, y: -height / 2}, {x: -width / 2, y: -height / 2}], A: number[][] = [];
  for (let i = 0; i < 4; i++) { const {x, y} = from[i], {x: u, y: v} = quad[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) throw Error('Degenerate card quad.');
    for (let r = 0; r < 8; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j < 9; j++) A[r][j] -= k * A[c][j]; } }
  return A.map((row, i) => row[8] / row[i]);
}
/**
 * A projection matrix (row major) that puts the model's x and y exactly where the homography `h`
 * puts them in a `width` x `height` image, whatever z they have. Depth is all but flattened (the
 * card is one surface a few units in front of the eye); the small z term only keeps the matrix invertible.
 */
export function projectionOf(h: number[], width: number, height: number): number[] {
  return [2 * h[0] / width - h[6], 2 * h[1] / width - h[7], 0, 2 * h[2] / width - 1,
    h[6] - 2 * h[3] / height, h[7] - 2 * h[4] / height, 0, 1 - 2 * h[5] / height,
    0, 0, -0.001, 0,
    h[6], h[7], 0, 1];
}

export type Box = {x: number; y: number; width: number; height: number};
/** The whole-pixel region of the film that a pose touches, with room for blur and fingers around it. */
export function regionOf(pose: Pose, width: number, height: number, margin = 26): Box | null {
  const points = [...(pose.quad ?? []), ...(pose.film ?? []), ...(pose.edge ?? [])];
  if (!points.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...points.map(p => p.x)) - margin)), y0 = Math.max(0, Math.floor(Math.min(...points.map(p => p.y)) - margin));
  const x1 = Math.min(width, Math.ceil(Math.max(...points.map(p => p.x)) + margin)), y1 = Math.min(height, Math.ceil(Math.max(...points.map(p => p.y)) + margin));
  return x1 - x0 < 2 || y1 - y0 < 2 ? null : {x: x0, y: y0, width: (x1 - x0) & ~1, height: (y1 - y0) & ~1};
}

export type Matte = {width: number; height: number; hand: Uint8Array; firm: Uint8Array; card: Uint8Array; ground: [number, number, number]; field: {width: number; height: number; cell: number; rgb: Uint8Array}};
/**
 * Reads one film region (RGBA at full size) with the tracker's own colour rules.
 * hand: skin and the dark sleeve, small holes closed and thin lines (a skin-toned card rim) dropped;
 * these stay in front of the card. firm: the hand without anything narrower than a finger; along the
 * border of the film's card a skin-coloured band that is not firm is the card's own pale rim. card: every pixel that carries the film card's colour, two steps
 * wider for its blur. field: what lies behind the film's card, in cells of `cell` pixels: the mean of
 * everything that is neither card nor skin, carried inwards from the nearest such cells. Whatever of
 * the film's card the rendered card does not cover is painted from it, so table stays table and a
 * card held in front of the jacket leaves jacket behind. ground is the mean table colour of the region.
 * `own` says which pixels lie on the film's own card: there only skin is hand, since a dark pixel on the
 * card is its face in finger shadow, not the sleeve. Dark green is table in a finger's shadow and is
 * never hand: kept in front it would lie as a green strip on a white card.
 */
export function readMatte(rgba: ArrayLike<number>, width: number, height: number, own?: (x: number, y: number) => boolean, cell = 4): Matte {
  const n = width * height, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2]; }
  const cls = classify(rgb, n), raw = new Uint8Array(n), film = new Uint8Array(n), sum = [0, 0, 0]; let table = 0;
  for (let i = 0; i < n; i++) { const c = cls[i], r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    // Blue mixed into its surroundings, or a blue face in finger shadow, is still card: it is tested before the dark rule.
    if (c === YELLOW || c === BLUE || c === SHADE || c === TINT || (b > r + 40 && b > 0.6 * g)) film[i] = 1;
    else if (c === SKIN) raw[i] = 1;
    else if (c === DARK) { if (g > r + 15 && g > b + 15) continue; // table in deep shadow beside a finger: background, not sleeve
      if (own?.(i % width, (i - i % width) / width)) film[i] = 1; else raw[i] = 1; }
    else if (c === TABLE) { sum[0] += r; sum[1] += g; sum[2] += b; table++; }
    else if (r > 170 && g > 150 && g > b + 25 && r >= g - 10) film[i] = 1; } // the pale cream rim of the yellow back, which no tracker class names
  const hand = morph(morph(morph(morph(raw, width, height, 2, true), width, height, 2, false), width, height, 1, false), width, height, 1, true), card = morph(film, width, height, 2, true);
  const ground: [number, number, number] = table ? [Math.round(sum[0] / table), Math.round(sum[1] / table), Math.round(sum[2] / table)] : [20, 150, 60];
  // The background field: per cell the mean of what is surely background, then filled inwards cell by cell.
  const fw = Math.ceil(width / cell), fh = Math.ceil(height / cell), acc = new Float64Array(fw * fh * 3), count = new Uint32Array(fw * fh);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * width + x; if (card[i] || cls[i] === SKIN) continue;
    const k = Math.floor(y / cell) * fw + Math.floor(x / cell); acc[k * 3] += rgb[i * 3]; acc[k * 3 + 1] += rgb[i * 3 + 1]; acc[k * 3 + 2] += rgb[i * 3 + 2]; count[k]++; }
  const out = new Uint8Array(fw * fh * 3), known = new Uint8Array(fw * fh); let open = 0;
  for (let k = 0; k < fw * fh; k++) { if (count[k] >= cell) { known[k] = 1; for (let c = 0; c < 3; c++) out[k * 3 + c] = Math.round(acc[k * 3 + c] / count[k]); } else open++; }
  for (let pass = 0; open && pass < fw + fh; pass++) { const next: number[] = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const k = y * fw + x; if (known[k]) continue; let r = 0, g = 0, b = 0, m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy, j = yy * fw + xx; if (xx < 0 || yy < 0 || xx >= fw || yy >= fh || !known[j]) continue; r += out[j * 3]; g += out[j * 3 + 1]; b += out[j * 3 + 2]; m++; }
      if (m) next.push(k, Math.round(r / m), Math.round(g / m), Math.round(b / m)); }
    if (!next.length) break;
    for (let i = 0; i < next.length; i += 4) { const k = next[i]; known[k] = 1; out[k * 3] = next[i + 1]; out[k * 3 + 1] = next[i + 2]; out[k * 3 + 2] = next[i + 3]; open--; } }
  if (open) for (let k = 0; k < fw * fh; k++) if (!known[k]) { out[k * 3] = ground[0]; out[k * 3 + 1] = ground[1]; out[k * 3 + 2] = ground[2]; }
  return {width, height, hand, firm: morph(morph(hand, width, height, 4, false), width, height, 4, true), card, ground, field: {width: fw, height: fh, cell, rgb: out}};
}
/** Whether an image point lies where the film's own card can show in this frame: its quad or its edge line, with room for motion blur. */
export function filmZone(pose: Pose, margin?: number): (x: number, y: number) => boolean {
  if (pose.film) { const q = clockwise(pose.film), reach = grown(q, margin ?? 10 + 0.12 * Math.sqrt(Math.abs(signedArea(q)))); return (x, y) => inside(reach, x, y); }
  if (pose.edge) { const [a, b] = pose.edge, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, reach = margin ?? 16;
    return (x, y) => { const t = Math.max(-0.15, Math.min(1.15, ((x - a.x) * dx + (y - a.y) * dy) / l2)); return Math.hypot(x - a.x - dx * t, y - a.y - dy * t) <= reach; }; }
  return () => false;
}

export type Override = {from: number; to: number; note: string};
/** Frame ranges where the card is drawn in front of the hand: {"cardInFront": [{"from": 72, "to": 78, "note": "..."}]}. Anything malformed is left out. */
export function overridesOf(value: unknown): Override[] {
  const list = (value as {cardInFront?: unknown})?.cardInFront;
  return (Array.isArray(list) ? list : []).flatMap((item): Override[] => { const from = Number(item?.from), to = Number(item?.to);
    return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from ? [{from, to, note: typeof item.note === 'string' ? item.note : ''}] : []; });
}
export const cardInFront = (overrides: Override[], frame: number) => overrides.some(o => frame >= o.from && frame <= o.to);

/** One line about a track for the take detail: sides, the edge-on moment, the quarter turns there and where the card comes to rest. */
export function describeTrack(track: CardTrack): string {
  const runs: string[] = []; let open: {side: Side; from: number; to: number} | null = null;
  for (const f of track.frames) { if (open && open.side === f.side) open.to = f.frame; else { if (open) runs.push(`${open.side} ${open.from}–${open.to}`); open = {side: f.side, from: f.frame, to: f.frame}; } }
  if (open) runs.push(`${open.side} ${open.from}–${open.to}`);
  const turns = (track.flips ?? []).filter(flip => flip.quarterTurns).map(flip => `sätts om ${flip.quarterTurns} kvartsvarv vid ruta ${flip.from}–${flip.to}`);
  const unsure = track.frames.filter(f => f.side !== 'NONE' && (f.confidence ?? 1) < 0.6).length;
  const rest = restOf(track);
  return [runs.join(' · '), ...turns, !rest ? 'kortet kommer aldrig till vila i spåret' : rest.assumed ? `vilar inte i klippet, sista rutan ${rest.from} får gälla` : `vilar från ruta ${rest.from}`, ...(unsure ? [`${unsure} osäkra rutor`] : [])].join(' · ');
}
