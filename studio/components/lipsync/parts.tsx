// The small pieces every section of Lipsync uses: a section with its heading, the muted "var det står" under a fact, the
// coloured tag of who does a step (one colour per actor, the same in the chain, its legend and the settings' owners), and a
// proof's still or film as a picture.
import { FileSearch, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { labUrl } from "../../lib/lab.ts";
import { whoOf, type Still, type Who } from "../../lib/lipsync.ts";
import { Badge, type BadgeTone } from "../ui/Badge";
import { cn } from "../ui/cn";

/** One colour per actor: ours green, the other team's renderer blue, its model orange, the game brass. */
export const WHO_TONE: Record<Who, BadgeTone> = { ours: "ok", renderer: "variant", model: "remark", game: "brass", other: "neutral" };
export const WHO_EDGE: Record<Who, string> = { ours: "border-l-godkand/70", renderer: "border-l-variant/70", model: "border-l-anmarkning/70", game: "border-l-brass/70", other: "border-l-line-strong" };
export const WHO_WORD: Record<Exclude<Who, "other">, string> = { ours: "Vårt verktyg", renderer: "Scoutgamings renderer", model: "MuseTalk", game: "Spelet" };
export const SEALED = "Låst: sitter i Scoutgamings renderer och går inte att ändra här";

export function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-rubrik`} className="flex scroll-mt-4 flex-col gap-4">
      <header className="flex flex-col gap-0.5 border-b border-line pb-2">
        <h2 id={`${id}-rubrik`} className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {lead ? <p className="text-sm text-dim">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Where a fact stands in the file (its `where`), small and muted: for an agent who looks for the source. */
export function Where({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-start gap-1 text-2xs text-faint", className)}>
      <FileSearch aria-hidden className="mt-px size-3 shrink-0 opacity-80" />
      <span className="sr-only">Var det står: </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

/** Who does a step, in its colour; the other team's renderer and its model carry a lock. */
export function WhoTag({ by }: { by: string }) {
  const who = whoOf(by);
  return (
    <Badge tone={WHO_TONE[who.who]} size="md" icon={who.sealed ? <Lock aria-hidden /> : undefined} title={who.sealed ? SEALED : undefined}>
      {who.label}
    </Badge>
  );
}

/** A proof's still, or its film's first picture (muted, no controls: it is a way into Prov, not a player). */
export function StillView({ still, className }: { still: Still; className?: string }) {
  const src = labUrl(still.path);
  if (still.kind === "video") return <video src={`${src}#t=0.1`} muted playsInline preload="metadata" aria-hidden className={cn("bg-well", className)} />;
  // eslint-disable-next-line @next/next/no-img-element -- a lab file; next/image cannot optimise in a static export
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className={className} />;
}
