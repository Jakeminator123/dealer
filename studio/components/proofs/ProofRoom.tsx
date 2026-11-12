"use client";

// <ProofRoom proof={proof} file={name} onFile={(name) => …} />: one proof open. The film large with its playlist beside it
// (chapters as marks on the scrub bar, the chapter's name beside the frame count), the pictures in a gallery that opens
// the viewer, every file by its short name with its verdict chip; the rest of a label and the proof's description on demand.
import { ChevronDown, Film, Image as ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Proof } from "../../lib/api.ts";
import { chapterAt, chaptersOf, countLine, formatBytes, pickFile, proofDay, proofFiles, proofTitle, unwrap, type ProofEntry } from "../../lib/proofs.ts";
import { splitLabel } from "../../lib/verdict.ts";
import { FilmPlayer, type FilmMark } from "../player";
import { Fold } from "../review/Fold";
import { ProofChip } from "../takes";
import { cn } from "../ui/cn";
import { ImageViewer } from "./ImageViewer";
import { ProofStill } from "./ProofStill";

function FileName({ entry, size = "sm" }: { entry: ProofEntry; size?: "sm" | "md" }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("min-w-0 truncate font-medium text-ink", size === "md" ? "text-md" : "text-sm")} title={entry.label}>
        {entry.name}
      </span>
      {entry.verdict ? <ProofChip verdict={entry.verdict} size="sm" /> : null}
    </span>
  );
}

/** The rest of a file's label and the file itself, folded away until asked for. */
function More({ entry }: { entry: ProofEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-dim hover:text-ink">
        Mer om filen <ChevronDown className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-1.5 flex flex-col gap-1 text-sm text-dim">
          {entry.rest ? <p>{entry.rest}</p> : null}
          <p className="text-xs text-faint">
            {entry.file.name} · {formatBytes(entry.file.bytes)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ProofRoom({ proof, file, onFile }: { proof: Proof; file: string | null; onFile: (name: string | null) => void }) {
  const files = useMemo(() => proofFiles(proof), [proof]);
  const { films, pictures } = files;
  const { film, index: viewing } = pickFile(files, file);
  const [frames, setFrames] = useState<{ path: string; count: number } | null>(null);
  const filmFrames = film && frames?.path === film.file.path ? frames.count : null;
  const chapters = useMemo(() => chaptersOf(proof, filmFrames), [proof, filmFrames]);
  const marks: FilmMark[] = chapters.map((c) => ({ frame: c.frame, label: c.label, kind: "chapter" }));
  const full = proofTitle(proof);
  const { name: title, rest: subtitle } = splitLabel(full);
  const meta = [countLine(proof), proofDay(proof)].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-4xl flex-col gap-1.5">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        <span className="text-sm text-faint">
          {subtitle ? <span className="text-dim">{unwrap(subtitle)} · </span> : null}
          {meta} · <span className="font-mono text-xs">{proof.id}</span>
        </span>
        {proof.description ? (
          <Fold lines={2} className="mt-1 text-sm leading-6 text-dim" more="Visa hela beskrivningen">
            {proof.description}
          </Fold>
        ) : null}
      </div>

      {film ? (
        <section aria-label="Filmer" className={cn("grid gap-4", films.length > 1 ? "grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1")}>
          <div className="flex min-w-0 flex-col gap-3">
            <FilmPlayer
              key={film.file.path}
              src={film.file.path}
              fps={proof.fps}
              marks={marks}
              audio
              keys={viewing === null}
              counter={(f) => chapterAt(chapters, f)?.label ?? null}
              label={`Film: ${film.name}`}
              onLoaded={(info) => setFrames({ path: film.file.path, count: info.frames })}
              className="h-[min(66vh,700px)] min-h-[300px]"
            />
            <div className="flex min-w-0 flex-col gap-1 px-1">
              <FileName entry={film} size="md" />
              <More key={film.file.name} entry={film} />
            </div>
          </div>
          {films.length > 1 ? (
            <aside aria-label="Spellista" className="flex max-h-[min(66vh,700px)] min-h-0 flex-col rounded-lg border border-line bg-surface">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3.5 text-sm font-semibold text-ink">
                <Film className="size-4 text-dim" /> {films.length} filmer
              </div>
              <ol className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
                {films.map((f, i) => {
                  const on = f === film;
                  return (
                    <li key={f.file.name}>
                      <button
                        type="button"
                        aria-current={on || undefined}
                        onClick={() => onFile(f.file.name)}
                        className={cn("relative flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors duration-150", on ? "bg-raised" : "hover:bg-raised/60")}
                      >
                        {on ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brass" /> : null}
                        <span className="w-5 shrink-0 text-center text-2xs text-faint tabular-nums">{i + 1}</span>
                        <ProofStill cover={{ kind: "video", path: f.file.path, frame: Math.round(proof.fps || 30) }} fps={proof.fps} className="aspect-[3/2] w-[84px] shrink-0 rounded-sm" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className={cn("line-clamp-2 text-sm leading-[18px]", on ? "text-ink" : "text-ink/85")} title={f.label}>
                            {f.name}
                          </span>
                          {f.verdict ? <ProofChip verdict={f.verdict} size="sm" className="w-fit" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          ) : null}
        </section>
      ) : null}

      {pictures.length ? (
        <section aria-label="Bilder" className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ImageIcon className="size-4 text-dim" /> {pictures.length === 1 ? "1 bild" : `${pictures.length} bilder`}
            <span className="font-normal text-faint">· klicka för full storlek</span>
          </h3>
          <ul className={cn("grid gap-4", film ? "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(420px,1fr))]")}>
            {pictures.map((p) => (
              <li key={p.file.name}>
                <figure className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onFile(p.file.name)}
                    title={`${p.name}: visa stor`}
                    className="group relative overflow-hidden rounded-lg border border-line bg-well transition-[border-color] duration-150 hover:border-line-strong focus-visible:outline-offset-2"
                  >
                    <ProofStill cover={{ kind: "image", path: p.file.path }} fit="contain" className="aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.015]" />
                  </button>
                  <figcaption className="px-0.5">
                    <FileName entry={p} />
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!films.length && !pictures.length ? <p className="text-sm text-faint">Provet har inga filmer eller bilder.</p> : null}

      <ImageViewer pictures={pictures} index={viewing} onIndex={(i) => onFile(i === null ? (film?.file.name ?? null) : pictures[i].file.name)} />
    </div>
  );
}
