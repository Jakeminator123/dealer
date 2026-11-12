// <Badge tone="neutral|brass|ok|variant|wait|bad|remark" size="sm|md">19</Badge>: a small count or fact in a pill.
// <Kbd>Mellanslag</Kbd>: a key on the keyboard. For a take's verdict use VerdictChip (components/takes), not a badge.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "brass" | "ok" | "variant" | "wait" | "bad" | "remark";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-overlay text-dim",
  brass: "border-brass/35 bg-brass/12 text-brass-hi",
  ok: "border-godkand/30 bg-godkand/10 text-[#6cc595]",
  variant: "border-variant/30 bg-variant/10 text-[#9db3f8]",
  wait: "border-vantar/25 bg-vantar/8 text-vantar",
  bad: "border-underkand/30 bg-underkand/10 text-[#ef8b8b]",
  remark: "border-anmarkning/30 bg-anmarkning/10 text-[#f0b07a]",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; size?: "sm" | "md"; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-medium tabular-nums [&_svg]:shrink-0",
        size === "sm" ? "h-[18px] px-1.5 text-2xs [&_svg]:size-3" : "h-[22px] px-2 text-xs [&_svg]:size-3.5",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-b-2 border-line-strong bg-raised px-1.5 font-sans text-2xs font-medium text-dim",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
