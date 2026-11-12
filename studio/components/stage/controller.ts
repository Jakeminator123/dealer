"use client";

// What the stage does with a round, whichever engine shows it: plays the parts that follow each other as one run, shows
// a step without a film as a card for a moment and goes on, loops, steps one frame (also across a cut), cues a step,
// follows the scrub bar, and carries the place and the playing state over when Jakob switches between 3D and plain film.
// Framework-free; the Stage component holds one and feeds it the parts, the mode and the engines.
import { GAP_SECONDS, atEnd, clampPosition, cutsOf, firstPosition, nextStep, partsKey, playable, runFrom, stepFrame, type Cut, type PlayPart, type Position } from "../../lib/parts.ts";
import type { Clock } from "./clock.ts";
import type { Engine, Seen } from "./engines.ts";

export type StageMode = "3d" | "platt";

export type Controller = {
  setParts(parts: PlayPart[]): void;
  setEngine(mode: StageMode, engine: Engine | null): void;
  setMode(mode: StageMode): void;
  play(): void;
  /** Plays from this place (the transport plays from where it is). */
  playFrom(pos: Position): void;
  pause(): void;
  toggle(): void;
  step(dir: 1 | -1): void;
  cue(step: number): void;
  seek(pos: Position | null): void;
  setSpeed(speed: number): void;
  setLoop(loop: boolean): void;
  where(): Position | null;
  /** Once per drawn frame: where the engine is goes to the clock. */
  tick(): void;
  log(): Seen[];
  clearLog(): void;
  cuts(): Cut[];
  readonly playing: boolean;
  readonly mode: StageMode;
};

export function createController(o: {
  clock: Clock;
  mode: StageMode;
  autoplay: boolean;
  onPlaying(playing: boolean): void;
  onGap(step: number | null): void;
  onError(message: string | null): void;
}): Controller {
  let parts: PlayPart[] = [];
  let mode = o.mode;
  const engines: Record<StageMode, Engine | null> = { "3d": null, platt: null };
  let speed = 1;
  let loop = true;
  let playing = false;
  let gap: number | null = null;
  let seq = 0;
  let gapTimer = 0;
  let cursor: Position | null = null;
  // What to do as soon as the engine of the mode and the parts are there.
  let intent: { pos: Position | null; play: boolean } | null = { pos: null, play: o.autoplay };
  let showing = false;
  let queued: Position | null = null;

  const active = () => engines[mode];
  const setPlaying = (next: boolean) => {
    if (playing !== next) {
      playing = next;
      o.onPlaying(next);
    }
    o.clock.set({ playing: next });
  };
  const setGap = (next: number | null) => {
    if (gap !== next) {
      gap = next;
      o.onGap(next);
    }
  };

  function where(): Position | null {
    if (gap !== null) return { step: gap, frame: 0 };
    return clampPosition(parts, active()?.where() ?? cursor);
  }

  function halt() {
    seq++;
    window.clearTimeout(gapTimer);
    active()?.pause();
    setPlaying(false);
  }

  // Plays from a place: the run of films from there, or the card of a gap; then the next step, and round again with loop.
  function go(pos: Position, fresh = true) {
    const engine = active();
    if (!engine || !parts.length) {
      intent = { pos, play: true };
      return;
    }
    const my = ++seq;
    window.clearTimeout(gapTimer);
    cursor = pos;
    if (fresh) engine.log.clear();
    o.onError(null);
    setPlaying(true);
    const part = parts[pos.step];
    if (!part) return;
    if (!playable(part)) {
      engine.pause();
      setGap(pos.step);
      gapTimer = window.setTimeout(() => {
        if (my === seq) advance(pos.step);
      }, (GAP_SECONDS * 1000) / speed);
      return;
    }
    setGap(null);
    const run = runFrom(parts, pos.step);
    engine.play(run, pos.frame, speed, {
      onStep: (step) => {
        if (my === seq) cursor = { step, frame: parts[step]?.start ?? 0 };
      },
      onEnd: () => {
        if (my === seq) advance(run[run.length - 1].step);
      },
      onError: (error) => {
        if (my !== seq) return;
        halt();
        o.onError(error.message);
      },
    });
  }

  function advance(after: number) {
    const next = nextStep(parts, after, loop);
    if (next === null) {
      seq++;
      setPlaying(false);
      return;
    }
    go({ step: next, frame: parts[next].start }, false);
  }

  // One still frame. Asked for again while one is on its way, only the latest is shown after it.
  async function show(pos: Position) {
    halt();
    cursor = pos;
    queued = pos;
    if (showing) return;
    showing = true;
    try {
      while (queued) {
        const next: Position = queued;
        queued = null;
        const part = parts[next.step];
        const engine = active();
        if (!part || !engine) {
          intent = { pos: next, play: false };
          break;
        }
        if (!playable(part)) {
          setGap(next.step);
          continue;
        }
        setGap(null);
        await engine.show(part, next.frame).catch((error: Error) => o.onError(error.message));
      }
    } finally {
      showing = false;
    }
  }

  function kick() {
    const engine = active();
    if (!intent || !engine || !parts.length) return;
    const pos = clampPosition(parts, intent.pos) ?? firstPosition(parts)!;
    const play = intent.play;
    intent = null;
    if (play) go(pos);
    else void show(pos);
  }

  const start = () => firstPosition(parts);
  function play() {
    const pos = where();
    go(!pos || atEnd(parts, pos) ? (start() ?? { step: 0, frame: 0 }) : pos);
  }

  return {
    setParts(next) {
      if (partsKey(next) === partsKey(parts)) {
        parts = next;
        return;
      }
      const sameRound = parts.length > 0 && parts.map((p) => p.edge).join() === next.map((p) => p.edge).join();
      const pos = where();
      const wasPlaying = playing;
      halt();
      setGap(null);
      parts = next;
      if (!next.length) {
        o.clock.set({ pos: null });
        intent = { pos: null, play: o.autoplay };
        return;
      }
      // The same round with other films keeps its place; a new round starts from its beginning, playing.
      intent = sameRound ? { pos, play: wasPlaying } : { pos: null, play: true };
      kick();
    },
    setEngine(kind, engine) {
      const old = engines[kind];
      if (old === engine) return;
      engines[kind] = engine;
      if (kind !== mode) {
        engine?.sleep();
        return;
      }
      if (old && engine) intent = { pos: where(), play: playing };
      if (engine) kick();
    },
    setMode(next) {
      if (next === mode) return;
      const pos = where();
      const wasPlaying = playing;
      halt();
      active()?.sleep();
      mode = next;
      active()?.wake();
      intent = { pos, play: wasPlaying };
      kick();
    },
    play,
    playFrom(pos) {
      const at = clampPosition(parts, pos);
      if (at) go(at);
    },
    pause: halt,
    toggle() {
      if (playing) halt();
      else play();
    },
    step(dir) {
      const pos = where() ?? start();
      if (pos) void show(stepFrame(parts, pos, dir));
    },
    cue(step) {
      const part = parts[step];
      if (!part) return;
      const pos = { step, frame: part.start };
      if (playing) go(pos);
      else void show(pos);
    },
    seek(pos) {
      if (pos) void show(pos);
    },
    setSpeed(next) {
      speed = next;
      const engine = active();
      if (playing && gap === null && engine && !engine.speed(next)) {
        const pos = where();
        if (pos) go(pos, false);
      }
    },
    setLoop(next) {
      loop = next;
    },
    where,
    tick() {
      const pos = where();
      if (pos) cursor = pos;
      o.clock.set({ pos });
    },
    log: () => active()?.log.entries() ?? [],
    clearLog: () => active()?.log.clear(),
    cuts: () => cutsOf(parts),
    get playing() {
      return playing;
    },
    get mode() {
      return mode;
    },
  };
}
