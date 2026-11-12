"use client";

// <MaterialViewer entries={role's entries} index={i} onIndex={setI} />: one picture of the register over the whole window,
// like the proof room's viewer (components/proofs/ImageViewer), and in two ways more: a frame of a film is shown from the
// film itself (a paused video at that frame), and its facts open on demand beside it (F): where the file lies, its size,
// what it was made from, and the bank's films that start or end on it, each a link to the map. ← → between the pictures
// of the row, Z between the fitted picture and its full size, Esc closes. A candidate picture has Godkänn and Underkänn
// in the header (StateDecision), given the register's revision; not in the online copy.
import * as RD from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, HardDrive, ImageOff, Info, Maximize2, Minimize2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import { ROLE_LABEL, sizeWords, usedWords, type EntryAnswer } from "../../lib/media.ts";
import { edgeName, nodeName, takeName } from "../../lib/names.ts";
import { formatBytes } from "../../lib/proofs.ts";
import { TakeChip, frameTime } from "../takes";
import { Button, IconButton, Kbd, cn } from "../ui";
import { StateDecision } from "./StateDecision";
import { StateChip } from "./Tile";

const PAD = 24;

/** The address of the map with one take of one step open. */
export const mapHref = (edge: string, take: string) => `/karta/?${new URLSearchParams({ kant: edge, tagning: take }).toString()}`;

function Picture({ entry, close }: { entry: EntryAnswer; close: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const src = entry.served ? labUrl(entry.served) : null;
  const film = !!entry.served?.endsWith(".mp4");
  const fps = entry.fps ?? 30;
  const at = entry.frame ?? entry.still ?? 0;
  useEffect(() => {
    const v = video.current;
    if (!v || !film) return;
    const seek = () => {
      v.currentTime = frameTime(at, fps);
    };
    if (v.readyState >= 1) seek();
    v.addEventListener("loadedmetadata", seek);
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [film, at, fps, src]);

  if (!src)
    return (
      <div className="grid h-full place-items-center p-10 text-center">
        <div className="flex max-w-md flex-col items-center gap-3 text-dim [&_svg]:size-7">
          {entry.inside ? <ImageOff /> : <HardDrive />}
          <p className="text-md text-ink">{entry.inside ? "Filen saknas på den här datorn." : "Filen ligger utanför labbet, så den visas inte här."}</p>
          <p className="break-all font-mono text-xs text-faint">{entry.path ?? entry.proof}</p>
        </div>
      </div>
    );
  const size = close && entry.width && entry.height ? { width: entry.width, height: entry.height } : undefined;
  const fitted = cn("select-none", size ? "max-w-none" : "size-full object-contain");
  return (
    <div className={cn("h-full", close ? "overflow-auto" : "overflow-hidden")} style={close ? undefined : { padding: PAD }}>
      <div className={cn(close ? "grid min-h-full min-w-full place-items-center" : "h-full")}>
        {film ? (
          // A frame of a film is the film itself, paused on that frame; a whole film plays with its own controls.
          <video
            ref={video}
            key={src}
            src={src}
            muted
            playsInline
            preload="auto"
            controls={entry.frame === undefined}
            className={fitted}
            style={size}
            aria-label={entry.name}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a lab file at its own size; next/image cannot optimise in a static export
          <img src={src} alt={entry.name} draggable={false} className={fitted} style={size} />
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-2xs font-medium uppercase tracking-[0.06em] text-faint">{label}</dt>
      <dd className="text-sm leading-5 text-ink">{children}</dd>
    </div>
  );
}

function Uses({ entry }: { entry: EntryAnswer }) {
  const { graph } = useBank();
  if (!entry.usedBy.length) return <p className="text-sm text-faint">Ingen film i banken börjar eller slutar på den.</p>;
  const sides = [
    { side: "first" as const, word: "Börjar här" },
    { side: "last" as const, word: "Slutar här" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {sides.map(({ side, word }) => {
        const list = entry.usedBy.filter((u) => u.side === side);
        if (!list.length) return null;
        return (
          <div key={side} className="flex flex-col gap-1">
            <span className="text-xs text-dim">
              {word} · {list.length}
            </span>
            <ul className="flex flex-col">
              {list.map((u) => {
                const take = graph?.takes[u.job] ?? null;
                const edge = take?.edge ?? u.edge;
                const name = take ? takeName(take, graph?.edge[edge]?.takes) : u.job.replace(/^pamela-/, "");
                return (
                  <li key={`${u.job}-${side}`}>
                    <Link href={mapHref(edge, u.job)} className="group flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-raised">
                      <span className="w-[92px] shrink-0 tabular-nums text-dim group-hover:text-ink">{edgeName(edge)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
                      {take ? <TakeChip take={take} size="sm" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Facts({ entry }: { entry: EntryAnswer }) {
  const where = [entry.card ? `kort ${entry.card}` : null, entry.node ? nodeName(entry.node) : null].filter(Boolean).join(" · ");
  const size = sizeWords(entry.width, entry.height);
  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-white/6 bg-surface/60 px-5 py-5">
      <dl className="flex flex-col gap-4">
        <Fact label="Roll">
          {ROLE_LABEL[entry.role]}
          {where ? <span className="text-dim"> · {where}</span> : null}
        </Fact>
        {entry.note ? <Fact label="Om bilden">{entry.note}</Fact> : null}
        {(entry as { stateBy?: string }).stateBy ? <Fact label="Dom">{(entry as { stateBy?: string }).stateBy}</Fact> : null}
        <Fact label="Var den ligger">
          <span className="break-all font-mono text-xs leading-5 text-dim">{entry.pattern ?? entry.path ?? `assets/proofs/${entry.proof}`}</span>
          {entry.frame !== undefined ? (
            <span className="mt-1 block text-sm">
              Ruta {entry.frame}
              {entry.frames ? ` av ${entry.frames}` : ""} i filmen{entry.inside ? "" : " (utanför labbet)"}
            </span>
          ) : null}
          {!entry.inside ? <span className="mt-1 block text-xs text-[#f0b07a]">Utanför repot: labbet lämnar inte ut den.</span> : null}
        </Fact>
        {size || entry.bytes ? (
          <Fact label="Storlek">
            {[size, entry.count ? `${entry.count} filer` : null, entry.frames && entry.fps && entry.frame === undefined ? `${entry.frames} rutor, ${entry.fps} per s` : null, entry.bytes ? formatBytes(entry.bytes) : null].filter(Boolean).join(" · ")}
          </Fact>
        ) : null}
        {entry.source ? (
          <Fact label="Gjord ur">
            {entry.source.from}
            {entry.source.when ? <span className="text-dim"> · {entry.source.when}</span> : null}
          </Fact>
        ) : null}
        <Fact label={usedWords(entry.usedBy.length).replace(/^./, (c) => c.toUpperCase())}>
          <Uses entry={entry} />
        </Fact>
      </dl>
    </aside>
  );
}

export function MaterialViewer({
  entries,
  index,
  onIndex,
  revision = null,
  onDecided,
}: {
  entries: readonly EntryAnswer[];
  index: number | null;
  onIndex: (index: number | null) => void;
  /** The register's revision as read: with it, a candidate gets Godkänn and Underkänn (StateDecision). */
  revision?: string | null;
  onDecided?: () => void;
}) {
  const open = index !== null && !!entries[index];
  const entry = open ? entries[index] : null;
  const [facts, setFacts] = useState(false);
  const [close, setClose] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => setClose(false), [index]);

  const go = (step: number) => {
    if (index === null || !entries.length) return;
    onIndex((index + step + entries.length) % entries.length);
  };

  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#060807] data-[state=open]:animate-fade-in" />
        <RD.Content
          ref={content}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.focus();
          }}
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).tagName === "VIDEO" && event.key === " ") return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") go(event.key === "ArrowLeft" ? -1 : 1);
            else if (event.key === "z" || event.key === "Z") setClose((c) => !c);
            else if (event.key === "f" || event.key === "F") setFacts((f) => !f);
            else return;
            event.preventDefault();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[#060807] focus:outline-none data-[state=open]:animate-fade-in"
        >
          {entry ? (
            <>
              <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/6 px-5">
                <span className="text-sm text-faint tabular-nums">
                  {index! + 1} / {entries.length}
                </span>
                <span className="text-sm text-dim">{ROLE_LABEL[entry.role]}</span>
                <RD.Title className="min-w-0 truncate font-display text-md font-semibold text-ink">{entry.name}</RD.Title>
                {entry.state ? <StateChip state={entry.state} size="md" /> : null}
                {onDecided ? (
                  <div className="ml-2 flex items-center gap-1.5">
                    <StateDecision entry={entry} row={entries} revision={revision} onDecided={onDecided} />
                  </div>
                ) : null}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="mr-3 hidden items-center gap-1.5 text-xs text-faint lg:flex">
                    <Kbd>F</Kbd> fakta
                    <span className="mx-1" />
                    <Kbd>Z</Kbd> {close ? "hela bilden" : "full storlek"}
                    <span className="mx-1" />
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd> bläddra
                  </span>
                  <Button variant="secondary" size="sm" icon={<Info />} aria-pressed={facts} onClick={() => setFacts((f) => !f)}>
                    Fakta
                  </Button>
                  <IconButton label={close ? "Hela bilden" : "Full storlek"} kbd="Z" icon={close ? <Minimize2 /> : <Maximize2 />} aria-pressed={close} onClick={() => setClose((c) => !c)} />
                  <RD.Close asChild>
                    <IconButton label="Stäng" kbd="Esc" icon={<X />} />
                  </RD.Close>
                </div>
              </header>
              <div className="flex min-h-0 flex-1">
                <div className="relative min-w-0 flex-1">
                  <Picture entry={entry} close={close} />
                  {entries.length > 1 ? (
                    <>
                      <button type="button" aria-label="Föregående bild" onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-ink ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-black/80">
                        <ChevronLeft className="size-5" />
                      </button>
                      <button type="button" aria-label="Nästa bild" onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-ink ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-black/80">
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  ) : null}
                </div>
                {facts ? <Facts entry={entry} /> : null}
              </div>
              <footer className="flex min-h-11 shrink-0 items-center gap-4 border-t border-white/6 px-5 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-dim">{entry.note ?? ""}</span>
                <button type="button" onClick={() => setFacts(true)} className={cn("shrink-0 text-xs tabular-nums", entry.usedBy.length ? "text-brass-hi hover:underline" : "text-faint")}>
                  {usedWords(entry.usedBy.length)}
                </button>
                <span className="shrink-0 text-xs text-faint tabular-nums">{[sizeWords(entry.width, entry.height), entry.frame !== undefined ? `ruta ${entry.frame}` : null].filter(Boolean).join(" · ")}</span>
              </footer>
            </>
          ) : (
            <RD.Title className="sr-only">Bild</RD.Title>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
