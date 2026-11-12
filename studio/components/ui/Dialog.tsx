"use client";

// <Dialog open={o} onOpenChange={setO} title="Återställ?" description="…" footer={<Button …/>}>…</Dialog>: a centred modal.
// <Sheet open={o} onOpenChange={setO} title="A2.1 → P4C1" subtitle="5 tagningar" width={460}>…</Sheet>: a panel over the right edge.
// Radix Dialog (focus, Esc, screen readers, exit animation). A sheet is not modal by default: the page beside it stays usable,
// clicking outside does not close it, Esc and ✕ do. modal gives it a dimmed backdrop that closes it on click.
import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { IconButton } from "./IconButton";

type Common = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
  /** Buttons at the bottom, right-aligned. */
  footer?: ReactNode;
  className?: string;
};

export function Dialog({ open, onOpenChange, title, description, children, footer, className, width = 440 }: Common & { description?: ReactNode; width?: number }) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <RD.Content
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-64px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line-strong bg-surface shadow-pop",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-fade-out focus:outline-none",
            className,
          )}
        >
          <div className="flex items-start gap-4 px-5 pb-2 pt-5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RD.Title className="font-display text-lg font-semibold text-ink">{title}</RD.Title>
              {description ? <RD.Description className="text-sm text-dim">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
            </div>
            <RD.Close asChild>
              <IconButton label="Stäng" icon={<X />} size="sm" tooltip={false} className="-mr-1.5 -mt-1" />
            </RD.Close>
          </div>
          {children ? <div className="min-h-0 overflow-y-auto px-5 py-3 text-sm text-ink">{children}</div> : null}
          {footer ? <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-3">{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  actions,
  children,
  footer,
  className,
  width = 460,
  modal = false,
}: Common & {
  subtitle?: ReactNode;
  /** Small buttons beside the close button. */
  actions?: ReactNode;
  width?: number;
  modal?: boolean;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <RD.Portal>
        {modal ? <RD.Overlay className="fixed inset-0 z-40 bg-black/45 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" /> : null}
        <RD.Content
          style={{ width: `min(${width}px, calc(100vw - 96px))` }}
          onInteractOutside={modal ? undefined : (event) => event.preventDefault()}
          className={cn(
            "fixed inset-y-0 right-0 z-40 flex flex-col border-l border-line-strong bg-surface shadow-sheet",
            "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out focus:outline-none",
            className,
          )}
        >
          <div className="flex min-h-14 items-center gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <RD.Title className="truncate font-display text-md font-semibold text-ink">{title}</RD.Title>
              {subtitle ? <RD.Description className="truncate text-xs text-dim">{subtitle}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
            </div>
            {actions}
            <RD.Close asChild>
              <IconButton label="Stäng" kbd="Esc" icon={<X />} size="md" className="-mr-1.5" />
            </RD.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
