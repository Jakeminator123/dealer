// <Card selected interactive>…</Card>: a surface with a hairline border (rounded-lg); selected draws a brass ring.
// <Panel title="Rundan" actions={…} flush>…</Panel>: a titled section of a page; flush leaves out the body's padding.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({
  selected = false,
  interactive = false,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { selected?: boolean; interactive?: boolean }) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "relative rounded-lg border border-line bg-surface shadow-inset transition-[border-color,background-color,box-shadow] duration-150",
        interactive && "hover:border-line-strong hover:bg-[#151c18]",
        selected && "border-brass/60 shadow-[0_0_0_1px_rgb(217_185_106/0.45)] hover:border-brass/70",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  flush = false,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-surface shadow-inset", className)}>
      {title || actions ? (
        <header className="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {title ? <h2 className="truncate text-sm font-semibold text-ink">{title}</h2> : null}
            {subtitle ? <span className="truncate text-xs text-faint">{subtitle}</span> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-h-0 flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
