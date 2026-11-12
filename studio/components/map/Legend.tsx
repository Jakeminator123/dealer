// The map's legend in one line: what a line and its chip say.
import { cn } from "@/components/ui";
import { VERDICTS, VERDICT_LABEL } from "@/lib/verdict";
import { CountSigns, PlayDot } from "./EdgeChip";

export function Legend({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none flex items-center gap-3 whitespace-nowrap rounded-md border border-line bg-surface/92 px-3 py-1.5 text-[11.5px] text-dim shadow-pop backdrop-blur-sm", className)}>
      <span className="text-ink">Linje = film</span>
      <span aria-hidden className="h-3 w-px bg-line-strong" />
      {VERDICTS.map((v) => (
        <span key={v} className="inline-flex items-center gap-1">
          <PlayDot tag={{ kind: "take", verdict: v, byJakob: true }} />
          {VERDICT_LABEL[v]}
        </span>
      ))}
      <span className="inline-flex items-center rounded-full border border-dashed border-underkand/70 px-1.5 leading-[16px] text-[#ef8b8b]">saknas</span>
      <span aria-hidden className="h-3 w-px bg-line-strong" />
      <span className="inline-flex items-center gap-1">
        <PlayDot tag={{ kind: "take", verdict: "godkand", byJakob: false }} /> streckad = granskarens
      </span>
      <span aria-hidden className="h-3 w-px bg-line-strong" />
      <span className="inline-flex items-center gap-1.5">
        <CountSigns counts={{ accepted: 2, variants: 1, waiting: 0, rejected: 1, total: 4 }} /> = tagningar
      </span>
    </div>
  );
}
