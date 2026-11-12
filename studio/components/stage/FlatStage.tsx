"use client";

// <FlatStage onEngine={(engine) => …} />: "Inte 3D". The film as it is, on its own green, in its own shape (1764 × 1174),
// as large as the area allows: two stacked <video> elements that play a round's parts frame by frame (engines.ts
// createFlatEngine); the next part waits decoded underneath and is raised on the cut. The engine is handed out on mount
// and taken back (null) on unmount; the Stage drives it.
// <PictureBox>: the picture's rectangle inside an area, the same one the 3D scene draws in, for what lies over the picture.
import { useEffect, useRef, type ReactNode } from "react";
import { FILM_ASPECT } from "../../lib/parts.ts";
import { cn } from "../ui/cn";
import { createFlatEngine, type Engine } from "./engines.ts";

export function PictureBox({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 grid place-items-center [container-type:size]", className)}>
      <div className="relative" style={{ aspectRatio: FILM_ASPECT, width: `min(100cqw, calc(100cqh * ${FILM_ASPECT}))` }}>
        {children}
      </div>
    </div>
  );
}

export function FlatStage({ onEngine, className }: { onEngine?: (engine: Engine | null) => void; className?: string }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const latest = useRef(onEngine);
  useEffect(() => {
    latest.current = onEngine;
  });
  useEffect(() => {
    if (!a.current || !b.current) return;
    const engine = createFlatEngine([a.current, b.current]);
    latest.current?.(engine);
    return () => {
      latest.current?.(null);
      engine.dispose();
    };
  }, []);
  return (
    <PictureBox className={className}>
      <div className="absolute inset-0 overflow-hidden bg-black">
        {[a, b].map((ref, i) => (
          <video key={i} ref={ref} muted playsInline preload="auto" disablePictureInPicture className="absolute inset-0 size-full object-contain" />
        ))}
      </div>
    </PictureBox>
  );
}
