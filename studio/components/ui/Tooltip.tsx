"use client";

// <Tooltip content="Spela i scenen" side="top" kbd="Mellanslag"><button…/></Tooltip>: a short label on hover and focus.
// Radix Tooltip (positioning at window edges, delay, keyboard, screen readers); the shell holds the one TooltipProvider.
import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "./cn";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={350} skipDelayDuration={200}>
    {children}
  </RT.Provider>
);

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  kbd,
  disabled = false,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** A key that does the same, shown after the text. */
  kbd?: string;
  disabled?: boolean;
}) {
  if (disabled || content === null || content === undefined || content === "") return <>{children}</>;
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "z-50 flex max-w-72 items-center gap-2 rounded-sm border border-line-strong bg-overlay px-2.5 py-1.5 text-xs text-ink shadow-pop",
            "data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-fade-out",
          )}
        >
          <span>{content}</span>
          {kbd ? (
            <kbd className="rounded-xs border border-line-strong bg-raised px-1 font-sans text-2xs text-dim">{kbd}</kbd>
          ) : null}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
