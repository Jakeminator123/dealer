// Finds where a film that is a deal and its return in one (an order's ROUND_TRIP) is split in two: the first frame of the
// return, without anyone reading the frames. tools/register-order.ts asks it when --split is left out.
//   node tools/round-trip-split.ts <film.mp4>      prints what it found and why; writes nothing
// The film is read at a quarter of the bank's size (441 pixels wide) and four things are measured in every frame:
//   - the card's place: what is card-coloured (src/card-track.ts: blue face, yellow back) in the last frame and was not in the
//     first, the largest piece. The film ends with the hand gone and the card lying, so that piece is the card where it lies;
//   - seen and stray: how much of that place shows the card, and how much card colour that was not there in the first frame
//     lies outside it (the card on its way, or held beside its place);
//   - motion: how much the picture around the card changes from the frame before (the hand: it stops when it lays the card);
//   - hand: how much of the picture around the card differs from the last frame (the hand at the card; nothing once it is gone).
// The split: the card lies from the first frame after which nothing strays again (laid). The hand is gone from the frame where
// half of it has left (gone). Between the two the hand stands still at the card, two frames or more, and the return begins on
// the first frame that moves after that stillness. The deal therefore ends on a still frame with the card lying and the hand
// at it, and the return never begins before the card lies. Where the hand stops more than once (it settles on the card in
// steps, or stops above it when the fingers have lifted), the stillness is the last one with the hand as much over the card as
// it ever rests.
// No safe frame gives split null and the reason, and nothing is then brought in by itself: no card in the last frame, a card
// that never settles, a hand that lets go in passing, never stops or never leaves, or a hand that comes back over the card.
// Against the bank's 37 round trips (2026-11-23): the five films from anchor 2.3 are split 0–3 frames before the frame a
// reader chose; the older films from anchor 2.1 and 2.2 mostly 1–7 frames before it (the reader chose the frame where the
// card is free, this the frame where the hand starts), and ten of those 32 are refused.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {classify, blobs, morph, BLUE, YELLOW} from '../src/card-track.ts';
import {probe} from './film-fix.ts';

/** What was measured, per frame, around the place where the card ends up: see the head of this file. */
export type Measures = {frames: number; card: {area: number; box: [number, number, number, number]; side: 'FRONT' | 'BACK'} | null; seen: number[]; stray: number[]; motion: number[]; hand: number[]};
/** split: the first frame of the return, or null and why. laid, still (the stillness, first and last frame), gone and level (the stillest frame's motion) as far as they were found. */
export type Found = {split: number | null; why?: string; laid?: number; still?: [number, number]; gone?: number; level?: number; measures: Measures};

/** The limits, measured on the bank's round trips (2026-11-23). Sizes are in the pixels of a picture LIMITS.width wide. */
export const LIMITS = {
  width: 441,        // the width a film is read at, a quarter of the bank's frame
  minCard: 40,       // the least card; the smallest in the bank (seat 1 and 7) is some 120
  reach: 2,          // pixels round the card's place that still count as its place
  stray: 0.05,       // share of the card's area that may lie outside its place when it lies
  seen: 0.25,        // share of the place that must show the card when it is said to lie
  differs: 24,       // grey levels by which a pixel differs from the last frame when the hand is over it
  hand: 0.01,        // share of the picture around the card the hand must fill when the card lies
  still: {times: 2.5, above: 0.5, most: 1.2, frames: 2},  // still: motion at most 2.5 times the stillest frame's, or 0.5 above it, two frames or more; the stillest frame itself at most 1.2
  cover: 0.75,       // a stillness counts as the hand resting on the card when it covers this share of the most any stillness covers
  back: 0.15,        // share of the card the hand may cover again after the split
};

/** The first frame of the return in a film given as RGB frames (three bytes a pixel, all w × h), or why there is no safe one. */
export function findSplit(frames: readonly Uint8Array[], w: number, h: number): Found {
  const n = frames.length, N = w * h, L = LIMITS, measures: Measures = {frames: n, card: null, seen: [], stray: [], motion: [], hand: []};
  const no = (why: string, more: Partial<Found> = {}): Found => ({split: null, why, ...more, measures});
  if (n < 4) return no('Filmen har för få rutor.');
  const grey = frames.map(f => { const g = new Uint8Array(N); for (let i = 0, j = 0; i < N; i++, j += 3) g[i] = (f[j] * 2 + f[j + 1] * 5 + f[j + 2]) >> 3; return g; });
  const cls = frames.map(f => classify(f, N)), first = cls[0], last = cls[n - 1];
  // The card where it lies: card colour in the last frame that the first frame did not have there.
  const fresh = new Uint8Array(N); for (let i = 0; i < N; i++) fresh[i] = (last[i] === BLUE || last[i] === YELLOW) && first[i] !== last[i] ? 1 : 0;
  const piece = blobs(morph(morph(fresh, w, h, 1, false), w, h, 1, true), w, h, L.minCard)[0];
  if (!piece) return no('Kortet syns inte liggande i filmens sista ruta (ingen ny kortfärg mot den första rutan).');
  const place = new Uint8Array(N); let blue = 0; for (const p of piece.pixels) { place[p] = 1; if (last[p] === BLUE) blue++; }
  const colour = blue * 2 >= piece.area ? BLUE : YELLOW, near = morph(place, w, h, L.reach, true);
  measures.card = {area: piece.area, box: [piece.x0, piece.y0, piece.x1, piece.y1], side: colour === BLUE ? 'FRONT' : 'BACK'};
  // The picture around the card: its box and one card's length on every side.
  const size = Math.max(piece.x1 - piece.x0, piece.y1 - piece.y0) + 1, x0 = Math.max(0, piece.x0 - size), x1 = Math.min(w - 1, piece.x1 + size), y0 = Math.max(0, piece.y0 - size), y1 = Math.min(h - 1, piece.y1 + size), around = (x1 - x0 + 1) * (y1 - y0 + 1);
  const apart = (a: Uint8Array, b: Uint8Array) => { let sum = 0; for (let y = y0; y <= y1; y++) for (let i = y * w + x0, to = y * w + x1; i <= to; i++) sum += Math.abs(a[i] - b[i]); return sum / around; };
  const off = new Uint8Array(N);
  for (let f = 0; f < n; f++) { let seen = 0, hand = 0; const c = cls[f], g = grey[f], end = grey[n - 1];
    for (let i = 0; i < N; i++) { const is = c[i] === colour; if (is && place[i]) seen++; off[i] = is && !near[i] && first[i] !== colour ? 1 : 0; }
    // Card colour outside the place, without the specks and slivers that the shadow of a fingertip or a flickering edge gives.
    const stray = morph(off, w, h, 1, false).reduce((sum, v) => sum + v, 0);
    for (let y = y0; y <= y1; y++) for (let i = y * w + x0, to = y * w + x1; i <= to; i++) if (Math.abs(g[i] - end[i]) > L.differs) hand++;
    measures.seen.push(seen / piece.area); measures.stray.push(stray / piece.area); measures.motion.push(f ? apart(g, grey[f - 1]) : 0); measures.hand.push(hand / around); }
  const {seen, stray, motion, hand} = measures;
  // Laid: nothing of the card strays from its place from here to the end, and the card shows there.
  let laid = n; while (laid > 0 && stray[laid - 1] <= L.stray) laid--;
  while (laid < n && seen[laid] < L.seen) laid++;
  if (laid >= n - 2) return no('Kortet kommer aldrig till ro på sin plats före filmens slut.');
  if (hand[laid] < L.hand) return no(`Handen är inte vid kortet när det ligger (ruta ${laid}): den släpper kortet i farten, eller filmen är ingen giv med återgång.`, {laid});
  // Gone: half of the hand that was at the card has left the picture around it.
  let gone = laid; while (gone < n && hand[gone] > hand[laid] / 2) gone++;
  if (gone >= n) return no('Handen lämnar aldrig kortet: filmen slutar inte med handen tillbaka.', {laid});
  // Every stillness between the two: frames that move as little as the stillest one, two or more in a row.
  let level = Infinity; for (let f = laid + 1; f <= gone; f++) level = Math.min(level, motion[f]);
  const limit = Math.max(level * L.still.times, level + L.still.above), r3 = (v: number) => Math.round(v * 1000) / 1000;
  const stills: {from: number; to: number; cover: number}[] = [];
  for (let f = laid + 1, from = -1; f <= gone + 1; f++) { const still = f <= gone && motion[f] <= limit;
    if (still && from < 0) from = f;
    if (!still && from >= 0) { const to = f - 1; if (to - from + 1 >= L.still.frames && to < gone) { let sum = 0; for (let k = from; k <= to; k++) sum += 1 - seen[k]; stills.push({from, to, cover: sum / (to - from + 1)}); } from = -1; } }
  if (level > L.still.most || !stills.length) return no(`Handen står aldrig still vid kortet mellan ruta ${laid} (kortet ligger) och ${gone} (handen borta): den stillaste rutan rör sig ${r3(level)}, gränsen är ${L.still.most}.`, {laid, gone, level: r3(level)});
  // The hand may settle on the card in steps, and it may stop again above the card once the fingers have lifted. The stillness
  // the return begins after is the last one where the hand covers the card about as much as it ever does while it rests.
  const most = Math.max(...stills.map(s => s.cover)), rest = stills.findLast(s => s.cover >= most * L.cover)!, split = rest.to + 1;
  const found = {laid, still: [rest.from, rest.to] as [number, number], gone, level: r3(level)};
  // The hand over the card again after the split: it laid the card twice, or straightened it. Which leaving is the return is read by eye.
  for (let f = split, free = seen[split]; f < n; f++) { free = Math.max(free, seen[f]); if (seen[f] < free - L.back) return no(`Handen går tillbaka över kortet (ruta ${f}) efter att ha lämnat det (ruta ${split}).`, found); }
  return {split, ...found, measures};
}

/** A film's frames at the width the limits are measured at. */
export async function readFrames(file: string): Promise<{frames: Uint8Array[]; w: number; h: number}> {
  const facts = probe(file), w = LIMITS.width, h = Math.max(2, Math.round(facts.height * w / facts.width)), bytes = w * h * 3, frames: Uint8Array[] = [];
  const child = spawn(process.env.FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let err = ''; child.stderr.on('data', c => { err += c; });
  const closed = new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  let frame = new Uint8Array(bytes), filled = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
    while (at < chunk.length) { const take = Math.min(chunk.length - at, bytes - filled); frame.set(chunk.subarray(at, at + take), filled); filled += take; at += take;
      if (filled === bytes) { frames.push(frame); frame = new Uint8Array(bytes); filled = 0; } } }
  const code = await closed;
  if (code !== 0) throw Error(`ffmpeg ${code}: ${err.trim().slice(0, 400)}`);
  return {frames, w, h};
}

/** The split of a film on disk. */
export async function splitOfFilm(file: string): Promise<Found> {
  const {frames, w, h} = await readFrames(file);
  return findSplit(frames, w, h);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('Användning: node tools/round-trip-split.ts <film.mp4>'); process.exit(1); }
  const {measures, ...found} = await splitOfFilm(file);
  console.log(JSON.stringify({film: file, frames: measures.frames, card: measures.card, ...found}, null, 2));
  if (found.split === null) process.exitCode = 2;
}
