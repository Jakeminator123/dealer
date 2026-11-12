"use client";

// <TakeThumb take={take} still="auto|first|film" frame={88} scrub active />: a still of a take, 3:2, filling its width.
// auto: the take's first.png when it has one, else a frame of its film (the landing frame of a deal, the middle otherwise);
// film: always a frame of the film (all deals to one card share one first.png, a frame near the landing tells them apart).
// On hover (and while active, e.g. its card has keyboard focus) the film itself is shown, and the pointer scrubs through it.
// Lazy: nothing is read before the thumbnail is on screen; stills are drawn by at most three videos at a time (frames.ts).
import { Film } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { labUrl } from "../../lib/lab.ts";
import { cn } from "../ui/cn";
import { frameStill, frameTime, stillWidth } from "./frames";

type ThumbTake = Pick<Take, "id" | "media" | "fps" | "frames" | "segment" | "landingFrame">;

/** The frames of the film that belong to the take: a derived take is a range of a longer film. */
export function frameRange(take: Pick<Take, "frames" | "segment">): { start: number; end: number } | null {
  if (take.segment) return { start: take.segment.start, end: take.segment.end };
  return take.frames ? { start: 0, end: take.frames - 1 } : null;
}

/** The frame a still shows when none is asked for: a deal's landing, else the middle of the take. */
export function stillFrame(take: ThumbTake): number {
  const range = frameRange(take);
  if (!range) return 0;
  const landing = take.landingFrame;
  if (landing !== null && landing >= range.start && landing <= range.end) return landing;
  return Math.round(range.start + (range.end - range.start) * 0.5);
}

function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

export function TakeThumb({
  take,
  still = "auto",
  frame,
  scrub = true,
  active = false,
  className,
  children,
}: {
  take: ThumbTake;
  still?: "auto" | "first" | "film";
  /** The frame of the film to show as the still (source frame numbers); default stillFrame(take). */
  frame?: number;
  /** Show the film under the pointer and scrub through it. */
  scrub?: boolean;
  /** Show the film at the still's frame without a pointer (its card has focus or is chosen). */
  active?: boolean;
  className?: string;
  /** Laid over the picture: badges, a duration. */
  children?: ReactNode;
}) {
  const { ref, seen } = useOnScreen<HTMLDivElement>();
  const video = take.media.video ?? null;
  const first = take.media.first ?? null;
  const fps = take.fps ?? 30;
  const range = frameRange(take);
  const at = frame ?? stillFrame(take);
  const useFilm = still === "film" ? !!video : !first && !!video;
  const [filmStill, setFilmStill] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const key = `${video}#${at}`;

  // The still from the film, when that is what is shown.
  useEffect(() => {
    if (!seen || !useFilm || !video) return;
    let gone = false;
    const width = stillWidth(ref.current?.clientWidth || 320);
    frameStill(video, at, fps, width).then(
      (url) => !gone && setFilmStill({ key, url, failed: false }),
      () => !gone && setFilmStill({ key, url: null, failed: true }),
    );
    return () => {
      gone = true;
    };
  }, [seen, useFilm, video, at, fps, key, ref]);

  // The film under the pointer.
  const [hover, setHover] = useState<number | null>(null); // the pointer's share across the picture, 0..1
  const live = !!video && seen && ((scrub && hover !== null) || active);
  const player = useRef<HTMLVideoElement>(null);
  const seeking = useRef(false);
  const wanted = useRef<number | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const shown = hover !== null && range ? Math.round(range.start + hover * (range.end - range.start)) : at;

  useEffect(() => {
    if (!live) {
      setLiveReady(false);
      return;
    }
    const v = player.current;
    if (!v) return;
    const go = () => {
      if (wanted.current === null || v.readyState < 1) return;
      seeking.current = true;
      v.currentTime = frameTime(wanted.current, fps);
      wanted.current = null;
    };
    wanted.current = shown;
    if (!seeking.current) go();
    const onSeeked = () => {
      seeking.current = false;
      setLiveReady(true);
      go();
    };
    const onMeta = () => go();
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [live, shown, fps]);

  useEffect(() => {
    if (!live) seeking.current = false;
  }, [live]);

  const src = useFilm ? (filmStill?.key === key ? filmStill.url : null) : first ? labUrl(first) : null;
  const failed = useFilm ? filmStill?.key === key && filmStill.failed : !first && !video;
  const loaded = !!src && loadedSrc === src;
  const pending = !failed && !loaded;

  return (
    <div
      ref={ref}
      className={cn("relative aspect-[3/2] w-full overflow-hidden rounded-md bg-well", className)}
      onPointerMove={(event) => {
        if (!scrub || !video) return;
        const box = event.currentTarget.getBoundingClientRect();
        setHover(Math.min(1, Math.max(0, (event.clientX - box.left) / Math.max(1, box.width))));
      }}
      onPointerLeave={() => setHover(null)}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file or a drawn still; next/image cannot optimise in a static export
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoadedSrc(src)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      {pending ? <div aria-hidden className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,#0d1210_0%,#151c18_45%,#0d1210_90%)] bg-[length:200%_100%]" /> : null}
      {failed ? (
        <div className="absolute inset-0 grid place-items-center text-faint">
          <div className="flex flex-col items-center gap-1.5 text-2xs">
            <Film className="size-5" />
            {video ? "Rutan kunde inte läsas" : "Ingen film här"}
          </div>
        </div>
      ) : null}
      {live ? (
        <video
          ref={player}
          src={labUrl(video!)}
          muted
          playsInline
          preload="auto"
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-150", liveReady ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      {live && liveReady && range ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-black/40">
            <div className="h-full bg-brass" style={{ width: `${((shown - range.start) / Math.max(1, range.end - range.start)) * 100}%` }} />
          </div>
          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-xs bg-black/60 px-1.5 py-0.5 text-2xs text-ink tabular-nums backdrop-blur-sm">
            ruta {shown}
          </span>
        </>
      ) : null}
      {children}
    </div>
  );
}
