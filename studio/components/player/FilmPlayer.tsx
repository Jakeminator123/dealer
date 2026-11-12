"use client";

// <FilmPlayer src="assets/motions/x/source.mp4" fps={30} frames={120} range={take.segment} speed={take.speed} keys
//   marks={[{frame: 105, label: "Landning", kind: "landing"}]} ref={player} className="h-full" />
// One flat film, frame-exact: the picture as large as its box allows (at the film's own aspect), and under it play/pause,
// ±1 frame, the scrub bar, "ruta 88 / 120", speed 0,25 / 0,5 / 1 and loop. A derived take is frames A–B of a longer film:
// `range` keeps the player inside them, numbered as in the film. `speed` is the speed the take is meant to be watched at
// (a clip made in slow motion says 2); the chosen speed is multiplied by it.
// The frame shown is read with requestVideoFrameCallback; a seek goes to the middle of the frame. Keys (with `keys`, on
// the whole page, not while typing): Space plays/pauses, ← → one frame, Shift+← → ten.
// Give the root a height (h-full in a flex column, or h-[70vh]): the picture fills what is left above the controls.
// The ref (FilmPlayerHandle) lets a page drive it: play, pause, cue(frame), step(n), frame(), and setRate for Jämför.
import { Film, Play } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { labUrl } from "../../lib/lab.ts";
import { clampFrame, filmRange, frameOfMediaTime, frameOfTime, playbackRate, seekTime, type Range } from "../../lib/sync.ts";
import { cn } from "../ui/cn";
import type { FilmMark } from "./ScrubBar";
import { Transport } from "./Transport";

export type FilmPlayerHandle = {
  /** Play from the frame shown; from the start of the range when it stands at its end (restart: false plays on from there). */
  play: (options?: { restart?: boolean }) => Promise<void>;
  pause: () => void;
  toggle: () => void;
  /** Pause and show this frame (kept inside the range); resolves with the frame when it is on screen. */
  cue: (frame: number) => Promise<number>;
  /** Pause and move n frames (stops at the ends of the range). */
  step: (n: number) => Promise<number>;
  /** The frame on screen (or the one a cue is on its way to). */
  frame: () => number;
  /** The position in frames, fractional while playing (currentTime × fps). */
  position: () => number;
  playing: () => boolean;
  /** The range the player keeps to; null while the film's length is unknown. */
  range: () => Range | null;
  /** The rate the film plays at now; setRate changes it until the chosen speed changes (Jämför keeps B with A so). */
  rate: () => number;
  setRate: (rate: number) => void;
  /** The rate it should play at: the chosen speed times the take's own. */
  baseRate: () => number;
  video: () => HTMLVideoElement | null;
};

export type FilmPlayerProps = {
  /** The film as the lab names it ("assets/motions/x/source.mp4"); null: nothing to play. */
  src: string | null;
  fps?: number | null;
  /** Frames in the file, when known (else read from its length). */
  frames?: number | null;
  /** Frames A–B of the file (both shown). */
  range?: Range | null;
  /** The speed the take is meant to be watched at. */
  speed?: number;
  /** The chosen speed (0,25 / 0,5 / 1); give onRateChange to control it from outside. */
  rate?: number;
  onRateChange?: (rate: number) => void;
  loop?: boolean;
  onLoopChange?: (loop: boolean) => void;
  /** The frame to show first (default the start of the range). */
  startFrame?: number | null;
  marks?: readonly FilmMark[];
  /** Show the controls under the picture (default true). */
  controls?: boolean;
  /** A large play button over the picture until it has played (default: when it has controls). */
  bigPlay?: boolean;
  /** What a click on the picture does (default: play/pause this film). Jämför plays both. */
  onToggle?: () => void;
  /** Space and arrow keys on the whole page drive this player. */
  keys?: boolean;
  /** The film has sound: a sound button, and it plays with sound. */
  audio?: boolean;
  /** Width / height of the picture before the film says (default 3:2). */
  aspect?: number;
  /** Shown after the frame count, for the frame on screen: a chapter's name. */
  counter?: (frame: number) => ReactNode;
  /** Laid over the picture. */
  overlay?: ReactNode;
  /** More controls at the right end of the row. */
  extra?: ReactNode;
  label?: string;
  className?: string;
  stageClassName?: string;
  onFrame?: (frame: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onLoaded?: (info: { frames: number; width: number; height: number }) => void;
  ref?: Ref<FilmPlayerHandle>;
};

/** Keys belong to what has focus when it is a field, a control that uses them itself, or an open dialog. */
export function ownsKeys(target: EventTarget | null, key: string): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return true;
  if (el.closest("[role=radio], [role=tab], [role=slider], [role=combobox], [role=listbox], [role=option], [role=menuitem], [role=dialog]")) return true;
  return key === " " && !!el.closest("button, a[href], [role=button], [role=switch]");
}

export function FilmPlayer({
  src,
  fps: fpsGiven,
  frames: framesGiven,
  range: rangeGiven,
  speed = 1,
  rate: rateGiven,
  onRateChange,
  loop: loopGiven,
  onLoopChange,
  startFrame,
  marks,
  controls = true,
  bigPlay,
  onToggle,
  keys = false,
  audio = false,
  aspect: aspectGiven,
  counter,
  overlay,
  extra,
  label,
  className,
  stageClassName,
  onFrame,
  onPlayingChange,
  onLoaded,
  ref,
}: FilmPlayerProps) {
  const fps = fpsGiven && fpsGiven > 0 ? fpsGiven : 30;
  const video = useRef<HTMLVideoElement>(null);
  const [measured, setMeasured] = useState<{ src: string; frames: number; aspect: number } | null>(null);
  const known = measured && measured.src === src ? measured : null;
  const frames = framesGiven ?? known?.frames ?? null;
  const range = filmRange(frames, rangeGiven ?? null);
  const aspect = known?.aspect ?? aspectGiven ?? 1.5;

  const [ownRate, setOwnRate] = useState(1);
  const [ownLoop, setOwnLoop] = useState(false);
  const rate = rateGiven ?? ownRate;
  const loop = loopGiven ?? ownLoop;
  const setRate = (r: number) => (onRateChange ? onRateChange(r) : setOwnRate(r));
  const setLoop = (l: boolean) => (onLoopChange ? onLoopChange(l) : setOwnLoop(l));
  const base = playbackRate(rate, speed);

  const [frame, setFrame] = useState(range?.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [played, setPlayed] = useState(false);
  const [muted, setMuted] = useState(!audio);

  // Everything the handle and the event listeners read, kept current without new listeners on every render.
  const live = useRef({ fps, range, loop, base, startFrame, onFrame, onPlayingChange, onLoaded });
  live.current = { fps, range, loop, base, startFrame, onFrame, onPlayingChange, onLoaded };
  const shown = useRef(range?.start ?? 0); // the frame on screen
  const target = useRef<number | null>(null); // the frame a cue is on its way to
  const want = useRef<number | null>(null); // a seek waiting for the one in flight
  const seeking = useRef(false);
  const waiters = useRef<((frame: number) => void)[]>([]);
  const loopTimer = useRef<number | null>(null);

  const report = useCallback((f: number) => {
    if (shown.current === f && target.current === null) return;
    shown.current = f;
    setFrame(f);
    live.current.onFrame?.(f);
  }, []);

  const seekTo = useCallback((f: number) => {
    const v = video.current;
    want.current = f;
    if (!v || v.readyState < 1 || seeking.current) return; // applied on loadedmetadata / seeked
    seeking.current = true;
    want.current = null;
    v.currentTime = Math.min(seekTime(f, live.current.fps), Math.max(0, (v.duration || Infinity) - 0.001));
  }, []);

  const cue = useCallback(
    (f: number): Promise<number> => {
      const v = video.current;
      const r = live.current.range;
      const at = r ? clampFrame(f, r) : Math.max(0, Math.round(f));
      v?.pause();
      target.current = at;
      shown.current = at;
      setFrame(at);
      live.current.onFrame?.(at);
      seekTo(at);
      return new Promise((resolve) => waiters.current.push(resolve));
    },
    [seekTo],
  );

  const play = useCallback(async ({ restart = true }: { restart?: boolean } = {}) => {
    const v = video.current;
    const r = live.current.range;
    if (!v) return;
    const at = target.current ?? shown.current;
    if (r && ((restart && at >= r.end) || at < r.start || at > r.end)) await cue(r.start);
    else if (seeking.current || want.current !== null) await new Promise<number>((resolve) => waiters.current.push(resolve));
    target.current = null;
    v.playbackRate = live.current.base;
    try {
      await v.play();
    } catch {
      /* the browser refused (no click yet): the button stays "Spela" */
    }
  }, [cue]);

  const pause = useCallback(() => video.current?.pause(), []);
  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void play();
    else v.pause();
  }, [play]);
  const step = useCallback((n: number) => cue((target.current ?? shown.current) + n), [cue]);

  useImperativeHandle(
    ref,
    () => ({
      play,
      pause,
      toggle,
      cue,
      step,
      frame: () => target.current ?? shown.current,
      position: () => (video.current ? video.current.currentTime * live.current.fps : shown.current + 0.5),
      playing: () => !!video.current && !video.current.paused,
      range: () => live.current.range,
      rate: () => video.current?.playbackRate ?? live.current.base,
      setRate: (r: number) => {
        if (video.current) video.current.playbackRate = r;
      },
      baseRate: () => live.current.base,
      video: () => video.current,
    }),
    [play, pause, toggle, cue, step],
  );

  // A new film: start over, and show its first frame (or the one asked for) once it can seek.
  useEffect(() => {
    shown.current = live.current.startFrame ?? live.current.range?.start ?? 0;
    target.current = shown.current;
    want.current = null;
    seeking.current = false;
    setFrame(shown.current);
    setPlaying(false);
    setLoaded(false);
    setFailed(false);
    setPlayed(false);
  }, [src]);

  // The chosen speed: the film plays at it (a nudge from Jämför lasts until it changes).
  useEffect(() => {
    if (video.current) {
      video.current.playbackRate = base;
      video.current.defaultPlaybackRate = base;
    }
  }, [base]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted, src]);

  // The video's own events, and the frame on screen.
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    let alive = true;
    let handle = 0;
    let poll = 0;
    let lastCallback = 0;

    const settle = () => {
      const done = waiters.current.splice(0);
      for (const resolve of done) resolve(shown.current);
    };
    const keepInside = (f: number) => {
      const r = live.current.range;
      if (!r || v.paused || seeking.current) return;
      if (f < r.start) seekTo(r.start);
      else if (f > r.end) {
        if (live.current.loop) seekTo(r.start);
        else {
          v.pause();
          void cue(r.end);
        }
      } else if (f === r.end) {
        if (!live.current.loop) v.pause();
        else if (loopTimer.current === null) {
          // Show the last frame its full time, then go round.
          loopTimer.current = window.setTimeout(() => {
            loopTimer.current = null;
            if (!v.paused) seekTo(live.current.range?.start ?? 0);
          }, 1000 / (live.current.fps * Math.max(0.0625, v.playbackRate)));
        }
      }
    };
    const onVideoFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return;
      lastCallback = performance.now();
      const f = frameOfMediaTime(meta.mediaTime, live.current.fps);
      if (!seeking.current && target.current === null) report(f);
      keepInside(f);
      handle = v.requestVideoFrameCallback(onVideoFrame);
    };
    if (typeof v.requestVideoFrameCallback === "function") handle = v.requestVideoFrameCallback(onVideoFrame);
    // While it plays and no frame callback has come for a while (a covered layer, an older browser): read the time.
    const watch = () => {
      if (!alive) return;
      if (!v.paused && !seeking.current && performance.now() - lastCallback > 150) {
        const f = frameOfTime(v.currentTime, live.current.fps);
        report(f);
        keepInside(f);
      }
      poll = requestAnimationFrame(watch);
    };
    poll = requestAnimationFrame(watch);

    const onMeta = () => {
      const count = Math.max(1, Math.round(v.duration * live.current.fps));
      const ratio = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1.5;
      setMeasured({ src, frames: count, aspect: ratio });
      live.current.onLoaded?.({ frames: count, width: v.videoWidth, height: v.videoHeight });
      v.playbackRate = live.current.base;
      // The first frame shown is exact too: a seek to its middle.
      const first = want.current ?? target.current ?? shown.current;
      seekTo(first);
    };
    const onSeeked = () => {
      seeking.current = false;
      if (want.current !== null) {
        seekTo(want.current);
        return;
      }
      const f = frameOfTime(v.currentTime, live.current.fps);
      if (target.current !== null && v.paused) {
        // A cue: its frame is now on screen.
        shown.current = target.current;
      } else {
        report(f);
      }
      target.current = v.paused ? target.current : null;
      settle();
    };
    const onPlay = () => {
      target.current = null;
      setPlaying(true);
      setPlayed(true);
      live.current.onPlayingChange?.(true);
    };
    const onPause = () => {
      if (loopTimer.current !== null) {
        window.clearTimeout(loopTimer.current);
        loopTimer.current = null;
      }
      setPlaying(false);
      live.current.onPlayingChange?.(false);
    };
    const onEnded = () => {
      const r = live.current.range;
      if (live.current.loop) {
        seekTo(r?.start ?? 0);
        void v.play().catch(() => {});
      } else {
        report(r?.end ?? frameOfTime(v.currentTime, live.current.fps));
      }
    };
    const onData = () => setLoaded(true);
    const onError = () => setFailed(true);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("loadeddata", onData);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    if (v.readyState >= 1) onMeta();
    if (v.readyState >= 2) onData();
    return () => {
      alive = false;
      if (typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(poll);
      if (loopTimer.current !== null) window.clearTimeout(loopTimer.current);
      loopTimer.current = null;
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("loadeddata", onData);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [src, report, seekTo, cue]);

  // A range or start frame that changes under the same film: show its start.
  const rangeKey = range ? `${range.start}-${range.end}` : "";
  useEffect(() => {
    const r = live.current.range;
    if (!r || !video.current || video.current.readyState < 1) return;
    const at = target.current ?? shown.current;
    if (at < r.start || at > r.end) void cue(r.start);
  }, [rangeKey, cue]);

  // Keys for the whole page.
  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || ownsKeys(event.target, event.key)) return;
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void step((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, toggle, step]);

  const empty = !src;
  const click = onToggle ?? toggle;
  return (
    <div
      role="group"
      aria-label={label ?? "Film"}
      data-frame={frame}
      data-playing={playing || undefined}
      className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)}
    >
      <div className={cn("relative grid min-h-0 flex-1 place-items-center [container-type:size]", stageClassName)}>
        <div
          className="relative overflow-hidden rounded-lg bg-well shadow-[0_0_0_1px_var(--color-line)]"
          style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${aspect}))` }}
        >
          {src ? (
            <video
              ref={video}
              src={labUrl(src)}
              preload="auto"
              playsInline
              muted={muted}
              disablePictureInPicture
              onClick={click}
              className={cn("absolute inset-0 size-full cursor-pointer object-contain transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
            />
          ) : null}
          {!loaded && !failed && !empty ? (
            <div aria-hidden className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,#0d1210_0%,#151c18_45%,#0d1210_90%)] bg-[length:200%_100%]" />
          ) : null}
          {failed || empty ? (
            <div className="absolute inset-0 grid place-items-center text-faint">
              <div className="flex flex-col items-center gap-2 text-sm">
                <Film className="size-6" />
                {empty ? "Ingen film" : "Filmen kunde inte spelas"}
              </div>
            </div>
          ) : null}
          {(bigPlay ?? controls) && loaded && !played && !playing ? (
            <button
              type="button"
              aria-label="Spela filmen"
              onClick={click}
              className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-ink ring-1 ring-white/15 backdrop-blur-sm transition-[background-color,transform] duration-150 hover:scale-105 hover:bg-black/60"
            >
              <Play className="ml-1 size-7 fill-current" />
            </button>
          ) : null}
          {overlay}
        </div>
      </div>
      {controls ? (
        <Transport
          playing={playing}
          onToggle={toggle}
          onStep={(n) => void step(n)}
          onSeek={(f) => void cue(f)}
          frame={frame}
          range={range}
          frames={frames}
          rate={rate}
          onRate={setRate}
          loop={loop}
          onLoop={setLoop}
          marks={marks}
          muted={audio ? muted : undefined}
          onMuted={audio ? setMuted : undefined}
          counter={counter?.(frame)}
          extra={extra}
          disabled={empty || failed}
        />
      ) : null}
    </div>
  );
}
