"use client";

// <Tile entry={e} onOpen={…} />: one picture of the register as a large still: the picture itself, a frame of a film drawn
// once (ProofStill), or a quiet panel when the file lies outside the lab or is gone. Under it its short name and how many
// of the bank's films start or end on it; its state as a chip on the picture, and top right how it fits today's card plan
// when it does not (and what a reference is for). A replaced picture is drawn dimmer.
import { Film, HardDrive, ImageOff, Play } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { fitChip, referenceChips, sizeWords, usedWords, type EntryAnswer, type State } from "../../lib/media.ts";
import { ProofStill, type Cover } from "../proofs";
import { Badge, buttonClasses, cn, type BadgeTone } from "../ui";

export const TILE_HEIGHT = 150;

export type ChipState = State | "saknas" | "finns";
const STATE: Record<ChipState, { tone: BadgeTone; sign: string; word: string }> = {
  gäller: { tone: "ok", sign: "✓", word: "gäller" },
  finns: { tone: "ok", sign: "✓", word: "finns" },
  kandidat: { tone: "remark", sign: "◐", word: "kandidat" },
  ersatt: { tone: "neutral", sign: "↺", word: "ersatt" },
  arkiverad: { tone: "neutral", sign: "▣", word: "arkiverad" },
  saknas: { tone: "bad", sign: "✕", word: "saknas" },
};

/** A state as sign AND colour: gäller ✓, finns ✓, kandidat ◐, ersatt ↺, arkiverad ▣, saknas ✕. */
export function StateChip({ state, size = "sm", className }: { state: ChipState; size?: "sm" | "md"; className?: string }) {
  const s = STATE[state];
  return (
    <Badge tone={s.tone} size={size} className={className}>
      <span aria-hidden>{s.sign}</span> {s.word}
    </Badge>
  );
}

/** The frame a tile shows: the picture, the entry's own frame, or a still of a whole film. */
export function coverOfEntry(entry: EntryAnswer): Cover {
  if (!entry.served) return null;
  if (entry.served.endsWith(".mp4")) return { kind: "video", path: entry.served, frame: entry.frame ?? entry.still ?? 30 };
  return { kind: "image", path: entry.served };
}

/** The tile's width at its height: the picture's own proportions, within reason. */
export function tileWidth(entry: Pick<EntryAnswer, "width" | "height">, height = TILE_HEIGHT): number {
  const aspect = entry.width && entry.height ? entry.width / entry.height : 1.5;
  return Math.round(Math.min(Math.max(height * aspect, height * 0.6), height * 1.9));
}

function Placeholder({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[repeating-linear-gradient(135deg,#0c110f_0_8px,#0a0e0c_8px_16px)] px-3 text-center text-2xs leading-4 text-faint [&_svg]:size-4">
      {icon}
      {children}
    </div>
  );
}

/** How a fit verdict looks: an older plan or a deviation is a remark, the rest is quiet. */
const FIT_TONE: Record<string, BadgeTone> = { "äldre plan": "remark", avviker: "remark", "annan kamera": "neutral", "går inte att mäta": "neutral" };

/**
 * Top right on the picture: how it fits today's card plan when it does not (tools/media-audit.ts, data/media-fit.json), and
 * for a reference what it is a reference for and "används inte" when nothing uses it today. The numbers are in the detail.
 */
function FitChips({ entry }: { entry: EntryAnswer }) {
  const verdict = fitChip(entry.fit), extra = entry.role === "referens" ? referenceChips(entry.fit) : [];
  if (!verdict && !extra.length) return null;
  return (
    <span className="pointer-events-none absolute right-1.5 top-1.5 flex flex-col items-end gap-1" title={entry.fit?.words || undefined}>
      {verdict ? (
        <Badge tone={FIT_TONE[verdict] ?? "neutral"} size="sm" className="bg-[#0b0f0d]/85 backdrop-blur-sm">
          {verdict}
        </Badge>
      ) : null}
      {extra.map((word) => (
        <Badge key={word} tone="neutral" size="sm" className="bg-[#0b0f0d]/85 backdrop-blur-sm">
          {word}
        </Badge>
      ))}
    </span>
  );
}

/** The second line under a film of the references: its length. */
export const filmLine = (entry: Pick<EntryAnswer, "frames" | "fps" | "count">): string | null =>
  entry.count ? `${entry.count} filer` : entry.frames && entry.fps ? `${Math.round(entry.frames / entry.fps)} s · ${entry.frames} rutor` : null;

/** A mark under a tile: a short chip (studio/lib/lineage.ts) that opens the picture it names. */
export type TileMark = { chip: string; title: string; onClick?: () => void };

export function Tile({ entry, onOpen, selected = false, line, marks = [], quiet, dim = false }: { entry: EntryAnswer; onOpen: (entry: EntryAnswer) => void; selected?: boolean; line?: ReactNode; marks?: readonly TileMark[]; quiet?: string | null; dim?: boolean }) {
  const cover = coverOfEntry(entry);
  // Without a picture to show, a narrow card is enough.
  const width = cover ? tileWidth(entry) : 168;
  const used = entry.usedBy.length;
  const style: CSSProperties = { width, height: TILE_HEIGHT };
  const frameTag = entry.frame !== undefined ? `ruta ${entry.frame}` : entry.served?.endsWith(".mp4") ? "film" : entry.count ? `${entry.count} filer` : null;
  return (
    <li className={cn("flex shrink-0 flex-col gap-1.5", dim && "opacity-55")} style={{ width }}>
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={`Öppna ${entry.name}`}
        className={cn(
          "group relative overflow-hidden rounded-md border bg-well text-left shadow-inset transition-[border-color,box-shadow] duration-150",
          selected ? "border-brass/70 ring-2 ring-brass/25" : "border-line hover:border-line-strong",
        )}
        style={style}
      >
        {cover ? (
          <ProofStill cover={cover} fps={entry.fps ?? 30} className={cn("absolute inset-0 transition-[filter,opacity] duration-200 group-hover:brightness-110", (entry.state === "ersatt" || entry.state === "arkiverad") && "opacity-55 saturate-50")} />
        ) : entry.inside ? (
          <Placeholder icon={<ImageOff />}>Filen saknas</Placeholder>
        ) : (
          <Placeholder icon={<HardDrive />}>
            <span>Utanför labbet</span>
            {entry.width && entry.height ? <span className="tabular-nums text-dim">{sizeWords(entry.width, entry.height)}</span> : null}
          </Placeholder>
        )}
        {entry.state ? <StateChip state={entry.state} className="absolute left-1.5 top-1.5 bg-[#0b0f0d]/85 backdrop-blur-sm" /> : null}
        <FitChips entry={entry} />
        {frameTag ? (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-xs bg-black/65 px-1.5 py-0.5 text-2xs font-medium text-ink backdrop-blur-sm">
            {entry.served?.endsWith(".mp4") ? <Film className="size-3" /> : null}
            {frameTag}
          </span>
        ) : null}
      </button>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm font-medium leading-5 text-ink" title={entry.name}>
          {entry.name}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs">
          {line !== undefined ? (
            <span className="truncate text-faint">{line}</span>
          ) : (
            <span className={cn("truncate", used ? "text-brass-hi" : "text-faint")}>{usedWords(used)}</span>
          )}
          {entry.link ? (
            <Link href={entry.link} className={cn(buttonClasses({ variant: "quiet", size: "sm" }), "ml-auto h-6 shrink-0 px-1.5 text-xs text-brass-hi")}>
              <Play className="size-3" /> Spela
            </Link>
          ) : null}
        </span>
        {quiet || marks.length ? (
          <span className="flex flex-wrap gap-1">
            {quiet ? (
              <Badge tone="neutral" size="sm">
                {quiet}
              </Badge>
            ) : null}
            {marks.map((m) =>
              m.onClick ? (
                <button key={m.chip + m.title} type="button" onClick={m.onClick} title={m.title} className="rounded-full focus-visible:outline-offset-2">
                  <Badge tone="remark" size="sm" className="cursor-pointer hover:brightness-125">
                    {m.chip}
                  </Badge>
                </button>
              ) : (
                <Badge key={m.chip + m.title} tone="remark" size="sm" title={m.title}>
                  {m.chip}
                </Badge>
              ),
            )}
          </span>
        ) : null}
      </div>
    </li>
  );
}
