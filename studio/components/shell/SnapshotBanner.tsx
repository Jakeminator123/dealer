"use client";

// The online copy (lib/mode.ts) says what it is. <CopyStrip /> is a slim line at the top of the view's column (the shell
// puts it there, above #innehall, so it takes its own room and never lies over a view's header): "Kopia från 12 nov
// 21:40 · inget här går att ändra". <SnapshotBanner /> (in app/layout.tsx) hides every link to the old lab, which the copy
// does not have (the rail's "Gamla labbet", the stand-ins' buttons): those pages write. In the lab both render nothing.
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { isSnapshot, readMeta, swedishMoment } from "../../lib/mode.ts";

export function SnapshotBanner() {
  if (!isSnapshot) return null;
  return <style>{'a[href="/lab.html"],a[href^="/lab.html?"]{display:none!important}'}</style>;
}

export function CopyStrip() {
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
    <div role="status" className="flex h-6 shrink-0 items-center justify-center gap-1.5 truncate border-b border-line bg-surface px-4 text-2xs text-dim">
      <Lock aria-hidden className="size-3 shrink-0 text-brass" />
      <span className="truncate">
        <span className="text-ink">{when ? `Kopia från ${when}` : "Kopia"}</span> · inget här går att ändra
      </span>
    </div>
  );
}
