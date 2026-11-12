"use client";

// <IconButton label="Stäng" icon={<X />} variant="quiet" size="md" />: a square button with only an icon.
// label is required: it is the button's name for screen readers and its tooltip (tooltip={false} leaves the tooltip out).
import { forwardRef, type ReactNode } from "react";
import { BUTTON_BASE, BUTTON_VARIANT, type ButtonProps } from "./Button";
import { cn } from "./cn";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

const SQUARE = {
  sm: "size-7 rounded-sm [&_svg]:size-3.5",
  md: "size-8 rounded-md [&_svg]:size-4",
  lg: "size-10 rounded-md [&_svg]:size-[18px]",
};

export type IconButtonProps = Omit<ButtonProps, "children" | "iconAfter" | "icon"> & {
  label: string;
  icon: ReactNode;
  tooltip?: boolean;
  /** A key that does the same, shown in the tooltip. */
  kbd?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "quiet", size = "md", loading = false, tooltip = true, kbd, className, type = "button", ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-busy={loading || undefined}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], SQUARE[size], loading && "pointer-events-none", className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="Arbetar" /> : icon}
    </button>
  );
  return tooltip ? (
    <Tooltip content={label} kbd={kbd}>
      {button}
    </Tooltip>
  ) : (
    button
  );
});
