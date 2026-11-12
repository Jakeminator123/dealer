// Frame arithmetic for a film watched frame by frame (components/player), and for a second film that follows the first
// (Jämför: A leads, B follows). Pure: no DOM, no network; tests in studio/tests/sync.test.ts.
//
// A frame's number is the file's own (a derived take is frames A–B of a longer film, numbered as in that film). Frame f
// covers the times [f/fps, (f+1)/fps); a seek goes to its middle, so a seek always lands on the frame asked for. A film's
// position is its time in frames, fractional while it plays (currentTime × fps).

/** The frames a player may show, both ends included. */
export type Range = { start: number; end: number };

/** A film as the sync sees it: its fps, its range, the speed it is meant to be watched at, its landing frame if any. */
export type Clip = { fps: number; range: Range; speed: number; landing: number | null };

/** The time to seek to for a frame: the middle of the frame. */
export const seekTime = (frame: number, fps: number): number => (frame + 0.5) / fps;

/** The frame a video shows at a currentTime. */
export const frameOfTime = (time: number, fps: number): number => Math.max(0, Math.floor(time * fps + 1e-6));

/** The frame requestVideoFrameCallback reports: its mediaTime is the frame's own timestamp, frame/fps. */
export const frameOfMediaTime = (mediaTime: number, fps: number): number => Math.max(0, Math.round(mediaTime * fps));

/** A frame kept inside a range. */
export const clampFrame = (frame: number, range: Range): number => Math.min(range.end, Math.max(range.start, Math.round(frame)));

/** How many frames a range holds. */
export const rangeLength = (range: Range): number => range.end - range.start + 1;

/** The range of a film: the given one inside the file, else the whole file; null while the length is unknown. */
export function filmRange(frames: number | null | undefined, given?: Range | null): Range | null {
  const last = frames && frames > 0 ? frames - 1 : null;
  if (given) {
    const start = Math.max(0, Math.round(given.start));
    const end = last === null ? Math.round(given.end) : Math.min(last, Math.round(given.end));
    return end >= start ? { start, end } : null;
  }
  return last === null ? null : { start: 0, end: last };
}

/** The frame after a step of n frames from frame, inside the range (no wrap: stepping stops at the ends). */
export const stepFrame = (frame: number, n: number, range: Range): number => clampFrame(frame + n, range);

/** "ruta 88 / 120" for a whole film, "ruta 130 · 117–177" for a range of a longer one. */
export function frameLabel(frame: number, range: Range | null, frames: number | null | undefined): string {
  if (!range) return `ruta ${frame}`;
  const whole = range.start === 0 && frames !== null && frames !== undefined && range.end === frames - 1;
  return whole ? `ruta ${frame} / ${frames}` : `ruta ${frame} · ${range.start}–${range.end}`;
}

/** The playback rate for a chosen speed (0,25 / 0,5 / 1) and the speed the take is meant to be watched at. */
export const playbackRate = (chosen: number, speed = 1): number => Math.min(16, Math.max(0.0625, chosen * (speed > 0 ? speed : 1)));

// ── Two films side by side ──────────────────────────────────────────────────
export type Align = "start" | "landing";

/** Both films have a landing frame inside their own range: only then can they be aligned on it. */
export const canAlignLanding = (a: Clip, b: Clip): boolean =>
  a.landing !== null && b.landing !== null && a.landing >= a.range.start && a.landing <= a.range.end && b.landing >= b.range.start && b.landing <= b.range.end;

/** The frame of each film that is shown at the same moment: both starts, or both landings (when both have one). */
export function anchors(a: Clip, b: Clip, align: Align): { a: number; b: number; align: Align } {
  if (align === "landing" && canAlignLanding(a, b)) return { a: a.landing!, b: b.landing!, align: "landing" };
  return { a: a.range.start, b: b.range.start, align: "start" };
}

/**
 * B's position for A's position: the same time has passed since the anchor, each film counted in its own frames. A film
 * meant to be watched at speed 2 moves two of its frames while the other moves one at the same fps.
 */
export function partnerPosition(a: Clip, b: Clip, positionA: number, align: Align): number {
  const anchor = anchors(a, b, align);
  return anchor.b + (positionA - anchor.a) * ((b.fps * b.speed) / (a.fps * a.speed));
}

/** What B shows when A shows frameA: a frame of B, or B held on its first or last frame where it has none. */
export function partnerFrame(a: Clip, b: Clip, frameA: number, align: Align): { frame: number; hold: "before" | "after" | null } {
  // The middle of A's frame, mapped: B shows the frame that is on screen at that moment.
  const at = Math.floor(partnerPosition(a, b, frameA + 0.5, align) + 1e-6);
  if (at < b.range.start) return { frame: b.range.start, hold: "before" };
  if (at > b.range.end) return { frame: b.range.end, hold: "after" };
  return { frame: at, hold: null };
}

/**
 * How B is kept with A while both play. expected and actual are B's positions in frames (fractional); rate is the rate B
 * plays at now, base the rate it should play at.
 * - B has no frame here (before its start or past its end): hold it on that end frame, paused.
 * - B stopped, or far off (SEEK_AT frames or more): seek it to where it should be.
 * - A frame or more off: nudge its rate so that it closes the gap in about CATCH seconds; keep nudging until it is within
 *   SETTLED of a frame, then give it back its own rate.
 */
export const FOLLOW = { seekAt: 6, nudgeAt: 1, settled: 0.25, catchSeconds: 0.5 } as const;

export type FollowInput = { expected: number; actual: number; rate: number; base: number; fps: number; range: Range; playing: boolean };
export type FollowAction =
  | { action: "none" }
  | { action: "rate"; rate: number }
  | { action: "seek"; frame: number }
  | { action: "hold"; frame: number };

export function follow({ expected, actual, rate, base, fps, range, playing }: FollowInput): FollowAction {
  if (expected < range.start) return playing || Math.floor(actual) !== range.start ? { action: "hold", frame: range.start } : { action: "none" };
  if (expected >= range.end + 1) return playing || Math.floor(actual) !== range.end ? { action: "hold", frame: range.end } : { action: "none" };
  const drift = expected - actual;
  // B has stopped on its last frame while A is still on the frame that matches it: it is where it should be.
  if (!playing && Math.floor(expected) === range.end && Math.floor(actual) === range.end) return { action: "none" };
  if (!playing || Math.abs(drift) >= FOLLOW.seekAt) return { action: "seek", frame: clampFrame(Math.floor(expected), range) };
  const nudging = Math.abs(rate - base) > 1e-6;
  if (Math.abs(drift) >= FOLLOW.nudgeAt || (nudging && Math.abs(drift) >= FOLLOW.settled)) {
    const wanted = base + drift / (fps * FOLLOW.catchSeconds);
    const next = Math.min(base * 2, Math.max(base * 0.5, wanted));
    return Math.abs(next - rate) > 1e-6 ? { action: "rate", rate: next } : { action: "none" };
  }
  return nudging ? { action: "rate", rate: base } : { action: "none" };
}
