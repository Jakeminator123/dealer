// <VerdictChip verdict="godkand" byJakob={false} size="sm|md" />: a verdict as sign AND colour (never colour alone).
// <TakeChip take={take} /> reads it from a take; <ProofChip verdict="remarks" /> is the same chip for a proof file.
// A decision that is not Jakob's own (a reviewer's) is drawn with a dashed edge, and md says "granskare". A provisional
// verdict (lib/verdict.ts provisionalOf) is dashed too and says "Preliminär" (md: "Preliminär · godkänd av granskaren").
import type { Take } from "../../../src/clip-graph.ts";
import { PROOF_VERDICT_LABEL, VERDICT_LABEL, VERDICT_SIGN, provisionalChip, verdictOf, type ProofVerdict, type Verdict } from "../../lib/verdict.ts";
import { cn } from "../ui/cn";

type Tone = Verdict | "anmarkning";

const TONE: Record<Tone, { solid: string; soft: string; text: string }> = {
  primar: { solid: "border-brass bg-brass text-brass-ink", soft: "border-brass/70 text-brass-hi", text: "text-brass-hi" },
  godkand: { solid: "border-godkand/40 bg-godkand/12 text-[#6cc595]", soft: "border-godkand/60 text-[#6cc595]", text: "text-[#6cc595]" },
  variant: { solid: "border-variant/40 bg-variant/12 text-[#9db3f8]", soft: "border-variant/60 text-[#9db3f8]", text: "text-[#9db3f8]" },
  vantar: { solid: "border-vantar/30 bg-vantar/8 text-vantar", soft: "border-vantar/50 text-vantar", text: "text-vantar" },
  underkand: { solid: "border-underkand/40 bg-underkand/12 text-[#ef8b8b]", soft: "border-underkand/60 text-[#ef8b8b]", text: "text-[#ef8b8b]" },
  anmarkning: { solid: "border-anmarkning/40 bg-anmarkning/12 text-[#f0b07a]", soft: "border-anmarkning/60 text-[#f0b07a]", text: "text-[#f0b07a]" },
};

function Chip({
  tone,
  sign,
  label,
  note,
  solid,
  size,
  title,
  className,
}: {
  tone: Tone;
  sign: string;
  label: string;
  note?: string | null;
  solid: boolean;
  size: "sm" | "md";
  title: string;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 select-none items-center whitespace-nowrap rounded-full border font-medium leading-none",
        size === "sm" ? "h-5 gap-1 px-1.5 text-2xs" : "h-6 gap-1.5 px-2 text-xs",
        solid ? t.solid : cn("border-dashed bg-transparent", t.soft),
        className,
      )}
    >
      <span aria-hidden className={cn("inline-grid place-items-center leading-none", size === "sm" ? "w-2.5 text-[10.5px]" : "w-3 text-[12.5px]")}>
        {sign}
      </span>
      <span>{label}</span>
      {note && size === "md" ? <span className={cn("font-normal", solid && tone === "primar" ? "text-brass-ink/70" : "opacity-75")}>· {note}</span> : null}
    </span>
  );
}

export function VerdictChip({
  verdict,
  byJakob = true,
  detail = null,
  provisional = false,
  size = "md",
  className,
}: {
  verdict: Verdict;
  /** false: a reviewer decided, not Jakob (dashed edge; md says "granskare"). Ignored for Väntar. */
  byJakob?: boolean;
  /** A word more, shown in md and in the tooltip: "sekundär", "renderas". */
  detail?: string | null;
  /** The main agent and a reviewer judged it in Jakob's place; it waits for his word. */
  provisional?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  if (provisional && verdict !== "vantar" && verdict !== "primar") {
    const [label, ...rest] = provisionalChip({ verdict }).split(" · ");
    return <Chip tone={verdict} sign={VERDICT_SIGN[verdict]} label={label} note={rest.join(" · ")} solid={false} size={size} title={`${provisionalChip({ verdict })} · inte Jakobs dom, väntar på honom`} className={className} />;
  }
  const reviewer = !byJakob && verdict !== "vantar";
  const note = [detail, reviewer ? "granskare" : null].filter(Boolean).join(" · ") || null;
  const title = [VERDICT_LABEL[verdict], detail, reviewer ? "av granskare, inte Jakob" : verdict === "vantar" ? null : "Jakobs beslut"].filter(Boolean).join(" · ");
  return <Chip tone={verdict} sign={VERDICT_SIGN[verdict]} label={VERDICT_LABEL[verdict]} note={note} solid={!reviewer} size={size} title={title} className={className} />;
}

/** The chip of one take, read from its review (lib/verdict.ts verdictOf). */
export function TakeChip({ take, size = "md", className }: { take: Parameters<typeof verdictOf>[0] | Take; size?: "sm" | "md"; className?: string }) {
  const v = verdictOf(take);
  return <VerdictChip verdict={v.verdict} byJakob={v.byJakob} detail={v.detail} provisional={v.provisional} size={size} className={className} />;
}

const PROOF_TONE: Record<ProofVerdict, { tone: Tone; sign: string }> = {
  ok: { tone: "godkand", sign: "✓" },
  remarks: { tone: "anmarkning", sign: "!" },
  failed: { tone: "underkand", sign: "✕" },
  unreviewed: { tone: "vantar", sign: "○" },
};

/** A proof file's verdict (lib/verdict.ts proofVerdict): Användbar ✓ · Med anmärkningar ! · Underkänd ✕ · Inte granskad ○. */
export function ProofChip({ verdict, size = "md", className }: { verdict: ProofVerdict; size?: "sm" | "md"; className?: string }) {
  const { tone, sign } = PROOF_TONE[verdict];
  const label = PROOF_VERDICT_LABEL[verdict];
  return <Chip tone={tone} sign={sign} label={label} solid size={size} title={label} className={className} />;
}
