// <ScrollArea className="h-full">…</ScrollArea>: a box that scrolls on its own with the studio's thin scrollbar.
// axis="y|x|both"; the gutter is kept so content does not jump when a scrollbar appears.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function ScrollArea({ axis = "y", className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { axis?: "y" | "x" | "both" }) {
  return (
    <div
      className={cn(
        "min-h-0 min-w-0 [scrollbar-gutter:stable]",
        axis === "y" ? "overflow-y-auto overflow-x-hidden" : axis === "x" ? "overflow-x-auto overflow-y-hidden" : "overflow-auto",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
