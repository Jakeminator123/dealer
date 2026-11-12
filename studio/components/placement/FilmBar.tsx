"use client";

// Under the picture when a film lies under the cards: play and pause, a frame back and forth, and the film's frames to drag
// through. Frames are counted as the lab counts them (frame n starts at n/fps). The frame goes into the address on a pause.
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { IconButton } from "../ui";

export function FilmBar({ videoRef, fps, frames, onFrame }: { videoRef: RefObject<HTMLVideoElement | null>; fps: number; frames: number; onFrame: (frame: number) => void }) {
  const [frame, setFrame] = useState(0);
  const [count, setCount] = useState(frames);
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const read = () => setFrame(Math.max(0, Math.floor(v.currentTime * fps + 1e-4)));
    const meta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) setCount(Math.max(1, Math.round(v.duration * fps)));
      read();
    };
    const state = () => {
      setPaused(v.paused);
      if (v.paused) onFrame(Math.max(0, Math.floor(v.currentTime * fps + 1e-4)));
    };
    v.addEventListener("timeupdate", read);
    v.addEventListener("seeked", read);
    v.addEventListener("loadedmetadata", meta);
    v.addEventListener("play", state);
    v.addEventListener("pause", state);
    if (v.readyState >= 1) meta();
    return () => {
      v.removeEventListener("timeupdate", read);
      v.removeEventListener("seeked", read);
      v.removeEventListener("loadedmetadata", meta);
      v.removeEventListener("play", state);
      v.removeEventListener("pause", state);
    };
  }, [videoRef, fps, onFrame]);
  const seek = (n: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const target = Math.max(0, Math.min(count - 1, n));
    v.currentTime = (target + 0.001) / fps;
    setFrame(target);
    onFrame(target);
  };
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t border-line bg-surface px-3">
      <IconButton
        label={paused ? "Spela filmen" : "Pausa"}
        icon={paused ? <Play /> : <Pause />}
        variant="secondary"
        size="sm"
        onClick={() => {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) void v.play().catch(() => {});
          else v.pause();
        }}
      />
      <IconButton label="Föregående ruta" icon={<ChevronLeft />} size="sm" onClick={() => seek(frame - 1)} />
      <IconButton label="Nästa ruta" icon={<ChevronRight />} size="sm" onClick={() => seek(frame + 1)} />
      <input type="range" min={0} max={Math.max(0, count - 1)} step={1} value={Math.min(frame, Math.max(0, count - 1))} aria-label="Ruta i filmen" onChange={(e) => seek(Number(e.target.value))} className="ui-range min-w-0 flex-1" style={{ ["--fill" as string]: `${count > 1 ? (Math.min(frame, count - 1) / (count - 1)) * 100 : 0}%` }} />
      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-dim">
        ruta {frame} / {Math.max(0, count - 1)}
      </span>
    </div>
  );
}
