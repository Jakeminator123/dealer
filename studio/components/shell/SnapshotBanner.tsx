"use client";

// <SnapshotBanner />: in the online copy (lib/mode.ts), a small fixed label at the top of the view: "Kopia från 12 nov
// 21:40 · inget här går att ändra". It lies over the page without moving it, and lets clicks through. The copy has no old
// lab, so the banner also hides every link to it (the rail's "Gamla labbet", the stand-ins' buttons): those pages write.
// In the lab it renders nothing.
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { isSnapshot, readMeta, swedishMoment } from "../../lib/mode.ts";

export function SnapshotBanner() {
  const [when, setWhen] = useState<string | null>(null);

  useEffect(() => {
    if (!isSnapshot) return;
    let gone = false;
    void readMeta().then((meta) => {
      if (!gone && meta) setWhen(swedishMoment(meta.builtAt));
    });
    return () => {
      gone = true;
    };
  }, []);

  if (!isSnapshot) return null;
  return (
    <>
      <style>{'a[href="/lab.html"],a[href^="/lab.html?"]{display:none!important}'}</style>
      <div
        role="status"
        className="pointer-events-none fixed left-[calc(50%+38px)] top-2.5 z-50 flex max-w-[calc(100vw-120px)] -translate-x-1/2 items-center gap-2 truncate rounded-full border border-brass/35 bg-surface/92 px-3 py-1 text-xs text-dim shadow-[0_6px_20px_rgb(0_0_0/0.35)] backdrop-blur-sm"
      >
        <Lock aria-hidden className="size-3.5 shrink-0 text-brass" />
        <span className="truncate">
          <span className="text-ink">{when ? `Kopia från ${when}` : "Kopia"}</span> · inget här går att ändra
        </span>
      </div>
    </>
  );
}
