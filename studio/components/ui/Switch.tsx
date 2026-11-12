"use client";

// <Switch checked={on} onChange={setOn} label="Visa kortspår" hint="Ritas över filmen" />: an on/off choice.
// A button with role="switch"; without label give aria-label. The label sits to the right of the switch.
import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  const id = useId();
  const sm = size === "sm";
  return (
    <div className={cn("inline-flex items-start gap-2.5", disabled && "opacity-45", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-px inline-flex shrink-0 items-center rounded-full border transition-[background-color,border-color] duration-150 disabled:cursor-not-allowed",
          sm ? "h-4 w-7" : "h-[18px] w-8",
          checked ? "border-brass bg-brass" : "border-line-strong bg-overlay enabled:hover:border-[#3a4840]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.5)] transition-[transform,background-color] duration-150 ease-out",
            sm ? "left-[2px] size-2.5" : "left-[2px] size-3",
            checked ? cn("bg-brass-ink", sm ? "translate-x-3" : "translate-x-[14px]") : "bg-dim",
          )}
        />
      </button>
      {label || hint ? (
        <span className="flex min-w-0 flex-col">
          {label ? (
            <label htmlFor={id} className={cn("leading-[18px] text-ink", sm ? "text-xs" : "text-sm", disabled && "cursor-not-allowed")}>
              {label}
            </label>
          ) : null}
          {hint ? (
            <span id={`${id}-hint`} className="text-xs text-faint">
              {hint}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
