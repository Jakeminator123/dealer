"use client";

// <ProofStill cover={coverOf(proof)} fps={30} className="aspect-[16/10]" />: a proof's picture for its card or a film in
// a playlist: the picture itself, or one frame of the film drawn once (components/takes frameStill: at most three films
// read at a time). Nothing is read before it is on screen.
import { Film, Image as ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { labUrl } from "../../lib/lab.ts";
import { frameStill } from "../takes";
import { cn } from "../ui/cn";

export type Cover = { kind: "image"; path: string } | { kind: "video"; path: string; frame: number } | null;

export function ProofStill({ cover, fps = 30, fit = "cover", className }: { cover: Cover; fps?: number; fit?: "cover" | "contain"; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [drawn, setDrawn] = useState<{ key: string; url: string | null } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = cover ? `${cover.path}#${cover.kind === "video" ? cover.frame : ""}` : "";

  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || cover?.kind !== "video") return;
    let gone = false;
    const width = Math.min(960, Math.max(240, Math.round((box.current?.clientWidth || 320) * Math.min(2, window.devicePixelRatio || 1))));
    frameStill(cover.path, cover.frame, fps, [240, 360, 480, 640, 960].find((w) => w >= width) ?? 960).then(
      (url) => !gone && setDrawn({ key, url }),
      () => !gone && setDrawn({ key, url: null }),
    );
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key names the cover's film and frame
  }, [seen, fps, key]);

  const src = !seen || !cover ? null : cover.kind === "image" ? labUrl(cover.path) : drawn?.key === key ? drawn.url : null;
  const failed = cover?.kind === "video" && drawn?.key === key && !drawn.url;
  const ready = !!src && loaded === src;

  return (
    <div ref={box} className={cn("relative overflow-hidden bg-well", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file or a drawn still; next/image cannot optimise in a static export
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(src)}
          className={cn("absolute inset-0 size-full transition-opacity duration-300", fit === "cover" ? "object-cover" : "object-contain", ready ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      {!ready && !failed && cover ? <div aria-hidden className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,#0d1210_0%,#151c18_45%,#0d1210_90%)] bg-[length:200%_100%]" /> : null}
      {!cover || failed ? (
        <div className="absolute inset-0 grid place-items-center text-faint">{cover?.kind === "video" ? <Film className="size-5" /> : <ImageIcon className="size-5" />}</div>
      ) : null}
    </div>
  );
}
