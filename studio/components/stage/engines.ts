"use client";

// The two ways the stage plays a round, behind one interface, so that the transport, the keys and the round strip do not
// care which is on screen. The 3D engine hands the parts to the scene's own film queue (src/scene3d-film.ts: play with
// cut for playing, load and seek for one frame); the flat engine plays the same parts as plain films on two stacked
// <video> elements: the next part waits decoded underneath and is raised on the cut, so no black frame comes between.
// Both keep a log of the frames they put on screen while playing, for checking the cuts without eyes.
import type { createScene } from "../../../src/scene3d-view.ts";
import { lastFrame, type PlayPart, type Position } from "../../lib/parts.ts";
import { frameOfTime } from "../../lib/sync.ts";

export type Scene = ReturnType<typeof createScene>;
export type RunCalls = { onStep(step: number): void; onEnd(): void; onError(error: Error): void };

export type Engine = {
  /** Plays parts that follow each other without a gap, from `frame` of the first; onStep when a part comes on screen, onEnd after the last. */
  play(run: PlayPart[], frame: number, speed: number, calls: RunCalls): void;
  /** Stops where it is; the frame stays on screen. */
  pause(): void;
  /** One frame of one part, still. */
  show(part: PlayPart, frame: number): Promise<void>;
  /** The speed changed while playing; false when the engine has to be started again from where it is to take it. */
  speed(speed: number): boolean;
  /** The step on screen and its source frame; null before anything was shown. */
  where(): Position | null;
  /** The view goes over to the other engine: stop, and stop drawing. */
  sleep(): void;
  /** The view comes back. */
  wake(): void;
  log: FrameLog;
  dispose(): void;
};

// ── The log of what was on screen ───────────────────────────────────────────
/** One stretch of one step on screen: the first and last frame seen, how many, frames passed over inside it, and the frames in order. */
// presented (3D): the last frame the step's video presented before the cut, whether or not the scene drew it.
export type Seen = { step: number; first: number; last: number; frames: number; skipped: number; seen: number[]; presented?: number };
export type FrameLog = { note(step: number, frame: number): void; presented(step: number, frame: number): void; entries(): Seen[]; clear(): void };

export function createFrameLog(): FrameLog {
  let list: Seen[] = [];
  return {
    note(step, frame) {
      const e = list[list.length - 1];
      if (e && e.step === step && frame >= e.last) {
        if (frame === e.last) return;
        if (frame > e.last + 1) e.skipped += frame - e.last - 1;
        e.last = frame;
        e.frames++;
        if (e.seen.length < 300) e.seen.push(frame);
        return;
      }
      list.push({ step, first: frame, last: frame, frames: 1, skipped: 0, seen: [frame] });
      if (list.length > 600) list.shift();
    },
    presented(step, frame) {
      const e = [...list].reverse().find((x) => x.step === step);
      if (e) e.presented = frame;
    },
    entries: () => list.map((e) => ({ ...e, seen: [...e.seen] })),
    clear() {
      list = [];
    },
  };
}

// One rule for which frame a time is on, as the scene's frameAtTime (a margin of a thousandth: media times are whole µs).
const frameOf = frameOfTime;
/** Does this browser call back on each presented video frame (requestVideoFrameCallback)? */
const framed = (video: HTMLVideoElement) => typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === "function";

// ── 3D: the scene's own film queue ──────────────────────────────────────────
export function createSceneEngine(scene: Scene): Engine {
  const players = scene.players;
  const log = createFrameLog();
  let token = 0;
  let step: number | null = null;
  let part: PlayPart | null = null; // the part on screen
  let playing = false;
  let loaded: PlayPart | null = null; // the part load() put up for stepping
  let waiting: number | null = null; // the frame a show() is on its way to
  let gone = false;
  // What each video element last presented (its media time): the scene's texture holds that frame when it draws.
  const presented = new WeakMap<HTMLVideoElement, number>();
  const watched = new WeakSet<HTMLVideoElement>();
  let live: { video: HTMLVideoElement; part: PlayPart } | null = null;
  const watch = (video: HTMLVideoElement) => {
    if (watched.has(video) || !framed(video)) return;
    watched.add(video);
    const call = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (gone) return;
      presented.set(video, meta.mediaTime);
      video.requestVideoFrameCallback(call);
    };
    video.requestVideoFrameCallback(call);
  };
  // Each drawn frame: the frame of the film the scene draws goes into the log (what is on screen, not what the video presented).
  const off = scene.onFrame(() => {
    const current = players.current;
    if (!current || !part || step === null) return;
    watch(current.video);
    if (!playing) return;
    const byClock = players.frame();
    const shown = presented.get(current.video);
    const byFrame = shown === undefined ? null : frameOf(shown, part.fps);
    log.note(step, byFrame !== null && Math.abs(byFrame - byClock) <= 2 ? byFrame : byClock);
  });

  return {
    log,
    play(run, frame, speed, calls) {
      const my = ++token;
      playing = true;
      loaded = null;
      waiting = null;
      scene.start();
      const parts = run.map((p, i) => ({ path: p.path!, start: i === 0 ? frame : p.start, end: p.end, rate: speed * p.speed, ...(p.fps !== 30 ? { fps: p.fps } : {}) }));
      players.play(parts, {
        cut: true,
        onPart: (i) => {
          if (my !== token) return;
          const video = players.current?.video;
          if (video) watch(video);
          // what the outgoing video presented last: its frame callback runs after the queue's, so read it a moment later
          const out = live;
          if (out && part && out.video !== video) {
            const was = out;
            window.setTimeout(() => {
              const t = presented.get(was.video);
              if (t !== undefined) log.presented(was.part.step, frameOf(t, was.part.fps));
            }, 0);
          }
          live = video ? { video, part: run[i] } : null;
          part = run[i];
          step = run[i].step;
          log.note(step, players.frame());
          calls.onStep(step);
        },
        onEnd: () => {
          if (my !== token) return;
          playing = false;
          calls.onEnd();
        },
        onError: (error) => {
          if (my === token) calls.onError(error);
        },
      });
    },
    pause() {
      token++;
      playing = false;
      players.toggle(true);
    },
    async show(p, frame) {
      const my = ++token;
      playing = false;
      players.toggle(true);
      part = p;
      step = p.step;
      waiting = frame;
      try {
        if (loaded === p && players.path === p.path && players.count === 1) await players.seek(0, (frame + 0.5) / p.fps);
        else {
          loaded = p;
          await players.load([{ path: p.path!, start: frame, end: p.end, ...(p.fps !== 30 ? { fps: p.fps } : {}) }]);
        }
      } finally {
        if (my === token) waiting = null;
      }
    },
    speed: () => false,
    where() {
      if (step === null || !part) return null;
      return { step, frame: waiting ?? Math.min(lastFrame(part), Math.max(part.start, players.frame())) };
    },
    sleep() {
      token++;
      playing = false;
      players.toggle(true);
      scene.stop();
    },
    wake() {
      scene.start();
    },
    dispose() {
      token++;
      gone = true;
      off();
    },
  };
}

// ── Flat: two stacked video elements ────────────────────────────────────────
export function createFlatEngine(els: [HTMLVideoElement, HTMLVideoElement]): Engine {
  const log = createFrameLog();
  const holds: (PlayPart | null)[] = [null, null]; // the part each element is set to
  const cancel: ((() => void) | null)[] = [null, null]; // ends the cue an element is waiting on
  const timers = new Set<number>();
  let front = 0;
  let token = 0;
  let speedNow = 1;
  let playing = false;
  let run: PlayPart[] = [];
  let at = 0;
  let calls: RunCalls | null = null;
  let below: Promise<boolean> | null = null; // the next part, being made ready on the element underneath
  let gone = false;

  const rate = (p: PlayPart) => speedNow * p.speed;
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const clearTimers = () => {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  };
  const raise = (i: number) => {
    els[i].style.zIndex = "2";
    els[1 - i].style.zIndex = "1";
    front = i;
  };

  /** Element i on `frame` of `part`, paused; true when that frame is decoded and on the element. */
  function cue(i: number, part: PlayPart, frame: number): Promise<boolean> {
    const v = els[i];
    const t = (frame + 0.5) / part.fps;
    cancel[i]?.();
    v.pause();
    holds[i] = part;
    return new Promise((resolve) => {
      let done = false;
      let fallback = 0;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(fallback);
        v.removeEventListener("seeked", onSeeked);
        v.removeEventListener("loadedmetadata", go);
        v.removeEventListener("error", onError);
        if (cancel[i] === stop) cancel[i] = null;
        resolve(ok);
      };
      const stop = () => finish(false);
      const onError = () => finish(false);
      // after the seek, the frame on the element: one presented frame, or a quarter second
      const onSeeked = () => {
        if (!framed(v)) return finish(true);
        fallback = window.setTimeout(() => finish(true), 250);
        v.requestVideoFrameCallback(() => finish(true));
      };
      function go() {
        if (done) return;
        if (!v.seeking && Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return finish(true);
        v.addEventListener("seeked", onSeeked, { once: true });
        v.currentTime = t;
      }
      cancel[i] = stop;
      v.addEventListener("error", onError, { once: true });
      if (v.getAttribute("src") !== part.path) {
        v.addEventListener("loadedmetadata", go, { once: true });
        v.src = part.path!;
      } else if (v.readyState >= 1) go();
      else v.addEventListener("loadedmetadata", go, { once: true });
    });
  }

  // The part on top plays: each presented frame goes into the log, and its last frame ends it.
  const onEnded: ((() => void) | null)[] = [null, null];
  function watch(i: number, my: number) {
    const v = els[i];
    let ended = false;
    const end = (shownAt: number) => {
      if (ended || my !== token || front !== i) return;
      ended = true;
      cut(i, my, shownAt);
    };
    if (onEnded[i]) v.removeEventListener("ended", onEnded[i]!);
    onEnded[i] = () => end(performance.now());
    v.addEventListener("ended", onEnded[i]!);
    if (!framed(v)) {
      const poll = () => {
        if (my !== token || ended) return;
        const p = holds[i]!;
        const f = frameOf(v.currentTime, p.fps);
        log.note(p.step, f);
        if (f >= lastFrame(p)) end(performance.now());
        else later(poll, 10);
      };
      poll();
      return;
    }
    const call = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (my !== token || front !== i || ended) return;
      const p = holds[i]!;
      const f = frameOf(meta.mediaTime, p.fps);
      log.note(p.step, f);
      if (f >= lastFrame(p)) end(meta.expectedDisplayTime);
      else v.requestVideoFrameCallback(call);
    };
    v.requestVideoFrameCallback(call);
  }

  // The last frame of the part on top is on screen: it stays there for one frame's time, then the next part, ready
  // underneath, is raised and set going half a frame later (it waits on the middle of its first frame).
  function cut(i: number, my: number, shownAt: number) {
    const v = els[i];
    const p = holds[i]!;
    v.pause();
    if (frameOf(v.currentTime, p.fps) > lastFrame(p)) v.currentTime = (lastFrame(p) + 0.5) / p.fps; // ran past: back to the last frame
    const next = run[at + 1];
    if (!next) {
      playing = false;
      calls?.onEnd();
      return;
    }
    const due = shownAt + 1000 / (p.fps * rate(p));
    later(async () => {
      const ok = await below;
      if (my !== token) return;
      if (!ok) return calls?.onError(new Error(`Filmen kunde inte läsas: ${next.path}`));
      at += 1;
      const j = 1 - i;
      raise(j);
      log.note(next.step, next.start);
      calls?.onStep(next.step);
      const w = els[j];
      w.playbackRate = rate(next);
      later(() => {
        if (my === token) void w.play().catch(() => {});
      }, 500 / (next.fps * rate(next)));
      watch(j, my);
      const after = run[at + 1];
      below = after ? cue(i, after, after.start) : null;
    }, Math.max(0, due - performance.now()));
  }

  const halt = () => {
    token++;
    clearTimers();
    playing = false;
    for (const v of els) v.pause();
  };

  return {
    log,
    play(list, frame, speed, c) {
      halt();
      const my = token;
      speedNow = speed;
      run = list;
      at = 0;
      calls = c;
      playing = true;
      const first = list[0];
      const i = holds[front]?.path === first.path ? front : 1 - front;
      void cue(i, first, frame).then((ok) => {
        if (my !== token) return;
        if (!ok) return c.onError(new Error(`Filmen kunde inte läsas: ${first.path}`));
        raise(i);
        log.note(first.step, frame);
        c.onStep(first.step);
        const next = list[1];
        below = next ? cue(1 - i, next, next.start) : null;
        if (frame >= lastFrame(first)) return cut(i, my, performance.now());
        const v = els[i];
        v.playbackRate = rate(first);
        void v.play().catch(() => {});
        watch(i, my);
      });
    },
    pause: halt,
    async show(part, frame) {
      halt();
      const my = token;
      const i = holds[front]?.path === part.path ? front : 1 - front;
      const ok = await cue(i, part, frame);
      if (my === token && ok) raise(i);
    },
    speed(s) {
      speedNow = s;
      const p = holds[front];
      if (playing && p) els[front].playbackRate = rate(p);
      return true;
    },
    where() {
      const p = holds[front];
      if (!p) return null;
      return { step: p.step, frame: Math.min(lastFrame(p), Math.max(p.start, frameOf(els[front].currentTime, p.fps))) };
    },
    sleep: halt,
    wake() {},
    dispose() {
      if (gone) return;
      gone = true;
      halt();
      for (const [i, v] of els.entries()) {
        cancel[i]?.();
        v.removeAttribute("src");
        v.load();
      }
    },
  };
}
