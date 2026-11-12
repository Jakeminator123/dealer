// <Page title="Granska" status={<BankStatus />} actions={<Button…/>}>…</Page>: one view: a slim header and the area below.
// Default: the area scrolls and has the page padding. full: the area is exactly the rest of the window, no padding, no
// scroll (the scene, the node map): fill it with h-full / absolute inset-0.
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export function Page({
  title,
  status,
  actions,
  full = false,
  className,
  children,
}: {
  title: ReactNode;
  /** A short state beside the title: counts, what is playing, <BankStatus />. */
  status?: ReactNode;
  /** Buttons at the right end of the header. */
  actions?: ReactNode;
  full?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-line bg-canvas/95 px-6">
        <h1 className="shrink-0 font-display text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {status ? (
          <>
            <span aria-hidden className="h-4 w-px shrink-0 bg-line-strong" />
            <div className="flex min-w-0 items-center gap-2 truncate text-sm text-dim">{status}</div>
          </>
        ) : null}
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <main className={cn("relative min-h-0 flex-1", full ? "overflow-hidden" : "overflow-y-auto [scrollbar-gutter:stable]", className)}>
        {full ? children : <div className="mx-auto w-full max-w-[1680px] px-6 pb-10 pt-6">{children}</div>}
      </main>
    </div>
  );
}
