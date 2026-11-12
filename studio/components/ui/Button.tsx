// <Button variant="primary|secondary|quiet|danger" size="sm|md|lg" icon={<Play />} loading>Spela</Button>
// A native button (type="button" unless given); aria-pressed draws the chosen state. Brass primary is for the one main
// action of a view. buttonClasses({variant, size}) gives a link (next/link or <a>) the same look.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export const BUTTON_BASE =
  "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out " +
  "disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:shrink-0";

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brass text-brass-ink font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] not-disabled:hover:bg-brass-hi not-disabled:active:bg-brass-lo",
  secondary:
    "border border-line-strong bg-raised text-ink shadow-inset not-disabled:hover:border-[#3a4840] not-disabled:hover:bg-overlay not-disabled:active:bg-[#26312b] " +
    "aria-pressed:border-brass/50 aria-pressed:bg-brass/12 aria-pressed:text-brass-hi",
  quiet:
    "text-dim not-disabled:hover:bg-raised not-disabled:hover:text-ink not-disabled:active:bg-overlay aria-pressed:bg-overlay aria-pressed:text-ink",
  danger:
    "border border-underkand/35 bg-underkand/8 text-[#ef8b8b] not-disabled:hover:border-underkand/60 not-disabled:hover:bg-underkand/16 not-disabled:active:bg-underkand/22",
};

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-sm px-2.5 text-sm [&_svg]:size-3.5",
  md: "h-8 gap-2 rounded-md px-3 text-sm [&_svg]:size-4",
  lg: "h-10 gap-2 rounded-md px-4 text-base [&_svg]:size-[18px]",
};

/** The classes of a button, for a link that should look like one: <Link className={buttonClasses({variant: "quiet"})}>. */
export const buttonClasses = ({ variant = "secondary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) =>
  cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the text (lucide-react or inline SVG); replaced by a spinner while loading. */
  icon?: ReactNode;
  /** An icon after the text. */
  iconAfter?: ReactNode;
  /** Busy: shows a spinner, keeps the width, and does not take clicks. */
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconAfter, loading = false, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], loading && "pointer-events-none", className)}
      {...rest}
    >
      {loading ? <Spinner size={size === "lg" ? "md" : "sm"} label="Arbetar" /> : icon}
      {children}
      {iconAfter}
    </button>
  );
});
