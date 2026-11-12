"use client";

// <EdgeChip tag={tag} counts={counts} /> the label a film carries on the node map: a dot with the sign of what plays
// there (★ Primär, ✓ Godkänd, ◆ Variant, ○ Väntar, ✕ Underkänd; dashed when a reviewer decided, not Jakob), or the word
// "saknas" when nothing plays; then how many takes the edge has of each kind (✓ godkända · ◆ varianter · ○ väntar ·
// ✕ underkända), zeros left out. Sign and colour together, never colour alone.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/components/ui";
import { BUCKETS, BUCKET_SIGN, type Bucket, type Counts, type Tag } from "@/lib/edge-stats";
import { VERDICT_SIGN, type Verdict } from "@/lib/verdict";

/** The colour of a film's line, by what plays on it. */
export const LINE: Record<Verdict | "gap", string> = {
  primar: "#d9b96a",
  godkand: "#4fb27f",
  variant: "#7f9cf5",
  vantar: "#a3b1c2",
  underkand: "#e06c6c",
  gap: "#e06c6c",
};
export const lineOf = (tag: Tag) => (tag.kind === "gap" ? LINE.gap : LINE[tag.verdict]);

const DOT: Record<Verdict, { solid: string; soft: string }> = {
  primar: { solid: "bg-brass text-brass-ink border-brass", soft: "border-brass text-brass-hi" },
  godkand: { solid: "bg-godkand text-[#0b1a12] border-godkand", soft: "border-godkand text-[#6cc595]" },
  variant: { solid: "bg-variant text-[#0d1430] border-variant", soft: "border-variant text-[#9db3f8]" },
  vantar: { solid: "bg-vantar text-[#151a20] border-vantar", soft: "border-vantar text-vantar" },
  underkand: { solid: "bg-underkand text-[#2a0d0d] border-underkand", soft: "border-underkand text-[#ef8b8b]" },
};
const COUNT_SIGN: Record<Bucket, string> = { accepted: "text-[#6cc595]", variants: "text-[#9db3f8]", waiting: "text-vantar", rejected: "text-[#ef8b8b]" };

export function PlayDot({ tag, className }: { tag: Extract<Tag, { kind: "take" }>; className?: string }) {
  const tone = DOT[tag.verdict];
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full border text-[9.5px] font-bold leading-none",
        tag.byJakob ? tone.solid : cn("border-dashed bg-transparent", tone.soft),
        className,
      )}
    >
      {VERDICT_SIGN[tag.verdict]}
    </span>
  );
}

export function CountSigns({ counts, className }: { counts: Counts; className?: string }) {
  const shown = BUCKETS.filter((b) => counts[b]);
  if (!shown.length) return null;
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      {shown.map((b) => (
        <span key={b} className="inline-flex items-center gap-[2px]">
          <span className={cn("text-[10px] leading-none", COUNT_SIGN[b])}>{BUCKET_SIGN[b]}</span>
          <span className="text-dim">{counts[b]}</span>
        </span>
      ))}
    </span>
  );
}

export type EdgeChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tag: Tag;
  counts: Counts;
  /** Chosen (its panel is open) or under the pointer. */
  active?: boolean;
  /** Set back: another seat or film is chosen. */
  dim?: boolean;
  /** Only the dot (the map is zoomed far out). */
  compact?: boolean;
};

export const EdgeChip = forwardRef<HTMLButtonElement, EdgeChipProps>(function EdgeChip({ tag, counts, active = false, dim = false, compact = false, className, ...rest }, ref) {
  const gap = tag.kind === "gap";
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border pl-[3px] pr-2 text-[11px] font-medium leading-none",
        "bg-surface shadow-[0_1px_6px_rgb(0_0_0/0.45)] transition-[opacity,border-color,box-shadow] duration-150",
        gap ? "border-dashed border-underkand/70 pl-2 text-[#ef8b8b]" : "border-line-strong text-ink hover:border-[#4a5a51]",
        active && "border-brass shadow-[0_0_0_2px_rgb(217_185_106/0.35),0_1px_6px_rgb(0_0_0/0.45)]",
        dim && "opacity-25",
        compact && "pr-[3px]",
        className,
      )}
      {...rest}
    >
      {gap ? <span>{tag.word}</span> : <PlayDot tag={tag} />}
      {compact ? null : <CountSigns counts={counts} />}
    </button>
  );
});
