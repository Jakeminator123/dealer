"use client";

// <Origin take={take} graph={graph} />: a fold "Ursprung" under a take (the map's take panel, Granska): what the film was
// made from, read from the bank (origin.ts): the first and last picture side by side with where each came from, the model
// and length, for a cut-out take the clip and frames, for a corrected copy its clip, and the prompt and purpose on demand.
// Closed by default; nothing is read before it is opened (a picture that is a frame of a film is drawn then). The data:
// made-from.ts.
import { ChevronRight, ImageOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Graph, Take } from "../../../src/clip-graph.ts";
import { labUrl } from "../../lib/lab.ts";
import { cn } from "../ui/cn";
import { frameStill } from "./frames";
import { originOf, type OriginPicture } from "./made-from.ts";

function Picture({ label, picture, fps }: { label: string; picture: OriginPicture; fps: number }) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (picture.still || !picture.frame) return;
    let gone = false;
    frameStill(picture.frame.video, picture.frame.index, fps, 360).then(
      (url) => !gone && setDrawn(url),
      () => !gone && setFailed(true),
    );
    return () => {
      gone = true;
    };
  }, [picture.still, picture.frame, fps]);
  const url = picture.still ? labUrl(picture.still) : drawn;
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{label}</figcaption>
      <div className="grid aspect-[3/2] w-full place-items-center overflow-hidden rounded-md border border-line bg-well">
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${label}: ${picture.words}`} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
        ) : failed || (!picture.still && !picture.frame) ? (
          <ImageOff aria-hidden className="size-4 text-faint" />
        ) : (
          <span className="size-4 animate-pulse rounded-full bg-overlay" />
        )}
      </div>
      <span className="text-xs leading-4 text-dim">{picture.words}</span>
      {picture.note ? <span className="text-2xs leading-4 text-faint">{picture.note}</span> : null}
    </figure>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-xs leading-5">
      <span className="w-16 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 text-dim">{children}</span>
    </div>
  );
}

export function Origin({ take, graph, className }: { take: Take; graph: Graph | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const origin = open ? originOf(take, graph) : null;
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 self-start rounded-sm py-0.5 pr-1 text-xs font-medium text-dim transition-colors hover:text-ink"
      >
        <ChevronRight className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")} />
        Ursprung
      </button>
      {origin ? (
        <div className="flex flex-col gap-3 border-l border-line-strong pl-3.5 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <Picture label="Första bild" picture={origin.first} fps={take.fps ?? 30} />
            {origin.last ? <Picture label="Sista bild" picture={origin.last} fps={take.fps ?? 30} /> : null}
          </div>
          <div className="flex flex-col gap-0.5">
            <Row label="Gjord">
              {origin.how === "utsnitt" && origin.cutFrom
                ? `utsnitt ur ${origin.cutFrom.words}, rutor ${origin.cutFrom.start}–${origin.cutFrom.end}`
                : origin.how === "rattad" && origin.editOf
                  ? `rättad kopia av ${origin.editOf.words}, med ${origin.model}`
                  : `med ${origin.model}`}
            </Row>
            {origin.length ? <Row label="Längd">{origin.length}</Row> : null}
            {origin.purpose ? <Row label="Syfte">{origin.purpose}</Row> : null}
          </div>
          {origin.prompt ? (
            <div className="flex flex-col gap-1">
              <button type="button" aria-expanded={prompt} onClick={() => setPrompt(!prompt)} className="self-start text-xs font-medium text-brass-hi hover:text-brass hover:underline">
                {prompt ? "Dölj prompten" : "Visa prompten"}
              </button>
              {prompt ? <p className="whitespace-pre-wrap rounded-md border border-line bg-well px-3 py-2 text-xs leading-5 text-dim">{origin.prompt}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
