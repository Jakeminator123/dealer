"use client";

// A meeting of two trees, played (Jakob 2026-11-23: "vill jag kunna få se hur bryggorna är genom att kunna klicka fram dem").
// Opened from "<träd> möter <träd>" in Karta's Komposition, for the meeting at rest or at the shoe. In the game's proportion
// (3:2), in a loop and both ways: the picture before, the bridge, the picture after, then the same back again. The bridge is
// what the game plays there (src/game-film.ts): its film where the composition names one that way ("film 0,2 s"), else a
// plain cut ("rent klipp"). Where the trees do not meet there the two pictures stand beside each other ("möts inte"), and one
// picture common to both needs no bridge ("samma bild"). ¼× plays the bridge film slowly, since 0,2 s is over before the eye
// has seen it. Nothing is chosen or saved here: how the trees meet is chosen in the row the viewer is opened from.
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { linkOf, type BridgeDef } from "../../../src/composition.ts";
import { Dialog, SegmentedControl, cn } from "@/components/ui";
import { labUrl } from "@/lib/lab";
import type { EntryAnswer } from "@/lib/media";
import { coverOfEntry } from "../material/Tile";
import { ProofStill } from "../proofs";

/** One side of a meeting: the tree's name, its picture there (a Material entry) and the picture's code ("A1", "A2.3"). */
export type MeetingSide = { name: string; entry: string | null; code: string };
/** place: "i vilan" or "vid skon". */
export type Meeting = { place: string; a: MeetingSide; b: MeetingSide };

type Media = ReadonlyMap<string, EntryAnswer>;
const seconds = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} s`;

function Picture({ side, media, className }: { side: MeetingSide; media: Media; className?: string }) {
  const entry = side.entry ? media.get(side.entry) : undefined;
  const cover = entry ? coverOfEntry(entry) : null;
  return cover ? <ProofStill cover={cover} fps={entry?.fps ?? 30} className={cn("absolute inset-0", className)} /> : <span className={cn("absolute inset-0 grid place-items-center text-xs text-dim", className)}>ingen bild för {side.code}</span>;
}

const Tag = ({ side }: { side: MeetingSide }) => (
  <span className="absolute bottom-2 left-2 rounded-xs bg-black/65 px-1.5 text-[11px] font-medium leading-[18px] text-ink">
    {side.code} · {side.name}
  </span>
);

const stage = "relative aspect-[3/2] w-full overflow-hidden rounded-md border border-line-strong bg-well";

export function BridgeViewer({ meeting, bridges, media, onClose }: { meeting: Meeting | null; bridges: readonly BridgeDef[] | undefined; media: Media; onClose: () => void }) {
  const ab = meeting ? linkOf(bridges, meeting.a.entry, meeting.b.entry) : null;
  const ba = meeting ? linkOf(bridges, meeting.b.entry, meeting.a.entry) : null;
  return (
    <Dialog open={!!meeting} onOpenChange={(open) => !open && onClose()} width={620} title={meeting ? `${meeting.a.name} möter ${meeting.b.name} ${meeting.place}` : ""}>
      {!meeting ? null : ab === "same" || ba === "same" ? (
        <div className="flex flex-col gap-3">
          <div className={stage}>
            <Picture side={meeting.a} media={media} />
            <Tag side={{ ...meeting.a, name: `${meeting.a.name} och ${meeting.b.name}` }} />
          </div>
          <Word tone="good">samma bild</Word>
        </div>
      ) : !ab && !ba ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[meeting.a, meeting.b].map((side) => (
              <div key={side.name} className={stage}>
                <Picture side={side} media={media} />
                <Tag side={side} />
              </div>
            ))}
          </div>
          <Word tone="bad">möts inte</Word>
        </div>
      ) : (
        <Player key={`${meeting.place}:${meeting.a.entry}:${meeting.b.entry}`} meeting={meeting} media={media} ab={ab} ba={ba} />
      )}
    </Dialog>
  );
}

function Word({ tone, children }: { tone: "good" | "bad"; children: string }) {
  return <span className={cn("self-start rounded-full border px-2.5 py-0.5 text-xs font-medium", tone === "good" ? "border-godkand/50 text-godkand" : "border-underkand/50 text-underkand")}>{children}</span>;
}

type Way = { film: string | null; seconds: number } | null;
/** before: the first picture held; over: the bridge; after: the second picture held. Then the way back. */
type Phase = "ab-before" | "ab-over" | "ab-after" | "ba-before" | "ba-over" | "ba-after";
const NEXT: Record<Phase, Phase> = { "ab-before": "ab-over", "ab-over": "ab-after", "ab-after": "ba-before", "ba-before": "ba-over", "ba-over": "ba-after", "ba-after": "ab-before" };
const HOLD_MS = 800;

function Player({ meeting, media, ab, ba }: { meeting: Meeting; media: Media; ab: Way; ba: Way }) {
  const [phase, setPhase] = useState<Phase>("ab-before");
  const [slow, setSlow] = useState(false);
  // The bridge film that is on the screen right now (its first frame has come), else the picture under it shows.
  const [film, setFilm] = useState<"ab" | "ba" | null>(null);
  const [lengths, setLengths] = useState<{ ab?: number; ba?: number }>({});
  const videoAb = useRef<HTMLVideoElement>(null);
  const videoBa = useRef<HTMLVideoElement>(null);
  const way = phase.slice(0, 2) as "ab" | "ba";
  const part = phase.slice(3) as "before" | "over" | "after";
  const films = { ab: ab?.film ?? null, ba: ba?.film ?? null };
  const filmNow = films[way];

  useEffect(() => {
    const go = () => setPhase(NEXT[phase]);
    if (part !== "over") {
      const timer = window.setTimeout(go, HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    const video = (way === "ab" ? videoAb : videoBa).current;
    // Without a film that way the game cuts from the one picture to the other.
    if (!filmNow || !video) {
      const timer = window.setTimeout(go, 0);
      return () => window.clearTimeout(timer);
    }
    // live: a play() that is broken off by the next run of this effect must not step the loop.
    let live = true;
    const done = () => {
      if (!live) return;
      setFilm(null);
      go();
    };
    const shown = () => setFilm(way);
    video.currentTime = 0;
    video.playbackRate = slow ? 0.25 : 1;
    video.addEventListener("ended", done);
    video.addEventListener("error", done);
    video.addEventListener("playing", shown);
    // A film that never starts must not stop the loop.
    const guard = window.setTimeout(done, 8000);
    video.play().catch(done);
    return () => {
      live = false;
      window.clearTimeout(guard);
      video.removeEventListener("ended", done);
      video.removeEventListener("error", done);
      video.removeEventListener("playing", shown);
      video.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the refs are stable; way and part are the phase
  }, [phase, slow, filmNow]);

  // The picture under the film: the one the way starts on until the bridge is over.
  const first = way === "ab" ? "a" : "b";
  const under = part === "after" ? (first === "a" ? "b" : "a") : first;
  const word = (w: "ab" | "ba") => {
    const link = w === "ab" ? ab : ba;
    if (!link) return "möts inte";
    if (!link.film) return "rent klipp";
    const length = link.seconds > 0 ? link.seconds : lengths[w];
    return length ? `film ${seconds(length)}` : "film";
  };
  const sides = { ab: [meeting.a, meeting.b], ba: [meeting.b, meeting.a] } as const;
  return (
    <div className="flex flex-col gap-3">
      <div className={stage}>
        <Picture side={meeting.a} media={media} className={under === "a" ? undefined : "invisible"} />
        <Picture side={meeting.b} media={media} className={under === "b" ? undefined : "invisible"} />
        {(["ab", "ba"] as const).map((w) =>
          films[w] ? (
            <video
              key={w}
              ref={w === "ab" ? videoAb : videoBa}
              src={labUrl(films[w]!)}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                const length = e.currentTarget.duration;
                if (Number.isFinite(length) && length > 0) setLengths((l) => ({ ...l, [w]: length }));
              }}
              className={cn("absolute inset-0 size-full object-cover", film === w ? undefined : "invisible")}
            />
          ) : null,
        )}
        {film ? <span className="absolute bottom-2 left-2 rounded-xs bg-brass px-1.5 text-[11px] font-semibold leading-[18px] text-canvas">brygga</span> : <Tag side={under === "a" ? meeting.a : meeting.b} />}
        <span className="absolute bottom-2 right-2 flex gap-1" aria-hidden>
          {(["before", "over", "after"] as const).map((p) => (
            <span key={p} className={cn("h-1 w-5 rounded-full", p === part ? "bg-brass" : "bg-white/25")} />
          ))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["ab", "ba"] as const).map((w) => (
          <span key={w} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 [&_svg]:size-3", w === way ? "border-brass/70 bg-brass/10 text-ink" : "border-line text-dim")}>
            <span className="font-medium">{sides[w][0].name}</span> <ArrowRight /> <span className="font-medium">{sides[w][1].name}</span>
            <span className="tabular-nums text-dim">· {word(w)}</span>
          </span>
        ))}
        <SegmentedControl size="sm" className="ml-auto" label="Bryggans fart här" value={slow ? "slow" : "full"} onChange={(v) => setSlow(v === "slow")} options={[{ value: "full", label: "1×" }, { value: "slow", label: "¼×" }]} />
      </div>
    </div>
  );
}
