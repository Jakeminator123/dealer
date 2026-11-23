// A lab trial, not the game's rule (Jakob 2026-11-23: "vid nedsläpp och/eller när hon tar handen ifrån kortet så rör sig kortet
// ytterst lite som de faktist skulle gjort i realiteten"). Today a drawn card is one and the same quad from the frame it rests
// (src/card-overlay.ts poseAt): nothing happens to it when her fingers let go. Here the card lies a hair beyond its place and a
// little turned while her fingers are on it, sets itself as it lands, and comes back to the plan's place as the hand leaves. It
// always ends exactly on the plan's quad, which is where the next film and the game have it.
// Nothing here draws or reads a film. settledLand gives the quad to hand to the card overlay as `land` for one frame
// (src/card-landing-lab.ts); the measures are millimetres on the table, degrees and film frames.
import {centre, type Pt} from './card-track.ts';
import {restOf, type CardTrack} from './card-overlay.ts';

// bump: how far the card runs on as it lands before it comes back (mm), over bumpFrames. slide and turn: how far beyond its place
// (mm, along the way it came) and how turned (degrees) it lies under her fingers. frames: how many frames the way back takes
// once the hand leaves. shift: frames earlier (negative) or later than the track's own measure (the fingers begin to go) that the way back begins.
export type Settle = {bump: number; bumpFrames: number; slide: number; turn: number; frames: number; shift: number};
export const SETTLE: Settle = {bump: 1, bumpFrames: 6, slide: 2.5, turn: 1.2, frames: 4, shift: 0};
export const STILL: Settle = {bump: 0, bumpFrames: 6, slide: 0, turn: 0, frames: 4, shift: 0};
// The card's real sides in millimetres, as the card plan has them (src/card-plan.ts: 63 x 88): the plan's outline is such a card
// on the table, so its sides in the picture say what a millimetre of the table is there.
const WIDE = 63, LONG = 88;
// Of the way the visible card grows from the fingers on it to the whole card: where the fingers count as still on it, as leaving,
// and as gone. A card whose visible area changes less than `flat` of the whole after it rests has nobody's fingers on it.
const LEVEL = {on: 0.15, leaving: 0.5, gone: 0.92, flat: 0.05};

/**
 * When the hand leaves the lying card, by the track's own measure: the area of card colour the film shows in each frame is
 * smallest while her fingers lie on the card and grows to the whole card as they leave. rest: the frame it lies from. from: the
 * last frame the fingers are fully on it; mid: half way off; free: the first frame the whole card shows. held: fingers were on it
 * after it came to rest. leaves: they also leave within the film; where they do not (a deal cut at the landing), there is no way
 * back to time, and the card is kept on its place. Null for a track whose card never rests.
 */
export function releaseOf(track: CardTrack): {rest: number; from: number; mid: number; free: number; held: boolean; leaves: boolean} | null {
  const rest = restOf(track); if (!rest) return null;
  const frames = track.frames as (CardTrack['frames'][number] & {area?: number; note?: string})[], last = frames.length - 1;
  const area = (i: number) => { const f = frames[i]; return f && (f.side === 'FRONT' || f.side === 'BACK') && typeof f.area === 'number' ? f.area : null; };
  const at = rest.from, none = {rest: at, from: at, mid: at, free: at, held: false, leaves: true};
  const tail: number[] = []; for (let i = last; i >= at && tail.length < 5; i--) { const a = area(i); if (a !== null) tail.push(a); }
  if (!tail.length) return none;
  const whole = tail.sort((a, b) => a - b)[tail.length >> 1]; let low = Infinity, lowAt = at;
  for (let i = at; i <= last; i++) { const a = area(i); if (a !== null && a < low) { low = a; lowAt = i; } }
  const span = whole - low;
  // The film ends with her fingers still on the card: it is held, and its release is in another film.
  if (span < LEVEL.flat * whole) return /covered by the hand/.test(frames[last]?.note ?? '') ? {...none, held: true, leaves: false} : none;
  const reach = (share: number, start: number) => { for (let i = start; i <= last; i++) { const a = area(i); if (a !== null && a >= low + share * span) return i; } return last; };
  const mid = reach(LEVEL.leaving, lowAt + 1); let from = lowAt;
  for (let i = lowAt; i < mid; i++) { const a = area(i); if (a !== null && a <= low + LEVEL.on * span) from = i; }
  return {rest: at, from, mid, free: reach(LEVEL.gone, mid), held: true, leaves: true};
}

const quadOf = (q: number[][] | null | undefined): Pt[] | null => q?.length === 4 ? q.map(([x, y]) => ({x, y})) : null;
/** The way the card came to its place: the direction of its last move before it rested, in film pixels. Null for a card that did not move (one already lying). */
export function arrivalOf(track: CardTrack): Pt | null {
  const rest = restOf(track); if (!rest) return null; const end = centre(rest.quad);
  for (let back = 2; back <= 14; back++) { const q = quadOf(track.frames[rest.from - back]?.quad); if (!q) continue;
    const c = centre(q), l = Math.hypot(end.x - c.x, end.y - c.y); if (l >= 4) return {x: (end.x - c.x) / l, y: (end.y - c.y) / l}; }
  return null;
}
/** Which way the card was turning as it was laid (1 or -1, as the angle of its first side grows on screen); 1 for a card that came straight. */
export function turnWayOf(track: CardTrack): 1 | -1 {
  const rest = restOf(track), angle = (q: Pt[]) => Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x); if (!rest) return 1;
  for (let back = 2; back <= 8; back++) { const f = track.frames[rest.from - back], q = quadOf(f?.quad); if (!q || f.side !== track.frames[rest.from]?.side) continue;
    const d = Math.atan2(Math.sin(angle(rest.quad) - angle(q)), Math.cos(angle(rest.quad) - angle(q))); if (Math.abs(d) > 0.01) return d > 0 ? 1 : -1; }
  return 1;
}

// The way back from 1 (as it lay under her fingers) to 0 (its place), `u` in the measure `frames`: quick at first, there after one
// measure (0.52, 0.21, 0.05 at a quarter, a half and three quarters of it), then a few hundredths past the place and back.
const back = (u: number) => u <= 0 ? 1 : u >= 3 ? 0 : Math.exp(-2.25 * u) * Math.cos(Math.PI * 0.55 * u);
// The landing: from 0 up to 1 a third of the way in and down to 0 again.
const run = (u: number) => u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) * (1 - u) / 0.58;

/** How far from its place the card lies in `frame`: along the way it came (mm) and turned (degrees). Both 0 once it has come back. */
export function settleAt(track: CardTrack, frame: number, s: Settle = SETTLE): {along: number; turn: number} {
  const r = releaseOf(track); if (!r) return {along: 0, turn: 0};
  // Only a card her fingers lay on and then left has a way back, and it begins as they begin to go: they take it along a hair.
  const held = r.held && r.leaves ? back((frame - (r.from + s.shift)) / Math.max(1, s.frames)) : 0;
  // A card that was not moving when the track found it at rest lay there already (under her hand): it has no landing to set itself after.
  const landing = arrivalOf(track) ? s.bump * run((frame - r.rest) / Math.max(1, s.bumpFrames)) : 0;
  return {along: s.slide * held + landing, turn: s.turn * held};
}

/**
 * The plan's quad as the card lies in `frame`. `land` has the plan's corner order (first side the card's width), so its sides
 * say how many film pixels a millimetre of the card is each way there: the move and the turn are made on the table and carried
 * to the picture by that, which is exact enough for a few millimetres and a degree.
 */
export function settledLand(land: Pt[], track: CardTrack, frame: number, s: Settle = SETTLE): Pt[] {
  const {along, turn} = settleAt(track, frame, s); if ((!along && !turn) || land.length !== 4) return land;
  const ux = (land[1].x - land[0].x + land[2].x - land[3].x) / 2 / WIDE, uy = (land[1].y - land[0].y + land[2].y - land[3].y) / 2 / WIDE;
  const vx = (land[3].x - land[0].x + land[2].x - land[1].x) / 2 / LONG, vy = (land[3].y - land[0].y + land[2].y - land[1].y) / 2 / LONG, det = ux * vy - vx * uy;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return land;
  const toTable = (p: Pt): Pt => ({x: (p.x * vy - p.y * vx) / det, y: (p.y * ux - p.x * uy) / det}), toFilm = (m: Pt): Pt => ({x: m.x * ux + m.y * vx, y: m.x * uy + m.y * vy});
  const way = toTable(arrivalOf(track) ?? {x: vx, y: vy}), l = Math.hypot(way.x, way.y) || 1, a = turn * turnWayOf(track) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), c = centre(land);
  return land.map(p => { const m = toTable({x: p.x - c.x, y: p.y - c.y}), f = toFilm({x: m.x * cos - m.y * sin + way.x / l * along, y: m.x * sin + m.y * cos + way.y / l * along}); return {x: c.x + f.x, y: c.y + f.y}; });
}

/** How many millimetres of the drawn card the film pixels `d` are at the quad `land` (the plan's corner order). */
export function millimetres(land: Pt[], d: Pt): number {
  const ux = (land[1].x - land[0].x + land[2].x - land[3].x) / 2 / WIDE, uy = (land[1].y - land[0].y + land[2].y - land[3].y) / 2 / WIDE;
  const vx = (land[3].x - land[0].x + land[2].x - land[1].x) / 2 / LONG, vy = (land[3].y - land[0].y + land[2].y - land[1].y) / 2 / LONG, det = ux * vy - vx * uy;
  return Math.abs(det) < 1e-9 ? 0 : Math.hypot((d.x * vy - d.y * vx) / det, (d.y * ux - d.x * uy) / det);
}
