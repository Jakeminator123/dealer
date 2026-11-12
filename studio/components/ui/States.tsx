"use client";

// <Skeleton className="h-4 w-40" />: a placeholder that shimmers while something is read (give it the size of what comes).
// <EmptyState icon={<Inbox />} title="Inget att granska" action={…}>Kort text.</EmptyState> and
// <ErrorState error={err} onRetry={reload} />: the two states a view shows instead of content. compact fits inside a panel.
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-[linear-gradient(90deg,#161d19_0%,#1d2622_40%,#161d19_80%)] bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}

function StateFrame({
  icon,
  title,
  children,
  action,
  compact,
  tone,
  className,
  role,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone: "neutral" | "bad";
  className?: string;
  role?: string;
}) {
  return (
    <div role={role} className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-8" : "min-h-[320px] gap-3 px-6 py-16", className)}>
      {icon ? (
        <div
          className={cn(
            "mb-1 grid place-items-center rounded-full border [&_svg]:shrink-0",
            compact ? "size-10 [&_svg]:size-[18px]" : "size-14 [&_svg]:size-6",
            tone === "bad" ? "border-underkand/30 bg-underkand/10 text-[#ef8b8b]" : "border-line-strong bg-raised text-dim",
          )}
        >
          {icon}
        </div>
      ) : null}
      <h2 className={cn("font-display font-semibold text-ink", compact ? "text-md" : "text-lg")}>{title}</h2>
      {children ? <div className={cn("max-w-sm text-balance text-dim", compact ? "text-xs" : "text-sm")}>{children}</div> : null}
      {action ? <div className="mt-2 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact = false,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <StateFrame icon={icon} title={title} action={action} compact={compact} tone="neutral" className={className}>
      {children}
    </StateFrame>
  );
}

export function ErrorState({
  error,
  title = "Det gick inte",
  onRetry,
  compact = false,
  className,
}: {
  /** What went wrong: an Error (its message is shown) or a sentence. */
  error: unknown;
  title?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : null;
  return (
    <StateFrame
      role="alert"
      icon={<CircleAlert />}
      title={title}
      compact={compact}
      tone="bad"
      className={className}
      action={onRetry ? <Button size={compact ? "sm" : "md"} onClick={onRetry}>Försök igen</Button> : undefined}
    >
      {message}
    </StateFrame>
  );
}
