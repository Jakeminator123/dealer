// The round as the stage plays it: one part per step of resolveRound (src/clip-graph.ts), and the arithmetic of a place in
// it (a step and a source frame), so that the 3D scene and the plain films play the same parts, cut on the same frames and
// keep the same place when Jakob switches between them. Pure: no DOM, no network; tests in studio/tests/parts.test.ts.
import type { Gap, Segment } from "../../src/clip-graph.ts";
import { labUrl } from "./lab.ts";

/** How long a step without a film shows its card while a round plays (seconds at speed 1). */
export const GAP_SECONDS = 1.5;
/** The films' own shape, 1764 × 1174 (FILM in src/scene3d-geometry.ts): the 3D scene's home view and "Inte 3D" alike. */
export const FILM_ASPECT = 1764 / 1174;

/**
 * One step of the round. A film plays source frames start … end − 1 of path (end is exclusive, as in the bank); a gap has
 * no path and says why (gap). speed is the take's own (a clip generated in slow motion says 2); the stage plays it at
 * speed × the speed Jakob chose. known: false when the bank does not know the film's length and end is read from the
 * ordered duration instead.
 */
export type PlayPart = {
  step: number;
  edge: string;
  from: string;
  to: string;
  take: string | null;
  path: string | null;
  start: number;
  end: number;
  fps: number;
  speed: number;
  track: string | null;
  gap: Gap | null;
  known: boolean;
};

/** A place in the round: the step and the source frame of its film (0 on a gap). */
export type Position = { step: number; frame: number };

export function partsOf(segments: readonly Segment[]): PlayPart[] {
  return segments.map((s, step) => {
    const take = s.take;
    const base = { step, edge: s.id, from: s.from, to: s.to, take: take?.id ?? null, fps: s.fps > 0 ? s.fps : 30 };
    if (!take || !s.video || s.gap) return { ...base, path: null, start: 0, end: 0, speed: 1, track: null, gap: s.gap ?? "MISSING", known: true };
    const ordered = take.job?.duration ? Math.round(take.job.duration * base.fps) : null;
    const end = s.end ?? take.frames ?? ordered ?? s.start + 1;
    return {
      ...base,
      path: labUrl(s.video),
      start: s.start,
      end: Math.max(s.start + 1, end),
      speed: take.speed > 0 ? take.speed : 1,
      track: take.media?.track ? labUrl(take.media.track) : null,
      gap: null,
      known: s.end !== null || take.frames !== null,
    };
  });
}

export const playable = (part: PlayPart | undefined): part is PlayPart & { path: string } => !!part && part.path !== null;
export const lastFrame = (part: PlayPart) => Math.max(part.start, part.end - 1);
/** Seconds a part is on screen at speed 1: its frames at its own speed, or the gap card. */
export const partSeconds = (part: PlayPart) => (playable(part) ? (part.end - part.start) / part.fps / part.speed : GAP_SECONDS);
/** The films' time of the round (gap cards left out). */
export const roundSeconds = (parts: readonly PlayPart[]) => parts.filter(playable).reduce((sum, p) => sum + partSeconds(p), 0);
/** A key that changes only when what is played changes (not when a note or a verdict does). */
export const partsKey = (parts: readonly PlayPart[]) => parts.map((p) => `${p.path ?? p.gap}:${p.start}-${p.end}x${p.speed}@${p.fps}`).join("|");

/** Where a round starts: the first frame of its first step. */
export const firstPosition = (parts: readonly PlayPart[]): Position | null => (parts.length ? { step: 0, frame: parts[0].start } : null);

/** A place made valid for these parts: the step kept if it exists, the frame kept inside its film. */
export function clampPosition(parts: readonly PlayPart[], pos: Position | null): Position | null {
  if (!parts.length) return null;
  if (!pos || !parts[pos.step]) return firstPosition(parts);
  const part = parts[pos.step];
  if (!playable(part)) return { step: pos.step, frame: 0 };
  return { step: pos.step, frame: Math.min(lastFrame(part), Math.max(part.start, Math.round(pos.frame))) };
}

/**
 * One frame on or back, also across a cut: past a film's last frame comes the first frame of the next film, before its
 * first frame the last frame of the one before. Steps without a film are passed over. At either end of the round the
 * place stays where it is.
 */
export function stepFrame(parts: readonly PlayPart[], pos: Position, dir: 1 | -1): Position {
  const part = parts[pos.step];
  if (playable(part)) {
    const frame = pos.frame + dir;
    if (frame >= part.start && frame <= lastFrame(part)) return { step: pos.step, frame };
  }
  let at = pos.step + dir;
  while (parts[at] && !playable(parts[at])) at += dir;
  const next = parts[at];
  if (!next) return pos;
  return { step: at, frame: dir > 0 ? next.start : lastFrame(next) };
}

/** The parts from `step` on that play back to back: up to the first step without a film. Empty when `step` is one. */
export function runFrom(parts: readonly PlayPart[], step: number): PlayPart[] {
  const run: PlayPart[] = [];
  for (let at = step; playable(parts[at]); at++) run.push(parts[at]);
  return run;
}

/** The step after `step`; with loop the first after the last, without it null at the end. */
export function nextStep(parts: readonly PlayPart[], step: number, loop: boolean): number | null {
  if (step + 1 < parts.length) return step + 1;
  return loop && parts.length ? 0 : null;
}

/** Has a round that does not loop played to its end at this place? */
export const atEnd = (parts: readonly PlayPart[], pos: Position | null) =>
  !!pos && pos.step === parts.length - 1 && (!playable(parts[pos.step]) || pos.frame >= lastFrame(parts[pos.step]));

// ── The scrub bar ───────────────────────────────────────────────────────────
/** Each step's share of the bar, 0 to 1, by the time it is on screen (a gap by its card's time). */
export type Span = { step: number; from: number; to: number; gap: boolean };
export function timeline(parts: readonly PlayPart[]): Span[] {
  const total = parts.reduce((sum, p) => sum + partSeconds(p), 0);
  let at = 0;
  return parts.map((p) => {
    const from = total ? at / total : 0;
    at += partSeconds(p);
    return { step: p.step, from, to: total ? at / total : 0, gap: !playable(p) };
  });
}

/** The place at a share of the bar (0 … 1). */
export function positionAt(parts: readonly PlayPart[], share: number): Position | null {
  if (!parts.length) return null;
  const spans = timeline(parts);
  const s = Math.min(1, Math.max(0, share));
  const span = spans.find((x) => s < x.to) ?? spans[spans.length - 1];
  const part = parts[span.step];
  if (!playable(part)) return { step: span.step, frame: 0 };
  const within = span.to > span.from ? (s - span.from) / (span.to - span.from) : 0;
  return { step: span.step, frame: Math.min(lastFrame(part), part.start + Math.floor(within * (part.end - part.start))) };
}

/** The share of the bar at a place (the start of its frame). */
export function shareOf(parts: readonly PlayPart[], pos: Position | null): number {
  if (!pos || !parts[pos.step]) return 0;
  const span = timeline(parts)[pos.step];
  const part = parts[pos.step];
  if (!playable(part)) return span.from;
  const within = (Math.min(lastFrame(part), Math.max(part.start, pos.frame)) - part.start) / Math.max(1, part.end - part.start);
  return span.from + within * (span.to - span.from);
}

// ── Words ───────────────────────────────────────────────────────────────────
/** The read-out under the picture: "steg 2/3 · ruta 88/104" (source frames: the frame on screen / the last one played), or "steg 4/5 · lucka". */
export function readout(parts: readonly PlayPart[], pos: Position | null): string {
  if (!pos || !parts[pos.step]) return parts.length ? `steg –/${parts.length}` : "";
  const part = parts[pos.step];
  return `steg ${pos.step + 1}/${parts.length} · ${playable(part) ? `ruta ${pos.frame}/${lastFrame(part)}` : "lucka"}`;
}

/** The cuts as the bank decides them: the last frame of each film and the first of the film that follows it in a run. */
export type Cut = { from: number; last: number; to: number; first: number };
export function cutsOf(parts: readonly PlayPart[]): Cut[] {
  const cuts: Cut[] = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i];
    const b = parts[i + 1];
    if (playable(a) && playable(b)) cuts.push({ from: a.step, last: lastFrame(a), to: b.step, first: b.start });
  }
  return cuts;
}
